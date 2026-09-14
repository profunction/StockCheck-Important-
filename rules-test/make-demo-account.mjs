/**
 * Creates a working Admin account in the real project, seeding the built-in
 * roles first so the account has something to resolve its permissions against.
 *
 * Exists because registration from the phone kept failing part-way and left an
 * Auth account with no profile behind it; this performs the same two steps the
 * app performs, over REST, where each one's success or failure is visible.
 */
const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const WS = 'default';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const EMAIL = process.argv[2] ?? 'demo@stockcheck.app';
const PASSWORD = process.argv[3] ?? 'demo123456';

const log = (s) => console.log(s);
const str = (v) => ({ stringValue: v });
const bool = (v) => ({ booleanValue: v });
const int = (v) => ({ integerValue: String(v) });
const arr = (v) => ({ arrayValue: { values: v.map(str) } });

// Mirrors BuiltInRoles.kt. Admin's permissions are resolved in app code rather
// than read from this list, so the stored list only needs to be non-empty and
// descriptive; the other three are the real source of truth for their roles.
const ROLES = [
  ['worker', 'Worker', 'Counts stock and edits only their own records.', [
    'CREATE_STOCK_CHECK', 'SCAN_BARCODE', 'VOICE_INPUT', 'TAKE_PHOTO',
    'EDIT_OWN_STOCK', 'VIEW_OWN_HISTORY', 'MARK_COMPLETED', 'VIEW_TEMPLATE',
    'VIEW_EXPORT', 'EXPORT_CSV', 'EXPORT_OWN_DATA',
  ]],
  ['supervisor', 'Supervisor', "Reviews and locks the team's counts.", [
    'CREATE_STOCK_CHECK', 'SCAN_BARCODE', 'VOICE_INPUT', 'TAKE_PHOTO',
    'EDIT_OWN_STOCK', 'EDIT_ANY_STOCK', 'VIEW_OWN_HISTORY', 'VIEW_ALL_HISTORY',
    'VIEW_AUDIT_LOG', 'MARK_COMPLETED', 'MARK_REVIEWED', 'LOCK_STOCK',
    'DUPLICATE_STOCK', 'VIEW_TEMPLATE', 'VIEW_EXPORT', 'EXPORT_CSV',
    'EXPORT_EXCEL', 'EXPORT_OWN_DATA', 'EXPORT_ALL_DATA', 'PRINT', 'VIEW_USERS',
  ]],
  ['warehouse_manager', 'Warehouse Manager', 'Supervisor plus templates, deletion and unlocking.', [
    'CREATE_STOCK_CHECK', 'SCAN_BARCODE', 'VOICE_INPUT', 'TAKE_PHOTO',
    'EDIT_OWN_STOCK', 'EDIT_ANY_STOCK', 'DELETE_OWN_STOCK', 'DELETE_ANY_STOCK',
    'VIEW_OWN_HISTORY', 'VIEW_ALL_HISTORY', 'VIEW_AUDIT_LOG', 'MARK_COMPLETED',
    'MARK_REVIEWED', 'LOCK_STOCK', 'UNLOCK_STOCK', 'DUPLICATE_STOCK',
    'VIEW_TEMPLATE', 'CREATE_TEMPLATE', 'EDIT_TEMPLATE', 'VIEW_EXPORT',
    'EXPORT_CSV', 'EXPORT_EXCEL', 'EXPORT_OWN_DATA', 'EXPORT_ALL_DATA',
    'EDIT_EXPORTED_FILE', 'PRINT', 'VIEW_USERS',
  ]],
  ['admin', 'Admin', 'Full control over stock, templates, users, roles and exports.', [
    'CREATE_STOCK_CHECK', 'SCAN_BARCODE', 'VOICE_INPUT', 'TAKE_PHOTO',
    'EDIT_OWN_STOCK', 'EDIT_ANY_STOCK', 'DELETE_OWN_STOCK', 'DELETE_ANY_STOCK',
    'DUPLICATE_STOCK', 'VIEW_OWN_HISTORY', 'VIEW_ALL_HISTORY', 'VIEW_AUDIT_LOG',
    'MARK_COMPLETED', 'MARK_REVIEWED', 'LOCK_STOCK', 'UNLOCK_STOCK',
    'VIEW_TEMPLATE', 'CREATE_TEMPLATE', 'EDIT_TEMPLATE', 'DELETE_TEMPLATE',
    'VIEW_EXPORT', 'EXPORT_CSV', 'EXPORT_EXCEL', 'EXPORT_OWN_DATA',
    'EXPORT_ALL_DATA', 'EDIT_EXPORTED_FILE', 'PRINT', 'VIEW_USERS',
    'CREATE_USER', 'EDIT_USER', 'DELETE_USER', 'CREATE_ROLE', 'EDIT_ROLE',
    'DELETE_ROLE', 'CHANGE_PERMISSION',
  ]],
];

// --- 1. account ----------------------------------------------------------
log(`\n[1] Creating ${EMAIL} ...`);
let res = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  },
);
let body = await res.json();

if (!res.ok && body.error?.message === 'EMAIL_EXISTS') {
  log('    Already exists — signing in to it instead.');
  res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  );
  body = await res.json();
}
if (!res.ok) {
  log(`    FAILED: ${body.error?.message}`);
  process.exit(1);
}
const { idToken, localId: uid } = body;
log(`    OK. uid = ${uid}`);

const auth = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };

// --- 2. roles ------------------------------------------------------------
log('\n[2] Seeding built-in roles...');
const batch = await fetch(`${BASE}:commit`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    writes: ROLES.map(([id, name, description, permissions]) => ({
      update: {
        name: `projects/${PROJECT}/databases/(default)/documents/workspaces/${WS}/roles/${id}`,
        fields: {
          name: str(name),
          description: str(description),
          permissions: arr(permissions),
          builtIn: bool(true),
          createdByUid: str(uid),
          createdAt: int(Date.now()),
        },
      },
    })),
  }),
});
if (batch.ok) {
  log('    OK — worker, supervisor, warehouse_manager, admin written.');
} else {
  const e = await batch.json();
  log(`    Not written: ${e.error?.message?.slice(0, 120)}`);
  log('    (Expected if they already exist — the rules only allow seeding once.)');
}

// --- 3. profile ----------------------------------------------------------
log('\n[3] Writing the Admin profile for this account...');
const profile = await fetch(`${BASE}/workspaces/${WS}/users/${uid}`, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({
    fields: {
      email: str(EMAIL),
      displayName: str('Demo Admin'),
      roleId: str('admin'),
      roleName: str('Admin'),
      active: bool(true),
      createdAt: int(Date.now()),
      lastSeenAt: int(Date.now()),
    },
  }),
});
if (profile.ok) {
  log('    OK.');
} else {
  const e = await profile.json();
  log(`    FAILED: ${e.error?.message}`);
  process.exit(1);
}

log('\n========================================');
log('  Sign in with:');
log(`    Email:    ${EMAIL}`);
log(`    Password: ${PASSWORD}`);
log('  Role: Admin (full permissions)');
log('========================================\n');
