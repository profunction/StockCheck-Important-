// node web/js/pdpa.test.mjs -- PDPA and the Excel writer.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOCK_DAYS, customerRows, daysLeft, duePurge, isLocked, maskCustomer, pdpaState, restoreFields, unsubscribeFields } from './pdpa.js';
import { crc32, xlsx } from './xlsx.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

test('unsubscribing locks at once and erases after 90 days', () => {
  const c = { id: 'c1', name: 'Ah Seng', phone: '012-3456789', ...unsubscribeFields(T0, 'u1', 'asked') };
  assert.equal(LOCK_DAYS, 90);
  assert.equal(c.purgeAfter, T0 + 90 * DAY);
  assert.equal(pdpaState(c, T0 + DAY), 'LOCKED');
  assert.ok(isLocked(c, T0 + DAY));
  assert.equal(daysLeft(c, T0 + DAY), 89);
  assert.equal(pdpaState(c, T0 + 90 * DAY), 'DUE');
  assert.deepEqual(duePurge([c, { id: 'c2' }], T0 + 91 * DAY).map((x) => x.id), ['c1']);
  assert.equal(pdpaState({ ...c, ...restoreFields(T0 + 2 * DAY) }, T0 + 200 * DAY), 'ACTIVE');
});

test('masked on screen, exported in full', () => {
  assert.equal(maskCustomer({ name: 'Ah Seng', phone: '012-3456789' }), 'A*** (••••6789)');
  assert.equal(maskCustomer({}), '***');
  const rows = customerRows([{ id: 'c1', name: 'Ah Seng', totalSpentSen: 12345, ...unsubscribeFields(T0) }], T0 + DAY);
  assert.equal(rows[0].length, rows[1].length);
  assert.equal(rows[1][6], 123.45);
  assert.equal(rows[1][10], 'LOCKED');
});

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('xlsx is a zip with the workbook parts', () => {
  const bytes = xlsx([{ name: 'Customers', rows: [['Name', 'Points'], ['Ah Seng 阿成', 12], ['<b>&', 3.5]] }]);
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const text = new TextDecoder().decode(bytes);
  for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']) assert.ok(text.includes(part), part);
  assert.ok(text.includes('Ah Seng 阿成'));
  assert.ok(text.includes('&lt;b&gt;&amp;'));
  assert.ok(text.includes('<v>3.5</v>'));
  // End of central directory: one sheet -> 6 entries.
  const eocd = bytes.length - 22;
  assert.deepEqual([...bytes.slice(eocd, eocd + 4)], [0x50, 0x4b, 0x05, 0x06]);
  assert.equal(bytes[eocd + 10], 6);
});
