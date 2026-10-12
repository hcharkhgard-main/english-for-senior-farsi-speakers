// The service worker, tested in a browser: what is stored, what a link can and cannot do to it,
// how a new version arrives, and two copies of the app on one address.
//   HAMRAH_SITE=<built site> PORT=<port> node tests/e2e/offline.mjs
// Covers: a link to any file of the site cannot replace the stored app (the app still opens
// offline afterwards); a new version waits while a lesson is open and is switched on at the home
// screen or the next start, with one reload; cache names carry the site's path, so a second copy
// on the same origin does not delete the first copy's lessons; files left by the earlier naming
// scheme are taken over; installation survives a font that fails to download; a lesson opened in the
// first moments of the first visit (before the service worker is in charge) is kept all the same;
// a Wi-Fi login page ("captive portal", 200 text/html) is never stored as a sound pack or as a file of the
// app, and the lesson plays again once the connection is normal — also with the server stopped afterwards;
// after an ordinary first day (one lesson, then home) the next review set, number listening and the papers
// near that lesson and its conversation play with the server stopped the next day, and Settings says which parts are
// ready (and calls the lessons "some" while only some are stored); a page, script or lesson file replaced in storage by
// another site on the same address is not served (fetched again online, refused offline).
//
// "No connection" here means that the browser is told it is offline AND the test's server stops
// answering. Playwright's setOffline alone does not cut the service worker's own requests: a file
// missing from the stored app would quietly be fetched, and these checks could not notice it.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = +(process.env.PORT || 8140), SITE = process.env.HAMRAH_SITE ? path.resolve(process.env.HAMRAH_SITE) : path.join(ROOT, 'site'), ORIGIN = `http://localhost:${PORT}`;

// "version B": the same site with another build id and a marker in its script, laid over the real one
const B = fs.mkdtempSync(path.join(os.tmpdir(), 'hamrah-b-'));
const idA = /const BUILD = '([0-9a-f]+)'/.exec(fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8'))[1];
for (const f of ['sw.js', 'index.html']) fs.writeFileSync(path.join(B, f), fs.readFileSync(path.join(SITE, f), 'utf8').replaceAll(idA, 'bbbbbbbbbb'));
fs.writeFileSync(path.join(B, 'app.js'), fs.readFileSync(path.join(SITE, 'app.js'), 'utf8') + '\n;window.__hamrahBuild="B";');
// the worker of B lists the size and hash of B's own files (it refuses any other: src/sw.js)
{
  const swB = fs.readFileSync(path.join(B, 'sw.js'), 'utf8'), m = /const INTEGRITY = (\{.*?\});/.exec(swB);
  const list = JSON.parse(m[1]);
  for (const f of ['index.html', 'app.js']) { const buf = fs.readFileSync(path.join(B, f)); list[f] = [buf.length, crypto.createHash('sha256').update(buf).digest('hex')]; }
  fs.writeFileSync(path.join(B, 'sw.js'), swB.replace(m[0], `const INTEGRITY = ${JSON.stringify(list)};`));
}
const T = JSON.parse(fs.readFileSync(path.join(SITE, 'content.json'), 'utf8')).ui.strings;      // interface text, never written out here

// a small server: / and the two "copies" /one/ and /two/ serve the site; `overlay` lays version B on top; `fail` breaks chosen files;
// `slow` holds chosen files back for a while; `dead` drops every connection (the server is "unplugged")
let overlay = null, fail = null, slow = null, slowMs = 2500, dead = false, portal = null;
// `portal` (a RegExp or a function of the path): those requests are answered by a Wi-Fi login page, 200 text/html
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ort': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  if (dead) { req.socket.destroy(); return; }
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const pre of ['/one/', '/two/']) if (p.startsWith(pre)) p = p.slice(pre.length - 1);
  if (p.endsWith('/')) p += 'index.html';
  if (fail && fail.test(p)) { res.writeHead(503); res.end('injected failure'); return; }
  if (portal && (typeof portal === 'function' ? portal(p) : portal.test(p))) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html><body><h1>Welcome to Free WiFi</h1><a href="/login">Accept terms</a></body></html>'); return; }
  if (slow && slow.test(p)) { await new Promise((r) => setTimeout(r, slowMs)); if (dead) { req.socket.destroy(); return; } }
  let f = overlay && fs.existsSync(path.join(overlay, p)) ? path.join(overlay, p) : path.join(SITE, p);
  if (!path.resolve(f).startsWith(overlay && f.startsWith(overlay) ? overlay : SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT);
await new Promise((r) => setTimeout(r, 300));
const useA = () => { overlay = null; }, useB = () => { overlay = B; };
const unplug = async (ctx) => { dead = true; await ctx.setOffline(true); };
const plug = async (ctx) => { dead = false; await ctx.setOffline(false); };

const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const ready = (page) => page.waitForFunction(() => window.hamrah && document.querySelector('.topbar'), null, { timeout: 30000 });
const controlled = (page) => page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30000 });
const cacheNames = (page) => page.evaluate(() => caches.keys());
const waiting = (page) => page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.waiting); });
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR' };
// Starts each clip and reports what happened: { plays: n } when all could be played, 'offline' for a sound that is neither stored nor reachable.
const playAll = (page, clips) => page.evaluate(async (clips) => {
  const a = window.hamrah, res = {};
  for (const c of clips) { const pr = a.audio.play(c); await new Promise((r) => setTimeout(r, 300)); const playing = !!a.audio.current; a.audio.stop(); let r = await pr; if (r === 'stopped' && playing) r = 'plays'; res[r] = (res[r] || 0) + 1; }
  return res;
}, clips);
const lessonClips = (page, id) => page.evaluate((id) => window.hamrah.content.lessons[id].phrases.map((p) => ({ lang: 'en', voice: p.voice || 's', speed: 'n', text: p.say || p.en })), id);
const audioStored = (page) => page.evaluate(async () => { const n = (await caches.keys()).find((k) => k.endsWith('|audio')); return n ? (await (await caches.open(n)).keys()).map((k) => k.url.split('/').pop().split('.')[0]) : []; });

