// What the conversation partner does with a spoken answer, checked against the real conversations
// (content/roleplays*.json). Two kinds of check:
//
//  1. the table in replies.table.js — for every turn, utterances a learner might say and what must happen;
//  2. rules that hold on every turn, whatever the content says:
//     · a reply selects itself, however the recogniser writes it;
//     · a request for help with understanding ("I don't understand", "Again, please", "What?", "Please speak
//       slowly" …) is never an answer: the partner repeats, or the turn's own such reply is chosen;
//     · the opposite of a reply never selects that reply;
//     · a short answer ("Yes", "No, thank you", "I don't know" …) selects a reply only where the table says so.
//
// When a conversation is edited, the table for that turn must be read again; the test says which one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../../tools/content.mjs';
import { pickReply, repairKind, saysUnknown, tokens } from '../../src/js/match.js';
import { TABLE, ASKS, SHORT } from './replies.table.js';

const C = loadContent();
const turns = C.roleplays.flatMap((R) => R.turns.map((t, i) => ({ R, t, n: i + 1, where: `${R.id} T${i + 1} «${t.them.en}»` })));
const pick = (t, said) => pickReply(t.replies, said, t.open, t.them.en);
const outcome = (k) => (k.verdict === 'match' ? 'r' + (k.index + 1) : k.verdict);
const same = (a, b) => tokens(a).join(' ') === tokens(b).join(' ');
const tally = { utterances: 0, reply: 0, repeat: 0, own: 0, unsure: 0 };
const count = (o) => { tally.utterances++; tally[/^r\d/.test(o) ? 'reply' : o]++; };
const listed = (e, said) => Object.entries(e).find(([k, l]) => /^(r\d+|own|unsure|repeat)$/.test(k) && l.some((x) => same(x, said)));

test('the table is about the conversations as they are now', () => {
  for (const { R, t, n, where } of turns) {
    const e = (TABLE[R.id] || {})[n];
    assert.ok(e, `${where}: no table for this turn in tests/unit/replies.table.js — add one`);
    const now = pick && Object.keys(e).filter((k) => /^(r\d+|own|unsure|repeat)$/.test(k)).flatMap((k) => e[k].map((u) => `${outcome(pick(t, u))}: ${u}`)).join('\n    ');
    const stale = `${where}: this turn has changed since its table was written. Read the turn again, correct the lists in tests/unit/replies.table.js and copy the new text there. What happens now:\n    ${now}`;
    assert.equal(e.them, t.them.en, stale);
    assert.deepEqual(e.replies, t.replies.map((r) => r.en), stale);
    assert.equal(!!e.open, !!t.open, stale);
  }
  for (const id of Object.keys(TABLE)) assert.ok(C.roleplays.some((R) => R.id === id), `table for a conversation that no longer exists: ${id}`);
});

test('every utterance of the table has the outcome written there', () => {
  const wrong = [];
  for (const { R, t, n, where } of turns) {
    const e = TABLE[R.id][n];
    for (const [want, list] of Object.entries(e)) {
      if (!/^(r\d+|own|unsure|repeat)$/.test(want)) continue;
      assert.ok(want !== 'own' || t.open, `${where}: "own" is only possible on an open turn`);
      for (const said of list) { const got = outcome(pick(t, said)); count(got); if (got !== want) wrong.push(`${where}\n      "${said}" → ${got}${/^r/.test(got) ? ' «' + t.replies[+got.slice(1) - 1].en + '»' : ''}, the table says ${want}`); }
    }
  }
  assert.deepEqual(wrong, [], `\n  ${wrong.join('\n  ')}\n`);
});

test('a reply selects itself, however it is written', () => {
  const spell = (s) => s.replace(/\bI'm\b/g, 'I am').replace(/\b(\w+)n't\b/g, (m, v) => (v === 'ca' ? 'can not' : v === 'wo' ? 'will not' : v + ' not')).replace(/\bI'd\b/g, 'I would').replace(/\bI'll\b/g, 'I will')
    .replace(/\b(it|that|he|she|what|there|here)'s\b/gi, '$1 is').replace(/\b(we|you|they)'re\b/gi, '$1 are');
  for (const { t, where } of turns) t.replies.forEach((r, i) => {
    for (const said of [r.en, r.en.toLowerCase().replace(/[.,!?]/g, ''), spell(r.en)]) { const got = outcome(pick(t, said)); count(got); assert.equal(got, 'r' + (i + 1), `${where}: "${said}"`); }
  });
});

