import { h, icon, btn, note, fnum } from '../ui.js';
import { clipFa, playNow } from '../components.js';
import { minutes, SETS_PER_DAY } from '../srs.js';
import { scenarioStart, todayOffer, todaysSet } from '../learn.js';
import { missionAsk, canDoItem, checkpointMinutes } from './progress.js';
import { papersLink, placePapers } from './papers.js';
import { minutesText } from './lesson.js';      // how long a lesson honestly takes, worked out from its screens ("۹ تا ۱۳")

export function homeView(app) {
  const { t, store, content } = app;
  const s = store.state;
  // «درس امروز» always offers something and says honestly what it is: the lesson in progress, the next new lesson,
  // a short look back after every fifth lesson — and, when no new lesson is left, an earlier lesson in its short
  // form or a conversation (todayOffer in learn.js)
  const offer = todayOffer(s, content);
  const L = offer && offer.kind !== 'checkpoint' && offer.kind !== 'talk' ? content.lessons[offer.id] : null;
  const R = offer && offer.kind === 'talk' ? content.roleplays.find((r) => r.id === offer.id) : null;
  const openOffer = () => {
    if (!offer) { app.go('review'); return; }
    if (offer.kind === 'checkpoint') { app.go('checkpoint'); return; }
    if (R) { app.go('rp.' + R.id); return; }
    app.go('lesson.' + offer.id);
    if (offer.kind === 'repeat' && !store.state.at[offer.id]) { app.ui.short = true; app.render(); }      // an earlier lesson again: its short form
  };
  const q = todaysSet(s, content, app.today());           // the next review set of the day (two short sets a day: srs.js)
  const welcome = content.ui.spoken.welcome;

  const choice = (ic, title, sub, onclick, primary) => h('button', { type: 'button', class: 'choice' + (primary ? ' is-primary' : ''), onclick },
    h('span', { class: 'ico' }, icon(ic)), h('span', null, h('span', { class: 't' }, title), sub ? h('span', { class: 's' }, sub) : null), h('span', { class: 'go' }, icon('next')));

  const lessonSub = !offer ? t('home.lesson.none')
    : offer.kind === 'checkpoint' ? t('home.lesson.check', { min: fnum(checkpointMinutes) })
      : R ? (offer.hear ? t('home.lesson.talkHear', { title: R.title }) : t('home.lesson.talk', { title: R.title }))
        : offer.kind === 'resume' ? t('home.lesson.resume', { title: L.title.fa })
          : offer.kind === 'repeat' ? t('home.lesson.repeat', { title: L.title.fa })
            : t('home.lesson.next', { title: L.title.fa, min: minutesText(t, L, false, Object.keys(s.done).length ? undefined : 0) });      // (the very first lesson has no questions on earlier lessons)
  // before anything has been learned there is nothing to "review": say that new words are waiting instead
  // the card names the next set and how long it takes — never how much is waiting behind it; after the second set the day is done
  const min = fnum(minutes(q.queue.length));
  const wordsSub = !q.queue.length || q.set > SETS_PER_DAY ? t('home.words.none') : q.set > 1 ? t('home.words.second', { min }) : q.nDue ? t('home.words.sub', { min }) : t('home.words.new', { n: fnum(q.queue.length) });

  const main = h('main', { class: 'wrap' },
    h('section', { class: 'hello' },
      h('div', { class: 'txt' }, h('h1', null, t('home.hello')), h('p', null, t('home.ask'))),
      h('button', { type: 'button', class: 'round-play', 'aria-label': t('home.hear'), onclick: () => playNow(app, clipFa(welcome)) }, h('span', null, icon('play'), h('small', null, t('home.hearShort'))))),
    missionAsk(app),      // asked once, at a later visit: «توانستید امتحانش کنید؟» about the last lesson's small task
    choice('book', t('home.lesson'), lessonSub, openOffer, true),
    choice('chat', t('home.talk'), t('home.talk.sub'), () => app.go('talk')),
    choice('cards', t('home.words'), wordsSub, () => app.go('words')),
    choice('places', t('home.places'), t('home.places.sub'), () => app.go('places')),
    h('div', { class: 'quiet-row' }, btn(t('home.sos'), { cls: 'btn-danger', icon: 'sos', onclick: () => app.go('sos') })),
    store.persistent ? null : note(t('home.noSave'), 'care'));
  return { main };
}

