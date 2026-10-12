/**
 * Loading docks (装车码头): the bays lorries back into to load.
 *
 *   OUT-1..4   each with the trip called to it, its orders, and a tick for
 *              each order put on the lorry; when all are on, it leaves
 *   the yard   trips planned in the TMS and not yet at a bay, first come
 *              first called in
 *   the lanes  packed orders waiting on the floor, S1..S6
 *
 * Calling a lorry in writes the dock on its TMS trip; loading writes the
 * order's packing record (outbound/<key>) and starts the trip loading;
 * letting it go puts the trip on the road. The trip page in the TMS shows
 * the same, so the driver and the dock see one story.
 */
import { db, doc, writeBatch } from '../js/fb.js';
import { confirmBox, h, mount } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { allLoaded, dockBoard, LANES, laneBoard, loadedOn, outboundOrders } from '../js/outbound.js';
import { audit, canMove, failed, head, loading, pill } from './common.js';
import { loadOutbound } from './data.js';
import { go } from './main.js';
import { orderTo, pickScope, placeSelect, savePack, STAGE_TONE } from './outbound.js';

export function render(main) {
  if (!canMove()) { mount(main, head(t('whDocks')), h('p', { class: 'muted' }, t('noStockPermission'))); return null; }
  const scope = pickScope();
  const box = h('div');
  mount(main,
    head(t('whDocks'), placeSelect(() => render(main)),
      h('button', { 'data-act': 'go-outbound', onclick: () => go('outbound') }, icon('box', 17), h('span', { class: 'hide-sm' }, t('whOutbound')))),
    h('p', { class: 'muted' }, t('whDocksHelp')),
    box);
  loading(box);
  loadOutbound().then((data) => {
    const orders = outboundOrders(data, scope);
    const tripsHere = data.trips;
    const draw = () => {
      const board = dockBoard(tripsHere, orders, scope);
      const lanes = laneBoard(orders);
      mount(box,
        h('div', { class: 'ob-docks' }, board.docks.map((d) => dockCard(d, board, draw))),
        h('section', { class: 'card', 'data-card': 'yard' },
          h('h2', {}, `🅿️ ${t('whYard')} (${board.yard.length})`),
          board.yard.length ? h('div', { class: 'wh-list' }, board.yard.map((y) => yardRow(y, board.free, draw)))
            : h('p', { class: 'muted', style: { margin: 0 } }, t('whYardEmpty'))),
        h('section', { class: 'card', 'data-card': 'lanes' },
          h('h2', {}, t('whLanes')),
          h('div', { class: 'ob-lanes wide' }, LANES.map((l) => {
            const here = lanes.get(l);
            return h('div', { class: `ob-lane${here.length ? ' full' : ''}`, 'data-lane': l },
              h('b', {}, l),
              here.length ? here.map((o) => h('button', { class: 'ob-chip', 'data-ob': o.ref, onclick: () => go('outbound', o.key) },
                `${o.urgent ? '⚡ ' : ''}${o.ref} · 📦${o.pack?.cartons || 0}${o.trip ? ` · 🚚${o.trip.plate || ''}` : ''}`))
                : h('small', { class: 'muted' }, t('whLaneFree')));
          }))));
    };
    draw();
  }).catch((err) => failed(box, err));
  return null;
}

/** Calls a lorry from the yard to [dock]. */
function callIn(trip, dock, draw) {
  const batch = writeBatch(db);
  batch.update(doc(db, ws(`tmsTrips/${trip.id}`)), { dock, updatedAt: Date.now() });
  audit(batch, 'Trip', trip.id, trip.tripNo || '', 'UPDATE', { field: 'dock', oldValue: trip.dock || '', newValue: dock });
  batch.commit().catch(() => {});
  trip.dock = dock;
  draw();
}

/** One lorry waiting in the yard, and the free bays it can be called to. */
function yardRow({ trip, orders }, free, draw) {
  const packed = orders.filter((o) => ['PACKED', 'LOADED'].includes(o.stage)).length;
  return h('div', { class: 'wh-row ob-yard', 'data-yard': trip.plate || trip.id },
    h('span', { class: 'grow' }, h('b', {}, `🚚 ${trip.plate || '—'}`), ` · ${trip.driverName || ''}`,
      h('div', { class: 'muted' }, `${trip.tripNo || ''} · ${packed}/${orders.length} ${t('whPackedN')}`)),
    free.length ? free.map((d) => h('button', { class: 'ghost', 'data-act': 'call-in', 'data-dock': d, onclick: () => callIn(trip, d, draw) }, `→ ${d}`))
      : h('small', { class: 'muted' }, t('whDocksFull')));
}

