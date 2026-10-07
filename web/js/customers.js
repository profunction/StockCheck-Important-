/**
 * Customers and their loyalty points.
 *
 * A customer is attached to a sale at the till; the sale adds to what they
 * have spent and to their points, and points can pay for part of a bill.
 * The rate is set under Settings -> Loyalty.
 */
import { collection, db, doc, getDocs, setDoc, updateDoc, deleteDoc } from './fb.js';
import { confirmBox, dateTime, h, modal, mount, toast } from './dom.js';
import { t } from './i18n.js';
import { formatSen, rm } from './money.js';
import { session, ws } from './session.js';
import { menuButton } from './main.js';
import { scanWithCamera } from './camera.js';
import { normalizeTag, nfcSupported, readOneTag } from './nfc.js';

let cache = null;

/** Every customer, read once per visit to the page or the till's picker. */
export async function loadCustomers(force = false) {
  if (cache && !force) return cache;
  const snap = await getDocs(collection(db, ws('customers')));
  cache = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  return cache;
}

const matches = (c, q) => {
  const text = q.trim().toLowerCase();
  if (!text) return true;
  if ((c.cardIds || []).some((id) => id.toLowerCase() === text || id === normalizeTag(q))) return true;
  return (c.name || '').toLowerCase().includes(text) || (c.phone || '').replace(/\D/g, '').includes(text.replace(/\D/g, '') || '\u0000') ||
    (c.email || '').toLowerCase().includes(text) || (c.code || '').toLowerCase() === text;
};

