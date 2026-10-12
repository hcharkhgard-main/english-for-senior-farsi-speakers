import test from 'node:test';
import assert from 'node:assert/strict';
import { grade, buildQueue, answered, minutes, cardMode, counts, INTERVALS, LESSON_BOX, KNOWN_BOX, NEW_PER_DAY, SESSION_MAX, SETS_PER_DAY, NEW_RESERVED, OLDEST_KEPT } from '../../src/js/srs.js';
import { createStore, blank, migrate, today } from '../../src/js/store.js';
import { loadContent } from '../../tools/content.mjs';
import { simulate, fourAWeek, everyDay } from '../../tools/simulate-review.mjs';

// ---- scheduling one item -----------------------------------------------------------------

test('known items wait longer each time; forgotten ones return tomorrow', () => {
  // a new word that was not known: tomorrow, then 4, 12, 30, 75 and 180 days
  let e = grade(null, false, 100);
  assert.deepEqual(e, { b: 1, d: 101, n: 1, l: 100 });
  const waits = [];
  for (let k = 0; k < 6; k++) { const day = e.d; e = grade(e, true, day); waits.push(e.d - day); }
  assert.deepEqual(waits, [4, 12, 30, 75, 180, 180]);
  assert.equal(e.b, 6, 'the last box is the ceiling');
  // forgotten: tomorrow, two boxes lower — not from the start (one slip does not undo weeks of knowing it)
  assert.deepEqual(grade({ b: 6, d: 300, n: 9, l: 120 }, false, 300), { b: 4, d: 301, n: 10, l: 300 });
  assert.equal(grade({ b: 2, d: 300, n: 3, l: 296 }, false, 300).b, 1);
  assert.equal(grade({ b: 0, d: 300, n: 0 }, false, 300).b, 1);
  // a lesson sentence (no "last answered" yet): four days after the lesson it moves on like anything else
  assert.deepEqual(grade({ b: LESSON_BOX, d: 104, n: 0 }, true, 104), { b: 3, d: 104 + INTERVALS[3], n: 1, l: 104 });
});

test('a new word the learner already knew does not cost four reviews', () => {
  const e = grade(null, true, 100);
  assert.deepEqual(e, { b: KNOWN_BOX, d: 100 + INTERVALS[KNOWN_BOX], n: 1, l: 100 });
  assert.ok(INTERVALS[KNOWN_BOX] >= 10 && INTERVALS[KNOWN_BOX] <= 14, 'it is looked at again within two weeks, not forgotten about');
  // if that turns out to have been optimistic it comes back tomorrow like anything else
  assert.deepEqual(grade(e, false, 112), { b: 1, d: 113, n: 2, l: 112 });
  // only a first meeting counts: an item with a history is never jumped ahead
  assert.equal(grade({ b: 0, d: 100, n: 0 }, true, 100).b, 1);
});

test('a second answer on the same day never moves an item further ahead', () => {
  // «هنوز نه», then «بلد بودم» a minute later (the repeat at the end of the set): still due tomorrow
  const missed = grade(null, false, 100);
  const repeated = grade(missed, true, 100);
  assert.equal(repeated.d, 101);
  assert.equal(repeated.b, 1);
  assert.equal(repeated.n, 2);
  // a word missed once is never scheduled later than a word known at first sight
  assert.ok(repeated.d <= grade(null, true, 100).d);
  // «بلد بودم» twice on one day counts once
  const twice = grade(grade({ b: 2, d: 100, n: 3, l: 96 }, true, 100), true, 100);
  assert.equal(twice.b, 3);
  assert.equal(twice.d, 100 + INTERVALS[3]);
  // …but a later «هنوز نه» on the same day does bring it back tomorrow
  assert.deepEqual(grade(grade({ b: 2, d: 100, n: 3, l: 96 }, true, 100), false, 100), { b: 1, d: 101, n: 5, l: 100 });
  // the next day it moves on normally
  assert.equal(grade(repeated, true, 101).b, 2);
  // entries saved by an older build have no "l": they are graded like any other
  assert.deepEqual(grade({ b: 1, d: 100, n: 1 }, true, 100), { b: 2, d: 100 + INTERVALS[2], n: 2, l: 100 });
});

