// «چه گفت؟» — the questions a conversation asks about what the partner has just said ("check" on a turn,
// "thenCheck" on a reply), and the fixed "Could you repeat that, please?" under the answers of every turn.
// The screen itself is tested in tests/e2e/run.mjs; here: the shape the screen accepts, and rules that must hold
// for the content whatever is added to it later.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, audioRequests } from '../../tools/content.mjs';
import { checkOf, CHECK_TRIES, nextTurn } from '../../src/js/views/talk.js';
import { tokens } from '../../src/js/match.js';
import { liveBlock } from '../../src/js/ai-prompt.js';
import { safetyFlagProblems } from '../../tools/safety-flags.mjs';

const C = loadContent();
const byId = (id) => C.roleplays.find((R) => R.id === id);
// every question of every conversation: { R, n (turn, 1-based), line (what it asks about), c, where }
const ALL = C.roleplays.flatMap((R) => R.turns.flatMap((t, i) => [
  ...(t.check ? [{ R, n: i + 1, line: t.them, c: t.check, where: `${R.id} T${i + 1}` }] : []),
  ...t.replies.filter((r) => r.thenCheck).map((r) => ({ R, n: i + 1, line: r.then, c: r.thenCheck, where: `${R.id} T${i + 1} after "${r.en}"` })),
]));
const FA = /[؀-ۿ]/;

test('the screen accepts a question only when it is complete', () => {
  assert.deepEqual(checkOf({ q: ' کدام شماره؟ ', right: '555-0199', wrong: ['555-0159', '555-0195'] }), { q: 'کدام شماره؟', right: '555-0199', wrong: ['555-0159', '555-0195'] });
  assert.deepEqual(checkOf({ q: null, right: 'الف', wrong: ['ب', 'پ'] }), { q: '', right: 'الف', wrong: ['ب', 'پ'] });
  assert.deepEqual(checkOf({ right: 'الف', wrong: ['ب', 'الف', 'ب', '', 5, 'پ'] }).wrong, ['ب', 'پ'], 'the right answer, repeats and non-texts are never offered as wrong answers');
  for (const bad of [null, undefined, 'text', [], {}, { right: 'الف' }, { right: '', wrong: ['ب'] }, { right: 'الف', wrong: [] }, { right: 'الف', wrong: ['الف'] }, { right: 'الف', wrong: 'ب' }]) assert.equal(checkOf(bad), null, JSON.stringify(bad));
  assert.equal(CHECK_TRIES, 2, 'the line is shown after two other tries');
});

test('every question in the content is one the screen accepts, with three different choices', () => {
  assert.ok(ALL.length >= 150, `only ${ALL.length} questions`);
  for (const { c, line, where } of ALL) {
    assert.ok(line && line.en, `${where}: a question about a line that is not there`);
    const k = checkOf(c);
    assert.ok(k, `${where}: incomplete`);
    assert.equal(k.wrong.length, 2, `${where}: two wrong choices`);
    const shown = [k.right, ...k.wrong].map((x) => x.replace(/[\s‌]+/g, ' ').replace(/[.!؟?،,؛]+$/g, '').trim());
    assert.equal(new Set(shown).size, 3, `${where}: two choices read the same`);
    if (k.q) assert.match(k.q, /؟$/, `${where}: the question ends with «؟»`);
    // choices that are bare facts (a price, a phone number, a code) are all facts, and have a question of their own
    const facts = [k.right, ...k.wrong].map((x) => !FA.test(x));
    assert.ok(facts.every(Boolean) || !facts.some(Boolean), `${where}: Farsi and bare-number choices are mixed`);
    if (facts[0]) assert.ok(k.q, `${where}: bare numbers need a question of their own`);
  }
});

test('where an answer repeats a number the partner has just said, the partner\'s line is asked about first', () => {
  // (the answers are offered only after the question, so they cannot give it away — tests/e2e/run.mjs checks the screen)
  const NUM = new Set('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand'.split(' '));
  const runs = (text) => { const out = []; let cur = []; for (const w of tokens(text)) { if (NUM.has(w)) cur.push(w); else { if (cur.length >= 2) out.push(cur.join(' ')); cur = []; } } if (cur.length >= 2) out.push(cur.join(' ')); return out; };
  let found = 0;
  for (const R of C.roleplays) R.turns.forEach((t, i) => {
    const said = runs(t.them.en);
    if (!said.length) return;
    const echo = t.replies.some((r) => runs(r.en).some((x) => said.some((y) => x.includes(y) || y.includes(x))));
    if (echo) { found++; assert.ok(t.check, `${R.id} T${i + 1} «${t.them.en}»: an answer repeats the number, so this line needs a "check"`); }
  });
  assert.ok(found >= 2, 'the phone number of rp-incoming and the gate code of rp-delivery-call are such lines');
});

