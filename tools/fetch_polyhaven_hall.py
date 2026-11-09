"""大廳（中世の城の広間）の質感画像と小物の模型を Poly Haven（CC0）から取り込む（開発用の道具。ゲームには含まれない）

    python3 tools/fetch_polyhaven_hall.py <模型の取り込み先>

質感画像（1K の JPG：色・凹凸・陰影と粗さ）は assets/textures/<名前>/ に入れる（その後 tools/optimize_textures.py で WebP にする）。
模型は glTF（1K の質感画像つき）を <模型の取り込み先>/<名前>/ に入れる（その後 tools/process_hall_props.mjs で軽くする）。
どのファイルも、Poly Haven の API が示す MD5 と一致することを確かめる。
"""
import hashlib
import json
import os
import sys
import urllib.request

# 広間の質感：壁の切り石・床の敷石・梁の古い板・絨毯と旗の布・炉の荒石
TEXTURES = ['medieval_blocks_03', 'large_floor_tiles_02', 'old_planks_02', 'velour_velvet', 'castle_wall_varriation']
# 広間に置く小物
MODELS = ['wine_barrel_01', 'WoodenTable_01', 'brass_goblets', 'wooden_candlestick', 'wooden_lantern_01',
          'treasure_chest', 'kite_shield', 'wooden_stool_02']

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'textures')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'forest-game-tools'})
    with urllib.request.urlopen(req) as r:
        return r.read()


def save(path, url, md5):
    if os.path.exists(path) and hashlib.md5(open(path, 'rb').read()).hexdigest() == md5:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = get(url)
    if hashlib.md5(data).hexdigest() != md5:
        raise SystemExit(f'MD5 が合いません: {url}')
    with open(path, 'wb') as f:
        f.write(data)


def main(out):
    for name in TEXTURES:
        files = json.loads(get(f'https://api.polyhaven.com/files/{name}'))
        for key, kind in (('Diffuse', 'diff'), ('nor_gl', 'nor_gl'), ('arm', 'arm')):
            x = files[key]['1k']['jpg']
            save(os.path.join(ROOT, name, f'{name}_{kind}_1k.jpg'), x['url'], x['md5'])
        print(f'質感 {name}: OK')
    for name in MODELS:
        files = json.loads(get(f'https://api.polyhaven.com/files/{name}'))
        g = files['gltf']['1k']['gltf']
        save(os.path.join(out, name, os.path.basename(g['url'])), g['url'], g['md5'])
        for rel, x in g.get('include', {}).items():
            save(os.path.join(out, name, rel), x['url'], x['md5'])
        print(f'模型 {name}: OK')


if __name__ == '__main__':
    main(sys.argv[1])
