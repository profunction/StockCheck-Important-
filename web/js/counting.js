/**
 * The arithmetic of a stock count on the web, shared with what the JEXO
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
