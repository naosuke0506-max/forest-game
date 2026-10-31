// 岩（仮モデル）：球をノイズで崩した形を 2 種類作り、向きと大きさを変えて並べる
import * as pc from 'playcanvas';
import { createRandom, fbm } from '../core/random.js';
import { createMesh, geometryToArrays, createInstancedEntity, createVertexColorMaterial } from '../core/mesh-utils.js';

function rockArrays(seed, textured) {
  const a = geometryToArrays(new pc.SphereGeometry({ radius: 1, latitudeBands: 8, longitudeBands: 11 }));
  const p = a.positions;
  const colors = [];
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    // 位置から決まるノイズなので、球の継ぎ目の頂点も同じだけ動き、割れ目ができない
    const n = fbm(x * 1.3 + y * 0.7 + 11, z * 1.3 - y * 0.9 + 5, seed, 3);
    const k = 0.72 + n * 0.6;
    p[i] = x * k; p[i + 1] = y * k * (y < 0 ? 0.6 : 1); p[i + 2] = z * k;
    if (textured) {
      // 質感画像の色味の調整：下の面ほど暗く（土に埋もれた感じ）
      const shade = 0.72 + 0.28 * Math.min(1, Math.max(0, y + 0.6)) + n * 0.08;
      colors.push(shade, shade, shade * 0.97, 1);
    } else {
      // 上の面は苔むした色、下は灰色
      const moss = Math.max(0, y) * 0.55 * (0.6 + n);
      const g = 0.36 + n * 0.12;
      colors.push(g - moss * 0.18, g - moss * 0.06, g - moss * 0.24, 1);
    }
  }
  // 球の UV（横 1 周・縦は半周）を、横 2 回・縦 1 回の繰り返しにして模様の縦横比をそろえる
  const uvs = a.uvs.map((v, i) => (i % 2 === 0 ? v * 2 : v));
  return { positions: p, normals: pc.calculateNormals(p, a.indices), uvs, indices: a.indices, colors };
}

export function createRocks(app, config, seed, terrain, obstacles, rockTextures = null) {
  const w = config.world;
  const rnd = createRandom(seed + 3000);
  const device = app.graphicsDevice;
  const material = createVertexColorMaterial({ roughness: 0.8, textures: rockTextures });

  const variants = [0, 1].map((v) => ({ mesh: createMesh(device, rockArrays(seed + 3100 + v, !!rockTextures)), matrices: [] }));
  const pos = new pc.Vec3(), rot = new pc.Quat(), scl = new pc.Vec3();

  let placed = 0;
  for (let tries = 0; placed < w.rocks && tries < w.rocks * 30; tries++) {
    const r = Math.sqrt(rnd.next()) * (w.forestRadius - 4);
    const a = rnd.range(0, Math.PI * 2);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (r < w.clearingRadius) continue;
    // 小石から大岩まで（小さいものほど多い）
    const size = 0.35 + Math.pow(rnd.next(), 2.2) * 1.9;
    if (!obstacles.isFree(x, z, size + 0.8)) continue;
    const sy = size * rnd.range(0.5, 0.85);
    pos.set(x, terrain.heightAt(x, z) - sy * 0.25, z);
    rot.setFromEulerAngles(rnd.range(-12, 12), rnd.range(0, 360), rnd.range(-12, 12));
    scl.set(size * rnd.range(0.9, 1.3), sy, size * rnd.range(0.9, 1.3));
    variants[placed % 2].matrices.push(new pc.Mat4().setTRS(pos, rot, scl));
    // 足元の小石は踏み越せるように、当たり判定は大きめの岩だけ
    obstacles.add(x, z, size > 0.6 ? size * 0.9 : 0.01);
    placed++;
  }

  variants.forEach((v, i) => createInstancedEntity(app, `Rocks${i}`, v.mesh, material, v.matrices));
}
