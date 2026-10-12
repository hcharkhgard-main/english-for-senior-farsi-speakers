// Finds the English (left-to-right) parts inside a Farsi sentence, so each can be shown as its
// own isolated left-to-right piece. Without this the browser's bidirectional algorithm moves
// things around: "$3.99" becomes "3.99$", "212-555-0142" becomes "0142-555-212", and an
// English phrase that wraps onto a second line is cut in the wrong place.
//
// splitMixed(text) -> [{ text, ltr: boolean, en: boolean }]
//   ltr: show this piece left-to-right, isolated;  en: it contains English words (mark lang="en").
// No DOM here, so the rules can be unit-tested.

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LAT = 'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF';
const ALNUM = new RegExp(`[${LAT}0-9]`);
const LETTER = new RegExp(`[${LAT}]`);
// a run starts at a letter, a digit, or "$"/"#" before a digit; it may continue over English
// punctuation and spaces, and it always ends on a letter, a digit or "%".
const RUN = new RegExp(`(?:[$#](?=\\d)|[${LAT}0-9])(?:[${LAT}0-9 \\u00A0'’.,;:!?/&+=%$#@*<>()\\-–—…"]*[${LAT}0-9%])?`, 'g');
const ABBREV = /(?:^|[\s(])(?:Mr|Mrs|Ms|Dr|St|Ave|Apt|Blvd|Rd|No|Jr|Sr|vs|etc|a\.m|p\.m|[A-Za-z](?:\.[A-Za-z])+)$/;
const CLOSERS = '»"”’\')';

export const hasArabic = (s) => ARABIC.test(s);
// cheap test: is there anything here that could need isolating?
export const maybeMixed = (s) => /[A-Za-z]|\d[-/]\d|[$#]\d/.test(s);

export function splitMixed(input) {
  const text = String(input);
  if (!maybeMixed(text)) return [{ text, ltr: false, en: false }];
  if (!hasArabic(text)) {
    // an English-only string sitting in a Farsi screen: one isolated piece, outer spaces left alone
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    const out = [];
    if (m[1]) out.push({ text: m[1], ltr: false, en: false });
    out.push({ text: m[2], ltr: true, en: LETTER.test(m[2]) });
    if (m[3]) out.push({ text: m[3], ltr: false, en: false });
    return out;
  }

  const out = [];
  let at = 0;
  const plain = (to) => { if (to > at) out.push({ text: text.slice(at, to), ltr: false, en: false }); at = to; };
  RUN.lastIndex = 0;
  for (let m = RUN.exec(text); m; m = RUN.exec(text)) {
    let start = m.index, end = start + m[0].length;

    // brackets: a run never keeps half of a pair
    let depth = 0, cut = -1, open = -1;
    for (let i = start; i < end; i++) {
      if (text[i] === '(') { if (depth === 0) open = i; depth++; }
      else if (text[i] === ')') { if (depth === 0) { cut = i; break; } depth--; }
    }
    if (cut < 0 && depth > 0) {
      const rest = /^[.?!…]*\)/.exec(text.slice(end));
      if (rest && depth === 1) end += rest[0].length; else cut = open;
    }
    if (cut >= 0) { end = cut; while (end > start && !ALNUM.test(text[end - 1]) && text[end - 1] !== '%') end--; }
    if (end <= start) { RUN.lastIndex = start + 1; continue; }
    let run = text.slice(start, end);

    // what follows the last word: "?" and "!" are English; "…" too; a full stop only when it
    // closes an English phrase (two words or more, an abbreviation, or just before a closing quote)
    let tail = /^[?!]+/.exec(text.slice(end));
    if (tail) end += tail[0].length;
    tail = /^[ \u00A0]?(?:…|\.\.\.)/.exec(text.slice(end));
    if (tail) end += tail[0].length;
    else if (text[end] === '.' && text[end + 1] !== '.' && text[end - 1] !== ')') {
      const words = run.trim().split(/[\s\u00A0]+/).filter((w) => ALNUM.test(w)).length;
      const quoted = CLOSERS.includes(text[end + 1] || '\u0000');
      if (LETTER.test(run) && (words >= 2 || quoted || ABBREV.test(run))) end += 1;
    }
    // a leading "… " belongs to the English phrase when it is not stuck to a Farsi word
    const head = /(?:…|\.\.\.)[ \u00A0]?$/.exec(text.slice(at, start));
    if (head) { const before = text[start - head[0].length - 1]; if (before == null || /[\s«("(]/.test(before)) start -= head[0].length; }

    run = text.slice(start, end);
    RUN.lastIndex = end;
    const en = LETTER.test(run);
    // plain numbers and times (5, 3.99, 10:00) keep their order on their own; leave them alone
    if (!en && !/[^0-9.,:]/.test(run)) continue;
    plain(start);
    out.push({ text: run, ltr: true, en });
    at = end;
  }
  plain(text.length);
  return out;
}
