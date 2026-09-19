// Takes payments and turns them into licences.
//
// This has to be a server, and it cannot be Firebase. Cloud Functions need
// the Blaze plan -- a card on file -- and this project is deliberately on
// Spark. More to the point, a payment webhook is the one place that must
// write `/licences/{workspaceId}`, which every client is forbidden from
// writing, so it needs a service-account key. A key shipped inside an Android
// app is a key published to everyone who downloads it.
//
// So: a small Node process anywhere that can hold a secret. A RM 20/month
// VPS, Cloudflare Workers, Railway, Render -- it does not matter, it handles
// a few requests a day.
//
//   npm install
//   cp .env.example .env     and fill it in
//   node server.mjs
//
// Then point Stripe at https://your-host/webhook/stripe and ToyyibPay's
// callback at https://your-host/webhook/toyyibpay.

import { existsSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import express from 'express';
import Stripe from 'stripe';
import { grant, expire, get, findByCode, write } from './licences.mjs';
import { PLANS, TERMS, priceSen, ringgit, CURRENCY } from './plans.mjs';

const {
  PORT = 8787,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  TOYYIBPAY_SECRET_KEY,
  TOYYIBPAY_CATEGORY_CODE,
  PUBLIC_URL = `http://localhost:${PORT}`,
  GOOGLE_PLAY_PACKAGE,
  BANK_NAME = '',
  BANK_ACCOUNT = '',
  BANK_HOLDER = '',
  SUPPORT_EMAIL = '',
  ADMIN_TOKEN = '',
} = process.env;

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const app = express();

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Compares without leaking the answer in how long it took.
 *
 * Overkill for one admin route, and it costs a line. A string compare that
 * returns early is how a token gets guessed a character at a time.
 */
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

const log = (...args) => console.log(new Date().toISOString(), ...args);

/**
 * Turns whatever the caller quoted into a workspace id.
 *
 * A customer knows their join code. Nobody types a workspace id into a
 * payment form correctly.
 */
async function resolveWorkspace(codeOrId) {
  if (!codeOrId) return null;
  const byCode = await findByCode(codeOrId);
  return byCode?.workspaceId ?? codeOrId;
}

function validPlanTerm(plan, term) {
  return Boolean(PLANS[plan]) && Boolean(TERMS[term]) && plan !== 'TRIAL';
}

// --------------------------------------------------------------- Stripe in
//
// The signature is computed over the exact bytes Stripe sent. Any body parser
// that has already turned them into an object has destroyed the evidence, so
// this route takes the raw buffer and is registered BEFORE express.json().

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(503).send('Stripe not configured');

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    // Anyone on the internet can POST here. Without this check they could
    // grant themselves a lifetime licence with a curl command.
    log('stripe signature rejected:', error.message);
    return res.status(400).send(`Signature check failed: ${error.message}`);
  }

  try {
    await handleStripeEvent(event);
  } catch (error) {
    log('stripe handler failed:', event.type, error.message);
    // A 500 makes Stripe retry, which is what should happen when Firestore
    // was briefly unreachable. Returning 200 here would lose the payment.
    return res.status(500).send(error.message);
  }
  res.json({ received: true });
});

async function handleStripeEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { workspaceId, plan, term } = session.metadata ?? {};
      if (!workspaceId || !validPlanTerm(plan, term)) {
        log('checkout completed with unusable metadata', session.id, session.metadata);
        return;
      }
      const licence = await grant(workspaceId, plan, term, {
        contactEmail: session.customer_details?.email ?? undefined,
        stripe: { customerId: session.customer ?? '', subscriptionId: session.subscription ?? '' },
        note: `Stripe ${session.id}`,
      });
      log(`granted ${plan} ${term} to ${workspaceId} (${ringgit(priceSen(plan, term))})`, licence.expiresAt);
      return;
    }

    case 'invoice.paid': {
      // A renewal. The subscription id is the only link back, because the
      // metadata lives on the checkout session, not on later invoices.
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;
      if (!subscriptionId) return;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const { workspaceId, plan, term } = subscription.metadata ?? {};
      if (!workspaceId || !validPlanTerm(plan, term)) {
        log('invoice.paid for a subscription with no usable metadata', subscriptionId);
        return;
      }
      // grant() extends from the later of today and the current expiry, so a
      // renewal that arrives early keeps the days already paid for.
      await grant(workspaceId, plan, term, {
        stripe: { customerId: invoice.customer ?? '', subscriptionId },
        note: `Stripe renewal ${invoice.id}`,
      });
      log(`renewed ${plan} ${term} for ${workspaceId}`);
      return;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const { workspaceId } = subscription.metadata ?? {};
      if (!workspaceId) return;
      await expire(workspaceId, `Stripe subscription ended ${subscription.id}`);
      log(`expired ${workspaceId}`);
      return;
    }

    default:
      log('ignored', event.type);
  }
}

