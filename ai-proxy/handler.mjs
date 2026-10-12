// Optional server-side proxy for the live AI conversation partner.
//
// The website itself is static and never holds an API key. If you want free conversation
// with an AI, deploy this small function somewhere that can keep a secret (Cloudflare
// Workers, or any Node host behind HTTPS) and put its https address in config.json as
// "aiProxyUrl".
//
// What it does: takes one conversation turn (the id of a conversation, the lines so far and
// what the learner just said), checks it, builds the model's instructions itself from the
// allow-list in personas.json, calls the model, and returns a checked JSON reply.
//
// What it does NOT do, so that nobody relies on it:
// - It is not access control. The Origin check stops other websites from using the service
//   through their visitors' browsers; a script can send any Origin header it likes. What a
//   script can get is limited to short in-role replies for the listed conversations, and what
//   it can cost you is limited by the caps below and, above all, by the monthly spend limit
//   you set at the model provider. Set that limit.
// - Its counters live in memory: they start again when the process or Worker isolate restarts,
//   and on Cloudflare each location counts separately. They slow abuse down; they do not stop it.
// - It writes no logs of what learners say. Your host and the model provider have their own
//   logging and retention rules.
import { AI_MAX_TURNS, AI_LEVELS, AI_LIMITS, buildSystem, buildTranscript, cleanReply } from '../src/js/ai-prompt.js';

const DEFAULTS = { perIp: 30, windowMs: 10 * 60 * 1000, perDay: 600, maxBody: 8000, timeoutMs: 20000, maxTokens: 500 };
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

