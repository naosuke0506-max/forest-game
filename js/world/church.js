// 教会の中（洞窟の仕上げ ③。2026-11-22。利用者の指示：「教会の中にも入れるようにして、内装も作ってください。
//   教会の隠し扉から、地下の洞窟に繋がる通路があり、そこから出たり入れたりできるようにします。（梯子）」。
//   利用者が選んだ：隠し扉は祭壇の後ろの床の石板（扉のボタンで開く）、梯子は専用の動き）
//
//   入口：塔の前の両開きの扉（world/doors.js。家の扉と同じく、ボタンで開け閉め・bot も開ける）→ 塔の下の小さな間 → 拱門 → 身廊
//   身廊：石の床・しっくいの壁（内側）・梁のある平らな天井・ステンドグラスの窓（昼は光る）・長椅子 2 列・真ん中の赤い敷物・
//         前の一段高い所（内陣）に説教台と朗読台、入口の横に洗礼盤と献灯台（小さな蝋燭が燃えている）、吊り灯 2 つ（点いたまま）
//   後ろの半円の張り出し（後陣）：祭壇（白い布・燭台・十字架・花）。祭壇の後ろの床に隠し扉の石板
//   隠し扉の下：石で囲んだ縦穴と鉄の梯子（約 11 m）→ 洞窟の小さな間 CH（world/cave-plan.js の CRYPT）→ 地下道 → 行き止まりの間 D1
//   人が消えた直後（静か）：祭壇の蝋燭と献灯台の火・吊り灯は点いたまま、長椅子に聖歌集が開いたまま
// 形は村の入れ物 B（world/build-kit.js）に貯める（質感ごとにまとめて描く。描画命令は増えない）。
// 石板と、縦穴のまわりの細かい地面、ステンドグラスは別の形（描画命令 3 つ）
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { box, v3 } from './build-kit.js';

const WHITE = [1.3, 1.31, 1.38];      // 内のしっくい（日が直に入らないので、照り返しの分だけ明るめに）
const OAK = [0.62, 0.46, 0.32];        // 長椅子・説教台（濃い樫）
const DARKWOOD = [0.42, 0.3, 0.2];
const RED = [0.55, 0.08, 0.07];        // 敷物
const GOLD = [0.85, 0.66, 0.3];
const IRON = [0.16, 0.16, 0.17];
const LINEN = [0.95, 0.94, 0.9];
/** ステンドグラスの色（升ごとに選ぶ） */
const GLASS_COLORS = [[0.75, 0.12, 0.1], [0.12, 0.25, 0.75], [0.85, 0.65, 0.15], [0.15, 0.55, 0.25], [0.55, 0.2, 0.6], [0.2, 0.55, 0.75]];
export const SLAB = { half: 0.6, slide: 1.3, time: 1.4 };   // 隠し扉の石板：半分の幅・開くときにずれる長さ・かかる秒

/**
 * 教会の中を作る（world/landmarks.js の church から呼ぶ）
 * @param {object} B 村の形の入れ物
 * @param {object} k 教会の向きの道具（landmarks.js の kit）：at・dir・bx・panel・wallLine・sightBox
 * @param {object} ctx { app, terrain, items, solid, solidLine, sight, floors, doorList, houseLife, cave }
 * @param {object} o 教会の敷地（world/villages.js の specials）
 * @param {object} D 教会の寸法（landmarks.js）
 * @returns {{ finish(materials): void, update(dt, night): void, slab, ladder, inside(x, z, y): boolean, triangles: number }}
 */
