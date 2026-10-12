// «خواندن نوشته‌ها» in a browser: the way in, one question at a time, a wrong tap costs nothing and
// explains the line, the right tap shows the meaning and a play button, the end, and what a screen
// reader is given.
//   HAMRAH_SITE=<built site> PORT=<port> node tests/e2e/papers.mjs [--shots DIR]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = +(process.env.PORT || 8139), SITE = process.env.HAMRAH_SITE ? path.resolve(process.env.HAMRAH_SITE) : path.join(ROOT, 'site'), URL0 = `http://localhost:${PORT}/`;
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), SITE, String(PORT)], { stdio: 'ignore' });
process.on('exit', () => server.kill());
await new Promise((r) => setTimeout(r, 700));

const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const TAP_GAP = 420;      // the app ignores a tap within 350 ms after a screen change

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL0);
  await page.waitForFunction(() => window.hamrah && document.querySelector('.topbar'));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { const a = window.hamrah; a.store.update((s) => { s.onboard.done = true; s.settings.auto = false; }); a.go('home', { reset: true }); });
  const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };
  const papers = await page.evaluate(() => window.hamrah.content.papers || []);
  check('the curriculum has papers to read', papers.length > 0, `${papers.length} papers`);
  if (!papers.length) throw new Error('no papers in this build');
  const t = (k) => page.evaluate((k) => window.hamrah.t(k), k);
  const title = await t('read.title');

  // ---- the way in: no fifth big button on the home screen; one row in «یادگیری کلمات» and in «موقعیت‌های روزمره» ----
  check('the home screen still has exactly four big choices', (await page.locator('.choice').count()) === 4);
  for (const from of ['words', 'places']) {
    await page.evaluate((r) => window.hamrah.go(r), from); await page.waitForTimeout(TAP_GAP);
    const row = page.locator('[data-papers]');
    const box = await row.boundingBox();
    check(`«${title}» is offered on the "${from}" screen, as a target of at least 56 px`, (await row.count()) === 1 && box && box.height >= 56 && (await row.textContent()).includes(title), box && Math.round(box.height));
    if (from === 'places') { await row.click(); await page.waitForTimeout(TAP_GAP); }
  }
  check('…and opens the list of papers', (await page.evaluate(() => location.hash)) === '#papers' && (await page.locator('main .item').count()) === papers.length, await page.evaluate(() => location.hash));
  const stages = await page.evaluate(() => [...document.querySelectorAll('main h2.section-title')].map((x) => x.textContent));
  check('the list is grouped by stage', stages.length === new Set(papers.map((p) => p.stage)).size, stages);
  await shot('papers-1-list');

  // ---- one paper, start to finish ----------------------------------------------------------------
  const P = papers.find((p) => p.questions.length >= 2) || papers[0];
  await page.locator('main .item', { hasText: P.title }).first().click(); await page.waitForTimeout(TAP_GAP);
  check('a paper opens at its own address', (await page.evaluate(() => location.hash)) === '#paper.' + P.id);
  const state = () => page.evaluate(() => ({
    h1: [...document.querySelectorAll('#app h1')].map((x) => x.textContent),
    lines: [...document.querySelectorAll('.paper .pl')].map((b) => ({ text: b.querySelector('.txt').textContent, lang: b.getAttribute('lang'), dir: b.getAttribute('dir'), tag: b.tagName, h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width), cls: b.className })),
    paperW: Math.round(document.querySelector('.paper').getBoundingClientRect().width),
    says: [...document.querySelectorAll('[data-says]')].map((x) => x.textContent),
    plays: document.querySelectorAll('.paper [data-play]').length,
    live: document.getElementById('live').textContent,
    read: window.hamrah.store.state.read,
  }));
  let s = await state();
  check('one question at a time: the Farsi question is the heading of the screen', s.h1.length === 1 && s.h1[0] === P.questions[0].fa, s.h1);
  check('the paper shows every line, in order, in English', JSON.stringify(s.lines.map((l) => l.text)) === JSON.stringify(P.lines.map((l) => l.en)));
  check('each line is a button marked as English, left to right, at least 56 px high and as wide as the paper', s.lines.every((l) => l.tag === 'BUTTON' && l.lang === 'en' && l.dir === 'ltr' && l.h >= 56 && l.w >= s.paperW - 4), s.lines.map((l) => l.h).join(','));
  check('nothing is given away before a tap: no meaning shown, no play button in the paper', s.says.length === 0 && s.plays === 0);
  const strong = P.lines.findIndex((l) => l.strong), plain = P.lines.findIndex((l) => !l.strong);
  if (strong >= 0 && plain >= 0) {
    const sizes = await page.evaluate(([a, b]) => { const f = (i) => parseFloat(getComputedStyle(document.querySelectorAll('.paper .pl')[i]).fontSize); return [f(a), f(b)]; }, [strong, plain]);
    check('ordinary lines are at least 20 px; the important lines are set larger', sizes[1] >= 20 && sizes[0] > sizes[1], sizes);
  }
  await shot('papers-2-question');

  const right = P.questions[0].line - 1, wrong = P.lines.findIndex((_, k) => k !== right);
  await page.locator('.paper .pl').nth(wrong).click(); await page.waitForTimeout(250);
  s = await state();
  check('a tap on another line: its Farsi meaning appears under it, with a gentle word and no "wrong"', s.says.length === 1 && s.says[0].includes(P.lines[wrong].fa) && s.says[0].includes(await t('read.miss')) && /is-tried/.test(s.lines[wrong].cls) && !/غلط|اشتباه/.test(s.says[0]), s.says);
  check('…and a screen reader is told the same', s.live.includes(P.lines[wrong].fa), s.live);
  check('…the question is still the same one', s.h1[0] === P.questions[0].fa);
  await shot('papers-3-another-line');
  await page.locator('.paper .pl').nth(right).click(); await page.waitForTimeout(250);
  s = await state();
  check('the right line: marked with a tick, its meaning shown, and a button to hear it', /is-right/.test(s.lines[right].cls) && s.says.length === 1 && s.says[0].includes(P.lines[right].fa) && s.plays === 1 && (await page.locator('.paper .pl.is-right svg').count()) === 1, s.says);
  check('…the earlier hint is gone (one thing at a time)', !s.says.join(' ').includes(P.lines[wrong].fa) || P.lines[wrong].fa === P.lines[right].fa);
  const sr = await page.locator('.paper .pl.is-right .sr').textContent();
  check('…and the tick has words for a screen reader', sr === (await t('quiz.isRight')), sr);
  await page.evaluate(() => { window.__played = []; const P0 = window.hamrah.audio.play; window.hamrah.audio.play = (c, o) => { window.__played.push(c); return P0(c, o); }; });
  await page.locator('.paper [data-play]').click(); await page.waitForTimeout(200);
  const played = await page.evaluate(() => window.__played);
  check('the play button plays that line in English, in the learner\'s voice', played.length === 1 && played[0].lang === 'en' && played[0].voice === 's' && played[0].text === P.lines[right].en, played);
  await page.evaluate(() => window.hamrah.audio.stop());
  await shot('papers-4-found');

  // the remaining questions, then the end
  for (let i = 1; i < P.questions.length; i++) {
    await page.locator('.bottombar [data-next]').click(); await page.waitForTimeout(TAP_GAP);
    s = await state();
    if (i === 1) check('the next question starts clean: no line marked from the one before', s.h1[0] === P.questions[1].fa && s.lines.every((l) => !/is-(right|tried)/.test(l.cls)) && s.says.length === 0, s.h1);
    await page.locator('.paper .pl').nth(P.questions[i].line - 1).click(); await page.waitForTimeout(150);
  }
  check('nothing is recorded as read before the end', !(await state()).read[P.id]);
  await page.locator('.bottombar [data-next]').click(); await page.waitForTimeout(TAP_GAP);
  const end = await page.evaluate(() => ({ h1: [...document.querySelectorAll('#app h1')].map((x) => x.textContent), lead: document.querySelector('.card .lead').textContent, rows: document.querySelectorAll('.paper .pl-read').length, plays: document.querySelectorAll('.paper .mini-play').length,
    next: (document.querySelector('.bottombar [data-next]') || {}).textContent, read: window.hamrah.store.state.read }));
  check('the end: a short encouraging line, and the whole paper with the meaning and sound of every line', end.h1[0] === (await t('read.done')) && end.lead === (await t('read.done.sub')) && end.rows === P.lines.length && end.plays === P.lines.length, end);
  check('…the paper is now remembered as read', end.read[P.id] === 1, end.read);
  check('nothing on these screens shows a stray "null" or "undefined"', !/\bnull\b|\bundefined\b/.test(await page.locator('#app').textContent()));
  check('…and «نوشتهٔ بعدی» is the main button' + (papers.length < 2 ? ' (only one paper: not offered)' : ''), papers.length < 2 ? end.next == null : end.next === (await t('read.next')), end.next);
  await shot('papers-5-end');
  if (papers.length >= 2) {
    await page.locator('.bottombar [data-next]').click(); await page.waitForTimeout(TAP_GAP);
    const hash = await page.evaluate(() => location.hash);
    check('«نوشتهٔ بعدی» opens another paper, one not read yet', /^#paper\./.test(hash) && hash !== '#paper.' + P.id, hash);
    await page.locator('.tb-btn').first().click(); await page.waitForTimeout(TAP_GAP + 300);
    check('Back from there returns to the list (the finished paper is not left underneath)', (await page.evaluate(() => location.hash)) === '#papers', await page.evaluate(() => location.hash));
    check('…where the finished paper carries a "read" mark in words', (await page.locator('main .item', { hasText: P.title }).first().locator('.badge').textContent()).includes(await t('read.read')));
  }

  // ---- walking past a question is allowed and is not counted as read -------------------------------
  const Q = papers.find((p) => p.id !== P.id) || P;
  await page.evaluate((id) => { window.hamrah.store.update((s) => { delete s.read[id]; }); window.hamrah.go('paper.' + id); }, Q.id); await page.waitForTimeout(TAP_GAP);
  for (let i = 0; i < Q.questions.length; i++) { await page.locator('.bottombar [data-next]').click(); await page.waitForTimeout(TAP_GAP); }
  const skipped = await page.evaluate(() => ({ h1: document.querySelector('#app h1').textContent, text: document.querySelector('main').textContent, rows: document.querySelectorAll('.paper .pl-read').length, tick: document.querySelectorAll('.big-check').length, read: window.hamrah.store.state.read }));
  check('Next without answering: the paper is shown with its meaning; no praise for what was not done, no blame, not marked as read',
    skipped.h1 === (await t('read.all')) && skipped.text.includes(await t('read.passed')) && skipped.rows === Q.lines.length && skipped.tick === 0 && !skipped.read[Q.id] && !/غلط|اشتباه|null|undefined/.test(skipped.text), { h1: skipped.h1, read: skipped.read });
  await page.locator('main .btn', { hasText: await t('read.again') }).click(); await page.waitForTimeout(TAP_GAP);
  check('…and «دوباره همین نوشته» starts the paper again at its first question', (await page.locator('#app h1').textContent()) === Q.questions[0].fa);

  // ---- an address that names no paper ---------------------------------------------------------------
  await page.evaluate(() => window.hamrah.go('paper.constructor')); await page.waitForTimeout(200);
  check('an address that names no paper shows the "not found" screen, not an error', (await page.locator('#app h1').textContent()) === (await t('nf.title')));

  // ---- a paper that belongs to a lesson is listed in that lesson's situation ---------------------------
  const withLesson = papers.find((p) => p.lesson);
  if (withLesson) {
    const sc = await page.evaluate((id) => window.hamrah.content.lessons[id].scenario, withLesson.lesson);
    await page.evaluate((sc) => window.hamrah.go('place.' + sc), sc); await page.waitForTimeout(200);
    check('a paper that goes with a lesson is listed under that lesson\'s situation', (await page.locator('main .item', { hasText: withLesson.title }).count()) >= 1, sc);
  }
  check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
} catch (err) {
  check('test run completed', false, String(err && err.message).slice(0, 300));
} finally { await browser.close(); server.kill(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
