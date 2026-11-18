# 祓魔僧の神怒（專用技能・必殺。利用者の指示 2026-11-10）の動きを、Tripo の骨に直接付ける（Blender 4.2。build_character.py から呼ぶ開発用の道具）
#
#   胸の前で腕を交差させ、宙に浮き上がる。力を溜めて震え、腕を大きく広げて神の衝撃波を広く放つ（1.40 秒。ゲームが衝撃波を出す）。
#   しばらく宙に留まり、ゆっくり降りて着地する。鎚矛は右手に持ったまま（交差の間は柄を上へ立てる）
#   手と足の位置で体を動かす道具は ik_rig.py（向きの約束も、そこに書いてある）。構えは鎚矛の技（mace_moves.py の楯なし）と同じ
from ik_rig import *   # noqa: F401,F403
from mace_moves import stance, _R

RELEASE = 1.40   # 衝撃波を放つ時刻（秒）。js/game/data.js の WRATH.at と同じにする


def wrath_keys():
    S = stance(False)
    feet_in = {'L_foot': (-0.13, 0.0, 0, 0, 0), 'R_foot': (0.13, 0.0, 0, 0, 0)}
    # 胸の前で腕を交差：右の拳は左肩の前、左の拳は右肩の前。鎚矛の柄は上へ
    cross = P(S, hip=(0.0, -0.06, 0.0), hip_rot=(0, 4, 0), chest=(0, 6, 0), look=(0, 8), R_clav=6.0, L_clav=6.0,
              R=_R((-0.58, -0.08, 0.42), (-0.10, 0.95, 0.25), (0.9, -0.7, -0.2)),
              L={'wrist': (0.58, -0.04, 0.40), 'pole': (-0.9, -0.7, -0.2)}, **feet_in)
    # 浮き上がる：腰が上がり、脚は下へ垂れて、つま先が下を向く
    def floating(h, lift, chest=(0, 2, 0), look=(0, 0)):
        return P(cross, hip=(0.0, h, 0.0), chest=chest, look=look,
                 L_foot=(-0.12, -0.04, 0, 35, lift), R_foot=(0.12, -0.06, 0, 35, lift))
    rise1 = floating(0.25, 0.30)
    rise2 = floating(0.62, 0.66, chest=(0, -2, 0), look=(0, -4))
    shake1 = P(rise2, hip=(0.01, 0.64, 0.0), R={'grip': (-0.56, -0.06, 0.42)}, L={'wrist': (0.56, -0.02, 0.40)})
    shake2 = P(rise2, hip=(-0.01, 0.63, 0.0), R={'grip': (-0.60, -0.10, 0.41)}, L={'wrist': (0.60, -0.06, 0.39)})
    # 腕を大きく広げて放つ：胸を張り、顔を上げる
    spread = P(rise2, hip=(0.0, 0.72, 0.0), chest=(0, -14, 0), look=(0, -22), R_clav=14.0, L_clav=14.0,
               R=_R((0.92, 0.30, 0.18), (0.55, 0.80, 0.10), (0.4, -1, -0.4)),
               L={'wrist': (-0.92, 0.30, 0.18), 'pole': (-0.4, -1, -0.4)},
               L_foot=(-0.20, -0.06, -8, 35, 0.72), R_foot=(0.20, -0.08, 8, 35, 0.72))
    hover = P(spread, hip=(0.0, 0.66, 0.0), chest=(0, -8, 0), look=(0, -10))
    # 降りて着地（膝を曲げて受ける）
    land = P(S, hip=(0.0, -0.20, 0.0), hip_rot=(10, 10, 0), chest=(0, 8, 0), look=(0, 6),
             L_foot=(-0.18, 0.06, 6, 0, 0), R_foot=(0.18, -0.12, 30, 0, 0))
    return [(0.0, S, None), (0.35, cross, 'io'), (0.75, rise1, 'io'), (1.15, rise2, 'o'), (1.24, shake1, 'io'), (1.32, shake2, 'io'),
            (RELEASE, spread, 'i'), (1.58, hover, 'o'), (1.95, hover, 'io'), (2.35, land, 'i'), (2.70, S, 'io')]


# ===== 奇跡（利用者の指示 2026-11-17。左手に護符を持って唱える。js/game/data.js の MIRACLES の clip・time・at と同じにする） =====
#   1 回目：治癒 cl_pray・蘇生 cl_bless・光壁 cl_wall・淨炎 cl_flame・蘇る cl_rise。2 回目：天光柱 cl_heaven・聖火彈 cl_cast・神罰雷 cl_throw
#   護符は左の拳から鎖で下がる（ゲームが拳の位置 socket_L2 から垂らす）。唱える間は左手を胸・頭の上・前へ上げる

