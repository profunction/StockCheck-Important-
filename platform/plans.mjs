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

// Launch pricing: roughly 30% below the original list price, to get the
// first customers in rather than to be what this app charges forever.
// Raising it later is changing these six numbers and their six mirrors in
// Licence.kt -- nothing else has to move, because everything downstream
// (the export, the paywall, Play's own product prices once entered in the
// Console) reads the plan, not a price baked in anywhere else.
export const PLANS = {
  TRIAL: {
    label: 'Trial',
    seats: 5,
    monthlySen: 0,
    yearlySen: 0,
    lifetimeSen: 0,
  },
  STARTER: {
    label: 'Starter',
    seats: 5,
    monthlySen: 4_800,
    yearlySen: 48_000,
    lifetimeSen: 168_000,
  },
  BUSINESS: {
    label: 'Business',
    seats: 20,
    monthlySen: 11_800,
    yearlySen: 118_000,
    lifetimeSen: 418_000,
  },
  UNLIMITED: {
    label: 'Unlimited',
    // Firestore holds this as a plain number; the app treats anything past
    // half of Int.MAX_VALUE as "no limit" rather than trusting an exact
    // sentinel to survive a round trip through JSON and back.
    seats: 2_000_000_000,
    monthlySen: 22_800,
    yearlySen: 228_000,
    lifetimeSen: 798_000,
  },
};

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
  return p[t.field];
}

/** "RM 1,688" — the form the price list and every invoice uses. */
export function ringgit(sen) {
  const whole = Math.floor(sen / 100);
  const cents = sen % 100;
  const grouped = whole.toLocaleString('en-MY');
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
