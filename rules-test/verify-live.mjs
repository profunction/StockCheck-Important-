/**
 * End-to-end check against the real project, after the multi-company rules
 * went live: a stranger can create their own company, and cannot reach into
 * an existing one.
 */
const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const PROJECT = 'stockcheck-fb58e';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const str = (v) => ({ stringValue: v });
const int = (v) => ({ integerValue: String(v) });
const bool = (v) => ({ booleanValue: v });

const email = `probe_${Date.now()}@example.com`;
const up = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'Probe!12345', returnSecureToken: true }),
});
const { idToken, localId: uid } = await up.json();
const h = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
const say = async (label, res) => {
  const ok = res.ok;
  const body = ok ? null : await res.json();
  console.log(`${ok ? 'ALLOWED ' : 'DENIED  '} ${label}` +
    (ok ? '' : `\n          ${body.error?.message?.slice(0, 90)}`));
  return ok;
};

const NEWWS = `ws_probe_${Date.now()}`;
const CODE = `PROBE${Date.now() % 100000}`;

console.log('\n--- a stranger creating their own company ---');
await say('claim a fresh company code', await fetch(`${BASE}/workspaceCodes/${CODE}`, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({ fields: {
    workspaceId: str(NEWWS), companyName: str('Probe Co'),
    createdAt: int(Date.now()), createdByUid: str(uid),
  }}),
}));
await say('seed a role in their own new workspace', await fetch(`${BASE}/workspaces/${NEWWS}/roles/admin`, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({ fields: {
    name: str('Admin'), description: str(''), permissions: { arrayValue: { values: [str('CHANGE_PERMISSION')] } },
    builtIn: bool(true), createdByUid: str(uid), createdAt: int(Date.now()),
  }}),
}));
await say('index themselves into their own company', await fetch(`${BASE}/userIndex/${uid}`, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({ fields: { workspaceId: str(NEWWS), joinedAt: int(Date.now()) } }),
}));
await say('write their own admin profile', await fetch(`${BASE}/workspaces/${NEWWS}/users/${uid}`, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({ fields: {
    email: str(email), displayName: str('Probe'), roleId: str('admin'), roleName: str('Admin'),
    active: bool(true), createdAt: int(Date.now()), lastSeenAt: int(Date.now()), joinCode: str(CODE),
  }}),
}));

console.log('\n--- the same stranger reaching into YOUR company (all must be DENIED) ---');
const leaked = [];
leaked.push(await say('read your stock checks', await fetch(`${BASE}/workspaces/default/stockChecks`, { headers: h })));
leaked.push(await say('read your user list', await fetch(`${BASE}/workspaces/default/users`, { headers: h })));
leaked.push(await say('read your company config (the code)', await fetch(`${BASE}/workspaces/default/meta/config`, { headers: h })));
leaked.push(await say('write into your workspace', await fetch(`${BASE}/workspaces/default/templates/hack`, {
  method: 'PATCH', headers: h, body: JSON.stringify({ fields: { name: str('hack') } }),
})));
leaked.push(await say('repoint YOUR code at their workspace', await fetch(`${BASE}/workspaceCodes/UPOINT`, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({ fields: { workspaceId: str(NEWWS), companyName: str('stolen'),
    createdAt: int(Date.now()), createdByUid: str(uid) } }),
})));

console.log(leaked.some(Boolean)
  ? '\n*** ISOLATION BROKEN — something above was allowed ***\n'
  : '\nIsolation holds: every cross-company attempt was refused.\n');

await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idToken }),
});
