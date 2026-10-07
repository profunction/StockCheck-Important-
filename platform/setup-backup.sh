#!/usr/bin/env bash
#
# One-time setup for the nightly backup (.github/workflows/nightly.yml).
# Run in Cloud Shell; safe to run again.
#
#   bash setup-backup.sh [PROJECT_ID]
#
# Makes the bucket <project>-backups in Singapore, keeps 30 days of
# backups in it, and lets the Firebase admin service account (the key in the
# FIREBASE_SERVICE_ACCOUNT secret) export the database into it.

set -euo pipefail
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n\n' "$*" >&2; exit 1; }

PROJECT="${1:-$(gcloud config get-value project 2>/dev/null || true)}"
[ -n "$PROJECT" ] && [ "$PROJECT" != "(unset)" ] || die "Run: bash setup-backup.sh YOUR_PROJECT_ID"
BUCKET="gs://${PROJECT}-backups"
gcloud config set project "$PROJECT" >/dev/null

say "Turning on the Firestore and Storage APIs"
gcloud services enable firestore.googleapis.com storage.googleapis.com

say "Bucket $BUCKET"
if gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1; then
  echo "  already there"
else
  gcloud storage buckets create "$BUCKET" --location=asia-southeast1 --uniform-bucket-level-access
fi

say "Keeping 30 days of backups"
LIFE=$(mktemp)
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' > "$LIFE"
gcloud storage buckets update "$BUCKET" --lifecycle-file="$LIFE"
rm -f "$LIFE"

say "Letting the Firebase admin account make backups"
SA=$(gcloud iam service-accounts list --format='value(email)' --filter='email~^firebase-adminsdk' | head -n1)
[ -n "$SA" ] || die "No firebase-adminsdk service account found. Open Firebase console > Project settings > Service accounts once, then run this again."
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role=roles/datastore.importExportAdmin --condition=None >/dev/null
gcloud storage buckets add-iam-policy-binding "$BUCKET" --member="serviceAccount:$SA" --role=roles/storage.admin >/dev/null
echo "  $SA can now back up into $BUCKET"

say "Done. The backup runs every night at 03:00; to try it now: GitHub > Actions > Nightly backup and PDPA > Run workflow."
