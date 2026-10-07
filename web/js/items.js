/**
 * Items: the product list (shared with the Stock Check app), categories,
 * modifiers and discounts.
 *
 * Products are the same documents the app counts against, keyed by barcode.
 * This page adds what a till needs on top -- price, cost, photo, category,
 * modifiers -- and the app keeps those when it saves a product.
 */
import { db, doc, getDownloadURL, ref, setDoc, storage, updateDoc, uploadBytes, deleteDoc } from './fb.js';
import { confirmBox, h, modal, mount, toast } from './dom.js';
import { t } from './i18n.js';
import { formatSen, inStoreBarcode, parseSen, rm } from './money.js';
import { onChange, session, ws } from './session.js';
import { menuButton } from './main.js';

export function render(main, sub) {
  const pages = { list: itemList, categories: categoryList, modifiers: modifierList, discounts: discountList };
  const draw = () => (pages[sub] || itemList)(main);
  draw();
  return onChange(() => { if (!document.querySelector('.backdrop')) draw(); });
}

function head(title, ...extra) {
  return h('div', { class: 'page-head' }, menuButton(), h('h1', {}, title), h('span', { class: 'grow' }), ...extra);
}

// --------------------------------------------------------------- item list

let itemQuery = '';
let itemCategory = '';

function itemList(main) {
  const searchBox = h('input', {
    type: 'search', placeholder: t('searchProducts'), value: itemQuery, style: { maxWidth: '320px' },
    oninput: (e) => { itemQuery = e.target.value; drawRows(); },
  });
  const catSelect = h('select', {
    style: { width: 'auto' },
    onchange: (e) => { itemCategory = e.target.value; drawRows(); },
  }, h('option', { value: '' }, t('allCategories')),
  session.categories.map((c) => h('option', { value: c.id, selected: itemCategory === c.id }, c.name)),
  h('option', { value: '-', selected: itemCategory === '-' }, t('noCategory')));
  const body = h('tbody');

  function drawRows() {
    const q = itemQuery.trim().toLowerCase();
    const rows = session.products
      .filter((p) => !itemCategory || (itemCategory === '-' ? !p.category : p.category === itemCategory))
      .filter((p) => !q || (p.name || '').toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || a.barcode).localeCompare(b.name || b.barcode));
    mount(body, rows.slice(0, 500).map((p) => h('tr', { class: 'click', onclick: () => editProduct(p) },
      h('td', {}, p.photoUrl ? h('img', { class: 'thumb', src: p.photoUrl, alt: '', loading: 'lazy' }) : h('div', { class: 'thumb' })),
      h('td', {}, h('div', {}, p.name || h('span', { class: 'muted' }, t('noName'))), h('div', { class: 'muted', style: { fontSize: '12px' } }, p.barcode)),
      h('td', {}, session.categories.find((c) => c.id === p.category)?.name || ''),
      h('td', { class: 'num' }, p.priceSen != null ? formatSen(p.priceSen) : '—'),
      h('td', { class: 'num' }, p.costSen != null ? formatSen(p.costSen) : '—'),
      h('td', {}, p.active === false ? h('span', { class: 'pill bad' }, t('inactive')) : ''))));
    if (rows.length > 500) body.append(h('tr', {}, h('td', { colspan: 6, class: 'muted' }, t('showingFirst500'))));
  }
  drawRows();

  mount(main,
    head(t('itemList'), h('button', { class: 'primary', onclick: () => editProduct(null) }, `+ ${t('addItem')}`)),
    h('div', { class: 'row', style: { marginBottom: '12px' } }, searchBox, catSelect,
      h('span', { class: 'muted' }, `${session.products.length} ${t('itemsCount')}`)),
    h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, t('name')), h('th', {}, t('category')), h('th', { class: 'num' }, t('price')), h('th', { class: 'num' }, t('cost')), h('th', {}, ''))),
      body)));
}

/** Shrinks a photo to at most 800 px on its long side, as JPEG. */
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

