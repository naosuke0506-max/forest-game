# 質感画像の出典

すべて [Poly Haven](https://polyhaven.com/) の素材で、ライセンスは **CC0**（[polyhaven.com/license](https://polyhaven.com/license)）です。
帰属表示の義務はありませんが、記録のために残しています。

| フォルダ | 素材 | 作者 | 実物の大きさ | 使っている所 |
|---|---|---|---|---|
| `forrest_ground_01/` | [Forest Ground 01](https://polyhaven.com/a/forrest_ground_01) | Rob Tuytel | 2m 四方 | 地面 |
| `pine_bark/` | [Pine Bark](https://polyhaven.com/a/pine_bark) | Dimitrios Savva | 2m 四方 | 木の幹 |
| `mossy_rock/` | [Mossy Rock](https://polyhaven.com/a/mossy_rock) | Rob Tuytel | 3m 四方 | 岩 |
| `aerial_grass_rock/` | [Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock) | Rob Tuytel | 15m 四方（地面では 10m で使う） | 地面に混ぜる草地（大草原・森の草むら）。色だけ |
| `forest_leaves_02/` | [Forest Leaves 02](https://polyhaven.com/a/forest_leaves_02) | Rob Tuytel | 3m 四方 | 地面に混ぜる落ち葉と苔（深い森）。色だけ |

## 村の建物（`js/world/castle.js`。起動の後に裏で読み込む）

| 素材 | 使う所 |
|---|---|
| [castle_wall_slates](https://polyhaven.com/a/castle_wall_slates) | 家の土台・井戸 |
| [white_plaster_rough_01](https://polyhaven.com/a/white_plaster_rough_01) | 家のしっくいの壁 |
| [weathered_brown_planks](https://polyhaven.com/a/weathered_brown_planks) | 家の木の骨組み・井戸の柱 |
| [thatch_roof_angled](https://polyhaven.com/a/thatch_roof_angled) | わらぶき屋根 |
| [clay_roof_tiles](https://polyhaven.com/a/clay_roof_tiles) | 瓦屋根 |
| [cobblestone_floor_04](https://polyhaven.com/a/cobblestone_floor_04) | 村の広場の石畳 |
| [wooden_gate](https://polyhaven.com/a/wooden_gate) | 家の扉 |

どれも Poly Haven（CC0）。取り込んだときに MD5 を確かめた。色は 1024（石）か 512、凹凸と陰影・粗さは 512 の WebP にした。

## 大廳（中世の城の広間。`js/render/hall.js`・`hall-room.js`）

| 素材 | 作者 | 実物の大きさ | 使う所 |
|---|---|---|---|
| [medieval_blocks_03](https://polyhaven.com/a/medieval_blocks_03) | Rob Tuytel | 2m 四方 | 壁・暖炉の胸壁・柱（色 1024） |
| [large_floor_tiles_02](https://polyhaven.com/a/large_floor_tiles_02) | Rob Tuytel | 3m 四方 | 床・壇・炉床（色と凹凸 1024） |
| [castle_wall_varriation](https://polyhaven.com/a/castle_wall_varriation) | Rob Tuytel | 2m 四方 | 炉の中・腰石 |
| [old_planks_02](https://polyhaven.com/a/old_planks_02) | Rob Tuytel | 2m 四方 | 天井・梁・薪・松明の柄 |
| [velour_velvet](https://polyhaven.com/a/velour_velvet) | colormass, Rico Cilliers | 0.28m 四方 | 絨毯と旗の布の凹凸（色は絵を描いた。`hall-room.js`） |

`tools/fetch_polyhaven_hall.py` で取り込み（MD5 を確かめる）、`tools/optimize_textures.py` で WebP にした。

## 使っているファイル

ゲームが読み込むのは、`tools/optimize_textures.py` で元の 1K JPG から作った **WebP** です（9 枚で合計約 0.9MB）。
元の JPG（合計約 8.4MB）は、作り直すときの元として残しています。

| 末尾 | 中身 | 色空間 | 大きさ |
|---|---|---|---|
| `_diff.webp` | 色（アルベド） | sRGB | 地面だけ 1024、他は 512 |
| `_nor_gl.webp` | 凹凸（法線、OpenGL 形式） | リニア | 512 |
| `_arm.webp` | R = 陰影（AO）、G = 粗さ、B = 金属度 | リニア | 512 |
| `_*_1k.jpg` | 上の 3 種類の元画像（Poly Haven の 1K） | — | 1024 |

元の JPG の入手元は、Poly Haven の API（`https://api.polyhaven.com/files/<素材名>`）が示す `dl.polyhaven.org` の URL です。
取り込んだときに、API が示す MD5 とファイルが一致することを確認しました。
