/**
 * SuXin Books' records in Firestore, kept live on the page, and the only
 * places they are written.
 *
 *   bkMeta/settings   the company on its documents, terms, the lock date
 *   bkMeta/chart      the chart of accounts ({ list })
 *   bkMeta/counters   running numbers: { 'INV-2026': 12, 'JE-2026': 40 }
 *   bkContacts        customers and suppliers
 *   bkDocs            invoices, credit/debit/refund notes, bills, self-billed
 *   bkPayments        money in, money out, expenses paid on the spot
 *   bkJournal         every entry, written once (books.js makes the lines)
 *
 * Issuing, paying and voiding are transactions: the document, its journal
 * entry and the next number are written together or not at all. A
 * transaction needs the internet -- the books are kept online, so two
 * people can never take the same invoice number.
 */
import { collection, db, deleteDoc, doc, onSnapshot, runTransaction, setDoc } from '../js/fb.js';
import { session, ws } from '../js/session.js';
import {
  DEFAULT_ACCOUNTS, DOC_TYPES, docNo, docTotals, entryForDoc, entryForExpense, entryForPayment, entryProblem, locked, reversal, tidy,
} from '../js/books.js';

export const books = { settings: {}, chart: null, contacts: [], docs: [], payments: [], journal: [], loaded: new Set() };
const PARTS = ['settings', 'chart', 'contacts', 'docs', 'payments', 'journal'];

export const canView = () => session.may('accounting.view');
export const canPost = () => session.may('accounting.post');
export const canAdmin = () => session.may('accounting.admin');

/** The chart in use: the company's own, or the starting one before it is saved. */
export const accounts = () => (books.chart?.length ? books.chart : DEFAULT_ACCOUNTS);
export const account = (code) => accounts().find((a) => a.code === code);

// ------------------------------------------------------------------- dates
// A day is stored as the moment it starts in Malaysia (UTC+8), in ms.

const MYT = 8 * 3600_000;
export const dayMs = (ymd) => Date.parse(`${ymd}T00:00:00+08:00`);
export const dayEnd = (ymd) => dayMs(ymd) + 86_400_000 - 1;
export const ymd = (ms) => new Date(ms + MYT).toISOString().slice(0, 10);
export const today = () => ymd(Date.now());
export const yearOf = (ms) => new Date(ms + MYT).getUTCFullYear();
export const monthStart = (ms = Date.now()) => `${ymd(ms).slice(0, 7)}-01`;

// -------------------------------------------------------------- live data

const listeners = new Set();
let stops = [];
let fireTimer;
const fire = () => {
  clearTimeout(fireTimer);
  fireTimer = setTimeout(() => listeners.forEach((fn) => fn()), 30);
};

/** Calls [fn] whenever the books change; returns the stop. */
export function onBooks(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const ready = () => PARTS.every((p) => books.loaded.has(p));

/**
 * Resolves once [test]() holds for the live books (or after [ms]): a
 * transaction's write reaches the listeners a moment after it commits.
 */
export function settled(test, ms = 4000) {
  if (test()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const stop = onBooks(() => { if (test()) { stop(); clearTimeout(timer); resolve(true); } });
    const timer = setTimeout(() => { stop(); resolve(false); }, ms);
  });
}

/** Starts listening to the company's books (again, after a sign-in). */
export function watchBooks() {
  stopBooks();
  const got = (part, value) => { books[part] = value; books.loaded.add(part); fire(); };
  const failed = (part) => (err) => { console.error(part, err); books.loaded.add(part); fire(); };
  const list = (col, part, sort) => onSnapshot(collection(db, ws(col)), (snap) => {
    got(part, snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort(sort));
  }, failed(part));
  const newest = (a, b) => (b.date || 0) - (a.date || 0) || (b.createdAt || 0) - (a.createdAt || 0);
  stops = [
    onSnapshot(doc(db, ws('bkMeta/settings')), (s) => got('settings', s.exists() ? s.data() : {}), failed('settings')),
    onSnapshot(doc(db, ws('bkMeta/chart')), (s) => got('chart', s.exists() ? s.data().list || [] : null), failed('chart')),
    list('bkContacts', 'contacts', (a, b) => (a.name || '').localeCompare(b.name || '')),
    list('bkDocs', 'docs', newest),
    list('bkPayments', 'payments', newest),
    list('bkJournal', 'journal', newest),
  ];
}

