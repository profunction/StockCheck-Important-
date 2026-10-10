/**
 * Sales (invoices, credit, debit and refund notes) and purchases (supplier
 * bills, self-billed invoices): the list, a draft being written, and an
 * issued document -- printed, sent to MyInvois as a file, paid, credited
 * or voided.
 *
 *   #/sales                 the list
 *   #/sales/new/INVOICE     a new one (CREDIT_NOTE/<invoiceId> for a note)
 *   #/sales/<id>            a draft (edited) or an issued one (shown)
 */
import { dateTime, download, h, modal, mount, toast, confirmBox } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty, formatSen, parseQty } from '../js/money.js';
import { icon } from '../js/icons.js';
import { printView } from '../js/receipt.js';
import { DOC_TYPES, docTotals, lineTotals, outstanding, roleAccount } from '../js/books.js';
import { DEFAULT_CLASS, eInvoiceJson, missing } from '../js/einvoice-doc.js';
import {
  accounts, books, canPost, company, deleteDraft, issueDoc, noteEInvoice, paymentsFor, saveDraft, settled, voidDoc, ymd,
} from './data.js';
import {
  accName, accountSelect, amountInput, contactCopy, contactSelect, dateInput, dateOf, empty, failed, head, isSales, money, rmText,
  senOf, statusPill, table, taxSelect, typeName,
} from './common.js';
import { go } from './main.js';
import { editContact } from './contacts.js';

const SALES_TYPES = ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'REFUND_NOTE'];
const PURCHASE_TYPES = ['BILL', 'SELF_BILLED'];

export function render(main, sub, group) {
  const sales = group === 'sales';
  const [first, second, third] = sub.split('/');
  if (first === 'new') return editor(main, { sales, type: second || (sales ? 'INVOICE' : 'BILL'), refId: third || '' });
  if (first) {
    const d = books.docs.find((x) => x.id === first);
    if (!d) { mount(main, head(t(sales ? 'bkSales' : 'bkPurchases')), empty(t('bkNotFound'))); return null; }
    return d.status === 'DRAFT' && canPost() ? editor(main, { sales, doc: d }) : view(main, d, sales);
  }
  return list(main, sales);
}

// --------------------------------------------------------------------- list

let filter = { status: 'ALL', q: '' };

function list(main, sales) {
  const types = sales ? SALES_TYPES : PURCHASE_TYPES;
  const all = books.docs.filter((d) => types.includes(d.type));
  const box = h('div');
  const draw = () => {
    const q = filter.q.trim().toLowerCase();
    const rows = all.filter((d) => filter.status === 'ALL' || (filter.status === 'UNPAID' ? d.status === 'ISSUED' && owed(d) > 0 && DOC_TYPES[d.type].sign > 0 && d.type !== 'DEBIT_NOTE' : d.status === filter.status))
      .filter((d) => !q || `${d.no} ${d.contact?.name || ''} ${d.reference || ''}`.toLowerCase().includes(q));
    mount(box, rows.length
      ? table([t('bkNo'), t('date'), t('bkType'), t(sales ? 'bkCustomer' : 'bkSupplier'), t('bkTotal'), t('bkOwed'), t('bkStatus')],
        rows.map((d) => [h('strong', {}, d.no || t('bkSt_DRAFT')), ymd(d.date), typeName(d.type), d.contact?.name || '',
          money(DOC_TYPES[d.type].sign * (d.totals?.totalSen || 0)), d.status === 'ISSUED' && DOC_TYPES[d.type].sign > 0 ? money(owed(d)) : '', statusPill(d.status)]),
        { num: [4, 5], cls: 'bk-docs', onRow: (i) => go(sales ? 'sales' : 'purchases', rows[i].id) })
      : empty(t(all.length ? 'bkNothingMatches' : sales ? 'bkNoSales' : 'bkNoPurchases')));
  };
  const seg = h('div', { class: 'seg wh-tabs' }, ['ALL', 'DRAFT', 'UNPAID', 'ISSUED', 'VOID'].map((s) =>
    h('button', { class: filter.status === s ? 'on' : '', onclick: (e) => { filter.status = s; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); draw(); } }, t(`bkF_${s}`))));
  const newButtons = canPost() ? (sales
    ? [h('button', { class: 'primary', 'data-act': 'new-invoice', onclick: () => go('sales', 'new/INVOICE') }, icon('plus', 17), t('bkNewInvoice'))]
    : [h('button', { class: 'primary', 'data-act': 'new-bill', onclick: () => go('purchases', 'new/BILL') }, icon('plus', 17), t('bkNewBill')),
      h('button', { onclick: () => go('purchases', 'new/SELF_BILLED') }, t('bkNewSelfBilled'))]) : [];
  mount(main,
    head(t(sales ? 'bkSales' : 'bkPurchases'), ...newButtons),
    h('div', { class: 'wh-head' }, seg,
      h('input', { type: 'search', placeholder: t('bkSearchDocs'), value: filter.q, oninput: (e) => { filter.q = e.target.value; draw(); } })),
    box);
  draw();
  return null;
}

