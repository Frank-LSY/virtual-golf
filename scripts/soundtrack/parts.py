"""Reusable accompaniment patterns."""
from score import Key, Score, line_events, place, harmony_timeline, voicing, bass_note, THEME, MOTIF

def melody(s, part, sections, key, start, octave=0, vel=88, stacc=False, bpb=4):
    bars = [b for name in sections for b in THEME[name]]
    place(s, part, line_events(bars, key, start, octave, vel, stacc=stacc, beats_per_bar=bpb))

def pad(s, part, harm, key, low=53, high=72, vel=62, swell=True):
    prev = None
    for b, d, root, kind in harm:
        v = voicing(key, root, kind, low, high, prev); prev = v
        for n in v: s.add(part, b, d, n, vel)
    if swell and harm:
        start = harm[0][0]; end = harm[-1][0] + harm[-1][1]
        bar = 4
        t = start
        while t < end:
            s.ccramp(part, t, bar * 2, 70, 112, steps=8); s.ccramp(part, t + bar * 2, bar * 2, 112, 80, steps=8); t += bar * 4

def guide_tones(s, part, harm, key, low=55, high=70, vel=66):
    """3rd (and 7th) of each chord as long notes — a simple, smooth countermelody"""
    prev = None
    for b, d, root, kind in harm:
        third = key(root + 2); n = low + ((third - low) % 12)
        if prev is not None and abs(n - 12 - prev) < abs(n - prev) and n - 12 >= low - 3: n -= 12
        prev = n; s.add(part, b, d, n, vel)

def oompah(s, bass_part, chord_part, harm, key, bass_lo=36, chord_lo=55, chord_hi=67, vel=74, beats=(0, 1, 2, 3)):
    """bass on 1 & 3 (root / fifth), short chords on 2 & 4"""
    prev = None
    for b, d, root, kind in harm:
        v = voicing(key, root, kind, chord_lo, chord_hi, prev); prev = v
        k = 0.0
        while k < d - 1e-6:
            beat = (b + k)
            pos = round((beat) % 4, 3)
            if pos in (0.0, 2.0):
                n = bass_note(key, root, bass_lo, bass_lo + 14) + (7 if pos == 2.0 and d > 2 else 0)
                if n > bass_lo + 16: n -= 12
                s.add(bass_part, beat, 0.9, n, vel + 6)
            else:
                for m in v: s.add(chord_part, beat, 0.45, m, vel - 6)
            k += 1

def waltz_acc(s, bass_part, chord_part, harm, key, bass_lo=38, chord_lo=57, chord_hi=69, vel=70):
    prev = None
    for b, d, root, kind in harm:
        v = voicing(key, root, kind, chord_lo, chord_hi, prev); prev = v
        k = 0.0
        while k < d - 1e-6:
            beat = b + k; pos = round(beat % 3, 3)
            if pos == 0.0:
                n = bass_note(key, root, bass_lo, bass_lo + 14); s.add(bass_part, beat, 1.6, n, vel + 8)
            else:
                for m in v: s.add(chord_part, beat, 0.5, m, vel - (4 if pos == 1.0 else 10))
            k += 1

def arpeggio(s, part, harm, key, low=55, sub=0.5, pattern=(0, 1, 2, 3, 2, 1), vel=64, span=2, offset=0):
    for b, d, root, kind in harm:
        ds = key.chord(root, kind); notes = []
        for o in range(span):
            for x in ds[:3]: notes.append(key(x) % 12)
        base = []; m = low
        for pc in notes:
            n = m + ((pc - m) % 12); base.append(n); m = n + 1
        k = 0; t = 0.0
        while t < d - 1e-6:
            idx = pattern[(k + offset) % len(pattern)] % len(base)
            s.add(part, b + t, sub * 1.6, base[idx], vel + (8 if abs(t % 1) < 1e-6 else 0))
            t += sub; k += 1

def ostinato16(s, part, harm, key, low=50, vel=70, cells=(0, 2, 4, 2)):
    """16th-note clockwork figure: root, fifth, octave, fifth (degrees relative to the chord)"""
    for b, d, root, kind in harm:
        t = 0.0; k = 0
        r = bass_note(key, root, low, low + 12)
        while t < d - 1e-6:
            step = cells[k % len(cells)]
            n = key(root + step) - key(root) + r
            s.add(part, b + t, 0.2, n, vel + (10 if abs(t % 1) < 1e-6 else 0))
            t += 0.25; k += 1

def walking(s, part, harm, key, low=36, vel=78):
    for b, d, root, kind in harm:
        r = bass_note(key, root, low, low + 12)
        steps = [0, 2, 4, 5][:int(round(d))] if d >= 2 else [0]
        for i, st in enumerate(steps):
            n = key(root + st) - key(root) + r
            s.add(part, b + i, 0.9, n, vel + (6 if i == 0 else 0))

def roots(s, part, harm, key, low=36, vel=80, dur=None):
    for b, d, root, kind in harm:
        s.add(part, b, dur or d, bass_note(key, root, low, low + 12), vel)

def gliss(s, part, key, start, beats, lo_deg, hi_deg, vel=60):
    n = hi_deg - lo_deg; 
    for i in range(n + 1):
        s.add(part, start + beats * i / (n + 1), 0.6, key(lo_deg + i), vel + i)

def roll(s, part, midi, start, beats, v0=40, v1=95, rate=8):
    k = int(beats * rate)
    for i in range(k):
        s.add(part, start + i / rate, 1 / rate, midi, v0 + (v1 - v0) * i / max(1, k - 1))

# ---------- 打击乐（GM 鼓组）----------
BD, SN, SS, HH, OH, CR, RD, TAMB, SHK, CLV, WBH, WBL, TRI, TRIM, CR2, TOM_L, TOM_M = 35, 38, 37, 42, 46, 49, 51, 54, 70, 75, 76, 77, 81, 80, 57, 45, 47

def hits(s, part, start, bars, pattern, bpb=4, vel=70):
    """pattern: {midi: [(beat_in_bar, vel_offset), ...]} repeated each bar"""
    for bar in range(bars):
        for midi, pts in pattern.items():
            for beat, dv in pts:
                s.add(part, start + bar * bpb + beat, 0.25, midi, vel + dv)