// ------------------------------------------------------------ ToyyibPay in
//
// Local companies pay by bank transfer, not card. ToyyibPay fronts FPX and
// costs about RM 1 a transaction, against Stripe's percentage. It posts a
// form, not JSON, and it has no signature scheme -- so nothing it says is
// believed until the bill is read back from ToyyibPay's own API.

app.post('/webhook/toyyibpay', express.urlencoded({ extended: false }), async (req, res) => {
  // Answer immediately: ToyyibPay retries anything slow, and a duplicate
  // grant is harmless but a duplicate charge conversation is not.
  res.send('OK');

  const { billcode, order_id: orderId, status_id: statusId } = req.body ?? {};
  log('toyyibpay callback', billcode, orderId, statusId);
  if (!billcode) return;

  try {
    const confirmed = await toyyibpayVerify(billcode);
    if (!confirmed) return log('toyyibpay bill not paid on verification', billcode);

    // order_id carries what was bought: "WORKSPACE|PLAN|TERM".
    const [workspaceId, plan, term] = String(orderId ?? '').split('|');
    if (!workspaceId || !validPlanTerm(plan, term)) {
      return log('toyyibpay order_id unusable', orderId);
    }
    await grant(workspaceId, plan, term, { note: `ToyyibPay ${billcode}` });
    log(`granted ${plan} ${term} to ${workspaceId} via ToyyibPay`);
  } catch (error) {
    log('toyyibpay handling failed', error.message);
  }
});

/** Asks ToyyibPay directly whether the bill was actually paid. */
async function toyyibpayVerify(billCode) {
  const response = await fetch('https://toyyibpay.com/index.php/api/getBillTransactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ billCode }),
  });
  if (!response.ok) return false;
  const rows = await response.json();
  // billpaymentStatus 1 = success.
  return Array.isArray(rows) && rows.some((row) => String(row.billpaymentStatus) === '1');
}

// ------------------------------------------------------- everything else

app.use(express.json());

/**
 * Starts a payment.
 *
 * Called from wherever the price list lives -- a web page, an email link.
 * Deliberately not from the app: an app that could start a checkout would
 * need these keys.
 */
/**
 * Which Stripe payment methods a one-off payment may use.
 *
 * Only a card can be charged again next month, so a recurring term never gets
 * a choice: FPX and the wallets settle once and do not come back. Leaving the
 * list unset lets Stripe offer whatever is switched on in the dashboard, which
 * is where Google Pay and Apple Pay come from -- they are cards wearing a
 * different button, not integrations to write.
 */
function stripeMethods(method) {
  switch (method) {
    case 'fpx': return { payment_method_types: ['fpx'] };
    case 'grabpay': return { payment_method_types: ['grabpay'] };
    case 'card': return { payment_method_types: ['card'] };
    default: return {};
  }
}

app.post('/checkout', async (req, res) => {
  const { company, plan, term, email, method } = req.body ?? {};
  if (!validPlanTerm(plan, term)) {
    return res.status(400).json({ error: `plan must be one of ${Object.keys(PLANS).filter((p) => p !== 'TRIAL')}, term one of ${Object.keys(TERMS)}` });
  }
  const workspaceId = await resolveWorkspace(company);
  if (!workspaceId) return res.status(400).json({ error: 'Unknown company code' });
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const sen = priceSen(plan, term);
  const recurring = TERMS[term].recurring;

  const session = await stripe.checkout.sessions.create({
    mode: recurring ? 'subscription' : 'payment',
    ...(recurring ? {} : stripeMethods(method)),
    customer_email: email || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: sen,
          product_data: {
            name: `StockCheck ${PLANS[plan].label} — ${TERMS[term].label}`,
            description:
              PLANS[plan].seats >= 1_000_000_000
                ? 'Unlimited accounts'
                : `Up to ${PLANS[plan].seats} accounts`,
          },
          ...(recurring
            ? { recurring: { interval: term === 'yearly' ? 'year' : 'month' } }
            : {}),
        },
      },
    ],
    // Carried on both, because a renewal invoice can only see the
    // subscription's copy.
    metadata: { workspaceId, plan, term },
    ...(recurring ? { subscription_data: { metadata: { workspaceId, plan, term } } } : {}),
    success_url: `${PUBLIC_URL}/paid?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${PUBLIC_URL}/cancelled`,
  });

  res.json({ url: session.url, amount: ringgit(sen) });
});

