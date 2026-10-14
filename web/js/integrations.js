/**
 * Integrations: access tokens for the JSOX API, and how to use it.
 *
 * A token is shown once, when it is made. Only its SHA-256 is stored -- as
 * the document id under apiTokens/ -- so nobody who can read the database,
 * us included, can read a token back. The API finds the company by hashing
 * what it is sent.
 */
import { collection, db, deleteDoc, doc, getDocs, query, setDoc, where } from './fb.js';
import { confirmBox, dateTime, h, modal, mount, toast } from './dom.js';
import { t } from './i18n.js';
import { session } from './session.js';
import { menuButton } from './main.js';
import { API_ORIGIN } from './apiorigin.js';

export const API_BASE = `${API_ORIGIN}/v1`;

export function render(main, sub) {
  if (sub === 'api') apiPage(main);
  else tokensPage(main);
  return null;
}

async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `sck_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

function tokensPage(main) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  const load = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'apiTokens'), where('workspaceId', '==', session.ws)));
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => b.createdAt - a.createdAt);
      mount(box, list.length ? h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, [t('name'), t('token'), t('createdBy'), t('date'), t('lastUsed'), ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, list.map((tk) => h('tr', {},
          h('td', {}, tk.name), h('td', { class: 'muted' }, `${tk.prefix}…`), h('td', {}, tk.createdByName || ''),
          h('td', {}, dateTime(tk.createdAt)), h('td', {}, tk.lastUsedAt ? dateTime(tk.lastUsedAt) : '—'),
          h('td', {}, h('button', {
            class: 'danger',
            onclick: async () => {
              if (!await confirmBox(t('revokeTokenQ'), t('revoke'), t('cancel'))) return;
              try { await deleteDoc(doc(db, `apiTokens/${tk.id}`)); load(); } catch (err) { toast(err.message, 'error'); }
            },
          }, t('revoke')))))))
        : h('p', { class: 'muted' }, t('noTokensYet')));
    } catch (err) {
      mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message}`));
    }
  };

  const create = () => {
    const name = h('input', { autofocus: true, placeholder: t('tokenNameHint') });
    modal((close) => [
      h('h2', {}, t('addToken')),
      h('label', { class: 'field' }, t('name'), name),
      h('div', { class: 'actions' },
        h('button', { onclick: close }, t('cancel')),
        h('button', {
          class: 'primary',
          onclick: async () => {
            if (!name.value.trim()) return toast(t('errName'), 'error');
            const token = newToken();
            try {
              await setDoc(doc(db, `apiTokens/${await sha256Hex(token)}`), {
                workspaceId: session.ws, name: name.value.trim(), prefix: token.slice(0, 10),
                createdByUid: session.uid, createdByName: session.name, createdAt: Date.now(),
              });
            } catch (err) {
              return toast(err.message || String(err), 'error');
            }
            close();
            load();
            modal((c2) => [
              h('h2', {}, t('tokenCreated')),
              h('p', { style: { color: 'var(--danger)' } }, t('tokenShownOnce')),
              h('input', { value: token, readonly: true, onfocus: (e) => e.target.select() }),
              h('div', { class: 'actions' },
                h('button', { onclick: () => navigator.clipboard?.writeText(token).then(() => toast(t('copied'), 'ok')) }, t('copy')),
                h('button', { class: 'primary', onclick: c2 }, t('done'))),
            ]);
          },
        }, t('create'))),
    ]);
  };

  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('intTokens')), h('span', { class: 'grow' }),
      session.isAdmin ? h('button', { class: 'primary', onclick: create }, `+ ${t('addToken')}`) : null),
    h('p', { class: 'muted' }, t('tokensHelp')),
    session.isAdmin ? box : h('p', { class: 'muted' }, t('adminOnly')));
  if (session.isAdmin) load();
}

function code(text) {
  return h('pre', { style: { background: 'var(--surface-2)', padding: '10px', borderRadius: '8px', overflowX: 'auto', fontSize: '13px' } }, text);
}

function apiPage(main) {
  const endpoints = [
    ['GET', '/items', t('apiItems')],
    ['GET', '/items/{barcode}', t('apiItem')],
    ['POST', '/items', t('apiItemsPost')],
    ['GET', '/inventory', t('apiInventory')],
    ['POST', '/inventory', t('apiInventoryPost')],
    ['GET', '/receipts?created_at_min=2026-10-01T00:00:00Z', t('apiReceipts')],
    ['GET', '/customers', t('apiCustomers')],
    ['POST', '/customers', t('apiCustomersPost')],
    ['GET', '/categories', t('apiCategories')],
    ['GET', '/stores', t('apiStores')],
  ];
  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('intApi'))),
    h('div', { class: 'card', style: { display: 'grid', gap: '12px', maxWidth: '860px' } },
      h('p', { style: { margin: 0 } }, t('apiIntro')),
      h('h3', { style: { margin: 0 } }, t('apiBase')), code(API_BASE),
      h('h3', { style: { margin: 0 } }, t('apiAuth')), code('Authorization: Bearer sck_xxxxxxxx'),
      h('table', { class: 'list' }, h('tbody', {}, endpoints.map(([m, p, d]) => h('tr', {},
        h('td', {}, h('span', { class: `pill${m === 'GET' ? ' good' : ''}` }, m)), h('td', {}, h('code', {}, p)), h('td', {}, d))))),
      h('h3', { style: { margin: 0 } }, t('apiExample')),
      code(`curl ${API_BASE}/items \\\n  -H "Authorization: Bearer sck_xxxxxxxx"`),
      code(`curl -X POST ${API_BASE}/inventory \\\n  -H "Authorization: Bearer sck_xxxxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{"inventory_levels":[{"barcode":"9555012345678","store_id":"","stock_after":18}]}'`),
      h('p', { class: 'muted', style: { margin: 0 } }, t('apiNotes'))));
}
