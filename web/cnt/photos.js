/**
 * The photos of one count: a damaged carton, the shelf as it was found, the
 * signed delivery note. Taken with the phone's camera or picked from the
 * gallery or the computer, shrunk before upload, kept in the company's own
 * storage folder (workspaces/{ws}/stockChecks/{id}/{photoId}.jpg) under the
 * same record the app writes (PhotoRepository.kt), so the count's photo
 * total and the "needs N photos" rule of a count list count them too.
 *
 * Photos the phone app took stay on that phone (it does not upload them
 * yet); they are listed here with a note saying so rather than left out.
 */
import { collection, db, deleteObject, doc, getDoc, getDownloadURL, increment, onSnapshot, ref, storage, updateDoc, uploadBytes, writeBatch } from '../js/fb.js';
import { confirmBox, dateTime, h, modal, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { session, ws } from '../js/session.js';
import { audit, go } from './main.js';

const MAX_SIDE = 1600;

/** A photo shrunk to at most 1600 px on its long side, as a JPEG. */
async function shrink(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), 'image/jpeg', 0.82));
}

export function render(main, id, params = new URLSearchParams()) {
  let check = null;
  let photos = [];
  let lines = [];
  const checkRef = doc(db, ws(`stockChecks/${id}`));
  const photosCol = collection(db, ws(`stockChecks/${id}/photos`));
  const may = (p) => session.isAdmin || session.can(p);
  const mine = () => check?.createdByUid === session.uid;
  const open = () => check && check.status !== 'LOCKED';
  const mayTake = () => open() && may('TAKE_PHOTO') && (mine() || may('EDIT_ANY_STOCK'));
  const mayChange = () => open() && (may('EDIT_ANY_STOCK') || (mine() && may('EDIT_OWN_STOCK')));

  const head = h('div', { class: 'card cnt-head' });
  const addBox = h('div', {});
  const grid = h('div', { class: 'ph-grid' });
  const caption = h('input', { placeholder: t('phCaptionHint') });
  const linkSel = h('select', {});
  const status = h('p', { class: 'muted ph-status' });

  const upload = async (files) => {
    const list = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
    if (!list.length) return;
    let done = 0;
    for (const file of list) {
      status.textContent = `${t('phUploading')} ${done + 1}/${list.length}…`;
      try {
        const blob = await shrink(file);
        const docRef = doc(photosCol);
        const path = `workspaces/${session.ws}/stockChecks/${id}/${docRef.id}.jpg`;
        await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' });
        const url = await getDownloadURL(ref(storage, path));
        const now = Date.now();
        const batch = writeBatch(db);
        batch.set(docRef, {
          stockCheckId: id, storagePath: path, downloadUrl: url, localPath: '', uploaded: true,
          caption: caption.value.trim(), linkedBarcode: linkSel.value || '', takenAt: now, takenByUid: session.uid, takenByName: session.name,
        });
        batch.update(checkRef, { photoCount: increment(1), updatedAt: now });
        audit(batch, 'Photo', docRef.id, caption.value.trim() || 'Photo', 'CREATE', id);
        await batch.commit();
        done++;
      } catch (err) {
        toast(`${t('phFailed')}: ${err.message || err}`, 'error');
      }
    }
    status.textContent = done ? `${t('phSaved')} ${done}` : '';
    caption.value = '';
  };

  const picker = (capture) => {
    const input = h('input', { type: 'file', accept: 'image/*', ...(capture ? { capture: 'environment' } : { multiple: true }) });
    input.onchange = () => upload(input.files || []);
    input.click();
  };

  const view = (p) => modal((close) => {
    const cap = h('input', { value: p.caption || '', disabled: !mayChange() });
    const linked = lines.find((l) => l.barcode === p.linkedBarcode);
    return [
      p.uploaded && p.downloadUrl ? h('img', { class: 'ph-big', src: p.downloadUrl, alt: p.caption || '' })
        : h('div', { class: 'ph-big ph-none' }, icon('camera', 36), h('p', {}, t('phOnPhone'))),
      h('p', { class: 'muted' }, `${p.takenByName || ''} · ${dateTime(p.takenAt)}`, linked || p.linkedBarcode ? ` · ${linked?.productName || p.linkedBarcode}` : ''),
      h('label', { class: 'field' }, t('phCaption'), cap),
      h('div', { class: 'actions' },
        mayChange() ? h('button', { class: 'danger', 'data-act': 'delete-photo', onclick: async () => {
          if (!await confirmBox(t('phDeleteQ'), t('phDelete'), t('cancel'))) return;
          try {
            const batch = writeBatch(db);
            batch.delete(doc(photosCol, p.id));
            batch.update(checkRef, { photoCount: increment(-1), updatedAt: Date.now() });
            audit(batch, 'Photo', p.id, p.caption || 'Photo', 'DELETE', id);
            await batch.commit();
            // The file goes too; a refusal leaves only an unreachable file behind.
            if (p.storagePath && p.uploaded) deleteObject(ref(storage, p.storagePath)).catch(() => {});
            close();
          } catch (err) { toast(err.message || String(err), 'error'); }
        } }, icon('trash', 17)) : null,
        h('span', { class: 'grow' }),
        h('button', { onclick: close }, t('close')),
        mayChange() ? h('button', { class: 'primary', onclick: async () => {
          try { await updateDoc(doc(photosCol, p.id), { caption: cap.value.trim() }); close(); } catch (err) { toast(err.message || String(err), 'error'); }
        } }, t('save')) : null),
    ];
  }, { wide: true });

  const drawGrid = () => {
    const sorted = [...photos].sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0));
    mount(grid, sorted.length ? sorted.map((p) => {
      const linked = lines.find((l) => l.barcode === p.linkedBarcode);
      return h('button', { class: 'ph-tile', type: 'button', onclick: () => view(p) },
        p.uploaded && p.downloadUrl ? h('span', { class: 'ph-img', style: { backgroundImage: `url("${p.downloadUrl}")` } })
          : h('span', { class: 'ph-img ph-none' }, icon('camera', 26), h('small', {}, t('phOnPhoneShort'))),
        h('span', { class: 'ph-cap' }, p.caption || linked?.productName || p.linkedBarcode || dateTime(p.takenAt)));
    }) : h('div', { class: 'ph-empty' }, icon('camera', 34), h('p', {}, t('phNone'))));
  };

  const drawAdd = () => {
    if (!mayTake()) { mount(addBox, check?.status === 'LOCKED' ? h('p', { class: 'card muted' }, t('cLockedNote')) : null); return; }
    const want = params.get('code') || linkSel.value;
    mount(linkSel, h('option', { value: '' }, t('phNoItem')),
      lines.map((l) => h('option', { value: l.barcode, selected: l.barcode === want }, l.productName || session.find(l.barcode)?.name || l.barcode)));
    mount(addBox, h('div', { class: 'card ph-add' },
      h('div', { class: 'ph-buttons' },
        h('button', { class: 'primary ph-btn', 'data-act': 'take-photo', onclick: () => picker(true) }, icon('camera', 22), t('phTake')),
        h('button', { class: 'ph-btn', 'data-act': 'pick-photo', onclick: () => picker(false) }, icon('download', 20), t('phPick'))),
      h('div', { class: 'row2' }, h('label', { class: 'field' }, t('phCaption'), caption), h('label', { class: 'field' }, t('phLink'), linkSel)),
      status));
  };

  const drawHead = () => {
    if (!check) return;
    mount(head,
      h('div', { class: 'row' }, h('strong', { class: 'grow cnt-ref' }, `${t('cPhotos')} · ${check.refNo}`), h('span', { class: 'pill' }, String(check.photoCount || 0))),
      h('div', { class: 'muted' }, [check.branchName, check.zone, check.templateName].filter(Boolean).join(' · ') || t('phLead')));
  };

  mount(main,
    h('div', { class: 'row cnt-back' }, h('a', { href: `#/c/${id}`, onclick: (e) => { e.preventDefault(); go(`#/c/${id}`); } }, `← ${t('phBack')}`)),
    head, addBox, grid);

  // A count list that asks for photos says how many, right here.
  const offCheck = onSnapshot(checkRef, (snap) => {
    if (!snap.exists()) { mount(main, h('p', { class: 'card' }, t('notFound'))); return; }
    const first = !check;
    check = { ...snap.data(), id };
    drawHead();
    if (first) {
      drawAdd();
      if (check.templateId) getDoc(doc(db, ws(`templates/${check.templateId}`))).then((s) => {
        const tpl = s.data();
        if (tpl?.photoRequired) head.append(h('div', { class: 'cnt-chip soon ph-need' }, t('cNeedPhotos').replace('{n}', tpl.minPhotos || 1)));
      }).catch(() => {});
    }
  }, (err) => mount(main, h('p', { class: 'card' }, `${t('errLoad')}: ${err.message || err}`)));
  const offPhotos = onSnapshot(photosCol, (snap) => { photos = snap.docs.map((d) => ({ ...d.data(), id: d.id })); drawGrid(); }, () => drawGrid());
  const offLines = onSnapshot(collection(db, ws(`stockChecks/${id}/items`)), (snap) => {
    lines = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    if (check) drawAdd();
    drawGrid();
  }, () => {});
  return () => { offCheck(); offPhotos(); offLines(); };
}
