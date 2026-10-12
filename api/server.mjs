/**
 * The SuXin API.
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
import { getAuth } from 'firebase-admin/auth';
import { levels as ledgerLevels, merge } from './ledger.js';
import {
  ApiError, customerIn, customerOut, itemIn, itemOut, offlineOpIn, pageSize, rateKey, receiptOut, stockChange,
} from './lib.mjs';
import { notifier, sameSecret } from './notify.mjs';
import { mergeOfflineTransactions } from './offline.js';
import { createRateLimiterMiddleware } from './ratelimit.mjs';
import { rateLimit } from 'express-rate-limit';
import { selfOrdering } from './selforder.mjs';
import { orderReader } from './readorder.mjs';
import { myInvoisAssistant } from './myinvois.mjs';
import { can as allowedTo } from './modules.js';
import { authenticate, requireModule, requireScope, tenant } from './middleware.mjs';
import { authHeaders, feedUrl, isPrivateIp, KINDS, mapRecords, safeTarget, writesFor } from './connectors.mjs';
import { bearer, sha256 } from './lib.mjs';
import { lookup } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';

// Secrets arrive from Secret Manager as they were stored; one made with
// `openssl rand | gcloud secrets create` ends in a line break, which would
// make the job key and Telegram's secret never match.
for (const k of ['JOB_KEY', 'TELEGRAM_SECRET', 'TELEGRAM_BOT_TOKEN', 'SMTP_USER', 'SMTP_PASS', 'WEB_PUSH_VAPID_KEY', 'ANTHROPIC_API_KEY']) {
  if (process.env[k] !== undefined) process.env[k] = process.env[k].trim();
}

initializeApp();
const db = getFirestore();
const app = express();
app.disable('x-powered-by');
// Cloud Run's front end is one hop: the caller's own address is the one it adds.
app.set('trust proxy', 1);
// Screenshots for reading an order are bigger than anything else sent here.
const smallJson = express.json({ limit: '2mb' });
const bigJson = express.json({ limit: '16mb' });
app.use((req, res, next) => (req.path === '/app/read-order' ? bigJson : smallJson)(req, res, next));

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
  name: 'SuXin API',
  version: 1,
  docs: 'https://stockcheck-fb58e.web.app/#/integrations/api',
}));
app.get('/health', (_req, res) => res.json({ ok: true }));

// ------------------------------------------------------------------- auth

const lastTouched = new Map();
const plans = new Map();

// Before the token is even looked up, so guessing tokens is slow too.
app.use('/v1', createRateLimiterMiddleware());

/** The company's licence, read at most once a minute per instance. */
async function licenceOf(ws) {
  const hit = plans.get(ws);
  if (hit && Date.now() - hit.at < 60_000) return hit.licence;
  const snap = await db.doc(`licences/${ws}`).get();
  const licence = snap.exists ? snap.data() : null;
  plans.set(ws, { licence, at: Date.now() });
  if (plans.size > 5000) plans.clear();
  return licence;
}

app.use('/v1',
  authenticate({ loadToken: async (hash) => { const snap = await db.doc(`apiTokens/${hash}`).get(); return snap.exists ? snap.data() : null; } }),
  tenant({ loadLicence: licenceOf }),
  requireModule('api'),
  (req, _res, next) => {
    if (Date.now() - (lastTouched.get(req.tokenHash) || 0) > 10 * 60 * 1000) {
      lastTouched.set(req.tokenHash, Date.now());
      db.doc(`apiTokens/${req.tokenHash}`).update({ lastUsedAt: Date.now() }).catch(() => {});
    }
    next();
  });

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

app.get('/v1/items', requireScope('items.read'), wrap(async (req, res) => {
  const { docs, cursor } = await page(col(req, 'products'), req);
  res.json({ items: docs.map((d) => itemOut(d.id, d.data())), cursor });
}));

app.get('/v1/items/:barcode', requireScope('items.read'), wrap(async (req, res) => {
  const snap = await col(req, 'products').doc(req.params.barcode).get();
  if (!snap.exists) throw new ApiError(404, 'No item with that barcode.');
  res.json(itemOut(snap.id, snap.data()));
}));

