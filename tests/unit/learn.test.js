import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../../tools/content.mjs';
import { blank } from '../../src/js/store.js';
import { grade, INTERVALS, LESSON_BOX, NEW_RESERVED, SESSION_MAX } from '../../src/js/srs.js';
import { createStore, migrate, today, DAY } from '../../src/js/store.js';
import { todayOffer, afterPath, checkpointDue, checkpointMark, checkpointLessons, checkpointPlan, missionDue, canDoList, laterChoice, doneLessons, missesOf, CHECK_EVERY, CHECK_HEAR, CHECK_SAY, REPEAT_REST, MISSION_WAIT, MISSION_KEEP } from '../../src/js/learn.js';
import { numberWord, ordinalWord, ordinalDigits, yearWords, parseBorn, formatBorn, bornComplete, daysIn, ageOn, nameParts, spellOut, phoneParts, ownLines, ownMissing, ownPieces, MONTHS, YEARS, CARRIERS, OWN_KINDS, ownVersion, ownItem, ownReplies, CARRIERS_MORE } from '../../src/js/own.js';
import { audioRequests } from '../../tools/content.mjs';
import { enNumber, enOrdinal, enYear } from '../../tools/spoken.mjs';
import { lessonOrder, resumeId, pathLesson, nextLesson, scenarioStart, reviewPool, lessonWords, todaysSet, dueSentences, inTurns, TURN, shortPhrases, partnerLines, gistCount, gistTargets, numberRound, shuffle, mix } from '../../src/js/learn.js';

// the real curriculum, exactly as the app receives it
const content = JSON.parse(JSON.stringify(loadContent()));
const order = lessonOrder(content);
const stageOf = (id) => content.lessons[id].stage;
const fresh = (onboard = {}) => { const s = blank(); Object.assign(s.onboard, { done: true }, onboard); return s; };
const finish = (s, ...ids) => { for (const id of ids) s.done[id] = { t: 1, n: 1 }; return s; };
// follow "Today's lesson" until nothing is left
const walk = (s, n = 999) => { const seen = []; for (let i = 0; i < n; i++) { const id = pathLesson(s, content); if (!id) break; seen.push(id); finish(s, id); } return seen; };

test('content: every lesson has the stage of the curriculum list it is in, and the essentials are known', () => {
  for (const st of content.stages) for (const id of st.lessons) assert.equal(content.lessons[id].stage, st.id, id);
  assert.ok(content.essentials.length >= 3);
  assert.deepEqual(content.essentials.slice(0, 2), content.stages[0].lessons.slice(0, 2));
  assert.ok(content.essentials.some((id) => content.lessons[id].scenario === 'emergency'), 'the 911 lesson is one of the essentials');
  for (const id of content.essentials) assert.equal(stageOf(id), 1);
  // the learner's own name, numbers, address and date of birth are asked for in the first clinic lesson: nobody skips them
  for (const id of ['my-numbers', 'my-name', 'my-address-birthday']) assert.ok(content.essentials.includes(id), id);
  assert.equal(new Set(content.essentials).size, content.essentials.length);
});

test('content: a conversation is as easy as the easiest lesson that leads to it', () => {
  for (const R of content.roleplays) {
    const from = Object.keys(content.practiceAll).filter((id) => content.practiceAll[id].includes(R.id)).map(stageOf);
    if (from.length) assert.equal(R.stage, Math.min(...from), R.id);
    assert.ok([1, 2, 3].includes(R.stage), R.id);
  }
  // every lesson that offers a conversation offers one that exists and is not harder than the lesson
  for (const [lid, rid] of Object.entries(content.practice)) {
    const R = content.roleplays.find((r) => r.id === rid);
    assert.ok(R, `${lid} -> ${rid}`);
    assert.ok(R.stage <= stageOf(lid), `${lid} (stage ${stageOf(lid)}) offers ${rid} (stage ${R.stage})`);
  }
  // a lesson may lead to several conversations; the first is the main one (content.practice), all are in content.practiceAll
  for (const [lid, list] of Object.entries(content.practiceAll)) {
    assert.equal(list[0], content.practice[lid], lid);
    assert.equal(new Set(list).size, list.length, lid);
    for (const rid of list) { const R = content.roleplays.find((r) => r.id === rid); assert.ok(R && R.stage <= stageOf(lid), `${lid} -> ${rid}`); }
  }
  assert.deepEqual(Object.keys(content.practice), Object.keys(content.practiceAll));
  assert.ok(Object.values(content.practiceAll).some((l) => l.length > 1), 'some lesson leads to two conversations');
  // every conversation can be reached from a lesson
  const linked = new Set(Object.values(content.practiceAll).flat());
  assert.deepEqual(content.roleplays.filter((r) => !linked.has(r.id)).map((r) => r.id), []);
});

test('path: the essentials come first for everyone, whatever they answered', () => {
  for (const level of ['none', 'little', 'some']) {
    for (const scenario of ['', ...content.scenarios.map((sc) => sc.id)]) {
      const first = walk(fresh({ level, scenario }), content.essentials.length);
      assert.deepEqual(first, content.essentials, `level ${level}, scenario ${scenario || '(none)'}`);
    }
  }
});

test('path: a beginner is never started on a stage 2 or 3 lesson', () => {
  for (const level of ['none', 'little']) {
    for (const scenario of ['', ...content.scenarios.map((sc) => sc.id)]) {
      const all = walk(fresh({ level, scenario }));
      assert.equal(all.length, order.length, 'every lesson is reached exactly once');
      assert.equal(new Set(all).size, order.length);
      const firstHarder = all.findIndex((id) => stageOf(id) > 1);
      const stage1 = order.filter((id) => stageOf(id) === 1).length;
      assert.equal(firstHarder, stage1, `level ${level}, scenario ${scenario}: a stage ${stageOf(all[firstHarder])} lesson (${all[firstHarder]}) came before stage 1 was finished`);
    }
  }
});

test('path: the chosen situation comes right after the essentials when it has a lesson of the learner\'s stage', () => {
  const n = content.essentials.length;
  for (const sc of content.scenarios) {
    for (const [level, from] of [['none', 1], ['some', 2]]) {
      const s = fresh({ level, scenario: sc.id });
      const all = walk(s, n + 1);
      const mine = order.filter((id) => content.lessons[id].scenario === sc.id && !content.essentials.includes(id));
      const pick = mine.find((id) => stageOf(id) <= from);
      const want = scenarioStart(fresh({ level, scenario: sc.id }), content);
      if (pick) { assert.equal(all[n], pick, `${sc.id}/${level}`); assert.equal(want, 'now'); }
      else { assert.ok(stageOf(all[n]) <= from || level === 'some', `${sc.id}/${level}: got ${all[n]}`); }
      if (!order.some((id) => content.lessons[id].scenario === sc.id && stageOf(id) <= from)) assert.equal(want, 'later', sc.id);
    }
  }
  assert.equal(scenarioStart(fresh(), content), 'none');
});

test('path: "I understand simple sentences" starts at stage 2 after the essentials — but never passes over a safety lesson, or prices and times — and returns to stage 1 at the end', () => {
  const all = walk(fresh({ level: 'some' }));
  const n = content.essentials.length;
  assert.equal(new Set(all).size, order.length);
  assert.equal(all.length, order.length);
  // right after the essentials: the stage 1 lessons about safety (the scam call, the stranger at the door) and those that
  // later lessons take for granted (curriculum.json "always": the checkout's prices, the days and times), in their order
  assert.deepEqual(content.always, ['store-checkout', 'basics-time']);
  const safety = order.filter((id) => stageOf(id) === 1 && (content.lessons[id].safetyCritical || content.always.includes(id)) && !content.essentials.includes(id));
  assert.ok(safety.includes('scam-call') && safety.includes('at-the-door'), 'the two stage 1 safety lessons are flagged safetyCritical');
  assert.ok(all.indexOf('store-checkout') < all.indexOf('card-reader') && all.indexOf('basics-time') < all.indexOf('phone-appointment'), 'prices before the card reader, weekdays before the phone appointment (QA round 3, L6)');
  assert.deepEqual(all.slice(n, n + safety.length), safety);
  // then stage 2 and 3 in order, and the rest of stage 1 at the very end
  assert.equal(stageOf(all[n + safety.length]), 2);
  const rest = order.filter((id) => stageOf(id) === 1 && !content.essentials.includes(id) && !safety.includes(id));
  assert.deepEqual(all.slice(-rest.length), rest);
  assert.deepEqual(all.slice(n + safety.length, -rest.length), order.filter((id) => stageOf(id) > 1));
});

test('path: whatever the three first-run answers, the personal-details lessons are among the first six and no safety lesson of the learner\'s stage or an earlier one waits behind a later stage', () => {
  for (const level of ['none', 'little', 'some']) {
    for (const scenario of ['', ...content.scenarios.map((sc) => sc.id)]) {
      for (const focus of ['both', 'listen']) {
        const all = walk(fresh({ level, scenario, focus }));
        const where = `level ${level}, scenario ${scenario || '(none)'}, focus ${focus}`;
        assert.equal(all.length, order.length, where);
        for (const id of ['my-numbers', 'my-name', 'my-address-birthday', 'emergency-911']) assert.ok(all.indexOf(id) < 6, `${where}: ${id} is lesson ${all.indexOf(id) + 1}`);
        // every stage 1 safety lesson is done before the first lesson of stage 3, and (one chosen-situation lesson aside) before stage 2
        const firstOf = (st) => all.findIndex((id) => stageOf(id) === st);
        const stage2 = all.map((id, i) => (stageOf(id) === 2 ? i : -1)).filter((i) => i >= 0);
        for (const id of order.filter((x) => stageOf(x) === 1 && content.lessons[x].safetyCritical)) {
          assert.ok(all.indexOf(id) < firstOf(3), `${where}: ${id} comes after a stage 3 lesson`);
          assert.ok(all.indexOf(id) < stage2[1], `${where}: ${id} comes after two stage 2 lessons`);
        }
        assert.ok(all.indexOf('scam-call') <= content.essentials.length + 14, `${where}: the scam lesson is lesson ${all.indexOf('scam-call') + 1}`);
      }
    }
  }
});

