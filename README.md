# 静かな森（Forest Prototype）

iPad の Safari で動く、一人称の森の試作品です。
写実的な 3D サバイバルゲームの土台として、まずは最小構成で作っています。

- エンジン：PlayCanvas Engine **2.23.3（リポジトリ内に固定）**
- 公開：GitHub Pages（ビルド作業なし。置いたファイルがそのまま動く）
- 外部ライブラリ：PlayCanvas のみ
- 質感画像：Poly Haven（CC0）の地面・樹皮・岩（`assets/textures/CREDITS.md`）
- 空：Poly Haven（CC0）の HDR 写真から作った背景と照明（`assets/sky/CREDITS.md`）

## 遊び方

| 操作 | iPad | PC（確認用） |
|---|---|---|
| 移動 | 画面の左半分をなぞる（触れた所にスティックが出る。端まで倒すと走る） | W A S D / 矢印、Shift で走る |
| 見回す | 画面の右半分をなぞる | マウスでドラッグ |

左右を同時に使えます（歩きながら見回せる）。

### URL の切り替え

| 付け足すもの | 意味 |
|---|---|
| `?q=low` / `?q=high` | 画質（既定は medium） |
| `?stats=0` | 左上の性能表示を消す |
| `?seed=123` | 森の配置を変える |

例：`https://naosuke0506-max.github.io/forest-game/?q=low`

左上の表示は「fps（1 秒あたりの描画回数）／ draw（描画命令の数）／ tri（場面の三角形の数）／画質と描画解像度の倍率」です。

## ファイル構成

```
index.html               入口。import map でエンジンの版を 1 か所で決める
css/style.css            画面サイズ・Safari のセーフエリアに合わせた UI
vendor/playcanvas/2.23.3 固定したエンジン本体・ライセンス・照合記録（VERSION.md）
assets/textures/         実写の質感画像（読み込むのは軽くした WebP。出典は CREDITS.md）
tools/optimize_textures.py 質感画像を WebP に軽くする道具（開発用）
assets/sky/               空の背景と照明（出典は CREDITS.md）
tools/make_sky.py        空の HDR 写真から、背景・照明・太陽の向きを作る道具（開発用）
js/
  main.js                起動の順番だけ
  config.js              画質・森の密度・操作感度などの数値
  core/app.js            エンジンの起動（WebGL2・描画解像度の上限・画面の大きさ合わせ）
  core/random.js         種から決まる乱数とノイズ（同じ種なら同じ森）
  core/mesh-utils.js     仮モデルの組み立てと、インスタンシング（大量の同じ物を 1 回で描く）
  world/materials.js     質感画像の読み込み（色・凹凸・陰影と粗さ）
  world/terrain.js       起伏のある地面と、地点ごとの高さ
  world/environment.js   太陽光・影・霧
  world/sky.js           空の背景、空全体から回り込む光、写真の太陽に合わせた太陽光の向き
  world/vegetation.js    木（針葉樹・広葉樹）と草
  world/rocks.js         岩
  world/obstacles.js     木の幹や岩の当たり判定（円）
  input/touch.js         iPad のタッチ（左：スティック、右：視点）
  input/desktop.js       キーボード・マウス（補助）
  input/input.js         入力を「移動」「視点」の形にそろえる
  player/controller.js   一人称の移動・接地・当たり判定・範囲の制限
  ui/screens.js          タイトル画面と性能表示
```

木・草・岩の形はまだ仮モデル（エンジンの基本形を組み合わせたもの）です。地面・幹・岩には実写の質感画像を貼っています。
質感画像が読み込めなかったときは、その種類だけ色だけの表示で続けます（画面下に知らせが出ます）。
Meshy AI の GLB に差し替えるときは `world/vegetation.js` と `world/rocks.js` の「形を作る」部分を置き換えます。

## GitHub Pages で公開する手順（iPad の Safari で）

1. このリポジトリのページを開き、上の **Settings** を押す
2. 左の一覧から **Pages** を押す
3. **Build and deployment** の **Source** を **Deploy from a branch** にする
4. **Branch** を **main**、フォルダを **/ (root)** にして **Save**
5. 1〜2 分待って、同じ Pages の画面の上に出る URL（`https://naosuke0506-max.github.io/forest-game/`）を開く

更新を反映させたいときは、main に変更が入れば自動で公開し直されます（数分かかります）。
古い画面が出るときは、Safari で再読み込みしてください。

## 不具合が出たとき

iPad の Safari では開発者ツールが見られないため、エラーは画面の下に赤い枠で表示します。
その文字をそのまま Claude Code に貼れば、原因を調べられます。

## ライセンス

- PlayCanvas Engine：MIT（`vendor/playcanvas/2.23.3/LICENSE`）
