# Privacy Policy — Stock Check

**Last updated: 16 September 2026**

Stock Check is a stock-counting app for warehouse and retail staff. This policy
describes what the app collects, why, who it is shared with, and how to get rid
of it.

It is written against what the app actually does. Where something is not
collected, it says so.

---

## Who controls your data

Stock Check is workspace software. When your employer creates a workspace, they
decide who may join it and what each person may see. **Your employer is the
controller of the counting records made in their workspace**; the app's
publisher provides the software and the hosting that stores it.

If you count stock at work, questions about your own records go to your
employer first. Deleting your account is yours to do and is described below.

---

## What the app collects

### Account
- **Email address** — your sign-in identity.
- **Password** — held by Google Firebase Authentication, hashed. It is never
  readable by the app, by your employer, or by an administrator. An
  administrator can trigger a reset email; they cannot see what you chose.
- **Display name** and **role** — shown to colleagues in the same workspace so a
  count can be attributed to a person.
- **Company code** — the workspace you belong to.

### Counting records
- Barcodes, product names, quantities, units, and any custom fields your
  employer's template defines.
- The stock check a count belongs to, its status, and its counting area.
- Timestamps, and the account that made each entry.

### Camera
Used **only** to read barcodes while the counting screen is open, and to take
photographs when you press the shutter. The camera preview is not recorded, and
nothing is sent anywhere while scanning. Barcode recognition runs on the phone.

### Microphone
Used **only** while you hold the voice button on the counting screen, to turn
what you say into a quantity.

Speech recognition is requested from the phone's offline recogniser first. If
the device has no offline language pack installed, Android's speech service may
send the audio to Google to transcribe it. That is Android's own speech
recognition, and Google's privacy policy governs it. The app stores the
transcript of the phrase alongside the count so a disputed number can be
checked; it does not store the audio.

### Photographs
Photographs you take are **stored on the phone that took them**. Their captions,
timestamps and which stock check they belong to are synced so colleagues can see
that a photo exists; the image itself is not uploaded.

If your employer enables cloud photo storage, the images are uploaded to Google
Firebase Storage and become visible to colleagues whose role permits it. The app
ships with this switched off.

### Device information
Google Firebase collects technical information needed to run the service —
device model, operating system version, IP address, and diagnostic data about
crashes and connectivity.

### What the app does NOT collect
- No advertising identifiers. There is no advertising in this app.
- No location, GPS or precise position.
- No contacts, calendar, SMS or call data.
- No browsing or usage data sold or shared for marketing.
- No biometric data. Signatures you draw are stored as drawings, not analysed.

---

## Why it is collected

| What | Why |
|---|---|
| Email, password | To sign you in and keep your workspace separate from others |
| Name, role | To show who counted what, and to enforce what each role may do |
| Counting records | They are the product: the stock count your employer needs |
| Camera | To read barcodes and take the photographs you choose to take |
| Microphone | To enter quantities by voice while your hands are full |
| Audit entries | To establish what a record said and who changed it |
| Device information | To run the service and diagnose faults |

There is no profiling, no automated decision-making about you, and no
advertising.

---

## Who it is shared with

- **Colleagues in your workspace**, as your employer's role settings permit.
- **Google Firebase** (Authentication, Cloud Firestore, and Cloud Storage where
  your employer has enabled it) — the hosting the app runs on.
- **Android's speech recognition service**, in the circumstances described
  above.
- **Nobody else.** Your data is not sold, rented, or shared with advertisers or
  data brokers.

It may be disclosed if required by law, or to establish or defend a legal claim.

---

## How long it is kept

Counting records and audit entries are kept for as long as your employer keeps
their workspace. They are business records of that company's stock.

---

## Deleting your account

You can delete your own account inside the app: **Profile → Delete my account**.
You will be asked for your password to confirm.

**What is deleted:**
- Your sign-in account, including your email address and password.
- Your workspace profile: your display name and your role.

**What is kept, and why:**
- The stock counts you recorded. They belong to your employer's count, not to
  you, and removing them would falsify a stock record that other people have
  relied on.
- The audit entries showing what was counted and changed. The audit trail is
  append-only by design — nobody, including an administrator or the publisher,
  can edit or remove an entry. A record that could be erased by closing an
  account would not be a record. These entries identify the account that acted;
  entries written before an account was deleted retain the display name that
  account had at the time.

This retention is for the integrity of a business and accounting record. If you
believe it should not apply to you, contact your employer, who controls the
workspace, or write to the address below.

**If you cannot get into the app** — you have left the company, or you no longer
have the device — email the address below from the address on the account, and
ask for it to be deleted. Requests are answered within 30 days.

If you are the only administrator of a workspace, the app will ask you to make
someone else an administrator first, so the company is not left with records
nobody can manage.

---

## Your rights

Depending on where you live, you may have the right to ask for a copy of your
data, to have it corrected, to have it deleted, or to object to how it is used.
Use the contact below. Proof that you are the account holder may be required.

The export feature in the app produces a copy of the counting data your role can
see, as CSV or Excel.

---

## Security

- Traffic between the app and Firebase is encrypted in transit.
- Server-side security rules mirror the app's own permission model, so a
  modified copy of the app cannot read or write what the role may not.
- Passwords are hashed by Firebase Authentication and are not readable by
  anyone.
- Exports can be protected with a password set by your employer's administrator.

No system is perfectly secure, and the app is one part of a company's own
arrangements for its data.

---

## Children

Stock Check is workplace software and is not directed at children. It is not
intended for anyone under 16.

---

## Changes

Material changes to this policy will be notified in the app before they take
effect. The date at the top shows when it was last revised.

---

## Contact

<!--
  REPLACE BEFORE PUBLISHING. Google Play requires a working contact route, and
  this policy must be reachable at a public URL that does not require signing
  in -- both in the Play Console listing and from inside the app.
-->

**[YOUR CONTACT EMAIL]**

**[YOUR COMPANY NAME AND POSTAL ADDRESS]**