test('path: «این درس الان به کارم نمی‌آید» moves a lesson to the end; said again there, it is no longer offered', () => {
  const s3 = order.filter((id) => stageOf(id) === 3);
  const s = finish(fresh(), ...order.filter((id) => stageOf(id) < 3));
  assert.equal(pathLesson(s, content), s3[0]);
  // only lessons of the last stage that are not finished can be set aside
  assert.equal(laterChoice(s, content, order[0]), null);
  assert.equal(laterChoice(fresh(), content, order[0]), null);
  assert.equal(laterChoice(s, content, 'constructor'), null);
  assert.deepEqual(laterChoice(s, content, s3[0]), { act: 'later', set: 1 });
  s.later[s3[0]] = 1; s.later[s3[2]] = 1;
  assert.equal(pathLesson(s, content), s3[1]);
  assert.deepEqual(laterChoice(s, content, s3[0]), { act: 'back', set: 0 }, 'while other lessons are left, the screen offers to bring it back');
  const all = walk(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(all, [...s3.filter((id) => id !== s3[0] && id !== s3[2]), s3[0], s3[2]], 'the two lessons set aside come last, in their order');
  // at the end the path comes back to it: it can be done, or set aside for good
  finish(s, ...s3.filter((id) => id !== s3[0] && id !== s3[2]));
  assert.equal(pathLesson(s, content), s3[0]);
  assert.deepEqual(todayOffer(s, content), { kind: 'checkpoint' });
  s.cp = checkpointMark(s, content);
  assert.deepEqual(todayOffer(s, content), { kind: 'lesson', id: s3[0] });
  assert.deepEqual(laterChoice(s, content, s3[0]), { act: 'later', set: 2 });
  s.later[s3[0]] = 2;
  assert.equal(pathLesson(s, content), s3[2]);
  assert.deepEqual(laterChoice(s, content, s3[0]), { act: 'back', set: 0 });
  s.later[s3[2]] = 2;
  assert.equal(pathLesson(s, content), null, 'nothing new is left to offer');
  assert.ok(['repeat', 'talk'].includes(todayOffer(s, content, 50 * DAY).kind), 'but «درس امروز» still offers something');
  // bringing one back puts it on the path again; a finished lesson is never "set aside"
  delete s.later[s3[0]];
  assert.equal(pathLesson(s, content), s3[0]);
  finish(s, s3[0]);
  assert.equal(laterChoice(s, content, s3[0]), null);
  // an essential lesson is never passed over, even if damaged storage says so
  const odd = fresh(); odd.later[order[0]] = 1;
  assert.equal(pathLesson(odd, content), order[0]);
});

test('resume: each lesson keeps its own place; the home screen continues the unfinished one', () => {
  const [a, b, c] = order;
  const s = fresh();
  assert.deepEqual(nextLesson(s, content), { id: a });
  s.at[a] = { pos: 8, short: false, t: 100 };
  assert.deepEqual(nextLesson(s, content), { id: a, resume: true });
  // looking at another lesson (no entry) or at a finished one changes nothing
  finish(s, c);
  assert.deepEqual(nextLesson(s, content), { id: a, resume: true });
  // repeating a finished lesson half-way keeps its place but does not take over "today's lesson"
  s.at[c] = { pos: 5, short: false, t: 300 };
  assert.equal(resumeId(s, content), a);
  // really starting another unfinished lesson: the most recent one is offered, and the first is still there afterwards
  s.at[b] = { pos: 3, short: true, t: 200 };
  assert.deepEqual(nextLesson(s, content), { id: b, resume: true });
  assert.equal(s.at[a].pos, 8);
  finish(s, b); delete s.at[b];
  assert.deepEqual(nextLesson(s, content), { id: a, resume: true });
  // a place in a lesson that no longer exists is ignored — also when damaged storage names something every object has
  const t = fresh(); t.at['no-such-lesson'] = { pos: 4, short: false, t: 1 }; t.at.constructor = { pos: 4, short: false, t: 9 }; t.at.toString = null;
  assert.deepEqual(nextLesson(t, content), { id: a });
  assert.deepEqual(todayOffer(t, content), { kind: 'lesson', id: a });
  // when everything is done there is nothing to offer
  assert.equal(nextLesson(finish(fresh(), ...order), content), null);
});

test('short lesson: its three sentences always include the answer to a real-world task', () => {
  let swapped = 0;
  for (const L of Object.values(content.lessons)) {
    const ph = shortPhrases(L);
    assert.equal(ph.length, 3, L.id);
    assert.equal(new Set(ph.map((p) => p.id)).size, 3, L.id);
    assert.ok(L.task.some((t) => ph.some((p) => p.id === t.answer)), `${L.id}: no task can be asked in short mode`);
    assert.deepEqual(ph.slice(0, 2), L.phrases.slice(0, 2), L.id);
    if (ph[2] !== L.phrases[2]) swapped++;
  }
  assert.ok(swapped > 0, 'some lessons need the swap (their tasks are about sentence 4 or 5)');
});

// ---- which new words come next (content/review-order.json + reviewPool) ---------------------------------
const word = (id) => content.vocab.find((w) => w.id === id);
const wordsOnly = (pool) => pool.filter((id) => !id.startsWith('p:'));
// one day of review: the learner meets the next n new words
const meet = (s, n = 6) => { const got = wordsOnly(reviewPool(s, content)).filter((id) => !s.srs[id]).slice(0, n); for (const id of got) s.srs[id] = { b: 1, d: 1, n: 1 }; return got; };

test('review pool: only the sentences the learner has seen', () => {
  const s = fresh();
  assert.ok(reviewPool(s, content).length > 0 && reviewPool(s, content).every((id) => !id.startsWith('p:')));
  // a short lesson: three of its five sentences were seen and queued
  const L = content.lessons[order[0]];
  finish(s, L.id);
  for (const p of shortPhrases(L)) s.srs[`p:${L.id}:${p.id}`] = { b: 1, d: 5, n: 0 };
  assert.deepEqual(reviewPool(s, content).filter((id) => id.startsWith('p:')), shortPhrases(L).map((p) => `p:${L.id}:${p.id}`));
});

test('new words: the most useful everyday words come first for everyone, in the order of review-order.json', () => {
  const first = content.wordsFirst;
  assert.ok(first.length >= 60 && first.length % 6 === 0, 'whole lines of six words');
  assert.equal(new Set(first).size, first.length);
  for (const id of first) assert.equal(word(id).level, 1, word(id).en);
  const names = first.map((id) => word(id).en);
  assert.deepEqual(names.slice(0, 6), ['hello', 'goodbye', 'please', 'thank you', 'yes', 'no']);
  for (const w of ['help', 'water', 'milk', 'bread', 'doctor', 'bathroom', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']) assert.ok(names.includes(w), `"${w}" is one of the first words`);
  // what the first lessons use and no lesson teaches one by one: the teens and tens of prices and times, the days, the months
  for (const w of ['eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'fifty', 'one hundred',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
    'appointment', 'pharmacy', 'interpreter', 'receipt', 'address', 'last name']) assert.ok(names.includes(w), `"${w}" is one of the first words`);
  assert.ok(names.indexOf('fifteen') < 42 && names.indexOf('Monday') < 60 && names.indexOf('appointment') < 72, 'numbers, then days, then the appointment');
  assert.equal(word(first[names.indexOf('I')]).cat, 'little', '"I" in the list is the word, not the letter');
  // whatever the learner has done: nothing, a few lessons, or the whole first stage
  const stage1 = order.filter((id) => stageOf(id) === 1);
  for (const done of [[], order.slice(0, 4), stage1, order]) {
    const got = wordsOnly(reviewPool(finish(fresh(), ...done), content));
    assert.deepEqual(got.slice(0, first.length), first, `${done.length} lessons done`);
  }
  // the first day is one theme, and a beginner only meets level 1 words
  const pool = reviewPool(fresh(), content);
  assert.equal(new Set(pool.slice(0, 6).map((id) => word(id).cat)).size, 1);
  assert.ok(pool.every((id) => word(id).level === 1), 'a beginner only meets level 1 words');
});

// the words of the finished lessons that come straight after the first words (reviewPool step 2a)
const lessonWordsOf = (s, ids) => { const stage = Math.max(...wordsOnly(reviewPool(s, content)).map((id) => word(id).level)); return new Set(ids.flatMap((id) => lessonWords(content, id)).filter((id) => !content.wordsFirst.includes(id) && word(id).level <= stage && word(id).cat !== 'letters')); };

test('new words: a lesson\'s own words are the words of its sentences and dialogue — not the small words every lesson has', () => {
  const en = (id) => lessonWords(content, id).map((w) => word(w).en);
  if (content.lessons['pharmacy-problems']) for (const w of ['prescription', 'refill']) assert.ok(en('pharmacy-problems').includes(w), w);
  if (content.lessons['bus-transfer']) for (const w of ['transfer', 'across the street']) assert.ok(en('bus-transfer').includes(w), w);
  for (const id of order) for (const w of lessonWords(content, id)) { assert.ok(word(w).en.length > 2, word(w).en); assert.notEqual(word(w).cat, 'little'); }
  assert.deepEqual(lessonWords(content, 'no-such-lesson'), []);
});

test('new words: after the first words come the finished lessons\' own words, the last lesson first; then the groups take turns, three words each — finished lessons first', () => {
  assert.deepEqual(inTurns([[1, 2, 3, 4, 5], [6], [7, 8, 9, 10]]), [1, 2, 3, 6, 7, 8, 9, 4, 5, 10]);
  const done = order.slice(0, 8);
  const s = finish(fresh(), ...done);
  const mine = lessonWordsOf(s, done);
  const after = wordsOnly(reviewPool(s, content)).slice(content.wordsFirst.length);
  // the lessons' own words first …
  const nMine = after.findIndex((id) => !mine.has(id));
  assert.equal(nMine, mine.size);
  assert.ok(after.slice(nMine).every((id) => !mine.has(id)));
  // … the lesson finished last first (all were finished at the same moment here: the later in the path counts as later)
  const newest = done[done.length - 1];
  const own = lessonWords(content, newest).filter((id) => mine.has(id));
  assert.deepEqual(after.slice(0, own.length), own);
  // then the groups: those of the finished lessons before every other group, the lesson finished last first
  const lead = [...new Set(done.slice().reverse().flatMap((id) => content.wordsAfter[id] || []))];
  assert.ok(lead.length >= 6, 'the first lessons each bring a word group');
  const level1 = after.slice(nMine).filter((id) => word(id).level === 1);
  const nLead = level1.filter((id) => lead.includes(word(id).cat)).length;
  assert.ok(level1.slice(0, nLead).every((id) => lead.includes(word(id).cat)));
  assert.ok(level1.slice(nLead).every((id) => !lead.includes(word(id).cat)));
  // … and no group gives more than three words before another has its turn
  const turn = level1.slice(0, nLead).map((id) => word(id).cat);
  const left = lead.filter((c) => turn.includes(c));          // (a group may already be used up by the first words)
  assert.ok(left.length >= 3);
  assert.deepEqual(turn.filter((c, i) => i === 0 || turn[i - 1] !== c).slice(0, left.length), left);
  turn.forEach((c, i) => { if (i >= TURN && turn.slice(i - TURN, i).every((x) => x === c)) assert.ok(turn.slice(i).every((x) => x === c), `more than ${TURN} "${c}" words in a row while other groups are waiting`); });
  // a group keeps its own order (the order of vocabulary.json)
  for (const c of left) assert.deepEqual(level1.filter((id) => word(id).cat === c), content.vocab.filter((w) => w.cat === c && w.level === 1 && !content.wordsFirst.includes(w.id) && !mine.has(w.id)).map((w) => w.id), c);
  // every word is still in the pool exactly once
  const all = wordsOnly(reviewPool(s, content));
  assert.equal(new Set(all).size, all.length);
});

test('new words: the words of a lesson just finished arrive straight away — its own words, then its word group', () => {
  // a learner in the second stage who has met about two hundred words and now does the lesson about pharmacy problems
  const lesson = content.lessons['pharmacy-problems'] ? 'pharmacy-problems' : order[order.length - 1];
  const before = order.slice(0, order.indexOf(lesson)).filter((id) => stageOf(id) <= stageOf(lesson));
  const s = finish(fresh(), ...before);
  for (let day = 0; day < 33; day++) meet(s);
  const own = lessonWords(content, lesson);
  const unmet = own.filter((id) => !s.srs[id] && !content.wordsFirst.includes(id) && word(id).level <= stageOf(lesson));
  assert.ok(unmet.length >= 2, 'the lesson has words the learner has not met');
  s.done[lesson] = { t: 2, n: 1 };
  const next = meet(s);
  assert.deepEqual(next.slice(0, Math.min(6, unmet.length)), unmet.slice(0, 6), next.map((id) => word(id).en).join(', '));
  if (lesson === 'pharmacy-problems') assert.ok(next.map((id) => word(id).en).includes('refill'), 'refill comes the day after the lesson (QA round 3: it used to come at place 528)');
  // the clothes lesson: its word group comes before the groups of earlier lessons
  const clothes = Object.keys(content.wordsAfter).find((id) => content.wordsAfter[id].includes('clothes'));
  const c = finish(fresh(), ...order.slice(0, order.indexOf(clothes)));
  for (let day = 0; day < 33; day++) meet(c);
  assert.ok(!meet({ ...c, srs: { ...c.srs } }).some((id) => word(id).cat === 'clothes'), 'not before the lesson');
  c.done[clothes] = { t: 2, n: 1 };
  const mineNow = lessonWordsOf(c, [clothes]);
  const groups = wordsOnly(reviewPool(c, content)).filter((id) => !c.srs[id] && !mineNow.has(id) && !lessonWordsOf(c, Object.keys(c.done)).has(id));
  assert.equal(word(groups[0]).cat, 'clothes', groups.slice(0, 6).map((id) => word(id).en).join(', '));
});

test('new words: easier words first — no level 2 word before a level 1 word, no rare word before a basic one (the lessons\' own words aside)', () => {
  const stage1 = order.filter((id) => stageOf(id) === 1);
  const s = finish(fresh(), ...stage1);
  const mine = lessonWordsOf(s, stage1);
  // (the alphabet is left out here: it comes after everything else — see the next test)
  const u = wordsOnly(reviewPool(s, content)).filter((id) => word(id).cat !== 'letters' && !mine.has(id));
  assert.ok(u.some((id) => word(id).level === 2), 'level 2 words open up in stage 2');
  assert.ok(u.every((id) => word(id).level <= 2));
  const firstHard = u.findIndex((id) => word(id).level === 2);
  assert.ok(u.slice(firstHard).every((id) => word(id).level === 2), 'all level 1 words come before the first level 2 word');
  const all1 = wordsOnly(reviewPool(s, content));
  const at = (en) => all1.findIndex((id) => word(id).en === en);
  for (const rare of ['passport', 'Medicare']) for (const basic of ['water', 'milk', 'today', 'left', 'door', 'bus', 'cold']) assert.ok(at(basic) >= 0 && at(basic) < at(rare), `${basic} before ${rare}`);
  // every word is in the pool exactly once at the end
  const all = wordsOnly(reviewPool(finish(fresh(), ...order), content));
  assert.equal(all.length, content.vocab.length);
  assert.equal(new Set(all).size, content.vocab.length);
  // someone who began at stage 2 and returns to the skipped stage 1 lessons keeps the harder words they have met
  const back = fresh({ level: 'some' });
  finish(back, ...order.filter((id) => stageOf(id) > 1), ...content.essentials);
  assert.equal(stageOf(pathLesson(back, content)), 1);
  assert.ok(reviewPool(back, content).some((id) => word(id).level === 3));
});

test('new words: the alphabet comes last — 26 letter cards never hold up a useful word', () => {
  assert.deepEqual(content.vocabCats.filter((c) => c.last).map((c) => c.id), ['letters']);
  assert.ok(!Object.values(content.wordsAfter).flat().includes('letters'), 'no lesson brings the alphabet into review');
  const letters = content.vocab.filter((w) => w.cat === 'letters').map((w) => w.en);
  assert.deepEqual(letters, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), 'all 26, in alphabetical order (I is at the end of the file)');
  const isLetter = (id) => word(id).cat === 'letters';
  // whatever has been done — nothing, the spelling lesson, the first stage, everything — the letters are the very last cards
  for (const done of [[], order.slice(0, order.indexOf('my-name') + 1), order.filter((id) => stageOf(id) === 1), order]) {
    const u = wordsOnly(reviewPool(finish(fresh(), ...done), content));
    assert.equal(u.filter(isLetter).length, 26);
    assert.ok(u.slice(-26).every(isLetter), `${done.length} lessons done: a letter comes before an ordinary word`);
    assert.deepEqual(u.slice(-26).map((id) => word(id).en), letters, 'A to Z in order');
  }
});

// ---- the day's sets and the questions that open a lesson -------------------------------------------------
test('today\'s set: the first words have three places a day whatever is waiting; later words wait for a free place', () => {
  const s = fresh();
  // nothing learned yet: the first set is the first line of the first words
  const q1 = todaysSet(s, content, 100);
  assert.deepEqual(q1.queue, content.wordsFirst.slice(0, 6));
  assert.equal(q1.set, 1);
  // forty sentences waiting: still three first words, at the end of the set
  finish(s, ...order.slice(0, 8));
  for (const id of order.slice(0, 8)) for (const p of content.lessons[id].phrases) s.srs[`p:${id}:${p.id}`] = { b: 2, d: 95, n: 0 };
  const q2 = todaysSet(s, content, 100);
  assert.equal(q2.queue.length, SESSION_MAX);
  assert.deepEqual(q2.queue.slice(-NEW_RESERVED), content.wordsFirst.slice(0, NEW_RESERVED));
  assert.ok(q2.more > 0);
  // once every first word has been met, new words come only when the reviews leave room
  for (const id of content.wordsFirst) s.srs[id] = { b: 4, d: 130, n: 3, l: 100 };
  const q3 = todaysSet(s, content, 100);
  assert.equal(q3.nNew, 0);
  assert.equal(q3.queue.length, SESSION_MAX);
  for (const k of Object.keys(s.srs)) if (k.startsWith('p:')) s.srs[k].d = 140;      // caught up
  const q4 = todaysSet(s, content, 100);
  assert.equal(q4.nDue, 0);
  assert.equal(q4.nNew, 6);
  assert.ok(q4.queue.every((id) => !content.wordsFirst.includes(id) && word(id).level === 1));
});

test('questions that open a lesson: sentences that are due, the longest-waiting first, and an answer counts as the review', () => {
  const s = fresh();
  const [a, b, c] = order;
  assert.deepEqual(dueSentences(s, content, 100), []);
  finish(s, a, b);
  const key = (id, i) => `p:${id}:${content.lessons[id].phrases[i].id}`;
  for (const id of [a, b]) content.lessons[id].phrases.forEach((p, i) => { s.srs[key(id, i)] = { b: LESSON_BOX, d: 100 + i, n: 0 }; });
  s.srs[key(b, 0)] = { b: 1, d: 97, n: 2, l: 96 };                       // waiting longest
  s.srs[key(c, 0)] = { b: 2, d: 90, n: 0 };                              // a lesson that is not finished: never asked
  const got = dueSentences(s, content, 101, 3);
  assert.deepEqual(got.map((x) => x.key), [key(b, 0), key(a, 0), key(a, 1)]);
  assert.deepEqual(got[0], { key: key(b, 0), lesson: b, phrase: content.lessons[b].phrases[0] });
  // the lesson being opened is left out; n limits the number; nothing that is not due yet
  assert.deepEqual(dueSentences(s, content, 101, 3, a).map((x) => x.key), [key(b, 0), key(b, 1)]);
  assert.equal(dueSentences(s, content, 101, 1).length, 1);
  // (a sentence with the sample person's own details is never asked this way: "My name is Maryam.")
  const plain = [a, b].flatMap((id) => content.lessons[id].phrases.filter((p) => !(p.own && p.own.length)));
  assert.ok(plain.length < 10, 'the first lessons have a sentence with the sample person in it');
  assert.equal(dueSentences(s, content, 104, 99).length, plain.length);
  // answered in the lesson: graded like a card, so it is no longer due and the day's set does not show it again
  const before = todaysSet(s, content, 101).queue;
  assert.ok(before.includes(key(a, 0)));
  s.srs[key(a, 0)] = grade(s.srs[key(a, 0)], true, 101);
  assert.equal(s.srs[key(a, 0)].d, 101 + INTERVALS[LESSON_BOX + 1]);
  assert.ok(!todaysSet(s, content, 101).queue.includes(key(a, 0)));
  assert.ok(!dueSentences(s, content, 101, 9).some((x) => x.key === key(a, 0)));
});

test('"what did they say?": lessons ask it with three different meanings to choose from', () => {
  let withQuestion = 0;
  for (const L of Object.values(content.lessons)) {
    const lines = partnerLines(L);
    assert.ok(lines.every((l) => l.who === 'them'));
    assert.equal(new Set(lines.map((l) => l.fa)).size, lines.length, L.id);
    assert.equal(new Set(lines.map((l) => l.en)).size, lines.length, L.id);
    // a lesson whose dialogue gives the other person fewer than three different lines gets no question (the validator warns)
    assert.equal(gistCount(L, false), lines.length >= 3 ? 2 : 0, L.id);
    assert.equal(gistCount(L, true), lines.length >= 3 ? 1 : 0, L.id);
    if (lines.length >= 3) withQuestion++;
    const targets = gistTargets(L, 0.42);
    assert.equal(targets.length, lines.length);
    assert.deepEqual(gistTargets(L, 0.42), targets, 'the same attempt asks the same lines');
    // lines the learner was taught to say themselves are asked last
    const taught = new Set(L.phrases.map((p) => p.en));
    const firstTaught = targets.findIndex((l) => taught.has(l.en));
    if (firstTaught >= 0) assert.ok(targets.slice(firstTaught).every((l) => taught.has(l.en) || l.en.split(/\s+/).length < 3), L.id);
  }
  assert.ok(withQuestion >= Object.keys(content.lessons).length * 0.9, `only ${withQuestion} lessons can ask "what did they say?"`);
  // fewer than three different lines: no question at all
  const tiny = { phrases: [], dialogue: { lines: [{ who: 'them', en: 'Hi.', fa: 'سلام.' }, { who: 'you', en: 'Hi.', fa: 'سلام.' }, { who: 'them', en: 'Hi.', fa: 'سلام.' }, { who: 'them', en: 'Bye.', fa: 'خداحافظ.' }] } };
  assert.equal(partnerLines(tiny).length, 2);
  assert.equal(gistCount(tiny, false), 0);
});

test('hearing numbers: a round is short, has no repeats and mixes the kinds', () => {
  assert.ok(content.numbers.length >= 30);
  for (let i = 1; i <= 20; i++) {
    const round = numberRound(content.numbers, 8, i / 21);
    assert.equal(round.length, 8);
    assert.equal(new Set(round.map((x) => x.id)).size, 8);
    assert.ok(new Set(round.map((x) => x.kind)).size >= 3, 'at least three kinds in a round of eight');
    for (const k of new Set(round.map((x) => x.kind))) assert.ok(round.filter((x) => x.kind === k).length <= 3, 'no more than three of one kind');
  }
  assert.notDeepEqual(numberRound(content.numbers, 8, 0.2).map((x) => x.id), numberRound(content.numbers, 8, 0.7).map((x) => x.id));
  assert.equal(numberRound(content.numbers.slice(0, 3), 8, 0.5).length, 3);
  // items already recognised wait until the others have had their turn: a week of daily rounds covers the whole list
  const heard = {};
  const all = new Set();
  let rounds = 0;
  const fair = Math.ceil(content.numbers.length / 8) + 2;      // every item once before any comes a second time (a round keeps at most three of a kind, hence the two spare rounds)
  while (all.size < content.numbers.length && rounds < 100) { rounds++; for (const it of numberRound(content.numbers, 8, rounds / 23, heard)) { all.add(it.id); heard[it.id] = (heard[it.id] || 0) + 1; } }
  assert.ok(rounds <= fair, `it took ${rounds} rounds to hear all ${content.numbers.length} items`);
  // an item that needed a second try (not counted as heard) comes back in the very next round
  const most = Object.fromEntries(content.numbers.map((n) => [n.id, 1]));
  delete most[content.numbers[5].id];
  assert.ok(numberRound(content.numbers, 8, 0.33, most).some((x) => x.id === content.numbers[5].id));
  // content rules the app relies on
  for (const n of content.numbers) {
    assert.ok(!/\d/.test(n.say), `numbers are written as words in "say": ${n.say}`);
    assert.ok(/\d/.test(n.show), n.show);
    assert.ok(n.alts.length >= 2 && n.alts.length <= 3 && !n.alts.includes(n.show), n.say);
    assert.ok(['s', 'm'].includes(n.voice));
    if (n.kind === 'phone') for (const v of [n.show, ...n.alts]) assert.match(v, /^555-01\d\d$/);
  }
});

test('answer options: the same order while a screen redraws, a different one on the next attempt', () => {
  const opts = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(shuffle(opts, 0.3), shuffle(opts, 0.3));
  assert.deepEqual(shuffle(opts, 0.3).slice().sort(), opts);
  const orders = new Set();
  for (let i = 0; i < 40; i++) orders.add(shuffle(opts).join(''));
  assert.ok(orders.size > 10, 'unseeded shuffles differ');
  // one attempt (seed) gives each screen (k) its own order; another attempt gives other orders
  const seen = new Set();
  for (let seed = 0.05; seed < 1; seed += 0.1) for (let k = 0; k < 5; k++) { const x = mix(seed, k); assert.ok(x > 0 && x < 1); seen.add(shuffle(['x', 'y', 'z'], x).join('')); }
  assert.equal(seen.size, 6, 'all six orders of three options turn up');
});

// ---- «درس امروز» always offers something (todayOffer), the look back after every fifth lesson, the end of the path ----
const NOW = 20000 * DAY + 13 * 3600000;                 // a fixed "now": early afternoon of some day
const daysAgo = (n) => NOW - n * DAY;
const finishAt = (s, id, t) => { s.done[id] = { t, n: ((s.done[id] && s.done[id].n) || 0) + 1 }; return s; };

test('«درس امروز»: the lesson in progress, then the look back, then the next new lesson', () => {
  const s = fresh();
  assert.deepEqual(todayOffer(s, content, NOW), { kind: 'lesson', id: order[0] });
  s.at[order[0]] = { pos: 4, short: false, t: 5 };
  assert.deepEqual(todayOffer(s, content, NOW), { kind: 'resume', id: order[0] });
  delete s.at[order[0]];
  // four lessons: no look back yet; the fifth makes it due, and a lesson in progress still comes first
  order.slice(0, 4).forEach((id, i) => finishAt(s, id, daysAgo(9 - i)));
  assert.equal(checkpointDue(s, content), false);
  assert.deepEqual(todayOffer(s, content, NOW), { kind: 'lesson', id: order[4] });
  finishAt(s, order[4], daysAgo(1));
  assert.equal(checkpointDue(s, content), true);
  assert.deepEqual(todayOffer(s, content, NOW), { kind: 'checkpoint' });
  s.at[order[5]] = { pos: 2, short: false, t: 7 };
  assert.deepEqual(todayOffer(s, content, NOW), { kind: 'resume', id: order[5] });
  delete s.at[order[5]];
  // done or passed over: the next lesson again, until ten lessons are finished
  s.cp = checkpointMark(s, content, NOW);
  assert.deepEqual(s.cp, { n: 1, t: NOW });
  assert.deepEqual(todayOffer(s, content, NOW), { kind: 'lesson', id: order[5] });
  order.slice(5, 9).forEach((id) => finishAt(s, id, daysAgo(1)));
  assert.equal(checkpointDue(s, content), false);
  finishAt(s, order[9], NOW);
  assert.equal(checkpointDue(s, content), true);
  // repeating an old lesson does not bring a look back; someone with many lessons from an earlier version gets one, not five
  s.cp = checkpointMark(s, content, NOW);
  finishAt(s, order[0], NOW);
  assert.equal(checkpointDue(s, content), false);
  const old = finish(fresh(), ...order.slice(0, 27));
  assert.equal(checkpointDue(old, content), true);
  old.cp = checkpointMark(old, content, NOW);
  assert.equal(old.cp.n, 5);
  assert.equal(checkpointDue(old, content), false);
  assert.equal(CHECK_EVERY, 5);
});

test('look back: four "what did they say?" and four "how do you say?" questions from the last five lessons, and one conversation', () => {
  for (const start of [0, 5, 16, 30, order.length - 5]) {
    const s = fresh();
    const five = order.slice(start, start + 5);
    order.slice(0, start).forEach((id) => finishAt(s, id, daysAgo(200)));
    five.forEach((id, i) => finishAt(s, id, daysAgo(9 - i)));
    // the learner did the second of them as a short lesson, and one sentence needed another try
    for (const id of five) for (const p of (id === five[1] ? shortPhrases(content.lessons[id]) : content.lessons[id].phrases)) s.srs[`p:${id}:${p.id}`] = { b: 2, d: 1, n: 0 };
    const hardOne = content.lessons[five[2]].phrases.find((p) => !p.own);
    s.hard[`${five[2]}:${hardOne.id}`] = 2;
    assert.deepEqual(checkpointLessons(s, content), five, 'the five finished most recently, oldest first');
    for (const seed of [0.11, 0.52, 0.93]) {
      const plan = checkpointPlan(s, content, seed);
      assert.deepEqual(plan, checkpointPlan(s, content, seed), 'the same attempt asks the same questions');
      assert.deepEqual(plan.lessons, five);
      const hear = plan.items.filter((x) => x.kind === 'hear'), say = plan.items.filter((x) => x.kind === 'say');
      assert.equal(hear.length, CHECK_HEAR, `lessons ${start + 1}–${start + 5}`);
      assert.equal(say.length, CHECK_SAY, `lessons ${start + 1}–${start + 5}`);
      assert.deepEqual(plan.items.map((x) => x.kind).join(''), 'hearsayhearsayhearsayhearsay', 'they take turns');
      for (const it of plan.items) {
        assert.ok(five.includes(it.lesson));
        const L = content.lessons[it.lesson];
        assert.equal(it.options.length, 3);
        assert.equal(it.options.filter((o) => o.right).length, 1);
        if (it.kind === 'hear') {
          // a partner's line of that lesson's dialogue, in the partner's voice, with two other meanings of the same dialogue
          const line = partnerLines(L).find((l) => l.en === it.en);
          assert.ok(line && it.fa === line.fa && it.voice === L.them.voice);
          assert.equal(new Set(it.options.map((o) => o.fa)).size, 3);
          assert.equal(it.options.find((o) => o.right).fa, it.fa);
          assert.ok(it.options.every((o) => partnerLines(L).some((l) => l.fa === o.fa)));
        } else {
          // a sentence the learner has seen, never one with the sample person's own details; the choices are English sentences of the same lesson
          const p = L.phrases.find((x) => x.id === it.pid);
          assert.ok(p && !p.own && s.srs[`p:${it.lesson}:${it.pid}`], `${it.lesson} ${it.pid}`);
          assert.equal(it.en, p.en); assert.equal(it.fa, p.fa);
          assert.equal(new Set(it.options.map((o) => o.id)).size, 3);
          assert.equal(it.options.find((o) => o.right).id, p.id);
          for (const o of it.options) { const q = L.phrases.find((x) => x.id === o.id); assert.ok(q && o.en === q.en && o.say === (q.say || q.en) && s.srs[`p:${it.lesson}:${o.id}`]); }
        }
      }
      assert.equal(new Set(hear.map((x) => x.en)).size, CHECK_HEAR, 'no line twice');
      assert.equal(new Set(say.map((x) => x.lesson + x.pid)).size, CHECK_SAY, 'no sentence twice');
      assert.ok(new Set(plan.items.map((x) => x.lesson)).size >= 4, 'the questions are spread over the lessons');
      // the sentence that needed another try is asked
      if (!content.lessons[five[2]].listenFirst) assert.ok(say.some((x) => x.lesson === five[2] && x.pid === hardOne.id), 'the sentence that was hard is asked again');
      // the conversation practises one of these lessons, the one done least often
      const talks = five.flatMap((id) => content.practiceAll[id] || []);
      if (talks.length) assert.ok(talks.includes(plan.talk)); else assert.equal(plan.talk, null);
    }
    const talks = [...new Set(five.flatMap((id) => content.practiceAll[id] || []))];
    if (talks.length > 1) { for (const rid of talks.slice(1)) s.rp[rid] = 2; s.rp[talks[0]] = 0; assert.equal(checkpointPlan(s, content, 0.4).talk, talks[0]); s.rp[talks[0]] = 3; assert.notEqual(checkpointPlan(s, content, 0.4).talk, talks[0]); }
  }
  // nothing finished: nothing to ask (the screen then says so)
  assert.deepEqual(checkpointPlan(fresh(), content, 0.5), { lessons: [], items: [], talk: null });
});

test('when no new lesson is left: the lesson with the most misses in its short form, then a conversation — never "nothing"', () => {
  const s = fresh();
  order.forEach((id, i) => finishAt(s, id, daysAgo(120 - i)));
  s.cp = checkpointMark(s, content, NOW);
  assert.equal(pathLesson(s, content), null);
  // no lesson finished today: the one whose sentences needed most second tries
  s.hard[`${order[10]}:p1`] = 2; s.hard[`${order[10]}:p3`] = 1; s.hard[`${order[20]}:p2`] = 5; s.hard[`${order[30]}:p2`] = 1;
  assert.equal(missesOf(s, order[10]), 3);
  assert.deepEqual(todayOffer(s, content, NOW), { kind: 'repeat', id: order[20] });
  // it is finished again: now a conversation. First one done once (it is then heard before it is read) …
  finishAt(s, order[20], NOW - 3600000);
  const talks = content.roleplays.slice().sort((a, b) => a.stage - b.stage);
  const once = talks.find((r) => !r.phone);
  s.rp[once.id] = 1;
  assert.deepEqual(todayOffer(s, content, NOW), { kind: 'talk', id: once.id, hear: true });
  // … then one never done, and it stays a conversation for the rest of the day
  s.rp[once.id] = 2;
  const offer = todayOffer(s, content, NOW);
  assert.equal(offer.kind, 'talk');
  assert.equal(offer.hear, false);
  assert.ok(!s.rp[offer.id]);
  assert.equal(offer.id, talks.find((r) => !s.rp[r.id]).id, 'the easiest conversation not yet done');
  // the next day: the lesson repeated yesterday has a rest, the next most-missed one is offered
  assert.deepEqual(todayOffer(s, content, NOW + DAY), { kind: 'repeat', id: order[10] });
  finishAt(s, order[10], NOW + DAY);
  assert.deepEqual(todayOffer(s, content, NOW + 2 * DAY), { kind: 'repeat', id: order[30] });
  assert.deepEqual(todayOffer(s, content, NOW + (REPEAT_REST + 1) * DAY), { kind: 'repeat', id: order[20] }, 'after its rest the most-missed lesson comes round again');
  // every lesson repeated within the week: the one finished longest ago
  const busy = fresh();
  order.forEach((id, i) => finishAt(busy, id, NOW - DAY - i * 60000));
  busy.cp = checkpointMark(busy, content, NOW);
  assert.deepEqual(todayOffer(busy, content, NOW), { kind: 'repeat', id: order[order.length - 1] });
  // every conversation done many times: still a conversation, the one done least often
  for (const r of content.roleplays) s.rp[r.id] = 3;
  s.rp[talks[5].id] = 2;
  assert.equal(todayOffer(s, content, NOW + 4 * DAY).kind, 'repeat');
  finishAt(s, order[30], NOW + 5 * DAY);
  assert.deepEqual(todayOffer(s, content, NOW + 5 * DAY), { kind: 'talk', id: talks[5].id, hear: !talks[5].phone });
  // 400 simulated days after the end of the path: something is offered every single day
  const long = fresh();
  order.forEach((id, i) => finishAt(long, id, daysAgo(100 - i)));
  long.cp = checkpointMark(long, content, NOW);
  const seen = new Set();
  for (let d = 0; d < 400; d++) {
    const now = NOW + d * DAY;
    const a = todayOffer(long, content, now);
    assert.equal(a.kind, 'repeat', `day ${d}`);
    seen.add(a.id); finishAt(long, a.id, now);
    const b = todayOffer(long, content, now + 60000);
    assert.equal(b.kind, 'talk', `day ${d}`);
    long.rp[b.id] = (long.rp[b.id] || 0) + 1;
  }
  assert.equal(seen.size, order.length, 'in time every lesson comes round again');
  assert.ok(content.roleplays.every((r) => long.rp[r.id] >= 2), 'and every conversation, more than once');
  assert.equal(afterPath(fresh(), { ...content, roleplays: [] }, NOW), null, 'only an app with no lessons done and no conversations has nothing');
});

test('the small task of a lesson: asked once, at a later visit, about the lesson finished last', () => {
  const withMission = { ...content, lessons: Object.fromEntries(Object.entries(content.lessons).map(([id, L]) => [id, { ...L, mission: L.mission || 'کاری کوچک.' }])) };
  const s = fresh();
  assert.equal(missionDue(s, withMission, NOW), null);
  finishAt(s, order[0], NOW - 3600000);
  assert.equal(missionDue(s, withMission, NOW), null, 'an hour after the lesson there has been no chance to try');
  assert.equal(missionDue(s, withMission, NOW - 3600000 + MISSION_WAIT), order[0], 'later the same day');
  assert.equal(missionDue(s, withMission, NOW + DAY - 8 * 3600000), order[0], 'the next morning');
  // only the lesson finished last is asked about
  finishAt(s, order[1], NOW + DAY);
  assert.equal(missionDue(s, withMission, NOW + 2 * DAY), order[1]);
  // answered — yes or "not yet" — it is not asked again, and nothing older is asked instead
  s.tried[order[1]] = 0;
  assert.equal(missionDue(s, withMission, NOW + 2 * DAY), null);
  s.tried[order[1]] = 1;
  assert.equal(missionDue(s, withMission, NOW + 2 * DAY), null);
  // after two weeks away the question is no longer fresh
  finishAt(s, order[2], NOW + 3 * DAY);
  assert.equal(missionDue(s, withMission, NOW + (3 + MISSION_KEEP) * DAY), order[2]);
  assert.equal(missionDue(s, withMission, NOW + (4 + MISSION_KEEP) * DAY), null);
  // a lesson without a task asks nothing
  const none = { ...content, lessons: { ...content.lessons, [order[2]]: { ...content.lessons[order[2]], mission: undefined } } };
  assert.equal(missionDue(s, none, NOW + 4 * DAY), null);
  // «کارهایی که حالا می‌توانم بکنم»: every finished lesson, newest first, with its task and whether it was tried
  const list = canDoList(s, withMission);
  assert.deepEqual(list.map((x) => x.id), [order[2], order[1], order[0]]);
  assert.deepEqual(list.map((x) => x.tried), [null, true, null]);
  for (const it of list) { assert.equal(it.canDo, content.lessons[it.id].canDo); assert.ok(it.mission && it.title); }
  assert.deepEqual(canDoList(fresh(), content), []);
  const odd = fresh(); odd.done.constructor = { t: 5, n: 1 }; odd.done['no-such-lesson'] = { t: 9, n: 1 };
  assert.deepEqual(canDoList(odd, content), []);
  assert.deepEqual(doneLessons(odd, content), []);
});

// ---- «جملهٔ خودِ شما» (src/js/own.js) ---------------------------------------------------------------------
test('own sentences: numbers, days and years are said the way the recordings (and the voice generator) say them', () => {
  for (let n = 0; n <= 99; n++) assert.equal(numberWord(n), enNumber(n), String(n));
  for (let d = 1; d <= 31; d++) assert.equal(ordinalWord(d), enOrdinal(d), String(d));
  assert.equal(numberWord(100), ''); assert.equal(numberWord(-1), ''); assert.equal(ordinalWord(0), '');
  assert.deepEqual([1, 2, 3, 5, 8, 9, 12, 14, 20, 21, 22, 23, 30, 31].map(ordinalWord), ['first', 'second', 'third', 'fifth', 'eighth', 'ninth', 'twelfth', 'fourteenth', 'twentieth', 'twenty-first', 'twenty-second', 'twenty-third', 'thirtieth', 'thirty-first']);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 24, 30, 31].map(ordinalDigits), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '24th', '30th', '31st']);
  // a year is two pairs; 2000–2009 are "two thousand …"
  assert.deepEqual(yearWords(1955), ['nineteen', 'fifty-five']);
  assert.deepEqual(yearWords(1958), ['nineteen', 'fifty-eight']);
  assert.deepEqual(yearWords(1940), ['nineteen', 'forty']);
  assert.deepEqual(yearWords(1905), ['nineteen', 'oh', 'five']);
  assert.deepEqual(yearWords(1900), ['nineteen', 'hundred']);
  assert.deepEqual(yearWords(2000), ['two thousand']);
  assert.deepEqual(yearWords(2005), ['two thousand', 'five']);
  assert.deepEqual(yearWords(2010), ['twenty', 'ten']);
  assert.deepEqual(yearWords('abc'), []);
  for (let y = 1900; y <= 2030; y++) assert.equal(yearWords(y).join(' '), enYear(y), String(y));
  assert.equal(MONTHS.length, 12);
  assert.deepEqual([daysIn(2, 1955), daysIn(2, 1956), daysIn(2, 2000), daysIn(2, 1900), daysIn(2, 0), daysIn(4, 1950), daysIn(12, 1950)], [28, 29, 29, 28, 29, 30, 31]);
});

