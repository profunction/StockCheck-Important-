// The nightly backup: a managed export of the whole Firestore database to a
// Cloud Storage bucket, one folder per day. Run by
// .github/workflows/nightly.yml (or by hand: node backup.mjs).
//
// An export is Google's own copy of every document, restorable with
//   gcloud firestore import gs://BUCKET/firestore/2026-10-07
// It needs the Blaze plan, a bucket, and for the service account the roles
// "Cloud Datastore Import Export Admin" and "Storage Admin" on that bucket
// (platform/setup-backup.sh sets all three up). Old folders are removed
// by the bucket's own lifecycle rule, not by this script.

import { readFileSync, existsSync } from 'node:fs';

/** gs://BUCKET/firestore/YYYY-MM-DD for [now], in Malaysian time. */
export function exportRequest({ projectId, bucket, now = Date.now(), database = '(default)' }) {
  if (!projectId) throw new Error('No project id');
  if (!bucket) throw new Error('No bucket');
  const day = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
  return {
    name: `projects/${projectId}/databases/${database}`,
    requestBody: { outputUriPrefix: `gs://${bucket.replace(/^gs:\/\//, '').replace(/\/+$/, '')}/firestore/${day}` },
  };
}

/**
 * Starts the export and returns Google's operation name. The export itself
 * runs on Google's side for a few minutes after this returns.
 */
export async function scheduledFirestoreExport({ projectId, bucket, keyFile, now } = {}) {
  const { google } = await import('googleapis');
  const keyPath = keyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const key = keyPath && existsSync(keyPath) ? JSON.parse(readFileSync(keyPath, 'utf8')) : null;
  const project = projectId || process.env.GCLOUD_PROJECT || key?.project_id;
  const auth = new google.auth.GoogleAuth({
    ...(keyPath ? { keyFile: keyPath } : {}),
    scopes: ['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/cloud-platform'],
  });
  const firestore = google.firestore({ version: 'v1', auth });
  const request = exportRequest({ projectId: project, bucket: bucket || process.env.BACKUP_BUCKET || `${project}-backups`, now });
  const { data } = await firestore.projects.databases.exportDocuments(request);
  return { operation: data.name, to: request.requestBody.outputUriPrefix };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scheduledFirestoreExport()
    .then((r) => console.log(`Backup started: ${r.to}\n  operation ${r.operation}`))
    .catch((e) => { console.error(`Backup failed: ${e.message}`); process.exit(1); });
}
