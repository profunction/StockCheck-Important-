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
import { db, deleteObject, doc, getDownloadURL, ref, setDoc, storage, uploadBytes } from './fb.js';
import { confirmBox, h, toast } from './dom.js';
import { addStrings, t } from './i18n.js';
import { isoScene } from './iso.js';
import { glbView, hasWebGL } from './glb3d.js';
import { session, ws } from './session.js';

addStrings({
  en: { v3dOff: '3D pictures are turned off for this company.', v3dOn: 'Turn 3D on', v3dTurnOff: 'Turn 3D off for everyone', v3dTurnOffQ: 'Turn the 3D pictures off for everyone in the company? You can turn them back on here.', v3dSaved: 'Saved', v3dNight: 'Dark showroom look', v3dDay: 'Light look', v3dLink: 'Copy a link that opens this 3D full screen (add &spin for a TV)', v3dLinkOk: 'Link copied. Open it on any screen; sign in once.',
    v3dPlan: 'Have a floor plan of your shop or warehouse? Send it to us and we will build your own company in 3D.', v3dPlanBtn: 'Send us your floor plan', v3dPlanMsg: 'Hi JSOX, here is our floor plan. Please build our company in 3D.',
    v3dReal: 'Real 3D: turn it all the way round (360°)', v3dFlat: 'Back to the simple picture', v3dRealHint: 'Drag to turn 360° · scroll or two fingers to zoom · right-drag to move', v3dTurn: 'Turn round on its own', v3dSave: 'Save as a .glb 3D file', v3dSaved3d: '.glb file saved', v3dUp: 'Upload your own .glb model (made from your floor plan)', v3dUpOk: 'Your 3D model is up. Everyone in the company now sees it here.', v3dUpBig: 'That file is too big (30 MB at most).', v3dUpType: 'Choose a .glb file.', v3dDrop: 'Remove your own model (back to the live picture)', v3dDropQ: 'Remove your own 3D model? This picture goes back to the live one.', v3dNoGl: 'This browser cannot show real 3D.', v3dLoading: 'Loading 3D…' },
  zh: { v3dOff: '这家公司关闭了 3D 图。', v3dOn: '开启 3D 图', v3dTurnOff: '为所有人关闭 3D 图', v3dTurnOffQ: '为公司里所有人关闭 3D 图吗？之后可以在这里再打开。', v3dSaved: '已保存', v3dNight: '深色展示模式', v3dDay: '浅色模式', v3dLink: '复制链接：一打开就是全屏 3D（电视加 &spin 会自己转）', v3dLinkOk: '链接已复制。在任何屏幕打开，登入一次就可以。',
    v3dPlan: '有你店面或仓库的平面图吗？发给我们，我们帮你做成你公司自己的 3D。', v3dPlanBtn: '把平面图发给我们', v3dPlanMsg: '你好 JSOX，这是我们的平面图，请帮我们做成公司自己的 3D。',
    v3dReal: '真正 3D：360° 转', v3dFlat: '回到简单图', v3dRealHint: '拖动 360° 转 · 滚轮或双指放大 · 右键拖动移动', v3dTurn: '自己慢慢转', v3dSave: '下载 .glb 3D 文件', v3dSaved3d: '.glb 文件已下载', v3dUp: '上传你自己的 .glb 3D 模型（用平面图做的）', v3dUpOk: '3D 模型已上传，公司里每个人在这里都会看到。', v3dUpBig: '文件太大了（最多 30 MB）。', v3dUpType: '请选 .glb 文件。', v3dDrop: '删除自己的模型（回到实时 3D）', v3dDropQ: '删除你自己的 3D 模型吗？这里会回到实时的 3D。', v3dNoGl: '这个浏览器不能显示真正 3D。', v3dLoading: '3D 加载中…' },
  ms: { v3dOff: 'Gambar 3D dimatikan untuk syarikat ini.', v3dOn: 'Hidupkan 3D', v3dTurnOff: 'Matikan 3D untuk semua', v3dTurnOffQ: 'Matikan gambar 3D untuk semua orang dalam syarikat? Boleh dihidupkan semula di sini.', v3dSaved: 'Disimpan', v3dNight: 'Rupa gelap (pameran)', v3dDay: 'Rupa cerah', v3dLink: 'Salin pautan yang membuka 3D ini skrin penuh (tambah &spin untuk TV)', v3dLinkOk: 'Pautan disalin. Buka di mana-mana skrin; log masuk sekali.',
    v3dPlan: 'Ada pelan lantai kedai atau gudang anda? Hantar kepada kami dan kami bina syarikat anda sendiri dalam 3D.', v3dPlanBtn: 'Hantar pelan lantai', v3dPlanMsg: 'Hai JSOX, ini pelan lantai kami. Tolong bina syarikat kami dalam 3D.',
    v3dReal: '3D sebenar: pusing 360°', v3dFlat: 'Kembali ke gambar ringkas', v3dRealHint: 'Seret untuk pusing 360° · tatal atau dua jari untuk zum · seret kanan untuk alih', v3dTurn: 'Pusing sendiri', v3dSave: 'Simpan fail 3D .glb', v3dSaved3d: 'Fail .glb disimpan', v3dUp: 'Muat naik model .glb anda sendiri (dari pelan lantai)', v3dUpOk: 'Model 3D anda sudah dimuat naik. Semua orang dalam syarikat melihatnya di sini.', v3dUpBig: 'Fail terlalu besar (maksimum 30 MB).', v3dUpType: 'Pilih fail .glb.', v3dDrop: 'Buang model sendiri (kembali ke 3D langsung)', v3dDropQ: 'Buang model 3D anda sendiri? Gambar ini kembali ke yang langsung.', v3dNoGl: 'Pelayar ini tidak boleh menunjukkan 3D sebenar.', v3dLoading: 'Memuatkan 3D…' },
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

/** Which picture this is, for its own uploaded model: the app and the page ("warehouse-map", "pos-floor"). */
export function modelKey() {
  const app = location.pathname.split('/').filter(Boolean)[0] || 'site';
  const page = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'home';
  return `${app}-${page}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

/** Real 3D chosen on this phone or computer (else the simple picture). */
function real3d() {
  try { return localStorage.getItem('jsox-3d-real') === 'on'; } catch { return false; }
}
function setReal3d(on) {
  try { localStorage.setItem('jsox-3d-real', on ? 'on' : 'off'); } catch { /* no storage */ }
}

const MAX_MODEL = 30 * 1024 * 1024;

/**
 * The real 3D view (glb3d.js) laid over an isoScene's picture: same boxes,
 * same taps, but solid 3D that turns all the way round. Its own buttons
 * (360° on, turn on its own, save .glb, the owner's upload) sit on the
 * picture's toolbar and show only while it is on. Returns { act, show, wanted, draw, select }.
 */
function withReal(scene, opts, key) {
  const el = scene.el;
  let view = null;
  let opening = null;
  const mark = () => { el.classList.toggle('own', !!view?.hasModel()); host.dataset.model = view?.hasModel() ? 'own' : 'live'; };
  const stored = () => session.settings?.models?.[key] || null;
  const host = h('div', { class: 'g3d', 'data-card': 'g3d' });
  const tip = h('div', { class: 'g3d-hint' }, t('v3dRealHint'));
  const on = () => el.classList.contains('real');
  const show = async ({ spin = false } = {}) => {
    if (!hasWebGL()) { toast(t('v3dNoGl'), 'error'); return; }
    el.classList.add('real');
    if (!host.isConnected) el.prepend(host);
    if (view) { if (spin) view.autoRotate(true); return; }
    if (opening) return;
    host.replaceChildren(h('div', { class: 'g3d-wait' }, t('v3dLoading')), tip);
    const now = scene.current();
    let model = null;
    if (stored()?.path) model = await getDownloadURL(ref(storage, stored().path)).catch(() => null);
    opening = glbView(host, { ...now, onPick: opts.onPick, night: el.classList.contains('night'), floorColor: opts.floorColor, floor: opts.floor !== false, spin, model });
    try {
      view = await opening;
    } catch (err) {
      el.classList.remove('real');
      toast(err.message || String(err), 'error');
      return;
    } finally { opening = null; host.querySelector('.g3d-wait')?.remove(); }
    // Turned off again while it was loading.
    if (!on()) { view.dispose(); view = null; return; }
    host.dataset.ready = '1';
    host.view = view;
    mark();
  };
  const hide = () => {
    el.classList.remove('real');
    view?.dispose();
    view = null;
    host.remove();
    delete host.dataset.ready;
    mark();
  };
  const save = async () => {
    if (!view) return;
    const buf = await view.glb();
    const url = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
    const a = h('a', { href: url, download: `JSOX-${key}.glb` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(t('v3dSaved3d'), 'ok');
  };
  const upload = () => {
    const input = h('input', { type: 'file', accept: '.glb,model/gltf-binary', hidden: true, 'data-act': 'v3d-file' });
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      if (!/\.glb$/i.test(file.name)) { toast(t('v3dUpType'), 'error'); return; }
      if (file.size > MAX_MODEL) { toast(t('v3dUpBig'), 'error'); return; }
      try {
        const path = ws('models', `${key}.glb`);
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, file, { contentType: 'model/gltf-binary' });
        const rec = { path, name: file.name.slice(0, 120), size: file.size, at: Date.now() };
        const models = { ...(session.settings?.models || {}), [key]: rec };
        await setDoc(doc(db, ws('pos/settings')), { models, updatedAt: Date.now() }, { merge: true });
        session.settings = { ...session.settings, models };
        if (!view) await show();
        await view?.useModel(await getDownloadURL(fileRef));
        mark();
        toast(t('v3dUpOk'), 'ok');
      } catch (err) { toast(err.message || String(err), 'error'); }
    };
    document.body.append(input);
    input.click();
  };
  const drop = async () => {
    const rec = stored();
    if (!rec || !await confirmBox(t('v3dDropQ'), t('v3dDrop'), t('cancel'))) return;
    try {
      const models = { ...(session.settings?.models || {}), [key]: null };
      await setDoc(doc(db, ws('pos/settings')), { models, updatedAt: Date.now() }, { merge: true });
      session.settings = { ...session.settings, models };
      await deleteObject(ref(storage, rec.path)).catch(() => {});
      await view?.useModel(null);
      mark();
      toast(t('v3dSaved'), 'ok');
    } catch (err) { toast(err.message || String(err), 'error'); }
  };
  return {
    act: {
      real: () => { if (on()) { hide(); setReal3d(false); } else { setReal3d(true); show(); } },
      turn: () => view?.autoRotate(),
      save: () => save().catch((err) => toast(err.message || String(err), 'error')),
      up: upload,
      drop,
    },
    show,
    wanted: () => real3d() || !!stored()?.path,
    /** The page drew fresh figures (or a tap chose something): the 3D follows. */
    draw: () => { if (view && !view.hasModel()) { const c = scene.current(); view.draw(c.boxes, c.W, c.D); } },
    select: (id) => view?.select(id),
  };
}

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
  // The real 3D's buttons (first on the toolbar), wired once the picture exists.
  let real = null;
  const act = (name) => () => real?.act[name]();
  extraTools.unshift(
    { label: '360°', act: 'v3d-real', first: true, title: t('v3dReal'), onClick: act('real') },
    { label: '↻', act: 'g3d-turn', first: true, title: t('v3dTurn'), onClick: act('turn') },
    { label: '.glb', act: 'g3d-save', first: true, title: t('v3dSave'), onClick: act('save') },
    ...(session.isAdmin ? [
      { label: '⇪', act: 'g3d-up', first: true, title: t('v3dUp'), onClick: act('up') },
      { label: '✕', act: 'g3d-drop', first: true, title: t('v3dDrop'), onClick: act('drop') }] : []));
  const scene = isoScene({ ...opts, extraTools });
  scene.el.classList.toggle('night', night);
  real = withReal(scene, opts, opts.modelKey || modelKey());
  const { draw, select } = scene;
  scene.draw = (...a) => { draw(...a); real.draw(); };
  scene.select = (id) => { select(id); real.select(id); };
  // Opened from a 3D link: straight to full screen, and on a TV (&spin) in real 3D turning round.
  const asked = new URLSearchParams(location.search);
  const full = asked.get('view3d') === 'full';
  const spin = full && asked.has('spin');
  if (full || spin || real.wanted()) {
    setTimeout(() => {
      if (!scene.el.isConnected) return;
      if (full) scene.full();
      if (spin || real.wanted()) real.show({ spin });
    }, 400);
  }
  return scene;
}