test('own sentences: the date of birth is kept as one short text and read back safely', () => {
  assert.deepEqual(parseBorn('1955-12-14'), { y: 1955, m: 12, d: 14 });
  assert.deepEqual(parseBorn('0-12-0'), { y: 0, m: 12, d: 0 }, 'only the month chosen so far');
  assert.deepEqual(parseBorn('1955-2-30'), { y: 1955, m: 2, d: 0 }, 'a day the month does not have is not kept');
  assert.deepEqual(parseBorn('1956-2-29'), { y: 1956, m: 2, d: 29 });
  assert.deepEqual(parseBorn('1855-13-40'), { y: 0, m: 0, d: 0 });
  for (const junk of ['', null, undefined, 42, {}, '1955/12/14', '<b>', '1955-12-14-1']) assert.deepEqual(parseBorn(junk), { y: 0, m: 0, d: 0 });
  assert.equal(formatBorn({ y: 1955, m: 12, d: 14 }), '1955-12-14');
  assert.equal(formatBorn(parseBorn(formatBorn({ y: 0, m: 3, d: 5 }))), '0-3-5');
  assert.equal(bornComplete(parseBorn('1955-12-14')), true);
  assert.equal(bornComplete(parseBorn('0-12-14')), false);
  assert.equal(bornComplete({ y: 1955, m: 2, d: 30 }), false);
  assert.ok(YEARS.from <= 1930 && YEARS.to >= 1966, 'the years of people aged sixty and over can be chosen');
  // age: full years, the birthday itself counts
  const on = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
  assert.equal(ageOn(parseBorn('1955-12-14'), on(2026, 10, 11)), 70);
  assert.equal(ageOn(parseBorn('1955-12-14'), on(2026, 12, 13)), 70);
  assert.equal(ageOn(parseBorn('1955-12-14'), on(2026, 12, 14)), 71);
  assert.equal(ageOn(parseBorn('0-12-14'), on(2026, 1, 1)), null);
});

