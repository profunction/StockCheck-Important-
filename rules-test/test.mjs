/**
 * Runs the real firestore.rules against the Firestore emulator, replaying the
 * exact sequence a first-time registration performs.
 *
 * Written because three successive fixes were reasoned out from memory of how
 * Firestore evaluates rules and all three were wrong. This asserts behaviour
 * instead of predicting it.
 */
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  writeBatch,
  getDoc,
} from 'firebase/firestore';

const WS = 'default';
const UID = 'testuid123';

const testEnv = await initializeTestEnvironment({
  projectId: 'stockcheck-rules-test',
  firestore: {
    rules: readFileSync('../firestore.rules', 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

const results = [];
const check = async (name, promise) => {
  try {
    await promise;
    results.push([name, 'ALLOWED']);
    return true;
  } catch (e) {
    const msg = String(e.message || e).split('\n')[0].slice(0, 120);
    results.push([name, 'DENIED', msg]);
    return false;
  }
};

const roleDocs = [
  ['worker', { name: 'Worker', permissions: ['CREATE_STOCK_CHECK'], builtIn: true }],
  ['supervisor', { name: 'Supervisor', permissions: ['VIEW_ALL_HISTORY'], builtIn: true }],
  ['warehouse_manager', { name: 'Warehouse Manager', permissions: ['EDIT_TEMPLATE'], builtIn: true }],
  ['admin', { name: 'Admin', permissions: ['CHANGE_PERMISSION'], builtIn: true }],
];

await testEnv.clearFirestore();

const authed = testEnv.authenticatedContext(UID).firestore();

// --- 1. The roles batch, admin written LAST (current app behaviour) -------
await check(
  '1. roles batch (admin last)',
  (async () => {
    const b = writeBatch(authed);
    for (const [id, data] of roleDocs) {
      b.set(doc(authed, `workspaces/${WS}/roles/${id}`), data);
    }
    await b.commit();
  })(),
);

// --- 2. The roles batch, admin written FIRST (pre-fix order) --------------
await testEnv.clearFirestore();
await check(
  '2. roles batch (admin first)',
  (async () => {
    const b = writeBatch(authed);
    const reordered = [roleDocs[3], ...roleDocs.slice(0, 3)];
    for (const [id, data] of reordered) {
      b.set(doc(authed, `workspaces/${WS}/roles/${id}`), data);
    }
    await b.commit();
  })(),
);

// --- 3. Profile create WITHOUT a uid field -------------------------------
// This is what the Android SDK actually sends: @DocumentId properties are
// populated from the document id on read and OMITTED on write.
await testEnv.clearFirestore();
await check(
  '3. profile create, no uid field (what @DocumentId actually sends)',
  setDoc(doc(authed, `workspaces/${WS}/users/${UID}`), {
    email: 'a@b.com',
    displayName: 'Test',
    roleId: 'admin',
    roleName: 'Admin',
    active: true,
    createdAt: 1,
    lastSeenAt: 1,
  }),
);

// --- 4. Profile create WITH a uid field ----------------------------------
await testEnv.clearFirestore();
await check(
  '4. profile create, uid field present',
  setDoc(doc(authed, `workspaces/${WS}/users/${UID}`), {
    uid: UID,
    email: 'a@b.com',
    displayName: 'Test',
    roleId: 'admin',
    roleName: 'Admin',
    active: true,
    createdAt: 1,
    lastSeenAt: 1,
  }),
);

// --- 5. Full happy path: seed roles, then create the admin profile -------
await testEnv.clearFirestore();
await check(
  '5. full registration (roles batch + profile with uid)',
  (async () => {
    const b = writeBatch(authed);
    for (const [id, data] of roleDocs) {
      b.set(doc(authed, `workspaces/${WS}/roles/${id}`), data);
    }
    await b.commit();
    await setDoc(doc(authed, `workspaces/${WS}/users/${UID}`), {
      uid: UID,
      email: 'a@b.com',
      displayName: 'Test',
      roleId: 'admin',
      roleName: 'Admin',
      active: true,
      createdAt: 1,
      lastSeenAt: 1,
    });
  })(),
);

console.log('\n================ RESULTS ================');
for (const [name, verdict, msg] of results) {
  console.log(`${verdict.padEnd(8)} ${name}`);
  if (msg) console.log(`         → ${msg}`);
}
console.log('=========================================\n');

await testEnv.cleanup();
