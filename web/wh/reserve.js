/**
 * Stock promised to a customer (预留): a wholesale order taken on the phone,
 * a deposit paid for goods to collect next week. It stays on the shelf and
 * on hand, but is no longer available -- not to promise again, not to send
 * to another place (data.js: available = on hand - reserved).
 *
 * OPEN -> DELIVERED (the goods leave: a SALE movement in the same batch) or
 * RELEASED (the promise is off; nothing moves).
 */
import { collection, db, doc, writeBatch } from '../js/fb.js';
import { confirmBox, dateTime, h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty, parseQty, UNIT } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { overPromised } from '../js/wms.js';
import {
  audit, canMove, failed, head, loading, movement, myPlaces, newId, packButton, pill, placeName, productBox, qtyText, refNo, send,
} from './common.js';
import { loadAll, loadReservations, stockRows } from './data.js';
import { go } from './main.js';

const TONE = { OPEN: 'warn', DELIVERED: 'good', RELEASED: '' };
const mayReserve = () => canMove() || session.can('POS_MANAGE');

export function render(main, sub) {
  if (!mayReserve()) { mount(main, head(t('whReserve')), h('p', { class: 'muted' }, t('noStockPermission'))); return null; }
  if (sub === 'new') return newReservation(main);
  const box = h('div');
  mount(main,
    head(t('whReserve'), h('button', { class: 'primary', 'data-act': 'res-new', onclick: () => go('reserve', 'new') }, icon('plus', 17), t('whNewReserve'))),
    h('p', { class: 'muted' }, t('whReserveHelp')),
    box);
  loading(box);
  loadReservations().then((list) => {
    const open = list.filter((r) => r.status === 'OPEN');
    const done = list.filter((r) => r.status !== 'OPEN').slice(0, 30);
    const card = (r) => h('div', { class: 'card', 'data-res': r.id, style: { display: 'grid', gap: '6px', marginBottom: '10px' } },
      h('div', { class: 'row' }, h('strong', { class: 'grow' }, `${r.reservationNo} · ${r.forWhom || ''}`), pill(t(`res_${r.status}`), TONE[r.status])),
      h('div', { class: 'muted' }, `${placeName(r.branchId)} · ${r.createdByName || ''} · ${dateTime(r.createdAt)}`),
      h('div', {}, (r.lines || []).map((l) => h('div', {}, `${qtyText(l.qtyMilli, session.find(l.barcode))} × ${l.name || l.barcode}`))),
      r.note ? h('div', { class: 'muted' }, r.note) : null,
      r.status === 'OPEN' ? h('div', { class: 'row' },
        h('button', { 'data-act': 'res-release', onclick: () => close(r, 'RELEASED') }, t('whReleaseRes')),
        canMove() ? h('button', { class: 'primary', 'data-act': 'res-deliver', onclick: () => close(r, 'DELIVERED') }, icon('check', 17), t('whDeliverRes')) : null) : null);
    mount(box, open.length ? open.map(card) : h('p', { class: 'muted' }, t('whNoReserve')),
      done.length ? h('details', { style: { marginTop: '12px' } }, h('summary', { class: 'muted' }, `${t('done')} (${done.length})`), done.map(card)) : null);
  }).catch((err) => failed(box, err));
  return null;
}

async function close(r, status) {
  if (!await confirmBox(status === 'DELIVERED' ? t('whDeliverResQ') : t('whReleaseResQ'), status === 'DELIVERED' ? t('whDeliverRes') : t('whReleaseRes'), t('cancel'), { tone: 'primary' })) return;
  const now = Date.now();
  const batch = writeBatch(db);
  batch.update(doc(db, ws(`reservations/${r.id}`)), { status, closedAt: now, closedByName: session.name, updatedAt: now });
  if (status === 'DELIVERED') {
    for (const l of r.lines || []) {
      batch.set(doc(collection(db, ws('movements'))), movement(l, 'SALE', l.qtyMilli, r.branchId, { reason: 'RESERVATION', kind: 'RESERVATION', reference: r.reservationNo, note: r.forWhom || '' }));
    }
  }
  audit(batch, 'Reservation', r.id, r.reservationNo, 'STATUS_CHANGE', { field: 'status', oldValue: 'OPEN', newValue: status });
  send(batch, t(`res_${status}`));
  go('reserve');
}

