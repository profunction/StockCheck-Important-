// Proves, against the real project, that a customer cannot edit their own
// licence.
//
// The whole billing model rests on one rule. `allow write: if false` is easy
// to write and easy to lose in a later edit, and the failure is silent: the
// app keeps working, the money keeps not arriving, and nothing in the logs
// says why. So this asks the live database directly, as a real signed-in
// admin, using the same REST API a modified client would.
//
//   node verify-licence.mjs

const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const EMAIL = process.env.PROBE_EMAIL ?? 'demo@stockcheck.app';
const PASSWORD = process.env.PROBE_PASSWORD ?? 'demo123456';

const signIn = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  },
);
const auth = await signIn.json();
if (!auth.idToken) {
  console.error(`Could not sign in as ${EMAIL}: ${auth.error?.message ?? 'unknown'}`);
  process.exit(1);
}
const headers = { Authorization: `Bearer ${auth.idToken}`, 'Content-Type': 'application/json' };

// Which company this account belongs to -- the licence is keyed by it.
const indexRes = await fetch(`${BASE}/userIndex/${auth.localId}`, { headers });
const index = await indexRes.json();
const workspaceId = index.fields?.workspaceId?.stringValue;
if (!workspaceId) {
  console.error('This account has no company; nothing to check against.');
  process.exit(1);
}

console.log(`signed in as ${EMAIL}`);
console.log(`company      ${workspaceId}\n`);

let failures = 0;

async function expect(label, shouldAllow, run) {
  const res = await run();
  const status = res.ok ? '' : (await res.json()).error?.status ?? String(res.status);

  // NOT_FOUND is the rules saying yes to a document that is not there, which
  // is a different answer from PERMISSION_DENIED and must not be counted as
  // one -- an unprovisioned company would otherwise read as a broken rule.
  const allowed = res.ok || status === 'NOT_FOUND';
  const verdict = allowed === shouldAllow ? 'as expected' : '*** WRONG ***';
  if (allowed !== shouldAllow) failures++;
  const outcome = res.ok ? 'ALLOWED' : status === 'NOT_FOUND' ? 'ALLOWED' : 'DENIED ';
  const suffix = status ? `  (${status})` : '';
  console.log(`  ${outcome}  ${label.padEnd(46)} ${verdict}${suffix}`);
}

console.log('reading:');
await expect('read own licence', true, () =>
  fetch(`${BASE}/licences/${workspaceId}`, { headers }),
);
await expect('list every licence (customer directory)', false, () =>
  fetch(`${BASE}/licences`, { headers }),
);

console.log('\nwriting -- every one of these must be DENIED:');
await expect('grant self a lifetime plan', false, () =>
  fetch(`${BASE}/licences/${workspaceId}?updateMask.fieldPaths=plan`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { plan: { stringValue: 'UNLIMITED' } } }),
  }),
);
await expect('push the expiry out to 2099', false, () =>
  fetch(`${BASE}/licences/${workspaceId}?updateMask.fieldPaths=expiresAt`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { expiresAt: { integerValue: '4102444800000' } } }),
  }),
);
await expect('make it lifetime by zeroing the expiry', false, () =>
  fetch(`${BASE}/licences/${workspaceId}?updateMask.fieldPaths=expiresAt`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { expiresAt: { integerValue: '0' } } }),
  }),
);
await expect('raise the seat limit', false, () =>
  fetch(`${BASE}/licences/${workspaceId}?updateMask.fieldPaths=seats`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { seats: { integerValue: '9999' } } }),
  }),
);
await expect('delete the licence entirely', false, () =>
  fetch(`${BASE}/licences/${workspaceId}`, { method: 'DELETE', headers }),
);
await expect("create a licence for someone else's company", false, () =>
  fetch(`${BASE}/licences?documentId=not-my-company`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fields: { plan: { stringValue: 'UNLIMITED' } } }),
  }),
);

console.log(
  failures === 0
    ? '\nAll as expected. A customer can read their licence and change nothing.'
    : `\n${failures} check(s) came out WRONG. The billing model is not enforced.`,
);
process.exit(failures === 0 ? 0 : 1);
