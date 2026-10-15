// node platform/buyPage.test.mjs -- the page a customer actually pays on.
// No network, no database, no Express.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderBuyPage, simplePage } from './buyPage.mjs';
import { PLANS } from './plans.mjs';

test('every sellable plan gets a card, TRIAL does not', () => {
  const html = renderBuyPage({ company: 'DEMO01', known: true });
  for (const [id, p] of Object.entries(PLANS)) {
    if (id === 'TRIAL') { assert.ok(!html.includes('>Trial<'), 'TRIAL is not for sale'); continue; }
    assert.ok(html.includes(p.label), `${id} (${p.label}) missing`);
  }
});

test('the company code shows, escaped where it is HTML; an unknown one warns', () => {
  const html = renderBuyPage({ company: '<b>X</b>', known: false });
  assert.ok(html.includes('&lt;b&gt;X&lt;/b&gt;'), 'the visible chip is escaped');
  assert.ok(html.includes('找不到这个公司代码'));
});

// The company code is public (a short, guessable, URL-quoted join code) and
// also lands raw-ish inside the page's own <script> block, for the fetch()
// body. JSON.stringify alone would still let `</script>` close that tag
// early and turn the rest of the attacker's string into live HTML.
test('a company code cannot break out of the inline <script> block', () => {
  const html = renderBuyPage({ company: '</script><script>alert(1)</script>', known: false });
  assert.ok(!html.includes('</script><script>alert'), 'the real </script> sequence must never reach the page');
  assert.ok(html.includes('u003c/script') || html.includes('\\u003c/script'), 'escaped instead');
});

test('a known company: no warning', () => {
  const html = renderBuyPage({ company: 'DEMO01', known: true });
  assert.ok(!html.includes('找不到这个公司代码'));
});

test('every button carries the plan, term and route a click needs', () => {
  const html = renderBuyPage({ company: 'DEMO01', known: true });
  assert.ok(html.includes('data-plan="STARTER"') && html.includes('data-term="monthly"') && html.includes('data-route="checkout"'));
  assert.ok(html.includes('data-route="toyyibpay"'));
});

test('bank transfer only when the platform was given bank details', () => {
  const without = renderBuyPage({ company: 'DEMO01', known: true });
  assert.ok(!without.includes('银行转账'));
  const withBank = renderBuyPage({ company: 'DEMO01', known: true, bank: { name: 'Maybank', account: '123', holder: 'JSOX', supportEmail: 'x@x.com' } });
  assert.ok(withBank.includes('银行转账') && withBank.includes('Maybank') && withBank.includes('x@x.com'));
});

test('simplePage escapes its text and keeps the brand mark', () => {
  const html = simplePage('<script>', 'hi & bye');
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('hi &amp; bye'));
  assert.ok(html.includes('<svg'));
});