test('a question answered before its day (inside a lesson) changes nothing unless it was missed', () => {
  const e = { b: 3, d: 110, n: 2, l: 98 };
  assert.deepEqual(grade(e, true, 104), { b: 3, d: 110, n: 3, l: 104 });
  assert.deepEqual(grade(e, false, 104), { b: 1, d: 105, n: 3, l: 104 });
  // yesterday's lesson sentence, asked in today's lesson: its first review still comes on its day
  assert.deepEqual(grade({ b: LESSON_BOX, d: 104, n: 0 }, true, 101), { b: LESSON_BOX, d: 104, n: 1, l: 101 });
});

test('something still known after a much longer wait than planned skips a step — two boxes at most', () => {
  // planned after 4 days, reviewed after 5: one box up, as usual
  assert.equal(grade({ b: 2, d: 104, n: 1, l: 100 }, true, 105).b, 3);
  // planned after 4 days, reviewed after 20 and still known: the next wait is 30 days, not 12
  assert.deepEqual(grade({ b: 2, d: 104, n: 1, l: 100 }, true, 120), { b: 4, d: 150, n: 2, l: 120 });
  // … and never more than two boxes, however long it waited
  assert.equal(grade({ b: 2, d: 104, n: 1, l: 100 }, true, 400).b, 4);
  assert.equal(grade({ b: 1, d: 101, n: 1, l: 100 }, true, 200).b, 3);
  // a lesson sentence that waited (no "l": counted from the day of the lesson)
  assert.equal(grade({ b: LESSON_BOX, d: 104, n: 0 }, true, 118).b, 4);
  assert.equal(grade({ b: 0, d: 100, n: 0 }, true, 101).b, 1);
  assert.equal(grade({ b: 0, d: 100, n: 0 }, true, 103).b, 2);
  assert.equal(grade({ b: 0, d: 100, n: 0 }, true, 160).b, 2);
  // a long wait that ends in «هنوز نه» is treated like any other miss
  assert.deepEqual(grade({ b: 3, d: 112, n: 2, l: 100 }, false, 150), { b: 1, d: 151, n: 3, l: 150 });
  // the top of the ladder stays the top
  assert.equal(grade({ b: 5, d: 200, n: 6, l: 125 }, true, 500).b, 6);
  // damaged storage (a box that does not exist, a count that is not a number) never produces an item that is lost for ever
  for (const bad of [{ b: 99, d: 100, n: 1 }, { b: -5, d: 100, n: 1 }, { b: 'x', d: 100, n: 'y' }, { d: 100 }]) for (const knew of [true, false]) {
    const e = grade(bad, knew, 100);
    assert.ok(Number.isInteger(e.b) && e.b >= 0 && e.b < INTERVALS.length && Number.isInteger(e.d) && e.d > 100 && Number.isInteger(e.n), JSON.stringify([bad, e]));
  }
});

// ---- building a set ------------------------------------------------------------------------

const ids = (prefix, n) => Array.from({ length: n }, (_, i) => prefix + (i + 1));

test('set: what is due comes first, then new words in the places that are left — six a day at most', () => {
  const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const srs = { a: { b: 1, d: 99, n: 1 }, b: { b: 2, d: 150, n: 2 } };
  const q = buildQueue(srs, pool, 100);
  assert.deepEqual(q.queue, ['a', 'c', 'd', 'e', 'f', 'g', 'h']);
  assert.deepEqual([q.nDue, q.nNew, q.more, q.set], [1, NEW_PER_DAY, 0, 1]);
  assert.equal(counts(srs, pool, 100).due, 1);
  // today's new words are counted; yesterday's are not
  assert.deepEqual(buildQueue(srs, pool, 100, { d: 100, n: 4, c: 4 }).queue, ['a', 'c', 'd']);
  assert.deepEqual(buildQueue(srs, pool, 100, { d: 100, n: NEW_PER_DAY, c: 6 }).queue, ['a']);
  assert.equal(buildQueue(srs, pool, 100, { d: 99, n: NEW_PER_DAY, c: 30 }).nNew, NEW_PER_DAY);
  // nothing outside the pool (a removed lesson, a harder level) is ever shown
  assert.deepEqual(buildQueue({ gone: { b: 1, d: 1, n: 1 } }, ['w1'], 100).queue, ['w1']);
  // a set is never longer than fifteen cards
  const many = Object.fromEntries(ids('p', 80).map((id) => [id, { b: 2, d: 90, n: 1 }]));
  const full = buildQueue(many, [...Object.keys(many), ...ids('w', 30)], 100);
  assert.equal(full.queue.length, SESSION_MAX);
  assert.equal(full.more, 80 - SESSION_MAX);
});

