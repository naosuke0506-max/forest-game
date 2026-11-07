# 全キャラの体の動きを、Tripo の骨に直接付ける（Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具）
#
#   crouch_walk     しゃがみ歩き（深くしゃがんで歩く。顔はまっすぐ前）。前の動き（make_motions.py の中腰の物）と入れ替える
#   prone_up        伏せから起き上がる（腕で押し上げる → 片膝を引き寄せる → 片膝立ち → 立つ）。前の動きと入れ替える
#   hit_l_<向き>    被弾（軽い）：攻撃された向き（f 前・b 後ろ・l 左・r 右）と反対へ、体がはじかれる
#   hit_h_<向き>    被弾（重い）：大きくのけぞり、押された向きへ一歩よろける
#   stagger_<向き>  よろめき（防御を崩された・長いひるみ）：腕が泳ぎ、何歩もよろけてから立て直す
#   楯を持つキャラだけ：
#     guard_l・guard_h 防禦で受けた（弱い・強い）。崩れたときは stagger_f（楯が外へはね飛ばされる）
#     sb_bash 楯擊・sb_push 楯押・sb_parry 受流・sb_charge 楯突貫
# 這う・伏せ・伏せる（make_motions.py から移した物）は、顔がまっすぐ前（水平）を向くように首と頭を直す
#
# 重い被弾・よろめきは、押された向きへ体が動いたまま終わる（どれだけ動いたかは「shift」に書く。ゲームに入れるときに使う）
import math
from mathutils import Vector
from ik_rig import *   # noqa: F401,F403
from onehand_moves import STANCE as SWORD_STANCE

DIRS = {'f': 0.0, 'b': 180.0, 'l': -90.0, 'r': 90.0}   # 攻撃してきた向き（体の前から右へ 度）


def add(a, b, k=1.0):
    return tuple(x + y * k for x, y in zip(a, b))


# 右手の武器の持ち方（動きの元の武器の種類ごと）：刃先（槍は穂先）の向きと刃の幅の向き。弓兵は右手に何も持たない
CARRY = {
    '1hs': ((-0.1, 0.8, 0.6), (1, 0, 0)), '2h': ((-0.1, 0.8, 0.6), (1, 0, 0)), 'mc': ((-0.05, 0.85, 0.5), (1, 0, 0)),
    'sp': ((0.0, 0.22, 1.0), (1, 0, 0)), 'bw': None,
}
FLAT = ((0.0, 0.02, 1.0), (1, 0, 0))   # 手を地面に着いているとき：武器は地面に沿って前へ
CARRY_NOW = [None]                       # 今作っているキャラの持ち方（build が決める）


def carry(spec, how=None):
    """右手の書き方に、武器の向きを足す"""
    c = how or CARRY_NOW[0]
    if not c:
        return spec
    return dict(spec, blade=c[0], edge=c[1])


def ready(shield):
    """どのキャラにも合う、構えた立ち姿（反動の動きの始まりと終わり）"""
    base = {
        'hip': (0.0, -0.05, 0.0), 'hip_rot': (8, 5, 0), 'chest': (2, 3, 0), 'look': (0, 0), 'look_k': 0.9,
        'R': {'wrist': (0.14, -0.70, 0.40), 'pole': (0.5, -1, -0.4)},
        'L': {'wrist': (-0.10, -0.62, 0.45), 'pole': (-0.8, -1, -0.2)},
        'R_clav': 0.0, 'L_clav': 0.0,
        'L_foot': (-0.16, 0.08, 6, 0, 0, 0), 'R_foot': (0.17, -0.14, 22, 0, 0, 0),
    }
    if shield:
        base['L'] = {'wrist': (-0.05, -0.45, 0.62), 'normal': (-0.2, 0, 1), 'up': (0, 1, 0), 'pole': (-1, -0.6, 0)}
    base['R'] = carry(base['R'])
    return base


