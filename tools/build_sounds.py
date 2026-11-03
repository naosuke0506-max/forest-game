"""ゲームで使う録音の音（効果音・声・環境音）を作る（開発用の道具。ゲームには含まれない）

    python3 tools/build_sounds.py <取り込み先のフォルダ>

1. OpenGameArt の CC0（パブリックドメイン相当。帰属表示の義務なし）の音の素材を取り込み先へ取り込む（あれば使う）
2. 必要な所だけを切り出し（1 つのファイルに音がいくつも入っている物は、無音で区切って何番目かを選ぶ）、
   低い雑音を削り、大きさをそろえ、単音（モノラル）の MP3 にして assets/sounds/ に書き出す
3. assets/sounds/sounds.json（名前 → ファイル・長さ）を書き出す。出典は assets/sounds/CREDITS.md

必要なもの：Python 3・numpy・ffmpeg（libmp3lame 入り）・py7zr（.7z を開く）
"""
import json, os, subprocess, sys, urllib.request, zipfile
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'sounds'
SR = 44100
UA = {'User-Agent': 'Mozilla/5.0'}

# 取り込む素材（OpenGameArt のページ → 中のファイル）。すべて CC0
SOURCES = {
    'owlish':   ('sound-effects-pack', 'Owlish%20Media%20Sound%20Effects.zip'),
    'fantozzi': ('fantozzis-footsteps-grasssand-stone', 'Fantozzi-footsteps.7z'),
    'scream':   ('15-vocal-male-strainhurtpainjump-sounds', 'slightscreams.7z'),
    'grunts':   ('grunts-male-death-and-pain', 'death%20pain%20grunts.wav'),
    'tinyhit':  ('5-hit-sounds-dying', '5Hit_Sounds.zip'),
    'hits':     ('37-hitspunches', 'independent_nu_ljudbank-hits_and_punches.7z'),
    'shield':   ('10-impactshield-blocks', 'impact_-_starninjas.zip'),
    'impact':   ('impact', 'qubodupImpact.7z'),
    'swish':    ('swishes-sound-pack', 'swishes.zip'),
    'rpg':      ('rpg-sound-pack', 'rpg_sound_pack.zip'),
    'mw':       ('100-cc0-metal-and-wood-sfx', '100-CC0-wood-metal-SFX.zip'),
    'bfh':      ('75-cc0-breaking-falling-hit-sfx', 'sfx_breaking_and_falling.zip'),
    'birds':    ('ambient-bird-sounds', 'birds-isaiah658_0.ogg'),
    'chirp':    ('bird-chirping-sounds', 'birdchirping071414.wav'),
    'crows':    ('crows-singing', 'Crows.ogg'),
    'crow1':    ('crow', 'crow_0.ogg'),
    'crow2':    ('crow-caw', 'crow_caw.wav'),
    'crickets': ('crickets-ambient-noise-loopable', 'crickets_1.mp3'),
}

