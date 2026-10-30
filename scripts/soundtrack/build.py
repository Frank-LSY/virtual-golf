"""Render every cue to screen-web/assets/music/<id>.mp3 and write soundtrack.json.
Loops are rendered twice in a row; the file keeps the second pass (whose start already contains the
reverb tail of the end), padded by 0.5 s on both sides, so loopStart/loopEnd play seamlessly."""
import json, os, subprocess, sys, time, numpy as np
from engine import SR, render_part, pan, eq, hall_ir, reverb, compress, limit, write_wav
from variants import CUES, I

ROLE = {  # target active RMS (dB, relative), reverb send, eq
 'lead': (-14, .30, [('hp', 180, .7), ('peak', 2800, .9, 1.5)]), 'lead2': (-19, .32, [('hp', 200, .7)]),
 'counter': (-20, .34, [('hp', 150, .7)]), 'pad': (-23, .45, [('hp', 110, .7), ('peak', 420, .8, -2)]),
 'arp': (-22, .36, [('hp', 120, .7)]), 'chords': (-22, .28, [('hp', 140, .7)]), 'bass': (-18, .16, [('hp', 32, .7), ('lowshelf', 110, .7, 1.5)]),
 'sparkle': (-26, .50, [('hp', 500, .7)]), 'drums': (-21, .18, [('hp', 35, .7)]), 'perc': (-27, .30, [('hp', 300, .7)]),
 'timp': (-21, .30, [('hp', 40, .7)]), 'cymbal': (-27, .45, [('hp', 250, .7)]),
}
TARGET_LUFS = {'loop': -18.0, 'sting': -16.0}
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'screen-web', 'assets', 'music')
WORK = os.environ.get('SOUNDTRACK_WORK', '/tmp/soundtrack-work')

def active_rms(x):
    m = np.sqrt(np.mean(x ** 2, axis=1)); hop = 2048
    frames = m[: len(m) // hop * hop].reshape(-1, hop); r = np.sqrt((frames ** 2).mean(axis=1))
    if not len(r) or r.max() <= 0: return 1e-9
    act = r[r > r.max() * 10 ** (-30 / 20)]
    return float(np.sqrt((act ** 2).mean()))

def lufs(path):
    p = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], capture_output=True, text=True)
    for line in p.stderr.splitlines()[::-1]:
        if line.strip().startswith('I:'): return float(line.split()[1])
    raise RuntimeError(p.stderr[-500:])

def render(cue_id):
    cue = CUES[cue_id](); s = cue['score']; beats = cue['beats']; sting = cue.get('sting', False)
    # FluidSynth applies events on 64-sample blocks: the loop length is rounded to whole blocks so both
    # passes are quantised identically and the seam is sample-continuous.
    L = round(beats * 60 / s.bpm * SR / 64) * 64 / SR; total = (L + 4.0) if sting else (2 * L + 3.0)
    ir = hall_ir(2.6 if cue_id in ('sky-map', 'golf-round', 'hub', 'sky-aurora') else 2.1)
    dry = np.zeros((int(total * SR), 2), np.float32); wet = np.zeros_like(dry); report = []
    for part in sorted(s.parts):
        prog, p, role = I[part]; role = cue.get('roles', {}).get(part, role); bank = 128 if I[part][2] in ('drums', 'perc', 'cymbal') else 0
        one = s.events(part, 0); ev = one if sting else one + [(t + L, k, a_, b_) for t, k, a_, b_ in one]
        x = render_part(ev, total, prog, bank)
        target, send, bands = ROLE[role]; x = eq(x, *bands)
        g = 10 ** (target / 20) / active_rms(x); x = pan(x * g, p)
        dry += x; wet += x * send; report.append(f'{part}:{20*np.log10(g):+.0f}dB')
    mix = dry + reverb(wet, ir) * 0.9
    mix = eq(mix, ('hp', 28, .7), ('highshelf', 7500, .7, 1.5))
    mix = compress(mix, -20, 1.8, 0.02, 0.3)
    if not sting:
        a = int((L - 0.5) * SR); b = int((2 * L + 0.5) * SR); mix = mix[a:b]
    else:
        fade = int(0.6 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    os.makedirs(WORK, exist_ok=True); wav = os.path.join(WORK, cue_id + '.wav')
    write_wav(wav, mix / max(1e-6, np.abs(mix).max()) * 0.5)
    gain = 10 ** ((TARGET_LUFS['sting' if sting else 'loop'] - lufs(wav)) / 20)
    mix = limit(mix / max(1e-6, np.abs(mix).max()) * 0.5 * gain, 0.89)
    if not sting:  # 12 ms crossfade into the loop start so the wrap is continuous even with tiny differences
        a0 = int(round(0.5 * SR)); b0 = int(round((0.5 + L) * SR)); n = int(0.012 * SR); w = np.linspace(0, 1, n)[:, None]
        mix[b0 - n:b0] = mix[b0 - n:b0] * (1 - w) + mix[a0 - n:a0] * w
    write_wav(wav, mix)
    os.makedirs(OUT, exist_ok=True); mp3 = os.path.join(OUT, cue_id + '.mp3')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', mp3], check=True)
    info = dict(id=cue_id, title=cue['title'], detail=cue['detail'], key=cue['key'], bpm=cue['bpm'], src=f'/screen-web/assets/music/{cue_id}.mp3',
                duration=round(len(mix) / SR, 3), loudness=round(lufs(wav), 1))
    if not sting: info.update(loopStart=0.5, loopEnd=round(0.5 + L, 4))
    print(cue_id, f'{L:.1f}s', info['loudness'], 'LUFS', ' '.join(report), flush=True)
    return info

if __name__ == '__main__':
    ids = sys.argv[1:] or list(CUES)
    manifest_path = os.path.join(OUT, 'soundtrack.json')
    try: manifest = json.load(open(manifest_path))
    except Exception: manifest = {'version': 1, 'cues': {}}
    for cid in ids:
        t = time.time(); manifest['cues'][cid] = render(cid); print('  ', round(time.time() - t, 1), 's')
    manifest['cues'] = {k: manifest['cues'][k] for k in CUES if k in manifest['cues']}
    json.dump(manifest, open(manifest_path, 'w'), ensure_ascii=False, indent=1)
