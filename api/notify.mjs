/**
 * The JSOX bot and the daily report: reads the company's data, asks
 * bot.mjs what to say, and says it by Telegram, email and phone
 * notification.
 *
 *   Telegram   a person links their chat on the website (Settings ->
 *              Notifications -> Connect Telegram), which leaves a one-off
 *              code in telegramLinks/; "/start <code>" in the bot files the
 *              chat under telegramChats/{chatId}. Questions are answered
 *              with what that person's role may see.
 *   Email      workspaces/{ws}/meta/notify { emailDaily, emails } -- an
 *              admin's choice -- through any SMTP account (Gmail works).
 *   Push       Firebase Cloud Messaging, to the tokens phones and browsers
 *              leave under workspaces/{ws}/users/{uid}/pushTokens/.
 *
 * Every secret comes from the environment (Secret Manager on Cloud Run):
 * TELEGRAM_BOT_TOKEN, TELEGRAM_SECRET, SMTP_USER, SMTP_PASS, JOB_KEY.
 * Whatever is missing is simply not sent.
 */
import {
  branchesText, busyText, compareText, customersText, dailyText, dontKnow, examplesText, greetText, itemSalesText, langText,
  mailText, movesText, noRight, outText, poText, priceText, profitText, shiftText, slowText, staffText, taxText, thanksText, topText,
  valueText, voidsText, whoamiText,
} from './answers.mjs';
import { isLow, levels as ledgerLevels, takenAt } from './ledger.js';
import { closingRows, expiring, monthBefore, monthEnd, monthOf } from './wms.js';
import {
  dayRange, findProducts, langOf, lowText, parseMessage, periodRange, previousRange, reportPush, reportText, salesText, stockText, summarize, words,
} from './bot.mjs';

const SITE = 'https://stockcheck-fb58e.web.app';
const OPEN_PO = ['SUBMITTED', 'APPROVED', 'ORDERED', 'PARTIAL'];

