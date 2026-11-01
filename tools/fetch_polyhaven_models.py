"""Poly Haven（CC0）の 3D 模型を取り込む（開発用の道具。ゲームには含まれない）

    python3 tools/fetch_polyhaven_models.py <保存先フォルダ>

glTF（1K の質感画像つき）と、透明部分の画像（Alpha の PNG。草やシダの葉の形の切り抜きに使う）を取り込む。
どのファイルも、Poly Haven の API が示す MD5 と一致することを確かめる。
取り込んだ後は tools/process_props.mjs でゲーム用に軽くする。
"""
import hashlib
import json
import os
import sys
import urllib.request

# 取り込む模型と、透明部分の画像が要るか
MODELS = {
    'grass_medium_01': True,
    'fern_02': True,
    'dry_branches_medium_01': False,
    'rock_moss_set_01': False,
    'rock_moss_set_02': False,
    'tree_stump_01': False,
}


def get(url):
    with urllib.request.urlopen(url) as r:
        return r.read()


def save(path, url, md5):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = get(url)
    if hashlib.md5(data).hexdigest() != md5:
        raise SystemExit(f'MD5 が合いません: {url}')
    with open(path, 'wb') as f:
        f.write(data)


def main(out):
    for name, need_alpha in MODELS.items():
        files = json.loads(get(f'https://api.polyhaven.com/files/{name}'))
        g = files['gltf']['1k']['gltf']
        save(os.path.join(out, name, os.path.basename(g['url'])), g['url'], g['md5'])
        for rel, x in g.get('include', {}).items():
            save(os.path.join(out, name, rel), x['url'], x['md5'])
        if need_alpha:
            x = files['Alpha']['1k']['png']
            save(os.path.join(out, name, 'textures', f'{name}_alpha_1k.png'), x['url'], x['md5'])
        print(f'{name}: OK')


if __name__ == '__main__':
    main(sys.argv[1])
