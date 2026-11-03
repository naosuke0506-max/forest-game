# 葉の房（小枝に葉がたくさん付いたもの）の画像を Blender で描く（開発用の道具）
#
#   blender -b --python tools/trees_blender/make_leaf_atlas.py -- <種類 broad|needle> <葉の写真（色）> <葉の写真（透明）> <出力.png>
#
# 4 種類の房を 2×2 に並べた 1 枚の画像（1024×1024、透明あり）を作る。木の葉は 1 枚の四角（2 三角形）に、この房のどれかを貼る。
#   broad ：広葉樹。葉の写真（ambientCG Leaf001, CC0）の左半分の葉を、小枝の左右に 20〜30 枚付ける
#   needle：針葉樹。細い円柱の針を、小枝に沿って数百本付ける（写真は使わない）
import bpy, sys, math, random
from mathutils import Vector, Euler

kind, color_path, alpha_path, out = (sys.argv[sys.argv.index('--') + 1:] + [None] * 4)[:4]
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.engine = 'CYCLES'
scn.cycles.samples = 48
scn.cycles.device = 'CPU'
scn.render.film_transparent = True
scn.render.resolution_x = scn.render.resolution_y = 512
scn.render.image_settings.color_mode = 'RGBA'
scn.view_settings.view_transform = 'Standard'

# 光：全体を均一に（ゲームの中で影や向きの明るさを付けるので、画像はなるべく平らに）
world = bpy.data.worlds.new('w'); scn.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); scn.collection.objects.link(sun)
sun.data.energy = 1.5; sun.rotation_euler = Euler((math.radians(20), 0, 0))

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scn.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.0
cam.location = (0, 0, 5); scn.camera = cam

def mat_bark():
    m = bpy.data.materials.new('twig'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.11, 0.07, 1)
    return m

def mat_leaf():
    m = bpy.data.materials.new('leaf'); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = bpy.data.images.load(color_path)
    ta = nt.nodes.new('ShaderNodeTexImage'); ta.image = bpy.data.images.load(alpha_path); ta.image.colorspace_settings.name = 'Non-Color'
    nt.links.new(tc.outputs['Color'], p.inputs['Base Color'])
    nt.links.new(ta.outputs['Color'], p.inputs['Alpha'])
    p.inputs['Roughness'].default_value = 0.6
    m.blend_method = 'CLIP' if hasattr(m, 'blend_method') else None
    return m

def mat_needle():
    m = bpy.data.materials.new('needle'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.08, 0.17, 0.06, 1)
    return m

def cylinder(a, b, r, mat):
    d = Vector(b) - Vector(a)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=r, depth=d.length, location=(Vector(a) + Vector(b)) / 2)
    o = bpy.context.object
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    o.data.materials.append(mat)
    return o

def leaf(pos, ang, size, tilt, mat):
    # 写真の左半分の葉（u 0〜0.5）を、根元が pos に来るように置く
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    o = bpy.context.object
    me = o.data
    for v in me.vertices:
        v.co.x = (v.co.x + 0.5) * 0.5 - 0.25 + 0.0   # 幅は高さの半分
        v.co.y = v.co.y + 0.5                        # 根元を原点に
    uv = me.uv_layers.active.data
    for l in me.loops:
        co = me.vertices[l.vertex_index].co
        uv[l.index].uv = ((co.x + 0.25) * 1.0, co.y)  # u：0〜0.5（左の葉）、v：0〜1
    o.scale = (size, size, size)
    o.rotation_euler = Euler((math.radians(tilt), 0, ang))
    o.location = pos
    me.materials.append(mat)
    return o

def clear():
    for o in list(scn.objects):
        if o.type == 'MESH': bpy.data.objects.remove(o, do_unlink=True)

