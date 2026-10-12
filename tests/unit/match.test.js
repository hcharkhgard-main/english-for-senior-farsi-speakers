import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tokens, scoreSpeech, pickReply, correct, wordMatch, markWords, tipsFor, numberWords, ordinalWords, repairKind, saysUnknown } from '../../src/js/match.js';
import { ASKS, NOT_ASKS } from './replies.table.js';
import { wordsOf, audioKey } from '../../src/js/audiokey.js';

const C = JSON.parse(fs.readFileSync(new URL('../../content/corrections.json', import.meta.url)));

test('tokens: contractions, numbers, punctuation', () => {
  assert.deepEqual(tokens("I'm fine, thank you."), ['i', 'am', 'fine', 'thank', 'you']);
  assert.deepEqual(tokens("at 10 o'clock"), ['at', 'ten', 'oclock']);
  assert.deepEqual(tokens('March 5th, 1958'), ['march', 'fifth', 'nineteen', 'fifty', 'eight']);
  assert.deepEqual(tokens('555-0142'), ['five', 'five', 'five', 'zero', 'one', 'four', 'two']);
  assert.deepEqual(numberWords(35), ['thirty', 'five']);
});

test('tokens: phone numbers and zip codes digit by digit, years and ordinals as they are said, spelled names as letters', () => {
  const digits = (s) => s.split('').map((d) => numberWords(+d)[0]);
  assert.deepEqual(tokens('212-555-0142'), digits('2125550142'));
  assert.deepEqual(tokens('My number is (212) 555-0142.'), ['my', 'number', 'is', ...digits('2125550142')]);
  assert.deepEqual(tokens('90210'), digits('90210'));
  assert.deepEqual(tokens('Call 911.'), ['call', 'nine', 'one', 'one']);
  assert.deepEqual(tokens('1958'), ['nineteen', 'fifty', 'eight']);
  assert.deepEqual(tokens('2024'), ['twenty', 'twenty', 'four']);
  assert.deepEqual(tokens('2005'), ['two', 'thousand', 'five']);
  assert.deepEqual(tokens('5th'), ['fifth']);
  assert.deepEqual(tokens('the 21st'), ['the', 'twenty', 'first']);
  assert.deepEqual(ordinalWords(30), ['thirtieth']);
  assert.deepEqual(tokens('Ahmadi. A-H-M-A-D-I.'), ['ahmadi', ':a', ':h', ':m', ':a', ':d', ':i']);
  assert.deepEqual(tokens('I-94'), ['i', 'ninety', 'four']);            // a form number is not a spelled name
  assert.deepEqual(tokens("I haven't. It isn't."), ['i', 'have', 'not', 'it', 'is', 'not']);
  assert.deepEqual(tokens('$3.50 at 10:30'), ['three', 'fifty', 'at', 'ten', 'thirty']);
});

test('numbers and spelled names are understood however the recogniser writes them', () => {
  assert.equal(scoreSpeech('My date of birth is March 5th, 1958.', 'my date of birth is March 5 1958').verdict, 'good');
  assert.equal(scoreSpeech('My date of birth is March 5th, 1958.', 'my date of birth is march fifth nineteen fifty eight').verdict, 'good');
  assert.equal(scoreSpeech('My phone number is 555-0142.', 'my phone number is five five five oh one four two').verdict, 'good');
  assert.equal(scoreSpeech('Call 911.', 'call nine one one').verdict, 'good');
  assert.equal(scoreSpeech('Ahmadi. A-H-M-A-D-I.', 'Ahmadi a h m a d i').verdict, 'good');
  assert.ok(scoreSpeech('Ahmadi. A-H-M-A-D-I.', 'Ahmadi A-H-M-A-D-I').tokens.every((t) => t.ok));
  assert.equal(wordMatch(':a', 'the'), 0, 'the letter A is not the word "the"');
  assert.ok(wordMatch('fifth', 'five') >= 0.6 && wordMatch('fifth', 'five') < 1);
});

