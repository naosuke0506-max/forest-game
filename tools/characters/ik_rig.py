# 手と足の位置で体を動かす道具（Blender 4.2。onehand_moves.py・body_moves.py が使う開発用の道具）
#
# 作り方：剣を持つ手（持ち手の点 socket_R）の位置・刃の向き・刃（切る側）の向きと、楯を持つ手の位置・楯の向き、
#   足の位置、腰の位置と向きを、何か所かの時刻で決める（下の「技」の所）。その間はなめらかにつなぎ、
#   腕と脚の関節は、手と足が決めた所に届くように曲げる（2 本の骨の IK）。指は、待機の動きの握り方をそのまま使う
#
# 向きの約束：体の「右・上・前」の座標で書く（右 r・上 u・前 f）。動きの始まりの体の向きが基準
#   腰と足の位置は m（身長 1.8m の人として）、手の位置は腕の長さを 1 とした割合（肩から測る）
import math
from mathutils import Vector, Quaternion, Matrix

FPS = 30
UP = Vector((0, 0, 1))
LEFT = Vector((1, 0, 0))      # Tripo の骨（glTF を読み込んだ Blender）：体の左が +X、前が -Y、上が +Z
FWD = Vector((0, -1, 0))
RIGHT = -LEFT
IDENT = Quaternion()


def V(r, u, f):
    """体の向きの座標（右・上・前）→ 骨の空間"""
    return RIGHT * r + UP * u + FWD * f


def yawq(deg):
    """右へ deg 度回る（上から見て時計回り）"""
    return Quaternion(UP, -math.radians(deg))


def body_q(yaw=0.0, pitch=0.0, roll=0.0):
    """体の回し方：右へ yaw・前へ pitch・右へ roll（度）"""
    return yawq(yaw) @ Quaternion(LEFT, math.radians(pitch)) @ Quaternion(FWD, math.radians(roll))


def rot_y(v, deg):
    """体の向きの座標のまま、右へ deg 度回す（r, u, f）"""
    a = math.radians(deg)
    r, u, f = v
    return (r * math.cos(a) + f * math.sin(a), u, -r * math.sin(a) + f * math.cos(a))


def frame_from(z, x):
    """+Z を z、+X をなるべく x に向けた回転"""
    z = z.normalized()
    x = (x - z * x.dot(z))
    if x.length < 1e-6:
        x = z.orthogonal()
    x.normalize()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed().to_quaternion()


def twist_angle(q, axis):
    """回転 q の、軸 axis まわりのねじれの角度（ラジアン）"""
    p = Vector((q.x, q.y, q.z)).dot(axis)
    return 2 * math.atan2(p, q.w)


def two_bone(a, target, l1, l2, pole):
    """2 本の骨の IK：根もと a から target へ。肘・膝は pole の側へ曲げる。返り値：（中の関節, 届いた先）"""
    d = target - a
    dist = max(abs(l1 - l2) + 1e-4, min(l1 + l2 - 1e-4, d.length))
    x = d.normalized()
    end = a + x * dist
    p = pole - x * pole.dot(x)
    if p.length < 1e-6:
        p = x.orthogonal()
    p.normalize()
    along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, l1 * l1 - along * along))
    return a + x * along + p * h, end


