# タンス・ベッドに隠れる・出る・探す・引きずり出して止めを刺す動きを、Tripo の骨に直接付ける
# （Blender 4.2。tools/characters/build_character.py から呼ぶ開発用の道具）
#
#   動きの座標：家具の前の「出る所」（game/hiding.js の outX・outZ）に立って、家具の方を向いた体の向きが基準（前 f が家具の側）
#   タンス（world/furniture.js）：中に立つ所は前へ 0.85m（扉の面は 0.615m）。扉は 2 枚で、外の縁が蝶番、取っ手は真ん中寄り（高さ 1.0m）
#   ベッド：真ん中は前へ 1.05m（手前の縁は 0.55m）。長さ 2m は左右に伸び、下の隙間は 0.3m。下では長さに沿って伏せ、顔は部屋の側（手前）
#
#   全キャラ：hide_wd_in・hide_wd_out・search_wd・hide_bed_in・hide_bed_out・search_bed・drag_wd_v・drag_bed_v（引きずり出される側）
#   片手劍を持つキャラ（楯劍騎士・劍騎士）：drag_wd・drag_bed（つかんで引きずり出し、床に倒して剣を突き下ろす）
#   扉の開き方（動作監督の画面でタンスの扉を動かすため）は DOORS に書く
import math
from ik_rig import *   # noqa: F401,F403
from body_moves import CARRY_NOW, FLAT
from onehand_moves import _left

WD_IN = 0.85       # タンスの中に立つ所
WD_FRONT = 0.615   # タンスの扉の面
BED_IN = 1.05      # ベッドの下に伏せる所（真ん中）
BED_OUT = 0.05     # ベッドから引きずり出されて仰向けになる所（体がベッドの縁 0.55m より手前に出る）
HANDLE_Y = 1.0     # 取っ手の高さ
# 狭い所での武器の持ち方（体の向きで回す (刃の向き, 刃の縁)）：
#   タンスの中＝刃を真上へ立てて体に寄せる（扉を突き抜けない）。ベッドの下・床に伏せる＝刃を足の方へ、体に沿わせて床に寝かせる（ベッドの端から出ない）
IN_WD = ((0.0, 1.0, 0.06), (1, 0, 0))
IN_BED = ((0.12, 0.02, -1.0), (1, 0, 0))
WD_R = (0.18, -0.80, 0.10)       # タンスの中の右手（肩から。体の前へ出しすぎない）
WD_L = (-0.24, -0.80, 0.06)      # 同じく左手
WD_SH = ((-1, 0, 0.15), (0, 1, 0))   # タンスの中の楯：体の左に縦に寄せる（扉の方へ面を向けない）
RAISED = ((0.05, 1.0, -0.22), (1, 0, 0))
BOW_WD = ((0.0, 1.0, 0.0), (1, 0, -0.2))  # 弓兵の弓（左手）：タンスの中では縦に立て、弦を体の側へ（体の向きで回す (上の弓の先, 弦の側)）   # 剣を立てて右肩の横に構える（覗くとき・つかむとき。中の相手や扉へ向けない）

# 扉の開く角度（度）：{動き: (右の扉 [(時刻, 角度)], 左の扉 [(時刻, 角度)])}。右・左は、タンスに向いて立った人から見て
DOORS = {
    'hide_wd_in': ([(0.30, 0), (0.55, 70), (1.10, 70), (1.40, 0)], [(0, 0)]),
    'hide_wd_out': ([(0.25, 0), (0.50, 60), (1.0, 60)], [(0, 0)]),
    'search_wd': ([(0.30, 0), (0.55, 90), (1.1, 90)], [(0.30, 0), (0.55, 90), (1.1, 90)]),
    'drag_wd': ([(0, 90)], [(0, 90)]),
    'drag_bed': ([(0, 0)], [(0, 0)]),
    'drag_wd_v': ([(0, 90)], [(0, 90)]),
}