test('a clearly spoken sentence is "good"', () => {
  const r = scoreSpeech('Where is the milk?', ' Where is the milk?');
  assert.equal(r.verdict, 'good');
  assert.ok(r.tokens.every((t) => t.ok));
});

test('contraction and number forms count as the same', () => {
  assert.equal(scoreSpeech("I have an appointment at ten o'clock.", "I have an appointment at 10 o'clock").verdict, 'good');
  assert.equal(scoreSpeech("I'd like to pay by card.", 'I would like to pay by card').verdict, 'good');
  assert.equal(scoreSpeech("I don't understand.", 'I do not understand').verdict, 'good');
});

test('one misheard word gives "close" and names the word', () => {
  const r = scoreSpeech('Where is the milk?', 'Where is the melt?');
  assert.equal(r.verdict, 'close');
  const weak = r.tokens.filter((t) => !t.ok).map((t) => t.token);
  assert.deepEqual(weak, ['milk']);
});

test('near-miss spellings are accepted (cart/card)', () => {
  assert.ok(wordMatch('card', 'cart') >= 0.6);
  assert.equal(scoreSpeech("I'd like to pay by card.", "I'd like to pay by cart.").verdict, 'good');
  assert.ok(wordMatch('bags', 'bag') >= 0.6);
  assert.ok(wordMatch('ticket', 'tickets') >= 0.6);
  assert.ok(wordMatch('coffee', 'coffe') >= 0.6 && wordMatch('appointment', 'apointmant') >= 0.6, 'longer words still forgive a letter or two');
});

test('short words that differ by one letter are different words', () => {
  for (const [a, b] of [['fine', 'five'], ['help', 'hell'], ['milk', 'mill'], ['west', 'vest'], ['then', 'ten'], ['can', 'car'], ['yes', 'yet']]) {
    assert.equal(wordMatch(a, b), 0, `${a} / ${b}`);
    assert.equal(wordMatch(b, a), 0, `${b} / ${a}`);
  }
  const r = scoreSpeech('I am fine.', 'I am five');
  assert.notEqual(r.verdict, 'good');
  assert.deepEqual(r.tokens.filter((t) => !t.ok).map((t) => t.token), ['fine']);
  assert.notEqual(scoreSpeech('I need help.', 'I need hell').verdict, 'good');
  assert.notEqual(scoreSpeech('Where is the milk?', 'where is the mill').verdict, 'good');
});

test('the opposite meaning is never "good": a missing or added "not" / "no"', () => {
  const pairs = [["I can't breathe well.", 'I can breathe well'], ["I don't give personal information over the phone.", 'I do give personal information over the phone'],
    ["Please don't call me again.", 'Please do call me again'], ["I won't give you my PIN.", 'I will give you my PIN'], ["I'm not interested, thank you.", "I'm interested, thank you"],
    ['No, thank you.', 'Yes, thank you'], ["It's a beautiful day, isn't it?", "It's a beautiful day, is it?"], ['I have no insurance.', 'I have insurance'],
    ['I can hear you.', "I can't hear you"], ['Yes, I do.', 'No, I do'], ['I understand.', 'I do not understand']];
  for (const [target, heard] of pairs) {
    const r = scoreSpeech(target, heard);
    assert.notEqual(r.verdict, 'good', `"${target}" heard as "${heard}"`);
    assert.equal(r.flipped, true);
  }
  // the word that carries the "not" is the one shown as not understood
  const weak = (target, heard) => markWords(wordsOf(target), scoreSpeech(target, heard)).filter((m) => m.word && !m.ok).map((m) => m.text);
  assert.deepEqual(weak("I can't breathe well.", 'I can breathe well'), ["can't"]);
  assert.deepEqual(weak("I don't need a bag.", 'I do need a bag'), ["don't"]);
  assert.deepEqual(weak("I'm not interested, thank you.", "I'm interested, thank you"), ['not']);
  // with nothing to point at, the phone says it is not sure — never "wrong", never "good"
  assert.equal(scoreSpeech('I can hear you.', "I can't hear you").verdict, 'unsure');
  // said correctly, in any of its forms, it is still good
  assert.equal(scoreSpeech("I can't breathe well.", 'I cannot breathe well').verdict, 'good');
  assert.equal(scoreSpeech("I don't know.", "I don't no").verdict, 'good');
  assert.equal(scoreSpeech('No, thank you.', 'no no thank you').verdict, 'good');
  assert.equal(scoreSpeech("I don't understand.", 'I dont understand').verdict, 'good');
});

