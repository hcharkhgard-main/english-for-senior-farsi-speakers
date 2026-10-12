// Checks the curriculum for structural mistakes before it reaches a learner.
//   node tools/validate-content.mjs [--audio]     (--audio also requires every clip to exist in site/audio)
import fs from 'node:fs';
import path from 'node:path';
import { loadContent, audioRequests, VOICES, ROOT } from './content.mjs';
import { wordsOf } from '../src/js/audiokey.js';
import { partnerLines } from '../src/js/learn.js';
import { OWN_KINDS } from '../src/js/own.js';

const content = loadContent();
const errors = [], warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const FA = /[؀-ۿ]/, LATIN = /[A-Za-z]/;
const isFa = (where, s, { allowLatin = false } = {}) => {
  if (typeof s !== 'string' || !s.trim()) return err(where, 'missing Farsi text');
  if (!FA.test(s)) err(where, `expected Farsi, got "${s}"`);
  if (/[?;,]/.test(s.replace(/[A-Za-z0-9 .'’\-$()«»:!"]+[?;,]?/g, (m) => (LATIN.test(m) ? '' : m)))) warn(where, `Latin punctuation in Farsi text: "${s}"`);
  if (/[يك]/.test(s)) err(where, `Arabic letter form (ي/ك) instead of Persian (ی/ک): "${s}"`);
  if (!allowLatin && LATIN.test(s.replace(/«[^»]*»|\([^)]*\)/g, '')) && !/Farsi|Allow|Share|Add|Safari|Chrome|Settings|Install|Microphone|Representative|PIN|ID|No Parking|Persian|th|w|sss|Here you go|I/.test(s)) warn(where, `unquoted English inside Farsi: "${s}"`);
};
const isEn = (where, s) => {
  if (typeof s !== 'string' || !s.trim()) return err(where, 'missing English text');
  if (FA.test(s)) err(where, `Farsi letters in English text: "${s}"`);
  if (/\s{2,}|^\s|\s$/.test(s)) err(where, `stray spaces: "${s}"`);
  if (!/[.!?…]$/.test(s)) warn(where, `no end punctuation: "${s}"`);
};

// mistakes of form the loader found (a field of the wrong shape): see tools/content.mjs
for (const p of content.problems) errors.push(p);
// a comprehension question ("check" on a conversation turn, "thenCheck" on a reply): one right answer, exactly two
// wrong ones, all different, all Farsi — or all three the fact itself as it is seen in America, with Latin digits and
// shown from left to right: a price ("$4.99"), a phone number, a code, a house number ("25 Oak Street")
const isCheck = (where, c) => {
  if (c.q != null) isFa(`${where} question`, c.q, { allowLatin: true });
  const facts = [c.right, ...c.wrong].every((x) => /\d/.test(x) && !FA.test(x) && !/[۰-۹]/.test(x));
  if (!facts) isFa(`${where} right answer`, c.right, { allowLatin: true });
  if (facts && c.q == null) err(where, 'answers that are bare numbers need a question of their own ("q")');
  if (c.wrong.length !== 2) err(where, `needs exactly two wrong answers (has ${c.wrong.length})`);
  if (!facts) c.wrong.forEach((w, i) => isFa(`${where} wrong answer ${i + 1}`, w, { allowLatin: true }));
  if (new Set([c.right, ...c.wrong].map((x) => x.replace(/\s+/g, ' ').trim())).size !== c.wrong.length + 1) err(where, 'two of the answers are the same');
};
// a word (or run of words) stands in a sentence as whole words: "Oak" in "25 Oak Street.", not in "Oakland"
const hasWords = (sentence, part) => { const i = sentence.indexOf(part); return i >= 0 && !/[A-Za-z0-9]/.test(sentence[i - 1] || ' ') && !/[A-Za-z0-9]/.test(sentence[i + part.length] || ' '); };
const vocabWords = new Set(content.vocab.map((w) => w.en));

const scenarioIds = new Set(content.scenarios.map((s) => s.id));
const listed = content.stages.flatMap((s) => s.lessons);
for (const id of listed) if (!content.lessons[id]) err('curriculum', `lists unknown lesson "${id}"`);
for (const id of Object.keys(content.lessons)) if (!listed.includes(id)) err('curriculum', `lesson "${id}" is not in any stage`);
if (new Set(listed).size !== listed.length) err('curriculum', 'a lesson is listed twice');
for (const sc of content.scenarios) if (!Object.values(content.lessons).some((L) => L.scenario === sc.id)) err('scenarios', `"${sc.id}" has no lesson`);
for (const n of content.notes) warn('curriculum', n);
for (const st of content.stages) if (![1, 2, 3].includes(st.id)) err('curriculum', `stage id "${st.id}" (word levels and the app expect 1, 2, 3)`);
if (!content.essentials.length) err('curriculum', 'no essential first lessons (the first stage needs at least its first two lessons)');
for (const id of content.essentials) { if (!content.lessons[id]) err('curriculum', `essentials lists unknown lesson "${id}"`); else if (content.lessons[id].stage !== 1) err('curriculum', `essential lesson "${id}" must be in stage 1`); }
if (!content.essentials.some((id) => content.lessons[id] && content.lessons[id].scenario === 'emergency')) warn('curriculum', 'no emergency lesson among the essential first lessons');

for (const L of Object.values(content.lessons)) {
  const W = `lesson ${L.id}`;
  if (!scenarioIds.has(L.scenario)) err(W, `unknown scenario "${L.scenario}"`);
  isFa(`${W} title`, L.title.fa); isFa(`${W} intro`, L.intro, { allowLatin: true }); isFa(`${W} canDo`, L.canDo);
  if (L.note) isFa(`${W} note`, L.note, { allowLatin: true });
  if (L.phrases.length < 3 || L.phrases.length > 5) err(W, `has ${L.phrases.length} phrases (must be 3–5)`);
  if (!VOICES.includes(L.them.voice)) err(W, `bad voice "${L.them.voice}" (one of ${VOICES.join(', ')})`);
  if (!L.minutes || L.minutes < 4 || L.minutes > 12) err(W, 'minutes out of range');
  const seen = new Set();
  L.phrases.forEach((p, i) => {
    const P = `${W} phrase ${i + 1}`;
    isEn(P, p.en); isFa(P, p.fa); isFa(`${P} sound guide`, p.ph, { allowLatin: true }); isFa(`${P} note`, p.note, { allowLatin: true });
    if (seen.has(p.en)) err(P, 'duplicate phrase'); seen.add(p.en);
    if (!p.chunks || !p.chunks.length) err(P, 'no chunks');
    else if (p.chunks.join(' ') !== p.en) err(P, `chunks do not rebuild the phrase: "${p.chunks.join(' | ')}"`);
    if (wordsOf(p.en).length > 12) warn(P, 'long phrase (over 12 words)');
    if (!VOICES.includes(p.voice)) err(P, `bad voice "${p.voice}"`);
    // "own": the learner's own details in this sentence — every entry must be words of the sentence itself
    for (const o of p.own || []) if (!hasWords(p.en, o)) err(P, `"own" names "${o}", which is not a word of "${p.en}"`);
    if (p.own && new Set(p.own).size !== p.own.length) err(P, '"own" names a word twice');
  });
  if (L.mission) { isFa(`${W} mission`, L.mission, { allowLatin: true }); if (L.mission.length > 220) warn(W, 'long mission (one short sentence is meant)'); }
  else warn(W, 'no mission (the small real-life task shown when the lesson is finished)');
  if (L.variants) {
    const lines = [...L.dialogue.lines.map((l) => l.en), L.respond.them.en, ...L.phrases.map((p) => p.en)];
    const seenV = new Set();
    L.variants.forEach((v, i) => {
      const V = `${W} variant ${i + 1}`;
      isEn(V, v.en); isFa(V, v.fa, { allowLatin: true });
      if (typeof v.like !== 'string' || !v.like.trim()) err(V, '"like" is missing: the line of the lesson this is another wording of');
      else if (!lines.some((x) => x.includes(v.like.replace(/[.?!]$/, '')))) warn(V, `"like" is not a line of this lesson: "${v.like}"`);
      if (v.like === v.en) err(V, 'the variant is the same sentence as "like"');
      if (seenV.has(v.en)) err(V, 'duplicate variant'); seenV.add(v.en);
      if (!VOICES.includes(v.voice)) err(V, `bad voice "${v.voice}"`);
    });
    if (L.variants.length > 4) warn(W, `${L.variants.length} variants (2–3 are meant)`);
  }
  if (L.grid) {
    if (L.grid.title) isFa(`${W} grid title`, L.grid.title, { allowLatin: true }); else err(W, 'grid has no title');
    if (L.grid.note) isFa(`${W} grid note`, L.grid.note, { allowLatin: true });
    for (const w of L.grid.words) if (!vocabWords.has(w)) err(W, `grid names "${w}", which is not a headword in vocabulary.json`);
    if (new Set(L.grid.words).size !== L.grid.words.length) err(W, 'grid names a word twice');
  }
  if (L.dialogue.lines.length < 4 || L.dialogue.lines.length > 9) err(W, `dialogue has ${L.dialogue.lines.length} lines`);
  isFa(`${W} dialogue setting`, L.dialogue.setting);
  L.dialogue.lines.forEach((l, i) => { if (!['you', 'them'].includes(l.who)) err(W, `dialogue line ${i + 1}: bad speaker`); isEn(`${W} dialogue ${i + 1}`, l.en); isFa(`${W} dialogue ${i + 1}`, l.fa, { allowLatin: true }); });
  const said = L.dialogue.lines.filter((l) => l.who === 'you').map((l) => l.en).join(' ');
  const used = L.phrases.filter((p) => said.includes(p.en.replace(/[.?!]$/, '')) || L.dialogue.lines.some((l) => l.en.includes(p.en.replace(/[.?!]$/, '')))).length;
  if (used < 2) warn(W, `dialogue uses only ${used} of the taught phrases`);
  isEn(`${W} respond`, L.respond.them.en); isFa(`${W} respond`, L.respond.them.fa, { allowLatin: true }); isFa(`${W} respond setting`, L.respond.setting);
  if (L.respond.ok.length < 1) err(W, 'respond needs at least one good answer');
  if (L.respond.ok.length < 2) warn(W, 'respond accepts only one answer');
  [...L.respond.ok, L.respond.off].forEach((o, i) => { isEn(`${W} respond option ${i + 1}`, o.en); isFa(`${W} respond option ${i + 1}`, o.fa, { allowLatin: true }); });
  isFa(`${W} respond feedback`, L.respond.off.why, { allowLatin: true });
  if (L.respond.ok.some((o) => o.en === L.respond.off.en)) err(W, 'the same sentence is both a good and a poor answer');
  if (L.task.length < 1) err(W, 'no real-world task');
  if (partnerLines(L).length < 3) warn(W, 'the other person has fewer than three different lines in the dialogue, so the lesson gets no "what did they say?" question');
  L.task.forEach((t, i) => { isFa(`${W} task ${i + 1}`, t.fa); if (!L.phrases.some((p) => p.id === t.answer)) err(W, `task ${i + 1} points at a missing phrase`); });
  if (new Set(L.task.map((t) => t.answer)).size !== L.task.length) warn(W, 'two tasks have the same answer');
  if (L.grammar) {
    const G = L.grammar;
    isFa(`${W} grammar explain`, G.explain, { allowLatin: true }); isFa(`${W} grammar why`, G.why, { allowLatin: true });
    if (G.examples.length < 2 || G.examples.length > 3) err(W, 'grammar needs 2–3 examples');
    G.examples.forEach((e, i) => { isEn(`${W} grammar example ${i + 1}`, e.en); isFa(`${W} grammar example ${i + 1}`, e.fa, { allowLatin: true }); });
    isEn(`${W} grammar right`, G.right);
    if (!G.wrong || G.wrong === G.right) err(W, 'grammar comparison is missing or identical');
  } else warn(W, 'no grammar tip');
  if (!L.review || !L.review.status) err(W, 'no review record');
}

const rpIds = new Set();
for (const R of content.roleplays) {
  const W = `conversation ${R.id}`;
  if (rpIds.has(R.id)) err(W, 'duplicate id'); rpIds.add(R.id);
  if (!scenarioIds.has(R.scenario)) err(W, `unknown scenario "${R.scenario}"`);
  isFa(`${W} title`, R.title); isFa(`${W} setting`, R.setting); isFa(`${W} goal`, R.goal);
  if (!R.scripted && !(R.them.persona && R.them.persona.length > 10)) err(W, 'no persona for the AI partner');
  if (!VOICES.includes(R.them.voice)) err(W, `bad voice "${R.them.voice}" (one of ${VOICES.join(', ')})`);
  if (R.turns.length < 3 || R.turns.length > 7) err(W, `has ${R.turns.length} turns`);
  R.turns.forEach((t, i) => {
    isEn(`${W} turn ${i + 1}`, t.them.en); isFa(`${W} turn ${i + 1}`, t.them.fa, { allowLatin: true });
    if (!t.replies.length) err(W, `turn ${i + 1} has no replies`);
    if (t.check) isCheck(`${W} turn ${i + 1} check`, t.check);
    t.replies.forEach((r) => { if (r.thenCheck) isCheck(`${W} turn ${i + 1} reply "${r.en}" thenCheck`, r.thenCheck); });
    t.replies.forEach((r) => { isEn(`${W} turn ${i + 1} reply`, r.en); isFa(`${W} turn ${i + 1} reply`, r.fa, { allowLatin: true }); if (!r.keys.length) warn(W, `turn ${i + 1} reply has no key words: "${r.en}"`); if (r.then) { isEn(`${W} turn ${i + 1} follow-up`, r.then.en); isFa(`${W} turn ${i + 1} follow-up`, r.then.fa, { allowLatin: true }); } });
  });
}
for (const sc of content.scenarios) if (!content.roleplays.some((r) => r.scenario === sc.id)) warn('scenarios', `"${sc.id}" has no conversation practice`);
// practice: lesson id -> the conversation(s) offered at the end of that lesson (one id, or a list with the main one first)
for (const [lid, list] of Object.entries(content.practiceAll)) {
  if (!content.lessons[lid]) err('curriculum practice', `unknown lesson "${lid}"`);
  for (const rid of list) if (!rpIds.has(rid)) err('curriculum practice', `lesson "${lid}" points at unknown conversation "${rid}"`);
}
// numbersAfter: lessons that offer «شنیدن عددها» when they are finished; mine: lessons that build the learner's own sentences
for (const id of content.numbersAfter) if (!content.lessons[id]) err('curriculum numbersAfter', `unknown lesson "${id}"`);
if (content.numbersAfter.length && !content.numbers.length) err('curriculum numbersAfter', 'there are no number-listening items (numbers.json)');
for (const [lid, kinds] of Object.entries(content.mine)) {
  if (!content.lessons[lid]) err('curriculum mine', `unknown lesson "${lid}"`);
  for (const k of kinds) if (!OWN_KINDS.includes(k)) err('curriculum mine', `lesson "${lid}": unknown kind "${k}" (one of ${OWN_KINDS.join(', ')})`);
}
for (const R of content.roleplays) if (![1, 2, 3].includes(R.stage)) err(`conversation ${R.id}`, `bad stage "${R.stage}"`);

const cats = new Set(content.vocabCats.map((c) => c.id)), wordSeen = new Set();
content.vocab.forEach((w) => {
  const W = `word "${w.en}"`;
  if (!cats.has(w.cat)) err(W, `unknown category "${w.cat}"`);
  // one spelling may be two entries only in two different groups (the word "I" and the letter "I"); they share one recording
  if (wordSeen.has(w.en + '|' + w.cat)) err(W, `duplicate in group "${w.cat}"`); wordSeen.add(w.en + '|' + w.cat);
  if (FA.test(w.en)) err(W, 'Farsi in English'); isFa(W, w.fa, { allowLatin: true }); isFa(`${W} sound guide`, w.ph);
  if (!w.ex) warn(W, 'no example'); else { isEn(`${W} example`, w.ex.en); isFa(`${W} example`, w.ex.fa, { allowLatin: true }); if (!w.ex.en.toLowerCase().includes(w.en.toLowerCase().split(' ')[0].slice(0, 4))) warn(W, `example does not use the word: "${w.ex.en}"`); }
  if (![1, 2, 3].includes(w.level)) err(W, 'bad level');
});
for (const c of content.vocabCats) if (!content.vocab.some((w) => w.cat === c.id)) err('vocabulary', `category "${c.id}" is empty`);
// review-order.json: which word groups follow which lesson
{
  const placed = new Set();
  for (const [lid, groups] of Object.entries(content.wordsAfter)) {
    if (!content.lessons[lid]) err('review order', `unknown lesson "${lid}"`);
    if (!Array.isArray(groups)) { err('review order', `"${lid}" must list word groups`); continue; }
    for (const g of groups) { if (!cats.has(g)) err('review order', `"${lid}" lists unknown word group "${g}"`); if (placed.has(g)) err('review order', `word group "${g}" is listed twice`); placed.add(g); }
  }
  // the first words: real words, each once, all of level 1 (they are shown to every learner from the first day)
  const firstSeen = new Set();
  for (const id of content.wordsFirst) {
    const w = content.vocab.find((x) => x.id === id);
    if (firstSeen.has(id)) err('review order', `"first" names "${w.en}" twice`); firstSeen.add(id);
    if (w.level !== 1) err('review order', `"first" names "${w.en}", which is a level ${w.level} word`);
    if (content.wordsSpread.includes(w.cat)) err('review order', `"first" names "${w.en}", which belongs to a spread group`);
  }
  if (content.wordsFirst.length % 6) warn('review order', `"first" has ${content.wordsFirst.length} words: not whole days of six`);
  for (const g of content.wordsSpread) { if (!cats.has(g)) err('review order', `"spread" lists unknown word group "${g}"`); else if (!placed.has(g)) err('review order', `spread group "${g}" follows no lesson`); }
}
// numbers.json: listening practice for prices, times, dates, phone numbers
{
  const KINDS = ['price', 'time', 'date', 'phone', 'number'], said = new Set();
  const N = content.numbers;
  if (N.length && (N.length < 30 || N.length > 250)) warn('numbers', `${N.length} items (between 30 and 250 expected)`);
  N.forEach((n, i) => {
    const W = `numbers item ${i + 1}`;
    isEn(W, n.say); isFa(W, n.fa);
    if (/\d/.test(n.say || '')) err(W, `write numbers as words in "say" so the voice reads them reliably: "${n.say}"`);
    if (said.has(n.say)) err(W, 'duplicate sentence'); said.add(n.say);
    if (!KINDS.includes(n.kind)) err(W, `unknown kind "${n.kind}"`);
    if (!VOICES.includes(n.voice)) err(W, 'bad voice');
    const opts = [n.show, ...(Array.isArray(n.alts) ? n.alts : [])];
    if (typeof n.show !== 'string' || !/\d/.test(n.show)) err(W, '"show" must be the number in digits');
    if (!Array.isArray(n.alts) || n.alts.length < 2 || n.alts.length > 3) err(W, 'needs 2–3 wrong answers in "alts"');
    if (new Set(opts).size !== opts.length) err(W, 'an answer appears twice');
    for (const o of opts) { if (typeof o !== 'string' || FA.test(o) || /[۰-۹]/.test(o)) err(W, `answers are written with Latin digits: "${o}"`); if (n.kind === 'phone' && !/^555-01\d\d$/.test(o)) err(W, `practice phone numbers must be 555-01xx: "${o}"`); }
  });
  for (const k of KINDS) if (N.length && !N.some((n) => n.kind === k)) warn('numbers', `no item of kind "${k}"`);
}

// papers.json (optional): «خواندن نوشته‌ها» — a realistic piece of paper or screen, and questions answered by tapping a line
{
  const KINDS = ['reminder', 'label', 'bill', 'letter', 'sign', 'receipt', 'form'], ids = new Set();
  for (const P of content.papers) {
    const W = `paper ${P.id}`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(P.id)) err(W, 'the id must be lower-case letters, digits and hyphens (it is part of the address of its screen)');
    if (ids.has(P.id)) err(W, 'duplicate id'); ids.add(P.id);
    isFa(`${W} title`, P.title, { allowLatin: true });
    if (!KINDS.includes(P.kind)) err(W, `unknown kind "${P.kind}" (one of ${KINDS.join(', ')})`);
    if (![1, 2, 3].includes(P.stage)) err(W, `bad stage "${P.stage}"`);
    if (P.lesson != null && !content.lessons[P.lesson]) err(W, `belongs with unknown lesson "${P.lesson}"`);
    if (P.note) isFa(`${W} note`, P.note, { allowLatin: true });
    if (P.lines.length < 2) err(W, `has ${P.lines.length} lines`); else if (P.lines.length > 12) warn(W, `${P.lines.length} lines (6–10 short lines are meant)`);
    P.lines.forEach((l, i) => {
      const Ln = `${W} line ${i + 1}`;
      if (typeof l.en !== 'string' || !l.en.trim()) err(Ln, 'missing English text'); else { if (FA.test(l.en)) err(Ln, `Farsi letters in English text: "${l.en}"`); if (/\s{2,}|^\s|\s$/.test(l.en)) err(Ln, `stray spaces: "${l.en}"`); }
      isFa(Ln, l.fa, { allowLatin: true });
    });
    if (!P.questions.length) err(W, 'no question'); else if (P.questions.length > 4) warn(W, `${P.questions.length} questions (2–3 are meant)`);
    const asked = new Set();
    P.questions.forEach((q, i) => {
      const Q = `${W} question ${i + 1}`;
      isFa(Q, q.fa, { allowLatin: true });
      if (!Number.isInteger(q.line) || q.line < 1 || q.line > P.lines.length) err(Q, `"line" must be the number of one of the ${P.lines.length} lines, counted from 1 (got ${JSON.stringify(q.line)})`);
      if (asked.has(q.line)) warn(Q, 'two questions have the same line as their answer'); asked.add(q.line);
    });
  }
}

const patIds = new Set();
for (const P of content.patterns) {
  const W = `pattern ${P.id}`;
  if (patIds.has(P.id)) err(W, 'duplicate id'); patIds.add(P.id);
  if (!content.lessons[P.lesson]) err(W, `unknown lesson "${P.lesson}"`);
  // "opensAfter": an earlier lesson that already teaches a sentence of this frame; the builder opens the pattern after it
  if (P.opensAfter != null) { if (!content.lessons[P.opensAfter]) err(W, `opensAfter names unknown lesson "${P.opensAfter}"`); else if (listed.indexOf(P.opensAfter) >= listed.indexOf(P.lesson)) err(W, `opensAfter "${P.opensAfter}" must come before the pattern's own lesson "${P.lesson}" in the path`); }
  isFa(`${W} description`, P.fa, { allowLatin: true });
  if (P.items.length < 4) err(W, 'needs at least 4 sentences');
  P.items.forEach((it, i) => { isEn(`${W} item ${i + 1}`, it.en); isFa(`${W} item ${i + 1}`, it.fa); if (wordsOf(it.en).length > 8) warn(W, `long sentence for tiles: "${it.en}"`); });
}
content.emergency.phrases.forEach((p, i) => { isEn(`emergency ${i + 1}`, p.en.replace('…', 'x.')); isFa(`emergency ${i + 1}`, p.fa); isFa(`emergency ${i + 1} sound guide`, p.ph); });
content.emergency.tips.forEach((t, i) => isFa(`emergency tip ${i + 1}`, t, { allowLatin: true }));
for (const r of content.corrections) { try { new RegExp(r.match, 'i'); } catch { err(`correction ${r.id}`, 'bad pattern'); } isFa(`correction ${r.id}`, r.why, { allowLatin: true }); }

// every interface string the code asks for exists, and none is unused
const strings = content.ui.strings;
const srcDir = path.join(ROOT, 'src', 'js');
const code = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) code.push(fs.readFileSync(p, 'utf8')); } };
walk(srcDir);
const all = code.join('\n');
const used = new Set([...all.matchAll(/\bt\('([A-Za-z0-9_.]+)'/g)].map((m) => m[1]));
for (const m of all.matchAll(/para\('([A-Za-z0-9_.]+)'\)/g)) used.add(m[1]);
const prefixes = [...used].filter((k) => k.endsWith('.'));
for (const k of used) if (!k.endsWith('.') && strings[k] == null) err('interface text', `missing "${k}"`);
for (const k of ['say.good.title', 'say.good.almost', 'say.close.title']) if (strings[k] == null) err('interface text', `missing "${k}"`);
for (const p of prefixes) if (!Object.keys(strings).some((k) => k.startsWith(p))) err('interface text', `nothing under "${p}"`);
for (const k of Object.keys(strings)) { isFa(`interface text ${k}`, strings[k], { allowLatin: true }); if (!used.has(k) && !prefixes.some((p) => k.startsWith(p)) && !['say.good.title', 'say.good.almost', 'say.close.title'].includes(k)) warn('interface text', `"${k}" is never used`); }

const reqs = audioRequests(content);
if (process.argv.includes('--audio')) {
  const idxFile = path.join(ROOT, 'site', 'audio', 'index.json');
  if (!fs.existsSync(idxFile)) err('audio', 'site/audio/index.json is missing — run the audio steps');
  else { const idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')); const miss = reqs.filter((r) => !idx.clips[r.key]); if (miss.length) err('audio', `${miss.length} clips have no recording, e.g. "${miss[0].text}"`); }
}

const lessons = Object.values(content.lessons);
console.log(`lessons ${lessons.length} · phrases ${lessons.reduce((s, L) => s + L.phrases.length, 0)} · conversations ${content.roleplays.length} · patterns ${content.patterns.length} (${content.patterns.reduce((s, P) => s + P.items.length, 0)} sentences) · words ${content.vocab.length} · number-listening items ${content.numbers.length} · emergency phrases ${content.emergency.phrases.length} · interface strings ${Object.keys(strings).length} · audio clips ${reqs.length}`);
for (const w of warnings) console.log('  warning  ' + w);
for (const e of errors) console.log('  ERROR    ' + e);
console.log(`${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