def handle_at(side, deg, inner=False):
    """取っ手の位置（右の扉 side=1、左 -1）。扉が deg 度開いたとき。inner：扉の裏側（中から扉の縁を持つ所）"""
    hinge_r, a = side * 0.495, math.radians(deg)
    d = 0.06 if inner else 0.0
    return (hinge_r - side * 0.445 * math.cos(a) - side * d * math.sin(a), HANDLE_Y, WD_FRONT - 0.445 * math.sin(a) + d * math.cos(a))


def inside(sh, look=(180, 0), lw=None, lmix=0.0, chest=(0, 3, 0), lean=4):
    """タンスの中に、外を向いて立つ（武器は立てて体に寄せ、楯は体の左に縦に）"""
    return gp(sh, (0.0, -0.12, WD_IN), (180, lean, 0, 0), chest, look, (0.14, WD_IN + 0.02, 180, 0, 0, 0), (-0.14, WD_IN, 180, 0, 0, 0),
              lw=lw or (0, 0, 0), lmix=lmix, rrel=WD_R, lrel=WD_L, lpole=(-1, -0.5, 0.3), sh=WD_SH, hold=IN_WD, bow=BOW_WD)


def gp(shield, hip, rot, chest, look, lf, rf, rw=(0, 0, 0), lw=(0, 0, 0), rmix=0.0, lmix=0.0,
       rrel=(0.14, -0.70, 0.40), lrel=(-0.10, -0.62, 0.45), rpole=(0.5, -1, -0.4), lpole=(-0.8, -1, -0.2),
       lk=None, rk=None, look_k=0.9, sh=None, flat=False, hold=None, bow=None):
    """全キャラ用の姿：手首は肩からの位置（rrel・lrel。体の向きで回す）と地面の上の点（rw・lw）の間（rmix・lmix）。
    右手の武器は持ち方（body_moves の CARRY）で、flat なら地面に沿わせ、hold なら狭い所の持ち方（IN_WD・IN_BED）。
    楯を持つキャラは楯の向き（sh）、弓兵は bow があれば弓の向き"""
    yaw = rot[0]
    c = CARRY_NOW[0]
    R = {'wrist': rot_y(rrel, yaw), 'wrist_w': rw, 'w_mix': rmix, 'pole': rot_y(rpole, yaw)}
    if c:
        how = hold or (FLAT if flat else c)
        R.update(blade=rot_y(how[0], yaw), edge=rot_y(how[1], yaw))
    L = {'wrist': rot_y(lrel, yaw), 'wrist_w': lw, 'w_mix': lmix, 'pole': rot_y(lpole, yaw)}
    if shield:
        n, u = sh or ((-0.2, 0, 1), (0, 1, 0))
        L.update(normal=rot_y(n, yaw), up=rot_y(u, yaw))
    elif bow and not c:   # 右手に何も持たない形（CARRY が無い）＝弓兵
        L.update(bow_up=rot_y(bow[0], yaw), bow_x=rot_y(bow[1], yaw))
    return {'hip': hip, 'hip_rot': rot, 'chest': chest, 'look': look, 'look_k': look_k, 'R': R, 'L': L,
            'R_clav': 0.0, 'L_clav': 0.0, 'L_foot': lf, 'R_foot': rf,
            'L_knee': lk or rot_y((-0.12, 0, 1), yaw), 'R_knee': rk or rot_y((0.12, 0, 1), yaw)}


def stand(shield, at=(0.0, 0.0), yaw=0.0, u=-0.05):
    """立った姿（at に立ち、右へ yaw 度向く）"""
    return gp(shield, (at[0], u, at[1]), (yaw, 4, 0, 0), (0, 3, 0), (yaw, 0),
              foot_at(at, yaw, (-0.16, 0.05, 0, 0, 0, 0)), foot_at(at, yaw, (0.16, -0.05, 6, 0, 0, 0)))


