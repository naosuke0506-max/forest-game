// 地面を覆う草（自分の周りだけ）：細い草の葉がたくさん描かれた画像を、十字に組んだ板（株）に貼り、地面にびっしり並べる。
//   画像（assets/trees_blender/grass.webp。tools/trees_blender/make_grass_atlas.py で描いた）は 2×2 の 4 種類：
//   短い草・穂のある草・白い花の混じる草・背の高い草（大草原）
// 8m 四方の区画ごとに、種から決まる乱数で置く（同じ場所は同じ置き方）。離れた区画は捨てる。
// 描く遠さの近くでは株を小さくして、ふっと消えないようにする。板の向き（法線）は上向きにして、地面と同じように光を受ける
import * as pc from 'playcanvas';
import { createRandom, fbm } from '../core/random.js';
import { sceneBudget } from '../core/mesh-utils.js';
import { applyWind } from './wind.js';

const CELL = 8;
// 種類：tile（画像の 2×2 のどこか。0 左上・1 右上・2 左下・3 右下）、size：[横幅, 高さ] の範囲（m）
const KINDS = {
  short:  { tile: 2, size: [[1.0, 1.4], [0.35, 0.6]] },
  seeds:  { tile: 3, size: [[0.7, 1.0], [0.5, 0.8]] },
  flower: { tile: 0, size: [[0.6, 0.9], [0.4, 0.6]] },
  tall:   { tile: 1, size: [[0.9, 1.3], [1.2, 1.7]] },
};
// エリアごとの多さ（1 平方メートルあたりの株の数）
const DENSITY = {
  mixed:   { short: 1.6, seeds: 0.2, flower: 0.12, tall: 0.05 },
  deep:    { short: 0.18, seeds: 0.02, flower: 0.01, tall: 0 },
  prairie: { short: 0.35, seeds: 0.2, flower: 0.1, tall: 1.2 },
  castle:  { short: 0.7, seeds: 0.08, flower: 0.06, tall: 0 },
};
const PATH_DENSITY = 0.15;   // 道の上（土）の割合

/** 十字（3 枚の板）の株。横幅 1・高さ 1。画像の tile 番目を貼る */
function tuftMesh(device, tile) {
  const ox = (tile % 2) * 0.5, oy = Math.floor(tile / 2) * 0.5;
  const positions = [], normals = [], uvs = [], indices = [], colors = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
    const b = positions.length / 3;
    positions.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
    for (let i = 0; i < 4; i++) normals.push(0, 1, 0);
    // 根元は葉の陰で暗く、先は明るい（株に奥行きが出る）
    colors.push(0.42, 0.42, 0.42, 1, 0.42, 0.42, 0.42, 1, 1.1, 1.1, 1.05, 1, 1.1, 1.1, 1.05, 1);
    // 画像の下（v が大きい側）が根元
    uvs.push(ox, oy + 0.5, ox + 0.5, oy + 0.5, ox + 0.5, oy, ox, oy);
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setColors(colors, 4);
  mesh.setIndices(indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return mesh;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`画像を読み込めません: ${url}`));
    img.src = url;
  });
}

/** 草の画像を読み込む（失敗したら null。そのときは地面の草を出さない） */
export async function loadGroundCover(app, quality) {
  try {
    const img = await loadImage('./assets/trees_blender/grass.webp');
    const tex = new pc.Texture(app.graphicsDevice, {
      name: 'grass', width: img.width, height: img.height, format: pc.PIXELFORMAT_RGBA8, srgb: true, mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE, anisotropy: quality.anisotropy,
    });
    tex.setSource(img);
    return tex;
  } catch (err) {
    console.warn(err);
    return null;
  }
}

/**
 * @param {pc.Texture} texture 草の画像
 * @param {object} zones エリア分け（無ければ全部 mixed）
 */