test('own sentences: built from «اطلاعات من», with the recordings that say them — and nothing when a detail is missing', () => {
  const now = new Date(2026, 9, 11, 12).getTime();
  const me = { name: 'Hossein Karimi', address: ' 1420 Wilshire Boulevard,  Apartment 5. ', contact: '', phone: '(310) 555-0142', born: '1955-12-14' };
  // the phone number and the age (lesson my-numbers)
  assert.deepEqual(ownLines(me, ['phone', 'age'], now), [
    { kind: 'phone', en: 'My phone number is 310-555-0142.', words: 'three one zero, five five five, zero one four two', say: ['My phone number is', 'three', 'one', 'zero', 'five', 'five', 'five', 'zero', 'one', 'four', 'two'] },
    { kind: 'age', en: 'I am seventy years old.', words: null, say: ['I am', 'seventy', 'years old.'] },
  ]);
  // the name, and how it is spelled (lesson my-name): a name has no recording, its letters have
  assert.deepEqual(ownLines(me, ['name'], now), [
    { kind: 'name', en: 'My first name is Hossein.', words: null, say: null },
    { kind: 'name', en: 'My last name is Karimi.', words: null, say: null },
    { kind: 'spelled', en: "It's spelled K-A-R-I-M-I.", words: null, say: ["It's spelled", 'K', 'A', 'R', 'I', 'M', 'I'] },
  ]);
  // the address and the date of birth (lesson my-address-birthday): the day as an ordinal, the year as two pairs
  assert.deepEqual(ownLines(me, ['address', 'born'], now), [
    { kind: 'address', en: 'I live at 1420 Wilshire Boulevard, Apartment 5.', words: null, say: null },
    { kind: 'born', en: 'I was born on December 14th, 1955.', words: 'December fourteenth, nineteen fifty-five', say: ['I was born on', 'December', 'fourteenth', 'nineteen', 'fifty-five'] },
  ]);
  assert.deepEqual(ownLines({ ...me, born: '2005-3-1' }, ['born'], now)[0].say, ['I was born on', 'March', 'first', 'two thousand', 'five']);
  assert.equal(ownLines({ ...me, born: '2005-3-1' }, ['born'], now)[0].en, 'I was born on March 1st, 2005.');
  assert.deepEqual(ownLines({ ...me, born: '2000-7-22' }, ['born'], now)[0].say, ['I was born on', 'July', 'twenty-second', 'two thousand']);
  // names: one word, three words, a hyphen; only English letters are spelled
  assert.deepEqual(nameParts('Maryam Ahmadi'), { first: 'Maryam', last: 'Ahmadi' });
  assert.deepEqual(nameParts('  Mohammad  Reza Karimi '), { first: 'Mohammad Reza', last: 'Karimi' });
  assert.deepEqual(nameParts('Zahra'), { first: 'Zahra', last: '' });
  assert.deepEqual(ownLines({ name: 'Zahra' }, ['name'], now).map((l) => l.en), ['My name is Zahra.', "It's spelled Z-A-H-R-A."]);
  assert.deepEqual(spellOut("Zadeh-O'Neil"), ['Z', 'A', 'D', 'E', 'H', 'O', 'N', 'E', 'I', 'L']);
  for (const bad of ['حسین کریمی', 'Hossein کریمی', '<b>Bob</b> X', '12345', '', null, undefined, 77]) { assert.deepEqual(nameParts(bad), { first: '', last: '' }, String(bad)); assert.deepEqual(ownLines({ name: bad }, ['name'], now), []); }
  // phone numbers: ten digits, a leading 1, seven digits, something else, too short
  assert.deepEqual(phoneParts('1 (310) 555-0142'), { digits: '3105550142'.split(''), show: '310-555-0142' });
  assert.equal(phoneParts('555 0142').show, '555-0142');
  assert.equal(phoneParts('0912 345 6789').show, '0912 345 6789');
  assert.equal(phoneParts('12345'), null); assert.equal(phoneParts(''), null); assert.equal(phoneParts(undefined), null);
  assert.deepEqual(ownLines({ phone: '555 0142' }, ['phone'], now)[0].words, 'five five five, zero one four two');
  // what is missing gives no line, and is named so that the screen can invite the learner — never an error
  assert.deepEqual(ownLines({}, OWN_KINDS, now), []);
  assert.deepEqual(ownLines(undefined, OWN_KINDS, now), []);
  assert.deepEqual(ownLines(me, undefined, now), []);
  assert.deepEqual(ownLines(me, ['shoe'], now), []);
  assert.deepEqual(ownMissing({}, ['phone', 'age'], now), ['phone', 'age']);
  assert.deepEqual(ownMissing(me, OWN_KINDS, now), []);
  assert.deepEqual(ownMissing({ ...me, born: '1955-12-0' }, ['address', 'born'], now), ['born']);
  assert.deepEqual(ownMissing({ ...me, name: '' }, ['name'], now), ['name']);
  assert.deepEqual(ownLines({ born: '1920-1-1' }, ['age'], new Date(2026, 9, 11).getTime()), [], 'an age over ninety-nine is not said (no recording)');
  // every recording a sentence can ask for is in the list given to the voice generator
  const pieces = new Set(ownPieces());
  for (const c of Object.values(CARRIERS)) assert.ok(pieces.has(c));
  for (let y = YEARS.from; y <= YEARS.to; y++) for (let m = 1; m <= 12; m++) for (const d of [1, 2, 3, 11, 12, 13, 21, 22, 23, 28]) {
    for (const line of ownLines({ name: 'Abcdefghijklm Nopqrstuvwxyz', phone: '0123456789', born: `${y}-${m}-${d}` }, OWN_KINDS, now)) for (const text of line.say || []) assert.ok(pieces.has(text), `"${text}" in "${line.en}"`);
  }
  for (let d = 1; d <= 31; d++) assert.ok(pieces.has(ordinalWord(d)));
  // the three "my information" lessons build them (curriculum.json "mine")
  assert.deepEqual(Object.keys(content.mine).sort(), ['my-address-birthday', 'my-name', 'my-numbers']);
  for (const kinds of Object.values(content.mine)) for (const k of kinds) assert.ok(OWN_KINDS.includes(k));
});

