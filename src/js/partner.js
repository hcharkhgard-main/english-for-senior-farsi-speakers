// The optional live AI conversation partner.
// The built-in scripted partner always works (offline, no account). This adds free
// conversation when an AI service is reachable:
//   - inside a Claude artifact: the page's own "ask Claude" capability (the prompt is built here);
//   - on your own site: a small proxy you host (ai-proxy/), set in config.json. The proxy gets
//     the id of the conversation and builds the instructions itself.
// Nothing is sent unless the learner has switched the live partner on (settings.ai), and only
// for conversations that are open to it (liveAllowed): never safety-critical or scripted ones,
// and never ones that ask for personal details.
import { AI_MAX_TURNS, AI_LIMITS, liveAllowed, personaOf, buildPrompt, cleanReply } from './ai-prompt.js';

const TIMEOUT_MS = 30000;

// The proxy address must be https. Plain http is accepted for this computer only (development).
export function safeProxyUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const u = new URL(value.trim());
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
    if (u.username || u.password) return '';
    if (!local && !/^[a-z0-9.-]+$/i.test(u.hostname)) return '';      // a plain host name only (the same rule as tools/build.mjs for the page's policy)
    return u.protocol === 'https:' || (u.protocol === 'http:' && local) ? u.href : '';
  } catch { return ''; }
}

const fail = (code) => Object.assign(new Error(code), { code });

export function createPartner(app) {
  let sample = null, proxyUrl = '', probed = null;

  function probe() {
    if (probed) return probed;
    probed = (async () => {
      if (app.target === 'artifact') {
        try { sample = (window.claude && window.claude.use) ? await window.claude.use('sample') : null; } catch { sample = null; }
      } else {
        try { const r = await fetch('config.json'); if (r.ok) { const c = await r.json(); proxyUrl = safeProxyUrl(c && c.aiProxyUrl); } } catch { proxyUrl = ''; }
      }
      return !!(sample || proxyUrl);
    })();
    return probed;
  }

  async function next({ R, history, said }) {
    await probe();
    if (!sample && !proxyUrl) throw fail('unavailable');
    if (!liveAllowed(R)) throw fail('not-allowed');
    if (!app.store.state.settings.ai) throw fail('off');
    const level = app.store.state.onboard && app.store.state.onboard.level === 'some' ? 'elementary' : 'beginner';
    const lines = (history || []).filter((m) => m && typeof m.en === 'string' && m.en.trim())
      .map((m) => ({ who: m.who === 'you' ? 'you' : 'them', en: m.en.trim().slice(0, AI_LIMITS.line) })).slice(-AI_LIMITS.history);
    const text = String(said || '').trim().slice(0, AI_LIMITS.said);
    if (!text) throw fail('empty');
    const last = lines.filter((m) => m.who === 'you').length + 1 >= AI_MAX_TURNS;
    let out;
    if (sample) {
      out = await sample.json(buildPrompt({ persona: personaOf(R), level, history: lines, said: text }), { modelTier: 'quick', cache: false });
    } else {
      const stop = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = stop ? setTimeout(() => stop.abort(), TIMEOUT_MS) : null;
      try {
        // only the conversation's id, the lines of this practice conversation and the learner's level are sent
        const r = await fetch(proxyUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
          body: JSON.stringify({ v: 1, id: R.id, level, history: lines, said: text }), ...(stop ? { signal: stop.signal } : {}),
        });
        if (r.status === 429) throw fail('rate');
        if (!r.ok) throw fail('proxy-' + r.status);
        out = await r.json();
      } finally { if (timer) clearTimeout(timer); }
    }
    const clean = cleanReply(out, { last });
    if (!clean) throw fail('bad-reply');
    return clean;
  }

  return { probe, next, allows: liveAllowed, get kind() { return sample ? 'claude' : proxyUrl ? 'proxy' : ''; } };
}
