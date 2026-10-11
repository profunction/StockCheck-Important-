// node web/js/tms.test.mjs -- the lorries, the drivers and the trips.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysTo, hoursText, kmDriven, nextStatuses, nextStop, onDuty, papersDue, shiftMinutes, stopsToPlan, tripProgress } from './tms.js';

test('stops waiting for a lorry: transfers approved or on their way, reservations held, not already on a trip', () => {
  const transfers = [
    { id: 't1', transferNo: 'TR-1', fromBranch: 'gudang', toBranch: 'ipoh', status: 'SENT', sentAt: 30, lines: [{ qtyMilli: 3000 }] },
    { id: 't2', transferNo: 'TR-2', fromBranch: 'gudang', toBranch: 'kl', status: 'APPROVED', approvedAt: 10, lines: [] },
    { id: 't3', transferNo: 'TR-3', fromBranch: 'gudang', toBranch: 'kl', status: 'RECEIVED', lines: [] },
    { id: 't4', transferNo: 'TR-4', fromBranch: 'ipoh', toBranch: 'kl', status: 'SENT', lines: [] },
    { id: 't5', transferNo: 'TR-5', fromBranch: 'gudang', toBranch: 'kl', status: 'SENT', sentAt: 5, lines: [] },
  ];
  const reservations = [{ id: 'r1', reservationNo: 'RSV-1', branchId: 'gudang', forWhom: 'Restoran Ali', status: 'OPEN', createdAt: 20, lines: [{ qtyMilli: 2000 }] }];
  const trips = [
    { status: 'ON_ROAD', stops: [{ kind: 'TRANSFER', refId: 't5', status: 'PENDING' }] },
    { status: 'CANCELLED', stops: [{ kind: 'TRANSFER', refId: 't2' }] },
  ];
  const got = stopsToPlan({ transfers, reservations, trips }, 'gudang');
  assert.deepEqual(got.map((s) => [s.ref, s.kind, s.to, s.units]), [['TR-2', 'TRANSFER', 'kl', 0], ['RSV-1', 'RESERVATION', 'Restoran Ali', 2000], ['TR-1', 'TRANSFER', 'ipoh', 3000]]);
  // A stop that failed on a finished trip waits for another lorry.
  const again = stopsToPlan({ transfers, trips: [{ status: 'DONE', stops: [{ kind: 'TRANSFER', refId: 't1', status: 'FAILED' }] }] }, 'gudang');
  assert.ok(again.some((s) => s.ref === 'TR-1'));
});

test('a trip\'s progress, its next stop and what it may become', () => {
  const trip = { status: 'ON_ROAD', stops: [{ ref: 'A', status: 'DELIVERED' }, { ref: 'B', status: 'PENDING' }, { ref: 'C' }] };
  assert.deepEqual(tripProgress(trip), { total: 3, delivered: 1, failed: 0, left: 2, finished: false });
  assert.equal(nextStop(trip).ref, 'B');
  assert.deepEqual(nextStatuses(trip), []);
  trip.stops[1].status = 'FAILED';
  trip.stops[2].status = 'DELIVERED';
  assert.equal(tripProgress(trip).finished, true);
  assert.equal(nextStop(trip), null);
  assert.deepEqual(nextStatuses(trip), ['DONE']);
  assert.deepEqual(nextStatuses({ status: 'PLANNED', stops: [] }), ['CANCELLED']);
  assert.deepEqual(nextStatuses({ status: 'PLANNED', stops: [{}] }), ['LOADING', 'CANCELLED']);
  assert.deepEqual(nextStatuses({ status: 'LOADING', stops: [{}] }), ['ON_ROAD', 'PLANNED']);
  assert.deepEqual(nextStatuses({ status: 'DONE' }), []);
});

test('papers running out: road tax, insurance, licence', () => {
  const now = Date.parse('2026-10-11T10:00:00+08:00');
  assert.equal(daysTo('2026-10-11', now), 0);
  assert.equal(daysTo('2026-10-21', now), 10);
  assert.equal(daysTo('2026-10-10', now), -1);
  assert.equal(daysTo('', now), null);
  const lorry = { roadTaxExpiry: '2026-12-31', insuranceExpiry: '2026-10-20', inspectionExpiry: '2026-10-01' };
  assert.deepEqual(papersDue(lorry, ['roadTaxExpiry', 'insuranceExpiry', 'inspectionExpiry'], { now }).map((x) => [x.key, x.days]), [['inspectionExpiry', -10], ['insuranceExpiry', 9]]);
});

test('shifts: hours, kilometres, who is on duty', () => {
  assert.equal(shiftMinutes({ inAt: 0, outAt: 425 * 60000 }), 425);
  assert.equal(shiftMinutes({ inAt: 1000 }, 1000 + 90 * 60000), 90);
  assert.equal(hoursText(425), '7h 05m');
  assert.equal(kmDriven({ odoIn: 1000, odoOut: 1180 }), 180);
  assert.equal(kmDriven({ odoIn: 1000 }), null);
  assert.equal(kmDriven({ odoIn: 1000, odoOut: 900 }), null);
  const { drivers, lorries } = onDuty([
    { id: 'a', driverId: 'd1', lorryId: 'l1', inAt: 1, outAt: 5 },
    { id: 'b', driverId: 'd1', lorryId: 'l2', inAt: 6 },
    { id: 'c', driverId: 'd2', lorryId: '', inAt: 7 },
  ]);
  assert.equal(drivers.get('d1').id, 'b');
  assert.equal(drivers.get('d2').id, 'c');
  assert.deepEqual([...lorries.keys()], ['l2']);
});
