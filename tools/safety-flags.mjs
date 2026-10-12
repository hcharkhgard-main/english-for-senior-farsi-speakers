// Which lessons, conversations and papers must carry "safetyCritical": true (used by tools/validate-content.mjs).
//
// The flag sends an item to the extra factual review (review/safety-critical.md), keeps the live AI partner away
// from it and draws its note in red. Until QA round 4 it depended on someone remembering to set it, checked only
// for a fixed list of ids (security L3). This rule protects the next additions: an item is safety-critical when its
// scenario is a clinic, pharmacy, bank or emergency, or when its note or introduction speaks of 911, passwords or
// PINs, scams, gift cards, medical or legal advice, generators or carbon monoxide.
//
// "safetyCritical": false written in a lesson or conversation file records a decision that the item is not
// (its note mentions such a thing in passing, e.g. a delivery job where "the courier never asks for your PIN"):
// the rule then lets it be. Papers have no such opt-out (content.mjs reads their flag as true/false).
export const SAFETY_SCENARIOS = new Set(['clinic', 'pharmacy', 'bank', 'emergency']);
// «رمز» alone, but not «رمزِ در» (a door code)
export const SAFETY_WORDS = /۹۱۱|\b911\b|رمز(?!ِ?\s*(?:در|ساختمان)(?:[\s.،؛]|$))|کلاه‌?\s?برداری|کارت\s*هدیه|\bPIN\b|توصیه[ٔ‌]?\s*ی?\s*پزشکی|مشاوره[ٔ‌]?\s*ی?\s*حقوقی|ژنراتور|مونوکسید/;

const texts = (x) => [x.note, x.intro].filter((v) => typeof v === 'string').join(' \n ');

// [{ where, why }] for every item that needs the flag and does not have it
export function safetyFlagProblems(content) {
  const out = [];
  const check = (kind, x, optOut) => {
    if (!x || x.safetyCritical === true || (optOut && x.safetyCritical === false)) return;
    const word = SAFETY_WORDS.exec(texts(x));
    if (SAFETY_SCENARIOS.has(x.scenario)) out.push({ where: `${kind} ${x.id}`, why: `scenario "${x.scenario}"` });
    else if (word) out.push({ where: `${kind} ${x.id}`, why: `its note or introduction mentions «${word[0]}»` });
  };
  for (const L of Object.values(content.lessons || {})) check('lesson', L, true);
  for (const R of content.roleplays || []) check('conversation', R, true);
  for (const P of content.papers || []) check('paper', P, false);
  return out;
}
