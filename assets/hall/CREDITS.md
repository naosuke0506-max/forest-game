# 大廳の小物の出典

すべて [Poly Haven](https://polyhaven.com/) の 3D 模型で、ライセンスは **CC0** です（[polyhaven.com/license](https://polyhaven.com/license)）。
帰属表示の義務はありませんが、記録のために残しています。

`tools/fetch_polyhaven_hall.py` で 1K の glTF を取り込み（MD5 を確かめる）、`tools/process_hall_props.mjs` で軽くしました
（部品をまとめ、三角形を減らし、質感画像を小さな WebP にして GLB の中に入れる）。三角形の数と大きさは `hall.json`。

| ファイル | 元の模型 | 作者 | 三角形 | 使っている所 |
|---|---|---|---|---|
| `wine_barrel_01.glb` | [Wine Barrel 01](https://polyhaven.com/a/wine_barrel_01) | James Ray Cock | 10,820 → 2,399 | 左奥の樽（2 つ） |
| `treasure_chest.glb` | [Treasure Chest](https://polyhaven.com/a/treasure_chest) | Rico Cilliers | 103,330 → 5,915 | 左奥の宝箱 |
| `wooden_lantern_01.glb` | [Wooden Lantern 01](https://polyhaven.com/a/wooden_lantern_01) | James Ray Cock | 8,321 → 2,433 | 樽の上の灯（中に蝋燭の火） |
| `WoodenTable_01.glb` | [Wooden Table 01](https://polyhaven.com/a/WoodenTable_01) | Ethan Place | 952 | 右奥の机 |
| `brass_goblets.glb` | [Brass Goblets](https://polyhaven.com/a/brass_goblets) | Tina | 9,600 → 1,800 | 机の上の杯 |
| `wooden_candlestick.glb` | [Wooden Candlestick](https://polyhaven.com/a/wooden_candlestick) | Josh Dean | 212,992 → 1,768 | 机の上の燭台（蝋燭の火） |
| `wooden_stool_02.glb` | [Wooden Stool 02](https://polyhaven.com/a/wooden_stool_02) | Kuutti Siitonen | 11,146 → 1,600 | 机の前の腰掛け |
| `kite_shield.glb` | [Kite Shield](https://polyhaven.com/a/kite_shield) | Ulan Cabanilla | 10,306 → 2,599 | 壁の楯（松明の下に 2 つ） |
