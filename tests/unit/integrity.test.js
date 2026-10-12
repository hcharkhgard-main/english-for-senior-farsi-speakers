// Nothing damaged is played or kept: sound packs are checked against audio/index.json (size) and the hash in their
// name, pronunciation files against tools/asr-files.json; and what is kept ahead for use without a connection
// (src/js/ahead.js) covers the next lesson, review, number listening and nearby papers. (QA round 3: security H1,
// features M1.)
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAudio, packIsGood } from '../../src/js/audio.js';
import { asrFileOk } from '../../src/js/speech.js';
import { aheadParts, aheadPacks } from '../../src/js/ahead.js';
import { audioKey } from '../../src/js/audiokey.js';
import { loadContent } from '../../tools/content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const LOGIN = Buffer.from('<html><body><h1>Welcome to Free WiFi</h1><a href="/login">Accept terms</a></body></html>');

// a pack of 400 bytes named the way tools/pack-audio.mjs names it, with one clip in it
const bytes = Buffer.alloc(400, 7);
const pack = { id: 'l-test', file: `l-test.${sha1(bytes).slice(0, 8)}.mp3`, bytes: bytes.length };
const clip = { lang: 'en', voice: 's', speed: 'n', text: 'Hello! How are you?', tts: false };
const index = { packs: [pack], clips: { [audioKey('en', 's', 'n', clip.text)]: [0, 0, 400] } };
const res = (buf, type = 'audio/mpeg') => ({ ok: true, status: 200, headers: { get: () => type }, json: async () => JSON.parse(buf), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) });
const server = (answer) => { const asked = []; return { asked, fetchFn: async (u) => { asked.push(u); return u.endsWith('index.json') ? res(Buffer.from(JSON.stringify(index)), 'application/json') : res(answer(u, asked.length)); } }; };

test('a sound pack is good only with the listed size and the content hash in its name', async () => {
  const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
  assert.equal(await packIsGood(pack, ab(bytes)), true);
  assert.equal(await packIsGood(pack, ab(LOGIN)), false, 'a Wi-Fi login page');
  assert.equal(await packIsGood(pack, ab(bytes.subarray(0, 300))), false, 'a cut-off download');
  assert.equal(await packIsGood(pack, ab(Buffer.alloc(400, 8))), false, 'right size, other bytes');
  assert.equal(await packIsGood(null, ab(bytes)), false);
});

test('a login page instead of a pack is never played or kept: "unavailable", asked again once, and the next tap tries again', async () => {
  const kept = [];
  const s = server(() => LOGIN);
  const audio = createAudio({ fetchFn: s.fetchFn, onPack: (u, b) => kept.push([u, b.byteLength]) });
  assert.equal(await audio.play(clip), 'unavailable');
  assert.equal(s.asked.filter((u) => u.endsWith('.mp3')).length, 2, 'asked twice (the first answer may have been a damaged stored copy)');
  assert.deepEqual(kept, []);
  assert.equal(await audio.play(clip), 'unavailable');
  assert.equal(s.asked.filter((u) => u.endsWith('.mp3')).length, 4, 'a failed pack is not remembered: the next tap fetches again');
});

test('a damaged copy is replaced by the right one when it is asked for again', async () => {
  const kept = [];
  const s = server((u, n) => (n <= 2 ? bytes.subarray(0, 96) : bytes));      // the first answer is a cut-off copy, the second the real pack
  const audio = createAudio({ fetchFn: s.fetchFn, onPack: (u, b) => kept.push([u, b.byteLength]) });
  const r = await audio.play(clip);
  assert.notEqual(r, 'unavailable');
  assert.notEqual(r, 'offline');
  assert.deepEqual(kept, [['audio/' + pack.file, 400]], 'only the checked pack is handed on to be kept');
});

test('keep() stores packs ahead without playing them, skips stored ones, and reports the ones that were not right', async () => {
  const kept = [];
  const good = createAudio({ fetchFn: server(() => bytes).fetchFn, onPack: (u) => kept.push(u) });
  assert.deepEqual(await good.keep(['l-test', 'no-such-pack']), { ok: ['l-test'], failed: [] });
  assert.deepEqual(kept, ['audio/' + pack.file]);
  const s = server(() => bytes);
  const stored = createAudio({ fetchFn: s.fetchFn });
  assert.deepEqual(await stored.keep(['l-test'], { isStored: async () => true }), { ok: ['l-test'], failed: [] });
  assert.equal(s.asked.filter((u) => u.endsWith('.mp3')).length, 0, 'a stored pack is not downloaded again');
  const portal = createAudio({ fetchFn: server(() => LOGIN).fetchFn, onPack: () => assert.fail('a login page was handed on to be kept') });
  assert.deepEqual(await portal.keep(['l-test']), { ok: [], failed: ['l-test'] });
});

