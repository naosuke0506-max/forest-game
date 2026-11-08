#!/usr/bin/env python3
# 大廳の BGM を作る（開発用の道具。numpy だけで音を作り、WAV に書き出す。MP3 にするのは ffmpeg）
#   利用者の指示：リズムの良い、ノリやすい曲。「ダァーン、ダラダダァ〜ン」が主役のリズム
#   毎小節：1 拍目に「ダァーン」（大太鼓と和音）→ 16 分音符 3 つの「ダラダ」（小太鼓・ベースが駆け上がる）→ 3 拍目に「ダァ〜ン」（長く伸ばす）
#   テンポ 104・ニ短調・32 小節（約 74 秒）で切れ目なく繰り返す（残響の尾は曲の頭に重ねる）
#   前奏 4（太鼓）→ A 8（金管の和音・パッド）→ B 8（弦の刻み・笛の旋律）→ A' 8（旋律の変奏）→ 繋ぎ 4（静かになり、小太鼓で盛り上げて頭へ）
# 使い方：python3 tools/music/compose_hall.py 出力.wav
import sys
import wave
import numpy as np

SR = 44100
BPM = 104
BEAT = 60 / BPM
S16 = BEAT / 4
BAR = BEAT * 4
BARS = 32
LEN = int(BAR * BARS * SR)
rng = np.random.default_rng(2026)

mix = np.zeros((2, LEN + SR * 4))
send = np.zeros((2, LEN + SR * 4))   # 残響へ送る分


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def place(sig, t, pan=0.0, gain=1.0, rev=0.25):
    """音を時刻 t（秒）に置く。pan：-1 左〜1 右"""
    i = int(t * SR)
    n = min(len(sig), mix.shape[1] - i)
    if n <= 0:
        return
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    s = sig[:n] * gain
    mix[0, i:i + n] += s * l
    mix[1, i:i + n] += s * r
    send[0, i:i + n] += s * l * rev
    send[1, i:i + n] += s * r * rev


def env(n, a, d, s=0.0, r=None, dur=None):
    """立ち上がり a 秒・減衰 d 秒で s へ・dur 秒で離して r 秒で消える"""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    if dur is not None and r:
        rel = np.clip(1 - (t - dur) / r, 0, 1)
        e = np.where(t > dur, e * rel, e)
    return e


def sweep(f0, f1, n, k=18.0):
    """f0 から f1 へ下がる高さ（指数）の位相"""
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * k)
    return 2 * np.pi * np.cumsum(f) / SR


def noise(n):
    return rng.standard_normal(n)


def spectral(sig, shape):
    """周波数ごとの倍率（shape(f)）を掛ける（静的なフィルター）"""
    F = np.fft.rfft(sig)
    f = np.fft.rfftfreq(len(sig), 1 / SR)
    return np.fft.irfft(F * shape(f), len(sig))


def lowpass(sig, fc, order=2):
    return spectral(sig, lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order)))


def bandpass(sig, lo, hi):
    return spectral(sig, lambda f: 1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4) / np.sqrt(1 + (f / hi) ** 4))


_TABLES = {}


def saw(freq, n, detune=0.0, harm=None):
    """帯域を限った鋸歯状の波（倍音 K 本を足した 1 周期の表を作り、位相で引く。速い）"""
    f = freq * (1 + detune)
    K = harm or max(1, min(32, int(8000 / f)))
    if K not in _TABLES:
        x = np.arange(4096) / 4096
        _TABLES[K] = sum(np.sin(2 * np.pi * k * x) / k for k in range(1, K + 1))
    tab = _TABLES[K]
    ph = (f * np.arange(n) / SR + rng.random()) % 1.0
    return np.interp(ph * 4096, np.arange(4096), tab, period=4096) * 0.6


