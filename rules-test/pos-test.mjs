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
    bookkeeper: { name: 'Bookkeeper', permissions: ['BOOKS_POST'], builtIn: false },
    bookAdmin: { name: 'Accountant', permissions: ['BOOKS_ADMIN'], builtIn: false },
    bookViewer: { name: 'Books viewer', permissions: ['BOOKS_VIEW'], builtIn: false },
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
  await setDoc(doc(db, ws('users/bk1')), user('bookkeeper'));
  await setDoc(doc(db, ws('users/bkAdmin')), user('bookAdmin'));
  await setDoc(doc(db, ws('users/bkViewer')), user('bookViewer'));
  await setDoc(doc(db, ws('purchaseOrders/ordered')), { poNo: 'PO-9', branchId: '', status: 'ORDERED', lines: [{ barcode: '9555', qtyMilli: 10000, receivedMilli: 0, costSen: 1400 }], createdAt: 1 });
  await setDoc(doc(db, ws('purchaseOrders/submitted')), { poNo: 'PO-8', branchId: '', status: 'SUBMITTED', lines: [], createdAt: 1 });
  await setDoc(doc(db, ws('customers/c1')), { name: 'Ah Seng', points: 500 });
  await setDoc(doc(db, 'workspaces/other/users/admin2'), user('admin'));
  await setDoc(doc(db, 'apiTokens/' + 'a'.repeat(64)), { workspaceId: WS, name: 'Shop', createdByUid: 'admin1', createdAt: 1 });

  await setDoc(doc(db, ws('products/9555')), { name: 'Milo', unit: 'pcs', active: true, priceSen: 1590 });
  await setDoc(doc(db, ws('sales/old1')), sale('cashier2', ''));
  await setDoc(doc(db, ws('sales/klSale')), sale('cashier2', 'kl'));
  await setDoc(doc(db, ws('orders/t1')), { branchId: '', table: 'T1', lines: [], updatedAt: 1 });
  await setDoc(doc(db, ws('selfOrders/q1')), { branchId: '', table: '5', orderType: 'DINE_IN', lines: [{ barcode: '9555', qtyMilli: 1000, unitPriceSen: 1590 }], status: 'NEW', open: true, totalSen: 1590, createdAt: 1 });
  await setDoc(doc(db, ws('selfOrders/qKl')), { branchId: 'kl', table: '', orderType: 'TAKEAWAY', lines: [], status: 'NEW', createdAt: 1 });
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

// Orders sent by QR code ------------------------------------------------------
await expect('cashier: see orders sent by QR', true,
  () => getDocs(collection(as('cashier1'), ws('selfOrders'))));
await expect('cashier: accept one into a table', true,
  () => updateDoc(doc(as('cashier1'), ws('selfOrders/q1')), { status: 'ACCEPTED', open: false, mergedInto: 't1', handledByName: 'C', updatedAt: 2 }));
await expect('cashier: change the prices on it refused', false,
  () => updateDoc(doc(as('cashier1'), ws('selfOrders/q1')), { totalSen: 1, updatedAt: 3 }));
await expect('cashier: a made-up status refused', false,
  () => updateDoc(doc(as('cashier1'), ws('selfOrders/q1')), { status: 'PAID', updatedAt: 3 }));
await expect('cashier: write an order as if a customer sent it refused', false,
  () => setDoc(doc(as('cashier1'), ws('selfOrders/fake')), { branchId: '', status: 'NEW', lines: [] }));
await expect('ipoh cashier: KL\'s QR orders refused', false,
  () => getDocs(collection(as('ipohCashier'), ws('selfOrders'))));
await expect('worker without POS: QR orders refused', false,
  () => getDocs(collection(as('worker1'), ws('selfOrders'))));
await expect('nobody: the pickup counter', false,
  () => getDoc(doc(as('admin1'), ws('selfOrderDays/-_2026-10-08'))));

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