export function createGroundCover(app, config, seed, terrain, obstacles, texture, zones = null) {
  const device = app.graphicsDevice;
  const q = config.quality;
  const reach = { low: 20, medium: 26, high: 32 }[config.qualityName] ?? 26;   // 草を描く遠さ（m）
  const reachTall = reach * 1.5;                                              // 背の高い草は遠くまで
  const mat = new pc.StandardMaterial();
  mat.diffuseMap = texture;
  mat.opacityMap = texture;
  mat.opacityMapChannel = 'a';
  mat.alphaTest = 0.4;
  mat.alphaToCoverage = !!q.antialias;
  mat.diffuse = new pc.Color(0.6, 0.76, 0.46);   // 画像は明るめに描いてあるので、落ち着いた緑にする
  mat.diffuseVertexColor = true;                 // 根元を暗く（tuftMesh の頂点色）
  mat.useMetalness = true;
  mat.metalness = 0;
  mat.gloss = 0.2;
  mat.cull = pc.CULLFACE_NONE;
  applyWind(mat, { height: 1.6, bend: 0.5, flutter: 0.04 });

  // 種類ごとのインスタンシング（入れ物の大きさは、描く範囲に入る最大の数）
  const box = new pc.BoundingBox(new pc.Vec3(0, 5, 0), new pc.Vec3(config.world.forestRadius + 10, 15, config.world.forestRadius + 10));
  const layers = {};
  for (const [kind, k] of Object.entries(KINDS)) {
    const r = kind === 'tall' ? reachTall : reach;
    const maxD = Math.max(...Object.values(DENSITY).map((d) => d[kind]));
    const cap = Math.ceil(Math.PI * (r + CELL) * (r + CELL) * maxD * 1.1) + 32;
    const data = new Float32Array(cap * 16);
    const vb = new pc.VertexBuffer(device, pc.VertexFormat.getDefaultInstancingFormat(device), cap, { data, usage: pc.BUFFER_DYNAMIC });
    const mi = new pc.MeshInstance(tuftMesh(device, k.tile), mat);
    mi.setInstancing(vb);
    mi.instancingCount = 0;
    mi.setCustomAabb(box);
    const e = new pc.Entity(`ground-cover-${kind}`);
    e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: true });
    app.root.addChild(e);
    layers[kind] = { mi, vb, data, cap, reach: r, kind };
  }

  // 区画ごとの置き方（種から決まる）
  const cells = new Map();
  function makeCell(cx, cz) {
    const rnd = createRandom(seed + 9100 + cx * 73856093 + cz * 19349663);
    const items = [];
    const mx = (cx + 0.5) * CELL, mz = (cz + 0.5) * CELL;
    const w = zones ? zones.weights(mx, mz) : { mixed: 1, deep: 0, prairie: 0, castle: 0 };
    for (const kind of Object.keys(KINDS)) {
      const d = w.mixed * DENSITY.mixed[kind] + w.deep * DENSITY.deep[kind] + w.prairie * DENSITY.prairie[kind] + w.castle * DENSITY.castle[kind];
      const n = Math.floor(d * CELL * CELL + rnd.next());
      const k = KINDS[kind];
      for (let i = 0; i < n; i++) {
        const x = (cx + rnd.next()) * CELL, z = (cz + rnd.next()) * CELL;
        if (Math.hypot(x, z) > config.world.playRadius + 2) continue;
        // 道の上・ぶつかる物（木の幹や岩）の上には少なく
        if (zones && zones.path(x, z) > 0.5 && rnd.next() > PATH_DENSITY) continue;
        if (!obstacles.isFree(x, z, 0.25, true)) continue;
        // ところどころ薄くする（全部が同じ密度だと単調なので、ノイズでむらを付ける）
        if (fbm(x * 0.08, z * 0.08, seed + 55) < 0.35 && rnd.next() < 0.6) continue;
        const sw = k.size[0][0] + (k.size[0][1] - k.size[0][0]) * rnd.next();
        const sh = k.size[1][0] + (k.size[1][1] - k.size[1][0]) * rnd.next();
        items.push({ kind, x, z, y: terrain.heightAt(x, z) - 0.03, yaw: rnd.next() * 360, sw, sh });
      }
    }
    return items;
  }

  const q0 = new pc.Quat(), p0 = new pc.Vec3(), s0 = new pc.Vec3(), m0 = new pc.Mat4();
  let lastX = Infinity, lastZ = Infinity, lastYaw = Infinity, timer = 0, counted = 0;
  const cosView = Math.cos((80 * Math.PI) / 180);
  function update(cx, cz, fx, fz) {
    // 区画を足す・捨てる
    const R = reachTall + CELL;
    const x0 = Math.floor((cx - R) / CELL), x1 = Math.floor((cx + R) / CELL);
    const z0 = Math.floor((cz - R) / CELL), z1 = Math.floor((cz + R) / CELL);
    for (const [key, c] of cells) if (c.cx < x0 - 1 || c.cx > x1 + 1 || c.cz < z0 - 1 || c.cz > z1 + 1) cells.delete(key);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const key = `${gx},${gz}`;
      if (!cells.has(key)) cells.set(key, { cx: gx, cz: gz, items: makeCell(gx, gz) });
    }
    // 描く株を詰める（遠くは小さく。後ろは描かない）
    const counts = {};
    for (const k of Object.keys(layers)) counts[k] = 0;
    for (const c of cells.values()) {
      for (const it of c.items) {
        const L = layers[it.kind];
        const dx = it.x - cx, dz = it.z - cz, d = Math.hypot(dx, dz);
        if (d > L.reach || counts[it.kind] >= L.cap) continue;
        if (d > 6 && (dx * fx + dz * fz) / d < cosView) continue;
        const shrink = Math.min(1, (L.reach - d) / (L.reach * 0.3));   // 遠さの端の 3 割で小さくしていく
        p0.set(it.x, it.y, it.z);
        q0.setFromEulerAngles(0, it.yaw, 0);
        s0.set(it.sw * shrink, it.sh * shrink, it.sw * shrink);
        m0.setTRS(p0, q0, s0);
        L.data.set(m0.data, counts[it.kind]++ * 16);
      }
    }
    let tris = 0;
    for (const [k, L] of Object.entries(layers)) {
      L.mi.instancingCount = counts[k];
      if (counts[k]) L.vb.unlock(0, counts[k] * 64);
      tris += counts[k] * 6;
    }
    sceneBudget.triangles += tris - counted;
    counted = tris;
  }

  return {
    /** 確認用：種類ごとの今描いている株の数 */
    get counts() { return Object.fromEntries(Object.entries(layers).map(([k, L]) => [k, L.mi.instancingCount])); },
    update(dt, camPos, camFwd) {
      timer += dt;
      const yaw = camFwd ? Math.atan2(camFwd.x, camFwd.z) : 0;
      const turned = Math.abs(((yaw - lastYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.2;
      if (Math.hypot(camPos.x - lastX, camPos.z - lastZ) < 1.2 && !turned && timer < 0.6) return;
      timer = 0; lastX = camPos.x; lastZ = camPos.z; lastYaw = yaw;
      const fl = camFwd ? Math.hypot(camFwd.x, camFwd.z) || 1 : 1;
      update(camPos.x, camPos.z, camFwd ? camFwd.x / fl : 0, camFwd ? camFwd.z / fl : 1);
    },
  };
}