// ---- two tabs of the app (store.js) ------------------------------------------------------------------------
// one storage shared by two pages; `fire` delivers the browser's 'storage' event to the other page
function twoTabs() {
  const data = new Map();
  const storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: (k) => { data.delete(k); } };
  const target = () => { const on = {}; return { addEventListener: (name, f) => { (on[name] ||= []).push(f); }, fire: (name, e) => (on[name] || []).forEach((f) => f(e)) }; };
  const wa = target(), wb = target();
  return { data, storage, wa, wb, a: createStore(storage, { events: wa }), b: createStore(storage, { events: wb }) };
}

test('two tabs: «پاک کردن همه‌چیز» in one tab is not undone by the other, with or without the browser\'s storage event', () => {
  for (const events of [true, false]) {
    const { data, storage, wb, a, b } = twoTabs();
    a.update((s) => { s.me.name = 'Zahra Secretname'; s.me.address = '987 Private Lane'; s.me.born = '1950-1-2'; s.onboard.done = true; });
    const told = [];
    b.subscribe((s, why) => told.push(why));
    if (events) wb.fire('storage', { key: 'hamrah.v1', storageArea: storage });
    else assert.equal(b.sync(), true);
    assert.equal(b.state.me.name, 'Zahra Secretname', 'the second tab sees what the first one saved');
    assert.deepEqual(told, ['external']);
    // tab 1 deletes everything
    a.wipe();
    assert.equal(data.has('hamrah.v1'), false);
    if (events) wb.fire('storage', { key: null, storageArea: storage });
    // tab 2 flips a switch (with the event it already knows; without it, it finds out as it writes)
    b.update((s) => { s.settings.ph = false; });
    const stored = JSON.parse(data.get('hamrah.v1'));
    assert.deepEqual(stored.me, blank().me, 'the deleted name, address and date of birth are not written back');
    assert.equal(stored.onboard.done, false);
    assert.equal(stored.settings.ph, false, 'the new change itself is kept');
    assert.equal(b.state.me.name, '');
    assert.equal(told.filter((w) => w === 'external').length, 2, 'the app is told, so that it redraws from its first screen');
    // «پاک کردن این اطلاعات» and a reset of progress behave the same way
    a.sync();
    a.update((s) => { s.me.name = 'Again'; s.done.x = { t: 1, n: 1 }; });
    if (events) wb.fire('storage', { key: 'hamrah.v1', storageArea: storage });
    a.update((s) => { s.me = blank().me; });
    if (events) wb.fire('storage', { key: 'hamrah.v1', storageArea: storage });
    b.reset(true);
    assert.equal(JSON.parse(data.get('hamrah.v1')).me.name, '', 'a reset in the other tab does not bring the cleared details back');
    assert.deepEqual(JSON.parse(data.get('hamrah.v1')).done, {});
  }
});

