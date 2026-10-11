// node connectors.test.mjs -- other systems' data read into ours.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authHeaders, feedUrl, isPrivateIp, mapRecords, pick, safeTarget, toMs, toSen, tripStatus, writesFor } from './connectors.mjs';

test('fields by path; money, quantities and times in every shape', () => {
  assert.equal(pick({ a: { b: [{ c: 7 }] } }, 'a.b.0.c'), 7);
  assert.deepEqual(pick({ a: 1 }, '$'), { a: 1 });
  assert.equal(toSen('RM 12.50'), 1250);
  assert.equal(toSen(1250, 'SEN'), 1250);
  assert.equal(toSen('abc'), 0);
  assert.equal(toMs(1700000000), 1700000000000);
  assert.equal(toMs('1700000000000'), 1700000000000);
  assert.equal(toMs('2026-10-11T02:00:00Z'), Date.parse('2026-10-11T02:00:00Z'));
  assert.equal(toMs('not a date'), null);
});

test('a friend\'s POS sales, through a field map, become our sales and stock going down', () => {
  const body = { result: { rows: [
    { doc_no: 'INV-1', date: '2026-10-11T02:00:00Z', outlet: 'KL', amount: '23.00', pay: 'Cash', items: [{ code: '9555', desc: 'Milo', qty: 2, unit_price: 5.5 }, { code: '', desc: 'Bag', qty: 1, unit_price: 0.2 }] },
    { doc_no: 'INV-2', amount: 5, status: 'VOIDED', items: [] },
    { amount: 1 },
  ] } };
  const map = { list: 'result.rows', id: 'doc_no', receiptNo: 'doc_no', at: 'date', branch: 'outlet', total: 'amount', payment: 'pay', line: { barcode: 'code', name: 'desc', qty: 'qty', price: 'unit_price' } };
  const { records, problems } = mapRecords('sales', body, map);
  assert.equal(records.length, 2);
  assert.deepEqual(problems, ['#3: no id']);
  assert.equal(records[0].totalSen, 2300);
  assert.equal(records[0].lines[0].lineTotalSen, 1100);
  assert.equal(records[1].voided, true);
  const writes = writesFor('sales', records, { id: 'kawan', name: 'Kawan POS', branchMap: { KL: 'kl' } }, 5);
  const sale = writes.find(([p]) => p === 'sales/ext-kawan-INV-1')[1];
  assert.equal(sale.branchId, 'kl');
  assert.equal(sale.status, 'COMPLETED');
  assert.equal(sale.payments[0].method, 'CASH');
  assert.equal(sale.source, 'CONNECTOR');
  // One movement for the line with a barcode; none for the voided sale.
  assert.deepEqual(writes.filter(([p]) => p.startsWith('movements/')).map(([p, d]) => [p, d.quantityMilli, d.type]), [['movements/ext-kawan-INV-1-0', 2000, 'SALE']]);
  assert.equal(writes.find(([p]) => p === 'sales/ext-kawan-INV-2')[1].status, 'VOIDED');
  // A WMS that sends its own stock: the sales leave the stock alone.
  assert.equal(writesFor('sales', records, { id: 'k', moveStock: false }).filter(([p]) => p.startsWith('movements/')).length, 0);
});

test('their stock levels become a count per place; items merge into products', () => {
  const { records } = mapRecords('stock', [{ sku: 'A', qty: 3, loc: 'WH1' }, { sku: 'B', qty: '1.5', loc: 'WH1' }, { qty: 9 }], { list: '', qty: 'qty', branch: 'loc' });
  assert.equal(records.length, 2);
  const now = Date.parse('2026-10-11T02:30:00Z');
  const writes = writesFor('stock', records, { id: 'wms', name: 'Their WMS', branchMap: { WH1: 'gudang' } }, now);
  assert.deepEqual(writes.map(([p]) => p), ['stockChecks/ext-wms-gudang-2026101110', 'stockChecks/ext-wms-gudang-2026101110/items/A', 'stockChecks/ext-wms-gudang-2026101110/items/B']);
  assert.equal(writes[0][1].status, 'COMPLETED');
  assert.equal(writes[2][1].quantityMilli, 1500);
  const items = writesFor('items', mapRecords('items', { data: [{ sku: 'A', name: 'Apple', price: '2.40' }] }).records, { id: 'x' });
  assert.deepEqual(items[0], ['products/A', { barcode: 'A', name: 'Apple', priceSen: 240, updatedAt: items[0][1].updatedAt, source: 'CONNECTOR', connectionId: 'x', connectionName: '' }, true]);
});

test('their deliveries become trips with one stop, in our words', () => {
  assert.equal(tripStatus('Delivered'), 'DONE');
  assert.equal(tripStatus('On road'), 'ON_ROAD');
  assert.equal(tripStatus('Picking'), 'LOADING');
  assert.equal(tripStatus('Created'), 'PLANNED');
  assert.equal(tripStatus('Cancelled'), 'CANCELLED');
  const { records } = mapRecords('deliveries', { data: [{ id: 'DO 1', do_no: 'DO-1', customer: 'Ali', status: 'Delivered', plate: 'wxy 1', driver: 'Ah Seng', received_by: 'Ali' }] });
  const [[path, trip]] = writesFor('deliveries', records, { id: 'tms', name: 'Their TMS', branchId: 'gudang' }, 0);
  assert.equal(path, 'tmsTrips/ext-tms-DO_1');
  assert.equal(trip.status, 'DONE');
  assert.equal(trip.plate, 'WXY 1');
  assert.deepEqual([trip.stops[0].status, trip.stops[0].receivedBy], ['DELIVERED', 'Ali']);
});

test('only public https addresses are fetched; the key goes in a header', () => {
  assert.equal(safeTarget('https://api.kawan.com.my/v1').ok, true);
  for (const bad of ['http://api.kawan.com', 'https://localhost/x', 'https://10.0.0.2/x', 'https://169.254.169.254/latest', 'https://metadata.google.internal/', 'https://u:p@x.com/', 'https://x.com:22/', 'https://[::1]/', 'nonsense']) {
    assert.equal(safeTarget(bad).ok, false, bad);
  }
  assert.equal(isPrivateIp('192.168.1.5'), true);
  assert.equal(isPrivateIp('8.8.8.8'), false);
  assert.deepEqual(authHeaders({ auth: 'HEADER', headerName: 'X-Token' }, 's'), { 'X-Token': 's' });
  assert.deepEqual(authHeaders({}, 's'), { Authorization: 'Bearer s' });
  assert.deepEqual(authHeaders({}, ''), {});
  assert.equal(feedUrl({ baseUrl: 'https://a.com/api' }, { path: 'sales', sinceParam: 'from', sinceFormat: 'ms' }, 5), 'https://a.com/api/sales?from=5');
});
