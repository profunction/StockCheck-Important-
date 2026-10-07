/**
 * ESC/POS: the bytes a thermal receipt printer understands, for printing
 * straight to it (USB or serial, see rawprint.js) rather than through the
 * browser's print box. Straight printing is what opens the cash drawer --
 * the drawer hangs off the printer and opens on a pulse the printer sends.
 *
 * Pure: builds bytes, sends nothing (escpos.test.mjs). Text is printed in
 * the printer's own font, which has no Chinese; a receipt with Chinese
 * names is printed as a picture instead (rasterImage, from a canvas).
 */
import { formatQty, formatSen } from './money.js';

const ESC = 0x1b;
const GS = 0x1d;

export const INIT = [ESC, 0x40];
export const CUT = [GS, 0x56, 0x42, 0x00]; // feed to the cutter and cut (partial)
const ALIGN = { left: [ESC, 0x61, 0], center: [ESC, 0x61, 1], right: [ESC, 0x61, 2] };
const BOLD = (on) => [ESC, 0x45, on ? 1 : 0];
const SIZE = (big) => [GS, 0x21, big ? 0x11 : 0x00]; // double width and height
const FEED = (n) => [ESC, 0x64, n];

/**
 * Opens the cash drawer: ESC p 0 25 250 -- pin 2, a 50 ms pulse, 500 ms off.
 * The drawer plugs into the printer's RJ11 "DK" port.
 */
export function generateCashDrawerBuffer() {
  return Uint8Array.of(0x1b, 0x70, 0x00, 0x19, 0xfa);
}

/** Characters per line in the standard font: 58 mm paper 32, 80 mm 48. */
export const columnsFor = (paperWidth) => (Number(paperWidth) === 58 ? 32 : 48);

/** Printable ASCII only; anything else becomes '?' (see rasterImage for Chinese). */
export function ascii(text) {
  return String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
}

/** [left] and [right] on one line of [width], the right one flush right. */
export function twoCols(left, right, width) {
  const r = String(right);
  const room = Math.max(1, width - r.length - 1);
  const l = String(left).length > room ? String(left).slice(0, room) : String(left);
  return l + ' '.repeat(width - l.length - r.length) + r;
}

