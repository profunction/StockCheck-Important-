// The page everyone who is asked to pay actually lands on: GET /buy in
// server.mjs. Pulled out as a pure function (no Express, no Stripe) so it
// can be rendered and checked on its own (buyPage.test.mjs) and previewed
// without a server.
//
// In the JSOX brand: navy #0B1B2B, teal #14B8A6 / mint #2DD4BF, the same
// mark every app's icon uses (web/brand/suxin-mark.svg). Chinese first --
// every JSOX product is -- with the plan names (Starter, Business...) left
// as they are, the way a product name usually stays.
import { PLANS, TERMS, priceSen, ringgit } from './plans.mjs';

const MODULE_LABEL = { app: '手机盘点 App', pos: 'POS 收银', warehouse: '仓库', api: 'API', books: '账本 Books', data: 'Every Data' };
const TERM_LABEL = { monthly: '月付', yearly: '年付', lifetime: '买断' };
/** The plan a company outgrowing Starter is nudged towards. */
const RECOMMENDED = 'BUSINESS';

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function validPlanTerm(plan, term) {
  return Boolean(PLANS[plan]) && Boolean(TERMS[term]) && plan !== 'TRIAL' && PLANS[plan][TERMS[term].field] != null;
}

/** One plan's card: its summary, then a priced row per term it is sold for. */
function planCard(id) {
  const p = PLANS[id];
  const bits = [p.seats >= 1e9 ? '账号不限' : `最多 ${p.seats} 个账号`];
  if (p.modules.pos && p.tills < 1e9) bits.push(`${p.tills} 台收银机`);
  bits.push(...Object.entries(p.modules).filter(([, on]) => on).map(([m]) => MODULE_LABEL[m] || m));
  if (p.multiBranch) bits.push('多分店');
  if (p.loyverse) bits.push('Loyverse 同步');

  const rows = Object.keys(TERMS).filter((term) => validPlanTerm(id, term)).map((term) => {
    const sen = priceSen(id, term);
    const recurring = TERMS[term].recurring;
    const methods = [{ route: 'checkout', method: 'card', label: '💳 信用卡 / Google Pay', cls: 'pay-main' }];
    if (recurring) {
      methods.push({ route: 'toyyibpay', label: '🏦 FPX 网银（预付，不自动续）', cls: '' });
    } else {
      methods.push(
        { route: 'checkout', method: 'fpx', label: '🏦 FPX 网银', cls: '' },
        { route: 'checkout', method: 'grabpay', label: '🟩 GrabPay', cls: '' },
        { route: 'toyyibpay', label: '🏦 ToyyibPay（FPX / 电子钱包）', cls: '' },
      );
    }
    return `<div class="term">
      <div class="term-head"><b>${TERM_LABEL[term] || TERMS[term].label}</b><span class="price">${ringgit(sen)}</span></div>
      ${recurring ? '<p class="note">信用卡会每期自动扣款续订；FPX 是预付一次，不会自动续。</p>' : ''}
      <div class="buttons">${methods.map((m) => `<button class="${m.cls}" data-plan="${id}" data-term="${term}" data-route="${m.route}"${m.method ? ` data-method="${m.method}"` : ''}>${m.label}</button>`).join('')}</div>
    </div>`;
  }).join('');

  return `<section class="plan${id === RECOMMENDED ? ' pop' : ''}">
    ${id === RECOMMENDED ? '<span class="badge">推荐</span>' : ''}
    <h2>${esc(p.label)}${p.pack === 'STANDALONE' ? ' <small>单一应用</small>' : ''}</h2>
    <p class="bits">${bits.join(' · ')}</p>
    ${rows}
  </section>`;
}

/**
 * The full page. [company] the join code typed into the link (may be
 * empty); [known] whether it resolved to a real workspace; [bank] either
 * null or { name, account, holder, supportEmail } for the manual-transfer
 * section.
 */
