/**
 * The Stock Check POS API's shapes: what goes out, what is accepted in.
 * Pure -- no Firebase -- so it is tested on its own (lib.test.mjs).
 *
 * Field names are snake_case, like most public APIs and like Loyverse's,
 * so anyone who has connected a till before recognises them. Money is whole
 * sen (RM 15.90 is 1590); quantities are plain numbers (1.25 kg is 1.25).
 */
import { createHash } from 'node:crypto';

export const MAX_PAGE = 250;

export const sha256 = (text) => createHash('sha256').update(String(text)).digest('hex');

/** "Bearer sck_..." -> the token, or null. */
export function bearer(header) {
  const match = /^Bearer\s+(sck_[A-Za-z0-9_-]{20,})\s*$/.exec(header || '');
  return match ? match[1] : null;
}

/** ?limit= clamped to 1..250, default 50. */
export function pageSize(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, MAX_PAGE);
}

const qty = (milli) => (milli == null ? null : milli / 1000);
const milli = (n) => Math.round(Number(n) * 1000);
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

export function itemOut(id, p) {
  return {
    barcode: id,
    name: p.name || '',
    sku: p.sku || '',
    other_barcodes: p.altBarcodes || [],
    category_id: p.category || null,
    unit: p.unit || 'pcs',
    price_sen: p.priceSen ?? null,
    cost_sen: p.costSen ?? null,
    track_stock: p.trackStock !== false,
    available_for_sale: p.active !== false,
    reorder_level: qty(p.reorderLevelMilli ?? null),
    photo_url: p.photoUrl || null,
    updated_at: iso(p.updatedAt),
  };
}

/**
 * An item someone sent, as the fields to write -- only the fields they
 * sent, so updating a price does not wipe a photo. Throws on what cannot be
 * stored.
 */
export function itemIn(body) {
  const barcode = String(body?.barcode ?? '').trim();
  if (!barcode) throw new ApiError(400, 'barcode is required');
  if (barcode.includes('/') || barcode.length > 200) throw new ApiError(400, `barcode "${barcode}" is not usable`);
  const fields = {};
  const str = (key, to) => { if (body[key] !== undefined) fields[to] = String(body[key] ?? '').trim(); };
  const sen = (key, to) => {
    if (body[key] === undefined) return;
    if (body[key] === null) { fields[to] = null; return; }
    if (!Number.isInteger(body[key]) || body[key] < 0) throw new ApiError(400, `${key} must be a whole number of sen`);
    fields[to] = body[key];
  };
  str('name', 'name');
  str('sku', 'sku');
  str('unit', 'unit');
  str('category_id', 'category');
  sen('price_sen', 'priceSen');
  sen('cost_sen', 'costSen');
  if (body.track_stock !== undefined) fields.trackStock = !!body.track_stock;
  if (body.available_for_sale !== undefined) fields.active = !!body.available_for_sale;
  if (Array.isArray(body.other_barcodes)) fields.altBarcodes = body.other_barcodes.map((c) => String(c).trim()).filter(Boolean);
  if (body.reorder_level !== undefined) fields.reorderLevelMilli = body.reorder_level === null ? null : milli(body.reorder_level);
  return { barcode, fields };
}

export function receiptOut(id, s) {
  return {
    id,
    receipt_number: s.receiptNo,
    status: s.status,
    created_at: iso(s.createdAt),
    store_id: s.branchId || '',
    employee: s.cashierName || '',
    order_type: s.orderType || 'RETAIL',
    table: s.table || null,
    customer_id: s.customerId || null,
    line_items: (s.lines || []).map((l) => ({
      barcode: l.barcode,
      name: l.name,
      quantity: qty(l.qtyMilli),
      price_sen: l.unitPriceSen,
      discount_sen: l.discountSen || 0,
      total_sen: l.lineTotalSen,
      modifiers: (l.modifiers || []).map((m) => ({ group: m.group || '', name: m.name, price_sen: m.priceSen || 0 })),
      note: l.note || '',
    })),
    subtotal_sen: s.subtotalSen,
    discounts: (s.discounts || []).map((d) => ({ name: d.name, amount_sen: d.amountSen })),
    service_charge_sen: s.serviceChargeSen || 0,
    tax_sen: s.taxSen || 0,
    tax_included: !!s.taxIncluded,
    rounding_sen: s.roundingSen || 0,
    total_sen: s.totalSen + (s.roundingSen || 0),
    payments: (s.payments || []).map((p) => ({ type: p.method, amount_sen: p.amountSen })),
    change_sen: s.changeSen || 0,
    voided_at: iso(s.voidedAt),
  };
}

export function customerOut(id, c) {
  return {
    id,
    name: c.name || '',
    phone: c.phone || '',
    email: c.email || '',
    note: c.note || '',
    points: c.points || 0,
    visits: c.visits || 0,
    total_spent_sen: c.totalSpentSen || 0,
    last_visit_at: iso(c.lastVisitAt),
    created_at: iso(c.createdAt),
  };
}

export function customerIn(body) {
  const fields = {};
  for (const key of ['name', 'phone', 'email', 'note']) {
    if (body?.[key] !== undefined) fields[key] = String(body[key] ?? '').trim();
  }
  if (!body?.id && !fields.name) throw new ApiError(400, 'name is required for a new customer');
  return { id: body?.id ? String(body.id) : null, fields };
}

/**
 * One stock instruction: { barcode, store_id, stock_after } sets the figure,
 * { barcode, store_id, received } adds a delivery. Returns the movement to
 * record, or null when nothing changes.
 */
export function stockChange(entry, onHandMilli) {
  const barcode = String(entry?.barcode ?? '').trim();
  if (!barcode) throw new ApiError(400, 'barcode is required');
  const storeId = String(entry?.store_id ?? '');
  if (entry.stock_after !== undefined) {
    const after = Number(entry.stock_after);
    if (!Number.isFinite(after)) throw new ApiError(400, 'stock_after must be a number');
    const diff = milli(after) - onHandMilli;
    if (diff === 0) return null;
    return { barcode, branchId: storeId, type: diff > 0 ? 'RECEIVE' : 'WRITE_OFF', quantityMilli: Math.abs(diff) };
  }
  if (entry.received !== undefined) {
    const got = Number(entry.received);
    if (!Number.isFinite(got) || got <= 0) throw new ApiError(400, 'received must be above 0');
    return { barcode, branchId: storeId, type: 'RECEIVE', quantityMilli: milli(got) };
  }
  throw new ApiError(400, 'each inventory level needs stock_after or received');
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
