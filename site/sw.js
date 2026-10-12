/* Hamrah service worker: makes the app open and lessons play without a connection.

   One version of the app is kept whole. The page, its script, styles and the curriculum are
   stored together when this worker is installed and are always served together, so old code
   never meets new lessons. A new version arrives as a new copy of this file: it downloads in
   the background, waits, and takes over when the page says it is a good moment (the home
   screen or the next start — see main.js), not in the middle of a lesson.

   - Audio packs (content-hashed, never change): stored the first time they are used, or all
     at once from Settings. A pack the page fetched while this worker was not yet in charge of
     it (the first moments of the first visit) is stored by the page itself, under the same
     cache name (keepSound in main.js) — so "a lesson opened once works offline" holds then too.
   - Pronunciation-checker files: stored by the page when the learner downloads them.

   Cache names carry the path this copy is served from, so two copies on one origin
   (user.github.io/hamrah and user.github.io/hamrah-test) never touch each other's files. */
const BUILD = '228f2a2d41';
const SCOPE = new URL(self.registration.scope).pathname;
const PREFIX = `hamrah|${SCOPE}|`;
const SHELL = `${PREFIX}shell-${BUILD}`;
const AUDIO = `${PREFIX}audio`;
const ASR = `${PREFIX}asr-c15fea8a96`;
const PRECACHE = ["index.html","app.js","app.css","content.json","manifest.webmanifest","audio/index.json","fonts/atkinson-400.woff2","fonts/atkinson-700.woff2","fonts/vazirmatn-400.woff2","fonts/vazirmatn-600.woff2","fonts/vazirmatn-800.woff2","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/icon.svg","audio/core.fffd2c16.mp3","audio/words.b83f234c.mp3"];
// without these the app cannot start; the rest (fonts, pictures, first sounds) is fetched again on first use if it failed here
const CORE = PRECACHE.filter((u) => !/^(fonts|icons)\/|\.mp3$/.test(u));
const EXTRA = PRECACHE.filter((u) => !CORE.includes(u));
const fresh = (u) => new Request(u, { cache: 'reload' });

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await c.addAll(CORE.map(fresh));
    await Promise.all(EXTRA.map((u) => c.add(fresh(u)).catch(() => null)));
    // the very first install starts working at once; an update waits until the page asks for it
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'hamrah:activate') self.skipWaiting();
});

// Earlier versions used cache names shared by the whole origin. Take over only what belongs to this copy.
async function adoptLegacy() {
  for (const name of await caches.keys()) {
    const to = name === 'hamrah-audio-v1' ? AUDIO : name === 'hamrah-asr-v1' ? ASR : /^hamrah-shell-/.test(name) ? '' : null;
    if (to === null) continue;
    const old = await caches.open(name);
    const mine = to ? await caches.open(to) : null;
    for (const req of await old.keys()) {
      if (!req.url.startsWith(self.registration.scope)) continue;
      if (mine) { const res = await old.match(req); if (res) await mine.put(req, res); }
      await old.delete(req);
    }
    if (!(await old.keys()).length) await caches.delete(name);
  }
}

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try { await adoptLegacy(); } catch (err) { /* storage trouble: carry on with what we have */ }
    for (const k of await caches.keys()) {
      if ((k.startsWith(PREFIX + 'shell-') && k !== SHELL) || (k.startsWith(PREFIX + 'asr-') && k !== ASR)) await caches.delete(k);
    }
    // drop audio packs that are no longer part of the curriculum
    try {
      const idx = await (await (await caches.open(SHELL)).match('audio/index.json')).json();
      const keep = new Set(idx.packs.map((p) => new URL('audio/' + p.file, self.registration.scope).href));
      const c = await caches.open(AUDIO);
      for (const req of await c.keys()) if (!keep.has(req.url)) await c.delete(req);
    } catch (err) { /* nothing cached yet */ }
    await self.clients.claim();
  })());
});

const offline = () => new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  const path = url.pathname.slice(SCOPE.length);

  // Opening the app: only its own address is answered with the stored page. Any other address
  // (a link to one of the site's files, a mistyped path) goes to the network as it is and is
  // never stored — so no link can replace the stored app with something else.
  if (req.mode === 'navigate') {
    if (path !== '' && path !== 'index.html') return;
    e.respondWith((async () => (await (await caches.open(SHELL)).match('index.html')) || fetch(req).catch(offline))());
    return;
  }

  if (/^audio\/.+\.mp3$/.test(path)) {            // cache first: these files never change
    e.respondWith((async () => {
      const hit = (await (await caches.open(AUDIO)).match(req, { ignoreSearch: true })) || (await (await caches.open(SHELL)).match(req, { ignoreSearch: true }));
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.status === 200) { const c = await caches.open(AUDIO); c.put(req, res.clone()); }
      return res;
    })());
    return;
  }
  if (path.startsWith('asr/')) {
    e.respondWith((async () => (await (await caches.open(ASR)).match(req, { ignoreSearch: true })) || fetch(req))());
    return;
  }
  if (path === 'config.json') {                   // the optional live-partner setting: always asked afresh, simply "off" without a connection
    e.respondWith(fetch(req).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // the app's own files: from this version's store; a request that names another version (?v=) goes to the network
  e.respondWith((async () => {
    const v = url.searchParams.get('v');
    if (v && v !== BUILD) return fetch(req).catch(offline);
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.status === 200 && EXTRA.includes(path)) cache.put(path, res.clone());   // a font or picture that could not be stored at install
      return res;
    } catch (err) { return offline(); }
  })());
});