// First run: three short questions (each can be skipped), then one screen that says where the learner starts.
// The step is kept with the answers, so closing the app half-way does not start the questions again.
// (The emergency phrases stay one tap away: the top bar shows their button on these screens too.)
const ONB_FIRST = 6;      // situations shown before «موقعیت‌های بیشتر»
export function onboardView(app) {
  const { t, store, content } = app;
  const ob = store.state.onboard;
  const step = Math.max(0, Math.min(3, Number(ob.step) || 0));
  const goStep = (n) => { store.update((s) => { s.onboard.step = n; }); delete app.ui.allPlaces; app.render(true); };
  const finish = () => { store.update((s) => { s.onboard.done = true; s.onboard.step = 0; }); app.go('home', { reset: true }); };
  // skipping keeps the answers already given and leaves this question and the later ones unanswered
  const skip = () => { store.update((s) => { if (step < 1) s.onboard.level = 'none'; if (step < 2) s.onboard.focus = 'both'; s.onboard.scenario = ''; }); finish(); };
  const pick = (field, value) => { store.update((s) => { s.onboard[field] = value; }); goStep(step + 1); };
  const opt = (label, onclick) => h('button', { type: 'button', class: 'opt', onclick }, h('span', { class: 'body' }, h('span', null, label)));
  const count = (n) => h('p', { class: 'eyebrow' }, t('onb.count', { n: fnum(n), all: fnum(3) }));
  const backBtn = (block = true) => btn(t('onb.back'), { cls: 'btn-ghost', icon: 'back', block, onclick: () => goStep(step - 1) });

  const main = h('main', { class: 'wrap' });
  if (step === 0) {
    main.append(h('section', { class: 'card' }, h('h1', null, t('onb.welcome')), h('p', { class: 'lead' }, t('onb.what')), h('p', { class: 'muted' }, t('onb.optional'))),
      count(1), h('h2', { class: 'section-title' }, t('onb.q1')),
      opt(t('onb.q1.none'), () => pick('level', 'none')), opt(t('onb.q1.little'), () => pick('level', 'little')), opt(t('onb.q1.some'), () => pick('level', 'some')));
  } else if (step === 1) {
    main.append(count(2), h('h1', { class: 'section-title' }, t('onb.q2')),
      opt(t('onb.q2.both'), () => pick('focus', 'both')), opt(t('onb.q2.listen'), () => pick('focus', 'listen')),
      h('p', { class: 'muted' }, t('onb.q2.hint')));
  } else if (step === 2) {
    const all = app.ui.allPlaces || content.scenarios.length <= ONB_FIRST + 1;
    const list = all ? content.scenarios : content.scenarios.slice(0, ONB_FIRST);
    main.append(count(3), h('h1', { class: 'section-title' }, t('onb.q3')),
      h('div', { class: 'tiles' }, list.map((sc) => h('button', { type: 'button', class: 'tile' + (sc.id === 'emergency' ? ' is-danger' : ''), onclick: () => pick('scenario', sc.id) }, h('span', { class: 'pic' }, icon(sc.icon)), sc.title))),
      all ? null : btn(t('onb.more'), { cls: 'btn-soft', icon: 'places', block: true, onclick: () => { app.ui.allPlaces = true; app.render(); } }));
  } else {
    // where we start, and why the chosen situation may not be the very first lesson
    const sc = app.scenario(ob.scenario);
    const first = content.essentials.map((id) => content.lessons[id]).filter(Boolean);
    main.append(h('section', { class: 'card' }, h('h1', null, t('onb.plan.title')), h('p', { class: 'lead' }, t('onb.plan.first')),
      h('div', { class: 'stack' }, first.map((L, i) => h('p', null, h('b', null, `${fnum(i + 1)}. `), L.title.fa))),
      sc ? h('p', null, scenarioStart(store.state, content) === 'now' ? t('onb.plan.then', { title: sc.title }) : t('onb.plan.later', { title: sc.title })) : null,
      ob.focus === 'listen' ? h('p', { class: 'muted' }, t('onb.plan.listen')) : null));
    main.append(btn(t('onb.start'), { cls: 'btn-primary', icon: 'book', block: true, onclick: finish }), backBtn());
    return { main };
  }
  // the two quiet choices sit side by side, so that "start without answering" stays in view under the six situations
  const skipBtn = btn(t('onb.skip'), { cls: 'btn-ghost', block: step === 0, onclick: skip });
  main.append(step > 0 ? h('div', { class: 'quiet-row' }, backBtn(false), skipBtn) : skipBtn);
  return { main };
}

