// The gentle corrections (content/corrections.json) and the sentence builder, checked against everything
// the app itself teaches: a correct sentence must never be "corrected", and a correct sentence must never
// be refused by the tile builder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../../tools/content.mjs';
import { correct } from '../../src/js/match.js';
import { spareTiles, tilesFor } from '../../src/js/views/build.js';

const C = loadContent();

// every English sentence of the content, with where it is from
function sentences() {
  const all = new Map();
  const add = (s, where) => { if (s && !all.has(s)) all.set(s, where); };
  for (const L of Object.values(C.lessons)) {
    for (const p of L.phrases) { add(p.en, `lesson ${L.id}`); add(p.say, `lesson ${L.id}`); }
    for (const l of L.dialogue.lines) add(l.en, `lesson ${L.id} dialogue`);
    add(L.respond.them.en, `lesson ${L.id}`);
    for (const o of L.respond.ok) add(o.en, `lesson ${L.id}`);
    add(L.respond.off.en, `lesson ${L.id}`);
    if (L.grammar) { for (const e of L.grammar.examples) add(e.en, `lesson ${L.id} grammar`); add(L.grammar.right, `lesson ${L.id} grammar`); }
  }
  for (const R of C.roleplays) for (const t of R.turns) { add(t.them.en, R.id); for (const r of t.replies) { add(r.en, R.id); if (r.then) add(r.then.en, R.id); } }
  for (const P of C.patterns) for (const it of P.items) add(it.en, `pattern ${P.id}`);
  for (const w of C.vocab) { add(w.en, 'vocabulary'); if (w.ex) add(w.ex.en, 'vocabulary'); }
  for (const n of C.numbers) add(n.say, 'numbers');
  for (const e of C.emergency.phrases) add(e.say || e.en, 'emergency phrases');
  return all;
}

test('no correct sentence of the content is "corrected" — whole, or one sentence of it at a time', () => {
  const all = sentences(), wrong = [];
  let n = 0;
  for (const [s, where] of all) {
    for (const part of new Set([s, ...s.replace(/([.?!])\s+/g, '$1\u0001').split('\u0001')])) {
      n++;
      const r = correct(part, C.corrections);
      if (r) wrong.push(`${where}: "${part}" → "${r.fixed}" (${r.ids.join(', ')})`);
    }
  }
  assert.ok(all.size > 2500, `only ${all.size} sentences were found`);
  assert.deepEqual(wrong, [], `\n  ${wrong.join('\n  ')}\n`);
});

test('where a rule corrects the mistake a lesson shows, it gives the lesson\'s own right sentence', () => {
  let fired = 0;
  for (const L of Object.values(C.lessons)) {
    if (!L.grammar || !L.grammar.wrong) continue;
    const r = correct(L.grammar.wrong, C.corrections);
    if (!r) continue;
    fired++;
    assert.equal(r.fixed, L.grammar.right, `lesson ${L.id}: "${L.grammar.wrong}"`);
  }
  assert.ok(fired >= 10, `only ${fired} lesson mistakes are covered by a rule`);
});

test('sentence builder: a spare tile never makes a second sentence that is also right', () => {
  // articles are never spare: Farsi has none, so both "a coffee" and "the coffee" fit the prompt
  assert.deepEqual(spareTiles(['how', 'much', 'is', 'a', 'taxi'], ['the', 'ticket', 'coffee'], 'قیمت تاکسی چقدر است؟'), ['ticket', 'coffee']);
  assert.deepEqual(spareTiles(['can', 'I', 'have', 'the', 'menu', 'please'], ['a', 'an', 'some', 'water'], ''), ['water']);
  // «او» is "he" and "she": the other one is only offered when the prompt says who is meant
  assert.deepEqual(spareTiles(['she', 'is', 'a', 'doctor'], ['he', 'at', 'work'], 'او دکتر است.'), ['at', 'work']);
  assert.deepEqual(spareTiles(['she', 'is', 'a', 'doctor'], ['he', 'at', 'work'], 'او (خانم) دکتر است.'), ['he', 'at']);
  assert.deepEqual(spareTiles(['his', 'name', 'is', 'Arman'], ['her', 'Sara'], 'اسمش آرمان است.'), ['Sara']);
  assert.deepEqual(spareTiles(['his', 'name', 'is', 'Arman'], ['her', 'Sara'], 'اسمش آرمان است. (پسر)'), ['her', 'Sara']);
  assert.deepEqual(spareTiles(['I', 'am', 'fine'], ['am', 'tired', 'here'], ''), ['tired'], 'three words: one spare tile, never a word of the sentence itself');

  // every sentence of the builder (and of the lessons, where one sentence is built at the end):
  // with all the tiles it can be given, no other pronoun and no article can be put in
  const check = (en, fa, extra, where) => {
    const target = tilesFor(en), spare = spareTiles(target, extra, fa);
    assert.ok(!spare.some((w) => /^(a|an|the|some|any)$/i.test(w)), `${where}: "${en}" is offered an article`);
    if (target.some((w) => /^(he|she|his|her|him)$/i.test(w)) && spare.some((w) => /^(he|she|his|her|him)$/i.test(w))) assert.match(fa, /آقا|خانم|پسر|دختر|شوهر|پدر|مادر|برادر|خواهر/, `${where}: "${en}" is offered another pronoun, but «${fa}» does not say who is meant`);
  };
  for (const P of C.patterns) for (const it of P.items) check(it.en, it.fa, P.items.filter((x) => x.en !== it.en).flatMap((x) => tilesFor(x.en)), `pattern ${P.id}`);
  for (const L of Object.values(C.lessons)) for (const p of L.phrases) check(p.en, p.fa, L.phrases.filter((x) => x !== p).flatMap((x) => tilesFor(x.en)), `lesson ${L.id}`);
  // the prompts of "He is … / She is …" say who is meant
  const P = C.patterns.find((x) => x.id === 'he-she-is');
  for (const it of P.items) assert.match(it.fa, /آقا|خانم|پسر|دختر/, `"${it.en}": «${it.fa}»`);
});

test('a pattern is linked to a lesson that teaches its frame', () => {
  const taught = (P, re) => { const L = C.lessons[P.lesson]; return [...L.phrases.map((p) => p.en + ' ' + (p.note || '')), ...L.dialogue.lines.map((l) => l.en), ...(L.grammar ? [L.grammar.right, ...L.grammar.examples.map((e) => e.en)] : []), ...L.respond.ok.map((o) => o.en)].some((s) => re.test(s)); };
  const by = (id) => C.patterns.find((x) => x.id === id);
  assert.ok(taught(by('i-want-to'), /\bI want to\b/), 'i-want-to');
  assert.ok(taught(by('he-she-is'), /\b(He|She)('s| is)\b/), 'he-she-is');
  assert.ok(taught(by('there-is'), /\bThere is\b/), 'there-is');
});
