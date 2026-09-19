#!/usr/bin/env bash
#
# Issues a licence to one company, using nothing but gcloud.
#
# The usual route is platform/licence-cli.mjs, which needs the repository, an
# npm install and a service-account key. This needs none of them: Cloud Shell
# is already signed in as the project owner, and the Firestore REST API takes
# that token directly. Owner credentials go through IAM rather than
# firestore.rules, which is what makes writing /licences possible at all --
# every client is denied it by rule, deliberately.
#
#   bash grant-me.sh UPOINT                  unlimited, no expiry
#   bash grant-me.sh UPOINT STARTER 2027-12-31
#
set -euo pipefail

CODE="${1:?Usage: bash grant-me.sh <JOIN_CODE> [PLAN] [YYYY-MM-DD]}"
PLAN="${2:-UNLIMITED}"
UNTIL="${3:-}"

PROJECT="$(gcloud config get-value project 2>/dev/null)"
[ -n "$PROJECT" ] && [ "$PROJECT" != "(unset)" ] || { echo "No project set." >&2; exit 1; }

case "$PLAN" in
  STARTER)   SEATS=5 ;;
  BUSINESS)  SEATS=20 ;;
  UNLIMITED) SEATS=2000000000 ;;
  TRIAL)     SEATS=5 ;;
  *) echo "PLAN must be STARTER, BUSINESS, UNLIMITED or TRIAL." >&2; exit 1 ;;
esac

# Zero is what makes a licence never expire -- the app and the rules both read
# it that way, and a far-future date is a date that eventually arrives.
if [ -z "$UNTIL" ]; then
  EXPIRES=0
else
  EXPIRES="$(( $(date -u -d "$UNTIL 23:59:59" +%s) * 1000 ))"
fi

NOW="$(( $(date -u +%s) * 1000 ))"
TOKEN="$(gcloud auth print-access-token)"
API="https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents"

echo "Looking up company code ${CODE}..."
CODE_UPPER="$(printf '%s' "$CODE" | tr '[:lower:]' '[:upper:]')"
LOOKUP="$(curl -fsS -H "Authorization: Bearer ${TOKEN}" "${API}/workspaceCodes/${CODE_UPPER}" || true)"

WS="$(printf '%s' "$LOOKUP" | python3 -c '
import json,sys
raw = sys.stdin.read().strip()
if not raw:
    sys.exit(0)
doc = json.loads(raw)
print(doc.get("fields", {}).get("workspaceId", {}).get("stringValue", ""))
')"

if [ -z "$WS" ]; then
  echo
  echo "No company with the code ${CODE_UPPER}." >&2
  echo "The code is the one the app shows on the licence screen." >&2
  echo "These codes exist:" >&2
  curl -fsS -H "Authorization: Bearer ${TOKEN}" "${API}/workspaceCodes?pageSize=50" \
    | python3 -c '
import json,sys
raw = sys.stdin.read().strip()
docs = json.loads(raw).get("documents", []) if raw else []
for d in docs:
    print("   ", d["name"].rsplit("/", 1)[-1])
' >&2
  exit 1
fi

echo "  -> workspace ${WS}"

BODY="$(python3 -c '
import json,sys
plan, status, seats, expires, now, note = sys.argv[1:]
print(json.dumps({"fields": {
    "plan":        {"stringValue": plan},
    "status":      {"stringValue": status},
    "seats":       {"integerValue": seats},
    "expiresAt":   {"integerValue": expires},
    "startedAt":   {"integerValue": now},
    "supportUntil":{"integerValue": "0"},
    "note":        {"stringValue": note},
    "updatedAt":   {"integerValue": now},
}}))
' "$PLAN" ACTIVE "$SEATS" "$EXPIRES" "$NOW" "issued by the owner from Cloud Shell")"

curl -fsS -X PATCH \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  "${API}/licences/${WS}" > /dev/null

echo
echo "Done. ${CODE_UPPER} is on ${PLAN} (${SEATS} accounts), expiry ${EXPIRES}."
echo "0 means it never expires."
echo
echo "On the phone: pull down to refresh, or close and reopen the app."
