// Which sound packs to keep on the phone ahead of time, so that what the learner will do next also works
// without a connection: the next lesson, the next review sets, number listening, the papers that go
// with the lessons done so far, and the conversations of those lessons (the done screen's main next step,
// and what «تمرین مکالمه» lists; QA round 4, features M1). Without this, a learner who did one lesson online found the review words,
// the numbers and the papers silent the next day on the bus (QA round 3, features M1).
//
// Pure functions of the saved state, the curriculum and audio/index.json; main.js fetches the packs
// (audio.keep) while the app is open with a connection, and Settings shows the same parts as "ready" or
// "not yet" (views/settings.js).
import { audioKey } from './audiokey.js';
import { nextLesson, todaysSet, reviewPool, todayOffer } from './learn.js';

const NEW_AHEAD = 40;        // words and sentences not yet met, from the head of the review pool (about two days of new items)
const DAYS_AHEAD = 3;        // reviews that fall due within this many days

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

// the pack that holds a clip, or null when it has no recording yet (the device voice is used then)
function packOf(index, lang, voice, speed, text) {
  if (!text) return null;
  const hit = index.clips[audioKey(lang, voice, speed, text)];
  return hit && index.packs[hit[0]] ? index.packs[hit[0]].id : null;
}

// the packs a review card of this item plays from: natural and slow speed, and (ex) a word's example sentence —
// examples are recorded in many different lesson packs, so they are fetched only for the sets of the next two days
function itemPacks(index, content, id, ex = true) {
  const out = [];
  if (id.startsWith('p:')) {
    const [, lid, pid] = id.split(':');
    const L = own(content.lessons, lid) ? content.lessons[lid] : null;
    const p = L && Array.isArray(L.phrases) ? L.phrases.find((x) => x.id === pid) : null;
    if (!p) return out;
    for (const text of new Set([p.say, p.en])) for (const speed of ['n', 's']) out.push(packOf(index, 'en', p.voice || 's', speed, text));
  } else {
    const w = (content.vocab || []).find((x) => x.id === id);
    if (!w) return out;
    for (const speed of ['n', 's']) out.push(packOf(index, 'en', 's', speed, w.en));
    if (ex && w.ex) out.push(packOf(index, 'en', 's', 'n', w.ex.en));
  }
  return out.filter(Boolean);
}

const doneIds = (state) => Object.keys((state && state.done) || {});

// The packs of each part, as { lesson, review, numbers, papers, talks } (arrays of pack ids, no repeats).
export function aheadParts(state, content, index, day) {
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const deps = (id) => (index.deps && index.deps[id]) || (index.packs.some((p) => p.id === id) ? [id] : []);
  // today's lesson (the one «درس امروز» opens)
  const next = nextLesson(state, content);
  const lesson = next ? deps('l-' + next.id) : [];
  // the next review sets: what is due within a few days, and the new items that come next
  const soon = new Set(), ids = new Set();
  for (let d = day; d <= day + DAYS_AHEAD; d++) for (const id of todaysSet(state, content, d).queue) (d <= day + 1 ? soon : ids).add(id);
  for (const id of reviewPool(state, content).filter((x) => !own(state.srs, x)).slice(0, NEW_AHEAD)) ids.add(id);
  const review = uniq([...[...soon].flatMap((id) => itemPacks(index, content, id)), ...[...ids].filter((id) => !soon.has(id)).flatMap((id) => itemPacks(index, content, id, false))]);
  // number listening is offered from the first lessons on
  const numbers = doneIds(state).length && (content.numbers || []).length ? deps('n-numbers') : [];
  // papers: those of stage 1, and those that go with a lesson done or next
  const near = new Set([...doneIds(state), next && next.id].filter(Boolean));
  const papers = uniq((Array.isArray(content.papers) ? content.papers : [])
    .filter((P) => P.stage === 1 || (P.lesson && near.has(P.lesson)))
    .flatMap((P) => (P.lines || []).map((l) => packOf(index, 'en', 's', 'n', l.en))));
  // conversations: every one that practises a lesson done or next (each lesson's conversations, main one first),
  // and the one «درس امروز» offers once the path is finished. A conversation's lines may be recorded in its
  // lessons' packs too, so all the packs it plays from are kept (index.deps).
  const all = content.practiceAll || {};
  const talkIds = new Set([...near].flatMap((id) => (own(all, id) && Array.isArray(all[id]) ? all[id] : [])));
  let offer = null;
  try { offer = todayOffer(state, content); } catch { offer = null; }
  if (offer && offer.kind === 'talk' && offer.id) talkIds.add(offer.id);
  const talks = uniq([...talkIds].filter((rid) => (content.roleplays || []).some((r) => r.id === rid)).flatMap((rid) => deps('r-' + rid)));
  return { lesson: uniq(lesson), review, numbers: uniq(numbers), papers, talks };
}

// All of them, in the order they are fetched: the most likely next use first.
export function aheadPacks(state, content, index, day) {
  const p = aheadParts(state, content, index, day);
  return [...new Set([...p.lesson, ...p.talks, ...p.review, ...p.numbers, ...p.papers])];
}
