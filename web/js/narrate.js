/**
 * Guide videos with a voice. Each video has its steps beside it with the
 * second each one appears (/videos/<name>.webm.json, written while it was
 * filmed: [{ t, zh, en, ms }]). While the video plays, each step is read
 * aloud in the page's language.
 *
 * The voice is a recording made once for every step (a natural male voice,
 * tools/videos/voice.mjs, listed in <name>.webm.voice.json), so every phone
 * hears the same. Where a step has no recording, the device reads it with
 * its own voice, a male one when it has one.
 *
 * The video never stops for the voice. When a step is still being read as
 * the next one comes up, the picture slows down (never pauses) until the
 * words catch up, then goes back to normal speed -- so it plays smoothly
 * and the words still match what is on screen. Narration can be switched
 * off; the choice is kept.
 */
import { h, local } from './dom.js';
import { getLang } from './i18n.js';
import { cueText, cuesBetween, cuesUrl, voiceUrl } from './cues.js';

const KEY = 'guide.narrate';
const LOCALES = { zh: ['zh-CN', 'zh-SG', 'zh-MY', 'zh-TW', 'zh-HK', 'zh'], en: ['en-MY', 'en-GB', 'en-US', 'en'], ms: ['ms-MY', 'ms', 'id-ID', 'id'] };
const LABEL = {
  zh: ['🔊 语音讲解：开', '🔇 语音讲解：关'], en: ['🔊 Voice: on', '🔇 Voice: off'], ms: ['🔊 Suara: hidup', '🔇 Suara: mati'],
};

export const narrationOn = () => local.get(KEY, true) !== false;
const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

// Device voices known to be male, by name (Windows, Edge, macOS, Android).
const MALE = /yunxi|yunyang|yunjian|yunze|kangkang|li-mu|liang|ryan|guy|george|daniel|thomas|osman|male|男/i;

/** The best voice the device has for [lang] -- a male one if it has one -- or null. */
function voiceFor(lang) {
  const voices = window.speechSynthesis.getVoices();
  for (const want of LOCALES[lang] || LOCALES.en) {
    const w = want.toLowerCase();
    const fits = voices.filter((x) => x.lang?.toLowerCase() === w || x.lang?.toLowerCase().startsWith(w));
    const v = fits.find((x) => MALE.test(x.name)) || fits[0];
    if (v) return v;
  }
  return null;
}

/** A guide video with its voice switch. */
export function narratedVideo(src, poster = '') {
  const video = h('video', { src, controls: true, preload: 'none', playsinline: true, poster });
  if (!supported() && typeof Audio === 'undefined') return video;
  const lang = getLang();
  let cues = null;
  let recorded = [];
  let last = 0;
  let speaking = false;
  let pending = [];
  let audio = null;
  // How slow the picture goes while the voice catches up: slower, never stopped.
  const SLOW = 0.6;
  const normal = () => { if (video.playbackRate !== 1) video.playbackRate = 1; };
  const toggle = h('button', { type: 'button', class: 'ghost narrate-toggle', 'data-act': 'narrate' });
  const drawToggle = () => { toggle.textContent = (LABEL[lang] || LABEL.en)[narrationOn() ? 0 : 1]; };
  drawToggle();
  toggle.onclick = () => {
    local.set(KEY, !narrationOn());
    if (!narrationOn()) stop();
    drawToggle();
  };

  const load = () => {
    if (cues) return Promise.resolve(cues);
    const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    return Promise.all([json(cuesUrl(src)), json(voiceUrl(src))]).then(([list, voices]) => {
      recorded = Array.isArray(voices) ? voices : [];
      cues = Array.isArray(list) ? list : [];
      return cues;
    });
  };

  function stop() {
    if (supported()) window.speechSynthesis.cancel();
    if (audio) { audio.onended = audio.onerror = null; audio.pause(); audio = null; }
    speaking = false;
    pending = [];
    normal();
  }

  // One step finished: the next one that came up meanwhile, or full speed again.
  const done = () => {
    speaking = false;
    audio = null;
    if (pending.length && narrationOn()) say(pending.shift()); else normal();
  };

  /** The device reading [text] itself. */
  function speak(text) {
    if (!supported()) { done(); return; }
    const u = new SpeechSynthesisUtterance(text);
    const v = voiceFor(lang);
    if (v) u.voice = v;
    u.lang = v?.lang || (LOCALES[lang] || LOCALES.en)[0];
    u.rate = 1.05;
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  }

  /** A step: its recording when there is one, the device's voice otherwise. */
  function say(step) {
    speaking = true;
    if (!step.file) { speak(step.text); return; }
    const a = new Audio(`/videos/${step.file}`);
    audio = a;
    a.onended = done;
    a.onerror = () => { if (audio === a) { audio = null; speak(step.text); } };
    a.play().catch(() => { if (audio === a) { audio = null; speak(step.text); } });
  }

  video.addEventListener('play', () => {
    load();
    if (audio?.paused) audio.play().catch(() => {});
    else if (supported() && window.speechSynthesis.paused) window.speechSynthesis.resume();
  });
  video.addEventListener('seeking', () => { stop(); last = video.currentTime; });
  video.addEventListener('ended', () => { last = 0; pending = []; normal(); });
  video.addEventListener('timeupdate', () => {
    const now = video.currentTime;
    // Until the steps have arrived, keep the place: they are read once they do.
    if (!cues) return;
    if (!narrationOn() || now < last) { last = now; return; }
    const due = cuesBetween(cues, last, now);
    last = now;
    const steps = due.map((c) => ({ text: cueText(c, lang), file: recorded[cues.indexOf(c)]?.[lang] || '' })).filter((x) => x.text);
    if (!steps.length) return;
    pending.push(...steps);
    // Still reading the last step: slow the picture down and read these next.
    if (speaking) { video.playbackRate = SLOW; return; }
    say(pending.shift());
  });
  // The viewer's pause stops the voice too.
  video.addEventListener('pause', () => {
    if (!speaking) return;
    if (audio) audio.pause();
    else if (supported()) window.speechSynthesis.pause();
  });
  return h('div', { class: 'narrated' }, video, toggle);
}
