const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@stockcheck.app', password: 'demo123456', returnSecureToken: true }),
});
const { idToken } = await r.json();
const h = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };

const run = async (label, structuredQuery) => {
  const res = await fetch(`${BASE}/workspaces/default:runQuery`, {
    method: 'POST', headers: h, body: JSON.stringify({ structuredQuery }),
  });
  const j = await res.json();
  if (!res.ok) return console.log(`${label}\n   FAILED: ${j.error?.message?.slice(0, 300)}\n`);
  const rows = j.filter(d => d.document);
  console.log(`${label}\n   OK — ${rows.length} documents\n`);
};

// Exactly what the template picker asks for.
await run('[A] where(active==true) + orderBy(name)   <- what the app sends', {
  from: [{ collectionId: 'templates' }],
  where: { fieldFilter: { field: { fieldPath: 'active' }, op: 'EQUAL', value: { booleanValue: true } } },
  orderBy: [{ field: { fieldPath: 'name' }, direction: 'ASCENDING' }],
});

await run('[B] where(active==true), no orderBy', {
  from: [{ collectionId: 'templates' }],
  where: { fieldFilter: { field: { fieldPath: 'active' }, op: 'EQUAL', value: { booleanValue: true } } },
});

await run('[C] orderBy(name) only', {
  from: [{ collectionId: 'templates' }],
  orderBy: [{ field: { fieldPath: 'name' }, direction: 'ASCENDING' }],
});
