/**
 * Replays a first-time registration against the REAL Firestore project over
 * REST, using a throwaway account it creates and then deletes.
 *
 * The emulator was just shown not to enforce the document-access limit that
 * production does (see limit-probe.mjs), so an emulator pass cannot rule out
 * a limit problem. This runs the same writes against the live project, where
 * every limit is real, and reports which specific write is refused.
 */
const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
// A throwaway workspace: firestore.rules matches /workspaces/{ws} as a
// wildcard, so this exercises the identical rule logic without writing
// anything into the real 'default' workspace the app uses.
const WS = `probe_${Date.now()}`;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const email = `probe_${Date.now()}@example.com`;
const password = 'Probe!12345';

const log = (s) => console.log(s);

// --- create a throwaway account ------------------------------------------
log(`\n[1] Creating throwaway account ${email} ...`);
const signUpRes = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  },
);
const signUp = await signUpRes.json();
if (!signUpRes.ok) {
  log(`    FAILED: ${signUp.error?.message}`);
  process.exit(1);
}
const { idToken, localId: uid } = signUp;
log(`    OK. uid = ${uid}`);

const auth = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
const str = (v) => ({ stringValue: v });
const bool = (v) => ({ booleanValue: v });
const int = (v) => ({ integerValue: String(v) });
const arr = (v) => ({ arrayValue: { values: v.map(str) } });

const report = async (label, res) => {
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    log(`    ALLOWED  ${label}`);
    return true;
  }
  log(`    DENIED   ${label}`);
  log(`             HTTP ${res.status}: ${body.error?.message ?? JSON.stringify(body).slice(0, 200)}`);
  return false;
};

// --- 2. the roles batch, exactly as the app sends it ---------------------
log('\n[2] Seeding the four built-in roles in one atomic batch...');
const roleWrite = (id, name, perms) => ({
  update: {
    name: `projects/${PROJECT}/databases/(default)/documents/workspaces/${WS}/roles/${id}`,
    fields: {
      name: str(name),
      description: str(''),
      permissions: arr(perms),
      builtIn: bool(true),
      createdByUid: str(''),
      createdAt: int(Date.now()),
    },
  },
});
const batchRes = await fetch(`${BASE}:commit`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    writes: [
      roleWrite('worker', 'Worker', ['CREATE_STOCK_CHECK', 'SCAN_BARCODE']),
      roleWrite('supervisor', 'Supervisor', ['VIEW_ALL_HISTORY']),
      roleWrite('warehouse_manager', 'Warehouse Manager', ['EDIT_TEMPLATE']),
      roleWrite('admin', 'Admin', ['CHANGE_PERMISSION']),
    ],
  }),
});
const rolesOk = await report('roles batch (4 documents)', batchRes);

// --- 3. the profile write, exactly as the app sends it ------------------
// Note the absence of a `uid` field: @DocumentId omits it on write.
log('\n[3] Writing the user profile (no uid field, as @DocumentId sends)...');
const roleId = rolesOk ? 'admin' : 'worker';
const profileRes = await fetch(`${BASE}/workspaces/${WS}/users/${uid}`, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({
    fields: {
      email: str(email),
      displayName: str('Probe'),
      roleId: str(roleId),
      roleName: str(rolesOk ? 'Admin' : 'Worker'),
      active: bool(true),
      createdAt: int(Date.now()),
      lastSeenAt: int(Date.now()),
    },
  }),
});
await report(`profile create with roleId=${roleId}`, profileRes);

// --- 4. clean up ---------------------------------------------------------
log('\n[4] Deleting the throwaway account...');
const delRes = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  },
);
log(delRes.ok ? '    OK.' : '    Could not delete; remove it by hand in the console.');
log('\nNote: any role documents created above are real and stay in the project.');
log('');
