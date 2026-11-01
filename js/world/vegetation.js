// 木と草（仮モデル）。形ごとに 1 回の描画命令で全部を並べる。
// 後で Meshy AI の GLB に置き換えるときは、ここの「形を作る」部分だけを差し替える
import * as pc from 'playcanvas';
import { createRandom, fbm } from '../core/random.js';
import { applyWind } from './wind.js';
import {
  createMesh, geometryToArrays, transformArrays, mergeArrays,
  createInstancedEntity, createVertexColorMaterial,
} from '../core/mesh-utils.js';

const BARK = [0.34, 0.26, 0.19];       // 質感画像が無いときの幹の色
const BARK_TINT = [0.92, 0.88, 0.84];  // 質感画像があるときの色味の調整

/**
 * 幹：円柱。UV は「周りに 1 周で画像 1 枚」、縦は実物の比率に合わせて繰り返す
 * （横に半端な繰り返しにすると、継ぎ目で模様がずれるため）
 */
function trunkArrays(radius, height, textured) {
  const cyl = geometryToArrays(new pc.CylinderGeometry({ radius, height, heightSegments: 2, capSegments: 10 }));
  const around = 2 * Math.PI * radius;
  return transformArrays(cyl, {
    offset: [0, height / 2, 0],
    color: textured ? BARK_TINT : BARK,
    uvScale: [1, height / around],
  });
}

/** 針葉樹の葉：重ねた円錐（高さ約 11m） */
function coniferCrownArrays() {
  const layers = [
    { r: 2.6, h: 4.4, y: 4.3, c: [0.14, 0.22, 0.12] },
    { r: 2.1, h: 3.9, y: 6.3, c: [0.15, 0.24, 0.13] },
    { r: 1.6, h: 3.4, y: 8.1, c: [0.16, 0.26, 0.14] },
    { r: 1.0, h: 2.9, y: 9.7, c: [0.18, 0.28, 0.15] },
  ];
  return mergeArrays(layers.map((l) => {
    const cone = geometryToArrays(new pc.ConeGeometry({ baseRadius: l.r, peakRadius: 0, height: l.h, heightSegments: 1, capSegments: 9 }));
    delete cone.uvs; // 葉には質感画像を貼らない
    return transformArrays(cone, { offset: [0, l.y, 0], color: l.c });
  }));
}

/** 広葉樹の葉：丸いかたまり（高さ約 9m） */
function broadleafCrownArrays() {
  const blobs = [
    { p: [0, 6.4, 0], s: [2.6, 2.0, 2.6], c: [0.22, 0.30, 0.14] },
    { p: [1.3, 5.6, 0.6], s: [1.8, 1.5, 1.8], c: [0.24, 0.32, 0.15] },
    { p: [-1.1, 5.8, -0.8], s: [1.9, 1.5, 1.9], c: [0.21, 0.29, 0.14] },
    { p: [0.2, 7.8, -0.3], s: [1.7, 1.4, 1.7], c: [0.25, 0.34, 0.16] },
  ];
  const sphere = geometryToArrays(new pc.SphereGeometry({ radius: 1, latitudeBands: 6, longitudeBands: 9 }));
  delete sphere.uvs;
  return mergeArrays(blobs.map((b) => transformArrays(sphere, { offset: b.p, scale: b.s, color: b.c })));
}

/** 草のかたまり：細い葉を 6 本、根元は暗く先は明るく */
function grassClumpArrays(rnd) {
  const positions = [], normals = [], colors = [], indices = [];
  const base = [0.08, 0.12, 0.04], tip = [0.34, 0.42, 0.16];
  for (let b = 0; b < 6; b++) {
    const ang = rnd.range(0, Math.PI * 2);
    const cx = Math.cos(ang) * rnd.range(0, 0.14), cz = Math.sin(ang) * rnd.range(0, 0.14);
    const face = rnd.range(0, Math.PI);
    const wx = Math.cos(face) * 0.035, wz = Math.sin(face) * 0.035;
    const h = rnd.range(0.32, 0.6);
    const lean = rnd.range(0.05, 0.18);
    const lx = Math.cos(ang) * lean, lz = Math.sin(ang) * lean;
    const start = positions.length / 3;
    // 根元 2 点、中ほど 2 点、先端 1 点
    const pts = [
      [cx - wx, 0, cz - wz, 0], [cx + wx, 0, cz + wz, 0],
      [cx - wx * 0.6 + lx * 0.4, h * 0.55, cz - wz * 0.6 + lz * 0.4, 0.55],
      [cx + wx * 0.6 + lx * 0.4, h * 0.55, cz + wz * 0.6 + lz * 0.4, 0.55],
      [cx + lx, h, cz + lz, 1],
    ];
    for (const [x, y, z, t] of pts) {
      positions.push(x, y, z);
      normals.push(0, 1, 0); // 上向きの法線：裏表の明るさの差をなくし、地面となじませる
      colors.push(base[0] + (tip[0] - base[0]) * t, base[1] + (tip[1] - base[1]) * t, base[2] + (tip[2] - base[2]) * t, 1);
    }
    indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2, start + 2, start + 3, start + 4);
  }
  return { positions, normals, colors, indices };
}