# ---------------- 打楽器 ----------------
def taiko(strength=1.0):
    # 大太鼓：iPad の小さなスピーカーでも聞こえるよう、胴の鳴り（80〜200Hz）と皮を打つ音（200Hz〜1.5kHz）を強く
    n = int(SR * 1.1)
    body = (0.7 * np.sin(sweep(200, 82, n, 14)) * env(n, 0.003, 0.30)
            + 0.55 * np.sin(sweep(430, 175, n, 16)) * env(n, 0.002, 0.16)
            + 0.25 * np.sin(sweep(700, 300, n, 20)) * env(n, 0.002, 0.08))
    skin = bandpass(noise(n), 200, 1500) * env(n, 0.001, 0.05) * 1.1
    return np.tanh((body + skin) * 1.5 * strength) * 0.9


def tom(pitch):
    n = int(SR * 0.45)
    body = np.sin(sweep(pitch * 1.7, pitch, n, 22)) * env(n, 0.002, 0.16)
    hit = bandpass(noise(n), 300, 3000) * env(n, 0.001, 0.02) * 0.5
    return np.tanh((body + hit) * 1.3) * 0.75


def kick():
    n = int(SR * 0.4)
    body = np.sin(sweep(160, 46, n, 30)) * env(n, 0.002, 0.16)
    click = bandpass(noise(n), 1500, 6000) * env(n, 0.0005, 0.006) * 0.4
    return np.tanh((body + click) * 1.6) * 0.85


def snare():
    n = int(SR * 0.35)
    tone = np.sin(sweep(260, 190, n, 25)) * env(n, 0.001, 0.05) * 0.5
    rattle = bandpass(noise(n), 1500, 9000) * env(n, 0.001, 0.12)
    return np.tanh((tone + rattle) * 1.2) * 0.55


def crash():
    n = int(SR * 2.2)
    return bandpass(noise(n), 3000, 15000) * env(n, 0.002, 0.7) * 0.28


def hat(open_=False):
    n = int(SR * (0.35 if open_ else 0.08))
    return bandpass(noise(n), 6500, 16000) * env(n, 0.0005, 0.12 if open_ else 0.022) * 0.35


# ---------------- 音の高さのある楽器 ----------------
def bass(note, dur):
    n = int(SR * (dur + 0.2))
    f = midi(note)
    t = np.arange(n) / SR
    s = 0.45 * np.sin(2 * np.pi * f * t) + 0.7 * saw(f, n, harm=16)   # 倍音を多めに（小さなスピーカーでも音の高さが分かる）
    s = lowpass(s, 1600)
    return np.tanh(s * 1.5) * env(n, 0.006, 0.6, 0.55, 0.12, dur) * 0.5


def brass(notes, dur):
    """金管の和音（鋸歯を少しずらして重ね、明るい音と暗い音を時間で混ぜて、吹き込む感じを出す）"""
    n = int(SR * (dur + 0.35))
    raw = np.zeros(n)
    for nt in notes:
        for dt in (-0.004, 0.0, 0.005):
            raw += saw(midi(nt), n, dt)
    bright, dark = lowpass(raw, 2600, 2), lowpass(raw, 700, 2)
    t = np.arange(n) / SR
    k = np.exp(-t / 0.18)   # 吹いた瞬間は明るく、すぐ暗くなる
    s = bright * k + dark * (1 - k)
    return s * env(n, 0.025, 0.5, 0.6, 0.25, dur) * 0.2


def pad(notes, dur):
    n = int(SR * (dur + 1.0))
    raw = np.zeros(n)
    for nt in notes:
        for dt in (-0.006, 0.0, 0.007):
            raw += saw(midi(nt), n, dt, harm=12)
    return lowpass(raw, 1800, 2) * env(n, 0.6, 2.0, 0.8, 0.9, dur) * 0.045


def string_stac(note):
    n = int(SR * 0.22)
    raw = saw(midi(note), n, 0.0) + saw(midi(note), n, 0.004)
    return lowpass(raw, 3800, 2) * env(n, 0.006, 0.07) * 0.2


def flute(note, dur):
    """笛（揺れのある正弦波と息の音）"""
    n = int(SR * (dur + 0.3))
    t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.15) / 0.3, 0, 1)
    ph = 2 * np.pi * np.cumsum(midi(note) * vib) / SR
    s = np.sin(ph) + 0.28 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    breath = bandpass(noise(n), 1500, 7000) * 0.05
    return (s + breath) * env(n, 0.04, 0.9, 0.75, 0.15, dur) * 0.3


