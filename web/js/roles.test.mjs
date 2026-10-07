// node web/js/roles.test.mjs -- the website's built-in roles are the app's.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { BUILT_IN_ROLES, PERMISSIONS } from './roles.js';

const kt = (f) => readFileSync(new URL(`../../app/src/main/java/com/stockcheck/app/model/${f}`, import.meta.url), 'utf8');

test('every permission in the app, and only those', () => {
  const src = kt('Permissions.kt');
  const body = src.slice(src.indexOf('enum class Permission('), src.indexOf('enum class PermissionGroup'));
  const names = [...body.matchAll(/^\s{4}([A-Z_]+)\(PermissionGroup\./gm)].map((m) => m[1]);
  assert.deepEqual([...PERMISSIONS].sort(), [...names].sort());
});

test('each built-in role grants what BuiltInRoles.kt grants', () => {
  const src = kt('BuiltInRoles.kt');
  const setOf = (name) => {
    const m = new RegExp(`private val ${name}Permissions: Set<P> = ([\\s\\S]*?)\\n\\n`).exec(src);
    const own = [...m[1].matchAll(/P\.([A-Z_]+)/g)].map((x) => x[1]);
    const base = /^(\w+)Permissions \+/.exec(m[1].trim());
    return base ? [...setOf(base[1]), ...own] : own;
  };
  const want = (list) => [...new Set(list)].sort();
  assert.deepEqual(BUILT_IN_ROLES.worker.permissions, want(setOf('worker')));
  assert.deepEqual(BUILT_IN_ROLES.supervisor.permissions, want(setOf('supervisor')));
  assert.deepEqual(BUILT_IN_ROLES.warehouse_manager.permissions, want(setOf('manager')));
  assert.deepEqual(BUILT_IN_ROLES.admin.permissions, [...PERMISSIONS].sort());
  for (const [id, name] of [['admin', 'Admin'], ['worker', 'Worker'], ['supervisor', 'Supervisor'], ['warehouse_manager', 'Warehouse Manager']]) {
    assert.equal(BUILT_IN_ROLES[id].name, name);
    assert.ok(src.includes(`name = "${name}"`));
  }
});
