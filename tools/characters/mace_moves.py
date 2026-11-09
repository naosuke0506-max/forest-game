# 鎚矛の技の動きを、Tripo の骨に直接付ける（Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具）
#
#   片手で持つ重い打撃武器。剣より振りかぶりが大きく、重さを乗せて叩く。形は Claude が考えたもの（動作監督の画面で見てもらって直す）
#     打落（mc_cut1）：右肩の後ろへ振りかぶり、右足で踏み込んで右上から斜めに振り下ろす
#     拂打（mc_cut2）：打落の後。左下に落ちた鎚矛を、裏から左→右へ水平に払う（踏み込んだ右足を戻しながら）
#     兜割（mc_c1_in → mc_c1_hold → mc_c1_out）：頭の後ろへ大きく振りかぶって溜め、離すと右足で踏み込んで真上から叩き割る
#     連碎（mc_c2）：兜割の後にもう一度溜めて離す。下から突き上げるように振り上げ（1 打目）、頭上で返してもう一度叩き落とす（2 打目）
#   楯劍騎士は左手に楯を構えたまま振る。打擊騎士・祓魔僧（楯なし）は左の拳を前に出して釣り合いを取る
#   手と足の位置で体を動かす道具は ik_rig.py（向きの約束も、そこに書いてある）。刃の向き（edge）は鎚の頭の打つ面の向き
import math
from ik_rig import *   # noqa: F401,F403


def _left(shield, pose='guard'):
    """左腕：楯を構える（楯劍騎士）／拳を前に出す（楯なし）。pose：guard 構え・high 振りかぶりで少し上げる・low 振り抜いて下げる"""
    if shield:
        w = {'guard': (-0.05, -0.42, 0.62), 'high': (-0.08, -0.30, 0.66), 'low': (-0.12, -0.55, 0.42)}[pose]
        return {'wrist': w, 'normal': (-0.25, 0, 1), 'up': (0, 1, 0), 'pole': (-1, -0.6, 0)}
    w = {'guard': (-0.12, -0.52, 0.48), 'high': (-0.18, -0.35, 0.58), 'low': (-0.30, -0.62, 0.22)}[pose]
    return {'wrist': w, 'pole': (-1, -0.8, 0)}


def stance(shield):
    """構え：左足が前・右足が後ろ。鎚矛は右手で腰の前に立て、頭を上へ"""
    return {
        'hip': (0.0, -0.08, -0.02), 'hip_rot': (24, 8, 0), 'chest': (5, 4, 0), 'look': (0, 2),
        'R': {'grip': (0.22, -0.42, 0.52), 'blade': (0.05, 0.9, 0.45), 'edge': (0, -0.45, 0.9), 'pole': (0.5, -1, -0.3)},
        'L': _left(shield), 'R_clav': 0.0, 'L_clav': 0.0,
        'L_foot': (-0.20, 0.10, 8, 0, 0), 'R_foot': (0.20, -0.30, 40, 0, 0),
    }


def cut1_keys(sh):
    """打落：右肩の後ろへ振りかぶり、右足で踏み込んで右上から斜めに振り下ろす"""
    S = stance(sh)
    up = P(S, hip=(0.0, -0.07, -0.05), hip_rot=(42, 4, 0), chest=(14, -6, 0), R_clav=10.0, L=_left(sh, 'high'),
           R={'grip': (0.42, 0.62, -0.05), 'blade': (0.35, 0.35, -0.87), 'edge': (0.1, 0.9, 0.4), 'pole': (1, 0.1, -0.4)})
    over = P(up, hip=(0.0, -0.10, 0.10), hip_rot=(24, 8, 0), chest=(6, 2, 0),
             R={'grip': (0.25, 0.68, 0.45), 'blade': (0.1, 0.75, 0.65), 'edge': (0, 0.65, -0.75), 'pole': (0.9, -0.3, -0.3)},
             R_foot=(0.18, 0.05, 25, 12, 0.05))
    hit = P(S, hip=(0.0, -0.15, 0.24), hip_rot=(-6, 16, 0), chest=(-6, 10, 0), look=(0, 8), R_clav=4.0,
            R={'grip': (-0.05, -0.05, 1.0), 'blade': (-0.15, -0.35, 0.92), 'edge': (-0.3, -0.92, -0.3), 'pole': (0.5, -1, 0)},
            R_foot=(0.16, 0.42, 15, 0, 0), L_foot=(-0.20, 0.10, 15, 15, 0))
    follow = P(hit, hip=(0.0, -0.17, 0.26), hip_rot=(-14, 18, 0), chest=(-8, 12, 0), R_clav=0.0, L=_left(sh, 'low'),
               R={'grip': (-0.35, -0.62, 0.60), 'blade': (-0.3, -0.8, 0.5), 'edge': (-0.2, 0.55, 0.8), 'pole': (0.4, -1, 0.2)})
    hold = P(follow, hip=(0.0, -0.16, 0.25), hip_rot=(-10, 16, 0))
    back = P(S, hip=(0.0, -0.10, 0.10), R_foot=(0.19, 0.10, 25, 10, 0.05))
    return [(0.0, S, None), (0.18, up, 'io'), (0.30, over, 'i'), (0.36, hit, 'l'), (0.46, follow, 'o'), (0.62, hold, 'io'),
            (0.82, back, 'io'), (0.96, S, 'io')], hold


