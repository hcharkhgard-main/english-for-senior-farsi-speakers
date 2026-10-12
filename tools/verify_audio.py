#!/usr/bin/env python3
"""Listen back to the generated clips with speech recognition and flag any that do not
match their text. English: a fast first pass (Moonshine), then a careful second pass
(Whisper) on anything the first pass doubted. Farsi: Whisper.

  python3 tools/verify_audio.py [--models DIR] [--lang en|fa] [--limit N]
Writes audio-src/verify-report.json.
"""
import argparse, json, os, re, subprocess, sys, time, base64, difflib
import numpy as np
import onnxruntime as ort
import sherpa_onnx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--models', default=os.environ.get('HAMRAH_MODELS', os.path.join(ROOT, '..', 'models')))
ap.add_argument('--lang', default='')
ap.add_argument('--limit', type=int, default=0)
ap.add_argument('--only', default='', help='file with one clip key per line: check only these')
args = ap.parse_args()
M = os.path.abspath(args.models)

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
        'tv': 't v', 'atm': 'a t m', 'thanks': 'thank you', 'alright': 'all right', 'checkout': 'check out', 'pickup': 'pick up', 'dropoff': 'drop off', 'cannot': 'can not'}
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
    t = re.sub(r'(\d+)(st|nd|rd|th)\b', r'\1', t)
    t = re.sub(r'(?<=\d)(?=[a-z])|(?<=[a-z])(?=\d)', ' ', t)      # "24c" = "24 C"
    t = re.sub(r'(\d)\.(\d)', r'\1 \2', t)
    words = []
    for w in re.split(r"[\s\-]+", re.sub(r"[^a-z0-9' \-]", ' ', t)):
        w = w.strip("'")
        if not w: continue
        m = re.fullmatch(r'(\d+)(st|nd|rd|th)', w)
        if m: w = m.group(1)
        if w in CONTR: words += CONTR[w].split(); continue
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
    t = t.replace('‌', ' ').replace('ي', 'ی').replace('ك', 'ک').replace('ۀ', 'ه').replace('ة', 'ه').replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ؤ', 'و').replace('ئ', 'ی')
    t = re.sub(r'[ً-ْٰٔ]', '', t)
    return re.sub(r'\s+', '', re.sub(r'[^؀-ۿ0-9a-zA-Z ]', ' ', t))
def sim_fa(a, b):
    return difflib.SequenceMatcher(None, fa_norm(a), fa_norm(b)).ratio()

class Moon:
    def __init__(self):
        d = f'{M}/sherpa-onnx-moonshine-tiny-en-quantized-2026-02-27'
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

def whisper(lang):
    w = f'{M}/sherpa-onnx-whisper-turbo'
    rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=w + '/turbo-encoder.int8.onnx', decoder=w + '/turbo-decoder.int8.onnx', tokens=w + '/turbo-tokens.txt', language=lang, task='transcribe', num_threads=2)
    def run(x):
        st = rec.create_stream(); st.accept_waveform(16000, np.concatenate([np.zeros(6000, np.float32), x, np.zeros(14000, np.float32)])); rec.decode_stream(st); return st.result.text.strip()
    return run

reqs = json.load(open(f'{ROOT}/audio-src/requests.json'))
if args.only:
    keep = set(open(args.only).read().split()); reqs = [r for r in reqs if r['key'] in keep]
clips = f'{ROOT}/audio-src/clips'
report = {'checked': 0, 'missing': [], 'flagged': [], 'by': {}}
t0 = time.time()
if args.lang in ('', 'en'):
    en = [r for r in reqs if r['lang'] == 'en']
    if args.limit: en = en[:args.limit]
    moon = Moon(); doubt = []
    for n, r in enumerate(en):
        f = f"{clips}/{r['key']}.mp3"
        if not os.path.exists(f): report['missing'].append(r['text']); continue
        x = load(f); dur = len(x) / 16000
        heard = moon(x); s = sim_en(r['say'], heard)
        report['checked'] += 1
        if s < 0.99 or dur < 0.25 or dur > 14: doubt.append((r, x, heard, s, dur))
        if n % 300 == 0: print(f'en pass 1: {n}/{len(en)} doubts={len(doubt)} {time.time()-t0:.0f}s', flush=True)
    print(f'en pass 1 done: {len(doubt)} of {len(en)} need a second listen', flush=True)
    wh = whisper('en')
    for n, (r, x, heard, s, dur) in enumerate(doubt):
        h2 = wh(x); s2 = sim_en(r['say'], h2)
        ok = max(s, s2) >= 0.99        # two different recognisers: one hearing exactly the text is enough
        if not ok: report['flagged'].append({'key': r['key'], 'lang': 'en', 'voice': r['voice'], 'speed': r['speed'], 'text': r['text'], 'say': r['say'], 'heard_fast': heard, 'heard_careful': h2, 'score': round(max(s, s2), 2), 'seconds': round(dur, 2), 'pack': r['pack']})
        if n % 50 == 0: print(f'en pass 2: {n}/{len(doubt)} flagged={len(report["flagged"])} {time.time()-t0:.0f}s', flush=True)
    report['by']['en'] = {'clips': len(en), 'second_listen': len(doubt), 'flagged': len([f for f in report['flagged'] if f['lang'] == 'en'])}
if args.lang in ('', 'fa'):
    fa = [r for r in reqs if r['lang'] == 'fa']
    if args.limit: fa = fa[:args.limit]
    wh = whisper('fa'); scores = []
    for n, r in enumerate(fa):
        f = f"{clips}/{r['key']}.mp3"
        if not os.path.exists(f): report['missing'].append(r['text']); continue
        x = load(f); h = wh(x); s = sim_fa(r['say'], h); scores.append(s); report['checked'] += 1
        if s < 0.85: report['flagged'].append({'key': r['key'], 'lang': 'fa', 'text': r['text'], 'heard_careful': h, 'score': round(s, 2), 'pack': r['pack']})
        if n % 50 == 0: print(f'fa: {n}/{len(fa)} {time.time()-t0:.0f}s', flush=True)
    report['by']['fa'] = {'clips': len(fa), 'mean_similarity': round(float(np.mean(scores)), 3) if scores else None, 'flagged': len([f for f in report['flagged'] if f['lang'] == 'fa'])}
json.dump(report, open(f'{ROOT}/audio-src/verify-report.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(report['by'], ensure_ascii=False), 'missing', len(report['missing']), 'flagged', len(report['flagged']), f'{time.time()-t0:.0f}s')
