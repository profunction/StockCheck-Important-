/**
 * Money and quantities for the till. Pure: no Firebase, no page, so the
 * arithmetic is tested on its own (money.test.mjs).
 *
 * Money is whole sen and quantities whole thousandths, as everywhere else in
 * Stock Check: RM 15.90 is 1590, 1.25 kg is 1250. Floating-point ringgit
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
 * Everything on a bill, worked out once.
 *
 * - Line totals add up to the subtotal.
 * - The bill discount comes off that (an amount, or a percentage of it).
 * - Service charge, when set, is a percentage of what is left. A restaurant
 *   charges it on dine-in only; the caller decides by passing 0 otherwise.
 * - Tax (SST) is either already inside the prices, in which case it is only
 *   shown, or added on top of the discounted subtotal plus service charge.
 *
 * Every step rounds to the sen once, so the receipt's own lines add up.
 */
export function billTotals(lines, opts = {}) {
  const {
    discountSen = 0,
    discountPct = 0,
    serviceChargePct = 0,
    taxPct = 0,
    pricesIncludeTax = true,
  } = opts;

  const subtotalSen = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const pctOff = Math.round((subtotalSen * discountPct) / 100);
  const billDiscountSen = Math.min(subtotalSen, Math.max(0, discountSen) + Math.max(0, pctOff));
  const afterDiscount = subtotalSen - billDiscountSen;
  const serviceChargeSen = Math.round((afterDiscount * serviceChargePct) / 100);
  const taxable = afterDiscount + serviceChargeSen;

  let taxSen;
  let totalSen;
  if (taxPct <= 0) {
    taxSen = 0;
    totalSen = taxable;
  } else if (pricesIncludeTax) {
    // The tax inside a price: price x rate / (100 + rate).
    taxSen = Math.round((taxable * taxPct) / (100 + taxPct));
    totalSen = taxable;
  } else {
    taxSen = Math.round((taxable * taxPct) / 100);
    totalSen = taxable + taxSen;
  }
  return { subtotalSen, discountSen: billDiscountSen, serviceChargeSen, taxSen, totalSen, taxIncluded: pricesIncludeTax };
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
