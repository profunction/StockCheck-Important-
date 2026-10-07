/**
 * Drives the websites in a real browser against an in-memory Firebase
 * (fb-mock.js): a tiny static server for web/, the page's fb.js swapped for
 * the mock, and a step() that records failures instead of stopping.
 *
 * CHROME: path to a Chromium binary (optional; Playwright's own otherwise).
 */
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
export const WEB = join(here, '..', '..', 'web');
export const OUT = process.env.UI_SHOTS || join(here, 'shots');
const MOCK = readFileSync(join(here, 'fb-mock.js'), 'utf8');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.json': 'application/json' };

async function playwright() {
  try { return await import('playwright'); } catch { /* not installed here */ }
  const require = createRequire(import.meta.url);
  for (const p of ['/opt/node22/lib/node_modules/playwright']) {
    try { return require(p); } catch { /* next */ }
  }
  throw new Error('Playwright is not installed: npm install in tests/ui');
}

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  return existsSync(local) ? local : undefined;
}

/**
 * Opens a browser on the sites. [seedPatch] changes the starting data,
 * [lang] the language, [viewport] the window size.
 */
export async function start({ seedPatch = {}, lang = 'zh', viewport = { width: 1366, height: 800 }, colorScheme = 'light' } = {}) {
  mkdirSync(OUT, { recursive: true });
  const server = http.createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    let file = join(WEB, path);
    if (!existsSync(file) || path.endsWith('/')) {
      if (existsSync(join(file, 'index.html'))) file = join(file, 'index.html');
      else if (path.startsWith('/warehouse')) file = join(WEB, 'warehouse/index.html');
      else file = join(WEB, 'pos/index.html');
    }
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = await playwright();
  const browser = await chromium.launch({ executablePath: chromePath() });
  const context = await browser.newContext({ viewport, colorScheme, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.addInitScript(([l, patch]) => {
    localStorage.setItem('pos.lang', JSON.stringify(l));
    window.__seedPatch = patch;
    window.print = () => { window.__printed = (window.__printed || 0) + 1; };
    window.open = () => ({ document: { write() {}, close() {} } });
  }, [lang, seedPatch]);
  await page.route('**/js/fb.js', (route) => route.fulfill({ contentType: 'text/javascript', body: MOCK }));
  let failures = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log('ok   ', name); } catch (e) {
      errors.push(`${name}: ${e.message.split('\n')[0]}`);
      console.log('FAIL ', name, e.message.split('\n')[0]);
      await page.screenshot({ path: `${OUT}/fail-${++failures}.png` }).catch(() => {});
      // A dialog left open by a failed step would block every step after it.
      await page.keyboard.press('Escape').catch(() => {});
    }
  };
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const store = (path) => page.evaluate((p) => window.__store.get(p), path);
  const docs = (prefix) => page.evaluate((p) => [...window.__store].filter(([k]) => k.startsWith(p) && k.slice(p.length).split('/').length === 1).map(([k, v]) => ({ ...v, __id: k.split('/').pop() })), prefix);
  const done = async () => {
    console.log(errors.length ? `\n${errors.length} problem(s):\n${errors.join('\n')}` : '\nall good');
    await browser.close();
    server.close();
    return errors.length;
  };
  return { page, base, step, shot, store, docs, done, errors, browser, context };
}
