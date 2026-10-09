// node tools/videos/sound.test.mjs -- the marketing films' sound is bright, not dark.
import assert from 'node:assert/strict';
import { EFFECTS, RATE, music } from './sound.mjs';

const peak = (s) => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (s, from = 0, to = s.length) => Math.sqrt(s.slice(from, to).reduce((a, v) => a + v * v, 0) / (to - from));
/** Share of the energy below [f] Hz, by a simple one-pole low-pass. */
function lowShare(s, f) {
  const a = Math.exp(-2 * Math.PI * f / RATE);
  let y = 0; let lo = 0; let all = 0;
  for (const v of s) { y = (1 - a) * v + a * y; lo += y * y; all += v * v; }
  return lo / all;
}

const m = music(20);
assert.equal(m.length, Math.ceil(20 * RATE));
assert.ok(m.every(Number.isFinite), 'no NaN');
assert.ok(peak(m) <= 0.56 && peak(m) > 0.5, `peak ${peak(m)}`);
assert.ok(rms(m, RATE * 2, RATE * 18) > 0.05, 'not near silent');
assert.ok(lowShare(m, 100) < 0.25, `too much rumble: ${lowShare(m, 100).toFixed(2)}`);
for (const [name, make] of Object.entries(EFFECTS)) {
  const s = make();
  assert.ok(s.every(Number.isFinite) && peak(s) > 0.2 && peak(s) <= 0.61, `${name} level ${peak(s)}`);
  assert.ok(s.length < RATE * 2, `${name} short`);
}
console.log('ok   sound: bright music, effects in range, rumble', lowShare(m, 100).toFixed(3));
