// Boot, navigation and the frame every screen sits in.
import { h, icon, mark, toast, announce, liveRegion, closeSheets, sheet, setStrings, noteTap, inUse, focusKey, refocus } from './ui.js';
import { createStore, today } from './store.js';
import { createAudio } from './audio.js';
import { createSpeech } from './speech.js';
import { createPartner } from './partner.js';
import { homeView, onboardView, placesView, placeView } from './views/home.js';
import { lessonView } from './views/lesson.js';
import { talkView, roleplayView } from './views/talk.js';
import { wordsView, reviewView, catView, savedView, grammarView, numbersView } from './views/words.js';
import { nextLesson, reviewPool } from './learn.js';
import { buildView } from './views/build.js';
import { settingsView, sosView, aboutView, meView } from './views/settings.js';
import { papersView, paperView, papersOf } from './views/papers.js';
import { candoView, checkpointView } from './views/progress.js';

/* global __TARGET__, __VERSION__ */
const TARGET = typeof __TARGET__ === 'string' ? __TARGET__ : 'pwa';
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

const VIEWS = {
  home: homeView, onboard: onboardView, places: placesView, place: placeView, lesson: lessonView,
  talk: talkView, rp: roleplayView, words: wordsView, review: reviewView, cat: catView, saved: savedView, grammar: grammarView, build: buildView, numbers: numbersView,
  settings: settingsView, sos: sosView, about: aboutView, me: meView,
  papers: papersView, paper: paperView,
  cando: candoView, checkpoint: checkpointView,
};

async function loadContent() {
  const inline = document.getElementById('hamrah-content');
  if (inline) return JSON.parse(inline.textContent);
  const r = await fetch('content.json');
  if (!r.ok) throw new Error('content ' + r.status);
  return r.json();
}

function safeStorage() {
  try { const s = window.localStorage; s.setItem('hamrah.t', '1'); s.removeItem('hamrah.t'); return s; } catch { return null; }
}

// ---- sounds fetched while the service worker is not in charge of this page ----------------------
// The worker keeps every lesson's sound file that passes through it (sw.js). But on the very first
// visit the page runs for a while before the worker takes charge, and after a forced reload the
// worker is not in charge at all: what the learner hears then is played but would not be kept, and
// Settings promises that a lesson opened once also works without a connection. So the page stores
// such a file itself, at once, under the same name the worker uses. The first sounds (emergency
// phrases, single words) also come with the app itself; once the worker has stored the app, a
// second copy made here is dropped again, so nothing stays on the phone twice.
const SW_OK = TARGET === 'pwa' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof location !== 'undefined' && location.protocol !== 'file:';
async function keepSound(address, res) {
  try {
    if (!('caches' in window)) return;
    const url = new URL(address, document.baseURI).href;
    const mine = `hamrah|${new URL('./', document.baseURI).pathname}|`;      // the names sw.js uses: …|audio and …|shell-<build>
    const withApp = async () => {
      for (const name of await caches.keys()) if (name.startsWith(mine + 'shell-') && (await (await caches.open(name)).match(url, { ignoreSearch: true }))) return true;
      return false;
    };
    if (await withApp()) return;
    const c = await caches.open(mine + 'audio');
    if (!(await c.match(url, { ignoreSearch: true }))) await c.put(url, res);
    await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 120000))]);
    if (await withApp()) await c.delete(url);
  } catch { /* storage full or blocked: the sound still plays now, and is fetched again next time */ }
}
function audioFetch(address) {
  const direct = SW_OK && !navigator.serviceWorker.controller;
  return fetch(address).then((r) => {
    if (direct && r.ok && r.status === 200 && /\.mp3$/.test(address)) keepSound(address, r.clone());
    return r;
  });
}

