# 鎚矛の技の動きを、Tripo の骨に直接付ける（Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具）
#
#   片手で持つ重い打撃武器。動きの形は利用者の指示どおり（2026-11-09。docs/DESIGN.md の「鎚矛の技」）
#     攻撃 1（mc_cut1）：体の右側から、左側に向かって鎚矛を振り回す
#     攻撃 2（mc_cut2）：左側から、右側に向かって振り回す
#     攻撃 3（mc_cut3）：右側の腰あたりで鎚矛を溜め、下から上に向かってかち上げる
#     溜攻撃 1（mc_c1_in → mc_c1_hold → mc_c1_out）：腰あたりで鎚矛を溜め、攻撃 3 のかち上げを強く行う
#     溜攻撃 2（mc_c2_hold → mc_c2）：かち上げた鎚矛を肩ぐらいの高さで溜め、一歩進みながら地面に向かって振り下ろし、地面を叩く
#     暗殺・背後（mc_as_back）：相手の肩に振り下ろし、跪いたところへ頭に向かって返しで振り下ろす（weapon_common.py。される側は as_blunt_v）
#   楯劍騎士は左手に楯を構えたまま振る。打擊騎士・祓魔僧（楯なし）は左の拳を前に出して釣り合いを取る
#   右手の拳の向きは、柄の向き（blade）と前腕から決める（auto。ik_rig.py の auto_grip）。鎚矛の頭は丸いので、どの面で打っても同じ
import math
from ik_rig import *   # noqa: F401,F403
from weapon_common import tremble, blunt_assassin_keys

REACH = 0.50   # 持ち手の点から鎚の頭の真ん中まで（m。長さ 0.75 m、持ち手は柄頭から 2 割）
AS_GAP = 0.95  # 暗殺：相手は 0.95 m 前に背を向けて立つ


def _left(shield, pose='guard'):
    """左腕：楯を構える（楯劍騎士）／拳を前に出す（楯なし）。pose：guard 構え・high 振りかぶりで少し上げる・low 振り抜いて下げる"""
    if shield:
        w = {'guard': (-0.05, -0.42, 0.62), 'high': (-0.08, -0.30, 0.66), 'low': (-0.12, -0.55, 0.42)}[pose]
        return {'wrist': w, 'normal': (-0.25, 0, 1), 'up': (0, 1, 0), 'pole': (-1, -0.6, 0)}
    w = {'guard': (-0.12, -0.52, 0.48), 'high': (-0.18, -0.35, 0.58), 'low': (-0.30, -0.62, 0.22)}[pose]
    return {'wrist': w, 'pole': (-1, -0.8, 0)}


def _R(grip, blade, pole=(0.5, -1, -0.3), roll=0.0):
    return {'grip': grip, 'blade': blade, 'edge': (0, 0, 1), 'pole': pole, 'auto': 1.0, 'roll': roll}


def stance(shield):
    """構え：左足が前・右足が後ろ。鎚矛は右手で腰の前に立て、頭を上へ"""
    return {
        'hip': (0.0, -0.08, -0.02), 'hip_rot': (24, 8, 0), 'chest': (5, 4, 0), 'look': (0, 2),
        'R': _R((0.22, -0.42, 0.52), (0.05, 0.9, 0.45)),
        'L': _left(shield), 'R_clav': 0.0, 'L_clav': 0.0,
        'L_foot': (-0.20, 0.10, 8, 0, 0), 'R_foot': (0.20, -0.30, 40, 0, 0),
    }


def cut1_keys(sh):
    """攻撃 1：体の右側から左側へ、水平に振り回す（右へ開いて引き、前を通して左へ振り抜く）"""
    S = stance(sh)
    wind = P(S, hip=(0.0, -0.09, -0.04), hip_rot=(58, 6, 0), chest=(16, 2, 0), look=(-20, 2), R_clav=6.0, L=_left(sh, 'high'),
             R=_R((0.78, -0.10, -0.05), (0.55, 0.35, -0.76), (0.8, -0.6, -0.4)))
    swing = P(S, hip=(0.0, -0.11, 0.06), hip_rot=(30, 8, 0), chest=(8, 4, 0), look=(-6, 4),
              R=_R((0.62, -0.12, 0.62), (0.80, 0.15, 0.58), (0.7, -0.8, -0.3)))
    hit = P(S, hip=(0.0, -0.13, 0.14), hip_rot=(-4, 10, 0), chest=(-6, 6, 0), look=(0, 4), R_clav=2.0,
            R=_R((0.02, -0.12, 0.95), (-0.30, 0.10, 0.95), (0.4, -1, -0.1)),
            R_foot=(0.20, -0.18, 30, 15, 0))
    follow = P(hit, hip_rot=(-42, 10, 0), chest=(-14, 6, 0), look=(10, 4), R_clav=0.0, L=_left(sh, 'low'),
               R=_R((-0.62, -0.25, 0.50), (-0.92, 0.0, -0.38), (0.1, -1, 0.4)))
    hold = P(follow, hip_rot=(-38, 10, 0))
    back = P(S, hip=(0.0, -0.10, 0.06))
    return [(0.0, S, None), (0.16, wind, 'io'), (0.25, swing, 'i'), (0.31, hit, 'l'), (0.42, follow, 'o'), (0.56, hold, 'io'),
            (0.74, back, 'io'), (0.86, S, 'io')], hold