test('a pronunciation file is kept only with the size and SHA-256 of tools/asr-files.json', async () => {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'asr-files.json'), 'utf8')).files;
  const asList = Object.fromEntries(Object.entries(list).map(([f, v]) => [f, [v.bytes, v.sha256]]));
  const tok = fs.readFileSync(path.join(ROOT, 'site', 'asr', 'tokens.txt'));
  const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
  assert.equal(await asrFileOk('tokens.txt', ab(tok), asList), true);
  assert.equal(await asrFileOk('tokens.txt', ab(LOGIN), asList), false);
  const same = Buffer.from(tok); same[10] ^= 1;
  assert.equal(await asrFileOk('tokens.txt', ab(same), asList), false, 'same size, one byte changed');
  assert.equal(await asrFileOk('encoder_model.ort', ab(LOGIN), asList), false);
  for (const f of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'encoder_model.ort', 'decoder_model_merged.ort', 'tokens.txt']) assert.ok(list[f], `${f} is listed`);
});

// ---- kept ahead (ahead.js) -----------------------------------------------------------------------
const content = loadContent();
const idxFile = path.join(ROOT, 'site', 'audio', 'index.json');
const realIndex = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
const order = content.stages.flatMap((s) => s.lessons);
const fresh = () => ({ onboard: { done: true }, done: {}, srs: {}, at: {}, hard: {}, newDay: { d: 0, n: 0 }, settings: {}, me: {} });
const DAY = 20000;

test('after the first lesson: the next lesson, the words of the next review sets and number listening are kept ahead', () => {
  const st = fresh();
  const first = order[0];
  st.done[first] = { t: 1, n: 1 };
  for (const p of content.lessons[first].phrases) st.srs[`p:${first}:${p.id}`] = { b: 2, d: DAY + 3, n: 0 };
  const parts = aheadParts(st, content, realIndex, DAY);
  const packOf = (text, speed = 'n') => { const hit = realIndex.clips[audioKey('en', 's', speed, text)]; return hit ? realIndex.packs[hit[0]].id : null; };
  // every recorded word of the first review sets has its pack kept
  for (const id of (content.wordsFirst || []).slice(0, 12)) {
    const w = content.vocab.find((x) => x.id === id);
    const p = w && packOf(w.en);
    if (p) assert.ok(parts.review.includes(p), `${w.en}: ${p}`);
  }
  // number listening: its own pack, plus any pack that holds a number sentence shared with another unit
  if (realIndex.packs.some((p) => p.id === 'n-numbers')) assert.ok(parts.numbers.includes('n-numbers'), parts.numbers.join(','));
  assert.ok(parts.lesson.length > 0, 'the next lesson');
  const all = aheadPacks(st, content, realIndex, DAY);
  assert.equal(new Set(all).size, all.length, 'no pack twice');
  assert.ok(all.every((id) => realIndex.packs.some((p) => p.id === id)), 'only packs that exist');
  // a modest download: what one ordinary first day adds (the next lesson, review words, numbers)
  const mb = all.reduce((s, id) => s + realIndex.packs.find((p) => p.id === id).bytes, 0) / 1048576;
  assert.ok(mb < 16, `${mb.toFixed(1)} MB`);
});

test('before any lesson nothing but the first lesson and the first words; numbers only once a lesson is done', () => {
  const parts = aheadParts(fresh(), content, realIndex, DAY);
  assert.deepEqual(parts.numbers, []);
  assert.ok(parts.lesson.length > 0);
});

test('papers near the lessons done are kept ahead (those whose lines have recordings)', () => {
  const papers = Array.isArray(content.papers) ? content.papers : [];
  const P = papers.find((x) => x.lesson);
  if (!P) return;
  const st = fresh(); st.done[P.lesson] = { t: 1, n: 1 };
  // a recording for one of its lines, in a pack of its own
  const idx = { ...realIndex, packs: [...realIndex.packs, { id: 'papers', file: 'papers.00000000.mp3', bytes: 10 }], clips: { ...realIndex.clips, [audioKey('en', 's', 'n', P.lines[0].en)]: [realIndex.packs.length, 0, 10] } };
  assert.ok(aheadParts(st, content, idx, DAY).papers.includes('papers'));
});

test('damaged saved state does not break the plan', () => {
  const st = fresh(); st.srs = { 'p:constructor:p1': { b: 1, d: 0, n: 0 }, 'w-nope': { b: 1, d: 0, n: 0 } };
  assert.doesNotThrow(() => aheadPacks(st, content, realIndex, DAY));
});