# ======================= タンス =======================
def hide_wd_in_keys(sh):
    """タンスに入る：踏み出して右の扉を開け、振り向いて後ろ向きに入り、中から左手で扉を閉める"""
    S = stand(sh)
    reach = gp(sh, (0.0, -0.07, 0.20), (0, 8, 0, 0), (0, 6, 0), (0, 4), (-0.16, 0.28, 0, 0, 0, 0), (0.16, 0.12, 6, 15, 0, 0),
               rw=handle_at(1, 0), rmix=1.0)
    opened = gp(sh, (0.0, -0.06, 0.14), (8, 2, 0, 0), (6, 0, 0), (10, 2), (-0.16, 0.28, 0, 0, 0, 0), (0.16, 0.12, 6, 10, 0, 0),
                rw=handle_at(1, 70), rmix=1.0)
    turning = gp(sh, (0.0, -0.08, 0.50), (95, 4, 0, 0), (0, 2, 0), (140, 0), (-0.10, 0.58, 90, 0, 0.05, 0), (0.12, 0.40, 100, 10, 0, 0),
                 lw=handle_at(1, 70), lmix=0.0)
    inside_open = inside(sh, (190, 4), handle_at(1, 60, True), 1.0, (0, 8, 0), 6)
    closing = inside(sh, (180, 2), handle_at(1, 0, True), 1.0, (0, 4, 0))
    settled = inside(sh, (180, 0), handle_at(1, 0, True), 0.0)
    return [(0.0, S, None), (0.30, reach, 'io'), (0.55, opened, 'io'), (0.80, turning, 'io'), (1.10, inside_open, 'io'),
            (1.40, closing, 'io'), (1.70, settled, 'io')]


def hide_wd_out_keys(sh):
    """タンスから出る：中から左手で扉を押し開け、外へ出る（出た所で、タンスに背を向けて立つ）"""
    inn = inside(sh, (180, 0), handle_at(1, 0, True), 1.0)
    push = P(inn, L=dict(inn['L'], wrist_w=handle_at(1, 60, True)), look=(170, 2))
    step = gp(sh, (0.0, -0.08, 0.45), (180, 8, 0, 0), (0, 6, 0), (180, 2), (0.14, 0.40, 180, 0, 0.06, 0), (-0.14, WD_IN - 0.05, 180, 20, 0, 0),
              lw=handle_at(1, 60), lmix=0.5)
    end = stand(sh, (0.0, 0.0), 180)
    return [(0.0, inn, None), (0.25, P(inn, look=(175, 2)), 'io'), (0.45, push, 'io'), (0.72, step, 'io'), (1.0, end, 'io')]


def search_wd_keys(sh):
    """タンスを探す：踏み出して両手で両方の扉を開け、身を乗り出して中を覗く"""
    S = stand(sh)
    reach = gp(sh, (0.0, -0.07, 0.22), (0, 8, 0, 0), (0, 6, 0), (0, 4), (-0.16, 0.30, 0, 0, 0, 0), (0.16, 0.12, 6, 15, 0, 0),
               rw=handle_at(1, 0), lw=handle_at(-1, 0), rmix=1.0, lmix=1.0)
    opened = gp(sh, (0.0, -0.06, 0.10), (0, 2, 0, 0), (0, 0, 0), (0, 2), (-0.16, 0.26, 0, 0, 0, 0), (0.16, 0.08, 6, 10, 0, 0),
                rw=handle_at(1, 90), lw=handle_at(-1, 90), rmix=1.0, lmix=1.0)
    look = gp(sh, (0.0, -0.10, 0.26), (0, 14, 0, 0), (0, 14, 0), (0, 6), (-0.16, 0.34, 0, 0, 0, 0), (0.16, 0.10, 6, 20, 0, 0),
              rw=handle_at(1, 90), lw=handle_at(-1, 90), rmix=0.45, lmix=0.6, rrel=(0.30, -0.45, 0.05), hold=RAISED)
    return [(0.0, S, None), (0.30, reach, 'io'), (0.55, opened, 'io'), (0.80, look, 'io'), (1.10, P(look, look=(-8, 6)), 'io')], look


