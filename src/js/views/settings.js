// Settings, the always-available emergency phrases, personal card and "about".
import { h, icon, btn, en, note, toggle, sheet, toast, announce, fnum } from '../ui.js';
import { clipEn, listenBtn, miniPlay, faListen } from '../components.js';
import { ASR_MB } from '../speech.js';
import { MONTHS, YEARS, parseBorn, formatBorn, daysIn, ownLines } from '../own.js';

// A name or address goes into an English sentence (the learner's own sentences, the emergency page) only when it is
// written in English letters: «مریم احمدی» inside "My name is …" cannot be read by the person who is helping.
// Persian or Arabic digits are read as ordinary digits; any other Persian letter makes the value unusable there.
const toLatinDigits = (x) => String(x || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
export const farsiLetters = (x) => /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(toLatinDigits(x));
// one line, no full stop of its own at the end (the sentence adds one): "25 Oak St." -> "25 Oak St"
export const tidy = (x) => toLatinDigits(x).replace(/\s+/g, ' ').replace(/[\s.,;:]+$/, '').trim();

import { isStored } from '../stored.js';
import { aheadParts } from '../ahead.js';
import { me, setMe, clearMe, mayAsk } from '../me.js';
import { invite } from './progress.js';

// A row of choices where exactly one is on. The chosen one carries a tick as well as its colour.
function seg(labelId, options, value, onpick) {
  return h('div', { class: 'seg', role: 'group', 'aria-labelledby': labelId }, options.map(([v, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onpick(v) }, v === value ? icon('check') : null, h('span', null, label))));
}

export function settingsView(app) {
  const { t, store, audio } = app;
  const st = store.state.settings;
  const set = (k, v) => { store.update((s) => { s.settings[k] = v; }); if (k === 'scale') app.applyScale(); app.render(); };
  const ui = app.ui;
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('set.title')));

  main.append(h('section', { class: 'card' }, h('h2', { id: 'set-size' }, t('set.size')), seg('set-size', [[1, t('set.size.1')], [1.15, t('set.size.2')], [1.3, t('set.size.3')], [1.5, t('set.size.4')]], st.scale, (v) => set('scale', v)),
    h('p', { class: 'en', lang: 'en', dir: 'ltr', style: 'font-size:1.6rem;font-weight:700' }, 'Hello! How are you?'), h('p', null, t('set.size.sample'))));

  main.append(h('section', { class: 'card' }, h('h2', { id: 'set-rate' }, t('set.rate')), seg('set-rate', [[1, t('set.rate.1')], [0.88, t('set.rate.2')], [0.78, t('set.rate.3')]], st.rate, (v) => set('rate', v)),
    listenBtn(app, clipEn('Hello! How are you?', 's', 'n'), { label: t('set.rate.try') })));

  main.append(h('section', { class: 'card' }, h('h2', null, t('set.help')),
    toggle(t('set.ph'), st.ph, (v) => set('ph', v)), h('p', { class: 'small muted' }, t('set.ph.hint')),
    toggle(t('set.faVoice'), st.faVoice, (v) => set('faVoice', v)), h('p', { class: 'small muted' }, t('set.faVoice.hint')),
    toggle(t('set.auto'), st.auto, (v) => set('auto', v)), h('p', { class: 'small muted' }, t('set.auto.hint'))));

  main.append(h('button', { type: 'button', class: 'item', onclick: () => app.go('me') }, h('span', { class: 'pic', style: 'width:3rem;height:3rem' }, icon('people')),
    h('span', { class: 'body' }, h('span', { class: 't' }, t('me.title')), h('span', { class: 's' }, t('me.sub'))), h('span', { class: 'go' }, icon('next'))));
  // «هیچ‌وقت نپرس»: no invitation to enter personal details, anywhere; «اطلاعات من» stays here, one tap above
  main.append(h('section', { class: 'card' }, toggle(t('set.neverAsk'), st.neverAsk, (v) => set('neverAsk', v), null, 'set-neverask-hint'), h('p', { class: 'small muted', id: 'set-neverask-hint' }, t('set.neverAsk.hint'))));

  // ---- offline -----------------------------------------------------------------------------
  if (app.target === 'pwa') {
    const can = 'caches' in window && 'serviceWorker' in navigator;
    const box = h('section', { class: 'card' }, h('h2', null, t('off.title')));
    if (!can) box.append(note(t('off.unsupported'), 'care'));
    else {
      if (ui.off == null) { ui.off = { have: 0, all: 0, busy: false, parts: null }; countCached(app).then((r) => { Object.assign(ui.off, r); app.render(); }); }
      const { have, all, busy, parts } = ui.off;
      // nothing is claimed until the phone has been checked; then each part says "ready" or "not yet" in words, not by colour alone
      if (all && have >= all) box.append(h('p', null, t('off.all')));
      else if (parts) {
        const mark = (ready) => { const i = icon(ready ? 'check' : 'wifiOff'); Object.assign(i.style, { width: '1.5rem', height: '1.5rem', color: ready ? 'var(--good)' : 'var(--ink-2)' }); return i; };
        // ready: true (a tick and «آماده است»), false («هنوز نه») or 'some' (no tick: «بخشی آماده است») — a part is
        // "ready" only when all of it is (QA round 4, accessibility M2: «درس‌ها: ۱۱ از ۷۲ ✓ آماده است» read as "all lessons")
        const row = (label, ready) => h('li', { class: 'row', style: 'align-items:center;gap:.5rem', 'data-ready': String(ready) }, mark(ready === true), h('span', { class: 'grow' }, label),
          h('strong', null, ready === true ? t('off.yes') : ready === 'some' ? t('off.some') : t('off.no')));
        const [lHave, lAll] = parts.lessons;
        box.append(h('ul', { class: 'stack', 'data-offline-parts': '', style: 'list-style:none;padding:0;margin:0' },
          row(t('off.part.sos'), parts.sos),
          row(t('off.part.lessons', { have: fnum(lHave), all: fnum(lAll) }), lAll > 0 && lHave >= lAll ? true : lHave > 0 ? 'some' : false),
          row(t('off.part.review'), parts.review),
          parts.numbers == null ? null : row(t('off.part.numbers'), parts.numbers),
          parts.papers == null ? null : row(t('off.part.papers'), parts.papers),
          parts.talks == null ? null : row(t('off.part.talks'), parts.talks)));
      }
      box.append(h('p', { class: 'small muted' }, t('off.hint')));
      if (busy) box.append(h('div', { class: 'level' }, h('i', { style: `width:${all ? Math.round((have / all) * 100) : 0}%` })));
      // no button until the list of sounds has been read: without it there is nothing to download and no size to state
      else if (audio.index && (!all || have < all)) box.append(btn(t('off.get', { mb: fnum(Math.max(1, Math.round(audio.index.packs.reduce((s, p) => s + p.bytes, 0) / 1048576))) }), { cls: 'btn-primary', icon: 'download', block: true,
        onclick: async () => {
          if (!app.online) { toast(t('audio.offline')); return; }
          const here = app.screen;
          ui.off.busy = true; app.render();
          // every pack is checked before it is kept (audio.js): a Wi-Fi login page or a cut-off download is not stored, and is reported
          const r = await audio.keep(audio.index.packs.map((p) => p.id), {
            isStored: (p) => isStored(audio.packUrl(p.id), p.bytes),
            onEach: (n, total) => { ui.off.have = Math.max(ui.off.have, Math.min(ui.off.all || total, n)); if (app.screen === here) app.render(); },
          }).catch(() => ({ failed: [1] }));
          Object.assign(ui.off, await countCached(app));
          toast(r.failed.length ? t('off.failed') : t('off.done'));
          ui.off.busy = false; app.render();
        } }));
      box.append(note(t('off.not'), 'info', 'wifiOff'));
    }
    main.append(box);

    const say = h('section', { class: 'card' }, h('h2', null, t('asr.title')), h('p', null, t('asr.what')));
    if (!app.speech.hasMic) say.append(note(t('say.noMic'), 'care'));
    else {
      if (ui.asr == null) { ui.asr = { cached: false, busy: false, pct: 0 }; app.speech.isCached().then((c) => { ui.asr.cached = c; app.render(); }); }
      if (ui.asr.cached || app.speech.ready) say.append(note(t('asr.ready'), 'good', 'check'));
      else if (ui.asr.busy) say.append(h('div', { class: 'level' }, h('i', { 'data-asr-bar': '', style: `width:${Math.round(ui.asr.pct * 100)}%` })));
      else say.append(btn(t('asr.get', { mb: fnum(ASR_MB) }), { cls: 'btn-ghost', icon: 'download', block: true,
        onclick: async () => {
          ui.asr.busy = true; app.render();
          try { await app.speech.ensure((p) => { ui.asr.pct = p; const b = document.querySelector('[data-asr-bar]'); if (b) b.style.width = Math.round(p * 100) + '%'; }); ui.asr.cached = true; } catch { toast(t('off.failed')); }
          ui.asr.busy = false; app.render();
        } }));
      say.append(h('p', { class: 'small muted' }, t('mic.privacy')));
    }
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    // «بررسی تلفظ» and «گذاشتن برنامه روی صفحهٔ اصلی» are behind «بیشتر»: Settings was 17 screens long at 320 px and large
    // text (QA round 4, accessibility L8). Open while a download is running, so its progress stays in sight.
    const moreOpen = !!ui.more || !!(ui.asr && ui.asr.busy);
    main.append(h('button', { type: 'button', class: 'item', 'aria-expanded': String(moreOpen), 'data-set-more': '', onclick: () => { ui.more = !moreOpen; app.render(); } },
      h('span', { class: 'pic', style: 'width:3rem;height:3rem' }, icon(moreOpen ? 'close' : 'download')),
      h('span', { class: 'body' }, h('span', { class: 't' }, t('set.more')), h('span', { class: 's' }, standalone ? t('set.more.sub1') : t('set.more.sub')))));
    if (moreOpen) {
      main.append(say);
      if (!standalone) main.append(h('section', { class: 'card' }, h('h2', null, t('inst.title')), h('p', null, t('inst.why')),
        h('ol', { class: 'steps' }, h('li', null, t('inst.1')), h('li', null, t('inst.2')), h('li', null, t('inst.3'))), h('p', { class: 'small muted' }, t('inst.other'))));
    }
  } else {
    main.append(note(t('preview.note'), 'info'));
  }

  // ---- live AI partner: listed only when such a service can be reached; off until the learner switches it on ----
  if (ui.ai == null) { ui.ai = { ok: false }; app.partner.probe().then((ok) => { if (ok) { ui.ai.ok = true; app.render(); } }).catch(() => {}); }
  if (ui.ai.ok) {
    const told = () => [h('p', null, t('ai.consent.body')), note(t('ai.consent.private'), 'care', 'lock')];
    const ask = () => sheet(t('ai.title'), h('div', { class: 'stack' }, told()), [{ label: t('set.ai.yes'), cls: 'btn-primary', run: () => set('ai', true) }, { label: t('mic.no') }]);
    main.append(h('section', { class: 'card' }, h('h2', null, t('ai.title')),
      toggle(t('set.ai'), st.ai, (v) => (v ? ask() : set('ai', false))), h('p', { class: 'small muted' }, t('set.ai.hint')),
      st.ai ? told() : null));
  }

  main.append(btn(t('about.title'), { cls: 'btn-ghost', icon: 'info', block: true, onclick: () => app.go('about') }));

  main.append(h('section', { class: 'card' }, h('h2', null, t('reset.title')), h('p', { class: 'muted' }, t('reset.sub')),
    btn(t('reset.progress'), { cls: 'btn-danger', icon: 'repeat', block: true, onclick: () => sheet(t('reset.progress'), h('p', null, t('reset.progress.ask')),
      [{ label: t('reset.yes'), cls: 'btn-danger', run: () => { store.reset(true); toast(t('reset.done')); app.home(); } }, { label: t('reset.no'), cls: 'btn-primary' }]) }),
    btn(t('reset.all'), { cls: 'btn-danger', icon: 'trash', block: true, onclick: () => sheet(t('reset.all'), h('p', null, t('reset.all.ask')),
      [{ label: t('reset.yes'), cls: 'btn-danger', run: () => { store.wipe(); app.applyScale(); toast(t('reset.done')); app.go('onboard', { reset: true }); } }, { label: t('reset.no'), cls: 'btn-primary' }]) })));
  main.append(h('p', { class: 'small muted center' }, `${t('app.name')} · ${app.version}`));
  return { main };
}

