# Platform

Licence administration and payment webhooks. **Never shipped to a device.**

Everything here runs with a service-account key, which is root on the Firestore
database — it bypasses `firestore.rules` entirely. That is the point: a licence
the customer can edit is not a licence. It is also the reason nothing in this
folder may ever be bundled into the app, published, or committed.

```
platform/
  plans.mjs          the price list, mirroring the Kotlin Plan enum
  licences.mjs       the only code allowed to write /licences/{workspaceId}
  licence-cli.mjs    grant, extend, suspend, check seats
  server.mjs         Stripe and ToyyibPay webhooks
```

## Setup

**1. Get a service-account key**

Firebase console → Project settings → Service accounts → *Generate new private
key*. Save it as `platform/service-account.json`. It is gitignored; keep it out
of anywhere it could be synced or shared.

**2. Install**

```
cd platform
npm install
```

**3. Check it can see the database**

```
npm run licence -- list
```

## Day-to-day

A customer quotes their **join code** (`UPOINT`), never a workspace id, so every
command takes either.

```
node licence-cli.mjs list                              every company, soonest expiry first
node licence-cli.mjs show    UPOINT
node licence-cli.mjs trial   UPOINT --days 3 --email boss@company.com
node licence-cli.mjs grant   UPOINT BUSINESS yearly
node licence-cli.mjs grant   UPOINT BUSINESS lifetime
node licence-cli.mjs extend  UPOINT 30
node licence-cli.mjs suspend UPOINT "chargeback"
node licence-cli.mjs resume  UPOINT
node licence-cli.mjs seats   UPOINT                    accounts used vs allowed
```

Every new company needs `trial` run against it. Until a licence document exists
the company is treated as unprovisioned, which **allows** work — see
`licenceAllowsNewWork()` in `firestore.rules`. That default is deliberate: a
company that signs up and is immediately refused has been told the product is
broken. The cost is that a company nobody provisions uses the app free forever,
so `list` is worth running weekly.

## What the licence actually enforces

| | Enforced by | Real? |
|---|---|---|
| Expiry / suspension blocks **new stock checks** | `firestore.rules` | Yes — server-side |
| Reading, finishing, exporting, backing up | never blocked | By design |
| **Seat limit** | app only | **No** — see below |

Firestore rules cannot count documents, so a seat limit cannot be enforced the
way expiry is. The app refuses to create the eleventh account; a modified client
would not. `licence-cli.mjs seats UPOINT` is how an overage gets noticed, and
that is the honest state of it until there is a server in the create-user path.

Expiry stops **new counts only**. Someone halfway through a warehouse when a
card bounces can finish, save and export. Holding a customer's own data hostage
over a billing problem turns a renewal into a complaint.

## Payments

`server.mjs` is a small Node process. It cannot be a Cloud Function — those need
the Blaze plan, and this project is deliberately on Spark — and it cannot be in
the app, because it needs the service-account key. Any host that can hold a
secret will do; it handles a few requests a day.

```
cp .env.example .env     # fill in
node server.mjs
```

**Stripe** — add the endpoint at dashboard.stripe.com/webhooks:

```
https://your-host/webhook/stripe
events: checkout.session.completed, invoice.paid, customer.subscription.deleted
```

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. Without it the webhook
refuses everything, which is correct: the URL is public, and an unverified POST
would let anyone grant themselves a lifetime licence with `curl`.

**ToyyibPay** — for FPX. Local companies pay by bank transfer, not card, and
ToyyibPay charges about RM 1 a transaction against Stripe's percentage. Set the
callback to `https://your-host/webhook/toyyibpay` and put what was bought in
`order_id` as `WORKSPACE|PLAN|TERM`. ToyyibPay has no signature scheme, so
nothing its callback says is believed until the bill is read back from its own
API.

**Starting a payment**

