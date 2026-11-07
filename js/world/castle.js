// 村（南西の「村」のエリア）。長方形の木の柵で囲み、森の中央の側に入り口（屋根付きの門）がひとつ。
//   入り口からの表通りと横の通りが真ん中の広場（井戸）で交わり、通りに沿って家が並ぶ。
//   家は大きさがばらばらで、一階建てと二階建て。どの家にも入れる（家の作りは world/house-builder.js）
//   建物は箱・切妻屋根を組み合わせて作り、Poly Haven（CC0）の実写の質感を貼る。
// 質感ごとに 1 つの形にまとめて描く（描画命令は質感の数だけ）。質感の画像は、起動の後に裏で読み込んで貼る。
// 画像の貼り方は、面の向きと場所から決める（どの建物でも実物の大きさで繰り返す）
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { loadTextureSet } from './materials.js';
import { createRandom } from '../core/random.js';
import { SURFACES, builder, frame, box, obox, buildHouse } from './house-builder.js';
import { well, barrel, bench, hay, woodpile } from './village-props.js';

/**
 * 木の柵（杭と 2 本の横木）を a から b へ。杭の間は約 2.4m
 */
function fenceRun(B, terrain, a, b, solidLine, sight) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / 2.4));
  const yaw = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n, z = a[1] + ((b[1] - a[1]) * i) / n;
    box(B, 'wood', x, terrain.heightAt(x, z) - 0.2, z, 0.2, 0.2, 1.65, yaw + ((i * 37) % 11) - 5);
    sight?.addCyl(x, z, 0.11, terrain.heightAt(x, z) - 0.2, terrain.heightAt(x, z) + 1.45);
  }
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, y = terrain.heightAt(mx, mz);
  for (const h of [0.45, 1.05]) { box(B, 'wood', mx, y + h, mz, 0.08, len, 0.13, yaw); sight?.addYawBox(mx, y + h, mz, 0.08, len, 0.13, yaw); }
  solidLine(a[0], a[1], b[0], b[1], 0.45);
}

/**
 * 村を作る（南西の「村」のエリア）。長方形の木の柵で囲み、森の中央の側に入り口がひとつ
 * @param {object} zones エリア分け（zones.castle が村の場所）
 * @param {object} obstacles 当たり判定（柵や家を通れないように円を並べる）
 * @param {object} floors 歩ける床（world/floors.js。家の床と階段を登録する）
 */
