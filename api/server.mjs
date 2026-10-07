/**
 * The Pos Stock Check API.
 *
 * Lets another system -- an online shop, an accounting program, a
 * customer's own spreadsheet script -- read and update a company's items,
 * stock, receipts and customers. Runs on Cloud Run with the project's own
 * identity, so it can read the database; every request names its company
 * by an access token made on the POS website (Integrations -> Access
 * tokens), of which only the SHA-256 is stored.
 *
 * Stock is worked out by ledger.js, the same file the website uses and the
 * same rules as the app, so all three show one number for one shelf.
 */
import express from 'express';
import { initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { levels as ledgerLevels, merge } from './ledger.js';
import {
  ApiError, bearer, customerIn, customerOut, itemIn, itemOut, pageSize, receiptOut, sha256, stockChange,
} from './lib.mjs';

initializeApp();
const db = getFirestore();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Any website may call this with a token; the token is the permission.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/', (_req, res) => res.json({
  name: 'Pos Stock Check API',
  version: 1,
  docs: 'https://stockcheck-fb58e.web.app/#/integrations/api',
}));
app.get('/health', (_req, res) => res.json({ ok: true }));

// ------------------------------------------------------------------- auth

const lastTouched = new Map();
const hits = new Map();
const RATE_PER_MINUTE = 120;

app.use('/v1', wrap(async (req, res, next) => {
  const token = bearer(req.get('authorization'));
  if (!token) throw new ApiError(401, 'Send an access token: Authorization: Bearer sck_...');
  const hash = sha256(token);

  // A plain per-token limit, per instance: enough to stop a runaway script.
  const minute = Math.floor(Date.now() / 60000);
  const key = `${hash}:${minute}`;
  const count = (hits.get(key) || 0) + 1;
  hits.set(key, count);
  if (hits.size > 10000) hits.clear();
  if (count > RATE_PER_MINUTE) throw new ApiError(429, 'Too many requests. Wait a minute.');

  const snap = await db.doc(`apiTokens/${hash}`).get();
  if (!snap.exists) throw new ApiError(401, 'This access token is not valid, or was revoked.');
  const data = snap.data();
  req.ws = data.workspaceId;
  req.tokenName = data.name || 'API';
  if (Date.now() - (lastTouched.get(hash) || 0) > 10 * 60 * 1000) {
    lastTouched.set(hash, Date.now());
    snap.ref.update({ lastUsedAt: Date.now() }).catch(() => {});
  }
  next();
}));

const col = (req, name) => db.collection('workspaces').doc(req.ws).collection(name);

/** A page of a collection by document id, 250 at most. */
async function page(query, req) {
  const size = pageSize(req.query.limit);
  let q = query.orderBy(FieldPath.documentId()).limit(size + 1);
  if (req.query.cursor) q = q.startAfter(String(req.query.cursor));
  const docs = (await q.get()).docs;
  return { docs: docs.slice(0, size), cursor: docs.length > size ? docs[size - 1].id : null };
}

// ------------------------------------------------------------------ items

app.get('/v1/items', wrap(async (req, res) => {
  const { docs, cursor } = await page(col(req, 'products'), req);
  res.json({ items: docs.map((d) => itemOut(d.id, d.data())), cursor });
}));

app.get('/v1/items/:barcode', wrap(async (req, res) => {
  const snap = await col(req, 'products').doc(req.params.barcode).get();
  if (!snap.exists) throw new ApiError(404, 'No item with that barcode.');
  res.json(itemOut(snap.id, snap.data()));
}));

