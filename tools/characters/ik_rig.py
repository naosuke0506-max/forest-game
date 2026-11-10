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


def h_add(a, b):
    return a + b

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


def body_q(yaw=0.0, pitch=0.0, roll=0.0, spin=0.0):
    """体の回し方：右へ yaw・前へ pitch・右へ roll（度）。spin：背骨のまわりに先に回す（寝返り。伏せから仰向けへは 180）"""
    return yawq(yaw) @ Quaternion(LEFT, math.radians(pitch)) @ Quaternion(FWD, math.radians(roll)) @ Quaternion(UP, -math.radians(spin))


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


def auto_grip(z, f, roll_deg=0.0):
    """拳の中を柄が通る持ち手の点の向き（Tripo の手の socket_R と同じ約束）：+Z は柄の頭の側、+X は拳の甲の向き。
    拳の甲は前腕の延長の向きなので（右手で測ると、手首をまっすぐにした前腕は持ち手の点の +X とほぼ同じ向き：0.99）、
    +X は前腕の向き f を柄に直角にした向きにする（腕が柄に埋もれない）。roll：手首の曲げ（度。柄のまわりに回す）"""
    z = z.normalized()
    x = f - z * f.dot(z)
    if x.length < 1e-6:
        x = z.orthogonal()
    x.normalize()
    if roll_deg:
        x = Quaternion(z, math.radians(roll_deg)) @ x
    return frame_from(z, x)


