/**
 * Connections (连接): bringing another system's data in -- a friend's POS,
 * someone else's WMS or TMS -- for Every Data, Books, Barcode Scan, the WMS
 * and TMS alike (api/connectors.mjs does the reading and writing).
 *
 *   我们去拿 (PULL)  their API address and key; we fetch every hour, or now
 *   他们送来 (PUSH)  they post to our address with a push key we make
 *
 * Their fields are matched to ours by name (a field map, with the usual
 * names filled in); "Test" fetches without saving and shows what came.
 * The key goes to our server and is never stored where a screen can read
 * it, this one included. Only the owner (admin) sets connections up.
 */
import { collection, db, deleteDoc, doc, getDocs, idToken, setDoc } from './fb.js';
import { confirmBox, dateTime, h, mount, toast } from './dom.js';
import { addStrings, t } from './i18n.js';
import { icon } from './icons.js';
import { session, ws } from './session.js';
import { API_ORIGIN } from './apiorigin.js';

addStrings({
  en: {
    cnF_list: 'List', cnF_id: 'Their id', cnF_receiptNo: 'Receipt no.', cnF_at: 'Date/time', cnF_branch: 'Branch', cnF_total: 'Total', cnF_status: 'Status', cnF_payment: 'Paid by', cnF_lines: 'Items list', 'cnF_line.barcode': 'Item barcode', 'cnF_line.name': 'Item name', 'cnF_line.qty': 'Item qty', 'cnF_line.price': 'Item price', cnF_barcode: 'Barcode', cnF_name: 'Name', cnF_qty: 'Quantity', cnF_price: 'Price', cnF_cost: 'Cost', cnF_category: 'Category', cnF_ref: 'DO no.', cnF_to: 'Customer', cnF_address: 'Address', cnF_plate: 'Lorry plate', cnF_driver: 'Driver', cnF_receivedBy: 'Received by',
    cnTitle: 'Connections', cnLead: 'Bring in data from other systems -- a POS, a WMS, a TMS -- so the figures here include theirs.',
    cnNew: 'New connection', cnNone: 'No connections yet.', cnOwnerOnly: 'Only the owner (admin) sets up connections.',
    cnName: 'Name', cnSystem: 'Their system', cnMode: 'How', cnPull: 'We fetch from their API', cnPush: 'They send to us', cnOn: 'On',
    cnUrl: 'Their API address', cnAuth: 'Key type', cnHeader: 'Header name', cnKey: 'Their API key', cnKeySaved: 'A key is saved. Leave empty to keep it.',
    cnKeyHelp: 'Type the key here yourself. It goes to our server only; nobody can read it back.',
    cnPlace: 'Their data goes to', cnPlaceMap: 'Their branch codes', cnPlaceMapHelp: 'One per line: their code = our branch id (e.g. KL01 = kl).',
    cnMoveStock: 'Their sales take stock down here', cnMoveStockHelp: 'Turn off when their WMS sends the stock itself.',
    cnFeeds: 'What to bring in', cnK_sales: 'Sales', cnK_stock: 'Stock levels', cnK_items: 'Products and prices', cnK_deliveries: 'Deliveries',
    cnPath: 'Path', cnList: 'Where the list is', cnSince: '"Since" parameter', cnUnit: 'Money in', cnFields: 'Their field names',
    cnSave: 'Save', cnSaved: 'Saved', cnTest: 'Test', cnSync: 'Fetch now', cnDelete: 'Delete', cnDeleteQ: 'Delete this connection? What it brought in stays.',
    cnLast: 'Last fetched', cnNever: 'not yet', cnRecords: 'records', cnTesting: 'Asking their system…', cnSyncing: 'Fetching…',
    cnPushUrl: 'Their system sends to', cnPushKey: 'Push key', cnMakeKey: 'Make a push key', cnKeyOnce: 'Copy it now: it is shown only once. Making a new one stops the old one.',
    cnPushHelp: 'POST JSON like { "data": [ ... ] } with the header Authorization: Bearer <push key>. The field names below say which of theirs is which.',
    cnNeedName: 'Give it a name.', cnNeedUrl: 'Fill in their API address.', cnNeedFeed: 'Choose at least one thing to bring in.', cnBack: 'Back', cnCopy: 'Copy', cnCopied: 'Copied',
    cnEdit: 'Settings', cnSample: 'What came (first 3)', cnProblems: 'Skipped',
  },
  zh: {
    cnF_list: '列表', cnF_id: '他们的编号', cnF_receiptNo: '单号', cnF_at: '日期时间', cnF_branch: '分店', cnF_total: '总额', cnF_status: '状态', cnF_payment: '付款方式', cnF_lines: '商品列表', 'cnF_line.barcode': '商品条码', 'cnF_line.name': '商品名', 'cnF_line.qty': '商品数量', 'cnF_line.price': '商品单价', cnF_barcode: '条码', cnF_name: '名字', cnF_qty: '数量', cnF_price: '售价', cnF_cost: '成本', cnF_category: '类别', cnF_ref: '送货单号', cnF_to: '客户', cnF_address: '地址', cnF_plate: '车牌', cnF_driver: '司机', cnF_receivedBy: '签收人',
    cnTitle: '连接', cnLead: '把别的系统的资料拿进来——POS、WMS、TMS——这里的数字就会包括他们的。',
    cnNew: '新增连接', cnNone: '还没有连接。', cnOwnerOnly: '只有老板（管理员）可以设定连接。',
    cnName: '名字', cnSystem: '对方系统', cnMode: '方式', cnPull: '我们去他们的 API 拿', cnPush: '他们送来给我们', cnOn: '开着',
    cnUrl: '他们的 API 网址', cnAuth: '钥匙方式', cnHeader: 'Header 名字', cnKey: '他们的 API 钥匙', cnKeySaved: '已经存了钥匙。留空就不改。',
    cnKeyHelp: '钥匙请自己在这里输入。它只会送到我们的服务器，谁都看不回来。',
    cnPlace: '他们的资料放在', cnPlaceMap: '他们的分店代号', cnPlaceMapHelp: '一行一个：他们的代号 = 我们的分店代号（例如 KL01 = kl）。',
    cnMoveStock: '他们的销售会扣这里的库存', cnMoveStockHelp: '如果他们的 WMS 会直接送库存数，就关掉。',
    cnFeeds: '要拿什么进来', cnK_sales: '销售', cnK_stock: '库存数量', cnK_items: '商品和价钱', cnK_deliveries: '送货',
    cnPath: '路径', cnList: '列表在哪里', cnSince: '「从…开始」参数', cnUnit: '金额单位', cnFields: '他们的字段名字',
    cnSave: '保存', cnSaved: '存好了', cnTest: '测试', cnSync: '现在拿', cnDelete: '删除', cnDeleteQ: '删除这个连接？已经拿进来的资料会留着。',
    cnLast: '上次拿', cnNever: '还没有', cnRecords: '笔', cnTesting: '正在问他们的系统…', cnSyncing: '正在拿…',
    cnPushUrl: '他们的系统送到', cnPushKey: '推送钥匙', cnMakeKey: '生成推送钥匙', cnKeyOnce: '现在就复制：只显示这一次。生成新的，旧的就不能用。',
    cnPushHelp: '用 POST 送 JSON，例如 { "data": [ ... ] }，加 header：Authorization: Bearer <推送钥匙>。下面的字段名字说明他们哪个字段是什么。',
    cnNeedName: '请给它一个名字。', cnNeedUrl: '请填他们的 API 网址。', cnNeedFeed: '至少选一样要拿的。', cnBack: '返回', cnCopy: '复制', cnCopied: '复制了',
    cnEdit: '设定', cnSample: '拿到的（前 3 笔）', cnProblems: '跳过的',
  },
  ms: {
    cnF_list: 'Senarai', cnF_id: 'Id mereka', cnF_receiptNo: 'No. resit', cnF_at: 'Tarikh/masa', cnF_branch: 'Cawangan', cnF_total: 'Jumlah', cnF_status: 'Status', cnF_payment: 'Cara bayar', cnF_lines: 'Senarai barang', 'cnF_line.barcode': 'Kod bar barang', 'cnF_line.name': 'Nama barang', 'cnF_line.qty': 'Kuantiti barang', 'cnF_line.price': 'Harga barang', cnF_barcode: 'Kod bar', cnF_name: 'Nama', cnF_qty: 'Kuantiti', cnF_price: 'Harga', cnF_cost: 'Kos', cnF_category: 'Kategori', cnF_ref: 'No. DO', cnF_to: 'Pelanggan', cnF_address: 'Alamat', cnF_plate: 'No. plat', cnF_driver: 'Pemandu', cnF_receivedBy: 'Diterima oleh',
    cnTitle: 'Sambungan', cnLead: 'Bawa masuk data dari sistem lain -- POS, WMS, TMS -- supaya angka di sini termasuk mereka.',
    cnNew: 'Sambungan baharu', cnNone: 'Belum ada sambungan.', cnOwnerOnly: 'Hanya pemilik (admin) boleh menetapkan sambungan.',
    cnName: 'Nama', cnSystem: 'Sistem mereka', cnMode: 'Cara', cnPull: 'Kami ambil dari API mereka', cnPush: 'Mereka hantar kepada kami', cnOn: 'Hidup',
    cnUrl: 'Alamat API mereka', cnAuth: 'Jenis kunci', cnHeader: 'Nama header', cnKey: 'Kunci API mereka', cnKeySaved: 'Kunci sudah disimpan. Biar kosong untuk kekalkan.',
    cnKeyHelp: 'Taip kunci di sini sendiri. Ia ke pelayan kami sahaja; tiada siapa boleh membacanya semula.',
    cnPlace: 'Data mereka masuk ke', cnPlaceMap: 'Kod cawangan mereka', cnPlaceMapHelp: 'Satu sebaris: kod mereka = id cawangan kami (cth. KL01 = kl).',
    cnMoveStock: 'Jualan mereka mengurangkan stok di sini', cnMoveStockHelp: 'Matikan jika WMS mereka menghantar stok sendiri.',
    cnFeeds: 'Apa dibawa masuk', cnK_sales: 'Jualan', cnK_stock: 'Paras stok', cnK_items: 'Produk dan harga', cnK_deliveries: 'Penghantaran',
    cnPath: 'Laluan', cnList: 'Di mana senarai', cnSince: 'Parameter "sejak"', cnUnit: 'Wang dalam', cnFields: 'Nama medan mereka',
    cnSave: 'Simpan', cnSaved: 'Disimpan', cnTest: 'Uji', cnSync: 'Ambil sekarang', cnDelete: 'Padam', cnDeleteQ: 'Padam sambungan ini? Data yang dibawa masuk kekal.',
    cnLast: 'Terakhir diambil', cnNever: 'belum', cnRecords: 'rekod', cnTesting: 'Bertanya sistem mereka…', cnSyncing: 'Mengambil…',
    cnPushUrl: 'Sistem mereka hantar ke', cnPushKey: 'Kunci tolak', cnMakeKey: 'Buat kunci tolak', cnKeyOnce: 'Salin sekarang: ditunjuk sekali sahaja. Kunci baharu menghentikan yang lama.',
    cnPushHelp: 'POST JSON seperti { "data": [ ... ] } dengan header Authorization: Bearer <kunci tolak>. Nama medan di bawah menyatakan medan mereka.',
    cnNeedName: 'Beri nama.', cnNeedUrl: 'Isi alamat API mereka.', cnNeedFeed: 'Pilih sekurang-kurangnya satu.', cnBack: 'Kembali', cnCopy: 'Salin', cnCopied: 'Disalin',
    cnEdit: 'Tetapan', cnSample: 'Yang diterima (3 pertama)', cnProblems: 'Dilangkau',
  },
});

