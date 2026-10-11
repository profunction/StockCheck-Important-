/**
 * The SuXin apps a company can open -- SuXin Barcode Scan, SuXin POS, SuXin Every Data and
 * SuXin WMS -- for the app centre (/app/) and the switcher every app
 * carries in its sidebar. All four share one sign-in, one company and one
 * stock, so switching is just opening another page.
 *
 * Whether an app opens is the module registry's answer (modules.js): the
 * company's plan includes it AND the person holds a permission it needs.
 * An app the plan does not include is shown locked, with what to buy, so a
 * customer sees what they could add instead of it silently missing. The
 * database rules hold the same line; this only decides what is shown.
 *
 * Also the sign-in screen and start-up shared by the newer apps (the app
 * centre and SuXin Barcode Scan on the web).
 */
import { auth, initFirebase, onAuthStateChanged, signInWithEmailAndPassword, signInWithGoogle, signOut } from './fb.js';
import { h, mount } from './dom.js';
import { addStrings, getLang, LANGS, setLang, t } from './i18n.js';
import { icon } from './icons.js';
import { endSession, loadSession, session } from './session.js';
import { checkForm, createCompany, joinCompany, resetPassword, signupError } from './signup.js';

addStrings({
  en: {
    appCentre: 'SuXin apps', themeLight: 'Light mode', themeDark: 'Dark mode',
    gSignIn: 'Sign in with Google', gSignUp: 'Sign up with Google (no password)', gOr: 'or',
    gStep: 'Signed in with Google as {email}. One more step: join your company with its code, or register a new company.',
    gOther: 'Use another account',
    errGoogleExists: 'This email already has a SuXin password. Sign in with the password, then open Profile and press "Link Google". After that Google works too.',
    errGoogleOff: 'Google sign-in is not switched on yet. Use your email and password for now.',
    errGoogleTaken: 'That Google account already belongs to another SuXin user.', appSwitch: 'Switch app', appDownload: 'Android apps', appAll: 'All apps', appOpen: 'Open',
    appLocked: 'Not in your plan', appBuy: 'See plans', appDenied: 'Ask your admin for access',
    appCentreLead: 'One sign-in for everything. Open what your plan includes; the rest can be added any time.',
    appPlan: 'Your plan', appNoPlan: 'Trial / no plan yet', appAddMore: 'Add more',
    app_count: 'Count stock by scanning, on a phone or a computer.',
    app_pos: 'Sell at the counter: retail, supermarket or restaurant.',
    app_cloud: 'For the owner: today’s sales, stock, reports and staff.',
    brandTagline: 'One Business. Connected.',
    app_warehouse: 'Goods in and out, transfers, purchase orders, Pinduoduo purchases, cost calculator.',
    app_books: 'e-Invoices for MyInvois, bookkeeping, profit and loss, who owes what.',
    app_tms: 'Lorries, drivers clocking in, delivery trips and signed proof of delivery.',
    suNoAccount: 'No account yet?', suJoin: 'Join company', suCreate: 'New company', suName: 'Your name', suPassword2: 'Password again', suCompany: 'Company name',
    suCode: 'Company code', suCodeNew: 'Choose a company code (4+ letters or numbers, e.g. KEDAIMAJU)',
    suJoinBtn: 'Join company', suCreateBtn: 'Create company and start the 14-day trial',
    suJoinHelp: 'Your boss gives you the company code. You join as staff; the boss can give you more access later.',
    suCreateHelp: 'For the owner: set up your company. You become its admin; staff then join with your company code.',
    suSendReset: 'Send reset email', suResetHelp: 'Enter your email and your company code. We send a link to that email to choose a new password.',
    suResetSent: 'Sent. Open the email and choose a new password:',
    suErrEmail: 'Enter a valid email address.', suErrPassword: 'Use at least 6 characters for the password.', suErrPassword2: 'The two passwords are not the same.',
    suErrCompany: 'Enter the company name.', suErrCode: 'Enter the company code.', suErrCodeNew: 'The company code needs at least 4 letters or numbers.',
    suErrCodeTaken: 'That company code is already used. Choose another.', suErrCodeUnknown: 'That company code was not found. Check it with your boss.',
    suErrTaken: 'This email already has an account. Sign in, or use Forgot password.',
  },
  zh: {
    appCentre: 'SuXin 应用', themeLight: '白天模式', themeDark: '夜间模式',
    gSignIn: '用 Google 登录', gSignUp: '用 Google 注册（不用设密码）', gOr: '或',
    gStep: '已用 Google 登录：{email}。还差一步：用公司代码加入你的公司，或注册新公司。',
    gOther: '换一个账号',
    errGoogleExists: '这个 email 已经设了 SuXin 密码。请先用密码登录，再到「我的 Profile」按「绑定 Google」，之后就可以用 Google 登录。',
    errGoogleOff: 'Google 登录还没开通，请先用 email 和密码登录。',
    errGoogleTaken: '这个 Google 账号已经是另一个 SuXin 用户的。', appSwitch: '切换应用', appDownload: '下载 Android app', appAll: '全部应用', appOpen: '打开',
    appLocked: '你的配套没有包括', appBuy: '看配套', appDenied: '没有权限，请问管理员',
    appCentreLead: '一个账号用全部。配套包括的就能打开；没有的，随时可以增加。',
    appPlan: '你的配套', appNoPlan: '试用 / 还没有配套', appAddMore: '增加功能',
    app_count: '扫码盘点，用手机或电脑都可以。',
    app_pos: '柜台收银：店面零售、超市或餐饮。',
    app_cloud: '老板用：今天的销售、库存、报表和员工。',
    brandTagline: '一盘生意，一套系统。',
    app_warehouse: '进货出货、调货、采购单、拼多多进货、成本计算。',
    app_books: 'MyInvois 电子发票、记账、损益表、应收应付。',
    app_tms: '货车、司机打卡、送货行程、客户签收单。',
    suNoAccount: '还没有账号？', suJoin: '加入公司', suCreate: '注册新公司', suName: '你的名字', suPassword2: '再输入一次密码', suCompany: '公司名字',
    suCode: '公司代码', suCodeNew: '设一个公司代码（4 个字母或数字以上，例如 KEDAIMAJU）',
    suJoinBtn: '加入公司', suCreateBtn: '开公司，开始 14 天免费试用',
    suJoinHelp: '公司代码由老板给你。你会以员工身份加入，老板之后可以给你更多权限。',
    suCreateHelp: '老板用：开你的公司。你会是管理员；员工之后用你的公司代码加入。',
    suSendReset: '寄重设密码邮件', suResetHelp: '填你的 email 和公司代码，我们会寄一个链接到这个 email，让你设新密码。',
    suResetSent: '已寄出。请打开邮件设新密码：',
    suErrEmail: '请填正确的 email。', suErrPassword: '密码至少要 6 个字。', suErrPassword2: '两次输入的密码不一样。',
    suErrCompany: '请填公司名字。', suErrCode: '请填公司代码。', suErrCodeNew: '公司代码至少要 4 个字母或数字。',
    suErrCodeTaken: '这个公司代码已经有人用了，请换一个。', suErrCodeUnknown: '找不到这个公司代码，请向老板确认。',
    suErrTaken: '这个 email 已经有账号了。请直接登录，或按「忘记密码」。',
  },
  ms: {
    appCentre: 'Aplikasi SuXin', themeLight: 'Mod cerah', themeDark: 'Mod gelap',
    gSignIn: 'Log masuk dengan Google', gSignUp: 'Daftar dengan Google (tanpa kata laluan)', gOr: 'atau',
    gStep: 'Log masuk dengan Google sebagai {email}. Satu langkah lagi: sertai syarikat anda dengan kodnya, atau daftar syarikat baharu.',
    gOther: 'Guna akaun lain',
    errGoogleExists: 'E-mel ini sudah ada kata laluan SuXin. Log masuk dengan kata laluan, kemudian buka Profil dan tekan "Pautkan Google". Selepas itu Google juga boleh.',
    errGoogleOff: 'Log masuk Google belum dihidupkan. Guna e-mel dan kata laluan dahulu.',
    errGoogleTaken: 'Akaun Google itu sudah milik pengguna SuXin lain.', appSwitch: 'Tukar aplikasi', appDownload: 'Aplikasi Android', appAll: 'Semua aplikasi', appOpen: 'Buka',
    appLocked: 'Tiada dalam pelan anda', appBuy: 'Lihat pelan', appDenied: 'Minta akses daripada admin',
    appCentreLead: 'Satu log masuk untuk semua. Buka apa yang ada dalam pelan; yang lain boleh ditambah bila-bila masa.',
    appPlan: 'Pelan anda', appNoPlan: 'Percubaan / belum ada pelan', appAddMore: 'Tambah fungsi',
    app_count: 'Kira stok dengan imbasan, di telefon atau komputer.',
    app_pos: 'Jual di kaunter: runcit, pasar raya atau restoran.',
    app_cloud: 'Untuk pemilik: jualan hari ini, stok, laporan dan pekerja.',
    brandTagline: 'Satu Perniagaan. Semua Bersambung.',
    app_warehouse: 'Barang masuk dan keluar, pindahan, pesanan belian, belian Pinduoduo, kalkulator kos.',
    app_books: 'e-Invois MyInvois, simpan kira, untung rugi, siapa berhutang.',
    app_tms: 'Lori, pemandu daftar masuk, perjalanan penghantaran dan bukti hantar bertandatangan.',
    suNoAccount: 'Belum ada akaun?', suJoin: 'Sertai syarikat', suCreate: 'Syarikat baharu', suName: 'Nama anda', suPassword2: 'Kata laluan sekali lagi', suCompany: 'Nama syarikat',
    suCode: 'Kod syarikat', suCodeNew: 'Pilih kod syarikat (4+ huruf atau nombor, cth. KEDAIMAJU)',
    suJoinBtn: 'Sertai syarikat', suCreateBtn: 'Buka syarikat dan mula percubaan 14 hari',
    suJoinHelp: 'Bos anda beri kod syarikat. Anda sertai sebagai pekerja; bos boleh beri lebih akses kemudian.',
    suCreateHelp: 'Untuk pemilik: buka syarikat anda. Anda jadi admin; pekerja kemudian sertai dengan kod syarikat anda.',
    suSendReset: 'Hantar e-mel tetapan semula', suResetHelp: 'Masukkan e-mel dan kod syarikat anda. Kami hantar pautan ke e-mel itu untuk pilih kata laluan baharu.',
    suResetSent: 'Dihantar. Buka e-mel dan pilih kata laluan baharu:',
    suErrEmail: 'Masukkan e-mel yang betul.', suErrPassword: 'Kata laluan sekurang-kurangnya 6 aksara.', suErrPassword2: 'Dua kata laluan tidak sama.',
    suErrCompany: 'Masukkan nama syarikat.', suErrCode: 'Masukkan kod syarikat.', suErrCodeNew: 'Kod syarikat perlu sekurang-kurangnya 4 huruf atau nombor.',
    suErrCodeTaken: 'Kod syarikat itu sudah digunakan. Pilih yang lain.', suErrCodeUnknown: 'Kod syarikat itu tidak dijumpai. Semak dengan bos anda.',
    suErrTaken: 'E-mel ini sudah ada akaun. Log masuk, atau guna Lupa kata laluan.',
  },
});

