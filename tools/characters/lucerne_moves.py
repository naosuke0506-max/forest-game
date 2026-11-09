# 長柄鎚の技の動きを、Tripo の骨に直接付ける（Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具）
#
#   長さ 2 m の長柄。両手で持つ（右手は柄の真ん中・左手はその 0.6 m 後ろ）。頭には三つ又の鎚の面（+X。刃の向き edge）と、
#   反対側に曲がった嘴、上に長い穂先がある。槍のように遠くを突き、長い柄で大きく振る。形は Claude が考えたもの（動作監督の画面で見てもらって直す）
#     穗突（lc_cut1）：右手を前へ送って、先の穂先で遠くを突く
#     大薙（lc_cut2）：穗突の後。長い柄を右から左へ大きく振り、鎚の面で薙ぎ払う
#     落雷（lc_c1_in → lc_c1_hold → lc_c1_out）：高く振りかぶって溜め、離すと左足で踏み込んで遠くから真上へ叩き落とす
#     鉤返（lc_c2）：落雷の後にもう一度溜めて離す。嘴で引っ掛けるように手前へ引き（1 打目）、そのまま穂先で突き返す（2 打目）
#   待機・歩き・後ろ歩き・走り（lc_idle・lc_walk・lc_back・lc_run）：打擊騎士の動きの脚と体はそのままに、両手で立てて持つ形にした物
#   手と足の位置で体を動かす道具は ik_rig.py（向きの約束も、そこに書いてある）
import math
from ik_rig import *   # noqa: F401,F403

HILT = -0.60
L2 = {'hilt': HILT, 'pole': (-0.6, -1, -0.4), 'slide': True}   # 届かない時は左手を柄の上で滑らせる

# 構え（左足が前・右足が後ろ、広く。右手を前に、穂先を相手の胸へ）
STANCE = {
    'hip': (0.0, -0.10, -0.04), 'hip_rot': (34, 6, 0), 'chest': (8, 4, 0), 'look': (-6, 0), 'look_k': 0.9,
    'R': {'grip': (-0.10, -0.55, 0.85), 'blade': (0.0, 0.22, 1.0), 'edge': (1, 0, 0), 'pole': (0.6, -1, -0.2)},
    'L': dict(L2), 'R_clav': 0.0, 'L_clav': 0.0,
    'L_foot': (-0.22, 0.12, 10, 0, 0), 'R_foot': (0.22, -0.38, 40, 0, 0),
}
# 歩くときの持ち方（胸から見た向き）：右肩の前に立てて持つ（石突きは足もとの近く）
HOLD_R = {'grip': (-0.04, -0.28, 0.52), 'blade': (0.28, 0.90, 0.33), 'edge': (0.95, -0.25, -0.2), 'pole': (0.6, -1, -0.2)}


def cut1_keys():
    """穗突：右手を前へ送って、先の穂先で遠くを突く"""
    S = STANCE
    draw = P(S, hip=(0.0, -0.11, -0.08), hip_rot=(42, 4, 0), R={'grip': (-0.05, -0.60, 0.40), 'blade': (0, 0.2, 1)})
    hit = P(S, hip=(0.0, -0.15, 0.36), hip_rot=(16, 12, 0), chest=(2, 6, 0), look=(-2, 2),
            R={'grip': (-0.10, -0.42, 1.15), 'blade': (0, 0.12, 1)},
            R_foot=(0.22, -0.14, 35, 25, 0), L_foot=(-0.22, 0.55, 5, 0, 0))
    hold = P(hit, hip=(0.0, -0.16, 0.35), R={'grip': (-0.10, -0.43, 1.12)})
    back = P(S, hip=(0.0, -0.11, 0.12), L_foot=(-0.22, 0.30, 8, 0, 0.04))
    return [(0.0, S, None), (0.10, draw, 'io'), (0.24, hit, 'i'), (0.36, hold, 'o'), (0.56, back, 'io'), (0.74, S, 'io')], hold


