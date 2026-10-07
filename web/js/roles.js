/**
 * The built-in roles a new company starts with -- the same four the JEXO
 * Count app writes when a company is created there (BuiltInRoles.kt), so a
 * company made on the website and one made on a phone are set up alike.
 * roles.test.mjs reads the Kotlin files and fails if the two drift.
 */
export const PERMISSIONS = [
  'CREATE_STOCK_CHECK', 'SCAN_BARCODE', 'VOICE_INPUT', 'TAKE_PHOTO', 'EDIT_OWN_STOCK', 'EDIT_ANY_STOCK',
  'DELETE_OWN_STOCK', 'DELETE_ANY_STOCK', 'DUPLICATE_STOCK', 'RECORD_STOCK_MOVEMENTS',
  'VIEW_OWN_HISTORY', 'VIEW_ALL_HISTORY', 'VIEW_AUDIT_LOG',
  'MARK_COMPLETED', 'MARK_REVIEWED', 'LOCK_STOCK', 'UNLOCK_STOCK',
  'VIEW_TEMPLATE', 'CREATE_TEMPLATE', 'EDIT_TEMPLATE', 'DELETE_TEMPLATE',
  'VIEW_EXPORT', 'EXPORT_CSV', 'EXPORT_EXCEL', 'EXPORT_OWN_DATA', 'EXPORT_ALL_DATA', 'EDIT_EXPORTED_FILE', 'PRINT',
  'IMPORT_PRODUCTS', 'IMPORT_COUNT_SHEET',
  'VIEW_USERS', 'CREATE_USER', 'EDIT_USER', 'DELETE_USER', 'CREATE_ROLE', 'EDIT_ROLE', 'DELETE_ROLE', 'CHANGE_PERMISSION',
  'POS_SELL', 'POS_VOID', 'POS_MANAGE', 'POS_REPORTS',
  'WH_PURCHASE', 'WH_APPROVE',
];

const WORKER = ['CREATE_STOCK_CHECK', 'SCAN_BARCODE', 'VOICE_INPUT', 'TAKE_PHOTO', 'EDIT_OWN_STOCK', 'VIEW_OWN_HISTORY',
  'MARK_COMPLETED', 'VIEW_TEMPLATE', 'VIEW_EXPORT', 'EXPORT_CSV', 'EXPORT_OWN_DATA'];
const SUPERVISOR = [...WORKER, 'EDIT_ANY_STOCK', 'DUPLICATE_STOCK', 'VIEW_ALL_HISTORY', 'VIEW_AUDIT_LOG', 'MARK_REVIEWED',
  'LOCK_STOCK', 'EXPORT_EXCEL', 'EXPORT_ALL_DATA', 'PRINT', 'VIEW_USERS', 'IMPORT_COUNT_SHEET'];
const MANAGER = [...SUPERVISOR, 'DELETE_ANY_STOCK', 'DELETE_OWN_STOCK', 'UNLOCK_STOCK', 'CREATE_TEMPLATE', 'EDIT_TEMPLATE',
  'EDIT_EXPORTED_FILE', 'IMPORT_PRODUCTS', 'RECORD_STOCK_MOVEMENTS', 'POS_SELL', 'POS_VOID', 'POS_MANAGE', 'POS_REPORTS',
  'WH_PURCHASE', 'WH_APPROVE'];

const sorted = (list) => [...new Set(list)].sort();

/** id -> the role document, as BuiltInRoles.seeds writes it. */
export const BUILT_IN_ROLES = {
  admin: { name: 'Admin', description: 'Full control over stock, templates, users, roles and exports.', permissions: sorted(PERMISSIONS), builtIn: true },
  worker: { name: 'Worker', description: 'Counts stock and edits only their own records.', permissions: sorted(WORKER), builtIn: true },
  supervisor: { name: 'Supervisor', description: "Reviews and locks the team's counts; cannot delete or manage users.", permissions: sorted(SUPERVISOR), builtIn: true },
  warehouse_manager: { name: 'Warehouse Manager', description: 'Supervisor plus template authoring, deletion and unlocking.', permissions: sorted(MANAGER), builtIn: true },
};
