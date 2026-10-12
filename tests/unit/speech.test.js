import test from 'node:test';
import assert from 'node:assert/strict';
import { shortenPauses, pieces, resample, PIECE_S, PAUSE_MS, START_MS, MAX_MS } from '../../src/js/speech.js';

const RATE = 16000;
// a "recording": [seconds, loudness] parts; speech is a 220 Hz tone, quiet is faint noise
function recording(parts) {
  const out = new Float32Array(Math.round(parts.reduce((s, p) => s + p[0], 0) * RATE));
  let o = 0, seed = 7;
  for (const [secs, level] of parts) {
    for (let i = 0, n = Math.round(secs * RATE); i < n; i++, o++) {
      seed = (seed * 48271) % 2147483647;
      out[o] = level > 0.01 ? level * Math.sin((2 * Math.PI * 220 * o) / RATE) : level * (seed / 2147483647 - 0.5);
    }
  }
  return out;
}
const loudSeconds = (x) => x.reduce((n, v) => n + (Math.abs(v) > 0.05 ? 1 : 0), 0) / RATE;

test('recording limits suit slow speakers', () => {
  assert.ok(PAUSE_MS >= 2000 && PAUSE_MS <= 2500, 'a pause of about 2.2 s ends the recording');
  assert.ok(START_MS >= 9000 && START_MS <= 12000, 'about 10 s to start speaking');
  assert.ok(MAX_MS >= 17000 && MAX_MS <= 20000, 'about 18 s at most');
});

test('long pauses are shortened, speech is kept whole', () => {
  const rec = recording([[3, 0.002], [1.5, 0.3], [2, 0.002], [1, 0.3], [2.2, 0.002]]);       // 9.7 s with 2.5 s of speech
  const out = shortenPauses(rec);
  assert.ok(Math.abs(loudSeconds(out) - loudSeconds(rec)) < 0.02, 'no speech is lost');
  const secs = out.length / RATE;
  assert.ok(secs > 2.5 + 0.9 && secs < 2.5 + 1.5, `about 0.3 s of quiet is left on each side of speech (got ${secs.toFixed(2)} s)`);
});

test('a recording with no pauses, or with no speech, is left as it is', () => {
  const talk = recording([[6, 0.3]]), quiet = recording([[6, 0.002]]), short = recording([[0.5, 0.3]]);
  assert.equal(shortenPauses(talk), talk);
  assert.equal(shortenPauses(quiet), quiet);
  assert.equal(shortenPauses(short), short);
});

test('quiet speech in a noisy room is not thrown away', () => {
  const rec = recording([[2, 0.008], [2, 0.05], [2, 0.008]]);          // voice only six times louder than the room
  const out = shortenPauses(rec);
  const voiced = (x) => x.reduce((n, v) => n + (Math.abs(v) > 0.02 ? 1 : 0), 0);
  assert.ok(voiced(out) >= voiced(rec) * 0.99);
});

test('a long recording is cut into pieces the recogniser can take, at quiet moments', () => {
  const rec = recording([[5, 0.3], [0.25, 0.002], [5, 0.3], [0.25, 0.002], [6, 0.3]]);        // 16.5 s, short breaths at 5 s and 10.25 s
  const parts = pieces(rec);
  assert.ok(parts.length >= 2);
  assert.ok(parts.every((p) => p.length <= PIECE_S * RATE), 'no piece is too long');
  assert.equal(parts.reduce((n, p) => n + p.length, 0), rec.length, 'nothing is lost or repeated');
  const firstCut = parts[0].length / RATE;
  assert.ok(firstCut > 5 && firstCut < 5.25, `the first cut falls in the breath, not in a word (at ${firstCut.toFixed(2)} s)`);
  assert.equal(pieces(recording([[3, 0.3]])).length, 1);
});

test('resample: 48 kHz to 16 kHz keeps the length in seconds', () => {
  const x = new Float32Array(48000).fill(0.5);
  const y = resample(x, 48000, 16000);
  assert.equal(y.length, 16000);
  assert.ok(Math.abs(y[100] - 0.5) < 1e-6);
});
