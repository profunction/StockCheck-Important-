/**
 * Money in from customers, money out to suppliers, and expenses paid on
 * the spot (rent, electricity, petrol) -- each a receipt or voucher with
 * its own number and journal entry. A payment is set against the
 * documents it settles, oldest first unless changed.
 *
 *   #/payments               the list
 *   #/payments/in[/docId]    receive money (for that invoice)
 *   #/payments/out[/docId]   pay a supplier (for that bill)
 *   #/payments/expense       an expense paid now
 *   #/payments/<id>          one, shown (and voided)
 */
import { confirmBox, dateTime, h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { DOC_TYPES, docTotals, lineTotals, outstanding, roleAccount } from '../js/books.js';
import { accounts, books, canPost, postPayment, settled, voidPayment, ymd } from './data.js';
import {
  accName, accountSelect, amountInput, contactSelect, dateInput, dateOf, empty, failed, head, money, moneyAccount, rmText,
  senOf, statusPill, table, taxSelect,
} from './common.js';
import { go } from './main.js';

export function render(main, sub) {
  const [first, second] = sub.split('/');
  if (first === 'in' || first === 'out') return payForm(main, first === 'in' ? 'IN' : 'OUT', second || '');
  if (first === 'expense') return expenseForm(main);
  if (first) return view(main, first);
  return list(main);
}

let show = 'ALL';

function list(main) {
  const box = h('div');
  const draw = () => {
    const rows = books.payments.filter((p) => show === 'ALL' || (show === 'EXPENSE' ? p.kind === 'EXPENSE' : p.kind !== 'EXPENSE' && p.direction === show));
    mount(box, rows.length
      ? table([t('bkNo'), t('date'), t('bkType'), t('bkWho'), t('bkVia'), t('bkAmount'), t('bkStatus')],
        rows.map((p) => [h('strong', {}, p.no), ymd(p.date), t(kindLabel(p)), p.contactName || p.payee || '', accName(p.account),
          h('span', { class: p.direction === 'IN' ? 'bk-in' : 'bk-out' }, `${p.direction === 'IN' ? '+' : '-'}${money(p.amountSen)}`), statusPill(p.status)]),
        { num: [5], onRow: (i) => go('payments', rows[i].id) })
      : empty(t('bkNoPayments')));
  };
  const seg = h('div', { class: 'seg wh-tabs' }, ['ALL', 'IN', 'OUT', 'EXPENSE'].map((s) =>
    h('button', { class: show === s ? 'on' : '', onclick: (e) => { show = s; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); draw(); } }, t(`bkPF_${s}`))));
  mount(main,
    head(t('bkPayments'), ...(canPost() ? [
      h('button', { class: 'primary', 'data-act': 'receive', onclick: () => go('payments', 'in') }, icon('plus', 17), t('bkReceive')),
      h('button', { 'data-act': 'pay', onclick: () => go('payments', 'out') }, t('bkPay')),
      h('button', { 'data-act': 'expense', onclick: () => go('payments', 'expense') }, t('bkExpense')),
    ] : [])),
    h('div', { class: 'wh-head' }, seg),
    box);
  draw();
  return null;
}

const kindLabel = (p) => (p.kind === 'EXPENSE' ? 'bkExpense' : p.direction === 'IN' ? 'bkReceipt' : 'bkPaymentOut');

/** Issued documents with something still owed by (IN) or to (OUT) [contactId], oldest first. */
function openDocs(contactId, direction) {
  return books.docs.filter((d) => d.contactId === contactId && d.status === 'ISSUED' && Boolean(DOC_TYPES[d.type].sales) === (direction === 'IN')
    && DOC_TYPES[d.type].sign > 0 && d.type !== 'DEBIT_NOTE')
    .map((d) => ({ d, owe: outstanding(d, books.payments, books.docs) }))
    .filter((x) => x.owe > 0)
    .sort((a, b) => (a.d.dueDate || a.d.date) - (b.d.dueDate || b.d.date));
}

