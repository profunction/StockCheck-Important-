/**
 * 拼多多进货 -- stock bought on Pinduoduo, recorded as a purchase order.
 *
 *   paste the order, or its screenshots -> check the items (matched to products, remembered for
 *   next time) -> save -> the parcel arrives -> Receive, by scanning
 *
 * The order is already paid, so whoever may approve saves it straight as
 * ORDERED; a buyer without approval rights submits it, the same as any
 * purchase order. Nothing is added to stock here: stock goes up when the
 * parcel is received and counted, so a missing or broken item is caught.
 * The platform, order and tracking numbers, currency and exchange rate are
 * kept on the order; each line keeps the title it had on the platform.
 *
 * Screenshots are read by the API (api/readorder.mjs, with Claude); the
 * text reader is web/js/onlineorder.js. The reader still knows other
 * platforms' layouts, but the page offers Pinduoduo only.
 */
import { doc, db, idToken, setDoc, writeBatch } from '../js/fb.js';
import { API_ORIGIN } from '../js/apiorigin.js';
import { h, local, modal, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatSen, inStoreBarcode, parseSen, rm, UNIT } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import {
  PLATFORMS, RATE_ONE, duplicateOf, formatRate, landedCosts, matchProduct, memoryFrom, parseOrderText, parseRate, toSen,
} from '../js/onlineorder.js';
import { audit, canApprove, canBuy, head, myPlaces, pill, productBox, send } from './common.js';
import { loadPurchaseOrders } from './data.js';
import { blankPo } from './purchase.js';
import { go } from './main.js';

const canCreateProducts = () => session.can('POS_MANAGE') || session.can('CREATE_STOCK_CHECK') || session.can('EDIT_TEMPLATE');
const platformName = (id) => PLATFORMS[id]?.label || id;
const DEFAULT_CNY = 650_000; // RM 0.65 per yuan: only a starting point, shown and editable.

