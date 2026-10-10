/**
 * Count lists (templates in the app, TemplateScreens.kt): what a kind of
 * count asks for beyond the barcode and the quantity -- a temperature, a
 * condition to pick, a date, a signature -- whether it needs photos before
 * it can be finished, and which roles may not change which field.
 *
 *   #/lists          every list
 *   #/lists/new      a new one
 *   #/lists/<id>     editing one
 */
import { collection, db, doc, getDoc, getDocs, writeBatch } from '../js/fb.js';
import { confirmBox, h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { session, ws } from '../js/session.js';
import { audit, go, tabs } from './main.js';

const TYPES = ['TEXT', 'NUMBER', 'BARCODE', 'DATE', 'DROPDOWN', 'LOCATION', 'SIGNATURE'];
const may = (p) => session.isAdmin || session.can(p);

/** A label to a stable storage key, as the app makes it. */
export function slug(label) {
  return String(label).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '_').replace(/^_+|_+$/g, '') || 'field';
}

export function render(main, id) {
  if (id) return editor(main, id);
  const box = h('div', { class: 'cnt-list' }, h('p', { class: 'muted' }, t('loading')));
  mount(main, tabs('lists'),
    h('div', { class: 'cnt-titlebar' }, h('h1', {}, t('clTitle')),
      may('CREATE_TEMPLATE') ? h('button', { class: 'primary', 'data-act': 'new-list', onclick: () => go('#/lists/new') }, icon('plus', 18), t('clNew')) : null),
    h('p', { class: 'muted' }, t('clLead')), box);
  getDocs(collection(db, ws('templates'))).then((snap) => {
    const lists = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (b.active !== false) - (a.active !== false) || (a.name || '').localeCompare(b.name || ''));
    mount(box, lists.length ? lists.map((l) => h('a', { class: `cnt-card${l.active === false ? ' off' : ''}`, href: `#/lists/${l.id}` },
      h('div', { class: 'cnt-card-top' }, h('strong', { class: 'grow' }, l.name || '—'), l.active === false ? h('span', { class: 'pill' }, t('clOff')) : null),
      l.description ? h('div', { class: 'muted' }, l.description) : null,
      h('div', { class: 'cnt-card-stats' },
        h('span', { class: 'cnt-stat' }, icon('sliders', 15), `${(l.fields || []).length} ${t('cFieldsN')}`),
        l.photoRequired ? h('span', { class: 'cnt-stat' }, icon('camera', 15), `≥ ${l.minPhotos || 1}`) : null,
        (l.fields || []).some((f) => f.type === 'SIGNATURE') ? h('span', { class: 'cnt-stat' }, icon('check', 15), t('clSigned')) : null)))
      : h('div', { class: 'cnt-empty-big' }, icon('book', 40), h('p', {}, t('clNone'))));
  }).catch((err) => mount(box, h('p', { class: 'card' }, `${t('errLoad')}: ${err.message || err}`)));
  return null;
}

