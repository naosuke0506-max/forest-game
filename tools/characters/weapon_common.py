# 鎚矛・戰鎚・長柄鎚・短劍の技で共通に使う道具（Blender 4.2。*_moves.py から使う開発用の道具）
#
#   tremble：溜めている間の震え／spin：その場で回る技（足は回る中心のまわりに置き直す）
#   blunt_assassin_keys：鈍器（鎚矛・戰鎚・長柄鎚）の暗殺（背後から）。相手の右肩へ振り下ろし、跪いた相手の頭へ返しで振り下ろす
#   向きの約束・姿勢の書き方は ik_rig.py
import math
from ik_rig import *   # noqa: F401,F403

# 鈍器の暗殺の時刻（秒）：肩を打つ・頭を打つ（ここで倒す）・動きの長さ。
# される側の動き（body_moves.py の as_blunt_v。全キャラ同じ）と、鎚矛・戰鎚・長柄鎚の動きは、この時刻にそろえる
AS_BLUNT = {'shoulder': 0.45, 'head': 1.30, 'time': 2.20}


# 模型の大きさ（打擊騎士で測った。どのキャラもほぼ同じ）：肩幅の半分・腕の長さ（肩から手首）。m
SH_HALF, AR_M = 0.182, 0.361


def hd(a, e=0.0):
    """胸から見た向き：a 度（前 0・右が正）、e 度（上が正）"""
    a, e = math.radians(a), math.radians(e)
    return (math.sin(a) * math.cos(e), math.sin(e), math.cos(a) * math.cos(e))


def two_hand(mid, d, yaw=0.0, hilt=0.30, pole=(0.6, -1, -0.2), roll=0.0):
    """両手持ちの右手の書き方：両手の真ん中 mid（m。両肩の真ん中から、胸の向きで 右・上・前）と柄の向き d（胸の向き。頭の側）から、
    右手の持ち手の点（右肩から・腕の長さの割合）と柄の向きを、動きの座標で出す。yaw：胸の向き（度。腰の向き＋胸のひねり）。
    左手は柄の上の hilt m 後ろ（ik_rig.py の hilt・grip2）。両手を体の正面に置くので、左手も届く（この模型は腕が短い）"""
    dn = Vector(d).normalized()
    rh = Vector(mid) + dn * (abs(hilt) / 2) - Vector((SH_HALF, 0, 0))
    return {'grip': rot_y(tuple(rh / AR_M), yaw), 'blade': rot_y(tuple(dn), yaw), 'edge': (0, 0, 1),
            'pole': rot_y(pole, yaw), 'auto': 1.0, 'roll': roll}


def tremble(C, t, amp=0.006, f1=9.0, f2=14.0):
    """溜めている間：武器がわずかに震え、息で上下する（C の右手は grip で書く）"""
    tr = amp * math.sin(2 * math.pi * f1 * t) + amp * 0.66 * math.sin(2 * math.pi * f2 * t + 0.7)
    br = 0.008 * math.sin(2 * math.pi * t)
    g = C['R']['grip']
    return P(C, hip=(C['hip'][0], C['hip'][1] + br, C['hip'][2]), R={'grip': (g[0] + tr, g[1] + tr * 0.4, g[2] - tr * 0.3)})


def spin(base, y0, center, feet0, yaw, arm, lift=None, hip_u=-0.18, pitch=10, chest=(0, 4, 0), look_lead=0.0):
    """その場で回る姿：体を yaw 度（右回りが正）に向け、足を回る中心 center のまわりに回して置く。arm は胸から見た右手"""
    d = yaw - y0
    out = P(base, hip=(center[0], hip_u, center[1]), hip_rot=(yaw, pitch, 0), chest=chest, look=(yaw + chest[0] + look_lead, 4))
    for s in 'RL':
        r, f, fy, heel, _ = (list(feet0[s]) + [0, 0, 0])[:5]
        rr, _, ff = rot_y((r - center[0], 0, f - center[1]), d)
        up = (lift or {}).get(s, 0.0)
        out[s + '_foot'] = (center[0] + rr, center[1] + ff, fy + d, heel if not up else 20, up)
    R = dict(out['R'])
    R.update(chest_arm(arm, yaw + chest[0]))
    out['R'] = R
    return out


