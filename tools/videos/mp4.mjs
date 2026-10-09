/**
 * The marketing films as MP4 (H.264 + AAC), the format TikTok, Instagram,
 * Facebook and WhatsApp take, with sound:
 *
 * - a beat under the whole film (made here from sine waves and noise --
 *   no one else's music, so nothing to license);
 * - the sound effects the film marked (studio.mjs mark(): whoosh, hit,
 *   ding, beep, pop, cash);
 * - the recorded male voice (voice.mjs) for each step, where there is one.
 *   A step's voice starts when the step appears, or as soon as the one
 *   before has finished, so two never talk over each other; the beat goes
 *   quieter when there is a voice.
 *
 *   node tools/videos/mp4.mjs          needs ffmpeg and ffprobe
 *
 * Writes web/videos/promo-*.mp4 beside the .webm. Run by the deploy; a film
 * already made is kept. If the sound cannot be made, the film is still
 * made, silent, and the reason printed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VIDEOS = fileURLToPath(new URL('../../web/videos/', import.meta.url));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).toString();
const seconds = (file) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim()) || 0;
const json = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []);
const TMP = mkdtempSync(join(tmpdir(), 'promo-sfx-'));

// ---------------------------------------------------------- the sounds

/** Each effect: [expression of t, seconds, extra filter]. */
const SFX = {
  beep: ['0.55*sin(2*PI*2200*t)*exp(-28*t)', 0.14],
  pop: ['0.5*sin(2*PI*(500+1400*t)*t)*exp(-22*t)', 0.18],
  ding: ['0.38*(sin(2*PI*1318.5*t)+0.6*sin(2*PI*1975.5*t)+0.3*sin(2*PI*2637*t))*exp(-3.5*t)', 1.4],
  cash: ['0.35*(sin(2*PI*2093*t)*exp(-7*t)+gte(t,0.09)*sin(2*PI*2637*(t-0.09))*exp(-7*(t-0.09)))+0.22*(random(0)*2-1)*exp(-35*t)', 0.9],
  whoosh: ['0.55*(random(0)*2-1)*pow(sin(PI*t/0.5),2)', 0.5, 'highpass=f=700,lowpass=f=7000'],
  hit: ['0.9*sin(2*PI*t*(42+130*exp(-18*t)))*exp(-4.5*t)+0.35*(random(0)*2-1)*exp(-22*t)', 0.7],
};

function makeSfx() {
  const files = {};
  for (const [name, [expr, d, af]] of Object.entries(SFX)) {
    const out = join(TMP, `${name}.wav`);
    run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc=exprs='${expr}':s=44100:d=${d}`, ...(af ? ['-af', af] : []), '-ac', '2', out]);
    files[name] = out;
  }
  return files;
}

// 120 beats a minute: kick on every beat, a clap on 2 and 4, an off-beat
// hat, and a bass line walking A - F - C - G, two seconds a chord.
const BASS = 'if(lt(mod(t,8),2),55,if(lt(mod(t,8),4),43.65,if(lt(mod(t,8),6),65.41,49)))';
const BEAT = [
  '0.55*sin(2*PI*t*(48+110*exp(-28*mod(t,0.5))))*exp(-7*mod(t,0.5))',
  '0.06*(random(0)*2-1)*exp(-70*mod(t+0.25,0.5))',
  '0.13*(random(0)*2-1)*exp(-28*mod(t+0.5,1))',
  `0.2*sin(2*PI*${BASS}*t)*(0.35+0.65*exp(-5*mod(t,0.25)))`,
  `0.05*sin(2*PI*4*${BASS}*t)*(0.5+0.5*sin(2*PI*0.25*t))`,
].join('+');

// ----------------------------------------------------------- the films

let sfx = null;
try { sfx = makeSfx(); } catch (err) { console.log(`sound effects not made: ${String(err.stderr || err.message).split('\n')[0]}`); }

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
    if (c.sfx) { if (sfx?.[c.sfx]) clips.push({ file: sfx[c.sfx], at, gain: 1 }); return; }
    const file = voice[i]?.[lang] && join(VIDEOS, voice[i][lang]);
    if (!file || !existsSync(file)) return;
    const start = Math.max(at, free);
    clips.push({ file, at: start, gain: 1.7, voice: true });
    free = start + seconds(file) + 0.08;
  });
  const voiced = clips.some((c) => c.voice);
  const video = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart'];

  const withSound = () => {
    const args = ['-y', '-v', 'error', '-i', src,
      '-f', 'lavfi', '-i', `aevalsrc=exprs='${BEAT}|${BEAT}':s=44100:d=${length.toFixed(2)}`];
    clips.forEach((c) => args.push('-i', c.file));
    const fadeOut = Math.max(0, length - 2.5).toFixed(2);
    const parts = [`[1:a]volume=${voiced ? 0.32 : 0.5},afade=t=in:d=0.6,afade=t=out:st=${fadeOut}:d=2.5[bed]`];
    clips.forEach((c, i) => { const ms = Math.round(c.at * 1000); parts.push(`[${i + 2}:a]aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=${c.gain}[c${i}]`); });
    const inputs = ['[bed]', ...clips.map((_, i) => `[c${i}]`)].join('');
    parts.push(`${inputs}amix=inputs=${clips.length + 1}:normalize=0:dropout_transition=0,alimiter=limit=0.95[a]`);
    run('ffmpeg', [...args, '-filter_complex', parts.join(';'), '-map', '0:v', '-map', '[a]', '-t', length.toFixed(2),
      ...video, '-c:a', 'aac', '-b:a', '160k', out]);
  };
  try {
    withSound();
    console.log(`${name}.mp4: beat + ${clips.filter((c) => !c.voice).length} effects + ${clips.filter((c) => c.voice).length} voiced steps`);
  } catch (err) {
    console.log(`${name}: sound failed (${String(err.stderr || err.message).split('\n')[0]}); made silent`);
    run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-map', '0:v', ...video, out]);
  }
}
