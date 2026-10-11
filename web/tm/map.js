/**
 * The fleet in 3D (车队 3D): the company's places and the customers being
 * delivered to as a little town (web/js/town.js), and every lorry on a
 * trip on the road between its depot and its next stop -- blue on the
 * road, amber still loading. Tap a lorry for its trip.
 */
import { h, mount } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { isoScene } from '../js/iso.js';
import { cityLayout } from '../js/town.js';
import { nextStop, TRIP_LIVE, tripProgress } from '../js/tms.js';
import { head, loadFleet, myPlaces, pill, placeName, stopTo, TRIP_TONE } from './common.js';
import { go } from './main.js';

export function render(main) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  mount(main, head(t('tmMap')), h('p', { class: 'muted' }, t('tmMapLead')), box);
  loadFleet().then(({ trips }) => {
    const live = trips.filter((x) => ['LOADING', 'ON_ROAD'].includes(x.status));
    const places = myPlaces().map((p) => ({ ...p }));
    // Customers being delivered to today, as houses.
    const homes = new Map();
    for (const x of trips.filter((y) => TRIP_LIVE.includes(y.status))) {
      for (const s of x.stops || []) if (s.kind !== 'TRANSFER' && s.to && !homes.has(`c:${s.to}`)) homes.set(`c:${s.to}`, { id: `c:${s.to}`, name: s.to, kind: 'HOME' });
    }
    const all = [...places, ...homes.values()];
    const dest = (s) => (s ? (s.kind === 'TRANSFER' ? s.to || '' : `c:${s.to}`) : null);
    const moving = live.map((x) => {
      const s = nextStop(x) || (x.stops || [])[0];
      return { from: x.branchId || '', to: dest(s) ?? (x.branchId || ''), ref: x.plate || x.tripNo, label: x.plate, color: x.status === 'LOADING' ? '#f59e0b' : '#2f6fde', trip: x };
    });
    const { boxes, W, D } = cityLayout(all, moving);
    const info = h('div', { class: 'city-info' }, h('span', { class: 'muted' }, t('tmMapTap')));
    const scene = isoScene({
      boxes, W, D, height: 680,
      onPick: (b) => {
        scene.select(b.id);
        const x = b.moving?.trip;
        if (x) {
          const p = tripProgress(x);
          const s = nextStop(x);
          mount(info, h('div', { class: 'row' }, h('b', { class: 'grow' }, `🚚 ${x.plate} · ${x.driverName}`), pill(t(`trip_${x.status}`), TRIP_TONE[x.status])),
            h('div', { class: 'muted' }, `${x.tripNo} · ${p.delivered + p.failed}/${p.total} ${t('tmStops')}${s ? ` · ${t('tmNextStop')}: ${stopTo(s)}` : ''}`),
            h('button', { class: 'primary', 'data-act': 'map-open-trip', onclick: () => go('trips', x.id) }, t('tmTrips')));
        } else if (b.place) {
          mount(info, h('b', {}, b.place.kind === 'HOME' ? `${t('tmCustomer')} · ${b.place.name}` : placeName(b.place.id)));
        }
      },
    });
    mount(box,
      h('div', { class: 'cards map-kpis' },
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('tmOnRoad')), h('div', { class: 'value' }, String(live.filter((x) => x.status === 'ON_ROAD').length))),
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('trip_LOADING')), h('div', { class: 'value' }, String(live.filter((x) => x.status === 'LOADING').length)))),
      h('div', { class: 'card city-card', 'data-card': 'fleet3d' }, scene.el,
        h('div', { class: 'map-legend' },
          h('span', {}, h('i', { style: { background: '#2f6fde' } }), t('trip_ON_ROAD')),
          h('span', {}, h('i', { style: { background: '#f59e0b' } }), t('trip_LOADING')),
          h('span', {}, h('i', { style: { background: '#4f7cac' } }), t('city3dWarehouse')),
          h('span', {}, h('i', { style: { background: '#d9a25f' } }), t('tmCustomer'))),
        info));
  }).catch((err) => mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`)));
  return null;
}
