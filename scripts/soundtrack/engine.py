"""Offline orchestral renderer for the SwingLink soundtrack.
Notes are rendered per instrument with FluidSynth (libfluidsynth via ctypes, General MIDI soundfont),
then panned, equalised, mixed, sent through a synthetic hall reverb and mastered with numpy/scipy.
"""
import ctypes, ctypes.util, os, wave, numpy as np
from scipy import signal

SR = 44100
SF2 = os.environ.get('SWINGLINK_SF2', '/usr/share/sounds/sf2/TimGM6mb.sf2')
_lib = None
def lib():
    global _lib
    if _lib: return _lib
    name = ctypes.util.find_library('fluidsynth') or 'libfluidsynth.so.3'
    L = ctypes.CDLL(name)
    vp, ci, cd, cs = ctypes.c_void_p, ctypes.c_int, ctypes.c_double, ctypes.c_char_p
    L.new_fluid_settings.restype = vp
    L.new_fluid_synth.restype = vp; L.new_fluid_synth.argtypes = [vp]
    L.fluid_settings_setnum.argtypes = [vp, cs, cd]; L.fluid_settings_setint.argtypes = [vp, cs, ci]
    L.fluid_synth_sfload.argtypes = [vp, cs, ci]
    L.fluid_synth_program_select.argtypes = [vp, ci, ci, ci, ci]
    L.fluid_synth_noteon.argtypes = [vp, ci, ci, ci]; L.fluid_synth_noteoff.argtypes = [vp, ci, ci]
    L.fluid_synth_cc.argtypes = [vp, ci, ci, ci]; L.fluid_synth_pitch_bend.argtypes = [vp, ci, ci]
    L.fluid_synth_write_float.argtypes = [vp, ci, vp, ci, ci, vp, ci, ci]
    L.delete_fluid_synth.argtypes = [vp]; L.delete_fluid_settings.argtypes = [vp]
    _lib = L
    return L

def render_part(events, seconds, program, bank=0):
    """events: [(time_s, kind, a, b)] kind in on/off/cc. Returns float32 stereo array."""
    L = lib(); s = L.new_fluid_settings()
    L.fluid_settings_setnum(s, b'synth.sample-rate', SR)
    L.fluid_settings_setint(s, b'synth.reverb.active', 0); L.fluid_settings_setint(s, b'synth.chorus.active', 0)
    L.fluid_settings_setnum(s, b'synth.gain', 0.4); L.fluid_settings_setint(s, b'synth.polyphony', 512)
    sy = L.new_fluid_synth(s); sf = L.fluid_synth_sfload(sy, SF2.encode(), 1)
    ch = 9 if bank == 128 else 0
    L.fluid_synth_program_select(sy, ch, sf, bank, program)
    n = int(seconds * SR); out = np.zeros((n, 2), np.float32)
    order = {'off': 0, 'cc': 1, 'on': 2}
    ev = sorted(events, key=lambda e: (e[0], order[e[1]]))
    pos = 0; i = 0
    while pos < n:
        while i < len(ev) and int(round(ev[i][0] * SR)) <= pos:
            t, k, a, b = ev[i]
            if k == 'on': L.fluid_synth_noteon(sy, ch, int(a), int(max(1, min(127, b))))
            elif k == 'off': L.fluid_synth_noteoff(sy, ch, int(a))
            else: L.fluid_synth_cc(sy, ch, int(a), int(max(0, min(127, b))))
            i += 1
        nxt = int(round(ev[i][0] * SR)) if i < len(ev) else n
        cnt = max(1, min(n - pos, nxt - pos, 8192))
        l = np.zeros(cnt, np.float32); r = np.zeros(cnt, np.float32)
        L.fluid_synth_write_float(sy, cnt, l.ctypes.data, 0, 1, r.ctypes.data, 0, 1)
        out[pos:pos + cnt, 0] = l; out[pos:pos + cnt, 1] = r; pos += cnt
    L.delete_fluid_synth(sy); L.delete_fluid_settings(s)
    return out

