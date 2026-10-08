// Ordering by QR code end to end: the owner switches it on and gets the
// codes; a customer on a phone orders for table 2 and a takeaway; the till
// hears the bell, accepts the table's order into its bill and the takeaway
// as a ticket, marks the takeaway ready -- and the customer's page follows.
// The API (api/selforder.mjs) runs here in the test, on the browser's
// stand-in database, so the prices are the server's, as in the shop.
import { start } from './harness.mjs';
import { item, world } from '../../tools/videos/world.mjs';
import { selfOrdering } from '../../api/selforder.mjs';

const W = 'workspaces/w1/';
const tehtarik = item('tehtarik');
const nasi = item('nasilemak');
const seed = world({ mode: 'FNB' });
seed.set[`${W}pos/modifiers`] = { list: [
  { id: 'sugar', name: 'Gula', required: true, multiple: false, options: [{ name: 'Kurang manis', priceSen: 0 }, { name: 'Kosong', priceSen: 0 }] },
  { id: 'egg', name: 'Tambah', required: false, multiple: true, options: [{ name: 'Telur', priceSen: 100 }] },
] };
const s = await start({ seedPatch: seed });
const { page, base, step, shot, store, docs } = s;
let failed = 0;

// ------------------------------------- the API, on the browser's database
function browserDb(p) {
  let n = 0;
  const docRef = (path) => ({
    id: path.split('/').pop(), path,
    get: async () => { const d = await p.evaluate((x) => window.__store.get(x) ?? null, path); return { exists: d !== null, data: () => d ?? undefined }; },
    set: (d) => p.evaluate(([x, v]) => window.__put(x, v), [path, d]),
    collection: (name) => colRef(`${path}/${name}`),
  });
  const colRef = (path) => ({
    doc: (id) => docRef(`${path}/${id || `qr${Date.now()}${String(++n).padStart(6, '0')}`}`),
    get: async () => ({ docs: (await p.evaluate((x) => [...window.__store].filter(([k]) => k.startsWith(`${x}/`) && !k.slice(x.length + 1).includes('/')), path))
      .map(([k, v]) => ({ id: k.split('/').pop(), data: () => v })) }),
  });
  return {
    collection: (name) => colRef(name),
    runTransaction: async (fn) => { const writes = []; await fn({ get: (r) => r.get(), set: (r, d) => writes.push(r.set(d)) }); await Promise.all(writes); },
  };
}
const api = selfOrdering(browserDb(page), { now: () => Date.now() });
const routeApi = (p) => p.route(/\/public\/order\//, async (route) => {
  const url = new URL(route.request().url());
  const [, , , shop, id] = url.pathname.split('/').map(decodeURIComponent);
  try {
    const body = route.request().method() === 'POST' ? await api.place(shop, route.request().postDataJSON())
      : id ? await api.status(shop, id) : await api.menu(shop);
    await route.fulfill({ status: route.request().method() === 'POST' ? 201 : 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  } catch (err) {
    if (!err.status) console.log('api', err);
    await route.fulfill({ status: err.status || 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { message: err.message } }) });
  }
});

// ------------------------------------------------------- the owner
let link = '';
await step('settings: switch QR ordering on and get a code per table', async () => {
  await page.goto(base + '/pos/#/settings/qr');
  await page.waitForSelector('input[data-act="qrs-on"]');
  await page.check('input[data-act="qrs-on"]');
  await page.click('button[data-act="qrs-save"]');
  await page.waitForSelector('.qrs-card[data-qr-table="2"]');
  const so = (await store(`${W}pos/settings`)).selfOrder;
  if (!so.enabled || !/^[A-Za-z0-9]{12}$/.test(so.codes['-'])) throw new Error(JSON.stringify(so));
  link = await page.getAttribute('.qrs-card[data-qr-table="2"] a', 'href');
  if (!link.includes(`/order/?s=w1~-~${so.codes['-']}`) || !link.endsWith('&t=2')) throw new Error(link);
  await shot('qr-1-settings');
});