// Warehouse round two: approval, returns, reservations, month end -----------
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, ws('pos/settings')), { transferApproval: true }, { merge: true });
  await setDoc(doc(db, ws('transfers/pend')), { transferNo: 'TR-P', fromBranch: '', toBranch: 'ipoh', status: 'PENDING', lines: [{ barcode: '9555', qtyMilli: 1000 }], createdAt: 1 });
  await setDoc(doc(db, ws('transfers/appr')), { transferNo: 'TR-A', fromBranch: '', toBranch: 'ipoh', status: 'APPROVED', lines: [{ barcode: '9555', qtyMilli: 1000 }], createdAt: 1 });
  await setDoc(doc(db, ws('supplierReturns/r1')), { returnNo: 'RTN-1', branchId: '', status: 'OPEN', lines: [], createdByUid: 'keeper1', createdAt: 1 });
  await setDoc(doc(db, ws('reservations/v1')), { reservationNo: 'RSV-1', branchId: '', status: 'OPEN', lines: [], createdAt: 1 });
  await setDoc(doc(db, ws('stockClosings/2026-09_-')), { month: '2026-09', branchId: '', lines: [], valueSen: 0, createdAt: 1 });
  await setDoc(doc(db, ws('products/9555')), { name: 'Milo', priceSen: 1590 });
});
const trDraft = (status) => ({ transferNo: 'TR-9', fromBranch: '', toBranch: 'ipoh', status, lines: [{ barcode: '9555', qtyMilli: 1000 }], createdAt: 1 });
await expect('approval on: keeper sends a transfer straight out refused', false, () => setDoc(doc(as('keeper1'), ws('transfers/k1')), trDraft('SENT')));
await expect('approval on: keeper sends it for approval', true, () => setDoc(doc(as('keeper1'), ws('transfers/k2')), trDraft('PENDING')));
await expect('approval on: keeper approves refused', false, () => updateDoc(doc(as('keeper1'), ws('transfers/pend')), { status: 'APPROVED' }));
await expect('approval on: keeper dispatches a pending one refused', false, () => updateDoc(doc(as('keeper1'), ws('transfers/pend')), { status: 'SENT' }));
await expect('approver approves a pending transfer', true,
  () => updateDoc(doc(as('approver1'), ws('transfers/pend')), { status: 'APPROVED', approvedByUid: 'approver1', approvedByName: 'A', approvedAt: 2, updatedAt: 2 }));
await expect('approver cannot change the lines while approving', false,
  () => updateDoc(doc(as('approver1'), ws('transfers/appr')), { status: 'DRAFT', lines: [] }));
await expect('keeper dispatches an approved transfer as approved', true, () => updateDoc(doc(as('keeper1'), ws('transfers/appr')), { status: 'SENT', sentAt: 3, expiries: {} }));
await testEnv.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), ws('transfers/appr2')), { transferNo: 'TR-B', fromBranch: '', toBranch: 'ipoh', status: 'APPROVED', lines: [{ barcode: '9555', qtyMilli: 1000 }], createdAt: 1 }));
await expect('keeper sends more than was approved refused', false,
  () => updateDoc(doc(as('keeper1'), ws('transfers/appr2')), { status: 'SENT', lines: [{ barcode: '9555', qtyMilli: 9000 }] }));
await expect('keeper: carton size and shelf on a product', true, () => updateDoc(doc(as('keeper1'), ws('products/9555')), { packSize: 24, packName: 'ctn', shelves: { '-': 'A-1' }, updatedAt: 1 }));
await expect('keeper: selling price still refused', false, () => updateDoc(doc(as('keeper1'), ws('products/9555')), { priceSen: 1 }));
await expect('keeper: record a supplier return', true,
  () => setDoc(doc(as('keeper1'), ws('supplierReturns/r2')), { returnNo: 'RTN-2', branchId: '', status: 'OPEN', lines: [], createdByUid: 'keeper1', createdAt: 1 }));
