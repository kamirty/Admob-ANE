#!/usr/bin/env python3
"""Generate the promo soundtrack: soft music bed + sound effects from events.json."""
import json, sys, wave
import numpy as np

SR = 44100
events_path, out_path = sys.argv[1], sys.argv[2]
DUR = 60.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
mix = np.zeros(N)

def add(sig, t, gain=1.0):
    i = int(t * SR)
    if i >= N: return
    sig = sig[:N - i]
    mix[i:i + len(sig)] += sig * gain

def env(n, a, r):
    e = np.ones(n); a = max(1, int(a * SR)); r = max(1, int(r * SR))
    e[:a] = np.linspace(0, 1, a); e[-r:] *= np.exp(-np.linspace(0, 6, r))
    return e

def tone(f0, f1, d, wave_='sine'):
    n = int(d * SR); f = np.geomspace(f0, f1, n) if f1 != f0 else np.full(n, f0)
    ph = 2 * np.pi * np.cumsum(f) / SR
    if wave_ == 'tri': return 2 / np.pi * np.arcsin(np.sin(ph))
    return np.sin(ph)

def bandnoise(d, lo, hi):
    n = int(d * SR); x = rng.standard_normal(n)
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(n, 1 / SR)
    X[(fr < lo) | (fr > hi)] = 0
    y = np.fft.irfft(X, n); return y / (np.abs(y).max() + 1e-9)

# ---------- music bed: Am F C G, 96 BPM ----------
beat = 60 / 96; bar = beat * 4
chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
t = 0.0; k = 0
while t < DUR:
    ch = chords[k % 4]; d = bar * 2
    for m in ch:  # pad
        n = int(d * SR); s = (tone(hz(m), hz(m), d) + .35 * tone(hz(m) * 2, hz(m) * 2, d)) * env(n, .6, .9)
        add(s, t, .045)
    add(tone(hz(ch[0] - 12), hz(ch[0] - 12), d) * env(int(d * SR), .3, .8), t, .07)  # bass
    for j in range(16):  # pluck arpeggio, 8th notes
        m = ch[[0, 1, 2, 1][j % 4]] + 12 + (12 if j % 8 == 6 else 0)
        n = int(.45 * SR); s = tone(hz(m), hz(m), .45, 'tri') * np.exp(-np.linspace(0, 9, n))
        add(s, t + j * beat / 2, .05)
    for j in range(8):  # soft kick on 1 and 3
        if j % 2 == 0:
            n = int(.25 * SR); add(tone(110, 45, .25) * np.exp(-np.linspace(0, 8, n)), t + j * beat, .16)
    t += d; k += 1
fade = np.ones(N); fi = int(1.2 * SR); fo = int(2.5 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo)
mix *= fade

# ---------- sound effects ----------
def pen(d):
    out = np.zeros(int((d + .2) * SR)); tt = 0.0
    while tt < d:
        if rng.random() > .14:
            g = rng.uniform(.03, .07); c = rng.uniform(2800, 4400)
            s = bandnoise(g, c * .7, c * 1.3) * env(int(g * SR), .006, g * .6) * rng.uniform(.5, 1)
            i = int(tt * SR); out[i:i + len(s)] += s[:len(out) - i]
        tt += rng.uniform(.04, .075)
    return out
def whoosh():
    d = .7; n = int(d * SR); x = rng.standard_normal(n); y = np.zeros(n); a = 0.0
    for i in range(n):
        c = .02 + .5 * np.sin(np.pi * i / n) ** 2; a += c * (x[i] - a); y[i] = a
    return y / (np.abs(y).max() + 1e-9) * env(n, .3, .35)
def pop(): n = int(.14 * SR); return tone(380, 1100, .14) * np.exp(-np.linspace(0, 7, n))
def ding(): n = int(1.2 * SR); return (tone(1320, 1320, 1.2) + .3 * tone(2640, 2640, 1.2)) * np.exp(-np.linspace(0, 6, n))
def tick(d):
    out = np.zeros(int((d + .1) * SR)); tt = 0.0
    while tt < d:
        s = bandnoise(.012, 2500, 6000) * env(int(.012 * SR), .001, .008); i = int(tt * SR); out[i:i + len(s)] += s; tt += .085
    return out
def success():
    out = np.zeros(int(1.0 * SR))
    for j, f in enumerate([523, 659, 784, 1046]):
        n = int(.4 * SR); s = tone(f, f, .4, 'tri') * np.exp(-np.linspace(0, 5, n)); i = int(j * .09 * SR); out[i:i + n] += s
    return out

G = {'pen': .07, 'whoosh': .22, 'pop': .28, 'ding': .16, 'tick': .1, 'success': .3}
for e in json.load(open(events_path)):
    ty, t0, d = e['type'], e['t'], e.get('d', 0)
    sig = {'pen': lambda: pen(d), 'whoosh': whoosh, 'pop': pop, 'ding': ding, 'tick': lambda: tick(d), 'success': success}[ty]()
    add(sig, max(0, t0), G[ty])

mix /= max(1e-9, np.abs(mix).max()) / 0.85
pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
st = np.repeat(pcm[:, None], 2, axis=1)
w = wave.open(out_path, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes()); w.close()
print('wrote', out_path)
