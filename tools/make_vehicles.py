# 現代の村（② 村の暮らしの物。2026-11-21）の乗り物と給油機を作る（Blender 4.2 で実行する開発用の道具。ゲームは読み込まない）
#
#   blender -b --python tools/make_vehicles.py -- <出力の GLB> [見本の絵のフォルダ]
#
# 作る物（物ごとに 1 つの部品。名前で呼ぶ）：
#   car_small（小さい車）・car_wagon（ワゴン）・pickup（荷台のある車）・tractor（トラクター）・bicycle（自転車）・fuel_pump（ガソリンの給油機）
# 向き：前は glTF の +Z（Blender の -Y）、上は +Y。原点は地面の上の真ん中
# 材質は名前だけ使う（ゲームの world/vehicles.js が名前から色とつやを決め、塗装 paint は置くたびに色を変える）：
#   paint・glass・chrome・rubber・plastic・light・taillight・seat・metal・screen
import bpy, bmesh, sys, math, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]
preview = argv[1] if len(argv) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

# ---- 材質（見本の色。ゲームでは名前だけ使う） ----
MATS = {}
def mat(name, rgb, metal=0.0, rough=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*rgb, 1)        # 見本の絵（workbench）の色
    m.metallic, m.roughness = metal, rough
    MATS[name] = m
    return m
for n, c, me, r in [('paint', (0.55, 0.08, 0.06), 0.3, 0.3), ('glass', (0.03, 0.05, 0.06), 0.0, 0.05), ('chrome', (0.8, 0.8, 0.82), 1.0, 0.2),
                    ('rubber', (0.03, 0.03, 0.03), 0.0, 0.9), ('plastic', (0.06, 0.06, 0.065), 0.0, 0.7), ('light', (0.9, 0.9, 0.85), 0.0, 0.1),
                    ('taillight', (0.6, 0.04, 0.03), 0.0, 0.2), ('seat', (0.1, 0.1, 0.11), 0.0, 0.85), ('metal', (0.35, 0.36, 0.38), 0.8, 0.45),
                    ('screen', (0.02, 0.03, 0.03), 0.0, 0.1)]:
    mat(n, c, me, r)

def link(obj):
    scn.collection.objects.link(obj)
    return obj
def new_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    return link(bpy.data.objects.new(name, me))
def set_mat(obj, name):
    obj.data.materials.clear()
    obj.data.materials.append(MATS[name])
    return obj

def prism(name, pts_yz, x0, x1, matname, taper_top=0.0, top_z=None):
    """横（Blender の X）に押し出した形。pts_yz：横から見た輪郭（y は前後・z は高さ。反時計回り）。
       taper_top：上ほど幅を狭める割合（屋根のすぼまり。top_z より上の点だけ）"""
    bm = bmesh.new()
    n = len(pts_yz)
    L, R = [], []
    for (y, z) in pts_yz:
        L.append(bm.verts.new((x0, y, z)))
        R.append(bm.verts.new((x1, y, z)))
    bm.faces.new(L[::-1]); bm.faces.new(R)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((L[i], L[j], R[j], R[i]))
    if taper_top and top_z is not None:
        cx = (x0 + x1) / 2
        zmin = min(z for _, z in pts_yz); zmax = max(z for _, z in pts_yz)
        for v in bm.verts:
            if v.co.z > top_z:
                k = (v.co.z - top_z) / max(1e-6, zmax - top_z)
                v.co.x = cx + (v.co.x - cx) * (1 - taper_top * k)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return set_mat(new_obj(name, bm), matname)

def bevel(obj, w, seg=2, angle=40):
    m = obj.modifiers.new('bv', 'BEVEL'); m.width = w; m.segments = seg; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(angle)
    return obj
def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for m in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    obj.select_set(False)
def cut(obj, cutter):
    m = obj.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cutter; m.solver = 'EXACT'
    apply_all(obj)