export function render(main) {
  if (!canBuy()) { mount(main, head(t('whOnline')), h('p', { class: 'muted' }, t('whNoBuyPermission'))); return null; }
  let earlier = [];
  loadPurchaseOrders().then((pos) => { earlier = pos; }).catch(() => {});

  const paste = h('textarea', { rows: 8, placeholder: t('whOnlinePasteHint'), 'aria-label': t('whOnlinePaste') });
  const result = h('div');
  const status = h('p', { class: 'muted', style: { margin: 0 } });
  const fromShots = async (files) => {
    const images = [...files].filter((f) => f.type.startsWith('image/')).slice(0, 4);
    if (!images.length) return;
    status.textContent = t('whOnlineReading');
    try {
      const order = await readScreenshots(images);
      status.textContent = '';
      review(result, order, earlier);
    } catch (err) {
      status.textContent = `${t('whOnlineShotFail')} ${err.message || err}`;
    }
  };
  const shots = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, 'data-act': 'pdd-shots', onchange: (e) => fromShots(e.target.files) });
  // A screenshot pasted into the box is read the same as one picked.
  paste.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); fromShots(files); }
  });

  mount(main,
    head(t('whOnline')),
    h('p', { class: 'muted' }, t('whOnlineHelp')),
    h('div', { class: 'card', style: { display: 'grid', gap: '10px' } },
      h('div', { class: 'row', style: { flexWrap: 'wrap' } },
        h('button', { type: 'button', class: 'primary', 'data-act': 'pdd-shot', onclick: () => shots.click() }, icon('camera', 18), t('whOnlineShot')),
        h('span', { class: 'muted' }, t('whOnlineShotHelp')), shots),
      status,
      h('label', { class: 'field' }, t('whOnlinePaste'), paste),
      h('details', { class: 'muted' }, h('summary', {}, t('whOnlineHowCopy')), h('p', {}, t('whOnlineCopyPdd'))),
      h('div', { class: 'row' },
        h('button', { type: 'button', onclick: () => { paste.value = ''; mount(result); } }, t('clear')),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', 'data-act': 'pdd-read', onclick: () => review(result, parseOrderText(paste.value, { platform: 'pdd' }), earlier) }, icon('check', 18), t('whOnlineRead')))),
    result);
  return null;
}

/** Step 2: the order as read, every field editable, then saved as a purchase order. */
function review(box, order, earlier) {
  const memory = memoryFrom(earlier.filter((p) => p.onlinePlatform));
  const lines = order.lines.map((l) => {
    const m = matchProduct(`${l.title} ${l.variation}`, session.products, memory) || matchProduct(l.title, session.products, memory);
    return { ...l, barcode: m?.barcode || '', how: m?.how || '', skip: false };
  });
  const st = {
    platform: 'pdd', orderNo: order.orderNo, trackingNo: order.trackingNo, currency: order.currency,
    rate: order.currency === 'MYR' ? RATE_ONE : (local.get('wh.fx.CNY') || DEFAULT_CNY),
    shipping: order.shippingCents, spread: true,
    branchId: myPlaces().some((p) => p.id === session.branchId) ? session.branchId : (myPlaces()[0]?.id ?? ''),
  };

  const cents = (c) => (st.currency === 'MYR' ? formatSen(c) : `¥${formatSen(c)}`);
  const linesBox = h('div', { class: 'wh-lines' });
  const totals = h('div', { class: 'card wh-online-total' });

  const orderNo = h('input', { value: st.orderNo, oninput: (e) => { st.orderNo = e.target.value.trim(); dupCheck(); } });
  const tracking = h('input', { value: st.trackingNo, oninput: (e) => { st.trackingNo = e.target.value.trim(); } });
  const rateInput = h('input', { inputmode: 'decimal', value: formatRate(st.rate), style: { width: '110px' }, onchange: (e) => {
    const r = parseRate(e.target.value);
    if (!r) { toast(t('errAmount'), 'error'); e.target.value = formatRate(st.rate); return; }
    st.rate = r; local.set('wh.fx.CNY', r); draw();
  } });
  const rateRow = h('label', { class: 'field' }, t('whOnlineRate'), h('div', { class: 'row' }, h('span', {}, '¥1 = RM'), rateInput));
  const currencySel = h('select', { onchange: (e) => {
    st.currency = e.target.value;
    if (st.currency === 'MYR') st.rate = RATE_ONE; else st.rate = local.get('wh.fx.CNY') || DEFAULT_CNY;
    rateInput.value = formatRate(st.rate); draw();
  } }, [['MYR', 'RM (MYR)'], ['CNY', '¥ (CNY / RMB)']].map(([v, l]) => h('option', { value: v, selected: v === st.currency }, l)));
  const shipping = h('input', { inputmode: 'decimal', value: formatSen(st.shipping), onchange: (e) => {
    const c = parseSen(e.target.value); if (c == null || c < 0) { e.target.value = formatSen(st.shipping); return; }
    st.shipping = c; draw();
  } });
  const spread = h('input', { type: 'checkbox', checked: st.spread, onchange: (e) => { st.spread = e.target.checked; draw(); } });
  const branch = h('select', { onchange: (e) => { st.branchId = e.target.value; } },
    myPlaces().map((p) => h('option', { value: p.id, selected: p.id === st.branchId }, p.name)));
  const dupNote = h('div');
  const dupCheck = () => {
    const d = duplicateOf(earlier, st.platform, st.orderNo);
    mount(dupNote, d ? h('div', { class: 'card warn-box', style: { borderColor: 'var(--warn)' } },
      `${t('whOnlineDuplicate')} ${d.poNo} `, h('a', { href: `#/purchase/${d.id}` }, `${t('whOnlineOpen')} →`)) : null);
  };

  const used = () => lines.filter((l) => !l.skip);
  const draw = () => {
    rateRow.style.display = st.currency === 'MYR' ? 'none' : '';
    const keep = used();
    const costs = landedCosts(keep, { currency: st.currency, rateMicro: st.rate, shippingCents: st.shipping, spreadShipping: st.spread });
    const costOf = new Map(keep.map((l, i) => [l, costs[i]]));
    mount(linesBox, lines.length ? lines.map((l, i) => {
      // A product made a moment ago may not be in the live list yet.
      const p = l.barcode ? (session.find(l.barcode) || l.made || null) : null;
      const pick = productBox({ autofocus: false, placeholder: t('whOnlinePickProduct'), onPick: (x) => { l.barcode = x.barcode; l.how = 'picked'; draw(); } });
      return h('div', { class: `wh-line po wh-online-line${l.skip ? ' skipped' : ''}` },
        h('div', { class: 'muted', style: { fontSize: '13px' } }, `${platformName(st.platform)} · ${l.title}${l.variation ? ` · ${l.variation}` : ''}`),
        p ? h('div', { class: 'row' }, h('strong', { class: 'grow' }, p.name || p.barcode), h('span', { class: 'muted' }, p.barcode),
          l.how === 'guess' ? pill(t('whOnlineGuess'), 'warn') : l.how === 'memory' ? pill(t('whOnlineRemembered'), 'good') : null,
          h('button', { type: 'button', class: 'ghost', onclick: () => { l.barcode = ''; l.how = ''; draw(); } }, t('whOnlineChange')))
          : l.skip ? null : h('div', {}, pick,
            canCreateProducts() ? h('button', { type: 'button', style: { marginTop: '6px' }, onclick: () => newProduct(l, st, costOf.get(l), draw) }, icon('plus', 16), t('whOnlineNewProduct')) : null),
        h('div', { class: 'wh-po-fields' },
          h('label', { class: 'field' }, t('quantity'), h('input', { inputmode: 'numeric', value: String(l.qty), disabled: l.skip, onchange: (e) => {
            const q = Math.floor(Number(e.target.value)); if (q > 0) l.qty = q; draw();
          } })),
          h('label', { class: 'field' }, `${t('whOnlinePrice')} (${st.currency === 'MYR' ? 'RM' : '¥'})`, h('input', { inputmode: 'decimal', value: formatSen(l.priceCents), disabled: l.skip, onchange: (e) => {
            const c = parseSen(e.target.value); if (c != null && c >= 0) l.priceCents = c; draw();
          } })),
          h('div', { class: 'field' }, t('whOnlineCostEach'), h('strong', { style: { paddingTop: '9px' } }, l.skip ? '—' : rm(costOf.get(l) || 0))),
          h('label', { class: 'check', title: t('whOnlineSkipHelp') }, h('input', { type: 'checkbox', checked: l.skip, onchange: (e) => { l.skip = e.target.checked; draw(); } }), t('whOnlineSkip'))));
    }) : h('div', { class: 'card' }, h('p', { style: { margin: 0 } }, t('whOnlineNothing'))));

    const goods = keep.reduce((s, l) => s + l.priceCents * l.qty, 0);
    const rmTotal = keep.reduce((s, l) => s + (costOf.get(l) || 0) * l.qty, 0);
    const unmatched = keep.filter((l) => !l.barcode).length;
    mount(totals,
      h('div', { class: 'row' }, h('span', { class: 'grow muted' }, t('whOnlineGoods')), h('strong', {}, cents(goods))),
      h('div', { class: 'row' }, h('span', { class: 'grow muted' }, t('whOnlineShipping')), h('strong', {}, cents(st.shipping))),
      order.totalCents != null ? h('div', { class: 'row' }, h('span', { class: 'grow muted' }, t('whOnlinePaidOnApp')), h('span', {}, cents(order.totalCents))) : null,
      h('div', { class: 'row', style: { fontSize: '18px' } }, h('span', { class: 'grow' }, t('whOnlineTotalRm')), h('strong', {}, rm(rmTotal))),
      unmatched ? h('p', { class: 'muted', style: { margin: '6px 0 0', color: 'var(--warn)' } }, `${unmatched} ${t('whOnlineUnmatched')}`) : null);
  };

  const addLine = productBox({ autofocus: false, placeholder: t('whOnlineAddLine'), onPick: (p) => {
    lines.push({ title: p.name || p.barcode, variation: '', qty: 1, priceCents: 0, barcode: p.barcode, how: 'picked', skip: false });
    draw();
  } });

  const save = () => {
    const keep = used();
    if (!keep.length) return toast(t('errNoLines'), 'error');
    if (keep.some((l) => !l.barcode)) return toast(t('whOnlineMatchAll'), 'error');
    const d = duplicateOf(earlier, st.platform, st.orderNo);
    if (d) return toast(`${t('whOnlineDuplicate')} ${d.poNo}`, 'error');
    const costs = landedCosts(keep, { currency: st.currency, rateMicro: st.rate, shippingCents: st.shipping, spreadShipping: st.spread });
    const now = Date.now();
    const approve = canApprove();
    const po = blankPo(st.branchId, {
      supplierId: `online-${st.platform}`, supplierName: platformName(st.platform),
      source: 'ONLINE', onlinePlatform: st.platform, onlineOrderNo: st.orderNo, trackingNo: st.trackingNo,
      currency: st.currency, fxRateMicro: st.rate, shippingSen: toSen(st.shipping, st.currency, st.rate), shippingInCost: st.spread,
      note: [platformName(st.platform), st.orderNo, st.trackingNo && `${t('whOnlineTracking')} ${st.trackingNo}`].filter(Boolean).join(' · '),
      lines: keep.map((l, i) => {
        const p = session.find(l.barcode) || l.made;
        return { barcode: l.barcode, name: p?.name || l.title, qtyMilli: l.qty * UNIT, costSen: costs[i], sourceTitle: l.title, sourceVariation: l.variation || '', sourcePriceCents: l.priceCents };
      }),
      status: approve ? 'ORDERED' : 'SUBMITTED',
      submittedAt: now, submittedByName: session.name,
      ...(approve ? { approvedAt: now, approvedByUid: session.uid, approvedByName: session.name, orderedAt: now } : {}),
    });
    const batch = writeBatch(db);
    batch.set(doc(db, ws(`purchaseOrders/${po.id}`)), po);
    audit(batch, 'PurchaseOrder', po.id, po.poNo, 'CREATE', { field: 'from', newValue: `online ${st.platform} ${st.orderNo}`.trim() });
    send(batch, approve ? t('whOnlineSavedOrdered') : t('whSubmitted'));
    go('purchase', po.id);
  };

  mount(box,
    h('h2', { style: { marginTop: '18px' } }, t('whOnlineCheck')),
    h('div', { class: 'card wh-head' },
      h('label', { class: 'field' }, t('whDeliverTo'), branch),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('whOnlineOrderNo'), orderNo), h('label', { class: 'field' }, t('whOnlineTracking'), tracking)),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('whOnlineCurrency'), currencySel), rateRow),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, `${t('whOnlineShipping')} (${order.currency === 'MYR' ? 'RM' : '¥'})`, shipping),
        h('label', { class: 'check', style: { alignSelf: 'end' } }, spread, t('whOnlineSpread')))),
    dupNote,
    linesBox,
    h('div', { class: 'wh-scan', style: { marginTop: '8px' } }, addLine),
    totals,
    h('p', { class: 'muted' }, canApprove() ? t('whOnlineAfterSave') : t('whOnlineAfterSubmit')),
    h('div', { class: 'wh-bar' }, h('button', { class: 'primary grow', onclick: save }, icon('receipt', 18), canApprove() ? t('whOnlineSave') : t('whSubmit'))));
  dupCheck();
  draw();
}

