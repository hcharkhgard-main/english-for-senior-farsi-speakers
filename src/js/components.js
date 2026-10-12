// Shared pieces of screen: listen buttons, the phrase card, and the "now you say it" panel.
import { h, icon, btn, en, note, sheet, toast, fnum } from './ui.js';
import { wordsOf, wordsOfHeadword } from './audiokey.js';
import { scoreSpeech, markWords, tipsFor } from './match.js';
import { ASR_MB, wavBlob } from './speech.js';

export const clipEn = (text, voice = 's', speed = 'n') => ({ lang: 'en', voice, speed, text });
export const clipFa = (text) => ({ lang: 'fa', voice: 'f', speed: 'n', text, tts: false });

let seq = 0;
const playId = () => `p${++seq}`;

// Starts playback and explains, in Farsi, when sound could not start.
// opts.quiet marks sound the learner did not ask for (a sentence that plays by itself when a
// screen opens): it never starts over the microphone and never shows an error message.
export async function playNow(app, clips, opts = {}) {
  if (opts.quiet && app.speech.busy) return 'stopped';
  app.speech.cancel();
  const r = await app.audio.play(clips, opts);
  if (opts.quiet) return r;
  if (r === 'blocked') toast(app.t('audio.blocked'));
  else if (r === 'offline') toast(app.t('audio.offline'));
  else if (r === 'missing') toast(app.t('audio.missing'));
  else if (r === 'unavailable') toast(app.t('audio.notReady'));      // the download came back as something else (a Wi-Fi login page): audio.js
  return r;
}

export function listenBtn(app, clips, { label, cls = 'btn-sound', ic = 'play', small = false, block = false, onStep, after, id = playId(), attrs = {} } = {}) {
  const b = btn(label ?? app.t('audio.listen'), {
    cls, icon: ic, small, block, 'data-play': id, ...attrs,
    onclick: async () => {
      if (app.audio.current && app.audio.current.id === id) { app.audio.stop(); return; }
      const r = await playNow(app, clips, { id, onStep });
      after && after(r);
    },
  });
  return b;
}

// word: a word shown under the ▶ («گوش کنید»), where the button must say what it does without an icon to learn
// (the emergency page — QA round 4, accessibility L5); the button's name is then that word.
export function miniPlay(app, clips, label, word) {
  const id = playId();
  return h('button', { type: 'button', class: 'mini-play' + (word ? ' has-word' : ''), 'data-play': id, 'aria-label': word ? null : label || app.t('audio.listen'),
    onclick: (e) => { e.stopPropagation(); if (app.audio.current && app.audio.current.id === id) app.audio.stop(); else playNow(app, clips, { id }); } }, icon('play'), word ? h('span', null, word) : null);
}

// A Farsi "hear this" control; shown only when the Farsi voice is on and the clip exists.
// On a screen drawn before the list of recorded clips has arrived (the first screen after the app
// opens) an empty place is kept, and the button appears there as soon as the list is in.
export function faListen(app, text, label) {
  if (!app.store.state.settings.faVoice) return null;
  const make = () => (app.audio.has(clipFa(text)) ? listenBtn(app, clipFa(text), { label: label || app.t('audio.listenFa'), cls: 'btn-ghost', ic: 'ear', small: true }) : null);
  if (app.audio.index) return make();
  const slot = h('span', { hidden: true });
  app.audio.loadIndex().then(() => { const b = slot.isConnected && make(); if (b) slot.replaceWith(b); }).catch(() => { /* offline and not downloaded: no Farsi sound */ });
  return slot;
}

// What a word button does, said once in Farsi for screen readers (the word itself is read in English).
function wordHint(app) {
  if (!document.getElementById('w-hint')) document.body.append(h('span', { id: 'w-hint', hidden: true, lang: 'fa' }, app.t('audio.word')));
  return 'w-hint';
}

// The tappable words of a sentence — or of a vocabulary headword, which is heard as its own recording
// (the letter "A", "ID", "Monday"), not as a word picked out of a sentence.
const split = (text, headword) => (headword ? wordsOfHeadword(text) : wordsOf(text));

