/**
 * Branch scoping, against the real firestore.rules in the emulator.
 *
 * Firestore does not filter a query down to the documents a rule allows: it
 * refuses the whole query unless the rule can be proven for every document
 * the query could return. So each query below is the exact shape
 * StockRepository sends for that kind of account, and the test asserts the
 * rules accept it -- and that the OLD unscoped query from a branch account
 * is refused, which is what would have broken History the day an admin first
 * assigned somebody a branch.
 *
 * Run: npx firebase emulators:exec --only firestore "node branch-test.mjs"
 * Exits non-zero on any mismatch, so CI goes red.
 */
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT = 'demo-stockcheck';
const WS = 'w1';
const ws = (path) => `workspaces/${WS}/${path}`;

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: {
    rules: readFileSync('../firestore.rules', 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

await testEnv.clearFirestore();

// ------------------------------------------------------------------ seed data
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const roles = {
    admin: { name: 'Admin', permissions: [], builtIn: true },
    supervisor: {
      name: 'Supervisor',
      permissions: ['VIEW_ALL_HISTORY', 'VIEW_OWN_HISTORY', 'CREATE_STOCK_CHECK', 'EDIT_ANY_STOCK'],
      builtIn: true,
    },
    worker: {
      name: 'Worker',
      permissions: ['VIEW_OWN_HISTORY', 'CREATE_STOCK_CHECK', 'SCAN_BARCODE', 'EDIT_OWN_STOCK'],
      builtIn: true,
    },
    keeper: {
      name: 'Stock keeper',
      permissions: ['VIEW_ALL_HISTORY', 'CREATE_STOCK_CHECK', 'RECORD_STOCK_MOVEMENTS'],
      builtIn: false,
    },
  };
  for (const [id, data] of Object.entries(roles)) {
    await setDoc(doc(db, ws(`roles/${id}`)), data);
  }

  const user = (roleId, branchIds) => ({
    email: 'x@y.z', displayName: roleId, roleId, roleName: roleId,
    active: true, createdAt: 1, lastSeenAt: 1, ...(branchIds ? { branchIds } : {}),
  });
  await setDoc(doc(db, ws('users/admin1')), user('admin', []));
  await setDoc(doc(db, ws('users/hq')), user('supervisor', []));
  await setDoc(doc(db, ws('users/ipohSup')), user('supervisor', ['ipoh']));
  await setDoc(doc(db, ws('users/ipohWorker')), user('worker', ['ipoh']));
  // Written before branches existed: no branchIds field at all.
  await setDoc(doc(db, ws('users/oldWorker')), user('worker', null));

  await setDoc(doc(db, `userIndex/admin1`), { workspaceId: WS });
  await setDoc(doc(db, `licences/${WS}`), { status: 'ACTIVE', expiresAt: 0, plan: 'BUSINESS' });

  const check = (createdByUid, branchId, createdAt) => ({
    refNo: 'SC', templateId: 't', templateName: 'T', status: 'COMPLETED',
    createdByUid, createdByName: createdByUid, createdAt, updatedAt: createdAt,
    ...(branchId === undefined ? {} : { branchId }),
  });
  await setDoc(doc(db, ws('stockChecks/c_ipoh')), check('ipohWorker', 'ipoh', 10));
  await setDoc(doc(db, ws('stockChecks/c_kl')), check('hq', 'kl', 20));
  await setDoc(doc(db, ws('stockChecks/c_none')), check('hq', '', 30));
  // Created before counts carried a branch: no branchId field.
  await setDoc(doc(db, ws('stockChecks/c_legacy')), check('hq', undefined, 40));
  // A worker's own count from before counts carried a branch.
  await setDoc(doc(db, ws('stockChecks/c_legacy_own')), check('ipohWorker', undefined, 45));
  // A branch account's own count filed under another branch.
  await setDoc(doc(db, ws('stockChecks/c_kl_by_ipohSup')), check('ipohSup', 'kl', 50));

  await setDoc(doc(db, ws('users/hqKeeper')), user('keeper', []));
  await setDoc(doc(db, ws('users/ipohKeeper')), user('keeper', ['ipoh']));
  await setDoc(doc(db, ws('products/rice')), { name: 'Rice', sku: '', unit: 'pcs', active: true });
  const movement = (branchId) => ({
    barcode: 'rice', type: 'SALE', quantityMilli: 2000, branchId, at: 5, source: 'FILE',
  });
  await setDoc(doc(db, ws('movements/m_ipoh')), movement('ipoh'));
  await setDoc(doc(db, ws('movements/m_kl')), movement('kl'));
  await setDoc(doc(db, ws('integrations/loyverse')), { token: 'secret' });

  await setDoc(doc(db, ws('stockChecks/c_ipoh/items/i1')), { barcode: '1', quantityMilli: 1000 });
  await setDoc(doc(db, ws('stockChecks/c_kl/items/i1')), { barcode: '1', quantityMilli: 2000 });
});

