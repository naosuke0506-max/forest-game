# 戰鎚の技の動きを、Tripo の骨に直接付ける（Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具）
#
#   両手で持つ（右手は柄の上・左手はその 0.3 m 下）。頭には鎚の面（+X。刃の向き edge）と、反対側に尖った嘴、上に穂先がある
#   形は Claude が考えたもの（動作監督の画面で見てもらって直す）
#     打込（wh_cut1）：右肩に担いだ所から、右足で踏み込んで鎚の面で斜めに打ち込む
#     嘴打（wh_cut2）：打込の後。鎚を返して嘴を先にし、左から右へ横に打ち込む
#     天墜（wh_c1_in → wh_c1_hold → wh_c1_out）：頭の上へ持ち上げて背中まで落として溜め、離すと跳ぶように踏み込んで真上から振り下ろす
#     穿突（wh_c2）：天墜の後にもう一度溜めて離す。上の穂先で前へ突き（1 打目）、頭上へ振り上げて嘴を振り下ろす（2 打目）
#   待機・歩き・後ろ歩き・走り（wh_idle・wh_walk・wh_back・wh_run）：打擊騎士の動きの脚と体はそのままに、両手で斜めに持つ形にした物
#   手と足の位置で体を動かす道具は ik_rig.py（向きの約束も、そこに書いてある）
import math
from ik_rig import *   # noqa: F401,F403

HILT = -0.30
L2 = {'hilt': HILT, 'pole': (-0.7, -1, -0.2), 'slide': True}   # 届かない時は左手を柄の上で滑らせる

# 構え（左足が前・右足が後ろ。鎚は体の前で斜めに、頭を右上へ）
STANCE = {
    'hip': (0.0, -0.09, -0.02), 'hip_rot': (28, 6, 0), 'chest': (6, 4, 0), 'look': (0, 2), 'look_k': 0.9,
    'R': {'grip': (-0.08, -0.40, 0.58), 'blade': (0.35, 0.85, 0.35), 'edge': (0.1, -0.4, 0.9), 'pole': (0.6, -1, -0.2)},
    'L': dict(L2), 'R_clav': 0.0, 'L_clav': 0.0,
    'L_foot': (-0.20, 0.10, 8, 0, 0), 'R_foot': (0.20, -0.30, 35, 0, 0),
}
# 歩くときの持ち方（胸から見た向き。胸が回れば一緒に回る）
HOLD_R = {'grip': (-0.22, -0.42, 0.50), 'blade': (0.42, 0.82, 0.38), 'edge': (0.1, -0.45, 0.88), 'pole': (0.6, -1, -0.2)}


def cut1_keys():
    """打込：右肩に担いだ所から、右足で踏み込んで鎚の面で斜めに打ち込む"""
    S = STANCE
    shoulder = P(S, hip=(0.0, -0.08, -0.04), hip_rot=(48, 4, 0), chest=(16, -4, 0), R_clav=8.0, L_clav=6.0,
                 R={'grip': (0.30, 0.35, 0.15), 'blade': (0.25, 0.5, -0.83), 'edge': (0.1, 0.83, 0.5), 'pole': (0.9, -0.2, -0.4)})
    over = P(shoulder, hip=(0.0, -0.11, 0.10), hip_rot=(26, 8, 0), chest=(6, 2, 0),
             R={'grip': (0.15, 0.45, 0.55), 'blade': (0.05, 0.85, 0.5), 'edge': (0, 0.5, -0.85), 'pole': (0.8, -0.4, -0.2)},
             R_foot=(0.20, 0.05, 25, 15, 0.06))
    hit = P(S, hip=(0.0, -0.16, 0.26), hip_rot=(-4, 16, 0), chest=(-6, 10, 0), look=(0, 8), R_clav=2.0, L_clav=2.0,
            R={'grip': (-0.18, -0.05, 0.95), 'blade': (-0.3, -0.25, 0.92), 'edge': (-0.35, -0.92, 0.0), 'pole': (0.5, -1, 0)},
            R_foot=(0.17, 0.46, 12, 0, 0), L_foot=(-0.20, 0.10, 15, 18, 0))
    follow = P(hit, hip=(0.0, -0.18, 0.28), hip_rot=(-16, 20, 0), chest=(-10, 14, 0), R_clav=0.0, L_clav=0.0,
               R={'grip': (-0.45, -0.55, 0.55), 'blade': (-0.55, -0.7, 0.4), 'edge': (-0.2, 0.2, -0.95), 'pole': (0.4, -1, 0.2)})
    hold = P(follow, hip=(0.0, -0.17, 0.27))
    back = P(S, hip=(0.0, -0.10, 0.10), R_foot=(0.19, 0.10, 25, 10, 0.05))
    return [(0.0, S, None), (0.18, shoulder, 'io'), (0.32, over, 'i'), (0.38, hit, 'l'), (0.50, follow, 'o'), (0.68, hold, 'io'),
            (0.88, back, 'io'), (1.02, S, 'io')], hold


