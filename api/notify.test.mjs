// node api/notify.test.mjs -- the bot and the morning report end to end,
// against a stand-in for the database and for Telegram, email and push.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { notifier, sameSecret } from './notify.mjs';

// ----------------------------------------------- a small Firestore stand-in
function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));
  const snap = (path) => ({
    id: path.split('/').pop(), exists: store.has(path), ref: docRef(path),
    data: () => (store.has(path) ? structuredClone(store.get(path)) : undefined),
  });
  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      get: async () => snap(path),
      set: async (data, opts) => { store.set(path, opts?.merge ? { ...(store.get(path) || {}), ...data } : structuredClone(data)); },
      delete: async () => { store.delete(path); },
      collection: (name) => colRef(`${path}/${name}`),
    };
  }
  function colRef(path, filters = []) {
    const inCol = () => [...store.keys()].filter((k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'));
    const ok = (d) => filters.every(([f, op, v]) => (op === '==' ? d[f] === v : op === '>=' ? d[f] >= v : op === '<' ? d[f] < v : op === 'in' ? v.includes(d[f]) : false));
    return {
      doc: (id) => docRef(`${path}/${id}`),
      where: (f, op, v) => colRef(path, [...filters, [f, op, v]]),
      get: async () => { const docs = inCol().filter((k) => ok(store.get(k))).map(snap); return { docs, size: docs.length }; },
      listDocuments: async () => [...new Set([...store.keys()].filter((k) => k.startsWith(`${path}/`)).map((k) => k.slice(path.length + 1).split('/')[0]))].map((id) => docRef(`${path}/${id}`)),
    };
  }
  return { collection: (name) => colRef(name), store };
}

// ------------------------------------------- Telegram, email and push, heard
const heard = { telegram: [], mail: [], push: [], calls: [] };
globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : {};
  if (url.includes('/sendMessage')) heard.telegram.push(body);
  else if (url.startsWith('stub://mail')) heard.mail.push(body);
  else if (url.startsWith('stub://push')) heard.push.push(body);
  else heard.calls.push([url.split('/').pop(), body]);
  const result = url.endsWith('/getMe') ? { username: 'SuXinTestBot' } : true;
  return { ok: true, json: async () => ({ ok: true, result }) };
};
const ENV = { TELEGRAM_BOT_TOKEN: 't0ken', TELEGRAM_SECRET: 's3cret', TELEGRAM_API: 'https://tg.test', MAIL_STUB_URL: 'stub://mail', PUSH_STUB_URL: 'stub://push', WEB_PUSH_VAPID_KEY: 'BPublicKey' };

