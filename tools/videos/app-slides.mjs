/**
 * The JEXO Count phone app's guide videos: illustrated step cards (number,
 * picture, what to do) rather than screen recordings -- the Android app
 * cannot be filmed in this environment, and a mock-up passed off as the
 * real screen would mislead.
 */
const ICON = {
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M17 8v8"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  nfc: '<path d="M6 8a6 6 0 0 1 0 8"/><path d="M10 5a10 10 0 0 1 0 14"/><path d="M14 2.5a14 14 0 0 1 0 19"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  file: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  sync: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M20 4v5h-5M4 20v-5h5"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 11.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L22 7H6"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
  shield: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  store: '<path d="M3 9l2-5h14l2 5"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8"/>',
  log: '<path d="M6 2h12v20H6z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
};

export const APP_FILMS = [
  {
    name: 'app-1-count',
    title: ['手机盘点', 'JEXO Count app · 盘点', 'Counting stock with the phone'],
    slides: [
      ['list', '开始一次盘点', '打开 app →「盘点」→ 新盘点，选模板和区域（例如：冷房、货架 7）', 'Stock tab → new count; pick a template and an area'],
      ['scan', '扫条码', '用手机镜头扫商品条码，输入数到多少', 'Scan the barcode with the camera, enter how many'],
      ['mic', '用说的也可以', '按麦克风说「五个鸡蛋」，数量自动填好', 'Or say it: “five eggs”'],
      ['nfc', 'NFC 标签', '贴了 NFC 标签的货架或商品，手机靠近就加', 'NFC tags: hold the phone near'],
      ['check', '完成盘点', '按完成，马上看到哪样短少、哪样多出', 'Finish: see what is short or over at once'],
      ['file', '导出和打印', '在「历史」导出 Excel、CSV，或打印', 'Export Excel or CSV, or print, from History'],
    ],
  },
  {
    name: 'app-2-stock',
    title: ['库存和进出货', 'JEXO Count app · 库存', 'Stock levels, goods in and out'],
    slides: [
      ['box', '「库存」页', '每样商品现在有多少 = 最后一次盘点 + 之后进出', 'On hand = last count + goods in and out since'],
      ['file', '导入进货和销售', '用 Excel / CSV 导入，系统自动认出每一栏', 'Import Excel or CSV; columns are recognised'],
      ['sync', '连接 Loyverse', '贴上 Loyverse 令牌，商品、库存、销售自动同步', 'Paste a Loyverse token: items, stock and sales sync'],
      ['cart', '连接 JEXO POS', '收银卖出，手机上的库存马上减少', 'A sale at the till takes it off the phone’s stock'],
      ['bell', '补货提醒', '设补货点，低于就显示「要补货」', 'Set a reorder point; it says when to buy'],
      ['check', '写回 Loyverse', '盘点后，可以把正确数量写回 Loyverse（要先确认）', 'After a count, write correct figures back to Loyverse'],
    ],
  },
  {
    name: 'app-3-team',
    title: ['员工、分店和权限', 'JEXO Count app · 团队', 'Staff, branches and permissions'],
    slides: [
      ['user', '注册公司', '第一个注册的人就是管理员，自动有 14 天试用', 'The first to register is the admin, with a 14-day trial'],
      ['key', '员工加入', '把公司代码告诉员工，他们注册时填就加入', 'Staff join with the company code'],
      ['shield', '角色和权限', '谁能盘点、谁能看全部、谁能改库存，一项项设', 'Choose who may count, see everything, change stock'],
      ['store', '分店和仓库', '每间分店、每个仓库的库存分开算', 'Each branch and warehouse keeps its own stock'],
      ['log', '操作记录', '每一次修改都记下来，谁、什么时候、改了什么', 'Every change is logged: who, when, what'],
    ],
  },
  {
    name: 'app-4-loyverse',
    title: ['连接 Loyverse', 'JEXO Count app · Loyverse 同步', 'Syncing with Loyverse POS'],
    slides: [
      ['key', '拿令牌', 'Loyverse 后台 → 设定 → 访问令牌 → 新增，复制', 'Loyverse back office → Settings → Access tokens → add, copy'],
      ['sync', '贴进 app', 'app →「我的」→ Loyverse → 贴上令牌，按连接', 'App → Profile → Loyverse → paste the token, connect'],
      ['box', '商品同步', '有条码的用条码，没有的用 SKU；售价和成本一起拿', 'Items come by barcode, or SKU if none, with price and cost'],
      ['cart', '销售同步', 'Loyverse 卖出的，库存自动减少', 'Loyverse sales take stock off automatically'],
      ['check', '写回 Loyverse', '盘点后可以把正确数量写回 Loyverse（要先确认）', 'After a count, write correct figures back (you confirm first)'],
    ],
  },
  {
    name: 'app-5-account',
    title: ['注册和忘记密码', 'JEXO Count app · 账号', 'Accounts on the phone app'],
    slides: [
      ['store', '注册公司', '老板选「注册公司」，填公司名和公司代码', 'Owner: Create company, with its name and code'],
      ['user', '加入公司', '员工选「加入公司」，填老板给的公司代码', 'Staff: Join company with the owner’s code'],
      ['key', '忘记密码', '填 email 和公司代码，重设链接寄到 email', 'Forgot it: email and company code, a reset link is emailed'],
      ['shield', '同一个账号', '同一个账号可以用 app、收银、仓库和网页版盘点', 'One account for the app, till, warehouse and web Count'],
    ],
  },
];

