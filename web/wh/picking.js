/**
 * Picking (拣货): one walk along the shelves for several orders at once.
 *
 *   #/picking          orders waiting to be picked -> tick -> a picklist;
 *                      the picklists, waiting, being picked and done
 *   #/picking/<id>     picking one: the next shelf in big letters, scan
 *                      each item (a wrong one is refused), short marked
 *
 * WAITING -> PICKING -> DONE, or CANCELLED (its orders go back to waiting).
 * The orders are transfers not yet sent and reservations still held at the
 * place; the lines are theirs merged per product, in shelf order
 * (web/js/picking.js). Picking moves no stock: it leaves when the transfer
 * is dispatched or the reservation handed over, so the done screen links
 * straight to those.
 */
import { collection, db, doc, getDoc, writeBatch } from '../js/fb.js';
import { confirmBox, dateTime, h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty, UNIT } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { applyScan, nextIndex, ordersToPick, pickLines, progress, zoneOf } from '../js/picking.js';
import { audit, canMove, failed, head, loading, myPlaces, newId, pill, placeName, productBox, qtyText, refNo, send, shelfOf } from './common.js';
import { loadPicklists, loadReservations, loadTransfers } from './data.js';
import { go } from './main.js';

export const PK_TONE = { WAITING: 'warn', PICKING: 'good', DONE: '', CANCELLED: 'bad' };
let scope = null;
let tab = 'open';

const buzz = () => { try { navigator.vibrate?.([60, 40, 60]); } catch { /* not every device */ } };
const orderName = (o) => (o.kind === 'TRANSFER' ? `${t('whOrderTr')} → ${placeName(o.to)}` : `${t('whOrderRes')} · ${o.to || ''}`);

export function render(main, sub) {
  if (!canMove()) { mount(main, head(t('whPicking')), h('p', { class: 'muted' }, t('noStockPermission'))); return null; }
  if (sub) return open(main, sub);
  const places = myPlaces();
  if (scope == null || !places.some((p) => p.id === scope)) scope = places.some((p) => p.id === session.branchId) ? session.branchId : (places[0]?.id ?? '');
  const waitingBox = h('div');
  const tabs = h('div', { class: 'seg wh-tabs' });
  const box = h('div');
  mount(main,
    head(t('whPicking'), places.length > 1 ? h('select', { style: { width: 'auto' }, 'data-act': 'pk-place', onchange: (e) => { scope = e.target.value; render(main); } },
      places.map((p) => h('option', { value: p.id, selected: p.id === scope }, p.name))) : null),
    h('p', { class: 'muted' }, t('whPickHelp')),
    waitingBox, tabs, box);
  loading(box);
  Promise.all([loadTransfers().catch(() => []), loadReservations().catch(() => []), loadPicklists()]).then(([transfers, reservations, picklists]) => {
    const here = picklists.filter((p) => (p.branchId || '') === (scope || ''));
    drawWaiting(waitingBox, ordersToPick({ transfers, reservations, picklists }, scope));
    const groups = { open: here.filter((p) => ['WAITING', 'PICKING'].includes(p.status)), done: here.filter((p) => ['DONE', 'CANCELLED'].includes(p.status)).slice(0, 30) };
    const draw = () => {
      mount(tabs, Object.keys(groups).map((k) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, `${t(`whPk_${k}`)} ${groups[k].length}`)));
      mount(box, groups[tab].length ? h('div', { class: 'wh-list' }, groups[tab].map(card)) : h('p', { class: 'muted' }, t('whPickNone')));
    };
    draw();
  }).catch((err) => failed(box, err));
  return null;
}

/** One picklist in the list: number, aisle, orders, picker, how far. */
function card(p) {
  const pr = progress(p.lines);
  return h('button', { class: 'wh-card pk-card', 'data-pick': p.id, onclick: () => go('picking', p.id) },
    h('div', { class: 'row' }, h('strong', { class: 'grow' }, p.pickNo), p.zone ? h('span', { class: 'pill shelf' }, `${t('whPickZone')} ${p.zone}`) : null, pill(t(`pk_${p.status}`), PK_TONE[p.status])),
    h('div', {}, `${(p.orders || []).length} ${t('whOrdersN')} · ${(p.orders || []).map((o) => o.ref).join(', ')}`),
    h('div', { class: 'pk-bar' }, h('span', { style: { width: `${pr.total ? Math.round(100 * pr.done / pr.total) : 0}%` } })),
    h('div', { class: 'muted' }, `${pr.done}/${pr.total} ${t('whLines')}`, p.pickerName ? ` · ${t('whPickBy')} ${p.pickerName}` : '', ` · ${dateTime(p.doneAt || p.startedAt || p.createdAt)}`));
}