await expect('keeper: mark it credited refused (the buyer does)', false, () => updateDoc(doc(as('keeper1'), ws('supplierReturns/r1')), { status: 'CREDITED', creditNo: 'CN' }));
await expect('buyer: note the credit note', true, () => updateDoc(doc(as('buyer1'), ws('supplierReturns/r1')), { status: 'CREDITED', creditNo: 'CN-1', creditSen: 100, creditedAt: 1, creditedByName: 'B', updatedAt: 1 }));
await expect('buyer: change what went back refused', false, () => updateDoc(doc(as('buyer1'), ws('supplierReturns/r2')), { status: 'CREDITED', lines: [{ x: 1 }] }));
await expect('keeper: reserve stock', true, () => setDoc(doc(as('keeper1'), ws('reservations/v2')), { reservationNo: 'RSV-2', branchId: '', status: 'OPEN', lines: [], createdAt: 1 }));
await expect('keeper: deliver a reservation', true, () => updateDoc(doc(as('keeper1'), ws('reservations/v1')), { status: 'DELIVERED', closedAt: 1, closedByName: 'K', updatedAt: 1 }));
await expect('keeper: reopen it refused', false, () => updateDoc(doc(as('keeper1'), ws('reservations/v1')), { status: 'OPEN' }));
await expect('cashier: reserve stock refused', false, () => setDoc(doc(as('cashier1'), ws('reservations/v3')), { reservationNo: 'RSV-3', branchId: '', status: 'OPEN', lines: [], createdAt: 1 }));
await expect('approver: close a month', true, () => setDoc(doc(as('approver1'), ws('stockClosings/2026-08_-')), { month: '2026-08', branchId: '', lines: [], valueSen: 0, createdAt: 1 }));
await expect('approver: rewrite a closed month refused', false, () => setDoc(doc(as('approver1'), ws('stockClosings/2026-09_-')), { month: '2026-09', branchId: '', lines: [], valueSen: 1, createdAt: 1 }));
await expect('keeper: close a month refused', false, () => setDoc(doc(as('keeper1'), ws('stockClosings/2026-07_-')), { month: '2026-07', branchId: '', lines: [], valueSen: 0, createdAt: 1 }));
await testEnv.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), ws('pos/settings')), { transferApproval: false }, { merge: true }));

// Connections to other systems: the owner sets them up; their keys are server-only.
const conn = { name: 'Kawan POS', mode: 'PULL', baseUrl: 'https://api.kawan.my', feeds: [{ kind: 'sales' }] };
await expect('admin: set up a connection', true, () => setDoc(doc(as('admin1'), ws('connections/k1')), conn));
await expect('keeper: set up a connection refused', false, () => setDoc(doc(as('keeper1'), ws('connections/k2')), conn));
await expect('keeper: read a connection refused', false, () => getDoc(doc(as('keeper1'), ws('connections/k1'))));
await expect('admin: read the keys refused', false, () => getDoc(doc(as('admin1'), 'connectionSecrets/w1__k1')));
await expect('admin: write a key refused (the server does)', false, () => setDoc(doc(as('admin1'), 'connectionSecrets/w1__k1'), { value: 'x' }));

// JSOX TMS: lorries and drivers by a manager; shifts and trips by whoever moves stock.
await expect('approver: add a lorry', true, () => setDoc(doc(as('approver1'), ws('tmsLorries/l1')), { plate: 'WXY 1234', active: true }));
await expect('keeper: add a lorry refused', false, () => setDoc(doc(as('keeper1'), ws('tmsLorries/l2')), { plate: 'ABC 1', active: true }));
await expect('approver: add a driver', true, () => setDoc(doc(as('approver1'), ws('tmsDrivers/d1')), { name: 'Ali', active: true }));
await expect('keeper: delete a lorry refused', false, () => deleteDoc(doc(as('keeper1'), ws('tmsLorries/l1'))));
await expect('keeper: clock a driver in', true, () => setDoc(doc(as('keeper1'), ws('tmsShifts/s1')), { driverId: 'd1', lorryId: 'l1', inAt: 100, outAt: null, createdByUid: 'keeper1' }));
await expect('keeper: change the clock-in time refused', false, () => updateDoc(doc(as('keeper1'), ws('tmsShifts/s1')), { inAt: 1 }));
await expect('keeper: clock the driver out', true, () => updateDoc(doc(as('keeper1'), ws('tmsShifts/s1')), { outAt: 200, odoOut: 50, outByName: 'K', updatedAt: 200 }));
await expect('keeper: clock out twice refused', false, () => updateDoc(doc(as('keeper1'), ws('tmsShifts/s1')), { outAt: 300 }));
const trip = (over = {}) => ({ tripNo: 'TRP-1', branchId: '', status: 'PLANNED', lorryId: 'l1', plate: 'WXY 1234', driverId: 'd1', driverName: 'Ali', stops: [{ kind: 'TRANSFER', refId: 'appr2', ref: 'TR-B', status: 'PENDING' }], createdByUid: 'keeper1', createdAt: 1, ...over });
await expect('keeper: plan a trip', true, () => setDoc(doc(as('keeper1'), ws('tmsTrips/t1')), trip()));
await expect('keeper: plan one with no stops refused', false, () => setDoc(doc(as('keeper1'), ws('tmsTrips/t2')), trip({ stops: [] })));
await expect('cashier: plan a trip refused', false, () => setDoc(doc(as('cashier1'), ws('tmsTrips/t3')), trip({ createdByUid: 'cashier1' })));
await expect('keeper: leave the depot', true, () => updateDoc(doc(as('keeper1'), ws('tmsTrips/t1')), { status: 'ON_ROAD', departedAt: 2, updatedAt: 2 }));
await expect('keeper: swap the lorry on the road refused', false, () => updateDoc(doc(as('keeper1'), ws('tmsTrips/t1')), { lorryId: 'l9' }));
await expect('keeper: a stop delivered and the trip finished', true, () => updateDoc(doc(as('keeper1'), ws('tmsTrips/t1')), { status: 'DONE', stops: [{ kind: 'TRANSFER', refId: 'appr2', ref: 'TR-B', status: 'DELIVERED', receivedBy: 'Siti', signature: '1,1 2,2 3,3 4,4' }], doneAt: 3, updatedAt: 3 }));
await expect('keeper: rewrite a finished trip refused', false, () => updateDoc(doc(as('keeper1'), ws('tmsTrips/t1')), { stops: [] }));
await expect('keeper: delete a trip refused', false, () => deleteDoc(doc(as('keeper1'), ws('tmsTrips/t1'))));

