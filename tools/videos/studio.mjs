/**
 * The film studio shared by the guide videos (record.mjs) and the
 * marketing videos (promo.mjs): a visible pointer, captions, title cards,
 * and film() -- one browser session recorded to web/videos/<name>.webm.
 *
 * Every caption and title is also written down with the moment it appeared
 * (web/videos/<name>.webm.json, [{ t, zh, en }]): the guide pages read them
 * aloud while the video plays (web/js/narrate.js).
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from '../../tests/ui/harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const OUT = join(here, '..', '..', 'web', 'videos');
export const SIZE = { width: 1280, height: 720 };
export const ONLY = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

// --------------------------------------------------------------- overlay

const OVERLAY = () => {
  if (document.getElementById('demo-cursor')) return;
  const style = document.createElement('style');
  style.textContent = `
    #demo-cursor{position:fixed;z-index:99999;width:22px;height:22px;border-radius:50%;background:rgba(255,196,0,.9);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);pointer-events:none;transform:translate(-50%,-50%);transition:left .5s ease, top .5s ease, transform .15s}
    #demo-cursor.click{transform:translate(-50%,-50%) scale(.6)}
    #demo-cap{position:fixed;z-index:99998;left:50%;bottom:26px;transform:translateX(-50%);max-width:88%;background:rgba(11,27,43,.94);color:#fff;font:700 25px/1.35 "Noto Sans CJK SC","Noto Sans SC",sans-serif;padding:11px 26px;border-radius:14px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.35);transition:opacity .3s;pointer-events:none}
    #demo-cap small{display:block;font:500 16px/1.3 system-ui,sans-serif;opacity:.82;margin-top:3px}
    #demo-cap:empty{opacity:0}
    #demo-title{position:fixed;inset:0;z-index:99997;background:var(--demo-bg,linear-gradient(135deg,#0b1b2b,#12385a 70%,#0f4c4a));color:#fff;display:grid;place-items:center;text-align:center;font:800 52px/1.3 "Noto Sans CJK SC","Noto Sans SC",sans-serif;transition:opacity .6s;pointer-events:none}
    #demo-title small{display:block;font-size:26px;font-weight:500;opacity:.9;margin-top:14px}
    #demo-title em{display:block;font:500 20px/1.3 system-ui,sans-serif;font-style:normal;opacity:.7;margin-top:8px}`;
  document.head.append(style);
  const c = document.createElement('div'); c.id = 'demo-cursor'; c.style.left = '640px'; c.style.top = '360px';
  const cap = document.createElement('div'); cap.id = 'demo-cap';
  document.body.append(c, cap);
};

const plain = (html) => String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export function helpers(page, cues = [], t0 = Date.now()) {
  const wait = (ms) => page.waitForTimeout(ms);
  const overlay = () => page.evaluate(OVERLAY);
  /** Something to say [after] ms from now. */
  const cue = (zh, en, after = 0, bm = '') => {
    if (zh || en) cues.push({ t: Date.now() - t0 + after, zh: plain(zh), en: plain(en), ...(bm ? { ms: plain(bm) } : {}) });
  };
  return {
    wait,
    cue,
    /** Shows [zh] with [en] under it for [ms]; [bm] is only spoken (Malay pages). */
    async caption(zh, en = '', ms = 2300, bm = '') {
      await overlay();
      cue(zh, en, 0, bm);
      await page.evaluate(([a, b]) => { const c = document.getElementById('demo-cap'); c.innerHTML = a ? `${a}${b ? `<small>${b}</small>` : ''}` : ''; }, [zh, en]);
      await wait(ms);
    },
    async title(big, small, en, { bg = '', bm = '' } = {}) {
      await overlay();
      cue(`${plain(big)}。${plain(small)}`, en, 0, bm);
      await page.evaluate(([b, s, e, g]) => {
        const t = document.createElement('div'); t.id = 'demo-title'; if (g) t.style.setProperty('--demo-bg', g);
        t.innerHTML = `<div>${b}<small>${s}</small><em>${e}</em></div>`; document.body.append(t);
      }, [big, small, en, bg]);
      await wait(2600);
      await page.evaluate(() => { const t = document.getElementById('demo-title'); t.style.opacity = '0'; setTimeout(() => t.remove(), 700); });
      await wait(700);
    },
    async point(selector) {
      await overlay();
      const el = page.locator(selector).first();
      await el.scrollIntoViewIfNeeded();
      const box = await el.boundingBox();
      await page.evaluate(([x, y]) => { const c = document.getElementById('demo-cursor'); c.style.left = `${x}px`; c.style.top = `${y}px`; }, [box.x + box.width / 2, box.y + box.height / 2]);
      await wait(600);
    },
    async click(selector, after = 650) {
      await this.point(selector);
      await page.evaluate(() => { const c = document.getElementById('demo-cursor'); c.classList.add('click'); setTimeout(() => c.classList.remove('click'), 160); });
      await page.locator(selector).first().click();
      await wait(after);
    },
    async type(selector, text, after = 400) {
      await this.click(selector, 200);
      await page.locator(selector).first().fill('');
      for (const ch of text) { await page.keyboard.type(ch); await wait(45); }
      await wait(after);
    },
    async scan(code, after = 450) {
      for (const ch of code) await page.keyboard.type(ch);
      await page.keyboard.press('Enter');
      await wait(after);
    },
    async go(base, path, after = 900) {
      await page.goto(base + path);
      await wait(after);
      await overlay();
    },
  };
}

export async function film(name, seed, fn, { path = '/pos/', size = SIZE, lang = 'zh' } = {}) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const dir = join(OUT, `_raw_${name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const s = await start({ seedPatch: seed, viewport: size, recordVideo: dir, lang });
  if (seed?.branch) await s.page.addInitScript((b) => localStorage.setItem('pos.branch.w1', JSON.stringify(b)), seed.branch);
  const cues = [];
  const x = helpers(s.page, cues, Date.now());
  try {
    if (path) await s.page.goto(s.base + path);
    await fn(s.page, x, s.base);
  } catch (err) {
    console.error(`${name}: ${err.message.split('\n')[0]}`);
    await s.page.screenshot({ path: join(OUT, `_fail_${name}.png`) }).catch(() => {});
  }
  const video = s.page.video();
  await s.context.close();
  renameSync(await video.path(), join(OUT, `${name}.webm`));
  writeFileSync(join(OUT, `${name}.webm.json`), `${JSON.stringify(cues)}\n`);
  rmSync(dir, { recursive: true, force: true });
  await s.done();
  console.log('filmed', name);
}

