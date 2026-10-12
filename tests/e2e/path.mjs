// The learner's path, own details and the things that tie lessons to daily life, in a phone-sized browser.
//   HAMRAH_SITE=<built site> PORT=<port> node tests/e2e/path.mjs [--shots DIR]
// Covers: the six essential lessons on the first-run plan, «درس امروز» in each of its states (next lesson, the look
// back after five lessons, an earlier lesson or a conversation when no new lesson is left), «اطلاعات من» with the
// date-of-birth lists (no typing), «جملهٔ خودِ شما» at the end of the three "my information" lessons (and the single
// gentle invitation when nothing is filled in), the small task of a lesson and the question about it at a later
// visit, «کارهایی که حالا می‌توانم بکنم», the look back itself, and «این درس الان به کارم نمی‌آید».
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = +(process.env.PORT || 8141), SITE = process.env.HAMRAH_SITE ? path.resolve(process.env.HAMRAH_SITE) : path.join(ROOT, 'site'), URL0 = `http://localhost:${PORT}/`;
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), SITE, String(PORT)], { stdio: 'ignore' });
process.on('exit', () => server.kill());
await new Promise((r) => setTimeout(r, 700));

const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'fa-IR', serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
const shot = async (n) => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), fullPage: true }); };
const TAP_GAP = 450;      // the app ignores a tap that follows a screen change by less than 350 ms
const wait = (ms = TAP_GAP) => page.waitForTimeout(ms);
const st = () => page.evaluate(() => JSON.parse(JSON.stringify(window.hamrah.store.state)));
const route = () => page.evaluate(() => location.hash);
const sub = () => page.locator('.choice.is-primary .s').textContent();
const go = async (r) => { await page.evaluate((r) => window.hamrah.go(r), r); await wait(); };
// a learner in a given state: `make` runs in the page with (s, a) = (the blank state to fill in, the app)
const learner = async (make) => {
  await page.evaluate((src) => { const a = window.hamrah; a.audio.stop(); a.store.wipe(); a.store.update((s) => { s.onboard.done = true; s.settings.auto = false; new Function('s', 'a', src)(s, a); }); a.go('home', { reset: true }); }, make || '');
  await wait();
};
const finishLesson = async (id) => { await go('lesson.' + id); await page.evaluate((id) => { const a = window.hamrah; a.ui.finished = true; a.ui.cur = { pos: 999, short: false, warm: [] }; a.store.update((s) => { s.done[id] = { t: Date.now(), n: 1 }; }); a.render(true); }, id); await wait(); };
const tall = () => page.evaluate(() => [...document.querySelectorAll('#app .btn, #app select, #app input, #app .choice, #app .item, #app .opt')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height < 55.5; }).map((el) => `${el.tagName}:${Math.round(el.getBoundingClientRect().height)}:${el.textContent.trim().slice(0, 16)}`));