/**
 * module: the registry id the plan must include (null: every plan).
 * perms: any one of these lets someone in (an admin always may).
 */
export const APPS = [
  { id: 'count', module: 'count', name: 'SuXin Barcode Scan', href: '/count/', icon: 'barcode', color: '#0F4C4A',
    perms: ['CREATE_STOCK_CHECK', 'SCAN_BARCODE', 'VIEW_OWN_HISTORY', 'VIEW_ALL_HISTORY'] },
  { id: 'pos', module: 'pos', name: 'SuXin POS', href: '/pos/#/pos', icon: 'cart', color: '#0B1B2B',
    perms: ['POS_SELL', 'POS_MANAGE', 'POS_REPORTS'] },
  { id: 'cloud', module: null, name: 'SuXin Every Data', href: '/data/', icon: 'chart', color: '#0f766e',
    perms: ['POS_REPORTS', 'POS_MANAGE', 'RECORD_STOCK_MOVEMENTS', 'WH_PURCHASE', 'WH_APPROVE'] },
  { id: 'warehouse', module: 'warehouse', name: 'SuXin WMS', href: '/warehouse/', icon: 'box', color: '#12385A',
    perms: ['RECORD_STOCK_MOVEMENTS', 'WH_PURCHASE', 'WH_APPROVE', 'POS_MANAGE', 'VIEW_ALL_HISTORY'] },
  // The lorries come with the warehouse: same module, same people.
  { id: 'tms', module: 'warehouse', name: 'SuXin TMS', href: '/tms/', icon: 'truck', color: '#7A4A12',
    perms: ['RECORD_STOCK_MOVEMENTS', 'WH_APPROVE', 'POS_MANAGE'] },
  { id: 'books', module: 'accounting', name: 'SuXin Books', href: '/books/', icon: 'book', color: '#3B2F7A',
    perms: ['BOOKS_VIEW', 'BOOKS_POST', 'BOOKS_ADMIN'] },
];

