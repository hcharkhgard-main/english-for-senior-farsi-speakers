// Settings, the always-available emergency phrases, personal card and "about".
import { h, icon, btn, en, note, toggle, sheet, toast, announce, fnum } from '../ui.js';
import { clipEn, listenBtn, miniPlay, faListen } from '../components.js';
import { ASR_MB } from '../speech.js';
import { MONTHS, YEARS, parseBorn, formatBorn, daysIn, ownLines } from '../own.js';

// the same name the service worker uses (src/sw.js): one audio store per copy of the site
const audioCache = () => `hamrah|${new URL('./', document.baseURI).pathname}|audio`;
// Is this sound file on the phone? It may be in the audio store or — the first sounds, emergency phrases included — in the app's own store.
const stored = async (address) => !!address && !!(await caches.match(new URL(address, document.baseURI).href, { ignoreSearch: true }));

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

  // ---- offline -----------------------------------------------------------------------------
  if (app.target === 'pwa') {
    const can = 'caches' in window && 'serviceWorker' in navigator;
    const box = h('section', { class: 'card' }, h('h2', null, t('off.title')));
    if (!can) box.append(note(t('off.unsupported'), 'care'));
    else {
      if (ui.off == null) { ui.off = { have: 0, all: 0, busy: false }; countCached(audio).then((r) => { Object.assign(ui.off, r); app.render(); }); }
      const { have, all, busy } = ui.off;
      if (all) box.append(h('p', null, have >= all ? t('off.all') : t('off.some', { have: fnum(have), all: fnum(all) })));      // nothing is claimed until the phone has been checked
      box.append(h('p', { class: 'small muted' }, t('off.hint')));
      if (busy) box.append(h('div', { class: 'level' }, h('i', { style: `width:${all ? Math.round((have / all) * 100) : 0}%` })));
      // no button until the list of sounds has been read: without it there is nothing to download and no size to state
      else if (audio.index && (!all || have < all)) box.append(btn(t('off.get', { mb: fnum(Math.max(1, Math.round(audio.index.packs.reduce((s, p) => s + p.bytes, 0) / 1048576))) }), { cls: 'btn-primary', icon: 'download', block: true,
        onclick: async () => {
          if (!app.online) { toast(t('audio.offline')); return; }
          ui.off.busy = true; app.render();
          try {
            const c = await caches.open(audioCache());
            let have = 0;
            for (const p of audio.index.packs) { const url = audio.packUrl(p.id); if (!(await stored(url))) await c.add(url); have++; ui.off.have = Math.max(ui.off.have, Math.min(ui.off.all, have)); app.render(); }
            Object.assign(ui.off, await countCached(audio));
            toast(t('off.done'));
          } catch { toast(t('off.failed')); }
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
    main.append(say);

    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    if (!standalone) main.append(h('section', { class: 'card' }, h('h2', null, t('inst.title')), h('p', null, t('inst.why')),
      h('ol', { class: 'steps' }, h('li', null, t('inst.1')), h('li', null, t('inst.2')), h('li', null, t('inst.3'))), h('p', { class: 'small muted' }, t('inst.other'))));
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

async function countCached(audio) {
  try {
    await audio.loadIndex();
    let have = 0;
    for (const p of audio.index.packs) if (await stored(audio.packUrl(p.id))) have++;
    return { have, all: audio.index.packs.length };
  } catch { return { have: 0, all: 0 }; }
}

// «اطلاعات من»: the learner's own name, address, phone number and date of birth, and a family member's number.
// They stay on this phone (store.js) and are used for the learner's own sentences at the end of the three
// "my information" lessons and on the emergency page. Nothing on this screen is redrawn while the learner is
// typing or choosing, so the keyboard and the phone's date wheels are never closed under their fingers.
export function meView(app) {
  const { t, store } = app;
  const me = store.state.me;
  const MAX = 120;
  const field = (key, label, hint, attrs = {}) => {
    const input = h('input', { id: 'me-' + key, type: 'text', value: me[key] || '', autocomplete: 'off', maxlength: MAX, 'aria-describedby': `me-${key}-hint`,
      oninput: (e) => {
        store.update((s) => { s.me[key] = e.target.value.slice(0, MAX); });
        if (e.target.value.length >= MAX) toast(t('me.tooLong'));          // the field stops taking letters: say so instead of cutting silently
      }, ...attrs });
    return h('div', { class: 'field' }, h('label', { for: 'me-' + key }, label), input, h('p', { class: 'small muted', id: `me-${key}-hint` }, hint));
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
  const showSaid = () => { const line = ownLines(store.state.me, ['born'])[0]; said.textContent = line ? line.en : ''; said.hidden = !line; };
  function bornChanged() {
    const b = { y: +year.sel.value || 0, m: +month.sel.value || 0, d: +day.sel.value || 0 };
    const wrong = !!(b.m && b.d && b.d > daysIn(b.m, b.y));      // 31 June: ask for the day again, keep the rest
    if (wrong) { b.d = 0; day.sel.value = '0'; }
    noDay.hidden = !wrong;
    if (wrong) announce(t('me.born.noDay'));
    store.update((s) => { s.me.born = formatBorn(b); });
    showSaid();
  }
  showSaid();
  const clear = () => sheet(t('me.clear'), h('p', null, t('me.clear.ask')), [
    { label: t('reset.yes'), cls: 'btn-danger', run: () => { store.update((s) => { s.me = { name: '', address: '', contact: '', phone: '', born: '' }; }); toast(t('reset.done')); app.render(); } },
    { label: t('reset.no'), cls: 'btn-primary' }]);
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('me.title')), h('p', null, t('me.what')), note(t('me.private'), 'good', 'lock'),
    h('section', { class: 'card' },
      field('name', t('me.name'), t('me.name.hint'), { class: 'en', dir: 'ltr', lang: 'en', autocapitalize: 'words' }),
      field('address', t('me.address'), t('me.address.hint'), { class: 'en', dir: 'ltr', lang: 'en', autocapitalize: 'words' }),
      field('phone', t('me.phone'), t('me.phone.hint'), { class: 'en', dir: 'ltr', lang: 'en', inputmode: 'tel' })),
    h('section', { class: 'card' }, h('h2', null, t('me.born')), h('p', { class: 'small muted', id: 'me-born-hint' }, t('me.born.hint')),
      month.box, day.box, year.box, noDay, said),
    h('section', { class: 'card' }, h('h2', null, t('me.emergency')),
      field('contact', t('me.contact'), t('me.contact.hint'), { class: 'en', dir: 'ltr', lang: 'en', inputmode: 'tel' })),
    btn(t('me.done'), { cls: 'btn-primary', icon: 'check', block: true, onclick: () => { toast(t('me.saved')); app.back(); } }),
    btn(t('me.clear'), { cls: 'btn-danger', icon: 'trash', block: true, onclick: clear }));
  return { main };
}

export function sosView(app) {
  const { t, content, store } = app;
  const E = content.emergency, me = store.state.me;
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('sos.title')), note(E.intro, 'danger', 'sos'));
  const fill = (p) => {
    if (p.slot === 'name') return me.name ? `My name is ${me.name}.` : null;
    if (p.slot === 'address') return me.address ? `My address is ${me.address}.` : null;
    if (p.slot === 'contact') return me.contact ? `Please call my family: ${me.contact}` : null;
    return null;
  };
  main.append(h('div', { class: 'stack' }, E.phrases.map((p) => {
    const mine = p.slot ? fill(p) : null;
    return h('section', { class: 'card' },
      h('div', { class: 'opt-wrap' }, miniPlay(app, clipEn(p.say || p.en, 's', 'n')), h('div', { class: 'grow' }, en(mine || p.en, 'p', 'en-line'), h('p', { class: 'fa-line' }, p.fa))),
      p.slot && !mine ? btn(t('sos.fill'), { cls: 'btn-ghost', small: true, icon: 'people', onclick: () => app.go('me') }) : null,
      p.slot && mine ? note(t('sos.show'), 'info', 'ear') : null,      // the recording cannot know the learner's own name or address
      h('div', { class: 'row' }, listenBtn(app, clipEn(p.say || p.en, 's', 's'), { label: t('audio.slow'), cls: 'btn-ghost', ic: 'slow', small: true }), p.slot ? null : faListen(app, p.fa, t('audio.fa'))),
      store.state.settings.ph ? h('p', { class: 'ph-line' }, h('b', null, t('phrase.phLabel') + ' '), p.ph) : null);
  })));
  main.append(h('section', { class: 'card' }, h('h2', null, t('sos.tips')), h('ul', { class: 'steps' }, E.tips.map((x) => h('li', null, x)))));
  main.append(note(t('sos.noCall'), 'care'));
  return { main };
}

export function aboutView(app) {
  const { t } = app;
  const para = (k) => h('p', null, t(k));
  const main = h('main', { class: 'wrap' }, h('h1', { class: 'section-title' }, t('about.title')),
    h('section', { class: 'card' }, h('h2', null, t('about.what.t')), para('about.what')),
    h('section', { class: 'card' }, h('h2', null, t('about.privacy.t')), para('about.privacy.1'), para('about.privacy.2'), para('about.privacy.3')),
    h('section', { class: 'card' }, h('h2', null, t('about.voice.t')), para('about.voice')),
    h('section', { class: 'card' }, h('h2', null, t('about.limits.t')), para('about.limits.1'), para('about.limits.2')),
    h('p', { class: 'small muted center' }, `${t('app.name')} · ${app.version}`));
  return { main };
}
