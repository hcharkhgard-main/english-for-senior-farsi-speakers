// Two copies of the app on one address keep separate progress: the storage name carries the copy's path.
// (The name is fixed when store.js is loaded, so each "copy" here is its own load of the module.)
import test from 'node:test';
import assert from 'node:assert/strict';

const bagStorage = (bag = {}) => ({ bag, getItem: (k) => bag[k] ?? null, setItem: (k, v) => { bag[k] = String(v); }, removeItem: (k) => { delete bag[k]; } });
async function copyAt(baseURI, tag) {
  globalThis.document = { baseURI };
  try { return await import(`../../src/js/store.js?copy=${tag}`); } finally { delete globalThis.document; }
}
const quiet = { events: null };

test('each copy stores its progress under a name that carries its own path', async () => {
  const one = await copyAt('https://someone.github.io/hamrah/', 'one');
  const two = await copyAt('https://someone.github.io/hamrah-test/index.html?x=1#home', 'two');
  const storage = bagStorage();
  const a = one.createStore(storage, quiet), b = two.createStore(storage, quiet);
  a.update((s) => { s.me.name = 'Maryam'; s.done['social-hello'] = { t: 1, n: 1 }; });
  b.update((s) => { s.settings.scale = 1.5; });
  assert.deepEqual(Object.keys(storage.bag).sort(), ['hamrah.v1|/hamrah-test/', 'hamrah.v1|/hamrah/']);
  assert.equal(JSON.parse(storage.bag['hamrah.v1|/hamrah/']).me.name, 'Maryam');
  assert.equal(JSON.parse(storage.bag['hamrah.v1|/hamrah-test/']).me.name, '', 'the test copy never sees the learner\'s details');
  b.wipe();
  assert.equal(JSON.parse(storage.bag['hamrah.v1|/hamrah/']).me.name, 'Maryam', '"delete everything" in one copy leaves the other copy alone');
  assert.equal(storage.bag['hamrah.v1|/hamrah-test/'], undefined);
});

test('progress saved by an earlier build (the old name) is taken over once, and the old entry is removed', async () => {
  const m = await copyAt('https://someone.github.io/hamrah/', 'old');
  const old = m.blank(); old.me.name = 'Zahra'; old.done['store-where'] = { t: 5, n: 2 };
  const storage = bagStorage({ 'hamrah.v1': JSON.stringify(old), 'something.else': 'kept' });
  const store = m.createStore(storage, quiet);
  assert.equal(store.state.me.name, 'Zahra');
  assert.equal(store.state.done['store-where'].n, 2);
  assert.equal(storage.bag['hamrah.v1'], undefined, 'nothing is left under the old name');
  assert.equal(storage.bag['something.else'], 'kept');
  store.wipe();
  assert.deepEqual(Object.keys(storage.bag), ['something.else'], 'after "delete everything" no copy of the learner\'s data remains');
  assert.equal(m.createStore(storage, quiet).state.me.name, '', 'and the next start does not bring it back');
});

test('an old entry does not overwrite progress this copy already has', async () => {
  const m = await copyAt('https://someone.github.io/hamrah/', 'both');
  const older = m.blank(); older.me.name = 'Old';
  const newer = m.blank(); newer.me.name = 'New';
  const storage = bagStorage({ 'hamrah.v1': JSON.stringify(older), 'hamrah.v1|/hamrah/': JSON.stringify(newer) });
  assert.equal(m.createStore(storage, quiet).state.me.name, 'New');
  assert.equal(storage.bag['hamrah.v1'], undefined);
});

test('storage that refuses to be read or written does not stop the app', async () => {
  const m = await copyAt('https://someone.github.io/hamrah/', 'blocked');
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const store = m.createStore(blocked, quiet);
  assert.equal(store.state.v, 1);
  store.update((s) => { s.settings.scale = 1.3; });
  assert.equal(store.state.settings.scale, 1.3);
});
