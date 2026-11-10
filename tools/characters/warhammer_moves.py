# 戰鎚の技の動きを、Tripo の骨に直接付ける（Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具）
#
#   両手で持つ（右手は柄頭から 0.36 m・左手はその 0.3 m 下で、柄頭のすぐ上）。頭には鎚の面と、反対側に尖った嘴、上に穂先がある。
#   動きの形は利用者の指示どおり（2026-11-09。docs/DESIGN.md の「戰鎚の技」）
#     攻撃 1（wh_cut1）：脇を開き、肘を曲げて構え、右側から左側に向かって振り回す
#     攻撃 2（wh_cut2）：左側から右側に向かって振り回す
#     攻撃 3（wh_cut3）：頭上で強く溜めて、相手に向かって跳び、地面を叩き潰す
#     溜攻撃 1（wh_c1_in → wh_c1_hold → wh_c1_out）：右肩あたりで強く溜めて、右斜め上から左斜め下へ振り下ろし（1 打目）、
#       少し溜めて、返しでそのまま左斜め下から右斜め上へ振り回す（2 打目）
#     溜攻撃 2（wh_c2_hold → wh_c2）：右斜め上で溜めて、左回りに回転し、右斜め下から左斜め上へかち上げる
#     暗殺・背後（wh_as_back）：相手の肩に振り下ろし、跪いたところへ頭に向かって返しで振り下ろす（weapon_common.py）
#   待機・歩き・後ろ歩き・走り（wh_idle・wh_walk・wh_back・wh_run）：打擊騎士の動きの脚と体はそのままに、両手で持つ形にした物
#   両手の拳の中を柄が通るように、拳の向きを柄の向きと前腕から決める（右手 auto・左手 grip2。ik_rig.py の auto_grip）。
#   拳の甲の側が鎚の面になるので、振り下ろす・振り抜く向きの先に鎚の面が来る。返し（逆へ振る）は嘴の側で打つ
import math
from ik_rig import *   # noqa: F401,F403
from weapon_common import tremble, spin, blunt_assassin_keys, two_hand, hd

HILT = -0.30
REACH = 0.64   # 持ち手の点から鎚の頭まで（m。長さ 1.15 m、右手は柄頭から 0.36 m）
AS_GAP = 1.20
L2 = {'hilt': HILT, 'grip2': 1.0, 'slide': 1.0, 'roll': 0.0, 'pole': (-0.6, -1, -0.3)}


def _L(pole=(-0.6, -1, -0.3), roll=0.0):
    return dict(L2, pole=pole, roll=roll)


def W2(base, yaw, chest, mid, d, hip=None, pitch=None, pole=(0.6, -1, -0.2), lpole=(-0.6, -1, -0.3), **kw):
    """両手持ちの姿勢：腰の向き yaw（度）・胸のひねり chest。mid は胸から見た両手の真ん中（m）、
    d =（方位, 仰角）は柄（頭の側）の向きを地面の上の向きで（方位：相手の方が 0 度・右が正。仰角：上が正）。weapon_common.two_hand"""
    yt = yaw + chest[0]
    out = P(base, hip_rot=(yaw, base['hip_rot'][1] if pitch is None else pitch, 0), chest=chest,
            R=two_hand(mid, hd(d[0] - yt, d[1]), yt, HILT, pole), L=_L(rot_y(lpole, yt)), **kw)
    if hip:
        out['hip'] = hip
    return out


