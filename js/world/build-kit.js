// 形を組み立てる道具（村の建物・家具・小物が使う）。PlayCanvas に依存しない計算だけ。
//   形は質感ごとに 1 つの入れ物に貯め、最後に質感の数だけの形にまとめる（描画命令は質感の数だけ）。
//   箱（box：横に回すだけ）と、向きを自由に決められる箱（obox：斜めの筋交い・屋根の棟・垂木など）を組み合わせて作る

// 質感：id（assets/textures/ の名前。null は画像なしで色だけ）、tile（画像 1 枚が表す大きさ m）、color（画像に掛ける色）
export const SURFACES = {
  stone:  { id: 'castle_wall_slates', tile: 3.0, color: [0.9, 0.88, 0.84] },
  plaster:{ id: 'white_plaster_rough_01', tile: 2.5, color: [1.0, 0.97, 0.9] },
  wood:   { id: 'weathered_brown_planks', tile: 1.6, color: [0.8, 0.72, 0.64] },
  thatch: { id: 'thatch_roof_angled', tile: 2.0, color: [0.95, 0.9, 0.8] },
  tiles:  { id: 'clay_roof_tiles', tile: 2.0, color: [0.95, 0.9, 0.88] },
  cobble: { id: 'cobblestone_floor_04', tile: 2.5, color: [0.85, 0.85, 0.82] },
  gate:   { id: 'wooden_gate', tile: 4.0, color: [0.85, 0.8, 0.75] },
  cloth:  { id: null, tile: 1.0, color: [1, 1, 1] },        // 布団・敷布・袋・鉄・ガラス（色は頂点色で）
};