// English sentence whose words can each be tapped and heard alone.
export function wordsLine(app, text, { voice = 's', marks = null, cls = 'en-line', headword = false } = {}) {
  const words = marks || split(text, headword);
  const hint = wordHint(app);
  const line = h('p', { class: `en ${cls}`, lang: 'en', dir: 'ltr' });
  words.forEach((w, i) => {
    if (i) line.append(' ');
    if (!w.word) { line.append(h('span', { class: 'w-plain' }, w.text)); return; }
    // (a word that stands for the learner's own name, address or number is neither "understood" nor "say again")
    const state = marks ? (w.own ? ' is-own' : w.ok ? ' is-ok' : ' is-weak') : '';
    const b = h('button', { type: 'button', class: 'w' + state, 'aria-describedby': hint,
      onclick: async () => {
        b.classList.add('is-on');
        await playNow(app, { lang: 'en', voice: 's', speed: 's', text: w.word });
        b.classList.remove('is-on');
      } }, w.text);
    line.append(b);
  });
  return line;
}

export function favBtn(app, id) {
  const on = !!app.store.state.fav[id];
  return btn(on ? app.t('fav.on') : app.t('fav.off'), { cls: 'btn-ghost', small: true, icon: on ? 'starFill' : 'star', 'aria-pressed': String(on), 'data-fav': '',
    onclick: () => { app.store.update((s) => { if (s.fav[id]) delete s.fav[id]; else s.fav[id] = 1; }); app.render(); } });
}

// The teaching card for one English phrase. A first-time learner sees only: listen, slow, the
// sentence, its meaning (and the pronunciation aid when it is on). Hearing it word by word or
// piece by piece, the pronunciation-aid switch and saving are one clearly labelled tap away;
// the card remembers whether that part is open for as long as the learner stays in this lesson.
//
// The pronunciation aid follows one rule: when the setting is on it is shown on the cards of the first stage, and
// from the second stage it waits behind «نمایش تلفظ تقریبی» so that the eye goes to the English first. Asking for
// it (or hiding it) on one card holds for every card of the lesson the learner is in.
export const showsPh = (app) => app.ui.phShow ?? (app.store.state.settings.ph && (app.stageOf ? app.stageOf() <= 1 : true));
// «Maryam», «25 Oak Street»: the sample words of a sentence that the learner replaces with their own
export const ownWords = (p) => (p && Array.isArray(p.own) && p.own.length ? p.own.join(' ') : '');

