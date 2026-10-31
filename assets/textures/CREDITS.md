# 質感画像の出典

すべて [Poly Haven](https://polyhaven.com/) の素材で、ライセンスは **CC0**（[polyhaven.com/license](https://polyhaven.com/license)）です。
帰属表示の義務はありませんが、記録のために残しています。

| フォルダ | 素材 | 作者 | 実物の大きさ | 使っている所 |
|---|---|---|---|---|
| `forrest_ground_01/` | [Forest Ground 01](https://polyhaven.com/a/forrest_ground_01) | Rob Tuytel | 2m 四方 | 地面 |
| `pine_bark/` | [Pine Bark](https://polyhaven.com/a/pine_bark) | Dimitrios Savva | 2m 四方 | 木の幹 |
| `mossy_rock/` | [Mossy Rock](https://polyhaven.com/a/mossy_rock) | Rob Tuytel | 3m 四方 | 岩 |

## 使っているファイル（いずれも 1K = 1024×1024 の JPG）

| 末尾 | 中身 | 色空間 |
|---|---|---|
| `_diff_1k.jpg` | 色（アルベド） | sRGB |
| `_nor_gl_1k.jpg` | 凹凸（法線、OpenGL 形式） | リニア |
| `_arm_1k.jpg` | R = 陰影（AO）、G = 粗さ、B = 金属度 | リニア |

入手元は Poly Haven の API（`https://api.polyhaven.com/files/<素材名>`）が示す `dl.polyhaven.org` の URL です。
取り込んだときに、API が示す MD5 とファイルが一致することを確認しました。

iPad のメモリを考えて 1K を使っています。2K にすると 1 枚あたりのメモリは 4 倍になります。
