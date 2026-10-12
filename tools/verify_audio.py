#!/usr/bin/env python3
"""Listen back to the generated clips with speech recognition and flag any that do not
match their text. English: a fast first pass (Moonshine), then a careful second pass
(Whisper) on anything the first pass doubted. Farsi: Whisper.

  python3 tools/verify_audio.py [--models DIR] [--lang en|fa] [--limit N] [--only KEYFILE] [--threads N]
  python3 tools/verify_audio.py --coverage      # which clips were never listened back in their current form

Writes audio-src/verify-report.json (this run) and updates audio-src/listened.json, the listen-back ledger:
one entry per clip key with a hash of the spoken text and of the clip file, so a clip counts as listened
back only in the exact form it was checked in. tools/gen_audio.py --takes uses the same judge.
"""
import argparse, json, os, re, subprocess, sys, time, base64, difflib, hashlib
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = f'{ROOT}/audio-src/listened.json'
DEFAULT_MODELS = os.environ.get('HAMRAH_MODELS', os.path.join(ROOT, '..', 'models'))

def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ar', '16000', '-ac', '1', '-f', 'f32le', 'pipe:1'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32)

ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
ORD = {'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5, 'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10, 'eleventh': 11, 'twelfth': 12,
       'thirteenth': 13, 'fourteenth': 14, 'fifteenth': 15, 'sixteenth': 16, 'seventeenth': 17, 'eighteenth': 18, 'nineteenth': 19, 'twentieth': 20, 'thirtieth': 30}
