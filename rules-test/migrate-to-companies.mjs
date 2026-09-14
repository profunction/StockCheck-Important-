/**
 * Brings the existing single-company data into the multi-company layout.
 *
 * Everything already lives under workspaces/default, which stays exactly where
 * it is. What is missing is the two pieces the new code looks for before it
 * reads anything: a claimed code pointing at that workspace, and an index
 * entry per existing account saying which workspace it belongs to. Without
 * them every existing sign-in lands on "this account has no company".
 *
 * Safe to re-run: it skips anything already present.
 *
 * Usage: node migrate-to-companies.mjs <CODE> <Company name>
 */
const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const WS = 'default';

const CODE = (process.argv[2] ?? 'UPOINT').trim().toUpperCase();
const COMPANY = process.argv[3] ?? 'Upoint';

const str = (v) => ({ stringValue: v });
const int = (v) => ({ integerValue: String(v) });
const log = (s) => console.log(s);

const r = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'demo@stockcheck.app',
      password: 'demo123456',
      returnSecureToken: true,
    }),
  },
);
const { idToken, localId: adminUid } = await r.json();
if (!idToken) {
  log('Could not sign in as the admin account; nothing was changed.');
  process.exit(1);
}
const h = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };

// --- 1. claim the code for the existing workspace ------------------------
log(`\n[1] Claiming code ${CODE} for workspaces/${WS} ...`);
const existing = await fetch(`${BASE}/workspaceCodes/${CODE}`, { headers: h });
if (existing.ok) {
  const found = (await existing.json()).fields?.workspaceId?.stringValue;
  log(`    Already claimed, pointing at "${found}". Left alone.`);
} else {
  const res = await fetch(`${BASE}/workspaceCodes/${CODE}`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({
      fields: {
        workspaceId: str(WS),
        companyName: str(COMPANY),
        createdAt: int(Date.now()),
        createdByUid: str(adminUid),
      },
    }),
  });
  log(res.ok ? '    Claimed.' : `    FAILED: ${(await res.json()).error?.message}`);
}

// --- 2. record the company config ---------------------------------------
log('\n[2] Writing the workspace config ...');
const cfg = await fetch(`${BASE}/workspaces/${WS}/meta/config`, {
  method: 'PATCH',
  headers: h,
  body: JSON.stringify({
    fields: {
      companyName: str(COMPANY),
      joinCode: str(CODE),
      updatedAt: int(Date.now()),
      updatedByUid: str(adminUid),
    },
  }),
});
log(cfg.ok ? '    Written.' : `    FAILED: ${(await cfg.json()).error?.message}`);

// --- 3. point every existing member at this workspace -------------------
log('\n[3] Indexing existing members ...');
const usersRes = await fetch(`${BASE}/workspaces/${WS}/users`, { headers: h });
const users = (await usersRes.json()).documents ?? [];
for (const d of users) {
  const uid = d.name.split('/').pop();
  const email = d.fields?.email?.stringValue ?? uid;
  const already = await fetch(`${BASE}/userIndex/${uid}`, { headers: h });
  if (already.ok) {
    log(`    ${email}: already indexed`);
    continue;
  }
  const res = await fetch(`${BASE}/userIndex/${uid}`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({
      fields: { workspaceId: str(WS), joinedAt: int(Date.now()) },
    }),
  });
  log(res.ok ? `    ${email}: indexed` : `    ${email}: FAILED ${(await res.json()).error?.message}`);
}

log(`\nDone. ${users.length} member(s) now resolve to workspaces/${WS}, reachable with code ${CODE}.\n`);
