# 原始の曲に効果音を重ねる。置く所は小節の頭（拍を追って測った位置）。音の大きさは、その所の曲の大きさに対して決める
import json, numpy as np, soundfile as sf
SR = 44100
rng = np.random.default_rng(7)
music, sr = sf.read('src/原始人bgm.wav'); assert sr == SR
N = len(music)
B = json.load(open('beats.json'))['原始人bgm.wav']
bt = np.array(B['beats']); H = bt[B['down']::4]           # 小節の頭の時刻
def bar(i): return float(H[i])
def load(n):
    x, s = sf.read(f'sfx/{n}.wav'); return x
info = {k[4:-4]: v for k, v in json.load(open('sfxinfo.json')).items()}
def rms(x): return np.sqrt((x ** 2).mean() + 1e-12)
def db(v): return 20 * np.log10(v + 1e-12)
def active_rms(x):
    env = np.sqrt(np.convolve((x ** 2).mean(1), np.ones(882) / 882, 'same'))
    m = env > env.max() * 0.1
    return rms(x[m]) if m.any() else rms(x)
def music_rms(t0, t1):
    a, b = int(max(0, t0) * SR), int(min(N / SR, t1) * SR)
    return rms(music[a:b])

fx = np.zeros_like(music)
log = []
def place(name, t, rel_db, align='on', fade_out=None, x=None):
    """効果音 name を、align（on＝鳴り始め・peak＝一番大きい所・start＝ファイルの頭）が時刻 t に来るように置く。
       大きさは、置く所の曲の大きさ + rel_db（効果音の中身のある所の大きさで比べる）"""
    if x is None: x = load(name)
    off = {'on': info[name]['on'], 'peak': info[name]['peak'], 'start': 0}[align] if name in info else 0
    s = t - off
    seg = x.copy()
    if fade_out:
        k = int(fade_out * SR); seg[-k:] *= np.linspace(1, 0, k)[:, None]
    g = 10 ** ((db(music_rms(s, s + len(seg) / SR)) + rel_db - db(active_rms(seg))) / 20)
    a = int(s * SR)
    if a < 0: seg = seg[-a:]; a = 0
    b = min(N, a + len(seg))
    fx[a:b] += seg[:b - a] * g
    log.append((round(t, 2), name, rel_db))

# 続く音（燃える大地・風）：5 秒の音を、向きと始まりを変えながら 1 秒ずつ重ねてつなぐ
def bed(name, dur, lo=0.5, hi=None):
    x = load(name); hi = hi or len(x) / SR - 0.1
    piece = x[int(lo * SR):int(hi * SR)]
    L = len(piece); X = int(1.0 * SR); n = int(dur * SR)
    out = np.zeros((n + L, 2)); pos = 0; k = 0
    ramp = np.linspace(0, 1, X)[:, None]
    while pos < n:
        p = piece[::-1] if k % 2 else piece
        p = p.copy(); p[:X] *= ramp; p[-X:] *= ramp[::-1]
        out[pos:pos + L] += p
        pos += L - X; k += 1
    return out[:n]
def place_bed(name, t0, t1, rel_db, fin=1.5, fout=1.5, shape=None):
    x = bed(name, t1 - t0)
    n = len(x)
    env = np.ones(n)
    a, b = int(fin * SR), int(fout * SR)
    env[:a] = np.linspace(0, 1, a); env[-b:] = np.linspace(1, 0, b)
    if shape is not None: env *= shape(np.arange(n) / SR)
    x = x * env[:, None]
    g = 10 ** ((db(music_rms(t0, t1)) + rel_db - db(rms(x[a:n - b]))) / 20)
    s = int(t0 * SR); e = min(N, s + n)
    fx[s:e] += x[:e - s] * g
    log.append((round(t0, 2), f'{name}（続く・{t1 - t0:.0f} 秒）', rel_db))

# 炎が燃え上がる「ボッ」：松明の風切り＋低い膨らみ（その場で作る）を、小節の頭に合わせる
def ignite(t, rel_db):
    n = int(1.6 * SR); tt = np.arange(n) / SR
    noise = rng.standard_normal((n, 2))
    # 低い所へ寄せた雑音（簡単な一次の低域通過を重ねる）
    for _ in range(3):
        for c in range(2):
            y = np.empty(n); acc = 0.0
            for i in range(n): acc += 0.08 * (noise[i, c] - acc); y[i] = acc
            noise[:, c] = y
    env = np.minimum(1, tt / 0.04) * np.exp(-tt / 0.45)
    thump = np.sin(2 * np.pi * (70 * tt - 15 * tt ** 2)) * np.exp(-tt / 0.3)
    boom = noise * env[:, None] * 3 + (thump * 0.6)[:, None]
    s = int(t * SR) - int(0.01 * SR)
    g = 10 ** ((db(music_rms(t, t + 1.0)) + rel_db - db(rms(boom[:int(0.6 * SR)]))) / 20)
    fx[s:s + n] += boom * g
    place('松明を振る', t, rel_db - 2, align='peak')
    log.append((round(t, 2), '炎が燃え上がる（ボッ）', rel_db))

