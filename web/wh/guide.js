/** How to use the warehouse system: step by step, with a short video for each job. */
import { renderGuide } from '../js/guide.js';
import { WAREHOUSE_GUIDE } from '../js/guides.js';
import { head } from './common.js';
import { t } from '../js/i18n.js';

export function render(main) {
  renderGuide(main, WAREHOUSE_GUIDE, head(t('whGuide')));
  return null;
}