const owed = (d) => outstanding(d, books.payments, books.docs);

// ------------------------------------------------------------------- editor

const blankLine = (sales) => ({ description: '', qtyMilli: 1000, unitPriceSen: 0, discountSen: 0, taxType: '06', taxPct: 0,
  account: roleAccount(accounts(), sales ? 'sales' : 'purchases'), classCode: DEFAULT_CLASS });

function editor(main, { sales, type, refId = '', doc: existing = null }) {
  if (!canPost()) { mount(main, head(t('bkSales')), empty(t('bkNoAccess'))); return null; }
  const s = company();
  const ref = refId ? books.docs.find((x) => x.id === refId) : null;
  const d = existing ? structuredClone(existing) : {
    type, date: Date.now(), contactId: ref?.contactId || '', contact: ref?.contact || {},
    refId: ref?.id || '', refNo: ref?.no || '', refUuid: ref?.einvoice?.uuid || '',
    lines: ref && DOC_TYPES[type].sign < 0 ? ref.lines.map((l) => ({ ...l })) : [blankLine(sales)],
  };
  if (!existing) d.dueDate = d.date + (s.termsDays || 0) * 86_400_000;
  const kind = DOC_TYPES[d.type];
  // Sales documents go to customers; bills and self-billed invoices to suppliers.
  const side = isSales(d.type);
  const contactPick = contactSelect(d.contactId, side, { 'data-f': 'contact' });
  if (ref) contactPick.disabled = true;
  const date = dateInput(d.date, { 'data-f': 'date' });
  const due = dateInput(d.dueDate, { 'data-f': 'due' });
  // The due date follows the contact's terms (else the company's).
  const termsDue = () => {
    const c = books.contacts.find((x) => x.id === contactPick.value);
    const days = c?.termsDays === '' || c?.termsDays == null ? s.termsDays || 0 : Number(c.termsDays);
    if (Number.isFinite(dateOf(date))) due.value = ymd(dateOf(date) + days * 86_400_000);
  };
  contactPick.addEventListener('change', termsDue);
  date.addEventListener('change', termsDue);
  const reference = h('input', { value: d.reference || '', placeholder: t(sales ? 'bkRefPh' : 'bkBillRefPh'), 'data-f': 'reference' });
  const note = h('textarea', { rows: 2, 'data-f': 'note' }, d.note || '');
  const linesBox = h('div', { class: 'bk-lines' });
  const totalsBox = h('div', { class: 'bk-totals' });
  const accFilter = (a) => (isSales(d.type) ? a.type === 'INCOME' : a.type === 'EXPENSE' || a.type === 'ASSET');

  // Lines are drawn again only when one is added or removed; a changed
  // figure updates the sums in place, so the cursor stays where it is.
  const amounts = [];
  const refresh = () => {
    d.lines.forEach((l, i) => { if (amounts[i]) amounts[i].textContent = money(lineTotals(l).totalSen); });
    const tot = docTotals(d.lines);
    mount(totalsBox,
      h('div', {}, h('span', {}, t('bkSubtotal')), h('span', {}, money(tot.netSen))),
      tot.taxSen ? h('div', {}, h('span', {}, t('bkTaxTotal')), h('span', {}, money(tot.taxSen))) : null,
      h('div', { class: 'grand' }, h('span', {}, t('bkTotal')), h('strong', { 'data-total': '' }, rmText(tot.totalSen))));
  };
  const drawLines = () => {
    amounts.length = 0;
    mount(linesBox, d.lines.map((l, i) => {
      const field = (label, el) => h('label', { class: 'field' }, label, el);
      const qty = h('input', { inputmode: 'decimal', class: 'num', value: formatQty(l.qtyMilli ?? 1000), 'data-l': 'qty',
        oninput: (e) => { l.qtyMilli = parseQty(e.target.value) ?? 0; refresh(); } });
      const price = amountInput(l.unitPriceSen, { 'data-l': 'price', oninput: (e) => { l.unitPriceSen = Math.max(0, senOf(e.target) ?? 0); refresh(); } });
      const disc = amountInput(l.discountSen, { 'data-l': 'discount', oninput: (e) => { l.discountSen = Math.max(0, senOf(e.target) ?? 0); refresh(); } });
      const tax = taxSelect(l, { 'data-l': 'tax', onchange: (e) => { const [ty, p] = e.target.value.split('|'); l.taxType = ty; l.taxPct = Number(p); refresh(); } });
      const acc = accountSelect(l.account, accFilter, { 'data-l': 'account', onchange: (e) => { l.account = e.target.value; } });
      amounts[i] = h('strong', {}, money(lineTotals(l).totalSen));
      return h('div', { class: 'bk-line card', 'data-line': i },
        h('div', { class: 'bk-line-top' },
          h('input', { class: 'grow', value: l.description, placeholder: t('bkDescPh'), 'data-l': 'desc', oninput: (e) => { l.description = e.target.value; } }),
          d.lines.length > 1 ? h('button', { class: 'ghost icon-btn', 'aria-label': t('delete'), onclick: () => { d.lines.splice(i, 1); drawLines(); } }, icon('trash', 17)) : null),
        h('div', { class: 'bk-line-grid' },
          field(t('bkQty'), qty), field(t('bkUnitPrice'), price), field(t('bkDiscount'), disc), field(t('bkTaxCol'), tax),
          field(t('bkAccount'), acc),
          isSales(d.type) || d.type === 'SELF_BILLED' ? field(t('bkClass'), h('input', { value: l.classCode || DEFAULT_CLASS, maxlength: 3, 'data-l': 'class', oninput: (e) => { l.classCode = e.target.value.trim(); } })) : null,
          h('div', { class: 'bk-line-amt' }, h('span', { class: 'muted' }, t('bkAmount')), amounts[i])));
    }), h('button', { 'data-act': 'add-line', onclick: () => { d.lines.push(blankLine(isSales(d.type))); drawLines(); } }, icon('plus', 17), t('bkAddLine')));
    refresh();
  };

  const collect = () => {
    const c = books.contacts.find((x) => x.id === contactPick.value);
    return { ...d, contactId: contactPick.value, contact: c ? contactCopy(c) : d.contact, date: dateOf(date), dueDate: dateOf(due),
      reference: reference.value.trim(), note: note.value.trim(), lines: d.lines.filter((l) => l.description.trim() || l.unitPriceSen) };
  };
  const busy = (fn) => async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try { await fn(); } catch (err) { failed(err); } finally { b.disabled = false; }
  };
  const save = busy(async () => {
    const id = await saveDraft(collect());
    await settled(() => books.docs.some((x) => x.id === id));
    toast(t('bkDraftSaved'), 'ok');
    go(sales ? 'sales' : 'purchases', id);
  });
  const issue = busy(async () => {
    const body = collect();
    if (!body.contactId) return toast(t('bkErr_NO_CONTACT'), 'error');
    if (!await confirmBox(t('bkIssueAsk'), t('bkIssue'), t('cancel'), { tone: 'primary' })) return;
    const { id, no } = await issueDoc(body);
    await settled(() => books.docs.find((x) => x.id === id)?.status === 'ISSUED');
    toast(`${no} · ${t('bkIssued')}`, 'ok');
    go(sales ? 'sales' : 'purchases', id);
  });

  mount(main,
    head(`${typeName(d.type)}${existing?.no ? ` ${existing.no}` : ''}`, statusPill('DRAFT')),
    h('section', { class: 'card bk-form', 'data-editing': '' },
      ref ? h('p', { class: 'muted' }, `${t('bkAgainst')} ${ref.no} · ${rmText(ref.totals?.totalSen || 0)}`) : null,
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, t(sales ? 'bkCustomer' : 'bkSupplier'),
          h('div', { class: 'row' }, contactPick,
            ref ? null : h('button', { class: 'ghost', 'data-act': 'new-contact', onclick: () => editContact(null, { kind: side ? 'CUSTOMER' : 'SUPPLIER', onSaved: (id) => {
              mount(contactPick, ...contactSelect(id, side).children);
              contactPick.value = id;
            } }) }, icon('plus', 17), t('bkNewContact')))),
        h('label', { class: 'field' }, t(sales ? 'bkYourRef' : 'bkTheirNo'), reference)),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('date'), date),
        kind.sign > 0 ? h('label', { class: 'field' }, t('bkDue'), due) : null),
      linesBox,
      totalsBox,
      h('label', { class: 'field' }, t('note'), note),
      h('div', { class: 'actions' },
        existing ? h('button', { class: 'danger', onclick: busy(async () => {
          if (!await confirmBox(t('bkDeleteDraftAsk'), t('delete'), t('cancel'))) return;
          await deleteDraft(existing.id);
          go(sales ? 'sales' : 'purchases');
        }) }, t('delete')) : null,
        h('span', { class: 'grow' }),
        h('button', { 'data-act': 'save-draft', onclick: save }, t('bkSaveDraft')),
        h('button', { class: 'primary', 'data-act': 'issue', onclick: issue }, icon('check', 17), t('bkIssue')))));
  drawLines();
  return null;
}

