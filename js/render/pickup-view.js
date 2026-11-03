// 落ちている素材と村の箱の見た目。
//   木材：短い丸太の束　石：小さな石の山　鉄くず：折れた刃・鉄の棒・板　革・布：丸めた革と畳んだ布　箱：木の箱（開くと蓋が外れる）
// 形はエンジンの基本の形（円柱・箱・球）を組み合わせて作り、種類ごとにインスタンシングで 1 回の描画命令にまとめる。
// 素材の山は見つけやすいよう、ほんのり光る（ゆっくり明滅）。自分の周り（DRAW m）にある物だけを描く
import * as pc from 'playcanvas';
import { createMesh, geometryToArrays, mergeArrays, sceneBudget } from '../core/mesh-utils.js';
import { createRandom } from '../core/random.js';
import { loadTextureSet } from '../world/materials.js';

const DRAW = 70;          // 描く遠さ（m）
const CAP = 400;          // 種類ごとの最大の数

/** 形の配列を、行列で動かして色を塗る */
function xform(arrays, mat, color, uvScale = [1, 1]) {
  const p = [], n = [], v = new pc.Vec3(), o = new pc.Vec3();
  for (let i = 0; i < arrays.positions.length; i += 3) {
    v.set(arrays.positions[i], arrays.positions[i + 1], arrays.positions[i + 2]);
    mat.transformPoint(v, o); p.push(o.x, o.y, o.z);
    v.set(arrays.normals[i], arrays.normals[i + 1], arrays.normals[i + 2]);
    mat.transformVector(v, o); o.normalize(); n.push(o.x, o.y, o.z);
  }
  const count = p.length / 3;
  const colors = [];
  for (let i = 0; i < count; i++) colors.push(color[0], color[1], color[2], 1);
  return { positions: p, normals: n, uvs: arrays.uvs.map((u, i) => u * uvScale[i % 2]), indices: arrays.indices.slice(), colors };
}
const M = (pos, euler = [0, 0, 0], scale = [1, 1, 1]) =>
  new pc.Mat4().setTRS(new pc.Vec3(...pos), new pc.Quat().setFromEulerAngles(...euler), new pc.Vec3(...scale));
const box = () => geometryToArrays(new pc.BoxGeometry({ halfExtents: new pc.Vec3(0.5, 0.5, 0.5) }));
const cyl = (seg = 9) => geometryToArrays(new pc.CylinderGeometry({ radius: 1, height: 1, heightSegments: 1, capSegments: seg }));

