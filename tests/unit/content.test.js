// The shape in which tools/content.mjs hands the optional fields of development pass 3 to the app
// (documented in docs/CONTENT-REVIEW.md, "Optional fields").
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, audioRequests, normaliseLesson, normaliseRoleplay, normalisePaper, VOICES } from '../../tools/content.mjs';
import { audioKey } from '../../src/js/audiokey.js';

const lesson = (extra = {}, phrase = {}) => ({
  id: 'x', scenario: 'me', minutes: 7, title: { fa: 'ت', en: 'T' }, intro: 'م', canDo: 'ک', them: { role: 'ن', voice: 'b' },
  phrases: [{ en: 'My name is Maryam.', fa: 'ا', ph: 'ا', note: 'ا', chunks: ['My name is Maryam.'], ...phrase }, { en: 'Two.', fa: 'د', ph: 'د', note: 'د', chunks: ['Two.'] }, { en: 'Three.', fa: 'س', ph: 'س', note: 'س', chunks: ['Three.'] }],
  dialogue: { setting: 'ص', lines: [['them', 'Hi.', 'س'], ['you', 'Hi.', 'س']] },
  respond: { setting: 'ص', them: ['Hi.', 'س'], ok: [['Hi.', 'س']], off: ['No.', 'ن', 'چ'] }, task: [['ک', 1]], ...extra,
});

test('lesson: own, mission, variants and grid are passed through in one shape; absent or empty means absent', () => {
  const problems = [];
  const plain = normaliseLesson(lesson({ mission: '', variants: [], grid: { title: 'ع', words: [] } }, { own: [] }), problems);
  assert.deepEqual(problems, []);
  for (const k of ['mission', 'variants', 'grid']) assert.equal(k in plain, false, k);
  assert.equal('own' in plain.phrases[0], false);
  const L = normaliseLesson(lesson({
    mission: '  امروز بگویید: Hello!  ',
    variants: [{ en: 'When were you born?', fa: 'کی به دنیا آمده‌اید؟', like: 'What is your date of birth?' }, { en: 'Last name?', fa: 'نام خانوادگی؟', like: 'What is your last name?', voice: 'k', extra: 1 }],
    grid: { title: ' عددها ', words: ['zero', ' one '] },
  }, { own: ['Maryam '] }), problems);
  assert.deepEqual(problems, []);
  assert.equal(L.mission, 'امروز بگویید: Hello!');
  assert.deepEqual(L.phrases[0].own, ['Maryam']);
  assert.equal('own' in L.phrases[1], false);
  assert.deepEqual(L.variants, [
    { en: 'When were you born?', fa: 'کی به دنیا آمده‌اید؟', like: 'What is your date of birth?', voice: 'b' },      // the lesson's partner voice
    { en: 'Last name?', fa: 'نام خانوادگی؟', like: 'What is your last name?', voice: 'k' }]);
  assert.deepEqual(L.grid, { title: 'عددها', note: '', words: ['zero', 'one'] });
  assert.deepEqual(L.phrases.map((p) => p.id), ['p1', 'p2', 'p3']);
  // a field of the wrong form is left out and reported (the validator turns the report into an error)
  const bad = normaliseLesson(lesson({ mission: 7, variants: 'x', grid: { words: 'zero' } }, { own: 'Maryam' }), problems);
  assert.equal(problems.length, 4);
  for (const k of ['mission', 'variants', 'grid']) assert.equal(k in bad, false, k);
  assert.equal('own' in bad.phrases[0], false);
});

test('conversation: check and thenCheck keep one shape; without them a turn is as before', () => {
  const problems = [];
  const R = normaliseRoleplay({ id: 'rp-x', them: { role: 'ن', voice: 'a' }, turns: [
    { them: ['It is five dollars.', 'پنج دلار است.'], check: { right: 'پنج دلار', wrong: [' پانزده دلار', 'پنجاه دلار'] }, replies: [{ en: 'Okay.', fa: 'باشد.', keys: ['okay'], then: ['Thank you.', 'ممنون.'], thenCheck: { q: 'چه گفت؟', right: 'تشکر کرد', wrong: ['خداحافظی کرد', 'سؤال پرسید'] } }, { en: 'What?', fa: 'چه؟' }] },
    { them: ['Bye.', 'خداحافظ.'], open: 1, replies: [{ en: 'Bye.', fa: 'خداحافظ.', thenCheck: { right: 'ا', wrong: ['ب', 'پ'] } }] },
    { them: ['Hm.', 'هوم.'], check: { right: 'ا' }, replies: [{ en: 'Yes.', fa: 'بله.' }] },
  ] }, problems);
  assert.deepEqual(R.turns[0].check, { q: null, right: 'پنج دلار', wrong: ['پانزده دلار', 'پنجاه دلار'] });
  assert.deepEqual(R.turns[0].replies[0], { en: 'Okay.', fa: 'باشد.', keys: ['okay'], then: { en: 'Thank you.', fa: 'ممنون.' }, thenCheck: { q: 'چه گفت؟', right: 'تشکر کرد', wrong: ['خداحافظی کرد', 'سؤال پرسید'] } });
  assert.deepEqual(R.turns[0].replies[1], { en: 'What?', fa: 'چه؟', keys: [], then: null });
  assert.deepEqual(R.turns[1], { them: { en: 'Bye.', fa: 'خداحافظ.' }, open: true, replies: [{ en: 'Bye.', fa: 'خداحافظ.', keys: [], then: null }] }, 'a thenCheck without a then line is dropped');
  assert.equal('check' in R.turns[2], false);
  assert.equal(problems.length, 2);
  assert.equal(R.them.voice, 'a');
  assert.deepEqual(VOICES, ['s', 'm', 'b', 'k', 'a']);
});