function editProduct(product) {
  const isNew = !product;
  const p = product || { barcode: '', name: '', unit: 'pcs', active: true, trackStock: true, modifierIds: [] };
  let photoUrl = p.photoUrl || '';
  let photoBlob = null;

  const barcode = h('input', { value: p.barcode, disabled: !isNew, placeholder: t('scanOrType'), autofocus: isNew });
  const name = h('input', { value: p.name || '', autofocus: !isNew });
  const sku = h('input', { value: p.sku || '' });
  const price = h('input', { inputmode: 'decimal', value: p.priceSen != null ? formatSen(p.priceSen) : '', placeholder: t('priceBlankHint') });
  const cost = h('input', { inputmode: 'decimal', value: p.costSen != null ? formatSen(p.costSen) : '' });
  const unit = h('input', { value: p.unit || 'pcs', list: 'units' });
  const category = h('select', {}, h('option', { value: '' }, t('noCategory')),
    session.categories.map((c) => h('option', { value: c.id, selected: p.category === c.id }, c.name)));
  const altCodes = h('input', { value: (p.altBarcodes || []).join(', '), placeholder: t('altBarcodesHint') });
  const track = h('input', { type: 'checkbox', checked: p.trackStock !== false });
  const active = h('input', { type: 'checkbox', checked: p.active !== false });
  const mods = new Set(p.modifierIds || []);
  const preview = h('div', { class: 'tile', style: { width: '140px' } });
  const drawPreview = () => mount(preview, h('div', {
    class: 'pic', style: photoUrl ? { backgroundImage: `url("${photoUrl}")` } : {},
  }, photoUrl ? '' : '📷'));
  drawPreview();
  const fileInput = h('input', {
    type: 'file', accept: 'image/*', class: 'hidden',
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        photoBlob = await shrink(file);
        photoUrl = URL.createObjectURL(photoBlob);
        drawPreview();
      } catch {
        toast(t('errPhoto'), 'error');
      }
    },
  });

  modal((close) => {
    const save = h('button', { class: 'primary' }, t('save'));
    save.onclick = async () => {
      const code = barcode.value.trim();
      if (!code) return toast(t('errBarcode'), 'error');
      if (code.includes('/')) return toast(t('errBarcodeSlash'), 'error');
      if (!name.value.trim()) return toast(t('errName'), 'error');
      if (isNew && session.find(code)) return toast(t('errBarcodeTaken'), 'error');
      const priceSen = price.value.trim() ? parseSen(price.value) : null;
      const costSen = cost.value.trim() ? parseSen(cost.value) : null;
      if ((price.value.trim() && priceSen == null) || (cost.value.trim() && costSen == null)) return toast(t('errAmount'), 'error');
      const alts = altCodes.value.split(/[,\s]+/).map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== code.toLowerCase());
      const clash = alts.find((a) => { const owner = session.find(a); return owner && owner.barcode !== code; });
      if (clash) return toast(`${clash} ${t('errBelongsTo')} ${session.find(clash).name}`, 'error');

      save.disabled = true;
      try {
        let url = p.photoUrl || '';
        if (photoBlob) {
          const path = `workspaces/${session.ws}/products/${encodeURIComponent(code)}-${Date.now()}.jpg`;
          const fileRef = ref(storage, path);
          await uploadBytes(fileRef, photoBlob, { contentType: 'image/jpeg' });
          url = await getDownloadURL(fileRef);
        }
        const now = Date.now();
        const fields = {
          name: name.value.trim(),
          sku: sku.value.trim(),
          unit: unit.value.trim() || 'pcs',
          priceSen,
          costSen,
          category: category.value,
          altBarcodes: alts,
          photoUrl: url,
          modifierIds: [...mods],
          trackStock: track.checked,
          active: active.checked,
          updatedAt: now,
        };
        const target = doc(db, ws(`products/${code}`));
        if (isNew) await setDoc(target, { ...fields, createdAt: now, createdByUid: session.uid });
        else await updateDoc(target, fields);
        toast(t('saved'), 'ok');
        close();
      } catch (err) {
        save.disabled = false;
        toast(err.message || String(err), 'error');
      }
    };
    return [
      h('h2', {}, isNew ? t('addItem') : t('editItem')),
      h('div', { class: 'row', style: { alignItems: 'flex-start' } },
        h('div', { style: { display: 'grid', gap: '6px' } }, preview,
          h('button', { type: 'button', onclick: () => fileInput.click() }, t('choosePhoto')),
          photoUrl ? h('button', { type: 'button', class: 'ghost', onclick: () => { photoUrl = ''; photoBlob = null; p.photoUrl = ''; drawPreview(); } }, t('removePhoto')) : null,
          fileInput),
        h('div', { class: 'grow', style: { display: 'grid', gap: '10px', minWidth: '240px' } },
          h('label', { class: 'field' }, t('barcode'),
            h('div', { class: 'row' }, h('div', { class: 'grow' }, barcode),
              isNew ? h('button', { type: 'button', onclick: () => { barcode.value = inStoreBarcode(); } }, t('generate')) : null)),
          h('label', { class: 'field' }, t('name'), name))),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, t('price'), price),
        h('label', { class: 'field' }, t('cost'), cost),
        h('label', { class: 'field' }, t('category'), category),
        h('label', { class: 'field' }, t('unit'), unit),
        h('label', { class: 'field' }, 'SKU', sku),
        h('label', { class: 'field' }, t('altBarcodes'), altCodes)),
      h('datalist', { id: 'units' }, ['pcs', 'kg', 'g', 'ctn', 'box', 'pack', 'bottle', 'l'].map((u) => h('option', { value: u }))),
      session.modifiers.length ? h('div', { style: { display: 'grid', gap: '6px' } },
        h('h3', { style: { margin: 0 } }, t('itemModifiers')),
        session.modifiers.map((m) => h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: mods.has(m.id), onchange: (e) => (e.target.checked ? mods.add(m.id) : mods.delete(m.id)) }),
          m.name))) : null,
      h('label', { class: 'check' }, track, t('trackStock')),
      h('label', { class: 'check' }, active, t('activeForSale')),
      h('div', { class: 'actions' },
        !isNew ? h('button', {
          class: 'danger',
          onclick: async () => {
            if (!await confirmBox(t('deleteItemQ'), t('delete'), t('cancel'))) return;
            try { await deleteDoc(doc(db, ws(`products/${p.barcode}`))); close(); } catch (err) { toast(err.message, 'error'); }
          },
        }, t('delete')) : null,
        h('span', { class: 'grow' }),
        h('button', { onclick: close }, t('cancel')),
        save),
    ];
  }, { wide: true });
}

