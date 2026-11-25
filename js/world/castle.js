// 村 3 つ（山邑・川邑・野邑。配置は world/villages.js）と、道が川を渡る橋。利用者の指示（2026-11-14）：
//   「村も正方形の作りですが、現実ではおかしいので」「村を 3 箇所ぐらい作ってください」
//   柵で囲まず、曲がった道に沿って家が並ぶ（扉は道を向く）。村ごとに井戸と石畳の広場。野邑には柵で囲った畑。
//   前の村（南西の長方形の柵・屋根付きの門・碁盤の目の家並み）は、利用者の指示で無くした
//   家は大きさがばらばらで、一階建てと二階建て。どの家にも入れる（家の作りは world/house-builder.js）
//   建物は箱・切妻屋根を組み合わせて作り、Poly Haven（CC0）の実写の質感を貼る。
// 質感ごとに 1 つの形にまとめて描く（描画命令は質感の数だけ）。質感の画像は、起動の後に裏で読み込んで貼る。
// 画像の貼り方は、面の向きと場所から決める（どの建物でも実物の大きさで繰り返す）
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { loadTextureSet } from './materials.js';
import { createRandom } from '../core/random.js';
import { SURFACES, builder, frame, box, obox, buildHouse } from './house-builder.js';
import { v3 } from './build-kit.js';
import { well, barrel, bench, hay, woodpile } from './village-props.js';
import { createFurnitureMotion } from '../render/furniture-motion.js';
import { createDoors } from './doors.js';
import { buildRoadside } from './roadside.js';
import { buildLandmarks } from './landmarks.js';
import { placeVillageLife } from './village-life.js';
import { buildPlaza } from './plaza.js';
import { createVillageItems } from './village-items.js';
import { createHouseLife } from './house-life.js';

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
 * 村を作る（配置は plan = world/villages.js の planVillages の結果）
 * @param {object} zones エリア分け
 * @param {object} obstacles 当たり判定（家・橋の欄干・井戸などを通れないように円を並べる）
 * @param {object} floors 歩ける床（world/floors.js。家の床と階段・橋を登録する）
 * @param {object} plan 村・道・橋の配置
 * @param {object} land 地形（world/landform.js。川の水面・洞窟の口。道まわりが使う）
 */
