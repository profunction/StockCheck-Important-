/**
 * Money and quantities for the till. Pure: no Firebase, no page, so the
 * arithmetic is tested on its own (money.test.mjs).
 *
 * Money is whole sen and quantities whole thousandths, as everywhere else in
 * NEXO Count: RM 15.90 is 1590, 1.25 kg is 1250. Floating-point ringgit
 * would put a sen wrong on one receipt in a few hundred, and a till that is a
 * sen out is a till nobody trusts.
 */

export const UNIT = 1000;

/** "15.90" from 1590. */
export function formatSen(sen) {
  const negative = sen < 0;
  const abs = Math.abs(Math.round(sen));
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

/** "RM 15.90" from 1590. */
export function rm(sen) {
  return `RM ${formatSen(sen)}`;
}

/**
 * Sen from what somebody typed: "15.9", "15.90", "RM15", "1,200.50".
 * Null when it is not an amount.
 */
export function parseSen(text) {
  const clean = String(text ?? '').replace(/rm/i, '').replace(/[\s,]/g, '');
  if (!/^-?\d*(\.\d{0,2})?$/.test(clean) || clean === '' || clean === '-' || clean === '.') return null;
  const [whole, frac = ''] = clean.replace('-', '').split('.');
  const sen = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
  return clean.startsWith('-') ? -sen : sen;
}

/** Thousandths from "1", "0.5", "1.250". Null when it is not a quantity. */
export function parseQty(text) {
  const clean = String(text ?? '').replace(/[\s,]/g, '');
  if (!/^\d*(\.\d{0,3})?$/.test(clean) || clean === '' || clean === '.') return null;
  const [whole, frac = ''] = clean.split('.');
  return Number(whole || '0') * UNIT + Number((frac + '000').slice(0, 3));
}

/** "2", "1.25", "0.5" from thousandths. */
export function formatQty(milli) {
  const whole = Math.trunc(milli / UNIT);
  const frac = Math.abs(milli % UNIT);
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(3, '0').replace(/0+$/, '')}`;
}

/** Price of [qtyMilli] at [unitPriceSen] each, to the nearest sen. */
export function lineAmount(qtyMilli, unitPriceSen) {
  return Math.round((qtyMilli * unitPriceSen) / UNIT);
}

/**
 * Cash in Malaysia is rounded to the nearest 5 sen: .01/.02 down, .03/.04
 * up to .05, .06/.07 down to .05, .08/.09 up. Only the cash part of a bill is
 * rounded -- a card or QR payment is charged to the sen.
 */
export function roundCash(sen) {
  return Math.round(sen / 5) * 5;
}

/**
 * The shop's taxes, as a list: [{ id, name, pct, byDefault }].
 *
 * Shops set up before there could be more than one tax have a single
 * taxName / taxPct; that reads as one tax charged on every item, which is
 * what those shops have been charging all along.
 */
export function taxList(settings = {}) {
  if (Array.isArray(settings.taxes)) {
    return settings.taxes.filter((x) => x && x.id && Number(x.pct) > 0).map((x) => ({
      id: String(x.id), name: x.name || 'SST', pct: Number(x.pct), byDefault: x.byDefault !== false,
    }));
  }
  const pct = Number(settings.taxPct) || 0;
  return pct > 0 ? [{ id: 'tax', name: settings.taxName || 'SST', pct, byDefault: true }] : [];
}

/**
 * Which taxes an item is charged. An item someone has set says so itself --
 * an empty list is a tax-free item. One nobody has set (made in the phone
 * app, brought in from Loyverse or an import, or from before taxes were per
 * item) gets the taxes marked as the default.
 */
export function productTaxIds(product, taxes) {
  if (Array.isArray(product?.taxIds)) return product.taxIds.filter((id) => taxes.some((x) => x.id === id));
  return taxes.filter((x) => x.byDefault).map((x) => x.id);
}

/** A percentage as whole hundredths of a percent: 6 -> 600, 6.5 -> 650. */
export const pctBp = (pct) => Math.round((Number(pct) || 0) * 100);

/** [num] / [den] rounded half up, for whole numbers (BigInt), as a Number. */
function roundDiv(num, den) {
  const n = BigInt(num); const d = BigInt(den);
  const sign = (n < 0n) !== (d < 0n) ? -1n : 1n;
  const a = n < 0n ? -n : n; const b = d < 0n ? -d : d;
  return Number(sign * ((2n * a + b) / (2n * b)));
}

/**
 * Shares [totalSen] out over [weights] in whole sen, in proportion, so the
 * shares add up to the total exactly (largest remainder). Used for a bill
 * discount, a service charge or a tax spread over the lines of one bill.
 */
export function allocate(totalSen, weights) {
  const ws = weights.map((w) => BigInt(Math.max(0, Math.round(w))));
  const sum = ws.reduce((a, b) => a + b, 0n);
  if (sum === 0n || !totalSen) return weights.map(() => 0);
  const total = BigInt(totalSen);
  const raw = ws.map((w) => total * w);
  const out = raw.map((r) => r / sum);
  let left = total - out.reduce((a, b) => a + b, 0n);
  const order = raw.map((r, i) => [r % sum, i]).sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] > b[0] ? -1 : 1));
  for (let k = 0; left > 0n; k = (k + 1) % order.length, left -= 1n) out[order[k][1]] += 1n;
  return out.map(Number);
}

/**
 * Everything on a bill, worked out once, in whole sen throughout.
 *
 * - Line totals add up to the subtotal.
 * - The bill discount comes off that (an amount, or a percentage of it),
 *   before any tax.
 * - Service charge, when set, is a percentage of what is left. A restaurant
 *   charges it on dine-in only; the caller decides by passing 0 otherwise.
 * - Each line is taxed by its own taxes (line.taxIds): rice and sugar can be
 *   tax-free on the same bill as a taxed soft drink. The bill discount is
 *   shared out over the lines by their amounts, in whole sen, so a discount
 *   on a mixed bill lowers each tax in proportion. The service charge is
 *   shared out the same way and taxed with each line -- or, given
 *   [serviceChargeTaxIds], taxed as one line of its own by those taxes.
 * - Tax is either already inside the prices, in which case it is only shown,
 *   or added on top.
 *
 * Each tax is rounded to the sen once, over the whole bill (exact fractions,
 * no floating point), and then shared back over the lines, so the receipt
 * and the per-line figures of an e-invoice add up to the same sen.
 */
export function taxEngine(lines, opts = {}) {
  const {
    discountSen = 0,
    discountPct = 0,
    serviceChargePct = 0,
    pricesIncludeTax = true,
    serviceChargeTaxIds = null,
  } = opts;
  // A single rate for every line, as callers passed before taxes were per item.
  const taxes = (opts.taxes || (opts.taxPct > 0 ? [{ id: 'tax', name: 'SST', pct: Number(opts.taxPct) }] : []))
    .map((x) => ({ ...x, bp: pctBp(x.pct) }));
  const idsOf = (line) => (Array.isArray(line.taxIds) ? line.taxIds : opts.taxes ? [] : taxes.map((x) => x.id));

  const nets = lines.map(lineTotal);
  const subtotalSen = nets.reduce((a, b) => a + b, 0);
  const pctOff = roundDiv(subtotalSen * pctBp(discountPct), 10000);
  const billDiscountSen = Math.min(subtotalSen, Math.max(0, Math.round(discountSen)) + Math.max(0, pctOff));
  const discShares = allocate(billDiscountSen, nets);
  const afterLines = nets.map((n, i) => n - discShares[i]);
  const afterDiscount = subtotalSen - billDiscountSen;
  const serviceChargeSen = roundDiv(afterDiscount * pctBp(serviceChargePct), 10000);
  const ownLine = Array.isArray(serviceChargeTaxIds);
  const scShares = ownLine ? lines.map(() => 0) : allocate(serviceChargeSen, afterLines);

  // What each tax is charged on: the lines, then the service charge when it is its own line.
  const parts = lines.map((l, i) => ({ gross: afterLines[i] + scShares[i], sc: scShares[i], ids: idsOf(l) }));
  if (ownLine) parts.push({ gross: serviceChargeSen, sc: serviceChargeSen, ids: serviceChargeTaxIds, isServiceCharge: true });
  parts.forEach((p) => {
    p.own = taxes.filter((x) => p.ids.includes(x.id));
    p.rateBp = p.own.reduce((a, x) => a + x.bp, 0);
  });

  // Sums of fractions kept exact (BigInt), rounded to the sen once at the end.
  const exactSum = (terms) => {
    let num = 0n; let den = 1n;
    for (const [n, d] of terms) { num = num * BigInt(d) + BigInt(n) * den; den *= BigInt(d); }
    return num === 0n ? 0 : roundDiv(num, den);
  };
  const lineTax = parts.map(() => ({}));
  const taxLines = taxes.map((x) => {
    const mine = parts.filter((p) => p.gross && p.own.includes(x));
    const per = (p) => (pricesIncludeTax ? 10000 + p.rateBp : 10000);
    const taxSen = exactSum(mine.map((p) => [p.gross * x.bp, per(p)]));
    // Shared back over the lines by their exact (unrounded) shares.
    const weights = parts.map((p) => (mine.includes(p) ? (p.gross * x.bp * 1e6) / per(p) : 0));
    allocate(taxSen, weights).forEach((v, i) => { if (v) lineTax[i][x.id] = v; });
    // What the tax is charged on: the amounts, less every tax inside them.
    const baseSen = pricesIncludeTax
      ? exactSum(mine.map((p) => [p.gross * 10000, 10000 + p.rateBp]))
      : mine.reduce((sum, p) => sum + p.gross, 0);
    return { id: x.id, name: x.name, pct: x.pct, baseSen, taxSen };
  });
  const taxSen = taxLines.reduce((a, x) => a + x.taxSen, 0);
  const untaxedSen = parts.filter((p) => !p.own.length).reduce((a, p) => a + p.gross, 0);
  const goodsAndCharge = afterDiscount + serviceChargeSen;
  return {
    subtotalSen,
    discountSen: billDiscountSen,
    serviceChargeSen,
    taxSen,
    taxes: taxLines.filter((x) => x.taxSen > 0),
    untaxedSen,
    totalSen: pricesIncludeTax ? goodsAndCharge : goodsAndCharge + taxSen,
    taxIncluded: pricesIncludeTax,
    parts: parts.map((p, i) => ({
      grossSen: p.gross,
      discountSen: p.isServiceCharge ? 0 : discShares[i],
      serviceChargeSen: p.sc,
      taxIds: p.own.map((x) => x.id),
      taxes: lineTax[i],
      taxSen: Object.values(lineTax[i]).reduce((a, v) => a + v, 0),
      isServiceCharge: Boolean(p.isServiceCharge),
    })),
  };
}

/** The bill's totals (see taxEngine), without the per-line detail. */
export function billTotals(lines, opts = {}) {
  const { parts, ...totals } = taxEngine(lines, opts);
  return totals;
}

/** A cart line's amount after its own discount, never below zero. */
export function lineTotal(line) {
  return Math.max(0, lineAmount(line.qtyMilli, line.unitPriceSen) - (line.discountSen || 0));
}

/**
 * What is still owed and what to hand back, given the payments taken so far.
 *
 * When cash is part of the payment, the amount due in cash is rounded to the
 * 5 sen; the rounding is reported so the receipt can show it.
 */
export function settle(totalSen, payments) {
  const nonCash = payments.filter((p) => p.method !== 'CASH').reduce((s, p) => s + p.amountSen, 0);
  const cash = payments.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amountSen, 0);
  const hasCash = payments.some((p) => p.method === 'CASH');
  const cashDue = Math.max(0, totalSen - nonCash);
  const roundedCashDue = hasCash ? roundCash(cashDue) : cashDue;
  const roundingSen = roundedCashDue - cashDue;
  const payable = totalSen + roundingSen;
  const paid = nonCash + cash;
  return {
    payableSen: payable,
    roundingSen,
    paidSen: paid,
    dueSen: Math.max(0, payable - paid),
    changeSen: Math.max(0, paid - payable),
  };
}

/**
 * A receipt number people can read out over the phone: date, time and two
 * random letters, e.g. 261007-143205-K7. Made on the till itself so a sale
 * goes through with the internet down.
 */
export function receiptNo(date = new Date(), random = Math.random) {
  const two = (n) => String(n).padStart(2, '0');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const tag = alphabet[Math.floor(random() * alphabet.length)] + alphabet[Math.floor(random() * alphabet.length)];
  return `${two(date.getFullYear() % 100)}${two(date.getMonth() + 1)}${two(date.getDate())}` +
    `-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}-${tag}`;
}

/**
 * An in-store barcode for something with none -- a plate of nasi lemak, a
 * loose bag of rice. EAN-13 in the 20-29 range GS1 keeps for in-store use,
 * with a correct check digit, so a label printed from it scans anywhere.
 */
export function inStoreBarcode(random = Math.random) {
  let digits = '2' + String(Math.floor(random() * 10));
  while (digits.length < 12) digits += String(Math.floor(random() * 10));
  return digits + ean13Check(digits);
}

export function ean13Check(twelve) {
  const sum = [...twelve].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}