export function phraseCard(app, p, { favId, showEn = true, showChunks = true, showNote = true, first = true } = {}) {
  const voice = p.voice || 's';
  const ui = app.ui;
  const moreKey = `more:${p.en}`;
  const showPh = showsPh(app);
  const more = !!ui[moreKey];
  const card = h('section', { class: 'card phrase' });
  card.append(h('div', { class: 'row' },
    listenBtn(app, clipEn(p.say || p.en, voice, 'n'), { label: app.t('audio.listen'), block: false }),
    listenBtn(app, clipEn(p.say || p.en, voice, 's'), { label: app.t('audio.slow'), cls: 'btn-ghost', ic: 'slow' })));
  if (showEn) card.append(more ? wordsLine(app, p.en, { voice }) : en(p.en, 'p', 'en-line'));
  if (showEn && more) card.append(h('p', { class: 'small muted' }, app.t('phrase.tapWord')));
  card.append(h('div', { class: 'row' }, h('p', { class: 'fa-line grow' }, p.fa), faListen(app, p.fa, app.t('audio.fa'))));
  // «تلفظ تقریبی» says what it is on every card; the sentence that explains it is on the first card of each of the
  // learner's first three lessons — after that it is known, and the card is shorter («حالا شما بگویید» stays in sight)
  const explain = first && Object.keys(app.store.state.done || {}).length < 3;
  if (p.ph && showPh) card.append(h('p', { class: 'ph-line' }, h('b', null, app.t('phrase.phLabel') + ' '), p.ph, explain ? [h('br'), h('span', { class: 'small' }, app.t('phrase.phNote'))] : null));
  if (showNote && p.note) card.append(h('p', { class: 'when' }, h('b', null, app.t('phrase.when') + ' '), p.note));
  // the sample name, address or number: say your own (most notes already say so in their own words)
  if (ownWords(p) && !(showNote && /خودتان/.test(p.note || ''))) card.append(h('p', { class: 'when', 'data-own': '' }, h('b', null, app.t('phrase.own', { words: ownWords(p) }))));

  const extras = [];
  if (showChunks && p.chunks && p.chunks.length > 1) {
    extras.push(h('p', { class: 'eyebrow' }, app.t('phrase.chunks')));
    extras.push(h('div', { class: 'chunks' }, p.chunks.map((c) => {
      const b = h('button', { type: 'button', class: 'chunk', lang: 'en',
        onclick: async () => { b.classList.add('is-on'); await playNow(app, clipEn(c, voice, 's')); b.classList.remove('is-on'); } }, c);
      return b;
    })));
  }
  if (p.ph) extras.push(h('button', { type: 'button', class: 'linkish', onclick: () => { ui.phShow = !showPh; app.render(); } }, showPh ? app.t('phrase.phHide') : app.t('phrase.phShow')));
  if (favId) extras.push(h('div', { class: 'row' }, favBtn(app, favId)));
  if (showEn || extras.length) {
    card.append(btn(more ? app.t('phrase.less') : app.t('phrase.more'), { cls: 'btn-ghost', icon: 'pieces', block: true, 'aria-expanded': String(more), 'data-more': '',
      onclick: () => { ui[moreKey] = !more; app.render(); } }));
    if (more) card.append(...extras);
  }
  return card;
}

// ---- the microphone and the learner's recording belong to the panel that is on screen --------
// A tap on a microphone button starts one "attempt" (speech.js). The panel that shows it carries
// a marker, [data-mic]; a recording kept for "my voice" has one on its button, [data-mine].
// After every change to the page we look for them: when a marker is no longer on screen — the
// learner moved on, by whatever route — the microphone is closed and the recording is forgotten.
// So this does not depend on every screen remembering to clean up.
let micSeq = 0, micJob = null, mine = null, watcher = null;

function watchScreen(app) {
  if (watcher || typeof MutationObserver === 'undefined') return;
  watcher = new MutationObserver(() => {
    if (micJob && !micJob.attempt.cancelled && !onPage(micJob)) app.speech.cancel();
    if (mine && !document.querySelector('[data-mine]')) forgetMine(app);
  });
  watcher.observe(document.body, { childList: true, subtree: true });
}
const onPage = (job) => !!document.querySelector(`[data-mic="${job.id}"]`);
// true while the attempt is still wanted: not cancelled, and its panel is still what the learner sees
const wanted = (job) => !job.attempt.cancelled && onPage(job);

function openMic(app) {
  watchScreen(app);
  micJob = { id: `m${++micSeq}`, attempt: app.speech.begin() };
  return micJob;
}
function closeMic(job) {
  job.attempt.end();
  if (micJob === job) micJob = null;
}

// The learner's own last recording: one at a time, kept only while its "my voice" button is on screen.
function keepMine(app, S, samples) {
  forgetMine(app);
  watchScreen(app);
  S.clip = wavBlob(samples);
  mine = S;
}
function forgetMine(app) {
  if (!mine) return;
  mine.clip = null; mine = null;
  if (app.audio.current && app.audio.current.id === 'mine') app.audio.stop();
}

