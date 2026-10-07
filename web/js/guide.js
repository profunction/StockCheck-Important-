/**
 * A guide page: a list of jobs, each with numbered steps and, where there is
 * one, a short video of it being done. Shared by the till and the warehouse
 * system; the words live in guides.js in each language.
 */
import { h, mount } from './dom.js';
import { getLang } from './i18n.js';

export function renderGuide(main, guide, header) {
  const lang = guide[getLang()] ? getLang() : 'en';
  const g = guide[lang];
  mount(main, header, h('div', { class: 'guide' },
    h('p', { class: 'muted', style: { margin: 0 } }, g.intro),
    h('nav', { class: 'toc' }, g.sections.map((s) => h('a', { href: `#${location.hash.split('#')[1].split('?')[0]}`, onclick: (e) => { e.preventDefault(); document.getElementById(`g-${s.id}`)?.scrollIntoView({ behavior: 'smooth' }); } }, s.title))),
    g.sections.map((s) => h('section', { class: 'card', id: `g-${s.id}` },
      h('div', {},
        h('h2', {}, s.title),
        s.lead ? h('p', { class: 'muted', style: { marginTop: 0 } }, s.lead) : null,
        h('ol', { class: 'steps' }, s.steps.map((x) => h('li', {}, h('span', {}, x)))),
        s.tip ? h('p', { class: 'tip' }, s.tip) : null),
      s.video ? h('video', { src: s.video, controls: true, preload: 'none', playsinline: true, poster: s.poster || '' }) : h('div')))));
}
