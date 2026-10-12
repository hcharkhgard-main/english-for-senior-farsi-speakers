// «خواندن نوشته‌ها»: which paper comes next, which papers go with a lesson, and the data itself as the screen needs it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPaper, papersFor, papersOf } from '../../src/js/views/papers.js';
import { loadContent, audioRequests } from '../../tools/content.mjs';

const content = loadContent();
const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('the next paper is the next one not read yet, going round the list', () => {
  assert.equal(nextPaper(list, {}, 'a').id, 'b');
  assert.equal(nextPaper(list, { b: 1 }, 'a').id, 'c');
  assert.equal(nextPaper(list, { a: 1 }, 'c').id, 'b', 'the paper just read is skipped, the search goes on from the top');
  assert.equal(nextPaper(list, { a: 1, b: 1 }, 'b').id, 'c');
});

test('when every paper has been read, the next one in the list is offered again (never nothing)', () => {
  assert.equal(nextPaper(list, { a: 2, b: 1, c: 1 }, 'b').id, 'c');
  assert.equal(nextPaper(list, { a: 1, b: 1, c: 1 }, 'c').id, 'a');
});

test('one paper alone has no "next"; an unknown id has none either', () => {
  assert.equal(nextPaper([{ id: 'a' }], {}, 'a'), null);
  assert.equal(nextPaper(list, {}, 'nosuch'), null);
  assert.equal(nextPaper(list, undefined, 'a').id, 'b', 'a learner with no "read" record yet');
});

test('content without papers is an empty list, not an error', () => {
  assert.deepEqual(papersOf({}), []);
  assert.deepEqual(papersOf({ papers: null }), []);
  assert.deepEqual(papersFor({}, 'store-where'), []);
});

test('every paper in content/ can be shown: an address-safe id, lines with both languages, questions that point at a line', () => {
  for (const P of papersOf(content)) {
    assert.match(P.id, /^[A-Za-z0-9._~-]+$/, `${P.id}: the id is part of the screen's address`);
    assert.ok(!P.id.includes('.'), `${P.id}: a dot would cut the address`);
    assert.ok(P.lines.length >= 2 && P.questions.length >= 1, P.id);
    for (const l of P.lines) assert.ok(typeof l.en === 'string' && l.en && typeof l.fa === 'string' && l.fa, `${P.id}: a line needs English and Farsi`);
    for (const q of P.questions) assert.ok(Number.isInteger(q.line) && q.line >= 1 && q.line <= P.lines.length && q.fa, `${P.id}: question "${q.fa}" points at line ${q.line}`);
    if (P.lesson) assert.ok(content.lessons[P.lesson], `${P.id}: belongs with a lesson that exists`);
  }
});

test('a paper offered after a lesson is found through that lesson', () => {
  const P = papersOf(content).find((p) => p.lesson);
  if (!P) return;
  assert.ok(papersFor(content, P.lesson).some((x) => x.id === P.id));
});

test('every line of every paper has a recording request in the learner\'s voice, and every question one in Farsi', () => {
  const reqs = audioRequests(content);
  const has = (lang, voice, text) => reqs.some((r) => r.lang === lang && r.voice === voice && r.speed === 'n' && r.text === text.trim());
  for (const P of papersOf(content)) {
    for (const l of P.lines) assert.ok(has('en', 's', l.en), `${P.id}: no recording request for "${l.en}"`);
    for (const q of P.questions) assert.ok(has('fa', 'f', q.fa), `${P.id}: no Farsi recording request for "${q.fa}"`);
  }
});
