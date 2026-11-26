# 必殺技の専用の動き（2 回目。2026-11-25。利用者が決めた技の姿は js/game/data.js の ULTIMATES の desc）を、Tripo の骨に直接付ける
# （Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具。手と足の位置で体を動かす道具は ik_rig.py）
#
#   sh_ult（楯劍騎士「大海嘯」2.2 秒）：身を低くして楯を足もとへ下ろし（水を呼ぶ）、立ち上がりながら楯を頭上へ掲げる（表を空へ）。
#     1.25 秒で一番高く押し上げる（水があふれる。ULT_SPECS.shield.at と同じ）。剣は右の腰の横に下げたまま
#   ls_flash（劍騎士「雷霆一閃」の長劍の踏み込み斬り 1.3 秒）：体に戻ったら、腰を落として剣を右の腰の後ろへ水平に引く（居合の構え）。
#     0.42 秒で大きく前へ踏み込み、右後ろから左前へ水平に薙ぎ払う（ゲームが体を 11 m 前へ運ぶ）。振り抜いて残心。雙劍は前の奧義の交差滑斬を使う
#   bw_ult（弓兵「颶風一矢」2.4 秒）：足を大きく開いて体を横へ向け、大弓（ゲームが長弓を大きくする）を前へ突き出して、ゆっくり耳の後ろまで引き絞る。
#     1.45 秒で放ち（ULT_SPECS.archer.release と同じ）、反動で右手が後ろへはね、体が一歩下がる
#   （後半 2026-11-26）
#   sp_ult（長柄騎士「千岩槍獄」2.6 秒）：槍を両手で頭上へ振り上げ（穂先を下へ）、0.62 秒で地面へ深く突き立てる（ULT_SPECS.polearm.at）。
#     岩の槍が突き上がる間は、腰を落として槍を押さえ込み、1.85 秒の大きな岩の槍でさらに押し込む。引き抜いて構えに戻る
#   mc_ult・wh_ult・lc_ult（打擊騎士「紅蓮崩天」2.4 秒。鎚矛・戰鎚・長柄鎚）：武器を頭上へ振りかぶって身を沈め、0.42 秒で跳ぶ
#     （高さと前へ進むのはゲームが体を運ぶ＝見た目の高さ lift）。宙では脚を縮めて武器を背中まで反らし、落ちながら 1.30 秒で地面へ叩きつける（ULT_SPECS.blunt.at）
#   cl_gate（祓魔僧「天門開闢」3.0 秒）：胸の前で手を合わせ、浮き上がる（高さはゲーム）間は脚を垂らしてつま先を下へ。0.75 秒で腕を V の字に天へ上げて顔を上げ、
#     光の槍の間はそのまま。2.35 秒の光の柱で腕を大きく広げ、2.55〜2.95 秒で降りて膝で受ける
from ik_rig import *   # noqa: F401,F403
from onehand_moves import STANCE as SWORD_STANCE
from longsword_moves import STANCE as LS_STANCE
from weapon_common import two_hand, hd
import mace_moves
import warhammer_moves
import lucerne_moves

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


# ======================= 長柄騎士「千岩槍獄」（槍を両手で） =======================
SP_AT = 0.62        # ULT_SPECS.polearm.at（突き立てる）
SP_BIG = 1.85       # ULT_SPECS.polearm.big.at（大きな岩の槍）
SP_TIME = 2.6
SP_HILT = -0.38     # 左手は右手から石突きの側へ 0.38 m（右手は石突きから 0.6 m ほど＝js/render の槍は後ろ寄りを持つ）
SP_L2 = {'hilt': SP_HILT, 'grip2': 1.0, 'slide': 1.0, 'roll': 0.0, 'pole': (-0.6, -1, -0.3)}


def SPW(base, yaw, chest, mid, d, hip=None, pitch=None, pole=(0.6, -1, -0.2), lpole=(-0.6, -1, -0.3), **kw):
    """槍を両手で持つ姿勢（warhammer_moves.W2 と同じ書き方。d は穂先の向き：方位・仰角）"""
    yt = yaw + chest[0]
    out = P(base, hip_rot=(yaw, base['hip_rot'][1] if pitch is None else pitch, 0), chest=chest,
            R=two_hand(mid, hd(d[0] - yt, d[1]), yt, SP_HILT, pole), L=dict(SP_L2, pole=rot_y(lpole, yt)), **kw)
    if hip:
        out['hip'] = hip
    return out


