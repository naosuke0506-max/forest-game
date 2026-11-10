# 短劍の技の動きを、Tripo の骨に直接付ける（Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具）
#
#   弓兵が持ち替えて使う短い剣。軽くて速い。身を低くし、左の拳を前に出して構える。
#   動きの形は利用者の指示どおり（2026-11-09。docs/DESIGN.md の「短劍の技」）
#     攻撃 1（dg_cut1）：右上から左下に向かって振り下ろす
#     攻撃 2（dg_cut2）：左下から右上に向かって薙ぎ払う
#     攻撃 3（dg_cut3）：突き刺す
#     溜攻撃 1（dg_c1_in → dg_c1_hold → dg_c1_out）：溜めて、続けて 3 回斬り裂く
#     溜攻撃 2（dg_c2_hold → dg_c2）：溜めて、続けて 2 回斬り裂く
#     暗殺・背後（dg_as_back）：背中を刺す（片手劍の背刺と同じ並び・時刻。される側は as_back_v）
#   刃（edge）は斬る向きへ向ける。手と足の位置で体を動かす道具は ik_rig.py（向きの約束も、そこに書いてある）
import math
from ik_rig import *   # noqa: F401,F403
from weapon_common import tremble

GUARD_L = {'wrist': (-0.18, -0.30, 0.55), 'pole': (-1, -0.6, 0)}


def _R(grip, blade, edge, pole=(0.5, -1, -0.4)):
    return {'grip': grip, 'blade': blade, 'edge': edge, 'pole': pole}


# 構え（左足が前・右足が後ろ。膝を曲げて身を低く、短劍は腰の前で切っ先を相手へ）
STANCE = {
    'hip': (0.0, -0.12, 0.0), 'hip_rot': (22, 12, 0), 'chest': (6, 6, 0), 'look': (0, 0),
    'R': _R((0.15, -0.40, 0.55), (0, 0.30, 0.95), (0.95, 0, -0.3)),
    'L': dict(GUARD_L), 'R_clav': 0.0, 'L_clav': 0.0,
    'L_foot': (-0.20, 0.12, 10, 0, 0), 'R_foot': (0.20, -0.30, 40, 0, 0),
}
# 斬る形（右手・胸の高さ）：右上・左下・右下・左上・前
UR = _R((0.50, 0.30, 0.45), (0.35, 0.85, -0.40), (-0.55, -0.25, -0.80), (1, 0, -0.4))      # 右上に振りかぶる（刃は左下へ）
DL = _R((-0.40, -0.60, 0.55), (-0.62, -0.25, 0.74), (-0.30, -0.95, -0.10), (0.2, -1, 0.3))  # 左下へ振り抜く
UR2 = _R((0.45, 0.30, 0.50), (0.60, 0.62, 0.50), (0.45, 0.70, -0.55), (1, -0.2, -0.3))      # 右上へ振り抜く（刃は上）
DL2 = _R((-0.35, -0.55, 0.50), (-0.70, -0.30, 0.65), (0.55, 0.80, 0.25), (0.3, -1, 0.3))     # 左下に構える（刃は右上へ）
RT = _R((0.55, -0.10, 0.40), (0.80, 0.10, -0.60), (-0.60, 0.0, -0.80), (1, -0.5, -0.4))     # 右に引く（刃は左へ）
LT = _R((-0.50, -0.15, 0.55), (-0.85, 0.10, 0.50), (-0.50, 0.0, -0.87), (0.2, -1, 0.5))     # 左へ振り抜く


def cut1_keys():
    """攻撃 1：右上へ振りかぶり、右上から左下へ振り下ろす"""
    S = STANCE
    hit = P(S, hip=(0.0, -0.15, 0.16), hip_rot=(-6, 16, 0), chest=(-8, 8, 0), look=(0, 6),
            R=_R((0.05, -0.10, 0.85), (-0.30, 0.30, 0.90), (-0.65, -0.70, -0.10), (0.5, -1, -0.1)),
            L={'wrist': (-0.30, -0.45, 0.30)}, R_foot=(0.18, -0.05, 30, 10, 0))
    follow = P(hit, hip_rot=(-24, 16, 0), chest=(-12, 8, 0), R=DL)
    hold = P(follow, hip=(0.0, -0.15, 0.15))
    back = P(S, hip=(0.0, -0.13, 0.06))
    return [(0.0, S, None), (0.10, P(S, hip_rot=(36, 10, 0), chest=(12, 4, 0), R=UR, R_clav=8.0), 'io'), (0.18, hit, 'i'),
            (0.26, follow, 'o'), (0.36, hold, 'io'), (0.48, back, 'io'), (0.56, S, 'io')], hold


