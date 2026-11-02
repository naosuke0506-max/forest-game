# キャラの模型をゲーム用に作る（Blender 4.2 で実行する開発用の道具。ゲームは読み込まない）
#
#   blender -b --python tools/characters/build_character.py -- <キャラ名> <動きの元の GLB> <出力先フォルダ>
#
# 1. Tripo で骨を付けた GLB（source_models/characters/）を読み込む
# 2. 動きの元（魔境争覇の剣士の模型）から、要る動きを Tripo の骨へ移す
#    骨の向きの違い（元は腕を斜め下に下ろした姿勢、Tripo は T ポーズ）は、骨ごとの補正で吸収する
# 3. 武器・盾を持たせる位置（socket_R / socket_L / socket_bow）を、元の模型の武器の位置から測って手に付ける
# 4. 三角形を減らし、質感の画像を小さくして GLB に書き出す。動きの長さ・速さは <キャラ名>.json に書く
import bpy, sys, os, json
import numpy as np
from mathutils import Matrix, Quaternion, Vector

name, src_path, out_dir = sys.argv[sys.argv.index('--') + 1:]
here = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(here, 'characters.json')))
ch = cfg['characters'][name]
tgt_path = os.path.join(here, '..', '..', 'source_models', 'characters', ch['source'])
g = ch['group']

# ゲームの動きの名前 → 元の動きの名前。loop：繰り返す動き（体が前へ進む分は消し、その速さを記録する）
if g == 'bw':
    CLIPS = {'idle': 'idle_bw', 'walk': 'walk_bw', 'back': 'back_bw', 'run': 'run_bw',
             'draw': 'bw_draw', 'shoot': 'bw_shoot', 'hit': 'bw_hit', 'stagger': 'bw_stagger', 'death': 'death'}
else:
    CLIPS = {'idle': f'idle_{g}', 'walk': f'walk_{g}', 'back': f'back_{g}', 'run': f'run_{g}',
             'a1': f'{g}_a1', 'a2': f'{g}_a2', 'a3': f'{g}_a3', 'heavy': f'{g}_heavy',
             'guard': ch.get('guard', f'{g}_guard'), 'hit': f'{g}_hit', 'stagger': f'{g}_stagger', 'death': 'death'}
LOOP = {'idle', 'walk', 'back', 'run', 'guard'}

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.fps = 30

def load(p):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=p)
    new = [o for o in bpy.data.objects if o not in before]
    return new, next(o for o in new if o.type == 'ARMATURE')

src_objs, S = load(src_path)
src_actions = {a.name: a for a in bpy.data.actions}
tgt_objs, T = load(tgt_path)
# Tripo が付けた動きは外す
if T.animation_data:
    for tr in list(T.animation_data.nla_tracks): T.animation_data.nla_tracks.remove(tr)
    T.animation_data.action = None
for a in list(bpy.data.actions):
    if a not in src_actions.values(): bpy.data.actions.remove(a)

# 骨の対応（元 → Tripo）
M = {'hips': 'Hip', 'spine': 'Waist', 'spine2': 'Spine01', 'chest': 'Spine02',
     'neck': 'NeckTwist01', 'neck2': 'NeckTwist02', 'head': 'Head'}
for s in 'LR':
    M.update({f'clav{s}': f'{s}_Clavicle', f'sh{s}': f'{s}_Upperarm', f'el{s}': f'{s}_Forearm', f'hand{s}': f'{s}_Hand',
              f'hip{s}': f'{s}_Thigh', f'knee{s}': f'{s}_Calf', f'foot{s}': f'{s}_Foot', f'toe{s}': f'{s}_ToeBase',
              f'thumb{s}': f'{s}_Thumb1'})
    for f in ('Index', 'Mid', 'Ring', 'Pinky'):
        M[(f'fing{s}1', f)] = f'{s}_{f}1'; M[(f'fing{s}2', f + '2')] = f'{s}_{f}2'; M[(f'fing{s}2', f + '3')] = f'{s}_{f}3'
