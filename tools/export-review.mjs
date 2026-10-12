// Writes the two files a human reviewer works from:
//   review/content-review.csv   every English sentence with its Farsi, sound guide and location, so a
//                               Farsi-speaking English teacher can check it in a spreadsheet;
//   review/safety-critical.md   the items that need a factual check as well.
//
// Both are made from content/ only, so they must be made again whenever content changes — a reviewer
// who works from an old copy signs off text that is no longer in the app:
//     npm run review:export                      (or: node tools/export-review.mjs)
//     node tools/export-review.mjs --check       exits 1 if either file is missing or out of date
// `npm test` fails while either file is out of date (tests/unit/review.test.js).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadContent, ROOT } from './content.mjs';

export const REVIEW_CSV = path.join(ROOT, 'review', 'content-review.csv');
export const REVIEW_SAFETY = path.join(ROOT, 'review', 'safety-critical.md');

// The text of both files, from the content as it is now. Nothing is written.
export function buildReview(c = loadContent()) {
  const rows = [['where', 'kind', 'safety_critical', 'english', 'farsi', 'farsi_sound_guide', 'farsi_note', 'ok? (y/n)', 'correction']];
  const add = (where, kind, safety, en, fa, ph = '', note = '') => rows.push([where, kind, safety ? 'yes' : '', en || '', fa || '', ph || '', note || '', '', '']);
  const checkRow = (W, kind, S, line, k) => add(W, kind, S, line.en, k.q || '(چه گفت؟)', '', `درست: ${k.right} | نادرست: ${k.wrong.join(' | ')}`);

  // lessons in the order the learner meets them; a lesson that no stage lists yet still gets reviewed
  const inStages = c.stages.flatMap((s) => s.lessons).filter((id) => c.lessons[id]);
  const lessonIds = [...inStages, ...Object.keys(c.lessons).filter((id) => !inStages.includes(id))];
  for (const id of lessonIds) {
    const L = c.lessons[id], W = `lesson/${L.file}`, S = !!L.safetyCritical;
    add(W, 'title', S, L.title.en, L.title.fa); add(W, 'intro', S, '', L.intro); if (L.note) add(W, 'note', S, '', L.note); add(W, 'can-do', S, '', L.canDo);
    if (L.mission) add(W, 'mission (to try in real life)', S, '', L.mission);
    L.phrases.forEach((p) => add(W, p.own ? `phrase (the learner's own: ${p.own.join(', ')})` : 'phrase', S, p.en, p.fa, p.ph, p.note));
    if (L.grid) add(W, 'word grid', S, L.grid.words.join(', '), L.grid.title, '', L.grid.note);
    add(W, 'dialogue setting', S, '', L.dialogue.setting);
    L.dialogue.lines.forEach((l) => add(W, `dialogue (${l.who})`, S, l.en, l.fa));
    (L.variants || []).forEach((v) => add(W, 'other wording heard', S, v.en, v.fa, '', `like: ${v.like || ''}`));
    add(W, 'respond: prompt', S, L.respond.them.en, L.respond.them.fa, '', L.respond.setting);
    L.respond.ok.forEach((o) => add(W, 'respond: good answer', S, o.en, o.fa));
    add(W, 'respond: poor answer', S, L.respond.off.en, L.respond.off.fa, '', L.respond.off.why);
    L.task.forEach((t) => add(W, 'task', S, (L.phrases.find((p) => p.id === t.answer) || {}).en, t.fa));
    if (L.grammar) { add(W, 'grammar', S, L.grammar.title, L.grammar.explain, '', L.grammar.why); L.grammar.examples.forEach((e) => add(W, 'grammar example', S, e.en, e.fa)); add(W, 'grammar: wrong → right', S, `${L.grammar.wrong} → ${L.grammar.right}`, ''); }
  }
  for (const R of c.roleplays) {
    const W = `conversation/${R.id}`, S = !!R.safetyCritical;
    add(W, 'title', S, '', R.title, '', `${R.setting} | ${R.goal}${R.note ? ' | ' + R.note : ''}`);
    R.turns.forEach((t, i) => {
      add(W, `turn ${i + 1}: partner`, S, t.them.en, t.them.fa);
      if (t.check) checkRow(W, `turn ${i + 1}: understanding check`, S, t.them, t.check);
      t.replies.forEach((r) => {
        add(W, `turn ${i + 1}: reply`, S, r.en, r.fa);
        if (r.then) add(W, `turn ${i + 1}: follow-up`, S, r.then.en, r.then.fa);
        if (r.then && r.thenCheck) checkRow(W, `turn ${i + 1}: understanding check (follow-up)`, S, r.then, r.thenCheck);
      });
    });
  }
  for (const P of c.papers || []) {
    const W = `paper/${P.id}`, S = !!P.safetyCritical;
    add(W, `title (${P.kind}, stage ${P.stage}${P.lesson ? ', with lesson ' + P.lesson : ''})`, S, '', P.title, '', P.note);
    P.lines.forEach((l, i) => add(W, `line ${i + 1}${l.strong ? ' (large)' : ''}`, S, l.en, l.fa));
    P.questions.forEach((q, i) => add(W, `question ${i + 1} → answer: line ${q.line}`, S, (P.lines[q.line - 1] || {}).en, q.fa));
  }
  for (const P of c.patterns) P.items.forEach((it) => add(`pattern/${P.id}`, 'built sentence', false, it.en, it.fa, '', P.frame));
  c.vocab.forEach((w) => { add(`word/${w.cat}`, 'word', false, w.en, w.fa, w.ph); if (w.ex) add(`word/${w.cat}`, 'example', false, w.ex.en, w.ex.fa); });
  c.numbers.forEach((n) => add('numbers', `${n.kind}: ${[n.show, ...n.alts].join(' / ')}`, false, n.say, n.fa));
  c.emergency.phrases.forEach((p) => add('emergency', 'phrase', true, p.en, p.fa, p.ph));
  c.emergency.tips.forEach((t) => add('emergency', 'tip', true, '', t));
  c.corrections.forEach((r) => add('corrections', r.id, false, r.fix, r.why));
  c.soundTips.forEach((r) => add('sound tips', r.id, false, r.title, r.fa));
  Object.entries(c.ui.strings).forEach(([k, v]) => add('interface', k, /sos|mic|ai\.|privacy|about/.test(k), '', v));
  const csv = '﻿' + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');

  // ---- the safety list: every flagged lesson, conversation and paper, with the note the learner is shown ----
  const lessons = lessonIds.map((id) => c.lessons[id]).filter((L) => L.safetyCritical)
    .map((L) => `- Lesson **${L.title.en}** (\`content/lessons/${L.file}\`) — ${L.note || '(no note)'}`);
  const talks = c.roleplays.filter((R) => R.safetyCritical).map((R) => `- Conversation **${R.id}** (${R.title}) — ${R.note || '(no note)'}`);
  const papers = (c.papers || []).filter((P) => P.safetyCritical).map((P) => `- Paper **${P.id}** (${P.title}) — ${P.note || '(no note)'}`);
  const md = `# Items that need a factual and instructional review

This file is generated (\`npm run review:export\`). Do not edit it by hand; \`npm test\` fails when it no longer matches \`content/\`.

These teach language for emergencies, money, police, immigration, health or personal details. Before a public pilot, each needs sign-off from (1) a native Farsi-speaking English teacher and (2) someone who can confirm the facts stated in the notes. The full text of every item is in \`review/content-review.csv\` (column \`safety_critical\` = yes).

## Lessons (${lessons.length})

${lessons.join('\n')}

## Conversations (${talks.length})

${talks.join('\n')}
${papers.length ? `\n## Papers to read (${papers.length})\n\n${papers.join('\n')}\n` : ''}
## Always

- **Emergency phrases and tips** (\`content/emergency.json\`)
- **AI partner rules** (\`src/js/ai-prompt.js\`)
`;
  return { csv, md, rows: rows.length - 1, critical: lessons.length + talks.length + papers.length + 2 };
}

// What is out of date: [] when both files match the content.
export function staleReview(built = buildReview()) {
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
  const out = [];
  if (read(REVIEW_CSV) !== built.csv) out.push('review/content-review.csv');
  if (read(REVIEW_SAFETY) !== built.md) out.push('review/safety-critical.md');
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const built = buildReview();
  if (process.argv.includes('--check')) {
    const stale = staleReview(built);
    if (stale.length) { console.error(`${stale.join(' and ')} ${stale.length > 1 ? 'are' : 'is'} missing or out of date. Run: npm run review:export`); process.exit(1); }
    console.log('review/content-review.csv and review/safety-critical.md are up to date.');
  } else {
    fs.mkdirSync(path.dirname(REVIEW_CSV), { recursive: true });
    fs.writeFileSync(REVIEW_CSV, built.csv);
    fs.writeFileSync(REVIEW_SAFETY, built.md);
    console.log(`review/content-review.csv: ${built.rows} rows · safety-critical items: ${built.critical}`);
  }
}
