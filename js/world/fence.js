// 森の外周の柵（高さ約 10m の丸太の柵）。ここから先へは行けない。
// 見た目は柵だけで、通れない仕組みは「歩ける範囲（円）の外へ出さない」計算（game/movement.js の keepInside・
// player/controller.js）が受け持つ。柵より高い所も同じ円で止まるので、見えない壁になる。
// 丸太（尖った杭）と横木 2 段。外周を 16 の区間に分け、区間ごとにインスタンシングでまとめる
// （画面に映らない区間は、エンジンが描かずに済ませる）
import * as pc from 'playcanvas';
import { createMesh, geometryToArrays, transformArrays, mergeArrays, createInstancedEntity, createVertexColorMaterial } from '../core/mesh-utils.js';

const STAKE_R = 0.17;      // 丸太の太さ（半径 m）
const STAKE_H = 9.4;       // 丸太の高さ（尖った先を除く）
const TIP_H = 0.7;         // 尖った先

/**
 * @param {number} radius 歩ける範囲の半径（柵はその少し外側に立てる）
 * @param {{diffuse, normal, arm} | null} bark 樹皮の質感画像
 */
export function createFence(app, terrain, radius, random, bark) {
  const R = radius + 0.6;
  // 丸太 1 本：円柱（8 面）＋尖った先。足元は地面に少し埋める
  const stake = mergeArrays([
    transformArrays(geometryToArrays(new pc.CylinderGeometry({ radius: 1, height: 1, heightSegments: 1, capSegments: 8 })),
      { offset: [0, STAKE_H / 2, 0], scale: [STAKE_R, STAKE_H, STAKE_R], color: [0.78, 0.68, 0.58], uvScale: [1, 4] }),
    transformArrays(geometryToArrays(new pc.ConeGeometry({ baseRadius: 1, peakRadius: 0, height: 1, heightSegments: 1, capSegments: 8 })),
      { offset: [0, STAKE_H + TIP_H / 2, 0], scale: [STAKE_R, TIP_H, STAKE_R], color: [0.7, 0.6, 0.5], uvScale: [1, 0.4] }),
  ]);
  const material = createVertexColorMaterial({ roughness: 0.9, textures: bark });
  const stakeMesh = createMesh(app.graphicsDevice, stake);

  const SECTIONS = 16;
  const sectionOf = (a) => Math.min(SECTIONS - 1, Math.floor((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * SECTIONS));
  const count = Math.round((2 * Math.PI * R) / (STAKE_R * 1.9));
  const stakes = Array.from({ length: SECTIONS }, () => []);
  const q = new pc.Quat(), pos = new pc.Vec3(), scl = new pc.Vec3();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = R + (random.next() - 0.5) * 0.08;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 0.92 + random.next() * 0.14;                  // 高さを少しずつ変える
    const s = 0.9 + random.next() * 0.2;                    // 太さも
    pos.set(x, terrain.heightAt(x, z) - 0.5, z);
    q.setFromEulerAngles((random.next() - 0.5) * 2.5, random.next() * 360, (random.next() - 0.5) * 2.5);
    scl.set(s, h, s);
    stakes[sectionOf(a)].push(new pc.Mat4().setTRS(pos, q, scl));
  }
  stakes.forEach((list, i) => createInstancedEntity(app, `fence-stakes-${i}`, stakeMesh, material, list));

  // 横木：柵の内側に、高さ 2m と 6.5m の 2 段。区間ごとに 1 本の角材
  const rail = transformArrays(geometryToArrays(new pc.BoxGeometry({ halfExtents: new pc.Vec3(0.5, 0.5, 0.5) })),
    { scale: [1, 0.22, 0.16], color: [0.62, 0.52, 0.42], uvScale: [3, 0.3] });
  const railMesh = createMesh(app.graphicsDevice, rail);
  const segs = Math.round((2 * Math.PI * R) / 3.2);
  const rails = Array.from({ length: SECTIONS }, () => []);
  const rr = R - STAKE_R - 0.1;
  const len = (2 * Math.PI * rr) / segs + 0.15;
  for (let i = 0; i < segs; i++) {
    const a = ((i + 0.5) / segs) * Math.PI * 2;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const g = terrain.heightAt(x, z);
    for (const y of [2.0, 6.5]) {
      pos.set(x, g + y, z);
      q.setFromEulerAngles(0, (-a * 180) / Math.PI + 90, 0);   // 円に沿う向き
      scl.set(len, 1, 1);
      rails[sectionOf(a)].push(new pc.Mat4().setTRS(pos, q, scl));
    }
  }
  rails.forEach((list, i) => createInstancedEntity(app, `fence-rails-${i}`, railMesh, material, list));
}
