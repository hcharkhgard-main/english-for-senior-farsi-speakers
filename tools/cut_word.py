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
    The carrier is 'Now' (voiced) + 's' (noise) + 'ay' (voiced), then a pause, then the word."""
    x = np.asarray(x, np.float32)
    e, per, n = _frames(x, sr)
    mx = e.max()
    loud = e > 0.06 * mx
    voiced = loud & (per > 0.5)
    # runs of voiced frames, tolerating one-frame dropouts
    runs = []; i = 0; k = len(e)
    while i < k:
        if voiced[i]:
            j = i
            while j + 1 < k and (voiced[j + 1] or (j + 2 < k and voiced[j + 2])): j += 1
            if j - i >= 5: runs.append((i, j))
            i = j + 1
        else: i += 1
    if len(runs) < 2: return None
    end_ay = runs[1][1]                      # last voiced frame of 'say'
    # the pause: first stretch of >= 3 quiet frames (30 ms) starting within 150 ms after 'ay'
    quiet = e < 0.035 * mx
    i = end_ay + 1; start = None
    while i < min(k - 3, end_ay + 16):
        if quiet[i] and quiet[i + 1] and quiet[i + 2]: start = i; break
        i += 1
    if start is None: return None
    j = start
    while j < k and quiet[j]: j += 1
    if j >= k - 3: return None               # nothing after the pause
    cut = max(start + 1, j - 3)              # keep up to 30 ms of quiet before the word
    return x[cut * n:]
