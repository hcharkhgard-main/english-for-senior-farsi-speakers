// The data the first 63 lessons carry for "say your own details", the small real-life task, "the same thing in
// other words", the tap-to-hear pages, the second unsuitable answer, and the sentence patterns that open early.
// (The validator checks the form of these fields for every lesson; these tests pin what the 63 lessons must have.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../../tools/content.mjs';
import { splitMixed } from '../../src/js/bidi.js';
import { patternOpen } from '../../src/js/views/build.js';
import { lessonVariants } from '../../src/js/views/lesson.js';

const C = loadContent();
const first63 = Object.values(C.lessons).filter((L) => +L.file.slice(0, 2) <= 63);
const byId = (id) => C.lessons[id];
const order = C.stages.flatMap((s) => s.lessons);
const words = (en) => en.split(/\s+/).map((t) => t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''));

test('there are 63 of them and each has a small real-life task, all different', () => {
  assert.equal(first63.length, 63);
  const seen = new Map();
  for (const L of first63) {
    assert.ok(typeof L.mission === 'string' && L.mission.trim() === L.mission && L.mission.length > 20, `${L.id}: no mission`);
    assert.match(L.mission, /[؀-ۿ]/, `${L.id}: mission is not Farsi`);
    assert.ok(L.mission.length <= 220, `${L.id}: mission is long (${L.mission.length})`);
    assert.ok(!seen.has(L.mission), `${L.id} and ${seen.get(L.mission)} have the same mission`);
    seen.set(L.mission, L.id);
    assert.ok(!/[يك]/.test(L.mission), `${L.id}: Arabic letter form`);
    assert.ok(!/(^|\s)ن?می [؀-ۿ]/.test(L.mission), `${L.id}: «می» needs a half-space`);
  }
});

test('the English inside a mission is shown left to right as whole pieces', () => {
  for (const L of first63) {
    const parts = splitMixed(L.mission);
    parts.forEach((p, i) => {
      if (!p.ltr) assert.ok(!/[A-Za-z]/.test(p.text), `${L.id}: English outside a left-to-right piece: "${p.text}"`);
      // nothing English is left hanging after the piece ("…the …?" would put the question mark on the wrong side)
      if (p.ltr && parts[i + 1]) assert.ok(!/^[?!…]/.test(parts[i + 1].text), `${L.id}: "${p.text}" is cut before "${parts[i + 1].text.slice(0, 3)}"`);
    });
  }
});

test('no mission asks for anything risky: no 911 call, no talking to a suspicious caller, no personal details to a stranger', () => {
  for (const L of first63) {
    assert.ok(!/۹۱۱|911/.test(L.mission), `${L.id}: mentions 911`);
    assert.ok(!/شمارهٔ کارت|رمز|کد تأیید|سوشال/.test(L.mission), `${L.id}: mentions a card number, PIN or code`);
  }
  // the lessons that must not be "tried out" have a preparation step, with no one to say it to
  for (const id of ['emergency-911', 'scam-call', 'driving-police', 'car-accident', 'emergency-room', 'incoming-call']) {
    assert.match(byId(id).mission, /بنویسید|تمرین کنید|بلند بگویید|با صدای بلند|بگذارید/, `${id}: not a preparation step`);
  }
});

test('"own": the sample details of the "my information" sentences are marked, and every marked word is in its sentence', () => {
  const want = {
    'social-hello': { 3: ['Maryam'] },
    'my-name': { 1: ['Maryam'], 2: ['Ahmadi'], 3: ['A-H-M-A-D-I'] },
    'my-numbers': { 1: ['212-555-0142'], 2: ['sixty-five'] },
    'my-address-birthday': { 1: ['25', 'Oak', 'Street'], 2: ['12'], 3: ['90024'], 4: ['March', '5th', '1958'] },
    'emergency-911': { 3: ['25', 'Oak', 'Street'] },
    'clinic-checkin': { 1: ['ten', "o'clock"], 2: ['Ahmadi'], 3: ['March', '5th', '1958'] },
    'phone-appointment': { 1: ['Maryam', 'Ahmadi'], 5: ['212-555-0142'] },
  };
  for (const [id, ps] of Object.entries(want)) for (const [n, w] of Object.entries(ps)) assert.deepEqual(byId(id).phrases[n - 1].own, w, `${id} p${n}`);
  for (const L of first63) for (const p of L.phrases) for (const w of p.own || []) assert.ok(words(p.en).includes(w), `${L.id}: "${w}" is not a word of "${p.en}"`);
  // no sample name, street or number of the sample person is left unmarked in a taught sentence
  for (const L of first63) for (const p of L.phrases) for (const w of words(p.en)) {
    if (/^(Maryam|Ahmadi|Arman|Oak|90024|1958|212-555-0142|A-H-M-A-D-I)$/.test(w)) assert.ok((p.own || []).includes(w), `${L.id}: "${w}" in "${p.en}" is not marked as the learner's own`);
  }
});

