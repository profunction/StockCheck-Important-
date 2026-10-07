/**
 * Guide videos with a voice. Each video has its steps beside it with the
 * second each one appears (/videos/<name>.webm.json, written while it was
 * filmed: [{ t, zh, en, ms }]). While the video plays, the viewer's own
 * phone or computer reads each step aloud, in the page's language, using
 * the voices it already has -- Android, iPhone and Windows all have
 * Chinese, English and Malay (or Indonesian, which reads Malay) voices.
 *
 * The video waits while a step is being read, so the words never fall
 * behind the picture. Narration can be switched off; the choice is kept.
 */
import { h, local } from './dom.js';
import { getLang } from './i18n.js';
import { cueText, cuesBetween, cuesUrl } from './cues.js';

const KEY = 'guide.narrate';
const LOCALES = { zh: ['zh-CN', 'zh-SG', 'zh-MY', 'zh-TW', 'zh-HK', 'zh'], en: ['en-MY', 'en-GB', 'en-US', 'en'], ms: ['ms-MY', 'ms', 'id-ID', 'id'] };
const LABEL = {
  zh: ['🔊 语音讲解：开', '🔇 语音讲解：关'], en: ['🔊 Voice: on', '🔇 Voice: off'], ms: ['🔊 Suara: hidup', '🔇 Suara: mati'],
};

export const narrationOn = () => local.get(KEY, true) !== false;
const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** The best voice the device has for [lang], or null (the browser's default then). */
function voiceFor(lang) {
  const voices = window.speechSynthesis.getVoices();
  for (const want of LOCALES[lang] || LOCALES.en) {
    const v = voices.find((x) => x.lang?.toLowerCase() === want.toLowerCase())
      || voices.find((x) => x.lang?.toLowerCase().startsWith(want.toLowerCase()));
    if (v) return v;
  }
  return null;
}

/** A guide video with its voice switch. */
export function narratedVideo(src, poster = '') {
  const video = h('video', { src, controls: true, preload: 'none', playsinline: true, poster });
  if (!supported()) return video;
  const lang = getLang();
  let cues = null;
  let last = 0;
  let speaking = false;
  let resumeAfter = false;
  const toggle = h('button', { type: 'button', class: 'ghost narrate-toggle', 'data-act': 'narrate' });
  const drawToggle = () => { toggle.textContent = (LABEL[lang] || LABEL.en)[narrationOn() ? 0 : 1]; };
  drawToggle();
  toggle.onclick = () => {
    local.set(KEY, !narrationOn());
    if (!narrationOn()) { window.speechSynthesis.cancel(); speaking = false; }
    drawToggle();
  };

  const load = () => {
    if (cues) return Promise.resolve(cues);
    return fetch(cuesUrl(src)).then((r) => (r.ok ? r.json() : [])).catch(() => []).then((list) => { cues = Array.isArray(list) ? list : []; return cues; });
  };

  const speak = (text) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = voiceFor(lang);
    if (v) u.voice = v;
    u.lang = v?.lang || (LOCALES[lang] || LOCALES.en)[0];
    u.rate = 1.05;
    speaking = true;
    const done = () => {
      speaking = false;
      if (resumeAfter) { resumeAfter = false; video.play().catch(() => {}); }
    };
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  };

  video.addEventListener('play', () => { load(); if (window.speechSynthesis.paused) window.speechSynthesis.resume(); });
  video.addEventListener('seeking', () => { window.speechSynthesis.cancel(); speaking = false; resumeAfter = false; last = video.currentTime; });
  video.addEventListener('ended', () => { last = 0; });
  video.addEventListener('timeupdate', () => {
    const now = video.currentTime;
    // Until the steps have arrived, keep the place: they are read once they do.
    if (!cues) return;
    if (!narrationOn() || now < last) { last = now; return; }
    const due = cuesBetween(cues, last, now);
    last = now;
    if (!due.length) return;
    const text = due.map((c) => cueText(c, lang)).filter(Boolean).join('。 ');
    if (!text) return;
    window.speechSynthesis.cancel();
    // The picture waits for the words.
    if (!video.paused) { resumeAfter = true; video.pause(); }
    speak(text);
  });
  // A pause the viewer makes stops the voice too; one this file makes does not.
  video.addEventListener('pause', () => { if (!resumeAfter && speaking) window.speechSynthesis.pause(); });
  return h('div', { class: 'narrated' }, video, toggle);
}
