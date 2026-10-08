/**
 * Settings -> Notifications: the SuXin bot on Telegram, the morning report
 * by email, and notifications on phones and computers. The sending is the
 * API server's (api/notify.mjs); this page only says who wants what.
 *
 *   Telegram   "Connect Telegram" leaves a one-off code (telegramLinks/)
 *              and opens the bot with it; the bot files the chat under
 *              telegramChats/, which shows here with its report switch.
 *   Email      workspaces/{ws}/meta/notify { emailDaily, emails }: admins.
 *   Push       this browser's token under users/{uid}/pushTokens/; the
 *              SuXin Count phone app registers itself when signed in.
 *              { pushDaily } in meta/notify: admins.
 */
import {
  collection, db, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, webPushToken, where,
} from './fb.js';
import { h, mount, toast } from './dom.js';
import { addStrings, t } from './i18n.js';
import { icon } from './icons.js';
import { session, ws } from './session.js';
import { menuButton } from './main.js';

addStrings({
  en: {
    nfTitle: 'Notifications', nfTg: 'Telegram bot', nfTgLead: 'Ask about stock and sales in Telegram ("How many Milo?", "sales today", "low stock"), and get the day\'s report every morning at 8.',
    nfTgConnect: 'Connect Telegram', nfTgOpen: 'Open Telegram', nfTgOr: 'Or find the bot in Telegram and send:',
    nfTgNoBot: 'The Telegram bot is not switched on yet.', nfTgCodeTime: 'This code works once, for 15 minutes.',
    nfTgMine: 'My connected chats', nfTgNone: 'No chat connected yet.', nfDaily: 'Morning report', nfDisconnect: 'Disconnect',
    nfEmail: 'Report by email', nfEmailLead: 'Yesterday\'s sales and today\'s low stock, every morning at 8.',
    nfEmailOn: 'Send the morning report by email', nfEmailTo: 'To (one or more, separated by commas)',
    nfPush: 'Phone and computer notifications', nfPushLead: 'The SuXin Count app asks once after you sign in, then receives the report by itself.',
    nfPushHere: 'Turn on for this browser', nfPushOn: 'On in this browser', nfPushNo: 'Notifications in the browser are not switched on yet.',
    nfPushDenied: 'The browser said no. Allow notifications for this site in the browser\'s settings.',
    nfPushDaily: 'Send the morning report as a notification', nfAdminOnly: 'Only an admin may change this.',
  },
  zh: {
    nfTitle: '通知', nfTg: 'Telegram 机器人', nfTgLead: '在 Telegram 问库存和销售（「Milo 还有多少？」「今天卖了多少」「低库存」），每天早上 8 点收到营业报告。',
    nfTgConnect: '连接 Telegram', nfTgOpen: '打开 Telegram', nfTgOr: '或在 Telegram 找到机器人，发送：',
    nfTgNoBot: 'Telegram 机器人还没开通。', nfTgCodeTime: '这个码只能用一次，15 分钟内有效。',
    nfTgMine: '我连接的聊天', nfTgNone: '还没有连接。', nfDaily: '早上报告', nfDisconnect: '断开',
    nfEmail: 'Email 报告', nfEmailLead: '每天早上 8 点：昨天的销售和现在的低库存。',
    nfEmailOn: '每天早上用 email 寄营业报告', nfEmailTo: '寄给（可以几个，用逗号分开）',
    nfPush: '手机和电脑通知', nfPushLead: 'SuXin Count app 登录后会问一次是否允许通知，之后自动收到报告。',
    nfPushHere: '在这个浏览器开启', nfPushOn: '这个浏览器已开启', nfPushNo: '浏览器通知还没开通。',
    nfPushDenied: '浏览器拒绝了。请在浏览器设置里允许这个网站的通知。',
    nfPushDaily: '用通知发早上的营业报告', nfAdminOnly: '只有管理员可以改。',
  },
  ms: {
    nfTitle: 'Pemberitahuan', nfTg: 'Bot Telegram', nfTgLead: 'Tanya stok dan jualan di Telegram ("berapa stok Milo", "jualan hari ini", "stok rendah"), dan terima laporan setiap pagi jam 8.',
    nfTgConnect: 'Sambung Telegram', nfTgOpen: 'Buka Telegram', nfTgOr: 'Atau cari bot di Telegram dan hantar:',
    nfTgNoBot: 'Bot Telegram belum dihidupkan.', nfTgCodeTime: 'Kod ini sekali guna, sah 15 minit.',
    nfTgMine: 'Sembang saya yang disambung', nfTgNone: 'Belum ada.', nfDaily: 'Laporan pagi', nfDisconnect: 'Putuskan',
    nfEmail: 'Laporan melalui e-mel', nfEmailLead: 'Jualan semalam dan stok rendah, setiap pagi jam 8.',
    nfEmailOn: 'Hantar laporan pagi melalui e-mel', nfEmailTo: 'Kepada (boleh beberapa, dipisah koma)',
    nfPush: 'Pemberitahuan telefon dan komputer', nfPushLead: 'Aplikasi SuXin Count bertanya sekali selepas log masuk, kemudian menerima laporan sendiri.',
    nfPushHere: 'Hidupkan untuk pelayar ini', nfPushOn: 'Hidup di pelayar ini', nfPushNo: 'Pemberitahuan pelayar belum dihidupkan.',
    nfPushDenied: 'Pelayar menolak. Benarkan pemberitahuan untuk laman ini dalam tetapan pelayar.',
    nfPushDaily: 'Hantar laporan pagi sebagai pemberitahuan', nfAdminOnly: 'Hanya admin boleh menukar.',
  },
});