# ======================= しゃがみ歩き =======================
def crouch_walk_fn(hip_u, shield, step=0.30, dur=1.1, duty=0.62):
    """深くしゃがんで歩く（その場）。足は地面に着いている間、まっすぐ後ろへ送る（滑らない）"""
    base = ready(shield)

    def foot(ph, r, yaw):
        if ph < duty:                                   # 地面に着いて、後ろへ送る
            u = ph / duty
            f = step * (0.5 - u)
            heel = 28 * max(0.0, (u - 0.72) / 0.28)       # 終わりにかかとを上げて蹴る
            return (r, f, yaw, heel, 0.0, 0.0)
        u = (ph - duty) / (1 - duty)                    # 浮かせて前へ運ぶ
        e = u * u * (3 - 2 * u)
        f = step * (-0.5 + e)
        return (r, f, yaw, 28 * (1 - u) - 8 * u, 0.075 * math.sin(math.pi * u), 0.0)

    def fn(t):
        ph = (t / dur) % 1.0
        sway = -0.022 * math.cos(2 * math.pi * (ph - duty / 2))
        bob = -0.012 * math.cos(4 * math.pi * (ph - 0.1))
        yaw = 5 * math.sin(2 * math.pi * ph)
        p = P(base, hip=(sway, hip_u + bob, 0.02), hip_rot=(yaw, 30, 0), chest=(-yaw * 0.7, 10, 0), look=(0, 0), look_k=1.0,
              L_foot=foot(ph, -0.15, 2), R_foot=foot((ph + 0.5) % 1.0, 0.15, 8))
        sw = 0.04 * math.sin(2 * math.pi * ph)
        p['R'] = carry({'wrist': (0.15, -0.50 + 0.02 * math.sin(4 * math.pi * ph), 0.55 + sw), 'pole': (0.5, -1, -0.3)})
        if shield:
            p['L'] = {'wrist': (-0.02, -0.38, 0.62), 'normal': (-0.15, 0.05, 1), 'up': (0, 1, 0), 'pole': (-1, -0.6, 0)}
        else:
            p['L'] = {'wrist': (-0.12, -0.50, 0.50 - sw), 'pole': (-0.6, -1, -0.2)}
        return p
    return fn, dur, 2 * step / dur


