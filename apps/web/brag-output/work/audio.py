"""Crow launch soundtrack: 120 BPM, A minor -> C major lift, 20 s.

Everything (drums, bass, pad, bell and the effects on cuts and taps) sits on
one beat grid counted from frame 0 and in one key. numpy only.
"""
import wave
import numpy as np

SR = 44100
DUR = 20.0
BPM = 120
BEAT = 60 / BPM  # 0.5 s
N = int(SR * DUR)
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def add(sig, at, gain=1.0, pan=0.0):
    i = int(round(at * SR))
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def spectral(sig, lo=None, hi=None):
    """Brick-ish band filter with soft edges, in the frequency domain."""
    S = np.fft.rfft(sig)
    f = np.fft.rfftfreq(len(sig), 1 / SR)
    m = np.ones_like(f)
    if lo:
        m *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(S * m, len(sig))


def env(n, a=0.005, d=0.2):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1) * np.exp(-t / d)


# --- chords: one per bar (2 s). Am F C G | Am F C G | F C
CHORDS = [
    [57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62],
    [57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62],
    [53, 57, 60], [48, 55, 64],
]
ROOTS = [45, 41, 36, 43, 45, 41, 36, 43, 41, 36]

# --- kick
def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    click = spectral(rng.standard_normal(n), 2000, 8000) * np.exp(-t / 0.003) * 0.3
    return (np.sin(ph) * np.exp(-t / 0.16) + click) * np.minimum(t / 0.001, 1)


def clap():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = spectral(rng.standard_normal(n), 900, 5000)
    e = np.exp(-t / 0.09)
    for off in (0.0, 0.011, 0.022):  # three quick hands
        e += 0.6 * np.exp(-np.maximum(t - off, 0) / 0.006) * (t >= off)
    return noise * e / 4


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    return spectral(rng.standard_normal(n), 7000, 14000) * np.exp(-t / (0.06 if open_ else 0.015))


K, C = kick(), clap()
duck = np.ones(N)  # sidechain curve for pad and bass

beats = np.arange(0, DUR, BEAT)
for b in beats:
    if b < 4.0:
        # Intro: half-time, filtered.
        if b % 2.0 == 0:
            add(spectral(K, None, 400), b, 0.5)
    elif b < 18.0:
        add(K, b, 0.7)
        i = int(b * SR)
        n = int(0.22 * SR)
        duck[i : i + n] = np.minimum(duck[i : i + n], 1 - 0.55 * np.exp(-np.arange(min(n, N - i)) / SR / 0.08))
        if round(b / BEAT) % 2 == 1:
            add(C, b, 0.55, 0.05)
for e8 in np.arange(6.5, 17.5, BEAT / 2):
    add(hat(), e8, 0.10 if (e8 / (BEAT / 2)) % 2 else 0.05, 0.3)
for b in np.arange(4.25, 17.5, 1.0):
    add(hat(True), b, 0.05, -0.3)

# --- bass: plucky saw on eighths from the drop
def saw(f, n):
    t = np.arange(n) / SR
    s = 2 * ((t * f) % 1) - 1
    s += 0.5 * (2 * ((t * f * 1.005) % 1) - 1)
    return s


bass = np.zeros(N)
for bar, root in enumerate(ROOTS):
    if bar * 2.0 < 4.0:
        continue
    for k in range(8):
        at = bar * 2.0 + k * BEAT / 2
        if at >= 18.0:
            break
        n = int(0.24 * SR)
        note = root + (12 if k in (3, 7) else 0)
        s = spectral(saw(midi(note), n), None, 900) * env(n, 0.003, 0.09)
        i = int(at * SR)
        bass[i : i + n] += s[: N - i] * 0.22
# final hit bass
n = int(2.0 * SR)
s = spectral(saw(midi(36), n), None, 700) * env(n, 0.003, 0.6)
bass[int(18.0 * SR) :] += s[: N - int(18.0 * SR)] * 0.3
bass *= duck
L += bass * 0.7
R += bass * 0.7

# --- pad: soft detuned triangles, a slow swell per bar
def tri(f, n, detune=0.0):
    t = np.arange(n) / SR
    return 2 * np.abs(2 * ((t * f * (1 + detune)) % 1) - 1) - 1


pad_l, pad_r = np.zeros(N), np.zeros(N)
for bar, chord in enumerate(CHORDS):
    at = bar * 2.0
    n = int(2.3 * SR)
    t = np.arange(n) / SR
    e = np.minimum(t / 0.25, 1) * np.clip((2.3 - t) / 0.4, 0, 1)
    sl = sum(tri(midi(m + 12), n, -0.003) for m in chord)
    sr = sum(tri(midi(m + 12), n, 0.003) for m in chord)
    cut = 1200 if at < 4 else 2600
    sl, sr = spectral(sl, 150, cut) * e, spectral(sr, 150, cut) * e
    i = int(at * SR)
    m_ = min(n, N - i)
    g = 0.045 if at < 12 else 0.06
    pad_l[i : i + m_] += sl[:m_] * g
    pad_r[i : i + m_] += sr[:m_] * g