/**
 * A Google Play purchase, offered by a phone and believed by nobody yet.
 *
 * The app posts the token it was handed; this asks Google whether that token
 * is real, is for this app, and is currently in good standing. Only then does
 * a licence get written. The phone never touches /licences — that is what
 * stops a modified client from granting itself a plan, and it is the reason
 * this endpoint exists at all rather than the app writing the grant itself.
 *
 * Acknowledgement is done here too. Google voids an unacknowledged purchase
 * after three days, which is the right way round: a purchase this server
 * cannot verify should end in a refund, not in a licence nobody granted.
 *
 * Needs a service account with the Android Publisher scope, granted access in
 * Play Console under Users and permissions. GOOGLE_PLAY_PACKAGE must be the
 * app's applicationId.
 */
/** The Play Developer API, authorised by the same service account as Firestore. */
async function playPublisher() {
  const { google } = await import('googleapis');
  const scopes = ['https://www.googleapis.com/auth/androidpublisher'];
  // Same two ways in as the database, and for the same reason. A relative
  // './service-account.json' also resolved against the working directory
  // rather than this file, so it broke whenever the server was started from
  // anywhere but platform/.
  const keyFile = process.env.SERVICE_ACCOUNT_PATH || join(here, 'service-account.json');
  const auth = existsSync(keyFile)
    ? new google.auth.GoogleAuth({ keyFile, scopes })
    : new google.auth.GoogleAuth({ scopes });
  return google.androidpublisher({ version: 'v3', auth });
}

