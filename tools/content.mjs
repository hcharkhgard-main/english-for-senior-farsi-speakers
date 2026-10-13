// Loads the authored curriculum (content/*.json), normalises it into the single
// bundle the app reads, and lists every audio clip the app can ask for.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audioKey, wordsOf, wordsOfHeadword } from '../src/js/audiokey.js';
import { ownPieces, CARRIERS, CARRIERS_MORE } from '../src/js/own.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = (...p) => path.join(ROOT, 'content', ...p);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const maybe = (f, d) => (fs.existsSync(f) ? readJson(f) : d);

export function loadContent() {
  const curriculum = readJson(C('curriculum.json'));
  const scenarios = readJson(C('scenarios.json')).scenarios;
  const lessons = {};
  const problems = [];      // mistakes of form found while loading; the validator reports them as errors
  for (const f of fs.readdirSync(C('lessons')).filter((x) => x.endsWith('.json')).sort()) {
    const L = normaliseLesson(readJson(C('lessons', f)), problems);
    L.file = f;
    lessons[L.id] = L;
  }
  // A lesson's stage is the stage that lists it in curriculum.json; the "stage" written in the lesson file is
  // only a note for authors. Differences are reported by the validator (see content.notes below).
  const notes = [];
  for (const st of curriculum.stages) {
    for (const id of st.lessons) {
      const L = lessons[id];
      if (!L) continue;
      if (L.stage != null && L.stage !== st.id) notes.push(`lesson ${id}: its file says stage ${L.stage}, curriculum.json puts it in stage ${st.id} (the curriculum wins)`);
      L.stage = st.id;
    }
  }
  // practice: lesson id -> the conversation(s) that practise it. In curriculum.json a value is one conversation id or
  // a list of them (the first is the main one). The app receives both forms:
  //   content.practice     lesson id -> the main conversation id (a string, as before)
  //   content.practiceAll  lesson id -> every conversation id of that lesson, main one first
  // A conversation is as easy as the easiest lesson that leads to it.
  const practiceAll = {};
  for (const [lid, v] of Object.entries(curriculum.practice || {})) {
    const list = (Array.isArray(v) ? v : [v]).filter((x) => typeof x === 'string' && x);
    if (list.length !== (Array.isArray(v) ? v.length : 1) || !list.length) problems.push(`curriculum practice: "${lid}" must be a conversation id or a list of conversation ids`);
    if (new Set(list).size !== list.length) problems.push(`curriculum practice: "${lid}" lists a conversation twice`);
    if (list.length) practiceAll[lid] = [...new Set(list)];
  }
  const practice = Object.fromEntries(Object.entries(practiceAll).map(([lid, list]) => [lid, list[0]]));
  const roleplays = fs.readdirSync(C()).filter((x) => /^roleplays.*\.json$/.test(x)).sort().flatMap((f) => readJson(C(f)).roleplays).map((R) => normaliseRoleplay(R, problems));
  for (const R of roleplays) {
    const from = Object.keys(practiceAll).filter((id) => practiceAll[id].includes(R.id) && lessons[id]).map((id) => lessons[id].stage);
    R.stage = from.length ? Math.min(...from) : (R.stage || 1);
  }
  // the lessons nobody skips, whatever they answered at the start: the first two, and the first emergency lesson (calling 911)
  const first = curriculum.stages.length ? curriculum.stages[0].lessons : [];
  const sos = first.find((id) => lessons[id] && lessons[id].scenario === 'emergency');
  const essentials = Array.isArray(curriculum.essentials) ? curriculum.essentials : first.filter((id, i) => i < 2 || id === sos);
  // "always": lessons that a learner who starts in a later stage still gets in their place, because later lessons take
  // them for granted (prices at the checkout, days and times) — see pathLesson in src/js/learn.js
  const always = Array.isArray(curriculum.always) ? curriculum.always.filter((id) => typeof id === 'string') : [];
  if (curriculum.always != null && !Array.isArray(curriculum.always)) problems.push('curriculum always: must be a list of lesson ids');
  const vfile = maybe(C('vocabulary.json'), { words: [], categories: [] });
  const vocab = vfile.words.map(normaliseWord);
  const vocabCats = vfile.categories || [];
  // review-order.json: the order in which new words appear in review (see reviewPool in src/js/learn.js).
  // "first" names words by their English spelling; the app receives ids. A spelling that exists twice means the first in the file.
  const rfile = maybe(C('review-order.json'), {});
  const wordsAfter = rfile.afterLesson || {};
  const wordsSpread = rfile.spread || [];
  const firstNames = (rfile.first || []).flat();
  const wordsFirst = firstNames.map((name) => (vocab.find((w) => w.en === name) || {}).id).filter(Boolean);
  problems.push(...firstNames.filter((name) => !vocab.some((w) => w.en === name)).map((name) => `review order: "first" names "${name}", which is not in vocabulary.json`));
  // A word's id is its place in the file, so a word added later stands at the end of the file. A group marked
  // "sorted" (the alphabet) is nevertheless shown in alphabetical order: its words change places among themselves.
  for (const c of vocabCats.filter((x) => x.sorted)) {
    const at = vocab.map((w, i) => (w.cat === c.id ? i : -1)).filter((i) => i >= 0);
    const inOrder = at.map((i) => vocab[i]).sort((x, y) => (x.en.toLowerCase() < y.en.toLowerCase() ? -1 : x.en.toLowerCase() > y.en.toLowerCase() ? 1 : 0));
    at.forEach((i, k) => { vocab[i] = inOrder[k]; });
  }
  const numbers = maybe(C('numbers.json'), { items: [] }).items.map(normaliseNumber);
  const emergency = maybe(C('emergency.json'), { phrases: [], tips: [] });
  const cfile = maybe(C('corrections.json'), { rules: [] });
  const ui = maybe(C('ui.fa.json'), {});
  const patterns = maybe(C('patterns.json'), { patterns: [] }).patterns.map((P) => ({ ...P, items: P.items.map(([en, fa]) => ({ en, fa })) }));
  // papers.json (optional): pieces of paper and screens to read — see normalisePaper
  const pfile = maybe(C('papers.json'), { papers: [] });
  const papers = (Array.isArray(pfile.papers) ? pfile.papers : []).map((P, i) => normalisePaper(P, i, problems));
  // curriculum.json "numbersAfter": lessons whose last screen offers «شنیدن عددها»;
  // "mine": lesson id -> which of the learner's own sentences its last screen builds (see src/js/own.js)
  const numbersAfter = Array.isArray(curriculum.numbersAfter) ? curriculum.numbersAfter.filter((id) => typeof id === 'string') : [];
  const mine = {};
  for (const [lid, kinds] of Object.entries(curriculum.mine || {})) { if (Array.isArray(kinds)) mine[lid] = kinds.map(String); else problems.push(`curriculum mine: "${lid}" must list kinds of sentence`); }
  const content = { version: curriculum.version, stages: curriculum.stages, essentials, always, practice, practiceAll, numbersAfter, mine, scenarios, lessons, roleplays, vocab, vocabCats, wordsAfter, wordsFirst, wordsSpread, numbers, papers, emergency, corrections: cfile.rules, soundTips: cfile.soundTips || [], patterns, ui };
  Object.defineProperty(content, 'notes', { value: notes });   // for the validator only; not written into the bundle
  Object.defineProperty(content, 'problems', { value: problems });
  return content;
}

