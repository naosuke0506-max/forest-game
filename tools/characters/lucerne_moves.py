# 長柄鎚の技の動きを、Tripo の骨に直接付ける（Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具）
#
#   長さ 2 m の長柄。柄の先（石突きの側）を両手で持つ（利用者の指示 2026-11-09：右手は石突きから 0.51 m、左手はその 0.42 m 後ろで石突きのすぐ上。
#   腕が届かない姿勢では、左手が柄の上を右手の側へ滑る）。頭には三つ又の鎚の面と、反対側に曲がった嘴、上に長い穂先がある。
#   動きの形は利用者の指示どおり（docs/DESIGN.md の「長柄鎚の技」）
#     攻撃 1（lc_cut1）：前に踏み込み、頭上から相手の頭に向かって振り下ろす
#     攻撃 2（lc_cut2）：そのまま、下から上に向かって返しでかち上げる
#     溜攻撃 1（lc_c1_in → lc_c1_hold → lc_c1_out）：右側から左側に向かって薙ぎ払う
#     溜攻撃 2（lc_c2_hold → lc_c2）：左側から右回りをして、回転攻撃をする
#     暗殺・背後（lc_as_back）：相手の肩に振り下ろし、跪いたところへ頭に向かって返しで振り下ろす（weapon_common.py）
#   待機・歩き・後ろ歩き・走り（lc_idle・lc_walk・lc_back・lc_run）：打擊騎士の動きの脚と体はそのままに、両手で持つ形にした物
#   両手の拳の中を柄が通るように、拳の向きを柄の向きと前腕から決める（右手 auto・左手 grip2。ik_rig.py の auto_grip）
import math
from ik_rig import *   # noqa: F401,F403
from weapon_common import tremble, spin, blunt_assassin_keys, two_hand, hd

HILT = -0.42
REACH = 1.24   # 持ち手の点から鎚の頭まで（m。右手は石突きから 0.51 m）
AS_GAP = 1.85
L2 = {'hilt': HILT, 'grip2': 1.0, 'slide': 1.0, 'roll': 0.0, 'pole': (-0.6, -1, -0.4)}


def _L(pole=(-0.6, -1, -0.4), roll=0.0):
    return dict(L2, pole=pole, roll=roll)


def W2(base, yaw, chest, mid, d, hip=None, pitch=None, pole=(0.6, -1, -0.2), lpole=(-0.6, -1, -0.4), **kw):
    """両手持ちの姿勢：腰の向き yaw（度）・胸のひねり chest。mid は胸から見た両手の真ん中（m）、
    d =（方位, 仰角）は柄（頭の側）の向きを地面の上の向きで（方位：相手の方が 0 度・右が正。仰角：上が正）。weapon_common.two_hand"""
    yt = yaw + chest[0]
    out = P(base, hip_rot=(yaw, base['hip_rot'][1] if pitch is None else pitch, 0), chest=chest,
            R=two_hand(mid, hd(d[0] - yt, d[1]), yt, HILT, pole), L=_L(rot_y(lpole, yt)), **kw)
    if hip:
        out['hip'] = hip
    return out


# 構え（右足が前・左足が後ろ、広く。右手が前・左手が後ろの持ち方に合わせる。頭を相手の胸へ向け、石突きは左の腰の横）
_S0 = {
    'hip': (0.0, -0.10, -0.04), 'hip_rot': (-44, 6, 0), 'chest': (-20, 4, 0), 'look': (40, 0), 'look_k': 0.9,
    'R': two_hand((0.02, -0.25, 0.22), hd(45, 12), hilt=HILT), 'L': _L(), 'R_clav': 0.0, 'L_clav': 0.0,
    'L_foot': (-0.22, -0.38, -40, 0, 0), 'R_foot': (0.22, 0.12, -10, 0, 0),
}
STANCE = W2(_S0, -44, (-20, 4, 0), (0.02, -0.22, 0.26), (1, 12))
# 歩くときの持ち方（胸から見た向き）：体の正面で、頭を上へ立てて持つ（柄頭が腹に当たらないよう、頭を少し右・後ろへ倒す）
HOLD_R = two_hand((0.0, -0.22, 0.27), hd(100, 75), hilt=HILT)


