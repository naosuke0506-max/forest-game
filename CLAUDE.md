# 時輪戰記（じりんせんき）— Claude への約束と作業の手引き

- ゲームの名前は **時輪戰記**。「蠱毒」はモードの名前（ゲームの名前ではない）。
- iPad 向けの、リアルな 3D の 4 人バトルロイヤル。PlayCanvas 2.23.3（`vendor/`）で作り、GitHub Pages で公開している。
- ゲームの決まりは `docs/DESIGN.md`、遊び方・ファイル構成・模型の作り直し方は `README.md`。作業の前に関係する所を読む。

## 利用者との約束（必ず守る）

- 説明はすべて日本語。英語にするのは、ChatGPT・Tripo・Suno に渡すプロンプトだけ。
- 既存のファイルを勝手に消さない（消したいときは先に聞く）。
- 直す前に調べる（今のコードと動きを確かめてから変える）。
- iPad 優先：タッチで操作できるように。処理は軽く。
- エラーが出たら、原因と直し方を説明する。
- 小さく分けて進める。機能ごとにファイルを分ける。
- 外部のライブラリを足すときは、先に何をする物かを説明する。
- 分からない仕様は推測しないで確認する。質問は普通の文章で書く（選択肢の画面は使わない）。
- PR は聞かずに作ってよい（マージは利用者がする）。**force push はしない**。
- PR を作ったら、GitHub Pages への反映手順を書く（PR を開いて「Merge pull request」→ 数分で反映）。

## 表記の決まり

- 漢字だけの名前・ボタン・見出しは**旧字体**（例：戰鬥・圖鑑・設定・大廳・題曲・羅甸・獨逸）。
- 説明文・お知らせは今の日本語。数字は算用数字（刻も「第1刻」「第2刻」…「終刻」）。

## 作業の決まり

- 変更を公開するたびに版番号を上げる：`js/version.js` の `BUILD` と、`index.html` の `window.__BUILD` を同じ値にする（例：`2026-11-08.22` → 次は `.23`。日付が変わったらその日の `.1` から）。
  - 開いている PR が複数あると、この 2 行だけがぶつかりやすい。ぶつかったら、新しい方の番号に揃える。
- 新しい JS ファイルを足したら、`index.html` の modulepreload にも足す（iPad の読み込みを速くするため）。
- 音：iPad の Safari は、指を離したとき（`click` / `touchend`）にしか音を鳴らし始められない。`pointerdown` では鳴らない。
- 曲（`assets/music/`）は `<audio>` で少しずつ読みながら鳴らす（全部を先に解かない。メモリのため）。出典は `assets/music/CREDITS.md` に書く。

## 手元で確かめる方法

- 静かな配信：`cd forest-game && python3 -m http.server 8766 --bind 127.0.0.1`（バックグラウンドで。時間の上限で止まったら起動し直す）。
- ブラウザ：入っている Playwright をそのまま使う（入れ直さない）。WebGL を動かすため、次の引数で起動する。
  ```js
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });   // iPad の横向きくらい
  await p.goto('http://localhost:8766/index.html?q=low&stats=0');
  ```
  - 最初の画面（`#gate`）は、画面をタップすると開き、題の曲が流れる。「入」（`#start`）で大廳へ。
  - 画面の写真は重いので `screenshot({ timeout: 300000 })` のように長めに待つ。
  - 調べるのに使える物：`window.__music`（`current`・`titleBeat`）、`window.__BUILD`。
- `node --check ファイル名` で文法の誤りを先に見つける。
