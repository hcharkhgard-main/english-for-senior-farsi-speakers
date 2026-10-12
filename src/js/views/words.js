// Words and saved phrases: a review queue that builds itself, plus browsable word lists.
import { h, icon, btn, en, note, progress, fnum } from '../ui.js';
import { clipEn, listenBtn, miniPlay, favBtn, wordsLine, sayPanel, playNow, faListen } from '../components.js';
import { grade, counts, answered, minutes, cardMode, SETS_PER_DAY } from '../srs.js';
import { shuffle, mix, numberRound, micOn, later, todaysSet, heardOnly } from '../learn.js';
import { quiz, digitsOf } from './lesson.js';
import { papersLink } from './papers.js';
import { ownItem, sampleIdentity } from '../own.js';
import { me } from '../me.js';

export function wordsView(app) {
  const { t, store, content } = app;
  const s = store.state;
  // The day's plan is two short sets (srs.js). What is said here is the plan and the size of the next set —
  // never how much is waiting behind it.
  const q = todaysSet(s, content, app.today());
  const c = counts(s.srs, app.pool(), app.today());
  const favs = Object.keys(s.fav).length;
  const n = fnum(q.queue.length), min = fnum(minutes(q.queue.length));
  const planDone = q.set > SETS_PER_DAY;            // both sets of today are done; more is there only for someone who asks
  // (cards already answered today but fewer than a set — a set ended early, then a lesson added sentences: these are
  // "a few more", as the home screen says, not «مرور اول» after «مرور امروز تمام شد» — QA round 4, features L1)
  const answeredToday = s.newDay && s.newDay.d === app.today() ? Number(s.newDay.c) || 0 : 0;
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('words.title')),
    h('section', { class: 'card' }, h('h2', null, t('words.today')),
      h('p', { class: 'lead' }, planDone ? t('words.today.done') : !q.queue.length ? t('words.today.none')
        : q.set > 1 ? t('words.today.second', { n, min }) : q.nDue ? (answeredToday > 0 ? t('words.today.more', { n, min }) : t('words.today.first', { n, min })) : t('words.today.new', { n })),
      q.queue.length && !planDone ? btn(t('words.start'), { cls: 'btn-primary', icon: 'cards', block: true, onclick: () => app.go('review') }) : null,
      h('p', { class: 'muted' }, t('words.plan')),
      c.known && c.learning ? h('p', { class: 'muted' }, t('words.known', { known: fnum(c.known), learning: fnum(c.learning) }))
        : c.learning ? h('p', { class: 'muted' }, t('words.learning', { n: fnum(c.learning) }))
          : c.known ? h('p', { class: 'muted' }, t('words.knownAll', { n: fnum(c.known) })) : null,
      q.queue.length && planDone ? btn(t('words.extra'), { cls: 'btn-ghost', icon: 'cards', block: true, onclick: () => app.go('review') }) : null),
    content.numbers.length ? h('button', { type: 'button', class: 'item', onclick: () => app.go('numbers') }, h('span', { class: 'pic', style: 'width:3.25rem;height:3.25rem' }, icon('ear')),
      h('span', { class: 'body' }, h('span', { class: 't' }, t('num.title')), h('span', { class: 's' }, t('num.sub'))), h('span', { class: 'go' }, icon('next'))) : null,
    papersLink(app),      // «خواندن نوشته‌ها» (views/papers.js)
    btn(t('words.saved', { n: fnum(favs) }), { cls: 'btn-ghost', icon: 'starFill', block: true, onclick: () => app.go('saved') }),
    btn(t('words.build'), { cls: 'btn-soft', icon: 'pieces', block: true, onclick: () => app.go('build') }),
    btn(t('words.grammar'), { cls: 'btn-ghost', icon: 'bulb', block: true, onclick: () => app.go('grammar') }),
    h('h2', { class: 'section-title' }, t('words.cats')),
    content.vocabCats.map((cat) => {
      const n = content.vocab.filter((w) => w.cat === cat.id).length;
      return h('button', { type: 'button', class: 'item', onclick: () => app.go('cat.' + cat.id) }, h('span', { class: 'body' }, h('span', { class: 't' }, cat.title), h('span', { class: 's' }, t('words.count', { n: fnum(n) }))), h('span', { class: 'go' }, icon('next')));
    }));
  return { main };
}