test('conversation: a reply can skip the turns it makes moot; "skip" must leave a turn after it', () => {
  const problems = [];
  const turn = (en, replies) => ({ them: [en, 'ن'], replies });
  const R = normaliseRoleplay({ id: 'rp-y', them: { role: 'ن', voice: 'm' }, turns: [
    turn('Are you okay?', [{ en: 'Yes.', fa: 'بله.' }, { en: 'No. I\'m hurt.', fa: 'نه.', skip: 1, then: ['I\'m calling 911.', 'زنگ می‌زنم.'] }]),
    turn('Call the police?', [{ en: 'Yes.', fa: 'بله.', skip: 0 }]),
    turn('Insurance?', [{ en: 'Here.', fa: 'بفرمایید.', skip: 1 }]),
    turn('Bye.', [{ en: 'Bye.', fa: 'خداحافظ.', skip: 1.5 }]),
  ] }, problems);
  assert.equal(R.turns[0].replies[1].skip, 1);
  assert.equal('skip' in R.turns[0].replies[0], false, 'no skip: the field is absent');
  assert.equal(problems.length, 3, 'skip 0, a skip past the last turn and a fraction are each reported');
  assert.equal('skip' in R.turns[1].replies[0], false);
  assert.equal(R.turns[2].replies[0].skip, 1, 'reported, but kept as written');
  assert.equal('skip' in R.turns[3].replies[0], false);
});

test('paper: lines and questions keep their form; the line number of an answer counts from 1', () => {
  const problems = [];
  const P = normalisePaper({ id: 'bill-1', title: 'قبض برق', kind: 'bill', stage: 2, lesson: 'pay-bill-phone', note: ' ساختگی ', lines: [{ en: 'Amount due: $45.20', fa: 'مبلغ', strong: true }, { en: 'Due date: March 5', fa: 'مهلت' }], questions: [{ fa: 'چقدر؟', line: 1 }] }, 0, problems);
  assert.deepEqual(P, { id: 'bill-1', title: 'قبض برق', kind: 'bill', stage: 2, lesson: 'pay-bill-phone', note: 'ساختگی', safetyCritical: false,
    lines: [{ en: 'Amount due: $45.20', fa: 'مبلغ', strong: true }, { en: 'Due date: March 5', fa: 'مهلت', strong: false }], questions: [{ fa: 'چقدر؟', line: 1 }] });
  assert.deepEqual(problems, []);
  const bare = normalisePaper({ title: 'ن', kind: 'sign', lines: [], questions: [] }, 3, problems);
  assert.equal(bare.id, 'paper4'); assert.equal(bare.stage, 1); assert.equal(bare.lesson, null); assert.equal(bare.note, '');
  normalisePaper({ id: 'broken' }, 0, problems);
  assert.equal(problems.length, 1);
});

test('the real content: every optional field that is present has the documented shape, and its recordings are asked for', () => {
  const content = loadContent();
  assert.deepEqual(content.problems, []);
  const keys = new Set(audioRequests(content).map((r) => r.key));
  assert.ok(Array.isArray(content.papers) && Array.isArray(content.numbersAfter) && content.practiceAll && content.mine);
  for (const L of Object.values(content.lessons)) {
    if ('mission' in L) assert.ok(typeof L.mission === 'string' && L.mission, L.id);
    for (const p of L.phrases) if ('own' in p) { assert.ok(Array.isArray(p.own) && p.own.length, L.id); for (const o of p.own) assert.ok(p.en.includes(o), `${L.id}: ${o}`); }
    if ('variants' in L) { assert.ok(L.variants.length, L.id); for (const v of L.variants) { assert.ok(v.en && v.fa && v.like && VOICES.includes(v.voice), `${L.id}: ${v.en}`); assert.ok(keys.has(audioKey('en', v.voice, 'n', v.en)) && keys.has(audioKey('en', v.voice, 's', v.en))); } }
    if ('grid' in L) { assert.ok(L.grid.words.length && typeof L.grid.title === 'string' && typeof L.grid.note === 'string', L.id); for (const w of L.grid.words) assert.ok(content.vocab.some((x) => x.en === w), `${L.id}: ${w}`); }
  }
  for (const R of content.roleplays) for (const t of R.turns) {
    for (const c of [t.check, ...t.replies.map((r) => r.thenCheck)].filter(Boolean)) { assert.equal(c.wrong.length, 2, R.id); assert.equal(new Set([c.right, ...c.wrong]).size, 3, R.id); assert.ok(c.q === null || typeof c.q === 'string'); }
    for (const r of t.replies) if (r.thenCheck) assert.ok(r.then, R.id);
  }
  for (const P of content.papers) { for (const q of P.questions) assert.ok(P.lines[q.line - 1], `${P.id}: question about line ${q.line}`); for (const l of P.lines) assert.ok(keys.has(audioKey('en', 's', 'n', l.en)), `${P.id}: ${l.en}`); }
  for (const id of [...content.essentials, ...content.numbersAfter, ...Object.keys(content.mine), ...Object.keys(content.practiceAll)]) assert.ok(content.lessons[id], id);
});
