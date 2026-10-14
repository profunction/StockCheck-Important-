// node web/js/iso.test.mjs -- the 3D pictures' geometry and the warehouse layout.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faces, paintOrder, project, shade, turn } from './iso.js';
import { layout, parseBin } from './warehouse3d.js';

test('a point on the floor and one above it', () => {
  assert.deepEqual(project(0, 0, 0), [0, 0]);
  const [x, y] = project(1, 0, 0);
  assert.ok(x > 0.86 && x < 0.87 && y === 0.5);
  assert.deepEqual(project(0, 0, 2), [0, -2]);
});

test('a quarter turn moves a box around the floor and swaps the floor\'s sides', () => {
  const { box, W, D } = turn({ x: 1, y: 0, w: 2, d: 1 }, 10, 4, 1);
  assert.deepEqual([box.x, box.y, box.w, box.d, W, D], [3, 1, 1, 2, 4, 10]);
  const back = turn({ x: 1, y: 0, w: 2, d: 1 }, 10, 4, 4);
  assert.deepEqual([back.box.x, back.box.y, back.W], [1, 0, 10]);
});

test('painting order: floor tiles first, then back to front, then bottom up', () => {
  const order = paintOrder([{ id: 'front', x: 5, y: 5, w: 1, d: 1, h: 1 }, { id: 'up', x: 0, y: 0, z: 1, w: 1, d: 1, h: 1 },
    { id: 'tile', x: 9, y: 9, w: 1, d: 1, h: 0 }, { id: 'back', x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }]).map((b) => b.id);
  assert.deepEqual(order, ['tile', 'back', 'up', 'front']);
});

test('a flat tile has a top and no sides', () => {
  const f = faces({ x: 0, y: 0, w: 1, d: 1, h: 0 });
  assert.equal(f.top.length, 4);
  assert.equal(f.left, null);
  assert.equal(faces({ x: 0, y: 0, w: 1, d: 1, h: 1 }).right.length, 4);
});

test('colours lighter and darker', () => {
  assert.equal(shade('#808080', 0), '#808080');
  assert.equal(shade('#000', 0.5), '#808080');
  assert.equal(shade('#ffffff', -0.5), '#808080');
});

test('shelf codes read the way warehouses write them', () => {
  assert.deepEqual(parseBin('A1-L1-30'), { code: 'A1-L1-30', rack: 'A1', level: 1, slot: 30 });
  assert.deepEqual(parseBin('k3-l2-08'), { code: 'K3-L2-08', rack: 'K3', level: 2, slot: 8 });
  assert.deepEqual(parseBin('A-03-2'), { code: 'A-03-2', rack: 'A', level: 2, slot: 3 });
  assert.deepEqual(parseBin('B 12'), { code: 'B-12', rack: 'B', level: 1, slot: 12 });
  assert.deepEqual(parseBin('COLD'), { code: 'COLD', rack: 'COLD', level: 1, slot: 1 });
  assert.equal(parseBin('  '), null);
});

test('racks in pairs, every slot and level, the used cells holding their bins', () => {
  const { cells, racks, W, D } = layout([{ code: 'A1-L1-3', p: 'milo' }, { code: 'A1-L2-1', p: 'rice' }, { code: 'a1 l2 01', p: 'salt' }, { code: 'A2-L1-2' }, { code: 'B1-L1-1' }]);
  assert.deepEqual(racks.map((r) => [r.name, r.y, r.w]), [['A1', 0, 3], ['A2', 1, 2], ['B1', 3.6, 1]]);
  assert.equal(W, 3);
  assert.equal(D, 4.6);
  assert.equal(cells.filter((c) => c.rack === 'A1').length, 6);
  const a121 = cells.find((c) => c.rack === 'A1' && c.level === 2 && c.slot === 1);
  assert.deepEqual(a121.bins.map((b) => b.p), ['rice', 'salt']);
  assert.equal(cells.find((c) => c.rack === 'A1' && c.level === 1 && c.slot === 2).bins.length, 0);
  // Very long racks keep only the slots in use.
  const long = layout([{ code: 'Z-1' }, { code: 'Z-500' }]);
  assert.deepEqual(long.cells.map((c) => c.slot), [1, 500]);
});