L += pad_l * duck
R += pad_r * duck

# --- bell: FM-ish tone for hits, always chord tones
def bell(note, dur=1.2, bright=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi(note)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * bright * 2.2 * np.exp(-t / 0.15)
    return np.sin(2 * np.pi * f * t + mod) * env(n, 0.002, dur / 3.5)


def pluck(note, dur=0.35):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi(note)
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
    return s * env(n, 0.002, 0.08)


# Chat bubbles: A minor arpeggio, one per bubble.
# Chat messages: one per message, on the beat, climbing A minor.
for at, note in [(0.0, 69), (1.25, 72)]:
    add(pluck(note), at, 0.3, -0.15)
# "ok who's keeping score?": a brighter two-note bell, the question.
add(bell(76, 1.2, 0.6), 2.5, 0.12, 0.15)
add(bell(81, 1.2, 0.6), 2.5, 0.09, 0.15)

# Riser into the drop, and into the outro.
def riser(dur, lo, hi):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    seg = int(0.05 * SR)
    for s in range(0, n, seg):  # sweep the band up in small steps
        x = s / n
        c = lo * (hi / lo) ** x
        chunk = noise[max(0, s - seg) : s + 2 * seg]
        filt = spectral(chunk, c * 0.7, c * 1.6)
        off = s - max(0, s - seg)
        out[s : s + seg] = filt[off : off + seg][: len(out[s : s + seg])]
    return out * (t / dur) ** 2


add(riser(1.0, 400, 6000), 3.0, 0.16)
add(riser(0.75, 500, 6000), 17.0, 0.12)

# Drop: logo pops.
add(bell(72, 1.6, 0.8), 4.0, 0.16, -0.1)
add(bell(76, 1.6, 0.8), 4.0, 0.12, 0.1)
add(spectral(rng.standard_normal(int(1.2 * SR)), 5000, 14000) * env(int(1.2 * SR), 0.002, 0.35), 4.0, 0.06)

# Phone slides in: soft whoosh ending on the beat.
def whoosh(dur=0.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = spectral(rng.standard_normal(n), 300, 3000)
    return s * np.sin(np.pi * t / dur) ** 2


add(whoosh(0.4), 6.6, 0.10, 0.4)
# Taps: short ticks in key (E6, A6).
for at, note in [(7.5, 88), (9.0, 88), (9.75, 93)]:
    add(pluck(note, 0.12), at, 0.12, 0.35)
add(whoosh(0.3), 7.85, 0.07, 0.3)  # sheet up
# Points tick up 50 -> 100.
for k, note in enumerate([76, 79, 81]):
    add(pluck(note + 12, 0.1), 9.0 + k * 0.0833, 0.07, 0.3)
# Pick locked in: E-A chord.
add(bell(76, 1.0, 0.5), 10.0, 0.10, 0.2)
add(bell(81, 1.0, 0.5), 10.0, 0.08, 0.2)
# Picks lock: low thud.
add(spectral(K, None, 250), 11.0, 0.5)
# Result: C major arpeggio up, bright.
for k, note in enumerate([72, 76, 79, 84]):
    add(bell(note, 1.6, 1.0), 12.0 + k * 0.125, 0.13, -0.2 + k * 0.13)
add(spectral(rng.standard_normal(int(1.5 * SR)), 6000, 15000) * env(int(1.5 * SR), 0.002, 0.5), 12.0, 0.07)
# Standings: swap whoosh, landing on the beat at 16.0... swap is 15.5-15.9.
add(whoosh(0.45), 15.3, 0.10, 0.2)
add(pluck(84, 0.3), 15.75, 0.12)
add(pluck(88, 0.3), 15.875, 0.10)
# Outro: final hit on C.
for note, g in [(60, 0.14), (67, 0.11), (72, 0.13), (76, 0.10)]:
    add(bell(note, 2.2, 0.7), 18.0, g)
add(K, 18.0, 1.0)
add(spectral(rng.standard_normal(int(2.0 * SR)), 4000, 14000) * env(int(2.0 * SR), 0.002, 0.7), 18.0, 0.08)

# --- master: gentle high-shelf trim, soft clip, fade tail, normalize to -1 dBFS
mix = np.stack([L, R])
mix = np.tanh(mix * 1.4) / 1.4
fade = np.ones(N)
fade[-int(0.4 * SR) :] = np.linspace(1, 0, int(0.4 * SR))
mix *= fade
fi = int(0.004 * SR)
mix[:, :fi] *= np.linspace(0, 1, fi)
mix /= np.max(np.abs(mix)) / 10 ** (-1 / 20)

pcm = (mix.T * 32767).astype("<i2")
with wave.open("soundtrack.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("ok", pcm.shape)