test('two tabs: a tab left open does not write its older progress over lessons finished in the other', () => {
  for (const events of [true, false]) {
    const { data, storage, wa, wb, a, b } = twoTabs();
    a.update((s) => { s.done.one = { t: 1, n: 1 }; });
    if (events) wb.fire('storage', { key: 'hamrah.v1', storageArea: storage });
    // tab 2 finishes two more lessons; tab 1 (stale) then saves a small thing of its own
    b.update((s) => { s.done.two = { t: 2, n: 1 }; });
    b.update((s) => { s.done.three = { t: 3, n: 1 }; s.srs['p:three:p1'] = { b: 2, d: 9, n: 0 }; });
    if (events) wa.fire('storage', { key: 'hamrah.v1', storageArea: storage });
    a.update((s) => { s.fav.w1 = 1; });
    const stored = JSON.parse(data.get('hamrah.v1'));
    assert.deepEqual(Object.keys(stored.done).sort(), ['one', 'three', 'two']);
    assert.ok(stored.srs['p:three:p1'] && stored.fav.w1 === 1);
    // and tab 2 in turn keeps tab 1's change
    if (events) wb.fire('storage', { key: 'hamrah.v1', storageArea: storage });
    b.update((s) => { s.done.four = { t: 4, n: 1 }; });
    assert.equal(JSON.parse(data.get('hamrah.v1')).fav.w1, 1);
    assert.deepEqual(a.sync(), true);
    assert.deepEqual(Object.keys(a.state.done).sort(), ['four', 'one', 'three', 'two']);
    assert.equal(a.sync(), false, 'nothing new: nothing happens');
  }
  // events about other keys, or another storage, are not ours; damaged text in storage is read as "nothing saved"
  const { data, storage, wb, a, b } = twoTabs();
  a.update((s) => { s.done.one = { t: 1, n: 1 }; });
  const told = [];
  b.subscribe((s, why) => told.push(why));
  wb.fire('storage', { key: 'hamrah.t', storageArea: storage });
  wb.fire('storage', { key: 'hamrah.v1', storageArea: {} });
  assert.deepEqual(told, []);
  data.set('hamrah.v1', '{not json');
  wb.fire('storage', { key: 'hamrah.v1', storageArea: storage });
  assert.deepEqual(b.state, blank());
  // coming back into view checks too (a tab asleep in the background can miss the event)
  a.sync(); a.update((s) => { s.done.five = { t: 5, n: 1 }; });
  wb.fire('pageshow', {});
  assert.ok(b.state.done.five);
  // a store without storage (private window) still works, and has nothing to sync
  const lone = createStore(null, { events: null });
  lone.update((s) => { s.done.x = { t: 1, n: 1 }; });
  assert.equal(lone.sync(), false);
  assert.equal(lone.persistent, false);
});

