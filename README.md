# Stock Check

An Android stock-check / inventory-counting app: barcode scanning, voice-entered
quantities, photographic evidence, user-defined templates, role-based
permissions, an append-only audit trail, and CSV / Excel export.

Kotlin · Jetpack Compose · CameraX · ML Kit · Firebase Auth + Firestore.

---

## What you must do before it runs

The project builds as-is, but it ships with a **placeholder**
`app/google-services.json`. Until you replace it, the app compiles and installs
but cannot sign in.

1. Create a project at <https://console.firebase.google.com> (free Spark plan,
   no credit card).
2. **Authentication → Sign-in method → Email/Password → Enable.**
3. **Firestore Database → Create database** → start in *production mode*.
4. **Project settings → Your apps → Add app → Android.** Register these two
   package names — the debug build has a `.debug` suffix, and both need an entry:
   - `com.stockcheck.app`
   - `com.stockcheck.app.debug`
5. Download `google-services.json` and overwrite `app/google-services.json`.
6. Publish the security rules (see below).

The first account to register becomes the workspace **Admin** and seeds the
built-in roles and starter templates. Everyone who registers afterwards starts
as **Worker** until an admin promotes them on the Profile tab.

### Security rules

`firestore.rules` in this directory is the server-side mirror of the app's
permission model. Paste it into **Firestore Database → Rules → Publish**, or
deploy with the Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

This matters. The in-app permission checks keep the UI honest, but they run on
a device the user controls. The rules are what actually stop a modified client.

### Upgrading an existing workspace

Importing now has its own two permissions, `IMPORT_PRODUCTS` and
`IMPORT_COUNT_SHEET`, instead of riding on `CREATE_STOCK_CHECK` — which every
counter holds, and which therefore let any worker replace the whole catalogue
from a spreadsheet.

Roles seeded before this change do not carry them, so in an existing workspace:

1. **Republish `firestore.rules`.** Overwriting an existing product now needs
   `IMPORT_PRODUCTS`; creating one a scan just found still does not, so naming
   an unknown barcode on the counting screen keeps working.
2. **Tick the two new boxes** on Profile → Roles for whichever roles should
   import. Admin needs nothing done — its permissions are resolved in code.

Until step 2, only an admin can import. That is the safe direction to fail, but
it will look like a bug to a supervisor who imported yesterday.

### Photos and the free tier

Firebase requires a billing-enabled (Blaze) project to use Cloud Storage, even
within its free allowance. So the app ships with cloud photos **off**:
`CloudPhotos.ENABLED = false` in `app/src/main/java/com/stockcheck/app/data/CloudPhotos.kt`.

With it off, photos live only on the capturing phone and travel out with the
export. Their Firestore records still sync, so captions, timestamps and photo
counts are visible everywhere — only the image bytes stay local.

To turn cloud photos on: enable Blaze, turn on Cloud Storage, set `ENABLED` to
`true`. The upload worker then picks up every photo still marked un-uploaded,
including those captured while it was off.

---

## Building

Requires JDK 17 and an Android SDK with API 36. `local.properties` points at the
SDK; edit `sdk.dir` if yours is elsewhere.

```bash
./gradlew assembleDebug                 # build the APK
./gradlew installDebug                  # build and install on a connected device
./gradlew test                          # unit tests (voice parser, xlsx writer)
```

The APK lands in `app/build/outputs/apk/debug/`.

To install manually over ADB:

```bash
C:/Android/Sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## The five pages

| Page | What it does |
|---|---|
| **Stock** | Live camera scans barcodes; a large microphone button in the bottom-right takes spoken quantities. Running totals pinned at the foot. |
| **Photos** | The day's visual record, every photo bound to a stock check so a count can be justified months later. |
| **Templates** | Admin-defined fields per count type. Also sets whether photos are compulsory, and which roles may not edit a given field. |
| **History** | Search and filter past counts, edit within permission, and export to CSV or Excel. |
| **Profile** | Your role and exactly what it permits; for admins, user management, the role/permission matrix, and the audit log. |

### Why the camera is not its own tab

Scanning already uses the camera on the Stock page, so a second camera tab
would duplicate it. The Photos tab is instead the *record* of what was counted —
a different job, and the one that answers "why did you write 24?".

---

## Architecture

```
model/      Permission + PermissionSet (the RBAC core), domain types, built-in roles
data/       Firestore repositories; every write re-checks permissions via Guard.kt
export/     Zero-dependency XLSX writer, CSV writer, permission-narrowed export service
scan/       CameraX + ML Kit barcode analyser; speech recogniser and its grammar
ui/         One package per page, Compose screens plus their ViewModels
```

A few decisions worth knowing:

- **Offline is Firestore's persistent cache, not a second database.** Writes land
  on local disk first and replay when connectivity returns, which covers both
  "counting with no signal" and "the app died mid-shift" without any sync code.
- **Quantities are updated with atomic increments**, so two phones counting the
  same check cannot clobber each other's totals, and queued offline increments
  still add up correctly when replayed.
- **The audit log is append-only** — the rules deny update and delete to
  everyone, admins included. A trail anyone can rewrite is not a trail.
- **XLSX is written by hand** (`export/XlsxWriter.kt`). An xlsx is a zip of XML;
  Apache POI would add tens of megabytes and needs desugaring on Android.
- **Export locking is real.** Cells a role may not change are locked via Excel's
  own sheet protection, not merely greyed out. It stops casual edits, not a
  determined person — the audit trail is what establishes what a record said.
- **Admin's permissions are resolved in code**, not read from its stored list, so
  an admin cannot accidentally revoke their own ability to administer.

---

## Voice input

`scan/VoiceCommandParser.kt` is a pure function of the transcript — no Android
types, fully unit-testable. It understands English and Chinese, including mixed
phrases:

| Said | Understood as |
|---|---|
| "Coca Cola twenty five" | Coca Cola × 25 |
| "可乐 数量 25" | 可乐 × 25 |
| "二十五箱" | 25, unit `ctn` |
| "25" (after a scan) | set the focused line to 25 |
| "9551234567890" | treated as a barcode |

A bare number applies to the most recently touched line, which is what makes
"scan, then say the number" work as one motion. When no quantity is recognised
the app says so and shows the raw transcript rather than inventing a number.

Offline recognition is requested first, so counting keeps working without a
signal — provided the device has the language pack installed.