const tmpPos = new pc.Vec3(), tmpScale = new pc.Vec3(), tmpRot = new pc.Quat();
function matrixAt(x, y, z, yaw, sx, sy, sz, tiltX = 0, tiltZ = 0) {
  tmpPos.set(x, y, z);
  tmpRot.setFromEulerAngles(tiltX, yaw, tiltZ);
  tmpScale.set(sx, sy, sz);
  return new pc.Mat4().setTRS(tmpPos, tmpRot, tmpScale);
}

export function createTrees(app, config, seed, terrain, obstacles, barkTextures = null) {
  const w = config.world;
  const rnd = createRandom(seed + 1000);
  const device = app.graphicsDevice;
  const textured = !!barkTextures;
  const barkMaterial = createVertexColorMaterial({ roughness: 0.9, textures: barkTextures });
  const leafMaterial = createVertexColorMaterial({ roughness: 0.9 });

  // 幹と葉は別の部品（幹だけに樹皮の質感を貼る）。置く場所は共通
  const kinds = [
    {
      name: 'Conifer', count: w.conifers, spacing: 3.0, trunkR: 0.3,
      trunk: createMesh(device, trunkArrays(0.22, 4.5, textured)),
      crown: createMesh(device, coniferCrownArrays()),
    },
    {
      name: 'Broadleaf', count: w.broadleaves, spacing: 4.0, trunkR: 0.38,
      trunk: createMesh(device, trunkArrays(0.28, 5.5, textured)),
      crown: createMesh(device, broadleafCrownArrays()),
    },
  ];

  for (const kind of kinds) {
    const matrices = [];
    for (let tries = 0; matrices.length < kind.count && tries < kind.count * 30; tries++) {
      // 中心から外へ向かって、まんべんなく散らす
      const r = Math.sqrt(rnd.next()) * w.forestRadius;
      const a = rnd.range(0, Math.PI * 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (r < w.clearingRadius + 2) continue;
      if (!obstacles.isFree(x, z, kind.spacing)) continue;
      const s = rnd.range(0.75, 1.3);
      const sy = s * rnd.range(0.9, 1.15);
      matrices.push(matrixAt(x, terrain.heightAt(x, z) - 0.15, z, rnd.range(0, 360), s, sy, s, rnd.range(-2, 2), rnd.range(-2, 2)));
      obstacles.add(x, z, kind.trunkR * s);
    }
    createInstancedEntity(app, `${kind.name}Trunks`, kind.trunk, barkMaterial, matrices);
    createInstancedEntity(app, `${kind.name}Crowns`, kind.crown, leafMaterial, matrices);
  }
}

export function createGrass(app, config, seed, terrain, obstacles) {
  const w = config.world;
  const rnd = createRandom(seed + 2000);
  const mesh = createMesh(app.graphicsDevice, grassClumpArrays(createRandom(seed + 2001)));
  const material = createVertexColorMaterial({ roughness: 0.9, doubleSided: true });
  applyWind(material, { height: 0.5, bend: 0.45, flutter: 0.03 }); // 草の先がなびく

  const matrices = [];
  const target = config.quality.grassClumps;
  for (let tries = 0; matrices.length < target && tries < target * 6; tries++) {
    const r = Math.sqrt(rnd.next()) * w.grassRadius;
    const a = rnd.range(0, Math.PI * 2);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // 土が見えている所（地面の色と同じノイズ）には生やさない
    if (fbm(x * 0.06, z * 0.06, seed + 31) > 0.58) continue;
    if (!obstacles.isFree(x, z, 0.25)) continue;
    const s = rnd.range(0.7, 1.5);
    matrices.push(matrixAt(x, terrain.heightAt(x, z) - 0.02, z, rnd.range(0, 360), s, s * rnd.range(0.8, 1.3), s));
  }
  // 草は影を落とさない（影の計算が最も重くなる部分のため）
  createInstancedEntity(app, 'Grass', mesh, material, matrices, { castShadows: false });
}