// --------------------------------------------------------------------- view

function view(main, d, sales) {
  const kind = DOC_TYPES[d.type];
  const left = d.status === 'ISSUED' && kind.sign > 0 && d.type !== 'DEBIT_NOTE' ? owed(d) : 0;
  const pays = paymentsFor(d.id);
  const notes = books.docs.filter((x) => x.refId === d.id && x.status !== 'VOID');
  const seller = company();
  // A self-billed invoice is the supplier's: they are its seller, the company its buyer.
  const lacking = !kind.code ? [] : d.type === 'SELF_BILLED' ? missing({ ...d, contact: seller }, d.contact || {}) : missing(d, seller);
  const actions = [];
  if (canPost() && d.status === 'ISSUED') {
    if (left > 0) actions.push(h('button', { class: 'primary', 'data-act': 'pay', onclick: () => go('payments', `${sales ? 'in' : 'out'}/${d.id}`) }, icon('calc', 17), t(sales ? 'bkReceive' : 'bkPay')));
    if (d.type === 'INVOICE') {
      actions.push(h('button', { 'data-act': 'credit', onclick: () => go('sales', `new/CREDIT_NOTE/${d.id}`) }, t('bkNewCredit')));
      actions.push(h('button', { onclick: () => go('sales', `new/DEBIT_NOTE/${d.id}`) }, t('bkNewDebit')));
      if (left < (d.totals?.totalSen || 0)) actions.push(h('button', { onclick: () => go('sales', `new/REFUND_NOTE/${d.id}`) }, t('bkNewRefund')));
    }
    actions.push(h('button', { class: 'danger', 'data-act': 'void', onclick: async () => {
      if (!await confirmBox(t('bkVoidAsk'), t('bkVoid'), t('cancel'))) return;
      try { await voidDoc(d); toast(t('bkVoided'), 'ok'); } catch (err) { failed(err); }
    } }, t('bkVoid')));
  }
  const tot = d.totals || docTotals(d.lines);
  mount(main,
    head(`${typeName(d.type)} ${d.no}`, statusPill(d.status),
      h('button', { 'data-act': 'print', onclick: () => printView(printable(d)) }, icon('printer', 17), t('bkPrint')),
      kind.code && d.status === 'ISSUED' ? h('button', { 'data-act': 'einvoice', onclick: () => einvoiceFile(d, lacking) }, icon('download', 17), t('bkEInvoiceFile')) : null),
    h('section', { class: 'card bk-view' },
      h('div', { class: 'bk-meta' },
        h('div', {}, h('div', { class: 'muted' }, t(sales ? 'bkCustomer' : 'bkSupplier')), h('strong', {}, d.contact?.name || ''),
          h('div', { class: 'muted' }, [d.contact?.tin && `TIN ${d.contact.tin}`, d.contact?.phone].filter(Boolean).join(' · '))),
        h('div', {}, h('div', { class: 'muted' }, t('date')), ymd(d.date)),
        kind.sign > 0 ? h('div', {}, h('div', { class: 'muted' }, t('bkDue')), ymd(d.dueDate || d.date)) : null,
        d.refNo ? h('div', {}, h('div', { class: 'muted' }, t('bkAgainst')), h('a', { href: `#/sales/${d.refId}` }, d.refNo)) : null,
        d.reference ? h('div', {}, h('div', { class: 'muted' }, t(sales ? 'bkYourRef' : 'bkTheirNo')), d.reference) : null),
      table([t('bkDesc'), t('bkQty'), t('bkUnitPrice'), t('bkDiscount'), t('bkTaxCol'), t('bkAmount')],
        d.lines.map((l) => [h('div', {}, l.description, h('div', { class: 'muted sm' }, accName(l.account))), formatQty(l.qtyMilli ?? 1000), money(l.unitPriceSen),
          l.discountSen ? money(l.discountSen) : '', l.taxPct ? `${l.taxPct}%` : '', money(lineTotals(l).totalSen)]),
        { num: [1, 2, 3, 4, 5], foot: ['', '', '', '', t('bkTotal'), rmText(tot.totalSen)] }),
      tot.taxSen ? h('p', { class: 'muted', style: { textAlign: 'right' } }, `${t('bkSubtotal')} ${money(tot.netSen)} · ${t('bkTaxTotal')} ${money(tot.taxSen)}`) : null,
      d.note ? h('p', {}, d.note) : null,
      left > 0 ? h('p', { class: 'bk-owed' }, `${t('bkOwed')}: `, h('strong', { 'data-owed': '' }, rmText(left))) : null,
      d.status === 'VOID' ? h('p', { class: 'muted' }, `${t('bkSt_VOID')} · ${d.voidedByName || ''} · ${d.voidedAt ? dateTime(d.voidedAt) : ''}`) : null,
      h('div', { class: 'actions' }, actions)),
    pays.length || notes.length ? h('section', { class: 'card' }, h('h2', {}, t('bkHistory')),
      table([t('bkNo'), t('date'), t('bkType'), t('bkAmount')], [
        ...pays.map((p) => [h('a', { href: `#/payments/${p.id}` }, p.no), ymd(p.date), t(p.direction === 'IN' ? 'bkReceipt' : 'bkPaymentOut'),
          money(p.allocations.filter((a) => a.docId === d.id).reduce((s, a) => s + a.amountSen, 0))]),
        ...notes.map((n) => [h('a', { href: `#/sales/${n.id}` }, n.no || t('bkSt_DRAFT')), ymd(n.date), typeName(n.type), money(DOC_TYPES[n.type].sign * (n.totals?.totalSen || 0))]),
      ], { num: [3] })) : null,
    kind.code && d.status === 'ISSUED' ? einvoiceCard(d, lacking) : null);
  return null;
}