const LINK_MINUTES = 15;

/** A code nobody can guess: 16 letters and digits from the browser's random source. */
export function newLinkCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => abc[b % abc.length]).join('');
}

const card = (title, lead, ...body) => h('section', { class: 'card nf-card' },
  h('h2', { style: { margin: 0 } }, title),
  lead ? h('p', { class: 'muted', style: { margin: 0 } }, lead) : null,
  ...body);

export function render(main) {
  const tg = h('div', { class: 'nf-body' });
  const mail = h('div', { class: 'nf-body' });
  const push = h('div', { class: 'nf-body' });
  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('nfTitle'))),
    h('div', { class: 'nf' },
      card(t('nfTg'), t('nfTgLead'), tg),
      card(t('nfEmail'), t('nfEmailLead'), mail),
      card(t('nfPush'), t('nfPushLead'), push)));
  Promise.all([
    getDoc(doc(db, 'publicConfig/telegram')).then((s) => s.data() || {}).catch(() => ({})),
    getDoc(doc(db, 'publicConfig/push')).then((s) => s.data() || {}).catch(() => ({})),
    getDoc(doc(db, ws('meta/notify'))).then((s) => s.data() || {}).catch(() => ({})),
  ]).then(([bot, pushCfg, settings]) => {
    drawTelegram(tg, bot.username || '');
    drawEmail(mail, settings);
    drawPush(push, pushCfg.vapidKey || '', settings);
  });
  return null;
}

// --------------------------------------------------------------- telegram