def cut2_keys(start):
    """攻撃 2：左下に振り抜いた所から、左下から右上へ薙ぎ払う（刃を返して上へ）"""
    S = STANCE
    load = P(start, R=DL2)
    hit = P(start, hip=(0.0, -0.13, 0.14), hip_rot=(12, 12, 0), chest=(6, 4, 0), look=(0, 0),
            R=_R((0.08, -0.05, 0.88), (0.30, 0.35, 0.89), (0.65, 0.70, -0.10), (0.5, -1, -0.2)), L=dict(GUARD_L))
    follow = P(hit, hip_rot=(34, 8, 0), chest=(12, 0, 0), R=UR2, R_clav=8.0)
    hold = P(follow, hip=(0.0, -0.12, 0.12))
    back = P(S, hip=(0.0, -0.13, 0.05))
    return [(0.0, start, None), (0.08, load, 'io'), (0.17, hit, 'i'), (0.26, follow, 'o'), (0.36, hold, 'io'), (0.50, back, 'io'),
            (0.58, S, 'io')], hold


def cut3_keys(start):
    """攻撃 3：右の腰へ引いて、右足で踏み込んで突き刺す"""
    S = STANCE
    pull = P(S, hip=(0.0, -0.14, 0.04), hip_rot=(30, 12, 0), R=_R((0.25, -0.50, 0.15), (0, 0.15, 1), (0.95, 0, -0.3)), R_clav=0.0)
    hit = P(S, hip=(0.0, -0.17, 0.32), hip_rot=(-8, 16, 0), chest=(-6, 6, 0), look=(0, 4),
            R=_R((0.0, -0.30, 1.12), (0, 0.08, 1), (0.95, 0, -0.3), (0.3, -1, 0)),
            L={'wrist': (-0.30, -0.45, 0.25)}, R_foot=(0.16, 0.45, 10, 0, 0), L_foot=(-0.20, 0.12, 20, 15, 0))
    hold = P(hit, hip=(0.0, -0.18, 0.31), R={'grip': (0.0, -0.31, 1.09)})
    back = P(S, hip=(0.0, -0.13, 0.10), R_foot=(0.19, 0.10, 25, 10, 0.05))
    return [(0.0, start, None), (0.12, pull, 'io'), (0.22, hit, 'i'), (0.32, hold, 'o'), (0.50, back, 'io'), (0.66, S, 'io')]


def charge_pose():
    """溜攻撃 1 の溜め：身を深く沈め、短劍を右の腰の後ろへ引いて構える（刃は前）"""
    return P(STANCE, hip=(0.0, -0.28, -0.04), hip_rot=(30, 20, 0), chest=(8, 8, 0), look=(-6, -4),
             R=_R((0.40, -0.45, -0.05), (0.30, 0.10, 0.95), (0.80, 0.30, -0.30), (0.8, -1, -0.4)),
             L={'wrist': (-0.15, -0.25, 0.60)}, L_foot=(-0.24, 0.18, 10, 10, 0), R_foot=(0.24, -0.34, 40, 30, 0))


def c1_in_keys():
    S, C = STANCE, charge_pose()
    mid = P(S, hip=(0.0, -0.20, -0.02), hip_rot=(26, 16, 0), R=_R((0.30, -0.45, 0.25), (0.15, 0.20, 0.97), (0.90, 0.10, -0.30)))
    return [(0.0, S, None), (0.12, mid, 'io'), (0.26, C, 'o')]


def slash(base, hip_f, yaw, R, t_pitch=14):
    return P(base, hip=(0.0, -0.18, hip_f), hip_rot=(yaw, t_pitch, 0), R=R)