export function render(main) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  let q = '';
  const draw = (list) => mount(box, list.length
    ? h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, [[t('name')], [t('phone')], [t('points'), 1], [t('visits'), 1], [t('totalSpent'), 1], [t('lastVisit')]].map(([x, n]) => h('th', { class: n ? 'num' : '' }, x)))),
      h('tbody', {}, list.filter((c) => matches(c, q)).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((c) => h('tr', { class: 'click', onclick: () => editCustomer(c, () => refresh()) },
        h('td', {}, c.name), h('td', {}, c.phone || ''), h('td', { class: 'num' }, String(c.points || 0)), h('td', { class: 'num' }, String(c.visits || 0)),
        h('td', { class: 'num' }, formatSen(c.totalSpentSen || 0)), h('td', {}, c.lastVisitAt ? dateTime(c.lastVisitAt) : ''))))))
    : h('p', { class: 'muted' }, t('noCustomersYet')));
  const refresh = async () => {
    try { draw(await loadCustomers(true)); } catch (err) { mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message}`)); }
  };
  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('navCustomers')), h('span', { class: 'grow' }),
      h('button', { class: 'primary', onclick: () => editCustomer(null, refresh) }, `+ ${t('addCustomer')}`)),
    !session.settings.loyaltyEnabled ? h('p', { class: 'muted' }, t('loyaltyOffNote')) : null,
    h('input', { type: 'search', placeholder: t('searchCustomers'), style: { maxWidth: '320px', marginBottom: '12px' }, oninput: (e) => { q = e.target.value; draw(cache || []); } }),
    box);
  refresh();
  return null;
}

/** Add or edit; resolves the saved customer (or null). */
export function editCustomer(existing, onSaved, prefill = {}) {
  const isNew = !existing;
  const c = existing || { name: '', phone: '', email: '', note: '', points: 0, visits: 0, totalSpentSen: 0, ...prefill };
  const name = h('input', { value: c.name, autofocus: true });
  const phone = h('input', { value: c.phone || '', inputmode: 'tel' });
  const email = h('input', { value: c.email || '', type: 'email' });
  const note = h('input', { value: c.note || '' });
  const cards = h('input', { value: (c.cardIds || []).join(', '), placeholder: t('memberCardHint') });
  const addCard = (id) => { if (id) cards.value = [cards.value, id].filter(Boolean).join(', '); };
  const points = h('input', { value: String(c.points || 0), inputmode: 'numeric', disabled: !session.can('POS_MANAGE') });
  return new Promise((resolve) => {
    let saved = null;
    modal((close) => [
      h('h2', {}, isNew ? t('addCustomer') : c.name),
      h('label', { class: 'field' }, t('name'), name),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('phone'), phone), h('label', { class: 'field' }, t('email'), email)),
      h('label', { class: 'field' }, t('note'), note),
      h('label', { class: 'field' }, t('memberCard'), h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        h('div', { class: 'grow', style: { flex: 1 } }, cards),
        h('button', { type: 'button', title: t('scanCamera'), onclick: async () => addCard(await scanWithCamera()) }, '📷'),
        nfcSupported() ? h('button', { type: 'button', title: t('tapNfc'), onclick: async () => addCard(await readOneTag()) }, '📶') : null)),
      !isNew ? h('div', { class: 'grid2' },
        h('label', { class: 'field' }, t('points'), points),
        h('div', { class: 'muted' }, `${t('visits')}: ${c.visits || 0} · ${t('totalSpent')}: ${rm(c.totalSpentSen || 0)}`)) : null,
      h('div', { class: 'actions' },
        !isNew && session.can('POS_MANAGE') ? h('button', {
          class: 'danger',
          onclick: async () => {
            if (!await confirmBox(t('deleteCustomerQ'), t('delete'), t('cancel'))) return;
            try { await deleteDoc(doc(db, ws(`customers/${c.id}`))); close(); onSaved?.(); } catch (err) { toast(err.message, 'error'); }
          },
        }, t('delete')) : null,
        h('span', { class: 'grow' }),
        h('button', { onclick: close }, t('cancel')),
        h('button', {
          class: 'primary',
          onclick: async () => {
            if (!name.value.trim()) return toast(t('errName'), 'error');
            const now = Date.now();
            const fields = {
              name: name.value.trim(), phone: phone.value.trim(), email: email.value.trim(), note: note.value.trim(),
              cardIds: cards.value.split(/[,\s]+/).map((x) => normalizeTag(x)).filter(Boolean),
              updatedAt: now,
            };
            try {
              if (isNew) {
                const ref = doc(collection(db, ws('customers')));
                const data = { ...fields, points: 0, visits: 0, totalSpentSen: 0, createdAt: now, createdByUid: session.uid };
                await setDoc(ref, data);
                saved = { ...data, id: ref.id };
              } else {
                const p = parseInt(points.value, 10);
                if (session.can('POS_MANAGE') && Number.isFinite(p)) fields.points = Math.max(0, p);
                await updateDoc(doc(db, ws(`customers/${c.id}`)), fields);
                saved = { ...c, ...fields };
              }
              cache = null;
              toast(t('saved'), 'ok');
              close();
              onSaved?.(saved);
            } catch (err) {
              toast(err.message || String(err), 'error');
            }
          },
        }, t('save'))),
    ], { onClose: () => resolve(saved) });
  });
}

/** The till's "who is this?" picker. Resolves a customer, or null. */
export async function pickCustomer() {
  let list = [];
  try { list = await loadCustomers(); } catch (err) { toast(err.message, 'error'); }
  return new Promise((resolve) => {
    let chosen = null;
    const results = h('div', { style: { display: 'grid', gap: '6px', maxHeight: '50vh', overflowY: 'auto' } });
    const search = h('input', { type: 'search', placeholder: t('searchCustomers'), autofocus: true });
    const draw = () => {
      const hits = search.value.trim() ? list.filter((c) => matches(c, search.value)).slice(0, 30) : list.slice(0, 30);
      mount(results, hits.map((c) => h('button', {
        style: { textAlign: 'left', display: 'flex', justifyContent: 'space-between' },
        onclick: () => { chosen = c; closeFn(); },
      }, h('span', {}, h('b', {}, c.name), ` ${c.phone || ''}`), h('span', { class: 'muted' }, `${c.points || 0} ${t('points')}`))));
    };
    search.addEventListener('input', draw);
    let closeFn;
    closeFn = modal((close) => {
      closeFn = close;
      return [
        h('h2', {}, t('customer')),
        search,
        results,
        h('div', { class: 'actions' },
          h('button', {
            onclick: async () => {
              // What was typed into the search is most likely the new
              // customer's phone number or name.
              const typed = search.value.trim();
              const made = await editCustomer(null, null, /\d{5,}/.test(typed) ? { phone: typed } : { name: typed });
              if (made) { chosen = made; close(); }
            },
          }, `+ ${t('addCustomer')}`),
          h('span', { class: 'grow' }),
          h('button', { onclick: close }, t('cancel'))),
      ];
    }, { onClose: () => resolve(chosen) });
    draw();
  });
}

/** Points a sale earns: whole ringgit actually paid (not with points) x the rate. */
export function pointsEarned(paidSen) {
  const rate = Number(session.settings.pointsPerRinggit) || 0;
  return Math.max(0, Math.floor((paidSen / 100) * rate));
}

/** What [points] are worth at the till, in sen. */
export function pointsValueSen(points) {
  return Math.floor(points * (Number(session.settings.pointValueSen) || 0));
}
