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
} = process.env;

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const app = express();

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
app.post('/checkout', async (req, res) => {
  const { company, plan, term, email } = req.body ?? {};
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

  let subscription;
  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({
      keyFile: './service-account.json',
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const publisher = google.androidpublisher({ version: 'v3', auth });
    const response = await publisher.purchases.subscriptions.get({
      packageName: GOOGLE_PLAY_PACKAGE,
      subscriptionId: productId,
      token: purchaseToken,
    });
    subscription = response.data;
  } catch (error) {
    log('play verify failed', productId, error?.message ?? error);
    return res.status(502).json({ error: 'Could not verify with Google Play' });
  }

  // 1 is "payment received". 0 is a free trial Google is running, which is
  // still a live entitlement. Anything else — pending, on hold, cancelled —
  // is not somebody who has paid.
  const paid = subscription.paymentState === 1 || subscription.paymentState === 0;
  const expiry = Number(subscription.expiryTimeMillis ?? 0);
  if (!paid || expiry <= Date.now()) {
    return res.status(409).json({ error: 'That purchase is not currently in good standing' });
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

  if (!subscription.acknowledgementState) {
    try {
      const { google } = await import('googleapis');
      const auth = new google.auth.GoogleAuth({
        keyFile: './service-account.json',
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      });
      await google.androidpublisher({ version: 'v3', auth }).purchases.subscriptions.acknowledge({
        packageName: GOOGLE_PLAY_PACKAGE,
        subscriptionId: productId,
        token: purchaseToken,
        requestBody: {},
      });
    } catch (error) {
      // The licence is already written, so the customer has what they paid
      // for. Worth shouting about, not worth failing the request over.
      log('play acknowledge failed', productId, error?.message ?? error);
    }
  }

  log('play granted', workspaceId, plan, term, new Date(expiry).toISOString());
  res.json({ ok: true, plan, expiresAt: expiry });
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

/** Read-only, for checking a customer's claim without opening a terminal. */
app.get('/licence/:company', async (req, res) => {
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
