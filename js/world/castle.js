// 城と村（南西の「城と村」のエリア）。建物は箱・円柱・切妻屋根を組み合わせて作り、Poly Haven（CC0）の実写の質感を貼る。
//   城：四角い城壁（高さ 8m、上に凸凹の胸壁）、四隅の丸い塔、門（村の側）と門の両脇の塔、奥に天守（四角い高い塔）、中庭は石畳
//   村：城の門から森の中央へ向かう道の両側に家（石の土台・しっくいの壁・木の骨組み・わら / 瓦の屋根）、井戸、石畳の広場
// 質感ごとに 1 つの形にまとめて描く（描画命令は質感の数だけ）。質感の画像は、起動の後に裏で読み込んで貼る。
// 画像の貼り方は、面の向きと場所から決める（どの建物でも実物の大きさで繰り返す）
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { loadTextureSet } from './materials.js';
import { createRandom } from '../core/random.js';

// 質感：id（assets/textures/ の名前）、tile（画像 1 枚が表す大きさ m）、color（画像が読めるまでの色・画像に掛ける色）
const SURFACES = {
  stone:  { id: 'castle_wall_slates', tile: 3.0, color: [0.9, 0.88, 0.84] },
  plaster:{ id: 'white_plaster_rough_01', tile: 2.5, color: [1.0, 0.97, 0.9] },
  wood:   { id: 'weathered_brown_planks', tile: 1.6, color: [0.8, 0.72, 0.64] },
  thatch: { id: 'thatch_roof_angled', tile: 2.0, color: [0.95, 0.9, 0.8] },
  tiles:  { id: 'clay_roof_tiles', tile: 2.0, color: [0.95, 0.9, 0.88] },
  cobble: { id: 'cobblestone_floor_04', tile: 2.5, color: [0.85, 0.85, 0.82] },
  gate:   { id: 'wooden_gate', tile: 4.0, color: [0.85, 0.8, 0.75] },
};

/** 形を貯めていく入れ物（質感ごと） */
function builder() {
  const parts = {};
  for (const k of Object.keys(SURFACES)) parts[k] = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  /** 四角い面を 1 枚足す（p0〜p3 は反時計回り、n は外向き） */
  function quad(surf, p0, p1, p2, p3, n, shade = 1) {
    const g = parts[surf], tile = SURFACES[surf].tile, c = SURFACES[surf].color;
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
      g.colors.push(c[0] * shade, c[1] * shade, c[2] * shade, 1);
    }
    g.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  /** 斜めの面（屋根）：画像の縦を、坂に沿わせる */
  function slope(surf, p0, p1, p2, p3, n) {
    const g = parts[surf], tile = SURFACES[surf].tile, c = SURFACES[surf].color;
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
  return { parts, quad, slope };
}

/** 向き（ヨー角）で回した座標系：原点 o、前 f（地面の上の単位ベクトル）、右 r */
function frame(ox, oy, oz, yawDeg) {
  const a = (yawDeg * Math.PI) / 180;
  const f = [Math.sin(a), 0, Math.cos(a)], r = [Math.cos(a), 0, -Math.sin(a)];
  return {
    at: (x, y, z) => [ox + r[0] * x + f[0] * z, oy + y, oz + r[2] * x + f[2] * z],
    dir: (x, y, z) => [r[0] * x + f[0] * z, y, r[2] * x + f[2] * z],
  };
}

/** 箱（中心 cx,cz、底の高さ y0、幅 w（横）・奥行き d・高さ h、向き yaw） */
function box(B, surf, cx, y0, cz, w, d, h, yaw, { top = true, bottom = false, shade = 1 } = {}) {
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

/** 円柱の塔（中心、半径、底、高さ、面の数）。上に胸壁（凸凹）を付ける */
function tower(B, cx, y0, cz, r, h, sides = 14) {
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
    const am = (a0 + a1) / 2, n = [Math.cos(am), 0, Math.sin(am)];
    // 円柱の横の面は、一周に沿って画像を貼る（quad は向きで軸を選ぶので、ここは自分で UV を作る）
    const g = B.parts.stone, tile = SURFACES.stone.tile, c = SURFACES.stone.color, b = g.positions.length / 3;
    const u0 = (a0 * r) / tile, u1 = (a1 * r) / tile;
    const pts = [[...p0], [...p1], [p1[0], y0 + h, p1[2]], [p0[0], y0 + h, p0[2]]];
    const uv = [[u0, 0], [u1, 0], [u1, -h / tile], [u0, -h / tile]];
    pts.forEach((p, k) => { g.positions.push(...p); g.normals.push(...n); g.uvs.push(...uv[k]); g.colors.push(c[0], c[1], c[2], 1); });
    g.indices.push(b, b + 2, b + 1, b, b + 3, b + 2);
    // 胸壁：一つおきに小さな石の箱
    if (i % 2 === 0) box(B, 'stone', cx + Math.cos(am) * (r - 0.4), y0 + h, cz + Math.sin(am) * (r - 0.4), 1.0, 0.8, 1.0, (-am * 180) / Math.PI + 90);
  }
  // 屋上（床）
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
    const g = B.parts.stone, tile = SURFACES.stone.tile, c = SURFACES.stone.color, b = g.positions.length / 3;
    const pts = [[cx, y0 + h, cz], [cx + Math.cos(a1) * r, y0 + h, cz + Math.sin(a1) * r], [cx + Math.cos(a0) * r, y0 + h, cz + Math.sin(a0) * r]];
    pts.forEach((p) => { g.positions.push(...p); g.normals.push(0, 1, 0); g.uvs.push(p[0] / tile, p[2] / tile); g.colors.push(c[0], c[1], c[2], 1); });
    g.indices.push(b, b + 1, b + 2);
  }
}