def cyl(name, r, depth, loc, axis='x', verts=16, matname='rubber', fill=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, end_fill_type='NGON' if fill else 'NOTHING')
    o = bpy.context.active_object; o.name = name
    if axis == 'x': o.rotation_euler = (0, math.radians(90), 0)
    elif axis == 'y': o.rotation_euler = (math.radians(90), 0, 0)
    return set_mat(o, matname)
def boxo(name, size, loc, matname, rot=(0, 0, 0), bev=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.scale = size
    set_mat(o, matname)
    if bev: bevel(o, bev, 2, 30)
    return o
def torus(name, R, r, loc, matname, axis='x', segs=(24, 8)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=segs[0], minor_segments=segs[1], location=loc)
    o = bpy.context.active_object; o.name = name
    if axis == 'x': o.rotation_euler = (0, math.radians(90), 0)
    return set_mat(o, matname)
def tube(name, a, b, r, matname, verts=8):
    a, b = Vector(a), Vector(b); d = b - a
    o = cyl(name, r, d.length, (a + b) / 2, axis=None, verts=verts, matname=matname)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return o
def join(name, objs):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs: o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name; o.data.name = name
    for p in o.data.polygons: p.use_smooth = False
    o.select_set(False)
    return o

def wheels(prefix, xs, ys, r, w, rim=0.6, hub='chrome'):
    """タイヤ（ゴム）とホイール（金属）。xs：左右の真ん中、ys：前後"""
    parts = []
    for x in xs:
        for y in ys:
            out = 1 if x > 0 else -1
            t = cyl(f'{prefix}_tire', r, w, (x, y, r), 'x', 20, 'rubber')
            bevel(t, w * 0.25, 2, 30)
            parts.append(t)
            parts.append(cyl(f'{prefix}_rim', r * rim, w * 0.3, (x + out * w * 0.38, y, r), 'x', 14, hub))
    return parts

def car(name, kind):
    """乗用車：横から見た輪郭を押し出し、角を丸め、車輪の穴を抜く。窓は一回り細いガラスの形を重ねる"""
    W = 1.76
    if kind == 'small':      # 小さい車（ハッチバック）。長さ 3.9 m
        lower = [(-1.95, 0.32), (-1.98, 0.55), (-1.9, 0.72), (-1.1, 0.82), (-0.55, 0.92), (1.55, 0.95), (1.9, 0.9), (1.95, 0.55), (1.9, 0.3)]
        glass = [(-0.62, 0.9), (0.15, 1.42), (1.35, 1.44), (1.82, 0.95)]
        wb = (-1.25, 1.25); r = 0.31
    elif kind == 'wagon':    # ワゴン。長さ 4.6 m
        lower = [(-2.3, 0.32), (-2.33, 0.56), (-2.25, 0.72), (-1.35, 0.84), (-0.75, 0.94), (2.05, 0.97), (2.3, 0.9), (2.33, 0.56), (2.28, 0.3)]
        glass = [(-0.82, 0.92), (0.0, 1.47), (2.02, 1.48), (2.26, 0.97)]
        wb = (-1.45, 1.4); r = 0.32
    pts = [(y, z) for y, z in lower]
    body = prism(f'{name}_body', pts, -W / 2, W / 2, 'paint')
    bevel(body, 0.09, 3, 35)
    # 窓（ガラス）：一回り細く、上ほどすぼめる
    gpts = list(glass) + [(glass[-1][0], 0.86), (glass[0][0], 0.86)]
    gw = W - 0.14
    win = prism(f'{name}_glass', [(y, z) for y, z in gpts], -gw / 2, gw / 2, 'glass', taper_top=0.12, top_z=0.95)
    bevel(win, 0.05, 2, 30)
    # 屋根（塗装）：ガラスの上に薄い板
    ry0, ry1 = glass[1][0], glass[2][0]
    roof = boxo(f'{name}_roof', ((gw - 0.2) * 0.9, (ry1 - ry0) + 0.12, 0.06), (0, (ry0 + ry1) / 2, glass[1][1] + 0.025), 'paint', bev=0.025)
    # 柱（ガラスの横の塗装の帯）：前の柱・真ん中の柱
    pil = []
    for sx in (-1, 1):
        pil.append(boxo(f'{name}_bpil', (0.03, 0.12, 0.5), (sx * (gw / 2 - 0.03), (ry0 + ry1) / 2 - 0.05, 1.16), 'paint'))
    # 車輪の穴
    for y in wb:
        c = cyl('arch', r + 0.07, W + 0.4, (0, y, r), 'x', 24, 'rubber'); cut(body, c); bpy.data.objects.remove(c)
    parts = [body, win, roof] + pil + wheels(name, (-W / 2 + 0.13, W / 2 - 0.13), wb, r, 0.2)
    # 前と後ろ：灯・格子・バンパー・ナンバー板
    fy = lower[0][0]; by = lower[-1][0]
    for sx in (-1, 1):
        parts.append(boxo(f'{name}_hl', (0.34, 0.05, 0.11), (sx * 0.58, fy - 0.0, 0.7), 'light', bev=0.02))
        parts.append(boxo(f'{name}_tl', (0.3, 0.05, 0.13), (sx * 0.62, by + 0.01, 0.78), 'taillight', bev=0.02))
        # 横の鏡：窓の付け根から外へ（体と窓に掛かるように、内側まで伸ばす）
        parts.append(boxo(f'{name}_mir', (0.22, 0.08, 0.1), (sx * (W / 2 - 0.02), glass[0][0] + 0.3, 0.97), 'paint', bev=0.02))
    parts.append(boxo(f'{name}_grille', (0.7, 0.05, 0.12), (0, fy + 0.0, 0.58), 'plastic'))
    parts.append(boxo(f'{name}_fbump', (W - 0.08, 0.14, 0.16), (0, fy + 0.03, 0.4), 'plastic', bev=0.04))
    parts.append(boxo(f'{name}_rbump', (W - 0.08, 0.14, 0.16), (0, by - 0.03, 0.4), 'plastic', bev=0.04))
    parts.append(boxo(f'{name}_plate', (0.46, 0.02, 0.11), (0, by + 0.05, 0.6), 'light'))
    # 扉の継ぎ目と取っ手（細い暗い線）
    for sx in (-1, 1):
        for y in (-0.05, 0.75 if kind == 'small' else 0.85):
            parts.append(boxo(f'{name}_seam', (0.006, 0.012, 0.5), (sx * (W / 2 + 0.002), y, 0.68), 'plastic'))
        parts.append(boxo(f'{name}_handle', (0.02, 0.12, 0.025), (sx * (W / 2 + 0.01), 0.25, 0.86), 'chrome'))
    return join(name, parts)

def pickup(name):
    """荷台のある車：運転席の箱と、後ろの荷台（壁と床）。車高を高く"""
    W = 1.85; r = 0.38; lift = 0.12
    lower = [(-2.55, 0.42), (-2.58, 0.72), (-2.5, 0.9), (-1.5, 1.0), (-0.7, 1.08), (0.55, 1.08), (0.55, 0.45)]
    body = prism(f'{name}_body', [(y, z + 0) for y, z in lower], -W / 2, W / 2, 'paint'); bevel(body, 0.08, 3, 35)
    glass = [(-0.82, 1.05), (-0.25, 1.6), (0.45, 1.6), (0.5, 1.05)]
    gw = W - 0.16
    win = prism(f'{name}_glass', [(y, z) for y, z in glass], -gw / 2, gw / 2, 'glass', taper_top=0.1, top_z=1.1); bevel(win, 0.04, 2, 30)
    roof = boxo(f'{name}_roof', (gw - 0.12, 0.78, 0.06), (0, 0.1, 1.62), 'paint', bev=0.02)
    bed = []
    y0, y1 = 0.6, 2.55
    bed.append(boxo(f'{name}_bedfloor', (W - 0.1, y1 - y0, 0.08), (0, (y0 + y1) / 2, 0.72), 'metal'))
    for sx in (-1, 1): bed.append(boxo(f'{name}_bedside', (0.07, y1 - y0, 0.5), (sx * (W / 2 - 0.05), (y0 + y1) / 2, 0.95), 'paint', bev=0.02))
    bed.append(boxo(f'{name}_bedback', (W - 0.1, 0.07, 0.5), (0, y1 - 0.03, 0.95), 'paint', bev=0.02))
    bed.append(boxo(f'{name}_bedfront', (W - 0.1, 0.07, 0.5), (0, y0 + 0.03, 0.95), 'paint', bev=0.02))
    bed.append(boxo(f'{name}_bedunder', (W - 0.2, y1 - y0 - 0.1, 0.3), (0, (y0 + y1) / 2, 0.55), 'plastic'))
    for y in (-1.7, 1.75):
        c = cyl('arch', r + 0.08, W + 0.4, (0, y, r), 'x', 24, 'rubber'); cut(body if y < 0 else bed[-1], c); bpy.data.objects.remove(c)
    parts = [body, win, roof] + bed + wheels(name, (-W / 2 + 0.14, W / 2 - 0.14), (-1.7, 1.75), r, 0.26, hub='metal')
    for sx in (-1, 1):
        parts.append(boxo(f'{name}_hl', (0.34, 0.05, 0.14), (sx * 0.6, -2.58, 0.88), 'light', bev=0.02))
        parts.append(boxo(f'{name}_tl', (0.08, 0.05, 0.28), (sx * (W / 2 - 0.06), 2.6, 1.0), 'taillight'))
        parts.append(boxo(f'{name}_mir', (0.26, 0.08, 0.12), (sx * (W / 2 - 0.01), -0.6, 1.14), 'plastic', bev=0.02))
        parts.append(boxo(f'{name}_seam', (0.006, 0.012, 0.6), (sx * (W / 2 + 0.002), 0.5, 0.78), 'plastic'))
        parts.append(boxo(f'{name}_handle', (0.02, 0.12, 0.03), (sx * (W / 2 + 0.01), 0.15, 0.98), 'chrome'))
    parts.append(boxo(f'{name}_grille', (1.1, 0.05, 0.26), (0, -2.58, 0.72), 'chrome', bev=0.02))
    parts.append(boxo(f'{name}_fbump', (W, 0.16, 0.2), (0, -2.56, 0.48), 'metal', bev=0.04))
    parts.append(boxo(f'{name}_rbump', (W, 0.14, 0.14), (0, 2.6, 0.5), 'metal', bev=0.03))
    return join(name, parts)

def tractor(name):
    """トラクター：大きな後ろの車輪、小さな前の車輪、長い車体（ボンネット）、ガラスの運転室、排気の煙突"""
    parts = []
    hood = prism(f'{name}_hood', [(-1.85, 0.75), (-1.95, 1.05), (-1.85, 1.38), (-0.2, 1.45), (-0.2, 0.75)], -0.45, 0.45, 'paint'); bevel(hood, 0.06, 2, 30)
    parts.append(hood)
    parts.append(boxo(f'{name}_grille', (0.7, 0.04, 0.45), (0, -1.95, 1.08), 'plastic'))
    parts.append(boxo(f'{name}_chassis', (0.7, 2.6, 0.35), (0, -0.55, 0.72), 'metal'))
    # 運転室：床・4 本の柱・屋根・ガラス
    cab_y0, cab_y1 = -0.15, 1.05
    parts.append(boxo(f'{name}_cabfloor', (1.3, cab_y1 - cab_y0, 0.12), (0, (cab_y0 + cab_y1) / 2, 1.25), 'paint', bev=0.02))
    for sx in (-1, 1):
        for y in (cab_y0 + 0.05, cab_y1 - 0.05):
            parts.append(boxo(f'{name}_post', (0.07, 0.07, 1.35), (sx * 0.62, y, 1.95), 'plastic'))
    parts.append(boxo(f'{name}_roof', (1.45, cab_y1 - cab_y0 + 0.2, 0.1), (0, (cab_y0 + cab_y1) / 2, 2.66), 'paint', bev=0.03))
    for sx in (-1, 1): parts.append(boxo(f'{name}_sideglass', (0.02, cab_y1 - cab_y0 - 0.12, 1.2), (sx * 0.62, (cab_y0 + cab_y1) / 2, 1.95), 'glass'))
    parts.append(boxo(f'{name}_frontglass', (1.18, 0.02, 1.2), (0, cab_y0 + 0.04, 1.95), 'glass'))
    parts.append(boxo(f'{name}_backglass', (1.18, 0.02, 1.0), (0, cab_y1 - 0.04, 2.05), 'glass'))
    parts.append(boxo(f'{name}_seat', (0.45, 0.4, 0.12), (0, 0.65, 1.55), 'seat'))
    parts.append(tube(f'{name}_wheelpost', (0, 0.1, 1.3), (0, 0.25, 1.85), 0.03, 'plastic'))
    parts.append(torus(f'{name}_steer', 0.17, 0.015, (0, 0.28, 1.88), 'plastic', axis='z', segs=(16, 4)))
    parts.append(tube(f'{name}_exhaust', (-0.3, -0.6, 1.4), (-0.3, -0.6, 2.7), 0.045, 'metal'))
    # 車輪：前は小さく、後ろは大きく（泥よけ付き）
    parts += wheels(f'{name}_f', (-0.62, 0.62), (-1.35,), 0.44, 0.32, rim=0.55, hub='paint')
    parts += wheels(f'{name}_r', (-0.82, 0.82), (0.55,), 0.78, 0.5, rim=0.55, hub='paint')
    for sx in (-1, 1):
        parts.append(boxo(f'{name}_fender', (0.55, 1.1, 0.06), (sx * 0.82, 0.55, 1.62), 'paint', bev=0.02))
        parts.append(boxo(f'{name}_hl', (0.14, 0.04, 0.1), (sx * 0.3, -1.97, 1.28), 'light'))
    parts.append(boxo(f'{name}_hitch', (0.5, 0.4, 0.2), (0, 1.45, 0.75), 'metal'))
    return join(name, parts)

def bicycle(name):
    """自転車：細い輪と管の骨組み、ハンドル、サドル。高さ 1 m"""
    R = 0.34; parts = []
    fy, by = -0.55, 0.52
    for y in (fy, by):
        parts.append(torus(f'{name}_wheel', R, 0.022, (0, y, R), 'rubber', segs=(28, 6)))
        parts.append(torus(f'{name}_rim', R - 0.03, 0.01, (0, y, R), 'chrome', segs=(24, 4)))
        parts.append(cyl(f'{name}_hub', 0.03, 0.1, (0, y, R), 'x', 8, 'metal'))
    bb = (0, 0.05, 0.3); seat = (0, 0.18, 0.86); head = (0, -0.42, 0.9); bh = (0, by, R)
    for a, b in [(bb, seat), (seat, head), (bb, head), (bb, bh), (seat, bh)]:
        parts.append(tube(f'{name}_frame', a, b, 0.018, 'paint'))
    parts.append(tube(f'{name}_fork', head, (0, fy, R), 0.016, 'chrome'))
    parts.append(tube(f'{name}_stem', head, (0, -0.44, 1.02), 0.015, 'chrome'))
    parts.append(tube(f'{name}_bar', (-0.27, -0.44, 1.02), (0.27, -0.44, 1.02), 0.013, 'chrome'))
    parts.append(boxo(f'{name}_saddle', (0.13, 0.25, 0.05), (0, 0.2, 0.9), 'seat', bev=0.02))
    parts.append(cyl(f'{name}_chainring', 0.1, 0.01, bb, 'x', 12, 'metal'))
    return join(name, parts)

def fuel_pump(name):
    """ガソリンの給油機：四角い本体（上に表示の箱）、両側に画面と給油ノズル"""
    parts = []
    parts.append(boxo(f'{name}_base', (0.9, 0.5, 0.15), (0, 0, 0.075), 'metal'))
    parts.append(boxo(f'{name}_body', (0.8, 0.42, 1.45), (0, 0, 0.88), 'paint', bev=0.03))
    parts.append(boxo(f'{name}_top', (0.86, 0.46, 0.3), (0, 0, 1.78), 'light', bev=0.02))
    for sy in (-1, 1):
        parts.append(boxo(f'{name}_screen', (0.5, 0.02, 0.3), (0, sy * 0.215, 1.25), 'screen'))
        parts.append(boxo(f'{name}_keypad', (0.22, 0.02, 0.18), (0.18, sy * 0.215, 0.95), 'plastic'))
        for sx in (-1, 1):
            parts.append(boxo(f'{name}_holster', (0.1, 0.08, 0.16), (sx * 0.43, sy * 0.12, 0.95), 'plastic'))
            # 管：上の横から垂れて、下で曲がり、筒先の掛け具へ戻る（体の横に沿わせる）
            parts.append(tube(f'{name}_hose', (sx * 0.41, sy * 0.1, 1.5), (sx * 0.47, sy * 0.13, 0.55), 0.02, 'rubber', 6))
            parts.append(tube(f'{name}_hose2', (sx * 0.47, sy * 0.13, 0.55), (sx * 0.45, sy * 0.12, 0.9), 0.02, 'rubber', 6))
    return join(name, parts)

objs = [car('car_small', 'small'), car('car_wagon', 'wagon'), pickup('pickup'), tractor('tractor'), bicycle('bicycle'), fuel_pump('fuel_pump')]
# 三角形にして数える
for o in objs:
    bpy.context.view_layer.objects.active = o
    m = o.modifiers.new('tri', 'TRIANGULATE')
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.ops.object.modifier_apply(modifier='tri')
    print('三角形', o.name, len(o.data.polygons), '大きさ', [round(v, 2) for v in o.dimensions])

# 見本の絵（並べて斜めから）
if preview:
    os.makedirs(preview, exist_ok=True)
    # 3 つずつ 2 列に並べる（前の列：車 3 種、後ろの列：トラクター・自転車・給油機）
    for i, o in enumerate(objs): o.location.x, o.location.y = (i % 3) * 6.0, (i // 3) * 6.0
    scn.render.engine = 'BLENDER_WORKBENCH'
    scn.display.shading.light = 'STUDIO'; scn.display.shading.color_type = 'MATERIAL'
    scn.display.shading.show_shadows = True; scn.display.shading.show_cavity = True
    scn.render.resolution_x, scn.render.resolution_y = 1600, 1000
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); link(cam)
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 19
    w = bpy.data.worlds.new('w'); w.color = (0.75, 0.78, 0.82); scn.world = w
    scn.camera = cam
    def shoot(fname, yaw):
        tx, ty, tz = 6.0, 3.0, 0.9
        d = 30.0; el = math.radians(28); az = math.radians(yaw)
        cam.location = (tx + d * math.cos(el) * math.sin(az), ty - d * math.cos(el) * math.cos(az), tz + d * math.sin(el))
        cam.rotation_euler = (math.radians(90) - el, 0, az)
        scn.render.filepath = os.path.join(preview, fname)
        bpy.ops.render.render(write_still=True)
    shoot('vehicles.png', 35)          # 前の斜め（前は -Y）
    shoot('vehicles_back.png', 180 + 35)
    for o in objs: o.location.x = o.location.y = 0

bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=False)
print('書き出した', out)