class Rig:
    def __init__(self, T, sock_r, sock_l, K):
        self.T = T
        self.K = K
        bones = T.data.bones
        self.order = []

        def walk(b):
            self.order.append(b)
            for c in b.children:
                walk(c)
        for b in bones:
            if b.parent is None:
                walk(b)
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.rest_q = {b.name: b.matrix_local.to_quaternion() for b in bones}
        self.rest_h = {b.name: b.head_local.copy() for b in bones}
        self.rest_M = {b.name: b.matrix_local.copy() for b in bones}
        inv = T.matrix_world.inverted()
        self.sR = bones['R_Hand'].matrix_local.inverted() @ (inv @ sock_r.matrix_world)
        self.sL = bones['L_Hand'].matrix_local.inverted() @ (inv @ sock_l.matrix_world)
        h = self.rest_h
        self.arm = {s: ((h[f'{s}_Forearm'] - h[f'{s}_Upperarm']).length, (h[f'{s}_Hand'] - h[f'{s}_Forearm']).length) for s in 'LR'}
        self.leg = {s: ((h[f'{s}_Calf'] - h[f'{s}_Thigh']).length, (h[f'{s}_Foot'] - h[f'{s}_Calf']).length) for s in 'LR'}
        self.AR = sum(self.arm['R'])            # 腕の長さ（肩から手首まで）
        self.ball_z = (h['L_ToeBase'].z + h['R_ToeBase'].z) / 2
        self.fingers = [b.name for b in bones if any(k in b.name for k in ('Thumb', 'Index', 'Mid', 'Ring', 'Pinky'))]
        self.finger_basis = {}

    def take_fingers(self, action):
        """指の握り方を、ある動き（待機）の最初のフレームから写す"""
        import bpy
        T = self.T
        T.animation_data.action = action
        bpy.context.scene.frame_set(0)
        for n in self.fingers:
            pb = T.pose.bones[n]
            pb.rotation_mode = 'QUATERNION'
            self.finger_basis[n] = pb.matrix_basis.to_quaternion()
        T.animation_data.action = None

    # ---- 1 フレームの姿勢を解く ----
    def solve(self, P):
        K, AR = self.K, self.AR
        h = self.rest_h
        W, H = {}, {}           # 骨ごとの、休みの姿勢からの回転（骨の空間）と、頭の位置
        hipq = body_q(*P['hip_rot'])
        sp = P['chest']
        look = P['look']
        side_targets = {}
        for b in self.order:
            n, p = b.name, self.parent[b.name]
            if p is None:
                Wr, hh = IDENT.copy(), h[n].copy()
            else:
                Wr = W[p].copy()
                hh = H[p] + W[p] @ (h[n] - h[p])
            if n == 'Hip':
                hh = h[n] + V(*P['hip']) * K
                Wr = hipq
            elif n in ('Waist', 'Spine01', 'Spine02'):
                frac = {'Waist': 0.3, 'Spine01': 0.65, 'Spine02': 1.0}[n]
                ql = body_q(*sp)
                qw = W['Hip'] @ ql @ W['Hip'].inverted()
                Wr = IDENT.slerp(qw, frac) @ W['Hip']
            elif n in ('NeckTwist01', 'NeckTwist02', 'Head'):
                frac = {'NeckTwist01': 0.35, 'NeckTwist02': 0.65, 'Head': 1.0}[n]
                want = body_q(look[0], look[1], 0)
                qn = want @ W['Spine02'].inverted()
                Wr = IDENT.slerp(IDENT.slerp(qn, P.get('look_k', 0.85)), frac) @ W['Spine02']
            elif n in ('L_Clavicle', 'R_Clavicle'):
                s = n[0]
                raise_deg = P.get(s + '_clav', 0.0)
                if raise_deg:
                    ax = (W['Spine02'] @ FWD) * (1 if s == 'R' else -1)
                    Wr = Quaternion(ax, math.radians(raise_deg)) @ Wr
            elif n in ('L_Upperarm', 'R_Upperarm'):
                s = n[0]
                spec = P[s]
                # 手の向き：剣は持ち手の点（socket_R）の +Z 刃先・+X 刃の幅（切る向き）、楯は socket_L の +X 表・+Z 上。
                # どちらも書いていなければ、手首はまっすぐ（前腕に合わせる）
                Wh = None
                if s == 'R' and 'blade' in spec:
                    Wh = frame_from(V(*spec['blade']), V(*spec['edge'])) @ self.sR.to_quaternion().inverted()
                elif s == 'L' and 'normal' in spec:
                    Wh = frame_from(V(*spec['up']), V(*spec['normal'])) @ self.sL.to_quaternion().inverted()
                # 手首の位置：持ち手の点（肩から・腕の長さの割合）／楯の真ん中（地面の上の点・m）／地面の上の点（m）／肩から（割合）
                if 'grip' in spec:
                    wrist = hh + V(*spec['grip']) * AR - Wh @ self.sR.translation
                elif 'grip_w' in spec:   # 持ち手の点を、地面の上の点（m）で
                    wrist = self.world(spec['grip_w']) - Wh @ self.sR.translation
                elif 'center_w' in spec:
                    wrist = self.world(spec['center_w']) - Wh @ self.sL.translation
                elif 'w_mix' in spec:     # 肩からの位置と、地面の上の点の間（手を地面に着く・離すをなめらかに）
                    wrist = (hh + V(*spec['wrist']) * AR).lerp(self.world(spec['wrist_w']), spec['w_mix'])
                elif 'wrist_w' in spec:
                    wrist = self.world(spec['wrist_w'])
                else:
                    wrist = hh + V(*spec['wrist']) * AR
                Whr = Wh @ self.rest_q[f'{s}_Hand'].inverted() if Wh is not None else None
                l1, l2 = self.arm[s]
                elbow, wrist = two_bone(hh, wrist, l1, l2, V(*spec['pole']))
                v = Wr @ (h[f'{s}_Forearm'] - h[n])
                Wr = v.rotation_difference(elbow - hh) @ Wr
                # 肘の曲がる向き：休みの姿勢で前腕が曲がっている向き（前）が、今の前腕の側になるよう、上腕をねじる
                Wr = self._align_twist(Wr, (elbow - hh).normalized(), FWD, wrist - elbow, -V(*spec['pole']))
                side_targets[s] = (elbow, wrist, Whr)
            elif n in ('L_Forearm', 'R_Forearm'):
                s = n[0]
                elbow, wrist, Whr = side_targets[s]
                v = Wr @ (h[f'{s}_Hand'] - h[n])
                Wr = v.rotation_difference(wrist - hh) @ Wr
                if Whr is None:
                    Whr = Wr
                axis_rest = (h[f'{s}_Hand'] - h[n]).normalized()
                rel = Wr.inverted() @ Whr
                side_targets[s] = (elbow, wrist, Whr, twist_angle(rel, axis_rest), Wr)
            elif n in ('L_ForearmTwist01', 'R_ForearmTwist01', 'L_ForearmTwist02', 'R_ForearmTwist02'):
                s = n[0]
                _, _, _, phi, Wf = side_targets[s]
                ax = (Wf @ (h[f'{s}_Hand'] - h[f'{s}_Forearm'])).normalized()
                k = 0.5 if n.endswith('01') else 1.0
                Wr = Quaternion(ax, phi * k) @ Wf
            elif n in ('L_Hand', 'R_Hand'):
                Wr = side_targets[n[0]][2]
            elif n in ('L_Thigh', 'R_Thigh'):
                s = n[0]
                ft = P[s + '_foot']
                Wf, ankle, ball = self._foot(s, ft)
                l1, l2 = self.leg[s]
                # 膝の向き：ふつうは足の向き（前）。伏せているときなどは姿勢に書いた向き（L_knee・R_knee）
                pole = V(*P[s + '_knee']) if s + '_knee' in P else V(*rot_y((0.12 if s == 'R' else -0.12, 0, 1), ft[2]))
                knee, ankle = two_bone(hh, ankle, l1, l2, pole)
                v = Wr @ (h[f'{s}_Calf'] - h[n])
                Wr = v.rotation_difference(knee - hh) @ Wr
                # 膝の曲がる向き：すねは後ろへ曲がる（膝の皿が前）
                Wr = self._align_twist(Wr, (knee - hh).normalized(), -FWD, ankle - knee, -pole)
                side_targets[s + 'leg'] = (knee, ankle, Wf, ft)
            elif n in ('L_Calf', 'R_Calf'):
                s = n[0]
                knee, ankle, Wf, ft = side_targets[s + 'leg']
                v = Wr @ (h[f'{s}_Foot'] - h[n])
                Wr = v.rotation_difference(ankle - hh) @ Wr
            elif n in ('L_Foot', 'R_Foot'):
                Wr = side_targets[n[0] + 'leg'][2]
            elif n in ('L_ToeBase', 'R_ToeBase'):
                s = n[0]
                ft = side_targets[s + 'leg'][3]
                # かかとを上げたときも、つま先は地面に沿う（6 つ目の数があれば、その度だけ下へ曲げる）
                toe = ft[5] if len(ft) > 5 else 0.0
                Wr = yawq(ft[2]) @ Quaternion(LEFT, math.radians(toe))
            W[n], H[n] = Wr, hh
        return W, H

    def world(self, p):
        """地面の上の点（右 m, 上 m, 前 m）→ 骨の空間"""
        return V(*p) * self.K

    def _foot(self, s, ft):
        """足：ft =（右 m, 前 m, 向き 度, かかとの上げ 度, 地面からの浮き m, つま先の曲げ 度）"""
        r, f, yaw, heel, lift = (list(ft) + [0, 0, 0])[:5]
        h = self.rest_h
        Wf = yawq(yaw) @ Quaternion(LEFT, math.radians(heel))
        ball = Vector((0, 0, self.ball_z + lift * self.K)) + V(r, 0, f) * self.K
        ball.z = self.ball_z + lift * self.K
        ankle = ball - Wf @ (h[f'{s}_ToeBase'] - h[f'{s}_Foot'])
        return Wf, ankle, ball

    def _align_twist(self, Wr, axis, rest_dir, toward, fallback):
        """骨 Wr（向き axis）をねじって、休みの姿勢の rest_dir（肘・膝の曲がる側）を toward の側へ向ける。
        ほとんど伸びきっていて曲がる側が決まらないときは fallback の側へ"""
        cur = Wr @ rest_dir
        cur = cur - axis * cur.dot(axis)
        tgt = toward - axis * toward.dot(axis)
        if tgt.length < 0.08 * max(toward.length, 1e-6):
            tgt = fallback - axis * fallback.dot(axis)
        if cur.length < 1e-6 or tgt.length < 1e-6:
            return Wr
        cur.normalize(); tgt.normalize()
        ang = math.atan2(cur.cross(tgt).dot(axis), cur.dot(tgt))
        return Quaternion(axis, ang) @ Wr

    # ---- 骨へ書き込む ----
    def key(self, W, H, frame):
        T = self.T
        Mw = {}
        for b in self.order:
            n, p = b.name, self.parent[b.name]
            Mw[n] = Matrix.Translation(H[n]) @ (W[n] @ self.rest_q[n]).to_matrix().to_4x4()
        for b in self.order:
            n, p = b.name, self.parent[b.name]
            pb = T.pose.bones[n]
            pb.rotation_mode = 'QUATERNION'
            if n in self.finger_basis:
                pb.rotation_quaternion = self.finger_basis[n]
            else:
                if p is None:
                    basis = self.rest_M[n].inverted() @ Mw[n]
                else:
                    basis = (self.rest_M[p].inverted() @ self.rest_M[n]).inverted() @ Mw[p].inverted() @ Mw[n]
                pb.rotation_quaternion = basis.to_quaternion()
                if n == 'Hip':
                    pb.location = basis.to_translation()
                    pb.keyframe_insert('location', frame=frame, group=n)
            pb.keyframe_insert('rotation_quaternion', frame=frame, group=n)


