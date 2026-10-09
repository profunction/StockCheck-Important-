/**
 * The guide videos' voice, recorded once with Google Cloud Text-to-Speech
 * -- a natural male voice in Chinese, English and Malay -- instead of
 * whatever voice each phone happens to have.
 *
 *   GCP_TOKEN=$(gcloud auth print-access-token) node tools/videos/voice.mjs
 *
 * For every web/videos/**\/<name>.webm.json (the steps, as filmed) it writes
 * <name>.webm.voice.json: per step, the recording for each language, as
 * web/videos/voice/<hash>.mp3. A recording is named by its voice and text,
 * so one already made (kept between deploys by the CI cache) is never made
 * again. Run by the deploy; if Text-to-Speech is not available nothing is
 * written and the pages use the device's own voice, as before.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const VIDEOS = fileURLToPath(new URL('../../web/videos/', import.meta.url));
const OUT = join(VIDEOS, 'voice');
const TOKEN = process.env.GCP_TOKEN;
const PROJECT = process.env.PROJECT || 'stockcheck-fb58e';

// Male voices, best first; the first one this project can use is taken.
const VOICES = {
  zh: [['cmn-CN', 'cmn-CN-Chirp3-HD-Charon'], ['cmn-CN', 'cmn-CN-Wavenet-B'], ['cmn-CN', 'cmn-CN-Wavenet-C'], ['cmn-CN', 'cmn-CN-Standard-B']],
  en: [['en-GB', 'en-GB-Chirp3-HD-Charon'], ['en-GB', 'en-GB-Neural2-B'], ['en-GB', 'en-GB-Wavenet-B'], ['en-US', 'en-US-Neural2-D']],
  ms: [['ms-MY', 'ms-MY-Chirp3-HD-Charon'], ['ms-MY', 'ms-MY-Wavenet-B'], ['ms-MY', 'ms-MY-Wavenet-D'], ['ms-MY', 'ms-MY-Standard-B']],
};
const SAY = { zh: (c) => c.zh || c.en || '', en: (c) => c.en || c.zh || '', ms: (c) => c.ms || c.en || c.zh || '' };

async function synth(lang, voice, text) {
  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { text }, voice: { languageCode: lang, name: voice }, audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error?.message || res.statusText), { status: res.status });
  return Buffer.from(body.audioContent, 'base64');
}

/** The first voice in [lang] that works here, or null. */
async function pick(lang) {
  for (const [code, name] of VOICES[lang]) {
    try { await synth(code, name, 'OK'); return [code, name]; } catch (err) {
      if (err.status === 403 || err.status === 401) throw err; // not enabled / no right: no voice at all
      console.log(`  ${name}: ${err.message.split('\n')[0]}`);
    }
  }
  return null;
}

const cueFiles = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) return f === 'voice' ? [] : cueFiles(p);
  return f.endsWith('.webm.json') ? [p] : [];
});

if (!TOKEN) { console.log('No GCP_TOKEN: the pages keep the device voice.'); process.exit(0); }
mkdirSync(OUT, { recursive: true });
const chosen = {};
try {
  for (const lang of Object.keys(VOICES)) {
    chosen[lang] = await pick(lang);
    console.log(`${lang}: ${chosen[lang]?.[1] || 'none (device voice)'}`);
  }
} catch (err) {
  console.log(`::warning::Text-to-Speech is not available (${err.message.split('\n')[0]}). Enable it once: https://console.cloud.google.com/apis/library/texttospeech.googleapis.com?project=${PROJECT}`);
  process.exit(0);
}

let made = 0;
let kept = 0;
for (const file of cueFiles(VIDEOS)) {
  const cues = JSON.parse(readFileSync(file, 'utf8'));
  const list = [];
  for (const cue of cues) {
    const entry = {};
    for (const [lang, v] of Object.entries(chosen)) {
      const text = v && SAY[lang](cue).trim();
      if (!text) continue;
      const name = `${createHash('sha1').update(`${v[1]}|${text}`).digest('hex').slice(0, 20)}.mp3`;
      const path = join(OUT, name);
      if (existsSync(path)) kept++;
      else {
        try { writeFileSync(path, await synth(v[0], v[1], text)); made++; } catch (err) { console.log(`  ${lang} "${text}": ${err.message}`); continue; }
      }
      entry[lang] = relative(VIDEOS, path).split('\\').join('/');
    }
    list.push(entry);
  }
  writeFileSync(file.replace(/\.webm\.json$/, '.webm.voice.json'), JSON.stringify(list));
}
console.log(`voice: ${made} recorded, ${kept} already there`);
