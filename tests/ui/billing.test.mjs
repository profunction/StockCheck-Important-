// The trial/subscription bar (web/js/billing.js): quiet while the company
// is in good standing, a renew prompt when it is not -- and the one real
// lock (starting a new JSOX Barcode Scan count) says so instead of failing
// silently.
import { start } from './harness.mjs';

const DAY = 86_400_000;
let failed = 0;

{
  const s = await start();
  const { page, base, step } = s;
  await step('a healthy trial: no bar', async () => {
    await page.goto(`${base}/pos/`);
    await page.waitForSelector('.tile');
    if (await page.$('#billing-bar:not([hidden])')) throw new Error('bar shown while licence is fine');
  });
  failed += await s.done();
}

{
  const s = await start({ seedPatch: { merge: { 'licences/w1': { plan: 'TRIAL', status: 'ACTIVE', expiresAt: Date.now() + 2 * DAY } } } });
  const { page, base, step } = s;
  await step('a trial ending soon: a warning, not an error', async () => {
    await page.goto(`${base}/pos/`);
    await page.waitForSelector('.tile');
    await page.waitForSelector('#billing-bar.warn:not([hidden])');
    const href = await page.$eval('#billing-bar [data-act="bill-renew"]', (a) => a.getAttribute('href'));
    if (!href.includes('/buy?company=')) throw new Error(href);
  });
  failed += await s.done();
}

{
  const s = await start({ seedPatch: { merge: { 'licences/w1': { plan: 'TRIAL', status: 'ACTIVE', expiresAt: Date.now() - DAY } } } });
  const { page, base, step, docs } = s;
  await step('an expired trial: a bar everywhere, and no new count', async () => {
    await page.goto(`${base}/pos/`);
    await page.waitForSelector('.tile');
    await page.waitForSelector('#billing-bar.bad:not([hidden])');
    // The warehouse shares the same bar (apps.js, not a page of its own).
    await page.goto(`${base}/warehouse/#/map`);
    await page.waitForSelector('#billing-bar.bad:not([hidden])');
    // Starting a count explains why, with a way to pay -- not a raw write error.
    await page.goto(`${base}/count/#/new`);
    await page.waitForSelector('.card:has-text("开不了新的盘点单")');
    const rows = await docs('workspaces/w1/stockChecks/');
    if (rows.length !== 1) throw new Error(`a count was started anyway: ${rows.map((r) => r.__id)}`); // only the seeded sc1
  });
  failed += await s.done();
}

{
  const s = await start({ seedPatch: { merge: { 'licences/w1': { plan: 'BUSINESS', status: 'SUSPENDED', expiresAt: Date.now() + 90 * DAY } } } });
  const { page, base, step } = s;
  await step('suspended (a chargeback): the bar says so', async () => {
    await page.goto(`${base}/pos/`);
    await page.waitForSelector('.tile');
    await page.waitForSelector('#billing-bar.bad:has-text("暂停")');
  });
  failed += await s.done();
}

process.exit(failed ? 1 : 0);