/** 'open', 'locked' (the plan does not include it) or 'denied' (no permission). */
export function appState(who, app) {
  if (app.module && !who.has(app.module)) return 'locked';
  if (who.isAdmin || app.perms.some((p) => who.can(p))) return 'open';
  return 'denied';
}

const SUN = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7" stroke-linecap="round"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 14.2A8.4 8.4 0 1 1 9.8 4a6.9 6.9 0 0 0 10.2 10.2Z" stroke-linejoin="round"/></svg>';

/**
 * Dark (the default) or light, for every SuXin app and the website: stored
 * as suxin-theme, applied before the page draws by /assets/theme.js.
 */
export function themeToggle() {
  const icon = (svg) => { const s = h('span', { class: 'ic' }); s.innerHTML = svg; return s; };
  return h('button', {
    type: 'button', class: 'theme-toggle', 'data-act': 'theme',
    onclick: () => {
      const light = document.documentElement.getAttribute('data-theme') !== 'light';
      if (light) document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme');
      try { localStorage.setItem('suxin-theme', light ? 'light' : 'dark'); } catch { /* remembered or not, it switched */ }
    },
  }, h('span', { class: 'when-dark' }, icon(SUN), t('themeLight')), h('span', { class: 'when-light' }, icon(MOON), t('themeDark')));
}