# ---------- DSP helpers ----------
def pan(x, p):
    """constant-power pan of a stereo part, p in [-1,1]"""
    m = x.mean(axis=1)
    a = (p + 1) * np.pi / 4
    w = 0.35  # keep a little of the original stereo image
    return np.stack([m * np.cos(a) * (1 - w) + x[:, 0] * w, m * np.sin(a) * (1 - w) + x[:, 1] * w], axis=1) * 1.25

def biquad(kind, f, q=0.707, gain_db=0.0):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f / SR; c = np.cos(w); s = np.sin(w); al = s / (2 * q)
    if kind == 'lp': b = [(1 - c) / 2, 1 - c, (1 - c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'hp': b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'peak': b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind == 'lowshelf':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
        a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
    elif kind == 'highshelf':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
        a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    return np.array(b) / a[0], np.array(a) / a[0]

def eq(x, *bands):
    for band in bands:
        b, a = biquad(*band); x = signal.lfilter(b, a, x, axis=0)
    return x.astype(np.float32)

def hall_ir(seconds=2.4, predelay=0.022, seed=3, bright=6500):
    rng = np.random.default_rng(seed); n = int(seconds * SR); t = np.arange(n) / SR
    env = np.exp(-6.9 * t / seconds)
    ir = rng.standard_normal((n, 2)) * env[:, None]
    # darker tail: progressively low-passed
    ir = eq(ir, ('lp', bright, 0.5), ('hp', 140, 0.6))
    late = np.minimum(1, t / 0.08) ** 1.5
    ir *= late[:, None]
    er = np.zeros((n, 2))
    for k, (d, g) in enumerate([(0.011, .5), (0.017, .4), (0.023, .35), (0.031, .3), (0.041, .25), (0.053, .2)]):
        er[int(d * SR), k % 2] += g; er[int((d + .004) * SR), (k + 1) % 2] += g * .8
    ir = ir * 0.9 + er * 0.6
    pad = np.zeros((int(predelay * SR), 2))
    ir = np.concatenate([pad, ir]); ir /= np.sqrt((ir ** 2).sum() / 2)
    return ir.astype(np.float32)

def reverb(x, ir):
    out = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], axis=1)
    return out.astype(np.float32)

def compress(x, threshold_db=-18, ratio=2.2, attack=0.015, release=0.25, makeup_db=0):
    lvl = np.sqrt(np.mean(x ** 2, axis=1) + 1e-12)
    # smooth envelope (one-pole attack/release, vectorised via lfilter on decimated signal)
    hop = 64; e = lvl[: len(lvl) // hop * hop].reshape(-1, hop).max(axis=1)
    env = np.zeros_like(e); a_a = np.exp(-hop / (attack * SR)); a_r = np.exp(-hop / (release * SR)); v = 0
    for i, s in enumerate(e):
        v = a_a * v + (1 - a_a) * s if s > v else a_r * v + (1 - a_r) * s
        env[i] = v
    db = 20 * np.log10(env + 1e-9); over = np.maximum(0, db - threshold_db)
    gain_db = -over * (1 - 1 / ratio) + makeup_db
    g = np.repeat(10 ** (gain_db / 20), hop)
    g = np.concatenate([g, np.full(len(x) - len(g), g[-1] if len(g) else 1)])
    return (x * g[:, None]).astype(np.float32)

def limit(x, ceiling=0.93):
    # soft knee limiter: tanh above 0.7 of ceiling
    k = 0.7 * ceiling; y = x.copy(); m = np.abs(y) > k
    y[m] = np.sign(y[m]) * (k + (ceiling - k) * np.tanh((np.abs(y[m]) - k) / (ceiling - k)))
    return y

def write_wav(path, x):
    x = np.clip(x, -1, 1); d = (x * 32767).astype('<i2')
    w = wave.open(path, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(d.tobytes()); w.close()
