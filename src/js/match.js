// Comparing what the learner said with what was expected.
// The aim is "would a listener understand this?", never accent perfection:
// contractions, numbers and common sound-alikes all count as the same word.

const CONTRACTIONS = {
  "i'm": 'i am', "i'd": 'i would', "i'll": 'i will', "i've": 'i have', "it's": 'it is', "that's": 'that is', "what's": 'what is',
  "where's": 'where is', "there's": 'there is', "he's": 'he is', "she's": 'she is', "you're": 'you are', "we're": 'we are', "they're": 'they are',
  "can't": 'can not', "cannot": 'can not', "won't": 'will not', "let's": 'let us',
  "we've": 'we have', "you'll": 'you will', "we'll": 'we will', "you'd": 'you would', "o'clock": 'oclock', "son's": 'sons',
  // the recogniser sometimes leaves the apostrophe out
  dont: 'do not', doesnt: 'does not', didnt: 'did not', cant: 'can not', isnt: 'is not', arent: 'are not', wasnt: 'was not',
  wouldnt: 'would not', couldnt: 'could not', shouldnt: 'should not', dunno: 'do not know',
};
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORD_ONES = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];
const ORD_TENS = ['', '', 'twentieth', 'thirtieth', 'fortieth', 'fiftieth', 'sixtieth', 'seventieth', 'eightieth', 'ninetieth'];
// "fifth" and "five" are different words but a listener understands either in a date
const CARDINAL = new Map([...ORD_ONES.map((w, i) => [w, ONES[i]]), ...ORD_TENS.map((w, i) => [w, TENS[i]]).filter(([w]) => w)]);
// groups of words that sound alike; any member matches any other
const ALIKE = [['to', 'too', 'two'], ['for', 'four'], ['there', 'their'], ['by', 'buy', 'bye'], ['here', 'hear'], ['right', 'write'],
  ['one', 'won'], ['eight', 'ate'], ['hi', 'high'], ['son', 'sun'], ['mail', 'male'], ['meet', 'meat'], ['week', 'weak'], ['our', 'hour'], ['ok', 'okay'],
  ['your', 'you'], ['a', 'an', 'the'], ['farsi', 'farcy', 'farsy', 'parsi'], ['hello', 'hallo', 'helo'], ['check', 'cheque'], ['oclock', 'clock'],
  ['thank', 'thanks'], ['id', 'i.d', 'idea'], ['maryam', 'mariam', 'miriam', 'mary'], ['ahmadi', 'ahmady', 'amadi'], ['goodbye', 'bye'],
  ['yes', 'yeah', 'yep'], ['zero', 'oh', 'o']];
const ALIKE_OF = new Map();
ALIKE.forEach((g, i) => g.forEach((w) => ALIKE_OF.set(w, i)));
// Short words (four letters or fewer) that differ by one letter are usually different words
// (fine/five, help/hell, milk/mill), so they only count as "close" when the pair is listed here.
const NEAR = new Set(['card|cart', 'bag|back']);
const near = (a, b) => NEAR.has(`${a}|${b}`) || NEAR.has(`${b}|${a}`);
// "know" and "no" sound the same; which of the two was said is clear from the words around it.
// "I don't no" -> know, "I no" -> know (but "I no understand" stays), "Know, thank you" -> no.
const KNOW_AFTER = new Set(['i', 'you', 'we', 'they', 'to']);
const KNOW_BEFORE = new Set(['the', 'that', 'this', 'it', 'what', 'where', 'how', 'why', 'when', 'who', 'if', 'him', 'her', 'you', 'your', 'my']);
const NO_BEFORE = new Set(['thank', 'thanks', 'please', 'sir', 'officer', 'problem', 'i', 'it']);
function sameSound(words) {
  return words.map((w, j) => {
    const p = words[j - 1], n = words[j + 1];
    if (w === 'no' && (p === 'not' || (KNOW_AFTER.has(p) && (n === undefined || KNOW_BEFORE.has(n))))) return 'know';
    if (w === 'know' && (j === 0 || p === 'oh' || p === 'sorry') && (n === undefined || NO_BEFORE.has(n))) return 'no';
    return w;
  });
}
// Words that turn a sentence into its opposite. They must be heard: "I can" is not "I can't".
const NEG = new Set(['not', 'no', 'never']);
const LETTER = ':';                  // marks a spelled-out letter: "A-H-M-A-D-I" -> :a :h :m :a :d :i

export function numberWords(n) {
  if (n < 20) return [ONES[n]];
  if (n < 100) return n % 10 ? [TENS[Math.floor(n / 10)], ONES[n % 10]] : [TENS[n / 10]];
  if (n < 1000) return [ONES[Math.floor(n / 100)], 'hundred', ...(n % 100 ? numberWords(n % 100) : [])];
  if (n >= 1900 && n < 2100) {                   // years, the way they are said
    if (n % 100 >= 10) return [...numberWords(Math.floor(n / 100)), ...numberWords(n % 100)];   // nineteen fifty eight, twenty twenty four
    if (n >= 2000) return ['two', 'thousand', ...(n % 100 ? [ONES[n % 100]] : [])];              // two thousand five
    return ['nineteen', ...(n % 100 ? ['oh', ONES[n % 100]] : ['hundred'])];                    // nineteen oh five
  }
  return String(n).split('').map((d) => ONES[+d]);
}

export function ordinalWords(n) {
  if (n < 20) return [ORD_ONES[n]];
  if (n < 100) return n % 10 ? [TENS[Math.floor(n / 10)], ORD_ONES[n % 10]] : [ORD_TENS[n / 10]];
  return numberWords(n);
}

