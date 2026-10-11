/**
 * The first screen. On a phone: big buttons for the jobs of the day, with
 * how many are waiting. At a computer: the same, plus what the owner wants
 * to know at a glance -- what the stock is worth, what is low, what is on
 * its way, what needs approving.
 */
import { collection, db, getDocs, limit, orderBy, query } from '../js/fb.js';
import { dateTime, h, mount } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty, rm } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { actionTile, canApprove, canBuy, canMove, failed, head, isMine, loading, myPlaces, pill } from './common.js';
import { loadAll, reorderSuggestions, stockRows } from './data.js';
import { expiring } from '../js/wms.js';
import { places as allPlaces } from './common.js';
import { expiryPill } from './stock.js';
import { ordersToPick, progress } from '../js/picking.js';
import { go } from './main.js';

let scope = null;

export function render(main) {
  if (scope == null) scope = session.branchIds.length ? session.branchId : 'ALL';
  const tiles = h('div', { class: 'wh-tiles' });
  const box = h('div');
  const draw = (data) => {
    const rows = stockRows(data, scope);
    const here = (id) => scope === 'ALL' || (id || '') === scope;
    const toReceive = data.pos.filter((p) => ['ORDERED', 'PARTIAL'].includes(p.status) && here(p.branchId) && isMine(p.branchId));
    const incoming = data.transfers.filter((tr) => tr.status === 'SENT' && here(tr.toBranch) && isMine(tr.toBranch));
    const outgoing = data.transfers.filter((tr) => tr.status === 'DRAFT' && here(tr.fromBranch));
    const toApprove = data.pos.filter((p) => p.status === 'SUBMITTED' && here(p.branchId));
    const trToApprove = canApprove() ? data.transfers.filter((tr) => tr.status === 'PENDING' && here(tr.fromBranch)) : [];
    const trApproved = data.transfers.filter((tr) => tr.status === 'APPROVED' && here(tr.fromBranch) && isMine(tr.fromBranch));
    // Batches due within 30 days (or past), at the places in view.
    const soon = (scope === 'ALL' ? allPlaces() : allPlaces().filter((p) => p.id === scope)).flatMap((p) =>
      expiring(stockRows(data, p.id), data.stock.moves.filter((m) => (m.branchId || '') === p.id), { days: 30 }).map((l) => ({ ...l, place: p })))
      .sort((a, b) => a.daysLeft - b.daysLeft);
    // Orders waiting for a picker, and picklists not finished.
    const pickOpen = canMove() ? data.picklists.filter((p) => ['WAITING', 'PICKING'].includes(p.status) && here(p.branchId) && isMine(p.branchId)) : [];
    const toPick = canMove() ? myPlaces().filter((p) => here(p.id)).flatMap((p) => ordersToPick(data, p.id)) : [];
    const low = rows.filter((r) => r.low);
    const out = rows.filter((r) => r.out && (r.counted != null || r.inSince || r.outSince));
    const value = rows.reduce((s, r) => s + r.valueSen, 0);
    const suggestions = reorderSuggestions(rows);
    const waiting = [
      ...pickOpen.map((p) => ({ at: p.startedAt || p.createdAt, label: `${p.pickNo} · ${progress(p.lines).done}/${(p.lines || []).length} ${t('whLines')}${p.pickerName ? ` · ${p.pickerName}` : ''}`, tag: pill(t(`pk_${p.status}`), p.status === 'WAITING' ? 'warn' : 'good'), to: () => go('picking', p.id) })),
      ...(toPick.length ? [{ at: Date.now(), label: `${toPick.length} ${t('whOrdersN')} · ${toPick.slice(0, 3).map((o) => o.ref).join(', ')}${toPick.length > 3 ? ' …' : ''}`, tag: pill(t('whToPick'), 'warn'), to: () => go('picking') }] : []),
      ...toApprove.map((p) => ({ at: p.createdAt, label: `${p.poNo} · ${p.supplierName || ''}`, tag: pill(t('po_SUBMITTED'), 'warn'), to: () => go('purchase', p.id) })),
      ...toReceive.map((p) => ({ at: p.createdAt, label: `${p.poNo} · ${p.supplierName || ''}`, tag: pill(t(`po_${p.status}`), 'good'), to: () => go('receive', p.id) })),
      ...incoming.map((tr) => ({ at: tr.sentAt || tr.createdAt, label: `${tr.transferNo} · ${session.branchName(tr.fromBranch)} → ${session.branchName(tr.toBranch)}`, tag: pill(t('tr_SENT'), 'warn'), to: () => go('transfers', tr.id) })),
      ...trToApprove.map((tr) => ({ at: tr.submittedAt || tr.createdAt, label: `${tr.transferNo} · ${session.branchName(tr.fromBranch)} → ${session.branchName(tr.toBranch)}`, tag: pill(t('tr_PENDING'), 'warn'), to: () => go('transfers', tr.id) })),
      ...trApproved.map((tr) => ({ at: tr.approvedAt || tr.createdAt, label: `${tr.transferNo} · → ${session.branchName(tr.toBranch)}`, tag: pill(t('tr_APPROVED'), 'good'), to: () => go('transfers', tr.id) })),
      ...outgoing.map((tr) => ({ at: tr.createdAt, label: `${tr.transferNo} · → ${session.branchName(tr.toBranch)}`, tag: pill(t('tr_DRAFT')), to: () => go('transfers', tr.id) })),
    ].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 10);

    mount(tiles,
      canMove() ? actionTile('download', t('whReceive'), toReceive.length ? `${toReceive.length} ${t('whWaiting')}` : t('whReceiveSub'), () => go('receive'), toReceive.length ? 'hot' : '') : null,
      canMove() ? actionTile('basket', t('whPicking'), toPick.length + pickOpen.length ? t('whPickWaitingN').replace('{n}', toPick.length + pickOpen.length) : t('whPickingSub'), () => go('picking'), toPick.length + pickOpen.length ? 'hot' : '') : null,
      canMove() ? actionTile('box', t('whTransfers'), incoming.length ? `${incoming.length} ${t('whArriving')}` : t('whTransfersSub'), () => go('transfers'), incoming.length ? 'hot' : '') : null,
      canMove() ? actionTile('sliders', t('whAdjust'), t('whAdjustSub'), () => go('adjust')) : null,
      actionTile('barcode', t('whStock'), t('whStockSub'), () => go('stock')),
      canBuy() || canApprove() ? actionTile('receipt', t('whPurchase'), toApprove.length && canApprove() ? `${toApprove.length} ${t('whToApprove')}` : t('whPurchaseSub'), () => go('purchase'), toApprove.length && canApprove() ? 'hot' : '') : null,
      soon.length ? actionTile('book', t('whExpiring'), t('whExpiringSub').replace('{n}', 30), () => go('stock'), 'hot') : null,
      actionTile('percent', t('whVariance'), t('whVarianceSub'), () => go('variance')));

    const stat = (label, value2, tone = '') => h('div', { class: `card stat${tone ? ` ${tone}` : ''}` }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value2));
    mount(box,
      h('div', { class: 'cards' },
        stat(t('stockValue'), rm(value)),
        stat(t('lowStock'), String(low.length), low.length ? 'warn' : ''),
        stat(t('whOutOfStock'), String(out.length), out.length ? 'bad' : ''),
        stat(t('whPendingReceiving'), String(toReceive.length)),
        stat(t('whInTransit'), String(data.transfers.filter((tr) => tr.status === 'SENT' && (here(tr.toBranch) || here(tr.fromBranch))).length)),
        canApprove() ? stat(t('whToApproveTitle'), String(toApprove.length), toApprove.length ? 'warn' : '') : null),
      h('div', { class: 'wh-cols' },
        h('section', { class: 'card' },
          h('div', { class: 'row', style: { marginBottom: '8px' } }, h('h2', { style: { margin: 0 } }, t('whReorderTitle')), h('span', { class: 'grow' }),
            suggestions.length && canBuy() ? h('button', { onclick: () => go('purchase', 'reorder') }, t('whMakePos')) : null),
          suggestions.length ? h('table', { class: 'list' }, h('tbody', {}, suggestions.slice(0, 8).map((r) => h('tr', { class: 'click', onclick: () => go('stock', encodeURIComponent(r.key)) },
            h('td', {}, r.name || r.key), h('td', { class: 'num' }, `${formatQty(r.onHand)} / ${formatQty(r.reorderLevel)}`),
            h('td', { class: 'num' }, pill(`+${formatQty(r.suggestMilli)}`, 'warn'))))))
            : h('p', { class: 'muted', style: { margin: 0 } }, t('whNothingLow'))),
        h('section', { class: 'card' },
          h('h2', {}, t('whWaitingTitle')),
          waiting.length
            ? waiting.map((x) => h('button', { class: 'wh-row', onclick: x.to }, h('span', { class: 'grow' }, x.label), x.tag))
            : h('p', { class: 'muted', style: { margin: 0 } }, t('whNothingWaiting')))),
      soon.length ? h('section', { class: 'card', style: { marginTop: '16px' }, 'data-card': 'expiring' }, h('h2', {}, `⏰ ${t('whExpiring')} (${soon.length})`),
        h('table', { class: 'list' }, h('tbody', {}, soon.slice(0, 10).map((l) => h('tr', { class: 'click', onclick: () => go('stock', encodeURIComponent(l.key)) },
          h('td', {}, l.name), h('td', { class: 'muted' }, l.place.name), h('td', { class: 'num' }, formatQty(l.qtyMilli)), h('td', {}, expiryPill(l.expiry))))))) : null,
      h('section', { class: 'card', style: { marginTop: '16px' } }, h('h2', {}, t('whLatestMoves')), recent));
    loadRecent();
  };

  const recent = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  async function loadRecent() {
    try {
      const snap = await getDocs(query(collection(db, ws('movements')), orderBy('at', 'desc'), limit(15)));
      const rows = snap.docs.map((d) => d.data()).filter((m) => isMine(m.branchId));
      mount(recent, rows.length ? h('table', { class: 'list' }, h('tbody', {}, rows.map((m) => h('tr', {},
        h('td', { class: 'muted', style: { whiteSpace: 'nowrap' } }, dateTime(m.at)),
        h('td', {}, m.productName || m.barcode),
        h('td', {}, t(`move_${m.type}`), m.reason ? h('span', { class: 'muted' }, ` · ${t(`reason_${m.reason}`)}`) : ''),
        h('td', { class: 'num' }, `${['SALE', 'WRITE_OFF', 'TRANSFER_OUT'].includes(m.type) ? '−' : '+'}${formatQty(m.quantityMilli)}`),
        h('td', { class: 'muted' }, session.branchName(m.branchId || ''))))))
        : h('p', { class: 'muted', style: { margin: 0 } }, t('whNoMovements')));
    } catch (err) {
      // A branch account cannot list every movement; its own page shows them.
      mount(recent, h('p', { class: 'muted', style: { margin: 0 } }, t('whSeeStockPage')));
    }
  }

  const places = myPlaces();
  mount(main,
    head(t('whHome'),
      places.length > 1 ? h('select', { style: { width: 'auto' }, onchange: (e) => { scope = e.target.value; refresh(); } },
        !session.branchIds.length ? h('option', { value: 'ALL', selected: scope === 'ALL' }, t('allBranches')) : null,
        places.map((p) => h('option', { value: p.id, selected: scope === p.id }, p.name))) : null),
    tiles, box);
  let cached = null;
  const refresh = () => { if (cached) draw(cached); };
  loading(box);
  loadAll().then((data) => { cached = data; draw(data); }).catch((err) => failed(box, err));
  return null;
}
