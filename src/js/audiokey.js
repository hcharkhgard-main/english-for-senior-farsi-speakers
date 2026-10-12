// Stable key for an audio clip. Shared by the app (lookup) and the build tools (generation).
// lang: 'en' | 'fa'   voice: 's' | 'm' | 'b' | 'f'   speed: 'n' (natural) | 's' (slow)
export function audioKey(lang, voice, speed, text) {
  return cyrb53(`${lang}|${voice}|${speed}|${String(text).trim()}`).toString(36);
}

function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// Splits an English sentence into the words a learner can tap to hear one at a time.
// Returns [{ text: 'milk?', word: 'milk' | null }]; word is null when there is nothing to play (digits, symbols).
// `word` is the text of the single-word recording that is asked for (see normWord).
export function wordsOf(sentence) {
  let first = true;      // true for the first word of a sentence ("A table for two." — the article, not the letter)
  return String(sentence).split(/\s+/).filter(Boolean).map((text) => {
    const word = text.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
    const ok = !/\d/.test(text) && /^[A-Za-z][A-Za-z'’-]*$/.test(word) && !/^[A-Z](-[A-Z])+$/.test(word);
    const out = { text, word: ok ? normWord(word, first) : null };
    first = /[.!?:…]["'”’)]*$/.test(text);
    return out;
  });
}

// The words of a vocabulary headword. A headword of one word is heard as its own recording — the letter
// "A" is not the article "a", "ID" is not "iD", "Monday" stays "Monday" — so the recording asked for is
// the headword exactly as written (every headword has a slow recording). A headword of several words
// ("thank you", "seat belt") is heard word by word like any sentence.
export function wordsOfHeadword(en) {
  const words = wordsOf(en);
  return words.length === 1 ? [{ text: words[0].text, word: String(en).trim() }] : words;
}

// The text of the recording for one word of a sentence. `first`: the word begins a sentence.
export function normWord(w, first = true) {
  if (w === 'I' || /^I'/.test(w)) return w;
  if (/^[A-Z]{2,}$/.test(w)) return w;                              // ID, PIN, ATM, TV: kept whole, never "iD" or "tV"
  if (/^[A-Z]$/.test(w)) return w === 'A' && first ? 'a' : w;       // one capital letter is the letter's name ("M as in Mary", "Gate A"); a sentence that begins with "A" begins with the article
  // keep capitalised names and days as written, lower-case sentence-initial common words
  return COMMON_CAPS.has(w) ? w : w.charAt(0).toLowerCase() + w.slice(1);
}

const COMMON_CAPS = new Set(['Maryam', 'Ahmadi', 'Arman', 'David', 'Susan', 'Linda', 'Mike', 'Farsi', 'English', 'Iran', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'March', 'Main', 'Street', 'Oak', 'California', 'Lakeside', 'Maple', 'United', 'States', 'Spanish', 'Mary', 'Ali', 'John', 'Sarah', 'Emma', 'Uber']);
