# 拍を 1 つずつ追う（動的計画法。速さが少しずつ変わっても追える）。小節の頭は、低音の強さで 4 通りから選ぶ
import sys, json, numpy as np, soundfile as sf
from scipy.signal import stft

def track(path, bpm0=120.0, tight=300.0):
    x, sr = sf.read(path); mono = x.mean(1)
    hop = 256
    f, t, Z = stft(mono, sr, nperseg=2048, noverlap=2048 - hop)
    M = np.abs(Z); L = np.log1p(M * 50)
    fps = sr / hop
    e = np.maximum(np.diff(L, axis=1, prepend=L[:, :1]), 0).sum(0)
    e = np.maximum(e - np.convolve(e, np.ones(64) / 64, 'same'), 0)
    e = e / (e.std() + 1e-9)
    p = 60 / bpm0 * fps
    n = len(e)
    score = e.copy(); back = -np.ones(n, int)
    lo, hi = int(p * 0.8), int(p * 1.25)
    taus = np.arange(lo, hi + 1)
    pen = -tight * np.log(taus / p) ** 2
    for i in range(hi, n):
        cand = score[i - taus] + pen
        k = np.argmax(cand)
        score[i] = e[i] + cand[k]; back[i] = i - taus[k]
    i = int(np.argmax(score[-hi:])) + n - hi
    beats = []
    while i >= 0:
        beats.append(i); i = back[i]
    beats = np.array(beats[::-1]) / fps
    # 小節の頭：低音（40〜160 Hz）の立ち上がりが強い拍の並び
    b = (f >= 40) & (f < 160)
    lowe = np.maximum(np.diff(L[b], axis=1, prepend=L[b][:, :1]), 0).sum(0)
    idx = np.clip(np.round(beats * fps).astype(int), 0, n - 1)
    lows = lowe[idx]
    off = int(np.argmax([lows[k::4].mean() for k in range(4)]))
    return dict(beats=beats.round(4).tolist(), down=off, sr=sr)

if __name__ == '__main__':
    out = {}
    for path in sys.argv[1:]:
        r = track(path)
        bt = np.array(r['beats'])
        ibi = np.diff(bt)
        loc = 60 / np.convolve(ibi, np.ones(16) / 16, 'valid')
        print(path.split('/')[-1], '拍', len(bt), '最初', bt[0], '小節の頭のずれ', r['down'],
              '速さ（16 拍ごと）', ' '.join(f"{v:.1f}" for v in loc[::32]))
        out[path.split('/')[-1]] = r
    json.dump(out, open('beats.json', 'w'))
