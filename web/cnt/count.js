/**
 * Counting one stock check: scan (USB scanner, camera or typing), each scan
 * adding the quantity set above the box -- 1 unless changed, or a weight for
 * goods sold by the kilo -- or say the quantity. Lines are written exactly as
 * the SuXin Barcode Scan app writes them, and edits are increments rather than
 * totals so two people counting the same check never overwrite each other
 * (StockRepository.kt explains why).
 */
import { collection, db, deleteDoc, doc, increment, onSnapshot, setDoc, updateDoc, writeBatch } from '../js/fb.js';
import { confirmBox, h, modal, mount, toast } from '../js/dom.js';
import { getLang, t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { formatQty, parseQty, UNIT } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { scanWithCamera } from '../js/camera.js';
import { counted, lineFor, spokenQty } from '../js/counting.js';
import { audit, go, statusPill } from './main.js';

const OPEN = ['DRAFT', 'IN_PROGRESS'];

export function render(main, id) {
  let check = null;
  let lines = [];
  let nextQty = UNIT;
  let lastKey = '';
  const checkRef = doc(db, ws(`stockChecks/${id}`));
  const itemsCol = collection(db, ws(`stockChecks/${id}/items`));
  const itemRef = (lineId) => doc(db, ws(`stockChecks/${id}/items/${lineId}`));

  const head = h('div', { class: 'cnt-head card' });
  const linesBox = h('div', { class: 'cnt-lines' });
  const scanBox = h('div', { class: 'cnt-scan' });
  const qtyInput = h('input', { class: 'cnt-qty', inputmode: 'decimal', value: '1', 'aria-label': t('cQtyNext'),
    onchange: () => { const q = parseQty(qtyInput.value); nextQty = q > 0 ? q : UNIT; qtyInput.value = formatQty(nextQty); } });

  const mine = () => check && check.createdByUid === session.uid;
  const mayEdit = () => check && OPEN.includes(check.status)
    && (session.isAdmin || session.can('EDIT_ANY_STOCK') || (mine() && session.can('EDIT_OWN_STOCK')));
  const mayAdd = () => check && OPEN.includes(check.status)
    && (session.isAdmin || session.can('EDIT_ANY_STOCK') || mine())
    && (session.can('SCAN_BARCODE') || session.can('CREATE_STOCK_CHECK') || session.isAdmin);

  // Totals on the check follow the lines; a refusal is cosmetic, never the scan's failure.
  const bump = (itemDelta, qtyDelta) => {
    const patch = { updatedAt: Date.now() };
    if (itemDelta) patch.itemCount = increment(itemDelta);
    if (qtyDelta) patch.totalQuantityMilli = increment(qtyDelta);
    updateDoc(checkRef, patch).catch(() => {});
  };

  const add = (raw, qty = nextQty) => {
    const code = String(raw || '').trim();
    if (!code || !mayAdd()) return;
    const product = session.find(code)
      || session.products.find((p) => (p.name || '').toLowerCase() === code.toLowerCase()) || null;
    const line = lineFor(lines, code, product);
    if (line) {
      // A line from before weighing has no quantityMilli: its first edit writes the total.
      updateDoc(itemRef(line.id), { quantityMilli: line.quantityMilli == null ? counted(line) + qty : increment(qty), updatedAt: Date.now() })
        .catch((err) => toast(err.message || String(err), 'error'));
      bump(0, qty);
      lastKey = line.barcode;
    } else {
      const now = Date.now();
      const ref = doc(itemsCol);
      const barcode = product?.barcode || code;
      const data = {
        barcode, productName: product?.name || '', sku: product?.sku || '', quantity: 0, quantityMilli: qty,
        expected: 0, expectedMilli: null, expiresAt: null, onList: false, unit: product?.unit || 'pcs', remark: '',
        fieldValues: {}, source: 'SCAN', createdByUid: session.uid, createdAt: now, updatedAt: now,
      };
      setDoc(ref, data).catch((err) => toast(err.message || String(err), 'error'));
      // Known at once, not when the database answers: a scanner fires the
      // same code again faster than that, and must add to this line rather
      // than start a second one.
      lines = [...lines, { ...data, id: ref.id }];
      bump(1, qty);
      lastKey = barcode;
    }
    toast(`${t('cAdded')} ${formatQty(qty)} · ${product?.name || code}`, 'ok');
  };

  const setLine = (line, newQty) => {
    const delta = newQty - counted(line);
    if (!delta) return;
    updateDoc(itemRef(line.id), { quantityMilli: line.quantityMilli == null ? newQty : increment(delta), updatedAt: Date.now() })
      .catch((err) => toast(err.message || String(err), 'error'));
    bump(0, delta);
  };

  const removeLine = (line) => {
    deleteDoc(itemRef(line.id)).catch((err) => toast(err.message || String(err), 'error'));
    bump(-1, -counted(line));
  };

  const editLine = (line) => modal((close) => {
    const input = h('input', { inputmode: 'decimal', value: formatQty(counted(line)), autofocus: true });
    const save = () => { const q = parseQty(input.value); if (q == null || q < 0) return toast(t('errQty'), 'error'); setLine(line, q); close(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    return [
      h('h2', {}, line.productName || line.barcode),
      h('p', { class: 'muted' }, line.barcode),
      h('label', { class: 'field' }, t('cSetQty'), input),
      h('div', { class: 'actions' },
        h('button', { class: 'danger', onclick: async () => { if (await confirmBox(t('cRemoveQ'), t('cRemoveLine'), t('cancel'))) { removeLine(line); close(); } } }, icon('trash', 17)),
        h('span', { class: 'grow' }),
        h('button', { onclick: close }, t('cancel')),
        h('button', { class: 'primary', onclick: save }, t('save'))),
    ];
  });

  // A barcode nobody named yet: whoever may create products names it here.
  const nameIt = (line) => modal((close) => {
    const name = h('input', { autofocus: true });
    const save = h('button', { class: 'primary' }, t('save'));
    save.onclick = async () => {
      if (!name.value.trim()) return toast(t('errName'), 'error');
      const now = Date.now();
      try {
        await setDoc(doc(db, ws(`products/${line.barcode}`)), { name: name.value.trim(), unit: 'pcs', active: true, trackStock: true, createdAt: now, updatedAt: now, createdByUid: session.uid });
        updateDoc(itemRef(line.id), { productName: name.value.trim(), updatedAt: now }).catch(() => {});
        close();
      } catch (err) { toast(err.message || String(err), 'error'); }
    };
    return [h('h2', {}, t('cNameTitle')), h('p', { class: 'muted' }, line.barcode), h('label', { class: 'field' }, t('name'), name), h('div', { class: 'actions' }, h('button', { onclick: close }, t('cancel')), save)];
  });

  const drawLines = () => {
    const sorted = [...lines].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    mount(linesBox, sorted.length ? sorted.map((l) => {
      const product = session.find(l.barcode);
      const name = l.productName || product?.name;
      return h('div', { class: `cnt-line${l.barcode === lastKey ? ' last' : ''}`, 'data-code': l.barcode },
        h('div', { class: 'grow' },
          h('strong', {}, name || t('cUnknown')),
          h('div', { class: 'muted' }, l.barcode, l.unit && l.unit !== 'pcs' ? ` · ${l.unit}` : '')),
        !name && mayEdit() && (session.can('CREATE_STOCK_CHECK') || session.can('POS_MANAGE') || session.isAdmin)
          ? h('button', { class: 'ghost', onclick: () => nameIt(l) }, t('cNameIt')) : null,
        mayEdit() ? h('button', { class: 'icon-btn', 'aria-label': '-1', onclick: () => setLine(l, Math.max(0, counted(l) - UNIT)) }, icon('minus', 18)) : null,
        h(mayEdit() ? 'button' : 'span', { class: 'cnt-n', ...(mayEdit() ? { onclick: () => editLine(l) } : {}) }, formatQty(counted(l))),
        mayEdit() ? h('button', { class: 'icon-btn', 'aria-label': '+1', onclick: () => setLine(l, counted(l) + UNIT) }, icon('plus', 18)) : null);
    }) : h('p', { class: 'muted' }, t('cNoLines')));
  };

  const voiceBtn = () => {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return null;
    return h('button', { type: 'button', class: 'icon-btn', title: t('cVoice'), 'aria-label': t('cVoice'), onclick: () => {
      const rec = new Rec();
      rec.lang = { zh: 'zh-CN', ms: 'ms-MY' }[getLang()] || 'en-MY';
      rec.onresult = (e) => {
        const heard = e.results[0][0].transcript;
        const q = spokenQty(heard);
        if (q == null) return toast(`${t('cNotHeard')} (${heard})`, 'error');
        nextQty = q;
        qtyInput.value = formatQty(q);
        toast(`${t('cHeard')}: ${formatQty(q)}`, 'ok');
      };
      rec.onerror = () => toast(t('cNotHeard'), 'error');
      rec.start();
    } }, icon('mic', 20));
  };

  const drawScan = () => {
    if (!mayAdd()) { mount(scanBox, OPEN.includes(check?.status) ? null : h('p', { class: 'card muted' }, t('cReadOnly'))); return; }
    const input = h('input', { class: 'scan big', placeholder: t('cScan'), autocomplete: 'off', autofocus: true, list: 'cnt-products',
      onkeydown: (e) => { if (e.key !== 'Enter') return; e.preventDefault(); add(input.value); input.value = ''; } });
    mount(scanBox,
      h('div', { class: 'cnt-qtyrow' }, h('span', { class: 'muted' }, t('cQtyNext')), qtyInput, voiceBtn()),
      h('div', { class: 'scanwrap' },
        h('div', { class: 'search-box' }, icon('barcode', 22), input),
        h('button', { type: 'button', class: 'icon-btn', title: t('scanCamera'), onclick: async () => { const c = await scanWithCamera(); if (c) add(c); input.focus(); } }, icon('camera', 20))),
      h('datalist', { id: 'cnt-products' }, session.products.filter((p) => p.active !== false).slice(0, 3000).map((p) => h('option', { value: p.name || p.barcode }, p.barcode))));
    input.focus();
  };

  const drawHead = () => {
    if (!check) return;
    const total = lines.reduce((s, l) => s + counted(l), 0);
    const mayFinish = OPEN.includes(check.status) && (session.isAdmin || session.can('MARK_COMPLETED'));
    mount(head,
      h('div', { class: 'row' }, h('strong', { class: 'grow', style: { fontSize: '18px' } }, check.refNo), statusPill(check.status)),
      h('div', {}, [check.branchName, check.zone, check.note].filter(Boolean).join(' · ')),
      h('div', { class: 'row', style: { marginTop: '6px' } },
        h('span', { class: 'grow muted' }, `${lines.length} ${t('cItems')} · ${t('cTotal')} ${formatQty(total)}`),
        mayFinish ? h('button', { class: 'primary', 'data-act': 'finish', onclick: async () => {
          if (!await confirmBox(t('cCompleteQ'), t('cComplete'), t('cancel'), { tone: 'primary' })) return;
          const now = Date.now();
          const batch = writeBatch(db);
          batch.update(checkRef, { status: 'COMPLETED', completedAt: now, updatedAt: now });
          audit(batch, 'StockCheck', id, check.refNo, 'STATUS_CHANGE', id, { field: 'status', oldValue: 'In progress', newValue: 'Completed' });
          batch.commit().catch((err) => toast(err.message || String(err), 'error'));
          toast(t('cDone'), 'ok');
        } }, icon('check', 18), t('cComplete')) : null,
        !OPEN.includes(check.status) && session.has('warehouse') ? h('a', { href: `/warehouse/#/variance/${id}` }, `${t('cDiff')} →`) : null));
  };

  mount(main,
    h('div', { class: 'row', style: { marginBottom: '10px' } }, h('a', { href: '#/', onclick: (e) => { e.preventDefault(); go('#/'); } }, `← ${t('cTitle')}`)),
    head, scanBox, linesBox);

  let scanDrawn = '';
  const offCheck = onSnapshot(checkRef, (snap) => {
    if (!snap.exists()) { mount(main, h('p', { class: 'card' }, t('notFound'))); return; }
    check = { ...snap.data(), id };
    drawHead();
    const key = `${check.status}`;
    if (scanDrawn !== key) { scanDrawn = key; drawScan(); }
    drawLines();
  }, (err) => mount(main, h('p', { class: 'card' }, `${t('errLoad')}: ${err.message || err}`)));
  const offItems = onSnapshot(itemsCol, (snap) => {
    lines = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    drawHead();
    drawLines();
  }, () => {});
  return () => { offCheck(); offItems(); };
}
