// Before the page draws: the saved colour theme (dark unless light was
// chosen), so the page never flashes the wrong colours. Shared by the
// website and every SuXin app on this site (key: suxin-theme).
try { if (localStorage.getItem('suxin-theme') === 'light') document.documentElement.setAttribute('data-theme', 'light'); } catch (e) {}
document.documentElement.classList.add('js');
