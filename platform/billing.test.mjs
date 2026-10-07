// node platform/billing.test.mjs -- payments in, licences out. No network, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BillingError, handleStripeWebhook, handleToyyibPayWebhook, licenceFields, memoryStore, parseOrderId,
  planConfigFor, readToyyibBill, stripeSignature, updateTenantSubscription, verifyStripeSignature,
} from './billing.mjs';
import { LIFETIME_CAP } from './plans.mjs';

const SECRET = 'whsec_test';
const NOW = Date.UTC(2026, 9, 7);
const DAY = 86_400_000;
const signed = (event, seconds = Math.floor(NOW / 1000)) => {
  const rawBody = JSON.stringify(event);
  return { rawBody, signature: stripeSignature(rawBody, SECRET, seconds) };
};
const deps = (store, extra = {}) => ({ store, secret: SECRET, now: NOW, retrieveSubscription: async () => ({ metadata: { workspaceId: 'w1', plan: 'BUSINESS', term: 'monthly' } }), expire: async () => {}, ...extra });

test('Stripe signatures: right secret passes; wrong, old or edited fails', () => {
  const ev = { type: 'x' };
  const { rawBody, signature } = signed(ev);
  assert.deepEqual(verifyStripeSignature(rawBody, signature, SECRET, { now: NOW }), ev);
  assert.throws(() => verifyStripeSignature(rawBody, signature, 'whsec_other', { now: NOW }), BillingError);
  assert.throws(() => verifyStripeSignature(rawBody.replace('x', 'y'), signature, SECRET, { now: NOW }), /does not match/);
  assert.throws(() => verifyStripeSignature(rawBody, signature, SECRET, { now: NOW + 10 * 60_000 }), /too old/);
  assert.throws(() => verifyStripeSignature(rawBody, '', SECRET, { now: NOW }), /No timestamp/);
});

test('a forged Stripe event grants nothing', async () => {
  const store = memoryStore();
  const ev = { type: 'checkout.session.completed', data: { object: { mode: 'payment', payment_status: 'paid', metadata: { workspaceId: 'w1', plan: 'UNLIMITED', term: 'lifetime' } } } };
  await assert.rejects(handleStripeWebhook({ rawBody: JSON.stringify(ev), signature: 't=1,v1=00' }, deps(store)), BillingError);
  assert.equal(store.licences.w1, undefined);
});

test('a subscription is granted once: the checkout defers to the invoice, a repeated invoice is a duplicate', async () => {
  const store = memoryStore();
  const checkout = { type: 'checkout.session.completed', data: { object: { id: 'cs_1', mode: 'subscription', payment_status: 'paid', metadata: { workspaceId: 'w1', plan: 'BUSINESS', term: 'monthly' } } } };
  const invoice = { type: 'invoice.paid', data: { object: { id: 'in_1', subscription: 'sub_1', customer: 'cus_1', amount_paid: 11800 } } };
  assert.equal((await handleStripeWebhook(signed(checkout), deps(store))).status, 'IGNORED');
  assert.equal((await handleStripeWebhook(signed(invoice), deps(store))).status, 'GRANTED');
  const first = store.licences.w1.expiresAt;
  assert.equal((await handleStripeWebhook(signed(invoice), deps(store))).status, 'DUPLICATE');
  assert.equal(store.licences.w1.expiresAt, first);
  assert.equal(store.licences.w1.plan, 'BUSINESS');
  assert.equal(store.licences.w1.seats, 20);
  assert.equal(store.licences.w1.multiBranch, true);
  assert.equal(store.licences.w1.stripeSubscriptionId, 'sub_1');
  // The next month's invoice extends from the current expiry.
  await handleStripeWebhook(signed({ ...invoice, data: { object: { ...invoice.data.object, id: 'in_2' } } }), deps(store));
  assert.ok(store.licences.w1.expiresAt > first + 27 * DAY);
});

