#!/usr/bin/env bash
#
# One-time Google Cloud setup for the payments server.
#
# Run it in Cloud Shell, where gcloud is already installed and already signed
# in. It is safe to run again: everything it does is checked first, so a run
# that stopped halfway can simply be repeated.
#
#   bash setup-gcp.sh
#
# It does not deploy anything and does not touch Play Console. It creates the
# identity the server will run as, and prints the address you paste into Play
# Console afterwards.

set -euo pipefail

SA_NAME="stockcheck-payments"
REGION="asia-southeast1"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mok\033[0m  %s\n' "$*"; }
warn() { printf '  \033[33m!!\033[0m  %s\n' "$*"; }
die()  { printf '\n\033[31m%s\033[0m\n\n' "$*" >&2; exit 1; }

command -v gcloud >/dev/null 2>&1 \
  || die "gcloud is not installed. Run this in Cloud Shell: https://console.cloud.google.com then click the terminal icon."

PROJECT="${1:-$(gcloud config get-value project 2>/dev/null || true)}"
[ -n "$PROJECT" ] && [ "$PROJECT" != "(unset)" ] \
  || die "No project set. Run:  bash setup-gcp.sh YOUR_PROJECT_ID
Your project id is in the Firebase console under Project settings."

gcloud projects describe "$PROJECT" >/dev/null 2>&1 \
  || die "Cannot see a project called '$PROJECT'. Check the id, or that this account has access to it."

gcloud config set project "$PROJECT" >/dev/null
say "Project: $PROJECT"

# Billing first. Every step below fails without it, and each one fails with a
# different message that does not mention billing.
say "Checking billing"
if gcloud beta billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null | grep -qi true; then
  ok "billing is on"
else
  die "Billing is not enabled for $PROJECT.

Turn it on here, then run this again:
  https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT

Cloud Run bills per request and scales to zero, so a project this size
normally stays inside the free allowance. Billing has to be attached even
to spend nothing."
fi

say "Enabling APIs (a minute or two the first time)"
for api in run.googleapis.com cloudbuild.googleapis.com androidpublisher.googleapis.com firestore.googleapis.com; do
  if gcloud services list --enabled --format='value(config.name)' | grep -qx "$api"; then
    ok "$api"
  else
    gcloud services enable "$api" && ok "$api (enabled)"
  fi
done

SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

say "Service account"
if gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  ok "$SA_EMAIL already exists"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name "StockCheck payments server" >/dev/null
  ok "created $SA_EMAIL"
fi

# Firestore read and write, and nothing else. This identity writes licences;
# it has no reason to be able to change a rule, a bucket or another service.
say "Permissions"
if gcloud projects get-iam-policy "$PROJECT" \
     --flatten="bindings[].members" \
     --format='value(bindings.role)' \
     --filter="bindings.members:serviceAccount:${SA_EMAIL}" | grep -qx "roles/datastore.user"; then
  ok "already has roles/datastore.user"
else
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member "serviceAccount:${SA_EMAIL}" \
    --role roles/datastore.user >/dev/null
  ok "granted roles/datastore.user"
fi

ADMIN_TOKEN="$(openssl rand -hex 24)"

cat <<REPORT

────────────────────────────────────────────────────────────────────
 Done. Nothing is deployed yet.
────────────────────────────────────────────────────────────────────

 DO THIS NEXT, BEFORE ANYTHING ELSE — Google takes a few hours to
 apply it, and until it does, verifying a purchase fails with a 401
 that reads exactly like a wrong key.

   Play Console -> Users and permissions -> Invite new user

   Email:   ${SA_EMAIL}

   Permissions for this app:
     - View financial data
     - Manage orders and subscriptions

 Then, still here, deploy (from the platform/ folder):

   gcloud run deploy ${SA_NAME} --source . \\
     --region ${REGION} \\
     --allow-unauthenticated \\
     --service-account ${SA_EMAIL} \\
     --set-env-vars GOOGLE_PLAY_PACKAGE=com.stockcheck.app,ADMIN_TOKEN=${ADMIN_TOKEN}

 Keep this token. It is the only thing protecting the licence lookup,
 it is not stored anywhere else, and this script prints a different
 one every run:

   ADMIN_TOKEN=${ADMIN_TOKEN}

 The deploy prints a URL. That URL is PLATFORM_URL.

────────────────────────────────────────────────────────────────────
REPORT