function wordRow(app, it) {
  const clipAt = (speed) => (it.pieces ? it.pieces.map((x) => clipEn(x, 's', speed)) : clipEn(it.say || it.en, it.voice, speed));
  return h('div', { class: 'card' },
    h('div', { class: 'opt-wrap' }, miniPlay(app, clipAt('n')),
      h('div', { class: 'grow' }, en(it.en, 'p', 'en-line'), h('p', { class: 'fa-line' }, it.fa)),
      it.pic ? h('span', { class: 'emoji', 'aria-hidden': 'true' }, it.pic) : null),
    it.ph && app.store.state.settings.ph ? h('p', { class: 'ph-line' }, h('b', null, app.t('phrase.phLabel') + ' '), it.ph) : null,
    it.ex ? h('div', { class: 'opt-wrap' }, miniPlay(app, clipEn(it.ex.en, 's', 'n')), h('div', { class: 'grow' }, en(it.ex.en, 'p'), h('p', { class: 'muted' }, it.ex.fa))) : null,
    h('div', { class: 'row' }, listenBtn(app, clipAt('s'), { label: app.t('audio.slow'), cls: 'btn-ghost', ic: 'slow', small: true }), favBtn(app, it.id)));
}

// The numbers are 62 words — 25 screens of buttons in one list (QA round 4, accessibility L8). They are shown in three
// parts, one at a time: 0 to 20, the tens with a hundred and a thousand, the ordinals to "tenth", and those after it
// ("eleventh" … "thirty-first", the days of a date): 31 ordinals in one list were 13 screens (QA round 5, usability L3).
const ORDINAL = /(?:first|second|third|th)$/;
const DATE_ORDINAL = /^(?:eleventh|twelfth|.*teenth|twentieth|twenty-|thirtieth|thirty-)/;
export function numberPart(en) {
  const w = String(en).toLowerCase();
  if (ORDINAL.test(w)) return DATE_ORDINAL.test(w) ? 'date' : 'ord';
  const n = Number(digitsOf(w));
  return digitsOf(w) !== '' && n <= 20 ? 'small' : 'big';
}
export const NUMBER_PARTS = ['small', 'big', 'ord', 'date'];

export function catView(app, catId) {
  const { t, content } = app;
  const cat = content.vocabCats.find((c) => c.id === catId) || content.vocabCats[0];
  let words = content.vocab.filter((w) => w.cat === cat.id);
  if (!app.ui.warmed) { app.ui.warmed = true; app.audio.loadIndex().then(() => app.audio.warm(['v-' + cat.id])).catch(() => {}); }
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, cat.title), h('p', { class: 'muted' }, t('words.cat.hint')));
  if (cat.id === 'numbers' && words.length > 24) {
    const part = NUMBER_PARTS.includes(app.ui.part) ? app.ui.part : 'small';
    main.append(h('div', { class: 'seg seg-2', role: 'group', 'aria-label': t('words.num.parts') }, NUMBER_PARTS.map((x) =>
      h('button', { type: 'button', 'aria-pressed': String(x === part), onclick: () => { app.ui.part = x; app.render(); } }, x === part ? icon('check') : null, h('span', null, t('words.num.' + x))))));
    words = words.filter((w) => numberPart(w.en) === part);
    const value = (en) => (digitsOf(en) !== '' ? Number(digitsOf(en)) : { half: 0.5, 'one thousand': 1000 }[en] ?? 1e6);
    if (part === 'small' || part === 'big') words.sort((a, b) => value(a.en) - value(b.en));      // in counting order: 0, 1, 2 … (the file has them in the order they were added)
  }
  main.append(...words.map((w) => wordRow(app, app.item(w.id))));
  return { main };
}