test('a one-off Stripe payment (lifetime) and a delayed FPX payment', async () => {
  const store = memoryStore();
  const session = { id: 'cs_2', mode: 'payment', payment_intent: 'pi_1', payment_status: 'unpaid', amount_total: 168000, metadata: { workspaceId: 'w2', plan: 'STARTER', term: 'lifetime' } };
  assert.equal((await handleStripeWebhook(signed({ type: 'checkout.session.completed', data: { object: session } }), deps(store))).reason, 'not paid yet');
  const r = await handleStripeWebhook(signed({ type: 'checkout.session.async_payment_succeeded', data: { object: { ...session, payment_status: 'paid' } } }), deps(store));
  assert.equal(r.status, 'GRANTED');
  assert.equal(store.licences.w2.expiresAt, 0);
  assert.equal(store.licences.w2.lifetimeSlot, 1);
  assert.ok(store.licences.w2.supportUntil > NOW + 23 * 30 * DAY);
});

test('subscription cancelled -> expired', async () => {
  let expired = null;
  const r = await handleStripeWebhook(signed({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_9', metadata: { workspaceId: 'w9' } } } }), deps(memoryStore(), { expire: async (id) => { expired = id; } }));
  assert.equal(r.status, 'EXPIRED');
  assert.equal(expired, 'w9');
});

test('ToyyibPay: verified with ToyyibPay, paid in full, counted once', async () => {
  const store = memoryStore();
  const paidBill = async () => ({ paid: true, amountSen: 38000, orderId: 'w3|POS_ONLY|yearly' });
  // Recurring terms are refused at checkout; a yearly one-off is fine.
  const r1 = await handleToyyibPayWebhook({ billcode: 'b1', order_id: 'w3|POS_ONLY|yearly' }, { store, verifyBill: paidBill, now: NOW });
  assert.equal(r1.status, 'GRANTED');
  assert.equal(store.licences.w3.tills, 2);
  assert.equal(store.licences.w3.modules.app, false);
  const r2 = await handleToyyibPayWebhook({ billcode: 'b1', order_id: 'w3|POS_ONLY|yearly' }, { store, verifyBill: paidBill, now: NOW });
  assert.equal(r2.status, 'DUPLICATE');
  assert.equal((await handleToyyibPayWebhook({ billcode: 'b2' }, { store, verifyBill: async () => ({ paid: false }) })).reason, 'not paid');
  // Paid for the cheap plan, claims the dear one.
  const cheap = async () => ({ paid: true, amountSen: 2800, orderId: null });
  assert.equal((await handleToyyibPayWebhook({ billcode: 'b3', order_id: 'w3|UNLIMITED|lifetime' }, { store, verifyBill: cheap })).reason, 'underpaid');
});

test('ToyyibPay rows and order ids', () => {
  assert.deepEqual(readToyyibBill([{ billpaymentStatus: '1', billpaymentAmount: '48.00', billExternalReferenceNo: 'w|STARTER|monthly' }]), { paid: true, amountSen: 4800, orderId: 'w|STARTER|monthly' });
  assert.deepEqual(readToyyibBill([{ billpaymentStatus: '3' }]), { paid: false });
  assert.equal(parseOrderId('w|APP_ONLY|lifetime'), null);
  assert.equal(parseOrderId('w|TRIAL|monthly'), null);
  assert.deepEqual(parseOrderId('w|APP_ONLY|monthly'), { workspaceId: 'w', plan: 'APP_ONLY', term: 'monthly' });
});

test('lifetime licences stop at 50', async () => {
  const store = memoryStore();
  store.lifetimeSold = LIFETIME_CAP - 1;
  const buy = (ws, pay) => updateTenantSubscription(ws, { ...planConfigFor('BUSINESS', 'lifetime'), paymentId: pay }, store, NOW);
  assert.equal((await buy('a', 'p1')).status, 'GRANTED');
  assert.equal(store.licences.a.lifetimeSlot, 50);
  assert.equal((await buy('b', 'p2')).status, 'SOLD_OUT');
  assert.equal(store.licences.b.pendingRefund.paymentId, 'p2');
  assert.equal(store.licences.b.plan, undefined);
});

test('renewing early keeps the days left; a lifetime licence stays lifetime', () => {
  const cfg = planConfigFor('STARTER', 'monthly');
  const early = licenceFields({ expiresAt: NOW + 5 * DAY, startedAt: 1 }, cfg, NOW);
  assert.ok(early.expiresAt >= NOW + 5 * DAY + 28 * DAY);
  assert.equal(early.startedAt, 1);
  assert.equal(licenceFields({ plan: 'STARTER', status: 'ACTIVE', expiresAt: 0 }, cfg, NOW).expiresAt, 0);
  assert.throws(() => planConfigFor('API_ONLY', 'lifetime'), /Not for sale/);
});
