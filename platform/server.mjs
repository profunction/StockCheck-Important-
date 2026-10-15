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
import { grant, expire, get, findByCode, write, firestoreStore, lifetimeLeft } from './licences.mjs';
import { PLANS, TERMS, priceSen, ringgit, CURRENCY } from './plans.mjs';
import { BillingError, handleStripeWebhook, handleToyyibPayWebhook, readToyyibBill, validPlanTerm } from './billing.mjs';
import { renderBuyPage, simplePage } from './buyPage.mjs';

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

const store = firestoreStore();

// --------------------------------------------------------------- Stripe in
//
// The signature is computed over the exact bytes Stripe sent. Any body parser
// that has already turned them into an object has destroyed the evidence, so
// this route takes the raw buffer and is registered BEFORE express.json().

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!STRIPE_WEBHOOK_SECRET) return res.status(503).send('Stripe not configured');
  try {
    // Verified inside: anyone on the internet can POST here, and without the
    // signature check they could grant themselves a lifetime licence.
    const result = await handleStripeWebhook({ rawBody: req.body, signature: req.headers['stripe-signature'] }, {
      secret: STRIPE_WEBHOOK_SECRET,
      store,
      retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
      expire,
    });
    log('stripe', result.status, result.reason || '', result.licence?.plan || '');
    res.json({ received: true, status: result.status });
  } catch (error) {
    if (error instanceof BillingError && error.code === 'BAD_SIGNATURE') {
      log('stripe signature rejected:', error.message);
      return res.status(400).send(`Signature check failed: ${error.message}`);
    }
    log('stripe handler failed:', error.message);
    // A 500 makes Stripe retry, which is what should happen when Firestore
    // was briefly unreachable; the payment is claimed once, so a retry
    // after a success is harmless.
    res.status(500).send(error.message);
  }
});

// ------------------------------------------------------------ ToyyibPay in
//
// Local companies pay by bank transfer, not card. ToyyibPay fronts FPX and
// costs about RM 1 a transaction, against Stripe's percentage. It posts a
// form, not JSON, and it has no signature scheme -- so nothing it says is
// believed until the bill is read back from ToyyibPay's own API, paid in
// full. Each bill counts once, however often ToyyibPay calls.

app.post('/webhook/toyyibpay', express.urlencoded({ extended: false }), async (req, res) => {
  // Answer immediately: ToyyibPay retries anything slow.
  res.send('OK');
  try {
    const result = await handleToyyibPayWebhook(req.body ?? {}, { store, verifyBill: toyyibpayBill });
    log('toyyibpay', req.body?.billcode, result.status, result.reason || '');
  } catch (error) {
    log('toyyibpay handling failed', error.message);
  }
});

/** Reads a bill back from ToyyibPay: { paid, amountSen, orderId }. */
async function toyyibpayBill(billCode) {
  const response = await fetch('https://toyyibpay.com/index.php/api/getBillTransactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ billCode }),
  });
  if (!response.ok) return { paid: false };
  return readToyyibBill(await response.json());
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
  if (term === 'lifetime' && (await lifetimeLeft()) <= 0) return res.status(409).json({ error: 'Lifetime licences are sold out' });

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
  if (!validPlanTerm(plan, term)) {
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
      tills: PLANS[plan].tills,
      modules: { ...PLANS[plan].modules },
      multiBranch: PLANS[plan].multiBranch,
      loyverse: PLANS[plan].loyverse,
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
  // FPX and the wallets settle once and do not come back next month, so a
  // monthly or yearly term bought here is prepaid: it runs its course and
  // the app counts down to it like any other, without renewing itself.

  const workspaceId = await resolveWorkspace(company);
  if (!workspaceId) return res.status(400).json({ error: 'Unknown company code' });
  if (term === 'lifetime' && (await lifetimeLeft()) <= 0) return res.status(409).json({ error: 'Lifetime licences are sold out' });

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
  const known = Boolean(company && await resolveWorkspace(company));
  const bank = BANK_NAME ? { name: BANK_NAME, account: BANK_ACCOUNT, holder: BANK_HOLDER, supportEmail: SUPPORT_EMAIL } : null;
  res.type('html').send(renderBuyPage({ company, known, bank }));
});

app.get('/paid', (_req, res) =>
  res.type('html').send(simplePage('付款成功', '打开 JSOX，下拉刷新一下。你的方案几秒内就会更新。')),
);
app.get('/cancelled', (_req, res) => res.type('html').send(simplePage('付款已取消', '没有扣到任何钱。')));

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
