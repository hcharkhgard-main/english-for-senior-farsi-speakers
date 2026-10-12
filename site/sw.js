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
   and SHA-256 (listed by tools/build.mjs), and every sound pack with the size in audio/index.json
   and the content hash in its own name, before it is stored. A file that fails is not kept (the
   app installs on a later visit; the sound is fetched again on the next tap).

   Cache names carry the path this copy is served from, so two copies on one origin
   (user.github.io/hamrah and user.github.io/hamrah-test) never touch each other's files. */
const BUILD = '73800a63fc';
const SCOPE = new URL(self.registration.scope).pathname;
const PREFIX = `hamrah|${SCOPE}|`;
const SHELL = `${PREFIX}shell-${BUILD}`;
const AUDIO = `${PREFIX}audio`;
const ASR = `${PREFIX}asr-c15fea8a96`;
const PRECACHE = ["index.html","app.js","app.css","content.json","manifest.webmanifest","audio/index.json","fonts/atkinson-400.woff2","fonts/atkinson-700.woff2","fonts/vazirmatn-400.woff2","fonts/vazirmatn-600.woff2","fonts/vazirmatn-800.woff2","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/icon.svg","audio/core.fffd2c16.mp3","audio/words.165db891.mp3"];
const INTEGRITY = {"index.html":[3129,"417d266a8ccb1bc9ff04de99847977bc2b08705c80217057f21a2b8fbe2abe3f"],"app.js":[198085,"9595d9237b8adea7492e8972e0d1b13750fadd8e7b2cc1c9e82acaa07858150a"],"app.css":[35884,"d527b204c5dbb1e005a48967d02fe8e1e4b0324436aadfc8d7c817565163fba6"],"content.json":[924343,"29d36bf92bbce20c63dae69acf9bacae8e3ef5974cd14916af97627fecb5b776"],"manifest.webmanifest":[694,"28b0d4052b4a1f8d724f3d3a4fa8a96b54e4189fec7fc49cfa667191a1bd56a0"],"audio/index.json":[241308,"336a22a06c55803f16ff5f83e268d4d803daf015e0b1d7ac6f4385b92bc6e401"],"fonts/atkinson-400.woff2":[17208,"d64ba838ef5472bba248620ec4fd8b5aa7cf0db2908e0bb230600caf279ba7bc"],"fonts/atkinson-700.woff2":[17524,"140e2bd25a7315c8a062508391426b0d8c3297400c947b8d847be28f73a199f0"],"fonts/vazirmatn-400.woff2":[50684,"e382101336c6eb32cfb31381c027d02d2e0354bad08f6a395d4088beb3db3d91"],"fonts/vazirmatn-600.woff2":[51032,"6a39a3c25eb18503cad590527b95bb5d4062b889a7ebbd3f01b0488d239e0499"],"fonts/vazirmatn-800.woff2":[51120,"cd67558bbca0ad319b89e3b2edb8a914f87f864951d7a9d24e1404cbf3b45b02"],"icons/apple-touch-icon.png":[3363,"a21fec5f82ef103432e67f7134761805675220fb65535139f54fe209a050d09e"],"icons/icon-192.png":[3619,"afbdd5ea469ebc03780e08f1fa3dbe575ba00bb12cafb075e3d3caa4a242d6f5"],"icons/icon-512.png":[9689,"4a33411599dd5dc9c94cffc66aa5840583f159016e48266ec0b6575fd5994656"],"icons/icon-maskable-512.png":[8383,"e7be565014d3969dab192c02c04b86e0a771964e6422e93123c514b1a9a4100b"],"icons/icon.svg":[379,"fa9c14ff771dd3ac8ebc5cf3f24aaa52303618d374537cb5b2c113ad1c34556a"],"audio/core.fffd2c16.mp3":[439488,"c6d19f24a72906fcb50a3145b74f903e4f5b459a23825ef94cfb38e1b2ebbe8d"],"audio/words.165db891.mp3":[2937600,"80a42b64e131d52543b79b2c97c78d5ecb73fdb600beb8930197099ad82607ca"]};                  // path -> [bytes, sha256 hex], made by tools/build.mjs
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

// The list of sound packs of this version, read from the stored app (it was checked when it was stored).
let packList = null;
async function packFor(path) {
  if (!packList) {
    try {
      const r = await (await caches.open(SHELL)).match('audio/index.json');
      packList = r ? new Map((await r.json()).packs.map((p) => ['audio/' + p.file, p])) : null;
    } catch { packList = null; }
  }
  return packList ? packList.get(path) || null : null;
}
// The bytes of a sound pack, if they are that pack: its size from the list, its hash from its name.
async function goodPack(path, buf) {
  const p = await packFor(path);
  const m = /\.([0-9a-f]{8})\.mp3$/.exec(path);
  return !!(p && m && (await matches(buf, p.bytes, 'SHA-1', m[1])));
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
      const idx = await (await (await caches.open(SHELL)).match('audio/index.json')).json();
      const keep = new Set(idx.packs.map((p) => new URL('audio/' + p.file, self.registration.scope).href));
      const c = await caches.open(AUDIO);
      for (const req of await c.keys()) {
        if (!keep.has(req.url)) { await c.delete(req); continue; }
        // a login page stored by an earlier version of this worker (before stored sounds were checked)
        const res = await c.match(req);
        if (!res || !/^audio\//i.test(res.headers.get('Content-Type') || '')) await c.delete(req);
      }
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
      if (!res.ok || res.status !== 200 || res.redirected || looksLikePage(res)) return res;
      // stored only if these are the pack's own bytes; either way the page gets what came (src/js/audio.js checks it too)
      const buf = await res.arrayBuffer();
      if (await goodPack(path, buf)) { try { await (await caches.open(AUDIO)).put(req, keepable(buf, res, 'audio/mpeg')); } catch { /* storage full */ } }
      return new Response(buf, { status: res.status, headers: res.headers });
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
    if (EXTRA.includes(path)) {                     // a font or picture that could not be stored at install: stored now if it is the right file
      try { const good = await fetchChecked(path); cache.put(path, good.clone()); return good; } catch { /* not the right file now: let the network answer as it is */ }
    }
    try { return await fetch(req); } catch (err) { return offline(); }
  })());
});
