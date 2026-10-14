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
  en: { v3dOff: '3D pictures are turned off for this company.', v3dOn: 'Turn 3D on', v3dTurnOff: 'Turn 3D off for everyone', v3dTurnOffQ: 'Turn the 3D pictures off for everyone in the company? You can turn them back on here.', v3dSaved: 'Saved' },
  zh: { v3dOff: '这家公司关闭了 3D 图。', v3dOn: '开启 3D 图', v3dTurnOff: '为所有人关闭 3D 图', v3dTurnOffQ: '为公司里所有人关闭 3D 图吗？之后可以在这里再打开。', v3dSaved: '已保存' },
  ms: { v3dOff: 'Gambar 3D dimatikan untuk syarikat ini.', v3dOn: 'Hidupkan 3D', v3dTurnOff: 'Matikan 3D untuk semua', v3dTurnOffQ: 'Matikan gambar 3D untuk semua orang dalam syarikat? Boleh dihidupkan semula di sini.', v3dSaved: 'Disimpan' },
});

/** Does this company show 3D pictures? */
export const show3d = () => session.settings?.show3d !== false;

/** The owner turns 3D on or off for the whole company. */
export async function setShow3d(on) {
  await setDoc(doc(db, ws('pos/settings')), { show3d: on, updatedAt: Date.now() }, { merge: true });
  session.settings = { ...session.settings, show3d: on };
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
  if (session.isAdmin) {
    extraTools.push({ label: '⊘', act: 'v3d-off', title: t('v3dTurnOff'), onClick: async () => {
      if (!await confirmBox(t('v3dTurnOffQ'), t('v3dTurnOff'), t('cancel'))) return;
      setShow3d(false).then(() => { toast(t('v3dSaved'), 'ok'); onChange(); }).catch((err) => toast(err.message || String(err), 'error'));
    } });
  }
  return isoScene({ ...opts, extraTools });
}
