# 木を Blender で作る道具（開発用）

1. Sapling Tree Gen 0.3.7（https://extensions.blender.org の `sapling_tree_gen`）を
   `~/.config/blender/4.2/extensions/user_default/sapling_tree_gen` に展開する
2. 葉の房の画像を描く（ambientCG Leaf001 の 1K-PNG を使う）
   ```
   blender -b --python tools/trees_blender/make_leaf_atlas.py -- broad Leaf001_1K-PNG_Color.png Leaf001_1K-PNG_Opacity.png <作業>/leaves_broad.png
   blender -b --python tools/trees_blender/make_leaf_atlas.py -- needle none none <作業>/leaves_needle.png
   ```
   地面の草の画像も描く：
   ```
   blender -b --python tools/trees_blender/make_grass_atlas.py -- <作業>/grass.png
   ```
3. 樹皮の写真（Poly Haven の 1k の Diffuse JPG。名前は `make_tree_textures.py` の BARK）を <樹皮のフォルダ> に置き、画像を作る
   ```
   python3 tools/trees_blender/make_tree_textures.py <作業> <樹皮のフォルダ> assets/trees_blender
   ```
4. 木を作る（種類ごと。設定は `species.json`）
   ```
   blender -b --python tools/trees_blender/build_tree.py -- fir <作業>/out
   ```
   `<作業>/out` の `*_lod0.glb`・`*_lod1.glb` を `assets/trees_blender/` へ。各 `<種類>.json` を `trees.json` にまとめ、
   `bark` と `leafAtlas`（species.json の値）を足す