// Picking: a record of who took what off the shelves; no stock moves.
const pick = (over = {}) => ({ pickNo: 'PCK-1', branchId: '', status: 'WAITING', orders: [{ kind: 'TRANSFER', id: 'appr2', ref: 'TR-B' }], lines: [{ barcode: '9555', qtyMilli: 1000, pickedMilli: 0 }], pickerUid: '', createdByUid: 'keeper1', createdAt: 1, ...over });
await expect('keeper: make a picklist', true, () => setDoc(doc(as('keeper1'), ws('picklists/p1')), pick()));
await expect('keeper: make one already done refused', false, () => setDoc(doc(as('keeper1'), ws('picklists/p2')), pick({ status: 'DONE' })));
await expect('keeper: make one in someone else\'s name refused', false, () => setDoc(doc(as('keeper1'), ws('picklists/p3')), pick({ createdByUid: 'buyer1' })));
await expect('cashier: make a picklist refused', false, () => setDoc(doc(as('cashier1'), ws('picklists/p4')), pick({ createdByUid: 'cashier1' })));
await expect('keeper: start picking as themself', true, () => updateDoc(doc(as('keeper1'), ws('picklists/p1')), { status: 'PICKING', pickerUid: 'keeper1', pickerName: 'K', startedAt: 2, updatedAt: 2 }));
await expect('keeper: name somebody else the picker refused', false, () => updateDoc(doc(as('keeper1'), ws('picklists/p1')), { pickerUid: 'buyer1' }));
await expect('keeper: change which orders it covers refused', false, () => updateDoc(doc(as('keeper1'), ws('picklists/p1')), { orders: [] }));
await expect('keeper: finish it', true, () => updateDoc(doc(as('keeper1'), ws('picklists/p1')), { status: 'DONE', lines: [{ barcode: '9555', qtyMilli: 1000, pickedMilli: 1000 }], doneAt: 3, updatedAt: 3 }));
await expect('keeper: reopen a finished one refused', false, () => updateDoc(doc(as('keeper1'), ws('picklists/p1')), { status: 'PICKING' }));
await expect('keeper: delete a picklist refused', false, () => deleteDoc(doc(as('keeper1'), ws('picklists/p1'))));