// A reply that is itself a request for help ("Could you say that again, please?"). "Please slow down." (said to a
// taxi driver) counts here too: it is what "Too fast" should select in that taxi.
const asksToo = (r) => !!repairKind(r.en);
const REQUESTS = ['rp-myinfo 6.2', 'rp-incoming 4.2', 'rp-insurance 4.2', 'rp-landlord 4.2', 'rp-rideshare 4.2', 'rp-delivery 4.2', 'rp-delivery-call 3.2', 'rp-maintenance 3.3', 'rp-tailor 2.2', 'rp-bridal 3.2', 'rp-groom 2.3',
  'rp-unhappy-customer 1.3', 'rp-airport 3.3', 'rp-traffic 2.2', 'rp-traffic 3.2', 'rp-support 3.2', 'rp-taxi 4.1', 'rp-directions 3.1', 'rp-emergency 3.6', 'rp-office 1.1',
  'rp-benefits 1.1', 'rp-benefits 1.3', 'rp-benefits 2.2'];   // 1.1 asks what a letter means; 1.3 "My English is not good."; 2.2 "What does that mean?"

test('the replies that are themselves requests for help are the ones we know', () => {
  const found = turns.flatMap(({ R, t, n }) => t.replies.map((r, i) => (asksToo(r) ? `${R.id} ${n}.${i + 1}` : null)).filter(Boolean));
  assert.deepEqual(found.sort(), [...REQUESTS].sort(), 'a reply was added, removed or changed that reads as a request to repeat / speak slowly / interpret: check it and update REQUESTS');
});

test('H1 — "I don\'t understand", "Again, please", "What?", "Please speak slowly" … are never taken as an answer, on any turn', () => {
  const wrong = [];
  for (const { R, t, n, where } of turns) for (const [kind, list] of Object.entries(ASKS)) for (const said of list) {
    const k = pick(t, said), got = outcome(k);
    count(got);
    const e = listed(TABLE[R.id][n], said);
    if (e) { if (e[0] !== got) wrong.push(`${where}: "${said}" → ${got}, the table says ${e[0]}`); continue; }
    if (got === 'repeat') { if (!k.repair || (kind !== 'again' && !k.slow)) wrong.push(`${where}: "${said}" → repeat, but not slowly (${JSON.stringify(k)})`); continue; }
    if (k.verdict === 'match' && asksToo(t.replies[k.index])) continue;                // the turn's own request
    wrong.push(`${where}: "${said}" (${kind}) → ${got}${k.verdict === 'match' ? ' «' + t.replies[k.index].en + '»' : ''}`);
  }
  assert.deepEqual(wrong, [], `\n  ${wrong.slice(0, 60).join('\n  ')}\n  (${wrong.length} in all)`);
});

test('H1 — in the 911 practice, at customs and in the emergency room, asking again never moves the conversation on', () => {
  for (const id of ['rp-emergency', 'rp-airport', 'rp-er', 'rp-clinic', 'rp-pharmacy', 'rp-medicine', 'rp-bill', 'rp-traffic']) {
    const R = C.roleplays.find((x) => x.id === id);
    R.turns.forEach((t, i) => {
      for (const said of ["I don't understand", 'I do not understand', 'Again, please', 'Can you repeat that?', 'What?', 'Sorry?', 'Pardon?', 'Slowly, please', "I don't know what that means"]) {
        const k = pick(t, said);
        assert.ok(k.verdict === 'repeat' || (k.verdict === 'match' && asksToo(t.replies[k.index])), `${id} T${i + 1} «${t.them.en}»: "${said}" → ${outcome(k)}`);
        assert.notEqual(k.verdict, 'own');
      }
    });
  }
});