def cut2_keys(sh, start):
    """拂打：左下に落ちた鎚矛を、裏から左→右へ水平に払う。踏み込んだ右足を戻しながら"""
    S = stance(sh)
    load = P(start, hip=(0.0, -0.15, 0.22), hip_rot=(-40, 14, 0), chest=(-14, 8, 0), look=(0, 4),
             R={'grip': (-0.62, -0.20, 0.45), 'blade': (-0.85, 0.30, 0.40), 'edge': (0.3, 0, 0.95), 'pole': (0.3, -1, 0.3)})
    hit = P(start, hip=(0.0, -0.12, 0.12), hip_rot=(10, 10, 0), chest=(6, 6, 0), look=(0, 2), L=_left(sh),
            R={'grip': (0.05, 0.08, 1.0), 'blade': (0.15, 0.25, 0.95), 'edge': (1, 0, -0.15), 'pole': (0.4, -1, -0.2)},
            R_foot=(0.20, -0.12, 35, 10, 0.03), L_foot=(-0.20, 0.10, 10, 0, 0))
    follow = P(hit, hip_rot=(42, 6, 0), chest=(14, 2, 0), R_clav=6.0,
               R={'grip': (0.78, 0.12, 0.40), 'blade': (0.85, 0.25, -0.30), 'edge': (0.2, 0, -1), 'pole': (1, -0.4, -0.4)},
               R_foot=(0.20, -0.30, 40, 0, 0))
    settle = P(S, hip_rot=(30, 6, 0), R={'grip': (0.40, -0.10, 0.55), 'blade': (0.25, 0.8, 0.5), 'edge': (0.5, -0.5, 0.7)})
    return [(0.0, start, None), (0.14, load, 'io'), (0.30, hit, 'i'), (0.40, follow, 'o'), (0.56, settle, 'io'), (0.88, S, 'io')]


def charge_pose(sh):
    """兜割の溜め：頭の後ろへ大きく振りかぶる（鎚の頭は背中の側へ下がり、重さは後ろ足）"""
    return P(stance(sh), hip=(0.0, -0.14, -0.06), hip_rot=(18, -6, 0), chest=(6, -12, 0), look=(0, 6), R_clav=14.0, L=_left(sh, 'high'),
             R={'grip': (0.12, 0.95, 0.0), 'blade': (0.05, -0.15, -1.0), 'edge': (0, -1, 0.15), 'pole': (1, 0.2, -0.3)},
             L_foot=(-0.20, 0.12, 10, 0, 0), R_foot=(0.20, -0.34, 40, 0, 0))


def c1_in_keys(sh):
    S, C = stance(sh), charge_pose(sh)
    mid = P(S, hip=(0.0, -0.11, -0.04), hip_rot=(30, 2, 0), chest=(8, -4, 0),
            R={'grip': (0.30, 0.55, 0.25), 'blade': (0.2, 0.6, -0.75), 'edge': (0, 0.8, 0.6), 'pole': (1, -0.2, -0.3)})
    return [(0.0, S, None), (0.18, mid, 'io'), (0.38, C, 'o')]


def c1_hold_fn(sh):
    C = charge_pose(sh)

    def fn(t):
        tr = 0.007 * math.sin(2 * math.pi * 9 * t) + 0.004 * math.sin(2 * math.pi * 14 * t + 0.7)
        br = 0.006 * math.sin(2 * math.pi * t)
        g = C['R']['grip']
        return P(C, hip=(C['hip'][0], C['hip'][1] + br, C['hip'][2]), R={'grip': (g[0] + tr, g[1] + tr * 0.4, g[2] - tr * 0.3)})
    return fn


