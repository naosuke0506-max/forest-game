# 片手劍の技の動きを、Tripo の骨に直接付ける（Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具）
#
#   踏込突（oh_thrust）・逆袈裟（oh_rise）・袈裟斬（oh_c1_in → oh_c1_hold → oh_c1_out）・旋風斬（oh_c2）
#   動きの形は利用者の指示どおり（docs/DESIGN.md の「片手劍の技」）
#   手と足の位置で体を動かす道具は ik_rig.py（向きの約束も、そこに書いてある）
import math
from ik_rig import *   # noqa: F401,F403


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


def build(rig):
    """片手劍の技の動きを作る。返り値：[(ゲームの名前, action, 情報)]"""
    out = []

    def make(name, fn, dur, loop=False):
        out.append(make_clip(rig, name, fn, dur, loop))

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