export function tokens(text) {
  const out = [];
  const digits = (m) => ' ' + m.replace(/\D/g, '').split('').join(' ') + ' ';
  const letters = (m) => ' ' + m.replace(/[^A-Za-z]/g, '').toLowerCase().split('').map((c) => LETTER + c).join(' ') + ' ';
  const raw = String(text || '')
    .replace(/\b[A-Z](?:[-.][A-Z]\b)+|\b[A-Z](?: [A-Z]\b){2,}/g, letters)                    // a name spelled out: A-H-M-A-D-I
    .toLowerCase()
    .replace(/(?:\+?1[-. ])?\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/g, digits)                  // 212-555-0142, (212) 555-0142
    .replace(/\b\d{3}[- ]\d{4}\b/g, digits)                                                 // 555-0142
    .replace(/\b(?:911|0\d+)\b/g, digits)                                                   // nine one one; numbers that start with zero
    .replace(/[’‘`]/g, "'").replace(/\$/g, ' ').replace(/[^a-z0-9': -]/g, ' ').replace(/:(?![a-z]\b)/g, ' ').split(/[\s-]+/).filter(Boolean);
  for (let w of raw) {
    if (w[0] === LETTER) { out.push(w); continue; }
    w = w.replace(/^'+|'+$/g, '');
    if (!w) continue;
    const ord = w.match(/^(\d+)(st|nd|rd|th)$/);
    if (ord) { out.push(...ordinalWords(+ord[1])); continue; }
    if (/^\d+$/.test(w)) { out.push(...(w.length > 4 ? w.split('').map((d) => ONES[+d]) : numberWords(+w))); continue; }   // long numbers (zip codes) digit by digit
    if (CONTRACTIONS[w]) { out.push(...CONTRACTIONS[w].split(' ')); continue; }
    const nt = w.match(/^([a-z]+)n't$/);                         // don't, isn't, haven't … -> do not, is not, have not
    if (nt) { out.push(nt[1], 'not'); continue; }
    if (w.endsWith("'s")) w = w.slice(0, -2) + 's';
    out.push(w.replace(/'/g, ''));
  }
  return out;
}

export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// 1 = same word, 0.9 = same word in another form, 0.6 = close enough to be understood, 0 = different
export function wordMatch(a, b) {
  if (a === b) return 1;
  if (a[0] === LETTER || b[0] === LETTER) return (a[0] === LETTER ? a.slice(1) : a) === (b[0] === LETTER ? b.slice(1) : b) ? 1 : 0;
  const ga = ALIKE_OF.get(a);
  if (ga != null && ga === ALIKE_OF.get(b)) return 1;
  if (CARDINAL.get(a) === b || CARDINAL.get(b) === a) return 0.9;                  // fifth / five
  const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
  if (a.length > 3 && b.length > 3 && stem(a) === stem(b)) return 0.9;
  if (a.length >= 3 && b.length >= 3 && (a === b + 's' || b === a + 's')) return 0.9;   // bag / bags
  if (near(a, b)) return 0.6;
  if (Math.min(a.length, b.length) <= 4 || EXACT.has(a) || EXACT.has(b)) return 0;
  const d = lev(a, b);
  if (d === 1) return 0.6;
  if (Math.max(a.length, b.length) >= 8 && d === 2) return 0.6;
  return 0;
}

// Words that are never taken for a similar-looking word, because each of them means something of its own:
// the little grammar words, numbers, days, months, times and parts of the body (later / water, night / right).
// Filled in further down, where those lists are.
const EXACT = new Set();

// Align target words with heard words (edit-distance alignment).
export function align(target, heard) {
  const m = target.length, n = heard.length;
  const cost = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) cost[i][0] = i;
  for (let j = 0; j <= n; j++) cost[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const s = 1 - wordMatch(target[i - 1], heard[j - 1]);
    cost[i][j] = Math.min(cost[i - 1][j] + 1, cost[i][j - 1] + 1, cost[i - 1][j - 1] + s);
  }
  const res = new Array(m).fill(null);
  let i = m, j = n;
  while (i > 0 && j > 0) {
    const s = 1 - wordMatch(target[i - 1], heard[j - 1]);
    if (Math.abs(cost[i][j] - (cost[i - 1][j - 1] + s)) < 1e-9) { res[i - 1] = { heard: heard[j - 1], m: 1 - s, j: j - 1 }; i--; j--; }
    else if (cost[i][j] === cost[i - 1][j] + 1) { res[i - 1] = { heard: null, m: 0 }; i--; }
    else j--;
  }
  while (i > 0) { res[i - 1] = { heard: null, m: 0 }; i--; }
  return res;
}

const LITTLE = new Set(['a', 'an', 'the', 'to', 'of', 'is', 'am', 'are', 'it', 'please', 'oh']);
const weightOf = (w) => (LITTLE.has(w) ? 0.5 : 1);

// How well was `target` understood, given the recogniser heard `heardText`?
// verdict: 'good' | 'close' | 'unsure' | 'silent'. 'unsure' means the phone could not
// tell — it is never presented to the learner as "wrong".
// A sentence whose "not" / "no" was not heard (or was heard where there is none) is never
// 'good': it would mean the opposite. The recogniser may simply have missed the word, so the
// result is 'close' with that word marked, or 'unsure' when there is no word to point at.
//
// `own` lists the words of the target that stand for the learner's own details — the sample name, address,
// date or number ("Maryam"; "25", "Oak", "Street"). The learner is told to say their own instead, so these
// words are not scored and never marked as "say again": see scoreOwn below.
export function scoreSpeech(target, heardText, { own = null } = {}) {
  const t = tokens(target), hrd = sameSound(tokens(heardText));
  if (!hrd.length) return { verdict: 'silent', score: 0, words: [], heard: '' };
  const mine = ownTokens(t, own);
  if (mine) return scoreOwn(t, hrd, mine, heardText);
  const al = align(t, hrd);
  let got = 0, total = 0, quality = 0;
  const used = new Set();
  const perToken = t.map((w, i) => {
    const weight = weightOf(w), ok = al[i].m >= 0.6;
    total += weight;
    if (ok) { got += weight; quality += weight * al[i].m; used.add(al[i].j); }
    return { token: w, ok, exact: al[i].m >= 0.9, heard: al[i].heard, j: ok ? al[i].j : -1 };
  });
  const score = total ? got / total : 0;
  const heardWeight = hrd.reduce((s, w) => s + weightOf(w), 0);
  const precision = heardWeight ? Math.min(1, got / heardWeight) : 0;      // how much of what was heard this sentence explains
  const negMissing = perToken.some((p) => NEG.has(p.token) && !p.ok);
  const negExtra = !t.some((w) => NEG.has(w)) && hrd.some((w, j) => NEG.has(w) && !used.has(j));
  const flipped = negMissing || negExtra;
  const extra = Math.max(0, hrd.length - t.length * 2);   // a lot of extra speech makes the result unreliable
  let verdict = score >= 0.8 ? 'good' : score >= 0.5 ? 'close' : 'unsure';
  if (extra > 3 && verdict !== 'good') verdict = 'unsure';
  if (flipped && verdict === 'good') verdict = 'close';
  if (flipped && verdict === 'close' && perToken.every((p) => p.ok)) verdict = 'unsure';
  return { verdict, score, precision, quality, flipped, tokens: perToken, heard: String(heardText).trim() };
}

// Which tokens of the target are the learner's own details: every entry of `own` is looked for, as written
// ("5th" -> fifth, "212-555-0142" -> its ten digits, "A-H-M-A-D-I" -> its letters), in the order of the sentence.
// Returns one true/false per token, or null when there are none (an entry that is not in the sentence is ignored).
function ownTokens(t, own) {
  if (!Array.isArray(own) || !own.length) return null;
  const mine = new Array(t.length).fill(false);
  let any = false;
  for (const entry of own) {
    const seq = tokens(entry);
    if (!seq.length) continue;
    for (let i = 0; i + seq.length <= t.length; i++) {
      if (seq.every((w, k) => t[i + k] === w && !mine[i + k])) { seq.forEach((_, k) => { mine[i + k] = true; }); any = true; break; }
    }
  }
  return any ? mine : null;
}

// Scoring a sentence in which some words are the learner's own details ("My name is Maryam." said as
// "My name is Hossein"). Only the other words are scored. What was heard in the place of the sample is
// reported in `own`:
//   said 'own'     something else than the sample was heard there — their own name, address, date…
//        'sample'  the sample itself was heard (they read the sentence as written)
//        'none'    nothing was heard there
//   heard          the words heard in that place
// The own words come back as { ok: true, own: true }, so they are never listed as words to say again.
function scoreOwn(t, hrd, mine, heardText) {
  const rest = t.map((_, i) => i).filter((i) => !mine[i]);
  const al = align(rest.map((i) => t[i]), hrd);
  const at = new Map(rest.map((i, k) => [i, al[k]]));           // target index -> its place in what was heard
  let got = 0, total = 0, quality = 0;
  const used = new Set();
  const perToken = t.map((w, i) => {
    if (mine[i]) return { token: w, ok: true, own: true, exact: false, heard: null, j: -1 };
    const a = at.get(i), weight = weightOf(w), ok = a.m >= 0.6;
    total += weight;
    if (ok) { got += weight; quality += weight * a.m; used.add(a.j); }
    return { token: w, ok, exact: a.m >= 0.9, heard: a.heard, j: ok ? a.j : -1 };
  });
  // each run of own words has a place in what was heard: between the scored words heard before and after it
  const slot = new Set(), states = [], said = [];
  for (let a = 0; a < t.length; a++) {
    if (!mine[a] || (a > 0 && mine[a - 1])) continue;
    let b = a;
    while (b + 1 < t.length && mine[b + 1]) b++;
    let left = -1, right = hrd.length;
    for (let i = a - 1; i >= 0; i--) if (perToken[i].j >= 0) { left = perToken[i].j; break; }
    for (let i = b + 1; i < t.length; i++) if (perToken[i].j >= 0) { right = perToken[i].j; break; }
    const here = [];
    for (let j = left + 1; j < right; j++) if (!used.has(j)) { here.push(j); slot.add(j); }
    const sample = t.slice(a, b + 1), words = here.map((j) => hrd[j]);
    const same = align(sample, words).filter((x) => x.m >= 0.6).length;
    states.push(!words.length ? 'none' : same >= Math.ceil(sample.length * 0.8) ? 'sample' : 'own');
    if (states[states.length - 1] === 'own') said.push(...words);
  }
  const state = states.includes('own') ? 'own' : states.includes('none') ? 'none' : 'sample';
  const score = total ? got / total : (slot.size ? 1 : 0);
  const heardWeight = hrd.reduce((s, w, j) => s + (slot.has(j) ? 0 : weightOf(w)), 0);
  const precision = heardWeight ? Math.min(1, got / heardWeight) : (slot.size ? 1 : 0);
  const negMissing = perToken.some((p) => !p.own && NEG.has(p.token) && !p.ok);
  // a "not" that the sentence does not have still turns it round, wherever it was heard ("My address is not …")
  const negExtra = !t.some((w) => NEG.has(w)) && hrd.some((w, j) => NEG.has(w) && !used.has(j));
  const flipped = negMissing || negExtra;
  const extra = Math.max(0, hrd.length - t.length * 2);
  let verdict = score >= 0.8 ? 'good' : score >= 0.5 ? 'close' : 'unsure';
  if (extra > 3 && verdict !== 'good') verdict = 'unsure';
  if (flipped && verdict === 'good') verdict = 'close';
  if (flipped && verdict === 'close' && perToken.every((p) => p.ok)) verdict = 'unsure';
  return { verdict, score, precision, quality, flipped, tokens: perToken, heard: String(heardText).trim(), own: { said: state, heard: said.join(' ') } };
}

// Map token-level results back onto the written words of the sentence, so the screen can mark them.
// A written word that carries a "not" (can't, don't, not, no) is only marked understood when the "not" was heard.
// A word that stands for the learner's own details (see scoreSpeech) comes back with own: true and is never "not understood".
export function markWords(sentenceWords, result) {
  let k = 0;
  return sentenceWords.map((w) => {
    const n = tokens(w.text).length;
    if (!n) return { ...w, ok: true };
    const part = (result.tokens || []).slice(k, k + n);
    k += n;
    if (part.length && part.every((p) => p.own)) return { ...w, ok: true, own: true, heard: '' };
    const ok = part.length ? part.filter((p) => p.ok).length >= Math.ceil(part.length / 2) && part.every((p) => p.ok || !NEG.has(p.token)) : false;
    return { ...w, ok, heard: part.map((p) => p.heard).filter(Boolean).join(' ') };
  });
}

// ---- what kind of thing was said ------------------------------------------------------------
// Three things a learner says are never an answer to the question that was asked, whatever
// words they share with a suggested reply:
//   • a request for help with understanding — "I don't understand", "Again, please", "What?",
//     "Please speak slowly", "I need an interpreter" (repairKind);
//   • "I don't know" / "I'm not sure" (saysUnknown);
//   • hesitation only — "um", "uh" (FILLER).
// The patterns run on the tokens (so "don't", "dont" and "do not" are the same) after the words
// a recogniser typically gets slightly wrong have been put back ("understan", "repit", "slowley").

const FILLER = new Set(['um', 'umm', 'uhm', 'uh', 'uhh', 'hm', 'hmm', 'mm', 'mmm', 'er', 'erm', 'ah', 'eh']);
const FIX_WORD = [
  ['understand', 2, ['understood', 'understanding', 'understands', 'understan', 'undrestand', 'anderstand', 'onderstand', 'understad', 'undestand', 'understend']],
  ['interpreter', 2, ['interpreters', 'interpeter', 'interpretor', 'interpret', 'interpretation']],
  ['translator', 1, ['translators', 'translater']],
  ['slowly', 1, ['slowley', 'slowlee', 'slowli', 'slowy', 'slolly']],
  ['repeat', 1, ['repeats', 'repeated', 'repeating', 'repit', 'ripit', 'repeet', 'ripeat', 'repead']],
  ['again', 1, ['agen', 'agin', 'againe', 'agian']],
  ['pardon', 1, ['pardoned', 'parden', 'pardan']],
];
const SKIP_FIX = new Set(['against', 'gain', 'lowly', 'slowed', 'repeal', 'garden', 'harden']);
function repairWord(w) {
  if (w.length < 4 || SKIP_FIX.has(w)) return w;
  for (const [word, far, forms] of FIX_WORD) {
    if (w === word || forms.includes(w)) return word;
    if (Math.abs(w.length - word.length) <= far && w[0] === word[0] && w.length >= word.length - 1 && lev(w, word) <= far) return word;
  }
  return w;
}
// words that carry no request of their own: stripped before testing for a bare "Again?" / "What?" / "Slowly, please."
const SOFT = new Set(['please', 'sorry', 'excuse', 'me', 'sir', 'officer', 'oh', 'okay', 'ok', 'well', 'so', 'but', 'i', 'am', 'can', 'could', 'would', 'will', 'you', 'it', 'that', 'this', 'just', 'a', 'little', 'bit', 'yes', 'no', 'and', 'the', 'say', 'speak', 'talk', ...FILLER]);
const REPAIR = {
  lost: [
    /\b(?:not|no|never) (?:really |quite |fully |very well |yet )?(?:understand|under stand|follow you|get (?:it|that|you|this)\b|catch (?:it|that|you|this)\b)/,
    /\bnot know what\b.*\b(?:mean|means|meant|say|said|saying)\b/,
    /\bwhat (?:does|do|did|is) (?:\w+ ){1,3}(?:mean|means|meant)\b/,
    /\benglish (?:is )?(?:not|no) (?:so |very |too )?(?:good|well)\b/,
    /\b(?:not|no|never) speak (?:much |good |any |very good )?english\b/,
    /^(?:sorry )?no english\b/,
  ],
  again: [
    /\brepeat\b/,
    /\b(?:say|said|tell|speak|explain|read|spell|ask|show)(?: \w+){0,4} again\b/,
    /\b(?:one more time|once more|once again|come again|say again)\b/,
    /\b(?:not|never) (?:hear|heard|catch|caught) (?:you|that|it|what|the|this)\b/,
    /\bcan not hear\b/,
    /\bwhat (?:did|do) you (?:say|said)\b/,
    /\bwhat was that\b/,
  ],
  slow: [
    /\b(?:say|tell|speak|talk|explain|read|repeat|go|ask)(?: \w+){0,4} (?:slowly|slower|slow)\b/,
    /\b(?:more|little|bit) (?:slowly|slower|slow)\b/,
    /\b(?:slowly|slower) please\b/,
    /\bplease (?:slowly|slower)\b/,
    /\b(?:you|it|that|this)(?: is| are| speak| talk| speaking| talking| were| was)? (?:too|so|very) (?:fast|quick|quickly)\b/,
    /\b(?:speak|talk|speaking|talking) (?:too |so |very )?(?:fast|quickly)\b/,
    /^(?:too|so|very) fast$/,
    /\bnot so fast\b/,
  ],
  interp: [
    /\b(?:interpreter|translator)\b/,
    /\b(?:do|does|can|could) (?:\w+ ){1,3}speak (?:farsi|persian)\b/,
    /\b(?:someone|anyone|somebody|anybody) (?:who )?(?:speak|speaks) (?:farsi|persian)\b/,
    /\b(?:say|speak|talk|explain|tell|repeat|write)(?: \w+){0,4} in (?:farsi|persian)\b/,
    /^(?:please )?in (?:farsi|persian)(?: please)?$/,
    /^(?:i (?:only )?speak )?(?:only )?(?:farsi|persian)(?: only)?$/,
  ],
};
const BARE = { again: new Set(['again', 'a gain', 'what', 'what what', 'pardon', 'i beg your pardon', 'beg your pardon', 'huh', 'again again', 'say again']), slow: new Set(['slowly', 'slower', 'slow', 'more slowly', 'slow down', 'slowly slowly']), interp: new Set(['farsi', 'persian']) };
const WEAK = new Set(['sorry', 'excuse', 'me', 'oh', 'please', ...FILLER]);     // "Sorry?" asks for a repeat; "Sorry." is an apology
const NOT_WANTED = /\b(?:not|never) (?:need |want |have to |need to |want to )?(?:an? |the |to )?(?:interpreter|translator|repeat)\b|\bno (?:need for (?:an? )?)?(?:interpreter|translator)\b/;
const ORDER = ['interp', 'lost', 'slow', 'again'];

// Is this a request for help with understanding rather than an answer?
// Returns null, or { kind, kinds, slow, weak }:
//   kind  'lost' (did not understand) | 'again' (say it again) | 'slow' (more slowly) | 'interp' (an interpreter, Farsi)
//   slow  the line should be said again slowly (everything except a plain "again")
//   weak  only "Sorry" / "Excuse me" was heard — a request if said as a question, an apology if not
// `strict` is for the written text of a reply: there "slow down" (said to a driver) is not about speech.
export function repairKind(text, { strict = false } = {}) {
  const s = tokens(text).map(repairWord).join(' ').replace(/\bunder stand\b/g, 'understand').replace(/\ba gain\b/g, 'again');
  const words = s.split(' ').filter(Boolean);
  if (!words.length) return null;
  const sorryFor = s.match(/^(?:oh )?i am (?:so |very |really )?sorry (.+)$/);          // "I'm sorry again" is an apology, "I'm sorry, what?" is not
  const bare = sorryFor && sorryFor[1] === 'again' ? 'i am sorry again' : words.filter((w) => !SOFT.has(w)).join(' ');
  const mine = /^(?:(?:okay|ok|yes|sure|well|so|oh|sorry) )*(?:i|we) (?:will|can|could|should|am going to|have to|need to) (?!not\b)/.test(s) || /^let (?:me|us) /.test(s);   // "I will say it again" offers, it does not ask
  const kinds = [];
  for (const kind of ORDER) {
    let hit = REPAIR[kind].some((re) => re.test(s)) && !(mine && kind !== 'lost' && kind !== 'interp');
    if (!hit && !mine && BARE[kind] && BARE[kind].has(bare) && !(strict && bare === 'slow down')) hit = true;
    if (hit && (kind === 'interp' || kind === 'again') && NOT_WANTED.test(s)) hit = false;
    if (hit) kinds.push(kind);
  }
  if (!strict && !kinds.length && words.length <= 3 && words.every((w) => WEAK.has(w)) && words.some((w) => w === 'sorry' || w === 'excuse')) return { kind: 'again', kinds: ['again'], slow: false, weak: true };
  if (!kinds.length) return null;
  return { kind: kinds[0], kinds, slow: kinds.some((k) => k !== 'again'), weak: false };
}

// "I don't know", "I'm not sure", "No idea": an honest non-answer. It may only be matched to a reply that says the same.
export function saysUnknown(text) {
  const s = (Array.isArray(text) ? text : tokens(text)).join(' ');
  return /\b(?:not|never) (?:really |so |very |too |quite )?(?:know|no|sure|certain|remember)\b|\bno idea\b|\bnot have any idea\b/.test(s);
}

// ---- does a reply say something else than what was heard? -----------------------------------
const AGREE = new Set(['yes', 'yeah', 'yep', 'sure', 'okay', 'ok']);
const YESSES = new Set(['yes', 'yeah', 'yep']);
const POLITE = new Set(['please', 'thank', 'thanks', 'you', 'sorry', 'sir', 'officer', 'very', 'much', 'so']);
// words that carry no content of their own: a reply is never chosen on these alone (unless one of its key words was heard)
const FUNC = new Set(('i you he she it we they me him her us them my your his our their mine yours this that these those there '
  + 'am is are was were be been being do does did have has had can could will would shall should may might must '
  + 'a an the to of in on at for with from by about and or but so if then than as '
  + 'yes yeah yep no not never okay ok sure please thank thanks sorry hello hi hey oh well '
  + 'like want need get got go going let just very much too some any more all what where when who how which why').split(' '));

// The parts of a sentence, split at its punctuation: "No, thank you. I have a bag." -> [no] [thank you] [i have a bag].
function clausesOf(text, n) {
  const ids = [];
  String(text || '').replace(/([.?!,;])\s+/g, '$1\u0001').split('\u0001').forEach((part, ci) => { for (let k = tokens(part).length; k > 0; k--) ids.push(ci); });
  return ids.length === n ? ids : new Array(n).fill(0);
}

// Would `target` mean the opposite of what was heard?
//  1. A "not"/"no" of the target was not heard —
//     · inside a part of the sentence of which other words were heard: "I can't breathe" heard as "I can breathe"
//       (unless those words came with a "no" of their own: "No appointment" for "I don't have an appointment");
//     · or it is the answer word itself ("No." / "No, thank you") and "yes" was heard, or nothing was heard that carries
//       the answer in another way: no other negative word ("I don't have insurance"), no word of content, no key word.
//     A negative part that was simply not said changes nothing: "No problem. I'll turn the heat on." / "I'll turn the heat on".
//  2. A "not"/"no" was heard that the target does not have: where the target has none at all ("Okay, thank you" /
//     "No, thank you"), where it says yes ("Yes, I do" / "No, I do"), or next to words of a part that is not negative.
//     `said` holds the places of the heard negative words that belong to a key phrase of the reply ("no" for
//     "That's all, thank you."; "not a gift" for "No, it's for me."): those are part of the reply's meaning.
function oppositeOf(target, t, hrd, al, said = new Set(), keyWord = false) {
  const cl = clausesOf(target, t.length);
  const ok = (i) => al[i].m >= 0.6;
  const by = new Map();                                     // heard word -> the target word it was taken for
  al.forEach((a, i) => { if (a.m >= 0.6) by.set(a.j, i); });
  const idx = t.map((_, i) => i);
  const negIn = (c) => idx.some((i) => cl[i] === c && NEG.has(t[i]));
  // the target word a heard word stands for: the one it was lined up with, or else the same word anywhere in the target
  const meant = (j) => (by.has(j) ? by.get(j) : j >= 0 && j < hrd.length ? idx.find((k) => wordMatch(t[k], hrd[j]) >= 0.9) : undefined);
  const extraYes = hrd.some((w, j) => YESSES.has(w) && !by.has(j));
  for (const i of idx) {
    if (!NEG.has(t[i])) continue;
    const mates = idx.filter((k) => k !== i && cl[k] === cl[i] && !NEG.has(t[k]));
    const answer = mates.every((k) => POLITE.has(t[k]));          // "No." / "No, thank you": the answer word itself
    if (ok(i)) {
      // heard, but in front of words of another, positive part: "No milk" for "With milk, no sugar."
      const next = meant(al[i].j + 1);
      if (!answer && next != null && cl[next] !== cl[i] && !negIn(cl[next])) return true;
      continue;
    }
    if (answer && extraYes) return true;
    if (answer && idx.some((k) => k !== i && t[k] === t[i] && ok(k))) continue;      // heard once, and the reply has it twice ("No. There is no charge.")
    if (!answer) {
      const heardMates = mates.filter(ok);
      if (!heardMates.length) continue;
      const first = Math.min(...heardMates.map((k) => al[k].j));
      if (!hrd.slice(Math.max(0, first - 2), first).some((w) => NEG.has(w))) return true;
      continue;
    }
    if (extraYes || !(keyWord || hrd.some((w) => NEG.has(w)) || idx.some((k) => k !== i && ok(k) && !POLITE.has(t[k]) && !LITTLE.has(t[k]) && !NEG.has(t[k])))) return true;
  }
  const hasNeg = t.some((w) => NEG.has(w)), agrees = t.some((w) => AGREE.has(w));
  for (let j = 0; j < hrd.length; j++) {
    if (!NEG.has(hrd[j]) || by.has(j) || said.has(j)) continue;
    if (hrd[j - 1] === hrd[j] || hrd[j + 1] === hrd[j]) continue;          // "no, no, thank you"
    if (!hasNeg) return true;
    if (hrd[j] === 'no') { const next = meant(j + 1); if (agrees || (next != null && !negIn(cl[next]))) return true; continue; }     // "No milk" for "With milk, no sugar."
    let k = j - 1;
    while (k >= 0 && !by.has(k)) k--;
    if (k < 0) { k = j + 1; while (k < hrd.length && !by.has(k)) k++; }
    if (k >= 0 && k < hrd.length && !negIn(cl[by.get(k)])) return true;
  }
  return false;
}

// Words of which only one can be meant: when the reply has one that was not heard and another of the same
// group was heard instead ("three months" / "six months", "My back hurts" / "My head hurts", "pay now" / "pay later"),
// the learner said something else. The family group is only used where the learner gives their own details.
const group = (list) => new Set(list.split(' '));
const CLASH = [
  group([...ONES, ...TENS.filter(Boolean), 'hundred', 'thousand'].filter((w) => w !== 'oh').join(' ')),
  group('monday tuesday wednesday thursday friday saturday sunday'),
  group('january february march april june july august september october november december'),
  group('now later'), group('today tomorrow tonight yesterday'), group('morning afternoon evening night'),
  group('minute hour day week month year'),
  group('head back stomach chest knee leg arm tooth throat ear eye foot feet hand finger shoulder neck heart hip wrist ankle elbow'),
  group('small medium large'),
];
const KIN = group('son daughter husband wife brother sister mother father grandson granddaughter grandmother grandfather friend neighbor family children');
for (const g of [FUNC, ...CLASH, [...ORD_ONES, ...ORD_TENS.filter(Boolean)]]) for (const w of g) EXACT.add(w);
// Places: "Is there a hospital near here?" is not "Is there a bank near here?". Kept out of the exact-word list
// above, so a place word the recogniser spells a little differently is still recognised. Words for the same kind
// of place count as one ("drugstore" / "pharmacy" / "CVS", "ATM" / "bank").
const PLACE = group('bank atm hospital pharmacy drugstore drug cvs walgreens walgreen supermarket grocery library clinic restaurant school airport church mosque hotel museum mall post station');
const PLACE_SAME = { drugstore: 'pharmacy', drug: 'pharmacy', cvs: 'pharmacy', walgreen: 'pharmacy', grocery: 'supermarket', atm: 'bank' };
const singular = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const groupOf = (w, groups) => { const c = CARDINAL.get(w) || w; return groups.findIndex((g) => g.has(c) || g.has(singular(c)) || g.has(c.replace(/ies$/, 'y'))); };
function clashes(t, hrd, al, own) {
  const groups = own ? [...CLASH, PLACE, KIN] : [...CLASH, PLACE];
  const value = (w) => { const v = singular((CARDINAL.get(w) || w).replace(/ies$/, 'y')); return PLACE_SAME[v] || v; };
  // homophones do not count here: "for" is not "four". A target word counts as heard when it was lined up with a heard word.
  for (let g = 0; g < groups.length; g++) {
    const want = t.filter((w) => groupOf(w, groups) === g).map(value), got = hrd.filter((w) => groupOf(w, groups) === g).map(value);
    if (!want.length || !got.length) continue;
    const missing = t.some((w, i) => groupOf(w, groups) === g && al[i].m < 0.6 && !got.includes(value(w)));
    if (missing && got.some((v) => !want.includes(v))) return true;
    if (groups[g] === PLACE && got.some((v) => !want.includes(v))) return true;      // "a hospital near the bank" asks about the hospital
  }
  return false;
}

// Choose which suggested reply the learner most likely said.
// A reply can be chosen when enough of it was heard (or one of its key words was), at least one word
// with content was among them, and it does not say something else than what was heard: not the
// opposite ("Okay, thank you" is never chosen for "No, thank you") and not another number, day or
// part of the body. Among those, the one that also explains most of what was heard wins — so the
// longer of "Here you go." / "Here you go. Can you help me with my bag?" is chosen when the longer
// one was said — and an exactly heard word beats a merely similar one (grandmother / grandfather).
// A key word that is only a little word ("yes", "no", "i can") does not carry a reply when the learner
// also said something the reply does not have: "No, it's for my grandson" is not "No, it's for me."
// Words that only echo the question (`ask`, the partner's line) are not counted as something new.
//
// verdict: 'match'  — replies[index];
//          'repeat' — the learner asked to hear it again or said they did not understand (see
//                     repairKind; `repair` is the kind, `slow` whether to say it slowly). The turn must
//                     not move on. Where the turn itself offers such a request as a reply ("Could you
//                     say that again, please?"), that reply is the match instead.
//          'own'    — an open turn (name, address, date …) and the learner said their own answer;
//          'unsure' — could not tell: the learner is asked to say it again or to tap. Never "wrong".
//          'silent' — nothing was heard.
export function pickReply(replies, heardText, open = false, ask = '') {
  const hrd = sameSound(tokens(heardText));
  if (!hrd.length) return { index: -1, verdict: 'silent' };
  if (hrd.every((w) => FILLER.has(w) || w === 'oh' || w === 'well' || w === 'so')) return { index: -1, verdict: 'unsure', score: 0 };
  const rep = repairKind(heardText), unknown = !rep && saysUnknown(hrd);
  const plain = (w) => (w === 'thanks' ? 'thank' : singular(w));                 // key words are compared in their plain form: thanks / thank, bags / bag
  const heardJoined = ' ' + hrd.map(plain).join(' ') + ' ';
  const options = replies.map((r) => [...tokens(r.en), ...(r.keys || []).flatMap((k) => tokens(k))]);
  const heardNoIdiom = heardJoined.replace(/ no (?=(?:problem|problems|worries|worry) )/g, ' ');     // "No problem" is not "No"
  const echo = / or /.test(' ' + tokens(ask).join(' ') + ' ') ? [] : tokens(ask).filter((w) => !FUNC.has(w));
  let near = 0;
  const list = [];
  // a bare "no" key does not win when the learner said exactly a key phrase of another reply: "No, I'm okay" is not "No."
  const saidAll = hrd.filter((w) => w !== 'please' && !FILLER.has(w)).map(plain).filter((w, j, a) => w !== a[j - 1]).join(' ');     // "No, no, I'm okay" is "No, I'm okay"
  // … nor when a "no …" key phrase of another reply is anywhere in the answer: "No, I'm okay, thank you" is not "No." either
  const saidDedup = ' ' + saidAll + ' ';
  const longHit = replies.map((r) => (r.keys || []).map((k) => tokens(k)).some((k) => k.length > 1 && (k.map(plain).join(' ') === saidAll || (k[0] === 'no' && saidDedup.includes(' ' + k.map(plain).join(' ') + ' ')))));
  replies.forEach((r, i) => {
    const t = tokens(r.en), sc = scoreSpeech(r.en, heardText);
    const al = sc.tokens.map((p) => ({ m: p.ok ? 1 : 0, j: p.j }));
    const keys = (r.keys || []).map((k) => tokens(k)).filter((k) => k.length && !(k.length === 1 && k[0] === 'no' && longHit.some((x, j) => x && j !== i)) && (k.length === 1 && k[0] === 'no' ? heardNoIdiom : heardJoined).includes(' ' + k.map(plain).join(' ') + ' '));
    // the kinds of request this reply itself makes; its key words may add to them ("repeat", "again"), never make one of a plain answer
    const own = rep && repairKind(r.en, { strict: true });
    const kinds = own ? new Set([...own.kinds, ...(r.keys || []).flatMap((k) => { const x = repairKind(k, { strict: true }); return x ? x.kinds : []; })]) : null;
    const shares = !!(kinds && rep.kinds.some((k) => kinds.has(k)));
    const said = new Set();                               // where the heard "no" / "not" of a key phrase stand
    for (const k of keys) { const at = hrd.findIndex((_, j) => k.every((w, x) => hrd[j + x] != null && plain(hrd[j + x]) === plain(w))); if (at >= 0) k.forEach((w, x) => { if (NEG.has(w)) said.add(at + x); }); }
    const keyHit = keys.length > 0, keyWord = keys.some((k) => k.some((w) => !FUNC.has(w)));
    const off = oppositeOf(r.en, t, hrd, al, said, keyWord) || clashes(t, hrd, al, open);
    if (off && !shares) return;
    const s = keyHit ? Math.max(sc.score, 0.45) + 0.2 : sc.score;
    const content = t.map((w, k) => k).filter((k) => !FUNC.has(t[k]));
    const taken = new Set(al.filter((a) => a.m).map((a) => a.j));
    // something the learner said that neither this reply, nor its key words, nor the question has
    const known = [...t, ...echo, ...keys.flat()];
    const stray = hrd.some((w, j) => !taken.has(j) && !FUNC.has(w) && !FILLER.has(w) && !known.some((q) => wordMatch(q, w) >= 0.9));
    const enough = !off && s >= 0.6 && (keyWord || content.some((k) => sc.tokens[k].ok || hrd.some((w) => wordMatch(t[k], w) >= 0.9)) || ((keyHit || !content.length) && !stray))
      && !(open && stray)           // where the learner gives their own details, their own words are shown ("My last name is Rezaei")
      && !hrd.some((w, j) => !taken.has(j) && !FUNC.has(w) && !known.some((q) => wordMatch(q, w) >= 0.9) && options.some((o, k) => k !== i && o.some((q) => wordMatch(q, w) >= 0.9)));    // a word of another reply: "I'm looking for milk" is not "I'm looking for bread."
    const whole = keys.some((k) => k.length > 1 && k.map(plain).join(' ') === saidAll);     // the learner said exactly one of this reply's key phrases
    if (!enough) near = Math.max(near, Math.min(s, 0.59));
    const fit = (2 * sc.score * sc.precision) / ((sc.score + sc.precision) || 1) + (keyHit ? 0.2 : 0);
    list.push({ i, s, fit, quality: sc.quality, enough, full: enough && ((sc.score >= 0.8 && sc.precision >= 0.8) || whole), shares, unknown: saysUnknown(t) || keys.some((k) => saysUnknown(k)) });
  });
  const best = (pool) => pool.reduce((a, b) => (!a || b.fit > a.fit + 1e-9 || (Math.abs(b.fit - a.fit) <= 1e-9 && b.quality > a.quality) ? b : a), null);
  const match = (x) => ({ index: x.i, verdict: 'match', score: x.s });
  if (rep) {
    // only a reply that was said in full, or one that makes the same request, can be meant; otherwise the partner says it again
    const x = best(list.filter((c) => c.full)) || best(list.filter((c) => c.shares));
    return x ? match(x) : { index: -1, verdict: 'repeat', repair: rep.kind, slow: rep.slow, score: near };
  }
  const x = best(list.filter((c) => c.enough && (!unknown || c.unknown)));
  if (x) return match(x);
  if (open) return { index: -1, verdict: 'own', score: near };      // their own name, date, address…
  return { index: -1, verdict: 'unsure', score: near };
}

const PROPER = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|april|june|july|august|september|october|november|december)\b/g;

// Gentle corrections for mistakes Farsi speakers often make (rules come from content/corrections.json).
// Every rule that fits is applied, in order, so "I want buy milk in tuesday" gets both of its
// fixes. The learner's own capitals (names, places) are kept. Returns null when nothing needs fixing,
// otherwise { id, ids, fixed, why } — `why` joins the explanations of the rules that were used.
export function correct(text, rules) {
  const said = String(text || '').trim();
  if (!said) return null;
  let s = said.replace(/[.!?]+$/, '');
  const ids = [], whys = [];
  for (const r of rules || []) {
    let re;
    try { re = new RegExp(r.match, 'i'); } catch { continue; }
    if (!re.test(s)) continue;
    s = s.replace(re, r.fix).replace(/\s+/g, ' ').trim();
    ids.push(r.id);
    if (r.why && !whys.includes(r.why)) whys.push(r.why);
  }
  if (!ids.length) return null;
  s = (s.charAt(0).toUpperCase() + s.slice(1)).replace(/\bi\b/g, 'I').replace(PROPER, (w) => w.charAt(0).toUpperCase() + w.slice(1));
  const question = /\?$/.test(said) || /^(how|what|where|when|who|why|can|could|do|does|did|is|are|may|would|will)\b/i.test(s);
  return { id: ids[0], ids, fixed: s + (question ? '?' : '.'), why: whys.join(' ') };
}

// Sound tips worth showing for the words that were not understood.
export function tipsFor(words, soundTips, max = 2) {
  const out = [];
  for (const tip of soundTips || []) {
    let re;
    try { re = new RegExp(tip.test, 'i'); } catch { continue; }
    const hit = words.find((w) => re.test(w));
    if (hit) out.push({ ...tip, word: hit });
    if (out.length >= max) break;
  }
  return out;
}
