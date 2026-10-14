/**
 * Where stock is kept: the main site plus each branch and warehouse. The
 * same list the JSOX Barcode Scan app shows; marking one a warehouse is what
 * separates the stockroom from the shop floor in this system's screens.
 * Only an admin changes it (the rules say so too).
 */
import { db, doc, setDoc } from '../js/fb.js';
import { h, mount, toast } from '../js/dom.js';
import { addBranchDialog, idFor, saveBranch } from '../js/branches.js';
import { t } from '../js/i18n.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { head, pill } from './common.js';

export { idFor };

export function render(main) {
  if (!session.isAdmin) { mount(main, head(t('whPlaces')), h('p', { class: 'muted' }, t('whAdminOnly'))); return null; }
  const box = h('div');
  const draw = () => mount(box,
    h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, [t('name'), t('whKind'), t('status'), ''].map((x) => h('th', {}, x)))),
      h('tbody', {},
        h('tr', {}, h('td', {}, h('strong', {}, t('mainShop'))), h('td', {}, pill(t('whKind_STORE'))), h('td', {}, pill(t('whOpen'), 'good')), h('td', {})),
        session.branches.map((b) => h('tr', {},
          h('td', {}, h('strong', {}, b.name), h('div', { class: 'muted', style: { fontSize: '12px' } }, b.id)),
          h('td', {}, h('div', { class: 'seg' }, ['STORE', 'WAREHOUSE'].map((k) => h('button', { class: (b.kind || 'STORE') === k ? 'on' : '', onclick: () => save(b.id, { kind: k }) }, t(`whKind_${k}`))))),
          h('td', {}, b.active === false ? pill(t('whClosed'), 'bad') : pill(t('whOpen'), 'good')),
          h('td', {}, h('button', { onclick: () => save(b.id, { active: b.active === false }) }, b.active === false ? t('whReopen') : t('whClose')))))))),
    h('p', { class: 'muted' }, t('whPlacesHelp')),
    // Whether a transfer waits for a manager before it leaves (transfers.js; the rules check it too).
    h('div', { class: 'card', style: { display: 'grid', gap: '6px', marginTop: '16px' } },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-act': 'tr-approval', checked: !!session.settings.transferApproval, onchange: (e) => {
        const on = e.target.checked;
        setDoc(doc(db, ws('pos/settings')), { transferApproval: on, updatedAt: Date.now() }, { merge: true })
          .then(() => { session.settings.transferApproval = on; toast(t('saved'), 'ok'); })
          .catch((err) => { e.target.checked = !on; toast(err.message || String(err), 'error'); });
      } }), h('b', {}, t('whApprovalOn'))),
      h('span', { class: 'muted' }, t('whApprovalHelp'))));

  const save = async (id, patch) => { if (await saveBranch(id, patch)) draw(); };
  const add = () => addBranchDialog(draw, { kind: 'WAREHOUSE' });

  mount(main, head(t('whPlaces'), h('button', { class: 'primary', onclick: add }, icon('plus', 17), t('whAddPlace'))), box);
  draw();
  return null;
}
