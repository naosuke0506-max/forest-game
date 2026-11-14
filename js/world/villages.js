// 村 3 つ・道・橋の配置を決める（計算だけ。PlayCanvas に依存しない）。利用者の指示（2026-11-14）：
//   「村も正方形の作りですが、現実ではおかしいので」「村はひとつを大きくするのではなく、村を 3 箇所ぐらい作ってください」
//   山邑（北東の山のふもと）・川邑（川の西岸）・野邑（東の大草原）。柵で囲まず、曲がった道に沿って家が並ぶ（向きも間もばらばら）
//   道：村と村、盆地の真ん中、北西の深い森（洞窟の予定地）を、曲がりくねった土の道でつなぐ。川を渡る所は橋（浅瀬は歩いて渡る）
//   家の下だけ地面を平らにする（坂では段々になる。world/terrain.js が pads を使う）
// 形を作るのは world/castle.js。名前（山邑・川邑・野邑）は Claude の仮の名前
import { createRandom } from '../core/random.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 村：真ん中・広がりの半径・家の数 */
export const VILLAGES = [
  { id: 'mountain', name: '山邑', x: 44, z: -114, r: 32, houses: 6 },
  { id: 'river', name: '川邑', x: -10, z: 62, r: 40, houses: 10 },
  { id: 'field', name: '野邑', x: 108, z: -16, r: 34, houses: 7 },
];

/** 道（通る点。なめらかな線にする）：w は道の幅の半分 */
const ROADS = [
  { w: 2.0, pts: [[44, -114], [64, -84], [86, -50], [108, -16]] },                                  // 山邑 → 野邑
  { w: 2.0, pts: [[108, -16], [96, 14], [66, 36], [36, 52], [8, 62], [-10, 62]] },                // 野邑 → 橋 → 川邑
  { w: 2.0, pts: [[-10, 62], [-30, 48], [-52, 16], [-80, -16], [-104, -44]] },                     // 川邑 → 北西の深い森（洞窟の予定地）
  { w: 1.8, pts: [[44, -114], [16, -104], [-6, -92], [-30, -88], [-58, -74], [-84, -56], [-104, -44]] },   // 山邑 → 浅瀬 → 深い森
  { w: 1.8, pts: [[0, 0], [16, 2], [34, -2], [60, -12], [86, -50]] },                              // 盆地の真ん中 → 橋 → 山邑と野邑の道
  { w: 1.8, pts: [[0, 0], [-10, 20], [-30, 48]] },                                                // 盆地の真ん中 → 川邑の道
];
const LANES = 1.4;   // 村の中の小道の幅の半分
const GRID = 2;      // 道と村の広がりを覚えておく升目（m）

/** なめらかな線（Catmull-Rom）で、step m ごとに区切る */
function spline(pts, step) {
  const out = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const c = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** 向き付きの四角（家）の角 */
function corners(h, pad = 0) {
  const a = (h.yaw * Math.PI) / 180, R = [Math.cos(a), -Math.sin(a)], F = [Math.sin(a), Math.cos(a)];
  const hw = h.w / 2 + pad, hd = h.d / 2 + pad;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [h.x + R[0] * sx * hw + F[0] * sz * hd, h.z + R[1] * sx * hw + F[1] * sz * hd]);
}
/** 2 つの向き付きの四角が重なるか（分離軸） */
function overlap(a, b, pad) {
  const A = corners(a, pad / 2), B = corners(b, pad / 2);
  for (const poly of [A, B]) for (let i = 0; i < 4; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % 4];
    const nx = z1 - z0, nz = -(x1 - x0);
    const pa = A.map(([x, z]) => x * nx + z * nz), pb = B.map(([x, z]) => x * nx + z * nz);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}
/** 点から向き付きの四角までの距離（中なら 0） */
function rectDist(h, x, z) {
  const a = (h.yaw * Math.PI) / 180, dx = x - h.x, dz = z - h.z;
  const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
  return Math.hypot(Math.max(0, Math.abs(lx) - h.w / 2), Math.max(0, Math.abs(lz) - h.d / 2));
}

/**
 * @param {number} seed 種
 * @param {object} land world/landform.js（地面の高さ・水・水辺）
 * @param {{ size: number, playRadius: number }} o
 */
