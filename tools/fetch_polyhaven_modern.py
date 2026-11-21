"""現代の村（2026-11-21。マップは全部現代）の質感画像を Poly Haven（CC0）から取り込む（開発用の道具。ゲームには含まれない）

    python3 tools/fetch_polyhaven_modern.py

質感画像（1K の JPG：色・凹凸・陰影と粗さ）は assets/textures/<名前>/ に入れる（その後 tools/optimize_textures.py で WebP にする）。
どのファイルも、Poly Haven の API が示す MD5 と一致することを確かめる。
"""
import hashlib
import json
import os
import urllib.request

# 舗装の道（アスファルト）・橋とバス停の台（コンクリート）
TEXTURES = ['asphalt_02', 'concrete']

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


def main():
    for name in TEXTURES:
        files = json.loads(get(f'https://api.polyhaven.com/files/{name}'))
        for key, kind in (('Diffuse', 'diff'), ('nor_gl', 'nor_gl'), ('arm', 'arm')):
            x = files[key]['1k']['jpg']
            save(os.path.join(ROOT, name, f'{name}_{kind}_1k.jpg'), x['url'], x['md5'])
        print(f'質感 {name}: OK')


if __name__ == '__main__':
    main()
