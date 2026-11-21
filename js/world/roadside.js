// 現代の村の道まわり（2026-11-21。利用者の指示：マップは全部現代。森のマップはヨーロッパの山村の現代・人が消えた直後。
//   作るのは 3 回に分けた ①「道と電気」）：
//   舗装の道（村をつなぐ道と村の小道。北西の深い森＝洞窟へ入る 2 本は土の林道のまま）・路肩の白線・コンクリートの橋（鉄の欄干）・
//   ガードレール（崖や川の側・橋の前後）・電柱と電線（家への引き込み線）・街灯（夕方と夜に点く）・道路標識・バス停
// 形は村と同じ入れ物（build-kit の builder）に貯める（描画命令は質感の数だけ）。標識の絵と、街灯の光だけは別の形
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { box, obox, prism, v3 } from './build-kit.js';
import { createRandom } from '../core/random.js';

const STEEL = [0.62, 0.64, 0.66];       // 亜鉛めっきの鉄
const DARK = [0.16, 0.16, 0.17];        // 黒い鉄・電線
const WHITE = [0.92, 0.92, 0.88];       // 白線
const POLE = [0.42, 0.33, 0.24];        // 木の電柱（防腐剤の茶色）

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 標識の絵（1 枚の絵に 8 つ並べる。128 × 128 ずつ） */
function signAtlas() {
  const S = 128, c = document.createElement('canvas');
  c.width = S * 4; c.height = S * 2;
  const g = c.getContext('2d');
  g.fillStyle = '#7b8086'; g.fillRect(0, 0, c.width, c.height);   // 板の裏・縁（灰色）
  const cell = (i, draw) => { g.save(); g.translate((i % 4) * S, Math.floor(i / 4) * S); draw(); g.restore(); };
  const speed = (n) => () => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c8102e'; g.lineWidth = 14; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 52px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 68);
  };
  const tri = (inner) => () => {
    g.fillStyle = '#c8102e'; g.beginPath(); g.moveTo(64, 6); g.lineTo(122, 112); g.lineTo(6, 112); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(64, 30); g.lineTo(104, 102); g.lineTo(24, 102); g.closePath(); g.fill();
    g.fillStyle = '#111'; g.strokeStyle = '#111'; inner();
  };
  cell(0, speed(50));
  cell(1, speed(70));
  cell(2, tri(() => { g.lineWidth = 7; g.beginPath(); g.moveTo(58, 96); g.lineTo(58, 70); g.quadraticCurveTo(58, 54, 74, 50); g.stroke(); g.beginPath(); g.moveTo(84, 50); g.lineTo(70, 40); g.lineTo(70, 60); g.closePath(); g.fill(); }));   // 右へ曲がる
  cell(3, tri(() => { g.lineWidth = 7; g.beginPath(); g.moveTo(70, 96); g.lineTo(70, 70); g.quadraticCurveTo(70, 54, 54, 50); g.stroke(); g.beginPath(); g.moveTo(44, 50); g.lineTo(58, 40); g.lineTo(58, 60); g.closePath(); g.fill(); }));   // 左へ曲がる
  cell(4, tri(() => {   // 動物（鹿）注意
    g.beginPath(); g.moveTo(42, 96); g.lineTo(46, 78); g.lineTo(52, 70); g.lineTo(76, 70); g.lineTo(82, 60); g.lineTo(80, 52); g.lineTo(86, 54); g.lineTo(90, 62);
    g.lineTo(86, 70); g.lineTo(84, 80); g.lineTo(80, 96); g.lineTo(76, 96); g.lineTo(76, 82); g.lineTo(56, 82); g.lineTo(50, 96); g.closePath(); g.fill();
    g.lineWidth = 3; g.beginPath(); g.moveTo(84, 54); g.lineTo(80, 42); g.moveTo(86, 54); g.lineTo(94, 44); g.moveTo(81, 47); g.lineTo(76, 44); g.stroke();
  }));
  cell(5, () => {   // 前方優先道路（止まって譲る）：下向きの三角
    g.fillStyle = '#c8102e'; g.beginPath(); g.moveTo(6, 16); g.lineTo(122, 16); g.lineTo(64, 120); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(28, 28); g.lineTo(100, 28); g.lineTo(64, 96); g.closePath(); g.fill();
  });
  cell(6, () => {   // バス停（黄色の丸に緑の H）
    g.fillStyle = '#f5c400'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#0a7a3a'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#0a7a3a'; g.font = 'bold 72px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 64, 68);
  });
  cell(7, () => { g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, S, S); });   // 板の裏
  return c;
}
const SIGN = { v50: 0, v70: 1, curveR: 2, curveL: 3, deer: 4, yield: 5, bus: 6, back: 7 };

/** 光の玉の絵（街灯の光・地面に落ちる光の輪。白。色は頂点の色で付ける）。加算で重ねるので黒地にする
 *  （透明にすると、薄い所の色が白のまま残り、四角や白い円がくっきり出た。2026-11-21）。ガソリンスタンドの屋根の灯（world/landmarks.js）も使う */