def drag_wd_v_keys(sh):
    """タンスから引きずり出される：胸ぐらをつかまれて引き出され、床へ投げ倒されて仰向けになり、剣を突き下ろされる"""
    inn = inside(sh)
    grabbed = gp(sh, (0.0, -0.10, WD_IN - 0.06), (180, 12, 0, 0), (0, 10, 0), (180, -10), (0.14, WD_IN + 0.02, 180, 20, 0, 0), (-0.14, WD_IN, 180, 20, 0, 0),
                 rrel=(0.30, -0.45, 0.12), lrel=(-0.30, -0.45, 0.12), sh=WD_SH, hold=IN_WD, bow=BOW_WD)
    yanked = gp(sh, (0.15, -0.16, 0.42), (200, 32, 0, 0), (10, 14, 0), (190, 10), (0.30, 0.35, 190, 40, 0.10, 0), (-0.05, 0.70, 180, 50, 0, 0),
                rrel=(0.45, -0.30, 0.10), lrel=(-0.45, -0.10, 0.10), hold=IN_WD)
    falling = gp(sh, (0.70, -0.55, 0.40), (240, -40, 0, 0), (0, -10, 0), (250, -30), (0.85, 0.20, 230, 0, 0.10, 0), (0.45, 0.62, 220, 0, 0.05, 0),
                 rrel=(0.45, 0.20, -0.10), lrel=(-0.45, 0.20, -0.10), flat=True)
    down = gp(sh, (1.05, -0.88, 0.30), (270, -84, 0, 0), (0, -6, 0), (270, -70), (0.20, 0.20, 270, -10, 0, 0), (0.20, 0.42, 270, -10, 0, 0),
              rrel=(0.40, -0.10, 0.10), lrel=(-0.40, -0.10, 0.10), lk=(0, 1, 0.2), rk=(0, 1, 0.2), look_k=0.6, flat=True)
    guard = P(down, R=dict(down['R'], wrist=rot_y((0.10, 0.30, 0.45), 270)), look=(270, -60))
    stabbed = P(down, chest=(0, -16, 0), look=(270, -85), hip=(0.75, -0.86, 0.15),
                R=dict(down['R'], wrist=rot_y((0.45, 0.15, 0.20), 270)), L=dict(down['L'], wrist=rot_y((-0.45, 0.15, 0.20), 270)))
    dead = P(down, look=(200, -40), R=dict(down['R'], wrist=rot_y((0.55, -0.05, 0.0), 270)), L=dict(down['L'], wrist=rot_y((-0.55, -0.05, 0.05), 270)))
    return [(0.0, inn, None), (0.25, grabbed, 'o'), (0.55, yanked, 'io'), (0.80, falling, 'i'), (1.05, down, 'o'), (1.45, guard, 'io'),
            (1.72, stabbed, 'o'), (2.00, dead, 'io'), (2.55, dead, 'l')]


# ======================= ベッド =======================
def _prone_along(sh, f, look_yaw=90.0, push=0.0):
    """ベッドの長さに沿ってうつ伏せ（頭は右 +r）。f：前への位置。push：膝を曲げて床を押す量（0〜1）"""
    o = (0.0, f)
    return gp(sh, (0.0, -0.86, f), (90, 84, 0, 0), (0, -10, 0), (look_yaw, 0),
              foot_at(o, 90, (-0.12, -0.86 + 0.25 * push, 0, 78, 0.04 * push, 0)), foot_at(o, 90, (0.12, -0.86 + 0.15 * push, 0, 78, 0, 0)),
              rw=at(o, 90, (0.16, 0.05, 0.60)), lw=at(o, 90, (-0.16, 0.05, 0.60)), rmix=1.0, lmix=1.0,
              rpole=(0.4, -1, -0.3), lpole=(-0.4, -1, -0.3), lk=(0, -1, 0.2), rk=(0, -1, 0.2), look_k=1.0, hold=IN_BED,
              sh=((-0.3, 1, 0.2), (0, 0.2, 1)))


