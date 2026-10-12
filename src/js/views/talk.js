// Conversation practice: a patient partner in a simulated everyday situation.
import { h, icon, btn, en, note, fnum, sheet, announce } from '../ui.js';
import { hasArabic } from '../bidi.js';
import { clipEn, listenBtn, miniPlay, playNow, hearOnce, micStrip } from '../components.js';
import { pickReply, correct, repairKind } from '../match.js';
import { AI_MAX_TURNS } from '../ai-prompt.js';
import { shuffle, mix, micOn, later, pathLesson } from '../learn.js';
import { ownReplies } from '../own.js';
import { me } from '../me.js';
import { quiz } from './lesson.js';

// A question about what the partner has just said ("check" on a turn, "thenCheck" on a reply, in
// content/roleplays*.json): one right answer and one to three wrong ones, with an optional question of its own
// (the default is «چه گفت؟»). Anything incomplete counts as no question.
export function checkOf(c) {
  if (!c || typeof c.right !== 'string' || !c.right.trim() || !Array.isArray(c.wrong)) return null;
  const wrong = c.wrong.filter((x, i) => typeof x === 'string' && x.trim() && x !== c.right && c.wrong.indexOf(x) === i);
  return wrong.length ? { q: typeof c.q === 'string' ? c.q.trim() : '', right: c.right, wrong } : null;
}
// After this many wrong taps the line is simply shown, with its meaning, and the conversation goes on.
export const CHECK_TRIES = 2;

export function talkView(app) {
  const { t, content, store } = app;
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('talk.list.title')), h('p', { class: 'muted' }, t('talk.list.sub')));
  main.append(h('button', { type: 'button', class: 'item', onclick: () => app.go('build') }, h('span', { class: 'pic', style: 'width:3.25rem;height:3.25rem' }, icon('pieces')),
    h('span', { class: 'body' }, h('span', { class: 't' }, t('build.title')), h('span', { class: 's' }, t('build.sub')))));
  // Only the conversations of the stage the learner is in are listed at first (about fifty in all would be a very long
  // page); the other stages are one tap away. When the path is finished, every stage is shown.
  const next = pathLesson(store.state, content);
  const here = next ? app.lessonStage(next) : 0;
  const stages = content.stages.filter((stage) => content.roleplays.some((r) => (r.stage || 1) === stage.id));
  const all = !stages.some((x) => x.id === here) || app.ui.allStages;
  for (const stage of stages) {
    const list = content.roleplays.filter((r) => (r.stage || 1) === stage.id);
    if (!all && stage.id !== here) continue;
    main.append(h('h2', { class: 'section-title' }, stage.title));
    for (const r of list) {
      const sc = app.scenario(r.scenario);
      main.append(h('button', { type: 'button', class: 'item', onclick: () => app.go('rp.' + r.id) },
        h('span', { class: 'pic', style: 'width:3.25rem;height:3.25rem' }, icon(r.phone ? 'phone' : (sc ? sc.icon : 'chat'))),
        h('span', { class: 'body' }, h('span', { class: 't' }, r.title), h('span', { class: 's' }, r.goal)),
        store.state.rp[r.id] ? h('span', { class: 'badge' }, icon('check'), t('place.done')) : null));
    }
  }
  if (!all) main.append(btn(t('talk.others'), { cls: 'btn-soft', icon: 'chat', block: true, 'data-others': '', onclick: () => { app.ui.allStages = true; app.render(); } }));
  return { main };
}

