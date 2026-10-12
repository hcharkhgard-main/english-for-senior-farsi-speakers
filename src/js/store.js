// Learner progress and settings. Everything stays on this device (localStorage);
// nothing is sent anywhere. The learner's personal details («اطلاعات من») are NOT part of this: they are kept in
// memory only (me.js) and are never written here — `toStored` is the one door to the storage. Reads and writes are guarded so the app still works
// when storage is blocked (private windows, embedded previews).

// The name the progress is stored under carries the path this copy of the app is served from, as the names of its
// stored files do (sw.js): two copies on one address (user.github.io/hamrah and …/hamrah-test) share the browser's
// storage, and must not read, overwrite or wipe each other's learner. OLD_KEY is the name earlier builds used.
import { forgetAll } from './me.js';

const OLD_KEY = 'hamrah.v1';
const copyPath = () => { try { return typeof document === 'undefined' ? '' : '|' + new URL('./', document.baseURI).pathname; } catch { return ''; } };
const KEY = OLD_KEY + copyPath();
export const DAY = 86400000;
export const today = (now = Date.now()) => Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / DAY);

export function blank() {
  return {
    v: 1,
    onboard: { done: false, step: 0, level: 'none', focus: 'both', scenario: '' },   // step: which first-run question is on screen
    // neverAsk: «هیچ‌وقت نپرس» — never invite the learner to enter their personal details (a choice, not a detail)
    settings: { scale: 1, rate: 1, ph: true, faVoice: true, auto: true, ai: false, micOk: false, neverAsk: false },
    // (no `me`: the learner's personal details are kept in memory only, see me.js)
    at: {},                     // lessonId -> { pos, scr, short, t, seed, warm } — where the learner stopped in each lesson they have started
    done: {},                   // lessonId -> { t, n }
    hard: {},                   // "lessonId:p2" -> times it needed another try
    rp: {},                     // roleplayId -> times finished
    srs: {},                    // itemId -> { b: box, d: due day, n: times answered, l: last day answered }
    fav: {},                    // itemId -> 1
    newDay: { d: 0, n: 0 },     // review today: n new words met, c cards answered (c is added by srs.js answered(); two sets of 15 are the day's plan)
    said: {},                   // itemId -> best pronunciation score (0..1)
    built: {},                  // patternId -> sentences built correctly
    heard: {},                  // number-listening item -> times recognised at the first try
    read: {},                   // paperId («خواندن نوشته‌ها») -> times every question of it was answered
    later: {},                  // lessonId -> 1: «این درس الان به کارم نمی‌آید», moved to the end of the path; 2: set aside again there, no longer offered
    cp: { n: 0, t: 0 },         // review checkpoints: n = how many groups of five finished lessons have had theirs (or were passed over), t = when
    tried: {},                  // lessonId -> 1: the learner tried the lesson's small real-life task; 0: asked once, "not yet"
    told: {},                   // things said once only (name -> 1)
  };
}

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
// a saved screen of a lesson: { kind, i?, j?, g?, v?, k?, key? } — anything else (damaged storage) is dropped
function screenOf(x) {
  if (!isObj(x) || typeof x.kind !== 'string' || !/^[a-z]{1,12}$/.test(x.kind)) return null;
  const o = { kind: x.kind };
  for (const f of ['i', 'j', 'g', 'v', 'k']) if (x[f] != null) { const n = Number(x[f]); if (!Number.isInteger(n) || n < 0 || n > 99) return null; o[f] = n; }
  if (x.key != null) { if (typeof x.key !== 'string' || x.key.length > 80) return null; o.key = x.key; }
  return o;
}

// What is written to the storage: the fields of blank() and nothing else. Whatever else a state object may carry —
// above all `me`, the learner's personal details that earlier builds kept here — is never written. Exported for the tests.
export function toStored(state) {
  const out = {};
  for (const k of Object.keys(blank())) if (k !== 'me' && state && state[k] !== undefined) out[k] = state[k];
  return JSON.stringify(out);
}

// Brings whatever was saved by an earlier build (or damaged by hand) into today's shape. Exported for the tests.
// Personal details saved by an earlier build (`me`) are dropped here; createStore then writes the cleaned copy at once.
export function migrate(s) {
  const b = blank();
  if (!isObj(s) || s.v !== 1) return b;
  for (const k of Object.keys(b)) {
    if (isObj(b[k])) { if (isObj(s[k])) b[k] = { ...b[k], ...s[k] }; }
    else if (typeof s[k] === typeof b[k]) b[k] = s[k];
  }
  b.cp = { n: Math.max(0, Math.floor(Number(b.cp.n)) || 0), t: Number(b.cp.t) || 0 };
  // settings are only ever one of the choices Settings offers: a damaged text size (1e9) would make every screen,
  // Settings too, unusable. Anything else goes back to the usual value; the switches are true or false.
  const d = blank().settings, st = b.settings;
  if (![1, 1.15, 1.3, 1.5].includes(Number(st.scale))) st.scale = d.scale; else st.scale = Number(st.scale);
  if (![1, 0.88, 0.78].includes(Number(st.rate))) st.rate = d.rate; else st.rate = Number(st.rate);
  for (const k of ['ph', 'faVoice', 'auto', 'ai', 'micOk', 'neverAsk']) st[k] = typeof st[k] === 'boolean' ? st[k] : d[k];
  // Earlier builds remembered one lesson in progress: current = { id, pos, short }. Positions are now kept per lesson.
  const c = s.current;
  if (isObj(c) && typeof c.id === 'string' && !b.at[c.id]) b.at[c.id] = { pos: c.pos, short: c.short, t: Date.now() };
  // a position only counts once the learner has gone past the first screen
  for (const [id, a] of Object.entries(b.at)) {
    const pos = isObj(a) ? Math.floor(Number(a.pos)) : 0;
    // (warm: the review keys of the sentences of earlier lessons asked at the start of this attempt — views/lesson.js)
    // (scr: which screen that place is — its kind and which sentence or question — so that a lesson that changed length
    // in an update reopens on the same screen: views/lesson.js screenId)
    if (pos >= 1) b.at[id] = { pos, short: !!a.short, t: Number(a.t) || 0, ...(a.seed > 0 && a.seed < 1 ? { seed: a.seed } : {}), ...(Array.isArray(a.warm) ? { warm: a.warm.filter((k) => typeof k === 'string').slice(0, 3) } : {}), ...(screenOf(a.scr) ? { scr: screenOf(a.scr) } : {}) };
    else delete b.at[id];
  }
  return b;
}

