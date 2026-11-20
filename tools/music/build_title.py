# 題の曲（歷代）を組み立てる：序（時計の刻みが速くなる）→ 原始 → 切り替え → 中世 → … → 未来 → 終（刻みだけ）→ 頭へ戻る
#   時代の部分は、時代の曲（利用者が Suno で作った。リポジトリには入れていない）から小節の頭で切り出す。切り替えの音（時計の刻み・
#   速くなる刻み・吸い上がる音・鐘と歯車の合図）はここで作る。区切りの時刻表（刻み・鐘・合図・時代・小節・大きさ）を JSON に書き出す
#
#   使い方（作業用の場所で。numpy・scipy・soundfile が要る）：
#     src/ に時代の曲の wav（44.1 kHz）、sfx/ に原始の効果音の wav を置き、
#     python beats.py src/*.wav            → beats.json（拍と小節の頭）
#     python sfxinfo.py                     → sfxinfo.json（効果音の鳴り始め・大きさ）
#     python mix_genshi.py                  → genshi_mix.wav（原始の曲に効果音を重ねた物）
#     python build_title.py                 → title_jidai.wav と title_timeline.json
#     ffmpeg -i title_jidai.wav -c:a libmp3lame -b:a 128k title_jidai.mp3 → assets/music/ へ
#     title_timeline.json は js/audio/title-timeline.js に書き直す（steps・ticks・bells・booms・sections・env）
#   切り出す小節は下の ERAS（時代, 曲, 拍の名前, 始まりの小節, 終わりの小節）。曲を替えたら、ここを直して作り直す
import json, sys, numpy as np, soundfile as sf
from scipy.signal import lfilter, butter, sosfilt
SR = 44100
rng = np.random.default_rng(11)
B = json.load(open('beats.json'))

def heads(name):
    b = np.array(B[name]['beats']); return b[B[name]['down']::4]
def load(path):
    x, sr = sf.read(path); assert sr == SR; return x

# ---------- 音の大きさ（BS.1770 の LUFS） ----------
def biquad(kind, fc, G, Q):
    A = 10 ** (G / 40); w = 2 * np.pi * fc / SR; a = np.sin(w) / (2 * Q); c = np.cos(w)
    if kind == 'shelf':
        b0 = A * ((A + 1) + (A - 1) * c + 2 * np.sqrt(A) * a); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - 2 * np.sqrt(A) * a)
        a0 = (A + 1) - (A - 1) * c + 2 * np.sqrt(A) * a; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - 2 * np.sqrt(A) * a
    else:
        b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a
    return np.array([b0, b1, b2]) / a0, np.array([a0, a1, a2]) / a0
def lufs(x):
    y = x
    for k, fc, G, Q in [('shelf', 1500, 4, 1 / np.sqrt(2)), ('hp', 38, 0, 0.5)]:
        b, a = biquad(k, fc, G, Q); y = lfilter(b, a, y, axis=0)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([(y[i:i + blk] ** 2).mean(0).sum() for i in range(0, len(y) - blk, hop)])
    l = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[l > -70]; rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g = ms[(l > -70) & (l > rel)]
    return -0.691 + 10 * np.log10(g.mean())

# ---------- 作る音 ----------
def env_exp(n, tau): return np.exp(-np.arange(n) / SR / tau)
def damped(freqs, taus, amps, n, phase_rand=True):
    t = np.arange(n) / SR; out = np.zeros(n)
    for f, tau, a in zip(freqs, taus, amps):
        out += a * np.sin(2 * np.pi * f * t + (rng.random() * 6.28 if phase_rand else 0)) * np.exp(-t / tau)
    return out
def stereo(m, pan=0.0):
    l = np.sqrt(0.5 * (1 - pan)); r = np.sqrt(0.5 * (1 + pan)); return np.stack([m * l * 1.41, m * r * 1.41], 1)
def tick(hi, n=int(0.07 * SR)):
    """時計の刻み（カチ・コチ）：ごく短い雑音の打ちと、金属の小さな響き"""
    k = 1.13 if hi else 1.0
    click = rng.standard_normal(n) * env_exp(n, 0.0009)
    sos = butter(2, [1800, 9000], 'bandpass', fs=SR, output='sos'); click = sosfilt(sos, click)
    body = damped([2350 * k, 3950 * k, 6150 * k, 920 * k], [0.012, 0.008, 0.005, 0.02], [0.7, 0.45, 0.25, 0.35], n)
    s = click * 2.2 + body
    return s / np.abs(s).max()
