/**
 * The till lock: on a counter computer the cashier should see the till and
 * nothing else -- not reports, staff, settings or the other apps. Locked,
 * the back office shows only the register; SuXin Warehouse, SuXin Count and
 * the app centre send this computer back to it.
 *
 * Locking and unlocking both take an admin's email and password, checked
 * without signing the cashier out (fb.js verifyAdmin). The lock belongs to
 * the computer (saved in its browser), not to an account: whoever signs in
 * at a locked till gets the till.
 *
 * It is a lock on the screens, for the counter. What each person may do is
 * still decided by their role and the database rules, locked or not.
 */
import { verifyAdmin } from './fb.js';
import { h, local, modal, toast } from './dom.js';
import { addStrings, t } from './i18n.js';
import { icon } from './icons.js';
import { session } from './session.js';

// The name from before the brand was SuXin, kept: renaming it would unlock
// every locked till.
const KEY = 'jexo.tillLock';

addStrings({
  en: {
    tlLock: 'Lock till', tlUnlock: 'Unlock', tlLocked: 'Till locked', tlLockTitle: 'Lock this till',
    tlUnlockTitle: 'Unlock this till', tlHelp: 'Locked, this computer shows only the till. An admin’s email and password are needed to lock and to unlock.',
    tlAdminEmail: 'Admin email', tlAdminPassword: 'Admin password', tlWrong: 'Wrong password, or that account is not this company’s admin.',
    tlDoneLock: 'Till locked: only the till is open on this computer.', tlDoneUnlock: 'Till unlocked',
    tlOnlyTill: 'This computer is locked to the till. An admin can unlock it.',
  },
  zh: {
    tlLock: '锁定收银', tlUnlock: '解锁', tlLocked: '收银已锁定', tlLockTitle: '锁定这台收银机',
    tlUnlockTitle: '解锁这台收银机', tlHelp: '锁定后，这台电脑只能用收银页面。锁定和解锁都要输入管理员的 email 和密码。',
    tlAdminEmail: '管理员 email', tlAdminPassword: '管理员密码', tlWrong: '密码不对，或这个账号不是这间公司的管理员。',
    tlDoneLock: '已锁定：这台电脑只能用收银。', tlDoneUnlock: '已解锁',
    tlOnlyTill: '这台电脑已锁定，只能用收银。管理员可以解锁。',
  },
  ms: {
    tlLock: 'Kunci kaunter', tlUnlock: 'Buka kunci', tlLocked: 'Kaunter dikunci', tlLockTitle: 'Kunci kaunter ini',
    tlUnlockTitle: 'Buka kunci kaunter ini', tlHelp: 'Bila dikunci, komputer ini hanya tunjuk kaunter. E-mel dan kata laluan admin diperlukan untuk kunci dan buka.',
    tlAdminEmail: 'E-mel admin', tlAdminPassword: 'Kata laluan admin', tlWrong: 'Kata laluan salah, atau akaun itu bukan admin syarikat ini.',
    tlDoneLock: 'Kaunter dikunci: hanya kaunter dibuka di komputer ini.', tlDoneUnlock: 'Kunci dibuka',
    tlOnlyTill: 'Komputer ini dikunci pada kaunter. Admin boleh membukanya.',
  },
});

export const isTillLocked = () => local.get(KEY, false) === true;

/** On another app while locked: back to the till. */
export function guardTillLock() {
  if (!isTillLocked()) return false;
  location.replace('/pos/#/pos');
  return true;
}

/** Asks for an admin's email and password, then locks or unlocks; [after] redraws. */
export function toggleTillLock(after = () => {}) {
  const locking = !isTillLocked();
  modal((close) => {
    const email = h('input', { type: 'email', autocomplete: 'off', value: session.isAdmin ? session.email : '' });
    const password = h('input', { type: 'password', autocomplete: 'off' });
    const error = h('p', { class: 'muted', style: { color: 'var(--danger)', margin: 0 } });
    const ok = h('button', { class: 'primary', 'data-act': 'till-lock-ok' }, icon('lock', 17), locking ? t('tlLock') : t('tlUnlock'));
    const submit = async () => {
      error.textContent = '';
      ok.disabled = true;
      try {
        await verifyAdmin(email.value.trim(), password.value, session.ws);
      } catch {
        error.textContent = t('tlWrong');
        ok.disabled = false;
        return;
      }
      local.set(KEY, locking);
      toast(locking ? t('tlDoneLock') : t('tlDoneUnlock'), 'ok');
      close();
      after(locking);
    };
    ok.onclick = submit;
    password.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => (email.value ? password : email).focus(), 50);
    return [
      h('h2', {}, locking ? t('tlLockTitle') : t('tlUnlockTitle')),
      h('p', { class: 'muted' }, t('tlHelp')),
      h('label', { class: 'field' }, t('tlAdminEmail'), email),
      h('label', { class: 'field' }, t('tlAdminPassword'), password),
      error,
      h('div', { class: 'actions' }, h('button', { onclick: close }, t('cancel')), ok),
    ];
  });
}

/** The button at the top right of the till. */
export function tillLockButton(after) {
  const locked = isTillLocked();
  return h('button', {
    class: `till-lock${locked ? ' on' : ''}`, 'data-act': 'till-lock', 'data-help': 'lock', title: locked ? t('tlLocked') : t('tlLock'),
    onclick: () => toggleTillLock(after),
  }, icon('lock', 18), h('span', {}, locked ? t('tlUnlock') : t('tlLock')));
}