/** 形を貯めていく入れ物（質感ごと） */
export function builder() {
  const parts = {};
  for (const k of Object.keys(SURFACES)) parts[k] = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  const tint = (c, shade) => (Array.isArray(shade) ? [c[0] * shade[0], c[1] * shade[1], c[2] * shade[2]] : [c[0] * shade, c[1] * shade, c[2] * shade]);
  /**
   * 四角い面を 1 枚足す（p0〜p3 は反時計回り、n は外向き）。shade：明るさ（数）か色（[r, g, b]）
   * vm：頂点ごとの明るさの掛け算 [p0, p1, p2, p3]（壁の足もとを暗くするなど）
   */
  function quad(surf, p0, p1, p2, p3, n, shade = 1, vm = null) {
    const g = parts[surf], tile = SURFACES[surf].tile, c = tint(SURFACES[surf].color, shade);
    const b = g.positions.length / 3;
    // 面の向きで、画像を貼る 2 軸を決める（上下の面は x・z、それ以外は横と高さ）
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    [p0, p1, p2, p3].forEach((p, i) => {
      g.positions.push(p[0], p[1], p[2]);
      g.normals.push(n[0], n[1], n[2]);
      let u, v;
      if (ay > ax && ay > az) { u = p[0]; v = p[2]; }
      else if (ax > az) { u = p[2]; v = p[1]; }
      else { u = p[0]; v = p[1]; }
      g.uvs.push(u / tile, -v / tile);
      const m = vm ? vm[i] : 1;
      g.colors.push(c[0] * m, c[1] * m, c[2] * m, 1);
    });
    g.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  /** 斜めの面（屋根・斜めの木）：画像の横を p0→p1 に、縦を p0→p3 に沿わせる。off：画像のずらし [u, v]（m） */
  function slope(surf, p0, p1, p2, p3, n, shade = 1, off = null) {
    const g = parts[surf], tile = SURFACES[surf].tile, c = tint(SURFACES[surf].color, shade);
    const b = g.positions.length / 3;
    const ex = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const ey = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
    const lx = Math.hypot(...ex), ly = Math.hypot(...ey);
    const ou = off ? off[0] : 0, ov = off ? off[1] : 0;
    const uv = [[0, 0], [lx, 0], [lx, ly], [0, ly]];
    [p0, p1, p2, p3].forEach((p, i) => {
      g.positions.push(p[0], p[1], p[2]);
      g.normals.push(n[0], n[1], n[2]);
      g.uvs.push((uv[i][0] + ou) / tile, -(uv[i][1] + ov) / tile);
      g.colors.push(c[0], c[1], c[2], 1);
    });
    g.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  /** 三角の面（妻壁） */
  function tri(surf, p0, p1, p2, n, shade = 1) {
    const g = parts[surf], tile = SURFACES[surf].tile, c = tint(SURFACES[surf].color, shade);
    const b = g.positions.length / 3;
    for (const p of [p0, p1, p2]) {
      g.positions.push(...p); g.normals.push(...n);
      g.uvs.push((p[0] + p[2]) / tile, -p[1] / tile); g.colors.push(c[0], c[1], c[2], 1);
    }
    g.indices.push(b, b + 1, b + 2);
  }
  return { parts, quad, slope, tri };
}

/** 向き（ヨー角）で回した座標系：原点 o、前 f（地面の上の単位ベクトル）、右 r */
export function frame(ox, oy, oz, yawDeg) {
  const a = (yawDeg * Math.PI) / 180;
  const f = [Math.sin(a), 0, Math.cos(a)], r = [Math.cos(a), 0, -Math.sin(a)];
  return {
    at: (x, y, z) => [ox + r[0] * x + f[0] * z, oy + y, oz + r[2] * x + f[2] * z],
    dir: (x, y, z) => [r[0] * x + f[0] * z, y, r[2] * x + f[2] * z],
  };
}

/**
 * 箱（中心 cx,cz、底の高さ y0、幅 w（横）・奥行き d・高さ h、向き yaw）
 *   grad：[下の明るさ, 上の明るさ]（横の面を下から上へ明るくする。壁の足もとの陰り）
 *   skip：描かない横の面（'front' 'back' 'right' 'left' を含む文字列。壁に付いて見えない面など）
 */
export function box(B, surf, cx, y0, cz, w, d, h, yaw, { top = true, bottom = false, shade = 1, grad = null, skip = '' } = {}) {
  const F = frame(cx, y0, cz, yaw);
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const P = (x, y, z) => F.at(x, y, z), N = (x, y, z) => F.dir(x, y, z);
  const vm = grad ? [grad[0], grad[0], grad[1], grad[1]] : null;
  if (!skip.includes('front')) B.quad(surf, P(x0, 0, z1), P(x1, 0, z1), P(x1, h, z1), P(x0, h, z1), N(0, 0, 1), shade, vm);   // 前
  if (!skip.includes('back')) B.quad(surf, P(x1, 0, z0), P(x0, 0, z0), P(x0, h, z0), P(x1, h, z0), N(0, 0, -1), shade, vm);  // 後
  if (!skip.includes('right')) B.quad(surf, P(x1, 0, z1), P(x1, 0, z0), P(x1, h, z0), P(x1, h, z1), N(1, 0, 0), shade, vm);   // 右
  if (!skip.includes('left')) B.quad(surf, P(x0, 0, z0), P(x0, 0, z1), P(x0, h, z1), P(x0, h, z0), N(-1, 0, 0), shade, vm);  // 左
  if (top) B.quad(surf, P(x0, h, z1), P(x1, h, z1), P(x1, h, z0), P(x0, h, z0), N(0, 1, 0), shade, grad ? [grad[1], grad[1], grad[1], grad[1]] : null);
  if (bottom) B.quad(surf, P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1), N(0, -1, 0), shade, grad ? [grad[0], grad[0], grad[0], grad[0]] : null);
}

// ---- 向きを自由に決められる箱 ----
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

/**
 * 向きを自由に決めた箱（世界の座標）。中心 c、軸 a（長さの向き。木目を沿わせる）・b・n（互いに直角の単位ベクトル）、
 * 大きさ la・lb・ln。skip：描かない面（'+a' '-a' '+b' '-b' '+n' '-n' を含む文字列。壁に付いた裏や、ほかの木に隠れる端）
 * off：画像のずらし（同じ模様が並ばないように）
 */
export function obox(B, surf, c, a, b, n, la, lb, ln, shade = 1, { skip = '', off = null } = {}) {
  const ax = [a, b, n], hs = [la / 2, lb / 2, ln / 2], names = ['a', 'b', 'n'];
  for (let k = 0; k < 3; k++) for (const sg of [1, -1]) {
    if (skip.includes((sg > 0 ? '+' : '-') + names[k])) continue;
    const nn = v3.mul(ax[k], sg);
    // 面の横（u）は長さの向き（端の面は b）、縦（v）は u × v = 面の向き になるように
    const iu = k === 0 ? 1 : 0, iv = 3 - k - iu;
    const u = ax[iu];
    let v = ax[iv];
    if (v3.dot(v3.cross(u, v), nn) < 0) v = v3.mul(v, -1);
    const ctr = v3.add(c, v3.mul(nn, hs[k]));
    const U = v3.mul(u, hs[iu]), V = v3.mul(v, hs[iv]);
    const p0 = v3.sub(v3.sub(ctr, U), V), p1 = v3.sub(v3.add(ctr, U), V), p2 = v3.add(v3.add(ctr, U), V), p3 = v3.add(v3.sub(ctr, U), V);
    B.slope(surf, p0, p1, p2, p3, nn, shade, off);
  }
}

/**
 * 横に寝かせた、または立てた多角柱（樽・丸太・巻き上げの軸など）。中心 c、軸 a（単位ベクトル）、長さ len、半径 r、辺の数 sides
 * caps：両端の面も描くか。capShade：端の面の色（切り口）
 */
export function prism(B, surf, c, a, len, r, sides, shade = 1, { caps = true, capSurf = null, capShade = null, bulge = 0 } = {}) {
  // 軸に直角な 2 本
  const t0 = v3.norm(Math.abs(a[1]) < 0.9 ? v3.cross(a, [0, 1, 0]) : v3.cross(a, [1, 0, 0]));
  const t1 = v3.cross(a, t0);
  const e0 = v3.sub(c, v3.mul(a, len / 2)), e1 = v3.add(c, v3.mul(a, len / 2));
  const ring = (i, rr) => { const t = (i / sides) * Math.PI * 2; return v3.add(v3.mul(t0, Math.cos(t) * rr), v3.mul(t1, Math.sin(t) * rr)); };
  // 樽のふくらみ：真ん中だけ太い（bulge > 0 のときは 2 段に分ける）
  const rings = bulge > 0 ? [[e0, r], [c, r * (1 + bulge)], [e1, r]] : [[e0, r], [e1, r]];
  for (let s = 0; s < rings.length - 1; s++) {
    const [ca, ra] = rings[s], [cb, rb] = rings[s + 1];
    for (let i = 0; i < sides; i++) {
      const q0 = ring(i, 1), q1 = ring(i + 1, 1), nm = v3.norm(ring(i + 0.5, 1));
      B.slope(surf, v3.add(ca, v3.mul(q0, ra)), v3.add(ca, v3.mul(q1, ra)), v3.add(cb, v3.mul(q1, rb)), v3.add(cb, v3.mul(q0, rb)), nm, shade);
    }
  }
  if (!caps) return;
  const cs = capSurf || surf, csh = capShade ?? shade;
  for (const [e, sg] of [[e1, 1], [e0, -1]]) {
    // 端の面：扇形を 2 つずつの三角に（四角を並べる）
    for (let i = 0; i < sides; i += 2) {
      const pa = v3.add(e, ring(i, r)), pb = v3.add(e, ring(i + 1, r)), pc = v3.add(e, ring(Math.min(i + 2, sides), r));
      B.quad(cs, e, pa, pb, pc, v3.mul(a, sg), csh);
    }
  }
}