test('nothing recognisable is "unsure", never wrong; silence is "silent"', () => {
  assert.equal(scoreSpeech('Could you repeat that, please?', 'purple monkey dishwasher').verdict, 'unsure');
  assert.equal(scoreSpeech('Could you repeat that, please?', '').verdict, 'silent');
});

test('markWords maps results back to written words', () => {
  const words = wordsOf("I'm looking for bread.");
  const r = scoreSpeech("I'm looking for bread.", 'I am looking for bed');
  const marked = markWords(words, r);
  assert.equal(marked.length, 4);
  assert.equal(marked[0].ok, true);
  assert.equal(marked[3].ok, false);
});

test('pickReply: matches by content, accepts own answers on open turns', () => {
  const replies = [{ en: 'Yes, please. Where is the milk?', keys: ['milk'] }, { en: "I'm looking for bread.", keys: ['bread'] }];
  assert.equal(pickReply(replies, 'where is milk').index, 0);
  assert.equal(pickReply(replies, 'I looking for bread please').index, 1);
  assert.equal(pickReply(replies, 'banana telephone').verdict, 'unsure');
  assert.equal(pickReply(replies, '').verdict, 'silent');
  assert.equal(pickReply([{ en: 'My last name is Ahmadi.', keys: ['last'] }], 'Rezaei', true).verdict, 'own');
});

test('pickReply: the reply that explains most of what was heard wins', () => {
  const plane = [{ en: 'Here you go.' }, { en: 'Here you go. Can you help me with my bag?' }];
  assert.equal(pickReply(plane, 'Here you go. Can you help me with my bag?').index, 1);
  assert.equal(pickReply(plane, 'here you go can you help me with my back').index, 1);
  assert.equal(pickReply(plane, 'here you go can you help with my bed').index, 1, 'one misheard word does not lose the longer reply');
  assert.equal(pickReply(plane, 'here you go').index, 0);
  const school = [{ en: 'Thank you.' }, { en: 'Thank you. How was his day?' }];
  assert.equal(pickReply(school, 'thank you how was his day').index, 1);
  assert.equal(pickReply(school, 'thank you').index, 0);
  assert.equal(pickReply(school, 'thank you very much').index, 0);
  const grand = [{ en: "I'm his grandfather." }, { en: "I'm his grandmother." }];
  assert.equal(pickReply(grand, 'I am his grandmother').index, 1, 'an exactly heard word beats a similar one');
  assert.equal(pickReply(grand, 'I am his grandfather').index, 0);
});

test('pickReply: never chooses a reply that says the opposite of what was heard', () => {
  const ok = [{ en: 'Okay. Thank you.', keys: ['thank you'] }, { en: 'Can you help me, please?' }];
  assert.equal(pickReply(ok, 'no thank you').verdict, 'unsure');
  assert.equal(pickReply(ok, 'okay thank you').index, 0);
  const yn = [{ en: 'Yes, please.', keys: ['yes'] }, { en: 'No, thank you.', keys: ['no'] }];
  assert.equal(pickReply(yn, 'yes thank you').index, 0);
  assert.equal(pickReply(yn, 'no please').index, 1);
  assert.equal(pickReply(yn, 'no').index, 1);
  assert.equal(pickReply(yn, 'yeah please').index, 0);
  const can = [{ en: 'Yes, I can.' }, { en: "No, I can't." }];
  assert.equal(pickReply(can, "no I can't").index, 1);
  assert.equal(pickReply(can, 'yes I can').index, 0);
  assert.notEqual(pickReply(can, 'I can').index, 1);
  assert.notEqual(pickReply([{ en: "I don't have insurance." }], 'I do have insurance').verdict, 'match');
  assert.equal(pickReply([{ en: "I don't know." }], "I don't no").index, 0);
});

