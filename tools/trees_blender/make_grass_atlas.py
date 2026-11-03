# 草の株の画像を Blender で描く（開発用の道具）
#
#   blender -b --python tools/trees_blender/make_grass_atlas.py -- <出力.png>
#
# 2×2 に 4 種類（1024×1024、透明あり）：
#   左下：短い草、右下：穂のある草、左上：白い花の混じる草、右上：背の高い草（大草原）
# 草の葉は、根元が暗く先が明るい、細くとがった板。少し曲げて、横から（正面から）描く
import bpy, sys, math, random
from mathutils import Vector, Euler

out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.engine = 'CYCLES'; scn.cycles.samples = 32; scn.cycles.device = 'CPU'
scn.render.film_transparent = True
scn.render.resolution_x = scn.render.resolution_y = 512
scn.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new('w'); scn.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 1.1
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scn.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.0
cam.location = (0, -5, 0.5); cam.rotation_euler = Euler((math.radians(90), 0, 0)); scn.camera = cam

def mat_grad(name, base, tip):
    """根元（下）から先（上）へ色が変わる材質"""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*base, 1); ramp.color_ramp.elements[1].color = (*tip, 1)
    nt.links.new(tc.outputs['UV'], sep.inputs[0]); nt.links.new(sep.outputs['Y'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.7
    return m

def flat(name, col):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1)
    return m

def blade(x, h, w, lean, mat, segs=5):
    """とがった草の葉 1 枚（細い三角の帯を少し曲げる）"""
    me = bpy.data.meshes.new('b'); verts = []; faces = []; uvs = []
    for i in range(segs + 1):
        t = i / segs
        ww = w * (1 - t) * 0.5
        cx = x + lean * t * t * h
        z = h * t
        verts += [(cx - ww, 0, z), (cx + ww, 0, z)]
    for i in range(segs):
        a = i * 2; faces.append((a, a + 1, a + 3, a + 2))
    me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new()
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (0.5, v.z / max(h, 1e-3))
    o = bpy.data.objects.new('b', me); scn.collection.objects.link(o)
    o.location.y = random.uniform(-0.2, 0.2)    # 奥行きを少し散らす（重なりを自然に）
    me.materials.append(mat)
    return o

def flower(x, h, petal, mats):
    """白い花：細い茎の先に、白い花びらの円板と黄色い中心"""
    blade(x, h, 0.008, 0, mats['stem'], 3)
    bpy.ops.mesh.primitive_circle_add(vertices=10, radius=petal, fill_type='NGON', location=(x, -0.25, h))
    o = bpy.context.object; o.rotation_euler = Euler((math.radians(70), 0, 0)); o.data.materials.append(mats['petal'])
    bpy.ops.mesh.primitive_circle_add(vertices=8, radius=petal * 0.35, fill_type='NGON', location=(x, -0.26, h + 0.005))
    o = bpy.context.object; o.rotation_euler = Euler((math.radians(70), 0, 0)); o.data.materials.append(mats['center'])

mats = {
    'g1': mat_grad('g1', (0.05, 0.14, 0.03), (0.32, 0.55, 0.12)),
    'g2': mat_grad('g2', (0.06, 0.16, 0.03), (0.45, 0.62, 0.15)),
    'dry': mat_grad('dry', (0.1, 0.16, 0.04), (0.62, 0.6, 0.3)),
    'stem': mat_grad('stem', (0.05, 0.14, 0.03), (0.2, 0.4, 0.1)),
    'petal': flat('petal', (0.95, 0.95, 0.9)),
    'center': flat('center', (0.9, 0.7, 0.1)),
    'seed': flat('seed', (0.55, 0.5, 0.3)),
}

def clear():
    for o in list(scn.objects):
        if o.type == 'MESH': bpy.data.objects.remove(o, do_unlink=True)

tiles = []
for variant in range(4):
    clear(); random.seed(variant * 31 + 7)
    tall = variant == 3
    n = 140 if not tall else 110
    for i in range(n):
        x = random.gauss(0, 0.17 if not tall else 0.2)
        x = max(-0.46, min(0.46, x))
        h = random.uniform(0.35, 0.9) * (1.0 if tall else 0.7) * (1 - abs(x) * 0.9)
        m = mats['dry'] if (tall and random.random() < 0.35) else (mats['g2'] if random.random() < 0.5 else mats['g1'])
        blade(x, h, random.uniform(0.018, 0.03), random.uniform(-0.35, 0.35), m)
    if variant == 1:   # 穂
        for i in range(10):
            x = random.uniform(-0.3, 0.3); h = random.uniform(0.6, 0.85)
            blade(x, h, 0.006, random.uniform(-0.1, 0.1), mats['stem'], 3)
            bpy.ops.mesh.primitive_uv_sphere_add(segments=6, ring_count=4, radius=0.02, location=(x, -0.25, h))
            o = bpy.context.object; o.scale = (0.6, 0.6, 2.2); o.data.materials.append(mats['seed'])
    if variant == 2:   # 白い花
        for i in range(7):
            flower(random.uniform(-0.35, 0.35), random.uniform(0.35, 0.6), random.uniform(0.035, 0.05), mats)
    if tall:          # 背の高い草の穂
        for i in range(14):
            x = random.uniform(-0.4, 0.4); h = random.uniform(0.85, 0.98)
            blade(x, h, 0.006, random.uniform(-0.15, 0.15), mats['dry'], 3)
            bpy.ops.mesh.primitive_uv_sphere_add(segments=6, ring_count=4, radius=0.018, location=(x, -0.25, h))
            o = bpy.context.object; o.scale = (0.6, 0.6, 3.0); o.data.materials.append(mats['seed'])
    p = f'{out}.{variant}.png'; scn.render.filepath = p
    bpy.ops.render.render(write_still=True); tiles.append(p)

# 2×2 に並べる（画像の下半分 = v 0〜0.5）
W = 512
import array
atlas = bpy.data.images.new('atlas', 2 * W, 2 * W, alpha=True)
px = array.array('f', [0.0]) * (4 * W * W * 4)
for idx, p in enumerate(tiles):
    im = bpy.data.images.load(p); src = array.array('f', [0.0]) * (W * W * 4); im.pixels.foreach_get(src)
    ox, oy = (idx % 2) * W, (idx // 2) * W
    for y in range(W):
        row = (oy + y) * 2 * W + ox
        px[row * 4: (row + W) * 4] = src[y * W * 4: (y + 1) * W * 4]
atlas.pixels.foreach_set(px); atlas.filepath_raw = out; atlas.file_format = 'PNG'; atlas.save()
print('書き出し', out)
