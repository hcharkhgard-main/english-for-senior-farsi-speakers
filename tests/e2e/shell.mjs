// The app shell, tested the way an unsteady hand, a keyboard and a screen reader meet it.
//   HAMRAH_SITE=<built site> PORT=<port> node tests/e2e/shell.mjs
// Covers: the confirmation sheet (a double tap can never delete; safe choice first and focused;
// Escape; focus kept inside and given back), double taps after a screen change, odd addresses
// ("#constructor", unknown lessons), the phone's Back gesture and the address staying in step,
// returning from the emergency page to the same step, focus and spoken feedback after a screen
// is redrawn, labelled progress bars and groups, and messages that stay long enough to read.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = +(process.env.PORT || 8139), SITE = process.env.HAMRAH_SITE ? path.resolve(process.env.HAMRAH_SITE) : path.join(ROOT, 'site'), BASE = `http://localhost:${PORT}/`;
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), SITE, String(PORT)], { stdio: 'ignore' });
process.on('exit', () => server.kill());        // also when a check throws
await new Promise((r) => setTimeout(r, 700));

const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const mk = async (vp = { width: 390, height: 844 }, mobile = true) => {
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, locale: 'fa-IR', serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto(BASE); await page.waitForFunction(() => window.hamrah && document.querySelector('.topbar'));
  await page.evaluate(() => { window.hamrah.store.update((s) => { s.onboard.done = true; s.settings.auto = false; }); window.hamrah.go('home', { reset: true }); });
  return { ctx, page, errors };
};
const st = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.hamrah.store.state)));
const route = (page) => page.evaluate(() => location.hash);
const h1 = (page) => page.evaluate(() => (document.querySelector('#app h1') || {}).textContent || '');
const act = (page) => page.evaluate(() => { const el = document.activeElement; return el ? el.tagName + ':' + el.textContent.trim().slice(0, 30) : null; });
const go = async (page, r) => { await page.evaluate((r) => window.hamrah.go(r), r); await page.waitForTimeout(80); };
// the lesson screen of a given kind, found by walking the lesson (its length differs from lesson to lesson)
const lessonScreen = async (page, id, want) => {
  await page.evaluate((id) => { const a = window.hamrah; a.tapHold = 0; a.store.update((s) => { if (s.at) delete s.at[id]; }); a.go('home', { reset: true }); a.go('lesson.' + id); }, id);
  for (let n = 0; n < 80; n++) {
    const kind = await page.evaluate(() => { const q = (s) => document.querySelector('#app main ' + s); if (q('.big-check')) return 'done'; if (q('.tiles-pool')) return 'build'; if (q('.phrase [data-play]') && !q('.opt')) return 'phrase'; if (q('.mic-btn')) return 'say'; if (q('.chat') && !q('.opt')) return 'dialogue'; if (q('.opt-wrap .opt')) return 'pick'; if (q('.opt')) return 'listen'; return 'other'; });
    if (kind === want || kind === 'done') break;
    await page.evaluate(() => document.querySelector('[data-next]').click());
  }
  await page.evaluate(() => { window.hamrah.tapHold = 350; }); await page.waitForTimeout(400);
};