def hide_bed_in_keys(sh):
    """ベッドに潜る：しゃがんで手をつき、ベッドに沿う向きに伏せて、横へ這ってベッドの下へ入る。顔は部屋の側（手前）"""
    S = stand(sh)
    crouch = gp(sh, (0.0, -0.45, 0.12), (20, 30, 0, 0), (0, 10, 0), (20, 20), (-0.16, 0.22, 10, 0, 0, 0), (0.18, 0.0, 20, 30, 0, 0))
    o = (0.0, 0.35)
    fours = gp(sh, (0.0, -0.46, 0.35), (90, 62, 0, 0), (0, 0, 0), (110, 10),
               foot_at(o, 90, (-0.12, -0.52, 0, 82, 0, 0)), foot_at(o, 90, (0.14, -0.50, 4, 82, 0, 0)),
               rw=at(o, 90, (0.17, 0.02, 0.40)), lw=at(o, 90, (-0.17, 0.02, 0.40)), rmix=1.0, lmix=1.0,
               rpole=(0.6, -0.3, -1), lpole=(-0.6, -0.3, -1), lk=(0, -0.3, 1), rk=(0, -0.3, 1), hold=IN_BED, sh=((-0.4, 1, 0.1), (0, 0.1, 1)))
    lying = _prone_along(sh, 0.40, 120)
    pushing = _prone_along(sh, 0.72, 160, push=1.0)
    under = _prone_along(sh, BED_IN, 180)
    return [(0.0, S, None), (0.30, crouch, 'io'), (0.60, fours, 'io'), (0.90, lying, 'io'), (1.12, pushing, 'io'), (1.35, under, 'io'),
            (1.60, under, 'l')]


def hide_bed_out_keys(sh):
    """ベッドから出る：横へ這ってベッドの下から出て、手をついて起き上がり、部屋の方（ベッドに背）を向いて立つ"""
    under = _prone_along(sh, BED_IN, 180)
    pushing = _prone_along(sh, 0.72, 170, push=1.0)
    lying = _prone_along(sh, 0.40, 150)
    o = (0.0, 0.30)
    kneel = gp(sh, (0.0, -0.46, 0.30), (160, 12, 0, 0), (0, 6, 0), (180, 0),
               foot_at(o, 160, (-0.13, -0.42, 2, 80, 0, 0)), foot_at(o, 160, (0.16, 0.34, 10, 0, 0, 0)),
               rw=at(o, 160, (0.17, 0.02, 0.40)), lw=at(o, 160, (-0.17, 0.02, 0.40)), rmix=0.0, lmix=0.0,
               lk=rot_y((0, -0.2, 1), 160), rk=rot_y((0.1, 0, 1), 160))
    end = stand(sh, (0.0, 0.0), 180)
    return [(0.0, under, None), (0.25, pushing, 'io'), (0.50, lying, 'io'), (0.85, kneel, 'io'), (1.20, P(end, hip=(0.0, -0.15, 0.08)), 'io'),
            (1.45, end, 'io')]


def search_bed_keys(sh):
    """ベッドを探す：片膝をついて身をかがめ、左手で毛布の端を持ち上げて、ベッドの下を覗く"""
    S = stand(sh)
    kneel = gp(sh, (0.0, -0.42, 0.12), (0, 18, 0, 0), (0, 10, 0), (0, 15), (-0.16, 0.35, 0, 0, 0, 0), (0.16, -0.30, 6, 75, 0, 0),
               lw=(-0.15, 0.50, 0.50), lmix=0.0, rk=(0.1, -0.3, 1))
    look = gp(sh, (0.0, -0.52, 0.10), (0, 50, 0, 0), (0, 25, 0), (0, 0), (-0.16, 0.35, 0, 20, 0, 0), (0.16, -0.30, 6, 78, 0, 0),
              lw=(-0.15, 0.48, 0.52), lmix=1.0, rrel=(0.30, -0.70, -0.30), rk=(0.1, -0.3, 1), look_k=1.0, hold=RAISED)
    return [(0.0, S, None), (0.35, kneel, 'io'), (0.70, look, 'io'), (1.20, P(look, look=(12, 0)), 'io')], look