// What is on the phone: all packs (have/all) and, for the parts the learner meets, whether their sounds are all there.
async function countCached(app) {
  const { audio, store, content } = app;
  try {
    await audio.loadIndex();
    const idx = audio.index, ok = new Set();
    for (const p of idx.packs) if (await isStored(audio.packUrl(p.id), p.bytes)) ok.add(p.id);
    const all = (ids) => ids.every((id) => ok.has(id));
    const ahead = aheadParts(store.state, content, idx, app.today());
    const lessons = app.order.filter((id) => idx.deps && idx.deps['l-' + id]);
    return {
      have: ok.size, all: idx.packs.length,
      parts: {
        sos: ok.has('core'),
        lessons: [lessons.filter((id) => all(idx.deps['l-' + id])).length, lessons.length],
        review: ahead.review.length > 0 && all(ahead.review),
        numbers: (content.numbers || []).length && idx.packs.some((p) => p.id === 'n-numbers') ? ok.has('n-numbers') : null,
        papers: ahead.papers.length ? all(ahead.papers) : null,
        talks: ahead.talks.length ? all(ahead.talks) : null,
      },
    };
  } catch { return { have: 0, all: 0, parts: null }; }
}

// «اطلاعات من»: the learner's own name, address, phone number and date of birth, and a family member's number.
// They are kept in memory only (me.js) — never saved on the phone, gone when the app is closed — and are used for the learner's own sentences at the end of the three
// "my information" lessons and on the emergency page. Nothing on this screen is redrawn while the learner is
// typing or choosing, so the keyboard and the phone's date wheels are never closed under their fingers.
export function meView(app) {
  const { t } = app;
  const MAX = 120;
  const field = (key, label, hint, attrs = {}, latin = false) => {
    // name and address: a gentle line under the field as soon as Persian letters are typed (shown, not redrawn: the keyboard stays open)
    const warn = latin ? note(t('me.latinOnly'), 'care') : null;
    if (warn) { warn.id = `me-${key}-latin`; warn.hidden = !farsiLetters(me[key]); }
    const input = h('input', { id: 'me-' + key, type: 'text', value: me[key] || '', autocomplete: 'off', maxlength: MAX, 'aria-describedby': `me-${key}-hint${latin ? ` me-${key}-latin` : ''}`,
      oninput: (e) => {
        setMe(key, e.target.value.slice(0, MAX));
        if (e.target.value.length >= MAX) toast(t('me.tooLong'));          // the field stops taking letters: say so instead of cutting silently
        if (warn) { const bad = farsiLetters(e.target.value); if (bad && warn.hidden) announce(t('me.latinOnly')); warn.hidden = !bad; }
      }, ...attrs });
    return h('div', { class: 'field' }, h('label', { for: 'me-' + key }, label), input, h('p', { class: 'small muted', id: `me-${key}-hint` }, hint), warn);
  };
  // date of birth: three lists to choose from — no typing. Month names are shown in Farsi with the English beside
  // them; days and years in the digits that are on the learner's ID card.
  const born = parseBorn(me.born);
  const option = (value, text) => { const o = document.createElement('option'); o.value = String(value); o.textContent = text; return o; };
  const list = (part, label, options) => {
    const sel = h('select', { id: 'me-born-' + part, 'aria-describedby': 'me-born-hint', onchange: () => bornChanged() }, option(0, t('me.born.pick')), options);
    sel.value = String(born[part] || 0);
    return { sel, box: h('div', { class: 'field' }, h('label', { for: 'me-born-' + part }, label), sel) };
  };
  const month = list('m', t('me.born.m'), MONTHS.map((name, i) => option(i + 1, `${t('month.' + (i + 1))} · ${name}`)));
  const day = list('d', t('me.born.d'), Array.from({ length: 31 }, (_, i) => option(i + 1, String(i + 1))));
  const years = []; for (let y = YEARS.to; y >= YEARS.from; y--) years.push(option(y, String(y)));
  const year = list('y', t('me.born.y'), years);
  const noDay = h('p', { class: 'small', hidden: true }, t('me.born.noDay'));
  const said = en('', 'p', 'en-line');      // the date as the learner will say it, shown as soon as it is complete
  const showSaid = () => { const line = ownLines(me, ['born'])[0]; said.textContent = line ? line.en : ''; said.hidden = !line; };
  function bornChanged() {
    const b = { y: +year.sel.value || 0, m: +month.sel.value || 0, d: +day.sel.value || 0 };
    const wrong = !!(b.m && b.d && b.d > daysIn(b.m, b.y));      // 31 June: ask for the day again, keep the rest
    if (wrong) { b.d = 0; day.sel.value = '0'; }
    noDay.hidden = !wrong;
    if (wrong) announce(t('me.born.noDay'));
    setMe('born', formatBorn(b));
    showSaid();
  }
  showSaid();
  const clear = () => sheet(t('me.clear'), h('p', null, t('me.clear.ask')), [
    { label: t('reset.yes'), cls: 'btn-danger', run: () => { clearMe(); toast(t('reset.done')); app.render(); } },
    { label: t('reset.no'), cls: 'btn-primary' }]);
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('me.title')),
    // first: kept only while the app is open, never saved, entirely optional
    note(h('div', { class: 'stack', 'data-me-memory': '' }, h('p', null, t('me.private')), h('p', null, t('me.optional'))), 'good', 'lock'),
    h('p', null, t('me.what')),
    h('section', { class: 'card' },
      field('name', t('me.name'), t('me.name.hint'), { class: 'en', dir: 'ltr', lang: 'en', autocapitalize: 'words' }, true),
      field('address', t('me.address'), t('me.address.hint'), { class: 'en', dir: 'ltr', lang: 'en', autocapitalize: 'words' }, true),
      field('phone', t('me.phone'), t('me.phone.hint'), { class: 'en', dir: 'ltr', lang: 'en', inputmode: 'tel' })),
    h('section', { class: 'card' }, h('h2', null, t('me.born')), h('p', { class: 'small muted', id: 'me-born-hint' }, t('me.born.hint')),
      month.box, day.box, year.box, noDay, said),
    h('section', { class: 'card' }, h('h2', null, t('me.emergency')),
      field('contact', t('me.contact'), t('me.contact.hint'), { class: 'en', dir: 'ltr', lang: 'en', inputmode: 'tel' })),
    btn(t('me.done'), { cls: 'btn-primary', icon: 'check', block: true, onclick: () => { toast(t('me.kept')); app.back(); } }),
    btn(t('me.clear'), { cls: 'btn-danger', icon: 'trash', block: true, onclick: clear }));
  return { main };
}