export function stopBooks() {
  stops.forEach((s) => s?.());
  stops = [];
  Object.assign(books, { settings: {}, chart: null, contacts: [], docs: [], payments: [], journal: [], loaded: new Set() });
}

// ------------------------------------------------------------- the company

/** The seller on every document: the books' own details, else the till's. */
export function company() {
  const s = books.settings || {};
  const p = session.settings || {};
  return {
    name: s.name || p.shopName || session.companyName || '',
    tin: s.tin || p.tin || '', brn: s.brn || p.regNo || '', sstNo: s.sstNo || p.sstNo || '', ttxNo: s.ttxNo || '',
    msic: s.msic || p.msic || '', msicName: s.msicName || p.msicName || '',
    address: s.address || p.address || '', city: s.city || p.city || '', postcode: s.postcode || p.postcode || '',
    state: s.state || p.stateCode || '', country: 'MYS', phone: s.phone || p.phone || '', email: s.email || p.email || '',
    bank: s.bank || '', footer: s.footer || '', termsDays: s.termsDays ?? 30,
  };
}

export async function saveSettings(patch) {
  await setDoc(doc(db, ws('bkMeta/settings')), { ...books.settings, ...patch, updatedAt: Date.now(), updatedByName: session.name });
}

/** Saves the chart; the first time, the starting chart is saved as it is. */
export async function saveChart(list) {
  await setDoc(doc(db, ws('bkMeta/chart')), { list, updatedAt: Date.now() });
}

export async function saveContact(c) {
  const id = c.id || doc(collection(db, ws('bkContacts'))).id;
  const { id: _drop, ...data } = c;
  await setDoc(doc(db, ws(`bkContacts/${id}`)), { ...data, active: data.active !== false, updatedAt: Date.now() });
  return id;
}

// --------------------------------------------------------------- posting

export class BooksError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const who = () => ({ createdByUid: session.uid, createdByName: session.name, createdAt: Date.now() });

/** Takes the next number for each [prefix, year] in one transaction. */
async function numbers(tx, wanted) {
  const ref = doc(db, ws('bkMeta/counters'));
  const snap = await tx.get(ref);
  const have = snap.exists() ? snap.data() : {};
  const next = {};
  const out = wanted.map(([prefix, year]) => {
    const key = `${prefix}-${year}`;
    next[key] = (next[key] ?? have[key] ?? 0) + 1;
    return docNo(prefix, year, next[key]);
  });
  return { out, save: () => tx.set(ref, next, { merge: true }) };
}

function checkOpen(date) {
  if (!Number.isFinite(date)) throw new BooksError('BAD_DATE');
  if (locked(date, books.settings?.lockDate)) throw new BooksError('LOCKED');
}

function checkEntry(lines) {
  const problem = entryProblem(lines, accounts());
  if (problem) throw new BooksError(problem);
}

const journalEntry = (no, { date, memo, source, sourceId = '', lines }) => ({ no, date, memo: memo || '', source, sourceId, lines, ...who() });