// `events`: where the browser announces that another tab changed the storage (the window); the tests pass their own.
export function createStore(storage, { events = typeof window !== 'undefined' ? window : null } = {}) {
  // `last` is the stored text exactly as this page last read or wrote it. When the storage holds something else,
  // another tab of the app has written (or deleted) it since — a lesson finished there, «پاک کردن همه‌چیز» —
  // and what is stored is the newer truth: this page takes it over and never writes its own older copy on top.
  let last = null;
  let state;
  let persistent = true;
  const read = () => { try { return storage ? storage.getItem(KEY) : null; } catch { return undefined; } };      // undefined: storage cannot be read just now
  const hadMe = (raw) => { try { const o = JSON.parse(raw); return isObj(o) && 'me' in o; } catch { return false; } };
  const parse = (raw) => { try { return migrate(raw ? JSON.parse(raw) : null); } catch { return blank(); } };
  // Progress saved under the earlier name moves to this copy's own name, once; the earlier entry is then removed,
  // so that «پاک کردن همه‌چیز» leaves nothing behind that a later start could bring back.
  if (KEY !== OLD_KEY && storage) { try { const old = storage.getItem(OLD_KEY); if (old != null) { if (storage.getItem(KEY) == null) storage.setItem(KEY, old); storage.removeItem(OLD_KEY); } } catch { /* storage cannot be used: nothing to move */ } }
  last = read() ?? null;
  state = parse(last);
  // A copy saved by an earlier build may still hold the learner's personal details: it is replaced at once by the
  // cleaned one (save, below), so that they are gone from the phone on the first start of this version.
  if (last && hadMe(last)) save();
  // The same for other copies of the app on this address (…/hamrah-test): only their `me` is removed, the rest of their
  // entry is left exactly as it is.
  try {
    for (let i = 0; storage && typeof storage.key === 'function' && i < storage.length; i++) {
      const k = storage.key(i);
      if (k === KEY || typeof k !== 'string' || !(k === OLD_KEY || k.startsWith(OLD_KEY + '|'))) continue;
      try { const o = JSON.parse(storage.getItem(k)); if (isObj(o) && 'me' in o) { delete o.me; storage.setItem(k, JSON.stringify(o)); } } catch { /* a damaged entry: left alone */ }
    }
  } catch { /* storage cannot be listed: nothing more to clean */ }
  const subs = new Set();
  const tell = (why) => subs.forEach((f) => f(state, why));
  // true when the stored copy was newer than ours and has replaced it
  const adopt = () => {
    const raw = read();
    if (raw === undefined || raw === last) return false;
    // another tab of this app deleted everything: the personal details this tab holds in memory go as well
    // (they are never carried from tab to tab otherwise — each tab has only what was typed into it)
    if (raw === null && last !== null) forgetAll();
    last = raw; state = parse(raw);
    if (raw && hadMe(raw)) save();      // an older version open in another tab wrote personal details: write them out again
    return true;
  };
  function save() {
    try { if (storage) { const text = toStored(state); storage.setItem(KEY, text); last = text; } } catch { persistent = false; }
  }
  // Called when another tab may have written: the browser's 'storage' event, and — because a tab asleep in the
  // background can miss that event — whenever this page comes back into view. Subscribers are told 'external':
  // the app then redraws from its first screen, so that no open screen keeps showing or holding the older data.
  const sync = () => { if (!adopt()) return false; tell('external'); return true; };
  if (storage && events && events.addEventListener) {
    events.addEventListener('storage', (e) => { if (e && e.key != null && e.key !== KEY) return; if (e && e.storageArea && e.storageArea !== storage) return; sync(); });
    events.addEventListener('pageshow', sync);
    events.addEventListener('focus', sync);
    const doc = events.document;
    if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', () => { if (!doc.hidden) sync(); });
  }
  return {
    get state() { return state; },
    get persistent() { return persistent && !!storage; },
    // Every change is made to the newest stored copy (see `adopt`): a page that missed the other tab's news cannot undo it.
    update(fn) { const newer = adopt(); fn(state); save(); tell(newer ? 'external' : undefined); },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    sync,
    reset(keepSettings = true) {
      const newer = adopt();
      const old = state;
      state = blank();
      if (keepSettings) { state.settings = old.settings; state.onboard = { ...old.onboard }; }      // («اطلاعات من» is in memory and is not touched)
      save();
      tell(newer ? 'external' : undefined);
    },
    wipe() { state = blank(); forgetAll(); try { storage && storage.removeItem(KEY); } catch { /* ignore */ } last = read() ?? null; tell(); },
  };
}
