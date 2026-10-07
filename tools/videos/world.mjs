/**
 * The pretend shop the guide videos are filmed in: "Kedai Maju" in Ipoh,
 * with a central warehouse, the sample items (with their pictures), two
 * suppliers, counts, an order on its way and a day of sales.
 */
import { DEMO_CATEGORIES, DEMO_ITEMS } from '../../web/js/demo.js';
import { billTotals, receiptNo, roundCash } from '../../web/js/money.js';

const W = 'workspaces/w1/';
const DAY = 24 * 3600 * 1000;
export const now = Date.now();
export const item = (pic) => DEMO_ITEMS.find((p) => p.photoUrl.includes(`/${pic}.svg`));

const products = Object.fromEntries(DEMO_ITEMS.map((p) => {
  const { barcode, ...rest } = p;
  const extra = {
    rice: { reorderLevelMilli: 20000, maxStockMilli: 100000, preferredSupplierId: 's1' },
    eggs: { reorderLevelMilli: 30000, maxStockMilli: 120000, preferredSupplierId: 's1' },
    bread: { reorderLevelMilli: 15000, maxStockMilli: 40000, preferredSupplierId: 's2' },
    tehtarik: { modifierIds: ['sugar', 'egg'] },
  }[p.photoUrl.match(/demo\/(\w+)\.svg/)[1]] || {};
  return [`${W}products/${barcode}`, { ...rest, ...extra, createdAt: now - 30 * DAY, updatedAt: now - 30 * DAY }];
}));

/** A count at [branchId], [daysAgo], of { picture: quantity }. */
function count(id, branchId, daysAgo, qty, extra = {}) {
  const at = now - daysAgo * DAY;
  const out = { [`${W}stockChecks/${id}`]: { status: 'COMPLETED', refNo: id.toUpperCase(), createdAt: at, completedAt: at, branchId, zone: '', createdByUid: 'u2', createdByName: 'Siti', ...extra } };
  Object.entries(qty).forEach(([pic, q], i) => {
    const p = item(pic);
    out[`${W}stockChecks/${id}/items/i${i}`] = { barcode: p.barcode, productName: p.name, quantityMilli: q * 1000, unit: 'pcs' };
  });
  return out;
}

/** A day of sales at the shop, for the reports video. */
function sales() {
  const out = {};
  const menu = ['malt', 'rice', 'water', 'bread', 'noodle', 'coffee', 'milk', 'eggs', 'nasilemak', 'tehtarik', 'roticanai', 'meegoreng'];
  const methods = ['CASH', 'CASH', 'QR', 'CARD', 'EWALLET'];
  let seed = 7;
  const rnd = (n) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * n); };
  const start = new Date(); start.setHours(8, 30, 0, 0);
  for (let i = 0; i < 36; i++) {
    const at = Math.min(now - 60_000, start.getTime() + i * 17 * 60_000);
    const picks = [...new Set(Array.from({ length: 1 + rnd(4) }, () => menu[rnd(menu.length)]))];
    const lines = picks.map((pic) => {
      const p = item(pic);
      const qtyMilli = (1 + rnd(3)) * 1000;
      return { barcode: p.barcode, name: p.name, categoryId: p.category, qtyMilli, unitPriceSen: p.priceSen, discountSen: 0, costSen: p.costSen, modifiers: [], note: '', taxIds: p.taxIds ?? ['sst'], lineTotalSen: Math.round(qtyMilli * p.priceSen / 1000) };
    });
    const totals = billTotals(lines, { taxes: [{ id: 'sst', name: 'SST', pct: 6 }], pricesIncludeTax: false });
    const method = methods[rnd(methods.length)];
    const due = method === 'CASH' ? roundCash(totals.totalSen) : totals.totalSen;
    const paid = method === 'CASH' ? Math.ceil(due / 1000) * 1000 : due;
    out[`${W}sales/s${i}`] = {
      receiptNo: receiptNo(new Date(at)), branchId: 'ipoh', branchName: 'Kedai Ipoh', cashierUid: i % 3 ? 'u1' : 'u2', cashierName: i % 3 ? 'Ah Hock' : 'Siti',
      createdAt: at, status: i === 20 ? 'VOIDED' : 'COMPLETED', orderType: 'RETAIL', table: '', lines,
      subtotalSen: totals.subtotalSen, discounts: [], discountSen: 0, serviceChargeSen: 0, taxSen: totals.taxSen, taxes: totals.taxes, untaxedSen: totals.untaxedSen,
      taxIncluded: false, totalSen: totals.totalSen, roundingSen: due - totals.totalSen, payments: [{ method, amountSen: paid }], paidSen: paid, changeSen: paid - due,
      ...(i === 20 ? { voidedAt: at + 120_000, voidedByName: 'Ah Hock', voidReason: 'Salah item' } : {}),
    };
  }
  return out;
}