/** 城壁（a から b へ。厚さ t、高さ h）。上に胸壁 */
function wall(B, ax, az, bx, bz, y0, t, h, footprints) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
  const cx = (ax + bx) / 2, cz = (az + bz) / 2;
  footprints?.push({ type: 'rect', x: cx, z: cz, w: t, d: len, yaw });
  box(B, 'stone', cx, y0, cz, t, len, h, yaw);
  // 胸壁：外側の縁に、1m の石を 2m おきに
  const n = Math.floor(len / 2);
  const F = frame(cx, y0, cz, yaw);
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + 1 + i * 2;
    for (const side of [-1, 1]) {
      const p = F.at(side * (t / 2 - 0.3), 0, z);
      box(B, 'stone', p[0], y0 + h, p[2], 0.6, 1.0, 1.0, yaw);
    }
  }
}

/** 家：石の土台、しっくいの壁、木の骨組み（柱と梁）、切妻屋根、扉 */
function house(B, cx, y0, cz, yaw, w, d, h, roof) {
  const F = frame(cx, y0, cz, yaw);
  box(B, 'stone', cx, y0 - 0.5, cz, w + 0.3, d + 0.3, 1.3, yaw);                 // 石の土台（少し埋める）
  box(B, 'plaster', cx, y0 + 0.8, cz, w, d, h - 0.8, yaw, { top: false });       // しっくいの壁
  // 骨組み：四隅の柱、上と中ほどの梁、前と後ろの斜めの筋交い
  const beam = (x, z, bw, bd, bh, by) => { const p = F.at(x, 0, z); box(B, 'wood', p[0], y0 + by, p[2], bw, bd, bh, yaw); };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(sx * (w / 2), sz * (d / 2), 0.28, 0.28, h - 0.8, 0.8);
  for (const sz of [-1, 1]) { beam(0, sz * (d / 2 + 0.02), w + 0.2, 0.18, 0.22, h - 0.1); beam(0, sz * (d / 2 + 0.02), w, 0.16, 0.2, 0.8 + (h - 0.8) * 0.5); }
  for (const sx of [-1, 1]) { beam(sx * (w / 2 + 0.02), 0, 0.18, d + 0.2, 0.22, h - 0.1); beam(sx * (w / 2 + 0.02), 0, 0.16, d, 0.2, 0.8 + (h - 0.8) * 0.5); }
  // 扉（前の真ん中）
  { const p = F.at(0, 0, d / 2 + 0.03); box(B, 'gate', p[0], y0 + 0.8, p[2], 1.2, 0.08, 2.1, yaw); }
  // 切妻屋根：棟は奥行きの向き。軒を出す
  const over = 0.6, rh = w * 0.45;
  const L = (x, y, z) => F.at(x, h + y, z);
  const ridgeF = L(0, rh, d / 2 + over), ridgeB = L(0, rh, -d / 2 - over);
  for (const sx of [-1, 1]) {
    const eF = L(sx * (w / 2 + over), -over * 0.45, d / 2 + over), eB = L(sx * (w / 2 + over), -over * 0.45, -d / 2 - over);
    const ny = (w / 2 + over), nn = Math.hypot(ny, rh);
    const nrm = F.dir(sx * rh / nn, ny / nn, 0);
    if (sx > 0) B.slope(roof, eB, eF, ridgeF, ridgeB, nrm);
    else B.slope(roof, eF, eB, ridgeB, ridgeF, nrm);
  }
  // 妻壁（三角の部分）：しっくい
  for (const sz of [-1, 1]) {
    const g = B.parts.plaster, tile = SURFACES.plaster.tile, c = SURFACES.plaster.color, b = g.positions.length / 3;
    const pts = [F.at(-w / 2, h, sz * d / 2), F.at(w / 2, h, sz * d / 2), F.at(0, h + rh, sz * d / 2)];
    const n = F.dir(0, 0, sz);
    pts.forEach((p) => { g.positions.push(...p); g.normals.push(...n); g.uvs.push((p[0] + p[2]) / tile, -p[1] / tile); g.colors.push(c[0], c[1], c[2], 1); });
    if (sz > 0) g.indices.push(b, b + 1, b + 2); else g.indices.push(b, b + 2, b + 1);
  }
}

