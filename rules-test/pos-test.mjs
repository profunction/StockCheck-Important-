/**
 * The POS website's reads and writes, against the real firestore.rules in
 * the emulator.
 *
 * Each query is the shape web/js/ sends. The refusals matter as much as the
 * passes: a cashier who could edit a sale, rewrite a price or record a
 * delivery would make every figure the owner reads untrustworthy.
 *
 * Run: npx firebase emulators:exec --only firestore "node pos-test.mjs"
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
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const WS = 'w1';
const ws = (path) => `workspaces/${WS}/${path}`;

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-stockcheck',
  firestore: {
    rules: readFileSync('../firestore.rules', 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});
await testEnv.clearFirestore();

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const roles = {
    admin: { name: 'Admin', permissions: [], builtIn: true },
    cashier: { name: 'Cashier', permissions: ['POS_SELL'], builtIn: false },
    shiftLead: { name: 'Shift lead', permissions: ['POS_SELL', 'POS_VOID', 'POS_REPORTS'], builtIn: false },
    posManager: { name: 'POS manager', permissions: ['POS_MANAGE', 'POS_REPORTS'], builtIn: false },
    worker: { name: 'Worker', permissions: ['CREATE_STOCK_CHECK'], builtIn: true },
    keeper: { name: 'Keeper', permissions: ['RECORD_STOCK_MOVEMENTS'], builtIn: false },
    buyer: { name: 'Buyer', permissions: ['WH_PURCHASE'], builtIn: false },
    approver: { name: 'Approver', permissions: ['WH_APPROVE'], builtIn: false },
    hr: { name: 'HR', permissions: ['VIEW_USERS', 'CREATE_USER', 'EDIT_USER', 'DELETE_USER', 'EDIT_ROLE', 'CHANGE_PERMISSION'], builtIn: false },
    warehouse_manager: { name: 'Warehouse Manager', permissions: ['POS_MANAGE', 'WH_APPROVE'], builtIn: true },
  };
  for (const [id, data] of Object.entries(roles)) await setDoc(doc(db, ws(`roles/${id}`)), data);

  const user = (roleId, branchIds = []) => ({
    email: 'x@y.z', displayName: roleId, roleId, roleName: roleId, active: true, createdAt: 1, branchIds,
  });
  await setDoc(doc(db, ws('users/admin1')), user('admin'));
  await setDoc(doc(db, ws('users/cashier1')), user('cashier'));
  await setDoc(doc(db, ws('users/cashier2')), user('cashier'));
  await setDoc(doc(db, ws('users/ipohCashier')), user('cashier', ['ipoh']));
  await setDoc(doc(db, ws('users/lead')), user('shiftLead'));
  await setDoc(doc(db, ws('users/ipohLead')), user('shiftLead', ['ipoh']));
  await setDoc(doc(db, ws('users/mgr')), user('posManager'));
  await setDoc(doc(db, ws('users/worker1')), user('worker'));
  await setDoc(doc(db, ws('users/ipohKeeper')), user('keeper', ['ipoh']));
  await setDoc(doc(db, ws('users/keeper1')), user('keeper'));
  await setDoc(doc(db, ws('users/buyer1')), user('buyer'));
  await setDoc(doc(db, ws('users/approver1')), user('approver'));
  await setDoc(doc(db, ws('users/hr1')), user('hr'));
  await setDoc(doc(db, ws('purchaseOrders/ordered')), { poNo: 'PO-9', branchId: '', status: 'ORDERED', lines: [{ barcode: '9555', qtyMilli: 10000, receivedMilli: 0, costSen: 1400 }], createdAt: 1 });
  await setDoc(doc(db, ws('purchaseOrders/submitted')), { poNo: 'PO-8', branchId: '', status: 'SUBMITTED', lines: [], createdAt: 1 });
  await setDoc(doc(db, ws('customers/c1')), { name: 'Ah Seng', points: 500 });
  await setDoc(doc(db, 'workspaces/other/users/admin2'), user('admin'));
  await setDoc(doc(db, 'apiTokens/' + 'a'.repeat(64)), { workspaceId: WS, name: 'Shop', createdByUid: 'admin1', createdAt: 1 });

  await setDoc(doc(db, ws('products/9555')), { name: 'Milo', unit: 'pcs', active: true, priceSen: 1590 });
  await setDoc(doc(db, ws('sales/old1')), sale('cashier2', ''));
  await setDoc(doc(db, ws('sales/klSale')), sale('cashier2', 'kl'));
  await setDoc(doc(db, ws('orders/t1')), { branchId: '', table: 'T1', lines: [], updatedAt: 1 });
  await setDoc(doc(db, ws('pos/settings')), { shopName: 'Kedai' });
});

function sale(cashierUid, branchId, extra = {}) {
  return {
    receiptNo: '261007-120000-AB', branchId, cashierUid, cashierName: 'C', status: 'COMPLETED',
    createdAt: 1_790_000_000_000, lines: [{ barcode: '9555', name: 'Milo', qtyMilli: 2000, unitPriceSen: 1590, lineTotalSen: 3180 }],
    subtotalSen: 3180, totalSen: 3180, payments: [{ method: 'CASH', amountSen: 3200 }], changeSen: 20,
    ...extra,
  };
}

function sold(uid, branchId = '', extra = {}) {
  return {
    barcode: '9555', productName: 'Milo', branchId, type: 'SALE', quantityMilli: 2000, at: 1,
    source: 'POS', reference: 'r', note: '', createdByUid: uid, createdByName: 'C', createdAt: 1, ...extra,
  };
}

const as = (uid) => testEnv.authenticatedContext(uid).firestore();
const results = [];
const expect = async (name, shouldPass, run) => {
  let outcome = 'ok';
  let detail = '';
  try {
    await (shouldPass ? assertSucceeds(run()) : assertFails(run()));
  } catch (e) {
    outcome = 'WRONG';
    detail = (shouldPass ? 'was DENIED: ' : 'was ALLOWED: ') + String(e.message || e).split('\n')[0].slice(0, 140);
  }
  results.push({ name, outcome, detail });
};

// Ringing up a sale: the sale and its stock movement in one batch ---------------
await expect('cashier: sale + stock movement in one batch', true, () => {
  const db = as('cashier1');
  const batch = writeBatch(db);
  batch.set(doc(db, ws('sales/s1')), sale('cashier1', ''));
  batch.set(doc(db, ws('movements/pos-s1-0')), sold('cashier1'));
  return batch.commit();
});
await expect('cashier: sale in somebody else\'s name refused', false,
  () => setDoc(doc(as('cashier1'), ws('sales/s2')), sale('cashier2', '')));
await expect('cashier: sale written already voided refused', false,
  () => setDoc(doc(as('cashier1'), ws('sales/s3')), sale('cashier1', '', { status: 'VOIDED' })));
await expect('cashier: total that is not a whole number of sen refused', false,
  () => setDoc(doc(as('cashier1'), ws('sales/s4')), sale('cashier1', '', { totalSen: 31.8 })));
await expect('ipoh cashier: sale at Ipoh', true,
  () => setDoc(doc(as('ipohCashier'), ws('sales/s5')), sale('ipohCashier', 'ipoh')));
await expect('ipoh cashier: sale filed under KL refused', false,
  () => setDoc(doc(as('ipohCashier'), ws('sales/s6')), sale('ipohCashier', 'kl')));
await expect('worker without POS: sale refused', false,
  () => setDoc(doc(as('worker1'), ws('sales/s7')), sale('worker1', '')));

// What a cashier may do to stock: sell, nothing else ---------------------------
await expect('cashier: record a delivery refused', false,
  () => setDoc(doc(as('cashier1'), ws('movements/x1')), sold('cashier1', '', { type: 'RECEIVE' })));
await expect('cashier: sale movement not marked POS refused', false,
  () => setDoc(doc(as('cashier1'), ws('movements/x2')), sold('cashier1', '', { source: 'MANUAL' })));
await expect('cashier: rewrite an existing movement refused', false,
  () => setDoc(doc(as('cashier1'), ws('movements/pos-s1-0')), sold('cashier1', '', { quantityMilli: 1 })));
await expect('cashier: refund movement refused', false,
  () => setDoc(doc(as('cashier1'), ws('movements/x3')), sold('cashier1', '', { type: 'REFUND' })));

// Reading sales ---------------------------------------------------------------
await expect('cashier: own receipts', true,
  () => getDocs(query(collection(as('cashier1'), ws('sales')), where('cashierUid', '==', 'cashier1'))));
await expect('cashier: everybody\'s receipts refused', false,
  () => getDocs(collection(as('cashier1'), ws('sales'))));
await expect('cashier: another cashier\'s receipt refused', false,
  () => getDoc(doc(as('cashier1'), ws('sales/old1'))));
await expect('HQ shift lead: every receipt', true,
  () => getDocs(collection(as('lead'), ws('sales'))));
await expect('Ipoh shift lead: Ipoh receipts', true,
  () => getDocs(query(collection(as('ipohLead'), ws('sales')), where('branchId', 'in', ['ipoh', '']))));
await expect('Ipoh shift lead: every branch refused', false,
  () => getDocs(collection(as('ipohLead'), ws('sales'))));

// Voiding ---------------------------------------------------------------------
const voiding = (uid) => ({ status: 'VOIDED', voidedAt: 2, voidedByUid: uid, voidedByName: 'L', voidReason: 'wrong item' });
await expect('cashier: void refused', false,
  () => updateDoc(doc(as('cashier1'), ws('sales/s1')), voiding('cashier1')));
await expect('shift lead: void that also changes the total refused', false,
  () => updateDoc(doc(as('lead'), ws('sales/s1')), { ...voiding('lead'), totalSen: 0 }));
await expect('shift lead: void, and put the stock back', true, () => {
  const db = as('lead');
  const batch = writeBatch(db);
  batch.update(doc(db, ws('sales/s1')), voiding('lead'));
  batch.set(doc(db, ws('movements/void-s1-0')), sold('lead', '', { type: 'REFUND' }));
  return batch.commit();
});
await expect('shift lead: void a voided sale again refused', false,
  () => updateDoc(doc(as('lead'), ws('sales/s1')), voiding('lead')));
await expect('Ipoh shift lead: void a KL sale refused', false,
  () => updateDoc(doc(as('ipohLead'), ws('sales/klSale')), voiding('ipohLead')));
await expect('admin: delete a sale refused', false,
  () => deleteDoc(doc(as('admin1'), ws('sales/old1'))));

// Products, prices and settings ---------------------------------------------
await expect('POS manager: set a price', true,
  () => updateDoc(doc(as('mgr'), ws('products/9555')), { priceSen: 1690, updatedAt: 2 }));
await expect('POS manager: add a product with a photo', true,
  () => setDoc(doc(as('mgr'), ws('products/1111')), { name: 'Teh tarik', priceSen: 250, photoUrl: 'https://x', active: true }));
await expect('cashier: change a price refused', false,
  () => updateDoc(doc(as('cashier1'), ws('products/9555')), { priceSen: 1 }));
await expect('cashier: read register settings', true,
  () => getDoc(doc(as('cashier1'), ws('pos/settings'))));
await expect('cashier: change register settings refused', false,
  () => setDoc(doc(as('cashier1'), ws('pos/settings')), { taxPct: 0 }));
await expect('POS manager: change register settings', true,
  () => setDoc(doc(as('mgr'), ws('pos/settings')), { shopName: 'Kedai Baru', taxPct: 6 }));

// Open orders (restaurant tables, held sales) --------------------------------
await expect('cashier: open a table', true,
  () => setDoc(doc(as('cashier1'), ws('orders/t2')), { branchId: '', table: 'T2', lines: [], updatedAt: 1 }));
await expect('cashier: see open tables', true,
  () => getDocs(collection(as('cashier1'), ws('orders'))));
await expect('cashier: close a paid table', true,
  () => deleteDoc(doc(as('cashier1'), ws('orders/t1'))));
await expect('ipoh cashier: open tables at Ipoh', true,
  () => getDocs(query(collection(as('ipohCashier'), ws('orders')), where('branchId', '==', 'ipoh'))));
await expect('ipoh cashier: every branch\'s tables refused', false,
  () => getDocs(collection(as('ipohCashier'), ws('orders'))));
await expect('worker without POS: open tables refused', false,
  () => getDocs(collection(as('worker1'), ws('orders'))));

// Customers and points ------------------------------------------------------
await expect('cashier: look up customers', true, () => getDocs(collection(as('cashier1'), ws('customers'))));
await expect('cashier: add points after a sale', true,
  () => updateDoc(doc(as('cashier1'), ws('customers/c1')), { points: 510, visits: 1 }));
await expect('cashier: delete a customer refused', false, () => deleteDoc(doc(as('cashier1'), ws('customers/c1'))));
await expect('worker without POS: customers refused', false, () => getDocs(collection(as('worker1'), ws('customers'))));

// Purchase orders and transfers ---------------------------------------------
const po = (branchId, status = 'DRAFT') => ({ poNo: 'PO-1', branchId, status, lines: [], createdAt: 1 });
await expect('POS manager: create a purchase order', true, () => setDoc(doc(as('mgr'), ws('purchaseOrders/p1')), po('')));
await expect('cashier: purchase order refused', false, () => setDoc(doc(as('cashier1'), ws('purchaseOrders/p2')), po('')));
await expect('Ipoh keeper: Ipoh purchase orders', true,
  () => getDocs(query(collection(as('ipohKeeper'), ws('purchaseOrders')), where('branchId', 'in', ['ipoh', '']))));
await expect('Ipoh keeper: KL purchase order refused', false, () => setDoc(doc(as('ipohKeeper'), ws('purchaseOrders/p3')), po('kl')));
const tr = (fromBranch, toBranch, status = 'DRAFT') => ({ transferNo: 'TR-1', fromBranch, toBranch, status, lines: [], createdAt: 1 });
await expect('Ipoh keeper: transfer out of Ipoh', true, () => setDoc(doc(as('ipohKeeper'), ws('transfers/t1')), tr('ipoh', 'kl', 'SENT')));
await expect('Ipoh keeper: transfer between two other branches refused', false, () => setDoc(doc(as('ipohKeeper'), ws('transfers/t2')), tr('kl', 'penang')));
await expect('Ipoh keeper: stock out of Ipoh', true,
  () => setDoc(doc(as('ipohKeeper'), ws('movements/tr-out')), sold('ipohKeeper', 'ipoh', { type: 'TRANSFER_OUT', source: 'MANUAL' })));
await expect('Ipoh keeper: stock into KL refused (KL receives it)', false,
  () => setDoc(doc(as('ipohKeeper'), ws('movements/tr-in')), sold('ipohKeeper', 'kl', { type: 'TRANSFER_IN', source: 'MANUAL' })));

// Warehouse: buying, approving, receiving ------------------------------------
await expect('buyer: raise a purchase order', true, () => setDoc(doc(as('buyer1'), ws('purchaseOrders/b1')), po('')));
await expect('buyer: submit it for approval', true, () => setDoc(doc(as('buyer1'), ws('purchaseOrders/b1')), po('', 'SUBMITTED')));
await expect('buyer: approve their own order refused', false,
  () => updateDoc(doc(as('buyer1'), ws('purchaseOrders/submitted')), { status: 'APPROVED' }));
await expect('buyer: raise one already approved refused', false, () => setDoc(doc(as('buyer1'), ws('purchaseOrders/b2')), po('', 'APPROVED')));
await expect('buyer: skip approval straight to ordered refused', false,
  () => updateDoc(doc(as('buyer1'), ws('purchaseOrders/submitted')), { status: 'ORDERED' }));
await expect('approver: approve', true, () => updateDoc(doc(as('approver1'), ws('purchaseOrders/submitted')), { status: 'APPROVED' }));
await expect('buyer: mark an approved order as ordered', true,
  () => updateDoc(doc(as('buyer1'), ws('purchaseOrders/submitted')), { status: 'ORDERED' }));
await expect('admin: approve', true, () => setDoc(doc(as('admin1'), ws('purchaseOrders/a1')), po('', 'APPROVED')));
await expect('keeper: raise a purchase order refused', false, () => setDoc(doc(as('keeper1'), ws('purchaseOrders/k1')), po('')));
await expect('keeper: record goods arriving against an order', true,
  () => updateDoc(doc(as('keeper1'), ws('purchaseOrders/ordered')), {
    lines: [{ barcode: '9555', qtyMilli: 10000, receivedMilli: 8000, damagedMilli: 2000, costSen: 1400 }], status: 'RECEIVED', receivedAt: 2, updatedAt: 2,
  }));
await expect('keeper: change the price while receiving refused', false,
  () => updateDoc(doc(as('keeper1'), ws('purchaseOrders/submitted')), { note: 'cheaper', updatedAt: 3 }));
const receiving = (uid, branchId = '') => ({ receivingNo: 'GRN-1', poId: 'ordered', branchId, createdByUid: uid, createdAt: 1, lines: [{ barcode: '9555', receivedMilli: 8000, damagedMilli: 2000 }] });
await expect('keeper: record a delivery', true, () => setDoc(doc(as('keeper1'), ws('receivings/g1')), receiving('keeper1')));
await expect('keeper: the same delivery saved twice refused', false, () => setDoc(doc(as('keeper1'), ws('receivings/g1')), receiving('keeper1')));
await expect('keeper: a delivery in somebody else\'s name refused', false, () => setDoc(doc(as('keeper1'), ws('receivings/g2')), receiving('admin1')));
await expect('Ipoh keeper: a delivery for KL refused', false, () => setDoc(doc(as('ipohKeeper'), ws('receivings/g3')), receiving('ipohKeeper', 'kl')));
await expect('admin: delete a delivery record refused', false, () => deleteDoc(doc(as('admin1'), ws('receivings/g1'))));
await expect('buyer: read deliveries', true, () => getDocs(collection(as('buyer1'), ws('receivings'))));
await expect('cashier: read deliveries refused', false, () => getDocs(collection(as('cashier1'), ws('receivings'))));
await expect('buyer: keep the supplier list', true, () => setDoc(doc(as('buyer1'), ws('pos/suppliers')), { list: [{ id: 's1', name: 'Nestle' }] }));
await expect('buyer: change register settings refused', false, () => setDoc(doc(as('buyer1'), ws('pos/settings')), { shopName: 'x' }));
await expect('buyer: set reorder point, maximum and cost', true,
  () => updateDoc(doc(as('buyer1'), ws('products/9555')), { reorderLevelMilli: 30000, maxStockMilli: 100000, preferredSupplierId: 's1', costSen: 1430, updatedAt: 5 }));
await expect('buyer: change the selling price refused', false, () => updateDoc(doc(as('buyer1'), ws('products/9555')), { priceSen: 100 }));
await expect('keeper: adjust stock with a reason', true,
  () => setDoc(doc(as('keeper1'), ws('movements/adj1')), sold('keeper1', '', { type: 'WRITE_OFF', source: 'WAREHOUSE', reason: 'DAMAGED', kind: 'ADJUSTMENT' })));

// API tokens ----------------------------------------------------------------
const hash = 'b'.repeat(64);
await expect('admin: make an API token', true,
  () => setDoc(doc(as('admin1'), `apiTokens/${hash}`), { workspaceId: WS, name: 'Acc', createdByUid: 'admin1', createdAt: 1 }));
await expect('admin: list own company tokens', true,
  () => getDocs(query(collection(as('admin1'), 'apiTokens'), where('workspaceId', '==', WS))));
await expect('admin: list every token refused', false, () => getDocs(collection(as('admin1'), 'apiTokens')));
await expect('POS manager: make an API token refused', false,
  () => setDoc(doc(as('mgr'), `apiTokens/${'c'.repeat(64)}`), { workspaceId: WS, name: 'x', createdByUid: 'mgr', createdAt: 1 }));
await expect('other company admin: token for this company refused', false,
  () => setDoc(doc(as('admin2'), `apiTokens/${'d'.repeat(64)}`), { workspaceId: WS, name: 'x', createdByUid: 'admin2', createdAt: 1 }));
await expect('admin: token id that is not a hash refused', false,
  () => setDoc(doc(as('admin1'), 'apiTokens/short'), { workspaceId: WS, name: 'x', createdByUid: 'admin1', createdAt: 1 }));
await expect('admin: revoke a token', true, () => deleteDoc(doc(as('admin1'), `apiTokens/${hash}`)));

// Shifts -----------------------------------------------------------------------
const shift = (uid, extra = {}) => ({ operatorId: uid, operatorName: 'C', branchId: '', status: 'OPEN', openedAt: 5, floatSen: 20000, cashMoves: [], updatedAt: 5, ...extra });
await expect('cashier: open own shift', true, () => setDoc(doc(as('cashier1'), ws('shifts/sh1')), shift('cashier1')));
await expect('cashier: open a shift for someone else refused', false, () => setDoc(doc(as('cashier1'), ws('shifts/sh2')), shift('cashier2')));
await expect('cashier: a float that is not whole sen refused', false, () => setDoc(doc(as('cashier1'), ws('shifts/sh3')), shift('cashier1', { floatSen: 200.5 })));
await expect('cashier: change the opening float refused', false, () => updateDoc(doc(as('cashier1'), ws('shifts/sh1')), { floatSen: 50000 }));
await expect('cashier: pay out during the shift', true, () => updateDoc(doc(as('cashier1'), ws('shifts/sh1')), { cashMoves: [{ type: 'OUT', amountSen: 500, reason: 'ice', at: 6 }], updatedAt: 6 }));
await expect('another cashier: close my shift refused', false, () => updateDoc(doc(as('cashier2'), ws('shifts/sh1')), { status: 'CLOSED', closedAt: 9, closedByUid: 'cashier2', actualCashSen: 1, shortOverSen: 0, expectedCashSen: 1, summary: {}, updatedAt: 9 }));
await expect('cashier: close without counting refused', false, () => updateDoc(doc(as('cashier1'), ws('shifts/sh1')), { status: 'CLOSED', closedAt: 9, closedByUid: 'cashier1', updatedAt: 9 }));
await expect('cashier: close own shift with counted cash', true, () => updateDoc(doc(as('cashier1'), ws('shifts/sh1')), { status: 'CLOSED', closedAt: 9, closedByUid: 'cashier1', closedByName: 'C', actualCashSen: 19400, expectedCashSen: 19500, shortOverSen: -100, summary: { salesCount: 0 }, updatedAt: 9 }));
await expect('cashier: reopen a closed shift refused', false, () => updateDoc(doc(as('cashier1'), ws('shifts/sh1')), { status: 'OPEN', updatedAt: 10 }));
await expect('cashier: read own shifts', true, () => getDocs(query(collection(as('cashier1'), ws('shifts')), where('operatorId', '==', 'cashier1'))));
await expect('cashier: read everyone\'s shifts refused', false, () => getDocs(collection(as('cashier1'), ws('shifts'))));
await expect('cashier: open another shift', true, () => setDoc(doc(as('cashier2'), ws('shifts/sh4')), shift('cashier2')));
await expect('POS manager: close a cashier\'s shift', true, () => updateDoc(doc(as('mgr'), ws('shifts/sh4')), { status: 'CLOSED', closedAt: 9, closedByUid: 'mgr', closedByName: 'M', actualCashSen: 20000, expectedCashSen: 20000, shortOverSen: 0, summary: {}, updatedAt: 9 }));
await expect('admin: delete a shift refused', false, () => deleteDoc(doc(as('admin1'), ws('shifts/sh4'))));
await expect('cashier: register this till', true, () => setDoc(doc(as('cashier1'), ws('tills/t-abc')), { name: 'Counter 1', lastSeenAt: 1 }));
await expect('cashier: remove a till refused', false, () => deleteDoc(doc(as('cashier1'), ws('tills/t-abc'))));
await expect('POS manager: remove a till', true, () => deleteDoc(doc(as('mgr'), ws('tills/t-abc'))));

// PDPA ---------------------------------------------------------------------------
await expect('POS manager: blank an erased customer on a receipt', true,
  () => updateDoc(doc(as('mgr'), ws('sales/old1')), { customerId: '', customerName: '', customerPhone: '', customerErased: true }));
await expect('POS manager: change a receipt\'s amount refused', false, () => updateDoc(doc(as('mgr'), ws('sales/old1')), { totalSen: 1 }));
await expect('POS manager: put another name on a receipt refused', false,
  () => updateDoc(doc(as('mgr'), ws('sales/old1')), { customerId: '', customerName: 'Someone', customerPhone: '', customerErased: true }));
await expect('cashier: blank a receipt\'s customer refused', false,
  () => updateDoc(doc(as('cashier1'), ws('sales/old1')), { customerId: '', customerName: '', customerPhone: '', customerErased: true }));

// Plans: a part the plan leaves out ------------------------------------------------
await testEnv.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `licences/${WS}`), { plan: 'APP_ONLY', status: 'ACTIVE', expiresAt: 0, modules: { app: true, pos: false, warehouse: false, api: false } }));
await expect('app-only plan: a sale refused', false, () => setDoc(doc(as('cashier1'), ws('sales/s-app')), sale('cashier1', '')));
await expect('app-only plan: a purchase order refused', false,
  () => setDoc(doc(as('buyer1'), ws('purchaseOrders/po-app')), { poNo: 'PO-A', branchId: '', status: 'DRAFT', lines: [], createdAt: 1 }));
await expect('app-only plan: a transfer refused', false,
  () => setDoc(doc(as('keeper1'), ws('transfers/tr-app')), { fromBranch: '', toBranch: 'ipoh', status: 'DRAFT', lines: [], createdAt: 1 }));
await expect('app-only plan: a delivery refused', false, () => setDoc(doc(as('keeper1'), ws('receivings/g-app')), receiving('keeper1')));
await expect('app-only plan: other company data still refused', false, () => getDocs(collection(as('admin2'), ws('sales'))));
await testEnv.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `licences/${WS}`), { plan: 'POS_ONLY', status: 'ACTIVE', expiresAt: 0, modules: { app: false, pos: true, warehouse: true, api: false } }));
await expect('till-only plan: a sale', true, () => setDoc(doc(as('cashier1'), ws('sales/s-pos')), sale('cashier1', '')));
await expect('till-only plan (warehouse included): a purchase order', true,
  () => setDoc(doc(as('buyer1'), ws('purchaseOrders/po-pos')), { poNo: 'PO-P', branchId: '', status: 'DRAFT', lines: [], createdAt: 1 }));
await testEnv.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), `licences/${WS}`)));
await expect('no licence (older shops): a sale still goes through', true, () => setDoc(doc(as('cashier1'), ws('sales/s-nolic')), sale('cashier1', '')));

// POS mode: chosen once; only an admin changes it -------------------------
await testEnv.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), ws('pos/settings')), { shopName: 'Kedai', mode: '' }));
await expect('POS manager: first choice of the till mode', true,
  () => setDoc(doc(as('mgr'), ws('pos/settings')), { shopName: 'Kedai', mode: 'RETAIL' }));
await expect('POS manager: other settings, same mode', true,
  () => setDoc(doc(as('mgr'), ws('pos/settings')), { shopName: 'Kedai 2', mode: 'RETAIL' }));
await expect('POS manager: changing the mode afterwards refused', false,
  () => setDoc(doc(as('mgr'), ws('pos/settings')), { shopName: 'Kedai 2', mode: 'FNB' }));
await expect('admin: changing the mode', true,
  () => setDoc(doc(as('admin1'), ws('pos/settings')), { shopName: 'Kedai 2', mode: 'FNB' }));
await expect('POS manager: other pos documents still writable', true,
  () => setDoc(doc(as('mgr'), ws('pos/categories')), { list: [] }));

// Signing up: staff join with the company code; only the founder is admin --
const reg = (roleId, joinCode) => ({ email: 'n@x.my', displayName: 'New', roleId, roleName: roleId, active: true, createdAt: 1, lastSeenAt: 1, joinCode });
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), ws('meta/config')), { companyName: 'Kedai', joinCode: 'KEDAI1' });
  await setDoc(doc(ctx.firestore(), 'workspaceCodes/KEDAI1'), { workspaceId: WS, companyName: 'Kedai', createdAt: 1, createdByUid: 'admin1' });
});
await expect('sign-up: join with the right code as staff', true, () => setDoc(doc(as('newbie1'), ws('users/newbie1')), reg('worker', 'KEDAI1')));
await expect('sign-up: wrong code refused', false, () => setDoc(doc(as('newbie2'), ws('users/newbie2')), reg('worker', 'NOPE')));
await expect('sign-up: knowing the code is not enough to be admin', false, () => setDoc(doc(as('newbie3'), ws('users/newbie3')), reg('admin', 'KEDAI1')));
await expect('sign-up: nor to join as a manager', false, () => setDoc(doc(as('newbie4'), ws('users/newbie4')), reg('warehouse_manager', 'KEDAI1')));

// User administration without being an admin: never up to admin ------------
const staff = (roleId) => ({ email: 's@x.my', displayName: 'S', roleId, roleName: roleId, active: true, createdAt: 1, branchIds: [] });
await expect('HR: adds a worker', true, () => setDoc(doc(as('hr1'), ws('users/hire1')), staff('worker')));
await expect('HR: cannot add an admin', false, () => setDoc(doc(as('hr1'), ws('users/hire2')), staff('admin')));
await expect('HR: moves a worker to another role', true, () => updateDoc(doc(as('hr1'), ws('users/worker1')), { roleId: 'cashier' }));
await expect('HR: cannot make someone admin', false, () => updateDoc(doc(as('hr1'), ws('users/cashier1')), { roleId: 'admin' }));
await expect('HR: cannot make themselves admin', false, () => updateDoc(doc(as('hr1'), ws('users/hr1')), { roleId: 'admin' }));
await expect('HR: cannot switch off the admin', false, () => updateDoc(doc(as('hr1'), ws('users/admin1')), { active: false }));
await expect('HR: cannot remove the admin', false, () => deleteDoc(doc(as('hr1'), ws('users/admin1'))));
await expect('HR: cannot widen their own role', false, () => updateDoc(doc(as('hr1'), ws('roles/hr')), { permissions: ['POS_MANAGE'] }));
await expect('HR: may edit another role', true, () => updateDoc(doc(as('hr1'), ws('roles/cashier')), { permissions: ['POS_SELL', 'POS_VOID'] }));
await expect('admin: still makes another admin', true, () => updateDoc(doc(as('admin1'), ws('users/hire1')), { roleId: 'admin' }));
// A new company: claim the code, roles, then the founder's own admin profile, then its settings.
const NEW = 'newco';
const nws = (p) => `workspaces/${NEW}/${p}`;
await expect('new company: claim its code', true,
  () => setDoc(doc(as('founder'), 'workspaceCodes/NEWCO'), { workspaceId: NEW, companyName: 'New Co', createdAt: 1, createdByUid: 'founder' }));
await expect('new company: built-in roles', true,
  () => setDoc(doc(as('founder'), nws('roles/admin')), { name: 'Admin', permissions: [], builtIn: true }));
await expect('new company: settings before the founder is admin refused', false,
  () => setDoc(doc(as('founder'), nws('meta/config')), { companyName: 'New Co', joinCode: 'NEWCO' }));
await expect('new company: someone else cannot be its admin', false,
  () => setDoc(doc(as('stranger'), nws('users/stranger')), reg('admin', 'NEWCO')));
await expect('new company: the founder is its admin', true,
  () => setDoc(doc(as('founder'), nws('users/founder')), reg('admin', 'NEWCO')));
await expect('new company: then its settings', true,
  () => setDoc(doc(as('founder'), nws('meta/config')), { companyName: 'New Co', joinCode: 'NEWCO' }));
await expect('new company: and its trial', true,
  () => setDoc(doc(as('founder'), `licences/${NEW}`), { plan: 'TRIAL', status: 'ACTIVE', seats: 5, startedAt: Date.now(), expiresAt: Date.now() + 14 * 86400000 }));

// The bot and notifications ------------------------------------------------
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'userIndex/cashier1'), { workspaceId: WS });
  await setDoc(doc(ctx.firestore(), 'telegramChats/555'), { workspaceId: WS, uid: 'cashier1', daily: true });
});
const soon = () => Date.now() + 10 * 60 * 1000;
await expect('telegram: a link code for yourself', true,
  () => setDoc(doc(as('cashier1'), 'telegramLinks/ABCDEFGHJKLM'), { workspaceId: WS, uid: 'cashier1', expiresAt: soon() }));
await expect('telegram: not for someone else', false,
  () => setDoc(doc(as('cashier1'), 'telegramLinks/ABCDEFGHJKLN'), { workspaceId: WS, uid: 'admin1', expiresAt: soon() }));
await expect('telegram: not into another company', false,
  () => setDoc(doc(as('cashier1'), 'telegramLinks/ABCDEFGHJKLP'), { workspaceId: 'other', uid: 'cashier1', expiresAt: soon() }));
await expect('telegram: not for days', false,
  () => setDoc(doc(as('cashier1'), 'telegramLinks/ABCDEFGHJKLQ'), { workspaceId: WS, uid: 'cashier1', expiresAt: Date.now() + 86400000 }));
await expect('telegram: codes cannot be read back', false, () => getDoc(doc(as('cashier1'), 'telegramLinks/ABCDEFGHJKLM')));
await expect('telegram: my chat, report off', true, () => updateDoc(doc(as('cashier1'), 'telegramChats/555'), { daily: false }));
await expect('telegram: cannot move my chat to another account', false, () => updateDoc(doc(as('cashier1'), 'telegramChats/555'), { uid: 'admin1' }));
await expect('telegram: someone else cannot see my chat', false, () => getDoc(doc(as('cashier2'), 'telegramChats/555')));
await expect('telegram: nobody files a chat but the bot', false,
  () => setDoc(doc(as('cashier1'), 'telegramChats/666'), { workspaceId: WS, uid: 'cashier1', daily: true }));
await expect('push: my own token', true, () => setDoc(doc(as('cashier1'), ws('users/cashier1/pushTokens/tok1')), { platform: 'web' }));
await expect('push: not on someone else', false, () => setDoc(doc(as('cashier1'), ws('users/cashier2/pushTokens/tok1')), { platform: 'web' }));
await expect('public config: readable, not writable', false, () => setDoc(doc(as('admin1'), 'publicConfig/telegram'), { username: 'x' }));

const width = Math.max(...results.map((r) => r.name.length));
let failed = 0;
for (const r of results) {
  if (r.outcome !== 'ok') failed++;
  console.log(`${r.outcome === 'ok' ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
await testEnv.cleanup();
process.exit(failed === 0 ? 0 : 1);
