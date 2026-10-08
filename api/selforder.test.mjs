// node api/selforder.test.mjs -- ordering by QR code: the menu, the lines
// priced by the shop (never by the phone), pickup numbers and the status.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLines, buildMenu, parseShop, selfOrdering, shopSettings, statusFor } from './selforder.mjs';

const W = 'workspaces/w1abcdef/';
const SETTINGS = {
  tables: ['1', '2', 'VIP'], pricesIncludeTax: false, serviceChargePct: 10,
  taxes: [{ id: 'sst', name: 'SST', pct: 6 }],
  selfOrder: { enabled: true, dineIn: true, takeaway: true, message: '欢迎', codes: { '-': 'Secret1234', ipoh: 'IpohCode99' } },
};
const PRODUCTS = [
  { barcode: 'teh', name: 'Teh Tarik', priceSen: 300, costSen: 80, category: 'drink', modifierIds: ['sugar', 'ice'], taxIds: ['sst'] },
  { barcode: 'nasi', name: 'Nasi Lemak', priceSen: 650, category: 'food', taxIds: [], photoUrl: 'https://img.example/nasi.jpg' },
  { barcode: 'old', name: 'Old', priceSen: 100, active: false },
  { barcode: 'open', name: 'Open price', priceSen: null },
  { barcode: 'gone', name: 'Sold out', priceSen: 500, soldOut: true },
];
const MODIFIERS = [
  { id: 'sugar', name: 'Sugar', required: true, multiple: false, options: [{ name: 'Less', priceSen: 0 }, { name: 'None', priceSen: 0 }] },
  { id: 'ice', name: 'Ice', required: false, multiple: true, options: [{ name: 'Ice', priceSen: 20 }, { name: 'Big', priceSen: 50 }] },
  { id: 'unused', name: 'Unused', options: [] },
];
const CATS = [{ id: 'drink', name: 'Minuman' }, { id: 'food', name: 'Makanan' }, { id: 'empty', name: 'Nothing here' }];

test('shop codes, and only the right code for a shop that has it on', () => {
  assert.deepEqual(parseShop('w1abcdef~-~Secret1234'), { ws: 'w1abcdef', branchId: '', secret: 'Secret1234' });
  assert.deepEqual(parseShop('w1abcdef~ipoh~IpohCode99'), { ws: 'w1abcdef', branchId: 'ipoh', secret: 'IpohCode99' });
  assert.equal(parseShop('w1abcdef~-~short'), null);
  assert.equal(parseShop('../etc~-~Secret1234'), null);
  assert.ok(shopSettings(SETTINGS, parseShop('w1abcdef~-~Secret1234')));
  assert.equal(shopSettings(SETTINGS, parseShop('w1abcdef~-~Secret9999')), null, 'a changed code voids old prints');
  assert.equal(shopSettings(SETTINGS, parseShop('w1abcdef~ipoh~Secret1234')), null, 'each branch its own code');
  assert.equal(shopSettings({ ...SETTINGS, selfOrder: { ...SETTINGS.selfOrder, enabled: false } }, parseShop('w1abcdef~-~Secret1234')), null);
});

test('the menu shows what can be sold, and nothing private', () => {
  const m = buildMenu({ products: PRODUCTS, categories: CATS, modifiers: MODIFIERS, settings: SETTINGS, shopName: 'Kedai Maju', so: shopSettings(SETTINGS, parseShop('w1abcdef~-~Secret1234')) });
  assert.deepEqual(m.items.map((i) => i.barcode), ['nasi', 'teh']);
  assert.equal(JSON.stringify(m).includes('costSen'), false);
  assert.deepEqual(m.categories.map((c) => c.id), ['drink', 'food']);
  assert.deepEqual(m.modifiers.map((g) => g.id), ['sugar', 'ice']);
  assert.deepEqual(m.orderTypes, ['DINE_IN', 'TAKEAWAY']);
  assert.deepEqual(m.tables, ['1', '2', 'VIP']);
  assert.equal(m.items[0].photoUrl, 'https://img.example/nasi.jpg');
  assert.equal(m.shop.message, '欢迎');
});

test('lines are priced by the shop, with the options chosen', () => {
  const lines = buildLines([
    { barcode: 'teh', qty: 2, options: { sugar: [0], ice: [0, 1] }, note: ' kurang manis ', priceSen: 1 },
    { barcode: 'nasi', qty: 1 },
  ], { products: PRODUCTS, modifiers: MODIFIERS, settings: SETTINGS });
  assert.equal(lines[0].unitPriceSen, 370, 'the phone said 1 sen; the shop says RM 3.70');
  assert.equal(lines[0].qtyMilli, 2000);
  assert.deepEqual(lines[0].modifiers.map((x) => x.name), ['Less', 'Ice', 'Big']);
  assert.equal(lines[0].note, 'kurang manis');
  assert.deepEqual(lines[0].taxIds, ['sst']);
  assert.deepEqual(lines[1].taxIds, []);
  assert.equal(lines[1].fromQr, true);
  const no = (items, msg) => assert.throws(() => buildLines(items, { products: PRODUCTS, modifiers: MODIFIERS, settings: SETTINGS }), msg);
  no([], /empty/);
  no([{ barcode: 'teh', qty: 1 }], /Choose Sugar/);
  no([{ barcode: 'teh', qty: 1, options: { sugar: [0, 1] } }], /Only one Sugar/);
  no([{ barcode: 'old', qty: 1 }], /no longer on the menu/);
  no([{ barcode: 'gone', qty: 1 }], /no longer on the menu/);
  no([{ barcode: 'nasi', qty: 0 }], /quantity/);
  no([{ barcode: 'nasi', qty: 1.5 }], /quantity/);
  no([{ barcode: 'nasi', qty: 51 }], /quantity/);
  no(Array.from({ length: 41 }, () => ({ barcode: 'nasi', qty: 1 })), /At most/);
});

