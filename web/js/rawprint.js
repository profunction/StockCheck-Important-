/**
 * Printing straight to a receipt printer -- no print box, and the cash
 * drawer opens. Chrome and Edge reach a USB printer through WebUSB, or one
 * that shows up as a COM port (USB-serial, Bluetooth-serial) through Web
 * Serial. The shop picks the printer once in Settings -> Receipt; after
 * that the browser remembers it.
 *
 * Without one, the till prints through the browser as before (receipt.js);
 * the drawer then opens only if the printer's own driver is set to open it.
 */
import { buildPrintJob, columnsFor, generateCashDrawerBuffer, receiptLines, shiftLines } from './escpos.js';
import { session } from './session.js';
import { local } from './dom.js';

let target = null; // { kind: 'usb', device, endpoint } | { kind: 'serial', port }

export const directSupported = () => Boolean(navigator.usb || navigator.serial);
export const directReady = () => Boolean(target);
export const directName = () => (target?.kind === 'usb' ? (target.device.productName || 'USB printer') : target ? 'Serial printer' : '');

async function openUsb(device) {
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  for (const iface of device.configuration.interfaces) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk');
      if (out) {
        await device.claimInterface(iface.interfaceNumber);
        return { kind: 'usb', device, endpoint: out.endpointNumber };
      }
    }
  }
  throw new Error('No printer output found on this USB device');
}

async function openSerial(port) {
  if (!port.writable) await port.open({ baudRate: Number(session.settings.printerBaud) || 9600 });
  return { kind: 'serial', port };
}

/** Asks the browser for a printer (a click must start this). */
export async function choosePrinter(kind = 'usb') {
  if (kind === 'usb') {
    if (!navigator.usb) throw new Error('This browser has no WebUSB: use Chrome or Edge');
    target = await openUsb(await navigator.usb.requestDevice({ filters: [{ classCode: 7 }] }).catch(() => navigator.usb.requestDevice({ filters: [] })));
  } else {
    if (!navigator.serial) throw new Error('This browser has no Web Serial: use Chrome or Edge');
    target = await openSerial(await navigator.serial.requestPort());
  }
  return directName();
}

/** Reconnects to a printer chosen before, without asking. */
export async function reconnect() {
  // Which printer is about this computer, not the company: kept on it.
  if (target || local.get('pos.printer', 'browser') !== 'direct') return directReady();
  try {
    const [usb] = navigator.usb ? await navigator.usb.getDevices() : [];
    if (usb) target = await openUsb(usb);
    else {
      const [port] = navigator.serial ? await navigator.serial.getPorts() : [];
      if (port) target = await openSerial(port);
    }
  } catch { target = null; }
  return directReady();
}

export async function forget() {
  try {
    if (target?.kind === 'usb') await target.device.close();
    if (target?.kind === 'serial') await target.port.close();
  } catch { /* already gone */ }
  target = null;
}

/** Sends [bytes] to the printer. */
export async function send(bytes) {
  if (!target) throw new Error('No printer connected');
  if (target.kind === 'usb') {
    // Printers take a few KB at a time.
    for (let i = 0; i < bytes.length; i += 4096) await target.device.transferOut(target.endpoint, bytes.slice(i, i + 4096));
  } else {
    const writer = target.port.writable.getWriter();
    try { await writer.write(bytes); } finally { writer.releaseLock(); }
  }
}

/**
 * The lines drawn as a picture, black and white, [px] wide: the printer's
 * own font has no Chinese, the screen's does.
 */
export function linesToBits(lines, px) {
  const cols = px <= 384 ? 32 : 48;
  const cell = px / cols;
  const lh = Math.round(cell * 2.1);
  const big = lh * 2;
  const height = lines.reduce((h, l) => h + (l.big ? big : lh), 8);
  const canvas = document.createElement('canvas');
  canvas.width = px; canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, px, height);
  g.fillStyle = '#000'; g.textBaseline = 'top';
  let y = 4;
  for (const l of lines) {
    const size = l.big ? cell * 3.4 : cell * 1.7;
    g.font = `${l.bold || l.big ? 700 : 400} ${size}px "Noto Sans Mono CJK SC", "Noto Sans SC", monospace`;
    const w = g.measureText(l.text).width;
    const x = l.align === 'center' ? (px - w) / 2 : l.align === 'right' ? px - w : 0;
    g.fillText(l.text, Math.max(0, x), y);
    y += l.big ? big : lh;
  }
  const data = g.getImageData(0, 0, px, height).data;
  const bits = new Uint8Array(px * height);
  for (let i = 0; i < bits.length; i++) bits[i] = data[i * 4] < 140 ? 1 : 0;
  return { bits, width: px };
}

const nonAscii = (lines) => lines.some((l) => /[^\x20-\x7e]/.test(l.text));

/** Prints a sale (or a shift slip) straight to the printer; opens the drawer when asked. */
export async function printDirect(data, { kind = 'receipt', openDrawer = false } = {}) {
  const s = session.settings;
  const paperWidth = Number(s.paperWidth) || 80;
  const width = columnsFor(paperWidth);
  const lines = kind === 'shift' ? shiftLines(data, { width, settings: s }) : receiptLines(data, { width, settings: s });
  const raster = nonAscii(lines) ? linesToBits(lines, paperWidth === 58 ? 384 : 576) : null;
  await send(buildPrintJob(data, { paperWidth, openDrawer, settings: s, kind, raster }));
}

export async function openDrawer() {
  await send(generateCashDrawerBuffer());
}