app.post('/play/verify', express.json(), async (req, res) => {
  const { workspaceId, productId, purchaseToken } = req.body ?? {};
  if (!workspaceId || !productId || !purchaseToken) {
    return res.status(400).json({ error: 'workspaceId, productId and purchaseToken are required' });
  }
  if (!GOOGLE_PLAY_PACKAGE) {
    return res.status(503).json({ error: 'GOOGLE_PLAY_PACKAGE is not configured' });
  }

  // starter_monthly -> STARTER, monthly. The app builds these ids the same
  // way; a product in Play Console named anything else will not resolve, and
  // failing here is better than granting the wrong plan.
  const underscore = productId.lastIndexOf('_');
  const plan = productId.slice(0, underscore).toUpperCase();
  const term = productId.slice(underscore + 1);
  if (!PLANS[plan] || plan === 'TRIAL' || !TERMS[term]) {
    return res.status(400).json({ error: `unrecognised product ${productId}` });
  }

  // Play sells the recurring terms as subscriptions and lifetime as a
  // one-time product, and they are different APIs. Asking the wrong one
  // about a token returns nothing rather than an error, so the plan with the
  // largest price would fail silently.
  const oneTime = term === 'lifetime';
  let purchase;
  try {
    const publisher = await playPublisher();
    const response = oneTime
      ? await publisher.purchases.products.get({
          packageName: GOOGLE_PLAY_PACKAGE,
          productId,
          token: purchaseToken,
        })
      : await publisher.purchases.subscriptions.get({
          packageName: GOOGLE_PLAY_PACKAGE,
          subscriptionId: productId,
          token: purchaseToken,
        });
    purchase = response.data;
  } catch (error) {
    log('play verify failed', productId, error?.message ?? error);
    return res.status(502).json({ error: 'Could not verify with Google Play' });
  }

  let expiry;
  if (oneTime) {
    // purchaseState 0 is purchased; 1 cancelled, 2 pending. Zero expiry is
    // what a lifetime licence is -- see the Licence model.
    if (purchase.purchaseState !== 0) {
      return res.status(409).json({ error: 'That purchase is not currently in good standing' });
    }
    expiry = 0;
  } else {
    // 1 is "payment received". 0 is a free trial Google is running, which is
    // still a live entitlement. Anything else — pending, on hold, cancelled —
    // is not somebody who has paid.
    const paid = purchase.paymentState === 1 || purchase.paymentState === 0;
    expiry = Number(purchase.expiryTimeMillis ?? 0);
    if (!paid || expiry <= Date.now()) {
      return res.status(409).json({ error: 'That purchase is not currently in good standing' });
    }
  }

  // Who Google says bought it beats who the caller says to licence.
  //
  // Everything else here exists so that a phone cannot grant itself a
  // licence, and then the workspace to licence arrived in the request body,
  // where a phone could put anything. A real token belonging to one company
  // could have been replayed with another company's id in the JSON, and this
  // would have licensed the second one. setObfuscatedAccountId stamps the
  // buyer at the moment of sale and Google hands it back here, so the claim
  // can simply be checked rather than trusted.
  //
  // A purchase with no stamp is one made by a build from before that call
  // existed; those are let through, because refusing them would strand a
  // customer who has genuinely paid.
  const stamped = purchase.obfuscatedExternalAccountId;
  if (stamped && stamped !== workspaceId) {
    log('play verify rejected', productId, 'claimed', workspaceId, 'stamped', stamped);
    return res.status(409).json({ error: 'That purchase belongs to a different company' });
  }

  // Google's own expiry, not a term calculated here. Google is what will
  // renew or stop renewing it, so anything computed locally would drift the
  // first time somebody changes plan or their card fails.
  await write(
    workspaceId,
    {
      plan,
      status: 'ACTIVE',
      seats: PLANS[plan].seats,
      expiresAt: expiry,
      playPurchaseToken: purchaseToken,
      playProductId: productId,
    },
    `google play ${productId}`,
  );

  if (!purchase.acknowledgementState) {
    try {
      const publisher = await playPublisher();
      await (oneTime
        ? publisher.purchases.products.acknowledge({
            packageName: GOOGLE_PLAY_PACKAGE,
            productId,
            token: purchaseToken,
            requestBody: {},
          })
        : publisher.purchases.subscriptions.acknowledge({
            packageName: GOOGLE_PLAY_PACKAGE,
            subscriptionId: productId,
            token: purchaseToken,
            requestBody: {},
          }));
    } catch (error) {
      // The licence is already written, so the customer has what they paid
      // for. Worth shouting about, not worth failing the request over.
      log('play acknowledge failed', productId, error?.message ?? error);
    }
  }

  // A lifetime licence stores expiry 0, which as a date reads as 1970.
  log('play granted', workspaceId, plan, term, expiry ? new Date(expiry).toISOString() : 'no expiry');
  res.json({ ok: true, plan, expiresAt: expiry });
});

/**
 * Starts a ToyyibPay bill.
 *
 * The webhook that grants the licence has been here all along; nothing ever
 * created a bill for it to be called about. order_id carries what was bought
 * in the shape the callback already expects.
 *
 * ToyyibPay settles through FPX and the wallets it has signed up. Which
 * wallets those are is a question for ToyyibPay and changes; this code does
 * not claim any particular one.
 */
app.post('/toyyibpay/create', express.json(), async (req, res) => {
  const { company, plan, term, email, name } = req.body ?? {};
  if (!validPlanTerm(plan, term)) return res.status(400).json({ error: 'unknown plan or term' });
  if (!TOYYIBPAY_SECRET_KEY || !TOYYIBPAY_CATEGORY_CODE) {
    return res.status(503).json({ error: 'ToyyibPay not configured' });
  }
  if (TERMS[term].recurring) {
    // FPX and the wallets settle once and do not come back next month. A
    // "subscription" paid this way would quietly lapse, which is a worse
    // outcome than refusing it here.
    return res.status(400).json({ error: 'ToyyibPay can only take a one-off payment' });
  }

  const workspaceId = await resolveWorkspace(company);
  if (!workspaceId) return res.status(400).json({ error: 'Unknown company code' });

  const form = new URLSearchParams({
    userSecretKey: TOYYIBPAY_SECRET_KEY,
    categoryCode: TOYYIBPAY_CATEGORY_CODE,
    billName: `StockCheck ${PLANS[plan].label}`,
    billDescription: `${PLANS[plan].label} — ${TERMS[term].label}`,
    billPriceSetting: '1',
    billPayorInfo: '1',
    billAmount: String(priceSen(plan, term)),
    billReturnUrl: `${PUBLIC_URL}/paid`,
    billCallbackUrl: `${PUBLIC_URL}/webhook/toyyibpay`,
    // What the callback reads back to know what to grant.
    billExternalReferenceNo: `${workspaceId}|${plan}|${term}`,
    billTo: name || company,
    billEmail: email || '',
    billPhone: '',
  });

  try {
    const response = await fetch('https://toyyibpay.com/index.php/api/createBill', {
      method: 'POST',
      body: form,
    });
    const created = await response.json();
    const code = Array.isArray(created) ? created[0]?.BillCode : null;
    if (!code) return res.status(502).json({ error: 'ToyyibPay did not return a bill' });
    res.json({ url: `https://toyyibpay.com/${code}` });
  } catch (error) {
    log('toyyibpay create failed', error.message);
    res.status(502).json({ error: 'Could not reach ToyyibPay' });
  }
});