def cut2_keys(start):
    """大薙：長い柄を右から左へ大きく振り、鎚の面（先に立つ向き）で薙ぎ払う"""
    S = STANCE
    wind = P(start, hip=(0.0, -0.13, 0.18), hip_rot=(62, 6, 0), chest=(18, 2, 0), look=(0, 2), R_clav=6.0,
             R={'grip': (0.40, -0.20, 0.55), 'blade': (0.92, 0.15, -0.35), 'edge': (0.3, 0, 0.95), 'pole': (0.9, -0.6, -0.3)})
    hit = P(start, hip=(-0.02, -0.15, 0.30), hip_rot=(6, 10, 0), chest=(-4, 6, 0), look=(0, 4), R_clav=2.0,
            R={'grip': (-0.12, -0.25, 1.05), 'blade': (-0.1, 0.05, 1), 'edge': (-1, 0, -0.1), 'pole': (0.4, -1, 0)},
            L_foot=(-0.26, 0.50, 0, 0, 0), R_foot=(0.20, -0.20, 35, 20, 0))
    follow = P(hit, hip_rot=(-40, 10, 0), chest=(-14, 6, 0),
               R={'grip': (-0.65, -0.30, 0.65), 'blade': (-0.95, 0, 0.3), 'edge': (-0.3, 0, -0.95), 'pole': (0.2, -1, 0.4)})
    settle = P(S, hip=(0.0, -0.11, 0.12), L_foot=(-0.24, 0.30, 5, 0, 0.04))
    return [(0.0, start, None), (0.18, wind, 'io'), (0.32, P(wind, hip_rot=(44, 7, 0)), 'i'), (0.38, hit, 'i'), (0.52, follow, 'o'),
            (0.70, settle, 'io'), (1.00, S, 'io')]


def charge_pose():
    """落雷の溜め：長柄を高く振りかぶる（頭は後ろの上。両手は頭の上、重さは後ろ足）"""
    return P(STANCE, hip=(0.0, -0.12, -0.10), hip_rot=(24, -6, 0), chest=(4, -12, 0), look=(0, 4), R_clav=14.0, L_clav=12.0,
             R={'grip': (0.05, 0.95, 0.05), 'blade': (0.0, 0.55, -0.83), 'edge': (0, 0.83, 0.55), 'pole': (1, 0.2, -0.3)},
             L_foot=(-0.22, 0.12, 10, 0, 0), R_foot=(0.22, -0.40, 40, 0, 0))


def c1_in_keys():
    S, C = STANCE, charge_pose()
    mid = P(S, hip=(0.0, -0.11, -0.06), hip_rot=(30, 0, 0), chest=(6, -4, 0), R_clav=8.0,
            R={'grip': (0.0, 0.40, 0.55), 'blade': (0, 0.85, 0.5), 'edge': (0, 0.5, -0.85), 'pole': (1, -0.3, -0.3)})
    return [(0.0, S, None), (0.22, mid, 'io'), (0.45, C, 'o')]


def c1_hold(t):
    C = charge_pose()
    tr = 0.006 * math.sin(2 * math.pi * 7 * t) + 0.004 * math.sin(2 * math.pi * 12 * t + 0.7)
    br = 0.007 * math.sin(2 * math.pi * t)
    g = C['R']['grip']
    return P(C, hip=(C['hip'][0], C['hip'][1] + br, C['hip'][2]), R={'grip': (g[0] + tr, g[1] + tr * 0.4, g[2] - tr * 0.3)})


