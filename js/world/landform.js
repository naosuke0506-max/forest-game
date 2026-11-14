// 地形の形（計算だけ。PlayCanvas に依存しない）。利用者の指示（2026-11-14）：マップを自然にする。全体の形は「盆地」（利用者が選んだ）
//   周りの山：歩ける範囲の外を山が囲む。北（北北西）が一番高く、北の山のふもとは歩ける範囲の中まで上ってくる。南と東は低め
//   川：北の山の谷を下り、滝（約 8 m）で滝壺へ落ち、盆地を曲がりながら南東へ流れ、峡谷から外へ出ていく
//       深い所は泳ぐ（利用者が選んだ）。岸の近くと浅瀬は歩いて渡れる（遅くなる）。game/water.js が泳ぐ・水を歩く決まり
//   谷：川の周りは掘り下げる（真ん中ほど深い谷）。丘：盆地の中はなだらかな起伏
// 地図の上で北は -Z、東は +X。村の場所を平らにするのは world/terrain.js（エリア分けの world/zones.js を使う）
import { fbm } from '../core/random.js';
import { createCaveShape } from './cave-shape.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const DEG = Math.PI / 180;

// 川の道筋（北の山の中 → 滝の上 → 滝壺 → 盆地を南東へ → 峡谷 → 外）。この点を通る、なめらかな線にする
const RIVER = [
  [-32, -262], [-30, -228], [-26, -196], [-23, -172], [-21, -162],   // 山の中の谷（滝の上）
  [-19, -150],                                                          // 滝壺
  [-12, -128], [-28, -96], [-36, -62], [-14, -30], [22, -12], [34, 18], [22, 44], [44, 70], [82, 88], [108, 112],
  [134, 138], [156, 158], [182, 166], [210, 160], [238, 150], [268, 142],   // 峡谷から外へ（外で東へ曲げ、峡谷の先の地面の端が見えないように）
];
const LIP = [-21, -162];   // 滝の落ち口
const FORDS = [[-30, -88], [102, 104]];   // 浅瀬（歩いて渡れる）
const STEP = 1.5;          // 川の線を区切る長さ（m）
const REACH = 64;          // 川から離れて谷の形が届く遠さ（m）
const CELL = 8;            // 近くの川の区切りを探すための升目（m）