/**
 * The page somebody is sent to when the app will not let them start a count.
 *
 * Every way of paying lives here rather than in the app, which is what keeps
 * the app free of card fields, payment state and a second thing to get past
 * review. It also means adding a gateway is a change to one page, not a
 * release.
 *
 * What a method can actually do decides where it appears. A card can be
 * charged again next month; FPX and the wallets settle once and never come
 * back, so they are offered only against the one-off terms. Offering them
 * against a subscription would sell somebody a plan that quietly lapses.
 */
app.get('/buy', async (req, res) => {
  const company = String(req.query.company ?? '').trim().toUpperCase();
  const known = company ? await resolveWorkspace(company) : null;

  const esc = (value) =>
    String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const paid = Object.keys(PLANS).filter((p) => p !== 'TRIAL');
  const rows = [];

  for (const plan of paid) {
    const cells = [];
    for (const term of Object.keys(TERMS)) {
      const sen = priceSen(plan, term);
      if (!sen) continue;
      const recurring = TERMS[term].recurring;
      const buttons = [
        `<button data-plan="${plan}" data-term="${term}" data-route="checkout" data-method="card">Card / Google Pay</button>`,
      ];
      if (!recurring) {
        buttons.push(
          `<button data-plan="${plan}" data-term="${term}" data-route="checkout" data-method="fpx">Online banking (FPX)</button>`,
          `<button data-plan="${plan}" data-term="${term}" data-route="checkout" data-method="grabpay">GrabPay</button>`,
          `<button data-plan="${plan}" data-term="${term}" data-route="toyyibpay">ToyyibPay (FPX &amp; wallets)</button>`,
        );
      }
      cells.push(
        `<div class="term"><h3>${TERMS[term].label} — ${ringgit(sen)}</h3>` +
        (recurring ? '<p class="note">Renews automatically. Card only.</p>' : '') +
        `<div class="buttons">${buttons.join('')}</div></div>`,
      );
    }
    rows.push(
      `<section class="plan"><h2>${PLANS[plan].label}</h2>` +
      `<p class="seats">${PLANS[plan].seats >= 1e9 ? 'Unlimited accounts' : `Up to ${PLANS[plan].seats} accounts`}</p>` +
      cells.join('') + '</section>',
    );
  }

  const bank = BANK_NAME
    ? `<section class="bank"><h2>Bank transfer</h2>
       <p>Transfer the amount, then send the slip to ${esc(SUPPORT_EMAIL)} quoting <b>${esc(company || 'your company code')}</b>. The licence is activated by hand, usually the same working day.</p>
       <dl><dt>Bank</dt><dd>${esc(BANK_NAME)}</dd>
       <dt>Account</dt><dd>${esc(BANK_ACCOUNT)}</dd>
       <dt>Name</dt><dd>${esc(BANK_HOLDER)}</dd></dl></section>`
    : '';

  res.type('html').send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stock Check — licence</title>
<style>
 :root { color-scheme: light dark; }
 body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.6;
        max-width: 42rem; margin: 0 auto; padding: 24px 18px 64px; }
 h1 { font-size: 1.6rem; margin: 0 0 4px; }
 .code { font-family: ui-monospace, Menlo, monospace; }
 .plan { border: 1px solid #8884; border-radius: 8px; padding: 16px; margin: 18px 0; }
 .plan h2 { margin: 0; font-size: 1.15rem; }
 .seats { margin: 2px 0 12px; opacity: .7; font-size: .9rem; }
 .term { border-top: 1px solid #8883; padding-top: 12px; margin-top: 12px; }
 .term h3 { margin: 0 0 6px; font-size: 1rem; font-weight: 600; }
 .note { margin: 0 0 8px; font-size: .85rem; opacity: .7; }
 .buttons { display: flex; flex-wrap: wrap; gap: 8px; }
 button { font: inherit; padding: 9px 14px; border-radius: 6px; cursor: pointer;
          border: 1px solid #8886; background: #0f5132; color: #fff; }
 button:hover { opacity: .9; }
 .bank dl { display: grid; grid-template-columns: 7rem 1fr; gap: 4px 12px; margin: 10px 0 0; }
 .bank dt { opacity: .7; }
 .warn { background: #a6271d22; border: 1px solid #a6271d66; border-radius: 6px; padding: 12px; }
 #status { margin-top: 16px; min-height: 1.4em; }
</style></head><body>
<h1>Stock Check</h1>
<p>Company code: <b class="code">${esc(company || 'not given')}</b></p>
${known ? '' : '<p class="warn">That company code was not recognised. Check it on the Profile tab in the app before paying.</p>'}
${rows.join('')}
${bank}
<p id="status"></p>
<script>
document.querySelectorAll('button[data-plan]').forEach(function (b) {
  b.addEventListener('click', async function () {
    var status = document.getElementById('status');
    status.textContent = 'Opening payment…';
    b.disabled = true;
    try {
      var route = b.dataset.route === 'toyyibpay' ? '/toyyibpay/create' : '/checkout';
      var res = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: ${JSON.stringify(company)},
          plan: b.dataset.plan,
          term: b.dataset.term,
          method: b.dataset.method,
        }),
      });
      var data = await res.json();
      if (data.url) { window.location = data.url; return; }
      status.textContent = data.error || 'That payment could not be started.';
    } catch (e) {
      status.textContent = 'Could not reach the server.';
    }
    b.disabled = false;
  });
});
</script>
</body></html>`);
});

app.get('/paid', (_req, res) =>
  res.type('html').send(
    '<h1>Payment received</h1><p>Open StockCheck and pull down to refresh. ' +
      'Your plan updates within a few seconds.</p>',
  ),
);
app.get('/cancelled', (_req, res) => res.type('html').send('<h1>Payment cancelled</h1><p>Nothing was charged.</p>'));

app.get('/health', async (_req, res) => {
  res.json({
    ok: true,
    stripe: Boolean(stripe),
    stripeWebhook: Boolean(STRIPE_WEBHOOK_SECRET),
    toyyibpay: Boolean(TOYYIBPAY_SECRET_KEY && TOYYIBPAY_CATEGORY_CODE),
  });
});

/**
 * Read-only, for checking a customer's claim without opening a terminal.
 *
 * Behind a token because this server answers on a public address and the
 * lookup key is a join code -- a short, quotable, guessable string. Without
 * one, anybody could walk the codes and collect every customer's company
 * name, contact email and what they pay. Unset ADMIN_TOKEN turns the route
 * off rather than leaving it open, because the failure that matters here is
 * forgetting to set it.
 */
app.get('/licence/:company', async (req, res) => {
  if (!ADMIN_TOKEN) return res.status(503).json({ error: 'ADMIN_TOKEN is not configured' });
  const offered = req.get('x-admin-token') ?? '';
  if (!safeEqual(offered, ADMIN_TOKEN)) return res.status(401).json({ error: 'Unauthorised' });

  const workspaceId = await resolveWorkspace(req.params.company);
  const licence = workspaceId ? await get(workspaceId) : null;
  if (!licence) return res.status(404).json({ error: 'No licence' });
  res.json(licence);
});

app.listen(PORT, () => {
  log(`StockCheck payments on :${PORT}`);
  if (!stripe) log('WARNING: STRIPE_SECRET_KEY not set — /checkout and the Stripe webhook are off');
  if (!STRIPE_WEBHOOK_SECRET) log('WARNING: STRIPE_WEBHOOK_SECRET not set — webhook will refuse everything');
});