paths = []
for variant in range(4):
    clear()
    rnd = random.Random(variant * 7 + (0 if kind == 'broad' else 100))
    twig, leafm, needm = mat_bark(), (mat_leaf() if kind == 'broad' else None), (mat_needle() if kind == 'needle' else None)
    # 小枝：下の真ん中から上へ、少し曲がる
    pts = [Vector((0, -0.48, 0))]
    for i in range(1, 6):
        pts.append(Vector((math.sin(i * 0.6 + variant) * 0.05, -0.48 + i * 0.17, 0)))
    for a, b in zip(pts, pts[1:]):
        cylinder(a, b, 0.008 if kind == 'broad' else 0.006, twig)
    if kind == 'broad':
        # 葉：小枝の左右に交互に、横へ広げて付ける（先へ行くほど小さく）
        def leaves_along(a, b, n, spread, base_size):
            for i in range(n):
                t = 0.1 + 0.88 * i / n
                p = a.lerp(b, t)
                side = 1 if i % 2 else -1
                ang = side * rnd.uniform(*spread) + rnd.uniform(-0.15, 0.15)
                size = rnd.uniform(*base_size) * (1.15 - 0.4 * t)
                leaf(p, -ang, size, rnd.uniform(-30, 30), leafm)
        for a, b in zip(pts, pts[1:]):
            leaves_along(a, b, 5, (0.9, 1.6), (0.2, 0.27))
        # 横の小枝 2〜3 本と、その葉（房が横にも広がるように）
        for k in range(2 + variant % 2):
            t = 0.25 + 0.22 * k
            seg = min(4, int(t * 5)); p = pts[seg]
            side = 1 if (k + variant) % 2 else -1
            q = p + Vector((side * rnd.uniform(0.25, 0.32), rnd.uniform(0.12, 0.2), 0))
            cylinder(p, q, 0.006, twig)
            leaves_along(p, q, 6, (0.5, 1.3), (0.16, 0.22))
            leaf(q, -side * 0.9, 0.2, 0, leafm)
        leaf(pts[-1], 0, 0.24, 0, leafm)
    else:
        # 針：小枝に沿って数百本、斜め前へ
        for i in range(420):
            t = rnd.uniform(0.05, 1.0)
            seg = min(4, int(t * 5)); f = t * 5 - seg
            p = pts[seg].lerp(pts[seg + 1], f)
            a = rnd.uniform(0, math.tau)
            L = rnd.uniform(0.07, 0.12) * (1.15 - 0.4 * t)
            d = Vector((math.cos(a) * 0.9, 0.45, math.sin(a) * 0.5)).normalized()
            cylinder(p, p + d * L, 0.0035, needm)
        # 横の小さな枝
        for k in range(4):
            t = 0.25 + 0.17 * k
            seg = min(4, int(t * 5)); p = pts[seg]
            side = 1 if k % 2 else -1
            q = p + Vector((side * 0.22, 0.12, 0))
            cylinder(p, q, 0.004, twig)
            for i in range(90):
                u = rnd.uniform(0, 1); pp = p.lerp(q, u)
                a = rnd.uniform(0, math.tau); L = rnd.uniform(0.05, 0.09)
                d = Vector((math.cos(a) * 0.6 + side * 0.5, 0.5, math.sin(a) * 0.4)).normalized()
                cylinder(pp, pp + d * L, 0.003, needm)
    path = f'{out}.{variant}.png'
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    paths.append(path)
    print('描いた', path)

# 2×2 に並べる
W = 512
atlas = bpy.data.images.new('atlas', 2 * W, 2 * W, alpha=True)
import array
px = array.array('f', [0.0]) * (4 * W * W * 4)
for idx, p in enumerate(paths):
    im = bpy.data.images.load(p)
    src = array.array('f', [0.0]) * (W * W * 4); im.pixels.foreach_get(src)
    ox, oy = (idx % 2) * W, (idx // 2) * W
    for y in range(W):
        row = (oy + y) * 2 * W + ox
        px[row * 4: (row + W) * 4] = src[y * W * 4: (y + 1) * W * 4]
atlas.pixels.foreach_set(px)
atlas.filepath_raw = out; atlas.file_format = 'PNG'; atlas.save()
print('書き出し', out)