_SP0 = {'hip': (0.0, -0.08, -0.02), 'hip_rot': (16, 6, 0), 'chest': (6, 4, 0), 'look': (0, 2), 'look_k': 0.9,
        'R': two_hand((0.06, -0.18, 0.28), hd(8, 45), hilt=SP_HILT), 'L': dict(SP_L2), 'R_clav': 0.0, 'L_clav': 0.0,
        'L_foot': (-0.20, 0.12, 8, 0, 0), 'R_foot': (0.20, -0.24, 30, 0, 0)}


def spear_keys():
    # 両手の真ん中 mid は、肩から腕の届く所（この模型は肩から手首まで 0.36 m）に書く。前は届かない所に書いて、頭上へ上がらなかった
    S = SPW(_SP0, 16, (6, 4, 0), (0.06, -0.18, 0.28), (8, 45))
    # 前へ倒しながら持ち上げる（穂先が前を通って下へ回る）
    swing = SPW(S, 6, (2, -2, 0), (0.02, 0.05, 0.28), (0, 5), hip=(0.0, -0.06, -0.02), pitch=0, look=(0, 0), R_clav=8.0, L_clav=8.0)
    # 頭上に振り上げる：穂先は下、両手は頭の上の前。胸を張る
    raised = SPW(S, 0, (0, -8, 0), (0.0, 0.28, 0.14), (0, -78), hip=(0.0, -0.02, -0.04), pitch=-4, pole=(0.8, 0.2, -0.4), lpole=(-0.8, 0.2, -0.4),
                 look=(0, -6), R_clav=18.0, L_clav=18.0, L_foot=(-0.24, 0.20, 6, 0, 0), R_foot=(0.24, -0.22, 26, 0, 0))
    # 突き立てる：腰を深く落とし、両手で真下へ（穂先は地面の中）
    plant = SPW(S, 0, (0, 18, 0), (0.0, -0.22, 0.27), (0, -74), hip=(0.0, -0.34, 0.16), pitch=22, pole=(0.6, -1, 0), lpole=(-0.6, -1, 0),
                look=(0, 26), R_clav=0.0, L_clav=0.0, L_foot=(-0.30, 0.36, 4, 0, 0), R_foot=(0.28, -0.26, 24, 20, 0))
    press1 = P(plant, hip=(0.0, -0.37, 0.17))
    press2 = P(plant, hip=(0.0, -0.33, 0.15))
    # 大きな岩の槍：さらに押し込んで顔を上げる
    push = SPW(plant, 0, (0, 22, 0), (0.0, -0.25, 0.27), (0, -78), hip=(0.0, -0.40, 0.18), pitch=26, pole=(0.6, -1, 0), lpole=(-0.6, -1, 0), look=(0, 6))
    # 引き抜く
    pull = SPW(S, 8, (2, 4, 0), (0.02, -0.05, 0.28), (0, -40), hip=(0.0, -0.16, 0.06), pitch=8, look=(0, 6))
    return [(0.0, S, None), (0.18, swing, 'io'), (0.40, raised, 'o'), (0.52, P(raised, hip=(0.0, 0.0, -0.05)), 'io'), (SP_AT, plant, 'i'),
            (0.80, press1, 'o'), (1.02, press2, 'io'), (1.26, press1, 'io'), (1.60, press2, 'io'), (SP_BIG, push, 'i'), (2.00, push, 'l'),
            (2.25, pull, 'io'), (SP_TIME, S, 'io')]


# ======================= 打擊騎士「紅蓮崩天」（跳んで叩きつける） =======================
BL_JUMP = 0.42      # ULT_SPECS.blunt.jump.from
BL_AT = 1.30        # ULT_SPECS.blunt.at（叩きつける）
BL_TIME = 2.4
TUCK = {'L_foot': (-0.18, 0.22, 8, 30, 0.30), 'R_foot': (0.18, -0.02, 24, 30, 0.34)}   # 宙で脚を縮める（膝を上げる）