/** When slide [i] (from 0) comes up: after the 3 s title, 4.2 s each. */
export const SLIDE_AT = (i) => 3000 + 4200 * i;

export function slidesHtml(film) {
  const [t1, t2, t3] = film.title;
  const svg = (name, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;
  const slides = film.slides.map(([icon, title, zh, en], i) => `
    <section class="slide" data-i="${i + 1}">
      <div class="text">
        <div class="step">${i + 1} / ${film.slides.length}</div>
        <h2>${title}</h2>
        <p class="zh">${zh}</p>
        <p class="en">${en}</p>
      </div>
      <div class="phone"><div class="screen"><div class="badge">${svg(icon, 92)}</div>
        <div class="bars"><i></i><i></i><i class="short"></i></div></div></div>
    </section>`).join('');
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:#0f1a14;font-family:"Noto Sans CJK SC","Noto Sans SC",system-ui,sans-serif;overflow:hidden}
    .title,.slide{position:absolute;inset:0;display:grid;opacity:0;transition:opacity .6s}
    .title{place-items:center;text-align:center;color:#fff;background:linear-gradient(135deg,#0b1b2b,#12385a 70%,#0f4c4a)}
    .title h1{font-size:56px;margin:0}.title p{font-size:26px;margin:14px 0 0;opacity:.9}.title em{display:block;font:500 20px system-ui;font-style:normal;opacity:.7;margin-top:8px}
    .slide{grid-template-columns:1.15fr .85fr;align-items:center;gap:40px;padding:0 80px;background:#f3f6f2}
    .on{opacity:1}
    .step{display:inline-block;background:#0f766e;color:#fff;font-weight:800;font-size:20px;border-radius:99px;padding:6px 16px}
    h2{font-size:48px;margin:22px 0 14px;color:#17201a}
    .zh{font-size:30px;line-height:1.45;color:#2d3a31;margin:0}
    .en{font-size:20px;color:#5d6a61;margin:16px 0 0;font-family:system-ui,sans-serif}
    .phone{justify-self:center;width:250px;height:500px;border-radius:40px;background:#17201a;padding:14px;box-shadow:0 30px 60px rgba(0,0,0,.25);transform:translateY(20px);transition:transform .8s}
    .on .phone{transform:none}
    .screen{height:100%;border-radius:28px;background:#fff;display:grid;align-content:center;justify-items:center;gap:30px}
    .badge{width:150px;height:150px;border-radius:40px;background:#ccf0ea;color:#0f4c4a;display:grid;place-items:center;transform:scale(.7);transition:transform .7s .2s}
    .on .badge{transform:scale(1)}
    .bars{display:grid;gap:10px;width:70%}.bars i{display:block;height:12px;border-radius:6px;background:#e7ece6}.bars i.short{width:60%}
  </style>
  <div class="title on"><div><h1>${t1}</h1><p>${t2}</p><em>${t3}</em></div></div>${slides}
  <script>
    const parts=[...document.querySelectorAll('.title,.slide')];
    let i=0;
    const next=()=>{parts[i].classList.remove('on');i++;if(i>=parts.length){window.__slidesDone=true;return;}parts[i].classList.add('on');setTimeout(next,i===0?3000:4200);};
    setTimeout(next,3000);
  </script>`;
}