# 曲を一時的に下げる（静けさをマンモスの声が引き裂く所）
duck = np.ones(N)
def carve(t0, t1, depth_db, ramp=0.35):
    a, b = int(t0 * SR), int(t1 * SR); r = int(ramp * SR)
    g = 10 ** (depth_db / 20)
    seg = np.full(b - a, g)
    seg[:r] = np.linspace(1, g, r) if r < len(seg) else g
    seg[-r:] = np.minimum(seg[-r:], np.linspace(g, 1, r))
    duck[a:b] = np.minimum(duck[a:b], seg)
    log.append((round(t0, 2), f'曲を {depth_db} dB 下げる（〜{t1:.1f} 秒）', 0))

# ---------- 置く ----------
# 序と 1 番（静か）：夜の風・遠いマンモスの群れ・オオカミ・獣の唸り
place_bed('寒い夜の風', 0.0, bar(14) + 1, -8, fin=2.5, fout=3)
place('遠いマンモスの群れ', 0.3, -4, align='start')
place('オオカミの遠吠え', bar(2), -1, align='start', fade_out=2)
place('獣の唸り声', bar(4), 0)
place('獣の唸り声2', bar(7), 0)
# 静けさを引き裂く 1：マンモスの雄叫び
carve(bar(9) - 0.4, bar(11), -9)
place('マンモスの鳴き声', bar(9), +2)
place('松明を振る', bar(12), -1, align='peak')
# サビ 1：炎が燃え上がり、大地が燃える
ignite(bar(14), +2)
place_bed('草原が燃える', bar(14), bar(48), -9, fin=0.3, fout=3)
place('獣の悲鳴', bar(22), 0)
place('木が倒れる', bar(27), +3)
place('獣の悲鳴2', bar(34), +1)
place('マンモスの悲鳴', bar(38), +2)
place('獣の悲鳴', bar(42), 0)
# 2 番：くすぶる火と獣、2 回目の雄叫びからサビ 2
place_bed('草原が燃える', bar(48), bar(53), -16, fin=2, fout=0.5)
place('獣の唸り声', bar(48), 0)
place('松明を振る', bar(50), -1, align='peak')
carve(bar(51) - 0.4, bar(53), -8)
place('マンモスの鳴き声2', bar(51), +2)
ignite(bar(53), +2)
place_bed('草原が燃える', bar(53), bar(87), -9, fin=0.3, fout=3)
place('獣の悲鳴', bar(61), 0)
place('マンモスの悲鳴2', bar(67), +2)
place('木が倒れる', bar(75), +3)
place('獣の悲鳴2', bar(82), +1)
# 静かな所（ブリッジ）：火が消えかけ、オオカミ。3 回目の雄叫びから最後のサビ
place_bed('草原が燃える', bar(87), bar(94), -15, fin=2, fout=0.5)
place_bed('寒い夜の風', bar(86), bar(94) + 1, -9, fin=3, fout=1.5)
place('オオカミの遠吠え2', bar(87), +3, align='start', fade_out=2)
place('獣の唸り声2', bar(90), +1)
carve(bar(92) - 0.4, bar(94), -9)
place('マンモスの鳴き声', bar(92), +3)
# 最後のサビ：大地全体が燃える
ignite(bar(94), +3)
place_bed('草原が燃える', bar(94), bar(126), -7, fin=0.3, fout=6)
place('マンモスの悲鳴', bar(97), +2)
place('獣の悲鳴', bar(101), +1)
place('木が倒れる', bar(105), +3)
place('マンモスの悲鳴2', bar(109), +2)
place('獣の悲鳴2', bar(113), +1)
place('マンモスの鳴き声2', bar(117), +2)
place('木が倒れる', bar(121), +3)
# 終わり：火が消え、風とオオカミと遠いマンモス
place_bed('寒い夜の風', bar(128), N / SR, -6, fin=4, fout=4)
place('オオカミの遠吠え', bar(133), 0, align='start', fade_out=2)
place('遠いマンモスの群れ', bar(136), -3, align='start')

# ---------- 響き（効果音だけに薄く。曲の空間に馴染ませる） ----------
def reverb(x, wet=0.16):
    out = np.zeros_like(x)
    for d, fb in [(0.0297, 0.77), (0.0371, 0.75), (0.0411, 0.73), (0.0437, 0.71)]:
        D = int(d * SR)
        for c in range(2):
            y = x[:, c].copy()
            # 櫛形：y[n] = x[n] + fb*y[n-D]（塊ごとに計算）
            for s in range(D, len(y), D):
                e = min(len(y), s + D); y[s:e] += fb * y[s - D:e - D]
            out[:, c] += y * 0.25
    return x * (1 - wet) + out * wet
fx = reverb(fx)
mix = music * duck[:, None] + fx
peak = np.abs(mix).max()
print('重ねた数', len(log), '一番大きい所', round(20 * np.log10(peak), 1), 'dB')
sf.write('genshi_mix.wav', mix / max(1, peak / 0.98), SR); sf.write('genshi_fx.wav', fx / max(1, peak / 0.98), SR); np.save('genshi_duck.npy', duck)
for t, n, r in sorted(log):
    print(f"  {int(t // 60)}:{t % 60:05.2f}  {n}  ({r:+} dB)")
