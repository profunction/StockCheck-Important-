# Modules: how JEXO grows without getting complicated

JEXO — *One Business. Connected.* (formerly Pos Stock Check / Stock Check).
Only names on screen changed: the Android package `com.stockcheck.app`,
Firestore paths, licence keys, URLs and saved settings are unchanged.

Customers see four products and a short list of things they can add.
Underneath, every part is a **module** in one registry.

| Customer sees | Module id | Licence key | Status |
|---|---|---|---|
| JEXO Count 盘点通 (Android) | `count` | `app` | live |
| JEXO POS 收银通 (web) | `pos` | `pos` | live |
| JEXO Warehouse 仓管通 | `warehouse` | `warehouse` | live |
| JEXO Procurement (purchase orders, suppliers, 网购进货 online purchases) | `procurement` (needs `warehouse`) | `warehouse` | live |
| JEXO Tax (SST, LHDN e-invoice) | `tax` (needs `pos`) | `pos` | live |
| Open API | `api` | `api` | live |
| JEXO Accounting | `accounting` | `accounting` | planned |
| JEXO Logistics 配送 | `logistics` | `logistics` | planned |
| JEXO B2B | `b2b` | `b2b` | planned |

Each entry also lists `menuItems`, `routes` and `apiScopes`. Planned
modules are never on, whatever a licence says.

JEXO Cloud 云后台 is not a module: it is the signed-in website itself. Its
dashboard (`web/js/dashboard.js`, menu `#/cloud`) shows today's sales only
with the POS and `POS_REPORTS`, stock with Count or POS, and orders to
receive / transfers on the way only with JEXO Warehouse.

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
