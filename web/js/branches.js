/**
 * Branches and warehouses: the list in workspaces/{ws}/meta/config, shared
 * by the SuXin Barcode Scan app, the till and the warehouse system. Adding one,
 * closing it or reopening it happens here, for both the till's Settings ->
 * Stores page and the warehouse's Places page. Only an admin may (the
 * database rules say so too), and every change goes in the audit log.
 */
import { collection, db, doc, getDoc, writeBatch } from './fb.js';
import { h, modal, mount, toast } from './dom.js';
import { addStrings, t } from './i18n.js';
import { session, ws } from './session.js';

addStrings({
  en: {
    brAdd: 'Add branch', brName: 'Name', brNameHint: 'e.g. Kedai Ipoh, Central warehouse', brKind: 'Type',
    brKind_STORE: 'Shop', brKind_WAREHOUSE: 'Warehouse', brExists: 'There is already a place with that name.',
    brClose: 'Close', brReopen: 'Reopen', brAdminOnly: 'Only an admin can add or close branches.',
  },
  zh: {
    brAdd: '新增分店', brName: '名字', brNameHint: '例如：Kedai Ipoh、中央仓库', brKind: '类型',
    brKind_STORE: '门店', brKind_WAREHOUSE: '仓库', brExists: '已经有同名的地点。',
    brClose: '关闭', brReopen: '重新开放', brAdminOnly: '只有管理员可以新增或关闭分店。',
  },
  ms: {
    brAdd: 'Tambah cawangan', brName: 'Nama', brNameHint: 'cth. Kedai Ipoh, Gudang pusat', brKind: 'Jenis',
    brKind_STORE: 'Kedai', brKind_WAREHOUSE: 'Gudang', brExists: 'Sudah ada lokasi dengan nama itu.',
    brClose: 'Tutup', brReopen: 'Buka semula', brAdminOnly: 'Hanya admin boleh tambah atau tutup cawangan.',
  },
});

/** The same id rule as the app (Branch.idFor): from the name, so two admins offline make one place, not two. */
export const idFor = (name) => name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

/**
 * Changes branch [id] by [patch], or adds [add] ({ id, name, active, kind }).
 * Returns the new list, or null when nothing was saved (a toast says why).
 */
export async function saveBranch(id, patch, add = null) {
  try {
    const ref = doc(db, ws('meta/config'));
    const snap = await getDoc(ref);
    const branches = [...(snap.data()?.branches || [])];
    if (add) {
      if (branches.some((b) => b.id === add.id || b.name.toLowerCase() === add.name.toLowerCase())) { toast(t('brExists'), 'error'); return null; }
      branches.push(add);
    } else {
      const i = branches.findIndex((b) => b.id === id);
      if (i < 0) { toast(t('notFound'), 'error'); return null; }
      branches[i] = { ...branches[i], ...patch };
    }
    branches.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    const target = add || branches.find((b) => b.id === id);
    const batch = writeBatch(db);
    batch.update(ref, { branches });
    batch.set(doc(collection(db, ws('auditLog'))), {
      stockCheckId: '', entity: 'Branch', entityId: target.id, entityLabel: target.name, action: add ? 'CREATE' : 'UPDATE',
      field: Object.keys(patch || { kind: 1 }).join(','), oldValue: '', newValue: JSON.stringify(patch || add),
      actorUid: session.uid, actorName: session.name, at: Date.now(),
    });
    await batch.commit();
    session.branches = branches;
    toast(t('saved'), 'ok');
    return branches;
  } catch (err) {
    toast(err.message || String(err), 'error');
    return null;
  }
}

/** Asks for a name and a type, then adds the place; [after] redraws. */
export function addBranchDialog(after = () => {}, { kind: startKind = 'STORE' } = {}) {
  // Starter and the standalone packs are one place: the shop itself.
  if (session.plan && !session.plan.multiBranch) { toast(t('planNoBranches'), 'error'); return; }
  const name = h('input', { autofocus: true, placeholder: t('brNameHint') });
  let kind = startKind;
  const seg = h('div', { class: 'seg' });
  const drawSeg = () => mount(seg, ['STORE', 'WAREHOUSE'].map((k) => h('button', {
    type: 'button', class: kind === k ? 'on' : '', 'data-kind': k, onclick: () => { kind = k; drawSeg(); },
  }, t(`brKind_${k}`))));
  drawSeg();
  modal((close) => [
    h('h2', {}, t('brAdd')),
    h('label', { class: 'field' }, t('brName'), name),
    h('div', { class: 'field' }, t('brKind'), seg),
    h('div', { class: 'actions' }, h('button', { onclick: close }, t('cancel')), h('button', {
      class: 'primary', 'data-act': 'branch-save',
      onclick: async () => {
        const n = name.value.trim();
        const id = idFor(n);
        if (!n || !id) { toast(t('errName'), 'error'); return; }
        if (await saveBranch(null, null, { id, name: n, active: true, kind })) { close(); after(); }
      },
    }, t('save'))),
  ]);
}
