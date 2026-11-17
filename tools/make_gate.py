# 刻の門（時間が止まっている間に画面をふさぐ、鉄の両開きの門）の絵を作る（Blender 4.2 で実行する開発用の道具。ゲームは読み込まない）
#
#   blender -b --python tools/make_gate.py -- <質感のフォルダ> <出力先フォルダ> [半分の幅 px] [サンプル数]
#
# 利用者の指示（2026-11-17）：フェーズ進行時の鉄の壁の実写感を上げ、ゲートのようにガシャンガシャンと言いながら開くように。
# 写真から作った鉄板の質感（Poly Haven の CC0。metal_plate_02・rusty_metal_sheet）を貼った両開きの鉄の門を、
# 正面からまっすぐ（遠近の無いカメラで）描き、左の扉・右の扉・かんぬき（扉をつなぐ鉄の棒）を別々の絵にする。
# ゲームは、この絵を画面の左右に置いて、ガシャンと閉めて、ガシャン、ガシャンと開く（js/ui/time-gate.js）。
#
# 質感のフォルダに置くもの（Poly Haven から 2k の jpg）：
#   metal_plate_02_{diff,nor_gl,rough,metal,ao}.jpg、rusty_metal_sheet_{diff,nor_gl,rough,ao}.jpg、studio_small_09_1k.hdr
# 出力：gate_l.png・gate_r.png（扉。幅 W × 高さ W×16/11）、gate_bolt.png（かんぬき。透明の背景）、gate.json（並びの数）
import bpy, sys, os, math, json

argv = sys.argv[sys.argv.index('--') + 1:]
TEX, OUT = argv[0], argv[1]
HALF_W = int(argv[2]) if len(argv) > 2 else 1100
SAMPLES = int(argv[3]) if len(argv) > 3 else 96
os.makedirs(OUT, exist_ok=True)

# ---- 大きさ（m）：門全体は幅 5.5・高さ 4。左の扉は x が -2.75〜0、右は 0〜2.75。正面は y = 0（-y の側が手前） ----
GW, GH = 5.5, 4.0
HW = GW / 2
BEAM_Z = (0.75, 3.25)        # 横の梁（上・下）の高さの真ん中。かんぬきもこの高さ
RING = dict(cz=2.0, R=0.95)  # 真ん中の「時の輪」の紋章

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.engine = 'CYCLES'
scn.cycles.device = 'CPU'
scn.cycles.samples = SAMPLES
scn.cycles.use_denoising = True
scn.cycles.max_bounces = 6
scn.view_settings.view_transform = 'AgX'
scn.view_settings.look = 'AgX - Medium High Contrast'
scn.render.image_settings.file_format = 'PNG'
scn.render.image_settings.color_mode = 'RGBA'


# ---- 質感 ----
def img(path, color):
    im = bpy.data.images.load(os.path.join(TEX, path))
    im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    return im