/** A document as it is stored: totals worked out, nothing undefined. */
function clean(d) {
  const lines = (d.lines || []).map((l) => ({
    description: l.description || '', qtyMilli: l.qtyMilli ?? 1000, unitPriceSen: l.unitPriceSen || 0, discountSen: l.discountSen || 0,
    taxType: l.taxType || '06', taxPct: Number(l.taxPct) || 0, account: l.account || '', classCode: l.classCode || '', unitCode: l.unitCode || '',
  }));
  return {
    type: d.type, status: d.status || 'DRAFT', no: d.no || '', date: d.date, dueDate: d.dueDate || d.date,
    contactId: d.contactId || '', contact: d.contact || {}, reference: d.reference || '', note: d.note || '',
    refId: d.refId || '', refNo: d.refNo || '', refUuid: d.refUuid || '',
    lines, totals: docTotals(lines),
    createdByUid: d.createdByUid || session.uid, createdByName: d.createdByName || session.name, createdAt: d.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

/** Saves a draft; returns its id. */
export async function saveDraft(d) {
  checkOpen(d.date);
  const id = d.id || doc(collection(db, ws('bkDocs'))).id;
  await setDoc(doc(db, ws(`bkDocs/${id}`)), clean({ ...d, status: 'DRAFT', no: '' }));
  return id;
}

export const deleteDraft = (id) => deleteDoc(doc(db, ws(`bkDocs/${id}`)));

/**
 * Issues [d]: its number, its journal entry and the document, together.
 * Returns { id, no }.
 */
export async function issueDoc(d) {
  const kind = DOC_TYPES[d.type];
  checkOpen(d.date);
  if (!d.contactId) throw new BooksError('NO_CONTACT');
  const body = clean({ ...d, status: 'ISSUED' });
  if (!body.lines.length || !body.totals.totalSen) throw new BooksError('NO_LINES');
  if (kind.sign < 0 && body.refId) {
    // Notes against one invoice never add up to more than the invoice.
    const original = books.docs.find((x) => x.id === body.refId);
    const before = books.docs.filter((x) => x.refId === body.refId && x.id !== d.id && x.status === 'ISSUED' && DOC_TYPES[x.type].sign < 0)
      .reduce((s, x) => s + (x.totals?.totalSen || 0), 0);
    if (original && before + body.totals.totalSen > original.totals.totalSen) throw new BooksError('MORE_THAN_OWED');
  }
  const lines = entryForDoc(body, accounts());
  checkEntry(lines);
  const id = d.id || doc(collection(db, ws('bkDocs'))).id;
  const jeRef = doc(collection(db, ws('bkJournal')));
  const year = yearOf(body.date);
  return runTransaction(db, async (tx) => {
    const n = await numbers(tx, [[kind.prefix, year], ['JE', year]]);
    const [no, jeNo] = n.out;
    tx.set(jeRef, journalEntry(jeNo, { date: body.date, memo: `${no} · ${body.contact?.name || ''}`, source: d.type, sourceId: id, lines }));
    tx.set(doc(db, ws(`bkDocs/${id}`)), { ...body, no, journalId: jeRef.id, issuedAt: Date.now(), issuedByName: session.name });
    n.save();
    return { id, no };
  });
}

/** Payments (not void) that settle part of [docId]. */
export const paymentsFor = (docId) => books.payments.filter((p) => p.status !== 'VOID' && (p.allocations || []).some((a) => a.docId === docId));

/** Voids an issued document: a reversing entry on its own date, and VOID. */
export async function voidDoc(d) {
  checkOpen(d.date);
  if (paymentsFor(d.id).length) throw new BooksError('HAS_PAYMENTS');
  if (books.docs.some((x) => x.refId === d.id && x.status === 'ISSUED')) throw new BooksError('HAS_NOTES');
  const original = books.journal.find((e) => e.id === d.journalId);
  const lines = original ? reversal(original) : reversal({ lines: entryForDoc(d, accounts()) });
  const jeRef = doc(collection(db, ws('bkJournal')));
  return runTransaction(db, async (tx) => {
    const n = await numbers(tx, [['JE', yearOf(d.date)]]);
    tx.set(jeRef, journalEntry(n.out[0], { date: d.date, memo: `VOID ${d.no}`, source: 'VOID', sourceId: d.id, lines }));
    tx.update(doc(db, ws(`bkDocs/${d.id}`)), { status: 'VOID', voidedAt: Date.now(), voidedByName: session.name, voidJournalId: jeRef.id, updatedAt: Date.now() });
    n.save();
  });
}

/**
 * Money in (a receipt, RCT), money out (a payment voucher, PV) or an
 * expense paid on the spot (EXP). allocations: [{ docId, no, amountSen }].
 */
export async function postPayment(p) {
  checkOpen(p.date);
  const expense = p.kind === 'EXPENSE';
  const lines = expense ? entryForExpense(p, accounts()) : tidy(entryForPayment(p, accounts()));
  const amountSen = expense ? docTotals(p.lines).totalSen : p.amountSen;
  if (!Number.isInteger(amountSen) || amountSen <= 0) throw new BooksError('BAD_AMOUNT');
  const allocated = (p.allocations || []).reduce((s, a) => s + a.amountSen, 0);
  if (allocated > amountSen) throw new BooksError('OVER_ALLOCATED');
  checkEntry(lines);
  const prefix = expense ? 'EXP' : p.direction === 'IN' ? 'RCT' : 'PV';
  const ref = doc(collection(db, ws('bkPayments')));
  const jeRef = doc(collection(db, ws('bkJournal')));
  const year = yearOf(p.date);
  return runTransaction(db, async (tx) => {
    const n = await numbers(tx, [[prefix, year], ['JE', year]]);
    const [no, jeNo] = n.out;
    tx.set(jeRef, journalEntry(jeNo, { date: p.date, memo: `${no} · ${p.contactName || p.payee || ''}`, source: expense ? 'EXPENSE' : p.direction === 'IN' ? 'RECEIPT' : 'PAYMENT', sourceId: ref.id, lines }));
    tx.set(ref, {
      no, kind: expense ? 'EXPENSE' : 'PAYMENT', direction: expense ? 'OUT' : p.direction, status: 'POSTED', date: p.date,
      contactId: p.contactId || '', contactName: p.contactName || '', payee: p.payee || '', account: p.account || '',
      amountSen, allocations: (p.allocations || []).filter((a) => a.amountSen > 0),
      lines: expense ? p.lines : [], reference: p.reference || '', note: p.note || '', journalId: jeRef.id, ...who(),
    });
    n.save();
    return { id: ref.id, no };
  });
}

export async function voidPayment(p) {
  checkOpen(p.date);
  const original = books.journal.find((e) => e.id === p.journalId);
  if (!original) throw new BooksError('NO_ENTRY');
  const jeRef = doc(collection(db, ws('bkJournal')));
  return runTransaction(db, async (tx) => {
    const n = await numbers(tx, [['JE', yearOf(p.date)]]);
    tx.set(jeRef, journalEntry(n.out[0], { date: p.date, memo: `VOID ${p.no}`, source: 'VOID', sourceId: p.id, lines: reversal(original) }));
    tx.update(doc(db, ws(`bkPayments/${p.id}`)), { status: 'VOID', voidedAt: Date.now(), voidedByName: session.name, voidJournalId: jeRef.id, updatedAt: Date.now() });
    n.save();
  });
}

/** A journal entry made by hand (opening balances, depreciation, corrections). */
export async function postJournal({ date, memo, lines, source = 'MANUAL', sourceId = '' }) {
  checkOpen(date);
  const tidied = lines.filter((l) => (l.debitSen || 0) || (l.creditSen || 0))
    .map((l) => ({ account: l.account, debitSen: l.debitSen || 0, creditSen: l.creditSen || 0, ...(l.memo ? { memo: l.memo } : {}) }));
  checkEntry(tidied);
  const jeRef = doc(collection(db, ws('bkJournal')));
  return runTransaction(db, async (tx) => {
    const n = await numbers(tx, [['JE', yearOf(date)]]);
    tx.set(jeRef, journalEntry(n.out[0], { date, memo, source, sourceId, lines: tidied }));
    n.save();
    return { id: jeRef.id, no: n.out[0] };
  });
}

/** Notes the e-invoice file on an issued document (downloaded, its MyInvois UUID). */
export async function noteEInvoice(d, einvoice) {
  await setDoc(doc(db, ws(`bkDocs/${d.id}`)), { einvoice: { ...(d.einvoice || {}), ...einvoice }, updatedAt: Date.now() }, { merge: true });
}
