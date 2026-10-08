// The app centre and the switcher, JEXO Count on the web, signing up and
// the forgotten password, the till mode lock, the till lock and the menu
// that folds away.
import { start } from './harness.mjs';

const W = 'workspaces/w1/';
let failed = 0;

// ------------------------------------------------ app centre, by the plan
{
  const s = await start({ seedPatch: { set: { 'licences/w1': { plan: 'APP_ONLY', status: 'ACTIVE', expiresAt: 0, modules: { app: true, pos: false, warehouse: false, api: false } } } } });
  await s.step('app centre: what the plan includes opens, the rest is locked', async () => {
    await s.page.goto(s.base + '/app/');
    await s.page.waitForSelector('.hub-app[data-app="count"][data-state="open"]');
    await s.page.waitForSelector('.hub-app[data-app="pos"][data-state="locked"]');
    await s.page.waitForSelector('.hub-app[data-app="warehouse"][data-state="locked"]');
    await s.page.waitForSelector('.hub-app[data-app="cloud"][data-state="open"]');
    if (await s.page.$('.hub-app[data-app="pos"] a[href="/pos/#/pos"], a.hub-app[data-app="pos"]')) throw new Error('POS opens without the plan');
    await s.shot('apps-1-hub');
  });
  await s.step('the switcher in JEXO Count shows the locked apps locked', async () => {
    await s.page.goto(s.base + '/count/');
    await s.page.waitForSelector('.cnt-top .appswitch');
    await s.page.click('.cnt-top .appswitch summary');
    await s.page.waitForSelector('.appswitch-list a.locked[data-app="pos"]');
    await s.page.waitForSelector('.appswitch-list a[data-app="count"].on');
  });
  failed += await s.done();
}