export function placesView(app) {
  const { t, content, store } = app;
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('places.title')),
    canDoItem(app),       // «کارهایی که حالا می‌توانم بکنم»: what the finished lessons add up to
    h('p', { class: 'muted' }, t('places.sub')),
    h('div', { class: 'tiles' }, content.scenarios.map((sc) => {
      const ids = app.order.filter((id) => content.lessons[id].scenario === sc.id);
      const done = ids.filter((id) => store.state.done[id]).length;
      return h('button', { type: 'button', class: 'tile' + (sc.id === 'emergency' ? ' is-danger' : ''), onclick: () => app.go('place.' + sc.id) },
        h('span', { class: 'pic' }, icon(sc.icon)), h('span', null, sc.title),
        h('span', { class: 'small muted' }, t('places.count', { done: fnum(done), all: fnum(ids.length) })));
    })),
    papersLink(app));      // «خواندن نوشته‌ها» (views/papers.js)
  return { main };
}

export function placeView(app, id) {
  const { t, content, store } = app;
  const sc = app.scenario(id) || content.scenarios[0];
  const lessons = app.order.filter((x) => content.lessons[x].scenario === sc.id);
  const rps = content.roleplays.filter((r) => r.scenario === sc.id);
  const main = h('main', { class: 'wrap' },
    h('div', { class: 'row' }, h('span', { class: 'pic' }, icon(sc.icon)), h('h1', { class: 'grow', style: 'font-size:1.5rem' }, sc.title)),
    h('h2', { class: 'section-title' }, t('place.lessons')),
    lessons.map((lid) => {
      const L = content.lessons[lid];
      return h('button', { type: 'button', class: 'item', onclick: () => app.go('lesson.' + lid) },
        h('span', { class: 'body' }, h('span', { class: 't' }, L.title.fa), h('span', { class: 's' }, t('place.minutes', { min: minutesText(t, L, false, Object.keys(store.state.done).length ? undefined : 0) }))),
        store.state.done[lid] ? h('span', { class: 'badge' }, icon('check'), t('place.done')) : null);
    }),
    rps.length ? h('h2', { class: 'section-title' }, t('place.talks')) : null,
    rps.map((r) => h('button', { type: 'button', class: 'item', onclick: () => app.go('rp.' + r.id) },
      h('span', { class: 'pic', style: 'width:3rem;height:3rem' }, icon(r.phone ? 'phone' : 'chat')),
      h('span', { class: 'body' }, h('span', { class: 't' }, r.title), h('span', { class: 's' }, r.goal)),
      store.state.rp[r.id] ? h('span', { class: 'badge' }, icon('check'), t('place.done')) : null)),
    placePapers(app, sc.id));      // the papers and screens of this situation («خواندن نوشته‌ها»)
  return { main };
}