// ---- optional fields added in development pass 3 (documented in docs/CONTENT-REVIEW.md, "Optional fields") ----
// What the app receives, after this file has brought them into one shape. A field that is absent or empty in the
// content file is ABSENT here too (never an empty list), so `if (L.variants)` and `(L.variants || [])` both work.
//   lesson.phrases[i].own   ['Maryam', …]      the words of that phrase's `en` that stand for the learner's own details
//   lesson.phrases[i].heard true               a line other people say (pass 4): understood, never asked to be said;
//                                                absent when false
//   lesson.mission          'یک جملهٔ فارسی'      a small thing to try in real life today
//   lesson.variants         [{ en, fa, like, voice }]   other wordings of something the lesson teaches; `voice` is always
//                                                filled in (the variant's own, else the lesson's them.voice)
//   lesson.grid             { title, note, words: ['zero', …] }   vocabulary headwords for a tap-to-hear screen
//                                                (`title` and `note` are '' when not given)
//   conversation.turns[i].check                  { q, right, wrong: [a, b] }   about that turn's partner line; `q` is null
//   conversation.turns[i].replies[j].thenCheck   the same, about that reply's `then` line     when the default question is meant
//   conversation.turns[i].replies[j].skip        n (1 or more): the next n turns are left out after this reply; absent when not given
//   content.papers          [{ id, title, kind, stage, lesson (id or null), note ('' when none), safetyCritical (boolean),
//                              lines: [{ en, fa, strong (boolean) }], questions: [{ fa, line }] }]   `line` is 1-based, as written
//   content.practice / content.practiceAll, content.essentials, content.numbersAfter, content.mine — see loadContent
// Voices: 's' (the learner's voice, a woman), 'm' (a man), 'b' (a woman), 'k' (a second woman), 'a' (a second man).
export const VOICES = ['s', 'm', 'b', 'k', 'a'];
const isText = (x) => typeof x === 'string' && x.trim() !== '';

