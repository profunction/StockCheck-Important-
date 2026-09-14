const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@stockcheck.app', password: 'demo123456', returnSecureToken: true }),
});
const { idToken, localId } = await r.json();
const h = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };

// The new collections only exist in the updated rules. A write that is allowed
// proves they are published; a denial proves the old rules are still live.
const probe = `LIVECHECK${Date.now()}`;
const res = await fetch(`${BASE}/workspaceCodes/${probe}`, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({ fields: {
    workspaceId: { stringValue: 'probe' },
    companyName: { stringValue: 'probe' },
    createdAt: { integerValue: String(Date.now()) },
    createdByUid: { stringValue: localId },
  }}),
});
if (res.ok) {
  console.log('NEW RULES ARE LIVE');
  await fetch(`${BASE}/workspaceCodes/${probe}`, { method: 'DELETE', headers: h });
} else {
  const e = await res.json();
  console.log('OLD RULES STILL LIVE  ->', e.error?.message);
}
