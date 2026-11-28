# 操（属性強化の 2 段目。2026-11-28。js/game/controls.js・data.js の CONTROL）の専用の動きを、Tripo の骨に直接付ける
# （Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具。手と足の位置で体を動かす道具は ik_rig.py）
#
#   sh_whip（楯劍騎士「水鞭」1.0 秒）：体を右へ開いて剣を右の後ろへ引き、0.42 秒で右から左へ水平に大きく振り抜く
#     （剣の先から水の鞭が伸びる＝見た目は render/ult-hero-fx.js）。楯は体の前に構えたまま
#   sp_wall（長柄騎士「岩壁」0.9 秒）：槍を両手で胸の前へ持ち上げ、0.5 秒で前の地面へ斜めに突き立てる（前に岩の壁が立ち上がる）。押さえてから引き抜く
#   bw_gale（弓兵「旋風」0.8 秒）：身を沈めて両手を左下へ集め、体をひねりながら右上へ振り上げ、0.35 秒で両腕を左右へ大きく広げる（まわりに旋風）
#   劍騎士の雷步は動きを作らない（稲妻の姿で体は見えない）。打擊騎士の爆炎は今ある叩きつけの動き（mc_c2・wh_cut3・lc_cut1）を使う
from ik_rig import *   # noqa: F401,F403
from onehand_moves import STANCE as SWORD_STANCE
from ult_moves import SPW, _SP0, _bow_pose

WHIP_AT, WHIP_TIME = 0.42, 1.0     # data.js の CONTROL.shield の at・time
WALL_AT, WALL_TIME = 0.5, 0.9      # CONTROL.polearm
GALE_AT, GALE_TIME = 0.35, 0.8     # CONTROL.archer


# ======================= 楯劍騎士「水鞭」 =======================
def whip_keys():
    S = SWORD_STANCE
    # 体を右へ開き、剣を右の後ろへ引く（刃は外）
    wind = P(S, hip=(0.0, -0.16, -0.04), hip_rot=(52, 10, 0), chest=(14, 4, 0), look=(0, 4), R_clav=8.0,
             R={'grip': (0.58, -0.04, -0.16), 'blade': (0.45, 0.25, -0.86), 'edge': (0.86, 0.05, 0.45), 'pole': (0.9, -0.5, -0.4)},
             L={'wrist': (-0.05, -0.40, 0.62), 'normal': (-0.2, 0, 1)})
    # 右の横を通る（刃は前）
    mid = P(wind, hip=(0.0, -0.18, 0.04), hip_rot=(30, 11, 0), chest=(4, 4, 0),
            R={'grip': (0.66, -0.08, 0.42), 'blade': (0.95, -0.02, 0.30), 'edge': (-0.30, 0, 0.95), 'pole': (0.6, -1, -0.3)})
    # 前を水平に払う（ここで水の鞭が伸びる）。左足を少し踏み込む
    hit = P(S, hip=(0.0, -0.20, 0.14), hip_rot=(2, 12, 0), chest=(-6, 4, 0), look=(0, 4), R_clav=4.0,
            R={'grip': (0.24, -0.10, 0.88), 'blade': (0.28, -0.02, 0.96), 'edge': (-0.96, 0, 0.28), 'pole': (0.3, -1, -0.2)},
            L={'wrist': (-0.30, -0.42, 0.48), 'normal': (-0.6, 0, 0.8)},
            L_foot=(-0.22, 0.30, 6, 0, 0), R_foot=(0.20, -0.28, 40, 10, 0))
    # 左へ振り抜く
    follow = P(hit, hip=(0.0, -0.19, 0.12), hip_rot=(-34, 12, 0), chest=(-14, 6, 0), look=(-8, 6),
               R={'grip': (-0.42, -0.20, 0.72), 'blade': (-0.85, -0.10, 0.50), 'edge': (-0.50, 0, -0.85), 'pole': (0.3, -1, 0.2)})
    hold = P(follow, hip=(0.0, -0.17, 0.10), hip_rot=(-30, 11, 0))
    back = P(S, hip=(0.0, -0.10, 0.05))
    return [(0.0, S, None), (0.24, wind, 'io'), (0.35, mid, 'i'), (WHIP_AT, hit, 'l'), (0.54, follow, 'o'), (0.72, hold, 'io'),
            (0.88, back, 'io'), (WHIP_TIME, S, 'io')]


