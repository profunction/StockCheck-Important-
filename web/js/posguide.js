/** How to use the till: step by step, with a short video for each job. */
import { renderGuide } from './guide.js';
import { POS_GUIDE } from './guides.js';
import { h } from './dom.js';
import { t } from './i18n.js';
import { menuButton } from './main.js';

export function render(main) {
  renderGuide(main, POS_GUIDE, h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('posGuide'))));
  return null;
}
