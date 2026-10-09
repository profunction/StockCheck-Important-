/**
 * The marketing films as MP4 (H.264 + AAC), the format TikTok, Instagram,
 * Facebook and WhatsApp take, each in two:
 *
 *   <name>.mp4        cheerful music + sound effects + the voice
 *   <name>-clean.mp4  sound effects + the voice only -- for TikTok, where a
 *                     trending song added in the app reaches more people
 *
 * The music and effects are made in sound.mjs (nobody else's music, so
 * nothing to license); the effects are the ones each film marked (studio.mjs
 * mark()); the voice is the recorded male voice (voice.mjs) for each step,
 * started when the step appears or as soon as the one before has finished,
 * with the music quieter under it.
 *
 *   node tools/videos/mp4.mjs          needs ffmpeg and ffprobe
 *
 * Run by the deploy; a film already made is kept. If the sound cannot be
 * mixed, the film is still made, silent, and the reason printed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EFFECTS, music, writeWav } from './sound.mjs';

const VIDEOS = fileURLToPath(new URL('../../web/videos/', import.meta.url));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).toString();
const seconds = (file) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim()) || 0;
const json = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []);
const TMP = mkdtempSync(join(tmpdir(), 'promo-sound-'));

/** The effects as WAV files, by the names the films mark them with. */
const sfx = Object.fromEntries(Object.entries(EFFECTS).map(([name, make]) => {
  const file = join(TMP, `${name}.wav`);
  writeWav(file, make());
  return [name, file];
}));

// ----------------------------------------------------------- the films

for (const webm of readdirSync(VIDEOS).filter((f) => /^promo-.*\.webm$/.test(f)).sort()) {
  const name = webm.replace(/\.webm$/, '');
  const out = join(VIDEOS, `${name}.mp4`);
  if (existsSync(out)) { console.log(`${name}.mp4: kept`); continue; }
  const lang = /-bm\b/.test(name) ? 'ms' : 'zh';
  const src = join(VIDEOS, webm);
  const length = seconds(src);
  const cues = json(`${src}.json`);
  const voice = json(`${src}.voice.json`);

  // What is heard, and when.
  const clips = [];
  let free = 0;
  cues.forEach((c, i) => {
    const at = c.t / 1000;
    if (c.sfx) { if (sfx[c.sfx]) clips.push({ file: sfx[c.sfx], at, gain: 1 }); return; }
    const file = voice[i]?.[lang] && join(VIDEOS, voice[i][lang]);
    if (!file || !existsSync(file)) return;
    const start = Math.max(at, free);
    clips.push({ file, at: start, gain: 1.7, voice: true });
    free = start + seconds(file) + 0.08;
  });
  const voiced = clips.some((c) => c.voice);
  const video = join(TMP, `${name}.video.mp4`);
  run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-map', '0:v', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', video]);
  const bed = join(TMP, `${name}.music.wav`);
  writeWav(bed, music(length));

  /** The film with [withMusic] or without, written to [file]. */
  const make = (file, withMusic) => {
    const inputs = [...(withMusic ? [{ file: bed, at: 0, gain: voiced ? 0.45 : 0.8 }] : []), ...clips];
    const args = ['-y', '-v', 'error', '-i', video];
    inputs.forEach((c) => args.push('-i', c.file));
    if (!inputs.length) { run('ffmpeg', [...args, '-c:v', 'copy', '-movflags', '+faststart', file]); return; }
    const parts = inputs.map((c, i) => { const ms = Math.round(c.at * 1000); return `[${i + 1}:a]aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=${c.gain}[c${i}]`; });
    parts.push(`${inputs.map((_, i) => `[c${i}]`).join('')}amix=inputs=${inputs.length}:normalize=0:dropout_transition=0,alimiter=limit=0.9[a]`);
    run('ffmpeg', [...args, '-filter_complex', parts.join(';'), '-map', '0:v', '-map', '[a]', '-t', length.toFixed(2),
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', file]);
  };
  try {
    make(out, true);
    make(join(VIDEOS, `${name}-clean.mp4`), false);
    console.log(`${name}: music + ${clips.filter((c) => !c.voice).length} effects + ${clips.filter((c) => c.voice).length} voiced steps`);
  } catch (err) {
    console.log(`${name}: sound failed (${String(err.stderr || err.message).split('\n')[0]}); made silent`);
    run('ffmpeg', ['-y', '-v', 'error', '-i', video, '-c:v', 'copy', '-movflags', '+faststart', out]);
  }
}
