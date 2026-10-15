/**
 * The slim bar across the top of every app, telling the company's own
 * admin and staff when their trial or subscription has run out, with a
 * link to pay (the billing platform's /buy page, platform/server.mjs,
 * deployed to Cloud Run by .github/workflows/deploy-firebase.yml).
 *
 * Deliberately soft: nothing here blocks a page or a button. The one real
 * lock is server-side, in firestore.rules (licenceAllowsNewWork()) -- an
 * expired company cannot start the next JSOX Barcode Scan count, but keeps
 * reading, finishing, exporting and selling. This bar is the other half:
 * without it, that refusal was a confusing raw error with no way to pay.
 */
import { h, mount } from './dom.js';
import { addStrings, t } from './i18n.js';
import { session } from './session.js';

addStrings({
  en: { billTrial: 'Free trial: {n} day{s} left.', billTrialToday: 'Free trial ends today.', billTrialOver: 'Your free trial has ended. You can keep working, but cannot start a new count until you subscribe.',
    billLapsed: 'Your subscription has lapsed. You can keep working, but cannot start a new count until you renew.', billSuspended: 'Your subscription is on hold. You can keep working, but cannot start a new count.', billRenew: 'Subscribe' },
  zh: { billTrial: '试用期还有 {n} 天。', billTrialToday: '试用期今天到期。', billTrialOver: '试用期已经过了。其他照样能用，但开不了新的盘点单，订阅后就能开。',
    billLapsed: '订阅已经过期。其他照样能用，但开不了新的盘点单，续费后就能开。', billSuspended: '订阅被暂停了。其他照样能用，但开不了新的盘点单。', billRenew: '去订阅' },
  ms: { billTrial: 'Percubaan percuma: baki {n} hari.', billTrialToday: 'Percubaan percuma tamat hari ini.', billTrialOver: 'Percubaan percuma anda sudah tamat. Semua masih boleh digunakan, tetapi kiraan stok baharu tidak boleh dimulakan sehingga anda melanggan.',
    billLapsed: 'Langganan anda sudah tamat. Semua masih boleh digunakan, tetapi kiraan stok baharu tidak boleh dimulakan sehingga anda perbaharui.', billSuspended: 'Langganan anda digantung. Semua masih boleh digunakan, tetapi kiraan stok baharu tidak boleh dimulakan.', billRenew: 'Langgan' },
});

/** Where the paywall lives: platform/server.mjs's own Cloud Run service. */
export const PLATFORM_URL = 'https://stockcheck-platform-vmhgwx77ha-as.a.run.app';

/** The company's own payment page (platform/server.mjs's GET /buy?company=). */
export const buyUrl = () => `${PLATFORM_URL}/buy?company=${encodeURIComponent(session.joinCode || session.ws || '')}`;

/** Whole days left on the licence; null for one with no expiry (lifetime), or none written yet. */
function daysLeft() {
  const exp = session.licence?.expiresAt;
  if (!exp) return null;
  return Math.ceil((exp - Date.now()) / 86_400_000);
}

/**
 * True while this company may start new work -- mirrors licenceAllowsNewWork()
 * in firestore.rules exactly, so the UI never promises what the server refuses.
 * A workspace with no licence document at all is, by the same rule, allowed.
 */
export function licenceOk() {
  const lic = session.licence;
  if (!lic) return true;
  if (lic.status !== 'ACTIVE') return false;
  return !lic.expiresAt || lic.expiresAt > Date.now();
}

let bar = null;
/** Mounted once, above every app; call again after the licence changes to redraw it. */
export function billingBar() {
  if (!bar) {
    bar = h('div', { id: 'billing-bar', hidden: true });
    document.body.prepend(bar);
  }
  draw();
  return bar;
}

function draw() {
  if (!bar) return;
  const lic = session.licence;
  if (!lic) { bar.hidden = true; return; }
  const left = daysLeft();
  const ok = licenceOk();
  let msg = null;
  let tone = 'warn';
  if (lic.status === 'SUSPENDED') { msg = t('billSuspended'); tone = 'bad'; }
  else if (!ok) { msg = lic.plan === 'TRIAL' ? t('billTrialOver') : t('billLapsed'); tone = 'bad'; }
  else if (lic.plan === 'TRIAL' && left != null && left <= 3) { msg = left <= 0 ? t('billTrialToday') : t('billTrial').replace('{n}', String(left)); tone = 'warn'; }
  if (!msg) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.className = `bill-bar ${tone}`;
  mount(bar, h('span', { class: 'grow' }, msg), h('a', { class: 'btn-link primary', href: buyUrl(), target: '_blank', rel: 'noopener', 'data-act': 'bill-renew' }, t('billRenew')));
}