test('repairKind: a request for help with understanding is recognised however the recogniser writes it', () => {
  for (const [kind, list] of Object.entries(ASKS)) for (const said of list) {
    const r = repairKind(said);
    assert.ok(r && r.kinds.includes(kind), `"${said}" should be a request (${kind}); got ${JSON.stringify(r)}`);
    assert.equal(r.slow, r.kinds.some((k) => k !== 'again'), `"${said}": only a plain "again" is said at normal speed`);
  }
  for (const said of NOT_ASKS) assert.equal(repairKind(said), null, `"${said}" is an answer, not a request`);
  // the kind decides what the learner is told and how the line is said again
  assert.equal(repairKind("I don't understand").kind, 'lost');
  assert.equal(repairKind('Again, please').kind, 'again');
  assert.equal(repairKind('Please speak slowly').kind, 'slow');
  assert.equal(repairKind('I need an interpreter').kind, 'interp');
  assert.deepEqual(repairKind("I don't understand. Could you repeat that slowly, please?").kinds, ['lost', 'slow', 'again']);
  assert.equal(repairKind('Sorry?').weak, true, '"Sorry" on its own is taken as "Sorry?"');
  assert.equal(repairKind("I'm sorry"), null);
  assert.equal(repairKind('Please slow down').kind, 'slow');
  assert.equal(repairKind('Please slow down.', { strict: true }), null, 'as the text of a reply (said to a driver) it is not about speech');
  assert.equal(repairKind(''), null);
});

test('saysUnknown: "I don\'t know" and "I\'m not sure"', () => {
  for (const said of ["I don't know", 'I do not know', "I don't no", 'I dunno', "I'm not sure", 'Not sure', 'I am not really sure', "I don't remember", 'No idea']) assert.equal(saysUnknown(said), true, said);
  for (const said of ['No', 'I know', 'Do you know this area?', "I'm sure", 'I do not have it', 'Now']) assert.equal(saysUnknown(said), false, said);
});

test('pickReply: asking again is never an answer — the partner repeats and the turn stays', () => {
  const address = [{ en: 'My address is 25 Oak Street.', keys: ['address', 'street'] }];
  for (const said of ["I don't understand", 'Sorry, I do not understand', 'Again please', 'Can you say that again?', 'Sorry?', 'What?', 'Pardon?', "I don't know what that means"]) {
    const k = pickReply(address, said, true, 'What is the address of the emergency?');
    assert.equal(k.verdict, 'repeat', said);
    assert.equal(k.index, -1);
  }
  assert.deepEqual(pickReply(address, 'Please speak slowly', true).slow, true);
  assert.deepEqual(pickReply(address, 'Again, please', true).slow, false);
  assert.equal(pickReply(address, "I don't understand", true).repair, 'lost');
  assert.equal(pickReply(address, 'um', true).verdict, 'unsure', 'hesitation is not an answer either');
  assert.equal(pickReply(address, '10 Pine Street', true).verdict, 'own');
  // where the turn itself offers the request, that reply is chosen — also for other wordings of the same request
  const turn = [{ en: 'Thank you. I will wait at the door.', keys: ['wait', 'door'] }, { en: 'Can you say that again, please?', keys: ['again', 'say'] }];
  for (const said of ['Again please', 'Can you repeat that?', 'What?', 'Sorry?', 'Could you say that again']) assert.equal(pickReply(turn, said).index, 1, said);
  assert.equal(pickReply(turn, "I don't understand").verdict, 'repeat', 'another kind of request: the partner repeats, slowly');
  assert.equal(pickReply(turn, 'Please speak slowly').verdict, 'repeat');
  // a key word such as "again" or "sorry" never turns a request into a plain answer
  const bye = [{ en: 'Thank you for your patience.', keys: ['patience'] }, { en: "You're welcome. I'm sorry again.", keys: ['welcome', 'again'] }];
  assert.equal(pickReply(bye, 'Could you say that again?').verdict, 'repeat');
  assert.equal(pickReply(bye, 'I am sorry again').index, 1);
  const shift = [{ en: 'Yes, I can. What time do I start?', keys: ['yes', 'what time'] }, { en: "I'm sorry, I can't on Saturday.", keys: ['sorry', "can't", 'cannot', 'no'] }];
  assert.equal(pickReply(shift, 'Sorry, I do not understand').verdict, 'repeat');
  assert.equal(pickReply(shift, 'Sorry?').verdict, 'repeat');
  assert.equal(pickReply(shift, "I'm sorry").index, 1);
  // a reply that was said in full is that reply, even when it reads like a request
  assert.equal(pickReply([{ en: 'Please slow down.', keys: ['slow', 'too fast'] }, { en: 'Okay. Thank you.', keys: ['okay'] }], 'Please slow down').index, 0);
  assert.equal(pickReply([{ en: 'Please slow down.', keys: ['slow', 'too fast'] }, { en: 'Okay. Thank you.', keys: ['okay'] }], 'Too fast').index, 0);
  assert.equal(pickReply([{ en: 'Please slow down.', keys: ['slow', 'too fast'] }, { en: 'Okay. Thank you.', keys: ['okay'] }], 'Please speak slowly').verdict, 'repeat');
});

