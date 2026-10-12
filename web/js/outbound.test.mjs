// node web/js/outbound.test.mjs -- every order going out, from made to signed for.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allLoaded, dockBoard, laneBoard, outboundOrders, packKey, stageCounts, stageOf } from './outbound.js';

const tr = { kind: 'TRANSFER', status: 'APPROVED' };
const rs = { kind: 'RESERVATION', status: 'OPEN' };

test('each step the warehouse records moves the order along', () => {
  assert.equal(stageOf({ order: tr }), 'CREATED');
  assert.equal(stageOf({ order: tr, pick: { status: 'WAITING' } }), 'PICKING');
  assert.equal(stageOf({ order: tr, pick: { status: 'PICKING' } }), 'PICKING');
  assert.equal(stageOf({ order: tr, pick: { status: 'DONE' } }), 'PACKING');
  assert.equal(stageOf({ order: tr, pick: { status: 'DONE' }, pack: { status: 'PACKED' } }), 'PACKED');
  const trip = { id: 't1', status: 'LOADING' };
  assert.equal(stageOf({ order: tr, pack: { status: 'LOADED', tripId: 't1' }, trip }), 'LOADED');
  assert.equal(stageOf({ order: tr, pack: { status: 'LOADED', tripId: 't1' }, trip: { ...trip, status: 'ON_ROAD' }, stop: { status: 'PENDING' } }), 'ON_ROAD');
  assert.equal(stageOf({ order: tr, trip: { ...trip, status: 'ON_ROAD' }, stop: { status: 'DELIVERED' } }), 'DELIVERED');
  assert.equal(stageOf({ order: { ...tr, status: 'RECEIVED' } }), 'DELIVERED');
  assert.equal(stageOf({ order: { ...rs, status: 'DELIVERED' } }), 'DELIVERED');
});

test('sent without one of our lorries is on the road all the same', () => {
  assert.equal(stageOf({ order: { ...tr, status: 'SENT' } }), 'ON_ROAD');
});

test('a stop that failed comes back to its lane, not "loaded"', () => {
  const back = { id: 't1', status: 'DONE' };
  assert.equal(stageOf({ order: rs, pack: { status: 'LOADED', tripId: 't1' }, trip: back, stop: { status: 'FAILED' } }), 'PACKED');
  // Loaded on an earlier lorry, now on a new one not loaded yet.
  assert.equal(stageOf({ order: rs, pack: { status: 'LOADED', tripId: 't1' }, trip: { id: 't2', status: 'PLANNED' } }), 'PACKED');
});

test('the board: what leaves this place, urgent first, then first in first out', () => {
  const now = Date.UTC(2026, 9, 12);
  const data = {
    transfers: [
      { id: 'a', transferNo: 'TR-A', fromBranch: 'gd', toBranch: 'ipoh', status: 'APPROVED', approvedAt: 1, lines: [{ qtyMilli: 3000 }] },
      { id: 'b', transferNo: 'TR-B', fromBranch: 'gd', toBranch: 'kl', status: 'DRAFT', createdAt: 2, lines: [] },
      { id: 'c', transferNo: 'TR-C', fromBranch: 'kl', toBranch: 'gd', status: 'APPROVED', createdAt: 3, lines: [] },
      { id: 'd', transferNo: 'TR-D', fromBranch: 'gd', toBranch: 'kl', status: 'RECEIVED', createdAt: 4, receivedAt: now - 10 * 86_400_000 },
    ],
    reservations: [{ id: 'r', reservationNo: 'RSV-1', branchId: 'gd', forWhom: 'Ali', status: 'OPEN', createdAt: 5, lines: [{ qtyMilli: 2000 }] }],
    picklists: [
      { id: 'p0', status: 'CANCELLED', orders: [{ kind: 'TRANSFER', id: 'a' }], createdAt: 5 },
      { id: 'p1', status: 'DONE', orders: [{ kind: 'TRANSFER', id: 'a' }], createdAt: 6 },
    ],
    packs: [{ kind: 'RESERVATION', orderId: 'r', status: 'OPEN', urgent: true }],
  };
  const list = outboundOrders(data, 'gd', { now });
  assert.deepEqual(list.map((o) => o.ref), ['RSV-1', 'TR-A']);
  assert.equal(list[0].urgent, true);
  assert.equal(list[0].stage, 'CREATED');
  assert.equal(list[1].stage, 'PACKING');
  assert.equal(list[1].pick.id, 'p1');
  assert.equal(list[1].key, packKey('TRANSFER', 'a'));
  assert.equal(list[1].units, 3000);
  assert.deepEqual(stageCounts(list), { CREATED: 1, PICKING: 0, PACKING: 1, PACKED: 0, LOADED: 0, ON_ROAD: 0, DELIVERED: 0 });
});

test('the docks: a lorry at its bay with its orders, the rest wait in the yard', () => {
  const orders = [
    { kind: 'TRANSFER', id: 'a', ref: 'TR-A', stage: 'PACKED', pack: { status: 'PACKED', lane: 'S2' } },
    { kind: 'RESERVATION', id: 'r', ref: 'RSV-1', stage: 'LOADED', pack: { status: 'LOADED', tripId: 't1' } },
    { kind: 'TRANSFER', id: 'x', ref: 'TR-X', stage: 'PACKED', pack: { status: 'PACKED', lane: 'S9' } },
  ];
  const trips = [
    { id: 't1', branchId: 'gd', status: 'LOADING', dock: 'OUT-2', stops: [{ kind: 'RESERVATION', refId: 'r' }, { kind: 'TRANSFER', refId: 'a' }] },
    { id: 't2', branchId: 'gd', status: 'PLANNED', createdAt: 9, stops: [{ kind: 'TRANSFER', refId: 'x' }] },
    { id: 't3', branchId: 'gd', status: 'ON_ROAD', dock: 'OUT-1', stops: [] },
    { id: 't4', branchId: 'kl', status: 'PLANNED', stops: [] },
  ];
  const b = dockBoard(trips, orders, 'gd');
  assert.equal(b.docks[1].trip.id, 't1');
  assert.deepEqual(b.docks[1].orders.map((o) => o.ref), ['RSV-1', 'TR-A']);
  assert.equal(b.docks[0].trip, null);
  assert.deepEqual(b.free, ['OUT-1', 'OUT-3', 'OUT-4']);
  assert.deepEqual(b.yard.map((y) => y.trip.id), ['t2']);
  assert.equal(allLoaded(b.docks[1].trip, b.docks[1].orders), false);
  orders[0].pack = { status: 'LOADED', tripId: 't1' };
  assert.equal(allLoaded(b.docks[1].trip, b.docks[1].orders), true);
  const lanes = laneBoard(orders.map((o) => ({ ...o, stage: o.ref === 'TR-A' ? 'LOADED' : o.stage })));
  assert.deepEqual(lanes.get('S1').map((o) => o.ref), ['TR-X']);
});