// ---- 1. a double tap can never confirm a deletion ---------------------------------------------
for (const vp of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
  const { ctx, page } = await mk(vp);
  await page.evaluate(() => { window.hamrah.store.update((s) => { s.me.name = 'Maryam'; s.done.x = { t: 1, n: 1 }; }); window.hamrah.go('settings'); });
  await page.waitForTimeout(500);
  for (const [idx, label] of [[1, 'delete everything'], [0, 'reset progress']]) {
    const btn = page.locator('#app main .btn-danger').nth(idx);
    await btn.scrollIntoViewIfNeeded();
    const box = await btn.boundingBox();
    let survived = true;
    for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.3], [0.8, 0.7]]) {
      const x = box.x + box.width * fx, y = box.y + box.height * fy;
      for (const gap of [120, 200, 300, 450, 550]) {
        await page.touchscreen.tap(x, y); await page.waitForTimeout(gap); await page.touchscreen.tap(x, y); await page.waitForTimeout(250);
        const s = await st(page);
        if (s.me.name !== 'Maryam' || !s.done.x) { survived = false; console.log('   lost with', { fx, fy, gap }); }
        await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
        await page.waitForTimeout(450);
        if (!survived) break;
      }
      if (!survived) break;
    }
    check(`${vp.width}x${vp.height}: double tap on "${label}" (15 timings/positions) deletes nothing`, survived);
  }
  await ctx.close();
}
{
  const { ctx, page, errors } = await mk({ width: 820, height: 900 }, false);
  await page.evaluate(() => { window.hamrah.store.update((s) => { s.me.name = 'Maryam'; }); window.hamrah.go('settings'); });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelectorAll('#app main .btn-danger')[1].focus());
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  const d = await page.evaluate(() => { const s = document.querySelector('.sheet'); const a = document.activeElement; return { open: !!s, focus: a.textContent.trim(), focusDanger: a.classList.contains('btn-danger'), first: s.querySelector('button').textContent.trim(), firstDanger: s.querySelector('button').classList.contains('btn-danger'), inert: document.querySelector('#app').hasAttribute('inert'), labelled: !!s.getAttribute('aria-labelledby') && !!s.getAttribute('aria-describedby') }; });
  check('sheet opens with focus on the safe choice, which is first; page behind is inert', d.open && !d.focusDanger && !d.firstDanger && d.focus === d.first && d.inert && d.labelled, d);
  const seq = []; for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(() => (document.querySelector('.sheet').contains(document.activeElement) ? 'in' : 'OUT'))); }
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Shift+Tab'); seq.push(await page.evaluate(() => (document.querySelector('.sheet').contains(document.activeElement) ? 'in' : 'OUT'))); }
  check('Tab and Shift+Tab stay inside the sheet', !seq.includes('OUT'), seq.join(','));
  await page.waitForTimeout(650);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('Escape closes the sheet and focus returns to the button that opened it', (await page.evaluate(() => !document.querySelector('.sheet'))) && (await act(page)).includes('پاک کردن همه‌چیز'), await act(page));
  check('…nothing was deleted and the page is usable again', (await st(page)).me.name === 'Maryam' && await page.evaluate(() => !document.querySelector('#app').hasAttribute('inert')));
  // Enter held down must not run through to "yes"
  await page.keyboard.press('Enter'); await page.waitForTimeout(50); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  check('Enter pressed twice quickly: sheet still open, nothing deleted', (await page.evaluate(() => !!document.querySelector('.sheet'))) && (await st(page)).me.name === 'Maryam');
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);       // now on the safe button: closes
  check('after the pause, the safe button closes the sheet', await page.evaluate(() => !document.querySelector('.sheet')));
  // deliberate deletion still works
  await page.locator('#app main .btn-danger').nth(1).click(); await page.waitForTimeout(700);
  await page.locator('.sheet .btn-danger').click(); await page.waitForTimeout(300);
  check('a deliberate "yes" after the pause does delete, and returns to the first-run screen', (await st(page)).me.name === '' && (await route(page)) === '#onboard', await route(page));
  // a sheet does not survive navigation
  await page.evaluate(() => { window.hamrah.store.update((s) => { s.onboard.done = true; }); window.hamrah.go('settings'); }); await page.waitForTimeout(100);
  await page.locator('#app main .btn-danger').first().click(); await page.waitForTimeout(100);
  await page.evaluate(() => window.hamrah.go('home', { reset: true })); await page.waitForTimeout(100);
  check('a sheet is closed when the app moves to another screen', await page.evaluate(() => !document.querySelector('.sheet-back') && !document.querySelector('#app').hasAttribute('inert')));
  // clearing the personal card asks first
  await page.evaluate(() => { window.hamrah.store.update((s) => { s.me = { name: 'Maryam Ahmadi', address: '25 Oak Street', contact: '212-555-0142' }; }); window.hamrah.go('me'); }); await page.waitForTimeout(450);      // (a tap within 350 ms of the last tap, after a screen change, is ignored)
  await page.locator('#app main .btn-danger').click(); await page.waitForTimeout(100);
  check('"clear my details" opens a confirmation instead of deleting', (await page.evaluate(() => !!document.querySelector('.sheet'))) && (await st(page)).me.name === 'Maryam Ahmadi');
  await page.waitForTimeout(650); await page.locator('.sheet .btn-danger').click(); await page.waitForTimeout(200);
  check('…and deletes only after "yes"', (await st(page)).me.name === '' && (await page.locator('#me-name').inputValue()) === '');
  // typing is not interrupted by a background redraw; long input is stopped, not cut silently
  await page.locator('#me-name').click(); await page.keyboard.type('Mar'); await page.evaluate(() => window.hamrah.render()); await page.keyboard.type('yam');
  check('typing survives a redraw of the screen in the middle of a word', (await page.locator('#me-name').inputValue()) === 'Maryam' && (await st(page)).me.name === 'Maryam', await page.locator('#me-name').inputValue());
  await page.locator('#me-address').fill('x'.repeat(150));
  check('a field stops at 120 characters and says so', (await page.locator('#me-address').inputValue()).length === 120 && (await page.locator('.toast').count()) === 1);
  check('no JavaScript errors (sheet tests)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---- 2. double taps elsewhere ---------------------------------------------------------------------
{
  const { ctx, page, errors } = await mk();
  const posOf = () => page.evaluate(() => { const a = window.hamrah.store.state; const id = 'social-hello'; return a.at ? (a.at[id] ? a.at[id].pos : 0) : a.current.pos; });
  await page.evaluate(() => window.hamrah.go('lesson.social-hello')); await page.waitForTimeout(500);
  const nb = await page.locator('[data-next]').boundingBox();
  await page.touchscreen.tap(nb.x + nb.width / 2, nb.y + nb.height / 2); await page.waitForTimeout(120); await page.touchscreen.tap(nb.x + nb.width / 2, nb.y + nb.height / 2); await page.waitForTimeout(300);
  check('double tap on «بعدی» (120 ms apart) moves one screen, not two', (await posOf()) === 1, 'pos ' + await posOf());
  await page.waitForTimeout(400); await page.touchscreen.tap(nb.x + nb.width / 2, nb.y + nb.height / 2); await page.waitForTimeout(450); await page.touchscreen.tap(nb.x + nb.width / 2, nb.y + nb.height / 2); await page.waitForTimeout(200);
  check('two deliberate taps (450 ms apart) move two screens', (await posOf()) === 3, 'pos ' + await posOf());
  // home: double tap on "learn words" must not open what lies under the finger on the next screen
  await page.evaluate(() => window.hamrah.go('home', { reset: true })); await page.waitForTimeout(500);
  const cb = await page.locator('.choice').nth(2).boundingBox();
  await page.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.waitForTimeout(180); await page.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.waitForTimeout(300);
  check('double tap on a home card opens that screen only', (await route(page)) === '#words', await route(page));
  // conversation: a double tap answers one turn
  await page.evaluate(() => window.hamrah.go('rp.rp-store')); await page.waitForTimeout(450);
  await page.locator('#app main .btn-primary').first().click(); await page.waitForTimeout(600);
  const ob = await page.locator('#app main .opt').first().boundingBox();
  await page.touchscreen.tap(ob.x + ob.width / 2, ob.y + ob.height / 2); await page.waitForTimeout(150); await page.touchscreen.tap(ob.x + ob.width / 2, ob.y + ob.height / 2); await page.waitForTimeout(400);
  const you = await page.locator('.bubble.you').count();
  check('double tap on a reply in a conversation answers one turn', you === 1, `learner bubbles: ${you}`);
  // …nor can that second tap answer the question about the partner's line («چه گفت؟»), which now stands where the answers were
  await page.evaluate(() => { const a = window.hamrah; a.ui.rp = null; a.render(true); }); await page.waitForTimeout(450);
  await page.locator('#app main .btn-primary').first().click(); await page.waitForTimeout(700);
  const dbl = await page.evaluate(() => { document.querySelector('.replies .opt').click(); const o = document.querySelector('#app main > .stack:not(.replies) .opt'); if (o) o.click();
    return { asked: !!document.querySelector('[data-check]'), choice: !!o, tried: document.querySelectorAll('.opt.is-tried').length, caught: document.querySelectorAll('.bubble .caught').length }; });
  await page.waitForTimeout(700);
  const afterPause = await page.evaluate(() => { document.querySelector('#app main > .stack:not(.replies) .opt').click(); return document.querySelectorAll('.opt.is-tried').length + document.querySelectorAll('.bubble .caught').length; });
  check('…and the second tap cannot answer the question about the partner\'s line; a tap after the pause can', dbl.asked && dbl.choice && dbl.tried === 0 && dbl.caught === 0 && afterPause === 1, JSON.stringify({ ...dbl, afterPause }));
  check('no JavaScript errors (double-tap tests)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---- 3. router ---------------------------------------------------------------------------------------
{
  const { ctx, page, errors } = await mk();
  const nfTitle = await page.evaluate(() => window.hamrah.t('nf.title'));
  for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'lesson.nope', 'lesson', 'rp.nope', 'cat.nope', 'place.nope', 'build.nope', 'zzz', 'lesson.__proto__']) {
    await page.goto(BASE + '#' + bad); await page.reload(); await page.waitForFunction(() => window.hamrah && document.querySelector('.topbar'));
    const r = await page.evaluate(() => ({ h1: document.querySelector('#app h1').textContent, home: [...document.querySelectorAll('#app main button')].map((b) => b.textContent.trim()), body: document.querySelector('#app main').textContent.includes('undefined') }));
    check(`#${bad} shows the "not found" card with a Home button`, r.h1 === nfTitle && r.home.includes('خانه') && !r.body, r.h1);
  }
  await page.locator('#app main button', { hasText: 'خانه' }).click(); await page.waitForTimeout(450);
  check('its Home button goes home and the address says so', (await route(page)) === '#home' && (await page.locator('.choice').count()) === 4);
  check('no console errors from odd addresses', errors.length === 0, errors.slice(0, 3).join(' | '));

  // history: in-app Back, phone Back, address in step
  await page.goto('about:blank'); await page.goto(BASE); await page.waitForFunction(() => window.hamrah && document.querySelector('.topbar'));
  const len0 = await page.evaluate(() => history.length);
  await page.locator('.choice').nth(2).click(); await page.waitForTimeout(450);            // words
  await page.locator('#app main .item').last().click(); await page.waitForTimeout(450);    // a category
  const cat = await route(page);
  check('address follows the screens', cat.startsWith('#cat.'), cat);
  await page.locator('.tb-btn', { hasText: 'برگشت' }).click(); await page.waitForTimeout(450);
  check('in-app Back: screen and address both go back', (await route(page)) === '#words' && (await h1(page)) === 'یادگیری کلمات', await route(page));
  await page.reload(); await page.waitForFunction(() => window.hamrah && document.querySelector('.topbar'));
  check('reload after Back reopens the screen that was on show (not the one left behind)', (await route(page)) === '#words' && (await h1(page)) === 'یادگیری کلمات');
  await page.locator('.tb-btn', { hasText: 'برگشت' }).click(); await page.waitForTimeout(450);
  check('Back again reaches home, address #home', (await route(page)) === '#home' && (await page.locator('.choice').count()) === 4, await route(page));
  check('in-app Back did not pile up history entries', (await page.evaluate(() => history.length)) <= len0 + 2, `${len0} -> ${await page.evaluate(() => history.length)}`);
  await page.locator('.choice').nth(2).click(); await page.waitForTimeout(450);
  await page.locator('#app main .item').first().click(); await page.waitForTimeout(450);
  await page.goBack(); await page.waitForTimeout(300);
  check('the phone\'s Back gesture goes to the previous screen inside the app', (await route(page)) === '#words' && (await h1(page)) === 'یادگیری کلمات', await page.url());
  await page.goBack(); await page.waitForTimeout(300);
  check('…and again to home (still inside the app)', (await route(page)) === '#home' && (await page.locator('.choice').count()) === 4, await page.url());
  await page.goForward(); await page.waitForTimeout(300);
  check('Forward works too', (await route(page)) === '#words');
  await page.evaluate(() => { location.hash = '#settings'; }); await page.waitForTimeout(300);
  check('an address typed by hand opens that screen', (await h1(page)) === 'تنظیمات');
  await page.locator('.tb-btn', { hasText: 'برگشت' }).click(); await page.waitForTimeout(700);
  check('…and Back from it leads home, not out of the app', page.url().startsWith(BASE) && (await page.locator('.topbar').count()) === 1, page.url());

  // "another one" buttons do not leave a duplicate under Back (finding 14)
  await page.evaluate(() => window.hamrah.go('home', { reset: true })); await page.waitForTimeout(100);
  await page.evaluate(() => window.hamrah.go('talk')); await page.evaluate(() => window.hamrah.go('rp.rp-store')); await page.waitForTimeout(100);
  await page.evaluate(() => window.hamrah.go('talk', { replace: true })); await page.waitForTimeout(300);
  check('replace onto the list underneath returns to that list', (await route(page)) === '#talk');
  await page.locator('.tb-btn', { hasText: 'برگشت' }).click(); await page.waitForTimeout(450);
  check('…and one Back from it is home', (await route(page)) === '#home', await route(page));
  check('no JavaScript errors (router tests)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---- 4. the emergency page keeps your place -------------------------------------------------------------
{
  const { ctx, page, errors } = await mk();
  await page.evaluate(() => window.hamrah.go('lesson.social-hello')); await page.waitForTimeout(450);
  for (let i = 0; i < 6; i++) { await page.locator('[data-next]').click(); await page.waitForTimeout(420); }
  // answer the listening question wrongly once, so there is screen state to keep
  const wrong = await page.evaluate(() => { const o = [...document.querySelectorAll('.opt')]; return o.length; });
  if (wrong) { await page.locator('.opt').last().click(); await page.waitForTimeout(100); }
  const before = await page.evaluate(() => ({ lbl: document.querySelector('.progress .lbl').textContent, tried: document.querySelectorAll('.opt.is-tried, .opt.is-right').length, main: document.querySelector('main').textContent.length }));
  await page.locator('.tb-sos').click(); await page.waitForTimeout(450);
  check('emergency page opens from inside a lesson', (await route(page)) === '#sos');
  await page.locator('.tb-btn', { hasText: 'برگشت' }).click(); await page.waitForTimeout(450);
  const after = await page.evaluate(() => ({ lbl: document.querySelector('.progress .lbl').textContent, tried: document.querySelectorAll('.opt.is-tried, .opt.is-right').length, main: document.querySelector('main').textContent.length }));
  check('Back from the emergency page returns to the same lesson screen, with the answers given so far', JSON.stringify(before) === JSON.stringify(after), { before, after });
  // conversation
  await page.evaluate(() => window.hamrah.go('rp.rp-store')); await page.waitForTimeout(450);
  await page.locator('#app main .btn-primary').first().click(); await page.waitForTimeout(500);
  await page.locator('#app main .opt').first().click(); await page.waitForTimeout(500);
  const b1 = await page.locator('.bubble').count();
  await page.locator('.tb-sos').click(); await page.waitForTimeout(450);
  await page.locator('.tb-btn', { hasText: 'برگشت' }).click(); await page.waitForTimeout(450);
  check('Back from the emergency page returns to the same turn of a conversation', (await page.locator('.bubble').count()) === b1 && b1 >= 3, `bubbles ${b1} -> ${await page.locator('.bubble').count()}`);
  // the phone's own Back does the same
  await page.locator('.tb-sos').click(); await page.waitForTimeout(450); await page.goBack(); await page.waitForTimeout(300);
  check('…also with the phone\'s Back gesture', (await page.locator('.bubble').count()) === b1);
  // finished lesson: done screen survives a visit to the emergency page (finding 9c)
  await page.evaluate(() => { const a = window.hamrah; a.tapHold = 0; a.go('home', { reset: true }); a.go('lesson.social-hello'); }); await page.waitForTimeout(100);
  for (let i = 0; i < 80 && !(await page.locator('.big-check').count()); i++) { if (!(await page.evaluate(() => { const n = document.querySelector('[data-next]'); if (n) n.click(); return !!n; }))) break; }
  await page.evaluate(() => { window.hamrah.tapHold = 350; });
  const doneBefore = await page.locator('.big-check').count();
  await page.waitForTimeout(400); await page.locator('.tb-sos').click(); await page.waitForTimeout(450); await page.locator('.tb-btn').first().click(); await page.waitForTimeout(450);
  check('the "lesson finished" screen is still there after a visit to the emergency page', doneBefore === 1 && (await page.locator('.big-check').count()) === 1, `before ${doneBefore}`);
  check('no JavaScript errors (keep-your-place tests)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
// ---- 5. first run: emergency button, and Back returns to the same question ---------------------------------
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR', serviceWorkers: 'block' });
  const page = await ctx.newPage(); await page.goto(BASE); await page.waitForFunction(() => window.hamrah && document.querySelector('.topbar'));
  check('the emergency button is on the first-run screens', (await page.locator('.topbar .tb-sos').count()) === 1);
  const q1 = await page.evaluate(() => document.querySelector('main').textContent.slice(0, 200));
  await page.locator('#app main .opt').first().click(); await page.waitForTimeout(450);
  const q2 = await page.evaluate(() => document.querySelector('main').textContent.slice(0, 200));
  await page.locator('.topbar .tb-sos').click(); await page.waitForTimeout(450);
  check('emergency phrases open before the questions are finished; no Home button yet', (await page.locator('.mini-play').count()) >= 12 && (await page.locator('.tb-btn', { hasText: 'خانه' }).count()) === 0);
  await page.locator('.tb-btn', { hasText: 'برگشت' }).click(); await page.waitForTimeout(450);
  const back = await page.evaluate(() => document.querySelector('main').textContent.slice(0, 200));
  check('Back returns to the same first-run question', back === q2 && q2 !== q1);
  await ctx.close();
}
// ---- 6. focus, spoken feedback, labels, messages ------------------------------------------------------
const actInfo = (page) => page.evaluate(() => { const el = document.activeElement; return { tag: el.tagName, cls: String(el.className), text: el.textContent.trim().slice(0, 40), inApp: !!el.closest('#app'), ring: el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none' }; });
const live = (page) => page.evaluate(() => document.getElementById('live').textContent);
{
  const { ctx, page, errors } = await mk();
  check('one permanent live region exists outside the app', await page.evaluate(() => { const l = document.getElementById('live'); return !!l && !l.closest('#app') && l.getAttribute('aria-live') === 'polite' && document.querySelectorAll('[aria-live]').length === 1; }));
  await go(page, 'talk'); await page.evaluate(() => window.hamrah.go('home', { reset: true })); await page.waitForTimeout(80);
  const a0 = await actInfo(page);
  check('after opening a screen, focus is on its heading, with no box drawn round it', a0.tag === 'H1' && !a0.ring, a0);
  await lessonScreen(page, 'social-hello', 'listen');
  check('the browser title names the screen', (await page.title()).includes('·'), await page.title());
  const pb = await page.evaluate(() => { const p = document.querySelector('[role=progressbar]'); return { label: p.getAttribute('aria-label'), text: p.getAttribute('aria-valuetext'), now: p.getAttribute('aria-valuenow') }; });
  check('the progress bar has a Farsi name and value', /مرحلهٔ/.test(pb.label) && !!pb.text && pb.now !== null, pb);
  // a wrong answer, tapped the way an iPhone does it (the button does not take focus);
  // if the first tap happens to be the right answer, go on to the next question and try again
  for (let n = 0; n < 5; n++) {
    await page.evaluate(() => { document.activeElement.blur(); document.querySelector('#app main .opt').click(); });
    await page.waitForTimeout(200);
    if (await page.locator('.opt.is-tried').count()) break;
    await page.locator('[data-next]').click(); await page.waitForTimeout(450);
  }
  const a1 = await actInfo(page), l1 = await live(page);
  const tried = await page.evaluate(() => { const o = document.querySelector('.opt.is-tried'); return { disabled: o.getAttribute('aria-disabled'), pressed: o.getAttribute('aria-pressed'), text: o.textContent }; });
  check('after a wrong answer, focus is on that same answer (not lost to the page)', a1.cls.includes('opt') && a1.cls.includes('is-tried'), a1);
  check('…and the feedback is spoken through the live region', l1.length > 5 && l1.replace(/\s+/g, '') === (await page.evaluate(() => document.querySelector('.note').textContent.replace(/\s+/g, ''))), l1);
  check('a tried answer is marked unavailable (aria-disabled), not "pressed"', tried.disabled === 'true' && tried.pressed === null, tried);
  for (let n = 0; n < 4 && !(await page.locator('.opt.is-right').count()); n++) { await page.locator('.opt:not(.is-tried)').first().click(); await page.waitForTimeout(200); }
  const a2 = await actInfo(page), l2 = await live(page);
  check('after the right answer, focus stays on it and the result is spoken', a2.cls.includes('is-right') && l2.length > 3 && l2 !== l1, { focus: a2.cls, live: l2 });
  // a switch
  await page.evaluate(() => { const a = window.hamrah; a.store.update((s) => { if (s.at) delete s.at['social-hello']; }); a.go('home', { reset: true }); a.go('lesson.social-hello'); }); await page.waitForTimeout(80);
  if (await page.locator('.switch').count()) { await page.locator('.switch').first().click(); await page.waitForTimeout(150); const a = await actInfo(page); check('after flipping a switch, focus is still on the switch', a.cls.includes('switch'), a); }
  // settings
  await go(page, 'settings');
  const groups = await page.evaluate(() => [...document.querySelectorAll('.seg')].map((g) => ({ role: g.getAttribute('role'), name: (document.getElementById(g.getAttribute('aria-labelledby')) || {}).textContent, ticks: g.querySelectorAll('[aria-pressed="true"] svg').length, pressed: g.querySelectorAll('[aria-pressed="true"]').length })));
  check('the size and speed groups are named, and the chosen one has a tick as well as colour', groups.length === 2 && groups.every((g) => g.role === 'group' && g.name && g.ticks === 1 && g.pressed === 1), groups);
  await page.locator('.seg button').nth(1).click(); await page.waitForTimeout(200);
  const a3 = await actInfo(page);
  check('after choosing a text size, focus is on the chosen size', a3.text === 'بزرگ' && a3.inApp, a3);
  await page.evaluate(() => { window.hamrah.store.update((s) => { s.settings.scale = 1; }); window.hamrah.applyScale(); });
  // conversation
  await go(page, 'rp.rp-store'); await page.waitForTimeout(400);
  await page.locator('#app main .btn-primary').first().click(); await page.waitForTimeout(500);
  await page.locator('#app main .opt').first().click(); await page.waitForTimeout(400);
  const a4 = await actInfo(page), l4 = await live(page);
  const lastThem = await page.evaluate(() => { const bs = [...document.querySelectorAll('.bubble.them')]; return bs[bs.length - 1].querySelector('.en, .phone-mask').textContent; });
  check('in a conversation, the new lines are spoken and focus is kept', l4.includes(lastThem) && a4.inApp && a4.tag !== 'BODY', { live: l4.slice(0, 90), focus: a4.cls });
  check('…English inside the announcement is marked as English', await page.evaluate(() => !!document.querySelector('#live bdi[lang="en"]')));
  check('no live regions are left inside the redrawn screen', await page.evaluate(() => document.querySelectorAll('#app [aria-live]').length === 0));
  // builder with keyboard
  await go(page, 'build.where-is'); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.tiles-pool .wtile').focus()); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  const a5 = await actInfo(page);
  check('sentence builder: after placing a word with the keyboard, focus is still on a word tile', a5.cls.includes('wtile'), a5);
  check('…and the placed word is spoken', (await live(page)).length > 0, await live(page));
  // listen button says it is playing
  await lessonScreen(page, 'social-hello', 'phrase');
  await page.locator('.phrase .btn-sound').first().click(); await page.waitForTimeout(250);
  const pr = await page.evaluate(() => document.querySelector('.phrase .btn-sound').getAttribute('aria-pressed'));
  await page.evaluate(() => window.hamrah.audio.stop());
  check('a listen button reports "playing" while it plays', pr === 'true', String(pr));
  // every view: one h1
  const h1s = {};
  for (const r of ['home', 'talk', 'words', 'review', 'saved', 'grammar', 'build', 'build.mix', 'build.where-is', 'places', 'place.store', 'cat.' + await page.evaluate(() => window.hamrah.content.vocabCats[0].id), 'settings', 'me', 'sos', 'about', 'numbers', 'lesson.social-hello', 'rp.rp-store', 'nope']) { await go(page, r); h1s[r] = await page.evaluate(() => document.querySelectorAll('#app h1').length); }
  check('every screen has exactly one main heading', Object.values(h1s).every((n) => n === 1), JSON.stringify(Object.fromEntries(Object.entries(h1s).filter(([, n]) => n !== 1))));
  // toast
  await go(page, 'home');
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.waitForTimeout(300);
  const t0 = await page.evaluate(() => { const t = document.querySelector('.toast'); const r = t.getBoundingClientRect(); const tb = document.querySelector('.topbar').getBoundingClientRect(); const sos = document.querySelector('.btn-danger').getBoundingClientRect(); return { tag: t.tagName, h: r.height, belowBar: r.top >= tb.bottom - 1, coversSos: !(r.bottom < sos.top || r.top > sos.bottom), text: t.textContent }; });
  check('a message is a button (tap closes it), at least 56 px tall, under the top bar and not over the emergency button', t0.tag === 'BUTTON' && t0.h >= 56 && t0.belowBar && !t0.coversSos, t0);
  check('…and it is spoken', (await live(page)).includes('اینترنت'), await live(page));
  await page.waitForTimeout(5900);
  const at6 = await page.locator('.toast').count();
  await page.waitForTimeout(4500);
  check('a message stays for more than 6 seconds, then goes by itself', at6 === 1 && (await page.locator('.toast').count()) === 0);
  await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await page.waitForTimeout(200);
  await page.locator('.toast').click(); await page.waitForTimeout(100);
  check('a tap closes the message at once', (await page.locator('.toast').count()) === 0);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---- two tabs of the app share one storage (security M2) -------------------------------------------------
{
  const { ctx, page: one, errors } = await mk();
  const two = await ctx.newPage();
  two.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await two.goto(BASE); await two.waitForFunction(() => window.hamrah && document.querySelector('.topbar'));
  // (what is stored is read in the tab that wrote last: the browser passes a write on to its other tabs a moment later)
  const stored = (page = one) => page.evaluate(() => { const key = Object.keys(localStorage).find((k) => k.startsWith('hamrah.v1')); return key ? JSON.parse(localStorage.getItem(key)) : null; });      // (the name carries the path of this copy of the app: store.js)
  // tab 1: personal details; tab 2 is somewhere inside the app
  await one.evaluate(() => { window.hamrah.store.update((s) => { s.me.name = 'Zahra Secretname'; s.me.address = '987 Private Lane'; s.me.contact = '310-555-0177'; s.me.born = '1950-1-2'; }); });
  await two.waitForTimeout(300);
  check('two tabs: the second tab sees what the first one saved', (await st(two)).me.name === 'Zahra Secretname');
  await go(two, 'settings');
  // tab 1: Settings → «پاک کردن همه‌چیز» → yes
  await go(one, 'settings'); await one.waitForTimeout(400);      // (a tap right after a screen change is ignored)
  await one.getByText('پاک کردن همه‌چیز').click(); await one.waitForTimeout(700);
  await one.getByText('بله، پاک شود').click(); await one.waitForTimeout(400);
  check('two tabs: «پاک کردن همه‌چیز» empties the storage', (await stored()) === null);
  await two.waitForTimeout(300);
  check('two tabs: the other tab is back on its first screen with nothing kept', (await route(two)) === '#onboard' && (await st(two)).me.name === '' && (await st(two)).onboard.done === false, await route(two));
  // tab 2 now saves something: the deleted details must not come back
  await two.evaluate(() => window.hamrah.store.update((s) => { s.settings.ph = false; }));
  const after = await stored(two);
  check('two tabs: a save in the other tab does not bring the deleted details back', after && after.me.name === '' && after.me.address === '' && after.me.born === '' && after.settings.ph === false, JSON.stringify(after && { me: after.me, ph: after.settings.ph }));
  // progress: a lesson finished in tab 2 is not lost when tab 1 saves, even if tab 1 never received the browser's event
  await two.evaluate(() => window.hamrah.store.update((s) => { s.onboard.done = true; s.done['social-hello'] = { t: Date.now(), n: 1 }; }));
  await one.waitForTimeout(400);
  await one.evaluate(() => window.hamrah.store.update((s) => { s.fav.w1 = 1; }));
  const merged = await stored(one);
  check('two tabs: progress made in one tab survives a save in the other', merged && !!merged.done['social-hello'] && merged.fav.w1 === 1);
  check('two tabs: a tab told of the change shows its first screen, not a stale one', ['#home', '#onboard'].includes(await route(one)), await route(one));
  check('no JavaScript errors (two tabs)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await b.close();
server.kill();
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
