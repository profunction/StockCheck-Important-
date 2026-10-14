/**
 * Reading a spreadsheet someone already has -- an Excel file (.xlsx) or a
 * CSV -- into rows of text, and finding which column is which by its
 * heading in English, Chinese or Malay. The same headings and rules the
 * JSOX Barcode Scan app uses (SheetMapping.kt, ImportRepository.kt), so a
 * count sheet that loads on the phone loads here. Pure; no library.
 */
import { parseExpiry } from './counting.js';

// ------------------------------------------------------------------- CSV

/** CSV (or semicolon / tab separated) to rows of cells, quotes understood. */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const sep = [',', ';', '\t'].map((c) => [c, firstLine.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ------------------------------------------------------------------ XLSX

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The files of a zip, read from its central directory: { name: Uint8Array }. */
export async function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(dataAt, dataAt + size);
    out[name] = method === 0 ? raw : await inflate(raw);
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const textOf = (xml) => unescapeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** The first sheet of an Excel workbook as rows of text. */
export async function parseXlsx(bytes) {
  const files = await unzip(bytes);
  const dec = new TextDecoder();
  const read = (name) => (files[name] ? dec.decode(files[name]) : '');
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  // The first sheet in the workbook's own order, not the first file name.
  const firstId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(read('xl/workbook.xml'))?.[1];
  const target = firstId && new RegExp(`<Relationship\\b[^>]*Id="${firstId}"[^>]*Target="([^"]+)"`).exec(read('xl/_rels/workbook.xml.rels'))?.[1];
  const sheetName = target ? `xl/${target.replace(/^\/?xl\//, '')}` : Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  const xml = read(sheetName);
  const rows = [];
  for (const r of xml.matchAll(/<row\b[^>]*?(?:\br="(\d+)")?[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNo = r[1] ? Number(r[1]) - 1 : rows.length;
    const cells = [];
    for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] || '';
      const body = c[2] || '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (v != null) value = unescapeXml(v);
      cells[ref ? colIndex(ref) : cells.length] = value;
    }
    rows[rowNo] = Array.from(cells, (x) => x ?? '');
  }
  return Array.from(rows, (x) => x ?? []);
}

/** Either kind of file, told apart by its first bytes (a zip starts PK). */
export async function readCells(bytes) {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return parseXlsx(bytes);
  return parseCsv(new TextDecoder().decode(bytes));
}

// ------------------------------------------------------------- headings

/** "Item Code" and "item_code" and "商品 编码" are one heading. */
export const normaliseHeader = (s) => String(s || '').toLowerCase().replace(/[\s_\-./()#:：]+/g, '');

const ROLES = {
  barcode: ['barcode', 'barcodes', 'ean', 'ean13', 'upc', 'gtin', 'itembarcode', 'productbarcode', '条码', '条形码', '商品条码', 'kodbar'],
  sku: ['sku', 'itemcode', 'productcode', 'stockcode', 'itemno', 'code', 'partno', 'ref', 'reference', '货号', '编号', '商品编码', '编码', 'kod', 'kodproduk', 'koditem'],
  name: ['name', 'itemname', 'productname', 'product', 'item', 'description', 'itemdescription', 'stockdescription', 'desc', '品名', '名称', '商品', '商品名称', '产品', 'nama', 'namaproduk', 'namabarang', 'barang', 'produk'],
  unit: ['unit', 'uom', 'units', '单位', 'unitukuran'],
  expected: ['expected', 'expectedqty', 'expectedquantity', 'systemqty', 'systemquantity', 'onhand', 'qtyonhand', 'instock', 'stock', 'stockqty', 'balance', 'qty', 'quantity', '应盘', '系统数量', '库存', '账面数量', '数量', 'kuantiti', 'bakistok', 'stokdijangka'],
  expiry: ['expiry', 'expires', 'expirydate', 'expiration', 'expirationdate', 'bestbefore', 'bbdate', 'exp', 'expdate', 'useby', '有效期', '到期日', '保质期', 'tarikhluput'],
};

/** Which column holds what: { barcode: 0, expected: 3, ... }, the first match of each. */
export function mapColumns(headers) {
  const keys = headers.map(normaliseHeader);
  const out = {};
  for (const [role, words] of Object.entries(ROLES)) {
    // An exact heading beats one that only appears in the list later.
    let best = -1;
    let bestRank = Infinity;
    keys.forEach((k, i) => {
      if (Object.values(out).includes(i)) return;
      const rank = words.indexOf(k);
      if (rank >= 0 && rank < bestRank) { best = i; bestRank = rank; }
    });
    if (best >= 0) out[role] = best;
  }
  return out;
}

/** The heading row: the one in the first 20 that names the most columns we know. */
export function findHeader(cells) {
  let best = -1;
  let score = -1;
  cells.slice(0, 20).forEach((row, i) => {
    if (row.filter((c) => String(c).trim()).length < 2) return;
    const known = row.filter((c) => Object.values(ROLES).some((w) => w.includes(normaliseHeader(c)))).length;
    if (known * 100 - i > score) { score = known * 100 - i; best = i; }
  });
  return best >= 0 ? best : cells.findIndex((r) => r.some((c) => String(c).trim()));
}

/** "1,200", " 3.5 ", "(2)" to thousandths; null for a blank or not-a-number. */
export function parseQuantity(raw) {
  let s = String(raw ?? '').trim().replace(/\s/g, '');
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  s = s.replace(/,(?=\d{3}(\D|$))/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return sign * Math.round(Number(s) * 1000);
}

/** An Excel date number (days since 1900) or dd/mm/yyyy text to midnight UTC. */
function expiryCell(raw) {
  const s = String(raw ?? '').trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) return Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000;
  return parseExpiry(s);
}

/**
 * A count sheet -- what the shop's own system says should be on the shelf --
 * as lines to seed a count with, and the lines it could not use, by line
 * number. A blank expected figure is a problem, not a zero: zero is a stock
 * level someone stated.
 */
export function countSheetRows(cells) {
  const h = findHeader(cells);
  if (h < 0) return { rows: [], problems: ['no-header'], headers: [] };
  const headers = cells[h].map((x) => String(x).trim());
  const cols = mapColumns(headers);
  const code = cols.barcode ?? cols.sku;
  if (code == null) return { rows: [], problems: ['no-barcode'], headers };
  if (cols.expected == null) return { rows: [], problems: ['no-expected'], headers };
  const rows = [];
  const problems = [];
  const cell = (row, i) => (i == null ? '' : String(row[i] ?? '').trim());
  cells.slice(h + 1).forEach((row, i) => {
    if (!row.some((c) => String(c).trim())) return;
    const line = h + 2 + i;
    const barcode = cell(row, code);
    if (!barcode) { problems.push(`${line}: no barcode`); return; }
    const expected = parseQuantity(cell(row, cols.expected));
    if (expected == null) { problems.push(`${line}: ${barcode} — no expected quantity`); return; }
    rows.push({ barcode, name: cell(row, cols.name), sku: cols.barcode != null ? cell(row, cols.sku) : '', unit: cell(row, cols.unit), expected, expiresAt: expiryCell(cell(row, cols.expiry)), line });
  });
  return { rows, problems, headers };
}