/** 井戸：石の丸い縁と、木の柱と小さな屋根 */
function well(B, cx, y0, cz) {
  const sides = 12;
  for (let i = 0; i < sides; i++) {
    const a = ((i + 0.5) / sides) * Math.PI * 2;
    box(B, 'stone', cx + Math.cos(a) * 0.9, y0, cz + Math.sin(a) * 0.9, 0.5, 0.55, 0.85, (-a * 180) / Math.PI);
  }
  for (const s of [-1, 1]) box(B, 'wood', cx + s * 0.95, y0, cz, 0.16, 0.16, 2.2, 0);
  box(B, 'wood', cx, y0 + 2.1, cz, 2.3, 0.14, 0.14, 0);
  B.slope('thatch', [cx - 1.3, y0 + 2.0, cz + 0.9], [cx + 1.3, y0 + 2.0, cz + 0.9], [cx + 1.3, y0 + 2.6, cz], [cx - 1.3, y0 + 2.6, cz], [0, 0.83, 0.55]);
  B.slope('thatch', [cx + 1.3, y0 + 2.0, cz - 0.9], [cx - 1.3, y0 + 2.0, cz - 0.9], [cx - 1.3, y0 + 2.6, cz], [cx + 1.3, y0 + 2.6, cz], [0, 0.83, -0.55]);
}

/**
 * 城と村を作る
 * @param {object} zones エリア分け（zones.castle が城と村の場所）
 * @param {object} obstacles 当たり判定（壁や家を通れないように円を並べる）
 */
