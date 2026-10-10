// node api/myinvois.test.mjs -- the MyInvois assistant's checks and answers.
import assert from 'node:assert/strict';
import test from 'node:test';
import { answerOf, checkMessages, isOfficial, MODEL, myInvoisAssistant, OFFICIAL, SYSTEM } from './myinvois.mjs';

test('a conversation must end with the user, and is trimmed', () => {
  assert.throws(() => checkMessages([]), /Ask a question/);
  assert.throws(() => checkMessages([{ role: 'assistant', content: 'hi' }]), /Ask a question/);
  const long = 'x'.repeat(5000);
  const out = checkMessages([{ role: 'assistant', content: 'welcome' }, { role: 'user', content: long }]);
  assert.deepEqual(out.map((m) => m.role), ['user']);
  assert.equal(out[0].content.length, 2000);
  // Same side twice is joined; anything not 'assistant' is the user.
  assert.deepEqual(checkMessages([{ role: 'user', content: 'a' }, { role: 'system', content: 'b' }]), [{ role: 'user', content: 'a\n\nb' }]);
  const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
  many.push({ role: 'user', content: 'last' });
  assert.ok(checkMessages(many).length <= 12);
});

test('only LHDN pages count as sources', () => {
  assert.ok(isOfficial('https://www.hasil.gov.my/en/e-invoice/'));
  assert.ok(isOfficial('https://sdk.myinvois.hasil.gov.my/start/'));
  assert.ok(!isOfficial('http://www.hasil.gov.my/'));
  assert.ok(!isOfficial('https://hasil.gov.my.evil.com/'));
  assert.ok(!isOfficial('not a url'));
  assert.ok(OFFICIAL.includes('hasil.gov.my'));
});

test('the answer joins its text and lists each official page once', () => {
  const out = answerOf([
    { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'e-invoice' } },
    { type: 'web_fetch_tool_result', tool_use_id: 'f1', content: { type: 'web_fetch_result', url: 'https://www.hasil.gov.my/en/e-invoice/', content: { title: 'e-Invoice' } } },
    { type: 'text', text: 'Yes, ', citations: [{ type: 'web_search_result_location', url: 'https://www.hasil.gov.my/en/e-invoice/', title: 'e-Invoice' }] },
    { type: 'text', text: 'from 1 July.', citations: [{ type: 'web_search_result_location', url: 'https://example.com/blog', title: 'Blog' }] },
  ]);
  assert.equal(out.answer, 'Yes, from 1 July.');
  assert.deepEqual(out.sources, [{ url: 'https://www.hasil.gov.my/en/e-invoice/', title: 'e-Invoice' }]);
});

/** A stand-in for the SDK client: answers in turn, remembers what it was asked. */
const fake = (...answers) => {
  const asked = [];
  return { asked, beta: { messages: { create: async (req) => { asked.push(structuredClone(req)); return answers.shift(); } } } };
};

test('it searches LHDN only, answers in the page language, and resumes a paused search', async () => {
  const client = fake(
    { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: {} }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: '需要。', citations: [{ type: 'web_search_result_location', url: 'https://www.hasil.gov.my/a', title: 'A' }] }] },
  );
  const out = await myInvoisAssistant({ client }).ask([{ role: 'user', content: '我要开电子发票吗？' }], 'zh');
  assert.equal(out.answer, '需要。');
  assert.equal(client.asked.length, 2);
  const first = client.asked[0];
  assert.equal(first.model, MODEL);
  assert.equal(first.system[0].text, SYSTEM);
  assert.deepEqual(first.system[0].cache_control, { type: 'ephemeral' });
  assert.ok(first.tools.every((t) => t.allowed_domains.every((d) => OFFICIAL.includes(d))));
  assert.deepEqual(first.messages.at(-1), { role: 'system', content: 'Answer in Simplified Chinese.' });
  // The paused turn goes back as it came, after the language note.
  assert.equal(client.asked[1].messages.at(-1).role, 'assistant');
});

test('a refusal or an empty answer is a clear error; no key is "not set up"', async () => {
  await assert.rejects(myInvoisAssistant({ client: fake({ stop_reason: 'refusal', content: [] }) }).ask([{ role: 'user', content: 'q' }]), (e) => e.status === 422);
  await assert.rejects(myInvoisAssistant({ client: fake({ stop_reason: 'end_turn', content: [] }) }).ask([{ role: 'user', content: 'q' }]), (e) => e.status === 422);
  await assert.rejects(myInvoisAssistant({ apiKey: '' }).ask([{ role: 'user', content: 'q' }]), (e) => e.status === 503 && e.code === 'NOT_SET_UP');
});
