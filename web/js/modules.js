/**
 * The module registry: every part of SuXin a company can have, in
 * one place -- its name for customers, what it depends on, which existing
 * permissions each of its actions needs, which menu entries and API routes
 * belong to it.
 *
 * Screens, the API and the tests ask this file ("is the warehouse on?",
 * "may this person void a sale?") instead of checking plans or licence
 * fields themselves. A new module is one entry here.
 *
 * Copied unchanged to api/modules.js (CI checks the copy). Pure.
 *
 * Where a company's modules come from (tenant id = workspace id) (no new collection, nothing to
 * migrate): the licence document licences/{workspaceId}, written only by
 * the platform. Its `modules` map wins; a licence without one gets what its
 * plan includes (plans.js); a company with no licence at all -- set up
 * before plans existed -- keeps stock take, POS and warehouse, as
 * firestore.rules has always allowed. An expired licence does not hide
 * anything: reading, reports and exports stay open; starting new work is
 * decided elsewhere (licence status), not here.
 */
import { PLANS } from './plans.js';

/**
 * status: live (sold now) or planned (shown as coming soon, never enabled).
 * kind: core (what a small shop starts with) or addon (added as it grows).
 * licenceKey: the switch in licences/{ws}.modules; modules sold together
 *   share one (procurement rides on the warehouse, tax on the POS).
 * actions: what can be done -> the existing permissions that allow it.
 * menuItems: the back-office menu entries that belong to the module.
 * routes: the API paths it guards. apiScopes: what a token may be limited to.
 */
export const MODULES = {
  count: {
    id: 'count', licenceKey: 'app', status: 'live', kind: 'core', dependsOn: [],
    displayName: { zh: 'SuXin Barcode Scan', en: 'SuXin Barcode Scan', ms: 'SuXin Barcode Scan' },
    description: { zh: '手机盘点', en: 'Mobile stock counting', ms: 'Kira stok dengan telefon' },
    actions: { view: [], count: ['CREATE_STOCK_CHECK'], move: ['RECORD_STOCK_MOVEMENTS'] },
    menuItems: ['inventory'], routes: [], apiScopes: [],
  },
  pos: {
    id: 'pos', licenceKey: 'pos', status: 'live', kind: 'core', dependsOn: [],
    displayName: { zh: 'SuXin POS', en: 'SuXin POS', ms: 'SuXin POS' },
    description: { zh: '柜台收银', en: 'Point of sale', ms: 'Jualan di kaunter' },
    actions: {
      view: [],
      sell: ['POS_SELL'],
      void: ['POS_VOID'],
      manage: ['POS_MANAGE'],
      reports: ['POS_REPORTS', 'POS_SELL'],
      customers: ['POS_SELL', 'POS_MANAGE', 'POS_REPORTS'],
    },
    menuItems: ['pos', 'reports', 'customers'], routes: [], apiScopes: [],
  },
  warehouse: {
    id: 'warehouse', licenceKey: 'warehouse', status: 'live', kind: 'addon', dependsOn: [],
    displayName: { zh: 'SuXin WMS', en: 'SuXin WMS', ms: 'SuXin WMS' },
    description: { zh: '仓库、收货、调货', en: 'Warehouse, receiving, transfers', ms: 'Gudang, terima barang, pindahan' },
    actions: {
      view: [],
      move: ['RECORD_STOCK_MOVEMENTS'],
      places: ['ADMIN'],
      audit: ['VIEW_AUDIT_LOG'],
    },
    menuItems: ['home', 'receive', 'transfers', 'adjust', 'stock', 'variance', 'places', 'audit'], routes: [], apiScopes: [],
  },
  procurement: {
    id: 'procurement', licenceKey: 'warehouse', status: 'live', kind: 'addon', dependsOn: ['warehouse'],
    displayName: { zh: 'SuXin Procurement', en: 'SuXin Procurement', ms: 'SuXin Procurement' },
    description: { zh: '采购单、供应商、补货', en: 'Purchase orders, suppliers, reordering', ms: 'Pesanan belian, pembekal, tambah stok' },
    actions: {
      view: [],
      purchase: ['WH_PURCHASE', 'POS_MANAGE', 'WH_APPROVE'],
      suppliers: ['WH_PURCHASE', 'POS_MANAGE'],
      approve: ['WH_APPROVE'],
    },
    menuItems: ['purchase', 'suppliers'], routes: [], apiScopes: [],
  },
  tax: {
    id: 'tax', licenceKey: 'pos', status: 'live', kind: 'addon', dependsOn: ['pos'],
    displayName: { zh: 'SuXin Tax', en: 'SuXin Tax', ms: 'SuXin Tax' },
    description: { zh: 'SST 和 LHDN 电子发票', en: 'SST and LHDN e-invoices', ms: 'SST dan e-Invois LHDN' },
    actions: { view: [], einvoice: ['POS_REPORTS'] },
    menuItems: ['reports/taxes', 'reports/einvoice'], routes: [], apiScopes: [],
  },
  api: {
    id: 'api', licenceKey: 'api', status: 'live', kind: 'addon', dependsOn: [],
    displayName: { zh: '开放 API', en: 'Open API', ms: 'API terbuka' },
    description: { zh: '连接网店和会计软件', en: 'Connect online shops and accounting software', ms: 'Sambung kedai dalam talian dan perisian akaun' },
    actions: { tokens: ['CHANGE_PERMISSION'] },
    menuItems: ['integrations'], routes: ['/v1'],
    // What an access token may be limited to. A token with no scopes (all
    // made before scopes existed) may do everything, as before.
    apiScopes: ['items.read', 'items.write', 'inventory.read', 'inventory.write', 'receipts.read',
      'customers.read', 'customers.write', 'stores.read', 'sync.write'],
  },
  // SuXin Books: e-invoices, bookkeeping and the financial reports
  // (web/books/). Sold with the till for now: it rides on its licence key.
  accounting: {
    id: 'accounting', licenceKey: 'pos', status: 'live', kind: 'addon', dependsOn: [],
    displayName: { zh: 'SuXin Books 账务', en: 'SuXin Books', ms: 'SuXin Books' },
    description: { zh: '电子发票、记账、财务报表', en: 'e-Invoices, bookkeeping, financial reports', ms: 'e-Invois, simpan kira, laporan kewangan' },
    actions: {
      view: ['BOOKS_VIEW', 'BOOKS_POST', 'BOOKS_ADMIN'],
      post: ['BOOKS_POST', 'BOOKS_ADMIN'],
      admin: ['BOOKS_ADMIN'],
    },
    menuItems: [], routes: [], apiScopes: [],
  },
  logistics: {
    id: 'logistics', licenceKey: 'logistics', status: 'planned', kind: 'addon', dependsOn: ['pos'],
    displayName: { zh: 'SuXin Logistics', en: 'SuXin Logistics', ms: 'SuXin Logistics' },
    description: { zh: 'Lalamove、GrabExpress 配送', en: 'Lalamove and GrabExpress delivery', ms: 'Penghantaran Lalamove, GrabExpress' },
    actions: { view: [], book: ['POS_SELL'] },
    menuItems: [], routes: [], apiScopes: [],
  },
  b2b: {
    id: 'b2b', licenceKey: 'b2b', status: 'planned', kind: 'addon', dependsOn: ['warehouse'],
    displayName: { zh: 'SuXin B2B', en: 'SuXin B2B', ms: 'SuXin B2B' },
    description: { zh: '门店和批发客户下单', en: 'Orders from shops and trade customers', ms: 'Pesanan dari kedai dan pelanggan borong' },
    actions: { view: [], order: ['RECORD_STOCK_MOVEMENTS'] },
    menuItems: [], routes: [], apiScopes: [],
  },
};

