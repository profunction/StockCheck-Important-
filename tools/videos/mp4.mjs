/**
 * The marketing films as MP4 (H.264 + AAC), the format TikTok, Instagram,
 * Facebook and WhatsApp take, with the recorded male voice (voice.mjs)
 * laid over each step where there is one.
 *
 *   node tools/videos/mp4.mjs          needs ffmpeg and ffprobe
 *
 * Writes web/videos/promo-*.mp4 beside the .webm. A step's voice starts when
 * the step appears, or as soon as the one before has finished, so two never
 * talk over each other. Run by the deploy; a film already made is kept.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VIDEOS = fileURLToPath(new URL('../../web/videos/', import.meta.url));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const seconds = (file) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim()) || 0;
const json = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []);

for (const webm of readdirSync(VIDEOS).filter((f) => /^promo-.*\.webm$/.test(f)).sort()) {
  const name = webm.replace(/\.webm$/, '');
  const out = join(VIDEOS, `${name}.mp4`);
  if (existsSync(out)) { console.log(`${name}.mp4: kept`); continue; }
  const lang = /-bm\b/.test(name) ? 'ms' : 'zh';
  const cues = json(join(VIDEOS, `${webm}.json`));
  const voice = json(join(VIDEOS, `${webm}.voice.json`));
  const clips = [];
  let free = 0;
  cues.forEach((c, i) => {
    const file = voice[i]?.[lang] && join(VIDEOS, voice[i][lang]);
    if (!file || !existsSync(file)) return;
    const at = Math.max(c.t / 1000, free);
    const len = seconds(file);
    clips.push({ file, at });
    free = at + len + 0.08;
  });
  const args = ['-y', '-v', 'error', '-i', join(VIDEOS, webm)];
  clips.forEach((c) => args.push('-i', c.file));
  if (clips.length) {
    const delays = clips.map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.at * 1000)}|${Math.round(c.at * 1000)},volume=1.6[a${i}]`).join(';');
    const mix = `${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0:dropout_transition=0[voice]`;
    args.push('-filter_complex', `${delays};${mix}`, '-map', '0:v', '-map', '[voice]', '-c:a', 'aac', '-b:a', '160k');
  } else {
    args.push('-map', '0:v');
  }
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', out);
  run('ffmpeg', args);
  console.log(`${name}.mp4: ${clips.length ? `${clips.length} voiced steps` : 'no voice yet'}`);
}
