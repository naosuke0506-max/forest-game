// 村の建物を組み立てる道具と、家（中に入れる。一階建て・二階建て）。
//   形は箱・切妻屋根を組み合わせて作り、質感ごとに 1 つの形にまとめる（描画命令は質感の数だけ）。
//   家：石の土台、しっくいの壁（木の柱と梁）、扉口（開いた扉）、窓（木の枠と開いた鎧戸）、板の床、
//       二階建ては階段と二階の床（階段の穴の周りに手すり）、切妻屋根、暖炉と煙突。
//       家具：ベッド・タンス・机と腰掛け・長持（箱）・棚・袋。ベッドの下とタンスの中は隠れ場所（次の段階で使う）
//   歩ける面（床・階段）は world/floors.js へ、ぶつかる物（壁・家具・手すり）は world/obstacles.js へ登録する
// 家の中の座標：x は横（右が +）、z は奥行き（前＝扉の側が +）、y は高さ

// 質感：id（assets/textures/ の名前。null は画像なしで色だけ）、tile（画像 1 枚が表す大きさ m）、color（画像に掛ける色）
export const SURFACES = {
  stone:  { id: 'castle_wall_slates', tile: 3.0, color: [0.9, 0.88, 0.84] },
  plaster:{ id: 'white_plaster_rough_01', tile: 2.5, color: [1.0, 0.97, 0.9] },
  wood:   { id: 'weathered_brown_planks', tile: 1.6, color: [0.8, 0.72, 0.64] },
  thatch: { id: 'thatch_roof_angled', tile: 2.0, color: [0.95, 0.9, 0.8] },
  tiles:  { id: 'clay_roof_tiles', tile: 2.0, color: [0.95, 0.9, 0.88] },
  cobble: { id: 'cobblestone_floor_04', tile: 2.5, color: [0.85, 0.85, 0.82] },
  gate:   { id: 'wooden_gate', tile: 4.0, color: [0.85, 0.8, 0.75] },
  cloth:  { id: null, tile: 1.0, color: [1, 1, 1] },        // 布団・敷布・袋（色は頂点色で）
};

