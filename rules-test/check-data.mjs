const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@stockcheck.app', password: 'demo123456', returnSecureToken: true }),
});
const { idToken } = await r.json();
const h = { Authorization: `Bearer ${idToken}` };

const res = await fetch(`${BASE}/workspaces/default/stockChecks`, { headers: h });
const j = await res.json();
if (!res.ok) { console.log('cannot read:', j.error?.message); process.exit(1); }

const checks = j.documents ?? [];
console.log(`stock checks: ${checks.length}\n`);

for (const d of checks) {
  const id = d.name.split('/').pop();
  const f = d.fields ?? {};
  const ref = f.refNo?.stringValue ?? '?';
  const status = f.status?.stringValue ?? '?';
  const owner = f.createdByName?.stringValue ?? '?';
  const countField = f.itemCount?.integerValue ?? '0';

  // The counter on the parent can drift; the subcollection is the truth.
  const ir = await fetch(`${BASE}/workspaces/default/stockChecks/${id}/items`, { headers: h });
  const ij = await ir.json();
  const actual = ir.ok ? (ij.documents ?? []).length : `ERR ${ij.error?.message?.slice(0,40)}`;

  console.log(`${ref}  ${status.padEnd(12)} by ${owner}`);
  console.log(`   itemCount field = ${countField}   actual item docs = ${actual}`);
  if (ir.ok && (ij.documents ?? []).length) {
    for (const it of ij.documents.slice(0, 3)) {
      const q = it.fields ?? {};
      console.log(`      ${q.barcode?.stringValue ?? ''}  ${q.productName?.stringValue ?? ''}  qty=${q.quantity?.integerValue ?? '?'}`);
    }
  }
  console.log('');
}
