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
