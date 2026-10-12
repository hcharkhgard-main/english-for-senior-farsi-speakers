// The lesson player: the same steps, in the same order, in every lesson.
import { h, icon, btn, en, note, progress, fnum, toggle } from '../ui.js';
import { clipEn, listenBtn, miniPlay, faListen, phraseCard, sayPanel, playNow, wordsLine } from '../components.js';
import { tileBuilder, tilesFor } from './build.js';
import { INTERVALS, LESSON_BOX, grade } from '../srs.js';
import { shuffle, mix, shortPhrases, partnerLines, gistCount, gistTargets, longGist, longPairs, heardOnly, holdsOwn, dueSentences, pathLesson, micOn, later } from '../learn.js';
import { doneExtras, laterControl } from './progress.js';
import { numberWords } from '../match.js';

// The steps a lesson can have, in the order they come. A lesson shows the ones it has screens for and numbers
// them as the learner meets them ("step 3 of 8"); the names are in ui.fa.json under "step.".
export const STEPS = ['intro', 'warm', 'phrases', 'listen', 'talk', 'respond', 'task', 'review', 'done'];
export const WARM_FULL = 3, WARM_SHORT = 2;     // questions on earlier lessons that open a lesson
const HEAR_FULL = 3, HEAR_SHORT = 2;            // "listen: what does it mean?" questions on the new sentences
const VARIANTS_FULL = 3, VARIANTS_SHORT = 1;    // "the same thing in other words" questions

// ---- "the same thing in other words" ------------------------------------------------------------------
// A variant is another way people say something the lesson teaches ("When were you born?" for "What is your
// date of birth?"). It is heard without text and the learner picks its meaning from three Farsi sentences.
// The two wrong ones are other things said in this lesson. None of them may mean the same as the variant, so
// anything that is the line it stands for (`like`), or that shares half of its words — in Farsi or in English —
// with the variant or with that line, is left out: better one question fewer than two right answers.
const FA_SMALL = new Set('و را به از در که این آن است هست لطفا شما من ما هم یک با تا برای چه آیا میشود یا هستید دارید کنید خود اینجا'.split(' '));
const faWords = (s) => String(s || '').replace(/[\u200c\u200e\u200f\u064b-\u0652]/g, '').replace(/[^\u0600-\u06ff\s]/g, ' ').split(/\s+/).filter((w) => w && !FA_SMALL.has(w));
const sameWord = (a, b) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) || (a.length >= 5 && b.length >= 5 && a.slice(0, 4) === b.slice(0, 4));
export function faAlike(x, y) {
  const a = faWords(x), b = faWords(y);
  if (!a.length || !b.length) return String(x).trim() === String(y).trim();
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  return small.filter((w) => big.some((v) => sameWord(w, v))).length / small.length >= 0.5;
}
// …and the same test on the English: "And your date of birth?" is too close to "What is your date of birth?"
const EN_SMALL = new Set('a an the is are am was were be do does did you your i my me we our it this that to of in on at for and or can could would will please what have has here there with'.split(' '));
const enWords = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter((w) => w && !EN_SMALL.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, ''));
export function enAlike(x, y) {
  const a = enWords(x), b = enWords(y);
  if (!a.length || !b.length) return false;
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  return small.filter((w) => big.includes(w)).length / small.length >= 0.5;
}
// "How can I help you?" opens half of all conversations and can stand for almost any first question ("What are you
// here for today?"), so it is never offered as a wrong answer.
const OPENER = /\b(?:how (?:can|may) i help|what can i do for you|can i help you)\b/i;
// The Farsi meanings that may stand next to a variant as wrong answers, the likeliest confusions first:
// other variants of the lesson, then what the other person says in the dialogue, then the lesson's own sentences.
export function variantWrong(L, v) {
  const said = [...L.dialogue.lines, L.respond.them, ...L.phrases, ...(L.variants || [])];
  const like = said.find((x) => x.en === v.like);
  const pool = [...(L.variants || []).filter((x) => x !== v && x.like !== v.like), ...partnerLines(L), L.respond.them, ...L.phrases];
  const out = [], took = [];
  // a variant and the line it stands for (or a dialogue line that has it: "You're all set. Would you like your
  // receipt?"), or two variants of one line, say the same thing (QA round 3, L6)
  const twins = (x, y) => (x.like && (y.en.includes(x.like) || x.like === y.like)) || (y.like && x.en.includes(y.like));
  for (const x of pool) {
    if (!x.fa || x.en === v.en || x.en === v.like || OPENER.test(x.en)) continue;
    if (faAlike(x.fa, v.fa) || (like && faAlike(x.fa, like.fa)) || enAlike(x.en, v.en) || enAlike(x.en, v.like)) continue;
    if (out.some((fa) => faAlike(fa, x.fa)) || took.some((y) => twins(x, y))) continue;      // two wrong answers that say nearly the same thing are one too many
    out.push(x.fa); took.push(x);
  }
  return out;
}
// The variants a lesson can ask about: those with at least two safe wrong answers.
export const lessonVariants = (L) => (L.variants || []).filter((v) => v && v.en && v.fa && variantWrong(L, v).length >= 2);

