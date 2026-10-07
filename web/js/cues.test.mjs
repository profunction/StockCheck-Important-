// node web/js/cues.test.mjs -- which steps are read, in which language.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cueText, cuesBetween, cuesUrl } from './cues.js';

test('a step in each language; Malay falls back to English', () => {
  const cue = { t: 1000, zh: '扫码', en: 'Scan' };
  assert.equal(cueText(cue, 'zh'), '扫码');
  assert.equal(cueText(cue, 'en'), 'Scan');
  assert.equal(cueText(cue, 'ms'), 'Scan');
  assert.equal(cueText({ ...cue, ms: 'Imbas' }, 'ms'), 'Imbas');
});

test('the steps between two moments of the video, each once', () => {
  const cues = [{ t: 0 }, { t: 2500 }, { t: 5000 }];
  assert.deepEqual(cuesBetween(cues, -1, 0).map((c) => c.t), [0]);
  assert.deepEqual(cuesBetween(cues, 0, 3).map((c) => c.t), [2500]);
  assert.deepEqual(cuesBetween(cues, 3, 4.9).map((c) => c.t), []);
  assert.deepEqual(cuesBetween(cues, 4.9, 6).map((c) => c.t), [5000]);
});

test('the steps sit beside the video, whatever its version', () => {
  assert.equal(cuesUrl('/videos/pos-1-start.webm'), '/videos/pos-1-start.webm.json');
  assert.equal(cuesUrl('/videos/pos-1-start.webm?v=2'), '/videos/pos-1-start.webm.json?v=2');
});
