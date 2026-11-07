# 片手劍の技の動きを、Tripo の骨に直接付ける（Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具）
#
#   踏込突（oh_thrust）・逆袈裟（oh_rise）・袈裟斬（oh_c1_in → oh_c1_hold → oh_c1_out）・旋風斬（oh_c2）
#   動きの形は利用者の指示どおり（docs/DESIGN.md の「片手劍の技」）
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
                Wr = IDENT.slerp(IDENT.slerp(qn, 0.85), frac) @ W['Spine02']
            elif n in ('L_Clavicle', 'R_Clavicle'):
                s = n[0]
                raise_deg = P.get(s + '_clav', 0.0)
                if raise_deg:
                    ax = (W['Spine02'] @ FWD) * (1 if s == 'R' else -1)
                    Wr = Quaternion(ax, math.radians(raise_deg)) @ Wr
            elif n in ('L_Upperarm', 'R_Upperarm'):
                s = n[0]
                spec = P[s]
                if s == 'R':
                    # 剣：持ち手の点（socket_R）の向き（+Z 刃先・+X 刃の幅＝切る向き）から手の向きを決め、手首の位置を出す
                    qs = frame_from(V(*spec['blade']), V(*spec['edge']))
                    Wh = qs @ self.sR.to_quaternion().inverted()
                    grip = hh + V(*spec['grip']) * AR
                    wrist = grip - Wh @ self.sR.translation
                else:
                    # 楯：持ち手の点（socket_L）の +X が楯の表（外）、+Z が楯の上
                    n_out, upv = V(*spec['normal']), V(*spec['up'])
                    qs = frame_from(upv, n_out)
                    # frame_from は +Z を上にするので、+X（表）を n_out へ
                    Wh = qs @ self.sL.to_quaternion().inverted()
                    wrist = hh + V(*spec['wrist']) * AR
                Whr = Wh @ self.rest_q[f'{s}_Hand'].inverted()
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
                pole = V(*rot_y((0.12 if s == 'R' else -0.12, 0, 1), ft[2]))
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
                # かかとを上げたときも、つま先は地面に沿う
                Wr = yawq(ft[2])
            W[n], H[n] = Wr, hh
        return W, H

    def _foot(self, s, ft):
        """足：ft =（右 m, 前 m, 向き 度, かかとの上げ 度, 地面からの浮き m）"""
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


# ======================= 技 =======================
# 構え（左足が前・右足が後ろ。体は右へ少し開き、剣は腰の前で切っ先をやや上へ、楯は体の前）
STANCE = {
    'hip': (0.0, -0.07, -0.02), 'hip_rot': (25, 8, 0), 'chest': (5, 5, 0), 'look': (0, 2),
    'R': {'grip': (0.18, -0.55, 0.55), 'blade': (-0.1, 0.45, 1.0), 'edge': (0, 1, -0.4), 'pole': (0.4, -1, -0.3)},
    'L': {'wrist': (-0.05, -0.42, 0.62), 'normal': (-0.25, 0, 1), 'up': (0, 1, 0), 'pole': (-1, -0.6, 0)},
    'R_clav': 0.0, 'L_clav': 0.0,
    'L_foot': (-0.20, 0.10, 8, 0, 0), 'R_foot': (0.20, -0.30, 40, 0, 0),
}


def thrust_keys():
    """踏込突：右足を前に踏み込み、体を巻き込むように回して、右腕を一本の槍のように真っ直ぐ突き出す"""
    S = STANCE
    coil = P(S, hip=(0.0, -0.09, -0.06), hip_rot=(42, 10, 0), chest=(10, 5, 0),
             R={'grip': (0.25, -0.35, -0.02), 'blade': (0, 0.08, 1), 'edge': (1, 0, 0), 'pole': (0.5, -1, -0.7)},
             L={'wrist': (-0.05, -0.40, 0.66)}, R_foot=(0.20, -0.28, 40, 18, 0))
    lunge = P(S, hip=(0.0, -0.13, 0.42), hip_rot=(-30, 14, 0), chest=(-12, 6, 0), look=(0, 0),
              R={'grip': (-0.04, 0.02, 1.16), 'blade': (0, 0.02, 1), 'edge': (1, 0, 0), 'pole': (0.25, -1, 0)},
              L={'wrist': (-0.15, -0.62, 0.12), 'normal': (-0.65, 0, 0.75)},
              R_foot=(0.12, 0.80, 5, 0, 0), L_foot=(-0.20, 0.10, 30, 32, 0))
    hold = P(lunge, hip=(0.0, -0.14, 0.41), R={'grip': (-0.04, 0.0, 1.12)})
    back = P(S, hip=(0.0, -0.10, 0.10), hip_rot=(8, 9, 0),
             R={'grip': (0.12, -0.38, 0.75), 'blade': (-0.05, 0.3, 1), 'edge': (0.5, 0.8, 0)},
             R_foot=(0.19, 0.18, 22, 10, 0.05), L_foot=(-0.20, 0.10, 15, 8, 0))
    return [(0.0, S, None), (0.10, coil, 'io'), (0.24, lunge, 'i'), (0.36, hold, 'o'), (0.55, back, 'io'), (0.70, S, 'io')], hold