// ---- which screens a lesson has ----------------------------------------------------------------------
// The one place that decides it. `warm` are the sentences of earlier lessons asked at the start (see warmIds).
// A full lesson is about 20–24 screens, a short one 12–15:
//   intro · up to 3 (2) questions on earlier lessons · the 5 (3) sentences, each with its optional "now you say
//   it" · a page of words to tap (two lessons) · 3 (2) "listen: what does it mean?" · the sample dialogue with
//   "what did they say?" before it (from stage 2) or after it · the same thing in other words · the grammar
//   note (full only) · answer a person · 2 (1) real situations · 2 (1) review questions · build a sentence
//   (full only) · done.
// Every sentence is asked at least once before it goes to review: the listening questions take the sentences
// that no real-situation question asks for.
export function plan(L, short, warm = []) {
  const ph = short ? shortPhrases(L) : L.phrases;
  const ids = new Set(ph.map((p) => p.id));
  const screens = [{ step: 'intro', kind: 'intro' }];
  const warmed = warm.slice(0, short ? WARM_SHORT : WARM_FULL);
  warmed.forEach((key, k) => screens.push({ step: 'warm', kind: 'warm', key, k }));
  ph.forEach((_, i) => screens.push({ step: 'phrases', kind: 'phrase', i }));
  const grid = !!(L.grid && L.grid.words && L.grid.words.length);
  if (grid) screens.push({ step: 'phrases', kind: 'grid' });      // a page of words to tap and hear
  const tasks = L.task.map((t, j) => ({ ...t, j })).filter((t) => ids.has(t.answer)).slice(0, short ? 1 : 2);
  const asked = new Set(tasks.map((t) => t.answer));
  const hear = [...ph.filter((p) => !asked.has(p.id)), ...ph.filter((p) => asked.has(p.id))].slice(0, short ? HEAR_SHORT : HEAR_FULL).map((p) => p.id);
  hear.forEach((_, i) => screens.push({ step: 'listen', kind: 'listen', i }));
  // "what did they say?": one line of the dialogue before its text is seen (from stage 2), the other after it.
  // A lesson with two or more "other words" questions has one of these, so the listening part stays 3–4 questions.
  // (A lesson with a page of words is a screen longer: its short form leaves the "other words" question out, and
  // its full form has one review question fewer, like a lesson with three "other words" questions.)
  const variants = lessonVariants(L).slice(0, short ? (grid ? 0 : VARIANTS_SHORT) : VARIANTS_FULL);
  const gists = Math.min(gistCount(L, short), variants.length >= 2 ? 1 : 2);
  const cold = gists && (L.stage || 1) >= 2 ? 1 : 0;
  for (let g = 0; g < cold; g++) screens.push({ step: 'talk', kind: 'gist', g, cold: true });
  screens.push({ step: 'talk', kind: 'dialogue' });
  for (let g = cold; g < gists; g++) screens.push({ step: 'talk', kind: 'gist', g });
  // In the last stage one of them — the last — is a longer turn: two things the other person says one after the
  // other, as people really answer (see longGist in learn.js).
  if (gists && (L.stage || 1) >= 3 && longPairs(L).length) screens.filter((x) => x.kind === 'gist').pop().long = true;
  variants.forEach((_, v) => screens.push({ step: 'talk', kind: 'variant', v }));
  if (!short && L.grammar) screens.push({ step: 'talk', kind: 'grammar' });
  screens.push({ step: 'respond', kind: 'respond' });
  tasks.forEach((t) => screens.push({ step: 'task', kind: 'task', j: t.j }));
  const n = Math.min(short || variants.length >= 3 || grid ? 1 : 2, ph.length);
  for (let k = 0; k < n; k++) screens.push({ step: 'review', kind: 'review', k });
  // build one of the lesson's sentences from word tiles (not too short, not too long) — one the learner says, and not
  // one that holds the sample person's own details (the learner builds their own at the end: «جملهٔ خودِ شما»)
  const bi = ph.findIndex((p) => { const w = tilesFor(p.en).length; return w >= 3 && w <= 7 && !/\d/.test(p.en) && !holdsOwn(p) && !heardOnly(L, p); });
  if (!short && bi >= 0) screens.push({ step: 'review', kind: 'build', i: bi });
  screens.push({ step: 'done', kind: 'done' });
  return { screens, phrases: ph, hear, variants, warm: warmed };
}

// What identifies a screen of a lesson, whatever its number: its kind and which sentence, line, question or task it
// shows (the saved place of a lesson, store.at[id].scr — see lessonView).
const SCREEN_ID = ['i', 'j', 'g', 'v', 'k', 'key'];
export const screenId = (x) => { const o = { kind: x.kind }; for (const f of SCREEN_ID) if (x[f] != null) o[f] = x[f]; return o; };
export const sameScreen = (x, saved) => !!x && !!saved && x.kind === saved.kind && SCREEN_ID.every((f) => (x[f] ?? null) === (saved[f] ?? null));

// How long a lesson takes, said honestly: a learner who listens to each sentence twice and says it once needs
// about half a minute a screen; one who only listens and taps, a little less. Returned as [from, to] minutes.
export function lessonMinutes(L, short = false, warm = WARM_FULL) {
  const n = plan(L, short, new Array(warm).fill('')).screens.length;
  return [Math.round(n * 0.4), Math.round(n * 0.55)];
}
export const minutesText = (t, L, short, warm) => { const [lo, hi] = lessonMinutes(L, short, warm); return t('lesson.minutes', { lo: fnum(lo), hi: fnum(hi) }); };

// ---- sentences of earlier lessons, asked again at the start of a lesson ------------------------------------
// Up to n review keys ("p:lesson:p2"): first the sentences whose review is due (dueSentences in learn.js), then,
// while places are left, sentences of other finished lessons that have not been practised for the longest time
// (the ones that needed another try before the rest), from different lessons. The answer is that sentence's
// review (see `asked` in the view): right at the first tap counts as known — which moves it on only if it was
// due — and a wrong tap brings it back tomorrow.
export function warmIds(state, content, day, lessonId, n = WARM_FULL) {
  const out = dueSentences(state, content, day, n, lessonId).map((x) => x.key);
  if (out.length >= n) return out.slice(0, n);
  const rest = [];
  for (const [key, e] of Object.entries(state.srs || {})) {
    const [kind, lid, pid] = key.split(':');
    const S = kind === 'p' && lid !== lessonId && state.done[lid] ? content.lessons[lid] : null;
    if (!S || !e || out.includes(key) || !S.phrases.some((p) => p.id === pid) || S.phrases.length < 3) continue;
    rest.push({ key, last: e.l ?? e.d - (INTERVALS[e.b] || 0), hard: (state.hard || {})[`${lid}:${pid}`] || 0 });
  }
  rest.sort((a, b) => a.last - b.last || b.hard - a.hard || (a.key < b.key ? -1 : 1));
  // one sentence from each lesson before a second one from any of them
  const lessonOf = (key) => key.split(':')[1], seen = new Set(out.map(lessonOf));
  const spread = [...rest.filter((x) => !seen.has(lessonOf(x.key)) && seen.add(lessonOf(x.key))), ...rest];
  return [...new Set([...out, ...spread.map((x) => x.key)])].slice(0, n);
}