# 構え（左足が前・右足が後ろ。戰鎚は体の正面で、頭を右上へ立てる）
_S0 = {
    'hip': (0.0, -0.09, -0.02), 'hip_rot': (28, 6, 0), 'chest': (6, 4, 0), 'look': (0, 2), 'look_k': 0.9,
    'R': two_hand((0.0, -0.22, 0.28), hd(110, 70)), 'L': _L(), 'R_clav': 0.0, 'L_clav': 0.0,
    'L_foot': (-0.20, 0.10, 8, 0, 0), 'R_foot': (0.20, -0.30, 35, 0, 0),
}
STANCE = W2(_S0, 28, (6, 4, 0), (0.0, -0.22, 0.28), (144, 70))
# 歩くときの持ち方（胸から見た向き。胸が回れば一緒に回る）：体の正面で、頭を右上へ立てる（柄頭が腹に当たらないよう、頭を少し後ろへ倒す）
HOLD_R = two_hand((0.0, -0.24, 0.27), hd(110, 70))


def cut1_keys():
    """攻撃 1：脇を開き、肘を曲げて右に構え、右側から左側へ水平に振り回す"""
    S = STANCE
    ready = W2(S, 55, (16, 0, 0), (0.12, 0.10, 0.24), (135, 40), hip=(0.0, -0.10, -0.04), pole=(1, 0.4, -0.2), lpole=(-0.3, -0.6, 0.7),
               look=(-20, 2), R_clav=10.0, L_clav=8.0)
    swing = W2(S, 28, (8, 2, 0), (0.08, -0.10, 0.34), (75, 10), hip=(0.0, -0.12, 0.06), pole=(1, 0.2, -0.3), lpole=(-0.3, -0.6, 0.7),
               look=(-6, 2), R_clav=6.0)
    hit = W2(S, -36, (-18, 6, 0), (0.0, -0.12, 0.34), (0, 5), hip=(0.0, -0.14, 0.14), pitch=10, pole=(0.6, -0.6, -0.4),
             look=(0, 4), R_clav=2.0, R_foot=(0.20, -0.16, 30, 15, 0))
    follow = W2(hit, -30, (-10, 6, 0), (-0.08, -0.14, 0.32), (-75, 5), pole=(0.3, -1, 0.4), lpole=(-1, -0.6, 0.2), look=(12, 4), R_clav=0.0)
    hold = W2(follow, -28, (-10, 6, 0), (-0.08, -0.12, 0.30), (-95, 15), pole=(0.3, -1, 0.4), lpole=(-1, -0.6, 0.2))
    back = P(S, hip=(0.0, -0.11, 0.06))
    return [(0.0, S, None), (0.22, ready, 'io'), (0.34, swing, 'i'), (0.42, hit, 'l'), (0.54, follow, 'o'), (0.70, hold, 'io'),
            (0.90, back, 'io'), (1.04, S, 'io')], hold


def cut2_keys(start):
    """攻撃 2：左へ振り抜いた所から、左側から右側へ水平に振り回す（返し。嘴の側が先）"""
    S = STANCE
    load = W2(start, -58, (-18, 6, 0), (-0.10, 0.06, 0.26), (-135, 35), pole=(0.2, -1, 0.6), lpole=(-1, -0.2, -0.2), look=(16, 4))
    swing = W2(start, -10, (-4, 6, 0), (-0.06, -0.08, 0.32), (-65, 15), pole=(0.4, -1, 0.2), lpole=(-1, -0.4, 0.2), look=(8, 4))
    hit = W2(start, 36, (18, 6, 0), (0.0, -0.12, 0.34), (0, 5), hip=(0.0, -0.13, 0.10), pitch=8, pole=(0.6, -0.8, -0.3),
             look=(0, 4), R_foot=(0.20, -0.22, 35, 10, 0))
    follow = W2(hit, 30, (10, 2, 0), (0.08, -0.12, 0.32), (75, 5), pole=(1, 0, -0.3), lpole=(-0.3, -0.6, 0.7), look=(-14, 2), R_clav=8.0)
    hold = W2(follow, 28, (10, 2, 0), (0.08, -0.10, 0.30), (95, 15), pole=(1, 0, -0.3), lpole=(-0.3, -0.6, 0.7))
    back = P(S, hip=(0.0, -0.11, 0.05))
    return [(0.0, start, None), (0.15, load, 'io'), (0.25, swing, 'i'), (0.31, hit, 'l'), (0.43, follow, 'o'), (0.58, hold, 'io'),
            (0.78, back, 'io'), (0.94, S, 'io')], hold


