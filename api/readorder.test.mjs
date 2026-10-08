// node api/readorder.test.mjs -- reading a Pinduoduo order from screenshots:
// what is accepted, what the answer becomes, and what is said when it fails.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkImages, MODEL, orderReader, outputFormat, toOrder } from './readorder.mjs';

const PNG = 'iVBORw0KGgo=';

test('screenshots: one to four, JPEG/PNG/WebP, not too big', () => {
  assert.deepEqual(checkImages([{ mediaType: 'image/png', data: `data:image/png;base64,${PNG}` }]), [{ mediaType: 'image/png', data: PNG }]);
  assert.throws(() => checkImages([]), /at least one/);
  assert.throws(() => checkImages(Array.from({ length: 5 }, () => ({ mediaType: 'image/png', data: PNG }))), /At most 4/);
  assert.throws(() => checkImages([{ mediaType: 'image/gif', data: PNG }]), /JPEG, PNG or WebP/);
  assert.throws(() => checkImages([{ mediaType: 'image/png', data: 'not base64!' }]), /too big or broken/);
  assert.throws(() => checkImages([{ mediaType: 'image/png', data: 'A'.repeat(5_000_000) }]), /too big/);
});

test('the answer becomes the review screen\'s order, in fen', () => {
  const o = toOrder({
    orderNo: ' 240915-582013947761 ', trackingNo: 'YT1234567890', shippingYuan: 6, totalYuan: 126.5,
    lines: [{ title: 'Beras 5kg 白米', variation: '5kg', unitPriceYuan: 30.25, qty: 4 }, { title: '  ', variation: '', unitPriceYuan: 1, qty: 1 }, { title: '赠品', variation: '', unitPriceYuan: 0, qty: 0 }],
  });
  assert.deepEqual(o, {
    platform: 'pdd', orderNo: '240915-582013947761', trackingNo: 'YT1234567890', currency: 'CNY', shippingCents: 600, totalCents: 12650,
    lines: [{ title: 'Beras 5kg 白米', variation: '5kg', qty: 4, priceCents: 3025 }, { title: '赠品', variation: '', qty: 1, priceCents: 0 }],
  });
});

test('the request to Claude, and its failures', async () => {
  let sent = null;
  const answer = { orderNo: 'X1', trackingNo: '', shippingYuan: 0, totalYuan: 20, lines: [{ title: 'Milo', variation: '', unitPriceYuan: 10, qty: 2 }] };
  const client = { messages: { parse: async (req) => { sent = req; return { stop_reason: 'end_turn', parsed_output: answer }; } } };
  const order = await orderReader({ client }).read([{ mediaType: 'image/jpeg', data: PNG }]);
  assert.equal(order.lines[0].priceCents, 1000);
  assert.equal(sent.model, MODEL);
  assert.equal(sent.messages[0].content[0].type, 'image');
  assert.equal(sent.messages[0].content[0].source.media_type, 'image/jpeg');
  assert.equal(sent.messages[0].content.at(-1).type, 'text');

  const refusing = { messages: { parse: async () => ({ stop_reason: 'refusal', parsed_output: null }) } };
  await assert.rejects(orderReader({ client: refusing }).read([{ mediaType: 'image/png', data: PNG }]), /could not be read/);
  const empty = { messages: { parse: async () => ({ stop_reason: 'end_turn', parsed_output: null }) } };
  await assert.rejects(orderReader({ client: empty }).read([{ mediaType: 'image/png', data: PNG }]), /Nothing could be read/);
  await assert.rejects(orderReader({ apiKey: '' }).read([{ mediaType: 'image/png', data: PNG }]), (e) => e.status === 503);
});

test('the answer\'s shape builds with the installed SDK', async (t) => {
  let fmt;
  try { fmt = await outputFormat(); } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') return t.skip('the SDK is not installed here (it is in CI)');
    throw err;
  }
  assert.equal(fmt.type, 'json_schema');
  assert.deepEqual(Object.keys(fmt.schema.properties).sort(), ['lines', 'orderNo', 'shippingYuan', 'totalYuan', 'trackingNo']);
});
