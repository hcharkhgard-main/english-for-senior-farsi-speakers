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

   Nothing is stored unchecked. On a hotel or clinic Wi-Fi that has not been "accepted" yet, every
   request is answered with the network's login page (200, text/html); a weak connection can cut a
   download short. Such an answer must never be kept as a part of the app or as a lesson's sound —
   it would stay on the phone for good. So every file of the app is compared with its exact size
   and SHA-256 (listed by tools/build.mjs), and every sound pack likewise, before it is stored. A file that fails is not kept (the
   app installs on a later visit; the sound is fetched again on the next tap).

   Nothing stored is served unchecked either. The browser fetches this worker itself from the network, so the
   lists in it cannot be changed from the phone's storage; the stored copies can. Another site on the same address
   (user.github.io/other-project) can open these caches and replace the stored page with its own code, which would
   then run as this app and see what the learner types (QA round 4, security M1). So every stored file of the app,
   every sound pack and every pronunciation-checker file is compared with its listed size and SHA-256 each time it
   is served; a copy that is not the listed file is deleted and fetched afresh (and kept only if that download is
   right). Without a connection a replaced file is simply not served: better a page that says "offline" than
   someone else's code under this app's name.

   Cache names carry the path this copy is served from, so two copies on one origin
   (user.github.io/hamrah and user.github.io/hamrah-test) never touch each other's files. */
const BUILD = '__BUILD__';
const SCOPE = new URL(self.registration.scope).pathname;
const PREFIX = `hamrah|${SCOPE}|`;
const SHELL = `${PREFIX}shell-${BUILD}`;
const AUDIO = `${PREFIX}audio`;
const ASR = `${PREFIX}asr-__ASR__`;
const PRECACHE = __PRECACHE__;
const INTEGRITY = __INTEGRITY__;                  // path -> [bytes, sha256 hex], made by tools/build.mjs
const PACK_SUMS = __PACK_SUMS__;                  // 'audio/<file>' -> [bytes, sha256 hex] of every sound pack of this version
const ASR_FILES = __ASR_FILES__;                  // pronunciation-checker file name -> [bytes, sha256 hex] (tools/asr-files.json)
// without these the app cannot start; the rest (fonts, pictures, first sounds) is fetched again on first use if it failed here
const CORE = PRECACHE.filter((u) => !/^(fonts|icons)\/|\.mp3$/.test(u));
const EXTRA = PRECACHE.filter((u) => !CORE.includes(u));
const fresh = (u) => new Request(u, { cache: 'reload' });

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
async function digest(algo, buf) {
  try { return self.crypto && self.crypto.subtle ? hex(await self.crypto.subtle.digest(algo, buf)) : null; } catch { return null; }
}
// Is this the file that was meant? [bytes, hash] as listed; without a hash function only the size can be compared.
async function matches(buf, bytes, algo, hash) {
  if (!buf || buf.byteLength !== bytes) return false;
  const d = await digest(algo, buf);
  return d === null || d.startsWith(hash);
}
const looksLikePage = (res) => /^text\/html/i.test(res.headers.get('Content-Type') || '');
// A response that is stored: the checked bytes, with the type and the length they really have.
const keepable = (buf, res, type) => new Response(buf, { status: 200, headers: { 'Content-Type': type || res.headers.get('Content-Type') || 'application/octet-stream', 'Content-Length': String(buf.byteLength) } });

