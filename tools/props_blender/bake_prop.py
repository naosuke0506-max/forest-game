# Tripo AI の小物の模型を、Blender で軽くして、色を焼き付け直す（開発用の道具。ゲームには含まれない）
#
#   blender -b --python tools/props_blender/bake_prop.py -- <入力.glb> <出力フォルダ> <名前> <長い辺 m> <整列 0/1> <lod0 三角形> <lod1 三角形> <画像の大きさ>
#
# Tripo の模型は色の画像が細かい切れ端に分かれていて、普通に面を減らすと切れ端の境目が残り、数千三角形より減らせない。
# そこで：
#   1. 大きさ・向き・位置をそろえる（底が 0、横の真ん中が原点。整列 1 なら長い向きを前後にそろえる）
#   2. 写しを作って面を減らし（lod0）、画像の貼り方（UV）を作り直す
#   3. 元の細かい模型の色を、lod0 の新しい画像に焼き付ける（Cycles の bake）
#   4. lod0 をさらに減らして遠く用（lod1。UV はそのまま引き継ぐので、同じ画像を使える）
#   5. <名前>_lod0.glb・<名前>_lod1.glb（形だけ）・<名前>_diff.png・<名前>.json（大きさ）を書き出す
# 入力は圧縮なしの GLB（process_tripo_props.mjs が meshopt の圧縮を外してから渡す）
import bpy, bmesh, sys, os, json, math

src, out_dir, name, size, align, lod0, lod1, tex = sys.argv[sys.argv.index('--') + 1:][:8]
size, align, lod0, lod1, tex = float(size), align == '1', int(lod0), int(lod1), int(tex)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
hi = next(o for o in bpy.data.objects if o.type == 'MESH')
bpy.ops.object.select_all(action='DESELECT')
hi.select_set(True); bpy.context.view_layer.objects.active = hi
hi.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

# 1. そろえる（Blender は Z が上。GLB に書き出すと Y が上に戻る）
me = hi.data
vs = me.vertices
if align:
    n = len(vs)
    mx = sum(v.co.x for v in vs) / n; my = sum(v.co.y for v in vs) / n
    cxx = sum((v.co.x - mx) ** 2 for v in vs); cyy = sum((v.co.y - my) ** 2 for v in vs)
    cxy = sum((v.co.x - mx) * (v.co.y - my) for v in vs)
    th = 0.5 * math.atan2(2 * cxy, cxx - cyy)          # 長い向き（x 軸からの角度）
    rot = math.pi / 2 - th                              # 長い向きを y（ゲームでは前後）へ
    c, s = math.cos(rot), math.sin(rot)
    for v in vs:
        x, y = v.co.x, v.co.y
        v.co.x, v.co.y = x * c - y * s, x * s + y * c
lo = [min(v.co[k] for v in vs) for k in range(3)]
hi_ = [max(v.co[k] for v in vs) for k in range(3)]
k = size / max(hi_[i] - lo[i] for i in range(3))
cx, cy = (lo[0] + hi_[0]) / 2, (lo[1] + hi_[1]) / 2
for v in vs:
    v.co.x, v.co.y, v.co.z = (v.co.x - cx) * k, (v.co.y - cy) * k, (v.co.z - lo[2]) * k
me.update()
dims = [round((hi_[i] - lo[i]) * k, 3) for i in range(3)]

# GLB から読むと、頂点が画像の切れ目ごとに分かれている（つながっていない）ので、同じ場所の頂点をつなぐ。
# つながっていないと、面を減らすときに形が崩れる（焼き付けの元の hi はそのまま）
def merge_close(o):
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=size * 0.0005)
    bm.to_mesh(o.data); bm.free()

# 2. 面を減らした写し（lod0）と、新しい UV
low = hi.copy(); low.data = hi.data.copy(); low.name = name + '_lod0'
bpy.context.scene.collection.objects.link(low)
merge_close(low)
def decimate(o, target):
    t = tri_count(o)
    if t <= target: return
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = target / t
    bpy.ops.object.modifier_apply(modifier='dec')
decimate(low, lod0)
while low.data.uv_layers: low.data.uv_layers.remove(low.data.uv_layers[0])
low.data.uv_layers.new(name='UVMap')
bpy.ops.object.select_all(action='DESELECT'); low.select_set(True); bpy.context.view_layer.objects.active = low
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01, area_weight=0.0)
bpy.ops.object.mode_set(mode='OBJECT')

# 3. 焼き付け：lod0 に、焼き付け先の画像を持つ材質を付ける
img = bpy.data.images.new(name + '_diff', tex, tex, alpha=False)
mat = bpy.data.materials.new(name + '_bake'); mat.use_nodes = True
node = mat.node_tree.nodes.new('ShaderNodeTexImage'); node.image = img
mat.node_tree.nodes.active = node
low.data.materials.clear(); low.data.materials.append(mat)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
bake = sc.render.bake
bake.use_selected_to_active = True
bake.cage_extrusion = size * 0.02
bake.max_ray_distance = size * 0.06
bake.margin = 6
bpy.ops.object.select_all(action='DESELECT')
hi.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active = low
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
os.makedirs(out_dir, exist_ok=True)
img.filepath_raw = os.path.join(out_dir, name + '_diff.png'); img.file_format = 'PNG'; img.save()

# 4. 遠く用
far = low.copy(); far.data = low.data.copy(); far.name = name + '_lod1'
bpy.context.scene.collection.objects.link(far)
decimate(far, lod1)

# 5. 書き出し（形だけ。材質はゲームが付ける）
for o in (low, far):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, o.name + '.glb'), export_format='GLB', use_selection=True,
                              export_materials='NONE', export_normals=True, export_texcoords=True)
# 大きさ：ゲームの向き（x 横・y 高さ・z 前後）で
json.dump({'size': [dims[0], dims[2], dims[1]], 'lod0Triangles': tri_count(low), 'lod1Triangles': tri_count(far)},
          open(os.path.join(out_dir, name + '.json'), 'w'))
print('焼き付け', name, tri_count(hi), '→', tri_count(low), '/', tri_count(far), dims)