def c1_out_keys():
    """溜攻撃 1：踏み込みながら、続けて 3 回斬り裂く（右から左へ水平に → 左下から右上へ → 右上から左下へ）"""
    S, C = STANCE, charge_pose()
    base = P(S, L={'wrist': (-0.30, -0.40, 0.30)}, L_foot=(-0.20, 0.40, 8, 0, 0), R_foot=(0.20, -0.10, 30, 20, 0))
    h1a = slash(base, 0.14, 30, RT)
    h1 = slash(base, 0.22, -4, _R((0.02, -0.10, 0.90), (-0.35, 0.15, 0.92), (-0.92, 0.0, -0.35), (0.5, -1, -0.1)))
    h1b = slash(base, 0.26, -24, LT)
    h2a = slash(base, 0.28, -24, DL2)
    h2 = slash(base, 0.32, 8, _R((0.06, -0.08, 0.88), (0.32, 0.35, 0.88), (0.65, 0.70, -0.10), (0.5, -1, -0.2)))
    h2b = slash(base, 0.34, 30, UR2)
    h3a = slash(base, 0.36, 32, UR)
    h3 = slash(base, 0.42, -6, _R((0.05, -0.12, 0.86), (-0.30, 0.30, 0.90), (-0.65, -0.70, -0.10), (0.5, -1, -0.1)))
    h3b = slash(base, 0.44, -24, DL)
    hold = P(h3b, hip=(0.0, -0.17, 0.43))
    back = P(S, hip=(0.0, -0.13, 0.16), L_foot=(-0.20, 0.30, 8, 0, 0.04))
    return [(0.0, C, None), (0.07, h1a, 'io'), (0.13, h1, 'i'), (0.19, h1b, 'o'), (0.25, h2a, 'io'), (0.31, h2, 'i'),
            (0.37, h2b, 'o'), (0.43, h3a, 'io'), (0.49, h3, 'i'), (0.56, h3b, 'o'), (0.70, hold, 'io'), (0.88, back, 'io'), (1.00, S, 'io')]


def c2_hold_pose():
    """溜攻撃 2 の溜め：低く構え、短劍を右肩の上へ振りかぶって溜める"""
    return P(STANCE, hip=(0.0, -0.24, 0.20), hip_rot=(34, 16, 0), chest=(12, 6, 0), look=(-8, 0), R_clav=8.0,
             R=UR, L={'wrist': (-0.15, -0.25, 0.60)}, L_foot=(-0.20, 0.40, 8, 0, 0), R_foot=(0.20, -0.20, 35, 10, 0))


def c2_keys():
    """溜攻撃 2：右上から左下へ斬り（1 回目）、刃を返して左下から右上へ斬り上げる（2 回目）"""
    S, H = STANCE, c2_hold_pose()
    base = P(H, R_clav=0.0, L={'wrist': (-0.30, -0.40, 0.30)})
    h1 = slash(base, 0.32, -6, _R((0.05, -0.12, 0.86), (-0.30, 0.30, 0.90), (-0.65, -0.70, -0.10), (0.5, -1, -0.1)))
    h1b = slash(base, 0.36, -24, DL)
    h2a = slash(base, 0.38, -26, DL2)
    h2 = slash(base, 0.42, 10, _R((0.06, -0.08, 0.88), (0.32, 0.35, 0.88), (0.65, 0.70, -0.10), (0.5, -1, -0.2)))
    h2b = slash(base, 0.44, 32, UR2)
    hold = P(h2b, hip=(0.0, -0.16, 0.42))
    back = P(S, hip=(0.0, -0.13, 0.16), L_foot=(-0.20, 0.30, 8, 0, 0.04))
    return [(0.0, H, None), (0.14, h1, 'i'), (0.21, h1b, 'o'), (0.27, h2a, 'io'), (0.34, h2, 'i'), (0.41, h2b, 'o'),
            (0.56, hold, 'io'), (0.76, back, 'io'), (0.88, S, 'io')]


def build(rig):
    """短劍の技の動きを作る。返り値：[(ゲームの名前, action, 情報)]"""
    out = []

    def make(name, fn, dur, loop=False):
        out.append(make_clip(rig, name, fn, dur, loop))

    k1, hold1 = cut1_keys()
    make('dg_cut1', lambda t: sample(k1, t), k1[-1][0])
    k2, hold2 = cut2_keys(hold1)
    make('dg_cut2', lambda t: sample(k2, t), k2[-1][0])
    k3 = cut3_keys(hold2)
    make('dg_cut3', lambda t: sample(k3, t), k3[-1][0])
    ki = c1_in_keys()
    make('dg_c1_in', lambda t: sample(ki, t), ki[-1][0])
    C = charge_pose()
    make('dg_c1_hold', lambda t: tremble(C, t, f1=10, f2=16), 1.0, loop=True)
    ko = c1_out_keys()
    make('dg_c1_out', lambda t: sample(ko, t), ko[-1][0])
    H = c2_hold_pose()
    make('dg_c2_hold', lambda t: tremble(H, t, f1=10, f2=16), 1.0, loop=True)
    kc = c2_keys()
    make('dg_c2', lambda t: sample(kc, t), kc[-1][0])
    # 暗殺・背後：片手劍の背刺と同じ並び・時刻（相手は 0.64 m 前に背を向けて立つ。される側は as_back_v）で、短劍を背中に刺す
    import onehand_moves
    ka = onehand_moves.as_back_keys(False)
    make('dg_as_back', lambda t: sample(ka, t), ka[-1][0])
    return out
