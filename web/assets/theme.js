// Before the page draws: the saved colour theme, so the page never flashes
// the wrong colours. Shared by the website and every SuXin app on this site
// (key: suxin-theme). With nothing saved, a page's own default holds: the
// website is dark (<html data-default-theme="dark">), the apps are light.
(function () {
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem('suxin-theme'); } catch (e) {}
  var theme = saved || root.getAttribute('data-default-theme') || 'light';
  if (theme === 'light') root.setAttribute('data-theme', 'light');
  root.classList.add('js');
})();