# ---- 時刻ごとの姿勢を、なめらかにつなぐ ----
EASE = {
    'l': lambda u: u,
    'i': lambda u: u * u,                       # だんだん速く
    'o': lambda u: 1 - (1 - u) * (1 - u),       # だんだん遅く
    'io': lambda u: u * u * (3 - 2 * u),
}


def _flat(P, prefix=''):
    out = {}
    for k, v in P.items():
        key = prefix + k
        if isinstance(v, dict):
            out.update(_flat(v, key + '.'))
        elif isinstance(v, (tuple, list)):
            for i, x in enumerate(v):
                out[f'{key}#{i}'] = float(x)
        elif isinstance(v, (int, float)):
            out[key] = float(v)
    return out


def _unflat(F, template):
    def build(T, prefix=''):
        out = {}
        for k, v in T.items():
            key = prefix + k
            if isinstance(v, dict):
                out[k] = build(v, key + '.')
            elif isinstance(v, (tuple, list)):
                out[k] = tuple(F[f'{key}#{i}'] for i in range(len(v)))
            elif isinstance(v, (int, float)):
                out[k] = F[key]
            else:
                out[k] = v
        return out
    return build(template)


def sample(keys, t):
    """keys：[(時刻, 姿勢, 速さの変わり方)]。その間を Catmull-Rom でなめらかにつなぐ"""
    if t <= keys[0][0]:
        return keys[0][1]
    if t >= keys[-1][0]:
        return keys[-1][1]
    i = max(j for j in range(len(keys) - 1) if keys[j][0] <= t)
    t0, P1, _ = keys[i]
    t1, P2, ease = keys[i + 1]
    u = EASE[ease or 'io']((t - t0) / (t1 - t0))
    P0 = keys[i - 1][1] if i > 0 else P1
    P3 = keys[i + 2][1] if i + 2 < len(keys) else P2
    F0, F1, F2, F3 = _flat(P0), _flat(P1), _flat(P2), _flat(P3)
    out = {}
    for k in F1:
        a, b, c, d = F0.get(k, F1[k]), F1[k], F2.get(k, F1[k]), F3.get(k, F2.get(k, F1[k]))
        u2, u3 = u * u, u * u * u
        out[k] = 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3)
    return _unflat(out, P1)