export function savedView(app) {
  const { t, store } = app;
  // (a saved sentence about the sample person is shown as the learner's own, as on its review card)
  const items = Object.keys(store.state.fav).map((id) => ownItem(app.item(id), me, { month: (m) => t('month.' + m) })).filter(Boolean);
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('saved.title')));
  if (!items.length) main.append(note(t('saved.none'), 'info', 'star'));
  items.forEach((it) => main.append(wordRow(app, it)));
  return { main };
}

// One set of review (srs.js builds it: what is due, then new words). Anything answered «هنوز نه» is shown once more
// at the end of the set and then comes back tomorrow.
//
// A card is not always the same question (cardMode in srs.js):
//   read  the English is on the card with its sound — «معنی‌اش چیست؟»           new, or missed last time
//   hear  only the sound; «نمایش کلمه» shows the English for those who want it    known at least once
//   say   the Farsi is on the card — «این را به انگلیسی چطور می‌گویید؟»           every other time
// The picture never stands beside the English question (it would be the answer): it is on the back of the card,
// and on the front only when the question is the Farsi word.
// (a sentence the learner only has to understand: every sentence of a listen-first lesson, and a line other people say,
// "heard": true — QA round 3, M1)
export const sayable = (app, id, it) => {
  if (it.kind === 'word') return !/[A-Za-z]/.test(it.fa);          // «حرف A», «ID»: the Farsi side would give the answer away
  const L = Object.prototype.hasOwnProperty.call(app.content.lessons, id.split(':')[1]) ? app.content.lessons[id.split(':')[1]] : null;
  const p = L && L.phrases.find((x) => x.id === id.split(':')[2]);
  return !heardOnly(L, p);
};
export function reviewView(app) {
  const { t, store, content } = app;
  const day = app.today();
  const nextSet = () => todaysSet(store.state, content, day);
  const begin = () => {
    const q = nextSet(), mode = {};
    for (const id of q.queue) { const it = app.item(id); if (it) mode[id] = cardMode(id, store.state.srs[id], sayable(app, id, it)); }
    return { queue: q.queue, set: q.set, mode, again: [], pass: 1, i: 0, shown: false, text: false, knew: 0, total: 0, say: false };
  };
  const S = (app.ui.rev ||= begin());
  const list = S.pass === 1 ? S.queue : S.again;
  const main = h('main', { class: 'wrap' });
  if (!S.warmed) { S.warmed = true; app.audio.loadIndex().then(() => app.audio.warm(app.audio.index.packs.filter((p) => p.id.startsWith('v-') || p.id === 'words').map((p) => p.id))).catch(() => {}); }

  if (S.i >= list.length) {
    // The end of a set. After the first set of the day the second one is mentioned as something for later —
    // going home is the main button. After the second, or when nothing is left, the day's review is simply done:
    // what may still be waiting is never counted out to the learner.
    const next = nextSet();
    const second = S.total > 0 && next.queue.length > 0 && next.set <= SETS_PER_DAY;
    main.append(h('section', { class: 'card center' }, h('span', { class: 'big-check' }, icon('check')),
      h('h1', { style: 'font-size:1.5rem' }, !S.total ? t('rev.none') : second ? t('rev.first') : t('rev.done')),
      !S.total ? h('p', null, t('rev.none.sub')) : h('p', { class: 'lead' }, S.knew ? t('rev.sum', { n: fnum(S.total), k: fnum(S.knew) }) : t('rev.sum.none', { n: fnum(S.total) })),
      second ? h('p', null, t('rev.second')) : h('p', { class: 'muted' }, t('rev.back'))));
    main.append(btn(t('nav.home'), { cls: 'btn-primary', icon: 'home', block: true, onclick: app.home }));
    if (second) main.append(btn(t('rev.goNow'), { cls: 'btn-ghost', icon: 'cards', block: true, onclick: () => { app.ui.rev = null; app.render(true); } }));
    return { main };
  }

  const id = list[S.i];
  // a sentence about the sample person ("My name is Maryam.") is shown with the learner's own detail, once «اطلاعات من» has it
  const it = ownItem(app.item(id), me, { month: (m) => t('month.' + m) });
  if (!it) { S.i++; return reviewView(app); }
  const word = it.kind === 'word';
  const mode = S.pass === 1 ? S.mode[id] || 'read' : 'read';     // the repeat at the end of a set shows everything
  const answer = (knew) => {
    const isNew = !store.state.srs[id];        // a word met for the first time (sentences from lessons are not "new")
    app.speech.cancel(); app.audio.stop();
    store.update((s) => {
      s.srs[id] = grade(s.srs[id], knew, day);
      if (S.pass === 1) s.newDay = answered(s.newDay, day, isNew);
    });
    if (S.pass === 1) { S.total++; if (knew) S.knew++; else S.again.push(id); }
    S.i++; S.shown = false; S.text = false; S.say = false;
    if (S.pass === 1 && S.i >= S.queue.length && S.again.length) { S.pass = 2; S.i = 0; }
    delete app.ui['say-rev'];
    app.render(true);
  };

  main.append(progress(S.pass === 1 ? t('rev.title') : t('rev.again'), `${fnum(S.i + 1)} ${t('lesson.of')} ${fnum(list.length)}`, S.i / list.length));
  const card = h('section', { class: 'card phrase' }, h('h1', { class: 'sr' }, t('rev.title')));
  const add = (...kids) => card.append(...kids.filter(Boolean));
  // (the learner's own sentence is said from single recordings where it can be: digits, months, letters — own.js)
  const clipAt = (speed) => (it.pieces ? it.pieces.map((x) => clipEn(x, 's', speed)) : clipEn(it.say || it.en, it.voice, speed));
  const clip = clipAt('n');
  const heardLine = !word && !sayable(app, id, it);
  const picture = () => (it.pic ? h('span', { class: 'emoji center', 'aria-hidden': 'true' }, it.pic) : null);
  // one spelling, two words (the word "I" and the letter "I"): the card says which group this one belongs to
  const twins = word ? content.vocab.filter((w) => w.en === it.en) : [];
  const group = twins.length > 1 ? content.vocabCats.find((c) => c.id === twins.find((w) => w.id === id).cat) : null;
  const english = () => wordsLine(app, it.en, { voice: it.voice, headword: word });
  const listen = () => h('div', { class: 'row' }, listenBtn(app, clip, { label: t('audio.listen') }), listenBtn(app, clipAt('s'), { label: t('audio.slow'), cls: 'btn-ghost', ic: 'slow' }));
  const mine = it.mine ? h('p', { class: 'eyebrow' }, t('own.title')) : null;
  const reveal = (label, sound) => btn(label, { cls: 'btn-primary', icon: 'eye', block: true, onclick: () => { S.shown = true; app.render(); if (sound) playNow(app, clip); } });
  // A sentence with the sample person's details in it ("My first name is Maryam.", "My zip code is 90024.") while
  // «اطلاعات من» is empty — which, kept in memory only, it is on most days: never asked from Farsi (recalling Maryam's date
  // of birth teaches nothing). It is a "listen and say your own" card instead: the sentence, its sound, which words to
  // change, and «توانستید با اطلاعات خودتان بگویید؟» (QA round 4, M2).
  const sample = !word && !it.mine && Array.isArray(it.own) && it.own.length > 0 && sampleIdentity(it.en);
  const ownHint = () => (!word && !it.mine && Array.isArray(it.own) && it.own.length ? h('p', { class: 'when', 'data-own': '' }, t('phrase.own', { words: it.own.join(' ') })) : null);
  // (the yes-answer fits its question: «توانستید جملهٔ خودتان را بگویید؟» — «بله، گفتم»; QA round 5, usability L4)
  const answerRow = (ask, yes = t('rev.knew')) => [h('p', { class: 'section-title center' }, ask),
    h('div', { class: 'row' }, btn(yes, { cls: 'btn-primary grow', icon: 'check', onclick: () => answer(true) }), btn(t('rev.notYet'), { cls: 'btn-ghost grow', icon: 'repeat', onclick: () => answer(false) }))];

  if (sample) {
    add(h('p', { class: 'eyebrow' }, t('rev.ownSay')), english(), listen(), ownHint(),
      h('p', { class: 'fa-line', 'data-rev': 'own' }, it.fa, ' ', h('span', { class: 'muted' }, t('rev.ownSample'))),
      h('div', { class: 'row' }, favBtn(app, id), micOn(app) ? btn(t('rev.say'), { cls: 'btn-ghost', icon: 'mic', small: true, onclick: () => { S.say = !S.say; if (!S.say) app.speech.cancel(); app.render(); } }) : null));
    main.append(card);
    if (S.say) main.append(sayPanel(app, { key: 'say-rev', target: it.en, say: it.say, voice: it.voice, own: it.own }));
    main.append(...answerRow(t('rev.ownAsk'), t('rev.ownYes')));
  } else if (!S.shown && mode === 'say') {
    // Farsi first: the direction a speaker needs. The answer is shown — and heard — when the learner asks for it.
    add(mine, h('p', { class: 'eyebrow' }, t('rev.sayIt')), picture(), h('p', { class: 'fa-line', 'data-rev': 'say' }, it.fa), ownHint(), h('p', { class: 'muted' }, t('rev.sayIt.hint')));
    main.append(card, reveal(t('rev.showEn'), true));
  } else if (!S.shown) {
    if (group) card.append(h('p', { class: 'eyebrow' }, group.title));
    if (mine) card.append(mine);
    const hidden = mode === 'hear' && !S.text;       // heard first: the English appears when asked for
    if (!hidden) card.append(english());
    card.append(listen(), h('p', { class: 'muted', 'data-rev': hidden ? 'hear' : 'read' }, mode === 'hear' ? t('rev.hear') : t('rev.think')));
    main.append(card);
    if (hidden) main.append(btn(word ? t('rev.showWord') : t('rev.showPhrase'), { cls: 'btn-ghost', icon: 'eye', block: true, onclick: () => { S.text = true; app.render(); } }));
    main.append(reveal(t('rev.show'), false));
  } else {
    if (group) card.append(h('p', { class: 'eyebrow' }, group.title));
    // (the Farsi of the learner's own sentence has no recording: it holds their name or number)
    add(mine, picture(), english(), ...(it.words ? [h('p', { class: 'small muted' }, t('own.said')), en(it.words, 'p')] : []), listen(), h('div', { class: 'row' }, h('p', { class: 'fa-line grow' }, it.fa), it.mine ? null : faListen(app, it.fa, t('audio.fa'))));
    if (it.ph && store.state.settings.ph) card.append(h('p', { class: 'ph-line' }, h('b', null, t('phrase.phLabel') + ' '), it.ph));
    if (it.ex) card.append(h('div', { class: 'opt-wrap' }, miniPlay(app, clipEn(it.ex.en, 's', 'n')), h('div', { class: 'grow' }, en(it.ex.en, 'p'), h('p', { class: 'muted' }, it.ex.fa))));
    if (it.note) card.append(h('p', { class: 'when' }, it.note));
    card.append(h('div', { class: 'row' }, favBtn(app, id), micOn(app) && !heardLine ? btn(t('rev.say'), { cls: 'btn-ghost', icon: 'mic', small: true, onclick: () => { S.say = !S.say; if (!S.say) app.speech.cancel(); app.render(); } }) : null));
    main.append(card);
    if (S.say) main.append(sayPanel(app, { key: 'say-rev', target: it.en, say: it.say, voice: it.voice, headword: word, own: it.own }));      // own: "My name is Maryam." said with the learner's own name is right
    main.append(...answerRow(t('rev.ask')));
  }
  const at = S.i, pass = S.pass;
  // the sentence plays by itself when its card opens — except where the English is the answer
  const after = (navigated) => {
    // (after 1.2 s, as in a lesson: a screen reader has read the new heading first — QA round 4, accessibility L7)
    if (navigated && store.state.settings.auto && !S.shown && (mode !== 'say' || sample)) later(app, 1200, () => { if (app.ui.rev === S && S.i === at && S.pass === pass && !S.shown) playNow(app, clip, { quiet: true }); });
  };
  return { main, after };
}

