// node web/js/countexport.test.mjs -- counts as a spreadsheet, and compared, the app's way.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareSnapshots, countsInMonth, exportRows, fieldColumns, findingCell, matchesSearch, snapshot, STANDARD, summarise, toCsv } from './countexport.js';

const check = (over = {}) => ({ refNo: 'RC-01/10/2026-001', createdAt: new Date(2026, 9, 1, 9, 5).getTime(), createdByName: 'Ali', templateName: 'Chiller', zone: 'A', status: 'COMPLETED', ...over });

test('the Finding column says what the app says', () => {
  const now = Date.UTC(2026, 9, 10);
  assert.equal(findingCell({ onList: true, expectedMilli: 5000, quantityMilli: 3500 }, now), 'Short 1.5');
  assert.equal(findingCell({ onList: true, expectedMilli: 5000, quantityMilli: 6000 }, now), 'Over 1');
  assert.equal(findingCell({ quantityMilli: 2000 }, now), 'Not on sheet');
  assert.equal(findingCell({ quantityMilli: 2000, expiresAt: Date.UTC(2026, 9, 1) }, now), 'EXPIRED 01/10/2026');
  assert.equal(findingCell({ quantityMilli: 2000 , onList: true, expectedMilli: 2000 }, now), 'Match');
});

test('export rows: the app\'s columns, numbers as numbers, the list\'s own fields', () => {
  const cols = [...STANDARD, ...fieldColumns([{ fields: [{ key: 'temp', label: 'Temp' }, { key: 'x', label: 'Hidden', includeInExport: false }] }])];
  const rows = exportRows([{ check: check(), items: [{ barcode: '955', productName: 'Milo', quantityMilli: 2500, onList: true, expectedMilli: 3000, unit: 'pcs', source: 'SCAN', createdAt: new Date(2026, 9, 1, 9, 7).getTime(), fieldValues: { temp: '4' } }] }], cols, Date.UTC(2026, 9, 2));
  assert.equal(rows[0].join('|'), 'Ref No|Date|Time|Worker|Template|Branch|Area|Status|Barcode|Product|SKU|Expected|Quantity|Variance|Finding|Expires|Unit|Remark|Entered by|Temp');
  assert.deepEqual(rows[1], ['RC-01/10/2026-001', '2026-10-01', '09:07', 'Ali', 'Chiller', '', 'A', 'Completed', '955', 'Milo', '', 3, 2.5, -0.5, 'Short 0.5', '', 'pcs', '', 'Scan', '4']);
  assert.equal(toCsv([['a', 'b,c'], [1.5, 'say "x"']]), '﻿a,"b,c"\r\n1.5,"say ""x"""\r\n');
});

test('comparing: the latest count per area, areas add, sorted by change', () => {
  const at = (d) => new Date(2026, 9, d).getTime();
  const before = snapshot([
    { check: { zone: 'A', completedAt: at(1) }, items: [{ barcode: '1', productName: 'Milo', quantityMilli: 10000 }] },
    { check: { zone: 'A', completedAt: at(2) }, items: [{ barcode: '1', productName: 'Milo', quantityMilli: 8000 }] }, // a recount of A replaces
    { check: { zone: 'B', completedAt: at(2) }, items: [{ barcode: '1', quantityMilli: 2000 }, { barcode: '2', productName: 'Rice', quantityMilli: 5000 }] },
  ]);
  assert.equal(before.get('1').quantity, 10000);
  assert.equal(before.get('1').name, 'Milo');
  const after = snapshot([{ check: { zone: 'A', completedAt: at(20) }, items: [{ barcode: '1', quantityMilli: 4000 }, { barcode: '3', productName: 'Salt', quantityMilli: 1000 }] }]);
  const rows = compareSnapshots(before, after);
  assert.deepEqual(rows.map((r) => [r.key, r.kind, r.change]), [['1', 'down', -6000], ['3', 'new', null], ['2', 'gone', null]]);
  assert.deepEqual(summarise(rows), { beforeTotal: 15000, afterTotal: 5000, up: 0, down: 1, same: 0, new: 1, gone: 1 });
});

test('a month\'s finished counts, and searching counts', () => {
  const list = [check({ completedAt: new Date(2026, 9, 3).getTime() }), check({ status: 'IN_PROGRESS' }), check({ completedAt: new Date(2026, 8, 30).getTime(), branchId: 'ipoh' })];
  assert.equal(countsInMonth(list, '2026-10').length, 1);
  assert.equal(countsInMonth(list, '2026-09', 'ipoh').length, 1);
  assert.equal(matchesSearch(check(), 'chil'), true);
  assert.equal(matchesSearch(check(), 'nope'), false);
});