# 作る音：名前 → (素材, 素材の中のファイル, 選び方)
#   seg：無音で区切った何番目か（0 から）。start / end：切り出す秒。hp：これより低い音を削る（Hz）
#   loop：繰り返して鳴らす（終わりと始まりをなめらかにつなぐ）。gain：大きさの調整（dB）。rate：音の高さ（1 より大きいと高い）
O = 'Owlish Media Sound Effects/'   # zip の中のフォルダ（無ければ探す）
CLIPS = {
    # ===== 足音 =====
    **{f'step_grass_{i}': ('owlish', f'Footsteps/{n}', {'hp': 70}) for i, n in enumerate(['gassy-footstep1.wav', 'grassy-footstep2.wav', 'grassy-footstep3.wav', 'grassy-footstep4.wav'])},
    **{f'step_grass_{i + 4}': ('owlish', 'Footsteps/grass_footsteps.wav', {'seg': i, 'hp': 70}) for i in range(4)},
    **{f'step_sand_{i}': ('fantozzi', f'Fantozzi-SandL{k}.ogg' if i < 3 else f'Fantozzi-SandR{k}.ogg', {'hp': 60}) for i, k in enumerate([1, 2, 3, 1, 2, 3])},
    **{f'step_stone_{i}': ('fantozzi', f'Fantozzi-StoneL{k}.ogg' if i < 3 else f'Fantozzi-StoneR{k}.ogg', {'hp': 60}) for i, k in enumerate([1, 2, 3, 1, 2, 3])},
    **{f'step_wood_{i}': ('owlish', f'Footsteps/{n}', {'hp': 50}) for i, n in enumerate(['step1.wav', 'step2.wav', 'step3.wav', 'hard-footstep1.wav', 'hard-footstep3.wav', 'hard-footstep4.wav'])},
    'armor_chain_0': ('rpg', 'inventory/chainmail1.wav', {'end': 0.35, 'gain': -6}),
    'armor_chain_1': ('rpg', 'inventory/chainmail2.wav', {'end': 0.35, 'gain': -6}),
    'armor_plate_0': ('rpg', 'inventory/armor-light.wav', {'end': 0.4, 'gain': -6}),
    # ===== 声（男性）=====
    # 息を止めるような短い声（回避ステップ）・攻撃の声（スタミナが少ないとき）・痛がる声・倒れる声
    **{f'v_effort_{i}': ('scream', f'slightscream-{n:02d}.flac', {}) for i, n in enumerate([11, 8, 1, 12])},
    **{f'v_attack_{i}': ('scream', f'slightscream-{n:02d}.flac', {}) for i, n in enumerate([3, 14, 6, 2])},
    **{f'v_hurt_{i}': ('scream', f'slightscream-{n:02d}.flac', {}) for i, n in enumerate([4, 7, 9, 13, 5])},
    'v_death_0': ('scream', 'slightscream-15.flac', {}),
    'v_death_1': ('scream', 'slightscream-10.flac', {}),
    'v_death_2': ('tinyhit', 'die1.ogg', {}),
    'v_death_3': ('grunts', 'death pain grunts.wav', {'seg': 'longest:0'}),
    'v_death_4': ('grunts', 'death pain grunts.wav', {'seg': 'longest:1'}),
    'v_death_5': ('grunts', 'death pain grunts.wav', {'seg': 'longest:2'}),
    # 息遣い：深い息（スタミナが減ってきた）・荒い息（スタミナが少ない）
    'breath_deep': ('owlish', 'Human/breath-male.wav', {'start': 0.5, 'end': 16.5, 'loop': True, 'hp': 120}),
    'breath_pant': ('owlish', 'Human/scared-breathing.wav', {'start': 0.3, 'end': 12.3, 'loop': True, 'hp': 120}),
    # ===== 振る音（空を切る風の音）=====
    **{f'swing_light_{i}': ('swish', f'swish-{n}.wav', {}) for i, n in enumerate([10, 11, 12, 13])},
    **{f'swing_heavy_{i}': ('swish', f'swish-{n}.wav', {}) for i, n in enumerate([3, 7, 9, 4])},
    **{f'swing_mid_{i}': ('rpg', f'battle/{n}', {}) for i, n in enumerate(['swing.wav', 'swing2.wav', 'swing3.wav'])},
    # ===== 当たる音（当たった物で違う）=====
    **{f'hit_metal_{i}': ('mw', f'metal_hit_0{n}.ogg', {}) for i, n in enumerate([1, 2, 3, 4])},
    'hit_metal_4': ('impact', 'qubodupImpactMetal.ogg', {}),
    'hit_flesh_0': ('impact', 'qubodupImpactMeat01.ogg', {}),
    'hit_flesh_1': ('impact', 'qubodupImpactMeat02.ogg', {}),
    **{f'hit_blunt_{i}': ('hits', f'hits/hit{n:02d}.mp3.flac', {}) for i, n in enumerate([3, 8, 14, 20, 27])},
    **{f'hit_shield_{i}': ('shield', f'impact.{n}.ogg', {}) for i, n in enumerate([1, 3, 6, 7, 10])},
    'hit_wood_0': ('impact', 'qubodupImpactWood.ogg', {}),
    **{f'hit_wood_{i + 1}': ('mw', f'wood_hit_0{n}.ogg', {}) for i, n in enumerate([1, 4, 8])},
    'hit_stone_0': ('impact', 'qubodupImpactStone.ogg', {}),
    'hit_stone_1': ('bfh', 'bfh1_rock_hit_01.ogg', {}),
    # ===== 体の動き =====
    'roll_cloth_0': ('owlish', 'Cloth, Rustle/320142__owlstorm__blanket-movement-4.wav', {'end': 0.9, 'hp': 80}),
    'roll_cloth_1': ('owlish', 'Cloth, Rustle/320144__owlstorm__blanket-movement-6.wav', {'end': 0.9, 'hp': 80}),
    **{f'body_fall_{i}': ('bfh', f'bfh1_falling_0{n}.ogg', {}) for i, n in enumerate([1, 2, 3])},
    **{f'armor_fall_{i}': ('bfh', f'bfh1_metal_falling_0{n}.ogg', {}) for i, n in enumerate([1, 2])},
    # ===== 拾う・箱・クラフト・家具 =====
    'pick_wood': ('rpg', 'inventory/wood-small.wav', {}),
    'pick_metal': ('rpg', 'inventory/metal-small1.wav', {}),
    'pick_cloth': ('rpg', 'inventory/cloth.wav', {}),
    'pick_stone': ('bfh', 'bfh1_rock_hit_01.ogg', {'gain': -4}),
    'crate_open': ('mw', 'door_open_01.ogg', {}),
    **{f'hammer_{i}': ('mw', f'hammer_0{n}.ogg', {}) for i, n in enumerate([1, 2, 3])},
    'wood_creak_0': ('mw', 'wood_squeak_01.ogg', {}),
    'wood_creak_1': ('mw', 'wood_squeak_02.ogg', {}),
    'wood_close': ('mw', 'wood_close_01.ogg', {}),
    'bed_rustle': ('owlish', 'Cloth, Rustle/320138__owlstorm__blanket-movement-2.wav', {'hp': 80}),
    # ===== 環境音 =====
    'amb_birds': ('birds', 'birds-isaiah658_0.ogg', {'loop': True, 'hp': 300}),
    'amb_chirp': ('chirp', 'birdchirping071414.wav', {'hp': 400}),
    'amb_crickets': ('crickets', 'crickets_1.mp3', {'loop': True, 'hp': 1200}),
    'crow_0': ('crow1', 'crow_0.ogg', {'hp': 200}),
    'crow_1': ('crow2', 'crow_caw.wav', {'hp': 200}),
    'crow_2': ('crows', 'Crows.ogg', {'start': 0.0, 'end': 4.6, 'hp': 200}),   # 何羽かが鳴き交わす（区切れないので、時間で半分に）
    'crow_3': ('crows', 'Crows.ogg', {'start': 4.6, 'end': 9.3, 'hp': 200}),
}


