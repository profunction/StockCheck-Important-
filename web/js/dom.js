/** Small helpers for building the page without a framework. */

/**
 * h('button', { class: 'primary', onclick: go }, 'Pay')
 * Attributes starting with "on" become listeners; null/false children are skipped.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'value') el.value = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

let toastTimer;
/** A message at the bottom that goes away on its own. */
export function toast(message, tone = 'info') {
  let box = document.getElementById('toast');
  if (!box) {
    box = h('div', { id: 'toast' });
    document.body.append(box);
  }
  box.className = `toast ${tone} show`;
  box.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), tone === 'error' ? 6000 : 3000);
}

/**
 * A dialog over the page. [build] gets a close() and returns the content.
 * Escape closes it; returns close() for the caller too.
 */
export function modal(build, { wide = false, onClose } = {}) {
  const backdrop = h('div', { class: 'backdrop' });
  const box = h('div', { class: `dialog${wide ? ' wide' : ''}`, role: 'dialog' });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  mount(box, build(close));
  backdrop.append(box);
  document.body.append(backdrop);
  box.querySelector('[autofocus]')?.focus();
  return close;
}

/**
 * Yes/no question; resolves true on yes. The yes button is red by default --
 * most questions guard a delete or a cancel; pass tone 'primary' for one
 * that only confirms (goods arrived, dispatch now).
 */
export function confirmBox(message, yes, no, { tone = 'danger' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    modal((close) => [
      h('p', { class: 'confirm-text' }, message),
      h('div', { class: 'actions' },
        h('button', { onclick: () => close() }, no),
        h('button', { class: tone, autofocus: true, onclick: () => { answered = true; close(); } }, yes)),
    ], { onClose: () => resolve(answered) });
  });
}

/** Today's date as yyyy-mm-dd in the computer's own time zone. */
export function isoDay(date = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

export function dateTime(ms) {
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Local storage that never throws (private windows, blocked storage). */
export const local = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Remembering is a convenience; the till works without it.
    }
  },
};

/** Saves [data] (text, bytes or a Blob) as a file called [name]. */
export function download(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob(Array.isArray(data) ? data : [data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
