/**
 * The street map (地图): the company's places, today's stops -- a branch
 * where its pin was put, a customer where their address is -- the route of
 * each trip in order, and every lorry where its driver's phone last said
 * (trips.js shares it while on the road). Tap for the trip and a Waze or
 * Google Maps link to drive there. A manager puts each place on the map
 * once: choose it, tap where it stands.
 */
import { db, doc, setDoc } from '../js/fb.js';
import { dateTime, h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { mapView, navLinks } from '../js/slippy.js';
import { geocode } from '../js/geocode.js';
import { nextStop, TRIP_LIVE, tripProgress } from '../js/tms.js';
import { session, ws } from '../js/session.js';
import { canManage, head, loadFleet, loadPlacesGeo, myPlaces, pill, placeName, STOP_TONE, stopTo, TRIP_TONE } from './common.js';
import { go } from './main.js';

const STOP_COLOR = { PENDING: '#f59e0b', DELIVERED: '#22a06b', FAILED: '#e5484d' };
const TRIP_COLORS = ['#2f6fde', '#8b5cf6', '#0d9488', '#db2777', '#ea580c', '#0891b2'];

export function render(main) {
  const info = h('div', { class: 'card map-info' }, h('p', { class: 'muted', style: { margin: 0 } }, t('tmRoadLead')));
  const map = mapView({ height: Math.max(380, Math.min(680, Math.round((window.innerHeight || 800) * 0.62))) });
  const placeSel = h('select', { 'data-act': 'rm-place' }, h('option', { value: '' }, t('tmChoosePlace')), myPlaces().map((p) => h('option', { value: p.id || '-' }, p.name)));
  const search = h('input', { type: 'search', placeholder: t('tmSearchAddr'), 'data-act': 'rm-search' });
  const tools = h('div', { class: 'card rm-tools' },
    h('form', { class: 'row', onsubmit: async (e) => {
      e.preventDefault();
      const hit = await geocode(search.value);
      if (hit) map.zoomTo(hit, 16); else toast(t('tmAddrNotFound'), 'error');
    } }, search, h('button', { type: 'submit' }, t('tmSearch'))),
    canManage() ? h('div', { class: 'field' }, t('tmSetPlace'), placeSel, h('small', { class: 'muted' }, t('tmSetPlaceHelp'))) : null);
  const missing = h('div');
  mount(main, head(t('tmRoadMap')), h('div', { class: 'map-stage rm-stage' }, map.el), info, tools, missing);

  let geo = new Map();
  let trips = [];
  // A tap on the map puts the chosen place there.
  map.onClick(async ([lat, lng]) => {
    if (!placeSel.value || !canManage()) return;
    const id = placeSel.value;
    try {
      await setDoc(doc(db, ws(`tmsPlaces/${id}`)), { lat, lng, name: placeName(id === '-' ? '' : id), updatedAt: Date.now(), updatedBy: session.uid });
      geo.set(id === '-' ? '' : id, [lat, lng]);
      placeSel.value = '';
      toast(t('tmPlaceSaved'), 'ok');
      draw();
    } catch (err) { toast(err.message || String(err), 'error'); }
  });

  const show = (html) => mount(info, html);
  const tripInfo = (x) => {
    const p = tripProgress(x);
    const s = nextStop(x);
    const ago = x.lastPos?.at ? Math.round((Date.now() - x.lastPos.at) / 60000) : null;
    show([
      h('div', { class: 'row' }, h('b', { class: 'grow' }, `🚚 ${x.plate} · ${x.driverName}`), pill(t(`trip_${x.status}`), TRIP_TONE[x.status])),
      h('div', { class: 'muted' }, `${x.tripNo} · ${p.delivered + p.failed}/${p.total} ${t('tmStops')}${s ? ` · ${t('tmNextStop')}: ${stopTo(s)}` : ''}`),
      ago != null ? h('div', { class: 'muted' }, `${t('tmLastSeen')}: ${ago < 1 ? dateTime(x.lastPos.at) : t('tmMinsAgo').replace('{n}', ago)}`) : null,
      h('button', { class: 'primary', 'data-act': 'rm-open-trip', onclick: () => go('trips', x.id) }, t('tmTrips')),
    ]);
  };
  const stopInfo = (x, s, at) => {
    const links = navLinks(at || s.address || s.to);
    show([
      h('div', { class: 'row' }, h('b', { class: 'grow' }, stopTo(s)), pill(t(`stop_${s.status || 'PENDING'}`), STOP_TONE[s.status || 'PENDING'])),
      h('div', { class: 'muted' }, [s.ref, s.address, `${x.tripNo} · 🚚 ${x.plate}`].filter(Boolean).join(' · ')),
      h('div', { class: 'row' },
        h('a', { class: 'btn', href: links.waze, target: '_blank', rel: 'noopener', 'data-act': 'nav-waze' }, 'Waze'),
        h('a', { class: 'btn', href: links.google, target: '_blank', rel: 'noopener', 'data-act': 'nav-google' }, 'Google Maps'),
        h('button', { class: 'ghost', onclick: () => go('trips', x.id) }, t('tmTrips'))),
    ]);
  };

  // Customers' addresses, found one by one (geocode.js keeps each answer).
  const found = new Map();
  const want = async (q) => {
    if (!q || found.has(q)) return;
    found.set(q, null);
    const hit = await geocode(q);
    if (hit) { found.set(q, hit); draw(); }
  };
  const whereStop = (s) => (s.kind === 'TRANSFER' ? geo.get(s.to || '') : found.get(s.address || s.to) || null);

  const draw = () => {
    const live = trips.filter((x) => TRIP_LIVE.includes(x.status));
    const marks = [];
    const lines = [];
    for (const p of myPlaces()) {
      const at = geo.get(p.id);
      if (at) marks.push({ id: `place-${p.id || '-'}`, lat: at[0], lng: at[1], kind: 'place', icon: p.kind === 'WAREHOUSE' ? '🏭' : '🏪', label: p.name, color: p.kind === 'WAREHOUSE' ? '#4f7cac' : '#14a37f', onClick: () => show(h('b', {}, p.name)) });
    }
    live.forEach((x, i) => {
      const color = TRIP_COLORS[i % TRIP_COLORS.length];
      const route = [geo.get(x.branchId || '')].filter(Boolean);
      (x.stops || []).forEach((s, k) => {
        if (s.kind !== 'TRANSFER') want(s.address || s.to);
        const at = whereStop(s);
        if (!at) return;
        route.push(at);
        marks.push({ id: `stop-${x.id}-${k}`, lat: at[0], lng: at[1], kind: 'stop', icon: String(k + 1), label: stopTo(s), color: STOP_COLOR[s.status || 'PENDING'], onClick: () => stopInfo(x, s, at) });
      });
      if (route.length > 1) lines.push({ points: route, color, dashed: x.status !== 'ON_ROAD' });
      if (Number.isFinite(x.lastPos?.lat)) {
        const stale = Date.now() - (x.lastPos.at || 0) > 15 * 60_000;
        marks.push({ id: `lorry-${x.id}`, lat: x.lastPos.lat, lng: x.lastPos.lng, kind: 'lorry', icon: '🚚', label: x.plate, color, cls: stale ? 'stale' : '', onClick: () => tripInfo(x) });
      }
    });
    map.setMarkers(marks);
    map.setLines(lines);
    const unplaced = myPlaces().filter((p) => !geo.has(p.id));
    mount(missing, unplaced.length && canManage() ? h('p', { class: 'muted', 'data-card': 'unplaced' }, `${t('tmSetPlace')}: ${unplaced.map((p) => `${p.name} (${t('tmNoPos')})`).join(', ')}`) : null);
  };

  const load = () => Promise.all([loadFleet(), loadPlacesGeo()]).then(([fleet, g]) => { trips = fleet.trips; geo = g; draw(); })
    .catch((err) => show(h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`)));
  load();
  // The lorries move: look again every half minute while the map is open.
  const timer = setInterval(load, 30_000);
  return () => clearInterval(timer);
}
