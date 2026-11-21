# 現代の村の小物と乗り物の出典（② 村の暮らしの物。2026-11-21）

## 小物（Poly Haven）

すべて [Poly Haven](https://polyhaven.com/) の 3D 模型で、ライセンスは **CC0** です（[polyhaven.com/license](https://polyhaven.com/license)）。
帰属表示の義務はありませんが、記録のために残しています。

`tools/fetch_polyhaven_modern.py` で 1K の glTF を取り込み（MD5 を確かめる）、`tools/process_village_props.mjs` で軽くしました
（部品をまとめ、三角形を減らし、質感画像を小さな WebP にして GLB の中に入れる）。三角形の数と大きさは `village.json`。
村には同じ物をたくさん置くので、大廳の小物より三角形を少なくしています。

| ファイル | 元の模型 | 作者 | 元の面の数 → 三角形 | 使っている所 |
|---|---|---|---|---|
| `metal_trash_can.glb` | [Metal Trash Can](https://polyhaven.com/a/metal_trash_can) | GurJas Studios | 13,960 → 694 | 扉の横のごみ箱・ガソリンスタンド（中にきれいな物と錆びた物があり、きれいな方だけ） |
| `trashbag.glb` | [Trashbag](https://polyhaven.com/a/trashbag) | Benny Weimer | 4,482 → 500 | ごみ箱の横のごみ袋 |
| `exterior_aircon_unit.glb` | [Exterior Aircon Unit](https://polyhaven.com/a/exterior_aircon_unit) | Monsta3D | 18,986 → 912 | 家と売店の裏の室外機（中に 2 台あり、きれいな方だけ） |
| `propane_tank.glb` | [Propane Tank](https://polyhaven.com/a/propane_tank) | Slinc | 5,238 → 956 | 家の裏・売店の横のガス瓶 |
| `wooden_picnic_table.glb` | [Wooden Picnic Table](https://polyhaven.com/a/wooden_picnic_table) | Ulan Cabanilla | 10,210 → 1,125 | 裏庭の木の食卓 |
| `plastic_monobloc_chair_01.glb` | [Plastic Monobloc Chair 01](https://polyhaven.com/a/plastic_monobloc_chair_01) | Kuutti Siitonen | 3,356 → 700 | 裏庭の椅子 |
| `planter_box_01.glb` | [Planter Box 01](https://polyhaven.com/a/planter_box_01) | James Ray Cock | 8,094 → 900 | 扉の前・窓の下・教会の扉の横の植木箱 |
| `old_tyre.glb` | [Old Tyre](https://polyhaven.com/a/old_tyre) | MP | 2,880 → 600 | 家の裏・売店の横に重ねた古いタイヤ |
| `metal_jerrycan.glb` | [Metal Jerrycan](https://polyhaven.com/a/metal_jerrycan) | Sean Buckley | 20,022 → 499 | 家の横・トラクターの横・売店の横の携行缶 |
| `covered_car.glb` | [Covered Car](https://polyhaven.com/a/covered_car) | MP | 12,592 → 2,983 | 家の横の、覆いを掛けた車（たまに） |

（「元の面の数」は Poly Haven の表示の数）

## 乗り物と給油機（このゲームのために作った物）

`vehicles.glb` は、Claude が Blender（4.2）で作りました（`tools/make_vehicles.py`。2026-11-21）。
利用者の指示：車・トラクター・自転車・給油機は自由に使える無料の模型が見つからなかったので、Claude が Blender で作る。
`tools/process_vehicles.mjs` で同じ頂点をまとめ、位置と法線を小さな整数にしました（KHR_mesh_quantization）。

| 部品の名前 | 物 | 三角形 | 大きさ（幅 × 長さ × 高さ m） |
|---|---|---|---|
| `car_small` | 小さい車（ハッチバック） | 2,836 | 1.94 × 3.95 × 1.48 |
| `car_wagon` | ワゴン | 2,828 | 1.94 × 4.68 × 1.52 |
| `pickup` | 荷台のある車 | 2,992 | 2.09 × 5.31 × 1.65 |
| `tractor` | トラクター | 2,072 | 2.19 × 3.64 × 2.71 |
| `bicycle` | 自転車 | 1,488 | 0.54 × 1.79 × 1.05 |
| `fuel_pump` | ガソリンの給油機 | 484 | 0.98 × 0.50 × 1.93 |

材質は名前だけで、ゲーム（`js/world/village-items.js`）が名前から色とつやを決めます（塗装 `paint` は置くたびに色を変える）。