def cut3_keys(start):
    """攻撃 3：頭上で強く溜め（膝を曲げて力をためる）、相手に向かって跳び、地面を叩き潰す"""
    S = STANCE
    over = W2(S, 18, (6, -12, 0), (0.16, 0.22, 0.10), (165, 40), hip=(0.0, -0.10, -0.04), pitch=-6, pole=(1, 0.3, -0.2),
              lpole=(-1, 0.3, -0.2), look=(0, 10), R_clav=16.0, L_clav=14.0)
    coil = W2(over, 14, (4, -10, 0), (0.16, 0.23, 0.08), (165, 34), hip=(0.0, -0.22, -0.06), pitch=-2, pole=(1, 0.3, -0.2), lpole=(-1, 0.3, -0.2))
    air = W2(over, 6, (0, -4, 0), (0.0, 0.26, 0.26), (0, 70), hip=(0.0, 0.10, 0.30), pitch=4, pole=(1, 0, -0.2), lpole=(-1, 0, -0.2),
             look=(0, 14), L_foot=(-0.20, 0.30, 8, 20, 0.22), R_foot=(0.20, 0.0, 30, 30, 0.26))
    hit = W2(S, -36, (-18, 18, 0), (-0.05, -0.24, 0.30), (0, -38), hip=(0.0, -0.40, 0.55), pitch=36, pole=(0.5, -1, 0), lpole=(-0.5, -1, 0),
             look=(0, 40), R_clav=0.0, L_clav=0.0, L_foot=(-0.20, 0.55, 8, 0, 0), R_foot=(0.20, 0.25, 30, 30, 0))
    impact = W2(hit, -36, (-18, 18, 0), (-0.05, -0.26, 0.30), (0, -42), hip=(0.0, -0.43, 0.56), pitch=36, pole=(0.5, -1, 0), lpole=(-0.5, -1, 0))
    up = P(S, hip=(0.0, -0.18, 0.40), hip_rot=(16, 14, 0), L_foot=(-0.20, 0.40, 8, 0, 0.04))
    back = P(S, hip=(0.0, -0.11, 0.10))
    return [(0.0, start, None), (0.26, over, 'io'), (0.44, coil, 'io'), (0.60, coil, 'l'), (0.76, air, 'o'), (0.92, hit, 'i'),
            (1.00, impact, 'o'), (1.18, impact, 'l'), (1.42, up, 'io'), (1.62, back, 'io'), (1.78, S, 'io')]


def shoulder_charge():
    """溜攻撃 1 の溜め：戰鎚を右肩に担ぐように、右肩の上で強く溜める（頭は右肩の後ろ）"""
    return W2(STANCE, 40, (14, -6, 0), (0.10, 0.10, 0.22), (160, 35), hip=(0.0, -0.14, -0.06), pitch=2, pole=(1, 0.2, -0.3),
              lpole=(-0.3, -0.6, 0.7), look=(-14, 6), R_clav=10.0, L_clav=6.0, L_foot=(-0.22, 0.12, 10, 0, 0), R_foot=(0.22, -0.36, 40, 10, 0))


def c1_in_keys():
    S, C = STANCE, shoulder_charge()
    mid = W2(S, 34, (10, 0, 0), (0.06, 0.0, 0.28), (120, 55), hip=(0.0, -0.12, -0.04), pole=(1, -0.2, -0.3), R_clav=6.0)
    return [(0.0, S, None), (0.20, mid, 'io'), (0.42, C, 'o')]