test('pickReply: "I don\'t know" is neither "No" nor any other answer', () => {
  const allergy = [{ en: "Yes. I'm allergic to penicillin.", keys: ['penicillin', 'yes'] }, { en: 'No.', keys: ['no', 'not'] }];
  for (const said of ["I don't know", 'I do not know', "I'm not sure", 'Not sure']) assert.equal(pickReply(allergy, said).verdict, 'unsure', said);
  assert.equal(pickReply(allergy, 'No').index, 1);
  assert.equal(pickReply(allergy, 'know').index, 1, 'the recogniser writing "know" for a bare "No"');
  assert.equal(pickReply(allergy, 'I am not allergic', false, 'Are you allergic to any medicine?').index, 1, 'a word of the question is not something new');
  assert.equal(pickReply(allergy, 'I am not ready').verdict, 'unsure', 'a little key word does not carry a reply past something else that was said');
  const withIt = [...allergy, { en: "I don't know.", keys: ['know', 'not sure'] }];
  for (const said of ["I don't know", "I don't no", "I'm not sure"]) assert.equal(pickReply(withIt, said).index, 2, said);
  assert.equal(pickReply(withIt, 'No').index, 1);
  assert.equal(pickReply([{ en: 'No, officer.', keys: ['no', "don't know"] }], 'I do not know').index, 0, 'a key phrase can say that "I don\'t know" is this reply');
});