test('saved state: the new fields have safe defaults, and damaged values are brought back into shape', () => {
  const b = blank();
  assert.deepEqual(b.me, { name: '', address: '', contact: '', phone: '', born: '' });
  assert.deepEqual([b.later, b.cp, b.tried, b.told], [{}, { n: 0, t: 0 }, {}, {}]);
  // a state saved before this version gains them; the learner's details stay
  const old = migrate({ v: 1, me: { name: 'Maryam Ahmadi', address: '25 Oak Street', contact: '212-555-0142' }, done: { 'social-hello': { t: 5, n: 1 } } });
  assert.deepEqual(old.me, { name: 'Maryam Ahmadi', address: '25 Oak Street', contact: '212-555-0142', phone: '', born: '' });
  assert.deepEqual(old.cp, { n: 0, t: 0 });
  const odd = migrate({ v: 1, me: { name: 42, born: { y: 1 }, phone: 'x'.repeat(999) }, cp: { n: 'many', t: null }, later: [1], tried: 'yes' });
  assert.equal(odd.me.name, ''); assert.equal(odd.me.born, ''); assert.equal(odd.me.phone.length, 200);
  assert.deepEqual(odd.cp, { n: 0, t: 0 });
  assert.deepEqual([odd.later, odd.tried], [{}, {}]);
  assert.equal(typeof today(NOW), 'number');
});

// ---- development pass 4 (QA round 3) ---------------------------------------------------------------------------
test('questions that open a lesson come from different lessons first (L1): three questions from one lesson could be guessed', () => {
  const s = fresh();
  const [a, b, c] = order;
  finish(s, a, b, c);
  // every sentence of the three lessons due on the same day; lesson a's have waited longest
  for (const id of [a, b, c]) content.lessons[id].phrases.forEach((p) => { s.srs[`p:${id}:${p.id}`] = { b: 2, d: id === a ? 95 : 99, n: 1, l: 90 }; });
  const got = dueSentences(s, content, 100, 3);
  assert.deepEqual(got.map((x) => x.lesson), [a, b, c]);
  const more = dueSentences(s, content, 100, 6);
  assert.deepEqual(more.slice(0, 3).map((x) => x.lesson), [a, b, c]);
  assert.equal(new Set(more.map((x) => x.key)).size, 6);
  assert.equal(more[3].lesson, a, 'then the longest-waiting again');
});

test('a look back never asks for a line other people say ("heard") or one with the sample person\'s details', () => {
  const ids = ['pharmacy-problems', 'bus-transfer', 'on-the-plane', 'social-hello', 'my-name'].filter((id) => content.lessons[id]);
  for (const seed of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const s = fresh();
    ids.forEach((id, i) => { finishAt(s, id, daysAgo(5 - i)); for (const p of content.lessons[id].phrases) s.srs[`p:${id}:${p.id}`] = { b: 2, d: 1, n: 1 }; });
    for (const it of checkpointPlan(s, content, seed).items.filter((x) => x.kind === 'say')) {
      const p = content.lessons[it.lesson].phrases.find((x) => x.id === it.pid);
      assert.ok(!p.heard && !(p.own && p.own.length), `${it.lesson}: "${p.en}"`);
    }
  }
});

test('after the path: a repeat left half-way is offered as "continue" (features L6)', () => {
  const s = fresh();
  order.forEach((id, i) => finishAt(s, id, daysAgo(100 - i / 100)));
  s.cp = checkpointMark(s, content, NOW);
  const first = afterPath(s, content, NOW);
  assert.equal(first.kind, 'repeat');
  s.at[first.id] = { pos: 3, short: true, t: NOW - 1000 };
  assert.deepEqual(afterPath(s, content, NOW), { kind: 'resume', id: first.id });
  assert.deepEqual(todayOffer(s, content, NOW), { kind: 'resume', id: first.id });
  s.at[first.id] = { pos: 0, short: true, t: NOW - 1000 };
  assert.equal(afterPath(s, content, NOW).kind, 'repeat');
});

// The learner's own details instead of the sample person's (QA round 3, M2)
const ME = { name: 'Hossein Karimi', address: '1450 Pine Ave, Apt 3', phone: '(310) 555-0199', born: '1955-12-14', contact: '' };
const AT = new Date(2026, 9, 12, 12).getTime();
const FA_MONTH = (m) => ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'][m - 1];
const own = (en, fa, me = ME) => ownVersion(en, fa, me, { now: AT, month: FA_MONTH });