def cut2_keys(start):
    """嘴打：鎚を返して嘴を先にし（鎚の面は後ろ・左）、左から右へ横に打ち込む"""
    S = STANCE
    load = P(start, hip=(0.0, -0.15, 0.22), hip_rot=(-44, 10, 0), chest=(-14, 6, 0), look=(0, 4),
             R={'grip': (-0.60, -0.05, 0.40), 'blade': (-0.9, 0.25, 0.3), 'edge': (-0.25, 0, -0.95), 'pole': (0.3, -1, 0.3)})
    hit = P(start, hip=(0.0, -0.13, 0.14), hip_rot=(12, 8, 0), chest=(6, 4, 0), look=(0, 2),
            R={'grip': (0.0, 0.10, 1.0), 'blade': (0.1, 0.2, 0.97), 'edge': (-0.97, 0, 0.1), 'pole': (0.5, -1, -0.1)},
            R_foot=(0.20, -0.12, 35, 10, 0.03), L_foot=(-0.20, 0.10, 10, 0, 0))
    follow = P(hit, hip_rot=(46, 4, 0), chest=(14, 0, 0), R_clav=6.0,
               R={'grip': (0.70, 0.10, 0.42), 'blade': (0.9, 0.2, -0.3), 'edge': (-0.3, 0, -0.95), 'pole': (1, -0.4, -0.4)},
               R_foot=(0.20, -0.30, 35, 0, 0))
    settle = P(S, hip_rot=(32, 6, 0), R={'grip': (0.25, -0.20, 0.55), 'blade': (0.45, 0.8, 0.2)})
    return [(0.0, start, None), (0.16, load, 'io'), (0.34, hit, 'i'), (0.46, follow, 'o'), (0.64, settle, 'io'), (0.96, S, 'io')]


def charge_pose():
    """天墜の溜め：頭の上へ持ち上げ、鎚を背中まで落とす（膝を曲げ、重さは後ろ足）"""
    return P(STANCE, hip=(0.0, -0.18, -0.08), hip_rot=(20, -4, 0), chest=(4, -14, 0), look=(0, 8), R_clav=16.0, L_clav=14.0,
             R={'grip': (-0.04, 0.92, -0.08), 'blade': (0.05, -0.35, -0.94), 'edge': (0, -0.94, 0.35), 'pole': (1, 0.3, -0.2)},
             L_foot=(-0.22, 0.14, 10, 0, 0), R_foot=(0.22, -0.36, 40, 0, 0))


def c1_in_keys():
    S, C = STANCE, charge_pose()
    mid = P(S, hip=(0.0, -0.12, -0.05), hip_rot=(26, 2, 0), chest=(6, -6, 0), R_clav=8.0, L_clav=6.0,
            R={'grip': (0.18, 0.60, 0.30), 'blade': (0.15, 0.85, -0.5), 'edge': (0, 0.5, 0.85), 'pole': (1, -0.2, -0.3)})
    return [(0.0, S, None), (0.20, mid, 'io'), (0.42, C, 'o')]


def c1_hold(t):
    C = charge_pose()
    tr = 0.006 * math.sin(2 * math.pi * 8 * t) + 0.004 * math.sin(2 * math.pi * 13 * t + 0.7)
    br = 0.007 * math.sin(2 * math.pi * t)
    g = C['R']['grip']
    return P(C, hip=(C['hip'][0], C['hip'][1] + br, C['hip'][2]), R={'grip': (g[0] + tr, g[1] + tr * 0.4, g[2] - tr * 0.3)})


def _down(f, step, lean):
    """真上からの振り下ろし（当たりの姿勢。鎚の面が下）"""
    return P(STANCE, hip=(0.0, -0.24, f), hip_rot=(0, lean, 0), chest=(0, 18, 0), look=(0, 16), R_clav=2.0, L_clav=2.0,
             R={'grip': (0.0, -0.10, 1.02), 'blade': (0, -0.5, 0.86), 'edge': (0, -0.86, -0.5), 'pole': (0.5, -1, 0)},
             R_foot=(0.18, step, 10, 0, 0), L_foot=(-0.22, 0.20, 15, 20, 0))


