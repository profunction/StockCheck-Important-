// Payments in, licences out -- the decisions, kept apart from Express,
// Firestore and Stripe's SDK so every one of them is tested
// (billing.test.mjs). server.mjs wires them to the real things.
//
// Three rules this file exists to keep:
//
// 1. Nothing is believed until it is verified: a Stripe event by its
//    signature (HMAC-SHA256 over the exact bytes), a ToyyibPay callback by
//    reading the bill back from ToyyibPay and checking the amount paid.
// 2. A payment counts once. Stripe and ToyyibPay both retry, and Stripe
//    reports a new subscription's first payment twice (the checkout and its
//    first invoice); each payment id is claimed once, and a second claim is
//    a no-op instead of another month.
// 3. Lifetime licences are a numbered edition: LIFETIME_CAP in all.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { LIFETIME_CAP, LIFETIME_SUPPORT_MONTHS, PLANS, TERMS, addMonths, priceSen } from './plans.mjs';

export class BillingError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const validPlanTerm = (plan, term) => Boolean(PLANS[plan]) && Boolean(TERMS[term]) && plan !== 'TRIAL'
  && PLANS[plan][TERMS[term].field] != null;

/** What a plan switches on, as written onto the licence. */
export function planConfigFor(plan, term, extra = {}) {
  if (!validPlanTerm(plan, term)) throw new BillingError('BAD_PLAN', `Not for sale: ${plan} ${term}`);
  const p = PLANS[plan];
  return {
    plan, term,
    modules: { ...p.modules },
    seats: p.seats,
    tills: p.tills,
    multiBranch: p.multiBranch,
    loyverse: p.loyverse,
    ...extra,
  };
}

/**
 * The licence fields for a purchase. Extends from whichever is later, today
 * or the current expiry, so renewing early keeps the days already paid for.
 */
export function licenceFields(existing, planConfig, now = Date.now()) {
  const { plan, term } = planConfig;
  const lifetime = term === 'lifetime';
  const from = existing?.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
  // A lifetime licence already held stays lifetime; buying a month on top of
  // it changes nothing about the date.
  const keepsLifetime = existing?.expiresAt === 0 && existing?.plan && existing.plan !== 'TRIAL' && existing.status === 'ACTIVE';
  return {
    plan,
    status: 'ACTIVE',
    seats: planConfig.seats,
    tills: planConfig.tills,
    modules: planConfig.modules,
    multiBranch: planConfig.multiBranch,
    loyverse: planConfig.loyverse,
    term,
    startedAt: existing?.startedAt || now,
    expiresAt: lifetime || keepsLifetime ? 0 : addMonths(from, planConfig.months ?? TERMS[term].months),
    supportUntil: lifetime ? addMonths(now, LIFETIME_SUPPORT_MONTHS) : existing?.supportUntil || 0,
  };
}

/**
 * Puts [tenantId] on [planConfig] (see planConfigFor; plus paymentId, note,
 * contactEmail, stripe). [store] does the database work:
 *
 *   getLicence(id) -> licence | null
 *   claimPayment(paymentId, record) -> true the first time, false after
 *   claimLifetimeSlot(tenantId) -> slot number, or null when sold out
 *   writeLicence(id, fields)
 *
 * Returns { status: 'GRANTED' | 'DUPLICATE' | 'SOLD_OUT', licence? }.
 */