# ---------------- 曲 ----------------
# 和音（根音・3 音・5 音の MIDI。ニ短調）。4 小節で一回り
CH = {
    'Dm': (50, 53, 57), 'Bb': (46, 50, 53), 'F': (53, 57, 60), 'C': (48, 52, 55),
    'Gm': (55, 58, 62), 'A': (45, 49, 52),
}
PROG_A = ['Dm', 'Bb', 'F', 'C']
PROG_B = ['Gm', 'Dm', 'Bb', 'A']
# ベースの「ダラダ」で駆け上がる音（根音から：短 3 度・4 度 → 3 拍目は 5 度）
RISE = {'Dm': (0, 3, 5, 7), 'Bb': (0, 4, 5, 7), 'F': (0, 4, 5, 7), 'C': (0, 4, 5, 7), 'Gm': (0, 3, 5, 7), 'A': (0, 4, 5, 7)}
# 笛の旋律（小節ごと：1 拍目の長い音・ダラダ・3 拍目の長い音）
MEL_B = [
    (74, (76, 77, 79), 81), (82, (81, 79, 77), 74), (79, (77, 79, 81), 82), (85, (81, 79, 76), 73),
    (74, (77, 81, 84), 86), (86, (84, 82, 81), 77), (79, (81, 82, 84), 86), (85, (88, 86, 85), 81),
]
MEL_A2 = [
    (81, (79, 77, 76), 74), (77, (79, 81, 82), 81), (77, (76, 77, 79), 81), (79, (77, 76, 74), 76),
    (81, (82, 84, 86), 86), (86, (84, 82, 81), 82), (84, (82, 81, 79), 81), (81, (79, 77, 76), 74),
]


def section_of(bar):
    if bar < 4:
        return 'intro'
    if bar < 12:
        return 'A'
    if bar < 20:
        return 'B'
    if bar < 28:
        return 'A2'
    return 'break'


