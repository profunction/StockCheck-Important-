# Modules: how SuXin grows without getting complicated

SuXin — *One Business. Connected.* (formerly Pos Stock Check / Stock Check).
Only names on screen changed: the Android package `com.stockcheck.app`,
Firestore paths, licence keys, URLs and saved settings are unchanged.

Customers see four products and a short list of things they can add.
Underneath, every part is a **module** in one registry.

| Customer sees | Module id | Licence key | Status |
|---|---|---|---|
| SuXin Count 盘点通 (Android) | `count` | `app` | live |
| SuXin POS 收银通 (web) | `pos` | `pos` | live |
| SuXin Warehouse 仓管通 | `warehouse` | `warehouse` | live |
| SuXin Procurement (purchase orders, suppliers, 网购进货 online purchases) | `procurement` (needs `warehouse`) | `warehouse` | live |
| SuXin Tax (SST, LHDN e-invoice) | `tax` (needs `pos`) | `pos` | live |
| Open API | `api` | `api` | live |
| SuXin Accounting | `accounting` | `accounting` | planned |
| SuXin Logistics 配送 | `logistics` | `logistics` | planned |
| SuXin B2B | `b2b` | `b2b` | planned |

Each entry also lists `menuItems`, `routes` and `apiScopes`. Planned
modules are never on, whatever a licence says.

SuXin Cloud 云后台 is not a module: it is the signed-in website itself. Its
dashboard (`web/js/dashboard.js`, menu `#/cloud`) shows today's sales only
with the POS and `POS_REPORTS`, stock with Count or POS, and orders to
receive / transfers on the way only with SuXin Warehouse.

## Where a company's modules come from

`licences/{workspaceId}` — written only by the platform (payments, the
licence CLI). Customers cannot write it, so they cannot switch on a paid
part themselves. There is no separate `tenants/` document: tenant id =
workspace id, and a second copy of the same facts would drift.

1. The licence's `modules` map wins (`{ app: true, pos: true, ... }`).
2. A licence without one: what its plan includes (`platform/plans.mjs`).
3. No licence at all (companies from before plans): stock take, POS and
   warehouse, as the database rules have always allowed.

An expired licence hides nothing; it only stops new work (counts), which
is decided by the licence status, not by modules.

`enabledModules(licence)` gives the list form, e.g. `['count', 'pos', 'tax']`.

## One registry, four places that ask it

`web/js/modules.js` (copied to `api/modules.js`; CI checks the copy):

- **Website** — `session.has('warehouse')`, `session.may('pos.void')`;
  menus declare `may: 'pos.reports'` instead of checking plans.
- **API** — `authenticate → tenant → requireModule('api') → requireScope('items.write') → route`
  (`api/middleware.mjs`). Errors keep `{ error: { message } }` and add
  `code` (a module that is off also names it: `{ error: { code: 'MODULE_NOT_ENABLED', module: 'api', message } }`): `UNAUTHENTICATED`, `TENANT_MISMATCH`, `PLAN_INACTIVE`,
  `MODULE_NOT_ENABLED`, `PERMISSION_DENIED`.
- **Database rules** — `moduleOff('pos' | 'app' | 'warehouse')` in
  `firestore.rules`, the same rule for a licence with a modules map.
- **Android** — `Licence.allows("app")` in `model/Licence.kt`.

A module being on never means everyone may use it: each action lists the
existing permissions it needs (`can(who, 'warehouse.approve')` needs the
module on *and* `WH_APPROVE`). API tokens may carry `scopes`; a token
without scopes (all made before scopes existed) keeps every right.

## Adding a module

1. One entry in `MODULES` (id, licence key, status `planned`, dependencies,
   actions → existing permissions, customer name in zh/en/ms); copy to api/.
2. Customer words for Settings → Add more in `web/js/strings-pro.js`
   (`addonAsk_<id>`, `addonWhat_<id>`).
3. Its screens: menu entries with `may: '<id>.<action>'`.
4. Its API routes: `requireModule('<id>')` and a scope per route.
5. Rules: `!moduleOff('<key>')` on the writes that start its work.
6. Plans: add the key to the plans that include it; change status to
   `live` only when it really works.
7. Tests: registry (on/off/dependency), API (module off → 403), UI
   (off → hidden), rules.

## Online purchases (网购进货)

Stock bought on Pinduoduo, Taobao, Shopee, TikTok Shop or Lazada becomes a
purchase order (`web/wh/online.js`, reader in `web/js/onlineorder.js`).
These platforms give buyers no API for their orders, so the order is pasted
as text and read; the person checks it before saving. The order keeps
`source: 'ONLINE'`, `onlinePlatform`, `onlineOrderNo`, `trackingNo`,
`currency`, `fxRateMicro` (RM per unit x 1e6) and `shippingSen`; each line
keeps `sourceTitle`, which is how a product is matched again next time. Stock
changes only when the parcel is received (scan its tracking number on
Receive). Part of the procurement module: `may: 'procurement.purchase'`.

## Apps, sign-up and locks

- **App centre** `/app/` (`web/hub/main.js`, `web/js/apps.js`): one sign-in, then SuXin Count,
  POS, Cloud and Warehouse. An app the plan does not include is shown locked with where to add
  it; every app's sidebar carries the same switcher.
- **SuXin Count on the web** `/count/` (`web/cnt/`): writes the same `stockChecks` and `items` as
  the Android app (reference numbers from `meta/counters`, increments for edits), so a count can
  be started on one and finished on the other.
- **Sign-up** (`web/js/signup.js`): a new company (founder is admin: code claimed, built-in roles
  from `web/js/roles.js` — checked against `BuiltInRoles.kt` — profile, then settings, trial and
  the user index) or joining with the company code as a Worker. Forgotten password: email and
  company code; Firebase mails the link to that email. The rules allow the admin role only to
  the person who claimed the company's code.
- **Till mode** is chosen once; afterwards only an admin changes it, on Profile, after typing
  their password (`web/js/profile.js`; the rules refuse a mode change by anyone but an admin).
- **Till lock** (`web/js/tilllock.js`): a counter computer can be locked to the register; an
  admin's email and password lock and unlock it. The other apps send a locked computer back to
  the till. It locks screens; roles and rules still decide what each person may do.

## Guides with a voice

Every app and every job in it has a guide section with a short video
(`web/js/guides.js`, shown on each app's "How to use" page and on `/guide/`,
which has tabs for the account, SuXin Count, POS, Warehouse and Cloud).

- The videos are filmed by `tools/videos/record.mjs` in the pretend shop of
  `world.mjs`: `node tools/videos/record.mjs` films them all, or name some.
- Each caption and title is also saved, with the moment it appeared, in
  `web/videos/<name>.webm.json`.
- While a video plays, `web/js/narrate.js` reads those steps aloud with the
  viewer's own device voice (Chinese or English; Malay pages use the English
  line until Malay captions are added). The video waits while a step is
  read. Viewers can switch the voice off; the choice is kept.
- The voice is not inside the video file: there is no speech engine where
  the videos are made. A downloaded video is silent, with its captions.
- After filming again, raise `?v=` in `guides.js` so browsers do not show a
  cached old video with the new steps.
