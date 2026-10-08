/**
 * Where stock is kept: the main site plus each branch and warehouse. The
 * same list the SuXin Count app shows; marking one a warehouse is what
 * separates the stockroom from the shop floor in this system's screens.
 * Only an admin changes it (the rules say so too).
 */
import { db, doc, getDoc, writeBatch } from '../js/fb.js';
import { h, modal, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { audit, head, pill } from './common.js';

/** The same id rule as the app (Branch.idFor): from the name, so two admins offline make one place, not two. */
export const idFor = (name) => name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

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
    h('p', { class: 'muted' }, t('whPlacesHelp')));

  async function save(id, patch, add = null) {
    try {
      const ref = doc(db, ws('meta/config'));
      const snap = await getDoc(ref);
      const branches = [...(snap.data()?.branches || [])];
      if (add) {
        if (branches.some((b) => b.id === add.id || b.name.toLowerCase() === add.name.toLowerCase())) return toast(t('whPlaceExists'), 'error');
        branches.push(add);
      } else {
        const i = branches.findIndex((b) => b.id === id);
        if (i < 0) return toast(t('notFound'), 'error');
        branches[i] = { ...branches[i], ...patch };
      }
      branches.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      const batch = writeBatch(db);
      batch.update(ref, { branches });
      const target = add || branches.find((b) => b.id === id);
      audit(batch, 'Branch', target.id, target.name, add ? 'CREATE' : 'UPDATE', { field: Object.keys(patch || { kind: 1 }).join(','), newValue: JSON.stringify(patch || add) });
      await batch.commit();
      session.branches = branches;
      toast(t('saved'), 'ok');
      draw();
    } catch (err) {
      toast(err.message || String(err), 'error');
    }
  }

  const add = () => {
    // Starter and the standalone packs are one place: the shop itself.
    if (session.plan && !session.plan.multiBranch) return toast(t('planNoBranches'), 'error');
    const name = h('input', { autofocus: true, placeholder: t('whPlaceNameHint') });
    let kind = 'WAREHOUSE';
    const seg = h('div', { class: 'seg' });
    const drawSeg = () => mount(seg, ['WAREHOUSE', 'STORE'].map((k) => h('button', { type: 'button', class: kind === k ? 'on' : '', onclick: () => { kind = k; drawSeg(); } }, t(`whKind_${k}`))));
    drawSeg();
    modal((close) => [
      h('h2', {}, t('whAddPlace')),
      h('label', { class: 'field' }, t('name'), name),
      h('div', { class: 'field' }, t('whKind'), seg),
      h('div', { class: 'actions' }, h('button', { onclick: close }, t('cancel')), h('button', { class: 'primary', onclick: async () => {
        const n = name.value.trim();
        const id = idFor(n);
        if (!n || !id) return toast(t('errName'), 'error');
        await save(null, null, { id, name: n, active: true, kind });
        close();
      } }, t('save'))),
    ]);
  };

  mount(main, head(t('whPlaces'), h('button', { class: 'primary', onclick: add }, icon('plus', 17), t('whAddPlace'))), box);
  draw();
  return null;
}