```
curl -X POST https://your-host/checkout \
  -H 'content-type: application/json' \
  -d '{"company":"UPOINT","plan":"BUSINESS","term":"yearly","email":"boss@co.com"}'
```

Returns a Stripe Checkout URL. Deliberately not callable from the app: an app
that could start a checkout would have to carry these keys.

## Before the first real payment

- [ ] Run the whole flow on `sk_test_...` keys and confirm the licence document changed
- [ ] Confirm a **renewal** works — Stripe can simulate one; `invoice.paid` is a different code path from the first purchase
- [ ] Confirm a cancelled subscription sets `EXPIRED`
- [ ] Back up `service-account.json` somewhere that is not this machine
- [ ] Decide what happens on a chargeback (`suspend`, not delete)

## Paying

Everything a customer can pay with lives on one page, `GET /buy?company=CODE`,
which is what the app opens when it refuses to start a count. Keeping it here
rather than in the app is why the app has no card fields, no payment state and
nothing extra to get past review — and why adding a gateway is a change to one
page instead of a release.

What a method can do decides where it appears:

| Method | Recurring | One-off | Through |
|---|---|---|---|
| Card | yes | yes | Stripe |
| Google Pay / Apple Pay | yes | yes | Stripe — a card wearing a different button, nothing to integrate |
| FPX online banking | **no** | yes | Stripe, or ToyyibPay |
| GrabPay | **no** | yes | Stripe |
| ToyyibPay wallets | **no** | yes | ToyyibPay |
| Bank transfer | — | yes | by hand: slip by email, then `licence-cli.mjs grant` |
| Google Play | yes | — | in-app, verified at `/play/verify` |

Only a card can be charged again next month. FPX and the wallets settle once
and never come back, so they are offered against the one-off terms only —
selling a subscription through one would sell somebody a plan that quietly
lapses.

**Touch 'n Go eWallet** is not on this list. Stripe does not carry it, and
whether ToyyibPay settles it is a question for ToyyibPay rather than something
to assert here. If it turns out they do not, it needs a Malaysian gateway that
does, and that is one more `/…/create` endpoint and one more webhook beside
the two already here.

**PayNow** is Singapore and settles in SGD. Every price in `plans.mjs` is in
MYR, so it needs an SGD price list before it can be offered at all.

### Extra environment

```
GOOGLE_PLAY_PACKAGE   com.stockcheck.app — for verifying Play purchases
BANK_NAME             shown on /buy; omit all four to hide the section
BANK_ACCOUNT
BANK_HOLDER
SUPPORT_EMAIL         where a transfer slip is sent
```

Google Pay, Apple Pay, FPX and GrabPay each also have to be switched on in the
Stripe dashboard. The code asks for them; the account has to be allowed to
take them.

---

# Deploying, so Google Play can sell a licence

Play Billing has no manual route. A purchase on a phone is a token, and a
token is worth nothing until something asks Google whether it is real — so
there has to be a server, reachable from the internet, holding a credential
the phone does not have.

This deploys to **Cloud Run**, which is the same Google account as Firebase and
the same account as Play. That is the only reason to prefer it: one identity
instead of three, and the service account that verifies a purchase is the one
the container already runs as.

At the volume this app will see, Cloud Run costs roughly nothing — it bills
per request and scales to zero between them. It does require a billing account
on the project, which also moves Firebase from Spark to Blaze. Blaze is also
per-use, and the same usage that was free on Spark stays free on Blaze.

## Once, before the first deploy

The quickest way through this is **Cloud Shell** — a terminal in the browser,
at console.cloud.google.com, with gcloud already installed and already signed
in. Nothing to download, and no difference between Windows, Mac and Linux.

From `platform/`, or with this repository cloned there:

```bash
bash setup-gcp.sh YOUR_PROJECT_ID
```

It checks billing, enables the APIs, creates the service account, grants it
Firestore access, and prints the address to paste into Play Console along with
a generated `ADMIN_TOKEN`. It changes nothing that is already correct, so a run
that stopped halfway can just be repeated.

