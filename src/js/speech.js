// Microphone capture and the pronunciation checker's recogniser.
//
// Privacy: audio is captured only after an explicit tap, kept in memory for the current
// screen (so the learner can hear themselves), and recognised on the device. Nothing is
// uploaded or stored.
//
// The microphone belongs to one "attempt": everything that follows a single tap on a
// microphone button (loading the recogniser, the phone's permission question, recording,
// recognising). cancel() ends the attempt wherever it has got to, so the microphone can
// never open, or stay open, after the learner has moved on.

import { createMoonshine } from './moonshine.js';

const FILES = [
  ['ort.wasm.min.mjs', 0.05], ['ort-wasm-simd-threaded.mjs', 0.02], ['ort-wasm-simd-threaded.wasm', 11.2],
  ['encoder_model.ort', 13.3], ['decoder_model_merged.ort', 30.4], ['tokens.txt', 0.5],
];
export const ASR_MB = Math.round(FILES.reduce((s, f) => s + f[1], 0));
/* global __ASR__ */
// The cache is named after this copy of the site (its path) and after the recogniser files themselves
// (a hash made by the build): two copies on one address never mix, and a changed recogniser is fetched
// afresh instead of the old one being kept for ever. src/sw.js builds the same name.
const CACHE = `hamrah|${typeof document === 'undefined' ? '/' : new URL('./', document.baseURI).pathname}|asr-${typeof __ASR__ === 'string' ? __ASR__ : 'dev'}`;
/* global __ASR_FILES__ */
// name -> [bytes, sha256] of each file (tools/asr-files.json, put in by the build). A download that is not that file —
// a Wi-Fi login page, a cut-off transfer — is never kept: it would stop the checker from starting for good.
const SIZES = typeof __ASR_FILES__ === 'object' && __ASR_FILES__ ? __ASR_FILES__ : {};
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
export async function asrFileOk(f, buf, list = SIZES) {
  const want = Object.prototype.hasOwnProperty.call(list, f) ? list[f] : null;
  if (!want) return true;                                  // a development build without the list
  if (!buf || buf.byteLength !== want[0]) return false;
  try { return !crypto.subtle || hex(await crypto.subtle.digest('SHA-256', buf)) === want[1]; } catch { return true; }
}

// Recording limits, chosen for slow, hesitant speakers: a long pause in the middle of a
// sentence must not end the recording, and nobody is hurried into starting.
export const PAUSE_MS = 2200;    // quiet for this long after speech = finished
export const START_MS = 10000;   // nothing said within this time = "I heard nothing"
export const MAX_MS = 18000;     // longest recording
const CANCELLED = Object.freeze({ cancelled: true, silent: true, why: 'cancel', samples: null });

