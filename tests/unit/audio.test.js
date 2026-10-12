// The browser's own voice (used only for a sentence that has no recording): on-device voices only,
// also while the browser's list of voices is still empty.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../../src/js/audio.js';

const index = { packs: [], clips: {} };
const fetchFn = async () => ({ ok: true, json: async () => index });
const clip = { lang: 'en', voice: 's', speed: 'n', text: 'A sentence without a recording.' };

// a stand-in for window.speechSynthesis: `voices` is what getVoices() returns now, `later` what it returns after 'voiceschanged'
function fakeSynth({ voices = [], later = null, after = 50 } = {}) {
  const spoken = [], listeners = new Set();
  let list = voices;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.speechSynthesis = {
    getVoices: () => list,
    addEventListener: (name, f) => { if (name === 'voiceschanged') listeners.add(f); },
    removeEventListener: (name, f) => listeners.delete(f),
    cancel() {},
    speak(u) { spoken.push(u); setTimeout(() => u.onend && u.onend(), 5); },
  };
  if (later) setTimeout(() => { list = later; listeners.forEach((f) => f()); }, after);
  return spoken;
}
const local = { lang: 'en-US', localService: true, name: 'on the device' };
const remote = { lang: 'en-US', localService: false, name: 'sends the text to a server' };
const farsiOnly = { lang: 'fa-IR', localService: true, name: 'Farsi, on the device' };

test('an on-device voice is used at once', async () => {
  const spoken = fakeSynth({ voices: [remote, local] });
  assert.equal(await createAudio({ fetchFn }).play(clip), 'ended');
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].voice, local);
});

test('a voice that sends the text away is never used', async () => {
  const spoken = fakeSynth({ voices: [remote] });
  assert.equal(await createAudio({ fetchFn }).play(clip), 'missing');
  assert.equal(spoken.length, 0);
});

test('while the list of voices is still empty, nothing is spoken with the browser\'s default voice: the list is waited for', async () => {
  const spoken = fakeSynth({ voices: [], later: [remote, local] });
  assert.equal(await createAudio({ fetchFn }).play(clip), 'ended');
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].voice, local, 'the on-device voice that arrived with the list');
});

test('…and when the list that arrives has only a voice that sends the text away, nothing is spoken', async () => {
  const spoken = fakeSynth({ voices: [], later: [remote] });
  assert.equal(await createAudio({ fetchFn }).play(clip), 'missing');
  assert.equal(spoken.length, 0);
});

test('a list that stays empty means no voice: nothing is spoken', async () => {
  const spoken = fakeSynth({ voices: [] });
  assert.equal(await createAudio({ fetchFn }).play(clip), 'missing');
  assert.equal(spoken.length, 0);
});

test('no voice for the language: an English sentence is not read by another language\'s voice', async () => {
  const spoken = fakeSynth({ voices: [farsiOnly] });
  assert.equal(await createAudio({ fetchFn }).play(clip), 'missing');
  assert.equal(spoken.length, 0);
});

// A second play while the first is still sounding (the review screen plays a card by itself, the learner taps the same
// card; a double tap on a play button): the first play is told 'stopped' — before, its promise never resolved — and a
// 'pause' left over from stopping it does not cut the second one short.
test('a sound replaced by another one resolves as "stopped", and the new one plays to its end', async () => {
  class FakeAudio {
    constructor() { this.paused = true; this.ended = false; this.timer = null; }
    setAttribute() {}
    play() { this.paused = false; this.ended = false; clearTimeout(this.timer); this.timer = setTimeout(() => { this.ended = true; this.paused = true; this.onended && this.onended(); }, 40); return Promise.resolve(); }
    pause() { if (this.paused) return; this.paused = true; clearTimeout(this.timer); setTimeout(() => this.onpause && this.onpause(), 0); }      // like a browser: the event comes a moment later
  }
  const saved = globalThis.Audio; globalThis.Audio = FakeAudio;
  try {
    const bytes = new Uint8Array(100);
    const idx = { packs: [{ id: 'core', file: 'core.mp3', bytes: 100 }], clips: {} };
    const { audioKey } = await import('../../src/js/audiokey.js');
    const c = { lang: 'en', voice: 's', speed: 'n', text: 'I need help.', tts: false };
    idx.clips[audioKey('en', 's', 'n', c.text)] = [0, 0, 100];
    const fetchFn = async (u) => ({ ok: true, status: 200, json: async () => idx, arrayBuffer: async () => bytes.buffer.slice(0) });
    const a = createAudio({ fetchFn });
    const first = a.play(c);
    await new Promise((z) => setTimeout(z, 10));
    const second = a.play(c);
    const timeout = new Promise((z) => setTimeout(() => z('never'), 1000));
    assert.equal(await Promise.race([first, timeout]), 'stopped');
    assert.equal(await Promise.race([second, timeout]), 'ended');
    // stopping outright tells the one waiting at once, too
    const third = a.play(c);
    await new Promise((z) => setTimeout(z, 10));
    a.stop();
    assert.equal(await Promise.race([third, timeout]), 'stopped');
  } finally { globalThis.Audio = saved; }
});