const micError = (err) => {
  const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
  const noDevice = err && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError');
  return denied ? 'denied' : noDevice ? 'nodevice' : (navigator.onLine === false ? 'offline' : 'failed');
};
const showLoad = (S) => (p) => { S.pct = p; const bar = document.querySelector('[data-asr-bar]'); if (bar) bar.style.width = Math.round(p * 100) + '%'; };
const onPhone = async (app) => app.speech.ready || app.speech.isCached();     // is the recogniser already on this phone?
const showLevel = (v) => { const bar = document.querySelector('[data-level]'); if (bar) bar.style.width = Math.round(v * 100) + '%'; };
const STOP_HOLD = 700;     // the second tap of a double tap on the microphone button must not press "finished"
const stopBtn = (app, S) => h('button', { type: 'button', class: 'mic-btn is-live', onclick: () => { if (S.rec && performance.now() - (S.liveAt || 0) > STOP_HOLD) S.rec.stop(); } }, icon('stop'), app.t('say.stop'));
// The words that say what the microphone is doing are marked data-live: the app reads each new one
// out to screen-reader users (main.js), as it does for results and notes.
const status = (text, cls) => h('p', { class: cls, 'data-live': '' }, text);
// A download (and its size) is mentioned only when something is downloaded: on every later day the
// recogniser is read from the phone's own storage, and the learner is told just that it is getting ready.
const loadingBits = (app, pct, onPhone) => [status(onPhone ? app.t('say.preparing') : app.t('say.loading', { mb: fnum(ASR_MB) })), h('div', { class: 'level' }, h('i', { 'data-asr-bar': '', style: `width:${Math.round((pct || 0) * 100)}%` }))];

