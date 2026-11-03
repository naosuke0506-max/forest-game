# 木を Blender の Sapling Tree Gen（GPL の拡張。道具として使うだけで、ゲームには入らない）で作る（開発用の道具）
#
#   blender -b --python tools/trees_blender/build_tree.py -- <種類> <出力フォルダ>
#
# 先に Sapling Tree Gen（extensions.blender.org の sapling_tree_gen 0.3.7）を
# ~/.config/blender/4.2/extensions/user_default/sapling_tree_gen に展開しておく
#
# 1. Sapling の見本（preset）に、種類ごとの設定を重ねて木を作る（枝は曲線、葉は四角）
# 2. 枝を網（メッシュ）に変え、樹皮の画像が 2m ごとに繰り返すよう、面の向きで貼り方を決める（箱型の投影）
# 3. 葉の四角には、葉の房の画像（2×2 の 4 種類）のどれかを、ばらばらに貼る
# 4. 近く用（lod0）と遠く用（lod1。枝の三角形を減らし、葉の数を減らして大きく）を GLB に書き出す。
#    材質は「bark」「leaves」の 2 つ（画像はゲームが別に読む）。大きさなどは <種類>.json に書く
import bpy, sys, os, json, math, random
from mathutils import Vector

name, out_dir = sys.argv[sys.argv.index('--') + 1:][:2]
here = os.path.dirname(os.path.abspath(__file__))
SPEC = json.load(open(os.path.join(here, 'species.json')))[name]
rnd = random.Random(SPEC.get('seed', 1))

bpy.ops.wm.read_factory_settings(use_empty=True)

# Sapling Tree Gen を有効にする（~/.config/blender/4.2/extensions/user_default/sapling_tree_gen に置いておく）
import addon_utils
addon_utils.enable('bl_ext.user_default.sapling_tree_gen', default_set=True)
# 見本を読む（拡張の presets フォルダ）
preset_dir = None
for base in bpy.utils.script_paths() + [bpy.utils.user_resource('EXTENSIONS')]:
    for root, dirs, files in os.walk(base):
        if root.endswith(os.path.join('sapling_tree_gen', 'presets')):
            preset_dir = root
if not preset_dir:
    raise SystemExit('Sapling Tree Gen の presets が見つからない')
props = eval(open(os.path.join(preset_dir, SPEC['preset'] + '.py')).read().split('\n', 3)[-1])
props.update(SPEC.get('override', {}))
props.update({'makeMesh': False, 'bevel': True, 'leafShape': 'rect', 'showLeaves': SPEC.get('leaves', True),
              'useArm': False, 'armAnim': False, 'leafAnim': False, 'seed': SPEC.get('seed', 1)})
for k, v in list(props.items()):
    if isinstance(v, list): props[k] = tuple(v)
bpy.ops.curve.tree_add(**props)
for _o in bpy.data.objects:
    if _o.type == 'MESH': print('葉の四角', len(_o.data.polygons))

curve = next(o for o in bpy.data.objects if o.type == 'CURVE')
leaves = next((o for o in bpy.data.objects if o.type == 'MESH'), None)

# 2. 枝を網に変える。細い小枝（葉の房の画像に小枝が描いてあるので要らない）は先に消す
depth = curve.data.bevel_depth
# 遠く用の枝：太い枝だけを残した写しを先に作る
curve_far = curve.copy(); curve_far.data = curve.data.copy(); bpy.context.scene.collection.objects.link(curve_far)
minFar = SPEC.get('minBranchRadiusFar', 0.07)
for sp in [sp for sp in curve_far.data.splines if max((p.radius for p in sp.bezier_points), default=0) * depth < minFar]:
    curve_far.data.splines.remove(sp)
minR = SPEC.get('minBranchRadius', 0.025)
drop = [sp for sp in curve.data.splines if max((p.radius for p in sp.bezier_points), default=0) * depth < minR]
for sp in drop: curve.data.splines.remove(sp)
print('消した細い枝', len(drop), '残り', len(curve.data.splines))
bpy.ops.object.select_all(action='DESELECT')
curve.select_set(True); bpy.context.view_layer.objects.active = curve
curve.data.bevel_resolution = SPEC.get('bevelRes', 0)
curve.data.resolution_u = SPEC.get('resU', 2)
bpy.ops.object.convert(target='MESH')
bark = bpy.context.view_layer.objects.active
bark.name = 'bark'
bpy.ops.object.select_all(action='DESELECT')
curve_far.select_set(True); bpy.context.view_layer.objects.active = curve_far
curve_far.data.bevel_resolution = 0
curve_far.data.resolution_u = 1
bpy.ops.object.convert(target='MESH')
bark_far = bpy.context.view_layer.objects.active
bark_far.name = 'bark_far'

