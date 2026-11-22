# 大廳の曲（新しい中世の曲）から 8 小節を切り出し、継ぎ目なく繰り返せる形にする（2026-11-22）
#   使い方（作業用の場所で。numpy・scipy・soundfile が要る）：python cut_hall_loop.py src/中世時代bgm.wav beats.json 中世時代bgm.wav 88 hall_cut.wav
#     → 音の大きさを −17.4 LUFS にそろえて MP3（128 kbps）にし、assets/music/hall_medieval.mp3 へ。長さ（hall_cut.wav.json の loop）を js/audio/music.js の loop に書く
#   ・曲の速さが少しずつ変わる（120 → 126 拍/分）ので、速さからではなく、測った小節の頭（beats.json）から切る
#   ・頭と終わりは、その近くの拍の立ち上がりに合わせて細かく直す（±20 ms）
#   ・終わりから頭へは、原曲の続き（8 小節後）から頭へ 0.25 秒で入れ替える（継ぎ目で音が途切れない）
#   ・ファイルは「8 小節 + 頭の 1 秒」にする（0.5 秒から 8 小節を繰り返す）
import sys, json, numpy as np, soundfile as sf
from scipy.signal import stft
src, beatsj, name, A, out = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
x, sr = sf.read(src); mono = x.mean(1)
B = json.load(open(beatsj))[name]; beats = np.array(B['beats']); heads = beats[B['down']::4]
hop = 64
f, t, Z = stft(mono, sr, nperseg=1024, noverlap=1024 - hop); M = np.log1p(np.abs(Z) * 20); fps = sr / hop
d = np.maximum(np.diff(M, axis=1, prepend=M[:, :1]), 0).sum(0)
def refine(i):
    # 小節 i の頭の前後の拍（測った拍）に、立ち上がりが一番そろうずれ
    k0 = B['down'] + 4 * i
    near = beats[max(0, k0 - 4):k0 + 5]
    best = None
    for off in np.arange(-0.02, 0.0201, 0.0005):
        s = sum(d[int((b + off) * fps)] for b in near)
        if best is None or s > best[0]: best = (s, off)
    return heads[i] + best[1], best[1]
t0, o0 = refine(A); t1, o1 = refine(A + 8)
L = t1 - t0
print('頭', round(t0, 4), '秒（ずれ', round(o0 * 1000, 1), 'ms）終わり', round(t1, 4), '秒（ずれ', round(o1 * 1000, 1), 'ms）8 小節', round(L, 5), '秒 速さ', round(32 * 60 / L, 3))
Ls = int(round(L * sr)); X = int(0.25 * sr); s0 = int(round(t0 * sr))
Aud = x[s0:s0 + Ls + X]
loop = Aud[:Ls].copy()
w = np.sin(np.linspace(0, np.pi / 2, X))[:, None]
loop[:X] = Aud[Ls:Ls + X] * np.cos(np.linspace(0, np.pi / 2, X))[:, None] + Aud[:X] * w
ext = np.concatenate([loop, loop[:sr]])
sf.write(out, ext, sr, subtype='PCM_16')
json.dump({'start': t0, 'end': t1, 'loop': L, 'samples': Ls, 'bpm': 32 * 60 / L}, open(out + '.json', 'w'))
