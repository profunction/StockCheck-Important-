/**
 * The MyInvois assistant on the e-invoice page: ask about LHDN's
 * e-invoice in your own words, get a short answer with the official pages
 * it came from. The answer is looked up on LHDN's own sites each time
 * (api/myinvois.mjs); the conversation stays on this screen only.
 */
import { idToken } from './fb.js';
import { API_ORIGIN } from './apiorigin.js';
import { h, mount } from './dom.js';
import { addStrings, getLang, t } from './i18n.js';
import { icon } from './icons.js';

addStrings({
  en: {
    miTitle: 'MyInvois assistant', miLead: 'Ask anything about LHDN e-invoices. Each answer is checked against LHDN\'s own website, with the links. General guidance only — confirm decisions with LHDN or your accountant.',
    miPlaceholder: 'e.g. Do I need to issue e-invoices? When must the consolidated e-invoice be submitted?', miAsk: 'Ask', miThinking: 'Checking LHDN\'s website…',
    miSources: 'Sources (LHDN)', miClear: 'New conversation', miFail: 'Could not answer:',
    miQ1: 'Do I need to issue e-invoices?', miQ2: 'When is the consolidated e-invoice due?', miQ3: 'A customer wants their own e-invoice. What do I do?',
    miErr_NOT_SET_UP: 'The assistant is not switched on yet (the owner adds the Anthropic key first).', miErr_BUSY: 'Too many questions in a short time. Wait a minute.',
    miErr_NO_RIGHT: 'The MyInvois assistant comes with SuXin Tax.', miErr_NOT_ANSWERED: 'No answer this time. Try other words, or ask LHDN or your accountant.',
  },
  zh: {
    miTitle: 'MyInvois 助手', miLead: '电子发票有什么不懂都可以问。每个回答都会先查 LHDN 官网，并附上链接。只供参考，重要的决定请跟 LHDN 或会计师确认。',
    miPlaceholder: '例如：我要开电子发票吗？整合发票几时要交？', miAsk: '问', miThinking: '正在查 LHDN 官网…',
    miSources: '来源（LHDN 官网）', miClear: '重新开始', miFail: '回答不了：',
    miQ1: '我要开电子发票吗？', miQ2: '整合电子发票几时要交？', miQ3: '客人要单独的电子发票，我怎么做？',
    miErr_NOT_SET_UP: '助手还没开通（老板要先放 Anthropic 钥匙）。', miErr_BUSY: '短时间内问太多次了，等一分钟。',
    miErr_NO_RIGHT: 'MyInvois 助手要有 SuXin Tax 才能用。', miErr_NOT_ANSWERED: '这次答不出来。换个问法，或者问 LHDN 或会计师。',
  },
  ms: {
    miTitle: 'Pembantu MyInvois', miLead: 'Tanya apa sahaja tentang e-Invois LHDN. Setiap jawapan disemak dengan laman web rasmi LHDN, berserta pautan. Panduan umum sahaja — sahkan keputusan dengan LHDN atau akauntan anda.',
    miPlaceholder: 'cth. Perlukah saya keluarkan e-invois? Bila e-invois disatukan perlu dihantar?', miAsk: 'Tanya', miThinking: 'Menyemak laman web LHDN…',
    miSources: 'Sumber (LHDN)', miClear: 'Perbualan baharu', miFail: 'Tidak dapat dijawab:',
    miQ1: 'Perlukah saya keluarkan e-invois?', miQ2: 'Bila e-invois disatukan perlu dihantar?', miQ3: 'Pelanggan mahu e-invois sendiri. Apa perlu saya buat?',
    miErr_NOT_SET_UP: 'Pembantu belum dihidupkan (pemilik perlu tambah kunci Anthropic dahulu).', miErr_BUSY: 'Terlalu banyak soalan dalam masa singkat. Tunggu seminit.',
    miErr_NO_RIGHT: 'Pembantu MyInvois datang bersama SuXin Tax.', miErr_NOT_ANSWERED: 'Tiada jawapan kali ini. Cuba perkataan lain, atau tanya LHDN atau akauntan.',
  },
});

/** Only LHDN's own pages are shown as links. */
const official = (url) => { try { const u = new URL(url); return u.protocol === 'https:' && /(^|\.)hasil\.gov\.my$/.test(u.hostname); } catch { return false; } };

async function ask(messages) {
  const res = await fetch(`${API_ORIGIN}/app/myinvois-ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify({ messages, lang: getLang() }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = body?.error?.code || (res.status === 429 ? 'BUSY' : res.status === 403 ? 'NO_RIGHT' : '');
    const mine = code && t(`miErr_${code}`);
    throw new Error(mine && mine !== `miErr_${code}` ? mine : body?.error?.message || res.statusText);
  }
  return body;
}

/** The assistant's card. */
export function myInvoisChat() {
  const turns = [];
  const log = h('div', { class: 'mi-log', 'aria-live': 'polite' });
  const input = h('textarea', { rows: 2, maxlength: 2000, placeholder: t('miPlaceholder'), 'data-act': 'mi-input' });
  const send = h('button', { class: 'primary', type: 'button', 'data-act': 'mi-ask' }, icon('check', 17), t('miAsk'));
  const status = h('p', { class: 'muted', style: { margin: 0 } });

  const bubble = (turn) => h('div', { class: `mi-msg ${turn.role}` },
    h('div', { class: 'mi-text' }, turn.content),
    turn.sources?.length ? h('div', { class: 'mi-src' }, h('span', { class: 'muted' }, t('miSources')),
      turn.sources.filter((s) => official(s.url)).map((s) => h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.title || s.url))) : null);
  const draw = () => mount(log, turns.map(bubble));

  const go = async (text) => {
    const q = String(text ?? input.value).trim();
    if (!q || send.disabled) return;
    turns.push({ role: 'user', content: q });
    input.value = '';
    send.disabled = true;
    status.textContent = t('miThinking');
    draw();
    try {
      const out = await ask(turns.map(({ role, content }) => ({ role, content })));
      turns.push({ role: 'assistant', content: out.answer, sources: out.sources || [] });
      status.textContent = '';
    } catch (err) {
      turns.pop();
      input.value = q;
      status.textContent = `${t('miFail')} ${err.message || err}`;
    }
    send.disabled = false;
    draw();
    log.lastElementChild?.scrollIntoView({ block: 'nearest' });
  };
  send.onclick = () => go();
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } };

  return h('section', { class: 'card mi-card', 'data-card': 'myinvois' },
    h('h2', { style: { margin: '0 0 6px' } }, '🧾 ', t('miTitle')),
    h('p', { class: 'muted', style: { marginTop: 0 } }, t('miLead')),
    h('div', { class: 'mi-chips' }, ['miQ1', 'miQ2', 'miQ3'].map((k) => h('button', { type: 'button', class: 'ghost', onclick: () => go(t(k)) }, t(k)))),
    log,
    status,
    h('div', { class: 'mi-ask' }, input, send),
    h('button', { type: 'button', class: 'ghost', style: { justifySelf: 'start' }, onclick: () => { turns.length = 0; status.textContent = ''; draw(); } }, t('miClear')));
}