// The number a number word stands for, to show beside it on a page of words ("fifteen" -> 15); '' for other words.
const NUMBER_OF = new Map(Array.from({ length: 101 }, (_, n) => [numberWords(n).join(' '), String(n)]));
export const digitsOf = (word) => NUMBER_OF.get(String(word).toLowerCase().replace(/-/g, ' ').trim()) || '';

// A tap-to-answer question. Wrong taps are never punished: the option is set aside and the learner tries again.
export function quiz(app, key, options, { onMiss, onSolved, rightNote, missNote } = {}) {
  const S = (app.ui[key] ||= { tried: {}, solved: null });
  const wrap = h('div', { class: 'stack' });
  options.forEach((o) => {
    const tried = S.tried[o.id], right = S.solved === o.id;
    const b = h('button', { type: 'button', class: 'opt' + (right ? ' is-right' : tried ? ' is-tried' : ''), 'aria-disabled': tried && !right ? 'true' : null,
      onclick: () => {
        if (S.solved != null) return;
        if (o.right) { S.solved = o.id; onSolved && onSolved(o, Object.keys(S.tried).length === 0); }
        else if (!S.tried[o.id]) { S.tried[o.id] = true; S.lastMiss = o.id; onMiss && onMiss(o); }
        app.render();
      } },
      h('span', { class: 'body' }, o.label, tried && !right ? h('span', { class: 'sub' }, app.t('quiz.notThis')) : null),
      h('span', { class: 'mark' }, right ? [icon('check'), h('span', { class: 'sr' }, app.t('quiz.isRight'))] : null));
    wrap.append(o.play ? h('div', { class: 'opt-wrap' }, miniPlay(app, o.play), b) : b);
  });
  if (S.solved != null) {
    const o = options.find((x) => x.id === S.solved);
    wrap.append(note(o.why || rightNote || app.t('quiz.right'), 'good', 'check'));
  } else if (S.lastMiss != null) {
    const o = options.find((x) => x.id === S.lastMiss);
    wrap.append(note((o && o.why) || missNote || app.t('quiz.tryAgain'), 'care', 'bulb'));
  }
  return wrap;
}