/** The orders waiting, ticked to go on one picklist (all ticked to start with). */
function drawWaiting(box, orders) {
  const ticked = new Set(orders.map((o) => `${o.kind}:${o.id}`));
  const key = (o) => `${o.kind}:${o.id}`;
  const draw = () => {
    const chosen = orders.filter((o) => ticked.has(key(o)));
    mount(box, h('section', { class: 'card pk-waiting', 'data-card': 'to-pick' },
      h('div', { class: 'row' }, h('h2', { class: 'grow', style: { margin: 0 } }, `${t('whToPick')} (${orders.length})`),
        orders.length > 1 ? h('button', { class: 'ghost', onclick: () => { if (chosen.length === orders.length) ticked.clear(); else orders.forEach((o) => ticked.add(key(o))); draw(); } },
          chosen.length === orders.length ? t('whPickNoneSel') : t('whPickAll')) : null),
      orders.length ? h('div', { class: 'pk-orders' }, orders.map((o) => h('label', { class: `pk-order${ticked.has(key(o)) ? ' on' : ''}`, 'data-order': o.ref },
        h('input', { type: 'checkbox', checked: ticked.has(key(o)), onchange: (e) => { if (e.target.checked) ticked.add(key(o)); else ticked.delete(key(o)); draw(); } }),
        h('span', { class: 'grow' }, h('b', {}, o.ref), h('span', { class: 'muted' }, ` · ${orderName(o)}`),
          h('div', { class: 'muted', style: { fontSize: '13px' } }, `${o.lines.length} ${t('whLines')} · ${formatQty(o.lines.reduce((s, l) => s + (l.qtyMilli || 0), 0))}`)),
        o.kind === 'TRANSFER' && o.status !== 'APPROVED' ? pill(t(`tr_${o.status}`), o.status === 'PENDING' ? 'warn' : '') : null)))
        : h('p', { class: 'muted', style: { margin: 0 } }, t('whNoToPick')),
      orders.length ? h('div', { class: 'row', style: { marginTop: '10px' } }, h('span', { class: 'grow' }),
        h('button', { class: 'primary', 'data-act': 'pk-make', disabled: !chosen.length, onclick: () => make(chosen) }, icon('basket', 18), t('whMakePick').replace('{n}', chosen.length))) : null));
  };
  draw();
}

/** A picklist for [orders]: their lines merged per product, in shelf order. */
function make(orders) {
  const id = newId('picklists');
  const lines = pickLines(orders, (code) => shelfOf(session.find(code), scope));
  const zones = [...new Set(lines.map((l) => zoneOf(l.bin)).filter(Boolean))];
  const now = Date.now();
  const pick = {
    pickNo: refNo('PCK'), branchId: scope || '', status: 'WAITING', zone: zones.join(' '),
    orders: orders.map((o) => ({ kind: o.kind, id: o.id, ref: o.ref, to: o.to ?? '' })),
    lines, pickerUid: '', pickerName: '', createdByUid: session.uid, createdByName: session.name, createdAt: now, updatedAt: now,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, ws(`picklists/${id}`)), pick);
  audit(batch, 'Picklist', id, pick.pickNo, 'CREATE', { newValue: pick.orders.map((o) => o.ref).join(', ') });
  send(batch, t('whPickMade'));
  go('picking', id);
}

function open(main, id) {
  const box = h('div');
  mount(main, head(t('whPicking')), box);
  loading(box);
  getDoc(doc(db, ws(`picklists/${id}`))).then((snap) => {
    if (!snap.exists()) { mount(box, h('p', { class: 'muted' }, t('notFound'))); return; }
    picking(box, { ...snap.data(), id: snap.id });
  }).catch((err) => failed(box, err));
  return null;
}