export function planVillages(seed, land, { size, playRadius }) {
  const rnd = createRandom(seed + 4321);
  const half = size / 2;

  // ---- 1. 道：通る点の間に、横へずらした点を足して曲がりくねらせる（まっすぐな道は不自然なので） ----
  const wiggle = (pts) => {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / L, nz = (bx - ax) / L, amp = Math.min(9, L * 0.12);
      for (const t of [1 / 3, 2 / 3]) {
        const o = (rnd.next() - 0.5) * 2 * amp;
        out.push([ax + (bx - ax) * t + nx * o, az + (bz - az) * t + nz * o]);
      }
      out.push(pts[i + 1]);
    }
    return out;
  };
  const roads = ROADS.map((r) => ({ w: r.w, pts: spline(wiggle(r.pts), 2) }));
  // 村の中の小道：村の真ん中に一番近い道の点から、横へ曲がって伸びる（家がまっすぐ一列に並ばないように）
  for (const v of VILLAGES) {
    let best = null;
    for (const r of roads) for (let i = 1; i < r.pts.length - 1; i++) {
      const d = Math.hypot(r.pts[i][0] - v.x, r.pts[i][1] - v.z);
      if (!best || d < best.d) best = { r, i, d };
    }
    const [px, pz] = best.r.pts[best.i], [qx, qz] = best.r.pts[best.i + 1];
    const tl = Math.hypot(qx - px, qz - pz) || 1, tx = (qx - px) / tl, tz = (qz - pz) / tl;
    const side = rnd.next() < 0.5 ? -1 : 1, nx = -tz * side, nz = tx * side;
    const bend = (rnd.next() - 0.5) * 0.8;
    const L = v.r * 0.75;
    const lane = [[px, pz], [px + nx * L * 0.35 + tx * L * 0.1, pz + nz * L * 0.35 + tz * L * 0.1],
      [px + (nx + tx * bend) * L * 0.7, pz + (nz + tz * bend) * L * 0.7], [px + (nx + tx * bend * 1.6) * L, pz + (nz + tz * bend * 1.6) * L]];
    roads.push({ w: LANES, pts: spline(lane, 2), lane: true, village: v.id });
  }

  // ---- 2. 橋：道が川を渡る所（水が 0.8 m より深い所がある所。浅瀬は歩いて渡る） ----
  const bridges = [];
  const wetAt = (x, z) => { const w = land.waterLevel(x, z); return w && w.surface > land.heightAt(x, z) ? w : null; };
  for (const r of roads) {
    let run = null;
    for (let i = 0; i < r.pts.length; i++) {
      const [x, z] = r.pts[i];
      const w = wetAt(x, z);
      if (w) {
        const depth = w.surface - land.heightAt(x, z);
        if (!run) run = { i0: i, i1: i, deep: 0, surface: w.surface };
        run.i1 = i; run.deep = Math.max(run.deep, depth);
      } else if (run) {
        if (run.deep > 0.8) {
          const a = r.pts[Math.max(0, run.i0 - 2)], b = r.pts[Math.min(r.pts.length - 1, run.i1 + 2)];
          const ha = land.heightAt(a[0], a[1]), hb = land.heightAt(b[0], b[1]);
          bridges.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], ha, hb, surface: run.surface,
            top: Math.max(ha, hb, run.surface + 1.5) + 0.35, width: 3.2 });
        }
        run = null;
      }
    }
  }

  // ---- 3. 家：村ごとに、道（と小道）に沿って、真ん中から外へ。向きは道の方（扉が道を向く）、少しずらす ----
  const houses = [], wells = [];
  const roadNear = (x, z, R) => {
    const out = [];
    for (const r of roads) for (const p of r.pts) if (Math.abs(p[0] - x) < R && Math.abs(p[1] - z) < R) out.push({ x: p[0], z: p[1], w: r.w });
    return out;
  };
  for (const v of VILLAGES) {
    // 井戸と広場：村の真ん中に一番近い道の点の横
    let c = null;
    for (const r of roads) for (let i = 1; i < r.pts.length - 1; i++) {
      if (r.lane) continue;
      const d = Math.hypot(r.pts[i][0] - v.x, r.pts[i][1] - v.z);
      if (!c || d < c.d) c = { r, i, d };
    }
    {
      const [px, pz] = c.r.pts[c.i], [qx, qz] = c.r.pts[c.i + 1];
      const tl = Math.hypot(qx - px, qz - pz) || 1, nx = -(qz - pz) / tl, nz = (qx - px) / tl;
      const s = rnd.next() < 0.5 ? -1 : 1;
      wells.push({ village: v.id, x: px + nx * s * (c.r.w + 3.2), z: pz + nz * s * (c.r.w + 3.2), plaza: { x: px + nx * s * 1.5, z: pz + nz * s * 1.5, r: 6.5 } });
    }
    const well = wells[wells.length - 1];
    const mine = [];
    const tryHouse = (px, pz, tx, tz, side, rw) => {
      const two = rnd.next() < 0.42;
      const w = two ? 6 + rnd.next() * 2.2 : 5 + rnd.next() * 2.4;
      const d = two ? 7.2 + rnd.next() * 1.4 : 5.8 + rnd.next() * 1.8;
      const setback = rw + 1.4 + rnd.next() * 2.2;
      const nx = -tz * side, nz = tx * side;
      const h = { x: px + nx * (setback + d / 2), z: pz + nz * (setback + d / 2), w, d, stories: two ? 2 : 1 };
      h.yaw = (Math.atan2(-nx, -nz) * 180) / Math.PI + (rnd.next() - 0.5) * 22;   // 扉（家の +z の面）が道を向く
      if (Math.hypot(h.x - v.x, h.z - v.z) > v.r || Math.hypot(h.x, h.z) > playRadius - 14) return false;
      if (houses.some((o) => overlap(o, h, 2.2))) return false;
      if (rectDist(h, well.x, well.z) < 2.8 || rectDist(h, well.plaza.x, well.plaza.z) < well.plaza.r - 1) return false;
      for (const q of roadNear(h.x, h.z, 14)) if (rectDist(h, q.x, q.z) < q.w + 0.7) return false;
      for (const b of bridges) if (Math.hypot(h.x - (b.ax + b.bx) / 2, h.z - (b.az + b.bz) / 2) < 14) return false;
      const cs = corners(h, 0.6);
      if (cs.some(([x, z]) => land.wet(x, z) > 0.02) || land.wet(h.x, h.z) > 0.02) return false;
      const hs = cs.map(([x, z]) => land.heightAt(x, z));
      if (Math.max(...hs) - Math.min(...hs) > 3.4) return false;   // 急すぎる坂には建てない（それより緩い坂は、家の下を平らにして段々にする）
      // 家の下の平らにする高さ：扉の前の地面（段差を作らず、入り口が地面とつながる）
      const fa = (h.yaw * Math.PI) / 180;
      h.y0 = land.heightAt(h.x + Math.sin(fa) * (h.d / 2 + 0.8), h.z + Math.cos(fa) * (h.d / 2 + 0.8));
      h.village = v.id;
      houses.push(h); mine.push(h);
      return true;
    };
    // 道の点を、村の真ん中に近い順に試す（両側）。何度か回して、決まった数まで
    const slots = [];
    for (const r of roads) {
      if (r.lane && r.village !== v.id) continue;
      for (let i = 1; i < r.pts.length - 1; i += 2) {
        const [px, pz] = r.pts[i];
        const dist = Math.hypot(px - v.x, pz - v.z);
        if (dist > v.r) continue;
        const [qx, qz] = r.pts[i + 1], tl = Math.hypot(qx - px, qz - pz) || 1;
        for (const side of [-1, 1]) slots.push({ px, pz, tx: (qx - px) / tl, tz: (qz - pz) / tl, side, rw: r.w, dist: dist + rnd.next() * 6 });
      }
    }
    slots.sort((a, b) => a.dist - b.dist);
    for (const s of slots) {
      if (mine.length >= v.houses) break;
      tryHouse(s.px, s.pz, s.tx, s.tz, s.side, s.rw);
    }
    v.built = mine.length;
  }

  // 野邑の畑：村の外側の、道と家と水を避けた所に、柵で囲った長方形を 3 つ
  const fields = [];
  {
    const v = VILLAGES.find((q) => q.id === 'field');
    for (let k = 0; k < 40 && fields.length < 3; k++) {
      const a = rnd.next() * Math.PI * 2, dist = v.r + 4 + rnd.next() * 14;
      const f = { x: v.x + Math.cos(a) * dist, z: v.z + Math.sin(a) * dist, w: 18 + rnd.next() * 8, d: 12 + rnd.next() * 6, yaw: rnd.next() * 180 };
      if (Math.hypot(f.x, f.z) > playRadius - 16) continue;
      if (houses.some((o) => overlap(o, f, 3)) || fields.some((o) => overlap(o, f, 4))) continue;
      if (roadNear(f.x, f.z, 24).some((q) => rectDist(f, q.x, q.z) < q.w + 1.2)) continue;
      if (corners(f, 1).some(([x, z]) => land.wet(x, z) > 0)) continue;
      fields.push(f);
    }
  }

  // ---- 4. 平らにする所（家の下と広場）と、道・村の広がりの升目 ----
  const pads = [
    ...houses.map((h) => ({ x: h.x, z: h.z, w: h.w + 1.2, d: h.d + 2.2, yaw: h.yaw, y: h.y0, fade: 3.5 })),
    ...wells.map((w) => ({ x: w.plaza.x, z: w.plaza.z, w: w.plaza.r * 2, d: w.plaza.r * 2, yaw: 0, y: land.heightAt(w.plaza.x, w.plaza.z), fade: 4 })),
  ];
  const PC = 8, padGrid = new Map();
  pads.forEach((p, i) => {
    const R = Math.hypot(p.w, p.d) / 2 + p.fade;
    for (let gx = Math.floor((p.x - R) / PC); gx <= Math.floor((p.x + R) / PC); gx++) for (let gz = Math.floor((p.z - R) / PC); gz <= Math.floor((p.z + R) / PC); gz++) {
      const k = gx * 65536 + gz;
      if (!padGrid.has(k)) padGrid.set(k, []);
      padGrid.get(k).push(i);
    }
  });
  /** 平らにした地面の高さ：h（元の高さ）を、近くの平らにする所の高さへ寄せる */
  function padHeight(x, z, h) {
    const l = padGrid.get(Math.floor(x / PC) * 65536 + Math.floor(z / PC));
    if (!l) return h;
    let bw = 0, by = h;
    for (const i of l) {
      const p = pads[i];
      const w = 1 - smooth(0, p.fade, rectDist(p, x, z));
      if (w > bw) { bw = w; by = p.y; }
    }
    return h + (by - h) * bw;
  }

  const N = Math.ceil(size / GRID) + 1;
  const pathG = new Float32Array(N * N), areaG = new Float32Array(N * N);
  const stamp = (G, x, z, r0, r1) => {
    const g0x = Math.max(0, Math.floor((x - r1 + half) / GRID)), g1x = Math.min(N - 1, Math.ceil((x + r1 + half) / GRID));
    const g0z = Math.max(0, Math.floor((z - r1 + half) / GRID)), g1z = Math.min(N - 1, Math.ceil((z + r1 + half) / GRID));
    for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
      const d = Math.hypot(gx * GRID - half - x, gz * GRID - half - z);
      const v = 1 - smooth(r0, r1, d);
      const k = gz * N + gx;
      if (v > G[k]) G[k] = v;
    }
  };
  for (const r of roads) for (const [x, z] of r.pts) stamp(pathG, x, z, r.w * 0.6, r.w * 1.6);
  for (const h of houses) stamp(areaG, h.x, h.z, Math.max(h.w, h.d) * 0.5 + 4, Math.max(h.w, h.d) * 0.5 + 12);
  for (const w of wells) stamp(areaG, w.plaza.x, w.plaza.z, w.plaza.r + 2, w.plaza.r + 10);
  for (const f of fields) for (const [x, z] of [[f.x, f.z], ...corners(f, -2)]) stamp(areaG, x, z, 6, 12);
  const sample = (G, x, z) => {
    const fx = (x + half) / GRID, fz = (z + half) / GRID;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= N - 1 || iz >= N - 1) return 0;
    const tx = fx - ix, tz = fz - iz, k = iz * N + ix;
    return (G[k] * (1 - tx) + G[k + 1] * tx) * (1 - tz) + (G[k + N] * (1 - tx) + G[k + N + 1] * tx) * tz;
  };
  /** 畑の中か（0〜1） */
  const fieldAt = (x, z) => {
    for (const f of fields) if (rectDist(f, x, z) === 0) return 1;
    return 0;
  };

  return {
    villages: VILLAGES, roads, bridges, houses, wells, fields, pads,
    padHeight,
    /** 道の上か（1 = 真ん中、0 = 道ではない） */
    pathAt: (x, z) => sample(pathG, x, z),
    /** 村の広がり（家・広場・畑のまわり。0〜1） */
    areaAt: (x, z) => sample(areaG, x, z),
    fieldAt,
    /** 一番近い村（名前を出す・村の音） */
    villageAt(x, z) {
      let best = null;
      for (const v of VILLAGES) { const d = Math.hypot(x - v.x, z - v.z); if (d < v.r + 12 && (!best || d < best.d)) best = { v, d }; }
      return best?.v || null;
    },
  };
}
