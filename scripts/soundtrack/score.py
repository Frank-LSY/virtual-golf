"""Score model: the SwingLink main theme (scale degrees + harmony) and helpers that turn
it into instrument parts in any key, mode, meter and feel."""
import zlib
import numpy as np

MODES = {'major': [0, 2, 4, 5, 7, 9, 11], 'lydian': [0, 2, 4, 6, 7, 9, 11], 'mixolydian': [0, 2, 4, 5, 7, 9, 10],
         'dorian': [0, 2, 3, 5, 7, 9, 10], 'minor': [0, 2, 3, 5, 7, 8, 10]}
NAMES = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}

# ---------- 主题：16 小节，F 大调记谱时 0 = F。每个音 (音级, 八分音符时值)；None 为休止 ----------
A1 = [(4, 1), (7, 1), (9, 2), (8, 1), (7, 1), (8, 2)]
A2 = [(9, 3), (7, 1), (4, 4)]
A3 = [(5, 1), (6, 1), (7, 2), (8, 1), (9, 1), (10, 2)]
A4 = [(9, 2), (8, 2), (4, 4)]
A6 = [(9, 3), (11, 1), (12, 4)]
A7 = [(10, 1), (9, 1), (8, 2), (9, 1), (8, 1), (6, 2)]
A8 = [(7, 6), (None, 2)]
B1 = [(12, 2), (11, 1), (10, 1), (9, 2), (8, 2)]
B2 = [(9, 2), (8, 1), (7, 1), (6, 2), (5, 2)]
B3 = [(10, 2), (9, 1), (8, 1), (7, 2), (6, 2)]
B4 = [(7, 2), (8, 2), (9, 2), (11, 2)]
THEME = {'A': [A1, A2, A3, A4], "A'": [A1, A6, A7, A8], 'B': [B1, B2, B3, B4], "A''": [A1, A6, A7, A8]}
# 和声：每小节 [(拍内起点(八分), 根音音级, 和弦类型)]；类型 '' 三和弦，'7' 七和弦
H = {'A': [[(0, 0, '')], [(0, 5, '7')], [(0, 3, '')], [(0, 4, '')]],
     "A'": [[(0, 0, '')], [(0, 5, '')], [(0, 1, '7'), (4, 4, '7')], [(0, 0, '')]],
     'B': [[(0, 3, '')], [(0, 2, '')], [(0, 1, '7'), (4, 4, '')], [(0, 0, ''), (4, 4, '7')]],
     "A''": [[(0, 0, '')], [(0, 5, '')], [(0, 1, '7'), (4, 4, '7')], [(0, 0, '')]]}
# 动机（主题头）——用于前奏、过门和短曲
MOTIF = [(4, 1), (7, 1), (9, 2), (8, 1), (7, 1), (8, 2)]


class Key:
    def __init__(self, tonic='F', octave=4, mode='major'):
        self.base = 12 * (octave + 1) + NAMES[tonic]; self.mode = mode
    def __call__(self, d, acc=0):
        o, i = divmod(int(d), 7); return self.base + 12 * o + MODES[self.mode][i] + acc
    def chord(self, root, kind=''):
        ds = [root, root + 2, root + 4] + ([root + 6] if kind == '7' else [])
        return ds


class Score:
    """Parts are lists of (start_beat, dur_beats, midi, velocity). One beat = one quarter note
    (in 3/4 and 12/8-feel pieces as well)."""
    def __init__(self, bpm, beats_per_bar=4, swing=0.0, seed=1):
        self.bpm = bpm; self.bpb = beats_per_bar; self.swing = swing; self.parts = {}; self.cc = {}
        self.rng = np.random.default_rng(seed); self.seed_value = seed
    def add(self, part, start, dur, midi, vel=80):
        if midi is None: return
        self.parts.setdefault(part, []).append((start, dur, int(midi), int(vel)))
    def ccramp(self, part, start, dur, a, b, ctl=11, steps=12):
        for k in range(steps + 1):
            self.cc.setdefault(part, []).append((start + dur * k / steps, ctl, a + (b - a) * k / steps))
    def warp(self, beat):
        """swing: off-beat eighths are delayed toward the triplet position"""
        if not self.swing: return beat
        b0 = np.floor(beat); f = beat - b0; s = 0.5 + self.swing / 2
        f = f / 0.5 * s if f <= 0.5 else s + (f - 0.5) / 0.5 * (1 - s)
        return b0 + f
    def seconds(self, beat): return self.warp(beat) * 60 / self.bpm
    def events(self, part, offset_beats=0, humanize=0.006, legato=0.96):
        """Humanisation is fixed per note (seeded by part name), so every loop pass is identical
        and the loop seam is sample-continuous."""
        out = []; notes = self.parts.get(part, [])
        r = np.random.default_rng(zlib.crc32(part.encode()) + self.seed_value)
        jit = r.normal(0, humanize, len(notes)); dv = r.normal(0, 4, len(notes))
        for idx, (start, dur, midi, vel) in enumerate(notes):
            s = start + offset_beats; t0 = self.seconds(s); t1 = self.seconds(s + dur * legato)
            j = jit[idx]; v = vel + dv[idx]
            out.append((max(0, t0 + j), 'on', midi, v)); out.append((max(0, t1 + j), 'off', midi, 0))
        for beat, ctl, val in self.cc.get(part, []):
            out.append((max(0, self.seconds(beat + offset_beats)), 'cc', ctl, val))
        return out


# ---------- 旋律工具 ----------
def line_events(bars, key, start_beat, octave=0, vel=88, accent=8, stacc=False, beats_per_bar=4, scale=1.0):
    """bars: list of bars, each [(degree|None, eighths)]. Returns [(beat, dur, midi, vel)]"""
    out = []; b = start_beat
    for bar in bars:
        t = b
        for d, e in bar:
            dur = e / 2 * scale
            if d is not None:
                v = vel + (accent if abs((t - b) % 1) < 1e-6 else 0)
                out.append((t, dur * (0.55 if stacc else 1.0), key(d + 7 * octave), v))
            t += dur
        b += beats_per_bar
    return out

def place(score, part, notes, vel_scale=1.0, transpose=0):
    for s, d, m, v in notes: score.add(part, s, d, m + transpose, v * vel_scale)

def harmony_timeline(sections, start_beat=0, beats_per_bar=4, eighth_scale=1.0):
    """[(beat, dur, root_degree, kind)] for a list of section names"""
    out = []; b = start_beat
    for name in sections:
        for bar in H[name]:
            for i, (e, root, kind) in enumerate(bar):
                end = bar[i + 1][0] if i + 1 < len(bar) else 8
                out.append((b + e / 2 * eighth_scale, (end - e) / 2 * eighth_scale, root, kind))
            b += beats_per_bar
    return out

def voicing(key, root, kind, low, high, prev=None):
    """close voicing of the chord between low..high midi, nearest to the previous voicing"""
    ds = key.chord(root, kind); pcs = sorted({key(d) % 12 for d in ds})
    cands = []
    for base in range(low, high - 4):
        notes = [];
        for pc in pcs:
            n = base + ((pc - base) % 12)
            notes.append(n)
        notes = sorted(notes)
        if notes[-1] <= high: cands.append(notes)
    if not cands: return [key(d) for d in ds]
    if prev is None: return cands[len(cands) // 2]
    return min(cands, key=lambda c: sum(abs(a - b) for a, b in zip(c, prev)))

def bass_note(key, root, low=36, high=52):
    n = key(root) % 12; m = low + ((n - low) % 12)
    return m if m <= high else m - 12
