/**
 * Trips (行程): a lorry, its driver and the stops it makes.
 *
 *   #/trips          going and finished
 *   #/trips/new      plan one: depot, lorry, driver, stops ticked from what
 *                    the warehouse has waiting (web/js/tms.js stopsToPlan)
 *   #/trips/<id>     load, leave, deliver each stop with a signature, finish
 *
 * PLANNED -> LOADING -> ON_ROAD -> DONE, or CANCELLED. A stop is PENDING,
 * then DELIVERED (who received it and their signature) or FAILED (why).
 * The stock is not moved here: the branch receives a transfer in the WMS,
 * and a reservation is handed over there; the trip is the proof of the road.
 */
import { db, doc, getDoc, writeBatch } from '../js/fb.js';
import { confirmBox, dateTime, h, isoDay, modal, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { isSigned } from '../js/counting.js';
import { nextStatuses, nextStop, onDuty, stopsToPlan, TRIP_LIVE, tripProgress } from '../js/tms.js';
import { signaturePad } from '../cnt/sign.js';
import { metres, navLinks } from '../js/slippy.js';
import {
  audit, canWork, head, inkPicture, loadFleet, loadOrders, loadPlacesGeo, myPlaces, newId, pill, placeName, refNo, send, STOP_TONE, stopKind, stopTo, TRIP_TONE,
} from './common.js';
import { go } from './main.js';

let tab = 'live';

// The driver's phone sharing where the lorry is, while one trip is on the road.
let gps = null;
function stopGps() {
  if (gps) { try { navigator.geolocation.clearWatch(gps.watch); } catch { /* gone */ } window.removeEventListener('hashchange', gps.leave); gps = null; }
}

/** One trip as a card: number, lorry, driver, how far. */
export function tripCard(x) {
  const p = tripProgress(x);
  return h('button', { class: 'wh-card tm-trip', 'data-trip': x.id, onclick: () => go('trips', x.id) },
    h('div', { class: 'row' }, h('strong', { class: 'grow' }, x.tripNo), h('span', { class: 'pill shelf' }, `🚚 ${x.plate || '—'}`), x.dock && ['PLANNED', 'LOADING'].includes(x.status) ? h('span', { class: 'pill warn' }, x.dock) : null, pill(t(`trip_${x.status}`), TRIP_TONE[x.status])),
    h('div', {}, `${x.driverName || '—'} · ${placeName(x.branchId)} → ${(x.stops || []).map(stopTo).join(', ')}`),
    h('div', { class: 'pk-bar' }, h('span', { style: { width: `${p.total ? Math.round(100 * (p.delivered + p.failed) / p.total) : 0}%` } })),
    h('div', { class: 'muted' }, `${p.delivered + p.failed}/${p.total} ${t('tmStops')}${p.failed ? ` · ${p.failed} ${t('stop_FAILED')}` : ''} · ${x.date || ''}`));
}

export function render(main, sub) {
  if (sub === 'new') return plan(main);
  if (sub) return open(main, sub);
  const tabs = h('div', { class: 'seg wh-tabs' });
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  mount(main, head(t('tmTrips'), canWork() ? h('button', { class: 'primary', 'data-act': 'trip-new', onclick: () => go('trips', 'new') }, icon('plus', 17), t('tmNewTrip')) : null), tabs, box);
  loadFleet().then(({ trips }) => {
    const groups = { live: trips.filter((x) => TRIP_LIVE.includes(x.status)), done: trips.filter((x) => !TRIP_LIVE.includes(x.status)).slice(0, 40) };
    const draw = () => {
      mount(tabs, Object.keys(groups).map((k) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, `${t(`tmTr_${k}`)} ${groups[k].length}`)));
      mount(box, groups[tab].length ? h('div', { class: 'wh-list' }, groups[tab].map(tripCard)) : h('p', { class: 'muted' }, t('tmNoTrips')));
    };
    draw();
  }).catch((err) => mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`)));
  return null;
}

/** Planning a trip. */
function plan(main) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  mount(main, head(t('tmNewTrip')), box);
  Promise.all([loadFleet(), loadOrders()]).then(([fleet, orders]) => {
    const places = myPlaces();
    // Lorries leave from a warehouse: this account's own, else the first.
    let depot = places.find((p) => p.kind === 'WAREHOUSE' && p.id === session.branchId)?.id
      ?? places.find((p) => p.kind === 'WAREHOUSE')?.id ?? places[0]?.id ?? '';
    const busy = new Set(fleet.trips.filter((x) => TRIP_LIVE.includes(x.status)).map((x) => x.lorryId));
    const duty = onDuty(fleet.shifts);
    const lorries = fleet.lorries.filter((l) => l.active !== false);
    const drivers = fleet.drivers.filter((d) => d.active !== false);
    const lorry = h('select', { 'data-f': 'lorry' }, h('option', { value: '' }, t('tmPickLorry')),
      lorries.map((l) => h('option', { value: l.id, disabled: busy.has(l.id) }, `${l.plate}${l.model ? ` · ${l.model}` : ''}${busy.has(l.id) ? ` · ${t('tmBusy')}` : ''}`)));
    const driver = h('select', { 'data-f': 'driver' }, h('option', { value: '' }, t('tmPickDriver')),
      // Drivers at work first.
      [...drivers].sort((a, b) => duty.drivers.has(b.id) - duty.drivers.has(a.id)).map((d) => h('option', { value: d.id }, `${d.name}${duty.drivers.has(d.id) ? ` · ${t('tmOnDutyNow')}` : ''}`)));
    // A driver at work with a lorry brings that lorry along.
    driver.onchange = () => { const s = duty.drivers.get(driver.value); if (s?.lorryId && !busy.has(s.lorryId)) lorry.value = s.lorryId; };
    const date = h('input', { type: 'date', value: isoDay(), 'data-f': 'date' });
    const stopsBox = h('div');
    const manual = [];
    let ticked = new Map();
    const drawStops = () => {
      const waiting = stopsToPlan({ ...orders, trips: fleet.trips }, depot);
      const all = [...waiting, ...manual];
      for (const s of all) if (!ticked.has(`${s.kind}:${s.refId}`)) ticked.set(`${s.kind}:${s.refId}`, true);
      mount(stopsBox, all.length ? h('div', { class: 'pk-orders' }, all.map((s) => {
        const key = `${s.kind}:${s.refId}`;
        return h('label', { class: `pk-order${ticked.get(key) ? ' on' : ''}`, 'data-stop': s.ref },
          h('input', { type: 'checkbox', checked: ticked.get(key), onchange: (e) => { ticked.set(key, e.target.checked); drawStops(); } }),
          h('span', { class: 'grow' }, h('b', {}, s.ref), h('span', { class: 'muted' }, ` · ${stopKind(s)} → ${stopTo(s)}`),
            s.units ? h('div', { class: 'muted', style: { fontSize: '13px' } }, `${formatQty(s.units)} ${t('tmUnits')}`) : null,
            s.address ? h('div', { class: 'muted', style: { fontSize: '13px' } }, s.address) : null));
      })) : h('p', { class: 'muted', style: { margin: 0 } }, t('tmNoStopsWaiting')));
      stopsBox.chosen = all.filter((s) => ticked.get(`${s.kind}:${s.refId}`));
    };
    const depotSel = places.length > 1 ? h('select', { 'data-f': 'depot', onchange: (e) => { depot = e.target.value; ticked = new Map(); drawStops(); } },
      places.map((p) => h('option', { value: p.id, selected: p.id === depot }, p.name))) : null;
    const name = h('input', { placeholder: t('tmStopName'), 'data-f': 'stop-name' });
    const address = h('input', { placeholder: t('tmStopAddress'), 'data-f': 'stop-address' });
    const save = () => {
      const chosen = stopsBox.chosen || [];
      if (!lorry.value) return toast(t('tmNeedLorry'), 'error');
      if (!driver.value) return toast(t('tmNeedDriver'), 'error');
      if (!chosen.length) return toast(t('tmNeedStops'), 'error');
      const l = lorries.find((x) => x.id === lorry.value);
      const d = drivers.find((x) => x.id === driver.value);
      const id = newId('tmsTrips');
      const now = Date.now();
      const trip = {
        tripNo: refNo('TRP'), branchId: depot || '', date: date.value || isoDay(), status: 'PLANNED',
        lorryId: l.id, plate: l.plate, driverId: d.id, driverName: d.name,
        stops: chosen.map((s) => ({ kind: s.kind, refId: s.refId, ref: s.ref, to: s.to || '', address: s.address || '', units: s.units || 0, status: 'PENDING' })),
        createdByUid: session.uid, createdByName: session.name, createdAt: now, updatedAt: now,
      };
      const batch = writeBatch(db);
      batch.set(doc(db, ws(`tmsTrips/${id}`)), trip);
      audit(batch, 'Trip', id, trip.tripNo, 'CREATE', { newValue: `${trip.plate} · ${trip.driverName} · ${trip.stops.length} stops` });
      send(batch, t('tmTripSaved'));
      go('trips', id);
    };
    mount(box,
      h('div', { class: 'card wh-head' },
        depotSel ? h('label', { class: 'field' }, t('tmDepot'), depotSel) : null,
        h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('tmLorry'), lorry), h('label', { class: 'field' }, t('tmDriver'), driver)),
        h('label', { class: 'field' }, t('tmDate'), date)),
      h('section', { class: 'card pk-waiting' }, h('h2', { style: { margin: 0 } }, t('tmStops')), h('p', { class: 'muted' }, t('tmStopsHelp')), stopsBox,
        h('details', { style: { marginTop: '10px' } }, h('summary', {}, t('tmAddStop')),
          h('div', { class: 'grid2', style: { marginTop: '8px' } }, name, address),
          h('button', { style: { marginTop: '8px' }, 'data-act': 'stop-add', onclick: () => {
            if (!name.value.trim()) return toast(t('tmNeedName'), 'error');
            manual.push({ kind: 'MANUAL', refId: newId('tmsTrips'), ref: name.value.trim(), to: name.value.trim(), address: address.value.trim(), units: 0 });
            name.value = ''; address.value = '';
            drawStops();
          } }, icon('plus', 16), t('tmAddStop')))),
      h('div', { class: 'wh-bar' }, h('button', { onclick: () => go('trips') }, t('tmCancel')),
        h('button', { class: 'primary grow', 'data-act': 'trip-save', onclick: save }, icon('check', 18), t('tmNewTrip'))));
    drawStops();
  }).catch((err) => mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`)));
  return null;
}

