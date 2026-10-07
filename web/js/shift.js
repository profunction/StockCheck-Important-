/**
 * The sums of a cashier's shift: what came in by each way of paying, what
 * was voided and discounted, and how much cash the drawer should hold.
 * Pure (shift.test.mjs); shifts.js reads and writes the shifts themselves.
 *
 * Whole sen throughout. Cash is what was handed over less the change given
 * back -- the drawer holds the bill, not the RM 50 note.
 */

/** A new shift document, before it is saved. */
export function newShift({ operatorId, operatorName = '', branchId = '', branchName = '', initialFloatSen = 0, now = Date.now() }) {
  if (!operatorId) throw new Error('operatorId is required');
  if (!Number.isInteger(initialFloatSen) || initialFloatSen < 0) throw new Error('The opening float must be whole sen, 0 or more');
  return {
    operatorId, operatorName, branchId, branchName,
    status: 'OPEN',
    openedAt: now,
    floatSen: initialFloatSen,
    cashMoves: [],
    updatedAt: now,
  };
}

const METHODS = ['CASH', 'QR', 'CARD', 'EWALLET', 'POINTS'];

/**
 * Everything the shift slip prints, from the shift and its sales.
 *
 * Voided sales count as voids, not as takings. Discounts are the bill
 * discounts plus each line's own.
 */
export function summarizeShift(shift, sales) {
  const byMethod = Object.fromEntries(METHODS.map((m) => [m, 0]));
  let salesCount = 0; let grossSen = 0; let discountsSen = 0; let taxSen = 0; let roundingSen = 0;
  let voidCount = 0; let voidsSen = 0;
  for (const sale of sales) {
    const total = (sale.totalSen || 0) + (sale.roundingSen || 0);
    if (sale.status === 'VOIDED') { voidCount++; voidsSen += total; continue; }
    salesCount++;
    grossSen += total;
    taxSen += sale.taxSen || 0;
    roundingSen += sale.roundingSen || 0;
    discountsSen += (sale.discountSen || 0) + (sale.lines || []).reduce((s, l) => s + (l.discountSen || 0), 0);
    for (const p of sale.payments || []) byMethod[p.method] = (byMethod[p.method] || 0) + (p.amountSen || 0);
    // Change is always given in cash.
    byMethod.CASH -= sale.changeSen || 0;
  }
  const moves = shift.cashMoves || [];
  const cashInSen = moves.filter((m) => m.type === 'IN').reduce((s, m) => s + m.amountSen, 0);
  const cashOutSen = moves.filter((m) => m.type === 'OUT').reduce((s, m) => s + m.amountSen, 0);
  const floatSen = shift.floatSen || 0;
  return {
    salesCount,
    grossSen,
    discountsSen,
    taxSen,
    roundingSen,
    voidCount,
    voidsSen,
    byMethod,
    floatSen,
    cashSalesSen: byMethod.CASH,
    cashInSen,
    cashOutSen,
    expectedCashSen: floatSen + byMethod.CASH + cashInSen - cashOutSen,
  };
}

/**
 * The closing figures: [actualCashSen] counted in the drawer against what
 * should be there. Short is negative, over is positive.
 */
export function closeFigures(shift, sales, actualCashSen, { now = Date.now(), closedByUid = '', closedByName = '' } = {}) {
  if (!Number.isInteger(actualCashSen) || actualCashSen < 0) throw new Error('Counted cash must be whole sen, 0 or more');
  if (shift.status !== 'OPEN') throw new Error('This shift is already closed');
  const summary = summarizeShift(shift, sales);
  return {
    status: 'CLOSED',
    closedAt: now,
    closedByUid,
    closedByName,
    summary,
    expectedCashSen: summary.expectedCashSen,
    actualCashSen,
    shortOverSen: actualCashSen - summary.expectedCashSen,
    updatedAt: now,
  };
}

/** A pay-in or pay-out during the shift (float top-up, paying a supplier from the till). */
export function cashMove(type, amountSen, reason = '', now = Date.now()) {
  if (!['IN', 'OUT'].includes(type)) throw new Error('type is IN or OUT');
  if (!Number.isInteger(amountSen) || amountSen <= 0) throw new Error('Amount must be whole sen, more than 0');
  return { type, amountSen, reason, at: now };
}
