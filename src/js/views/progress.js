// What ties the lessons to the learner's own life, and to each other:
//  · the pieces the last screen of a lesson shows besides its own (the learner's own sentence, the small task
//    for the day, more practice) and the «این درس الان به کارم نمی‌آید» control of its first screen;
//  · the question on the home screen about the last small task;
//  · «کارهایی که حالا می‌توانم بکنم» — what every finished lesson lets the learner do;
//  · «مرور کوتاه» — a look back after every fifth lesson, made of the same questions the lessons use.
// The decisions (what is due, what is asked) are plain functions in learn.js and own.js.
import { h, icon, btn, en, note, progress, fnum, toast } from '../ui.js';
import { clipEn, listenBtn, miniPlay, playNow } from '../components.js';
import { quiz } from './lesson.js';
import { grade } from '../srs.js';
import { todayOffer, checkpointPlan, checkpointMark, checkpointDue, canDoList, missionDue, laterChoice, pathLesson, later } from '../learn.js';
import { ownLines, ownMissing } from '../own.js';
import { me, mayAsk, decline } from '../me.js';
import { papersFor } from './papers.js';

// ---- «جملهٔ خودِ شما» ---------------------------------------------------------------------------------
// The sentences of the lesson with the learner's own name, number or date in them (curriculum.json "mine" says
// which). Played from single recordings — letters, numbers, months — so nothing about the learner is ever sent
// anywhere. When «اطلاعات من» is empty (it is kept in memory only, so it is empty again every time the app is opened)
// the learner is invited to fill it in — with an equal «no» beside it — until they say no in this session, and never
// when Settings «هیچ‌وقت نپرس» is on. The lesson never waits for it.
export function ownCard(app, lessonId) {
  const { t, store, content } = app;
  const kinds = (content.mine || {})[lessonId];
  if (!kinds || !kinds.length) return null;
  const lines = ownLines(me, kinds);
  const goMe = () => app.go('me');
  if (!lines.length) return mayAsk(store.state) ? invite(app, t('own.title'), t('own.invite')) : null;
  if (!app.ui.ownWarm) { app.ui.ownWarm = true; app.audio.loadIndex().then(() => app.audio.warm(app.audio.deps('me'))).catch(() => {}); }
  const clips = (line, speed) => line.say.map((text) => clipEn(text, 's', speed));
  const card = h('section', { class: 'card' }, h('h2', null, t('own.title')), h('p', { class: 'muted' }, t('own.sub')));
  // each sentence is laid out like a sentence card of the lesson: the words, then «گوش کنید» and «آهسته»
  for (const line of lines) {
    card.append(h('div', { class: 'stack own-line' }, en(line.en, 'p', 'en-line'),
      line.words ? [h('p', { class: 'small muted' }, t('own.said')), en(line.words, 'p')] : null,
      line.say ? h('div', { class: 'row' }, listenBtn(app, clips(line, 'n'), { label: t('audio.listen') }), listenBtn(app, clips(line, 's'), { label: t('audio.slow'), cls: 'btn-ghost', ic: 'slow' })) : null));
  }
  if (lines.some((l) => !l.say)) card.append(h('p', { class: 'small muted' }, t('own.readAloud')));
  card.append(h('button', { type: 'button', class: 'linkish', onclick: goMe }, ownMissing(me, kinds).length ? t('own.more') : t('own.edit')));
  return card;
}

// An invitation to fill in «اطلاعات من»: what it is for, that it is optional and not saved, and two equal buttons —
// «وارد کردن اطلاعات من» and «نه، بدون اطلاعات ادامه می‌دهم». «No» closes it, and no invitation is shown again until the
// app is opened again (me.js decline). Used at the end of a lesson and on the emergency page.
export function invite(app, title, text) {
  const { t } = app;
  return h('section', { class: 'card', 'data-invite': '' }, h('h2', null, title), h('p', null, text),
    h('div', { class: 'stack' },
      btn(t('own.invite.go'), { cls: 'btn-soft', icon: 'people', block: true, onclick: () => app.go('me') }),
      // (the card goes away: focus goes to the screen's heading, not to the control that has moved into its place —
      // on the lesson's last screen that was «درس بعدی», which a second tap would have pressed — QA round 4, accessibility L2)
      btn(t('own.invite.no'), { cls: 'btn-ghost', block: true, 'data-invite-no': '', onclick: () => {
        decline(); toast(t('own.invite.later')); if (app.hold) app.hold(); app.render();
        const h1 = document.querySelector('#app main h1'); if (h1) { try { h1.focus({ preventScroll: true }); } catch { /* ignore */ } }
      } })));
}

