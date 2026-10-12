// «جملهٔ خودِ شما»: the learner's own details (settings → «اطلاعات من») as the English sentences the lessons teach,
// and the list of recorded pieces — letters, digits, numbers, ordinals, months — each sentence is played from.
// Plain functions, no DOM: used by the app, by tools/content.mjs (which asks for the recordings) and by the tests.
// The details themselves never leave the phone: nothing here is sent anywhere, and no recording contains them.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// the years offered for a date of birth (also the years the recordings can say)
export const YEARS = { from: 1920, to: 2010 };

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINAL = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };

// 0 … 99 the way it is said: "zero", "fourteen", "fifty-five"
export function numberWord(n) {
  n = Math.floor(Number(n));
  if (!(n >= 0 && n <= 99)) return '';
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
}

// 1 … 99 as a day of the month is said: "first", "fourteenth", "twenty-first", "thirtieth"
export function ordinalWord(n) {
  const w = numberWord(n);
  if (!w || n < 1) return '';
  const cut = w.lastIndexOf('-') + 1, last = w.slice(cut);
  return w.slice(0, cut) + (ORDINAL[last] || (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th'));
}

// 14 -> "14th", the way a date is written
export function ordinalDigits(n) {
  const t = n % 100, u = n % 10;
  return n + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th');
}

// A year is said in two pairs: 1955 "nineteen fifty-five", 1905 "nineteen oh five", 2010 "twenty ten".
// The years 2000–2009 are "two thousand", "two thousand five". Returns the pieces, one recording each.
export function yearWords(y) {
  y = Math.floor(Number(y));
  if (!(y >= 1000 && y <= 2099)) return [];
  const a = Math.floor(y / 100), b = y % 100;
  if (y >= 2000 && y <= 2009) return b ? ['two thousand', ONES[b]] : ['two thousand'];
  if (b === 0) return [numberWord(a), 'hundred'];
  return b < 10 ? [numberWord(a), 'oh', ONES[b]] : [numberWord(a), numberWord(b)];
}

export const daysIn = (m, y) => (m === 2 ? ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 || !y ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);

// The date of birth is kept as one text, "1955-12-14"; a part not chosen yet is 0 ("0-12-0").
// Anything else (damaged storage) reads as "nothing chosen".
export function parseBorn(s) {
  const m = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(typeof s === 'string' ? s : '');
  const out = { y: 0, m: 0, d: 0 };
  if (!m) return out;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y >= YEARS.from && y <= YEARS.to) out.y = y;
  if (mo >= 1 && mo <= 12) out.m = mo;
  if (d >= 1 && d <= (out.m ? daysIn(out.m, out.y) : 31)) out.d = d;
  return out;
}
export const formatBorn = (b) => `${b.y || 0}-${b.m || 0}-${b.d || 0}`;
export const bornComplete = (b) => !!(b && b.y && b.m && b.d && b.d <= daysIn(b.m, b.y));

// full years between the date of birth and today
export function ageOn(b, now = Date.now()) {
  if (!bornComplete(b)) return null;
  const t = new Date(now);
  const before = t.getMonth() + 1 < b.m || (t.getMonth() + 1 === b.m && t.getDate() < b.d);
  return t.getFullYear() - b.y - (before ? 1 : 0);
}

// "Maryam Ahmadi" -> { first: 'Maryam', last: 'Ahmadi' }; one word is a first name only.
// Only names written with English letters count: the sentences are English, and so are the letters to spell.
const NAME = /^[A-Za-z][A-Za-z'’.-]*$/;
export function nameParts(full) {
  const words = String(full || '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length || !words.every((w) => NAME.test(w) && w.length <= 40)) return { first: '', last: '' };
  return words.length === 1 ? { first: words[0], last: '' } : { first: words.slice(0, -1).join(' '), last: words[words.length - 1] };
}
// the letters of a name, as they are said when it is spelled: "Karimi" -> ['K','A','R','I','M','I']
export const spellOut = (name) => String(name || '').toUpperCase().replace(/[^A-Z]/g, '').split('');

// A US phone number as it is written ("310-555-0199") and its digits. Other lengths are left as typed.
export function phoneParts(text) {
  let d = String(text || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length < 7 || d.length > 15) return null;
  const show = d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d.length === 7 ? `${d.slice(0, 3)}-${d.slice(3)}` : String(text).trim().replace(/\s+/g, ' ');
  return { digits: d.split(''), show };
}

// The beginnings and ends of the sentences (recorded once, like every other piece).
export const CARRIERS = { phone: 'My phone number is', age1: 'I am', age2: 'years old.', spelled: "It's spelled", born: 'I was born on' };

// Which sentences a lesson's last screen can build: curriculum.json "mine" names them by kind.
export const OWN_KINDS = ['phone', 'age', 'name', 'address', 'born'];

// The learner's own sentences of the given kinds, in that order. A kind whose detail is missing gives no line.
//   en     the sentence as it is written
//   words  how the number or date in it is said, when that differs from what is written (else null)
//   say    the recorded pieces that say it, in order — or null when no recording can (a name, an address)
export function ownLines(me, kinds, now = Date.now()) {
  const out = [];
  me = me || {};
  const born = parseBorn(me.born);
  for (const kind of kinds || []) {
    if (kind === 'phone') {
      const p = phoneParts(me.phone);
      if (p) {
        const w = p.digits.map((d) => ONES[+d]);
        // written the way it is said: digit by digit, with a short stop where the number has a dash
        const groups = /^[\d-]+$/.test(p.show) ? p.show.split('-').map((g) => g.split('').map((d) => ONES[+d]).join(' ')).join(', ') : w.join(' ');
        out.push({ kind, en: `My phone number is ${p.show}.`, words: groups, say: [CARRIERS.phone, ...w] });
      }
    } else if (kind === 'age') {
      const age = ageOn(born, now);
      if (age != null && age >= 1 && age <= 99) out.push({ kind, en: `I am ${numberWord(age)} years old.`, words: null, say: [CARRIERS.age1, numberWord(age), CARRIERS.age2] });
    } else if (kind === 'name') {
      const { first, last } = nameParts(me.name);
      if (first && last) out.push({ kind, en: `My first name is ${first}.`, words: null, say: null }, { kind, en: `My last name is ${last}.`, words: null, say: null });
      else if (first) out.push({ kind, en: `My name is ${first}.`, words: null, say: null });
      const letters = spellOut(last || first);
      if (letters.length) out.push({ kind: 'spelled', en: `It's spelled ${letters.join('-')}.`, words: null, say: [CARRIERS.spelled, ...letters] });
    } else if (kind === 'address') {
      const a = String(me.address || '').trim().replace(/\s+/g, ' ').replace(/[.,;]+$/, '');
      if (a) out.push({ kind, en: `I live at ${a}.`, words: null, say: null });
    } else if (kind === 'born') {
      if (bornComplete(born)) {
        const y = yearWords(born.y);
        out.push({ kind, en: `I was born on ${MONTHS[born.m - 1]} ${ordinalDigits(born.d)}, ${born.y}.`, words: `${MONTHS[born.m - 1]} ${ordinalWord(born.d)}, ${y.join(' ')}`, say: [CARRIERS.born, MONTHS[born.m - 1], ordinalWord(born.d), ...y] });
      }
    }
  }
  return out;
}

// Which of the kinds cannot be built yet because «اطلاعات من» does not have the detail.
export function ownMissing(me, kinds, now = Date.now()) {
  const have = new Set(ownLines(me, kinds, now).map((l) => (l.kind === 'spelled' ? 'name' : l.kind)));
  return (kinds || []).filter((k) => !have.has(k));
}

// Every piece a sentence above can ask for: tools/content.mjs puts them in the list for the voice generator
// (pack "me"), and tests/unit/audiokey.test.js checks that nothing is missing.
export function ownPieces() {
  const set = new Set(Object.values(CARRIERS));
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') set.add(c);
  for (let n = 0; n <= 99; n++) set.add(numberWord(n));
  for (let d = 1; d <= 31; d++) set.add(ordinalWord(d));
  for (const m of MONTHS) set.add(m);
  for (let y = YEARS.from; y <= YEARS.to; y++) for (const w of yearWords(y)) set.add(w);
  set.add('oh');      // "nineteen oh five": not needed for the years offered today, kept for when the list of years grows
  return [...set];
}