test('set: the first words have three places a day whatever is waiting; other new words wait for room', () => {
  const due = ids('p', 40), words = ids('w', 30);
  const srs = Object.fromEntries(due.map((id) => [id, { b: 1, d: 90, n: 1 }]));
  const pool = [...due, ...words];
  // far behind, and the first list is not finished: twelve reviews and three new words
  const q = buildQueue(srs, pool, 100, { d: 0, n: 0 }, { core: 30 });
  assert.equal(q.queue.length, SESSION_MAX);
  assert.deepEqual([q.nDue, q.nNew], [SESSION_MAX - NEW_RESERVED, NEW_RESERVED]);
  assert.deepEqual(q.queue.slice(-NEW_RESERVED), words.slice(0, NEW_RESERVED));
  assert.equal(q.more, 40 - (SESSION_MAX - NEW_RESERVED));
  // the kept places are per day, not per set: the second set of the day is all review
  const second = buildQueue(srs, pool, 100, { d: 100, n: NEW_RESERVED, c: SESSION_MAX }, { core: 27 });
  assert.deepEqual([second.nDue, second.nNew, second.set], [SESSION_MAX, 0, 2]);
  // two first words left: two places are kept, not three
  assert.equal(buildQueue(srs, pool, 100, { d: 0, n: 0 }, { core: 2 }).nNew, 2);
  // the first list is finished: new words only when the reviews leave room
  assert.equal(buildQueue(srs, pool, 100, { d: 0, n: 0 }, { core: 0 }).nNew, 0);
  assert.equal(buildQueue(srs, pool, 100).nNew, 0);
  const few = Object.fromEntries(ids('p', 11).map((id) => [id, { b: 1, d: 90, n: 1 }]));
  assert.deepEqual(buildQueue(few, [...Object.keys(few), ...words], 100).nNew, 4);
  // caught up: six new words, in the order of the pool
  assert.deepEqual(buildQueue({}, words, 100).queue, words.slice(0, NEW_PER_DAY));
});

test('set: when too much is due, the most recently learned come first — and four places go to what has waited longest', () => {
  const srs = {};
  ids('fresh', 20).forEach((id, i) => { srs[id] = { b: 1 + (i % 2), d: 100 - (i % 3), n: 1 }; });       // yesterday's words, the latest lesson
  ids('old', 10).forEach((id, i) => { srs[id] = { b: 4, d: 60 + i, n: 5 }; });                          // known for weeks, waiting for weeks
  const q = buildQueue(srs, Object.keys(srs), 100);
  assert.equal(q.queue.length, SESSION_MAX);
  const front = q.queue.slice(0, SESSION_MAX - OLDEST_KEPT), back = q.queue.slice(-OLDEST_KEPT);
  assert.ok(front.every((id) => id.startsWith('fresh')));
  assert.ok(front.slice(0, 10).every((id) => srs[id].b === 1), 'box 1 before box 2');
  assert.deepEqual(back, ['old1', 'old2', 'old3', 'old4'], 'the four that have waited longest, whatever their box');
  // with room for everything nothing is reordered or left out
  const small = { old: { b: 4, d: 80, n: 5 }, mid: { b: 2, d: 95, n: 2 }, missed: { b: 1, d: 100, n: 2 }, lesson: { b: 0, d: 100, n: 0 } };
  assert.deepEqual(buildQueue(small, Object.keys(small), 100).queue, ['lesson', 'missed', 'mid', 'old']);
  // the oldest item is never passed over for long: with twelve fresh things due every day it is still shown today
  assert.ok(buildQueue(srs, Object.keys(srs), 100, { d: 0, n: 0 }, { max: 6 }).queue.includes('old1'));
});