def fetch(cache, key):
    """素材を取り込み、展開したフォルダを返す"""
    slug, name = SOURCES[key]
    d = Path(cache) / slug
    d.mkdir(parents=True, exist_ok=True)
    fname = urllib.parse.unquote(name)
    f = d / fname
    if not f.exists():
        url = f'https://opengameart.org/sites/default/files/{name}'
        print('取り込み', url)
        f.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300).read())
    x = d / 'x'
    if not x.exists():
        if fname.endswith('.zip'):
            zipfile.ZipFile(f).extractall(x)
        elif fname.endswith('.7z'):
            import py7zr
            py7zr.SevenZipFile(f).extractall(x)
        else:
            x.mkdir()
            (x / fname).write_bytes(f.read_bytes())
    return x


def find(base, rel):
    """展開したフォルダの中から、名前の終わりが rel に合うファイルを探す（__MACOSX は除く）"""
    rel = rel.replace('\\', '/')
    for p in base.rglob('*'):
        s = str(p).replace('\\', '/')
        if '__MACOSX' in s or not p.is_file():
            continue
        if s.endswith('/' + rel) or s.endswith(rel):
            return p
    raise FileNotFoundError(f'{base} の中に {rel} が無い')


def load(path):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


def segments(d, min_gap=0.08, min_len=0.12):
    """無音で区切った音のかたまり [(始め, 終わり)]（サンプル番号）"""
    hop = int(SR * 0.01)
    env = np.array([np.sqrt(np.mean(d[i:i + hop] ** 2)) for i in range(0, len(d) - hop, hop)])
    thr = max(1e-4, env.max() * 0.05)
    on = env > thr
    segs, start, gap = [], None, 0
    for i, v in enumerate(on):
        if v:
            if start is None: start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap * hop >= min_gap * SR:
                segs.append((start, i - gap + 1)); start = None; gap = 0
    if start is not None: segs.append((start, len(on)))
    out = [(max(0, a * hop - int(0.01 * SR)), min(len(d), b * hop + int(0.03 * SR))) for a, b in segs]
    return [s for s in out if (s[1] - s[0]) >= min_len * SR]