export function sosView(app) {
  const { t, content, store } = app;
  const E = content.emergency;
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('sos.title')));
  // a name or address in Persian letters is treated as not filled in (the «وارد کردن اطلاعات خودم» button shows instead)
  const usable = (x) => (x && !farsiLetters(x) ? tidy(x) : '');
  const fill = (p) => {
    if (p.slot === 'name') return usable(me.name) ? `My name is ${usable(me.name)}.` : null;
    if (p.slot === 'address') return usable(me.address) ? `My address is ${usable(me.address)}.` : null;
    if (p.slot === 'contact') return tidy(me.contact) ? `Please call my family: ${tidy(me.contact)}` : null;
    return null;
  };
  // The first screen shows phrases, not explanations: "I need help." first, then the learner's own name, address and
  // family number when they are filled in, then the rest in their usual order; the note about this page comes after
  // the first three phrases (or after the learner's own ones).
  const own = ['name', 'address', 'contact'].map((slot) => E.phrases.find((p) => p.slot === slot && fill(p))).filter(Boolean);
  const order = [...E.phrases.slice(0, 1), ...own, ...E.phrases.slice(1).filter((p) => !own.includes(p))];
  const cards = order.map((p) => {
    const mine = p.slot ? fill(p) : null;
    return h('section', { class: 'card' },
      // the main play button of each phrase says what it does in words, not only with ▶ (QA round 4, accessibility L5)
      h('div', { class: 'opt-wrap' }, miniPlay(app, clipEn(p.say || p.en, 's', 'n'), null, t('audio.listen')), h('div', { class: 'grow' }, en(mine || p.en, 'p', 'en-line'), h('p', { class: 'fa-line' }, p.fa))),
      p.slot === 'address' && !mine ? note(t('sos.paper'), 'info', 'paper') : null,      // without «اطلاعات من»: the address from a paper by the phone
      p.slot && mine ? note(t('sos.show'), 'info', 'ear') : null,      // the recording cannot know the learner's own name or address
      h('div', { class: 'row' }, listenBtn(app, clipEn(p.say || p.en, 's', 's'), { label: t('audio.slow'), cls: 'btn-ghost', ic: 'slow', small: true }), p.slot ? null : faListen(app, p.fa, t('audio.fa'))),
      store.state.settings.ph ? h('p', { class: 'ph-line' }, h('b', null, t('phrase.phLabel') + ' '), p.ph) : null);
  });
  cards.splice(Math.min(Math.max(3, 1 + own.length), cards.length), 0, note(E.intro, 'danger', 'sos'));
  main.append(h('div', { class: 'stack' }, cards));
  // one quiet invitation, after every phrase, while the learner has not said no (never in the way of the phrases above)
  if (!own.length && mayAsk(store.state)) main.append(invite(app, t('sos.invite.t'), t('sos.invite')));
  main.append(h('section', { class: 'card' }, h('h2', null, t('sos.tips')), h('ul', { class: 'steps' }, E.tips.map((x) => h('li', null, x)))));
  main.append(note(t('sos.noCall'), 'care'));
  return { main };
}

export function aboutView(app) {
  const { t } = app;
  const para = (k) => h('p', null, t(k));
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('about.title')),
    h('section', { class: 'card' }, h('h2', null, t('about.what.t')), para('about.what')),
    h('section', { class: 'card' }, h('h2', null, t('about.privacy.t')), para('about.privacy.1'), para('about.privacy.me'), para('about.privacy.2'), para('about.privacy.3')),
    h('section', { class: 'card' }, h('h2', null, t('about.voice.t')), para('about.voice')),
    h('section', { class: 'card' }, h('h2', null, t('about.limits.t')), para('about.limits.1'), para('about.limits.2')),
    h('p', { class: 'small muted center' }, `${t('app.name')} · ${app.version}`));
  return { main };
}
