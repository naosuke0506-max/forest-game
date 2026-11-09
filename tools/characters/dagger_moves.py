# 短劍の技の動きを、Tripo の骨に直接付ける（Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具）
#
#   弓兵が持ち替えて使う短い剣。軽くて速い。身を低くし、左の拳を前に出して構える。形は Claude が考えたもの（動作監督の画面で見てもらって直す）
#     迅刺（dg_cut1）：右足で素早く踏み込み、腹を刺す
#     搔斬（dg_cut2）：迅刺の後。刃を返して、右から左へ喉の高さを横に掻き切る
#     逆手刺（dg_c1_in → dg_c1_hold → dg_c1_out）：逆手に持ち替えて頭の横に構え、身を深く沈めて溜める。離すと跳び込んで上から突き刺す
#     雙刺（dg_c2）：逆手刺の後にもう一度溜めて離す。順手に戻して、腹（1 打目）・胸（2 打目）と素早く二度刺す
#   手と足の位置で体を動かす道具は ik_rig.py（向きの約束も、そこに書いてある）
import math
from ik_rig import *   # noqa: F401,F403

GUARD_L = {'wrist': (-0.18, -0.30, 0.55), 'pole': (-1, -0.6, 0)}

# 構え（左足が前・右足が後ろ。膝を曲げて身を低く、短劍は腰の前で切っ先を相手へ）
STANCE = {
    'hip': (0.0, -0.12, 0.0), 'hip_rot': (22, 12, 0), 'chest': (6, 6, 0), 'look': (0, 0),
    'R': {'grip': (0.15, -0.40, 0.55), 'blade': (0, 0.30, 0.95), 'edge': (0.95, 0, -0.3), 'pole': (0.5, -1, -0.4)},
    'L': dict(GUARD_L), 'R_clav': 0.0, 'L_clav': 0.0,
    'L_foot': (-0.20, 0.12, 10, 0, 0), 'R_foot': (0.20, -0.30, 40, 0, 0),
}


def cut1_keys():
    """迅刺：右足で素早く踏み込み、腹を刺す"""
    S = STANCE
    coil = P(S, hip_rot=(30, 12, 0), R={'grip': (0.18, -0.45, 0.30), 'blade': (0, 0.15, 1)})
    hit = P(S, hip=(0.0, -0.16, 0.30), hip_rot=(-8, 16, 0), chest=(-6, 6, 0),
            R={'grip': (0.0, -0.32, 1.12), 'blade': (0, 0.10, 1), 'pole': (0.3, -1, 0)},
            L={'wrist': (-0.30, -0.45, 0.25)}, R_foot=(0.16, 0.45, 10, 0, 0), L_foot=(-0.20, 0.12, 20, 15, 0))
    hold = P(hit, hip=(0.0, -0.17, 0.29), R={'grip': (0.0, -0.33, 1.09)})
    back = P(S, hip=(0.0, -0.13, 0.10), R_foot=(0.19, 0.10, 25, 10, 0.05))
    return [(0.0, S, None), (0.06, coil, 'io'), (0.16, hit, 'i'), (0.26, hold, 'o'), (0.42, back, 'io'), (0.55, S, 'io')], hold


def cut2_keys(start):
    """搔斬：刃を返して、右から左へ喉の高さを横に掻き切る（刃を先に、左へ）"""
    S = STANCE
    wind = P(start, hip=(0.0, -0.15, 0.20), hip_rot=(30, 12, 0), chest=(10, 6, 0),
             R={'grip': (0.55, -0.05, 0.55), 'blade': (0.75, 0.15, 0.6), 'edge': (-0.6, 0, 0.75), 'pole': (0.9, -0.6, -0.3)})
    hit = P(start, hip=(0.0, -0.14, 0.18), hip_rot=(0, 12, 0), chest=(0, 6, 0),
            R={'grip': (0.0, 0.08, 0.95), 'blade': (0.1, 0.12, 0.98), 'edge': (-1, 0, 0.1), 'pole': (0.5, -1, -0.1)},
            L={'wrist': (-0.30, -0.40, 0.30)})
    follow = P(hit, hip_rot=(-36, 12, 0), chest=(-10, 6, 0),
               R={'grip': (-0.60, 0.0, 0.55), 'blade': (-0.8, 0.1, 0.55), 'edge': (-0.55, 0, -0.8), 'pole': (0.2, -1, 0.4)},
               R_foot=(0.20, -0.10, 35, 10, 0.03))
    settle = P(S, hip=(0.0, -0.12, 0.06), R_foot=(0.20, -0.25, 40, 0, 0))
    return [(0.0, start, None), (0.08, wind, 'io'), (0.20, hit, 'i'), (0.30, follow, 'o'), (0.44, settle, 'io'), (0.60, S, 'io')]


def charge_pose():
    """逆手刺の溜め：逆手に持ち替えて頭の横に構え（刃は下）、身を深く沈める"""
    return P(STANCE, hip=(0.0, -0.30, -0.05), hip_rot=(18, 22, 0), chest=(4, 10, 0), look=(0, -6), R_clav=10.0,
             R={'grip': (0.25, 0.55, 0.20), 'blade': (0.05, -1, 0.1), 'edge': (0, 0.1, 1), 'pole': (1, 0.2, -0.3)},
             L={'wrist': (-0.15, -0.20, 0.60)}, L_foot=(-0.24, 0.18, 10, 10, 0), R_foot=(0.24, -0.34, 40, 30, 0))


