# キャラの模型の出典

| ファイル | キャラ | 形・質感・骨 | 動き |
|---|---|---|---|
| `shield.glb` | 盾剣騎士 | 利用者が Tripo AI で作成（骨付けも Tripo） | 下記 |
| `sword.glb` | 剣騎士 | 同上 | 下記 |
| `polearm.glb` | 長柄騎士 | 同上 | 下記 |
| `blunt.glb` | 打撃騎士 | 同上 | 下記 |
| `archer.glb` | 弓兵 | 同上 | 下記 |
| `cleric.glb` | 聖職者 | 同上 | 下記 |

- 元の模型（Tripo の書き出しそのまま）は `source_models/characters/` にある
- 動きは、利用者の以前のゲーム「魔境争覇」の剣士の模型（非公開のリポジトリ）から、`tools/characters/build_character.py` で Tripo の骨へ移したもの。
  元の動きは、歩き・走りなどが利用者の Mixamo から書き出した動作、武器の技が手付け。魔境争覇の剣士の模型そのものはこのリポジトリに入れていない
- 姿勢の動き：しゃがみ（その場）は、利用者が Meshy AI で作った動き（`source_models/motions/crouch_meshy.fbx`）。
  しゃがみ歩き・伏せる・伏せ・這う・起き上がる・壁に背を付けて覗う（左右）は、`tools/characters/make_motions.py` で Blender で手で付けた動き。
  どちらも `source_models/motions/motions.blend` にまとめ、`tools/characters/build_character.py` で Tripo の骨へ移す
- 片手劍の技（踏込突・逆袈裟・袈裟斬・旋風斬）と暗殺（背刺・滑斬）（楯劍騎士と劍騎士）は、利用者の指示した形を `tools/characters/onehand_moves.py` で Blender で手で付けた動き
- しゃがみ歩き・伏せから起き上がる・被弾（軽い・重い）・よろめき（前後左右）・防禦で受ける・楯の技・壁際を歩く・暗殺される側（背刺・滑斬）は、`tools/characters/body_moves.py` で Blender で手で付けた動き（利用者の指示による）
- 各 `.json` は、動きの長さ・繰り返すか・その場の動きで進むはずの速さ（模型の大きさのまま）と、ゲームでの縮尺
