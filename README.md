# 静かな森（Forest Prototype）

iPad の Safari で動く、4 人で戦う対戦ゲームの試作品です（一人称）。
今は練習モード（あなた＋bot 3 体）で、試合の骨組み（フェーズ・ポイント・報酬・結果）と戦闘（近接・弓・防御）までできています。
キャラは Tripo AI で作った 6 種類の模型で、動き（構え・歩き・走り・斬り・防御・ひるみ・倒れる・弓を引く）が付いています。武器と盾も Tripo AI の模型です（メイスとロングボウはまだ仮の形）。

## 試合のルール（今できているところ）

- 4 人（あなた＋bot 3 体）で始まる。一度倒れたら脱落
- 5 つのフェーズ。歩ける範囲は最初から森全体（半径 175m、端から端まで 350m。走って約 65〜75 秒）。外周は高さ約 10m の丸太の柵で囲み、柵より上も見えない壁で通れない
- フェーズが進むと時間帯が変わる（20 秒かけて、空の写真も重ねながらゆっくり移り変わる）：朝 → 昼 → 夕暮れ → 深夜 → 深夜（最終）。時間帯ごとに、その時刻に撮った本物の空の写真に切り替わり、太陽（夜は月）・霧・明るさも変わる
- 太陽を見るとまぶしい：光の輪と光の筋、まっすぐ見るほど画面が白く飛ぶ。太陽が直接見えるときだけ（柵・地面・木の幹や葉にさえぎられると出ない）。夜の月はまぶしくない
- 最終フェーズの時間が切れても、生き残りが 1 人になるまで延長する
- 1 人になった瞬間に終わり、最後の生き残りに大きな加点。ポイントが一番高い人の勝ち
- フェーズを生き残るたびに加点と、画面中央の報酬（3 つから 1 つ選ぶ）
- 右上に全員のポイントをランキング順で表示

- キャラ（盾剣騎士・剣騎士・長柄騎士・打撃騎士・弓兵・聖職者）ごとに、初期の武器・盾・鎧の硬さ・体力・速さが違う（設計の全体は `docs/DESIGN.md`）
- 近接は「振りかぶり → 当たり → 戻り」。間合いと角度に入った相手に当たる
- 弓は押している間に引き、離すと放つ。引くほど強く速い。矢は重力で落ちる
- 防御は盾を持つキャラだけができる（武器では受けられない）。前からの攻撃を減らし、スタミナを使う。スタミナが尽きると崩れてひるむ
- 打撃武器は防御の上からも響く。まともに受けるとひるむ
- 強攻撃（左手）：振りかぶりが長く隙も大きいが、ダメージ 1.7 倍。なぎ払いは広く、叩きつけは防御の上からさらに響く（数値は `js/game/data.js` の `HEAVY`）
- 画面：左上にミニマップ（森全体。自分だけを矢印で表示）、上の真ん中にフェーズ・時間帯・残り時間、右上にランキング
- 回避は装備の重さで変わる：軽装（弓兵・聖職者）は軽やかな前転、中装（盾剣騎士・剣騎士）は前転、重装（長柄騎士・打撃騎士）は回避ステップ。少しの間、攻撃が当たらない。スタミナを使う
- 倒されたら脱落して、生き残りを肩越しに観戦する
- bot は一番近い相手を狙う（近接は詰めて攻撃・ときどき防御、弓兵は距離を取って射る）。bot 同士も戦う

数値（キャラ・武器・戦闘・フェーズ・ポイント・報酬）は `js/game/data.js` にまとめてある。