try {
  await page.goto(URL0); await page.waitForFunction(() => window.hamrah && document.querySelector('.topbar'));
  const C = await page.evaluate(() => { const a = window.hamrah, c = a.content; return { order: a.order, essentials: c.essentials, mine: Object.keys(c.mine || {}), numbersAfter: c.numbersAfter, stage3: a.order.filter((id) => c.lessons[id].stage === 3), titles: Object.fromEntries(a.order.map((id) => [id, c.lessons[id].title.fa])) }; });

  // ---- first run: "I understand simple sentences" still starts with the six essential lessons ----
  await page.locator('.opt').nth(2).click(); await wait();
  await page.locator('.opt').first().click(); await wait();
  await page.locator('.tile').first().click(); await wait();
  const plan = await page.locator('.card .stack p').allTextContents();
  check('first run: the plan lists the essential lessons, the three "my information" lessons among them', plan.length === C.essentials.length && C.essentials.length === 6 && C.mine.every((id) => plan.some((p) => p.includes(C.titles[id]))), plan.join(' | '));
  await shot('01-plan');
  await page.getByText('شروع کنیم').click(); await wait();
  check('«درس امروز» names the first lesson and how long it takes', (await sub()).includes(C.titles[C.essentials[0]]) && /دقیقه/.test(await sub()), await sub());
  check('the home screen still has exactly four large choices', (await page.locator('.choice').count()) === 4);

  // ---- «اطلاعات من»: no typing for the date of birth ----
  await learner('');
  await go('me');
  check('«اطلاعات من» has the learner\'s own phone number and three lists for the date of birth', (await page.locator('#me-phone').count()) === 1 && (await page.locator('select').count()) === 3);
  check('…every field and list is a large touch target', (await tall()).length === 0, await tall());
  const months = await page.locator('#me-born-m option').allTextContents();
  check('…months are named in Farsi with the English beside them', months.length === 13 && months[12].includes('دسامبر') && months[12].includes('December'), months[12]);
  await shot('02-me-empty');
  await page.fill('#me-name', 'Hossein Karimi'); await page.fill('#me-address', '1420 Wilshire Boulevard, Apartment 5'); await page.fill('#me-phone', '(310) 555-0142');
  await page.selectOption('#me-born-m', '12'); await page.selectOption('#me-born-d', '14'); await page.selectOption('#me-born-y', '1955'); await wait(150);
  check('…the date is stored and shown as the sentence the learner will say', (await st()).me.born === '1955-12-14' && await page.locator('#app').getByText('I was born on December 14th, 1955.').isVisible());
  await page.selectOption('#me-born-m', '2'); await page.selectOption('#me-born-d', '30'); await wait(150);
  check('…a day the month does not have is asked for again, in Farsi', (await st()).me.born === '1955-2-0' && await page.locator('#app').getByText('این ماه چنین روزی ندارد').isVisible());
  await page.selectOption('#me-born-m', '12'); await page.selectOption('#me-born-d', '14'); await wait(150);
  await shot('03-me-filled');
  await page.reload(); await page.waitForFunction(() => window.hamrah && document.querySelector('.topbar')); await wait();
  check('…and everything is still there after the app is closed and opened again', (await st()).me.phone === '(310) 555-0142' && (await page.locator('#me-born-y').inputValue()) === '1955' && (await page.locator('#me-born-m').inputValue()) === '12');

  // ---- «جملهٔ خودِ شما» at the end of the three lessons ----
  const want = { 'my-numbers': ['My phone number is 310-555-0142.', 'three one zero, five five five, zero one four two', 'years old.'], 'my-name': ['My first name is Hossein.', 'My last name is Karimi.', "It's spelled K-A-R-I-M-I."], 'my-address-birthday': ['I live at 1420 Wilshire Boulevard, Apartment 5.', 'I was born on December 14th, 1955.', 'December fourteenth, nineteen fifty-five'] };
  for (const id of C.mine) {
    await finishLesson(id);
    const text = await page.locator('main').innerText();
    check(`end of ${id}: the learner's own sentences`, (want[id] || []).every((x) => text.includes(x)), (want[id] || []).filter((x) => !text.includes(x)).join(' | '));
    check(`end of ${id}: the small task for today is shown`, text.includes('یک کار کوچک برای امروز'));
    await shot('04-done-' + id);
  }
  // playing the date asks the player for the recorded pieces, in order
  await page.evaluate(() => { const a = window.hamrah; window.__played = []; const play = a.audio.play; a.audio.play = (clips, opts) => { window.__played.push((Array.isArray(clips) ? clips : [clips]).map((c) => c.text)); return play(clips, opts); }; });
  await page.locator('.own-line .btn-sound').last().click(); await wait(300);
  const played = await page.evaluate(() => { window.hamrah.audio.stop(); return window.__played[0]; });
  check('the date of birth is played from single recordings: month, day as an ordinal, the year in two pairs', JSON.stringify(played) === JSON.stringify(['I was born on', 'December', 'fourteenth', 'nineteen', 'fifty-five']), played);
  check('«پاک کردن همه‌چیز» would remove these details too (they are part of the saved state and nowhere else)', await page.evaluate(() => { const keys = Object.keys(localStorage).filter((k) => localStorage.getItem(k).includes('Karimi')); return keys.length === 1 && keys[0].startsWith('hamrah.v1'); }));

  // ---- nothing filled in: one gentle invitation, never in the way ----
  await learner('');
  await finishLesson(C.mine[1]);
  check('empty «اطلاعات من»: the end of the lesson invites the learner once', await page.getByText('وارد کردن اطلاعات من').isVisible() && (await page.locator('main .btn-primary').count()) >= 1);
  await shot('05-done-invite');
  await wait(100);
  await finishLesson(C.mine[0]);
  check('…at the next lesson it is one quiet line, not a card again', (await page.getByText('وارد کردن اطلاعات من').count()) === 0 && await page.getByText('برای دیدن جملهٔ خودتان').isVisible());
  await page.getByText('برای دیدن جملهٔ خودتان').click(); await wait();
  check('…which opens «اطلاعات من», and Back returns to the end of the lesson', (await route()) === '#me');
  await page.locator('.tb-btn').first().click(); await wait(700);
  check('…back at the end of the lesson', (await route()) === '#lesson.' + C.mine[0] && (await page.locator('.big-check').count()) === 1, await route());

  // ---- more practice on the last screen of a lesson ----
  if (C.numbersAfter.length) {
    await finishLesson(C.numbersAfter[0]);
    check('the lessons with numbers offer «شنیدن عددها» when they are finished', await page.getByText('شنیدن عددها').first().isVisible());
    await page.getByText('شنیدن عددها').first().click(); await wait();
    check('…and it opens', (await route()) === '#numbers');
  }
  await learner(`s.done[a.order[0]] = { t: Date.now(), n: 1 };`);
  await finishLesson(C.order[1]);
  check('"next lesson" at the end of a lesson follows the learner\'s path', (await page.locator('main').innerText()).includes('درس بعدی: ' + C.titles[C.essentials[2]]), C.titles[C.essentials[2]]);
  await page.getByText('همهٔ کارهایی که حالا می‌توانم بکنم').click(); await wait();
  check('the end of a lesson leads to «کارهایی که حالا می‌توانم بکنم»', (await route()) === '#cando' && (await page.locator('[data-cando]').count()) === 2);

  // ---- the small task: asked once at a later visit ----
  await learner(`s.done[a.order[0]] = { t: Date.now() - 600000, n: 1 };`);
  check('ten minutes after a lesson the home screen does not ask about its small task yet', (await page.locator('[data-mission]').count()) === 0);
  await learner(`s.done[a.order[0]] = { t: Date.now() - 20 * 3600000, n: 1 };`);
  check('at a later visit it asks once: «توانستید امتحانش کنید؟»', (await page.locator('[data-mission]').count()) === 1 && await page.getByText('توانستید امتحانش کنید؟').isVisible() && (await page.locator('.choice').count()) === 4);
  await shot('06-home-mission');
  await page.locator('[data-mission] .btn').nth(1).click(); await wait(700);
  check('«هنوز نه» is accepted without any penalty and the question is gone', (await page.locator('[data-mission]').count()) === 0 && (await st()).tried[C.order[0]] === 0 && Object.keys((await st()).hard).length === 0);
  await page.reload(); await page.waitForFunction(() => window.hamrah && document.querySelector('.topbar')); await wait();
  check('…and it is not asked a second time', (await page.locator('[data-mission]').count()) === 0);
  await go('places');
  check('«موقعیت‌های روزمره» leads to «کارهایی که حالا می‌توانم بکنم»', (await page.locator('.item').first().innerText()).includes('کارهایی که حالا می‌توانم بکنم'));
  await page.locator('.item').first().click(); await wait();
  await page.getByText('این را امتحان کردم').first().click(); await wait(200);
  check('there the learner can say later that they tried it', (await st()).tried[C.order[0]] === 1 && await page.locator('#app').getByText('امتحان کردم', { exact: true }).isVisible());
  await shot('07-cando');

  // ---- the look back after every fifth lesson ----
  await learner(`a.order.slice(0, 5).forEach((id, i) => { s.done[id] = { t: Date.now() - (9 - i) * 86400000, n: 1 }; for (const p of a.content.lessons[id].phrases) s.srs['p:' + id + ':' + p.id] = { b: 2, d: a.today() + 3, n: 0 }; s.tried[id] = 1; });`);
  check('after five lessons «درس امروز» offers a short look back, and says so', (await sub()).includes('مرور کوتاه'), await sub());
  await shot('08-home-checkpoint');
  await page.locator('.choice.is-primary').click(); await wait();
  check('the look back says what it is, that there is no mark, and can be passed over', (await route()) === '#checkpoint' && (await page.locator('main').innerText()).includes('نمره‌ای در کار نیست') && (await page.locator('[data-cp-skip]').count()) === 1);
  await shot('09-cp-intro');
  await page.locator('[data-next]').click(); await wait();
  const kinds = []; let missedOne = false;
  for (let i = 0; i < 12; i++) {
    if (!(await page.locator('main .opt').count())) break;
    const hear = (await page.getByText('او چه می‌گوید').count()) > 0;
    kinds.push(hear ? 'h' : 's');
    if (i < 2) await shot('10-cp-q' + i);
    if (!hear && !missedOne) {      // one speaking question: a wrong tap first
      missedOne = true;
      const wrong = await page.evaluate(() => { const S = window.hamrah.ui.cp; const it = S.plan.items[S.pos]; return it.options.findIndex((o) => !o.right); });
      await page.locator('main .opt').nth(wrong).click(); await wait(100);
      check('look back: a wrong tap is met with "try another one", never "wrong"', (await page.locator('main .note').innerText()).includes('اشکالی ندارد'));
    }
    const right = await page.evaluate(() => { const S = window.hamrah.ui.cp; return S.plan.items[S.pos].options.findIndex((o) => o.right); });
    await page.locator('main .opt').nth(right).click(); await wait(100);
    await page.locator('[data-next]').click(); await wait();
  }
  check('look back: four listening and four speaking questions, taking turns', kinds.join('') === 'hshshshs', kinds.join(''));
  const endText = await page.locator('main').innerText();
  check('look back: it ends with what to look at again and a conversation — no mark, no count of mistakes', endText.includes('مرور تمام شد') && !/[۰-۹]+ از [۰-۹]+/.test(endText) && (await page.locator('main .btn-primary').innerText()).includes('گفت‌وگو') && (await page.locator('main .opt-wrap').count()) === 1, endText.slice(0, 80));
  await shot('11-cp-done');
  const after = await st();
  const missedKey = Object.keys(after.hard)[0];
  check('look back: the sentence that needed another try comes back in review tomorrow', !!missedKey && after.srs['p:' + missedKey].d === (await page.evaluate(() => window.hamrah.today())) + 1, missedKey);
  check('look back: done once — «درس امروز» is the next lesson again', after.cp.n === 1);
  await page.locator('.tb-btn', { hasText: 'خانه' }).click(); await wait();
  check('…on the home screen too', (await sub()).includes(C.titles[C.order[5]]), await sub());
  // passing it over
  await learner(`a.order.slice(0, 5).forEach((id, i) => { s.done[id] = { t: Date.now() - (9 - i) * 86400000, n: 1 }; s.tried[id] = 1; });`);
  await page.locator('.choice.is-primary').click(); await wait();
  await page.locator('[data-cp-skip]').click(); await wait();
  check('look back: «الان نه» goes straight to the next lesson and does not come back the next day', (await route()) === '#lesson.' + C.order[5] && (await st()).cp.n === 1, await route());

  // ---- «این درس الان به کارم نمی‌آید» ----
  if (C.stage3.length > 1) {
    await learner(`a.order.forEach((id, i) => { if (a.content.lessons[id].stage < 3) s.done[id] = { t: Date.now() - (90 - i) * 86400000, n: 1 }; }); s.cp = { n: 999, t: 1 }; s.tried = Object.fromEntries(a.order.map((id) => [id, 1]));`);
    check('«درس امروز» is the first lesson of the last stage', (await sub()).includes(C.titles[C.stage3[0]]), await sub());
    await page.locator('.choice.is-primary').click(); await wait();
    check('a lesson of the last stage can be set aside from its first screen', (await page.locator('[data-later]').count()) === 1);
    await shot('12-later');
    await page.locator('[data-later]').click(); await wait();
    check('…it says where the lesson went, offers the next one, and one tap brings it back', (await st()).later[C.stage3[0]] === 1 && (await page.locator('main').innerText()).includes('درس بعدی: ' + C.titles[C.stage3[1]]) && (await page.locator('[data-later-back]').count()) === 1);
    await shot('13-later-set');
    await page.locator('.tb-btn', { hasText: 'خانه' }).click(); await wait();
    check('…«درس امروز» moves on to the next lesson', (await sub()).includes(C.titles[C.stage3[1]]), await sub());
    await go('lesson.' + C.stage3[0]);
    await page.locator('[data-later-back]').click(); await wait();
    check('…brought back, it is «درس امروز» again', (await st()).later[C.stage3[0]] === undefined && (await page.evaluate(() => window.hamrah.nextLesson().id)) === C.stage3[0]);
    await go('lesson.' + C.order[0]);
    check('a lesson of the first stage cannot be set aside', (await page.locator('[data-later]').count()) === 0);
  }

  // ---- when no new lesson is left ----
  await learner(`a.order.forEach((id, i) => { s.done[id] = { t: Date.now() - (100 - i) * 86400000, n: 1 }; }); s.cp = { n: 999, t: 1 }; s.tried = Object.fromEntries(a.order.map((id) => [id, 1])); s.hard[a.order[17] + ':p2'] = 3;`);
  check('no new lesson left: «درس امروز» offers the lesson with the most misses, and says it is a short repeat', (await sub()).includes('کوتاه و دوباره') && (await sub()).includes(C.titles[C.order[17]]), await sub());
  await shot('14-home-after-path');
  await page.locator('.choice.is-primary').click(); await wait(700);
  check('…and opens it in its short form', (await route()) === '#lesson.' + C.order[17] && (await page.locator('main .switch').getAttribute('aria-checked')) === 'true');
  await learner(`a.order.forEach((id, i) => { s.done[id] = { t: Date.now() - (100 - i) * 86400000, n: 1 }; }); s.cp = { n: 999, t: 1 }; s.tried = Object.fromEntries(a.order.map((id) => [id, 1])); s.done[a.order[17]].t = Date.now();`);
  check('…once a lesson is done that day, a conversation is offered', (await sub()).includes('گفت‌وگو'), await sub());
  await page.locator('.choice.is-primary').click(); await wait();
  check('…and opens', (await route()).startsWith('#rp.'), await route());
  await learner(`a.order.forEach((id, i) => { s.done[id] = { t: Date.now() - (100 - i) * 86400000, n: 1 }; }); s.cp = { n: 999, t: 1 }; s.tried = Object.fromEntries(a.order.map((id) => [id, 1])); s.done[a.order[17]].t = Date.now(); for (const r of a.content.roleplays) s.rp[r.id] = 5;`);
  check('…the home screen never says that nothing is left', (await sub()).includes('گفت‌وگو') && !(await page.locator('main').innerText()).includes('حالا مرور کنید'), await sub());

  // ---- damaged saved state does not break these screens ----
  await learner(`s.done.constructor = { t: 5, n: 1 }; s.at.constructor = { pos: 3, t: 9 }; s.later = { constructor: 1 }; s.tried = { nope: 1 }; s.me.born = 'x'; s.cp = { n: 'a' };`);
  for (const r of ['home', 'cando', 'me', 'checkpoint', 'places']) { await go(r); if ((await page.locator('#app h1').count()) !== 1 || (await page.locator('main').innerText()).includes('مشکلی پیش آمد')) check(`damaged state: ${r} still opens`, false); }
  check('damaged saved state: home, the list, «اطلاعات من» and the look back still open', true);
  check('no JavaScript errors', errors.length === 0, [...new Set(errors)].slice(0, 3).join(' | '));
} catch (e) {
  check('test run completed', false, e.message.split('\n').slice(0, 6).join('\n'));
}
await browser.close();
server.kill();
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