test('"variants": each stands for a line of its lesson, is new, and keeps at least two safe wrong answers', () => {
  const withV = first63.filter((L) => L.variants);
  assert.ok(withV.length >= 24 && withV.length <= 32, `${withV.length} lessons have variants`);
  for (const L of withV) {
    const lines = [...L.dialogue.lines.filter((l) => l.who === 'them').map((l) => l.en), L.respond.them.en, ...L.phrases.map((p) => p.en)];
    const all = new Set([...L.dialogue.lines.map((l) => l.en), L.respond.them.en, ...L.respond.ok.map((o) => o.en), ...L.phrases.map((p) => p.en)]);
    assert.ok(L.variants.length >= 2 && L.variants.length <= 3, `${L.id}: ${L.variants.length} variants`);
    assert.equal(new Set(L.variants.map((v) => v.en)).size, L.variants.length, `${L.id}: a variant twice`);
    for (const v of L.variants) {
      assert.ok(lines.includes(v.like), `${L.id}: "${v.like}" is not a line of the lesson`);
      assert.ok(!all.has(v.en), `${L.id}: "${v.en}" is already a line of the lesson`);
      assert.ok(v.en.split(/\s+/).length <= 9, `${L.id}: "${v.en}" is long`);
      assert.match(v.fa, /[؀-ۿ]/);
      if (v.voice) assert.ok(['m', 'b', 'k', 'a'].includes(v.voice), `${L.id}: voice ${v.voice}`);
    }
    assert.equal(lessonVariants(L).length, L.variants.length, `${L.id}: a variant has fewer than two wrong answers and would never be asked`);
  }
  // the pairs the reviewer named are there
  const has = (id, en) => assert.ok(byId(id).variants.some((v) => v.en === en), `${id}: ${en}`);
  has('my-address-birthday', 'When were you born?'); has('my-address-birthday', 'Where do you live?');
  has('clinic-checkin', 'Can you confirm your date of birth?'); has('clinic-checkin', 'Can I get your last name?');
  has('my-name', 'Last name?'); has('my-name', 'How do you spell that?');
  has('my-numbers', "What's a good number to reach you?");
  // QA round 3 (M1–M3): "Who is your insurance with?", "Credit or debit?" and "Will that be all?" did not mean the
  // same as their line (a different question, or "yes" meaning the opposite); replaced by true equivalents
  has('insurance-coverage', 'Are you insured?');
  has('store-checkout', 'How would you like to pay?'); has('store-checkout', 'Are you paying with cash or card?');
  has('coffee-order', 'Can I get you anything else?');
  has('clinic-understand', 'Take a seat.');
  has('clinic-symptoms', 'How long have you had this?');
  has('bank-help', 'Do you have your ID with you?');
});