# ======================= 伏せから起き上がる =======================
def prone_up_keys(shield):
    """伏せ → 腕立てのように押し上げる → 膝を引き寄せて四つんばい → 右足を前へ出して片膝立ち → 立つ"""
    S = ready(shield)

    def arms(rw, lw, mixw, rpole, lpole, rrel=(0.15, -0.62, 0.48), lrel=(-0.12, -0.55, 0.48), sh=None):
        R = carry({'wrist': rrel, 'wrist_w': rw, 'w_mix': mixw, 'pole': rpole}, FLAT if (mixw and CARRY_NOW[0]) else None)
        L = {'wrist': lrel, 'wrist_w': lw, 'w_mix': mixw, 'pole': lpole}
        if shield:
            n, u = sh or ((-0.2, 0, 1), (0, 1, 0))
            L.update(normal=n, up=u)
            if mixw == 0:
                L['wrist'] = (-0.05, -0.45, 0.62)
        return R, L

    def pose(hip, rot, chest, lf, rf, lk, rk, R, L):
        return P(S, hip=hip, hip_rot=rot, chest=chest, look=(0, 0), look_k=1.0, R=R, L=L,
                 L_foot=lf, R_foot=rf, L_knee=lk, R_knee=rk)
    flat_sh = ((-0.3, 1, 0.2), (0, 0.2, 1))
    down = (0, -1, 0.2)
    R, L = arms((0.15, 0.06, 0.62), (-0.15, 0.06, 0.62), 1, (0.4, -1, -0.3), (-0.4, -1, -0.3), sh=flat_sh)
    prone = pose((0.0, -0.86, 0.0), (0, 84, 0), (0, -12, 0), (-0.12, -0.88, 0, 78, 0, 0), (0.12, -0.88, 0, 78, 0, 0), down, down, R, L)
    R, L = arms((0.17, 0.02, 0.42), (-0.17, 0.02, 0.42), 1, (0.6, -0.3, -1), (-0.6, -0.3, -1), sh=flat_sh)
    push = pose((0.0, -0.74, -0.04), (0, 70, 0), (0, -6, 0), (-0.12, -0.84, 0, 80, 0, 0), (0.12, -0.84, 0, 80, 0, 0), down, down, R, L)
    R, L = arms((0.17, 0.02, 0.40), (-0.17, 0.02, 0.40), 1, (0.6, -0.3, -1), (-0.6, -0.3, -1), sh=flat_sh)
    fours = pose((0.0, -0.46, -0.14), (0, 62, 0), (0, 0, 0), (-0.12, -0.52, 0, 82, 0, 0), (0.14, -0.50, 4, 82, 0, 0), (0, -0.3, 1), (0, -0.3, 1), R, L)
    R, L = arms((0.17, 0.02, 0.40), (-0.17, 0.02, 0.40), 0, (0.5, -1, -0.4), (-0.8, -1, -0.2))
    kneel = pose((0.0, -0.46, -0.02), (6, 12, 0), (0, 6, 0), (-0.13, -0.42, 2, 80, 0, 0), (0.16, 0.34, 10, 0, 0, 0), (0, -0.2, 1), (0.1, 0, 1), R, L)
    rise = pose((0.0, -0.20, 0.10), (8, 16, 0), (2, 4, 0), (-0.14, -0.16, 4, 40, 0, 0), (0.16, 0.30, 12, 0, 0, 0), (0, 0, 1), (0.1, 0, 1), R, L)
    end = pose(S['hip'], S['hip_rot'], S['chest'], S['L_foot'], S['R_foot'], (-0.12, 0, 1), (0.12, 0, 1), R, L)
    return [(0.0, prone, None), (0.28, push, 'io'), (0.52, fours, 'io'), (0.78, kneel, 'io'), (1.02, rise, 'io'), (1.30, end, 'o')]


# ======================= 被弾・よろめき =======================
def recoil(base, a, k, arms=0.0):
    """攻撃された向き a から k の強さで体がはじかれた姿勢。arms：腕が外へ泳ぐ量"""
    ra = math.radians(a)
    sa, ca = math.sin(ra), math.cos(ra)
    pr, pf = -sa, -ca                                     # 押される向き（右・前）
    hp, hr, cs = base['hip'], base['hip_rot'], base['chest']
    out = P(base,
            hip=(hp[0] + pr * 0.05 * k, hp[1] - 0.028 * k, hp[2] + pf * 0.05 * k),
            hip_rot=(hr[0] - 7 * sa * k, hr[1] - 7 * ca * k, hr[2] - 7 * sa * k),
            chest=(cs[0] - 14 * sa * k, cs[1] - 16 * ca * k, cs[2] - 14 * sa * k),
            look=(-18 * sa * k, -14 * ca * k))
    rw, lw = base['R']['wrist'], base['L']['wrist']
    if 'blade' in base['R']:   # 武器も押された向きへ傾く
        out['R'] = dict(base['R'], blade=add(base['R']['blade'], (pr * 0.18 * k + 0.3 * arms, 0, pf * 0.18 * k)))
        base = dict(base, R=out['R'])
    out['R'] = dict(base['R'], wrist=add(rw, (pr * 0.12 * k + 0.45 * arms, 0.07 * k + 0.42 * arms, pf * 0.12 * k - 0.25 * arms)))
    out['L'] = dict(base['L'], wrist=add(lw, (pr * 0.12 * k - 0.45 * arms, 0.07 * k + 0.42 * arms, pf * 0.12 * k - 0.25 * arms)))
    return out


def moved(p, a, dist, feet=None):
    """押された向きへ dist m 動いた姿勢（腰と、feet に書いた足）"""
    ra = math.radians(a)
    pr, pf = -math.sin(ra), -math.cos(ra)
    out = P(p, hip=(p['hip'][0] + pr * dist, p['hip'][1], p['hip'][2] + pf * dist))
    for s, d, lift in feet or []:
        ft = p[s + '_foot']
        out[s + '_foot'] = (ft[0] + pr * d, ft[1] + pf * d, ft[2], ft[3], lift, ft[5])
    return out


