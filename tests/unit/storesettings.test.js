// Settings read back from storage are always one of the choices the Settings screen offers (QA round 3, features L7):
// a damaged text size such as 1e9 must not make every screen — Settings too — unusable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, blank } from '../../src/js/store.js';

const withSettings = (settings) => migrate({ ...blank(), settings });

test('a text size or speed that Settings does not offer goes back to the usual one', () => {
  for (const scale of [1e9, -1, 0, 'big', null, 2, '1.5x']) assert.equal(withSettings({ ...blank().settings, scale }).settings.scale, 1, String(scale));
  for (const rate of [5, 0, 'slow', null]) assert.equal(withSettings({ ...blank().settings, rate }).settings.rate, 1, String(rate));
});

test('the offered choices are kept, also when stored as text', () => {
  for (const scale of [1, 1.15, 1.3, 1.5]) assert.equal(withSettings({ ...blank().settings, scale }).settings.scale, scale);
  assert.equal(withSettings({ ...blank().settings, scale: '1.3' }).settings.scale, 1.3);
  for (const rate of [1, 0.88, 0.78]) assert.equal(withSettings({ ...blank().settings, rate }).settings.rate, rate);
});

test('the switches are true or false; anything else is the usual value', () => {
  const s = withSettings({ ...blank().settings, ph: 'yes', faVoice: 0, auto: false, ai: 1, micOk: true }).settings;
  assert.deepEqual([s.ph, s.faVoice, s.auto, s.ai, s.micOk], [true, true, false, false, true]);
  const missing = migrate({ v: 1, settings: {} }).settings;
  assert.deepEqual(missing, blank().settings);
});