def pbr(name, prefix, scale, off=(0.0, 0.0), sat=1.0, val=1.0, metal=None, rough_mul=1.0, rough_add=0.0, nor=1.0, tint=None, contrast=0.0):
    """写真の質感（Poly Haven の PBR）。世界の位置（x, z）から貼る（正面から見る門なので、横と高さで十分）"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    for n in list(N):
        N.remove(n)
    out = N.new('ShaderNodeOutputMaterial')
    bsdf = N.new('ShaderNodeBsdfPrincipled')
    L.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    geo = N.new('ShaderNodeNewGeometry')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(geo.outputs['Position'], sep.inputs[0])
    comb = N.new('ShaderNodeCombineXYZ')
    for axis, src, o in ((0, 'X', off[0]), (1, 'Z', off[1])):
        mm = N.new('ShaderNodeMath'); mm.operation = 'MULTIPLY_ADD'
        L.new(sep.outputs[src], mm.inputs[0]); mm.inputs[1].default_value = scale; mm.inputs[2].default_value = o
        L.new(mm.outputs[0], comb.inputs[axis])

    def tex(kind, color):
        t = N.new('ShaderNodeTexImage')
        t.image = img(f'{prefix}_{kind}.jpg', color)
        L.new(comb.outputs[0], t.inputs['Vector'])
        return t
    diff = tex('diff', True)
    hs = N.new('ShaderNodeHueSaturation')
    hs.inputs['Saturation'].default_value = sat
    hs.inputs['Value'].default_value = val
    L.new(diff.outputs['Color'], hs.inputs['Color'])
    col = hs.outputs['Color']
    if contrast:   # 汚れ・錆のむらを強める（写真の明るい所と暗い所の差を大きく）
        bc = N.new('ShaderNodeBrightContrast'); bc.inputs['Contrast'].default_value = contrast
        L.new(col, bc.inputs['Color']); col = bc.outputs['Color']
    if tint:
        mt = N.new('ShaderNodeMix'); mt.data_type = 'RGBA'; mt.blend_type = 'MULTIPLY'; mt.inputs['Factor'].default_value = 1.0
        L.new(col, mt.inputs[6]); mt.inputs[7].default_value = (*tint, 1)
        col = mt.outputs[2]
    ao = tex('ao', False)
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 0.85
    L.new(col, mx.inputs[6]); L.new(ao.outputs['Color'], mx.inputs[7])
    L.new(mx.outputs[2], bsdf.inputs['Base Color'])
    r = tex('rough', False)
    rm = N.new('ShaderNodeMath'); rm.operation = 'MULTIPLY_ADD'
    L.new(r.outputs['Color'], rm.inputs[0]); rm.inputs[1].default_value = rough_mul; rm.inputs[2].default_value = rough_add
    L.new(rm.outputs[0], bsdf.inputs['Roughness'])
    if metal is None:
        L.new(tex('metal', False).outputs['Color'], bsdf.inputs['Metallic'])
    else:
        bsdf.inputs['Metallic'].default_value = metal
    nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = nor
    L.new(tex('nor_gl', False).outputs['Color'], nm.inputs['Color'])
    L.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def plain(name, color, metal, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    return m


# 扉の板：暗い灰色の鉄板（継ぎ目と汚れのある写真）。少し色を抜いて灰色に
M_PLATE = pbr('plate', 'metal_plate_02', 0.5, sat=0.35, val=0.82, nor=1.3)
# 枠・梁・筋交い：明るめの灰色の鉄（うすい錆）。暗くして、灰色に寄せる
M_FRAME = pbr('frame', 'rusty_metal_sheet', 0.62, off=(0.31, 0.17), sat=0.14, val=0.56, metal=0.55, rough_mul=0.95, nor=2.0, contrast=0.18)
M_RIVET = pbr('rivet', 'rusty_metal_sheet', 2.3, off=(0.7, 0.2), sat=0.14, val=0.6, metal=0.75, rough_mul=0.7, nor=0.8, contrast=0.1)
# 時の輪の紋章：古い青銅（金の色の残った鉄）。題の画面・大廳の「黒鉄と古い金」に合わせる
M_RING = pbr('ring', 'rusty_metal_sheet', 0.9, off=(0.11, 0.53), sat=0.2, val=0.74, metal=1.0, rough_mul=0.8, nor=1.2, contrast=0.25,
             tint=(0.86, 0.66, 0.36))
# かんぬきの棒：手で触れて磨かれた鉄（明るく、少しつやがある）
M_BOLT = pbr('bolt', 'metal_plate_02', 1.6, off=(0.4, 0.1), sat=0.15, val=0.8, metal=1.0, rough_mul=0.6, nor=0.6)


# ---- 形の道具 ----
def box(name, x0, x1, z0, z1, front, depth, mat, bevel=0.012, rot_y=0.0):
    """正面から見た四角の板（x0〜x1、z0〜z1）。front：手前の面の y（負ほど手前）、depth：奥行き"""
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.name = name
    o.scale = ((x1 - x0), depth, (z1 - z0))
    o.location = ((x0 + x1) / 2, front + depth / 2, (z0 + z1) / 2)
    o.rotation_euler = (0, rot_y, 0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        md = o.modifiers.new('bevel', 'BEVEL'); md.width = bevel; md.segments = 3; md.limit_method = 'ANGLE'
    o.data.materials.append(mat)
    for f in o.data.polygons:
        f.use_smooth = True
    return o


_rivet_mesh = [None]


def rivet(x, z, front, r=0.026):
    """鋲（平たい半球）。形は使い回す"""
    if _rivet_mesh[0] is None:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1)
        o = bpy.context.object
        _rivet_mesh[0] = o.data
        o.data.materials.append(M_RIVET)
        for f in o.data.polygons:
            f.use_smooth = True
        bpy.data.objects.remove(o)
    o = bpy.data.objects.new('rivet', _rivet_mesh[0])
    bpy.context.collection.objects.link(o)
    o.scale = (r, r * 0.55, r)
    o.location = (x, front, z)
    return o


def rivet_row(x0, x1, z, front, step, r=0.026):
    n = max(1, round(abs(x1 - x0) / step))
    for i in range(n + 1):
        rivet(x0 + (x1 - x0) * i / n, z, front, r)


def rivet_col(x, z0, z1, front, step, r=0.026):
    n = max(1, round(abs(z1 - z0) / step))
    for i in range(n + 1):
        rivet(x, z0 + (z1 - z0) * i / n, front, r)


def strap(xa, za, xb, zb, w, front, depth, mat, rivets=True):
    """斜めの筋交い：(xa, za) から (xb, zb) へ、幅 w"""
    L = math.hypot(xb - xa, zb - za)
    ang = math.atan2(zb - za, xb - xa)
    cx, cz = (xa + xb) / 2, (za + zb) / 2
    o = box('strap', cx - L / 2, cx + L / 2, cz - w / 2, cz + w / 2, front, depth, mat, bevel=0.01)
    # 中心で回す（y の軸のまわり。正面から見て反時計回りが正になるよう、符号を合わせる）
    o.location = (cx, front + depth / 2, cz)
    o.rotation_euler = (0, -ang, 0)
    if rivets:
        n = max(2, int(L / 0.32))
        for i in range(1, n):
            t = i / n
            rivet(xa + (xb - xa) * t, za + (zb - za) * t, front - 0.004, 0.024)
    return o


def door(s):
    """扉 1 枚。s = -1 で左（x が -2.75〜0）、+1 で右（0〜2.75）。真ん中（x = 0）が合わせ目"""
    X = lambda v: s * v   # 合わせ目からの距離 v を、その扉の x に
    lo, hi = (X(HW), 0.0) if s < 0 else (0.0, X(HW))
    # 板
    box('slab', lo, hi, 0.0, GH, 0.0, 0.22, M_PLATE, bevel=0.0)
    # 枠：上・下・外の縦・合わせ目の縦
    fr, fd = -0.075, 0.09
    box('frame_top', lo, hi, GH - 0.30, GH, fr, fd, M_FRAME)
    box('frame_bot', lo, hi, 0.0, 0.34, fr, fd, M_FRAME)
    xo0, xo1 = sorted((X(HW), X(HW - 0.26)))
    box('frame_out', xo0, xo1, 0.30, GH - 0.30, fr, fd, M_FRAME)
    xi0, xi1 = sorted((X(0.0), X(0.24)))
    box('frame_in', xi0, xi1, 0.30, GH - 0.30, fr - 0.015, fd + 0.015, M_FRAME)
    # 枠の鋲
    rivet_row(X(HW - 0.13), X(0.12), GH - 0.15, fr - 0.002, 0.24)
    rivet_row(X(HW - 0.13), X(0.12), 0.17, fr - 0.002, 0.24)
    rivet_col(X(HW - 0.13), 0.5, GH - 0.5, fr - 0.002, 0.3)
    rivet_col(X(0.12), 0.5, GH - 0.5, fr - 0.017, 0.3)
    # 横の梁（上・下）。かんぬきは、この梁の上を滑る
    for zc in BEAM_Z:
        b0, b1 = sorted((X(HW - 0.26), X(0.24)))
        box('beam', b0, b1, zc - 0.17, zc + 0.17, -0.11, 0.12, M_FRAME, bevel=0.016)
        rivet_row(X(HW - 0.4), X(0.42), zc + 0.12, -0.112, 0.21)
        rivet_row(X(HW - 0.4), X(0.42), zc - 0.12, -0.112, 0.21)
    # 外側の筋交い（梁の間に X 字）
    xa, xb = X(HW - 0.32), X(1.22)
    za, zb = BEAM_Z[0] + 0.17, BEAM_Z[1] - 0.17
    strap(xa, za, xb, zb, 0.2, -0.085, 0.07, M_FRAME)
    strap(xa, zb, xb, za, 0.2, -0.1, 0.07, M_FRAME)
    rivet(X((HW - 0.32 + 1.22) / 2), (za + zb) / 2, -0.104, 0.04)   # 筋交いの交わる所の太い鋲
    # 縦の帯（筋交いと紋章の間）
    v0, v1 = sorted((X(1.12), X(1.3)))
    box('stile', v0, v1, BEAM_Z[0] + 0.17, BEAM_Z[1] - 0.17, -0.07, 0.06, M_FRAME)
    rivet_col(X(1.21), BEAM_Z[0] + 0.35, BEAM_Z[1] - 0.35, -0.072, 0.28)
    # かんぬきの道：棒は、上下の道（鉄の帯）の間を滑る。右の扉に長い道と止め、左の扉に短い道と突き当たりの止め
    for zc in BEAM_Z:
        if s > 0:
            for dz in (0.105, -0.105):
                box('rail', 0.06, 1.5, zc + dz - 0.03, zc + dz + 0.03, -0.17, 0.06, M_FRAME, bevel=0.008)
                rivet_row(0.12, 1.44, zc + dz, -0.172, 0.18, 0.018)
            box('stop', 1.5, 1.6, zc - 0.135, zc + 0.135, -0.19, 0.08, M_FRAME, bevel=0.01)
        else:
            for dz in (0.105, -0.105):
                box('keeper', -0.62, -0.06, zc + dz - 0.03, zc + dz + 0.03, -0.17, 0.06, M_FRAME, bevel=0.008)
                rivet_row(-0.56, -0.12, zc + dz, -0.172, 0.15, 0.018)
            box('keeper_stop', -0.62, -0.52, zc - 0.135, zc + 0.135, -0.19, 0.08, M_FRAME, bevel=0.01)


def emblem():
    """真ん中の「時の輪」の紋章（両方の扉にまたがる。合わせ目で半分ずつ）：外の輪・内の輪・8 本の矢・真ん中の軸"""
    cz, R = RING['cz'], RING['R']
    for rr, minor, fy in ((R, 0.075, -0.12), (R * 0.64, 0.045, -0.1)):
        bpy.ops.mesh.primitive_torus_add(major_radius=rr, minor_radius=minor, major_segments=96, minor_segments=16,
                                         location=(0, fy, cz), rotation=(math.pi / 2, 0, 0))
        o = bpy.context.object; o.data.materials.append(M_RING)
        for f in o.data.polygons: f.use_smooth = True
    # 矢（合わせ目の上に来ないよう、22.5 度ずらす）
    for k in range(8):
        a = math.radians(22.5 + 45 * k)
        r0, r1 = 0.2, R - 0.03
        L = r1 - r0
        bpy.ops.mesh.primitive_cylinder_add(radius=0.034, depth=L, vertices=16,
                                            location=(math.cos(a) * (r0 + L / 2), -0.11, cz + math.sin(a) * (r0 + L / 2)),
                                            rotation=(0, math.pi / 2 - a, 0))
        o = bpy.context.object; o.data.materials.append(M_RING)
        for f in o.data.polygons: f.use_smooth = True
    # 軸（真ん中の丸い板と、鋲 8 つ）
    bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=0.1, vertices=48, location=(0, -0.15, cz), rotation=(math.pi / 2, 0, 0))
    o = bpy.context.object; o.data.materials.append(M_RING)
    md = o.modifiers.new('bevel', 'BEVEL'); md.width = 0.02; md.segments = 3
    for f in o.data.polygons: f.use_smooth = True
    for k in range(8):
        a = math.radians(22.5 + 45 * k)
        rivet(math.cos(a) * 0.14, cz + math.sin(a) * 0.14, -0.2, 0.018)
    # 輪の外の鋲（扉の板に留める）
    for k in range(16):
        a = math.radians(11.25 + 22.5 * k)
        rivet(math.cos(a) * (R + 0.12), cz + math.sin(a) * (R + 0.12), -0.012, 0.022)


def bolt_objects():
    """かんぬき（閉じた形：左の扉の受け金具まで差し込んだ所）。上・下の 2 本は同じ形なので、下の 1 本だけ作って絵にする"""
    zc = BEAM_Z[0]
    out = []
    # 棒：x が -0.48〜0.86（左の扉の止めの手前まで差し込んだ所）。開けるときは右へ 0.55 m 引く（左の端が合わせ目より右へ）
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=1.34, vertices=32, location=(0.19, -0.245, zc), rotation=(0, math.pi / 2, 0))
    o = bpy.context.object; o.data.materials.append(M_BOLT); out.append(o)
    md = o.modifiers.new('bevel', 'BEVEL'); md.width = 0.012; md.segments = 3
    for f in o.data.polygons: f.use_smooth = True
    # 取っ手（手前へ出た丸い握り）
    bpy.ops.mesh.primitive_cylinder_add(radius=0.035, depth=0.16, vertices=20, location=(0.66, -0.36, zc), rotation=(math.pi / 2, 0, 0))
    o = bpy.context.object; o.data.materials.append(M_RIVET); out.append(o)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055, segments=24, ring_count=12, location=(0.66, -0.45, zc))
    o = bpy.context.object; o.data.materials.append(M_RING); out.append(o)
    for f in o.data.polygons: f.use_smooth = True
    return out


# ---- 組み立て ----
door(-1)
door(1)
emblem()
bolts = bolt_objects()

# ---- 光：左上から大きな面の光（浮き出しの影ができる）、右下から弱い補いの光、写真の周りの景色（金属の映り込み） ----
world = bpy.data.worlds.new('w'); scn.world = world; world.use_nodes = True
wn = world.node_tree.nodes; wl = world.node_tree.links
env = wn.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(os.path.join(TEX, 'studio_small_09_1k.hdr'))
bg = wn['Background']; bg.inputs['Strength'].default_value = 0.4
wl.new(env.outputs['Color'], bg.inputs['Color'])


def area(name, loc, size, power, color, target=(0, 0, 2.0)):
    d = bpy.data.lights.new(name, 'AREA'); d.size = size; d.energy = power; d.color = color
    o = bpy.data.objects.new(name, d); scn.collection.objects.link(o)
    o.location = loc
    c = o.constraints.new('TRACK_TO')
    t = bpy.data.objects.new(name + '_t', None); scn.collection.objects.link(t); t.location = target
    c.target = t; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    return o


area('key', (-6.5, -4.5, 6.8), 3.5, 3000, (1.0, 0.94, 0.86))     # 左上から、門の面をかすめる強い光（浮き出しに影ができる）
area('rim', (7.0, -2.5, 4.0), 2.0, 900, (0.8, 0.87, 1.0))        # 右から、縁を光らせる弱い光
area('low', (1.0, -6.0, -1.5), 5.0, 180, (0.9, 0.9, 0.95))       # 下からの照り返し

# ---- カメラ（遠近の無い、正面から） ----
cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'
cam = bpy.data.objects.new('cam', cam_d); scn.collection.objects.link(cam); scn.camera = cam
cam.rotation_euler = (math.pi / 2, 0, 0)


def shoot(name, cx, cz, w_m, h_m, px_w, transparent=False, only=None):
    px_h = round(px_w * h_m / w_m)
    scn.render.resolution_x, scn.render.resolution_y = px_w, px_h
    scn.render.resolution_percentage = 100
    cam_d.ortho_scale = max(w_m, h_m)
    cam.location = (cx, -20, cz)
    scn.render.film_transparent = transparent
    for o in scn.objects:
        if o.type == 'MESH':
            o.hide_render = only is not None and o not in only
    scn.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print('描いた', name, px_w, 'x', px_h)


# 扉：かんぬきは描かない（別の絵）
others = [o for o in scn.objects if o.type == 'MESH' and o not in bolts]
shoot('gate_l.png', -HW / 2, GH / 2, HW, GH, HALF_W, only=others)
shoot('gate_r.png', HW / 2, GH / 2, HW, GH, HALF_W, only=others)
# かんぬき（下の 1 本。上の 1 本も同じ絵を使う）：x が -0.36〜0.92、高さは梁の真ん中 ±0.2
BX0, BX1, BZ = -0.52, 0.92, 0.42
shoot('gate_bolt.png', (BX0 + BX1) / 2, BEAM_Z[0], BX1 - BX0, BZ, round(HALF_W * (BX1 - BX0) / HW), transparent=True, only=bolts)

# ゲームが使う並びの数（m）。js/ui/time-gate.js がこの数で、かんぬきを扉の絵の上に置く
json.dump({'gate': [GW, GH], 'beamZ': BEAM_Z, 'bolt': {'x0': BX0, 'x1': BX1, 'h': BZ, 'travel': 0.55},
           'ring': RING}, open(os.path.join(OUT, 'gate.json'), 'w'), indent=1)