export function createVillage(app, config, terrain, obstacles, zones, floors, sight = null, plan = null, land = null) {
  const B = builder();
  const footprints = [];   // 地図に描く形：{ type: 'rect', x, z, w, d, yaw } / { type: 'circle', x, z, r } / { type: 'line', pts }
  const rnd = createRandom(config.seed + 333);
  const solid = (x, z, rad, range) => obstacles.add(x, z, rad, true, range);
  /** 線に沿って当たり判定の円を並べる */
  const solidLine = (ax, az, bx, bz, rad) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (rad * 0.9));
    for (let i = 0; i <= n; i++) solid(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, rad);
  };
  const houses = [];
  const hides = [];   // 隠れ場所（ベッドの下・タンスの中）
  const covers = [];  // 壁裏隠れの線（家の外の壁と中の壁。game/cover.js）
  const doorList = [];   // 家の扉（開け閉めできる。world/doors.js）
  // 小物と乗り物の模型（Poly Haven・Blender。world/village-items.js）。家の中の椅子・電気コンロ・額なども置くので、家より先に作る
  const items = createVillageItems(app, config);
  const houseLife = [];   // 家ごとの「人が消えた直後」の記録（灯り・テレビ・熾火・窓。world/house-life.js）
  const reg = { floors, solid, hides, sight, covers, doors: doorList, items, houseLife };
  const walls = [1, [1, 0.94, 0.84], [0.98, 0.9, 0.86], [0.92, 0.92, 0.9], [1, 0.97, 0.88]];   // しっくいの色（白・黄土・薄紅・灰・生成り）
  let i = 0;
  // 家の周りの小物（樽・長椅子・薪の山・干し草）。家の並びを変えないよう、別の乱数で選ぶ
  const rndProp = createRandom(config.seed + 335);
  function houseProps(x, y0, z, yaw, w, d) {
    const F = frame(x, y0, z, yaw);
    const ps = rndProp.next() < 0.5 ? -1 : 1;   // 扉のどちら側に置くか
    const put = (lx, lz, r) => { const q = F.at(lx, 0, lz); solid(q[0], q[2], r); return q; };
    const k = rndProp.next();
    const used = { front: 0, side: 0 };   // 前からある小物が使った所（現代の小物 world/village-life.js が避ける）
    if (k < 0.4) {
      used.front = ps;
      // 扉の横に樽 1〜2 つ
      const q = put(ps * (w / 2 - 0.45), d / 2 + 0.55, 0.36);
      const by = terrain.heightAt(q[0], q[2]);
      barrel(B, q[0], by - 0.02, q[2]); sight?.addCyl(q[0], q[2], 0.32, by - 0.02, by + 0.84);
      if (rndProp.next() < 0.5) {
        const q2 = put(ps * (w / 2 - 1.1), d / 2 + 0.5, 0.33), by2 = terrain.heightAt(q2[0], q2[2]);
        barrel(B, q2[0], by2 - 0.02, q2[2], 0.27, 0.74); sight?.addCyl(q2[0], q2[2], 0.28, by2 - 0.02, by2 + 0.72);
      }
    } else if (k < 0.75 && w >= 5.4) {
      used.front = ps;
      // 壁に沿った長椅子
      const lx = ps * (w / 2 - 1.15);
      for (const dx of [-0.45, 0.45]) put(lx + dx, d / 2 + 0.42, 0.28);
      const q = F.at(lx, 0, d / 2 + 0.42);
      bench(B, frame(q[0], terrain.heightAt(q[0], q[2]), q[2], yaw), yaw, 0, 0);
    }
    // 横の壁に薪の山（屋根付き）
    if (rndProp.next() < 0.45) {
      const ss = rndProp.next() < 0.5 ? -1 : 1, z0 = -d / 2 + 0.6, z1 = Math.min(d / 2 - 1.0, z0 + 1.6 + rndProp.next() * 0.8);
      used.side = ss;
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
    return used;
  }
  const usedList = [];
  for (const h of plan?.houses || []) {
    const roof = rnd.next() < 0.55 ? 'thatch' : 'tiles';
    const y0 = h.y0;
    buildHouse(B, { cx: h.x, cz: h.z, y0, yaw: h.yaw, w: h.w, d: h.d, stories: h.stories, roof, wall: walls[i++ % walls.length], rnd, deco: createRandom(config.seed + 1000 + houses.length) }, reg);
    houses.push({ x: h.x, z: h.z, w: h.w, d: h.d, yaw: h.yaw, y0, stories: h.stories });   // y0：地面の高さ（貫く矢の穴。world/arrow-holes.js）
    footprints.push({ type: 'rect', x: h.x, z: h.z, w: h.w, d: h.d, yaw: h.yaw, roof });
    usedList.push(houseProps(h.x, y0, h.z, h.yaw, h.w, h.d));
  }
  /** 家の中か（家の中の音の響き・bot の判断に使う） */
  const insideHouse = (x, z) => !!landmarks?.church?.inside(x, z) || houses.some((hh) => {   // 教会の中も（world/church.js）
    const a = (hh.yaw * Math.PI) / 180, dx = x - hh.x, dz = z - hh.z;
    const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
    return Math.abs(lx) < hh.w / 2 + 0.5 && Math.abs(lz) < hh.d / 2 + 0.5;
  });
  // 村ごとの広場（石畳）と井戸（2026-11-22 に作り直した。形は world/plaza.js、縁は world/villages.js の shapePlaza）
  //   村の乱数 rnd は、前の広場と同じ 18 回だけ使う（後の畑・干し草の並びを変えないため。石の列のずらしなどに使う）
  for (const [wi, w] of (plan?.wells || []).entries()) {
    const rv = [];
    for (let k = 0; k < 18; k++) rv.push(rnd.next());
    buildPlaza(B, w, { terrain, roads: plan.roads, rv, seed: config.seed + 61 * wi });
    const wy = terrain.heightAt(w.x, w.z);
    well(B, w.x, wy, w.z);
    solid(w.x, w.z, 1.3);
    sight?.addCyl(w.x, w.z, 1.15, wy - 0.2, wy + 0.85);
    footprints.push({ type: 'circle', x: w.x, z: w.z, r: 1.1 });
  }

  // 野邑の畑：低い柵で囲い、干し草を少し
  for (const f of plan?.fields || []) {
    const a = (f.yaw * Math.PI) / 180, R = [Math.cos(a), -Math.sin(a)], Fw = [Math.sin(a), Math.cos(a)];
    const at = (u, v) => [f.x + R[0] * u + Fw[0] * v, f.z + R[1] * u + Fw[1] * v];
    const cs = [at(-f.w / 2, -f.d / 2), at(f.w / 2, -f.d / 2), at(f.w / 2, f.d / 2), at(-f.w / 2, f.d / 2)];
    for (let k = 0; k < 4; k++) {
      const p0 = cs[k], p1 = cs[(k + 1) % 4], n = Math.max(1, Math.round(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 9));
      for (let q = 0; q < n; q++) {
        if (k === 0 && q === Math.floor(n / 2)) continue;   // 入り口（柵の切れ目）
        const a0 = [p0[0] + ((p1[0] - p0[0]) * q) / n, p0[1] + ((p1[1] - p0[1]) * q) / n];
        const a1 = [p0[0] + ((p1[0] - p0[0]) * (q + 1)) / n, p0[1] + ((p1[1] - p0[1]) * (q + 1)) / n];
        fenceRun(B, terrain, a0, a1, solidLine, sight);
      }
    }
    footprints.push({ type: 'line', pts: [...cs, cs[0]] });
    for (let k = 0; k < 2; k++) {
      const [hx, hz] = at((rnd.next() - 0.5) * (f.w - 4), (rnd.next() - 0.5) * (f.d - 4));
      solid(hx, hz, 0.6);
      hay(B, frame(hx, terrain.heightAt(hx, hz) - 0.03, hz, f.yaw), f.yaw, 0, 0, rnd);
    }
  }

  // 道まわり（2026-11-21。マップは全部現代）：舗装の道・コンクリートの橋（前の長い木の橋を作り替えた。利用者が選んだ ① 道と電気）・
  //   ガードレール・電柱と電線・街灯・道路標識・バス停（world/roadside.js）。同じ入れ物に貯める
  const roadside = plan ? buildRoadside(B, { app, config, terrain, plan, land, zones, obstacles, floors, sight, solid, solidLine }) : null;
  if (roadside) footprints.push(...roadside.footprints);

  // 現代の村の暮らしの物（2026-11-21。利用者が選んだ ② 村の暮らしの物）：教会・ガソリンスタンド（world/landmarks.js）と、
  //   家のまわりの小物・車・自転車・畑のトラクター（world/village-life.js）。模型は world/village-items.js が裏で読み込んで描く
  const landmarks = plan ? buildLandmarks(B, { app, plan, terrain, items, solid, solidLine, sight, covers, floors, doorList, houseLife, cave: land?.cave || null }) : null;
  if (landmarks) footprints.push(...landmarks.footprints);
  const life = plan ? placeVillageLife({ plan, terrain, land, obstacles, sight, items, solid, seed: config.seed, used: usedList, avoid: plan.specials || [] }) : null;

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
    if (surf === 'steel') { m.metalness = 0.55; m.gloss = 0.5; }            // 亜鉛めっきの鉄
    if (surf === 'asphalt' || surf === 'paint' || surf === 'slab') { m.depthBias = -1; m.depthBiasSlope = -3; }   // 地面の上に貼る：ちらつかないよう手前へ
    if (surf === 'paint') m.gloss = 0.35;
    m.update();
    materials[surf] = m;
    const e = new pc.Entity(`village-${surf}`);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, m)], castShadows: true, receiveShadows: true });
    app.root.addChild(e);
    tris += g.indices.length / 3;
  }
  sceneBudget.triangles += tris;
  // タンスの扉・ベッドの掛け布（隠れる・探す動きに合わせて動く部品。同じ質感を使う）
  const furniture = createFurnitureMotion(app, hides, materials);
  // 家の扉（開け閉めできる。どの家にも 1 枚）
  const doors = createDoors(app, doorList, { material: materials.gate });
  landmarks?.finish(materials);   // 教会の石板・ステンドグラス（world/church.js）

  // 小物と車の模型は裏で読み込む（届くまでは当たり判定だけ）
  items.load();
  // 家の中の「人が消えた直後」：点いたままの灯り・テレビ・熾火と、夜の窓の灯り（③ 2026-11-21）
  const interior = createHouseLife(app, houseLife, config.seed);

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
  return { houses, triangles: tris, footprints, hides, covers, insideHouse, furniture, doors, materials, roadside, landmarks, items, life, interior };   // roadside：街灯を夜に点ける（update）   // materials：村の質感（棺桶 render/coffin.js が木の質感を使う）
}
