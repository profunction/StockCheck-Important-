/**
 * The three kinds of till a shop can choose. Each is the same register --
 * same products, stock, receipts and reports -- laid out for how that kind
 * of shop sells:
 *
 *   FNB          restaurants and cafés: tables, modifiers, kitchen tickets
 *   SUPERMARKET  scan after scan: a big scan box, a bill list, function keys
 *   RETAIL       shops that sell from pictures: a product grid by category
 *
 * Shops set up before there was a choice have 'BOTH': the restaurant layout
 * with counter sales, kept until someone picks. A shop with no mode yet
 * sells on the retail layout until its owner chooses.
 */
import { h } from './dom.js';
import { t } from './i18n.js';
import { icon } from './icons.js';

export const MODES = ['FNB', 'SUPERMARKET', 'RETAIL'];

const LOOK = {
  FNB: { cls: 'mode-fnb', icon: 'coffee' },
  SUPERMARKET: { cls: 'mode-market', icon: 'basket' },
  RETAIL: { cls: 'mode-retail', icon: 'store' },
};

/** The mode someone chose, or null when nobody has yet. */
export function chosenMode(settings) {
  return MODES.includes(settings?.mode) ? settings.mode : null;
}

/** Which screen the register shows. */
export function layoutFor(settings) {
  if (settings?.mode === 'SUPERMARKET') return 'market';
  if (settings?.mode === 'FNB' || settings?.mode === 'BOTH') return 'fnb';
  return 'retail';
}

/** The three cards, side by side; [onPick] gets the mode. */
export function modeCards(selected, onPick) {
  return h('div', { class: 'modes' }, MODES.map((mode) => h('button', {
    type: 'button',
    class: `modecard ${LOOK[mode].cls}${selected === mode ? ' on' : ''}`,
    'data-mode': mode,
    onclick: () => onPick(mode),
  },
  h('span', { class: 'badge' }, icon(LOOK[mode].icon, 28)),
  h('span', { class: 't' }, t(`modeName_${mode}`)),
  h('span', { class: 'd' }, t(`modeDesc_${mode}`)),
  h('ul', {}, t(`modePts_${mode}`).split('|').map((x) => h('li', {}, icon('check', 16), x))),
  selected === mode ? h('span', { class: 'pill good' }, icon('check', 14), t('modeCurrent')) : null)));
}
