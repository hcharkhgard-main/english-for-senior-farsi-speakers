// The lesson's screens (plan), the questions on earlier lessons that open it, the "same thing in other
// words" questions, and the speaking check on sentences that carry the learner's own details.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../../tools/content.mjs';
import { blank, migrate } from '../../src/js/store.js';
import { grade, INTERVALS, LESSON_BOX } from '../../src/js/srs.js';
import { lessonOrder, shortPhrases, gistCount } from '../../src/js/learn.js';
import { scoreSpeech, markWords } from '../../src/js/match.js';
import { wordsOf } from '../../src/js/audiokey.js';
import { plan, STEPS, WARM_FULL, WARM_SHORT, lessonMinutes, warmIds, variantWrong, lessonVariants, faAlike, enAlike, digitsOf } from '../../src/js/views/lesson.js';

const content = JSON.parse(JSON.stringify(loadContent()));
const order = lessonOrder(content);
const lessons = order.map((id) => content.lessons[id]);
const kinds = (P) => P.screens.map((s) => s.kind);
const count = (P, kind) => P.screens.filter((s) => s.kind === kind).length;
const WARM = ['p:x:p1', 'p:x:p2', 'p:x:p3'];

// ---- the speaking check and the learner's own details (QA round 2, H2) --------------------------------------
test('own details: the sample name, address, date or number is not scored and never listed as "say again"', () => {
  const weak = (target, heard, own) => markWords(wordsOf(target), scoreSpeech(target, heard, { own })).filter((m) => m.word !== undefined && !m.ok).map((m) => m.text);
  // the reviewer's table: what a learner says when told to use their own details
  const table = [
    ['My name is Maryam.', 'my name is Hossein', ['Maryam'], 'hossein'],
    ['My last name is Ahmadi.', 'my last name is Karimi', ['Ahmadi'], 'karimi'],
    ['I was born on March 5th, 1958.', 'I was born on June 12th 1955', ['March', '5th', '1958'], 'june twelfth nineteen fifty five'],
    ['I live at 25 Oak Street.', 'I live at 1420 Wilshire Boulevard', ['25', 'Oak', 'Street'], 'one four two zero wilshire boulevard'],
    ['I am sixty-five years old.', 'I am seventy two years old', ['sixty-five'], 'seventy two'],
    ['My phone number is 212-555-0142.', 'my phone number is 310 555 0199', ['212-555-0142'], null],
    ["It's spelled A-H-M-A-D-I.", "it's spelled K A R I M I", ['A-H-M-A-D-I'], null],
    ['My zip code is 90024.', 'my zip code is 9 0 2 1 0', ['90024'], null],
    ["I have an appointment at ten o'clock.", 'I have an appointment at two thirty', ['ten', "o'clock"], 'two thirty'],
    ['Hello, this is Maryam Ahmadi.', 'hello this is Hossein Karimi', ['Maryam', 'Ahmadi'], 'hossein karimi'],
  ];
  for (const [target, heard, own, said] of table) {
    const r = scoreSpeech(target, heard, { own });
    assert.equal(r.verdict, 'good', `${target} / ${heard}`);
    assert.equal(r.own.said, 'own', `${target}: the learner's own details were heard`);
    if (said) assert.equal(r.own.heard, said, target);
    assert.deepEqual(weak(target, heard, own), [], `${target}: nothing to say again`);
    assert.ok(r.tokens.filter((t) => t.own).length >= 1 && r.tokens.every((t) => t.ok));
  }
  // without `own` the same answers are (rightly, for an ordinary sentence) not a full match — this is what the field is for
  assert.notEqual(scoreSpeech('My name is Maryam.', 'my name is Hossein').verdict, 'good');
  assert.deepEqual(weak('My name is Maryam.', 'my name is Hossein', null), ['Maryam.']);
  assert.equal(scoreSpeech('My name is Maryam.', 'my name is Hossein').own, undefined);
});

