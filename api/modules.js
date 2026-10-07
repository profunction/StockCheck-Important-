/**
 * The module registry: every part of Stock Check a company can have, in
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
 * Where a company's modules come from (no new collection, nothing to
 * migrate): the licence document licences/{workspaceId}, written only by
 * the platform. Its `modules` map wins; a licence without one gets what its
 * plan includes (plans.js); a company with no licence at all -- set up
 * before plans existed -- keeps stock take, POS and warehouse, as
 * firestore.rules has always allowed. An expired licence does not hide
 * anything: reading, reports and exports stay open; starting new work is
 * decided elsewhere (licence status), not here.
 */
import { PLANS } from './plans.js';

/** status: live (sold now) or planned (shown as coming soon, never enabled). */
export const MODULES = {
  stocktake: {
    id: 'stocktake', licenceKey: 'app', status: 'live', kind: 'core', dependsOn: [],
    name: { zh: '盘点通', en: 'Stock Take', ms: 'Kira Stok' },
    actions: {
      view: [],
      count: ['CREATE_STOCK_CHECK'],
      move: ['RECORD_STOCK_MOVEMENTS'],
    },
  },
  pos: {
    id: 'pos', licenceKey: 'pos', status: 'live', kind: 'core', dependsOn: [],
    name: { zh: '收银通', en: 'POS', ms: 'POS' },
    actions: {
      view: [],
      sell: ['POS_SELL'],
      void: ['POS_VOID'],
      manage: ['POS_MANAGE'],
      reports: ['POS_REPORTS', 'POS_SELL'],
      customers: ['POS_SELL', 'POS_MANAGE', 'POS_REPORTS'],
    },
  },
  warehouse: {
    id: 'warehouse', licenceKey: 'warehouse', status: 'live', kind: 'addon', dependsOn: [],
    name: { zh: '仓库与订货', en: 'Warehouse & ordering', ms: 'Gudang & pesanan' },
    actions: {
      view: [],
      move: ['RECORD_STOCK_MOVEMENTS'],
      purchase: ['WH_PURCHASE', 'POS_MANAGE', 'WH_APPROVE'],
      suppliers: ['WH_PURCHASE', 'POS_MANAGE'],
      approve: ['WH_APPROVE'],
      places: ['ADMIN'],
      audit: ['VIEW_AUDIT_LOG'],
    },
  },
  api: {
    id: 'api', licenceKey: 'api', status: 'live', kind: 'addon', dependsOn: [],
    name: { zh: '开放 API', en: 'Open API', ms: 'API terbuka' },
    actions: { tokens: ['CHANGE_PERMISSION'] },
    // What an access token may be limited to. A token with no scopes (all
    // made before scopes existed) may do everything, as before.
    scopes: ['items.read', 'items.write', 'inventory.read', 'inventory.write', 'receipts.read',
      'customers.read', 'customers.write', 'stores.read', 'sync.write'],
  },
  ecommerce: {
    id: 'ecommerce', licenceKey: 'ecommerce', status: 'planned', kind: 'addon', dependsOn: ['pos'],
    name: { zh: '电商同步', en: 'Online store sync', ms: 'Segerak kedai dalam talian' },
    actions: { view: [], sync: ['POS_MANAGE'], manage: ['POS_MANAGE'] },
  },
  accounting: {
    id: 'accounting', licenceKey: 'accounting', status: 'planned', kind: 'addon', dependsOn: ['pos'],
    name: { zh: '会计软件连接', en: 'Accounting software', ms: 'Perisian perakaunan' },
    actions: { view: [], export: ['POS_REPORTS'] },
  },
  delivery: {
    id: 'delivery', licenceKey: 'delivery', status: 'planned', kind: 'addon', dependsOn: ['pos'],
    name: { zh: '配送', en: 'Delivery', ms: 'Penghantaran' },
    actions: { view: [], book: ['POS_SELL'] },
  },
};

/** What a company with no licence document keeps (see the top of this file). */
const WITHOUT_LICENCE = ['stocktake', 'pos', 'warehouse'];

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

/** The company's modules as a list, e.g. ['stocktake', 'pos']. */
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
  if (!MODULES.api.scopes.includes(scope)) return false;
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
