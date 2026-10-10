// Signing in with Google: a new Google account registers a company or joins
// one with its code (no password); an existing one opens straight in; an
// email that already has a password is told how to link; Profile links
// Google; and an admin confirms the till lock with Google.
import { start } from './harness.mjs';

const s = await start({ seedPatch: { set: { 'workspaceCodes/KEDAI': { workspaceId: 'w1', companyName: 'Kedai Jeffrey', createdByUid: 'u1' } } } });
const { page, base, step, shot, store } = s;
const as = (google) => page.evaluate((g) => { window.__google = g; window.__googleError = ''; }, google);
const signedOut = async () => {
  await page.evaluate(() => { window.__signedOut = true; });
  await page.goto(`${base}/app/`);
  await page.waitForSelector('button[data-act="google"]');
};

// Signed out on every page load, until a step says to stay signed in.
await page.addInitScript(() => { if (!sessionStorage.getItem('stayIn')) window.__signedOut = true; });

await step('sign-in screen: "Sign in with Google" under the password form', async () => {
  await page.goto(`${base}/app/`);
  await page.waitForSelector('button[data-act="google"]:has-text("用 Google 登录")');
  await shot('google-1-signin');
});

await step('a new Google account registers a new company, no password', async () => {
  await as({ uid: 'g9', email: 'mei@gmail.com', displayName: 'Mei' });
  await page.click('button[data-act="google"]');
  await page.waitForSelector('button[data-act="google-finish"]');
  if (await page.inputValue('input[autocomplete="name"]') !== 'Mei') throw new Error('name not from Google');
  await page.click('.auth-tabs button[data-tab="create"]');
  await page.fill('input[autocomplete="organization"]', 'Kedai Mei');
  await page.fill('input[autocapitalize="characters"]', 'KEDAIMEI');
  await shot('google-2-one-more-step');
  await page.click('button[data-act="google-finish"]');
  await page.waitForSelector('.hub-grid');
  const idx = await store('userIndex/g9');
  const profile = await store(`workspaces/${idx.workspaceId}/users/g9`);
  if (profile.roleId !== 'admin' || profile.email !== 'mei@gmail.com') throw new Error(JSON.stringify(profile));
  if ((await store('workspaceCodes/KEDAIMEI'))?.workspaceId !== idx.workspaceId) throw new Error('code not claimed');
});

await step('a new Google account joins a company with its code, as staff', async () => {
  await signedOut();
  await as({ uid: 'g10', email: 'ali.staff@gmail.com', displayName: 'Ali' });
  await page.click('button[data-act="google"]');
  await page.waitForSelector('button[data-act="google-finish"]');
  await page.fill('input[autocapitalize="characters"]', 'kedai');
  await page.click('button[data-act="google-finish"]');
  await page.waitForSelector('.hub-grid');
  const p = await store('workspaces/w1/users/g10');
  if (p?.roleId !== 'worker' || (await store('userIndex/g10'))?.workspaceId !== 'w1') throw new Error(JSON.stringify(p));
});

await step('a wrong company code is said in words, and "use another account" signs out', async () => {
  await signedOut();
  await as({ uid: 'g11', email: 'x@gmail.com' });
  await page.click('button[data-act="google"]');
  await page.waitForSelector('button[data-act="google-finish"]');
  await page.fill('input[autocapitalize="characters"]', 'NOPE');
  await page.click('button[data-act="google-finish"]');
  await page.waitForSelector('.auth-note:has-text("找不到这个公司代码")');
  await page.click('button[data-act="google-other"]');
  await page.waitForSelector('button[data-act="google"]:has-text("用 Google 登录")');
});

await step('an email that already has a password is told to link Google in Profile', async () => {
  await page.evaluate(() => { window.__googleError = 'auth/account-exists-with-different-credential'; });
  await page.click('button[data-act="google"]');
  await page.waitForSelector('.auth-note:has-text("绑定 Google")');
  await page.evaluate(() => { window.__googleError = ''; });
});

await step('an existing user with Google linked opens straight into their company', async () => {
  await as({ uid: 'u1', email: 'j@x.com', displayName: 'Jeffrey' });
  await page.click('button[data-act="google"]');
  await page.waitForSelector('.hub-grid');
  if (!(await page.textContent('main')).includes('Kedai Jeffrey')) throw new Error('not their company');
});

await step('Profile: link Google to a password account', async () => {
  await page.evaluate(() => sessionStorage.setItem('stayIn', '1'));
  await page.goto(`${base}/pos/#/profile`);
  await page.click('button[data-act="link-google"]');
  await page.waitForFunction(() => window.__linkedGoogle === 1);
  await page.waitForSelector('.prof-row:has-text("已绑定")');
  await shot('google-3-profile-linked');
});

await step('till lock: the admin confirms with Google', async () => {
  await page.goto(`${base}/pos/#/pos`);
  await page.click('button[data-act="till-lock"]');
  await page.click('button[data-act="till-lock-google"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('jexo.tillLock')) === true);
  if (await page.evaluate(() => window.__googleChecked) !== 1) throw new Error('not checked with Google');
  await page.evaluate(() => localStorage.removeItem('jexo.tillLock'));
});

process.exit((await s.done()) ? 1 : 0);
