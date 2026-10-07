// node web/js/plans.test.mjs -- the price list and what each plan switches on.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIFETIME_CAP, PLANS, entitlements, plansIn, priceSen, ringgit } from './plans.js';

test('pack A prices, in sen', () => {
  assert.deepEqual(['STARTER', 'BUSINESS', 'UNLIMITED'].map((p) => [priceSen(p, 'monthly'), priceSen(p, 'yearly'), priceSen(p, 'lifetime')]),
    [[4800, 48000, 168000], [11800, 118000, 418000], [22800, 228000, 798000]]);
  assert.equal(LIFETIME_CAP, 50);
  assert.equal(ringgit(798000), 'RM 7,980');
});

test('pack B prices, and no lifetime', () => {
  assert.deepEqual(['APP_ONLY', 'POS_ONLY', 'API_ONLY'].map((p) => [priceSen(p, 'monthly'), priceSen(p, 'yearly')]),
    [[2800, 28000], [3800, 38000], [6800, 68000]]);
  assert.throws(() => priceSen('POS_ONLY', 'lifetime'), /not sold/);
  assert.equal(plansIn('STANDALONE').length, 3);
  assert.equal(plansIn('ALL_IN_ONE').length, 3);
});

test('what each plan switches on', () => {
  const on = (plan) => entitlements({ plan, status: 'ACTIVE', expiresAt: 0 });
  assert.deepEqual(on('STARTER').modules, { app: true, pos: true, warehouse: true, api: false });
  assert.equal(on('STARTER').multiBranch, false);
  assert.equal(on('BUSINESS').loyverse, true);
  assert.equal(on('UNLIMITED').modules.api, true);
  assert.equal(on('APP_ONLY').modules.pos, false);
  assert.equal(on('APP_ONLY').loyverse, true);
  assert.equal(on('APP_ONLY').seats, 3);
  assert.equal(on('POS_ONLY').modules.app, false);
  assert.equal(on('POS_ONLY').tills, 2);
  assert.deepEqual(on('API_ONLY').modules, { app: false, pos: false, warehouse: false, api: true });
});

test('a deal made by hand wins over the price list', () => {
  const e = entitlements({ plan: 'STARTER', status: 'ACTIVE', expiresAt: 0, seats: 8, modules: { api: true } });
  assert.equal(e.seats, 8);
  assert.equal(e.modules.api, true);
  assert.equal(e.modules.pos, true);
});

test('no licence, expired or suspended: nothing new', () => {
  assert.equal(entitlements(null).active, false);
  assert.equal(entitlements({ plan: 'UNLIMITED', status: 'ACTIVE', expiresAt: 5 }, 10).modules.api, false);
  assert.equal(entitlements({ plan: 'UNLIMITED', status: 'SUSPENDED', expiresAt: 0 }).modules.pos, false);
});

test('every plan has every field', () => {
  for (const [id, p] of Object.entries(PLANS)) {
    for (const k of ['label', 'pack', 'seats', 'tills', 'monthlySen', 'yearlySen', 'modules', 'multiBranch', 'loyverse']) assert.ok(k in p, `${id}.${k}`);
    for (const k of ['monthlySen', 'yearlySen']) assert.ok(Number.isInteger(p[k]), `${id}.${k}`);
  }
});