/** Words wrapped to [width]; a word longer than a line is cut. */
export function wrap(text, width) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    for (let w = word; w; w = w.slice(width)) {
      const piece = w.slice(0, width);
      if (!line) line = piece;
      else if (line.length + 1 + piece.length <= width) line += ` ${piece}`;
      else { out.push(line); line = piece; }
      if (w.length <= width) break;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

const dt = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const METHOD = { CASH: 'Cash', QR: 'DuitNow QR', CARD: 'Card', EWALLET: 'E-wallet', POINTS: 'Points' };

/**
 * A receipt as lines: { text, align, bold, big }. The same content as the
 * printed-from-the-browser receipt (receipt.js), in fixed-width text.
 */
export function receiptLines(sale, { width = 48, settings = {} } = {}) {
  const L = [];
  const add = (text, o = {}) => L.push({ text, align: 'left', ...o });
  const rule = () => add('-'.repeat(width));
  if (settings.shopName) add(settings.shopName, { align: 'center', bold: true, big: true });
  for (const x of [settings.regNo, settings.address, settings.phone]) if (x) wrap(x, width).forEach((t) => add(t, { align: 'center' }));
  if (settings.sstNo) add(`SST: ${settings.sstNo}`, { align: 'center' });
  rule();
  add(twoCols(sale.receiptNo || '', dt(sale.createdAt || 0), width));
  if (sale.cashierName) add(`Cashier: ${sale.cashierName}`);
  if (sale.tillName) add(`Till: ${sale.tillName}`);
  if (sale.table) add(`Table: ${sale.table}`);
  if (sale.customerName) add(`Member: ${sale.customerName}`);
  rule();
  const anyExempt = (sale.lines || []).some((l) => Array.isArray(l.taxIds) && l.taxIds.length === 0) && (sale.taxes || []).length > 0;
  for (const l of sale.lines || []) {
    const mark = anyExempt && Array.isArray(l.taxIds) && l.taxIds.length === 0 ? '*' : '';
    wrap(`${l.name}${mark ? ' *' : ''}`, width).forEach((t) => add(t));
    for (const m of l.modifiers || []) add(`  + ${m.name || m}`);
    add(twoCols(`  ${formatQty(l.qtyMilli)} x ${formatSen(l.unitPriceSen)}${l.discountSen ? ` -${formatSen(l.discountSen)}` : ''}`, formatSen(l.lineTotalSen ?? 0), width));
  }
  rule();
  add(twoCols('Subtotal', formatSen(sale.subtotalSen || 0), width));
  if (sale.discountSen) add(twoCols('Discount', `-${formatSen(sale.discountSen)}`, width));
  if (sale.serviceChargeSen) add(twoCols('Service charge', formatSen(sale.serviceChargeSen), width));
  for (const x of sale.taxes || []) add(twoCols(`${x.name} ${x.pct}%${sale.taxIncluded ? ' (incl.)' : ''}`, formatSen(x.taxSen), width));
  if (sale.roundingSen) add(twoCols('Rounding', formatSen(sale.roundingSen), width));
  add(twoCols('TOTAL', formatSen((sale.totalSen || 0) + (sale.roundingSen || 0)), Math.floor(width / 2)), { bold: true, big: true });
  for (const p of sale.payments || []) add(twoCols(METHOD[p.method] || p.method, formatSen(p.amountSen), width));
  if (sale.changeSen) add(twoCols('Change', formatSen(sale.changeSen), width));
  if (anyExempt) add('* tax-free item');
  if (sale.pointsEarned) add(`Points +${sale.pointsEarned}, balance ${sale.pointsBalance ?? ''}`);
  if (sale.status === 'VOIDED') add('*** VOIDED ***', { align: 'center', bold: true });
  if (settings.footer) { add(''); wrap(settings.footer, width).forEach((t) => add(t, { align: 'center' })); }
  return L;
}

/** A shift slip (see shift.js calculateShiftSummary) as lines. */
export function shiftLines(shift, { width = 48, settings = {} } = {}) {
  const s = shift.summary || shift;
  const L = [];
  const add = (text, o = {}) => L.push({ text, align: 'left', ...o });
  const row = (a, sen) => add(twoCols(a, formatSen(sen || 0), width));
  if (settings.shopName) add(settings.shopName, { align: 'center', bold: true });
  add('SHIFT REPORT', { align: 'center', bold: true, big: true });
  add('-'.repeat(width));
  add(`Cashier: ${shift.operatorName || shift.operatorId || ''}`);
  if (shift.branchName) add(`Branch: ${shift.branchName}`);
  add(`Open:  ${dt(shift.openedAt || 0)}`);
  if (shift.closedAt) add(`Close: ${dt(shift.closedAt)}`);
  add('-'.repeat(width));
  add(twoCols('Receipts', String(s.salesCount || 0), width));
  row('Gross sales', s.grossSen);
  row('Discounts', -(s.discountsSen || 0));
  add(twoCols(`Voids (${s.voidCount || 0})`, formatSen(s.voidsSen || 0), width));
  add('-'.repeat(width));
  row('Cash', s.byMethod?.CASH);
  row('DuitNow QR', s.byMethod?.QR);
  row('Card', s.byMethod?.CARD);
  row('E-wallet', s.byMethod?.EWALLET);
  if (s.byMethod?.POINTS) row('Points', s.byMethod.POINTS);
  add('-'.repeat(width));
  row('Opening float', s.floatSen);
  row('+ Cash sales', s.cashSalesSen);
  if (s.cashInSen) row('+ Cash in', s.cashInSen);
  if (s.cashOutSen) row('- Cash out', -s.cashOutSen);
  add(twoCols('Expected cash', formatSen(s.expectedCashSen || 0), width), { bold: true });
  if (shift.actualCashSen != null) {
    row('Counted cash', shift.actualCashSen);
    add(twoCols(shift.shortOverSen < 0 ? 'SHORT' : shift.shortOverSen > 0 ? 'OVER' : 'Short/over', formatSen(shift.shortOverSen || 0), width), { bold: true });
  }
  add('');
  add('Signature: ______________________');
  return L;
}

/**
 * Picture data for a raster print (GS v 0): [bits] is one entry per pixel,
 * row by row, truthy for black; [width] in pixels (a multiple of 8 is best:
 * 384 for 58 mm, 576 for 80 mm).
 */
export function rasterImage(bits, width) {
  const bytesPerRow = Math.ceil(width / 8);
  const height = Math.ceil(bits.length / width);
  const out = [GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, height & 0xff, height >> 8];
  for (let y = 0; y < height; y++) {
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        const x = bx * 8 + b;
        if (x < width && bits[y * width + x]) byte |= 0x80 >> b;
      }
      out.push(byte);
    }
  }
  return out;
}

/**
 * The whole print job, as bytes for the printer.
 *
 * [receiptData]: a sale, or a closed shift when [options.kind] is 'shift'.
 * [options]: { paperWidth: 58 | 80, openDrawer, settings, kind, raster,
 * cut }. The drawer pulse goes first, so the drawer opens while the
 * receipt prints. [raster]: { bits, width } to print a picture of the
 * receipt instead of its text (for Chinese).
 */
export function buildPrintJob(receiptData, options = {}) {
  const { paperWidth = 80, openDrawer = false, settings = {}, kind = 'receipt', raster = null, cut = true, copies = 1 } = options;
  const width = columnsFor(paperWidth);
  const bytes = [...INIT];
  if (openDrawer) bytes.push(...generateCashDrawerBuffer());
  for (let c = 0; c < Math.max(1, copies); c++) {
    if (raster) {
      bytes.push(...ALIGN.center, ...rasterImage(raster.bits, raster.width));
    } else {
      const lines = kind === 'shift' ? shiftLines(receiptData, { width, settings }) : receiptLines(receiptData, { width, settings });
      for (const l of lines) {
        bytes.push(...ALIGN[l.align || 'left'], ...BOLD(l.bold), ...SIZE(l.big));
        for (const ch of ascii(l.text)) bytes.push(ch.charCodeAt(0));
        bytes.push(0x0a);
      }
      bytes.push(...BOLD(false), ...SIZE(false), ...ALIGN.left);
    }
    bytes.push(...FEED(4));
    if (cut) bytes.push(...CUT);
  }
  return Uint8Array.from(bytes);
}