def _knees(p):
    """立っている姿勢の膝の向き（足の向き。ik_rig の決まりと同じ）を書き足す。膝をつく姿勢と混ぜてもなめらかにするため"""
    lf, rf = p['L_foot'], p['R_foot']
    return P(p, L_knee=rot_y((-0.12, 0, 1), lf[2]), R_knee=rot_y((0.12, 0, 1), rf[2]))


def _kneel_feet(p, both=False):
    """片膝（右膝）をつく：左足は前に平らに置き、右足はつま先立ちで後ろ。both：両膝をつく"""
    if both:
        return P(p, L_foot=(-0.13, -0.42, 0, 80, 0), R_foot=(0.13, -0.42, 0, 80, 0), L_knee=(0, -0.2, 1), R_knee=(0, -0.2, 1))
    return P(p, L_foot=(-0.17, 0.32, 6, 0, 0), R_foot=(0.15, -0.40, 4, 80, 0), L_knee=(-0.05, 0.1, 1), R_knee=(0.05, -0.35, 1))


def pray_keys():
    """治癒（cl_pray。1.3 秒、0.9 秒で効く）：護符を胸の前に寄せて頭を垂れて祈り、頭の上へ高く掲げる"""
    S = _knees(stance(False))
    low_mace = _R((0.26, -0.62, 0.30), (0.10, 0.80, 0.55))
    hold = P(S, hip=(0.0, -0.10, -0.02), hip_rot=(12, 4, 0), chest=(4, 14, 0), look=(0, 26), R=low_mace, L_clav=4.0,
             L={'wrist': (0.30, -0.06, 0.34), 'pole': (-1, -0.6, -0.2)})
    bow = P(hold, chest=(4, 18, 0), look=(0, 32), L={'wrist': (0.30, -0.02, 0.32)})
    raise_ = P(S, hip=(0.0, -0.04, 0.0), hip_rot=(10, 2, 0), chest=(2, -10, 0), look=(0, -28), R=low_mace, L_clav=16.0,
               L={'wrist': (0.18, 0.62, 0.36), 'pole': (-1, -0.2, -0.4)})
    held = P(raise_, chest=(2, -12, 0), look=(0, -32), L={'wrist': (0.18, 0.66, 0.34)})
    return [(0.0, S, None), (0.28, hold, 'io'), (0.55, bow, 'io'), (0.82, raise_, 'o'), (1.02, held, 'io'), (1.30, S, 'io')]


def bless_keys():
    """蘇生（cl_bless。1.6 秒、1.1 秒で効く）：鎚矛を地に立てて片膝をつき、護符を額に当てて祈る。顔と護符を上げて加護を受け、立つ"""
    S = _knees(stance(False))
    planted = _R((0.40, -0.70, 0.40), (0.02, 1.0, 0.05))
    kneel = _kneel_feet(P(S, hip=(0.0, -0.44, 0.02), hip_rot=(4, 10, 0), chest=(0, 16, 0), look=(0, 30), R=planted, L_clav=6.0,
                          L={'wrist': (0.24, 0.10, 0.22), 'pole': (-1, -0.4, -0.3)}))
    deep = P(kneel, chest=(0, 22, 0), look=(0, 38), L={'wrist': (0.24, 0.08, 0.20)})
    lift = P(kneel, chest=(0, -8, 0), look=(0, -26), L_clav=14.0, L={'wrist': (0.20, 0.56, 0.34), 'pole': (-1, -0.2, -0.4)})
    rise = _knees(P(S, hip=(0.0, -0.20, 0.04), hip_rot=(8, 12, 0), chest=(2, 6, 0), look=(0, 0), R=planted,
                    L={'wrist': (0.0, -0.20, 0.40), 'pole': (-1, -0.8, 0)}, L_foot=(-0.17, 0.25, 6, 0, 0), R_foot=(0.17, -0.25, 30, 30, 0)))
    return [(0.0, S, None), (0.42, kneel, 'io'), (0.82, deep, 'io'), (1.10, lift, 'o'), (1.36, rise, 'io'), (1.60, S, 'io')]


