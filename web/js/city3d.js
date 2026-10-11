/**
 * The company as a little town, in 3D (Every Data's front page): each shop
 * a building as tall as today's takings, each warehouse a depot as tall as
 * the stock in it is worth, roads between them, and a lorry on the road for
 * every transfer on its way. Tap a building for its figures.
 *
 * town.js places them; cityCard() draws it with iso.js.
 */
import { h, mount } from './dom.js';
import { t } from './i18n.js';
import { rm } from './money.js';
import { isoScene } from './iso.js';
import { cityLayout } from './town.js';

export { cityLayout };

/**
 * A card with the town, for [places] as cityLayout() takes them. [links]
 * says where a tap on a shop or a warehouse leads.
 */
export function cityCard(places, moving, { links = {} } = {}) {
  const info = h('div', { class: 'city-info' });
  const { boxes, W, D } = cityLayout(places, moving);
  const scene = isoScene({
    boxes: boxes.map((b) => ({ ...b, title: b.title || (b.place ? b.place.name : null) })), W, D, height: 460,
    onPick: (b) => {
      scene.select(b.id);
      if (b.moving) {
        mount(info, h('div', {}, h('b', {}, b.moving.ref || ''), h('span', { class: 'muted' }, ` · ${b.moving.fromName || ''} → ${b.moving.toName || ''}`)));
        return;
      }
      const p = b.place;
      if (!p) return;
      mount(info,
        h('div', {}, h('b', {}, p.name), h('span', { class: 'muted' }, ` · ${p.kind === 'WAREHOUSE' ? t('city3dWarehouse') : t('city3dShop')}`)),
        h('div', { class: 'city-figs' },
          p.salesSen != null ? h('span', {}, t('city3dSales'), h('b', {}, rm(p.salesSen))) : null,
          p.receipts != null ? h('span', {}, t('city3dReceipts'), h('b', {}, String(p.receipts))) : null,
          p.valueSen != null ? h('span', {}, t('city3dStock'), h('b', {}, rm(p.valueSen))) : null,
          p.low != null ? h('span', {}, t('city3dLow'), h('b', {}, String(p.low))) : null),
        h('div', { class: 'row' },
          links.shop && p.kind !== 'WAREHOUSE' ? h('a', { class: 'dash-link', href: links.shop }, `${t('city3dOpenShop')} →`) : null,
          links.warehouse ? h('a', { class: 'dash-link', href: links.warehouse }, `${t('city3dOpenWh')} →`) : null));
    },
  });
  mount(info, h('span', { class: 'muted' }, t('city3dTap')));
  return h('div', { class: 'card city-card', 'data-card': 'city3d' },
    h('div', { class: 'dash-card-head' }, h('h3', {}, t('city3dTitle')), h('span', { class: 'muted' }, t('city3dLead'))),
    scene.el,
    h('div', { class: 'map-legend' },
      h('span', {}, h('i', { style: { background: '#14a37f' } }), t('city3dShopKey')),
      h('span', {}, h('i', { style: { background: '#4f7cac' } }), t('city3dWhKey')),
      h('span', {}, h('i', { style: { background: '#2f6fde' } }), t('city3dLorryKey'))),
    info);
}
