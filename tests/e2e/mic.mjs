// The microphone never opens, or stays open, after the learner has moved on — and nothing heard is
// recognised or sent to the optional AI partner afterwards.
//   HAMRAH_SITE=<built site> PORT=<port> node tests/e2e/mic.mjs [--only <part of a scenario name>] [--tmp DIR]
// A spoken sentence is fed through Chromium's fake microphone. In every scenario the page's
// getUserMedia is wrapped, so the test sees from inside the page when the microphone was asked
// for, which MediaStream tracks are live and on which screen, and whether anything was recognised
// or sent to the (mocked) AI service after the learner left: Home, Back, Next, the emergency page,
// "not now", answering a review card, locking the phone — while the recogniser is still loading,
// while the phone is asking for permission, while recording and while the recording is checked.
// Two scenarios remove the screen without telling the app at all (a screen that forgets to clean up).
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : '');
const PORT = +(process.env.PORT || 8139), SITE = process.env.HAMRAH_SITE ? path.resolve(process.env.HAMRAH_SITE) : path.join(ROOT, 'site');
const ONLY = arg('--only');
const URL0 = `http://localhost:${PORT}/`;
const HERE = arg('--tmp') ? path.resolve(arg('--tmp')) : fs.mkdtempSync(path.join(os.tmpdir(), 'hamrah-mic-'));
fs.mkdirSync(HERE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), SITE, String(PORT)], { stdio: 'ignore' });
await sleep(700);

// a spoken sentence for the fake microphone (one of the app's own clips), looping: 0.6 s quiet, speech, 3.2 s quiet
const wav = path.join(HERE, 'fake-hello.wav');
if (!fs.existsSync(wav)) {
  const idx = JSON.parse(fs.readFileSync(path.join(SITE, 'audio/index.json'), 'utf8'));
  const { audioKey } = await import(path.join(ROOT, 'src/js/audiokey.js'));
  const ref = idx.clips[audioKey('en', 's', 'n', 'Hello! How are you?')];
  const pack = fs.readFileSync(path.join(SITE, 'audio', idx.packs[ref[0]].file));
  const mp3 = path.join(HERE, 'fake-hello.mp3');
  fs.writeFileSync(mp3, pack.subarray(ref[1], ref[1] + ref[2]));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-t', '0.6', '-i', 'anullsrc=r=48000:cl=mono', '-i', mp3, '-f', 'lavfi', '-t', '3.2', '-i', 'anullsrc=r=48000:cl=mono', '-filter_complex', '[1:a]aresample=48000[v];[0:a][v][2:a]concat=n=3:v=0:a=1', '-ar', '48000', '-ac', '1', wav]);
}

const HOOK = () => {
  const G = (window.__gum = { calls: [], streams: [], delay: 0, breakAC: false, samples: [], left: null, transcribed: [] });
  const md = navigator.mediaDevices;
  const orig = md.getUserMedia.bind(md);
  md.getUserMedia = async (c) => {
    const rec = { at: performance.now(), hash: location.hash, afterLeft: G.left != null };
    G.calls.push(rec);
    if (G.delay) await new Promise((r) => setTimeout(r, G.delay));
    const s = await orig(c);
    G.streams.push(s);
    return s;
  };
  const AC = window.AudioContext, csp = AC.prototype.createScriptProcessor;
  AC.prototype.createScriptProcessor = function (...a) { if (G.breakAC) throw new Error('simulated audio graph failure'); return csp.apply(this, a); };
  const live = () => G.streams.filter((s) => s.getTracks().some((t) => t.readyState === 'live')).length;
  G.live = live;
  setInterval(() => G.samples.push({ t: performance.now(), live: live(), left: G.left != null, ui: !!document.querySelector('.mic-btn.is-live') }), 40);
};
// called in the page just before the learner "leaves": from now on a live track is a defect
const markLeft = (page) => page.evaluate(() => { window.__gum.left = performance.now(); });
const hookTranscribe = (page) => page.evaluate(() => {
  const sp = window.hamrah.speech, o = sp.transcribe;
  sp.transcribe = async (x) => { window.__gum.transcribed.push({ at: performance.now(), afterLeft: window.__gum.left != null, hash: location.hash }); return o.call(sp, x); };
});
const report = (page) => page.evaluate(() => {
  const G = window.__gum, after = G.samples.filter((s) => s.left && s.t > G.left + 120);
  return {
    gumCalls: G.calls.length, gumAfterLeaving: G.calls.filter((c) => c.afterLeft).length,
    liveNow: G.live(), maxLiveEver: Math.max(0, ...G.samples.map((s) => s.live)),
    liveMsAfterLeaving: after.filter((s) => s.live > 0).length * 40,
    liveWithoutRecordingUiMs: G.samples.filter((s) => s.live > 0 && !s.ui).length * 40,
    transcribedAfterLeaving: G.transcribed.filter((t) => t.afterLeft).length, transcribed: G.transcribed.length,
    screen: location.hash,
  };
});