test('pickReply: natural short answers, and the "no" that is part of the reply itself', () => {
  const bag = [{ en: 'Yes, please.', keys: ['yes'] }, { en: "No, thank you. I don't need a bag.", keys: ['no', "don't"] }];
  for (const said of ['No', 'No thank you', 'No thanks', "I don't need a bag", 'No bag']) assert.equal(pickReply(bag, said, false, 'Would you like a bag?').index, 1, said);
  for (const said of ['I need a bag', 'A bag please']) assert.notEqual(pickReply(bag, said, false, 'Would you like a bag?').index, 1, said);
  const heat = [{ en: "No problem. I'll turn the heat on.", keys: ['heat', 'turn', 'problem'] }, { en: "I'm sorry. Is this better?", keys: ['better', 'sorry'] }];
  for (const said of ['No problem', "I'll turn the heat on", 'I will turn the heat on']) assert.equal(pickReply(heat, said).index, 0, said);
  const late = [{ en: "Don't worry. It's about twenty minutes.", keys: ['worry', 'twenty', 'minutes'] }];
  for (const said of ["Don't worry", "It's about twenty minutes", 'Twenty minutes']) assert.equal(pickReply(late, said).index, 0, said);
  assert.equal(pickReply(late, 'About ten minutes').verdict, 'unsure', 'another number');
  const far = [{ en: 'No. Is it far from here?', keys: ['far'] }, { en: 'No. Can you show me on the map?', keys: ['map', 'show'] }];
  for (const said of ['Is it far?', 'Is it far from here?', 'How far is it?']) assert.equal(pickReply(far, said).index, 0, said);
  assert.equal(pickReply(far, 'Can you show me?').index, 1);
  assert.equal(pickReply(far, 'No').verdict, 'unsure', 'both replies begin with "No": it cannot be told which');
  const charge = [{ en: 'No. There is no charge.', keys: ['charge', 'no'] }, { en: "No, it's free. It was our mistake.", keys: ['free', 'mistake'] }];
  for (const said of ['No', 'No charge', 'There is no charge']) assert.equal(pickReply(charge, said).index, 0, said);
  assert.equal(pickReply(charge, 'It is free').index, 1);
  for (const said of ['There is a charge', 'Yes', 'Yes. There is no charge']) assert.equal(pickReply(charge, said).verdict, 'unsure', said);
  // "No problem" is not "No"; "No milk" is not "With milk, no sugar"
  assert.equal(pickReply([{ en: "No, that's all. Thank you.", keys: ['all', 'no'] }], 'No problem').verdict, 'unsure');
  const milk = [{ en: 'With milk, no sugar.', keys: ['milk'] }, { en: 'Milk and sugar, please.', keys: ['and', 'both'] }, { en: 'No, thank you.', keys: ['no'] }];
  assert.equal(pickReply(milk, 'Milk please', false, 'Do you want milk or sugar?').index, 0);
  assert.equal(pickReply(milk, 'Milk and sugar', false, 'Do you want milk or sugar?').index, 1);
  assert.equal(pickReply(milk, 'No', false, 'Do you want milk or sugar?').index, 2);
  for (const said of ['No milk', 'No sugar', 'Sugar please']) assert.equal(pickReply(milk, said, false, 'Do you want milk or sugar?').verdict, 'unsure', said);
  // a key word can say that "no" belongs to a reply that has no "no" in it
  const all = [{ en: "That's all, thank you.", keys: ['all', 'no'] }, { en: 'What is this?', keys: ['what'] }];
  for (const said of ['No', 'No thank you', 'No, that is all']) assert.equal(pickReply(all, said).index, 0, said);
  assert.equal(pickReply(all, 'What?').verdict, 'repeat');
});

test('pickReply: another number, day, time or part of the body is another answer', () => {
  assert.equal(pickReply([{ en: 'Yes, please.', keys: ['yes', 'okay', 'pay now'] }], 'I will pay later').verdict, 'unsure');
  assert.equal(pickReply([{ en: 'Yes. I will pay now.', keys: ['yes', 'okay'] }], 'I will pay later').verdict, 'unsure', 'now / later');
  const stay = [{ en: 'I will stay for three months.', keys: ['three'] }, { en: 'For two weeks.', keys: ['two'] }];
  for (const said of ['Six months', 'I will stay for six months', 'For two months', 'Three weeks', 'Ten days']) assert.equal(pickReply(stay, said, true).verdict, 'own', said);
  assert.equal(pickReply(stay, 'For three months', true).index, 0);
  assert.equal(pickReply(stay, 'Two weeks', true).index, 1);
  const hurts = [{ en: 'My back hurts.', keys: ['back'] }, { en: 'I feel dizzy.', keys: ['dizzy', 'feel'] }];
  assert.equal(pickReply(hurts, 'My head hurts').verdict, 'unsure');
  assert.equal(pickReply(hurts, 'Back pain').index, 0);
  assert.equal(pickReply([{ en: 'A table for two, please.', keys: ['two', 'table'] }], 'A table for four').verdict, 'unsure', '"four" is not "for"');
  assert.equal(pickReply([{ en: 'Is Tuesday morning available?', keys: ['tuesday'] }], 'Tuesday afternoon').verdict, 'unsure');
  assert.equal(pickReply([{ en: 'Water, please.', keys: ['water'] }], 'Later').verdict, 'unsure', 'later / water');
  assert.equal(wordMatch('later', 'water'), 0);
  assert.equal(wordMatch('night', 'right'), 0);
  assert.ok(wordMatch('bag', 'back') >= 0.6, 'the listed near pairs still count');
});