def lead_foot(base, a):
    """押される向きの側にある足（先に下がる足）"""
    ra = math.radians(a)
    pr, pf = -math.sin(ra), -math.cos(ra)
    dl = base['L_foot'][0] * pr + base['L_foot'][1] * pf
    dr = base['R_foot'][0] * pr + base['R_foot'][1] * pf
    return ('L', 'R') if dl >= dr else ('R', 'L')


def hit_light_keys(base, a):
    imp = recoil(base, a, 1.0)
    reb = mix(base, imp, -0.25)
    return [(0.0, base, None), (0.06, imp, 'o'), (0.18, reb, 'io'), (0.45, base, 'io')]


def hit_heavy_keys(base, a):
    A, B = lead_foot(base, a)
    imp = recoil(base, a, 2.6, arms=0.6)
    s1 = moved(recoil(base, a, 2.1, arms=0.5), a, 0.20, [(A, 0.30, 0.07)])
    s1b = moved(recoil(base, a, 1.5, arms=0.35), a, 0.26, [(A, 0.34, 0.0)])
    s2 = moved(recoil(base, a, 0.9, arms=0.15), a, 0.30, [(A, 0.34, 0.0), (B, 0.20, 0.05)])
    rec = moved(recoil(base, a, 0.3), a, 0.30, [(A, 0.34, 0.0), (B, 0.28, 0.0)])
    end = moved(base, a, 0.30, [(A, 0.30, 0.0), (B, 0.30, 0.0)])
    keys = [(0.0, base, None), (0.08, imp, 'o'), (0.22, s1, 'io'), (0.32, s1b, 'o'), (0.48, s2, 'io'), (0.68, rec, 'io'), (0.95, end, 'io')]
    return keys, 0.30


def stagger_keys(base, a, shield):
    A, B = lead_foot(base, a)
    ra = math.radians(a)
    imp = recoil(base, a, 3.0, arms=1.0)
    if shield and abs(a) < 1:
        # 防禦を崩された：楯が外（左上）へはね飛ばされる
        imp['L'] = dict(imp['L'], wrist=(-0.62, -0.05, 0.25), normal=(-0.7, 0.45, 0.55), up=(0.2, 1, -0.2))
    w1 = moved(recoil(base, a, 2.7, arms=0.95), a, 0.22, [(A, 0.36, 0.08)])
    w1 = P(w1, chest=add(w1['chest'], (8 * math.cos(ra), 0, 10)))
    w2 = moved(recoil(base, a, 2.2, arms=0.8), a, 0.42, [(A, 0.36, 0.0), (B, 0.62, 0.09)])
    w2 = P(w2, chest=add(w2['chest'], (-10 * math.cos(ra), 4, -12)), look=add(w2['look'], (12, 6)))
    w3 = moved(recoil(base, a, 1.4, arms=0.6), a, 0.56, [(A, 0.72, 0.08), (B, 0.62, 0.0)])
    w3 = P(w3, chest=add(w3['chest'], (6, -4, 8)))
    reg = moved(recoil(base, a, 0.5, arms=0.2), a, 0.62, [(A, 0.72, 0.0), (B, 0.62, 0.0)])
    end = moved(base, a, 0.66, [(A, 0.66, 0.0), (B, 0.66, 0.0)])
    if shield and abs(a) < 1:
        for p in (w1, w2):
            p['L'] = dict(p['L'], wrist=(-0.55, -0.15, 0.25), normal=(-0.7, 0.3, 0.6), up=(0.15, 1, -0.1))
    keys = [(0.0, base, None), (0.09, imp, 'o'), (0.28, w1, 'io'), (0.50, w2, 'io'), (0.72, w3, 'io'), (0.98, reg, 'io'), (1.40, end, 'io')]
    return keys, 0.66


