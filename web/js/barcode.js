/**
 * Barcodes as bars: EAN-13 for the 13-digit codes on most goods (and the
 * in-store ones the till makes), Code 128 for anything else. Pure: each
 * returns a string of modules, '1' a bar and '0' a gap (barcode.test.mjs).
 */
import { ean13Check } from './money.js';

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const R = L.map((x) => x.replace(/./g, (c) => (c === '0' ? '1' : '0')));
const G = R.map((x) => [...x].reverse().join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export const isEan13 = (code) => /^\d{13}$/.test(code) && ean13Check(code.slice(0, 12)) === code[12];

/** 95 modules: guard, six left digits, centre guard, six right digits, guard. */
export function ean13Modules(code) {
  if (!isEan13(code)) throw new Error(`Not a valid EAN-13: ${code}`);
  const d = [...code].map(Number);
  const parity = PARITY[d[0]];
  let out = '101';
  for (let i = 1; i <= 6; i++) out += (parity[i - 1] === 'L' ? L : G)[d[i]];
  out += '01010';
  for (let i = 7; i <= 12; i++) out += R[d[i]];
  return `${out}101`;
}

// Bar and space widths for each Code 128 value; 103-105 are the starts, 106 the stop.
export const C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 ' +
  '123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 ' +
  '131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 ' +
  '213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 ' +
  '112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 ' +
  '421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ');

const widths = (pattern) => [...pattern].map((w, i) => (i % 2 === 0 ? '1' : '0').repeat(Number(w))).join('');

/** The values a text encodes to: set C for an even run of digits, set B otherwise. */
export function code128Values(text) {
  const s = String(text);
  if (/^\d+$/.test(s) && s.length % 2 === 0) {
    return [105, ...s.match(/\d\d/g).map(Number)];
  }
  if (!/^[\x20-\x7e]*$/.test(s)) throw new Error('Code 128 here takes printable ASCII only');
  return [104, ...[...s].map((c) => c.charCodeAt(0) - 32)];
}

export function code128Modules(text) {
  const values = code128Values(text);
  const check = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103;
  return [...values, check, 106].map((v) => widths(C128[v])).join('');
}

/** The right barcode for [code]: { type, modules }. */
export function barcodeModules(code) {
  return isEan13(code) ? { type: 'EAN13', modules: ean13Modules(code) } : { type: 'CODE128', modules: code128Modules(code) };
}
