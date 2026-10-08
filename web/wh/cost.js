/**
 * The cost calculator: what each item really costs once the shipping, duty
 * and fees are spread over the order -- in ringgit, from any currency -- and
 * the selling price that keeps the margin you want. Start from a purchase
 * order (#/cost/<po id>) or add items by hand. The sums are costcalc.js.
 *
 * Nothing is saved unless the buyer presses "save the costs": that writes
 * each item's new cost (or the average with what is already on hand) to
 * the product, with an audit entry, as the rules allow a buyer to.
 */
import { collection, db, doc, writeBatch } from '../js/fb.js';
import { h, local, modal, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty, formatSen, parseQty, parseSen, rm, UNIT } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { levelsFor, loadStockData } from '../js/stockdata.js';
import { averageCost, CURRENCIES, landedCost, marginOf } from '../js/costcalc.js';
import { audit, canBuy, head, productBox, send } from './common.js';
import { loadPurchaseOrders } from './data.js';

const DRAFT = () => `wh.cost.${session.ws || ''}`;
const blank = () => ({
  currency: 'MYR', rate: '1', by: 'value', margin: '30', poId: '',
  lines: [],
  extras: [{ kind: 'shipping', amount: '' }, { kind: 'duty', amount: '' }, { kind: 'other', amount: '' }],
});

/** Who may write the costs back to the products (firestore.rules says the same). */
const maySave = () => canBuy() || session.can('IMPORT_PRODUCTS') || session.can('EDIT_TEMPLATE');