test('pickReply: words of another reply, and the learner\'s own details', () => {
  const store = [{ en: 'Yes, please. Where is the milk?', keys: ['milk'] }, { en: "I'm looking for bread.", keys: ['bread'] }, { en: 'Where is the rice?', keys: ['rice'] }];
  assert.equal(pickReply(store, 'I am looking for milk').verdict, 'unsure', 'not "I\'m looking for bread."');
  assert.equal(pickReply(store, 'I am looking for bread').index, 1);
  assert.equal(pickReply(store, 'Where is the bread?').index, 1);
  assert.equal(pickReply([{ en: 'No, it\'s for me.', keys: ['for me', 'no', 'not a gift'] }, { en: 'Yes. Can I get a gift receipt?', keys: ['receipt', 'yes'] }], 'No, it is for my grandson', false, 'Hello! Is this a gift?').verdict, 'unsure');
  assert.equal(pickReply([{ en: 'No, it\'s for me.', keys: ['for me', 'no', 'not a gift'] }], 'It is not a gift', false, 'Hello! Is this a gift?').index, 0);
  assert.equal(pickReply([{ en: 'No, it\'s for me.', keys: ['for me', 'no', 'not a gift'] }], 'No, it is not for me', false, 'Hello! Is this a gift?').verdict, 'unsure');
  // on an open turn the learner's own words are shown when they differ from the sample
  const name = [{ en: 'My last name is Ahmadi.', keys: ['last name', 'my'] }, { en: "It's Ahmadi.", keys: ["it's"] }];
  assert.equal(pickReply(name, 'My last name is Ahmadi', true).index, 0);
  assert.equal(pickReply(name, 'My last name is Rezaei', true).verdict, 'own');
  assert.equal(pickReply(name, "It's Rezaei", true).verdict, 'own');
  assert.equal(pickReply([{ en: "I'm visiting my son.", keys: ['son'] }], 'I am visiting my daughter', true).verdict, 'own');
  const food = [{ en: 'Yes. I have some food.', keys: ['yes', 'some', 'fruit', 'nuts'], then: {} }, { en: "No, I'm not.", keys: ['no', 'not', "don't"] }];
  assert.equal(pickReply(food, 'Yes, I have some fruit', true, 'Are you bringing any food or plants?').index, 0, 'a key word covers what was said');
  assert.equal(pickReply(food, 'No', true, 'Are you bringing any food or plants?').index, 1);
});

test('corrections follow the understand → correct pattern', () => {
  const a = correct('I want buy milk', C.rules);
  assert.equal(a.fixed, 'I want to buy milk.');
  assert.match(a.why, /to/);
  assert.equal(correct('I fine', C.rules).fixed, "I'm fine.");
  assert.equal(correct('I no understand', C.rules).fixed, "I don't understand.");
  assert.equal(correct('where is milk', C.rules).fixed, 'Where is the milk?');
  assert.equal(correct('I have appointment', C.rules).fixed, 'I have an appointment.');
  assert.equal(correct('in tuesday', C.rules).fixed, 'On Tuesday.');
  assert.equal(correct('How I take this', C.rules).fixed, 'How do I take this?');
  assert.equal(correct('Where is the milk?', C.rules), null);
  assert.equal(correct('I want to buy milk', C.rules), null);
});