def c1_out_keys():
    """溜攻撃 1：右斜め上から左斜め下へ振り下ろし（1 打目）、少し溜めて、返しで左斜め下から右斜め上へ振り回す（2 打目）"""
    S, C = STANCE, shoulder_charge()
    over1 = W2(S, 14, (4, -4, 0), (0.06, 0.10, 0.30), (60, 65), hip=(0.0, -0.14, 0.04), pitch=4, pole=(1, 0, -0.3), lpole=(-0.6, -0.4, 0.6), R_clav=10.0)
    hit1 = W2(S, 10, (6, 10, 0), (-0.02, -0.20, 0.36), (-30, -40), hip=(0.0, -0.18, 0.18), pitch=18, pole=(0.6, -1, 0), lpole=(-0.8, -1, 0),
              look=(4, 14), R_clav=2.0, R_foot=(0.20, -0.10, 30, 20, 0))
    low = W2(hit1, -10, (0, 12, 0), (-0.10, -0.30, 0.32), (-70, -35), hip=(0.0, -0.20, 0.20), pitch=20, pole=(0.2, -1, 0.4),
             lpole=(-1, -0.6, 0.2), look=(10, 16))
    gather = W2(low, -12, (0, 12, 0), (-0.10, -0.31, 0.31), (-72, -36), hip=(0.0, -0.21, 0.19), pitch=20, pole=(0.2, -1, 0.4),
                lpole=(-1, -0.6, 0.2))
    hit2 = W2(S, -12, (-8, -2, 0), (0.05, -0.02, 0.36), (30, 45), hip=(0.0, -0.10, 0.14), pitch=4, pole=(0.6, -0.8, -0.3),
              look=(-4, 6), R_clav=8.0)
    follow = W2(hit2, 40, (14, -6, 0), (0.10, 0.15, 0.28), (100, 50), pole=(1, 0, -0.3), lpole=(-0.3, -0.6, 0.7), look=(-12, 8), R_clav=14.0)
    hold = P(follow, hip=(0.0, -0.09, 0.12))
    back = P(S, hip=(0.0, -0.11, 0.08))
    return [(0.0, C, None), (0.08, P(C, hip=(0.0, -0.15, -0.08)), 'io'), (0.14, over1, 'i'), (0.20, hit1, 'l'), (0.32, low, 'o'), (0.46, gather, 'io'),
            (0.60, hit2, 'i'), (0.72, follow, 'o'), (0.90, hold, 'io'), (1.12, back, 'io'), (1.28, S, 'io')]


def c2_hold_pose():
    """溜攻撃 2 の溜め：右斜め上に戰鎚を構えて溜める（頭は右上の後ろ）"""
    return W2(STANCE, 45, (14, -6, 0), (0.12, 0.12, 0.24), (140, 45), hip=(0.0, -0.14, 0.02), pitch=0, pole=(1, 0.2, -0.3),
              lpole=(-0.3, -0.6, 0.7), look=(-16, 8), R_clav=14.0, L_clav=8.0)


