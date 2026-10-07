/**
 * Personal data the PDPA way (Personal Data Protection Act 2010): a
 * customer who asks to be removed is locked away at once -- hidden from the
 * till and from marketing -- and erased for good 90 days later. The 90 days
 * are for a mistake to be put right or a dispute about a sale to be
 * settled; after that nothing about them stays, not even on old receipts,
 * which keep their amounts but lose the name and phone number.
 *
 * Pure (pdpa.test.mjs). The pages and the nightly job do the writing.
 */

export const LOCK_DAYS = 90;
const DAY = 86_400_000;

/** The fields that make an unsubscribed customer locked. */
export function unsubscribeFields(now = Date.now(), byUid = '', reason = '') {
  return {
    status: 'UNSUBSCRIBED',
    marketingOptIn: false,
    unsubscribedAt: now,
    unsubscribedByUid: byUid,
    unsubscribeReason: reason,
    purgeAfter: now + LOCK_DAYS * DAY,
    updatedAt: now,
  };
}

/** Undoing it, inside the 90 days, when the customer asks to stay after all. */
export function restoreFields(now = Date.now()) {
  return { status: 'ACTIVE', unsubscribedAt: null, unsubscribedByUid: null, unsubscribeReason: null, purgeAfter: null, updatedAt: now };
}

/** ACTIVE, LOCKED (inside the 90 days) or DUE (past them: erase now). */
export function pdpaState(customer, now = Date.now()) {
  if (customer?.status !== 'UNSUBSCRIBED') return 'ACTIVE';
  const after = customer.purgeAfter ?? (customer.unsubscribedAt || 0) + LOCK_DAYS * DAY;
  return now >= after ? 'DUE' : 'LOCKED';
}

export const isLocked = (customer, now = Date.now()) => pdpaState(customer, now) !== 'ACTIVE';

/** Whole days left before erasing; 0 once due. */
export function daysLeft(customer, now = Date.now()) {
  if (customer?.status !== 'UNSUBSCRIBED') return null;
  const after = customer.purgeAfter ?? (customer.unsubscribedAt || 0) + LOCK_DAYS * DAY;
  return Math.max(0, Math.ceil((after - now) / DAY));
}

/** Customers whose 90 days are over. */
export const duePurge = (customers, now = Date.now()) => customers.filter((c) => pdpaState(c, now) === 'DUE');

/** "A*** (••••4567)": what the screens show of a locked customer. */
export function maskCustomer(c) {
  const name = String(c?.name || '');
  const phone = String(c?.phone || '').replace(/\D/g, '');
  return `${name ? `${name[0]}***` : '***'}${phone ? ` (••••${phone.slice(-4)})` : ''}`;
}

/** What to blank on a sale once its customer is erased: the amounts stay. */
export const SALE_SCRUB = { customerId: '', customerName: '', customerPhone: '', customerErased: true };

/** The customers as rows for Excel (the export a customer or the PDPA officer asks for). */
export function customerRows(customers, now = Date.now()) {
  const iso = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
  return [
    ['ID', 'Name', 'Phone', 'Email', 'Points', 'Visits', 'Total spent (RM)', 'Last visit', 'Created', 'Marketing consent', 'PDPA status', 'Unsubscribed', 'Erase on'],
    ...customers.map((c) => [
      c.id || '', c.name || '', c.phone || '', c.email || '', c.points || 0, c.visits || 0,
      Math.round(c.totalSpentSen || 0) / 100, iso(c.lastVisitAt), iso(c.createdAt),
      c.marketingOptIn === false ? 'No' : 'Yes', pdpaState(c, now), iso(c.unsubscribedAt), iso(c.purgeAfter),
    ]),
  ];
}
