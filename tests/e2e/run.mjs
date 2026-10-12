// End-to-end checks in a phone-sized browser. Builds must exist (npm run build).
//   node tests/e2e/run.mjs [--shots DIR]
// Covers: first run, home, a complete lesson without typing, resume after leaving,
// conversation practice, review queue, text size, emergency phrases, text direction,
// touch-target size, audio playback, offline use after download, and the pronunciation
// checker fed by a synthetic voice through a fake microphone.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { uiText } from './strings.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : path.join(ROOT, 'tests/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const PORT = +(process.env.PORT || 8137), SITE = process.env.HAMRAH_SITE ? path.resolve(process.env.HAMRAH_SITE) : path.join(ROOT, 'site'), URL0 = `http://localhost:${PORT}/`;
// interface text and content, read from the built site (strings.mjs): a wording change in content/ui.fa.json does not break the suite
const { T: UI, P: UIP, re: UIRE, content: CONTENT } = uiText(SITE);
const RP_STORE = CONTENT.roleplays.find((r) => r.id === 'rp-store'), MILK = RP_STORE.turns[0].replies.find((r) => /milk/.test(r.en));
const RP_MED = CONTENT.roleplays.find((r) => r.id === 'rp-medicine');
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), SITE, String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

// a spoken sentence for the fake microphone: one of the app's own clips, converted to WAV
const fakeWav = path.join(shots, 'fake-mic.wav');
{
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/audio/index.json'), 'utf8'));
  const { audioKey } = await import(path.join(ROOT, 'src/js/audiokey.js'));
  const ref = idx.clips[audioKey('en', 's', 'n', 'Hello! How are you?')];
  const pack = fs.readFileSync(path.join(ROOT, 'site/audio', idx.packs[ref[0]].file));
  const mp3 = path.join(shots, 'fake-mic.mp3');
  fs.writeFileSync(mp3, pack.subarray(ref[1], ref[1] + ref[2]));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-t', '0.6', '-i', 'anullsrc=r=48000:cl=mono', '-i', mp3, '-f', 'lavfi', '-t', '2.5', '-i', 'anullsrc=r=48000:cl=mono', '-filter_complex', '[1:a]aresample=48000[v];[0:a][v][2:a]concat=n=3:v=0:a=1', '-ar', '48000', '-ac', '1', fakeWav]);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fakeWav}%noloop`, '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fa-IR', permissions: ['microphone'] });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
const shot = (n) => page.screenshot({ path: path.join(shots, n + '.png'), fullPage: false });
const overflow = () => page.evaluate(() => [...document.querySelectorAll('#app *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.right > window.innerWidth + 1 || r.left < -1); }).slice(0, 4).map((el) => (el.className || el.tagName) + ':' + el.textContent.trim().slice(0, 16)));
// The app ignores a tap that follows a screen change by less than 350 ms (an unsteady double tap must not
// press two things), so a script that moves from screen to screen waits a little longer than that.
const TAP_GAP = 420;
const next = async () => { await page.locator('[data-next]').click(); await page.waitForTimeout(TAP_GAP); };
const solve = async () => {           // answer a tap question the way a learner would: try until right
  for (let i = 0; i < 6; i++) {
    if (await page.locator('.opt.is-right').count()) return true;
    const open = page.locator('.opt:not(.is-tried):not(.is-right)');
    if (!(await open.count())) return false;
    await open.first().click(); await page.waitForTimeout(60);
  }
  return (await page.locator('.opt.is-right').count()) > 0;
};
// from a lesson's first screen to its first sentence card (a lesson after the first opens with questions on earlier lessons)
const toPhrase = async () => { for (let i = 0; i < 6 && !(await page.locator('main .phrase').count()); i++) await next(); };

try {
  // ---- first run ---------------------------------------------------------------------------
  await page.goto(URL0);
  await page.waitForSelector('h1');
  check('page is Farsi, right-to-left', (await page.evaluate(() => document.documentElement.lang + document.documentElement.dir)) === 'fartl');
  await shot('01-onboarding');
  check('onboarding can be skipped', await page.getByText(UI('onb.skip')).isVisible());
  check('the emergency phrases are one tap away during onboarding', (await page.locator('.topbar .tb-sos').count()) === 1);
  await page.locator('.opt').first().click(); await page.waitForTimeout(TAP_GAP);
  check('onboarding shows which question it is and lets the learner go back', (await page.getByText(UI('onb.count', { n: '۲', all: '۳' })).count()) === 1 && (await page.getByText(UI('onb.back')).count()) === 1);
  await page.locator('.opt').first().click(); await page.waitForTimeout(TAP_GAP);
  check('onboarding asks at most three questions', (await page.getByText(UI('onb.count', { n: '۳', all: '۳' })).count()) === 1 && (await page.locator('.tile').count()) >= 6);
  await page.locator('.tile').nth(2).click(); await page.waitForTimeout(TAP_GAP);
  check('onboarding ends by saying where the learner starts', (await page.getByText(UI('onb.plan.title')).count()) === 1);
  await page.getByText(UI('onb.start')).click();
  await page.waitForSelector('.choice');
  check('whatever was answered, the first lesson is lesson 1', await page.evaluate(() => window.hamrah.nextLesson().id === window.hamrah.order[0]));
  await page.waitForTimeout(TAP_GAP);
  await shot('02-home');
  check('home shows exactly four main choices', (await page.locator('.choice').count()) === 4);
  check('home choices are in Farsi', (await page.locator('.choice .t').allInnerTexts()).join('|') === ['home.lesson', 'home.talk', 'home.words', 'home.places'].map((k) => UI(k)).join('|'));
  { const o = await overflow(); check('nothing sticks out of a 390px screen (home)', o.length === 0, o.join(' ; ')); }
  const small = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width && (r.height < 44 || r.width < 44); }).map((b) => b.textContent.trim().slice(0, 20)));
  check('every button on home is at least 44px', small.length === 0, small.join(', '));
  const primary = await page.evaluate(() => [...document.querySelectorAll('.choice')].every((b) => b.getBoundingClientRect().height >= 56));
  check('main choices are at least 56px tall', primary);

  // welcome audio really plays (media element reaches the end)
  await page.evaluate(() => { window.__ended = 0; const P = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { this.addEventListener('ended', () => window.__ended++, { once: true }); return P.call(this); }; });
  await page.locator('.round-play').click();
  await page.waitForFunction(() => window.__ended > 0, null, { timeout: 15000 }).then(() => check('Farsi welcome audio plays to the end', true)).catch(() => check('Farsi welcome audio plays to the end', false));

  // ---- a whole lesson, taps only -----------------------------------------------------------------
  await page.locator('.choice').first().click();
  await page.waitForSelector('.progress'); await page.waitForTimeout(TAP_GAP);
  const title = await page.locator('h1').first().innerText();
  await shot('03-lesson-intro');
  check('the very first lesson already offers the short lesson', (await page.locator('main .switch').count()) === 1);
  check('the lesson says honestly how long it takes (a range of minutes, not "about 7")', new RegExp(UI('lesson.about', { min: UI('lesson.minutes', { lo: '[۰-۹]+', hi: '[۰-۹]+' }) }).split('.')[0]).test(await page.locator('main').innerText()), (await page.locator('main .muted.small').first().innerText()).slice(0, 40));
  await next();
  await shot('04-phrase');
  check('the sentence card carries the optional «حالا شما بگویید» button (no separate speaking screens)', (await page.locator('main .mic-btn').count()) === 1 && (await page.locator('main .mic-btn').innerText()).includes(UI('say.title')));
  const dirs = await page.evaluate(() => { const e = document.querySelector('.en-line'), f = document.querySelector('.fa-line'); return [getComputedStyle(e).direction, getComputedStyle(f).direction, getComputedStyle(e).fontFamily]; });      // (the list starts with the app's own digits, then the high-legibility face)
  check('English is left-to-right, Farsi right-to-left', dirs[0] === 'ltr' && dirs[1] === 'rtl', dirs.slice(0, 2).join(' / '));
  check('English uses the high-legibility typeface', /^"?Hamrah Digits"?, "?Atkinson Hyperlegible"?/.test(dirs[2]) && await page.evaluate(() => document.fonts.check('700 28px "Atkinson Hyperlegible"')), dirs[2].slice(0, 60));
  // every listen control on the phrase card finishes playing
  await page.evaluate(() => { window.__ended = 0; });
  await page.locator('.phrase .btn-sound').first().click();
  await page.waitForFunction(() => window.__ended > 0, null, { timeout: 15000 }).then(() => check('phrase audio plays', true)).catch(() => check('phrase audio plays', false));
  // the card starts simple: listen, slow, Farsi sound and one "more" button; word-by-word, pieces and saving open from it
  const cardControls = await page.locator('.phrase button').count();
  check('a new phrase card shows at most five controls', cardControls <= 5 && (await page.locator('.phrase .w').count()) === 0, `controls ${cardControls}`);
  check('the "more" button is a full-size touch target', await page.locator('.phrase [data-more]').evaluate((b) => b.getBoundingClientRect().height >= 56));
  await page.locator('.phrase [data-more]').click();
  check('"more" opens word-by-word listening, pieces and saving', (await page.locator('.phrase .w').count()) >= 2 && (await page.locator('.phrase .chunk').count()) >= 2 && (await page.locator('.phrase [data-fav]').count()) === 1);
  await page.evaluate(() => { window.__ended = 0; });
  await page.locator('.w').first().click();
  await page.waitForFunction(() => window.__ended > 0, null, { timeout: 15000 }).then(() => check('a single tapped word plays', true)).catch(() => check('a single tapped word plays', false));

  // leave mid-lesson and come back: the app offers to continue
  await next(); await next();
  await page.locator('.tb-btn', { hasText: UI('nav.home') }).click();
  await page.waitForSelector('.choice'); await page.waitForTimeout(TAP_GAP);
  check('home offers to continue the unfinished lesson', (await page.locator('.choice .s').first().innerText()).includes(UIP('home.lesson.resume')));
  await page.reload(); await page.waitForSelector('.choice');
  check('progress survives closing and reopening', (await page.locator('.choice .s').first().innerText()).includes(UIP('home.lesson.resume')));
  await page.locator('.choice').first().click();
  await page.waitForSelector('.progress'); await page.waitForTimeout(TAP_GAP);
  check('lesson resumes at the same place', (await page.locator('.progress .lbl').innerText()).includes(`۳ ${UI('lesson.of')} ۵`), await page.locator('.progress .lbl').innerText());

  check('inside a lesson the top bar says «خروج از درس» and the bottom bar «قبلی»', (await page.locator('.topbar .tb-btn').first().innerText()).trim() === UI('lesson.leave') && (await page.locator('.bottombar .btn').first().innerText()).trim() === UI('nav.prev'));
  // (the walk starts on the third sentence card; counting it, the intro and the two cards before it, four screens have been seen)
  let guard = 0, screens = 4, sawSay = false, sawQuiz = 0, sawDialogue = false, sawGrammar = false, sawGist = 0, sawSayScreen = false, grammarHidden = null, grammarShown = null;
  while (!(await page.locator('.big-check').count()) && guard++ < 60) {
    if (guard > 1) screens++;
    const grammar = (await page.getByText(UI('grammar.eyebrow')).count()) > 0;
    // the grammar check is a real one: the mistake and the right form are not shown side by side until it is answered
    if (grammar) { sawGrammar = true; grammarHidden = (await page.locator('main s').count()) === 0; await shot('06-grammar'); }
    if (await page.getByText(UI('gist.title')).count()) sawGist += (await page.locator('main [lang="en"]').count()) === 0 ? 1 : 0;
    if (await page.locator('.opt').count()) { sawQuiz += (await solve()) ? 1 : 0; }
    if (grammar) grammarShown = (await page.locator('main s').count()) === 1;
    if (await page.locator('.mic-btn').count()) { sawSay = true; if (!(await page.locator('.phrase, .opt').count())) sawSayScreen = true; }
    if (await page.locator('.bubble').count() > 3) { sawDialogue = true; if (guard) await shot('05-dialogue'); }
    await next();
  }
  if (await page.locator('.big-check').count()) screens++;      // the last screen
  check('lesson reaches the encouragement screen with taps only', (await page.locator('.big-check').count()) === 1, `screens: ${screens}`);
  check('lesson included questions, a dialogue, grammar and speaking', sawQuiz >= 5 && sawDialogue && sawGrammar && sawSay, `quiz ${sawQuiz}`);
  check('a full first lesson is 20–24 screens, with speaking on the sentence cards only', screens >= 20 && screens <= 24 && !sawSayScreen, `screens ${screens}`);
  check('the grammar question comes before the mistake and the right form are shown side by side', grammarHidden === true && grammarShown === true, `before ${grammarHidden}, after ${grammarShown}`);
  await shot('07-lesson-done');
  const st = await page.evaluate(() => window.hamrah.store.state);
  check('finished lesson is recorded and its phrases queued for review', Object.keys(st.done).length === 1 && Object.keys(st.srs).length >= 5 && Object.keys(st.at).length === 0);
  // (two lines of the dialogue — or one, plus "the same thing in other words" where the lesson has such questions)
  check('the lesson asked what the other person said, without showing the text', sawGist >= 2 && sawGist <= 4, `"what did they say?" screens: ${sawGist}`);
  check('the end of the lesson offers the conversation that practises it', await page.evaluate(() => { const c = window.hamrah.content, id = Object.keys(window.hamrah.store.state.done)[0], rp = c.roleplays.find((r) => r.id === c.practice[id]); return !!rp && [...document.querySelectorAll('.bottombar .btn-primary')].some((b) => b.textContent.includes(rp.title)); }));

  // a slow second tap on the last «بعدی» lands where the done bar's main button now is: it must not replace the finished
  // screen with the conversation (QA round 4, features L3; the app's usual hold after a screen change is 350 ms)
  await page.evaluate(() => { const a = window.hamrah, id = Object.keys(a.store.state.done)[0]; a.store.update((s) => { s.at[id] = { pos: 999, short: false, t: Date.now() }; }); a.go('lesson.' + id); });
  await page.waitForTimeout(TAP_GAP);
  if (await page.locator('main .opt').count()) await solve();
  {
    const nb = await page.locator('[data-next]').boundingBox();
    await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2); await page.waitForTimeout(450);
    await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2); await page.waitForTimeout(TAP_GAP);
    check('a slow second tap on the last «بعدی» does not leave the finished screen', (await page.locator('.big-check').count()) === 1 && /^#lesson\./.test(await page.evaluate(() => location.hash)), await page.evaluate(() => location.hash));
  }

  // ---- conversation practice ---------------------------------------------------------------------
  await page.locator('.tb-btn', { hasText: UI('nav.home') }).click(); await page.waitForTimeout(TAP_GAP);
  await page.locator('.choice').nth(1).click();
  await page.waitForSelector('.item');
  // the conversations of the learner's own stage first; the other stages one tap away
  const ownStage = await page.locator('.item').count();
  check('the conversation list starts with the learner\'s own stage, the others one tap away', ownStage >= 5 && ownStage < 20 && (await page.locator('[data-others]').count()) === 1, String(ownStage));
  await page.waitForTimeout(TAP_GAP);
  await page.locator('[data-others]').click(); await page.waitForTimeout(TAP_GAP);
  check('conversation list offers many situations', (await page.locator('.item').count()) >= 15 && (await page.locator('[data-others]').count()) === 0, String(await page.locator('.item').count()));
  await page.getByText(RP_STORE.title).first().click(); await page.waitForTimeout(TAP_GAP);
  await page.getByText(UI('rp.start')).click();
  await page.waitForSelector('.bubble.them');
  await shot('08-roleplay');
  await page.waitForTimeout(TAP_GAP);
  // under the answers of every turn: "Could you repeat that, please?" — the line is said again and the turn stays
  const againBtn = page.locator('.again-btn');
  const againText = (await againBtn.count()) === 1 ? await againBtn.innerText() : '';
  check('every turn offers "Could you repeat that, please?" with its meaning', /Could you repeat that, please\?/.test(againText) && againText.includes(CONTENT.ui.fixed.repeat.fa), againText.replace(/\n/g, ' / '));
  await againBtn.click(); await page.waitForTimeout(700);
  check('…a tap has the line said again and the turn stays where it is', (await page.locator('.bubble.you').count()) === 0 && (await page.locator('.note', { hasText: UI('rp.repeat.again') }).count()) === 1 && (await page.locator('.replies .opt').count()) === 3);
  // a line that carries something to act on is asked about before the answers appear, with its text hidden
  const asking = 'main > .stack:not(.replies) .opt';
  await page.locator('.replies .opt', { hasText: 'milk' }).click(); await page.waitForTimeout(700);
  const ask1 = await page.evaluate(() => ({ card: !!document.querySelector('[data-check]'), options: document.querySelectorAll('main > .stack:not(.replies) .opt').length, replies: document.querySelectorAll('.replies .opt').length,
    masked: [...document.querySelectorAll('.bubble.them')].pop().querySelector('.phone-mask') != null, readable: document.querySelector('main').textContent.includes('aisle five'), listen: document.querySelectorAll('[data-check] [data-play]').length }));
  check('after "The milk is in aisle five …" the learner is asked what was said: three choices, no answers yet, the text hidden, the line can be heard again at both speeds',
    ask1.card && ask1.options === 3 && ask1.replies === 0 && ask1.masked && !ask1.readable && ask1.listen === 2, JSON.stringify(ask1));
  await shot('08b-roleplay-asked');
  await page.locator(asking, { hasText: MILK.thenCheck.wrong[0] }).click(); await page.waitForTimeout(200);
  check('a wrong tap only sets that choice aside', (await page.locator('.opt.is-tried').count()) === 1 && (await page.locator('[data-check="shown"]').count()) === 0 && (await page.locator('.replies .opt').count()) === 0);
  await page.locator(asking, { hasText: MILK.thenCheck.wrong[1] }).click(); await page.waitForTimeout(700);
  const shown = await page.evaluate(() => { const c = document.querySelector('[data-check="shown"]'); return c ? c.textContent : ''; });
  check('after two tries the line and its meaning are shown, with a button to go on', shown.includes('The milk is in aisle five') && shown.includes(MILK.then.fa) && shown.includes(UI('rp.check.go')), shown.slice(0, 90));
  await page.locator('[data-go]').click(); await page.waitForTimeout(700);
  check('…and the conversation goes on with the next line and its answers', (await page.locator('.replies .opt').count()) === 2 && (await page.locator('[data-check]').count()) === 0 && (await page.locator('.bubble.you').count()) === 1);
  await page.locator('.replies .opt', { hasText: 'How much' }).click(); await page.waitForTimeout(700);
  await page.locator(asking, { hasText: '$4.99' }).click(); await page.waitForTimeout(900);
  check('a right answer stays with its line («درست شنیدید: $4.99»), written from left to right', (await page.locator('.bubble .caught .en', { hasText: '$4.99' }).count()) === 1);
  // the rest with taps: answer what is asked (first choice first), otherwise take the first reply
  // (a reply is locked for half a second after the one before it: a double tap must not answer two turns)
  let turns = 0;
  const walk = async () => {
    if (await page.locator('[data-go]').count()) return page.locator('[data-go]').click();
    const open = page.locator(asking + ':not(.is-tried)');
    if (await open.count()) return open.first().click();
    return page.locator('.replies .opt').first().click();
  };
  while (!(await page.locator('.big-check').count()) && turns++ < 30) { await walk(); await page.waitForTimeout(700); }
  check('a conversation can be completed with taps', (await page.locator('.big-check').count()) === 1, `taps ${turns}`);
  check('conversation shows both speakers', (await page.locator('.bubble.you').count()) >= 4 && (await page.locator('.bubble.them').count()) >= 5);
  check('when it is over every line can be read, and nothing is counted or scored', await page.evaluate(() => !document.querySelector('.phone-mask') && !/\d+\s*(از|\/)\s*\d+|امتیاز|نمره/.test(document.querySelector('main').textContent)));
  // the second time through, the partner is heard first: the text is behind «نمایش متن»
  await page.getByText(UI('rp.again')).click(); await page.waitForTimeout(TAP_GAP);
  await page.getByText(UI('rp.start')).click(); await page.waitForSelector('.bubble.them'); await page.waitForTimeout(TAP_GAP);
  check('a conversation done before starts with the text hidden and a «نمایش متن» button', (await page.locator('.bubble.them .phone-mask').count()) === 1 && (await page.locator('.bubble.them .btn', { hasText: UI('rp.showText') }).count()) === 1);
  await page.locator('.replies .opt').first().click(); await page.waitForTimeout(600);
  await page.locator('.tb-btn', { hasText: UI('nav.home') }).click();
  await page.waitForSelector('.sheet');
  check('leaving a conversation half-way asks first, with staying as the first choice', (await page.locator('.sheet .btn').first().innerText()).trim() === UI('rp.leave.stay'));
  await page.waitForTimeout(700);
  await page.locator('.sheet .btn', { hasText: UI('rp.leave.go') }).click();
  await page.waitForSelector('.choice'); await page.waitForTimeout(TAP_GAP);

  // the 911 practice: "this is only practice" is part of the top bar, so it stays in sight to the last line
  await page.evaluate(() => window.hamrah.go('rp.rp-emergency')); await page.waitForTimeout(TAP_GAP);
  await page.getByText(UI('rp.start')).click(); await page.waitForSelector('.bubble.them'); await page.waitForTimeout(TAP_GAP);
  const bannerInSight = (word) => page.evaluate((word) => { const b = document.querySelector('.topbar .tb-banner'); if (!b) return false; const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height > 20 && b.textContent.includes(word); }, word);
  let inSight = true, taps = 0, scrolled = 0;
  while (!(await page.locator('.big-check').count()) && taps++ < 24) { inSight = inSight && await bannerInSight(UI('rp.practiceOnly')); scrolled = Math.max(scrolled, await page.evaluate(() => Math.round(scrollY))); await walk(); await page.waitForTimeout(700); }
  check('in the 911 practice «این فقط تمرین است. هیچ تماس واقعی گرفته نمی‌شود.» stays in sight from the first line to the last', inSight && await bannerInSight(UI('rp.practiceOnly')) && (await page.locator('.big-check').count()) === 1 && scrolled > 200, `taps ${taps}, page scrolled to ${scrolled}`);
  await shot('08c-roleplay-911');
  // the listening round for medicine instructions: the lesson's own sample sentences, each one asked about, under its note
  await page.evaluate(() => window.hamrah.go('home', { reset: true })); await page.waitForTimeout(TAP_GAP);
  await page.evaluate(() => window.hamrah.go('rp.rp-medicine')); await page.waitForTimeout(TAP_GAP);
  const medNote = await page.evaluate(() => (document.querySelector('main .note.is-danger') || { textContent: '' }).textContent);
  await page.getByText(UI('rp.start')).click(); await page.waitForSelector('.bubble.them'); await page.waitForTimeout(TAP_GAP);
  const medFirst = await page.evaluate(() => ({ asked: !!document.querySelector('[data-check]'), replies: document.querySelectorAll('.replies .opt').length }));
  let medSight = true; taps = 0;
  while (!(await page.locator('.big-check').count()) && taps++ < 30) { medSight = medSight && await bannerInSight(RP_MED.banner); await walk(); await page.waitForTimeout(700); }
  const med = await page.evaluate(() => { const a = window.hamrah, R = a.content.roleplays.find((r) => r.id === 'rp-medicine'), L = a.content.lessons['medicine-instructions'];
    const own = new Set([...L.phrases.map((p) => p.en), ...L.dialogue.lines.map((l) => l.en), L.respond.them.en, ...L.respond.ok.map((o) => o.en)]);
    const said = R.turns.flatMap((t) => [t.them.en, ...t.replies.flatMap((r) => [r.en, ...(r.then ? [r.then.en] : [])])]);
    return { asked: a.ui.rp.log.filter((m) => m.asked).length, foreign: said.filter((x) => !own.has(x)), practice: a.content.practice['medicine-instructions'], flags: [R.safetyCritical, R.scripted] }; });
  check('the medicine listening round asks about each of its five sentences before any answer, under the note about the learner\'s own label',
    medFirst.asked && medFirst.replies === 0 && med.asked === 5 && medSight && medNote.includes(RP_MED.note.slice(0, 30)) && (await page.locator('.big-check').count()) === 1, JSON.stringify({ medFirst, asked: med.asked, medSight }));
  check('…it uses only sentences of the lesson, is scripted and safety-critical, and the lesson leads to it', med.foreign.length === 0 && med.practice === 'rp-medicine' && med.flags.every(Boolean), JSON.stringify(med));
  await page.evaluate(() => window.hamrah.go('home', { reset: true })); await page.waitForSelector('.choice'); await page.waitForTimeout(TAP_GAP);

  // ---- pronunciation checker with a synthetic voice through the fake microphone ------------------
  await page.evaluate(() => window.hamrah.go('lesson.social-hello'));
  await page.waitForSelector('.progress');
  await next();                                         // intro -> the first sentence card, which carries the microphone button
  check('the sentence card shows the microphone control', (await page.locator('.mic-btn').count()) === 1);
  // watch the microphone from inside the page: which streams were opened, and are any tracks still live?
  await page.evaluate(() => {
    const md = navigator.mediaDevices, orig = md.getUserMedia.bind(md), streams = [];
    md.getUserMedia = async (c) => { const s = await orig(c); streams.push(s); return s; };
    window.__micLive = () => streams.filter((s) => s.getTracks().some((t) => t.readyState === 'live')).length;
    window.__micOpened = () => streams.length;
  });
  await page.locator('.mic-btn').click();
  await page.waitForSelector('.sheet');
  check('the microphone is explained before the phone asks, and is not opened yet', (await page.evaluate(() => window.__micOpened())) === 0);
  await page.waitForTimeout(700);                       // the explanation sheet ignores taps for its first moment (double-tap safety)
  await page.getByText(UI('mic.yes')).click();
  const t0 = Date.now();
  await page.waitForSelector('main .result-title, main .note.is-care', { timeout: 120000 }).catch(() => {});
  await shot('09-pronunciation');
  const heard = await page.locator('.heard .en').innerText().catch(() => '');
  check('on-device checker recognises the spoken phrase', /hello/i.test(heard) && /how are you/i.test(heard), `heard "${heard}" in ${Date.now() - t0} ms (includes ~55 MB first load)`);
  check('checker marks the understood words', (await page.locator('.w.is-ok').count()) >= 3);
  check('the result is brought into sight, between the top bar and the bar with «بعدی»', await page.evaluate(() => { const r = document.querySelector('main .result-title').getBoundingClientRect(), top = document.querySelector('.topbar').getBoundingClientRect().bottom, bar = document.querySelector('.bottombar').getBoundingClientRect().top; return r.top >= top - 1 && r.bottom <= bar + 1; }));
  check('the microphone is released as soon as the recording ends', (await page.evaluate(() => window.__micLive())) === 0 && (await page.evaluate(() => window.__micOpened())) === 1);
  // start again and leave while it is listening: the microphone must close with the screen
  await page.getByText(UI('say.again')).click();
  await page.waitForSelector('.mic-btn.is-live', { timeout: 15000 }).catch(() => {});
  const liveWhileListening = await page.evaluate(() => window.__micLive());
  await page.evaluate(() => window.hamrah.home());
  await page.waitForTimeout(300);
  check('leaving the screen while it listens closes the microphone', liveWhileListening === 1 && (await page.evaluate(() => window.__micLive())) === 0, `live while listening ${liveWhileListening}`);

  // ---- review queue --------------------------------------------------------------------------------
  await page.evaluate(() => window.hamrah.go('review'));
  await page.waitForSelector('.phrase');
  await page.getByText(UI('rev.show')).click();
  await shot('10-review');
  await page.getByText(UI('rev.knew')).click(); await page.waitForTimeout(TAP_GAP);
  check('review moves to the next item and schedules the first', await page.evaluate(() => Object.values(window.hamrah.store.state.srs).some((e) => e.n === 1 && e.d > window.hamrah.today())));
  check('the card answered is counted towards today\'s first set', await page.evaluate(() => { const n = window.hamrah.store.state.newDay; return n.d === window.hamrah.today() && n.c === 1; }));

  // ---- review: the kinds of card, and the two short sets of the day ------------------------------------
  {
    const kept = await page.evaluate(() => JSON.stringify(window.hamrah.store.state));
    const T = await page.evaluate(() => { const t = window.hamrah.t; return { show: t('rev.show'), word: t('rev.showWord'), en: t('rev.showEn'), knew: t('rev.knew'), notYet: t('rev.notYet'), again: t('rev.again'), first: t('rev.first'), done: t('rev.done'), goNow: t('rev.goNow'), home: t('nav.home'), none: t('home.words.none'), second: t('home.words.second', { min: '۵' }), extra: t('words.extra') }; });
    // srs entries by English word or by 'p0' (the first sentence of the first lesson); c = cards already answered today
    const review = async (entries, c = 0, n = 6) => { await page.evaluate(({ entries, c, n }) => { const a = window.hamrah, day = a.today(), L = a.content.lessons[a.order[0]];
      a.store.update((s) => { s.done[L.id] = s.done[L.id] || { t: Date.now(), n: 1 }; s.newDay = { d: day, n, c }; s.srs = {};
        for (const [k, e] of Object.entries(entries)) s.srs[k === 'p0' ? `p:${L.id}:${L.phrases[0].id}` : k.startsWith('p:') ? k : a.content.vocab.find((w) => w.en === k).id] = { ...e, d: day + (e.d || 0) }; });
      a.go('home', { reset: true }); a.go('review'); }, { entries, c, n }); await page.waitForTimeout(TAP_GAP); };
    const tapBtn = async (text) => { await page.locator('#app main button', { hasText: text }).first().click(); await page.waitForTimeout(TAP_GAP); };
    const card = () => page.evaluate(() => ({ en: [...document.querySelectorAll('main .phrase .en-line')].map((x) => x.textContent.trim()).join('|'), pic: !!document.querySelector('main .phrase .emoji'), kind: (document.querySelector('main [data-rev]') || { dataset: {} }).dataset.rev || '', text: document.querySelector('main').textContent }));
    const entry = (k) => page.evaluate((k) => { const a = window.hamrah, L = a.content.lessons[a.order[0]]; return a.store.state.srs[k === 'p0' ? `p:${L.id}:${L.phrases[0].id}` : a.content.vocab.find((w) => w.en === k).id]; }, k);

    await review({}, 0, 0);                                   // a new learner's first card: "hello", which has a picture
    let c = await card();
    check('a new word is shown with its sound, and its picture is not beside the question', c.en === 'hello' && c.kind === 'read' && !c.pic, JSON.stringify({ ...c, text: '' }));
    await tapBtn(T.show); c = await card();
    check('the picture is on the back of the card', c.pic && c.text.includes(await page.evaluate(() => window.hamrah.content.vocab.find((w) => w.en === 'hello').fa)));
    await tapBtn(T.knew);
    const hello = await entry('hello');
    check('a new word the learner already knew waits about two weeks, not until tomorrow', hello.b === 3 && hello.d - (await page.evaluate(() => window.hamrah.today())) === 12, JSON.stringify(hello));

    await review({ water: { b: 2, n: 2 } });
    c = await card();
    check('a word known once is heard first: no English on the card', c.kind === 'hear' && c.en === '' && !c.pic, JSON.stringify({ ...c, text: '' }));
    await tapBtn(T.word); c = await card();
    check('«نمایش کلمه» shows the English without the meaning', c.en === 'water' && !c.text.includes(CONTENT.vocab.find((w) => w.en === 'water').fa), c.en);
    await tapBtn(T.show); await tapBtn(T.knew);
    check('…and knowing it moves it on', (await entry('water')).b === 3);

    await review({ p0: { b: 3, n: 1 } });
    c = await card();
    const p0 = await page.evaluate(() => { const a = window.hamrah, p = a.content.lessons[a.order[0]].phrases[0]; return { en: p.en, fa: p.fa }; });
    check('a lesson sentence is asked from the Farsi every other time', c.kind === 'say' && c.en === '' && c.text.includes(p0.fa), JSON.stringify({ ...c, text: c.text.slice(0, 80) }));
    await tapBtn(T.en); c = await card();
    check('«جواب را ببینم» shows the English sentence', c.en.replace(/\s+/g, ' ') === p0.en, c.en);
    await tapBtn(T.notYet); c = await card();
    const missed = await entry('p0');
    check('«هنوز نه»: back tomorrow, and shown once more at the end of the set with the English on the card', missed.b === 1 && missed.d - (await page.evaluate(() => window.hamrah.today())) === 1 && c.kind === 'read' && c.text.includes(T.again), JSON.stringify(missed));

    // forty sentences waiting, fourteen cards already done today: the fifteenth ends the first set
    const many = await page.evaluate(() => { const a = window.hamrah, out = {}; for (const id of a.order.slice(0, 8)) for (const p of a.content.lessons[id].phrases) out[`p:${id}:${p.id}`] = { b: 2, n: 0, d: -3 }; return out; });
    await page.evaluate(() => { const a = window.hamrah; a.store.update((s) => { for (const id of a.order.slice(0, 8)) s.done[id] = s.done[id] || { t: Date.now(), n: 1 }; }); });
    await review(many, 14);
    await tapBtn(T.show); await tapBtn(T.knew);
    let end = await page.evaluate(() => ({ h1: document.querySelector('main h1').textContent, buttons: [...document.querySelectorAll('main > button')].map((b) => [b.textContent.trim(), b.classList.contains('btn-primary')]), text: document.querySelector('main').textContent }));
    check('after the first set the second is offered for later: going home is the main button', end.h1 === T.first && end.buttons.length === 2 && end.buttons[0][0] === T.home && end.buttons[0][1] && end.buttons[1][0] === T.goNow && !end.buttons[1][1], JSON.stringify(end.buttons));
    check('how much is waiting is never counted out', !/۳۹|۴۰|39|40/.test(end.text), end.text);
    await shot('10b-review-first-set-done');
    await page.evaluate(() => window.hamrah.home()); await page.waitForTimeout(TAP_GAP);
    check('home offers the second review of the day', (await page.locator('.choice').nth(2).innerText()).includes(T.second), await page.locator('.choice').nth(2).innerText());
    await review(many, 29);
    await tapBtn(T.show); await tapBtn(T.knew);
    end = await page.evaluate(() => ({ h1: document.querySelector('main h1').textContent, buttons: [...document.querySelectorAll('main > button')].map((b) => b.textContent.trim()), text: document.querySelector('main').textContent }));
    check('after the second set the day\'s review is finished, whatever is still waiting', end.h1 === T.done && end.buttons.length === 1 && end.buttons[0] === T.home && !/۳۹|۴۰|39|40/.test(end.text), JSON.stringify(end.buttons));
    await page.evaluate(() => window.hamrah.home()); await page.waitForTimeout(TAP_GAP);
    check('…and home says so', (await page.locator('.choice').nth(2).innerText()).includes(T.none), await page.locator('.choice').nth(2).innerText());
    await page.evaluate(() => window.hamrah.go('words')); await page.waitForTimeout(TAP_GAP);
    check('a learner who wants more can ask for it on the words screen (a quiet button, not the main one)', (await page.locator('main .card .btn-ghost', { hasText: T.extra }).count()) === 1 && (await page.locator('main .card .btn-primary').count()) === 0);
    await page.evaluate((kept) => { const a = window.hamrah; a.store.update((s) => { Object.assign(s, JSON.parse(kept)); }); a.go('home', { reset: true }); }, kept);
    await page.waitForTimeout(TAP_GAP);
  }

  // ---- sentence builder ------------------------------------------------------------------------------
  await page.evaluate(() => window.hamrah.go('build.where-is'));
  await page.waitForSelector('.tiles-pool');
  const targetWords = await page.evaluate(() => window.hamrah.content.patterns.find((p) => p.id === 'where-is').items[0].en.replace(/[?.!,]/g, '').split(' ').map((w, i) => (i === 0 ? w.toLowerCase() : w)));
  // first a wrong order: the app must not accept it, and must say so gently
  for (const w of [...targetWords].reverse()) await page.locator('.tiles-pool .wtile:not(.is-used)', { hasText: new RegExp('^' + w + '$', 'i') }).first().click();
  check('sentence builder does not accept a wrong word order', (await page.locator('.tiles-line.is-right').count()) === 0 && (await page.locator('.note.is-care').count()) === 1);
  await page.getByText(UI('build.clear')).click();
  for (const w of targetWords) await page.locator('.tiles-pool .wtile:not(.is-used)', { hasText: new RegExp('^' + w + '$', 'i') }).first().click();
  await shot('10b-sentence-builder');
  check('sentence builder accepts the right order and shows the sentence', (await page.locator('.tiles-line.is-right').count()) === 1 && (await page.locator('.en-line').innerText()).replace(/\s+/g, ' ').includes('Where is the bank?'));   // each word is its own button
  await next();
  await page.getByText(UI('build.hint')).click();
  check('the hint places the next correct word', (await page.locator('.tiles-line .wtile').count()) === 1);
  // «شنیدن عددها»: hear a price, a time or a phone number and tap what was said
  await page.waitForTimeout(TAP_GAP);
  await page.evaluate(() => window.hamrah.go('numbers'));
  await page.waitForSelector('.opt');
  const numOpts = await page.locator('.opt .en').allInnerTexts();
  check('number listening shows 3–4 answers in digits and hides the sentence', numOpts.length >= 3 && numOpts.length <= 4 && numOpts.every((x) => /\d/.test(x)) && (await page.locator('main .en-line').count()) === 0, numOpts.join(' | '));
  await solve();
  check('after the answer the spoken sentence and its meaning are shown', (await page.locator('main .en-line').count()) === 1 && (await page.locator('main .card .fa-line').count()) === 1);
  await page.waitForTimeout(TAP_GAP);
  await page.evaluate(() => window.hamrah.go('grammar'));
  await page.waitForSelector('h1');
  // (titles only; a pattern opens under its title, and the patterns still to come are behind one button — QA round 4, L8)
  const gramClosed = await page.locator('main .card').count();
  await page.locator('[data-gram]').first().click();
  check('grammar page lists the pattern from the finished lesson, which opens under its title', gramClosed === 0 && (await page.locator('[data-gram][aria-expanded="true"]').count()) === 1 && (await page.locator('main .card').count()) === 1);
  await page.waitForTimeout(TAP_GAP);
  await page.locator('[data-gram-later]').click();
  check('…and the patterns of later lessons are listed when asked for', (await page.locator('main .item').count()) >= 30);

  // ---- a later lesson: questions on earlier lessons, a page of words, other wordings ----------------------
  await page.waitForTimeout(TAP_GAP);
  await page.evaluate(() => { const P = HTMLMediaElement.prototype.play; if (!P.__counted) { const f = function () { this.addEventListener('ended', () => { window.__ended = (window.__ended || 0) + 1; }, { once: true }); return P.call(this); }; f.__counted = true; HTMLMediaElement.prototype.play = f; } window.hamrah.go('lesson.my-numbers'); });
  await page.waitForSelector('.progress'); await next();
  const warmLbl = await page.locator('.progress .lbl').innerText();
  check('a lesson after the first opens with «این را به انگلیسی چطور می‌گویید؟» on a sentence of an earlier lesson', warmLbl.includes(UI('step.warm')) && (await page.getByText(UI('review.how')).count()) === 1 && (await page.locator('main .fa-line').count()) === 1, warmLbl.replace(/\n/g, ' | '));
  check('…with three English answers, each with its own play button', (await page.locator('main .opt').count()) === 3 && (await page.locator('main .opt-wrap .mini-play').count()) === 3 && (await page.locator('main .opt .en').count()) === 3);
  await solve();
  const warmed = await page.evaluate(() => { const a = window.hamrah, s = a.store.state, at = s.at['my-numbers']; return { saved: at && Array.isArray(at.warm) ? at.warm.length : 0, graded: !!(at && at.warm && s.srs[at.warm[0]] && s.srs[at.warm[0]].l === a.today()) }; });
  check('the answer counts as that sentence\'s review, and the questions are kept with the saved place', warmed.saved >= 1 && warmed.saved <= 3 && warmed.graded, JSON.stringify(warmed));
  await shot('10c-warm-up');
  let sawGrid = false, sawVariant = null, gridPlays = false;
  const hasVariants = await page.evaluate(() => (window.hamrah.content.lessons['my-numbers'].variants || []).length > 0);
  for (let i = 0; i < 26 && !(await page.locator('.big-check').count()); i++) {
    if ((await page.locator('main .wcell').count()) >= 10 && !sawGrid) {
      sawGrid = true; await shot('10d-word-page');
      await page.evaluate(() => { window.__ended = 0; });
      await page.locator('main .wcell').first().click();
      gridPlays = await page.waitForFunction(() => window.__ended > 0, null, { timeout: 15000 }).then(() => true).catch(() => false);
    }
    if (sawVariant == null && await page.getByText(UI('variant.eyebrow')).count()) { sawVariant = (await page.locator('main [lang="en"]').count()) === 0 && (await page.locator('main .opt').count()) === 3; await shot('10e-other-words'); }
    if (await page.locator('.opt').count()) await solve();
    if (sawGrid && (sawVariant != null || !hasVariants)) break;
    await next();
  }
  check('the numbers lesson has a page of number words to tap and hear', sawGrid && gridPlays, `page ${sawGrid}, sound ${gridPlays}`);
  if (hasVariants) check('"the same thing in other words" is heard without its text, with three Farsi meanings to choose from', sawVariant === true, String(sawVariant));
  // from stage 2 one line of the dialogue is heard before the dialogue is shown
  await page.waitForTimeout(TAP_GAP);
  await page.evaluate(() => window.hamrah.go('lesson.pharmacy'));
  await page.waitForSelector('.progress');
  let gistAt = -1, talkAt = -1;
  for (let i = 0; i < 20 && talkAt < 0; i++) {
    if (gistAt < 0 && await page.getByText(UI('gist.title')).count()) gistAt = i;
    if (await page.locator('.bubble').count() > 3) talkAt = i;
    if (await page.locator('.opt').count()) await solve();
    await next();
  }
  check('in a stage 2 lesson a line of the dialogue is heard before the dialogue is shown', gistAt > 0 && talkAt > gistAt, `question at screen ${gistAt}, dialogue at ${talkAt}`);
  // a place saved by an older version of the app, beyond the end of today's shorter lesson, opens inside the lesson
  await page.waitForTimeout(TAP_GAP);
  await page.evaluate(() => { const a = window.hamrah; a.store.update((s) => { s.at['store-where'] = { pos: 99, short: false, t: Date.now() }; }); a.go('lesson.store-where'); });
  await page.waitForTimeout(TAP_GAP);
  check('a saved place beyond the end of the lesson opens on its last screen before the end, not on an error', (await page.locator('.progress').count()) === 1 && (await page.locator('[data-next]').count()) === 1 && (await page.locator('.big-check').count()) === 0 && (await page.getByText(UI('err.title')).count()) === 0);
  // the learner's own name in place of the sample: the result of the speaking check as the screen shows it
  await page.evaluate(() => { const a = window.hamrah; a.store.update((s) => { s.at = {}; }); a.go('lesson.social-hello'); });
  await page.waitForSelector('.progress');
  const ownAt = await page.evaluate(() => window.hamrah.content.lessons['social-hello'].phrases.findIndex((p) => p.own && p.own.length));
  if (ownAt >= 0) {
    const { scoreSpeech } = await import(path.join(ROOT, 'src/js/match.js'));
    const sample = await page.evaluate((i) => { const p = window.hamrah.content.lessons['social-hello'].phrases[i]; return { en: p.en, own: p.own }; }, ownAt);
    for (let i = 0; i <= ownAt; i++) await next();
    const result = scoreSpeech(sample.en, sample.en.replace(/[.!?]/g, '').replace(sample.own.join(' '), 'Hossein'), { own: sample.own });
    await page.evaluate(({ key, result }) => { const a = window.hamrah; a.ui[key] = { phase: 'result', result, clip: null, level: 0, pct: 0 }; a.render(); }, { key: `say${ownAt + 1}`, result });
    await shot('10f-own-name');
    check('saying one\'s own name instead of the sample is a success that says so, with no word to "say again"', result.verdict === 'good' && (await page.locator('main .note.is-good').first().innerText()).match(UIRE('say.own.heard')) && (await page.locator('main .w.is-weak').count()) === 0 && (await page.locator('main .result-title').count()) === 1, `${sample.en} / verdict ${result.verdict}`);
  }
  await page.evaluate(() => { const a = window.hamrah; a.store.update((s) => { s.at = {}; }); a.home(); });
  await page.waitForTimeout(TAP_GAP);

  // ---- text size ------------------------------------------------------------------------------------
  await page.evaluate(() => window.hamrah.go('settings'));
  await page.waitForSelector('.seg');
  const before = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  // (a lost tap here was a real defect: Settings redraws itself when its slow checks finish, and a redraw between the
  // finger going down and coming up swallowed the tap — main.js now holds such redraws until the finger is lifted.
  // The click is pressed for 100 ms like a finger, and the checks below only count when the size really changed.)
  await page.waitForTimeout(TAP_GAP);
  await page.getByRole('button', { name: UI('set.size.4') }).click({ delay: 100 });
  await page.waitForFunction((b) => parseFloat(getComputedStyle(document.documentElement).fontSize) > b * 1.4, before, { timeout: 3000 }).catch(() => {});
  const after = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  const large = after / before > 1.4;
  check('text size control enlarges everything by 50%', Math.abs(after / before - 1.5) < 0.02, `${before}px → ${after}px`);
  { const o = await overflow(); check('nothing sticks out at the largest text size (settings)', large && o.length === 0, large ? o.join(' ; ') : 'the size did not change'); }
  await shot('11-settings-large');
  await page.evaluate(() => window.hamrah.go('lesson.store-where'));
  await page.waitForSelector('.progress'); await toPhrase();
  { const o = await overflow(); check('nothing sticks out at the largest text size (phrase)', large && o.length === 0, large ? o.join(' ; ') : 'the size did not change'); }
  await page.setViewportSize({ width: 320, height: 568 });
  { const o = await overflow(); check('nothing sticks out on a small 320px phone at the largest text size', large && o.length === 0, large ? o.join(' ; ') : 'the size did not change'); }
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('12-phrase-large');
  await page.evaluate(() => { window.hamrah.store.update((s) => { s.settings.scale = 1; }); window.hamrah.applyScale(); });

  // ---- emergency phrases ----------------------------------------------------------------------------
  await page.locator('.tb-sos').click();
  await page.waitForSelector('.note.is-danger');
  await shot('13-emergency');
  check('emergency phrases are one tap away from a lesson', (await page.locator('.mini-play').count()) >= 12);
  check('nothing in the app can dial a phone number', (await page.evaluate(() => document.querySelectorAll('a[href^="tel:"], a[href^="sms:"]').length)) === 0);

  // ---- offline ----------------------------------------------------------------------------------------
  await page.evaluate(() => window.hamrah.go('settings'));
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(TAP_GAP);
  await page.locator('main button', { hasText: UIP('off.get').split('(')[0].trim() }).click();      // (the button: the note above it names it too)
  await page.getByText(UI('off.all')).waitFor({ timeout: 120000 }).then(() => check('all lessons download for offline use', true)).catch(() => check('all lessons download for offline use', false));
  // No connection for real: the browser is told it is offline AND the server is stopped. (setOffline alone does not
  // cut the service worker's own requests, so a file missing from the stored app would be fetched and go unnoticed.)
  // Nothing after this point may need the server.
  server.kill(); await new Promise((r) => setTimeout(r, 500));
  await ctx.setOffline(true);
  await page.reload().catch(() => {});
  await page.waitForSelector('.topbar', { timeout: 15000 }).then(() => check('app opens with no connection (server stopped)', true)).catch(() => check('app opens with no connection (server stopped)', false));
  await page.evaluate(() => window.hamrah.go('lesson.clinic-checkin'));
  await page.waitForSelector('.progress'); await toPhrase();
  await page.evaluate(() => { window.__ended = 0; const P = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { this.addEventListener('ended', () => window.__ended++, { once: true }); return P.call(this); }; });
  await page.locator('.phrase .btn-sound').first().click();
  await page.waitForFunction(() => window.__ended > 0, null, { timeout: 15000 }).then(() => check('a lesson never opened before plays offline', true)).catch(() => check('a lesson never opened before plays offline', false));
  await page.locator('.tb-sos').click();
  await page.waitForTimeout(TAP_GAP);
  await page.evaluate(() => { window.__ended = 0; });
  await page.locator('.mini-play').first().click();
  await page.waitForFunction(() => window.__ended > 0, null, { timeout: 15000 }).then(() => check('emergency phrases play offline', true)).catch(() => check('emergency phrases play offline', false));
  check('offline state is announced in Farsi', await page.locator('.offline-flag').count() === 1);
  await shot('14-offline');
  await ctx.setOffline(false);

  check('no JavaScript errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
  check('test run completed', false, String(err && err.message).slice(0, 300));
  await shot('99-failure').catch(() => {});
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(shots, 'results.json'), JSON.stringify(results, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