function einvoiceCard(d, lacking) {
  const e = d.einvoice || {};
  return h('section', { class: 'card bk-einv' },
    h('h2', {}, t('bkEInvoice')),
    lacking.length
      ? h('div', { class: 'bk-warn' }, h('p', {}, t('bkEInvMissing')), h('ul', {}, lacking.map((k) => h('li', {}, t(`bkMiss_${k.replace('.', '_')}`)))),
        h('p', { class: 'muted' }, t('bkEInvMissingHow')))
      : h('p', { class: 'muted' }, t('bkEInvReady')),
    e.downloadedAt ? h('p', { class: 'muted' }, `${t('bkEInvDownloaded')}: ${dateTime(e.downloadedAt)}`) : null,
    e.uuid ? h('p', {}, `MyInvois UUID: `, h('code', {}, e.uuid)) : null,
    canPost() ? h('div', { class: 'actions' },
      h('button', { 'data-act': 'uuid', onclick: () => askUuid(d) }, t(e.uuid ? 'bkEInvUuidChange' : 'bkEInvUuid'))) : null);
}

function einvoiceFile(d, lacking) {
  const save = async () => {
    const json = eInvoiceJson(d, company(), { issuedAt: Date.now() });
    download(`${d.no}.json`, JSON.stringify(json, null, 2), 'application/json');
    if (canPost()) await noteEInvoice(d, { downloadedAt: Date.now() }).catch(() => {});
  };
  if (!lacking.length) return save();
  modal((close) => [
    h('h2', {}, t('bkEInvoiceFile')),
    h('p', {}, t('bkEInvMissing')),
    h('ul', {}, lacking.map((k) => h('li', {}, t(`bkMiss_${k.replace('.', '_')}`)))),
    h('div', { class: 'actions' }, h('button', { onclick: close }, t('cancel')),
      h('button', { class: 'primary', onclick: () => { close(); save(); } }, t('bkEInvAnyway'))),
  ]);
}

