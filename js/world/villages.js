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
  // 川邑：2026-11-14 に真ん中を 18 m 西へ移した（川幅を広げたので、前の場所は川へ下る急な坂にかかり、家の土台が段だらけになった。西の平らな台地の上へ）
  { id: 'river', name: '川邑', x: -28, z: 58, r: 44, houses: 10 },
  { id: 'field', name: '野邑', x: 108, z: -16, r: 34, houses: 7 },
];

/** 道（通る点。なめらかな線にする）：w は道の幅の半分 */
const ROADS = [
  { w: 2.0, pts: [[44, -114], [64, -84], [86, -50], [108, -16]] },                                  // 山邑 → 野邑
  { w: 2.0, pts: [[108, -16], [96, 14], [66, 36], [36, 52], [8, 62], [-12, 62], [-28, 58]] },     // 野邑 → 橋 → 川邑
  { w: 2.0, pts: [[-28, 58], [-42, 40], [-56, 14], [-80, -16], [-104, -44]] },                     // 川邑 → 北西の深い森（洞窟）
  { w: 1.8, pts: [[44, -114], [16, -104], [-6, -92], [-30, -88], [-58, -74], [-84, -56], [-104, -44]] },   // 山邑 → 浅瀬 → 深い森
  { w: 1.8, pts: [[0, 0], [16, 2], [34, -2], [60, -12], [86, -50]] },                              // 盆地の真ん中 → 橋 → 山邑と野邑の道
  { w: 1.8, pts: [[0, 0], [-14, 18], [-42, 40]] },                                                // 盆地の真ん中 → 川邑の道
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

/** 向き付きの四角の中にある点の、縁からの深さ（m。外なら 0） */
function rectInside(h, x, z) {
  const a = (h.yaw * Math.PI) / 180, dx = x - h.x, dz = z - h.z;
  const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
  return Math.max(0, Math.min(h.w / 2 - Math.abs(lx), h.d / 2 - Math.abs(lz)));
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
          // 橋の端は、水際から 4 m 以上離れた所（道が川を斜めに渡ると、道に沿って 4 m でも水際に近いことがある）
          const edge = (i) => { const q = land.nearest(r.pts[i][0], r.pts[i][1]); return q ? q.d - land.river.widthAt(q.s) / 2 : 99; };
          let i0 = Math.max(0, run.i0 - 2), i1 = Math.min(r.pts.length - 1, run.i1 + 2);
          while (i0 > 0 && edge(i0) < 4) i0--;
          while (i1 < r.pts.length - 1 && edge(i1) < 4) i1++;
          const a = r.pts[i0], b = r.pts[i1];
          const ha = land.heightAt(a[0], a[1]), hb = land.heightAt(b[0], b[1]);
          // 橋の床の高さ（deck）：両岸と水面より少し高い所で、端から端までほぼ水平（真ん中が camber だけ高い）。
          // 両端の地面は deck の高さまで盛る（下の pads。道からそのまま橋へ上がれる）
          const deck = Math.max(ha, hb, run.surface + 1.6) + 0.12;
          bridges.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], ha, hb, surface: run.surface, deck, camber: 0.3,
            top: deck + 0.3, width: 3.4, road: r, i0, i1 });
        }
        run = null;
      }
    }
  }

  // ---- 2.5 道の高さをならす（2026-11-14。利用者の指示：坂の上り・下りが不自然） ----
  // 前は、道は地面に色を付けただけで、起伏や家の土台の土手をそのまま乗り越えていた（村の中の道に、最大 71 度の段があった）。
  // 道に沿って路面の高さを決め直す：
  //   1. 路面を前後約 11 m でなめらかにする（高い所は削り、低い所は盛る。切り通しと盛り土）。橋の所は橋の床の高さから始める
  //   2. 路面と路肩（道の両脇 2.4 m）は横に水平。その外 4 m で元の地面へ戻す
  // 水の中と洞窟のまわりは変えない
  const ROAD_STIFF = 30;   // 大きいほど、路面が長い坂でなめらかになる（元の地面から離れて、切り通し・盛り土が深くなる）。30 で前後約 11 m
  const RG = 2, NR = Math.ceil(size / RG) + 1;
  const roadWt = new Float32Array(NR * NR), roadCore = new Float32Array(NR * NR), roadH = new Float32Array(NR * NR), roadD = new Float32Array(NR * NR).fill(Infinity);
  // 村の広場（井戸の所）：村の真ん中に一番近い道の点のまわり 6.5 m は、どの道も同じ高さで平らにする（広場と道の間に段ができないように）
  const plazas = VILLAGES.map((v) => {
    let c = null;
    for (const r of roads) for (let i = 1; i < r.pts.length - 1; i++) {
      if (r.lane) continue;
      const d = Math.hypot(r.pts[i][0] - v.x, r.pts[i][1] - v.z);
      if (!c || d < c.d) c = { x: r.pts[i][0], z: r.pts[i][1], d };
    }
    let sum = 0, cnt = 0;
    for (const r of roads) for (const [x, z] of r.pts) if (Math.hypot(x - c.x, z - c.z) < 8) { sum += land.heightAt(x, z); cnt++; }
    return { x: c.x, z: c.z, y: sum / cnt };
  });
  const graded = [];   // 高さを決め終えた道（後の道は、つながる所の高さをこれに合わせる）
  for (const r of roads) {
    const n = r.pts.length;
    const fixed = new Uint8Array(n), raw = new Float32Array(n), len = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = land.heightAt(r.pts[i][0], r.pts[i][1]);
    for (let i = 1; i < n; i++) len[i] = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
    for (let i = 0; i < n; i++) if (land.cave && land.cave.area(r.pts[i][0], r.pts[i][1]) > 0) fixed[i] = 1;   // 洞窟の口の切り通し
    // 橋：橋の上と、その手前・先の 2 m（平らな取り付き）は橋の床の高さ
    for (const b of bridges) if (b.road === r) for (let i = Math.max(0, b.i0 - 1); i <= Math.min(n - 1, b.i1 + 1); i++) { fixed[i] = 2; raw[i] = b.deck - 0.1; }
    for (let i = 0; i < n; i++) for (const q of plazas) if (!fixed[i] && Math.hypot(r.pts[i][0] - q.x, r.pts[i][1] - q.z) < 6.5) { fixed[i] = 3; raw[i] = q.y; }
    // ほかの道につながる端：先に決めた道の、その所の高さに合わせる
    for (const e of [0, n - 1]) {
      if (fixed[e]) continue;
      let best = null;
      for (const o of graded) for (let j = 0; j < o.pts.length; j++) {
        const d = Math.hypot(o.pts[j][0] - r.pts[e][0], o.pts[j][1] - r.pts[e][1]);
        if (d < 1.6 && (!best || d < best.d)) best = { d, y: o.y[j] };
      }
      if (best) { fixed[e] = 3; raw[e] = best.y; }
      else fixed[e] = 4;   // どこにもつながらない端は、元の地面の高さのまま（端が隣の高さへ引きずられて、穴や山にならないように）
    }
    // 水際（浅瀬で川へ下りる所）：水の中と水際 2.5 m は元の地面のまま（そこは高さを変えないので、路面を岸の高さにつなぐ）
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      const q = land.nearest(r.pts[i][0], r.pts[i][1]);
      if (q && q.d - land.river.widthAt(q.s) / 2 < 2.5) fixed[i] = 4;
    }
    // 路面の高さ：元の地面に寄せる力（1）と、隣の点と同じ高さになろうとする力（ROAD_STIFF）のつり合いで決める。
    // 高さの決まっている所（橋・広場・ほかの道とのつなぎ目）は動かさない。段はできず、決まった所の間はなだらかな坂になる
    const y = Float32Array.from(raw);
    for (let it = 0; it < 400; it++) {
      for (let i = 0; i < n; i++) {
        if (fixed[i]) continue;
        const a = i > 0 ? y[i - 1] : y[i + 1], b = i < n - 1 ? y[i + 1] : y[i - 1];
        y[i] = (raw[i] + ROAD_STIFF * (a + b)) / (1 + 2 * ROAD_STIFF);
      }
    }
    r.y = y;
    graded.push(r);
    // 路面（bed）の外も 2.4 m は同じ高さ（路肩）：地面の網は 2.6 m ごとなので、狭いと網に路面が出ず、両脇の高さに引きずられる
    const bed = r.w * 0.75, r0 = bed + 2.4, r1 = bed + 6.5;
    for (let i = 0; i < n - 1; i++) {
      if (fixed[i] === 1 && fixed[i + 1] === 1) continue;
      if (bridges.some((b) => b.road === r && i >= b.i0 && i + 1 <= b.i1)) continue;   // 橋の上（水の上）
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const g0x = Math.max(0, Math.floor((Math.min(ax, bx) - r1 + half) / RG)), g1x = Math.min(NR - 1, Math.ceil((Math.max(ax, bx) + r1 + half) / RG));
      const g0z = Math.max(0, Math.floor((Math.min(az, bz) - r1 + half) / RG)), g1z = Math.min(NR - 1, Math.ceil((Math.max(az, bz) + r1 + half) / RG));
      for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
        const x = gx * RG - half, z = gz * RG - half;
        const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / L2));
        const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
        const wv = 1 - smooth(r0, r1, d);
        if (wv <= 0) continue;
        const k = gz * NR + gx;
        if (wv > roadWt[k]) roadWt[k] = wv;
        const c = 1 - smooth(bed, bed + 1.6, d);
        if (c > roadCore[k]) roadCore[k] = c;
        if (d < roadD[k]) { roadD[k] = d; roadH[k] = y[i] + (y[i + 1] - y[i]) * t; }   // 一番近い道の、その所の路面の高さ
      }
    }
  }
  /** 川の水際の外か（0 = 水の中と水際、1 = 水際から 2 m より外）。道の高さをならすのは水の外だけ */
  const dryAt = (x, z) => {
    const q = land.nearest(x, z);
    if (!q) return 1;
    return smooth(0.2, 2.2, q.d - land.river.widthAt(q.s) / 2);
  };
  /** 道の路面の高さと、その強さ：{ h, w（道の両脇まで）, core（路面だけ）} か null */
  const roadAt = (x, z) => {
    const fx = (x + half) / RG, fz = (z + half) / RG, ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= NR - 1 || iz >= NR - 1) return null;
    const tx = fx - ix, tz = fz - iz, k = iz * NR + ix;
    const c = [[k, (1 - tx) * (1 - tz)], [k + 1, tx * (1 - tz)], [k + NR, (1 - tx) * tz], [k + NR + 1, tx * tz]];
    let w = 0, core = 0, hs = 0, ws = 0;
    for (const [j, b] of c) { w += roadWt[j] * b; core += roadCore[j] * b; if (roadWt[j] > 0) { const q = b * roadWt[j]; hs += roadH[j] * q; ws += q; } }
    if (w <= 0 || ws <= 0) return null;
    const dry = dryAt(x, z) * (land.cave ? 1 - land.cave.area(x, z) : 1);
    if (dry <= 0) return null;
    return { h: hs / ws, w: w * dry, core: core * dry };
  };
  /** 道をならした地面の高さ（家の土台を平らにする前） */
  const gradeHeight = (x, z, h) => { const q = roadAt(x, z); return q ? h + (q.h - h) * q.w : h; };

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
      // 家の下の平らにする高さ：扉の前の地面（段差を作らず、入り口が地面とつながる）。道をならした後の高さで決める
      const fa = (h.yaw * Math.PI) / 180;
      const dfx = h.x + Math.sin(fa) * (h.d / 2 + 0.8), dfz = h.z + Math.cos(fa) * (h.d / 2 + 0.8);
      h.y0 = gradeHeight(dfx, dfz, land.heightAt(dfx, dfz));
      // 隣の家との間：土台の高さが違うほど離す（網 1 つ分の 2.6 m ＋ 高さの差 1 m につき 2.6 m。地面の網は 2.6 m ごとなので、近いと 2 つの土台の間を
      // 網が斜めにつないで、家の角が浮いたり、地面が家の中に入ったりする）
      const gapTo = (o) => { const dy = Math.abs(o.y0 - h.y0); return dy > 0.25 ? Math.max(2.2, Math.min(9, 2.6 + dy * 2.6)) : 2.2; };
      if (houses.some((o) => overlap(o, h, gapTo(o)))) return false;
      if (rectDist(h, well.x, well.z) < 2.8 || rectDist(h, well.plaza.x, well.plaza.z) < well.plaza.r - 1) return false;
      for (const q of roadNear(h.x, h.z, 14)) if (rectDist(h, q.x, q.z) < q.w + 0.7) return false;
      // 橋（端から端までの線）から 15 m は建てない（橋が長くなったので、真ん中からの距離ではなく線からの距離で見る。
      // 近いと、家の土台の土手が橋のたもとにかかる）
      for (const b of bridges) {
        const dx = b.bx - b.ax, dz = b.bz - b.az, t = Math.min(1, Math.max(0, ((h.x - b.ax) * dx + (h.z - b.az) * dz) / (dx * dx + dz * dz)));
        if (Math.hypot(b.ax + dx * t - h.x, b.az + dz * t - h.z) < 15 + Math.max(h.w, h.d) / 2) return false;
      }
      const cs = corners(h, 0.6);
      if (cs.some(([x, z]) => land.wet(x, z) > 0.02) || land.wet(h.x, h.z) > 0.02) return false;
      const hs = cs.map(([x, z]) => land.heightAt(x, z));
      if (Math.max(...hs) - Math.min(...hs) > 3.4) return false;   // 急すぎる坂には建てない（それより緩い坂は、家の下を平らにして段々にする）
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
    // 決まった数に足りなければ、もう一度回す（家の大きさと道からの離れ方が変わるので、前に置けなかった所にも置けることがある）
    for (let pass = 0; pass < 3 && mine.length < v.houses; pass++) {
      for (const s of slots) {
        if (mine.length >= v.houses) break;
        tryHouse(s.px, s.pz, s.tx, s.tz, s.side, s.rw);
      }
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
    ...wells.map((w) => ({ x: w.plaza.x, z: w.plaza.z, w: w.plaza.r * 2, d: w.plaza.r * 2, yaw: 0, y: gradeHeight(w.plaza.x, w.plaza.z, land.heightAt(w.plaza.x, w.plaza.z)), fade: 4 })),
  ];
  const PC = 8, padGrid = new Map();
  pads.forEach((p, i) => {
    const R = Math.hypot(p.w, p.d) / 2 + p.fade + 8;   // 高さの差で広がる分（padHeight）も入れる
    for (let gx = Math.floor((p.x - R) / PC); gx <= Math.floor((p.x + R) / PC); gx++) for (let gz = Math.floor((p.z - R) / PC); gz <= Math.floor((p.z + R) / PC); gz++) {
      const k = gx * 65536 + gz;
      if (!padGrid.has(k)) padGrid.set(k, []);
      padGrid.get(k).push(i);
    }
  });
  /**
   * 道をならし、家の下と広場を平らにした地面の高さ：h0（元の高さ）を、道の路面と、近くの平らにする所の高さへ寄せる。
   * 寄せる幅は、高さの差が大きいほど広い（差 1 m で約 2.2 m 広げる。坂が急な壁にならず、なだらかな土手になる）
   */
  function padHeight(x, z, h0) {
    // 1. 道をならす　2. 家の土台と広場を平らにする　3. 路面の上は道の高さが勝つ（家の土手が道にかからない）
    const road = roadAt(x, z);
    const h = road ? h0 + (road.h - h0) * road.w : h0;
    const l = padGrid.get(Math.floor(x / PC) * 65536 + Math.floor(z / PC));
    if (!l) return h;
    let bw = 0, by = h;
    // 土台の外へ広がる土手は、道と路肩にはかけない（高い所の家の土手が、遠くの道や橋のたもとまで盛り上げていた）
    const off = road ? 1 - road.w : 1;
    for (const i of l) {
      const p = pads[i];
      const dist = rectDist(p, x, z);
      // 土台の中は 1。2 つの土台が重なる所（隣り合う家の縁）は、より深く中にある方の高さにする
      // （前は先に書いた土台が勝ち、隣の家の角の下の地面が 2 m ずれることがあった）
      const w = dist <= 0 ? 1 + rectInside(p, x, z) * 0.01 : (1 - smooth(0, p.fade + 2.2 * Math.abs(h - p.y), dist)) * off;
      if (w > bw) { bw = w; by = p.y; }
    }
    const padded = h + (by - h) * Math.min(1, bw);
    return road ? padded + (road.h - padded) * road.core : padded;
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