def _smash(base, sh, f=0.36, step=0.55, lean=22):
    """真上からの叩き割り（当たりの姿勢）"""
    return P(base, hip=(0.0, -0.18, f), hip_rot=(2, lean, 0), chest=(0, 16, 0), look=(0, 12), R_clav=2.0, L=_left(sh, 'low'),
             R={'grip': (-0.02, -0.05, 1.02), 'blade': (0, -0.4, 0.92), 'edge': (0, -0.92, -0.4), 'pole': (0.5, -1, 0)},
             R_foot=(0.16, step, 12, 0, 0), L_foot=(-0.20, 0.10, 18, 22, 0))


def c1_out_keys(sh):
    """兜割：右足で踏み込み、真上から叩き割る"""
    S, C = stance(sh), charge_pose(sh)
    coil = P(C, R={'grip': (0.12, 1.0, -0.08)})
    hit = _smash(S, sh)
    follow = P(hit, hip=(0.0, -0.20, 0.38),
               R={'grip': (0.0, -0.62, 0.66), 'blade': (0, -0.9, 0.35), 'edge': (0, -0.35, -0.92), 'pole': (0.5, -1, 0.1)})
    hold = P(follow, hip=(0.0, -0.19, 0.37))
    back = P(S, hip=(0.0, -0.11, 0.14), R_foot=(0.19, 0.12, 25, 10, 0.05))
    return [(0.0, C, None), (0.06, coil, 'io'), (0.18, hit, 'i'), (0.30, follow, 'o'), (0.50, hold, 'l'), (0.74, back, 'io'), (0.94, S, 'io')], hold


def c2_keys(sh, start):
    """連碎：下から突き上げるように振り上げ（1 打目）、頭上で返して、もう一度叩き落とす（2 打目）"""
    S = stance(sh)
    dip = P(start, hip=(0.0, -0.20, 0.30), hip_rot=(-14, 18, 0),
            R={'grip': (-0.15, -0.75, 0.50), 'blade': (-0.2, -0.85, 0.45), 'edge': (0, 0.45, 0.88), 'pole': (0.4, -1, 0.2)})
    up = P(start, hip=(0.0, -0.12, 0.26), hip_rot=(10, 8, 0), chest=(4, -2, 0), look=(0, -4), L=_left(sh),
           R={'grip': (0.08, 0.30, 0.92), 'blade': (0.05, 0.75, 0.65), 'edge': (0, 0.65, -0.75), 'pole': (0.5, -1, -0.1)},
           R_foot=(0.18, 0.20, 25, 10, 0.03))
    top = P(charge_pose(sh), hip=(0.0, -0.11, 0.20), R_foot=(0.20, -0.20, 35, 0, 0))
    gather = P(top, hip=(0.0, -0.14, 0.18), R={'grip': (0.14, 1.0, -0.06)})
    hit2 = _smash(S, sh, f=0.52, step=0.75, lean=24)
    follow = P(hit2, hip=(0.0, -0.21, 0.53),
               R={'grip': (0.0, -0.62, 0.66), 'blade': (0, -0.9, 0.35), 'edge': (0, -0.35, -0.92), 'pole': (0.5, -1, 0.1)})
    hold = P(follow, hip=(0.0, -0.20, 0.52))
    mid = P(S, hip=(0.0, -0.12, 0.30), R_foot=(0.19, 0.30, 25, 0, 0.05))
    return [(0.0, start, None), (0.14, dip, 'io'), (0.32, up, 'i'), (0.50, top, 'o'), (0.62, gather, 'io'), (0.80, hit2, 'i'),
            (0.94, follow, 'o'), (1.10, hold, 'io'), (1.32, mid, 'io'), (1.55, S, 'io')]


def build(rig, shield=True):
    """鎚矛の技の動きを作る（shield：楯を持つか）。返り値：[(ゲームの名前, action, 情報)]"""
    out = []

    def make(name, fn, dur, loop=False):
        out.append(make_clip(rig, name, fn, dur, loop))

    k1, hold1 = cut1_keys(shield)
    make('mc_cut1', lambda t: sample(k1, t), k1[-1][0])
    k2 = cut2_keys(shield, hold1)
    make('mc_cut2', lambda t: sample(k2, t), k2[-1][0])
    ki = c1_in_keys(shield)
    make('mc_c1_in', lambda t: sample(ki, t), ki[-1][0])
    make('mc_c1_hold', c1_hold_fn(shield), 1.0, loop=True)
    ko, hold3 = c1_out_keys(shield)
    make('mc_c1_out', lambda t: sample(ko, t), ko[-1][0])
    kc = c2_keys(shield, hold3)
    make('mc_c2', lambda t: sample(kc, t), kc[-1][0])
    return out