def _slam_keys(S, over, coil, air, arch, swing, hit, impact):
    """跳んで叩きつける動きの並び（どの武器も同じ時刻）"""
    up = P(S, hip=(0.0, -0.18, 0.20), hip_rot=(S['hip_rot'][0] * 0.5, 14, 0))
    takeoff = P(coil, hip=(0.0, -0.02, 0.0), L_foot=(-0.20, 0.10, 8, 40, 0.04), R_foot=(0.20, -0.20, 30, 50, 0.06))
    return [(0.0, S, None), (0.20, over, 'io'), (0.36, coil, 'io'), (BL_JUMP + 0.04, takeoff, 'o'), (0.62, air, 'io'), (0.98, arch, 'io'),
            (1.16, swing, 'i'), (BL_AT, hit, 'l'), (1.40, impact, 'o'), (1.80, impact, 'l'), (2.08, up, 'io'), (BL_TIME, S, 'io')]


def warhammer_slam():
    W, S = warhammer_moves.W2, warhammer_moves.STANCE
    over = W(S, 18, (6, -12, 0), (0.16, 0.24, 0.08), (165, 40), hip=(0.0, -0.12, -0.04), pitch=-6, pole=(1, 0.3, -0.2), lpole=(-1, 0.3, -0.2),
             look=(0, 8), R_clav=16.0, L_clav=14.0)
    coil = W(over, 14, (4, -10, 0), (0.16, 0.23, 0.08), (165, 34), hip=(0.0, -0.26, -0.06), pitch=4, pole=(1, 0.3, -0.2), lpole=(-1, 0.3, -0.2))
    air = W(over, 4, (0, -10, 0), (0.06, 0.30, 0.02), (180, 25), hip=(0.0, 0.02, 0.0), pitch=-8, pole=(1, 0.3, -0.2), lpole=(-1, 0.3, -0.2),
            look=(0, 12), **TUCK)
    arch = W(air, 2, (0, -16, 0), (0.04, 0.32, -0.02), (180, 15), hip=(0.0, 0.03, -0.02), pitch=-12, pole=(1, 0.3, -0.2), lpole=(-1, 0.3, -0.2))
    swing = W(S, 0, (0, 4, 0), (0.02, 0.26, 0.30), (0, 75), hip=(0.0, -0.04, 0.10), pitch=10, pole=(0.8, 0, -0.2), lpole=(-0.8, 0, -0.2),
              L_foot=(-0.20, 0.30, 8, 10, 0.12), R_foot=(0.20, -0.05, 26, 10, 0.12))
    hit = W(S, -10, (-6, 18, 0), (-0.02, -0.26, 0.34), (0, -40), hip=(0.0, -0.42, 0.28), pitch=34, pole=(0.5, -1, 0), lpole=(-0.5, -1, 0),
            look=(0, 36), R_clav=0.0, L_clav=0.0, L_foot=(-0.24, 0.42, 8, 0, 0), R_foot=(0.22, 0.0, 30, 30, 0))
    impact = W(hit, -10, (-6, 18, 0), (-0.02, -0.28, 0.34), (0, -44), hip=(0.0, -0.45, 0.29), pitch=34, pole=(0.5, -1, 0), lpole=(-0.5, -1, 0))
    return _slam_keys(S, over, coil, air, arch, swing, hit, impact)