/** The starting data for a film; [mode] is the till's mode ('' = not chosen yet). */
export function world({ mode = 'RETAIL', withSales = false, branch = 'ipoh' } = {}) {
  const ordered = { malt: [24, 1250], noodle: [30, 420], milk: [24, 330] };
  return {
    del: [`${W}products/9555012345678`, `${W}products/8888`, `${W}products/2001`, `${W}products/2002`, `${W}products/7777`,
      `${W}stockChecks/sc1`, `${W}stockChecks/sc1/items/i1`],
    set: {
      ...products,
      [`${W}users/u1`]: { displayName: 'Ah Hock', email: 'ahhock@kedaimaju.my', roleId: 'admin', active: true, branchIds: [] },
      [`${W}meta/config`]: { companyName: 'Kedai Maju Sdn Bhd', branches: [
        { id: 'gudang', name: 'Gudang Pusat', active: true, kind: 'WAREHOUSE' },
        { id: 'ipoh', name: 'Kedai Ipoh', active: true, kind: 'STORE' }] },
      [`${W}pos/categories`]: { list: DEMO_CATEGORIES },
      [`${W}pos/suppliers`]: { list: [
        { id: 's1', name: 'Syarikat Borong Maju', contact: 'Mr Tan', phone: '012-345 6789', terms: '30 hari' },
        { id: 's2', name: 'Kilang Roti Sedap', contact: 'Puan Aminah', phone: '05-254 1111', terms: 'COD' }] },
      [`${W}pos/settings`]: {
        shopName: 'Kedai Maju', address: 'No. 12, Jalan Pasar, 30000 Ipoh', phone: '05-241 8888', sstNo: 'W10-1808-32000123',
        footer: 'Terima kasih! 谢谢光临!', mode, taxPct: 0, taxes: [{ id: 'sst', name: 'SST', pct: 6, byDefault: true }],
        pricesIncludeTax: false, serviceChargePct: 10, paymentMethods: ['CASH', 'QR', 'CARD', 'EWALLET'], paperWidth: 80, autoPrint: false,
        tables: ['1', '2', '3', '4', '5', '6', '7', '8'], kitchenTicket: true, loyaltyEnabled: true, pointsPerRinggit: 1, pointValueSen: 1, minRedeemPoints: 100,
      },
      ...count('gc-0918', 'gudang', 4, { malt: 40, rice: 12, sugar: 60, eggs: 25, bread: 10, water: 120, noodle: 45, coffee: 18, milk: 30 }),
      ...count('ic-0919', 'ipoh', 3, { malt: 12, rice: 8, sugar: 20, eggs: 14, bread: 6, water: 48, noodle: 15, coffee: 6, milk: 10 }),
      ...count('ic-0921', 'ipoh', 1, { malt: 9, rice: 8, sugar: 17, eggs: 14, bread: 5, water: 44, noodle: 15, coffee: 4, milk: 10 }, { refNo: 'IC-0921', zone: '' }),
      [`${W}purchaseOrders/po-demo`]: {
        poNo: 'PO-261003-0915-MJ', supplierId: 's1', supplierName: 'Syarikat Borong Maju', branchId: 'gudang', status: 'ORDERED',
        lines: Object.entries(ordered).map(([pic, [q, c]]) => ({ barcode: item(pic).barcode, name: item(pic).name, qtyMilli: q * 1000, costSen: c, receivedMilli: 0 })),
        note: '', expectedAt: now, createdByUid: 'u1', createdByName: 'Ah Hock', createdAt: now - 3 * DAY, approvedByName: 'Ah Hock', approvedAt: now - 3 * DAY,
      },
      ...(withSales ? sales() : {}),
    },
    merge: {},
    branch,
  };
}