def cut2_keys(sh, start):
    """攻撃 2：左側から右側へ、水平に振り回す（左へ振り抜いた所から、前を通して右へ）"""
    S = stance(sh)
    load = P(start, hip_rot=(-55, 10, 0), chest=(-16, 6, 0), look=(14, 4),
             R=_R((-0.70, -0.15, 0.30), (-0.70, 0.25, -0.67), (0.0, -1, 0.5)))
    hit = P(start, hip=(0.0, -0.12, 0.10), hip_rot=(8, 8, 0), chest=(4, 6, 0), look=(0, 4), L=_left(sh),
            R=_R((0.04, -0.10, 0.95), (0.32, 0.12, 0.94), (0.4, -1, -0.2)),
            R_foot=(0.20, -0.22, 35, 10, 0))
    follow = P(hit, hip_rot=(46, 6, 0), chest=(14, 2, 0), look=(-12, 2), R_clav=6.0,
               R=_R((0.70, -0.15, 0.40), (0.92, 0.05, -0.38), (0.8, -0.8, -0.3)))
    hold = P(follow, hip_rot=(42, 6, 0))
    back = P(S, hip=(0.0, -0.10, 0.05))
    return [(0.0, start, None), (0.13, load, 'io'), (0.27, hit, 'i'), (0.38, follow, 'o'), (0.52, hold, 'io'),
            (0.70, back, 'io'), (0.82, S, 'io')], hold


def hip_charge(sh):
    """右の腰で溜める：膝を曲げて身を沈め、鎚矛を右の腰の後ろへ低く引く（頭は下・後ろ）"""
    S = stance(sh)
    return P(S, hip=(0.0, -0.20, -0.06), hip_rot=(40, 14, 0), chest=(14, 10, 0), look=(-14, 6), R_clav=-4.0, L=_left(sh, 'guard'),
             R=_R((0.42, -0.85, 0.02), (0.30, -0.55, -0.78), (0.8, -0.3, -0.6)),
             L_foot=(-0.22, 0.14, 8, 0, 0), R_foot=(0.22, -0.34, 40, 10, 0))


def uppercut_keys(sh, C, t0, strong=False):
    """右の腰で溜めた所から、下から上へかち上げる（t0：振り始めの時刻）。返り値：(キー, 振り上げた所)"""
    S = stance(sh)
    step = 0.16 if strong else 0.10
    low = P(C, hip=(0.0, -0.20, 0.04), hip_rot=(26, 12, 0), R=_R((0.30, -0.80, 0.45), (0.25, -0.20, 0.95), (0.6, -0.8, -0.4)))
    hit = P(S, hip=(0.0, -0.06, step + 0.08), hip_rot=(-2, -4, 0), chest=(-2, -8, 0), look=(0, 10), R_clav=8.0, L=_left(sh, 'low'),
            R=_R((0.05, 0.20, 0.88), (0.0, 0.88, 0.48), (0.6, -1, -0.1)),
            L_foot=(-0.20, 0.10, 8, 0, 0), R_foot=(0.20, -0.10 + step, 30, 20, 0))
    top = P(hit, hip=(0.0, -0.04, step + 0.06), hip_rot=(-6, -8, 0), chest=(-4, -12, 0), look=(0, 14), R_clav=14.0,
            R=_R((0.0, 0.80, 0.42), (-0.05, 0.62, -0.78), (0.8, -0.2, -0.3)))
    keys = [(t0, C, None), (t0 + 0.08, low, 'i'), (t0 + 0.16, hit, 'l'), (t0 + 0.26, top, 'o')]
    return keys, top


def cut3_keys(sh, start):
    """攻撃 3：右へ振り抜いた鎚矛を右の腰へ下ろして溜め、下から上へかち上げる"""
    S = stance(sh)
    C = hip_charge(sh)
    up, top = uppercut_keys(sh, P(C, hip=(0.0, -0.19, -0.05)), 0.40)   # 0.22〜0.40 秒：腰で溜める
    hold = P(top, hip=(0.0, -0.05, 0.10))
    back = P(S, hip=(0.0, -0.09, 0.06))
    return [(0.0, start, None), (0.22, C, 'io')] + up + [(0.82, hold, 'io'), (1.02, back, 'io'), (1.18, S, 'io')]