function picking(box, p) {
  const ref = doc(db, ws(`picklists/${p.id}`));
  const lines = p.lines || [];
  let flash = -1;
  const mine = () => p.pickerUid === session.uid;
  const live = () => ['WAITING', 'PICKING'].includes(p.status);
  const write = (patch, action, auditInfo) => {
    Object.assign(p, patch);
    const batch = writeBatch(db);
    batch.update(ref, { ...patch, updatedAt: Date.now() });
    if (action) audit(batch, 'Picklist', p.id, p.pickNo, action, auditInfo);
    send(batch);
  };
  // Every tap is saved, so a picker who drops the phone carries on where they were.
  const saveLines = () => write({ lines });
  const start = () => {
    const was = p.status;
    write({ status: 'PICKING', pickerUid: session.uid, pickerName: session.name, startedAt: p.startedAt || Date.now() }, 'STATUS_CHANGE', { field: 'status', oldValue: was, newValue: `PICKING (${session.name})` });
    draw();
    scan.focus();
  };
  const scan = productBox({
    big: true,
    placeholder: t('whPickScan'),
    onPick: (product) => {
      if (p.status !== 'PICKING' || !mine()) return toast(t('whPickStartFirst'), 'error');
      const step = 1000;
      const r = applyScan(lines, product.barcode, step);
      if (r.kind === 'wrong') { buzz(); return toast(t('whPickWrong').replace('{p}', product.name || product.barcode), 'error'); }
      if (r.kind === 'over') { buzz(); return toast(t('whPickOver').replace('{p}', product.name || product.barcode), 'error'); }
      flash = r.index;
      saveLines();
      draw();
    },
    onUnknown: (code) => { buzz(); toast(t('whPickWrong').replace('{p}', code), 'error'); },
  });
  const finish = async () => {
    const left = lines.filter((l) => !l.short && (l.pickedMilli || 0) < l.qtyMilli);
    if (left.length && !await confirmBox(`${t('whPickFinishQ').replace('{n}', left.length)}\n${left.map((l) => `${l.name}: ${formatQty(l.pickedMilli || 0)} / ${formatQty(l.qtyMilli)}`).join('\n')}`, t('whPickFinish'), t('cancel'), { tone: 'primary' })) return;
    left.forEach((l) => { l.short = true; });
    const pr = progress(lines);
    write({ status: 'DONE', lines, doneAt: Date.now() }, 'STATUS_CHANGE', { field: 'status', oldValue: 'PICKING', newValue: pr.short ? `DONE (${pr.short} short)` : 'DONE' });
    toast(t('whPickDone'), 'ok');
    draw();
  };
  const cancel = async () => {
    if (!await confirmBox(t('whPickCancelQ'), t('whPickCancel'), t('cancel'))) return;
    write({ status: 'CANCELLED', cancelledAt: Date.now(), cancelledByName: session.name }, 'STATUS_CHANGE', { field: 'status', oldValue: p.status, newValue: 'CANCELLED' });
    go('picking');
  };
  const setLine = (l, patch) => { Object.assign(l, patch); saveLines(); draw(); };

  const nextCard = () => {
    const i = nextIndex(lines);
    if (i < 0) return h('div', { class: 'card pk-next all' }, icon('check', 30), h('strong', {}, t('whPickAllIn')));
    const l = lines[i];
    const product = session.find(l.barcode);
    return h('div', { class: 'card pk-next', 'data-next': l.barcode },
      h('div', { class: 'pk-next-label' }, t('whPickNext')),
      h('div', { class: 'pk-bin' }, l.bin ? `📍 ${l.bin}` : t('whNoShelf')),
      h('div', { class: 'pk-next-name' }, l.name),
      h('div', { class: 'pk-next-qty' }, h('span', {}, t('whPickTake')), h('b', {}, qtyText(l.qtyMilli - (l.pickedMilli || 0), product)),
        l.pickedMilli ? h('span', { class: 'muted' }, ` (${formatQty(l.pickedMilli)}/${formatQty(l.qtyMilli)})`) : null),
      h('div', { class: 'row' },
        h('button', { class: 'ghost', 'data-act': 'pk-short', onclick: () => setLine(l, { short: true }) }, t('whPickShort')),
        h('span', { class: 'grow' }),
        h('button', { class: 'primary', 'data-act': 'pk-got', onclick: () => { flash = i; setLine(l, { pickedMilli: l.qtyMilli, short: false }); } }, icon('check', 18), t('whPickGot'))));
  };

  const lineRow = (l, i) => {
    const product = session.find(l.barcode);
    const full = (l.pickedMilli || 0) >= l.qtyMilli;
    const can = p.status === 'PICKING' && mine();
    const step = (d) => () => setLine(l, { pickedMilli: Math.max(0, Math.min(l.qtyMilli, (l.pickedMilli || 0) + d * UNIT)), short: false });
    return h('div', { class: `wh-line pk-line${full ? ' full' : ''}${l.short && !full ? ' short' : ''}${i === flash ? ' flash' : ''}`, 'data-line': l.barcode },
      h('div', { class: 'n' }, h('span', { class: 'pill shelf' }, l.bin ? `📍 ${l.bin}` : t('whNoShelf')), h('strong', {}, l.name),
        full ? pill('✓', 'good') : l.short ? pill(t('whShortTag'), 'bad') : null),
      h('div', { class: 'muted' }, `${l.barcode} · ${(l.refs || []).join(', ')}`),
      h('div', { class: 'wh-step' },
        can ? h('button', { type: 'button', 'aria-label': '−', onclick: step(-1) }, icon('minus', 18)) : null,
        h('span', { class: 'q pk-q' }, `${formatQty(l.pickedMilli || 0)}/${qtyText(l.qtyMilli, product)}`),
        can ? h('button', { type: 'button', 'aria-label': '+', onclick: step(1) }, icon('plus', 18)) : null));
  };

  const afterwards = () => h('section', { class: 'card', 'data-card': 'pk-next-step' },
    h('h2', {}, t('whPickNextStep')),
    (p.orders || []).map((o) => h('button', { class: 'wh-row', 'data-go': o.ref, onclick: () => (o.kind === 'TRANSFER' ? go('transfers', o.id) : go('reserve')) },
      h('span', { class: 'grow' }, h('b', {}, o.ref), ` · ${orderName(o)}`), pill(o.kind === 'TRANSFER' ? t('whGoDispatch') : t('whGoDeliver'), 'good'))));

  const draw = () => {
    const pr = progress(lines);
    const someoneElse = p.status === 'PICKING' && !mine();
    mount(box,
      h('div', { class: 'card wh-head' },
        h('div', { class: 'row' }, h('strong', { class: 'grow', style: { fontSize: '18px' } }, p.pickNo), p.zone ? h('span', { class: 'pill shelf' }, `${t('whPickZone')} ${p.zone}`) : null, pill(t(`pk_${p.status}`), PK_TONE[p.status])),
        h('div', {}, `${placeName(p.branchId)} · ${(p.orders || []).map((o) => o.ref).join(', ')}`),
        h('div', { class: 'pk-bar big' }, h('span', { style: { width: `${pr.total ? Math.round(100 * pr.done / pr.total) : 0}%` } })),
        h('div', { class: 'muted' }, `${pr.done}/${pr.total} ${t('whLines')} · ${formatQty(pr.picked)}/${formatQty(pr.units)}`,
          p.pickerName ? ` · ${t('whPickBy')} ${p.pickerName}` : '', pr.short ? ` · ${pr.short} ${t('whShortTag')}` : '')),
      p.status === 'WAITING' ? h('button', { class: 'primary pk-start', 'data-act': 'pk-start', onclick: start }, icon('basket', 20), t('whPickStart')) : null,
      someoneElse ? h('div', { class: 'card row' }, h('span', { class: 'grow' }, t('whPickOthers').replace('{n}', p.pickerName || '')),
        h('button', { 'data-act': 'pk-takeover', onclick: start }, t('whPickTakeOver'))) : null,
      p.status === 'PICKING' && mine() ? nextCard() : null,
      p.status === 'PICKING' && mine() ? h('div', { class: 'wh-scan' }, scan) : null,
      p.status === 'DONE' ? afterwards() : null,
      h('div', { class: 'wh-lines' }, lines.map(lineRow)),
      h('div', { class: 'wh-bar' },
        h('button', { onclick: () => go('picking') }, t('back')),
        live() ? h('button', { class: 'danger', 'data-act': 'pk-cancel', onclick: cancel }, t('whPickCancel')) : null,
        p.status === 'PICKING' && mine() ? h('button', { class: 'primary grow', 'data-act': 'pk-finish', onclick: finish }, icon('check', 18), t('whPickFinish')) : null));
    if (flash >= 0) box.querySelector('.pk-line.flash')?.scrollIntoView({ block: 'nearest' });
    flash = -1;
  };
  draw();
  // The scanner types into the box; focused once, not after every tap (a phone would open its keyboard).
  if (p.status === 'PICKING' && mine()) scan.focus();
}