/** 木材：丸太 4 本（下に 3 本、上に 1 本）を縛った束 */
function woodShape(rnd) {
  const parts = [];
  const logs = [[-0.17, 0.08], [0, 0.085], [0.17, 0.08], [-0.085, 0.22]];
  for (const [x, y] of logs) {
    const r = 0.07 + rnd.next() * 0.025, len = 0.75 + rnd.next() * 0.2;
    const c = 0.75 + rnd.next() * 0.2;
    parts.push(xform(cyl(), M([x, y, (rnd.next() - 0.5) * 0.1], [90, 0, 0], [r, len, r]), [0.62 * c, 0.5 * c, 0.4 * c], [1, 0.5]));
  }
  // 縄（2 か所）
  for (const z of [-0.22, 0.22]) parts.push(xform(cyl(), M([-0.02, 0.13, z], [90, 0, 0], [0.27, 0.04, 0.2]), [0.32, 0.26, 0.17], [0.2, 0.2]));
  return mergeArrays(parts);
}
/** 石：大小の石 5 つの山 */
function stoneShape(rnd) {
  const parts = [];
  const sph = geometryToArrays(new pc.SphereGeometry({ radius: 1, latitudeBands: 5, longitudeBands: 7 }));
  const spots = [[0, 0, 0, 0.17], [0.2, 0, 0.08, 0.12], [-0.18, 0, 0.1, 0.13], [0.05, 0, -0.2, 0.11], [0.02, 0.13, 0.02, 0.1]];
  for (const [x, y, z, r] of spots) {
    const c = 0.8 + rnd.next() * 0.25;
    parts.push(xform(sph, M([x, y + r * 0.55, z], [rnd.next() * 40, rnd.next() * 360, rnd.next() * 30], [r * 1.25, r * 0.75, r]), [0.78 * c, 0.76 * c, 0.72 * c], [0.35, 0.35]));
  }
  return mergeArrays(parts);
}
/** 鉄くず：折れた刃・鉄の棒 2 本・曲がった板・鍔 */
function ironShape() {
  const iron = [0.32, 0.32, 0.34], rust = [0.46, 0.27, 0.15], dark = [0.2, 0.19, 0.19];
  return mergeArrays([
    xform(box(), M([0.02, 0.03, 0.02], [0, 25, 6], [0.55, 0.018, 0.07]), iron),          // 折れた刃
    xform(box(), M([0.3, 0.035, 0.0], [0, 25, 0], [0.04, 0.05, 0.2]), dark),             // 鍔
    xform(box(), M([-0.12, 0.03, 0.2], [0, -40, 0], [0.38, 0.04, 0.04]), rust),           // 錆びた棒
    xform(box(), M([-0.05, 0.07, 0.18], [0, -10, 12], [0.34, 0.035, 0.035]), rust),
    xform(box(), M([-0.15, 0.04, -0.16], [8, 70, 14], [0.26, 0.016, 0.2]), [0.36, 0.3, 0.27]),   // 板
  ]);
}
/** 革・布：丸めた革と、畳んだ布 2 枚 */
function clothShape() {
  return mergeArrays([
    xform(cyl(), M([0.0, 0.085, -0.14], [90, 0, 90], [0.085, 0.5, 0.085]), [0.45, 0.29, 0.16], [0.5, 0.5]),   // 丸めた革
    xform(cyl(), M([0.0, 0.085, -0.14], [90, 0, 90], [0.09, 0.05, 0.09]), [0.25, 0.17, 0.1]),                // 革の紐
    xform(box(), M([0.02, 0.035, 0.12], [0, 8, 0], [0.42, 0.07, 0.3]), [0.8, 0.74, 0.6]),                      // 生成りの布
    xform(box(), M([0.05, 0.09, 0.13], [0, -6, 0], [0.36, 0.05, 0.26]), [0.56, 0.2, 0.17]),                    // 赤い布
  ]);
}
/** 箱（閉じた / 開いた）。横 0.85・奥行き 0.6・高さ 0.6 */
function crateShape(open) {
  const W = 0.85, D = 0.6, H = 0.6, t = 0.04, wood = [0.85, 0.78, 0.7], frame = [0.5, 0.42, 0.34];
  const parts = [];
  const uv = [1.2, 1.2];
  if (!open) parts.push(xform(box(), M([0, H / 2, 0], [0, 0, 0], [W, H, D]), wood, uv));
  else {
    parts.push(xform(box(), M([0, t / 2, 0], [0, 0, 0], [W, t, D]), wood, uv));                 // 底
    parts.push(xform(box(), M([0, H / 2, D / 2 - t / 2], [0, 0, 0], [W, H, t]), wood, uv));     // 前後
    parts.push(xform(box(), M([0, H / 2, -D / 2 + t / 2], [0, 0, 0], [W, H, t]), wood, uv));
    parts.push(xform(box(), M([W / 2 - t / 2, H / 2, 0], [0, 0, 0], [t, H, D]), wood, uv));     // 左右
    parts.push(xform(box(), M([-W / 2 + t / 2, H / 2, 0], [0, 0, 0], [t, H, D]), wood, uv));
    parts.push(xform(box(), M([0, 0.32, D / 2 + 0.22], [-62, 0, 0], [W + 0.04, 0.05, D + 0.04]), wood, uv));   // 外れて立てかけた蓋
  }
  // 角の枠（縦の 4 本と、上下の横の帯）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(xform(box(), M([sx * (W / 2 - 0.02), H / 2, sz * (D / 2 - 0.02)], [0, 0, 0], [0.07, H + 0.01, 0.07]), frame));
  for (const y of open ? [0.05] : [0.05, H - 0.05]) for (const sz of [-1, 1]) parts.push(xform(box(), M([0, y, sz * (D / 2 + 0.005)], [0, 0, 0], [W + 0.02, 0.07, 0.02]), frame));
  return mergeArrays(parts);
}

/**
 * @param {object} pickups game/pickups.js
 * @param {object} tex 起動時に読んだ質感（bark・rock）
 */
