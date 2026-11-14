// 洞窟の形（計算だけ。PlayCanvas に依存しない）。利用者の指示（2026-11-14）：
//   「抜けられる洞窟ひとつ。口は二つだが、中には別れ道があり、行き止まりもある」（マップを自然にする 3 回目）
// 北西の深い森の岩山（風穴）。口 A は道の行き止まり（川邑と山邑から来る 2 本の道）、口 B は北西の山の側。
//   本道：口 A から口 B へ抜ける（曲がりながら少し上る）
//   脇道：本道から西へ分かれ、回り込んで本道へ戻る（別の通り道。分かれ道）
//   行き止まり 2 つ：脇道から北西へ（奥に小さな広間）・本道から東へ（奥に小さな広間）
// 地形：通り道に沿って岩山を盛り上げ（world/landform.js が地面に足す）、通り道の所だけ床の高さまで掘る（溝）。
//   口の外も少し掘って、岩の壁に挟まれた切り通しから入る。溝の上の天井と壁は world/cave.js が形を作る
import { fbm } from '../core/random.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * 通り道：pts（通る点）、w（幅）、ceil（天井の高さ。床から）、end（行き止まりの広間の大きさ。null は無し）、
 * cover：[覆う始め, 覆う終わり]（長さの割合。その外は屋根の無い切り通し）
 */
const TUNNELS = [
  { id: 'main', w: 3.4, ceil: 3.6, cover: [0.13, 0.9], pts: [[-98, -42], [-104, -49], [-110, -55], [-116, -62], [-121, -73], [-123, -86], [-127, -98], [-131, -104], [-134, -110]] },
  { id: 'loop', w: 2.6, ceil: 3.0, cover: [0, 1], pts: [[-115, -60], [-124, -58], [-133, -65], [-137, -78], [-131, -89], [-124, -91]] },
  { id: 'dead1', w: 2.4, ceil: 2.9, cover: [0, 1], end: { w: 6.5, ceil: 4.3, len: 6 }, pts: [[-133, -66], [-141, -61], [-147, -54], [-150, -48]] },
  { id: 'dead2', w: 2.4, ceil: 2.9, cover: [0, 1], end: { w: 6, ceil: 4.0, len: 6 }, pts: [[-121, -75], [-113, -80], [-108, -87], [-106, -93]] },
];
const STEP = 1.2;     // 通り道を区切る長さ（m）
const HILL = 13;      // 岩山の高さ（通り道の上。m）
const CELL = 6;

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

/**
 * @param {number} seed 種
 * @param {(x: number, z: number) => number} ground 岩山を足す前の地面の高さ
 */