function editor(main, id) {
  const isNew = id === 'new';
  const canSave = isNew ? may('CREATE_TEMPLATE') : may('EDIT_TEMPLATE');
  let roles = [];
  let fields = [];
  let original = null;
  const name = h('input', { disabled: !canSave, 'data-f': 'name' });
  const desc = h('input', { disabled: !canSave });
  const active = h('input', { type: 'checkbox', checked: true, disabled: !canSave });
  const photo = h('input', { type: 'checkbox', disabled: !canSave });
  const minPhotos = h('input', { type: 'number', min: 1, max: 20, value: 1, disabled: !canSave, style: { width: '80px' } });
  const fieldsBox = h('div', { class: 'cl-fields' });

  const drawFields = () => mount(fieldsBox, fields.length ? fields.map((f, i) => {
    const type = h('select', { disabled: !canSave, onchange: (e) => { f.type = e.target.value; drawFields(); } }, TYPES.map((ty) => h('option', { value: ty, selected: f.type === ty }, t(`clT_${ty}`))));
    const lockChips = h('div', { class: 'chips-row' }, roles.filter((r) => r.id !== 'admin').map((r) => h('button', {
      type: 'button', disabled: !canSave, class: (f.lockedForRoleIds || []).includes(r.id) ? 'on' : '',
      onclick: () => { const set = new Set(f.lockedForRoleIds || []); if (set.has(r.id)) set.delete(r.id); else set.add(r.id); f.lockedForRoleIds = [...set]; drawFields(); },
    }, icon('lock', 13), r.name || r.id)));
    return h('div', { class: 'card cl-field', 'data-field': i },
      h('div', { class: 'row' },
        h('b', { class: 'grow' }, `${i + 1}. ${f.label || t('clUntitled')}`),
        canSave ? h('button', { class: 'icon-btn ghost', disabled: i === 0, 'aria-label': '↑', onclick: () => { [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]]; drawFields(); } }, '↑') : null,
        canSave ? h('button', { class: 'icon-btn ghost', disabled: i === fields.length - 1, 'aria-label': '↓', onclick: () => { [fields[i + 1], fields[i]] = [fields[i], fields[i + 1]]; drawFields(); } }, '↓') : null,
        canSave ? h('button', { class: 'icon-btn ghost danger', 'aria-label': t('clRemoveField'), onclick: () => { fields.splice(i, 1); drawFields(); } }, icon('trash', 16)) : null),
      h('div', { class: 'row2' },
        h('label', { class: 'field' }, t('clLabel'), h('input', { value: f.label || '', disabled: !canSave, oninput: (e) => { f.label = e.target.value; } })),
        h('label', { class: 'field' }, t('clType'), type)),
      f.type === 'DROPDOWN' ? h('label', { class: 'field' }, t('clOptions'), h('input', { value: (f.options || []).join(', '), disabled: !canSave, placeholder: 'OK, Damaged, Missing',
        oninput: (e) => { f.options = e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean); } })) : null,
      f.type !== 'SIGNATURE' ? h('label', { class: 'field' }, t('clDefault'), h('input', { value: f.defaultValue || '', disabled: !canSave, oninput: (e) => { f.defaultValue = e.target.value; } })) : null,
      h('div', { class: 'row' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!f.required, disabled: !canSave, onchange: (e) => { f.required = e.target.checked; } }), t('clRequired')),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.includeInExport !== false, disabled: !canSave, onchange: (e) => { f.includeInExport = e.target.checked; } }), t('clInExport'))),
      roles.length > 1 ? h('div', { class: 'field' }, t('clLockedFor'), lockChips) : null);
  }) : h('p', { class: 'muted' }, t('clNoFields')));

  const save = async () => {
    if (!name.value.trim()) return toast(t('clNeedName'), 'error');
    const keys = new Set();
    const clean = fields.map((f, i) => {
      // An existing field keeps its key, so values already counted stay attached.
      let key = f.key || slug(f.label || `field ${i + 1}`);
      while (keys.has(key)) key = `${key}_${i + 1}`;
      keys.add(key);
      return { key, label: (f.label || '').trim() || key, type: f.type || 'TEXT', required: !!f.required, options: f.type === 'DROPDOWN' ? f.options || [] : [],
        defaultValue: f.type === 'SIGNATURE' ? '' : (f.defaultValue || '').trim(), order: i, includeInExport: f.includeInExport !== false, lockedForRoleIds: f.lockedForRoleIds || [] };
    });
    if (clean.some((f) => f.type === 'DROPDOWN' && !f.options.length)) return toast(t('clNeedOptions'), 'error');
    const now = Date.now();
    const ref = isNew ? doc(collection(db, ws('templates'))) : doc(db, ws(`templates/${id}`));
    const data = {
      name: name.value.trim(), description: desc.value.trim(), fields: clean, active: active.checked,
      photoRequired: photo.checked, minPhotos: Math.max(1, Math.min(20, Number(minPhotos.value) || 1)),
      signatureRequired: clean.some((f) => f.type === 'SIGNATURE' && f.required),
      createdByUid: original?.createdByUid || session.uid, createdAt: original?.createdAt || now, updatedAt: now,
    };
    try {
      const batch = writeBatch(db);
      batch.set(ref, data);
      audit(batch, 'Template', ref.id, data.name, isNew ? 'CREATE' : 'UPDATE', '');
      await batch.commit();
      toast(t('clSaved'), 'ok');
      go('#/lists');
    } catch (err) { toast(err.message || String(err), 'error'); }
  };

  const remove = async () => {
    if (!await confirmBox(t('clDeleteQ'), t('clDelete'), t('cancel'))) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, ws(`templates/${id}`)));
      audit(batch, 'Template', id, original?.name || '', 'DELETE', '');
      await batch.commit();
      go('#/lists');
    } catch (err) { toast(err.message || String(err), 'error'); }
  };

  mount(main,
    h('div', { class: 'row cnt-back' }, h('a', { href: '#/lists' }, `← ${t('clTitle')}`)),
    h('h1', {}, isNew ? t('clNew') : t('clEdit')),
    h('div', { class: 'card cnt-newform cl-form' },
      h('label', { class: 'field' }, t('clName'), name),
      h('label', { class: 'field' }, t('clDesc'), desc),
      h('label', { class: 'check' }, active, t('clActive')),
      h('div', { class: 'row' }, h('label', { class: 'check' }, photo, t('clPhotoRule')), minPhotos)),
    h('div', { class: 'cnt-titlebar' }, h('h2', { class: 'grow', style: { margin: 0 } }, t('clFields')),
      canSave ? h('button', { 'data-act': 'add-field', onclick: () => { fields.push({ label: '', type: 'TEXT', includeInExport: true }); drawFields(); fieldsBox.lastElementChild?.querySelector('input')?.focus(); } }, icon('plus', 17), t('clAddField')) : null),
    fieldsBox,
    h('div', { class: 'actions cl-actions' },
      !isNew && may('DELETE_TEMPLATE') ? h('button', { class: 'danger', 'data-act': 'delete-list', onclick: remove }, icon('trash', 17), t('clDelete')) : null,
      h('span', { class: 'grow' }),
      h('button', { onclick: () => go('#/lists') }, t('cancel')),
      canSave ? h('button', { class: 'primary', 'data-act': 'save-list', onclick: save }, t('save')) : null));
  drawFields();
  getDocs(collection(db, ws('roles'))).then((s) => { roles = s.docs.map((d) => ({ ...d.data(), id: d.id })); drawFields(); }).catch(() => {});
  if (!isNew) {
    getDoc(doc(db, ws(`templates/${id}`))).then((s) => {
      if (!s.exists()) { mount(main, h('p', { class: 'card' }, t('notFound'))); return; }
      original = s.data();
      name.value = original.name || '';
      desc.value = original.description || '';
      active.checked = original.active !== false;
      photo.checked = !!original.photoRequired;
      minPhotos.value = original.minPhotos || 1;
      fields = [...(original.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0)).map((f) => ({ ...f }));
      drawFields();
    }).catch((err) => toast(err.message || String(err), 'error'));
  }
  name.focus();
  return null;
}