// ---- "Now you say it": record, check on the device, give gentle feedback ----------------
// state lives in app.ui[key] so it survives re-renders of the screen.
//   own     the sample words of the sentence that the learner replaces with their own name, address, date or
//           number: they are not scored and never listed as words to say again (scoreSpeech in match.js)
//   onCard  the panel sits under the sentence card it belongs to, which already has the listen buttons; the long
//           explanation is then shown only where `first` is true (the first sentence of a lesson)
export function sayPanel(app, { key, target, say, voice = 's', onScore, headword = false, own = null, onCard = false, first = true }) {
  const S = (app.ui[key] ||= { phase: 'idle', result: null, clip: null, level: 0, pct: 0 });
  const box = h('section', { class: 'card', 'data-say': key });
  const set = (patch) => { Object.assign(S, patch); app.render(); };
  const modelClip = clipEn(say || target, voice, 'n');
  // Under a sentence card the panel begins near the bottom of the screen. When "I am listening" or the result
  // takes the place of the button, the page moves (once, without animation) just far enough to show all of it
  // above the bar with «بعدی» — or its top, when it is taller than the screen.
  const reveal = () => {
    const el = onCard ? document.querySelector(`[data-say="${key}"]`) : null;
    if (!el) return;
    const r = el.getBoundingClientRect(), bar = document.querySelector('.bottombar'), top = document.querySelector('.topbar');
    const floor = (bar ? bar.getBoundingClientRect().top : window.innerHeight) - 8, roof = Math.max(0, top ? top.getBoundingClientRect().bottom : 0) + 8;
    if (r.bottom > floor) window.scrollBy(0, Math.min(r.bottom - floor, Math.max(0, r.top - roof)));
  };

  if (!app.speech.hasMic) {
    if (!onCard || first) box.append(h('h2', null, app.t('say.title')));
    box.append(h('p', null, onCard && !first ? app.t('say.aloud') : app.t('say.noMic')));
    if (!onCard) box.append(h('div', { class: 'row' }, listenBtn(app, modelClip, { label: app.t('audio.listen') }), listenBtn(app, clipEn(say || target, voice, 's'), { label: app.t('audio.slow'), cls: 'btn-ghost', ic: 'slow' })));
    box.append(
      btn(S.self ? app.t('say.selfDone') : app.t('say.self'), { cls: S.self ? 'btn-soft' : 'btn-ghost', icon: 'check', block: true, onclick: () => { set({ self: true }); onScore && onScore(null); } }));
    if (app.target === 'artifact' && (!onCard || first)) box.append(h('p', { class: 'small muted' }, app.t('say.noMicPreview')));
    return box;
  }

  const start = async () => {
    if (app.ui[key] !== S) return;                 // the consent sheet was answered after the learner had moved on
    app.audio.stop();
    if (!app.store.state.settings.micOk) { explainMic(app, () => { app.store.update((s) => { s.settings.micOk = true; }); start(); }); return; }
    if (S.opening) return;                         // a second tap while the first is still being answered
    S.opening = true;
    const have = await onPhone(app);
    S.opening = false;
    if (app.ui[key] !== S) return;
    const job = openMic(app);
    const left = () => !wanted(job);               // checked after every wait: has the learner left, stopped or locked the phone?
    try {
      if (mine === S) forgetMine(app);
      set({ phase: app.speech.ready ? 'asking' : 'loading', pct: 0, micId: job.id, onPhone: have });
      if (!app.speech.ready) {
        await app.speech.ensure(showLoad(S));
        if (left()) return;
        set({ phase: 'asking' });
      }
      if (left()) return;
      const rec = app.speech.listen(job.attempt, { onLevel: showLevel, onState: () => { S.liveAt = performance.now(); set({ phase: 'listening' }); reveal(); } });
      S.rec = rec;
      const out = await rec.done;
      S.rec = null;
      if (out.cancelled || left()) return;
      if (out.silent) { set({ phase: 'result', result: { verdict: 'silent', heard: '' } }); reveal(); return; }
      set({ phase: 'checking' });
      await new Promise((r) => setTimeout(r, 30));
      if (left()) return;
      const heard = await app.speech.transcribe(out.samples);
      if (left()) return;                          // what was heard is thrown away
      const result = scoreSpeech(target, heard, { own });
      keepMine(app, S, out.samples);
      set({ phase: 'result', result });
      reveal();
      onScore && onScore(result);
    } catch (err) {
      if (job.attempt.cancelled) return;
      set({ phase: 'error', error: micError(err) });
    } finally {
      const shown = onPage(job);
      closeMic(job);
      if (S.micId === job.id) {
        S.rec = null;
        // cancelled part-way: back to the microphone button, nothing half-finished left on screen
        if (['loading', 'asking', 'listening', 'checking'].includes(S.phase)) { S.phase = 'idle'; if (shown) app.render(); }
      }
    }
  };
  const cancel = () => { app.speech.cancel(); set({ phase: 'idle' }); };

  // Under a sentence card the panel starts as one button, «حالا شما بگویید», so that it is in sight without
  // scrolling; how it works is explained under the button on the first sentence of a lesson (and in the sheet
  // that opens before the microphone is used for the first time).
  const ownHint = own && own.length ? h('p', { class: 'small muted', 'data-own': '' }, app.t('say.own.hint', { words: own.join(' ') })) : null;
  if (!onCard) box.append(h('h2', null, app.t('say.title')));
  if (S.phase !== 'idle' && S.phase !== 'result' && S.phase !== 'error') box.setAttribute('data-mic', S.micId);
  if (S.phase === 'idle' && onCard) {
    box.append(h('button', { type: 'button', class: 'mic-btn', onclick: start }, icon('mic'), app.t('say.title')));
    if (ownHint) box.append(ownHint);
    if (first) box.append(h('p', { class: 'small muted' }, app.t('say.hint')));
  } else if (S.phase === 'idle') {
    box.append(h('p', { class: 'muted' }, app.t('say.hint')));
    if (ownHint) box.append(ownHint);
    box.append(h('button', { type: 'button', class: 'mic-btn', onclick: start }, icon('mic'), app.t('say.start')));
  } else if (S.phase === 'loading') {
    box.append(...loadingBits(app, S.pct, S.onPhone), btn(app.t('mic.no'), { cls: 'btn-ghost', block: true, onclick: cancel }));
  } else if (S.phase === 'asking') {
    box.append(status(app.t('say.asking')));
  } else if (S.phase === 'listening') {
    box.append(status(app.t('say.listening'), 'lead'),
      h('div', { class: 'level' }, h('i', { 'data-level': '' })),
      stopBtn(app, S));
  } else if (S.phase === 'checking') {
    box.append(status(app.t('say.checking'), 'lead'));
  } else if (S.phase === 'error') {
    box.append(note(app.t('say.err.' + S.error), 'care'),
      btn(app.t('say.again'), { cls: 'btn-ghost', icon: 'mic', block: true, onclick: () => set({ phase: 'idle' }) }));
  } else if (S.phase === 'result') {
    box.append(sayResult(app, S, target, voice, headword, own));
    box.append(h('div', { class: 'row' },
      btn(app.t('say.again'), { cls: 'btn-primary grow', icon: 'mic', onclick: start }),
      // the learner's own voice goes through the app's one player: a second tap stops it, another sound replaces it
      S.clip ? listenBtn(app, { blob: S.clip }, { label: app.t('say.mine'), cls: 'btn-ghost grow', ic: 'ear', id: 'mine', attrs: { 'data-mine': '' } }) : null,
      listenBtn(app, modelClip, { label: app.t('say.model'), cls: 'btn-sound grow' })));
  }
  return box;
}