const NOW = Date.UTC(2026, 9, 8, 0, 30); // 08:30 in Malaysia
const YESTERDAY = Date.UTC(2026, 9, 7, 3); // 11:00 in Malaysia, the day before
const W = 'workspaces/w1/';
const seed = () => ({
  [`${W}users/boss`]: { displayName: 'Ah Hock', roleId: 'admin', active: true, branchIds: [] },
  [`${W}users/ali`]: { displayName: 'Ali', roleId: 'worker', active: true, branchIds: ['ipoh'] },
  [`${W}users/boss/pushTokens/tok-1`]: { platform: 'android' },
  [`${W}roles/worker`]: { permissions: ['CREATE_STOCK_CHECK'] },
  [`${W}meta/config`]: { companyName: 'Kedai Maju', branches: [{ id: 'ipoh', name: 'Kedai Ipoh' }, { id: 'gudang', name: 'Gudang' }] },
  [`${W}meta/notify`]: { emailDaily: true, emails: ['boss@kedai.my', 'not an email'], pushDaily: true },
  [`${W}products/9555`]: { name: 'Milo 1kg', unit: 'pcs', reorderLevelMilli: 30000 },
  [`${W}products/2001`]: { name: 'Beras 5kg', unit: 'bag', priceSen: 2690 },
  [`${W}products/3001`]: { name: 'Kopi O 1kg', unit: 'pcs', costSen: 1000 },
  [`${W}movements/m2`]: { barcode: '3001', type: 'SALE', quantityMilli: 1000, at: Date.now(), branchId: 'ipoh' },
  [`${W}movements/m3`]: { barcode: '3001', type: 'RECEIVE', quantityMilli: 4000, at: Date.now(), branchId: 'gudang' },
  [`${W}sales/t1`]: { status: 'COMPLETED', createdAt: NOW - 3600_000, totalSen: 5000, cashierName: 'Mei', payments: [{ method: 'CASH', amountSen: 5000 }],
    lines: [{ barcode: '3001', name: 'Kopi O 1kg', qtyMilli: 2000, lineTotalSen: 5000, costSen: 1000 }] },
  [`${W}sales/t2`]: { status: 'COMPLETED', createdAt: NOW - 1800_000, totalSen: 1590, cashierName: 'Ali', payments: [{ method: 'QR', amountSen: 1590 }],
    lines: [{ barcode: '9555', name: 'Milo 1kg', qtyMilli: 1000, lineTotalSen: 1590 }] },
  [`${W}purchaseOrders/p1`]: { poNo: 'PO-0001', supplierName: 'Nestle', status: 'ORDERED', branchId: 'gudang', expectedAt: NOW + 86_400_000 },
  [`${W}purchaseOrders/p2`]: { poNo: 'PO-0002', supplierName: 'Old', status: 'RECEIVED', branchId: 'gudang' },
  [`${W}stockChecks/c1`]: { status: 'COMPLETED', branchId: 'ipoh', zone: '', createdAt: 1000, completedAt: 1000 },
  [`${W}stockChecks/c1/items/i1`]: { barcode: '9555', productName: 'Milo 1kg', quantityMilli: 20000 },
  [`${W}stockChecks/c2`]: { status: 'COMPLETED', branchId: 'gudang', zone: '', createdAt: 1000, completedAt: 1000 },
  [`${W}stockChecks/c2/items/i1`]: { barcode: '9555', productName: 'Milo 1kg', quantityMilli: 50000 },
  [`${W}movements/m1`]: { barcode: '9555', type: 'SALE', quantityMilli: 2000, at: Date.now(), branchId: 'ipoh' },
  [`${W}sales/y1`]: { status: 'COMPLETED', createdAt: YESTERDAY, totalSen: 3180, payments: [{ method: 'QR', amountSen: 3180 }], lines: [{ barcode: '9555', name: 'Milo 1kg', qtyMilli: 2000, lineTotalSen: 3180 }] },
  'telegramLinks/GOODCODE1234': { workspaceId: 'w1', uid: 'boss', expiresAt: Date.now() + 600_000 },
  'telegramLinks/ALICODE12345': { workspaceId: 'w1', uid: 'ali', expiresAt: Date.now() + 600_000 },
  'telegramLinks/OLDCODE12345': { workspaceId: 'w1', uid: 'boss', expiresAt: Date.now() - 1 },
});
const ask = (n, chatId, text, lang) => n.handleUpdate(say(chatId, text, lang), NOW);
const say = (chatId, text, lang = 'zh') => ({ message: { chat: { id: chatId }, from: { first_name: 'T', language_code: lang }, text } });
const last = () => heard.telegram.at(-1);

test('the shared secret is checked exactly', () => {
  assert.equal(sameSecret('s3cret', 's3cret'), true);
  assert.equal(sameSecret('s3creT', 's3cret'), false);
  assert.equal(sameSecret(undefined, 's3cret'), false);
  assert.equal(sameSecret('', ''), false);
});

test('linking a chat, then asking it things', async () => {
  const db = fakeDb(seed());
  const n = notifier(db, ENV);
  await n.handleUpdate(say(100, 'Milo 还有多少？'));
  assert.match(last().text, /还没有连接/);
  await n.handleUpdate(say(100, '/start OLDCODE12345'));
  assert.match(last().text, /过期/);
  await n.handleUpdate(say(100, '/start GOODCODE1234'));
  assert.match(last().text, /已连接：Ah Hock · Kedai Maju/);
  assert.equal(db.store.get('telegramChats/100').uid, 'boss');
  assert.equal(db.store.has('telegramLinks/GOODCODE1234'), false, 'a code works once');

  await n.handleUpdate(say(100, 'Milo 还有多少？'));
  assert.match(last().text, /📦 Milo 1kg/);
  assert.match(last().text, /Kedai Ipoh: 18 pcs/);
  assert.match(last().text, /Gudang: 50 pcs/);
  await n.handleUpdate(say(100, 'teh tarik'));
  assert.match(last().text, /我不太明白「teh tarik」/);
  await n.handleUpdate(say(100, 'Teh 还有多少'));
  assert.match(last().text, /找不到「Teh」/);
  await n.handleUpdate(say(100, '低库存'));
  assert.match(last().text, /低库存 1 样[\s\S]*Milo 1kg \(Kedai Ipoh\): 剩 18, 补货点 30/);
  await ask(n, 100, '昨天卖了多少');
  assert.match(last().text, /营业额：RM 31\.80（1 单/);

  // The wider questions.
  await ask(n, 100, '有什么没有货了吗');
  assert.match(last().text, /没货了（1 样）\n• Kopi O 1kg \(Kedai Ipoh\)/);
  await ask(n, 100, '今天赚多少？');
  assert.match(last().text, /销售（未含税）: RM 65\.90\n成本: RM 20\.00\n毛利: RM 45\.90/);
  assert.match(last().text, /没有填成本/, 'Milo was sold without a cost');
  await ask(n, 100, '今天什么最好卖');
  assert.match(last().text, /1\. Kopi O 1kg ×2 · RM 50\.00\n2\. Milo 1kg ×1/);
  await ask(n, 100, '今天谁卖最多');
  assert.match(last().text, /1\. Mei: RM 50\.00 · 1 单\n2\. Ali: RM 15\.90/);
  await ask(n, 100, '这个月卖了多少');
  assert.match(last().text, /RM 97\.70（3 单/);
  await ask(n, 100, '库存价值多少');
  assert.match(last().text, /Gudang: RM 40\.00/);
  assert.match(last().text, /1 样商品没有成本/, 'Milo, counted once though it is in two places');
  await ask(n, 100, '有什么采购单要收货？');
  assert.match(last().text, /（1 张）\n• PO-0001 · Nestle · 已下单 · 预计 9\/10/);
  await ask(n, 100, 'Beras 多少钱？');
  assert.match(last().text, /Beras 5kg: RM 26\.90 \/ bag/);
});