export function createPickupViews(app, pickups, terrain, tex, quality) {
  const device = app.graphicsDevice;
  const rnd = createRandom(4242);
  const glow = [];   // ほんのり光らせる材質
  function material({ textures = null, roughness = 0.85, metalness = 0, shine = false } = {}) {
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color(1, 1, 1);
    m.diffuseVertexColor = true;
    m.vertexColorGamma = true;
    m.useMetalness = true;
    m.metalness = metalness;
    m.gloss = 1 - roughness;
    if (textures) {
      m.diffuseMap = textures.diffuse;
      m.normalMap = textures.normal;
      m.aoMap = textures.arm; m.aoMapChannel = 'r';
    }
    m.update();
    if (shine) glow.push(m);
    return m;
  }
  const crateMat = material({ roughness: 0.8 });
  // 箱の板の質感は村の家と同じ物を裏で読む（届くまでは色だけ）
  loadTextureSet(device, 'weathered_brown_planks', quality).then((t) => {
    if (!t) return;
    crateMat.diffuseMap = t.diffuse; crateMat.normalMap = t.normal; crateMat.aoMap = t.arm; crateMat.aoMapChannel = 'r';
    crateMat.update();
  });
  const kinds = {
    wood:  { mesh: createMesh(device, woodShape(rnd)), mat: material({ textures: tex?.bark, shine: true }) },
    stone: { mesh: createMesh(device, stoneShape(rnd)), mat: material({ textures: tex?.rock, shine: true }) },
    iron:  { mesh: createMesh(device, ironShape()), mat: material({ roughness: 0.45, metalness: 0.65, shine: true }) },
    cloth: { mesh: createMesh(device, clothShape()), mat: material({ roughness: 0.92, shine: true }) },
    crate: { mesh: createMesh(device, crateShape(false)), mat: crateMat },
    crateOpen: { mesh: createMesh(device, crateShape(true)), mat: crateMat },
  };
  const R = 200;
  const aabb = new pc.BoundingBox(new pc.Vec3(0, 10, 0), new pc.Vec3(R, 30, R));
  for (const [id, k] of Object.entries(kinds)) {
    k.data = new Float32Array(CAP * 16);
    k.vb = new pc.VertexBuffer(device, pc.VertexFormat.getDefaultInstancingFormat(device), CAP, { data: k.data, usage: pc.BUFFER_DYNAMIC });
    k.mi = new pc.MeshInstance(k.mesh, k.mat);
    k.mi.setInstancing(k.vb);
    k.mi.instancingCount = 0;
    k.mi.setCustomAabb(aabb);
    k.tris = k.mesh.primitive[0].count / 3;
    const e = new pc.Entity(`pickup-${id}`);
    e.addComponent('render', { meshInstances: [k.mi], castShadows: true, receiveShadows: true });
    app.root.addChild(e);
  }

  const mat = new pc.Mat4(), pos = new pc.Vec3(), rot = new pc.Quat(), one = new pc.Vec3(1, 1, 1);
  let lastVersion = -1, lastX = Infinity, lastZ = Infinity, counted = 0, t = 0, glowTimer = 0;
  function rebuild(cx, cz) {
    const n = {};
    for (const id of Object.keys(kinds)) n[id] = 0;
    for (const o of pickups.items) {
      const id = o.kind === 'crate' ? (o.taken ? 'crateOpen' : 'crate') : o.taken ? null : o.kind;
      if (!id || n[id] >= CAP) continue;
      if (Math.abs(o.x - cx) > DRAW || Math.abs(o.z - cz) > DRAW) continue;
      pos.set(o.x, terrain.heightAt(o.x, o.z) - 0.02, o.z);
      rot.setFromEulerAngles(0, o.yaw, 0);
      mat.setTRS(pos, rot, one);
      kinds[id].data.set(mat.data, n[id]++ * 16);
    }
    let tris = 0;
    for (const [id, k] of Object.entries(kinds)) {
      k.mi.instancingCount = n[id];
      if (n[id]) k.vb.unlock(0, n[id] * 64);
      tris += n[id] * k.tris;
    }
    sceneBudget.triangles += tris - counted;
    counted = tris;
  }

  return {
    update(dt, camPos) {
      t += dt;
      // ゆっくり明滅（夜でも見つけられるくらい。昼はほとんど目立たない）。材質の更新は 0.1 秒ごと
      if ((glowTimer -= dt) <= 0) {
        glowTimer = 0.1;
        const k = 0.05 + 0.07 * (0.5 + 0.5 * Math.sin(t * 2.4));
        for (const m of glow) { m.emissive.set(k, k * 0.85, k * 0.55); m.update(); }
      }
      if (pickups.version === lastVersion && Math.hypot(camPos.x - lastX, camPos.z - lastZ) < 8) return;
      lastVersion = pickups.version; lastX = camPos.x; lastZ = camPos.z;
      rebuild(camPos.x, camPos.z);
    },
  };
}