// Outbound: packing an order going out and loading it; no stock moves.
const packRec = (over = {}) => ({ kind: 'TRANSFER', orderId: 'appr2', ref: 'TR-B', branchId: '', status: 'OPEN', urgent: true, createdByUid: 'keeper1', createdAt: 1, ...over });
await expect('keeper: mark an order urgent', true, () => setDoc(doc(as('keeper1'), ws('outbound/TR-appr2')), packRec()));
await expect('keeper: a packing record in someone else\'s name refused', false, () => setDoc(doc(as('keeper1'), ws('outbound/TR-x')), packRec({ orderId: 'x', createdByUid: 'buyer1' })));
await expect('keeper: one already loaded refused', false, () => setDoc(doc(as('keeper1'), ws('outbound/TR-y')), packRec({ orderId: 'y', status: 'LOADED' })));
await expect('cashier: pack an order refused', false, () => setDoc(doc(as('cashier1'), ws('outbound/TR-z')), packRec({ orderId: 'z', createdByUid: 'cashier1' })));
await expect('keeper: pack it into lane S2', true, () => updateDoc(doc(as('keeper1'), ws('outbound/TR-appr2')), { status: 'PACKED', cartons: 2, lane: 'S2', packedAt: 2, packedByName: 'K', updatedAt: 2 }));
await expect('keeper: change which order it is refused', false, () => updateDoc(doc(as('keeper1'), ws('outbound/TR-appr2')), { orderId: 'other' }));
await expect('keeper: load it at OUT-1', true, () => updateDoc(doc(as('keeper1'), ws('outbound/TR-appr2')), { status: 'LOADED', tripId: 't1', dock: 'OUT-1', loadedAt: 3, loadedByName: 'K', updatedAt: 3 }));
await expect('keeper: delete a packing record refused', false, () => deleteDoc(doc(as('keeper1'), ws('outbound/TR-appr2'))));

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