test('a worker sees their own branch, and no sales', async () => {
  const db = fakeDb(seed());
  const n = notifier(db, ENV);
  await n.handleUpdate(say(200, '/start ALICODE12345', 'ms'));
  assert.match(last().text, /Disambung: Ali/);
  await n.handleUpdate(say(200, 'jualan hari ini'));
  assert.match(last().text, /tidak boleh lihat jualan/);
  await ask(n, 200, 'untung hari ini');
  assert.match(last().text, /tidak boleh lihat ini/);
  await ask(n, 200, 'pesanan belian');
  assert.match(last().text, /tidak boleh lihat ini/);
  await ask(n, 200, 'apa stok habis');
  assert.equal(last().text, '🚫 Stok habis (1)\n• Kopi O 1kg', 'one place: no place name');
  await n.handleUpdate(say(200, 'berapa stok Milo'));
  assert.match(last().text, /Kedai Ipoh: 18/);
  assert.doesNotMatch(last().text, /Gudang/);
  // Switched off by the owner: the chat is forgotten.
  db.store.get(`${W}users/ali`).active = false;
  await n.handleUpdate(say(200, 'stok rendah'));
  assert.match(last().text, /belum disambung/);
  assert.equal(db.store.has('telegramChats/200'), false);
});

test('the morning report: Telegram, email and push, once a day', async () => {
  const db = fakeDb(seed());
  const n = notifier(db, ENV);
  await n.handleUpdate(say(100, '/start GOODCODE1234'));
  heard.telegram.length = 0;
  const sent = await n.dailyReports(NOW);
  assert.deepEqual(sent, { companies: 1, telegram: 1, email: 1, push: 1 });
  assert.match(heard.telegram[0].text, /📊 SuXin 每日报告 · Kedai Maju\n7\/10\/2026[\s\S]*RM 31\.80/);
  assert.deepEqual(heard.mail[0].to, ['boss@kedai.my']);
  assert.match(heard.mail[0].subject, /SuXin 每日报告 · Kedai Maju/);
  assert.deepEqual(heard.push[0].tokens, ['tok-1']);
  assert.match(heard.push[0].body, /营业额 RM 31\.80 · 1 单/);
  assert.deepEqual(await n.dailyReports(NOW), { companies: 0, telegram: 0, email: 0, push: 0 }, 'not twice in a day');
});

test('setup points Telegram here and publishes the bot name and push key', async () => {
  const db = fakeDb(seed());
  const n = notifier(db, ENV);
  assert.deepEqual(await n.setupTelegram('https://api.example'), { telegram: 'ok', username: 'SuXinTestBot' });
  const hook = heard.calls.find(([m]) => m === 'setWebhook')[1];
  assert.equal(hook.url, 'https://api.example/telegram');
  assert.equal(hook.secret_token, 's3cret');
  assert.equal(db.store.get('publicConfig/telegram').username, 'SuXinTestBot');
  await n.setupPush();
  assert.equal(db.store.get('publicConfig/push').vapidKey, 'BPublicKey');
  assert.deepEqual(await notifier(db, {}).setupTelegram('x'), { telegram: 'not configured' });
});
