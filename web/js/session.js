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
  // RETAIL: scan and pay. FNB: tables and kitchen tickets. BOTH: either.
  mode: 'BOTH',
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
  if (!index.exists()) throw new Error(t('errNoCompany'));
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
  });

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
    emit();
  }, () => {
    // No settings yet, or not readable: the defaults print a working receipt.
  }));
}

export function endSession() {
  while (subscriptions.length) subscriptions.pop()();
  session.uid = '';
  session.ws = '';
  session.products = [];
  session.byCode = new Map();
  session.categories = [];
  session.modifiers = [];
  session.discounts = [];
}