/** A product that is not in the list yet, made from the bought item. */
function newProduct(line, st, costSen, redraw) {
  modal((close) => {
    const name = h('input', { value: line.title.replace(/【[^】]*】/g, '').trim().slice(0, 60) });
    const code = h('input', { value: inStoreBarcode(), inputmode: 'numeric' });
    const price = h('input', { inputmode: 'decimal', placeholder: '0.00' });
    const save = h('button', { class: 'primary' }, t('save'));
    save.onclick = async () => {
      const barcode = code.value.trim();
      if (!barcode || barcode.includes('/')) return toast(t('errBarcode'), 'error');
      if (!name.value.trim()) return toast(t('errName'), 'error');
      if (session.find(barcode)) return toast(t('errBarcodeTaken'), 'error');
      const priceSen = price.value.trim() ? parseSen(price.value) : null;
      if (price.value.trim() && priceSen == null) return toast(t('errAmount'), 'error');
      save.disabled = true;
      try {
        const now = Date.now();
        const product = { name: name.value.trim(), sku: '', unit: 'pcs', priceSen, costSen: costSen ?? null, category: '', altBarcodes: [], photoUrl: '', modifierIds: [], trackStock: true, active: true, createdAt: now, updatedAt: now, createdByUid: session.uid };
        await setDoc(doc(db, ws(`products/${barcode}`)), product);
        line.barcode = barcode; line.how = 'picked'; line.made = { ...product, barcode };
        toast(t('saved'), 'ok');
        close();
        redraw();
      } catch (err) {
        save.disabled = false;
        toast(err.message || String(err), 'error');
      }
    };
    return [
      h('h2', {}, t('whOnlineNewProduct')),
      h('p', { class: 'muted' }, `${platformName(st.platform)} · ${line.title}`),
      h('label', { class: 'field' }, t('name'), name),
      h('label', { class: 'field' }, t('whOnlineBarcodeHelp'), code),
      h('label', { class: 'field' }, `${t('price')} (RM)`, price),
      h('div', { class: 'actions' }, h('button', { onclick: close }, t('cancel')), save),
    ];
  });
}


/** A screenshot made small enough to send: at most 1600 pixels a side, as JPEG. */
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { mediaType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] };
}

/** Screenshots of a Pinduoduo order -> the order, read by the API. */
async function readScreenshots(files) {
  const images = await Promise.all(files.map(shrink));
  const res = await fetch(`${API_ORIGIN}/app/read-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify({ images }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A known reason in the page's own language; the server's words otherwise.
    const code = body?.error?.code || (res.status === 429 ? 'BUSY' : res.status === 403 ? 'NO_RIGHT' : '');
    const mine = code && t(`whShotErr_${code}`);
    throw new Error(mine && mine !== `whShotErr_${code}` ? mine : body?.error?.message || res.statusText);
  }
  return body;
}