// ---------------------------------------------------------------- harness
const as = (uid) => testEnv.authenticatedContext(uid).firestore();
const checks = (db) => collection(db, ws('stockChecks'));
const ids = (snap) => snap.docs.map((d) => d.id).sort().join(',');

const results = [];
const expect = async (name, shouldPass, run, expectIds) => {
  let outcome;
  let detail = '';
  try {
    const value = await (shouldPass ? assertSucceeds(run()) : assertFails(run()));
    outcome = 'ok';
    if (shouldPass && expectIds !== undefined) {
      const got = ids(value);
      if (got !== expectIds) {
        outcome = 'WRONG';
        detail = `returned [${got}], expected [${expectIds}]`;
      }
    }
  } catch (e) {
    outcome = 'WRONG';
    detail = (shouldPass ? 'was DENIED: ' : 'was ALLOWED: ') +
      String(e.message || e).split('\n')[0].slice(0, 140);
  }
  results.push({ name, outcome, detail });
};

// What StockRepository sends -------------------------------------------------

// Head office (no branches, VIEW_ALL_HISTORY): ordered + limited, unfiltered.
await expect('HQ: unscoped orderBy(createdAt).limit', true,
  () => getDocs(query(checks(as('hq')), orderBy('createdAt', 'desc'), limit(200))),
  'c_ipoh,c_kl,c_kl_by_ipohSup,c_legacy,c_legacy_own,c_none');

// NEGATIVE CONTROL. If this is allowed, the emulator is not proving queries
// against the rules and nothing else in this file means anything.
await expect('branch supervisor: OLD unscoped query is refused', false,
  () => getDocs(query(checks(as('ipohSup')), orderBy('createdAt', 'desc'), limit(200))));

await expect('branch supervisor: whereIn(branchId, [ipoh, ""])', true,
  () => getDocs(query(checks(as('ipohSup')), where('branchId', 'in', ['ipoh', '']))),
  'c_ipoh,c_none');

await expect('branch supervisor: own counts (createdByUid == me)', true,
  () => getDocs(query(checks(as('ipohSup')), where('createdByUid', '==', 'ipohSup'))),
  'c_kl_by_ipohSup');

await expect('branch supervisor: whereIn a branch not theirs is refused', false,
  () => getDocs(query(checks(as('ipohSup')), where('branchId', 'in', ['kl']))));

// Including one with no branchId field: your own are always yours.
await expect('branch worker: own counts (createdByUid == me)', true,
  () => getDocs(query(checks(as('ipohWorker')), where('createdByUid', '==', 'ipohWorker'))),
  'c_ipoh,c_legacy_own');

await expect('pre-branch worker profile: own counts', true,
  () => getDocs(query(checks(as('oldWorker')), where('createdByUid', '==', 'oldWorker'))),
  '');

// Single documents ------------------------------------------------------------
await expect('branch supervisor: get another branch\'s count', false,
  () => getDoc(doc(as('ipohSup'), ws('stockChecks/c_kl'))));
await expect('branch supervisor: get own count filed elsewhere', true,
  () => getDoc(doc(as('ipohSup'), ws('stockChecks/c_kl_by_ipohSup'))));
// Refused on purpose: allowing a missing field is exactly what let an
// unfiltered query through (see inMyBranch in firestore.rules).
await expect('branch supervisor: get someone else\'s count with no branch field', false,
  () => getDoc(doc(as('ipohSup'), ws('stockChecks/c_legacy'))));
await expect('HQ: get a count with no branch field', true,
  () => getDoc(doc(as('hq'), ws('stockChecks/c_legacy'))));
await expect('branch worker: get own count with no branch field', true,
  () => getDoc(doc(as('ipohWorker'), ws('stockChecks/c_legacy_own'))));
await expect('HQ: get any branch\'s count', true,
  () => getDoc(doc(as('hq'), ws('stockChecks/c_ipoh'))));

// Lines inside a count --------------------------------------------------------
await expect('branch supervisor: items of own branch', true,
  () => getDocs(collection(as('ipohSup'), ws('stockChecks/c_ipoh/items'))), 'i1');
await expect('branch supervisor: items of another branch', false,
  () => getDocs(collection(as('ipohSup'), ws('stockChecks/c_kl/items'))));
await expect('HQ: items of any branch', true,
  () => getDocs(collection(as('hq'), ws('stockChecks/c_kl/items'))), 'i1');

// Starting a count ------------------------------------------------------------
const newCheck = (uid, branchId) => ({
  refNo: 'SC-NEW', templateId: 't', templateName: 'T', status: 'IN_PROGRESS',
  createdByUid: uid, createdByName: uid, createdAt: 99, updatedAt: 99, branchId,
});
await expect('branch supervisor: start a count in own branch', true,
  () => setDoc(doc(as('ipohSup'), ws('stockChecks/new1')), newCheck('ipohSup', 'ipoh')));
await expect('branch supervisor: start a count in another branch', false,
  () => setDoc(doc(as('ipohSup'), ws('stockChecks/new2')), newCheck('ipohSup', 'kl')));