test('the day: two sets; a set left half-way is finished first; the count starts again each morning', () => {
  const srs = Object.fromEntries(ids('p', 50).map((id) => [id, { b: 2, d: 90, n: 1 }]));
  const pool = Object.keys(srs);
  let newDay = { d: 0, n: 0 };
  assert.deepEqual(answered(newDay, 100, true), { d: 100, n: 1, c: 1 });
  assert.deepEqual(answered({ d: 100, n: 1, c: 1 }, 100, false), { d: 100, n: 1, c: 2 });
  assert.deepEqual(answered({ d: 99, n: 6, c: 30 }, 100, false), { d: 100, n: 0, c: 1 });
  assert.deepEqual(answered({ d: 100, n: 2 }, 100, true), { d: 100, n: 3, c: 1 }, 'a count saved by an older build has no "c"');
  // ten cards answered, then the learner leaves: what is offered next is the rest of the first set
  for (let k = 0; k < 10; k++) newDay = answered(newDay, 100, false);
  let q = buildQueue(srs, pool, 100, newDay);
  assert.deepEqual([q.set, q.queue.length], [1, 5]);
  for (let k = 0; k < 5; k++) newDay = answered(newDay, 100, false);
  q = buildQueue(srs, pool, 100, newDay);
  assert.deepEqual([q.set, q.queue.length], [2, SESSION_MAX]);
  for (let k = 0; k < SESSION_MAX; k++) newDay = answered(newDay, 100, false);
  q = buildQueue(srs, pool, 100, newDay);
  assert.ok(q.set > SETS_PER_DAY, 'both sets are done: the home screen says the day\'s review is finished');
  assert.equal(q.queue.length, SESSION_MAX, '…though a learner who asks for more can have another set');
  // next morning
  assert.equal(buildQueue(srs, pool, 101, newDay).set, 1);
  // five minutes for a full set, never "0 minutes"
  assert.equal(minutes(SESSION_MAX), 5);
  assert.equal(minutes(1), 1);
  assert.equal(minutes(6), 2);
});

test('cards: read when new or missed, then heard first, then every other time asked from the Farsi', () => {
  // a word
  assert.equal(cardMode('w1', undefined), 'read');
  assert.equal(cardMode('w1', { b: 1, d: 5, n: 1 }), 'read');
  assert.equal(cardMode('w1', { b: 2, d: 5, n: 2 }), 'hear');
  assert.equal(cardMode('w1', { b: 2, d: 5, n: 3 }), 'hear', 'a word joins the turns one box later');
  assert.equal(cardMode('w1', { b: 3, d: 5, n: 3 }), 'say');
  assert.equal(cardMode('w1', { b: 4, d: 5, n: 4 }), 'hear');
  assert.equal(cardMode('w1', { b: KNOWN_BOX, d: 5, n: 1 }), 'say', 'a word the learner said they knew is asked the hard way round next time');
  // a lesson sentence: heard at its first return, asked from the Farsi at the next
  assert.equal(cardMode('p:a:p1', { b: 0, d: 5, n: 0 }), 'read');
  assert.equal(cardMode('p:a:p1', { b: LESSON_BOX, d: 5, n: 0 }), 'hear');
  assert.equal(cardMode('p:a:p1', { b: 3, d: 5, n: 1 }), 'say');
  assert.equal(cardMode('p:a:p1', { b: 4, d: 5, n: 2 }), 'hear');
  assert.equal(cardMode('p:a:p1', { b: 1, d: 5, n: 3 }), 'read', 'missed last time: the English is on the card again');
  // items whose Farsi side would give the answer away are never asked from the Farsi
  assert.equal(cardMode('w1', { b: 3, d: 5, n: 3 }, false), 'hear');
  assert.equal(cardMode('p:a:p1', { b: 3, d: 5, n: 1 }, false), 'hear');
});

// ---- the plan, tried out for 120 days on the real course (tools/simulate-review.mjs) --------------------------

const content = JSON.parse(JSON.stringify(loadContent()));
const at = (r, day) => r.log[day - 1];