def m_of(v, K):
    """骨の空間の点 → 地面の上の点（右 m, 上 m, 前 m）"""
    return (-v.x / K, v.z / K, -v.y / K)


def to_world_grip(rig, pose):
    """右手の持ち手の点を、肩から（grip）の書き方から、地面の上の点（grip_w）の書き方に直す（ほかはそのまま）"""
    if 'grip' not in pose['R']:
        return pose
    _, H = rig.solve(pose)
    g = H['R_Upperarm'] + V(*pose['R']['grip']) * rig.AR
    out = dict(pose)
    R = {k: v for k, v in pose['R'].items() if k != 'grip'}
    R['grip_w'] = m_of(g, rig.K)
    out['R'] = R
    return out


def victim_targets(rig, gap):
    """暗殺される側（as_blunt_v）の、肩を打つ時刻の右肩の上と、頭を打つ時刻の頭の上（この動きの座標。相手は gap m 前に背を向けて立つ）"""
    import body_moves
    keys = body_moves.as_blunt_v_keys(False)
    _, H1 = rig.solve(sample(keys, AS_BLUNT['shoulder']))
    _, H2 = rig.solve(sample(keys, AS_BLUNT['head']))
    sh = m_of(H1['R_Upperarm'], rig.K)
    hd = m_of(H2['Head'], rig.K)
    return (sh[0] + 0.03, sh[1] + 0.07, sh[2] + gap), (hd[0], hd[1] + 0.16, hd[2] + gap)


def with_world_R(pose, base_R, **kw):
    """右手を地面の上の点（grip_w）で書いた姿勢（ほかの書き方は base_R のまま。grip は外す）"""
    out = dict(pose)
    R = {k: v for k, v in base_R.items() if k != 'grip'}
    R.update(kw)
    out['R'] = R
    return out


def aim_two_hand(rig, pose, target, h, reach, mid):
    """両手持ちで target（地面の上の点 m）を打つ姿勢：両手の真ん中を、両肩の真ん中から mid（m）の所に置き、
    そこから target へ向けた柄の先（h + reach m 先）が target に届くよう、腰を前後へずらす。返り値：(姿勢, 右手の持ち手の点, 柄の向き)"""
    tgt = Vector(target)
    out = pose
    for _ in range(2):
        _, H = rig.solve(out)
        sm = (Vector(m_of(H['R_Upperarm'], rig.K)) + Vector(m_of(H['L_Upperarm'], rig.K))) / 2
        M = sm + Vector(mid)
        dv = tgt - M
        flat2 = (h + reach) ** 2 - dv.x ** 2 - dv.y ** 2
        want_f = tgt.z - math.sqrt(max(0.01, flat2))
        hip = out['hip']
        out = P(out, hip=(hip[0], hip[1], hip[2] + (want_f - M.z)))
    _, H = rig.solve(out)
    sm = (Vector(m_of(H['R_Upperarm'], rig.K)) + Vector(m_of(H['L_Upperarm'], rig.K))) / 2
    M = sm + Vector(mid)
    d = (tgt - M).normalized()
    return out, tuple(M + d * h), tuple(d)