await expect('HQ: start a count in any branch', true,
  () => setDoc(doc(as('hq'), ws('stockChecks/new3')), newCheck('hq', 'kl')));

// Who may change branch assignments ------------------------------------------
await expect('worker: refresh own lastSeenAt', true,
  () => updateDoc(doc(as('ipohWorker'), ws('users/ipohWorker')), { lastSeenAt: 2 }));
await expect('pre-branch worker: refresh own lastSeenAt', true,
  () => updateDoc(doc(as('oldWorker'), ws('users/oldWorker')), { lastSeenAt: 2 }));
await expect('worker: clear own branches (become head office)', false,
  () => updateDoc(doc(as('ipohWorker'), ws('users/ipohWorker')), { branchIds: [] }));
await expect('worker: add a branch to self', false,
  () => updateDoc(doc(as('ipohWorker'), ws('users/ipohWorker')), { branchIds: ['ipoh', 'kl'] }));
await expect('admin: assign a worker to branches', true,
  () => updateDoc(doc(as('admin1'), ws('users/ipohWorker')), { branchIds: ['ipoh', 'kl'] }));

// Stock movements ------------------------------------------------------------
const movements = (db) => collection(db, ws('movements'));
const goods = (branchId, extra = {}) => ({
  barcode: 'rice', type: 'RECEIVE', quantityMilli: 24000, branchId, at: 9, source: 'MANUAL', ...extra,
});

await expect('HQ keeper: all movements, unscoped', true,
  () => getDocs(query(movements(as('hqKeeper')))), 'm_ipoh,m_kl');
await expect('branch keeper: movements whereIn own branch', true,
  () => getDocs(query(movements(as('ipohKeeper')), where('branchId', 'in', ['ipoh', '']))), 'm_ipoh');
await expect('branch keeper: unscoped movements query is refused', false,
  () => getDocs(query(movements(as('ipohKeeper')))));
await expect('branch worker: may read own branch movements', true,
  () => getDocs(query(movements(as('ipohWorker')), where('branchId', 'in', ['ipoh', '']))), 'm_ipoh');

await expect('HQ keeper: record goods received', true,
  () => setDoc(doc(as('hqKeeper'), ws('movements/new1')), goods('kl')));
await expect('HQ keeper: re-import writes the same id again', true,
  () => setDoc(doc(as('hqKeeper'), ws('movements/new1')), goods('kl', { quantityMilli: 12000 })));
await expect('HQ keeper: negative quantity refused', false,
  () => setDoc(doc(as('hqKeeper'), ws('movements/bad1')), goods('kl', { quantityMilli: -1 })));
await expect('HQ keeper: unknown movement type refused', false,
  () => setDoc(doc(as('hqKeeper'), ws('movements/bad2')), goods('kl', { type: 'GIFT' })));
await expect('HQ keeper: movement with no product refused', false,
  () => setDoc(doc(as('hqKeeper'), ws('movements/bad3')), goods('kl', { barcode: '' })));
await expect('branch keeper: record for own branch', true,
  () => setDoc(doc(as('ipohKeeper'), ws('movements/new2')), goods('ipoh')));
await expect('branch keeper: record for another branch refused', false,
  () => setDoc(doc(as('ipohKeeper'), ws('movements/new3')), goods('kl')));
await expect('worker: cannot record movements', false,
  () => setDoc(doc(as('ipohWorker'), ws('movements/new4')), goods('ipoh')));
await expect('HQ keeper: delete a movement', true,
  () => deleteDoc(doc(as('hqKeeper'), ws('movements/new1'))));

// Reorder level, and nothing else ---------------------------------------------
await expect('keeper: set a reorder level', true,
  () => updateDoc(doc(as('hqKeeper'), ws('products/rice')), { reorderLevelMilli: 10000, updatedAt: 1 }));
await expect('keeper: rename a product refused', false,
  () => updateDoc(doc(as('hqKeeper'), ws('products/rice')), { name: 'Cheap rice' }));
await expect('worker: set a reorder level refused', false,
  () => updateDoc(doc(as('ipohWorker'), ws('products/rice')), { reorderLevelMilli: 1 }));

// POS connection token -------------------------------------------------------
await expect('admin: read the POS token', true,
  () => getDoc(doc(as('admin1'), ws('integrations/loyverse'))));
await expect('admin: save the POS token', true,
  () => setDoc(doc(as('admin1'), ws('integrations/loyverse')), { token: 'new' }));
await expect('keeper: read the POS token refused', false,
  () => getDoc(doc(as('hqKeeper'), ws('integrations/loyverse'))));

// ------------------------------------------------------------------ report
const width = Math.max(...results.map((r) => r.name.length));
let failed = 0;
for (const r of results) {
  if (r.outcome !== 'ok') failed++;
  console.log(`${r.outcome === 'ok' ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);

await testEnv.cleanup();
process.exit(failed === 0 ? 0 : 1);
