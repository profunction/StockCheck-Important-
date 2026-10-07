/**
 * Employees and what each role may do at the till.
 *
 * Accounts are the Stock Check app's own: new staff are still added in the
 * app (Profile -> Users), which is where their sign-in is created. Here an
 * owner sees who works where and switches the POS permissions on per role.
 */
import { collection, db, doc, getDocs, updateDoc } from './fb.js';
import { h, mount, toast } from './dom.js';
import { t } from './i18n.js';
import { session, ws } from './session.js';
import { menuButton } from './main.js';

const POS_PERMS = ['POS_SELL', 'POS_VOID', 'POS_MANAGE', 'POS_REPORTS'];

export function render(main) {
  const usersBox = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  const rolesBox = h('div');
  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('navEmployees'))),
    h('p', { class: 'muted' }, t('employeesHelp')),
    h('h2', {}, t('employeeList')), usersBox,
    h('h2', { style: { marginTop: '24px' } }, t('accessRights')), rolesBox);
  load(usersBox, rolesBox);
  return null;
}

async function load(usersBox, rolesBox) {
  try {
    const [users, roles] = await Promise.all([
      getDocs(collection(db, ws('users'))),
      getDocs(collection(db, ws('roles'))),
    ]);
    const roleList = roles.docs.map((d) => ({ ...d.data(), id: d.id }));
    const branchName = (ids) => (ids?.length ? ids.map((id) => session.branchName(id)).join(', ') : t('allBranches'));
    mount(usersBox, h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, [t('name'), t('email'), t('role'), t('branch'), ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, users.docs.map((d) => d.data()).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '')).map((u) => h('tr', {},
        h('td', {}, u.displayName || ''), h('td', {}, u.email || ''),
        h('td', {}, roleList.find((r) => r.id === u.roleId)?.name || u.roleName || u.roleId),
        h('td', {}, branchName(u.branchIds)),
        h('td', {}, u.active === false ? h('span', { class: 'pill bad' }, t('inactive')) : '')))))));

    const canEdit = session.can('EDIT_ROLE');
    mount(rolesBox, h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, h('th', {}, t('role')), POS_PERMS.map((p) => h('th', {}, t(`perm_${p}`))))),
      h('tbody', {}, roleList.map((r) => h('tr', {},
        h('td', {}, r.name || r.id),
        POS_PERMS.map((p) => h('td', {}, r.id === 'admin'
          ? '✓'
          : h('input', {
            type: 'checkbox', checked: (r.permissions || []).includes(p), disabled: !canEdit, style: { width: 'auto' },
            onchange: async (e) => {
              const next = new Set(r.permissions || []);
              if (e.target.checked) next.add(p); else next.delete(p);
              try {
                await updateDoc(doc(db, ws(`roles/${r.id}`)), { permissions: [...next].sort() });
                r.permissions = [...next];
                toast(t('saved'), 'ok');
              } catch (err) {
                e.target.checked = !e.target.checked;
                toast(err.message || String(err), 'error');
              }
            },
          })))))))));
  } catch (err) {
    mount(usersBox, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`));
  }
}