def bell(f0, dur=6.0, bright=1.0):
    """青銅の大きな鐘：教会の鐘の部分音（ハム・基音・短三度・五度・名音…）。高い音ほど早く消える"""
    n = int(dur * SR)
    ratios = [0.5, 1.0, 1.19, 1.5, 2.0, 2.5, 2.67, 3.0, 4.2, 5.4]
    amps = [0.55, 0.8, 0.5, 0.35, 0.65, 0.25, 0.22, 0.2, 0.15 * bright, 0.1 * bright]
    taus = [3.2, 2.4, 1.9, 1.5, 1.3, 0.9, 0.8, 0.6, 0.35, 0.25]
    s = np.zeros(n)
    for r, a, tau in zip(ratios, amps, taus):
        for det in (-0.6, 0.6):   # 2 つのわずかにずれた音で、ゆっくり唸らせる
            s += a * 0.5 * np.sin(2 * np.pi * (f0 * r + det) * np.arange(n) / SR + rng.random() * 6.28) * env_exp(n, tau)
    hit = rng.standard_normal(n) * env_exp(n, 0.006)
    s += sosfilt(butter(2, [800, 6000], 'bandpass', fs=SR, output='sos'), hit) * 0.6
    return s / np.abs(s).max()
def clunk(dur=1.2):
    """巨大な歯車が一段回る「ガコン」：低い金属の打ちと、少し遅れた爪の音"""
    n = int(dur * SR)
    s = damped([165, 248, 395, 610], [0.18, 0.12, 0.08, 0.05], [1, 0.7, 0.5, 0.3], n)
    thud = sosfilt(butter(2, 400, 'lowpass', fs=SR, output='sos'), rng.standard_normal(n)) * env_exp(n, 0.04) * 3
    clack = np.zeros(n); d = int(0.035 * SR)
    c = tick(True, n - d) * 0.6; clack[d:] = c
    s = s + thud + clack
    return s / np.abs(s).max()
def impact(dur=2.0):
    """低い衝撃（下へ落ちる低い音）"""
    n = int(dur * SR); t = np.arange(n) / SR
    f = 58 * np.exp(-t * 1.2) + 32
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.6)
    return s / np.abs(s).max()
def shimmer(dur=2.4):
    """光が弾けるような高いきらめき"""
    n = int(dur * SR)
    s = sosfilt(butter(2, [5000, 14000], 'bandpass', fs=SR, output='sos'), rng.standard_normal(n)) * env_exp(n, 0.5)
    t = np.arange(n) / SR
    for f in [2637, 3136, 3520, 4186]:
        s += 0.08 * np.sin(2 * np.pi * f * t + rng.random() * 6) * np.exp(-t / 0.9) * (1 + 0.5 * np.sin(2 * np.pi * 7 * t))
    return s / np.abs(s).max()
def riser(dur):
    """吸い上がる音：帯域を上げていく雑音と、回る歯車の唸り（だんだん高く・大きく）"""
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    noise = rng.standard_normal(n); out = np.zeros(n)
    blk = 1024
    for i in range(0, n, blk):
        fc = 300 * (6000 / 300) ** u[i]
        sos = butter(2, [fc * 0.7, min(fc * 1.4, 18000)], 'bandpass', fs=SR, output='sos')
        out[i:i + blk] = sosfilt(sos, noise[i:i + blk])
    out *= (u ** 2.2)
    whine = np.sin(2 * np.pi * np.cumsum(180 * (7 ** u)) / SR) * (u ** 2) * 0.25
    rev = sosfilt(butter(2, 3000, 'highpass', fs=SR, output='sos'), rng.standard_normal(n)) * np.clip((u - 0.6) / 0.4, 0, 1) ** 3
    s = out / (np.abs(out).max() + 1e-9) + whine + rev * 0.6
    return s / np.abs(s).max()