export function createSpeech({ base = 'asr/', enabled = true } = {}) {
  const hasMic = enabled && typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    && typeof (window.AudioContext || window.webkitAudioContext) === 'function' && typeof WebAssembly === 'object';
  let engine = null, loading = null, state = 'idle';
  let frac = 0;                       // download progress so far, 0..1
  const watchers = new Set();         // progress callbacks of everyone waiting for the download
  let current = null;                 // the attempt in progress, or null
  const open = new Set();             // recordings that hold (or are about to hold) the microphone
  const abs = (f) => new URL(base + f, document.baseURI).href;

  // a stored copy counts only if it has the right size (checked again in full when it is used)
  const sizeOk = (f, res) => { const want = SIZES[f], len = res.headers.get('Content-Length'); return !want || len == null || +len === want[0]; };
  async function isCached() {
    try {
      if (!('caches' in window)) return false;
      const c = await caches.open(CACHE);
      for (const [f] of FILES) { const r = await c.match(abs(f)); if (!r || !sizeOk(f, r)) return false; }
      return true;
    } catch { return false; }
  }
  // forgets every stored file (after the checker failed to start with them, so that the next try downloads afresh)
  async function forgetAll() { try { if ('caches' in window) await caches.delete(CACHE); } catch { /* ignore */ } }

  async function getFile(f, onBytes) {
    const url = abs(f);
    let cache = null;
    try { cache = 'caches' in window ? await caches.open(CACHE) : null; } catch { cache = null; }
    if (cache) {
      const hit = await cache.match(url);
      if (hit) {
        const b = await hit.arrayBuffer();
        if (await asrFileOk(f, b)) { onBytes(b.byteLength); return b; }
        try { await cache.delete(url); } catch { /* ignore */ }         // a damaged copy: fetched again below
      }
    }
    const res = await fetch(url);
    if (!res.ok || res.redirected || /^text\/html/i.test(res.headers.get('Content-Type') || '')) throw new Error(`${f}: ${res.status}`);
    let buf;
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader(); const parts = []; let n = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); n += value.length; onBytes(value.length); }
      const all = new Uint8Array(n); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
      buf = all.buffer;
    } else { buf = await res.arrayBuffer(); onBytes(buf.byteLength); }
    if (!(await asrFileOk(f, buf))) throw new Error(`${f}: not the expected file`);
    if (cache) { try { await cache.put(url, new Response(buf.slice(0), { headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream', 'Content-Length': String(buf.byteLength) } })); } catch { /* storage full: still usable this session */ } }
    return buf;
  }

  // Downloads (once) and starts the recogniser. onProgress(0..1); every caller that is
  // waiting for the same download gets progress. This never opens the microphone.
  function ensure(onProgress) {
    if (engine) return Promise.resolve(engine);
    if (onProgress) { watchers.add(onProgress); onProgress(frac); }
    if (loading) return loading;
    state = 'loading';
    const total = FILES.reduce((s, f) => s + f[1], 0) * 1048576;
    let got = 0;
    const tell = (v) => { frac = v; watchers.forEach((f) => { try { f(v); } catch { /* a screen that has gone */ } }); };
    const tick = (n) => { got += n; tell(Math.min(0.99, got / total)); };
    let haveAll = false;
    loading = (async () => {
      const bufs = {};
      for (const [f] of FILES) bufs[f] = await getFile(f, tick);
      haveAll = true;                                   // from here on, a failure means the stored files do not work together
      const ortUrl = abs('ort.wasm.min.mjs');
      const ort = await import(/* webpackIgnore: true */ ortUrl);
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = abs('');
      engine = await createMoonshine(ort, {
        encoder: new Uint8Array(bufs['encoder_model.ort']), decoder: new Uint8Array(bufs['decoder_model_merged.ort']),
        tokensText: new TextDecoder().decode(bufs['tokens.txt']),
      });
      state = 'ready'; tell(1);
      return engine;
    })().catch(async (e) => { state = 'error'; loading = null; frac = 0; if (haveAll) await forgetAll(); throw e; }).finally(() => watchers.clear());
    return loading;
  }

  // Starts a new attempt (and ends any earlier one). After every `await`, the code that
  // continues must check `attempt.cancelled` before it touches the microphone or uses a result.
  function begin() {
    cancel();
    const attempt = { get cancelled() { return current !== attempt; }, end() { if (current === attempt) current = null; } };
    current = attempt;
    return attempt;
  }

  // Ends the attempt in progress: a recording stops and releases the microphone at once; a
  // pending download or permission question is left to finish, but nothing is done with it.
  function cancel() {
    current = null;
    for (const rec of [...open]) rec.abort();
  }

  // Records until the learner stops talking (or taps stop). Resolves { samples, silent, why }
  // with 16 kHz samples, or { cancelled: true } when the attempt was cancelled at any point.
  // The microphone and the audio graph are always released, whatever happens.
  function listen(attempt, { onLevel = () => {}, onState = () => {}, pauseMs = PAUSE_MS, startMs = START_MS, maxMs = MAX_MS } = {}) {
    let ended = null, finish = null;                 // ended: why the recording is over
    const end = (why) => { if (ended) return; ended = why; if (finish) finish(why); };
    const rec = { stop: () => end('tap'), abort: () => end('cancel') };
    const gone = () => ended != null || attempt.cancelled;
    open.add(rec);
    const done = (async () => {
      let stream = null, ctx = null, nodes = [], watchdog = 0;
      try {
        if (gone()) return CANCELLED;
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (gone()) return CANCELLED;                // the learner left while the phone was asking for permission
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* ignore */ } }
        if (gone()) return CANCELLED;
        const src = ctx.createMediaStreamSource(stream);
        const proc = ctx.createScriptProcessor(4096, 1, 1);
        const mute = ctx.createGain(); mute.gain.value = 0;
        nodes = [src, proc, mute];
        const chunks = []; let n = 0;
        const t0 = performance.now();
        let spoke = false, lastLoud = 0, floor = 0.008;
        const stopped = new Promise((r) => { finish = r; });
        proc.onaudioprocess = (e) => {
          if (ended) return;
          if (attempt.cancelled) { end('cancel'); return; }
          const d = e.inputBuffer.getChannelData(0);
          chunks.push(new Float32Array(d)); n += d.length;
          let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
          const rms = Math.sqrt(s / d.length), now = performance.now() - t0;
          if (!spoke && now < 400) floor = Math.max(floor, Math.min(0.03, rms * 1.5));   // learn the room's noise
          const loud = rms > floor * 2.2;
          if (loud) { lastLoud = now; if (now > 150) spoke = true; }
          onLevel(Math.min(1, rms * 9));
          if (spoke && now - lastLoud > pauseMs) end('pause');
          else if (!spoke && now > startMs) end('silence');
          else if (now > maxMs) end('max');
        };
        // A phone call or the lock screen can take the microphone away, or stop the audio
        // callback arriving at all: never sit there with the microphone open.
        stream.getTracks().forEach((t) => t.addEventListener('ended', () => end('cancel')));
        watchdog = setInterval(() => {
          if (attempt.cancelled) end('cancel');
          else if (performance.now() - t0 > maxMs + 1500) end(spoke ? 'max' : 'silence');
        }, 250);
        src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
        onState('listening');
        const why = await stopped;
        if (why === 'cancel' || attempt.cancelled) return CANCELLED;
        const raw = new Float32Array(n); let o = 0; for (const c of chunks) { raw.set(c, o); o += c.length; }
        return { samples: resample(raw, ctx.sampleRate, 16000), silent: why === 'silence' || !spoke, why, cancelled: false };
      } finally {
        clearInterval(watchdog);
        for (const node of nodes) { if ('onaudioprocess' in node) node.onaudioprocess = null; try { node.disconnect(); } catch { /* ignore */ } }
        if (stream) stream.getTracks().forEach((t) => t.stop());          // the microphone indicator turns off right away
        if (ctx) { try { ctx.close().catch(() => {}); } catch { /* ignore */ } }
        open.delete(rec);
      }
    })();
    return { done, stop: rec.stop };
  }

  // Recognises a whole recording, however long: pauses are shortened first, and what is still
  // longer than the recogniser can take at once is recognised piece by piece.
  async function transcribe(samples) {
    const eng = await ensure();
    const texts = [];
    for (const part of pieces(shortenPauses(samples))) {
      const text = await eng.transcribe(part.slice());
      if (text) texts.push(text);
    }
    return texts.join(' ');
  }

  // Belt and braces: whatever the screens do, locking the phone or switching apps ends the attempt.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
    window.addEventListener('pagehide', cancel);
  }

  return {
    hasMic, ensure, begin, listen, transcribe, isCached, cancel,
    get state() { return state; },
    get ready() { return !!engine; },
    get busy() { return current != null; },      // an attempt is in progress: do not start sound over it
  };
}

