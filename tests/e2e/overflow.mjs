// Width sweep: nothing may stick out of the phone, at any text size the app offers.
//   HAMRAH_SITE=<built site> PORT=<port> node tests/e2e/overflow.mjs [--quick] [--conversations] [--shots DIR]
// Visits EVERY screen of every lesson (also after answering, and with the Farsi help open), every
// conversation from its first screen to its last, every paper of «خواندن نوشته‌ها» question by question,
// the word lists, review, the sentence builder,
// settings, the emergency page and the first-run questions — at 320 px and 390 px wide, at text
// size 100 % and 150 % — and fails if any element, or the text inside any button, lies outside the
// screen. It also checks that every screen has exactly one main heading, that the main button of the bottom
// bar is on screen, and that no "null", "undefined", "NaN" or unfilled {placeholder} is shown anywhere.
// --quick checks every sixth lesson and conversation (for a fast look while working).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = +(process.env.PORT || 8138), SITE = process.env.HAMRAH_SITE ? path.resolve(process.env.HAMRAH_SITE) : path.join(ROOT, 'site'), URL0 = `http://localhost:${PORT}/`;
const quick = process.argv.includes('--quick');
const talkOnly = process.argv.includes('--conversations');      // only the conversations (for work on that screen)
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), SITE, String(PORT)], { stdio: 'ignore' });
process.on('exit', () => server.kill());        // also when a check throws
await new Promise((r) => setTimeout(r, 700));

