/**
 * Profile: who is signed in, their company and role, the company code staff
 * join with (admins only), and the till's mode.
 *
 * The mode -- restaurant, supermarket or retail -- is picked once when the
 * till is first opened. Changing it afterwards reshapes every till in the
 * company mid-day, so only an admin may, here, after typing their password
 * again. The database rules hold the admin half of that (pos/settings).
 */
import { auth, db, doc, EmailAuthProvider, hasGoogle, hasPassword, linkGoogle, reauthenticateWithCredential, reauthGoogle, setDoc } from './fb.js';
import { signupError } from './signup.js';
import { h, modal, mount, toast } from './dom.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import { chosenMode, modeCards } from './modes.js';
import { DEFAULT_SETTINGS, session, ws } from './session.js';
import { menuButton } from './main.js';

const row = (label, value) => h('div', { class: 'prof-row' }, h('span', { class: 'muted' }, label), h('strong', {}, value || '—'));

export function render(main) {
  const mode = chosenMode(session.settings);
  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('navProfile'))),
    h('section', { class: 'card prof' },
      h('div', { class: 'row', style: { gap: '14px', alignItems: 'center' } },
        h('span', { class: 'prof-ic' }, icon('user', 28)),
        h('div', {}, h('h2', { style: { margin: 0 } }, session.name), h('div', { class: 'muted' }, session.email))),
      row(t('profCompany'), session.companyName),
      row(t('profRole'), session.isAdmin ? 'Admin' : t('profStaff')),
      row(t('branch'), session.branchName()),
      session.isAdmin ? row(t('profCode'), session.joinCode) : null,
      session.isAdmin ? h('p', { class: 'muted', style: { margin: 0 } }, t('profCodeHelp')) : null,
      // Signing in with Google as well as the password.
      hasGoogle() ? row(t('profGoogle'), t('profGoogleOn'))
        : h('div', { class: 'prof-row' }, h('span', { class: 'muted' }, t('profGoogle')),
          h('button', { 'data-act': 'link-google', onclick: async (e) => {
            const b = e.currentTarget;
            b.disabled = true;
            try { await linkGoogle(); toast(t('profGoogleLinked'), 'ok'); render(main); } catch (err) {
              if (!/popup-closed|cancelled-popup/.test(err?.code || '')) toast(signupError(err), 'error');
              b.disabled = false;
            }
          } }, t('profGoogleLink')))),
    h('section', { class: 'card prof', 'data-part': 'mode' },
      h('h2', { style: { margin: 0 } }, t('profMode')),
      mode ? h('div', { class: 'modepick', style: { padding: 0, minHeight: 0, justifyItems: 'stretch' } }, modeCards(mode, () => {}))
        : h('p', { class: 'muted' }, t('profNoMode')),
      session.isAdmin
        ? h('button', { class: 'primary', 'data-act': 'change-mode', onclick: () => changeMode(main) }, icon('sliders', 17), t('profChangeMode'))
        : h('p', { class: 'muted', style: { margin: 0 } }, icon('user', 15), ' ', t('profAdminOnly'))));
  return null;
}

/** Pick the new mode, type the password, and only then save it. */
function changeMode(main) {
  let picked = chosenMode(session.settings);
  modal((close) => {
    const cards = h('div', { class: 'modepick', style: { padding: 0, minHeight: 0, justifyItems: 'stretch' } });
    const draw = () => mount(cards, modeCards(picked, (m) => { picked = m; draw(); }));
    draw();
    // An account without a password (Google only) confirms with Google instead.
    const withPassword = hasPassword();
    const password = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': t('profPassword') });
    const error = h('p', { class: 'muted', style: { color: 'var(--danger)', margin: 0 } });
    const save = h('button', { class: 'primary' }, t('profChangeMode'));
    save.onclick = async () => {
      error.textContent = '';
      if (!picked) return;
      if (withPassword && !password.value) { error.textContent = t('profPassword'); return; }
      save.disabled = true;
      try {
        if (withPassword) await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(session.email, password.value));
        else await reauthGoogle();
      } catch {
        error.textContent = t('profWrongPw');
        save.disabled = false;
        return;
      }
      try {
        const next = { ...DEFAULT_SETTINGS, ...session.settings, mode: picked, updatedAt: Date.now() };
        if (picked === 'FNB' && session.settings.mode !== 'FNB') next.kitchenTicket = true;
        await setDoc(doc(db, ws('pos/settings')), next);
        session.settings = next;
        toast(t('profModeChanged'), 'ok');
        close();
        render(main);
      } catch (err) {
        error.textContent = err.message || String(err);
        save.disabled = false;
      }
    };
    return [
      h('h2', {}, t('profPickNew')),
      cards,
      withPassword ? h('label', { class: 'field' }, t('profPassword'), password) : h('p', { class: 'muted' }, t('profGoogleConfirm')),
      error,
      h('div', { class: 'actions' }, h('button', { onclick: close }, t('cancel')), save),
    ];
  }, { wide: true });
}