export function createVillage(app, config, terrain, obstacles, zones, floors, sight = null) {
  const B = builder();
  const C = zones.castle;
  const footprints = [];   // 地図に描く形：{ type: 'rect', x, z, w, d, yaw } / { type: 'circle', x, z, r } / { type: 'line', pts }
  const rnd = createRandom(config.seed + 333);
  // 入り口は森の中央を向く
  const f = C.f, r = C.r;                            // 森の中央への向きと右（zones.js の長方形と同じ）
  const yawF = (Math.atan2(f[0], f[1]) * 180) / Math.PI;
  const at = (fx, rx) => [C.x + f[0] * fx + r[0] * rx, C.z + f[1] * fx + r[1] * rx];
  const solid = (x, z, rad, range) => obstacles.add(x, z, rad, true, range);
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
  for (let i = 0; i < pts.length - 1; i++) fenceRun(B, terrain, pts[i], pts[i + 1], solidLine, sight);
  footprints.push({ type: 'line', pts });
  // 入り口の門：太く高い門柱 2 本（高さ 5m）、上の横木（4.4m）と、わらぶきの小さな屋根
  const gL = pts[pts.length - 1], gR = pts[0];
  for (const p of [gL, gR]) {
    const gy0 = terrain.heightAt(p[0], p[1]);
    box(B, 'wood', p[0], gy0 - 0.3, p[1], 0.42, 0.42, 5.0, yawF); solid(p[0], p[1], 0.5);
    sight?.addCyl(p[0], p[1], 0.4, gy0 - 0.3, gy0 + 4.7);
  }
  { const mx = (gL[0] + gR[0]) / 2, mz = (gL[1] + gR[1]) / 2, len = Math.hypot(gR[0] - gL[0], gR[1] - gL[1]);
    const gy = terrain.heightAt(mx, mz);
    box(B, 'wood', mx, gy + 4.35, mz, len + 1.2, 0.34, 0.3, yawF);
    box(B, 'wood', mx, gy + 3.85, mz, len - 0.2, 0.2, 0.18, yawF);
    for (const s of [-1, 1]) { const q = [mx + r[0] * s * (len / 2 - 0.5), mz + r[1] * s * (len / 2 - 0.5)]; box(B, 'wood', q[0], gy + 3.6, q[1], 0.14, 0.14, 0.75, yawF + s * 40); }   // 方杖
    const G = frame(mx, gy, mz, yawF), hw = len / 2 + 1.0;   // x は門の幅の向き、z は門をくぐる向き
    const R = (x, y, z) => G.at(x, y, z);
    // わらぶきの屋根（厚み付き）と太い棟
    for (const s of [-1, 1]) {
      const a = G.dir(0, -0.9, s * 0.86), nn = G.dir(0, 0.69, s * 0.72), al = Math.hypot(0.9, 0.86);
      const c = R(0, 5.0, s * 0.43);
      obox(B, 'thatch', [c[0] + nn[0] * 0.1, c[1] + nn[1] * 0.1, c[2] + nn[2] * 0.1], G.dir(1, 0, 0), [a[0] / al, a[1] / al, a[2] / al], nn, hw * 2, Math.hypot(0.85, 0.9) + 0.1, 0.22, 1);
    }
    { const q = R(0, 5.64, 0), Q = Math.SQRT1_2; obox(B, 'thatch', q, G.dir(1, 0, 0), G.dir(0, Q, Q), G.dir(0, Q, -Q), hw * 2 + 0.1, 0.34, 0.34, 0.8); }
    // 門柱の根元の石と、鉄の帯
    for (const p of [gL, gR]) {
      const y = terrain.heightAt(p[0], p[1]);
      box(B, 'stone', p[0], y - 0.3, p[1], 0.78, 0.78, 0.75, yawF, { shade: 0.95, grad: [0.75, 1] });
      box(B, 'stone', p[0], y + 0.45, p[1], 0.86, 0.86, 0.1, yawF, { shade: 1.1, bottom: true });
      for (const hh of [1.2, 3.2]) box(B, 'cloth', p[0], y + hh, p[1], 0.45, 0.45, 0.08, yawF, { shade: [0.11, 0.1, 0.095] });
    }
  }

  // ---- 家：入り口からまっすぐ奥へ向かう表通りと、真ん中で交わる横の通り。横の通りの両側に家を並べ、
  //      奥と入り口の側にもう一列ずつ。扉は通りの側へ向ける。幅・奥行き・階の数・屋根・壁の色は家ごとに違う ----
  const houses = [];
  const hides = [];   // 隠れ場所（ベッドの下・タンスの中）
  const covers = [];  // 壁裏隠れの線（家の外の壁と中の壁。game/cover.js）
  const reg = { floors, solid, hides, sight, covers };
  // 列：front は扉のある面の位置（表通りからの前後 fx）、face は扉の向き（+1 は入り口側、-1 は奥側）、from は表通りから空ける幅
  const rows = [
    { front: 4.6, face: -1, from: 6.0, maxD: 8.6 },    // 横の通りの入り口側（扉は奥へ向く）
    { front: -4.6, face: 1, from: 6.0, maxD: 8.6 },    // 横の通りの奥側（扉は入り口へ向く）
    { front: -17.4, face: 1, from: 2.5, maxD: 8.6 },   // 奥の列
    { front: 17.4, face: -1, from: 9.0, maxD: 8.6 },   // 入り口の側の列
  ];
  const walls = [1, [1, 0.94, 0.84], [0.98, 0.9, 0.86], [0.92, 0.92, 0.9], [1, 0.97, 0.88]];   // しっくいの色（白・黄土・薄紅・灰・生成り）
  let i = 0;
  // 家の周りの小物（樽・長椅子・薪の山・干し草）。家の並びを変えないよう、別の乱数で選ぶ
  const rndProp = createRandom(config.seed + 335);
  function houseProps(x, y0, z, yaw, w, d) {
    const F = frame(x, y0, z, yaw);
    const ps = rndProp.next() < 0.5 ? -1 : 1;   // 扉のどちら側に置くか
    const put = (lx, lz, r) => { const q = F.at(lx, 0, lz); solid(q[0], q[2], r); return q; };
    const k = rndProp.next();
    if (k < 0.4) {
      // 扉の横に樽 1〜2 つ
      const q = put(ps * (w / 2 - 0.45), d / 2 + 0.55, 0.36);
      const by = terrain.heightAt(q[0], q[2]);
      barrel(B, q[0], by - 0.02, q[2]); sight?.addCyl(q[0], q[2], 0.32, by - 0.02, by + 0.84);
      if (rndProp.next() < 0.5) {
        const q2 = put(ps * (w / 2 - 1.1), d / 2 + 0.5, 0.33), by2 = terrain.heightAt(q2[0], q2[2]);
        barrel(B, q2[0], by2 - 0.02, q2[2], 0.27, 0.74); sight?.addCyl(q2[0], q2[2], 0.28, by2 - 0.02, by2 + 0.72);
      }
    } else if (k < 0.75 && w >= 5.4) {
      // 壁に沿った長椅子
      const lx = ps * (w / 2 - 1.15);
      for (const dx of [-0.45, 0.45]) put(lx + dx, d / 2 + 0.42, 0.28);
      const q = F.at(lx, 0, d / 2 + 0.42);
      bench(B, frame(q[0], terrain.heightAt(q[0], q[2]), q[2], yaw), yaw, 0, 0);
    }
    // 横の壁に薪の山（屋根付き）
    if (rndProp.next() < 0.45) {
      const ss = rndProp.next() < 0.5 ? -1 : 1, z0 = -d / 2 + 0.6, z1 = Math.min(d / 2 - 1.0, z0 + 1.6 + rndProp.next() * 0.8);
      for (let lz = z0 + 0.3; lz <= z1 - 0.2; lz += 0.55) put(ss * (w / 2 + 0.6), lz, 0.42);
      const gp = F.at(ss * (w / 2 + 0.5), 0, (z0 + z1) / 2);
      const wy = terrain.heightAt(gp[0], gp[2]);
      woodpile(B, frame(x, wy, z, yaw), yaw, ss, w / 2, z0, z1, rndProp);
      { const c = F.at(ss * (w / 2 + 0.5), 0, (z0 + z1) / 2); sight?.addYawBox(c[0], wy, c[2], 0.6, z1 - z0, 0.68, yaw); }
    }
    // 裏に干し草
    if (rndProp.next() < 0.3) {
      const lx = (rndProp.next() - 0.5) * (w - 2.4);
      put(lx, -d / 2 - 0.85, 0.6);
      const q = F.at(lx, 0, -d / 2 - 0.85);
      hay(B, frame(q[0], terrain.heightAt(q[0], q[2]) - 0.03, q[2], yaw), yaw, 0, 0, rndProp);
      sight?.addYawBox(q[0], terrain.heightAt(q[0], q[2]) - 0.03, q[2], 1.6, 0.5, 0.46, yaw);
    }
  }
  for (const row of rows) for (const side of [-1, 1]) {
    let s = row.from;
    for (;;) {
      const two = rnd.next() < 0.45;
      const w = two ? 6 + rnd.next() * 2.2 : 5 + rnd.next() * 2.4;
      const d = Math.min(row.maxD, two ? 7.2 + rnd.next() * 1.4 : 5.8 + rnd.next() * 1.8);
      if (s + w > FR - 1.2) break;
      const rx = side * (s + w / 2);
      const fx = row.front - row.face * (d / 2);   // 家の真ん中（扉の面から奥行きの半分だけ奥）
      const [x, z] = at(fx, rx);
      const yaw = yawF + (row.face > 0 ? 0 : 180) + (rnd.next() - 0.5) * 3;
      const roof = rnd.next() < 0.55 ? 'thatch' : 'tiles';
      const y0 = terrain.heightAt(x, z);
      buildHouse(B, { cx: x, cz: z, y0, yaw, w, d, stories: two ? 2 : 1, roof, wall: walls[i++ % walls.length], rnd, deco: createRandom(config.seed + 1000 + houses.length) }, reg);
      houses.push({ x, z, w, d, yaw, stories: two ? 2 : 1 });
      footprints.push({ type: 'rect', x, z, w, d, yaw, roof });
      houseProps(x, y0, z, yaw, w, d);
      s += w + 2.0 + rnd.next() * 2.6;
    }
  }
  /** 家の中か（家の中の音の響き・bot の判断に使う） */
  const insideHouse = (x, z) => houses.some((hh) => {
    const a = (hh.yaw * Math.PI) / 180, dx = x - hh.x, dz = z - hh.z;
    const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
    return Math.abs(lx) < hh.w / 2 + 0.5 && Math.abs(lz) < hh.d / 2 + 0.5;
  });
  // 広場（石畳）と井戸
  { const [x, z] = at(0, 0); const y = terrain.heightAt(x, z) + 0.04;
    const s = 6;
    const P = (a, b) => [x + f[0] * a + r[0] * b, y, z + f[1] * a + r[1] * b];
    B.quad('cobble', P(s, -s), P(s, s), P(-s, s), P(-s, -s), [0, 1, 0]);
    const [wx, wz] = at(-1.5, 2);
    well(B, wx, terrain.heightAt(wx, wz), wz);
    solid(wx, wz, 1.3);
    sight?.addCyl(wx, wz, 1.15, terrain.heightAt(wx, wz) - 0.2, terrain.heightAt(wx, wz) + 0.85);
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
    if (!SURFACES[surf].id) continue;   // 画像のない質感（布団・袋の布）は色だけ
    loadTextureSet(app.graphicsDevice, SURFACES[surf].id, config.quality).then((t) => {
      if (!t) return;
      m.diffuseMap = t.diffuse;
      m.normalMap = t.normal;
      m.aoMap = t.arm; m.aoMapChannel = 'r';
      m.glossMap = t.arm; m.glossMapChannel = 'g'; m.glossInvert = true; m.gloss = 1;
      m.update();
    });
  }
  return { houses, triangles: tris, footprints, hides, covers, insideHouse };
}
