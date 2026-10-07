# Modules: how Stock Check grows without getting complicated

Customers see four products and a short list of things they can add.
Underneath, every part is a **module** in one registry.

| Customer sees | Module id | Licence key | Status |
|---|---|---|---|
| 盘点通 Stock Take (Android) | `stocktake` | `app` | live |
| 收银通 POS (web) | `pos` | `pos` | live |
| 仓管通 / 仓库与订货 Warehouse | `warehouse` | `warehouse` | live |
| 开放 API | `api` | `api` | live |
| 电商同步 Online store sync | `ecommerce` | `ecommerce` | planned |
| 会计软件连接 Accounting | `accounting` | `accounting` | planned |
| 配送 Delivery | `delivery` | `delivery` | planned |

云后台 (Back Office) is not a module: it is the signed-in website's own
menus (reports, items, staff, settings, Add more), shown according to the
modules above.

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

`enabledModules(licence)` gives the list form, e.g. `['stocktake', 'pos']`.

## One registry, four places that ask it

`web/js/modules.js` (copied to `api/modules.js`; CI checks the copy):

- **Website** — `session.has('warehouse')`, `session.may('pos.void')`;
  menus declare `may: 'pos.reports'` instead of checking plans.
- **API** — `authenticate → tenant → requireModule('api') → requireScope('items.write') → route`
  (`api/middleware.mjs`). Errors keep `{ error: { message } }` and add
  `code`: `UNAUTHENTICATED`, `TENANT_MISMATCH`, `PLAN_INACTIVE`,
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
