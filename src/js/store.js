// Learner progress and settings. Everything stays on this device (localStorage);
// nothing is sent anywhere. Reads and writes are guarded so the app still works
// when storage is blocked (private windows, embedded previews).

// The name the progress is stored under carries the path this copy of the app is served from, as the names of its
// stored files do (sw.js): two copies on one address (user.github.io/hamrah and …/hamrah-test) share the browser's
// storage, and must not read, overwrite or wipe each other's learner. OLD_KEY is the name earlier builds used.
const OLD_KEY = 'hamrah.v1';
const copyPath = () => { try { return typeof document === 'undefined' ? '' : '|' + new URL('./', document.baseURI).pathname; } catch { return ''; } };
const KEY = OLD_KEY + copyPath();
export const DAY = 86400000;
export const today = (now = Date.now()) => Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / DAY);

export function blank() {
  return {
    v: 1,
    onboard: { done: false, step: 0, level: 'none', focus: 'both', scenario: '' },   // step: which first-run question is on screen
    settings: { scale: 1, rate: 1, ph: true, faVoice: true, auto: true, ai: false, micOk: false },
    // «اطلاعات من»: the learner's own details. They never leave this phone. phone: the learner's own number;
    // contact: a family member's number; born: date of birth as "1955-12-14" (a part not chosen yet is 0) — see own.js
    me: { name: '', address: '', contact: '', phone: '', born: '' },
    at: {},                     // lessonId -> { pos, short, t, seed, warm } — where the learner stopped in each lesson they have started
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
    told: {},                   // things said once only (name -> 1), e.g. the invitation to fill in «اطلاعات من»
  };
}

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// Brings whatever was saved by an earlier build (or damaged by hand) into today's shape. Exported for the tests.
export function migrate(s) {
  const b = blank();
  if (!isObj(s) || s.v !== 1) return b;
  for (const k of Object.keys(b)) {
    if (isObj(b[k])) { if (isObj(s[k])) b[k] = { ...b[k], ...s[k] }; }
    else if (typeof s[k] === typeof b[k]) b[k] = s[k];
  }
  // the learner's own details are short texts, whatever was stored
  for (const k of Object.keys(b.me)) if (typeof b.me[k] !== 'string') b.me[k] = ''; else b.me[k] = b.me[k].slice(0, 200);
  b.cp = { n: Math.max(0, Math.floor(Number(b.cp.n)) || 0), t: Number(b.cp.t) || 0 };
  // Earlier builds remembered one lesson in progress: current = { id, pos, short }. Positions are now kept per lesson.
  const c = s.current;
  if (isObj(c) && typeof c.id === 'string' && !b.at[c.id]) b.at[c.id] = { pos: c.pos, short: c.short, t: Date.now() };
  // a position only counts once the learner has gone past the first screen
  for (const [id, a] of Object.entries(b.at)) {
    const pos = isObj(a) ? Math.floor(Number(a.pos)) : 0;
    // (warm: the review keys of the sentences of earlier lessons asked at the start of this attempt — views/lesson.js)
    if (pos >= 1) b.at[id] = { pos, short: !!a.short, t: Number(a.t) || 0, ...(a.seed > 0 && a.seed < 1 ? { seed: a.seed } : {}), ...(Array.isArray(a.warm) ? { warm: a.warm.filter((k) => typeof k === 'string').slice(0, 3) } : {}) };
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
  const read = () => { try { return storage ? storage.getItem(KEY) : null; } catch { return undefined; } };      // undefined: storage cannot be read just now
  const parse = (raw) => { try { return migrate(raw ? JSON.parse(raw) : null); } catch { return blank(); } };
  // Progress saved under the earlier name moves to this copy's own name, once; the earlier entry is then removed,
  // so that «پاک کردن همه‌چیز» leaves nothing behind that a later start could bring back.
  if (KEY !== OLD_KEY && storage) { try { const old = storage.getItem(OLD_KEY); if (old != null) { if (storage.getItem(KEY) == null) storage.setItem(KEY, old); storage.removeItem(OLD_KEY); } } catch { /* storage cannot be used: nothing to move */ } }
  last = read() ?? null;
  state = parse(last);
  const subs = new Set();
  let persistent = true;
  const tell = (why) => subs.forEach((f) => f(state, why));
  // true when the stored copy was newer than ours and has replaced it
  const adopt = () => {
    const raw = read();
    if (raw === undefined || raw === last) return false;
    last = raw; state = parse(raw);
    return true;
  };
  const save = () => {
    try { if (storage) { const text = JSON.stringify(state); storage.setItem(KEY, text); last = text; } } catch { persistent = false; }
  };
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
      if (keepSettings) { state.settings = old.settings; state.onboard = { ...old.onboard }; state.me = old.me; }
      save();
      tell(newer ? 'external' : undefined);
    },
    wipe() { state = blank(); try { storage && storage.removeItem(KEY); } catch { /* ignore */ } last = read() ?? null; tell(); },
  };
}
