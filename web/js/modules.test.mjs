// node web/js/modules.test.mjs -- the module registry.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ERRORS, MODULES, can, enabledModules, getModule, isEnabled, moduleIds, tokenAllows } from './modules.js';

const lic = (plan, extra = {}) => ({ plan, status: 'ACTIVE', expiresAt: 0, ...extra });

test('a plan with modules written on it: exactly those', () => {
  assert.deepEqual(enabledModules(lic('STARTER', { modules: { app: true, pos: true, warehouse: false, api: false } })), ['count', 'pos', 'tax']);
  assert.deepEqual(enabledModules(lic('APP_ONLY', { modules: { app: true, pos: false, warehouse: false, api: false } })), ['count']);
});

test('a licence without a modules map: its plan decides', () => {
  assert.deepEqual(enabledModules(lic('STARTER')), ['count', 'pos', 'warehouse', 'procurement', 'tax']);
  assert.deepEqual(enabledModules(lic('UNLIMITED')), ['count', 'pos', 'warehouse', 'procurement', 'tax', 'api']);
  assert.deepEqual(enabledModules(lic('POS_ONLY')), ['pos', 'warehouse', 'procurement', 'tax']);
  assert.deepEqual(enabledModules(lic('API_ONLY')), ['api']);
});

test('no licence at all (shops from before plans): stock take, POS, warehouse', () => {
  assert.deepEqual(enabledModules(null), ['count', 'pos', 'warehouse', 'procurement', 'tax']);
});

test('an expired licence hides nothing: reports and exports stay open', () => {
  assert.deepEqual(enabledModules({ plan: 'BUSINESS', status: 'EXPIRED', expiresAt: 1 }), ['count', 'pos', 'warehouse', 'procurement', 'tax']);
});

test('unknown and planned modules are off, even if a licence says on', () => {
  assert.equal(isEnabled(lic('UNLIMITED'), 'nope'), false);
  assert.equal(isEnabled(lic('UNLIMITED', { modules: { ecommerce: true, pos: true } }), 'ecommerce'), false);
  assert.throws(() => getModule('nope'), /Unknown module/);
});

test('dependencies: a module is off while what it needs is off', () => {
  MODULES.demo = { id: 'demo', licenceKey: 'demo', status: 'live', kind: 'addon', dependsOn: ['pos'], displayName: {}, actions: { view: [] } };
  MODULES.loop = { id: 'loop', licenceKey: 'loop', status: 'live', kind: 'addon', dependsOn: ['loop'], displayName: {}, actions: { view: [] } };
  try {
    assert.equal(isEnabled(lic('X', { modules: { demo: true, pos: true } }), 'demo'), true);
    assert.equal(isEnabled(lic('X', { modules: { demo: true, pos: false } }), 'demo'), false);
    assert.equal(isEnabled(lic('X', { modules: { loop: true } }), 'loop'), false);
  } finally { delete MODULES.demo; delete MODULES.loop; }
});

test('module and permission are separate: on does not mean everyone may', () => {
  const licence = lic('BUSINESS');
  const cashier = { licence, permissions: ['POS_SELL'] };
  assert.equal(can(cashier, 'pos.sell'), true);
  assert.equal(can(cashier, 'pos.void'), false);
  assert.equal(can(cashier, 'procurement.approve'), false);
  assert.equal(can({ licence, isAdmin: true }, 'procurement.approve'), true);
  assert.equal(can({ licence, permissions: new Set(['WH_APPROVE']) }, 'procurement.approve'), true);
  // Procurement rides on the warehouse: off with it.
  assert.equal(can({ licence: lic('APP_ONLY', { modules: { app: true, warehouse: false } }), isAdmin: true }, 'procurement.purchase'), false);
  // Module off: not even the admin.
  assert.equal(can({ licence: lic('APP_ONLY', { modules: { app: true, pos: false } }), isAdmin: true }, 'pos.sell'), false);
  assert.equal(can(cashier, 'pos.fly'), false);
  assert.equal(can(cashier, 'nope.view'), false);
});

test('API token scopes: none means all; listed means only those', () => {
  assert.equal(tokenAllows({}, 'items.write'), true);
  assert.equal(tokenAllows({ scopes: ['items.read'] }, 'items.read'), true);
  assert.equal(tokenAllows({ scopes: ['items.read'] }, 'items.write'), false);
  assert.equal(tokenAllows({}, 'made.up'), false);
});

test('the NEXO modules', () => {
  assert.deepEqual(moduleIds(), ['count', 'pos', 'warehouse', 'procurement', 'tax', 'api', 'ecommerce', 'accounting', 'logistics', 'b2b']);
  assert.equal(MODULES.count.displayName.en, 'NEXO Count');
  for (const id of ['ecommerce', 'accounting', 'logistics', 'b2b']) assert.equal(MODULES[id].status, 'planned');
});

test('every module is fully described', () => {
  for (const id of moduleIds()) {
    const m = MODULES[id];
    assert.equal(m.id, id);
    for (const k of ['licenceKey', 'status', 'kind', 'dependsOn', 'displayName', 'description', 'actions', 'menuItems', 'routes', 'apiScopes']) assert.ok(k in m, `${id}.${k}`);
    for (const l of ['zh', 'en', 'ms']) assert.ok(m.displayName[l] && m.description[l], `${id} ${l}`);
    for (const d of m.dependsOn) assert.ok(MODULES[d], `${id} depends on unknown ${d}`);
  }
  assert.equal(ERRORS.MODULE_NOT_ENABLED, 'MODULE_NOT_ENABLED');
});
