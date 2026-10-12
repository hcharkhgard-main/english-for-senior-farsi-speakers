// «خواندن نوشته‌ها»: reading practice on the papers and screens of everyday life — an appointment
// card, a medicine label, a bill, a letter, a bus-stop sign (content/papers.json).
// The paper is shown the way it looks; one Farsi question at a time asks where something is written
// ("what time must I come?") and the learner answers by tapping that line of the paper. A tap on
// another line costs nothing: the learner is told, in Farsi, what that line says and looks again.
import { h, icon, btn, note, progress, fnum } from '../ui.js';
import { clipEn, listenBtn, miniPlay, faListen } from '../components.js';
import { audioKey } from '../audiokey.js';

export const papersOf = (content) => (Array.isArray(content.papers) ? content.papers : []);
const lineOf = (P, n) => (Number.isInteger(n) && n >= 1 ? P.lines[n - 1] : null) || null;
const questionsOf = (P) => (P.questions || []).filter((q) => lineOf(P, q.line));
const hasRead = (app, id) => !!(app.store.state.read && app.store.state.read[id]);

// The words of one line of a paper. A phone number, a date, a time or a price ("555-0160", "11/30/2026",
// "10:30 AM", "$13.50") is the thing the learner is looking for: it is kept in one piece (styles.css .nb), so it
// moves to the next line whole instead of being cut at a hyphen or a slash — unless the screen is narrower than it.
const PIECE = /\S*\d\S*(?: [AP]M\b)?/g;
export function lineText(text) {
  const out = [];
  let at = 0;
  for (const m of String(text).matchAll(PIECE)) {
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push(h('span', { class: 'nb', lang: 'en' }, m[0]));
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

// The paper that follows this one: the next one not yet read, otherwise simply the next in the list.
export function nextPaper(papers, read, id) {
  const at = papers.findIndex((p) => p.id === id);
  if (papers.length < 2 || at < 0) return null;
  const after = [...papers.slice(at + 1), ...papers.slice(0, at)];
  return after.find((p) => !(read && read[p.id])) || after[0];
}

// The sound of a paper's lines is fetched when the paper is opened (and so is kept for use without a
// connection). Which download holds a line is looked up in the list of recordings, not assumed.
function warm(app, P) {
  app.audio.loadIndex().then((idx) => {
    const packs = new Set();
    for (const l of P.lines) { const hit = idx.clips[audioKey('en', 's', 'n', l.en)]; if (hit && idx.packs[hit[0]]) packs.add(idx.packs[hit[0]].id); }
    if (packs.size) app.audio.warm([...packs]);
  }).catch(() => { /* no connection and nothing stored: the lines are still there to read */ });
}

// One row of the list (also used by the screens that link to a paper).
export function paperItem(app, P) {
  return h('button', { type: 'button', class: 'item', onclick: () => app.go('paper.' + P.id) },
    h('span', { class: 'pic pic-s' }, icon('paper')),
    h('span', { class: 'body' }, h('span', { class: 't' }, P.title), h('span', { class: 's' }, app.t('read.count', { n: fnum(questionsOf(P).length) }))),
    hasRead(app, P.id) ? h('span', { class: 'badge' }, icon('check'), app.t('read.read')) : h('span', { class: 'go' }, icon('next')));
}

// The way in, for the screens that offer this practice («یادگیری کلمات», «موقعیت‌های روزمره»): one row, or nothing when there are no papers.
export function papersLink(app) {
  if (!papersOf(app.content).length) return null;
  return h('button', { type: 'button', class: 'item', 'data-papers': '', onclick: () => app.go('papers') }, h('span', { class: 'pic pic-s' }, icon('paper')),
    h('span', { class: 'body' }, h('span', { class: 't' }, app.t('read.title')), h('span', { class: 's' }, app.t('read.item.sub'))), h('span', { class: 'go' }, icon('next')));
}

// The papers that belong to one everyday situation (through the lesson each paper names), under their own heading.
export function placePapers(app, scenarioId) {
  const list = papersOf(app.content).filter((P) => { const L = P.lesson && app.content.lessons[P.lesson]; return !!L && L.scenario === scenarioId; });
  return list.length ? [h('h2', { class: 'section-title' }, app.t('read.title')), ...list.map((P) => paperItem(app, P))] : [];
}

// For the last screen of a lesson: the papers that go with it (a paper names its lesson in "lesson").
export const papersFor = (content, lessonId) => papersOf(content).filter((P) => P.lesson === lessonId);

export function papersView(app) {
  const { t, content } = app;
  const papers = papersOf(content);
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('read.title')), h('p', null, t('read.sub')));
  if (!papers.length) { main.append(note(t('read.none'), 'info', 'paper')); return { main }; }
  const stages = content.stages.map((st) => ({ title: st.title, list: papers.filter((p) => (p.stage || 1) === st.id) }));
  const rest = papers.filter((p) => !content.stages.some((st) => st.id === (p.stage || 1)));
  for (const g of [...stages, { title: '', list: rest }]) {
    if (!g.list.length) continue;
    if (g.title) main.append(h('h2', { class: 'section-title' }, g.title));
    g.list.forEach((P) => main.append(paperItem(app, P)));
  }
  return { main };
}

