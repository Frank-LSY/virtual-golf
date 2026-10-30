"""Ten cues, one theme. Every loop states the SwingLink theme; instrumentation, key, meter and feel
change per scene (in the spirit of a game whose menu/battle music are variations of one tune)."""
from score import Key, Score, THEME, MOTIF, H, line_events, place, harmony_timeline, voicing, bass_note
from parts import *

# 乐器：GM 音色号、声像、角色（决定自动配平的目标电平与混响量）
I = {
 'strings': (48, 0, 'pad'), 'strings_lead': (48, 0.05, 'lead'), 'slowstr': (49, 0, 'pad'), 'violin': (40, -0.3, 'lead'),
 'cello': (42, 0.35, 'counter'), 'cellos': (42, 0.35, 'bass'), 'contrabass': (43, 0.45, 'bass'), 'trem': (44, 0, 'pad'),
 'pizz': (45, -0.15, 'chords'), 'pizzbass': (45, 0.35, 'bass'), 'harp': (46, -0.55, 'arp'), 'timp': (47, 0.1, 'timp'),
 'celesta': (8, -0.4, 'lead'), 'celesta_s': (8, -0.4, 'sparkle'), 'glock': (9, 0.3, 'sparkle'), 'musicbox': (10, 0.25, 'lead2'),
 'vibes': (11, 0.2, 'chords'), 'marimba': (12, -0.25, 'lead'), 'marimba_o': (12, -0.25, 'arp'), 'xylo': (13, 0.3, 'lead2'),
 'nylon': (24, -0.35, 'arp'), 'flute': (73, -0.2, 'lead'), 'flute2': (73, -0.25, 'counter'), 'piccolo': (72, -0.15, 'lead2'),
 'oboe': (68, 0.1, 'lead'), 'oboe2': (68, 0.12, 'counter'), 'clarinet': (71, -0.1, 'lead'), 'clarinet2': (71, -0.12, 'counter'),
 'bassoon': (70, 0.2, 'lead2'), 'bassoon_b': (70, 0.2, 'bass'), 'horn': (60, -0.35, 'lead'), 'horns': (60, -0.35, 'counter'),
 'trumpet': (56, 0.25, 'lead'), 'trumpet2': (56, 0.3, 'lead2'), 'trombone': (57, 0.4, 'bass'), 'tuba': (58, 0.45, 'bass'),
 'brass': (61, 0.15, 'chords'), 'choir': (52, 0, 'pad'), 'drums': (0, 0, 'drums'), 'perc': (0, 0, 'perc'), 'cymbal': (0, 0, 'cymbal'),
}

def shift(bars, deg):
    """diatonic transposition of a melody (e.g. -2 = a third below)"""
    return [[(d + deg if d is not None else None, e) for d, e in bar] for bar in bars]

def lay(plan, bpb=4):
    t = 0; out = {}
    for name, bars in plan:
        out.setdefault(name, []).append(t); t += bars * bpb
    return out, t

