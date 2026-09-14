/**
 * Signs in against the REAL Firebase project over the REST API and reports
 * what actually exists, so a stuck sign-in can be diagnosed without guessing
 * from the phone's UI.
 *
 * The app shows AuthState.NoProfile as a bare sign-in screen with no message,
 * which looks identical to "the button did nothing" — this distinguishes the
 * two: a failed sign-in versus a sign-in that succeeded onto an account with
 * no profile document behind it.
 *
 * Usage: node diagnose.mjs <email> <password>
 */
const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const WS = 'default';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node diagnose.mjs <email> <password>');
  process.exit(1);
}

const line = (s) => console.log(s);

// --- 1. Does the account exist, and does the password work? --------------
line('\n[1] Signing in to Firebase Auth...');
const signInRes = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  },
);
const signIn = await signInRes.json();

if (!signInRes.ok) {
  line(`    FAILED: ${signIn.error?.message ?? JSON.stringify(signIn)}`);
  line('\n    EMAIL_NOT_FOUND / INVALID_LOGIN_CREDENTIALS means the account does');
  line('    not exist or the password is wrong — Firebase returns the same');
  line('    message for both on purpose.\n');
  process.exit(0);
}

const { idToken, localId: uid } = signIn;
line(`    OK — signed in. uid = ${uid}`);

// --- 2. Does the profile document exist? ---------------------------------
line('\n[2] Reading the profile document Firestore should hold for that uid...');
const docPath = `workspaces/${WS}/users/${uid}`;
const profileRes = await fetch(
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`,
  { headers: { Authorization: `Bearer ${idToken}` } },
);
const profile = await profileRes.json();

if (profileRes.ok) {
  line('    FOUND. Fields:');
  for (const [k, v] of Object.entries(profile.fields ?? {})) {
    line(`      ${k} = ${Object.values(v)[0]}`);
  }
} else {
  line(`    NOT FOUND (HTTP ${profileRes.status}): ${profile.error?.message ?? ''}`);
  line('\n    This is the stuck state: the Auth account exists and signs in,');
  line('    but registration never managed to write its profile, so the app');
  line('    bounces straight back to the sign-in screen with no message.');
}

// --- 3. Were the built-in roles ever seeded? -----------------------------
line('\n[3] Checking whether the built-in roles were ever seeded...');
const rolesRes = await fetch(
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/workspaces/${WS}/roles`,
  { headers: { Authorization: `Bearer ${idToken}` } },
);
const roles = await rolesRes.json();
if (rolesRes.ok) {
  const names = (roles.documents ?? []).map((d) => d.name.split('/').pop());
  line(names.length ? `    FOUND: ${names.join(', ')}` : '    EMPTY — roles were never created.');
} else {
  line(`    Could not read (HTTP ${rolesRes.status}): ${roles.error?.message ?? ''}`);
  line('    Note: reading roles requires an existing profile, so this failing');
  line('    is expected when step 2 came back NOT FOUND.');
}

line('');