function normaliseCheck(c, where, problems) {
  if (c == null) return null;
  if (typeof c !== 'object' || Array.isArray(c) || !isText(c.right) || !Array.isArray(c.wrong) || !c.wrong.every(isText) || (c.q != null && !isText(c.q))) {
    problems.push(`${where}: a check needs "right" (text) and "wrong" (a list of two texts); "q" is optional`);
    return null;
  }
  return { q: c.q != null ? c.q.trim() : null, right: c.right.trim(), wrong: c.wrong.map((x) => x.trim()) };
}

export function normaliseLesson(L, problems = []) {
  const out = { ...L };
  const W = `lesson ${L.id}`;
  out.phrases = L.phrases.map((p, i) => {
    const q = { id: `p${i + 1}`, voice: 's', ...p };
    delete q.own; delete q.heard; delete q.hear;
    if (p.own != null) {
      if (!Array.isArray(p.own) || !p.own.every(isText)) problems.push(`${W} phrase ${i + 1}: "own" must be a list of words`);
      else if (p.own.length) q.own = p.own.map((x) => x.trim());
    }
    // "heard": true — a line other people say to the learner (the pharmacist, the driver): it is to be understood, not
    // said. Absent (or false) means a sentence for the learner to say. ("hear" is a likely slip of the pen.)
    if (p.heard != null && typeof p.heard !== 'boolean') problems.push(`${W} phrase ${i + 1}: "heard" must be true or false`);
    else if (p.heard) q.heard = true;
    if (p.hear != null) problems.push(`${W} phrase ${i + 1}: "hear" is not a field — write "heard": true for a line other people say`);
    return q;
  });
  delete out.mission; delete out.variants; delete out.grid;
  if (L.mission != null) { if (typeof L.mission !== 'string') problems.push(`${W}: "mission" must be one Farsi sentence`); else if (L.mission.trim()) out.mission = L.mission.trim(); }
  if (L.variants != null) {
    if (!Array.isArray(L.variants) || !L.variants.every((v) => v && typeof v === 'object' && !Array.isArray(v))) problems.push(`${W}: "variants" must be a list of { en, fa, like }`);
    else if (L.variants.length) out.variants = L.variants.map((v) => ({ en: v.en, fa: v.fa, like: v.like, voice: v.voice || (L.them && L.them.voice) || 'm' }));
  }
  if (L.grid != null) {
    if (typeof L.grid !== 'object' || !Array.isArray(L.grid.words) || !L.grid.words.every(isText)) problems.push(`${W}: "grid" needs "words", a list of vocabulary headwords`);
    else if (L.grid.words.length) out.grid = { title: isText(L.grid.title) ? L.grid.title.trim() : '', note: isText(L.grid.note) ? L.grid.note.trim() : '', words: L.grid.words.map((x) => x.trim()) };
  }
  out.dialogue = { setting: L.dialogue.setting, lines: L.dialogue.lines.map(([who, en, fa]) => ({ who, en, fa })) };
  out.respond = {
    setting: L.respond.setting,
    them: { en: L.respond.them[0], fa: L.respond.them[1] },
    ok: L.respond.ok.map(([en, fa]) => ({ en, fa })),
    off: { en: L.respond.off[0], fa: L.respond.off[1], why: L.respond.off[2] },
  };
  // "off2": the number of a second sentence of this lesson that is no answer here; the app receives its id, like a task's answer
  if (L.respond.off2 != null) { if (Number.isInteger(L.respond.off2) && L.respond.off2 >= 1 && L.respond.off2 <= L.phrases.length) out.respond.off2 = `p${L.respond.off2}`; else problems.push(`${W} respond: "off2" must be the number of one of the lesson's sentences`); }
  out.task = L.task.map(([fa, n]) => ({ fa, answer: `p${n}` }));
  if (L.grammar) out.grammar = { ...L.grammar, examples: L.grammar.examples.map(([en, fa]) => ({ en, fa })) };
  delete out.order;
  return out;
}

