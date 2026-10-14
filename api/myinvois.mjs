/**
 * The MyInvois assistant (MyInvois 助手): answers a shop's questions about
 * LHDN's e-invoice -- whether they must issue one, when, consolidated
 * e-invoices, the buyer's TIN, the portal -- and how JSOX helps.
 *
 *   POST /app/myinvois-ask   { messages: [{ role, content }], lang }
 *                            Authorization: Bearer <Firebase ID token>
 *
 * The rules change (even LHDN's own guideline versions disagree on the
 * exemption threshold), so the answer is never from memory: Claude searches
 * and reads LHDN's own sites on every question (web search and web fetch,
 * limited to those sites) and every answer carries its sources. Where the
 * official pages are unclear or disagree, it says so and sends the shop to
 * LHDN or its accountant.
 *
 * Needs the ANTHROPIC_API_KEY secret (anthropic-api-key in Secret Manager).
 * The pure parts are tested in myinvois.test.mjs.
 */
import { ApiError } from './lib.mjs';

export const MODEL = 'claude-opus-5-5';
/** The only sites the assistant may search and read: LHDN's own. */
export const OFFICIAL = ['hasil.gov.my', 'sdk.myinvois.hasil.gov.my', 'myinvois.hasil.gov.my'];
const MAX_TURNS = 12;
const MAX_CHARS = 2000;
const MAX_CONTINUATIONS = 4;
const LANGS = { zh: 'Simplified Chinese', en: 'English', ms: 'Bahasa Melayu' };

// Frozen: nothing here changes per request, so it is cached between questions.
export const SYSTEM = `You are the MyInvois assistant inside JSOX, a POS, stock and warehouse system used by small shops, restaurants and wholesalers in Malaysia. You help business owners and their accounts staff understand LHDN (IRBM) e-invoicing through MyInvois and get it done.

How you answer:
- Before stating any rule, date, threshold, penalty, field requirement or procedure, search LHDN's official sites with web_search and read the relevant page or guideline with web_fetch. Base the answer on what those pages say now, not on memory. Rules have changed several times (for example the exemption threshold and phase dates), and older guideline versions may still be online: prefer the newest version and say which version or date you relied on.
- If the official pages are unclear, disagree with each other, or do not cover the question, say so plainly and tell the user to confirm with LHDN (the MyInvois portal or the HASiL Care Line) or their accountant or tax agent. Never fill a gap with a guess.
- You give general guidance, not tax or legal advice. For a decision about the user's own tax position, recommend confirming with their tax agent.
- Keep answers short and practical for a busy shop owner reading on a phone: a direct answer first, then numbered steps if there is something to do. No tables. Plain words; explain any term like TIN, MSIC or consolidated e-invoice the first time it appears.
- Do not ask for or repeat personal or company identifiers (TIN, IC, BRN, bank details) beyond what the question needs.
- Stay on e-invoicing, SST as it relates to invoices, and how JSOX helps. For anything else, say briefly that you only help with MyInvois.

What JSOX does (this is about the product, so you may state it without searching):
- JSOX POS records every sale with its SST per item (some items, such as rice, sugar and eggs, can be set tax-free).
- POS -> Reports -> e-Invoice builds the month's consolidated e-invoice from the receipts: "Download JSON" gives the file for the MyInvois portal, "Download CSV" gives a sheet for the accountant. It does not submit to LHDN by itself; the user uploads the file or passes it to their accountant.
- The seller details on that e-invoice (company name, TIN, business registration number, SST number, MSIC code and business activity, address, phone, email) come from POS -> Settings. If one is missing, tell the user to fill it in there first.
- A customer who asks for their own e-invoice: the user can still issue an individual e-invoice through the MyInvois portal; that receipt should then not also be counted in the consolidated one (check the official rule for the user's case).`;

/** The conversation as sent, checked: alternating turns ending with the user's question. */
export function checkMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new ApiError(400, 'Ask a question.', 'NO_QUESTION');
  const turns = messages.slice(-MAX_TURNS).map((m) => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: String(m?.content ?? '').trim().slice(0, MAX_CHARS),
  })).filter((m) => m.content);
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns.at(-1).role !== 'user') throw new ApiError(400, 'Ask a question.', 'NO_QUESTION');
  // Two turns from the same side in a row are joined, as the API would.
  const out = [];
  for (const t of turns) {
    if (out.length && out.at(-1).role === t.role) out.at(-1).content += `\n\n${t.content}`;
    else out.push({ ...t });
  }
  return out;
}

/** Is [url] one of LHDN's own pages? */
export function isOfficial(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && OFFICIAL.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`));
  } catch { return false; }
}

/** The answer's text and the official pages it cited or read (each once). */
export function answerOf(content) {
  const text = [];
  const sources = new Map();
  for (const block of content || []) {
    // A page it read in full (web fetch) is a source even when no sentence cites it.
    if (block.type === 'web_fetch_tool_result' && block.content?.type === 'web_fetch_result') {
      const url = block.content.url;
      if (url && isOfficial(url) && !sources.has(url)) sources.set(url, { url, title: String(block.content.content?.title || url).slice(0, 160) });
      continue;
    }
    if (block.type !== 'text') continue;
    text.push(block.text);
    for (const c of block.citations || []) {
      const url = c.url || c.source;
      if (url && isOfficial(url) && !sources.has(url)) sources.set(url, { url, title: String(c.title || c.document_title || url).slice(0, 160) });
    }
  }
  return { answer: text.join('').trim(), sources: [...sources.values()].slice(0, 6) };
}

export function myInvoisAssistant({ apiKey = process.env.ANTHROPIC_API_KEY, client = null } = {}) {
  let ready = client ? Promise.resolve(client) : null;
  const sdk = () => {
    ready ||= import('@anthropic-ai/sdk').then(({ default: Anthropic }) => new Anthropic({ apiKey }));
    return ready;
  };
  const tools = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: 4, allowed_domains: OFFICIAL },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3, allowed_domains: OFFICIAL, citations: { enabled: true } },
  ];

  return {
    configured: () => !!(client || apiKey),
    async ask(messages, lang = 'zh') {
      if (!client && !apiKey) throw new ApiError(503, 'The MyInvois assistant is not set up: the anthropic-api-key secret is missing.', 'NOT_SET_UP');
      const turns = checkMessages(messages);
      const anthropic = await sdk();
      // Which language to answer in: an operator note after the question,
      // so the cached system prompt stays the same for every language.
      const convo = [...turns, { role: 'system', content: `Answer in ${LANGS[lang] || LANGS.zh}.` }];
      let message;
      for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
        message = await anthropic.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          // A question about rules, looked up: low effort is enough.
          output_config: { effort: 'low' },
          system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
          tools,
          messages: convo,
        });
        // The server's search loop paused: send the turn back and it carries on.
        if (message.stop_reason !== 'pause_turn') break;
        convo.push({ role: 'assistant', content: message.content });
      }
      if (message.stop_reason === 'refusal') throw new ApiError(422, 'This question could not be answered here. Please ask LHDN or your accountant.', 'NOT_ANSWERED');
      const out = answerOf(message.content);
      if (!out.answer) throw new ApiError(422, 'No answer this time. Try asking again in other words.', 'NOT_ANSWERED');
      return out;
    },
  };
}
