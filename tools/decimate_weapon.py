# 利用者が送った武器の模型（Tripo AI。数十万三角形・Draco 圧縮）を、元の模型として置ける大きさに減らす（Blender 4.2 で動かす開発用の道具）
#
#   blender -b --python tools/decimate_weapon.py -- <元の GLB> <出力の GLB> [三角形の目標（既定 40000）]
#
# 形はつながりを保ったまま減らし（Blender の「減らす」：辺をまとめる）、質感の画像は 1024 の JPEG にする。
# この後 tools/process_weapons.mjs で、ゲーム用に向きと持ち手をそろえ、さらに軽くする
import bpy, sys

args = sys.argv[sys.argv.index('--') + 1:]
src, dst = args[0], args[1]
target = int(args[2]) if len(args) > 2 else 40000

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    # 読み込んだ法線（Tripo が付けた物）は外し、角度で滑らかさを付け直す（付けたまま減らすと、法線が崩れて暗くまだらに写る）
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0001)   # 同じ位置の頂点をつなげる（三角形ごとに離れていると、滑らかにできない）
    bpy.ops.object.mode_set(mode='OBJECT')
    if o.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.shade_smooth_by_angle(angle=0.6)
    if tris > target:
        bpy.context.view_layer.objects.active = o
        d = o.modifiers.new('decimate', 'DECIMATE')
        d.ratio = target / tris
        bpy.ops.object.modifier_apply(modifier='decimate')
    print('三角形', o.name, tris, '→', sum(len(p.vertices) - 2 for p in o.data.polygons))
for img in bpy.data.images:
    if img.size[0] > 1024:
        img.scale(1024, 1024)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=90, export_apply=True)
print('書き出し', dst)
