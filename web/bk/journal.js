/**
 * The journal: every entry, newest first -- the ones documents and
 * payments made, and the ones made by hand (opening balances,
 * depreciation, owner's money, corrections). An entry is never changed;
 * "Reverse" posts its mirror image.
 *
 *   #/journal        the list
 *   #/journal/new    a new entry
 *   #/journal/<id>   one entry
 */
import { confirmBox, dateTime, h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { locked, reversal } from '../js/books.js';
import { books, canPost, dayMs, postJournal, settled, today, ymd } from './data.js';
import { accName, accountSelect, amountInput, dateInput, dateOf, empty, failed, head, money, senOf, table } from './common.js';
import { go } from './main.js';

export function render(main, sub) {
  if (sub === 'new') return editor(main);
  if (sub) return view(main, sub);
  return list(main);
}

const totalOf = (e) => e.lines.reduce((s, l) => s + (l.debitSen || 0), 0);
const sourceLink = (e) => {
  const d = books.docs.find((x) => x.id === e.sourceId);
  if (d) return `#/${d.type === 'BILL' || d.type === 'SELF_BILLED' ? 'purchases' : 'sales'}/${d.id}`;
  if (books.payments.some((x) => x.id === e.sourceId)) return `#/payments/${e.sourceId}`;
  return '';
};

let q = '';

function list(main) {
  const box = h('div');
  const draw = () => {
    const needle = q.trim().toLowerCase();
    const rows = books.journal.filter((e) => !needle || `${e.no} ${e.memo}`.toLowerCase().includes(needle)).slice(0, 500);
    mount(box, rows.length
      ? table([t('bkNo'), t('date'), t('bkMemo'), t('bkSource'), t('bkAmount')],
        rows.map((e) => [h('strong', {}, e.no), ymd(e.date), e.memo, t(`bkSrc_${e.source}`), money(totalOf(e))]),
        { num: [4], onRow: (i) => go('journal', rows[i].id) })
      : empty(t('bkNoEntries')));
  };
  mount(main,
    head(t('bkJournal'), canPost() ? h('button', { class: 'primary', 'data-act': 'new-entry', onclick: () => go('journal', 'new') }, icon('plus', 17), t('bkNewEntry')) : null),
    h('div', { class: 'wh-head' }, h('input', { type: 'search', placeholder: t('bkSearchJournal'), value: q, oninput: (e) => { q = e.target.value; draw(); } })),
    box);
  draw();
  return null;
}

function view(main, id) {
  const e = books.journal.find((x) => x.id === id);
  if (!e) { mount(main, head(t('bkJournal')), empty(t('bkNotFound'))); return null; }
  const reversed = books.journal.some((x) => x.source === 'REVERSAL' && x.sourceId === e.id);
  const link = sourceLink(e);
  mount(main,
    head(`${t('bkEntry')} ${e.no}`),
    h('section', { class: 'card bk-view' },
      h('div', { class: 'bk-meta' },
        h('div', {}, h('div', { class: 'muted' }, t('date')), ymd(e.date)),
        h('div', {}, h('div', { class: 'muted' }, t('bkSource')), link ? h('a', { href: link }, t(`bkSrc_${e.source}`)) : t(`bkSrc_${e.source}`)),
        h('div', {}, h('div', { class: 'muted' }, t('bkMemo')), e.memo || '—')),
      table([t('bkAccount'), t('bkDebit'), t('bkCredit')],
        e.lines.map((l) => [h('div', {}, accName(l.account), l.memo ? h('div', { class: 'muted sm' }, l.memo) : null), l.debitSen ? money(l.debitSen) : '', l.creditSen ? money(l.creditSen) : '']),
        { num: [1, 2], foot: [t('bkTotal'), money(totalOf(e)), money(totalOf(e))] }),
      h('p', { class: 'muted sm' }, `${e.createdByName || ''} · ${dateTime(e.createdAt)}`),
      canPost() && (e.source === 'MANUAL' || e.source === 'OPENING') && !reversed ? h('div', { class: 'actions' },
        h('button', { class: 'danger', 'data-act': 'reverse', onclick: async () => {
          if (!await confirmBox(t('bkReverseAsk'), t('bkReverse'), t('cancel'))) return;
          try {
            // On the entry's own date, or today when that period is closed.
            const date = locked(e.date, books.settings.lockDate) ? dayMs(today()) : e.date;
            const out = await postJournal({ date, memo: `${t('bkReverse')} ${e.no}`, lines: reversal(e), source: 'REVERSAL', sourceId: e.id });
            await settled(() => books.journal.some((x) => x.id === out.id));
            toast(`${out.no} · ${t('bkPosted')}`, 'ok');
            go('journal', out.id);
          } catch (err) { failed(err); }
        } }, t('bkReverse'))) : null));
  return null;
}

function editor(main) {
  if (!canPost()) { mount(main, head(t('bkJournal')), empty(t('bkNoAccess'))); return null; }
  const date = dateInput(Date.now(), { 'data-f': 'date' });
  const memo = h('input', { placeholder: t('bkMemoPh'), 'data-f': 'memo' });
  const opening = h('input', { type: 'checkbox', 'data-f': 'opening' });
  const lines = [{ account: '', debitSen: 0, creditSen: 0, memo: '' }, { account: '', debitSen: 0, creditSen: 0, memo: '' }];
  const box = h('div');
  const status = h('p', { class: 'bk-diff' });
  const sum = () => {
    const dr = lines.reduce((s, l) => s + (l.debitSen || 0), 0);
    const cr = lines.reduce((s, l) => s + (l.creditSen || 0), 0);
    status.className = `bk-diff ${dr === cr && dr ? 'ok' : 'bad'}`;
    status.textContent = `${t('bkDebit')} ${money(dr)} · ${t('bkCredit')} ${money(cr)}${dr !== cr ? ` · ${t('bkDifference')} ${money(Math.abs(dr - cr))}` : ''}`;
  };
  const draw = () => {
    mount(box, table([t('bkAccount'), t('bkDebit'), t('bkCredit'), t('bkMemo'), ''], lines.map((l, i) => [
      accountSelect(l.account || '', null, { 'data-j': `account-${i}`, onchange: (e) => { l.account = e.target.value; } }),
      // A line is one side only: typing a debit clears its credit, and back.
      amountInput(l.debitSen, { 'data-j': `debit-${i}`, oninput: (e) => {
        l.debitSen = Math.max(0, senOf(e.target) || 0);
        if (l.debitSen) { l.creditSen = 0; box.querySelector(`[data-j="credit-${i}"]`).value = ''; }
        sum();
      } }),
      amountInput(l.creditSen, { 'data-j': `credit-${i}`, oninput: (e) => {
        l.creditSen = Math.max(0, senOf(e.target) || 0);
        if (l.creditSen) { l.debitSen = 0; box.querySelector(`[data-j="debit-${i}"]`).value = ''; }
        sum();
      } }),
      h('input', { value: l.memo, oninput: (e) => { l.memo = e.target.value; } }),
      lines.length > 2 ? h('button', { class: 'ghost icon-btn', 'aria-label': t('delete'), onclick: () => { lines.splice(i, 1); draw(); } }, icon('trash', 17)) : '',
    ]), { cls: 'bk-je' }),
    h('button', { 'data-act': 'add-line', onclick: () => { lines.push({ account: '', debitSen: 0, creditSen: 0, memo: '' }); draw(); } }, icon('plus', 17), t('bkAddLine')));
    // A select shows its first option until changed: take that as chosen.
    box.querySelectorAll('select').forEach((s, i) => { lines[i].account ||= s.value; });
    sum();
  };
  mount(main,
    head(t('bkNewEntry')),
    h('section', { class: 'card bk-form', 'data-editing': '' },
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('date'), date), h('label', { class: 'field' }, t('bkMemo'), memo)),
      h('label', { class: 'check' }, opening, t('bkOpeningBalance')),
      h('p', { class: 'muted sm' }, t('bkJournalHelp')),
      box, status,
      h('div', { class: 'actions' }, h('span', { class: 'grow' }),
        h('button', { onclick: () => history.back() }, t('cancel')),
        h('button', { class: 'primary', 'data-act': 'post-entry', onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const out = await postJournal({ date: dateOf(date), memo: memo.value.trim(), lines, source: opening.checked ? 'OPENING' : 'MANUAL' });
            await settled(() => books.journal.some((x) => x.id === out.id));
            toast(`${out.no} · ${t('bkPosted')}`, 'ok');
            go('journal', out.id);
          } catch (err) { failed(err); btn.disabled = false; }
        } }, icon('check', 17), t('bkPost')))));
  draw();
  return null;
}
