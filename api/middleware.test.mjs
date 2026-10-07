// node api/middleware.test.mjs -- the request chain, without a database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sha256 } from './lib.mjs';
import { authenticate, requireModule, requireScope, tenant } from './middleware.mjs';

const TOKEN = 'sck_test_token_for_middleware_000001';
const tokens = { [sha256(TOKEN)]: { workspaceId: 'w1', name: 'Shop' }, [sha256('sck_readonly_token_for_middleware_02')]: { workspaceId: 'w1', name: 'RO', scopes: ['items.read'] } };
const licences = {
  w1: { plan: 'UNLIMITED', status: 'ACTIVE', expiresAt: 0 },
  w3: { plan: 'STARTER', status: 'ACTIVE', expiresAt: 0 },
  w4: { plan: 'UNLIMITED', status: 'EXPIRED', expiresAt: 5 },
};
const chain = [
  authenticate({ loadToken: async (h) => tokens[h] || null }),
  tenant({ loadLicence: async (ws) => licences[ws] || null, now: () => 1000 }),
  requireModule('api'),
];

/** Runs [steps] on a fake request; resolves the error (or null) and the request. */
async function run(steps, { auth = `Bearer ${TOKEN}`, req = {} } = {}) {
  const r = { get: (h) => (h === 'authorization' ? auth : undefined), ...req };
  for (const s of steps) {
    const err = await new Promise((resolve) => s(r, {}, (e) => resolve(e || null)));
    if (err) return { err, req: r };
  }
  return { err: null, req: r };
}

test('no token, or one we do not know: 401 UNAUTHENTICATED', async () => {
  for (const auth of ['', 'Bearer sck_unknown_token_unknown_token_00', 'Basic abc']) {
    const { err } = await run(chain, { auth });
    assert.equal(err.status, 401);
    assert.equal(err.code, 'UNAUTHENTICATED');
  }
});

test('a token reaches only its own company', async () => {
  const { err, req } = await run(chain);
  assert.equal(err, null);
  assert.equal(req.ws, 'w1');
  assert.equal(req.licence.plan, 'UNLIMITED');
  // A token whose company field is missing or a path is refused outright.
  for (const ws of [undefined, '', 'w1/../w2']) {
    tokens[sha256('sck_broken_token_for_middleware_003')] = { workspaceId: ws };
    const r = await run(chain, { auth: 'Bearer sck_broken_token_for_middleware_003' });
    assert.equal(r.err.code, 'TENANT_MISMATCH');
  }
});

test('plan run out or no licence: 403 PLAN_INACTIVE', async () => {
  for (const ws of ['w4', 'nobody']) {
    tokens[sha256('sck_other_token_for_middleware_0004')] = { workspaceId: ws };
    const { err } = await run(chain, { auth: 'Bearer sck_other_token_for_middleware_0004' });
    assert.equal(err.code, 'PLAN_INACTIVE');
  }
});

test('plan without the API: 403 MODULE_NOT_ENABLED', async () => {
  tokens[sha256('sck_starter_token_for_middleware_05')] = { workspaceId: 'w3' };
  const { err } = await run(chain, { auth: 'Bearer sck_starter_token_for_middleware_05' });
  assert.equal(err.status, 403);
  assert.equal(err.code, 'MODULE_NOT_ENABLED');
});

test('a token limited to reading: writing is 403 PERMISSION_DENIED, reading allowed', async () => {
  const auth = 'Bearer sck_readonly_token_for_middleware_02';
  assert.equal((await run([...chain, requireScope('items.read')], { auth })).err, null);
  const { err } = await run([...chain, requireScope('items.write')], { auth });
  assert.equal(err.code, 'PERMISSION_DENIED');
  // Tokens made before scopes existed keep every right.
  assert.equal((await run([...chain, requireScope('items.write')])).err, null);
});

test('unknown modules and scopes are caught when the server starts', () => {
  assert.throws(() => requireModule('nope'), /Unknown module/);
  assert.throws(() => requireScope('nope.write'), /Unknown scope/);
});

test('a module that is off answers with its id', async () => {
  const { err } = await run([...chain, requireModule('accounting')]);
  assert.equal(err.code, 'MODULE_NOT_ENABLED');
  assert.deepEqual(err.extra, { module: 'accounting' });
  assert.match(err.message, /accounting module is not enabled/);
});