test('corrections: every rule that fits is applied, and names keep their capitals', () => {
  const a = correct('I want buy milk in Tuesday', C.rules);
  assert.equal(a.fixed, 'I want to buy milk on Tuesday.');
  assert.deepEqual(a.ids, ['want-to', 'on-day']);
  assert.equal(a.id, 'want-to');
  assert.ok(a.why.includes('to') && a.why.includes('on'), 'both explanations are given');
  assert.equal(correct('I have appointment with Doctor Smith in Monday.', C.rules).fixed, 'I have an appointment with Doctor Smith on Monday.');
  assert.equal(correct('Maryam and i want go to Lakeside Clinic', C.rules).fixed, 'Maryam and I want to go to Lakeside Clinic.');
  assert.equal(correct('Maryam and I want to go to Lakeside Clinic', C.rules), null, 'no rule fits: nothing is invented');
  assert.equal(correct('i no understand English', C.rules).fixed, "I don't understand English.");
  assert.equal(correct('where is bank in Oak Street?', C.rules).fixed, 'Where is the bank in Oak Street?');
  assert.equal(correct('I need doctor and i have fever', C.rules).fixed, 'I need a doctor and I have fever.');
  assert.equal(correct('', C.rules), null);
});

test('corrections: the rules of QA round 2', () => {
  const fixed = (said) => { const r = correct(said, C.rules); return r ? r.fixed : null; };
  // "before" is only "ago" at the end of the sentence
  for (const ok of ['I take it one hour before bed', 'Take it two hours before food', 'I came three days before Christmas', 'two days before my appointment']) assert.equal(fixed(ok), null, ok);
  assert.equal(fixed('It started three days before'), 'It started three days ago.');
  assert.equal(fixed('It start three days before'), 'It started three days ago.');
  assert.equal(fixed('It start yesterday'), 'It started yesterday.');
  assert.equal(fixed('It starts at nine'), null);
  // a sentence that begins with When / What is not always a question
  for (const ok of ['When I go home, I rest', 'When I come back, I will call you', 'When I need help, I call my son', 'What I need is a doctor', 'Where must I sign?', 'When I go home I rest', 'Where can I pay?', 'What do I need?']) assert.equal(fixed(ok), null, ok);
  assert.equal(fixed('What documents I need?'), 'What documents do I need?');
  assert.equal(fixed('Where I sign'), 'Where do I sign?');
  assert.equal(fixed('When I pay?'), 'When do I pay?');
  // "I like check …" is a polite request, not something the learner enjoys
  assert.equal(fixed('I like check my balance'), "I'd like to check my balance.");
  assert.equal(fixed('I like make appointment'), "I'd like to make an appointment.");
  for (const ok of ['I like tea', 'I like to walk', "I'd like to check my balance"]) assert.equal(fixed(ok), null, ok);
  assert.equal(fixed('Would you like come?'), 'Would you like to come?');
  assert.equal(fixed('Its not work'), 'It is not working.');
  assert.equal(fixed('Where I can pay?'), 'Where can I pay?');
  assert.equal(fixed('How I can pay?'), 'How can I pay?');
  assert.equal(fixed('How can I pay?'), null);
});

test('sound tips are chosen from the missed words', () => {
  const tips = tipsFor(['thank', 'water'], C.soundTips);
  assert.deepEqual(tips.map((t) => t.id), ['th', 'w']);
});

test('wordsOf: tappable words skip digits and spelled letters', () => {
  const w = wordsOf('My address is 25 Oak Street.');
  assert.deepEqual(w.map((x) => x.word), ['my', 'address', 'is', null, 'Oak', 'Street']);
  assert.equal(wordsOf('Ahmadi. A-H-M-A-D-I.')[1].word, null);
  assert.equal(audioKey('en', 's', 'n', 'Hello'), audioKey('en', 's', 'n', ' Hello '));
  assert.notEqual(audioKey('en', 's', 'n', 'Hello'), audioKey('en', 's', 's', 'Hello'));
});