// ---- the last screen of a lesson ------------------------------------------------------------------
// Returns the pieces for lesson.js to place:
//   cards  under the "you can now …" card: the learner's own sentence, the small task for the day
//   more   optional practice that belongs to this lesson: a second conversation, hearing numbers, a paper to read
//   canDo  the quiet link to «کارهایی که حالا می‌توانم بکنم»
export function doneExtras(app, id) {
  const { t, content } = app;
  const L = content.lessons[id];
  const cards = [];
  const own = ownCard(app, id);
  if (own) cards.push(own);
  if (L.mission) cards.push(h('section', { class: 'card' }, h('h2', null, t('mission.title')), h('p', { class: 'lead mission' }, L.mission)));
  const more = [];
  const talks = ((content.practiceAll || {})[id] || []).slice(1).map((rid) => content.roleplays.find((r) => r.id === rid)).filter(Boolean);
  for (const r of talks) more.push(btn(t('done.practice', { title: r.title }), { cls: 'btn-ghost', icon: r.phone ? 'phone' : 'chat', block: true, onclick: () => app.go('rp.' + r.id) }));
  if ((content.numbersAfter || []).includes(id) && content.numbers.length) more.push(btn(t('done.numbers'), { cls: 'btn-ghost', icon: 'ear', block: true, onclick: () => app.go('numbers') }));
  for (const P of papersFor(content, id)) more.push(btn(t('read.offer', { title: P.title }), { cls: 'btn-ghost', icon: 'paper', block: true, onclick: () => app.go('paper.' + P.id) }));
  const canDo = h('button', { type: 'button', class: 'linkish', onclick: () => app.go('cando') }, t('done.cando'));
  return { cards, more, canDo };
}

// ---- «این درس الان به کارم نمی‌آید» (first screen of a lesson of the last stage) --------------------
// Nothing is lost by a wrong tap: the lesson stays where it is on the screen, with a button that brings it back.
export function laterControl(app, id) {
  const { t, store, content } = app;
  const choice = laterChoice(store.state, content, id);
  if (!choice) return [];
  if (choice.act === 'later') {
    return [h('div', { class: 'stack' },
      btn(t('later.btn'), { cls: 'btn-ghost', block: true, 'data-later': '', onclick: () => { store.update((s) => { s.later[id] = choice.set; delete s.at[id]; }); app.render(); } }),
      h('p', { class: 'small muted' }, t('later.hint')))];
  }
  const mark = Number(store.state.later[id]) === 2 ? 2 : 1;
  const next = todayOffer(store.state, content);
  const nextL = next && next.kind === 'lesson' && next.id !== id ? content.lessons[next.id] : null;
  return [note(t('later.note.' + mark), 'info', 'info'),
    h('div', { class: 'stack' },
      nextL ? btn(t('done.next', { title: nextL.title.fa }), { cls: 'btn-soft', icon: 'book', block: true, onclick: () => app.go('lesson.' + next.id, { replace: true }) }) : null,
      btn(t('later.back'), { cls: 'btn-ghost', icon: 'repeat', block: true, 'data-later-back': '', onclick: () => { store.update((s) => { delete s.later[id]; }); toast(t('later.back.done')); app.render(); } }))];
}

// ---- the home screen: «توانستید امتحانش کنید؟» -------------------------------------------------------
// Asked once, at a later visit, about the small task of the lesson finished last. Either answer is fine.
export function missionAsk(app) {
  const { t, store, content } = app;
  const id = missionDue(store.state, content);
  if (!id) return null;
  const L = content.lessons[id];
  // (the card goes away and the four choices move up under the finger: the second tap of a double tap must not press one of them)
  const answer = (yes) => { store.update((s) => { s.tried[id] = yes ? 1 : 0; }); toast(yes ? t('mission.yes.toast') : t('mission.notYet.toast')); app.hold(); app.render(); };
  return h('section', { class: 'card', 'data-mission': id },
    h('p', { class: 'eyebrow' }, t('mission.ask.title', { title: L.title.fa })),
    h('p', { class: 'mission' }, L.mission),
    h('h2', null, t('mission.ask')),
    h('div', { class: 'row' },
      btn(t('mission.yes'), { cls: 'btn-soft grow', icon: 'check', onclick: () => answer(true) }),
      btn(t('mission.notYet'), { cls: 'btn-ghost grow', onclick: () => answer(false) })));
}