# ---------- 1 大厅：《云上序曲》主题完整版 ----------
def hub():
    k = Key('F', 4); s = Score(116, seed=11)
    at, total = lay([('intro', 4), ('A', 4), ("A'", 4), ('B', 4), ("A''", 4), ('tag', 4)])
    i0 = at['intro'][0]
    # 前奏：圆号吹主题头，竖琴刮奏，弦乐铺底，定音鼓滚奏引入
    intro_h = [(i0, 4, 0, ''), (i0 + 4, 4, 3, ''), (i0 + 8, 4, 1, '7'), (i0 + 12, 4, 4, '7')]
    pad(s, 'slowstr', intro_h, k, 53, 72, 58)
    place(s, 'horns', line_events([MOTIF, [(9, 8)]], k, i0, -1, 74))
    place(s, 'flute', line_events([MOTIF], k, i0 + 8, 0, 70)); place(s, 'glock', line_events([MOTIF], k, i0 + 8, 1, 60))
    gliss(s, 'harp', k, i0 + 3, 1, -3, 11, 56); gliss(s, 'harp', k, i0 + 15, 1, 0, 14, 58)
    roll(s, 'timp', bass_note(k, 4, 41, 53), i0 + 14, 2, 30, 90)
    roots(s, 'contrabass', intro_h, k, 29, 60)
    # A：长笛 + 单簧管领奏，拨弦 oom-pah，竖琴分解和弦
    a = at['A'][0]; hA = harmony_timeline(['A'], a)
    melody(s, 'flute', ['A'], k, a, 0, 86); melody(s, 'clarinet2', ['A'], k, a, -1, 70)
    oompah(s, 'pizzbass', 'pizz', hA, k, 36, 57, 69, 72); arpeggio(s, 'harp', hA, k, 53, 0.5, (0, 2, 4, 3, 5, 4, 2, 1), 58)
    hits(s, 'perc', a, 4, {TRI: [(0, 0)], TAMB: [(1, -12), (3, -12)]}, vel=56)
    # A'：弦乐接过旋律，钟琴点缀，圆号长音对位
    a2 = at["A'"][0]; hA2 = harmony_timeline(["A'"], a2)
    melody(s, 'strings_lead', ["A'"], k, a2, 0, 84); melody(s, 'glock', ["A'"], k, a2, 1, 54)
    guide_tones(s, 'horns', hA2, k, 53, 65, 64); oompah(s, 'pizzbass', 'pizz', hA2, k, 36, 57, 69, 70)
    roots(s, 'contrabass', hA2, k, 29, 66, 1.8)
    hits(s, 'perc', a2, 4, {TRI: [(0, 0)], TAMB: [(1, -10), (3, -10)]}, vel=58)
    # B：弦乐歌唱，单簧管三度对位，合唱轻铺
    b = at['B'][0]; hB = harmony_timeline(['B'], b)
    melody(s, 'strings_lead', ['B'], k, b, 0, 88); place(s, 'clarinet2', line_events(shift(THEME['B'], -2), k, b, 0, 70))
    pad(s, 'choir', hB, k, 55, 70, 50); arpeggio(s, 'harp', hB, k, 50, 0.5, (0, 1, 2, 3, 4, 5, 4, 3), 60)
    walking(s, 'pizzbass', hB, k, 36, 74)
    roll(s, 'timp', bass_note(k, 4, 41, 53), b + 14, 2, 30, 96); s.add('cymbal', b + 15.5, 2, 49, 50)
    # A''：全奏——圆号与小号领奏，弦乐八度加厚，进行曲小鼓，定音鼓
    c = at["A''"][0]; hC = harmony_timeline(["A''"], c)
    melody(s, 'horn', ["A''"], k, c, -1, 92); melody(s, 'trumpet2', ["A''"], k, c, 0, 70); melody(s, 'strings_lead', ["A''"], k, c, 0, 90)
    melody(s, 'glock', ["A''"], k, c, 1, 58); pad(s, 'strings', hC, k, 50, 67, 66)
    roots(s, 'tuba', hC, k, 29, 72, 0.9); oompah(s, 'pizzbass', 'pizz', hC, k, 36, 57, 69, 72)
    s.add('cymbal', c, 3, 49, 80)
    hits(s, 'drums', c, 4, {BD: [(0, 8), (2, 0)], SN: [(1, -4), (3, -4), (3.5, -16), (1.75, -20)]}, vel=66)
    for t, d, root, kind in hC:
        if t % 4 == 0: s.add('timp', t, 1, bass_note(k, root, 41, 53), 88)
    # 尾声：动机轻声回响，回到前奏
    g = at['tag'][0]; hT = [(g, 4, 0, ''), (g + 4, 4, 5, ''), (g + 8, 4, 3, ''), (g + 12, 4, 4, '7')]
    place(s, 'celesta', line_events([MOTIF, [(7, 8)], MOTIF, [(8, 8)]], k, g, 0, 66))
    pad(s, 'slowstr', hT, k, 53, 70, 54); oompah(s, 'pizzbass', 'pizz', hT, k, 36, 57, 69, 62)
    place(s, 'flute2', line_events([[(9, 8)], [(9, 8)], [(10, 8)], [(11, 8)]], k, g, 0, 58))
    return dict(score=s, beats=total, title='云上序曲', detail='主题 · 管弦全编制', key='F 大调', bpm=116)

