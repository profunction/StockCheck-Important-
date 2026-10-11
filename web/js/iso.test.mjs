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