# ======================= 楯劍騎士：防禦で受ける =======================
def guard_pose():
    """楯を顔と胸の前に上げて構え、剣は楯の後ろで備える"""
    return P(SWORD_STANCE, hip=(0.0, -0.10, -0.02), hip_rot=(18, 9, 0), chest=(6, 6, 0), look=(0, 0),
             R={'grip': (0.18, -0.35, 0.30), 'blade': (-0.15, 0.75, 0.6), 'edge': (0.7, 0, -0.7), 'pole': (0.7, -1, -0.3)},
             L={'wrist': (0.28, -0.20, 0.62), 'normal': (0.05, 0.05, 1), 'up': (0, 1, 0.12), 'pole': (-1, -0.4, -0.1)},
             L_foot=(-0.20, 0.12, 10, 0, 0), R_foot=(0.20, -0.24, 32, 0, 0))


def guard_keys(heavy):
    G = guard_pose()
    if not heavy:
        imp = P(G, hip=(0.0, -0.13, -0.06), chest=(6, 2, 0),
                L={'wrist': (0.26, -0.18, 0.48), 'normal': (0.0, 0.22, 1)})
        return [(0.0, G, None), (0.06, imp, 'o'), (0.18, mix(G, imp, -0.15), 'io'), (0.40, G, 'io')]
    imp = P(G, hip=(0.0, -0.17, -0.14), hip_rot=(26, 2, 0), chest=(10, -10, 0), look=(4, -6),
            R={'grip': (0.55, -0.10, 0.05), 'blade': (0.4, 0.7, 0.3), 'edge': (0.5, -0.3, -0.8), 'pole': (1, -0.4, -0.3)},
            L={'wrist': (0.22, -0.12, 0.32), 'normal': (0.05, 0.35, 1), 'up': (0, 1, -0.2)}, L_clav=10.0,
            L_foot=(-0.20, 0.02, 10, 0, 0), R_foot=(0.20, -0.34, 32, 0, 0))
    hold = P(imp, hip=(0.0, -0.16, -0.16), chest=(8, -4, 0), L_clav=6.0)
    step = P(G, hip=(0.0, -0.12, -0.08), L_foot=(-0.20, 0.08, 10, 0, 0.04))
    return [(0.0, G, None), (0.07, imp, 'o'), (0.22, hold, 'io'), (0.48, step, 'io'), (0.75, G, 'io')]


# ======================= 楯劍騎士：楯の技 =======================
def bash_keys():
    """楯擊：楯を左に溜めて、右へ向かって殴りつける"""
    S = SWORD_STANCE
    wind = P(S, hip=(0.0, -0.10, -0.04), hip_rot=(-15, 8, 0), chest=(-22, 4, 0), look=(0, 0),
             L={'wrist': (-0.48, -0.32, 0.28), 'normal': (-0.85, 0, 0.5), 'up': (0, 1, 0), 'pole': (-0.8, -0.8, -0.3)},
             R={'grip': (0.35, -0.45, -0.05), 'blade': (0.2, 0.4, 1), 'edge': (1, 0, 0), 'pole': (0.6, -1, -0.5)})
    hit = P(S, hip=(0.0, -0.12, 0.16), hip_rot=(38, 12, 0), chest=(14, 8, 0), look=(0, 0),
            L={'wrist': (0.42, -0.20, 0.60), 'normal': (0.75, 0, 0.65), 'up': (0, 1, 0), 'pole': (-0.4, -1, -0.6)},
            R={'grip': (0.40, -0.50, -0.10), 'blade': (0.1, 0.5, 1), 'edge': (1, 0, 0), 'pole': (0.6, -1, -0.5)},
            L_foot=(-0.20, 0.36, 15, 0, 0), R_foot=(0.20, -0.26, 40, 15, 0))
    follow = P(hit, hip_rot=(46, 10, 0), L={'wrist': (0.55, -0.28, 0.40), 'normal': (0.9, 0, 0.4)})
    return [(0.0, S, None), (0.16, wind, 'io'), (0.30, hit, 'i'), (0.42, follow, 'o'), (0.75, S, 'io')]