# ---------- 2 高尔夫大厅：《草坪漫步》摇摆田园变奏 ----------
def golf_lobby():
    k = Key('G', 4); s = Score(92, swing=0.33, seed=21)
    at, total = lay([('intro', 2), ('A', 4), ("A'", 4), ('B', 4), ("A''", 4), ('tag', 2)])
    full = harmony_timeline(['A', "A'", 'B', "A''"], at['A'][0])
    i0 = at['intro'][0]; hI = [(i0, 4, 0, ''), (i0 + 4, 4, 4, '7')]
    hT = [(at['tag'][0], 4, 3, ''), (at['tag'][0] + 4, 4, 4, '7')]
    allh = hI + full + hT
    arpeggio(s, 'nylon', allh, k, 47, 0.5, (0, 2, 4, 2, 3, 2, 4, 2), 66)
    for t, d, root, kind in allh:
        s.add('pizzbass', t, 0.9, bass_note(k, root, 36, 50), 74)
        if d >= 4: s.add('pizzbass', t + 2, 0.9, bass_note(k, root, 36, 50) + 7 - (12 if bass_note(k, root, 36, 50) + 7 > 52 else 0), 66)
    hits(s, 'perc', 0, total // 4, {SHK: [(x / 2, -14 + (6 if x % 2 else 0)) for x in range(8)]}, vel=48)
    melody(s, 'flute', ['A'], k, at['A'][0], 0, 84)
    melody(s, 'clarinet', ["A'"], k, at["A'"][0], 0, 84); guide_tones(s, 'flute2', harmony_timeline(["A'"], at["A'"][0]), k, 64, 76, 56)
    b = at['B'][0]; hB = harmony_timeline(['B'], b)
    melody(s, 'oboe', ['B'], k, b, 0, 84); pad(s, 'slowstr', hB, k, 52, 67, 56); arpeggio(s, 'harp', hB, k, 59, 0.5, (0, 1, 2, 3, 4, 3, 2, 1), 54)
    c = at["A''"][0]; hC = harmony_timeline(["A''"], c)
    melody(s, 'flute', ["A''"], k, c, 0, 86); melody(s, 'strings_lead', ["A''"], k, c, -1, 72); pad(s, 'slowstr', hC, k, 52, 67, 52)
    for name in ("A'", "A''"):
        t = at[name][0] + 13; place(s, 'glock', line_events([[(7, 2), (9, 2), (11, 4)]], k, t, 1, 56))
    for bar in range(0, total // 4, 2): s.add('perc', bar * 4, 1, TRI, 44)
    return dict(score=s, beats=total, title='草坪漫步', detail='主题 · 摇摆田园变奏', key='G 大调', bpm=92)

# ---------- 3 练习室：《练习场节拍》极简律动变奏 ----------
def golf_practice():
    k = Key('C', 4); s = Score(100, seed=31)
    at, total = lay([('groove', 4), ('A', 4), ("A'", 4), ('B', 4), ("A''", 4)])
    g0 = at['groove'][0]; hG = [(g0, 4, 0, ''), (g0 + 4, 4, 5, '7'), (g0 + 8, 4, 3, ''), (g0 + 12, 4, 4, '')]
    allh = hG + harmony_timeline(['A', "A'", 'B', "A''"], at['A'][0])
    for t, d, root, kind in allh:
        r = bass_note(k, root, 36, 48); seq = [0, 7, 12, 7]
        for i in range(int(d * 2)): s.add('pizzbass', t + i / 2, 0.3, r + seq[i % 4], 70 + (8 if i % 2 == 0 else 0))
    pad(s, 'vibes', [(t, d, r, kd) for t, d, r, kd in allh], k, 57, 71, 44, swell=False)
    pad(s, 'slowstr', allh, k, 48, 64, 40)
    hits(s, 'perc', 0, total // 4, {WBH: [(1, 0), (3, 0)], SHK: [(x / 4, -18 + (6 if x % 2 == 0 else 0)) for x in range(16)], WBL: [(2.5, -10)]}, vel=52)
    # 只用主题的片段：每个乐句开头的动机，留出大量空白
    for name in ('A', "A'", 'B', "A''"):
        t = at[name][0]; bars = THEME[name]
        place(s, 'marimba', line_events([bars[0], [(None, 8)], bars[2] if name == 'B' else [(None, 8)], [(None, 8)]], k, t, 0, 80))
        place(s, 'celesta_s', line_events([[(None, 8)], [(None, 8)], [(None, 8)], bars[3]], k, t, 1, 50))
    return dict(roles={'pizzbass': 'chords'}, score=s, beats=total, title='练习场节拍', detail='主题 · 极简律动变奏', key='C 大调', bpm=100)

# ---------- 4 正式球局：《果岭圆舞曲》3/4 圆舞曲变奏 ----------
WALTZ = {0: [1, 1, 1, 1.5, .5, 1], 1: [2, 1, 3], 2: [1, 1, 1, 1, 1, 1], 3: [2, 1, 3]}
WALTZ_B = {0: [2, 1, 1, 1, 1], 1: [2, 1, 1, 1, 1], 2: [2, 1, 1, 1, 1], 3: [2, 1, 2, 1]}
WALTZ_A2 = {0: [1, 1, 1, 1.5, .5, 1], 1: [2, 1, 3], 2: [1, 1, 1, 1.5, .5, 1], 3: [5, 1]}
def waltz_line(name, key, start, octave=0, vel=84):
    rh = WALTZ_B if name == 'B' else WALTZ if name == 'A' else WALTZ_A2
    out = []; t = start
    for i, bar in enumerate(THEME[name]):
        u = t
        for (d, e), dur in zip(bar, rh[i]):
            if d is not None: out.append((u, dur * 0.95, key(d + 7 * octave), vel + (8 if abs(u % 3) < 1e-6 else 0)))
            u += dur
        t += 6
    return out
def waltz_harm(name, start):
    out = []; t = start
    for bar in H[name]:
        for j, (e, root, kind) in enumerate(bar):
            end = bar[j + 1][0] if j + 1 < len(bar) else 8
            out.append((t + e / 8 * 6, (end - e) / 8 * 6, root, kind))
        t += 6
    return out
def golf_round():
    k = Key('D', 4); s = Score(144, beats_per_bar=3, seed=41)
    at, total = lay([('intro', 4), ('A', 8), ("A'", 8), ('B', 8), ("A''", 8)], bpb=3)
    i0 = at['intro'][0]; hI = [(i0, 6, 0, ''), (i0 + 6, 6, 4, '7')]
    sections = ['A', "A'", 'B', "A''"]; allh = hI + [h for n in sections for h in waltz_harm(n, at[n][0])]
    waltz_acc(s, 'pizzbass', 'strings', allh, k, 38, 57, 69, 66)
    roots(s, 'contrabass', allh, k, 26, 58, None)
    gliss(s, 'harp', k, i0 + 4, 2, -7, 7, 52); gliss(s, 'harp', k, i0 + 10, 2, -3, 11, 54)
    place(s, 'violin', waltz_line('A', k, at['A'][0], 0, 84)); place(s, 'flute2', [(t + 0.0, d, m + 12, v - 26) for t, d, m, v in waltz_line('A', k, at['A'][0], 0, 84) if d >= 1.9])
    place(s, 'clarinet', waltz_line("A'", k, at["A'"][0], 0, 84)); arpeggio(s, 'harp', waltz_harm("A'", at["A'"][0]), k, 55, 1, (0, 2, 4), 52)
    b = at['B'][0]; place(s, 'cello', waltz_line('B', k, b, -1, 86)); guide_tones(s, 'horns', waltz_harm('B', b), k, 57, 69, 58)
    arpeggio(s, 'harp', waltz_harm('B', b), k, 55, 1, (0, 2, 4), 50)
    c = at["A''"][0]; place(s, 'strings_lead', waltz_line("A''", k, c, 0, 88)); place(s, 'flute', waltz_line("A''", k, c, 0, 70))
    place(s, 'glock', [(t, d, m + 12, v - 30) for t, d, m, v in waltz_line("A''", k, c, 0, 88) if abs(t % 3) < 1e-6])
    for bar in range(0, total // 3, 4): s.add('perc', bar * 3, 1, TRI, 40)
    return dict(roles={'contrabass': 'pad'}, score=s, beats=total, title='果岭圆舞曲', detail='主题 · 3/4 圆舞曲变奏', key='D 大调', bpm=144)

# ---------- 5 滚球地图：《云端地图》梦幻变奏 ----------
def sky_map():
    k = Key('Eb', 4); s = Score(96, seed=51)
    at, total = lay([('intro', 2), ('A', 4), ("A'", 4), ('B', 4), ("A''", 4), ('tag', 2)])
    i0 = at['intro'][0]; hI = [(i0, 4, 3, ''), (i0 + 4, 4, 4, '')]; hT = [(at['tag'][0], 4, 3, ''), (at['tag'][0] + 4, 4, 4, '7')]
    allh = hI + harmony_timeline(['A', "A'", 'B', "A''"], at['A'][0]) + hT
    arpeggio(s, 'harp', allh, k, 51, 0.25, (0, 1, 2, 3, 4, 5, 4, 3, 2, 3, 4, 5, 6, 5, 4, 3), 50, span=3)
    pad(s, 'choir', allh, k, 55, 70, 48); pad(s, 'slowstr', allh, k, 46, 62, 44)
    roots(s, 'contrabass', allh, k, 27, 54)
    melody(s, 'celesta', ['A'], k, at['A'][0], 0, 82)
    melody(s, 'musicbox', ["A'"], k, at["A'"][0], 1, 72); melody(s, 'flute2', ["A'"], k, at["A'"][0], 0, 56)
    melody(s, 'flute', ['B'], k, at['B'][0], 0, 80)
    melody(s, 'celesta', ["A''"], k, at["A''"][0], 0, 80); melody(s, 'flute2', ["A''"], k, at["A''"][0], 0, 60)
    for name in ('A', "A'", 'B', "A''"):
        roll(s, 'timp', bass_note(k, 4, 41, 53), at[name][0] + 14, 2, 24, 62); s.add('cymbal', at[name][0] + 15, 2, 49, 36)
        s.add('perc', at[name][0], 2, TRI, 44)
    return dict(score=s, beats=total, title='云端地图', detail='主题 · 梦幻竖琴变奏', key='降 E 大调', bpm=96)

# ---------- 6 第一章：《启程群岛》进行曲变奏 ----------
def sky_isles():
    k = Key('F', 4); s = Score(126, seed=61)
    at, total = lay([('intro', 2), ('A', 4), ("A'", 4), ('B', 4), ("A''", 4), ('break', 4), ('C', 4), ('tag', 2)])
    i0 = at['intro'][0]; hI = [(i0, 4, 0, ''), (i0 + 4, 4, 4, '7')]
    sec = ['A', "A'", 'B', "A''"]
    br = at['break'][0]; hBr = [(br, 4, 0, ''), (br + 4, 4, 3, ''), (br + 8, 4, 1, '7'), (br + 12, 4, 4, '7')]
    c = at['C'][0]; hC = harmony_timeline(["A''"], c); hT = [(at['tag'][0], 4, 3, ''), (at['tag'][0] + 4, 4, 4, '7')]
    allh = hI + harmony_timeline(sec, at['A'][0]) + hBr + hC + hT
    oompah(s, 'tuba', 'pizz', allh, k, 29, 57, 69, 72)
    march = {SN: [(0, -8), (0.5, -22), (0.75, -18), (1, -6), (2, -10), (2.5, -22), (3, -6), (3.5, -18)], BD: [(0, 6), (2, 0)]}
    hits(s, 'drums', 0, total // 4, march, vel=64); hits(s, 'perc', 0, total // 4, {TAMB: [(1, -6), (3, -6)]}, vel=52)
    roll(s, 'drums', SN, i0, 2, 30, 80, 12)
    place(s, 'trumpet', line_events([MOTIF, [(9, 8)]], k, i0, 0, 80))
    melody(s, 'bassoon', ['A'], k, at['A'][0], -1, 82, stacc=True); melody(s, 'clarinet', ['A'], k, at['A'][0], 0, 80, stacc=True)
    melody(s, 'piccolo', ["A'"], k, at["A'"][0], 1, 66, stacc=True); melody(s, 'xylo', ["A'"], k, at["A'"][0], 0, 70)
    melody(s, 'trumpet', ['B'], k, at['B'][0], 0, 82); place(s, 'horns', line_events(shift(THEME['B'], -2), k, at['B'][0], 0, 68))
    melody(s, 'strings_lead', ["A''"], k, at["A''"][0], 0, 88); melody(s, 'horn', ["A''"], k, at["A''"][0], -1, 82); melody(s, 'glock', ["A''"], k, at["A''"][0], 1, 56)
    pad(s, 'strings', harmony_timeline(["A''"], at["A''"][0]), k, 50, 65, 58)
    for x in range(4): place(s, 'xylo', line_events([MOTIF[:3] + [(None, 4)]], k, br + x * 4, 0 if x % 2 == 0 else 1, 72))
    melody(s, 'strings_lead', ["A''"], k, c, 0, 92); melody(s, 'trumpet2', ["A''"], k, c, 0, 70); melody(s, 'piccolo', ["A''"], k, c, 1, 60, stacc=True)
    pad(s, 'brass', hC, k, 53, 65, 58, swell=False)
    for t in (at['A'][0], at["A''"][0], c): s.add('cymbal', t, 3, 49, 74)
    return dict(score=s, beats=total, title='启程群岛', detail='主题 · 进行曲变奏', key='F 大调', bpm=126)

# ---------- 7 第二章：《机关云港》发条变奏（D 多利亚）----------
def sky_harbor():
    k = Key('D', 4, 'dorian'); s = Score(136, seed=71)
    at, total = lay([('intro', 4), ('A', 4), ("A'", 4), ('B', 4), ("A''", 4), ('break', 4), ('C', 4)])
    i0 = at['intro'][0]; hI = [(i0 + 4 * j, 4, r, '') for j, r in enumerate([0, 0, 3, 4])]
    br = at['break'][0]; hBr = [(br + 4 * j, 4, r, '7' if r == 4 else '') for j, r in enumerate([0, 3, 0, 4])]
    c = at['C'][0]
    allh = hI + harmony_timeline(['A', "A'", 'B', "A''"], at['A'][0]) + hBr + harmony_timeline(["A''"], c)
    ostinato16(s, 'pizz', allh, k, 50, 62, (0, 4, 7, 4))
    for t, d, root, kind in allh:
        r = bass_note(k, root, 31, 43)
        for x in (0, 1.5, 2.5): 
            if x < d: s.add('tuba', t + x, 0.4, r, 74 if x == 0 else 64)
    hits(s, 'perc', 0, total // 4, {WBH: [(0, 0), (1, -6), (2, 0), (3, -6)], WBL: [(0.75, -4), (2.75, -4)], CLV: [(1.5, -10), (3.5, -10)]}, vel=60)
    hits(s, 'drums', at['A'][0], (total - at['A'][0]) // 4, {BD: [(0, 4), (1.5, -4), (2, 0)], SN: [(1, -6), (3, -6)]}, vel=60)
    place(s, 'marimba_o', [(i0 + x / 2, 0.3, n, 62) for x, n in enumerate([k(4), k(6), k(7), k(6)] * 8)])
    melody(s, 'oboe', ['A'], k, at['A'][0], 0, 86, stacc=True); melody(s, 'xylo', ['A'], k, at['A'][0], 0, 56)
    melody(s, 'trumpet', ["A'"], k, at["A'"][0], 0, 82, stacc=True); melody(s, 'bassoon', ["A'"], k, at["A'"][0], -1, 66, stacc=True)
    melody(s, 'piccolo', ['B'], k, at['B'][0], 1, 66, stacc=True); melody(s, 'xylo', ['B'], k, at['B'][0], 0, 74)
    for t, d, root, kind in harmony_timeline(['B'], at['B'][0]):
        for x in (0, 1.5):
            if x < d:
                for n in voicing(k, root, kind, 55, 67): s.add('brass', t + x + 0.5, 0.3, n, 70)
    melody(s, 'horn', ["A''"], k, at["A''"][0], -1, 90); melody(s, 'strings_lead', ["A''"], k, at["A''"][0], 0, 84, stacc=True)
    for x in range(4): place(s, 'xylo', line_events([MOTIF[:4] + [(None, 4)]], k, br + 4 * x, 0, 70)); place(s, 'brass', [(br + 4 * x + 3.5, 0.4, n, 72) for n in voicing(k, hBr[x][2], '', 55, 67)])
    melody(s, 'trumpet', ["A''"], k, c, 0, 86); melody(s, 'strings_lead', ["A''"], k, c, 0, 88); melody(s, 'glock', ["A''"], k, c, 1, 54)
    for t in (at['A'][0], at["A''"][0], c): s.add('cymbal', t, 3, 49, 70)
    return dict(score=s, beats=total, title='机关云港', detail='主题 · 发条机关变奏', key='D 多利亚', bpm=136)

# ---------- 8 第三章：《极光高空》史诗变奏 ----------
def sky_aurora():
    k = Key('Ab', 4); s = Score(140, seed=81)
    at, total = lay([('intro', 4), ('A', 4), ("A'", 4), ('B', 4), ("A''", 4), ('rise', 4), ('C', 4)])
    i0 = at['intro'][0]; hI = [(i0 + 4 * j, 4, r, '') for j, r in enumerate([0, 5, 3, 4])]
    ri = at['rise'][0]; hR = [(ri + 4 * j, 4, r, '7' if r == 4 else '') for j, r in enumerate([3, 4, 5, 4])]
    c = at['C'][0]
    allh = hI + harmony_timeline(['A', "A'", 'B', "A''"], at['A'][0]) + hR + harmony_timeline(["A''"], c)
    pad(s, 'trem', allh, k, 51, 68, 58)
    for t, d, root, kind in allh:
        r = bass_note(k, root, 32, 44)
        for x in range(int(d * 2)): s.add('cellos', t + x / 2, 0.42, r + (12 if x % 4 == 3 else 0), 70 + (10 if x % 2 == 0 else 0))
        s.add('timp', t, 0.5, bass_note(k, root, 41, 53), 84); s.add('timp', t + 1.5, 0.5, bass_note(k, root, 41, 53), 66)
        if d > 2: s.add('timp', t + 2, 0.5, bass_note(k, root, 41, 53), 76)
        s.add('trombone', t, d * 0.9, bass_note(k, root, 36, 48), 62)
    hits(s, 'drums', 0, total // 4, {BD: [(0, 8), (1.5, 0), (2.5, -2)], TOM_L: [(3.5, -8)]}, vel=66)
    arpeggio(s, 'celesta_s', allh, k, 72, 0.25, (0, 1, 2, 3, 4, 5, 4, 3), 46)
    melody(s, 'horn', ['A'], k, at['A'][0], -1, 92)
    melody(s, 'horn', ["A'"], k, at["A'"][0], -1, 90); melody(s, 'trumpet2', ["A'"], k, at["A'"][0], 0, 72)
    melody(s, 'strings_lead', ['B'], k, at['B'][0], 1, 86); melody(s, 'horns', ['B'], k, at['B'][0], -1, 70)
    pad(s, 'choir', harmony_timeline(['B', "A''"], at['B'][0]), k, 55, 72, 56)
    melody(s, 'strings_lead', ["A''"], k, at["A''"][0], 0, 92); melody(s, 'horn', ["A''"], k, at["A''"][0], -1, 92); melody(s, 'glock', ["A''"], k, at["A''"][0], 1, 58)
    for x in range(4): place(s, 'horns', line_events([[(d + x if d is not None else None, e) for d, e in MOTIF]], k, ri + 4 * x, -1, 76 + 4 * x))
    roll(s, 'timp', bass_note(k, 4, 41, 53), ri + 12, 4, 30, 100); s.add('cymbal', ri + 14, 2, 49, 60)
    melody(s, 'strings_lead', ["A''"], k, c, 1, 92); melody(s, 'horn', ["A''"], k, c, -1, 96); melody(s, 'trumpet', ["A''"], k, c, 0, 80)
    pad(s, 'choir', harmony_timeline(["A''"], c), k, 55, 72, 60)
    for t in (at['A'][0], at["A''"][0], c, at['B'][0]): s.add('cymbal', t, 3, 49, 82)
    return dict(score=s, beats=total, title='极光高空', detail='主题 · 史诗管弦变奏', key='降 A 大调', bpm=140)

# ---------- 短曲 ----------
def sting_win():
    k = Key('Bb', 4); s = Score(120, seed=91)
    head = MOTIF
    place(s, 'trumpet', line_events([head], k, 0, 0, 92, stacc=False)); place(s, 'horns', line_events([head], k, 0, -1, 80))
    place(s, 'strings_lead', line_events([head], k, 0, 0, 84)); place(s, 'glock', line_events([head], k, 0, 1, 64))
    for n in voicing(k, 0, '', 58, 74): s.add('brass', 4, 3.6, n, 92); s.add('strings', 4, 4, n, 86)
    s.add('trumpet', 4, 3.6, k(7), 96); s.add('horn', 4, 3.6, k(4 - 7 + 7), 86)
    s.add('tuba', 4, 3.6, bass_note(k, 0, 34, 46), 86); s.add('contrabass', 4, 4, bass_note(k, 0, 34, 46) - 12 if bass_note(k, 0, 34, 46) - 12 >= 28 else bass_note(k, 0, 34, 46), 80)
    roll(s, 'timp', bass_note(k, 0, 41, 53), 3, 1, 50, 100, 12); s.add('timp', 4, 1, bass_note(k, 0, 41, 53), 110)
    s.add('cymbal', 4, 3, 49, 96); gliss(s, 'harp', k, 4, 1.2, 0, 14, 70)
    for x, d in enumerate([0, 2, 4, 7]): s.add('glock', 4.25 + x * 0.25, 1, k(d + 7), 72)
    return dict(score=s, beats=10, title='过关', detail='胜利短曲', key='降 B 大调', bpm=120, sting=True)

def sting_hole():
    k = Key('G', 4); s = Score(132, seed=95)
    place(s, 'celesta', line_events([[(4, 1), (7, 1), (9, 1), (11, 1), (14, 4)]], k, 0, 0, 86))
    place(s, 'pizz', [(t, d, m - 12, v - 8) for t, d, m, v in line_events([[(4, 1), (7, 1), (9, 1), (11, 1), (14, 2)]], k, 0, 0, 80)])
    gliss(s, 'harp', k, 2, 1, 0, 14, 64)
    for n in voicing(k, 0, '', 55, 71): s.add('slowstr', 2, 3, n, 70)
    s.add('perc', 2, 1, TRI, 70); s.add('contrabass', 2, 3, bass_note(k, 0, 31, 43), 70)
    return dict(roles={'contrabass': 'pad'}, score=s, beats=7, title='进洞', detail='进洞短曲', key='G 大调', bpm=132, sting=True)

CUES = {'hub': hub, 'golf-lobby': golf_lobby, 'golf-practice': golf_practice, 'golf-round': golf_round,
        'sky-map': sky_map, 'sky-isles': sky_isles, 'sky-harbor': sky_harbor, 'sky-aurora': sky_aurora,
        'sting-win': sting_win, 'sting-hole': sting_hole}
