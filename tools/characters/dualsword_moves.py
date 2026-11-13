# 二刀流（雙劍。劍騎士が片手劍を 2 本持つ）の技の動きを、Tripo の骨に直接付ける（Blender 4.2。build_character.py から呼ぶ開発用の道具）
#
#   利用者の指示（2026-11-10）：劍騎士の片手劍は二刀流にする。必殺技（奧義）は、剣を交差させて構え、前へ高速で滑り込みながら切り裂く。
#   ほかの技の形は Claude の案（docs/DESIGN.md「雙劍の技」）：
#     右袈裟（dw_cut1）：右の剣を右上から左下へ斬り下ろす
#     左薙（dw_cut2）：左の剣を左から右へ水平に薙ぐ
#     十字斬（dw_cut3）：右足で踏み込み、頭上で交差させた 2 本を、前で十字を描くように同時に斬り下ろす
#     開斬（dw_c1_in → dw_c1_hold → dw_c1_out）：胸の前で 2 本を交差させて溜め、離すと左右へ大きく開いて斬り払う
#     雙旋（dw_c2）：2 本を左右へ広げ、右回りに一回転して周りを斬る（2 回当たる）
#     奧義（dw_ult）：2 本を交差させて低く構え、前へ高速で滑りながら、通り抜けざまに左右へ切り裂く（体はゲームが前へ動かす）
#     背刺（dw_as_back）：背後から 2 本を同時に背中へ突き刺し、蹴り飛ばして抜く（される側は片手劍と同じ as_back_v。時刻も同じ）
#   待機・歩き・後ろ歩き・走りは、今ある動きの腕だけを 2 本持つ形に直す（dw_idle・dw_walk・dw_back・dw_run）
#   手と足の位置で体を動かす道具は ik_rig.py（向きの約束も、そこに書いてある）。左手は sL2（右手の持ち手の点を映したもの）で握る
import math
from ik_rig import *   # noqa: F401,F403


def RS(grip, blade, pole=(0.4, -1, -0.3), roll=0.0):
    """右手の剣：持ち手の点（右肩から・腕の長さの割合）と刃先の向き（体の向き）。拳は柄を握る向きに自動で決める"""
    return {'grip': grip, 'blade': blade, 'pole': pole, 'auto': 1.0, 'roll': roll}


def LS(grip, blade, pole=(-0.4, -1, -0.3), roll=0.0):
    """左手の剣（左肩から。右が正なので、体の外は負）"""
    return {'grip': grip, 'blade': blade, 'pole': pole, 'auto': 1.0, 'roll': roll}


# 構え（左足が前・右足が後ろ。左の剣を前に出して切っ先を相手の顔へ、右の剣は腰の横で切っ先を前上へ）
STANCE = {
    'hip': (0.0, -0.09, -0.02), 'hip_rot': (22, 7, 0), 'chest': (4, 5, 0), 'look': (0, 2), 'look_k': 0.9,
    'R': RS((0.20, -0.58, 0.50), (-0.10, 0.45, 1.0)),
    'L': LS((0.12, -0.40, 0.70), (0.15, 0.55, 1.0)),
    'R_clav': 0.0, 'L_clav': 0.0,
    'L_foot': (-0.20, 0.10, 8, 0, 0), 'R_foot': (0.20, -0.30, 40, 0, 0),
}
# 待機・歩き・走りで持つ形（胸から見た向き。hold_weapon 用）
HOLD_R = RS((0.18, -0.62, 0.42), (-0.05, 0.40, 1.0))
HOLD_L = LS((-0.10, -0.62, 0.42), (0.05, 0.40, 1.0))


