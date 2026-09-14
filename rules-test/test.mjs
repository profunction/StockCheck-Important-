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


// --- 6. Company code gate ------------------------------------------------
// Added when registration was gated on a join code, to prove the rule admits
// the right code and refuses a wrong one before it ever reaches a phone.
const codeUid = "codeuser99";
const coded = testEnv.authenticatedContext(codeUid).firestore();
const profileWith = (code) => ({
  email: "c@d.com", displayName: "Coded", roleId: "worker", roleName: "Worker",
  active: true, createdAt: 1, lastSeenAt: 1, joinCode: code,
});
const withConfig = async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `workspaces/${WS}/meta/config`), {
      companyName: "Upoint", joinCode: "UPOINT", updatedAt: 1, updatedByUid: "x",
    });
  });
};

await withConfig();
await check(
  "6a. register with the CORRECT code",
  setDoc(doc(coded, `workspaces/${WS}/users/${codeUid}`), profileWith("UPOINT")),
);

await withConfig();
const wrongAccepted = await check(
  "6b. register with a WRONG code (must be refused)",
  setDoc(doc(coded, `workspaces/${WS}/users/${codeUid}`), profileWith("GUESSED")),
);

await withConfig();
const missingAccepted = await check(
  "6c. register with NO code field at all (must be refused)",
  setDoc(doc(coded, `workspaces/${WS}/users/${codeUid}`), {
    email: "c@d.com", displayName: "Coded", roleId: "worker", roleName: "Worker",
    active: true, createdAt: 1, lastSeenAt: 1,
  }),
);

await testEnv.clearFirestore();
const bootstrapped = await check(
  "6d. register while no code is configured yet (first admin)",
  setDoc(doc(coded, `workspaces/${WS}/users/${codeUid}`), profileWith("")),
);

console.log("");
console.log("================ RESULTS ================");
for (const [name, verdict, msg] of results) {
  console.log(`${verdict.padEnd(8)} ${name}`);
  if (msg) console.log(`         -> ${msg}`);
}
console.log("=========================================");


if (wrongAccepted) console.log("*** SECURITY HOLE: a wrong company code was accepted ***");
if (missingAccepted) console.log("*** SECURITY HOLE: a missing company code was accepted ***");
if (!bootstrapped) console.log("*** the first admin can no longer bootstrap a workspace ***");

await testEnv.cleanup();