function resultTitle(app, r, weak) {
  if (r.verdict === 'unsure') return app.t('say.unsure.title');
  if (r.verdict !== 'good') return app.t('say.close.title');
  return app.t(weak.length || (r.own && r.own.said === 'none') ? 'say.good.almost' : 'say.good.title');
}

function sayResult(app, S, target, voice, headword, own) {
  const r = S.result, wrap = h('div', { class: 'stack' });
  if (r.verdict === 'silent') { wrap.append(note(app.t('say.silent'), 'care', 'mic')); return wrap; }
  if (r.verdict === 'unsure') {
    wrap.append(h('p', { class: 'result-title' }, icon('info'), app.t('say.unsure.title')), h('p', null, app.t('say.unsure.body')));
    if (r.heard) wrap.append(h('p', { class: 'heard muted' }, app.t('say.heard') + ' ', en(r.heard)));
    return wrap;
  }
  const marks = markWords(split(target, headword), r);
  const weak = marks.filter((m) => m.word && !m.ok);
  wrap.append(h('p', { class: 'result-title' }, icon(r.verdict === 'good' ? 'check' : 'bulb'), resultTitle(app, r, weak)));
  wrap.append(wordsLine(app, target, { voice, marks }));
  if (weak.length) {
    wrap.append(h('p', null, app.t('say.weak')));
    wrap.append(h('div', { class: 'chunks' }, weak.map((m) => {
      const b = h('button', { type: 'button', class: 'chunk', lang: 'en', onclick: async () => { b.classList.add('is-on'); await playNow(app, { lang: 'en', voice: 's', speed: 's', text: m.word }); b.classList.remove('is-on'); } }, m.word);
      return b;
    })));
    for (const tip of tipsFor(weak.map((m) => m.word.toLowerCase()), app.content.soundTips, 2)) wrap.append(note(h('span', null, h('b', null, tip.title + ': '), tip.fa), 'info', 'bulb'));
  } else if (r.verdict === 'good') {
    wrap.append(h('p', null, app.t('say.good.body')));
  }
  // the sentence has a place for the learner's own name, address, date or number: say what was heard there
  if (r.own) {
    const words = (own || []).join(' ');
    if (r.own.said === 'own') wrap.append(note(app.t('say.own.heard', { words }), 'good', 'check'));
    else if (r.own.said === 'sample') wrap.append(note(app.t('say.own.sample', { words }), 'info', 'bulb'));
    else wrap.append(note(app.t('say.own.none', { words }), 'care', 'bulb'));
  }
  wrap.append(h('p', { class: 'heard muted' }, app.t('say.heard') + ' ', en(r.heard)));
  return wrap;
}

