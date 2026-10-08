/**
 * Settings -> QR ordering: switch it on, choose dine-in and takeaway, a
 * welcome line, and print a code for every table and one for the counter.
 *
 * Each branch has its own secret in pos/settings.selfOrder.codes; the
 * printed address carries it (web/order/?s=<ws>~<branch>~<secret>&t=<table>)
 * and the API checks it (api/selforder.mjs). Making a new code voids every
 * code printed before -- the answer to a code photographed and misused.
 */
import { doc, db, setDoc } from './fb.js';
import { confirmBox, h, mount, toast } from './dom.js';
import { addStrings, t } from './i18n.js';
import { icon } from './icons.js';
import { session, ws } from './session.js';
import { printView } from './receipt.js';
import { menuButton } from './main.js';

addStrings({
  en: {
    setQr: 'QR ordering', qrsLead: 'Customers scan a code on the table, order from their own phone and pay at the counter. Orders wait at the till under QR orders until someone accepts them, so nothing reaches the kitchen unchecked.',
    qrsOn: 'Take orders by QR code', qrsDineIn: 'Dine-in (customers pick or scan their table)', qrsTakeaway: 'Takeaway (with a pickup number)', qrsMessage: 'Welcome line on the menu',
    qrsCodes: 'Codes to print', qrsFor: 'For', qrsCounter: 'Counter / takeaway', qrsTables: 'Tables are set under Settings → Features.', qrsPrint: 'Print all codes',
    qrsCopy: 'Copy link', qrsCopied: 'Link copied', qrsNew: 'Make new codes', qrsNewQ: 'Make new codes? Every code printed before stops working.', qrsMade: 'New codes made',
    qrsOpen: 'Try it', qrsNoLib: 'The QR picture could not load; the link below works the same.', qrsScan: 'Scan to order',
  },
  zh: {
    setQr: '扫码点餐', qrsLead: '顾客扫桌上的二维码，用自己的手机点餐，在柜台付钱。订单先到收银机的「扫码订单」，要有人按接单才会进厨房，不怕乱点。',
    qrsOn: '开放扫码点餐', qrsDineIn: '堂食（顾客选桌或扫桌上的码）', qrsTakeaway: '外带（给取餐号）', qrsMessage: '菜单上的欢迎词',
    qrsCodes: '要打印的二维码', qrsFor: '分店', qrsCounter: '柜台 / 外带', qrsTables: '桌号在「设置 → 功能」里设定。', qrsPrint: '打印全部二维码',
    qrsCopy: '复制链接', qrsCopied: '链接已复制', qrsNew: '换新二维码', qrsNewQ: '换新二维码？以前打印的全部不能用了。', qrsMade: '已换新二维码',
    qrsOpen: '试一下', qrsNoLib: '二维码图片打不开；下面的链接一样可以用。', qrsScan: '扫码点餐',
  },
  ms: {
    setQr: 'Pesanan QR', qrsLead: 'Pelanggan imbas kod di meja, pesan dari telefon sendiri dan bayar di kaunter. Pesanan menunggu di kaunter dalam Pesanan QR sehingga diterima, jadi tiada apa ke dapur tanpa disemak.',
    qrsOn: 'Terima pesanan melalui kod QR', qrsDineIn: 'Makan di sini (pilih atau imbas meja)', qrsTakeaway: 'Bungkus (dengan nombor ambil)', qrsMessage: 'Ayat aluan pada menu',
    qrsCodes: 'Kod untuk dicetak', qrsFor: 'Untuk', qrsCounter: 'Kaunter / bungkus', qrsTables: 'Meja ditetapkan di Tetapan → Ciri.', qrsPrint: 'Cetak semua kod',
    qrsCopy: 'Salin pautan', qrsCopied: 'Pautan disalin', qrsNew: 'Buat kod baharu', qrsNewQ: 'Buat kod baharu? Semua kod lama tidak boleh digunakan lagi.', qrsMade: 'Kod baharu dibuat',
    qrsOpen: 'Cuba', qrsNoLib: 'Gambar kod QR tidak dapat dimuat; pautan di bawah berfungsi sama.', qrsScan: 'Imbas untuk pesan',
  },
});

const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
let qrLib = null;
/** The QR drawing library, loaded the first time it is needed. */
function loadQr() {
  qrLib ||= new Promise((resolve, reject) => {
    if (window.qrcode) return resolve(window.qrcode);
    const s = document.createElement('script');
    s.src = QR_LIB;
    s.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error('no qrcode')));
    s.onerror = () => { qrLib = null; reject(new Error('qrcode did not load')); };
    document.head.append(s);
  });
  return qrLib;
}

const newSecret = () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => abc[b % abc.length]).join('');
};
export const orderLink = (branchId, secret, table = '') =>
  `${location.origin}/order/?s=${encodeURIComponent(`${session.ws}~${branchId || '-'}~${secret}`)}${table ? `&t=${encodeURIComponent(table)}` : ''}`;

const save = (selfOrder) => setDoc(doc(db, ws('pos/settings')), { selfOrder, updatedAt: Date.now() }, { merge: true });

