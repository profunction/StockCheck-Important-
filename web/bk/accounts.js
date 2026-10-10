/**
 * The chart of accounts: every account with its balance today, by type.
 * A bookkeeper sees it; the accountant (BOOKS_ADMIN) adds accounts,
 * renames them and puts unused ones away. The accounts the postings rely
 * on (marked "system") keep their job and cannot be put away.
 */
import { h, modal, mount, toast } from '../js/dom.js';
import { getLang, t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { accountName, balanceOf, sums, TYPES } from '../js/books.js';
import { accounts, books, canAdmin, saveChart } from './data.js';
import { failed, head, money, table } from './common.js';
import { go } from './main.js';

export function render(main) {
  const s = sums(books.journal);
  mount(main,
    head(t('bkAccounts'), canAdmin() ? h('button', { class: 'primary', 'data-act': 'new-account', onclick: () => edit(null) }, icon('plus', 17), t('bkNewAccount')) : null),
    TYPES.map((type) => {
      const list = accounts().filter((a) => a.type === type);
      return h('section', { class: 'card' }, h('h2', {}, t(`bkTypeOf_${type}`)),
        table([t('bkCode'), t('name'), t('bkBalance'), ''], list.map((a) => [
          a.code,
          h('span', {}, accountName(a, getLang()), a.active === false ? h('span', { class: 'pill' }, t('bkInactive')) : null),
          money(balanceOf(a, s.get(a.code))),
          h('span', { class: 'row' },
            h('a', { href: `#/reports/gl/${a.code}` }, t('bkLedger')),
            canAdmin() ? h('button', { class: 'ghost', onclick: (e) => { e.stopPropagation(); edit(a); } }, t('bkEdit')) : null),
        ]), { num: [2] }));
    }));
  return null;
}

function edit(existing) {
  const a = existing ? { ...existing, names: { ...(existing.names || {}) } } : { code: '', type: 'EXPENSE', names: {}, role: '', system: false, active: true };
  const code = h('input', { value: a.code, disabled: Boolean(existing), inputmode: 'numeric', 'data-a': 'code' });
  const type = h('select', { disabled: Boolean(existing), 'data-a': 'type' }, TYPES.map((x) => h('option', { value: x, selected: a.type === x }, t(`bkTypeOf_${x}`))));
  const names = Object.fromEntries(['zh', 'en', 'ms'].map((l) => [l, h('input', { value: a.names[l] || (l === 'en' ? a.name || '' : ''), 'data-a': `name-${l}` })]));
  modal((close) => {
    const save = async (next) => {
      const list = existing ? accounts().map((x) => (x.code === next.code ? next : x)) : [...accounts(), next].sort((x, y) => x.code.localeCompare(y.code));
      try {
        await saveChart(list);
        toast(t('saved'), 'ok');
        close();
        go('accounts');
      } catch (err) { failed(err); }
    };
    return [
      h('h2', {}, existing ? `${a.code} ${accountName(a, getLang())}` : t('bkNewAccount')),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('bkCode'), code), h('label', { class: 'field' }, t('bkType'), type)),
      h('label', { class: 'field' }, '中文', names.zh),
      h('label', { class: 'field' }, 'English', names.en),
      h('label', { class: 'field' }, 'Bahasa Melayu', names.ms),
      a.system ? h('p', { class: 'muted sm' }, t('bkSystemAccount')) : null,
      h('div', { class: 'actions' },
        existing && !a.system ? h('button', { class: 'ghost', onclick: () => save({ ...a, active: a.active === false }) }, t(a.active === false ? 'bkReactivate' : 'bkDeactivate')) : null,
        h('span', { class: 'grow' }),
        h('button', { onclick: close }, t('cancel')),
        h('button', { class: 'primary', 'data-act': 'save-account', onclick: () => {
          const c = code.value.trim();
          if (!/^\d{3,6}$/.test(c)) return toast(t('bkErrCode'), 'error');
          if (!existing && accounts().some((x) => x.code === c)) return toast(t('bkErrCodeTaken'), 'error');
          const n = Object.fromEntries(Object.entries(names).map(([l, el]) => [l, el.value.trim()]));
          const fallback = n.en || n.zh || n.ms;
          if (!fallback) return toast(t('bkErrName'), 'error');
          save({ ...a, code: c, type: type.value, name: fallback, names: { zh: n.zh || fallback, en: n.en || fallback, ms: n.ms || fallback } });
        } }, t('save'))),
    ];
  });
}