def cut1_keys():
    """右袈裟：右の剣を右肩の上へ振りかぶり、右上から左下へ斬り下ろす。左の剣は前で構えたまま少し引く"""
    S = STANCE
    up = P(S, hip=(0.0, -0.08, -0.02), hip_rot=(38, 4, 0), chest=(12, -2, 0), R_clav=10.0,
           R=RS((0.45, 0.55, -0.10), (0.20, 0.40, -0.90), (1, 0.1, -0.4)),
           L=LS((0.15, -0.35, 0.62), (0.2, 0.6, 1.0)))
    hit = P(S, hip=(0.0, -0.14, 0.22), hip_rot=(-15, 12, 0), chest=(-8, 8, 4), look=(0, 6), R_clav=2.0,
            R=RS((-0.05, 0.05, 1.0), (-0.45, -0.45, 0.75), (0.6, -0.8, 0)),
            L=LS((-0.05, -0.45, 0.55), (0.1, 0.5, 1.0)),
            R_foot=(0.17, 0.30, 20, 0, 0))
    low = P(hit, hip_rot=(-40, 16, 0), chest=(-14, 12, 6),
            R=RS((-0.55, -0.75, 0.40), (-0.55, -0.70, -0.30), (0.3, -1, 0.4)))
    hold = P(low, hip=(0.0, -0.13, 0.21))
    return [(0.0, S, None), (0.12, up, 'io'), (0.22, hit, 'i'), (0.30, low, 'o'), (0.45, hold, 'io'), (0.70, S, 'io')], hold


def cut2_keys(start):
    """左薙：左の剣を左後ろへ引いて体を左へ開き、右へ戻しながら左から右へ水平に薙ぐ"""
    S = STANCE
    wind = P(start, hip=(0.0, -0.12, 0.14), hip_rot=(-38, 8, 0), chest=(-16, 2, 0), look=(0, 2), L_clav=8.0,
             R=RS((0.15, -0.55, 0.45), (0.05, 0.4, 1.0)),
             L=LS((-0.62, 0.02, 0.15), (-0.80, 0.10, -0.55), (-0.9, -0.6, -0.3)))
    hit = P(start, hip=(0.04, -0.14, 0.26), hip_rot=(18, 8, 0), chest=(8, 4, 0), look=(0, 3),
            L=LS((0.18, -0.08, 1.0), (0.62, 0.05, 0.78), (-0.4, -1, 0)),
            R=RS((0.20, -0.55, 0.40), (0.0, 0.4, 1.0)),
            L_foot=(-0.24, 0.40, 5, 0, 0), R_foot=(0.20, -0.20, 35, 10, 0))
    follow = P(hit, hip_rot=(40, 6, 0), chest=(16, 4, 0),
               L=LS((0.80, -0.12, 0.45), (0.92, 0.0, -0.25), (-0.2, -1, 0.4)))
    hold = P(follow, hip=(0.04, -0.13, 0.25))
    return [(0.0, start, None), (0.16, wind, 'io'), (0.27, hit, 'i'), (0.36, follow, 'o'), (0.50, hold, 'io'), (0.75, S, 'io')], hold


def cut3_keys(start):
    """十字斬：2 本を頭上で交差させて振りかぶり、右足で踏み込みながら、前で十字を描くように同時に斬り下ろす"""
    S = STANCE
    over = P(start, hip=(0.0, -0.06, 0.0), hip_rot=(8, 0, 0), chest=(2, -6, 0), look=(0, 4), R_clav=14.0, L_clav=14.0,
             R=RS((-0.05, 0.85, 0.05), (0.55, 0.45, -0.70), (1, 0.2, -0.3)),
             L=LS((0.05, 0.85, 0.05), (-0.55, 0.45, -0.70), (-1, 0.2, -0.3)),
             R_foot=(0.20, -0.10, 30, 15, 0.05))
    hit = P(S, hip=(0.0, -0.18, 0.34), hip_rot=(0, 16, 0), chest=(0, 12, 0), look=(0, 10), R_clav=2.0, L_clav=2.0,
            R=RS((-0.10, -0.05, 1.0), (-0.55, -0.40, 0.73), (0.6, -0.8, 0)),
            L=LS((0.10, -0.05, 1.0), (0.55, -0.40, 0.73), (-0.6, -0.8, 0)),
            R_foot=(0.18, 0.52, 10, 0, 0), L_foot=(-0.20, 0.10, 15, 18, 0))
    low = P(hit, hip=(0.0, -0.20, 0.36), chest=(0, 16, 0),
            R=RS((-0.45, -0.70, 0.55), (-0.60, -0.70, -0.20), (0.3, -1, 0.4)),
            L=LS((0.45, -0.70, 0.55), (0.60, -0.70, -0.20), (-0.3, -1, 0.4)))
    hold = P(low, hip=(0.0, -0.19, 0.35))
    back = P(S, hip=(0.0, -0.12, 0.14), R_foot=(0.19, 0.10, 25, 10, 0.05))
    return [(0.0, start, None), (0.18, over, 'io'), (0.32, hit, 'i'), (0.40, low, 'o'), (0.58, hold, 'io'), (0.78, back, 'io'), (0.95, S, 'io')]