export function buildChurchInterior(B, k, ctx, o, D) {
  const { at, dir, bx, wallLine } = k;
  const { app, terrain, solid, solidLine, sight, floors, doorList, houseLife, cave } = ctx;
  const { NX, Z0, Z1, WH, PL, TX, TZ1, AR, AH } = D;
  const T = 0.3;                        // 壁の厚み
  const IX = NX - T;                    // 身廊の内の壁（横の半分）
  const ZB = Z0 + T, ZF = Z1 - T;       // 身廊の内の後ろ・前
  const CEIL = WH - 0.25;               // 天井の高さ
  const STEP = 0.18;                    // 内陣と後陣の一段
  const ZC = -8.6;                      // 内陣の段の前の端
  const NTX = TX - T, NZ1 = TZ1 - T;    // 塔の下の間の内の壁
  const NCEIL = 3.9;                    // 塔の下の間の天井
  const DW = 0.95, DH = 3.0;            // 扉の片方の幅・高さ
  const ARCH = 1.0, ARCH_H = 3.2;       // 塔の下の間と身廊の間の拱門（半分の幅・高さ）
  const HZ = -12.4;                     // 隠し扉の真ん中（後陣の床。祭壇の後ろ）
  const ALT = { z: -10.35, w: 1.8, d: 0.8, h: 1.0 };   // 祭壇
  const yaw = o.yaw, Y = o.y;
  const up = [0, 1, 0];
  const rot = (deg) => yaw + deg;

  // ---- 道具 ----
  /** 縦の面（敷地の中の座標の 2 点の間、高さ y0〜y1）。n：表の向き（敷地の中の向き） */
  const wall = (surf, x0, z0, x1, z1, y0, y1, n, shade = WHITE, vm = null) => {
    const nn = dir(n[0], 0, n[1]);
    // 表から見て反時計回り：a→b が表から見て右向き
    const ex = x1 - x0, ez = z1 - z0, right = n[0] * -ez + n[1] * ex;   // n と (ex, ez) の向きの関係
    const [a, b] = right < 0 ? [[x0, z0], [x1, z1]] : [[x1, z1], [x0, z0]];
    B.quad(surf, at(a[0], y0, a[1]), at(b[0], y0, b[1]), at(b[0], y1, b[1]), at(a[0], y1, a[1]), nn, shade, vm);
  };
  /** 水平の面（敷地の中の四角 x0..x1・z0..z1、高さ y）。下向きなら down */
  const flat = (surf, x0, z0, x1, z1, y, down = false, shade = 1) => {
    const p = [at(x0, y, z0), at(x1, y, z0), at(x1, y, z1), at(x0, y, z1)];
    const n = down ? [0, -1, 0] : up;
    // 上から見て反時計回りにそろえる
    const cx = (p[1][0] - p[0][0]) * (p[3][2] - p[0][2]) - (p[1][2] - p[0][2]) * (p[3][0] - p[0][0]);
    const ccw = cx < 0;   // 上から見て反時計回りか（x 右・z 手前の座標で）
    if (ccw !== down) B.quad(surf, p[0], p[1], p[2], p[3], n, shade); else B.quad(surf, p[0], p[3], p[2], p[1], n, shade);
  };
  /** 敷地の中の座標の点 */
  const P = (x, y, z) => at(x, y, z);
  const floorY = Y + PL;                  // 床の高さ（地面の上）
  const highY = Y + PL + STEP;            // 内陣・後陣の床

  // ==================== 壁の内側 ====================
  // 身廊の横の壁：窓の所は開ける（窓は外の壁から 0.3 m 奥。窓の脇・上下の厚みも作る）
  const WINZ = [-6.6, -2.4, 1.8], WIN = { y0: 2.5, y1: 5.9, w: 1.1 };
  for (const sx of [-1, 1]) {
    const x = sx * IX, n = [-sx, 0];
    // 窓の間の柱（下から天井まで）と、窓の下・上
    const edges = [ZB, ...WINZ.flatMap((z) => [z - WIN.w / 2, z + WIN.w / 2]), ZF];
    for (let i = 0; i < edges.length - 1; i++) {
      const a = edges[i], b = edges[i + 1];
      if (i % 2 === 0) wall('plaster', x, a, x, b, PL, CEIL, n, WHITE, [0.82, 0.82, 1, 1]);
      else {
        wall('plaster', x, a, x, b, PL, PL + WIN.y0 - 0.7 + 0.7, n, WHITE, [0.82, 0.82, 0.95, 0.95]);   // 窓の下
        wall('plaster', x, a, x, b, WIN.y1, CEIL, n, WHITE);                                           // 窓の上
        // 窓の厚み（下・上・左右）
        const xo = sx * (NX - 0.02);
        flat('plaster', Math.min(x, xo), a, Math.max(x, xo), b, WIN.y0, false, 0.9);
        flat('plaster', Math.min(x, xo), a, Math.max(x, xo), b, WIN.y1, true, 0.85);
        wall('plaster', x, a, xo, a, WIN.y0, WIN.y1, [0, 1], WHITE);
        wall('plaster', x, b, xo, b, WIN.y0, WIN.y1, [0, -1], WHITE);
      }
    }
    // 壁の足もとの木の腰板（高さ 1.1 m）
    wall('gate', sx * (IX - 0.02), ZB, sx * (IX - 0.02), ZF, PL, PL + 1.1, n, DARKWOOD);
    flat('gate', sx * (IX - 0.05), ZB, sx * (IX - 0.02), ZF, PL + 1.1, false, DARKWOOD);
  }
  // 身廊の後ろ（後陣の脇）と、後陣の入口の上（拱門の上の壁）
  for (const sx of [-1, 1]) wall('plaster', sx * (AR - T), ZB, sx * IX, ZB, PL, CEIL, [0, 1], WHITE, [0.82, 0.82, 1, 1]);
  wall('plaster', -(AR - T), ZB, AR - T, ZB, AH - 0.3, CEIL, [0, 1], WHITE);
  // 後陣の入口の厚み（左右の柱）
  for (const sx of [-1, 1]) wall('plaster', sx * (AR - T), ZB, sx * (AR - T), Z0, PL, AH - 0.3, [-sx, 0], WHITE);
  // 身廊の前の壁（塔の下の間への拱門のまわり）
  for (const sx of [-1, 1]) wall('plaster', sx * ARCH, ZF, sx * IX, ZF, PL, CEIL, [0, -1], WHITE, [0.82, 0.82, 1, 1]);
  wall('plaster', -ARCH, ZF, ARCH, ZF, PL + ARCH_H, CEIL, [0, -1], WHITE);
  // 拱門の厚み（身廊の前の壁から塔の下の間まで）
  for (const sx of [-1, 1]) wall('plaster', sx * ARCH, ZF, sx * ARCH, Z1, PL, PL + ARCH_H, [-sx, 0], WHITE);
  flat('plaster', -ARCH, ZF, ARCH, Z1, PL + ARCH_H, true, 0.85);
  // 塔の下の間：横の壁・前の壁（扉口のまわり）・後ろの壁（拱門のまわり）・天井（板）
  for (const sx of [-1, 1]) wall('plaster', sx * NTX, Z1, sx * NTX, NZ1, PL, NCEIL, [-sx, 0], WHITE, [0.82, 0.82, 1, 1]);
  for (const sx of [-1, 1]) wall('plaster', sx * DW, NZ1, sx * NTX, NZ1, PL, NCEIL, [0, -1], WHITE, [0.82, 0.82, 1, 1]);
  wall('plaster', -DW, NZ1, DW, NZ1, PL + DH, NCEIL, [0, -1], WHITE);
  for (const sx of [-1, 1]) wall('plaster', sx * ARCH, Z1, sx * NTX, Z1, PL, NCEIL, [0, 1], WHITE, [0.82, 0.82, 1, 1]);
  wall('plaster', -ARCH, Z1, ARCH, Z1, PL + ARCH_H, NCEIL, [0, 1], WHITE);
  flat('wood', -NTX, Z1, NTX, NZ1, NCEIL, true, 0.75);
  // 扉口の厚み（塔の前の壁）
  for (const sx of [-1, 1]) wall('stone', sx * DW, NZ1, sx * DW, TZ1, PL, PL + DH, [-sx, 0], 0.85);
  flat('stone', -DW, NZ1, DW, TZ1, PL + DH, true, 0.8);

  // ==================== 床と天井 ====================
  // 身廊の床（石の板）と、真ん中の赤い敷物
  flat('stone', -IX, ZC, IX, ZF, PL + 0.005, false, 0.95);
  flat('cloth', -0.55, ZC + 0.3, 0.55, ZF - 0.6, PL + 0.012, false, RED);
  flat('stone', -NTX, Z1 - 0.01, NTX, TZ1, PL + 0.005, false, 0.74);           // 塔の下の間
  flat('stone', -ARCH, ZF, ARCH, Z1, PL + 0.005, false, 0.74);                  // 拱門の下
  // 内陣（一段高い）：身廊の前の部分と、後陣
  flat('stone', -IX, ZB, IX, ZC, PL + STEP, false, 1.0);
  wall('stone', -IX, ZC, IX, ZC, PL, PL + STEP, [0, 1], 0.7);
  flat('stone', -(AR - T), Z0 - 0.01, AR - T, ZB, PL + STEP, false, 1.0);      // 後陣の入口の下
  // 後陣の床：0.3 m の升で、後陣の内の形（半分の楕円）の中、隠し扉の穴（1.2 m 四方）を除いて
  const apseIn = (x, z) => ((x / (AR - T)) ** 2 + ((z - Z0) / (AR * 1.1 - T)) ** 2) < 1.02;
  const inHole = (x, z, m = 0) => Math.abs(x) < SLAB.half + m && Math.abs(z - HZ) < SLAB.half + m;
  for (let x = -(AR - T); x < AR - T - 1e-6; x += 0.3) for (let z = HZ - SLAB.half - 0.3 * 2; z < Z0; z += 0.3) {
    const cx = x + 0.15, cz = z + 0.15;
    if (z + 0.3 > Z0 + 1e-6 || inHole(cx, cz) || !apseIn(cx, cz)) continue;
    flat('stone', x, z, x + 0.3, Math.min(Z0, z + 0.3), PL + STEP, false, 1.0);
  }
  // 後陣の床の、隠し扉の穴の縁（石の枠。穴の中へ 0.25 m 下がる）
  for (const [x0, z0, x1, z1, n] of [[-SLAB.half, HZ - SLAB.half, SLAB.half, HZ - SLAB.half, [0, 1]], [SLAB.half, HZ - SLAB.half, SLAB.half, HZ + SLAB.half, [-1, 0]],
    [SLAB.half, HZ + SLAB.half, -SLAB.half, HZ + SLAB.half, [0, -1]], [-SLAB.half, HZ + SLAB.half, -SLAB.half, HZ - SLAB.half, [1, 0]]]) {
    wall('stone', x0, z0, x1, z1, PL + STEP - 0.25, PL + STEP, n, 0.62);
  }
  // 天井（しっくい）と梁（横に 2.4 m ごと）
  flat('plaster', -IX, ZB, IX, ZF, CEIL, true, 0.86);
  for (let z = ZB + 1.2; z < ZF; z += 2.4) {
    const p = at(0, 0, z);
    box(B, 'wood', p[0], Y + CEIL - 0.28, p[2], IX * 2, 0.22, 0.28, yaw, { shade: DARKWOOD, bottom: true });
  }
  // 後陣の壁（内側）と、丸い天井（扇の形）
  const AS = 5, inner = [];
  for (let j = 0; j <= AS; j++) { const a = Math.PI + (j / AS) * Math.PI; inner.push([Math.cos(a) * (AR - T), Z0 + Math.sin(a) * (AR * 1.1 - T)]); }
  for (let j = 0; j < AS; j++) {
    const [x0, z0] = inner[j], [x1, z1] = inner[j + 1], mx = (x0 + x1) / 2, mz = (z0 + z1) / 2 - Z0;
    const l = Math.hypot(mx, mz);
    wall('plaster', x0, z0, x1, z1, PL + STEP, AH - 0.3, [-mx / l, -mz / l], WHITE, [0.8, 0.8, 1, 1]);
    wall('gate', x0 * 0.995, Z0 + (z0 - Z0) * 0.995, x1 * 0.995, Z0 + (z1 - Z0) * 0.995, PL + STEP, PL + STEP + 0.9, [-mx / l, -mz / l], DARKWOOD);
    // 天井：縁から真ん中の上（後陣の入口の高い所）へ。青い天井に金の縁
    const apex = P(0, AH + 0.9, Z0 + 0.05);
    const e0 = P(x0, AH - 0.3, z0), e1 = P(x1, AH - 0.3, z1);
    const nrm = v3.norm(v3.cross(v3.sub(e1, e0), v3.sub(apex, e0)));
    B.tri('cloth', e0, e1, apex, nrm[1] < 0 ? nrm : v3.mul(nrm, -1), [0.16, 0.24, 0.48]);
  }
  wall('plaster', -(AR - T), Z0 + 0.04, AR - T, Z0 + 0.04, AH - 0.3, AH + 0.9, [0, -1], [0.16, 0.24, 0.48]);   // 丸天井の口（身廊の側からは拱門の上の壁が隠す）

  // ==================== ステンドグラス（窓。昼は光る。別の形） ====================
  const gl = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  const glassQuad = (p0, p1, p2, p3, n, c) => {
    const b = gl.positions.length / 3;
    for (const p of [p0, p1, p2, p3]) { gl.positions.push(...p); gl.normals.push(...n); gl.uvs.push(0, 0); gl.colors.push(c[0], c[1], c[2], 1); }
    gl.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  let gs = 7;
  const grnd = () => ((gs = (gs * 16807) % 2147483647) / 2147483647);
  for (const sx of [-1, 1]) for (const wz of WINZ) {
    // 窓を縦 6・横 3 の升に分け、升ごとに色を選ぶ（升の間は鉛の線＝暗い。外の暗いガラスより内側に貼る）
    const x = sx * (NX - 0.05), n = dir(-sx, 0, 0), C = 3, R = 7;
    for (let i = 0; i < C; i++) for (let j = 0; j < R; j++) {
      const z0 = wz - WIN.w / 2 + (i / C) * WIN.w + 0.02, z1 = wz - WIN.w / 2 + ((i + 1) / C) * WIN.w - 0.02;
      const y0 = WIN.y0 + (j / R) * (WIN.y1 - WIN.y0) + 0.02, y1 = WIN.y0 + ((j + 1) / R) * (WIN.y1 - WIN.y0) - 0.02;
      const c = GLASS_COLORS[Math.floor(grnd() * GLASS_COLORS.length)], b = 0.75 + grnd() * 0.35;
      const [za, zb] = sx > 0 ? [z0, z1] : [z1, z0];   // 内から見て反時計回り（右の壁を中から見ると、教会の前＝+z が右）
      glassQuad(P(x, y0, za), P(x, y0, zb), P(x, y1, zb), P(x, y1, za), n, [c[0] * b, c[1] * b, c[2] * b]);
    }
  }
  // ==================== 家具 ====================
  const solids = [];
  const solidAt = (x, z, r) => { const p = at(x, 0, z); solids.push(solid(p[0], p[2], r)); };
  const lineAt = (x0, z0, x1, z1, r) => { const a = at(x0, 0, z0), b = at(x1, 0, z1); solidLine(a[0], a[2], b[0], b[2], r); };
  // 長椅子：2 列（通路の左右）、11 列。座面・背もたれ・脚・前の膝つき台。所々に聖歌集が開いたまま
  const PEW = { x0: 0.8, x1: 3.0, seat: 0.45, d: 0.42 };
  let row = 0;
  for (let z = 3.4; z > ZC + 1.6; z -= 1.0, row++) {
    for (const sx of [-1, 1]) {
      const cx = sx * (PEW.x0 + PEW.x1) / 2, len = PEW.x1 - PEW.x0;
      bx('gate', cx, PL + PEW.seat - 0.05, z, len, PEW.d, 0.05, { shade: OAK, bottom: true });                         // 座面
      bx('gate', cx, PL + PEW.seat, z + PEW.d / 2 - 0.03, len, 0.05, 0.45, { shade: OAK, bottom: true });             // 背もたれ
      for (const e of [-1, 1]) bx('gate', cx + e * (len / 2 - 0.03), PL, z, 0.06, PEW.d + 0.08, PEW.seat + 0.5, { shade: DARKWOOD }); // 横板
      bx('gate', cx, PL + 0.12, z - PEW.d / 2 - 0.22, len - 0.1, 0.16, 0.05, { shade: DARKWOOD, bottom: true });     // 膝つき台
      lineAt(sx * PEW.x0, z, sx * PEW.x1, z, 0.28);
      // 聖歌集（開いた本：白い紙 2 枚と赤い表紙）
      if ((row * 3 + (sx > 0 ? 1 : 0)) % 4 === 1) {
        const bxp = cx + sx * (((row * 7) % 5) / 5 - 0.4) * len * 0.6;
        bx('cloth', bxp, PL + PEW.seat, z - 0.05, 0.3, 0.2, 0.02, { shade: [0.45, 0.08, 0.06], bottom: true });
        bx('cloth', bxp, PL + PEW.seat + 0.02, z - 0.05, 0.28, 0.18, 0.012, { shade: LINEN });
      }
    }
  }
  // 祭壇：石の台に白い布、燭台 2 つと十字架、花
  const aT = PL + STEP + ALT.h;
  bx('stone', 0, PL + STEP, ALT.z, ALT.w, ALT.d, ALT.h, { shade: 0.95 });
  bx('cloth', 0, aT, ALT.z, ALT.w + 0.08, ALT.d + 0.06, 0.015, { shade: LINEN });
  bx('cloth', 0, aT - 0.45, ALT.z + ALT.d / 2 + 0.015, ALT.w * 0.6, 0.01, 0.45, { shade: [0.75, 0.1, 0.12], bottom: true });   // 前に垂らした赤い布
  bx('steel', 0, aT, ALT.z - 0.2, 0.05, 0.05, 0.75, { shade: GOLD });          // 十字架
  bx('steel', 0, aT + 0.48, ALT.z - 0.2, 0.36, 0.05, 0.05, { shade: GOLD, bottom: true });
  const flames = [];
  for (const sx of [-1, 1]) {
    bx('steel', sx * 0.65, aT, ALT.z - 0.15, 0.1, 0.1, 0.05, { shade: GOLD });
    bx('steel', sx * 0.65, aT + 0.05, ALT.z - 0.15, 0.035, 0.035, 0.3, { shade: GOLD });
    bx('cloth', sx * 0.65, aT + 0.35, ALT.z - 0.15, 0.045, 0.045, 0.22, { shade: LINEN });   // 蝋燭
    flames.push(P(sx * 0.65, aT + 0.62, ALT.z - 0.15));
  }
  // 花：花瓶（陶器の模型）
  for (const sx of [-1, 1]) { const p = at(sx * 0.32, 0, ALT.z + 0.1); ctx.items?.prop?.('ceramic_vase_01', p[0], Y + aT + 0.015, p[2], rot(sx * 30)); }
  solidAt(-0.55, ALT.z, 0.48); solidAt(0, ALT.z, 0.48); solidAt(0.55, ALT.z, 0.48);
  // 床に立つ燭台（後陣の入口の左右。長い鉄の柱と太い蝋燭）
  for (const sx of [-1, 1]) {
    const x = sx * 2.3, z = -9.95;
    bx('steel', x, PL + STEP, z, 0.3, 0.3, 0.06, { shade: IRON });
    bx('steel', x, PL + STEP + 0.06, z, 0.05, 0.05, 1.25, { shade: IRON });
    bx('steel', x, PL + STEP + 1.31, z, 0.16, 0.16, 0.03, { shade: IRON });
    bx('cloth', x, PL + STEP + 1.34, z, 0.08, 0.08, 0.3, { shade: LINEN });
    flames.push(P(x, PL + STEP + 1.72, z));
    solidAt(x, z, 0.22);
  }
  // 説教台（左。六角に近い木の箱と、上の板）と、上る段
  bx('gate', -3.0, PL + STEP, -9.0, 1.0, 1.0, 1.15, { shade: OAK });
  bx('gate', -3.0, PL + STEP + 1.15, -9.0, 1.1, 1.1, 0.06, { shade: DARKWOOD });
  bx('gate', -3.0, PL + STEP + 1.15, -8.65, 0.6, 0.3, 0.3, { shade: DARKWOOD });   // 本を置く傾いた板の代わり
  solidAt(-3.0, -9.0, 0.7);
  // 朗読台（右。鉄の柱に本の板）
  bx('steel', 2.7, PL + STEP, -9.0, 0.35, 0.35, 0.05, { shade: GOLD });
  bx('steel', 2.7, PL + STEP + 0.05, -9.0, 0.06, 0.06, 1.05, { shade: GOLD });
  bx('gate', 2.7, PL + STEP + 1.1, -9.0, 0.55, 0.4, 0.05, { shade: DARKWOOD });
  bx('cloth', 2.7, PL + STEP + 1.15, -9.0, 0.42, 0.3, 0.02, { shade: LINEN });
  solidAt(2.7, -9.0, 0.3);
  // 洗礼盤（入口の左。石の柱に浅い鉢）と、献灯台（入口の右。小さな蝋燭が並ぶ鉄の台。いくつかは燃えている）
  bx('stone', -3.2, PL, 4.0, 0.35, 0.35, 0.8, { shade: 0.92 });
  bx('stone', -3.2, PL + 0.8, 4.0, 0.75, 0.75, 0.18, { shade: 0.95 });
  bx('cloth', -3.2, PL + 0.94, 4.0, 0.6, 0.6, 0.02, { shade: [0.25, 0.32, 0.36] });   // 水
  solidAt(-3.2, 4.0, 0.45);
  bx('steel', 3.2, PL, 4.0, 0.08, 0.08, 0.8, { shade: IRON });
  bx('steel', 3.2, PL + 0.8, 4.0, 0.9, 0.45, 0.04, { shade: IRON });
  for (let i = 0; i < 8; i++) {
    const x = 3.2 - 0.36 + (i % 4) * 0.24, z = 4.0 - 0.1 + Math.floor(i / 4) * 0.2;
    bx('cloth', x, PL + 0.84, z, 0.05, 0.05, 0.04, { shade: LINEN });
    if (i % 3 !== 2) flames.push(P(x, PL + 0.93, z));
  }
  solidAt(3.2, 4.0, 0.45);
  // 聖歌の番号の板（右の壁。黒い板に白い番号）
  bx('gate', IX - 0.03, PL + 2.4, -7.0, 0.05, 0.7, 1.0, { shade: DARKWOOD });
  for (let i = 0; i < 3; i++) bx('cloth', IX - 0.06, PL + 2.55 + i * 0.28, -7.0, 0.01, 0.42, 0.13, { shade: LINEN });
  // 吊り灯（身廊に 2 つ。真鍮の輪に電球。点いたまま）
  const lamps = [];
  for (const z of [-4.5, 0.6]) {
    const hy = PL + 3.6;
    bx('steel', 0, hy + 0.08, z, 0.02, 0.02, CEIL - hy - 0.08, { shade: GOLD });   // 吊るす鎖
    // 真鍮の輪（6 つの短い棒）と、輪の上の電球
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
      const x0 = Math.cos(a0) * 0.55, z0 = z + Math.sin(a0) * 0.55, x1 = Math.cos(a1) * 0.55, z1 = z + Math.sin(a1) * 0.55;
      bx('steel', (x0 + x1) / 2, hy, (z0 + z1) / 2, 0.035, Math.hypot(x1 - x0, z1 - z0) + 0.03, 0.035, { shade: GOLD, bottom: true }, (Math.atan2(x1 - x0, z1 - z0) * 180) / Math.PI);
      bx('cloth', x0, hy + 0.035, z0, 0.06, 0.06, 0.1, { shade: [1.0, 0.92, 0.75] });
      if (i % 2 === 0) bx('steel', x0 / 2, hy + 0.035, (z0 + z) / 2, 0.015, 0.015, (CEIL - hy) * 0.5, { shade: GOLD });   // 輪を吊る細い鎖（3 本）
    }
    lamps.push({ p: P(0, hy + 0.1, z), floor: 0 });
  }

  // ==================== 当たり判定・床・視線 ====================
  // 当たり判定：外の壁の線（landmarks.js。半径 0.32）が、中の人も内の壁から離す（体の半径 0.35 と合わせて、内の壁の手前で止まる）。
  // ここは塔の下の間と身廊の間の壁だけ（拱門は開ける）
  wallLine(-ARCH, Z1, -TX, Z1, 0.32); wallLine(ARCH, Z1, TX, Z1, 0.32);
  // 歩ける床：身廊・塔の下の間・拱門の下（床の高さ）、内陣・後陣（一段高い）、前の段（3 段）
  const addFloor = (x0, z0, x1, z1, y) => {
    const c = at((x0 + x1) / 2, 0, (z0 + z1) / 2);
    floors?.addFloor({ cx: c[0], cz: c[2], yaw, hw: Math.abs(x1 - x0) / 2, hd: Math.abs(z1 - z0) / 2, y });
  };
  addFloor(-IX, ZC, IX, ZF, floorY);
  addFloor(-ARCH, ZF, ARCH, Z1, floorY);
  addFloor(-NTX, Z1, NTX, TZ1, floorY);
  addFloor(-IX, ZB, IX, ZC, highY);
  addFloor(-(AR - T), Z0 - AR * 1.1, AR - T, ZB, highY);
  // 前の段（landmarks.js の 3 段の石。上の面の高さ 0.233・0.467・0.7）
  for (let s = 0; s < 3; s++) addFloor(-(1.7 - s * 0.1), TZ1 - 0.1, 1.7 - s * 0.1, TZ1 + 0.3 + (2 - s) * 0.8, Y + (s + 1) * 0.233);
  // 視線をさえぎる物：壁ごとの薄い箱（前は教会全体を 1 つの箱にしていた。中に入れるようにしたので、壁と屋根だけにする）
  const sb = (x, y, z, w, d, h, dyaw = 0) => { const p = at(x, 0, z); sight?.addYawBox(p[0], Y + y, p[2], w, d, h, rot(dyaw)); };
  const mid = (Z0 + Z1) / 2, len = Z1 - Z0;
  for (const sx of [-1, 1]) sb(sx * (NX - T / 2), -0.5, mid, T, len, WH + 0.5);
  sb(0, WH - 0.3, mid, NX * 2, len, 2.2);                                     // 天井と屋根
  for (const sx of [-1, 1]) sb(sx * (AR + NX) / 2, -0.5, Z0 + T / 2, NX - AR, T, WH + 0.5);
  sb(0, AH - 0.3, Z0 + T / 2, AR * 2, T, WH - AH + 0.3);
  for (const sx of [-1, 1]) sb(sx * (ARCH + IX) / 2, -0.5, Z1 - 0.15, IX - ARCH, 0.4, WH + 0.5);
  sb(0, PL + ARCH_H, Z1 - 0.15, ARCH * 2, 0.4, WH - PL - ARCH_H);
  for (const sx of [-1, 1]) sb(sx * (TX - T / 2), -0.5, (Z1 + TZ1) / 2, T, TZ1 - Z1, D.TH);
  for (const sx of [-1, 1]) sb(sx * (DW + TX) / 2, -0.5, TZ1 - T / 2, TX - DW, T, D.TH);
  sb(0, PL + DH, TZ1 - T / 2, DW * 2, T, D.TH - PL - DH);
  sb(0, NCEIL, (Z1 + TZ1) / 2, TX * 2, TZ1 - Z1, D.TH - NCEIL);              // 塔の上（鐘の間）
  for (let j = 0; j < AS; j++) {   // 後陣の壁と屋根
    const a0 = Math.PI + (j / AS) * Math.PI, a1 = Math.PI + ((j + 1) / AS) * Math.PI;
    const x0 = Math.cos(a0) * AR, z0 = Z0 + Math.sin(a0) * AR * 1.1, x1 = Math.cos(a1) * AR, z1 = Z0 + Math.sin(a1) * AR * 1.1;
    const segYaw = (Math.atan2(x1 - x0, z1 - z0) * 180) / Math.PI;
    sb((x0 + x1) / 2, -0.5, (z0 + z1) / 2, T, Math.hypot(x1 - x0, z1 - z0), AH + 0.5, segYaw);
  }
  sb(0, AH, Z0 - AR * 0.5, AR * 2, AR * 1.1, 2.6);

  // ==================== 扉（両開き。world/doors.js） ====================
  const doorRec = (sx) => {
    const h = at(sx * DW, 0, TZ1 - 0.15), c = at(0, 0, TZ1 - 0.15), n = dir(0, 0, 1);
    return { x: h[0], y: floorY, z: h[2], yaw, flip: sx < 0, w: DW, h: DH - 0.02, cx: c[0], cz: c[2], nx: n[0], nz: n[2], closedSolids: [], openSolids: [], closedSight: null, openSight: null, church: true };
  };
  const dR = doorRec(1), dL = doorRec(-1);
  for (const x of [-0.62, 0, 0.62]) { const p = at(x, 0, TZ1 - 0.15); dR.closedSolids.push(solid(p[0], p[2], 0.34)); }
  { const p = at(0, 0, TZ1 - 0.15); dR.closedSight = sight?.addYawBox(p[0], floorY, p[2], DW * 2, 0.12, DH, yaw) || null; }
  dR.pair = dL; dL.pair = dR;
  doorList?.push(dR, dL);

  // ==================== 隠し扉の縦穴と梯子 ====================
  const K = cave?.crypt || null;
  const hc = at(0, 0, HZ);
  // 教会の床の穴が、洞窟の縦穴（world/cave-plan.js の CRYPT）にそろっているか（種を変えて教会の場所が変わったときは、隠し扉を作らない）
  const aligned = !!K && Math.hypot(hc[0] - K.x, hc[2] - K.z) < 0.25 && Math.abs((((yaw - K.yaw) % 360) + 540) % 360 - 180) < 1;
  if (K && !aligned) console.warn('教会の隠し扉：洞窟の縦穴とそろわないので作らない', { hole: hc, crypt: K });
  let slab = null, ladder = null, slabParts = null, patchParts = null;
  if (aligned) {
    // 縦穴の石の壁：下の間の天井の切り口（world/cave.js が四角に切る）から、後陣の床の 0.25 m 下まで。4 面。外から見えないので内向きだけ
    const H0 = PL + STEP - 0.25, h = SLAB.half;
    const ceilAt = (x, z) => { const p = at(x, 0, z), q = cave.at(p[0], p[2]); return (q ? q.ceil : K.ceil) - Y - 0.08; };
    const sides = [[-h, -h, h, -h, [0, 1]], [h, -h, h, h, [-1, 0]], [h, h, -h, h, [0, -1]], [-h, h, -h, -h, [1, 0]]];
    for (const [x0, z0, x1, z1, n] of sides) {
      const N = 6;
      for (let i = 0; i < N; i++) {
        const xa = x0 + ((x1 - x0) * i) / N, za = HZ + z0 + ((z1 - z0) * i) / N, xb = x0 + ((x1 - x0) * (i + 1)) / N, zb = HZ + z0 + ((z1 - z0) * (i + 1)) / N;
        const ya = ceilAt(xa, za), yb = ceilAt(xb, zb);
        const nn = dir(n[0], 0, n[1]);
        // 表から見て反時計回り
        const right = n[0] * -(zb - za) + n[1] * (xb - xa);
        const [A, Bp, ay, by] = right < 0 ? [[xa, za], [xb, zb], ya, yb] : [[xb, zb], [xa, za], yb, ya];
        B.quad('stone', P(A[0], ay, A[1]), P(Bp[0], by, Bp[1]), P(Bp[0], H0, Bp[1]), P(A[0], H0, A[1]), nn, 0.55, [0.55, 0.55, 0.9, 0.9]);
      }
    }
    // 梯子：縦穴の前（祭壇の側）の壁に、鉄の 2 本の柱と横木（0.3 m ごと）。下の間の床から後陣の床まで
    const LZ = HZ + h - 0.06;                   // 梯子の柱の所（壁から 6 cm）
    const top = PL + STEP, botY = (() => { const p = at(0, 0, LZ - 0.4), q = cave.at(p[0], p[2]); return (q ? q.floor : K.floor) - Y; })();
    for (const sx of [-1, 1]) bx('steel', sx * 0.22, botY - 0.05, LZ, 0.045, 0.045, top - botY + 0.05, { shade: IRON });
    for (let y = botY + 0.3; y < top - 0.05; y += 0.3) bx('steel', 0, y, LZ, 0.44, 0.03, 0.03, { shade: [0.22, 0.2, 0.19], bottom: true });
    // 梯子のつかまる所（world の座標）：上（後陣の床、祭壇と穴の間）・下（下の間の床）・梯子の線（体の真ん中）
    const face = yaw + 180;                    // 梯子に向くとき（教会の前＝祭壇の側を向く。人の向きの約束は -Z が前なので 180 度足す）
    const line = at(0, 0, LZ - 0.33);          // 梯子に掴まっている人の足の真上の点（梯子から 33 cm）
    const topStand = at(0, 0, HZ + h + 0.45), botStand = at(0, 0, LZ - 0.75);
    ladder = {
      x: line[0], z: line[2], yaw: face, top: Y + top, bottom: Y + botY,
      topStand: { x: topStand[0], z: topStand[2], y: Y + top }, botStand: { x: botStand[0], z: botStand[2], y: Y + botY },
      /** 上から掴める（石板が開いているときだけ） */
      get open() { return !!slab?.open; },
    };
    cave.setCryptTop?.(highY);   // 縦穴の上の端（教会の後陣の床）。world/cave-plan.js：縦穴の中の人の足もとは下の間の床
    // 地下道の木の支え（下の間 CH から 20 m ほど。人が掘って支えた古い通り道に見えるように）：両脇の柱と、上の梁。柱には当たる
    const tunnel = cave.passages?.find((q) => q.id === 'crypt');
    if (tunnel) {
      const S = tunnel.samples;
      let acc = 1.5;
      for (let i = S.length - 2; i > 0; i--) {
        const a = S[i + 1], b = S[i], L = Math.hypot(b.x - a.x, b.z - a.z);
        acc -= L;
        if (Math.hypot(b.x - K.x, b.z - K.z) > 22) break;
        if (acc > 0 || Math.hypot(b.x - K.x, b.z - K.z) < 3.2) continue;
        acc = 3.2;
        const q = cave.at(b.x, b.z);
        if (!q || q.d > -0.8) continue;
        const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L, nx = -tz, nz = tx, w = Math.max(0.7, b.hw - 0.2);
        const top = Math.min(q.ceil - 0.15, q.floor + 2.5), segYaw = (Math.atan2(tx, tz) * 180) / Math.PI;
        for (const sd of [-1, 1]) {
          const px = b.x + nx * w * sd, pz = b.z + nz * w * sd, fq = cave.at(px, pz);
          const fy = fq ? fq.floor : q.floor;
          box(B, 'wood', px, fy - 0.1, pz, 0.18, 0.18, top - fy + 0.1, segYaw, { shade: [0.5, 0.4, 0.3] });
          solid(px, pz, 0.16, { y0: fy - 0.5, y1: top + 0.5 });
        }
        box(B, 'wood', b.x, top - 0.18, b.z, w * 2 + 0.3, 0.18, 0.2, segYaw, { shade: [0.46, 0.36, 0.27], bottom: true });
      }
    }
    // 穴をふさぐ当たり判定（石板が開いている間。床の高さの人だけ。縦穴へ歩いて落ちないように）
    const holeSolid = solid(hc[0], hc[2], 0.62, { y0: highY - 0.6, y1: highY + 2.4 });
    holeSolid.off = true;
    // 縦穴のまわりの細かい地面（地面の網を抜いた所。world/cave-plan.js の holeAt・patchAt）：教会の向きの 0.6 m の升で、縦穴の四角を除く
    if (terrain?.material) {
      const g = { positions: [], uvs: [], colors: [], indices: [] }, S = 0.6, R = K.patch;
      const n = Math.ceil(R / S);
      const idx = new Map();
      const vtx = (i, j) => {
        const key = i * 1000 + j;
        if (idx.has(key)) return idx.get(key);
        const p = at(i * S, 0, HZ + j * S), y = terrain.analyticAt(p[0], p[2]) + 0.05, c = terrain.colorAt(p[0], p[2]);
        g.positions.push(p[0], y, p[2]); g.uvs.push(p[0] / (terrain.uvTile || 2), p[2] / (terrain.uvTile || 2)); g.colors.push(...c);
        idx.set(key, g.positions.length / 3 - 1);
        return idx.get(key);
      };
      for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) {
        const cx = (i + 0.5) * S, cz = (j + 0.5) * S;
        if (Math.abs(cx) < h && Math.abs(cz) < h) continue;
        if (Math.hypot(cx, cz) > R + 0.5) continue;
        const a = vtx(i, j), b = vtx(i + 1, j), c = vtx(i + 1, j + 1), d = vtx(i, j + 1);
        // 上から見て表
        const q = g.positions, ux = q[b * 3] - q[a * 3], uz = q[b * 3 + 2] - q[a * 3 + 2], vx = q[d * 3] - q[a * 3], vz = q[d * 3 + 2] - q[a * 3 + 2];
        if (ux * vz - uz * vx < 0) g.indices.push(a, b, c, a, c, d); else g.indices.push(a, c, b, a, d, c);
      }
      patchParts = g;
    }
    // 石板：閉じているときは床にぴったり。開けると少し持ち上がり、横（教会の左）へずれる
    slab = {
      custom: true, open: false, k: 0, cx: hc[0], cz: hc[2], y: highY, w: SLAB.half * 2,
      solid: holeSolid,
      /** 開け閉め（扉のボタン）。閉めるとき、穴の上・梯子に人がいれば閉められない */
      toggle(by = null, people = null) {
        if (this.open && people) for (const f of people) if (f.alive !== false && (f.ladder || Math.hypot(f.x - this.cx, f.z - this.cz) < 0.75 && Math.abs((f.y ?? highY) - highY) < 1.3)) return false;
        this.open = !this.open;
        holeSolid.off = !this.open;
        for (const fn of slab.listeners) fn({ slab: this, open: this.open, by });
        return true;
      },
      listeners: [],
    };
  }

  // ==================== 灯り（world/house-life.js：蝋燭の火・吊り灯。夜は窓から灯りが漏れる） ====================
  if (houseLife) {
    const windows = [];
    for (const sx of [-1, 1]) for (const wz of WINZ) {
      const p = P(sx * (NX + 0.03), (WIN.y0 + WIN.y1) / 2, wz);
      windows.push({ p, u: dir(0, 0, 1), n: dir(sx, 0, 0), w: WIN.w, h: WIN.y1 - WIN.y0, floor: 0 });
    }
    houseLife.push({ x: o.x, z: o.z, y: floorY, stories: 1, lit: true, litUp: false, tvOn: false, emberOn: false,
      lamps, glows: flames.map((p) => ({ p, r: 0.09, floor: 0 })), tvs: [], embers: [], windows });
  }

  // ==================== 中か（音のこもり・地図） ====================
  const inside = (x, z, y = null) => {
    const dx = x - o.x, dz = z - o.z, a = (yaw * Math.PI) / 180;
    const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
    if (y !== null && (y < floorY - 1 || y > Y + WH)) return false;
    return (Math.abs(lx) < IX && lz > ZB && lz < ZF + 0.3) || (Math.abs(lx) < NTX && lz > Z1 && lz < NZ1) || apseIn(lx, lz);
  };

  let glassMat = null, glassLast = -1, slabEnt = null, slabLast = -1, tris = 0;
  return {
    slab, ladder, inside,
    get triangles() { return tris; },
    /** 村の質感ができてから（石板・ステンドグラス・縦穴のまわりの地面の形を作る） */
    finish(materials) {
      const device = app.graphicsDevice;
      // ステンドグラス：自分で光る色の升（昼は明るく、夜は暗い。中の灯りで少しだけ）
      glassMat = new pc.StandardMaterial();
      glassMat.diffuse = new pc.Color(0.05, 0.05, 0.05);
      glassMat.emissive = new pc.Color(1, 1, 1); glassMat.emissiveVertexColor = true; glassMat.emissiveIntensity = 1;
      glassMat.useMetalness = true; glassMat.metalness = 0; glassMat.gloss = 0.6;
      glassMat.cull = pc.CULLFACE_BACK;   // 中からだけ（外は暗いガラスの板）
      glassMat.update();
      const ge = new pc.Entity('church-glass');
      ge.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, gl), glassMat)], castShadows: false, receiveShadows: false });
      app.root.addChild(ge);
      tris += gl.indices.length / 3;
      if (patchParts && patchParts.indices.length && terrain?.material) {
        const pe = new pc.Entity('crypt-ground');
        pe.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, patchParts), terrain.material)], castShadows: false, receiveShadows: true });
        app.root.addChild(pe);
        tris += patchParts.indices.length / 3;
      }
      if (slab && materials?.stone) {
        // 石板（1.2 m 四方・厚み 0.12 m。上の面に鉄の輪の取っ手）。閉じているときは床と同じ高さ
        const SB = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
        const q = (p0, p1, p2, p3, n, c) => {
          const b = SB.positions.length / 3;
          for (const p of [p0, p1, p2, p3]) { SB.positions.push(...p); SB.normals.push(...n); SB.uvs.push(p[0] / 3 + p[1] / 3, p[2] / 3); SB.colors.push(c, c * 0.98, c * 0.95, 1); }
          SB.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
        };
        const w = SLAB.half - 0.01, t = 0.12;
        q([-w, 0, -w], [-w, 0, w], [w, 0, w], [w, 0, -w], [0, 1, 0], 0.8);
        for (const [a, b, n] of [[[-w, -w], [w, -w], [0, 0, -1]], [[w, -w], [w, w], [1, 0, 0]], [[w, w], [-w, w], [0, 0, 1]], [[-w, w], [-w, -w], [-1, 0, 0]]]) {
          q([a[0], -t, a[1]], [b[0], -t, b[1]], [b[0], 0, b[1]], [a[0], 0, a[1]], n, 0.6);
        }
        // 取っ手（鉄の輪）：小さな 4 本の棒
        for (const [x0, z0, x1, z1] of [[-0.1, 0.25, 0.1, 0.25], [0.1, 0.25, 0.1, 0.33], [0.1, 0.33, -0.1, 0.33], [-0.1, 0.33, -0.1, 0.25]]) {
          q([x0, 0.012, z0], [x1, 0.012, z1], [x1, 0.03, z1], [x0, 0.03, z0], [0, 1, 0], 0.15);
        }
        slabEnt = new pc.Entity('church-slab');
        slabEnt.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, SB), materials.stone)], castShadows: true, receiveShadows: true });
        app.root.addChild(slabEnt);
        tris += SB.indices.length / 3;
        this.update(0, 0);
      }
      sceneBudget.triangles += tris;
    },
    /** 毎フレーム：night（0〜1。夕方から夜で 1）。ステンドグラスの明るさと、石板の開け閉め */
    update(dt, night) {
      if (glassMat) {
        const v = Math.round((0.12 + 0.95 * (1 - Math.min(1, Math.max(0, night)))) * 40) / 40;
        if (v !== glassLast) { glassLast = v; glassMat.emissiveIntensity = v; glassMat.update(); }
      }
      if (slab && slabEnt) {
        const goal = slab.open ? 1 : 0;
        slab.k += Math.max(-dt / SLAB.time, Math.min(dt / SLAB.time, goal - slab.k));
        if (slab.k !== slabLast) {
          slabLast = slab.k;
          // 始めの 15% で 3 cm 持ち上がり、残りで横へずれる（閉じるときは逆）
          const lift = Math.min(1, slab.k / 0.15) * 0.13, side = Math.max(0, (slab.k - 0.15) / 0.85);
          const s = side * side * (3 - 2 * side);
          const p = at(-s * SLAB.slide, 0, HZ);
          slabEnt.setPosition(p[0], highY + lift, p[2]);
          slabEnt.setEulerAngles(0, yaw, 0);
        }
      }
    },
  };
}
