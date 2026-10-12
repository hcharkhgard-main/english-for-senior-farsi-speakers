// «اطلاعات من»: the learner's own name, address, phone number, date of birth and a family member's number.
// The owner's rule: these are NEVER saved on the device. They live in this one object, in memory, for as long as the
// page is open; closing or reloading the app forgets them. store.js does not know about them (its `toStored` writes
// only the fields of `blank()`, and `migrate` drops a `me` saved by older versions), and nothing in the app waits for
// them: every place that uses them works without them.
//   name, address, phone, contact: short texts; born: "1955-12-14" (a part not chosen yet is 0) — see own.js
export const ME_KEYS = ['name', 'address', 'contact', 'phone', 'born'];
export const ME_MAX = 200;

export const me = Object.seal(Object.fromEntries(ME_KEYS.map((k) => [k, ''])));

export function setMe(key, value) {
  if (!ME_KEYS.includes(key)) return;
  me[key] = typeof value === 'string' ? value.slice(0, ME_MAX) : '';
}
export function clearMe() { for (const k of ME_KEYS) me[k] = ''; }
export const hasMe = () => ME_KEYS.some((k) => me[k] !== '');

// Invitations to fill in «اطلاعات من» (the end of a lesson, the emergency page). They are offered only while the learner
// has not said no in this session, and never when Settings «هیچ‌وقت نپرس» (settings.neverAsk, which is stored: it is
// not personal) is on. Saying no is remembered here, in memory, for this session only.
const session = { declined: false };
export const mayAsk = (state) => !(state && state.settings && state.settings.neverAsk) && !session.declined;
export function decline() { session.declined = true; }

// «پاک کردن همه‌چیز»: the details and the session's answer go too.
export function forgetAll() { clearMe(); session.declined = false; }
