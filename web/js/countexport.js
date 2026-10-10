/**
 * Stock counts as a spreadsheet, and two moments compared -- the same
 * columns and the same rules as the SuXin Barcode Scan app (ExportService.kt,
 * ExportModels.kt, StockComparison.kt), so a file from the web and one from
 * the phone line up column for column. Pure.
 */
import { counted, daysToExpiry, expectedOf, formatExpiry, unlisted, variance } from './counting.js';

const q = (milli) => {
  const n = Math.round(milli) / 1000;
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
};
const STATUS = { DRAFT: 'Draft', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', REVIEWED: 'Reviewed', LOCKED: 'Locked' };
const two = (n) => String(n).padStart(2, '0');
const date = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
const time = (ms) => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())}`; };

/** The app's Finding column, in English like the app writes it. */
export function findingCell(item, now = Date.now()) {
  const days = daysToExpiry(item.expiresAt ?? null, now);
  if (days != null && days < 0) return `EXPIRED ${formatExpiry(item.expiresAt)}`;
  if (days != null && days <= 30) return `Expires in ${days}d`;
  if (unlisted(item)) return 'Not on sheet';
  if (!item.onList) return '';
  const v = variance(item);
  if (v === 0) return 'Match';
  return v < 0 ? `Short ${q(-v)}` : `Over ${q(v)}`;
}

export const STANDARD = [
  ['refNo', 'Ref No'], ['date', 'Date'], ['time', 'Time'], ['worker', 'Worker'], ['template', 'Template'], ['branch', 'Branch'], ['zone', 'Area'],
  ['status', 'Status'], ['barcode', 'Barcode'], ['product', 'Product'], ['sku', 'SKU'], ['expected', 'Expected'], ['quantity', 'Quantity'],
  ['variance', 'Variance'], ['finding', 'Finding'], ['expiry', 'Expires'], ['unit', 'Unit'], ['remark', 'Remark'], ['source', 'Entered by'],
];
const NUMERIC = new Set(['expected', 'quantity', 'variance']);

/** The template fields marked for export, as extra columns ("field:temp"). */
export function fieldColumns(templates) {
  const seen = new Map();
  for (const t of templates) for (const f of t?.fields || []) if (f.includeInExport !== false && !seen.has(f.key)) seen.set(f.key, [`field:${f.key}`, f.label]);
  return [...seen.values()];
}

/**
 * Rows for a sheet: the header, then one row per counted line of every
 * count given ([{ check, items }]). Numbers stay numbers so Excel can add them.
 */
export function exportRows(counts, columns = STANDARD, now = Date.now()) {
  const value = (key, c, it) => {
    if (key.startsWith('field:')) return (it.fieldValues || {})[key.slice(6)] || '';
    switch (key) {
      case 'refNo': return c.refNo || '';
      case 'date': return c.createdAt ? date(c.createdAt) : '';
      case 'time': return it.createdAt ? time(it.createdAt) : '';
      case 'worker': return c.createdByName || '';
      case 'template': return c.templateName || '';
      case 'branch': return c.branchName || '';
      case 'zone': return c.zone || '';
      case 'status': return STATUS[c.status] || c.status || '';
      case 'barcode': return it.barcode || '';
      case 'product': return it.productName || '';
      case 'sku': return it.sku || '';
      case 'expected': return it.onList ? expectedOf(it) / 1000 : '';
      case 'quantity': return counted(it) / 1000;
      case 'variance': return it.onList ? variance(it) / 1000 : '';
      case 'finding': return findingCell(it, now);
      case 'expiry': return formatExpiry(it.expiresAt ?? null);
      case 'unit': return it.unit || '';
      case 'remark': return it.remark || '';
      case 'source': { const s = String(it.source || 'MANUAL').toLowerCase(); return s[0].toUpperCase() + s.slice(1); }
      default: return '';
    }
  };
  const rows = [columns.map(([, header]) => header)];
  for (const { check, items } of counts) {
    for (const it of [...items].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) rows.push(columns.map(([key]) => value(key, check, it)));
  }
  return rows;
}

/** Rows as CSV text, quoted where needed, with a BOM so Excel reads Chinese right. */
export function toCsv(rows) {
  const cell = (v) => { const s = typeof v === 'number' ? q(v * 1000) : String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
export const isNumericColumn = (key) => NUMERIC.has(key);

// ------------------------------------------------------------ comparing

const FINISHED = new Set(['COMPLETED', 'REVIEWED', 'LOCKED']);
export const isFinished = (c) => FINISHED.has(c.status);
export const takenAt = (c) => c.completedAt ?? c.createdAt;

/** A product's key across counts: its barcode, or its name where it has none. */
export function productKey(item) {
  const b = String(item.barcode || '').trim();
  if (b) return b;
  const n = String(item.productName || '').trim().toLowerCase();
  return n ? `name:${n}` : null;
}

/**
 * What was on the shelves according to some counts: for each area, the
 * latest count of each product there; the areas then add up. Two counts of
 * one aisle do not double it; counts of two aisles do add.
 */
export function snapshot(counts) {
  const latest = new Map();
  const labels = new Map();
  const sorted = [...counts].sort((a, b) => takenAt(a.check) - takenAt(b.check) || (a.check.createdAt || 0) - (b.check.createdAt || 0));
  for (const { check, items } of sorted) {
    const area = `${check.branchId || ''}\u0000${String(check.zone || '').trim().toLowerCase()}`;
    const byKey = new Map();
    for (const it of items) { const k = productKey(it); if (k) byKey.set(k, [...(byKey.get(k) || []), it]); }
    for (const [k, lines] of byKey) {
      latest.set(`${area}\u0001${k}`, lines.reduce((s, l) => s + counted(l), 0));
      const last = lines[lines.length - 1];
      const prev = labels.get(k);
      labels.set(k, { key: k, barcode: String(last.barcode || '').trim(), name: String(last.productName || '').trim() || prev?.name || '', unit: String(last.unit || '').trim() || prev?.unit || '' });
    }
  }
  const out = new Map();
  for (const [k, qty] of latest) {
    const key = k.split('\u0001')[1];
    out.set(key, { ...labels.get(key), quantity: (out.get(key)?.quantity || 0) + qty });
  }
  return out;
}

const ORDER = { up: 0, down: 0, new: 1, gone: 2, same: 3 };

/** Before against after, biggest changes first: up, down, new, not counted, same. */
export function compareSnapshots(before, after) {
  const keys = new Set([...before.keys(), ...after.keys()]);
  const rows = [...keys].map((key) => {
    const b = before.get(key);
    const a = after.get(key);
    const kind = !b ? 'new' : !a ? 'gone' : a.quantity > b.quantity ? 'up' : a.quantity < b.quantity ? 'down' : 'same';
    return { key, barcode: (a || b).barcode, name: a?.name || b?.name || '', unit: a?.unit || b?.unit || '', before: b?.quantity ?? null, after: a?.quantity ?? null, change: b && a ? a.quantity - b.quantity : null, kind };
  });
  return rows.sort((x, y) => ORDER[x.kind] - ORDER[y.kind] || Math.abs(y.change || 0) - Math.abs(x.change || 0) || (x.name || x.barcode).toLowerCase().localeCompare((y.name || y.barcode).toLowerCase()));
}

export function summarise(rows) {
  const n = (k) => rows.filter((r) => r.kind === k).length;
  return { beforeTotal: rows.reduce((s, r) => s + (r.before || 0), 0), afterTotal: rows.reduce((s, r) => s + (r.after || 0), 0), up: n('up'), down: n('down'), same: n('same'), new: n('new'), gone: n('gone') };
}

/** The finished counts of one calendar month ('2026-10'), optionally one branch. */
export function countsInMonth(checks, month, branchId = null) {
  return checks.filter((c) => {
    if (!isFinished(c) || (branchId && c.branchId !== branchId)) return false;
    const d = new Date(takenAt(c));
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}` === month;
  });
}

/** Free-text search across what a person calls a count. */
export function matchesSearch(c, text) {
  const needle = String(text || '').trim().toLowerCase();
  if (!needle) return true;
  return [c.refNo, c.zone, c.branchName, c.templateName, c.createdByName, c.note].some((x) => String(x || '').toLowerCase().includes(needle));
}
