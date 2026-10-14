/**
 * Counting one stock check, as the JSOX Barcode Scan phone app counts it
 * (StockCheckScreen.kt, StockCheckViewModel.kt, StockRepository.kt):
 *
 *  - scan with a USB scanner, the camera, an NFC tag, by typing, or by
 *    saying "Milo twelve"; each scan adds the quantity set above the box
 *  - "check each scan" stops after every code to show what was added, and
 *    asks how many to add when a code already on the count comes again
 *  - a line opens to its name, SKU, quantity, unit, expiry date, remark and
 *    the fields its count list (template) asks for, a signature included;
 *    naming an unknown code can add it to the product list
 *  - a count sheet (Excel or CSV) says what should be there; each line then
 *    shows short, over, match or not on the sheet, and expiry problems first
 *  - photos of the count, on their own page (photos.js)
 *  - finish, review, lock, unlock and reopen, each by its own permission;
 *    a count list can demand photos before the count is finished
 *
 * Lines are written exactly as the app writes them, and quantity edits are
 * increments rather than totals, so two people counting the same check
 * never overwrite each other. Edits after a count is finished go in the
 * change history; while counting they are working notes.
 */
import { collection, db, deleteDoc, doc, getDoc, increment, onSnapshot, setDoc, updateDoc, writeBatch } from '../js/fb.js';
import { confirmBox, h, local, modal, mount, toast } from '../js/dom.js';
import { getLang, t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { formatQty, parseQty, UNIT } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { scanWithCamera } from '../js/camera.js';
import { listenForTags, nfcSupported } from '../js/nfc.js';
import {
  counted, daysToExpiry, expectedOf, finding, formatExpiry, inkKey, isInkKey, isSigned, largeVariance, lineFor, parseExpiry, spokenQty, variance,
} from '../js/counting.js';
import { countSheetRows, readCells } from '../js/sheet.js';
import { audit, go, nextRef, statusPill, STATUS_EN } from './main.js';
import { signaturePad } from './sign.js';
import { changeHistory, deleteCounts, duplicateCount, exportCounts, mayDelete, mayExport } from './manage.js';

const OPEN = ['DRAFT', 'IN_PROGRESS'];
const SEARCH_FROM = 8;

/** A change-history entry written on its own, for the edits made after a count is finished. */
export function auditNow(...args) {
  const batch = writeBatch(db);
  audit(batch, ...args);
  batch.commit().catch(() => {});
}

const stamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** The words for a line's finding: "Short 2", "Expires in 5d", "Not on sheet". */
export function findingText(f) {
  switch (f.kind) {
    case 'expired': return t('cfExpired');
    case 'soon': return `${t('cfSoon')} ${f.days}${t('cfDays')}`;
    case 'unlisted': return t('cfUnlisted');
    case 'match': return t('cfMatch');
    case 'short': return `${t('cfShort')} ${formatQty(f.qty)}`;
    case 'over': return `${t('cfOver')} ${formatQty(f.qty)}`;
    default: return '';
  }
}

export function render(main, id) {
  let check = null;
  let lines = [];
  let template = null;
  let templateId = null;
  let nextQty = UNIT;
  let lastId = '';
  let pendingId = '';
  let search = '';
  let stopNfc = null;
  let confirmEach = local.get('cnt.confirmEach', false);
  const checkRef = doc(db, ws(`stockChecks/${id}`));
  const itemsCol = collection(db, ws(`stockChecks/${id}/items`));
  const itemRef = (lineId) => doc(db, ws(`stockChecks/${id}/items/${lineId}`));

  const head = h('div', { class: 'cnt-head card' });
  const banner = h('div', {});
  const pendingBox = h('div', {});
  const scanBox = h('div', { class: 'cnt-scan' });
  const findBox = h('div', {});
  const linesBox = h('div', { class: 'cnt-lines' });
  const totalsBox = h('div', { class: 'cnt-totals' });
  const qtyInput = h('input', { class: 'cnt-qty', inputmode: 'decimal', value: '1', 'aria-label': t('cQtyNext'),
    onchange: () => { const q = parseQty(qtyInput.value); nextQty = q > 0 ? q : UNIT; qtyInput.value = formatQty(nextQty); } });

  const frozen = () => check?.status === 'LOCKED';
  const finished = () => check && !OPEN.includes(check.status);
  const mine = () => check && check.createdByUid === session.uid;
  const mayEdit = () => check && !frozen()
    && (session.isAdmin || session.can('EDIT_ANY_STOCK') || (mine() && session.can('EDIT_OWN_STOCK')));
  const mayAdd = () => check && !frozen()
    && (session.isAdmin || session.can('EDIT_ANY_STOCK') || mine())
    && (session.can('SCAN_BARCODE') || session.can('CREATE_STOCK_CHECK') || session.isAdmin);
  const label = (l) => l.productName || session.find(l.barcode)?.name || l.barcode;
  const fail = (err) => toast(err.message || String(err), 'error');

  // Totals on the check follow the lines; a refusal is cosmetic, never the scan's failure.
  const bump = (itemDelta, qtyDelta) => {
    const patch = { updatedAt: Date.now() };
    if (itemDelta) patch.itemCount = increment(itemDelta);
    if (qtyDelta) patch.totalQuantityMilli = increment(qtyDelta);
    updateDoc(checkRef, patch).catch(() => {});
  };
  const trail = (line, action, extra = {}) => {
    if (finished()) auditNow('StockItem', line.id, label(line), action, id, extra);
  };

  // ---------------------------------------------------------------- writes

  const changeBy = (line, delta) => {
    const now = counted(line);
    const next = Math.max(0, now + delta);
    const applied = next - now;
    if (!applied) return;
    // A line from before weighing has no quantityMilli: its first edit writes the total.
    updateDoc(itemRef(line.id), { quantityMilli: line.quantityMilli == null ? next : increment(applied), updatedAt: Date.now() }).catch(fail);
    bump(0, applied);
    trail(line, 'UPDATE', { field: 'quantity', oldValue: formatQty(now), newValue: `${formatQty(next)} (applied as ${applied > 0 ? '+' : ''}${formatQty(applied)})` });
  };

  const removeLine = (line) => {
    deleteDoc(itemRef(line.id)).catch(fail);
    bump(-1, -counted(line));
    trail(line, 'DELETE', { oldValue: formatQty(counted(line)) });
    if (pendingId === line.id) { pendingId = ''; drawPending(); }
    toast(`${t('cRemoved')} ${label(line)}`);
  };

  /**
   * Counting down to nothing removes a scanned line -- a line at zero says
   * nothing a missing line does not -- but keeps a line the sheet expected:
   * "expected ten, found none" is the finding.
   */
  const adjust = (line, delta) => {
    if (!mayEdit()) return;
    lastId = line.id;
    if (delta < 0 && counted(line) + delta <= 0) {
      if (line.onList) changeBy(line, -counted(line)); else removeLine(line);
      return;
    }
    changeBy(line, delta);
  };
  const setTo = (line, qty) => adjust(line, qty - counted(line));

  const createLine = (code, qty, source) => {
    const product = session.find(code) || session.products.find((p) => (p.name || '').toLowerCase() === code.toLowerCase()) || null;
    const now = Date.now();
    const ref = doc(itemsCol);
    const data = {
      // Filed under the product's own code, so the tin and its carton are one line.
      barcode: product?.barcode || code, productName: product?.name || '', sku: product?.sku || '',
      quantity: 0, quantityMilli: qty, expected: 0, expectedMilli: null, expiresAt: null, onList: false,
      unit: product?.unit || 'pcs', remark: '', fieldValues: {}, source, createdByUid: session.uid, createdAt: now, updatedAt: now,
    };
    setDoc(ref, data).catch(fail);
    // Known at once, not when the database answers: a scanner fires the same
    // code again faster than that, and must add to this line.
    const line = { ...data, id: ref.id };
    lines = [...lines, line];
    bump(1, qty);
    trail(line, 'CREATE', { field: 'quantity', newValue: formatQty(qty) });
    return line;
  };

  /** How much to add to a code already on the count, when each scan is checked. */
  const askHowMany = (line, suggested) => modal((close) => {
    const input = h('input', { inputmode: 'decimal', value: formatQty(suggested), autofocus: true });
    const total = h('p', { class: 'muted' });
    const show = () => { total.textContent = `${t('cNewTotal')}: ${formatQty(counted(line) + (parseQty(input.value) || 0))}`; };
    const ok = () => { const q = parseQty(input.value); if (!(q > 0)) return toast(t('errQty'), 'error'); adjust(line, q); close(); if (confirmEach) { pendingId = line.id; drawPending(); } };
    input.addEventListener('input', show);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    show();
    return [
      h('h2', {}, t('cAlready')), h('p', {}, h('b', {}, label(line))),
      h('p', { class: 'muted' }, `${t('cNow')}: ${formatQty(counted(line))} ${line.unit || ''}`),
      h('label', { class: 'field' }, t('cAddQty'), input), total,
      h('div', { class: 'actions' }, h('button', { onclick: close }, t('cancel')), h('button', { class: 'primary', 'data-act': 'add-more', onclick: ok }, t('cAddBtn'))),
    ];
  }, { onClose: () => scanInput?.focus() });

  const add = (raw, qty = nextQty, source = 'SCAN') => {
    const code = String(raw || '').trim();
    if (!code || !mayAdd()) return;
    const product = session.find(code) || session.products.find((p) => (p.name || '').toLowerCase() === code.toLowerCase()) || null;
    const line = lineFor(lines, code, product);
    if (line) {
      lastId = line.id;
      if (confirmEach) { askHowMany(line, qty); return; }
      adjust(line, qty);
      toast(`${t('cAdded')} ${formatQty(qty)} · ${label(line)}`, 'ok');
    } else {
      const fresh = createLine(code, qty, source);
      lastId = fresh.id;
      if (confirmEach) { pendingId = fresh.id; drawPending(); } else toast(`${t('cAdded')} ${formatQty(qty)} · ${label(fresh)}`, 'ok');
    }
    draw();
  };

  // ----------------------------------------------------------- edit a line

  const editLine = (line) => modal((close) => {
    const editable = mayEdit();
    const name = h('input', { value: line.productName || '', disabled: !editable });
    const sku = h('input', { value: line.sku || '', disabled: !editable });
    const qty = h('input', { inputmode: 'decimal', value: formatQty(counted(line)), disabled: !editable, autofocus: true });
    const unit = h('input', { value: line.unit || 'pcs', maxlength: 8, disabled: !editable });
    const expiry = h('input', { value: formatExpiry(line.expiresAt ?? null), placeholder: '31/12/2027', inputmode: 'numeric', disabled: !editable });
    const expiryNote = h('small', { class: 'muted' }, t('cExpiryHint'));
    expiry.addEventListener('input', () => {
      const bad = expiry.value.trim() && parseExpiry(expiry.value) == null;
      expiryNote.textContent = bad ? t('cExpiryBad') : t('cExpiryHint');
      expiryNote.classList.toggle('bad', !!bad);
    });
    const remark = h('textarea', { rows: 2, disabled: !editable }, line.remark || '');
    const values = { ...(line.fieldValues || {}) };
    // An untouched field shows its default, so a list can pre-fill the usual answer.
    for (const f of template?.fields || []) if (!(f.key in values) && f.defaultValue) values[f.key] = f.defaultValue;
    const fieldInputs = [...(template?.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0)).map((f) => {
      const locked = !editable || (f.lockedForRoleIds || []).includes(session.roleId);
      const title = `${f.label}${f.required ? ' *' : ''}`;
      const note = locked && editable ? h('small', { class: 'muted' }, t('cFieldLocked')) : null;
      if (f.type === 'DROPDOWN') {
        const row = h('div', { class: 'chips-row' });
        const paint = () => mount(row, (f.options || []).map((o) => h('button', {
          type: 'button', class: values[f.key] === o ? 'on' : '', disabled: locked,
          onclick: () => { values[f.key] = values[f.key] === o ? '' : o; paint(); },
        }, o)));
        paint();
        return h('div', { class: 'field' }, title, row, note);
      }
      if (f.type === 'SIGNATURE') {
        const shown = h('small', { class: 'muted' }, values[f.key] || '');
        const pad = signaturePad(values[inkKey(f.key)] || '', { enabled: !locked, onChange: (ink) => {
          values[inkKey(f.key)] = ink;
          values[f.key] = isSigned(ink) ? `${session.name} - ${stamp()}` : '';
          shown.textContent = values[f.key];
        } });
        return h('div', { class: 'field' }, title, pad, shown, note);
      }
      const input = h('input', {
        value: values[f.key] || '', disabled: locked,
        inputmode: f.type === 'NUMBER' ? 'decimal' : f.type === 'DATE' ? 'numeric' : 'text',
        placeholder: f.type === 'DATE' ? '2026-12-31' : '',
        oninput: (e) => { values[f.key] = e.target.value; },
      });
      return h('label', { class: 'field' }, title, input, note);
    });
    const known = !!session.find(line.barcode);
    const toCatalogue = h('input', { type: 'checkbox', checked: !line.productName && !known });
    const catalogueRow = editable && !known && (session.can('CREATE_STOCK_CHECK') || session.can('POS_MANAGE') || session.isAdmin)
      ? h('label', { class: 'check' }, toCatalogue, h('span', {}, t('cToCatalogue'), h('br'), h('small', { class: 'muted' }, `${t('cToCatalogueSub')} ${line.barcode}`))) : null;

    const save = async () => {
      const q = parseQty(qty.value);
      if (q == null || q < 0) return toast(t('errQty'), 'error');
      const exp = expiry.value.trim() ? parseExpiry(expiry.value) : null;
      if (expiry.value.trim() && exp == null) return toast(t('cExpiryBad'), 'error');
      const missing = (template?.fields || []).find((f) => f.required && !(f.lockedForRoleIds || []).includes(session.roleId) && !String(values[f.key] || '').trim());
      if (missing) return toast(`${t('cFieldNeeded')}: ${missing.label}`, 'error');
      const fieldValues = Object.fromEntries(Object.entries(values).filter(([, v]) => String(v || '').trim()));
      const before = counted(line);
      const patch = {
        productName: name.value.trim(), sku: sku.value.trim(), unit: unit.value.trim() || 'pcs', remark: remark.value.trim(),
        expiresAt: exp, fieldValues, quantityMilli: line.quantityMilli == null ? q : increment(q - before), updatedAt: Date.now(),
      };
      try { await updateDoc(itemRef(line.id), patch); } catch (err) { return fail(err); }
      if (q !== before) bump(0, q - before);
      if (finished()) {
        const changes = [['Product', line.productName, patch.productName], ['SKU', line.sku, patch.sku], ['Quantity', formatQty(before), formatQty(q)],
          ['Unit', line.unit, patch.unit], ['Remark', line.remark, patch.remark], ['Expires', formatExpiry(line.expiresAt ?? null), formatExpiry(exp)]];
        const keys = new Set([...Object.keys(line.fieldValues || {}), ...Object.keys(fieldValues)].filter((k) => !isInkKey(k)));
        for (const k of keys) changes.push([k, (line.fieldValues || {})[k], fieldValues[k]]);
        for (const [field, a, b] of changes) if (String(a ?? '') !== String(b ?? '')) trail(line, 'UPDATE', { field, oldValue: a ?? '', newValue: b ?? '' });
      }
      if (toCatalogue.checked && catalogueRow && patch.productName) {
        const now = Date.now();
        setDoc(doc(db, ws(`products/${line.barcode}`)), { name: patch.productName, sku: patch.sku, unit: patch.unit, active: true, trackStock: true, createdAt: now, updatedAt: now, createdByUid: session.uid })
          .then(() => toast(`${t('cSavedToList')} ${patch.productName}`, 'ok'))
          .catch((err) => toast(`${t('cNotSavedToList')}: ${err.message || err}`, 'error'));
      }
      close();
    };
    qty.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    const f = finding(line);
    return [
      h('h2', {}, label(line)),
      h('p', { class: 'muted mono' }, line.barcode, line.onList ? ` · ${t('cExpected')} ${formatQty(expectedOf(line))}` : '', f.kind !== 'none' ? ` · ${findingText(f)}` : ''),
      h('div', { class: 'cnt-form' },
        h('label', { class: 'field' }, t('cProductName'), name),
        h('label', { class: 'field' }, 'SKU', sku),
        h('div', { class: 'row2' }, h('label', { class: 'field' }, t('cSetQty'), qty), h('label', { class: 'field' }, t('cUnit'), unit)),
        h('label', { class: 'field' }, t('cExpiry'), expiry, expiryNote),
        h('label', { class: 'field' }, t('cRemark'), remark),
        fieldInputs.length ? h('div', { class: 'cnt-fields' }, h('div', { class: 'cnt-fields-title' }, template.name), fieldInputs) : null,
        catalogueRow,
        h('a', { class: 'cnt-photo-link', href: `#/p/${id}?code=${encodeURIComponent(line.barcode)}`, onclick: () => close() }, icon('camera', 16), ` ${t('cPhotoOfItem')}`)),
      h('div', { class: 'actions' },
        editable ? h('button', { class: 'danger', 'data-act': 'remove-line', onclick: async () => { if (await confirmBox(t('cRemoveQ'), t('cRemoveLine'), t('cancel'))) { removeLine(line); close(); } } }, icon('trash', 17)) : null,
        h('span', { class: 'grow' }),
        h('button', { onclick: close }, editable ? t('cancel') : t('close')),
        editable ? h('button', { class: 'primary', 'data-act': 'save-line', onclick: save }, t('save')) : null),
    ];
  }, { wide: true });

  // ------------------------------------------------------------- the menu

  const manualEntry = () => modal((close) => {
    const input = h('input', { autofocus: true, autocomplete: 'off' });
    const ok = () => { const v = input.value.trim(); if (!v) return; close(); add(v, nextQty, 'MANUAL'); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    return [h('h2', {}, t('cManual')), h('p', { class: 'muted' }, t('cManualSub')), h('label', { class: 'field' }, t('cManualField'), input),
      h('div', { class: 'actions' }, h('button', { onclick: close }, t('cancel')), h('button', { class: 'primary', onclick: ok }, t('cAddBtn')))];
  });

  const importSheet = () => {
    const picker = h('input', { type: 'file', accept: '.xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      let parsed;
      try { parsed = countSheetRows(await readCells(new Uint8Array(await file.arrayBuffer()))); } catch { return toast(t('cSheetUnreadable'), 'error'); }
      if (!parsed.rows.length) {
        const why = { 'no-header': t('cSheetNoHeader'), 'no-barcode': t('cSheetNoBarcode'), 'no-expected': t('cSheetNoExpected') }[parsed.problems[0]] || t('cSheetEmpty');
        return toast(`${why} ${parsed.headers.length ? `(${parsed.headers.filter(Boolean).join(', ')})` : ''}`, 'error');
      }
      const now = Date.now();
      let created = 0;
      let updated = 0;
      try {
        for (let i = 0; i < parsed.rows.length; i += 400) {
          const batch = writeBatch(db);
          for (const r of parsed.rows.slice(i, i + 400)) {
            const known = session.find(r.barcode);
            const current = lineFor(lines, r.barcode, known);
            if (current) {
              // Already counted: it keeps what was counted and gains the figure.
              batch.update(itemRef(current.id), { expectedMilli: r.expected, onList: true, updatedAt: now });
              updated++;
            } else {
              batch.set(doc(itemsCol), {
                barcode: known?.barcode || r.barcode, productName: r.name || known?.name || '', sku: r.sku || known?.sku || '',
                quantity: 0, quantityMilli: 0, expected: 0, expectedMilli: r.expected, expiresAt: r.expiresAt ?? null, onList: true,
                unit: r.unit || known?.unit || 'pcs', remark: '', fieldValues: {}, source: 'MANUAL', createdByUid: session.uid, createdAt: now, updatedAt: now,
              });
              created++;
            }
          }
          await batch.commit();
        }
        if (created) bump(created, 0);
      } catch (err) { return fail(err); }
      modal((close) => [
        h('h2', {}, t('cSheetDone')),
        h('p', {}, `${t('cSheetNew')}: ${created} · ${t('cSheetUpdated')}: ${updated}`),
        parsed.problems.length ? h('div', {}, h('p', { class: 'muted' }, `${t('cSheetSkipped')} (${parsed.problems.length}):`),
          h('ul', { class: 'cnt-skipped' }, parsed.problems.slice(0, 50).map((p) => h('li', {}, `${t('cSheetLine')} ${p}`)))) : null,
        h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: close }, t('ok'))),
      ]);
    };
    picker.click();
  };

  const setStatus = (target) => {
    const now = Date.now();
    const patch = { status: target, updatedAt: now };
    if (target === 'COMPLETED') patch.completedAt = now;
    else if (target === 'REVIEWED') { patch.reviewedByUid = session.uid; patch.reviewedByName = session.name; } else if (target === 'LOCKED') patch.lockedByUid = session.uid;
    else patch.lockedByUid = null;
    const batch = writeBatch(db);
    batch.update(checkRef, patch);
    audit(batch, 'StockCheck', id, check.refNo, 'STATUS_CHANGE', id, { field: 'status', oldValue: STATUS_EN[check.status], newValue: STATUS_EN[target] });
    batch.commit().catch(fail);
    toast(`${t('cMarked')}: ${t(`cst_${target}`)}`, 'ok');
  };

  const complete = async () => {
    if (template?.photoRequired && (check.photoCount || 0) < (template.minPhotos || 1)) {
      return toast(t('cNeedPhotos').replace('{n}', template.minPhotos || 1), 'error');
    }
    if (!await confirmBox(t('cCompleteQ'), t('cComplete'), t('cancel'), { tone: 'primary' })) return;
    setStatus('COMPLETED');
    if (pendingId) { pendingId = ''; drawPending(); }
  };

  const menu = () => {
    const can = (p) => session.isAdmin || session.can(p);
    const items = [
      mayAdd() ? ['keyboard', t('cManual'), manualEntry, 'manual'] : null,
      ['camera', `${t('cPhotos')} (${check.photoCount || 0})`, () => go(`#/p/${id}`), 'photos'],
      mayAdd() ? [confirmEach ? 'pause' : 'check', confirmEach ? t('cConfirmOn') : t('cConfirmOff'), () => { confirmEach = !confirmEach; local.set('cnt.confirmEach', confirmEach); toast(confirmEach ? t('cConfirmOn') : t('cConfirmOff'), 'ok'); }, 'confirm-each'] : null,
      mayEdit() && (can('EDIT_OWN_STOCK') || can('EDIT_ANY_STOCK')) && can('IMPORT_COUNT_SHEET') ? ['download', t('cImportSheet'), importSheet, 'import-sheet'] : null,
      '-',
      can('MARK_COMPLETED') && check.status !== 'COMPLETED' && !frozen() ? ['check', t('cComplete'), complete, 'finish-menu'] : null,
      can('MARK_REVIEWED') && !frozen() && check.status !== 'REVIEWED' ? ['check', t('cMarkReviewed'), () => setStatus('REVIEWED'), 'review'] : null,
      can('LOCK_STOCK') && !frozen() ? ['lock', t('cLock'), () => setStatus('LOCKED'), 'lock'] : null,
      can('UNLOCK_STOCK') && frozen() ? ['lock', t('cUnlock'), () => setStatus('IN_PROGRESS'), 'unlock'] : null,
      ['COMPLETED', 'REVIEWED'].includes(check.status) && (can('EDIT_OWN_STOCK') || can('EDIT_ANY_STOCK')) ? ['plus', t('cReopen'), () => setStatus('IN_PROGRESS'), 'reopen'] : null,
      '-',
      mayExport() ? ['download', t('cxThis'), () => exportCounts([check]), 'export-this'] : null,
      can('VIEW_AUDIT_LOG') ? ['clock', t('cxHistory'), () => changeHistory(check), 'history'] : null,
      can('DUPLICATE_STOCK') ? ['apps', t('cxDuplicate'), async () => {
        try { const fresh = await duplicateCount(check, nextRef); toast(t('cxDuplicated'), 'ok'); go(`#/c/${fresh}`); } catch (err) { fail(err); }
      }, 'duplicate'] : null,
      mayDelete(check) ? ['trash', t('cxDeleteThis'), async () => { if (await deleteCounts([check])) go('#/'); }, 'delete-count'] : null,
    ].filter(Boolean).filter((it, i, all) => it !== '-' || (i > 0 && all[i - 1] !== '-' && i < all.length - 1));
    modal((close) => [
      h('h2', {}, check.refNo),
      h('div', { class: 'cnt-menu' }, items.map((it) => (it === '-' ? h('hr') : h('button', { 'data-act': it[3], onclick: () => { close(); it[2](); } }, icon(it[0], 18), it[1])))),
    ]);
  };

  // -------------------------------------------------------------- drawing

  const drawPending = () => {
    const line = lines.find((l) => l.id === pendingId);
    if (!line || !confirmEach) { mount(pendingBox); return; }
    const may = (session.isAdmin || session.can('MARK_COMPLETED')) && !frozen();
    mount(pendingBox, h('div', { class: 'cnt-confirm card', 'data-code': line.barcode },
      h('div', { class: 'muted' }, t('cJustScanned')),
      h('div', { class: 'row' }, h('strong', { class: 'grow' }, label(line)), h('span', { class: 'muted mono' }, line.barcode)),
      h('div', { class: 'row' },
        h('button', { class: 'icon-btn', 'aria-label': '-1', onclick: () => adjust(line, -UNIT) }, icon('minus', 18)),
        h('span', { class: 'cnt-n' }, formatQty(counted(line))),
        h('button', { class: 'icon-btn', 'aria-label': '+1', onclick: () => adjust(line, UNIT) }, icon('plus', 18)),
        h('button', { onclick: () => editLine(line) }, t('cEdit')),
        h('span', { class: 'grow' }),
        may ? h('button', { onclick: () => { pendingId = ''; drawPending(); complete(); } }, t('cComplete')) : null,
        h('button', { class: 'primary', 'data-act': 'continue', onclick: () => { pendingId = ''; drawPending(); scanInput?.focus(); } }, t('cContinue')))));
  };

  const chip = (f) => (f.kind === 'none' ? null : h('span', { class: `cnt-chip ${f.kind}` }, findingText(f)));

  const drawLines = () => {
    const needle = search.trim().toLowerCase();
    const sorted = [...lines].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const shown = needle ? sorted.filter((l) => [l.productName, l.barcode, l.sku, session.find(l.barcode)?.name].some((x) => String(x || '').toLowerCase().includes(needle))) : sorted;
    const edit = mayEdit();
    mount(linesBox, !lines.length ? h('p', { class: 'muted cnt-empty' }, t('cNoLines'))
      : !shown.length ? h('p', { class: 'muted cnt-empty' }, `${t('cNoMatch')} "${search.trim()}"`)
        : shown.map((l) => {
          const name = l.productName || session.find(l.barcode)?.name;
          const photo = session.find(l.barcode)?.photoUrl;
          const f = finding(l);
          return h('div', { class: `cnt-line${l.id === lastId ? ' last' : ''}${largeVariance(l) ? ' flag' : ''}`, 'data-code': l.barcode },
            photo ? h('span', { class: 'cnt-thumb', style: { backgroundImage: `url("${photo}")` } }) : null,
            h('button', { class: 'cnt-line-main', type: 'button', onclick: () => editLine(l) },
              h('strong', {}, name || t('cUnknown')),
              h('span', { class: 'muted mono' }, l.barcode, l.unit && l.unit !== 'pcs' ? ` · ${l.unit}` : '', l.onList ? ` · ${t('cExpected')} ${formatQty(expectedOf(l))}` : ''),
              h('span', { class: 'cnt-chips' }, chip(f), largeVariance(l) ? h('span', { class: 'cnt-chip review' }, t('cfReview')) : null,
                l.remark ? h('span', { class: 'cnt-chip note' }, l.remark) : null)),
            !name && edit && (session.can('CREATE_STOCK_CHECK') || session.can('POS_MANAGE') || session.isAdmin)
              ? h('button', { class: 'ghost', onclick: () => editLine(l) }, t('cNameIt')) : null,
            edit ? h('button', { class: 'icon-btn', 'aria-label': '-1', onclick: () => adjust(l, -UNIT) }, icon('minus', 18)) : null,
            h(edit ? 'button' : 'span', { class: 'cnt-n', ...(edit ? { onclick: () => quickQty(l) } : {}) }, formatQty(counted(l))),
            edit ? h('button', { class: 'icon-btn', 'aria-label': '+1', onclick: () => adjust(l, UNIT) }, icon('plus', 18)) : null);
        }));
  };

  /** Tapping the number: just the quantity, quickly. */
  const quickQty = (line) => modal((close) => {
    const input = h('input', { inputmode: 'decimal', value: formatQty(counted(line)), autofocus: true });
    const save = () => { const q = parseQty(input.value); if (q == null || q < 0) return toast(t('errQty'), 'error'); setTo(line, q); close(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    return [
      h('h2', {}, label(line)), h('p', { class: 'muted' }, line.barcode),
      h('label', { class: 'field' }, t('cSetQty'), input),
      h('div', { class: 'actions' },
        h('button', { onclick: () => { close(); editLine(line); } }, t('cMore')),
        h('span', { class: 'grow' }),
        h('button', { onclick: close }, t('cancel')),
        h('button', { class: 'primary', onclick: save }, t('save'))),
    ];
  });

  const drawFind = () => {
    if (lines.length < SEARCH_FROM) { mount(findBox); return; }
    if (findBox.firstChild) return;
    mount(findBox, h('div', { class: 'search-box cnt-find' }, icon('search', 18),
      h('input', { placeholder: t('cFind'), value: search, oninput: (e) => { search = e.target.value; drawLines(); } })));
  };

  const drawTotals = () => {
    const total = lines.reduce((s, l) => s + counted(l), 0);
    const unnamed = lines.filter((l) => !l.productName && !session.find(l.barcode)?.name).length;
    const off = lines.filter((l) => l.onList && variance(l) !== 0).length;
    const review = lines.filter(largeVariance).length;
    const expired = lines.filter((l) => (daysToExpiry(l.expiresAt ?? null) ?? 1) < 0).length;
    const onList = lines.some((l) => l.onList);
    const cell = (n, key, tone = '', href = '') => h(href ? 'a' : 'div', { class: `cnt-total ${tone}`, ...(href ? { href } : {}) }, h('b', {}, String(n)), h('span', {}, t(key)));
    mount(totalsBox,
      cell(lines.length, 'cItems'), cell(formatQty(total), 'cTotal'), cell(check?.photoCount || 0, 'cPhotosN', '', `#/p/${id}`),
      unnamed ? cell(unnamed, 'cUnnamed', 'warn') : null,
      onList ? cell(off, 'cOff', off ? 'warn' : '') : null,
      review ? cell(review, 'cToReview', 'bad') : null,
      expired ? cell(expired, 'cExpiredN', 'bad') : null);
  };

  const drawHead = () => {
    if (!check) return;
    const mayFinish = !frozen() && check.status !== 'COMPLETED' && check.status !== 'REVIEWED' && (session.isAdmin || session.can('MARK_COMPLETED'));
    mount(head,
      h('div', { class: 'row' },
        h('strong', { class: 'grow cnt-ref' }, [check.refNo, check.branchName, check.zone].filter(Boolean).join(' · ')),
        statusPill(check.status),
        h('button', { class: 'icon-btn', 'data-act': 'menu', title: t('cMenu'), 'aria-label': t('cMenu'), onclick: menu }, icon('menu', 18))),
      check.templateName || check.note ? h('div', { class: 'muted' }, [check.templateName, check.note].filter(Boolean).join(' · ')) : null,
      h('div', { class: 'row', style: { marginTop: '6px' } },
        h('a', { class: 'btn-link cnt-photos-btn', href: `#/p/${id}`, 'data-act': 'photos' }, icon('camera', 17), `${t('cPhotos')} · ${check.photoCount || 0}`),
        h('span', { class: 'grow muted' }, check.reviewedByName ? `${t('cReviewedBy')} ${check.reviewedByName}` : ''),
        mayFinish ? h('button', { class: 'primary', 'data-act': 'finish', onclick: complete }, icon('check', 18), t('cComplete')) : null,
        finished() && session.has('warehouse') ? h('a', { href: `/warehouse/#/variance/${id}` }, `${t('cDiff')} →`) : null));
    mount(banner, frozen() ? h('p', { class: 'card muted cnt-note' }, icon('lock', 16), ' ', t('cLockedNote'))
      : finished() ? h('p', { class: 'card muted cnt-note' }, t('cFinishedNote')) : null);
  };

  let scanInput = null;
  const voiceBtn = () => {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec || !(session.isAdmin || session.can('VOICE_INPUT'))) return null;
    return h('button', { type: 'button', class: 'icon-btn', title: t('cVoice'), 'aria-label': t('cVoice'), onclick: () => {
      const rec = new Rec();
      rec.lang = { zh: 'zh-CN', ms: 'ms-MY' }[getLang()] || 'en-MY';
      rec.onresult = (e) => {
        const heard = e.results[0][0].transcript;
        const q = spokenQty(heard);
        if (q == null) return toast(`${t('cNotHeard')} (${heard})`, 'error');
        // "Milo twelve": a product and a quantity sets that product's count.
        const words = heard.replace(/\d+(?:[.,]\d+)?|[零〇一二两三四五六七八九十百千]+|pcs|个|件|包|箱/gi, '').trim().toLowerCase();
        const product = words.length >= 2 ? session.products.find((p) => (p.name || '').toLowerCase().includes(words)) : null;
        if (product) {
          const line = lineFor(lines, product.barcode, product);
          if (line) setTo(line, q); else add(product.barcode, q, 'VOICE');
          return toast(`${product.name}: ${formatQty(q)}`, 'ok');
        }
        // A bare number sets the line just scanned, or else what each scan adds.
        const focused = lines.find((l) => l.id === lastId);
        if (focused && mayEdit()) { setTo(focused, q); return toast(`${label(focused)}: ${formatQty(q)}`, 'ok'); }
        nextQty = q;
        qtyInput.value = formatQty(q);
        toast(`${t('cHeard')}: ${formatQty(q)}`, 'ok');
      };
      rec.onerror = () => toast(t('cNotHeard'), 'error');
      rec.start();
    } }, icon('mic', 20));
  };

  const nfcBtn = () => {
    if (!nfcSupported()) return null;
    const btn = h('button', { type: 'button', class: 'icon-btn', title: 'NFC', onclick: async () => {
      if (stopNfc) { stopNfc(); stopNfc = null; btn.classList.remove('primary'); return; }
      try { stopNfc = await listenForTags((tag) => add(tag)); btn.classList.add('primary'); toast(t('nfcOn'), 'ok'); } catch (err) { toast(`${t('nfcError')}: ${err.message || err}`, 'error'); }
    } }, icon('nfc', 20));
    return btn;
  };

  const drawScan = () => {
    if (!mayAdd()) { mount(scanBox); scanInput = null; return; }
    scanInput = h('input', { class: 'scan big', placeholder: t('cScan'), autocomplete: 'off', autofocus: true, list: 'cnt-products',
      onkeydown: (e) => { if (e.key !== 'Enter') return; e.preventDefault(); add(scanInput.value); scanInput.value = ''; } });
    mount(scanBox,
      h('div', { class: 'scanwrap' },
        h('div', { class: 'search-box' }, icon('barcode', 22), scanInput),
        h('button', { type: 'button', class: 'icon-btn cnt-cam', title: t('scanCamera'), onclick: async () => { const c = await scanWithCamera(); if (c) add(c); scanInput?.focus(); } }, icon('camera', 20))),
      h('div', { class: 'cnt-qtyrow' }, h('span', { class: 'muted' }, t('cQtyNext')), qtyInput, voiceBtn(), nfcBtn()),
      h('datalist', { id: 'cnt-products' }, session.products.filter((p) => p.active !== false).slice(0, 3000).map((p) => h('option', { value: p.name || p.barcode }, p.barcode))));
    scanInput.focus();
  };

  const draw = () => { drawHead(); drawFind(); drawLines(); drawTotals(); drawPending(); };

  mount(main,
    h('div', { class: 'row cnt-back' }, h('a', { href: '#/', onclick: (e) => { e.preventDefault(); go('#/'); } }, `← ${t('cTitle')}`)),
    head, banner, pendingBox, scanBox, findBox, linesBox, totalsBox);

  let scanDrawn = '';
  const offCheck = onSnapshot(checkRef, (snap) => {
    if (!snap.exists()) { mount(main, h('p', { class: 'card' }, t('notFound'))); return; }
    check = { ...snap.data(), id };
    if (check.templateId !== templateId) {
      templateId = check.templateId;
      template = null;
      if (templateId) getDoc(doc(db, ws(`templates/${templateId}`))).then((s) => { template = s.exists() ? { ...s.data(), id: s.id } : null; }).catch(() => {});
    }
    const key = `${check.status}|${mayAdd()}`;
    if (scanDrawn !== key) { scanDrawn = key; drawScan(); }
    draw();
  }, (err) => mount(main, h('p', { class: 'card' }, `${t('errLoad')}: ${err.message || err}`)));
  const offItems = onSnapshot(itemsCol, (snap) => {
    lines = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    draw();
  }, () => {});
  return () => { offCheck(); offItems(); stopNfc?.(); };
}