def c1_in_keys():
    S, C = STANCE, charge_pose()
    mid = P(S, hip=(0.0, -0.20, -0.02), hip_rot=(20, 16, 0), R_clav=6.0,
            R={'grip': (0.25, 0.10, 0.40), 'blade': (0.1, -0.6, 0.8), 'edge': (0, 0.8, 0.6), 'pole': (1, -0.3, -0.3)})
    return [(0.0, S, None), (0.12, mid, 'io'), (0.28, C, 'o')]


def c1_hold(t):
    C = charge_pose()
    tr = 0.006 * math.sin(2 * math.pi * 10 * t) + 0.004 * math.sin(2 * math.pi * 16 * t + 0.7)
    br = 0.008 * math.sin(2 * math.pi * 1.3 * t)
    g = C['R']['grip']
    return P(C, hip=(C['hip'][0], C['hip'][1] + br, C['hip'][2]), R={'grip': (g[0] + tr, g[1] + tr * 0.4, g[2] - tr * 0.3)})


def c1_out_keys():
    """逆手刺：跳び込んで、上から突き刺す"""
    S, C = STANCE, charge_pose()
    leap = P(C, hip=(0.0, 0.0, 0.40), hip_rot=(8, 14, 0), chest=(2, 6, 0), look=(0, 2),
             R={'grip': (0.15, 0.62, 0.55), 'blade': (0, -0.95, 0.3)},
             R_foot=(0.20, 0.10, 30, 40, 0.08), L_foot=(-0.20, 0.50, 5, 10, 0.10))
    hit = P(C, hip=(0.0, -0.18, 0.62), hip_rot=(0, 24, 0), chest=(0, 18, 0), look=(0, 14), R_clav=2.0,
            R={'grip': (0.0, 0.05, 1.0), 'blade': (0, -0.85, 0.52), 'edge': (0, 0.52, 0.85), 'pole': (0.5, -1, 0)},
            L={'wrist': (-0.25, -0.40, 0.40)}, L_foot=(-0.20, 0.72, 5, 0, 0), R_foot=(0.20, 0.05, 30, 30, 0))
    follow = P(hit, hip=(0.0, -0.22, 0.63), R={'grip': (0.0, -0.35, 0.85), 'blade': (0, -0.95, 0.3), 'edge': (0, 0.3, 0.95)})
    hold = P(follow, hip=(0.0, -0.21, 0.62))
    back = P(S, hip=(0.0, -0.14, 0.24), L_foot=(-0.20, 0.40, 8, 0, 0.05), R_foot=(0.20, -0.10, 35, 10, 0.03))
    return [(0.0, C, None), (0.10, leap, 'o'), (0.20, hit, 'i'), (0.30, follow, 'o'), (0.48, hold, 'l'), (0.70, back, 'io'), (0.88, S, 'io')], hold


def c2_keys(start):
    """雙刺：順手に戻して、腹（1 打目）・胸（2 打目）と素早く二度刺す"""
    S = STANCE
    regrip = P(start, hip=(0.0, -0.18, 0.50), hip_rot=(16, 14, 0), chest=(4, 6, 0), look=(0, 0), R_clav=0.0,
               R={'grip': (0.20, -0.40, 0.40), 'blade': (0, 0.2, 1), 'edge': (0.95, 0, -0.3), 'pole': (0.5, -1, -0.4)},
               L=dict(GUARD_L))
    stab1 = P(regrip, hip=(0.0, -0.17, 0.58), hip_rot=(-6, 16, 0), R={'grip': (0.0, -0.30, 1.12), 'blade': (0, 0.08, 1)},
              L={'wrist': (-0.30, -0.45, 0.25)})
    pull = P(regrip, hip=(0.0, -0.16, 0.55), R={'grip': (0.18, -0.25, 0.45), 'blade': (0, 0.25, 1)})
    stab2 = P(regrip, hip=(0.0, -0.16, 0.66), hip_rot=(-10, 14, 0), R={'grip': (-0.02, -0.05, 1.12), 'blade': (0, 0.15, 1)},
              L={'wrist': (-0.30, -0.45, 0.25)}, R_foot=(0.18, 0.30, 15, 0, 0))
    hold = P(stab2, hip=(0.0, -0.17, 0.65), R={'grip': (-0.02, -0.06, 1.09)})
    back = P(S, hip=(0.0, -0.13, 0.26), L_foot=(-0.20, 0.42, 8, 0, 0.05), R_foot=(0.20, -0.05, 35, 10, 0.03))
    return [(0.0, start, None), (0.10, regrip, 'io'), (0.22, stab1, 'i'), (0.32, pull, 'io'), (0.46, stab2, 'i'), (0.58, hold, 'o'),
            (0.78, back, 'io'), (0.98, S, 'io')]


def build(rig):
    """短劍の技の動きを作る。返り値：[(ゲームの名前, action, 情報)]"""
    out = []

    def make(name, fn, dur, loop=False):
        out.append(make_clip(rig, name, fn, dur, loop))

    k1, hold1 = cut1_keys()
    make('dg_cut1', lambda t: sample(k1, t), k1[-1][0])
    k2 = cut2_keys(hold1)
    make('dg_cut2', lambda t: sample(k2, t), k2[-1][0])
    ki = c1_in_keys()
    make('dg_c1_in', lambda t: sample(ki, t), ki[-1][0])
    make('dg_c1_hold', c1_hold, 1.0, loop=True)
    ko, hold3 = c1_out_keys()
    make('dg_c1_out', lambda t: sample(ko, t), ko[-1][0])
    kc = c2_keys(hold3)
    make('dg_c2', lambda t: sample(kc, t), kc[-1][0])
    return out