NUM = {w: i for i, w in enumerate(ONES)}; NUM.update({w: i * 10 for i, w in enumerate(TENS) if w}); NUM.update(ORD); NUM['oh'] = 0; NUM['o'] = 0
CONTR = {"i'm": 'i am', "i'd": 'i would', "i'll": 'i will', "it's": 'it is', "that's": 'that is', "what's": 'what is', "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'can not', "cannot": 'can not', "won't": 'will not', "isn't": 'is not', "let's": 'let us', "you're": 'you are', "we're": 'we are', "they're": 'they are', "i've": 'i have', "o'clock": 'oclock', "we'll": 'we will', "he's": 'he is', "she's": 'she is', "there's": 'there is', "you'll": 'you will', "where's": 'where is', "aren't": 'are not', "wasn't": 'was not', "haven't": 'have not', "couldn't": 'could not', "shouldn't": 'should not', "wouldn't": 'would not', "here's": 'here is', "who's": 'who is', "how's": 'how is', "bank's": 'bank', "driver's": 'drivers', "doctor's": 'doctors'}
# Spellings a recogniser may choose for the same sound. Both sides are reduced to the same form before comparing.
SAME = {'ok': 'okay', 'id': 'i d', 'mariam': 'maryam', 'miriam': 'maryam', 'merriam': 'maryam', 'amadi': 'ahmadi', 'armin': 'arman', 'sarah': 'sara', 'ollie': 'ali', 'olly': 'ali',
        'seatbelt': 'seat belt', 'fair': 'fare', 'weight': 'wait', 'too': 'two', 'male': 'mail', 'sail': 'sale', 'waste': 'waist', 'weak': 'week', 'copay': 'co pay',
        'noruz': 'norooz', 'nowruz': 'norooz', 'hallal': 'halal', 'goodbye': 'good bye', 'today': 'to day', 'pm': 'p m', 'dollars': 'dollar', 'cents': 'cent',
        'tv': 't v', 'atm': 'a t m', 'thanks': 'thank you', 'alright': 'all right', 'checkout': 'check out', 'pickup': 'pick up', 'dropoff': 'drop off', 'cannot': 'can not', 'high': 'hi', 'am': 'a m'}
# What a recogniser writes when it hears one letter name or one short word on its own.
ALONE = {'a': 'a ay eh hey', 'b': 'b be bee', 'c': 'c see sea', 'd': 'd dee', 'e': 'e he', 'f': 'f ef eff', 'g': 'g gee', 'h': 'h aitch age', 'i': 'i eye', 'j': 'j jay', 'k': 'k kay okay', 'l': 'l el elle',
         'm': 'm em', 'n': 'n en an', 'o': 'o oh owe', 'p': 'p pee pea', 'q': 'q cue queue', 'r': 'r are', 's': 's es yes', 't': 't tea tee', 'u': 'u you', 'v': 'v vee we', 'w': 'w', 'x': 'x ex', 'y': 'y why', 'z': 'z zee',
         'buy': 'buy bye by', 'know': 'know no', 'write': 'write right', 'meat': 'meat meet', 'hear': 'hear here', 'two': 'two too to', 'four': 'four for', 'eight': 'eight ate', 'one': 'one won', 'tea': 'tea t',
         'be': 'be b bee', 'see': 'see sea c', 'eye': 'eye i', 'aisle': 'aisle ill isle', 'fare': 'fare fair', 'sale': 'sale sail', 'wait': 'wait weight', 'week': 'week weak', 'there': 'there their', 'son': 'son sun',
         'flour': 'flour flower', 'hour': 'hour our', 'wear': 'wear where', 'whole': 'whole hole', 'pair': 'pair pear', 'mail': 'mail male', 'waist': 'waist waste', 'due': 'due do dew', 'new': 'new knew', 'owe': 'owe oh o',
         'were': 'were where', 'your': 'your youre', 'its': 'its', 'cent': 'cent sent', 'knee': 'knee', 'tow': 'tow toe', 'sew': 'sew so', 'hem': 'hem him', 'red': 'red read', 'read': 'read red reed'}

def en_tokens(t):
    t = t.lower().replace('’', "'")
    t = re.sub(r'\$(\d+)\.(\d\d)', r'\1 dollars and \2 cents', t)
    t = re.sub(r'\$(\d+)', r'\1 dollars', t)
    t = t.replace('%', ' percent')
    t = re.sub(r'\b([ap])\.\s?m\b\.?', r'\1m', t)                 # "9 a.m." = "nine AM"
    t = re.sub(r'(\d+)(st|nd|rd|th)\b', r'\1', t)
    t = re.sub(r'(?<=\d)(?=[a-z])|(?<=[a-z])(?=\d)', ' ', t)      # "24c" = "24 C"
    t = re.sub(r'(\d)\.(\d)', r'\1 \2', t)
    words = []
    for w in re.split(r"[\s\-]+", re.sub(r"[^a-z0-9' \-]", ' ', t)):
        w = w.strip("'")
        if not w: continue
        m = re.fullmatch(r'(\d+)(st|nd|rd|th)', w)
        if m: w = m.group(1)
        if w in CONTR: words += [x for c in CONTR[w].split() for x in SAME.get(c, c).split()]; continue
        w = w.replace("'", '')
        words += SAME.get(w, w).split()
    # numbers: every run of number words or digits becomes one string of digits, however it was written
    # ("twenty-one seventy-five" = "2175", "five five five, oh one seven oh" = "555-0170", "fifth" = "5")
    out, run = [], []
    def flush():
        if run: out.append(''.join(run)); run.clear()
    i = 0
    while i < len(words):
        w = words[i]
        if w.isdigit(): run.append(w)
        elif w in NUM and not (w in ('oh', 'o') and not run and not (i + 1 < len(words) and (words[i + 1] in NUM or words[i + 1].isdigit()))):
            v = NUM[w]
            if v >= 20 and v % 10 == 0 and i + 1 < len(words) and words[i + 1] in NUM and 0 < NUM[words[i + 1]] < 10 and words[i + 1] not in ('oh', 'o'): v += NUM[words[i + 1]]; i += 1
            if i + 1 < len(words) and words[i + 1] == 'hundred':
                v *= 100; i += 1
                if i + 1 < len(words) and words[i + 1] == 'and': i += 1
                if i + 1 < len(words) and words[i + 1] in NUM and words[i + 1] not in ('oh', 'o'):
                    v2 = NUM[words[i + 1]]; i += 1
                    if v2 >= 20 and v2 % 10 == 0 and i + 1 < len(words) and words[i + 1] in NUM and 0 < NUM[words[i + 1]] < 10: v2 += NUM[words[i + 1]]; i += 1
                    v += v2
            run.append(str(v))
        else: flush(); out.append(w)
        i += 1
    flush()
    return out

CARRIER = 'Now say: '
def sim_en(a, b):
    if a.startswith(CARRIER): a = a[len(CARRIER):]
    ta, tb = en_tokens(a), en_tokens(b)
    if not ta: return 0.0
    # a recogniser often repeats a very short clip ("Milk. Milk. Milk."): one clean repetition is enough
    if len(tb) > len(ta) and len(tb) % len(ta) == 0 and tb == ta * (len(tb) // len(ta)): return 1.0
    if len(ta) == 1 and len(tb) == 1 and tb[0] in ALONE.get(ta[0], '').split(): return 1.0
    if len(ta) == 1 and len(tb) == 1 and ta[0].isdigit() and tb[0].isdigit() and int(ta[0]) == int(tb[0]): return 1.0
    return difflib.SequenceMatcher(None, ta, tb).ratio()
def fa_norm(t):
    t = t.translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹', '0123456789')).replace('‌', ' ').replace('ي', 'ی').replace('ك', 'ک').replace('ۀ', 'ه').replace('ة', 'ه').replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ؤ', 'و').replace('ئ', 'ی')
    t = re.sub(r'[ً-ْٰٔ]', '', t)
    return re.sub(r'\s+', '', re.sub(r'[^؀-ۿ0-9a-zA-Z ]', ' ', t))
def sim_fa(a, b):
    return difflib.SequenceMatcher(None, fa_norm(a), fa_norm(b)).ratio()

class Moon:
    def __init__(self, models=DEFAULT_MODELS):
        import onnxruntime as ort
        d = f'{os.path.abspath(models)}/sherpa-onnx-moonshine-tiny-en-quantized-2026-02-27'
        so = ort.SessionOptions(); so.intra_op_num_threads = 1
        self.enc = ort.InferenceSession(d + '/encoder_model.ort', so, providers=['CPUExecutionProvider'])
        self.dec = ort.InferenceSession(d + '/decoder_model_merged.ort', so, providers=['CPUExecutionProvider'])
        self.names = [o.name for o in self.dec.get_outputs()]
        self.toks = {}
        for line in open(d + '/tokens.txt', encoding='utf8'):
            p = line.rstrip('\n').rsplit(' ', 1)
            if len(p) == 2: self.toks[int(p[1])] = p[0]
    def __call__(self, x):
        x = x.astype(np.float32)[None, :]
        h = self.enc.run(None, {'input_values': x, 'attention_mask': np.ones(x.shape, np.int64)})[0]
        T = h.shape[1]; past = {}
        for i in range(6):
            for k in ('decoder', 'encoder'):
                past[f'past_key_values.{i}.{k}.key'] = np.zeros((1, 8, 0, 36), np.float32); past[f'past_key_values.{i}.{k}.value'] = np.zeros((1, 8, 0, 36), np.float32)
        last, out = 1, []
        for step in range(int(x.shape[1] / 16000 * 6.5) + 4):
            res = dict(zip(self.names, self.dec.run(None, {'input_ids': np.array([[last]], np.int64), 'encoder_hidden_states': h, 'encoder_attention_mask': np.ones((1, T), np.int64), 'use_cache_branch': np.array([step > 0]), **past})))
            nxt = int(res['logits'][0, -1].argmax())
            for i in range(6):
                past[f'past_key_values.{i}.decoder.key'] = res[f'present.{i}.decoder.key']; past[f'past_key_values.{i}.decoder.value'] = res[f'present.{i}.decoder.value']
                if step == 0: past[f'past_key_values.{i}.encoder.key'] = res[f'present.{i}.encoder.key']; past[f'past_key_values.{i}.encoder.value'] = res[f'present.{i}.encoder.value']
            if nxt == 2: break
            out.append(nxt); last = nxt
        bs = b''.join(base64.b64decode(self.toks.get(i, '')) for i in out)
        return bs.decode('utf8', 'replace').replace('▁', ' ').strip()

def whisper(lang, models=DEFAULT_MODELS, threads=2):
    import sherpa_onnx
    w = f'{os.path.abspath(models)}/sherpa-onnx-whisper-turbo'
    rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=w + '/turbo-encoder.int8.onnx', decoder=w + '/turbo-decoder.int8.onnx', tokens=w + '/turbo-tokens.txt', language=lang, task='transcribe', num_threads=threads)
    def run(x):
        st = rec.create_stream(); st.accept_waveform(16000, np.concatenate([np.zeros(6000, np.float32), x, np.zeros(14000, np.float32)])); rec.decode_stream(st); return st.result.text.strip()
    return run