/** { items: [ { barcode, name, price_sen, ... } ] } or a single item. Up to 250. */
app.post('/v1/items', wrap(async (req, res) => {
  const list = Array.isArray(req.body?.items) ? req.body.items : [req.body];
  if (list.length > 250) throw new ApiError(400, 'At most 250 items per request.');
  const parsed = list.map(itemIn);
  const refs = parsed.map((p) => col(req, 'products').doc(p.barcode));
  const existing = await db.getAll(...refs);
  const now = Date.now();
  const batch = db.batch();
  parsed.forEach((p, i) => {
    if (existing[i].exists) batch.set(refs[i], { ...p.fields, updatedAt: now }, { merge: true });
    else {
      if (!p.fields.name) throw new ApiError(400, `A new item needs a name: ${p.barcode}`);
      batch.set(refs[i], { unit: 'pcs', active: true, trackStock: true, ...p.fields, createdAt: now, createdByUid: `api:${req.tokenName}`, updatedAt: now });
    }
  });
  await batch.commit();
  const after = await db.getAll(...refs);
  res.json({ items: after.map((d) => itemOut(d.id, d.data())) });
}));

// -------------------------------------------------------------- inventory

/** Stock on hand per branch: { [branchId]: levels[] }. */
async function stockByBranch(req) {
  const [checksSnap, movesSnap, productsSnap] = await Promise.all([
    col(req, 'stockChecks').where('status', 'in', ['COMPLETED', 'REVIEWED', 'LOCKED']).get(),
    col(req, 'movements').where('at', '>=', Date.now() - 400 * 24 * 3600 * 1000).get(),
    col(req, 'products').get(),
  ]);
  const checks = checksSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
  const items = new Map(await Promise.all(checks.map(async (c) =>
    [c.id, (await col(req, 'stockChecks').doc(c.id).collection('items').get()).docs.map((d) => d.data())])));
  const moves = movesSnap.docs.map((d) => d.data());
  const catalogue = new Map(productsSnap.docs.map((d) => [d.id, { ...d.data(), barcode: d.id }]));
  const branches = new Set([...checks.map((c) => c.branchId || ''), ...moves.map((m) => m.branchId || '')]);
  const out = {};
  for (const b of branches) {
    out[b] = ledgerLevels(
      checks.filter((c) => (c.branchId || '') === b), (c) => items.get(c.id) || [],
      moves.filter((m) => (m.branchId || '') === b), catalogue);
  }
  return out;
}

const levelOut = (storeId, l) => ({
  barcode: l.barcode || l.key,
  name: l.name,
  store_id: storeId,
  in_stock: l.onHand / 1000,
  counted: l.counted == null ? null : l.counted / 1000,
  counted_at: l.countedAt ? new Date(l.countedAt).toISOString() : null,
  in_since_count: l.inSince / 1000,
  out_since_count: l.outSince / 1000,
  reorder_level: l.reorderLevel == null ? null : l.reorderLevel / 1000,
});

app.get('/v1/inventory', wrap(async (req, res) => {
  const byBranch = await stockByBranch(req);
  const store = req.query.store_id;
  let levels;
  if (store !== undefined) levels = (byBranch[String(store)] || []).map((l) => levelOut(String(store), l));
  else if (req.query.combined === 'true') levels = merge(Object.values(byBranch)).map((l) => levelOut(null, l));
  else levels = Object.entries(byBranch).flatMap(([b, list]) => list.map((l) => levelOut(b, l)));
  const barcode = req.query.barcode;
  if (barcode) levels = levels.filter((l) => l.barcode === barcode);
  res.json({ inventory_levels: levels });
}));

/**
 * { inventory_levels: [ { barcode, store_id, stock_after } | { barcode, store_id, received } ] }
 * Recorded as goods received or written off -- movements, like everything
 * else that changes stock -- so the history shows that the API did it.
 */