test('own details: the sample itself, nothing at all, and the rest of the sentence are told apart', () => {
  const own = ['Maryam'];
  assert.equal(scoreSpeech('My name is Maryam.', 'my name is Maryam', { own }).own.said, 'sample');
  assert.equal(scoreSpeech('My name is Maryam.', 'my name is Mariam', { own }).own.said, 'sample', 'a sound-alike of the sample is the sample');
  const none = scoreSpeech('My name is Maryam.', 'my name is', { own });
  assert.equal(none.own.said, 'none');
  assert.equal(none.verdict, 'good');
  // the words around the name are still checked: a misheard one is marked, the name never is
  const part = scoreSpeech('My name is Maryam.', 'my game is Hossein', { own });
  assert.equal(part.verdict, 'close');
  assert.deepEqual(markWords(wordsOf('My name is Maryam.'), part).filter((m) => !m.ok).map((m) => m.text), ['name']);
  assert.equal(markWords(wordsOf('My name is Maryam.'), part).find((m) => m.text === 'Maryam.').own, true);
  // nothing recognisable: the phone is not sure, as for any sentence
  assert.equal(scoreSpeech('My name is Maryam.', 'purple monkey dishwasher', { own }).verdict, 'unsure');
  assert.equal(scoreSpeech('My name is Maryam.', '', { own }).verdict, 'silent');
  // a "not" that the sentence does not have is never a success, wherever it was heard
  assert.notEqual(scoreSpeech('My address is 25 Oak Street.', 'my address is not 25 Oak Street', { own: ['25', 'Oak', 'Street'] }).verdict, 'good');
  assert.notEqual(scoreSpeech('I am sixty-five years old.', 'I am not seventy years old', { own: ['sixty-five'] }).verdict, 'good');
  // an entry that is not in the sentence changes nothing; an empty list is the ordinary check
  assert.equal(scoreSpeech('Nice to meet you.', 'nice to meet you', { own: ['Maryam'] }).own, undefined);
  assert.equal(scoreSpeech('Nice to meet you.', 'nice to meet you', { own: [] }).verdict, 'good');
  // only the first "ten" of this sentence is the appointment time
  const two = scoreSpeech("At ten o'clock I take ten tablets.", "at nine o'clock I take two tablets", { own: ['ten', "o'clock"] });
  assert.deepEqual(markWords(wordsOf("At ten o'clock I take ten tablets."), two).filter((m) => !m.ok).map((m) => m.text), ['ten']);
});

test('own details in the content: every "own" word is a word of its sentence', () => {
  let n = 0;
  for (const L of lessons) for (const p of L.phrases) {
    if (!p.own) continue;
    n++;
    const r = scoreSpeech(p.en, p.en, { own: p.own });
    assert.ok(r.own && r.own.said === 'sample', `${L.id} ${p.id}: "own" ${JSON.stringify(p.own)} must be found in "${p.en}"`);
    const marked = markWords(wordsOf(p.en), r).filter((m) => m.own).length;
    assert.ok(marked >= 1, `${L.id} ${p.id}`);
  }
  assert.ok(n === 0 || n >= 3, 'the lessons that have "own" words were read');
});

// ---- the plan ----------------------------------------------------------------------------------------------
test('plan: a full lesson is 20–24 screens and a short one 12–15', () => {
  for (const L of lessons) {
    const grid = L.grid ? 1 : 0;
    for (const [warm, lo, hi] of [[[], 19, 21], [WARM, 22, 24]]) {
      const n = plan(L, false, warm).screens.length;
      assert.ok(n >= lo && n <= hi, `${L.id} full with ${warm.length} warm-up questions: ${n} screens`);
    }
    for (const [warm, lo, hi] of [[[], 11, 13], [WARM, 13, 15]]) {
      const n = plan(L, true, warm).screens.length;
      assert.ok(n >= lo && n <= hi, `${L.id} short with ${warm.length} warm-up questions: ${n} screens`);
    }
  }
});