// Runs in the page. Returns what is wrong with the screen on show ([] when nothing is).
function inspect(W) {
  const out = [];
  const name = (el) => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"`;
  if (window.innerWidth !== W) out.push(`the page is laid out ${window.innerWidth}px wide on a ${W}px screen`);
  if (document.documentElement.scrollWidth > W) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth}px)`);
  for (const el of document.querySelectorAll('#app *, .sheet-back *, .toast, .toast *')) {
    if (el.closest('.sr')) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.right > W + 1 || r.left < -1) { out.push(`outside the screen [${Math.round(r.left)}..${Math.round(r.right)}]: ${name(el)}`); continue; }
    if (el.matches('button, .bubble, .card, .note, input')) {             // words spilling out of their own box
      const cs = getComputedStyle(el);
      if (el.matches('input')) { if (el.scrollWidth > el.clientWidth + 1 && !el.value) out.push(`hint does not fit its field: ${name(el)}`); continue; }
      if (cs.visibility === 'hidden') continue;
      let left = Infinity, right = -Infinity;
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.nodeValue.trim() || n.parentElement.closest('.sr, [hidden]') || getComputedStyle(n.parentElement).visibility === 'hidden') continue;
        const range = document.createRange(); range.selectNodeContents(n);
        for (const c of range.getClientRects()) { if (c.width > 0) { left = Math.min(left, c.left); right = Math.max(right, c.right); } }
      }
      if (left < r.left - 1.5 || right > r.right + 1.5) out.push(`text spills out of its box by ${Math.round(Math.max(r.left - left, right - r.right))}px: ${name(el)}`);
    }
  }
  const h1 = document.querySelectorAll('#app h1').length;
  if (h1 !== 1) out.push(`${h1} main headings (h1) on this screen`);
  const next = document.querySelector('.bottombar [data-next], .bottombar .btn-primary');
  if (next) { const r = next.getBoundingClientRect(); if (r.bottom > window.innerHeight + 1 || r.top < 0) out.push('the main button of the bottom bar is not fully on screen'); }
  // a word that is not meant for the learner: "null", "undefined", "NaN" or a {placeholder} left unfilled
  const stray = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
  for (let n = stray.nextNode(); n; n = stray.nextNode()) if (/^(null|undefined|NaN)$|\{[a-z]+\}/.test(n.nodeValue.trim()) && !n.parentElement.closest('input, textarea')) out.push(`stray text "${n.nodeValue.trim().slice(0, 20)}" in ${name(n.parentElement)}`);
  return out.slice(0, 6);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const problems = [];
let screens = 0;
const summary = [];

for (const [W, H, scale] of [[390, 844, 1], [390, 844, 1.5], [320, 568, 1], [320, 568, 1.5]]) {
  const tag = `${W}px @ ${scale * 100}%`;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'fa-IR', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL0);
  await page.waitForFunction(() => window.hamrah && document.querySelector('.topbar'));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { window.hamrah.tapHold = 0; });      // this sweep is about layout; the double-tap pause is tested in run.mjs
  let seen = 0, bad = 0;
  const look = async (where) => {
    seen++; screens++;
    const found = await page.evaluate(inspect, W);
    if (found.length) {
      bad++;
      problems.push({ tag, where, found });
      if (shots && bad <= 12) await page.screenshot({ path: path.join(shots, `${W}-${scale * 100}-${where.replace(/[^A-Za-z0-9.-]+/g, '_').slice(0, 60)}.png`) });
    }
  };
  // a fresh learner at this text size; `done` marks lessons as finished so that every list shows its fuller state
  const fresh = (route, { onboarded = true } = {}) => page.evaluate(({ route, scale, onboarded }) => {
    const a = window.hamrah;
    document.querySelectorAll('.sheet-back, .toast').forEach((el) => el.remove());
    a.audio.stop(); a.store.wipe();
    a.store.update((s) => { s.onboard.done = onboarded; s.settings.scale = scale; s.settings.auto = false; s.settings.micOk = false; });
    a.applyScale();
    a.go(route, { reset: true });
  }, { route, scale, onboarded });
  const sig = () => page.evaluate(() => document.querySelector('main').textContent.length + ':' + document.querySelector('main').textContent.slice(0, 400));
  const tap = (sel, nth = 0) => page.evaluate(({ sel, nth }) => { const el = document.querySelectorAll(sel)[nth]; if (el) el.click(); return !!el; }, { sel, nth });
  const tapText = (text) => page.evaluate((text) => { const el = [...document.querySelectorAll('#app main button')].find((b) => b.textContent.trim() === text); if (el) el.click(); return !!el; }, text);
  // answer a tap question the way a learner would (wrong ones first), then look at the result
  const answer = async (where) => {
    for (let i = 0; i < 6; i++) {
      const more = await page.evaluate(() => { if (document.querySelector('.opt.is-right')) return false; const o = [...document.querySelectorAll('.opt:not(.is-tried)')].pop(); if (!o) return false; o.click(); return true; });
      if (!more) break;
    }
    await look(where + ' (answered)');
  };

  const info = await page.evaluate(() => { const a = window.hamrah, c = a.content, t = a.t; return {
    lessons: a.order, rps: c.roleplays.map((r) => r.id), papers: (c.papers || []).map((p) => ({ id: p.id, answers: p.questions.map((q) => q.line) })), cats: c.vocabCats.map((x) => x.id), places: c.scenarios.map((x) => x.id), patterns: c.patterns.map((x) => x.id),
    showFa: [t('task.showFa'), t('talk.showFa'), t('rp.showHelp')], next: t('nav.next'), start: t('rp.start'), show: t('rev.show'), more: t('onb.more') }; });
  const pick = (list) => (quick ? list.filter((_, i) => i % 6 === 0) : list);

  // ---- every screen of every lesson ----------------------------------------------------------
  for (const id of talkOnly ? [] : pick(info.lessons)) {
    await fresh('home');
    await page.evaluate((id) => window.hamrah.go('lesson.' + id), id);
    let prev = '';
    for (let n = 0; n < 90; n++) {
      const now = await sig();
      if (now === prev) break;                                   // Next no longer changes anything: the lesson is over
      prev = now;
      const where = `lesson ${id} screen ${n + 1}`;
      await look(where);
      if (await page.evaluate(() => document.querySelectorAll('#app main .opt').length > 0)) {
        for (const label of info.showFa) if (await tapText(label)) await look(where + ' (Farsi help)');
        await answer(where);
      }
      if (!(await tap('.bottombar [data-next]'))) break;         // the last screen has no Next
    }
  }

  // ---- every conversation, first screen to last ------------------------------------------------
  for (const id of pick(info.rps)) {
    await fresh('home');
    await page.evaluate((id) => window.hamrah.go('rp.' + id), id);
    await look(`conversation ${id} start`);
    await tapText(info.start);
    // every screen on the way: a question about a line («چه گفت؟»), the same after a wrong tap, the line shown after two, the answers
    let helped = false;
    for (let n = 0; n < 60; n++) {
      await look(`conversation ${id} screen ${n + 1}`);
      if (await page.evaluate(() => !!document.querySelector('#app main .big-check'))) break;
      if (!helped && await page.evaluate(() => !!document.querySelector('#app main .replies'))) { helped = true; for (const label of info.showFa) if (await tapText(label)) await look(`conversation ${id} screen ${n + 1} (Farsi help)`); }
      await page.evaluate(() => { const r = window.hamrah.ui.rp; if (r) r.lock = 0; });      // this sweep is about layout; the pause after a tap is tested in run.mjs and shell.mjs
      if (!(await tap('#app main [data-go]')) && !(await tap('#app main > .stack:not(.replies) .opt:not(.is-tried)')) && !(await tap('#app main .replies .opt'))) break;
      await page.waitForTimeout(20);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  if (talkOnly) { if (errors.length) problems.push({ tag, where: 'JavaScript errors', found: errors.slice(0, 3) }); summary.push(`${tag}: ${seen} screens checked, ${bad} with something outside the screen`); console.log(summary[summary.length - 1]); await ctx.close(); continue; }

  // ---- reading papers: every question (as asked, after a tap on another line, after the right line) and the last screen ----
  for (const P of pick(info.papers)) {
    await fresh('home');
    await page.evaluate((id) => window.hamrah.go('paper.' + id), P.id);
    for (let n = 0; n < P.answers.length; n++) {
      const where = `paper ${P.id} question ${n + 1}`;
      await look(where);
      await tap('#app main .pl', P.answers[n] === 1 ? 1 : 0); await look(where + ' (another line tapped)');
      await tap('#app main .pl', P.answers[n] - 1); await look(where + ' (found)');
      await tap('.bottombar [data-next]');
    }
    await look(`paper ${P.id} finished`);
  }

  // ---- everything else ---------------------------------------------------------------------------
  const done = () => page.evaluate(() => { const a = window.hamrah; a.store.update((s) => { for (const id of a.order.slice(0, 12)) { s.done[id] = { t: Date.now(), n: 1 }; for (const p of a.content.lessons[id].phrases) s.srs[`p:${id}:${p.id}`] = { b: 0, d: a.today(), n: 0 }; } s.fav = { w1: 1, w2: 1, [`p:${a.order[0]}:p1`]: 1 }; s.read = {}; for (const p of (a.content.papers || []).slice(0, 2)) s.read[p.id] = 1; }); Object.assign(a.me, { name: 'Maryam Ahmadi-Tehrani', address: '2500 North Washington Boulevard, Apartment 1204, Springfield', contact: '212-555-0142' }); });
  const routes = ['home', 'talk', 'words', 'saved', 'grammar', 'build', 'build.mix', 'places', 'settings', 'me', 'sos', 'about', 'numbers', 'papers', 'paper.nosuchpaper', 'nosuchpage', 'lesson.nosuchlesson',
    ...info.cats.map((c) => 'cat.' + c), ...info.places.map((c) => 'place.' + c), ...pick(info.patterns).map((c) => 'build.' + c)];
  for (const route of routes) {
    for (const full of [false, true]) {
      await fresh('home'); if (full) await done();
      await page.evaluate((r) => window.hamrah.go(r), route);
      await look(`${route}${full ? ' (with progress)' : ''}`);
      if (route.startsWith('build.')) { for (let i = 0; i < 12; i++) if (!(await tap('.tiles-pool .wtile:not(.is-used)'))) break; await look(`${route} (tiles placed)`); }
      if (route === 'talk' && await tap('[data-others]')) await look(`talk (every stage shown)${full ? ' (with progress)' : ''}`);
    }
  }
  // ---- the learner's own sentences, the small-task question, «کارهایی که حالا می‌توانم بکنم», the look back,
  // ---- a lesson set aside, and «درس امروز» when no new lesson is left (views/progress.js) -------------------------
  {
    const longMe = { name: 'Mohammadreza Hosseinzadeh-Tabatabaei', address: '14200 North Washington Boulevard, Apartment 1204, Springfield', contact: '212-555-0142', phone: '310-555-0142', born: '1947-9-27' };
    const ago = (hours, me) => page.evaluate(({ hours, me }) => { const a = window.hamrah; a.store.update((s) => { for (const id of Object.keys(s.done)) s.done[id].t = Date.now() - hours * 3600000; }); if (me) Object.assign(a.me, me); a.go('home', { reset: true }); }, { hours, me });
    const finished = (id) => page.evaluate((id) => { const a = window.hamrah; a.go('lesson.' + id); a.ui.finished = true; a.ui.cur = { pos: 999, short: false, warm: [] }; a.store.update((s) => { s.done[id] = { t: Date.now(), n: 1 }; }); a.render(true); }, id);
    await fresh('home'); await done(); await ago(20, longMe);
    await look('home with the question about the small task and the look back offered');
    for (const route of ['me', 'cando', 'places']) { await page.evaluate((r) => window.hamrah.go(r), route); await look(`${route} (own details filled in, lessons finished)`); }
    for (const id of await page.evaluate(() => Object.keys(window.hamrah.content.mine || {}))) { await finished(id); await look(`lesson ${id} finished: the learner's own sentence`); }
    await fresh('home'); await finished(await page.evaluate(() => Object.keys(window.hamrah.content.mine || {})[0] || window.hamrah.order[0])); await look('lesson finished: invitation to fill in own details');
    // the look back: first screen, every question (as asked and answered, wrong taps first), the end
    await fresh('home'); await done(); await ago(30, null);
    await page.evaluate(() => window.hamrah.go('checkpoint')); await look('look back: first screen');
    for (let n = 0; n < 12 && await tap('.bottombar [data-next]'); n++) {
      if (!(await page.evaluate(() => document.querySelectorAll('#app main .opt').length > 0))) break;
      await look(`look back: question ${n + 1}`); await answer(`look back: question ${n + 1}`);
    }
    await look('look back: finished');
    // a lesson of the last stage: «این درس الان به کارم نمی‌آید», before and after
    const s3 = await page.evaluate(() => window.hamrah.order.find((id) => window.hamrah.content.lessons[id].stage === 3));
    if (s3) { await fresh('home'); await page.evaluate((id) => window.hamrah.go('lesson.' + id), s3); await look('last-stage lesson: can be set aside'); if (await tap('[data-later]')) await look('last-stage lesson: set aside'); }
    // no new lesson left: an earlier lesson in its short form, then a conversation
    for (const lessonToday of [false, true]) {
      await fresh('home');
      await page.evaluate((today) => { const a = window.hamrah; a.store.update((s) => { a.order.forEach((id, i) => { s.done[id] = { t: Date.now() - (i === 0 && today ? 0 : (30 + i) * 86400000), n: 1 }; }); s.cp = { n: 999, t: 1 }; s.tried[a.order[0]] = 1; }); a.go('home', { reset: true }); }, lessonToday);
      await look(`home when no new lesson is left (${lessonToday ? 'a conversation' : 'an earlier lesson'})`);
    }
    await page.evaluate(() => window.hamrah.go('cando')); await look('cando (every lesson finished)');
    // a name and address typed in Persian letters: «اطلاعات من» explains, the emergency page does not use them
    await page.evaluate(() => { const a = window.hamrah; Object.assign(a.me, { name: 'محمدرضا حسین‌زاده طباطبایی', address: 'خیابان واشنگتن شمالی، پلاک ۱۴۲۰۰، واحد ۱۲۰۴', contact: '۲۱۲-۵۵۵-۰۱۴۲', phone: '', born: '' }); a.go('me'); });
    await look('me (name and address in Persian letters)');
    await page.evaluate(() => window.hamrah.go('sos')); await look('sos (name and address in Persian letters)');
  }

  // review: question, answer shown, end
  await fresh('home'); await done(); await page.evaluate(() => window.hamrah.go('review'));
  for (let n = 0; n < 4; n++) { await look(`review card ${n + 1}`); if (await tapText(info.show)) await look(`review card ${n + 1} (meaning shown)`); if (!(await tap('#app main .row .btn-primary'))) break; }
  // review: the other kinds of card (heard first; asked from the Farsi), the end of the day's first and second set,
  // and what the home screen and the words screen say then
  const rev = async (name, c, states) => {
    await fresh('home'); await done();
    await page.evaluate(({ c, states }) => { const a = window.hamrah, day = a.today(), v = (en) => a.content.vocab.find((w) => w.en === en).id;
      const long = a.order.slice(0, 12).flatMap((id) => a.content.lessons[id].phrases.map((p) => ({ k: `p:${id}:${p.id}`, n: p.fa.length }))).sort((x, y) => y.n - x.n)[0].k;
      a.store.update((s) => { s.newDay = { d: day, n: 6, c }; if (states) { s.srs = {}; for (const [k, e] of Object.entries(states)) s.srs[k === 'LONG' ? long : k.startsWith('p:') ? k : v(k)] = { ...e, d: day }; } }); a.go('review'); }, { c, states });
    await look(`review: ${name}`);
  };
  const T = await page.evaluate(() => { const t = window.hamrah.t; return { phrase: t('rev.showPhrase'), word: t('rev.showWord'), en: t('rev.showEn'), knew: t('rev.knew') }; });
  await rev('a sentence heard first', 0, { LONG: { b: 2, n: 0 } }); if (await tapText(T.phrase)) await look('review: a sentence heard first (shown)'); if (await tapText(info.show)) await look('review: a sentence heard first (meaning)');
  await rev('a word heard first', 0, { pharmacy: { b: 2, n: 2 } }); if (await tapText(T.word)) await look('review: a word heard first (shown)');
  await rev('a sentence asked from the Farsi', 0, { LONG: { b: 3, n: 1 } }); if (await tapText(T.en)) await look('review: a sentence asked from the Farsi (answer)');
  await rev('a word with a picture asked from the Farsi', 0, { milk: { b: 3, n: 3 } }); if (await tapText(T.en)) await look('review: a word asked from the Farsi (answer)');
  for (const [name, c] of [['first', 14], ['second', 29]]) {
    await rev(`last card of the ${name} set`, c, null); await tapText(info.show); await tapText(T.knew); await look(`review: end of the ${name} set`);
    for (const r of ['home', 'words']) { await page.evaluate((r) => window.hamrah.go(r, { reset: true }), r); await look(`${r} after the ${name} set`); }
  }
  // first run: every question
  await fresh('onboard', { onboarded: false });
  for (let n = 0; n < 6; n++) {
    await look(`first run, screen ${n + 1}`);
    if (await tapText(info.more)) await look(`first run, screen ${n + 1} (more)`);
    if (!(await tap('#app main .opt')) && !(await tap('#app main .tile'))) break;
  }
  // a confirmation sheet and a message
  await fresh('home'); await page.evaluate(() => window.hamrah.go('settings'));
  await tap('#app main .btn-danger', 1); await look('settings, confirmation sheet');
  await page.evaluate(() => document.querySelector('.sheet-back') && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await look('home, message shown'); await page.evaluate(() => window.dispatchEvent(new Event('online')));

  if (errors.length) problems.push({ tag, where: 'JavaScript errors', found: errors.slice(0, 3) });
  summary.push(`${tag}: ${seen} screens checked, ${bad} with something outside the screen`);
  console.log(summary[summary.length - 1]);
  await ctx.close();
}
await browser.close();
server.kill();

for (const p of problems.slice(0, 60)) console.log(`FAIL  ${p.tag}  ${p.where}\n      ${p.found.join('\n      ')}`);
if (problems.length > 60) console.log(`… and ${problems.length - 60} more`);
console.log(`\n${screens} screens checked in ${summary.length} sizes; ${problems.length} problem screens${quick ? ' (quick mode: a sample only)' : ''}`);
process.exit(problems.length ? 1 : 0);