def cross_pose(low=False):
    """胸の前で 2 本を交差させた構え（開斬の溜め・奧義の構え）。low：腰を落として前へ低く（奧義）"""
    hip = (0.0, -0.30, 0.10) if low else (0.0, -0.13, 0.06)
    return P(STANCE, hip=hip, hip_rot=(6, 22 if low else 10, 0), chest=(0, 10 if low else 4, 0), look=(0, 14 if low else 4),
             R=RS((-0.30, -0.25, 0.62), (-0.55, 0.65, 0.52), (0.8, -0.8, -0.2)),
             L=LS((0.30, -0.25, 0.62), (0.55, 0.65, 0.52), (-0.8, -0.8, -0.2)),
             R_clav=4.0, L_clav=4.0,
             L_foot=(-0.22, 0.25, 10, 0, 0) if low else (-0.20, 0.12, 8, 0, 0),
             R_foot=(0.20, -0.45, 35, 30, 0) if low else (0.20, -0.30, 40, 8, 0))


def c1_in_keys():
    S = STANCE
    return [(0.0, S, None), (0.30, cross_pose(), 'io')]


def c1_hold(t):
    """溜めている間：交差させた剣がわずかに震え、息で上下する"""
    C = cross_pose()
    tr = 0.006 * math.sin(2 * math.pi * 11 * t) + 0.004 * math.sin(2 * math.pi * 17 * t + 1)
    br = 0.006 * math.sin(2 * math.pi * t)
    g, h = C['R']['grip'], C['L']['grip']
    return P(C, hip=(C['hip'][0], C['hip'][1] + br, C['hip'][2]),
             R={'grip': (g[0] + tr, g[1] + tr * 0.6, g[2])}, L={'grip': (h[0] - tr, h[1] + tr * 0.6, h[2])})


def c1_out_keys():
    """開斬：交差させた 2 本を、左右へ大きく開いて水平に斬り払う"""
    C = cross_pose()
    open_ = P(C, hip=(0.0, -0.15, 0.20), hip_rot=(0, 10, 0), chest=(0, 4, 0), look=(0, 4),
              R=RS((0.55, -0.15, 0.80), (0.85, 0.05, 0.50), (0.4, -1, 0)),
              L=LS((-0.55, -0.15, 0.80), (-0.85, 0.05, 0.50), (-0.4, -1, 0)),
              L_foot=(-0.22, 0.30, 8, 0, 0))
    wide = P(open_, R=RS((0.85, -0.10, 0.20), (0.90, 0.0, -0.40), (0.1, -1, 0.3)),
             L=LS((-0.85, -0.10, 0.20), (-0.90, 0.0, -0.40), (-0.1, -1, 0.3)))
    hold = P(wide, hip=(0.0, -0.14, 0.19))
    return [(0.0, C, None), (0.08, open_, 'i'), (0.18, wide, 'o'), (0.40, hold, 'io'), (0.70, STANCE, 'io')], hold


def spin2(base, y0, center, feet0, yaw, r_arm, l_arm, lift=None, hip_u=-0.18, pitch=8, chest=(0, 4, 0)):
    """両手の剣を胸から見た向きで書いて、その場で回る姿（weapon_common.spin の両手版）"""
    d = yaw - y0
    out = P(base, hip=(center[0], hip_u, center[1]), hip_rot=(yaw, pitch, 0), chest=chest, look=(yaw + chest[0], 4))
    for s in 'RL':
        r, f, fy, heel, _ = (list(feet0[s]) + [0, 0, 0])[:5]
        rr, _, ff = rot_y((r - center[0], 0, f - center[1]), d)
        up = (lift or {}).get(s, 0.0)
        out[s + '_foot'] = (center[0] + rr, center[1] + ff, fy + d, heel if not up else 20, up)
    out['R'] = chest_arm(r_arm, yaw + chest[0])
    out['L'] = chest_arm(l_arm, yaw + chest[0])
    return out


