/**
 * The marketing films' sound, made here from plain sine waves -- nobody
 * else's music, so nothing to license -- and written as WAV files for
 * mp4.mjs to lay under the picture.
 *
 * - music(seconds): a bright, cheerful bed in C major (marimba-like
 *   arpeggios over C - G - Am - F, a soft pad and a light bass, with a
 *   little echo). No sub-bass, no noise: friendly, not dramatic.
 * - EFFECTS: ding (the till's bell), beep (a scan), cash, pop, swish (a
 *   soft rising glide between cards) and womp (a comic "wah-wah" for bad
 *   news).
 *
 * Pure: tested in sound.test.mjs (levels, length, no silence, no clipping).
 */
import { writeFileSync } from 'node:fs';

export const RATE = 44100;
const TAU = Math.PI * 2;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** A mono buffer of [seconds]. */
const buffer = (seconds) => new Float32Array(Math.ceil(seconds * RATE));

/** Adds a plucked, marimba-like note: fundamental, a soft 4th partial, quick decay. */
function pluck(out, at, midi, { gain = 0.2, decay = 3.2, len = 0.9 } = {}) {
  const f = hz(midi);
  const start = Math.round(at * RATE);
  const n = Math.min(Math.round(len * RATE), out.length - start);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.004);
    const env = attack * Math.exp(-decay * t);
    out[start + i] += gain * env * (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 4 * f * t) * Math.exp(-14 * t) + 0.08 * Math.sin(TAU * 2 * f * t));
  }
}

/** Adds a soft held chord: slow in, slow out. */
function pad(out, at, midis, len, gain = 0.035) {
  const start = Math.round(at * RATE);
  const n = Math.min(Math.round(len * RATE), out.length - start);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.35) * Math.min(1, (len - t) / 0.35);
    let v = 0;
    for (const m of midis) v += Math.sin(TAU * hz(m) * t) + 0.15 * Math.sin(TAU * 2 * hz(m) * t);
    out[start + i] += gain * env * v;
  }
}

/** A cheerful bed of [seconds], with a fade in and out. Returns mono samples. */
export function music(seconds) {
  const out = buffer(seconds);
  const beat = 60 / 112;
  const bar = beat * 4;
  // I - V - vi - IV in C: root (bass), and the chord as notes.
  const CHORDS = [[48, [60, 64, 67]], [43, [59, 62, 67]], [45, [60, 64, 69]], [41, [60, 65, 69]]];
  const PATTERN = [0, 1, 2, 3, 2, 1, 2, 3]; // up and back over the chord, eighth notes
  for (let b = 0; b * bar < seconds; b++) {
    const [root, chord] = CHORDS[b % 4];
    const notes = [...chord, chord[0] + 12];
    const t0 = b * bar;
    pad(out, t0, chord, bar + 0.2);
    pluck(out, t0, root, { gain: 0.16, decay: 4, len: 1.2 });
    pluck(out, t0 + 2 * beat, root, { gain: 0.12, decay: 4, len: 1.2 });
    PATTERN.forEach((k, i) => pluck(out, t0 + i * (beat / 2), notes[k] + 12, { gain: i % 2 ? 0.09 : 0.12 }));
    // A small tune on top every other bar, so it does not just loop.
    if (b % 2 === 1) [[0, 2], [1.5, 1], [2, 0], [3, 1]].forEach(([at, k]) => pluck(out, t0 + at * beat, notes[k] + 24, { gain: 0.06, decay: 5 }));
  }
  // A little echo makes it sound like a room, not a computer.
  const delay = Math.round(beat * 0.75 * RATE);
  for (let i = delay; i < out.length; i++) out[i] += 0.22 * out[i - delay];
  const fade = Math.round(1.2 * RATE);
  for (let i = 0; i < out.length; i++) {
    const inn = Math.min(1, i / Math.round(0.4 * RATE));
    const outF = Math.min(1, (out.length - i) / fade);
    out[i] *= inn * outF;
  }
  return normalize(out, 0.55);
}

/** Effects, as mono samples. */
export const EFFECTS = {
  ding: () => {
    const out = buffer(1.6);
    for (const [m, g] of [[88, 0.5], [95, 0.25], [100, 0.12]]) pluck(out, 0, m, { gain: g, decay: 2.6, len: 1.6 });
    return normalize(out, 0.6);
  },
  beep: () => {
    const out = buffer(0.12);
    for (let i = 0; i < out.length; i++) { const t = i / RATE; out[i] = Math.sin(TAU * 1800 * t) * Math.min(1, t / 0.003) * Math.min(1, (0.12 - t) / 0.02); }
    return normalize(out, 0.35);
  },
  cash: () => {
    const out = buffer(1);
    pluck(out, 0, 96, { gain: 0.5, decay: 5, len: 1 });
    pluck(out, 0.09, 100, { gain: 0.5, decay: 4, len: 0.9 });
    return normalize(out, 0.55);
  },
  pop: () => {
    const out = buffer(0.16);
    let ph = 0;
    for (let i = 0; i < out.length; i++) { const t = i / RATE; ph += TAU * (500 + 2200 * t) / RATE; out[i] = Math.sin(ph) * Math.exp(-18 * t) * Math.min(1, t / 0.003); }
    return normalize(out, 0.45);
  },
  swish: () => {
    const out = buffer(0.32);
    let ph = 0;
    for (let i = 0; i < out.length; i++) { const t = i / RATE; ph += TAU * (420 + 2400 * t * t * 8) / RATE; out[i] = Math.sin(ph) * Math.sin(Math.PI * t / 0.32) ** 2; }
    return normalize(out, 0.22);
  },
  womp: () => {
    // Two falling "wah"s, like a cartoon trombone: comic, not scary.
    const out = buffer(0.95);
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE;
      const second = t >= 0.42;
      const u = second ? t - 0.42 : t;
      const f = second ? 330 - 60 * Math.min(1, u / 0.5) : 392 - 30 * Math.min(1, u / 0.38);
      ph += TAU * f / RATE;
      const env = Math.min(1, u / 0.03) * (second ? Math.max(0, 1 - u / 0.53) : Math.max(0, 1 - u / 0.4));
      const wah = 0.6 + 0.4 * Math.sin(TAU * 5 * u);
      out[i] = env * wah * (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.15 * Math.sin(3 * ph));
    }
    return normalize(out, 0.4);
  },
};
// The films mark effects by these names; older marks map to the new sounds.
EFFECTS.whoosh = EFFECTS.swish;
EFFECTS.hit = EFFECTS.womp;

/** Scales [samples] so the loudest is [peak]. */
export function normalize(samples, peak) {
  let max = 0;
  for (const v of samples) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < samples.length; i++) samples[i] *= peak / max;
  return samples;
}

/** Writes mono [samples] as a 16-bit stereo WAV. */
export function writeWav(path, samples) {
  const data = Buffer.alloc(samples.length * 4);
  samples.forEach((v, i) => {
    const s = Math.max(-1, Math.min(1, v)) * 32767;
    data.writeInt16LE(Math.round(s), i * 4);
    data.writeInt16LE(Math.round(s), i * 4 + 2);
  });
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([head, data]));
}