def wall_keys():
    """光壁（cl_wall。0.9 秒、0.55 秒で効く）：左手の護符を胸へ引き、一歩踏み込んで前へ突き出し、右へ払って壁を広げる"""
    S = _knees(stance(False))
    R0 = S['R']
    draw = P(S, hip=(0.0, -0.10, -0.06), hip_rot=(36, 4, 0), chest=(10, 4, 0), look=(-8, 2), L_clav=2.0,
             L={'wrist': (0.10, -0.16, 0.18), 'pole': (-1, -0.7, -0.2)})
    thrust = P(S, hip=(0.0, -0.14, 0.12), hip_rot=(-6, 8, 0), chest=(-8, 6, 0), look=(0, 0), L_clav=10.0, R=R0,
               L={'wrist': (0.08, 0.12, 0.98), 'pole': (-1, -0.4, 0)}, L_foot=(-0.20, 0.30, 6, 0, 0))
    sweep = P(thrust, chest=(-18, 6, 0), look=(10, 0), L={'wrist': (0.50, 0.12, 0.84)})
    return [(0.0, S, None), (0.20, _knees(draw), 'io'), (0.45, _knees(thrust), 'o'), (0.58, _knees(P(thrust, L={'wrist': (0.12, 0.14, 0.99)})), 'io'),
            (0.70, _knees(sweep), 'io'), (0.90, S, 'io')]


def flame_keys():
    """淨炎（cl_flame。1.1 秒、0.7 秒で効く）：鎚矛を顔の前に立て、左手の護符で柄の下から頭へなで上げる。払って構えへ戻る"""
    S = _knees(stance(False))
    upright = _R((-0.06, -0.20, 0.46), (0.0, 1.0, 0.12), (0.6, -1, -0.2))
    present = P(S, hip=(0.0, -0.08, 0.0), hip_rot=(14, 4, 0), chest=(6, 4, 0), look=(0, 8), R=upright, R_clav=4.0, L_clav=4.0,
                L={'wrist': (0.38, -0.20, 0.44), 'pole': (-1, -0.7, -0.1)})
    stroke = P(present, look=(0, -6), L_clav=10.0, L={'wrist': (0.38, 0.30, 0.46), 'pole': (-1, -0.4, -0.1)})
    flick = P(S, hip=(0.0, -0.10, 0.04), hip_rot=(20, 6, 0), chest=(8, 6, 0), look=(0, 4),
              R=_R((0.30, -0.30, 0.55), (0.30, 0.85, 0.40)), L={'wrist': (-0.20, 0.10, 0.55), 'pole': (-1, -0.6, 0)})
    return [(0.0, S, None), (0.30, present, 'io'), (0.42, present, 'io'), (0.70, stroke, 'o'), (0.84, _knees(flick), 'io'), (1.10, S, 'io')]


def rise_keys():
    """蘇る（cl_rise。1.9 秒）：崩れて両膝をついた姿から、光を受けて顔を上げ、腕を広げて立ち上がる"""
    S = _knees(stance(False))
    slump = _kneel_feet(P(S, hip=(0.0, -0.56, 0.06), hip_rot=(0, 16, 0), chest=(0, 30, 0), look=(0, 50),
                          R=_R((0.28, -0.88, 0.30), (0.4, -0.2, 0.9)), L={'wrist': (-0.06, -0.86, 0.24), 'pole': (-1, -0.6, 0)}), both=True)
    stir = P(slump, chest=(0, 22, 0), look=(0, 30))
    open_ = _kneel_feet(P(S, hip=(0.0, -0.46, 0.02), hip_rot=(0, 4, 0), chest=(0, -10, 0), look=(0, -24), R_clav=12.0, L_clav=12.0,
                          R=_R((0.66, 0.06, 0.40), (0.55, 0.80, 0.20), (0.4, -1, -0.4)),
                          L={'wrist': (-0.66, 0.10, 0.40), 'pole': (-0.4, -1, -0.4)}))
    stand = _knees(P(S, hip=(0.0, -0.08, 0.0), chest=(0, -6, 0), look=(0, -10), R_clav=8.0, L_clav=8.0,
                     R=_R((0.55, -0.10, 0.45), (0.45, 0.85, 0.25)), L={'wrist': (-0.45, -0.05, 0.45), 'pole': (-1, -0.8, 0)}))
    return [(0.0, slump, None), (0.45, stir, 'io'), (0.95, open_, 'io'), (1.45, stand, 'io'), (1.90, S, 'io')]


# ===== 奇跡の 2 回目（2026-11-17。飛ばす・落とす奇跡） =====