test('plan: the same steps in the same order; intro first, done last, nothing after a step has ended', () => {
  for (const L of lessons) for (const short of [false, true]) {
    const P = plan(L, short, WARM);
    const steps = P.screens.map((s) => s.step);
    assert.equal(P.screens[0].kind, 'intro');
    assert.equal(P.screens[P.screens.length - 1].kind, 'done');
    assert.deepEqual([...new Set(steps)], STEPS.filter((s) => steps.includes(s)), `${L.id}: steps in order, each in one block`);
    assert.equal(count(P, 'warm'), short ? WARM_SHORT : WARM_FULL);
    assert.equal(count(P, 'phrase'), P.phrases.length);
    assert.equal(P.phrases.length, short ? 3 : L.phrases.length);
    assert.equal(count(P, 'dialogue'), 1);
    assert.equal(count(P, 'respond'), 1);
    assert.equal(count(P, 'say'), 0, 'speaking is on the sentence card, not on screens of its own');
    assert.equal(count(P, 'grammar'), !short && L.grammar ? 1 : 0);
    assert.equal(count(P, 'grid'), L.grid ? 1 : 0);
    assert.ok(count(P, 'task') >= 1, `${L.id}: at least one real-world task`);
  }
  // with no earlier lesson finished there is no "warm" step at all
  assert.ok(!plan(lessons[0], false, []).screens.some((s) => s.step === 'warm'));
});

test('plan: every sentence is asked at least once — by ear or in a real situation — before it goes to review', () => {
  for (const L of lessons) for (const short of [false, true]) {
    const P = plan(L, short, []);
    const asked = new Set([...P.hear, ...P.screens.filter((s) => s.kind === 'task').map((s) => L.task[s.j].answer)]);
    for (const p of P.phrases) assert.ok(asked.has(p.id), `${L.id}${short ? ' (short)' : ''}: ${p.id} is never asked`);
    assert.equal(count(P, 'listen'), P.hear.length);
    assert.equal(new Set(P.hear).size, P.hear.length);
    if (short) assert.deepEqual(P.phrases.map((p) => p.id), shortPhrases(L).map((p) => p.id));
  }
});

test('plan: from stage 2 one "what did they say?" comes before the dialogue is shown; in stage 1 they come after it', () => {
  for (const L of lessons) for (const short of [false, true]) {
    const k = kinds(plan(L, short, []));
    const at = k.indexOf('dialogue'), before = k.slice(0, at).filter((x) => x === 'gist').length, after = k.slice(at).filter((x) => x === 'gist').length;
    if (!gistCount(L, short)) { assert.equal(before + after, 0); continue; }
    if (L.stage >= 2) assert.equal(before, 1, `${L.id}: one line is heard cold`);
    else assert.equal(before, 0, `${L.id}: stage 1 hears the lines after reading the dialogue`);
    assert.ok(before + after >= 1 && before + after <= 2);
    const listening = before + after + k.filter((x) => x === 'variant').length;
    assert.ok(listening <= 4, `${L.id}: ${listening} listening questions around the dialogue`);
  }
});

test('plan: it does not depend on anything but the lesson, the mode and the warm-up list', () => {
  const L = lessons[3];
  assert.deepEqual(plan(L, false, WARM), plan(L, false, WARM));
  assert.equal(plan(L, false, [...WARM, 'p:x:p4', 'p:x:p5']).screens.length, plan(L, false, WARM).screens.length, 'never more than three warm-up questions');
  assert.equal(plan(L, true, WARM).warm.length, WARM_SHORT);
});

test('honest duration: more minutes than the old "about 7", and less for a short lesson', () => {
  for (const L of lessons) {
    const [lo, hi] = lessonMinutes(L, false), [slo, shi] = lessonMinutes(L, true);
    assert.ok(lo >= 8 && hi >= 11 && hi <= 14 && lo < hi, `${L.id}: ${lo}–${hi}`);
    assert.ok(slo >= 4 && shi <= 9 && shi < hi, `${L.id} short: ${slo}–${shi}`);
  }
});

// ---- the questions on earlier lessons ------------------------------------------------------------------------
const learner = (...done) => {
  const s = blank();
  for (const id of done) { s.done[id] = { t: 1, n: 1 }; for (const p of content.lessons[id].phrases) s.srs[`p:${id}:${p.id}`] = { b: LESSON_BOX, d: 100 + INTERVALS[LESSON_BOX], n: 0 }; }
  return s;
};

test('warm-up: nothing on the very first lesson; from the second on, three sentences of other finished lessons', () => {
  assert.deepEqual(warmIds(blank(), content, 100, order[0]), []);
  const s = learner(order[0]);
  const w = warmIds(s, content, 101, order[1]);
  assert.equal(w.length, 3);
  for (const k of w) assert.ok(k.startsWith(`p:${order[0]}:`), k);
  assert.equal(new Set(w).size, 3);
  // never a sentence of the lesson being opened (also when it is being repeated)
  for (const k of warmIds(learner(order[0], order[1]), content, 101, order[1])) assert.ok(!k.startsWith(`p:${order[1]}:`), k);
  assert.deepEqual(warmIds(learner(order[0]), content, 101, order[0]), [], 'repeating the only finished lesson: nothing to ask');
});

