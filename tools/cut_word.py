"""Single English words are recorded inside a short carrier sentence and then cut out.

Why: asked to say one short word on its own, the voice model adds a small vowel after the last consonant
("take" comes out close to "take-uh", "big" close to "biggie"). That is exactly the habit a Farsi speaker must
not pick up. At the end of a sentence the same word is clean, so we synthesise "Now say: WORD." and keep only
the part after the pause.
"""
import numpy as np
CARRIER = 'Now say: '

def _frames(x, sr, ms=10):
    n = int(sr * ms / 1000)
    k = len(x) // n
    f = x[:k * n].reshape(k, n)
    e = np.sqrt(np.mean(f * f, axis=1))
    per = np.zeros(k)
    lo, hi = int(sr / 400), int(sr / 70)
    w = int(sr * 0.03)
    for i in range(k):
        a = max(0, i * n + n // 2 - w // 2); seg = x[a:a + w]
        if len(seg) < w: continue
        seg = seg - seg.mean(); ac = np.correlate(seg, seg, 'full')[w - 1:]
        per[i] = ac[lo:hi].max() / ac[0] if ac[0] > 0 else 0
    return e, per, n

def cut_word(x, sr):
    """x = audio of 'Now say: WORD.'  Returns the audio of WORD alone, or None if the pause could not be found.
    The carrier 'Now say' has no stop consonant and so no silence inside it ('Now' voiced, 's' noise, 'ay' voiced;
    in a male voice the 'ay' often ends creaky, broken into short voiced pieces). The first stretch of >= 30 ms of
    quiet after it is the pause before the word. What follows must hold some voiced speech, or the cut failed."""
    x = np.asarray(x, np.float32)
    e, per, n = _frames(x, sr)
    k = len(e); mx = e.max()
    loud = np.where(e > 0.06 * mx)[0]
    if loud.size == 0: return None
    onset = loud[0]
    quiet = e < 0.035 * mx
    voiced = (e > 0.06 * mx) & (per > 0.5)
    # 'Now say' lasts at least ~250 ms; the pause must come within 1.6 s of the onset
    i = onset + 25; start = None
    while i < min(k - 3, onset + 160):
        if quiet[i] and quiet[i + 1] and quiet[i + 2]: start = i; break
        i += 1
    if start is None: return None
    if voiced[onset:start].sum() < 12: return None          # the carrier itself was not found before the pause
    j = start
    while j < k and quiet[j]: j += 1
    if j >= k - 3 or voiced[j:].sum() < 4: return None      # nothing (voiced) after the pause
    cut = max(start + 1, j - 3)              # keep up to 30 ms of quiet before the word
    return x[cut * n:]