// ---- «کارهایی که حالا می‌توانم بکنم» -------------------------------------------------------------------
// One row for the screens that lead here («موقعیت‌های روزمره»).
export function canDoItem(app) {
  const { t, store, content } = app;
  const n = canDoList(store.state, content).length;
  return h('button', { type: 'button', class: 'item', onclick: () => app.go('cando') },
    h('span', { class: 'pic pic-s' }, icon('check')),
    h('span', { class: 'body' }, h('span', { class: 't' }, t('cando.title')), h('span', { class: 's' }, n ? t('cando.count', { n: fnum(n) }) : t('cando.count.none'))),
    h('span', { class: 'go' }, icon('next')));
}

export function candoView(app) {
  const { t, store, content } = app;
  const list = canDoList(store.state, content);
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('cando.title')));
  if (!list.length) { main.append(note(t('cando.none'), 'info', 'check')); return { main }; }
  main.append(h('p', { class: 'muted' }, t('cando.sub')));
  for (const it of list) {
    main.append(h('section', { class: 'card', 'data-cando': it.id },
      h('p', { class: 'lead' }, it.canDo),
      it.mission ? h('p', { class: 'mission' }, h('b', null, t('cando.mission') + ' '), it.mission) : null,
      !it.mission ? null : it.tried ? h('p', { class: 'did' }, icon('check'), h('span', null, t('cando.tried')))
        : btn(t('cando.try'), { cls: 'btn-ghost', icon: 'check', small: true, onclick: () => { store.update((s) => { s.tried[it.id] = 1; }); app.render(); } })));
  }
  return { main };
}

