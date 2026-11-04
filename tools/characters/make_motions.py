# キャラの追加の動きを作る（Blender 4.2 で実行する開発用の道具。ゲームは読み込まない）
#
#   blender -b --python tools/characters/make_motions.py -- <しゃがみの FBX> <出力の .blend>
#
# 1. 利用者が作ったしゃがみ（その場）の動き（Meshy AI の Mixamo 式の骨の FBX）を読み込み、「crouch」とする
# 2. 同じ骨で、ほかの動きを手で付ける（骨が向く方向を、体の向き（右・上・前）で決め、1 フレームずつ解く）
#      crouch_walk：しゃがみ歩き（繰り返す・その場）
#      prone_down：立った所から伏せる、prone：伏せて肘をつく（繰り返す）、crawl：這う（繰り返す・その場）、prone_up：起き上がる
#      cover_l・cover_r：壁に背を付けて、左・右を覗う（繰り返す）
# 3. 骨と動きだけを .blend に書き出す（tools/characters/build_character.py が、これを Tripo の骨へ移す）
# 動きの速さ（その場の動きで進むはずの速さ。骨の大きさのまま m/秒）は、動きの「speed」に書いておく
import bpy, sys, math
from mathutils import Vector, Quaternion, Matrix

fbx_path, out_path = sys.argv[sys.argv.index('--') + 1:]
FPS = 30
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.fps = FPS
bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=False)
A = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
crouch = A.animation_data.action
crouch.name = 'crouch'
crouch.use_fake_user = True
P = 'mixamorig:'
BN = A.data.bones

# 骨の空間：上が +Y、体の左が +X、前が +Z。体の向きの座標（右・上・前）からの変換
def C(x, y, z):
    return Vector((-x, y, z)).normalized()

order = []
def walk(b):
    order.append(b)
    for c in b.children: walk(c)
for b in BN:
    if b.parent is None: walk(b)