test('the questions the reviewer wrote out (QA round 2, coverage M1) are in place', () => {
  const at = (id, n, reply) => { const t = byId(id).turns[n - 1]; return reply ? t.replies.find((r) => r.en === reply).thenCheck : t.check; };
  assert.equal(at('rp-store', 1, 'Where is the rice?').right, 'امروز برنج تمام شده است.');
  assert.match(at('rp-bus', 1, "I'm going to the hospital.").right, /جلوی بیمارستان نمی‌ایستد/);
  assert.match(at('rp-clinic', 1, "Yes. I have an appointment at ten o'clock.").right, /حدود بیست دقیقه/);
  assert.match(at('rp-bank', 1, "I'd like to deposit this check.").right, /فردا .* نه امروز/);
  assert.match(at('rp-home', 3, 'Can someone come today?').right, /فردا ساعت نُه/);
  assert.deepEqual([at('rp-incoming', 4).right, ...at('rp-incoming', 4).wrong], ['555-0199', '555-0159', '555-0195']);
  assert.deepEqual([at('rp-delivery-call', 3).right, ...at('rp-delivery-call', 3).wrong], ['2580', '2850', '2508']);
  assert.deepEqual([at('rp-landlord', 4).right, ...at('rp-landlord', 4).wrong].map((x) => x.replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0).replace(/\D/g, '')), ['15', '50', '5']);
});

test('every conversation asks at least twice, and a first greeting is never asked about', () => {
  for (const R of C.roleplays) {
    const n = ALL.filter((x) => x.R === R).length;
    assert.ok(n >= 2, `${R.id}: ${n} question(s)`);
  }
  for (const R of C.roleplays) {
    const first = R.turns[0];
    if (first.check) assert.ok(!/^(hi|hello|good (morning|afternoon|evening))[!.,]? *(how can i help you\??|can i help you\??)?$/i.test(first.them.en.trim()), `${R.id}: «${first.them.en}» is only a greeting`);
  }
});

test('the medicine listening round uses only sentences of its lesson and is closed to the live partner', () => {
  const R = byId('rp-medicine'), L = C.lessons['medicine-instructions'];
  assert.ok(R && L);
  // every line, the pharmacist's "Yes, that's right." too (QA round 5, usability M2), is taught in the lesson first
  const own = new Set([...L.phrases.map((p) => p.en), ...L.dialogue.lines.map((l) => l.en), L.respond.them.en, ...L.respond.ok.map((o) => o.en)]);
  for (const t of R.turns) for (const line of [t.them.en, ...t.replies.flatMap((r) => [r.en, ...(r.then ? [r.then.en] : [])])]) assert.ok(own.has(line), `"${line}" is not a sentence of lesson medicine-instructions`);
  // the five sample instructions, each said once by the pharmacist and each asked about
  assert.deepEqual(L.phrases.map((p) => R.turns.filter((t) => t.them.en.includes(p.en)).length), [1, 1, 1, 1, 1]);
  assert.ok(R.turns.every((t) => t.check), 'every instruction is asked about');
  // Persian of a line is the lesson's own translation of it
  const faOf = new Map([...L.phrases.map((p) => [p.en, p.fa]), ...L.dialogue.lines.map((l) => [l.en, l.fa]), ...L.respond.ok.map((o) => [o.en, o.fa])]);
  for (const t of R.turns) for (const x of [t.them, ...t.replies, ...t.replies.map((r) => r.then).filter(Boolean)]) assert.equal(x.fa, faOf.get(x.en), `the Persian of "${x.en}" differs from the lesson`);
  assert.equal(R.safetyCritical, true); assert.equal(R.scripted, true);
  assert.ok(liveBlock({ ...R, turns: R.turns.map((t) => ({ ...t, them: [t.them.en, t.them.fa] })) }), 'never offered to the live partner');
  assert.equal(R.note, L.note, 'the same note as the lesson: samples only — follow your own label and pharmacist');
  assert.match(R.banner || '', /برچسب/, 'a short form of the note stays in sight during the round');
  assert.equal(C.practice['medicine-instructions'], 'rp-medicine', 'the lesson leads to it');
  assert.ok((C.practiceAll['medicine-instructions'] || []).includes('rp-pharmacy'), 'the pharmacy conversation is still offered');
});