The rest of this section is what that script does, for when it needs doing by
hand.

**1. Turn on billing** for the Firebase project, and enable the APIs:

```bash
gcloud services enable run.googleapis.com \
                       cloudbuild.googleapis.com \
                       androidpublisher.googleapis.com
```

**2. Make a service account for the server**, so it is not using a human's
identity or the default one:

```bash
gcloud iam service-accounts create stockcheck-payments \
  --display-name "StockCheck payments server"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member "serviceAccount:stockcheck-payments@PROJECT_ID.iam.gserviceaccount.com" \
  --role roles/datastore.user
```

`datastore.user` is Firestore read and write, which is what writing a licence
needs. It is not `roles/owner`; the server never needs to change a rule, a
bucket or another service.

**3. Give that same service account Play access.** In Play Console →
**Users and permissions** → **Invite new user**, paste
`stockcheck-payments@PROJECT_ID.iam.gserviceaccount.com`, and grant
**View financial data** and **Manage orders and subscriptions** for this app.

This is the step with the longest tail: Google can take a few hours to
propagate it, and until it does, verification returns a 401 that looks exactly
like a wrong key.

## Deploy

From `platform/`:

```bash
gcloud run deploy stockcheck-payments \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --service-account stockcheck-payments@PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars GOOGLE_PLAY_PACKAGE=com.stockcheck.app
```

`asia-southeast1` is Singapore — the closest region to Malaysia.

`--allow-unauthenticated` is right here and worth being clear about: the
callers are Google Play, Stripe and a customer's browser, none of which can
hold a Google identity. Every route does its own checking — a Stripe webhook
verifies its signature, a Play token is verified against Google, and the admin
lookup wants `ADMIN_TOKEN`. The routes are public; nothing they do is.

It prints a URL. That URL is `PLATFORM_URL`.

## The rest of the environment

```bash
gcloud run services update stockcheck-payments --region asia-southeast1 \
  --set-env-vars \
GOOGLE_PLAY_PACKAGE=com.stockcheck.app,\
PUBLIC_URL=https://YOUR-RUN-URL,\
ADMIN_TOKEN=$(openssl rand -hex 24),\
SUPPORT_EMAIL=you@company.com
```

Secrets — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TOYYIBPAY_SECRET_KEY`
— belong in Secret Manager rather than in `--set-env-vars`, where they are
visible to anyone who can describe the service:

```bash
echo -n "sk_live_..." | gcloud secrets create stripe-secret --data-file=-

gcloud run services update stockcheck-payments --region asia-southeast1 \
  --set-secrets STRIPE_SECRET_KEY=stripe-secret:latest
```

None of the Stripe or ToyyibPay variables are needed for Play Billing. Set
them when you want the web checkout too.

## Check it

```bash
curl https://YOUR-RUN-URL/health
```

`{"ok":true,...}` means it started and can reach Firestore. The other flags
report which payment routes are configured; all false is fine if Play is the
only one you are using.

## Then point the app at it

In `app/build.gradle.kts`:

```kotlin
buildConfigField("String", "PLATFORM_URL", "\"https://YOUR-RUN-URL\"")
buildConfigField("String", "BUY_URL", "\"https://YOUR-RUN-URL/buy\"")
```

Rebuild, and upload that build to Play. **Play Billing does nothing in a
side-loaded APK** — the connection succeeds, the product list comes back
empty, and the app shows the web checkout instead. It has to be installed from
Play, which means at minimum an internal testing track.

## Why the phone is not trusted

A purchase never grants anything from the device. The phone completes the
purchase, hands the token to this server, and the server asks Google. Only
then is a licence written, by the one identity `firestore.rules` allows to
write `/licences`.

Acknowledgement also happens here, after the grant. Google voids an
unacknowledged purchase after three days, which is the right way round: a
purchase that could not be verified should end in the customer's money coming
back, not in a licence nobody granted.