def blunt_assassin_keys(rig, S, gap, reach, left, raise1_R=None, raise2_R=None, two=None):
    """（two：両手持ちのとき (両手の間の半分 m, 肩を打つときの両手の真ん中, 頭を打つときの両手の真ん中, (打つときの腰と胸の向き))。
    打つときは、両手の真ん中から相手へ柄を向け、届くように踏み込みを合わせる。両手の真ん中は地面の上の向きで書く）"""
    """鈍器の暗殺（背後から）：右肩の上へ振りかぶり、相手の右肩へ斜めに振り下ろす。跳ね返った武器を返して頭上へ振り上げ、
    跪いた相手の頭へ真上から振り下ろす（ここで倒す）。
    S：構え（右手は grip・blade・auto で書く）、gap：相手の立つ所（前 m）、reach：持ち手の点から打つ所までの長さ（m）、
    left：左手の書き方 {'guard', 'high', 'low'}（楯・拳・両手持ちの左手）"""
    sh, hdp = victim_targets(rig, gap)
    T = AS_BLUNT
    raise1 = P(S, hip=(0.0, -0.06, -0.02), hip_rot=(38, 2, 0), chest=(12, -8, 0), look=(-6, 10), R_clav=10.0, L=left['high'],
               R=raise1_R or {'grip': (0.30, 0.72, 0.02), 'blade': (0.30, 0.45, -0.84), 'pole': (1, 0.2, -0.3)})
    b1 = Vector((-0.22, -0.50, 0.84)).normalized()      # 肩を打つ向き（右上から左下へ、少し前へ）
    hy, cy = two[3] if two else (4, -4)   # 打つときの腰と胸の向き（両手持ちは左へひねり、柄頭を体の左へ逃がす）
    hit1 = with_world_R(P(S, hip=(0.0, -0.12, 0.10), hip_rot=(hy, 14, 0), chest=(cy, 10, 0), look=(-hy - cy, 14), R_clav=2.0, L=left['low']), S['R'],
                        grip_w=tuple(s - b * reach for s, b in zip(sh, b1)), blade=tuple(b1), pole=(0.6, -1, -0.2))
    if two:
        hit1, g1, d1 = aim_two_hand(rig, hit1, sh, two[0], reach, two[1])
        hit1['R'] = dict(hit1['R'], grip_w=g1, blade=d1)
    g1 = hit1['R']['grip_w']
    bounce = P(hit1, hip=(hit1['hip'][0], hit1['hip'][1] + 0.01, hit1['hip'][2] - 0.02),
               R={'grip_w': (g1[0] + 0.02, g1[1] + 0.10, g1[2] - 0.04), 'blade': (-0.15, -0.20, 0.97)})
    # 返し：跳ね返った武器を、そのまま頭上へ振り上げる（右足を少し前へ）
    raise2 = P(S, hip=(0.0, -0.08, 0.12), hip_rot=(14, -4, 0), chest=(4, -10, 0), look=(0, 16), R_clav=14.0, L_clav=8.0, L=left['high'],
               R=raise2_R or {'grip': (0.10, 0.86, 0.02), 'blade': (0.08, 0.35, -0.93), 'pole': (1, 0.3, -0.2)},
               R_foot=(0.20, 0.0, 30, 0, 0))
    b2 = Vector((0.0, -0.78, 0.62)).normalized()        # 頭を打つ向き（真上から、少し前へ）
    hit2 = with_world_R(P(S, hip=(0.0, -0.22, 0.18), hip_rot=(hy + 2, 26, 0), chest=(cy + 4, 16, 0), look=(-hy - cy - 6, 30), R_clav=2.0, L_clav=2.0, L=left['low'],
                          R_foot=(0.20, 0.02, 30, 10, 0)), S['R'],
                        grip_w=tuple(h - b * reach for h, b in zip(hdp, b2)), blade=tuple(b2), pole=(0.5, -1, 0))
    if two:
        hit2, g2, d2 = aim_two_hand(rig, hit2, hdp, two[0], reach, two[2])
        hit2['R'] = dict(hit2['R'], grip_w=g2, blade=d2)
    g2 = hit2['R']['grip_w']
    follow = P(hit2, hip=(hit2['hip'][0], hit2['hip'][1] - 0.02, hit2['hip'][2] + 0.01),
               R={'grip_w': (g2[0], g2[1] - 0.08, g2[2] + 0.04), 'blade': (0.0, -0.90, 0.44)})
    back = P(S, hip=(0.0, -0.10, 0.08), R_foot=(0.20, -0.10, 30, 0, 0.03))
    keys = [(0.0, S, None), (0.24, raise1, 'io'), (T['shoulder'], hit1, 'i'), (0.58, bounce, 'o'), (0.98, raise2, 'io'),
            (T['head'], hit2, 'i'), (1.45, follow, 'o'), (1.62, follow, 'l'), (1.95, back, 'io'), (T['time'], S, 'io')]
    # 右手の書き方を、どの姿勢も地面の上の点にそろえる（混ぜるとつなぎ目で跳ぶ）
    return [(t, to_world_grip(rig, p), e) for t, p, e in keys]
