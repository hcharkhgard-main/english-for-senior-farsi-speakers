// The files a human reviewer works from (review/) must be the export of today's content.
// A stale copy means a reviewer signs off text that is no longer in the app and never sees what was added.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildReview, staleReview, REVIEW_CSV, REVIEW_SAFETY } from '../../tools/export-review.mjs';
import { loadContent } from '../../tools/content.mjs';

const HOW = 'run: npm run review:export   (then commit the two files in review/)';
const content = loadContent();
const built = buildReview(content);

test('review/safety-critical.md is the export of today\'s content (run "npm run review:export" if this fails)', () => {
  assert.ok(fs.existsSync(REVIEW_SAFETY), `review/safety-critical.md is missing — ${HOW}`);
  assert.ok(fs.readFileSync(REVIEW_SAFETY, 'utf8') === built.md, `review/safety-critical.md is out of date: a safety-critical lesson, conversation or paper was added, removed or its note changed — ${HOW}`);
});

test('review/content-review.csv is the export of today\'s content (run "npm run review:export" if this fails)', () => {
  assert.ok(fs.existsSync(REVIEW_CSV), `review/content-review.csv is missing — ${HOW}`);
  assert.ok(fs.readFileSync(REVIEW_CSV, 'utf8') === built.csv, `review/content-review.csv is out of date: some text in content/ changed since the last export — ${HOW}`);
});

test('the safety list names every flagged lesson, conversation and paper, and nothing else', () => {
  const flagged = [
    ...Object.values(content.lessons).filter((L) => L.safetyCritical).map((L) => `(\`content/lessons/${L.file}\`)`),
    ...content.roleplays.filter((R) => R.safetyCritical).map((R) => `Conversation **${R.id}**`),
    ...(content.papers || []).filter((P) => P.safetyCritical).map((P) => `Paper **${P.id}**`),
  ];
  for (const f of flagged) assert.ok(built.md.includes(f), `missing from the safety list: ${f}`);
  const listed = built.md.split('\n').filter((l) => /^- (Lesson|Conversation|Paper) \*\*/.test(l)).length;
  assert.equal(listed, flagged.length, 'the safety list has an entry that is not flagged in content/');
});

test('the spreadsheet has a row for every sentence a learner can be shown in a lesson, a conversation or a paper', () => {
  const cells = new Set(built.csv.split('\r\n').flatMap((line) => line.slice(1, -1).split('","')));
  const want = [];
  for (const L of Object.values(content.lessons)) { for (const p of L.phrases) want.push(p.en); for (const l of L.dialogue.lines) want.push(l.en); for (const v of L.variants || []) want.push(v.en); if (L.mission) want.push(L.mission); }
  for (const R of content.roleplays) for (const t of R.turns) { want.push(t.them.en); for (const r of t.replies) { want.push(r.en); if (r.then) want.push(r.then.en); } }
  for (const P of content.papers || []) { for (const l of P.lines) want.push(l.en); for (const q of P.questions) want.push(q.fa); }
  const missing = want.filter((x) => typeof x === 'string' && x && !cells.has(x.replace(/"/g, '""')));
  assert.deepEqual(missing.slice(0, 5), [], `${missing.length} sentences have no row in the spreadsheet`);
});

test('staleReview() notices a changed file', () => {
  assert.deepEqual(staleReview({ csv: built.csv + 'x', md: built.md + 'x' }), ['review/content-review.csv', 'review/safety-critical.md']);
});