/** The switcher in an app's sidebar: every app, the locked ones marked. */
export function appSwitcher(currentId) {
  const current = APPS.find((a) => a.id === currentId);
  return h('details', { class: 'appswitch' },
    h('summary', {}, icon('apps', 17), h('span', { class: 'grow' }, t('appSwitch')), current ? h('b', {}, current.name.replace('SuXin ', '')) : null),
    h('div', { class: 'appswitch-list' },
      APPS.map((a) => {
        const state = appState(session, a);
        const here = a.id === currentId;
        return state === 'open'
          ? h('a', { href: a.href, class: here ? 'on' : '', 'data-app': a.id }, icon(a.icon, 17), a.name)
          : h('a', { href: '/app/', class: 'locked', 'data-app': a.id, title: t(state === 'locked' ? 'appLocked' : 'appDenied') },
            icon('lock', 17), a.name);
      }),
      h('a', { href: '/app/', class: 'all' }, icon('apps', 17), t('appAll'))));
}

// --------------------------------------------------- sign-in and start-up

export function langPicker() {
  return h('select', { 'aria-label': 'Language', onchange: (e) => { setLang(e.target.value); location.reload(); } },
    LANGS.map(([code, name]) => h('option', { value: code, selected: code === getLang() }, name)));
}

function friendlyAuthError(err) {
  const code = err?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return t('errWrongPassword');
  if (code.includes('too-many-requests')) return t('errTooMany');
  if (code.includes('network')) return t('errNetwork');
  return err?.message || String(err);
}

let registering = false;

const G_LOGO = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

/** "Sign in with Google": a new account comes back to the "one more step" form. */
function googleButton(label, error) {
  const logo = h('span', { class: 'ic' });
  logo.innerHTML = G_LOGO;
  return h('button', {
    type: 'button', class: 'google-btn', 'data-act': 'google',
    onclick: async (e) => {
      const b = e.currentTarget;
      b.disabled = true; error.textContent = '';
      try {
        await signInWithGoogle();
      } catch (err) {
        // Closing Google's window is not an error.
        if (!/popup-closed|cancelled-popup/.test(err?.code || '')) error.textContent = signupError(err);
      } finally { b.disabled = false; }
    },
  }, logo, label);
}

/**
 * The sign-in screen, branded for one app, with registering and the
 * forgotten password beside it: #signin, #join, #create or #reset in the
 * address opens that tab (the POS and the warehouse link here for them).
 */