// «شنیدن عددها»: hear a price, a time, a date or a phone number the way people really say it and tap what was said.
// The wrong answers are the ones that sound alike (15 / 50). Any number of replays; a wrong tap costs nothing.
const NUM_ROUND = 8;
export function numbersView(app) {
  const { t, content, store } = app;
  const S = (app.ui.num ||= { seed: Math.random(), ids: null, i: 0 });
  S.ids ||= numberRound(content.numbers, NUM_ROUND, S.seed, store.state.heard).map((x) => x.id);
  if (!S.warmed) { S.warmed = true; app.audio.loadIndex().then(() => app.audio.warm(['n-numbers'])).catch(() => {}); }
  const main = h('main', { class: 'wrap' });

  if (S.i >= S.ids.length) {
    main.append(h('section', { class: 'card center' }, h('span', { class: 'big-check' }, icon('check')), h('h1', { style: 'font-size:1.5rem' }, t('num.done')), h('p', { class: 'lead' }, t('num.done.sub'))),
      btn(t('num.more'), { cls: 'btn-primary', icon: 'ear', block: true, onclick: () => { app.ui.num = null; app.render(true); } }),
      btn(t('nav.home'), { cls: 'btn-ghost', icon: 'home', block: true, onclick: app.home }));
    return { main };
  }

  const it = content.numbers.find((x) => x.id === S.ids[S.i]);
  const key = `num:${S.seed}:${S.i}`;
  const clip = clipEn(it.say, it.voice, 'n');
  const options = shuffle([it.show, ...it.alts], mix(S.seed, S.i)).map((v) => ({ id: v, right: v === it.show, label: h('span', { class: 'en', lang: 'en', dir: 'ltr', style: 'font-size:1.6rem;text-align:center' }, v) }));
  const solved = app.ui[key] && app.ui[key].solved != null;
  main.append(progress(t('num.title'), `${fnum(S.i + 1)} ${t('lesson.of')} ${fnum(S.ids.length)}`, S.i / S.ids.length));
  main.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, t('num.kind.' + it.kind)), h('h1', { style: 'font-size:1.35rem' }, t('num.ask')),
    h('div', { class: 'row' }, listenBtn(app, clip, { label: t('audio.listen') }), listenBtn(app, clipEn(it.say, it.voice, 's'), { label: t('audio.slow'), cls: 'btn-ghost', ic: 'slow' }))));
  // recognised at the first try: it has had its turn; otherwise it simply comes round again sooner
  main.append(quiz(app, key, options, { missNote: t('listen.again'), onSolved: (o, first) => { if (first) store.update((s) => { s.heard[it.id] = (s.heard[it.id] || 0) + 1; }); } }));
  // what was said, in words, appears under the answers once the right one is found
  if (solved) main.append(h('section', { class: 'card' }, en(it.say, 'p', 'en-line'), h('p', { class: 'fa-line' }, it.fa)));
  const step = (d) => { S.i = Math.max(0, S.i + d); app.audio.stop(); app.render(true); };
  const bar = h('div', { class: 'bottombar' }, h('div', { class: 'inner' },
    S.i > 0 ? btn(t('nav.prev'), { cls: 'btn-ghost', icon: 'back', onclick: () => step(-1) }) : null,
    btn(t('nav.next'), { cls: 'btn-primary', 'data-next': '', onclick: () => step(1) })));
  const at = S.i;
  const after = (navigated) => { if (navigated && store.state.settings.auto) later(app, 1200, () => { if (app.ui.num === S && S.i === at) playNow(app, clip, { quiet: true }); }); };
  return { main, bar, after };
}