tgt2src = {t: (s[0] if isinstance(s, tuple) else s) for s, t in M.items()}
nxt_src = {'hips': 'spine', 'spine': 'spine2', 'spine2': 'chest', 'chest': 'neck', 'neck': 'neck2', 'neck2': 'head'}
nxt_tgt = {'Hip': 'Waist', 'Waist': 'Spine01', 'Spine01': 'Spine02', 'Spine02': 'NeckTwist01', 'NeckTwist01': 'NeckTwist02', 'NeckTwist02': 'Head'}
for s in 'LR':
    nxt_src.update({f'clav{s}': f'sh{s}', f'sh{s}': f'el{s}', f'el{s}': f'hand{s}', f'hand{s}': f'fing{s}1',
                    f'hip{s}': f'knee{s}', f'knee{s}': f'foot{s}', f'foot{s}': f'toe{s}', f'fing{s}1': f'fing{s}2'})
    nxt_tgt.update({f'{s}_Clavicle': f'{s}_Upperarm', f'{s}_Upperarm': f'{s}_Forearm', f'{s}_Forearm': f'{s}_Hand',
                    f'{s}_Hand': f'{s}_Mid1', f'{s}_Thigh': f'{s}_Calf', f'{s}_Calf': f'{s}_Foot', f'{s}_Foot': f'{s}_ToeBase'})
    for f in ('Index', 'Mid', 'Ring', 'Pinky'): nxt_tgt[f'{s}_{f}1'] = f'{s}_{f}2'

SB, TB = S.data.bones, T.data.bones
def rest_dir(bones, n, nxt):
    return (bones[nxt[n]].head_local - bones[n].head_local).normalized() if n in nxt else None
corr = {}
for t, s in tgt2src.items():
    if t not in TB: continue
    ds, dt = rest_dir(SB, s, nxt_src), rest_dir(TB, t, nxt_tgt)
    corr[t] = dt.rotation_difference(ds) if (ds and dt) else None
def get_corr(t):
    b = TB[t]
    while b is not None:
        if corr.get(b.name) is not None: return corr[b.name]
        b = b.parent
    return Quaternion()
scale = TB['Hip'].head_local.z / SB['hips'].head_local.z

order = []
def walk(b):
    order.append(b)
    for c in b.children: walk(c)
for b in TB:
    if b.parent is None: walk(b)

T.animation_data_create(); S.animation_data_create()
for tr in list(S.animation_data.nla_tracks): S.animation_data.nla_tracks.remove(tr)
info = {}
made = []
for game_name, clip in CLIPS.items():
    act = src_actions.get(clip + '_rig') or src_actions.get(clip)
    if not act: raise SystemExit(f'動きが見つからない: {clip}')
    S.animation_data.action = act
    f0, f1 = map(int, act.frame_range)
    new = bpy.data.actions.new(game_name); new.use_fake_user = True
    T.animation_data.action = new
    hip_start = hip_end = None
    keys = []
    foot_v = []; prev = None
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        Mw = {}
        for b in order:
            R_b = b.matrix_local
            base = Mw[b.parent.name] @ (b.parent.matrix_local.inverted() @ R_b) if b.parent else R_b.copy()
            s = tgt2src.get(b.name)
            if s:
                sp = S.pose.bones[s]
                q = sp.matrix.to_quaternion() @ SB[s].matrix_local.to_quaternion().inverted() @ get_corr(b.name) @ R_b.to_quaternion()
                loc = base.to_translation()
                if b.name == 'Hip':
                    off = (sp.matrix.to_translation() - SB[s].matrix_local.to_translation()) * scale
                    if hip_start is None: hip_start = off.copy()
                    hip_end = off.copy()
                    if game_name in LOOP:   # その場で動くようにする（上下の揺れは残す）
                        off.x = 0; off.y = 0
                    loc = R_b.to_translation() + off
                Mb = Matrix.Translation(loc) @ q.to_matrix().to_4x4()
            else:
                Mb = base
            Mw[b.name] = Mb
        keys.append({b.name: Mw[b.name] for b in order})
        # 地面に着いている方の足（低い方）が後ろへ滑る速さ ＝ その場の動きで進むはずの速さ
        feet = [Mw[n].to_translation() - Mw['Hip'].to_translation() * Vector((0, 0, 0)) for n in ('L_Foot', 'R_Foot')]
        low = min(range(2), key=lambda k: feet[k].z)
        if prev is not None and prev[0] == low:
            d = feet[low] - prev[1]; d.z = 0
            foot_v.append(d.length * scn.render.fps)
        prev = (low, feet[low])
    for i, frame in enumerate(keys):
        for b in order:
            pb = T.pose.bones[b.name]
            Mb = frame[b.name]
            basis = ((b.parent.matrix_local.inverted() @ b.matrix_local).inverted() @ frame[b.parent.name].inverted() @ Mb) if b.parent else (b.matrix_local.inverted() @ Mb)
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = basis.to_quaternion()
            pb.keyframe_insert('rotation_quaternion', frame=i, group=b.name)
            if b.name == 'Hip':
                pb.location = basis.to_translation()
                pb.keyframe_insert('location', frame=i, group=b.name)
    dur = (f1 - f0) / scn.render.fps
    travel = (hip_end - hip_start); travel.z = 0
    info[game_name] = {'duration': round(dur, 4), 'loop': game_name in LOOP,
                       'speed': round(max(travel.length / dur if dur > 0 else 0, float(np.median(foot_v)) if (foot_v and game_name in ('walk', 'back', 'run')) else 0), 4)}   # 1 秒あたりに進む量（模型の大きさのまま）
    made.append(new)
    print('動き', game_name, '←', clip, f1 - f0 + 1, 'フレーム', info[game_name])

