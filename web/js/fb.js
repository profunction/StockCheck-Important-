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
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

export {
  onAuthStateChanged,
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
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
export { getDownloadURL, ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

export let auth;
export let db;
export let storage;

export async function initFirebase() {
  const response = await fetch('/__/firebase/init.json');
  if (!response.ok) throw new Error('Firebase settings not found (/__/firebase/init.json).');
  const app = initializeApp(await response.json());
  auth = getAuth(app);
  // Cached on the computer, so a sale goes through when the shop's internet
  // drops and is sent when it comes back. Several tabs share one cache.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  storage = getStorage(app);
}
