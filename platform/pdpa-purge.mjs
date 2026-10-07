// The nightly PDPA job: every company's customers who asked to be removed
// more than 90 days ago are erased -- the customer document deleted, and
// their name and phone blanked on old receipts, which keep their amounts
// for the accounts. Each erasure is written to the company's audit log.
//
// The POS does the same when its owner opens the customer list; this makes
// sure it happens even in a shop nobody opens that page in.
//
//   node pdpa-purge.mjs            erase what is due
//   node pdpa-purge.mjs --dry-run  only say what would be erased

import { db } from './licences.mjs';
import { SALE_SCRUB, duePurge } from '../web/js/pdpa.js';

export async function purgeWorkspace(firestore, wsId, { now = Date.now(), dryRun = false } = {}) {
  const ws = firestore.collection('workspaces').doc(wsId);
  const snap = await ws.collection('customers').where('status', '==', 'UNSUBSCRIBED').get();
  const due = duePurge(snap.docs.map((d) => ({ ...d.data(), id: d.id })), now);
  for (const c of due) {
    if (dryRun) continue;
    const sales = await ws.collection('sales').where('customerId', '==', c.id).get();
    for (let i = 0; i < sales.docs.length; i += 400) {
      const batch = firestore.batch();
      sales.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, SALE_SCRUB));
      await batch.commit();
    }
    const batch = firestore.batch();
    batch.delete(ws.collection('customers').doc(c.id));
    batch.set(ws.collection('auditLog').doc(), {
      stockCheckId: '', entity: 'Customer', entityId: c.id, entityLabel: 'PDPA', action: 'DELETE', field: 'pdpa',
      oldValue: 'UNSUBSCRIBED', newValue: `erased; ${sales.size} receipts anonymised`,
      actorUid: 'platform:pdpa', actorName: 'PDPA (automatic)', at: now,
    });
    await batch.commit();
  }
  return due.map((c) => c.id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  const firestore = db();
  const workspaces = await firestore.collection('workspaces').listDocuments();
  let total = 0;
  for (const ref of workspaces) {
    const ids = await purgeWorkspace(firestore, ref.id, { dryRun });
    if (ids.length) console.log(`${ref.id}: ${dryRun ? 'would erase' : 'erased'} ${ids.length}`);
    total += ids.length;
  }
  console.log(`${dryRun ? 'Due' : 'Erased'}: ${total} customer(s) in ${workspaces.length} companies`);
}