test('what the customer is told', () => {
  assert.equal(statusFor({ status: 'NEW' }, false), 'NEW');
  assert.equal(statusFor({ status: 'REJECTED' }, false), 'REJECTED');
  assert.equal(statusFor({ status: 'ACCEPTED', mergedInto: 'o1' }, true), 'ACCEPTED');
  assert.equal(statusFor({ status: 'READY', mergedInto: 'o1' }, true), 'READY');
  assert.equal(statusFor({ status: 'ACCEPTED', mergedInto: 'o1' }, false), 'DONE', 'the bill was paid');
});

// ----------------------------------------------- end to end, on a stand-in
function fakeDb(seed) {
  const store = new Map(Object.entries(seed));
  let n = 0;
  const docRef = (path) => ({
    id: path.split('/').pop(), path,
    get: async () => ({ exists: store.has(path), data: () => (store.has(path) ? structuredClone(store.get(path)) : undefined) }),
    set: async (d) => { store.set(path, structuredClone(d)); },
    collection: (name) => colRef(`${path}/${name}`),
  });
  const colRef = (path) => ({
    doc: (id) => docRef(`${path}/${id || `auto${String(++n).padStart(12, '0')}`}`),
    get: async () => ({ docs: [...store.keys()].filter((k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
      .map((k) => ({ id: k.split('/').pop(), data: () => structuredClone(store.get(k)) })) }),
  });
  return {
    store, collection: (name) => colRef(name),
    runTransaction: async (fn) => fn({ get: (ref) => ref.get(), set: (ref, d) => { store.set(ref.path, structuredClone(d)); } }),
  };
}

test('an order sent, numbered, and followed until it is paid', async () => {
  const db = fakeDb({
    [`${W}pos/settings`]: SETTINGS,
    [`${W}meta/config`]: { companyName: 'Kedai Maju', branches: [{ id: 'ipoh', name: 'Ipoh' }] },
    [`${W}pos/modifiers`]: { list: MODIFIERS },
    [`${W}pos/categories`]: { list: CATS },
    ...Object.fromEntries(PRODUCTS.map((p) => [`${W}products/${p.barcode}`, (({ barcode, ...rest }) => rest)(p)])),
  });
  const so = selfOrdering(db, { now: () => Date.UTC(2026, 9, 8, 4) });
  const code = 'w1abcdef~-~Secret1234';
  assert.equal((await so.menu(code)).shop.name, 'Kedai Maju');
  await assert.rejects(so.menu('w1abcdef~-~WrongCode1'), /not on/);

  const a = await so.place(code, { orderType: 'TAKEAWAY', items: [{ barcode: 'nasi', qty: 2 }], name: 'Ali' });
  const b = await so.place(code, { orderType: 'DINE_IN', table: 'VIP', items: [{ barcode: 'teh', qty: 1, options: { sugar: [1] } }] });
  assert.deepEqual([a.pickupNo, b.pickupNo], ['1', '2']);
  await assert.rejects(so.place(code, { orderType: 'DINE_IN', table: '99', items: [{ barcode: 'nasi', qty: 1 }] }), /table/);
  const saved = db.store.get(`${W}selfOrders/${a.id}`);
  assert.equal(saved.status, 'NEW');
  // 2 × RM 6.50; nasi lemak is tax-free, and takeaway has no service charge.
  assert.equal(saved.totalSen, 1300);
  // Teh tarik at the table: RM 3.00 + 10% service + 6% SST on both.
  assert.equal(db.store.get(`${W}selfOrders/${b.id}`).totalSen, 350);
  assert.equal(saved.customerName, 'Ali');

  assert.equal((await so.status(code, a.id)).status, 'NEW');
  // The till accepts it into an open ticket, then it is paid and the ticket goes.
  db.store.set(`${W}selfOrders/${a.id}`, { ...saved, status: 'ACCEPTED', mergedInto: 'ticket1' });
  db.store.set(`${W}orders/ticket1`, { lines: saved.lines });
  assert.equal((await so.status(code, a.id)).status, 'ACCEPTED');
  db.store.delete(`${W}orders/ticket1`);
  assert.equal((await so.status(code, a.id)).status, 'DONE');
  await assert.rejects(so.status('w1abcdef~ipoh~IpohCode99', a.id), /No such order/, 'another branch cannot read it');
});
