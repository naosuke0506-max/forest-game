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


def build(rig):
    """神怒の動きを作る。返り値：[(ゲームの名前, action, 情報)]"""
    k = wrath_keys()
    return [make_clip(rig, 'cl_ult', lambda t: sample(k, t), k[-1][0])]