def box_uv(obj, tile):
    """面の向き（一番大きい軸）で、残りの 2 軸を UV にする。tile m ごとに画像が 1 回"""
    me = obj.data
    if not me.uv_layers: me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active.data
    mw = obj.matrix_world
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            if ax == 2: u, v = co.x, co.y
            elif ax == 0: u, v = co.y, co.z
            else: u, v = co.x, co.z
            uv[li].uv = (u / tile, v / tile)

box_uv(bark, SPEC.get('barkTile', 2.0))
box_uv(bark_far, SPEC.get('barkTile', 2.0))
print('枝の三角形（減らす前）', sum(len(p.vertices) - 2 for p in bark.data.polygons))

def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

def decimate(o, target):
    t = tri_count(o)
    if t <= target: return
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = target / t
    bpy.ops.object.modifier_apply(modifier='dec')

def material(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    return m

def leaf_uvs(o):
    """葉の四角ごとに、2×2 の房のどれかを貼る（Sapling の葉の UV は 0〜1）"""
    me = o.data
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        q = rnd.randrange(4)
        ox, oy = (q % 2) * 0.5, (q // 2) * 0.5
        for li in poly.loop_indices:
            u, v = uv[li].uv
            uv[li].uv = (ox + u * 0.5, oy + v * 0.5)

def thin_leaves(o, keep, grow):
    """遠く用：葉を間引き（keep の割合を残す）、残りを grow 倍に大きくする（葉の付け根を中心に）"""
    import bmesh
    bm = bmesh.new(); bm.from_mesh(o.data)
    faces = list(bm.faces)
    drop = [f for f in faces if rnd.random() > keep]
    for f in faces:
        if f in drop: continue
        c = f.calc_center_median()
        for v in f.verts: v.co = c + (v.co - c) * grow
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.to_mesh(o.data); bm.free()

def finish(obj_bark, obj_leaves):
    """ひとつの物にまとめる（材質 2 つ：bark と leaves）"""
    obj_bark.data.materials.clear(); obj_bark.data.materials.append(material('bark'))
    objs = [obj_bark]
    if obj_leaves:
        obj_leaves.data.materials.clear(); obj_leaves.data.materials.append(material('leaves'))
        # UV の名前を枝とそろえる（名前が違うと、まとめたときに葉の UV が書き出されない）
        obj_leaves.data.uv_layers[0].name = obj_bark.data.uv_layers[0].name
        objs.append(obj_leaves)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = obj_bark
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o

if leaves:
    leaves.data.uv_layers.active = leaves.data.uv_layers[0]
    leaf_uvs(leaves)

# 近く用
decimate(bark, SPEC.get('barkTris', 4000))
bark_lod1 = bark_far
leaves_lod1 = None
if leaves:
    leaves_lod1 = leaves.copy(); leaves_lod1.data = leaves.data.copy(); bpy.context.scene.collection.objects.link(leaves_lod1)
    leaves_lod1.parent = None; leaves_lod1.matrix_world = leaves.matrix_world.copy()
lod0 = finish(bark, leaves)
lod0.name = f'{name}_lod0'

# 遠く用
decimate(bark_lod1, SPEC.get('barkTrisFar', 500))
if leaves_lod1: thin_leaves(leaves_lod1, SPEC.get('farKeep', 0.45), SPEC.get('farGrow', 1.35))
lod1 = finish(bark_lod1, leaves_lod1)
lod1.name = f'{name}_lod1'

# 大きさを測る（ゲームの置き方・当たり判定・風の揺れに使う）
def verts_world(o, mat_index=None):
    me = o.data
    if mat_index is None: return [o.matrix_world @ v.co for v in me.vertices]
    ids = set()
    for p in me.polygons:
        if p.material_index == mat_index: ids.update(p.vertices)
    return [o.matrix_world @ me.vertices[i].co for i in ids]
allv = verts_world(lod0)
barkv = verts_world(lod0, 0)
leafv = verts_world(lod0, 1) if leaves else []
height = max(v.z for v in allv)
low = [v for v in barkv if v.z < 0.6]
trunk_r = max((math.hypot(v.x, v.y) for v in low), default=0.2)
crown_r = sorted(math.hypot(v.x, v.y) for v in (leafv or barkv))[int(len(leafv or barkv) * 0.9)]

os.makedirs(out_dir, exist_ok=True)
for o in (lod0, lod1):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, o.name + '.glb'), export_format='GLB', use_selection=True,
                              export_image_format='NONE', export_materials='EXPORT', export_normals=True, export_texcoords=True)
meta = {
    'height': round(height, 2), 'trunkRadius': round(trunk_r, 3), 'crownRadius': round(crown_r, 3),
    'rootRadius': round(trunk_r * 1.3, 3), 'rootJunction': 0,
    'lod0Triangles': tri_count(lod0), 'lod1Triangles': tri_count(lod1),
    'parts': ['bark', 'leaves'] if leaves else ['bark'],
}
json.dump(meta, open(os.path.join(out_dir, f'{name}.json'), 'w'), indent=1)
print('書き出し', name, meta)
