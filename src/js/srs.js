// Spaced review. Items move through boxes; each box waits longer before the item returns.
// The learner never manages cards: the sets are built for them each day.
//
// The whole plan, as the learner is told it:
//   «هر روز دو دستهٔ کوچک دارید، یکی صبح و یکی عصر، هر کدام حدود پنج دقیقه.
//    هر چه را بلد بودید دیرتر برمی‌گردد و هر چه را بلد نبودید فردا دوباره می‌آید.»
//
// What it can carry (simulated over 120 days with the real course; tests/unit/srs.test.js runs the same simulation):
// 15 cards twice a day keep up with the sentences of a lesson a day and bring new words as fast as the reviews
// leave room. One set a day is enough for the sentences of the lessons and the first 120 words, not for more;
// whatever does not fit waits quietly — the most recent and the longest-waiting things are shown first, and the
// learner is never shown how much is waiting.
export const INTERVALS = [0, 1, 4, 12, 30, 75, 180]; // days to wait in box 0..6
export const LESSON_BOX = 2;       // sentences of a finished lesson start here: they were just practised several times
export const KNOWN_BOX = 3;        // a new word the learner already knew at first sight: it need not cost four reviews
export const SESSION_MAX = 15;     // cards in one set — about five minutes
export const SETS_PER_DAY = 2;     // the daily plan: a morning set and an evening set; more is never asked for
export const NEW_PER_DAY = 6;      // new words a day at most (lesson sentences are not counted: the learner has already practised them)
export const NEW_RESERVED = 3;     // places a day kept for the first, most useful words, however many reviews are waiting
export const LESSON_RESERVED = 2;  // places kept on the day a lesson is finished for its own words ("prescription" after the pharmacy)
export const OLDEST_KEPT = 4;      // places in a set kept for whatever has waited longest, so nothing is put off for ever
export const CARD_SECONDS = 20;    // an unhurried card: listen, think, look, answer

// entry: { b: box, d: day it is due, n: times answered, l: last day it was answered }
export function grade(entry, knew, day) {
  // a new word that was known at first sight goes straight to a long wait
  if (!entry && knew) return { b: KNOWN_BOX, d: day + INTERVALS[KNOWN_BOX], n: 1, l: day };
  const e = entry ? { ...entry } : { b: 0, d: day, n: 0 };
  e.b = Math.min(Math.max(0, Math.floor(Number(e.b)) || 0), INTERVALS.length - 1);      // (damaged storage: a box that does not exist)
  e.n = Number(e.n) || 0;
  const sameDay = e.l === day;                              // a second look on the same day (the repeat at the end of a set)
  const early = day < e.d;                                  // asked before its day (a question inside a lesson)
  const since = e.l ?? e.d - (INTERVALS[e.b] || 0);         // the day it was last practised (a lesson sentence: the day of the lesson)
  e.n += 1;
  e.l = day;
  // not yet: it comes back tomorrow, two boxes lower (not from the very beginning — one slip does not undo weeks of knowing it)
  if (!knew) { e.b = Math.max(1, e.b - 2); e.d = day + 1; return e; }
  if (sameDay || early) return e;                           // knowing it a minute later, or before its day, does not move it further ahead
  // known: one box up. If it had to wait much longer than planned and was still known, the next wait is at least as
  // long as the one it has just survived (two boxes up at most) — so a learner who falls behind is not asked to
  // prove again, step by step, what they plainly still know.
  const top = Math.min(e.b + 2, INTERVALS.length - 1);
  let b = Math.min(e.b + 1, INTERVALS.length - 1);
  while (b < top && INTERVALS[b] < day - since) b++;
  e.b = b;
  e.d = day + INTERVALS[b];
  return e;
}