test('own version: each detail of the sample person becomes the learner\'s, in English and in the Farsi meaning', () => {
  const table = [
    ['My name is Maryam.', 'اسم من مریم است.', 'My name is Hossein.', 'اسم من Hossein است.'],
    ['My first name is Maryam.', 'اسم کوچک من مریم است.', 'My first name is Hossein.', 'اسم کوچک من Hossein است.'],
    ['My last name is Ahmadi.', 'نام خانوادگی من احمدی است.', 'My last name is Karimi.', 'نام خانوادگی من Karimi است.'],
    ["It's spelled A-H-M-A-D-I.", 'حرف‌به‌حرف: …', "It's spelled K-A-R-I-M-I.", 'حرف‌به‌حرف: …'],
    ['Hello, this is Maryam Ahmadi.', 'سلام، مریم احمدی هستم.', 'Hello, this is Hossein Karimi.', 'سلام، Hossein Karimi هستم.'],
    ['My date of birth is March 5th, 1958.', 'تاریخ تولد من ۵ مارس ۱۹۵۸ است.', 'My date of birth is December 14th, 1955.', 'تاریخ تولد من ۱۴ دسامبر ۱۹۵۵ است.'],
    ['I was born on March 5th, 1958.', 'من در ۵ مارس ۱۹۵۸ به دنیا آمده‌ام.', 'I was born on December 14th, 1955.', 'من در ۱۴ دسامبر ۱۹۵۵ به دنیا آمده‌ام.'],
    ['My phone number is 212-555-0142.', 'شمارهٔ تلفن من ‎۲۱۲-۵۵۵-۰۱۴۲ است.', 'My phone number is 310-555-0199.', 'شمارهٔ تلفن من ‎۳۱۰-۵۵۵-۰۱۹۹ است.'],
    ['I am sixty-five years old.', 'من شصت و پنج سال دارم.', 'I am seventy years old.', 'من ۷۰ سال دارم.'],
    ['I live at 25 Oak Street.', 'من در خیابان اوک، پلاک ۲۵ زندگی می‌کنم.', 'I live at 1450 Pine Ave, Apt 3.', 'من در 1450 Pine Ave, Apt 3 زندگی می‌کنم.'],
    ['My address is 25 Oak Street.', 'آدرس من خیابان اوک، پلاک ۲۵ است. (آدرس تمرینی)', 'My address is 1450 Pine Ave, Apt 3.', 'آدرس من 1450 Pine Ave, Apt 3 است.'],
    ['Maryam Ahmadi. My phone number is 212-555-0142.', 'مریم احمدی. شمارهٔ تلفن من ‎۲۱۲-۵۵۵-۰۱۴۲ است. (شمارهٔ تمرینی)', 'Hossein Karimi. My phone number is 310-555-0199.', 'Hossein Karimi. شمارهٔ تلفن من ‎۳۱۰-۵۵۵-۰۱۹۹ است.'],
  ];
  for (const [en, fa, wantEn, wantFa] of table) { const v = own(en, fa); assert.ok(v, en); assert.equal(v.en, wantEn); assert.equal(v.fa, wantFa); }
  // the age follows the date: on the day before the birthday, one year less
  assert.equal(own('I am sixty-five years old.', 'من شصت و پنج سال دارم.', { ...ME, born: '1955-10-13' }).en, 'I am seventy years old.');
  // the learner's words are not scored by the speaking check
  assert.deepEqual(own('My name is Maryam.', 'اسم من مریم است.').own, ['Hossein']);
  assert.deepEqual(own('My date of birth is March 5th, 1958.', 'تاریخ تولد من ۵ مارس ۱۹۵۸ است.').own, ['December', '14th', '1955']);
});

test('own version: said from single recordings where they can say it — the same pieces as «جملهٔ خودِ شما»', () => {
  assert.deepEqual(own('I was born on March 5th, 1958.', 'من در ۵ مارس ۱۹۵۸ به دنیا آمده‌ام.').say, [CARRIERS.born, 'December', 'fourteenth', 'nineteen', 'fifty-five']);
  assert.deepEqual(own('My date of birth is March 5th, 1958.', 'تاریخ تولد من ۵ مارس ۱۹۵۸ است.').say, [CARRIERS_MORE.born2, 'December', 'fourteenth', 'nineteen', 'fifty-five']);
  assert.equal(own('My date of birth is March 5th, 1958.', 'تاریخ تولد من ۵ مارس ۱۹۵۸ است.').words, 'December fourteenth, nineteen fifty-five');
  assert.deepEqual(own('My phone number is 212-555-0142.', 'شمارهٔ تلفن من ۲۱۲-۵۵۵-۰۱۴۲ است.').say.slice(0, 2), [CARRIERS.phone, 'three']);
  assert.deepEqual(own('I am sixty-five years old.', 'من شصت و پنج سال دارم.').say, ['I am', 'seventy', 'years old.']);
  assert.equal(own('My name is Maryam.', 'اسم من مریم است.').say, null, 'a name has no recording: the device voice reads it, or the learner reads it aloud');
  // every piece is asked of the voice generator (pack "me")
  const keys = new Set(audioRequests(content).filter((r) => r.pack === 'me').map((r) => r.text));
  assert.ok(keys.has(CARRIERS_MORE.born2));
});

test('own version: nothing when a detail is missing, when a sample detail would be left, or when the sentence is about somebody else', () => {
  assert.equal(own('My name is Maryam.', 'اسم من مریم است.', { ...ME, name: '' }), null);
  assert.equal(own('My name is Maryam.', 'اسم من مریم است.', { ...ME, name: 'مریم احمدی' }), null, 'a name in Farsi letters cannot stand in an English sentence');
  assert.equal(own('Hello, this is Maryam Ahmadi.', 'سلام، مریم احمدی هستم.', { ...ME, name: 'Hossein' }), null, 'a first name only: no full name to say');
  assert.equal(own('25 Oak Street, apartment 12. My zip code is 90024.', 'خیابان اوک، پلاک ۲۵، آپارتمان ۱۲. کد پستی من ۹۰۰۲۴ است.'), null);
  assert.equal(own('His name is Arman Ahmadi.', 'اسمش آرمان احمدی است.'), null);
  assert.equal(own('I live in apartment 12.', 'من در آپارتمان شمارهٔ ۱۲ زندگی می‌کنم.'), null);
  assert.equal(own('Can you call my son, please?', 'می‌شود به پسرم زنگ بزنید؟'), null, 'nothing of the sample person: nothing to change');
  assert.equal(own('My date of birth is March 5th, 1958.', 'تاریخ تولد من ۵ مارس ۱۹۵۸ است.', { ...ME, born: '0-12-14' }), null);
  // the learner may live on an Oak Street too: their own address is not taken for the sample's
  assert.equal(own('I live at 25 Oak Street.', 'من در خیابان اوک، پلاک ۲۵ زندگی می‌کنم.', { ...ME, address: '7 Oak Street' }).en, 'I live at 7 Oak Street.');
  assert.equal(ownVersion(null, 'x', ME), null);
});

test('review cards: a sentence about the sample person is shown as the learner\'s own; other cards are unchanged', () => {
  const item = { id: 'p:my-name:p1', kind: 'phrase', en: 'My first name is Maryam.', fa: 'اسم کوچک من مریم است.', ph: 'مای فِرست…', voice: 's', own: ['Maryam'], chunks: ['My first name', 'is Maryam.'] };
  const it = ownItem(item, ME, { now: AT, month: FA_MONTH });
  assert.equal(it.en, 'My first name is Hossein.');
  assert.equal(it.mine, true);
  assert.equal(it.ph, null, 'the sound guide was written for the sample name');
  assert.equal(it.chunks, null);
  assert.deepEqual(it.own, ['Hossein']);
  assert.equal(ownItem(item, {}, { now: AT }), item, 'no details yet: the lesson\'s sentence');
  const word = { id: 'w1', kind: 'word', en: 'hello', fa: 'سلام' };
  assert.equal(ownItem(word, ME), word);
  assert.equal(ownItem(null, ME), null);
  // every sentence with "own" in the course: either the learner's own version or left as it is — never half of each
  for (const L of Object.values(content.lessons)) for (const p of L.phrases.filter((x) => x.own)) {
    const v = ownItem({ id: `p:${L.id}:${p.id}`, kind: 'phrase', ...p }, ME, { now: AT, month: FA_MONTH });
    if (v.mine) assert.ok(!/Maryam|Ahmadi|A-H-M|1958|0142|Oak Street|مریم|احمدی|اِیچ|۱۹۵۸/.test(v.en + v.fa), `${L.id}: ${v.en} / ${v.fa}`);
  }
});

const SAMPLE = /Maryam|Ahmadi|A-H-M-A-D-I|1958|0142|Oak Street|مریم|احمدی|اِیچ|۱۹۵۸|۰۱۴۲/;
test('conversations (M2): the answer to tap for a personal question is the learner\'s own once «اطلاعات من» has it', () => {
  let turns = 0;
  for (const R of content.roleplays) for (const turn of R.turns.filter((x) => x.open)) {
    const got = ownReplies(turn.replies, ME, { now: AT, month: FA_MONTH });
    if (!turn.replies.some((r) => SAMPLE.test(r.en))) { assert.equal(got, turn.replies, `${R.id}: nothing personal to change`); continue; }
    if (!got.some((r) => r.mine)) continue;
    turns++;
    assert.ok(got.length >= 1);
    for (const r of got.filter((x) => x.mine)) assert.ok(!SAMPLE.test(r.en + r.fa), `${R.id}: ${r.en} / ${r.fa}`);
    assert.ok(!got.some((r) => !r.mine && SAMPLE.test(r.en)), `${R.id}: the sample person's answer is left out next to the learner's own`);
    for (const r of got) assert.ok(turn.replies.some((x) => x.then === r.then && x.keys === r.keys), 'what follows an answer stays the same');
  }
  assert.ok(turns >= 10, `${turns} turns`);
  // the clinic's date of birth, in the conversation, with the recordings
  const clinic = content.roleplays.find((r) => r.id === 'rp-clinic');
  const t = clinic.turns.find((x) => x.open && x.replies.some((r) => /1958/.test(r.en)));
  const mine = ownReplies(t.replies, ME, { now: AT, month: FA_MONTH }).filter((r) => r.mine);
  assert.ok(mine.some((r) => r.en === 'My date of birth is December 14th, 1955.' && r.pieces && r.pieces[0] === CARRIERS_MORE.born2));
  // no details: the conversation is as it was
  for (const R of content.roleplays) for (const turn of R.turns.filter((x) => x.open)) assert.equal(ownReplies(turn.replies, {}), turn.replies);
});
