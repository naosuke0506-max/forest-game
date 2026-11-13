// 祓魔僧の神怒の衝撃波の見た目：放った所から金色の光の輪が地面に沿って広がり、薄れて消える（game/combat.js の 'wrath'）。
// 輪は 1 つの平たい形（64 の区切り）を大きくしていくだけ（広がっている間だけ描画命令 1 つ）
import * as pc from 'playcanvas';

const SEG = 64, LIFE = 0.6;

export function createWrathWave(app) {
  const device = app.graphicsDevice;
  // 内の縁（透明）→ 光る帯 → 外の縁（透明）の 3 本の輪をつないだ形。半径 1 の輪（大きさで広げる）
  const radii = [0.78, 0.94, 1.0], alphas = [0, 1, 0];
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    radii.forEach((r, j) => { pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); col.push(1, 0.86, 0.5, alphas[j]); });
  }
  for (let i = 0; i < SEG; i++) for (let j = 0; j < 2; j++) {
    const a = i * 3 + j, b = (i + 1) * 3 + j;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const mesh = new pc.Mesh(device);
  mesh.setPositions(pos); mesh.setColors(col, 4); mesh.setIndices(idx);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  const mat = new pc.StandardMaterial();
  mat.useLighting = false; mat.useSkybox = false; mat.useFog = false;
  mat.diffuse = new pc.Color(0, 0, 0);
  mat.emissive = new pc.Color(1, 1, 1);
  mat.emissiveVertexColor = true;
  mat.opacityVertexColor = true; mat.opacityVertexColorChannel = 'a';
  mat.blendType = pc.BLEND_ADDITIVE;
  mat.depthWrite = false;
  mat.cull = pc.CULLFACE_NONE;
  mat.update();
  const ent = new pc.Entity('wrath-wave');
  ent.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], castShadows: false, receiveShadows: false });
  ent.enabled = false;
  app.root.addChild(ent);
  let t = -1, R = 9;

  return {
    /** 広げ始める（x, y, z：放った所、radius：届く所） */
    burst({ x, y, z, radius }) {
      R = radius; t = 0;
      ent.setPosition(x, y + 0.25, z);
      ent.enabled = true;
    },
    update(dt) {
      if (t < 0) return;
      t += dt;
      const u = Math.min(1, t / LIFE);
      const s = 0.6 + (R - 0.6) * (1 - (1 - u) * (1 - u));
      ent.setLocalScale(s, 1, s);
      mat.emissiveIntensity = 2.2 * (1 - u);
      mat.update();
      if (u >= 1) { t = -1; ent.enabled = false; }
    },
  };
}