// srs: { id: entry }   pool: ordered ids the learner may meet (already filtered by level)
// newDay: { d: day, n: new words met that day, c: cards answered that day } — see answered()
// Returns the next set of the day: reviews that are due, then new words.
//  - When more is due than fits, what was learned most recently (the lowest box) goes first — yesterday's new words,
//    the latest lesson and anything answered «هنوز نه» — because that is what is forgotten soonest. The last
//    OLDEST_KEPT review places go to whatever has waited longest, whichever box it is in.
//  - New words fill the places the reviews leave free, up to NEW_PER_DAY a day: the pace follows the learner.
//    Only the first words (opts.core = how many of them are still unmet at the head of the pool) do not wait for a
//    free place: NEW_RESERVED of them come every day. Nor do the words of a lesson finished today (opts.lead: those
//    still unmet, at most LESSON_RESERVED a day — learn.js todaysSet): at a lesson a day the sentence reviews fill
//    both sets, and without these places no word beyond the first ones would ever arrive (QA round 4, M3).
//  - A set that was left half-way is finished first: the next set has only the places that were left.
//   queue  ids for this set               set    1 = the first set of the day, 2 = the second, 3+ = beyond the daily plan
//   nDue / nNew  reviews and new words in it     more   reviews that are due but not in this set (never shown as a number)
export function buildQueue(srs, pool, day, newDay = { d: 0, n: 0 }, opts = {}) {
  const max = opts.max ?? SESSION_MAX;
  const today = newDay && newDay.d === day;
  const usedNew = today ? newDay.n || 0 : 0, cards = today ? newDay.c || 0 : 0;
  const room = max - (cards % max);
  const inPool = new Set(pool);
  const due = Object.entries(srs).filter(([id, e]) => inPool.has(id) && e.d <= day).sort((a, b) => a[1].b - b[1].b || a[1].d - b[1].d);
  const unmet = pool.filter((id) => !srs[id]);
  const coreKeep = Math.max(0, Math.min((opts.reserved ?? NEW_RESERVED) - usedNew, opts.core ?? 0, room));
  // the first words keep their places at the head; the words of today's lesson come straight after them
  // (only while the day's two sets can still carry what is due: a learner who has fallen behind gets no extra words)
  const behind = due.length > Math.max(0, SETS_PER_DAY * max - cards);
  const lead = behind ? [] : (opts.lead || []).filter((id) => inPool.has(id) && !srs[id] && !unmet.slice(0, coreKeep).includes(id));
  const fresh = [...unmet.slice(0, coreKeep), ...lead, ...unmet.slice(coreKeep).filter((id) => !lead.includes(id))].slice(0, Math.max(0, (opts.newPerDay ?? NEW_PER_DAY) - usedNew));
  const keep = Math.max(0, Math.min(coreKeep + lead.length, fresh.length, room));
  const places = room - keep;
  let picked = due;
  if (due.length > places) {
    const nOld = Math.min(opts.oldest ?? OLDEST_KEPT, places);
    const oldest = due.slice(places - nOld).sort((a, b) => a[1].d - b[1].d || a[1].b - b[1].b).slice(0, nOld);
    picked = [...due.slice(0, places - nOld), ...oldest];
  }
  const queue = picked.map(([id]) => id);
  const nDue = queue.length;
  for (const id of fresh) { if (queue.length >= room) break; queue.push(id); }
  return { queue, due: due.length, nDue, nNew: queue.length - nDue, more: due.length - nDue, set: Math.floor(cards / max) + 1 };
}

// The day's count after one more card of a set has been answered (kept in the saved state as newDay).
export function answered(newDay, day, isNew) {
  const today = newDay && newDay.d === day;
  return { d: day, n: (today ? newDay.n || 0 : 0) + (isNew ? 1 : 0), c: (today ? newDay.c || 0 : 0) + 1 };
}

// About how long a set of n cards takes, in whole minutes (what the home screen promises).
export const minutes = (n) => Math.max(1, Math.round((n * CARD_SECONDS) / 60));

// How a card is shown before the answer (the review screen, views/words.js):
//   'read'  the English is on the card with its sound: what does it mean?      (new, or missed last time)
//   'hear'  only the sound: what did you hear, and what does it mean?           (known at least once)
//   'say'   the Farsi is on the card: how do you say it in English?            (every other time, once it is known)
// Lesson sentences take turns between 'hear' and 'say'; a word is heard first and joins the turns from box 3.
// `sayable` is false for items whose Farsi side would give the answer away (a letter of the alphabet, «ID»).
export function cardMode(id, entry, sayable = true) {
  if (!entry || entry.b <= 1) return 'read';
  const phrase = id.startsWith('p:');
  if (!sayable || (!phrase && entry.b < 3)) return 'hear';
  return (entry.n || 0) % 2 ? 'say' : 'hear';
}

export function counts(srs, pool, day) {
  const inPool = new Set(pool);
  let learning = 0, known = 0, due = 0;
  for (const [id, e] of Object.entries(srs)) {
    if (!inPool.has(id)) continue;
    if (e.b >= 4) known++; else learning++;
    if (e.d <= day) due++;
  }
  return { learning, known, due, unseen: pool.length - learning - known };
}