test('the town: a lot per place on a grid with roads, shops as tall as their sales, lorries on the road', async () => {
  const { cityLayout } = await import('./town.js');
  const { boxes, W, D } = cityLayout([
    { id: '', name: 'HQ', kind: 'STORE', salesSen: 1000 },
    { id: 'kl', name: 'KL', kind: 'STORE', salesSen: 500 },
    { id: 'wh', name: 'Gudang', kind: 'WAREHOUSE', valueSen: 9000 },
  ], [{ from: 'wh', to: 'kl', ref: 'TR-1' }, { from: 'nowhere', to: 'kl', ref: 'TR-2' }]);
  const b = (id) => boxes.find((x) => x.id === id);
  assert.equal(W, 2 * 5.4 + 1.4);
  assert.equal(D, 2 * 5.4 + 1.4);
  assert.equal(b('b-').h, 5);
  assert.equal(b('b-kl').h, 3);
  assert.equal(b('b-wh').h.toFixed(1), '3.1');
  assert.ok(b('lorry-TR-1'));
  assert.equal(b('lorry-TR-2'), undefined);
  assert.equal(boxes.filter((x) => x.road).length, 6);
});

test('the shop floor: a café with its kitchen, tables by state and guests; a shop stocked by category', async () => {
  const { shopLayout, STOCK_COLOR, TABLE_COLOR } = await import('./town.js');
  const b = (l, id) => l.boxes.find((x) => x.id === id);
  const cafe = shopLayout({ fnb: true, cooking: 2, takeaway: 1, tables: [{ name: '1', state: 'eating', guests: 3 }, { name: '2', state: 'free' }], tills: [{ name: 'Till 1', sen: 500 }] });
  assert.equal(b(cafe, 'table-1').color, TABLE_COLOR.eating);
  assert.equal(b(cafe, 'table-2').color, TABLE_COLOR.free);
  assert.equal(cafe.boxes.filter((x) => x.id.startsWith('chair-1-')).length, 4);
  assert.equal(cafe.boxes.filter((x) => x.id.startsWith('guest-1-')).length, 3);
  assert.equal(cafe.boxes.filter((x) => x.id.startsWith('guest-2-')).length, 0);
  assert.equal(cafe.boxes.filter((x) => x.id.startsWith('cook-')).length, 2);
  assert.ok(b(cafe, 'kitchen-line') && b(cafe, 'takeaway-0') && b(cafe, 'cashier-0'));
  // A shop with nothing sold today still has its shelves, full of its products.
  const shop = shopLayout({ aisles: [{ id: 'a', name: 'Drinks', color: '#0ea5e9', sen: 0, products: [{ name: 'Milo', level: 'ok' }, { name: 'Teh', level: 'low' }, { name: 'Kopi', level: 'out' }] }], tills: [] });
  assert.ok(b(shop, 'gondola-a') && b(shop, 'sign-a') && b(shop, 'till-POS') && b(shop, 'door-a'));
  const items = shop.boxes.filter((x) => x.id.startsWith('item-a-'));
  assert.equal(items.length, 48);
  assert.ok(items.some((x) => x.color === STOCK_COLOR.low));
  assert.equal(shop.boxes.filter((x) => x.id.startsWith('cashier-')).length, 0);
});

test('the books as towers: as tall as the amount, overdue on top in red, a loss in red', async () => {
  const { moneyLayout } = await import('./town.js');
  const { boxes, W, D } = moneyLayout([
    { id: 'cash', label: 'Cash', sen: 1000, color: '#14a37f' },
    { id: 'ar', label: 'Owed', sen: 500, lateSen: 250, color: '#2f6fde' },
    { id: 'profit', label: 'Profit', sen: -200, color: '#14a37f' },
    { id: 'zero', label: 'None', sen: 0, color: '#999' },
  ]);
  const b = (id) => boxes.find((x) => x.id === id);
  assert.equal(b('m-cash').h, 4.25);
  assert.equal(b('m-ar').h + b('late-ar').h, 2.25);
  assert.equal(b('late-ar').h, 1);
  assert.equal(b('late-ar').color, '#e5484d');
  assert.equal(b('m-profit').color, '#e5484d');
  assert.equal(b('m-zero').h, 0.25);
  assert.equal(W, 0.6 + 3 * 2.6);
  assert.equal(D, 0.6 + 2 * 2.8);
});