export function render(main) {
  const may = session.isAdmin || session.can('POS_MANAGE');
  const so = () => ({ enabled: false, dineIn: true, takeaway: true, message: '', codes: {}, ...(session.settings.selfOrder || {}) });
  let branch = session.branchId || '';
  const box = h('div', { style: { display: 'grid', gap: '16px', maxWidth: '980px' } });

  const draw = () => {
    const s = so();
    const on = h('input', { type: 'checkbox', checked: !!s.enabled, disabled: !may, 'data-act': 'qrs-on' });
    const dine = h('input', { type: 'checkbox', checked: s.dineIn !== false, disabled: !may });
    const take = h('input', { type: 'checkbox', checked: s.takeaway !== false, disabled: !may });
    const msg = h('input', { value: s.message || '', maxlength: 200, disabled: !may, placeholder: '欢迎光临！Selamat datang!' });
    const store = () => {
      const next = { ...so(), enabled: on.checked, dineIn: dine.checked, takeaway: take.checked, message: msg.value.trim() };
      // Switching it on makes this branch's code the first time.
      if (next.enabled && !next.codes?.[branch || '-']) next.codes = { ...next.codes, [branch || '-']: newSecret() };
      return save(next).then(() => { session.settings.selfOrder = next; toast(t('saved'), 'ok'); draw(); }).catch((e) => toast(e.message, 'error'));
    };
    const codes = h('div', { class: 'qrs-grid' });
    const secret = s.codes?.[branch || '-'];
    const targets = [
      ...(s.takeaway !== false ? [['', t('qrsCounter')]] : []),
      ...(s.dineIn !== false ? (session.settings.tables || []).map((tb) => [tb, `${t('table')} ${tb}`]) : []),
    ];
    const cards = targets.map(([table, name]) => {
      const pic = h('div', { class: 'qrs-pic' });
      const link = secret ? orderLink(branch, secret, table) : '';
      return { table, name, pic, link, el: h('div', { class: 'card qrs-card', 'data-qr-table': table || 'counter' },
        h('strong', {}, name), pic,
        h('div', { class: 'row', style: { flexWrap: 'wrap', justifyContent: 'center' } },
          h('button', { type: 'button', onclick: () => navigator.clipboard?.writeText(link).then(() => toast(t('qrsCopied'), 'ok'), () => toast(link)) }, t('qrsCopy')),
          h('a', { class: 'btn', href: link, target: '_blank', rel: 'noopener' }, t('qrsOpen')))) };
    });
    mount(codes, cards.map((c) => c.el));
    if (secret && cards.length) {
      loadQr().then((qrcode) => cards.forEach((c) => {
        const q = qrcode(0, 'M'); q.addData(c.link); q.make();
        c.pic.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      })).catch(() => cards.forEach((c) => mount(c.pic, h('p', { class: 'muted', style: { fontSize: '12px', overflowWrap: 'anywhere' } }, t('qrsNoLib'), h('br'), c.link))));
    }
    const branches = session.sellableBranches ? session.sellableBranches() : [];
    mount(box,
      h('p', { class: 'muted', style: { margin: 0 } }, t('qrsLead')),
      h('div', { class: 'card', style: { display: 'grid', gap: '12px' } },
        h('label', { class: 'check' }, on, h('b', {}, t('qrsOn'))),
        h('label', { class: 'check' }, dine, t('qrsDineIn')),
        h('label', { class: 'check' }, take, t('qrsTakeaway')),
        h('label', { class: 'field' }, t('qrsMessage'), msg),
        may ? h('div', { class: 'actions' }, h('button', { class: 'primary', 'data-act': 'qrs-save', onclick: store }, t('save'))) : null),
      s.enabled ? h('div', { style: { display: 'grid', gap: '12px' } },
        h('div', { class: 'row', style: { flexWrap: 'wrap' } },
          h('h2', { class: 'grow', style: { margin: 0 } }, t('qrsCodes')),
          branches.length > 1 ? h('label', { class: 'row' }, t('qrsFor'), h('select', { style: { width: 'auto' }, onchange: (e) => { branch = e.target.value; draw(); } },
            branches.map((b) => h('option', { value: b.id, selected: b.id === branch }, b.name)))) : null,
          secret ? h('button', { type: 'button', 'data-act': 'qrs-print', onclick: () => printCodes(cards) }, icon('printer', 17), t('qrsPrint')) : null,
          may ? h('button', { type: 'button', class: 'danger', 'data-act': 'qrs-new', onclick: async () => {
            if (!secret || await confirmBox(t('qrsNewQ'), t('qrsNew'), t('cancel'))) {
              const next = { ...so(), codes: { ...(so().codes || {}), [branch || '-']: newSecret() } };
              save(next).then(() => { session.settings.selfOrder = next; toast(t('qrsMade'), 'ok'); draw(); }).catch((e) => toast(e.message, 'error'));
            }
          } }, t('qrsNew')) : null),
        h('p', { class: 'muted', style: { margin: 0 } }, t('qrsTables')),
        secret ? codes : null) : null);
  };

  mount(main, h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('setQr'))), box);
  draw();
  return null;
}

/** One sheet of codes, each with its table, to cut out and stand on the tables. */
function printCodes(cards) {
  printView(h('div', { class: 'qrs-printsheet' }, cards.map((c) => h('div', { class: 'qrs-printcard' },
    h('div', { class: 'qrs-printname' }, c.name),
    h('div', { class: 'qrs-printpic' }, ...[...c.pic.childNodes].map((n) => n.cloneNode(true))),
    h('div', { class: 'qrs-printhint' }, `${t('qrsScan')} · Scan to order · Imbas untuk pesan`),
    h('div', { class: 'qrs-printshop' }, session.companyName || '')))));
}
