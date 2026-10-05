// functions/api/intelligence.js — Gershon "Intelligence" menu, server side (v1.0, 2026-10-05)
//
// One endpoint, four modes, all on Cloudflare Workers AI (env.AI binding).
// No Anthropic / OpenAI key anywhere — the model runs inside our own Cloudflare account.
//
//   POST /api/intelligence  { mode: 'analyze' | 'suggest' | 'chat' | 'insights', app, data, messages? }
//   GET  /api/intelligence  -> { ok, ai }   (health: is the AI binding attached?)
//
// Linalysis: the session cookie lives on api.linalysis.net, so this Pages route cannot
// see it. Guard = same-origin requests only (linalysis.net / *.linalysis.pages.dev) and
// hard size caps. The data sent is the caller's own stats, already in their browser.

const MODELS = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'];
const MAX_DATA = 14000;      // chars of app data sent to the model
const MAX_TURNS = 12;        // chat history kept
const ORIGIN_OK = /^https:\/\/([a-z0-9-]+\.)?(linalysis\.net|linalysis\.pages\.dev)$/i;

const BASE = (app) =>
  `You are the Intelligence assistant inside ${app || 'Linalysis'}, ` +
  'a LinkedIn analytics SaaS (connections, profile views, SSI, company page metrics). ' +
  'You only know what is in the DATA block below — never invent numbers, names or facts. ' +
  'If the data is thin, say so plainly. Write for a busy founder: short, concrete, no filler. ' +
  'Use short markdown: "## " headings, "- " bullets, **bold** for key figures.';

const TASK = {
  analyze:
    'Produce an ANALYSIS of the data. Sections: "## Snapshot" (3-5 bullets with the key figures), ' +
    '"## What stands out" (patterns, trends, concentrations, outliers), "## Risks" (what looks wrong, stale or at risk). ' +
    'Max ~250 words.',
  suggest:
    'Produce IMPROVEMENT SUGGESTIONS based on the data. Give the 5 highest-impact actions, ranked. ' +
    'For each: "- **Action** — why (cite the figure from the data) — expected effect". ' +
    'Then "## Quick win today" with one action that takes under 15 minutes. Max ~300 words.',
  insights:
    'Return ONLY valid JSON, no markdown fences, no prose around it, exactly this shape: ' +
    '{"headline":"one short sentence starting with an emoji","paragraphs":["growth (connections, pace)","SSI and visibility","what to watch next"],' +
    '"recommendations":[{"title":"short imperative","body":"1-2 sentences citing a figure","priority":1-9,"tags":["connections"]}],' +
    '"tip":{"title":"short","body":"one sentence"}}. Give 5 to 8 recommendations, priority 9 = most urgent. Address the user as you.',
  chat:
    'Answer the user\'s question about the data and possible improvements. Be direct; cite figures from the data. ' +
    'If the question cannot be answered from the data, say what is missing.',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

async function run(env, messages, maxTokens) {
  let lastErr = 'no model answered';
  for (const model of MODELS) {
    try {
      const r = await env.AI.run(model, { messages, max_tokens: maxTokens, temperature: 0.3 });
      const text = r && (typeof r.response === 'string' ? r.response : (r.result && r.result.response) || '');
      if (text && text.trim()) return { text: text.trim(), model };
      lastErr = 'empty answer from ' + model;
    } catch (e) { lastErr = String(e && e.message || e); }
  }
  throw new Error(lastErr);
}

export async function onRequestGet({ env }) {
  return json({ ok: true, ai: !!env.AI, models: MODELS });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  if (!ORIGIN_OK.test(origin)) return json({ error: 'Forbidden origin' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 60000) return json({ error: 'Payload too large' }, 413);
  if (!env.AI) return json({ error: 'Cloudflare Workers AI binding "AI" is not attached to this project.' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const mode = TASK[body.mode] ? body.mode : 'analyze';
  const data = String(typeof body.data === 'string' ? body.data : JSON.stringify(body.data || '')).slice(0, MAX_DATA);
  const system = BASE(body.app) + '\n\n' + TASK[mode] + '\n\nDATA (captured ' + new Date().toISOString() + '):\n"""\n' + (data || '(no data captured)') + '\n"""';

  const messages = [{ role: 'system', content: system }];
  if (mode === 'chat') {
    const turns = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_TURNS)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!turns.length || turns[turns.length - 1].role !== 'user') return json({ error: 'Chat needs a user message' }, 400);
    messages.push(...turns);
  } else {
    messages.push({ role: 'user', content: mode === 'analyze' ? 'Analyse this data.' : mode === 'insights' ? 'Return the JSON now.' : 'What should I improve?' });
  }

  try {
    const out = await run(env, messages, mode === 'chat' ? 700 : mode === 'insights' ? 1400 : 900);
    if (mode === 'insights') {
      const m = out.text.match(/\{[\s\S]*\}/);
      let parsed = null;
      try { parsed = m && JSON.parse(m[0]); } catch (e) { parsed = null; }
      if (!parsed || !parsed.headline) return json({ error: 'AI returned an unreadable answer, retry' }, 502);
      return json({ mode, insights: parsed, model: out.model, engine: 'cloudflare-workers-ai' });
    }
    return json({ mode, text: out.text, model: out.model, engine: 'cloudflare-workers-ai' });
  } catch (e) {
    return json({ error: 'AI unavailable: ' + e.message }, 502);
  }
}
