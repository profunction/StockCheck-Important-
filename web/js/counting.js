/**
 * The arithmetic of a stock count on the web, shared with what the JSOX
 * Count app does (StockRepository.kt, RefNoAllocator.kt), so a count made
 * in either reads the same in both. Pure.
 */

/** The month a reference number belongs to: '2610' for October 2026. */
export function period(date = new Date()) {
  return String(date.getFullYear() % 100).padStart(2, '0') + String(date.getMonth() + 1).padStart(2, '0');
}

/** `RC-16/09/2026-007`: the day it was opened and the month's running number. */
export function refNo(date, seq) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `RC-${dd}/${mm}/${date.getFullYear()}-${String(seq).padStart(3, '0')}`;
}

/** Offline, when no number can be claimed: the day and the time, marked W. */
export function tempRefNo(date) {
  return refNo(date, 0).replace(/-000$/, `-W${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`);
}

/**
 * The line a scan belongs to: one already holding any code the product
 * answers to (a tin and its carton are one line), else none.
 */
export function lineFor(lines, code, product) {
  const codes = new Set([code, ...(product ? [product.barcode, ...(product.altBarcodes || [])] : [])].filter(Boolean).map((c) => String(c).toLowerCase()));
  return lines.find((l) => codes.has(String(l.barcode).toLowerCase())) || null;
}

/** What a line counts, in thousandths (a line from before weighing holds whole units). */
export const counted = (line) => line.quantityMilli ?? (line.quantity || 0) * 1000;

const ZH = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** A Chinese numeral up to 9999: 十二 -> 12, 三百零五 -> 305, 两千 -> 2000. */
function chinese(text) {
  let total = 0;
  let digit = 0;
  let seen = false;
  for (const ch of text) {
    if (ch in ZH) { digit = ZH[ch]; seen = true; continue; }
    const unit = { 十: 10, 百: 100, 千: 1000 }[ch];
    if (!unit) return null;
    total += (digit || (unit === 10 && !seen ? 1 : digit)) * unit;
    digit = 0;
    seen = true;
  }
  return seen ? total + digit : null;
}

/**
 * The quantity in what somebody said: "12", "1.5", "twelve" is not tried,
 * "十二" and "三百零五" are. Returns thousandths, or null when no number
 * was heard.
 */
export function spokenQty(text) {
  const s = String(text || '').trim();
  const d = /(\d+(?:[.,]\d{1,3})?)/.exec(s);
  if (d) return Math.round(Number(d[1].replace(',', '.')) * 1000);
  const m = /[零〇一二两三四五六七八九十百千]+/.exec(s);
  if (!m) return null;
  const n = chinese(m[0]);
  return n == null ? null : n * 1000;
}

// ------------------------------------------------- expected, variance, expiry

/** What the count sheet said should be here, in thousandths (only meaningful on a listed line). */
export const expectedOf = (line) => line.expectedMilli ?? (line.expected || 0) * 1000;

/** Counted minus expected: negative is missing stock, positive is surplus. */
export const variance = (line) => (line.onList ? counted(line) - expectedOf(line) : 0);

/** Counted, but nobody's sheet mentioned it. */
export const unlisted = (line) => !line.onList && counted(line) > 0;

/**
 * Worth a second look before the count is signed off, as the app decides
 * (StockItem.isLargeVariance): none where some was expected, some where none
 * was, or a swing of 20% or more on an expected figure of 5 or more.
 */
export function largeVariance(line) {
  if (!line.onList) return false;
  const exp = expectedOf(line);
  const got = counted(line);
  if (exp === 0) return got > 0;
  if (got === 0) return true;
  if (exp < 5000) return false;
  return Math.abs((got - exp) * 100 / exp) >= 20;
}

const DAY = 86400000;

/** dd/mm/yyyy (or with - or .) to midnight UTC of that day; null when it is not a real date. */
export function parseExpiry(text) {
  const parts = String(text || '').trim().split(/[/.-]/).map((p) => p.trim());
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = parts[2].length <= 2 ? 2000 + Number(parts[2]) : Number(parts[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1970 || year > 9999) return null;
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  // The 31st of February is not quietly turned into the 3rd of March.
  if (back.getUTCDate() !== day || back.getUTCMonth() !== month - 1) return null;
  return ms;
}

/** Midnight UTC back to dd/mm/yyyy; '' for none. */
export function formatExpiry(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** Days until it goes off (negative once past), or null when no date was recorded. */
export function daysToExpiry(ms, now = Date.now()) {
  if (ms == null) return null;
  return Math.floor(ms / DAY) - Math.floor(now / DAY);
}

/**
 * What one line says, in the app's order: an expiry problem first, then
 * whether it was on the sheet and how far off it is. { kind, qty } where
 * kind is expired | soon | unlisted | match | short | over | none.
 */
export function finding(line, now = Date.now()) {
  const days = daysToExpiry(line.expiresAt ?? null, now);
  if (days != null && days < 0) return { kind: 'expired', days };
  if (days != null && days <= 30) return { kind: 'soon', days };
  if (unlisted(line)) return { kind: 'unlisted' };
  if (!line.onList) return { kind: 'none' };
  const v = variance(line);
  if (v === 0) return { kind: 'match' };
  return v < 0 ? { kind: 'short', qty: -v } : { kind: 'over', qty: v };
}

// ----------------------------------------------------------------- signatures

/** Template fields keep their strokes beside the readable value, as the app does. */
export const inkKey = (fieldKey) => `ink#${fieldKey}`;
export const isInkKey = (key) => String(key).startsWith('ink#');

/** Strokes of {x, y} in 0..1 to the app's text: "x,y x,y;x,y ..." in thousandths. */
export function encodeInk(strokes) {
  const q = (v) => Math.trunc(Math.min(1, Math.max(0, v)) * 1000);
  return strokes.filter((s) => s.length).map((s) => s.map((p) => `${q(p.x)},${q(p.y)}`).join(' ')).join(';');
}

export function decodeInk(raw) {
  if (!raw || !String(raw).trim()) return [];
  return String(raw).split(';').map((stroke) => stroke.trim().split(' ').map((pt) => {
    const [x, y] = pt.split(',').map(Number);
    return Number.isInteger(x) && Number.isInteger(y) ? { x: x / 1000, y: y / 1000 } : null;
  }).filter(Boolean)).filter((s) => s.length);
}

/** Enough ink to be a signature rather than a tap. */
export const isSigned = (raw) => decodeInk(raw).reduce((n, s) => n + s.length, 0) >= 4;