export function createCastleVillage(app, config, terrain, obstacles, zones) {
  const B = builder();
  const C = zones.castle;
  const footprints = [];   // 地図に描く形：{ type: 'rect', x, z, w, d, yaw } / { type: 'circle', x, z, r }
  const rnd = createRandom(config.seed + 333);
  // 村と門は森の中央を向く。城はエリアの奥（中央から遠い側）に
  const fl = Math.hypot(C.x, C.z) || 1;
  const f = [-C.x / fl, -C.z / fl];                 // 森の中央への向き
  const r = [f[1], -f[0]];                           // 右
  const yawF = (Math.atan2(f[0], f[1]) * 180) / Math.PI;
  const at = (fx, rx) => [C.x + f[0] * fx + r[0] * rx, C.z + f[1] * fx + r[1] * rx];
  const g0 = terrain.heightAt(C.x, C.z);
  const solid = (x, z, rad) => obstacles.add(x, z, rad, true);
  /** 線に沿って当たり判定の円を並べる（壁） */
  const solidLine = (ax, az, bx, bz, rad) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (rad * 0.9));
    for (let i = 0; i <= n; i++) solid(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, rad);
  };

  // ---- 城 ----
  const K = at(-16, 0);                              // 城の中心（エリアの中心より奥）
  const half = 15, wallH = 8, wallT = 2.4, gateW = 6;
  const corner = (sf, sr) => [K[0] + f[0] * sf * half + r[0] * sr * half, K[1] + f[1] * sf * half + r[1] * sr * half];
  const FL = corner(1, -1), FR = corner(1, 1), BL = corner(-1, -1), BR = corner(-1, 1);
  // 前の壁は門で 2 つに分ける
  const gateL = [K[0] + f[0] * half - r[0] * gateW / 2, K[1] + f[1] * half - r[1] * gateW / 2];
  const gateR = [K[0] + f[0] * half + r[0] * gateW / 2, K[1] + f[1] * half + r[1] * gateW / 2];
  for (const [a, b] of [[FL, gateL], [gateR, FR], [FR, BR], [BR, BL], [BL, FL]]) {
    wall(B, a[0], a[1], b[0], b[1], g0 - 0.3, wallT, wallH + 0.3, footprints);
  }
  // 当たり判定：門の前の壁は、門の端から円の半径ぶん離して止める（門を通れるように）
  const inset = (p, q, k) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]); return [p[0] + ((q[0] - p[0]) / l) * k, p[1] + ((q[1] - p[1]) / l) * k]; };
  for (const [a, b] of [[FL, inset(gateL, FL, 1.4)], [inset(gateR, FR, 1.4), FR], [FR, BR], [BR, BL], [BL, FL]]) solidLine(a[0], a[1], b[0], b[1], 1.4);
  // 門の上の渡り（通れる高さを空けて、上だけ）
  { const m = [(gateL[0] + gateR[0]) / 2, (gateL[1] + gateR[1]) / 2];
    box(B, 'stone', m[0], g0 + 5.0, m[1], gateW + 0.4, wallT, wallH - 5.0, yawF + 90);
    // 開いた扉：両側の扉板を、門の内側で壁に沿わせる
    for (const side of [-1, 1]) {
      const q = [m[0] - f[0] * (wallT / 2 + 0.2) + r[0] * side * (gateW / 2 + 1.4), m[1] - f[1] * (wallT / 2 + 0.2) + r[1] * side * (gateW / 2 + 1.4)];
      box(B, 'gate', q[0], g0, q[1], 2.8, 0.2, 4.6, yawF + 90);
    }
  }
  // 四隅の塔と、門の両脇の塔
  for (const p of [FL, FR, BL, BR]) { tower(B, p[0], g0 - 0.3, p[1], 3.2, 12.3); solid(p[0], p[1], 3.4); footprints.push({ type: 'circle', x: p[0], z: p[1], r: 3.2 }); }
  // 門の両脇の塔：門の口をふさがないよう、口の外側に立てる
  for (const side of [-1, 1]) {
    const p = [K[0] + f[0] * (half + 0.6) + r[0] * side * (gateW / 2 + 2.3), K[1] + f[1] * (half + 0.6) + r[1] * side * (gateW / 2 + 2.3)];
    tower(B, p[0], g0 - 0.3, p[1], 2.2, 10.3, 10); solid(p[0], p[1], 2.4);
    footprints.push({ type: 'circle', x: p[0], z: p[1], r: 2.2 });
  }
  // 天守：奥の四角い高い塔
  { const p = at(-24, 0);
    box(B, 'stone', p[0], g0 - 0.3, p[1], 11, 11, 17, yawF);
    footprints.push({ type: 'rect', x: p[0], z: p[1], w: 11, d: 11, yaw: yawF });
    const F = frame(p[0], g0 + 16.7, p[1], yawF);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
      const a = F.at(-4.4 + i * 2.2, 0, s * 5.2), b = F.at(s * 5.2, 0, -4.4 + i * 2.2);
      box(B, 'stone', a[0], g0 + 16.7, a[2], 1.0, 0.7, 1.1, yawF);
      box(B, 'stone', b[0], g0 + 16.7, b[2], 0.7, 1.0, 1.1, yawF);
    }
    for (let x = -4.5; x <= 4.5; x += 1.5) for (let z = -4.5; z <= 4.5; z += 1.5) {
      const q = F.at(x, 0, z); solid(q[0], q[2], 1.0);
    }
  }
  // 中庭の石畳
  { const g = B.parts.cobble; const y = g0 + 0.04;
    const P = (sf, sr) => [K[0] + f[0] * sf + r[0] * sr, y, K[1] + f[1] * sf + r[1] * sr];
    B.quad('cobble', P(half, -half), P(half, half), P(-half, half), P(-half, -half), [0, 1, 0]);
    void g;
  }

  // ---- 村：門から森の中央へ向かう道の両側 ----
  const houses = [];
  const roofs = ['thatch', 'tiles'];
  for (let i = 0; i < 5; i++) {
    for (const side of [-1, 1]) {
      const fx = 8 + i * 8.5 + (rnd.next() - 0.5) * 2;
      const rx = side * (9 + rnd.next() * 3);
      if (Math.hypot(...at(fx, rx)) > config.world.playRadius - 8) continue;
      const w = 5 + rnd.next() * 1.5, d = 6.5 + rnd.next() * 2, h = 3.6 + rnd.next() * 0.8;
      const [x, z] = at(fx, rx);
      // 家の正面（扉）を道へ向ける
      const yaw = yawF + (side > 0 ? -90 : 90) + (rnd.next() - 0.5) * 10;
      const y = terrain.heightAt(x, z);
      house(B, x, y, z, yaw, w, d, h, roofs[(i + (side > 0 ? 1 : 0)) % 2]);
      houses.push({ x, z, w, d, yaw });
      footprints.push({ type: 'rect', x, z, w, d, yaw, roof: roofs[(i + (side > 0 ? 1 : 0)) % 2] });
      // 当たり判定：家の床を覆うように円を並べる
      const F = frame(x, 0, z, yaw);
      for (let a = -w / 2 + 0.8; a <= w / 2 - 0.7; a += 1.4) for (let b = -d / 2 + 0.8; b <= d / 2 - 0.7; b += 1.4) {
        const q = F.at(a, 0, b); solid(q[0], q[2], 1.0);
      }
    }
  }
  // 村の広場（石畳）と井戸
  { const [x, z] = at(24, 0); const y = terrain.heightAt(x, z) + 0.04;
    const s = 6.5;
    const P = (a, b) => [x + f[0] * a + r[0] * b, y, z + f[1] * a + r[1] * b];
    B.quad('cobble', P(s, -s), P(s, s), P(-s, s), P(-s, -s), [0, 1, 0]);
    const [wx, wz] = at(24, 3.5);
    well(B, wx, terrain.heightAt(wx, wz), wz);
    solid(wx, wz, 1.3);
  }

  // ---- 形にして描く（質感ごとに 1 つ） ----
  const materials = {};
  let tris = 0;
  for (const [surf, g] of Object.entries(B.parts)) {
    if (!g.indices.length) continue;
    const mesh = createMesh(app.graphicsDevice, g);
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color(1, 1, 1);
    m.diffuseVertexColor = true;
    m.vertexColorGamma = true;
    m.useMetalness = true;
    m.metalness = 0;
    m.gloss = 0.25;
    m.cull = pc.CULLFACE_NONE;   // 屋根は下からも見え、壁は両側から見えるので両面を描く
    m.update();
    materials[surf] = m;
    const e = new pc.Entity(`castle-${surf}`);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, m)], castShadows: true, receiveShadows: true });
    app.root.addChild(e);
    tris += g.indices.length / 3;
  }
  sceneBudget.triangles += tris;

  // 質感の画像は裏で読み込み、届いたら貼る（それまでは色だけ）
  for (const [surf, m] of Object.entries(materials)) {
    loadTextureSet(app.graphicsDevice, SURFACES[surf].id, config.quality).then((t) => {
      if (!t) return;
      m.diffuseMap = t.diffuse;
      m.normalMap = t.normal;
      m.aoMap = t.arm; m.aoMapChannel = 'r';
      m.glossMap = t.arm; m.glossMapChannel = 'g'; m.glossInvert = true; m.gloss = 1;
      m.update();
    });
  }
  return { houses, castle: { x: K[0], z: K[1], half }, triangles: tris, footprints };
}
