"""質感画像を iPad 向けに軽くする（開発用の道具。ゲームには含まれない）

元の 1K JPG（Poly Haven から取り込んだもの）から、縮小した WebP を作る。
    python3 tools/optimize_textures.py
必要なもの：Python 3 と Pillow（WebP 対応版）
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / 'assets' / 'textures'

# 素材ごと・画像ごとの一辺の画素数。画面に大きく映る地面の色だけ 1024
SIZES = {
    'forrest_ground_01': {'diff': 1024, 'nor_gl': 512, 'arm': 512},
    'pine_bark': {'diff': 512, 'nor_gl': 512, 'arm': 512},
    'mossy_rock': {'diff': 512, 'nor_gl': 512, 'arm': 512},
}
# WebP の画質（凹凸は細かい向きの情報なので高め）
QUALITY = {'diff': 82, 'nor_gl': 90, 'arm': 85}

total = 0
for asset, maps in SIZES.items():
    for kind, size in maps.items():
        src = ROOT / asset / f'{asset}_{kind}_1k.jpg'
        dst = ROOT / asset / f'{asset}_{kind}.webp'
        im = Image.open(src).convert('RGB')
        if im.width != size:
            im = im.resize((size, size), Image.LANCZOS)
        im.save(dst, quality=QUALITY[kind], method=6)
        total += dst.stat().st_size
        print(f'{dst.relative_to(ROOT)}  {size}px  {dst.stat().st_size // 1024}KB')
print(f'合計 {total // 1024}KB')