# ======================= 長柄騎士「岩壁」 =======================
def wall_keys():
    S = SPW(_SP0, 16, (6, 4, 0), (0.06, -0.18, 0.28), (8, 45))
    # 槍を胸の前へ持ち上げる（穂先は前の上）
    lift = SPW(S, 4, (0, -6, 0), (0.02, 0.16, 0.24), (0, 30), hip=(0.0, -0.06, -0.06), pitch=-4, look=(0, -2), R_clav=10.0, L_clav=10.0)
    # 前の地面へ斜めに突き立てる：腰を落とし、左足を踏み込む
    strike = SPW(S, 0, (0, 16, 0), (0.0, -0.18, 0.30), (0, -50), hip=(0.0, -0.30, 0.22), pitch=18, look=(0, 20), R_clav=0.0, L_clav=0.0,
                 L_foot=(-0.28, 0.42, 4, 0, 0), R_foot=(0.26, -0.24, 24, 20, 0))
    press = P(strike, hip=(0.0, -0.33, 0.23))
    # 引き抜いて構えへ
    pull = SPW(S, 8, (2, 4, 0), (0.02, -0.05, 0.28), (0, -10), hip=(0.0, -0.16, 0.08), pitch=8, look=(0, 6))
    return [(0.0, S, None), (0.22, lift, 'io'), (0.38, P(lift, hip=(0.0, -0.02, -0.08)), 'io'), (WALL_AT, strike, 'i'), (0.62, press, 'o'),
            (0.76, pull, 'io'), (WALL_TIME, S, 'io')]


# ======================= 弓兵「旋風」 =======================
def gale_keys():
    stand = _bow_pose((0.0, -0.05, 0.0), (0, 4, 0, 0), (0, 3, 0), (0, 0), (0.10, -0.75, 0.30), (0.05, -0.80, 0.20),
                      (-0.16, 0.05, 0, 0, 0, 0), (0.16, -0.05, 6, 0, 0, 0), lpole=(-0.8, -1, -0.2), rpole=(0.5, -1, -0.4))
    wide_l, wide_r = (-0.30, 0.10, -10, 0, 0, 0), (0.30, -0.10, 20, 0, 0, 0)
    # 身を沈めて、両手を左下へ集める（体を左へひねる）
    gather = _bow_pose((0.0, -0.24, 0.0), (-30, 10, 0, 0), (-20, 8, 0), (0, 8), (-0.55, -0.40, 0.45), (-0.30, -0.45, 0.60),
                       wide_l, wide_r, lpole=(-0.6, -1, 0.2), rpole=(0.4, -1, -0.4))
    # ひねりながら右上へ振り上げる
    sweep = _bow_pose((0.0, -0.14, 0.0), (22, 0, 0, 0), (12, -4, 0), (0, -4), (0.30, 0.55, 0.60), (0.58, 0.42, 0.32),
                      wide_l, wide_r, lpole=(-0.2, -1, -0.4), rpole=(0.6, -1, -0.3))
    # 両腕を左右へ大きく広げる（まわりに旋風）
    burst = _bow_pose((0.0, -0.10, 0.0), (0, -4, 0, 0), (0, -10, 0), (0, -10), (-0.95, 0.26, 0.10), (0.95, 0.26, 0.10),
                      wide_l, wide_r, lpole=(-0.3, -1, -0.3), rpole=(0.3, -1, -0.3))
    hold = P(burst, hip=(0.0, -0.13, 0.0), L={'wrist': (-0.92, 0.18, 0.14)}, R={'wrist': (0.92, 0.18, 0.14)})
    return [(0.0, stand, None), (0.16, gather, 'io'), (0.28, sweep, 'i'), (GALE_AT, burst, 'o'), (0.52, hold, 'io'), (GALE_TIME, stand, 'io')]


def build(rig, name):
    """その人物の操の専用の動きを作る。返り値：[(ゲームの名前, action, 情報)]"""
    out = []
    if name == 'shield':
        k = whip_keys(); out.append(make_clip(rig, 'sh_whip', lambda t, k=k: sample(k, t), WHIP_TIME))
    if name == 'polearm':
        k = wall_keys(); out.append(make_clip(rig, 'sp_wall', lambda t, k=k: sample(k, t), WALL_TIME))
    if name == 'archer':
        k = gale_keys(); out.append(make_clip(rig, 'bw_gale', lambda t, k=k: sample(k, t), GALE_TIME))
    return out