test('warm-up: what is due comes first; the other places go to what was practised longest ago, from different lessons', () => {
  const s = learner(order[0], order[1], order[2]);
  s.srs[`p:${order[1]}:p4`].d = 90;                       // due
  const w = warmIds(s, content, 101, order[5]);
  assert.equal(w[0], `p:${order[1]}:p4`, 'the due sentence is asked first');
  assert.equal(new Set(w.map((k) => k.split(':')[1])).size, 3, 'three lessons, one sentence each');
  // answered early and known: the review date does not move, but it is not asked again the next day
  const day = 101;
  for (const k of w) s.srs[k] = grade(s.srs[k], true, day);
  assert.equal(s.srs[w[1]].d, 100 + INTERVALS[LESSON_BOX], 'known before its day: not moved further ahead');
  assert.ok(s.srs[w[0]].d > day + 4, 'the due one moved on');
  const next = warmIds(s, content, day + 1, order[6]);
  for (const k of next) assert.ok(!w.includes(k), `${k} was asked yesterday`);
  // a sentence that needed another try comes before the others of the same age
  const t = learner(order[0]);
  t.hard[`${order[0]}:p5`] = 2;
  assert.equal(warmIds(t, content, 101, order[1])[0], `p:${order[0]}:p5`);
  // answered wrongly: it is due tomorrow and therefore asked first in the next lesson
  t.srs[`p:${order[0]}:p2`] = grade(t.srs[`p:${order[0]}:p2`], false, 101);
  assert.equal(warmIds(t, content, 102, order[1])[0], `p:${order[0]}:p2`);
});

test('warm-up: the saved place of a lesson keeps its warm-up list, and a damaged one is harmless', () => {
  const s = blank();
  s.at.x = { pos: 4, short: false, t: 5, seed: 0.5, warm: ['p:a:p1', 7, 'p:b:p2', 'p:c:p3', 'p:d:p4'] };
  s.at.y = { pos: 2, short: true, t: 5, warm: 'nonsense' };
  const m = migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(m.at.x.warm, ['p:a:p1', 'p:b:p2', 'p:c:p3']);
  assert.equal(m.at.y.warm, undefined);
  assert.equal(m.at.x.pos, 4);
});