// ------------------------------------------------------- lists in pos/{doc}

const newId = () => Math.random().toString(36).slice(2, 10);

async function saveList(name, list) {
  try {
    await setDoc(doc(db, ws(`pos/${name}`)), { list, updatedAt: Date.now() });
    toast(t('saved'), 'ok');
  } catch (err) {
    toast(err.message || String(err), 'error');
  }
}

function categoryList(main) {
  const COLORS = ['#e57373', '#f06292', '#ba68c8', '#7986cb', '#4fc3f7', '#4db6ac', '#81c784', '#dce775', '#ffb74d', '#a1887f', '#90a4ae'];
  const edit = (cat) => {
    const isNew = !cat;
    const c = cat || { id: newId(), name: '', color: COLORS[session.categories.length % COLORS.length] };
    const name = h('input', { value: c.name, autofocus: true });
    let color = c.color;
    const swatches = h('div', { class: 'row' });
    const draw = () => mount(swatches, COLORS.map((col) => h('button', {
      type: 'button', style: { background: col, width: '34px', height: '34px', padding: 0, outline: col === color ? '3px solid var(--text)' : '' },
      onclick: () => { color = col; draw(); },
    })));
    draw();
    modal((close) => [
      h('h2', {}, isNew ? t('addCategory') : t('editCategory')),
      h('label', { class: 'field' }, t('name'), name),
      swatches,
      h('div', { class: 'actions' },
        !isNew ? h('button', { class: 'danger', onclick: async () => { await saveList('categories', session.categories.filter((x) => x.id !== c.id)); close(); } }, t('delete')) : null,
        h('span', { class: 'grow' }),
        h('button', { onclick: close }, t('cancel')),
        h('button', {
          class: 'primary',
          onclick: async () => {
            if (!name.value.trim()) return toast(t('errName'), 'error');
            const next = { ...c, name: name.value.trim(), color };
            await saveList('categories', isNew ? [...session.categories, next] : session.categories.map((x) => (x.id === c.id ? next : x)));
            close();
          },
        }, t('save'))),
    ]);
  };
  mount(main,
    head(t('itemCategories'), h('button', { class: 'primary', onclick: () => edit(null) }, `+ ${t('addCategory')}`)),
    session.categories.length
      ? h('table', { class: 'list' }, h('tbody', {}, session.categories.map((c) => h('tr', { class: 'click', onclick: () => edit(c) },
        h('td', { style: { width: '40px' } }, h('div', { class: 'thumb', style: { background: c.color } })),
        h('td', {}, c.name),
        h('td', { class: 'num muted' }, `${session.products.filter((p) => p.category === c.id).length} ${t('itemsCount')}`)))))
      : h('p', { class: 'muted' }, t('noCategoriesYet')));
}