// ---- «مرور کوتاه»: a look back after every fifth lesson ------------------------------------------------
const CP_MINUTES = 5;
export const checkpointMinutes = CP_MINUTES;
export function checkpointView(app) {
  const { t, store, content, audio } = app;
  const S = (app.ui.cp ||= { seed: Math.random(), plan: null, pos: -1, missed: [], marked: false, due: checkpointDue(store.state, content) });
  S.plan ||= checkpointPlan(store.state, content, S.seed);
  const { items, lessons, talk } = S.plan;
  const main = h('main', { class: 'wrap' });
  if (!items.length) {
    main.append(h('h1', { class: 'section-title' }, t('cp.title')), note(t('cp.none'), 'info', 'book'),
      btn(t('nav.home'), { cls: 'btn-primary', icon: 'home', block: true, onclick: app.home }));
    return { main };
  }
  if (!S.warmed) { S.warmed = true; audio.loadIndex().then(() => audio.warm(lessons.flatMap((id) => audio.deps('l-' + id)))).catch(() => {}); }
  // finished or passed over: every group of five lessons up to now has had its look back
  const mark = () => { if (S.marked) return; S.marked = true; store.update((s) => { s.cp = checkpointMark(s, content); }); };
  const n = items.length;
  const step = (d) => { S.pos = Math.max(-1, Math.min(n, S.pos + d)); audio.stop(); if (S.pos === n) mark(); app.render(true); };

  if (S.pos < 0) {
    main.append(h('section', { class: 'card' },
      h('div', { class: 'row' }, h('span', { class: 'pic' }, icon('repeat')), h('div', { class: 'grow' }, h('h1', { style: 'font-size:1.5rem' }, t('cp.title')))),
      h('p', { class: 'lead' }, t('cp.intro')),
      h('p', { class: 'muted' }, t('cp.about', { min: fnum(CP_MINUTES) })),
      h('p', { class: 'eyebrow' }, t('cp.lessons')),
      h('ul', { class: 'steps' }, lessons.map((id) => h('li', null, content.lessons[id].title.fa)))));
    if (S.due) main.append(btn(t('cp.skip'), { cls: 'btn-ghost', block: true, 'data-cp-skip': '', onclick: () => {
      mark();
      const id = pathLesson(store.state, content);
      if (id) app.go('lesson.' + id, { replace: true }); else app.home();
    } }));
    const bar = h('div', { class: 'bottombar' }, h('div', { class: 'inner' }, btn(t('cp.start'), { cls: 'btn-primary', 'data-next': '', onclick: () => step(1) })));
    return { main, bar };
  }

  if (S.pos >= n) {
    const missed = S.missed.map((i) => items[i]);
    main.append(h('section', { class: 'card center' }, h('span', { class: 'big-check' }, icon('check')), h('h1', { style: 'font-size:1.6rem' }, t('cp.done')),
      h('p', { class: 'lead' }, missed.length ? t('cp.done.again') : t('cp.done.clean'))));
    if (missed.length) main.append(h('section', { class: 'card' }, missed.map((it) => {
      const right = it.kind === 'say' ? it.options.find((o) => o.right) : null;
      return h('div', { class: 'opt-wrap' }, miniPlay(app, it.kind === 'say' ? clipEn(right.say, right.voice, 'n') : clipEn(it.en, it.voice, 'n')),
        h('div', { class: 'grow' }, en(it.en, 'p', 'en-line'), h('p', { class: 'muted' }, it.fa)));
    })));
    const R = talk && content.roleplays.find((r) => r.id === talk);
    main.append(h('div', { class: 'stack' },
      R ? btn(t('cp.talk', { title: R.title }), { cls: 'btn-primary', icon: R.phone ? 'phone' : 'chat', block: true, onclick: () => app.go('rp.' + R.id, { replace: true }) }) : null,
      btn(t('nav.home'), { cls: R ? 'btn-ghost' : 'btn-primary', icon: 'home', block: true, onclick: app.home })));
    return { main };
  }

  const it = items[S.pos], key = `cp${S.pos}`;
  const L = content.lessons[it.lesson];
  const solved = app.ui[key] && app.ui[key].solved != null;
  const missedNow = () => {
    if (S.missed.includes(S.pos)) return;
    S.missed.push(S.pos);
    if (it.kind !== 'say') return;
    // a sentence that needed another try here comes back in review tomorrow, like one missed in its lesson
    store.update((s) => {
      const hk = `${it.lesson}:${it.pid}`, rk = `p:${it.lesson}:${it.pid}`;
      s.hard[hk] = (s.hard[hk] || 0) + 1;
      if (s.srs[rk]) s.srs[rk] = grade(s.srs[rk], false, app.today());
    });
  };
  main.append(progress(t('cp.title'), `${fnum(S.pos + 1)} ${t('lesson.of')} ${fnum(n)}`, S.pos / n));
  let auto = null;
  if (it.kind === 'hear') {
    // "what did they say?" — heard without its text; any number of replays, a wrong tap costs nothing
    const clip = clipEn(it.en, it.voice, 'n');
    main.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, `${t('cp.from', { title: L.title.fa })} · ${it.role}`), h('h1', { style: 'font-size:1.35rem' }, t('gist.title')),
      h('div', { class: 'row' }, listenBtn(app, clip, { label: t('audio.listen') }), listenBtn(app, clipEn(it.en, it.voice, 's'), { label: t('audio.slow'), cls: 'btn-ghost', ic: 'slow' }))));
    main.append(quiz(app, key, it.options.map((o, i) => ({ id: 'o' + i, right: o.right, label: h('span', null, o.fa) })), { missNote: t('listen.again'), onMiss: missedNow }));
    if (solved) main.append(h('section', { class: 'card' }, en(it.en, 'p', 'en-line'), h('p', { class: 'fa-line' }, it.fa)));
    auto = clip;
  } else {
    // "how do you say this in English?" — the Farsi is shown; each English choice can be heard first
    main.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, t('cp.from', { title: L.title.fa })), h('h1', { style: 'font-size:1.35rem' }, t('review.how')), h('p', { class: 'fa-line lead' }, `«${it.fa}»`)));
    main.append(quiz(app, key, it.options.map((o) => ({ id: o.id, right: o.right, play: clipEn(o.say, o.voice, 'n'), label: en(o.en) })), { onMiss: missedNow }));
  }
  const bar = h('div', { class: 'bottombar' }, h('div', { class: 'inner' },
    btn(t('nav.prev'), { cls: 'btn-ghost', icon: 'back', onclick: () => step(-1) }),
    btn(t('nav.next'), { cls: 'btn-primary', 'data-next': '', onclick: () => step(1) })));
  const at = S.pos;
  const after = (navigated) => {
    if (!auto || !navigated || !store.state.settings.auto || S['auto' + at]) return;
    S['auto' + at] = true;
    later(app, 1200, () => { if (app.ui.cp === S && S.pos === at) playNow(app, auto, { quiet: true }); });
  };
  return { main, bar, after };
}
