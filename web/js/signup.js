/**
 * Registering on the website, the same two ways as in the SuXin Barcode Scan app:
 *
 *   a new company   the person becomes its admin; the company gets the four
 *                   built-in roles, its name and code, and the 14-day trial
 *   join a company  with the code its admin handed out; the person joins
 *                   as a Worker, and the admin gives more access later
 *
 * The order of the writes is what the database rules require: the account
 * first (company codes can only be read signed in), the code claimed before
 * anything else so nobody can take it halfway, the founder's admin profile
 * before the company's settings (only an admin may write those), and the
 * account's link to the company last, because that is what signing in
 * waits for. Anything failing removes the account again, so a half-made
 * registration never blocks the email address.
 *
 * With Google: the account already exists (signed in with Google), so only
 * the company part is written, and nothing is taken back if it fails -- the
 * person simply tries again.
 *
 * Forgotten password: the email and the company code. Firebase sends the
 * reset link to the email only, so it reaches only the account's owner.
 */
import {
  auth, collection, createUserWithEmailAndPassword, db, deleteUser, doc, getDoc, sendPasswordResetEmail, setDoc, signOut, writeBatch,
} from './fb.js';
import { t } from './i18n.js';
import { BUILT_IN_ROLES } from './roles.js';

export const TRIAL_MS = 14 * 24 * 60 * 60 * 1000;

/** Company codes are stored upper-case, so they are not case sensitive. */
export const normaliseCode = (raw) => String(raw || '').trim().toUpperCase();

/** What is wrong with a registration form, or '' when nothing is. */
export function checkForm({ email, password, password2, code, companyName }, kind, { google = false } = {}) {
  if (!google) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || '').trim())) return t('suErrEmail');
    if (String(password || '').length < 6) return t('suErrPassword');
    if (password !== password2) return t('suErrPassword2');
  }
  const c = normaliseCode(code);
  if (kind === 'create') {
    if (!String(companyName || '').trim()) return t('suErrCompany');
    if (c.length < 4 || !/^[A-Z0-9-]+$/.test(c)) return t('suErrCodeNew');
  } else if (!c) return t('suErrCode');
  return '';
}

async function undo(user) {
  await deleteUser(user).catch(() => {});
  await signOut(auth).catch(() => {});
}

function profileOf(user, name, email, roleId, code, now) {
  return {
    email: email.trim(), displayName: name.trim() || email.trim().split('@')[0], roleId,
    roleName: BUILT_IN_ROLES[roleId]?.name || roleId, active: true, branchIds: [], createdAt: now, lastSeenAt: now, joinCode: code,
  };
}

/** The account for a registration: the Google one already signed in, or a new one with a password. */
async function account({ user, email, password }) {
  if (user) return { user, email: user.email || email || '', fresh: false };
  const made = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return { user: made.user, email: email.trim(), fresh: true };
}

export async function createCompany({ name, email: typed, password, companyName, code, user: signedIn = null }) {
  const CODE = normaliseCode(code);
  const { user, email, fresh } = await account({ user: signedIn, email: typed, password });
  try {
    if ((await getDoc(doc(db, 'workspaceCodes', CODE))).exists()) throw new Error(t('suErrCodeTaken'));
    const wsId = doc(collection(db, 'workspaces')).id;
    const now = Date.now();
    await setDoc(doc(db, 'workspaceCodes', CODE), { workspaceId: wsId, companyName: companyName.trim(), createdAt: now, createdByUid: user.uid });
    const roles = writeBatch(db);
    for (const [id, role] of Object.entries(BUILT_IN_ROLES)) roles.set(doc(db, 'workspaces', wsId, 'roles', id), { ...role, createdAt: now, createdByUid: user.uid });
    await roles.commit();
    await setDoc(doc(db, 'workspaces', wsId, 'users', user.uid), profileOf(user, name, email, 'admin', CODE, now));
    await setDoc(doc(db, 'workspaces', wsId, 'meta', 'config'), { companyName: companyName.trim(), joinCode: CODE, updatedAt: now, updatedByUid: user.uid });
    // Not fatal: a company without its trial still exists and can sign in.
    await setDoc(doc(db, 'licences', wsId), {
      plan: 'TRIAL', status: 'ACTIVE', seats: 5, startedAt: now, expiresAt: now + TRIAL_MS, note: 'self-service trial', updatedAt: now,
    }).catch(() => {});
    await setDoc(doc(db, 'userIndex', user.uid), { workspaceId: wsId, joinedAt: now });
    return wsId;
  } catch (err) {
    if (fresh) await undo(user);
    throw err;
  }
}

export async function joinCompany({ name, email: typed, password, code, user: signedIn = null }) {
  const CODE = normaliseCode(code);
  const { user, email, fresh } = await account({ user: signedIn, email: typed, password });
  try {
    const found = await getDoc(doc(db, 'workspaceCodes', CODE)).catch(() => null);
    if (!found?.exists()) throw new Error(t('suErrCodeUnknown'));
    const { workspaceId, companyName } = found.data();
    const now = Date.now();
    await setDoc(doc(db, 'workspaces', workspaceId, 'users', user.uid), profileOf(user, name, email, 'worker', CODE, now));
    await setDoc(doc(db, 'userIndex', user.uid), { workspaceId, joinedAt: now });
    return companyName || '';
  } catch (err) {
    if (fresh) await undo(user);
    throw err;
  }
}

/** The reset link goes to [email]; both fields are required. */
export async function resetPassword({ email, code }) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || '').trim())) throw new Error(t('suErrEmail'));
  if (!normaliseCode(code)) throw new Error(t('suErrCode'));
  await sendPasswordResetEmail(auth, email.trim());
}

/** Firebase's error codes in words a shop owner reads. */
export function signupError(err) {
  const code = err?.code || '';
  if (code.includes('email-already-in-use')) return t('suErrTaken');
  if (code.includes('account-exists-with-different-credential')) return t('errGoogleExists');
  if (code.includes('operation-not-allowed') || code.includes('unauthorized-domain')) return t('errGoogleOff');
  if (code.includes('credential-already-in-use')) return t('errGoogleTaken');
  if (code.includes('invalid-email')) return t('suErrEmail');
  if (code.includes('weak-password')) return t('suErrPassword');
  if (code.includes('too-many-requests')) return t('errTooMany');
  if (code.includes('network')) return t('errNetwork');
  return err?.message || String(err);
}
