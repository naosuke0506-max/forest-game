# 長劍の技の動きを、Tripo の骨に直接付ける（Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具）
#
#   両手で持つ（右手は鍔のすぐ下、左手は柄頭の側）。片手劍の技とは違う形にし、振りが大きく隙も少し大きい
#     唐竹（ls_cut1）：頭上へ振りかぶり、右足で踏み込んで真上から真っ直ぐ斬り下ろす
#     横薙（ls_cut2）：唐竹の後。剣を右へ引いて体を開き、左足を踏み出しながら右から左へ水平に薙ぐ
#     長突（ls_c1_in → ls_c1_hold → ls_c1_out）：剣を頭の右横に構えて切っ先を相手へ向けて溜め、
#                                               離すと左足で大きく踏み込み、両手で長く突く
#     斬返（ls_c2）：長突の後にもう一度溜めて離す。剣を左下へ落として右上へ斬り上げ、頭上へ返して、
#                   左足で大きく踏み込みながら右上から左下へ斬り下ろす
#   手と足の位置で体を動かす道具は ik_rig.py（向きの約束も、そこに書いてある）
import math
from ik_rig import *   # noqa: F401,F403

HILT = -0.12   # 左手の位置：右手の持ち手の点から柄頭の側へ（m）
L2 = {'hilt': HILT, 'pole': (-0.7, -1, -0.2)}

# 構え（左足が前・右足が後ろ。剣は両手で腹の前、切っ先を相手の顔へ）
STANCE = {
    'hip': (0.0, -0.08, 0.0), 'hip_rot': (20, 6, 0), 'chest': (4, 4, 0), 'look': (0, 2), 'look_k': 0.9,
    'R': {'grip': (-0.35, -0.62, 0.62), 'blade': (-0.05, 0.45, 1.0), 'edge': (0, 1, -0.45), 'pole': (0.6, -1, -0.2)},
    'L': dict(L2), 'R_clav': 0.0, 'L_clav': 0.0,
    'L_foot': (-0.20, 0.10, 8, 0, 0), 'R_foot': (0.20, -0.30, 35, 0, 0),
}


def cut1_keys():
    """唐竹：頭上へ振りかぶり、右足で踏み込んで真上から斬り下ろす"""
    S = STANCE
    high = P(S, hip=(0.0, -0.06, -0.04), hip_rot=(18, 0, 0), chest=(4, -6, 0), look=(0, 0), R_clav=12.0, L_clav=12.0,
             R={'grip': (-0.28, 0.80, 0.02), 'blade': (0, 0.55, -0.85), 'edge': (0, 0.85, 0.55), 'pole': (0.8, -0.2, -0.4)})
    over = P(high, hip=(0.0, -0.10, 0.10), hip_rot=(10, 8, 0), chest=(2, 2, 0),
             R={'grip': (-0.32, 0.62, 0.55), 'blade': (0, 1, 0.12), 'edge': (0, -0.12, 1), 'pole': (0.8, -0.4, -0.2)},
             R_foot=(0.20, 0.05, 25, 15, 0.06))
    hit = P(S, hip=(0.0, -0.16, 0.24), hip_rot=(4, 18, 0), chest=(0, 10, 0), look=(0, 8), R_clav=4.0, L_clav=4.0,
            R={'grip': (-0.34, -0.12, 1.05), 'blade': (0, -0.25, 1), 'edge': (0, -1, -0.25), 'pole': (0.5, -1, 0)},
            R_foot=(0.17, 0.48, 12, 0, 0), L_foot=(-0.20, 0.10, 15, 18, 0))
    follow = P(hit, hip=(0.0, -0.18, 0.26), hip_rot=(2, 22, 0), chest=(0, 14, 0), R_clav=0.0, L_clav=0.0,
               R={'grip': (-0.32, -0.58, 0.72), 'blade': (0, -0.75, 0.65), 'edge': (0, -0.65, -0.75), 'pole': (0.5, -1, 0.1)})
    hold = P(follow, hip=(0.0, -0.17, 0.25), hip_rot=(4, 18, 0))
    back = P(S, hip=(0.0, -0.10, 0.10), R_foot=(0.19, 0.10, 25, 10, 0.05))
    return [(0.0, S, None), (0.16, high, 'io'), (0.28, over, 'i'), (0.34, hit, 'l'), (0.44, follow, 'o'), (0.62, hold, 'io'),
            (0.80, back, 'io'), (0.95, S, 'io')], hold