function open(main, id) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  mount(main, head(t('tmTrips')), box);
  getDoc(doc(db, ws(`tmsTrips/${id}`))).then((snap) => {
    if (!snap.exists()) { mount(box, h('p', { class: 'muted' }, t('notFound'))); return; }
    trip(box, { ...snap.data(), id: snap.id });
  }).catch((err) => mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`)));
  return null;
}

function trip(box, x) {
  const ref = doc(db, ws(`tmsTrips/${x.id}`));
  let geo = new Map();
  loadPlacesGeo().then((g) => { geo = g; draw(); }).catch(() => {});
  // Where to drive for a stop: a branch where it is on the map, else the address.
  const destOf = (s) => (s.kind === 'TRANSFER' ? geo.get(s.to || '') || placeName(s.to) : s.address || s.to);
  const navButtons = (s, big = false) => {
    const l = navLinks(destOf(s));
    return h('span', { class: `tm-nav${big ? ' big' : ''}` },
      h('a', { class: 'btn', href: l.waze, target: '_blank', rel: 'noopener', 'data-act': 'nav-waze' }, 'Waze'),
      h('a', { class: 'btn', href: l.google, target: '_blank', rel: 'noopener', 'data-act': 'nav-google' }, 'Google Maps'));
  };
  // Every minute, or after 150 m, the position goes to the trip; only while this trip is open on the road.
  const shareGps = () => {
    stopGps();
    if (!navigator.geolocation) return toast(t('tmGpsDenied'), 'error');
    let lastAt = 0;
    let lastAtPos = null;
    const watch = navigator.geolocation.watchPosition((pos) => {
      const here = [pos.coords.latitude, pos.coords.longitude];
      if (Date.now() - lastAt < 60_000 && lastAtPos && metres(lastAtPos, here) < 150) return;
      lastAt = Date.now();
      lastAtPos = here;
      const lastPos = { lat: here[0], lng: here[1], acc: Math.round(pos.coords.accuracy || 0), at: Date.now(), byName: session.name };
      x.lastPos = lastPos;
      const batch = writeBatch(db);
      batch.update(ref, { lastPos, updatedAt: Date.now() });
      send(batch);
    }, () => { toast(t('tmGpsDenied'), 'error'); stopGps(); draw(); }, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 });
    const leave = () => { if (!location.hash.endsWith(x.id)) stopGps(); };
    gps = { watch, trip: x.id, leave };
    window.addEventListener('hashchange', leave);
    draw();
  };
  const write = (patch, auditInfo) => {
    const was = x.status;
    Object.assign(x, patch);
    const batch = writeBatch(db);
    batch.update(ref, { ...patch, updatedAt: Date.now() });
    if (auditInfo) audit(batch, 'Trip', x.id, x.tripNo, 'STATUS_CHANGE', { field: 'status', oldValue: was, ...auditInfo });
    send(batch);
    draw();
  };
  const move = (status) => async () => {
    if (status === 'CANCELLED' && !await confirmBox(t('tmCancelQ'), t('tmCancelTrip'), t('tmCancel'))) return;
    if (status === 'ON_ROAD' && !await confirmBox(t('tmGoQ').replace('{n}', (x.stops || []).length), t('tmGo'), t('tmCancel'), { tone: 'primary' })) return;
    const now = Date.now();
    if (status === 'DONE' || status === 'CANCELLED') stopGps();
    write({ status, ...(status === 'LOADING' ? { loadingAt: now } : {}), ...(status === 'ON_ROAD' ? { departedAt: now } : {}), ...(status === 'DONE' ? { doneAt: now } : {}),
      ...(status === 'CANCELLED' ? { cancelledAt: now, cancelledByName: session.name } : {}) }, { newValue: status });
    toast(t(`trip_${status}`), 'ok');
  };

  // Delivered: who took it, their signature, a note.
  const deliver = (s) => modal((close) => {
    let ink = '';
    const who = h('input', { 'data-f': 'receiver', placeholder: t('tmReceivedBy') });
    const note = h('input', { placeholder: t('tmNote') });
    const pad = signaturePad('', { onChange: (v) => { ink = v; } });
    return [
      h('h2', {}, `${t('tmDeliver')} · ${s.ref}`),
      h('p', { class: 'muted' }, `${stopKind(s)} → ${stopTo(s)}`),
      h('label', { class: 'field' }, t('tmReceivedBy'), who),
      h('div', { class: 'field' }, t('tmSignHere'), pad),
      note,
      h('p', { class: 'muted', style: { fontSize: '13px' } }, s.kind === 'TRANSFER' ? t('tmReceiveAtBranch') : s.kind === 'RESERVATION' ? t('tmHandOver') : ''),
      h('div', { class: 'actions' }, h('button', { onclick: close }, t('tmCancel')),
        h('button', { class: 'primary', 'data-act': 'pod-save', onclick: () => {
          if (!who.value.trim()) return toast(t('tmNeedReceiver'), 'error');
          if (!isSigned(ink)) return toast(t('tmNeedSign'), 'error');
          Object.assign(s, { status: 'DELIVERED', receivedBy: who.value.trim(), signature: ink, note: note.value.trim(), deliveredAt: Date.now(), deliveredByName: session.name });
          const batch = writeBatch(db);
          batch.update(ref, { stops: x.stops, updatedAt: Date.now() });
          audit(batch, 'Trip', x.id, x.tripNo, 'UPDATE', { field: s.ref, newValue: `DELIVERED to ${s.receivedBy}` });
          send(batch, t('tmDelivered'));
          close();
          draw();
        } }, icon('check', 17), t('tmDeliver'))),
    ];
  });
  const fail = (s) => modal((close) => {
    const why = h('input', { 'data-f': 'reason', placeholder: t('tmReason') });
    return [h('h2', {}, `${t('tmFail')} · ${s.ref}`), h('label', { class: 'field' }, t('tmReason'), why),
      h('div', { class: 'actions' }, h('button', { onclick: close }, t('tmCancel')), h('button', { class: 'danger', 'data-act': 'fail-save', onclick: () => {
        if (!why.value.trim()) return toast(t('tmReason'), 'error');
        Object.assign(s, { status: 'FAILED', note: why.value.trim(), failedAt: Date.now(), deliveredByName: session.name });
        const batch = writeBatch(db);
        batch.update(ref, { stops: x.stops, updatedAt: Date.now() });
        audit(batch, 'Trip', x.id, x.tripNo, 'UPDATE', { field: s.ref, newValue: `FAILED: ${s.note}` });
        send(batch, t('tmFailedSaved'));
        close();
        draw();
      } }, t('tmFail')))];
  });

  const draw = () => {
    const p = tripProgress(x);
    const next = nextStop(x);
    const can = canWork();
    const moves = can ? nextStatuses(x) : [];
    const label = { LOADING: 'tmLoad', ON_ROAD: 'tmGo', DONE: 'tmFinish', CANCELLED: 'tmCancelTrip', PLANNED: 'tmBackToPlan' };
    const stopRow = (s, i) => h('div', { class: `wh-line tm-stop${s.status === 'DELIVERED' ? ' full' : ''}${s.status === 'FAILED' ? ' short' : ''}${next === s && x.status === 'ON_ROAD' ? ' next' : ''}`, 'data-stop': s.ref },
      h('div', { class: 'n' }, h('span', { class: 'tm-no' }, String(i + 1)), h('strong', {}, stopTo(s)), pill(t(`stop_${s.status || 'PENDING'}`), STOP_TONE[s.status || 'PENDING'])),
      h('div', { class: 'muted' }, [s.ref, stopKind(s), s.units ? `${formatQty(s.units)} ${t('tmUnits')}` : '', s.address].filter(Boolean).join(' · '),
        s.status === 'DELIVERED' ? h('div', { class: 'tm-pod' }, `${t('tmReceivedBy')}: ${s.receivedBy} · ${dateTime(s.deliveredAt)}`, s.signature ? inkPicture(s.signature) : null) : null,
        s.status === 'FAILED' ? h('div', {}, `${t('tmReason')}: ${s.note || ''}`) : null),
      h('div', { class: 'wh-step' },
        can && x.status === 'PLANNED' ? [
          h('button', { type: 'button', disabled: i === 0, 'aria-label': '↑', onclick: () => { [x.stops[i - 1], x.stops[i]] = [x.stops[i], x.stops[i - 1]]; write({ stops: x.stops }); } }, '↑'),
          h('button', { type: 'button', disabled: i === x.stops.length - 1, 'aria-label': '↓', onclick: () => { [x.stops[i + 1], x.stops[i]] = [x.stops[i], x.stops[i + 1]]; write({ stops: x.stops }); } }, '↓')] : null,
        can && x.status === 'ON_ROAD' && (s.status || 'PENDING') === 'PENDING' ? [
          h('button', { type: 'button', class: 'ghost', 'data-act': 'stop-fail', style: { width: 'auto', padding: '0 10px' }, onclick: () => fail(s) }, t('tmFail')),
          h('button', { type: 'button', class: 'primary', 'data-act': 'stop-deliver', style: { width: 'auto', padding: '0 14px' }, onclick: () => deliver(s) }, icon('check', 17), t('tmDeliver'))] : null,
        x.status === 'ON_ROAD' && (s.status || 'PENDING') === 'PENDING' ? navButtons(s) : null));
    mount(box,
      h('div', { class: 'card wh-head' },
        h('div', { class: 'row' }, h('strong', { class: 'grow', style: { fontSize: '18px' } }, x.tripNo), pill(t(`trip_${x.status}`), TRIP_TONE[x.status])),
        h('div', { class: 'tm-who' }, h('span', { class: 'pill shelf' }, `🚚 ${x.plate}`), h('span', {}, `👤 ${x.driverName}`), h('span', { class: 'muted' }, `${placeName(x.branchId)} · ${x.date || ''}`),
          x.dock && ['PLANNED', 'LOADING'].includes(x.status) ? h('span', { class: 'pill warn', 'data-dock': x.dock }, `${t('tmAtDock')} ${x.dock}`) : null),
        h('div', { class: 'pk-bar big' }, h('span', { style: { width: `${p.total ? Math.round(100 * (p.delivered + p.failed) / p.total) : 0}%` } })),
        h('div', { class: 'muted' }, `${p.delivered}/${p.total} ${t('stop_DELIVERED')}${p.failed ? ` · ${p.failed} ${t('stop_FAILED')}` : ''}`,
          x.departedAt ? ` · ${t('tmGo')} ${dateTime(x.departedAt)}` : '', x.doneAt ? ` · ${t('trip_DONE')} ${dateTime(x.doneAt)}` : '')),
      x.status === 'ON_ROAD' && next ? h('div', { class: 'card pk-next', 'data-next': next.ref },
        h('div', { class: 'pk-next-label' }, t('tmNextStop')), h('div', { class: 'pk-bin' }, stopTo(next)),
        h('div', { class: 'pk-next-name' }, [next.ref, next.address].filter(Boolean).join(' · ')),
        h('div', { class: 'row' }, h('b', {}, `${t('tmNav')}:`), navButtons(next, true))) : null,
      x.status === 'ON_ROAD' && canWork() ? h('div', { class: 'card row tm-gps' },
        h('span', { class: 'grow' }, gps?.trip === x.id ? `📍 ${t('tmGpsOn')}` : t('tmGpsOn')),
        gps?.trip === x.id
          ? h('button', { 'data-act': 'gps-stop', onclick: () => { stopGps(); draw(); } }, t('tmStopGps'))
          : h('button', { class: 'primary', 'data-act': 'gps-share', onclick: shareGps }, t('tmShareGps'))) : null,
      x.status === 'ON_ROAD' && p.finished ? h('div', { class: 'card pk-next all' }, icon('check', 30), h('strong', {}, t('tmAllStopsDone'))) : null,
      h('div', { class: 'wh-lines' }, (x.stops || []).map(stopRow)),
      h('div', { class: 'wh-bar' },
        h('button', { onclick: () => go('trips') }, t('tmBack')),
        moves.filter((m) => m === 'CANCELLED' || m === 'PLANNED').map((m) => h('button', { class: m === 'CANCELLED' ? 'danger' : '', 'data-act': `trip-${m}`, onclick: move(m) }, t(label[m]))),
        moves.filter((m) => !['CANCELLED', 'PLANNED'].includes(m)).map((m) => h('button', { class: 'primary grow', 'data-act': `trip-${m}`, onclick: move(m) }, icon(m === 'DONE' ? 'check' : 'truck', 18), t(label[m])))));
  };
  draw();
}
