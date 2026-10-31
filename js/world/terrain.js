// 地面：起伏のある格子。高さを求める heightAt() は、歩行の接地や物の配置にも使う
import * as pc from 'playcanvas';
import { fbm } from '../core/random.js';
import { createMesh, createVertexColorMaterial, sceneBudget } from '../core/mesh-utils.js';

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createTerrain(app, config, seed, textures = null) {
  const { terrainSize: size, terrainSegments: seg, playRadius } = config.world;

  /** 地点 (x, z) の地面の高さ（m） */
  const heightAt = (x, z) => {
    const r = Math.hypot(x, z);
    const hills = (fbm(x * 0.018, z * 0.018, seed) - 0.5) * 9;
    const bumps = (fbm(x * 0.09, z * 0.09, seed + 7) - 0.5) * 1.1;
    const flat = smoothstep(4, 22, r);              // 開始地点の周りは平らに
    const rim = smoothstep(playRadius - 8, size * 0.5, r) * 7; // 外周は盛り上げて境目を隠す
    return (hills * flat + bumps * (0.3 + 0.7 * flat)) + rim;
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
  const moss = textures ? [0.50, 0.56, 0.42] : [0.20, 0.27, 0.12];
  const soil = textures ? [0.62, 0.53, 0.45] : [0.29, 0.23, 0.16];
  const dryGrass = textures ? [0.66, 0.60, 0.46] : [0.36, 0.34, 0.20];
  const tile = textures ? textures.size : size; // 質感画像 1 枚が覆う大きさ（m）

  for (let iz = 0; iz < verts; iz++) {
    for (let ix = 0; ix < verts; ix++) {
      const i = iz * verts + ix;
      const x = -half + (ix / seg) * size;
      const z = -half + (iz / seg) * size;
      positions[i * 3] = x;
      positions[i * 3 + 1] = heightAt(x, z);
      positions[i * 3 + 2] = z;
      // 場所から決まる UV：画像 1 枚が実物の大きさ（2m 四方）で並ぶ
      uvs[i * 2] = x / tile;
      uvs[i * 2 + 1] = z / tile;

      // 土・苔・枯れ草をノイズで混ぜる（質感画像を使うまでの仮の色）
      const n1 = fbm(x * 0.06, z * 0.06, seed + 31);
      const n2 = fbm(x * 0.25, z * 0.25, seed + 47);
      const tSoil = smoothstep(0.45, 0.7, n1);
      const tDry = smoothstep(0.55, 0.8, n2) * 0.6;
      for (let c = 0; c < 3; c++) {
        let v = moss[c] + (soil[c] - moss[c]) * tSoil;
        v += (dryGrass[c] - v) * tDry;
        colors[i * 4 + c] = Math.min(1, v * (0.85 + 0.3 * n2));
      }
      colors[i * 4 + 3] = 1;
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

  const entity = new pc.Entity('Terrain');
  entity.addComponent('render', {
    meshInstances: [new pc.MeshInstance(mesh, material)],
    castShadows: false,
    receiveShadows: true,
  });
  app.root.addChild(entity);

  return { entity, heightAt, normalAt };
}