def cut2_keys(start):
    """横薙：剣を右へ引いて体を開き、左足を踏み出しながら右から左へ水平に薙ぐ"""
    S = STANCE
    wind = P(start, hip=(0.0, -0.13, 0.20), hip_rot=(48, 8, 0), chest=(16, 2, 0), look=(0, 2), R_clav=6.0,
             R={'grip': (0.42, 0.08, 0.12), 'blade': (0.8, 0.12, -0.6), 'edge': (0.6, 0, 0.8), 'pole': (0.9, -0.6, -0.3)})
    hit = P(start, hip=(-0.04, -0.15, 0.34), hip_rot=(-22, 10, 0), chest=(-10, 6, 0), look=(0, 4), R_clav=2.0,
            R={'grip': (-0.32, -0.08, 1.02), 'blade': (-0.6, 0.05, 0.8), 'edge': (-0.8, 0, -0.6), 'pole': (0.4, -1, 0)},
            L_foot=(-0.30, 0.62, -5, 0, 0), R_foot=(0.17, 0.48, 20, 20, 0))
    follow = P(hit, hip_rot=(-42, 8, 0), chest=(-16, 4, 0),
               R={'grip': (-0.80, -0.12, 0.42), 'blade': (-0.92, 0, -0.25), 'edge': (-0.2, 0, -1), 'pole': (0.2, -1, 0.4)})
    hold = P(follow, hip=(-0.04, -0.14, 0.33))
    back = P(S, hip=(0.0, -0.10, 0.12), L_foot=(-0.24, 0.30, 5, 0, 0.05), R_foot=(0.19, 0.0, 30, 10, 0.05))
    return [(0.0, start, None), (0.18, wind, 'io'), (0.30, P(wind, hip_rot=(30, 9, 0)), 'i'), (0.36, hit, 'i'), (0.48, follow, 'o'),
            (0.64, hold, 'io'), (0.82, back, 'io'), (0.98, S, 'io')]


def ox_pose():
    """長突の溜め：剣を頭の右横に構え、切っ先を相手の顔へ向ける（右へ体を開き、重さは後ろ足）"""
    return P(STANCE, hip=(0.0, -0.12, -0.08), hip_rot=(36, 4, 0), chest=(12, -2, 0), look=(0, 0), R_clav=10.0, L_clav=6.0,
             R={'grip': (0.08, 0.42, 0.08), 'blade': (-0.12, -0.12, 1), 'edge': (0, 1, 0.12), 'pole': (1, 0.1, -0.3)},
             L_foot=(-0.20, 0.12, 10, 0, 0), R_foot=(0.20, -0.34, 40, 0, 0))


def c1_in_keys():
    S, O = STANCE, ox_pose()
    mid = P(S, hip=(0.0, -0.10, -0.04), hip_rot=(28, 5, 0),
            R={'grip': (-0.10, 0.05, 0.40), 'blade': (-0.1, 0.4, 1), 'edge': (0, 1, -0.4), 'pole': (0.8, -0.6, -0.3)})
    return [(0.0, S, None), (0.16, mid, 'io'), (0.35, O, 'o')]


def c1_hold(t):
    O = ox_pose()
    tr = 0.006 * math.sin(2 * math.pi * 10 * t) + 0.004 * math.sin(2 * math.pi * 15 * t + 0.7)
    br = 0.006 * math.sin(2 * math.pi * t)
    g = O['R']['grip']
    return P(O, hip=(O['hip'][0], O['hip'][1] + br, O['hip'][2]), R={'grip': (g[0] + tr, g[1] + tr * 0.5, g[2] - tr * 0.3)})


def c1_out_keys():
    """長突：左足で大きく踏み込み、両手で長く突く"""
    S, O = STANCE, ox_pose()
    lunge = P(S, hip=(0.0, -0.20, 0.44), hip_rot=(6, 16, 0), chest=(0, 6, 0), look=(0, 4), R_clav=0.0, L_clav=0.0,
              R={'grip': (-0.30, 0.02, 1.18), 'blade': (0, -0.06, 1), 'edge': (0, 1, 0.06), 'pole': (0.5, -1, 0)},
              L_foot=(-0.20, 0.88, 2, 0, 0), R_foot=(0.20, -0.30, 40, 34, 0))
    hold = P(lunge, hip=(0.0, -0.21, 0.43), R={'grip': (-0.30, 0.0, 1.14)})
    back = P(S, hip=(0.0, -0.12, 0.18), L_foot=(-0.20, 0.45, 8, 0, 0.05), R_foot=(0.20, -0.30, 35, 10, 0))
    return [(0.0, O, None), (0.05, P(O, hip_rot=(40, 3, 0), R={'grip': (0.12, 0.44, 0.0)}), 'io'), (0.16, lunge, 'i'),
            (0.30, hold, 'o'), (0.50, hold, 'l'), (0.72, back, 'io'), (0.92, S, 'io')], hold


