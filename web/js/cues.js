/**
 * The steps of a guide video, as filmed: [{ t (ms), zh, en, ms }]. Pure;
 * narrate.js reads them aloud.
 */
/** What a step says in [lang]: Malay falls back to English when a step has none. */
export function cueText(cue, lang) {
  if (lang === 'zh') return cue.zh || cue.en || '';
  if (lang === 'ms') return cue.ms || cue.en || cue.zh || '';
  return cue.en || cue.zh || '';
}

/** The steps due between [from] and [to] seconds. */
export function cuesBetween(cues, from, to) {
  return cues.filter((c) => c.t / 1000 > from && c.t / 1000 <= to);
}

/** Where a video's narration is: beside it, as <video>.json (keeping any ?v=). */
export function cuesUrl(src) {
  return String(src).replace(/(\.webm)(\?[^#]*)?$/, '$1.json$2');
}
