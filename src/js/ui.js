// Small DOM helpers, icons and the shared building blocks every screen uses.
import { splitMixed, maybeMixed } from './bidi.js';

// The few words these shared pieces show themselves (on/off, close). main.js hands over the app's t().
let t = (key) => key;
export const setStrings = (fn) => { t = fn; };

const isEnglish = (attrs) => !!attrs && (attrs.lang === 'en' || attrs.dir === 'ltr' || (typeof attrs.class === 'string' && /(^|\s)en(\s|$)/.test(attrs.class)));

// h('p', { class: 'x', onclick }, 'text', child, [more])
// Text is always inserted as text (never as HTML). English words, prices and phone numbers inside
// a Farsi sentence are wrapped so they keep their own left-to-right order (see bidi.js).
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;          // set through the style object: allowed by the page's content security policy
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'hidden') el.hidden = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  const english = isEnglish(attrs);
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    if (kid.nodeType) el.append(kid);
    else if (!english && typeof kid === 'string' && maybeMixed(kid)) el.append(...mixed(kid));
    else el.append(document.createTextNode(String(kid)));
  }
  return el;
}

// Farsi text that may contain English: text nodes, with each English part in <bdi lang="en" dir="ltr">.
export function mixed(text) {
  return splitMixed(text).map((p) => {
    if (!p.ltr) return document.createTextNode(p.text);
    const b = document.createElement('bdi');
    b.className = 'en'; b.dir = 'ltr';
    if (p.en) b.lang = 'en';
    b.textContent = p.text;
    return b;
  });
}

const P = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  slow: '<path d="M7 4.5v15l12-7.5z"/><path d="M3 20h4M3 16h2"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  next: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  starFill: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="currentColor"/>',
  repeat: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 21H20v-3M8.5 7.5h7M8.5 11h5"/>',
  chat: '<path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3.5V15H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M20 9h.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 1-1.5 1.5H20V20l-3-2.5"/>',
  cards: '<rect x="3" y="6" width="13" height="14" rx="2"/><path d="M7 3.5h11.5A2.5 2.5 0 0 1 21 6v11M7 11h5M7 15h3"/>',
  places: '<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
  sos: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6.5M12 16.6v.4"/>',
  download: '<path d="M12 3.5v11M7 10l5 5 5-5M4.5 19.5h15"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.4v.4"/>',
  pieces: '<rect x="3" y="8" width="5" height="8" rx="1.5"/><rect x="9.5" y="8" width="5" height="8" rx="1.5"/><rect x="16" y="8" width="5" height="8" rx="1.5"/>',
  trash: '<path d="M4.5 6.5h15M9 6.5V4h6v2.5M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6"/>',
  ear: '<path d="M7 9.5a5 5 0 0 1 10 0c0 3-2.5 3.5-2.5 6a3 3 0 0 1-5.6 1.5"/><path d="M10 10a2 2 0 0 1 4 0"/>',
  bulb: '<path d="M9 17.5h6M10 20.5h4M8.2 14.5A6 6 0 1 1 15.8 14.5c-.6.6-.8 1.2-.8 2H9c0-.8-.2-1.4-.8-2z"/>',
  wifiOff: '<path d="M3 3l18 18M8.5 15.5a5 5 0 0 1 7 0M5.5 12a9 9 0 0 1 4-2.2M18.5 12a9 9 0 0 0-3.4-2M12 19.2v.3"/>',
  textSize: '<path d="M3 18L8 6l5 12M5 14h6M14 18l3.5-8 3.5 8M15.2 15.5h4.6"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4.5-2 1.5a12 12 0 0 0 5.500 5.500l1.500-2 4.500 1.500v3a2 2 0 0 1-2.200 2A16.500 16.500 0 0 1 4.500 5.700a2 2 0 0 1 2-2.200z"/>',
  people: '<circle cx="8.5" cy="8" r="3"/><path d="M2.500 19.500a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.500"/><path d="M16 14.200a5 5 0 0 1 5.500 5.300"/>',
  cart: '<path d="M3 4h2.500l2.200 10.500h10.300l2-7.500H7"/><circle cx="9" cy="19" r="1.500"/><circle cx="17" cy="19" r="1.500"/>',
  clinic: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
  siren: '<path d="M7 18v-5a5 5 0 0 1 10 0v5M4.500 18h15v2.500h-15zM12 3v2M4.500 6.500l1.500 1.500M19.500 6.500L18 8"/>',
  bus: '<rect x="4.500" y="3.500" width="15" height="14" rx="2.500"/><path d="M4.500 11.500h15M8 17.500V20M16 17.500V20M8 14.500h.500M15.500 14.500h.500"/>',
  food: '<path d="M7 3v7a2 2 0 0 0 2 2v9M5 3v5M9 3v5M16.500 21v-8c-1.700 0-2.500-1.500-2.500-4.500S15.500 3 17 3v18"/>',
  bank: '<path d="M3.500 9.500L12 4l8.500 5.500zM5.500 10v7M9.800 10v7M14.200 10v7M18.500 10v7M3.500 20h17M4.500 17.500h15"/>',
  car: '<path d="M4 16.500v-4l2-5.500h12l2 5.500v4M4 12.500h16M3.500 16.500h17v2h-17z"/><circle cx="7.500" cy="14.500" r=".800"/><circle cx="16.500" cy="14.500" r=".800"/>',
  office: '<rect x="5" y="3.500" width="14" height="17" rx="1.500"/><path d="M9 7.500h1.500M13.500 7.500H15M9 11.500h1.500M13.500 11.500H15M10.500 20.500v-4h3v4"/>',
  plane: '<path d="M10.500 13.500L3 11l1.500-1.500 7 .500 4.500-5c1-1 3-1.500 3.500-1s0 2.500-1 3.500l-5 4.500.500 7L12.500 20.500z"/>',
  lock: '<rect x="5" y="10.500" width="14" height="10" rx="2"/><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18V6.5H3zM12 6.5V20M12 6.5C10.5 3.5 7 3.5 7.5 5.5S12 6.5 12 6.5zM12 6.5c1.500-3 5-3 4.500-1S12 6.500 12 6.500z"/>',
  work: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.500V5.500a1.500 1.500 0 0 1 1.500-1.500h3A1.500 1.500 0 0 1 15 5.500v2M3.500 13h17"/>',
  scissors: '<circle cx="6.5" cy="17" r="2.5"/><circle cx="17.5" cy="17" r="2.5"/><path d="M8.5 15.500L18 4M15.500 15.500L6 4"/>',
  leisure: '<path d="M7.5 12h9M3.5 10v4M20.5 10v4"/><rect x="5" y="7" width="3" height="10" rx="1"/><rect x="16" y="7" width="3" height="10" rx="1"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16a3 3 0 0 1 6 0M14 10h4M14 13.5h3"/>',
  needle: '<path d="M19.5 4.500L8 16M19.5 4.500c1 1 .500 2.500-.500 3.500M8 16l-3.500 3.500M10 6c-3-1.500-6 .500-5 3s5 1 6.500 4-1 5-4 4"/>',
  wave: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10.500v3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  exit: '<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M14 8l4 4-4 4M8 12h10"/>',
  paper: '<path d="M6.5 3h8l4 4v13a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14.5 3v4h4M8.5 11.5h7M8.5 15h7M8.5 18.500h4"/>',
};

