/**
 * Each day's sales into the books (每日销售入账): the takings of every
 * day -- from JSOX POS and from any connected system (a friend's POS) --
 * one line per day and source, posted as one journal entry each
 * (books.js entryForDay): cash and settlements against sales and SST.
 * A day already posted says so and cannot be posted twice.
 */
import { h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { entryForDay } from '../js/books.js';
import { api } from '../js/connections.js';
import { accounts, books, canPost, dayMs, postJournal } from './data.js';
import { head, money, rmText } from './common.js';

const keyOf = (d) => `${d.day}|${d.connectionId || ''}`;

export function render(main) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  mount(main, head(t('bkDaily')), h('p', { class: 'muted' }, t('bkDailyLead')), box);
  if (!canPost()) { mount(box, h('p', { class: 'card muted' }, t('bkDailyNoRight'))); return null; }
  let days = [];
  const posted = () => new Set(books.journal.filter((e) => e.source === 'DAILY_SALES').map((e) => e.sourceId));
  const post = async (d) => {
    const lines = entryForDay(d, accounts());
    await postJournal({ date: dayMs(d.day), memo: `${t('bkDailyMemo')} ${d.day} · ${d.source}`, lines, source: 'DAILY_SALES', sourceId: keyOf(d) });
  };
  const draw = () => {
    const done = posted();
    const open = days.filter((d) => !done.has(keyOf(d)));
    mount(box,
      h('div', { class: 'cards' },
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('bkDailyOpen')), h('div', { class: 'value' }, String(open.length))),
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('bkDailyOpenSen')), h('div', { class: 'value' }, rmText(open.reduce((s, d) => s + d.totalSen, 0))))),
      open.length > 1 ? h('div', { class: 'row', style: { margin: '10px 0' } }, h('span', { class: 'grow' }),
        h('button', { class: 'primary', 'data-act': 'daily-all', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try { for (const d of [...open].reverse()) await post(d); toast(t('bkDailyDone'), 'ok'); } catch (err) { toast(err.message || String(err), 'error'); }
          setTimeout(draw, 300);
        } }, icon('check', 17), t('bkDailyAll').replace('{n}', open.length))) : null,
      days.length ? h('div', { class: 'wh-list' }, days.map((d) => h('div', { class: 'card row bk-day', 'data-day': keyOf(d) },
        h('div', { class: 'grow' }, h('b', {}, d.day), h('span', { class: 'muted' }, ` · ${d.source}`),
          h('div', { class: 'muted', style: { fontSize: '13px' } }, `${d.receipts} ${t('bkDailyReceipts')} · ${t('bkDailyCash')} ${money(d.cashSen)} · ${t('bkDailyOther')} ${money(d.totalSen - d.cashSen)}${d.taxSen ? ` · SST ${money(d.taxSen)}` : ''}`)),
        h('b', {}, rmText(d.totalSen)),
        done.has(keyOf(d)) ? h('span', { class: 'pill good' }, t('bkDailyPosted'))
          : h('button', { class: 'primary', 'data-act': 'daily-post', onclick: async (e) => {
            e.currentTarget.disabled = true;
            try { await post(d); toast(t('bkDailyDone'), 'ok'); } catch (err) { toast(err.message || String(err), 'error'); }
            setTimeout(draw, 300);
          } }, t('bkDailyPost')))))
        : h('p', { class: 'muted' }, t('bkDailyNone')));
  };
  api('/app/books/sales-days').then((r) => { days = r.days || []; draw(); })
    .catch((err) => mount(box, h('p', { class: 'card muted' }, `${t('errLoad')}: ${err.message || err}`)));
  return null;
}
