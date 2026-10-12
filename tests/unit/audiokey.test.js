import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent, audioRequests, ROOT } from '../../tools/content.mjs';
import { spoken } from '../../tools/spoken.mjs';
import { audioKey, wordsOf, wordsOfHeadword, normWord } from '../../src/js/audiokey.js';

// the real content, exactly as the app receives it, and every recording the build asks the voice generator for
const content = JSON.parse(JSON.stringify(loadContent()));
const requests = audioRequests(loadContent());
const keys = new Set(requests.map((r) => r.key));
const say = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'pronunciation.json'), 'utf8'));
const tap = (word) => audioKey('en', 's', 's', word);       // what a tap on one word asks for (components.js wordsLine)
const words = (list) => list.map((w) => w.word);

test('a word of a sentence: lower case at the start, names and whole-capital words as written', () => {
  assert.deepEqual(words(wordsOf('Where is the milk?')), ['where', 'is', 'the', 'milk']);
  assert.deepEqual(words(wordsOf('I am from Iran.')), ['I', 'am', 'from', 'Iran']);
  assert.deepEqual(words(wordsOf("I'd like tea. Thank you!")), ["I'd", 'like', 'tea', 'thank', 'you']);
  assert.deepEqual(words(wordsOf('Here is my ID.')), ['here', 'is', 'my', 'ID']);
  assert.deepEqual(words(wordsOf('TV is on.')), ['TV', 'is', 'on'], 'never "tV"');
  assert.deepEqual(words(wordsOf('Never tell anyone your PIN.')).slice(-1), ['PIN']);
  assert.equal(normWord('ATM'), 'ATM');
  assert.equal(normWord('Monday'), 'Monday');
  assert.equal(normWord('Please'), 'please');
});

test('a capital letter alone is the letter — except "A" at the start of a sentence, which is the article', () => {
  assert.deepEqual(words(wordsOf('A table for two.')), ['a', 'table', 'for', 'two']);
  assert.deepEqual(words(wordsOf('Sure. A table for two?')), ['sure', 'a', 'table', 'for', 'two']);
  assert.deepEqual(words(wordsOf('M as in Mary.')), ['M', 'as', 'in', 'Mary']);
  assert.deepEqual(words(wordsOf('It is at gate A.')), ['it', 'is', 'at', 'gate', 'A']);
  assert.deepEqual(words(wordsOf('I need a doctor.')), ['I', 'need', 'a', 'doctor']);
  assert.equal(wordsOf('Ahmadi. A-H-M-A-D-I.')[1].word, null, 'a spelled-out name is not a word to tap');
});

test('a vocabulary headword of one word is heard as its own recording', () => {
  assert.deepEqual(wordsOfHeadword('A'), [{ text: 'A', word: 'A' }]);
  assert.deepEqual(wordsOfHeadword('ID'), [{ text: 'ID', word: 'ID' }]);
  assert.deepEqual(wordsOfHeadword('Thanksgiving'), [{ text: 'Thanksgiving', word: 'Thanksgiving' }]);
  assert.deepEqual(wordsOfHeadword('hello'), [{ text: 'hello', word: 'hello' }]);
  assert.deepEqual(words(wordsOfHeadword('thank you')), ['thank', 'you']);
  assert.deepEqual(words(wordsOfHeadword('Out of order')), ['out', 'of', 'order']);
  // the letter A and the article "a" are two different recordings; the letter I and the word I are the same one
  assert.notEqual(tap(wordsOfHeadword('A')[0].word), tap(wordsOf('A table for two.')[0].word));
  const i = content.vocab.filter((w) => w.en === 'I');
  assert.deepEqual(i.map((w) => w.cat).sort(), ['letters', 'little'], 'the word I and the letter I are two entries');
  assert.notEqual(i[0].id, i[1].id);
  for (const en of ['A', 'ID', 'PIN', 'ATM', 'TV']) {
    const w = content.vocab.find((x) => x.en === en);
    assert.ok(w, en);
    assert.equal(tap(wordsOfHeadword(w.en)[0].word), audioKey('en', 's', 's', en), `${en}: the tap plays the headword's own slow recording`);
  }
});

test('every recording the app can ask for — a headword, its example, any word that can be tapped — is in the list given to the voice generator', () => {
  const missing = [];
  const need = (where, key, text) => { if (!keys.has(key)) missing.push(`${where}: "${text}"`); };
  const tapped = (where, list) => { for (const w of list) if (w.word) need(where, tap(w.word), w.word); };
  for (const w of content.vocab) {
    for (const speed of ['n', 's']) need(`word ${w.id} (${speed})`, audioKey('en', 's', speed, w.en), w.en);        // list, review card: «گوش کنید» / «آهسته»
    if (w.ex) need(`example of ${w.id}`, audioKey('en', 's', 'n', w.ex.en), w.ex.en);
    tapped(`headword ${w.id}`, wordsOfHeadword(w.en));                                                                 // review card, and the result of «تلفظ»
  }
  for (const L of Object.values(content.lessons)) {
    for (const p of L.phrases) tapped(`lesson ${L.id}`, wordsOf(p.en));               // phrase card, "say it", review card
    for (const o of L.respond.ok) tapped(`lesson ${L.id} answer`, wordsOf(o.en));     // the answer the learner has just said aloud
  }
  for (const P of content.patterns) for (const it of P.items) tapped(`pattern ${P.id}`, wordsOf(it.en));              // sentence builder
  assert.deepEqual(missing, []);
  // and no recording is asked for under a mangled name
  for (const r of requests) if (r.pack === 'words') assert.ok(!/^[a-z][A-Z]/.test(r.text), `"${r.text}"`);
});