- エンジン：PlayCanvas Engine **2.23.3（リポジトリ内に固定）**
- 公開：GitHub Pages（ビルド作業なし。置いたファイルがそのまま動く）
- 外部ライブラリ：PlayCanvas のみ
- 質感画像：Poly Haven（CC0）の地面・樹皮・岩（`assets/textures/CREDITS.md`）
- 空：Poly Haven（CC0）の HDR 写真 4 枚（朝・昼・夕暮れ・深夜）から作った背景と照明（`assets/sky/CREDITS.md`）
- 木と茂み：Blender（Sapling Tree Gen）で作った 7 種類の模型。地面の草も Blender で描いた画像。葉は ambientCG（CC0）の写真、樹皮は Poly Haven（CC0）の写真（`assets/trees_blender/CREDITS.md`）。前の Tripo AI の木は `assets/trees/` に残してある（今は使っていない）
- 草・シダ・落ち枝・岩・切り株：Poly Haven（CC0）の 3D 模型（`assets/props/CREDITS.md`）
- キャラ：Tripo AI で作った 6 種類の模型と、魔境争覇から移した動き（`assets/characters/CREDITS.md`）
- 武器・盾：Tripo AI で作った模型（`assets/weapons/CREDITS.md`）

## 遊び方

| 操作 | iPad | PC（確認用） |
|---|---|---|
| 移動 | 左下のスティック（画面の左半分の下の方に触れて動かす。端まで倒すと走る） | W A S D / 矢印、Shift で走る |
| 見回す | 画面の右側をなぞる | マウスでドラッグ |
| 右手 | 右下の「攻撃」（弓は長押しで引き、離して放つ） | J |
| 左手 | 右下の左手ボタン：盾剣騎士は「防御」（押している間）、剣騎士・聖職者は「強攻撃」、長柄騎士は「なぎ払い」、打撃騎士は「叩きつけ」、弓兵は「持ち替え」（弓 ↔ ダガー） | K |
| 回避 | 右下の「回避」（移動スティックの向きへ。倒していなければ後ろへ） | L かスペース |

左右を同時に使えます（歩きながら見回せる）。

### URL の切り替え

| 付け足すもの | 意味 |
|---|---|
| `?q=low` / `?q=high` | 画質（既定は medium） |
| `?stats=0` | 左上の性能表示を消す |
| `?seed=123` | 森の配置を変える |
| `?wind=0.5` | 風の強さ（既定 1.5、0 で無風） |
| `?debug=1` | 確認用のボタンを画面の上に出す（bot を倒す・自分が倒れる・次のフェーズへ。設定画面の「テスト用」にも同じものがある） |
| `?view=third` | 三人称で見る（確認用。遊ぶときは一人称だけ） |
| `?phase=30` | フェーズの長さを 30 秒にする（確認用。設定画面の「テスト用」でも選べる） |

例：`https://naosuke0506-max.github.io/forest-game/?q=low`

エリア（`js/world/zones.js`）：中央＝森と草原が混ざる森、北＝深い森（木が 3 倍以上密で、霧が濃く暗い）、東＝大草原（木はまばら、草が多い）、
南西＝村（横 84m・奥行き 54m の長方形の木の柵で囲み、森の中央の側に入り口がひとつ。入り口からの表通りと横の通りが井戸のある広場で交わり、通りに沿って家 26 軒）、中央から各エリアへ土の道。左上の小さな地図は今いるエリアだけを大きく映し（ほかは暗く）、エリアが変わると切り替わる。タップすると画面の 8 割ほどの大きな地図でマップ全体（エリアの名前・境目・道）を見られる。別のエリアに入ると左に知らせが出る。