rest_q = {b.name: b.matrix_local.to_quaternion() for b in BN}
rest_h = {b.name: b.head_local.copy() for b in BN}
FINGERS = [b.name for b in BN if any(k in b.name for k in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky'))]

# 指：しゃがみの最初のフレームの握り方を、ほかの動きにも使う（手のひらに対する向きのまま）
scn.frame_set(int(crouch.frame_range[0]))
finger_basis = {n: A.pose.bones[n].rotation_quaternion.copy() if A.pose.bones[n].rotation_mode == 'QUATERNION'
                else A.pose.bones[n].matrix_basis.to_quaternion() for n in FINGERS}
for pb in A.pose.bones:
    pb.rotation_mode = 'QUATERNION'

def solve(pose):
    """pose：root（腰の位置 Vector・骨の空間）、rot（体全体の回転）、dirs（骨 → 向き。体の向きの座標）、
    twist（骨 → その骨の向きを軸にした回転の角度 度）、turn（骨 → 骨の空間での回転 Quaternion。首を回すなど）
    返り値：骨ごとの、骨の空間での回転と頭の位置"""
    W, H = {}, {}
    root_rot = pose.get('rot', Quaternion())
    dirs, twist, turn = pose.get('dirs', {}), pose.get('twist', {}), pose.get('turn', {})
    for b in order:
        n = b.name
        if b.parent is None:
            q = root_rot @ rest_q[n]
            H[n] = pose['root'].copy()
        else:
            p = b.parent.name
            q = W[p] @ rest_q[p].inverted() @ rest_q[n]
            H[n] = H[p] + (W[p] @ rest_q[p].inverted()) @ (rest_h[n] - rest_h[p])
            if n in finger_basis: q = q @ finger_basis[n]
        if n in dirs:
            cur = q @ Vector((0, 1, 0))
            q = cur.rotation_difference(dirs[n]) @ q
        if n in twist:
            ax = q @ Vector((0, 1, 0))
            q = Quaternion(ax, math.radians(twist[n])) @ q
        if n in turn:
            q = turn[n] @ q
        W[n] = q
    return W, H

def bone_len(n):
    return BN[n].length

def apply(W, root_pos, frame):
    for b in order:
        n, pb = b.name, A.pose.bones[b.name]
        if b.parent is None:
            Mb = Matrix.Translation(root_pos) @ W[n].to_matrix().to_4x4()
            basis = b.matrix_local.inverted() @ Mb
            pb.location = basis.to_translation()
            pb.keyframe_insert('location', frame=frame, group=n)
        else:
            p = b.parent.name
            basis_q = (rest_q[p].inverted() @ rest_q[n]).inverted() @ W[p].inverted() @ W[n]
            basis = basis_q
        pb.rotation_quaternion = basis.to_quaternion() if b.parent is None else basis
        pb.keyframe_insert('rotation_quaternion', frame=frame, group=n)

def new_action(name, speed=0.0, loop=False):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    act['speed'] = speed     # その場の動きで進むはずの速さ（骨の大きさのまま m/秒）
    act['loop'] = loop
    A.animation_data.action = act
    return act

def ground_root(pose, foot_names=('LeftFoot', 'RightFoot'), clearance=None):
    """足（足首）の低い方が、立ったときと同じ高さになるように腰の高さを合わせる"""
    W, H = solve(pose)
    lo = min(H[P + f].y for f in foot_names)
    want = rest_h[P + 'LeftFoot'].y if clearance is None else clearance
    pose['root'] = pose['root'] + Vector((0, want - lo, 0))
    return pose

def lerp_pose(a, b, t):
    """2 つの姿勢の間（向きは球面で、位置は直線で）"""
    out = {'root': a['root'].lerp(b['root'], t), 'rot': a.get('rot', Quaternion()).slerp(b.get('rot', Quaternion()), t), 'dirs': {}, 'twist': {}, 'turn': {}}
    for k in set(a.get('dirs', {})) | set(b.get('dirs', {})):
        da, db = a['dirs'].get(k), b['dirs'].get(k)
        if da is None or db is None: out['dirs'][k] = da or db; continue
        q = da.rotation_difference(db)
        out['dirs'][k] = (Quaternion().slerp(q, t) @ da).normalized()
    for k in set(a.get('twist', {})) | set(b.get('twist', {})):
        out['twist'][k] = a.get('twist', {}).get(k, 0) * (1 - t) + b.get('twist', {}).get(k, 0) * t
    for k in set(a.get('turn', {})) | set(b.get('turn', {})):
        out['turn'][k] = a.get('turn', {}).get(k, Quaternion()).slerp(b.get('turn', {}).get(k, Quaternion()), t)
    return out

def D(**kw):
    """骨の名前（mixamorig: を除く）→ 向き（右・上・前）"""
    return {P + k: C(*v) for k, v in kw.items()}

def mirror_dirs(d):
    return {k: v for k, v in d.items()}

hip0 = rest_h[P + 'Hips']
smooth = lambda t: t * t * (3 - 2 * t)

# ===== 立った姿勢（腕を下ろす。伏せる・起き上がるの始まりと終わり） =====
STAND = {'root': hip0.copy(), 'dirs': D(
    Spine=(0, 1, 0.02), Spine1=(0, 1, 0.03), Spine2=(0, 1, 0.03), Neck=(0, 1, 0.08), Head=(0, 1, 0.05),
    LeftArm=(-0.18, -1, 0.04), LeftForeArm=(-0.1, -0.85, 0.5), LeftHand=(-0.05, -0.8, 0.55),
    RightArm=(0.18, -1, 0.04), RightForeArm=(0.1, -0.85, 0.5), RightHand=(0.05, -0.8, 0.55),
    LeftUpLeg=(-0.08, -1, 0.02), LeftLeg=(-0.04, -1, -0.02), LeftFoot=(-0.08, -0.5, 0.86),
    RightUpLeg=(0.08, -1, 0.02), RightLeg=(0.04, -1, -0.02), RightFoot=(0.08, -0.5, 0.86))}
STAND = ground_root(STAND)

# ===== しゃがみ歩き（繰り返す。2 歩で 1 回り） =====
def crouch_walk_pose(ph):
    lean = 0.62
    dirs = D(Spine=(0, 1, lean), Spine1=(0, 1, lean * 0.9), Spine2=(0, 1, lean * 0.6), Neck=(0, 1, 0.1), Head=(0, 1, -0.05),
             LeftArm=(-0.25, -0.9, 0.35), LeftForeArm=(0.15, -0.2, 1), LeftHand=(0.15, -0.1, 1),
             RightArm=(0.25, -0.9, 0.35), RightForeArm=(-0.1, -0.25, 1), RightHand=(-0.1, -0.15, 1))
    for side, off in (('Left', 0.0), ('Right', 0.5)):
        s = -1 if side == 'Left' else 1
        a = 2 * math.pi * (ph + off)
        hip = math.radians(38 + 30 * math.cos(a))               # 腿の前への角度（前へ出す・後ろへ送る）
        knee = math.radians(75 + 30 * max(0.0, math.sin(a)))    # 膝の曲げ（振り出すときは高く上げる）
        dirs[P + side + 'UpLeg'] = C(s * 0.12, -math.cos(hip), math.sin(hip))
        dirs[P + side + 'Leg'] = C(s * 0.05, -math.cos(hip - knee), math.sin(hip - knee))
        dirs[P + side + 'Foot'] = C(s * 0.1, -0.35, 0.94)
    sway = math.radians(4 * math.sin(2 * math.pi * ph))
    pose = {'root': hip0.copy(), 'rot': Quaternion((0, 1, 0), sway), 'dirs': dirs}
    return ground_root(pose)

STEP = 0.36   # 1 歩の長さ（m）：1 回り（2 歩）で 0.72m 進む
cw = new_action('crouch_walk', speed=2 * STEP / 1.1, loop=True)
n = int(round(1.1 * FPS))
for f in range(n + 1):
    pose = crouch_walk_pose(f / n)
    W, H = solve(pose); apply(W, pose['root'], f)

# ===== 伏せる（肘をついて頭を上げる） =====
HIP_LOW = 0.16   # 伏せたときの腰の高さ（体の厚みの半分ほど。腿は地面に着く）
def aim(pose, bone, target):
    """骨の根もとから target（骨の空間の点）へ向ける（腕を地面に着けるため）"""
    W, H = solve(pose)
    pose['dirs'][P + bone] = (target - H[P + bone]).normalized()
def elbows_down(pose, reach=(0.0, 0.0), spread=0.06):
    """肘を肩の下の地面に着け、前腕を地面に沿って前へ。reach：左右の肘を肩からどれだけ前へ出すか（m）"""
    W, H = solve(pose)
    for i, side in enumerate(('Left', 'Right')):
        s = -1 if side == 'Left' else 1
        sh = H[P + side + 'Arm']
        aim(pose, side + 'Arm', Vector((sh.x - s * spread, 0.06, sh.z + reach[i])))
def prone_pose(breath=0.0, lift=0.0):
    rot = Quaternion((1, 0, 0), math.radians(90 - 8 - lift))   # 体を前へ倒して寝かせる（胸を少し上げる）
    d = D(Spine=(0, 0.1 + breath, 1), Spine1=(0, 0.22 + breath, 1), Spine2=(0, 0.3 + breath, 1), Neck=(0, 0.75, 0.65), Head=(0, 0.95, 0.3),
          LeftArm=(-0.2, -1, 0.1), LeftForeArm=(0.28, -0.04, 1), LeftHand=(0.25, -0.02, 1),
          RightArm=(0.2, -1, 0.1), RightForeArm=(-0.28, -0.04, 1), RightHand=(-0.25, -0.02, 1),
          LeftUpLeg=(-0.12, -0.24, -1), LeftLeg=(-0.07, 0.0, -1), LeftFoot=(-0.05, -0.85, -0.55), LeftToeBase=(0, -1, -0.2),
          RightUpLeg=(0.12, -0.24, -1), RightLeg=(0.07, 0.0, -1), RightFoot=(0.05, -0.85, -0.55), RightToeBase=(0, -1, -0.2))
    pose = {'root': Vector((hip0.x, HIP_LOW, hip0.z)), 'rot': rot, 'dirs': d}
    elbows_down(pose)
    return pose

def lowest_y(pose, names):
    W, H = solve(pose)
    return min(H[P + n].y for n in names)

def settle(pose, names=('LeftForeArm', 'RightForeArm', 'LeftLeg', 'RightLeg', 'LeftToeBase', 'RightToeBase'), floor=0.06):
    """伏せた体：肘・膝・つま先の低い所が床（少し上）に着くように腰の高さを合わせる"""
    lo = lowest_y(pose, names)
    pose['root'] = pose['root'] + Vector((0, floor - lo, 0))
    return pose

pr = new_action('prone', loop=True)
n = int(round(2.4 * FPS))
for f in range(n + 1):
    b = 0.03 * math.sin(2 * math.pi * f / n)   # 息
    pose = prone_pose(breath=b)
    W, H = solve(pose); apply(W, pose['root'], f)

# ===== 這う（肘と膝を左右互い違いに。その場） =====
def crawl_pose(ph):
    pose = prone_pose(breath=0.0, lift=-4)   # 這うときは胸を低く
    pose['root'] = Vector((hip0.x, HIP_LOW - 0.02, hip0.z))
    d = pose['dirs']
    reach = []
    for side, off in (('Left', 0.0), ('Right', 0.5)):
        s = -1 if side == 'Left' else 1
        a = 2 * math.pi * (ph + off)
        k = 0.5 + 0.5 * math.cos(a)     # 1：肘を前へ出す、0：引き寄せる
        reach.append(-0.06 + 0.2 * k)
        d[P + side + 'ForeArm'] = C(-s * 0.3, -0.04, 1)
        # 反対側の脚：肘を引き寄せるときに、膝を横から前へ引き上げる（腿は地面に沿う）
        m = 1 - k
        leg = 'Right' if side == 'Left' else 'Left'
        ls = -s
        d[P + leg + 'UpLeg'] = C(ls * (0.12 + 0.6 * m), -0.24 + 0.08 * m, -1 + 0.6 * m)
        d[P + leg + 'Leg'] = C(-ls * 0.25 * m + ls * 0.07, 0.0, -1)
    roll = math.radians(5 * math.sin(2 * math.pi * ph))
    pose['rot'] = Quaternion((0, 0, 1), roll) @ pose['rot']
    elbows_down(pose, reach=tuple(reach))
    return pose

cr = new_action('crawl', speed=0.55 / 1.3, loop=True)   # 1 回り（左右 1 回ずつ）で 0.55m 進む
n = int(round(1.3 * FPS))
for f in range(n + 1):
    pose = crawl_pose(f / n)
    W, H = solve(pose); apply(W, pose['root'], f)

# ===== 伏せる途中：膝をつく → 手をつく → 伏せる =====
KNEEL = ground_root({'root': hip0.copy(), 'dirs': D(
    Spine=(0, 1, 0.35), Spine1=(0, 1, 0.4), Spine2=(0, 1, 0.4), Neck=(0, 1, 0.3), Head=(0, 1, 0.1),
    LeftArm=(-0.2, -0.9, 0.4), LeftForeArm=(-0.05, -0.8, 0.6), LeftHand=(0, -0.8, 0.6),
    RightArm=(0.2, -0.9, 0.4), RightForeArm=(0.05, -0.8, 0.6), RightHand=(0, -0.8, 0.6),
    LeftUpLeg=(-0.12, -0.75, 0.66), LeftLeg=(-0.05, -0.15, -1), LeftFoot=(0, -0.6, -0.8),
    RightUpLeg=(0.12, -1, 0.12), RightLeg=(0.05, -0.1, -1), RightFoot=(0, -0.6, -0.8))}, ('LeftLeg', 'RightLeg'))
FOURS = {'root': hip0.copy(), 'rot': Quaternion((1, 0, 0), math.radians(62)), 'dirs': D(
    Spine=(0, 0.35, 1), Spine1=(0, 0.3, 1), Spine2=(0, 0.25, 1), Neck=(0, 0.6, 0.8), Head=(0, 0.85, 0.5),
    LeftArm=(-0.15, -1, 0.15), LeftForeArm=(-0.05, -1, 0.1), LeftHand=(0, -0.3, 1),
    RightArm=(0.15, -1, 0.15), RightForeArm=(0.05, -1, 0.1), RightHand=(0, -0.3, 1),
    LeftUpLeg=(-0.1, -1, 0.05), LeftLeg=(-0.05, -0.1, -1), LeftFoot=(0, -0.7, -0.7),
    RightUpLeg=(0.1, -1, 0.05), RightLeg=(0.05, -0.1, -1), RightFoot=(0, -0.7, -0.7))}
FOURS = settle(FOURS, ('LeftHand', 'RightHand', 'LeftLeg', 'RightLeg'), floor=0.08)
PRONE = prone_pose()
keys = [(0.0, STAND), (0.3, KNEEL), (0.62, FOURS), (1.0, PRONE)]
def along(keys, t):
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t <= t1: return lerp_pose(a, b, smooth((t - t0) / (t1 - t0)))
    return keys[-1][1]
for name, dur, rev in (('prone_down', 1.0, False), ('prone_up', 1.0, True)):
    new_action(name)
    n = int(round(dur * FPS))
    for f in range(n + 1):
        t = f / n
        pose = along(keys, 1 - t if rev else t)
        W, H = solve(pose); apply(W, pose['root'], f)

# ===== 壁に背を付けて覗う（左・右） =====
def cover_pose(side, ph):
    s = 1 if side == 'l' else -1                         # 体の左（+X）へ顔を向けるのが l
    look = math.radians(62 + 6 * math.sin(2 * math.pi * ph))
    b = 0.015 * math.sin(2 * math.pi * ph)
    d = D(Spine=(0, 1, -0.06 + b), Spine1=(0, 1, -0.08 + b), Spine2=(0, 1, -0.1 + b), Neck=(0, 1, -0.02), Head=(0, 1, -0.04),
          LeftArm=(-0.3, -0.92, -0.15), LeftForeArm=(0.55, 0.45, 0.7), LeftHand=(0.6, 0.5, 0.6),
          RightArm=(0.3, -0.92, -0.15), RightForeArm=(-0.55, 0.45, 0.7), RightHand=(-0.6, 0.5, 0.6),
          LeftUpLeg=(-0.1, -1, 0.06), LeftLeg=(-0.06, -1, -0.06), LeftFoot=(-0.1, -0.5, 0.86),
          RightUpLeg=(0.1, -1, 0.06), RightLeg=(0.06, -1, -0.06), RightFoot=(0.1, -0.5, 0.86))
    turn = {P + 'Neck': Quaternion((0, 1, 0), s * look * 0.45), P + 'Head': Quaternion((0, 1, 0), s * look * 0.55)}
    pose = {'root': hip0.copy() + Vector((0, 0, -0.03)), 'dirs': d, 'turn': turn}
    return ground_root(pose)
for side in ('l', 'r'):
    new_action(f'cover_{side}', loop=True)
    n = int(round(3.0 * FPS))
    for f in range(n + 1):
        pose = cover_pose(side, f / n)
        W, H = solve(pose); apply(W, pose['root'], f)

# しゃがみ（その場）の動きにも、繰り返すことと速さ（0）を書く
crouch['speed'] = 0.0; crouch['loop'] = True

# 骨と動きだけを残して書き出す
A.animation_data.action = None
for o in list(bpy.data.objects):
    if o is not A: bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
for im in list(bpy.data.images): bpy.data.images.remove(im)
for mt in list(bpy.data.materials): bpy.data.materials.remove(mt)
A.name = 'motions'
# FBX の骨は「上が +Y」の空間にある（物の回転で立たせている）。Tripo の骨（glTF）と同じ「上が +Z」にそろえる
# （骨ごとの動きは休みの姿勢に対する回転なので、そのまま使える）
bpy.context.view_layer.objects.active = A
A.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bpy.ops.wm.save_as_mainfile(filepath=out_path, compress=True)
print('書き出し', out_path, [a.name for a in bpy.data.actions])