function newReservation(main) {
  const id = newId('reservations');
  let branch = myPlaces().some((p) => p.id === session.branchId) ? session.branchId : (myPlaces()[0]?.id ?? '');
  const lines = [];
  let data = null;
  loadAll().then((d) => { data = d; draw(); }).catch(() => {});
  const free = () => new Map(stockRows(data, branch).map((r) => [r.key, r.available]));
  const forWhom = h('input', { maxlength: 80, placeholder: t('whReserveFor'), 'data-act': 'res-for' });
  const note = h('input', { placeholder: t('note') });
  const linesBox = h('div', { class: 'wh-lines' });
  const draw = (flash = '') => {
    const avail = data ? free() : null;
    mount(linesBox, lines.length ? lines.map((l, i) => {
      const product = session.find(l.barcode);
      const left = avail ? avail.get(l.barcode) ?? 0 : null;
      return h('div', { class: `wh-line${l.barcode === flash ? ' flash' : ''}`, 'data-line': l.barcode },
        h('div', { class: 'n' }, h('strong', {}, l.name), left != null && l.qtyMilli > left ? pill(`${t('whOverReserve')} (${formatQty(left)})`, 'bad') : null),
        h('div', { class: 'muted' }, `${qtyText(l.qtyMilli, product)}${left != null ? ` · ${t('whAvailable')} ${formatQty(left)}` : ''}`),
        h('div', { class: 'wh-step' },
          packButton(product, (q) => { l.qtyMilli += q; draw(); }),
          h('button', { type: 'button', 'aria-label': '−', onclick: () => { l.qtyMilli = Math.max(0, l.qtyMilli - UNIT); draw(); } }, icon('minus', 18)),
          h('input', { class: 'q', inputmode: 'decimal', value: formatQty(l.qtyMilli), onchange: (e) => { const q = parseQty(e.target.value); if (q != null) l.qtyMilli = q; draw(); } }),
          h('button', { type: 'button', 'aria-label': '+', onclick: () => { l.qtyMilli += UNIT; draw(); } }, icon('plus', 18)),
          h('button', { type: 'button', class: 'ghost icon-btn', 'aria-label': t('remove'), onclick: () => { lines.splice(i, 1); draw(); } }, icon('trash', 17))));
    }) : h('p', { class: 'muted' }, t('whScanToStart')));
  };
  const scan = productBox({ big: true, onPick: (p) => {
    const l = lines.find((x) => x.barcode === p.barcode);
    if (l) l.qtyMilli += UNIT; else lines.push({ barcode: p.barcode, name: p.name || p.barcode, qtyMilli: UNIT });
    draw(p.barcode);
  } });
  const save = async () => {
    const used = lines.filter((l) => l.qtyMilli > 0);
    if (!used.length) return toast(t('errNoLines'), 'error');
    if (!forWhom.value.trim()) { forWhom.focus(); return toast(t('whReserveFor'), 'error'); }
    const over = data ? overPromised(used, free()) : [];
    if (over.length && !await confirmBox(`${t('whOverReserve')}\n${over.map((l) => `${l.name}: ${formatQty(l.qtyMilli)} / ${formatQty(l.availableMilli)}`).join('\n')}`, t('whReserveAnyway'), t('cancel'))) return;
    const now = Date.now();
    const reservationNo = refNo('RSV');
    const batch = writeBatch(db);
    batch.set(doc(db, ws(`reservations/${id}`)), {
      reservationNo, branchId: branch || '', forWhom: forWhom.value.trim(), note: note.value.trim(), status: 'OPEN',
      lines: used.map((l) => ({ barcode: l.barcode, name: l.name, qtyMilli: l.qtyMilli })),
      createdByUid: session.uid, createdByName: session.name, createdAt: now,
    });
    audit(batch, 'Reservation', id, reservationNo, 'CREATE', { field: forWhom.value.trim(), newValue: `${used.length} lines` });
    send(batch, t('whReserved'));
    go('reserve');
  };
  mount(main,
    head(t('whNewReserve')),
    h('div', { class: 'card wh-head' },
      h('label', { class: 'field' }, t('whReserveFor'), forWhom),
      myPlaces().length > 1 ? h('label', { class: 'field' }, t('whAt'), h('select', { onchange: (e) => { branch = e.target.value; draw(); } },
        myPlaces().map((p) => h('option', { value: p.id, selected: p.id === branch }, p.name)))) : null),
    h('div', { class: 'wh-scan' }, scan),
    linesBox,
    note,
    h('div', { class: 'wh-bar' },
      h('button', { onclick: () => go('reserve') }, t('cancel')),
      h('button', { class: 'primary grow', 'data-act': 'res-save', onclick: save }, icon('check', 18), t('whNewReserve'))));
  draw();
  scan.focus();
  return null;
}
