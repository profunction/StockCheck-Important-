/**
 * Who is signed in, which company, what they may do -- and the live product
 * list and register settings every screen reads.
 *
 * The same documents the Android app reads: userIndex/{uid} names the
 * company, its users/{uid} the role, roles/{id} the permissions. Admin has
 * everything, as in the app and in firestore.rules.
 */
import { collection, db, doc, getDoc, onSnapshot } from './fb.js';
import { local } from './dom.js';
import { t } from './i18n.js';
import { entitlements } from './plans.js';
import { can, isEnabled } from './modules.js';

export const DEFAULT_SETTINGS = {
  shopName: '',
  address: '',
  phone: '',
  regNo: '',
  sstNo: '',
  footer: 'Terima kasih! Thank you!',
  taxPct: 0,
  taxName: 'SST',
  pricesIncludeTax: true,
  serviceChargePct: 0,
  paymentMethods: ['CASH', 'QR', 'CARD', 'EWALLET'],
  paperWidth: 80,
  autoPrint: true,
  // FNB, SUPERMARKET or RETAIL (see modes.js). Empty until the owner picks
  // one, which the register asks the first time it opens. BOTH is what shops
  // set up before there was a choice have: restaurant with counter sales.
  mode: '',
  tables: ['1', '2', '3', '4', '5', '6', '7', '8'],
  kitchenTicket: true,
  // Loyalty: off until the shop turns it on. 1 point per ringgit, a point
  // worth 1 sen, usable from 100 points -- the usual 1% back.
  loyaltyEnabled: false,
  pointsPerRinggit: 1,
  pointValueSen: 1,
  minRedeemPoints: 100,
};

export const session = {
  uid: '',
  email: '',
  name: '',
  ws: '',
  isAdmin: false,
  permissions: new Set(),
  branchIds: [],
  branches: [],
  companyName: '',
  /** The branch this till sells for; '' is the main shop. */
  branchId: '',
  settings: { ...DEFAULT_SETTINGS },
  /** False until the shop's own settings have been read once. */
  settingsLoaded: false,
  products: [],
  /** Lists kept as one document each under pos/: categories, modifiers, discounts. */
  categories: [],
  modifiers: [],
  discounts: [],
  suppliers: [],
  /** Every barcode, alternate barcodes included, lower-cased -> product. */
  byCode: new Map(),
  can(permission) {
    return this.isAdmin || this.permissions.has(permission);
  },
  branchName(id = this.branchId) {
    if (!id) return t('mainShop');
    return this.branches.find((b) => b.id === id)?.name || id;
  },
  /** Branches this account may sell for. */
  sellableBranches() {
    const all = [{ id: '', name: t('mainShop') }, ...this.branches.filter((b) => b.active !== false)];
    return this.branchIds.length ? all.filter((b) => this.branchIds.includes(b.id)) : all;
  },
  setBranch(id) {
    this.branchId = id;
    local.set(`pos.branch.${this.ws}`, id);
    emit();
  },
  find(code) {
    return this.byCode.get(String(code).trim().toLowerCase()) || null;
  },
  /** The company's licence, and what its plan switches on (plans.js); null when it has none. */
  licence: null,
  plan: null,
  /**
   * Whether the company has module [id] (modules.js: count, pos,
   * warehouse, api, ...). The one question every screen asks; the answer
   * comes from the registry, never from plan fields read here.
   */
  has(id) {
    return isEnabled(this.licence, id);
  },
  /** Whether this person may do [what] ('pos.void'): module on AND permission held. */
  may(what) {
    return can({ licence: this.licence, isAdmin: this.isAdmin, permissions: this.permissions }, what);
  },
  /** Older name for has(), kept for the licence keys it was called with. */
  allows(module) {
    return this.has({ app: 'count' }[module] || module);
  },
  /** This cashier's open shift (shifts.js), or null. */
  shift: null,
};

const listeners = new Set();
/** Called whenever products or settings change; returns an unsubscribe. */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) fn();
}

const subscriptions = [];

export const ws = (...path) => ['workspaces', session.ws, ...path].join('/');

export async function loadSession(user) {
  const index = await getDoc(doc(db, 'userIndex', user.uid));
  if (!index.exists()) throw Object.assign(new Error(t('errNoCompany')), { code: 'no-company' });
  const wsId = index.data().workspaceId;

  const profileSnap = await getDoc(doc(db, 'workspaces', wsId, 'users', user.uid));
  const profile = profileSnap.data();
  if (!profile || profile.active !== true) throw new Error(t('errInactive'));

  const isAdmin = profile.roleId === 'admin';
  let permissions = new Set();
  if (!isAdmin) {
    const role = await getDoc(doc(db, 'workspaces', wsId, 'roles', profile.roleId));
    permissions = new Set(role.data()?.permissions || []);
  }

  let config = {};
  try {
    config = (await getDoc(doc(db, 'workspaces', wsId, 'meta', 'config'))).data() || {};
  } catch {
    // Not fatal: no branches, no company name.
  }

  Object.assign(session, {
    uid: user.uid,
    email: user.email || '',
    name: profile.displayName || user.email || '',
    ws: wsId,
    isAdmin,
    permissions,
    branchIds: profile.branchIds || [],
    branches: config.branches || [],
    companyName: config.companyName || '',
    // Staff join with it; shown to admins on Profile so they can hand it out.
    joinCode: config.joinCode || '',
  });

  try {
    const lic = await getDoc(doc(db, 'licences', wsId));
    session.licence = lic.exists() ? lic.data() : null;
  } catch {
    session.licence = null;
  }
  session.plan = session.licence ? entitlements(session.licence) : null;

  const sellable = session.sellableBranches().map((b) => b.id);
  const remembered = local.get(`pos.branch.${wsId}`, null);
  session.branchId = sellable.includes(remembered) ? remembered : (sellable[0] ?? '');

  subscriptions.push(onSnapshot(collection(db, ws('products')), (snap) => {
    session.products = snap.docs.map((d) => ({ ...d.data(), barcode: d.id }));
    session.byCode = new Map();
    for (const p of session.products) {
      for (const code of [p.barcode, ...(p.altBarcodes || [])]) {
        if (code) session.byCode.set(String(code).toLowerCase(), p);
      }
    }
    emit();
  }));

  for (const name of ['categories', 'modifiers', 'discounts', 'suppliers']) {
    subscriptions.push(onSnapshot(doc(db, ws(`pos/${name}`)), (snap) => {
      session[name] = snap.data()?.list || [];
      emit();
    }, () => {}));
  }

  subscriptions.push(onSnapshot(doc(db, ws('pos/settings')), (snap) => {
    session.settings = { ...DEFAULT_SETTINGS, ...(snap.data() || {}) };
    session.settingsLoaded = true;
    emit();
  }, () => {
    // No settings yet, or not readable: the defaults print a working receipt.
    session.settingsLoaded = true;
    emit();
  }));
}

export function endSession() {
  while (subscriptions.length) subscriptions.pop()();
  session.uid = '';
  session.ws = '';
  session.settingsLoaded = false;
  session.products = [];
  session.byCode = new Map();
  session.categories = [];
  session.modifiers = [];
  session.discounts = [];
  session.licence = null;
  session.plan = null;
  session.shift = null;
}