def c1_out_keys():
    """落雷：左足で踏み込み、遠くから真上へ叩き落とす（鎚の面が下）"""
    S, C = STANCE, charge_pose()
    coil = P(C, R={'grip': (0.06, 1.0, -0.02), 'blade': (0, 0.45, -0.89)})
    hit = P(S, hip=(0.0, -0.20, 0.45), hip_rot=(8, 22, 0), chest=(0, 16, 0), look=(0, 14), R_clav=2.0, L_clav=2.0,
            R={'grip': (-0.05, 0.05, 1.10), 'blade': (0, -0.32, 0.95), 'edge': (0, -0.95, -0.32), 'pole': (0.5, -1, 0)},
            L_foot=(-0.22, 0.75, 5, 0, 0), R_foot=(0.22, -0.20, 40, 30, 0))
    follow = P(hit, hip=(0.0, -0.22, 0.47), R={'grip': (-0.05, -0.40, 0.95), 'blade': (0, -0.55, 0.84), 'edge': (0, -0.84, -0.55)})
    hold = P(follow, hip=(0.0, -0.21, 0.46))
    back = P(S, hip=(0.0, -0.12, 0.18), L_foot=(-0.22, 0.40, 8, 0, 0.05))
    return [(0.0, C, None), (0.08, coil, 'io'), (0.24, hit, 'i'), (0.36, follow, 'o'), (0.60, hold, 'l'), (0.86, back, 'io'), (1.06, S, 'io')], hold


def c2_keys(start):
    """鉤返：嘴で引っ掛けるように手前へ引き（1 打目。嘴が手前、鎚の面が向こう）、そのまま穂先で突き返す（2 打目）"""
    S = STANCE
    reach = P(start, hip=(0.0, -0.19, 0.45),
              R={'grip': (-0.08, -0.25, 1.15), 'blade': (0, -0.40, 0.92), 'edge': (0, 0.92, 0.40), 'pole': (0.5, -1, 0)})
    pull = P(start, hip=(0.0, -0.13, 0.08), hip_rot=(40, 2, 0), chest=(12, -4, 0), look=(0, 6),
             R={'grip': (0.02, -0.55, 0.50), 'blade': (0, -0.55, 0.84), 'edge': (0, 0.84, 0.55), 'pole': (0.6, -1, -0.2)},
             L_foot=(-0.22, 0.40, 8, 0, 0), R_foot=(0.22, -0.42, 40, 0, 0))
    setp = P(pull, R={'grip': (-0.05, -0.50, 0.55), 'blade': (0, 0.10, 1), 'edge': (1, 0, 0)})
    thrust = P(S, hip=(0.0, -0.16, 0.50), hip_rot=(12, 14, 0), chest=(2, 6, 0), look=(-2, 2),
               R={'grip': (-0.10, -0.40, 1.18), 'blade': (0, 0.10, 1)},
               L_foot=(-0.22, 0.70, 0, 0, 0), R_foot=(0.22, -0.15, 35, 30, 0))
    hold = P(thrust, hip=(0.0, -0.17, 0.49), R={'grip': (-0.10, -0.41, 1.15)})
    back = P(S, hip=(0.0, -0.12, 0.22), L_foot=(-0.22, 0.40, 8, 0, 0.05))
    return [(0.0, start, None), (0.18, reach, 'io'), (0.34, pull, 'i'), (0.50, setp, 'io'), (0.72, thrust, 'i'), (0.88, hold, 'o'),
            (1.12, back, 'io'), (1.38, S, 'io')]


def build(rig, sources, info):
    """長柄鎚の技と、両手で立てて持つ待機・歩きの動きを作る。返り値：[(ゲームの名前, action, 情報)]"""
    out = []

    def make(name, fn, dur, loop=False):
        out.append(make_clip(rig, name, fn, dur, loop))

    k1, hold1 = cut1_keys()
    make('lc_cut1', lambda t: sample(k1, t), k1[-1][0])
    k2 = cut2_keys(hold1)
    make('lc_cut2', lambda t: sample(k2, t), k2[-1][0])
    ki = c1_in_keys()
    make('lc_c1_in', lambda t: sample(ki, t), ki[-1][0])
    make('lc_c1_hold', c1_hold, 1.0, loop=True)
    ko, hold3 = c1_out_keys()
    make('lc_c1_out', lambda t: sample(ko, t), ko[-1][0])
    kc = c2_keys(hold3)
    make('lc_c2', lambda t: sample(kc, t), kc[-1][0])
    for base in ('idle', 'walk', 'back', 'run'):
        if base in sources:
            act = hold_weapon(rig, sources[base], f'lc_{base}', HOLD_R, L2)
            out.append((f'lc_{base}', act, dict(info[base])))
            print('両手で持つ形にした', f'lc_{base}')
    return out
