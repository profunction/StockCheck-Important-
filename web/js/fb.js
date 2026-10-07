/**
 * Firebase, set up from the project's own settings.
 *
 * Firebase Hosting serves /__/firebase/init.json for the project's web app,
 * so nothing about the project is written into this code: the same files
 * work on whatever project they are deployed to.
 *
 * The SDK comes from Google's CDN as ES modules -- no build step, so the
 * website is exactly the files in web/.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword as signInOn, signOut as signOutOf } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  doc as docOn,
  getDoc as getDocOn,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

export {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
export {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
export { getDownloadURL, ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

export let auth;
export let db;
export let storage;

let config;

export async function initFirebase() {
  const response = await fetch('/__/firebase/init.json');
  if (!response.ok) throw new Error('Firebase settings not found (/__/firebase/init.json).');
  config = await response.json();
  const app = initializeApp(config);
  auth = getAuth(app);
  // Cached on the computer, so a sale goes through when the shop's internet
  // drops and is sent when it comes back. Several tabs share one cache.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  storage = getStorage(app);
}

/**
 * Creates a sign-in for a member of staff without signing the owner out.
 *
 * Creating an account signs it in on whatever Firebase app made it, so it is
 * done on a second app with the same settings, then signed out again -- the
 * same way the JEXO Count app does it.
 */
let staffApp;
export async function createStaffAccount(email, password) {
  staffApp ??= initializeApp(config, 'staff');
  const staffAuth = getAuth(staffApp);
  try {
    const result = await createUserWithEmailAndPassword(staffAuth, email, password);
    return {
      uid: result.user.uid,
      // Taking it back out if the rest of the setup fails, so the email can be used again.
      undo: () => result.user.delete().catch(() => {}),
    };
  } finally {
    // Signed out after the caller's undo has had its chance; see addEmployee.
    setTimeout(() => signOutOf(staffAuth).catch(() => {}), 5000);
  }
}

/**
 * Whether [email]/[password] belong to an active admin of company [wsId] --
 * checked on a second app, so whoever is signed in at the till (often a
 * cashier) stays signed in. Throws when the password is wrong or the
 * account is not that company's admin.
 */
let checkApp;
export async function verifyAdmin(email, password, wsId) {
  checkApp ??= initializeApp(config, 'check');
  const checkAuth = getAuth(checkApp);
  const result = await signInOn(checkAuth, email, password);
  try {
    const snap = await getDocOn(docOn(getFirestore(checkApp), 'workspaces', wsId, 'users', result.user.uid));
    const p = snap.exists() ? snap.data() : null;
    if (!p || p.roleId !== 'admin' || p.active !== true) {
      const err = new Error('not an admin');
      err.code = 'not-admin';
      throw err;
    }
  } finally {
    await signOutOf(checkAuth).catch(() => {});
  }
}
