# 必殺技の専用の動き（2 回目。2026-11-25。利用者が決めた技の姿は js/game/data.js の ULTIMATES の desc）を、Tripo の骨に直接付ける
# （Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具。手と足の位置で体を動かす道具は ik_rig.py）
#
#   sh_ult（楯劍騎士「大海嘯」2.2 秒）：身を低くして楯を足もとへ下ろし（水を呼ぶ）、立ち上がりながら楯を頭上へ掲げる（表を空へ）。
#     1.25 秒で一番高く押し上げる（水があふれる。ULT_SPECS.shield.at と同じ）。剣は右の腰の横に下げたまま
#   ls_flash（劍騎士「雷霆一閃」の長劍の踏み込み斬り 1.3 秒）：体に戻ったら、腰を落として剣を右の腰の後ろへ水平に引く（居合の構え）。
#     0.42 秒で大きく前へ踏み込み、右後ろから左前へ水平に薙ぎ払う（ゲームが体を 11 m 前へ運ぶ）。振り抜いて残心。雙劍は前の奧義の交差滑斬を使う
#   bw_ult（弓兵「颶風一矢」2.4 秒）：足を大きく開いて体を横へ向け、大弓（ゲームが長弓を大きくする）を前へ突き出して、ゆっくり耳の後ろまで引き絞る。
#     1.45 秒で放ち（ULT_SPECS.archer.release と同じ）、反動で右手が後ろへはね、体が一歩下がる
from ik_rig import *   # noqa: F401,F403
from onehand_moves import STANCE as SWORD_STANCE
from longsword_moves import STANCE as LS_STANCE

SHIELD_AT = 1.25    # js/game/data.js の ULT_SPECS.shield.at
SHIELD_TIME = 2.2
FLASH_CUT = 0.42    # 長劍の踏み込み斬りの当たる所（ゲームは体に戻ってから 0.42 秒後に踏み込む＝ ULT_SPECS.sword.dash.at - stance）
BOW_RELEASE = 1.45  # ULT_SPECS.archer.release
BOW_TIME = 2.4


# ======================= 楯劍騎士「大海嘯」 =======================
def shield_keys():
    S = SWORD_STANCE
    low_sword = {'grip': (0.45, -0.72, 0.18), 'blade': (0.35, -0.55, 0.75), 'edge': (0.2, 0.75, -0.6), 'pole': (0.7, -1, -0.3)}
    # 身を低くして、楯を足もとの前へ下ろす（表を前の下へ）
    gather = P(S, hip=(0.0, -0.30, 0.04), hip_rot=(6, 22, 0), chest=(2, 16, 0), look=(0, 14),
               L={'wrist': (0.12, -0.72, 0.55), 'normal': (0.0, 0.35, 1), 'up': (0, 1, -0.3), 'pole': (-1, -0.5, -0.2)},
               R=dict(low_sword), L_foot=(-0.26, 0.16, 6, 0, 0), R_foot=(0.26, -0.14, 18, 0, 0))
    # 立ち上がりながら楯を胸の前へ
    rise = P(gather, hip=(0.0, -0.14, 0.02), hip_rot=(4, 4, 0), chest=(0, 0, 0), look=(0, -4),
             L={'wrist': (0.14, 0.25, 0.70), 'normal': (0.0, 0.70, 0.70), 'up': (0, 0.7, -0.7), 'pole': (-1, -0.3, -0.3)})
    # 楯を頭上へ掲げる（表を空へ）。胸を張り、顔を上げる
    raised = P(rise, hip=(0.0, -0.08, 0.0), hip_rot=(2, -4, 0), chest=(0, -10, 0), look=(0, -22), L_clav=14.0,
               L={'wrist': (0.16, 0.93, 0.22), 'normal': (0.0, 1.0, 0.18), 'up': (0, -0.18, 1), 'pole': (-1, 0.2, -0.4)})
    # 一番高く押し上げる（水があふれる）
    peak = P(raised, hip=(0.0, -0.03, 0.0), chest=(0, -14, 0), look=(0, -28), L_clav=18.0,
             L={'wrist': (0.14, 0.99, 0.16)}, L_foot=(-0.28, 0.14, 4, 0, 0), R_foot=(0.28, -0.12, 14, 0, 0))
    hold1 = P(peak, hip=(0.0, -0.05, 0.0), chest=(0, -12, 0), look=(0, -24))
    hold2 = P(peak, hip=(0.0, -0.06, 0.0), chest=(0, -11, 0), look=(0, -20), L={'wrist': (0.15, 0.96, 0.18)})
    down = P(S, hip=(0.0, -0.10, 0.0), L={'wrist': (0.05, 0.05, 0.66), 'normal': (-0.15, 0.3, 1), 'up': (0, 1, -0.3)})
    return [(0.0, S, None), (0.32, gather, 'io'), (0.80, rise, 'io'), (1.10, raised, 'o'), (SHIELD_AT, peak, 'o'),
            (1.55, hold1, 'io'), (1.85, hold2, 'io'), (2.05, down, 'io'), (SHIELD_TIME, S, 'io')]