def c2_keys(start):
    """雙旋：開斬の後、2 本を左右へ広げたまま右回りに一回転して周りを斬る（前を通るときと、後ろを通るときに当たる）"""
    S = STANCE
    y0 = start['hip_rot'][0]
    center = (0.0, 0.20)
    feet0 = {'R': start['R_foot'], 'L': start['L_foot']}
    ra = RS((0.85, -0.10, 0.25), (0.92, 0.0, -0.30), (0.1, -1, 0.3))
    la = LS((-0.85, -0.10, 0.25), (-0.92, 0.0, -0.30), (-0.1, -1, 0.3))
    keys = [(0.0, start, None), (0.10, spin2(start, y0, center, feet0, y0 - 20, ra, la, hip_u=-0.20), 'io')]
    steps = 8
    for i in range(1, steps + 1):
        yaw = y0 - 20 + 380 * i / steps
        lift = {'R': 0.05} if i in (2, 3) else {'L': 0.05} if i in (5, 6) else None
        keys.append((0.10 + 0.55 * i / steps, spin2(start, y0, center, feet0, yaw, ra, la, lift, hip_u=-0.19), 'i' if i == 1 else 'l'))
    fin = spin2(start, y0, center, feet0, y0 + 380, RS((0.40, -0.40, 0.70), (0.3, 0.2, 1.0)), LS((-0.30, -0.40, 0.70), (-0.2, 0.2, 1.0)), hip_u=-0.16)
    keys.append((0.82, fin, 'o'))
    S2 = P(S, hip_rot=(S['hip_rot'][0] + 360, S['hip_rot'][1], 0))
    S2['look'] = (360 + S['look'][0], S['look'][1])
    keys.append((1.10, S2, 'io'))
    return keys


def ult_keys():
    """奧義：2 本を交差させて低く構え、前へ高速で滑りながら、通り抜けざまに左右へ切り裂く。
    体はゲームが前へ動かすので、この動きは足を滑らせた姿のまま（その場）"""
    S = STANCE
    ready = cross_pose(low=True)
    # 滑る：上体を前へ倒し、両足を前後に開いて低く滑る（後ろ足のかかとを上げる）。剣は交差したまま
    glide = P(ready, hip=(0.0, -0.40, 0.18), hip_rot=(0, 28, 0), chest=(0, 14, 0), look=(0, 18),
              L_foot=(-0.20, 0.55, 5, 0, 0), R_foot=(0.18, -0.55, 25, 45, 0))
    glide2 = P(glide, hip=(0.0, -0.41, 0.20))
    # 通り抜けざまに切り裂く：交差を解いて左右へ大きく開く
    slash = P(glide, hip=(0.0, -0.36, 0.22), hip_rot=(0, 18, 0), chest=(0, 6, 0), look=(0, 8),
              R=RS((0.80, -0.20, 0.45), (0.90, -0.05, -0.40), (0.1, -1, 0.3)),
              L=LS((-0.80, -0.20, 0.45), (-0.90, -0.05, -0.40), (-0.1, -1, 0.3)), R_clav=0.0, L_clav=0.0)
    hold = P(slash, hip=(0.0, -0.33, 0.20))
    rise = P(S, hip=(0.0, -0.16, 0.10), R_foot=(0.20, -0.20, 35, 10, 0.04))
    return [(0.0, S, None), (0.22, ready, 'io'), (0.34, glide, 'i'), (0.62, glide2, 'l'), (0.74, slash, 'o'), (0.95, hold, 'io'),
            (1.20, rise, 'io'), (1.45, S, 'io')]


# ======================= 暗殺（背後） =======================
AS_BACK_GAP = 0.64   # 片手劍の背刺と同じ並び（相手は 0.64 m 前に背を向けて立つ。される側は as_back_v）


