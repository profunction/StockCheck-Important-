// The price list, in one place.
//
// Mirrors the Plan enum in app/src/main/java/com/stockcheck/app/model/Licence.kt.
// Two copies is one copy too many, but the alternative is the phone asking a
// server for the price list before it can draw a screen, and this app has to
// work in a warehouse basement. The licence document's own `seats` always wins
// over the number here, so a deal done by hand is never overruled by a
// price-list edit.
//
// Amounts are in sen. Nothing here is ever a floating-point number: RM 16.80
// as 16.8 is a value neither Stripe nor a bank statement agrees with.

// Two packs.
//
// A, All-in-One: the phone app, the till and the warehouse system on one
// stock, priced by accounts. Business adds branches and the Loyverse sync,
// Unlimited adds the open API. Only these three are sold for life, and only
// LIFETIME_CAP of them in all.
//
// B, Standalone: one piece on its own, for a shop that only needs that
// piece. The app alone (counting, stock, Loyverse write-back; no till), the
// till alone (sales, SST, reports, up to two tills; no deep counting in the
// app), or the API alone.
//
// [modules] is what a plan switches on. The licence document carries its own
// copy, written by updateTenantSubscription, and that copy wins -- so a deal
// done by hand is never overruled by an edit to this list (see entitlements).
//
// This file is copied, unchanged, to web/js/plans.js and api/plans.js; CI
// checks the copies match. Licence.kt mirrors the numbers.
const UNLIMITED_SEATS = 2_000_000_000;

export const PLANS = {
  TRIAL: {
    label: 'Trial', pack: 'TRIAL', seats: 5, tills: 2,
    monthlySen: 0, yearlySen: 0, lifetimeSen: 0,
    modules: { app: true, pos: true, warehouse: true, api: true },
    multiBranch: true, loyverse: true,
  },
  STARTER: {
    label: 'Starter', pack: 'ALL_IN_ONE', seats: 5, tills: UNLIMITED_SEATS,
    monthlySen: 4_800, yearlySen: 48_000, lifetimeSen: 168_000,
    modules: { app: true, pos: true, warehouse: true, api: false },
    multiBranch: false, loyverse: false,
  },
  BUSINESS: {
    label: 'Business', pack: 'ALL_IN_ONE', seats: 20, tills: UNLIMITED_SEATS,
    monthlySen: 11_800, yearlySen: 118_000, lifetimeSen: 418_000,
    modules: { app: true, pos: true, warehouse: true, api: false },
    multiBranch: true, loyverse: true,
  },
  UNLIMITED: {
    // Firestore holds this as a plain number; the app treats anything past
    // half of Int.MAX_VALUE as "no limit" rather than trusting an exact
    // sentinel to survive a round trip through JSON and back.
    label: 'Unlimited', pack: 'ALL_IN_ONE', seats: UNLIMITED_SEATS, tills: UNLIMITED_SEATS,
    monthlySen: 22_800, yearlySen: 228_000, lifetimeSen: 798_000,
    modules: { app: true, pos: true, warehouse: true, api: true },
    multiBranch: true, loyverse: true,
  },
  APP_ONLY: {
    label: 'SuXin Barcode Scan', pack: 'STANDALONE', seats: 3, tills: 0,
    monthlySen: 2_800, yearlySen: 28_000, lifetimeSen: null,
    modules: { app: true, pos: false, warehouse: false, api: false },
    multiBranch: false, loyverse: true,
  },
  POS_ONLY: {
    // The till's own staff still sign in, so it has accounts as well as tills.
    label: 'POS', pack: 'STANDALONE', seats: 5, tills: 2,
    monthlySen: 3_800, yearlySen: 38_000, lifetimeSen: null,
    modules: { app: false, pos: true, warehouse: true, api: false },
    multiBranch: false, loyverse: false,
  },
  API_ONLY: {
    label: 'API', pack: 'STANDALONE', seats: 1, tills: 0,
    monthlySen: 6_800, yearlySen: 68_000, lifetimeSen: null,
    modules: { app: false, pos: false, warehouse: false, api: true },
    multiBranch: false, loyverse: false,
  },
};

/** How many lifetime licences are ever sold, all plans together. */
export const LIFETIME_CAP = 50;

export const isUnlimited = (n) => n >= UNLIMITED_SEATS / 2;

/**
 * What a company may use, from its licence: the licence's own modules,
 * seats and tills where it has them (a hand-made deal), the price list's
 * for its plan otherwise. No licence, or one that has run out or been
 * suspended, allows nothing new -- reading what is there stays open, and
 * that is decided elsewhere.
 */
export function entitlements(licence, now = Date.now()) {
  const spec = PLANS[licence?.plan] || PLANS.TRIAL;
  const active = Boolean(licence) && (licence.status ?? 'ACTIVE') === 'ACTIVE'
    && (!licence.expiresAt || licence.expiresAt > now);
  const own = licence?.modules && typeof licence.modules === 'object' ? licence.modules : {};
  const modules = Object.fromEntries(Object.keys(spec.modules).map((k) => [k, active && (k in own ? own[k] === true : spec.modules[k])]));
  return {
    plan: licence?.plan || null,
    pack: spec.pack,
    active,
    modules,
    multiBranch: active && (licence?.multiBranch ?? spec.multiBranch),
    loyverse: active && (licence?.loyverse ?? spec.loyverse),
    seats: licence?.seats ?? spec.seats,
    tills: licence?.tills ?? spec.tills,
  };
}

/** The plans one pack sells, for a price list. */
export const plansIn = (pack) => Object.entries(PLANS).filter(([, p]) => p.pack === pack).map(([id, p]) => ({ id, ...p }));

export const TERMS = {
  monthly: { label: 'Monthly', months: 1, field: 'monthlySen', recurring: true },
  yearly: { label: 'Yearly', months: 12, field: 'yearlySen', recurring: true },
  lifetime: { label: 'Lifetime', months: 0, field: 'lifetimeSen', recurring: false },
};

/** How long a new company gets before anyone has to decide anything. */
export const TRIAL_DAYS = 14;

/**
 * Updates and support included with a lifetime purchase.
 *
 * The app keeps working forever; this is when the help stops. Kept explicit
 * because "lifetime" with no such boundary is a promise to maintain an
 * Android app against Google's yearly targetSdk deadlines, for one payment,
 * until one of the two companies stops existing.
 */
export const LIFETIME_SUPPORT_MONTHS = 24;

export const CURRENCY = 'myr';

export function priceSen(plan, term) {
  const p = PLANS[plan];
  const t = TERMS[term];
  if (!p) throw new Error(`Unknown plan: ${plan}`);
  if (!t) throw new Error(`Unknown term: ${term}`);
  if (p[t.field] == null) throw new Error(`${p.label} is not sold ${t.label.toLowerCase()}`);
  return p[t.field];
}

/** "RM 1,688" — the form the price list and every invoice uses. */
export function ringgit(sen) {
  const whole = Math.floor(sen / 100);
  const cents = sen % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return cents === 0 ? `RM ${grouped}` : `RM ${grouped}.${String(cents).padStart(2, '0')}`;
}

/** Adds whole months without landing on the 31st of a month that has 30 days. */
export function addMonths(millis, months) {
  const date = new Date(millis);
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() < day) date.setDate(0);
  return date.getTime();
}

export function addDays(millis, days) {
  return millis + days * 86_400_000;
}