/** { items: [ { barcode, name, price_sen, ... } ] } or a single item. Up to 250. */
app.post('/v1/items', requireScope('items.write'), wrap(async (req, res) => {
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
  Object.defineProperty(out, 'moves', { value: moves, enumerable: false });
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

app.get('/v1/inventory', requireScope('inventory.read'), wrap(async (req, res) => {
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
app.post('/v1/inventory', requireScope('inventory.write'), wrap(async (req, res) => {
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

// ----------------------------------------------------------- offline sync

/**
 * { transactions: [ ... ] } -- what a till did while it was offline, sent
 * in one go when it is back (see offlineOpIn in lib.mjs for the shape).
 *
 * Merged by offline.js, strictly by time: a sale or movement is added once
 * (sending the same id again is safe), and a stock count taken offline only
 * corrects the stock as it stood at that moment -- sales recorded online
 * after it still count, so nothing newer is overwritten.
 */
app.post('/v1/sync', requireScope('sync.write'), wrap(async (req, res) => {
  const list = req.body?.transactions;
  if (!Array.isArray(list) || !list.length) throw new ApiError(400, 'Send { "transactions": [ ... ] }');
  if (list.length > 200) throw new ApiError(400, 'At most 200 transactions per request.');
  const ops = list.map(offlineOpIn);
  // One till's ids never collide with another's.
  const prefix = `off-${req.tokenKey}-`;
  const docId = (op) => `${prefix}${op.id}`;
  const saleRefs = ops.filter((o) => o.kind === 'SALE' && o.id).map((o) => col(req, 'sales').doc(docId(o)));
  const moveRefs = ops.filter((o) => o.kind === 'MOVEMENT' && o.id).map((o) => col(req, 'movements').doc(docId(o)));
  const [sales, moves] = await Promise.all([
    saleRefs.length ? db.getAll(...saleRefs) : [],
    moveRefs.length ? db.getAll(...moveRefs) : [],
  ]);
  const byBranch = ops.some((o) => o.kind === 'COUNT') ? await stockByBranch(req) : {};
  const counts = {};
  for (const [b, levels] of Object.entries(byBranch)) for (const l of levels) if (l.countedAt) counts[`${l.key}|${b}`] = l.countedAt;
  const result = mergeOfflineTransactions(ops, {
    saleIds: sales.filter((d) => d.exists).map((d) => d.id.slice(prefix.length)),
    movementIds: moves.filter((d) => d.exists).map((d) => d.id.slice(prefix.length)),
    counts,
  });

  const now = Date.now();
  const who = { createdByUid: `api:${req.tokenName}`, createdByName: `API · ${req.tokenName}`, createdAt: now };
  const writes = [];
  const batch = { set: (ref, data) => writes.push([ref, data]) };
  for (const op of result.accepted) {
    if (op.kind === 'SALE') {
      const lines = op.data.lines.map((l) => {
        const qtyMilli = Math.max(0, Math.round(Number(l.quantity || 0) * 1000));
        const unitPriceSen = Number.isInteger(l.price_sen) ? l.price_sen : 0;
        return { barcode: String(l.barcode || ''), name: String(l.name || ''), qtyMilli, unitPriceSen, discountSen: 0,
          lineTotalSen: Math.round((qtyMilli * unitPriceSen) / 1000), taxIds: [] };
      });
      const total = op.data.totalSen ?? lines.reduce((t, l) => t + l.lineTotalSen, 0);
      batch.set(col(req, 'sales').doc(docId(op)), {
        receiptNo: op.data.receiptNo, branchId: op.branchId, cashierUid: who.createdByUid, cashierName: who.createdByName,
        createdAt: op.at, syncedAt: now, status: 'COMPLETED', orderType: 'RETAIL', lines, subtotalSen: total, discountSen: 0,
        serviceChargeSen: 0, taxSen: 0, taxes: [], totalSen: total, roundingSen: 0, payments: [], paidSen: total, changeSen: 0, source: 'API',
      });
      lines.forEach((l, i) => {
        if (!l.barcode || l.qtyMilli <= 0) return;
        batch.set(col(req, 'movements').doc(`${docId(op)}-${i}`), {
          barcode: l.barcode, productName: l.name, branchId: op.branchId, type: 'SALE', quantityMilli: l.qtyMilli,
          at: op.at, source: 'API', reference: op.data.receiptNo, note: 'offline', ...who,
        });
      });
    } else if (op.kind === 'MOVEMENT') {
      const type = ['RECEIVE', 'SALE', 'REFUND', 'WRITE_OFF'].includes(op.data.movementType) ? op.data.movementType : 'SALE';
      batch.set(col(req, 'movements').doc(docId(op)), {
        barcode: op.barcode, productName: '', branchId: op.branchId, type, quantityMilli: op.data.quantityMilli,
        at: op.at, source: 'API', reference: req.tokenName, note: 'offline', ...who,
      });
    } else if (op.kind === 'COUNT') {
      // What the ledger held at the moment of the count: now, less what moved since.
      const level = (byBranch[op.branchId] || []).find((l) => l.key === op.barcode);
      const since = (byBranch.moves || []).filter((m) => (m.branchId || '') === op.branchId && m.barcode === op.barcode && m.at > op.at);
      const SIGN = { RECEIVE: 1, REFUND: 1, TRANSFER_IN: 1, SALE: -1, WRITE_OFF: -1, TRANSFER_OUT: -1 };
      const atThen = (level?.onHand || 0) - since.reduce((t, m) => t + (SIGN[m.type] || 0) * (m.quantityMilli || 0), 0);
      const diff = op.data.quantityMilli - atThen;
      if (diff) {
        batch.set(col(req, 'movements').doc(docId(op)), {
          barcode: op.barcode, productName: level?.name || '', branchId: op.branchId, type: diff > 0 ? 'RECEIVE' : 'WRITE_OFF',
          quantityMilli: Math.abs(diff), at: op.at, source: 'API', reference: req.tokenName, note: 'offline count', ...who,
        });
      }
    }
  }
  // A batch holds 500 writes; a long offline day is sent in several.
  for (let i = 0; i < writes.length; i += 450) {
    const b = db.batch();
    writes.slice(i, i + 450).forEach(([ref, data]) => b.set(ref, data));
    await b.commit();
  }
  res.json({
    accepted: result.accepted.map((o) => ({ id: o.id, type: o.kind.toLowerCase() })),
    skipped: result.skipped.map((x) => ({ id: x.id, reason: x.reason.toLowerCase() })),
  });
}));

// --------------------------------------------------------------- receipts

app.get('/v1/receipts', requireScope('receipts.read'), wrap(async (req, res) => {
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

app.get('/v1/customers', requireScope('customers.read'), wrap(async (req, res) => {
  const { docs, cursor } = await page(col(req, 'customers'), req);
  res.json({ customers: docs.map((d) => customerOut(d.id, d.data())), cursor });
}));

app.post('/v1/customers', requireScope('customers.write'), wrap(async (req, res) => {
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

app.get('/v1/categories', requireScope('items.read'), wrap(async (req, res) => {
  const snap = await col(req, 'pos').doc('categories').get();
  res.json({ categories: (snap.data()?.list || []).map((c) => ({ id: c.id, name: c.name, color: c.color || null })) });
}));

app.get('/v1/stores', requireScope('stores.read'), wrap(async (req, res) => {
  const config = (await col(req, 'meta').doc('config').get()).data() || {};
  res.json({
    stores: [{ id: '', name: 'Main shop' }, ...(config.branches || []).map((b) => ({ id: b.id, name: b.name, active: b.active !== false }))],
  });
}));

// ------------------------------------------------- ordering by QR code
//
// Open to anyone with the shop's code (selforder.mjs): the menu, sending
// an order, and how it is going. Kept slow for one phone: a menu read every
// second at most, and a handful of orders in ten minutes.
const selfOrder = selfOrdering(db);
const limited = (windowMs, limit) => rateLimit({
  windowMs, limit, keyGenerator: rateKey, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { message: 'Too many requests. Wait a minute.' } }),
});
const readLimit = limited(60_000, 90);
const orderLimit = limited(10 * 60_000, 8);
app.get('/public/order/:shop', readLimit, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await selfOrder.menu(req.params.shop));
}));
app.post('/public/order/:shop', orderLimit, wrap(async (req, res) => {
  res.status(201).json(await selfOrder.place(req.params.shop, req.body));
}));
app.get('/public/order/:shop/:id', readLimit, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await selfOrder.status(req.params.shop, req.params.id));
}));

// ------------------------------------------- reading a Pinduoduo screenshot
//
// For the website's own signed-in staff (a Firebase ID token, not an API
// token): who they are, in which company, with what permissions.
async function staffOf(req) {
  const token = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '')?.[1];
  const decoded = token ? await getAuth().verifyIdToken(token).catch(() => null) : null;
  if (!decoded) throw new ApiError(401, 'Sign in again.', 'UNAUTHENTICATED');
  const wsId = (await db.doc(`userIndex/${decoded.uid}`).get()).data()?.workspaceId;
  const user = wsId ? (await db.doc(`workspaces/${wsId}/users/${decoded.uid}`).get()).data() : null;
  if (!user || user.active === false) throw new ApiError(403, 'Not a member of a company.', 'FORBIDDEN');
  const isAdmin = user.roleId === 'admin';
  const role = isAdmin ? null : (await db.doc(`workspaces/${wsId}/roles/${user.roleId || 'none'}`).get()).data();
  return { ws: wsId, uid: decoded.uid, isAdmin, permissions: role?.permissions || [], licence: await licenceOf(wsId) };
}
const reader = orderReader();
app.post('/app/read-order', limited(10 * 60_000, 20), wrap(async (req, res) => {
  const who = await staffOf(req);
  if (!allowedTo(who, 'procurement.purchase')) throw new ApiError(403, 'Your account may not raise purchase orders.', 'FORBIDDEN');
  res.json(await reader.read(req.body?.images));
}));

// --------------------------------------------------- the MyInvois assistant
//
// Any signed-in member of a company with SuXin Tax may ask; the answer is
// looked up on LHDN's own sites each time (myinvois.mjs).
const myInvois = myInvoisAssistant();
app.post('/app/myinvois-ask', limited(10 * 60_000, 30), wrap(async (req, res) => {
  const who = await staffOf(req);
  if (!allowedTo(who, 'tax.view')) throw new ApiError(403, 'The MyInvois assistant comes with SuXin Tax.', 'FORBIDDEN');
  const lang = ['zh', 'en', 'ms'].includes(req.body?.lang) ? req.body.lang : 'zh';
  res.json(await myInvois.ask(req.body?.messages, lang));
}));

// ------------------------------------------- the bot and the morning report

const notify = notifier(db);

// Telegram signs every delivery with the secret given when the webhook was set.
app.post('/telegram', wrap(async (req, res) => {
  if (!sameSecret(req.get('x-telegram-bot-api-secret-token'), process.env.TELEGRAM_SECRET)) {
    return res.status(401).json({ error: { message: 'Not from Telegram.' } });
  }
  // An answer that fails is logged, never retried by Telegram in a loop.
  try { await notify.handleUpdate(req.body); } catch (err) { console.error('telegram', err); }
  res.json({ ok: true });
}));


// ------------------------------------------ connections to other systems
//
// A friend's POS, someone else's WMS or TMS (connectors.mjs). PULL: we fetch
// their API with their key, which only this server ever reads
// (connectionSecrets/). PUSH: they post to /connect/{ws}/{id}/{kind} with a
// push key we made for them (only its hash is kept). An owner sets them up.
const conRef = (ws, id) => db.doc(`workspaces/${ws}/connections/${id}`);
const secretRef = (ws, id) => db.doc(`connectionSecrets/${ws}__${id}`);
const validId = (id) => /^[A-Za-z0-9_-]{1,64}$/.test(String(id || ''));

async function ownerOf(req) {
  const who = await staffOf(req);
  if (!who.isAdmin) throw new ApiError(403, 'Only the owner (admin) sets up connections.', 'FORBIDDEN');
  if (!validId(req.params.id)) throw new ApiError(400, 'No such connection.');
  const snap = await conRef(who.ws, req.params.id).get();
  if (!snap.exists) throw new ApiError(404, 'Save the connection first.');
  return { who, conn: { ...snap.data(), id: snap.id } };
}

/** Their JSON at [feed], from a public https address only, at most 5 MB, within 20 seconds. */
async function fetchFeed(conn, feed, secret, since) {
  const url = feedUrl(conn, feed, since);
  const check = safeTarget(url);
  if (!check.ok) throw new ApiError(400, check.reason);
  const addrs = await lookup(check.url.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new ApiError(400, `${check.url.hostname} could not be found.`);
  if (addrs.some((a) => isPrivateIp(a.address))) throw new ApiError(400, 'Not a public address.');
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'SuXin-Connect/1', ...authHeaders(conn, secret) }, redirect: 'error', signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new ApiError(502, `Their system did not answer (${err.name === 'TimeoutError' ? 'took too long' : 'no connection'}).`);
  }
  if (!res.ok) throw new ApiError(502, `Their system answered ${res.status}${res.status === 401 || res.status === 403 ? ' -- check the key' : ''}.`);
  const text = await res.text();
  if (text.length > 5_000_000) throw new ApiError(502, 'Their answer is too big; ask for fewer records at a time.');
  try { return JSON.parse(text); } catch { throw new ApiError(502, 'Their system did not answer in JSON.'); }
}

async function writeAll(ws, writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const b = db.batch();
    for (const [path, data, merge] of writes.slice(i, i + 400)) b.set(db.doc(`workspaces/${ws}/${path}`), data, merge ? { merge: true } : {});
    await b.commit();
  }
}

/** Fetches every feed of [conn] and writes what came; [dryRun] only reads and maps. */
async function syncConnection(ws, conn, { dryRun = false } = {}) {
  const secret = (await secretRef(ws, conn.id).get()).data()?.value || '';
  const at = Date.now();
  const feeds = [];
  const last = { ...(conn.lastSyncAt || {}) };
  for (const feed of (conn.feeds || []).filter((f) => KINDS.includes(f.kind) && f.on !== false)) {
    try {
      // Ask again from a little before last time: a sale written late is not missed.
      const since = last[feed.kind] ? last[feed.kind] - 10 * 60_000 : null;
      const body = await fetchFeed(conn, feed, secret, since);
      const { records, problems } = mapRecords(feed.kind, body, feed.map || {}, { unit: feed.unit || 'RM' });
      if (dryRun) { feeds.push({ kind: feed.kind, count: records.length, problems: problems.slice(0, 5), sample: records.slice(0, 3), raw: JSON.stringify(body).slice(0, 1500) }); continue; }
      await writeAll(ws, writesFor(feed.kind, records, conn, at));
      last[feed.kind] = at;
      feeds.push({ kind: feed.kind, count: records.length, problems: problems.slice(0, 5) });
    } catch (err) {
      feeds.push({ kind: feed.kind, error: err instanceof ApiError ? err.message : 'Something went wrong.' });
      if (!(err instanceof ApiError)) console.error('connector', ws, conn.id, err);
    }
  }
  const result = { at, feeds, ok: feeds.every((f) => !f.error) };
  if (!dryRun) await conRef(ws, conn.id).set({ lastSyncAt: last, lastResult: result }, { merge: true });
  return result;
}

const connectLimit = limited(10 * 60_000, 30);
app.post('/app/connections/:id/secret', connectLimit, wrap(async (req, res) => {
  const { who, conn } = await ownerOf(req);
  const value = String(req.body?.value ?? '');
  if (value.length > 4000) throw new ApiError(400, 'That key is too long.');
  if (value) await secretRef(who.ws, conn.id).set({ value, updatedAt: Date.now(), updatedBy: who.uid });
  else await secretRef(who.ws, conn.id).delete();
  await conRef(who.ws, conn.id).set({ hasSecret: Boolean(value) }, { merge: true });
  res.json({ ok: true, hasSecret: Boolean(value) });
}));
app.post('/app/connections/:id/test', connectLimit, wrap(async (req, res) => {
  const { who, conn } = await ownerOf(req);
  res.json(await syncConnection(who.ws, conn, { dryRun: true }));
}));
app.post('/app/connections/:id/sync', connectLimit, wrap(async (req, res) => {
  const { who, conn } = await ownerOf(req);
  res.json(await syncConnection(who.ws, conn));
}));
// A new push key, shown once; the old one stops working.
app.post('/app/connections/:id/push-key', connectLimit, wrap(async (req, res) => {
  const { who, conn } = await ownerOf(req);
  const key = `sxc_${randomBytes(24).toString('base64url')}`;
  await db.doc(`connectionSecrets/${who.ws}__${conn.id}__push`).set({ hash: sha256(key), createdAt: Date.now(), createdBy: who.uid });
  await conRef(who.ws, conn.id).set({ hasPushKey: true }, { merge: true });
  res.json({ key });
}));

// What their system sends us: { "data": [ ... ] } or a list, read through the connection's map.
// A push key (sxc_..., from /push-key), not an API token (sck_..., bearer()).
const pushKeyOf = (header) => /^Bearer\s+(sxc_[A-Za-z0-9_-]{16,})\s*$/.exec(header || '')?.[1] || null;
const pushLimit = limited(60_000, 120);
app.post('/connect/:ws/:id/:kind', pushLimit, wrap(async (req, res) => {
  const { ws, id, kind } = req.params;
  if (!validId(ws) || !validId(id) || !KINDS.includes(kind)) throw new ApiError(404, 'No such address.');
  const key = pushKeyOf(req.get('authorization'));
  const stored = key ? (await db.doc(`connectionSecrets/${ws}__${id}__push`).get()).data() : null;
  if (!stored || !sameSecret(sha256(key), stored.hash)) throw new ApiError(401, 'Send the push key: Authorization: Bearer sxc_...', 'UNAUTHENTICATED');
  const snap = await conRef(ws, id).get();
  if (!snap.exists || snap.data().on === false) throw new ApiError(404, 'This connection is off.');
  const conn = { ...snap.data(), id };
  const feed = (conn.feeds || []).find((f) => f.kind === kind && f.on !== false);
  if (!feed) throw new ApiError(400, `This connection does not take ${kind}.`);
  const { records, problems } = mapRecords(kind, req.body, feed.map || {}, { unit: feed.unit || 'RM', max: 2000 });
  const at = Date.now();
  await writeAll(ws, writesFor(kind, records, conn, at));
  await conRef(ws, id).set({ lastSyncAt: { ...(conn.lastSyncAt || {}), [kind]: at }, lastResult: { at, ok: true, feeds: [{ kind, count: records.length, problems: problems.slice(0, 5) }] } }, { merge: true });
  res.json({ accepted: records.length, skipped: problems });
}));

// Books: each day's takings, from the till and from connections, to post as one entry a day.
app.post('/app/books/sales-days', limited(10 * 60_000, 60), wrap(async (req, res) => {
  const who = await staffOf(req);
  if (!allowedTo(who, 'accounting.post')) throw new ApiError(403, 'Your account may not post to the books.', 'FORBIDDEN');
  const from = Math.max(Date.now() - 62 * 86_400_000, Number(req.body?.from) || 0);
  const snap = await db.collection(`workspaces/${who.ws}/sales`).where('createdAt', '>=', from).get();
  const days = {};
  for (const d of snap.docs) {
    const s = d.data();
    if (s.status === 'VOIDED') continue;
    const day = new Date(s.createdAt + 8 * 3600_000).toISOString().slice(0, 10);
    const key = `${day}|${s.connectionId || ''}`;
    const x = days[key] || (days[key] = { day, connectionId: s.connectionId || '', source: s.connectionName || 'POS', receipts: 0, totalSen: 0, taxSen: 0, cashSen: 0, otherSen: 0 });
    x.receipts += 1;
    x.totalSen += s.totalSen || 0;
    x.taxSen += s.taxSen || 0;
    const cash = (s.payments || []).filter((p) => p.method === 'CASH').reduce((t, p) => t + (p.amountSen || 0), 0) - (s.changeSen || 0);
    x.cashSen += Math.max(0, Math.min(s.totalSen || 0, cash));
    x.otherSen = x.totalSen - x.cashSen;
  }
  res.json({ days: Object.values(days).sort((a, b) => b.day.localeCompare(a.day) || a.source.localeCompare(b.source)) });
}));

// Called by Cloud Scheduler (the daily report) and by the deploy (setup),
// with the JOB_KEY secret.
const jobKey = (req, res, next) => (sameSecret(req.get('x-job-key'), process.env.JOB_KEY)
  ? next() : res.status(401).json({ error: { message: 'Wrong job key.' } }));
app.post('/jobs/daily', jobKey, wrap(async (req, res) => {
  res.json(await notify.dailyReports(Number(req.query.now) || Date.now()));
}));
// Every hour: each company's connections that fetch.
app.post('/jobs/connectors', jobKey, wrap(async (_req, res) => {
  const snap = await db.collectionGroup('connections').get();
  const done = [];
  for (const d of snap.docs) {
    const c = d.data();
    if (c.mode !== 'PULL' || c.on === false || !c.baseUrl) continue;
    const ws = d.ref.parent.parent.id;
    const r = await syncConnection(ws, { ...c, id: d.id }).catch((err) => ({ ok: false, error: err.message }));
    done.push({ ws, id: d.id, ok: r.ok });
  }
  res.json({ synced: done.length, failed: done.filter((x) => !x.ok).length });
}));
app.post('/jobs/setup', jobKey, wrap(async (req, res) => {
  const self = process.env.SELF_URL || `https://${req.get('host')}`;
  res.json({ ...(await notify.setupTelegram(self)), ...(await notify.setupPush()) });
}));

// ----------------------------------------------------------------- errors

app.use((req, res) => res.status(404).json({ error: { message: `No such endpoint: ${req.method} ${req.path}` } }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err instanceof ApiError ? err.status : (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ error: {
    message: status === 500 ? 'Something went wrong on our side.' : err.message,
    ...(err.code ? { code: err.code } : {}),
    ...(err.extra || {}),
  } });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => console.log(`SuXin API on :${port}`));