def reverb(x, wet=0.3, size=1.0):
    out = np.zeros_like(x)
    for d, fb in [(0.0437, 0.84), (0.0533, 0.83), (0.0611, 0.82), (0.0727, 0.80)]:
        D = int(d * size * SR)
        for c in range(x.shape[1]):
            y = x[:, c].copy()
            for s in range(D, len(y), D):
                e = min(len(y), s + D); y[s:e] += fb * y[s - D:e - D]
            out[:, c] += y * 0.22
    sos = butter(1, 5000, 'lowpass', fs=SR, output='sos')
    out = sosfilt(sos, out, axis=0)
    return x * (1 - wet) + out * wet

# ---------- 組み立て ----------
TICK_HI, TICK_LO = tick(True), tick(False)
D3 = 146.83
BIG_BELL = bell(D3 / 2 * 2, 7.0)
SMALL_BELL = bell(D3 * 2, 4.0, 0.7)
CLUNK, IMPACT, SHIMMER = clunk(), impact(), shimmer()
BPM = 120.0; BEAT = 60 / BPM

total = 260.0
mix = np.zeros((int(total * SR), 2))
ticks, bells, booms, sections = [], [], [], []
def add(sig, t, gain=1.0):
    a = int(round(t * SR))
    if sig.ndim == 1: sig = stereo(sig)
    b = min(len(mix), a + len(sig)); mix[a:b] += sig[:b - a] * gain
def put_ticks(times, gains):
    for i, (t, g) in enumerate(zip(times, gains)):
        add(stereo(TICK_HI if i % 2 == 0 else TICK_LO, 0.25 if i % 2 == 0 else -0.25), t, g)
        ticks.append(round(t, 4))
def accel_times(t0, n=24, d0=BEAT, r=0.88):
    ts, t = [], t0
    for k in range(n): ts.append(t); t += d0 * r ** k
    return ts, t     # t：次（合図）の時刻
def boom(t, big=1.0):
    """合図：大きな鐘＋歯車のガコン＋低い衝撃＋きらめき（響きを付ける）"""
    n = int(7.5 * SR)
    s = np.zeros((n, 2))
    s[:len(BIG_BELL)] += stereo(BIG_BELL) * 0.75
    s[:len(CLUNK)] += stereo(CLUNK) * 0.8
    s[:len(IMPACT)] += stereo(IMPACT) * 0.9
    s[:len(SHIMMER)] += stereo(SHIMMER, 0) * 0.25
    s = reverb(s, 0.35, 1.3)
    add(s, t, 0.5 * big)
    booms.append(round(t, 4)); bells.append(round(t, 4))
def transition(t0, n=23):
    """切り替え：刻みが 0.5 秒から速くなり（23 回。合図を入れて 24 歩＝針が 3 周して真上で合図）、だんだん大きくなる。最後に合図"""
    ts, tb = accel_times(t0, n)
    gains = [0.22 + 0.3 * (k / (n - 1)) ** 1.5 for k in range(n)]
    put_ticks(ts, gains)
    r = riser(tb - t0)
    add(stereo(r), t0, 0.16)
    return tb

def segment(path, name, b0, b1, fade_in=0.01, fade_out=1.6, until_end=False):
    x = load(path); H = heads(name)
    s = H[b0]; e = len(x) / SR if until_end else H[b1]
    seg = x[int(s * SR):int(e * SR)].copy()
    a = int(fade_in * SR); seg[:a] *= np.linspace(0, 1, a)[:, None]
    g = 10 ** ((-16.0 - lufs(seg)) / 20); seg *= g
    return seg, s, [float(h - s) for h in H[b0:b1 + 1] if h - s <= len(seg) / SR]