// ------------------------------------------------ JEXO Count on the web
{
  const s = await start({});
  const { page, base, step, store, docs } = s;
  let id = '';
  await step('count: start a count in an area', async () => {
    await page.goto(base + '/count/');
    await page.waitForSelector('.cnt-card');
    await page.click('button:has-text("新盘点")');
    await page.fill('form input >> nth=0', 'Rak 3');
    await page.click('form button.primary');
    await page.waitForFunction(() => /#\/c\/.+/.test(location.hash));
    id = await page.evaluate(() => location.hash.split('/').pop());
    const c = await store(`${W}stockChecks/${id}`);
    if (c.status !== 'IN_PROGRESS' || c.zone !== 'Rak 3' || c.createdByUid !== 'u1' || !/^RC-\d\d\/\d\d\/\d{4}-001$/.test(c.refNo)) throw new Error(JSON.stringify(c));
  });
  await step('count: scans add up, a weight, an unknown code', async () => {
    await page.waitForSelector('input.scan');
    const scan = async (code) => { await page.fill('input.scan', code); await page.press('input.scan', 'Enter'); };
    await scan('9555012345678');
    await scan('E2801160600002054D2C5A1B'); // the same Milo, by its other code
    await page.waitForSelector('.cnt-line[data-code="9555012345678"] .cnt-n:has-text("2")');
    await page.fill('.cnt-qty', '1.5');
    await page.press('.cnt-qty', 'Tab');
    await scan('8888');
    await page.waitForSelector('.cnt-line[data-code="8888"] .cnt-n:has-text("1.5")');
    await page.fill('.cnt-qty', '1');
    await page.press('.cnt-qty', 'Tab');
    await scan('12345');
    await page.waitForSelector('.cnt-line[data-code="12345"]:has-text("商品清单里没有")');
    await page.click('.cnt-line[data-code="12345"] button:has-text("取名字")');
    await page.fill('.dialog input', 'Kuih Lapis');
    await page.click('.dialog .actions button.primary');
    await page.waitForSelector('.cnt-line[data-code="12345"]:has-text("Kuih Lapis")');
    await s.shot('apps-2-count');
  });
  await step('count: set a quantity by tapping it; the totals follow', async () => {
    await page.click('.cnt-line[data-code="9555012345678"] .cnt-n');
    await page.fill('.dialog input', '10');
    await page.click('.dialog .actions button.primary');
    await page.waitForSelector('.cnt-line[data-code="9555012345678"] .cnt-n:has-text("10")');
    const lines = await docs(`${W}stockChecks/${id}/items/`);
    const milo = lines.find((l) => l.barcode === '9555012345678');
    if (lines.length !== 3 || milo.quantityMilli !== 10000 || milo.productName !== 'Milo 1kg' || milo.source !== 'SCAN') throw new Error(JSON.stringify(lines));
    const c = await store(`${W}stockChecks/${id}`);
    if (c.itemCount !== 3 || c.totalQuantityMilli !== 12500) throw new Error(JSON.stringify(c));
    if (!(await store(`${W}products/12345`))?.name) throw new Error('product not named');
  });
  await step('count: finishing it makes it read only', async () => {
    await page.click('button[data-act="finish"]');
    await page.click('.dialog .actions button.primary >> nth=-1');
    await page.waitForSelector('.pill:has-text("已完成")');
    await page.waitForSelector('text=只能看');
    const c = await store(`${W}stockChecks/${id}`);
    if (c.status !== 'COMPLETED' || !c.completedAt) throw new Error(JSON.stringify(c));
    const audit = (await docs(`${W}auditLog/`)).filter((a) => a.stockCheckId === id);
    if (audit.length !== 2) throw new Error('audit ' + audit.length);
  });
  failed += await s.done();
}

// ------------------------------------------------ signing up, resetting
{
  const s = await start({ seedPatch: { set: { 'workspaceCodes/KEDAI1': { workspaceId: 'w1', companyName: 'Kedai Jeffrey', createdAt: 1, createdByUid: 'u1' } } } });
  const { page, base, step, store, docs } = s;
  await page.addInitScript(() => { window.__signedOut = true; });
  const fill = async (vals) => { for (const [i, v] of vals.entries()) await page.fill(`.auth-card form input >> nth=${i}`, v); };
  await step('sign-up: the forgotten password needs the email and the company code', async () => {
    await page.goto(base + '/app/#reset');
    await page.waitForSelector('.auth-card h3:has-text("忘记密码")');
    // An empty company code is refused by the form itself.
    if (!(await page.$eval('.auth-card form input >> nth=1', (el) => el.required).catch(() => false))
      && !(await page.$$eval('.auth-card form input', (els) => els[1].required))) throw new Error('code not required');
    await fill(['ali@x.com', 'kedai1']);
    await page.click('.auth-card form button.primary');
    await page.waitForSelector('.auth-note:has-text("已寄出")');
    if (!(await page.evaluate(() => window.__resetMails)).includes('ali@x.com')) throw new Error('no reset mail');
  });
  await step('sign-up: a wrong company code is refused and the account removed', async () => {
    await page.goto(base + '/app/#join');
    await page.reload();
    await page.waitForSelector('.auth-tabs button.on[data-tab="join"]');
    await fill(['Mei', 'mei@x.com', '123456', '123456', 'NOPE']);
    await page.click('.auth-card form button.primary');
    await page.waitForSelector('.auth-note:has-text("找不到这个公司代码")');
    if (!(await page.evaluate(() => window.__deletedUser))) throw new Error('account left behind');
  });
  await step('sign-up: join with the code as staff', async () => {
    await fill(['Mei', 'mei2@x.com', '123456', '123456', 'kedai1']);
    await page.click('.auth-card form button.primary');
    await page.waitForSelector('.hub h1');
    const me = (await docs(`${W}users/`)).find((u) => u.email === 'mei2@x.com');
    if (!me || me.roleId !== 'worker' || me.joinCode !== 'KEDAI1') throw new Error(JSON.stringify(me));
    if ((await store(`userIndex/${me.__id}`))?.workspaceId !== 'w1') throw new Error('not linked');
  });
  failed += await s.done();
}
{
  const s = await start({});
  const { page, base, step, store } = s;
  await page.addInitScript(() => { window.__signedOut = true; });
  await step('sign-up: a new company, its admin, roles, code, settings and trial', async () => {
    await page.goto(base + '/app/#create');
    await page.waitForSelector('.auth-tabs button.on[data-tab="create"]');
    const vals = ['Lim', 'lim@x.com', '123456', '123456', 'Kedai Lim', 'lim'];
    for (const [i, v] of vals.entries()) await page.fill(`.auth-card form input >> nth=${i}`, v);
    await page.click('.auth-card form button.primary');
    await page.waitForSelector('.auth-note:has-text("至少要 4")');
    await page.fill('.auth-card form input >> nth=5', 'kedailim');
    await page.click('.auth-card form button.primary');
    await page.waitForSelector('.hub h1');
    await s.shot('apps-3-new-company');
    const code = await store('workspaceCodes/KEDAILIM');
    const ws = code.workspaceId;
    const admin = await page.evaluate((w) => [...window.__store].find(([k, v]) => k.startsWith(`workspaces/${w}/users/`) && v.roleId === 'admin')?.[1], ws);
    const roles = await page.evaluate((w) => [...window.__store.keys()].filter((k) => k.startsWith(`workspaces/${w}/roles/`)).length, ws);
    const config = await store(`workspaces/${ws}/meta/config`);
    const lic = await store(`licences/${ws}`);
    if (!admin || admin.email !== 'lim@x.com' || roles !== 4 || config.joinCode !== 'KEDAILIM' || config.companyName !== 'Kedai Lim' || lic.plan !== 'TRIAL') {
      throw new Error(JSON.stringify({ admin, roles, config, lic }));
    }
  });
  failed += await s.done();
}

// ------------------------------------- mode lock, till lock, menu folding
{
  const s = await start({ seedPatch: { merge: { [`${W}pos/settings`]: { mode: 'SUPERMARKET' } } } });
  const { page, base, step, store } = s;
  await step('settings: the chosen mode is locked, with where to change it', async () => {
    await page.goto(base + '/pos/#/settings/features');
    await page.waitForSelector('.mode-lock:has-text("我的 Profile")');
    await page.click('.modecard[data-mode="FNB"]');
    await page.click('.card .actions button.primary');
    await page.waitForTimeout(300);
    if ((await store(`${W}pos/settings`)).mode !== 'SUPERMARKET') throw new Error('mode changed from settings');
  });
  await step('profile: an admin changes the mode after the password', async () => {
    await page.goto(base + '/pos/#/profile');
    await page.click('button[data-act="change-mode"]');
    await page.click('.dialog .modecard[data-mode="RETAIL"]');
    await page.fill('.dialog input[type=password]', 'wrong');
    await page.click('.dialog .actions button.primary');
    await page.waitForSelector('.dialog:has-text("密码不对")');
    await page.fill('.dialog input[type=password]', 'secret');
    await page.click('.dialog .actions button.primary');
    await page.waitForFunction(() => window.__store.get('workspaces/w1/pos/settings').mode === 'RETAIL');
    await s.shot('apps-4-profile');
  });
  await step('till lock: wrong password refused; locked, only the till', async () => {
    await page.goto(base + '/pos/#/pos');
    await page.click('button[data-act="till-lock"]');
    await page.fill('.dialog input[type=password]', 'wrong');
    await page.click('button[data-act="till-lock-ok"]');
    await page.waitForSelector('.dialog:has-text("密码不对")');
    await page.fill('.dialog input[type=password]', 'secret');
    await page.click('button[data-act="till-lock-ok"]');
    await page.waitForSelector('button[data-act="till-lock"].on');
    const menu = await page.$$eval('.side nav a, .side nav button', (els) => els.map((e) => e.textContent.trim()));
    if (menu.length !== 1 || !menu[0].includes('收银')) throw new Error(menu.join('|'));
    if (await page.$('.side a.side-link[href="/warehouse/"], .side .appswitch')) throw new Error('other apps reachable while locked');
    await page.goto(base + '/pos/#/reports/summary');
    await page.waitForFunction(() => location.hash.startsWith('#/pos'));
    await page.goto(base + '/warehouse/');
    await page.waitForFunction(() => location.pathname.startsWith('/pos'));
    await s.shot('apps-5-till-locked');
  });
  await step('till lock: unlocking needs the password too', async () => {
    await page.waitForSelector('button[data-act="till-lock"].on');
    await page.click('button[data-act="till-lock"]');
    await page.fill('.dialog input[type=password]', 'secret');
    await page.click('button[data-act="till-lock-ok"]');
    await page.waitForSelector('button[data-act="till-lock"]:not(.on)');
    await page.goto(base + '/pos/#/reports/summary');
    await page.waitForSelector('h1');
    if (!(await page.evaluate(() => location.hash.startsWith('#/reports')))) throw new Error('still locked');
  });
  await step('tills: numbered, named, and on the receipt', async () => {
    await page.goto(base + '/pos/#/pos');
    await page.waitForSelector('.till-badge:has-text("收银机 1")');
    await page.goto(base + '/pos/#/settings/device');
    await page.waitForSelector('.this-till:has-text("收银机 1")');
    await page.fill('input[aria-label="收银机名称"]', 'Kaunter A');
    await page.click('.card:has(.this-till) button:has-text("保存")');
    await page.waitForSelector('.this-till:has-text("Kaunter A")');
    await page.goto(base + '/pos/#/pos');
    await page.waitForSelector('.till-badge:has-text("Kaunter A")');
    await page.fill('input.scan', '9555012345678');
    await page.press('input.scan', 'Enter');
    await page.click('.mpanel .pay, .buttons .pay');
    await page.click('.dialog .paymethods button:has-text("现金")');
    await page.click('.dialog .quick button:has-text("RM 50")');
    await page.click('.dialog .actions button.primary');
    await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/sales/') && v.tillNo === 1 && v.tillName === 'Kaunter A'));
    await page.click('.dialog button:has-text("下一单")');
  });
  await step('menu: folds away and comes back', async () => {
    await page.goto(base + '/pos/#/pos');
    await page.click('.side .side-collapse');
    await page.waitForSelector('.shell.collapsed');
    if (await page.isVisible('.side')) throw new Error('menu still shown');
    await page.click('.menu-toggle >> nth=0');
    await page.waitForSelector('.shell:not(.collapsed) .side');
  });
  failed += await s.done();
}

// ------------------------------------------------ guides that talk
{
  const s = await start({});
  const { page, base, step } = s;
  // The device's voice, listened to: what would be said, in which language.
  await page.addInitScript(() => {
    window.__spoken = [];
    class Utterance { constructor(text) { this.text = text; } }
    window.SpeechSynthesisUtterance = Utterance;
    Object.defineProperty(window, 'speechSynthesis', { value: {
      paused: false, getVoices: () => [],
      speak(u) { window.__spoken.push([u.text, u.lang]); setTimeout(() => u.onend?.(), 20); },
      cancel() {}, pause() {}, resume() {},
    } });
  });
  await step('guide: every tab, every section with a video has its voice switch', async () => {
    for (const tab of ['account', 'app', 'pos', 'warehouse', 'cloud']) {
      await page.goto(`${base}/guide/#${tab}`);
      await page.reload();
      await page.waitForSelector('.guide section');
      const [videos, switches] = await page.evaluate(() => [document.querySelectorAll('.guide video').length, document.querySelectorAll('.guide [data-act="narrate"]').length]);
      if (!videos || videos !== switches) throw new Error(`${tab}: ${videos} videos, ${switches} switches`);
    }
  });
  await step('guide: beside the account guide, sign in or register with a company code', async () => {
    await page.goto(`${base}/guide/#account`);
    await page.reload();
    await page.waitForSelector('.gp-split .acct');
    for (const go of ['signin', 'create']) await page.waitForSelector(`.acct a[data-go="${go}"]`);
    await page.addInitScript(() => { window.__signedOut = true; });
    await page.click('.acct a[data-go="create"]');
    await page.waitForSelector('.auth-tabs button.on[data-tab="create"]');
    if (!(await page.isVisible('.auth-card:has-text("公司代码")'))) throw new Error('no company code on register');
  });
  await step('guide: playing a video reads its steps aloud in the page language', async () => {
    await page.goto(`${base}/guide/#pos`);
    await page.reload();
    await page.waitForSelector('.guide video');
    await page.evaluate(() => { const v = document.querySelector('.guide video'); v.muted = true; v.play(); });
    await page.waitForFunction(() => window.__spoken.length > 0, null, { timeout: 20000 });
    const [text, lang] = await page.evaluate(() => window.__spoken[0]);
    if (!/收银/.test(text) || !lang.startsWith('zh')) throw new Error(`${text} ${lang}`);
  });
  await step('guide: the voice can be switched off', async () => {
    await page.click('.guide [data-act="narrate"] >> nth=0');
    await page.waitForSelector('.guide [data-act="narrate"]:has-text("关")');
    if (await page.evaluate(() => JSON.parse(localStorage.getItem('guide.narrate')))) throw new Error('not kept');
  });
  failed += await s.done();
}

process.exit(failed ? 1 : 0);
