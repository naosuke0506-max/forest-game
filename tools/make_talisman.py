# 祓魔僧の護符（奇跡を唱える。利用者の指示 2026-11-17）の模型を作る（Blender 4.2 で実行する開発用の道具。ゲームは読み込まない）
#
#   blender -b --python tools/make_talisman.py -- <出力の GLB>
#
# 形：時の輪（このゲームの名前の印）の金の護符。外の輪・内の輪・8 本の輻・輪の内の板、外へ光の矢じり（日輪）、真ん中に琥珀の玉（台座つき）。
#   上の吊り輪から短い鎖（4 つの輪）で、左の拳から下がる。原点は鎖の上の端（拳の所）で、護符は下（-Y。glTF）へ垂れる。
#   護符の面は glTF の XY の面（表は +Z）。ゲームは毎フレーム、拳の位置から垂らして、体の向きに表を向ける（render/character-view.js）
#   材質：金と、琥珀の玉（光る。唱える間はゲームが明るくする）。三角形は約 3,400
import bpy, sys, math
from mathutils import Vector

out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

def material(name, base, metal, rough, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m

# 金：金属らしさを 0.55 にとどめる（1 にすると、空の映り込みが無い所（大廳・洞窟・夜）で黒く見えた。2026-11-17）
GOLD = material('talisman_gold', (0.86, 0.64, 0.30), 0.55, 0.34)
GEM = material('talisman_gem', (0.85, 0.30, 0.04), 0.0, 0.12, emit=(1.0, 0.45, 0.10), strength=0.6)

parts = []
def keep(o, mat):
    o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    parts.append(o)
    return o

# Blender の座標：護符の面は XZ の面（表は -Y。glTF の +Z）、上は +Z。真ん中を (0, 0, -C) に置く
C = 0.150          # 拳（原点）から護符の真ん中まで（m）
R_OUT, R_IN = 0.046, 0.029
def torus(major, minor, center, segs=(40, 8), axis='y'):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=segs[0], minor_segments=segs[1], location=center)
    o = bpy.context.active_object
    if axis == 'y': o.rotation_euler = (math.radians(90), 0, 0)      # 輪の面を XZ へ（面の向きは Y）
    elif axis == 'x': o.rotation_euler = (0, math.radians(90), 0)    # 輪の面を YZ へ（鎖の輪を互い違いに）
    return o

cz = -C
keep(torus(R_OUT, 0.0060, (0, 0, cz), (44, 10)), GOLD)                 # 外の輪
keep(torus(R_IN, 0.0032, (0, 0, cz), (32, 6)), GOLD)                   # 内の輪
# 8 本の輻（内の台座から外の輪まで）
for i in range(8):
    a = i * math.pi / 4
    r0, r1 = 0.013, R_OUT - 0.004
    mid = (r0 + r1) / 2
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.0026, depth=r1 - r0, location=(math.cos(a) * mid, 0, cz + math.sin(a) * mid))
    o = bpy.context.active_object
    o.rotation_euler = (0, math.pi / 2 - a, 0)
    keep(o, GOLD)
    # 光の矢じり：輻と輻の間から外へ（日輪の形。12 時の所は吊り輪があるので無し）
    b = a + math.pi / 8
    if abs(math.sin(b) - 1) > 0.05 and not (abs(math.cos(b)) < 0.4 and math.sin(b) > 0):
        L = 0.016 if i % 2 == 0 else 0.011
        rr = R_OUT + 0.004 + L / 2
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.0052, radius2=0.0, depth=L, location=(math.cos(b) * rr, 0, cz + math.sin(b) * rr))
        o = bpy.context.active_object
        o.rotation_euler = (0, math.pi / 2 - b, 0)
        keep(o, GOLD)
# 輪の内の板（輻の後ろ。浮き彫りに見えるように少し奥へ）
bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=R_OUT - 0.002, depth=0.0022, location=(0, 0.0032, cz))
o = bpy.context.active_object; o.rotation_euler = (math.radians(90), 0, 0); keep(o, GOLD)
# 真ん中：台座と琥珀の玉（表へ少し出す）
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.0145, depth=0.007, location=(0, 0, cz))
o = bpy.context.active_object; o.rotation_euler = (math.radians(90), 0, 0); keep(o, GOLD)
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.0105, location=(0, -0.003, cz))
o = bpy.context.active_object; o.scale = (1, 0.75, 1); keep(o, GEM)
# 吊り輪と鎖（上へ。輪を互い違いに）
top = cz + R_OUT + 0.010
keep(torus(0.0075, 0.0020, (0, 0, top), (16, 6), axis='x'), GOLD)
z = top + 0.012
n = 0
while z < -0.006:
    keep(torus(0.0072, 0.0016, (0, 0, z), (14, 5), axis='y' if n % 2 == 0 else 'x'), GOLD)
    z += 0.0115; n += 1
# 拳の中の輪（原点）
keep(torus(0.0085, 0.0020, (0, 0, 0.0), (14, 5), axis='y' if n % 2 == 0 else 'x'), GOLD)

# まとめて 1 つに（材質ごとに描画命令 1 つ）
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bpy.ops.object.join()
tal = bpy.context.active_object
tal.name = 'talisman'
tris = sum(len(p.vertices) - 2 for p in tal.data.polygons)
print('三角形', tris)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('書き出した', out)
