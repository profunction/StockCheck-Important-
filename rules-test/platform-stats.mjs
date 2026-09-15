// Platform-side view: which companies exist on this Firebase project, how
// many people are in each, and how much they are storing.
//
// Deliberately NOT part of the app. Every rule in firestore.rules exists to
// stop one company reading another, and a screen inside the app that showed
// this would need those rules relaxed for somebody -- which is the whole
// isolation guarantee gone, sold for a usage counter. This runs outside, with
// a service-account key that bypasses rules by design and that lives on the
// operator's machine, not on anyone's phone.
//
// Setup, once:
//   1. Firebase console > Project settings > Service accounts
//   2. "Generate new private key" -> saves a .json file
//   3. Put it beside this script as service-account.json  (it is gitignored)
//   4. npm install firebase-admin
//
// Then:  node platform-stats.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const keyPath = join(here, 'service-account.json');

if (!existsSync(keyPath)) {
  console.error(`No service-account.json in ${here}`);
  console.error('Firebase console > Project settings > Service accounts > Generate new private key');
  process.exit(1);
}

let admin;
try {
  admin = await import('firebase-admin/app');
} catch {
  console.error('firebase-admin is not installed. Run:  npm install firebase-admin');
  process.exit(1);
}
const { getFirestore } = await import('firebase-admin/firestore');

const credential = JSON.parse(readFileSync(keyPath, 'utf8'));
admin.initializeApp({ credential: admin.cert(credential) });
const db = getFirestore();

const workspaces = await db.collection('workspaces').listDocuments();
if (workspaces.length === 0) {
  console.log('No companies registered.');
  process.exit(0);
}

console.log(`${workspaces.length} compan${workspaces.length === 1 ? 'y' : 'ies'} on this project\n`);

const rows = [];
let totalDocs = 0;

for (const workspace of workspaces) {
  const config = (await workspace.collection('meta').doc('config').get()).data() ?? {};
  const users = await workspace.collection('users').get();
  const products = await workspace.collection('products').get();
  const templates = await workspace.collection('templates').get();
  const checks = await workspace.collection('stockChecks').get();
  const audit = await workspace.collection('auditLog').count().get();

  // Items live under each check, so this is the count that actually grows.
  let items = 0;
  let photos = 0;
  let lastActivity = 0;
  for (const check of checks.docs) {
    items += (await check.ref.collection('items').count().get()).data().count;
    photos += (await check.ref.collection('photos').count().get()).data().count;
    lastActivity = Math.max(lastActivity, check.data().updatedAt ?? check.data().createdAt ?? 0);
  }

  const auditCount = audit.data().count;
  const docs =
    users.size + products.size + templates.size + checks.size + items + photos + auditCount;
  totalDocs += docs;

  rows.push({
    id: workspace.id,
    company: config.companyName ?? '(unnamed)',
    code: config.joinCode ?? '?',
    users: users.size,
    products: products.size,
    templates: templates.size,
    checks: checks.size,
    items,
    photos,
    audit: auditCount,
    docs,
    active: users.docs.filter((u) => u.data().active !== false).length,
    lastActivity,
  });
}

rows.sort((a, b) => b.docs - a.docs);

const when = (millis) =>
  millis ? new Date(millis).toISOString().slice(0, 16).replace('T', ' ') : 'never';

for (const row of rows) {
  console.log(`${row.company}  [${row.code}]`);
  console.log(`   workspace   ${row.id}`);
  console.log(`   users       ${row.active} active of ${row.users}`);
  console.log(`   catalogue   ${row.products} products, ${row.templates} templates`);
  console.log(`   counting    ${row.checks} checks, ${row.items} lines, ${row.photos} photos`);
  console.log(`   audit       ${row.audit} entries`);
  console.log(`   documents   ${row.docs}`);
  console.log(`   last used   ${when(row.lastActivity)}`);
  console.log('');
}

// The free tier's real limits, so the number above means something.
const FREE_STORED_DOCS_HINT = 'Spark plan: 1 GiB stored, 50k reads and 20k writes a day.';
console.log('-'.repeat(52));
console.log(`total documents   ${totalDocs}`);
console.log(FREE_STORED_DOCS_HINT);
console.log();
console.log('Document count is not billing. Reads and writes are what the free tier');
console.log('limits day to day, and only the Firebase console usage page shows those.');
console.log('https://console.firebase.google.com/project/stockcheck-fb58e/usage');
