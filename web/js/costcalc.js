/**
 * The cost calculator's sums: what each item really costs once shipping,
 * duty and fees are spread over the order (its "landed cost"), and the
 * price that leaves the margin you want. Pure, in whole sen; tested in
 * costcalc.test.mjs. The warehouse's page is web/wh/cost.js.
 */
import { allocate } from './money.js';

/** Currencies goods are often bought in, with a rough RM rate to start from (the buyer types the real one). */
export const CURRENCIES = [
  ['MYR', 1], ['CNY', 0.62], ['USD', 4.4], ['SGD', 3.3], ['THB', 0.13], ['IDR', 0.00028], ['JPY', 0.03], ['TWD', 0.14], ['HKD', 0.57], ['EUR', 4.8],
];

/**
 * [lines] are { qtyMilli, unitPrice, weightG }: the quantity in thousandths,
 * the price of one in the order's currency (a plain number, "3.85"), and
 * what one weighs in grams (only for spreading by weight). [rate] is RM for
 * one of that currency. [extras] are { sen } costs in RM: shipping, duty,
 * agent, anything. [by] spreads them by 'value', 'qty' or 'weight'; when
 * nothing has a weight (or a value) it falls back to the next way that
 * works. [marginPct] is the gross margin wanted on the selling price.
 */
export function landedCost({ lines, rate = 1, extras = [], by = 'value', marginPct = 0 }) {
  const goods = lines.map((l) => Math.round(((l.qtyMilli || 0) * (Number(l.unitPrice) || 0) * (Number(rate) || 0) * 100) / 1000));
  const extraSen = extras.reduce((n, x) => n + Math.max(0, Math.round(x.sen || 0)), 0);
  const ways = {
    value: goods,
    qty: lines.map((l) => l.qtyMilli || 0),
    weight: lines.map((l) => ((l.qtyMilli || 0) * (Number(l.weightG) || 0)) / 1000),
  };
  const order = [by, 'value', 'qty'].filter((k, i, all) => ways[k] && all.indexOf(k) === i);
  const used = order.find((k) => ways[k].some((w) => w > 0)) || by;
  const spread = allocate(extraSen, ways[used] || goods);
  const out = lines.map((l, i) => {
    const totalSen = goods[i] + spread[i];
    const unitSen = l.qtyMilli ? Math.round((totalSen * 1000) / l.qtyMilli) : 0;
    return { goodsSen: goods[i], extraSen: spread[i], totalSen, unitSen, suggestSen: priceFor(unitSen, marginPct) };
  });
  const goodsSen = goods.reduce((a, b) => a + b, 0);
  return {
    lines: out, goodsSen, extraSen, totalSen: goodsSen + extraSen, by: used,
    extraPct: goodsSen ? Math.round((extraSen / goodsSen) * 1000) / 10 : 0,
  };
}

/** The selling price that leaves [marginPct]% of it as gross profit, up to the next 10 sen; null without a margin. */
export function priceFor(costSen, marginPct) {
  const bp = Math.round((Number(marginPct) || 0) * 100);
  if (bp <= 0 || bp >= 10000 || !costSen) return null;
  // In whole numbers, so RM 7.00 at 30% is RM 10.00 and not RM 10.10.
  return Math.ceil((costSen * 10000) / ((10000 - bp) * 10)) * 10;
}

/** Gross margin of selling at [priceSen] what cost [costSen], in percent to one decimal; null without a price. */
export function marginOf(priceSen, costSen) {
  if (!priceSen) return null;
  return Math.round(((priceSen - costSen) / priceSen) * 1000) / 10;
}

/**
 * The cost to keep after this delivery: the old cost and the new one,
 * weighted by what was already on hand and what arrived. With nothing on
 * hand (or no old cost) it is simply the new cost.
 */
export function averageCost(onHandMilli, oldCostSen, qtyMilli, newCostSen) {
  if (!(onHandMilli > 0) || oldCostSen == null || !(qtyMilli > 0)) return newCostSen;
  return Math.round((onHandMilli * oldCostSen + qtyMilli * newCostSen) / (onHandMilli + qtyMilli));
}