export function createCaveShape(seed, ground) {
  // ---- 通り道を区切り、床の高さを決める ----
  const tunnels = TUNNELS.map((t) => {
    const P = spline(t.pts, STEP);
    const s = [0];
    for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return { ...t, P, s, len: s[s.length - 1], floor: new Float32Array(P.length) };
  });
  const main = tunnels[0];
  // 本道：口の外の地面の高さから、もう一方の口の外の地面の高さへ、なめらかに
  {
    const h0 = ground(...main.P[0]), h1 = ground(...main.P[main.P.length - 1]);
    for (let i = 0; i < main.P.length; i++) main.floor[i] = lerp(h0, h1, smooth(0, 1, main.s[i] / main.len));
  }
  /** 本道の、(x, z) に一番近い所の床の高さ */
  const mainFloorNear = (x, z) => {
    let b = 0, bd = Infinity;
    for (let i = 0; i < main.P.length; i++) { const d = Math.hypot(main.P[i][0] - x, main.P[i][1] - z); if (d < bd) { bd = d; b = i; } }
    return main.floor[b];
  };
  // 脇道・行き止まり：分かれる所の床の高さから、少しずつ下る（行き止まりの奥は 0.6 m 低い）
  for (const t of tunnels.slice(1)) {
    const parent = t.id === 'dead1' ? tunnels[1] : main;
    let f0 = mainFloorNear(...t.P[0]);
    if (parent !== main) {
      let b = 0, bd = Infinity;
      for (let i = 0; i < parent.P.length; i++) { const d = Math.hypot(parent.P[i][0] - t.P[0][0], parent.P[i][1] - t.P[0][1]); if (d < bd) { bd = d; b = i; } }
      f0 = parent.floor[b] || f0;
    }
    const f1 = t.id === 'loop' ? mainFloorNear(...t.P[t.P.length - 1]) : f0 - 0.6;
    for (let i = 0; i < t.P.length; i++) t.floor[i] = lerp(f0, f1, smooth(0, 1, t.s[i] / t.len));
  }
  // 脇道（loop）は先に本道の床を決めてから（上の順で決まる）。行き止まり 1 は脇道の床から
  {
    const t = tunnels[2], parent = tunnels[1];
    let b = 0, bd = Infinity;
    for (let i = 0; i < parent.P.length; i++) { const d = Math.hypot(parent.P[i][0] - t.P[0][0], parent.P[i][1] - t.P[0][1]); if (d < bd) { bd = d; b = i; } }
    const f0 = parent.floor[b];
    for (let i = 0; i < t.P.length; i++) t.floor[i] = lerp(f0, f0 - 0.6, smooth(0, 1, t.s[i] / t.len));
  }
  /** 通り道の i 番目の点の幅・天井（行き止まりの奥の広間は広く高い） */
  const widthOf = (t, i) => {
    if (!t.end) return t.w;
    const k = smooth(t.len - t.end.len - 3, t.len - t.end.len * 0.4, t.s[i]);
    return lerp(t.w, t.end.w, k) * (1 - smooth(t.len - 1.4, t.len, t.s[i]) * 0.55);   // 一番奥はすぼまる
  };
  const ceilOf = (t, i) => (t.end ? lerp(t.ceil, t.end.ceil, smooth(t.len - t.end.len - 3, t.len - t.end.len * 0.4, t.s[i])) : t.ceil);
  /** 覆われているか（0〜1。本道の口の外は屋根の無い切り通し） */
  const coverOf = (t, i) => smooth(t.cover[0] * t.len - 4, t.cover[0] * t.len + 2, t.s[i]) * (1 - smooth(t.cover[1] * t.len - 2, t.cover[1] * t.len + 4, t.s[i]));
  for (const t of tunnels) {
    t.width = Array.from(t.P, (_, i) => widthOf(t, i));
    t.ceiling = Array.from(t.P, (_, i) => ceilOf(t, i));
    t.covered = Array.from(t.P, (_, i) => coverOf(t, i));
  }

  // ---- 近くの通り道を探す升目 ----
  const grid = new Map();
  const key = (gx, gz) => gx * 65536 + gz;
  const REACH = 26;
  tunnels.forEach((t, ti) => {
    for (let i = 0; i < t.P.length - 1; i++) {
      const gx0 = Math.floor(t.P[i][0] / CELL), gz0 = Math.floor(t.P[i][1] / CELL), rc = Math.ceil(REACH / CELL);
      for (let gx = gx0 - rc; gx <= gx0 + rc; gx++) for (let gz = gz0 - rc; gz <= gz0 + rc; gz++) {
        const k = key(gx, gz);
        let l = grid.get(k);
        if (!l) grid.set(k, (l = []));
        l.push(ti * 10000 + i);
      }
    }
  });
  /**
   * (x, z) に一番近い通り道の点：{ t（通り道）, i, u（区切りの中の割合）, d（距離）, e（壁からの距離）, w, ceil, floor, cover } か null。
   * only を渡すと、その通り道だけで探す
   */
  function nearest(x, z, only = null) {
    const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!l) return null;
    let best = null;
    for (const code of l) {
      const ti = Math.floor(code / 10000), i = code % 10000, t = tunnels[ti];
      if (only && t !== only) continue;
      const [ax, az] = t.P[i], [bx, bz] = t.P[i + 1], dx = bx - ax, dz = bz - az;
      const L2 = dx * dx + dz * dz || 1;
      const u = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(ax + dx * u - x, az + dz * u - z);
      // 道の幅の分を引いた「壁からの距離」で比べる（広い道が近く扱われるように）
      const e = d - lerp(t.width[i], t.width[i + 1], u) / 2;
      if (!best || e < best.e) best = { t, i, u, d, e };
    }
    if (!best) return null;
    const { t, i, u } = best;
    best.w = lerp(t.width[i], t.width[i + 1], u);
    best.ceil = lerp(t.ceiling[i], t.ceiling[i + 1], u);
    best.floor = lerp(t.floor[i], t.floor[i + 1], u);
    best.cover = lerp(t.covered[i], t.covered[i + 1], u);
    return best;
  }

  /**
   * 岩山の高さ（地面に足す分）：通り道の上を覆い、まわり 6〜20 m でなだらかに下がる。口の外の切り通しの先は低い。
   * 近くの区切りごとに求めて、一番高いものにする（一番近い所だけで決めると、曲がり角や通り道の間で高さが飛んで崖になる）
   */
  function hill(x, z) {
    const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!l) return 0;
    let h = 0;
    for (const code of l) {
      const t = tunnels[Math.floor(code / 10000)], i = code % 10000;
      const [ax, az] = t.P[i], [bx, bz] = t.P[i + 1], dx = bx - ax, dz = bz - az;
      const u = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const e = Math.hypot(ax + dx * u - x, az + dz * u - z) - lerp(t.width[i], t.width[i + 1], u) / 2;
      if (e > 20) continue;
      const cover = lerp(t.covered[i], t.covered[i + 1], u);
      h = Math.max(h, HILL * cover * (1 - smooth(6, 20, e)) + 2.5 * cover * (1 - smooth(0, 8, e)));
    }
    return h > 0 ? h * (0.75 + 0.5 * fbm(x * 0.07, z * 0.07, seed + 611)) : 0;
  }
  /** 掘る：通り道の中（幅の半分＋ 0.9 m）は床の高さ。その外 3 m で、岩山の地面へ戻る */
  function carve(x, z, h) {
    const q = nearest(x, z);
    if (!q || q.e > 3.9) return h;
    const k = smooth(0.9, 3.9, q.e);
    return q.floor + (Math.max(h, q.floor) - q.floor) * k;
  }
  /** 通り道の中か（0〜1。1 は覆われた所の真ん中。暗さ・音のこもり・木を置かない所に使う） */
  function inside(x, z, y = null) {
    const q = nearest(x, z);
    if (!q || q.e > 0.6) return 0;
    if (y !== null && y > q.floor + q.ceil + 0.5) return 0;   // 岩山の上（屋根の上）にいる
    return q.cover;
  }
  /** 木・草・小物を置かない所（通り道と、その切り通しのまわり 4 m） */
  const area = (x, z) => { const q = nearest(x, z); return q ? 1 - smooth(2, 5, q.e) : 0; };

  return { tunnels, nearest, hill, carve, inside, area, mouths: [main.P[0], main.P[main.P.length - 1]] };
}
