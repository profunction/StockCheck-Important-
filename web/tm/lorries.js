/**
 * Lorries (货车): the fleet -- plate, make, load, and the papers that run
 * out (road tax, insurance, the PUSPAKOM inspection), with a warning a
 * month ahead. Each shows whether it is on a trip, with a driver, or free.
 */
import { db, doc, writeBatch } from '../js/fb.js';
import { h, modal, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { onDuty, papersDue, TRIP_LIVE } from '../js/tms.js';
import { audit, canManage, head, loadFleet, newId, pill, send } from './common.js';
import { LORRY_PAPERS, paperPills } from './home.js';

export function render(main) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  const refresh = () => render(main);
  mount(main, head(t('tmLorries'), canManage() ? h('button', { class: 'primary', 'data-act': 'lorry-add', onclick: () => edit(null, refresh) }, icon('plus', 17), t('tmAddLorry')) : null), box);
  loadFleet().then((fleet) => {
    const duty = onDuty(fleet.shifts);
    const onTrip = new Map(fleet.trips.filter((x) => TRIP_LIVE.includes(x.status)).map((x) => [x.lorryId, x]));
    mount(box, fleet.lorries.length ? h('div', { class: 'tm-lorries' }, fleet.lorries.map((l) => {
      const trip = onTrip.get(l.id);
      const s = duty.lorries.get(l.id);
      const state = l.active === false ? [t('tmOff'), ''] : trip ? [`${t('tmBusy')} · ${trip.tripNo}`, 'good'] : s ? [`${t('tmWithDriver')} · ${s.driverName}`, 'warn'] : [t('tmFree'), ''];
      return h('div', { class: 'card tm-lorry', 'data-lorry': l.id },
        h('div', { class: 'row' }, h('span', { class: 'tm-plate' }, l.plate), h('span', { class: 'grow' }), pill(...state)),
        h('div', { class: 'muted' }, [l.model, l.capacityKg ? `${l.capacityKg} kg` : ''].filter(Boolean).join(' · ') || '—'),
        h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, paperPills(papersDue(l, LORRY_PAPERS))),
        canManage() ? h('div', { class: 'row' }, h('span', { class: 'grow' }), h('button', { class: 'ghost', onclick: () => edit(l, refresh) }, t('tmEditLorry'))) : null);
    })) : h('p', { class: 'muted' }, t('tmNoLorries')));
  }).catch((err) => mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`)));
  return null;
}

function edit(l, done) {
  const isNew = !l;
  const id = l?.id || newId('tmsLorries');
  const f = (key, type = 'text', extra = {}) => h('input', { type, value: l?.[key] ?? '', 'data-f': key, ...extra });
  const plate = f('plate', 'text', { style: { textTransform: 'uppercase' } });
  const model = f('model');
  const cap = f('capacityKg', 'number', { min: 0 });
  const tax = f('roadTaxExpiry', 'date');
  const ins = f('insuranceExpiry', 'date');
  const insp = f('inspectionExpiry', 'date');
  const active = h('input', { type: 'checkbox', checked: l?.active !== false });
  modal((close) => [
    h('h2', {}, isNew ? t('tmAddLorry') : t('tmEditLorry')),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('tmPlate'), plate), h('label', { class: 'field' }, t('tmModel'), model)),
    h('label', { class: 'field' }, t('tmCapacity'), cap),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('tmRoadTax'), tax), h('label', { class: 'field' }, t('tmInsurance'), ins)),
    h('label', { class: 'field' }, t('tmInspection'), insp),
    h('label', { class: 'check' }, active, t('tmActive')),
    h('div', { class: 'actions' }, h('button', { onclick: close }, t('tmCancel')), h('button', { class: 'primary', 'data-act': 'lorry-save', onclick: () => {
      const p = plate.value.trim().toUpperCase().replace(/\s+/g, ' ');
      if (!p) return toast(t('tmNeedPlate'), 'error');
      const now = Date.now();
      const data = {
        plate: p, model: model.value.trim(), capacityKg: Number(cap.value) || 0, roadTaxExpiry: tax.value || '', insuranceExpiry: ins.value || '', inspectionExpiry: insp.value || '',
        active: active.checked, updatedAt: now, createdAt: l?.createdAt || now, createdByUid: l?.createdByUid || session.uid,
      };
      const batch = writeBatch(db);
      batch.set(doc(db, ws(`tmsLorries/${id}`)), data);
      audit(batch, 'Lorry', id, p, isNew ? 'CREATE' : 'UPDATE');
      send(batch, t('tmSaved'));
      close();
      setTimeout(done, 50);
    } }, t('tmSave')))]);
}