export function normaliseRoleplay(R, problems = []) {
  return {
    ...R,
    turns: R.turns.map((t, i) => {
      const W = `conversation ${R.id} turn ${i + 1}`;
      const check = normaliseCheck(t.check, W, problems);
      return {
        them: { en: t.them[0], fa: t.them[1] },
        open: !!t.open,
        ...(check ? { check } : {}),
        replies: t.replies.map((r) => {
          const thenCheck = normaliseCheck(r.thenCheck, `${W} reply "${r.en}"`, problems);
          if (thenCheck && !r.then) problems.push(`${W} reply "${r.en}": "thenCheck" without a "then" line`);
          // "skip": n — after this reply the next n turns are left out ("I'm calling 911 now" makes "Do you want to call the police?" moot)
          if (r.skip != null && !(Number.isInteger(r.skip) && r.skip >= 1 && i + 1 + r.skip < R.turns.length)) problems.push(`${W} reply "${r.en}": "skip" must be a whole number of turns (1 or more) that leaves at least one turn after it`);
          return { en: r.en, fa: r.fa, keys: r.keys || [], then: r.then ? { en: r.then[0], fa: r.then[1] } : null, ...(thenCheck && r.then ? { thenCheck } : {}), ...(Number.isInteger(r.skip) && r.skip >= 1 ? { skip: r.skip } : {}) };
        }),
      };
    }),
  };
}

// A piece of paper or a screen to read («خواندن نوشته‌ها»). Lines are read aloud in the learner's voice ('s').
export function normalisePaper(P, i, problems = []) {
  const W = `paper ${(P && P.id) || i + 1}`;
  if (!P || typeof P !== 'object' || !Array.isArray(P.lines) || !Array.isArray(P.questions)) { problems.push(`${W}: needs "lines" and "questions"`); P = { ...(P || {}), lines: [], questions: [] }; }
  return {
    ...P,
    id: String(P.id || `paper${i + 1}`),
    stage: P.stage || 1,
    lesson: P.lesson || null,
    note: isText(P.note) ? P.note.trim() : '',
    safetyCritical: !!P.safetyCritical,
    lines: P.lines.map((l) => ({ en: l && l.en, fa: l && l.fa, strong: !!(l && l.strong) })),
    questions: P.questions.map((q) => ({ fa: q && q.fa, line: q && q.line })),
  };
}

function normaliseWord(w, i) {
  const [en, fa, ph, exEn, exFa, pic, cat, level] = w;
  return { id: `w${i + 1}`, en, fa, ph, ex: exEn ? { en: exEn, fa: exFa } : null, pic: pic || '', cat, level: level || 1 };
}

// Listening practice for numbers: "say" is the spoken sentence (numbers written as words), "show" is what the
// answer button shows, "alts" are the look-alike wrong answers. Two voices take turns.
function normaliseNumber(n, i) {
  return { id: `n${i + 1}`, voice: i % 2 ? 'm' : 's', ...n };
}

