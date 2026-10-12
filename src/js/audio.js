// The one audio player the whole app uses.
//
// Clips are pre-generated MP3s, stored many-to-a-file in "packs" (audio/<pack>.mp3) with
// an index of byte ranges (audio/index.json). A pack is one download and one cache entry,
// so a whole lesson works offline once its pack has been fetched.
//
// Playback uses a single <audio> element (it keeps working with the iPhone ring switch on
// silent, unlike Web Audio) and falls back to Web Audio, then to the browser's own voice.

import { audioKey } from './audiokey.js';

const SILENCE = 'data:audio/mpeg;base64,//NExAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExFMAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKYAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKwAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKwAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

// A pack is used (and kept on the phone) only if it is that pack: the size audio/index.json gives and the content
// hash in its name (<id>.<first 8 hex of its SHA-1>.mp3). On a Wi-Fi that shows a login page first, every request
// is answered with that page; a weak connection can cut a download short. Such an answer is never played, never
// kept, and a damaged copy found on the phone is deleted, so the next tap fetches the pack again.
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
export async function packIsGood(p, buf) {
  if (!p || !buf || buf.byteLength !== p.bytes) return false;
  const m = /\.([0-9a-f]{8})\.mp3$/.exec(p.file || '');
  if (!m) return true;                                   // a name without a hash (tests): the size is all there is
  try {
    const subtle = typeof crypto !== 'undefined' && crypto.subtle;
    if (!subtle) return true;                            // no hash function on this page: the size has been checked
    return hex(await subtle.digest('SHA-1', buf)).startsWith(m[1]);
  } catch { return true; }
}
// Deletes a stored copy of this file from every store of this copy of the site (the worker's and the page's).
async function forget(address) {
  try {
    if (typeof caches === 'undefined' || typeof document === 'undefined') return;
    const url = new URL(address, document.baseURI).href, mine = `hamrah|${new URL('./', document.baseURI).pathname}|`;
    for (const n of await caches.keys()) if (n.startsWith(mine)) await (await caches.open(n)).delete(url, { ignoreSearch: true });
  } catch { /* nothing stored, or storage blocked */ }
}
const damaged = () => Object.assign(new Error('pack damaged'), { damaged: true });