export function signInScreen(app, brand, message = '', tab = '') {
  const { name, logo, tagline, features = [], foot = '' } = brand;
  const want = tab || location.hash.replace(/^#\/?/, '');
  let mode = ['join', 'create', 'reset'].includes(want) ? want : 'signin';
  const box = h('div', { style: { display: 'grid', gap: '14px' } });
  const tabs = h('div', { class: 'seg auth-tabs' });

  const field = (label, attrs) => {
    const input = h('input', { required: true, ...attrs });
    return [input, h('label', { class: 'field' }, label, input)];
  };

  const draw = (note = '', tone = 'danger') => {
    mount(tabs, [['signin', 'signIn'], ['join', 'suJoin'], ['create', 'suCreate']].map(([id, key]) =>
      h('button', { type: 'button', class: mode === id ? 'on' : '', 'data-tab': id, onclick: () => { mode = id; draw(); } }, t(key))));
    const error = h('p', { class: 'muted auth-note', style: { color: tone === 'ok' ? 'var(--good, #0f766e)' : 'var(--danger)', margin: 0 } }, note);
    const submit = h('button', { class: 'primary', type: 'submit' });
    const busy = (on) => { submit.disabled = on; };
    if (mode === 'signin') {
      const [email, emailF] = field(t('email'), { type: 'email', autocomplete: 'username', autofocus: true });
      const [password, passF] = field(t('password'), { type: 'password', autocomplete: 'current-password' });
      submit.textContent = t('signIn');
      mount(box, h('form', {
        onsubmit: async (e) => {
          e.preventDefault(); busy(true); error.textContent = '';
          try { await signInWithEmailAndPassword(auth, email.value.trim(), password.value); } catch (err) { error.textContent = friendlyAuthError(err); busy(false); }
        },
      }, h('p', { class: 'muted', style: { margin: 0 } }, t('signInHint')), emailF, passF, error, submit,
      h('button', { type: 'button', class: 'ghost', 'data-tab': 'reset', onclick: () => { mode = 'reset'; draw(); } }, t('forgotPassword')),
      h('div', { class: 'or-line' }, h('span', {}, t('gOr'))),
      googleButton(t('gSignIn'), error)));
      return;
    }
    if (mode === 'reset') {
      const [email, emailF] = field(t('email'), { type: 'email', autocomplete: 'username', autofocus: true });
      const [code, codeF] = field(t('suCode'), { autocapitalize: 'characters', autocomplete: 'off' });
      submit.textContent = t('suSendReset');
      mount(box, h('form', {
        onsubmit: async (e) => {
          e.preventDefault(); busy(true);
          try {
            await resetPassword({ email: email.value, code: code.value });
            draw(`${t('suResetSent')} ${email.value.trim()}`, 'ok');
          } catch (err) { error.textContent = signupError(err); busy(false); }
        },
      }, h('h3', { style: { margin: 0 } }, t('forgotPassword')), h('p', { class: 'muted', style: { margin: 0 } }, t('suResetHelp')),
      emailF, codeF, error, submit,
      h('button', { type: 'button', class: 'ghost', onclick: () => { mode = 'signin'; draw(); } }, `← ${t('signIn')}`)));
      return;
    }
    const creating = mode === 'create';
    const [person, personF] = field(t('suName'), { autocomplete: 'name', autofocus: true });
    const [email, emailF] = field(t('email'), { type: 'email', autocomplete: 'username' });
    const [password, passF] = field(t('password'), { type: 'password', autocomplete: 'new-password', minlength: 6 });
    const [password2, pass2F] = field(t('suPassword2'), { type: 'password', autocomplete: 'new-password' });
    const [company, companyF] = field(t('suCompany'), { autocomplete: 'organization' });
    const [code, codeF] = field(creating ? t('suCodeNew') : t('suCode'), { autocapitalize: 'characters', autocomplete: 'off' });
    submit.textContent = creating ? t('suCreateBtn') : t('suJoinBtn');
    mount(box, h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        const form = { name: person.value, email: email.value, password: password.value, password2: password2.value, code: code.value, companyName: company.value };
        const wrong = checkForm(form, mode);
        if (wrong) { error.textContent = wrong; return; }
        busy(true); error.textContent = '';
        registering = true;
        try {
          if (creating) await createCompany(form); else await joinCompany(form);
          registering = false;
          onUser?.(auth.currentUser);
        } catch (err) {
          registering = false;
          error.textContent = signupError(err);
          busy(false);
        }
      },
    }, h('p', { class: 'muted', style: { margin: 0 } }, creating ? t('suCreateHelp') : t('suJoinHelp')),
    googleButton(t('gSignUp'), error), h('div', { class: 'or-line' }, h('span', {}, t('gOr'))),
    personF, emailF, passF, pass2F, creating ? companyF : null, codeF, error, submit));
  };
  draw(message);

  const brandmark = (size) => h('div', { class: 'brandmark' }, h('img', { src: logo, alt: '', width: size, height: size }), name);
  const side = brandmark(36);
  side.style.color = '#fff';
  mount(app, h('div', { class: 'signin-split' },
    h('section', { class: 'signin-brand' },
      side,
      h('div', { style: { display: 'grid', gap: '22px' } },
        h('h1', {}, tagline),
        features.length ? h('ul', {}, features.map(([ic, text]) => h('li', {}, icon(ic, 18), text))) : null),
      h('div', { class: 'foot' }, foot)),
    h('section', { class: 'signin-form signin' },
      h('div', { class: 'auth-card' }, brandmark(40), tabs, box, langPicker()))));
}

