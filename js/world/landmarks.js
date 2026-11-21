// 村の目印の建物（② 村の暮らしの物。2026-11-21。利用者の指示：マップは全部現代。森はヨーロッパの山村の「人が消えた直後」）
//   教会（川邑）：白いしっくいの身廊と後ろの半円の張り出し、前に高い鐘の塔（鐘の窓・時計・緑青の尖り屋根と十字架）。扉は閉じている（入れない）
//   ガソリンスタンド（山邑と野邑の間の道ばた）：コンクリートの敷地・屋根（夜は下の灯が点く）・給油の島 2 つと給油機 4 台・
//                   売店（閉まっている）・値段の看板・止まった車
// 場所は world/villages.js の specials（敷地は前＝+z が道を向く）。形は村の入れ物（build-kit の builder）に貯める。
// 給油機・車・小物は world/village-items.js が描く
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { box, frame, prism, v3 } from './build-kit.js';
import { glowTexture } from './roadside.js';
import { CAR_COLORS } from './village-life.js';

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const WHITE = [1.03, 1.04, 1.1];               // しっくい（質感の黄みを打ち消して白く）
const GLASS = [0.15, 0.18, 0.22];              // 窓（暗いガラス）
const DARK = [0.035, 0.035, 0.04];             // 鐘の窓の奥
const VERDIGRIS = [0.36, 0.54, 0.47];          // 緑青の銅板
const GOLD = [0.78, 0.62, 0.3];
const BRAND = [0.09, 0.42, 0.24];              // ガソリンスタンドの色（架空の店。緑）
const BRAND2 = [0.95, 0.72, 0.12];             // 差し色（黄）

/**
 * @param {object} B 村の形の入れ物
 * @param {object} ctx { app, plan, terrain, items, solid, solidLine, sight, covers }
 * @returns {{ footprints: object[], update(dt, night): void, triangles: number }}
 */
