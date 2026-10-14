// JSOX site behaviour: theme, menus, product tabs, scroll reveal, counters.
(function () {
  'use strict';

  // Where the buttons go: the apps live on this same site.
  var LINKS = {
    signin: '/app/',         // sign in to every JSOX app
    signup: '/app/#create',  // register a new company (14-day trial)
    android: '/download/',   // the Android apps
  };
  var WHATSAPP = '6589263660';
  var WA_TEXT = { zh: '你好，我想了解 JSOX。', en: 'Hi, I would like to know more about JSOX.', ms: 'Hai, saya ingin tahu lebih lanjut tentang JSOX.' };

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-link]').forEach(function (a) {
    var url = LINKS[a.getAttribute('data-link')];
    if (!url) return;
    a.href = url;
    if (/^https?:/.test(url)) { a.target = '_blank'; a.rel = 'noopener'; }
  });

  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  // Language: 中文 / EN / BM. Swaps text nodes using window.JSOX_I18N; English is the source.
  var I18N = window.JSOX_I18N || { text: {}, patterns: [] };
  var LANG_IDX = { zh: 0, ms: 1 };
  var HTML_LANG = { en: 'en', zh: 'zh-Hans', ms: 'ms' };
  var originals = [];
  var originalTitle = document.title;
  (function collect() {
    var walker = document.createTreeWalker(document.querySelector('.site'), NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue.trim() || n.parentNode.closest('.lang-switch, script, style')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (var n; (n = walker.nextNode());) originals.push([n, n.nodeValue]);
  })();
  function translate(src, lang) {
    if (lang === 'en') return null;
    var key = src.replace(/\s+/g, ' ').trim();
    var hit = I18N.text[key];
    if (hit) return hit[LANG_IDX[lang]];
    for (var i = 0; i < I18N.patterns.length; i++) {
      var pat = I18N.patterns[i];
      if (pat[0].test(key)) return key.replace(pat[0], pat[1][LANG_IDX[lang]]);
    }
    return null;
  }
  function setLang(lang) {
    if (!HTML_LANG[lang]) lang = 'en';
    originals.forEach(function (pair) {
      var src = pair[1], t = translate(src, lang);
      if (t === null) { pair[0].nodeValue = src; return; }
      var lead = src.match(/^\s*/)[0], trail = src.match(/\s*$/)[0];
      pair[0].nodeValue = lead + t + trail;
    });
    // Tab title, e.g. "JSOX POS — Counter checkout for shops… | JSOX"
    document.title = originalTitle.split(/( — | \| )/).map(function (part) {
      return translate(part, lang) || part;
    }).join('');
    root.setAttribute('lang', HTML_LANG[lang]);
    document.querySelectorAll('.lang-switch button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
    });
    try {
      localStorage.setItem('suxin-lang', lang);
      // The apps on this site open in the same language.
      localStorage.setItem('pos.lang', JSON.stringify(lang));
    } catch (e) {}
    document.querySelectorAll('[data-wa]').forEach(function (a) {
      a.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(WA_TEXT[lang] || WA_TEXT.en);
      a.target = '_blank'; a.rel = 'noopener';
    });
  }
  document.querySelectorAll('.lang-switch button').forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
  });
  // Chinese first; else what was chosen here or in the apps.
  var savedLang = 'zh';
  try {
    var appLang = JSON.parse(localStorage.getItem('pos.lang') || 'null');
    savedLang = localStorage.getItem('suxin-lang') || appLang || 'zh';
  } catch (e) {}
  var urlLang = new URLSearchParams(location.search).get('lang'); // e.g. ?lang=zh to share a page in Chinese
  if (urlLang && HTML_LANG[urlLang]) savedLang = urlLang;
  setLang(savedLang);

  // Colour theme (light is the default; theme.js applies the saved choice)
  var themeBtn = document.querySelector('.theme-btn');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var light = root.getAttribute('data-theme') !== 'light';
    if (light) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
    try { localStorage.setItem('suxin-theme', light ? 'light' : 'dark'); } catch (e) {}
  });

  // Products mega menu
  var megaBtn = document.querySelector('.has-mega');
  var mega = document.getElementById('mega');
  function setMega(open) {
    if (!mega) return;
    mega.classList.toggle('is-open', open);
    megaBtn.setAttribute('aria-expanded', String(open));
  }
  if (megaBtn) {
    megaBtn.addEventListener('click', function (e) { e.stopPropagation(); setMega(!mega.classList.contains('is-open')); });
    mega.addEventListener('click', function (e) { if (e.target.closest('a')) setMega(false); });
    document.addEventListener('click', function (e) { if (!e.target.closest('.mega-wrap')) setMega(false); });
  }

  // Mobile drawer
  var burger = document.querySelector('.burger');
  var drawer = document.getElementById('drawer');
  function setDrawer(open) {
    drawer.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  if (burger && drawer) {
    burger.addEventListener('click', function () { setDrawer(!drawer.classList.contains('is-open')); });
    drawer.addEventListener('click', function (e) { if (e.target.closest('a')) setDrawer(false); });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    setMega(false);
    if (drawer && drawer.classList.contains('is-open')) setDrawer(false);
  });

  // Product preview tabs
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { selectTab(tab); });
    tab.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });
  // Product cards jump to their tab
  document.querySelectorAll('[data-tab]').forEach(function (card) {
    card.addEventListener('click', function () {
      var t = document.getElementById('tab-' + card.getAttribute('data-tab'));
      if (t) selectTab(t);
    });
  });

  // Screen carousels on product pages
  document.querySelectorAll('.carousel').forEach(function (car) {
    var track = car.querySelector('.car-track');
    var slides = car.querySelectorAll('.car-slide');
    var dots = car.querySelectorAll('.car-dots button');
    var cur = 0;
    function go(i) {
      cur = (i + slides.length) % slides.length;
      track.style.transform = 'translateX(-' + cur * 100 + '%)';
      slides.forEach(function (s, j) { s.inert = j !== cur; });
      dots.forEach(function (d, j) { d.classList.toggle('on', j === cur); d.setAttribute('aria-current', String(j === cur)); });
    }
    dots.forEach(function (d, j) { d.addEventListener('click', function () { go(j); }); });
    var prev = car.querySelector('.car-prev'), next = car.querySelector('.car-next');
    if (prev) prev.addEventListener('click', function () { go(cur - 1); });
    if (next) next.addEventListener('click', function () { go(cur + 1); });
    car.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') go(cur + 1);
      if (e.key === 'ArrowLeft') go(cur - 1);
    });
  });

  // Count-up numbers
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
    var fmt = function (n) { return n.toLocaleString('en-MY', { minimumFractionDigits: dec, maximumFractionDigits: dec }); };
    if (reduceMotion) { el.textContent = fmt(target); return; }
    var start = null, dur = 1400;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      el.textContent = fmt(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Reveal on scroll
  var reveal = document.querySelectorAll('.rv');
  var counters = document.querySelectorAll('[data-count]');
  if (!('IntersectionObserver' in window)) {
    reveal.forEach(function (el) { el.setAttribute('data-in', ''); });
    counters.forEach(countUp);
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      if (el.hasAttribute('data-count')) countUp(el); else el.setAttribute('data-in', '');
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  reveal.forEach(function (el) { io.observe(el); });
  counters.forEach(function (el) { io.observe(el); });
})();