async function open({ ai = false } = {}) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fa-IR', permissions: ['microphone'], serviceWorkers: 'block' });
  await ctx.addInitScript(HOOK);
  const page = await ctx.newPage();
  const errors = [], posts = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  if (ai) {
    await page.route('**/config.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ aiProxyUrl: 'https://proxy.test/chat' }) }));
    // the build writes the configured service into the page's content security policy; do the same for the mock
    await page.route(URL0, async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("connect-src 'self'", "connect-src 'self' https://proxy.test") }); });
    await page.route('https://proxy.test/**', async (r) => {
      const req = r.request();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      const left = await page.evaluate(() => ({ left: window.__gum.left != null, hash: location.hash }));
      posts.push({ body: req.postData(), afterLeaving: left.left, screen: left.hash });
      return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ reply_en: 'Sure. It is in aisle five.', reply_fa: 'حتماً. در راهروی پنج است.', understood: true, correction_en: null, correction_fa: null, suggestions: [{ en: 'Thank you.', fa: 'ممنون.' }], done: false }) });
    });
  }
  await page.goto(URL0);
  await page.waitForFunction(() => window.hamrah);
  // the lesson is opened at pos 1: the first sentence card, which carries the «حالا شما بگویید» button
  await page.evaluate((ai) => { const a = window.hamrah; a.store.update((s) => { s.onboard.done = true; s.settings.auto = false; s.settings.micOk = true; if (ai) { s.settings.ai = true; s.settings.aiOn = true; } if (s.at) s.at['social-hello'] = { pos: 1, short: false, t: Date.now() }; else s.current = { id: 'social-hello', pos: 1, short: false }; }); a.go('home', { reset: true }); }, ai);
  return { browser, page, errors, posts };
}
const toSay = async (page) => { await page.evaluate(() => window.hamrah.go('lesson.social-hello')); await page.waitForSelector('.mic-btn'); await page.waitForTimeout(400); };
const preload = (page) => page.evaluate(() => window.hamrah.speech.ensure());
const home = (page) => page.locator('.topbar .tb-btn').last();
const panel = (page) => page.evaluate(() => { const c = [...document.querySelectorAll('main .card')].pop(); return c ? c.innerText.replace(/\n+/g, ' / ').slice(0, 90) : ''; });
const toAi = async (page) => {
  await page.evaluate(() => window.hamrah.go('rp.rp-store'));
  const label = await page.evaluate(() => window.hamrah.t('ai.start'));
  await page.getByText(label, { exact: true }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(400);
  await page.getByText(label, { exact: true }).tap();
  await page.waitForSelector('.mic-btn');
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.hamrah.audio.stop());
};

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const scenarios = {
  // 1. first use: tap the microphone, then Home while the recogniser is still loading
  async 'leave (Home) while the recogniser loads'() {
    const { browser, page } = await open();
    await toSay(page);
    await page.locator('.mic-btn').tap(); await page.waitForTimeout(150);
    const phase = await panel(page);
    await markLeft(page); await home(page).tap();
    await page.waitForTimeout(14000);
    const r = await report(page);
    check('1. Home during model load: microphone never opens', r.gumAfterLeaving === 0 && r.maxLiveEver === 0, { phaseWhenLeaving: phase, ...r });
    await browser.close();
  },
  async 'leave (Back) while the recogniser loads'() {
    const { browser, page } = await open();
    await toSay(page);
    await page.locator('.mic-btn').tap(); await page.waitForTimeout(150);
    await markLeft(page); await page.locator('.topbar .tb-btn').first().tap();
    await page.waitForTimeout(14000);
    const r = await report(page);
    check('2. Back during model load: microphone never opens', r.gumAfterLeaving === 0 && r.maxLiveEver === 0, r);
    await browser.close();
  },
  // 3. the permission prompt is open (slow getUserMedia) and the learner taps Next
  async 'leave (Next) while the permission prompt is open'() {
    const { browser, page } = await open();
    await toSay(page); await preload(page);
    await page.evaluate(() => { window.__gum.delay = 1500; });
    await page.locator('.mic-btn').tap(); await page.waitForTimeout(300);
    const phase = await panel(page);
    await markLeft(page); await page.locator('[data-next]').tap();
    await page.waitForTimeout(13000);
    const r = await report(page);
    check('3. Next during the permission prompt: the stream that arrives late is closed at once', r.liveMsAfterLeaving === 0 && r.liveNow === 0 && r.transcribedAfterLeaving === 0, { phaseWhenLeaving: phase, ...r });
    await browser.close();
  },
  async 'leave (Home) while listening'() {
    const { browser, page } = await open();
    await toSay(page); await preload(page); await hookTranscribe(page);
    await page.locator('.mic-btn').tap(); await page.waitForSelector('.mic-btn.is-live'); await page.waitForTimeout(900);
    const before = await report(page);
    await markLeft(page); await home(page).tap();
    await page.waitForTimeout(6000);
    const r = await report(page);
    check('4. Home while listening: microphone closes and nothing is transcribed', before.liveNow === 1 && r.liveMsAfterLeaving === 0 && r.transcribedAfterLeaving === 0, r);
    await browser.close();
  },
  async 'tab hidden while the recogniser loads'() {
    const { browser, page } = await open();
    await toSay(page);
    await page.locator('.mic-btn').tap(); await page.waitForTimeout(150);
    await markLeft(page);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(14000);
    const r = await report(page);
    check('5. phone locked / app switched during model load: microphone never opens', r.gumAfterLeaving === 0 && r.maxLiveEver === 0, r);
    await browser.close();
  },
  async 'tab hidden while listening'() {
    const { browser, page } = await open();
    await toSay(page); await preload(page); await hookTranscribe(page);
    await page.locator('.mic-btn').tap(); await page.waitForSelector('.mic-btn.is-live'); await page.waitForTimeout(700);
    await markLeft(page);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(5000);
    const r = await report(page);
    check('6. phone locked while listening: microphone closes, nothing transcribed', r.liveMsAfterLeaving === 0 && r.transcribedAfterLeaving === 0, r);
    await browser.close();
  },
  async 'review card answered by tap while listening'() {
    const { browser, page } = await open();
    await preload(page); await hookTranscribe(page);
    await page.evaluate(() => { window.hamrah.store.update((s) => { if (s.at) s.at = {}; else s.current = null; }); window.hamrah.go('review'); });
    await page.waitForSelector('.phrase');
    const T = await page.evaluate(() => ({ show: window.hamrah.t('rev.show'), say: window.hamrah.t('rev.say'), knew: window.hamrah.t('rev.knew') }));
    await page.getByText(T.show, { exact: true }).tap(); await page.waitForTimeout(450);
    await page.getByText(T.say, { exact: true }).tap(); await page.waitForTimeout(450);
    await page.locator('.mic-btn').tap(); await page.waitForSelector('.mic-btn.is-live'); await page.waitForTimeout(700);
    const before = await report(page);
    await markLeft(page); await page.getByText(T.knew, { exact: true }).tap();
    await page.waitForTimeout(5000);
    const r = await report(page);
    check('7. review: answering by tap while listening closes the microphone', before.liveNow === 1 && r.liveMsAfterLeaving === 0 && r.transcribedAfterLeaving === 0, r);
    await browser.close();
  },
  async 'tap mic, Next, tap mic again during loading'() {
    const { browser, page } = await open();
    await toSay(page);
    await page.locator('.mic-btn').tap(); await page.waitForTimeout(120);
    await page.locator('[data-next]').tap(); await page.waitForTimeout(450);
    await page.locator('.mic-btn').tap();
    await page.waitForTimeout(16000);
    const r = await report(page);
    check('8. two taps on two screens during loading: one microphone request, one stream', r.gumCalls === 1 && r.maxLiveEver <= 1 && r.liveNow === 0, { ...r, panel: await panel(page) });
    await browser.close();
  },
  async 'recording setup fails after permission'() {
    const { browser, page } = await open();
    await toSay(page); await preload(page);
    await page.evaluate(() => { window.__gum.breakAC = true; });
    await page.locator('.mic-btn').tap(); await page.waitForTimeout(1500);
    const r = await report(page);
    check('9. failure after permission (A-7): the stream is released', r.gumCalls === 1 && r.liveNow === 0, { ...r, panel: await panel(page) });
    await browser.close();
  },
  async 'AI conversation: leave while the recogniser loads'() {
    const { browser, page, posts } = await open({ ai: true });
    await toAi(page);
    await page.locator('.mic-btn').tap(); await page.waitForTimeout(150);
    const phase = await panel(page);
    await markLeft(page); await home(page).tap();
    await page.waitForTimeout(16000);
    const r = await report(page);
    check('10. AI mode, Home during model load: microphone never opens, nothing is sent', r.gumAfterLeaving === 0 && r.maxLiveEver === 0 && posts.length === 0, { phaseWhenLeaving: phase, ...r, sentToAiService: posts });
    await browser.close();
  },
  async 'AI conversation: leave while listening'() {
    const { browser, page, posts } = await open({ ai: true });
    await preload(page); await hookTranscribe(page);
    await toAi(page);
    await page.locator('.mic-btn').tap(); await page.waitForSelector('.mic-btn.is-live'); await page.waitForTimeout(1600);
    await markLeft(page); await home(page).tap();
    await page.waitForTimeout(8000);
    const r = await report(page);
    check('11. AI mode, Home while listening: nothing is transcribed or sent', r.liveMsAfterLeaving === 0 && r.transcribedAfterLeaving === 0 && posts.length === 0, { ...r, sentToAiService: posts });
    await browser.close();
  },
  async 'AI conversation: leave while the recording is being checked'() {
    const { browser, page, posts } = await open({ ai: true });
    await preload(page);
    await toAi(page);
    // leave at the very moment transcription starts
    await page.evaluate(() => { const sp = window.hamrah.speech, o = sp.transcribe; sp.transcribe = async (x) => { window.__gum.left = performance.now(); window.hamrah.home(); return o.call(sp, x); }; });
    await page.locator('.mic-btn').tap();
    await page.waitForFunction(() => window.__gum.left != null, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const r = await report(page);
    check('12. AI mode, leaving while the recording is checked: the text is thrown away, nothing is sent', r.liveNow === 0 && posts.length === 0, { ...r, sentToAiService: posts });
    await browser.close();
  },
  async 'a screen that forgets to clean up (page replaced without telling the microphone)'() {
    // loading: the screen is torn down behind the app's back; no navigation code runs at all
    let { browser, page } = await open();
    await toSay(page);
    await page.locator('.mic-btn').tap(); await page.waitForTimeout(150);
    await markLeft(page);
    await page.evaluate(() => document.getElementById('app').replaceChildren(document.createElement('main')));
    await page.waitForTimeout(13000);
    let r = await report(page);
    check('15. panel removed during model load without any clean-up call: microphone never opens', r.gumCalls === 0 && r.maxLiveEver === 0, r);
    await browser.close();
    ({ browser, page } = await open());
    await toSay(page); await preload(page); await hookTranscribe(page);
    await page.locator('.mic-btn').tap(); await page.waitForSelector('.mic-btn.is-live'); await page.waitForTimeout(700);
    await markLeft(page);
    await page.evaluate(() => document.getElementById('app').replaceChildren(document.createElement('main')));
    await page.waitForTimeout(5000);
    r = await report(page);
    check('16. panel removed while listening without any clean-up call: microphone closes, nothing transcribed', r.liveMsAfterLeaving === 0 && r.transcribedAfterLeaving === 0 && r.maxLiveEver === 1, r);
    await browser.close();
  },
  async '"not now" while the recogniser loads'() {
    const { browser, page } = await open();
    await toSay(page);
    await page.locator('.mic-btn').tap(); await page.waitForTimeout(150);
    const no = await page.evaluate(() => window.hamrah.t('mic.no'));
    await markLeft(page);
    await page.getByText(no, { exact: true }).tap(); await page.waitForTimeout(300);
    const back = await page.locator('.mic-btn:not(.is-live)').count();
    await page.waitForTimeout(13000);
    const r = await report(page);
    check('17. "not now" during model load: back to the microphone button at once, microphone never opens', back === 1 && r.gumCalls === 0, { micButtonBack: back, ...r });
    await browser.close();
  },
  async 'emergency page from a lesson while listening'() {
    const { browser, page } = await open();
    await toSay(page); await preload(page); await hookTranscribe(page);
    await page.locator('.mic-btn').tap(); await page.waitForSelector('.mic-btn.is-live'); await page.waitForTimeout(700);
    await markLeft(page); await page.locator('.topbar .tb-sos').tap();
    await page.waitForTimeout(4000);
    const r = await report(page);
    await page.locator('.topbar .tb-btn').first().tap(); await page.waitForTimeout(800);
    const idle = await page.locator('.mic-btn:not(.is-live)').count();
    check('18. emergency page opened while listening: microphone closes; coming back shows the microphone button again', r.liveMsAfterLeaving === 0 && r.transcribedAfterLeaving === 0 && idle === 1, { ...r, micButtonAfterReturn: idle });
    await browser.close();
  },
  async 'scripted conversation: leave while the recogniser loads'() {
    const { browser, page } = await open();
    await page.evaluate(() => window.hamrah.go('rp.rp-store'));
    const start = await page.evaluate(() => window.hamrah.t('rp.start'));
    await page.getByText(start, { exact: true }).waitFor(); await page.waitForTimeout(450);
    await page.getByText(start, { exact: true }).tap();
    await page.waitForSelector('.mic-btn'); await page.waitForTimeout(1200);
    await page.evaluate(() => { window.__rp = window.hamrah.ui.rp; window.hamrah.audio.stop(); });
    await page.locator('.mic-btn').tap(); await page.waitForTimeout(150);
    await markLeft(page); await home(page).tap();
    await page.waitForTimeout(15000);
    const r = await report(page);
    const log = await page.evaluate(() => ({ lines: window.__rp.log.length, turn: window.__rp.turn, mic: window.__rp.mic }));
    check('19. scripted conversation, Home during model load: microphone never opens, no answer is recorded', r.gumCalls === 0 && log.lines === 1 && log.turn === 0, { ...r, conversation: log });
    await browser.close();
  },
  async 'finished button while listening'() {
    const { browser, page } = await open();
    await toSay(page); await preload(page);
    await page.locator('.mic-btn').tap(); await page.waitForSelector('.mic-btn.is-live');
    await page.waitForTimeout(2600);                         // the sentence has been said by now
    await page.locator('.mic-btn.is-live').tap();
    await page.waitForSelector('.result-title, main .note.is-care', { timeout: 30000 }).catch(() => {});
    const heard = await page.locator('.heard .en').innerText().catch(() => '');
    const r = await report(page);
    check('20. "finished" while listening: the recording is checked and the microphone is released', /hello/i.test(heard) && r.liveNow === 0, { heard, ...r });
    await browser.close();
  },
  // the feature itself must still work
  async 'normal use still works'() {
    const { browser, page, errors, posts } = await open({ ai: true });
    await toSay(page); await hookTranscribe(page);
    const t0 = Date.now();
    await page.locator('.mic-btn').tap();
    await page.waitForSelector('.result-title, main .note.is-care', { timeout: 90000 }).catch(() => {});
    const heard = await page.locator('.heard .en').innerText().catch(() => '');
    const r = await report(page);
    check('13. say-it screen: the sentence is recognised and the microphone is released', /hello/i.test(heard) && r.liveNow === 0 && r.gumCalls === 1, { heard, ms: Date.now() - t0, ...r });
    await toAi(page);
    await page.locator('.mic-btn').tap();
    await page.waitForFunction(() => document.querySelectorAll('.bubble.you').length > 0, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const r2 = await report(page);
    check('14. AI mode, staying on the screen: what was said is sent once', posts.length === 1 && posts[0].afterLeaving === false && r2.liveNow === 0, { sentToAiService: posts, errors: errors.slice(0, 3), ...r2 });
    await browser.close();
  },
};

try {
  for (const [name, run] of Object.entries(scenarios)) {
    if (ONLY && !name.includes(ONLY)) continue;
    try { await run(); } catch (e) { check(name + ' (script error)', false, String(e && e.message).slice(0, 300)); }
  }
} finally { server.kill(); }
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed  (site: ${SITE})`);
process.exit(failed ? 1 : 0);