// ---- preparing a recording for the recogniser -------------------------------------------------
// The recogniser fails on more than about nine seconds of sound at once, and the recording of a
// slow, hesitant speaker is mostly pauses. So long pauses are shortened first; what is still too
// long is cut at its quietest moments. Samples are 16 kHz.
const RATE = 16000, FRAME = 320;                  // 20 ms
export const PIECE_S = 8.5;                       // the longest piece handed to the recogniser, in seconds

// Keeps the speech and about `keep` seconds of quiet on each side of it; the rest of every pause
// is dropped. It errs on the side of keeping: anything clearly above the room's own noise stays.
export function shortenPauses(samples, keep = 0.3) {
  const n = Math.floor(samples.length / FRAME);
  if (n < 50) return samples;                     // under a second: nothing worth shortening
  const rms = new Float32Array(n);
  for (let f = 0; f < n; f++) { let e = 0; for (let i = f * FRAME, end = i + FRAME; i < end; i++) e += samples[i] * samples[i]; rms[f] = Math.sqrt(e / FRAME); }
  const sorted = Float32Array.from(rms).sort();
  const room = sorted[Math.floor(n * 0.1)], voice = sorted[Math.floor(n * 0.95)];       // the quiet tenth, and the loud end
  const limit = Math.max(0.0015, room * 2, voice * 0.06);
  const pad = Math.round(keep * RATE / FRAME), stay = new Uint8Array(n);
  for (let f = 0; f < n; f++) if (rms[f] > limit) stay.fill(1, Math.max(0, f - pad), Math.min(n, f + pad + 1));
  const kept = stay.reduce((a, b) => a + b, 0);
  if (!kept || kept === n) return samples;        // all quiet or all sound: leave it to the recogniser
  const out = new Float32Array(kept * FRAME);
  let o = 0;
  for (let f = 0; f < n; f++) if (stay[f]) { out.set(samples.subarray(f * FRAME, (f + 1) * FRAME), o); o += FRAME; }
  return out;
}

// Cuts a recording into pieces of at most `max` samples, each cut placed at the quietest fifth of
// a second in the later half of the piece (between words rather than through one).
export function pieces(samples, max = PIECE_S * RATE) {
  const out = [], win = RATE / 5, hop = win / 4;
  let start = 0;
  while (samples.length - start > max) {
    let cut = start + max, quietest = Infinity;
    for (let i = start + Math.floor(max / 2); i + win <= start + max; i += hop) {
      let e = 0;
      for (let j = i; j < i + win; j += 4) e += samples[j] * samples[j];
      if (e < quietest) { quietest = e; cut = i + win / 2; }
    }
    out.push(samples.subarray(start, cut));
    start = cut;
  }
  out.push(samples.subarray(start));
  return out;
}

export function resample(input, from, to) {
  if (from === to) return input;
  const ratio = from / to, n = Math.floor(input.length / ratio), out = new Float32Array(n);
  const win = Math.max(1, Math.floor(ratio));
  for (let i = 0; i < n; i++) {
    const c = i * ratio, a = Math.floor(c);
    if (win > 1) { let s = 0, k = 0; for (let j = a; j < a + win && j < input.length; j++) { s += input[j]; k++; } out[i] = k ? s / k : 0; }
    else { const f = c - a; out[i] = input[a] * (1 - f) + (input[a + 1] ?? input[a]) * f; }
  }
  return out;
}

// The learner's own recording as a WAV file in memory (for "hear my own voice").
export function wavBlob(samples, rate = 16000) {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([buf], { type: 'audio/wav' });
}