// ---- audio requests -------------------------------------------------------
// Every clip the app may play, with the pack (download unit) it belongs to.
export function audioRequests(content) {
  const reqs = new Map();
  const add = (pack, lang, voice, speed, text) => {
    if (!text) return;
    const key = audioKey(lang, voice, speed, text);
    const prev = reqs.get(key);
    if (prev) {
      if (prev.text !== text.trim() || prev.voice !== voice || prev.speed !== speed) throw new Error(`audio key collision: ${text} / ${prev.text}`);
      prev.users.add(pack);
      return;
    }
    reqs.set(key, { key, pack, lang, voice, speed, text: text.trim(), users: new Set([pack]) });
  };
  const en = (pack, voice, text, slow = false) => { add(pack, 'en', voice, 'n', text); if (slow) add(pack, 'en', voice, 's', text); };
  const fa = (pack, text) => add(pack, 'fa', 'f', 'n', text);

  // core pack: things that must work offline from the first visit
  for (const t of Object.values(content.ui.spoken || {})) fa('core', t);
  for (const p of content.emergency.phrases) { en('core', 's', p.say || p.en, true); if (!p.slot) fa('core', p.fa); }
  // English sentences the interface itself offers (ui.fa.json "fixed"), e.g. the "Could you repeat that, please?" button of every conversation
  for (const f of Object.values(content.ui.fixed || {})) if (f && typeof f === 'object' && f.en) en('core', 's', f.en);

  for (const L of Object.values(content.lessons)) {
    const pack = `l-${L.id}`;
    const them = L.them.voice;
    fa(pack, L.intro); fa(pack, L.canDo);
    for (const p of L.phrases) {
      en(pack, p.voice, p.en, true); fa(pack, p.fa);
      if (p.chunks && p.chunks.length > 1) for (const c of p.chunks) add(pack, 'en', p.voice, 's', c);
    }
    for (const l of L.dialogue.lines) en(pack, l.who === 'you' ? 's' : them, l.en);
    en(pack, them, L.respond.them.en, true);
    for (const o of L.respond.ok) en(pack, 's', o.en);
    en(pack, 's', L.respond.off.en);
    if (L.grammar) {
      for (const e of L.grammar.examples) en(pack, 's', e.en);
      en(pack, 's', L.grammar.right);
      if (L.grammar.compare === 'listen') en(pack, 's', L.grammar.wrong);
    }
    // "the same thing in other words": heard without text, at both speeds, in the variant's voice
    for (const v of L.variants || []) en(pack, v.voice, v.en, true);
  }
  for (const R of content.roleplays) {
    const pack = `r-${R.id}`;
    for (const t of R.turns) {
      en(pack, R.them.voice, t.them.en, true);
      for (const r of t.replies) { en(pack, 's', r.en); if (r.then) en(pack, R.them.voice, r.then.en, true); }
    }
  }
  // single words: every word of a taught phrase can be tapped and heard on its own — and so can the words of an
  // answer the learner has just said aloud (the good answers of "respond", after the pronunciation check)
  const word = (text) => { for (const t of wordsOf(text)) if (t.word) add('words', 'en', 's', 's', t.word); };
  for (const L of Object.values(content.lessons)) { for (const p of L.phrases) word(p.en); for (const o of L.respond.ok) word(o.en); }
  for (const p of content.emergency.phrases) word(p.say || p.en);
  for (const P of content.patterns) for (const it of P.items) { en('b-patterns', 's', it.en); word(it.en); }
  for (const w of content.vocab) {
    const pack = `v-${w.cat}`;
    en(pack, 's', w.en, true);
    if (w.ex) en(pack, 's', w.ex.en);
  }
  // a headword on a review card can be tapped too: one word is its own slow recording (already listed above),
  // several words ("thank you", "seat belt") are heard one at a time
  for (const w of content.vocab) for (const t of wordsOfHeadword(w.en)) if (t.word) add('words', 'en', 's', 's', t.word);
  for (const n of content.numbers) en('n-numbers', n.voice, n.say, true);
  // «خواندن نوشته‌ها»: each line of a paper can be heard after it is found (the learner's voice, natural speed)
  for (const P of content.papers || []) for (const l of P.lines) en('papers', 's', l.en);
  // …and each question can be heard in Farsi (the listen button beside it — views/papers.js)
  for (const P of content.papers || []) for (const q of P.questions) fa('papers', q.fa);
  // «جملهٔ خودِ شما» (src/js/own.js): the learner's own phone number, age, spelled name and date of birth are played
  // from single recordings — letters, numbers 0–99, ordinals 1st–31st, months and the pieces of a year. Most are
  // vocabulary headwords and exist already; the rest are recorded for the pack "me". The beginnings of the
  // sentences ("My phone number is") are recorded at both speeds.
  for (const text of ownPieces()) add('me', 'en', 's', 'n', text);
  for (const text of [...Object.values(CARRIERS), ...Object.values(CARRIERS_MORE)]) en('me', 's', text, true);      // (CARRIERS_MORE: the clinic's "My date of birth is …", for the learner's own answer in a conversation)
  return [...reqs.values()].map((r) => ({ ...r, users: [...r.users] }));
}

export { ROOT };
