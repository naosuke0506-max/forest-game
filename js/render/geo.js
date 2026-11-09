// 形を組み立てる小道具（大廳の広間・火鉢・旗など）。頂点（位置・法線・UV・色）と三角形を貯めて、1 つの Mesh にする
//   三角形の表は、頂点の法線の向きに合わせて自動で決める（並べる順を気にしなくてよい）
//   色は頂点色：質感の色に掛ける明るさ（隅の陰・煤の汚れ）と色味
import { createMesh } from '../core/mesh-utils.js';

const TAU = Math.PI * 2;

/** 頂点と三角形を貯める入れ物。tile：質感画像 1 枚が表す実物の大きさ（m） */
export function geo(tile = 1) {
  const P = [], N = [], U = [], C = [], I = [];
  const G = {
    P, N, U, C, I, tile,
    get count() { return P.length / 3; },
    vert(p, n, uv, c) {
      P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); U.push(uv[0], uv[1]); C.push(c[0], c[1], c[2], 1);
      return P.length / 3 - 1;
    },
    tri(a, b, c) {
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const mx = N[a * 3] + N[b * 3] + N[c * 3], my = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], mz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
      if (nx * mx + ny * my + nz * mz < 0) I.push(a, c, b); else I.push(a, b, c);
    },
    /** 平らな凸の多角形。hint：表の向きの目安。col：色（数か [r,g,b]、または位置から色を返す関数） */
    flat(pts, col, hint) {
      const n = faceNormal(pts, hint);
      const ids = pts.map((p) => G.vert(p, n, planarUv(p, n, G.tile), colorAt(col, p, n)));
      for (let k = 1; k < pts.length - 1; k++) G.tri(ids[0], ids[k], ids[k + 1]);
    },
    /**
     * 細かく分けた平らな板（隅の陰を頂点に付けるため）。o：角、ex・ey：2 辺のベクトル、nx・ny：分ける数
     * col(p, n)：頂点の色
     */
    plane(o, ex, ey, nx, ny, col, hint) {
      const n = faceNormal([o, add(o, ex), add(add(o, ex), ey)], hint || cross(ex, ey));
      const base = G.count;
      for (let j = 0; j <= ny; j++) {
        for (let i = 0; i <= nx; i++) {
          const p = [o[0] + ex[0] * i / nx + ey[0] * j / ny, o[1] + ex[1] * i / nx + ey[1] * j / ny, o[2] + ex[2] * i / nx + ey[2] * j / ny];
          G.vert(p, n, planarUv(p, n, G.tile), colorAt(col, p, n));
        }
      }
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const a = base + j * (nx + 1) + i;
          G.tri(a, a + 1, a + nx + 2); G.tri(a, a + nx + 2, a + nx + 1);
        }
      }
    },
  };
  return G;
}

export function toMesh(device, G) {
  return createMesh(device, { positions: G.P, normals: G.N, uvs: G.U, colors: G.C, indices: G.I });
}

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function faceNormal(pts, hint) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
  }
  let n = norm([nx, ny, nz]);
  if (hint && n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) n = [-n[0], -n[1], -n[2]];
  return n;
}
/** 面の向きで、画像を貼る 2 軸を決める（上下の面は x・z、それ以外は横と高さ） */
function planarUv(p, n, tile) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return [p[0] / tile, p[2] / tile];
  // 壁：横の軸は「上 × 法線」（向きがそろうので、隣り合う壁で模様が続く）
  const h = norm([n[2], 0, -n[0]]);
  return [(p[0] * h[0] + p[2] * h[2]) / tile, -p[1] / tile];
}
function colorAt(col, p, n) {
  if (typeof col === 'function') return col(p, n);
  return Array.isArray(col) ? col : [col, col, col];
}

/**
 * 断面（[半径, 高さ] の閉じた多角形）を軸 Y の周りに回した形（柱・鉢・蝋燭・丸太）。cx・cz：軸の位置
 * col(k, p, n)：断面の k 番目の辺の、その頂点の色。a0〜a1：回す角度（一部だけの形も作れる）
 * axis 'z'：軸を前（+Z）へ向ける（壁の浮き彫りの珠など。高さが手前への出っ張りになる）
 */