/** なめらかな線（Catmull-Rom）で点の間を細かく区切る */
function sampleSpline(pts, step) {
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
 * @param {{ playRadius: number, size: number }} o playRadius：歩ける範囲の半径、size：地面の一辺
 */
export function createLandform(seed, { playRadius, size }) {
  const half = size / 2;
  const flat0 = (r) => smooth(4, 22, r);   // 開始地点の周りは平らに（前と同じ）

  /** 周りの山の高さ（川の谷を掘る前）。北ほど高く、ふもとは歩ける範囲の中まで来る */
  function mountain(x, z) {
    const r = Math.hypot(x, z);
    let ang = Math.atan2(x, -z) / DEG; if (ang < 0) ang += 360;       // 北から時計回り
    const north = Math.max(0, Math.cos((ang - 340) * DEG));            // 北北西で 1
    const start = playRadius - 30 - 34 * north ** 1.5;                 // 山のふもと（北は 111 m、南は 145 m から上り始める）
    const peak = 30 + 42 * north ** 1.4;                               // 山の高さ（南 30 m・北北西 72 m）
    const t = smooth(0, 1, (r - start) / (half + 40 - start));
    if (t <= 0) return 0;
    // 稜線のごつごつ（尾根と谷）：山が高い所ほど大きく
    const ridge = 1 - Math.abs(fbm(x * 0.016, z * 0.016, seed + 301) * 2 - 1);
    return peak * t ** 1.25 * (0.7 + 0.6 * ridge) + (fbm(x * 0.06, z * 0.06, seed + 303) - 0.5) * 6 * t;
  }
  /** 谷を掘る前の高さ：盆地の丘（前の起伏と同じ式）＋周りの山 */
  function natural(x, z) {
    const r = Math.hypot(x, z);
    const hills = (fbm(x * 0.018, z * 0.018, seed) - 0.5) * 9;
    const bumps = (fbm(x * 0.09, z * 0.09, seed + 7) - 0.5) * 1.1;
    const f = flat0(r);
    return hills * f + bumps * (0.3 + 0.7 * f) + mountain(x, z);
  }

  // ---- 川の線と、線に沿った水の高さ・幅・深さ ----
  const S = sampleSpline(RIVER, STEP);
  const n = S.length;
  const sAt = new Float32Array(n);
  for (let i = 1; i < n; i++) sAt[i] = sAt[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]);
  const length = sAt[n - 1];
  const nearestIndex = (x, z) => { let b = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.hypot(S[i][0] - x, S[i][1] - z); if (d < bd) { bd = d; b = i; } } return b; };
  const sLip = sAt[nearestIndex(LIP[0], LIP[1])];
  const fordS = FORDS.map(([x, z]) => sAt[nearestIndex(x, z)]);
  // 幅（m）：滝の上は細い流れ、滝壺は広い、盆地では 9〜12 m、峡谷は少し細い
  const widthAt = (s) => {
    const base = 9.5 + (fbm(s * 0.02, 1.7, seed + 311) - 0.5) * 5;
    if (s < sLip) return 5.5;
    const pool = 1 - smooth(4, 22, Math.abs(s - (sLip + 10)));
    return lerp(base, 15, pool);
  };
  // 深さ（真ん中。m）：ふだんは泳ぐ深さ、浅瀬は膝ほど、滝壺は深い、滝の上の流れは浅い
  const depthAt = (s) => {
    if (s < sLip) return 0.55;
    let d = 2.1;
    for (const f of fordS) d = lerp(0.45, d, smooth(4, 14, Math.abs(s - f)));
    d = lerp(3.2, d, smooth(4, 20, Math.abs(s - (sLip + 10))));
    return d;
  };
  // 水面の高さ：川の線の上の地面（前後をならした）から谷の深さだけ下げ、下流へ行くほど低いか同じ（逆に流れない）。
  // 滝の落ち口で約 8 m 落とす
  const valleyDepth = (s) => lerp(2.2, 7.5, smooth(0, 1, Math.sin(Math.min(1, Math.max(0, (s - sLip - 20) / (length * 0.62))) * Math.PI)));
  const nat = Array.from(S, ([x, z]) => natural(x, z));
  const level = new Float32Array(n);
  {
    let run = Infinity;
    for (let i = 0; i < n; i++) {
      let sum = 0, c = 0;
      for (let k = -7; k <= 7; k++) { const j = Math.min(n - 1, Math.max(0, i + k)); sum += nat[j]; c++; }
      run = Math.min(run, sum / c - valleyDepth(sAt[i]));
      level[i] = run;
    }
    // 滝：落ち口から 2.5 m の間に 8 m 落ちる。滝の下は、落ちた高さより上へは戻らない
    const iLip = sAt.findIndex((s) => s >= sLip);
    const top = level[iLip];
    for (let i = iLip; i < n; i++) {
      const drop = smooth(0, 2.5, sAt[i] - sLip) * 8;
      level[i] = Math.min(level[i], top - drop, i > iLip ? level[i - 1] : Infinity);
    }
  }
  const levelAt = (s) => {
    const k = Math.min(n - 1, Math.max(0, s / length * (n - 1)));
    // 区切りは長さがほぼ同じなので、番号で引く（ずれは小さい）
    let i = Math.min(n - 2, Math.floor(k));
    while (i < n - 2 && sAt[i + 1] < s) i++;
    while (i > 0 && sAt[i] > s) i--;
    const t = Math.min(1, Math.max(0, (s - sAt[i]) / ((sAt[i + 1] - sAt[i]) || 1)));
    return lerp(level[i], level[i + 1], t);
  };

  // 近くの川の区切りを探す升目
  const G = Math.ceil(size / CELL) + 2;
  const grid = new Map();
  const key = (gx, gz) => gx * 4096 + gz;
  const rc = Math.ceil(REACH / CELL) + 1;
  for (let i = 0; i < n - 1; i++) {
    const gx0 = Math.floor((S[i][0] + half) / CELL), gz0 = Math.floor((S[i][1] + half) / CELL);
    for (let gx = gx0 - rc; gx <= gx0 + rc; gx++) for (let gz = gz0 - rc; gz <= gz0 + rc; gz++) {
      if (gx < -1 || gz < -1 || gx > G || gz > G) continue;
      const k = key(gx, gz);
      let l = grid.get(k);
      if (!l) grid.set(k, (l = []));
      if (l[l.length - 1] !== i) l.push(i);
    }
  }
  /** (x, z) に一番近い川の線の点：{ d（距離）, s（線に沿った長さ）} か、遠ければ null */
  function nearest(x, z) {
    const l = grid.get(key(Math.floor((x + half) / CELL), Math.floor((z + half) / CELL)));
    if (!l) return null;
    let bd = Infinity, bs = 0;
    for (const i of l) {
      const ax = S[i][0], az = S[i][1], dx = S[i + 1][0] - ax, dz = S[i + 1][1] - az;
      const L2 = dx * dx + dz * dz || 1;
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < bd) { bd = d; bs = sAt[i] + t * (sAt[i + 1] - sAt[i]); }
    }
    return bd <= REACH ? { d: bd, s: bs } : null;
  }

  // 洞窟（3 回目。world/cave-shape.js）：北西の深い森の岩山と、その中の通り道。岩山は地面に足し、通り道は床の高さまで掘る
  const cave = createCaveShape(seed, natural);
  /** 地面の高さ（村を平らにする前）：盆地の丘と山（と洞窟の岩山）に、川の谷と川床を掘り、洞窟の通り道を掘る */
  function heightAt(x, z) {
    return cave.carve(x, z, riverHeight(x, z));
  }
  function riverHeight(x, z) {
    const h0 = natural(x, z) + cave.hill(x, z);
    const q = nearest(x, z);
    if (!q) return h0;
    const hw = widthAt(q.s) / 2, V = levelAt(q.s);
    if (q.d < hw) return V - depthAt(q.s) * (1 - (q.d / hw) ** 2);   // 川床（真ん中ほど深い）
    // 岸から谷の斜面：水際の少し上から上っていき、谷の幅の外で元の地面へ戻る。谷が深い所ほど幅も広い
    const vw = 16 + valleyDepth(q.s) * 4;
    const bank = V + 0.18 + (q.d - hw) * 0.3;
    const k = smooth(hw, hw + vw, q.d);
    return bank + (h0 - bank) * k;
  }

  /** (x, z) の水面：{ surface（水面の高さ）, hw（川の幅の半分）, d（川の真ん中からの距離）, s } か、川の外なら null */
  function waterLevel(x, z) {
    const q = nearest(x, z);
    if (!q) return null;
    const hw = widthAt(q.s) / 2;
    if (q.d > hw + 0.6) return null;
    return { surface: levelAt(q.s), hw, d: q.d, s: q.s };
  }

  /** 水辺の度合い（0〜1）：水の中と岸の 4 m は 1、そこから 8 m で 0（木・草・小物を置かない、川原の色） */
  function wet(x, z) {
    const q = nearest(x, z);
    if (!q) return 0;
    return 1 - smooth(widthAt(q.s) / 2 + 2, widthAt(q.s) / 2 + 10, q.d);
  }
  /** 岩場の度合い（0〜1）：山の高い所（木がまばらで、岩が多い） */
  const rocky = (x, z) => Math.max(smooth(14, 34, mountain(x, z)), smooth(3, 9, cave.hill(x, z)));   // 山の高い所と洞窟の岩山

  // 滝の形（world/water.js が描く）：落ち口の位置・流れの向き・幅・上と下の水面の高さ
  const iLip = sAt.findIndex((s) => s >= sLip);
  const lipDir = [S[iLip + 1][0] - S[iLip - 1][0], S[iLip + 1][1] - S[iLip - 1][1]];
  const ll = Math.hypot(lipDir[0], lipDir[1]) || 1;
  const fall = { x: S[iLip][0], z: S[iLip][1], dx: lipDir[0] / ll, dz: lipDir[1] / ll, width: widthAt(sLip - 0.1),
    top: levelAt(sLip - 0.1), bottom: levelAt(sLip + 3), poolS: sLip + 10 };

  return {
    heightAt, natural, mountain, nearest, waterLevel, wet, rocky, cave,
    /** 洞窟の通り道を掘る前の高さ（岩山の上の高さ。world/cave.js が岩山の上の床に使う） */
    uncarved: (x, z) => riverHeight(x, z),
    river: { points: S, s: sAt, length, sLip, fords: fordS, levelAt, widthAt, depthAt, fall },
  };
}