test('"grid": the numbers and the days are words of the word list', () => {
  const vocab = new Set(C.vocab.map((w) => w.en));
  const N = byId('my-numbers').grid, D = byId('basics-time').grid;
  assert.equal(N.words.length, 29);                       // 0–20, the tens, one hundred
  assert.deepEqual(D.words, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  for (const G of [N, D]) { assert.ok(G.title && G.note); for (const w of G.words) assert.ok(vocab.has(w), `"${w}" is not in the word list`); }
  for (const w of ['zero', 'eleven', 'thirteen', 'fifteen', 'twenty', 'thirty', 'fifty', 'ninety', 'one hundred']) assert.ok(N.words.includes(w), w);
});

test('"off2": the second unsuitable answer is a sentence of the lesson that is no answer at all', () => {
  let n = 0;
  for (const L of first63) {
    const k = L.respond.off2;
    if (k == null) continue;
    n++;
    const p = L.phrases.find((x) => x.id === k);          // the loader turns the number into the sentence's id
    assert.ok(p, `${L.id}: off2 ${k} is not a phrase`);
    assert.notEqual(p.en, L.respond.off.en, `${L.id}: off2 is the same as off`);
    const bare = (s) => s.replace(/[.?!]$/, '');
    for (const o of L.respond.ok) assert.ok(!o.en.includes(bare(p.en)) && !p.en.includes(bare(o.en)), `${L.id}: "${p.en}" is (part of) the accepted answer "${o.en}"`);
  }
  assert.ok(n >= 40, `${n} lessons have a second unsuitable answer`);
  // where every other sentence would be a fair answer there is none — above all in the 911 lesson
  assert.equal(byId('emergency-911').respond.off2, undefined);
});

test('safety: the seven lessons with real-world safety, payment or personal-data advice are flagged', () => {
  for (const id of ['taxi-ride', 'my-numbers', 'my-address-birthday', 'work-rideshare', 'work-delivery', 'work-maintenance', 'work-customers']) {
    assert.equal(byId(id).safetyCritical, true, id);
    assert.ok(byId(id).note, `${id}: a flagged lesson needs its note`);
  }
  assert.match(byId('scam-call').note, /فرزند یا نوه‌تان گرفتار شده/);
});

test('voices: about half of the stage-3 partners have one of the two new voices, and a lesson is one person', () => {
  const s3 = first63.filter((L) => L.stage === 3);
  const fresh = s3.filter((L) => ['k', 'a'].includes(L.them.voice));
  assert.ok(fresh.length >= 10 && fresh.length <= 14, `${fresh.length} of ${s3.length}`);
  assert.ok(!first63.some((L) => L.stage < 3 && ['k', 'a'].includes(L.them.voice)), 'a new voice before stage 3');
  // a sentence the other person says (it has its own "voice") is in that person's voice
  for (const L of first63) for (const p of L.phrases) if (p.voice !== 's') assert.equal(p.voice, L.them.voice, `${L.id}: "${p.en}"`);
});

test('patterns: a frame taught early opens early, and the lesson named in "opensAfter" really teaches it', () => {
  const by = (id) => C.patterns.find((x) => x.id === id);
  const teaches = (lesson, re) => { const L = byId(lesson); return [...L.phrases.map((p) => p.en), ...L.dialogue.lines.map((l) => l.en), ...L.respond.ok.map((o) => o.en)].some((s) => re.test(s)); };
  const want = { 'i-dont': ['social-slowly', /\bI don't\b/], 'id-like-to': ['store-checkout', /\bI'd like to\b/], 'can-i-have': ['store-checkout', /\bCan I have\b/], 'i-cant': ['emergency-room', /\bI can't\b/], 'do-you-have': ['clinic-checkin', /\bDo you have\b/] };
  for (const [id, [lesson, re]] of Object.entries(want)) {
    const P = by(id);
    assert.equal(P.opensAfter, lesson, id);
    assert.ok(teaches(lesson, re), `${lesson} does not teach "${P.frame}"`);
    assert.ok(order.indexOf(P.opensAfter) < order.indexOf(P.lesson), `${id}: opensAfter must come before its lesson`);
    assert.equal(patternOpen(P, {}), false, `${id} closed at the start`);
    assert.equal(patternOpen(P, { [lesson]: 1 }), true, `${id} open after ${lesson}`);
    assert.equal(patternOpen(P, { [P.lesson]: 1 }), true, `${id} open after its own lesson`);
  }
  assert.equal(by('where-can-i').level, 1);
  assert.equal(patternOpen(by('where-can-i'), {}), true);
  for (const P of C.patterns) if (P.opensAfter) assert.ok(byId(P.opensAfter), `${P.id}: unknown lesson ${P.opensAfter}`);
  // the lesson whose grammar tip explains the frame keeps its "build sentences with this pattern" button
  for (const [id, lesson] of [['i-dont', 'immigration-office'], ['id-like-to', 'bank-help'], ['can-i-have', 'restaurant-order'], ['i-cant', 'appointment-change'], ['do-you-have', 'clothes-shopping']]) assert.equal(by(id).lesson, lesson);
});
