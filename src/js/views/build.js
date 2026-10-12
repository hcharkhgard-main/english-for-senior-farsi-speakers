// Sentence builder: the learner makes English sentences by tapping word tiles into order.
// Many of the sentences are new — the same patterns as the lessons, with other words put in —
// so this is where "I learned that sentence" turns into "I can make my own".
import { h, icon, btn, en, note, progress, fnum } from '../ui.js';
import { clipEn, listenBtn, playNow, wordsLine, sayPanel } from '../components.js';
import { wordsOf, normWord } from '../audiokey.js';
import { shuffle, mix, later, micOn } from '../learn.js';

const strip = (t) => t.replace(/^[^A-Za-z0-9'$]+|[^A-Za-z0-9']+$/g, '');
export function tilesFor(sentence) {
  return wordsOf(sentence).map((w, i) => { const s = strip(w.text); return i === 0 && w.word ? normWord(s) : s; }).filter(Boolean);
}

// The spare tiles offered next to the words of the sentence. A spare word must never make a second sentence that is
// also right for the Farsi prompt, because the builder accepts only the one it was given:
//  • Farsi has no articles, so "a", "an", "the", "some" and "any" are never spare ("How much is a coffee?" and
//    "How much is the coffee?" both fit «قیمت قهوه چقدر است؟»);
//  • Farsi «او» is both "he" and "she". The other pronoun is only offered when the prompt says who is meant —
//    «او (خانم)», «(پسر)», or a word such as «دخترم» — and then it is good practice.
const ARTICLE = /^(a|an|the|some|any)$/i, PRONOUN = /^(he|she|his|her|him|hers)$/i;
const SAYS_WHO = /آقا|خانم|پسر|دختر|شوهر|پدر|مادر|برادر|خواهر/;
export function spareTiles(target, extra, fa = '') {
  const has = (w) => target.some((x) => x.toLowerCase() === w.toLowerCase());
  const pronouns = target.some((w) => PRONOUN.test(w)) && !SAYS_WHO.test(fa);
  return extra.filter((w) => !has(w) && !ARTICLE.test(w) && !(pronouns && PRONOUN.test(w))).slice(0, target.length <= 3 ? 1 : 2);
}

// key: state slot in app.ui.  item: { en, fa, voice }.  extra: distractor words.
export function tileBuilder(app, key, item, { extra = [], onDone } = {}) {
  const target = tilesFor(item.en);
  const S = (app.ui[key] ||= { placed: [], done: false, checked: false, hints: 0, pool: null });
  if (!S.pool) {
    S.pool = shuffle([...target, ...spareTiles(target, extra, item.fa)]);      // a different order on every attempt
    if (S.pool.join(' ') === target.join(' ') && S.pool.length > 1) S.pool.reverse();
  }
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const full = S.placed.length >= target.length;
  const right = S.placed.length === target.length && S.placed.every((pi, i) => same(S.pool[pi], target[i]));
  const finish = () => { if (S.done) return; S.done = true; onDone && onDone(S.hints === 0); later(app, 200, () => { if (app.ui[key] === S) playNow(app, clipEn(item.en, item.voice || 's', 'n'), { quiet: true }); }); };
  if (right) finish();
  const place = (pi) => { if (S.done || S.placed.includes(pi) || full) return; S.placed.push(pi); S.checked = S.placed.length >= target.length; app.render(); };
  const remove = (pos) => { if (S.done) return; S.placed.splice(pos, 1); S.checked = false; app.render(); };
  const hint = () => {
    if (S.done) return;
    let good = 0;
    while (good < S.placed.length && good < target.length && same(S.pool[S.placed[good]], target[good])) good++;
    S.placed = S.placed.slice(0, good);
    const nextIdx = S.pool.findIndex((w, pi) => !S.placed.includes(pi) && same(w, target[good]));
    if (nextIdx >= 0) S.placed.push(nextIdx);
    S.hints++; S.checked = S.placed.length >= target.length;
    app.render();
  };

  const wrap = h('div', { class: 'stack' });
  wrap.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, app.t('build.prompt')), h('p', { class: 'fa-line', style: 'font-size:1.5rem' }, item.fa)));
  wrap.append(h('p', { class: 'eyebrow' }, app.t('build.yours')));
  wrap.append(h('div', { class: 'tiles-line' + (S.done ? ' is-right' : ''), 'aria-live': 'polite' }, S.placed.map((pi, pos) => {
    const ok = S.checked && pos < target.length && same(S.pool[pi], target[pos]);
    return h('button', { type: 'button', class: 'wtile is-placed' + (S.done || ok ? ' is-ok' : S.checked ? ' is-off' : ''), lang: 'en', onclick: () => remove(pos) }, S.pool[pi]);
  })));
  if (S.done) {
    wrap.append(note(app.t('build.right'), 'good', 'check'));
    wrap.append(h('section', { class: 'card' }, wordsLine(app, item.en, { voice: item.voice || 's' }), h('div', { class: 'row' }, listenBtn(app, clipEn(item.en, item.voice || 's', 'n'), { label: app.t('audio.listen') }), listenBtn(app, clipEn(item.en, item.voice || 's', 's'), { label: app.t('audio.slow'), cls: 'btn-ghost', ic: 'slow' }))));
    // the sentence just built, said aloud — optional, as on every sentence card (QA round 3, L4)
    if (micOn(app)) wrap.append(sayPanel(app, { key: key + 'say', target: item.en, voice: item.voice || 's' }));
  } else {
    if (S.checked) wrap.append(note(S.pool.length > target.length && S.placed.some((pi) => !target.some((x) => same(x, S.pool[pi]))) ? app.t('build.extra') : app.t('build.almost'), 'care', 'bulb'));
    wrap.append(h('p', { class: 'eyebrow' }, app.t('build.words')));
    wrap.append(h('div', { class: 'tiles-pool' }, S.pool.map((w, pi) => h('button', { type: 'button', class: 'wtile' + (S.placed.includes(pi) ? ' is-used' : ''), lang: 'en', 'aria-hidden': S.placed.includes(pi) ? 'true' : null, tabindex: S.placed.includes(pi) ? '-1' : null, onclick: () => place(pi) }, w))));
    wrap.append(h('p', { class: 'small muted' }, app.t('build.tap')));
    wrap.append(h('div', { class: 'row' }, btn(app.t('build.hint'), { cls: 'btn-ghost grow', icon: 'bulb', small: true, onclick: hint }), btn(app.t('build.clear'), { cls: 'btn-ghost grow', icon: 'repeat', small: true, onclick: () => { S.placed = []; S.checked = false; app.render(); } })));
  }
  return wrap;
}