test('"Could you repeat that, please?" is a sentence of lesson 2 and its recording is in the pack every phone has', () => {
  const f = C.ui.fixed && C.ui.fixed.repeat;
  assert.ok(f && f.en && f.fa);
  const p = C.lessons['social-slowly'].phrases.find((x) => x.en === f.en);
  assert.ok(p, 'taught in social-slowly');
  assert.equal(f.fa, p.fa, 'with the same Persian');
  const req = audioRequests(C).find((r) => r.lang === 'en' && r.voice === 's' && r.speed === 'n' && r.text === f.en);
  assert.ok(req && req.pack === 'core', `pack: ${req && req.pack}`);
});

test('conversations that practise a call from a stranger or a lock-out are marked safety-critical (QA round 2, security M6)', () => {
  for (const id of ['rp-incoming', 'rp-landlord', 'rp-medicine', 'rp-emergency', 'rp-scam', 'rp-bill']) assert.equal(byId(id).safetyCritical, true, id);
});

// QA round 4, security L3: the flag follows from what an item is about, not from a list of ids kept by hand
test('every lesson, conversation and paper about a clinic, a bank, an emergency, scams or passwords carries the safety flag', () => {
  assert.deepEqual(safetyFlagProblems(C), []);
  const L = (o) => ({ lessons: { x: { id: 'x', scenario: 'social', ...o } }, roleplays: [], papers: [] });
  assert.equal(safetyFlagProblems(L({ scenario: 'clinic' })).length, 1, 'a clinic lesson');
  assert.equal(safetyFlagProblems(L({ note: 'اگر کسی رمز کارتتان را خواست، ندهید.' })).length, 1, 'a note about a PIN');
  assert.equal(safetyFlagProblems(L({ intro: 'در این درس تماس با ۹۱۱ را تمرین می‌کنیم.' })).length, 1, 'an intro about 911');
  assert.equal(safetyFlagProblems(L({ note: 'این یک کلاه‌برداری رایج است.' })).length, 1, 'a scam');
  assert.equal(safetyFlagProblems(L({ note: 'رمزِ در این تمرین ساختگی است.' })).length, 0, 'a door code is not a password');
  assert.equal(safetyFlagProblems(L({ scenario: 'bank', safetyCritical: true })).length, 0, 'flagged');
  assert.equal(safetyFlagProblems(L({ note: 'PIN', safetyCritical: false })).length, 0, 'decided: not safety-critical');
  assert.equal(safetyFlagProblems({ lessons: {}, roleplays: [], papers: [{ id: 'p', note: 'کارت هدیه نخرید.', safetyCritical: false }] }).length, 1, 'papers have no opt-out');
});

test('rp-car-accident: the police question is asked only where nobody has called 911 yet (QA round 5 recheck, L1)', () => {
  const R = byId('rp-car-accident');
  // every route through the scene, as talk.js walks it: [the partner lines heard, in order]
  const routes = [];
  const walk = (n, heard) => {
    if (n >= R.turns.length) { routes.push(heard); return; }
    const t = R.turns[n];
    for (const r of t.replies) walk(nextTurn(n, r), [...heard, t.them.en, ...(r.then ? [r.then.en] : [])]);
  };
  walk(0, []);
  const police = (h) => h.filter((x) => x === 'Do you want to call the police?').length;
  for (const h of routes) {
    const called = h.some((x) => /calling 911/.test(x));
    assert.equal(police(h), called ? 0 : 1, h.join(' / '));
    assert.ok(h.includes('Let me give you my insurance information.') && h.some((x) => /^The police are on the way/.test(x)), h.join(' / '));
  }
  assert.ok(routes.some((h) => h.some((x) => /calling 911/.test(x))), 'the hurt route exists');
  assert.equal(nextTurn(2, null), 3, 'an answer in the learner\'s own words moves on one turn');
  assert.equal(nextTurn(0, { en: 'x' }), 1);
  assert.equal(nextTurn(0, { en: 'x', skip: 1 }), 2);
});
