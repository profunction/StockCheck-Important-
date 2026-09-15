// Writes a licence using the Firebase CLI's own credentials.
//
// A stopgap, and marked as one. The real path is platform/licence-cli.mjs with
// a service-account key, which works unattended and on a server. This exists
// because `/licences/{workspaceId}` is `allow write: if false` for every
// client -- correctly -- which means the very first licence cannot be created
// from the app, from a REST call as a signed-in user, or from anywhere except
// something holding credentials that bypass rules. Downloading a key takes a
// trip to the Firebase console; this takes the token `firebase login` already
// left on this machine.
//
//   node provision-licence.mjs <workspaceId|CODE> <PLAN> <TERM> [days]
//
//   node provision-licence.mjs UPOINT UNLIMITED lifetime
//   node provision-licence.mjs default BUSINESS yearly
//   node provision-licence.mjs ACME   TRIAL     trial 14
//
// Google OAuth credentials reach Firestore through IAM, not through security
// rules -- the same reason the Firebase console can edit any document.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'stockcheck-fb58e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const SEATS = { TRIAL: 5, STARTER: 5, BUSINESS: 20, UNLIMITED: 2_000_000_000 };
const MONTHS = { monthly: 1, yearly: 12 };
const LIFETIME_SUPPORT_MONTHS = 24;

function cliToken() {
  const path = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  const store = JSON.parse(readFileSync(path, 'utf8'));
  const token = store?.tokens?.access_token;
  const expires = store?.tokens?.expires_at ?? 0;
  if (!token) throw new Error('No Firebase CLI token. Run: firebase login');
  if (expires && expires < Date.now()) {
    throw new Error('The Firebase CLI token has expired. Run any firebase command to refresh it.');
  }
  return token;
}

const addMonths = (millis, months) => {
  const date = new Date(millis);
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() < day) date.setDate(0);
  return date.getTime();
};

const [, , target, planArg, termArg, daysArg] = process.argv;
if (!target) {
  console.log('node provision-licence.mjs <workspaceId|CODE> <PLAN> <TERM> [days]');
  console.log(`  PLAN  ${Object.keys(SEATS).join(' ')}`);
  console.log('  TERM  monthly yearly lifetime trial');
  process.exit(1);
}

const plan = (planArg ?? 'TRIAL').toUpperCase();
const term = (termArg ?? 'trial').toLowerCase();
if (!SEATS[plan]) {
  console.error(`Unknown plan ${plan}`);
  process.exit(1);
}

const token = cliToken();
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

/** A join code is what a customer quotes; a workspace id is what the path needs. */
async function resolve(value) {
  const res = await fetch(`${BASE}/workspaceCodes/${value.trim().toUpperCase()}`, { headers });
  if (!res.ok) return { workspaceId: value, companyName: '' };
  const doc = await res.json();
  return {
    workspaceId: doc.fields?.workspaceId?.stringValue ?? value,
    companyName: doc.fields?.companyName?.stringValue ?? '',
  };
}

const { workspaceId, companyName } = await resolve(target);
const now = Date.now();

let expiresAt;
let supportUntil = 0;
if (term === 'lifetime') {
  // Zero, not a far-future date. A date eventually arrives, on a phone whose
  // clock nobody is watching.
  expiresAt = 0;
  supportUntil = addMonths(now, LIFETIME_SUPPORT_MONTHS);
} else if (term === 'trial') {
  expiresAt = now + Number(daysArg ?? 14) * 86_400_000;
} else if (MONTHS[term]) {
  expiresAt = addMonths(now, MONTHS[term]);
} else {
  console.error(`Unknown term ${term}`);
  process.exit(1);
}

const fields = {
  plan: { stringValue: plan },
  status: { stringValue: 'ACTIVE' },
  seats: { integerValue: String(SEATS[plan]) },
  startedAt: { integerValue: String(now) },
  expiresAt: { integerValue: String(expiresAt) },
  supportUntil: { integerValue: String(supportUntil) },
  companyName: { stringValue: companyName },
  contactEmail: { stringValue: '' },
  stripeCustomerId: { stringValue: '' },
  stripeSubscriptionId: { stringValue: '' },
  note: { stringValue: `provisioned by hand, ${plan} ${term}` },
  updatedAt: { integerValue: String(now) },
};

const res = await fetch(`${BASE}/licences?documentId=${encodeURIComponent(workspaceId)}`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ fields }),
});

if (!res.ok) {
  const error = await res.json();
  // Already there: PATCH instead of refusing, since re-running this after a
  // typo should not need a console visit to delete the first attempt.
  if (error.error?.status === 'ALREADY_EXISTS') {
    const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${f}`).join('&');
    const patch = await fetch(`${BASE}/licences/${encodeURIComponent(workspaceId)}?${mask}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fields }),
    });
    if (!patch.ok) {
      console.error('Update failed:', (await patch.json()).error?.message);
      process.exit(1);
    }
  } else {
    console.error('Write failed:', error.error?.message);
    process.exit(1);
  }
}

const when = (millis) => (millis ? new Date(millis).toISOString().slice(0, 10) : 'no end date');
console.log(`\n${companyName || workspaceId}`);
console.log(`  workspace   ${workspaceId}`);
console.log(`  plan        ${plan}  (${SEATS[plan] >= 1e9 ? 'unlimited' : SEATS[plan]} accounts)`);
console.log(`  expires     ${when(expiresAt)}`);
if (supportUntil) console.log(`  support to  ${when(supportUntil)}`);
console.log('\nThe app picks this up on its next snapshot, within seconds.\n');
