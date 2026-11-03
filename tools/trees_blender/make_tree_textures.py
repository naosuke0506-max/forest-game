"""木の画像をゲーム用に作る（開発用の道具）

    python3 tools/trees_blender/make_tree_textures.py <葉の房の画像のフォルダ> <樹皮の写真のフォルダ> <出力フォルダ>

葉の房（make_leaf_atlas.py で描いたもの）：透明な所に周りの色をにじませてから WebP にする
  （遠くで画像が縮むと、透明な所の黒が混ざって葉の縁が黒くなるため）
樹皮（Poly Haven, CC0 の写真）：512×512 の WebP。シラカバは明るい樹皮が無いので、プラタナスの樹皮を白っぽくして作る
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image


def box_blur(x, r):
    """箱型のぼかし（半径 r 画素）。縦と横に分けて、累積和で計算する"""
    k = 2 * r + 1
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(x, pad, mode='edge'), axis=axis)
        x = (np.take(c, range(k, c.shape[axis]), axis=axis) - np.take(c, range(0, c.shape[axis] - k), axis=axis)) / k
    return x

leaf_dir, bark_dir, out = map(Path, sys.argv[1:4])
out.mkdir(parents=True, exist_ok=True)

def bleed(img):
    """透明な所に、近くの不透明な色をにじませる（色だけ。透明さはそのまま）"""
    a = np.asarray(img.split()[3], np.float32) / 255
    rgb = np.asarray(img.convert('RGB'), np.float32)
    acc = rgb * a[..., None]
    w = a.copy()
    filled = rgb * (a[..., None] > 0.5)
    known = a > 0.5
    cur_rgb, cur_w = acc, w
    for r in (2, 4, 8, 16, 32, 64):
        blur = lambda x: box_blur(x, r)
        s = np.stack([blur(cur_rgb[..., c]) for c in range(3)], -1)
        ww = blur(cur_w)
        fill = s / np.maximum(ww[..., None], 1e-4)
        m = (~known) & (ww > 1e-3)
        filled[m] = fill[m]
        known = known | m
    res = np.concatenate([np.clip(filled, 0, 255), (a * 255)[..., None]], -1).astype(np.uint8)
    return Image.fromarray(res, 'RGBA')

for kind in ('broad', 'needle'):
    img = Image.open(leaf_dir / f'leaves_{kind}.png').convert('RGBA')
    bleed(img).save(out / f'leaves_{kind}.webp', quality=88, alpha_quality=95, method=6)
    print('葉', kind, img.size)
# 地面の草（make_grass_atlas.py で描いたもの）
if (leaf_dir / 'grass.png').exists():
    img = Image.open(leaf_dir / 'grass.png').convert('RGBA')
    bleed(img).save(out / 'grass.webp', quality=88, alpha_quality=95, method=6)
    print('草', img.size)

BARK = {'oak': 'jolcham_oak_bark_01', 'fir': 'bark_brown_02', 'pine': 'pine_bark', 'dead': 'bark_brown_01', 'birch': 'bark_platanus'}
for name, src in BARK.items():
    img = Image.open(bark_dir / f'{src}.jpg').convert('RGB').resize((512, 512), Image.LANCZOS)
    if name == 'birch':
        # 白い樹皮に、ところどころ暗い横すじ：明るさを持ち上げ、色を抜いて少し青白く
        g = np.asarray(img.convert('L'), np.float32) / 255
        g = (g - g.mean()) / (g.std() + 1e-6)
        v = np.clip(0.78 + 0.13 * g, 0, 1)
        v = np.where(g < -1.3, v * 0.35, v)      # 濃い所はシラカバの黒い模様に
        rgb = np.stack([v * 0.95, v * 0.95, v * 0.92], -1)
        img = Image.fromarray((rgb * 255).astype(np.uint8))
    elif name == 'dead':
        # 枯れ木：色を抜いて灰色がかった茶色に
        a = np.asarray(img, np.float32)
        L = a.mean(-1, keepdims=True)
        img = Image.fromarray(np.clip(L + (a - L) * 0.35, 0, 255).astype(np.uint8))
    img.save(out / f'bark_{name}.webp', quality=85, method=6)
    print('樹皮', name)
