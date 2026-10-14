/**
 * Whether this company shows its 3D pictures, chosen by the owner, and the
 * one way every app draws one (scene3d) so they all follow that choice:
 * the warehouse, the fleet, the shop floor, the money towers and the town.
 *
 * Stored with the company's settings (pos/settings, `show3d`; on unless
 * turned off), which every app already reads. When it is off, everyone
 * but the owner sees no 3D at all; the owner sees a slim bar to turn it
 * back on. While it is on, the owner has a button on each picture's
 * toolbar to turn it off.
 */
import { db, doc, setDoc } from './fb.js';
import { confirmBox, h, toast } from './dom.js';
import { addStrings, t } from './i18n.js';
import { isoScene } from './iso.js';
import { session, ws } from './session.js';

addStrings({
  en: { v3dOff: '3D pictures are turned off for this company.', v3dOn: 'Turn 3D on', v3dTurnOff: 'Turn 3D off for everyone', v3dTurnOffQ: 'Turn the 3D pictures off for everyone in the company? You can turn them back on here.', v3dSaved: 'Saved', v3dNight: 'Dark showroom look', v3dDay: 'Light look', v3dLink: 'Copy a link that opens this 3D full screen (add &spin for a TV)', v3dLinkOk: 'Link copied. Open it on any screen; sign in once.',
    v3dPlan: 'Have a floor plan of your shop or warehouse? Send it to us and we will build your own company in 3D.', v3dPlanBtn: 'Send us your floor plan', v3dPlanMsg: 'Hi JSOX, here is our floor plan. Please build our company in 3D.' },
  zh: { v3dOff: '这家公司关闭了 3D 图。', v3dOn: '开启 3D 图', v3dTurnOff: '为所有人关闭 3D 图', v3dTurnOffQ: '为公司里所有人关闭 3D 图吗？之后可以在这里再打开。', v3dSaved: '已保存', v3dNight: '深色展示模式', v3dDay: '浅色模式', v3dLink: '复制链接：一打开就是全屏 3D（电视加 &spin 会自己转）', v3dLinkOk: '链接已复制。在任何屏幕打开，登入一次就可以。',
    v3dPlan: '有你店面或仓库的平面图吗？发给我们，我们帮你做成你公司自己的 3D。', v3dPlanBtn: '把平面图发给我们', v3dPlanMsg: '你好 JSOX，这是我们的平面图，请帮我们做成公司自己的 3D。' },
  ms: { v3dOff: 'Gambar 3D dimatikan untuk syarikat ini.', v3dOn: 'Hidupkan 3D', v3dTurnOff: 'Matikan 3D untuk semua', v3dTurnOffQ: 'Matikan gambar 3D untuk semua orang dalam syarikat? Boleh dihidupkan semula di sini.', v3dSaved: 'Disimpan', v3dNight: 'Rupa gelap (pameran)', v3dDay: 'Rupa cerah', v3dLink: 'Salin pautan yang membuka 3D ini skrin penuh (tambah &spin untuk TV)', v3dLinkOk: 'Pautan disalin. Buka di mana-mana skrin; log masuk sekali.',
    v3dPlan: 'Ada pelan lantai kedai atau gudang anda? Hantar kepada kami dan kami bina syarikat anda sendiri dalam 3D.', v3dPlanBtn: 'Hantar pelan lantai', v3dPlanMsg: 'Hai JSOX, ini pelan lantai kami. Tolong bina syarikat kami dalam 3D.' },
});

/** Does this company show 3D pictures? */
export const show3d = () => session.settings?.show3d !== false;

/** The owner turns 3D on or off for the whole company. */
export async function setShow3d(on) {
  await setDoc(doc(db, ws('pos/settings')), { show3d: on, updatedAt: Date.now() }, { merge: true });
  session.settings = { ...session.settings, show3d: on };
}

/**
 * The dark showroom look (夜间展示): navy floor, light lettering, lit-up
 * lorries -- for a big screen on the warehouse wall. Each phone or
 * computer chooses for itself; on until turned off.
 */
export function night3d() {
  try { return localStorage.getItem('jsox-3d-night') !== 'off'; } catch { return true; }
}
function setNight3d(on) {
  try { localStorage.setItem('jsox-3d-night', on ? 'on' : 'off'); } catch { /* no storage */ }
}

/** The company's contact for floor plans (the website's WhatsApp). */
const CONTACT = 'https://wa.me/6589263660';

/** The offer under a 3D picture: send us your floor plan, we build your own 3D. */
export function planOffer() {
  return h('div', { class: 'v3d-plan', 'data-card': 'plan-offer' },
    h('span', { class: 'grow' }, `📐 ${t('v3dPlan')}`),
    h('a', { class: 'btn', href: `${CONTACT}?text=${encodeURIComponent(t('v3dPlanMsg'))}`, target: '_blank', rel: 'noopener', 'data-act': 'plan-send' }, t('v3dPlanBtn')));
}

/** A link to this page that opens its 3D full screen (?view3d=full, or tv: full and turning). */
function link3d() {
  const url = `${location.origin}${location.pathname}?view3d=full${location.hash}`;
  const done = () => toast(t('v3dLinkOk'), 'ok');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done).catch(() => window.prompt(t('v3dLink'), url));
  else window.prompt(t('v3dLink'), url);
}

/** For a menu: hide a 3D page from everyone but the owner while 3D is off. */
export const menu3d = () => show3d() || session.isAdmin;

/**
 * An isoScene() that follows the company's choice. Off: the owner gets a
 * bar to turn it back on (the page then draws again, through [onChange]), anyone else
 * an empty element. Same methods either way, so callers need not care.
 */
export function scene3d(opts, { onChange = () => window.dispatchEvent(new HashChangeEvent('hashchange')) } = {}) {
  if (!show3d()) {
    const el = session.isAdmin
      ? h('div', { class: 'v3d-off', 'data-card': 'v3d-off' }, h('span', { class: 'grow' }, t('v3dOff')),
        h('button', { class: 'primary', 'data-act': 'v3d-on', onclick: () => setShow3d(true).then(() => { toast(t('v3dSaved'), 'ok'); onChange(); }).catch((err) => toast(err.message || String(err), 'error')) }, t('v3dOn')))
      : h('div', { class: 'v3d-none', hidden: true });
    return { el, off: true, draw() {}, select() {}, focus() {} };
  }
  const extraTools = [...(opts.extraTools || [])];
  const night = night3d();
  extraTools.push({ label: '🔗', act: 'v3d-link', title: t('v3dLink'), onClick: link3d });
  extraTools.push({ label: night ? '☀' : '☾', act: 'v3d-night', title: night ? t('v3dDay') : t('v3dNight'), onClick: () => { setNight3d(!night); onChange(); } });
  if (session.isAdmin) {
    extraTools.push({ label: '⊘', act: 'v3d-off', title: t('v3dTurnOff'), onClick: async () => {
      if (!await confirmBox(t('v3dTurnOffQ'), t('v3dTurnOff'), t('cancel'))) return;
      setShow3d(false).then(() => { toast(t('v3dSaved'), 'ok'); onChange(); }).catch((err) => toast(err.message || String(err), 'error'));
    } });
  }
  const scene = isoScene({ ...opts, extraTools });
  scene.el.classList.toggle('night', night);
  // Opened from a 3D link: straight to full screen, and on a TV (&spin) turning round.
  const asked = new URLSearchParams(location.search);
  if (asked.get('view3d') === 'full') {
    setTimeout(() => { if (scene.el.isConnected) { scene.full(); if (asked.has('spin')) scene.spin(); } }, 400);
  }
  return scene;
}
