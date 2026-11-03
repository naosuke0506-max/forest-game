# 木の模型（Blender で作成）の出典

木の形は、Blender 4.2 の拡張 **Sapling Tree Gen 0.3.7**（GPL。extensions.blender.org の `sapling_tree_gen`）で作った。
拡張は形を作る道具として使っただけで、ゲームには入っていない（作った模型そのものは GPL の対象ではない）。
作り方は `tools/trees_blender/`（`species.json` が種類ごとの設定）。

| ファイル | 中身 | 出典 |
|---|---|---|
| `*_lod0.glb` / `*_lod1.glb` | 木の形（近く用 / 遠く用）。材質は `bark`（樹皮）と `leaves`（葉）の 2 つ | Sapling Tree Gen で作成 |
| `leaves_broad.webp` | 広葉樹の葉の房（4 種類） | 葉の写真：[ambientCG Leaf001](https://ambientcg.com/view?id=Leaf001)（CC0）を Blender で小枝に付けて描いた |
| `leaves_needle.webp` | 針葉樹の針の房（4 種類） | Blender で細い円柱を並べて描いた（写真なし） |
| `bark_oak.webp` | 広葉樹の樹皮 | [Poly Haven jolcham_oak_bark_01](https://polyhaven.com/a/jolcham_oak_bark_01)（CC0） |
| `bark_fir.webp` | モミ・若木の樹皮 | [Poly Haven bark_brown_02](https://polyhaven.com/a/bark_brown_02)（CC0） |
| `bark_pine.webp` | アカマツの樹皮 | [Poly Haven pine_bark](https://polyhaven.com/a/pine_bark)（CC0） |
| `bark_dead.webp` | 枯れ木の樹皮（色を抜いた） | [Poly Haven bark_brown_01](https://polyhaven.com/a/bark_brown_01)（CC0） |
| `bark_birch.webp` | シラカバの樹皮（白くして黒い模様を足した） | [Poly Haven bark_platanus](https://polyhaven.com/a/bark_platanus)（CC0） |

元の写真はリポジトリに入れていない（上のページから取り直せる）。