def lucerne_slam():
    W, S = lucerne_moves.W2, lucerne_moves.STANCE
    over = W(S, 10, (4, -12, 0), (0.12, 0.26, 0.06), (170, 38), hip=(0.0, -0.12, -0.04), pitch=-6, pole=(1, 0.3, -0.2), lpole=(-1, 0.3, -0.2),
             look=(0, 8), R_clav=16.0, L_clav=14.0, L_foot=(-0.22, 0.12, 6, 0, 0), R_foot=(0.22, -0.26, 28, 0, 0))
    coil = W(over, 8, (2, -10, 0), (0.12, 0.25, 0.06), (170, 32), hip=(0.0, -0.26, -0.06), pitch=4, pole=(1, 0.3, -0.2), lpole=(-1, 0.3, -0.2))
    air = W(over, 2, (0, -10, 0), (0.04, 0.30, 0.0), (180, 22), hip=(0.0, 0.02, 0.0), pitch=-8, pole=(1, 0.3, -0.2), lpole=(-1, 0.3, -0.2),
            look=(0, 12), **TUCK)
    arch = W(air, 0, (0, -16, 0), (0.03, 0.32, -0.03), (180, 12), hip=(0.0, 0.03, -0.02), pitch=-12, pole=(1, 0.3, -0.2), lpole=(-1, 0.3, -0.2))
    swing = W(S, 0, (0, 4, 0), (0.02, 0.26, 0.30), (0, 70), hip=(0.0, -0.04, 0.10), pitch=10, pole=(0.8, 0, -0.2), lpole=(-0.8, 0, -0.2),
              L_foot=(-0.20, 0.30, 8, 10, 0.12), R_foot=(0.20, -0.05, 26, 10, 0.12))
    hit = W(S, -6, (-4, 18, 0), (-0.02, -0.22, 0.34), (0, -26), hip=(0.0, -0.40, 0.26), pitch=32, pole=(0.5, -1, 0), lpole=(-0.5, -1, 0),
            look=(0, 30), R_clav=0.0, L_clav=0.0, L_foot=(-0.24, 0.42, 8, 0, 0), R_foot=(0.22, 0.0, 30, 30, 0))
    impact = W(hit, -6, (-4, 18, 0), (-0.02, -0.24, 0.34), (0, -30), hip=(0.0, -0.43, 0.27), pitch=32, pole=(0.5, -1, 0), lpole=(-0.5, -1, 0))
    return _slam_keys(S, over, coil, air, arch, swing, hit, impact)


def mace_slam():
    """鎚矛（片手。打擊騎士は楯なし）：右手で頭上へ振りかぶり、左の拳で釣り合いを取る"""
    _R, _left, S = mace_moves._R, mace_moves._left, mace_moves.stance(False)
    over = P(S, hip=(0.0, -0.12, -0.04), hip_rot=(18, -4, 0), chest=(6, -12, 0), look=(0, 8), R_clav=16.0, L=_left(False, 'high'),
             R=_R((0.22, 0.48, 0.02), (0.05, 0.35, -0.94), (1, 0.3, -0.3)))
    coil = P(over, hip=(0.0, -0.26, -0.06), hip_rot=(14, 4, 0))
    air = P(over, hip=(0.0, 0.02, 0.0), hip_rot=(4, -8, 0), chest=(0, -12, 0), look=(0, 12), R_clav=18.0,
            R=_R((0.18, 0.52, -0.04), (0.0, 0.10, -1.0), (1, 0.3, -0.3)), L={'wrist': (-0.40, 0.10, 0.40), 'pole': (-1, -0.4, 0)}, **TUCK)
    arch = P(air, hip=(0.0, 0.03, -0.02), hip_rot=(2, -12, 0), chest=(0, -16, 0), R=_R((0.16, 0.54, -0.08), (0.0, -0.2, -0.98), (1, 0.3, -0.3)))
    swing = P(S, hip=(0.0, -0.04, 0.10), hip_rot=(0, 10, 0), chest=(0, 4, 0), R_clav=12.0, R=_R((0.10, 0.62, 0.40), (0.0, 0.85, 0.5), (1, 0, -0.3)),
              L=_left(False, 'high'), L_foot=(-0.20, 0.30, 8, 10, 0.12), R_foot=(0.20, -0.05, 26, 10, 0.12))
    hit = P(S, hip=(0.0, -0.42, 0.30), hip_rot=(4, 36, 0), chest=(-2, 18, 0), look=(0, 38), R_clav=0.0, L=_left(False, 'low'),
            R=_R((0.02, -0.80, 0.60), (0.0, -0.80, 0.60), (0.5, -1, 0)), L_foot=(-0.24, 0.42, 8, 0, 0), R_foot=(0.22, 0.0, 30, 30, 0))
    impact = P(hit, hip=(0.0, -0.45, 0.31), R=_R((0.02, -0.84, 0.56), (0.0, -0.86, 0.52), (0.5, -1, 0)))
    return _slam_keys(S, over, coil, air, arch, swing, hit, impact)


# ======================= 祓魔僧「天門開闢」（浮いて天を仰ぐ） =======================
GATE_AT = 0.75      # ULT_SPECS.cleric.at（光の門が開く）
GATE_PILLAR = 2.35  # ULT_SPECS.cleric.pillar.at
GATE_TIME = 3.0


