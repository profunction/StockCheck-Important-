/**
 * Sample items with pictures, for a new shop to try the till before typing
 * in its own -- and for the guide videos. Every one is marked demo: true so
 * it can be removed again in one go, and its barcode is in the in-store
 * range (starting 2), which no real product carries.
 */
import { ean13Check } from './money.js';

const code = (n) => { const twelve = `290900000${String(n).padStart(3, '0')}`; return twelve + ean13Check(twelve); };

export const DEMO_CATEGORIES = [
  { id: 'demo-drinks', name: 'Minuman 饮料', color: '#4fa3d9' },
  { id: 'demo-grocery', name: 'Barang runcit 杂货', color: '#e3a03c' },
  { id: 'demo-food', name: 'Makanan 熟食', color: '#d9653b' },
];

/** [name, picture, price sen, cost sen, category, extra] */
const ROWS = [
  ['Malt Drink 1kg 麦芽饮料', 'malt', 1590, 1250, 'demo-drinks', {}],
  ['Beras 5kg 白米', 'rice', 1690, 1450, 'demo-grocery', { taxIds: [] }],
  ['Gula 1kg 白糖', 'sugar', 299, 260, 'demo-grocery', { taxIds: [] }],
  ['Telur 10 鸡蛋', 'eggs', 650, 520, 'demo-grocery', { taxIds: [] }],
  ['Roti 面包', 'bread', 380, 290, 'demo-grocery', {}],
  ['Air Mineral 1.5L 矿泉水', 'water', 180, 110, 'demo-drinks', {}],
  ['Mi Segera 5 速食面', 'noodle', 550, 420, 'demo-grocery', {}],
  ['Kopi 500g 咖啡粉', 'coffee', 1290, 980, 'demo-grocery', {}],
  ['Susu Pekat 炼奶', 'milk', 420, 330, 'demo-grocery', {}],
  ['Nasi Lemak 椰浆饭', 'nasilemak', 600, 250, 'demo-food', { trackStock: false }],
  ['Teh Tarik 拉茶', 'tehtarik', 250, 80, 'demo-drinks', { trackStock: false }],
  ['Roti Canai 印度煎饼', 'roticanai', 180, 60, 'demo-food', { trackStock: false }],
  ['Mee Goreng 炒面', 'meegoreng', 750, 300, 'demo-food', { trackStock: false }],
];

export const DEMO_ITEMS = ROWS.map(([name, pic, priceSen, costSen, category, extra], i) => ({
  barcode: code(i + 1),
  name, unit: 'pcs', priceSen, costSen, category, photoUrl: `/img/demo/${pic}.svg`,
  active: true, trackStock: true, altBarcodes: [], modifierIds: [], demo: true, ...extra,
}));
