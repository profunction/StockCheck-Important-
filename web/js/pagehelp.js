/**
 * Each page's own tutorial, one tap away.
 *
 *   helpFab(keyOf)    the "▶ 教学" button in the corner of every page: plays
 *                     that page's video (helpdata.js), read aloud, with its
 *                     steps under it. Hidden where a page has none.
 *   tillHelpButton()  on the till: tutorial mode. While it is on, every
 *                     button on the till shows a ▶ and tapping one plays
 *                     that button's own video instead of doing it -- so
 *                     nothing is sold or cleared while learning.
 */
import { h, modal, mount } from './dom.js';
import { addStrings, getLang, t } from './i18n.js';
import { HELP, helpVideo } from './helpdata.js';
import { narratedVideo } from './narrate.js';

addStrings({
  en: { phBtn: 'How to', phMode: 'Tutorial mode', phModeOn: 'Tutorial mode: tap any button to see its video. Nothing is sold.', phExit: 'Done', phSteps: 'Steps' },
  zh: { phBtn: '教学', phMode: '教学模式', phModeOn: '教学模式：点任何按钮看它的教学视频，不会真的卖出。', phExit: '结束教学', phSteps: '步骤' },
  ms: { phBtn: 'Tutorial', phMode: 'Mod tutorial', phModeOn: 'Mod tutorial: tekan mana-mana butang untuk lihat videonya. Tiada jualan.', phExit: 'Selesai', phSteps: 'Langkah' },
});

const pick = (triple) => {
  const i = { zh: 0, en: 1, ms: 2 }[getLang()] ?? 1;
  return triple[i] || triple[1] || triple[0];
};

/** Plays tutorial [key] in a window: the video, read aloud, and its steps. */
export function openHelp(key) {
  const entry = HELP[key];
  if (!entry) return;
  modal((close) => {
    const player = narratedVideo(helpVideo(key));
    const video = player.tagName === 'VIDEO' ? player : player.querySelector('video');
    // Opened by a tap, so it may start by itself.
    setTimeout(() => video?.play().catch(() => {}), 150);
    return [
      h('h2', { style: { margin: 0 } }, pick(entry.title)),
      h('div', { class: 'help-player' }, player),
      h('ol', { class: 'steps help-steps' }, entry.steps.map((s) => h('li', {}, h('span', {}, pick(s.say))))),
      h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: close, 'data-act': 'help-close' }, t('close'))),
    ];
  }, { wide: true });
}

/**
 * The corner button: [keyOf]() names the current page's tutorial (or none).
 * One per document; it follows the address as it changes.
 */
export function helpFab(keyOf, { lift = false } = {}) {
  document.getElementById('help-fab')?.remove();
  const btn = h('button', { id: 'help-fab', class: `help-fab${lift ? ' lift' : ''}`, 'data-act': 'page-help', type: 'button' }, '▶ ', t('phBtn'));
  const update = () => { btn.hidden = !HELP[keyOf()]; };
  btn.onclick = () => openHelp(keyOf());
  window.addEventListener('hashchange', () => setTimeout(update, 0));
  update();
  document.body.append(btn);
  return btn;
}

// ------------------------------------------------------- the till's mode

let stopMode = null;

export const tillHelpOn = () => !!stopMode;

/** Ends tutorial mode (leaving the till ends it too). */
export function stopTillHelp() { stopMode?.(); }

function startTillHelp() {
  const app = document.getElementById('app') || document.body;
  const layer = h('div', { class: 'help-layer' });
  const banner = h('div', { class: 'help-banner', role: 'status' },
    h('span', {}, t('phModeOn')), h('button', { type: 'button', 'data-act': 'help-exit', onclick: () => stopTillHelp() }, t('phExit')));
  document.body.append(layer, banner);
  // A ▶ over every button that has its own video, wherever the till drew it.
  const draw = () => {
    const spots = [...app.querySelectorAll('[data-help]')]
      .filter((el) => el.getClientRects().length && HELP[`till-${el.dataset.help}`]);
    mount(layer, spots.map((el) => {
      const r = el.getBoundingClientRect();
      return h('button', {
        type: 'button', class: 'help-spot', 'data-help-spot': el.dataset.help, title: pick(HELP[`till-${el.dataset.help}`].title),
        style: { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` },
        onclick: () => openHelp(`till-${el.dataset.help}`),
      }, h('span', { class: 'help-dot' }, '▶'));
    }));
  };
  let queued = false;
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; draw(); }); } };
  const watch = new MutationObserver(later);
  watch.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'disabled'] });
  window.addEventListener('resize', later);
  document.addEventListener('scroll', later, true);
  document.body.classList.add('help-mode');
  draw();
  stopMode = () => {
    watch.disconnect();
    window.removeEventListener('resize', later);
    document.removeEventListener('scroll', later, true);
    layer.remove();
    banner.remove();
    document.body.classList.remove('help-mode');
    document.querySelectorAll('[data-act="till-help"]').forEach((b) => b.classList.remove('on'));
    stopMode = null;
  };
  document.querySelectorAll('[data-act="till-help"]').forEach((b) => b.classList.add('on'));
}

/** The till's "教学" button, beside the till lock. */
export function tillHelpButton() {
  return h('button', {
    type: 'button', class: `till-help${stopMode ? ' on' : ''}`, 'data-act': 'till-help', title: t('phMode'),
    onclick: () => (stopMode ? stopTillHelp() : startTillHelp()),
  }, '▶ ', h('span', {}, t('phBtn')));
}