// Each provider receives the instructions separately from the conversation text and sends the
// instructions in the provider's own "system" field.
export const PROVIDERS = {
  // Anthropic Messages API
  anthropic: async ({ apiKey, model, system, user, maxTokens, fetchFn, signal }) => {
    const r = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error('upstream ' + r.status);
    const j = await r.json();
    return (Array.isArray(j && j.content) ? j.content : []).filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  },
  // Any service that speaks the OpenAI chat-completions format (set AI_BASE_URL, https only)
  openai: async ({ apiKey, model, system, user, maxTokens, fetchFn, signal, baseUrl }) => {
    const r = await fetchFn((baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error('upstream ' + r.status);
    const j = await r.json();
    const text = j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
    return typeof text === 'string' ? text : '';
  },
};

// Only https sites may use the service; http is accepted for localhost (development) only.
export function parseOrigins(value) {
  return String(value || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter((s) => {
    try { const u = new URL(s); return u.origin === s && (u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL.test(u.hostname))); } catch { return false; }
  });
}

// Checks one request body. Returns { turn } or { error } and never throws, whatever was sent.
export function validateTurn(body, personas) {
  const bad = (error, status = 400) => ({ error, status });
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('shape');
  if (Object.keys(body).some((k) => !['v', 'id', 'level', 'history', 'said'].includes(k))) return bad('shape');
  if (typeof body.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(body.id)) return bad('id');
  if (!Object.hasOwn(personas, body.id)) return bad('conversation', 404);
  const level = body.level === undefined ? AI_LEVELS[0] : body.level;
  if (!AI_LEVELS.includes(level)) return bad('level');
  if (typeof body.said !== 'string') return bad('said');
  const said = body.said.trim();
  if (!said) return bad('empty');
  if (said.length > AI_LIMITS.said) return bad('said');
  const list = body.history === undefined ? [] : body.history;
  if (!Array.isArray(list) || list.length > AI_LIMITS.history) return bad('history');
  const history = [];
  for (const m of list) {
    if (!m || typeof m !== 'object' || Array.isArray(m) || (m.who !== 'you' && m.who !== 'them') || typeof m.en !== 'string' || !m.en.trim() || m.en.length > AI_LIMITS.line) return bad('history');
    history.push({ who: m.who, en: m.en });
  }
  const turns = history.filter((m) => m.who === 'you').length + 1;
  if (turns > AI_MAX_TURNS) return bad('turns');
  return { turn: { id: body.id, persona: personas[body.id], level, history, said, last: turns === AI_MAX_TURNS } };
}

// env:  AI_API_KEY (secret), ALLOWED_ORIGINS, optional AI_PROVIDER / AI_MODEL / AI_BASE_URL.
// deps: personas (the "personas" object of personas.json — required), and for tests fetchFn, now, limits.
// The returned function takes the Request and, from the entry point, the caller's address:
// handle(request, { ip }). The handler itself never trusts a forwarding header.
export function createHandler(env, deps = {}) {
  const fetchFn = deps.fetchFn || ((...a) => fetch(...a));
  const now = deps.now || (() => Date.now());
  const limits = { ...DEFAULTS, ...(deps.limits || {}) };
  const personas = deps.personas && typeof deps.personas === 'object' ? deps.personas : {};
  const origins = parseOrigins(env.ALLOWED_ORIGINS);
  const provider = Object.hasOwn(PROVIDERS, env.AI_PROVIDER || 'anthropic') ? PROVIDERS[env.AI_PROVIDER || 'anthropic'] : null;
  const baseOk = !env.AI_BASE_URL || /^https:\/\//.test(env.AI_BASE_URL);
  const ready = !!(env.AI_API_KEY && provider && baseOk && Object.keys(personas).length);
  const hits = new Map();           // caller address -> times of recent answered turns
  let day = { d: 0, n: 0 };

  const cors = (origin) => ({ 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'Origin' });
  const json = (status, body, origin, extra) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(origin ? cors(origin) : {}), ...(extra || {}) } });

  return async function handle(request, ctx = {}) {
    const origin = (request.headers.get('origin') || '').replace(/\/+$/, '');
    const allowed = origins.includes(origin);
    let local = false, secure = false;
    try { const u = new URL(request.url); local = LOCAL.test(u.hostname); secure = u.protocol === 'https:'; } catch { /* treated as not secure */ }
    if (!secure && !local) return json(400, { error: 'https' });
    if (request.method === 'OPTIONS') return allowed ? new Response(null, { status: 204, headers: cors(origin) }) : new Response(null, { status: 403 });
    if (request.method !== 'POST') return json(405, { error: 'method' }, null, { allow: 'POST, OPTIONS' });
    if (!allowed) return json(403, { error: 'origin' });
    if (!ready) return json(503, { error: 'not-configured' }, origin);
    if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return json(415, { error: 'type' }, origin);

    // 1. read and check the request — nothing is counted, and nothing is sent anywhere, until it is valid
    if (+(request.headers.get('content-length') || 0) > limits.maxBody) return json(413, { error: 'too-large' }, origin);
    let body;
    try {
      const text = await request.text();
      if (text.length > limits.maxBody) return json(413, { error: 'too-large' }, origin);
      body = JSON.parse(text);
    } catch { return json(400, { error: 'bad-json' }, origin); }
    const checked = validateTurn(body, personas);
    if (!checked.turn) return json(checked.status, { error: checked.error }, origin);
    const turn = checked.turn;

    // 2. limits: per caller address in a sliding window, and for everybody together per day (UTC)
    const t = now();
    const ip = typeof ctx.ip === 'string' && ctx.ip ? ctx.ip.slice(0, 64) : 'unknown';
    const recent = (hits.get(ip) || []).filter((x) => t - x < limits.windowMs);
    const today = Math.floor(t / 86400000);
    if (day.d !== today) day = { d: today, n: 0 };
    if (day.n >= limits.perDay) return json(429, { error: 'rate', scope: 'day' }, origin, { 'retry-after': String(Math.ceil(((today + 1) * 86400000 - t) / 1000)) });
    if (recent.length >= limits.perIp) return json(429, { error: 'rate', scope: 'visitor' }, origin, { 'retry-after': String(Math.ceil((recent[0] + limits.windowMs - t) / 1000)) });
    recent.push(t); hits.set(ip, recent); day.n += 1;
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < limits.windowMs)) hits.delete(k);

    // 3. ask the model; whatever comes back is checked before it is passed on
    try {
      const raw = await provider({
        apiKey: env.AI_API_KEY, model: env.AI_MODEL || DEFAULT_MODEL, baseUrl: env.AI_BASE_URL, maxTokens: limits.maxTokens, fetchFn,
        system: buildSystem(turn.persona, { level: turn.level, last: turn.last }),
        user: buildTranscript({ history: turn.history, said: turn.said }),
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(limits.timeoutMs) : undefined,
      });
      const clean = cleanReply(raw, { last: turn.last });
      if (!clean) return json(502, { error: 'bad-reply' }, origin);
      return json(200, clean, origin);
    } catch { return json(502, { error: 'upstream' }, origin); }
  };
}