def hilt_point(sp_r, axis, spec, K, hh, reach):
    """両手持ちの左手で握る柄の点（右手の持ち手の点 sp_r から、柄の向き axis の反対へ hilt m）。
    spec に 'slide' があれば、決めた所に腕が届かないとき、届く所まで右手の側へ滑らせる（長い柄では手が柄の上を滑る）"""
    lo = spec['hilt'] * K
    if not spec.get('slide'):
        return sp_r + axis * lo
    hi = -0.14 * K                                   # 右手にいちばん近づける所（拳 2 つ分ほど離す）
    R = reach * 0.97 + 0.055 * K                     # 手首は柄から肩の側へ 0.055 m 戻すので、その分も足す
    s0 = (hh - sp_r).dot(axis)                       # 肩にいちばん近い柄の点
    d2 = (hh - sp_r - axis * s0).length_squared
    s = None
    if d2 < R * R:
        w = math.sqrt(R * R - d2)
        a, b = max(lo, s0 - w), min(hi, s0 + w)
        if a <= b:
            s = a
    if s is None:
        s = min(hi, max(lo, s0))
    return sp_r + axis * s


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
    def __init__(self, T, sock_r, sock_l, K, sock_bow=None):
        self.T = T
        self.K = K
        bones = T.data.bones
        self.order = []

        def walk(b):
            self.order.append(b)
            # 右腕を左腕より先に解く（両手で持つときは、右手の持ち手の点を見て左手を添えるため）
            for c in sorted(b.children, key=lambda c: 0 if c.name.startswith('R_') else 1):
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
        self.sB = bones['L_Hand'].matrix_local.inverted() @ (inv @ sock_bow.matrix_world) if sock_bow else None
        # 左手の握りの点：右手の持ち手の点（休みの姿勢・体の空間）を、体の左右（X）で映す。
        # 映すと左手の座標になるので、Y を逆にして回転に戻す（+Z 親指の側・+X 拳の甲の向きはそのまま映した向き）
        mr = bones['R_Hand'].matrix_local @ self.sR
        S_ = Matrix(((-1, 0, 0), (0, 1, 0), (0, 0, 1)))
        rl = S_ @ mr.to_3x3() @ Matrix(((1, 0, 0), (0, -1, 0), (0, 0, 1)))
        ml = Matrix.Translation(S_ @ mr.translation) @ rl.to_4x4()
        self.sL2 = bones['L_Hand'].matrix_local.inverted() @ ml
        h = self.rest_h
        self.arm = {s: ((h[f'{s}_Forearm'] - h[f'{s}_Upperarm']).length, (h[f'{s}_Hand'] - h[f'{s}_Forearm']).length) for s in 'LR'}
        self.leg = {s: ((h[f'{s}_Calf'] - h[f'{s}_Thigh']).length, (h[f'{s}_Foot'] - h[f'{s}_Calf']).length) for s in 'LR'}
        self.AR = sum(self.arm['R'])            # 腕の長さ（肩から手首まで）
        self.ball_z = (h['L_ToeBase'].z + h['R_ToeBase'].z) / 2
        self.fingers = [b.name for b in bones if any(k in b.name for k in ('Thumb', 'Index', 'Mid', 'Ring', 'Pinky'))]
        self.finger_basis = {}

    # ---- 胴の形（腕が胴に埋もれないように） ----
    def set_body(self, mesh):
        """体の模型から、胴（腰・腹・胸）の太さを高さごとに測る（休みの姿勢。Spine01 の頭を通る縦の線から、左・右・前・後ろへの張り出し）"""
        import numpy as np
        torso = {'Hip', 'Pelvis', 'Waist', 'Spine01', 'Spine02'}
        names = {g.index: g.name for g in mesh.vertex_groups}
        Mw = self.T.matrix_world.inverted() @ mesh.matrix_world
        pts = []
        for v in mesh.data.vertices:
            if not v.groups:
                continue
            g = max(v.groups, key=lambda e: e.weight)
            if names.get(g.group) in torso:
                pts.append((Mw @ v.co)[:])
        P_ = np.array(pts)
        h = self.rest_h
        self.ax = h['Spine01'].copy()
        z0, z1 = h['Hip'].z - 0.12 * self.K * 1.8, h['R_Upperarm'].z + 0.02 * self.K * 1.8
        step = (z1 - z0) / 10
        bands = []
        for i in range(10):
            sel = P_[(P_[:, 2] >= z0 + i * step) & (P_[:, 2] < z0 + (i + 1) * step)]
            if len(sel) < 8:
                bands.append(None); continue
            dx, dy = sel[:, 0] - self.ax.x, sel[:, 1] - self.ax.y
            q = lambda a: float(np.percentile(a, 96)) if len(a) else 0.0
            bands.append((q(dx[dx > 0]), q(-dx[dx < 0]), q(-dy[dy < 0]), q(dy[dy > 0])))   # 左・右・前・後ろ
        for i in range(10):                              # 測れなかった高さは、隣の高さで埋める
            if bands[i] is None:
                bands[i] = next((bands[j] for j in sorted(range(10), key=lambda j: abs(j - i)) if bands[j] is not None), (0.1, 0.1, 0.1, 0.1))
        self.body = (z0, step, bands)

    def _band(self, z):
        z0, step, bands = self.body
        i = int((z - z0) // step)
        return bands[i] if 0 <= i < len(bands) else None

    def to_rest(self, p, W, H):
        """今の姿勢の点を、胴（Spine01）に対する休みの姿勢の点へ"""
        return h_add(self.rest_h['Spine01'], W['Spine01'].inverted() @ (p - H['Spine01']))

    def from_rest(self, q, W, H):
        return H['Spine01'] + W['Spine01'] @ (q - self.rest_h['Spine01'])

    def depth_in(self, q, margin):
        """休みの姿勢の点 q が胴（margin だけ太らせた形）の中なら、外まで出す倍率（>1）。外なら 0"""
        b = self._band(q.z)
        if b is None:
            return 0.0
        dx, df = q.x - self.ax.x, -(q.y - self.ax.y)
        hx = (b[0] if dx > 0 else b[1]) + margin
        hf = (b[2] if df > 0 else b[3]) + margin
        v = (dx / hx) ** 2 + (df / hf) ** 2
        return 1 / math.sqrt(max(v, 1e-6)) if v < 1 else 0.0

    def push_out(self, p, W, H, margin):
        """点 p が胴に埋もれていれば、胴の外（真ん中から外へ向かう向き）まで出す"""
        if not getattr(self, 'body', None):
            return p
        q = self.to_rest(p, W, H)
        k = self.depth_in(q, margin)
        if not k:
            return p
        dx, dy = q.x - self.ax.x, q.y - self.ax.y
        if abs(dx) + abs(dy) < 1e-5:
            dy = -1e-3                                    # 真ん中なら前へ
        q2 = Vector((self.ax.x + dx * k * 1.02, self.ax.y + dy * k * 1.02, q.z))
        return self.from_rest(q2, W, H)

    def elbow_out(self, sh, elbow, wrist, W, H):
        """肘・上腕・前腕のどこかが胴に埋もれていれば、肩と手首を結ぶ線のまわりで肘を外へ回す（いちばん少ない回し方）"""
        if not getattr(self, 'body', None):
            return elbow
        m_e, m_a = 0.06 * self.K, 0.05 * self.K

        def bad(e):
            return (self.depth_in(self.to_rest(e, W, H), m_e) or self.depth_in(self.to_rest((sh + e) / 2, W, H), m_a)
                    or self.depth_in(self.to_rest((e + wrist) / 2, W, H), m_a))
        if not bad(elbow):
            return elbow
        axis = (wrist - sh).normalized()
        base = elbow - sh
        for deg in range(12, 181, 12):
            for sgn in (1, -1):
                e = sh + Quaternion(axis, math.radians(deg * sgn)) @ base
                if not bad(e):
                    return e
        return elbow

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
                Wr = IDENT.slerp(IDENT.slerp(qn, min(1.0, max(0.0, P.get('look_k', 0.85)))), frac) @ W['Spine02']
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
                auto_w = None
                if s == 'R' and 'blade' in spec and spec.get('auto', 0) > 0.5:
                    # 拳の向きを、柄の向き（blade）と前腕から決める（edge は使わない。鎚の面は拳の甲の向きになる）
                    gp = hh + V(*spec['grip']) * AR if 'grip' in spec else self.world(spec['grip_w'])
                    Wh, auto_w = self.grip_solve('R', hh, gp, V(*spec['blade']), spec.get('roll', 0.0), V(*spec['pole']), W, H, self.sR)
                elif s == 'R' and 'blade' in spec:
                    Wh = frame_from(V(*spec['blade']), V(*spec['edge'])) @ self.sR.to_quaternion().inverted()
                elif s == 'L' and 'normal' in spec:
                    Wh = frame_from(V(*spec['up']), V(*spec['normal'])) @ self.sL.to_quaternion().inverted()
                elif s == 'L' and 'bow_up' in spec and self.sB is not None:   # 弓：socket_bow の +Z 上の弓の先・+X 弦の側
                    Wh = frame_from(V(*spec['bow_up']), V(*spec['bow_x'])) @ self.sB.to_quaternion().inverted()
                # 手首の位置：持ち手の点（肩から・腕の長さの割合）／楯の真ん中（地面の上の点・m）／地面の上の点（m）／肩から（割合）
                if auto_w is not None:
                    wrist = auto_w
                elif 'grip' in spec:
                    wrist = hh + V(*spec['grip']) * AR - Wh @ self.sR.translation
                elif 'grip_w' in spec:   # 持ち手の点を、地面の上の点（m）で
                    wrist = self.world(spec['grip_w']) - Wh @ self.sR.translation
                elif 'center_w' in spec:
                    wrist = self.world(spec['center_w']) - Wh @ self.sL.translation
                elif 'w_mix' in spec:     # 肩からの位置と、地面の上の点の間（手を地面に着く・離すをなめらかに）
                    wrist = (hh + V(*spec['wrist']) * AR).lerp(self.world(spec['wrist_w']), min(1.0, max(0.0, spec['w_mix'])))
                elif 'wrist_w' in spec:
                    wrist = self.world(spec['wrist_w'])
                elif s == 'L' and 'hilt' in spec:
                    # 両手持ち：右手の持ち手の点から刃と反対（柄頭）の側へ hilt m の所を左手で握る（手首は肩の側へ少し戻した所）
                    sp_r, q_r = side_targets['R_sock']
                    hp = hilt_point(sp_r, q_r @ Vector((0, 0, 1)), spec, self.K, hh, sum(self.arm[s]))
                    if spec.get('grip2', 0) > 0.5:
                        # 拳の中に柄を通して握る（親指は右手と同じく頭の側。拳の甲は前腕の向き）
                        Wh, wrist = self.grip_solve('L', hh, hp, q_r @ Vector((0, 0, 1)), spec.get('roll', 0.0), V(*spec['pole']), W, H, self.sL2)
                    else:
                        wrist = hp + (hh - hp).normalized() * (0.055 * self.K)
                else:
                    wrist = hh + V(*spec['wrist']) * AR
                # 手首が胴に埋もれないように（前腕の太さだけ離す）。両手持ちの左手は、押し出した右手の持ち手の点に添う
                wrist = self.push_out(wrist, W, H, 0.05 * self.K)
                if s == 'R' and Wh is not None:
                    side_targets['R_sock'] = (wrist + Wh @ self.sR.translation, Wh @ self.sR.to_quaternion())
                Whr = Wh @ self.rest_q[f'{s}_Hand'].inverted() if Wh is not None else None
                l1, l2 = self.arm[s]
                elbow, wrist = two_bone(hh, wrist, l1, l2, V(*spec['pole']))
                elbow = self.elbow_out(hh, elbow, wrist, W, H)
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

    def grip_solve(self, s, hh, grip_pt, z, roll, pole, W, H, sock):
        """拳の中を柄が通るように手の向きを決め、手首の位置を返す（返り値：手の向き Wh・手首）。
        s：'R'・'L'、hh：肩、grip_pt：握る点（柄の上）、z：柄の向き（頭の側）、sock：手の中の握る点（Matrix）。
        拳の甲は前腕の向きにするので、肩から握る点への向きで 1 回解き、出た肘からの前腕の向きでもう 1 回解き直す"""
        sq, st = sock.to_quaternion(), sock.translation
        f = grip_pt - hh
        l1, l2 = self.arm[s]
        Wh, wrist = None, grip_pt
        for _ in range(2):
            Wh = auto_grip(z, f, roll) @ sq.inverted()
            wrist = self.push_out(grip_pt - Wh @ st, W, H, 0.05 * self.K)
            elbow, w2 = two_bone(hh, wrist, l1, l2, pole)
            elbow = self.elbow_out(hh, elbow, w2, W, H)
            f = w2 - elbow
        return Wh, wrist

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


def fix_arms(rig, action, two_handed=False):
    """できている動きの腕が胴に埋もれていれば、手首を胴の外へ出し、肘を外へ回して、腕を解き直す（手の向きはそのまま）。
    two_handed：両手で持つ武器。右手を押し出したら、近くにある左手も同じだけ動かす（柄から手が離れないように）"""
    import bpy
    T = rig.T
    T.animation_data.action = action
    f0, f1 = map(int, action.frame_range)
    scn = bpy.context.scene
    fixed = 0
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        pb = T.pose.bones
        W = {n: pb[n].matrix.to_quaternion() @ rig.rest_q[n].inverted() for n in ('Spine01',)}
        H = {n: pb[n].head.copy() for n in ('Spine01',)}
        hand_r = pb['R_Hand'].head.copy()
        moves = {}
        for s in 'RL':
            sh, wr = pb[f'{s}_Upperarm'].head.copy(), pb[f'{s}_Hand'].head.copy()
            el = pb[f'{s}_Forearm'].head.copy()
            nw = rig.push_out(wr, W, H, 0.05 * rig.K)
            if s == 'L' and two_handed and 'R' in moves and (wr - hand_r).length < 0.25 * rig.K:
                nw = rig.push_out(wr + moves['R'][1] - hand_r, W, H, 0.05 * rig.K)
            l1, l2 = rig.arm[s]
            if (nw - wr).length < 1e-6:
                ne = rig.elbow_out(sh, el, wr, W, H)
                if (ne - el).length < 1e-6:
                    continue
                nw = wr
            else:
                ne, nw = two_bone(sh, nw, l1, l2, el - (sh + wr) / 2)
                ne = rig.elbow_out(sh, ne, nw, W, H)
            moves[s] = (ne, nw)
        if not moves:
            continue
        fixed += 1
        for s, (ne, nw) in moves.items():
            names = (f'{s}_Upperarm', f'{s}_Forearm', f'{s}_Hand')
            Mp = {n: pb[n].matrix.copy() for n in names + (f'{s}_Clavicle',)}
            hand_rot = Mp[f'{s}_Hand'].to_quaternion()
            # 上腕：肘へ向け、ねじれは今の向きに近いまま
            Mu = Mp[f'{s}_Upperarm']
            q_u = Mu.to_quaternion()
            v = q_u @ (rig.rest_q[names[0]].inverted() @ (rig.rest_h[names[1]] - rig.rest_h[names[0]]))
            q_u = v.rotation_difference(ne - Mu.translation) @ q_u
            Mu2 = Matrix.Translation(Mu.translation) @ q_u.to_matrix().to_4x4()
            # 前腕：手首へ向ける
            q_f = (q_u @ Mp[names[0]].to_quaternion().inverted() @ Mp[names[1]].to_quaternion())
            v = q_f @ (rig.rest_q[names[1]].inverted() @ (rig.rest_h[names[2]] - rig.rest_h[names[1]]))
            q_f = v.rotation_difference(nw - ne) @ q_f
            Mf2 = Matrix.Translation(ne) @ q_f.to_matrix().to_4x4()
            Mh2 = Matrix.Translation(nw) @ hand_rot.to_matrix().to_4x4()
            for n, M_new, par in ((names[0], Mu2, Mp[f'{s}_Clavicle']), (names[1], Mf2, Mu2), (names[2], Mh2, Mf2)):
                p_name = rig.parent[n]
                basis = (rig.rest_M[p_name].inverted() @ rig.rest_M[n]).inverted() @ par.inverted() @ M_new
                b = pb[n]
                b.rotation_mode = 'QUATERNION'
                b.rotation_quaternion = basis.to_quaternion()
                b.keyframe_insert('rotation_quaternion', frame=f, group=n)
    T.animation_data.action = None
    return fixed


def hold_weapon(rig, src_action, name, spec_r, spec_l):
    """できている動き（待機・歩き・後ろ歩き・走り）の脚と体はそのままに、腕だけを武器を持つ形に解き直した、新しい動きを作る。
    spec_r：右手（grip・blade・edge・pole。胸から見た向きで書く。胸が回れば一緒に回る）。
    spec_l：左手（hilt・pole：両手持ちで右手の持ち手の点から柄頭の側へ hilt m を握る）。返り値：新しい action"""
    import bpy
    T = rig.T
    act = src_action.copy()
    act.name = name
    act.use_fake_user = True
    T.animation_data.action = act
    f0, f1 = map(int, act.frame_range)
    scn = bpy.context.scene
    h, K, AR = rig.rest_h, rig.K, rig.AR
    sR_q, sR_t = rig.sR.to_quaternion(), rig.sR.translation
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        pb = T.pose.bones
        W = {b.name: pb[b.name].matrix.to_quaternion() @ rig.rest_q[b.name].inverted() for b in rig.order}
        H = {b.name: pb[b.name].head.copy() for b in rig.order}
        Wc = W['Spine02']                        # 胸の向き（休みの姿勢から）
        C = lambda v: Wc @ V(*v)
        R_sock = None
        for s, spec in (('R', spec_r), ('L', spec_l)):
            up = f'{s}_Upperarm'
            hh = H[up]
            Wr = W[rig.parent[up]].copy()
            Wh = None
            if s == 'R' and spec.get('auto', 0) > 0.5:
                Wh, wrist = rig.grip_solve('R', hh, hh + C(spec['grip']) * AR, C(spec['blade']), spec.get('roll', 0.0), C(spec['pole']), W, H, rig.sR)
            elif s == 'R':
                Wh = frame_from(C(spec['blade']), C(spec['edge'])) @ sR_q.inverted()
                wrist = hh + C(spec['grip']) * AR - Wh @ sR_t
            else:
                sp_r, q_r = R_sock
                hp = hilt_point(sp_r, q_r @ Vector((0, 0, 1)), spec, K, hh, sum(rig.arm[s]))
                if spec.get('grip2', 0) > 0.5:
                    Wh, wrist = rig.grip_solve('L', hh, hp, q_r @ Vector((0, 0, 1)), spec.get('roll', 0.0), C(spec['pole']), W, H, rig.sL2)
                else:
                    wrist = hp + (hh - hp).normalized() * (0.055 * K)
            wrist = rig.push_out(wrist, W, H, 0.05 * K)
            if s == 'R':
                R_sock = (wrist + Wh @ sR_t, Wh @ sR_q)
            l1, l2 = rig.arm[s]
            pole = C(spec['pole'])
            elbow, wrist = two_bone(hh, wrist, l1, l2, pole)
            elbow = rig.elbow_out(hh, elbow, wrist, W, H)
            v = Wr @ (h[f'{s}_Forearm'] - h[up])
            Wr = v.rotation_difference(elbow - hh) @ Wr
            Wr = rig._align_twist(Wr, (elbow - hh).normalized(), Wc @ FWD, wrist - elbow, -pole)
            W[up] = Wr
            # 腕の先の骨（前腕・ねじれ・手）を、肩から順に解き直す
            chain = [n for n in (f'{s}_Forearm', f'{s}_ForearmTwist01', f'{s}_ForearmTwist02', f'{s}_Hand') if n in W]
            Wf = None
            phi = 0.0
            for n in chain:
                p = rig.parent[n]
                H[n] = H[p] + W[p] @ (h[n] - h[p])
                if n.endswith('_Forearm'):
                    Wn = W[p].copy()
                    vv = Wn @ (h[f'{s}_Hand'] - h[n])
                    Wn = vv.rotation_difference(wrist - H[n]) @ Wn
                    Whr = Wh @ rig.rest_q[f'{s}_Hand'].inverted() if Wh is not None else Wn
                    axis_rest = (h[f'{s}_Hand'] - h[n]).normalized()
                    phi = twist_angle(Wn.inverted() @ Whr, axis_rest)
                    Wf, W[n], hand_W = Wn, Wn, Whr
                elif 'Twist' in n:
                    ax = (Wf @ (h[f'{s}_Hand'] - h[f'{s}_Forearm'])).normalized()
                    W[n] = Quaternion(ax, phi * (0.5 if n.endswith('01') else 1.0)) @ Wf
                else:
                    W[n] = hand_W
        rig.key(W, H, f)
    T.animation_data.action = None
    return act