// ------------------------------------------------------- the customer
const phone = await s.context.newPage();
await phone.setViewportSize({ width: 390, height: 844 });
await routeApi(phone);
phone.on('pageerror', (e) => console.log('PAGEERR', e.message, e.stack));
let tableOrder = '';
await step('customer: table 2 from its code, an option, a note, sent', async () => {
  await phone.goto(link.replace(/^https?:\/\/[^/]+/, base));
  await phone.waitForSelector(`.so-item[data-item="${tehtarik.barcode}"]`);
  if (!(await phone.textContent('.so-where')).includes('2')) throw new Error('not table 2');
  await phone.click(`.so-item[data-item="${tehtarik.barcode}"]`);
  await phone.waitForSelector('button[data-opt="sugar:0"]');
  await phone.click('button[data-act="add-item"]');
  await phone.waitForSelector('.so-err:has-text("Gula")');
  await phone.click('button[data-opt="sugar:0"]');
  await phone.click('button[data-opt="egg:0"]');
  await phone.fill('.so-sheet textarea', 'panas');
  await phone.click('button[data-act="add-item"]');
  await phone.click(`.so-item[data-item="${nasi.barcode}"]`);
  await phone.click(`.so-item[data-item="${nasi.barcode}"]`);
  await phone.waitForSelector('.so-bar .n:has-text("3")');
  await phone.screenshot({ path: `${process.env.UI_SHOTS || new URL('./shots', import.meta.url).pathname}/qr-2-phone-menu.png` });
  await phone.click('button[data-act="basket"]');
  await phone.waitForSelector('[data-total]');
  await phone.click('button[data-act="send"]');
  await phone.waitForSelector('.so-ticket[data-status="NEW"]');
  const sent = (await docs(`${W}selfOrders/`)).find((o) => o.table === '2');
  const teh = sent.lines.find((l) => l.barcode === tehtarik.barcode);
  if (sent.status !== 'NEW' || sent.orderType !== 'DINE_IN' || teh.unitPriceSen !== tehtarik.priceSen + 100 || teh.note !== 'panas'
    || sent.lines.find((l) => l.barcode === nasi.barcode).qtyMilli !== 2000) throw new Error(JSON.stringify(sent));
  tableOrder = sent.__id;
});

let takeaway = '';
await step('customer: a takeaway gets a pickup number', async () => {
  const p2 = await s.context.newPage();
  await p2.setViewportSize({ width: 390, height: 844 });
  await routeApi(p2);
  await p2.goto(link.replace(/^https?:\/\/[^/]+/, base).replace(/&t=2$/, '') + '&new=1');
  await p2.click('button[data-type="TAKEAWAY"]');
  await p2.click(`.so-item[data-item="${nasi.barcode}"]`);
  await p2.click('button[data-act="basket"]');
  await p2.fill('.so-sheet input', 'Mei');
  await p2.click('button[data-act="send"]');
  await p2.waitForSelector('.so-ticket .big:has-text("2")');
  takeaway = (await docs(`${W}selfOrders/`)).find((o) => o.orderType === 'TAKEAWAY').__id;
  await p2.close();
});

// ------------------------------------------------------------ the till
await step('till: the bell counts two; the table order goes on table 2\'s bill', async () => {
  await page.goto(base + '/pos/#/pos');
  await page.waitForSelector('button[data-act="qr-orders"]:not([hidden]) .count:has-text("2")');
  await page.click('button[data-act="qr-orders"]');
  await page.waitForSelector(`[data-qr="${tableOrder}"]`);
  await shot('qr-3-till');
  await page.click(`[data-qr="${tableOrder}"] button[data-act="qr-accept"]`);
  await page.waitForFunction((p) => window.__store.get(p)?.status === 'ACCEPTED', `${W}selfOrders/${tableOrder}`);
  const so = await store(`${W}selfOrders/${tableOrder}`);
  const bill = await store(`${W}orders/${so.mergedInto}`);
  if (bill.table !== '2' || bill.lines.length !== 2 || !bill.lines.every((l) => l.sent) || so.open !== false) throw new Error(JSON.stringify({ so, bill }));
  // The kitchen ticket, printed the moment it was accepted.
  await page.waitForFunction(() => (window.__printed || 0) > 0);
});

await step('customer: sees it accepted', async () => {
  await phone.waitForSelector('.so-ticket[data-status="ACCEPTED"]', { timeout: 15000 });
});

await step('till: the takeaway is accepted, then called ready', async () => {
  if (!(await page.$(`[data-qr="${takeaway}"]`))) await page.click('button[data-act="qr-orders"]');
  await page.click(`[data-qr="${takeaway}"] button[data-act="qr-accept"]`);
  await page.waitForSelector(`.qr-ready-row[data-qr="${takeaway}"]`);
  await page.click(`.qr-ready-row[data-qr="${takeaway}"] button[data-act="qr-ready"]`);
  await page.waitForFunction((p) => window.__store.get(p)?.status === 'READY', `${W}selfOrders/${takeaway}`);
  const bills = (await docs(`${W}orders/`)).filter((o) => o.pickupNo === '2');
  if (bills.length !== 1 || bills[0].orderType !== 'TAKEAWAY') throw new Error(JSON.stringify(bills));
});

await step('a wrong code is refused with a clear page', async () => {
  await phone.goto(`${base}/order/?s=w1~-~WrongCode1234`);
  await phone.waitForSelector('.so-error');
});

failed += await s.done();
process.exit(failed ? 1 : 0);