function askUuid(d) {
  const input = h('input', { value: d.einvoice?.uuid || '', placeholder: 'e.g. F9D425P6DS7D8IU', autofocus: true });
  modal((close) => [
    h('h2', {}, t('bkEInvUuid')),
    h('p', { class: 'muted' }, t('bkEInvUuidHelp')),
    input,
    h('div', { class: 'actions' }, h('button', { onclick: close }, t('cancel')),
      h('button', { class: 'primary', onclick: async () => {
        try { await noteEInvoice(d, { uuid: input.value.trim(), validatedAt: Date.now() }); close(); toast(t('saved'), 'ok'); } catch (err) { failed(err); }
      } }, t('save'))),
  ]);
}

/** The document on A4, for the printer or "Save as PDF". */
export function printable(d) {
  const s = company();
  const kind = DOC_TYPES[d.type];
  const tot = d.totals || docTotals(d.lines);
  const [from, to] = d.type === 'SELF_BILLED' ? [d.contact || {}, s] : [s, d.contact || {}];
  const addr = (p) => [p.address, [p.postcode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return h('div', { class: 'bk-print' },
    h('div', { class: 'bk-print-head' },
      h('div', {}, h('div', { class: 'co' }, from.name || ''),
        h('div', {}, [from.brn && `${t('bkBrn')} ${from.brn}`, from.tin && `TIN ${from.tin}`, from.sstNo && `SST ${from.sstNo}`].filter(Boolean).join(' · ')),
        h('div', {}, addr(from)), h('div', {}, [from.phone, from.email].filter(Boolean).join(' · '))),
      h('div', { class: 'ttl' }, h('div', { class: 'big' }, t(`bkPrint_${d.type}`)),
        h('div', {}, `${t('bkNo')}: ${d.no}`), h('div', {}, `${t('date')}: ${ymd(d.date)}`),
        kind.sign > 0 && d.dueDate ? h('div', {}, `${t('bkDue')}: ${ymd(d.dueDate)}`) : null,
        d.refNo ? h('div', {}, `${t('bkAgainst')}: ${d.refNo}`) : null,
        d.status === 'VOID' ? h('div', { class: 'void' }, t('bkSt_VOID')) : null)),
    h('div', { class: 'bk-print-to' }, h('div', { class: 'muted' }, t(d.type === 'SELF_BILLED' ? 'bkSupplier' : kind.sales ? 'bkBillTo' : 'bkSupplier')),
      h('strong', {}, to.name || ''), h('div', {}, addr(to)),
      h('div', {}, [to.tin && `TIN ${to.tin}`, to.idNo && `${to.idType || 'BRN'} ${to.idNo}`, to.phone].filter(Boolean).join(' · '))),
    h('table', {},
      h('thead', {}, h('tr', {}, [t('bkDesc'), t('bkQty'), t('bkUnitPrice'), t('bkDiscount'), t('bkTaxCol'), t('bkAmount')].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
      h('tbody', {}, d.lines.map((l) => h('tr', {}, h('td', {}, l.description), h('td', { class: 'num' }, formatQty(l.qtyMilli ?? 1000)),
        h('td', { class: 'num' }, formatSen(l.unitPriceSen)), h('td', { class: 'num' }, l.discountSen ? formatSen(l.discountSen) : ''),
        h('td', { class: 'num' }, l.taxPct ? `${l.taxPct}%` : ''), h('td', { class: 'num' }, formatSen(lineTotals(l).totalSen)))))),
    h('div', { class: 'bk-print-tot' },
      h('div', {}, h('span', {}, t('bkSubtotal')), h('span', {}, money(tot.netSen))),
      tot.taxSen ? h('div', {}, h('span', {}, t('bkTaxTotal')), h('span', {}, money(tot.taxSen))) : null,
      h('div', { class: 'grand' }, h('span', {}, t('bkTotal')), h('span', {}, rmText(tot.totalSen)))),
    d.note ? h('p', {}, d.note) : null,
    kind.sales && s.bank ? h('p', {}, `${t('bkBankDetails')}: ${s.bank}`) : null,
    d.einvoice?.uuid ? h('p', { class: 'muted' }, `MyInvois UUID: ${d.einvoice.uuid}`) : null,
    s.footer ? h('p', { class: 'muted' }, s.footer) : null);
}
