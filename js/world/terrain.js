// 地面：起伏のある格子。高さを求める heightAt() は、歩行の接地や物の配置にも使う。
// 形（周りの山・川の谷と川床・盆地の丘）は world/landform.js。ここは村の場所を平らにして、色を付けて描くだけ。
// waterAt()：川の水面と深さ（泳ぐ・水を歩く。game/water.js）
import * as pc from 'playcanvas';
import { fbm } from '../core/random.js';
import { createMesh, createVertexColorMaterial, sceneBudget } from '../core/mesh-utils.js';
import { applyGroundBlend } from './ground-blend.js';

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createTerrain(app, config, seed, textures = null, zones = null, land = null, plan = null) {
  const { terrainSize: size, terrainSegments: seg } = config.world;

  /** 地点 (x, z) の地面の高さ（m）。村の家の下と広場だけ平らにする（坂では段々になる。world/villages.js の pads） */
  const heightAt = (x, z) => {
    const h = land.heightAt(x, z);
    return plan ? plan.padHeight(x, z, h) : h;
  };
  /** 地点 (x, z) の川の水：{ surface（水面の高さ）, depth（水の深さ）} か、水が無ければ null */
  const waterAt = (x, z) => {
    const w = land.waterLevel(x, z);
    if (!w) return null;
    const depth = w.surface - heightAt(x, z);
    return depth > 0 ? { surface: w.surface, depth } : null;
  };

  /** 地点 (x, z) の地面の向き（法線） */
  const normalAt = (x, z) => {
    const e = 0.5;
    const nx = heightAt(x - e, z) - heightAt(x + e, z);
    const nz = heightAt(x, z - e) - heightAt(x, z + e);
    const len = Math.hypot(nx, 2 * e, nz);
    return [nx / len, (2 * e) / len, nz / len];
  };

  // 格子の頂点
  const verts = seg + 1;
  const positions = new Array(verts * verts * 3);
  const colors = new Array(verts * verts * 4);
  const uvs = new Array(verts * verts * 2);
  const half = size / 2;
  // 質感画像があるときは、頂点色を「色味の調整（掛け算）」に使う。無いときは今までどおり色そのもの
  const moss = textures ? [0.40, 0.64, 0.26] : [0.20, 0.27, 0.12];   // 草の地面：緑（土の画像に緑を強く掛ける）
  const soil = textures ? [0.62, 0.53, 0.45] : [0.29, 0.23, 0.16];
  const dryGrass = textures ? [0.66, 0.60, 0.46] : [0.36, 0.34, 0.20];
  const tile = textures ? textures.size : size; // 質感画像 1 枚が覆う大きさ（m）
  const deepMoss = textures ? [0.56, 0.62, 0.46] : [0.12, 0.18, 0.08];  // 深い森：苔（落ち葉と苔の画像に掛ける）
  const meadow = textures ? [0.62, 0.74, 0.38] : [0.40, 0.42, 0.18];    // 大草原：明るい草
  const dirt = textures ? [0.78, 0.64, 0.5] : [0.40, 0.32, 0.22];       // 道・村の場所：土
  const gravel = textures ? [0.62, 0.6, 0.56] : [0.36, 0.35, 0.32];     // 川床・川原：灰色の砂利
  const mud = textures ? [0.5, 0.42, 0.34] : [0.24, 0.2, 0.15];         // 水際：濡れた土
  const rock = textures ? [0.66, 0.64, 0.6] : [0.42, 0.41, 0.39];       // 山の高い所：岩肌（草はまばら）
  const plowed = textures ? [0.6, 0.46, 0.34] : [0.3, 0.22, 0.15];      // 野邑の畑：耕した土

  // 先に高さを全部求める（色を付けるときに、隣の高さから斜面の傾きを求める）
  const H = new Float32Array(verts * verts);
  for (let iz = 0; iz < verts; iz++) for (let ix = 0; ix < verts; ix++) H[iz * verts + ix] = heightAt(-half + (ix / seg) * size, -half + (iz / seg) * size);
  for (let iz = 0; iz < verts; iz++) {
    for (let ix = 0; ix < verts; ix++) {
      const i = iz * verts + ix;
      const x = -half + (ix / seg) * size;
      const z = -half + (iz / seg) * size;
      positions[i * 3] = x;
      positions[i * 3 + 1] = H[i];
      positions[i * 3 + 2] = z;
      // 場所から決まる UV：画像 1 枚が実物の大きさ（2m 四方）で並ぶ
      uvs[i * 2] = x / tile;
      uvs[i * 2 + 1] = z / tile;

      // 土・苔・枯れ草をノイズで混ぜる（質感画像を使うまでの仮の色）
      const n1 = fbm(x * 0.06, z * 0.06, seed + 31);
      const n2 = fbm(x * 0.25, z * 0.25, seed + 47);
      const tSoil = smoothstep(0.55, 0.78, n1) * 0.7;   // 土の見える所は少なめに
      const tDry = smoothstep(0.55, 0.8, n2) * 0.6;
      // エリアごとの色味：深い森は暗い苔、大草原は明るい草、村の場所と道は土
      const zw = zones ? zones.weights(x, z) : null;
      const pw = zones ? zones.path(x, z) : 0;
      // 質感の混ぜ方（world/ground-blend.js）：草地は大草原と森の草むら、落ち葉と苔は深い森と森の木の多い所。道と土の見える所は土
      let grassW = 0.75, litterW = 0;
      if (zw) {
        const n3 = fbm(x * 0.045, z * 0.045, seed + 83);
        const litterPatch = smoothstep(0.5, 0.7, n3);
        grassW = zw.prairie + zw.mixed * 0.85 * (1 - litterPatch * 0.8) + zw.castle * 0.45;
        litterW = zw.deep * 0.95 + zw.mixed * litterPatch * 0.6;
        grassW *= (1 - tSoil * 1.2) * (1 - pw);
        litterW *= 1 - pw;
      }
      // 川と山（world/landform.js）：水の中は砂利、水際は濡れた土、山の高い所と急な斜面は岩肌
      const wq = land.waterLevel(x, z);
      const under = wq ? Math.min(1, Math.max(0, (wq.surface - positions[i * 3 + 1] + 0.25) / 0.5)) : 0;   // 水面より下
      const wetK = land.wet(x, z);
      const fieldK = plan ? plan.fieldAt(x, z) : 0;   // 畑（草は生えない）
      grassW *= 1 - fieldK;
      const hx = (H[iz * verts + Math.min(seg, ix + 1)] - H[iz * verts + Math.max(0, ix - 1)]), hz = (H[Math.min(seg, iz + 1) * verts + ix] - H[Math.max(0, iz - 1) * verts + ix]);
      const sl = Math.hypot(hx, hz) / (2 * size / seg);   // 斜面の傾き（高さ / 長さ）
      const rockK = Math.max(land.rocky(x, z), smoothstep(0.75, 1.3, sl) * 0.8);
      grassW *= (1 - under) * (1 - rockK * 0.85) * (1 - wetK * 0.35);
      litterW *= (1 - under) * (1 - rockK * 0.6);
      for (let c = 0; c < 3; c++) {
        let v = moss[c] + (soil[c] - moss[c]) * tSoil;
        v += (dryGrass[c] - v) * tDry;
        if (zw) {
          v += (deepMoss[c] - v) * zw.deep * 0.7;
          v += (meadow[c] - v) * zw.prairie * 0.8;
          v += (dirt[c] - v) * zw.castle * 0.55;
          v += (dirt[c] - v) * pw * 0.9;
        }
        v += (rock[c] - v) * rockK;
        v += (plowed[c] - v) * fieldK;
        v += (mud[c] - v) * Math.max(0, wetK - under) * 0.55;
        v += (gravel[c] - v) * under;
        colors[i * 4 + c] = Math.min(1, v * (0.85 + 0.3 * n2));
      }
      colors[i * 4 + 3] = Math.min(1, Math.max(0, 0.5 + 0.5 * (grassW - litterW)));
    }
  }

  const indices = [];
  for (let iz = 0; iz < seg; iz++) {
    for (let ix = 0; ix < seg; ix++) {
      const a = iz * verts + ix, b = a + 1, c = a + verts, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const mesh = createMesh(app.graphicsDevice, { positions, colors, uvs, indices });
  sceneBudget.triangles += indices.length / 3;
  const material = createVertexColorMaterial({ roughness: 0.95, textures });
  const blend = textures ? applyGroundBlend(material, textures.size) : null;

  const entity = new pc.Entity('Terrain');
  entity.addComponent('render', {
    meshInstances: [new pc.MeshInstance(mesh, material)],
    castShadows: false,
    receiveShadows: true,
  });
  app.root.addChild(entity);

  // 地面の色（色味と質感の混ぜ方）を後から読めるように、小さくして残す（洞窟の岩山の蓋を地面と同じ見た目にするため。約 160KB）
  const colorGrid = Uint8Array.from(colors, (v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
  /** その場所の地面の頂点色（RGBA。格子の 4 点から補間） */
  const colorAt = (x, z) => {
    const fx = Math.min(seg - 1e-6, Math.max(0, ((x + half) / size) * seg)), fz = Math.min(seg - 1e-6, Math.max(0, ((z + half) / size) * seg));
    const ix = Math.floor(fx), iz = Math.floor(fz), ax = fx - ix, az = fz - iz;
    const out = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const g = (jx, jz) => colorGrid[((iz + jz) * verts + ix + jx) * 4 + c] / 255;
      out[c] = (g(0, 0) * (1 - ax) + g(1, 0) * ax) * (1 - az) + (g(0, 1) * (1 - ax) + g(1, 1) * ax) * az;
    }
    return out;
  };

  return {
    entity, heightAt, normalAt, waterAt, land,
    /** 地面と同じ見た目の物を作るとき用：マテリアル・頂点色・質感画像 1 枚の大きさ（m） */
    material, colorAt, uvTile: tile,
    /** 草地と落ち葉の画像を貼る（起動の後に裏で読んだ物） */
    setGroundTextures: (grass, litter) => blend?.setTextures(grass, litter),
  };
}
