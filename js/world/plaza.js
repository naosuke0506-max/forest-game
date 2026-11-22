// 村の広場（井戸のまわりの石畳。2026-11-22。④ 広場と道路。利用者の指示：「井戸の地面の石がちょっとしょぼく見えるので完成させてください」）
//   前は、平らな 9 角形の板に大きな石（1 個 28 cm ほど）の画像を貼っただけで、縁はギザギザ、石の間から草が生え、
//   アスファルトとの間に草地のすき間があった。今は：
//   1. 石畳：真ん中から放射状の網にして、地面の起伏に沿わせる（5 cm 上）。石は 1 個 13 cm ほど、列は道の向きにそろえる。
//      縁と井戸のまわりは汚れ・湿りで暗く、道の通る所はすり減って明るい（頂点の色。描画命令は増えない）
//   2. 縁石：花崗岩の色の帯（幅 24 cm、1 つずつ色が少し違う）。外へ向かって地面の高さまで斜めに下ろす（台の上に載ったように見えないように）。
//      道の入る所だけは平らにして、アスファルトとつなぐ
//   3. 井戸のまわり：一段高い大きな敷石の輪（14 枚。すき間から下の石畳が見える）と、その外に石の列が井戸を囲む石畳の輪
//   縁の形（なめらかな丸・道の入る所はまっすぐ）は world/villages.js の shapePlaza が決める（P.cx・P.cz・P.edge・P.cuts・P.inside）。
//   アスファルトの端は、道の入る所の縁にぴったり合う（world/roadside.js）
import { v3 } from './build-kit.js';
import { valueNoise } from '../core/random.js';

/** 広場の数（m） */
export const PLAZA = {
  lift: 0.05,      // 石畳の上の面：地面より上（地面の網と同じ高さを取って沿わせるので、少しでよい。アスファルトも広場の手前でこの高さへ下げる）
  kerb: 0.24,      // 縁石の幅
  kerbUp: 0.012,   // 縁石が石畳より高い分
  rings: 9,        // 石畳の網の輪の数（真ん中から縁まで）
  slabIn: 0.95, slabOut: 1.85, slabUp: 0.05, slabs: 14,   // 井戸のまわりの敷石（井戸の石積みの下から外へ。一段高い）
  fanOut: 2.45, bandOut: 2.6,                             // 井戸を囲む石畳の輪と、その外の細い縁取り
};
const KERB = [0.7, 0.69, 0.67];         // 縁石（灰色の花崗岩）
const SLAB = [0.95, 0.9, 0.8];          // 井戸のまわりの敷石（砂岩）
const sm = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/**
 * 広場を 1 つ作る（村の形の入れ物 B に貯める）
 * @param {object} B build-kit の builder
 * @param {object} w 井戸（plan.wells の 1 つ）：{ x, z, plaza }
 * @param {object} o { terrain, roads, rv：乱数 18 個（world/castle.js の村の乱数。前と同じ数だけ使う）, seed }
 * @returns {number} 三角形の数
 */
