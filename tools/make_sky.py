"""空の写真（HDR）から、ゲーム用の軽い空のファイルを作る（開発用の道具。ゲームには含まれない）

    python3 tools/make_sky.py <元の .hdr> <出力フォルダ> <名前>

作るもの
  <名前>_light.f16   照明用：128×64 の半精度浮動小数（RGBA, リトルエンディアン）。
                     ・太陽は明るさを抑えてある（太陽の光は、影を落とす太陽光が受け持つため、二重に数えない）
                     ・地平線より下は「日の当たった森の地面」の照り返しに置き換えてある
                       （空だけの写真の下半分は青白く、そのままだと照り返しまで青くなるため）
  <名前>_sky.webp    背景用：2048×1024 の画像。明るさを skyScale で割って 0〜1 に収め、sRGB で保存
  <名前>.json        太陽の位置（UV）、地平線の色、背景の明るさの倍率など

必要なもの：Python 3、numpy、Pillow（WebP 対応版）
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def read_hdr(path):
    """Radiance .hdr（RGBE、新形式のランレングス圧縮）を float32 の (H, W, 3) で読む"""
    data = Path(path).read_bytes()
    pos = 0
    while True:  # ヘッダーは空行で終わる
        end = data.index(b'\n', pos)
        line = data[pos:end]
        pos = end + 1
        if line == b'':
            break
    end = data.index(b'\n', pos)
    dims = data[pos:end].split()
    pos = end + 1
    assert dims[0] == b'-Y' and dims[2] == b'+X', f'未対応の向き: {dims}'
    h, w = int(dims[1]), int(dims[3])

    rgbe = np.zeros((h, w, 4), dtype=np.uint8)
    for y in range(h):
        if data[pos] != 2 or data[pos + 1] != 2:
            raise ValueError('旧形式の .hdr には未対応')
        pos += 4
        for c in range(4):
            x = 0
            while x < w:
                n = data[pos]
                pos += 1
                if n > 128:  # 同じ値の繰り返し
                    n -= 128
                    rgbe[y, x:x + n, c] = data[pos]
                    pos += 1
                else:        # そのままの値の並び
                    rgbe[y, x:x + n, c] = np.frombuffer(data, np.uint8, n, pos)
                    pos += n
                x += n
    e = rgbe[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0).astype(np.float32)
    return rgbe[..., :3].astype(np.float32) * scale[..., None]


def downsample(img, w, h):
    """面積平均で縮小（明るさの総量を保つ）"""
    H, W, _ = img.shape
    return img.reshape(h, H // h, w, W // w, 3).mean(axis=(1, 3))


def luminance(img):
    return img[..., 0] * 0.2126 + img[..., 1] * 0.7152 + img[..., 2] * 0.0722


def to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def main(src, out_dir, name):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    hdr = read_hdr(src)
    H, W, _ = hdr.shape
    lum = luminance(hdr)

    # 太陽：上半分で最も明るい所（少しぼかしてから探す）
    small = downsample(hdr, W // 8, H // 8)
    sl = luminance(small)
    sl[sl.shape[0] // 2:, :] = 0
    sy, sx = np.unravel_index(np.argmax(sl), sl.shape)
    sun_u = (sx + 0.5) / sl.shape[1]
    sun_v = (sy + 0.5) / sl.shape[0]  # 0 = 真上、0.5 = 地平線

    # 空（太陽を除く）の明るさの目安：上半分の 99 パーセンタイル
    sky_ref = float(np.percentile(lum[: H // 2], 99.0))
    sky_scale = sky_ref

    # 照明用：128×64。太陽の周りは空の明るさの目安までに抑える
    LW, LH = 128, 64
    light = downsample(hdr, LW, LH)
    ll = luminance(light)
    cap = sky_ref * 1.5
    k = np.where(ll > cap, cap / np.maximum(ll, 1e-6), 1.0)
    light = light * k[..., None]

    # 地面からの照り返し：上半分（太陽込み）から地面が受ける光の量 E を求め、
    # 森の地面の反射率（暗い茶色）を掛けて、拡散反射の明るさ E * albedo / π にする
    rows = (np.arange(H) + 0.5) / H
    elev = (0.5 - rows) * np.pi                     # 仰角
    cos_t = np.clip(np.sin(elev), 0, None)          # 天頂からの角度の cos
    d_omega = (np.pi / H) * (2 * np.pi / W) * np.cos(elev)
    E = (hdr * (cos_t * d_omega)[:, None, None]).sum(axis=(0, 1))
    albedo = np.array([0.10, 0.09, 0.06], np.float32)
    ground = albedo * E / np.pi
    lv = (np.arange(LH) + 0.5) / LH
    t = np.clip((lv - 0.5) / 0.04, 0, 1)[:, None, None]  # 地平線の少し下でなめらかに切り替える
    light = light * (1 - t) + ground[None, None, :] * t

    # 背景と同じく skyScale で割っておく：ゲームでは skyboxIntensity（= skyScale）が
    # 背景と照明の両方に掛かるので、両方とも写真どおりの明るさに戻る
    light = light / sky_scale
    rgba = np.concatenate([light, np.ones((LH, LW, 1), np.float32)], axis=2).astype('<f2')

    # 太陽と空の光の比：水平な地面が受ける光の量を、太陽の分と空の分に分ける
    sky_only = hdr.copy()
    sl_full = luminance(sky_only)
    kk = np.where(sl_full > cap, cap / np.maximum(sl_full, 1e-6), 1.0)
    sky_only = sky_only * kk[..., None]
    E_sky = (sky_only * (cos_t * d_omega)[:, None, None]).sum(axis=(0, 1))
    E_sun = E - E_sky
    sun_elev = (0.5 - sun_v) * np.pi
    sun_normal = float(luminance(E_sun[None, None, :])[0, 0]) / max(np.sin(sun_elev), 1e-3)
    (out / f'{name}_light.f16').write_bytes(rgba.tobytes())

    # 背景用：2048×1024 の画像。skyScale で割って 0〜1 に収める
    disp = to_srgb(hdr / sky_scale)
    Image.fromarray((disp * 255 + 0.5).astype(np.uint8)).save(out / f'{name}_sky.webp', quality=85, method=6)

    # 地平線のすぐ上（v = 0.44〜0.5）の平均色：霧の色の元にする
    horizon = hdr[int(H * 0.44): H // 2].reshape(-1, 3).mean(axis=0)

    meta = {
        'source': Path(src).name,
        'sunU': round(float(sun_u), 4),
        'sunV': round(float(sun_v), 4),
        'skyScale': round(sky_scale, 5),
        'horizonLinear': [round(float(c), 5) for c in horizon],
        'lightSize': [LW, LH],
        'groundLinear': [round(float(c), 5) for c in ground],
        'sunIrradiance': round(sun_normal, 4),        # 太陽に正対した面が受ける光（写真の明るさの単位）
        'skyIrradiance': round(float(luminance(E_sky[None, None, :])[0, 0]), 4),  # 水平な地面が空から受ける光
        'sunColor': [round(float(c), 4) for c in (E_sun / max(E_sun.max(), 1e-6))],
    }
    (out / f'{name}.json').write_text(json.dumps(meta, indent=2) + '\n')
    print(json.dumps(meta, indent=2))
    for f in sorted(out.glob(f'{name}*')):
        print(f'{f.name}  {f.stat().st_size // 1024}KB')


if __name__ == '__main__':
    main(*sys.argv[1:4])
