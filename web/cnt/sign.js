/**
 * A box to sign in with a finger, a pen or the mouse. Strokes are kept in
 * the app's form (counting.js encodeInk), so a signature made here shows on
 * the phone and the other way round.
 */
import { h } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { decodeInk, encodeInk } from '../js/counting.js';

/** A signature pad; onChange(ink) after every stroke and on clear. */
export function signaturePad(ink, { enabled = true, onChange }) {
  let strokes = decodeInk(ink);
  const canvas = h('canvas', { class: 'sigpad', width: 600, height: 200, 'aria-label': t('cSign') });
  const ctx = canvas.getContext('2d');
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(canvas).color || '#12141d';
    for (const s of strokes) {
      ctx.beginPath();
      s.forEach((p, i) => (i ? ctx.lineTo(p.x * canvas.width, p.y * canvas.height) : ctx.moveTo(p.x * canvas.width, p.y * canvas.height)));
      if (s.length === 1) ctx.lineTo(s[0].x * canvas.width + 0.5, s[0].y * canvas.height);
      ctx.stroke();
    }
  };
  let current = null;
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  if (enabled) {
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* the stroke still draws inside the box */ }
      current = [at(e)];
      strokes.push(current);
      draw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!current) return;
      const p = at(e);
      const last = current[current.length - 1];
      // Thinned as the app thins it: a point every few thousandths is enough.
      if ((p.x - last.x) ** 2 + (p.y - last.y) ** 2 >= 0.004 ** 2) { current.push(p); draw(); }
    });
    const end = () => { if (!current) return; current = null; onChange(encodeInk(strokes)); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }
  requestAnimationFrame(draw);
  return h('div', { class: 'sigwrap' }, canvas,
    enabled ? h('button', { type: 'button', class: 'ghost', onclick: () => { strokes = []; draw(); onChange(''); } }, t('cSignClear')) : null);
}