ERAS = [
    # 時代, 曲, 拍の名前, 始まりの小節, 終わりの小節
    ('genshi', 'genshi_mix.wav', '原始人bgm.wav', 91, 110, False),
    ('chusei', 'src/中世時代bgm.wav', '中世時代bgm.wav', 80, 96, False),
    ('kinsei', 'src/近世時代bgm.wav', '近世時代bgm.wav', 80, 96, False),
    ('gendai', 'src/x1_1444.wav', 'x1_1444.wav', 79, 95, False),
    ('mirai', 'src/x2_1446.wav', 'x2_1446.wav', 88, 104, True),
]
# 序：静かな刻み 8 回（最初に小さな鐘）→ 速くなる 24 回 → 合図
t = 0.0
steady = [t + k * BEAT for k in range(8)]
put_ticks(steady, [0.28] * 8)
add(stereo(SMALL_BELL), 0.0, 0.18); bells.append(0.0)
sections.append(dict(kind='title', t0=0.0))
t = transition(steady[-1] + BEAT, 24)   # 序：静かな 8 回 + 速くなる 24 回 → 合図（32 歩目で真上）
extra = {}
for i, (era, path, name, b0, b1, until_end) in enumerate(ERAS):
    boom(t, 1.0 if i < len(ERAS) - 1 else 1.1)
    sections[-1]['t1'] = round(t, 4)
    seg, src0, bars = segment(path, name, b0, b1, until_end=until_end)
    L = len(seg) / SR
    fo = int(1.6 * SR); seg[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
    add(seg, t, 1.0)
    sec = dict(kind='era', era=era, t0=round(t, 4), t1=round(t + L, 4), src=name, src_t0=round(float(src0), 3), bars=[round(t + b, 4) for b in bars])
    if era == 'genshi':   # 原始：マンモスの雄叫び（小節 92）と、炎が燃え上がる（小節 94）
        H = heads(name)
        sec['mammoth'] = round(t + float(H[92] - src0), 4); sec['fire'] = round(t + float(H[94] - src0), 4)
    sections.append(sec)
    end = t + L
    sections.append(dict(kind='title', t0=round(end - 0.6, 4)))
    if i < len(ERAS) - 1:
        t = transition(end - 0.6)
    else:
        # 終：最後の鐘と、静かな刻み 7 回（合図と合わせて 8 歩。曲の頭の刻みで、針がちょうど真上に戻る）
        t = end - 0.4
        add(stereo(SMALL_BELL), t, 0.22); bells.append(round(t, 4))
        put_ticks([t + BEAT + k * BEAT for k in range(7)], [0.28] * 7)
        t += 8 * BEAT
sections[-1]['t1'] = round(t, 4)
mix = mix[:int(t * SR)]
dur = len(mix) / SR
# 全体の大きさを −16 LUFS に、山は −1.5 dB まで（ゆるい頭打ち）
g = 10 ** ((-16.0 - lufs(mix)) / 20); mix *= g
pk = np.abs(mix).max()
if pk > 0.84:
    mix = np.tanh(mix / 0.84) * 0.84
sf.write('title_jidai.wav', mix, SR)
# 大きさの曲線（10 回/秒、0〜1）：背景の明るさ・炎の高さに使う
w = SR // 10
r = np.sqrt((mix[:len(mix) // w * w].mean(1).reshape(-1, w) ** 2).mean(1))
db = 20 * np.log10(r + 1e-9); lo, hi = np.percentile(db, 5), np.percentile(db, 99)
envv = np.clip((db - lo) / (hi - lo), 0, 1)
steps = sorted(ticks + booms)   # 針が 1 歩（45°）進む時刻：刻みと合図
assert len(steps) % 8 == 0 and all(steps.index(b) % 8 == 0 for b in booms), (len(steps), [steps.index(b) for b in booms])
TL = dict(duration=round(dur, 4), bpm=BPM, steps=steps, ticks=ticks, bells=bells, booms=booms, sections=sections, env=[round(float(v), 2) for v in envv])
json.dump(TL, open('title_timeline.json', 'w'))
print('長さ', round(dur, 2), '秒  LUFS', round(lufs(mix), 2), ' 山', round(20 * np.log10(np.abs(mix).max()), 2), 'dB')
for s in sections:
    print(' ', s['kind'], s.get('era', ''), round(s['t0'], 2), '→', round(s['t1'], 2), f"（{s['t1'] - s['t0']:.1f} 秒）", '元の曲の', s.get('src_t0', ''), '秒から' if 'src_t0' in s else '', ('マンモス ' + str(s['mammoth']) + ' 炎 ' + str(s['fire'])) if 'mammoth' in s else '')
print('刻み', len(ticks), '鐘', len(bells), '合図', booms)
