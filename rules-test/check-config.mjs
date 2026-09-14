const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@stockcheck.app', password: 'demo123456', returnSecureToken: true }),
});
const { idToken } = await r.json();
const res = await fetch(`${BASE}/workspaces/default/meta/config`, {
  headers: { Authorization: `Bearer ${idToken}` },
});
const j = await res.json();
if (!res.ok) { console.log('cannot read config:', j.error?.message); process.exit(1); }
const f = j.fields ?? {};
for (const k of ['companyName', 'joinCode', 'exportPassword']) {
  const v = f[k]?.stringValue;
  console.log(`${k.padEnd(16)} ${v === undefined ? '(field missing)' : v === '' ? '(empty)' : v}`);
}
