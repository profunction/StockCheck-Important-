const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@stockcheck.app', password: 'demo123456', returnSecureToken: true }),
});
const { idToken, localId: uid } = await r.json();
const h = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
const s = v => ({ stringValue: v }); const i = v => ({ integerValue: String(v) });

// Exactly the document StockRepository.createStockCheck writes.
const id = `probe${Date.now()}`;
let res = await fetch(`${BASE}/workspaces/default/stockChecks/${id}`, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({ fields: {
    refNo: s('SC-999999'), templateId: s('KumSkFqQ16OYPVnfQfcN'), templateName: s('Quick Count'),
    status: s('IN_PROGRESS'), createdByUid: s(uid), createdByName: s('Demo Admin'),
    createdAt: i(Date.now()), updatedAt: i(Date.now()),
    itemCount: i(0), totalQuantity: i(0), photoCount: i(0), note: s(''),
  }}),
});
console.log('[1] create stockCheck :', res.ok ? 'ALLOWED' : `DENIED — ${(await res.json()).error?.message}`);

// An item inside it, as scanBarcode writes.
res = await fetch(`${BASE}/workspaces/default/stockChecks/${id}/items/item1`, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({ fields: {
    barcode: s('9551234567890'), productName: s('Test'), quantity: i(1), unit: s('pcs'),
    remark: s(''), source: s('SCAN'), createdByUid: s(uid),
    createdAt: i(Date.now()), updatedAt: i(Date.now()),
  }}),
});
console.log('[2] create item      :', res.ok ? 'ALLOWED' : `DENIED — ${(await res.json()).error?.message}`);

// The audit entry every write also attempts.
res = await fetch(`${BASE}/workspaces/default/auditLog`, {
  method: 'POST', headers: h,
  body: JSON.stringify({ fields: {
    stockCheckId: s(id), entity: s('StockCheck'), entityId: s(id), entityLabel: s('SC-999999'),
    action: s('CREATE'), field: s(''), oldValue: s(''), newValue: s(''),
    actorUid: s(uid), actorName: s('Demo Admin'), at: i(Date.now()),
  }}),
});
console.log('[3] audit log entry  :', res.ok ? 'ALLOWED' : `DENIED — ${(await res.json()).error?.message}`);

// Clean up the probe check.
await fetch(`${BASE}/workspaces/default/stockChecks/${id}/items/item1`, { method: 'DELETE', headers: h });
await fetch(`${BASE}/workspaces/default/stockChecks/${id}`, { method: 'DELETE', headers: h });
console.log('\n(probe documents removed)');
