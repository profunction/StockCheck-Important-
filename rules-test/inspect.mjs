const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@stockcheck.app', password: 'demo123456', returnSecureToken: true }),
});
const { idToken } = await r.json();
const h = { Authorization: `Bearer ${idToken}` };

for (const path of ['workspaces/default/roles', 'workspaces/default/users', 'workspaces/default/templates']) {
  const res = await fetch(`${BASE}/${path}`, { headers: h });
  const j = await res.json();
  if (!res.ok) { console.log(`${path}: HTTP ${res.status} ${j.error?.message ?? ''}`); continue; }
  const docs = j.documents ?? [];
  console.log(`\n${path}  (${docs.length})`);
  for (const d of docs) {
    const id = d.name.split('/').pop();
    const f = d.fields ?? {};
    const extra = f.roleId ? ` roleId=${f.roleId.stringValue} email=${f.email?.stringValue ?? ''}`
                : f.name ? ` name=${f.name.stringValue} perms=${f.permissions?.arrayValue?.values?.length ?? 0}` : '';
    console.log(`   ${id}${extra}`);
  }
}