function payForm(main, direction, docId) {
  if (!canPost()) { mount(main, head(t('bkPayments')), empty(t('bkNoAccess'))); return null; }
  const forDoc = docId ? books.docs.find((d) => d.id === docId) : null;
  const sales = direction === 'IN';
  const contact = contactSelect(forDoc?.contactId || '', sales, { 'data-f': 'contact' });
  const date = dateInput(Date.now(), { 'data-f': 'date' });
  const via = accountSelect(roleAccount(accounts(), 'bank'), moneyAccount, { 'data-f': 'via' });
  const amount = amountInput(0, { 'data-f': 'amount' });
  const reference = h('input', { placeholder: t('bkPayRefPh'), 'data-f': 'reference' });
  const note = h('input', { 'data-f': 'note' });
  const allocBox = h('div');
  let alloc = [];

  // Fills the amount across the open documents, oldest first.
  const spread = () => {
    let left = senOf(amount) || 0;
    for (const a of alloc) { a.amountSen = Math.min(a.owe, Math.max(0, left)); left -= a.amountSen; }
  };
  const drawAlloc = () => {
    if (!contact.value) { mount(allocBox); return; }
    mount(allocBox, alloc.length
      ? [h('h3', {}, t('bkSettles')), table([t('bkNo'), t('date'), t('bkDue'), t('bkOwed'), t('bkThisPayment')],
        alloc.map((a) => [a.d.no, ymd(a.d.date), ymd(a.d.dueDate || a.d.date), money(a.owe),
          amountInput(a.amountSen, { 'data-alloc': a.d.id, onchange: (e) => { a.amountSen = Math.min(a.owe, Math.max(0, senOf(e.target) || 0)); drawAlloc(); } })]),
        { num: [3, 4] }),
      h('p', { class: 'muted' }, `${t('bkUnallocated')}: ${money(Math.max(0, (senOf(amount) || 0) - alloc.reduce((s, a) => s + a.amountSen, 0)))}`)]
      : h('p', { class: 'muted' }, t(sales ? 'bkNothingOwedBy' : 'bkNothingOwedTo')));
  };
  const loadAlloc = () => {
    alloc = openDocs(contact.value, direction).map((x) => ({ ...x, amountSen: 0 }));
    if (forDoc && !senOf(amount)) amount.value = (alloc.find((a) => a.d.id === forDoc.id)?.owe / 100 || 0).toFixed(2);
    else if (!senOf(amount)) amount.value = (alloc.reduce((s, a) => s + a.owe, 0) / 100 || 0).toFixed(2);
    if (forDoc) {
      // For one document: that one first.
      alloc.sort((a, b) => (b.d.id === forDoc.id) - (a.d.id === forDoc.id));
    }
    spread();
    drawAlloc();
  };
  contact.addEventListener('change', () => { amount.value = ''; loadAlloc(); });
  amount.addEventListener('change', () => { spread(); drawAlloc(); });

  mount(main,
    head(t(sales ? 'bkReceive' : 'bkPay')),
    h('section', { class: 'card bk-form', 'data-editing': '' },
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t(sales ? 'bkCustomer' : 'bkSupplier'), contact), h('label', { class: 'field' }, t('date'), date)),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t(sales ? 'bkInto' : 'bkFrom'), via), h('label', { class: 'field' }, t('bkAmount'), amount)),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('bkPayRef'), reference), h('label', { class: 'field' }, t('note'), note)),
      allocBox,
      h('div', { class: 'actions' }, h('span', { class: 'grow' }),
        h('button', { onclick: () => history.back() }, t('cancel')),
        h('button', { class: 'primary', 'data-act': 'post-payment', onclick: async (e) => {
          const c = books.contacts.find((x) => x.id === contact.value);
          if (!c) return toast(t('bkErr_NO_CONTACT'), 'error');
          const amountSen = senOf(amount);
          if (!amountSen || amountSen <= 0) return toast(t('bkErr_BAD_AMOUNT'), 'error');
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const { id, no } = await postPayment({ direction, date: dateOf(date), contactId: c.id, contactName: c.name, account: via.value, amountSen,
              allocations: alloc.filter((a) => a.amountSen > 0).map((a) => ({ docId: a.d.id, no: a.d.no, amountSen: a.amountSen })),
              reference: reference.value.trim(), note: note.value.trim() });
            await settled(() => books.payments.some((x) => x.id === id));
            toast(`${no} · ${t('bkPosted')}`, 'ok');
            go('payments', id);
          } catch (err) { failed(err); btn.disabled = false; }
        } }, icon('check', 17), t('bkPost')))));
  if (contact.value) loadAlloc();
  return null;
}