// Every small grammar pattern met so far, in one place to look back at. Only the titles are listed; a pattern opens
// under its title when tapped, one at a time (all of them open made a page of 9 screens — QA round 4, accessibility L8).
export function grammarView(app) {
  const { t, content, store } = app;
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('gram.title')), h('p', { class: 'muted' }, t('gram.sub')));
  const seen = app.order.filter((id) => store.state.done[id] && content.lessons[id].grammar);
  const rest = app.order.filter((id) => !store.state.done[id] && content.lessons[id].grammar);
  const open = seen.includes(app.ui.gram) ? app.ui.gram : null;
  const head = (id) => {
    const L = content.lessons[id], on = id === open;
    return h('button', { type: 'button', class: 'item', 'aria-expanded': String(on), 'aria-controls': on ? 'gram-open' : null, 'data-gram': id, onclick: () => { app.ui.gram = on ? null : id; app.render(); } },
      h('span', { class: 'body' }, h('span', { class: 't' }, L.grammar.title), h('span', { class: 's' }, on ? t('gram.close') : L.title.fa)), h('span', { class: 'go' }, icon(on ? 'close' : 'next')));
  };
  const card = (id) => {
    const L = content.lessons[id], G = L.grammar, listen = G.compare === 'listen';
    return h('section', { class: 'card', id: 'gram-open' },
      h('p', null, G.explain),
      G.examples.map((e) => h('div', { class: 'opt-wrap' }, miniPlay(app, clipEn(e.en, 's', 'n')), h('div', { class: 'grow' }, en(e.en, 'p', 'en-line'), h('p', { class: 'muted' }, e.fa)))),
      listen ? null : h('p', null, h('b', null, t('grammar.dont') + ' '), h('s', { class: 'en', lang: 'en', dir: 'ltr' }, G.wrong)),
      listen ? null : h('p', null, h('b', null, t('grammar.do') + ' '), en(G.right)),
      h('p', { class: 'muted' }, G.why),
      btn(t('gram.from', { title: L.title.fa }), { cls: 'btn-ghost', small: true, icon: 'book', onclick: () => app.go('lesson.' + id) }));
  };
  if (!seen.length) main.append(note(t('gram.none'), 'info', 'bulb'));
  seen.forEach((id) => { main.append(head(id)); if (id === open) main.append(card(id)); });
  if (rest.length) {
    // the patterns of the lessons still to come: a list of titles, behind one button once some have been met
    // (before any lesson too: 71 titles were 9 screens — QA round 5, usability L3)
    const later = !!app.ui.gramLater;
    main.append(h('h2', { class: 'section-title' }, t('gram.later')));
    main.append(btn(later ? t('gram.later.hide') : t('gram.later.show', { n: fnum(rest.length) }), { cls: 'btn-ghost', icon: later ? 'close' : 'bulb', block: true, 'aria-expanded': String(later), 'data-gram-later': '', onclick: () => { app.ui.gramLater = !later; app.render(); } }));
    if (later) rest.forEach((id) => { const L = content.lessons[id]; main.append(h('button', { type: 'button', class: 'item', onclick: () => app.go('lesson.' + id) },
      h('span', { class: 'body' }, h('span', { class: 't' }, L.grammar.title), h('span', { class: 's' }, L.title.fa)), h('span', { class: 'go' }, icon('next')))); });
  }
  return { main };
}