export function buildPlaza(B, w, { terrain, roads, rv, seed }) {
  const P = w.plaza, N = P.edge.length, TAU = Math.PI * 2, L = PLAZA;
  const H = (x, z) => terrain.heightAt(x, z);
  const normalAt = (x, z) => { const e = 0.4; return v3.norm([-(H(x + e, z) - H(x - e, z)) / (2 * e), 1, -(H(x, z + e) - H(x, z - e)) / (2 * e)]); };
  let tris = 0;
  // 石の列の向き：広場に入る道の向き（無ければ乱数）。画像のずらしも乱数で
  const c0 = P.cuts[0];
  const phi = c0 ? Math.atan2(c0.tz, c0.tx) : rv[0] * TAU, cp = Math.cos(phi), sp = Math.sin(phi);
  const offU = rv[1] * 7, offV = rv[2] * 7;
  const uvOf = (x, z) => [x * cp + z * sp + offU, -x * sp + z * cp + offV];
  // 道の真ん中の線からの距離（広場の中を通る舗装の道。すり減って明るい所）
  const lines = [];
  for (const r of roads) if (r.paved) for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i], b = r.pts[i + 1];
    if (Math.hypot(a[0] - P.cx, a[1] - P.cz) < 12 || Math.hypot(b[0] - P.cx, b[1] - P.cz) < 12) lines.push([a, b]);
  }
  const roadDist = (x, z) => {
    let d = 99;
    for (const [a, b] of lines) {
      const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      d = Math.min(d, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
    }
    return d;
  };
  /** 石畳の明るさ：縁は汚れて暗く、井戸のまわりは湿って暗く、道の通る所はすり減って明るい。むらはノイズ */
  const shadeAt = (x, z, inward) => {
    let m = 0.8 + 0.2 * sm(inward / 1.3);
    const dw = Math.hypot(x - w.x, z - w.z);
    m *= 0.84 + 0.16 * sm((dw - 2.2) / 1.8);
    m *= 0.86 + 0.22 * valueNoise(x * 0.45, z * 0.45, seed + 71);
    m *= 1 + 0.07 * (1 - sm(roadDist(x, z) / 1.8));
    return m;
  };

  // ---- 1. 石畳（真ん中から放射状の網。外の輪は縁石の内側まで） ----
  {
    const V = [], I = [];
    const ang = (k) => (k / N) * TAU;
    const y0 = H(P.cx, P.cz) + L.lift;
    V.push({ p: [P.cx, y0, P.cz], n: normalAt(P.cx, P.cz), uv: uvOf(P.cx, P.cz), c: shadeAt(P.cx, P.cz, 9) });
    for (let j = 1; j <= L.rings; j++) for (let k = 0; k < N; k++) {
      const a = ang(k), R = P.edge[k] - L.kerb, r = (R * j) / L.rings;
      const x = P.cx + Math.cos(a) * r, z = P.cz + Math.sin(a) * r;
      V.push({ p: [x, H(x, z) + L.lift, z], n: normalAt(x, z), uv: uvOf(x, z), c: shadeAt(x, z, R - r) });
    }
    const vi = (j, k) => (j === 0 ? 0 : 1 + (j - 1) * N + (k % N));
    for (let k = 0; k < N; k++) I.push(0, vi(1, k + 1), vi(1, k));
    for (let j = 1; j < L.rings; j++) for (let k = 0; k < N; k++) I.push(vi(j, k), vi(j, k + 1), vi(j + 1, k + 1), vi(j, k), vi(j + 1, k + 1), vi(j + 1, k));
    B.tris('cobble', V, I);
    tris += I.length / 3;
  }

  // ---- 2. 縁石（向き 1 つ分ずつの石。上の面・内側の段・外側は地面まで） ----
  {
    let arc = 0;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * TAU, a1 = ((k + 1) / N) * TAU, R0 = P.edge[k], R1 = P.edge[(k + 1) % N];
      const pt = (a, r, dy) => { const x = P.cx + Math.cos(a) * r, z = P.cz + Math.sin(a) * r; return [x, H(x, z) + dy, z]; };
      const i0 = pt(a0, R0 - L.kerb, L.lift + L.kerbUp), i1 = pt(a1, R1 - L.kerb, L.lift + L.kerbUp);
      // 外の縁：地面から 1.5 cm（道の入る所は石畳と同じ高さ）
      const outY = (e) => 0.015 + (L.lift + L.kerbUp - 0.015) * e;
      const o0 = pt(a0, R0, outY(P.entry?.[k] ?? 0)), o1 = pt(a1, R1, outY(P.entry?.[(k + 1) % N] ?? 0));
      const len = Math.hypot(o1[0] - o0[0], o1[2] - o0[2]);
      const tone = 0.86 + 0.16 * valueNoise(k * 0.9, 3.7, seed + 5);   // 石ごとに少し違う色
      const col = [KERB[0] * tone, KERB[1] * tone, KERB[2] * tone];
      const V = [], I = [];
      const push = (p, n, u, v, c) => { V.push({ p, n, uv: [u, v], c }); return V.length - 1; };
      // 上の面（外へ向かって下がる）
      const up = v3.norm([Math.cos((a0 + a1) / 2) * 0.25, 1, Math.sin((a0 + a1) / 2) * 0.25]);
      const t0 = push(i0, up, arc, 0, col), t1 = push(i1, up, arc + len, 0, col), t2 = push(o1, up, arc + len, L.kerb, col), t3 = push(o0, up, arc, L.kerb, col);
      I.push(t0, t1, t2, t0, t2, t3);
      // 外側：地面の下まで（外向き）
      const out = v3.norm([Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
      const g0 = [o0[0], H(o0[0], o0[2]) - 0.08, o0[2]], g1 = [o1[0], H(o1[0], o1[2]) - 0.08, o1[2]];
      const dark = col.map((c) => c * 0.78);
      const s0 = push(o0, out, arc, 0, col), s1 = push(o1, out, arc + len, 0, col), s2 = push(g1, out, arc + len, 0.2, dark), s3 = push(g0, out, arc, 0.2, dark);
      I.push(s0, s1, s2, s0, s2, s3);
      // 内側：石畳の面までの小さな段（内向き）
      const inn = v3.mul(out, -1);
      const c0i = [i0[0], i0[1] - L.kerbUp - 0.01, i0[2]], c1i = [i1[0], i1[1] - L.kerbUp - 0.01, i1[2]];
      const r0 = push(i1, inn, arc + len, 0, col), r1 = push(i0, inn, arc, 0, col), r2 = push(c0i, inn, arc, 0.03, dark), r3 = push(c1i, inn, arc + len, 0.03, dark);
      I.push(r0, r1, r2, r0, r2, r3);
      B.tris('concrete', V, I);
      tris += I.length / 3;
      arc += len;
    }
  }

  // ---- 3. 井戸のまわりの敷石（一段高い石の輪。石の間に 2.5 cm のすき間） ----
  {
    const n = L.slabs, gap = 0.025, SUB = 3;
    for (let s = 0; s < n; s++) {
      const half = gap / 2;
      const a0 = (s / n) * TAU + half / L.slabIn, a1 = ((s + 1) / n) * TAU - half / L.slabIn;
      const tone = 0.84 + 0.2 * valueNoise(s * 1.3, 9.1, seed + 13);
      const col = [SLAB[0] * tone, SLAB[1] * tone, SLAB[2] * tone], dark = col.map((c) => c * 0.75);
      const V = [], I = [];
      const pt = (a, r, dy) => { const x = w.x + Math.cos(a) * r, z = w.z + Math.sin(a) * r; return [x, H(x, z) + dy, z]; };
      const topY = L.lift + L.slabUp;
      for (let i = 0; i <= SUB; i++) {
        const a = a0 + ((a1 - a0) * i) / SUB;
        // 上の面（内・外）と、外の段（上・下）
        V.push({ p: pt(a, L.slabIn, topY), n: [0, 1, 0], uv: [Math.cos(a) * L.slabIn + s * 1.7, Math.sin(a) * L.slabIn], c: col });
        V.push({ p: pt(a, L.slabOut, topY), n: [0, 1, 0], uv: [Math.cos(a) * L.slabOut + s * 1.7, Math.sin(a) * L.slabOut], c: col });
        const out = [Math.cos(a), 0, Math.sin(a)];
        V.push({ p: pt(a, L.slabOut, topY), n: out, uv: [a * L.slabOut, 0], c: col });
        V.push({ p: pt(a, L.slabOut, L.lift - 0.01), n: out, uv: [a * L.slabOut, 0.06], c: dark });
      }
      for (let i = 0; i < SUB; i++) {
        const b = i * 4, c = (i + 1) * 4;
        I.push(b, c, c + 1, b, c + 1, b + 1);          // 上の面
        I.push(b + 2, c + 2, c + 3, b + 2, c + 3, b + 3);   // 外の段
      }
      // 石の両端の小さな面（すき間の壁）
      for (const [a, sgn] of [[a0, -1], [a1, 1]]) {
        const side = [-Math.sin(a) * sgn, 0, Math.cos(a) * sgn], b = V.length;
        V.push({ p: pt(a, L.slabIn, topY), n: side, uv: [L.slabIn, 0], c: col });
        V.push({ p: pt(a, L.slabOut, topY), n: side, uv: [L.slabOut, 0], c: col });
        V.push({ p: pt(a, L.slabOut, L.lift - 0.01), n: side, uv: [L.slabOut, 0.06], c: dark });
        V.push({ p: pt(a, L.slabIn, L.lift - 0.01), n: side, uv: [L.slabIn, 0.06], c: dark });
        I.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      B.tris('concrete', V, I);
      tris += I.length / 3;
    }
  }

  // ---- 4. 井戸を囲む石畳の輪（石の列が井戸のまわりを回る）と、その外の細い縁取り ----
  //   下の石畳より 8 mm 上に重ねる。画像は輪の 1 周にちょうど整数回だけ並べる（つなぎ目が出ないように）
  {
    const M = 40, tile = 1.3, rMid = (L.slabOut + L.fanOut) / 2;
    const rep = Math.max(3, Math.round((TAU * rMid) / tile));
    const V = [], I = [], Vb = [], Ib = [];
    for (let k = 0; k <= M; k++) {
      const a = (k / M) * TAU, ca = Math.cos(a), sa = Math.sin(a), u = (k / M) * rep * tile;
      for (const [r, v] of [[L.slabOut - 0.02, 0], [L.fanOut, L.fanOut - L.slabOut + 0.02]]) {
        const x = w.x + ca * r, z = w.z + sa * r;
        V.push({ p: [x, H(x, z) + L.lift + 0.008, z], n: [0, 1, 0], uv: [u, v + rv[3] * 3], c: 0.86 * (0.9 + 0.16 * valueNoise(x * 0.6, z * 0.6, seed + 29)) });
      }
      for (const r of [L.fanOut - 0.01, L.bandOut]) {
        const x = w.x + ca * r, z = w.z + sa * r;
        Vb.push({ p: [x, H(x, z) + L.lift + 0.009, z], n: [0, 1, 0], uv: [a * r, r], c: [0.62, 0.61, 0.6] });
      }
      if (k < M) {
        const b = k * 2;
        I.push(b, b + 2, b + 3, b, b + 3, b + 1);
        Ib.push(b, b + 2, b + 3, b, b + 3, b + 1);
      }
    }
    B.tris('cobble', V, I);
    B.tris('concrete', Vb, Ib);
    tris += (I.length + Ib.length) / 3;
  }
  return tris;
}