export function glowTexture(device) {
  const S = 128, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgb(255,255,255)'); gr.addColorStop(0.18, 'rgb(150,150,150)'); gr.addColorStop(0.45, 'rgb(45,45,45)'); gr.addColorStop(0.8, 'rgb(8,8,8)'); gr.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = new pc.Texture(device, { width: S, height: S, format: pc.PIXELFORMAT_RGBA8, mipmaps: true, name: 'lamp-glow' });
  t.setSource(c);
  return t;
}

/**
 * 道まわりを作る
 * @param {object} B 村の形の入れ物（build-kit の builder）
 * @param {object} o { app, config, terrain, plan, land, zones, obstacles, floors, sight, solid, solidLine, houses }
 * @returns {{ update(dt, night): void, footprints: object[], lamps: number, triangles: number }}
 */
export function buildRoadside(B, o) {
  const { app, config, terrain, plan, land, zones, obstacles, floors, sight, solid, solidLine } = o;
  const H = (x, z) => terrain.heightAt(x, z);
  const rnd = createRandom(config.seed + 2111);
  const roads = plan.roads;
  const footprints = [];
  const plazas = plan.wells.map((w) => w.plaza);
  const inPlaza = (x, z, pad = 0) => plazas.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + pad);
  // 家と、教会・ガソリンスタンドの敷地（plan.specials。world/landmarks.js）の近くか
  const nearHouse = (x, z, pad) => [...plan.houses, ...(plan.specials || [])].some((h) => {
    const a = (h.yaw * Math.PI) / 180, dx = x - h.x, dz = z - h.z;
    const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
    return Math.abs(lx) < h.w / 2 + pad && Math.abs(lz) < h.d / 2 + pad;
  });
  const wet = (x, z) => { const w = land.waterLevel(x, z); return !!(w && w.surface > H(x, z) - 0.05); };
  const onBridge = (r, i) => plan.bridges.some((b) => b.road === r && i >= b.i0 - 1 && i <= b.i1 + 1);
  const villageNear = (x, z, pad = 6) => plan.villages.find((v) => Math.hypot(x - v.x, z - v.z) < v.r + pad) || null;
  /** 道の i 番目の点の、進む向き（単位）と左の向き */
  const dirAt = (pts, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return { tx: dx / L, tz: dz / L, nx: -dz / L, nz: dx / L };
  };
  const halfOf = (r) => (r.lane ? 1.6 : r.w >= 2 ? 2.2 : 2.0);   // 舗装の幅の半分（m）

  // ================= 1. 舗装の道（アスファルトの帯）と白線 =================
  // 地面の起伏に沿わせる（横に 4 つに分けて、それぞれの点の地面の高さ + 4 cm）。広場の石畳の上と、橋の上（橋は別に作る）は描かない
  // 舗装するのは world/villages.js の ROADS の paved（村をつなぐ 4 本）と村の小道。森へ入る 2 本は土の林道のまま
  roads.forEach((r, ri) => {
    if (!r.paved) return;
    // 地面の網（2.6 m ごと）の頂点が帯の中で盛り上がると突き抜けるので、少し高めに浮かせる。道どうしが重なる所でちらつかないよう、少しずつ高さを変える
    const hw = halfOf(r), lift = 0.08 + (ri % 5) * 0.005;
    const lines = !r.lane;
    let prev = null;
    for (let i = 0; i < r.pts.length; i++) {
      const [x, z] = r.pts[i];
      const skip = onBridge(r, i) || inPlaza(x, z, -0.6) || wet(x, z);
      if (skip) { prev = null; continue; }
      const d = dirAt(r.pts, i);
      const across = [-1, -0.5, 0, 0.5, 1].map((k) => { const px = x + d.nx * hw * k, pz = z + d.nz * hw * k; return [px, H(px, pz) + lift, pz]; });
      const lineL = [-1, 1].map((sd) => [-0.28, -0.16].map((off) => { const k = sd * (hw + off); const px = x + d.nx * k, pz = z + d.nz * k; return [px, H(px, pz) + lift + 0.012, pz]; }));
      if (prev) {
        for (let k = 0; k < 4; k++) {
          const p0 = prev.across[k], p1 = prev.across[k + 1], p2 = across[k + 1], p3 = across[k];
          const nrm = v3.norm(v3.cross(v3.sub(p3, p0), v3.sub(p1, p0)));
          const n = nrm[1] < 0 ? v3.mul(nrm, -1) : nrm;
          const edge = (kk) => (kk === 0 || kk === 4 ? 0.78 : 1);   // 路肩は少し汚れて暗い
          B.quad('asphalt', p0, p1, p2, p3, n, 1, [edge(k), edge(k + 1), edge(k + 1), edge(k)]);
        }
        if (lines) for (let s = 0; s < 2; s++) {
          const a = prev.lineL[s], b = lineL[s];
          B.quad('paint', a[0], a[1], b[1], b[0], [0, 1, 0], WHITE);
        }
      }
      prev = { across, lineL };
    }
  });

  // ================= 2. コンクリートの橋（前の木の橋を作り替えた。利用者の指示 2026-11-21） =================
  //   床は厚いコンクリートの板（上はアスファルト）、両側に縁石と鉄の欄干。約 8 m ごとにコンクリートの橋脚（川床まで 2 本の柱と上の梁）。
  //   両端はコンクリートの橋台。歩ける面・欄干の当たり判定は前の橋と同じ
  for (const b of plan.bridges || []) {
    const dx = b.bx - b.ax, dz = b.bz - b.az, L = Math.hypot(dx, dz), yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
    const tx = dx / L, tz = dz / L, nx = -tz, nz = tx, hw = b.width / 2;
    const yAt = (t) => b.deck + b.camber * Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
    const at = (t, side = 0) => [b.ax + dx * t + nx * side, b.az + dz * t + nz * side];
    const N = [nx, 0, nz];
    const nSeg = Math.max(4, Math.round(L / 2));
    const curb = 0.36;   // 縁石の幅
    for (let k = 0; k < nSeg; k++) {
      const t0 = k / nSeg, t1 = (k + 1) / nSeg, y0 = yAt(t0), y1 = yAt(t1), segL = L / nSeg, sl = Math.hypot(segL, y1 - y0);
      const a = [tx * segL / sl, (y1 - y0) / sl, tz * segL / sl];
      const up0 = v3.norm(v3.cross(N, a)), up = up0[1] < 0 ? v3.mul(up0, -1) : up0;
      const [mx, mz] = at((t0 + t1) / 2), my = (y0 + y1) / 2;
      // 床の板（コンクリート。厚さ 0.55 m）と、上のアスファルト
      obox(B, 'concrete', [mx, my - 0.3, mz], a, N, up, sl + 0.02, b.width + 2 * curb + 0.3, 0.55, 0.92);
      const pA = (t, s) => { const [x, z] = at(t, s); return [x, yAt(t) + 0.005, z]; };
      B.quad('asphalt', pA(t0, -hw + 0.05), pA(t1, -hw + 0.05), pA(t1, hw - 0.05), pA(t0, hw - 0.05), up, 0.95);
      // 縁石（両側。高さ 0.22 m）
      for (const sd of [-1, 1]) {
        const [cx, cz] = at((t0 + t1) / 2, sd * (hw + curb / 2));
        obox(B, 'concrete', [cx, my + 0.11, cz], a, N, up, sl + 0.02, curb, 0.22, 1);
        sight?.addYawBox(cx, my, cz, curb, segL, 0.24, yaw);
      }
    }
    // 鉄の欄干：1.5 m ごとの柱、上の手すりと 2 本の横棒（縁石の上）
    const nPost = Math.max(2, Math.round(L / 1.5));
    for (const sd of [-1, 1]) {
      for (let k = 0; k <= nPost; k++) {
        const t = k / nPost, [x, z] = at(t, sd * (hw + curb / 2));
        box(B, 'steel', x, yAt(t) + 0.2, z, 0.07, 0.07, 0.95, yaw, { shade: 0.95 });
        if (k < nPost) {
          const t1 = (k + 1) / nPost, ya = yAt(t), yb = yAt(t1), segL = L / nPost, sl = Math.hypot(segL, yb - ya), a = [tx * segL / sl, (yb - ya) / sl, tz * segL / sl];
          const up0 = v3.norm(v3.cross(N, a)), up = up0[1] < 0 ? v3.mul(up0, -1) : up0;
          const [mx, mz] = at((t + t1) / 2, sd * (hw + curb / 2));
          obox(B, 'steel', [mx, (ya + yb) / 2 + 1.17, mz], a, N, up, sl + 0.02, 0.1, 0.06, 1);
          for (const hh of [0.5, 0.82]) obox(B, 'steel', [mx, (ya + yb) / 2 + hh, mz], a, N, up, sl, 0.04, 0.04, 0.9);
        }
      }
    }
    // 橋脚：約 8 m ごと。川床から床の下まで、2 本の四角い柱と上の梁
    const nSpan = Math.max(2, Math.round(L / 8));
    for (let k = 1; k < nSpan; k++) {
      const t = k / nSpan, y = yAt(t);
      for (const sd of [-1, 1]) {
        const [x, z] = at(t, sd * (hw - 0.4)), g = H(x, z);
        if (g < y - 0.8) box(B, 'concrete', x, g - 0.6, z, 0.75, 0.75, y - 0.55 - (g - 0.6), yaw, { shade: 0.85, grad: [0.62, 0.95] });
      }
      const [cx, cz] = at(t);
      box(B, 'concrete', cx, y - 1.15, cz, b.width + 0.9, 0.9, 0.6, yaw, { shade: 0.82, bottom: true });
    }
    // 橋台（両端。コンクリートの壁）と、欄干の端の太い柱
    for (const [t, out] of [[0, -1], [1, 1]]) {
      const [x, z] = at(t), g = Math.min(H(x + tx * out * 1.2, z + tz * out * 1.2), H(x, z), H(x - tx * out * 1.2, z - tz * out * 1.2)) - 0.8;
      box(B, 'concrete', x + tx * out * 0.4, g, z + tz * out * 0.4, b.width + 2 * curb + 0.6, 1.6, b.deck - 0.05 - g, yaw, { shade: 0.86, grad: [0.7, 1] });
      for (const sd of [-1, 1]) {
        const [px, pz] = at(t, sd * (hw + curb / 2));
        box(B, 'concrete', px + tx * out * 0.15, b.deck, pz + tz * out * 0.15, 0.4, 0.4, 1.3, yaw, { shade: 0.95 });
        solid(px + tx * out * 0.15, pz + tz * out * 0.15, 0.25, { y0: b.deck - 0.5, y1: b.deck + 1.4 });
      }
    }
    // 歩ける面（真ん中が少し高いので 4 つの坂）と、欄干の当たり判定
    for (let k = 0; k < 4; k++) {
      const t0 = k / 4, t1 = (k + 1) / 4, [cx, cz] = at((t0 + t1) / 2);
      floors.addRamp({ cx, cz, yaw, hw, hd: L / 8 + 0.02, y0: yAt(t0), y1: yAt(t1) });
    }
    for (const sd of [-1, 1]) {
      const n = Math.ceil(L / 0.6);
      for (let k = 0; k <= n; k++) {
        const t = k / n, [x, z] = at(t, sd * (hw + 0.15));
        obstacles.add(x, z, 0.3, true, { y0: yAt(t) - 0.5, y1: yAt(t) + 1.2 });
      }
    }
    footprints.push({ type: 'bridge', x: (b.ax + b.bx) / 2, z: (b.az + b.bz) / 2, w: b.width + 0.8, d: L, yaw });
  }

  // ================= 3. ガードレール：崖（道より 1.2 m 以上低い）・川の側・橋の前後 =================
  //   ほかの道（林道も）がつながる所の近くには置かない（入り口をふさがないように）
  const nearOtherRoad = (r, x, z) => roads.some((o) => o !== r && o.pts.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < (o.paved ? halfOf(o) : o.w) + 5));
  const rails = [];
  roads.forEach((r, ri) => {
    if (!r.paved || r.lane) return;
    const hw = halfOf(r);
    for (const sd of [-1, 1]) {
      const need = r.pts.map(([x, z], i) => {
        if (onBridge(r, i)) return false;
        const d = dirAt(r.pts, i), y = H(x, z);
        const ox = x + d.nx * sd * (hw + 2.6), oz = z + d.nz * sd * (hw + 2.6);
        const drop = y - H(ox, oz) > 1.2;
        const river = wet(x + d.nx * sd * (hw + 4.5), z + d.nz * sd * (hw + 4.5));
        const nearBridge = plan.bridges.some((b) => b.road === r && ((i >= b.i0 - 6 && i < b.i0 - 1) || (i > b.i1 + 1 && i <= b.i1 + 6)));
        return (drop || river || nearBridge) && !villageNear(x, z, -4) && !inPlaza(x, z, 2) && !nearOtherRoad(r, x, z);
      });
      // 続いている所（8 m 以上）だけ。前後に 1 点ずつ伸ばす
      let s0 = -1;
      for (let i = 0; i <= need.length; i++) {
        if (i < need.length && need[i]) { if (s0 < 0) s0 = i; continue; }
        if (s0 >= 0) {
          const a = Math.max(0, s0 - 1), b = Math.min(r.pts.length - 1, i);
          if (b - a >= 4) rails.push({ r, hw, sd, a, b });
          s0 = -1;
        }
      }
    }
  });
  for (const run of rails) {
    const { r, hw, sd, a, b } = run;
    const P = [];
    for (let i = a; i <= b; i++) {
      const [x, z] = r.pts[i], d = dirAt(r.pts, i), off = sd * (hw + 0.55);
      const px = x + d.nx * off, pz = z + d.nz * off;
      P.push([px, H(px, pz), pz, d]);
    }
    for (let k = 0; k < P.length; k++) {
      const [x, y, z, d] = P[k];
      const yaw = (Math.atan2(d.tx, d.tz) * 180) / Math.PI;
      box(B, 'steel', x, y - 0.35, z, 0.1, 0.12, 1.1, yaw, { shade: 0.8 });   // 柱（地面に 0.35 m 埋める）
      if (k < P.length - 1) {
        const [x1, y1, z1] = P[k + 1];
        const c = [(x + x1) / 2, (y + y1) / 2 + 0.6, (z + z1) / 2], dd = v3.sub([x1, y1, z1], [x, y, z]), len = Math.hypot(...dd), ax = v3.norm(dd);
        const nn = v3.norm(v3.cross(ax, [0, 1, 0])), up = v3.cross(nn, ax);
        // 波形の鉄の板（3 段の折れで、上と下を少しずらして見せる）
        obox(B, 'steel', v3.add(c, v3.mul(up, 0.09)), ax, up, nn, len + 0.05, 0.1, 0.05, 1.0);
        obox(B, 'steel', c, ax, up, nn, len + 0.05, 0.12, 0.07, 0.86);
        obox(B, 'steel', v3.add(c, v3.mul(up, -0.09)), ax, up, nn, len + 0.05, 0.1, 0.05, 1.0);
        solidLine(x, z, x1, z1, 0.22);
      }
    }
    // 端は地面へ曲げ下ろす（短い斜めの板）
    for (const [k, dir] of [[0, -1], [P.length - 1, 1]]) {
      const [x, y, z, d] = P[k], ex = x + d.tx * dir * 1.6, ez = z + d.tz * dir * 1.6, ey = H(ex, ez) + 0.15;
      const dd = v3.sub([ex, ey, ez], [x, y + 0.6, z]), len = Math.hypot(...dd), ax = v3.norm(dd), nn = v3.norm(v3.cross(ax, [0, 1, 0])), up = v3.cross(nn, ax);
      obox(B, 'steel', v3.add([x, y + 0.6, z], v3.mul(dd, 0.5)), ax, up, nn, len, 0.3, 0.06, 0.9);
    }
  }

  // ================= 4. 電柱と電線（村をつなぐ道に沿って、左側に約 32 m ごと。村の家へ引き込み線） =================
  const poles = [];
  roads.forEach((r, ri) => {
    if (!r.paved) return;
    const hw = halfOf(r), side = ri % 2 ? 1 : -1, step = r.lane ? 12 : 16;   // 点は 2 m ごと（16 点＝32 m）
    let chain = [];
    for (let i = 2; i < r.pts.length - 2; i += step) {
      const [x, z] = r.pts[i], d = dirAt(r.pts, i), off = side * (hw + 1.7);
      const px = x + d.nx * off, pz = z + d.nz * off;
      const bad = onBridge(r, i) || wet(px, pz) || inPlaza(px, pz, 1) || nearHouse(px, pz, 1.2) || land.cave.patchAt?.(px, pz);
      if (bad) { if (chain.length > 1) poles.push(chain); chain = []; continue; }
      chain.push({ x: px, z: pz, y: H(px, pz), yaw: (Math.atan2(d.tx, d.tz) * 180) / Math.PI });
    }
    if (chain.length > 1) poles.push(chain);
  });
  const ARM = 8.3, WIRES = [-0.65, 0, 0.65];
  const tip = (p, k) => { const a = (p.yaw * Math.PI) / 180, rx = Math.cos(a), rz = -Math.sin(a); return [p.x + rx * WIRES[k], p.y + ARM + 0.22, p.z + rz * WIRES[k]]; };
  /** 電線（たるみのある線）：細い板を 2 枚、十字に */
  const wire = (A, Bp, sag, w = 0.028) => {
    const n = 8;
    let last = A;
    for (let s = 1; s <= n; s++) {
      const t = s / n, p = [A[0] + (Bp[0] - A[0]) * t, A[1] + (Bp[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (Bp[2] - A[2]) * t];
      const d = v3.norm(v3.sub(p, last)), side = v3.mul(v3.norm(v3.cross(d, [0, 1, 0])), w), up = v3.mul(v3.norm(v3.cross(side, d)), w);
      B.quad('cloth', v3.sub(last, side), v3.add(last, side), v3.add(p, side), v3.sub(p, side), [0, 1, 0], DARK);
      B.quad('cloth', v3.sub(last, up), v3.add(last, up), v3.add(p, up), v3.sub(p, up), v3.norm(side), DARK);
      last = p;
    }
  };
  let poleCount = 0;
  for (const chain of poles) {
    chain.forEach((p, k) => {
      poleCount++;
      prism(B, 'wood', [p.x, p.y + 4.3 - 0.6, p.z], [0, 1, 0], 9.8, 0.13, 8, 0.62, { caps: true });
      const a = (p.yaw * Math.PI) / 180, R = [Math.cos(a), 0, -Math.sin(a)];
      obox(B, 'wood', [p.x, p.y + ARM, p.z], R, [0, 1, 0], [Math.sin(a), 0, Math.cos(a)], 1.7, 0.1, 0.1, 0.55);   // 腕木
      for (let w = 0; w < 3; w++) { const q = tip(p, w); prism(B, 'cloth', [q[0], q[1] - 0.12, q[2]], [0, 1, 0], 0.2, 0.05, 6, [0.85, 0.85, 0.82]); }   // 碍子
      solid(p.x, p.z, 0.2);
      sight?.addCyl(p.x, p.z, 0.13, p.y, p.y + 9);
      if (k > 0) for (let w = 0; w < 3; w++) wire(tip(chain[k - 1], w), tip(p, w), 0.45);
    });
    // 引き込み線：電柱から 16 m 以内の家（村の中）へ 1 本
    for (const p of chain) {
      for (const h of plan.houses) {
        const d = Math.hypot(h.x - p.x, h.z - p.z);
        if (d > 16 || d < 3 || !villageNear(p.x, p.z, 2)) continue;
        const ux = (p.x - h.x) / d, uz = (p.z - h.z) / d, edge = Math.min(h.w, h.d) / 2;
        const hx = h.x + ux * edge, hz = h.z + uz * edge;
        wire(tip(p, 0), [hx, H(h.x, h.z) + 3.4, hz], 0.25, 0.018);
        break;
      }
    }
  }

  // ================= 5. 街灯（村の中の道と広場。夕方と夜に点く） =================
  const lamps = [];
  roads.forEach((r, ri) => {
    if (!r.paved) return;
    const hw = halfOf(r);
    let side = 1, last = -99;
    for (let i = 1; i < r.pts.length - 1; i++) {
      const [x, z] = r.pts[i];
      if (!villageNear(x, z, 4) || i - last < 11) continue;   // 村の中だけ、約 22 m ごと
      const d = dirAt(r.pts, i), off = side * (hw + 0.9);
      const px = x + d.nx * off, pz = z + d.nz * off;
      if (onBridge(r, i) || inPlaza(px, pz, 0.6) || nearHouse(px, pz, 0.8) || wet(px, pz)) continue;
      lamps.push({ x: px, z: pz, y: H(px, pz), ax: -d.nx * side, az: -d.nz * side });
      side = -side; last = i;
    }
  });
  for (const q of plazas) {   // 広場の縁に 1 本ずつ（昔ふうの灯籠形）
    const a = rnd.next() * Math.PI * 2, px = q.x + Math.cos(a) * (q.r - 0.8), pz = q.z + Math.sin(a) * (q.r - 0.8);
    if (!nearHouse(px, pz, 0.6)) lamps.push({ x: px, z: pz, y: H(px, pz), ax: 0, az: 0, old: true });
  }
  const LAMP_H = 5.2;
  for (const L of lamps) {
    if (L.old) {
      prism(B, 'steel', [L.x, L.y + 1.7, L.z], [0, 1, 0], 3.4, 0.07, 8, DARK);
      box(B, 'steel', L.x, L.y + 3.35, L.z, 0.34, 0.34, 0.06, 0, { shade: DARK });
      box(B, 'cloth', L.x, L.y + 3.41, L.z, 0.26, 0.26, 0.38, 0, { shade: [0.95, 0.9, 0.75] });   // 灯の箱（明かり）
      box(B, 'steel', L.x, L.y + 3.79, L.z, 0.4, 0.4, 0.08, 0, { shade: DARK });
      L.head = [L.x, L.y + 3.6, L.z];
    } else {
      // 細い鉄の柱と、道へ伸びる腕、平たい灯の箱
      prism(B, 'steel', [L.x, L.y + LAMP_H / 2, L.z], [0, 1, 0], LAMP_H, 0.06, 8, [0.38, 0.4, 0.42]);
      const hx = L.x + L.ax * 1.1, hz = L.z + L.az * 1.1, top = L.y + LAMP_H;
      const dd = v3.sub([hx, top + 0.05, hz], [L.x, top - 0.25, L.z]), len = Math.hypot(...dd), ax = v3.norm(dd), nn = v3.norm(v3.cross(ax, [0, 1, 0])), up = v3.cross(nn, ax);
      obox(B, 'steel', v3.add([L.x, top - 0.25, L.z], v3.mul(dd, 0.5)), ax, up, nn, len, 0.07, 0.07, [0.38, 0.4, 0.42]);
      const yaw = (Math.atan2(L.ax, L.az) * 180) / Math.PI;
      box(B, 'steel', hx, top - 0.04, hz, 0.28, 0.62, 0.11, yaw, { shade: [0.3, 0.31, 0.33], bottom: true });
      L.head = [hx, top - 0.06, hz];
    }
    solid(L.x, L.z, 0.15);
    sight?.addCyl(L.x, L.z, 0.07, L.y, L.y + 4);
  }

  // ================= 6. 道路標識（村の入り口の速度・カーブ・動物注意・譲れ） =================
  const signs = [];
  const sign = (x, z, faceYaw, kind, h = 2.2) => signs.push({ x, z, y: H(x, z), yaw: faceYaw, kind, h });
  roads.forEach((r, ri) => {
    if (!r.paved || r.lane) return;
    const hw = halfOf(r);
    // 村の入り口：村の広がりに入る所で、入ってくる車に見える向きに「50」、出ていく側に「70」
    let inV = !!villageNear(r.pts[0][0], r.pts[0][1], 6);
    for (let i = 1; i < r.pts.length; i++) {
      const [x, z] = r.pts[i], now = !!villageNear(x, z, 6);
      if (now !== inV && !onBridge(r, i)) {
        const d = dirAt(r.pts, i), forward = now ? 1 : -1;   // 入ってくる向き（今の点が村の中なら、道の進む向き）
        const sx = x + d.nx * -forward * (hw + 0.9), sz = z + d.nz * -forward * (hw + 0.9);
        if (!nearHouse(sx, sz, 0.8)) sign(sx, sz, (Math.atan2(-d.tx * forward, -d.tz * forward) * 180) / Math.PI, 'v50');
        const ox = x + d.nx * forward * (hw + 0.9), oz = z + d.nz * forward * (hw + 0.9);
        if (!nearHouse(ox, oz, 0.8)) sign(ox, oz, (Math.atan2(d.tx * forward, d.tz * forward) * 180) / Math.PI, 'v70');
      }
      inV = now;
    }
    // カーブ：20 m で向きが 40° 以上変わる所の手前（村の外）。動物注意：森の中の長い所に 1 枚
    let lastCurve = -99, deerDone = false;
    for (let i = 6; i < r.pts.length - 10; i++) {
      const [x, z] = r.pts[i];
      if (villageNear(x, z, 10) || onBridge(r, i)) continue;
      const d0 = dirAt(r.pts, i), d1 = dirAt(r.pts, i + 10);
      const turn = Math.atan2(d0.tx * d1.tz - d0.tz * d1.tx, d0.tx * d1.tx + d0.tz * d1.tz);
      if (Math.abs(turn) > 0.7 && i - lastCurve > 25) {
        const sx = x + d0.nx * -(hw + 0.9), sz = z + d0.nz * -(hw + 0.9);
        sign(sx, sz, (Math.atan2(-d0.tx, -d0.tz) * 180) / Math.PI, turn > 0 ? 'curveL' : 'curveR');
        lastCurve = i;
      }
      const w = zones.weights(x, z);
      if (!deerDone && (w.mixed + w.deep) > 0.8 && i > 20) {
        const sx = x + d0.nx * (hw + 0.9), sz = z + d0.nz * (hw + 0.9);
        sign(sx, sz, (Math.atan2(d0.tx, d0.tz) * 180) / Math.PI, 'deer');
        deerDone = true;
      }
    }
  });
  // 村の小道が大きな道に出る所：譲れ
  for (const r of roads) if (r.lane) {
    const [x, z] = r.pts[3] || r.pts[r.pts.length - 1], d = dirAt(r.pts, 3);
    sign(x + d.nx * (halfOf(r) + 0.7), z + d.nz * (halfOf(r) + 0.7), (Math.atan2(d.tx, d.tz) * 180) / Math.PI, 'yield');
  }

  // ================= 7. バス停（村ごとに 1 つ。広場に一番近い大きな道の脇に、屋根と長椅子と標識） =================
  const stops = [];
  for (const v of plan.villages) {
    let best = null;
    roads.forEach((r, ri) => {
      if (!r.paved || r.lane) return;
      for (let i = 3; i < r.pts.length - 3; i++) {
        if (onBridge(r, i)) continue;
        const [x, z] = r.pts[i], dv = Math.hypot(x - v.x, z - v.z);
        if (dv > v.r * 0.8) continue;
        const d = dirAt(r.pts, i);
        for (const sd of [-1, 1]) {
          const off = sd * (halfOf(r) + 2.0), px = x + d.nx * off, pz = z + d.nz * off;
          if (nearHouse(px, pz, 2.2) || inPlaza(px, pz, 2) || wet(px, pz)) continue;
          const score = Math.abs(dv - v.r * 0.45) + Math.abs(H(px, pz) - H(x, z)) * 6;
          if (!best || score < best.score) best = { score, x: px, z: pz, d, sd };
        }
      }
    });
    if (!best) continue;
    const { d, sd } = best, y = H(best.x, best.z);
    const yaw = (Math.atan2(d.tx, d.tz) * 180) / Math.PI;
    // 台（コンクリート 3.6 × 2.0）
    box(B, 'concrete', best.x, y - 0.25, best.z, 2.0, 3.6, 0.38, yaw, { shade: 0.9 });
    // 柱 4 本・屋根・背中の板・横の板
    for (const [al, ou] of [[-1.6, -0.8], [1.6, -0.8], [-1.6, 0.8], [1.6, 0.8]]) {
      const [px, pz] = [best.x + d.tx * al + d.nx * sd * ou, best.z + d.tz * al + d.nz * sd * ou];
      box(B, 'steel', px, y + 0.13, pz, 0.08, 0.08, 2.35, yaw, { shade: [0.3, 0.32, 0.34] });
    }
    box(B, 'steel', best.x, y + 2.48, best.z, 2.0, 3.6, 0.1, yaw, { shade: [0.32, 0.34, 0.36], bottom: true });
    const [bx, bz] = [best.x + d.nx * sd * 0.8, best.z + d.nz * sd * 0.8];
    box(B, 'cloth', bx, y + 0.35, bz, 0.04, 3.2, 1.9, yaw, { shade: [0.42, 0.5, 0.55] });   // 背中の板（くもったガラスのような色）
    box(B, 'wood', best.x + d.nx * sd * 0.55, y + 0.55, best.z + d.nz * sd * 0.55, 0.4, 2.4, 0.06, yaw, { shade: 0.85, bottom: true });   // 長椅子
    for (const al of [-1, 1]) box(B, 'steel', best.x + d.nx * sd * 0.55 + d.tx * al * 1.1, y + 0.13, best.z + d.nz * sd * 0.55 + d.tz * al * 1.1, 0.35, 0.05, 0.42, yaw, { shade: DARK });
    solidLine(bx - d.tx * 1.6, bz - d.tz * 1.6, bx + d.tx * 1.6, bz + d.tz * 1.6, 0.25);
    sight?.addYawBox(bx, y + 0.35, bz, 0.06, 3.2, 1.9, yaw);
    // 標識の柱（屋根の端の外）
    const [sx, sz] = [best.x + d.tx * 2.3 - d.nx * sd * 0.6, best.z + d.tz * 2.3 - d.nz * sd * 0.6];
    sign(sx, sz, (Math.atan2(d.tx, d.tz) * 180) / Math.PI, 'bus', 2.4);
    stops.push({ x: best.x, z: best.z });
    footprints.push({ type: 'rect', x: best.x, z: best.z, w: 2.0, d: 3.6, yaw });
  }

  // 標識の柱（鉄のパイプ）と板の裏
  for (const s of signs) {
    prism(B, 'steel', [s.x, s.y + s.h / 2 - 0.3, s.z], [0, 1, 0], s.h + 0.6, 0.035, 6, STEEL);
    solid(s.x, s.z, 0.08);
  }

  // ---- 標識の絵（1 つの形） ----
  const device = app.graphicsDevice;
  const sg = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  for (const s of signs) {
    const cell = SIGN[s.kind], u0 = (cell % 4) / 4, v0 = Math.floor(cell / 4) / 2, du = 1 / 4, dv = 1 / 2;
    const a = (s.yaw * Math.PI) / 180, fx = Math.sin(a), fz = Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
    const half = s.kind === 'bus' ? 0.26 : 0.36, cy = s.y + s.h, cx = s.x + fx * 0.05, cz = s.z + fz * 0.05;
    const quad = (front, uA, vA) => {
      const b = sg.positions.length / 3, k = front ? 1 : -1;
      const P = [[-half, -half], [half, -half], [half, half], [-half, half]];
      for (const [i, [px, py]] of P.entries()) {
        const sx = front ? px : -px;
        sg.positions.push(cx + rx * sx - fx * (front ? 0 : 0.01), cy + py, cz + rz * sx - fz * (front ? 0 : 0.01));
        sg.normals.push(fx * k, 0, fz * k);
        const U = [0, 1, 1, 0][i], V = [1, 1, 0, 0][i];
        sg.uvs.push(uA + U * du, vA + V * dv);   // 絵の上が v＝0（canvas の上の行）
        sg.colors.push(1, 1, 1, 1);
      }
      sg.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    quad(true, u0, v0);
    quad(false, (SIGN.back % 4) / 4, Math.floor(SIGN.back / 4) / 2);
  }
  let signTris = 0;
  if (sg.indices.length) {
    const tex = new pc.Texture(device, { width: 512, height: 256, format: pc.PIXELFORMAT_RGBA8, mipmaps: true, name: 'road-signs', anisotropy: 4 });
    tex.setSource(signAtlas());
    const m = new pc.StandardMaterial();
    m.diffuseMap = tex; m.diffuse = new pc.Color(1, 1, 1);
    m.useMetalness = true; m.metalness = 0; m.gloss = 0.45; m.cull = pc.CULLFACE_NONE;
    m.update();
    const e = new pc.Entity('road-signs');
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, sg), m)], castShadows: true, receiveShadows: true });
    app.root.addChild(e);
    signTris = sg.indices.length / 3;
  }

  // ---- 街灯の光（1 つの形。加算で重ねる。夕方と夜だけ） ----
  const lg = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  const glowQuad = (c, ax, ay, s, col) => {
    const b = lg.positions.length / 3;
    for (const [i, [px, py]] of [[-1, -1], [1, -1], [1, 1], [-1, 1]].entries()) {
      lg.positions.push(c[0] + ax[0] * px * s + ay[0] * py * s, c[1] + ax[1] * px * s + ay[1] * py * s, c[2] + ax[2] * px * s + ay[2] * py * s);
      lg.normals.push(0, 1, 0);
      lg.uvs.push((px + 1) / 2, (py + 1) / 2);
      lg.colors.push(col[0], col[1], col[2], 1);
    }
    lg.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (const L of lamps) {
    const warm = L.old ? [1, 0.72, 0.38] : [1, 0.86, 0.62];
    // 灯のまわりの光（十字に 2 枚と、下向きの 1 枚）
    const hot = warm.map((c) => c * 0.8);
    glowQuad(L.head, [1, 0, 0], [0, 1, 0], 0.75, hot);
    glowQuad(L.head, [0, 0, 1], [0, 1, 0], 0.75, hot);
    glowQuad([L.head[0], L.head[1] - 0.05, L.head[2]], [1, 0, 0], [0, 0, 1], 0.6, hot);
    // 地面に落ちる光の輪（地面の少し上。坂に沿うよう 4 つの角の高さを測る）
    const R = L.old ? 3.2 : 4.4, gx = L.head[0], gz = L.head[2];
    const b = lg.positions.length / 3, dim = L.old ? 0.16 : 0.2;
    for (const [i, [px, pz]] of [[-1, -1], [1, -1], [1, 1], [-1, 1]].entries()) {
      const x = gx + px * R, z = gz + pz * R;
      lg.positions.push(x, H(x, z) + 0.09, z);
      lg.normals.push(0, 1, 0); lg.uvs.push((px + 1) / 2, (pz + 1) / 2);
      lg.colors.push(warm[0] * dim, warm[1] * dim, warm[2] * dim, 1);
    }
    lg.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  let glowE = null, glowMat = null, glowTris = 0;
  if (lg.indices.length) {
    glowMat = new pc.StandardMaterial();
    glowMat.useLighting = false; glowMat.useSkybox = false; glowMat.useFog = false;   // 加算の板に霧の色が足されると、遠くで四角く見えた
    glowMat.diffuse = new pc.Color(0, 0, 0);
    glowMat.emissive = new pc.Color(1, 1, 1); glowMat.emissiveVertexColor = true;
    glowMat.emissiveMap = glowTexture(device); glowMat.emissiveIntensity = 0;
    glowMat.blendType = pc.BLEND_ADDITIVE; glowMat.depthWrite = false; glowMat.cull = pc.CULLFACE_NONE;
    glowMat.update();
    glowE = new pc.Entity('street-lamp-glow');
    glowE.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, lg), glowMat)], castShadows: false, receiveShadows: false });
    glowE.enabled = false;
    app.root.addChild(glowE);
    glowTris = lg.indices.length / 3;
  }
  sceneBudget.triangles += signTris + glowTris;
  let lit = -1;
  return {
    footprints,
    lamps: lamps.length, poles: poleCount, signs: signs.length, rails: rails.length, stops: stops.length,
    /** 確かめ用：置いた所 */
    where: { stops, signs: signs.map((s) => ({ x: s.x, z: s.z, kind: s.kind, yaw: s.yaw })), lamps: lamps.map((l) => ({ x: l.x, z: l.z, old: !!l.old })) },
    /** 毎フレーム：night（0〜1。夕方から夜で 1） */
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
