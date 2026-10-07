# Pos Stock Check API

A JSON REST API over a company's items, stock, receipts and customers, for
online shops, accounting programs and anything else that wants to connect.
The full guide for users is on the POS website: **Integrations → API**.

```
https://stockcheck-api-52988097941.asia-southeast1.run.app/v1
Authorization: Bearer sck_...      (made under Integrations → Access tokens)
```

| | |
|---|---|
| `GET /items`, `GET /items/{barcode}`, `POST /items` | items, prices in sen |
| `GET /inventory`, `POST /inventory` | stock on hand; set `stock_after` or add `received` |
| `GET /receipts` | sales, newest first, `created_at_min`, `cursor` |
| `GET /customers`, `POST /customers` | customers and points |
| `GET /categories`, `GET /stores` | |

Stock is worked out by `ledger.js`, a copy of `web/js/ledger.js` (CI fails if
they differ), with the same rules as the Android app.

## Deploying

`.github/workflows/deploy-firebase.yml` deploys it to Cloud Run on every
push that touches `api/`, using the `FIREBASE_SERVICE_ACCOUNT` secret. That
account needs, once, in Cloud Shell:

```
P=stockcheck-fb58e
SA=$(gcloud iam service-accounts list --project $P --filter="email~firebase-adminsdk" --format="value(email)")
for r in run.admin cloudbuild.builds.editor iam.serviceAccountUser artifactregistry.admin storage.admin serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding $P --member="serviceAccount:$SA" --role="roles/$r" --condition=None -q >/dev/null && echo "ok $r"
done
```

## Tests

`node lib.test.mjs` here; the end-to-end suite runs against the Firestore
emulator in CI (`.github/workflows/rules-test.yml`, job `api`).