// A pattern is open when it is basic (level 1), when the lesson that explains its frame is finished, or — for a
// frame of which an earlier lesson already taught a sentence — when that earlier lesson (patterns.json "opensAfter")
// is finished: "I don't …" opens after "I don't understand" (lesson 2), not after its grammar tip much later.
export const patternOpen = (P, done) => P.level === 1 || !!done[P.lesson] || !!(P.opensAfter && done[P.opensAfter]);

export function buildView(app, id) {
  const { t, content, store } = app;
  const st = store.state;
  const open = (P) => patternOpen(P, st.done);
  if (!app.ui.warmed) { app.ui.warmed = true; app.audio.loadIndex().then(() => app.audio.warm(['b-patterns', 'words'])).catch(() => {}); }

  if (!id) {
    // only the patterns the learner has met: the basic ones, and those of lessons already finished
    const avail = content.patterns.filter(open);
    const locked = content.patterns.length - avail.length;
    const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('build.title')), h('p', { class: 'muted' }, t('build.sub')),
      btn(t('build.mix', { n: fnum(6) }), { cls: 'btn-primary', icon: 'pieces', block: true, onclick: () => app.go('build.mix') }),
      h('h2', { class: 'section-title' }, t('build.patterns')),
      avail.map((P) => h('button', { type: 'button', class: 'item', onclick: () => app.go('build.' + P.id) },
        h('span', { class: 'body' }, h('bdi', { class: 'en t', dir: 'ltr', lang: 'en' }, P.frame), h('span', { class: 's' }, P.fa)),
        st.built[P.id] ? h('span', { class: 'badge' }, icon('check'), fnum(st.built[P.id])) : h('span', { class: 'go' }, icon('next')))),
      locked ? h('p', { class: 'muted' }, t('build.locked', { n: fnum(locked) })) : null);
    return { main };
  }

  // a session of six sentences
  const S = (app.ui.session ||= (() => {
    let items;
    if (id === 'mix') {
      const pool = content.patterns.filter(open).flatMap((P) => P.items.map((it) => ({ ...it, pid: P.id, frame: P.frame })));
      items = shuffle(pool, ((app.today() % 97) + 1) / 98 + ((Object.values(st.built).reduce((a, b) => a + b, 0) % 13) / 100)).slice(0, 6);
    } else {
      const P = content.patterns.find((x) => x.id === id) || content.patterns[0];
      items = P.items.map((it) => ({ ...it, pid: P.id, frame: P.frame }));
    }
    return { items, i: 0, made: 0, seed: Math.random() };
  })());
  const main = h('main', { class: 'wrap' });
  if (S.i >= S.items.length) {
    // the tick and the count are for sentences really built; paging through without building gets a plain, kind message
    main.append(h('section', { class: 'card center' }, S.made ? h('span', { class: 'big-check' }, icon('check')) : null, h('h1', { style: 'font-size:1.5rem' }, t('build.done')),
      h('p', { class: 'lead' }, S.made ? t('build.done.sub', { n: fnum(S.made) }) : t('build.done.none'))),
      btn(t('build.again'), { cls: 'btn-primary', icon: 'pieces', block: true, onclick: () => app.go('build', { replace: true }) }),
      btn(t('nav.home'), { cls: 'btn-ghost', icon: 'home', block: true, onclick: app.home }));
    return { main };
  }
  const it = S.items[S.i];
  const P = content.patterns.find((x) => x.id === it.pid);
  const extra = shuffle(P.items.filter((x) => x.en !== it.en).flatMap((x) => tilesFor(x.en)), mix(S.seed, S.i));
  main.append(h('h1', { class: 'sr' }, t('build.title')));
  main.append(progress(t('build.title'), `${fnum(S.i + 1)} ${t('lesson.of')} ${fnum(S.items.length)}`, S.i / S.items.length));
  main.append(h('p', { class: 'muted' }, t('build.frame') + ' ', h('bdi', { class: 'en', dir: 'ltr', lang: 'en', style: 'font-weight:700' }, it.frame)));
  main.append(tileBuilder(app, 'tb' + S.i, it, { extra, onDone: () => { S.made++; store.update((s) => { s.built[it.pid] = (s.built[it.pid] || 0) + 1; }); } }));
  const bar = h('div', { class: 'bottombar' }, h('div', { class: 'inner' },
    S.i > 0 ? btn(t('nav.prev'), { cls: 'btn-ghost', icon: 'back', onclick: () => { S.i--; app.audio.stop(); app.render(true); } }) : null,
    btn(t('nav.next'), { cls: 'btn-primary', 'data-next': '', onclick: () => { S.i++; app.audio.stop(); app.render(true); } })));
  return { main, bar };
}