def c2_keys(start):
    """斬返：剣を左下へ落として右上へ斬り上げ、頭上へ返して、左足で大きく踏み込みながら右上から左下へ斬り下ろす"""
    S = STANCE
    low = P(start, hip=(0.0, -0.20, 0.36), hip_rot=(-38, 18, 0), chest=(-12, 10, 0), look=(0, 6),
            R={'grip': (-0.62, -0.78, 0.40), 'blade': (-0.55, -0.6, -0.55), 'edge': (0.45, 0.75, 0.45), 'pole': (0.3, -1, 0.3)})
    up1 = P(start, hip=(0.0, -0.14, 0.30), hip_rot=(10, 8, 0), chest=(4, 2, 0), look=(0, 0),
            R={'grip': (-0.12, -0.02, 1.0), 'blade': (0.45, 0.6, 0.65), 'edge': (0.55, 0.7, -0.45), 'pole': (0.5, -1, 0)},
            R_foot=(0.18, -0.05, 30, 10, 0.05))
    top = P(start, hip=(0.0, -0.10, 0.22), hip_rot=(30, 2, 0), chest=(10, -6, 0), look=(0, 0), R_clav=14.0, L_clav=10.0,
            R={'grip': (0.22, 0.78, -0.02), 'blade': (0.25, 0.45, -0.85), 'edge': (-0.3, 0.85, 0.3), 'pole': (1, 0, -0.4)},
            R_foot=(0.20, -0.25, 35, 0, 0))
    gather = P(top, hip=(0.0, -0.13, 0.20), R={'grip': (0.26, 0.82, -0.08)})
    hit2 = P(start, hip=(0.0, -0.20, 0.62), hip_rot=(-18, 18, 0), chest=(-10, 12, 6), look=(0, 8), R_clav=2.0, L_clav=2.0,
             R={'grip': (-0.38, -0.08, 1.0), 'blade': (-0.45, -0.45, 0.75), 'edge': (-0.4, -0.5, -0.55), 'pole': (0.5, -0.9, 0)},
             L_foot=(-0.22, 1.25, 0, 0, 0), R_foot=(0.20, 0.10, 35, 30, 0))
    follow = P(hit2, hip_rot=(-42, 22, 0), chest=(-16, 16, 8), R_clav=0.0, L_clav=0.0,
               R={'grip': (-0.62, -0.80, 0.42), 'blade': (-0.6, -0.75, -0.3), 'edge': (-0.1, 0.3, -0.55), 'pole': (0.3, -1, 0.4)})
    hold = P(follow, hip=(0.0, -0.19, 0.61))
    # 構えへ戻る（踏み込んだ左足を引いて、元の立ち位置へ。ゲームでは体の位置は動かないため）
    mid = P(S, hip=(0.0, -0.12, 0.36), L_foot=(-0.20, 0.62, 6, 0, 0.06), R_foot=(0.20, -0.10, 35, 0, 0))
    return [(0.0, start, None), (0.15, low, 'io'), (0.30, up1, 'i'), (0.44, top, 'o'), (0.58, gather, 'io'), (0.78, hit2, 'i'),
            (0.90, follow, 'o'), (1.06, hold, 'io'), (1.26, mid, 'io'), (1.48, S, 'io')]


def build(rig):
    """長劍の技の動きを作る。返り値：[(ゲームの名前, action, 情報)]"""
    out = []

    def make(name, fn, dur, loop=False):
        out.append(make_clip(rig, name, fn, dur, loop))

    k1, hold1 = cut1_keys()
    make('ls_cut1', lambda t: sample(k1, t), k1[-1][0])
    k2 = cut2_keys(hold1)
    make('ls_cut2', lambda t: sample(k2, t), k2[-1][0])
    ki = c1_in_keys()
    make('ls_c1_in', lambda t: sample(ki, t), ki[-1][0])
    make('ls_c1_hold', c1_hold, 1.0, loop=True)
    ko, lunge = c1_out_keys()
    make('ls_c1_out', lambda t: sample(ko, t), ko[-1][0])
    kc = c2_keys(lunge)
    make('ls_c2', lambda t: sample(kc, t), kc[-1][0])
    return out
