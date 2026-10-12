// The interface text the suites look for, read from the built site — never typed into a test.
// When the language reviewers reword a button or a message in content/ui.fa.json, the suites follow.
//   const { T, P, content } = uiText(SITE);
//   T('nav.home')                       the whole text, with {placeholders} filled in from the second argument
//   P('home.lesson.resume')             the fixed words before the first {placeholder} ("ادامهٔ درس:")
//   re('home.lesson.next', { min: '…' }) a RegExp for a text with placeholders: each {x} matches anything
import fs from 'node:fs';
import path from 'node:path';

export function uiText(site) {
  const content = JSON.parse(fs.readFileSync(path.join(site, 'content.json'), 'utf8'));
  const strings = content.ui.strings;
  const raw = (key) => {
    if (typeof strings[key] !== 'string') throw new Error(`interface text "${key}" is not in content/ui.fa.json`);
    return strings[key];
  };
  const T = (key, vars) => {
    let s = raw(key);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  };
  const P = (key) => raw(key).split('{')[0].trim();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = (key) => new RegExp(raw(key).split(/\{[a-z]+\}/i).map(esc).join('[\\s\\S]*'));
  return { T, P, re, content, strings };
}