try {
  // ---- a link to a file of the site cannot replace the stored app ---------------------------------
  {
    const ctx = await b.newContext(phone);
    const page = await ctx.newPage();
    await page.goto(ORIGIN + '/'); await ready(page); await controlled(page); await page.waitForTimeout(1200);
    const stored = () => page.evaluate(async () => { const n = (await caches.keys()).find((k) => k.includes('shell-')); const r = await (await caches.open(n)).match('index.html'); return r ? `${r.headers.get('content-type')} ${(await r.text()).slice(0, 15)}` : 'missing'; });
    const before = await stored();
    for (const target of ['content.json', 'icons/icon.svg', 'sw.js', 'audio/index.json', 'app.js?x=1', 'nosuchfile']) {
      const p2 = await ctx.newPage(); await p2.goto(`${ORIGIN}/${target}`).catch(() => {}); await p2.waitForTimeout(500); await p2.close();
    }
    check('after opening six other addresses of the site, the stored app page is unchanged (still HTML)', (await stored()) === before && /^text\/html/.test(before), await stored());
    await unplug(ctx);
    const p3 = await ctx.newPage(); await p3.goto(ORIGIN + '/').catch(() => {});
    const ok = await ready(p3).then(() => true).catch(() => false);
    check('…and the app still opens with no connection (server stopped)', ok);
    if (ok) {
      await p3.evaluate(() => { window.hamrah.store.update((s) => { s.onboard.done = true; s.settings.auto = false; }); window.hamrah.go('sos'); }); await p3.waitForTimeout(300);
      check('…with the emergency phrases', (await p3.locator('.mini-play').count()) >= 12);
      const sos = await p3.evaluate(() => window.hamrah.content.emergency.phrases.flatMap((p) => ['n', 's'].map((speed) => ({ lang: 'en', voice: 's', speed, text: p.say || p.en }))));
      const heard = await playAll(p3, sos);
      check('…and every emergency phrase has its sound, at both speeds, with the server stopped', heard.plays === sos.length, heard);
      // the control: this is what a sound that was NOT stored looks like — so the checks above can fail
      const never = await playAll(p3, await lessonClips(p3, 'bank-help'));
      check('(control) a lesson that was never opened has no sound now: the test really is cut off', !never.plays && never.offline > 0, never);
    }
    const p4 = await ctx.newPage(); await p4.goto(ORIGIN + '/index.html?source=homescreen').catch(() => {});
    check('the app also opens offline from its other address (index.html, with a query)', await ready(p4).then(() => true).catch(() => false));
    await plug(ctx); await ctx.close();
  }
  // ---- a lesson opened in the first moments of the first visit is kept for later ------------------
  // The service worker is held back, so the lesson's sound is fetched by the page itself, before the worker is in charge.
  {
    slow = /^\/sw\.js$/; slowMs = 9000;
    const ctx = await b.newContext(phone);
    const page = await ctx.newPage(); await page.goto(ORIGIN + '/'); await ready(page);
    const early = await page.evaluate(async () => {
      const a = window.hamrah; a.store.update((s) => { s.onboard.done = true; s.settings.auto = false; });
      const controlled = !!navigator.serviceWorker.controller;
      a.go('lesson.store-where'); await a.audio.loadIndex(); await a.audio.warm(a.audio.deps('l-store-where'));
      return controlled;
    });
    const clips = await lessonClips(page, 'store-where');
    const online = await playAll(page, clips);
    const atOnce = { stored: await audioStored(page), controlled: await page.evaluate(() => !!navigator.serviceWorker.controller) };
    slow = null; slowMs = 2500;
    await controlled(page); await page.waitForTimeout(2500);
    const stored = await audioStored(page);
    check('first visit: the lesson was opened before the service worker was in charge, and its sound played', early === false && online.plays === clips.length, { controlledThen: early, online });
    check('…its sound file is stored at once, without waiting for the service worker', atOnce.controlled === false && atOnce.stored.some((x) => /^l-store-where/.test(x)), atOnce);
    check('…and is still stored when the service worker has taken charge', stored.some((x) => /^l-store-where/.test(x)), stored.join(','));
    check('…and the first sounds, which come with the app, are not stored a second time', !stored.some((x) => /^(core|words)$/.test(x)), stored.join(','));
    await unplug(ctx);
    await page.reload().catch(() => {});
    const again = await ready(page).then(() => true).catch(() => false);
    const later = again ? await page.evaluate(() => { window.hamrah.go('lesson.store-where'); }).then(() => playAll(page, clips)) : {};
    check('…so with the server stopped the app restarts and the whole lesson can be heard', again && later.plays === clips.length, later);
    await plug(ctx); await ctx.close();
  }
  // ---- a Wi-Fi login page ("captive portal") is never stored --------------------------------------
  // Hotel, clinic and library Wi-Fi answer every request with their login page (200, text/html) until the
  // terms are accepted. Before this was handled, one such answer stayed on the phone as the lesson's sound
  // (silent for good) or as a file of the app (the app no longer opened).
  {
    const ctx = await b.newContext(phone);
    const page = await ctx.newPage(); await page.goto(ORIGIN + '/'); await ready(page); await controlled(page); await page.waitForTimeout(1200);
    await page.evaluate(() => window.hamrah.store.update((s) => { s.onboard.done = true; s.settings.auto = false; }));
    const clips = await lessonClips(page, 'bank-help');
    portal = /^\/audio\/l-bank-help\..*\.mp3$/;
    await page.evaluate(() => window.hamrah.go('lesson.bank-help'));
    const onPortal = await playAll(page, clips);
    await page.waitForTimeout(800);
    const kept = (await audioStored(page)).filter((x) => /^l-bank-help/.test(x));
    check('on a Wi-Fi login page a lesson\'s sound is "not ready yet", nothing is stored, nothing throws', onPortal.unavailable === clips.length && kept.length === 0, { onPortal, kept });
    // what the learner is told: tap a listen button of the lesson
    await page.evaluate(() => { const a = window.hamrah; a.store.update((s) => { s.at['bank-help'] = { pos: 1, short: false, t: Date.now() }; }); a.go('home', { reset: true }); a.go('lesson.bank-help'); });
    await page.waitForTimeout(800);
    await page.locator('main [data-play]').first().click(); await page.waitForTimeout(1500);
    const told = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((e) => e.textContent).join(' '));
    const stuck = await page.locator('[data-play].is-playing').count();
    check('…the learner is told calmly in Farsi, and no button stays marked "playing"', told.includes(T['audio.notReady']) && stuck === 0, { told: told.slice(0, 80), stuck });
    portal = null;
    await page.reload(); await ready(page);
    await page.evaluate(() => window.hamrah.go('lesson.bank-help'));
    const back = await playAll(page, clips);
    await page.waitForTimeout(800);
    check('…back on a normal connection the whole lesson plays and is stored', back.plays === clips.length && (await audioStored(page)).some((x) => /^l-bank-help/.test(x)), back);
    await unplug(ctx); await page.reload().catch(() => {}); await ready(page);
    await page.evaluate(() => window.hamrah.go('lesson.bank-help'));
    const off = await playAll(page, clips);
    check('…and then also with the server stopped', off.plays === clips.length, off);
    await plug(ctx); await ctx.close();
  }
  {
    // the app installed while the worker's own download of content.json is answered by the login page
    const ctx = await b.newContext(phone);
    let n = 0; portal = (p) => p === '/content.json' && ++n > 1;      // the page's own request gets through, the worker's does not
    const page = await ctx.newPage(); await page.goto(ORIGIN + '/'); await ready(page); await page.waitForTimeout(4000);
    const shell = await page.evaluate(async () => { const k = (await caches.keys()).find((x) => x.includes('shell-')); if (!k) return null; const r = await (await caches.open(k)).match('content.json'); return r ? r.headers.get('content-type') : 'none'; });
    check('a login page instead of a file of the app: that version is not installed (nothing half-stored)', shell === null || shell === 'none', shell);
    portal = null;
    await page.reload(); const opens = await ready(page).then(() => true, () => false); await controlled(page).catch(() => {}); await page.waitForTimeout(1500);
    await unplug(ctx); await page.reload().catch(() => {});
    const offline = await ready(page).then(() => true, () => false);
    check('…the next normal visit installs it, and the app then opens with the server stopped', opens && offline);
    await plug(ctx); await ctx.close();
  }
  // ---- an ordinary first day: tomorrow's review, number listening and papers work offline --------
  {
    const ctx = await b.newContext(phone);
    const page = await ctx.newPage();
    await page.addInitScript(() => { const RD = Date; const shift = () => Number(sessionStorage.getItem('t.shift') || 0); class D extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + shift()); } static now() { return RD.now() + shift(); } } window.Date = D; });
    await page.goto(ORIGIN + '/'); await ready(page); await controlled(page);
    // the first lesson, finished the ordinary way (its last screen's Next), then home
    const first = await page.evaluate(() => { const a = window.hamrah; a.store.update((s) => { s.onboard.done = true; s.settings.auto = false; }); return a.nextLesson().id; });
    await page.evaluate((id) => { const a = window.hamrah; a.store.update((s) => { s.at[id] = { pos: 999, short: false, t: Date.now() }; }); a.go('lesson.' + id); }, first);
    for (let i = 0; i < 4 && !(await page.evaluate((id) => !!window.hamrah.store.state.done[id], first)); i++) { await page.waitForTimeout(500); await page.locator('[data-next]').last().click().catch(() => {}); }
    check(`first day: lesson ${first} finished`, await page.evaluate((id) => !!window.hamrah.store.state.done[id], first));
    await page.evaluate(() => window.hamrah.home());
    // what Settings will show, once the app has had a short while at home with a connection
    const want = await page.evaluate(async () => { const a = window.hamrah; await a.audio.loadIndex(); return a.audio.index.packs.filter((p) => ['n-numbers', 'v-basics'].includes(p.id)).map((p) => p.id); });
    for (let i = 0; i < 60; i++) { const have = await audioStored(page); if (want.every((w) => have.includes(w))) break; await page.waitForTimeout(1000); }
    await page.waitForTimeout(2500);
    const kept = await audioStored(page);
    check('…after a short while at home with a connection, the sounds of what comes next are stored', want.every((w) => kept.includes(w)), kept.join(' '));
    await unplug(ctx);
    await page.evaluate(() => sessionStorage.setItem('t.shift', String(86400000)));
    await page.reload().catch(() => {}); await ready(page);
    const day2 = await page.evaluate(() => ({ today: window.hamrah.today() }));
    const set = await page.evaluate(async () => {
      const a = window.hamrah;
      // the first review set of the day, as the review screen builds it
      a.go('review'); await new Promise((r) => setTimeout(r, 500));
      const S = a.ui.rev; return S ? S.queue : [];
    });
    const reviewClips = await page.evaluate((ids) => ids.map((id) => window.hamrah.item(id)).filter(Boolean).map((it) => ({ lang: 'en', voice: it.voice || 's', speed: 'n', text: it.say || it.en })), set);
    const rev = await playAll(page, reviewClips);
    check('next day, server stopped: every card of the first review set has its sound', set.length > 0 && rev.plays === reviewClips.length, { cards: set.length, ...rev, day: day2.today });
    const nums = await page.evaluate(() => window.hamrah.content.numbers.slice(0, 8).map((n, i) => ({ lang: 'en', voice: n.voice || (i % 2 ? 'm' : 's'), speed: 'n', text: n.say })));
    const numHeard = await playAll(page, nums);
    check('…number listening plays', numHeard.plays === nums.length, numHeard);
    const paperClips = await page.evaluate((first) => { const a = window.hamrah; return (a.content.papers || []).filter((P) => P.stage === 1 || P.lesson === first).flatMap((P) => P.lines.map((l) => ({ lang: 'en', voice: 's', speed: 'n', text: l.en, tts: false }))).filter((c) => a.audio.has(c)); }, first);
    const papHeard = paperClips.length ? await playAll(page, paperClips) : { plays: 0 };
    check('…the recorded lines of the papers near that lesson play', papHeard.plays === paperClips.length, { recorded: paperClips.length, ...papHeard });
    // the conversations of that lesson — the done screen's main next step (QA round 4, features M1)
    const talkClips = await page.evaluate((first) => { const a = window.hamrah, c = a.content; return ((c.practiceAll || {})[first] || []).flatMap((rid) => { const R = c.roleplays.find((r) => r.id === rid); return R ? R.turns.map((t) => ({ lang: 'en', voice: R.them.voice, speed: 'n', text: t.them.say || t.them.en, tts: false })) : []; }).filter((c) => a.audio.has(c)); }, first);
    const talkHeard = talkClips.length ? await playAll(page, talkClips) : { plays: 0 };
    check('…every recorded line of the other person in that lesson\'s conversation plays', talkClips.length > 0 && talkHeard.plays === talkClips.length, { recorded: talkClips.length, ...talkHeard });
    await page.evaluate(() => window.hamrah.go('settings')); await page.waitForTimeout(2500);
    const parts = await page.evaluate(() => { const l = document.querySelector('[data-offline-parts]'); return l ? [...l.children].map((li) => li.textContent.trim()) : []; });
    const ready2 = (label) => parts.some((x) => x.includes(label) && x.includes(T['off.yes']));
    check('…and Settings says, in words, that review, number listening, the conversations and the emergency phrases are ready', ready2(T['off.part.review']) && ready2(T['off.part.numbers']) && ready2(T['off.part.talks']) && ready2(T['off.part.sos']), parts);
    // a part is "ready" only when all of it is: two lessons of seventy-odd are «بعضی», with no tick (QA round 4, accessibility M2)
    const lessonsRow = await page.evaluate(() => { const li = [...document.querySelectorAll('[data-offline-parts] li')][1]; return li ? { state: li.querySelector('strong').textContent.trim(), ready: li.dataset.ready, tick: !!li.querySelector('svg') && li.querySelector('svg').style.color.includes('good') } : null; });
    check('…and the lessons are not called ready while only some are stored', !!lessonsRow && lessonsRow.ready === 'some' && lessonsRow.state === T['off.some'] && !lessonsRow.tick, lessonsRow);
    // the conversation list says, in words, which conversations have their sound on the phone; one that has not
    // does not start in silence: a calm note, and the other person's words to read (QA round 5, usability M1)
    const firstTalks = await page.evaluate((first) => (window.hamrah.content.practiceAll || {})[first] || [], first);
    await page.evaluate(() => window.hamrah.go('talk')); await page.waitForTimeout(4000);
    const marks = await page.evaluate(() => [...document.querySelectorAll('main button.item')].map((b) => ({ t: (b.querySelector('.t') || {}).textContent, kept: (b.querySelector('[data-kept]') || { dataset: {} }).dataset.kept || null, text: (b.querySelector('[data-kept]') || {}).textContent || '' })).filter((x) => x.t && window.hamrah.content.roleplays.some((r) => r.title === x.t)));
    const titleOf = await page.evaluate((ids) => ids.map((id) => window.hamrah.content.roleplays.find((r) => r.id === id).title), firstTalks);
    check('…the conversation list marks, in words, which conversations work offline and which have no sound yet',
      marks.length > 0 && marks.every((m) => m.kept === 'true' || m.kept === 'false') && marks.filter((m) => titleOf.includes(m.t)).every((m) => m.kept === 'true' && m.text.includes(T['talk.kept'])) && marks.some((m) => m.kept === 'false' && m.text.includes(T['talk.notKept'])), { marks: marks.slice(0, 6), titleOf });
    const phoneTalks = await page.evaluate(async () => { const a = window.hamrah; await a.audio.loadIndex(); return a.content.roleplays.filter((r) => r.phone).map((r) => r.id); });
    let silentId = null;      // a phone conversation of which a sound pack is not stored
    for (const rid of phoneTalks) { const has = await page.evaluate(async (rid) => { const a = window.hamrah; const deps = a.audio.deps('r-' + rid); const names = await caches.keys(); for (const d of deps) { const p = a.audio.index.packs.find((x) => x.id === d); let ok = false; for (const n of names) { const c = await caches.open(n); if (await c.match(new URL(a.audio.packUrl(p.id), document.baseURI).href)) ok = true; } if (!ok) return false; } return true; }, rid); if (!has) { silentId = rid; break; } }
    await page.evaluate((rid) => window.hamrah.go('rp.' + rid), silentId); await page.waitForTimeout(2500);
    const before = await page.evaluate(() => [...document.querySelectorAll('main .note')].map((n) => n.textContent).join(' | '));
    await page.getByText(T['rp.start']).click(); await page.waitForSelector('.bubble.them'); await page.waitForTimeout(800);
    const shown = await page.evaluate(() => { const b = document.querySelector('.bubble.them'); return { mask: !!b.querySelector('.phone-mask'), en: (b.querySelector('[lang="en"]') || {}).textContent || '' }; });
    check('…a phone conversation whose sound is not on the phone says so calmly, and its first line can be read', !!silentId && before.includes(T['talk.offline']) && !shown.mask && shown.en.length > 5, { silentId, before: before.slice(0, 120), shown });
    await plug(ctx); await ctx.close();
  }
  // ---- another site on the same address replaces stored files (QA round 4, security M1) ----------
  // Every repository of one GitHub account shares the origin USERNAME.github.io, so another project's page can open
  // this app's caches. The worker checks each stored file against its list every time it serves it.
  {
    const ctx = await b.newContext(phone);
    const page = await ctx.newPage();
    await page.goto(ORIGIN + '/one/'); await ready(page); await controlled(page); await page.waitForTimeout(800);
    await page.close();
    const replace = async () => {
      const other = await ctx.newPage(); await other.goto(ORIGIN + '/elsewhere/');
      await other.evaluate(async () => {
        const c = await caches.open((await caches.keys()).find((k) => k.startsWith('hamrah|/one/|shell-'))), base = location.origin + '/one/';
        const html = await (await c.match(base + 'index.html')).text();
        await c.put(base + 'index.html', new Response(html.replace('</body>', '<script>window.__replaced=1</script></body>'), { headers: { 'Content-Type': 'text/html' } }));
        const js = await (await c.match(base + 'app.js')).text();
        await c.put(base + 'app.js', new Response(js + '\n;window.__replacedJs=1;', { headers: { 'Content-Type': 'text/javascript' } }));
        const cj = await (await c.match(base + 'content.json')).json(); cj.emergency.phrases[0].fa = 'REPLACED';
        await c.put(base + 'content.json', new Response(JSON.stringify(cj), { headers: { 'Content-Type': 'application/json' } }));
      });
      await other.close();
    };
    await replace();
    const p2 = await ctx.newPage(); await p2.goto(ORIGIN + '/one/'); await ready(p2);
    const got = await p2.evaluate(() => ({ page: !!window.__replaced, script: !!window.__replacedJs, lessons: window.hamrah.content.emergency.phrases[0].fa === 'REPLACED' }));
    check('a page, script or lesson file replaced in storage by another site on the same address is not served', !got.page && !got.script && !got.lessons, got);
    const fixed = await p2.evaluate(async () => { const c = await caches.open((await caches.keys()).find((k) => k.startsWith('hamrah|/one/|shell-'))); return !(await (await c.match('index.html')).text()).includes('__replaced') && !(await (await c.match('app.js')).text()).includes('__replacedJs'); });
    check('…the right files are stored again', fixed);
    await p2.close();
    await replace();
    await unplug(ctx);
    const p3 = await ctx.newPage(); await p3.goto(ORIGIN + '/one/').catch(() => {}); await p3.waitForTimeout(1500);
    const off = await p3.evaluate(() => ({ replaced: !!window.__replaced, app: !!window.hamrah })).catch(() => ({ replaced: false, app: false }));
    const offText = await p3.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, text: document.body ? document.body.innerText : '' })).catch(() => ({ text: '' }));
    check('…and without a connection a replaced page is not run at all', !off.replaced && !off.app, off);
    check('…the learner sees a calm page in Farsi instead of the English word "Offline" (QA round 5, usability L5)', offText.lang === 'fa' && offText.dir === 'rtl' && offText.text.includes(T['offline.page.title']) && offText.text.includes('911') && !/^Offline$/.test(offText.text.trim()), offText);
    await plug(ctx); await ctx.close();
  }
  // ---- update while in a lesson: nothing happens until home ------------------------------------
  {
    const ctx = await b.newContext(phone);
    const page = await ctx.newPage(); let loads = 0; page.on('load', () => loads++);
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ORIGIN + '/'); await ready(page); await controlled(page);
    await page.evaluate(() => { window.hamrah.store.update((s) => { s.onboard.done = true; s.settings.auto = false; }); window.hamrah.go('home', { reset: true }); });
    const names0 = await cacheNames(page);
    check('cache names carry the path of this copy and the build', names0.some((n) => n === `hamrah|/|shell-${idA}`) && names0.some((n) => n === 'hamrah|/|audio') || names0.some((n) => n === `hamrah|/|shell-${idA}`), names0.join(' , '));
    await page.evaluate(() => window.hamrah.go('lesson.social-hello')); await page.waitForTimeout(400);
    await page.locator('[data-next]').click(); await page.waitForTimeout(450); await page.locator('[data-next]').click(); await page.waitForTimeout(300);
    await page.evaluate(() => { window.__mark = 'same page'; });
    useB();
    await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    await page.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.waiting); }, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const mid = await page.evaluate(() => ({ mark: window.__mark, build: window.__hamrahBuild || 'A', hash: location.hash, lbl: document.querySelector('.progress .lbl').textContent }));
    check('a new version found in the middle of a lesson waits: no reload, same screen', mid.mark === 'same page' && mid.build === 'A' && mid.hash === '#lesson.social-hello' && (await waiting(page)), mid);
    const before = loads;
    await page.locator('.tb-btn', { hasText: T['nav.home'] }).click();
    await page.waitForFunction(() => window.__hamrahBuild === 'B' && window.hamrah && document.querySelector('.choice'), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const fin = await page.evaluate(() => ({ mark: window.__mark || null, build: window.__hamrahBuild || 'A', hash: location.hash, choices: document.querySelectorAll('.choice').length }));
    check('on reaching home the new version is switched on and the page reloads exactly once', fin.build === 'B' && fin.mark === null && fin.hash === '#home' && fin.choices === 4 && loads - before === 1, { ...fin, reloads: loads - before });
    const names1 = await cacheNames(page);
    check('the old version\'s files are gone, the new version\'s are stored', names1.includes('hamrah|/|shell-bbbbbbbbbb') && !names1.includes(`hamrah|/|shell-${idA}`), names1.join(' , '));
    check('the lesson position survived the update', await page.evaluate(() => { const s = window.hamrah.store.state; return (s.at && s.at['social-hello'] && s.at['social-hello'].pos === 2) || (s.current && s.current.pos === 2); }));
    await unplug(ctx); await page.reload().catch(() => {});
    await ready(page).then(() => check('offline start (server stopped) works on the new version', true)).catch(() => check('offline start (server stopped) works on the new version', false));
    check('…and it is version B that starts offline', (await page.evaluate(() => window.__hamrahBuild).catch(() => null)) === 'B');
    await plug(ctx);
    check('no page errors during the update', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
  // ---- update found while the app is closed: applied at the next start -------------------------
  {
    useA();
    const ctx = await b.newContext(phone);
    let page = await ctx.newPage();
    await page.goto(ORIGIN + '/'); await ready(page); await controlled(page);
    await page.evaluate(() => { window.hamrah.store.update((s) => { s.onboard.done = true; }); window.hamrah.go('settings'); });
    useB();
    await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    await page.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.waiting); }, null, { timeout: 30000 });
    check('with Settings open, the new version waits', (await page.evaluate(() => window.__hamrahBuild || 'A')) === 'A');
    await page.close();
    page = await ctx.newPage(); let loads = 0; page.on('load', () => loads++);
    await page.goto(ORIGIN + '/');
    await page.waitForFunction(() => window.__hamrahBuild === 'B' && window.hamrah && document.querySelector('.choice'), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
    check('next start: the new version is in use (at most one extra reload)', (await page.evaluate(() => window.__hamrahBuild)) === 'B' && loads <= 2, `loads ${loads}`);
    await ctx.close();
  }
  // ---- two copies on one origin + caches left by the earlier version ----------------------------
  {
    useA();
    const ctx = await b.newContext(phone);
    const seed = await ctx.newPage();
    await seed.goto(ORIGIN + '/one/config.json');
    await seed.evaluate(async (origin) => {         // what the previous release left behind, for two different copies
      const a = await caches.open('hamrah-audio-v1');
      await a.put(origin + '/one/audio/old-pack.mp3', new Response('one', { headers: { 'Content-Type': 'audio/mpeg' } }));
      await a.put(origin + '/elsewhere/audio/their-pack.mp3', new Response('theirs', { headers: { 'Content-Type': 'audio/mpeg' } }));
      const s1 = await caches.open('hamrah-shell-oldbuild'); await s1.put(origin + '/one/index.html', new Response('old one')); await s1.put(origin + '/elsewhere/index.html', new Response('old elsewhere'));
      const r = await caches.open('hamrah-asr-v1'); await r.put(origin + '/one/asr/tokens.txt', new Response('tok'));
    }, ORIGIN);
    const one = await ctx.newPage(); await one.goto(ORIGIN + '/one/'); await ready(one); await controlled(one);
    await one.evaluate(() => { window.hamrah.store.update((s) => { s.onboard.done = true; }); });
    await one.evaluate(async () => { await window.hamrah.audio.loadIndex(); await window.hamrah.audio.warm(['l-social-hello']); });
    await one.waitForTimeout(800);
    const packs = (page, name) => page.evaluate(async (name) => (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname), name);
    const oneAudio0 = await packs(one, 'hamrah|/one/|audio');
    const two = await ctx.newPage(); await two.goto(ORIGIN + '/two/'); await ready(two); await controlled(two);
    await two.evaluate(async () => { await window.hamrah.audio.loadIndex(); await window.hamrah.audio.warm(['l-store-where']); });
    await two.waitForTimeout(1200);
    const names = await cacheNames(two);
    const oneAudio1 = await packs(two, 'hamrah|/one/|audio'), twoAudio = await packs(two, 'hamrah|/two/|audio');
    check('each copy has its own caches', names.some((n) => n.startsWith('hamrah|/one/|shell-')) && names.some((n) => n.startsWith('hamrah|/two/|shell-')), names.join(' , '));
    check('opening the second copy did not delete the first copy\'s lesson audio', oneAudio0.some((p) => /social-hello/.test(p)) && JSON.stringify(oneAudio0.filter((p) => !/old-pack/.test(p))) === JSON.stringify(oneAudio1.filter((p) => !/old-pack/.test(p))) && twoAudio.some((p) => /store-where/.test(p)), { one: oneAudio1.length, two: twoAudio.length });
    const legacy = await two.evaluate(async () => { const out = {}; for (const n of ['hamrah-audio-v1', 'hamrah-shell-oldbuild', 'hamrah-asr-v1']) out[n] = (await caches.has(n)) ? (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname) : null; return out; });
    const asrName = names.find((n) => n.startsWith('hamrah|/one/|asr-'));
    check('files of the earlier version: this copy\'s were taken over or removed, another site\'s were left alone', JSON.stringify(legacy['hamrah-audio-v1']) === '["/elsewhere/audio/their-pack.mp3"]' && JSON.stringify(legacy['hamrah-shell-oldbuild']) === '["/elsewhere/index.html"]' && legacy['hamrah-asr-v1'] === null && !!asrName && (await packs(two, asrName)).includes('/one/asr/tokens.txt'), legacy);
    check('an old audio pack that is no longer in the curriculum was dropped', !oneAudio1.some((p) => /old-pack/.test(p)), oneAudio1.join(','));
    check('the page and the service worker agree on the pronunciation-checker cache name', await one.evaluate(async (asrName) => { await window.hamrah.speech.isCached(); return caches.has(asrName); }, asrName), asrName);
    await ctx.close();
  }
  // ---- install with one extra file failing -----------------------------------------------------------
  {
    fail = /^\/fonts\//;
    const ctx = await b.newContext(phone);
    const page = await ctx.newPage(); await page.goto(ORIGIN + '/'); await ready(page);
    const ok = await controlled(page).then(() => true).catch(() => false);
    check('installation succeeds although every font failed to download', ok);
    fail = null;
    await page.reload(); await ready(page); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(800);
    const stored = await page.evaluate(async () => { const n = (await caches.keys()).find((k) => k.includes('shell-')); return (await (await caches.open(n)).keys()).filter((r) => /fonts\//.test(r.url)).length; });
    check('the fonts are stored the next time they are used', stored > 0, `fonts stored: ${stored}`);
    fail = /^\/(app\.js|content\.json)$/;
    const ctx2 = await b.newContext(); const p2 = await ctx2.newPage(); await p2.goto(ORIGIN + '/one/config.json');
    const res = await p2.evaluate(async () => { try { const r = await navigator.serviceWorker.register('sw.js'); await new Promise((res) => setTimeout(res, 2500)); return { active: !!r.active, installing: !!r.installing, waiting: !!r.waiting }; } catch (e) { return { error: String(e) }; } });
    check('if a file the app cannot start without fails, nothing half-installed is left in charge', !res.active, res);
    fail = null;
    await ctx.close(); await ctx2.close();
  }
} catch (err) {
  check('test run completed', false, String(err && err.message).slice(0, 300));
} finally { await b.close(); server.close(); fs.rmSync(B, { recursive: true, force: true }); }
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
