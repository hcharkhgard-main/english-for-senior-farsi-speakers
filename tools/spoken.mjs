// Turns written text into what the voice generator should read aloud: numbers, dates,
// phone numbers and spelled-out names are written with digits on screen but must be spoken
// the way a person would say them. Hand-made overrides live in content/pronunciation.json.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };

export function enNumber(n) {
  n = Number(n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + enNumber(n % 100) : '');
  if (n < 1000000) return enNumber(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + enNumber(n % 1000) : '');
  return String(n);
}
export function enOrdinal(n) {
  const w = enNumber(n);
  const m = w.match(/^(.*?)([a-z]+)$/);
  const last = m[2];
  const o = ORD[last] || (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th');
  return m[1] + o;
}
const enDigits = (s) => s.split('').map((d) => (d === '0' ? 'zero' : ONES[d])).join(' ');
export function enYear(y) {
  y = Number(y);
  const a = Math.floor(y / 100), b = y % 100;
  if (y >= 2000 && y < 2010) return 'two thousand' + (b ? ' ' + ONES[b] : '');
  if (b === 0) return enNumber(a) + ' hundred';
  return enNumber(a) + ' ' + (b < 10 ? 'oh ' + ONES[b] : enNumber(b));
}

export function spokenEn(text, say) {
  if (say.exact && say.exact[text] != null) return say.exact[text];
  let t = text;
  for (const [from, to] of say.replace || []) t = t.split(from).join(to);
  t = t
    .replace(/\b(\d{3})-(\d{3})-(\d{4})\b/g, (_, a, b, c) => `${enDigits(a)}, ${enDigits(b)}, ${enDigits(c)}`)
    .replace(/\b(\d{3})-(\d{4})\b/g, (_, a, b) => `${enDigits(a)}, ${enDigits(b)}`)
    .replace(/\b([A-Z](?:-[A-Z])+)\b/g, (m) => m.split('-').join(', '))
    .replace(/\$(\d+)\.(\d\d)\b/g, (_, d, c) => `${enNumber(d)} dollar${d === '1' ? '' : 's'} and ${enNumber(c)} cents`)
    .replace(/\$(\d+)\b/g, (_, d) => `${enNumber(d)} dollar${d === '1' ? '' : 's'}`)
    .replace(/\b(\d{1,2}):(\d\d)\b/g, (_, hh, mm) => `${enNumber(hh)} ${mm === '00' ? "o'clock" : (mm[0] === '0' ? 'oh ' + ONES[mm[1]] : enNumber(mm))}`)
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, (_, d) => enOrdinal(d))
    .replace(/\b(1[5-9]\d\d|20\d\d)\b/g, (y) => enYear(y))
    .replace(/\b(\d{5})\b/g, (z) => enDigits(z))
    .replace(/\b\d{1,4}\b/g, (d) => enNumber(d))
    .replace(/(I\.D\.)\.(?!\.)/g, '$1');
  return t;
}

const FA1 = ['صفر', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نُه', 'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const FA10 = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const FA100 = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
export function faNumber(n) {
  n = Number(n);
  if (n < 20) return FA1[n];
  if (n < 100) return FA10[Math.floor(n / 10)] + (n % 10 ? ' و ' + FA1[n % 10] : '');
  if (n < 1000) return FA100[Math.floor(n / 100)] + (n % 100 ? ' و ' + faNumber(n % 100) : '');
  if (n < 1000000) { const k = Math.floor(n / 1000); return (k === 1 ? 'هزار' : faNumber(k) + ' هزار') + (n % 1000 ? ' و ' + faNumber(n % 1000) : ''); }
  return String(n);
}
const latin = (s) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const faDigits = (s) => s.split('').map((d) => FA1[d]).join(' ');

export function spokenFa(text, say) {
  let t = text.replace(/[«»]/g, '').replace(/\(.*?\)/g, '').trim();
  for (const [from, to] of say.replaceFa || []) t = t.split(from).join(to);
  t = latin(t)
    .replace(/(\d{3})-(\d{3})-(\d{4})/g, (_, a, b, c) => `${faDigits(a)}، ${faDigits(b)}، ${faDigits(c)}`)
    .replace(/(\d{3})-(\d{4})/g, (_, a, b) => `${faDigits(a)}، ${faDigits(b)}`)
    .replace(/\b911\b/g, 'نُه، یک، یک')
    .replace(/\b(\d{5})\b/g, (z) => faDigits(z))
    .replace(/\b\d{1,4}\b/g, (d) => faNumber(d));
  return t;
}

export function spoken(text, lang, say) { return lang === 'en' ? spokenEn(text, say) : spokenFa(text, say); }