test('plan: with two sets a day nothing waits for long, at four lessons a week and at one a day', () => {
  // (a lesson a day is the heaviest load there is: for some weeks in the second month up to a few dozen things known
  // at least twice wait a few days — never anything recently learned, and never for long)
  for (const [name, lessonDays, late, left, words] of [['4 lessons a week', fourAWeek, 4, 45, 250], ['1 lesson a day', everyDay, 10, 120, 220]]) {
    const r = simulate(content, { lessonDays, sittings: 2, recall: 80 });
    assert.equal(r.biggestSet, SESSION_MAX, name);
    assert.ok(r.log.every((x) => x.sets <= SETS_PER_DAY));
    assert.ok(r.longestWait <= late, `${name}: something waited ${r.longestWait} days`);
    assert.ok(r.peak <= left, `${name}: ${r.peak} items were waiting at one point`);
    assert.ok(Math.max(...r.log.map((x) => x.recentWaiting)) <= 30, `${name}: recently learned things were left waiting`);
    assert.equal(at(r, 120).late30, 0, name);
    assert.ok(r.firstListDay <= 28, `${name}: the first words took until day ${r.firstListDay}`);
    assert.ok(at(r, 120).words >= words, `${name}: only ${at(r, 120).words} words met in 120 days`);
    assert.equal(at(r, 120).sentences, at(r, 120).lessons * 5, 'every sentence of every finished lesson is in review');
  }
  // a learner who remembers less gets fewer new words, not a pile: still nothing waits for long at four lessons a week
  const weak = simulate(content, { lessonDays: fourAWeek, sittings: 2, recall: 65 });
  assert.ok(weak.longestWait <= 8, `recall 65%: something waited ${weak.longestWait} days`);
  assert.ok(weak.firstListDay <= 35);
});

test('plan: with one set a day the first words are all met within about six weeks, in the order the lessons need them', () => {
  for (const [name, lessonDays] of [['4 lessons a week', fourAWeek], ['1 lesson a day', everyDay]]) for (const recall of [65, 80, 92]) {
    const r = simulate(content, { lessonDays, sittings: 1, recall });
    const who = `${name}, recall ${recall}%`;
    assert.ok(r.firstListDay <= 45, `${who}: the first words took until day ${r.firstListDay}`);
    for (const [word, by] of [['fifteen', 12], ['Monday', 18], ['appointment', 24], ['pharmacy', 26], ['March', 40]]) assert.ok(r.dayOf(word) <= by, `${who}: "${word}" first came on day ${r.dayOf(word)}`);
    assert.ok(r.log.every((x) => x.sets <= 1 && x.cards <= 2 * SESSION_MAX), who);
    assert.equal(r.biggestSet, SESSION_MAX, who);
    // what cannot be reached waits, but not for ever: nothing is more than two months late
    assert.ok(r.longestWait <= 60, `${who}: something waited ${r.longestWait} days`);
  }
});

test('counts: known, learning, due and unseen', () => {
  const srs = { a: { b: 4, d: 200, n: 5 }, b: { b: 1, d: 100, n: 1 }, c: { b: 0, d: 99, n: 0 }, x: { b: 5, d: 1, n: 9 } };
  assert.deepEqual(counts(srs, ['a', 'b', 'c', 'd', 'e'], 100), { learning: 2, known: 1, due: 2, unseen: 2 });
});

// ---- saved state ----------------------------------------------------------------------------

const bagStorage = (bag = {}) => ({ bag, getItem: (k) => bag[k] ?? null, setItem: (k, v) => { bag[k] = v; }, removeItem: (k) => { delete bag[k]; } });

test('store survives broken storage and keeps data across reloads', () => {
  const storage = bagStorage();
  const s = createStore(storage);
  s.update((st) => { st.done['social-hello'] = { t: 1, n: 1 }; st.settings.scale = 1.3; st.at['store-where'] = { pos: 7, short: true, t: 5, seed: 0.25 }; st.heard.n3 = 2; });
  const s2 = createStore(storage);
  assert.equal(s2.state.done['social-hello'].n, 1);
  assert.equal(s2.state.settings.scale, 1.3);
  assert.deepEqual(s2.state.at['store-where'], { pos: 7, short: true, t: 5, seed: 0.25 });
  assert.deepEqual(s2.state.heard, { n3: 2 });
  s2.reset(true);
  assert.deepEqual(s2.state.done, {});
  assert.deepEqual(s2.state.at, {});
  assert.deepEqual(s2.state.heard, {});
  assert.equal(s2.state.settings.scale, 1.3);
  s2.wipe();
  assert.equal(storage.bag['hamrah.v1'], undefined);

  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  const s3 = createStore(broken);
  s3.update((st) => { st.at.x = { pos: 2, short: false, t: 1 }; });
  assert.equal(s3.state.at.x.pos, 2);
  assert.equal(s3.persistent, false);
  assert.equal(createStore({ getItem: () => '{bad json', setItem() {}, removeItem() {} }).state.v, blank().v);
  assert.ok(Number.isInteger(today()));
});