// onPack(address, bytes): called with every pack that has been fetched and checked (main.js keeps it on the phone
// when the service worker could not).
export function createAudio({ base = 'audio/', getRate = () => 1, fetchFn = (u) => fetch(u), onPack = null } = {}) {
  let index = null, indexPromise = null;
  const packs = new Map();            // pack id -> Promise<ArrayBuffer>
  const el = typeof Audio !== 'undefined' ? new Audio() : null;
  let token = 0, unlocked = false, unlocking = false, ctx = null, ctxSource = null, lastUrl = null;
  const listeners = new Set();
  let current = null;                 // { id } of what is playing, for button highlighting

  if (el) { el.preload = 'auto'; el.setAttribute('playsinline', ''); }

  // listeners are told when what is playing changes ('play') and when the list of recorded
  // clips has arrived ('index'), so controls drawn before that can switch to recorded audio
  const emit = (why = 'play') => listeners.forEach((f) => f(current, why));
  const setCurrent = (c) => { current = c; emit(); };

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetchFn(base + 'index.json').then((r) => { if (!r.ok) throw new Error('index ' + r.status); return r.json(); })
        .then((j) => { index = j; emit('index'); return j; }).catch((e) => { indexPromise = null; throw e; });
    }
    return indexPromise;
  }

  // The checked bytes of pack i. A wrong answer is deleted wherever it was stored and asked for once more
  // (the first may have come from a damaged stored copy); if the second is wrong too, the pack is "damaged".
  async function fetchPack(i) {
    const p = index.packs[i], address = base + p.file;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetchFn(address);
      if (!r.ok) throw new Error('pack ' + r.status);
      const buf = await r.arrayBuffer();
      if (await packIsGood(p, buf)) {
        if (onPack) { try { await onPack(address, buf); } catch { /* not kept: still played now */ } }
        return buf;
      }
      await forget(address);
    }
    throw damaged();
  }
  function loadPack(i) {
    const p = index.packs[i];
    if (!packs.has(p.id)) {
      const pr = fetchPack(i);
      pr.catch(() => packs.delete(p.id));
      packs.set(p.id, pr);
    }
    return packs.get(p.id);
  }

  // Makes sure these packs are on the phone, without keeping them in memory (for use without a connection later).
  // Packs already stored are not downloaded again. Resolves with { ok, failed } pack ids; onEach(done, total) reports progress.
  // stop(): asked before each pack; when it says yes, the rest is left for another time.
  async function keep(packIds, { onEach = null, isStored = null, stop = null } = {}) {
    await loadIndex();
    const want = [...new Set(packIds)].map((id) => index.packs.findIndex((p) => p.id === id)).filter((i) => i >= 0);
    const ok = [], failed = [];
    for (let n = 0; n < want.length; n++) {
      const p = index.packs[want[n]];
      if (stop && (await stop())) { failed.push(...want.slice(n).map((i) => index.packs[i].id)); break; }
      try {
        if (!(isStored && (await isStored(p)))) await (packs.has(p.id) ? packs.get(p.id).then((buf) => onPack && onPack(base + p.file, buf)) : fetchPack(want[n]));
        ok.push(p.id);
      } catch { failed.push(p.id); }
      if (onEach) onEach(n + 1, want.length);
    }
    return { ok, failed };
  }

  // iOS only lets a media element play freely after play() has been called on it once during
  // a tap or key press. So on the learner's first gesture we start a moment of silence.
  // This must never disturb real sound: it does nothing while a clip is playing or about to
  // play, and once the element has been started from a gesture it is not touched again
  // (a clip that takes over from the silence interrupts it — that still counts as started).
  function unlock() {
    if (unlocked || unlocking || !el || current) return;
    unlocking = true;
    const settle = (ok) => { unlocking = false; if (ok) unlocked = true; };
    try {
      el.src = SILENCE;
      const p = el.play();
      if (p && p.then) p.then(() => { settle(true); if (el.src === SILENCE) el.pause(); }, (err) => settle(!(err && err.name === 'NotAllowedError')));
      else settle(true);
    } catch { settle(false); }
  }
  // 'pointerdown' is not a gesture that iOS accepts for sound; the end of a tap, a click and a key press are.
  if (el && typeof window !== 'undefined' && window.addEventListener) {
    const gestures = ['pointerup', 'touchend', 'click', 'keydown'];
    const onGesture = () => { if (unlocked) gestures.forEach((g) => window.removeEventListener(g, onGesture, true)); else unlock(); };
    gestures.forEach((g) => window.addEventListener(g, onGesture, true));
  }

  function find(clip) {
    if (!index) return null;
    const hit = index.clips[audioKey(clip.lang || 'en', clip.voice || 's', clip.speed || 'n', clip.text)];
    if (hit) return { ref: hit, rate: 1 };
    if ((clip.speed || 'n') === 's') {            // no slow recording: slow the natural one down
      const nat = index.clips[audioKey(clip.lang || 'en', clip.voice || 's', 'n', clip.text)];
      if (nat) return { ref: nat, rate: 0.75 };
    }
    return null;
  }

  // The finish function of the sound now in the media element (playBytes). A new sound replaces it there: whoever
  // waits for the old one is told 'stopped' at once. Before, the new sound's handlers simply took the old one's place
  // and the old promise never resolved — a play() interrupted by another (the review screen's own playing, then a
  // tap) hung for ever.
  let finishing = null;
  function stop() {
    token++;
    if (finishing) finishing('stopped');
    if (el) { try { el.pause(); } catch { /* ignore */ } }
    if (ctxSource) { try { ctxSource.stop(); } catch { /* ignore */ } ctxSource = null; }
    if (typeof speechSynthesis !== 'undefined') { try { speechSynthesis.cancel(); } catch { /* ignore */ } }
    setCurrent(null);
  }

  // bytes: the MP3 bytes of a clip, or a Blob (the learner's own recording)
  function playBytes(bytes, rate, my) {
    return new Promise((resolve) => {
      if (!el) return resolve('blocked');
      if (finishing) finishing('stopped');
      if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = null; }
      const url = URL.createObjectURL(bytes instanceof Blob ? bytes : new Blob([bytes], { type: 'audio/mpeg' }));
      lastUrl = url;
      let done = false;
      const finish = (why) => {
        if (done) return;
        done = true;
        if (finishing === finish) { finishing = null; el.onended = el.onerror = el.onpause = null; }      // never the handlers of a newer sound
        if (lastUrl === url) { URL.revokeObjectURL(url); lastUrl = null; }      // nothing is kept once the sound is over
        resolve(why);
      };
      finishing = finish;
      el.onended = () => finish('ended');
      el.onerror = () => { webAudio(bytes, rate, my).then(finish); };
      // a phone call or the lock screen paused us; a 'pause' left over from stopping the previous sound arrives while
      // this one is already playing (el.paused is false then) and is not ours
      el.onpause = () => { if (el.paused && !el.ended) finish(my === token ? 'interrupted' : 'stopped'); };
      el.src = url;
      try { el.playbackRate = rate; el.preservesPitch = true; } catch { /* ignore */ }
      const p = el.play();
      if (p && p.then) p.then(() => { unlocked = true; }, (err) => {
        if (done) return;
        if (err && err.name === 'NotAllowedError') finish('blocked');
        else webAudio(bytes, rate, my).then(finish);
      });
    });
  }

  function webAudio(bytes, rate, my) {
    return new Promise((resolve) => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return resolve('blocked');
        ctx = ctx || new AC();
        const go = (buf) => {
          if (my !== token) return resolve('stopped');
          const src = ctx.createBufferSource();
          src.buffer = buf; src.playbackRate.value = rate; src.connect(ctx.destination);
          src.onended = () => resolve('ended');
          ctxSource = src; src.start();
        };
        const decode = (copy) => {
          const pr = ctx.decodeAudioData(copy.buffer ? copy.buffer : copy, go, () => resolve('blocked'));
          if (pr && pr.catch) pr.catch(() => resolve('blocked'));
        };
        if (bytes instanceof Blob) bytes.arrayBuffer().then(decode, () => resolve('blocked'));
        else decode(bytes.slice ? bytes.slice(0) : bytes);
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      } catch { resolve('blocked'); }
    });
  }

  // The browser's own voice, for a sentence that has no recording. Only a voice that lives on the device
  // is used: some desktop browsers offer voices that send the text to a server, and what is spoken here
  // can be a model's reply or the learner's own words. Some browsers fill their list of voices a moment
  // after the page opens; an empty list is therefore waited for once (it is not taken to mean "any voice
  // will do"), and when no on-device voice for the language turns up, nothing is spoken.
  const VOICE_WAIT = 700;
  function voiceList() {
    const now = speechSynthesis.getVoices() || [];
    if (now.length) return Promise.resolve(now);
    return new Promise((resolve) => {
      let done = false;
      const got = () => { if (done) return; done = true; try { speechSynthesis.removeEventListener('voiceschanged', got); } catch { /* ignore */ } resolve(speechSynthesis.getVoices() || []); };
      try { speechSynthesis.addEventListener('voiceschanged', got); } catch { /* older Safari: no such event; the timer below answers */ }
      setTimeout(got, VOICE_WAIT);
    });
  }
  function speak(clip, my) {
    return new Promise((resolve) => {
      if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return resolve('missing');
      const lang = clip.lang === 'fa' ? 'fa-IR' : 'en-US';
      voiceList().then((all) => {
        if (my !== token) return resolve('stopped');
        try {
          const voices = all.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
          const local = voices.find((v) => v.localService && v.lang.replace('_', '-') === lang) || voices.find((v) => v.localService);
          if (!local) return resolve('missing');
          const u = new SpeechSynthesisUtterance(clip.text);
          u.lang = lang; u.voice = local;
          u.rate = (clip.speed === 's' ? 0.7 : 0.95) * getRate();
          u.onend = () => resolve(my === token ? 'ended' : 'stopped');
          u.onerror = () => resolve('missing');
          speechSynthesis.cancel(); speechSynthesis.speak(u);
        } catch { resolve('missing'); }
      }, () => resolve('missing'));
    });
  }

  // Plays one clip. Resolves with 'ended' | 'stopped' | 'interrupted' | 'blocked' | 'missing' | 'offline' | 'unavailable'.
  // A clip is { lang, voice, speed, text } (looked up in the recorded audio) or { blob } (played as it is).
  async function playOne(clip, my) {
    if (clip.blob) return playBytes(clip.blob, 1, my);
    try { await loadIndex(); } catch { return clip.tts === false ? 'offline' : speak(clip, my); }
    if (my !== token) return 'stopped';
    const hit = find(clip);
    if (!hit) return clip.tts === false || clip.lang === 'fa' ? 'missing' : speak(clip, my);
    let buf, bytes;
    // 'unavailable': the pack came, but not as itself (a Wi-Fi login page, a cut-off download) — the learner is told
    // that the sound is not ready yet; 'offline': it could not be fetched at all
    try { buf = await loadPack(hit.ref[0]); } catch (e) { return e && e.damaged ? 'unavailable' : 'offline'; }
    if (my !== token) return 'stopped';
    try { bytes = new Uint8Array(buf, hit.ref[1], hit.ref[2]); } catch { return 'unavailable'; }
    return playBytes(bytes, hit.rate * getRate(), my);
  }

  // clips: one clip or a list. opts.id marks the control that started it; opts.onStep(i) fires before each clip.
  async function play(clips, opts = {}) {
    const list = Array.isArray(clips) ? clips : [clips];
    stop();
    const my = token;
    setCurrent({ id: opts.id ?? null, step: 0 });
    let result = 'ended';
    for (let i = 0; i < list.length; i++) {
      if (my !== token) return 'stopped';
      setCurrent({ id: opts.id ?? null, step: i });
      opts.onStep && opts.onStep(i);
      result = await playOne(list[i], my);
      if (result !== 'ended' && result !== 'missing') break;
      if (i < list.length - 1 && (opts.gap ?? 350) > 0) await new Promise((r) => setTimeout(r, opts.gap ?? 350));
    }
    if (my === token) setCurrent(null);
    return my === token ? result : 'stopped';
  }

  async function warm(packIds) {
    try {
      await loadIndex();
      const ids = new Set(packIds);
      await Promise.all(index.packs.map((p, i) => (ids.has(p.id) ? loadPack(i).catch(() => null) : null)));
    } catch { /* offline: fine */ }
  }

  return {
    play, stop, unlock, warm, keep, loadIndex,
    has: (clip) => !!find(clip),
    onChange: (f) => { listeners.add(f); return () => listeners.delete(f); },
    get current() { return current; },
    get index() { return index; },
    deps: (packId) => (index && index.deps && index.deps[packId]) || [packId],
    packUrl: (id) => { const p = index && index.packs.find((x) => x.id === id); return p ? base + p.file : null; },
  };
}