async function drawTelegram(box, botName) {
  const chats = (await getDocs(query(collection(db, 'telegramChats'), where('uid', '==', session.uid))).catch(() => ({ docs: [] })))
    .docs.map((d) => ({ id: d.id, ...d.data() }));
  const codeBox = h('div', { class: 'nf-code' });
  const connect = h('button', { class: 'primary', 'data-act': 'tg-connect' }, icon('plug', 17), t('nfTgConnect'));
  connect.onclick = async () => {
    connect.disabled = true;
    const code = newLinkCode();
    try {
      await setDoc(doc(db, `telegramLinks/${code}`), {
        workspaceId: session.ws, uid: session.uid, createdAt: Date.now(), expiresAt: Date.now() + LINK_MINUTES * 60_000,
      });
    } catch (err) {
      toast(err.message || String(err), 'error');
      connect.disabled = false;
      return;
    }
    mount(codeBox,
      botName ? h('a', { class: 'btn-link primary', href: `https://t.me/${botName}?start=${code}`, target: '_blank', rel: 'noopener', 'data-act': 'tg-open' }, t('nfTgOpen')) : null,
      h('p', { class: 'muted', style: { margin: 0 } }, botName ? `${t('nfTgOr')} @${botName}` : t('nfTgOr')),
      h('code', { class: 'nf-start' }, `/start ${code}`),
      h('p', { class: 'muted', style: { margin: 0, fontSize: '13px' } }, t('nfTgCodeTime')));
    connect.disabled = false;
  };
  mount(box,
    botName ? null : h('p', { class: 'tip', style: { margin: 0 } }, t('nfTgNoBot')),
    h('div', { class: 'row' }, connect),
    codeBox,
    h('h3', { style: { margin: '8px 0 0' } }, t('nfTgMine')),
    chats.length ? chats.map((c) => {
      const daily = h('input', { type: 'checkbox', checked: c.daily !== false });
      daily.onchange = () => updateDoc(doc(db, `telegramChats/${c.id}`), { daily: daily.checked })
        .then(() => toast(t('saved'), 'ok')).catch((err) => toast(err.message || String(err), 'error'));
      return h('div', { class: 'nf-chat', 'data-chat': c.id },
        h('span', { class: 'grow' }, icon('user', 16), ' ', c.chatName || c.name || c.id),
        h('label', { class: 'check' }, daily, t('nfDaily')),
        h('button', { class: 'ghost', onclick: async () => { await deleteDoc(doc(db, `telegramChats/${c.id}`)); drawTelegram(box, botName); } }, t('nfDisconnect')));
    }) : h('p', { class: 'muted', style: { margin: 0 } }, t('nfTgNone')));
}

// ------------------------------------------------------------------ email

function saveSettings(patch) {
  return setDoc(doc(db, ws('meta/notify')), { ...patch, updatedAt: Date.now() }, { merge: true })
    .then(() => toast(t('saved'), 'ok')).catch((err) => toast(err.message || String(err), 'error'));
}

function drawEmail(box, settings) {
  const admin = session.isAdmin;
  const on = h('input', { type: 'checkbox', checked: settings.emailDaily === true, disabled: !admin });
  const to = h('input', { type: 'text', inputmode: 'email', value: (settings.emails || [session.email]).filter(Boolean).join(', '), disabled: !admin, 'aria-label': t('nfEmailTo') });
  const save = h('button', { class: 'primary', disabled: !admin, 'data-act': 'email-save' }, t('save'));
  save.onclick = () => {
    const emails = to.value.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    saveSettings({ emailDaily: on.checked, emails, lang: document.documentElement.lang || 'zh' });
  };
  mount(box,
    h('label', { class: 'check' }, on, t('nfEmailOn')),
    h('label', { class: 'field' }, t('nfEmailTo'), to),
    admin ? h('div', { class: 'actions' }, save) : h('p', { class: 'muted', style: { margin: 0 } }, t('nfAdminOnly')));
}

// ------------------------------------------------------------------- push

function drawPush(box, vapidKey, settings) {
  const here = h('button', { 'data-act': 'push-here' }, icon('check', 17), t('nfPushHere'));
  here.onclick = async () => {
    here.disabled = true;
    try {
      const token = await webPushToken(vapidKey);
      await setDoc(doc(db, ws(`users/${session.uid}/pushTokens/${token}`)), { platform: 'web', userAgent: navigator.userAgent.slice(0, 120), updatedAt: Date.now() });
      mount(here, icon('check', 17), t('nfPushOn'));
      toast(t('nfPushOn'), 'ok');
    } catch (err) {
      toast(err.message === 'denied' ? t('nfPushDenied') : (err.message || String(err)), 'error');
      here.disabled = false;
    }
  };
  const daily = h('input', { type: 'checkbox', checked: settings.pushDaily === true, disabled: !session.isAdmin });
  daily.onchange = () => saveSettings({ pushDaily: daily.checked, lang: document.documentElement.lang || 'zh' });
  mount(box,
    vapidKey ? h('div', { class: 'row' }, here) : h('p', { class: 'muted', style: { margin: 0 } }, t('nfPushNo')),
    h('label', { class: 'check' }, daily, t('nfPushDaily')),
    session.isAdmin ? null : h('p', { class: 'muted', style: { margin: 0 } }, t('nfAdminOnly')));
}