# 武器を持たせる位置
S.animation_data.action = None; T.animation_data.action = None
for pb in list(S.pose.bones) + list(T.pose.bones):
    pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
bpy.context.view_layer.update()
def make_socket(sname, side, weapon, kind):
    o = bpy.data.objects[weapon]
    V = np.array([(o.matrix_world @ v.co)[:] for v in o.data.vertices])
    c = V.mean(0); _, _, W = np.linalg.svd(V - c, full_matrices=False)
    hc = (SB[f'hand{side}'].head_local + SB[f'fing{side}1'].head_local) / 2
    if kind == 'blade':      # +Z（ゲームでは +Y）が刃先、+X が刃の幅
        z = Vector(W[0]); proj = (V - np.array(hc[:])) @ W[0]
        if abs(proj.max()) < abs(proj.min()): z = -z
        x = Vector(W[1]); origin = hc
    elif kind == 'bow':      # +Z が上の弓の先、握りは手の中
        z = Vector(W[0])
        if z.z < 0: z = -z
        x = Vector(W[1]); origin = hc
    else:                    # 盾：+Z が縦、+X が腕から盾の板への向き
        z = Vector(W[0])
        if z.z < 0: z = -z
        n = Vector(W[2]); x = n if n.dot(Vector(c) - hc) > 0 else -n
        origin = Vector(c)
    y = z.cross(x).normalized(); x = y.cross(z).normalized()
    Msrc = Matrix((x, y, z)).transposed().to_4x4(); Msrc.translation = origin
    rel = SB[f'hand{side}'].matrix_local.inverted() @ Msrc
    rel.translation = rel.translation * scale
    tname = f'{side}_Hand'
    Mworld = Matrix.Translation(TB[tname].head_local) @ get_corr(tname).inverted().to_matrix().to_4x4() @ SB[f'hand{side}'].matrix_local.to_quaternion().to_matrix().to_4x4() @ rel
    e = bpy.data.objects.new(sname, None); scn.collection.objects.link(e)
    e.parent = T; e.parent_type = 'BONE'; e.parent_bone = tname
    bpy.context.view_layer.update()
    e.matrix_world = Mworld
make_socket('socket_R', 'R', 'w_1h', 'blade')
make_socket('socket_L', 'L', 's_mid', 'shield')
make_socket('socket_bow', 'L', 'w_bow', 'bow')
for o in src_objs: bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    if a not in made: bpy.data.actions.remove(a)

# 三角形を減らす・質感の画像を小さくする
# Tripo の GLB には体のほかに小さな補助の形が入っていることがあるので、一番大きい形を体とみなす
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
mesh = max(meshes, key=lambda o: len(o.data.polygons))
for o in meshes:
    if o is not mesh: print('外す形', o.name, len(o.data.polygons)); bpy.data.objects.remove(o, do_unlink=True)
tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
ratio = min(1.0, cfg['targetTris'] / tris)
if ratio < 1:
    bpy.context.view_layer.objects.active = mesh
    d = mesh.modifiers.new('decimate', 'DECIMATE'); d.ratio = ratio
    while mesh.modifiers[0] != d: bpy.ops.object.modifier_move_up(modifier='decimate')
    bpy.ops.object.modifier_apply(modifier='decimate')
size = cfg['textureSize']
for img in bpy.data.images:
    if img.size[0] > size: img.scale(size, size)
zs = [(mesh.matrix_world @ v.co).z for v in mesh.data.vertices]
height = max(zs) - min(zs)

T.animation_data.action = None
for a in made:
    tr = T.animation_data.nla_tracks.new(); tr.name = a.name; tr.strips.new(a.name, 0, a)
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, f'{name}.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animation_mode='NLA_TRACKS',
                          export_force_sampling=True, export_optimize_animation_size=True,
                          export_image_format='JPEG', export_jpeg_quality=85)
tris_after = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
meta = {'scale': round(cfg['height'] / height, 4), 'tris': tris_after, 'group': g, 'clips': info}
json.dump(meta, open(os.path.join(out_dir, f'{name}.json'), 'w'), ensure_ascii=False, indent=1)
print('書き出し', out, '三角形', tris, '→', tris_after, '高さ', round(height, 3))