def heaven_keys():
    """天光柱（cl_heaven。1.4 秒、1.0 秒で効く）：護符を天へ高く掲げて顔を上げ、力を込めてから、前の地面へ振り下ろして指し示す"""
    S = _knees(stance(False))
    low_mace = _R((0.28, -0.60, 0.30), (0.12, 0.80, 0.55))
    lift = P(S, hip=(0.0, -0.06, 0.0), hip_rot=(8, 0, 0), chest=(0, -12, 0), look=(0, -34), R=low_mace, L_clav=20.0,
             L={'wrist': (0.06, 0.92, 0.12), 'pole': (-1, -0.1, -0.2)})
    hold = P(lift, chest=(0, -16, 0), look=(0, -40), L={'wrist': (0.04, 0.96, 0.10)})
    point = P(S, hip=(0.0, -0.14, 0.10), hip_rot=(-4, 10, 0), chest=(-4, 12, 0), look=(0, 12), R=low_mace, L_clav=6.0,
              L={'wrist': (0.06, -0.05, 0.98), 'pole': (-1, -0.6, 0)}, L_foot=(-0.20, 0.28, 6, 0, 0))
    return [(0.0, S, None), (0.38, lift, 'o'), (0.80, hold, 'io'), (1.00, _knees(point), 'i'), (1.15, _knees(point), 'io'), (1.40, S, 'io')]


def cast_keys():
    """聖火彈（cl_cast。0.9 秒、0.5 秒で効く）：護符を胸へ引き寄せて溜め、一歩踏み込んで前へ突き出し、火の玉を放つ"""
    S = _knees(stance(False))
    R0 = S['R']
    gather = P(S, hip=(0.0, -0.12, -0.08), hip_rot=(40, 6, 0), chest=(12, 8, 0), look=(-10, 4), L_clav=2.0,
               L={'wrist': (0.22, -0.12, 0.20), 'pole': (-1, -0.7, -0.2)})
    push = P(S, hip=(0.0, -0.16, 0.16), hip_rot=(-10, 10, 0), chest=(-10, 8, 0), look=(0, 2), L_clav=12.0, R=R0,
             L={'wrist': (0.14, 0.04, 1.0), 'pole': (-1, -0.5, 0)}, L_foot=(-0.20, 0.34, 6, 0, 0))
    return [(0.0, S, None), (0.26, _knees(gather), 'io'), (0.48, _knees(push), 'o'), (0.62, _knees(P(push, L={'wrist': (0.14, 0.06, 0.98)})), 'io'),
            (0.90, S, 'io')]


def throw_keys():
    """神罰雷（cl_throw。1.0 秒、0.62 秒で効く）：左手を後ろ上へ振りかぶって体をひねり、右足を踏み出して投げ下ろすように雷の槍を投げる"""
    S = _knees(stance(False))
    low_mace = _R((0.30, -0.55, 0.40), (0.15, 0.80, 0.55))
    wind = P(S, hip=(0.0, -0.10, -0.10), hip_rot=(-48, 2, 0), chest=(-22, -6, 0), look=(30, -4), R=low_mace, L_clav=18.0,
             L={'wrist': (-0.30, 0.50, -0.40), 'pole': (-1, -0.2, 0.4)}, L_foot=(-0.22, 0.05, 20, 0, 0), R_foot=(0.18, -0.30, 50, 0, 0))
    cock = P(wind, chest=(-26, -10, 0), L={'wrist': (-0.32, 0.56, -0.46)})
    release = P(S, hip=(0.0, -0.16, 0.14), hip_rot=(30, 12, 0), chest=(20, 14, 0), look=(-10, 6), R=low_mace, L_clav=8.0,
                L={'wrist': (0.20, 0.30, 0.92), 'pole': (-1, -0.4, 0)}, L_foot=(-0.20, 0.0, 20, 40, 0), R_foot=(0.20, 0.30, 10, 0, 0))
    follow = P(release, chest=(30, 22, 0), L={'wrist': (0.45, -0.30, 0.60), 'pole': (-1, -0.8, 0)})
    return [(0.0, S, None), (0.30, _knees(wind), 'io'), (0.48, _knees(cock), 'io'), (0.62, _knees(release), 'i'), (0.76, _knees(follow), 'o'),
            (1.00, S, 'io')]


def build(rig):
    """神怒と奇跡の動きを作る。返り値：[(ゲームの名前, action, 情報)]"""
    out = []
    for name, fn in (('cl_ult', wrath_keys), ('cl_pray', pray_keys), ('cl_bless', bless_keys), ('cl_wall', wall_keys),
                     ('cl_flame', flame_keys), ('cl_rise', rise_keys), ('cl_heaven', heaven_keys), ('cl_cast', cast_keys),
                     ('cl_throw', throw_keys)):
        k = fn()
        out.append(make_clip(rig, name, lambda t, k=k: sample(k, t), k[-1][0]))
    return out
