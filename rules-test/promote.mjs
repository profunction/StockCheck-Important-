const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const TARGETS = { F0Pq9wmhy4OcQj7NrrkPYzh3wc03: 'lawoozhe0101@gmail.com' };

const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@stockcheck.app', password: 'demo123456', returnSecureToken: true }),
});
const { idToken } = await r.json();

for (const [uid, email] of Object.entries(TARGETS)) {
  // Only roleId and roleName are touched; updateMask keeps every other field
  // on the profile as it is.
  const res = await fetch(
    `${BASE}/workspaces/default/users/${uid}?updateMask.fieldPaths=roleId&updateMask.fieldPaths=roleName`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { roleId: { stringValue: 'admin' }, roleName: { stringValue: 'Admin' } } }),
    },
  );
  const j = await res.json();
  console.log(res.ok ? `OK   ${email} -> Admin` : `FAIL ${email}: ${j.error?.message}`);
}