export function render(main, sub) {
  let st = local.get(DRAFT(), null) || blank();
  const keep = () => local.set(DRAFT(), st);
  const product = (code) => session.products.find((p) => p.barcode === code) || null;

  const linesBox = h('div', { class: 'wh-lines cc-lines' });
  const extrasBox = h('div', { class: 'cc-extras' });
  const out = h('div', { class: 'cc-out' });
  const poPick = h('select', { 'aria-label': t('ccFromPo'), 'data-act': 'cc-po' }, h('option', { value: '' }, t('ccFromPoPick')));

  const num = (v) => { const n = Number(String(v ?? '').replace(/[,\s]/g, '')); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const sums = () => landedCost({
    lines: st.lines.map((l) => ({ qtyMilli: l.qtyMilli, unitPrice: num(l.unitPrice), weightG: num(l.weightKg) * 1000 })),
    rate: num(st.rate), extras: st.extras.map((x) => ({ sen: parseSen(x.amount) || 0 })), by: st.by, marginPct: num(st.margin),
  });

  // --------------------------------------------------------------- settings
  const currency = h('select', { 'data-act': 'cc-currency', onchange: (e) => {
    st.currency = e.target.value;
    st.rate = String(CURRENCIES.find(([c]) => c === st.currency)?.[1] ?? 1);
    rate.value = st.rate;
    rate.disabled = st.currency === 'MYR';
    keep(); drawLines(); drawOut();
  } }, CURRENCIES.map(([c]) => h('option', { value: c, selected: c === st.currency }, t(`ccCur_${c}`))));
  const rate = h('input', { inputmode: 'decimal', value: st.rate, disabled: st.currency === 'MYR', 'data-act': 'cc-rate',
    oninput: (e) => { st.rate = e.target.value; keep(); drawOut(); } });
  const by = h('div', { class: 'seg', role: 'group', 'aria-label': t('ccSpread') });
  const drawBy = () => mount(by, ['value', 'qty', 'weight'].map((k) => h('button', {
    type: 'button', class: st.by === k ? 'on' : '', 'data-by': k, onclick: () => { st.by = k; keep(); drawBy(); drawLines(); drawOut(); },
  }, t(`ccBy_${k}`))));
  const margin = h('input', { inputmode: 'decimal', value: st.margin, 'data-act': 'cc-margin', oninput: (e) => { st.margin = e.target.value; keep(); drawOut(); } });

  // ------------------------------------------------------------------ lines
  const add = (p) => {
    const l = st.lines.find((x) => x.barcode && x.barcode === p.barcode);
    if (l) l.qtyMilli += UNIT;
    else st.lines.push({ barcode: p.barcode, name: p.name || p.barcode, qtyMilli: UNIT, unitPrice: st.currency === 'MYR' && p.costSen != null ? formatSen(p.costSen) : '', weightKg: '' });
    keep(); drawLines(); drawOut();
  };
  const field = (label, input) => h('label', { class: 'field' }, label, input);
  const drawLines = () => {
    mount(linesBox, st.lines.length ? st.lines.map((l, i) => h('div', { class: 'wh-line cc-line', 'data-line': i },
      h('div', { class: 'grow cc-name' },
        l.barcode ? h('strong', {}, l.name) : h('input', { value: l.name, placeholder: t('ccItemName'), oninput: (e) => { l.name = e.target.value; keep(); drawOut(); } }),
        l.barcode ? h('div', { class: 'muted' }, l.barcode) : null),
      field(t('quantity'), h('input', { inputmode: 'decimal', value: formatQty(l.qtyMilli), 'data-f': 'qty',
        onchange: (e) => { const q = parseQty(e.target.value); if (q > 0) l.qtyMilli = q; e.target.value = formatQty(l.qtyMilli); keep(); drawOut(); } })),
      field(t('ccUnitPrice').replace('{c}', st.currency), h('input', { inputmode: 'decimal', value: l.unitPrice, placeholder: '0.00', 'data-f': 'price',
        oninput: (e) => { l.unitPrice = e.target.value; keep(); drawOut(); } })),
      st.by === 'weight' ? field(t('ccWeight'), h('input', { inputmode: 'decimal', value: l.weightKg, placeholder: '0.5', 'data-f': 'weight',
        oninput: (e) => { l.weightKg = e.target.value; keep(); drawOut(); } })) : null,
      h('button', { type: 'button', class: 'ghost icon-btn', 'aria-label': t('remove'), onclick: () => { st.lines.splice(i, 1); keep(); drawLines(); drawOut(); } }, icon('trash', 17))))
      : h('p', { class: 'muted' }, t('ccNoLines')));
  };

  const drawExtras = () => mount(extrasBox, st.extras.map((x, i) => h('div', { class: 'cc-extra' },
    x.kind === 'custom'
      ? h('input', { value: x.label || '', placeholder: t('ccExtraName'), 'aria-label': t('ccExtraName'), oninput: (e) => { x.label = e.target.value; keep(); } })
      : h('span', {}, t(`ccExtra_${x.kind}`)),
    h('input', { inputmode: 'decimal', value: x.amount, placeholder: '0.00', 'aria-label': t(`ccExtra_${x.kind}`), 'data-extra': x.kind,
      oninput: (e) => { x.amount = e.target.value; keep(); drawOut(); } }),
    x.kind === 'custom' ? h('button', { type: 'button', class: 'ghost icon-btn', 'aria-label': t('remove'), onclick: () => { st.extras.splice(i, 1); keep(); drawExtras(); drawOut(); } }, icon('trash', 17)) : h('span'))));

  // ---------------------------------------------------------------- results
  const drawOut = () => {
    if (!st.lines.length) { mount(out); return; }
    const r = sums();
    const bad = parseSen(st.extras.find((x) => (x.amount || '').trim() && parseSen(x.amount) == null)?.amount ?? '0') == null;
    mount(out,
      h('div', { class: 'cards cc-totals' },
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('ccGoods')), h('div', { class: 'value' }, rm(r.goodsSen))),
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('ccExtras')), h('div', { class: 'value' }, rm(r.extraSen)), h('div', { class: 'muted' }, `+${r.extraPct}%`)),
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('ccTotal')), h('div', { class: 'value', 'data-total': r.totalSen }, rm(r.totalSen)))),
      bad ? h('p', { class: 'muted', style: { color: 'var(--danger)' } }, t('ccBadAmount')) : null,
      r.by !== st.by ? h('p', { class: 'muted' }, t('ccFellBack').replace('{by}', t(`ccBy_${r.by}`))) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'list cc-table' },
        h('thead', {}, h('tr', {}, [t('name'), t('ccLanded'), t('ccSuggest'), t('ccPrice'), t('ccMargin'), t('quantity'), t('ccGoodsEach'), t('ccExtraEach'), t('ccNowCost')]
          .map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
        h('tbody', {}, st.lines.map((l, i) => {
          const x = r.lines[i];
          const p = l.barcode ? product(l.barcode) : null;
          const m = p?.priceSen ? marginOf(p.priceSen, x.unitSen) : null;
          const each = (sen) => (l.qtyMilli ? Math.round((sen * UNIT) / l.qtyMilli) : 0);
          return h('tr', { 'data-row': i },
            // The real cost and the price first: on a phone the rest scrolls.
            h('td', { class: 'cc-n' }, l.name || '—'),
            h('td', { class: 'num' }, h('strong', { 'data-unit': x.unitSen }, formatSen(x.unitSen))),
            h('td', { class: 'num' }, x.suggestSen ? h('strong', { style: { color: 'var(--brand)' } }, formatSen(x.suggestSen)) : '—'),
            h('td', { class: 'num' }, p?.priceSen ? formatSen(p.priceSen) : '—'),
            h('td', { class: 'num', style: m != null && m < num(st.margin) ? { color: 'var(--danger)', fontWeight: 650 } : {} }, m == null ? '—' : `${m}%`),
            h('td', { class: 'num' }, formatQty(l.qtyMilli)),
            h('td', { class: 'num' }, formatSen(each(x.goodsSen))),
            h('td', { class: 'num' }, formatSen(each(x.extraSen))),
            h('td', { class: 'num muted' }, p?.costSen != null ? formatSen(p.costSen) : '—'));
        })))),
      h('p', { class: 'muted cc-note' }, t('ccHowItWorks')),
      h('div', { class: 'row', style: { flexWrap: 'wrap' } },
        h('button', { type: 'button', 'data-act': 'cc-copy', onclick: () => copy(r) }, t('ccCopy')),
        maySave() && st.lines.some((l) => l.barcode) ? h('button', { type: 'button', class: 'primary', 'data-act': 'cc-save', onclick: () => save(r) }, icon('check', 18), t('ccSave')) : null));
  };

  // ------------------------------------------------- copy, and save the costs
  const copy = (r) => {
    const text = [
      `${t('whCost')} · ${t(`ccCur_${st.currency}`)}${st.currency === 'MYR' ? '' : ` @ ${st.rate}`}`,
      ...st.lines.map((l, i) => `${l.name} × ${formatQty(l.qtyMilli)}: ${rm(r.lines[i].unitSen)}${r.lines[i].suggestSen ? ` → ${rm(r.lines[i].suggestSen)}` : ''}`),
      `${t('ccGoods')} ${rm(r.goodsSen)} + ${t('ccExtras')} ${rm(r.extraSen)} = ${rm(r.totalSen)}`,
    ].join('\n');
    navigator.clipboard?.writeText(text).then(() => toast(t('ccCopied'), 'ok'), () => toast(text));
  };

  const save = async (r) => {
    let stock = null;
    try { stock = levelsFor(await loadStockData(), 'ALL'); } catch { stock = null; }
    const rows = st.lines.map((l, i) => ({ l, x: r.lines[i], p: l.barcode ? product(l.barcode) : null })).filter((x) => x.p && x.x.unitSen > 0);
    let mode = 'new';
    modal((close) => {
      const list = h('div');
      const after = (row) => {
        if (mode === 'new') return row.x.unitSen;
        const held = stock?.find((s) => s.key === row.p.barcode)?.onHand ?? 0;
        return averageCost(held, row.p.costSen ?? null, row.l.qtyMilli, row.x.unitSen);
      };
      const draw = () => mount(list,
        h('div', { class: 'seg', role: 'group' }, ['new', 'average'].map((k) => h('button', { type: 'button', class: mode === k ? 'on' : '', 'data-mode': k, onclick: () => { mode = k; draw(); } }, t(`ccMode_${k}`)))),
        h('p', { class: 'muted', style: { margin: 0 } }, t(`ccModeHelp_${mode}`)),
        h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
          h('thead', {}, h('tr', {}, [t('name'), t('ccNowCost'), t('ccNewCost')].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
          h('tbody', {}, rows.map((row) => h('tr', {}, h('td', {}, row.p.name || row.p.barcode),
            h('td', { class: 'num muted' }, row.p.costSen != null ? formatSen(row.p.costSen) : '—'), h('td', { class: 'num' }, h('strong', {}, formatSen(after(row))))))))));
      draw();
      return [
        h('h2', { style: { margin: 0 } }, t('ccSave')),
        list,
        h('div', { class: 'actions' },
          h('button', { type: 'button', onclick: close }, t('cancel')),
          h('button', { type: 'button', class: 'primary', 'data-act': 'cc-save-go', onclick: () => {
            const batch = writeBatch(db);
            const now = Date.now();
            for (const row of rows) {
              const cost = after(row);
              batch.update(doc(db, ws(`products/${row.p.barcode}`)), { costSen: cost, updatedAt: now });
              audit(batch, 'Product', row.p.barcode, row.p.name || row.p.barcode, 'UPDATE', { field: 'costSen', oldValue: row.p.costSen != null ? formatSen(row.p.costSen) : '', newValue: formatSen(cost) });
              row.p.costSen = cost;
            }
            send(batch, t('ccSaved'));
            close();
            drawOut();
          } }, t('ccSaveGo'))),
      ];
    }, { wide: true });
  };

  // --------------------------------------------- start from a purchase order
  const fromPo = (po) => {
    st = { ...blank(), currency: 'MYR', rate: '1', by: st.by, margin: st.margin, extras: st.extras, poId: po.id,
      lines: (po.lines || []).map((l) => ({ barcode: l.barcode, name: l.name || l.barcode, qtyMilli: l.qtyMilli || UNIT, unitPrice: formatSen(l.costSen || 0), weightKg: '' })) };
    keep();
    currency.value = 'MYR'; rate.value = '1'; rate.disabled = true;
    drawLines(); drawOut();
  };
  poPick.onchange = () => { const po = pos.find((p) => p.id === poPick.value); if (po) fromPo(po); };
  let pos = [];
  loadPurchaseOrders().then((list) => {
    pos = list.filter((p) => (p.lines || []).length && p.status !== 'CANCELLED');
    mount(poPick, h('option', { value: '' }, t('ccFromPoPick')), pos.slice(0, 60).map((p) => h('option', { value: p.id, selected: p.id === st.poId }, `${p.poNo} · ${p.supplierName || '—'}`)));
    const asked = sub && pos.find((p) => p.id === sub);
    if (asked && st.poId !== asked.id) fromPo(asked);
  }).catch(() => {});

  const scan = productBox({ onPick: add, onUnknown: (code) => { st.lines.push({ barcode: '', name: code, qtyMilli: UNIT, unitPrice: '', weightKg: '' }); keep(); drawLines(); drawOut(); }, autofocus: false });
  mount(main,
    head(t('whCost'),
      h('button', { type: 'button', 'data-act': 'cc-clear', onclick: () => { st = blank(); keep(); render(main, ''); } }, t('ccClear'))),
    h('p', { class: 'muted' }, t('ccHelp')),
    h('div', { class: 'card cc-setup' },
      field(t('ccFromPo'), poPick),
      h('div', { class: 'grid2' }, field(t('ccCurrency'), currency), field(t('ccRate'), rate)),
      field(t('ccSpread'), by),
      field(t('ccWantMargin'), margin)),
    h('h2', {}, t('ccItems')),
    h('div', { class: 'wh-scan' }, scan),
    linesBox,
    h('div', { class: 'row' }, h('button', { type: 'button', 'data-act': 'cc-add-line', onclick: () => { st.lines.push({ barcode: '', name: '', qtyMilli: UNIT, unitPrice: '', weightKg: '' }); keep(); drawLines(); } }, icon('plus', 17), t('ccAddLine'))),
    h('h2', {}, t('ccExtrasTitle')),
    h('p', { class: 'muted', style: { marginTop: 0 } }, t('ccExtrasHelp')),
    extrasBox,
    h('div', { class: 'row' }, h('button', { type: 'button', 'data-act': 'cc-add-extra', onclick: () => { st.extras.push({ kind: 'custom', label: '', amount: '' }); keep(); drawExtras(); } }, icon('plus', 17), t('ccAddExtra'))),
    h('h2', {}, t('ccResult')),
    out);
  drawBy(); drawLines(); drawExtras(); drawOut();
  return null;
}