function modifierList(main) {
  const edit = (mod) => {
    const isNew = !mod;
    const m = mod ? structuredClone(mod) : { id: newId(), name: '', required: false, multiple: true, options: [{ name: '', priceSen: 0 }] };
    const name = h('input', { value: m.name, autofocus: true, placeholder: t('modifierNameHint') });
    const required = h('input', { type: 'checkbox', checked: !!m.required });
    const multiple = h('input', { type: 'checkbox', checked: m.multiple !== false });
    const rows = h('div', { style: { display: 'grid', gap: '8px' } });
    const draw = () => mount(rows, m.options.map((o, i) => h('div', { class: 'row' },
      h('input', { class: 'grow', style: { flex: 1 }, value: o.name, placeholder: t('optionName'), oninput: (e) => { o.name = e.target.value; } }),
      h('input', { style: { width: '110px' }, inputmode: 'decimal', value: o.priceSen ? formatSen(o.priceSen) : '', placeholder: '+0.00', oninput: (e) => { o.priceSen = parseSen(e.target.value) || 0; } }),
      h('button', { type: 'button', class: 'ghost', onclick: () => { m.options.splice(i, 1); draw(); } }, '✕'))),
    h('button', { type: 'button', onclick: () => { m.options.push({ name: '', priceSen: 0 }); draw(); } }, `+ ${t('addOption')}`));
    draw();
    modal((close) => [
      h('h2', {}, isNew ? t('addModifier') : t('editModifier')),
      h('label', { class: 'field' }, t('name'), name),
      rows,
      h('label', { class: 'check' }, required, t('modRequired')),
      h('label', { class: 'check' }, multiple, t('modMultiple')),
      h('div', { class: 'actions' },
        !isNew ? h('button', { class: 'danger', onclick: async () => { await saveList('modifiers', session.modifiers.filter((x) => x.id !== m.id)); close(); } }, t('delete')) : null,
        h('span', { class: 'grow' }),
        h('button', { onclick: close }, t('cancel')),
        h('button', {
          class: 'primary',
          onclick: async () => {
            const options = m.options.map((o) => ({ name: o.name.trim(), priceSen: o.priceSen || 0 })).filter((o) => o.name);
            if (!name.value.trim() || !options.length) return toast(t('errModifier'), 'error');
            const next = { id: m.id, name: name.value.trim(), required: required.checked, multiple: multiple.checked, options };
            await saveList('modifiers', isNew ? [...session.modifiers, next] : session.modifiers.map((x) => (x.id === m.id ? next : x)));
            close();
          },
        }, t('save'))),
    ], { wide: true });
  };
  mount(main,
    head(t('itemModifiers'), h('button', { class: 'primary', onclick: () => edit(null) }, `+ ${t('addModifier')}`)),
    h('p', { class: 'muted' }, t('modifiersHelp')),
    session.modifiers.length
      ? h('table', { class: 'list' }, h('tbody', {}, session.modifiers.map((m) => h('tr', { class: 'click', onclick: () => edit(m) },
        h('td', {}, h('b', {}, m.name)),
        h('td', { class: 'muted' }, m.options.map((o) => o.name + (o.priceSen ? ` (+${formatSen(o.priceSen)})` : '')).join(', '))))))
      : h('p', { class: 'muted' }, t('noModifiersYet')));
}

function discountList(main) {
  const edit = (disc) => {
    const isNew = !disc;
    const d = disc || { id: newId(), name: '', type: 'PCT', pct: 10, valueSen: 0 };
    const name = h('input', { value: d.name, autofocus: true });
    const type = h('select', {}, h('option', { value: 'PCT', selected: d.type === 'PCT' }, t('percent')), h('option', { value: 'AMOUNT', selected: d.type === 'AMOUNT' }, t('amount')));
    const value = h('input', { inputmode: 'decimal', value: d.type === 'PCT' ? String(d.pct) : formatSen(d.valueSen) });
    modal((close) => [
      h('h2', {}, isNew ? t('addDiscount') : t('editDiscount')),
      h('label', { class: 'field' }, t('name'), name),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('type'), type), h('label', { class: 'field' }, t('value'), value)),
      h('div', { class: 'actions' },
        !isNew ? h('button', { class: 'danger', onclick: async () => { await saveList('discounts', session.discounts.filter((x) => x.id !== d.id)); close(); } }, t('delete')) : null,
        h('span', { class: 'grow' }),
        h('button', { onclick: close }, t('cancel')),
        h('button', {
          class: 'primary',
          onclick: async () => {
            const isPct = type.value === 'PCT';
            const pct = Number(value.value);
            const sen = parseSen(value.value);
            if (!name.value.trim() || (isPct ? !(pct > 0 && pct <= 100) : !(sen > 0))) return toast(t('errDiscount'), 'error');
            const next = { id: d.id, name: name.value.trim(), type: type.value, pct: isPct ? pct : 0, valueSen: isPct ? 0 : sen };
            await saveList('discounts', isNew ? [...session.discounts, next] : session.discounts.map((x) => (x.id === d.id ? next : x)));
            close();
          },
        }, t('save'))),
    ]);
  };
  mount(main,
    head(t('itemDiscounts'), h('button', { class: 'primary', onclick: () => edit(null) }, `+ ${t('addDiscount')}`)),
    session.discounts.length
      ? h('table', { class: 'list' }, h('tbody', {}, session.discounts.map((d) => h('tr', { class: 'click', onclick: () => edit(d) },
        h('td', {}, d.name),
        h('td', { class: 'num' }, d.type === 'PCT' ? `${d.pct}%` : rm(d.valueSen))))))
      : h('p', { class: 'muted' }, t('noDiscountsYet')));
}
