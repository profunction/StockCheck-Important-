/**
 * Drivers (司机): who drives, their licence, and clocking in and out --
 * which lorry, and the odometer at both ends, so the day's hours and
 * kilometres are kept. A manager adds and edits drivers; anyone who moves
 * stock clocks a driver in and out (the driver on their own phone, or the
 * dispatcher at the gate).
 */
import { db, doc, writeBatch } from '../js/fb.js';
import { dateTime, h, modal, mount, timeOfDay, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { hoursText, kmDriven, onDuty, papersDue, shiftMinutes, TRIP_LIVE } from '../js/tms.js';
import { audit, canManage, canWork, head, loadFleet, newId, pill, send } from './common.js';
import { paperPills } from './home.js';

/** "11/10 14:25": a shift's ends, short enough for a phone's table. */
const short = (ms) => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1} ${timeOfDay(ms)}`; };

export function render(main) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  mount(main, head(t('tmDrivers'), canManage() ? h('button', { class: 'primary', 'data-act': 'driver-add', onclick: () => edit(null, () => render(main)) }, icon('plus', 17), t('tmAddDriver')) : null), box);
  loadFleet().then((fleet) => {
    const duty = onDuty(fleet.shifts);
    const onTrip = new Map(fleet.trips.filter((x) => TRIP_LIVE.includes(x.status)).map((x) => [x.driverId, x]));
    const drivers = fleet.drivers.filter((d) => d.active !== false || canManage());
    const refresh = () => render(main);
    mount(box,
      drivers.length ? h('div', { class: 'wh-list' }, drivers.map((d) => {
        const s = duty.drivers.get(d.id);
        const trip = onTrip.get(d.id);
        return h('div', { class: `card tm-driver${s ? ' on' : ''}`, 'data-driver': d.id },
          h('div', { class: 'row' },
            h('span', { class: 'tm-avatar' }, (d.name || '?').slice(0, 1).toUpperCase()),
            h('div', { class: 'grow' }, h('b', {}, d.name), h('div', { class: 'muted', style: { fontSize: '13px' } }, [d.phone, d.licenceNo].filter(Boolean).join(' · '))),
            s ? pill(`${t('tmOnDutyNow')} · ${t('tmSince')} ${timeOfDay(s.inAt)}`, 'good') : pill(d.active === false ? t('tmOff') : t('tmOffDuty'))),
          h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } },
            s?.plate ? h('span', { class: 'pill shelf' }, `🚚 ${s.plate}`) : null,
            trip ? h('a', { class: 'pill good', href: `#/trips/${trip.id}` }, `${trip.tripNo} · ${t(`trip_${trip.status}`)}`) : null,
            paperPills(papersDue(d, ['licenceExpiry']))),
          h('div', { class: 'row' },
            canManage() ? h('button', { class: 'ghost', onclick: () => edit(d, refresh) }, t('tmEditDriver')) : null,
            h('span', { class: 'grow' }),
            canWork() && d.active !== false ? (s
              ? h('button', { 'data-act': 'clock-out', onclick: () => clockOut(s, refresh) }, icon('clock', 17), t('tmClockOut'))
              : h('button', { class: 'primary', 'data-act': 'clock-in', onclick: () => clockIn(d, fleet, refresh) }, icon('clock', 17), t('tmClockIn'))) : null));
      })) : h('p', { class: 'muted' }, t('tmNoDrivers')),
      fleet.shifts.length ? h('section', { class: 'card', style: { marginTop: '16px' } }, h('h2', {}, t('tmShifts')),
        h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
          h('thead', {}, h('tr', {}, [t('tmDriver'), t('tmLorry'), t('tmIn'), t('tmOut'), t('tmHours'), t('tmKm')].map((x, i) => h('th', { class: i > 3 ? 'num' : '' }, x)))),
          h('tbody', {}, fleet.shifts.slice(0, 60).map((s) => h('tr', {},
            h('td', {}, s.driverName), h('td', { class: 'nowrap' }, s.plate || '—'), h('td', { class: 'nowrap' }, short(s.inAt)), h('td', { class: 'nowrap' }, s.outAt ? short(s.outAt) : pill(t('tmOnDutyNow'), 'good')),
            h('td', { class: 'num' }, hoursText(shiftMinutes(s))), h('td', { class: 'num' }, kmDriven(s) ?? '—'))))))) : null);
  }).catch((err) => mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`)));
  return null;
}

function edit(d, done) {
  const isNew = !d;
  const id = d?.id || newId('tmsDrivers');
  const f = (key, type = 'text', extra = {}) => h('input', { type, value: d?.[key] || '', 'data-f': key, ...extra });
  const name = f('name');
  const phone = f('phone', 'tel');
  const licence = f('licenceNo');
  const expiry = f('licenceExpiry', 'date');
  const active = h('input', { type: 'checkbox', checked: d?.active !== false });
  modal((close) => [
    h('h2', {}, isNew ? t('tmAddDriver') : t('tmEditDriver')),
    h('label', { class: 'field' }, t('tmName'), name),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('tmPhone'), phone), h('label', { class: 'field' }, t('tmLicence'), licence)),
    h('label', { class: 'field' }, t('tmLicenceExpiry'), expiry),
    h('label', { class: 'check' }, active, t('tmActive')),
    h('div', { class: 'actions' }, h('button', { onclick: close }, t('tmCancel')), h('button', { class: 'primary', 'data-act': 'driver-save', onclick: () => {
      if (!name.value.trim()) return toast(t('tmNeedName'), 'error');
      const now = Date.now();
      const data = { name: name.value.trim(), phone: phone.value.trim(), licenceNo: licence.value.trim(), licenceExpiry: expiry.value || '', active: active.checked,
        updatedAt: now, createdAt: d?.createdAt || now, createdByUid: d?.createdByUid || session.uid };
      const batch = writeBatch(db);
      batch.set(doc(db, ws(`tmsDrivers/${id}`)), data);
      audit(batch, 'Driver', id, data.name, isNew ? 'CREATE' : 'UPDATE');
      send(batch, t('tmSaved'));
      close();
      setTimeout(done, 50);
    } }, t('tmSave')))]);
}

function clockIn(d, fleet, done) {
  const busy = new Set([...onDuty(fleet.shifts).lorries.keys()]);
  const lorry = h('select', { 'data-f': 'shift-lorry' }, h('option', { value: '' }, '—'),
    fleet.lorries.filter((l) => l.active !== false).map((l) => h('option', { value: l.id, disabled: busy.has(l.id) }, `${l.plate}${busy.has(l.id) ? ` · ${t('tmWithDriver')}` : ''}`)));
  const odo = h('input', { inputmode: 'numeric', 'data-f': 'odo-in', placeholder: '0' });
  modal((close) => [
    h('h2', {}, `${t('tmClockIn')} · ${d.name}`),
    h('label', { class: 'field' }, t('tmLorry'), lorry),
    h('label', { class: 'field' }, t('tmOdo'), odo),
    h('div', { class: 'actions' }, h('button', { onclick: close }, t('tmCancel')), h('button', { class: 'primary', 'data-act': 'clock-in-save', onclick: () => {
      const l = fleet.lorries.find((x) => x.id === lorry.value);
      const id = newId('tmsShifts');
      const now = Date.now();
      const n = Number(odo.value);
      const batch = writeBatch(db);
      batch.set(doc(db, ws(`tmsShifts/${id}`)), {
        driverId: d.id, driverName: d.name, lorryId: l?.id || '', plate: l?.plate || '', branchId: session.branchId || '',
        inAt: now, outAt: null, ...(odo.value && Number.isFinite(n) ? { odoIn: n } : {}), createdByUid: session.uid, createdByName: session.name,
      });
      audit(batch, 'Shift', id, d.name, 'CREATE', { newValue: l?.plate || '' });
      send(batch, t('tmClockedIn'));
      close();
      setTimeout(done, 50);
    } }, icon('clock', 17), t('tmClockIn')))]);
}

function clockOut(s, done) {
  const odo = h('input', { inputmode: 'numeric', 'data-f': 'odo-out', placeholder: s.odoIn != null ? String(s.odoIn) : '0' });
  modal((close) => [
    h('h2', {}, `${t('tmClockOut')} · ${s.driverName}`),
    h('p', { class: 'muted' }, `${s.plate || ''} · ${t('tmSince')} ${dateTime(s.inAt)} · ${hoursText(shiftMinutes(s))}`),
    h('label', { class: 'field' }, t('tmOdo'), odo),
    h('div', { class: 'actions' }, h('button', { onclick: close }, t('tmCancel')), h('button', { class: 'primary', 'data-act': 'clock-out-save', onclick: () => {
      const n = Number(odo.value);
      const batch = writeBatch(db);
      batch.update(doc(db, ws(`tmsShifts/${s.id}`)), { outAt: Date.now(), ...(odo.value && Number.isFinite(n) ? { odoOut: n } : {}), outByName: session.name, updatedAt: Date.now() });
      audit(batch, 'Shift', s.id, s.driverName, 'UPDATE', { field: 'outAt', newValue: 'clocked out' });
      send(batch, t('tmClockedOut'));
      close();
      setTimeout(done, 50);
    } }, icon('clock', 17), t('tmClockOut')))]);
}