def as_back_keys():
    """背刺（二刀）：背後から密着し、2 本を同時に背中へ突き刺す。蹴り飛ばすと同時に抜く（時刻は片手劍の背刺と同じ）"""
    G = AS_BACK_GAP
    S = STANCE
    start = P(S, hip=(0.0, -0.12, 0.0))
    draw = P(S, hip=(0.0, -0.13, 0.06), hip_rot=(4, 10, 0), chest=(2, 6, 0), look=(0, 6),
             R=RS((0.15, -0.70, 0.05), (0.0, 0.10, 1.0), (0.6, -1, -0.6)),
             L=LS((-0.15, -0.70, 0.05), (0.0, 0.10, 1.0), (-0.6, -1, -0.6)),
             L_foot=(-0.18, 0.12, 6, 0, 0), R_foot=(0.18, 0.20, 18, 0, 0))
    stab = P(draw, hip=(0.0, -0.15, 0.13), hip_rot=(0, 16, 0), chest=(0, 8, 0), look=(0, 10),
             R={'grip_w': (0.07, 1.06, G - 0.16), 'blade': (-0.05, 0.10, 1.0), 'pole': (0.4, -1, -0.2), 'auto': 1.0, 'roll': 0.0},
             L={'grip_w': (-0.11, 1.06, G - 0.16), 'blade': (0.05, 0.10, 1.0), 'pole': (-0.4, -1, -0.2), 'auto': 1.0, 'roll': 0.0},
             R_foot=(0.17, 0.30, 12, 18, 0))
    twist = P(stab, hip=(0.0, -0.16, 0.14))
    chamber = P(S, hip=(0.0, -0.06, 0.06), hip_rot=(0, 2, 0), chest=(2, -6, 0), look=(0, 8),
                R=RS((0.30, -0.40, 0.45), (0.0, 0.30, 1.0)), L=LS((-0.25, -0.40, 0.45), (0.0, 0.30, 1.0)),
                L_foot=(-0.17, 0.10, 6, 0, 0), R_foot=(0.12, 0.18, 0, -40, 0.40))
    kick = P(chamber, hip=(0.0, -0.05, -0.04), hip_rot=(4, -10, 0), chest=(2, -8, 0),
             R=RS((0.35, -0.30, 0.30), (0.05, 0.45, 1.0)), L=LS((-0.30, -0.30, 0.30), (-0.05, 0.45, 1.0)),
             R_foot=(0.10, G + 0.05, 0, -75, 0.72))
    down = P(S, hip=(0.0, -0.09, 0.02), hip_rot=(14, 6, 0), R_foot=(0.18, 0.05, 25, 0, 0.04))
    return [(0.0, start, None), (0.25, draw, 'io'), (0.40, stab, 'i'), (0.95, twist, 'io'), (1.08, chamber, 'io'),
            (1.20, kick, 'i'), (1.42, down, 'o'), (2.05, S, 'io')]


def build(rig, sources, info):
    """二刀流の技の動きと、2 本持つ待機・歩き・後ろ歩き・走りを作る。返り値：[(ゲームの名前, action, 情報)]"""
    out = []

    def make(name, fn, dur, loop=False):
        out.append(make_clip(rig, name, fn, dur, loop))

    k1, h1 = cut1_keys()
    make('dw_cut1', lambda t: sample(k1, t), k1[-1][0])
    k2, h2 = cut2_keys(h1)
    make('dw_cut2', lambda t: sample(k2, t), k2[-1][0])
    k3 = cut3_keys(h2)
    make('dw_cut3', lambda t: sample(k3, t), k3[-1][0])
    ki = c1_in_keys()
    make('dw_c1_in', lambda t: sample(ki, t), ki[-1][0])
    make('dw_c1_hold', c1_hold, 1.0, loop=True)
    ko, wide = c1_out_keys()
    make('dw_c1_out', lambda t: sample(ko, t), ko[-1][0])
    kc = c2_keys(wide)
    make('dw_c2', lambda t: sample(kc, t), kc[-1][0])
    ku = ult_keys()
    make('dw_ult', lambda t: sample(ku, t), ku[-1][0])
    ka = as_back_keys()
    make('dw_as_back', lambda t: sample(ka, t), ka[-1][0])
    for base in ('idle', 'walk', 'back', 'run'):
        if base in sources:
            act = hold_weapon(rig, sources[base], f'dw_{base}', HOLD_R, HOLD_L)
            out.append((f'dw_{base}', act, dict(info[base])))
            print('2 本持つ形にした', f'dw_{base}')
    return out
