/**
 * Shelf and price labels: the item's name, its price in RM, its barcode, and
 * a mark when it carries no SST. Drawn on a canvas at 8 dots a millimetre
 * (a 203 dpi label printer), one label per page, at 30x20 mm or 40x30 mm.
 *
 * labelContent and labelLayout are pure (labels.test.mjs); drawing needs a
 * page.
 */
import { barcodeModules } from './barcode.js';
import { productTaxIds, rm, taxList } from './money.js';

export const LABEL_SIZES = {
  '30x20': { id: '30x20', widthMm: 30, heightMm: 20 },
  '40x30': { id: '40x30', widthMm: 40, heightMm: 30 },
};
export const DOTS_PER_MM = 8;

/** What goes on an item's label. */
export function labelContent(item, settings = {}) {
  const taxes = taxList(settings);
  const taxIds = productTaxIds(item, taxes);
  const exempt = taxes.length > 0 && taxIds.length === 0;
  return {
    name: item.name || item.barcode,
    price: rm(item.priceSen || 0),
    barcode: item.barcode,
    // Only a shop that charges SST has anything to say about it.
    sstFlag: !taxes.length ? '' : exempt ? '* TANPA SST' : settings.pricesIncludeTax === false ? '+ SST' : 'TERMASUK SST',
    exempt,
  };
}

/** Where everything goes on a label of [size], in dots. */
export function labelLayout(size) {
  const w = size.widthMm * DOTS_PER_MM;
  const h = size.heightMm * DOTS_PER_MM;
  const pad = Math.round(w * 0.04);
  const small = size.heightMm <= 20;
  const nameSize = small ? 18 : 22;
  const priceSize = small ? 30 : 42;
  const flagSize = small ? 12 : 15;
  const barTop = Math.round(h * (small ? 0.55 : 0.52));
  const digitSize = small ? 13 : 16;
  return {
    w, h, pad, nameSize, priceSize, flagSize, digitSize,
    nameLines: small ? 1 : 2,
    nameY: pad,
    priceY: pad + nameSize * (small ? 1.05 : 2.1),
    barTop,
    barHeight: h - barTop - digitSize - pad,
  };
}

/** An item's label as a canvas. */
export function generateLabelCanvas(item, labelSizeConfig = LABEL_SIZES['40x30'], settings = {}) {
  const size = typeof labelSizeConfig === 'string' ? LABEL_SIZES[labelSizeConfig] : labelSizeConfig;
  const c = labelContent(item, settings);
  const L = labelLayout(size);
  const canvas = document.createElement('canvas');
  canvas.width = L.w; canvas.height = L.h;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, L.w, L.h);
  g.fillStyle = '#000'; g.textBaseline = 'top';
  const font = (px, weight = 400) => `${weight} ${px}px "Noto Sans SC", "Noto Sans CJK SC", system-ui, sans-serif`;

  // Name: as many lines as fit, the last one cut short with an ellipsis.
  g.font = font(L.nameSize, 600);
  const room = L.w - 2 * L.pad;
  const lines = [];
  let line = '';
  for (const ch of c.name) {
    if (g.measureText(line + ch).width > room) { lines.push(line); line = ch; } else line += ch;
  }
  lines.push(line);
  lines.slice(0, L.nameLines).forEach((text, i) => {
    const last = i === L.nameLines - 1 && lines.length > L.nameLines;
    g.fillText(last ? `${text.slice(0, -1)}…` : text, L.pad, L.nameY + i * L.nameSize * 1.05);
  });

  g.font = font(L.priceSize, 800);
  g.fillText(c.price, L.pad, L.priceY);
  if (c.sstFlag) {
    g.font = font(L.flagSize, 700);
    const fw = g.measureText(c.sstFlag).width;
    g.fillText(c.sstFlag, L.w - L.pad - fw, L.priceY + L.priceSize - L.flagSize);
  }

  // Bars, scaled to whole dots so every bar prints the same width.
  const { modules } = barcodeModules(c.barcode);
  const quiet = 10;
  const unit = Math.max(1, Math.floor((L.w - 2 * L.pad) / (modules.length + 2 * quiet)));
  const left = Math.round((L.w - unit * modules.length) / 2);
  for (let i = 0; i < modules.length; i++) if (modules[i] === '1') g.fillRect(left + i * unit, L.barTop, unit, L.barHeight);
  g.font = font(L.digitSize, 500);
  const dw = g.measureText(c.barcode).width;
  g.fillText(c.barcode, (L.w - dw) / 2, L.barTop + L.barHeight + 1);
  return canvas;
}

/** The page that prints [images] (data URLs), one label per page. */
export function labelPageHtml(images, size) {
  const w = `${size.widthMm}mm`; const h = `${size.heightMm}mm`;
  return `<!doctype html><meta charset="utf-8"><title>Labels</title>
<style>@page{size:${w} ${h};margin:0}html,body{margin:0;padding:0}
img{display:block;width:${w};height:${h};page-break-after:always;break-after:page;image-rendering:pixelated}</style>
${images.map((src) => `<img src="${src}" alt="">`).join('')}`;
}

/**
 * Prints labels for [itemIds] (barcodes) in a new window.
 * [labelFormat]: { size: '30x20' | '40x30', copies, products, settings }.
 */
export function exportLabelBatch(itemIds, labelFormat = {}) {
  const size = LABEL_SIZES[labelFormat.size] || LABEL_SIZES['40x30'];
  const copies = Math.max(1, Math.min(100, Number(labelFormat.copies) || 1));
  const products = labelFormat.products || [];
  const items = itemIds.map((id) => products.find((p) => p.barcode === id)).filter(Boolean);
  const images = items.flatMap((p) => {
    const src = generateLabelCanvas(p, size, labelFormat.settings || {}).toDataURL('image/png');
    return Array(copies).fill(src);
  });
  const win = window.open('', '_blank');
  if (!win) throw new Error('The browser blocked the label window: allow pop-ups for this site');
  win.document.write(labelPageHtml(images, size));
  win.document.close();
  // Printed from here: the site's security policy forbids a script inside
  // the label page itself. The pictures are data, so they are in at once.
  const go = () => setTimeout(() => { try { win.focus?.(); win.print?.(); } catch { /* closed already */ } }, 300);
  if (win.document.readyState === 'complete' || !win.addEventListener) go();
  else win.addEventListener('load', go, { once: true });
  return images.length;
}