for bar in range(BARS):
    t0 = bar * BAR
    sec = section_of(bar)
    prog = PROG_B if sec == 'B' else PROG_A
    chord = prog[bar % 4]
    root, third, fifth = CH[chord]
    T = lambda s: t0 + s * S16   # 16 分音符の位置 → 秒

    # --- 主役のリズム：ダァーン（0）・ダラダ（5・6・7）・ダァ〜ン（8） ---
    big = 0.8 if sec in ('intro', 'break') else 1.0
    place(taiko(big), T(0), -0.1, 0.95, 0.3)
    place(taiko(big), T(8), 0.1, 1.0, 0.3)   # ダァ〜ン：1 拍目と同じ重み
    for k, s in enumerate((5, 6, 7)):
        place(tom(300 - k * 40), T(s), -0.35 + k * 0.35, 0.85, 0.2)   # ダラダ：高い方から（はっきり聞こえる高さ）

    # --- 刻み（ノリ）：前奏と繋ぎの前半は軽く ---
    light = sec == 'intro' or (sec == 'break' and bar < 31)
    for s in range(16):
        if light and s % 2:
            continue
        acc = 1.0 if s % 4 == 2 else 0.6 if s % 2 == 0 else 0.4
        place(hat(open_=(s == 14 and not light)), T(s), 0.35, acc * 0.9, 0.05)
    if not light:
        place(kick(), T(0), 0, 0.55, 0.05)
        place(kick(), T(8), 0, 0.55, 0.05)
        place(kick(), T(10), 0, 0.35, 0.05)
        place(snare(), T(4), 0.05, 0.85, 0.22)
        place(snare(), T(12), 0.05, 0.75, 0.22)
    if sec in ('A', 'B', 'A2') and bar % 4 == 0:   # 4 小節ごとのシンバル
        place(crash(), T(0), -0.3, 0.8, 0.35)
    if bar == BARS - 1:   # 頭へ戻る前の小太鼓の連打
        for s in range(8, 16):
            place(snare(), T(s), 0.05, 0.4 + 0.07 * (s - 8), 0.2)

    # --- ベース：ダァーン（根音）・ダラダで駆け上がり・ダァ〜ン（5 度） ---
    if bar >= 2:
        r = RISE[chord]
        b = root - 12
        place(bass(b + r[0], 5 * S16 * 0.95), T(0), 0, 1.0, 0.05)
        for k, s in enumerate((5, 6, 7)):
            place(bass(b + r[k + 1] - (12 if r[k + 1] > 5 else 0), S16 * 0.8), T(s), 0, 0.8, 0.05)
        place(bass(b + 7 - 12, 7 * S16), T(8), 0, 1.0, 0.05)

    # --- 金管の和音：ダァーンとダァ〜ンに合わせて ---
    if sec in ('A', 'B', 'A2'):
        v = [root, third + 12, fifth, root + 12]
        place(brass(v, 4 * S16), T(0), -0.25, 1.0, 0.35)
        place(brass([n + 0 for n in v], 7 * S16), T(8), 0.25, 0.95, 0.35)
        place(pad([root + 12, third + 12, fifth + 12], BAR), T(0), 0.0, 1.0, 0.6)

    # --- 弦の刻み（16 分音符。B と A'） ---
    if sec in ('B', 'A2'):
        pat = [root + 12, fifth + 12, root + 24, fifth + 12]
        for s in range(16):
            if s in (5, 6, 7):
                continue   # ダラダの所は空けて、リズムを立たせる
            place(string_stac(pat[s % 4]), T(s), 0.45 if s % 2 else -0.45, 0.8 if s % 4 == 0 else 0.55, 0.25)

    # --- 笛の旋律（B・A'） ---
    mel = MEL_B if sec == 'B' else MEL_A2 if sec == 'A2' else None
    if mel:
        a, (p1, p2, p3), b2 = mel[(bar - (12 if sec == 'B' else 20)) % 8]
        place(flute(a, 4 * S16), T(0), 0.1, 1.0, 0.45)
        for k, s in enumerate((5, 6, 7)):
            place(flute((p1, p2, p3)[k], S16 * 0.85), T(s), 0.1, 0.85, 0.45)
        place(flute(b2, 7 * S16), T(8), 0.1, 1.0, 0.45)

    # --- 繋ぎ：パッドだけで静かに ---
    if sec == 'break':
        place(pad([root, third + 12, fifth + 12], BAR), T(0), 0.0, 1.3, 0.7)

# ---------------- 残響（雑音を弱めた響きを畳み込む）と、切れ目なく繰り返す仕上げ ----------------
ir_n = int(SR * 2.4)
t = np.arange(ir_n) / SR
ir = np.stack([noise(ir_n) * np.exp(-t / 0.55), noise(ir_n) * np.exp(-t / 0.55)]) * 0.012
ir = np.stack([lowpass(ir[0], 5000), lowpass(ir[1], 5000)])
N = 1 << int(np.ceil(np.log2(send.shape[1] + ir_n)))
wet = np.stack([np.fft.irfft(np.fft.rfft(send[c], N) * np.fft.rfft(ir[c], N), N)[:send.shape[1]] for c in range(2)])
out = mix + wet
# 曲の終わりからはみ出した響きを、頭に重ねる（繰り返したときに切れない）
tail = out[:, LEN:]
out = out[:, :LEN].copy()
out[:, :tail.shape[1]] += tail
# 仕上げ：一番低い所（小さなスピーカーでは鳴らず、濁るだけ）を削り、100Hz より下を控えめに、1〜4kHz を少し持ち上げる
def master_eq(f):
    hp = 1 / np.sqrt(1 + (48 / np.maximum(f, 1)) ** 6)
    low = 0.6 + 0.4 / np.sqrt(1 + (110 / np.maximum(f, 1)) ** 4)
    pres = 1 + 0.35 * np.exp(-((np.log2(np.maximum(f, 1) / 2200)) ** 2) / 1.2)
    return hp * low * pres
out = np.stack([spectral(out[c], master_eq) for c in range(2)])
out = np.tanh(out * 1.2) / np.tanh(1.2)
out *= 0.89 / np.max(np.abs(out))

pcm = (out.T * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'hall.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'{BARS} 小節・{LEN / SR:.1f} 秒を書き出した')
