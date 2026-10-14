/**
 * Employees and what each role may do at the till.
 *
 * Accounts are shared with the JSOX Barcode Scan app: someone added here signs in
 * to the app and the website alike. An owner sees who works where, adds
 * staff, and switches the POS permissions on per role.
 */
import { collection, createStaffAccount, db, doc, getDocs, setDoc, updateDoc } from './fb.js';
import { h, modal, mount, toast } from './dom.js';
import { t } from './i18n.js';
import { session, ws } from './session.js';
import { menuButton } from './main.js';

// The till's permissions, and the accounts' (JSOX Books) beside them.
const POS_PERMS = ['POS_SELL', 'POS_VOID', 'POS_MANAGE', 'POS_REPORTS', 'BOOKS_VIEW', 'BOOKS_POST', 'BOOKS_ADMIN'];

export function render(main) {
  const usersBox = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  const rolesBox = h('div');
  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('navEmployees')), h('span', { class: 'grow' }),
      session.isAdmin ? h('button', { class: 'primary', onclick: () => addEmployee(() => load(usersBox, rolesBox)) }, `+ ${t('addEmployee')}`) : null),
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

/**
 * A new member of staff: their sign-in, their profile with a role and
 * branch, and the directory entry that tells every app which company they
 * belong to -- in that order, and taken back out if a later step fails.
 */
async function addEmployee(onDone) {
  let roles = [];
  try {
    roles = (await getDocs(collection(db, ws('roles')))).docs.map((d) => ({ ...d.data(), id: d.id }));
  } catch (err) {
    return toast(err.message, 'error');
  }
  const name = h('input', { autofocus: true });
  const email = h('input', { type: 'email', autocomplete: 'off' });
  const password = h('input', { type: 'text', autocomplete: 'new-password', value: Math.random().toString(36).slice(2, 10) });
  const role = h('select', {}, roles.filter((r) => r.id !== 'admin').map((r) => h('option', { value: r.id }, r.name || r.id)));
  const branch = h('select', {}, h('option', { value: '' }, t('allBranches')),
    session.branches.filter((b) => b.active !== false).map((b) => h('option', { value: b.id }, b.name)));
  modal((close) => {
    const save = h('button', { class: 'primary' }, t('create'));
    save.onclick = async () => {
      const mail = email.value.trim();
      if (!name.value.trim() || !mail.includes('@')) return toast(t('errNameEmail'), 'error');
      if (password.value.length < 6) return toast(t('errPassword6'), 'error');
      save.disabled = true;
      let account;
      try {
        account = await createStaffAccount(mail, password.value);
        const chosen = roles.find((r) => r.id === role.value);
        const now = Date.now();
        await setDoc(doc(db, ws(`users/${account.uid}`)), {
          email: mail, displayName: name.value.trim(), roleId: role.value, roleName: chosen?.name || role.value,
          active: true, createdAt: now, lastSeenAt: 0, branchIds: branch.value ? [branch.value] : [],
        });
        // Linked last: the app reads this as "the account is ready".
        await setDoc(doc(db, 'userIndex', account.uid), { workspaceId: session.ws });
        toast(t('employeeCreated'), 'ok');
        close();
        modal((c2) => [
          h('h2', {}, t('employeeCreated')),
          h('p', {}, t('giveTheseDetails')),
          h('div', { class: 'card' }, h('div', {}, `${t('email')}: ${mail}`), h('div', {}, `${t('password')}: ${password.value}`)),
          h('p', { class: 'muted' }, t('canChangePassword')),
          h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: c2 }, t('ok'))),
        ]);
        onDone();
      } catch (err) {
        await account?.undo();
        save.disabled = false;
        const code = err?.code || '';
        toast(code.includes('email-already-in-use') ? t('errEmailUsed') : (err.message || String(err)), 'error');
      }
    };
    return [
      h('h2', {}, t('addEmployee')),
      h('label', { class: 'field' }, t('name'), name),
      h('label', { class: 'field' }, t('email'), email),
      h('label', { class: 'field' }, t('password'), password),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('role'), role), h('label', { class: 'field' }, t('branch'), branch)),
      h('div', { class: 'actions' }, h('button', { onclick: close }, t('cancel')), save),
    ];
  });
}
