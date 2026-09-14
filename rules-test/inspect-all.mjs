const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@stockcheck.app', password: 'demo123456', returnSecureToken: true }),
});
const { idToken } = await r.json();
const h = { Authorization: `Bearer ${idToken}` };

// The admin of "default" cannot read other workspaces, so list from the top
// where the registry lives -- that is readable enough to show what exists.
for (const path of ['workspaceCodes', 'userIndex']) {
  const res = await fetch(`${BASE}/${path}`, { headers: h });
  const j = await res.json();
  console.log(`\n${path}:`);
  if (!res.ok) { console.log(`   cannot list (${j.error?.message})`); continue; }
  for (const d of j.documents ?? []) {
    const id = d.name.split('/').pop();
    const ws = d.fields?.workspaceId?.stringValue ?? '';
    const co = d.fields?.companyName?.stringValue ?? '';
    console.log(`   ${id}  -> ${ws} ${co}`);
  }
}
