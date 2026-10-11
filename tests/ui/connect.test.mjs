// Connections to other systems: the owner connects a friend's POS from
// Barcode Scan (their address, their key -- which goes to our server and
// is never kept where a screen can read it), tests it and sees what came;
// a system that sends to us gets an address and a push key; Books posts
// each day's sales, from the till and the friend's POS, as one entry.
import { start } from './harness.mjs';
import { world } from '../../tools/videos/world.mjs';

const W = 'workspaces/w1/';
const API = 'https://stockcheck-api-52988097941.asia-southeast1.run.app';
const s = await start({ seedPatch: world() });
const { page, base, step, shot, docs } = s;
const calls = [];
await page.route(`${API}/**`, async (route) => {
  const url = new URL(route.request().url());
  const body = route.request().postDataJSON?.() || {};
  calls.push({ path: url.pathname, body });
  const json = (x) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(x) });
  if (url.pathname.endsWith('/secret')) return json({ ok: true, hasSecret: !!body.value });
  if (url.pathname.endsWith('/test')) return json({ at: Date.now(), ok: true, feeds: [{ kind: 'sales', count: 2, problems: [], sample: [{ receiptNo: 'K-1', totalSen: 700 }], raw: '{"rows":[]}' }] });
  if (url.pathname.endsWith('/sync')) return json({ at: Date.now(), ok: true, feeds: [{ kind: 'sales', count: 2 }] });
  if (url.pathname.endsWith('/push-key')) return json({ key: 'sxc_shown_once_123' });
  if (url.pathname === '/app/books/sales-days') return json({ days: [
    { day: '2026-10-10', connectionId: 'k', source: 'Kawan POS', receipts: 12, totalSen: 10600, taxSen: 600, cashSen: 4000, otherSen: 6600 },
    { day: '2026-10-10', connectionId: '', source: 'POS', receipts: 3, totalSen: 2000, taxSen: 0, cashSen: 2000, otherSen: 0 },
  ] });
  return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
});
const nav = (hash) => page.evaluate((x) => { location.hash = x; }, hash);
let connId = '';

await step('Barcode Scan: the owner connects a friend\'s POS -- address, key, sales, their field names', async () => {
  await page.goto(`${base}/count/#/connections`);
  await page.click('button[data-act="cn-new"]');
  await page.fill('input[data-f="cn-name"]', 'Kawan POS');
  await page.fill('input[data-f="cn-url"]', 'https://api.kawan.my/v1/');
  await page.fill('input[data-f="cn-key"]', 'their-secret-key-abc');
  await page.check('input[data-act="cn-feed-sales"]');
  await page.click('[data-feed="sales"] summary');
  await page.fill('input[data-map="sales.list"]', 'rows');
  await page.fill('input[data-map="sales.line.barcode"]', 'code');
  await page.fill('input[data-f="cn-path-sales"]', 'sales');
  await shot('connect-1-form');
  await page.click('button[data-act="cn-save"]');
  await page.waitForSelector('.cn-card');
  const [c] = await docs(`${W}connections/`);
  connId = c.__id;
  if (c.baseUrl !== 'https://api.kawan.my/v1/' || c.mode !== 'PULL' || c.feeds.find((f) => f.kind === 'sales').map.line.barcode !== 'code') throw new Error(JSON.stringify(c));
  // The key went to our server, and is nowhere in the database a screen can read.
  if (!calls.some((x) => x.path.endsWith('/secret') && x.body.value === 'their-secret-key-abc')) throw new Error('key not sent');
  const leaked = await page.evaluate(() => [...window.__store.values()].some((v) => JSON.stringify(v).includes('their-secret-key-abc')));
  if (leaked) throw new Error('the key was stored in the database');
});

await step('test: what came from their system, before anything is saved; then fetch now', async () => {
  await page.click(`.cn-card[data-conn="${connId}"] button[data-act="cn-test"]`);
  await page.waitForSelector('.cn-pre:has-text("K-1")');
  await shot('connect-2-test');
  await page.click(`.cn-card[data-conn="${connId}"] button[data-act="cn-sync"]`);
  await page.waitForSelector('.cn-result:has-text("2")');
});

await step('a system that sends to us: our address and a push key, shown once', async () => {
  await page.click('button[data-act="cn-new"]');
  await page.fill('input[data-f="cn-name"]', 'Their TMS');
  await page.click('button[data-mode="PUSH"]');
  await page.check('input[data-act="cn-feed-deliveries"]');
  await page.click('button[data-act="cn-pushkey"]');
  await page.waitForSelector('[data-act="cn-pushkey-value"]:has-text("sxc_shown_once_123")');
  await page.waitForSelector('.cn-code:has-text("/connect/w1/")');
  await shot('connect-3-push');
});

await step('Books: each day\'s sales, the friend\'s POS and the till, posted as one balanced entry each', async () => {
  await page.goto(`${base}/books/#/daily`);
  await page.waitForSelector('[data-day="2026-10-10|k"] button[data-act="daily-post"]');
  await shot('connect-4-books');
  await page.click('[data-day="2026-10-10|k"] button[data-act="daily-post"]');
  await page.waitForSelector('[data-day="2026-10-10|k"] .pill.good');
  const e = (await docs(`${W}bkJournal/`)).find((x) => x.source === 'DAILY_SALES');
  const sum = e.lines.reduce((t, l) => t + l.debitSen - l.creditSen, 0);
  if (e.sourceId !== '2026-10-10|k' || sum !== 0 || e.lines.length !== 4) throw new Error(JSON.stringify(e));
});

await step('Every Data: the owner\'s way to the connections', async () => {
  await page.goto(`${base}/data/`);
  await page.click('a[data-act="connections"]');
  await page.waitForSelector('.cn-card, .cn-empty');
});

process.exit(await s.done() ? 1 : 0);