# "Do you …?" / "Does …?": one voice swallows the sentence-initial "Do", so the line is heard as a statement
# ("You have insurance."). The similarity score forgives one missing word, and the fast recogniser sometimes
# hears the "do" that is not really there, so for these lines the careful recogniser must hear every do/does.
def needs_do(text):
    return len(re.findall(r"\b(?:do|does)\b(?!n?['’]t)", text.lower()))
def has_do(text, heard):
    n = needs_do(text)
    return n == 0 or sum(1 for w in en_tokens(heard) if w in ('do', 'does')) >= n

def targets(r):
    """What the clip may be compared with: the spoken text (without the carrier) and the displayed text.
    A respelling ("liv", "cloze", "Norooz") is written back as the word by a recogniser, so the displayed
    text is the fairer reference for those; digits and number words are the same to en_tokens."""
    t = [r['say']]
    if r['text'] != r['say']: t.append(r['text'])
    return t

class Judge:
    """Listens to one clip and decides whether it says its text. Used by this script and by gen_audio.py --takes."""
    def __init__(self, models=DEFAULT_MODELS, threads=2, langs=('en', 'fa')):
        # recognisers are loaded when first needed (Whisper is large: one language at a time keeps memory down)
        self.models, self.threads, self._moon, self._wh = models, threads, None, {}
    @property
    def moon(self):
        if self._moon is None: self._moon = Moon(self.models)
        return self._moon
    @property
    def wh(self):
        return self
    def __getitem__(self, lang):
        if lang not in self._wh:
            self._wh.clear()
            import gc; gc.collect()
            self._wh[lang] = whisper(lang, self.models, self.threads)
        return self._wh[lang]
    def en(self, r, x):
        dur = len(x) / 16000
        heard = self.moon(x); s = max(sim_en(t, heard) for t in targets(r)); h2 = ''
        must_do = needs_do(r['text']) > 0
        if s < 0.99 or dur < 0.25 or dur > 14 or must_do:
            h2 = self.wh['en'](x); s2 = max(sim_en(t, h2) for t in targets(r))
        else: s2 = 0.0
        score = max(s, s2)
        ok = score >= 0.99 and 0.25 <= dur <= 14          # two different recognisers: one hearing exactly the text is enough
        if must_do and not has_do(r['text'], h2): ok = False; score = min(score, 0.9)
        return {'ok': ok, 'score': round(score, 3), 'heard_fast': heard, 'heard_careful': h2, 'seconds': round(dur, 2)}
    def fa(self, r, x):
        h = self.wh['fa'](x); s = max(sim_fa(t, h) for t in targets(r))
        return {'ok': s >= 0.85, 'score': round(s, 3), 'heard_careful': h, 'seconds': round(len(x) / 16000, 2)}
    def __call__(self, r, x): return self.en(r, x) if r['lang'] == 'en' else self.fa(r, x)