def drag_bed_v_keys(sh):
    """ベッドから引きずり出される：腕をつかまれて床を引き出され、仰向けに転がされて、剣を突き下ろされる"""
    under = _prone_along(sh, BED_IN, 180)
    grabbed = P(under, R=dict(under['R'], wrist_w=(0.05, 0.12, 0.80)), look=(180, -10))
    pulled = P(_prone_along(sh, 0.55, 180), R=dict(under['R'], wrist_w=(0.05, 0.25, 0.25)))
    pulled['hip_rot'] = (90, 84, 0, 90)
    o = (0.0, BED_OUT)
    supine = gp(sh, (0.0, -0.88, BED_OUT), (90, 84, 0, 180), (0, 6, 0), (90, -75),
                foot_at(o, 90, (-0.12, -0.86, 0, -10, 0, 0)), foot_at(o, 90, (0.12, -0.86, 0, -10, 0, 0)),
                rw=(0.05, 0.30, -0.15), lw=at(o, 90, (-0.20, 0.05, 0.10)), rmix=0.8, lmix=1.0,
                lk=(0, 1, 0.1), rk=(0, 1, 0.1), look_k=0.6, hold=IN_BED, sh=((0, 1, 0.2), (0, 0.2, 1)))
    guard = P(supine, R=dict(supine['R'], wrist_w=(0.10, 0.55, BED_OUT)), look=(90, -60))
    stabbed = P(supine, chest=(0, -10, 0), look=(90, -88), R=dict(supine['R'], wrist_w=(0.05, 0.12, BED_OUT - 0.25)))
    dead = P(supine, look=(60, -50), R=dict(supine['R'], wrist_w=(0.0, 0.06, BED_OUT - 0.30)))
    return [(0.0, under, None), (0.25, grabbed, 'o'), (0.55, pulled, 'io'), (0.90, supine, 'io'), (1.15, guard, 'io'),
            (1.40, stabbed, 'o'), (1.70, dead, 'io'), (2.25, dead, 'l')]


# ======================= 引きずり出して止め（片手劍） =======================
def _sword_pose(sh, hip, rot, chest, look, grip, blade, edge, lf, rf, lwrist=None, lcenter=None, lnormal=(-0.2, 0, 1), lpole=(-1, -0.6, 0)):
    R = {'grip_w': grip, 'blade': blade, 'edge': edge, 'pole': rot_y((0.6, -1, -0.4), rot[0])}
    L = _left(sh, lcenter or (lwrist[0], lwrist[1] - 0.05, lwrist[2]), lwrist, lnormal, (0, 1, 0), lpole)
    return {'hip': hip, 'hip_rot': rot, 'chest': chest, 'look': look, 'look_k': 0.9, 'R': R, 'L': L,
            'R_clav': 0.0, 'L_clav': 0.0, 'L_foot': lf, 'R_foot': rf}