export async function updateTenantSubscription(tenantId, planConfig, store, now = Date.now()) {
  if (!tenantId) throw new BillingError('NO_TENANT', 'No company named');
  const config = planConfig.modules ? planConfig : { ...planConfigFor(planConfig.plan, planConfig.term), ...planConfig };
  if (config.paymentId) {
    const first = await store.claimPayment(config.paymentId, {
      tenantId, plan: config.plan, term: config.term, amountSen: config.amountSen ?? null, at: now,
    });
    if (!first) return { status: 'DUPLICATE' };
  }
  const existing = await store.getLicence(tenantId);
  const fields = licenceFields(existing, config, now);
  if (config.term === 'lifetime' && !(existing?.lifetimeSlot)) {
    const slot = await store.claimLifetimeSlot(tenantId);
    if (slot == null) {
      // Paid, but none left: record it for a refund rather than grant what
      // was promised to be limited. The payment stays claimed.
      await store.writeLicence(tenantId, { pendingRefund: { paymentId: config.paymentId ?? '', plan: config.plan, at: now } });
      return { status: 'SOLD_OUT' };
    }
    fields.lifetimeSlot = slot;
  }
  if (config.contactEmail) fields.contactEmail = config.contactEmail;
  if (config.stripe?.customerId) fields.stripeCustomerId = config.stripe.customerId;
  if (config.stripe?.subscriptionId) fields.stripeSubscriptionId = config.stripe.subscriptionId;
  fields.note = config.note ?? `${PLANS[config.plan].label} ${TERMS[config.term].label}`;
  fields.updatedAt = now;
  await store.writeLicence(tenantId, fields);
  return { status: 'GRANTED', licence: { ...(existing || {}), ...fields } };
}

// ------------------------------------------------------------------ Stripe

/**
 * Checks a Stripe-Signature header against the raw body, as Stripe's own
 * library does: t=<seconds>,v1=<hex HMAC-SHA256 of "t.body">, within
 * [toleranceSec] of now. Throws on anything wrong; returns the parsed event.
 */