app.post('/v1/inventory', wrap(async (req, res) => {
  const list = req.body?.inventory_levels;
  if (!Array.isArray(list) || !list.length) throw new ApiError(400, 'Send { "inventory_levels": [ ... ] }');
  if (list.length > 250) throw new ApiError(400, 'At most 250 levels per request.');
  const byBranch = await stockByBranch(req);
  const now = Date.now();
  const batch = db.batch();
  const results = [];
  for (const entry of list) {
    const storeId = String(entry?.store_id ?? '');
    const current = (byBranch[storeId] || []).find((l) => l.key === String(entry?.barcode ?? '').trim());
    const change = stockChange(entry, current ? current.onHand : 0);
    if (change) {
      batch.set(col(req, 'movements').doc(), {
        barcode: change.barcode, productName: current?.name || '', branchId: change.branchId, type: change.type,
        quantityMilli: change.quantityMilli, at: now, source: 'API', reference: req.tokenName, note: '',
        createdByUid: `api:${req.tokenName}`, createdByName: `API · ${req.tokenName}`, createdAt: now,
      });
    }
    const before = current ? current.onHand : 0;
    const after = change ? before + (change.type === 'RECEIVE' ? change.quantityMilli : -change.quantityMilli) : before;
    results.push({ barcode: String(entry.barcode).trim(), store_id: storeId, in_stock: after / 1000, changed: !!change });
  }
  await batch.commit();
  res.json({ inventory_levels: results });
}));

// --------------------------------------------------------------- receipts

app.get('/v1/receipts', wrap(async (req, res) => {
  const size = pageSize(req.query.limit);
  let q = col(req, 'sales');
  const min = req.query.created_at_min ? Date.parse(req.query.created_at_min) : null;
  const max = req.query.created_at_max ? Date.parse(req.query.created_at_max) : null;
  if (Number.isNaN(min) || Number.isNaN(max)) throw new ApiError(400, 'created_at_min / created_at_max must be ISO dates, e.g. 2026-10-01T00:00:00Z');
  if (min != null) q = q.where('createdAt', '>=', min);
  if (max != null) q = q.where('createdAt', '<', max);
  if (req.query.store_id !== undefined) q = q.where('branchId', '==', String(req.query.store_id));
  q = q.orderBy('createdAt', 'desc').limit(size + 1);
  if (req.query.cursor) {
    const at = await col(req, 'sales').doc(String(req.query.cursor)).get();
    if (at.exists) q = q.startAfter(at);
  }
  const docs = (await q.get()).docs;
  res.json({
    receipts: docs.slice(0, size).map((d) => receiptOut(d.id, d.data())),
    cursor: docs.length > size ? docs[size - 1].id : null,
  });
}));

// -------------------------------------------------------------- customers

app.get('/v1/customers', wrap(async (req, res) => {
  const { docs, cursor } = await page(col(req, 'customers'), req);
  res.json({ customers: docs.map((d) => customerOut(d.id, d.data())), cursor });
}));

app.post('/v1/customers', wrap(async (req, res) => {
  const { id, fields } = customerIn(req.body);
  const now = Date.now();
  const ref = id ? col(req, 'customers').doc(id) : col(req, 'customers').doc();
  if (id) {
    if (!(await ref.get()).exists) throw new ApiError(404, 'No customer with that id.');
    await ref.set({ ...fields, updatedAt: now }, { merge: true });
  } else {
    await ref.set({ ...fields, points: 0, visits: 0, totalSpentSen: 0, createdAt: now, updatedAt: now, createdByUid: `api:${req.tokenName}` });
  }
  const snap = await ref.get();
  res.json(customerOut(snap.id, snap.data()));
}));

// ------------------------------------------------------ categories, stores

app.get('/v1/categories', wrap(async (req, res) => {
  const snap = await col(req, 'pos').doc('categories').get();
  res.json({ categories: (snap.data()?.list || []).map((c) => ({ id: c.id, name: c.name, color: c.color || null })) });
}));

app.get('/v1/stores', wrap(async (req, res) => {
  const config = (await col(req, 'meta').doc('config').get()).data() || {};
  res.json({
    stores: [{ id: '', name: 'Main shop' }, ...(config.branches || []).map((b) => ({ id: b.id, name: b.name, active: b.active !== false }))],
  });
}));

// ----------------------------------------------------------------- errors

app.use((req, res) => res.status(404).json({ error: { message: `No such endpoint: ${req.method} ${req.path}` } }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err instanceof ApiError ? err.status : (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ error: { message: status === 500 ? 'Something went wrong on our side.' : err.message } });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => console.log(`Pos Stock Check API on :${port}`));
