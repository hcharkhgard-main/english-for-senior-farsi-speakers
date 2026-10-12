// The review plan, tried out for 120 days on the real course with the real code (pathLesson, todaysSet,
// dueSentences, grade). Prints one table row per learner:  node tools/simulate-review.mjs
// tests/unit/srs.test.js runs the same simulation and holds the plan to its promises.
//
// The learner is a model, not a person: every card is known with a fixed chance, whatever its age (the model the
// QA review of the schedule used). It can show whether the load fits into the day; it cannot show how well
// anything is remembered.
import { fileURLToPath } from 'node:url';
import { loadContent } from './content.mjs';
import { blank } from '../src/js/store.js';
import { pathLesson, todaysSet, dueSentences, lessonOrder } from '../src/js/learn.js';
import { grade, answered, INTERVALS, LESSON_BOX, SESSION_MAX } from '../src/js/srs.js';

// chance of «بلد بودم»: pReview for a review card (0.1 less in boxes 0–1), pPhrase for a lesson sentence at its
// first return, pNew for a new word by level (it was already known), pHard the share of lesson sentences that
// needed another try inside the lesson
export const RECALL = {
  65: { pReview: 0.65, pPhrase: 0.55, pNew: [0, 0.25, 0.1, 0.05], pHard: 0.25 },
  80: { pReview: 0.8, pPhrase: 0.7, pNew: [0, 0.4, 0.15, 0.1], pHard: 0.25 },
  92: { pReview: 0.92, pPhrase: 0.92, pNew: [0, 0.6, 0.3, 0.2], pHard: 0 },
};
export const everyDay = () => true;
export const fourAWeek = (day) => [1, 2, 4, 6].includes(((day - 1) % 7) + 1);
const rng = (seed) => { let s = seed; return () => ((s = (s * 48271) % 2147483647) / 2147483647); };

// lessonDays(day): is a lesson done that day?   sittings: review sets done a day (the plan is two)
// warm: questions on earlier sentences that open each lesson (views/lesson.js asks up to three)
export function simulate(content, { lessonDays = fourAWeek, sittings = 1, recall = 80, days = 120, seed = 7, warm = 3 } = {}) {
  const R = RECALL[recall], rnd = rng(seed), byId = new Map(content.vocab.map((w) => [w.id, w]));
  const s = blank(); s.onboard.done = true;
  const log = [], metDay = {};
  let peak = 0, biggestSet = 0;
  for (let day = 1; day <= days; day++) {
    let cards = 0, sets = 0, lesson = null;
    if (lessonDays(day)) {
      const id = pathLesson(s, content);
      if (id) {
        if (warm) {
          // the questions that open a lesson: sentences that are due and, while places are left, the sentences not
          // practised for the longest time (a right answer before its day changes nothing; a miss brings it back tomorrow)
          const keys = dueSentences(s, content, day, warm, id).map((x) => x.key);
          const since = (e) => e.l ?? e.d - (INTERVALS[e.b] || 0);
          const rest = Object.keys(s.srs).filter((k) => k.startsWith('p:') && !keys.includes(k)).sort((x, y) => since(s.srs[x]) - since(s.srs[y]));
          for (const k of [...keys, ...rest].slice(0, warm)) s.srs[k] = grade(s.srs[k], rnd() < R.pReview, day);
        }
        lesson = id; s.done[id] = { t: day, n: 1 };
        // what views/lesson.js does when a lesson is finished
        for (const p of content.lessons[id].phrases) { const k = `p:${id}:${p.id}`; if (!s.srs[k]) s.srs[k] = rnd() < R.pHard ? { b: 0, d: day, n: 0 } : { b: LESSON_BOX, d: day + INTERVALS[LESSON_BOX], n: 0 }; }
      }
    }
    for (let k = 0; k < sittings; k++) {
      const q = todaysSet(s, content, day);
      if (!q.queue.length) break;
      sets++; biggestSet = Math.max(biggestSet, q.queue.length);
      const again = [];
      for (const id of q.queue) {
        const isNew = !s.srs[id], w = byId.get(id);
        const p = isNew ? R.pNew[w ? w.level : 1] : id.startsWith('p:') && s.srs[id].n === 0 ? R.pPhrase : s.srs[id].b <= 1 ? Math.max(0.5, R.pReview - 0.1) : R.pReview;
        const knew = rnd() < p;
        s.srs[id] = grade(s.srs[id], knew, day);
        s.newDay = answered(s.newDay, day, isNew);
        if (isNew) metDay[id] = day;
        if (!knew) again.push(id);
        cards++;
      }
      for (const id of again) { s.srs[id] = grade(s.srs[id], rnd() < 0.8, day); cards++; }      // the repeat at the end of the set
    }
    const due = Object.values(s.srs).filter((e) => e.d <= day);
    const words = Object.keys(s.srs).filter((k) => !k.startsWith('p:'));
    peak = Math.max(peak, due.length);
    log.push({ day, lesson, cards, sets, waiting: due.length, recentWaiting: due.filter((e) => e.b <= 2).length, longestWait: Math.max(0, ...due.map((e) => day - e.d)), late30: due.filter((e) => day - e.d >= 30).length,
      words: words.length, sentences: Object.keys(s.srs).length - words.length, lessons: Object.keys(s.done).length });
  }
  const firstListDay = Math.max(...content.wordsFirst.map((id) => metDay[id] ?? Infinity));
  const dayOf = (en) => metDay[(content.vocab.find((w) => w.en === en) || {}).id] ?? null;
  return { log, state: s, metDay, peak, biggestSet, firstListDay, dayOf, longestWait: Math.max(...log.map((x) => x.longestWait)) };
}

const WORDS = ['fifteen', 'Monday', 'appointment', 'pharmacy', 'March'];
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const content = JSON.parse(JSON.stringify(loadContent()));
  console.log(`course: ${lessonOrder(content).length} lessons, ${content.vocab.length} words (${content.wordsFirst.length} in the first list); a set is ${SESSION_MAX} cards\n`);
  console.log('| Learner (120 days) | Words met by day 30 / 60 / 90 / 120 | Cards a day in month 1 / 2 / 3 / 4 (repeats included) | Waiting after the day\'s review, day 30 / 60 / 90 / 120 | Most ever waiting | Longest anything waited (days) | 30+ days late on day 120 | First list complete on day | First card for fifteen / Monday / appointment / pharmacy / March | Lessons done / sentences in review |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const [name, lessonDays] of [['4 lessons a week', fourAWeek], ['1 lesson a day', everyDay]]) for (const sittings of [1, 2]) for (const recall of [65, 80, 92]) {
    const r = simulate(content, { lessonDays, sittings, recall });
    const at = (d) => r.log[d - 1];
    const avg = (a, b) => { const xs = r.log.filter((x) => x.day >= a && x.day <= b); return Math.round(xs.reduce((t, x) => t + x.cards, 0) / xs.length); };
    console.log(`| ${name}, ${sittings === 1 ? 'one sitting' : 'two sittings'}, recall ${recall}% | ${[30, 60, 90, 120].map((d) => at(d).words).join(' / ')} | ${[[1, 30], [31, 60], [61, 90], [91, 120]].map(([a, b]) => avg(a, b)).join(' / ')} | ${[30, 60, 90, 120].map((d) => at(d).waiting).join(' / ')} | ${r.peak} | ${r.longestWait} | ${at(120).late30} | ${Number.isFinite(r.firstListDay) ? r.firstListDay : 'not within 120'} | ${WORDS.map((w) => r.dayOf(w) ?? '—').join(' / ')} | ${at(120).lessons} / ${at(120).sentences} |`);
  }
}