def cut1_keys():
    """攻撃 1：頭上へ振りかぶり、右足で前に踏み込みながら、相手の頭へ振り下ろす"""
    S = STANCE
    lift = W2(S, -26, (-8, -4, 0), (0.08, 0.05, 0.22), (40, 72), hip=(0.0, -0.09, -0.05), pole=(1, 0, -0.3), lpole=(-1, -0.2, 0.2), R_clav=8.0)
    up = W2(S, -16, (-4, -10, 0), (0.14, 0.22, 0.10), (160, 45), hip=(0.0, -0.08, -0.06), pitch=-4, pole=(1, 0.3, -0.3),
            lpole=(-1, 0.2, -0.2), look=(0, 10), R_clav=16.0, L_clav=14.0)
    hit = W2(S, -44, (-18, 8, 0), (0.0, -0.08, 0.28), (0, 8), hip=(0.0, -0.16, 0.40), pitch=14, pole=(0.6, -1, -0.2),
             lpole=(-0.8, -1, -0.2), look=(2, 6), R_clav=6.0, L_clav=4.0, R_foot=(0.22, 0.62, -5, 0, 0), L_foot=(-0.22, -0.20, -35, 25, 0))
    follow = W2(hit, -44, (-18, 8, 0), (0.0, -0.16, 0.28), (0, -8), hip=(0.0, -0.18, 0.42), pitch=18, pole=(0.6, -1, -0.1),
                lpole=(-0.8, -1, -0.2), R_clav=0.0, L_clav=0.0)
    hold = P(follow, hip=(0.0, -0.17, 0.41))
    back = P(S, hip=(0.0, -0.12, 0.16), R_foot=(0.22, 0.32, -8, 0, 0.04))
    return [(0.0, S, None), (0.12, lift, 'io'), (0.24, up, 'o'), (0.38, hit, 'i'), (0.48, follow, 'o'), (0.62, hold, 'io'), (0.84, back, 'io'),
            (1.00, S, 'io')], hold


def cut2_keys(start):
    """攻撃 2：振り下ろした所から、そのまま下から上へ返してかち上げる（嘴の側が先）"""
    S = STANCE
    dip = W2(start, -44, (-18, 8, 0), (0.0, -0.22, 0.27), (0, -14), hip=(0.0, -0.20, 0.40), pitch=18, pole=(0.6, -1, -0.1), lpole=(-0.8, -1, -0.2))
    hit = W2(start, -44, (-18, -6, 0), (0.0, -0.02, 0.28), (0, 35), hip=(0.0, -0.10, 0.36), pitch=0, pole=(0.6, -1, -0.2),
             lpole=(-0.8, -1, -0.2), look=(-2, 10), R_clav=10.0, L_clav=6.0)
    follow = W2(hit, -42, (-18, -10, 0), (0.04, 0.14, 0.26), (5, 68), hip=(0.0, -0.08, 0.30), pitch=-2, pole=(1, -0.2, -0.3),
                lpole=(-1, -0.2, 0), look=(0, 16), R_clav=16.0, L_clav=12.0)
    hold = P(follow, hip=(0.0, -0.08, 0.26))
    back = P(S, hip=(0.0, -0.11, 0.12), R_foot=(0.22, 0.30, -8, 0, 0.04))
    return [(0.0, start, None), (0.10, dip, 'io'), (0.26, hit, 'i'), (0.38, follow, 'o'), (0.52, hold, 'io'), (0.76, back, 'io'),
            (0.92, S, 'io')]


def right_charge():
    """溜攻撃 1 の溜め：長柄鎚を体の右へ引き、頭を右後ろへ寝かせて溜める（体は右へ大きくひねる）"""
    return W2(STANCE, 40, (16, 2, 0), (0.10, -0.15, 0.22), (140, 10), hip=(0.0, -0.14, -0.06), pole=(1, -0.4, -0.3),
              lpole=(-0.3, -0.8, 0.6), look=(-34, 4), R_clav=6.0, L_clav=4.0, R_foot=(0.24, 0.10, 10, 0, 0), L_foot=(-0.22, -0.38, -30, 0, 0))


def c1_in_keys():
    S, C = STANCE, right_charge()
    mid = W2(S, 4, (6, 4, 0), (0.06, -0.18, 0.24), (90, 12), hip=(0.0, -0.12, -0.05), pole=(1, -0.6, -0.3), lpole=(-0.3, -0.8, 0.6))
    return [(0.0, S, None), (0.22, mid, 'io'), (0.45, C, 'o')]


def c1_out_keys():
    """溜攻撃 1：右側から左側へ、長い柄で大きく薙ぎ払う（鎚の面が先）"""
    S, C = STANCE, right_charge()
    swing = W2(S, 14, (6, 4, 0), (0.08, -0.14, 0.28), (80, 5), hip=(0.0, -0.14, 0.08), pole=(1, -0.4, -0.3), lpole=(-0.3, -1, 0.5), look=(-12, 4))
    hit = W2(S, -44, (-18, 6, 0), (0.0, -0.14, 0.28), (0, 3), hip=(0.0, -0.16, 0.24), pitch=10, pole=(0.6, -1, -0.2), lpole=(-0.8, -1, -0.2),
             look=(4, 4), R_foot=(0.24, 0.45, 0, 0, 0), L_foot=(-0.22, -0.30, -30, 20, 0))
    pass_ = W2(hit, -60, (-20, 6, 0), (-0.06, -0.10, 0.27), (-50, 10), pole=(0.3, -1, 0.3), lpole=(-1, -0.6, 0.3), look=(20, 4))
    follow = W2(hit, -40, (-12, 6, 0), (-0.10, 0.0, 0.24), (-110, 28), pole=(0.2, -1, 0.5), lpole=(-1, -0.6, 0.3), look=(30, 4))
    hold = W2(follow, -36, (-12, 6, 0), (-0.10, 0.02, 0.23), (-125, 32), pole=(0.2, -1, 0.5), lpole=(-1, -0.6, 0.3))
    back = P(S, hip=(0.0, -0.11, 0.12), R_foot=(0.24, 0.30, -5, 0, 0.04))
    return [(0.0, C, None), (0.12, swing, 'i'), (0.22, hit, 'l'), (0.28, pass_, 'l'), (0.36, follow, 'o'), (0.52, hold, 'io'), (0.80, back, 'io'),
            (0.98, S, 'io')]


