// 洞窟（風穴）の形：通り道の壁と天井（岩の筒）・床・口のまわりの岩の縁。形と通り道は world/cave-shape.js（world/landform.js の cave）。
// 利用者の指示（2026-11-14）：「抜けられる洞窟ひとつ。口は二つだが、中には別れ道があり、行き止まりもある」
//   中は奥ほど暗い（頂点の色。main.js が中にいる間は光も弱くする）。分かれ道は、ほかの通り道に入る所の壁を開ける。
//   行き止まりの奥は小さな広間で、突き当たりを岩でふさぐ
//   岩山の上も歩ける（通り道の上に床を登録する。world/floors.js）。中の壁は通れない（当たり判定）。岩山は bot の目をさえぎる
// 全部で 1 つの形（描画命令 1 つ）。質感は岩の写真（Poly Haven。起動の時に読む地面・岩の質感）
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { fbm } from '../core/random.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const K = 12;   // 断面の区切り（床の左端 → 天井 → 床の右端）

/**
 * @param {object} land world/landform.js（cave と uncarved）
 * @param {{ obstacles, floors, sight, rockTex, seed, terrain }} o  terrain があれば、岩山の蓋の上の面を地面と同じ見た目にする
 */
export function createCave(app, land, { obstacles, floors, sight = null, rockTex = null, seed = 1, terrain = null }) {
  const C = land.cave;
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  let tris = 0;
  const mouths = C.mouths;
  /** 口からの近さで、奥ほど暗い色（0.35〜0.85。暗すぎると戦えないので、行き止まりでも少し見える） */
  const shadeAt = (x, z) => {
    const d = Math.min(...mouths.map(([mx, mz]) => Math.hypot(x - mx, z - mz)));
    return 0.85 - 0.5 * smooth(6, 26, d);
  };
  /** ほかの通り道の中か（分かれ道の所の壁を開ける） */
  const insideOther = (t, x, y, z) => {
    for (const u of C.tunnels) {
      if (u === t) continue;
      const q = C.nearest(x, z, u);
      if (q && q.e < -0.05 && y < q.floor + q.ceil + 0.25) return true;
    }
    return false;
  };
  const vert = (x, y, z, nx, ny, nz, u, v, c) => {
    positions.push(x, y, z); normals.push(nx, ny, nz); uvs.push(u, v); colors.push(c, c * 0.97, c * 0.93, 1);
    return positions.length / 3 - 1;
  };

  for (const t of C.tunnels) {
    const P = t.P;
    // 覆われた所だけ筒にする（本道の口の外は屋根の無い切り通し）
    let i0 = 0, i1 = P.length - 1;
    while (i0 < P.length - 1 && t.covered[i0] < 0.5) i0++;
    while (i1 > 0 && t.covered[i1] < 0.5) i1--;
    if (i1 <= i0) continue;
    const rings = [];
    for (let i = i0; i <= i1; i++) {
      const j0 = Math.max(0, i - 1), j1 = Math.min(P.length - 1, i + 1);
      let tx = P[j1][0] - P[j0][0], tz = P[j1][1] - P[j0][1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = -tz, nz = tx;   // 左
      const hw = t.width[i] / 2, ceil = t.ceiling[i], fy = t.floor[i];
      const ring = [];
      for (let k = 0; k <= K; k++) {
        const th = -0.12 + (Math.PI + 0.24) * (k / K);            // 床の少し下から、天井を回って、反対の床の少し下まで
        const c = Math.cos(th), s = Math.sin(th);
        // 岩のごつごつ：断面の外へ押し出す（天井の真ん中ほど大きく）
        const bump = (fbm(t.s[i] * 0.35, k * 0.8, seed + 71) - 0.5) * 0.7 * (0.5 + 0.5 * s);
        const ex = -c * (hw + bump), ey = Math.max(-0.25, s * (ceil + bump * 0.6));
        const x = P[i][0] + nx * ex, z = P[i][1] + nz * ex, y = fy + ey;
        // 法線は筒の内側へ
        const ix = -nx * -c, iz = -nz * -c;
        const l = Math.hypot(ix, s, iz) || 1;
        ring.push({ x, y, z, nx: ix / l, ny: -s / l, nz: iz / l, u: t.s[i] / 2.5, v: (k / K) * (Math.PI * (hw + ceil) / 2) / 2.5 });
      }
      rings.push(ring);
    }
    // 筒の面：分かれ道の所（ほかの通り道の中）の面は作らない
    for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < K; k++) {
      const a = rings[r][k], b = rings[r][k + 1], c = rings[r + 1][k], d = rings[r + 1][k + 1];
      const mx = (a.x + b.x + c.x + d.x) / 4, my = (a.y + b.y + c.y + d.y) / 4, mz = (a.z + b.z + c.z + d.z) / 4;
      if (insideOther(t, mx, my, mz)) continue;
      const ids = [a, b, c, d].map((p) => vert(p.x, p.y, p.z, p.nx, p.ny, p.nz, p.u, p.v, shadeAt(p.x, p.z)));
      indices.push(ids[0], ids[2], ids[1], ids[1], ids[2], ids[3]);
    }
    // 床：通り道の幅の、岩の床（地面の格子より細かく、平らに）
    for (let i = i0 - (i0 > 0 ? 1 : 0); i < i1 + (i1 < P.length - 1 ? 1 : 0); i++) {
      const seg = [i, i + 1].map((j) => {
        const j0 = Math.max(0, j - 1), j1 = Math.min(P.length - 1, j + 1);
        let tx = P[j1][0] - P[j0][0], tz = P[j1][1] - P[j0][1];
        const tl = Math.hypot(tx, tz) || 1;
        return { x: P[j][0], z: P[j][1], nx: -tz / tl, nz: tx / tl, hw: t.width[j] / 2 + 0.25, y: t.floor[j] + 0.03 + C.tunnels.indexOf(t) * 0.004, s: t.s[j] };
      });
      const q = [];
      for (const p of seg) for (const side of [-1, 1]) q.push(vert(p.x + p.nx * p.hw * side, p.y, p.z + p.nz * p.hw * side, 0, 1, 0, p.s / 2.5, side * p.hw / 2.5, shadeAt(p.x, p.z) * 0.8));
      indices.push(q[0], q[2], q[1], q[1], q[2], q[3]);
    }
    // 行き止まりの奥：最後の輪から、奥の少し先の真ん中へ集めてふさぐ
    if (t.end) {
      const last = rings[rings.length - 1], [ex, ez] = P[i1], [px, pz] = P[i1 - 1];
      const fx = ex - px, fz = ez - pz, fl = Math.hypot(fx, fz) || 1;
      const cx = ex + (fx / fl) * 0.8, cz = ez + (fz / fl) * 0.8, cy = t.floor[i1] + t.ceiling[i1] * 0.45;
      const center = vert(cx, cy, cz, -fx / fl, 0, -fz / fl, 0, 0, 0.25);
      for (let k = 0; k < K; k++) {
        const a = last[k], b = last[k + 1];
        const ia = vert(a.x, a.y, a.z, -fx / fl, 0, -fz / fl, a.v, 0.6, 0.25), ib = vert(b.x, b.y, b.z, -fx / fl, 0, -fz / fl, b.v, 0.6, 0.25);
        indices.push(center, ia, ib);
      }
    }
    // 本道の口：筒の端のまわりに、外へ広がる岩の縁（筒の端と岩山の崖の間をふさぐ）
    if (t.id === 'main') {
      for (const [r, dir] of [[0, -1], [rings.length - 1, 1]]) {
        const ring = rings[r];
        const flange = ring.map((p) => {
          const ox = p.x - (ring[0].x + ring[K].x) / 2, oz = p.z - (ring[0].z + ring[K].z) / 2, oy = p.y - Math.min(ring[0].y, ring[K].y);
          const l = Math.hypot(ox, oy, oz) || 1;
          return { x: p.x + (ox / l) * 2.2, y: p.y + (oy / l) * 2.2, z: p.z + (oz / l) * 2.2 };
        });
        for (let k = 0; k < K; k++) {
          const a = ring[k], b = ring[k + 1], c = flange[k], d = flange[k + 1];
          const ids = [a, b, c, d].map((p, n) => vert(p.x, p.y, p.z, 0, 1, 0, n < 2 ? a.v : a.v + 0.8, n % 2, 0.7));
          indices.push(ids[0], ids[2], ids[1], ids[1], ids[2], ids[3]);
        }
      }
    }
  }
  // ---- 岩山の蓋：通り道の溝の上を、掘る前の岩山の高さで覆う ----
  // （溝は床まで掘ってあるので、筒の継ぎ目や分かれ道の所に隙間があると空が見えていた。蓋があれば、隙間からは暗い岩が見える。
  //   外から見ても、岩山の上の溝の縁が見えない）
  // 蓋は 2 枚：上の面は地面と同じ見た目（地面のマテリアルと頂点色。上から見ると岩山と見分けが付かない）、
  //   その 0.36m 下に岩の面（両面。中から隙間越しに見える）。岩山は天井の上に少なくとも 5.6m あるので、下の面が中に出ることはない
  const skin = { positions: [], uvs: [], colors: [], indices: [] };
  const tile = terrain?.uvTile || 2;
  C.tunnels.forEach((t, ti) => {
    const P = t.P, ACROSS = 7;
    let prev = null, prevS = null;
    for (let i = 0; i < P.length; i++) {
      if (t.covered[i] < 0.5) { prev = prevS = null; continue; }
      const j0 = Math.max(0, i - 1), j1 = Math.min(P.length - 1, i + 1);
      let tx = P[j1][0] - P[j0][0], tz = P[j1][1] - P[j0][1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = -tz, nz = tx, hw = t.width[i] / 2 + 4.3;
      const row = [], rowS = [];
      for (let k = 0; k < ACROSS; k++) {
        const a = (k / (ACROSS - 1)) * 2 - 1, x = P[i][0] + nx * hw * a, z = P[i][1] + nz * hw * a;
        const top = land.uncarved(x, z) + ti * 0.015;
        row.push(vert(x, top - 0.3, z, 0, 1, 0, x / 3, z / 3, 0.62));
        if (terrain) {
          skin.positions.push(x, top + 0.06, z); skin.uvs.push(x / tile, z / tile); skin.colors.push(...terrain.colorAt(x, z));
          rowS.push(skin.positions.length / 3 - 1);
        }
      }
      if (prev) for (let k = 0; k < ACROSS - 1; k++) indices.push(prev[k], row[k], prev[k + 1], prev[k + 1], row[k], row[k + 1]);
      if (prevS) for (let k = 0; k < ACROSS - 1; k++) for (const tri of [[prevS[k], rowS[k], prevS[k + 1]], [prevS[k + 1], rowS[k], rowS[k + 1]]]) {
        // 地面と同じく、上から見て表になる向きにそろえる（片面なので）
        const q = skin.positions, [i0, i1, i2] = tri.map((v) => v * 3);
        const ux = q[i1] - q[i0], uz = q[i1 + 2] - q[i0 + 2], vx = q[i2] - q[i0], vz = q[i2 + 2] - q[i0 + 2];
        if (uz * vx - ux * vz > 0) skin.indices.push(...tri); else skin.indices.push(tri[0], tri[2], tri[1]);
      }
      prev = row; prevS = rowS.length ? rowS : null;
    }
  });
  tris = indices.length / 3;

  // ---- 形にして描く（両面。内側から見るため） ----
  const mesh = createMesh(app.graphicsDevice, { positions, normals, uvs, colors, indices });
  const mat = new pc.StandardMaterial();
  mat.diffuse = new pc.Color(0.82, 0.78, 0.72);
  mat.diffuseVertexColor = true;
  mat.vertexColorGamma = true;
  mat.useMetalness = true; mat.metalness = 0; mat.gloss = 0.22;
  if (rockTex) {
    mat.diffuseMap = rockTex.diffuse;
    if (rockTex.normal) mat.normalMap = rockTex.normal;
  }
  mat.cull = pc.CULLFACE_NONE;
  mat.update();
  const e = new pc.Entity('cave');
  e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], castShadows: true, receiveShadows: true });
  app.root.addChild(e);
  sceneBudget.triangles += tris;
  // 蓋の上の面（地面と同じ見た目）：描画命令がもう 1 つ（見える時だけ）
  let skinTris = 0;
  if (terrain && skin.indices.length) {
    const skinMesh = createMesh(app.graphicsDevice, skin);
    const se = new pc.Entity('cave-hill-skin');
    se.addComponent('render', { meshInstances: [new pc.MeshInstance(skinMesh, terrain.material)], castShadows: false, receiveShadows: true });
    app.root.addChild(se);
    skinTris = skin.indices.length / 3;
    sceneBudget.triangles += skinTris;
  }

  // ---- 歩ける・ぶつかる・見えない ----
  const footprints = [];
  // 岩山の上：掘った溝のうち覆われた所（筒の上）では、掘る前の岩山の面を床にする（溝の上を歩いても中へ落ちない。見た目の蓋と同じ高さ）。
  //   掘る範囲（world/cave-shape.js の carve：壁から 3.9 m）と同じ物差しで決めるので、曲がり角でも隙間ができない。
  //   覆われていない所（口の外の切り通し）は床にしない。岩山は天井の上に少なくとも 5.6 m あるので、中の人がこの面に上がることはない
  const hillTop = (x, z) => {
    const q = C.nearest(x, z);
    if (!q || q.e > 4.2 || q.cover < 0.5) return null;
    return land.uncarved(x, z);
  };
  {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const t of C.tunnels) for (const [x, z] of t.P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    floors.addSurface({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, yaw: 0, hw: (x1 - x0) / 2 + 8, hd: (z1 - z0) / 2 + 8, at: hillTop });
  }
  for (const t of C.tunnels) {
    const P = t.P;
    for (let i = 0; i < P.length - 1; i++) {
      const cov = (t.covered[i] + t.covered[i + 1]) / 2;
      const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      const yaw = (Math.atan2(dx, dz) * 180) / Math.PI, nx = -dz / L, nz = dx / L;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, w = (t.width[i] + t.width[i + 1]) / 2, fy = (t.floor[i] + t.floor[i + 1]) / 2;
      const ceil = (t.ceiling[i] + t.ceiling[i + 1]) / 2;
      // 中の壁：両側に当たり判定の円（通り道の高さだけ。分かれ道の所は開ける）
      if (cov > 0.3) for (const s of [-1, 1]) {
        const ox = mx + nx * s * (w / 2 + 0.35), oz = mz + nz * s * (w / 2 + 0.35);
        if (insideOther(t, ox, fy + 1, oz)) continue;
        obstacles.add(ox, oz, 0.4, true, { y0: fy - 0.6, y1: fy + ceil + 0.3 });
      }
      if (cov < 0.5) continue;
      const top = Math.min(land.uncarved(mx, mz), land.uncarved(mx + nx * (w / 2 + 3.6), mz + nz * (w / 2 + 3.6)), land.uncarved(mx - nx * (w / 2 + 3.6), mz - nz * (w / 2 + 3.6)));
      // bot の目：天井から岩山の上までをさえぎる
      sight?.addYawBox(mx, fy + ceil, mz, w + 1, L + 0.1, Math.max(0.5, top - fy - ceil), yaw);
    }
    // 行き止まりの奥の突き当たり
    if (t.end) {
      const [ex, ez] = P[P.length - 1];
      obstacles.add(ex, ez, 0.8, true, { y0: t.floor[P.length - 1] - 0.6, y1: t.floor[P.length - 1] + t.ceiling[P.length - 1] });
    }
  }
  for (const [x, z] of mouths) footprints.push({ type: 'cave', x, z });
  return { triangles: tris + skinTris, footprints, mesh: e };
}