export function notifier(db, env = process.env) {
  const wsRef = (id) => db.collection('workspaces').doc(id);
  const tgApi = env.TELEGRAM_API || 'https://api.telegram.org';
  let mailer = null;

  // ---------------------------------------------------------------- sending

  async function telegram(chatId, text) {
    if (!env.TELEGRAM_BOT_TOKEN) return false;
    const res = await fetch(`${tgApi}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
    });
    return res.ok;
  }

  async function telegramCall(method, body) {
    const res = await fetch(`${tgApi}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    });
    return res.json();
  }

  async function email(to, subject, text) {
    const list = to.filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (!list.length) return false;
    // Tests point this at a stand-in instead of a real mail server.
    if (env.MAIL_STUB_URL) {
      await fetch(env.MAIL_STUB_URL, { method: 'POST', body: JSON.stringify({ to: list, subject, text }) });
      return true;
    }
    if (!env.SMTP_USER || !env.SMTP_PASS) return false;
    if (!mailer) {
      const { default: nodemailer } = await import('nodemailer');
      const port = Number(env.SMTP_PORT || 465);
      mailer = nodemailer.createTransport({
        host: env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
    }
    await mailer.sendMail({ from: env.MAIL_FROM || `JSOX <${env.SMTP_USER}>`, to: list.join(', '), subject, text });
    return true;
  }

  /** To each of [owners] ({ wsId, uid, token }); tokens the service says are dead are removed. */
  async function push(owners, { title, body }) {
    if (!owners.length) return 0;
    const tokens = owners.map((o) => o.token);
    if (env.PUSH_STUB_URL) {
      await fetch(env.PUSH_STUB_URL, { method: 'POST', body: JSON.stringify({ tokens, title, body }) });
      return tokens.length;
    }
    const { getMessaging } = await import('firebase-admin/messaging');
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      android: { priority: 'high', notification: { channelId: 'reports' } },
      webpush: { notification: { icon: `${SITE}/icons/icon-192.png` }, fcmOptions: { link: `${SITE}/pos/#/cloud` } },
    });
    await Promise.all(res.responses.map((r, i) => {
      const code = r.error?.code || '';
      if (!/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) return null;
      const o = owners[i];
      return wsRef(o.wsId).collection('users').doc(o.uid).collection('pushTokens').doc(o.token).delete().catch(() => {});
    }));
    return res.successCount;
  }

  // ----------------------------------------------------------------- reading

  /** The person behind a chat: active, their permissions and branches; null if gone. */
  async function member(wsId, uid) {
    const snap = await wsRef(wsId).collection('users').doc(uid).get();
    if (!snap.exists) return null;
    const p = snap.data();
    if (p.active === false) return null;
    const isAdmin = p.roleId === 'admin';
    const role = isAdmin ? null : (await wsRef(wsId).collection('roles').doc(p.roleId || 'none').get()).data();
    const perms = new Set(role?.permissions || []);
    return {
      uid, name: p.displayName || p.email || '', email: p.email || '', isAdmin, roleId: p.roleId || '', branchIds: p.branchIds || [],
      can: (perm) => isAdmin || perms.has(perm),
    };
  }

  async function company(wsId) {
    const c = (await wsRef(wsId).collection('meta').doc('config').get()).data() || {};
    const names = Object.fromEntries((c.branches || []).map((b) => [b.id, b.name]));
    return { name: c.companyName || '', branchIds: (c.branches || []).filter((b) => b.active !== false && !b.closed).map((b) => b.id), placeName: (id) => names[id] || (id ? id : c.companyName || '—') };
  }

  const salesBetween = async (wsId, from, to) => (await wsRef(wsId).collection('sales')
    .where('createdAt', '>=', from).where('createdAt', '<', to).get()).docs.map((d) => d.data());

  /** Stock per branch, as ledger.js works it out (the same as the app and the website). */
  /** Stock at each place now, or as it stood at [until]. */
  async function stock(wsId, until = Infinity) {
    const col = (n) => wsRef(wsId).collection(n);
    const [checksSnap, movesSnap, productsSnap] = await Promise.all([
      col('stockChecks').where('status', 'in', ['COMPLETED', 'REVIEWED', 'LOCKED']).get(),
      col('movements').where('at', '>=', Date.now() - 400 * 24 * 3600 * 1000).get(),
      col('products').get(),
    ]);
    const checks = checksSnap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((c) => takenAt(c) <= until);
    const items = new Map(await Promise.all(checks.map(async (c) =>
      [c.id, (await col('stockChecks').doc(c.id).collection('items').get()).docs.map((d) => d.data())])));
    const moves = movesSnap.docs.map((d) => d.data()).filter((m) => m.at <= until);
    const products = productsSnap.docs.map((d) => ({ ...d.data(), barcode: d.id }));
    const catalogue = new Map(products.map((p) => [p.barcode, p]));
    const branches = new Set([...checks.map((c) => c.branchId || ''), ...moves.map((m) => m.branchId || '')]);
    const byBranch = {};
    for (const b of branches) {
      byBranch[b] = ledgerLevels(checks.filter((c) => (c.branchId || '') === b), (c) => items.get(c.id) || [],
        moves.filter((m) => (m.branchId || '') === b), catalogue);
    }
    const movesBy = (b) => moves.filter((m) => (m.branchId || '') === b);
    return { byBranch, products, movesBy };
  }

  /** Batches due within 30 days (or past), at the places in [byBranch]. */
  const soonOf = (byBranch, movesBy, placeName, now = Date.now()) => Object.entries(byBranch)
    .flatMap(([b, list]) => expiring(list, movesBy(b), { now, days: 30 }).map((l) => ({ ...l, place: placeName(b) })))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  /**
   * Last month's closing stock for every place that has stock and was not
   * closed by hand (web/wh/monthend.js writes the same shape). create()
   * never overwrites: a month closed by hand keeps its figures.
   */
  async function closeMonth(wsId, now = Date.now()) {
    const month = monthBefore(monthOf(now));
    const metaRef = wsRef(wsId).collection('meta').doc('notify');
    if ((await metaRef.get()).data()?.closedMonth === month) return 0;
    const { byBranch, products } = await stock(wsId, monthEnd(month));
    const cost = new Map(products.map((p) => [p.barcode, p.costSen ?? 0]));
    let made = 0;
    for (const [b, list] of Object.entries(byBranch)) {
      const c = closingRows(list, (k) => cost.get(k));
      if (!c.lines.length) continue;
      try {
        await wsRef(wsId).collection('stockClosings').doc(`${month}_${b || '-'}`).create({
          month, branchId: b, asOf: monthEnd(month), lines: c.lines, valueSen: c.valueSen, qtyMilli: c.qtyMilli,
          createdByUid: '', createdByName: 'JSOX', createdAt: now,
        });
        made++;
      } catch (err) {
        if (err.code !== 6) throw err; // 6: already exists -- closed by hand
      }
    }
    await metaRef.set({ closedMonth: month }, { merge: true });
    return made;
  }

  /** Only the places this person works at, when they are tied to some. */
  const visible = (byBranch, who) => (who.branchIds.length
    ? Object.fromEntries(Object.entries(byBranch).filter(([b]) => who.branchIds.includes(b)))
    : byBranch);

  const lowsOf = (byBranch, placeName) => Object.entries(byBranch).flatMap(([b, list]) => list.filter(isLow)
    .map((l) => ({ name: l.name || l.barcode, onHand: l.onHand, reorderLevel: l.reorderLevel, place: placeName(b) })));

  // --------------------------------------------------------------- telegram

  async function link(chatId, code, msg, lang) {
    const ref = db.collection('telegramLinks').doc(code);
    const snap = await ref.get();
    const l = snap.data();
    if (!snap.exists || !(l.expiresAt > Date.now())) return telegram(chatId, words(lang).badCode);
    const who = await member(l.workspaceId, l.uid);
    if (!who) return telegram(chatId, words(lang).badCode);
    const co = await company(l.workspaceId);
    await db.collection('telegramChats').doc(chatId).set({
      workspaceId: l.workspaceId, uid: l.uid, name: who.name, chatName: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.chat?.title || '',
      lang, daily: true, linkedAt: Date.now(),
    });
    await ref.delete();
    return telegram(chatId, words(lang).linked(who.name, co.name));
  }

  /** One update from Telegram's webhook; [now] sets "today". */
  async function handleUpdate(update, now = Date.now()) {
    const msg = update?.message || update?.edited_message;
    if (!msg?.text || !msg.chat?.id) return;
    const chatId = String(msg.chat.id);
    const q = parseMessage(msg.text);
    let lang = langOf(msg.from?.language_code);
    if (q.kind === 'link') return link(chatId, q.code, msg, lang);
    const chatSnap = await db.collection('telegramChats').doc(chatId).get();
    if (!chatSnap.exists) return telegram(chatId, words(lang).notLinked);
    const chat = chatSnap.data();
    lang = chat.lang || lang;
    const w = words(lang);
    const who = await member(chat.workspaceId, chat.uid);
    if (!who) {
      await chatSnap.ref.delete();
      return telegram(chatId, w.notLinked);
    }
    const co = await company(chat.workspaceId);
    const mayStock = who.can('RECORD_STOCK_MOVEMENTS') || who.can('POS_MANAGE') || who.can('POS_REPORTS')
      || who.can('VIEW_ALL_HISTORY') || who.can('POS_SELL') || who.can('CREATE_STOCK_CHECK');
    const maySales = who.can('POS_REPORTS');

    const say = (text) => telegram(chatId, text);
    const no = () => say(noRight(lang));
    const ws = wsRef(chat.workspaceId);
    const here = (branchId) => !who.branchIds.length || who.branchIds.includes(branchId || '');

    // Talking, and settings for this chat.
    if (q.kind === 'help') return say(w.help);
    if (q.kind === 'examples') return say(examplesText(lang));
    if (q.kind === 'greet') return say(greetText(who.name, lang));
    if (q.kind === 'thanks') return say(thanksText(lang));
    if (q.kind === 'lang') {
      await chatSnap.ref.set({ lang: q.lang }, { merge: true });
      return telegram(chatId, langText(q.lang));
    }
    if (q.kind === 'dailyOff' || q.kind === 'dailyOn') {
      await chatSnap.ref.set({ daily: q.kind === 'dailyOn' }, { merge: true });
      return say(dailyText(q.kind === 'dailyOn', lang));
    }
    if (q.kind === 'emailTest') {
      if (!who.isAdmin) return say(mailText('admin', '', lang));
      if (!env.MAIL_STUB_URL && !(env.SMTP_USER && env.SMTP_PASS)) return say(mailText('off', '', lang));
      const settings = (await ws.collection('meta').doc('notify').get()).data() || {};
      const to = (settings.emails?.length ? settings.emails : [who.email]).filter(Boolean);
      try {
        const ok = await emailReport(chat.workspaceId, to, lang, now);
        return say(ok ? mailText('sent', to.join(', '), lang) : mailText('fail', 'no address', lang));
      } catch (err) {
        return say(mailText('fail', String(err.message || err).slice(0, 200), lang));
      }
    }
    if (q.kind === 'whoami') {
      const role = who.isAdmin ? '' : (await ws.collection('roles').doc(who.roleId || 'none').get()).data()?.name || who.roleId || '';
      return say(whoamiText({ name: who.name, company: co.name, isAdmin: who.isAdmin, role, places: who.branchIds.map(co.placeName) }, lang));
    }
    if (q.kind === 'branches') {
      const ids = co.branchIds.filter((b) => here(b));
      return say(branchesText(ids.length ? ids.map(co.placeName) : [co.placeName('')], lang));
    }

    if (q.kind === 'po') {
      if (!(who.can('WH_PURCHASE') || who.can('WH_APPROVE') || who.can('RECORD_STOCK_MOVEMENTS'))) return no();
      const pos = (await ws.collection('purchaseOrders').where('status', 'in', OPEN_PO).get())
        .docs.map((d) => ({ ...d.data(), id: d.id }))
        .filter((p) => !p.branchId || here(p.branchId))
        .sort((x, y) => (x.expectedAt || Infinity) - (y.expectedAt || Infinity));
      return say(poText(pos, lang));
    }
    if (q.kind === 'shift') {
      if (!(maySales || who.can('POS_MANAGE'))) return no();
      const open = (await ws.collection('shifts').where('status', '==', 'OPEN').get()).docs.map((d) => d.data())
        .filter((x) => here(x.branchId)).sort((x, y) => x.openedAt - y.openedAt);
      return say(shiftText(open, lang));
    }
    if (q.kind === 'customers') {
      if (!(maySales || who.can('POS_MANAGE'))) return no();
      const [from] = periodRange(q.period || 'today', now);
      return say(customersText((await ws.collection('customers').get()).docs.map((d) => d.data()), { lang, period: q.period || 'today', from }));
    }

    const period = q.period || 'today';
    const [from, to] = periodRange(period, now);
    const span = { lang, period, day: period, start: from, end: to };
    const salesIn = async (a, b) => (await salesBetween(chat.workspaceId, a, b)).filter((x) => here(x.branchId));
    if (['sales', 'profit', 'top', 'staff', 'busy', 'voids', 'tax', 'compare'].includes(q.kind)) {
      if (!maySales) return q.kind === 'sales' ? say(w.noSalesRight) : no();
      if (q.kind === 'compare') {
        const [pFrom, pTo] = previousRange(period, now);
        const [cur, prev] = await Promise.all([salesIn(from, Math.min(to, now + 1)), salesIn(pFrom, pTo)]);
        return say(compareText({ ...summarize(cur), start: from, end: to }, { ...summarize(prev), start: pFrom, end: pTo }, { lang, period }));
      }
      const sales = await salesIn(from, to);
      if (q.kind === 'busy') return say(busyText(sales, span));
      if (q.kind === 'voids') return say(voidsText(sales.filter((x) => x.status === 'VOIDED'), span));
      if (q.kind === 'tax') return say(taxText(sales, span));
      const summary = summarize(sales);
      if (q.kind === 'sales') {
        const product = q.query ? findProducts((await ws.collection('products').get()).docs.map((d) => ({ ...d.data(), barcode: d.id })), q.query)[0] : null;
        if (product) return say(itemSalesText(product, summary.items.find((r) => r.barcode === product.barcode || r.name === product.name), span));
        return say(salesText(summary, span));
      }
      if (q.kind === 'top') return say(topText(summary, span));
      if (q.kind === 'staff') return say(staffText(summary, span));
      const missingCost = sales.filter((x) => x.status !== 'VOIDED')
        .reduce((n, x) => n + (x.lines || []).filter((l) => l.costSen == null).length, 0);
      return say(profitText(summary, { ...span, missingCost }));
    }
    if (!mayStock) return say(['value', 'writeoff', 'receive', 'slow'].includes(q.kind) ? noRight(lang) : w.help);
    if (q.kind === 'writeoff' || q.kind === 'receive') {
      const type = q.kind === 'writeoff' ? 'WRITE_OFF' : 'RECEIVE';
      const moves = (await ws.collection('movements').where('at', '>=', from).where('at', '<', to).get()).docs.map((d) => d.data())
        .filter((m) => m.type === type && here(m.branchId));
      const names = new Map(moves.some((m) => !m.productName)
        ? (await ws.collection('products').get()).docs.map((d) => [d.id, d.data().name]) : []);
      return say(movesText(q.kind, moves, { ...span, nameOf: (b) => names.get(b) }));
    }
    const { byBranch, products, movesBy } = await stock(chat.workspaceId);
    const mine = visible(byBranch, who);
    const catalogue = new Map(products.map((p) => [p.barcode, p]));
    const live = (l) => catalogue.get(l.barcode || l.key)?.active !== false;
    const several = Object.keys(mine).length > 1;
    if (q.kind === 'low') return say(lowText(lowsOf(mine, co.placeName), lang));
    if (q.kind === 'out') {
      return say(outText(Object.entries(mine).flatMap(([b, list]) => list.filter((l) => l.onHand <= 0 && live(l))
        .map((l) => ({ name: l.name || l.barcode || l.key, place: several ? co.placeName(b) : '' }))), lang));
    }
    if (q.kind === 'slow') {
      const sold = new Set((await salesIn(now - 30 * 86_400_000, now + 1)).filter((x) => x.status !== 'VOIDED')
        .flatMap((x) => (x.lines || []).map((l) => l.barcode || l.name)));
      return say(slowText(Object.entries(mine).flatMap(([b, list]) => list
        .filter((l) => l.onHand > 0 && live(l) && !sold.has(l.barcode || l.key) && !sold.has(l.name))
        .map((l) => ({ name: l.name || l.barcode || l.key, onHand: l.onHand, place: several ? co.placeName(b) : '' }))), lang));
    }
    if (q.kind === 'value') {
      if (!(maySales || who.can('POS_MANAGE'))) return no();
      const missing = new Set();
      const places = Object.entries(mine).map(([b, list]) => ({
        place: co.placeName(b),
        sen: list.filter((l) => l.onHand > 0 && live(l)).reduce((n, l) => {
          const cost = catalogue.get(l.barcode || l.key)?.costSen;
          if (cost == null) { missing.add(l.key); return n; }
          return n + Math.round((cost * l.onHand) / 1000);
        }, 0),
      }));
      return say(valueText(places, missing.size, lang));
    }
    if (q.kind === 'report') {
      const summary = summarize(maySales ? await salesIn(from, to) : []);
      return say(reportText({ company: co.name, summary, lows: lowsOf(mine, co.placeName), start: from, lang, showSales: maySales, soon: soonOf(mine, movesBy, co.placeName) }));
    }
    const found = findProducts(products, q.query);
    if (!found.length) return say(q.guess ? dontKnow(q.query, lang) : w.noMatch(q.query));
    if (q.kind === 'price') return say(priceText(found, lang));
    return say(stockText(found, mine, co.placeName, lang));
  }

  /** Points Telegram at this server and publishes the bot's name for the website. */
  async function setupTelegram(selfUrl) {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_SECRET) return { telegram: 'not configured' };
    const hook = await telegramCall('setWebhook', { url: `${selfUrl}/telegram`, secret_token: env.TELEGRAM_SECRET, allowed_updates: ['message', 'edited_message'] });
    const me = await telegramCall('getMe');
    const username = me?.result?.username || '';
    await db.collection('publicConfig').doc('telegram').set({ username, updatedAt: Date.now() });
    return { telegram: hook.ok ? 'ok' : hook.description || 'failed', username };
  }

  /** The browser push key (public) for the website, from WEB_PUSH_VAPID_KEY. */
  async function setupPush() {
    if (!env.WEB_PUSH_VAPID_KEY) return { push: 'not configured' };
    await db.collection('publicConfig').doc('push').set({ vapidKey: env.WEB_PUSH_VAPID_KEY, updatedAt: Date.now() });
    return { push: 'ok' };
  }

  // ------------------------------------------------------------ the morning

  /** Yesterday's report to everyone who asked for it, once a day per company. */
  const mailReport = (to, text) => email(to, text.split('\n')[0].replace(/^📊 /, ''), `${text}\n\n${SITE}/pos/#/cloud`);

  /** Yesterday's report to [to], now: the bot's "发测试邮件". */
  async function emailReport(wsId, to, lang, now = Date.now()) {
    const [from, end] = dayRange(now, 1);
    const co = await company(wsId);
    const { byBranch, movesBy } = await stock(wsId);
    const summary = summarize(await salesBetween(wsId, from, end));
    return mailReport(to, reportText({ company: co.name, summary, lows: lowsOf(byBranch, co.placeName), start: from, lang, soon: soonOf(byBranch, movesBy, co.placeName, now) }));
  }

  async function dailyReports(now = Date.now()) {
    const [from, to] = dayRange(now, 1);
    const day = new Date(from + 8 * 3600_000).toISOString().slice(0, 10);
    const sent = { companies: 0, telegram: 0, email: 0, push: 0, closings: 0 };
    for (const ref of await db.collection('workspaces').listDocuments()) {
      const wsId = ref.id;
      sent.closings += await closeMonth(wsId, now).catch((e) => { console.error('closing', wsId, e.message); return 0; });
      const settingsRef = ref.collection('meta').doc('notify');
      const settings = (await settingsRef.get()).data() || {};
      if (settings.lastDay === day) continue;
      const chats = (await db.collection('telegramChats').where('workspaceId', '==', wsId).get()).docs
        .map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.daily !== false);
      const emails = settings.emailDaily ? (settings.emails || []) : [];
      if (!chats.length && !emails.length && !settings.pushDaily) continue;

      const co = await company(wsId);
      const { byBranch, movesBy } = await stock(wsId);
      const summary = summarize(await salesBetween(wsId, from, to));
      sent.companies++;

      for (const c of chats) {
        const who = await member(wsId, c.uid);
        if (!who) continue;
        const mine = visible(byBranch, who);
        const ok = await telegram(c.id, reportText({
          company: co.name, summary, lows: lowsOf(mine, co.placeName), start: from, lang: c.lang || 'zh', showSales: who.can('POS_REPORTS'),
          soon: soonOf(mine, movesBy, co.placeName, now),
        })).catch(() => false);
        if (ok) sent.telegram++;
      }
      const lows = lowsOf(byBranch, co.placeName);
      if (emails.length) {
        const text = reportText({ company: co.name, summary, lows, start: from, lang: settings.lang || 'zh', soon: soonOf(byBranch, movesBy, co.placeName, now) });
        if (await mailReport(emails, text).catch((e) => { console.error('email', e.message); return false; })) sent.email++;
      }
      if (settings.pushDaily) {
        const owners = [];
        for (const u of (await ref.collection('users').get()).docs) {
          const who = await member(wsId, u.id);
          if (!who || !who.can('POS_REPORTS')) continue;
          for (const t of (await u.ref.collection('pushTokens').get()).docs) owners.push({ wsId, uid: u.id, token: t.id });
        }
        sent.push += await push(owners, reportPush({ summary, lows, lang: settings.lang || 'zh' })).catch((e) => { console.error('push', e.message); return 0; });
      }
      await settingsRef.set({ lastDay: day, lastSentAt: Date.now() }, { merge: true });
    }
    return sent;
  }

  return { handleUpdate, dailyReports, setupTelegram, setupPush, telegram, email, push };
}

/** Constant-time comparison of a shared secret from a header. */
export function sameSecret(given, expected) {
  if (!expected || typeof given !== 'string' || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