def highpass(d, hz):
    if not hz: return d
    # 1 次の簡単な高域通過（低い雑音・風の吹かれを削る）
    a = np.exp(-2 * np.pi * hz / SR)
    y = np.empty_like(d); prev_x = 0.0; prev_y = 0.0
    for i, x in enumerate(d):
        prev_y = a * (prev_y + x - prev_x); prev_x = x; y[i] = prev_y
    return y


def build(cache):
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}
    for name, (src, rel, opt) in CLIPS.items():
        base = fetch(cache, src)
        d = load(find(base, rel))
        if 'seg' in opt:
            segs = segments(d)
            s = opt['seg']
            if isinstance(s, str) and s.startswith('longest:'):
                k = int(s.split(':')[1]); segs = sorted(segs, key=lambda q: q[1] - q[0], reverse=True)
                a, b = segs[min(k, len(segs) - 1)]
            else:
                a, b = segs[min(s, len(segs) - 1)]
            d = d[a:b]
        if 'start' in opt or 'end' in opt:
            d = d[int(opt.get('start', 0) * SR): int(opt['end'] * SR) if 'end' in opt else len(d)]
        d = highpass(d, opt.get('hp', 30))
        # 先頭の無音を詰める（鳴らしてから音が出るまでの遅れを無くす）。繰り返す音はそのまま
        if not opt.get('loop'):
            pk = np.abs(d).max()
            head = np.nonzero(np.abs(d) > pk * 0.03)[0]   # 始めは -30dB で（すぐ鳴るように）
            tail = np.nonzero(np.abs(d) > pk * 0.008)[0]  # 終わりは -42dB まで残す（響きを切らない）
            if len(head): d = d[max(0, head[0] - int(0.004 * SR)): min(len(d), tail[-1] + int(0.12 * SR))]
            fade = min(len(d) // 4, int(0.02 * SR))
            d[-fade:] *= np.linspace(1, 0, fade)
        else:
            # 繰り返し：終わりの 0.5 秒を始めに重ねて、つなぎ目を消す
            x = int(0.5 * SR)
            head, tail = d[:x].copy(), d[-x:].copy()
            ramp = np.linspace(0, 1, x)
            d = d[:-x].copy(); d[:x] = head * ramp + tail * (1 - ramp)
        # 大きさをそろえる：単発の音は一番大きい所を -1dB、繰り返す音は平均を -24dB
        if opt.get('loop'):
            d *= (10 ** (-24 / 20)) / max(1e-6, np.sqrt(np.mean(d ** 2)))
        else:
            d *= (10 ** (-1 / 20)) / max(1e-6, np.abs(d).max())
        d *= 10 ** (opt.get('gain', 0) / 20)
        d = np.clip(d, -1, 1)
        pcm = (d * 32767).astype(np.int16).tobytes()
        out = OUT / f'{name}.mp3'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-',
                        '-c:a', 'libmp3lame', '-b:a', '80k' if opt.get('loop') else '96k', str(out)], input=pcm, check=True)
        meta[name] = {'file': f'{name}.mp3', 'sec': round(len(d) / SR, 3), 'loop': bool(opt.get('loop'))}
        print(f'{name:16s} {len(d) / SR:6.2f}s  {out.stat().st_size // 1024}KB')
    (OUT / 'sounds.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1) + '\n')
    total = sum((OUT / m['file']).stat().st_size for m in meta.values())
    print(f'{len(meta)} 個  合計 {total // 1024}KB')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    build(sys.argv[1])