test('short answers select a reply only where the table says so', () => {
  const wrong = [];
  for (const { R, t, n, where } of turns) for (const said of SHORT) {
    const got = outcome(pick(t, said)), e = listed(TABLE[R.id][n], said), want = e ? e[0] : t.open ? 'own' : 'unsure';
    count(got);
    if (got !== want) wrong.push(`${where}: "${said}" → ${got}, expected ${want}`);
    // "I don't know" is never "No", and never anything but a reply that says the same
    const k = pick(t, said);
    if (saysUnknown(said) && k.verdict === 'match') { const r = t.replies[k.index]; if (!saysUnknown(r.en) && !(r.keys || []).some((x) => saysUnknown(x))) wrong.push(`${where}: "${said}" → «${r.en}»`); }
    if (/^yes/i.test(said) && k.verdict === 'match' && /^no\b/i.test(t.replies[k.index].en)) wrong.push(`${where}: "${said}" → «${t.replies[k.index].en}»`);
    if (/^no\b/i.test(said) && said !== 'No problem' && k.verdict === 'match' && /^(yes|sure|okay)\b/i.test(t.replies[k.index].en)) wrong.push(`${where}: "${said}" → «${t.replies[k.index].en}»`);
  }
  assert.deepEqual(wrong, [], `\n  ${wrong.join('\n  ')}\n`);
});

