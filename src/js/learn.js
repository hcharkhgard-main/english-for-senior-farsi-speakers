// What the learner meets next: which lesson, which words in review, which lines to test.
// Plain functions over the saved state and the content bundle, so they can be unit-tested.
import { today } from './store.js';
import { buildQueue, LESSON_RESERVED } from './srs.js';

// saved state can name things that do not exist (an old build, damaged storage): "constructor" is not a lesson
const has = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);

// A shuffled copy. With a seed in (0,1) the order is repeatable; without one it is different every time.
export function shuffle(arr, seed = Math.random()) {
  const a = arr.slice();
  let s = Math.floor(seed * 2147483647) || 1;
  const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// A number in (0,1) that is fixed for one attempt (seed) and one place in it (k): used to mix answer options
// differently every time a lesson or conversation is done, while staying put when the screen redraws.
// (The bits are stirred thoroughly, so two places of one attempt are not mixed in related ways.)
export function mix(seed, k = 0) {
  let x = Math.floor(seed * 4294967296) ^ Math.imul(Math.round(k * 2) + 1, 0x9e3779b1);
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (((x ^ (x >>> 16)) >>> 0) + 0.5) / 4294967296;
}

export const lessonOrder = (content) => content.stages.flatMap((st) => st.lessons.filter((id) => content.lessons[id]));
const stageOf = (content, id) => content.lessons[id].stage || 1;

// The unfinished lesson the learner was in most recently. A lesson they have already completed never
// takes this place, so repeating an old lesson (or just looking at one) cannot hide the one they are working on.
export function resumeId(state, content) {
  let best = null;
  for (const [id, a] of Object.entries(state.at || {})) {
    if (!has(content.lessons, id) || state.done[id] || !a || !(a.pos >= 1)) continue;
    if (!best || a.t > state.at[best].t) best = id;
  }
  return best;
}

// The next new lesson on the learner's path (ignoring a lesson in progress).
// state.later: lessons the learner set aside with «این درس الان به کارم نمی‌آید» — 1: it waits at the end of the
// path; 2: set aside again when it came up there, so it is no longer offered (it stays in «موقعیت‌های روزمره»).
export function pathLesson(state, content) {
  const order = lessonOrder(content);
  const later = state.later || {};
  const todo = (id) => !state.done[id];
  const now = (id) => todo(id) && !(has(later, id) && later[id]);
  // 1. the essentials (hello, "I don't understand", calling 911, the learner's own name, numbers and address) come
  //    first for everyone, whatever they answered at the start
  const essentials = (content.essentials || []).filter((id) => content.lessons[id]);
  const must = essentials.find(todo);
  if (must) return must;
  const from = state.onboard.level === 'some' ? 2 : 1;      // the stage this learner starts in
  // 2. then one lesson from the situation they asked for — of their own stage, never a harder one
  const sc = state.onboard.scenario;
  if (sc) {
    const mine = order.filter((id) => content.lessons[id].scenario === sc && !essentials.includes(id));
    if (mine.every(todo)) { const pick = mine.find((id) => stageOf(content, id) <= from && now(id)); if (pick) return pick; }
  }
  // 3. then the lessons in order, from their stage on. Lessons about safety (a scam call, a stranger at the door)
  //    are never passed over because of an answer at the start: they come in their place whatever the stage. Nor are
  //    the lessons later ones take for granted (curriculum.json "always": prices at the checkout, days and times).
  const always = Array.isArray(content.always) ? content.always : [];
  return order.find((id) => now(id) && (stageOf(content, id) >= from || !!content.lessons[id].safetyCritical || always.includes(id)))
    || order.find(now)                                             // 4. what was skipped at the start
    || order.find((id) => todo(id) && later[id] !== 2)             // 5. what the learner set aside, at the very end
    || null;
}

export function nextLesson(state, content) {
  const resume = resumeId(state, content);
  if (resume) return { id: resume, resume: true };
  const id = pathLesson(state, content);
  return id ? { id } : null;
}

// Why the situation chosen at the start does not open straight away: 'now' (it does, after the essentials),
// 'later' (its lessons belong to a later stage) or 'none'.
export function scenarioStart(state, content) {
  const sc = state.onboard.scenario;
  if (!sc) return 'none';
  const from = state.onboard.level === 'some' ? 2 : 1;
  return lessonOrder(content).some((id) => content.lessons[id].scenario === sc && stageOf(content, id) <= from) ? 'now' : 'later';
}

// ---- «درس امروز»: what the first button of the home screen offers ----------------------------------
// Always something, with an honest description (the home screen never says there is nothing left):
//   { kind: 'resume', id }       the lesson the learner is in the middle of
//   { kind: 'checkpoint' }       a short look back, after every fifth finished lesson
//   { kind: 'lesson', id }       the next new lesson of the path
//   { kind: 'repeat', id }       the path is finished: an earlier lesson again, in its short form
//   { kind: 'talk', id, hear }   the path is finished and a lesson was done today: a conversation
//                                (hear: it has been done once, so this time its lines are heard before they are read)
export function todayOffer(state, content, now = Date.now()) {
  const resume = resumeId(state, content);
  if (resume) return { kind: 'resume', id: resume };
  if (checkpointDue(state, content)) return { kind: 'checkpoint' };
  const id = pathLesson(state, content);
  if (id) return { kind: 'lesson', id };
  return afterPath(state, content, now);
}

// the finished lessons, in path order
export const doneLessons = (state, content) => lessonOrder(content).filter((id) => has(state.done, id) && state.done[id]);
const doneAt = (state, id) => Number(state.done[id] && state.done[id].t) || 0;
// how often the sentences of a lesson needed another try
export const missesOf = (state, id) => Object.entries(state.hard || {}).reduce((n, [k, v]) => (k.startsWith(id + ':') ? n + (Number(v) || 0) : n), 0);

// ---- when no new lesson is left ---------------------------------------------------------------------
// One short lesson a day, then conversations:
//  · no lesson finished today -> the finished lesson with the most misses, in its short form. A lesson repeated in
//    the last REPEAT_REST days has a rest, so the same one is not offered day after day; when every lesson is
//    resting, the one finished longest ago is offered.
//  · a lesson was finished today -> a conversation: first one done exactly once (it is now heard before it is read),
//    then one never done, then the one done least often.
export const REPEAT_REST = 7;
export function afterPath(state, content, now = Date.now()) {
  const day = today(now);
  const done = doneLessons(state, content);
  if (done.length && !done.some((id) => today(doneAt(state, id)) === day)) {
    const rested = done.filter((id) => day - today(doneAt(state, id)) >= REPEAT_REST);
    const byAge = (a, b) => doneAt(state, a) - doneAt(state, b);
    const id = rested.length ? rested.slice().sort((a, b) => missesOf(state, b) - missesOf(state, a) || byAge(a, b))[0] : done.slice().sort(byAge)[0];
    // a repeat left half-way is offered as what it is: «ادامهٔ درس»
    const at = has(state.at, id) && state.at[id];
    return at && at.pos >= 1 ? { kind: 'resume', id } : { kind: 'repeat', id };
  }
  const talks = (content.roleplays || []).slice().sort((a, b) => (a.stage || 1) - (b.stage || 1));
  if (!talks.length) return done.length ? { kind: 'repeat', id: done.slice().sort((a, b) => doneAt(state, a) - doneAt(state, b))[0] } : null;
  const times = (r) => Number(state.rp && state.rp[r.id]) || 0;
  const pick = talks.find((r) => times(r) === 1) || talks.find((r) => times(r) === 0) || talks.slice().sort((a, b) => times(a) - times(b))[0];
  return { kind: 'talk', id: pick.id, hear: times(pick) >= 1 && !pick.phone };
}

// ---- a look back after every fifth lesson ---------------------------------------------------------
// Built from the five lessons finished most recently: CHECK_HEAR "what did they say?" questions (a partner's line,
// heard without its text), CHECK_SAY "how do you say …?" questions (Farsi shown, three English sentences to choose
// from) and one conversation. No score: at the end the learner sees which sentences to look at again.
export const CHECK_EVERY = 5, CHECK_HEAR = 4, CHECK_SAY = 4;
export function checkpointDue(state, content) {
  const n = doneLessons(state, content).length;
  return n >= CHECK_EVERY && Math.floor(n / CHECK_EVERY) > ((state.cp && state.cp.n) || 0);
}
// what to store when the look back is finished or passed over: every group of five up to now has had its turn
export const checkpointMark = (state, content, now = Date.now()) => ({ n: Math.floor(doneLessons(state, content).length / CHECK_EVERY), t: now });
// the lessons it looks back at, oldest first
export function checkpointLessons(state, content) {
  return doneLessons(state, content).map((id, i) => ({ id, i, t: doneAt(state, id) })).sort((a, b) => b.t - a.t || b.i - a.i).slice(0, CHECK_EVERY).reverse().map((x) => x.id);
}
export function checkpointPlan(state, content, seed = Math.random()) {
  const ids = checkpointLessons(state, content);
  const Ls = ids.map((id) => content.lessons[id]);
  // "what did they say?" — one line from each lesson in turn, the other choices from the same dialogue
  const hear = [];
  const talky = shuffle(Ls.filter((L) => partnerLines(L).length >= 3), mix(seed, 11));
  for (let round = 0; round < 3 && hear.length < CHECK_HEAR; round++) for (const L of talky) {
    if (hear.length >= CHECK_HEAR) break;
    const line = gistTargets(L, mix(seed, 13))[round];
    if (!line) continue;
    const others = shuffle(partnerLines(L).filter((l) => l !== line), mix(seed, 31 + hear.length)).slice(0, 2);
    hear.push({ kind: 'hear', lesson: L.id, role: L.them.role, en: line.en, fa: line.fa, voice: L.them.voice,
      options: shuffle([line, ...others], mix(seed, 41 + hear.length)).map((l) => ({ fa: l.fa, right: l === line })) });
  }
  // "how do you say …?" — sentences the learner has seen (a short lesson shows three of five), those that needed
  // another try first; never one that holds the sample person's own details, never a line other people say ("heard").
  // Lessons whose sentences are all things other people say (listenFirst) are used only when there is nothing else.
  const say = [];
  const seen = (L) => { const list = L.phrases.filter((p) => has(state.srs, `p:${L.id}:${p.id}`)); return list.length >= 3 ? list : shortPhrases(L); };
  const hardOf = (L, p) => Number((state.hard || {})[`${L.id}:${p.id}`]) || 0;
  const pools = shuffle(Ls, mix(seed, 17)).map((L) => ({ L, list: shuffle(seen(L).filter((p) => !holdsOwn(p) && !p.heard), mix(seed, 19)).sort((a, b) => hardOf(L, b) - hardOf(L, a)) }))
    .sort((a, b) => (b.list[0] ? hardOf(b.L, b.list[0]) : 0) - (a.list[0] ? hardOf(a.L, a.list[0]) : 0));      // a lesson with a sentence that was hard has its turn first
  for (const group of [pools.filter((x) => !x.L.listenFirst), pools.filter((x) => x.L.listenFirst)]) {
    for (let round = 0; round < 5 && say.length < CHECK_SAY; round++) for (const { L, list } of group) {
      if (say.length >= CHECK_SAY) break;
      const p = list[round];
      const others = p ? shuffle(seen(L).filter((x) => x.id !== p.id), mix(seed, 51 + say.length)).slice(0, 2) : [];
      if (!p || others.length < 2) continue;
      say.push({ kind: 'say', lesson: L.id, pid: p.id, en: p.en, fa: p.fa,
        options: shuffle([p, ...others], mix(seed, 61 + say.length)).map((x) => ({ id: x.id, en: x.en, say: x.say || x.en, voice: x.voice || 's', right: x.id === p.id })) });
    }
  }
  // listening and speaking questions take turns
  const items = [];
  for (let i = 0; i < Math.max(hear.length, say.length); i++) { if (hear[i]) items.push(hear[i]); if (say[i]) items.push(say[i]); }
  // one conversation that practises these lessons: the one done least often, the most recent lesson's first
  const all = content.practiceAll || {};
  const talks = [...new Set(ids.slice().reverse().flatMap((id) => all[id] || (content.practice && content.practice[id] ? [content.practice[id]] : [])))]
    .filter((rid) => (content.roleplays || []).some((r) => r.id === rid));
  const times = (rid) => Number(state.rp && state.rp[rid]) || 0;
  const talk = talks.slice().sort((a, b) => times(a) - times(b))[0] || null;
  return { lessons: ids, items, talk };
}

// ---- out of the app, into the day -------------------------------------------------------------------
// Each lesson ends with a small thing to try in real life (lesson.mission). At a later visit the app asks once,
// about the lesson finished most recently, whether the learner managed: not within MISSION_WAIT hours of finishing
// on the same day (there has been no chance yet), and not after MISSION_KEEP days (it is no longer fresh).
// Returns that lesson's id, or null. state.tried[id]: 1 yes, 0 "not yet" — either way it is not asked again.
export const MISSION_WAIT = 4 * 3600000, MISSION_KEEP = 14;
export function missionDue(state, content, now = Date.now()) {
  const done = doneLessons(state, content);
  if (!done.length) return null;
  const id = done.slice().sort((a, b) => doneAt(state, b) - doneAt(state, a))[0];
  const t = doneAt(state, id);
  if (!content.lessons[id].mission || has(state.tried, id)) return null;
  if (today(now) === today(t) ? now - t < MISSION_WAIT : today(now) - today(t) > MISSION_KEEP) return null;
  return id;
}

// «کارهایی که حالا می‌توانم بکنم»: what each finished lesson lets the learner do, newest first.
export function canDoList(state, content) {
  return doneLessons(state, content).map((id, i) => ({ id, i, t: doneAt(state, id) })).sort((a, b) => b.t - a.t || b.i - a.i).map(({ id }) => {
    const L = content.lessons[id];
    return { id, title: L.title.fa, canDo: L.canDo, mission: L.mission || '', tried: has(state.tried, id) ? !!state.tried[id] : null };
  });
}

// «این درس الان به کارم نمی‌آید» on the first screen of a lesson: for which lessons it is offered, and what it does.
// Only lessons of the last stage (driving, flying, working, ceremonies — not everyone needs them), never one
// already finished. `aside`: the lesson has been set aside before, so the screen offers to bring it back instead —
// unless it is the lesson the path has now come back to, which can be set aside for good.
export function laterChoice(state, content, id) {
  const L = has(content.lessons, id) ? content.lessons[id] : null;
  if (!L || (L.stage || 1) < 3 || state.done[id]) return null;
  const mark = Number((state.later || {})[id]) || 0;
  if (!mark) return { act: 'later', set: 1 };
  if (mark === 1 && pathLesson(state, content) === id) return { act: 'later', set: 2 };
  return { act: 'back', set: 0 };
}

// ---- which new words come next ----------------------------------------------------------------------
// The data is content/review-order.json (wordsFirst, wordsAfter in the bundle). Three rules:
//  1. the most useful everyday words come first for everyone, in the order of that list;
//  2. then the words met in the sentences and dialogues of finished lessons, the lesson finished last first ("refill"
//     right after the pharmacy lesson — QA round 3, M6); then the word groups take turns, three words each — first
//     the groups whose lesson is finished, the lesson finished last first, then the others. Outside the lessons' own
//     words, easier words come first: no level 2 word before a level 1 word;
//  3. a group marked "last" in vocabulary.json (the alphabet) comes after every other word: the learner
//     spells their own name from their own card («اطلاعات من»), and 26 letter cards must not hold up
//     "appointment" or "prescription".
export const TURN = 3;            // words a group gives before the next group has its turn

// TURN items from each list in turn, until all are used up.
export function inTurns(lists, size = TURN) {
  const out = [];
  for (let i = 0; lists.some((l) => i < l.length); i += size) for (const l of lists) out.push(...l.slice(i, i + size));
  return out;
}

// The vocabulary words met in a lesson's sentences and dialogue ("prescription", "refill" in pharmacy-problems), in
// the order of vocabulary.json. Small words (two letters or fewer, and the group "little": "you", "this", "where") are
// left out: they are in every lesson, and the first words bring them anyway.
const lessonWordCache = new WeakMap();
export function lessonWords(content, id) {
  let byLesson = lessonWordCache.get(content);
  if (!byLesson) lessonWordCache.set(content, (byLesson = new Map()));
  if (byLesson.has(id)) return byLesson.get(id);
  const L = content.lessons[id];
  const text = L ? ' ' + [...L.phrases.map((p) => p.en), ...L.dialogue.lines.map((l) => l.en)].join(' ').toLowerCase().replace(/[^a-z0-9'-]+/g, ' ') + ' ' : '';
  const out = !L ? [] : content.vocab.filter((w) => {
    const e = String(w.en).toLowerCase().replace(/[^a-z0-9'-]+/g, ' ').trim();
    return e.length > 2 && w.cat !== 'little' && text.includes(' ' + e + ' ');
  }).map((w) => w.id);
  byLesson.set(id, out);
  return out;
}

// Everything the learner may be asked to review, in the order new items should appear.
export function reviewPool(state, content) {
  const ids = [];
  const order = lessonOrder(content);
  // sentences of finished lessons — only the ones the learner actually saw (a short lesson shows three of five)
  for (const id of order) {
    if (!state.done[id]) continue;
    for (const p of content.lessons[id].phrases) { const k = `p:${id}:${p.id}`; if (state.srs[k]) ids.push(k); }
  }
  // words: only up to the level of the stage the learner has reached — the stage of the next lesson, or of any
  // lesson already finished (someone who began at stage 2 comes back to the skipped stage 1 lessons at the end:
  // the harder words they have met must not disappear from review then)
  const next = pathLesson(state, content);
  const stage = Math.max(next ? stageOf(content, next) : 3, ...order.filter((id) => state.done[id]).map((id) => stageOf(content, id)));
  const byId = new Map(content.vocab.map((w) => [w.id, w]));
  // 1. the first words
  const main = (content.wordsFirst || []).filter((id) => byId.has(id) && byId.get(id).level <= stage);
  const first = new Set(main);
  // 2. the groups in turn: those of finished lessons (the lesson finished last first), then the rest (in the order of
  //    vocabulary.json)
  const finished = order.filter((id) => state.done[id]).map((id, i) => ({ id, i, t: Number(state.done[id].t) || 0 })).sort((a, b) => b.t - a.t || b.i - a.i);
  const open = [];
  for (const { id } of finished) for (const c of (content.wordsAfter || {})[id] || []) if (!open.includes(c)) open.push(c);
  const last = content.vocabCats.filter((c) => c.last).map((c) => c.id);
  const lead = open.filter((c) => !last.includes(c));
  const rest = content.vocabCats.map((c) => c.id).filter((c) => !open.includes(c) && !last.includes(c));
  // 2a. before the groups take turns: the words of the lessons the learner has finished, the newest lesson first —
  //     a lesson about the pharmacy is followed by "prescription" and "refill" on the next days, not months later
  const lastSet = new Set(last), mine = new Set();
  for (const { id } of finished) for (const wid of lessonWords(content, id)) { const w = byId.get(wid); if (w.level <= stage && !first.has(wid) && !lastSet.has(w.cat) && !mine.has(wid)) { mine.add(wid); main.push(wid); } }
  const words = (c, level) => content.vocab.filter((w) => w.cat === c && w.level === level && !first.has(w.id) && !mine.has(w.id)).map((w) => w.id);
  for (let level = 1; level <= stage; level++) main.push(...inTurns(lead.map((c) => words(c, level))), ...inTurns(rest.map((c) => words(c, level))));
  // 3. the groups that wait until everything else has been met
  for (let level = 1; level <= stage; level++) for (const c of last) main.push(...words(c, level));
  return [...ids, ...main];
}

// The next review set of the day for this learner (buildQueue in srs.js): the first words — the list in
// review-order.json — have their places kept every day until all of them have been met.
// Once the first words have all been met, their kept places pass to the words of a lesson finished that day:
// LESSON_RESERVED of them (srs.js), fewer by those already answered today — but only while the day's two sets can
// still carry what is due (buildQueue). (QA round 4, M3. The simulator shows the limit: a beginner doing a lesson
// every day is behind on most days, and keeping places for words anyway made 300 reviews wait three weeks instead of
// a few dozen for a few days — so for that learner the words of the lessons still come only with their sentences.)
export function todaysSet(state, content, day) {
  const core = (content.wordsFirst || []).filter((id) => !state.srs[id]).length;
  const pool = reviewPool(state, content), inPool = new Set(pool);
  const words = core ? [] : [...new Set(doneLessons(state, content).filter((id) => today(doneAt(state, id)) === day).flatMap((id) => lessonWords(content, id)))].filter((id) => inPool.has(id));
  const metToday = words.filter((id) => state.srs[id] && state.srs[id].l === day).length;
  const lead = words.filter((id) => !state.srs[id]).slice(0, Math.max(0, LESSON_RESERVED - metToday));
  return buildQueue(state.srs, pool, day, state.newDay, { core, lead });
}

// Sentences of earlier lessons whose review is due: for the «این را به انگلیسی چطور می‌گویید؟» questions that
// open a lesson (views/lesson.js). Up to n of them, the longest-waiting first (what the review sets reach last),
// as { key, lesson, phrase }; `except` is the lesson being opened. An answer counts as that sentence's review:
//   store.update((s) => { s.srs[key] = grade(s.srs[key], knew, day); })        (grade from srs.js)
// after which it is no longer due and does not come up again in that day's sets.
// A sentence that holds the sample person's own details ("My name is Maryam.") is never one of them: asked with three
// English choices it would drill Maryam's name, not the learner's (the learner's own come in review, see ownItem in
// own.js). The five sentences of one lesson fall due on the same day, so the list takes one sentence from each lesson
// before a second from any of them — three questions from one lesson could be answered by elimination.
export function dueSentences(state, content, day, n = 3, except = null) {
  const due = [];
  for (const lesson of lessonOrder(content)) {
    if (lesson === except || !state.done[lesson]) continue;
    for (const phrase of content.lessons[lesson].phrases) {
      const key = `p:${lesson}:${phrase.id}`, e = state.srs[key];
      if (e && e.d <= day && !holdsOwn(phrase)) due.push({ key, lesson, phrase, e });
    }
  }
  due.sort((a, b) => a.e.d - b.e.d || a.e.b - b.e.b);
  const seen = new Set();
  const head = due.filter((x) => !seen.has(x.lesson) && seen.add(x.lesson));
  const spread = [...head, ...due.filter((x) => !head.includes(x))];
  return spread.slice(0, n).map(({ key, lesson, phrase }) => ({ key, lesson, phrase }));
}

// ---- the lesson -------------------------------------------------------------------------------------
// The three sentences of a short lesson: the first three — unless none of them is the answer to a
// real-world task, in which case the third makes room for the sentence the first task needs.
export function shortPhrases(L) {
  const ph = L.phrases.slice(0, 3);
  if (L.task.some((t) => ph.some((p) => p.id === t.answer))) return ph;
  const need = L.phrases.find((p) => p.id === L.task[0].answer);
  return need ? [...ph.slice(0, 2), need] : ph;
}

// A sentence the learner only has to understand: every sentence of a listen-first lesson, and in other lessons a line
// that other people say ("heard": true — the pharmacist's "You have no refills left."). It gets no "now you say it",
// is never asked from Farsi to English (in the lesson, at the start of later lessons, in review or in a look back)
// and is not built from tiles.
export const heardOnly = (L, p) => !!((L && L.listenFirst) || (p && p.heard));
// A sentence with the sample person's own details in it ("My name is Maryam."): see `own` in the lesson files.
export const holdsOwn = (p) => !!(p && Array.isArray(p.own) && p.own.length);

// ---- "what did they say?" ------------------------------------------------------------------------
// The other person's lines in a lesson dialogue, each with a different meaning.
export function partnerLines(L) {
  const en = new Set(), fa = new Set(), out = [];
  for (const l of L.dialogue.lines) {
    if (l.who !== 'them' || en.has(l.en) || fa.has(l.fa)) continue;
    en.add(l.en); fa.add(l.fa); out.push(l);
  }
  return out;
}
// How many such questions a lesson gets: none unless there are three different meanings to choose from.
export const gistCount = (L, short) => { const n = partnerLines(L).length; return n >= 3 ? Math.min(short ? 1 : 2, n) : 0; };
// Which lines are asked this time: full sentences the learner was not taught to say come first.
export function gistTargets(L, seed) {
  const taught = new Set(L.phrases.map((p) => p.en));
  const lines = shuffle(partnerLines(L), mix(seed, 71));
  const good = (l) => !taught.has(l.en) && l.en.trim().split(/\s+/).length >= 3;
  return [...lines.filter(good), ...lines.filter((l) => !good(l))];
}
// The longer turn of the last stage: people often say two things in one go ("We know about the outage in your area.
// A crew is working on it."). Only what the other person really says in one turn is played as one (QA round 4, M1 —
// two lines with the learner's own turn between them were once joined):
//  · two lines of the other person that stand next to each other in the dialogue, with nothing of the learner's in
//    between, the first not a question (after a question the other person waits for the answer) and the second not
//    beginning as an answer ("Yes, …", "Okay. …"), both three words or longer; or
//  · one line of the other person that carries two things or more: two sentences of three words or more besides the
//    small words of a reply ("Thank you.", "Yes.", "I'm so sorry!") and the opening offer of help ("How can I help you?"),
//    eight words or more in all ("You owe eighty-two dollars. It's due on Friday."; QA round 5, teaching L1), with as many sentences in its Farsi meaning as in its English (so each half has its meaning).
// longTurns(L): those turns, in dialogue order, each as { lines: [line] or [first, second], parts: [{ en, fa }] }.
// longGist(L, seed, g): { lines, options: [{ fa, right }] } for the longest turn (the options in a fixed order: the view
// mixes them), or null when the lesson has none (or fewer than three different lines of the other person). Each wrong
// answer changes one of the two halves for another thing the same person says, so both halves must be caught.
// (a sentence that begins as an answer — "Yes, …", "Okay. …", "Thank you." — answers something the learner said)
const REPLY_START = /^(?:yes|no|yeah|okay|ok|sure|of course|thank|thanks|great|good|oh|here|hi|hello|that's|i'm (?:so |very )?sorry|sorry|alright|all right|perfect|you're welcome|let me)\b/i;
const GREETING = /^(?:hi|hello|welcome|good (?:morning|afternoon|evening)|nice to meet you|thank you for calling)\b/i;
const OFFER = /\b(?:how (?:can|may) i help|what can i do for you|can i help you)\b/i;
const wordCount = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
// "Thank you. We know about the outage." -> ['Thank you.', 'We know about the outage.'] (English and Farsi alike)
export const sentencesOf = (s) => String(s || '').trim().split(/(?<=[.!?؟])\s+/).map((x) => x.trim()).filter(Boolean);
// the two (or more) things one line says, with their meanings; null when it says only one, or its halves have no meanings of their own
export function lineParts(line) {
  const en = sentencesOf(line.en), fa = sentencesOf(line.fa);
  if (en.length < 2 || en.length !== fa.length || wordCount(line.en) < 8) return null;
  const parts = en.map((e, i) => ({ en: e, fa: fa[i] })).filter((p) => wordCount(p.en) >= 3 && !REPLY_START.test(p.en) && !OFFER.test(p.en));
  return parts.length >= 2 ? parts : null;
}
export function longTurns(L) {
  if (partnerLines(L).length < 3) return [];
  const lines = L.dialogue.lines, out = [];
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i], b = lines[i + 1];
    if (a.who !== 'them') continue;
    if (b && b.who === 'them' && !/\?\s*$/.test(a.en) && !REPLY_START.test(b.en) && wordCount(a.en) >= 3 && wordCount(b.en) >= 3) {
      out.push({ lines: [a, b], parts: [{ en: a.en, fa: a.fa }, { en: b.en, fa: b.fa }] });
      continue;
    }
    const parts = lineParts(a);
    if (parts) out.push({ lines: [a], parts });
  }
  return out;
}
export function longGist(L, seed, g = 0) {
  const turns = longTurns(L);
  if (!turns.length) return null;
  const size = (x) => x.lines.reduce((n, l) => n + l.en.length, 0);
  const T = turns.slice().sort((p, q) => size(q) - size(p))[0];      // the longest: most often two facts
  const [first, last] = [T.parts[0], T.parts[T.parts.length - 1]];
  // a stand-in for one half: something else this person says, of different meaning
  // (only lines that state something: not a greeting or the offer of help, and not one that, without the small words of a
  // reply, is only a fragment such as «بفرمایید.» — those are ruled out without listening; QA round 5, teaching L2)
  const solid = (l) => { const said = sentencesOf(l.en).filter((e) => !(REPLY_START.test(e) && wordCount(e) <= 3)); return !OFFER.test(l.en) && !said.some((e) => GREETING.test(e)) && wordCount(said.join(' ')) >= 3; };
  const others = shuffle(partnerLines(L).filter((l) => !T.lines.includes(l) && solid(l) && l.fa.trim() !== first.fa.trim() && l.fa.trim() !== last.fa.trim()), mix(seed, 73 + g));
  if (!others.length) return null;
  const x = others[0], y = others[1] || others[0];
  // the whole meaning: for one line its own Farsi (the halves in it are the sentences the line has); for two lines, both
  const whole = T.lines.map((l) => l.fa.trim()).join(' ');
  // (without the small words of a reply that start it: «باشد.»، «البته.» would give the stand-in away)
  const gist = (l) => { const e = sentencesOf(l.en), f = sentencesOf(l.fa); const keep = f.filter((_, i) => e.length === f.length && !(REPLY_START.test(e[i]) && wordCount(e[i]) <= 3)); return (keep.length ? keep : f).join(' '); };
  const swap = (part, by) => (T.lines.length === 2 ? T.lines.map((l) => (l.fa === part.fa ? gist(by) : l.fa.trim())).join(' ')
    : sentencesOf(T.lines[0].fa).map((s) => (s === part.fa ? gist(by) : s)).join(' '));
  return { lines: T.lines, options: [{ fa: whole, right: true }, { fa: swap(last, x), right: false }, { fa: swap(first, y), right: false }] };
}
// (kept for the callers that ask only whether a lesson has a longer turn)
export const longPairs = (L) => longTurns(L).map((x) => x.lines);

// ---- hearing numbers -----------------------------------------------------------------------------
// One short round of n items. Items heard least come first, so every item gets its turn before any is repeated
// (heard: { id: times recognised at the first try }; one that needed a second try therefore comes back sooner).
// No more than three of one kind (price, time, date, phone number, number) in a round, so a round stays mixed.
export function numberRound(items, n, seed = Math.random(), heard = {}) {
  const fair = shuffle(items, seed).sort((a, b) => (heard[a.id] || 0) - (heard[b.id] || 0));
  const out = [], perKind = {};
  for (const it of fair) { if (out.length < n && (perKind[it.kind] || 0) < 3) { out.push(it); perKind[it.kind] = (perKind[it.kind] || 0) + 1; } }
  for (const it of fair) if (out.length < n && !out.includes(it)) out.push(it);      // a short list: fill up regardless of kind
  return shuffle(out, mix(seed, 5));
}

// ---- small helpers for the views -------------------------------------------------------------------
// Microphone practice is shown unless the learner asked at the start to concentrate on listening.
export const micOn = (app) => app.speech.hasMic && app.store.state.onboard.focus !== 'listen';

// Runs fn a little later, but only if the learner is still on the same screen (used for automatic playback,
// so a sentence never starts speaking after they have tapped Home or Back).
export function later(app, ms, fn) {
  const ui = app.ui, screen = app.screen;
  setTimeout(() => { if (app.ui === ui && app.screen === screen && !document.hidden) fn(); }, ms);
}
