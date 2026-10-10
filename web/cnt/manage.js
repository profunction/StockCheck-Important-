/**
 * What is done to whole counts rather than to their lines, as the app does
 * it (HistoryScreens.kt, ExportService.kt, StockRepository.kt): export one
 * or several to Excel or CSV with the app's columns, delete them, start a
 * fresh count from one's product list, and read a count's change history.
 */
import { collection, db, doc, getDoc, getDocs, query, where, writeBatch } from '../js/fb.js';
import { confirmBox, dateTime, download, h, modal, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { session, ws } from '../js/session.js';
import { xlsx, XLSX_TYPE } from '../js/xlsx.js';
import { exportRows, fieldColumns, STANDARD, toCsv } from '../js/countexport.js';
import { audit } from './main.js';

const may = (p) => session.isAdmin || session.can(p);
export const mayExport = () => may('VIEW_EXPORT') && (may('EXPORT_EXCEL') || may('EXPORT_CSV'));
export const mayDelete = (c) => (c.status !== 'LOCKED' || may('UNLOCK_STOCK'))
  && (may('DELETE_ANY_STOCK') || (may('DELETE_OWN_STOCK') && c.createdByUid === session.uid));

const itemsOf = async (id) => (await getDocs(collection(db, ws(`stockChecks/${id}/items`)))).docs.map((d) => ({ ...d.data(), id: d.id }));

/** Choose Excel or CSV and download every line of [checks]. */
export function exportCounts(checks) {
  if (!checks.length) return toast(t('cxNothing'), 'error');
  const formats = [may('EXPORT_EXCEL') ? 'xlsx' : null, may('EXPORT_CSV') ? 'csv' : null].filter(Boolean);
  modal((close) => {
    const go = h('button', { class: 'primary', 'data-act': 'do-export' }, icon('download', 17), t('cxDownload'));
    let format = formats[0];
    const choices = h('div', { class: 'seg' }, formats.map((f) => h('button', { type: 'button', class: f === format ? 'on' : '', onclick: (e) => {
      format = f; [...choices.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget));
    } }, f === 'xlsx' ? 'Excel' : 'CSV')));
    go.onclick = async () => {
      go.disabled = true;
      go.textContent = t('loading');
      try {
        const counts = await Promise.all(checks.map(async (check) => ({ check, items: await itemsOf(check.id) })));
        const tplIds = [...new Set(checks.map((c) => c.templateId).filter(Boolean))];
        const templates = (await Promise.all(tplIds.map((id) => getDoc(doc(db, ws(`templates/${id}`))).catch(() => null)))).map((s) => s?.data()).filter(Boolean);
        const rows = exportRows(counts, [...STANDARD, ...fieldColumns(templates)]);
        const name = checks.length === 1 ? checks[0].refNo.replace(/[/\\]/g, '-') : `stock-counts-${new Date().toISOString().slice(0, 10)}`;
        if (format === 'csv') download(`${name}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
        else download(`${name}.xlsx`, xlsx([{ name: 'Stock Check', rows }]), XLSX_TYPE);
        const batch = writeBatch(db);
        for (const c of checks) audit(batch, 'Export', c.id, c.refNo, 'EXPORT', c.id, { newValue: format });
        batch.commit().catch(() => {});
        toast(`${t('cxDone')}: ${rows.length - 1} ${t('cItems')}`, 'ok');
        close();
      } catch (err) {
        toast(err.message || String(err), 'error');
        go.disabled = false;
      }
    };
    return [
      h('h2', {}, `${t('cxTitle')} · ${checks.length}`),
      h('p', { class: 'muted' }, checks.slice(0, 6).map((c) => c.refNo).join(', ') + (checks.length > 6 ? ' …' : '')),
      formats.length > 1 ? choices : h('p', {}, formats[0] === 'csv' ? 'CSV' : 'Excel'),
      h('p', { class: 'muted' }, t('cxColumns')),
      h('div', { class: 'actions' }, h('button', { onclick: close }, t('cancel')), go),
    ];
  });
}

/** Deletes counts with their lines and photo records; returns how many went. */
export async function deleteCounts(checks) {
  const ok = checks.filter(mayDelete);
  if (!ok.length) { toast(t('cxNoDelete'), 'error'); return 0; }
  if (!await confirmBox(t('cxDeleteQ').replace('{n}', ok.length), t('cxDelete'), t('cancel'))) return 0;
  let done = 0;
  for (const c of ok) {
    try {
      // Lines and photos first: deleting a document leaves its subcollections behind.
      for (const sub of ['items', 'photos']) {
        const snap = await getDocs(collection(db, ws(`stockChecks/${c.id}/${sub}`)));
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = writeBatch(db);
          snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      const batch = writeBatch(db);
      batch.delete(doc(db, ws(`stockChecks/${c.id}`)));
      audit(batch, 'StockCheck', c.id, c.refNo, 'DELETE', c.id);
      await batch.commit();
      done++;
    } catch (err) {
      toast(`${c.refNo}: ${err.message || err}`, 'error');
    }
  }
  if (done) toast(`${t('cxDeleted')}: ${done}`, 'ok');
  return done;
}

/**
 * A fresh count of the same products: the lines are copied at zero. It
 * reuses the product list for a new count; it never copies last week's numbers.
 */
export async function duplicateCount(source, newRef) {
  const items = await itemsOf(source.id);
  const now = Date.now();
  const id = doc(collection(db, ws('stockChecks'))).id;
  const check = {
    refNo: await newRef(new Date(now)), templateId: source.templateId || '', templateName: source.templateName || '', status: 'IN_PROGRESS',
    createdByUid: session.uid, createdByName: session.name, createdAt: now, updatedAt: now, completedAt: null,
    reviewedByUid: null, reviewedByName: null, lockedByUid: null, itemCount: items.length, totalQuantity: 0, totalQuantityMilli: 0, photoCount: 0,
    zone: source.zone || '', branchId: source.branchId || '', branchName: source.branchName || '', note: `Duplicated from ${source.refNo}`,
  };
  const first = writeBatch(db);
  first.set(doc(db, ws(`stockChecks/${id}`)), check);
  audit(first, 'StockCheck', id, check.refNo, 'CREATE', id);
  await first.commit();
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    for (const { id: _old, ...it } of items.slice(i, i + 400)) {
      batch.set(doc(collection(db, ws(`stockChecks/${id}/items`))), { ...it, quantity: 0, quantityMilli: 0, createdByUid: session.uid, createdAt: now, updatedAt: now });
    }
    await batch.commit();
  }
  return id;
}

/** Who did what to one count, newest first. */
export function changeHistory(check) {
  modal((close) => {
    const box = h('div', { class: 'cnt-history' }, h('p', { class: 'muted' }, t('loading')));
    getDocs(query(collection(db, ws('auditLog')), where('stockCheckId', '==', check.id))).then((snap) => {
      const rows = snap.docs.map((d) => d.data()).sort((a, b) => (b.at || 0) - (a.at || 0));
      mount(box, rows.length ? rows.map((r) => h('div', { class: 'cnt-history-row' },
        h('div', {}, h('b', {}, r.actorName || ''), ' · ', h('span', { class: 'muted' }, dateTime(r.at))),
        h('div', {}, `${t(`cxA_${r.action}`) || r.action} ${r.entityLabel || ''}`,
          r.field ? h('span', { class: 'muted' }, ` · ${r.field}: ${r.oldValue || '—'} → ${r.newValue || '—'}`) : r.oldValue ? h('span', { class: 'muted' }, ` · ${r.oldValue}`) : null)))
        : h('p', { class: 'muted' }, t('cxNoHistory')));
    }).catch((err) => mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`)));
    return [h('h2', {}, `${t('cxHistory')} · ${check.refNo}`), box, h('div', { class: 'actions' }, h('button', { onclick: close }, t('close')))];
  }, { wide: true });
}