/** One loading bay. */
function dockCard(d, board, draw) {
  if (!d.trip) {
    const first = board.yard[0];
    return h('section', { class: 'card ob-dock empty', 'data-dock': d.dock },
      h('div', { class: 'ob-dock-name' }, d.dock), h('div', { class: 'muted' }, t('whDockFree')),
      first ? h('button', { class: 'primary', 'data-act': 'call-first', onclick: () => callIn(first.trip, d.dock, draw) }, `${t('whCallIn')} 🚚 ${first.trip.plate || ''}`) : null);
  }
  const { trip, orders } = d;
  const done = allLoaded(trip, orders);
  const loadOne = (o) => {
    const batch = savePack(o, { status: 'LOADED', tripId: trip.id, dock: d.dock, loadedAt: Date.now(), loadedByName: session.name }, 'LOADED', `${trip.plate || ''} @ ${d.dock}`);
    if (trip.status === 'PLANNED') {
      batch.update(doc(db, ws(`tmsTrips/${trip.id}`)), { status: 'LOADING', loadingAt: Date.now(), updatedAt: Date.now() });
      audit(batch, 'Trip', trip.id, trip.tripNo || '', 'STATUS_CHANGE', { field: 'status', oldValue: 'PLANNED', newValue: 'LOADING' });
      trip.status = 'LOADING';
    }
    batch.commit().catch(() => {});
    o.stage = 'LOADED';
    draw();
  };
  const leave = async () => {
    if (!await confirmBox(t('whLetGoQ').replace('{p}', trip.plate || ''), t('whLetGo'), t('cancel'), { tone: 'primary' })) return;
    const now = Date.now();
    const batch = writeBatch(db);
    batch.update(doc(db, ws(`tmsTrips/${trip.id}`)), { status: 'ON_ROAD', departedAt: now, updatedAt: now });
    audit(batch, 'Trip', trip.id, trip.tripNo || '', 'STATUS_CHANGE', { field: 'status', oldValue: trip.status, newValue: `ON_ROAD (${d.dock})` });
    batch.commit().catch(() => {});
    trip.status = 'ON_ROAD';
    orders.forEach((o) => { o.stage = 'ON_ROAD'; });
    draw();
  };
  const sendBack = () => {
    const batch = writeBatch(db);
    batch.update(doc(db, ws(`tmsTrips/${trip.id}`)), { dock: '', updatedAt: Date.now() });
    audit(batch, 'Trip', trip.id, trip.tripNo || '', 'UPDATE', { field: 'dock', oldValue: d.dock, newValue: '' });
    batch.commit().catch(() => {});
    trip.dock = '';
    draw();
  };
  const loaded = orders.filter((o) => loadedOn(o.pack, trip)).length;
  return h('section', { class: `card ob-dock${done ? ' ready' : ''}`, 'data-dock': d.dock },
    h('div', { class: 'row' }, h('div', { class: 'ob-dock-name grow' }, d.dock), pill(t(`whTrip_${trip.status}`), trip.status === 'LOADING' ? 'warn' : '')),
    h('div', { class: 'ob-big' }, `🚚 ${trip.plate || '—'}`),
    h('div', { class: 'muted' }, `${trip.driverName || ''} · ${trip.tripNo || ''}`),
    h('div', { class: 'pk-bar' }, h('span', { style: { width: `${orders.length ? Math.round(100 * loaded / orders.length) : 0}%` } })),
    h('div', { class: 'ob-load' }, orders.map((o) => {
      const on = loadedOn(o.pack, trip);
      const ready = o.stage === 'PACKED' || on;
      return h('div', { class: `ob-load-row${on ? ' on' : ''}`, 'data-load': o.ref },
        h('span', { class: 'grow' }, h('b', {}, `${o.urgent ? '⚡ ' : ''}${o.ref}`), h('span', { class: 'muted' }, ` ${orderTo(o)}`),
          h('div', { class: 'muted', style: { fontSize: '13px' } }, o.pack?.cartons ? `📦 ${o.pack.cartons} · ${o.pack.lane || ''}` : '')),
        on ? pill('✓', 'good')
          : ready ? h('button', { class: 'primary', 'data-act': 'load', onclick: () => loadOne(o) }, t('whLoadIt'))
            : pill(t(`ob_${o.stage}`), STAGE_TONE[o.stage]));
    })),
    h('div', { class: 'row' },
      trip.status === 'PLANNED' ? h('button', { class: 'ghost', 'data-act': 'send-back', onclick: sendBack }, t('whBackToYard')) : null,
      h('span', { class: 'grow' }),
      h('button', { class: done ? 'primary' : '', 'data-act': 'let-go', disabled: !done, onclick: leave }, icon('truck', 18), t('whLetGo'))));
}
