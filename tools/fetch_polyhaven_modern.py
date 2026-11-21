"""現代の村（2026-11-21。マップは全部現代）の質感画像を Poly Haven（CC0）から取り込む（開発用の道具。ゲームには含まれない）

    python3 tools/fetch_polyhaven_modern.py [模型の取り込み先]

質感画像（1K の JPG：色・凹凸・陰影と粗さ）は assets/textures/<名前>/ に入れる（その後 tools/optimize_textures.py で WebP にする）。
模型（② 村の暮らしの物。2026-11-21）は glTF（1K の質感画像つき）を <模型の取り込み先>/<名前>/ に入れる（その後 tools/process_village_props.mjs で軽くする）。
どのファイルも、Poly Haven の API が示す MD5 と一致することを確かめる。
"""
import hashlib
import json
import os
import urllib.request

# 舗装の道（アスファルト）・橋とバス停の台（コンクリート）
TEXTURES = ['asphalt_02', 'concrete']
# 村の小物（② 村の暮らしの物）：ゴミ箱・ゴミ袋・エアコンの室外機・プロパンガスのボンベ・ピクニックテーブル・プラスチックの椅子・
# プランター・古タイヤ・燃料の携行缶・覆いの掛かった車（植木鉢と配電箱は、三角形が減りきらず重いので外した）
MODELS = ['metal_trash_can', 'trashbag', 'exterior_aircon_unit', 'propane_tank', 'wooden_picnic_table',
          'plastic_monobloc_chair_01', 'planter_box_01', 'old_tyre', 'metal_jerrycan', 'covered_car',
          # 家の中（③ 家の中と人が消えた直後。2026-11-21）：電気コンロ・掛け時計・額 2 つ・白い椅子・一人掛けの椅子・吊り灯・
          # りんご・クロワッサン・水差し・花瓶（ソファ・テレビ・冷蔵庫・ベッドなどは今ふうの物が無いので、コードで作る）
          'electric_stove', 'wall_clock', 'hanging_picture_frame_02', 'fancy_picture_frame_01', 'painted_wooden_chair_01',
          'mid_century_lounge_chair', 'modern_ceiling_lamp_01', 'food_apple_01', 'croissant', 'jug_01', 'ceramic_vase_01']

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


def main(out=None):
    for name in TEXTURES:
        files = json.loads(get(f'https://api.polyhaven.com/files/{name}'))
        for key, kind in (('Diffuse', 'diff'), ('nor_gl', 'nor_gl'), ('arm', 'arm')):
            x = files[key]['1k']['jpg']
            save(os.path.join(ROOT, name, f'{name}_{kind}_1k.jpg'), x['url'], x['md5'])
        print(f'質感 {name}: OK')
    if not out:
        return
    for name in MODELS:
        files = json.loads(get(f'https://api.polyhaven.com/files/{name}'))
        g = files['gltf']['1k']['gltf']
        save(os.path.join(out, name, os.path.basename(g['url'])), g['url'], g['md5'])
        for rel, x in g.get('include', {}).items():
            save(os.path.join(out, name, rel), x['url'], x['md5'])
        print(f'模型 {name}: OK')


if __name__ == '__main__':
    import sys
    main(sys.argv[1] if len(sys.argv) > 1 else None)
