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
node licence-cli.mjs trial   UPOINT --days 14 --email boss@company.com
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
