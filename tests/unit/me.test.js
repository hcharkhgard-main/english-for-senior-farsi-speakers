// «اطلاعات من» is never saved on the device (the owner's decision): the persistence boundary between me.js (memory)
// and store.js (localStorage).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, blank, migrate, toStored } from '../../src/js/store.js';
import { me, setMe, clearMe, hasMe, ME_KEYS, mayAsk, decline, forgetAll } from '../../src/js/me.js';

const bag = (init = {}) => { const data = new Map(Object.entries(init)); return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: (k) => { data.delete(k); } }; };
const quiet = { events: null };
const FULL = { name: 'Zahra Secretname', address: '987 Private Lane, Apt 4', contact: '310-555-0177', phone: '213-555-0199', born: '1950-1-2' };
const allStored = (storage) => [...storage.data.values()].join('\n');

test('every personal detail filled in, then saved: the stored text holds none of them', () => {
  forgetAll();
  const storage = bag();
  const store = createStore(storage, quiet);
  for (const k of ME_KEYS) setMe(k, FULL[k]);
  assert.deepEqual({ ...me }, FULL, 'the app has them while it is open');
  assert.equal(hasMe(), true);
  // every way the app saves: an ordinary change, a reset of progress, a change that tries to put them in the state
  store.update((s) => { s.done.x = { t: 1, n: 1 }; s.settings.neverAsk = true; });
  store.update((s) => { s.me = { ...me }; s.extra = { ...me }; });      // even if some code put them in the state by mistake
  store.reset(true);
  store.update((s) => { s.fav.w1 = 1; });
  const text = allStored(storage);
  assert.ok(text.length > 50, 'something was saved');
  for (const k of ME_KEYS) assert.ok(!text.includes(FULL[k]), `${k} is not in what is stored`);
  assert.ok(!text.includes('"me"'), 'no "me" field at all');
  assert.equal(JSON.parse(text).settings.neverAsk, true, '«هیچ‌وقت نپرس» is a choice, not a detail: it is stored');
  // the boundary itself
  assert.ok(!toStored({ ...blank(), me: FULL }).includes('Secretname'));
  assert.deepEqual(Object.keys(JSON.parse(toStored(blank()))).sort(), Object.keys(blank()).sort());
  // a new start (a reload) has no details: they were in memory only
  forgetAll();
  assert.equal(hasMe(), false);
  assert.equal('me' in createStore(storage, quiet).state, false);
});

test('a phone with details saved by an earlier version is cleaned on the first start of this one', () => {
  const old = { ...blank(), me: FULL, done: { 'social-hello': { t: 5, n: 1 } } };
  delete old.settings.neverAsk;
  const storage = bag({ 'hamrah.v1': JSON.stringify(old) });
  const store = createStore(storage, quiet);
  assert.ok(store.state.done['social-hello'], 'progress is kept');
  const text = allStored(storage);
  for (const k of ME_KEYS) assert.ok(!text.includes(FULL[k]), `${k} is erased from the storage at once, before anything else is saved`);
  assert.equal(hasMe(), false, 'and is not brought into memory either');
  assert.equal('me' in migrate(old), false);
});

test('another copy of the app on the same address (…/hamrah-test) is cleaned of its details too; the rest of its entry stays', () => {
  const other = { ...blank(), me: FULL, done: { y: { t: 1, n: 1 } } };
  const storage = bag({ 'hamrah.v1|/hamrah-test/': JSON.stringify(other), 'hamrah.v1|/x/': '{damaged', 'unrelated': JSON.stringify({ me: 'not ours' }) });
  storage.key = (i) => [...storage.data.keys()][i] ?? null;
  Object.defineProperty(storage, 'length', { get: () => storage.data.size });
  createStore(storage, quiet);
  const left = JSON.parse(storage.data.get('hamrah.v1|/hamrah-test/'));
  assert.equal('me' in left, false);
  assert.deepEqual(left.done, other.done);
  assert.equal(storage.data.get('hamrah.v1|/x/'), '{damaged', 'a damaged entry is left alone');
  assert.equal(storage.data.get('unrelated'), JSON.stringify({ me: 'not ours' }), 'what is not the app\'s is not touched');
});

test('two tabs: the details are never carried from one tab to the other, and «پاک کردن همه‌چیز» in either clears them', () => {
  forgetAll();
  const storage = bag();
  const on = {}; const events = { addEventListener: (n, f) => { (on[n] ||= []).push(f); } };
  const fire = (n, e) => (on[n] || []).forEach((f) => f(e));
  const a = createStore(storage, quiet), b = createStore(storage, { events });
  setMe('name', FULL.name);
  a.update((s) => { s.done.x = { t: 1, n: 1 }; });
  fire('storage', { key: 'hamrah.v1', storageArea: storage });
  assert.ok(b.state.done.x);
  assert.ok(!storage.data.get('hamrah.v1').includes(FULL.name), 'nothing for the other tab to read');
  // an older version still open in a tab writes `me`: this one takes the progress and writes the details out again
  storage.setItem('hamrah.v1', JSON.stringify({ ...blank(), me: FULL }));
  fire('storage', { key: 'hamrah.v1', storageArea: storage });
  assert.ok(!storage.data.get('hamrah.v1').includes(FULL.name));
  // «پاک کردن همه‌چیز» in the other tab: the details this page holds go as well
  a.wipe();
  assert.equal(hasMe(), false);
  setMe('name', FULL.name);
  fire('storage', { key: null, storageArea: storage });
  b.update(() => {});
  b.wipe();
  assert.equal(hasMe(), false, '«پاک کردن همه‌چیز» clears them');
});

test('invitations: offered until the learner says no in this session, never with «هیچ‌وقت نپرس»', () => {
  forgetAll();
  const s = blank();
  assert.equal(mayAsk(s), true);
  assert.equal(mayAsk({ ...s, settings: { ...s.settings, neverAsk: true } }), false);
  decline();
  assert.equal(mayAsk(s), false, 'no again in the same session');
  forgetAll();
  assert.equal(mayAsk(s), true, 'a new start (or «پاک کردن همه‌چیز») may ask again');
  setMe('nope', 'x'); setMe('name', 42); setMe('address', 'y'.repeat(999));
  assert.equal('nope' in me, false);
  assert.equal(me.name, '');
  assert.equal(me.address.length, 200);
  clearMe();
  assert.equal(hasMe(), false);
});