/**
 * A Google account with no company yet: join one with its code, or register
 * a new one -- the same two ways as with a password, without the password.
 */
function googleFinishScreen(app, brand, user, message = '') {
  signInScreen(app, brand, '', 'signin');
  const card = app.querySelector('.auth-card');
  let creating = /create/.test(location.hash);
  const box = h('div', { style: { display: 'grid', gap: '14px' } });
  const tabs = h('div', { class: 'seg auth-tabs' });
  const draw = (note = message) => {
    mount(tabs, [['join', 'suJoin'], ['create', 'suCreate']].map(([id, key]) =>
      h('button', { type: 'button', class: (id === 'create') === creating ? 'on' : '', 'data-tab': id, onclick: () => { creating = id === 'create'; draw(''); } }, t(key))));
    const field = (label, attrs) => { const input = h('input', { required: true, ...attrs }); return [input, h('label', { class: 'field' }, label, input)]; };
    const [person, personF] = field(t('suName'), { autocomplete: 'name', value: user.displayName || '' });
    const [company, companyF] = field(t('suCompany'), { autocomplete: 'organization' });
    const [code, codeF] = field(creating ? t('suCodeNew') : t('suCode'), { autocapitalize: 'characters', autocomplete: 'off', autofocus: true });
    const error = h('p', { class: 'muted auth-note', style: { color: 'var(--danger)', margin: 0 } }, note);
    const submit = h('button', { class: 'primary', type: 'submit', 'data-act': 'google-finish' }, creating ? t('suCreateBtn') : t('suJoinBtn'));
    mount(box, h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        const form = { name: person.value, code: code.value, companyName: company.value, user };
        const wrong = checkForm(form, creating ? 'create' : 'join', { google: true });
        if (wrong) { error.textContent = wrong; return; }
        submit.disabled = true; error.textContent = '';
        try {
          if (creating) await createCompany(form); else await joinCompany(form);
          onUser?.(user);
        } catch (err) {
          error.textContent = signupError(err);
          submit.disabled = false;
        }
      },
    }, h('p', { class: 'muted', style: { margin: 0 } }, t('gStep').replace('{email}', user.email || '')),
    personF, creating ? companyF : null, codeF, error, submit,
    h('button', { type: 'button', class: 'ghost', 'data-act': 'google-other', onclick: () => signOut(auth) }, t('gOther'))));
  };
  draw();
  mount(card, card.querySelector('.brandmark'), tabs, box, langPicker());
}

const isGoogle = (user) => (user?.providerData || []).some((p) => p.providerId === 'google.com');

let onUser = null;

/**
 * Starts an app: Firebase, then the sign-in screen or the signed-in app.
 * [render] draws the app once the session is loaded; [brand] is for
 * signInScreen. While a registration is being written the account already
 * exists but has no company yet, so the sign-in that Firebase reports at
 * once waits until the registration is done.
 */
export function startApp(app, brand, render, { stop = () => {} } = {}) {
  const handle = async (user) => {
    stop();
    endSession();
    if (!user) return signInScreen(app, brand);
    mount(app, h('div', { class: 'signin' }, h('p', { class: 'muted' }, t('loading'))));
    try {
      await loadSession(user);
      if (location.hash.match(/^#\/?(signin|join|create|reset)$/)) history.replaceState(null, '', location.pathname);
      render();
    } catch (err) {
      // Signed in with Google for the first time: finish registering instead.
      if (err?.code === 'no-company' && isGoogle(user)) return googleFinishScreen(app, brand, user);
      await signOut(auth);
      signInScreen(app, brand, err.message || String(err), 'signin');
    }
  };
  onUser = handle;
  (async () => {
    try {
      await initFirebase();
    } catch (err) {
      mount(app, h('div', { class: 'signin' }, h('div', { class: 'card' }, String(err.message || err))));
      return;
    }
    onAuthStateChanged(auth, (user) => { if (!registering) handle(user); });
  })();
}

export const signOutNow = () => signOut(auth);