def c1_in_keys(sh):
    S, C = stance(sh), hip_charge(sh)
    mid = P(S, hip=(0.0, -0.14, -0.04), hip_rot=(32, 10, 0), R=_R((0.38, -0.65, 0.25), (0.25, 0.10, -0.96), (0.8, -0.5, -0.5)))
    return [(0.0, S, None), (0.16, mid, 'io'), (0.34, C, 'o')]


def c1_out_keys(sh):
    """溜攻撃 1：右の腰で溜めた鎚矛を、大きく踏み込みながら下から上へかち上げる。返り値：(キー, 振り上げた所)"""
    S, C = stance(sh), hip_charge(sh)
    up, top = uppercut_keys(sh, C, 0.0, strong=True)
    hold = P(top, hip=(0.0, -0.05, 0.20))
    back = P(S, hip=(0.0, -0.09, 0.10), R_foot=(0.20, -0.05, 30, 0, 0.04))
    return up + [(0.55, hold, 'io'), (0.80, back, 'io'), (0.96, S, 'io')], top


def c2_hold_pose(sh):
    """溜攻撃 2 の溜め：かち上げた鎚矛を、肩ぐらいの高さで右肩の上に構える（頭は上・後ろ）"""
    S = stance(sh)
    return P(S, hip=(0.0, -0.10, 0.10), hip_rot=(30, 4, 0), chest=(10, -4, 0), look=(-10, 8), R_clav=8.0, L=_left(sh, 'high'),
             R=_R((0.40, 0.08, 0.20), (0.25, 0.75, -0.62), (1, -0.2, -0.4)),
             L_foot=(-0.20, 0.10, 8, 0, 0), R_foot=(0.20, -0.20, 35, 0, 0))


def c2_keys(sh):
    """溜攻撃 2：肩の高さで溜めた鎚矛を、右足で一歩進みながら地面に向かって振り下ろし、地面を叩く"""
    S, H = stance(sh), c2_hold_pose(sh)
    rise = P(H, hip=(0.0, -0.08, 0.14), R_clav=12.0, R=_R((0.30, 0.40, 0.10), (0.20, 0.55, -0.82), (1, 0, -0.3)))
    hit = P(S, hip=(0.0, -0.42, 0.55), hip_rot=(4, 38, 0), chest=(-2, 18, 0), look=(0, 40), R_clav=0.0, L=_left(sh, 'low'),
            R=_R((0.02, -0.80, 0.60), (0.0, -0.80, 0.60), (0.5, -1, 0)),
            L_foot=(-0.22, 0.12, 8, 30, 0), R_foot=(0.20, 0.62, 15, 0, 0))
    impact = P(hit, hip=(0.0, -0.45, 0.56), R=_R((0.02, -0.84, 0.56), (0.0, -0.86, 0.52), (0.5, -1, 0)))
    up = P(S, hip=(0.0, -0.16, 0.40), hip_rot=(14, 12, 0), R_foot=(0.20, 0.30, 25, 0, 0.04))
    back = P(S, hip=(0.0, -0.10, 0.10), R_foot=(0.20, -0.10, 35, 0, 0.03))
    return [(0.0, H, None), (0.12, rise, 'io'), (0.32, hit, 'i'), (0.40, impact, 'o'), (0.62, impact, 'l'), (0.86, up, 'io'),
            (1.04, back, 'io'), (1.20, S, 'io')]


def build(rig, shield=True):
    """鎚矛の技の動きを作る（shield：楯を持つか）。返り値：[(ゲームの名前, action, 情報)]"""
    out = []

    def make(name, fn, dur, loop=False):
        out.append(make_clip(rig, name, fn, dur, loop))

    k1, hold1 = cut1_keys(shield)
    make('mc_cut1', lambda t: sample(k1, t), k1[-1][0])
    k2, hold2 = cut2_keys(shield, hold1)
    make('mc_cut2', lambda t: sample(k2, t), k2[-1][0])
    k3 = cut3_keys(shield, hold2)
    make('mc_cut3', lambda t: sample(k3, t), k3[-1][0])
    ki = c1_in_keys(shield)
    make('mc_c1_in', lambda t: sample(ki, t), ki[-1][0])
    C = hip_charge(shield)
    make('mc_c1_hold', lambda t: tremble(C, t), 1.0, loop=True)
    ko, _ = c1_out_keys(shield)
    make('mc_c1_out', lambda t: sample(ko, t), ko[-1][0])
    H = c2_hold_pose(shield)
    make('mc_c2_hold', lambda t: tremble(H, t), 1.0, loop=True)
    kc = c2_keys(shield)
    make('mc_c2', lambda t: sample(kc, t), kc[-1][0])
    left = {k: _left(shield, k) for k in ('guard', 'high', 'low')}
    ka = blunt_assassin_keys(rig, stance(shield), AS_GAP, REACH, left)
    make('mc_as_back', lambda t: sample(ka, t), ka[-1][0])
    return out
