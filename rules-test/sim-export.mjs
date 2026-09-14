/**
 * Replays ExportService's filtering against the live data, to find which
 * step empties the file rather than guessing.
 */
const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const signIn = async (email, password) => {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return r.json();
};

const { idToken, localId: myUid } = await signIn('demo@stockcheck.app', 'demo123456');
const h = { Authorization: `Bearer ${idToken}` };

const res = await fetch(`${BASE}/workspaces/default/stockChecks`, { headers: h });
const checks = ((await res.json()).documents ?? []).map(d => ({
  id: d.name.split('/').pop(),
  refNo: d.fields?.refNo?.stringValue,
  createdByUid: d.fields?.createdByUid?.stringValue,
  createdByName: d.fields?.createdByName?.stringValue,
}));

console.log(`signed in as demo@stockcheck.app  uid=${myUid}`);
console.log(`stock checks visible: ${checks.length}`);
for (const c of checks) {
  console.log(`   ${c.refNo}  createdByUid=${c.createdByUid}  (${c.createdByName})`);
}

for (const scope of ['ALL', 'OWN']) {
  const scoped = checks.filter(c => scope === 'ALL' || c.createdByUid === myUid);
  let rows = 0;
  for (const c of scoped) {
    const ir = await fetch(`${BASE}/workspaces/default/stockChecks/${c.id}/items`, { headers: h });
    rows += ((await ir.json()).documents ?? []).length;
  }
  console.log(`\nscope=${scope}:  ${scoped.length} checks  ->  ${rows} data rows`);
  if (rows === 0) console.log('   ^ this is what produces a header-only file');
}