def c1_out_keys():
    """天墜：跳ぶように踏み込んで、真上から振り下ろす"""
    S, C = STANCE, charge_pose()
    rise = P(C, hip=(0.0, -0.05, 0.06), R_foot=(0.22, -0.24, 35, 30, 0.0))
    air = P(C, hip=(0.0, 0.02, 0.30), chest=(2, -6, 0), R={'grip': (0.06, 0.95, 0.05)},
            R_foot=(0.18, 0.20, 20, 10, 0.12), L_foot=(-0.20, 0.25, 10, 10, 0.08))
    hit = _down(0.48, 0.62, 24)
    follow = P(hit, hip=(0.0, -0.27, 0.50),
               R={'grip': (0.0, -0.65, 0.62), 'blade': (0, -0.95, 0.25), 'edge': (0, -0.25, -0.95), 'pole': (0.5, -1, 0.1)})
    hold = P(follow, hip=(0.0, -0.26, 0.49))
    back = P(S, hip=(0.0, -0.12, 0.20), R_foot=(0.20, 0.20, 25, 10, 0.05))
    return [(0.0, C, None), (0.08, rise, 'io'), (0.16, air, 'o'), (0.24, hit, 'i'), (0.36, follow, 'o'), (0.62, hold, 'l'),
            (0.92, back, 'io'), (1.12, S, 'io')], hold


def c2_keys(start):
    """穿突：上の穂先で前へ突き（1 打目）、頭上へ振り上げて嘴を振り下ろす（2 打目。嘴が下、鎚の面は上）"""
    S = STANCE
    lift = P(start, hip=(0.0, -0.18, 0.40), hip_rot=(14, 10, 0),
             R={'grip': (-0.05, -0.35, 0.55), 'blade': (0, 0.2, 0.98), 'edge': (1, 0, 0), 'pole': (0.6, -1, -0.2)})
    thrust = P(start, hip=(0.0, -0.16, 0.50), hip_rot=(6, 14, 0), chest=(0, 6, 0), look=(0, 2),
               R={'grip': (-0.05, 0.0, 1.15), 'blade': (0, 0.25, 0.97), 'edge': (1, 0, 0), 'pole': (0.5, -1, 0)},
               L_foot=(-0.22, 0.45, 5, 0, 0))
    raise_ = P(charge_pose(), hip=(0.0, -0.12, 0.34), R={'grip': (0.12, 0.85, 0.0), 'blade': (0.05, -0.2, -0.98), 'edge': (0, 0.98, -0.2)},
               L_foot=(-0.22, 0.45, 5, 0, 0), R_foot=(0.22, -0.20, 40, 0, 0))
    gather = P(raise_, hip=(0.0, -0.15, 0.32), R={'grip': (0.14, 0.9, -0.06)})
    hit2 = P(_down(0.60, 0.80, 26), R={'edge': (0, 0.9, 0.45)})
    follow = P(hit2, hip=(0.0, -0.26, 0.62),
               R={'grip': (0.0, -0.62, 0.64), 'blade': (0, -0.95, 0.28), 'edge': (0, 0.28, 0.95), 'pole': (0.5, -1, 0.1)})
    hold = P(follow, hip=(0.0, -0.25, 0.61))
    mid = P(S, hip=(0.0, -0.13, 0.34), R_foot=(0.20, 0.30, 25, 0, 0.05), L_foot=(-0.20, 0.35, 8, 0, 0))
    return [(0.0, start, None), (0.16, lift, 'io'), (0.30, thrust, 'i'), (0.48, raise_, 'io'), (0.62, gather, 'io'), (0.82, hit2, 'i'),
            (0.96, follow, 'o'), (1.14, hold, 'io'), (1.38, mid, 'io'), (1.60, S, 'io')]


def build(rig, sources, info):
    """戰鎚の技と、両手で持つ待機・歩きの動きを作る。sources：できている動き（名前 → action）、info：その長さ・速さ。
    返り値：[(ゲームの名前, action, 情報)]"""
    out = []

    def make(name, fn, dur, loop=False):
        out.append(make_clip(rig, name, fn, dur, loop))

    k1, hold1 = cut1_keys()
    make('wh_cut1', lambda t: sample(k1, t), k1[-1][0])
    k2 = cut2_keys(hold1)
    make('wh_cut2', lambda t: sample(k2, t), k2[-1][0])
    ki = c1_in_keys()
    make('wh_c1_in', lambda t: sample(ki, t), ki[-1][0])
    make('wh_c1_hold', c1_hold, 1.0, loop=True)
    ko, hold3 = c1_out_keys()
    make('wh_c1_out', lambda t: sample(ko, t), ko[-1][0])
    kc = c2_keys(hold3)
    make('wh_c2', lambda t: sample(kc, t), kc[-1][0])
    for base in ('idle', 'walk', 'back', 'run'):
        if base in sources:
            act = hold_weapon(rig, sources[base], f'wh_{base}', HOLD_R, L2)
            out.append((f'wh_{base}', act, dict(info[base])))
            print('両手で持つ形にした', f'wh_{base}')
    return out