export function verifyStripeSignature(rawBody, header, secret, { now = Date.now(), toleranceSec = 300 } = {}) {
  if (!secret) throw new BillingError('NOT_CONFIGURED', 'No Stripe webhook secret');
  const parts = Object.fromEntries(String(header || '').split(',').map((kv) => kv.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const all = String(header || '').split(',').map((kv) => kv.trim()).filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  const t = Number(parts.t);
  if (!t || !all.length) throw new BillingError('BAD_SIGNATURE', 'No timestamp or signature');
  if (Math.abs(now / 1000 - t) > toleranceSec) throw new BillingError('BAD_SIGNATURE', 'Signature too old');
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const expected = createHmac('sha256', secret).update(`${t}.`).update(body).digest();
  const ok = all.some((hex) => {
    const got = Buffer.from(hex, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!ok) throw new BillingError('BAD_SIGNATURE', 'Signature does not match');
  return JSON.parse(body.toString('utf8'));
}

/** Signs [body] as Stripe would; for tests and for replaying an event by hand. */
export function stripeSignature(body, secret, seconds = Math.floor(Date.now() / 1000)) {
  const sig = createHmac('sha256', secret).update(`${seconds}.${body}`).digest('hex');
  return `t=${seconds},v1=${sig}`;
}

/**
 * One Stripe event, verified. [event] is either the parsed event (already
 * verified by the caller) or { rawBody, signature } to verify here.
 * [deps]: { store, secret, retrieveSubscription(id), expire(tenantId, note) }.
 */
export async function handleStripeWebhook(event, deps) {
  const e = event?.rawBody != null ? verifyStripeSignature(event.rawBody, event.signature, deps.secret, { now: deps.now }) : event;
  const now = deps.now ?? Date.now();
  switch (e.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const s = e.data.object;
      const { workspaceId, plan, term } = s.metadata ?? {};
      if (!workspaceId || !validPlanTerm(plan, term)) return { status: 'IGNORED', reason: 'metadata' };
      // A subscription's first payment is also its first invoice, and
      // invoice.paid grants every invoice -- granting here as well was two
      // months for the price of one.
      if (s.mode === 'subscription') return { status: 'IGNORED', reason: 'the invoice grants it' };
      // FPX through Stripe settles later, with async_payment_succeeded.
      if (s.payment_status && s.payment_status !== 'paid') return { status: 'IGNORED', reason: 'not paid yet' };
      return updateTenantSubscription(workspaceId, {
        ...planConfigFor(plan, term),
        paymentId: `stripe:${s.payment_intent || s.id}`,
        amountSen: s.amount_total ?? null,
        contactEmail: s.customer_details?.email,
        stripe: { customerId: s.customer ?? '', subscriptionId: s.subscription ?? '' },
        note: `Stripe ${s.id}`,
      }, deps.store, now);
    }
    case 'invoice.paid': {
      const inv = e.data.object;
      if (!inv.subscription) return { status: 'IGNORED', reason: 'no subscription' };
      const sub = await deps.retrieveSubscription(inv.subscription);
      const { workspaceId, plan, term } = sub?.metadata ?? {};
      if (!workspaceId || !validPlanTerm(plan, term)) return { status: 'IGNORED', reason: 'metadata' };
      return updateTenantSubscription(workspaceId, {
        ...planConfigFor(plan, term),
        paymentId: `stripe:${inv.id}`,
        amountSen: inv.amount_paid ?? null,
        stripe: { customerId: inv.customer ?? '', subscriptionId: inv.subscription },
        note: `Stripe renewal ${inv.id}`,
      }, deps.store, now);
    }
    case 'customer.subscription.deleted': {
      const sub = e.data.object;
      const { workspaceId } = sub.metadata ?? {};
      if (!workspaceId) return { status: 'IGNORED', reason: 'metadata' };
      await deps.expire(workspaceId, `Stripe subscription ended ${sub.id}`);
      return { status: 'EXPIRED' };
    }
    default:
      return { status: 'IGNORED', reason: e.type };
  }
}

// --------------------------------------------------------------- ToyyibPay

/** "WORKSPACE|PLAN|TERM", what /toyyibpay/create puts in the bill's reference. */
export function parseOrderId(orderId) {
  const [workspaceId, plan, term] = String(orderId ?? '').split('|');
  return workspaceId && validPlanTerm(plan, term) ? { workspaceId, plan, term } : null;
}

/**
 * A ToyyibPay callback. ToyyibPay signs nothing, so nothing in [payload] is
 * believed: the bill is read back from ToyyibPay (deps.verifyBill ->
 * { paid, amountSen, orderId }) and must be paid, in full, for the plan its
 * own reference names.
 */
export async function handleToyyibPayWebhook(payload, deps) {
  const billcode = String(payload?.billcode || '').trim();
  if (!billcode) return { status: 'IGNORED', reason: 'no billcode' };
  const bill = await deps.verifyBill(billcode);
  if (!bill?.paid) return { status: 'IGNORED', reason: 'not paid' };
  // The reference ToyyibPay holds wins over the one in the callback.
  const order = parseOrderId(bill.orderId ?? payload.order_id);
  if (!order) return { status: 'IGNORED', reason: 'order' };
  const price = priceSen(order.plan, order.term);
  if (bill.amountSen != null && bill.amountSen < price) return { status: 'IGNORED', reason: 'underpaid' };
  return updateTenantSubscription(order.workspaceId, {
    ...planConfigFor(order.plan, order.term),
    paymentId: `toyyibpay:${billcode}`,
    amountSen: bill.amountSen ?? price,
    note: `ToyyibPay ${billcode}`,
  }, deps.store, deps.now ?? Date.now());
}

/** ToyyibPay's getBillTransactions rows -> { paid, amountSen, orderId }. */
export function readToyyibBill(rows) {
  const paid = (Array.isArray(rows) ? rows : []).find((r) => String(r.billpaymentStatus) === '1');
  if (!paid) return { paid: false };
  // billpaymentAmount is ringgit as text ("48.00"); to sen without floats.
  const [whole, frac = ''] = String(paid.billpaymentAmount ?? '').replace(/[^\d.]/g, '').split('.');
  const amountSen = whole === '' && !frac ? null : Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
  return { paid: true, amountSen, orderId: paid.billExternalReferenceNo ?? null };
}

/** An in-memory store, for tests and dry runs. */
export function memoryStore(licences = {}) {
  const payments = new Map();
  let lifetimeSold = 0;
  return {
    licences,
    payments,
    get lifetimeSold() { return lifetimeSold; },
    set lifetimeSold(n) { lifetimeSold = n; },
    async getLicence(id) { return licences[id] ? { ...licences[id] } : null; },
    async claimPayment(id, record) { if (payments.has(id)) return false; payments.set(id, record); return true; },
    async claimLifetimeSlot() { if (lifetimeSold >= LIFETIME_CAP) return null; lifetimeSold += 1; return lifetimeSold; },
    async writeLicence(id, fields) { licences[id] = { ...(licences[id] || {}), ...fields }; },
  };
}