// ---- the same thing in other words ----------------------------------------------------------------------------
test('variants: the wrong answers never mean the same as the variant or as the line it stands for', () => {
  const L = {
    stage: 2, phrases: [{ id: 'p1', en: 'My date of birth is March 5th, 1958.', fa: 'تاریخ تولد من ۵ مارس ۱۹۵۸ است.' }, { id: 'p2', en: 'Here is my insurance card.', fa: 'این کارت بیمهٔ من است.' }, { id: 'p3', en: 'I have an appointment.', fa: 'وقت قبلی دارم.' }],
    dialogue: { lines: [{ who: 'them', en: 'Good morning. How can I help you?', fa: 'صبح به‌خیر. چه کمکی از من برمی‌آید؟' }, { who: 'them', en: 'And your date of birth?', fa: 'و تاریخ تولدتان؟' }, { who: 'them', en: 'Please have a seat.', fa: 'لطفاً بنشینید.' }, { who: 'you', en: 'Thank you.', fa: 'ممنون.' }] },
    respond: { them: { en: 'Do you have an appointment?', fa: 'وقت قبلی دارید؟' } },
    variants: [
      { en: 'When were you born?', fa: 'کی به دنیا آمده‌اید؟', like: 'What is your date of birth?' },
      { en: 'Can you confirm your date of birth?', fa: 'می‌شود تاریخ تولدتان را تأیید کنید؟', like: 'What is your date of birth?' },
      { en: 'Take a seat.', fa: 'بنشینید.', like: 'Please have a seat.' },
    ],
  };
  const born = variantWrong(L, L.variants[0]);
  assert.ok(!born.includes('و تاریخ تولدتان؟'), 'the same question in the dialogue is not offered as a wrong answer');
  assert.ok(!born.includes('می‌شود تاریخ تولدتان را تأیید کنید؟'), 'nor is another variant of the same line');
  assert.ok(!born.includes('تاریخ تولد من ۵ مارس ۱۹۵۸ است.'), 'nor the sentence that shares its words');
  assert.ok(born.includes('بنشینید.') && born.includes('وقت قبلی دارید؟'));
  assert.ok(!born.includes('صبح به‌خیر. چه کمکی از من برمی‌آید؟'), '"How can I help you?" can stand for almost any first question: never a wrong answer');
  assert.ok(!born.includes('لطفاً بنشینید.'), 'two wrong answers that say nearly the same thing are not both offered');
  const seat = variantWrong(L, L.variants[2]);
  assert.ok(!seat.includes('لطفاً بنشینید.'), 'the line a variant stands for is never a wrong answer');
  assert.ok(seat.length >= 2);
  assert.ok(!(seat.includes('کی به دنیا آمده‌اید؟') && seat.includes('می‌شود تاریخ تولدتان را تأیید کنید؟')), 'two variants of one line are one meaning: never both wrong answers (QA round 3, L6)');
  assert.equal(lessonVariants(L).length, 3);
  // a variant that cannot get two safe wrong answers is not asked at all
  const thin = { ...L, phrases: [L.phrases[0]], dialogue: { lines: [L.dialogue.lines[1]] }, respond: { them: { en: 'Date of birth?', fa: 'تاریخ تولد؟' } }, variants: [L.variants[0]] };
  assert.equal(lessonVariants(thin).length, 0);
  assert.ok(faAlike('و تاریخ تولدتان؟', 'تاریخ تولدتان چیست؟') && !faAlike('لطفاً بنشینید.', 'وقت قبلی دارید؟'));
  assert.ok(enAlike('And your date of birth?', 'What is your date of birth?') && !enAlike('What is your last name?', 'What is your phone number?'));
});

test('variants in the content: each has a meaning, a line it stands for, and at least two safe wrong answers', () => {
  for (const L of lessons) {
    if (!L.variants) continue;
    for (const v of L.variants) {
      const wrong = variantWrong(L, v);
      assert.ok(wrong.length >= 2, `${L.id}: "${v.en}" has ${wrong.length} usable wrong answers`);
      assert.ok(!wrong.includes(v.fa));
      for (const fa of wrong) assert.ok(!faAlike(fa, v.fa), `${L.id}: «${fa}» is too close to «${v.fa}»`);
    }
    assert.equal(lessonVariants(L).length, L.variants.length, L.id);
    const P = plan(L, false, []);
    assert.equal(count(P, 'variant'), Math.min(3, L.variants.length), L.id);
    assert.equal(count(plan(L, true, []), 'variant'), L.grid ? 0 : 1, `${L.id}: a short lesson asks one (none where it already has a page of words)`);
  }
});

// ---- small things -----------------------------------------------------------------------------------------------
test('a page of words: number words get their number, other words do not; every word of a grid is in the word list', () => {
  assert.equal(digitsOf('fifteen'), '15');
  assert.equal(digitsOf('zero'), '0');
  assert.equal(digitsOf('one hundred'), '100');
  assert.equal(digitsOf('twenty-one'), '21');
  assert.equal(digitsOf('Monday'), '');
  for (const L of lessons) if (L.grid) for (const w of L.grid.words) assert.ok(content.vocab.some((x) => x.en === w), `${L.id}: grid word "${w}" is not in vocabulary.json`);
});

test('respond: a second unsuitable answer, where a lesson names one, is a sentence of that lesson and not one of the good answers', () => {
  for (const L of lessons) {
    const k = L.respond.off2;
    if (k == null) continue;
    const p = L.phrases.find((x) => x.id === k);
    assert.ok(p, `${L.id}: respond.off2 "${k}" is not a sentence of the lesson`);
    assert.ok(!L.respond.ok.some((o) => o.en === p.en || o.en.includes(p.en.replace(/[.?!]$/, ''))), `${L.id}: "${p.en}" is (part of) a good answer`);
    assert.notEqual(p.en, L.respond.off.en, `${L.id}: off2 repeats the first unsuitable answer`);
  }
});
