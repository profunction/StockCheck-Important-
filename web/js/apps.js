/**
 * The JEXO apps a company can open -- JEXO Count, JEXO POS, JEXO Cloud and
 * JEXO Warehouse -- for the app centre (/app/) and the switcher every app
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
 * centre and JEXO Count on the web).
 */
import { auth, initFirebase, onAuthStateChanged, signInWithEmailAndPassword, signOut } from './fb.js';
import { h, mount } from './dom.js';
import { addStrings, getLang, LANGS, setLang, t } from './i18n.js';
import { icon } from './icons.js';
import { endSession, loadSession, session } from './session.js';
import { checkForm, createCompany, joinCompany, resetPassword, signupError } from './signup.js';

addStrings({
  en: {
    appCentre: 'JEXO apps', appSwitch: 'Switch app', appDownload: 'Android apps', appAll: 'All apps', appOpen: 'Open',
    appLocked: 'Not in your plan', appBuy: 'See plans', appDenied: 'Ask your admin for access',
    appCentreLead: 'One sign-in for everything. Open what your plan includes; the rest can be added any time.',
    appPlan: 'Your plan', appNoPlan: 'Trial / no plan yet', appAddMore: 'Add more',
    app_count: 'Count stock by scanning, on a phone or a computer.',
    app_pos: 'Sell at the counter: retail, supermarket or restaurant.',
    app_cloud: 'For the owner: today’s sales, stock, reports and staff.',
    app_warehouse: 'Goods in and out, transfers, purchase orders, online purchases.',
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
    appCentre: 'JEXO 应用', appSwitch: '切换应用', appDownload: '下载 Android app', appAll: '全部应用', appOpen: '打开',
    appLocked: '你的配套没有包括', appBuy: '看配套', appDenied: '没有权限，请问管理员',
    appCentreLead: '一个账号用全部。配套包括的就能打开；没有的，随时可以增加。',
    appPlan: '你的配套', appNoPlan: '试用 / 还没有配套', appAddMore: '增加功能',
    app_count: '扫码盘点，用手机或电脑都可以。',
    app_pos: '柜台收银：店面零售、超市或餐饮。',
    app_cloud: '老板用：今天的销售、库存、报表和员工。',
    app_warehouse: '进货出货、调货、采购单、网购进货。',
    suNoAccount: '还没有账号？', suJoin: '加入公司', suCreate: '开新公司', suName: '你的名字', suPassword2: '再输入一次密码', suCompany: '公司名字',
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
    appCentre: 'Aplikasi JEXO', appSwitch: 'Tukar aplikasi', appDownload: 'Aplikasi Android', appAll: 'Semua aplikasi', appOpen: 'Buka',
    appLocked: 'Tiada dalam pelan anda', appBuy: 'Lihat pelan', appDenied: 'Minta akses daripada admin',
    appCentreLead: 'Satu log masuk untuk semua. Buka apa yang ada dalam pelan; yang lain boleh ditambah bila-bila masa.',
    appPlan: 'Pelan anda', appNoPlan: 'Percubaan / belum ada pelan', appAddMore: 'Tambah fungsi',
    app_count: 'Kira stok dengan imbasan, di telefon atau komputer.',
    app_pos: 'Jual di kaunter: runcit, pasar raya atau restoran.',
    app_cloud: 'Untuk pemilik: jualan hari ini, stok, laporan dan pekerja.',
    app_warehouse: 'Barang masuk dan keluar, pindahan, pesanan belian, belian dalam talian.',
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
  { id: 'count', module: 'count', name: 'JEXO Count', href: '/count/', icon: 'barcode', color: '#0F4C4A',
    perms: ['CREATE_STOCK_CHECK', 'SCAN_BARCODE', 'VIEW_OWN_HISTORY', 'VIEW_ALL_HISTORY'] },
  { id: 'pos', module: 'pos', name: 'JEXO POS', href: '/pos/#/pos', icon: 'cart', color: '#0B1B2B',
    perms: ['POS_SELL', 'POS_MANAGE', 'POS_REPORTS'] },
  { id: 'cloud', module: null, name: 'JEXO Cloud', href: '/pos/#/cloud', icon: 'chart', color: '#0f766e',
    perms: ['POS_REPORTS', 'POS_MANAGE', 'RECORD_STOCK_MOVEMENTS', 'WH_PURCHASE', 'WH_APPROVE'] },
  { id: 'warehouse', module: 'warehouse', name: 'JEXO Warehouse', href: '/warehouse/', icon: 'box', color: '#12385A',
    perms: ['RECORD_STOCK_MOVEMENTS', 'WH_PURCHASE', 'WH_APPROVE', 'POS_MANAGE', 'VIEW_ALL_HISTORY'] },
];

/** 'open', 'locked' (the plan does not include it) or 'denied' (no permission). */
export function appState(who, app) {
  if (app.module && !who.has(app.module)) return 'locked';
  if (who.isAdmin || app.perms.some((p) => who.can(p))) return 'open';
  return 'denied';
}

/** The switcher in an app's sidebar: every app, the locked ones marked. */
export function appSwitcher(currentId) {
  const current = APPS.find((a) => a.id === currentId);
  return h('details', { class: 'appswitch' },
    h('summary', {}, icon('apps', 17), h('span', { class: 'grow' }, t('appSwitch')), current ? h('b', {}, current.name.replace('JEXO ', '')) : null),
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
      h('button', { type: 'button', class: 'ghost', 'data-tab': 'reset', onclick: () => { mode = 'reset'; draw(); } }, t('forgotPassword'))));
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