export function paperView(app, id) {
  const { t, store, content } = app;
  const papers = papersOf(content);
  const P = papers.find((x) => x.id === id);
  const qs = questionsOf(P);
  // S.q[i]: what has happened to question i — the lines tried, the line tapped last, and whether it is found
  const S = (app.ui.paper ||= { i: 0, q: {} });
  if (!S.warmed) { S.warmed = true; warm(app, P); }
  const main = h('main', { class: 'wrap' });

  // ---- the end: a kind word, and the whole paper once more with its meaning ---------------------
  if (S.i >= qs.length) {
    const next = nextPaper(papers, store.state.read, id);
    const L = P.lesson && Object.prototype.hasOwnProperty.call(content.lessons, P.lesson) ? content.lessons[P.lesson] : null;
    // praise only for what was done: someone who walked past the questions is shown the paper with its meaning, and invited back
    const found = qs.every((_, i) => S.q[i] && S.q[i].solved);
    if (found) main.append(h('section', { class: 'card center' }, h('span', { class: 'big-check' }, icon('check')),
      h('h1', { class: 'paper-done' }, t('read.done')), h('p', { class: 'lead' }, t('read.done.sub'))));
    else main.append(h('section', { class: 'card' }, h('h1', { class: 'paper-done' }, t('read.all')), h('p', { class: 'lead' }, t('read.passed')),
      btn(t('read.again'), { cls: 'btn-ghost', icon: 'repeat', block: true, onclick: () => { app.audio.stop(); app.ui.paper = null; app.render(true); } })));
    if (P.note) main.append(note(P.note, P.safetyCritical ? 'danger' : 'care', P.safetyCritical ? 'sos' : 'info'));
    if (found) main.append(h('h2', { class: 'section-title' }, t('read.all')));
    main.append(
      h('section', { class: 'paper is-open', 'aria-label': P.title }, h('ul', { class: 'paper-lines', role: 'list' }, P.lines.map((l) =>
        h('li', { class: 'pl-read' }, miniPlay(app, clipEn(l.en, 's', 'n')),
          h('div', { class: 'grow' }, h('p', { class: 'en pl-en' + (l.strong ? ' is-strong' : ''), lang: 'en', dir: 'ltr' }, lineText(l.en)), h('p', { class: 'pl-fa' }, l.fa)))))),
      h('p', { class: 'small muted' }, t('read.sample')));
    if (L) main.append(btn(t('read.lesson', { title: L.title.fa }), { cls: 'btn-ghost', icon: 'book', block: true, onclick: () => app.go('lesson.' + L.id) }));
    const bar = h('div', { class: 'bottombar' }, h('div', { class: 'inner' },
      btn(t('read.list'), { cls: next ? 'btn-ghost' : 'btn-primary', onclick: () => app.go('papers', { replace: true }) }),
      next ? btn(t('read.next'), { cls: 'btn-primary', 'data-next': '', onclick: () => app.go('paper.' + next.id, { replace: true }) }) : null));
    return { main, bar };
  }

  // ---- one question -----------------------------------------------------------------------------
  const q = qs[S.i];
  const Q = (S.q[S.i] ||= { tried: {}, last: 0, solved: false });
  const tap = (n) => {
    if (Q.solved) return;
    app.audio.stop();
    if (n === q.line) Q.solved = true; else Q.tried[n] = true;
    Q.last = n;
    app.render();
  };

  main.append(progress(P.title, `${fnum(S.i + 1)} ${t('lesson.of')} ${fnum(qs.length)}`, S.i / qs.length));
  main.append(h('div', { class: 'paper-qwrap' }, h('section', { class: 'paper-q' },
    h('p', { class: 'eyebrow' }, t('read.find')),
    h('div', { class: 'row' }, h('h1', { class: 'grow' }, q.fa), faListen(app, q.fa, t('audio.listenFa'))),
    h('p', { class: 'small how' }, t('read.how')))));

  const rows = P.lines.map((l, k) => {
    const n = k + 1, right = Q.solved && n === q.line, tried = !right && !!Q.tried[n];
    const line = h('button', { type: 'button', class: 'pl' + (l.strong ? ' is-strong' : '') + (right ? ' is-right' : tried ? ' is-tried' : ''), lang: 'en', dir: 'ltr',
      'aria-disabled': Q.solved && !right ? 'true' : null, onclick: () => tap(n) },
      h('span', { class: 'ring', 'aria-hidden': 'true' }, right ? icon('check') : null),
      h('span', { class: 'txt', lang: 'en' }, lineText(l.en)),      // (lang: plain English text, not Farsi with English in it)
      right ? h('span', { class: 'sr', lang: 'fa' }, t('quiz.isRight')) : tried ? h('span', { class: 'sr', lang: 'fa' }, t('quiz.notThis')) : null);
    const row = h('li', null, line);
    // what the tapped line says, in Farsi, right under it — where the learner is looking
    if (right) row.append(h('div', { class: 'pl-says is-right', 'data-live': '', 'data-says': '' },
      h('p', null, h('b', null, t('quiz.right') + ' '), t('read.says', { fa: l.fa })),
      listenBtn(app, clipEn(l.en, 's', 'n'), { label: t('read.hear'), small: true })));
    else if (tried && Q.last === n) row.append(h('div', { class: 'pl-says', 'data-live': '', 'data-says': '' },
      h('p', null, t('read.says', { fa: l.fa })), h('p', null, t('read.miss'))));
    return row;
  });
  main.append(h('section', { class: 'paper', 'aria-label': P.title }, h('ul', { class: 'paper-lines', role: 'list' }, rows)),
    h('p', { class: 'small muted' }, t('read.sample')));

  const step = (d) => {
    app.audio.stop();
    S.i = Math.max(0, S.i + d);
    // a paper counts as read when every question was found on it; walking past a question is allowed and costs nothing
    if (S.i >= qs.length && qs.every((_, i) => S.q[i] && S.q[i].solved)) store.update((s) => { s.read = s.read || {}; s.read[id] = (s.read[id] || 0) + 1; });
    app.render(true);
  };
  const bar = h('div', { class: 'bottombar' }, h('div', { class: 'inner' },
    S.i > 0 ? btn(t('nav.prev'), { cls: 'btn-ghost', icon: 'back', onclick: () => step(-1) }) : null,
    btn(t('nav.next'), { cls: 'btn-primary', 'data-next': '', onclick: () => step(1) })));

  // The question stays in view while the paper is read (styles.css needs the height of the top bar for
  // that), and what a tap has just revealed is brought clear of the bar at the bottom.
  const after = (navigated) => {
    const top = document.querySelector('.topbar'), bottom = document.querySelector('.bottombar');
    if (top) main.style.setProperty('--top-h', `${top.offsetHeight}px`);
    const says = navigated ? null : main.querySelector('[data-says]');
    if (says && bottom) {
      const over = says.getBoundingClientRect().bottom - (bottom.getBoundingClientRect().top - 12);
      if (over > 0) window.scrollBy(0, over);
    }
  };
  return { main, bar, after };
}