test('the voice generator is asked for letter names, not for words that look like them', () => {
  const letters = content.vocab.filter((w) => w.cat === 'letters');
  assert.equal(letters.length, 26);
  for (const w of letters) {
    assert.equal(spoken(w.en, 'en', say), `${w.en}.`, `the letter ${w.en} is read standing alone`);
    assert.match(w.ex.en, new RegExp(`^${w.en} as in \\w`), w.ex.en);
  }
  assert.equal(spoken('A as in apple.', 'en', say), 'A, as in apple.', 'not the article "a"');
  assert.equal(spoken('A table for two.', 'en', say), 'A table for two.');
  assert.equal(spoken('ID', 'en', say), 'I.D.');
  assert.equal(spoken('PIN', 'en', say), 'pin');
});

// ---- the screens added in development pass 3 ------------------------------------------------------------------
test('every recording the newer screens can ask for is in the list: other wordings, word grids, papers, the fixed request, the look back', async () => {
  const { ownPieces, CARRIERS } = await import('../../src/js/own.js');
  const { partnerLines } = await import('../../src/js/learn.js');
  const missing = [];
  const need = (where, voice, speed, text) => { if (!keys.has(audioKey('en', voice, speed, text))) missing.push(`${where}: "${text}" (${voice}/${speed})`); };
  const VOICES = ['s', 'm', 'b', 'k', 'a'];
  for (const L of Object.values(content.lessons)) {
    assert.ok(VOICES.includes(L.them.voice), L.id);
    // "the same thing in other words": heard at both speeds in the variant's voice (always filled in by the loader)
    for (const v of L.variants || []) { assert.ok(VOICES.includes(v.voice), `${L.id}: ${v.en}`); need(`variant of ${L.id}`, v.voice, 'n', v.en); need(`variant of ${L.id}`, v.voice, 's', v.en); }
    // a grid of words to tap: each is a vocabulary headword with its own recording
    for (const w of (L.grid || { words: [] }).words) { assert.ok(content.vocab.some((x) => x.en === w), `${L.id}: grid word ${w}`); need(`grid of ${L.id}`, 's', 'n', w); need(`grid of ${L.id}`, 's', 's', w); }
    // the look back after five lessons: a partner's line in the partner's voice, the lesson's sentences in their own
    for (const l of partnerLines(L)) need(`look back, ${L.id}`, L.them.voice, 'n', l.en);
    for (const p of L.phrases) need(`look back, ${L.id}`, p.voice, 'n', p.say || p.en);
  }
  for (const R of content.roleplays) {
    assert.ok(VOICES.includes(R.them.voice), R.id);
    for (const t of R.turns) { need(R.id, R.them.voice, 'n', t.them.en); need(R.id, R.them.voice, 's', t.them.en); for (const r of t.replies) if (r.then) { need(R.id, R.them.voice, 'n', r.then.en); need(R.id, R.them.voice, 's', r.then.en); } }
  }
  // «خواندن نوشته‌ها»: every line of every paper, in the learner's voice
  for (const P of content.papers) for (const l of P.lines) need(`paper ${P.id}`, 's', 'n', l.en);
  // the sentences the interface itself offers (the "Could you repeat that, please?" button): with the first download
  for (const [k, f] of Object.entries(content.ui.fixed || {})) if (f && f.en) { need(`fixed ${k}`, 's', 'n', f.en); assert.ok(requests.find((r) => r.key === audioKey('en', 's', 'n', f.en)).users.includes('core'), `${f.en} belongs to the first download`); }
  // «جملهٔ خودِ شما»: every piece at natural speed (a missing slow recording is the natural one slowed down); the beginnings of the sentences at both speeds
  for (const text of ownPieces()) need('own sentence', 's', 'n', text);
  for (const text of Object.values(CARRIERS)) need('own sentence', 's', 's', text);
  assert.deepEqual(missing, []);
  // the pieces can be fetched as one group: every one of them names the pack "me" among its users
  const mine = requests.filter((r) => r.users.includes('me'));
  assert.ok(mine.length >= ownPieces().length);
  assert.ok(mine.every((r) => r.lang === 'en' && r.voice === 's'));
  for (const text of ['A', 'Z', 'zero', 'nine', 'fifty-five', 'ninety-nine', 'first', 'fourteenth', 'thirty-first', 'January', 'December', 'nineteen', 'twenty', 'two thousand', 'oh']) assert.ok(mine.some((r) => r.text === text && r.speed === 'n'), text);
  // a letter of a spelled name is the letter's own recording, read as a letter ("A." — not the article)
  assert.equal(spoken('A', 'en', say), 'A.');
  assert.equal(spoken('fifty-five', 'en', say), 'fifty-five');
  assert.equal(spoken('two thousand', 'en', say), 'two thousand');
});
