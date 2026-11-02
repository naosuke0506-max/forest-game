# 森の小物の出典

すべて [Poly Haven](https://polyhaven.com/) の 3D 模型で、ライセンスは **CC0** です（[polyhaven.com/license](https://polyhaven.com/license)）。
帰属表示の義務はありませんが、記録のために残しています。

| フォルダ | 元の模型 | 使っている形 |
|---|---|---|
| `grass/` | [Grass Medium 01](https://polyhaven.com/a/grass_medium_01) | tall_a / tall_b / tall_c / small_b（遠く用は tiny の株） |
| `fern/` | [Fern 02](https://polyhaven.com/a/fern_02) | a / b / c / d |
| `branches/` | [Dry Branches Medium 01](https://polyhaven.com/a/dry_branches_medium_01) | a / b / c |
| `rock_large/` | [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01) | rock01 / 02 / 03 / 05 |
| `rock_medium/` | [Rock Moss Set 02](https://polyhaven.com/a/rock_moss_set_02) | rock08 / 09 / 10 / 12 |
| `stump/` | [Tree Stump 01](https://polyhaven.com/a/tree_stump_01) | 1 つ |

元の glTF（1K の質感画像つき）と、草・シダの透明部分の画像（Alpha の PNG）は、
Poly Haven の API が示す MD5 と一致することを確かめて取り込みました。元のファイルはリポジトリに入れていません。

## 作り直すとき

```
python3 tools/fetch_polyhaven_models.py <取り込み先>
cd tools && npm ci
node process_props.mjs <取り込み先> ../assets/props
```

形の選び方と三角形の目標は `tools/process_props.mjs` の `PROPS`、置き方は `js/world/props.js` の `RULES` で変えられます。