// JSOX Books ----------------------------------------------------------------
const LOCK = Date.UTC(2026, 0, 31);
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, ws('bkMeta/settings')), { lockDate: LOCK });
  await setDoc(doc(db, ws('bkDocs/issued')), { type: 'INVOICE', status: 'ISSUED', no: 'INV-2026-00001', date: LOCK + 86400000, lines: [{ description: 'Milo', qtyMilli: 1000, unitPriceSen: 1590 }], createdByUid: 'bk1', createdAt: 1 });
  await setDoc(doc(db, ws('bkDocs/old')), { type: 'INVOICE', status: 'ISSUED', no: 'INV-2026-00000', date: LOCK - 86400000, lines: [], createdByUid: 'bk1', createdAt: 1 });
  await setDoc(doc(db, ws('bkDocs/draft')), { type: 'INVOICE', status: 'DRAFT', no: '', date: LOCK + 86400000, lines: [], createdByUid: 'bk1', createdAt: 1 });
  await setDoc(doc(db, ws('bkJournal/j1')), { no: 'JE-1', date: LOCK + 86400000, lines: [{ account: '1100', debitSen: 1590, creditSen: 0 }, { account: '4000', debitSen: 0, creditSen: 1590 }], createdByUid: 'bk1', createdAt: 1 });
  await setDoc(doc(db, ws('bkPayments/p1')), { direction: 'IN', status: 'POSTED', amountSen: 1590, date: LOCK + 86400000, allocations: [], createdByUid: 'bk1', createdAt: 1 });
});
const OPEN = LOCK + 2 * 86400000;
const entry = (uid, date = OPEN) => ({ no: 'JE-2', date, memo: '', source: 'MANUAL', lines: [{ account: '6100', debitSen: 100000, creditSen: 0 }, { account: '1010', debitSen: 0, creditSen: 100000 }], createdByUid: uid, createdAt: 1 });
const bkDoc = (uid, status = 'DRAFT', date = OPEN) => ({ type: 'INVOICE', status, no: '', date, lines: [], contactId: 'c1', createdByUid: uid, createdAt: 1 });
await expect('books: viewer reads the journal', true, () => getDocs(collection(as('bkViewer'), ws('bkJournal'))));
await expect('books: cashier reads the journal refused', false, () => getDocs(collection(as('cashier1'), ws('bkJournal'))));
await expect('books: viewer posts an entry refused', false, () => setDoc(doc(as('bkViewer'), ws('bkJournal/v1')), entry('bkViewer')));
await expect('books: bookkeeper posts an entry', true, () => setDoc(doc(as('bk1'), ws('bkJournal/k1')), entry('bk1')));
await expect('books: an entry in a closed period refused', false, () => setDoc(doc(as('bk1'), ws('bkJournal/k2')), entry('bk1', LOCK)));
await expect('books: an entry in somebody else\'s name refused', false, () => setDoc(doc(as('bk1'), ws('bkJournal/k3')), entry('bkAdmin')));
await expect('books: change a posted entry refused', false, () => updateDoc(doc(as('bkAdmin'), ws('bkJournal/j1')), { memo: 'x' }));
await expect('books: delete a posted entry refused', false, () => deleteDoc(doc(as('admin1'), ws('bkJournal/j1'))));
await expect('books: bookkeeper writes a draft invoice', true, () => setDoc(doc(as('bk1'), ws('bkDocs/d2')), bkDoc('bk1')));
await expect('books: bookkeeper issues the draft', true, () => updateDoc(doc(as('bk1'), ws('bkDocs/draft')), { status: 'ISSUED', no: 'INV-2026-00002' }));
await expect('books: change an issued invoice\'s lines refused', false, () => updateDoc(doc(as('bk1'), ws('bkDocs/issued')), { lines: [] }));
await expect('books: note the e-invoice on an issued invoice', true, () => updateDoc(doc(as('bk1'), ws('bkDocs/issued')), { einvoice: { status: 'DOWNLOADED' }, updatedAt: 2 }));
await expect('books: void an issued invoice', true, () => updateDoc(doc(as('bk1'), ws('bkDocs/issued')), { status: 'VOID', voidedAt: 2, voidedByName: 'K', voidJournalId: 'j9', updatedAt: 2 }));
await expect('books: un-void it refused', false, () => updateDoc(doc(as('bk1'), ws('bkDocs/issued')), { status: 'ISSUED' }));
await expect('books: void one in a closed period refused', false, () => updateDoc(doc(as('bk1'), ws('bkDocs/old')), { status: 'VOID', voidedAt: 2 }));
await expect('books: an invoice dated in a closed period refused', false, () => setDoc(doc(as('bk1'), ws('bkDocs/d3')), bkDoc('bk1', 'ISSUED', LOCK)));
await expect('books: delete an issued invoice refused', false, () => deleteDoc(doc(as('bkAdmin'), ws('bkDocs/old'))));
await expect('books: record money in', true, () => setDoc(doc(as('bk1'), ws('bkPayments/p2')), { direction: 'IN', status: 'POSTED', amountSen: 500, date: OPEN, allocations: [], createdByUid: 'bk1', createdAt: 1 }));
await expect('books: a payment of nothing refused', false, () => setDoc(doc(as('bk1'), ws('bkPayments/p3')), { direction: 'IN', status: 'POSTED', amountSen: 0, date: OPEN, allocations: [], createdByUid: 'bk1', createdAt: 1 }));
await expect('books: change a payment\'s amount refused', false, () => updateDoc(doc(as('bk1'), ws('bkPayments/p1')), { amountSen: 1 }));
await expect('books: void a payment', true, () => updateDoc(doc(as('bk1'), ws('bkPayments/p1')), { status: 'VOID', voidedAt: 2, voidedByName: 'K', voidJournalId: 'j8', updatedAt: 2 }));
await expect('books: bookkeeper moves the lock date refused', false, () => setDoc(doc(as('bk1'), ws('bkMeta/settings')), { lockDate: 0 }));
await expect('books: accountant sets the company details', true, () => setDoc(doc(as('bkAdmin'), ws('bkMeta/settings')), { lockDate: LOCK, name: 'Kedai Maju' }));
await expect('books: bookkeeper sets up the chart the first time', true, () => setDoc(doc(as('bk1'), ws('bkMeta/chart')), { list: [] }));
await expect('books: bookkeeper rewrites the chart refused', false, () => setDoc(doc(as('bk1'), ws('bkMeta/chart')), { list: [{ code: '1' }] }));
await expect('books: delete the running numbers refused', false, () => deleteDoc(doc(as('bkAdmin'), ws('bkMeta/counters'))));
await expect('books: bookkeeper keeps a contact', true, () => setDoc(doc(as('bk1'), ws('bkContacts/c1')), { name: 'Syarikat ABC', kind: 'CUSTOMER' }));
await expect('books: cashier keeps a contact refused', false, () => setDoc(doc(as('cashier1'), ws('bkContacts/c2')), { name: 'X' }));

const width = Math.max(...results.map((r) => r.name.length));
let failed = 0;
for (const r of results) {
  if (r.outcome !== 'ok') failed++;
  console.log(`${r.outcome === 'ok' ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
await testEnv.cleanup();
process.exit(failed === 0 ? 0 : 1);