/** What a company with no licence document keeps (see the top of this file). */
const WITHOUT_LICENCE = ['count', 'pos', 'warehouse', 'procurement', 'tax', 'accounting'];

export const moduleIds = () => Object.keys(MODULES);

export function getModule(id) {
  const m = MODULES[id];
  if (!m) throw new Error(`Unknown module: ${id}`);
  return m;
}

/** Whether the company's plan has [id] switched on, before dependencies. */
function switchedOn(licence, m) {
  if (m.status !== 'live') return false;
  if (!licence) return WITHOUT_LICENCE.includes(m.id);
  const own = licence.modules && typeof licence.modules === 'object' ? licence.modules : null;
  if (own && m.licenceKey in own) return own[m.licenceKey] === true;
  if (own) return false;
  const plan = PLANS[licence.plan] || PLANS.TRIAL;
  return plan.modules[m.licenceKey] === true;
}

/**
 * Whether module [id] is on for the company holding [licence]: live,
 * switched on by the plan, and every module it depends on on as well.
 * An unknown id is off.
 */
export function isEnabled(licence, id, path = []) {
  const m = MODULES[id];
  // A module that depends on itself, however indirectly, is never on.
  if (!m || path.includes(id)) return false;
  return switchedOn(licence, m) && m.dependsOn.every((d) => isEnabled(licence, d, [...path, id]));
}

/** The company's modules as a list, e.g. ['count', 'pos'] -- the enabled_modules view. */
export const enabledModules = (licence) => moduleIds().filter((id) => isEnabled(licence, id));

/**
 * Whether someone may do [what] ('pos.void', 'warehouse.purchase'): the
 * module is on AND they hold one of the permissions the action needs. A
 * module being on never gives everyone everything.
 * [who]: { licence, isAdmin, permissions: Set | string[] }.
 */
export function can(who, what) {
  const [id, action] = String(what).split('.');
  const m = MODULES[id];
  if (!m || !action || !(action in m.actions)) return false;
  if (!isEnabled(who.licence, id)) return false;
  const need = m.actions[action];
  if (!need.length || who.isAdmin) return true;
  const have = who.permissions instanceof Set ? who.permissions : new Set(who.permissions || []);
  return need.some((p) => have.has(p));
}

/** What an API token may do: no scopes on the token means all of them. */
export function tokenAllows(token, scope) {
  if (!MODULES.api.apiScopes.includes(scope)) return false;
  return !Array.isArray(token?.scopes) || token.scopes.includes(scope);
}

/** Error codes, the same everywhere they are reported. */
export const ERRORS = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  PLAN_INACTIVE: 'PLAN_INACTIVE',
  MODULE_NOT_ENABLED: 'MODULE_NOT_ENABLED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
};
