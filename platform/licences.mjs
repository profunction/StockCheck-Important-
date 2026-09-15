// Writing licences. The only code in this repository that may.
//
// Everything here runs through the Admin SDK, which bypasses firestore.rules
// by design. That is the whole point: `/licences/{workspaceId}` is
// `allow write: if false` for every client, so a customer's own admin cannot
// hand themselves a lifetime plan. The trade is that this file has no
// guardrails at all -- a service-account key is root on the database -- so it
// stays small, it stays read-first, and it never runs on anything but the
// platform's own machine.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { PLANS, TERMS, TRIAL_DAYS, LIFETIME_SUPPORT_MONTHS, addMonths, addDays } from './plans.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export function db() {
  if (getApps().length === 0) {
    const keyPath = process.env.SERVICE_ACCOUNT_PATH || join(here, 'service-account.json');
    if (!existsSync(keyPath)) {
      throw new Error(
        `No service-account.json at ${keyPath}\n` +
          'Firebase console > Project settings > Service accounts > Generate new private key',
      );
    }
    initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
  }
  return getFirestore();
}

export const ref = (workspaceId) => db().collection('licences').doc(workspaceId);

export async function get(workspaceId) {
  const snap = await ref(workspaceId).get();
  return snap.exists ? { workspaceId, ...snap.data() } : null;
}

export async function list() {
  const snap = await db().collection('licences').get();
  return snap.docs.map((d) => ({ workspaceId: d.id, ...d.data() }));
}

/**
 * Writes a licence.
 *
 * Merges rather than replaces, so a field added later -- or a note someone
 * wrote by hand -- is not silently dropped by an older copy of this script.
 */
export async function write(workspaceId, fields, note) {
  const now = Date.now();
  await ref(workspaceId).set(
    { ...fields, note: note ?? fields.note ?? '', updatedAt: now },
    { merge: true },
  );
  return get(workspaceId);
}

/** A brand-new company, counting down from today. */
export async function startTrial(workspaceId, { companyName = '', contactEmail = '', days = TRIAL_DAYS } = {}) {
  const now = Date.now();
  return write(
    workspaceId,
    {
      plan: 'TRIAL',
      status: 'ACTIVE',
      seats: PLANS.TRIAL.seats,
      startedAt: now,
      expiresAt: addDays(now, days),
      supportUntil: 0,
      companyName,
      contactEmail,
    },
    `${days}-day trial started`,
  );
}

/**
 * Puts a company on a paid plan.
 *
 * Extends from whichever is later: today, or the expiry it already has.
 * Renewing three days early must not throw away those three days -- that is a
 * refund request waiting to happen, and the customer is right.
 */
export async function grant(workspaceId, plan, term, { months, companyName, contactEmail, stripe, note } = {}) {
  const spec = PLANS[plan];
  const termSpec = TERMS[term];
  if (!spec) throw new Error(`Unknown plan: ${plan}`);
  if (!termSpec) throw new Error(`Unknown term: ${term}`);

  const now = Date.now();
  const existing = await get(workspaceId);
  const from = existing?.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;

  const lifetime = term === 'lifetime';
  const span = months ?? termSpec.months;

  const fields = {
    plan,
    status: 'ACTIVE',
    seats: spec.seats,
    startedAt: existing?.startedAt || now,
    // Zero is what makes a lifetime licence lifetime. A far-future date is a
    // date that eventually arrives, on a phone whose clock nobody checks.
    expiresAt: lifetime ? 0 : addMonths(from, span),
    supportUntil: lifetime ? addMonths(now, LIFETIME_SUPPORT_MONTHS) : 0,
  };
  if (companyName !== undefined) fields.companyName = companyName;
  if (contactEmail !== undefined) fields.contactEmail = contactEmail;
  if (stripe?.customerId) fields.stripeCustomerId = stripe.customerId;
  if (stripe?.subscriptionId) fields.stripeSubscriptionId = stripe.subscriptionId;

  return write(workspaceId, fields, note ?? `${spec.label} ${termSpec.label}`);
}

/** Adds time without changing the plan. Goodwill, or a payment that bounced and cleared. */
export async function extend(workspaceId, days, note) {
  const existing = await get(workspaceId);
  if (!existing) throw new Error(`No licence for ${workspaceId}`);
  if (existing.expiresAt === 0) return existing; // lifetime; nothing to extend
  const now = Date.now();
  const from = existing.expiresAt > now ? existing.expiresAt : now;
  return write(workspaceId, { expiresAt: addDays(from, days), status: 'ACTIVE' }, note ?? `extended ${days} days`);
}

/** Stops new work immediately. Reading, finishing and exporting keep working. */
export async function suspend(workspaceId, note) {
  return write(workspaceId, { status: 'SUSPENDED' }, note ?? 'suspended');
}

export async function resume(workspaceId, note) {
  return write(workspaceId, { status: 'ACTIVE' }, note ?? 'resumed');
}

/** Marks a lapsed subscription. Called by the payment webhook, not by hand. */
export async function expire(workspaceId, note) {
  return write(workspaceId, { status: 'EXPIRED', expiresAt: Date.now() }, note ?? 'subscription ended');
}

/**
 * Finds a company by its join code, because that is what a customer quotes.
 *
 * Nobody emails you a workspace id. They write "we are UPOINT".
 */
export async function findByCode(code) {
  const snap = await db().collection('workspaceCodes').doc(code.trim().toUpperCase()).get();
  if (!snap.exists) return null;
  return { code: snap.id, ...snap.data() };
}

/** How many accounts a company actually has, for checking a seat limit. */
export async function seatsUsed(workspaceId) {
  const snap = await db().collection('workspaces').doc(workspaceId).collection('users').get();
  return snap.docs.filter((d) => d.data().active !== false).length;
}