function expenseForm(main) {
  if (!canPost()) { mount(main, head(t('bkPayments')), empty(t('bkNoAccess'))); return null; }
  const date = dateInput(Date.now(), { 'data-f': 'date' });
  const via = accountSelect(roleAccount(accounts(), 'cash'), moneyAccount, { 'data-f': 'via' });
  const payee = h('input', { placeholder: t('bkPayeePh'), 'data-f': 'payee' });
  const reference = h('input', { placeholder: t('bkPayRefPh'), 'data-f': 'reference' });
  const lines = [{ description: '', qtyMilli: 1000, unitPriceSen: 0, taxType: '06', taxPct: 0, account: roleAccount(accounts(), 'expense') }];
  const box = h('div', { class: 'bk-lines' });
  const total = h('strong', { 'data-total': '' });
  const amounts = [];
  const refresh = () => {
    lines.forEach((l, i) => { if (amounts[i]) amounts[i].textContent = money(lineTotals(l).totalSen); });
    total.textContent = rmText(docTotals(lines).totalSen);
  };
  const draw = () => {
    amounts.length = 0;
    mount(box, lines.map((l, i) => {
      amounts[i] = h('strong', {}, money(lineTotals(l).totalSen));
      return h('div', { class: 'bk-line card' },
        h('div', { class: 'bk-line-top' },
          h('input', { class: 'grow', value: l.description, placeholder: t('bkExpenseDescPh'), 'data-l': 'desc', oninput: (e) => { l.description = e.target.value; } }),
          lines.length > 1 ? h('button', { class: 'ghost icon-btn', 'aria-label': t('delete'), onclick: () => { lines.splice(i, 1); draw(); } }, icon('trash', 17)) : null),
        h('div', { class: 'bk-line-grid' },
          h('label', { class: 'field' }, t('bkAccount'), accountSelect(l.account, ['EXPENSE', 'ASSET'], { 'data-l': 'account', onchange: (e) => { l.account = e.target.value; } })),
          h('label', { class: 'field' }, t('bkAmount'), amountInput(l.unitPriceSen, { 'data-l': 'price', oninput: (e) => { l.unitPriceSen = Math.max(0, senOf(e.target) || 0); refresh(); } })),
          h('label', { class: 'field' }, t('bkTaxCol'), taxSelect(l, { 'data-l': 'tax', onchange: (e) => { const [ty, p] = e.target.value.split('|'); l.taxType = ty; l.taxPct = Number(p); refresh(); } })),
          h('div', { class: 'bk-line-amt' }, h('span', { class: 'muted' }, t('bkTotal')), amounts[i])));
    }),
    h('button', { 'data-act': 'add-line', onclick: () => { lines.push({ description: '', qtyMilli: 1000, unitPriceSen: 0, taxType: '06', taxPct: 0, account: roleAccount(accounts(), 'expense') }); draw(); } }, icon('plus', 17), t('bkAddLine')));
    refresh();
  };
  mount(main,
    head(t('bkExpense')),
    h('section', { class: 'card bk-form', 'data-editing': '' },
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('bkPayee'), payee), h('label', { class: 'field' }, t('date'), date)),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('bkFrom'), via), h('label', { class: 'field' }, t('bkPayRef'), reference)),
      box,
      h('div', { class: 'bk-totals' }, h('div', { class: 'grand' }, h('span', {}, t('bkTotal')), total)),
      h('div', { class: 'actions' }, h('span', { class: 'grow' }),
        h('button', { onclick: () => history.back() }, t('cancel')),
        h('button', { class: 'primary', 'data-act': 'post-expense', onclick: async (e) => {
          const used = lines.filter((l) => l.unitPriceSen > 0);
          if (!used.length) return toast(t('bkErr_BAD_AMOUNT'), 'error');
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const { id, no } = await postPayment({ kind: 'EXPENSE', direction: 'OUT', date: dateOf(date), payee: payee.value.trim(), account: via.value,
              lines: used.map((l) => ({ ...l, description: l.description.trim() || accName(l.account) })), reference: reference.value.trim() });
            await settled(() => books.payments.some((x) => x.id === id));
            toast(`${no} · ${t('bkPosted')}`, 'ok');
            go('payments', id);
          } catch (err) { failed(err); btn.disabled = false; }
        } }, icon('check', 17), t('bkPost')))));
  draw();
  return null;
}

function view(main, id) {
  const p = books.payments.find((x) => x.id === id);
  if (!p) { mount(main, head(t('bkPayments')), empty(t('bkNotFound'))); return null; }
  mount(main,
    head(`${t(kindLabel(p))} ${p.no}`, statusPill(p.status)),
    h('section', { class: 'card bk-view' },
      h('div', { class: 'bk-meta' },
        h('div', {}, h('div', { class: 'muted' }, t('bkWho')), h('strong', {}, p.contactName || p.payee || '—')),
        h('div', {}, h('div', { class: 'muted' }, t('date')), ymd(p.date)),
        h('div', {}, h('div', { class: 'muted' }, t(p.direction === 'IN' ? 'bkInto' : 'bkFrom')), accName(p.account)),
        h('div', {}, h('div', { class: 'muted' }, t('bkAmount')), h('strong', {}, rmText(p.amountSen))),
        p.reference ? h('div', {}, h('div', { class: 'muted' }, t('bkPayRef')), p.reference) : null),
      p.kind === 'EXPENSE'
        ? table([t('bkDesc'), t('bkAccount'), t('bkAmount')], p.lines.map((l) => [l.description, accName(l.account), money(lineTotals(l).totalSen)]), { num: [2] })
        : p.allocations?.length ? table([t('bkNo'), t('bkAmount')], p.allocations.map((a) => {
          const d = books.docs.find((x) => x.id === a.docId);
          return [h('a', { href: `#/${DOC_TYPES[d?.type]?.sales ? 'sales' : 'purchases'}/${a.docId}` }, a.no), money(a.amountSen)];
        }), { num: [1] }) : h('p', { class: 'muted' }, t('bkNotSetAgainst')),
      p.note ? h('p', {}, p.note) : null,
      h('p', { class: 'muted sm' }, `${p.createdByName || ''} · ${dateTime(p.createdAt)}`),
      p.status === 'VOID' ? h('p', { class: 'muted' }, `${t('bkSt_VOID')} · ${p.voidedByName || ''}`) : null,
      canPost() && p.status === 'POSTED' ? h('div', { class: 'actions' }, h('button', { class: 'danger', 'data-act': 'void', onclick: async () => {
        if (!await confirmBox(t('bkVoidPayAsk'), t('bkVoid'), t('cancel'))) return;
        try { await voidPayment(p); toast(t('bkVoided'), 'ok'); } catch (err) { failed(err); }
      } }, t('bkVoid'))) : null));
  return null;
}