def _stab_keys(sh, look_end, start_keys, victim_chest, face_yaw, stand_at):
    """立ったまま相手の胸へ剣を突き下ろし、引き抜いて構える（左手は柄頭に添える。楯を持つときは楯を脇へ）"""
    vc = victim_chest
    lf = foot_at(stand_at, face_yaw, (-0.20, 0.0, 0, 0, 0))
    rf = foot_at(stand_at, face_yaw, (0.22, -0.10, 25, 0, 0))
    down = (0.0, -1.0, 0.08)
    edge = rot_y((1, 0, 0), face_yaw)
    hip = (stand_at[0], -0.12, stand_at[1])
    lift = _sword_pose(sh, hip, (face_yaw, 10, 0), (0, 0, 0), (face_yaw, 35), (vc[0], 1.42, vc[2]), down, edge, lf, rf,
                       lwrist=(vc[0] - 0.02, 1.56, vc[2]), lcenter=at(stand_at, face_yaw, (-0.35, 1.05, 0.10)))
    stab = _sword_pose(sh, (hip[0], -0.30, hip[2]), (face_yaw, 30, 0), (0, 16, 0), (face_yaw, 60), (vc[0], 0.80, vc[2]), down, edge, lf, rf,
                       lwrist=(vc[0] - 0.02, 0.94, vc[2]), lcenter=at(stand_at, face_yaw, (-0.38, 0.85, 0.15)))
    pull = _sword_pose(sh, (hip[0], -0.14, hip[2]), (face_yaw, 12, 0), (0, 4, 0), (face_yaw, 40), (vc[0], 1.25, vc[2]), (0, -1, 0.3), edge, lf, rf,
                       lwrist=(vc[0] - 0.02, 1.38, vc[2]), lcenter=at(stand_at, face_yaw, (-0.32, 1.05, 0.15)))
    ready = _sword_pose(sh, (hip[0], -0.08, hip[2]), (face_yaw + 20, 6, 0), (4, 4, 0), (face_yaw, look_end),
                        at(stand_at, face_yaw, (0.28, 1.10, 0.30)), rot_y((-0.1, 0.45, 1.0), face_yaw), rot_y((0, 1, -0.4), face_yaw), lf, rf,
                        lwrist=at(stand_at, face_yaw, (-0.25, 0.98, 0.25)), lcenter=at(stand_at, face_yaw, (-0.22, 1.05, 0.32)))
    t0 = start_keys[-1][0]
    return start_keys + [(t0 + 0.30, lift, 'io'), (t0 + 0.50, stab, 'i'), (t0 + 0.80, pull, 'o'), (t0 + 1.35, ready, 'io')]


def drag_wd_keys(sh):
    """タンスから引きずり出して止め：中の相手の胸ぐらを左手でつかみ、後ろへ下がりながら右へ投げ倒し、胸へ剣を突き下ろす"""
    e = (1, 0, 0)
    raised = RAISED[0]
    look_in = _sword_pose(sh, (0.0, -0.10, 0.26), (0, 14, 0), (0, 14, 0), (0, 6), (0.33, 1.08, 0.12), raised, e,
                          (-0.16, 0.34, 0, 0, 0), (0.16, 0.10, 6, 20, 0), lwrist=(-0.30, 1.0, 0.25), lcenter=(-0.35, 1.0, 0.30))
    grab = _sword_pose(sh, (0.0, -0.10, 0.34), (0, 16, 0), (0, 12, 0), (0, 4), (0.26, 1.12, 0.22), raised, e,
                       (-0.16, 0.40, 0, 0, 0), (0.16, 0.12, 6, 25, 0), lwrist=(0.0, 1.30, 0.70), lcenter=(-0.10, 1.20, 0.62), lnormal=(-0.7, 0, 0.7))
    pull = _sword_pose(sh, (0.05, -0.12, -0.20), (25, -4, 0), (12, -6, 0), (10, 6), at((0.05, -0.20), 25, (0.27, 1.14, 0.02)), rot_y(raised, 25), rot_y(e, 25),
                       (-0.10, 0.05, 15, 0, 0), (0.25, -0.40, 30, 10, 0), lwrist=(0.30, 1.15, 0.10), lcenter=(0.20, 1.10, 0.10), lnormal=(-0.3, 0, 1))
    fling = _sword_pose(sh, (0.10, -0.20, -0.15), (45, 18, 0), (16, 10, 0), (55, 25), at((0.10, -0.15), 45, (0.28, 1.10, 0.02)), rot_y(raised, 45), rot_y(e, 45),
                        (-0.10, 0.05, 30, 0, 0), (0.25, -0.40, 40, 20, 0), lwrist=(0.55, 0.60, 0.15), lcenter=(0.45, 0.65, 0.15), lnormal=(0.3, 0, 1))
    victim_chest = (1.35, 0.25, 0.30)
    stand_at, fy = (1.22, -0.25), 15
    turn = _sword_pose(sh, (stand_at[0], -0.10, stand_at[1]), (fy, 10, 0), (0, 6, 0), (fy, 30), at(stand_at, fy, (0.28, 1.10, 0.30)),
                       rot_y((-0.1, 0.45, 1.0), fy), rot_y((0, 1, -0.4), fy), foot_at(stand_at, fy, (-0.20, 0.0, 0, 0, 0)), foot_at(stand_at, fy, (0.22, -0.10, 25, 0, 0)),
                       lwrist=at(stand_at, fy, (-0.25, 0.98, 0.25)), lcenter=at(stand_at, fy, (-0.22, 1.05, 0.32)))
    keys = [(0.0, look_in, None), (0.25, grab, 'io'), (0.55, pull, 'io'), (0.80, fling, 'io'), (1.20, turn, 'io')]
    return _stab_keys(sh, 20, keys, victim_chest, fy, stand_at)