def push_keys():
    """楯押：体を低くして楯の後ろに肩を入れ、踏み込んで押し出す"""
    S = SWORD_STANCE
    tuck = P(S, hip=(0.0, -0.18, -0.04), hip_rot=(32, 16, 0), chest=(8, 12, 0), look=(0, 0),
             L={'wrist': (0.08, -0.38, 0.34), 'normal': (-0.05, 0, 1), 'up': (0, 1, 0), 'pole': (-1, -0.5, 0)})
    shove = P(S, hip=(0.0, -0.16, 0.30), hip_rot=(12, 20, 0), chest=(4, 10, 0), look=(0, 0),
              L={'wrist': (0.12, -0.28, 0.86), 'normal': (0, 0.05, 1), 'up': (0, 1, 0), 'pole': (-1, -0.6, 0)},
              L_foot=(-0.20, 0.42, 10, 0, 0), R_foot=(0.20, -0.20, 36, 28, 0))
    hold = P(shove, hip=(0.0, -0.15, 0.31))
    back = P(S, hip=(0.0, -0.10, 0.12), L_foot=(-0.20, 0.26, 9, 0, 0.04))
    return [(0.0, S, None), (0.14, tuck, 'io'), (0.30, shove, 'i'), (0.42, hold, 'o'), (0.58, back, 'io'), (0.75, S, 'io')]


def parry_keys():
    """受流：楯を右に溜めて、左へ向かって楯で払う"""
    S = SWORD_STANCE
    wind = P(S, hip=(0.0, -0.09, 0.0), hip_rot=(40, 8, 0), chest=(12, 4, 0), look=(0, 0),
             L={'wrist': (0.48, -0.30, 0.48), 'normal': (0.55, 0, 0.85), 'up': (0, 1, 0), 'pole': (-0.5, -1, -0.6)})
    sweep = P(S, hip=(0.0, -0.11, 0.04), hip_rot=(-8, 10, 0), chest=(-16, 6, 0), look=(0, 0),
              L={'wrist': (-0.40, -0.25, 0.58), 'normal': (-0.75, 0, 0.65), 'up': (0, 1, 0), 'pole': (-1, -0.6, -0.2)})
    follow = P(sweep, hip_rot=(-14, 9, 0), L={'wrist': (-0.55, -0.35, 0.38), 'normal': (-0.9, 0, 0.4)})
    return [(0.0, S, None), (0.10, wind, 'io'), (0.22, sweep, 'i'), (0.32, follow, 'o'), (0.55, S, 'io')]


def charge_fn():
    """楯突貫：楯の下を地面に着け、体を預けて地面を削りながら走る（その場。進むのはゲームが動かす）"""
    S = SWORD_STANCE
    hold_L = {'center_w': (-0.10, 0.62, 0.42), 'normal': (-0.2, 0, 1), 'up': (0, 1, 0), 'pole': (-1, -0.6, 0)}
    shield_L = {'center_w': (-0.05, 0.50, 0.62), 'normal': (0, 0.12, 1), 'up': (0, 1, -0.22), 'pole': (-1, -0.8, 0)}
    S2 = P(S, L=hold_L)
    low = P(S2, hip=(0.0, -0.24, 0.10), hip_rot=(14, 30, 0), chest=(4, 10, 0), look=(0, 0),
            R={'grip': (0.30, -0.45, -0.10), 'blade': (0.1, 0.5, 1), 'edge': (1, 0, 0), 'pole': (0.6, -1, -0.5)})
    plant = P(low, L=shield_L, L_foot=(-0.20, 0.16, 8, 0, 0), R_foot=(0.20, -0.30, 30, 20, 0))
    stride, cyc, duty = 0.62, 0.42, 0.55

    def foot(ph, r, yaw):
        if ph < duty:
            u = ph / duty
            return (r, stride * (0.5 - u), yaw, 30 * max(0.0, (u - 0.6) / 0.4), 0.0)
        u = (ph - duty) / (1 - duty)
        e = u * u * (3 - 2 * u)
        return (r, stride * (-0.5 + e), yaw, 30 * (1 - u), 0.11 * math.sin(math.pi * u))

    def run(t):
        ph = (t / cyc) % 1.0
        bob = -0.02 * math.cos(4 * math.pi * ph)
        jit = 0.008 * math.sin(2 * math.pi * 23 * t)   # 地面を削ってがたつく
        return P(low, hip=(0.0, -0.24 + bob, 0.10), L=dict(shield_L, center_w=(-0.05, 0.50 + jit, 0.62)),
                 L_foot=foot(ph, -0.17, 5), R_foot=foot((ph + 0.5) % 1.0, 0.17, 12))
    t_run0, t_run1, end = 0.24, 1.24, 1.55
    head_keys = [(0.0, S2, None), (t_run0, plant, 'io')]
    tail_keys = [(t_run1, run(t_run1), None), (1.38, P(S2, hip=(0.0, -0.12, 0.04)), 'io'), (end, S2, 'io')]

    def fn(t):
        if t <= t_run0:
            return sample(head_keys, t)
        if t >= t_run1:
            return sample(tail_keys, t)
        w = min(1.0, (t - t_run0) / 0.12)                 # 構えから走りへ、少しずつ移る
        return mix(plant, run(t), w)
    return fn, end, stride * 2 / cyc