def rise_keys(start):
    """逆袈裟：左斜め下にある右腕を溜め、右斜め上へ振り払う。踏み込んでいた右足を元の位置へ滑らせ、重心を移す"""
    S = STANCE
    load = P(start, hip=(0.0, -0.19, 0.32), hip_rot=(-55, 18, 0), chest=(-15, 10, 5),
             R={'grip': (-0.55, -0.78, 0.38), 'blade': (-0.55, -0.55, -0.62), 'edge': (0.45, 0.75, 0.45), 'pole': (0.4, -1, 0.3)},
             L={'wrist': (-0.10, -0.55, 0.32), 'normal': (-0.35, 0, 1)})
    through = P(start, hip=(0.0, -0.13, 0.18), hip_rot=(0, 10, 0), chest=(0, 4, -5),
                R={'grip': (0.05, -0.22, 1.05), 'blade': (0.45, 0.55, 0.70), 'edge': (0.55, 0.75, -0.35), 'pole': (0.3, -1, 0)},
                L={'wrist': (-0.10, -0.5, 0.45), 'normal': (-0.3, 0, 1)},
                R_foot=(0.18, 0.25, 20, 0, 0), L_foot=(-0.20, 0.10, 18, 10, 0))
    follow = P(S, hip=(0.0, -0.08, -0.02), hip_rot=(42, 4, 0), chest=(12, 0, -8),
               R={'grip': (0.80, 0.28, 0.42), 'blade': (0.80, 0.50, -0.30), 'edge': (0.35, -0.05, -0.95), 'pole': (1, -0.5, -0.4)},
               R_clav=8.0)
    settle = P(S, hip=(0.0, -0.07, -0.02), hip_rot=(30, 6, 0),
               R={'grip': (0.32, -0.05, 0.65), 'blade': (0, 0.6, 1), 'edge': (0.6, 0.5, -0.3)})
    return [(0.0, start, None), (0.14, load, 'io'), (0.24, through, 'i'), (0.34, follow, 'o'), (0.48, settle, 'io'), (0.75, S, 'io')]


def charge_pose():
    """袈裟斬の溜め：右足を前に踏み込み、右腕を体の右斜め上の後ろへ伸ばしたまま固まる"""
    return P(STANCE, hip=(0.0, -0.13, 0.24), hip_rot=(35, 6, 0), chest=(16, -2, -8),
             R={'grip': (0.48, 0.58, -0.38), 'blade': (0.25, 0.30, -1.0), 'edge': (-0.6, 0.8, 0), 'pole': (1, 0.1, -0.4)},
             L={'wrist': (-0.05, -0.40, 0.66)}, R_clav=12.0,
             R_foot=(0.15, 0.50, 15, 0, 0), L_foot=(-0.20, 0.10, 20, 12, 0))


def c1_in_keys():
    S = STANCE
    mid = P(S, hip=(0.0, -0.10, 0.10), hip_rot=(30, 6, 0),
            R={'grip': (0.40, 0.10, 0.10), 'blade': (0.1, 0.8, -0.5), 'edge': (-0.3, 0.5, 0.8), 'pole': (1, -0.4, -0.2)},
            R_foot=(0.19, 0.15, 25, 10, 0.06))
    return [(0.0, S, None), (0.16, mid, 'io'), (0.35, charge_pose(), 'o')]


def c1_hold(t):
    """溜めている間：腕が力でわずかに震え、息で上下する"""
    C = charge_pose()
    tr = 0.006 * math.sin(2 * math.pi * 11 * t) + 0.004 * math.sin(2 * math.pi * 17 * t + 1)
    br = 0.006 * math.sin(2 * math.pi * t)
    g = C['R']['grip']
    return P(C, hip=(C['hip'][0], C['hip'][1] + br, C['hip'][2]), R={'grip': (g[0] + tr, g[1] + tr * 0.6, g[2] - tr * 0.4)})


