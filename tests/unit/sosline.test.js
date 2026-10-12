// The learner's own name and address on the emergency page (QA round 3, features L1 and L2): one full stop, and
// never Persian letters inside an English sentence that a helper has to read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tidy, farsiLetters } from '../../src/js/views/settings.js';

test('a value ends without a full stop of its own, on one line', () => {
  assert.equal(tidy('25 Oak St.'), '25 Oak St');
  assert.equal(tidy('  25   Oak  St. , '), '25 Oak St');
  assert.equal(tidy('Maryam Ahmadi'), 'Maryam Ahmadi');
  assert.equal(`My address is ${tidy('25 Oak St.')}.`, 'My address is 25 Oak St.');
});

test('Persian digits are read as digits; Persian letters make a name or address unusable in English', () => {
  assert.equal(tidy('۲۱۲-۵۵۵-۰۱۴۲'), '212-555-0142');
  assert.equal(farsiLetters('Apartment ۱۲'), false);
  assert.equal(farsiLetters('مریم احمدی'), true);
  assert.equal(farsiLetters('Maryam احمدی'), true);
  assert.equal(farsiLetters(''), false);
  assert.equal(farsiLetters(undefined), false);
});