def c2_hold_pose():
    """溜攻撃 2 の溜め：薙ぎ払った長柄鎚を左に構え、体を左へひねって溜める"""
    return W2(STANCE, -36, (-12, 4, 0), (-0.04, 0.04, 0.26), (-140, 40), hip=(0.0, -0.16, 0.10), pitch=8, pole=(0.2, -1, 0.5),
              lpole=(-1, -0.6, 0.3), look=(30, 4), R_clav=4.0, R_foot=(0.24, 0.30, -5, 0, 0), L_foot=(-0.22, -0.30, -35, 0, 0))


def c2_keys():
    """溜攻撃 2：左に構えた所から、右回りに回転して、長い柄で周りを薙ぎ払う。
    柄は回る向きの後ろ（胸から見て左前）に引きずるように伸ばし、前を通る所で 1 打目、一回りしてもう一度前を通る所で 2 打目"""
    S, H = STANCE, c2_hold_pose()
    keys = [(0.0, H, None)]
    y0 = H['hip_rot'][0]
    center = (0.0, 0.12)
    feet0 = {'R': H['R_foot'], 'L': H['L_foot']}
    arm = two_hand((0.0, -0.14, 0.28), hd(-62, 3), hilt=HILT, pole=(0.6, -1, -0.2))
    steps = 8
    for i in range(1, steps + 1):
        yaw = y0 + 470 * i / steps
        lift = {'R': 0.05} if i in (3, 4) else {'L': 0.05} if i in (6, 7) else None
        keys.append((0.80 * i / steps, spin(H, y0, center, feet0, yaw, arm, lift, hip_u=-0.18, pitch=10, chest=(-6, 4, 0),
                                            look_lead=20), 'i' if i == 1 else 'l'))
    fin = spin(H, y0, center, feet0, y0 + 480, two_hand((-0.04, -0.10, 0.28), hd(-55, 12), hilt=HILT, pole=(0.4, -1, 0.2)),
               hip_u=-0.17, pitch=10, chest=(-10, 6, 0), look_lead=10)
    keys.append((0.92, fin, 'o'))
    keys.append((1.06, fin, 'l'))
    S2 = P(S, hip_rot=(S['hip_rot'][0] + 360, S['hip_rot'][1], 0), look=(S['look'][0] + 360, S['look'][1]))
    keys.append((1.40, S2, 'io'))
    return keys


def build(rig, sources, info):
    """長柄鎚の技と、両手で持つ待機・歩きの動きを作る。返り値：[(ゲームの名前, action, 情報)]"""
    out = []

    def make(name, fn, dur, loop=False):
        out.append(make_clip(rig, name, fn, dur, loop))

    k1, hold1 = cut1_keys()
    make('lc_cut1', lambda t: sample(k1, t), k1[-1][0])
    k2 = cut2_keys(hold1)
    make('lc_cut2', lambda t: sample(k2, t), k2[-1][0])
    ki = c1_in_keys()
    make('lc_c1_in', lambda t: sample(ki, t), ki[-1][0])
    C = right_charge()
    make('lc_c1_hold', lambda t: tremble(C, t, amp=0.007, f1=7, f2=12), 1.0, loop=True)
    ko = c1_out_keys()
    make('lc_c1_out', lambda t: sample(ko, t), ko[-1][0])
    H = c2_hold_pose()
    make('lc_c2_hold', lambda t: tremble(H, t, amp=0.007, f1=7, f2=12), 1.0, loop=True)
    kc = c2_keys()
    make('lc_c2', lambda t: sample(kc, t), kc[-1][0])
    ka = blunt_assassin_keys(rig, STANCE, AS_GAP, REACH, {'guard': _L(), 'high': _L((-1, 0.2, -0.2)), 'low': _L((-0.8, -1, -0.2))},
                             two_hand((0.14, 0.20, 0.12), hd(150, 40), 50, HILT, (1, 0.2, -0.3)),
                             two_hand((0.14, 0.22, 0.10), hd(150, 45), 18, HILT, (1, 0.3, -0.2)),
                             two=(abs(HILT) / 2, (0.12, -0.10, 0.26), (0.12, -0.08, 0.26), (-44, -20)))
    make('lc_as_back', lambda t: sample(ka, t), ka[-1][0])
    for base in ('idle', 'walk', 'back', 'run'):
        if base in sources:
            act = hold_weapon(rig, sources[base], f'lc_{base}', HOLD_R, L2)
            out.append((f'lc_{base}', act, dict(info[base])))
            print('両手で持つ形にした', f'lc_{base}')
    return out