const KINDS = ['sales', 'stock', 'items', 'deliveries'];
const SYSTEMS = ['POS', 'WMS', 'TMS', 'ACCOUNTING', 'OTHER'];
// The usual field names (api/connectors.mjs PRESETS), shown as placeholders.
const FIELDS = {
  sales: [['list', 'data'], ['id', 'id'], ['receiptNo', 'receipt_no'], ['at', 'created_at'], ['branch', 'store_id'], ['total', 'total'], ['status', 'status'], ['payment', 'payment_method'], ['lines', 'items'], ['line.barcode', 'sku'], ['line.name', 'name'], ['line.qty', 'quantity'], ['line.price', 'price']],
  stock: [['list', 'data'], ['barcode', 'sku'], ['name', 'name'], ['qty', 'quantity'], ['branch', 'location']],
  items: [['list', 'data'], ['barcode', 'sku'], ['name', 'name'], ['price', 'price'], ['cost', 'cost'], ['category', 'category']],
  deliveries: [['list', 'data'], ['id', 'id'], ['ref', 'do_no'], ['to', 'customer'], ['address', 'address'], ['status', 'status'], ['plate', 'plate'], ['driver', 'driver'], ['at', 'date'], ['receivedBy', 'received_by']],
};

/** A call to our server as the signed-in member. */
export async function api(path, body = {}) {
  const res = await fetch(`${API_ORIGIN}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await idToken()}` }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}`);
  return json;
}

const places = () => [{ id: '', name: t('mainShop') }, ...session.branches.filter((b) => b.active !== false).map((b) => ({ id: b.id, name: b.name }))];

/** The connections page; [head] draws the page title the app's own way. */
export function render(main, { head = (title) => h('h1', {}, title) } = {}) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  const list = () => {
    mount(main, head(t('cnTitle'), session.isAdmin ? h('button', { class: 'primary', 'data-act': 'cn-new', onclick: () => edit(null) }, icon('plus', 17), t('cnNew')) : null),
      h('p', { class: 'muted' }, t('cnLead')), box);
    if (!session.isAdmin) mount(box, h('p', { class: 'card muted' }, t('cnOwnerOnly')));
    getDocs(collection(db, ws('connections'))).then((snap) => {
      const all = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      mount(box, all.length ? h('div', { class: 'cn-list' }, all.map(card)) : h('div', { class: 'card cn-empty' }, icon('plug', 34), h('p', {}, t('cnNone'))));
    }).catch((err) => mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`)));
  };

  const card = (c) => {
    const out = h('div', { class: 'cn-out' });
    const run = (what) => async () => {
      mount(out, h('p', { class: 'muted' }, t(what === 'test' ? 'cnTesting' : 'cnSyncing')));
      try { showResult(out, await api(`/app/connections/${c.id}/${what}`), what === 'test'); } catch (err) { mount(out, h('p', { class: 'cn-err' }, err.message)); }
    };
    return h('div', { class: 'card cn-card', 'data-conn': c.id },
      h('div', { class: 'row' }, h('span', { class: 'cn-ic' }, icon('plug', 20)), h('b', { class: 'grow' }, c.name),
        h('span', { class: 'pill' }, c.system || 'OTHER'), h('span', { class: `pill ${c.on === false ? '' : 'good'}` }, c.mode === 'PUSH' ? t('cnPush') : t('cnPull'))),
      h('div', { class: 'muted' }, (c.feeds || []).filter((f) => f.on !== false).map((f) => t(`cnK_${f.kind}`)).join(' · '),
        ` · ${t('cnLast')}: ${c.lastResult?.at ? dateTime(c.lastResult.at) : t('cnNever')}`),
      c.lastResult ? h('div', { class: 'cn-feeds' }, (c.lastResult.feeds || []).map((f) => h('span', { class: `pill ${f.error ? 'bad' : 'good'}` }, `${t(`cnK_${f.kind}`)}: ${f.error || `${f.count} ${t('cnRecords')}`}`))) : null,
      session.isAdmin ? h('div', { class: 'row' },
        h('button', { class: 'ghost', 'data-act': 'cn-edit', onclick: () => edit(c) }, icon('sliders', 16), t('cnEdit')),
        h('span', { class: 'grow' }),
        c.mode !== 'PUSH' ? h('button', { 'data-act': 'cn-test', onclick: run('test') }, t('cnTest')) : null,
        c.mode !== 'PUSH' ? h('button', { class: 'primary', 'data-act': 'cn-sync', onclick: run('sync') }, icon('download', 16), t('cnSync')) : null) : null,
      out);
  };

  const showResult = (out, r, test) => mount(out, (r.feeds || []).map((f) => h('div', { class: 'cn-result' },
    h('b', {}, `${t(`cnK_${f.kind}`)}: `), f.error ? h('span', { class: 'cn-err' }, f.error) : `${f.count} ${t('cnRecords')}`,
    f.problems?.length ? h('div', { class: 'muted' }, `${t('cnProblems')}: ${f.problems.join(', ')}`) : null,
    test && f.sample?.length ? h('details', { open: true }, h('summary', {}, t('cnSample')), h('pre', { class: 'cn-pre' }, JSON.stringify(f.sample, null, 2))) : null,
    test && f.raw ? h('details', {}, h('summary', {}, 'JSON'), h('pre', { class: 'cn-pre' }, f.raw)) : null)));

  const edit = (c) => {
    const isNew = !c;
    const id = c?.id || doc(collection(db, ws('connections'))).id;
    const val = (k, d = '') => c?.[k] ?? d;
    const name = h('input', { value: val('name'), 'data-f': 'cn-name', maxlength: 60 });
    const system = h('select', { 'data-f': 'cn-system' }, SYSTEMS.map((s) => h('option', { value: s, selected: val('system', 'POS') === s }, s)));
    let mode = val('mode', 'PULL');
    const on = h('input', { type: 'checkbox', checked: val('on', true) !== false });
    const url = h('input', { value: val('baseUrl'), placeholder: 'https://api.example.com/v1/', 'data-f': 'cn-url', inputmode: 'url' });
    const auth = h('select', { 'data-f': 'cn-auth' }, [['BEARER', 'Bearer'], ['HEADER', 'Header'], ['BASIC', 'Basic (user:password)']].map(([v, l]) => h('option', { value: v, selected: val('auth', 'BEARER') === v }, l)));
    const header = h('input', { value: val('headerName', 'X-API-Key'), 'data-f': 'cn-header' });
    const key = h('input', { type: 'password', autocomplete: 'off', 'data-f': 'cn-key', placeholder: c?.hasSecret ? '••••••••' : '' });
    const branch = h('select', { 'data-f': 'cn-branch' }, places().map((p) => h('option', { value: p.id, selected: val('branchId') === p.id }, p.name)));
    const branchMap = h('textarea', { rows: 3, 'data-f': 'cn-branchmap', placeholder: 'KL01 = kl' }, Object.entries(val('branchMap', {})).map(([a, b]) => `${a} = ${b}`).join('\n'));
    const moveStock = h('input', { type: 'checkbox', checked: val('moveStock', true) !== false });
    const feeds = Object.fromEntries(KINDS.map((k) => [k, (c?.feeds || []).find((f) => f.kind === k) || { kind: k, on: false, path: k, unit: 'RM', map: {} }]));
    const feedBox = h('div', { class: 'cn-feedbox' });
    const pushBox = h('div');
    const drawFeeds = () => mount(feedBox, KINDS.map((k) => {
      const f = feeds[k];
      const field = (key, ph) => {
        const [a, b] = key.split('.');
        const cur = b ? f.map?.line?.[b] : f.map?.[a];
        return h('label', { class: 'field cn-fieldmap' }, h('span', {}, t(`cnF_${key}`), ' ', h('small', { class: 'muted' }, key)), h('input', { value: cur || '', placeholder: ph, 'data-map': `${k}.${key}`, oninput: (e) => {
          f.map = f.map || {};
          if (b) { f.map.line = { ...(f.map.line || {}) }; if (e.target.value) f.map.line[b] = e.target.value; else delete f.map.line[b]; } else if (e.target.value) f.map[a] = e.target.value; else delete f.map[a];
        } }));
      };
      return h('div', { class: `cn-feed${f.on ? ' on' : ''}`, 'data-feed': k },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!f.on, 'data-act': `cn-feed-${k}`, onchange: (e) => { f.on = e.target.checked; drawFeeds(); drawPush(); } }), h('b', {}, t(`cnK_${k}`))),
        f.on ? h('div', { class: 'cn-feed-body' },
          mode === 'PULL' ? h('div', { class: 'grid2' },
            h('label', { class: 'field' }, t('cnPath'), h('input', { value: f.path || '', placeholder: k, 'data-f': `cn-path-${k}`, oninput: (e) => { f.path = e.target.value.trim(); } })),
            h('label', { class: 'field' }, t('cnSince'), h('input', { value: f.sinceParam || '', placeholder: 'updated_since', oninput: (e) => { f.sinceParam = e.target.value.trim(); } }))) : null,
          ['sales', 'items'].includes(k) ? h('label', { class: 'field' }, t('cnUnit'), h('select', { onchange: (e) => { f.unit = e.target.value; } },
            [['RM', 'RM (12.50)'], ['SEN', 'sen (1250)']].map(([v, l]) => h('option', { value: v, selected: (f.unit || 'RM') === v }, l)))) : null,
          h('details', {}, h('summary', {}, t('cnFields')), h('div', { class: 'cn-fields' }, FIELDS[k].map(([fk, ph]) => field(fk, ph))))) : null);
    }));
    const drawPush = () => {
      if (mode !== 'PUSH') { mount(pushBox); return; }
      const keyOut = h('div');
      mount(pushBox, h('div', { class: 'card cn-push' },
        h('p', { class: 'muted', style: { marginTop: 0 } }, t('cnPushHelp')),
        KINDS.filter((k) => feeds[k].on).map((k) => h('div', { class: 'field' }, `${t('cnPushUrl')} · ${t(`cnK_${k}`)}`, h('code', { class: 'cn-code' }, `POST ${API_ORIGIN}/connect/${session.ws}/${id}/${k}`))),
        h('div', { class: 'row' }, h('span', { class: 'grow' }, c?.hasPushKey ? `${t('cnPushKey')}: ••••••••` : ''),
          h('button', { 'data-act': 'cn-pushkey', onclick: async () => {
            if (isNew && !await save(false)) return;
            try {
              const { key: k } = await api(`/app/connections/${id}/push-key`);
              mount(keyOut, h('p', { class: 'cn-err' }, t('cnKeyOnce')), h('div', { class: 'row' }, h('code', { class: 'cn-code grow', 'data-act': 'cn-pushkey-value' }, k),
                h('button', { onclick: () => navigator.clipboard?.writeText(k).then(() => toast(t('cnCopied'), 'ok')) }, t('cnCopy'))));
            } catch (err) { toast(err.message, 'error'); }
          } }, t('cnMakeKey'))),
        keyOut));
    };
    const pullBox = h('div');
    const drawMode = () => {
      mount(pullBox, mode === 'PULL' ? h('div', { class: 'card cn-pull' },
        h('label', { class: 'field' }, t('cnUrl'), url),
        h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('cnAuth'), auth), h('label', { class: 'field' }, t('cnHeader'), header)),
        h('label', { class: 'field' }, t('cnKey'), key),
        h('p', { class: 'muted', style: { margin: 0, fontSize: '13px' } }, c?.hasSecret ? t('cnKeySaved') : t('cnKeyHelp'))) : null);
      drawFeeds();
      drawPush();
    };
    const modeSeg = h('div', { class: 'seg' }, [['PULL', 'cnPull'], ['PUSH', 'cnPush']].map(([m, l]) => h('button', { type: 'button', class: mode === m ? 'on' : '', 'data-mode': m, onclick: (e) => {
      mode = m; [...modeSeg.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); drawMode();
    } }, t(l))));

    const save = async (leave = true) => {
      if (!name.value.trim()) { toast(t('cnNeedName'), 'error'); return false; }
      if (mode === 'PULL' && !url.value.trim()) { toast(t('cnNeedUrl'), 'error'); return false; }
      const chosen = KINDS.map((k) => feeds[k]).filter((f) => f.on);
      if (!chosen.length) { toast(t('cnNeedFeed'), 'error'); return false; }
      const map = {};
      for (const line of branchMap.value.split('\n')) { const [a, b] = line.split('=').map((x) => x?.trim()); if (a) map[a] = b || ''; }
      const data = {
        name: name.value.trim(), system: system.value, mode, on: on.checked, baseUrl: url.value.trim(), auth: auth.value, headerName: header.value.trim(),
        branchId: branch.value, branchMap: map, moveStock: moveStock.checked,
        feeds: KINDS.map((k) => ({ kind: k, on: !!feeds[k].on, path: feeds[k].path || k, sinceParam: feeds[k].sinceParam || '', unit: feeds[k].unit || 'RM', map: feeds[k].map || {} })),
        hasSecret: !!c?.hasSecret, hasPushKey: !!c?.hasPushKey, updatedAt: Date.now(), createdAt: c?.createdAt || Date.now(),
      };
      try {
        await setDoc(doc(db, ws(`connections/${id}`)), data, { merge: true });
        if (key.value) { await api(`/app/connections/${id}/secret`, { value: key.value }); key.value = ''; data.hasSecret = true; }
        c = { ...(c || {}), ...data, id };
        toast(t('cnSaved'), 'ok');
        if (leave) list();
        return true;
      } catch (err) { toast(err.message || String(err), 'error'); return false; }
    };

    mount(main, head(isNew ? t('cnNew') : c.name),
      h('div', { class: 'card cn-form' },
        h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('cnName'), name), h('label', { class: 'field' }, t('cnSystem'), system)),
        h('div', { class: 'field' }, t('cnMode'), modeSeg),
        h('label', { class: 'check' }, on, t('cnOn'))),
      pullBox,
      h('div', { class: 'card cn-form' },
        h('label', { class: 'field' }, t('cnPlace'), branch),
        h('label', { class: 'field' }, t('cnPlaceMap'), branchMap, h('small', { class: 'muted' }, t('cnPlaceMapHelp'))),
        h('label', { class: 'check' }, moveStock, t('cnMoveStock')), h('small', { class: 'muted' }, t('cnMoveStockHelp'))),
      h('h2', {}, t('cnFeeds')), feedBox, pushBox,
      h('div', { class: 'wh-bar cn-bar' },
        h('button', { onclick: list }, t('cnBack')),
        !isNew ? h('button', { class: 'danger', 'data-act': 'cn-delete', onclick: async () => {
          if (!await confirmBox(t('cnDeleteQ'), t('cnDelete'), t('cancel'))) return;
          try { await api(`/app/connections/${id}/secret`, { value: '' }).catch(() => {}); await deleteDoc(doc(db, ws(`connections/${id}`))); list(); } catch (err) { toast(err.message, 'error'); }
        } }, icon('trash', 16)) : null,
        h('span', { class: 'grow' }),
        h('button', { class: 'primary', 'data-act': 'cn-save', onclick: () => save(true) }, icon('check', 17), t('cnSave'))));
    drawMode();
  };

  list();
  return null;
}
