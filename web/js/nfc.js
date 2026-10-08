/**
 * NFC tags and member cards on the website.
 *
 * Chrome on Android reads NFC tags itself (Web NFC). On a computer, a USB
 * NFC or RFID reader set to keyboard mode types the card's number and Enter,
 * exactly like a barcode scanner, so it needs nothing here at all.
 *
 * Tag ids are written the way the SuXin Barcode Scan app writes them -- upper-case
 * hex, no separators -- so a tag bound on one finds its product on the other.
 */
import { h, modal, toast } from './dom.js';
import { t } from './i18n.js';

export const nfcSupported = () => 'NDEFReader' in window;

const SEPARATED = /^([0-9A-Fa-f]{2}[:\- ]?){4,10}$/;

/** "04:a2:b3:c4" -> "04A2B3C4"; anything else is left as it came. */
export function normalizeTag(raw) {
  const text = String(raw ?? '').trim();
  return SEPARATED.test(text) ? text.replace(/[:\- ]/g, '').toUpperCase() : text;
}

/**
 * Listens for tags until the returned stop() is called. [onTag] gets each
 * tag's id. Needs a tap on a button first: Chrome only allows it from one.
 */
export async function listenForTags(onTag) {
  const controller = new AbortController();
  const reader = new window.NDEFReader();
  let last = '';
  let lastAt = 0;
  reader.addEventListener('reading', (event) => {
    const id = normalizeTag(event.serialNumber);
    if (!id) return;
    const now = Date.now();
    if (id === last && now - lastAt < 1500) return;
    last = id;
    lastAt = now;
    try { navigator.vibrate?.(60); } catch { /* not every device */ }
    onTag(id);
  });
  reader.addEventListener('readingerror', () => toast(t('nfcUnreadable'), 'error'));
  await reader.scan({ signal: controller.signal });
  return () => controller.abort();
}

/** "Tap the card" dialog; resolves one tag id, or null. */
export function readOneTag(title = t('tapNfc')) {
  return new Promise((resolve) => {
    let result = null;
    let stop = null;
    const close = modal((closeFn) => [
      h('h2', {}, title),
      h('div', { class: 'bigsum' }, '📶'),
      h('p', { class: 'muted', style: { textAlign: 'center', margin: 0 } }, t('holdNfc')),
      h('div', { class: 'actions' }, h('button', { onclick: closeFn }, t('cancel'))),
    ], { onClose: () => { stop?.(); resolve(result); } });
    listenForTags((id) => { result = id; close(); })
      .then((s) => { stop = s; })
      .catch((err) => { toast(`${t('nfcError')}: ${err.message || err}`, 'error'); close(); });
  });
}