// Fetches a file of the app and returns what may be stored for it, or throws.
async function fetchChecked(u) {
  const res = await fetch(fresh(u));
  if (!res.ok || res.status !== 200 || res.redirected) throw new Error(`${u}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const want = INTEGRITY[u];
  if (!want || !(await matches(buf, want[0], 'SHA-256', want[1]))) throw new Error(`${u}: not the file this version lists`);
  return keepable(buf, res);
}

// What a stored file must be, by its path inside this copy of the site: [bytes, sha256], or null when nothing is listed.
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function wanted(path) {
  if (own(INTEGRITY, path)) return INTEGRITY[path];
  if (own(PACK_SUMS, path)) return PACK_SUMS[path];
  if (path.startsWith('asr/') && own(ASR_FILES, path.slice(4))) return ASR_FILES[path.slice(4)];
  return null;
}
// The stored copy of a file, only if it is still exactly the file this version lists. A copy that is not (replaced from
// outside, or damaged) is deleted, and null is returned: the caller then fetches it afresh. A file that nothing lists
// is never served from storage — this version stores only listed files.
async function served(cache, req, path) {
  const hit = await cache.match(req, { ignoreSearch: true });
  if (!hit) return null;
  const want = wanted(path);
  if (want) {
    try { if (await matches(await hit.clone().arrayBuffer(), want[0], 'SHA-256', want[1])) return hit; } catch { /* unreadable: as not right */ }
  }
  try { await cache.delete(req, { ignoreSearch: true }); } catch { /* storage trouble */ }
  return null;
}
// The bytes of a sound pack, if they are that pack: its size and SHA-256 as this version lists them.
async function goodPack(path, buf) {
  const want = wanted(path);
  return !!(want && (await matches(buf, want[0], 'SHA-256', want[1])));
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // all or nothing: if one file of the app is not right, this version is not installed now (the browser tries again later)
    const core = await Promise.all(CORE.map(async (u) => [u, await fetchChecked(u)]));
    for (const [u, res] of core) await c.put(u, res);
    await Promise.all(EXTRA.map(async (u) => { try { await c.put(u, await fetchChecked(u)); } catch { /* fetched again on first use */ } }));
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
      const idx = await (await served(await caches.open(SHELL), 'audio/index.json', 'audio/index.json')).json();
      const keep = new Set(idx.packs.map((p) => new URL('audio/' + p.file, self.registration.scope).href));
      const c = await caches.open(AUDIO);
      for (const req of await c.keys()) {
        if (!keep.has(req.url)) { await c.delete(req); continue; }
        // a login page stored by an earlier version of this worker (before stored sounds were checked)
        const res = await c.match(req);
        if (!res || !/^audio\//i.test(res.headers.get('Content-Type') || '')) await c.delete(req);
        // (any other copy that is not the listed pack is found and replaced when it is next served)
      }
    } catch (err) { /* nothing cached yet */ }
    await self.clients.claim();
  })());
});

const offline = () => new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
// Opening the app with no usable stored page and no connection: a short page in Farsi (its text is put here from
// content/ui.fa.json by tools/build.mjs) instead of the English word (QA round 5, usability L5)
const OFFLINE_PAGE = __OFFLINE_PAGE__;
const offlinePage = () => new Response(OFFLINE_PAGE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

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
    e.respondWith((async () => (await served(await caches.open(SHELL), 'index.html', 'index.html')) || (await again('index.html', req, offlinePage)))());
    return;
  }

  if (/^audio\/.+\.mp3$/.test(path)) {            // cache first: these files never change
    e.respondWith((async () => {
      const hit = (await served(await caches.open(AUDIO), req, path)) || (await served(await caches.open(SHELL), req, path));
      if (hit) return hit;
      const res = await fetch(req);
      if (!res.ok || res.status !== 200 || res.redirected || looksLikePage(res)) return res;
      // stored only if these are the pack's own bytes; either way the page gets what came (src/js/audio.js checks it too)
      const buf = await res.arrayBuffer();
      if (await goodPack(path, buf)) { try { await (await caches.open(AUDIO)).put(req, keepable(buf, res, 'audio/mpeg')); } catch { /* storage full */ } }
      return new Response(buf, { status: res.status, headers: res.headers });
    })());
    return;
  }
  if (path.startsWith('asr/')) {
    e.respondWith((async () => (await served(await caches.open(ASR), req, path)) || fetch(req))());
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
    const hit = await served(cache, req, path);
    if (hit) return hit;
    // not stored (a font or picture that could not be stored at install), or the stored copy was not the right file:
    // stored now if the download is the right file
    if (own(INTEGRITY, path)) return again(path, req);
    try { return await fetch(req); } catch (err) { return offline(); }
  })());
});

// A file of the app that is missing from the store or was not right there: fetched afresh and, if it is the listed
// file, stored and served. Otherwise the network's answer is passed on as it is (never stored), or "offline".
async function again(path, req, fallback = offline) {
  try { const good = await fetchChecked(path); try { await (await caches.open(SHELL)).put(path, good.clone()); } catch { /* storage full */ } return good; } catch { /* not the right file now */ }
  try { return await fetch(req); } catch (err) { return fallback(); }
}