広い森でも重くならないように：木は精細な形で描くのを近い順に 30 本まで（深い森で増えすぎないように）、深い森の中では描く遠さも短くする。木・岩・切り株は約 125m より遠いものと、カメラの後ろにあるもの（影が届く近さより遠いもの）を描かない。
草・シダ・落ち枝は、自分の周りの 12m 四方の区画ごとに、種から決まる置き方でその場で作る（離れた区画は捨てる）。

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
assets/trees_blender/    木の模型（Blender で作成。近く用・遠く用の形、樹皮と葉の房の画像。出典は CREDITS.md）
tools/trees_blender/     木を Blender で作る道具（葉の房の画像・樹皮の画像・木の形。README.md に手順）
assets/trees/            前の木の模型（Tripo AI。今は使っていない）
source_models/trees/     木の元の模型（Tripo AI の GLB。ゲームは読み込まない）
tools/process_trees.mjs  木の模型をゲーム用に軽くする道具（開発用。cd tools && npm ci）
assets/props/            森の小物（草・シダ・落ち枝・岩・切り株。出典は CREDITS.md）
tools/fetch_polyhaven_models.py  Poly Haven の模型を取り込む道具（開発用）
tools/process_props.mjs  森の小物をゲーム用に軽くする道具（開発用）
source_models/props/     倒木・キノコ・焚き火の元の模型（Tripo AI。まだゲームでは使っていない）
assets/characters/       キャラの模型（骨と動き入り、軽くしたもの）と、動きの長さ・速さ（.json）
source_models/characters/ キャラの元の模型（Tripo AI で骨付けした GLB。ゲームは読み込まない）
assets/weapons/          武器・盾の模型（持ち手を原点にそろえたもの）
source_models/weapons/   武器・盾の元の模型（Tripo AI の GLB。ゲームは読み込まない）
tools/process_weapons.mjs 武器・盾の模型の向きと持ち手をそろえ、軽くする道具（開発用。cd tools && npm ci）
tools/characters/        キャラの模型を作る道具（Blender 4.2 で動かす開発用。下の「キャラの模型を作り直す」）
js/
  main.js                起動の順番だけ
  version.js             公開している版の番号（index.html と同じ値）
  core/freshness.js      古いファイルが混ざっていたら取り直す
  match-session.js       練習モードの試合：試合の計算と、見た目・画面をつなぐ
  game/data.js           キャラ・フェーズ・ポイント・フェーズ報酬の数値
  game/match.js          試合の流れ（フェーズ・延長・範囲・ポイント・脱落・終了）。PlayCanvas に依存しない
  game/movement.js       戦う人の移動の計算（bot が使う）
  game/combat.js         戦闘：攻撃・防御・弓と矢・ダメージ・ひるみ・スタミナ。PlayCanvas に依存しない
  game/bot.js            bot の考え（相手を選んで戦う。相手がいなければ歩き回る）
  render/character-view.js 戦う人の見た目（キャラの模型と動き。戦闘の状態に合わせて動きを切り替える）
  render/fighter-view.js 仮の人形（キャラの模型が読み込めなかったときに使う）
  render/viewmodel.js    一人称で手元に見える武器と盾
  render/weapons.js      武器・盾の模型の読み込み（模型が無い武器と矢は仮の形）
  render/projectiles.js  飛んでいる矢の見た目
  render/boundary.js     歩ける範囲の光る境界（今は使っていない。外周は world/fence.js の柵）
  render/sun-glare.js    太陽を見たときのまぶしさ（画面に重ねる光）
  world/fence.js         外周の丸太の柵（高さ約 10m）
  world/ground-cover.js  地面を覆う草（自分の周りだけ。短い草・穂・白い花・大草原の背の高い草。エリアで多さが変わる）
  world/castle.js        村（柵・家・井戸・広場。箱と切妻屋根を組み、Poly Haven の石・しっくい・木・わら・瓦・石畳の質感を貼る。当たり判定も登録）
  world/zones.js         エリア分け（森・深い森・大草原・村・道）。木や小物の多さ、地面の色、霧に使う
  config.js              画質・森の密度・操作感度などの数値
  core/app.js            エンジンの起動（WebGL2・描画解像度の上限・画面の大きさ合わせ）
  core/random.js         種から決まる乱数とノイズ（同じ種なら同じ森）
  core/mesh-utils.js     仮モデルの組み立てと、インスタンシング（大量の同じ物を 1 回で描く）
  world/materials.js     質感画像の読み込み（色・凹凸・陰影と粗さ）
  world/terrain.js       起伏のある地面と、地点ごとの高さ
  world/environment.js   太陽光・影・霧
  world/sky.js           空の背景、空全体から回り込む光、写真の太陽に合わせた太陽光の向き
  world/trees.js         木の模型を並べる。距離で近く用・遠く用を切り替える（LOD）
  world/time-of-day.js   時間帯（朝・昼・夕暮れ・深夜）：空の写真・太陽・霧を、フェーズに合わせてなめらかに変える
  world/wind.js          風：木と草を頂点シェーダーで揺らす（しなり・突風・葉のそよぎ）
  world/props.js         森の小物を置く。距離で近く用・遠く用・描かないを切り替える
  world/vegetation.js    模型が読み込めなかったときの仮の木と草
  world/rocks.js         模型が読み込めなかったときの仮の岩
  world/obstacles.js     当たり判定（円）。ぶつかる物と、置き場所を取るだけの物を分けて持つ
  input/touch.js         iPad のタッチ（左：スティック、右：視点）
  input/desktop.js       キーボード・マウス（補助）
  input/input.js         入力を「移動」「視点」「攻撃・防御」の形にそろえる（短いタップも取りこぼさない）
  player/controller.js   プレイヤーの移動と視点（一人称 / 三人称）
  ui/screens.js          タイトル画面（キャラ選択）と性能表示
  ui/hud.js              試合中の表示（フェーズ・残り時間・ランキング・知らせ・報酬・結果・体力とスタミナ・頭上の体力・ダメージの数字）
  ui/minimap.js          地図：左上の小さな地図（今いるエリア）と、タップで開く大きな地図（マップ全体）
  ui/settings.js         設定（性能表示・テスト用）。この端末に保存
