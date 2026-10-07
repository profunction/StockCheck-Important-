// node web/js/i18n.test.mjs -- every screen text exists in Chinese and Malay,
// so neither language falls back to English.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const load = (file) => {
  let src = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^import .*$/mg, '').replace(/^export /mg, '');
  const end = src.indexOf('const DICTS');
  if (end > 0) src = src.slice(0, end);
  src = src.replace(/^addStrings\(.*$/mg, '');
  return new Function(`${src}; return { en, zh, ms };`)();
};

for (const file of ['./i18n.js', '../wh/strings.js', './strings-pro.js']) {
  test(`${file}: Chinese and Malay have every English text`, () => {
    const d = load(file);
    for (const lang of ['zh', 'ms']) {
      const missing = Object.keys(d.en).filter((k) => !(k in d[lang]));
      assert.deepEqual(missing, [], `${lang} is missing ${missing.join(', ')}`);
    }
  });
}