def gate_keys():
    _R, S = mace_moves._R, mace_moves.stance(False)
    hang = {'L_foot': (-0.12, -0.02, 0, 35, 0.12), 'R_foot': (0.12, -0.04, 0, 35, 0.14)}   # 浮いている間：脚を垂らし、つま先を下へ
    # 胸の前で手を合わせる（鎚矛は柄を上へ）
    pray = P(S, hip=(0.0, -0.04, 0.0), hip_rot=(0, 4, 0), chest=(0, 6, 0), look=(0, 10), R_clav=4.0, L_clav=4.0,
             R=_R((-0.30, -0.10, 0.55), (0.0, 0.95, 0.2), (0.9, -0.7, -0.2)), L={'wrist': (0.30, -0.08, 0.55), 'pole': (-0.9, -0.7, -0.2)}, **hang)
    # 腕を V の字に天へ。胸を張り、顔を上げる
    v_up = P(pray, hip=(0.0, 0.04, 0.0), chest=(0, -14, 0), look=(0, -32), R_clav=20.0, L_clav=20.0,
             R=_R((0.55, 0.78, 0.18), (0.35, 0.90, 0.1), (0.4, -1, -0.4)), L={'wrist': (-0.55, 0.80, 0.18), 'pole': (-0.4, -1, -0.4)}, **hang)
    sway1 = P(v_up, chest=(2, -16, 0), look=(4, -34), L={'wrist': (-0.52, 0.82, 0.20)})
    sway2 = P(v_up, chest=(-2, -15, 0), look=(-4, -33), R={'grip': (0.52, 0.80, 0.20)})
    # 両腕をまっすぐ天へ（門へ手を伸ばす）
    reach = P(v_up, chest=(0, -18, 0), look=(0, -40), R=_R((0.18, 0.96, 0.10), (0.05, 0.99, 0.1), (0.4, -1, -0.4)),
              L={'wrist': (-0.18, 0.97, 0.10), 'pole': (-0.4, -1, -0.4)})
    # 光の柱：腕を大きく広げる
    spread = P(v_up, chest=(0, -10, 0), look=(0, -12), R=_R((0.92, 0.22, 0.20), (0.55, 0.80, 0.10), (0.4, -1, -0.4)),
               L={'wrist': (-0.92, 0.24, 0.20), 'pole': (-0.4, -1, -0.4)})
    hover = P(spread, chest=(0, -6, 0), look=(0, -4))
    # 降りて膝で受ける
    land = P(S, hip=(0.0, -0.20, 0.0), hip_rot=(10, 10, 0), chest=(0, 8, 0), look=(0, 6), L_foot=(-0.18, 0.06, 6, 0, 0), R_foot=(0.18, -0.12, 30, 0, 0))
    return [(0.0, S, None), (0.35, pray, 'io'), (0.62, P(pray, chest=(0, 2, 0), look=(0, 0)), 'io'), (GATE_AT, v_up, 'o'), (1.20, sway1, 'io'),
            (1.70, sway2, 'io'), (2.10, sway1, 'io'), (2.25, reach, 'io'), (GATE_PILLAR, spread, 'i'), (2.55, hover, 'o'), (2.90, land, 'io'),
            (GATE_TIME, land, 'l')]


def build(rig, name):
    """その人物の必殺技の専用の動きを作る。返り値：[(ゲームの名前, action, 情報)]"""
    out = []
    if name == 'shield':
        k = shield_keys(); out.append(make_clip(rig, 'sh_ult', lambda t, k=k: sample(k, t), SHIELD_TIME))
    if name == 'sword':
        k = flash_keys(); out.append(make_clip(rig, 'ls_flash', lambda t, k=k: sample(k, t), k[-1][0]))
    if name == 'archer':
        k = bow_keys(); out.append(make_clip(rig, 'bw_ult', lambda t, k=k: sample(k, t), BOW_TIME))
    if name == 'polearm':
        k = spear_keys(); out.append(make_clip(rig, 'sp_ult', lambda t, k=k: sample(k, t), SP_TIME))
    if name == 'blunt':
        for clip, fn in (('mc_ult', mace_slam), ('wh_ult', warhammer_slam), ('lc_ult', lucerne_slam)):
            k = fn(); out.append(make_clip(rig, clip, lambda t, k=k: sample(k, t), BL_TIME))
    if name == 'cleric':
        k = gate_keys(); out.append(make_clip(rig, 'cl_gate', lambda t, k=k: sample(k, t), GATE_TIME))
    return out