def drag_bed_keys(sh):
    """ベッドから引きずり出して止め：片膝をついたまま左手をベッドの下へ伸ばして腕をつかみ、立ちながら後ろへ引き出し、胸へ剣を突き下ろす"""
    e = (1, 0, 0)
    raised = RAISED[0]
    look = _sword_pose(sh, (0.0, -0.52, 0.10), (0, 50, 0), (0, 25, 0), (0, 0), (0.36, 0.36, 0.28), raised, e,
                       (-0.16, 0.35, 0, 20, 0), (0.16, -0.30, 6, 78, 0), lwrist=(-0.15, 0.48, 0.52), lcenter=(-0.25, 0.45, 0.45))
    reach = _sword_pose(sh, (0.0, -0.58, 0.14), (0, 62, 0), (0, 22, 0), (0, 0), (0.36, 0.32, 0.30), raised, e,
                        (-0.16, 0.35, 0, 20, 0), (0.16, -0.30, 6, 78, 0), lwrist=(0.05, 0.12, 0.80), lcenter=(-0.10, 0.20, 0.70), lnormal=(-0.5, 0.5, 0.6))
    pull1 = _sword_pose(sh, (0.0, -0.30, -0.25), (0, 30, 0), (0, 10, 0), (0, 15), (0.34, 0.80, -0.12), raised, e,
                        (-0.16, 0.0, 0, 0, 0), (0.18, -0.55, 10, 20, 0), lwrist=(0.05, 0.25, 0.25), lcenter=(-0.05, 0.30, 0.20), lnormal=(-0.4, 0.3, 0.8))
    pull2 = _sword_pose(sh, (0.0, -0.14, -0.55), (0, 10, 0), (0, 4, 0), (0, 25), (0.32, 1.10, -0.45), raised, e,
                        (-0.16, -0.40, 0, 0, 0), (0.18, -0.80, 10, 10, 0), lwrist=(0.05, 0.32, -0.15), lcenter=(-0.05, 0.36, -0.15), lnormal=(-0.3, 0.2, 1))
    victim_chest = (0.30, 0.25, BED_OUT)
    stand_at = (0.02, -0.48)
    keys = [(0.0, look, None), (0.25, reach, 'io'), (0.55, pull1, 'io'), (0.90, pull2, 'io')]
    return _stab_keys(sh, 30, keys, victim_chest, 30, stand_at)


# ======================= まとめて作る =======================
def build(rig, shield, sword_moves):
    """返り値：[(ゲームの名前, action, 情報)]。sword_moves：引きずり出して止めを刺す動きも作る（片手劍を持つキャラ）"""
    out = []

    def make(name, k):
        out.append(make_clip(rig, name, lambda t: sample(k, t), k[-1][0]))
    make('hide_wd_in', hide_wd_in_keys(shield))
    make('hide_wd_out', hide_wd_out_keys(shield))
    make('search_wd', search_wd_keys(shield)[0])
    make('drag_wd_v', drag_wd_v_keys(shield))
    make('hide_bed_in', hide_bed_in_keys(shield))
    make('hide_bed_out', hide_bed_out_keys(shield))
    make('search_bed', search_bed_keys(shield)[0])
    make('drag_bed_v', drag_bed_v_keys(shield))
    if sword_moves:
        make('drag_wd', drag_wd_keys(shield))
        make('drag_bed', drag_bed_keys(shield))
    return out
