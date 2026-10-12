/**
 * Outbound (出货单): every order leaving the warehouse on one board, and
 * packing it.
 *
 *   #/outbound          the stages across the top with how many stand at
 *                       each (tap one to see only those); the orders, urgent
 *                       first, then first in first out
 *   #/outbound/<key>    one order: where it is on the line, and the next
 *                       thing to do -- pick it, pack it (cartons, weight,
 *                       which staging lane it waits in), load it, follow it
 *
 * The stage is read off what each step records (web/js/outbound.js); this
 * page writes only the packing record (`outbound/<key>`). Loading happens at
 * the docks (docks.js), the road in the TMS.
 */
import { db, doc, writeBatch } from '../js/fb.js';
import { dateTime, h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { LANES, laneBoard, outboundOrders, packKey, STAGES, stageCounts } from '../js/outbound.js';
import { audit, canMove, failed, head, loading, myPlaces, pill, placeName, qtyText, send } from './common.js';
import { loadOutbound } from './data.js';
import { go } from './main.js';

export const STAGE_TONE = { CREATED: '', PICKING: 'warn', PACKING: 'warn', PACKED: 'shelf', LOADED: 'shelf', ON_ROAD: 'good', DELIVERED: 'good' };
let scope = null;
let only = '';

export const orderTo = (o) => (o.kind === 'TRANSFER' ? `→ ${placeName(o.to)}` : `👤 ${o.to || '—'}`);

/** The place this page looks at: remembered, else this account's, else the first. */
export function pickScope() {
  const places = myPlaces();
  if (scope == null || !places.some((p) => p.id === scope)) scope = places.some((p) => p.id === session.branchId) ? session.branchId : (places[0]?.id ?? '');
  return scope;
}
export function placeSelect(onChange) {
  const places = myPlaces();
  return places.length > 1 ? h('select', { style: { width: 'auto' }, 'data-act': 'ob-place', onchange: (e) => { scope = e.target.value; onChange(); } },
    places.map((p) => h('option', { value: p.id, selected: p.id === scope }, p.name))) : null;
}

/**
 * Writes to an order's packing record: the first write makes it, later ones
 * change only what moved.
 */
export function savePack(o, patch, action, label) {
  const now = Date.now();
  const batch = writeBatch(db);
  const ref = doc(db, ws(`outbound/${o.key}`));
  if (o.pack) batch.update(ref, { ...patch, updatedAt: now });
  else {
    batch.set(ref, {
      kind: o.kind, orderId: o.id, ref: o.ref, to: o.to ?? '', branchId: scope || '', status: 'OPEN', urgent: false,
      createdByUid: session.uid, createdByName: session.name, createdAt: now, updatedAt: now, ...patch,
    });
  }
  audit(batch, 'Outbound', o.key, o.ref, action, { newValue: label });
  o.pack = { ...(o.pack || { kind: o.kind, orderId: o.id, status: 'OPEN' }), ...patch };
  return batch;
}

export function render(main, sub) {
  if (!canMove()) { mount(main, head(t('whOutbound')), h('p', { class: 'muted' }, t('noStockPermission'))); return null; }
  pickScope();
  if (sub) return one(main, sub);
  const strip = h('div', { class: 'ob-stages', role: 'tablist' });
  const box = h('div');
  mount(main,
    head(t('whOutbound'), placeSelect(() => render(main)),
      h('button', { 'data-act': 'go-docks', onclick: () => go('docks') }, icon('truck', 17), h('span', { class: 'hide-sm' }, t('whDocks')))),
    h('p', { class: 'muted' }, t('whOutboundHelp')),
    strip, box);
  loading(box);
  loadOutbound().then((data) => {
    const orders = outboundOrders(data, scope);
    const counts = stageCounts(orders);
    const draw = () => {
      mount(strip,
        h('button', { class: `ob-stage${only ? '' : ' on'}`, 'data-stage': '', onclick: () => { only = ''; draw(); } }, h('b', {}, String(orders.length)), h('span', {}, t('whAll'))),
        STAGES.map((s, i) => [i ? h('span', { class: 'ob-arrow', 'aria-hidden': 'true' }, '›') : null,
          h('button', { class: `ob-stage${only === s ? ' on' : ''}${counts[s] ? '' : ' zero'}`, 'data-stage': s, onclick: () => { only = only === s ? '' : s; draw(); } },
            h('b', {}, String(counts[s])), h('span', {}, t(`ob_${s}`)))]));
      const shown = only ? orders.filter((o) => o.stage === only) : orders;
      mount(box, shown.length ? h('div', { class: 'wh-list' }, shown.map(card)) : h('p', { class: 'muted' }, t('whOutboundNone')));
    };
    draw();
  }).catch((err) => failed(box, err));
  return null;
}

/** One order on the board. */
function card(o) {
  const where = [
    o.pack?.cartons ? `📦 ${o.pack.cartons} ${t('whCartons')}` : '',
    o.stage === 'PACKED' && o.pack?.lane ? `${t('whLane')} ${o.pack.lane}` : '',
    o.trip ? `🚚 ${o.trip.plate || ''}${o.trip.dock && ['PLANNED', 'LOADING'].includes(o.trip.status) ? ` @ ${o.trip.dock}` : ''}` : '',
  ].filter(Boolean).join(' · ');
  return h('button', { class: `wh-card ob-card${o.urgent ? ' urgent' : ''}`, 'data-ob': o.ref, onclick: () => go('outbound', o.key) },
    h('div', { class: 'row' }, h('strong', { class: 'grow' }, o.ref), o.urgent ? pill(t('whUrgent'), 'bad') : null, pill(t(`ob_${o.stage}`), STAGE_TONE[o.stage])),
    h('div', {}, `${orderTo(o)} · ${o.lines.length} ${t('whLines')} · ${formatQty(o.units)}`),
    stepsBar(o.stage),
    h('div', { class: 'muted' }, where || dateTime(o.at)));
}

/** Seven dots, filled up to where the order is. */
function stepsBar(stage, labels = false) {
  const at = STAGES.indexOf(stage);
  return h('div', { class: `ob-steps${labels ? ' big' : ''}` }, STAGES.map((s, i) => h('span', { class: i < at ? 'done' : i === at ? 'now' : '', title: t(`ob_${s}`) },
    labels ? h('small', {}, t(`ob_${s}`)) : null)));
}

/** One order: where it is, and the next thing to do with it. */
function one(main, key) {
  const box = h('div');
  mount(main, head(t('whOutbound')), box);
  loading(box);
  loadOutbound().then((data) => {
    let o = null;
    for (const p of myPlaces()) {
      o = outboundOrders(data, p.id, { keepDays: 3650 }).find((x) => x.key === key);
      if (o) { scope = p.id; break; }
    }
    if (!o) { mount(box, h('p', { class: 'muted' }, t('notFound'))); return; }
    const lanes = laneBoard(outboundOrders(data, scope));
    show(box, o, lanes);
  }).catch((err) => failed(box, err));
  return null;
}

function show(box, o, lanes) {
  let cartons = o.pack?.cartons || Math.max(1, Math.ceil(o.lines.length / 4));
  let lane = o.pack?.lane || LANES.find((l) => !lanes.get(l).length) || LANES[0];
  let repack = false;
  const toggleUrgent = () => {
    const urgent = !o.urgent;
    send(savePack(o, { urgent }, 'URGENT', urgent ? 'URGENT' : 'normal'), urgent ? t('whUrgentOn') : t('whUrgentOff'));
    o.urgent = urgent;
    draw();
  };
  const weight = h('input', { type: 'number', min: 0, step: '0.1', inputmode: 'decimal', 'data-f': 'weight', value: o.pack?.weightKg ?? '', placeholder: 'kg' });
  const pack = () => {
    const kg = Number(weight.value);
    const patch = { status: 'PACKED', cartons, lane, packedAt: Date.now(), packedByName: session.name, ...(weight.value !== '' && kg >= 0 ? { weightKg: kg } : {}) };
    send(savePack(o, patch, 'PACKED', `${cartons} ctn · ${lane}`), t('whPackedOk').replace('{lane}', lane));
    o.stage = o.stage === 'PACKING' ? 'PACKED' : o.stage;
    repack = false;
    draw();
  };
  const packForm = () => h('section', { class: 'card ob-pack', 'data-card': 'pack' },
    h('h2', {}, t('whPackTitle')),
    h('div', { class: 'field' }, t('whCartons'),
      h('div', { class: 'wh-step big' },
        h('button', { type: 'button', 'aria-label': '−', onclick: () => { cartons = Math.max(1, cartons - 1); draw(); } }, icon('minus', 20)),
        h('span', { class: 'q', 'data-f': 'cartons' }, String(cartons)),
        h('button', { type: 'button', 'aria-label': '+', 'data-act': 'ctn-plus', onclick: () => { cartons += 1; draw(); } }, icon('plus', 20)))),
    h('label', { class: 'field' }, `${t('whWeight')} (kg, ${t('whOptional')})`, weight),
    h('div', { class: 'field' }, t('whLanePick'),
      h('div', { class: 'ob-lanes' }, LANES.map((l) => {
        const n = lanes.get(l).filter((x) => x.key !== o.key).length;
        return h('button', { type: 'button', class: `ob-lane${l === lane ? ' on' : ''}`, 'data-lane': l, onclick: () => { lane = l; draw(); } },
          h('b', {}, l), h('small', {}, n ? `${n} ${t('whOrdersN')}` : t('whLaneFree')));
      }))),
    h('button', { class: 'primary', 'data-act': 'pack-save', onclick: pack }, icon('check', 18), t('whPackDone')));

  const nextStep = () => {
    switch (o.stage) {
      case 'CREATED': return h('button', { class: 'primary', 'data-act': 'ob-pick', onclick: () => go('picking') }, icon('basket', 18), t('whGoPick'));
      case 'PICKING': return h('button', { class: 'primary', 'data-act': 'ob-pick', onclick: () => go('picking', o.pick.id) }, icon('basket', 18), `${t('whOpenPick')} ${o.pick.pickNo}`);
      case 'PACKING': return packForm();
      case 'PACKED':
        if (repack) return packForm();
        return h('section', { class: 'card', 'data-card': 'packed' },
          h('div', { class: 'ob-big' }, `📦 ${o.pack?.cartons || 0} ${t('whCartons')} · ${t('whLane')} ${o.pack?.lane || '—'}`),
          o.pack?.weightKg != null ? h('div', { class: 'muted' }, `${o.pack.weightKg} kg`) : null,
          o.pack?.packedByName ? h('div', { class: 'muted' }, `${t('whPackedBy')} ${o.pack.packedByName} · ${dateTime(o.pack.packedAt)}`) : null,
          o.trip ? h('p', {}, `🚚 ${o.trip.plate || ''} · ${o.trip.driverName || ''}${o.trip.dock ? ` · ${o.trip.dock}` : ` · ${t('whInYard')}`}`)
            : h('p', { class: 'muted' }, t('whNoLorryYet')),
          h('div', { class: 'row' },
            h('button', { class: 'ghost', 'data-act': 'repack', onclick: () => { repack = true; draw(); } }, t('whRepack')),
            h('span', { class: 'grow' }),
            o.trip ? h('button', { class: 'primary', 'data-act': 'go-docks', onclick: () => go('docks') }, icon('truck', 18), t('whDocks'))
              : h('a', { class: 'btn primary', href: '/tms/#/trips/new', 'data-act': 'plan-trip' }, icon('truck', 18), t('whPlanTrip'))));
      default:
        return o.trip ? h('section', { class: 'card', 'data-card': 'trip' },
          h('div', { class: 'ob-big' }, `🚚 ${o.trip.plate || ''} · ${o.trip.driverName || ''}`),
          h('div', { class: 'muted' }, `${o.trip.tripNo || ''}${o.trip.dock && o.stage === 'LOADED' ? ` · ${o.trip.dock}` : ''}${o.stop?.receivedBy ? ` · ${t('whSignedBy')} ${o.stop.receivedBy}` : ''}`),
          h('a', { class: 'btn', href: `/tms/#/trips/${o.trip.id}`, 'data-act': 'open-trip' }, t('whOpenTrip'))) : null;
    }
  };

  const draw = () => mount(box,
    h('div', { class: `card wh-head${o.urgent ? ' ob-urgent' : ''}` },
      h('div', { class: 'row' }, h('strong', { class: 'grow', style: { fontSize: '18px' } }, o.ref), o.urgent ? pill(t('whUrgent'), 'bad') : null, pill(t(`ob_${o.stage}`), STAGE_TONE[o.stage])),
      h('div', {}, `${orderTo(o)} · ${placeName(scope)}`),
      stepsBar(o.stage, true),
      ['ON_ROAD', 'DELIVERED'].includes(o.stage) ? null
        : h('button', { class: o.urgent ? '' : 'ghost', 'data-act': 'ob-urgent', onclick: toggleUrgent }, o.urgent ? t('whUrgentClear') : `⚡ ${t('whMarkUrgent')}`)),
    nextStep(),
    h('section', { class: 'card' }, h('h2', {}, `${o.lines.length} ${t('whLines')} · ${formatQty(o.units)}`),
      h('div', { class: 'wh-lines' }, o.lines.map((l) => h('div', { class: 'wh-line' },
        h('div', { class: 'n' }, h('strong', {}, l.name || l.barcode)),
        h('div', { class: 'muted' }, `${l.barcode} · ${qtyText(l.qtyMilli || 0, session.find(l.barcode))}`))))),
    h('div', { class: 'wh-bar' }, h('button', { onclick: () => go('outbound') }, t('back'))));
  draw();
  if (o.stage === 'PACKING') toast(t('whPackNow'), 'ok');
}

export { packKey };