def P(base, **kw):
    """base の姿勢をもとに、一部を変えた姿勢（R・L は中身ごとに上書き）"""
    out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in base.items()}
    for k, v in kw.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k].update(v)
        else:
            out[k] = v
    return out


def chest_arm(spec, yaw):
    """胸の向きで書いた腕（剣）を、右へ yaw 度回した体の向きの座標へ"""
    return {k: (rot_y(v, yaw) if k in ('grip', 'blade', 'edge', 'pole') else v) for k, v in spec.items()}




def make_clip(rig, name, fn, dur, loop=False, speed=0.0):
    """fn(t)：時刻 t の姿勢。dur 秒の動きを作る。返り値：(名前, action, 情報)"""
    import bpy
    T = rig.T
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    T.animation_data.action = act
    n = int(round(dur * FPS))
    for f in range(n + 1):
        W, H = rig.solve(fn(f / FPS))
        rig.key(W, H, f)
    T.animation_data.action = None
    print('動きを作った', name, n + 1, 'フレーム')
    return (name, act, {'duration': round(n / FPS, 4), 'loop': loop, 'speed': round(speed, 4)})


def mix(Pa, Pb, w):
    """2 つの姿勢を w（0〜1）の割合で混ぜる（形は Pa と同じであること）"""
    Fa, Fb = _flat(Pa), _flat(Pb)
    return _unflat({k: Fa[k] + (Fb.get(k, Fa[k]) - Fa[k]) * w for k in Fa}, Pa)


