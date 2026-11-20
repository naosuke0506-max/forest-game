import glob, numpy as np, soundfile as sf, json
out = {}
for p in sorted(glob.glob('sfx/*.wav')):
    x, sr = sf.read(p); m = np.abs(x).max(1)
    win = int(sr * 0.02)
    env = np.sqrt(np.convolve((x ** 2).mean(1), np.ones(win) / win, 'same'))
    peak = env.max()
    on = int(np.argmax(env > peak * 0.1)) / sr          # 鳴り始め（一番大きい所の 1 割を越えた所）
    pk = int(np.argmax(env)) / sr                        # 一番大きい所
    rms = 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)
    # 中身のある所の長さ（一番大きい所の 3% を越えている時間）
    act = (env > peak * 0.03).sum() / sr
    out[p] = dict(dur=len(x) / sr, on=on, peak=pk, rms=rms, pdb=20 * np.log10(peak + 1e-9), act=act)
    print(f"{p[4:]:<16} 長さ {len(x)/sr:5.2f}s  鳴り始め {on:5.2f}s  山 {pk:5.2f}s  鳴っている {act:5.2f}s  平均 {rms:6.1f} dB  山 {20*np.log10(peak):6.1f} dB")
json.dump(out, open('sfxinfo.json', 'w'), ensure_ascii=False)