test('migration: the old single "current" lesson becomes that lesson\'s own saved place', () => {
  const old = { v: 1, onboard: { done: true, level: 'little', focus: 'listen', scenario: 'store' }, settings: { scale: 1.15, rate: 0.88, ph: false, faVoice: true, auto: false, ai: true, micOk: true },
    me: { name: 'Maryam Ahmadi', address: '', contact: '' }, current: { id: 'store-where', pos: 9, short: true },
    done: { 'social-hello': { t: 5, n: 2 } }, hard: { 'social-hello:p2': 1 }, rp: { 'rp-store': 1 }, srs: { 'p:social-hello:p1': { b: 2, d: 20500, n: 2 } }, fav: { w3: 1 }, newDay: { d: 20499, n: 4 }, said: { 'p:social-hello:p1': 0.9 }, built: { 'where-is': 3 } };
  const s = createStore(bagStorage({ 'hamrah.v1': JSON.stringify(old) })).state;
  assert.equal(s.at['store-where'].pos, 9);
  assert.equal(s.at['store-where'].short, true);
  assert.ok(s.at['store-where'].t > 0);
  assert.equal('current' in s, false);
  // everything else is carried over untouched
  for (const k of ['settings', 'done', 'hard', 'rp', 'srs', 'fav', 'newDay', 'said', 'built']) assert.deepEqual(s[k], old[k], k);
  assert.deepEqual(s.me, { ...blank().me, ...old.me }, 'me: what was saved is kept; details added by a newer build start empty');
  assert.deepEqual(s.onboard, { ...old.onboard, step: 0 });
  // and it is stable: saving and loading again changes nothing
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(s))), s);
});

test('migration: a lesson that was only looked at, or a damaged entry, leaves no place to resume', () => {
  const at = (current, extra = {}) => migrate({ v: 1, current, ...extra }).at;
  assert.deepEqual(at({ id: 'a', pos: 0, short: false }), {});              // intro only: nothing to continue
  assert.deepEqual(at({ id: 'a', step: 2, idx: 1 }), {});                   // a very old shape without "pos" (used to break the lesson screen)
  assert.equal(at({ id: 'a', pos: '4' }).a.pos, 4);                         // a number saved as text is still a number
  assert.equal(at({ id: 'a', pos: '4' }).a.short, false);
  assert.deepEqual(at(null), {});
  assert.deepEqual(at('x'), {});
  // a place already saved in the new shape wins over a stale "current"
  assert.equal(at({ id: 'a', pos: 3 }, { at: { a: { pos: 8, short: false, t: 1 } } }).a.pos, 8);
  // rubbish inside "at" is dropped, good entries are kept
  assert.deepEqual(migrate({ v: 1, at: { a: null, b: { pos: 'x' }, c: { pos: -2 }, d: { pos: 5.9, short: 1, t: 'x', seed: 'y' }, e: 7 } }).at, { d: { pos: 5, short: true, t: 0 } });
});

test('migration: wrong versions and wrong types fall back to safe values', () => {
  assert.deepEqual(migrate(null), blank());
  assert.deepEqual(migrate([]), blank());
  assert.deepEqual(migrate({ v: 7, done: { a: 1 } }), blank());
  const s = migrate({ v: 1, done: 'oops', srs: [1, 2], settings: null, newDay: 5, fav: { w1: 1 }, unknown: { x: 1 } });
  assert.deepEqual(s.done, {});
  assert.deepEqual(s.srs, {});
  assert.deepEqual(s.settings, blank().settings);
  assert.deepEqual(s.newDay, { d: 0, n: 0 });
  assert.deepEqual(s.fav, { w1: 1 });
  assert.equal('unknown' in s, false);
  // settings added by a newer build get their default; saved ones keep their value
  assert.equal(migrate({ v: 1, settings: { scale: 1.5 } }).settings.rate, 1);
  assert.equal(migrate({ v: 1, settings: { scale: 1.5 } }).settings.scale, 1.5);
});