def c1_out_keys():
    """袈裟斬の放ち：溜めた右腕を、右斜め上から左下へ振り下ろす"""
    S, C = STANCE, charge_pose()
    cock = P(C, hip_rot=(40, 5, 0), R={'grip': (0.52, 0.64, -0.46)})
    over = P(C, hip=(0.0, -0.14, 0.27), hip_rot=(15, 8, 0), chest=(0, 2, 0),
             R={'grip': (0.30, 0.78, 0.32), 'blade': (0.15, 1, 0.2), 'edge': (-0.3, 0.2, 0.9), 'pole': (1, 0.2, 0)})
    hit = P(C, hip=(0.0, -0.16, 0.30), hip_rot=(-20, 14, 0), chest=(-10, 10, 6),
            R={'grip': (-0.05, 0.10, 1.0), 'blade': (-0.45, -0.45, 0.75), 'edge': (-0.40, -0.50, -0.53), 'pole': (0.6, -0.8, 0)},
            L={'wrist': (-0.12, -0.58, 0.25), 'normal': (-0.55, 0, 0.8)}, R_clav=4.0)
    low = P(C, hip=(0.0, -0.19, 0.30), hip_rot=(-55, 22, 0), chest=(-15, 14, 8), look=(-10, 8),
            R={'grip': (-0.60, -0.80, 0.30), 'blade': (-0.55, -0.75, -0.35), 'edge': (-0.07, 0.29, -0.53), 'pole': (0.3, -1, 0.4)},
            L={'wrist': (-0.15, -0.62, 0.12), 'normal': (-0.65, 0, 0.75)}, R_clav=0.0)
    hold = P(low, hip=(0.0, -0.18, 0.29))
    back = P(S, hip=(0.0, -0.10, 0.08), hip_rot=(5, 9, 0),
             R={'grip': (0.15, -0.42, 0.72), 'blade': (-0.05, 0.3, 1), 'edge': (0.5, 0.8, 0)},
             R_foot=(0.19, 0.15, 22, 10, 0.05), L_foot=(-0.20, 0.10, 15, 8, 0))
    return [(0.0, C, None), (0.05, cock, 'io'), (0.11, over, 'i'), (0.16, hit, 'l'), (0.26, low, 'o'), (0.40, hold, 'io'), (0.62, back, 'io'), (0.80, S, 'io')], hold