// Explains the microphone before the phone asks for permission. onAnswer(true | false) is called
// when the learner chooses; closing the sheet any other way counts as "not now".
function askMic(app, onAnswer) {
  let answered = false;
  const answer = (ok) => { if (answered) return; answered = true; onAnswer(ok); };
  app.speech.isCached().then((cached) => {
    sheet(app.t('mic.title'), h('div', { class: 'stack' },
      h('p', null, app.t('mic.what')),
      note(app.t('mic.privacy'), 'good', 'lock'),
      cached || app.speech.ready ? null : note(app.t('mic.download', { mb: fnum(ASR_MB) }), 'care', 'download'),
      h('p', { class: 'small muted' }, app.t('mic.honest'))),
    [{ label: app.t('mic.yes'), cls: 'btn-primary', icon: 'mic', run: () => answer(true) }, { label: app.t('mic.no'), run: () => answer(false) }]);
  });
}
export function explainMic(app, onYes) {
  askMic(app, (ok) => { if (ok) onYes(); });
}

// One recording → text, for free answers in conversations. S is a small state object the caller renders from.
// Resolves { text, silent }, or null when there is nothing to use: the learner declined, something
// failed (S.micError says what), or the attempt was cancelled — they left the conversation, tapped
// "not now", played something else or locked the phone. After null the caller must do nothing with
// the turn: in particular, nothing is sent to the AI partner.
export async function hearOnce(app, S) {
  const set = (patch) => { Object.assign(S, patch); app.render(); };
  const here = () => Object.values(app.ui).includes(S);          // the conversation that asked is still the one on screen
  app.audio.stop();
  if (!app.store.state.settings.micOk) {
    const ok = await new Promise((res) => askMic(app, res));
    if (!ok || !here()) return null;
    app.store.update((s) => { s.settings.micOk = true; });
  }
  if (!here() || S.opening) return null;          // (a second tap while the first is still being answered)
  S.opening = true;
  const have = await onPhone(app);
  S.opening = false;
  if (!here()) return null;
  const job = openMic(app);
  const left = () => !wanted(job);               // checked after every wait
  try {
    set({ mic: app.speech.ready ? 'asking' : 'loading', pct: 0, micError: null, micId: job.id, onPhone: have });
    if (!app.speech.ready) {
      await app.speech.ensure(showLoad(S));
      if (left()) return null;
      set({ mic: 'asking' });
    }
    if (left()) return null;
    const rec = app.speech.listen(job.attempt, { onLevel: showLevel, onState: () => { S.liveAt = performance.now(); set({ mic: 'listening' }); } });
    S.rec = rec;
    const out = await rec.done;
    S.rec = null;
    if (out.cancelled || left()) return null;
    if (out.silent) return { text: '', silent: true };
    set({ mic: 'checking' });
    await new Promise((r) => setTimeout(r, 30));
    if (left()) return null;
    const text = await app.speech.transcribe(out.samples);
    if (left()) return null;                     // the learner has gone: what was heard is thrown away, never shown or sent
    return { text, silent: false };
  } catch (err) {
    if (!job.attempt.cancelled) S.micError = micError(err);
    return null;
  } finally {
    const shown = onPage(job);
    closeMic(job);
    if (S.micId === job.id) { S.rec = null; S.mic = 'idle'; if (shown) app.render(); }
  }
}

// The live microphone strip shown while hearOnce is running.
export function micStrip(app, S) {
  const card = (...kids) => h('div', { class: 'card', 'data-mic': S.micId }, ...kids);
  if (S.mic === 'loading') return card(...loadingBits(app, S.pct, S.onPhone), btn(app.t('mic.no'), { cls: 'btn-ghost', block: true, onclick: () => { app.speech.cancel(); S.mic = 'idle'; app.render(); } }));
  if (S.mic === 'asking') return card(status(app.t('say.asking')));
  if (S.mic === 'listening') return card(status(app.t('say.listeningFree'), 'lead'), h('div', { class: 'level' }, h('i', { 'data-level': '' })), stopBtn(app, S));
  if (S.mic === 'checking') return card(status(app.t('say.checking'), 'lead'));
  return null;
}