export function icon(name, cls) {
  const s = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${P[name] || P.info}</svg>`;
  const tpl = document.createElement('template');
  tpl.innerHTML = s;
  return tpl.content.firstChild;
}

// Eight-pointed star (shamseh), the app's mark.
export function mark() {
  const tpl = document.createElement('template');
  tpl.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="9" width="30" height="30" rx="3" fill="currentColor"/><rect x="9" y="9" width="30" height="30" rx="3" fill="currentColor" transform="rotate(45 24 24)"/><circle cx="24" cy="24" r="8.500" fill="var(--bg)"/><circle cx="24" cy="24" r="3.500" fill="var(--sound)"/></svg>';
  return tpl.content.firstChild;
}

// A phone number or a date written with hyphens or slashes (212-555-0142, 10/14) is kept in one piece: it moves to the
// next line whole instead of breaking at a hyphen (it is still cut when it is wider than the screen itself).
const NUMBER_RUN = /\d+(?:[-/]\d+)+[.,;:!?)]*/g;      // (with the full stop after it: a lone "." never starts a line)
const keepNumbers = (text) => {
  if (typeof text !== 'string' || !/\d[-/]\d/.test(text)) return text;
  const out = []; let at = 0;
  for (const m of text.matchAll(NUMBER_RUN)) {
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push(h('span', { class: 'nb', dir: 'ltr' }, m[0]));
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
};
export const en = (text, tag = 'span', cls = '') => h(tag, { class: `en ${cls}`.trim(), lang: 'en', dir: 'ltr' }, keepNumbers(text));

export function btn(label, { icon: ic, cls = 'btn-ghost', onclick, block, small, ...rest } = {}) {
  return h('button', { type: 'button', class: `btn ${cls}${block ? ' btn-block' : ''}${small ? ' btn-small' : ''}`, onclick, ...rest }, ic ? icon(ic) : null, h('span', null, label));
}

export function note(text, kind = '', ic = 'info') {
  return h('div', { class: `note ${kind ? 'is-' + kind : ''}`.trim() }, icon(ic), h('div', null, text));
}

// A labelled progress bar: the words say where the learner is; the bar is extra.
export function progress(label, right, frac) {
  const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
  return h('div', { class: 'progress' },
    h('div', { class: 'lbl' }, h('span', null, label), right ? h('span', { class: 'count' }, right) : null),
    h('div', { class: 'bar', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-valuetext': right || `${fnum(pct)}٪` }, h('i', { style: `width:${pct}%` })));
}

// describedBy: the id of the hint under the switch, read with its name (QA round 4, accessibility L4)
export function toggle(label, on, onchange, states, describedBy) {
  const [yes, no] = states || [t('switch.on'), t('switch.off')];
  return h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(!!on), 'aria-describedby': describedBy || null, onclick: () => onchange(!on) },
    h('span', { class: 'box' }), h('span', { class: 'lbl' }, label), h('span', { class: 'state' }, on ? yes : no));
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const fnum = (n) => String(n).replace(/\d/g, (d) => FA_DIGITS[d]);

// ---- one place that speaks to screen readers --------------------------------------------------
// Screens are rebuilt on every change, so a live region inside a screen is a new element each
// time and is not read out. This one stays in the page for good; toasts and feedback go through it.
let liveEl = null, liveTimer = 0, liveQueue = [];
// The region is in index.html; where the page is built another way (the preview build) it is made here.
// main.js calls this at start, because a screen reader only follows a region that was there before the news.
export function liveRegion() {
  if (!liveEl) {
    liveEl = document.getElementById('live');
    if (!liveEl) { liveEl = h('div', { id: 'live', class: 'sr', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }); document.body.append(liveEl); }
  }
  return liveEl;
}
export function announce(text) {
  if (text == null || text === '') return;
  liveRegion();
  liveQueue.push(String(text).replace(/\s+/g, ' ').trim());
  clearTimeout(liveTimer);
  liveEl.textContent = '';
  liveTimer = setTimeout(() => { liveEl.replaceChildren(...mixed(liveQueue.join(' '))); liveQueue = []; }, 80);
}

// ---- remembering where the learner was --------------------------------------------------------
// After a screen is rebuilt, focus goes back to "the same" control (found again by id, by its kind
// and words, or by its position), so keyboard and VoiceOver users are not thrown to the top.
const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]';
const kindOf = (el) => el.tagName + '.' + [...el.classList].filter((c) => !c.startsWith('is-')).sort().join('.');
let lastTap = null;
export function noteTap(target) {
  const el = target && target.closest ? target.closest('button, a[href], [role="button"], [role="switch"]') : null;
  lastTap = el ? { el, at: Date.now() } : null;
}
// the control in use: the focused one, or (iPhones do not focus a button when it is tapped) the one just tapped
export function inUse() {
  const a = document.activeElement;
  if (a && a !== document.body && a !== document.documentElement) return a;
  return lastTap && Date.now() - lastTap.at < 1500 ? lastTap.el : null;
}
export function focusKey(root, el) {
  if (!el || !root || !root.contains(el)) return null;
  const all = [...root.querySelectorAll(FOCUSABLE)], kind = kindOf(el);
  let sel = null;
  try { if (el.matches('input, textarea') && el.selectionStart != null) sel = [el.selectionStart, el.selectionEnd]; } catch { /* not a text field */ }
  const box = el.parentElement ? kindOf(el.parentElement) : '';
  const peers = all.filter((x) => kindOf(x) === kind && x.parentElement && kindOf(x.parentElement) === box);
  return { id: el.id, kind, box, text: el.textContent, nth: peers.indexOf(el), index: all.indexOf(el), sel };
}
export function refocus(root, key) {
  if (!key || !root) return false;
  const all = [...root.querySelectorAll(FOCUSABLE)].filter((x) => !x.disabled && x.getAttribute('aria-hidden') !== 'true');
  // same kind of control in the same kind of place (a word tile in the word pool, not the one now in the sentence)
  const kin = all.filter((x) => kindOf(x) === key.kind);
  const here = kin.filter((x) => x.parentElement && kindOf(x.parentElement) === key.box);
  const same = here.length ? here : kin;
  const byText = same.filter((x) => x.textContent === key.text);
  const el = (key.id && all.find((x) => x.id === key.id)) || (byText.length === 1 ? byText[0] : null) || same[Math.min(key.nth, same.length - 1)] || all[Math.min(key.index, all.length - 1)];
  if (!el) return false;
  try { el.focus({ preventScroll: true }); if (key.sel && el.setSelectionRange) el.setSelectionRange(key.sel[0], key.sel[1]); } catch { /* ignore */ }
  return document.activeElement === el;
}

// ---- short messages ----------------------------------------------------------------------------
// Stay long enough for a slow reader (at least 6.5 s, longer for long text) and go away at a tap.
let toastEl = null, toastTimer = 0;
export function dismissToast() {
  clearTimeout(toastTimer);
  if (toastEl) toastEl.remove();
  toastEl = null;
}
export function toast(text, ms) {
  dismissToast();
  toastEl = h('button', { type: 'button', class: 'toast', onclick: dismissToast },
    h('span', { class: 'msg' }, text), h('span', { class: 'x' }, icon('close'), h('span', null, t('toast.close'))));
  document.body.append(toastEl);
  announce(text);
  toastTimer = setTimeout(dismissToast, ms || Math.max(6500, String(text).length * 90));
}

// ---- confirmation sheet ------------------------------------------------------------------------
// An in-page dialog (browser confirm() is not reliable inside embedded viewers).
//   actions: [{ label, cls, icon, run(close), keep }]
// Safety for unsteady hands: a destructive action (cls 'btn-danger') is never first and never
// focused; taps are ignored for the first 600 ms, so the second tap of a double tap cannot confirm;
// Escape, a tap outside, or leaving the screen all mean "no".
const SHEET_HOLD = 600;
let dismissSheet = null;
export function closeSheets() { if (dismissSheet) dismissSheet(); }
export function sheet(title, body, actions) {
  closeSheets();
  const isDanger = (a) => /(^|\s)btn-danger(\s|$)/.test(a.cls || '');
  const risky = actions.some(isDanger);
  const list = risky ? [...actions.filter((a) => !isDanger(a)), ...actions.filter(isDanger)] : actions;
  const cancel = risky ? list[0] : list[list.length - 1];
  const app = document.getElementById('app');
  const openerEl = inUse();
  const opener = app ? focusKey(app, openerEl) : null;
  const openedAt = performance.now();
  const tooSoon = () => performance.now() - openedAt < SHEET_HOLD;
  let open = true;

  const close = () => {
    if (!open) return;
    open = false; dismissSheet = null;
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    if (app) { app.removeAttribute('inert'); app.removeAttribute('aria-hidden'); }
    // give focus back to where the learner was, unless the action already moved on to another screen
    const a = document.activeElement;
    if (!a || a === document.body) { if (openerEl && openerEl.isConnected) { try { openerEl.focus({ preventScroll: true }); } catch { /* ignore */ } } else refocus(app, opener); }
  };
  const dismiss = () => { if (!open) return; close(); if (cancel && cancel.run) cancel.run(close); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); dismiss(); return; }
    if (e.key !== 'Tab') return;
    const stops = [...panel.querySelectorAll('button, [href], input')];
    if (!stops.length) return;
    const first = stops[0], last = stops[stops.length - 1], a = document.activeElement;
    if (!panel.contains(a) || a === panel || a === heading) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  };

  const heading = h('h2', { id: 'sheet-title', tabindex: '-1' }, title);
  const buttons = list.map((a) => btn(a.label, { cls: a.cls || 'btn-ghost', icon: a.icon, block: true,
    onclick: () => { if (tooSoon() || !open) return; if (a.keep !== true) close(); a.run && a.run(close); } }));
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title', 'aria-describedby': 'sheet-body' },
    heading, h('div', { id: 'sheet-body', class: 'stack' }, body), h('div', { class: 'stack' }, buttons));
  const back = h('div', { class: 'sheet-back', onclick: (e) => { if (e.target === back && !tooSoon()) dismiss(); } }, panel);
  document.body.append(back);
  document.addEventListener('keydown', onKey, true);
  dismissSheet = dismiss;
  // a risky question starts on the safe answer; an explanation starts at its title so it is read from the top
  try { (risky ? buttons[0] : heading).focus({ preventScroll: true }); } catch { /* ignore */ }
  // the page behind can be neither touched nor reached by keyboard or screen reader while the sheet is open
  if (app) { app.setAttribute('inert', ''); app.setAttribute('aria-hidden', 'true'); }
  return close;
}

export function shuffle(arr, seed = Math.random()) {
  const a = arr.slice();
  let s = Math.floor(seed * 2147483647) || 1;
  const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