def c2_keys(start):
    """旋風斬：左下を向いた体を速く右回りに一回転させて振り払い、一周したら力を溜め、逆の左回りに速く回って最後の一撃"""
    S = STANCE
    keys = [(0.0, start, None)]
    y0 = start['hip_rot'][0]
    center = (0.0, 0.30)                                   # 回る中心（両足の間）
    feet0 = {'R': start['R_foot'], 'L': start['L_foot']}

    def spun(base, yaw, chest_arm_spec=None, lift=None, look_lead=0.0, hip_u=-0.19, pitch=10, chest=(0, 4, 0)):
        d = yaw - y0
        out = P(base, hip=(center[0], hip_u, center[1]), hip_rot=(yaw, pitch, 0), chest=chest,
                look=(yaw + chest[0] + look_lead, 4))
        for s in 'RL':
            r, f, fy, heel, _ = feet0[s]
            rr, _, ff = rot_y((r - center[0], 0, f - center[1]), d)
            up = (lift or {}).get(s, 0.0)
            out[s + '_foot'] = (center[0] + rr, center[1] + ff, fy + d, heel if not up else 20, up)
        if chest_arm_spec:
            out['R'] = chest_arm(chest_arm_spec, yaw + chest[0])
        return out

    # 一回り目（右回り）：腕を前右へ伸ばして水平に払う。刃は回る向き（右後ろ）を向く
    arm1 = {'grip': (0.62, -0.18, 0.80), 'blade': (0.80, -0.08, 0.60), 'edge': (0.62, 0, -0.80), 'pole': (0.2, -1, -0.5)}
    load = P(start, hip=(center[0], -0.21, center[1]))
    keys.append((0.10, load, 'io'))
    t, yaw_end = 0.10, y0 + 380
    steps = 7
    for i in range(1, steps + 1):
        yaw = y0 + (yaw_end - y0) * i / steps
        lift = {'R': 0.05} if i in (2, 3) else {'L': 0.05} if i in (5, 6) else None
        spec = arm1 if i >= 2 else {'grip': (0.2, -0.45, 0.85), 'blade': (0.4, -0.35, 0.85), 'edge': (0.85, 0.3, -0.4), 'pole': (0.3, -1, -0.2)}
        keys.append((t + 0.45 * i / steps, spun(start, yaw, spec, lift, look_lead=25, hip_u=-0.18, chest=(8, 4, 0)), 'i' if i == 1 else 'l'))
    # 力を溜める（右へさらに開き、剣を右後ろへ引く）
    coil_arm = {'grip': (0.45, 0.02, -0.38), 'blade': (0.60, 0.10, -0.80), 'edge': (0.60, 0, 0.80), 'pole': (0.8, -0.6, -0.4)}
    y_coil = yaw_end + 75
    keys.append((0.70, spun(start, y_coil, coil_arm, look_lead=-60, hip_u=-0.23, pitch=12, chest=(15, 6, 0)), 'o'))
    keys.append((0.85, spun(start, y_coil + 5, coil_arm, look_lead=-62, hip_u=-0.24, pitch=13, chest=(16, 6, 0)), 'io'))
    # 二回り目（左回り）：速く回り、前を通るときに最後の一撃
    arm2 = {'grip': (0.58, -0.12, 0.82), 'blade': (0.62, -0.05, 0.78), 'edge': (-0.80, 0, 0.62), 'pole': (0.3, -1, -0.3)}
    y_end2 = y_coil + 5 - 470
    steps = 9
    # 右後ろに引いた剣を、右横（刃は前向き）を通して前右へ回し出す（向きが大きく変わる所は、間の姿勢を置く）
    arm_mid = {'grip': (0.62, -0.06, 0.25), 'blade': (1.0, -0.02, 0.05), 'edge': (0.05, 0, 1.0), 'pole': (0.5, -1, -0.4)}
    for i in range(1, steps + 1):
        yaw = y_coil + 5 + (y_end2 - y_coil - 5) * i / steps
        lift = {'L': 0.05} if i in (2, 3) else {'R': 0.05} if i in (6, 7) else None
        spec = arm_mid if i == 1 else arm2
        keys.append((0.85 + 0.38 * i / steps, spun(start, yaw, spec, lift, look_lead=-25, hip_u=-0.20, pitch=10, chest=(-6, 4, 0)), 'i' if i == 1 else 'l'))
    # 振り抜き（左へ）→ 構えへ戻る
    fin = spun(start, y_end2 - 10, {'grip': (-0.35, -0.30, 0.80), 'blade': (-0.7, -0.2, 0.6), 'edge': (-0.6, 0, -0.75), 'pole': (0.3, -1, 0.2)},
               look_lead=10, hip_u=-0.19, pitch=12, chest=(-12, 6, 0))
    keys.append((1.32, fin, 'o'))
    # 構えの向きへ（回った分を戻した数で書く）
    S2 = P(S, hip_rot=(S['hip_rot'][0] + 360 * round((y_end2 - 10 - S['hip_rot'][0]) / 360), S['hip_rot'][1], 0))
    S2['look'] = (S2['hip_rot'][0] - S['hip_rot'][0] + S['look'][0], S['look'][1])
    keys.append((1.65, S2, 'io'))
    return keys


def build(T, sock_r, sock_l, K, idle_action, scn):
    """片手劍の技の動きを作る。返り値：[(ゲームの名前, action, 情報)]"""
    import bpy
    rig = Rig(T, sock_r, sock_l, K)
    rig.take_fingers(idle_action)
    T.animation_data_create()
    out = []

    def make(name, fn, dur, loop=False):
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        T.animation_data.action = act
        n = int(round(dur * FPS))
        for f in range(n + 1):
            W, H = rig.solve(fn(f / FPS))
            rig.key(W, H, f)
        T.animation_data.action = None
        out.append((name, act, {'duration': round(n / FPS, 4), 'loop': loop, 'speed': 0.0}))
        print('片手劍の技', name, n + 1, 'フレーム')

    tk, lunge_hold = thrust_keys()
    make('oh_thrust', lambda t: sample(tk, t), tk[-1][0])
    rk = rise_keys(lunge_hold)
    make('oh_rise', lambda t: sample(rk, t), rk[-1][0])
    ck = c1_in_keys()
    make('oh_c1_in', lambda t: sample(ck, t), ck[-1][0])
    make('oh_c1_hold', c1_hold, 1.0, loop=True)
    ok, low_hold = c1_out_keys()
    make('oh_c1_out', lambda t: sample(ok, t), ok[-1][0])
    sk = c2_keys(low_hold)
    make('oh_c2', lambda t: sample(sk, t), sk[-1][0])
    return out