```

木は Blender で作った模型（樹皮と葉の房の 2 つの部分）、草・シダ・落ち枝・岩・切り株は Poly Haven の実写スキャンの模型です。地面には実写の質感画像を貼っています。
木の模型や質感画像が読み込めなかったときは、その分だけ仮の表示で続けます（画面下に知らせが出ます）。
新しい木を足すときは、元の GLB を `source_models/trees/` に置き、`tools/process_trees.mjs` の `TREES` と `js/world/trees.js` の `TREE_TYPES`、`js/config.js` の `world.trees` に名前を足します。

## キャラの模型を作り直す（開発用）

Tripo で骨付けした GLB を `source_models/characters/` に置き、`tools/characters/characters.json` に書いてから、Blender 4.2 で次を実行します（iPad ではできないので Claude Code の作業環境で動かす）。

```
blender -b --python tools/characters/build_character.py -- <キャラ名> <魔境争覇の剣士の GLB> assets/characters
```

- 動きを魔境争覇の剣士の模型から Tripo の骨へ移す（腕を下ろした姿勢と T ポーズの違いは骨ごとに補正）
- 武器・盾・弓を持たせる位置（`socket_R` / `socket_L` / `socket_bow`）を、元の模型の武器の位置から測って手に付ける
- 三角形を 1.5 万に減らし、質感の画像を 2048 にする

## GitHub Pages で公開する手順（iPad の Safari で）

1. このリポジトリのページを開き、上の **Settings** を押す
2. 左の一覧から **Pages** を押す
3. **Build and deployment** の **Source** を **Deploy from a branch** にする
4. **Branch** を **main**、フォルダを **/ (root)** にして **Save**
5. 1〜2 分待って、同じ Pages の画面の上に出る URL（`https://naosuke0506-max.github.io/forest-game/`）を開く

更新を反映させたいときは、main に変更が入れば自動で公開し直されます（数分かかります）。
古い画面が出るときは、Safari で再読み込みしてください。

更新の直後は、Safari が新しいページと古いプログラムを混ぜて読み込むことがあります（ボタンが反応しない など）。
そのためページとプログラムに版の番号（`index.html` の `window.__BUILD` と `js/version.js`）を持たせ、
合わないときはプログラムを取り直して 1 回だけ読み込み直します。**変更を公開するたびに、両方の番号を上げます。**

## 不具合が出たとき

iPad の Safari では開発者ツールが見られないため、エラーは画面の下に赤い枠で表示します。
その文字をそのまま Claude Code に貼れば、原因を調べられます。

## ライセンス

- PlayCanvas Engine：MIT（`vendor/playcanvas/2.23.3/LICENSE`）
