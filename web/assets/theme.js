// Before the page draws: the saved colour theme, so the page never flashes
// the wrong colours. Shared by the website and every SuXin app on this site
// (key: suxin-theme). Light (day) unless dark was chosen, the website and
// every app alike.
(function () {
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem('suxin-theme'); } catch (e) {}
  var theme = saved || 'light';
  if (theme === 'light') root.setAttribute('data-theme', 'light');
  root.classList.add('js');
})();