async function boot() {
  const root = document.getElementById('app');
  let content;
  try { content = await loadContent(); } catch {
    root.replaceChildren(h('main', { class: 'wrap' }, h('div', { class: 'card' }, h('h2', null, 'برنامه باز نشد'),
      h('p', null, 'اتصال اینترنت را بررسی کنید و دوباره امتحان کنید.'),
      h('button', { class: 'btn btn-primary', onclick: () => location.reload() }, 'دوباره امتحان کنید'))));
    return;
  }
  const store = createStore(safeStorage());
  const audio = createAudio({ base: 'audio/', getRate: () => store.state.settings.rate || 1, fetchFn: audioFetch });
  const speech = createSpeech({ base: 'asr/', enabled: TARGET !== 'artifact' });
  const strings = content.ui.strings || {};
  const t = (key, vars) => {
    let s = strings[key];
    if (s == null) return key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  };

  setStrings(t);
  liveRegion();

  const order = content.stages.flatMap((st) => st.lessons.filter((id) => content.lessons[id]));
  const app = {
    target: TARGET, version: VERSION, content, store, audio, speech, t, order,
    online: navigator.onLine !== false,
    go, back, render, hold, home: () => go(store.state.onboard.done ? 'home' : 'onboard', { reset: true }),
    get ui() { return entries[entries.length - 1].ui; },        // the state of the screen on show; kept while another screen is opened on top of it
    set ui(v) { entries[entries.length - 1].ui = v || {}; },
    get screen() { return screen; },                             // changes on every navigation: lets slow work notice that the learner has moved on
    lessonStage: (id) => (content.stages.find((s) => s.lessons.includes(id)) || {}).id || 1,
    scenario: (id) => content.scenarios.find((s) => s.id === id),
    stageOf: () => 1,
    // which lesson comes next, and what may come up in review: see learn.js
    nextLesson: () => nextLesson(store.state, content),
    pool: () => reviewPool(store.state, content),
    item(id) {
      if (id.startsWith('p:')) {
        const [, lid, pid] = id.split(':');
        // own(): a saved id that names no lesson ("p:constructor:p1", from damaged storage) is simply not shown
        const L = Object.prototype.hasOwnProperty.call(content.lessons, lid) ? content.lessons[lid] : null;
        const p = L && Array.isArray(L.phrases) && L.phrases.find((x) => x.id === pid);
        return p ? { id, en: p.en, say: p.say, fa: p.fa, ph: p.ph, note: p.note, voice: p.voice || 's', chunks: p.chunks, own: p.own, kind: 'phrase', from: L.title.fa } : null;      // own: the sample words the learner replaces with their own details
      }
      const w = content.vocab.find((x) => x.id === id);
      return w ? { id, en: w.en, fa: w.fa, ph: w.ph, ex: w.ex, pic: w.pic, voice: 's', kind: 'word' } : null;
    },
    today,
  };
  app.partner = createPartner(app);
  window.hamrah = app;   // handy for support and for the automated tests

  // ---- navigation --------------------------------------------------------------------------
  // A small stack of screens; Back and Home are always in the same place. Each entry keeps the
  // state of its screen, so opening the emergency phrases (or any other screen) on top of a
  // lesson or conversation and coming back returns to the same step. In the installed app and
  // the browser, the browser's own history mirrors the stack: the phone's Back gesture works,
  // and the address always names the screen on show (a reload reopens that screen).
  const HISTORY = TARGET === 'pwa' && !!(window.history && history.pushState);
  const clean = (r) => String(r).replace(/[^A-Za-z0-9._~-]/g, '').slice(0, 80);
  const parse = (route) => { const dot = route.indexOf('.'); return dot < 0 ? [route, ''] : [route.slice(0, dot), route.slice(dot + 1)]; };
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);      // (Object.hasOwn is missing on iOS 15.0–15.3)
  const PARAMS = {            // screens that show one item: the item must exist
    lesson: (p) => own(content.lessons, p),
    rp: (p) => content.roleplays.some((r) => r.id === p),
    cat: (p) => content.vocabCats.some((c) => c.id === p),
    place: (p) => content.scenarios.some((sc) => sc.id === p),
    build: (p) => p === '' || p === 'mix' || content.patterns.some((x) => x.id === p),
    paper: (p) => papersOf(content).some((x) => x.id === p),
  };
  const entry = (route) => ({ route, ui: {} });
  let entries = [entry('home')];
  let screen = 0;
  const top = () => entries[entries.length - 1];
  const histState = () => { try { return history.state; } catch { return null; } };

  // `child` records that the history entry just before this one is this screen's parent, so the
  // in-app Back can simply be the browser's Back (no second copy of a screen is left behind).
  function record(push, child) {
    const hash = '#' + top().route;
    try {
      if (!HISTORY) history.replaceState(null, '', hash);
      else if (push) history.pushState({ hamrah: entries.map((e) => e.route), child: !!child }, '', hash);
      else history.replaceState({ hamrah: entries.map((e) => e.route), child: !!child }, '', hash);
    } catch { /* embedded viewers may refuse */ }
  }

  // Stops everything that belongs to the screen being left.
  function leave() {
    screen++;
    audio.stop(); speech.cancel(); closeSheets();
  }

  // A screen we return to must not still say "listening…": nothing is being recorded any more.
  const BUSY = ['loading', 'asking', 'listening', 'checking'];
  function settle(ui) {
    const calm = (o) => {
      if (!o || typeof o !== 'object') return;
      if (BUSY.includes(o.phase)) o.phase = 'idle';
      if (BUSY.includes(o.mic)) o.mic = 'idle';
      if (o.rec) o.rec = null;
    };
    calm(ui);
    for (const v of Object.values(ui)) calm(v);
  }

  function go(route, opts = {}) {
    route = clean(route);
    const cur = top();
    if (opts.replace && entries.length > 1 && entries[entries.length - 2].route === route) { back(); return; }   // "another one" from a finished screen: the list is already underneath
    leave();
    if (opts.reset) {
      const same = entries.length === 1 && cur.route === route;
      entries = [entry(route)];
      record(!same, false);
    } else if (opts.replace) {
      entries[entries.length - 1] = entry(route);
      const st = histState();
      record(false, !!(st && st.child));
    } else if (cur.route !== route) {
      entries.push(entry(route));
      record(true, true);
    } else cur.ui = {};
    render(true);
    applyUpdate();
  }

  function popOne() {
    leave();
    if (entries.length > 1) entries.pop(); else entries = [entry(store.state.onboard.done ? 'home' : 'onboard')];
    settle(top().ui);
    record(false, false);
    render(true);
    applyUpdate();
  }
  function back() {
    const st = HISTORY ? histState() : null;
    if (st && st.child && entries.length > 1) {
      leave();
      const was = top();
      history.back();                                                       // 'popstate' below shows the screen underneath
      setTimeout(() => { if (top() === was) popOne(); }, 600);              // …and if the browser does not answer, do it ourselves
      return;
    }
    popOne();
  }

  // The stack a history entry (or a typed/linked address) stands for.
  function wanted(state) {
    const hash = clean((location.hash || '').slice(1));
    let list = state && Array.isArray(state.hamrah) ? state.hamrah.map(clean).filter(Boolean) : [];
    if (!list.length) list = hash && hash !== 'home' ? ['home', hash] : ['home'];
    if (!store.state.onboard.done) return list.includes('sos') ? ['onboard', 'sos'] : ['onboard'];
    list = list.filter((r) => r !== 'onboard');
    return list.length ? list : ['home'];
  }
  // Takes over a stack, keeping the screen state of every entry that is still the same screen.
  function adopt(list) {
    let keep = true;
    entries = list.map((route, i) => { keep = keep && !!entries[i] && entries[i].route === route; return keep ? entries[i] : entry(route); });
    settle(top().ui);
  }
  if (HISTORY) window.addEventListener('popstate', (e) => {          // the phone's Back / Forward, or an address typed by hand
    leave();
    const list = wanted(e.state);
    adopt(list);
    if (!e.state || !Array.isArray(e.state.hamrah) || e.state.hamrah.join('/') !== list.join('/')) record(false, !!(e.state && e.state.child));
    render(true);
    applyUpdate();
  });

  // ---- an unsteady double tap must not press two things ---------------------------------------
  // The second tap of a double tap arrives after the screen has changed, and would press whatever
  // now lies under the finger. So after a tap has changed the screen, taps are ignored for a moment.
  // (app.tapHold is the length of that moment; the layout sweep in tests/e2e sets it to 0 to move fast.)
  app.tapHold = 350;
  let lastTap = -1e9, moved = false;
  function hold() { moved = true; }
  document.addEventListener('click', (e) => {
    const now = performance.now();
    if (moved && now - lastTap < app.tapHold) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    lastTap = now; moved = false;
    noteTap(e.target);
  }, true);

  function topbar(name, exit) {
    const bar = h('div', { class: 'wrap' });
    const sos = () => h('button', { type: 'button', class: 'tb-btn tb-sos', onclick: () => go('sos') }, icon('sos'), h('span', null, t('nav.sos')));
    if (name === 'home' || name === 'onboard') {
      bar.append(h('div', { class: 'tb-brand' }, mark(), h('span', null, t('app.name'))));
      if (name === 'home') bar.append(h('button', { type: 'button', class: 'tb-btn', onclick: () => go('settings') }, icon('gear'), h('span', null, t('nav.settings'))));
      else bar.append(sos());                                               // help is one tap away even before the first question is answered
    } else {
      // a screen may rename this control (inside a lesson it says "leave the lesson") and may ask to confirm before its work is thrown away
      const asking = (then) => () => {
        const c = exit && exit.confirm;
        if (!c) { then(); return; }
        sheet(c.title, h('p', null, c.body), [{ label: c.yes, cls: 'btn-danger', run: then }, { label: c.no, cls: 'btn-primary' }]);
      };
      bar.append(h('button', { type: 'button', class: 'tb-btn', onclick: asking(back) }, icon(exit && exit.label ? 'exit' : 'back'), h('span', null, (exit && exit.label) || t('nav.back'))));
      if (name !== 'sos') bar.append(sos());
      else bar.append(h('span', { class: 'tb-spacer' }));
      if (store.state.onboard.done) bar.append(h('button', { type: 'button', class: 'tb-btn', onclick: asking(app.home) }, icon('home'), h('span', null, t('nav.home'))));
    }
    return h('header', { class: 'topbar' }, bar);
  }

  // Shown for an address that names no screen or no lesson (an old link, a typing mistake).
  function notFound() {
    return { main: h('main', { class: 'wrap' }, h('section', { class: 'card' }, h('h1', null, t('nf.title')), h('p', { class: 'lead' }, t('nf.body')),
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: app.home }, icon('home'), h('span', null, t('nav.home'))))) };
  }

  // What a screen reader should be told about after a screen was redrawn in place: feedback notes,
  // results and new lines of a conversation that were not on the screen a moment ago.
  // A screen marks such a place with data-live (one message) or data-live="list" (each child is a message).
  let said = new Set();
  function liveTexts() {
    const out = [];
    const words = (el) => {             // the words of an element, piece by piece, without the labels of its buttons
      const parts = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if (!n.parentElement.closest('button, [aria-hidden="true"]')) parts.push(n.nodeValue);
      return parts.join(' ').replace(/\s+/g, ' ').trim();
    };
    for (const el of root.querySelectorAll('.note, .result-title, [data-live]')) {
      if (el.getAttribute('data-live') === 'list') for (const kid of el.children) out.push(words(kid)); else out.push(words(el));
    }
    return out.filter(Boolean);
  }

  function render(navigated = false) {
    const route = top().route;
    const [name, param] = parse(route);
    const ok = own(VIEWS, name) && (!own(PARAMS, name) || PARAMS[name](param));      // own(): "#constructor" or "#__proto__" must not find something on a plain object
    let out;
    try { out = ok ? VIEWS[name](app, param) : notFound(); } catch (err) {
      console.error(err);
      out = { main: h('main', { class: 'wrap' }, h('section', { class: 'card' }, h('h1', null, t('err.title')), h('p', null, t('err.body')),
        h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: app.home }, icon('home'), h('span', null, t('nav.home'))))) };
    }
    const y = window.scrollY;
    const before = navigated ? null : focusKey(root, inUse());
    const kids = [topbar(ok ? name : '', out.exit || null)];
    if (out.banner) kids[0].append(out.banner);      // a line that must stay in sight while the page scrolls ("this is only practice" in a 911 practice call)
    if (!app.online) kids.push(h('div', { class: 'offline-flag' }, t('net.offline')));
    if (out.bar) out.main.classList.add('has-bar');
    kids.push(out.main);
    if (out.bar) kids.push(out.bar);
    root.replaceChildren(...kids);
    // screens announce through the one permanent live region (ui.js), not through regions that are rebuilt with them
    root.querySelectorAll('[aria-live]').forEach((el) => { el.setAttribute('data-live', 'list'); el.removeAttribute('aria-live'); });

    let h1 = out.main.querySelector('h1');
    if (!h1) { h1 = h('h1', { class: 'sr' }, t('app.name')); out.main.prepend(h1); }      // every screen has a heading to land on
    h1.setAttribute('tabindex', '-1');
    if (navigated) {
      moved = true;
      window.scrollTo(0, 0);
      document.title = name === 'home' || !ok ? t('app.name') : `${h1.textContent.trim()} · ${t('app.name')}`;
      try { h1.focus({ preventScroll: true }); } catch { /* ignore */ }
      said = new Set(liveTexts());
    } else {
      window.scrollTo(0, y);
      if (before) refocus(root, before);
      const now = liveTexts();
      const fresh = now.filter((x) => !said.has(x));
      said = new Set(now);
      if (fresh.length) announce(fresh.join(' '));
    }
    out.after && out.after(navigated);
  }

  // ---- text size: start from the phone's own Dynamic Type size, then apply the learner's choice ----
  function applyScale() {
    let basePx = 16;
    try {
      const probe = h('span', { style: 'font: -apple-system-body; position:absolute; visibility:hidden' }, 'a');
      document.body.append(probe);
      const px = parseFloat(getComputedStyle(probe).fontSize);
      probe.remove();
      if (px >= 12 && px <= 40 && CSS.supports('font', '-apple-system-body')) basePx = px * (16 / 17);
    } catch { /* keep 16 */ }
    const roomy = Math.min(window.innerWidth, window.innerHeight) >= 700 ? 1.15 : 1;      // tablets and computers: use the room for larger text
    const px = basePx * (store.state.settings.scale || 1) * roomy;
    document.documentElement.style.fontSize = px.toFixed(2) + 'px';
    // the layout stacks side-by-side things when text is very large for the width (see styles.css)
    document.documentElement.toggleAttribute('data-big', px / Math.min(window.innerWidth, 576) >= 0.052);
  }
  app.applyScale = applyScale;
  applyScale();
  // Another tab of the app changed or deleted what is stored (store.js takes the newer copy over): start again from
  // the first screen, so that no screen still open here shows — or writes back — the older progress or details.
  store.subscribe((s, why) => { if (why === 'external') { applyScale(); app.home(); } });
  let sizedFor = window.innerWidth;
  window.addEventListener('resize', () => { if (window.innerWidth !== sizedFor) { sizedFor = window.innerWidth; applyScale(); } });      // turning the phone; not the toolbar sliding away

  audio.onChange((cur) => {
    document.querySelectorAll('[data-play]').forEach((el) => {
      const on = !!cur && el.dataset.play === cur.id;
      el.classList.toggle('is-playing', on);
      el.setAttribute('aria-pressed', String(on));          // "playing now" for screen readers; a second tap stops it
    });
  });
  const firstTouch = () => audio.unlock();
  window.addEventListener('pointerdown', firstTouch, { capture: true });
  window.addEventListener('keydown', firstTouch, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { audio.stop(); speech.cancel(); } else applyScale();
  });
  window.addEventListener('online', () => { app.online = true; render(); });
  window.addEventListener('offline', () => { app.online = false; render(); toast(t('net.wentOffline')); });

  audio.loadIndex().then(() => audio.warm(['core'])).catch(() => {});
  // ---- offline support and new versions ---------------------------------------------------------
  // The service worker holds one complete version of the app. A newer version downloads in the
  // background and waits. It is switched on only at a quiet moment (the home screen, or the next
  // start), never in the middle of a lesson, and the page then reloads once to use it.
  let applyUpdate = () => {};
  if (TARGET === 'pwa' && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    const sw = navigator.serviceWorker;
    let reg = null, controlled = !!sw.controller, stale = false, reloading = false, checked = Date.now();
    const quiet = () => ['home', 'onboard'].includes(top().route) && entries.length === 1 && !document.querySelector('.sheet-back');
    const reloadOnce = () => {
      if (reloading) return;
      try {
        if (Date.now() - (+sessionStorage.getItem('hamrah.reloaded') || 0) < 15000) return;      // never reload in a loop
        sessionStorage.setItem('hamrah.reloaded', String(Date.now()));
      } catch { /* storage blocked: `reloading` still limits it to once per page */ }
      reloading = true;
      location.reload();
    };
    const applyNow = () => {
      if (!quiet()) return;
      if (stale) reloadOnce();
      else if (reg && reg.waiting && controlled) reg.waiting.postMessage('hamrah:activate');
    };
    // Not in the same moment as a screen change: the browser is then still fetching through the old
    // worker (the page icon, a font), and a worker that has just been given work is not replaced.
    let settle = 0;
    applyUpdate = () => { clearTimeout(settle); settle = setTimeout(applyNow, 1500); };
    sw.addEventListener('controllerchange', () => {
      if (controlled) { stale = true; applyNow(); }         // a newer version took over this page: reload now if the learner is at home, else when they get there
      controlled = true;
    });
    sw.register('sw.js').then((r) => {
      reg = r;
      r.addEventListener('updatefound', () => { const w = r.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') applyUpdate(); }); });
      applyUpdate();
    }).catch(() => {});
    // an installed app can stay open for weeks: look for a new version when the learner comes back to it
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !reg) return;
      if (Date.now() - checked > 3600000) { checked = Date.now(); reg.update().catch(() => {}); }
      applyUpdate();
    });
  }

  // start where the address (or, after a reload, the history entry) says
  const st0 = HISTORY ? histState() : null;
  entries = wanted(st0).map(entry);
  record(false, !!(st0 && st0.child && Array.isArray(st0.hamrah) && st0.hamrah.join('/') === entries.map((e) => e.route).join('/')));
  render(true);
}

boot();