def h12(b): return hashlib.sha1(b if isinstance(b, bytes) else b.encode('utf8')).hexdigest()[:12]
def clip_hash(path): return h12(open(path, 'rb').read())
def load_ledger():
    try: return json.load(open(LEDGER, encoding='utf8'))
    except FileNotFoundError: return {}
def save_ledger(led):
    tmp = LEDGER + '.tmp'
    json.dump(led, open(tmp, 'w', encoding='utf8'), ensure_ascii=False, indent=0, sort_keys=True); os.replace(tmp, LEDGER)
def ledger_entry(r, path, res):
    return {'say': h12(r['say']), 'clip': clip_hash(path), 'ok': bool(res['ok']), 'score': res['score'], 'heard': res.get('heard_careful') or res.get('heard_fast', '')}
def made_from(path, say):
    """True if the clip at path was generated from this spoken text (its .txt beside it)."""
    try: return open(path[:-4] + '.txt', encoding='utf8').read() == say
    except FileNotFoundError: return False
def current(led, r, path):
    e = led.get(r['key'])
    return bool(e) and e['say'] == h12(r['say']) and os.path.exists(path) and made_from(path, r['say']) and e['clip'] == clip_hash(path)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', default=DEFAULT_MODELS)
    ap.add_argument('--lang', default='')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--threads', type=int, default=2)
    ap.add_argument('--only', default='', help='file with one clip key per line: check only these')
    ap.add_argument('--stale', action='store_true', help='check only clips that have no current entry in the ledger')
    ap.add_argument('--coverage', action='store_true', help='report how many clips have a current passing listen-back; no listening')
    ap.add_argument('--accept', default='', help='with --only: record that these flagged clips were reviewed and are acceptable, with this reason (no listening)')
    args = ap.parse_args()
    reqs = json.load(open(f'{ROOT}/audio-src/requests.json'))
    clips = f'{ROOT}/audio-src/clips'
    led = load_ledger()
    if args.accept:
        keep = set(open(args.only).read().split()) if args.only else set()
        n = 0
        for r in reqs:
            if r['key'] in keep and current(led, r, f"{clips}/{r['key']}.mp3"): led[r['key']]['accepted'] = args.accept; n += 1
        save_ledger(led); print(f'accepted {n} of {len(keep)}'); return
    if args.coverage:
        never, failed = [], []
        for r in reqs:
            f = f"{clips}/{r['key']}.mp3"
            if not current(led, r, f): never.append(r)
            elif not led[r['key']]['ok'] and not led[r['key']].get('accepted'): failed.append(r)
        print(json.dumps({'clips': len(reqs), 'listened': len(reqs) - len(never), 'not_listened': len(never), 'flagged_not_accepted': len(failed)}))
        for r in never[:20]: print('  not listened:', r['key'], r['lang'], r['voice'], r['speed'], r['text'][:70])
        for r in failed[:40]: print('  flagged:', r['key'], r['lang'], r['voice'], r['speed'], r['text'][:60], '| heard:', led[r['key']]['heard'][:60])
        sys.exit(1 if never or failed else 0)
    if args.only:
        keep = set(open(args.only).read().split()); reqs = [r for r in reqs if r['key'] in keep]
    if args.stale: reqs = [r for r in reqs if not current(led, r, f"{clips}/{r['key']}.mp3")]
    if args.lang: reqs = [r for r in reqs if r['lang'] == args.lang]
    langs = tuple(l for l in ('en', 'fa') if any(r['lang'] == l for r in reqs))
    report = {'checked': 0, 'missing': [], 'flagged': [], 'by': {}}
    if not reqs: print('nothing to check'); return
    judge = Judge(args.models, args.threads, langs)
    t0 = time.time()
    for lang in langs:
        rs = [r for r in reqs if r['lang'] == lang]
        if args.limit: rs = rs[:args.limit]
        scores = []
        for n, r in enumerate(rs):
            f = f"{clips}/{r['key']}.mp3"
            if not os.path.exists(f) or not made_from(f, r['say']): report['missing'].append(r['text']); continue    # missing or stale: generate first
            res = judge(r, load(f)); report['checked'] += 1; scores.append(res['score'])
            prev = led.get(r['key'])
            e = ledger_entry(r, f, res)
            if prev and prev.get('accepted') and prev['say'] == e['say'] and prev['clip'] == e['clip']: e['accepted'] = prev['accepted']
            led[r['key']] = e
            if not res['ok']:
                row = {'key': r['key'], 'lang': lang, 'voice': r['voice'], 'speed': r['speed'], 'text': r['text'], 'say': r['say'], **res, 'pack': r['pack']}
                report['flagged'].append(row)
            if n % 100 == 0:
                print(f'{lang}: {n}/{len(rs)} flagged={len(report["flagged"])} {time.time()-t0:.0f}s', flush=True); save_ledger(led)
        report['by'][lang] = {'clips': len(rs), 'mean_similarity': round(float(np.mean(scores)), 3) if scores else None, 'flagged': len([f for f in report['flagged'] if f['lang'] == lang])}
    save_ledger(led)
    json.dump(report, open(f'{ROOT}/audio-src/verify-report.json', 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(report['by'], ensure_ascii=False), 'missing', len(report['missing']), 'flagged', len(report['flagged']), f'{time.time()-t0:.0f}s')

if __name__ == '__main__':
    main()