export function lessonView(app, id) {
  const { t, store, content, audio } = app;
  const L = content.lessons[id];
  if (!L) return { main: h('main', { class: 'wrap' }, h('h1', null, t('err.title'))) };
  const stage = L.stage || app.lessonStage(id);
  app.stageOf = () => stage;
  // a sentence of another lesson, by its review key ("p:lesson:p2")
  const other = (key) => { const [kind, lid, pid] = String(key).split(':'); const S = kind === 'p' && lid !== id ? content.lessons[lid] : null; const p = S && S.phrases.find((x) => x.id === pid); return p && S.phrases.length >= 3 ? { key, lid, S, p } : null; };
  // Each lesson remembers its own place (store.at[id]) from the moment the learner presses Start, so looking
  // at another lesson — or at one already finished — never moves the place they stopped at in this one.
  // The questions on earlier lessons are chosen once, when the lesson is opened, and kept with that place:
  // answering them changes what is due, and the lesson must not change shape half-way.
  // A reload within the hour after finishing (iOS reloads a page that was in the background) shows the finished screen
  // again, with its next steps, instead of the first screen of a lesson already done. Only when the page itself opens
  // on this lesson (app.screen 0): opening a finished lesson from a list starts it from the beginning, as before.
  const was = store.state.done[id];
  if (!app.ui.finished && app.screen === 0 && !store.state.at[id] && was && Date.now() - (Number(was.t) || 0) < 3600000) {
    app.ui.finished = true;
    app.ui.cur = { pos: 0, short: !!was.short, warm: [] };
  }
  const saved = store.state.at[id];
  const cur = app.ui.finished ? app.ui.cur
    : saved ? { pos: saved.pos, scr: saved.scr, short: saved.short, warm: Array.isArray(saved.warm) ? saved.warm : [] }
      : { pos: 0, short: !!app.ui.short, warm: (app.ui.warm ||= warmIds(store.state, content, app.today(), id)) };
  const warm = cur.warm.filter((key) => other(key));
  const { screens, phrases, hear, variants } = plan(L, cur.short, warm);
  const last = screens.length - 1;
  // a place saved by an earlier version of the app (whose lessons were longer) is brought back inside the lesson
  // The place is kept as the screen itself (screenId), not only as its number: when an update of the course changes the
  // lesson's length (one "other words" question fewer), the learner comes back to the same question, not to the one
  // that has moved into its number. A place whose screen no longer exists falls back to the number, kept inside the lesson.
  const found = cur.scr ? screens.findIndex((x) => sameScreen(x, cur.scr)) : -1;
  const pos = app.ui.finished ? last : found > 0 && found < last ? found : Math.max(0, Math.min(Math.floor(Number(cur.pos)) || 0, last - 1));
  const scr = screens[pos];
  const sc = app.scenario(L.scenario);
  const them = L.them.voice;
  // Answer options (and which lines are asked) are mixed differently on every attempt at a lesson, but stay the
  // same within one attempt — also when the learner leaves half-way and comes back — so nothing is asked twice.
  const seed = (app.ui.seed ||= (saved && saved.seed) || Math.random());
  const hardKey = (p) => `${id}:${p.id}`;
  const miss = (p) => store.update((s) => { s.hard[hardKey(p)] = (s.hard[hardKey(p)] || 0) + 1; });
  // the sample words of this lesson that the learner replaces with their own (name, address, date, number)
  const ownAll = L.phrases.flatMap((p) => p.own || []);

  if (!app.ui.warmed) {
    app.ui.warmed = true;
    const cats = L.grid ? [...new Set(L.grid.words.map((w) => (content.vocab.find((x) => x.en === w) || {}).cat).filter(Boolean))].map((c) => 'v-' + c) : [];
    audio.loadIndex().then(() => audio.warm([...audio.deps('l-' + id), 'words', ...cats, ...warm.map((key) => 'l-' + other(key).lid)])).catch(() => {});
  }

  const finish = () => {
    const day = app.today();
    app.ui.finished = true;
    app.ui.cur = { pos: last, short: cur.short, warm: cur.warm };
    store.update((s) => {
      delete s.at[id];
      s.done[id] = { t: Date.now(), n: ((s.done[id] && s.done[id].n) || 0) + 1, ...(cur.short ? { short: 1 } : {}) };      // (short: for the finished screen after a reload)
      // Only the sentences the learner has seen go into review (a short lesson shows three of the five).
      // They were practised several times just now, so they start two boxes up and return in a few days;
      // the ones that needed another try can be reviewed again today.
      for (const p of phrases) { const k = `p:${id}:${p.id}`; if (!s.srs[k]) s.srs[k] = s.hard[hardKey(p)] ? { b: 0, d: day, n: 0 } : { b: LESSON_BOX, d: day + INTERVALS[LESSON_BOX], n: 0 }; }
    });
  };

  const move = (d) => {
    const np = Math.max(0, Math.min(last, pos + d));
    audio.stop(); app.speech.cancel();
    if (np === last) finish();
    else if (np === 0) { app.ui.short = cur.short; app.ui.warm = cur.warm; store.update((s) => { delete s.at[id]; }); }   // back on the first screen: nothing to resume
    else store.update((s) => { s.at[id] = { pos: np, scr: screenId(screens[np]), short: cur.short, t: Date.now(), seed, warm: cur.warm }; });
    app.render(true);
  };

  const sameStep = screens.filter((x) => x.step === scr.step);
  const within = sameStep.length > 1 ? `${fnum(sameStep.indexOf(scr) + 1)} ${t('lesson.of')} ${fnum(sameStep.length)}` : null;
  const main = h('main', { class: 'wrap' });
  // one counter only: the name of the part the learner is in and "3 of 5" inside it; the bar shows the whole lesson
  main.append(progress(t('step.' + scr.step), within, (pos + 1) / screens.length));
  let auto = null;      // clip(s) to play once when this screen opens
  let doneBar = null;   // the last screen's own bottom bar (the next step and «خانه»)
  const listenRow = (text, voice) => h('div', { class: 'row' }, listenBtn(app, clipEn(text, voice, 'n'), { label: t('audio.listen') }), listenBtn(app, clipEn(text, voice, 's'), { label: t('audio.slow'), cls: 'btn-ghost', ic: 'slow' }));
  const solvedAt = (key) => !!app.ui[key] && app.ui[key].solved != null;
  // "What did they say?" and "the same thing in other words" from stage 2 on: heard at natural speed, as in real life —
  // «آهسته» is there once the learner has missed once (or has found the answer), never as the first thing to try.
  const heardRow = (key, texts, voice) => {
    const clips = (speed) => texts.map((x) => clipEn(x, voice, speed));
    const q = app.ui[key];
    if (stage < 2 || (q && (q.solved != null || Object.keys(q.tried || {}).length))) return h('div', { class: 'row' }, listenBtn(app, clips('n'), { label: t('audio.listen') }), listenBtn(app, clips('s'), { label: t('audio.slow'), cls: 'btn-ghost', ic: 'slow' }));
    return [h('div', { class: 'row' }, listenBtn(app, clips('n'), { label: t('audio.listen') })), h('p', { class: 'small muted' }, t('gist.natural'))];
  };

  if (scr.kind === 'intro') {
    main.append(h('section', { class: 'card' },
      h('div', { class: 'row' }, h('span', { class: 'pic' }, icon(sc ? sc.icon : 'book')), h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, sc ? sc.title : ''), h('h1', { style: 'font-size:1.5rem' }, L.title.fa))),
      h('p', { class: 'lead' }, L.intro),
      h('div', { class: 'row' }, faListen(app, L.intro, t('audio.listenFa')), h('span', { class: 'muted small' }, t('lesson.about', { min: minutesText(t, L, cur.short, warm.length) })))));
    if (L.note) main.append(note(L.note, L.safetyCritical ? 'danger' : 'care', L.safetyCritical ? 'sos' : 'info'));
    if (L.listenFirst) main.append(note(t('lesson.listenFirst'), 'info', 'ear'));
    // the short lesson is offered on every lesson, the first one too: its five new sentences are a lot for a first day
    main.append(h('section', { class: 'card' }, toggle(t('lesson.short'), cur.short, (v) => { app.ui.short = v; app.render(); }, [t('lesson.short.on'), t('lesson.short.off')]),
      h('p', { class: 'small muted' }, t('lesson.short.hint'))));
    if (store.state.done[id]) main.append(note(t('lesson.again'), 'good', 'check'));
    // W2b: «این درس الان به کارم نمی‌آید» on lessons of the last stage (views/progress.js)
    main.append(...laterControl(app, id));
  }

  else if (scr.kind === 'warm') {
    // A sentence of an earlier lesson: «این را به انگلیسی چطور می‌گویید؟» — or, for a sentence the learner only
    // has to understand (a listen-first lesson), «گوش کنید. معنی‌اش کدام است؟». The answer is its review.
    const { key: rk, lid, S, p } = other(scr.key), key = `q${pos}`;
    const hearIt = heardOnly(S, p);       // a line other people say (or a listen-first lesson): heard, never asked in English
    const others = shuffle(S.phrases.filter((x) => x.id !== p.id && x.en !== p.en && x.fa !== p.fa), mix(seed, pos)).slice(0, 2);
    const opts = shuffle([p, ...others], mix(seed, pos + 0.5));
    const asked = (knew) => store.update((s) => {
      if (!knew) s.hard[`${lid}:${p.id}`] = (s.hard[`${lid}:${p.id}`] || 0) + 1;
      const e = s.srs[rk];
      if (e && e.l === app.today()) return;                 // already answered today (the learner came back to this screen)
      s.srs[rk] = grade(e, knew, app.today());
    });
    if (scr.k === 0) main.append(h('p', { class: 'muted' }, t('warm.intro')));
    main.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, t('warm.from', { title: S.title.fa })),
      hearIt ? [h('h1', { style: 'font-size:1.35rem' }, t('listen.title')), listenRow(p.say || p.en, p.voice)]
        : [h('h1', { style: 'font-size:1.35rem' }, t('review.how')), h('p', { class: 'fa-line lead' }, `«${p.fa}»`)]));
    main.append(quiz(app, key, opts.map((x) => ({ id: x.id, right: x.id === p.id, play: hearIt ? null : clipEn(x.say || x.en, x.voice, 'n'), label: hearIt ? h('span', null, x.fa) : en(x.en) })),
      { missNote: hearIt ? t('listen.again') : null, onSolved: (o, first) => asked(first) }));
    if (solvedAt(key) && hearIt) main.append(h('section', { class: 'card' }, en(p.en, 'p', 'en-line'), h('p', { class: 'fa-line' }, p.fa)));
    if (hearIt) auto = clipEn(p.say || p.en, p.voice, 'n');
  }

  else if (scr.kind === 'phrase') {
    // One new sentence: hear it, see what it means — and, straight away and only if the learner wants to, say it.
    const p = phrases[scr.i], first = scr.i === 0;
    main.append(h('h1', { class: 'sr' }, t('step.phrases')));
    main.append(phraseCard(app, p, { favId: `p:${id}:${p.id}`, first }));
    if (heardOnly(L, p)) {
      // sentences other people say to the learner: understanding them is the aim, there is nothing to record
      // (in a speaking lesson, each such line says so on its own card)
      if (first || !L.listenFirst) main.append(note(t('say.optionalHear'), 'info', 'ear'));
    } else if (micOn(app) || !app.speech.hasMic) {
      main.append(sayPanel(app, { key: `say${pos}`, target: p.en, say: p.say, voice: p.voice, own: p.own, onCard: true, first,
        onScore: (r) => { if (r && r.score != null) store.update((s) => { const k = `p:${id}:${p.id}`; s.said[k] = Math.max(s.said[k] || 0, r.score); }); } }));
      if (first && app.speech.hasMic) main.append(h('p', { class: 'small muted center' }, t('say.skip')));
    } else if (first) {
      // the learner asked to concentrate on listening: no microphone here until they ask for it
      main.append(h('section', { class: 'card' }, h('h2', null, t('say.title')), h('p', null, t('say.aloud')),
        btn(t('say.micOn'), { cls: 'btn-ghost', icon: 'mic', block: true, onclick: () => { store.update((s) => { s.onboard.focus = 'both'; }); app.render(); } }),
        h('p', { class: 'small muted' }, t('say.micOn.hint'))));
    } else main.append(h('p', { class: 'muted' }, t('say.aloud')));
    auto = clipEn(p.say || p.en, p.voice, 'n');
  }

  else if (scr.kind === 'grid') {
    // A page of words to tap and hear — the numbers, the days of the week — with their recordings from the word list.
    const G = L.grid;
    const words = G.words.map((name) => content.vocab.find((w) => w.en === name)).filter(Boolean);
    const clip = (w) => clipEn(w.en, 's', 'n');
    const light = (i) => document.querySelectorAll('[data-cell]').forEach((b) => b.classList.toggle('is-on', +b.dataset.cell === i));
    main.append(h('section', { class: 'card' }, h('h1', { style: 'font-size:1.35rem' }, G.title || t('grid.title')), G.note ? h('p', null, G.note) : h('p', { class: 'muted' }, t('grid.hint')),
      listenBtn(app, words.map(clip), { label: t('grid.all'), block: true, onStep: light, after: () => light(-1) })));
    main.append(h('div', { class: 'wgrid' }, words.map((w, i) => {
      const num = digitsOf(w.en);
      const b = h('button', { type: 'button', class: 'wcell', 'data-cell': i, onclick: async () => { light(i); await playNow(app, clip(w)); b.classList.remove('is-on'); } },
        num ? h('span', { class: 'num', dir: 'ltr' }, num) : null, en(w.en), h('span', { class: 'fa' }, w.fa));
      return b;
    })));
  }

  else if (scr.kind === 'listen') {
    // the sentences are asked in a different order from the one they were taught in
    const p = phrases.find((x) => x.id === shuffle(hear, mix(seed, 3))[scr.i]);
    const key = `q${pos}`;
    const others = shuffle(phrases.filter((x) => x.id !== p.id), mix(seed, pos)).slice(0, 2);
    const options = shuffle([p, ...others], mix(seed, pos + 0.5)).map((x) => ({ id: x.id, right: x.id === p.id, label: h('span', null, x.fa) }));
    main.append(h('section', { class: 'card' }, h('h1', { style: 'font-size:1.35rem' }, t('listen.title')), listenRow(p.say || p.en, p.voice)));
    main.append(quiz(app, key, options, { onMiss: () => miss(p), missNote: t('listen.again') }));
    // the sentence appears under the answers once it is found, so nothing moves away from under the finger
    if (solvedAt(key)) main.append(h('section', { class: 'card' }, wordsLine(app, p.en, { voice: p.voice }), h('p', { class: 'fa-line' }, p.fa)));
    auto = clipEn(p.say || p.en, p.voice, 'n');
  }

  else if (scr.kind === 'dialogue') {
    const showFa = app.ui.dlgFa ?? stage === 1;
    const clips = L.dialogue.lines.map((l) => clipEn(l.en, l.who === 'you' ? 's' : them, 'n'));
    main.append(h('section', { class: 'card' }, h('h1', { style: 'font-size:1.35rem' }, t('talk.title')), h('p', null, L.dialogue.setting),
      h('div', { class: 'row' },
        listenBtn(app, clips, { label: t('talk.playAll'), onStep: (i) => { document.querySelectorAll('[data-line]').forEach((b) => b.classList.toggle('is-on', +b.dataset.line === i)); }, after: () => document.querySelectorAll('[data-line]').forEach((b) => b.classList.remove('is-on')) }),
        btn(showFa ? t('talk.hideFa') : t('talk.showFa'), { cls: 'btn-ghost', icon: 'eye', onclick: () => { app.ui.dlgFa = !showFa; app.render(); } }))));
    main.append(h('div', { class: 'chat' }, L.dialogue.lines.map((l, i) => h('div', { class: `bubble ${l.who}`, 'data-line': i },
      h('span', { class: 'who' }, l.who === 'you' ? t('talk.you') : L.them.role),
      en(l.en, 'p'), showFa ? h('p', { class: 'fa-line' }, l.fa) : null,
      h('div', { class: 'tools' }, listenBtn(app, clips[i], { label: t('audio.listen'), small: true }))))));
  }

  else if (scr.kind === 'gist') {
    // "What did they say?" — one of the other person's lines from the dialogue, heard without its text.
    // From stage 2 the first of them comes before the dialogue is shown: the line is heard cold, as in real life.
    // Any number of replays, and a wrong tap costs nothing.
    // In the last stage the last of them is a longer turn: two of the other person's lines, one after the other.
    const lines = partnerLines(L), key = `q${pos}`;
    const G = scr.long ? longGist(L, seed, scr.g) : null;
    const said = G ? G.lines : [gistTargets(L, seed)[scr.g]];
    const line = said[0];
    const options = G ? shuffle(G.options.map((o, i) => ({ id: 'o' + i, right: o.right, label: h('span', null, o.fa) })), mix(seed, pos + 0.5))
      : shuffle([line, ...shuffle(lines.filter((l) => l !== line), mix(seed, pos)).slice(0, 2)], mix(seed, pos + 0.5)).map((l) => ({ id: l.en, right: l === line, label: h('span', null, l.fa) }));
    main.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, L.them.role), h('h1', { style: 'font-size:1.35rem' }, t('gist.title')),
      scr.cold ? h('p', null, L.dialogue.setting) : null, G ? h('p', null, scr.cold ? t('gist.cold.long') : t('gist.long')) : null, heardRow(key, said.map((l) => l.en), them),
      scr.cold && !G ? h('p', { class: 'small muted' }, t('gist.cold')) : null));
    main.append(quiz(app, key, options, { missNote: t('listen.again') }));
    if (solvedAt(key)) main.append(h('section', { class: 'card' }, said.map((l) => [en(l.en, 'p', 'en-line'), h('p', { class: 'fa-line' }, l.fa)])));
    auto = said.map((l) => clipEn(l.en, them, 'n'));
  }

  else if (scr.kind === 'variant') {
    // The same thing in other words: people do not ask "What is your date of birth?" the same way every time.
    // Heard without text; the meaning is picked from three Farsi sentences; then the words, and the wording the
    // lesson taught, are shown side by side.
    const v = variants[scr.v], key = `q${pos}`;
    const wrong = shuffle(variantWrong(L, v).slice(0, 4), mix(seed, pos)).slice(0, 2);
    const options = shuffle([{ id: 'r', right: true, fa: v.fa }, ...wrong.map((fa, i) => ({ id: 'w' + i, right: false, fa }))], mix(seed, pos + 0.5)).map((o) => ({ ...o, label: h('span', null, o.fa) }));
    main.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, t('variant.eyebrow')), h('h1', { style: 'font-size:1.35rem' }, t('gist.title')), heardRow(key, [v.en], v.voice || them),
      scr.v === 0 ? h('p', { class: 'small muted' }, t('variant.hint')) : null));
    main.append(quiz(app, key, options, { missNote: t('listen.again') }));
    if (solvedAt(key)) main.append(h('section', { class: 'card' }, en(v.en, 'p', 'en-line'), h('p', { class: 'fa-line' }, v.fa),
      v.like ? h('p', { class: 'muted' }, t('variant.same')) : null, v.like ? en(v.like, 'p', 'en-line') : null));
    auto = clipEn(v.en, v.voice || them, 'n');
  }

  else if (scr.kind === 'grammar') {
    // One small pattern. The check is a real one: the typical mistake and the right form are first met as the
    // question (two sentences, in an order that changes), and only after the answer are they shown side by side
    // with the reason. The example that is the answer is held back from the list above the question.
    // A lesson may also give a fresh sentence of the same pattern to ask about: grammar.fresh = { en, wrong, fa }.
    const G = L.grammar, key = `q${pos}`;
    const listen = G.compare === 'listen';
    const solved = solvedAt(key);
    const F = !listen && G.fresh && G.fresh.en && G.fresh.wrong ? G.fresh : null;
    const right = F ? F.en : G.right, wrong = F ? F.wrong : G.wrong;
    const meaning = F ? F.fa : (G.examples.find((e) => e.en === G.right) || {}).fa;
    main.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, t('grammar.eyebrow')), h('h1', { style: 'font-size:1.4rem' }, G.title), h('p', { class: 'lead' }, G.explain)));
    const examples = listen ? G.examples : G.examples.filter((e) => e.en !== right);
    if (examples.length) main.append(h('section', { class: 'card' }, examples.map((e) => h('div', { class: 'opt-wrap' }, miniPlay(app, clipEn(e.en, 's', 'n')), h('div', { class: 'grow' }, en(e.en, 'p', 'en-line'), h('p', { class: 'muted' }, e.fa))))));
    if (listen) {
      // two words that sound alike: hear both, then say which of the two was played (it is not always the same one)
      const played = mix(seed, pos + 0.25) < 0.5 ? G.right : G.wrong;
      main.append(h('section', { class: 'card' }, h('h2', null, t('grammar.alike')),
        h('div', { class: 'row' }, listenBtn(app, clipEn(G.wrong, 's', 'n'), { label: en(G.wrong), cls: 'btn-sound grow' }), listenBtn(app, clipEn(G.right, 's', 'n'), { label: en(G.right), cls: 'btn-sound grow' })), h('p', null, G.why)));
      main.append(h('h2', { class: 'section-title' }, t('grammar.whichHeard')), h('div', { class: 'row' }, listenBtn(app, clipEn(played, 's', 'n'), { label: t('audio.listen') })));
      main.append(quiz(app, key, shuffle([{ id: 'r', right: played === G.right, label: en(G.right) }, { id: 'w', right: played === G.wrong, label: en(G.wrong) }], mix(seed, pos)), { missNote: t('listen.again') }));
    } else {
      main.append(h('h2', { class: 'section-title' }, t('grammar.which')), meaning ? h('p', { class: 'fa-line' }, `«${meaning}»`) : '');      // ('' — append(null) would print "null")
      main.append(quiz(app, key, shuffle([{ id: 'r', right: true, label: en(right) }, { id: 'w', right: false, label: en(wrong), why: G.why }], mix(seed, pos)), { rightNote: t('quiz.right') }));
      if (solved) main.append(h('section', { class: 'card' },
        h('p', null, h('b', null, t('grammar.dont') + ' '), h('s', { class: 'en', lang: 'en', dir: 'ltr' }, G.wrong)),
        h('div', { class: 'opt-wrap' }, miniPlay(app, clipEn(G.right, 's', 'n')), h('p', { class: 'grow' }, h('b', null, t('grammar.do') + ' '), en(G.right, 'span', 'en-line'))),
        h('p', { class: 'muted' }, G.why)));
    }
  }

  else if (scr.kind === 'respond') {
    // Several answers are right. Next to them stand the answer the lesson marks as unsuitable and, where the
    // lesson names one (respond.off2), a second sentence of this lesson that is clearly for another moment.
    const R = L.respond, key = `q${pos}`;
    const showFa = app.ui.respFa ?? stage === 1;
    const off2 = phrases.find((p) => p.id === (typeof R.off2 === 'number' ? `p${R.off2}` : R.off2) && p.en !== R.off.en && !R.ok.some((o) => o.en === p.en));
    const options = shuffle([...R.ok.map((o, i) => ({ id: 'ok' + i, right: true, o, why: t('respond.good') })), { id: 'off', right: false, o: R.off, why: R.off.why },
      ...(off2 ? [{ id: 'off2', right: false, o: off2, why: t('respond.other') }] : [])], mix(seed, pos))
      .map((x) => ({ ...x, play: clipEn(x.o.say || x.o.en, x.o.voice || 's', 'n'), label: h('span', null, en(x.o.en), h('span', { class: 'sub' }, x.o.fa)) }));
    main.append(h('section', { class: 'card' }, h('h1', { style: 'font-size:1.35rem' }, t('respond.title')), h('p', null, R.setting)));
    main.append(h('div', { class: 'chat' }, h('div', { class: 'bubble them' }, h('span', { class: 'who' }, L.them.role), en(R.them.en, 'p'), showFa ? h('p', { class: 'fa-line' }, R.them.fa) : null,
      h('div', { class: 'tools' }, listenBtn(app, clipEn(R.them.en, them, 'n'), { label: t('audio.again'), small: true }), listenBtn(app, clipEn(R.them.en, them, 's'), { label: t('audio.slow'), cls: 'btn-ghost', ic: 'slow', small: true }),
        btn(showFa ? t('talk.hideFa') : t('talk.showFa'), { cls: 'btn-ghost', icon: 'eye', small: true, onclick: () => { app.ui.respFa = !showFa; app.render(); } })))));
    main.append(h('h2', { class: 'section-title' }, t('respond.ask')), h('p', { class: 'muted small' }, t('respond.many')));
    main.append(quiz(app, key, options));
    const solved = app.ui[key] && app.ui[key].solved;
    if (solved && micOn(app)) { const o = options.find((x) => x.id === solved); main.append(sayPanel(app, { key: `say${pos}`, target: o.o.en, voice: 's', own: ownAll.filter((w) => o.o.en.includes(w)) })); }
    auto = clipEn(R.them.en, them, 'n');
  }

  else if (scr.kind === 'task') {
    const T = L.task[scr.j], key = `q${pos}`;
    const p = phrases.find((x) => x.id === T.answer);
    const others = shuffle(phrases.filter((x) => x.id !== p.id), mix(seed, pos)).slice(0, 2);
    const showFa = !!app.ui.taskFa;
    const options = shuffle([p, ...others], mix(seed, pos + 0.5)).map((x) => ({ id: x.id, right: x.id === p.id, play: clipEn(x.say || x.en, x.voice, 'n'),
      label: h('span', null, en(x.en), showFa ? h('span', { class: 'sub' }, x.fa) : null) }));
    // (a task whose own text already ends with the question does not get it a second time)
    const ask = heardOnly(L, p) ? t('task.askHear') : t('task.ask');
    main.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, t('task.eyebrow')), h('h1', { style: 'font-size:1.35rem' }, T.fa), T.fa.includes(ask) ? null : h('p', { class: 'lead' }, ask)));
    main.append(quiz(app, key, options, { onMiss: () => miss(p) }));
    main.append(btn(showFa ? t('task.hideFa') : t('task.showFa'), { cls: 'btn-ghost', icon: 'eye', block: true, onclick: () => { app.ui.taskFa = !showFa; app.render(); } }));
  }

  else if (scr.kind === 'review') {
    // What needed another try comes first. The first question goes from Farsi to English — the direction a
    // speaker needs — the second from the ear to the meaning; in a listen-first lesson both are heard.
    const key = `q${pos}`;
    const ranked = phrases.map((p, i) => ({ p, i, hard: store.state.hard[hardKey(p)] || 0 }));
    const order = (app.ui.revOrder ||= ranked.slice().sort((a, b) => b.hard - a.hard || a.i - b.i).map((x) => x.p.id));
    const p = phrases.find((x) => x.id === order[scr.k % order.length]);
    const others = shuffle(phrases.filter((x) => x.id !== p.id), mix(seed, pos)).slice(0, 2);
    const hearIt = heardOnly(L, p) || scr.k % 2 === 1;
    const opts = shuffle([p, ...others], mix(seed, pos + 0.5));
    main.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, t('review.eyebrow')),
      hearIt ? [h('h1', { style: 'font-size:1.35rem' }, t('listen.title')), listenRow(p.say || p.en, p.voice)]
        : [h('h1', { style: 'font-size:1.35rem' }, t('review.how')), h('p', { class: 'fa-line lead' }, `«${p.fa}»`)]));
    main.append(quiz(app, key, opts.map((x) => ({ id: x.id, right: x.id === p.id, play: hearIt ? null : clipEn(x.say || x.en, x.voice, 'n'), label: hearIt ? h('span', null, x.fa) : en(x.en) })), { onMiss: () => miss(p) }));
    if (hearIt) auto = clipEn(p.say || p.en, p.voice, 'n');
  }

  else if (scr.kind === 'build') {
    const p = phrases[scr.i];
    const extra = phrases.filter((x) => x.id !== p.id).flatMap((x) => tilesFor(x.en));
    main.append(h('h1', { class: 'section-title' }, t('build.inLesson')));
    main.append(tileBuilder(app, `tb${pos}`, { en: p.en, fa: p.fa, voice: p.voice }, { extra, onDone: (clean) => { if (!clean) miss(p); } }));
  }

  else if (scr.kind === 'done') {
    // the conversation that practises this lesson (curriculum.json "practice"); no button when there is none
    const rp = content.roleplays.find((r) => r.id === content.practice[id]);
    // the pattern this lesson explains, or else one that this lesson opens early (patterns.json "opensAfter")
    const pattern = content.patterns.find((x) => x.lesson === id) || content.patterns.find((x) => x.opensAfter === id);
    // the next new lesson of the learner's own path (W2b): the essentials first, never a lesson they have set aside
    const nextId = pathLesson(store.state, content);
    const hard = phrases.filter((p) => store.state.hard[hardKey(p)]);
    main.append(h('section', { class: 'card center' }, h('span', { class: 'big-check' }, icon('check')), h('h1', { style: 'font-size:1.6rem' }, t('done.title')), h('p', { class: 'lead' }, L.canDo), faListen(app, L.canDo, t('audio.listenFa'))));
    if (hard.length) main.append(h('section', { class: 'card' }, h('h2', null, t('done.hard')), h('p', { class: 'muted' }, t('done.hard.sub')),
      hard.map((p) => h('div', { class: 'opt-wrap' }, miniPlay(app, clipEn(p.say || p.en, p.voice, 'n')), h('div', { class: 'grow' }, en(p.en, 'p', 'en-line'), h('p', { class: 'muted' }, p.fa))))));
    // ---- W2b: the lesson's small real-life task (L.mission), «جملهٔ خودِ شما», the link to «شنیدن عددها», the paper
    // ---- that belongs to this lesson and the "what I can do now" link go here, between the two markers. ----------
    // (views/progress.js) First the learner's own sentence and the small task for today; the optional extra practice
    // and the quiet link to «کارهایی که حالا می‌توانم بکنم» come after the three usual buttons, which stay where they were.
    const extras = doneExtras(app, id);
    extras.cards.forEach((card) => main.append(card));
    // ---- end of the W2b part ----------------------------------------------------------------------------------
    main.append(note(t('done.review'), 'info', 'cards'));
    // The one main next step — the conversation of this lesson, or else the next lesson — and «خانه» are in the fixed bar
    // at the bottom, where «بعدی» was on every other screen: in sight however long this page is. The other choices stay here.
    const toNext = nextId ? () => app.go('lesson.' + nextId, { replace: true }) : null;
    const lead = rp ? btn(t('done.practice', { title: rp.title }), { cls: 'btn-primary', icon: 'chat', 'data-done-next': '', onclick: () => app.go('rp.' + rp.id, { replace: true }) })
      : toNext ? btn(t('done.next', { title: content.lessons[nextId].title.fa }), { cls: 'btn-primary', icon: 'book', 'data-done-next': '', onclick: toNext }) : null;
    doneBar = h('div', { class: 'bottombar' }, h('div', { class: 'inner' }, btn(t('nav.home'), { cls: 'btn-ghost is-fit', icon: 'home', onclick: app.home }), lead));
    const rest = [
      pattern ? btn(t('build.lesson'), { cls: 'btn-soft', icon: 'pieces', block: true, onclick: () => app.go('build.' + pattern.id, { replace: true }) }) : null,
      rp && toNext ? btn(t('done.next', { title: content.lessons[nextId].title.fa }), { cls: 'btn-ghost', icon: 'book', block: true, onclick: toNext }) : null].filter(Boolean);
    if (rest.length) main.append(h('div', { class: 'stack' }, rest));
    // ---- W2b: more practice that belongs to this lesson (a second conversation, «شنیدن عددها», a paper to read) ----
    if (extras.more.length) main.append(h('h2', { class: 'section-title' }, t('done.more')), h('div', { class: 'stack' }, extras.more));
    main.append(extras.canDo);
    // ---- end of the W2b part ----------------------------------------------------------------------------------
  }

  // "قبلی" goes one screen back inside the lesson; leaving the lesson is the top bar's job (see `exit` below)
  const bar = scr.kind === 'done' ? doneBar : h('div', { class: 'bottombar' }, h('div', { class: 'inner' },
    pos > 0 ? btn(t('nav.prev'), { cls: 'btn-ghost', icon: 'back', onclick: () => move(-1) }) : null,
    btn(scr.kind === 'intro' ? t('lesson.start') : t('nav.next'), { cls: 'btn-primary', onclick: () => move(1), 'data-next': '' })));

  const drawnAt = store.state.at[id] ? store.state.at[id].pos : 0;
  const after = (navigated) => {
    if (!auto || !store.state.settings.auto) return;
    if (app.ui['auto' + pos]) return;
    app.ui['auto' + pos] = true;
    // …unless the learner has already moved on (or left) by the time it would start
    // (after 1.2 s: a screen reader has read the new screen's heading first, and the sentence does not talk over it)
    if (navigated) later(app, 1200, () => { const a = store.state.at[id]; if ((a ? a.pos : 0) === drawnAt) playNow(app, auto, { quiet: true }); });
  };
  // inside a lesson the top-bar control says what it does: it leaves the lesson (the place is kept)
  const exit = pos > 0 && scr.kind !== 'done' ? { label: t('lesson.leave') } : null;
  return { main, bar, after, exit };
}