export function buildLandmarks(B, ctx) {
  const { app, plan, items, solid, solidLine, sight, covers } = ctx;
  const footprints = [];
  // 夜に光る物（屋根の下の灯）：加算の板。街灯と同じ作り
  const lg = { positions: [], normals: [], uvs: [], colors: [], indices: [] };

  for (const o of plan?.specials || []) {
    if (o.kind === 'church') church(o);
    else if (o.kind === 'station') station(o);
  }

  // ---- 共通の道具（敷地の中の座標：x は横、z は前（道の側）が +、y は敷地の高さから） ----
  function kit(o) {
    const F = frame(o.x, o.y, o.z, o.yaw);
    const at = (x, y, z) => F.at(x, y, z);
    const dir = (x, y, z) => F.dir(x, y, z);
    /** 箱（中心 x・z、底 y、幅 w・奥行き d・高さ h） */
    const bx = (surf, x, y, z, w, d, h, opt = {}, rot = 0) => { const p = at(x, 0, z); box(B, surf, p[0], o.y + y, p[2], w, d, h, o.yaw + rot, opt); };
    /** 縦の面（壁に貼る板）：中心 (x, z)、横の向き u（'x' か 'z'）、外向き n の符号、幅 w・下 y0・上 y1 */
    const panel = (surf, x, z, axis, sgn, w, y0, y1, shade) => {
      const ux = axis === 'x' ? [1, 0, 0] : [0, 0, 1];
      const nn = axis === 'x' ? [0, 0, sgn] : [sgn, 0, 0];
      const a = [x - ux[0] * w / 2, 0, z - ux[2] * w / 2], b = [x + ux[0] * w / 2, 0, z + ux[2] * w / 2];
      const p = (q, y) => at(q[0], y, q[2]);
      // 外から見て反時計回り
      const [l, r] = sgn * (axis === 'x' ? 1 : -1) > 0 ? [a, b] : [b, a];
      B.quad(surf, p(l, y0), p(r, y0), p(r, y1), p(l, y1), dir(...nn), shade);
    };
    /** 線に沿った当たり判定（敷地の中の座標） */
    const wallLine = (x0, z0, x1, z1, r = 0.32) => { const a = at(x0, 0, z0), b = at(x1, 0, z1); solidLine(a[0], a[2], b[0], b[2], r); };
    /** 壁裏隠れの線（外の壁から OUT 離す） */
    const cover = (x0, z0, x1, z1, nx, nz) => {
      if (!covers) return;
      const a = at(x0, 0, z0), b = at(x1, 0, z1), n = dir(nx, 0, nz);
      covers.push({ ax: a[0], az: a[2], bx: b[0], bz: b[2], nx: n[0], nz: n[2], y: null, inside: false });
    };
    const sightBox = (x, y, z, w, d, h) => { const p = at(x, 0, z); sight?.addYawBox(p[0], o.y + y, p[2], w, d, h, o.yaw); };
    const rect = (x, z, w, d, extra) => { const p = at(x, 0, z); footprints.push({ type: 'rect', x: p[0], z: p[2], w, d, yaw: o.yaw, ...extra }); };
    return { F, at, dir, bx, panel, wallLine, cover, sightBox, rect };
  }

  // ==================== 教会 ====================
  function church(o) {
    const { at, dir, bx, panel, wallLine, cover, sightBox, rect } = kit(o);
    const NX = 4.6, Z0 = -10.0, Z1 = 5.0, WH = 7.0, PL = 0.7;   // 身廊：横の半分・後ろ・前・壁の高さ・石の台の高さ
    const RH = WH + NX + 0.15;                                     // 棟の高さ（45 度）
    const TX = 2.3, TZ0 = Z1 - 0.2, TZ1 = Z1 + 4.4, TH = 17.5;     // 塔：横の半分・後ろ・前・壁の高さ
    const mid = (Z0 + Z1) / 2, len = Z1 - Z0;
    // 身廊：石の台・しっくいの壁・石の軒
    bx('stone', 0, -0.6, mid, NX * 2 + 0.3, len + 0.3, PL + 0.6, { grad: [0.75, 0.95] });
    bx('plaster', 0, PL, mid, NX * 2, len, WH - PL, { top: false, grad: [0.86, 1], shade: WHITE });
    bx('stone', 0, WH - 0.28, mid, NX * 2 + 0.36, len + 0.36, 0.3, { shade: 0.95, bottom: true });
    // 屋根（瓦。軒は 0.5 m 張り出す）
    const eave = NX + 0.55, ey = WH - 0.55, rz0 = Z0 - 0.45, rz1 = Z1 + 0.1;
    for (const s of [-1, 1]) {
      const n = v3.norm(dir(s, 1, 0));
      const p0 = at(s * eave, ey, rz0), p1 = at(s * eave, ey, rz1), p2 = at(0, RH, rz1), p3 = at(0, RH, rz0);
      if (s > 0) B.slope('tiles', p0, p1, p2, p3, n, 0.82); else B.slope('tiles', p1, p0, p3, p2, n, 0.82);
    }
    // 棟の瓦・妻壁（前と後ろ。前は塔の横から見える）
    { const a = at(0, RH - 0.05, rz0), b = at(0, RH - 0.05, rz1); B.slope('tiles', a, b, [b[0], b[1] + 0.18, b[2]], [a[0], a[1] + 0.18, a[2]], [0, 1, 0], 0.7); }
    B.tri('plaster', at(NX, WH, Z0), at(-NX, WH, Z0), at(0, RH - 0.3, Z0), dir(0, 0, -1), WHITE);
    B.tri('plaster', at(-NX, WH, Z1), at(NX, WH, Z1), at(0, RH - 0.3, Z1), dir(0, 0, 1), WHITE);
    // 横の窓（細長い窓 3 つずつ。上は尖り。暗いガラスと石の縁）
    for (const sx of [-1, 1]) for (const wz of [-6.6, -2.4, 1.8]) {
      const x = sx * (NX + 0.015), y0 = 2.5, y1 = 5.6, w = 1.1;
      panel('cloth', x, wz, 'z', sx, w, y0, y1, GLASS);
      B.tri('cloth', at(x, y1, wz - (sx * w) / 2), at(x, y1, wz + (sx * w) / 2), at(x, y1 + 0.55, wz), dir(sx, 0, 0), GLASS);
      bx('stone', sx * (NX + 0.06), y0 - 0.18, wz, 0.14, w + 0.4, 0.18);                       // 窓台
      for (const e of [-1, 1]) bx('stone', sx * (NX + 0.05), y0, wz + e * (w / 2 + 0.07), 0.12, 0.14, y1 - y0 + 0.3);   // 縁
    }
    // 後ろの半円の張り出し（多角形 5 面。しっくいの壁と瓦の屋根）
    const AR = 3.3, AH = 5.6, AS = 5;
    const ap = [];
    for (let k = 0; k <= AS; k++) { const a = Math.PI + (k / AS) * Math.PI; ap.push([Math.cos(a) * AR, Z0 + Math.sin(a) * AR * 1.1]); }
    for (let k = 0; k < AS; k++) {
      const [x0, z0] = ap[k], [x1, z1] = ap[k + 1];
      const n = v3.norm(dir((z1 - z0), 0, -(x1 - x0)).map((c) => -c));
      const nn = v3.dot(n, v3.norm(dir((x0 + x1) / 2, 0, (z0 + z1) / 2 - Z0))) < 0 ? v3.mul(n, -1) : n;
      B.quad('plaster', at(x0, PL, z0), at(x1, PL, z1), at(x1, AH, z1), at(x0, AH, z0), nn, WHITE, [0.86, 0.86, 1, 1]);
      B.quad('stone', at(x0 * 1.03, -0.5, Z0 + (z0 - Z0) * 1.03), at(x1 * 1.03, -0.5, Z0 + (z1 - Z0) * 1.03), at(x1 * 1.03, PL, Z0 + (z1 - Z0) * 1.03), at(x0 * 1.03, PL, Z0 + (z0 - Z0) * 1.03), nn, 0.85);
      // 屋根：軒から真ん中の上へ
      const e0 = at(x0 * 1.12, AH - 0.25, Z0 + (z0 - Z0) * 1.12), e1 = at(x1 * 1.12, AH - 0.25, Z0 + (z1 - Z0) * 1.12), top = at(0, AH + 2.6, Z0 + 0.05);
      B.tri('tiles', e0, e1, top, v3.norm(v3.add(nn, [0, 1, 0])), 0.8);
      wallLine(x0, z0, x1, z1, 0.3);
    }
    // 塔：石の台・しっくいの壁・角の石・軒
    const tm = (TZ0 + TZ1) / 2, tl = TZ1 - TZ0;
    bx('stone', 0, -0.6, tm, TX * 2 + 0.3, tl + 0.3, PL + 0.6, { grad: [0.75, 0.95] });
    bx('plaster', 0, PL, tm, TX * 2, tl, TH - PL, { top: false, grad: [0.86, 1], shade: WHITE });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx('stone', sx * (TX - 0.18), PL, tm + sz * (tl / 2 - 0.18), 0.4, 0.4, TH - PL, { top: false, shade: 0.92 });
    bx('stone', 0, TH - 0.35, tm, TX * 2 + 0.4, tl + 0.4, 0.38, { shade: 0.95, bottom: true });
    bx('stone', 0, 9.6, tm, TX * 2 + 0.16, tl + 0.16, 0.22, { shade: 0.95, bottom: true });     // 中ほどの帯
    // 鐘の窓（4 面。奥は暗い）と窓台
    for (const [axis, sgn, x, z] of [['x', 1, 0, TZ1 + 0.015], ['x', -1, 0, TZ0 - 0.015], ['z', 1, TX + 0.015, tm], ['z', -1, -TX - 0.015, tm]]) {
      for (const off of [-0.62, 0.62]) {
        const cx = axis === 'x' ? x + off : x, cz = axis === 'z' ? z + off : z;
        panel('cloth', cx, cz, axis, sgn, 0.78, 13.4, 15.3, DARK);
        const tc = axis === 'x' ? [cx, cz] : [cx, cz];
        const half = 0.39, u = axis === 'x' ? [1, 0] : [0, 1];
        B.tri('cloth', at(tc[0] - u[0] * half * sgn, 15.3, tc[1] + u[1] * half * sgn), at(tc[0] + u[0] * half * sgn, 15.3, tc[1] - u[1] * half * sgn), at(tc[0], 15.65, tc[1]), dir(axis === 'z' ? sgn : 0, 0, axis === 'x' ? sgn : 0), DARK);
      }
      const sx2 = axis === 'z' ? x + sgn * 0.05 : 0, sz2 = axis === 'x' ? z + sgn * 0.05 : tm;
      bx('stone', sx2, 13.2, sz2, axis === 'x' ? 2.2 : 0.16, axis === 'x' ? 0.16 : 2.2, 0.2);
    }
    // 時計（前と左右。白い文字盤・黒い縁と針。針は 3 時 17 分で止まっている）
    for (const [nx, nz, cx, cz] of [[0, 1, 0, TZ1 + 0.03], [1, 0, TX + 0.03, tm], [-1, 0, -TX - 0.03, tm]]) {
      const c = at(cx, 11.3, cz), n = dir(nx, 0, nz), u = v3.norm(v3.cross([0, 1, 0], n)), up = [0, 1, 0];
      const SEG = 16, R = 0.82;
      for (const [rr, col, off] of [[R + 0.1, [0.08, 0.08, 0.08], 0], [R, [0.93, 0.92, 0.86], 0.012]]) {
        for (let k = 0; k < SEG; k++) {
          const a0 = (k / SEG) * Math.PI * 2, a1 = ((k + 1) / SEG) * Math.PI * 2;
          const q = (a, r) => v3.add(v3.add(c, v3.mul(n, off)), v3.add(v3.mul(u, Math.cos(a) * r), v3.mul(up, Math.sin(a) * r)));
          B.tri('cloth', v3.add(c, v3.mul(n, off)), q(a0, rr), q(a1, rr), n, col);
        }
      }
      // 針：短い針（3 時と少し）と長い針（17 分）
      for (const [ang, L, W] of [[-((3 + 17 / 60) / 12) * Math.PI * 2, 0.45, 0.07], [-(17 / 60) * Math.PI * 2, 0.7, 0.045]]) {
        const d = v3.add(v3.mul(up, Math.cos(ang)), v3.mul(u, -Math.sin(ang)));
        const side = v3.cross(n, d), base = v3.add(c, v3.mul(n, 0.03));
        const p0 = v3.add(base, v3.mul(side, -W / 2)), p1 = v3.add(base, v3.mul(side, W / 2));
        B.quad('cloth', p0, p1, v3.add(p1, v3.mul(d, L)), v3.add(p0, v3.mul(d, L)), n, [0.05, 0.05, 0.05]);
      }
    }
    // 尖り屋根（緑青の銅板）・玉・十字架
    const SB = TX + 0.12, SH = TH + 9.0;
    const sp = [at(-SB, TH, TZ0 - 0.12), at(SB, TH, TZ0 - 0.12), at(SB, TH, TZ1 + 0.12), at(-SB, TH, TZ1 + 0.12)], apex = at(0, SH, tm);
    for (let k = 0; k < 4; k++) {
      const a = sp[k], b = sp[(k + 1) % 4];
      const n = v3.norm(v3.cross(v3.sub(apex, a), v3.sub(b, a)));
      B.tri('steel', b, a, apex, v3.dot(n, v3.sub(a, at(0, TH, tm))) < 0 ? v3.mul(n, -1) : n, VERDIGRIS);
    }
    prism(B, 'steel', at(0, SH + 0.15, tm), [0, 1, 0], 0.3, 0.18, 8, GOLD);
    bx('steel', 0, SH + 0.3, tm, 0.09, 0.09, 1.5, { shade: GOLD });
    bx('steel', 0, SH + 1.25, tm, 0.75, 0.09, 0.09, { shade: GOLD });
    // 扉（閉じた両開きの板戸）・石の枠・前の段
    panel('gate', 0, TZ1 + 0.02, 'x', 1, 1.9, PL, PL + 3.0, 0.85);
    { const a = at(0, PL, TZ1 + 0.035), b = at(0, PL + 3.0, TZ1 + 0.035); B.quad('cloth', v3.add(a, dir(-0.03, 0, 0)), v3.add(a, dir(0.03, 0, 0)), v3.add(b, dir(0.03, 0, 0)), v3.add(b, dir(-0.03, 0, 0)), dir(0, 0, 1), [0.1, 0.08, 0.06]); }
    for (const e of [-1, 1]) bx('stone', e * 1.1, PL, TZ1 + 0.08, 0.3, 0.2, 3.25);
    bx('stone', 0, PL + 3.05, TZ1 + 0.08, 2.6, 0.24, 0.42);
    for (let k = 0; k < 3; k++) bx('stone', 0, -0.4, TZ1 + 0.3 + (2 - k) * 0.4 - 0.2, 3.4 - k * 0.2, 0.4 + (2 - k) * 0.8, 0.4 + (k + 1) * 0.233, { shade: 0.9 - k * 0.03 });
    // 当たり判定・bot の目・壁裏隠れの線・地図
    wallLine(-NX, Z0, -NX, Z1); wallLine(NX, Z0, NX, Z1); wallLine(-NX, Z0, -AR, Z0); wallLine(AR, Z0, NX, Z0);
    wallLine(-TX, TZ0, -TX, TZ1); wallLine(TX, TZ0, TX, TZ1); wallLine(-TX, TZ1, TX, TZ1);
    wallLine(-NX, Z1, -TX, Z1); wallLine(TX, Z1, NX, Z1);
    wallLine(-1.6, TZ1 + 1.7, 1.6, TZ1 + 1.7, 0.25);   // 前の段（扉は閉じている）
    for (const s of [-1, 1]) wallLine(s * 1.7, TZ1 + 0.2, s * 1.7, TZ1 + 1.7, 0.25);
    sightBox(0, -0.5, mid, NX * 2, len, RH - 1.2);
    sightBox(0, -0.5, tm, TX * 2, tl, TH);
    sightBox(0, -0.5, Z0 - AR * 0.5, AR * 1.8, AR * 1.0, AH);
    const OUT = 0.5;
    cover(-NX - OUT, Z0 + 0.6, -NX - OUT, Z1 - 0.4, -1, 0);
    cover(NX + OUT, Z0 + 0.6, NX + OUT, Z1 - 0.4, 1, 0);
    cover(-TX - OUT, TZ0 + 0.7, -TX - OUT, TZ1 - 0.4, -1, 0);
    cover(TX + OUT, TZ0 + 0.7, TX + OUT, TZ1 - 0.4, 1, 0);
    rect(0, mid, NX * 2, len, { roof: 'tiles', kind: 'church' });
    rect(0, tm, TX * 2, tl, { roof: 'tiles', kind: 'church' });
    // 前の長椅子のかわりに、扉の横に植木箱
    for (const s of [-1, 1]) { const p = at(s * 2.6, 0, TZ1 + 0.5); items.prop('planter_box_01', p[0], o.y, p[2], o.yaw); solid(p[0], p[2], 0.3); }
  }

  // ==================== ガソリンスタンド ====================
  function station(o) {
    const { at, dir, bx, panel, wallLine, cover, sightBox, rect } = kit(o);
    const HW = o.w / 2, HD = o.d / 2;
    // 敷地のコンクリート（道の側は路肩まで。縁は地面の下まで下ろす）
    bx('slab', 0, -1.2, 0.25, o.w, o.d + 0.5, 1.26, { grad: [0.5, 1] });
    // 屋根：柱 4 本・厚い屋根・緑と黄の帯・下の灯
    const CX = -3, CZ = 2.4, CW = 13, CD = 8.6, CH = 4.7;
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
      const x = CX + sx * 3.6, z = CZ + sz * 2.1;
      bx('steel', x, 0, z, 0.34, 0.34, CH, { shade: [0.85, 0.86, 0.86] });
      const p = at(x, 0, z); solid(p[0], p[2], 0.25); sight?.addCyl(p[0], p[2], 0.2, o.y, o.y + CH);
    }
    bx('steel', CX, CH, CZ, CW, CD, 0.7, { shade: [0.9, 0.9, 0.9], bottom: true });
    bx('steel', CX, CH + 0.12, CZ, CW + 0.08, CD + 0.08, 0.36, { shade: BRAND, top: false });
    bx('steel', CX, CH + 0.48, CZ, CW + 0.06, CD + 0.06, 0.1, { shade: BRAND2, top: false });
    // 屋根の下の灯（白い板 8 枚と、夜の光）
    for (const lx of [-4.5, -1.5, 1.5, 4.5]) for (const lz of [-2.2, 2.2]) {
      bx('cloth', CX + lx, CH - 0.03, CZ + lz, 1.3, 0.5, 0.03, { shade: [0.95, 0.96, 0.98], bottom: true });
      const c = at(CX + lx, CH - 0.08, CZ + lz);
      glowQuad(c, dir(1, 0, 0), dir(0, 0, 1), 1.2, [1, 1, 0.95]);
      // 横から見ても灯が分かるよう、縦の板を十字に 2 枚
      const c2 = at(CX + lx, CH - 0.25, CZ + lz);
      glowQuad(c2, dir(1, 0, 0), [0, 1, 0], 0.8, [0.7, 0.7, 0.66]);
      glowQuad(c2, dir(0, 0, 1), [0, 1, 0], 0.8, [0.7, 0.7, 0.66]);
      const g = at(CX + lx, 0.1, CZ + lz);
      glowQuad(g, dir(1, 0, 0), dir(0, 0, 1), 3.6, [0.34, 0.34, 0.32]);
    }
    // 給油の島 2 つ（コンクリートの台・黄の縁）と給油機（島ごとに 2 台）
    for (const iz of [CZ - 2.1, CZ + 2.1]) {
      bx('concrete', CX, 0, iz, 8.4, 1.2, 0.2, { shade: 0.95 });
      for (const e of [-1, 1]) bx('steel', CX + e * 4.25, 0, iz, 0.1, 1.22, 0.21, { shade: BRAND2 });
      for (const px of [-2.0, 2.0]) {
        const p = at(CX + px, 0, iz);
        items.vehicle('fuel_pump', p[0], o.y + 0.2, p[2], o.yaw, BRAND, 'station');
        solid(p[0], p[2], 0.55);
        sight?.addYawBox(p[0], o.y, p[2], 0.95, 0.5, 2.1, o.yaw);
      }
      wallLine(CX - 4.0, iz, CX + 4.0, iz, 0.55);
    }
    // 売店（閉まっている）：しっくいの壁・前は大きなガラス・平らな屋根と緑の帯
    const SX = 7.6, SZ = -4.6, SW = 8.6, SD = 6.4, SH = 3.7;
    bx('stone', SX, -0.3, SZ, SW + 0.12, SD + 0.12, 0.5, { shade: 0.8 });
    bx('plaster', SX, 0.2, SZ, SW, SD, SH - 0.2, { top: false, shade: [0.92, 0.92, 0.9], grad: [0.85, 1] });
    bx('plaster', SX, SH, SZ, SW + 0.3, SD + 0.3, 0.12, { shade: 0.7, bottom: true });
    bx('steel', SX, SH - 0.2, SZ, SW + 0.36, SD + 0.36, 0.6, { shade: BRAND, top: false });
    bx('steel', SX, SH + 0.4, SZ, SW + 0.38, SD + 0.38, 0.08, { shade: BRAND2, top: false });
    // 前のガラス（窓 3 枚と扉）
    const fz = SZ + SD / 2 + 0.015;
    for (const [wx, ww, y0] of [[-3.0, 2.0, 0.6], [-0.7, 1.8, 0.6], [3.0, 2.0, 0.6]]) {
      panel('cloth', SX + wx, fz, 'x', 1, ww, y0, 2.9, GLASS);
      bx('steel', SX + wx, y0 - 0.08, fz, ww + 0.1, 0.06, 0.08, { shade: [0.7, 0.7, 0.72] });
      bx('steel', SX + wx, 2.9, fz, ww + 0.1, 0.06, 0.08, { shade: [0.7, 0.7, 0.72] });
    }
    panel('cloth', SX + 1.1, fz + 0.005, 'x', 1, 1.2, 0.2, 2.5, [0.2, 0.24, 0.28]);   // 扉のガラス
    for (const e of [-1, 1]) bx('steel', SX + 1.1 + e * 0.62, 0.2, fz, 0.06, 0.06, 2.36, { shade: [0.6, 0.6, 0.62] });
    bx('steel', SX + 1.1, 2.5, fz, 1.3, 0.06, 0.07, { shade: [0.6, 0.6, 0.62] });
    // 値段の看板（道の側の角に立つ柱。道を行く人から見えるよう、板は道に沿った向き）
    const PX = -HW + 1.4, PZ = HD - 1.2;
    bx('steel', PX, 0, PZ, 0.3, 0.3, 4.2, { shade: [0.5, 0.5, 0.52] });
    bx('steel', PX, 4.2, PZ, 0.32, 1.6, 1.5, { shade: BRAND });
    bx('steel', PX, 5.7, PZ, 0.34, 1.62, 0.22, { shade: BRAND2 });
    for (const [k, ly] of [[0, 4.42], [1, 4.85], [2, 5.28]]) for (const s of [-1, 1]) panel('cloth', PX + s * 0.17, PZ, 'z', s, 1.0, ly, ly + 0.3, k === 0 ? [0.95, 0.95, 0.92] : [0.88, 0.9, 0.88]);
    { const p = at(PX, 0, PZ); solid(p[0], p[2], 0.3); }
    // 当たり判定・bot の目・壁裏隠れの線
    wallLine(SX - SW / 2, SZ - SD / 2, SX + SW / 2, SZ - SD / 2);
    wallLine(SX - SW / 2, SZ + SD / 2, SX + SW / 2, SZ + SD / 2);
    wallLine(SX - SW / 2, SZ - SD / 2, SX - SW / 2, SZ + SD / 2);
    wallLine(SX + SW / 2, SZ - SD / 2, SX + SW / 2, SZ + SD / 2);
    sightBox(SX, -0.3, SZ, SW, SD, SH + 0.6);
    const OUT = 0.5;
    cover(SX - SW / 2 - OUT, SZ - SD / 2 + 0.5, SX - SW / 2 - OUT, SZ + SD / 2 - 0.5, -1, 0);
    cover(SX + SW / 2 + OUT, SZ - SD / 2 + 0.5, SX + SW / 2 + OUT, SZ + SD / 2 - 0.5, 1, 0);
    cover(SX - SW / 2 + 0.5, SZ - SD / 2 - OUT, SX + SW / 2 - 0.5, SZ - SD / 2 - OUT, 0, -1);
    footprints.push({ type: 'slab', ...(() => { const p = at(0, 0, 0); return { x: p[0], z: p[2] }; })(), w: o.w, d: o.d, yaw: o.yaw, shade: 'apron' });
    { const p = at(CX, 0, CZ); footprints.push({ type: 'slab', x: p[0], z: p[2], w: CW, d: CD, yaw: o.yaw, shade: 'canopy' }); }
    rect(SX, SZ, SW, SD, { roof: 'flat', kind: 'shop' });
    // 止まった車（給油機の横に 1 台・売店の前に 1 台）と小物
    const car = (id, x, z, rot, col) => {
      const p = at(x, 0, z), [w, d] = [id === 'pickup' ? 2.09 : 1.94, { car_small: 3.95, car_wagon: 4.68, pickup: 5.31 }[id]];
      items.vehicle(id, p[0], o.y + 0.04, p[2], o.yaw + rot, col, 'station');
      const a = ((o.yaw + rot) * Math.PI) / 180, fx = Math.sin(a), fz2 = Math.cos(a), r = w / 2 * 0.95, L = d / 2 - r;
      for (let t = -L; t <= L + 0.01; t += r * 0.8) solid(p[0] + fx * t, p[2] + fz2 * t, r);
      sight?.addYawBox(p[0], o.y, p[2], w * 0.95, d * 0.95, 1.3, o.yaw + rot);
    };
    car('car_wagon', CX - 1.2, CZ + 2.1 + 1.85, 90, CAR_COLORS[(Math.abs(Math.round(o.x * 7 + o.z)) % CAR_COLORS.length)]);
    car('car_small', SX - 2.4, SZ + SD / 2 + 3.4, 180, CAR_COLORS[(Math.abs(Math.round(o.x * 3 - o.z)) + 3) % CAR_COLORS.length]);
    const put = (id, x, z, yaw, r, opt) => { const p = at(x, 0, z); items.prop(id, p[0], o.y + 0.05, p[2], o.yaw + yaw, opt); solid(p[0], p[2], r); };
    put('metal_trash_can', SX + 3.6, SZ + SD / 2 + 0.6, 10, 0.34);
    put('metal_trash_can', CX + 4.8, CZ - 2.1, -20, 0.34);
    put('exterior_aircon_unit', SX + 2.0, SZ - SD / 2 - 0.45, 180, 0.4);
    put('propane_tank', SX - SW / 2 - 0.4, SZ - 1.2, 0, 0.18);
    put('propane_tank', SX - SW / 2 - 0.4, SZ - 1.6, 40, 0.18);
    put('propane_tank', SX - SW / 2 - 0.4, SZ - 2.0, 80, 0.18);
    for (let k = 0; k < 3; k++) { const p = at(SX + SW / 2 + 0.6, 0, SZ - 1.5); items.prop('old_tyre', p[0], o.y + 0.05 + k * 0.16, p[2], o.yaw + k * 37, { flat: true }); }
    { const p = at(SX + SW / 2 + 0.6, 0, SZ - 1.5); solid(p[0], p[2], 0.32); }
    put('metal_jerrycan', SX + SW / 2 + 0.5, SZ - 0.6, 90, 0.16);
  }

  /** 加算の光の板（c：真ん中、ax・ay：板の向き、s：半分の大きさ、col：色） */
  function glowQuad(c, ax, ay, s, col) {
    const b = lg.positions.length / 3;
    for (const [px, py] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      lg.positions.push(c[0] + ax[0] * px * s + ay[0] * py * s, c[1] + ax[1] * px * s + ay[1] * py * s, c[2] + ax[2] * px * s + ay[2] * py * s);
      lg.normals.push(0, 1, 0);
      lg.uvs.push((px + 1) / 2, (py + 1) / 2);
      lg.colors.push(col[0], col[1], col[2], 1);
    }
    lg.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  // ---- 夜の光の形 ----
  let glowE = null, glowMat = null, lit = -1, tris = 0;
  if (lg.indices.length) {
    const device = app.graphicsDevice;
    glowMat = new pc.StandardMaterial();
    glowMat.useLighting = false; glowMat.useSkybox = false; glowMat.useFog = false;
    glowMat.diffuse = new pc.Color(0, 0, 0);
    glowMat.emissive = new pc.Color(1, 1, 1); glowMat.emissiveVertexColor = true;
    glowMat.emissiveMap = glowTexture(device); glowMat.emissiveIntensity = 0;
    glowMat.blendType = pc.BLEND_ADDITIVE; glowMat.depthWrite = false; glowMat.cull = pc.CULLFACE_NONE;
    glowMat.update();
    glowE = new pc.Entity('landmark-glow');
    glowE.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, lg), glowMat)], castShadows: false, receiveShadows: false });
    glowE.enabled = false;
    app.root.addChild(glowE);
    tris = lg.indices.length / 3;
    sceneBudget.triangles += tris;
  }
  return {
    footprints,
    triangles: tris,
    /** 毎フレーム：night（0〜1。夕方から夜で 1）。ガソリンスタンドの屋根の灯は、人が消えても点いたまま */
    update(dt, night) {
      const v = Math.round(Math.min(1, Math.max(0, night)) * 50) / 50;
      if (v === lit || !glowMat) return;
      lit = v;
      glowE.enabled = v > 0.01;
      glowMat.emissiveIntensity = smoothstep(0, 1, v);
      glowMat.update();
    },
  };
}
