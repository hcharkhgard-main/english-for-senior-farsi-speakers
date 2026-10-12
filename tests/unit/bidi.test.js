// Latin-script runs inside Farsi sentences: what gets isolated as left-to-right, and what stays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitMixed } from '../../src/js/bidi.js';

const ltr = (s) => splitMixed(s).filter((p) => p.ltr).map((p) => p.text);
const whole = (s) => splitMixed(s).map((p) => p.text).join('');

test('nothing is lost or changed, whatever the input', () => {
  for (const s of ['', 'سلام', 'Hello!', 'مثل: 212-555-0142', '«Apt. 12» یا «#12».', 'a (b', 'a) b', '((', '…', '$', '۳ دلار و ۹۹ سنت ($3.99)', '  Fifty.  ']) assert.equal(whole(s), s);
});

test('pure Farsi is left alone', () => {
  assert.deepEqual(splitMixed('امروز دوست دارید چه چیزی یاد بگیریم؟'), [{ text: 'امروز دوست دارید چه چیزی یاد بگیریم؟', ltr: false, en: false }]);
  assert.deepEqual(ltr('مرحلهٔ ۲ از ۹: جمله‌های مهم'), []);
});

test('an English-only label is one isolated piece, full stop included', () => {
  assert.deepEqual(ltr('Fifty.'), ['Fifty.']);
  assert.deepEqual(ltr('I am / You are'), ['I am / You are']);
  assert.equal(splitMixed('Fifty.')[0].en, true);
});

test('phone numbers, prices and dates are isolated; plain numbers and times are not', () => {
  assert.deepEqual(ltr('مثل: 212-555-0142'), ['212-555-0142']);
  assert.deepEqual(ltr('۳ دلار و ۹۹ سنت ($3.99)'), ['$3.99']);
  assert.deepEqual(ltr('۱۲ دلار و ۵۰ سنت ($12.50)'), ['$12.50']);
  assert.deepEqual(ltr('۲۰ دلار ($20)'), ['$20']);
  assert.deepEqual(ltr('یعنی 3/5/1958 می‌شود ۵ مارس، نه ۳ مه.'), ['3/5/1958']);
  assert.deepEqual(ltr('ساعت ده است. (10:00)'), []);
  assert.deepEqual(ltr('خودتان با تلفن شمارهٔ ۹۱۱ (911) را بگیرید.'), []);
  assert.equal(splitMixed('مثل: 212-555-0142').find((p) => p.ltr).en, false);
});

test('an address or a menu path stays in one piece, in English order', () => {
  assert.deepEqual(ltr('مثل: 25 Oak Street, Apartment 12, Springfield'), ['25 Oak Street, Apartment 12, Springfield']);
  assert.deepEqual(ltr('این مسیر را باز کند و اجازه بدهد: Settings > Apps > Safari > Microphone'), ['Settings > Apps > Safari > Microphone']);
  assert.deepEqual(ltr('جواب کوتاه: Yes / No'), ['Yes / No']);
  assert.deepEqual(ltr('روی نامه‌ها آن را کوتاه می‌نویسند: «Apt. 12» یا «#12».'), ['Apt. 12', '#12']);
});

test('each quoted English phrase is its own piece; Farsi punctuation between them stays Farsi', () => {
  assert.deepEqual(ltr('در مرورگر Chrome از منوی سه‌نقطه «Add to Home screen» یا «Install app» را بزنید.'), ['Chrome', 'Add to Home screen', 'Install app']);
  assert.deepEqual(ltr('اندازه‌ها: small، medium، large.'), ['small', 'medium', 'large']);
  assert.deepEqual(ltr('nine (۹)، eleven (۱۱)، two thirty (۲:۳۰).'), ['nine', 'eleven', 'two thirty']);
  assert.deepEqual(ltr('برای گفتنِ "I want to buy milk"، معمولاً بعد از want از to استفاده می‌کنیم.'), ['I want to buy milk', 'want', 'to']);
});

test('question and exclamation marks belong to the English; so does the full stop of an English sentence', () => {
  assert.deepEqual(ltr('برای چند تا: «Where are the eggs?»'), ['Where are the eggs?']);
  assert.deepEqual(ltr('بگویید «Happy holidays!» یعنی تعطیلات مبارک.'), ['Happy holidays!']);
  assert.deepEqual(ltr('بگویید: «I called by mistake. There is no emergency.»'), ['I called by mistake. There is no emergency.']);
  assert.deepEqual(ltr('بعد از turn فقط left یا right می‌گوییم: Turn left. برای «کنارِ» بگویید «next to».'), ['turn', 'left', 'right', 'Turn left.', 'next to']);
  assert.deepEqual(ltr('در انگلیسی «am» نباید جا بیفتد: I\'m fine.'), ['am', "I'm fine."]);
});

test('the full stop of the Farsi sentence is not pulled into a single English word', () => {
  assert.deepEqual(ltr('فعل هم شکل گذشته می‌گیرد: start می‌شود started.'), ['start', 'started']);
  assert.deepEqual(ltr('شمارهٔ صندلی روی کارت پرواز است، مثل 24C.'), ['24C']);
  assert.deepEqual(ltr('بعد از «I» مستقیم «think» می‌آید، بدون am.'), ['I', 'think', 'am']);
});

test('"…" stays on the English side it was written on', () => {
  assert.deepEqual(ltr('پشت تلفن می‌گویند «This is …»، نه «I am …».'), ['This is …', 'I am …']);
  assert.deepEqual(ltr('وقتی می‌پرسند «Can you …؟»، جواب کوتاه «Yes, I can» یا «No, I can\'t» است.'), ['Can you …', 'Yes, I can', "No, I can't"]);
  assert.deepEqual(ltr('… ago (… پیش)'), ['… ago']);
  assert.deepEqual(ltr('برای سن می‌گوییم «I am … years old»، نه «I have … years».'), ['I am … years old', 'I have … years']);
});

test('brackets are never split between the two directions', () => {
  assert.deepEqual(ltr('یکی را انتخاب کنید: نقد (cash) یا کارت (card).'), ['cash', 'card']);
  assert.deepEqual(ltr('(برای «Happy birthday» و «Congratulations» فقط بگویید «Thank you».)'), ['Happy birthday', 'Congratulations', 'Thank you']);
  assert.deepEqual(ltr('بگویید Yes (or No) و صبر کنید'), ['Yes (or No)']);
  assert.deepEqual(ltr('کلمهٔ Hello) تمام'), ['Hello']);
  assert.deepEqual(ltr('X مثل X-ray (عکس رادیولوژی).'), ['X', 'X-ray']);
});

test('pieces with English words are marked as English; numbers are not', () => {
  const parts = splitMixed('مثل: 25 Oak Street و 212-555-0142');
  assert.deepEqual(parts.filter((p) => p.ltr).map((p) => [p.text, p.en]), [['25 Oak Street', true], ['212-555-0142', false]]);
});