/** The same chrome (mark, navy/teal), for /paid and /cancelled -- one line of news, nothing to decide. */
export function simplePage(title, body) {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} — JSOX</title>
<style>
 :root { color-scheme: light; }
 body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: "PingFang SC", "Microsoft YaHei", Inter, system-ui, sans-serif; background: #f4f7f8; color: #0b1b2b; }
 .card { text-align: center; padding: 36px 28px; max-width: 360px; }
 .mark { width: 44px; height: 44px; border-radius: 12px; background: #0b1b2b; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; }
 .mark svg { width: 26px; height: 26px; }
 h1 { font-size: 1.2rem; margin: 0 0 8px; }
 p { color: #5b6b7a; margin: 0; line-height: 1.6; }
</style></head><body>
<div class="card"><span class="mark"><svg viewBox="0 0 64 64"><path d="M40 18V37C40 48 26 50 22 42" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round"/><circle cx="40" cy="18" r="6.2" fill="#2dd4bf"/><circle cx="22" cy="42" r="6.2" fill="#2dd4bf"/></svg></span>
<h1>${esc(title)}</h1><p>${esc(body)}</p></div>
</body></html>`;
}

export function renderBuyPage({ company = '', known = false, bank = null } = {}) {
  const allInOne = Object.keys(PLANS).filter((id) => PLANS[id].pack === 'ALL_IN_ONE' && id !== 'TRIAL').map(planCard).join('');
  const standalone = Object.keys(PLANS).filter((id) => PLANS[id].pack === 'STANDALONE').map(planCard).join('');

  const bankSection = bank?.name ? `<section class="bank">
    <h2>银行转账</h2>
    <p>转账后把收据发到 <b>${esc(bank.supportEmail || '')}</b>，附上公司代码 <b class="code">${esc(company || '你的公司代码')}</b>。一般当天就会开通。</p>
    <dl><dt>银行</dt><dd>${esc(bank.name)}</dd><dt>账户</dt><dd>${esc(bank.account || '')}</dd><dt>户名</dt><dd>${esc(bank.holder || '')}</dd></dl>
  </section>` : '';

  return `<!doctype html>
<html lang="zh"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>JSOX 订阅</title>
<style>
 :root { color-scheme: light; --navy: #0b1b2b; --teal: #14b8a6; --mint: #2dd4bf; --ink: #0b1b2b; --muted: #5b6b7a; --line: #e4e9ee; --bg: #f4f7f8; --card: #ffffff; --bad: #b3261e; --bad-bg: #fbe9e7; }
 * { box-sizing: border-box; }
 body { margin: 0; font-family: "PingFang SC", "Microsoft YaHei", Inter, system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); line-height: 1.55; }
 .wrap { max-width: 760px; margin: 0 auto; padding: 22px 16px 72px; }
 .top { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
 .mark { width: 34px; height: 34px; border-radius: 9px; background: var(--navy); display: flex; align-items: center; justify-content: center; flex: none; }
 .mark svg { width: 20px; height: 20px; }
 h1 { font-size: 1.3rem; margin: 0; letter-spacing: .2px; }
 .lead { margin: 2px 0 18px; color: var(--muted); font-size: .95rem; }
 .code-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
 .code-label { color: var(--muted); font-size: .9rem; }
 .code { font-family: ui-monospace, Menlo, monospace; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 4px 10px; font-weight: 700; letter-spacing: .5px; }
 .warn { background: var(--bad-bg); color: var(--bad); border: 1px solid #e5a7a1; border-radius: 10px; padding: 10px 14px; font-size: .9rem; margin: 0 0 18px; }
 .group-head { font-weight: 700; font-size: 1rem; margin: 26px 0 12px; color: var(--navy); }
 .group-head:first-of-type { margin-top: 6px; }
 .plan { position: relative; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px 18px 14px; margin: 0 0 16px; box-shadow: 0 1px 2px rgba(11,27,43,.04); }
 .plan.pop { border-color: var(--teal); box-shadow: 0 6px 20px -10px rgba(20,184,166,.45); }
 .badge { position: absolute; top: -11px; right: 16px; background: linear-gradient(100deg, #10b981, #14b8a6); color: #fff; font-size: .72rem; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
 .plan h2 { margin: 0; font-size: 1.08rem; }
 .plan h2 small { font-weight: 500; color: var(--muted); font-size: .72em; }
 .bits { margin: 4px 0 14px; color: var(--muted); font-size: .86rem; }
 .term { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
 .term:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
 .term-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
 .term-head b { font-size: .95rem; }
 .price { font-weight: 800; font-size: 1.1rem; color: var(--navy); }
 .note { margin: 2px 0 8px; font-size: .78rem; color: var(--muted); }
 .buttons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
 button { font: inherit; font-size: .86rem; padding: 9px 13px; border-radius: 10px; cursor: pointer; border: 1px solid var(--line); background: #fff; color: var(--navy); font-weight: 600; }
 button.pay-main { background: linear-gradient(100deg, #10b981, #14b8a6, #0d9488); color: #fff; border-color: transparent; box-shadow: 0 8px 20px -12px rgba(13,148,136,.7); }
 button:hover { filter: brightness(1.04); }
 button:disabled { opacity: .55; cursor: default; }
 .bank { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; margin-top: 22px; }
 .bank h2 { margin: 0 0 6px; font-size: 1.05rem; }
 .bank dl { display: grid; grid-template-columns: 5rem 1fr; gap: 4px 12px; margin: 10px 0 0; font-size: .92rem; }
 .bank dt { color: var(--muted); }
 #status { margin-top: 16px; min-height: 1.4em; font-size: .9rem; color: var(--muted); text-align: center; }
 @media (max-width: 420px) { .wrap { padding: 16px 12px 60px; } .plan { padding: 16px 14px 12px; } }
</style></head><body>
<div class="wrap">
<div class="top"><span class="mark"><svg viewBox="0 0 64 64"><path d="M40 18V37C40 48 26 50 22 42" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round"/><circle cx="40" cy="18" r="6.2" fill="#2dd4bf"/><circle cx="22" cy="42" r="6.2" fill="#2dd4bf"/></svg></span><h1>JSOX 订阅</h1></div>
<p class="lead">选一个方案，续费后所有功能照常使用。</p>
<div class="code-row"><span class="code-label">公司代码</span><b class="code">${esc(company || '未提供')}</b></div>
${known ? '' : (company ? '<p class="warn">找不到这个公司代码，付款前请先到 App 的「我的 Profile」页确认一下。</p>' : '')}
<p class="group-head">整套方案</p>
${allInOne}
<p class="group-head">单一应用</p>
${standalone}
${bankSection}
<p id="status"></p>
</div>
<script>
document.querySelectorAll('button[data-plan]').forEach(function (b) {
  b.addEventListener('click', async function () {
    var status = document.getElementById('status');
    status.textContent = '打开付款中…';
    b.disabled = true;
    try {
      var route = b.dataset.route === 'toyyibpay' ? '/toyyibpay/create' : '/checkout';
      var res = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: ${JSON.stringify(company).replace(/</g, '\\u003c')}, plan: b.dataset.plan, term: b.dataset.term, method: b.dataset.method }),
      });
      var data = await res.json();
      if (data.url) { window.location = data.url; return; }
      status.textContent = data.error || '这个付款方式暂时打不开。';
    } catch (e) {
      status.textContent = '连不上服务器，请稍后再试。';
    }
    b.disabled = false;
  });
});
</script>
</body></html>`;
}