export function roleplayView(app, id) {
  const { t, content, store, audio } = app;
  const R = content.roleplays.find((r) => r.id === id);
  if (!R) return { main: h('main', { class: 'wrap' }, h('h1', null, t('err.title'))) };
  const times = store.state.rp[id] || 0;
  // The first time through, the partner's words can be read as they are heard. Once the learner has finished this
  // conversation, they are heard first — like a phone call — and each line has its own «نمایش متن» button.
  const S = (app.ui.rp ||= { started: false, turn: 0, log: [], queue: [], fresh: -1, done: false, showFa: (R.stage || 1) === 1, help: times < 2, showText: !R.phone && times < 1, mode: 'script', mic: 'idle', ai: { sugg: [], busy: false, error: null, n: 0 }, aiOk: false, seed: Math.random(), lock: 0 });
  const personal = R.turns.some((turn) => turn.open);      // the partner asks for a name, an address, a number …
  const voice = R.them.voice;
  const sc = app.scenario(R.scenario);
  const rerender = () => app.render();
  // the one request that is offered at every turn of every conversation: "Could you repeat that, please?"
  const ask = (content.ui.fixed && content.ui.fixed.repeat && content.ui.fixed.repeat.en) ? content.ui.fixed.repeat : null;

  if (!S.probed) { S.probed = true; app.partner.probe().then((ok) => { S.aiOk = ok && app.partner.allows(R) && !R.safetyCritical && !personal; if (S.aiOk) app.render(); }); audio.loadIndex().then(() => audio.warm(audio.deps('r-' + id))).catch(() => {}); }

  // a line of the partner; `check` is the question the learner is asked about it before the conversation goes on
  const themLine = (line, check = null) => ({ who: 'them', en: line.en, fa: line.fa, check: checkOf(check) });
  // the line the learner is being asked about now, if any («چه گفت؟»)
  const waiting = () => (S.mode === 'script' && !S.done && S.log.find((m) => m.who === 'them' && m.check && !m.asked)) || null;
  const speakThem = (lines, first, wait = 150) => {
    const clips = [...(first ? [].concat(first) : []), ...lines.map((l) => clipEn(l.en, voice, 'n'))];
    if (clips.length) later(app, wait, () => { if (app.ui.rp === S) playNow(app, clips, { quiet: true, gap: 500 }); });   // not if the learner has left or started again
  };
  // After something new has been said, the page moves so that the new part starts just under the top bar — or
  // to the end of the page when everything from there on fits on the screen. So the partner's line and the first
  // answers are what the learner sees; nothing that was added below can push them out of sight.
  const settle = () => later(app, 60, () => {
    if (app.ui.rp !== S) return;
    const mark = document.querySelector('#app main [data-new]'), bar = document.querySelector('.topbar');
    const end = document.documentElement.scrollHeight - window.innerHeight;
    const y = mark ? window.scrollY + mark.getBoundingClientRect().top - (bar ? bar.getBoundingClientRect().bottom : 0) - 8 : end;
    window.scrollTo({ top: Math.max(0, Math.min(end, y)), behavior: 'auto' });
  });

  const begin = (mode) => {
    const first = themLine(R.turns[0].them, mode === 'script' ? R.turns[0].check : null);
    Object.assign(S, { started: true, mode, turn: 0, done: false, log: [first], queue: [], fresh: 0, note: null, unsure: null, again: null, seed: Math.random() });
    if (mode === 'ai') S.ai = { sugg: R.turns[0].replies.map((r) => ({ en: r.en, fa: r.fa })), busy: false, error: null, n: 0 };
    app.render(true);
    speakThem([first]);
  };

  const finish = () => { S.done = true; store.update((s) => { s.rp[id] = (s.rp[id] || 0) + 1; }); };

  // What the partner says next waits in S.queue. A line that the learner is asked about holds the rest back
  // until it has been answered: one thing to listen to at a time. The conversation is over when nothing is
  // left to say, nothing is left to ask and the last turn has been answered.
  const advance = (first = null, wait = 150) => {
    const say = [], at = S.log.length;
    while (S.queue.length) { const l = S.queue.shift(); S.log.push(l); say.push(l); if (l.check) break; }
    if (say.length) S.fresh = at;
    if (!S.queue.length && !waiting() && S.turn >= R.turns.length && !S.done) finish();
    app.render();
    speakThem(say, first, wait);
    settle();
  };

  // "I don't understand", "Again, please", "Please speak slowly" … are never an answer. The partner says
  // the same thing once more — slowly, unless only "again" was asked — and the turn stays where it is.
  // What is said again is everything since the learner last spoke: one line, or an answer and the next question.
  // `first` is the learner's own request, played before the partner's line when it was tapped rather than spoken.
  const sayAgain = (heard, pick, first = null) => {
    const lines = [];
    for (let i = S.log.length - 1; i >= 0 && S.log[i].who === 'them'; i--) lines.unshift(S.log[i]);
    S.unsure = null; S.note = null;
    S.again = { kind: pick.repair || 'again', heard, slow: !!pick.slow, fix: heard ? correct(heard, content.corrections) : null };
    app.render();
    later(app, 150, async () => {
      if (app.ui.rp !== S) return;
      // The request is heard first, in the learner's voice. Whatever becomes of that clip (not downloaded yet,
      // no sound allowed), the partner's line still follows — unless the learner has started something else meanwhile.
      if (first) {
        const r = await playNow(app, first, { quiet: true });
        if (r === 'stopped' || r === 'interrupted') return;
        await new Promise((go) => setTimeout(go, 400));
        if (app.ui.rp !== S || app.audio.current || app.speech.busy) return;
      }
      playNow(app, lines.map((l) => clipEn(l.en, voice, pick.slow ? 's' : 'n')), { quiet: true, gap: 500 });
    });
    settle();
  };
  // The fixed button under the answers: the first tap has the line said again, a second tap on the same line has it said slowly.
  const tapAgain = () => {
    const n = S.againAt === S.log.length ? (S.againN || 0) + 1 : 1;
    S.againAt = S.log.length; S.againN = n;
    S.lock = performance.now() + 500;
    sayAgain(null, { repair: 'again', slow: n > 1 }, clipEn(ask.en, 's', 'n'));
  };

  // the learner's answer as it is heard: the learner's own details from single recordings where they can say it
  const replyClip = (r) => (r.pieces ? r.pieces.map((x) => clipEn(x, 's', 'n')) : clipEn(r.en, 's', 'n'));
  // scripted partner: the learner's choice (tapped or spoken) moves the scene on
  const choose = (reply, { heard = null, own = false } = {}) => {
    const turn = R.turns[S.turn];
    S.unsure = null; S.again = null;
    S.lock = performance.now() + 500;      // a double tap must not also answer the next question
    S.log.push({ who: 'you', en: own ? heard : reply.en, fa: own ? '' : reply.fa, heard: !own && heard ? heard : null });
    const fix = heard ? correct(heard, content.corrections) : null;
    S.note = fix ? { kind: 'fix', en: fix.fixed, fa: fix.why } : null;
    S.turn += 1;
    S.queue = [];
    if (reply && reply.then) S.queue.push(themLine(reply.then, reply.thenCheck));
    if (S.turn < R.turns.length) S.queue.push(themLine(R.turns[S.turn].them, R.turns[S.turn].check));
    advance(heard ? null : replyClip(reply));
    return turn;
  };

  // The learner has answered the question about a line («چه گفت؟») — or, after two other tries, has been shown
  // the line and its meaning. Either way the conversation goes on; nothing is counted.
  const checked = (m, how) => {
    m.asked = how;
    if (how === 'shown') m.shown = true;
    S.lock = performance.now() + 600;      // the answers that now appear must not catch the second tap of a double tap
    advance(null, how === 'right' ? 700 : 150);
  };

  const speakScripted = async () => {
    const out = await hearOnce(app, S);
    if (!out || app.ui.rp !== S) return;          // nothing heard, or the learner has left or started again meanwhile
    const turn = R.turns[S.turn];
    if (out.silent) { S.again = null; S.unsure = { silent: true }; app.render(); return; }
    const pick = pickReply(turn.replies, out.text, turn.open, turn.them.en);
    if (pick.verdict === 'match') choose(turn.replies[pick.index], { heard: out.text });
    else if (pick.verdict === 'repeat') sayAgain(out.text, pick);
    else if (pick.verdict === 'own') choose(null, { heard: out.text, own: true });
    else { const fix = correct(out.text, content.corrections); S.again = null; S.unsure = { heard: out.text, fix }; app.render(); }
  };

  // live AI partner
  const sendAi = async (text, tapped = false) => {
    if (!text || S.ai.busy) return;
    if (S.ai.n >= AI_MAX_TURNS) { finish(); app.render(); return; }       // the last answer came while another screen was open
    // A request to hear it again is answered here, at once: the line is said again, nothing is sent and no turn is
    // used up. If the learner asks a second time about the same line, it goes to the partner, who can put it another way.
    const rep = repairKind(text);
    if (rep && S.ai.againAt !== S.log.length) { S.ai.againAt = S.log.length; S.ai.error = null; sayAgain(tapped ? null : text, { repair: rep.kind, slow: rep.slow }, tapped ? clipEn(text, 's', 'n') : null); return; }
    S.again = null;
    S.log.push({ who: 'you', en: text, fa: '' });
    S.ai.busy = true; S.ai.error = null; S.note = null; S.ai.n += 1;
    app.render();
    try {
      const out = await app.partner.next({ R, history: S.log.slice(0, -1), said: text });
      // The answer may arrive while another screen (the emergency phrases) is open on top, or after the learner has
      // left for good: the conversation's own state is brought up to date, but nothing is drawn or spoken elsewhere.
      const here = app.ui.rp === S;
      S.ai.busy = false;
      if (out.correction_en) S.note = { kind: 'fix', en: out.correction_en, fa: out.correction_fa || '' };
      S.fresh = S.log.length;
      S.log.push({ who: 'them', en: out.reply_en, fa: out.reply_fa, live: true });
      S.ai.sugg = out.suggestions;
      if (!here) return;
      if (out.done || S.ai.n >= AI_MAX_TURNS) finish();
      app.render();
      speakThem([{ en: out.reply_en }]);
      settle();
    } catch (err) {
      S.ai.busy = false; S.ai.error = err && err.code === 'rate' ? 'rate' : (navigator.onLine === false ? 'offline' : 'failed');
      S.log.pop(); S.ai.n -= 1;
      if (app.ui.rp === S) app.render();
    }
  };
  // what was heard is sent only if the learner is still in this conversation when the recording ends
  const speakAi = async () => { const out = await hearOnce(app, S); if (!out || app.ui.rp !== S) return; if (out.silent || !out.text) { S.again = null; S.unsure = { silent: true }; app.render(); return; } S.unsure = null; sendAi(out.text); };

  const main = h('main', { class: 'wrap' });

  // ---- before starting ---------------------------------------------------------------
  if (!S.started) {
    main.append(h('section', { class: 'card' },
      h('div', { class: 'row' }, h('span', { class: 'pic' }, icon(R.phone ? 'phone' : (sc ? sc.icon : 'chat'))), h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, t('rp.eyebrow')), h('h1', { style: 'font-size:1.5rem' }, R.title))),
      h('p', { class: 'lead' }, R.setting), h('p', null, h('b', null, t('rp.goal') + ' '), R.goal),
      h('p', { class: 'muted' }, t('rp.partner', { role: R.them.role }))));
    if (R.note) main.append(note(R.note, R.safetyCritical ? 'danger' : 'care', R.safetyCritical ? 'sos' : 'info'));
    if (R.phone) main.append(note(t('rp.phone'), 'info', 'phone'));
    else if (!S.showText) main.append(note(t('rp.listenFirst'), 'info', 'ear'));
    if (personal) main.append(note(t('rp.madeUp'), 'info', 'lock'));
    main.append(btn(t('rp.start'), { cls: 'btn-primary', icon: 'chat', block: true, onclick: () => begin('script') }));
    // The live partner is offered only where it is allowed (see aiOk above) and only once the learner has switched
    // it on in the settings, where what is sent is explained. It is off until then.
    if (S.aiOk && store.state.settings.ai) {
      main.append(h('section', { class: 'card' }, h('h2', null, t('ai.title')), h('p', null, t('ai.what')), note(t('ai.consent.private'), 'care', 'lock'),
        btn(t('ai.start'), { cls: 'btn-soft', icon: 'wave', block: true, onclick: () => begin('ai') })));
    }
    return { main };
  }

  // ---- the conversation ----------------------------------------------------------------
  // Leaving in the middle would throw the conversation away, so the top bar's Back and Home ask first (see topbar in main.js).
  const exit = !S.done && (S.turn > 0 || S.ai.n > 0) ? { confirm: { title: t('rp.leave.title'), body: t('rp.leave.body'), yes: t('rp.leave.go'), no: t('rp.leave.stay') } } : null;
  const restartNow = () => { app.ui.rp = null; audio.stop(); app.speech.cancel(); app.render(true); };
  // like the top bar's Back and Home: once something has been said, starting again asks first (the safe answer first)
  const restart = () => {
    if (S.done || (S.turn === 0 && S.ai.n === 0)) { restartNow(); return; }
    sheet(t('rp.restart.title'), h('p', null, t('rp.restart.body')), [{ label: t('rp.restart.yes'), cls: 'btn-danger', run: restartNow }, { label: t('rp.leave.stay'), cls: 'btn-primary' }]);
  };
  // In a practice call that could be taken for the real thing (911, a caller who wants money or details, paying by
  // phone) the words "this is only practice, no real call is made" stay in the top bar from the first line to the
  // last (main.js puts `banner` there). A conversation can name its own line to keep in sight ("banner" in the
  // content file: the sample medicine instructions). The other safety-critical conversations open with a note
  // that this is language practice, not advice.
  const keep = R.banner || (R.safetyCritical && (R.phone || R.scenario === 'emergency') ? t('rp.practiceOnly') : '');
  const banner = keep ? h('div', { class: 'tb-banner' }, icon('sos'), h('span', null, keep)) : null;
  // an answer that is a number, a time or a price is written from left to right, like English
  const answerText = (text) => (hasArabic(text) ? text : en(text));

  main.append(h('h1', { class: 'sr' }, R.title));
  if (R.safetyCritical && !banner) main.append(note(t('rp.practiceTalk'), 'danger', 'sos'));
  const lastThem = [...S.log].reverse().find((m) => m.who === 'them');
  const asked = waiting();
  main.append(h('div', { class: 'chat', 'aria-live': 'polite' }, S.log.map((m, i) => {
    const them = m.who === 'them';
    const isLast = m === lastThem && !S.done;
    const held = m === asked;        // the learner is being asked what this line said: no text yet, and its buttons are in the question below
    // heard but not yet read; when the conversation is over everything can be read
    const masked = them && !S.done && !m.shown && (held || !S.showText);
    const withFa = !masked && m.fa && (S.showFa || S.done || !them || m.asked === 'shown');
    return h('div', { class: `bubble ${m.who}`, 'data-new': i === S.fresh && !S.again && !S.done ? '' : null },
      h('span', { class: 'who' }, them ? R.them.role : t('talk.you')),
      masked ? h('p', { class: 'phone-mask' }, R.phone ? t('rp.audioOnly') : t('rp.listenOnly')) : en(m.en, 'p'),
      withFa ? h('p', { class: 'fa-line' }, m.fa) : null,
      // what the learner understood stays with the line (the meaning is not repeated when it is already shown above)
      m.asked === 'right' ? h('p', { class: 'caught' }, icon('check'), m.check.q || !withFa ? h('span', null, t('rp.check.rightIs') + ' ', answerText(m.check.right)) : h('span', null, t('rp.check.right'))) : null,
      m.heard ? h('p', { class: 'fa-line' }, t('say.heard') + ' ', en(m.heard)) : null,
      // every line that is still hidden keeps its own controls, not only the newest one
      them && !held && (isLast || masked || S.done) ? h('div', { class: 'tools is-tight' },
        listenBtn(app, clipEn(m.en, voice, 'n'), { label: t('audio.again'), small: true }),
        S.done ? null : listenBtn(app, clipEn(m.en, voice, 's'), { label: t('audio.slow'), cls: 'btn-ghost', ic: 'slow', small: true }),
        S.done ? null : masked ? btn(t('rp.showText'), { cls: 'btn-ghost', icon: 'eye', small: true, onclick: () => { m.shown = true; rerender(); } })
          : isLast ? btn(S.showFa ? t('talk.hideFa') : t('talk.showFa'), { cls: 'btn-ghost', icon: 'eye', small: true, onclick: () => { S.showFa = !S.showFa; rerender(); } }) : null) : null);
  })));

  if (S.note && S.note.kind === 'fix') {
    main.append(note(h('div', { class: 'stack' }, h('b', null, t('fix.title')), h('div', { class: 'opt-wrap' }, miniPlay(app, clipEn(S.note.en, 's', 'n')), en(S.note.en, 'p', 'en-line grow')), S.note.fa ? h('span', null, S.note.fa) : null), 'info', 'bulb'));
  }

  if (S.done) {
    main.append(h('section', { class: 'card center' }, h('span', { class: 'big-check' }, icon('check')), h('h2', null, t('rp.done')), h('p', { class: 'lead' }, R.praise || t('rp.praise'))));
    main.append(h('div', { class: 'stack' },
      btn(t('rp.again'), { cls: 'btn-primary', icon: 'repeat', block: true, onclick: () => { app.ui.rp = null; app.render(true); } }),
      btn(t('rp.more'), { cls: 'btn-ghost', icon: 'chat', block: true, onclick: () => app.go('talk', { replace: true }) }),
      btn(t('nav.home'), { cls: 'btn-ghost', icon: 'home', block: true, onclick: app.home })));
    return { main, banner };
  }

  const strip = micStrip(app, S);
  if (strip) { main.append(strip); return { main, exit, banner }; }

  // ---- «چه گفت؟» — the learner's own moment of "did I catch that?" before answering -------------
  // Asked about a line that carries something to act on (a number, a time, a refusal …). The line can be heard
  // again as often as wanted, at both speeds; a wrong tap only sets that choice aside; after two of them the
  // line is shown with its meaning. The answers to the partner appear when this is settled, so they cannot give it away.
  if (asked) {
    const c = asked.check;
    const hear = () => h('div', { class: 'tools is-tight' }, listenBtn(app, clipEn(asked.en, voice, 'n'), { label: t('audio.again'), small: true }), listenBtn(app, clipEn(asked.en, voice, 's'), { label: t('audio.slow'), cls: 'btn-ghost', ic: 'slow', small: true }));
    if (asked.reveal) {
      main.append(h('section', { class: 'card', 'data-check': 'shown' }, h('h2', null, t('rp.check.shown')),
        en(asked.en, 'p', 'en-line'), h('p', { class: 'fa-line' }, asked.fa),
        c.q && /[0-9۰-۹]/.test(c.right) ? h('p', null, h('b', null, c.q + ' '), answerText(c.right)) : null,      // a number is also shown the way it is written
        hear(),
        btn(t('rp.check.go'), { cls: 'btn-primary', block: true, 'data-go': '', onclick: () => { if (performance.now() >= S.lock) checked(asked, 'shown'); } })));
    } else {
      const state = (asked.quiz ||= { tried: {}, solved: null });
      app.ui.rpq = state;        // the question keeps its tries with its line, not with the screen
      const options = shuffle([{ id: 'r', right: true, text: c.right }, ...c.wrong.map((x, k) => ({ id: 'w' + k, right: false, text: x }))], mix(S.seed, 50 + S.log.indexOf(asked)))
        .map((o) => ({ ...o, label: h('span', null, answerText(o.text)) }));
      main.append(h('section', { class: 'card', 'data-check': '' }, h('p', { class: 'eyebrow' }, t('rp.check.eyebrow')), h('h2', { tabindex: '-1', 'data-check-q': '' }, c.q || t('rp.check.q')), hear()));
      const choices = quiz(app, 'rpq', options, { missNote: t('listen.again'),
        onMiss: () => { if (Object.keys(state.tried).length >= Math.min(CHECK_TRIES, c.wrong.length)) { asked.reveal = true; S.lock = performance.now() + 600; } },
        onSolved: () => checked(asked, 'right') });
      // the second tap of a double tap on an answer must not land on one of these choices
      choices.addEventListener('click', (e) => { if (performance.now() < S.lock) { e.stopPropagation(); e.preventDefault(); } }, true);
      main.append(choices);
    }
    // («شروع دوباره» is not offered here: under the three answers it looked like a fourth one. It is back with the replies.)
    // A screen reader is taken to the question itself when it takes the place of the replies (or of the line before it),
    // so that the question is heard before any answer; a redraw of the same question keeps focus where it was.
    const after = () => {
      if (S.focusQ === asked) return;
      S.focusQ = asked;
      const q = document.querySelector('#app [data-check-q]');
      const a = document.activeElement;
      if (q && (!a || a === document.body || q.closest('main').contains(a))) { try { q.focus({ preventScroll: true }); } catch { /* ignore */ } }
      if (!q || document.activeElement !== q) announce(`${t('rp.check.eyebrow')} ${q ? q.textContent : ''}`);      // focus elsewhere (the top bar): say it instead
    };
    return { main, exit, banner, after };
  }

  if (S.micError) main.append(note(t('say.err.' + S.micError), 'care'));
  if (S.unsure) {
    main.append(S.unsure.silent ? note(t('say.silent'), 'care', 'mic')
      : note(h('div', { class: 'stack' }, h('b', null, t('say.unsure.title')), h('span', null, t('rp.unsure')), h('span', null, t('say.heard') + ' ', en(S.unsure.heard)),
        S.unsure.fix ? h('span', null, h('b', null, t('fix.title') + ' '), en(S.unsure.fix.fixed), ' — ', S.unsure.fix.fa || S.unsure.fix.why) : null), 'care', 'info'));
  }

  if (S.again) {
    // asked by voice: what the phone heard is shown; asked with the button: only what happens next
    const kind = S.again.heard ? S.again.kind : S.again.slow ? 'tapSlow' : 'again';
    const box = note(h('div', { class: 'stack' }, h('b', null, t('rp.repeat.' + kind)), S.again.heard ? h('span', null, t('say.heard') + ' ', en(S.again.heard)) : null,
      S.again.fix ? h('span', null, h('b', null, t('fix.title') + ' '), en(S.again.fix.fixed), ' — ', S.again.fix.why) : null), 'info', S.again.slow ? 'slow' : 'repeat');
    box.setAttribute('data-new', '');
    main.append(box);
  }

  main.append(h('h2', { class: 'section-title' }, t('rp.yourTurn')));
  // "Could you repeat that, please?" — always there, always the same, under the answers of every turn
  const againBtn = (run) => h('button', { type: 'button', class: 'again-btn', 'data-again': '', onclick: () => { if (performance.now() >= S.lock) run(); } },
    icon('ear'), h('span', { class: 'body' }, en(ask.en), h('span', { class: 'sub' }, ask.fa)));

  if (S.mode === 'script') {
    const turn = R.turns[S.turn];
    // the replies are offered in a different order every time, so the place on the screen is never the clue — except
    // that, when «اطلاعات من» has the detail a turn asks for, the learner's own answer comes first (own.js ownReplies)
    const replies = turn.open ? ownReplies(turn.replies, me, { month: (m) => t('month.' + m) }) : turn.replies;
    const mixed = shuffle(replies, mix(S.seed, S.turn));
    if (turn.open) main.append(h('p', { class: 'muted small' }, replies.some((r) => r.mine) ? t('rp.open.mine') : t('rp.open')));
    main.append(h('div', { class: 'stack replies' }, [...mixed.filter((r) => r.mine), ...mixed.filter((r) => !r.mine)].map((r) => h('div', { class: 'opt-wrap' }, miniPlay(app, replyClip(r), t('audio.listen')),
      h('button', { type: 'button', class: 'opt', 'data-mine': r.mine ? '' : null, onclick: () => { if (performance.now() >= S.lock) choose(r); } }, h('span', { class: 'body' }, r.mine ? h('span', { class: 'eyebrow' }, t('own.title')) : null, en(r.en), S.help || r.mine ? h('span', { class: 'sub' }, r.fa) : null))))));
    if (ask) main.append(againBtn(tapAgain));
    if (micOn(app)) main.append(h('div', { class: 'row' }, h('button', { type: 'button', class: 'mic-btn', onclick: speakScripted }, icon('mic'), t('rp.speak'))));
    main.append(h('div', { class: 'row' },
      btn(S.help ? t('rp.hideHelp') : t('rp.showHelp'), { cls: 'btn-ghost grow', icon: 'eye', small: true, onclick: () => { S.help = !S.help; rerender(); } }),
      btn(t('rp.restart'), { cls: 'btn-ghost grow', icon: 'repeat', small: true, onclick: restart })));
    if (!app.speech.hasMic && app.target === 'artifact') main.append(h('p', { class: 'small muted' }, t('say.noMicPreview')));
  } else {
    if (S.ai.busy) main.append(h('p', { class: 'lead muted' }, t('ai.thinking')));
    else {
      if (S.ai.error) main.append(note(t('ai.err.' + S.ai.error), 'care'));
      main.append(note(t('ai.consent.private'), 'care', 'lock'));     // repeated at every turn, not only in the first explanation
      main.append(h('div', { class: 'stack replies' }, S.ai.sugg.map((g) => h('div', { class: 'opt-wrap' }, miniPlay(app, clipEn(g.en, 's', 'n')),
        h('button', { type: 'button', class: 'opt', onclick: () => sendAi(g.en) }, h('span', { class: 'body' }, en(g.en), S.help && g.fa ? h('span', { class: 'sub' }, g.fa) : null))))));
      if (ask) main.append(againBtn(() => sendAi(ask.en, true)));
      if (micOn(app)) main.append(h('button', { type: 'button', class: 'mic-btn', onclick: speakAi }, icon('mic'), t('rp.speak')));
      const input = h('input', { id: 'ai-text', class: 'en', type: 'text', dir: 'ltr', lang: 'en', autocomplete: 'off', autocapitalize: 'sentences', maxlength: 200 });
      main.append(h('form', { class: 'field', onsubmit: (e) => { e.preventDefault(); const v = input.value.trim(); if (v) sendAi(v); } }, h('label', { for: 'ai-text' }, t('ai.type')), h('div', { class: 'row' }, h('div', { class: 'grow' }, input), btn(t('ai.send'), { cls: 'btn-primary', type: 'submit' }))));
      main.append(h('div', { class: 'row' },
        btn(t('ai.end'), { cls: 'btn-ghost grow', icon: 'check', small: true, onclick: () => { finish(); rerender(); } }),
        btn(t('rp.restart'), { cls: 'btn-ghost grow', icon: 'repeat', small: true, onclick: restart })));
      main.append(h('p', { class: 'small muted' }, t('ai.notice', { n: fnum(Math.max(0, AI_MAX_TURNS - S.ai.n)) })));
    }
  }
  return { main, exit, banner };
}
