/**
 * Films every page's and every till button's own tutorial (web/js/helpdata.js)
 * into web/videos/help/<key>.webm, with its spoken steps beside it.
 *
 *   node tools/videos/pages.mjs                 every one
 *   node tools/videos/pages.mjs help/till-pay   just that one
 *
 * A step whose button is not on the screen is skipped with a warning, so
 * one missing button never costs the whole video its words.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HELP } from '../../web/js/helpdata.js';
import { item, world } from './world.mjs';
import { OUT, film } from './studio.mjs';

mkdirSync(join(OUT, 'help'), { recursive: true });
const ORDER = ['type', 'click', 'scan', 'point', 'key', 'scroll'];

async function act(page, x, key, kind, arg) {
  try {
    const ready = (sel) => page.locator(sel).first().waitFor({ timeout: 5000 });
    if (kind === 'click') { await ready(arg); await x.click(arg, 700); }
    else if (kind === 'point') { await ready(arg); await x.point(arg); }
    else if (kind === 'type') { await ready(arg[0]); await x.type(arg[0], arg[1], 300); }
    else if (kind === 'scan') await x.scan(item(arg)?.barcode || arg, 700);
    else if (kind === 'key') { await page.keyboard.press(arg); await x.wait(400); }
    else if (kind === 'scroll') { await page.mouse.wheel(0, arg); await x.wait(700); }
  } catch (err) {
    console.warn(`  ${key}: ${kind} ${JSON.stringify(arg)} skipped (${err.message.split('\n')[0]})`);
  }
}

for (const [key, e] of Object.entries(HELP)) {
  await film(`help/${key}`, world(e.world || {}), async (page, x) => {
    await x.wait(1500);
    await x.title(e.title[0], key.startsWith('till-') ? 'SuXin POS · 收银按钮' : 'SuXin · 这一页怎么用', e.title[1], { bm: e.title[2] });
    for (const step of e.steps) {
      const actions = step.do || ORDER.filter((k) => step[k] !== undefined).map((k) => [k, step[k]]);
      for (const [kind, arg] of actions) await act(page, x, key, kind, arg);
      await x.caption(step.say[0], step.say[1], 2600, step.say[2]);
    }
    await x.wait(600);
  }, { path: e.path });
}

rmSync(join(OUT, '_raw_help'), { recursive: true, force: true });