def level_head(rig, action, look_pitch=0.0, k=1.0):
    """できている動き（這う・伏せなど）の首と頭を直して、顔がまっすぐ前（水平）を向くようにする"""
    import bpy
    T = rig.T
    T.animation_data.action = action
    f0, f1 = map(int, action.frame_range)
    scn = bpy.context.scene
    names = ('NeckTwist01', 'NeckTwist02', 'Head')
    frac = {'NeckTwist01': 0.35, 'NeckTwist02': 0.65, 'Head': 1.0}
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        sp = T.pose.bones['Spine02']
        W2 = sp.matrix.to_quaternion() @ rig.rest_q['Spine02'].inverted()
        want = body_q(0.0, look_pitch, 0)
        qn = IDENT.slerp(want @ W2.inverted(), k)
        Mp = sp.matrix.copy()
        Wp, Hp, prev = W2, sp.head.copy(), 'Spine02'
        for n in names:
            hh = Hp + Wp @ (rig.rest_h[n] - rig.rest_h[prev])
            Wr = IDENT.slerp(qn, frac[n]) @ W2
            Mb = Matrix.Translation(hh) @ (Wr @ rig.rest_q[n]).to_matrix().to_4x4()
            basis = (rig.rest_M[prev].inverted() @ rig.rest_M[n]).inverted() @ Mp.inverted() @ Mb
            pb = T.pose.bones[n]
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = basis.to_quaternion()
            pb.keyframe_insert('rotation_quaternion', frame=f, group=n)
            Mp, Wp, Hp, prev = Mb, Wr, hh, n
    T.animation_data.action = None


def at(origin, yaw, off):
    """origin（右 m, 前 m）に立って右へ yaw 度向いた人から見た off（右, 上, 前）を、動きの始まりの座標へ"""
    r, u, f = rot_y(off, yaw)
    return (origin[0] + r, u, origin[1] + f)


def foot_at(origin, yaw, ft):
    """足の書き方（右, 前, 向き, かかと, 浮き）を、origin・yaw の人の足として、動きの始まりの座標へ"""
    r, _, f = rot_y((ft[0], 0, ft[1]), yaw)
    return (origin[0] + r, origin[1] + f, ft[2] + yaw) + tuple(ft[3:])