export function lathe(G, prof, segs, col, { cx = 0, cy = 0, cz = 0, a0 = 0, a1 = TAU, closed = true, axis = 'y' } = {}) {
  const n = prof.length;
  let area = 0;
  for (let k = 0; k < n; k++) { const A = prof[k], B = prof[(k + 1) % n]; area += A[0] * B[1] - B[0] * A[1]; }
  const sgn = area > 0 ? 1 : -1;
  let vAcc = 0;
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const A = prof[k], B = prof[(k + 1) % n];
    const dr = B[0] - A[0], dh = B[1] - A[1], len = Math.hypot(dr, dh);
    if (len < 1e-6) continue;
    const nr = (sgn * dh) / len, nh = (-sgn * dr) / len;
    const rm = Math.max(0.05, (A[0] + B[0]) / 2);
    const base = G.count;
    for (let i = 0; i <= segs; i++) {
      const a = a0 + ((a1 - a0) * i) / segs, s = Math.sin(a), co = Math.cos(a);
      for (const [Q, v] of [[A, vAcc], [B, vAcc + len]]) {
        const p = axis === 'z' ? [cx + s * Q[0], cy + co * Q[0], cz + Q[1]] : [cx + s * Q[0], cy + Q[1], cz + co * Q[0]];
        const nn = axis === 'z' ? [s * nr, co * nr, nh] : [s * nr, nh, co * nr];
        const cc = typeof col === 'function' ? col(k, p, nn) : col;
        G.vert(p, nn, [(a * rm) / G.tile, v / G.tile], Array.isArray(cc) ? cc : [cc, cc, cc]);
      }
    }
    for (let i = 0; i < segs; i++) { const a = base + i * 2; G.tri(a, a + 1, a + 3); G.tri(a, a + 3, a + 2); }
    vAcc += len;
  }
}

/** 8 つの角の立体（下の面 0〜3、上の面 4〜7 を同じ順に）。凸の形に限る */
export function hexa(G, q, col) {
  const m = [0, 0, 0];
  for (const p of q) { m[0] += p[0] / 8; m[1] += p[1] / 8; m[2] += p[2] / 8; }
  for (const f of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
    const pts = f.map((i) => q[i]);
    const fc = [0, 0, 0];
    for (const p of pts) { fc[0] += p[0] / 4; fc[1] += p[1] / 4; fc[2] += p[2] / 4; }
    G.flat(pts, col, sub(fc, m));
  }
}

/** 角を面取りした箱（中心 c・大きさ s・面取り b）。skipBottom：床に置く物の底は作らない */
export function bevelBox(G, c, s, b, col, { skipBottom = false } = {}) {
  const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
  const P = (x, y, z) => [c[0] + x, c[1] + y, c[2] + z];
  // 6 面（面取りの分だけ内側）
  const faces = [
    [[1, 0, 0], (u, v) => P(hx, u * (hy - b), v * (hz - b))],
    [[-1, 0, 0], (u, v) => P(-hx, u * (hy - b), v * (hz - b))],
    [[0, 1, 0], (u, v) => P(u * (hx - b), hy, v * (hz - b))],
    [[0, -1, 0], (u, v) => P(u * (hx - b), -hy, v * (hz - b))],
    [[0, 0, 1], (u, v) => P(u * (hx - b), v * (hy - b), hz)],
    [[0, 0, -1], (u, v) => P(u * (hx - b), v * (hy - b), -hz)],
  ];
  for (const [n, f] of faces) {
    if (skipBottom && n[1] === -1) continue;
    G.flat([f(-1, -1), f(1, -1), f(1, 1), f(-1, 1)], col, n);
  }
  if (b <= 0) return;
  // 面取り（12 の辺）と角（8 つの三角形）
  const sx = [hx, hx - b], sy = [hy, hy - b], sz = [hz, hz - b];
  for (const X of [-1, 1]) for (const Y of [-1, 1]) {
    if (skipBottom && Y === -1) continue;
    G.flat([P(X * sx[0], Y * sy[1], -sz[1]), P(X * sx[0], Y * sy[1], sz[1]), P(X * sx[1], Y * sy[0], sz[1]), P(X * sx[1], Y * sy[0], -sz[1])], col, [X, Y, 0]);
  }
  for (const X of [-1, 1]) for (const Z of [-1, 1]) {
    G.flat([P(X * sx[0], -sy[1], Z * sz[1]), P(X * sx[0], sy[1], Z * sz[1]), P(X * sx[1], sy[1], Z * sz[0]), P(X * sx[1], -sy[1], Z * sz[0])], col, [X, 0, Z]);
  }
  for (const Y of [-1, 1]) for (const Z of [-1, 1]) {
    if (skipBottom && Y === -1) continue;
    G.flat([P(-sx[1], Y * sy[0], Z * sz[1]), P(sx[1], Y * sy[0], Z * sz[1]), P(sx[1], Y * sy[1], Z * sz[0]), P(-sx[1], Y * sy[1], Z * sz[0])], col, [0, Y, Z]);
  }
  for (const X of [-1, 1]) for (const Y of [-1, 1]) for (const Z of [-1, 1]) {
    if (skipBottom && Y === -1) continue;
    G.flat([P(X * sx[0], Y * sy[1], Z * sz[1]), P(X * sx[1], Y * sy[0], Z * sz[1]), P(X * sx[1], Y * sy[1], Z * sz[0])], col, [X, Y, Z]);
  }
}
