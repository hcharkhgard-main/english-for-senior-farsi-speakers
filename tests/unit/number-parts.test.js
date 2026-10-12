// The numbers word list is shown in parts, one at a time (QA round 4 L8, round 5 usability L3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../../tools/content.mjs';
import { numberPart, NUMBER_PARTS } from '../../src/js/views/words.js';

test('the ordinals are split: "first" to "tenth", then the days of a date', () => {
  const words = loadContent().vocab.filter((w) => w.cat === 'numbers').map((w) => w.en);
  const by = Object.fromEntries(NUMBER_PARTS.map((p) => [p, words.filter((w) => numberPart(w) === p)]));
  assert.deepEqual(NUMBER_PARTS, ['small', 'big', 'ord', 'date']);
  assert.deepEqual(by.ord, ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']);
  assert.equal(by.date[0], 'eleventh');
  assert.equal(by.date.length, 21);
  assert.ok(by.date.includes('twenty-first') && by.date.includes('thirty-first') && by.date.includes('thirtieth'));
  assert.ok(['zero', 'eleven', 'twenty'].every((w) => numberPart(w) === 'small'));
  assert.ok(['thirty', 'one thousand', 'half'].every((w) => numberPart(w) === 'big'));
  for (const p of NUMBER_PARTS) assert.ok(by[p].length >= 10 && by[p].length <= 21, `${p}: ${by[p].length}`);
});
