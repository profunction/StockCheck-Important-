// SuXin Barcode Scan on the web, the app's way: a count list with its own
// fields, a signature and a photo rule; a count sheet from a file; checking
// each scan; expiry; photos; locking. And the page on a phone.
import { start } from './harness.mjs';

const W = 'workspaces/w1/';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64');
const s = await start({
  seedPatch: {
    set: {
      [`${W}templates/t1`]: {
        name: 'Chiller list', description: 'The cold room, weekly', active: true, photoRequired: true, minPhotos: 1, createdAt: 1,
        fields: [
          { key: 'temp', label: 'Temp', type: 'NUMBER', order: 1 },
          { key: 'cond', label: 'Condition', type: 'DROPDOWN', options: ['OK', 'Damaged'], order: 2 },
          { key: 'sign', label: 'Checked by', type: 'SIGNATURE', order: 3 },
        ],
      },
      [`${W}meta/config`]: { companyName: 'Kedai Jeffrey', zones: ['Cold room', 'Rack 1'] },
    },
  },
});
const { page, base, step, shot, store, docs } = s;
let id = '';
const scan = async (code) => { await page.fill('input.scan', code); await page.press('input.scan', 'Enter'); };
const line = (code) => `.cnt-line[data-code="${code}"]`;

await step('start a count from a count list, in an area tapped from the list', async () => {
  await page.goto(base + '/count/#/new');
  await page.waitForSelector('select option[value="t1"]', { state: 'attached' });
  await page.selectOption('.cnt-newform select >> nth=0', 't1');
  await page.waitForSelector('text=The cold room, weekly');
  await page.click('.chips-row button:has-text("Cold room")');
  await shot('count-1-new');
  await page.click('.cnt-newform button.primary');
  await page.waitForFunction(() => /#\/c\/.+/.test(location.hash));
  id = await page.evaluate(() => location.hash.split('/').pop());
  const c = await store(`${W}stockChecks/${id}`);
  if (c.templateId !== 't1' || c.templateName !== 'Chiller list' || c.zone !== 'Cold room') throw new Error(JSON.stringify(c));
});

await step('a count sheet from a CSV: what should be there, with a line it refuses', async () => {
  await page.waitForSelector('input.scan');
  await page.click('button[data-act="menu"]');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button[data-act="import-sheet"]')]);
  await chooser.setFiles({ name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from('Stock list for Kedai Jeffrey,,\nBarcode,Product,Expected\n9555012345678,Milo,5\n7777,Biskut Kelapa,3\n8888,Gula,\n') });
  await page.waitForSelector('.dialog:has-text("盘点清单已载入")');
  if (!(await page.textContent('.dialog')).includes('8888')) throw new Error('refused line not named');
  await page.click('.dialog .actions button.primary');
  await page.waitForSelector(`${line('7777')} .cnt-chip.short`);
  const items = await docs(`${W}stockChecks/${id}/items/`);
  const biskut = items.find((i) => i.barcode === '7777');
  if (items.length !== 2 || biskut.expectedMilli !== 3000 || biskut.onList !== true || biskut.quantityMilli !== 0) throw new Error(JSON.stringify(items));
});

await step('scans count against the sheet: short, then a match', async () => {
  for (let i = 0; i < 3; i++) await scan('9555012345678');
  await page.waitForSelector(`${line('9555012345678')} .cnt-chip.short:has-text("少了 2")`);
  // Checking each scan: a code already counted asks how many to add.
  await page.click('button[data-act="menu"]');
  await page.click('button[data-act="confirm-each"]');
  await scan('9555012345678');
  await page.waitForSelector('.dialog:has-text("这个已经点过了")');
  await page.fill('.dialog input', '2');
  await page.click('button[data-act="add-more"]');
  await page.waitForSelector(`${line('9555012345678')} .cnt-chip.match`);
  // A new code shows what was just added and waits.
  await scan('5555');
  await page.waitForSelector('.cnt-confirm[data-code="5555"]');
  await shot('count-2-confirm');
  await page.click('button[data-act="continue"]');
  await page.waitForSelector('.cnt-confirm', { state: 'detached' });
  const c = await store(`${W}stockChecks/${id}`);
  if (c.itemCount !== 3 || c.totalQuantityMilli !== 6000) throw new Error(JSON.stringify(c));
});

await step('a line opens to expiry, remark, the list\'s fields and a signature', async () => {
  await page.click(`${line('7777')} .cnt-line-main`);
  await page.waitForSelector('.dialog .sigpad');
  await page.fill('.dialog .cnt-form input >> nth=2', '2');
  await page.fill('.dialog .cnt-form input >> nth=4', '01/01/2020');
  await page.fill('.dialog textarea', 'Bottom shelf');
  await page.click('.dialog .chips-row button:has-text("Damaged")');
  await page.$eval('.dialog .sigpad', (c) => c.scrollIntoView({ block: 'center' }));
  const box = await page.$eval('.dialog .sigpad', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 20 + i * 20, box.y + 20 + (i % 2) * 30);
  await page.mouse.up();
  await shot('count-3-line');
  await page.click('button[data-act="save-line"]');
  await page.waitForSelector(`${line('7777')} .cnt-chip.expired`);
  const items = await docs(`${W}stockChecks/${id}/items/`);
  const b = items.find((i) => i.barcode === '7777');
  if (b.quantityMilli !== 2000 || b.expiresAt !== Date.UTC(2020, 0, 1) || b.remark !== 'Bottom shelf' || b.fieldValues.cond !== 'Damaged'
    || !/^Jeffrey - \d{4}-\d\d-\d\d \d\d:\d\d$/.test(b.fieldValues.sign) || !/^\d+,\d+ /.test(b.fieldValues['ink#sign'])) throw new Error(JSON.stringify(b));
});

await step('the count list wants a photo before the count is finished', async () => {
  await page.click('button[data-act="finish"]');
  await page.waitForSelector('text=要先拍至少 1 张照片');
  if ((await store(`${W}stockChecks/${id}`)).status !== 'IN_PROGRESS') throw new Error('finished without a photo');
});

await step('photos: take one, captioned and tied to an item', async () => {
  await page.click('a[data-act="photos"]');
  await page.waitForSelector('button[data-act="take-photo"]');
  await page.fill('.ph-add input', 'Carton crushed');
  await page.selectOption('.ph-add select', '7777');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button[data-act="pick-photo"]')]);
  await chooser.setFiles({ name: 'shelf.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('.ph-tile:has-text("Carton crushed")');
  await shot('count-4-photos');
  const photos = await docs(`${W}stockChecks/${id}/photos/`);
  const p = { ...photos[0], id: photos[0].id || photos[0].__id };
  if (photos.length !== 1 || !p.uploaded || p.linkedBarcode !== '7777' || p.storagePath !== `workspaces/w1/stockChecks/${id}/${p.id}.jpg`) throw new Error(JSON.stringify(photos));
  if ((await store(`${W}stockChecks/${id}`)).photoCount !== 1) throw new Error('photo not counted');
  if (!(await page.evaluate(() => window.__uploads)).includes(p.storagePath)) throw new Error('not uploaded');
});

await step('finish, then lock: locked means nobody scans', async () => {
  await page.click('.cnt-back a');
  await page.click('button[data-act="finish"]');
  await page.click('.dialog .actions button.primary >> nth=-1');
  await page.waitForSelector('.pill:has-text("已完成")');
  await page.click('button[data-act="menu"]');
  await page.click('button[data-act="lock"]');
  await page.waitForSelector('.pill:has-text("已锁定")');
  await page.waitForSelector('input.scan', { state: 'detached' });
  const c = await store(`${W}stockChecks/${id}`);
  if (c.status !== 'LOCKED' || c.lockedByUid !== 'u1') throw new Error(JSON.stringify(c));
  await page.click('button[data-act="menu"]');
  await page.click('button[data-act="unlock"]');
  await page.waitForSelector('input.scan');
});

await step('the counts list: search, a status chip, pick two and export them to Excel', async () => {
  await page.goto(base + '/count/#/');
  await page.waitForSelector('.cnt-card');
  await page.click('.cnt-filter button:has-text("已完成")');
  if (await page.$(`.cnt-card[href="#/c/${id}"]`)) throw new Error('status chip did not filter');
  await page.click('.cnt-filter button:has-text("全部")');
  await page.fill('.cnt-filters input', 'cold');
  await page.waitForSelector(`.cnt-card[href="#/c/${id}"]`);
  if ((await page.$$('.cnt-card')).length !== 1) throw new Error('search did not narrow');
  await page.fill('.cnt-filters input', '');
  for (const tick of await page.$$('.cnt-tick')) await tick.click();
  await page.waitForSelector('.cnt-selbar:has-text("2 已选")');
  await shot('count-6-picked');
  await page.click('button[data-act="export-selected"]');
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="do-export"]')]);
  if (!/\.xlsx$/.test(file.suggestedFilename())) throw new Error(file.suggestedFilename());
  const { readCells } = await import('../../web/js/sheet.js');
  const rows = await readCells(new Uint8Array((await import('node:fs')).readFileSync(await file.path())));
  if (rows[0][0] !== 'Ref No' || !rows[0].includes('Condition') || !rows.some((r) => r.includes('Biskut Kelapa') && r.includes('Damaged'))) throw new Error(JSON.stringify(rows.slice(0, 3)));
});

await step('a count list made on the web: fields, a role lock, a photo rule', async () => {
  await page.click('a[data-tab="lists"]');
  await page.waitForSelector('.cnt-card:has-text("Chiller list")');
  await page.click('button[data-act="new-list"]');
  await page.fill('[data-f="name"]', 'Gudang weekly');
  await page.click('button[data-act="add-field"]');
  await page.fill('.cl-field input >> nth=0', 'Pallet no');
  await page.click('button[data-act="add-field"]');
  await page.fill('.cl-field >> nth=1 >> input >> nth=0', 'Condition');
  await page.selectOption('.cl-field >> nth=1 >> select', 'DROPDOWN');
  await page.fill('.cl-field >> nth=1 >> input >> nth=1', 'OK, Wet, Torn');
  await page.click('.cl-field >> nth=1 >> .chips-row button:has-text("Worker")');
  await shot('count-7-list');
  await page.click('button[data-act="save-list"]');
  await page.waitForSelector('.cnt-card:has-text("Gudang weekly")');
  const t = (await docs(`${W}templates/`)).find((x) => x.name === 'Gudang weekly');
  if (t.fields.length !== 2 || t.fields[0].key !== 'pallet_no' || t.fields[1].options.join() !== 'OK,Wet,Torn' || t.fields[1].lockedForRoleIds.join() !== 'worker') throw new Error(JSON.stringify(t));
});

await step('reports: two counts compared, biggest change first', async () => {
  await page.click('a[data-tab="reports"]');
  await page.click('button[data-mode="counts"]');
  await page.selectOption('select[data-pick="a"]', 'sc1');
  await page.selectOption('select[data-pick="b"]', id);
  await page.waitForSelector('.cr-table tr[data-key="9555012345678"] td.cr-down');
  await shot('count-8-report');
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="export-report"]')]);
  if (!/\.xlsx$/.test(file.suggestedFilename())) throw new Error('no report file');
});

await step('a count: its change history, and counting the same products again', async () => {
  await page.goto(`${base}/count/#/c/${id}`);
  await page.click('button[data-act="menu"]');
  await page.click('button[data-act="history"]');
  await page.waitForSelector('.cnt-history-row:has-text("状态")');
  await page.keyboard.press('Escape');
  await page.click('button[data-act="menu"]');
  await page.click('button[data-act="duplicate"]');
  await page.waitForFunction((old) => /#\/c\/.+/.test(location.hash) && !location.hash.endsWith(old), id);
  const fresh = await page.evaluate(() => location.hash.split('/').pop());
  const lines = await docs(`${W}stockChecks/${fresh}/items/`);
  if (lines.length !== 3 || lines.some((l) => l.quantityMilli !== 0)) throw new Error(JSON.stringify(lines));
  await page.click('button[data-act="menu"]');
  await page.click('button[data-act="delete-count"]');
  await page.click('.dialog .actions button.danger');
  await page.waitForFunction(() => location.hash === '#/' || location.hash === '');
  if (await store(`${W}stockChecks/${fresh}`)) throw new Error('not deleted');
});
let failed = await s.done();

// ------------------------------------------------------------- on a phone
const p = await start({ viewport: { width: 390, height: 844 } });
await p.step('on a phone: one menu button, the counts grouped', async () => {
  await p.page.goto(p.base + '/count/');
  await p.page.waitForSelector('.cnt-card');
  if (await p.page.isVisible('.cnt-top .appswitch')) throw new Error('the header did not fold');
  await p.page.click('button[data-act="top-menu"]');
  await p.page.waitForSelector('.dialog .cnt-menu a:has-text("SuXin POS")');
  await p.page.keyboard.press('Escape');
  await p.shot('count-5-phone');
});
failed += await p.done();
process.exit(failed ? 1 : 0);