# ======================= 劍騎士「雷霆一閃」（長劍の踏み込み斬り） =======================
def flash_keys():
    S = LS_STANCE
    # 居合の構え：腰を落とし、体を右へ開いて、剣を右の腰の後ろへ水平に引く（切っ先は後ろ）
    iai = P(S, hip=(0.0, -0.30, -0.04), hip_rot=(48, 14, 0), chest=(18, 10, 0), look=(-40, 4), R_clav=4.0,
            R={'grip': (0.38, -0.40, -0.08), 'blade': (0.15, -0.05, -1), 'edge': (0.95, 0.1, 0.0), 'pole': (0.9, -0.5, -0.4)},
            L_foot=(-0.24, 0.42, 0, 0, 0), R_foot=(0.24, -0.42, 40, 30, 0))
    coil = P(iai, hip=(0.0, -0.34, -0.08), hip_rot=(56, 18, 0), chest=(22, 12, 0), look=(-48, 6),
             R={'grip': (0.46, -0.36, -0.16)})
    # 踏み込んで、右後ろから左前へ水平に薙ぐ
    cut = P(S, hip=(-0.04, -0.34, 0.62), hip_rot=(-34, 16, 0), chest=(-16, 8, 0), look=(10, 4), R_clav=2.0,
            R={'grip': (-0.50, -0.12, 0.78), 'blade': (-0.85, 0.05, 0.50), 'edge': (-0.5, 0, -0.85), 'pole': (0.3, -1, 0.1)},
            L_foot=(-0.30, 0.95, -6, 0, 0), R_foot=(0.20, -0.10, 30, 40, 0))
    follow = P(cut, hip_rot=(-52, 12, 0), chest=(-24, 6, 0),
               R={'grip': (-0.82, -0.18, 0.22), 'blade': (-0.55, 0.12, -0.82), 'edge': (0.8, 0, -0.55), 'pole': (0.1, -1, 0.5)})
    zanshin = P(follow, hip=(-0.04, -0.30, 0.60), chest=(-20, 4, 0))
    back = P(S, hip=(0.0, -0.14, 0.30), L_foot=(-0.24, 0.60, 4, 0, 0.04), R_foot=(0.20, 0.10, 32, 10, 0.04))
    return [(0.0, iai, None), (0.30, coil, 'io'), (FLASH_CUT, cut, 'i'), (0.55, follow, 'o'), (0.90, zanshin, 'io'), (1.30, back, 'io')]


# ======================= 弓兵「颶風一矢」 =======================
def _bow_pose(hip, rot, chest, look, lw, rw, lf, rf, lpole=(-0.6, -0.8, -0.2), rpole=(0.7, -0.3, -0.8), cant=12):
    """弓を持つ姿：lw・rw は左右の手首（肩から。腕の長さを 1 として、体の向きの座標）。弓は左手で縦に（少し右へ傾ける cant 度）、弦は体の側"""
    import math
    c = math.radians(cant)
    return {'hip': hip, 'hip_rot': rot, 'chest': chest, 'look': look, 'look_k': 0.9,
            'R': {'wrist': rw, 'pole': rpole},
            'L': {'wrist': lw, 'pole': lpole, 'bow_up': (math.sin(c), math.cos(c), 0.0), 'bow_x': (0.0, 0.0, -1.0)},
            'R_clav': 0.0, 'L_clav': 0.0, 'L_foot': lf, 'R_foot': rf,
            'L_knee': (-0.12, 0, 1), 'R_knee': (0.12, 0, 1)}


