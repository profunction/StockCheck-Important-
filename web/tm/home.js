/**
 * The first screen: today's trips with how far each has got, lorries on the
 * road, drivers at work, what is waiting for a lorry, and papers (road tax,
 * insurance, licences) running out.
 */
import { h, mount } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { onDuty, papersDue, stopsToPlan, TRIP_LIVE } from '../js/tms.js';
import { canWork, head, loadFleet, loadOrders, myPlaces, pill } from './common.js';
import { tripCard } from './trips.js';
import { go } from './main.js';

const LORRY_PAPERS = ['roadTaxExpiry', 'insuranceExpiry', 'inspectionExpiry'];
const PAPER_LABEL = { roadTaxExpiry: 'tmRoadTax', insuranceExpiry: 'tmInsurance', inspectionExpiry: 'tmInspection', licenceExpiry: 'tmLicenceExpiry' };

/** "Road tax: 9 days" / "Insurance: 3 days ago" pills. */
export function paperPills(due) {
  return due.map((d) => pill(t(d.days < 0 ? 'tmPaperPast' : 'tmPaperDays').replace('{p}', t(PAPER_LABEL[d.key])).replace('{n}', Math.abs(d.days)), d.days < 7 ? 'bad' : 'warn'));
}
export { LORRY_PAPERS };

export function render(main) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  mount(main, head(t('tmHome')), box);
  Promise.all([loadFleet(), loadOrders()]).then(([fleet, orders]) => {
    const live = fleet.trips.filter((x) => TRIP_LIVE.includes(x.status));
    const road = live.filter((x) => x.status === 'ON_ROAD');
    const duty = onDuty(fleet.shifts);
    const waiting = myPlaces().flatMap((p) => stopsToPlan({ ...orders, trips: fleet.trips }, p.id));
    const papers = [
      ...fleet.lorries.filter((l) => l.active !== false).map((l) => ({ who: l.plate, due: papersDue(l, LORRY_PAPERS) })),
      ...fleet.drivers.filter((d) => d.active !== false).map((d) => ({ who: d.name, due: papersDue(d, ['licenceExpiry']) })),
    ].filter((x) => x.due.length);
    const stat = (label, value, tone = '', to = '') => h(to ? 'a' : 'div', { class: `card stat${tone ? ` ${tone}` : ''}`, ...(to ? { href: to } : {}) }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value));
    const tile = (ic, label, sub, to, tone = '') => h('button', { class: `wh-tile${tone ? ` ${tone}` : ''}`, onclick: () => go(...to) },
      h('span', { class: 'ic-wrap' }, icon(ic, 24)), h('span', { class: 't' }, label), h('span', { class: 's' }, sub));
    mount(box,
      h('div', { class: 'cards' },
        stat(t('tmTripsLive'), String(live.length), '', '#/trips'),
        stat(t('tmOnRoad'), String(road.length), road.length ? 'good' : '', '#/map'),
        stat(t('tmOnDuty'), `${duty.drivers.size}/${fleet.drivers.filter((d) => d.active !== false).length}`, '', '#/drivers'),
        stat(t('tmToPlan'), String(waiting.length), waiting.length ? 'warn' : '', '#/trips/new'),
        stat(t('tmPapers'), String(papers.length), papers.length ? 'bad' : '', '#/lorries')),
      canWork() ? h('div', { class: 'wh-tiles' },
        tile('truck', t('tmNewTrip'), waiting.length ? `${waiting.length} ${t('tmToPlan')}` : t('tmNewTripSub'), ['trips', 'new'], waiting.length ? 'hot' : ''),
        tile('clock', t('tmClock'), t('tmClockSub'), ['drivers']),
        tile('receipt', t('tmPod'), t('tmPodLead'), ['pod']),
        tile('grid', t('tmMap'), t('tmMapLead'), ['map'])) : null,
      h('section', { class: 'card' }, h('h2', {}, t('tmTripsLive')),
        live.length ? h('div', { class: 'wh-list' }, live.map((x) => tripCard(x))) : h('p', { class: 'muted', style: { margin: 0 } }, t('tmNoTrips'))),
      papers.length ? h('section', { class: 'card', style: { marginTop: '16px' }, 'data-card': 'papers' }, h('h2', {}, t('tmPapers')),
        papers.map((x) => h('div', { class: 'wh-row' }, h('b', { class: 'grow' }, x.who), h('span', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, paperPills(x.due))))) : null);
  }).catch((err) => mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`)));
  return null;
}
