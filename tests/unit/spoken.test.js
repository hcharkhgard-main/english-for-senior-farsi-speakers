// What the voice generator is asked to read (tools/spoken.mjs + content/pronunciation.json): numbers, dates and
// prices on the papers are read the way an American reads them aloud, and a few words get a respelling so the
// voice says the verb (QA round 4, audio H1–H3, M3, M5, L2).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadContent, audioRequests } from '../../tools/content.mjs';
import { spokenEn } from '../../tools/spoken.mjs';

const say = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'pronunciation.json'), 'utf8'));
const en = (t) => spokenEn(t, say);

test('a month with a bare day number is a date, read as an ordinal', () => {
  assert.equal(en('Date: Tuesday, May 5'), 'Date: Tuesday, May fifth');
  assert.equal(en('on Thursday, June 11 at 2:15 PM.'), 'on Thursday, June eleventh at two fifteen PM.');
  assert.equal(en('Date: March 1, 2027'), 'Date: March first, twenty twenty-seven');
  assert.equal(en('DUE DATE: March 20'), 'Due Date: March twentieth');
  assert.equal(en('Billing period: Feb 1 - Feb 28'), 'Billing period: February first to February twenty-eighth');
  assert.equal(en('Date: Monday, April 6 - Time: 2:40 PM'), 'Date: Monday, April sixth. Time: two forty PM');
  // already-ordinal and slash dates are unchanged; a month with a year is not a day
  assert.equal(en('March 5th, 1958.'), 'March fifth, nineteen fifty-eight.');
  assert.equal(en('11/30/2026'), 'November thirtieth, twenty twenty-six');
  assert.equal(en('05/2027'), 'May twenty twenty-seven');
  assert.equal(en('May I help you?'), 'May I help you?');
});

test('whole hours, cents, "65+" and 211 are read as people say them', () => {
  assert.equal(en('Time: 9:00 AM to 1:00 PM'), 'Time: nine AM to one PM');
  assert.equal(en('HEAT WARNING until 8:00 PM Friday'), 'Heat Warning until eight PM Friday');
  assert.equal(en('Tax $0.52'), 'Tax fifty-two cents');
  assert.equal(en('Fare: $1.75 - Seniors 65+: $0.85'), 'Fare: one dollar and seventy-five cents. Seniors sixty-five and older: eighty-five cents');
  assert.equal(en('Cooling centers are open. Call 211.'), 'Cooling centers are open. Call two one one.');
  assert.equal(en('Call 911.'), 'Call nine one one.');
  assert.equal(en('We open at 9:00.'), "We open at nine o'clock.");
  assert.equal(en('It is $3.25.'), 'It is three dollars and twenty-five cents.');
});

test('the verbs live, close and use, and "am"/"an" said alone, get respellings; "nowruz" in lower case too', () => {
  assert.equal(en('live'), 'liv');
  assert.equal(en('close'), 'cloze');
  assert.equal(en('use'), 'yooz');
  assert.equal(en('Please close the window.'), 'Please cloze the window.');
  assert.equal(en('My mother lives with us.'), 'My mother livs with us.');
  assert.equal(en('am'), 'amm');
  assert.equal(en('an'), 'Ann');
  assert.equal(en('nowruz'), 'Norooz');
  // sentences where the voice already gets it right are left alone
  assert.equal(en('Where do you live?'), 'Where do you live?');
  assert.equal(en('Is it close?'), 'Is it close?');
  assert.equal(en('I am from Iran.'), 'I am from Iran.');
});

test('lines recorded through the carrier are real lines of the content', () => {
  const texts = new Set(audioRequests(loadContent()).filter((r) => r.lang === 'en').map((r) => r.text));
  for (const t of say.carry || []) assert.ok(texts.has(t), `pronunciation.json carry: "${t}" is not an English line of the content any more`);
  for (const t of Object.keys(say.exact)) if (t.length > 12) assert.ok(texts.has(t), `pronunciation.json exact: "${t}" is not an English line of the content any more`);
});