def c2_keys():
    """溜攻撃 2：右斜め上で溜めた所から、左回りに一回転し、右斜め下から左斜め上へかち上げる"""
    S, H = STANCE, c2_hold_pose()
    keys = [(0.0, H, None)]
    y0 = H['hip_rot'][0]
    center = (0.0, 0.10)
    feet0 = {'R': H['R_foot'], 'L': H['L_foot']}
    # 回りながら、戰鎚は右の低い所を引きずるように回す（胸から見て右下・後ろ）
    low_arm = two_hand((0.10, -0.28, 0.30), hd(120, -30), pole=(0.8, -1, -0.2))
    drop = spin(H, y0, center, feet0, y0 - 20, two_hand((0.10, 0.0, 0.28), hd(130, 20), pole=(1, -0.4, -0.3)),
                hip_u=-0.16, pitch=6, chest=(10, 2, 0), look_lead=-30)
    keys.append((0.12, drop, 'io'))
    steps = 6
    for i in range(1, steps + 1):
        yaw = y0 - 20 - 300 * i / steps
        lift = {'L': 0.05} if i in (2, 3) else {'R': 0.05} if i in (4, 5) else None
        keys.append((0.12 + 0.48 * i / steps, spin(H, y0, center, feet0, yaw, low_arm, lift, hip_u=-0.22, pitch=10,
                                                     chest=(14, 6, 0), look_lead=-40), 'i' if i == 1 else 'l'))
    # 正面へ戻る所で、右斜め下から左斜め上へかち上げる
    y_hit = y0 - 20 - 300 - 50
    hit = spin(H, y0, center, feet0, y_hit, two_hand((-0.02, 0.0, 0.32), hd(-35, 45), pole=(0.6, -1, -0.2)),
               hip_u=-0.10, pitch=-2, chest=(-8, -4, 0), look_lead=10)
    hit['R_clav'] = 10.0
    keys.append((0.72, hit, 'i'))
    top = spin(H, y0, center, feet0, y_hit - 14, two_hand((-0.08, 0.15, 0.30), hd(-80, 55), pole=(0.6, -0.6, 0.3)),
               hip_u=-0.08, pitch=-6, chest=(-14, -8, 0), look_lead=12)
    top['R_clav'] = 14.0
    keys.append((0.84, top, 'o'))
    keys.append((1.02, top, 'l'))
    S2 = P(S, hip_rot=(S['hip_rot'][0] - 360, S['hip_rot'][1], 0), look=(S['look'][0] - 360, S['look'][1]))
    keys.append((1.40, S2, 'io'))
    return keys


def build(rig, sources, info):
    """戰鎚の技と、両手で持つ待機・歩きの動きを作る。sources：できている動き（名前 → action）、info：その長さ・速さ。
    返り値：[(ゲームの名前, action, 情報)]"""
    out = []

    def make(name, fn, dur, loop=False):
        out.append(make_clip(rig, name, fn, dur, loop))

    k1, hold1 = cut1_keys()
    make('wh_cut1', lambda t: sample(k1, t), k1[-1][0])
    k2, hold2 = cut2_keys(hold1)
    make('wh_cut2', lambda t: sample(k2, t), k2[-1][0])
    k3 = cut3_keys(hold2)
    make('wh_cut3', lambda t: sample(k3, t), k3[-1][0])
    ki = c1_in_keys()
    make('wh_c1_in', lambda t: sample(ki, t), ki[-1][0])
    C = shoulder_charge()
    make('wh_c1_hold', lambda t: tremble(C, t, amp=0.007, f1=7, f2=12), 1.0, loop=True)
    ko = c1_out_keys()
    make('wh_c1_out', lambda t: sample(ko, t), ko[-1][0])
    H = c2_hold_pose()
    make('wh_c2_hold', lambda t: tremble(H, t, amp=0.007, f1=7, f2=12), 1.0, loop=True)
    kc = c2_keys()
    make('wh_c2', lambda t: sample(kc, t), kc[-1][0])
    ka = blunt_assassin_keys(rig, STANCE, AS_GAP, REACH, {'guard': _L(), 'high': _L((-0.6, -0.4, 0.4)), 'low': _L((-0.6, -1, 0))},
                             two_hand((0.14, 0.18, 0.14), hd(100, 40), 50, HILT, (1, 0.2, -0.3)),
                             two_hand((0.16, 0.22, 0.10), hd(150, 40), 18, HILT, (1, 0.3, -0.2)),
                             two=(abs(HILT) / 2, (0.10, -0.10, 0.30), (0.10, -0.08, 0.30), (-36, -18)))
    make('wh_as_back', lambda t: sample(ka, t), ka[-1][0])
    for base in ('idle', 'walk', 'back', 'run'):
        if base in sources:
            act = hold_weapon(rig, sources[base], f'wh_{base}', HOLD_R, L2)
            out.append((f'wh_{base}', act, dict(info[base])))
            print('両手で持つ形にした', f'wh_{base}')
    return out
