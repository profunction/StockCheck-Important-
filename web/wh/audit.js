/**
 * The audit log: who did what, when, and the figure before and after --
 * from this system, the till and the Stock Check app alike. Read-only here
 * and in the rules: nobody, admin included, edits or deletes an entry.
 */
import { collection, db, getDocs, limit, orderBy, query } from '../js/fb.js';
import { dateTime, h, mount } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { ws } from '../js/session.js';
import { failed, head, loading } from './common.js';

let entity = '';

export function render(main) {
  const box = h('div');
  const pick = h('select', { style: { width: 'auto' } });
  let rows = [];
  const draw = () => {
    const kinds = [...new Set(rows.map((r) => r.entity))].sort();
    mount(pick, h('option', { value: '' }, t('all')), kinds.map((k) => h('option', { value: k, selected: k === entity }, k)));
    pick.onchange = (e) => { entity = e.target.value; draw(); };
    const shown = rows.filter((r) => !entity || r.entity === entity);
    mount(box, shown.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, [t('date'), t('employee'), t('whWhat'), t('whRecord'), t('whBeforeAfter')].map((x) => h('th', {}, x)))),
      h('tbody', {}, shown.map((r) => h('tr', {},
        h('td', { class: 'muted', style: { whiteSpace: 'nowrap' } }, dateTime(r.at)), h('td', {}, r.actorName || ''),
        h('td', {}, `${r.entity} · ${t(`act_${r.action}`)}`), h('td', {}, r.entityLabel || r.entityId, r.field ? h('div', { class: 'muted', style: { fontSize: '12px' } }, r.field) : null),
        h('td', {}, r.oldValue || r.newValue ? `${r.oldValue || '—'} → ${r.newValue || '—'}` : ''))))))
      : h('p', { class: 'muted' }, t('whNoAudit')));
  };
  mount(main, head(t('whAudit'), pick), h('p', { class: 'muted' }, t('whAuditHelp')), box);
  loading(box);
  getDocs(query(collection(db, ws('auditLog')), orderBy('at', 'desc'), limit(400)))
    .then((snap) => { rows = snap.docs.map((d) => d.data()); draw(); })
    .catch((err) => failed(box, err));
  return null;
}