# ======================= まとめて作る =======================
def build(rig, has_shield, made_by_name, group=None):
    """返り値：[(ゲームの名前, action, 情報)]。made_by_name：今までに作った動き（名前 → action）"""
    out = []
    CARRY_NOW[0] = CARRY.get(group)
    base = ready(has_shield)
    # しゃがみ歩きの腰の高さ：しゃがみ（その場）の最初の姿に合わせる
    import bpy
    T = rig.T
    T.animation_data.action = made_by_name['crouch']
    bpy.context.scene.frame_set(0)
    crouch_hip = T.pose.bones['Hip'].head.z
    T.animation_data.action = None
    hip_u = (crouch_hip - rig.rest_h['Hip'].z) / rig.K + 0.03
    fn, dur, spd = crouch_walk_fn(hip_u, has_shield)
    out.append(make_clip(rig, 'crouch_walk', fn, dur, loop=True, speed=spd * rig.K))
    ku = prone_up_keys(has_shield)
    out.append(make_clip(rig, 'prone_up', lambda t: sample(ku, t), ku[-1][0]))
    for d, a in DIRS.items():
        k = hit_light_keys(base, a)
        out.append(make_clip(rig, f'hit_l_{d}', lambda t, k=k: sample(k, t), k[-1][0]))
        k, shift = hit_heavy_keys(base, a)
        name, act, meta = make_clip(rig, f'hit_h_{d}', lambda t, k=k: sample(k, t), k[-1][0])
        meta['shift'] = round(shift * rig.K, 4)
        out.append((name, act, meta))
        k, shift = stagger_keys(base, a, has_shield)
        name, act, meta = make_clip(rig, f'stagger_{d}', lambda t, k=k: sample(k, t), k[-1][0])
        meta['shift'] = round(shift * rig.K, 4)
        out.append((name, act, meta))
    if has_shield:
        for heavy, name in ((False, 'guard_l'), (True, 'guard_h')):
            k = guard_keys(heavy)
            out.append(make_clip(rig, name, lambda t, k=k: sample(k, t), k[-1][0]))
        for name, k in (('sb_bash', bash_keys()), ('sb_push', push_keys()), ('sb_parry', parry_keys())):
            out.append(make_clip(rig, name, lambda t, k=k: sample(k, t), k[-1][0]))
        fn, dur, spd = charge_fn()
        out.append(make_clip(rig, 'sb_charge', fn, dur, speed=spd * rig.K))
    # 這う・伏せ・伏せる：顔をまっすぐ前（水平）へ
    for n in ('crawl', 'prone', 'prone_down'):
        if n in made_by_name:
            level_head(rig, made_by_name[n], 0.0, 1.0)
    return out
