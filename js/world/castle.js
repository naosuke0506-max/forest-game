// 村（南西の「村」のエリア）。長方形の木の柵で囲み、森の中央の側に入り口がひとつ。
//   入り口からの表通りと横の通りが真ん中の広場（井戸）で交わり、通りに沿って家（石の土台・しっくいの壁・木の骨組み・わら / 瓦の屋根）が並ぶ
//   建物は箱・切妻屋根を組み合わせて作り、Poly Haven（CC0）の実写の質感を貼る。
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
 * 木の柵（杭と 2 本の横木）を a から b へ。杭の間は約 2.4m
 */
function fenceRun(B, terrain, a, b, solidLine) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / 2.4));
  const yaw = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n, z = a[1] + ((b[1] - a[1]) * i) / n;
    box(B, 'wood', x, terrain.heightAt(x, z) - 0.2, z, 0.2, 0.2, 1.65, yaw + ((i * 37) % 11) - 5);
  }
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, y = terrain.heightAt(mx, mz);
  for (const h of [0.45, 1.05]) box(B, 'wood', mx, y + h, mz, 0.08, len, 0.13, yaw);
  solidLine(a[0], a[1], b[0], b[1], 0.45);
}

/**
 * 村を作る（南西の「村」のエリア）。長方形の木の柵で囲み、森の中央の側に入り口がひとつ
 * @param {object} zones エリア分け（zones.castle が村の場所）
 * @param {object} obstacles 当たり判定（柵や家を通れないように円を並べる）
 */
export function createVillage(app, config, terrain, obstacles, zones) {
  const B = builder();
  const C = zones.castle;
  const footprints = [];   // 地図に描く形：{ type: 'rect', x, z, w, d, yaw } / { type: 'circle', x, z, r } / { type: 'line', pts }
  const rnd = createRandom(config.seed + 333);
  // 入り口は森の中央を向く
  const f = C.f, r = C.r;                            // 森の中央への向きと右（zones.js の長方形と同じ）
  const yawF = (Math.atan2(f[0], f[1]) * 180) / Math.PI;
  const at = (fx, rx) => [C.x + f[0] * fx + r[0] * rx, C.z + f[1] * fx + r[1] * rx];
  const solid = (x, z, rad) => obstacles.add(x, z, rad, true);
  /** 線に沿って当たり判定の円を並べる */
  const solidLine = (ax, az, bx, bz, rad) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (rad * 0.9));
    for (let i = 0; i <= n; i++) solid(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, rad);
  };

  // ---- 柵：村を囲む長方形（奥行き 54m・横 84m）。森の中央の側の真ん中に入り口（幅 5m） ----
  const FF = C.halfF - 5, FR = C.halfR - 5, GATE_W = 5;
  const corners = [[FF, GATE_W / 2], [FF, FR], [-FF, FR], [-FF, -FR], [FF, -FR], [FF, -GATE_W / 2]];
  const pts = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const [a0, b0] = corners[i], [a1, b1] = corners[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(a1 - a0, b1 - b0) / 12));   // 12m ほどごとに区切り、地面に沿わせる
    for (let k = i ? 1 : 0; k <= n; k++) pts.push(at(a0 + ((a1 - a0) * k) / n, b0 + ((b1 - b0) * k) / n));
  }
  for (let i = 0; i < pts.length - 1; i++) fenceRun(B, terrain, pts[i], pts[i + 1], solidLine);
  footprints.push({ type: 'line', pts });
  // 入り口の門柱（太く高い 2 本）と、上の横木
  const gL = pts[pts.length - 1], gR = pts[0];
  for (const p of [gL, gR]) { box(B, 'wood', p[0], terrain.heightAt(p[0], p[1]) - 0.3, p[1], 0.36, 0.36, 3.4, yawF); solid(p[0], p[1], 0.5); }
  { const mx = (gL[0] + gR[0]) / 2, mz = (gL[1] + gR[1]) / 2, len = Math.hypot(gR[0] - gL[0], gR[1] - gL[1]);
    box(B, 'wood', mx, terrain.heightAt(mx, mz) + 2.8, mz, len + 0.8, 0.3, 0.28, yawF); }

  // ---- 家：入り口からまっすぐ奥へ向かう表通りと、真ん中で交わる横の通り。横の通りの両側に家を並べ、
  //      奥と入り口の側にもう一列ずつ。扉は通りの側へ向ける ----
  const houses = [];
  const roofs = ['thatch', 'tiles'];
  const rows = [
    { fx: 8, face: -1, rx: [-37, -28, -19, -10, 10, 19, 28, 37] },    // 横の通りの入り口側（扉は奥へ向く）
    { fx: -8, face: 1, rx: [-37, -28, -19, -10, 10, 19, 28, 37] },    // 横の通りの奥側（扉は入り口へ向く）
    { fx: -20, face: 1, rx: [-36, -24, -12, 12, 24, 36] },            // 奥の列
    { fx: 20, face: -1, rx: [-34, -22, 22, 34] },                      // 入り口の側の列
  ];
  let i = 0;
  // 箱を置く場所（家の扉の横。中身は game/pickups.js が決める）。家の並びを変えないよう、別の乱数で選ぶ
  const crateSpots = [];
  const rndCrate = createRandom(config.seed + 334);
  for (const row of rows) for (const rx0 of row.rx) {
    const w = 5 + rnd.next() * 1.5, d = 6 + rnd.next() * 1.5, h = 3.6 + rnd.next() * 0.8;
    const [x, z] = at(row.fx + (rnd.next() - 0.5) * 1.2, rx0 + (rnd.next() - 0.5) * 1.5);
    const yaw = yawF + (row.face > 0 ? 0 : 180) + (rnd.next() - 0.5) * 6;
    const roof = roofs[(i++ + (rnd.next() < 0.3 ? 1 : 0)) % 2];
    house(B, x, terrain.heightAt(x, z), z, yaw, w, d, h, roof);
    houses.push({ x, z, w, d, yaw });
    footprints.push({ type: 'rect', x, z, w, d, yaw, roof });
    const F = frame(x, 0, z, yaw);
    for (let a = -w / 2 + 0.8; a <= w / 2 - 0.7; a += 1.4) for (let b = -d / 2 + 0.8; b <= d / 2 - 0.7; b += 1.4) {
      const q = F.at(a, 0, b); solid(q[0], q[2], 1.0);
    }
    if (rndCrate.next() < 0.55) {
      const side = rndCrate.next() < 0.5 ? -1 : 1;
      const q = F.at(side * (w / 2 - 0.6), 0, d / 2 + 0.95);
      crateSpots.push({ x: q[0], z: q[2], yaw: yaw + (rndCrate.next() - 0.5) * 30 });
      solid(q[0], q[2], 0.45);
    }
  }
  // 広場（石畳）と井戸
  { const [x, z] = at(0, 0); const y = terrain.heightAt(x, z) + 0.04;
    const s = 6;
    const P = (a, b) => [x + f[0] * a + r[0] * b, y, z + f[1] * a + r[1] * b];
    B.quad('cobble', P(s, -s), P(s, s), P(-s, s), P(-s, -s), [0, 1, 0]);
    const [wx, wz] = at(-1.5, 2);
    well(B, wx, terrain.heightAt(wx, wz), wz);
    solid(wx, wz, 1.3);
    footprints.push({ type: 'circle', x: wx, z: wz, r: 1.1 });
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
    const e = new pc.Entity(`village-${surf}`);
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
  return { houses, triangles: tris, footprints, crateSpots };
}