def bow_keys():
    stand = _bow_pose((0.0, -0.05, 0.0), (0, 4, 0, 0), (0, 3, 0), (0, 0), (0.10, -0.75, 0.30), (0.05, -0.80, 0.20),
                      (-0.16, 0.05, 0, 0, 0, 0), (0.16, -0.05, 6, 0, 0, 0), lpole=(-0.8, -1, -0.2), rpole=(0.5, -1, -0.4))
    # 足を大きく開いて体を右へ開き、弓を前へ上げる
    setp = _bow_pose((0.0, -0.16, -0.02), (55, 2, 0, 0), (12, 0, 0), (-52, 0), (0.02, -0.10, 0.85), (-0.30, -0.25, 0.60),
                     (-0.30, 0.22, 10, 0, 0, 0), (0.30, -0.22, 70, 0, 0, 0))
    # 弓を突き出し、右手で弦をつかむ
    nock = _bow_pose((0.0, -0.18, -0.02), (66, 0, 0, 0), (14, -2, 0), (-64, 0), (0.02, 0.06, 0.98), (-0.42, 0.06, 0.80),
                     (-0.32, 0.24, 10, 0, 0, 0), (0.32, -0.24, 75, 0, 0, 0))
    # ゆっくり耳の後ろまで引き絞る（肘を高く後ろへ。少し反る）
    full = _bow_pose((0.0, -0.20, -0.06), (70, -4, 0, 0), (16, -6, 0), (-68, -2), (0.02, 0.08, 1.0), (-0.18, 0.16, 0.06),
                     (-0.34, 0.26, 10, 0, 0, 0), (0.34, -0.26, 78, 0, 0, 0), rpole=(0.6, 0.5, -1.0))
    tense = P(full, hip=(0.0, -0.21, -0.07), R={'wrist': (-0.15, 0.17, 0.02)})
    # 放つ：右手が後ろへはね、反動で体が下がる
    loose = _bow_pose((0.0, -0.18, -0.20), (72, -10, 0, 0), (18, -12, 0), (-68, -6), (0.04, 0.12, 1.0), (0.22, 0.20, -0.30),
                      (-0.34, 0.22, 10, 0, 0, 0), (0.34, -0.36, 78, 0, 0.04, 0), rpole=(0.6, 0.6, -1.0))
    after = P(loose, hip=(0.0, -0.17, -0.30), R_foot=(0.34, -0.52, 78, 0, 0, 0), L={'wrist': (0.03, 0.02, 0.96)})
    return [(0.0, stand, None), (0.30, setp, 'io'), (0.70, nock, 'io'), (1.30, full, 'io'), (1.40, tense, 'io'), (BOW_RELEASE, loose, 'l'),
            (1.75, after, 'o'), (2.10, P(after, L={'wrist': (0.06, -0.30, 0.80)}), 'io'), (BOW_TIME, stand, 'io')]


def build(rig, name):
    """その人物の必殺技の専用の動きを作る。返り値：[(ゲームの名前, action, 情報)]"""
    out = []
    if name == 'shield':
        k = shield_keys(); out.append(make_clip(rig, 'sh_ult', lambda t, k=k: sample(k, t), SHIELD_TIME))
    if name == 'sword':
        k = flash_keys(); out.append(make_clip(rig, 'ls_flash', lambda t, k=k: sample(k, t), k[-1][0]))
    if name == 'archer':
        k = bow_keys(); out.append(make_clip(rig, 'bw_ult', lambda t, k=k: sample(k, t), BOW_TIME))
    return out