// the opposite of a reply: "Yes …" / "No …" exchanged, a "not" taken out, a "not" put in
function opposites(en) {
  const s = en.replace(/[.!?]+$/, ''), out = new Set();
  const negative = /\b(no|not|never)\b|n't\b/i.test(s);
  if (/^yes\b/i.test(s)) out.add(s.replace(/^yes\b/i, 'No'));
  if (/^no\b/i.test(s)) out.add(s.replace(/^no\b/i, 'Yes'));
  // a reply that begins with "No" still says no when a later "not" is lost ("No, I do" for "No, I don't."), so those are not opposites
  if (negative && !/^no\b/i.test(s)) {
    const without = s.replace(/\bcan't\b/gi, 'can').replace(/\bwon't\b/gi, 'will').replace(/\b(\w+)n't\b/gi, '$1').replace(/\b(am|is|are|do|does|did|will|can|could|would|should|have|has) not\b/gi, '$1').replace(/\bI'm not\b/gi, "I'm").replace(/\b(no|not) (?=\w)/gi, '');
    if (without !== s && tokens(without).length) out.add(without);
  }
  if (!negative) {
    const withNot = s.replace(/\bI can\b/i, "I can't").replace(/\bI will\b/i, 'I will not').replace(/\bI'll\b/i, 'I will not').replace(/\bI (have|need|want|know|understand|take|feel|live|speak)\b/i, "I don't $1").replace(/\bI'm\b/i, "I'm not").replace(/\bI am\b/i, 'I am not')
      .replace(/\b(It|He|She|This|That|There) is\b/i, '$1 is not').replace(/\b(It|He|She|That)'s\b/i, '$1 is not').replace(/\bI'd like\b/i, "I don't want");
    if (withNot !== s) out.add(withNot);
  }
  return [...out].filter((x) => !same(x, en));
}

test('H2 — the opposite of a reply never selects that reply', () => {
  const wrong = [];
  let n = 0;
  for (const { t, where } of turns) t.replies.forEach((r, i) => {
    if (asksToo(r)) return;                  // a request for help is not a yes or a no
    for (const said of opposites(r.en)) {
      const k = pick(t, said); n++; count(outcome(k));
      if (k.verdict === 'match' && k.index === i) wrong.push(`${where}: "${said}" → «${r.en}»`);
    }
  });
  assert.ok(n > 200, `only ${n} opposites were made`);
  assert.deepEqual(wrong, [], `\n  ${wrong.join('\n  ')}\n`);
});

test('the findings of QA round 2, as the reviewer verified them', () => {
  const at = (id, n) => C.roleplays.find((R) => R.id === id).turns[n - 1];
  const check = (id, n, want, list) => { for (const said of list) assert.equal(outcome(pick(at(id, n), said)), want, `${id} T${n}: "${said}"`); };
  // H2
  check('rp-bill', 4, 'r1', ['Yes', 'Okay', 'Yes please', 'I will pay now', 'I want to pay now']);
  check('rp-bill', 4, 'unsure', ['I will pay later', "I'd like to pay later", 'Not now', 'No', 'No thank you', 'Later please']);
  // M1
  check('rp-er', 4, 'r3', ["I don't know", 'I am not sure']);
  check('rp-er', 4, 'r2', ['No', 'No I am not', 'No allergies']);
  check('rp-er', 4, 'r1', ['Yes', 'Penicillin']);
  check('rp-er', 5, 'unsure', ['Please call my son']);
  check('rp-er', 5, 'r2', ['Yes', 'My son is here', 'My daughter is here', 'Yes, my daughter']);
  check('rp-er', 5, 'r1', ['No', 'No, I am alone']);
  check('rp-er', 3, 'unsure', ['I do not know']);
  // M2
  check('rp-support', 2, 'repeat', ['I do not understand']);
  check('rp-support', 2, 'unsure', ['I do not know', 'I am not sure']);
  check('rp-support', 2, 'r1', ['It is not working', 'Internet not working', "My internet doesn't work"]);
  check('rp-work', 4, 'repeat', ['I do not understand']);
  check('rp-work', 4, 'unsure', ['I am not sure']);
  check('rp-work', 4, 'r2', ["No I can't", 'I can not', "I can't work on Saturday", 'Sorry I can not']);
  check('rp-work', 4, 'r1', ['Yes', 'Yes I can']);
  check('rp-plane', 5, 'repeat', ['I do not understand']);
  // M3
  check('rp-store', 4, 'r2', ['No', 'No thank you', "I don't need a bag"]);
  check('rp-coffee', 4, 'r1', ['No', 'No thank you', "That's all"]);
  check('rp-coffee', 2, 'r1', ['Milk', 'Milk please', 'Just milk', 'With milk', 'Only milk please']);
  check('rp-coffee', 2, 'r2', ['Milk and sugar', 'Both']);
  check('rp-coffee', 2, 'r3', ['No']);
  check('rp-directions', 2, 'r1', ['Is it far?', 'Is it far from here?', 'How far is it?']);
  check('rp-directions', 2, 'r2', ['Can you show me on the map?', 'Show me on the map please', 'Can you show me?']);
  check('rp-urgent', 1, 'r1', ['No', "I don't have an appointment"]);
  check('rp-er', 3, 'r2', ['No']);
  check('rp-unhappy-customer', 3, 'r1', ['No', 'No charge', 'There is no charge']);
  check('rp-unhappy-customer', 3, 'r2', ['It is free', 'No, free', 'No it is free']);
  check('rp-rideshare', 4, 'r1', ["It's about twenty minutes", "Don't worry"]);
  check('rp-rideshare', 5, 'r1', ["I'll turn the heat on", 'No problem']);
  check('rp-delivery', 5, 'r1', ['No', 'No thank you', "That's all"]);
  check('rp-delivery-call', 6, 'r1', ['Where should I leave it?']);
  check('rp-maintenance', 4, 'r2', ['I need a new part']);
  check('rp-maintenance', 6, 'r1', ['No']);
  check('rp-tailor', 2, 'r1', ['Please try them on', 'No problem']);
  check('rp-bridal', 2, 'r1', ['What size do you wear?']);
  check('rp-bridal', 5, 'r2', ['We can make it shorter']);
  check('rp-groom', 5, 'r2', ['Please come back on Thursday']);
  // M4
  check('rp-airport', 3, 'own', ['One month', 'Six months', 'Ten days', 'I will stay for six months']);
  check('rp-airport', 3, 'r1', ['Three months', 'For three months']);
  check('rp-airport', 3, 'r2', ['Two weeks']);
  check('rp-clinic', 5, 'own', ['Two days ago', 'Two weeks ago', 'Today', 'This morning']);
  check('rp-clinic', 4, 'unsure', ['My head hurts']);
  // L1, L10, L12
  check('rp-rideshare', 3, 'r1', ['Where are you going?']);
  check('rp-landlord', 5, 'r3', ['No', 'No thank you']);
  check('rp-tailor', 6, 'r1', ['Friday', 'On Friday']);
  check('rp-tailor', 6, 'r2', ['Friday after two']);
  check('rp-maintenance', 5, 'r1', ['Tomorrow']);
  check('rp-maintenance', 5, 'r2', ['Tomorrow at nine']);
});

test('how much was checked', (t) => {
  t.diagnostic(`conversations ${C.roleplays.length}, turns ${turns.length}, replies ${turns.reduce((s, x) => s + x.t.replies.length, 0)}`);
  t.diagnostic(`utterances tried ${tally.utterances}: a reply ${tally.reply}, repeat ${tally.repeat}, own answer ${tally.own}, unsure ${tally.unsure}`);
  assert.ok(tally.utterances > 20000);
});