/** 形を貯めていく入れ物（質感ごと） */
export function builder() {
  const parts = {};
  for (const k of Object.keys(SURFACES)) parts[k] = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  const tint = (c, shade) => (Array.isArray(shade) ? [c[0] * shade[0], c[1] * shade[1], c[2] * shade[2]] : [c[0] * shade, c[1] * shade, c[2] * shade]);
  /** 四角い面を 1 枚足す（p0〜p3 は反時計回り、n は外向き）。shade：明るさ（数）か色（[r, g, b]） */
  function quad(surf, p0, p1, p2, p3, n, shade = 1) {
    const g = parts[surf], tile = SURFACES[surf].tile, c = tint(SURFACES[surf].color, shade);
    const b = g.positions.length / 3;
    // 面の向きで、画像を貼る 2 軸を決める（上下の面は x・z、それ以外は横と高さ）
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    for (const p of [p0, p1, p2, p3]) {
      g.positions.push(p[0], p[1], p[2]);
      g.normals.push(n[0], n[1], n[2]);
      let u, v;
      if (ay > ax && ay > az) { u = p[0]; v = p[2]; }
      else if (ax > az) { u = p[2]; v = p[1]; }
      else { u = p[0]; v = p[1]; }
      g.uvs.push(u / tile, -v / tile);
      g.colors.push(c[0], c[1], c[2], 1);
    }
    g.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  /** 斜めの面（屋根）：画像の縦を、坂に沿わせる */
  function slope(surf, p0, p1, p2, p3, n, shade = 1) {
    const g = parts[surf], tile = SURFACES[surf].tile, c = tint(SURFACES[surf].color, shade);
    const b = g.positions.length / 3;
    const ex = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const ey = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
    const lx = Math.hypot(...ex), ly = Math.hypot(...ey);
    const uv = [[0, 0], [lx, 0], [lx, ly], [0, ly]];
    [p0, p1, p2, p3].forEach((p, i) => {
      g.positions.push(p[0], p[1], p[2]);
      g.normals.push(n[0], n[1], n[2]);
      g.uvs.push(uv[i][0] / tile, -uv[i][1] / tile);
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

/** 箱（中心 cx,cz、底の高さ y0、幅 w（横）・奥行き d・高さ h、向き yaw） */
export function box(B, surf, cx, y0, cz, w, d, h, yaw, { top = true, bottom = false, shade = 1 } = {}) {
  const F = frame(cx, y0, cz, yaw);
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const P = (x, y, z) => F.at(x, y, z), N = (x, y, z) => F.dir(x, y, z);
  B.quad(surf, P(x0, 0, z1), P(x1, 0, z1), P(x1, h, z1), P(x0, h, z1), N(0, 0, 1), shade);   // 前
  B.quad(surf, P(x1, 0, z0), P(x0, 0, z0), P(x0, h, z0), P(x1, h, z0), N(0, 0, -1), shade);  // 後
  B.quad(surf, P(x1, 0, z1), P(x1, 0, z0), P(x1, h, z0), P(x1, h, z1), N(1, 0, 0), shade);   // 右
  B.quad(surf, P(x0, 0, z0), P(x0, 0, z1), P(x0, h, z1), P(x0, h, z0), N(-1, 0, 0), shade);  // 左
  if (top) B.quad(surf, P(x0, h, z1), P(x1, h, z1), P(x1, h, z0), P(x0, h, z0), N(0, 1, 0), shade);
  if (bottom) B.quad(surf, P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1), N(0, -1, 0), shade);
}

const STORY = 2.9;    // 床から上の階の床まで（m）
const T = 0.22;       // 壁の厚さ
const FOUND = 0.45;   // 石の土台の高さ（一階の床の高さ）
const DOOR_W = 1.2, DOOR_H = 2.2;
const WIN_W = 0.8, WIN_H = 0.95, SILL = 0.95;
const STAIR_W = 0.95, STAIR_L = 3.9;
const INSIDE = 0.78;  // 家の中の面は少し暗く（外の光が入りにくい感じ）

/**
 * 家を 1 軒建てる
 * @param {object} B builder()
 * @param {object} h { cx, cz, y0（地面の高さ）, yaw, w（横）, d（奥行き）, stories（1 か 2）, roof（'thatch' | 'tiles'）, wall（しっくいの色）, rnd }
 * @param {object} reg 登録先 { floors, solid(x, z, r, range?), hides: [] }
 */
export function buildHouse(B, h, reg) {
  const { cx, cz, y0, yaw, w, d, stories, roof, rnd } = h;
  const F = frame(cx, y0, cz, yaw);
  const iw = w / 2 - T, id = d / 2 - T;          // 中の広さの半分
  const fy = [FOUND + 0.05, FOUND + 0.05 + STORY]; // 各階の床の高さ（土台からの高さ）
  const top = FOUND + stories * STORY;            // 壁の上
  const wallShade = h.wall || 1;
  const twoStory = stories === 2;
  const W = (x, y, z) => F.at(x, y, z);
  const wpos = (x, z) => { const p = F.at(x, 0, z); return [p[0], p[2]]; };
  const range = (floor) => ({ y0: y0 + fy[floor] - 0.6, y1: y0 + fy[floor] + 0.7 });   // その階にいる人だけがぶつかる高さ
  /** 家の中の座標で箱を置く */
  const bx = (surf, x, y, z, bw, bd, bh, opt = {}, rot = 0) => { const p = F.at(x, 0, z); box(B, surf, p[0], y0 + y, p[2], bw, bd, bh, yaw + rot, opt); };

  // ===== 土台・床 =====
  bx('stone', 0, -0.6, 0, w + 0.24, d + 0.24, FOUND + 0.6);
  bx('wood', 0, FOUND, 0, iw * 2, id * 2, 0.05, { shade: INSIDE });              // 一階の板の床
  // 扉の前の石の段
  bx('stone', 0, -0.3, d / 2 + 0.35, DOOR_W + 0.5, 0.6, 0.55);
  { const [x, z] = wpos(0, d / 2 + 0.35); reg.floors.addFloor({ cx: x, cz: z, yaw, hw: (DOOR_W + 0.5) / 2, hd: 0.3, y: y0 + 0.25 }); }
  { const [x, z] = wpos(0, 0); reg.floors.addFloor({ cx: x, cz: z, yaw, hw: iw + 0.02, hd: id + 0.02, y: y0 + fy[0] }); }
  // 扉口の床（壁の厚みの所）
  { const [x, z] = wpos(0, d / 2 - T / 2); reg.floors.addFloor({ cx: x, cz: z, yaw, hw: DOOR_W / 2, hd: T / 2 + 0.05, y: y0 + fy[0] }); }

  // ===== 壁：開口（扉・窓）を避けて箱を並べる =====
  // 1 本の壁：local 軸 axis（'x' は前後の壁、'z' は左右の壁）の上、位置 at（もう一方の軸）。開口 [{ c（中心）, w, y, h }]
  function wall(axis, at, len, story, openings) {
    const y = FOUND + story * STORY, H = STORY;
    const piece = (c, l, py, ph) => {
      if (l <= 0.01 || ph <= 0.01) return;
      if (axis === 'x') bx('plaster', c, py, at, l, T, ph, { shade: wallShade });
      else bx('plaster', at, py, c, T, l, ph, { shade: wallShade });
    };
    const ops = [...openings].sort((a, b) => a.c - b.c);
    let s = -len / 2;
    for (const o of ops) {
      piece((s + o.c - o.w / 2) / 2, o.c - o.w / 2 - s, y, H);                   // 開口の手前の全部の高さ
      piece(o.c, o.w, y, o.y);                                                   // 開口の下
      piece(o.c, o.w, y + o.y + o.h, H - o.y - o.h);                             // 開口の上
      s = o.c + o.w / 2;
    }
    piece((s + len / 2) / 2, len / 2 - s, y, H);
  }
  /** 窓の枠と、外へ開いた鎧戸 */
  function windowFrame(axis, at, out, c, story) {
    const y = FOUND + story * STORY + SILL;
    const sh = 0.82;
    if (axis === 'x') {
      bx('wood', c, y - 0.08, at + out * 0.02, WIN_W + 0.2, T + 0.08, 0.08, { shade: sh });             // 下枠
      bx('wood', c, y + WIN_H, at + out * 0.02, WIN_W + 0.2, T + 0.08, 0.1, { shade: sh });             // 上枠
      for (const s of [-1, 1]) {
        bx('wood', c + s * (WIN_W / 2 + 0.04), y, at + out * 0.02, 0.08, T + 0.08, WIN_H, { shade: sh }); // 縦枠
        bx('gate', c + s * (WIN_W / 2 + WIN_W / 4 + 0.08), y, at + out * (T / 2 + 0.05), WIN_W / 2, 0.04, WIN_H);  // 鎧戸
      }
    } else {
      bx('wood', at + out * 0.02, y - 0.08, c, T + 0.08, WIN_W + 0.2, 0.08, { shade: sh });
      bx('wood', at + out * 0.02, y + WIN_H, c, T + 0.08, WIN_W + 0.2, 0.1, { shade: sh });
      for (const s of [-1, 1]) {
        bx('wood', at + out * 0.02, y, c + s * (WIN_W / 2 + 0.04), T + 0.08, 0.08, WIN_H, { shade: sh });
        bx('gate', at + out * (T / 2 + 0.05), y, c + s * (WIN_W / 2 + WIN_W / 4 + 0.08), 0.04, WIN_W / 2, WIN_H);
      }
    }
  }
  const win = (c) => ({ c, w: WIN_W, y: SILL, h: WIN_H });
  for (let s = 0; s < stories; s++) {
    // 前の壁：一階は扉口（広い家は横に窓も）、二階は窓 2 つ
    const front = s === 0 ? [{ c: 0, w: DOOR_W, y: 0, h: DOOR_H }, ...(w >= 6.4 ? [win(w * 0.3)] : [])] : [win(-w * 0.24), win(w * 0.24)];
    wall('x', d / 2 - T / 2, w, s, front);
    for (const o of front) if (o.h === WIN_H) windowFrame('x', d / 2 - T / 2, 1, o.c, s);
    // 後ろの壁：窓 1 つ（二階建ての一階は、タンスと重ならない右寄り）
    const backWin = [win(twoStory && s === 0 ? w * 0.18 : 0)];
    wall('x', -d / 2 + T / 2, w, s, backWin);
    windowFrame('x', -d / 2 + T / 2, -1, backWin[0].c, s);
    // 左右の壁：窓 1〜2 つ
    const sideWins = d >= 7.2 ? [win(-d * 0.22), win(d * 0.22)] : [win(0)];
    for (const side of [-1, 1]) {
      const wins = side < 0 && twoStory && s === 0 ? [] : sideWins;   // 階段の横（一階の左）は窓なし
      wall('z', side * (w / 2 - T / 2), d - 2 * T, s, wins.map((o) => ({ ...o })));
      for (const o of wins) windowFrame('z', side * (w / 2 - T / 2), side, o.c, s);
    }
  }
  // 開いた扉（扉口の内側で、壁に沿って開いている）
  bx('gate', DOOR_W / 2 + 0.05, FOUND + 0.05, d / 2 - T - 0.55, 0.06, 1.1, DOOR_H - 0.05, {}, 0);
  for (const z of [d / 2 - T - 0.3, d / 2 - T - 0.8]) { const [x, zz] = wpos(DOOR_W / 2 + 0.05, z); reg.solid(x, zz, 0.1, range(0)); }
  // 当たり判定：壁に沿って円を並べる（扉口は空ける）
  const line = (ax, az, bx2, bz2) => {
    const [x0, z0] = wpos(ax, az), [x1, z1] = wpos(bx2, bz2);
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.25);
    for (let i = 0; i <= n; i++) reg.solid(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, 0.22);
  };
  const ex = w / 2 - T / 2, ez = d / 2 - T / 2;
  line(-ex, ez, -DOOR_W / 2 - 0.25, ez);
  line(DOOR_W / 2 + 0.25, ez, ex, ez);
  line(-ex, -ez, ex, -ez);
  line(-ex, -ez, -ex, ez);
  line(ex, -ez, ex, ez);

  // ===== 木の柱と梁（外から見える骨組み） =====
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx('wood', sx * (w / 2 - 0.08), FOUND, sz * (d / 2 - 0.08), 0.26, 0.26, top - FOUND + 0.05);
  for (let s = 1; s <= stories; s++) {
    const y = FOUND + s * STORY - 0.12;
    for (const sz of [-1, 1]) bx('wood', 0, y, sz * (d / 2 + 0.01), w + 0.04, 0.12, 0.2);
    for (const sx of [-1, 1]) bx('wood', sx * (w / 2 + 0.01), y, 0, 0.12, d + 0.04, 0.2);
  }
  // 扉口の枠
  for (const s of [-1, 1]) bx('wood', s * (DOOR_W / 2 + 0.07), FOUND, d / 2 - T / 2, 0.14, T + 0.1, DOOR_H);
  bx('wood', 0, FOUND + DOOR_H, d / 2 - T / 2, DOOR_W + 0.28, T + 0.1, 0.16);

  // ===== 二階：床（階段の穴を空ける）・階段・手すり =====
  const sx0 = -iw, sx1 = -iw + STAIR_W;           // 階段の横の範囲（左の壁沿い）
  const zb = id - 0.35, zt = zb - STAIR_L;        // 階段の下の端（前）と上の端（後ろ）
  if (twoStory) {
    const y2 = FOUND + STORY;                     // 二階の床の下の面
    // 床の板（穴の右側は奥行き全部、穴の列は階段の上の端より後ろだけ）
    bx('wood', (sx1 + iw) / 2, y2 - 0.12, 0, iw - sx1, id * 2, 0.17, { bottom: true, shade: INSIDE });
    bx('wood', (sx0 + sx1) / 2, y2 - 0.12, (zt - id) / 2, STAIR_W, zt + id, 0.17, { bottom: true, shade: INSIDE });
    bx('wood', (sx0 + sx1) / 2, y2 - 0.12, (zb + id) / 2, STAIR_W, id - zb, 0.17, { bottom: true, shade: INSIDE });
    { const [x, z] = wpos((sx1 + iw) / 2, 0); reg.floors.addFloor({ cx: x, cz: z, yaw, hw: (iw - sx1) / 2 + 0.02, hd: id + 0.02, y: y0 + fy[1] }); }
    { const [x, z] = wpos((sx0 + sx1) / 2, (zt - id) / 2); reg.floors.addFloor({ cx: x, cz: z, yaw, hw: STAIR_W / 2 + 0.02, hd: (zt + id) / 2 + 0.02, y: y0 + fy[1] }); }
    // 階段：段を 13 段（下は詰めた箱。段の下へは入れない）
    const N = 13;
    for (let k = 0; k < N; k++) {
      const z = zb - (k + 0.5) * (STAIR_L / N);
      bx('wood', (sx0 + sx1) / 2, FOUND + 0.05, z, STAIR_W, STAIR_L / N + 0.01, ((k + 1) * STORY) / N, { shade: k % 2 ? INSIDE : INSIDE * 0.92 });
    }
    { const [x, z] = wpos((sx0 + sx1) / 2, (zb + zt) / 2); reg.floors.addRamp({ cx: x, cz: z, yaw, hw: STAIR_W / 2, hd: STAIR_L / 2, y0: y0 + fy[1], y1: y0 + fy[0] }); }
    // 階段の横と後ろ：一階にいる人は、階段の高い所の横や後ろから入れない（段の下は詰めた箱）
    for (let z = zb - 0.9; z >= zt - 0.05; z -= 0.3) { const [x, zz] = wpos(sx1 + 0.12, z); reg.solid(x, zz, 0.15, range(0)); }
    for (let x = sx0 + 0.15; x <= sx1 + 0.1; x += 0.3) { const [xx, zz] = wpos(x, zt - 0.15); reg.solid(xx, zz, 0.15, range(0)); }
    // 二階の手すり：穴の右側と前側
    const ry = FOUND + STORY + 0.05;
    bx('wood', sx1 + 0.04, ry + 0.85, (zb + zt) / 2, 0.08, STAIR_L, 0.08);
    bx('wood', (sx0 + sx1) / 2, ry + 0.85, zb + 0.04, STAIR_W, 0.08, 0.08);
    for (let z = zt + 0.6; z <= zb + 0.05; z += 0.6) bx('wood', sx1 + 0.04, ry, z, 0.06, 0.06, 0.85);
    for (let z = zt + 0.3; z <= zb; z += 0.3) { const [x, zz] = wpos(sx1 + 0.17, z); reg.solid(x, zz, 0.15, range(1)); }
    for (let x = sx0 + 0.15; x <= sx1 + 0.1; x += 0.3) { const [xx, zz] = wpos(x, zb + 0.17); reg.solid(xx, zz, 0.15, range(1)); }
  }

  // ===== 屋根（切妻。棟は奥行きの向き）と妻壁・暖炉の煙突 =====
  const over = 0.55, rh = w * (0.42 + rnd.next() * 0.16);
  const L = (x, y, z) => W(x, top + y, z);
  const ridgeF = L(0, rh, d / 2 + over), ridgeB = L(0, rh, -d / 2 - over);
  for (const sx of [-1, 1]) {
    const eF = L(sx * (w / 2 + over), -over * 0.5, d / 2 + over), eB = L(sx * (w / 2 + over), -over * 0.5, -d / 2 - over);
    const ny = w / 2 + over, nn = Math.hypot(ny, rh + over * 0.5);
    const nrm = F.dir((sx * (rh + over * 0.5)) / nn, ny / nn, 0);
    if (sx > 0) B.slope(roof, eB, eF, ridgeF, ridgeB, nrm);
    else B.slope(roof, eF, eB, ridgeB, ridgeF, nrm);
  }
  for (const sz of [-1, 1]) {
    const p = [W(-w / 2, top, sz * (d / 2 - 0.01)), W(w / 2, top, sz * (d / 2 - 0.01)), W(0, top + rh, sz * (d / 2 - 0.01))];
    if (sz > 0) B.tri('plaster', p[0], p[1], p[2], F.dir(0, 0, 1), wallShade); else B.tri('plaster', p[1], p[0], p[2], F.dir(0, 0, -1), wallShade);
  }

  // ===== 家具 =====
  const furniture = new Furniture(B, F, y0, yaw, reg, range);
  if (twoStory) {
    const g = fy[0], u = fy[1];
    // 一階：暖炉（右の壁）、机と腰掛け、長持、タンス（後ろの壁）、袋
    furniture.hearth(iw - 0.32, -0.3, g, top + rh * 0.4, -90);
    furniture.table(Math.min(iw - 1.1, 0.6), 0.1, g, rnd);
    furniture.chest(iw - 0.32, id - 1.1, g, -90);
    furniture.wardrobe(sx1 + 0.75, -id + 0.3, g, 0);
    furniture.sacks(-iw + 0.45 + STAIR_W, id - 0.5, g, rnd);
    // 二階：ベッド（後ろの壁の右）、タンス（右の壁の前）、長持（ベッドの足もと）。広い家はもう 1 つベッド
    furniture.bed(iw - 0.62, -id + 1.08, u, 0, rnd);
    furniture.wardrobe(iw - 0.3, id - 0.8, u, -90);
    furniture.chest(iw - 1.3, -id + 2.4, u, 0);
    if (w >= 7) furniture.bed(-iw + 1.08, -id + 0.6, u, 90, rnd);
    furniture.shelf(0, id - 0.12, u + 1.2, 180);
  } else {
    const g = fy[0];
    furniture.bed(-iw + 0.62, -id + 1.08, g, 0, rnd);
    furniture.chest(-iw + 0.62, -id + 2.45, g, 0);
    furniture.wardrobe(iw - 0.3, -id + 0.8, g, -90);
    furniture.table(iw * 0.35, id * 0.15, g, rnd);
    furniture.shelf(iw - 1.3, -id + 0.12, g + 1.3, 0);
    furniture.sacks(iw - 0.45, id - 0.55, g, rnd);
  }
  return { top: top + rh };
}

/** 家具（家の中の座標で置く）。ぶつかる範囲はその階の高さだけ */
class Furniture {
  constructor(B, F, y0, yaw, reg, range) { Object.assign(this, { B, F, y0, yaw, reg, range }); }
  bx(surf, x, y, z, w, d, h, rot, opt = {}) {
    const p = this.F.at(x, 0, z);
    box(this.B, surf, p[0], this.y0 + y, p[2], w, d, h, this.yaw + rot, opt);
  }
  /** 家具の中の座標（向き rot で回した）→ 家の中の座標 */
  local(x, z, dx, dz, rot) {
    const a = (rot * Math.PI) / 180;
    return [x + Math.cos(a) * dx + Math.sin(a) * dz, z - Math.sin(a) * dx + Math.cos(a) * dz];
  }
  solid(x, z, r, floorY) {
    const p = this.F.at(x, 0, z);
    this.reg.solid(p[0], p[2], r, { y0: this.y0 + floorY - 0.6, y1: this.y0 + floorY + 0.7 });
  }
  hide(kind, x, z, floorY, rot) {
    const p = this.F.at(x, 0, z);
    this.reg.hides.push({ kind, x: p[0], z: p[2], y: this.y0 + floorY, yaw: this.yaw + rot });
  }
  /** ベッド：長さ 2m・幅 1m。頭は rot の向きの後ろ。下に 0.3m の隙間（潜って隠れる） */
  bed(x, z, y, rot, rnd) {
    const L = 2.0, Wd = 1.0;
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [px, pz] = P(sx * (Wd / 2 - 0.05), sz * (L / 2 - 0.05)); this.bx('wood', px, y, pz, 0.09, 0.09, 0.45, rot); }
    { const [px, pz] = P(0, 0); this.bx('wood', px, y + 0.3, pz, Wd, L, 0.12, rot); }                     // 枠
    { const [px, pz] = P(0, -L / 2 + 0.03); this.bx('wood', px, y, pz, Wd + 0.06, 0.08, 1.05, rot); }      // 頭板
    { const [px, pz] = P(0, L / 2 - 0.03); this.bx('wood', px, y, pz, Wd + 0.06, 0.08, 0.62, rot); }       // 足板
    { const [px, pz] = P(0, 0.02); this.bx('cloth', px, y + 0.42, pz, Wd - 0.08, L - 0.12, 0.16, rot, { shade: [0.86, 0.8, 0.66] }); }  // 敷布団
    const blanket = [[0.55, 0.16, 0.12], [0.2, 0.32, 0.5], [0.3, 0.42, 0.22], [0.52, 0.4, 0.22]][Math.floor(rnd.next() * 4)];
    { const [px, pz] = P(0, 0.3); this.bx('cloth', px, y + 0.57, pz, Wd - 0.02, L * 0.6, 0.05, rot, { shade: blanket }); }  // 毛布
    { const [px, pz] = P(0, -L / 2 + 0.32); this.bx('cloth', px, y + 0.57, pz, Wd * 0.6, 0.35, 0.1, rot, { shade: [0.92, 0.9, 0.84] }); }  // 枕
    for (const dz of [-0.6, 0, 0.6]) { const [px, pz] = P(0, dz); this.solid(px, pz, 0.48, y); }
    { const [px, pz] = P(0, 0); this.hide('bed', px, pz, y, rot); }
  }
  /** タンス：幅 1.05・奥行き 0.55・高さ 1.95。扉は rot の向きの前（中に入って隠れる） */
  wardrobe(x, z, y, rot) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    { const [px, pz] = P(0, 0); this.bx('wood', px, y, pz, 1.05, 0.55, 1.95, rot, { shade: 0.72 }); }
    { const [px, pz] = P(0, 0.01); this.bx('wood', px, y + 1.95, pz, 1.15, 0.62, 0.08, rot, { shade: 0.6 }); }   // 上の飾り
    for (const s of [-1, 1]) {
      const [px, pz] = P(s * 0.26, 0.285);
      this.bx('gate', px, y + 0.12, pz, 0.47, 0.03, 1.72, rot, { shade: 0.8 });   // 扉
      const [kx, kz] = P(s * 0.05, 0.31);
      this.bx('wood', kx, y + 0.95, kz, 0.04, 0.04, 0.12, rot, { shade: 0.35 });  // 取っ手
    }
    { const [px, pz] = P(0, 0); this.solid(px, pz, 0.5, y); }
    { const [px, pz] = P(0, 0.05); this.hide('wardrobe', px, pz, y, rot); }
  }
  /** 机（1.4 × 0.8）と腰掛け 2 つ */
  table(x, z, y, rnd) {
    const rot = rnd.next() < 0.5 ? 0 : 90;
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    { const [px, pz] = P(0, 0); this.bx('wood', px, y + 0.72, pz, 1.4, 0.8, 0.06, rot); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [px, pz] = P(sx * 0.62, sz * 0.32); this.bx('wood', px, y, pz, 0.08, 0.08, 0.72, rot, { shade: 0.8 }); }
    for (const s of [-1, 1]) {
      const [px, pz] = P(s * 0.3, s * 0.68);
      this.bx('wood', px, y + 0.42, pz, 0.36, 0.36, 0.05, rot);
      for (const a of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [lx, lz] = P(s * 0.3 + a[0] * 0.13, s * 0.68 + a[1] * 0.13); this.bx('wood', lx, y, lz, 0.05, 0.05, 0.42, rot, { shade: 0.8 }); }
      this.solid(px, pz, 0.25, y);
    }
    for (const dx of [-0.4, 0.4]) { const [px, pz] = P(dx, 0); this.solid(px, pz, 0.45, y); }
  }
  /** 長持（ふた付きの箱） */
  chest(x, z, y, rot) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    { const [px, pz] = P(0, 0); this.bx('wood', px, y, pz, 0.95, 0.52, 0.5, rot, { shade: 0.85 }); }
    { const [px, pz] = P(0, 0); this.bx('wood', px, y + 0.5, pz, 1.0, 0.56, 0.06, rot, { shade: 0.65 }); }
    for (const dx of [-0.3, 0.3]) { const [px, pz] = P(dx, 0); this.bx('stone', px, y + 0.02, pz, 0.06, 0.58, 0.52, rot, { shade: 0.35 }); }   // 鉄の帯
    { const [px, pz] = P(0, 0); this.solid(px, pz, 0.45, y); }
  }
  /** 棚（壁に付いた板 2 枚と、上の壺や袋） */
  shelf(x, z, y, rot) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    for (const dy of [0, 0.45]) { const [px, pz] = P(0, 0.12); this.bx('wood', px, y + dy, pz, 1.2, 0.26, 0.04, rot); }
    // 素焼きの壺（胴と口）
    for (const [dx, hh] of [[-0.35, 0.24], [0.05, 0.18], [0.4, 0.28]]) {
      const [px, pz] = P(dx, 0.12);
      this.bx('cloth', px, y + 0.04, pz, 0.17, 0.17, hh, rot + 45, { shade: [0.62, 0.36, 0.22] });
      this.bx('cloth', px, y + 0.04 + hh, pz, 0.1, 0.1, 0.05, rot + 45, { shade: [0.5, 0.29, 0.18] });
    }
  }
  /** 袋（穀物の袋）を 2〜3 個 */
  sacks(x, z, y, rnd) {
    const n = 2 + Math.floor(rnd.next() * 2);
    for (let i = 0; i < n; i++) {
      const dx = (i - (n - 1) / 2) * 0.42, h = 0.55 + rnd.next() * 0.15;
      this.bx('cloth', x + dx, y, z, 0.4, 0.36, h, rnd.next() * 30, { shade: [0.7, 0.6, 0.42] });
      this.bx('cloth', x + dx, y + h, z, 0.18, 0.16, 0.12, 0, { shade: [0.6, 0.5, 0.34] });
    }
    this.solid(x, z, 0.45, y);
  }
  /** 暖炉（石。中は暗い）と、屋根の上まで届く煙突。火を焚く口は rot の向きの前 */
  hearth(x, z, y, chimneyTop, rot = 0) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    this.bx('stone', x, y, z, 1.5, 0.62, 1.1, rot, { shade: 0.85 });
    { const [px, pz] = P(0, 0.06); this.bx('stone', px, y + 0.06, pz, 0.9, 0.55, 0.62, rot, { shade: 0.12 }); }   // 火を焚く所（煤けて暗い）
    { const [px, pz] = P(0, 0.02); this.bx('wood', px, y + 1.1, pz, 1.7, 0.75, 0.1, rot, { shade: 0.6 }); }       // 炉棚
    { const [px, pz] = P(0, -0.05); this.bx('stone', px, y + 1.2, pz, 0.9, 0.5, chimneyTop - (y + 1.2), rot, { shade: 0.85 }); }   // 煙突
    for (const dx of [-0.4, 0.4]) { const [px, pz] = P(dx, 0.1); this.solid(px, pz, 0.4, y); }
    { const [px, pz] = P(0, -0.05); this.solid(px, pz, 0.4, y + 2.9); }   // 二階を通る煙突
  }
}
