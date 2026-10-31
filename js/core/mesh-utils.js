// 仮モデル用の形状を組み立てる小道具。
// 同じ形を大量に置くものは「インスタンシング」で 1 回の描画命令にまとめる
import * as pc from 'playcanvas';

/** 場面全体の三角形の数（性能の目安として画面隅に出す。エンジンの公開版の統計には無いため自前で数える） */
export const sceneBudget = { triangles: 0, instances: 0 };

/** 形状データ（配列の集まり）から Mesh を作る */
export function createMesh(device, geo) {
  const mesh = new pc.Mesh(device);
  mesh.setPositions(geo.positions);
  mesh.setNormals(geo.normals || pc.calculateNormals(geo.positions, geo.indices));
  if (geo.uvs) mesh.setUvs(0, geo.uvs);
  if (geo.colors) mesh.setColors(geo.colors, 4);
  mesh.setIndices(geo.indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return mesh;
}

/** エンジン付属の形（円柱・円錐・球など）を、配列として取り出す */
export function geometryToArrays(geometry) {
  return {
    positions: Array.from(geometry.positions),
    normals: Array.from(geometry.normals),
    indices: Array.from(geometry.indices),
  };
}

/** 形を移動・拡大し、頂点色を塗る（複数の部品を 1 つにまとめる前の下ごしらえ） */
export function transformArrays(arrays, { offset = [0, 0, 0], scale = [1, 1, 1], color = null } = {}) {
  const p = arrays.positions.slice();
  const n = arrays.normals.slice();
  for (let i = 0; i < p.length; i += 3) {
    p[i] = p[i] * scale[0] + offset[0];
    p[i + 1] = p[i + 1] * scale[1] + offset[1];
    p[i + 2] = p[i + 2] * scale[2] + offset[2];
    // 拡大率が軸ごとに違うときの法線の補正
    let nx = n[i] / scale[0], ny = n[i + 1] / scale[1], nz = n[i + 2] / scale[2];
    const len = Math.hypot(nx, ny, nz) || 1;
    n[i] = nx / len; n[i + 1] = ny / len; n[i + 2] = nz / len;
  }
  const out = { positions: p, normals: n, indices: arrays.indices.slice() };
  if (color) {
    const count = p.length / 3;
    out.colors = new Array(count * 4);
    for (let v = 0; v < count; v++) {
      out.colors[v * 4] = color[0];
      out.colors[v * 4 + 1] = color[1];
      out.colors[v * 4 + 2] = color[2];
      out.colors[v * 4 + 3] = 1;
    }
  } else if (arrays.colors) {
    out.colors = arrays.colors.slice();
  }
  return out;
}

/** 複数の形を 1 つにまとめる */
export function mergeArrays(list) {
  const out = { positions: [], normals: [], indices: [], colors: [] };
  let base = 0;
  const withColors = list.every((a) => a.colors);
  for (const a of list) {
    out.positions.push(...a.positions);
    out.normals.push(...a.normals);
    if (withColors) out.colors.push(...a.colors);
    for (const idx of a.indices) out.indices.push(idx + base);
    base += a.positions.length / 3;
  }
  if (!withColors) delete out.colors;
  return out;
}

/**
 * 1 つの Mesh を、渡した変換行列の数だけ 1 回の描画命令で並べる
 * @param {pc.Mat4[]} matrices
 */
export function createInstancedEntity(app, name, mesh, material, matrices, { castShadows = true, receiveShadows = true } = {}) {
  const device = app.graphicsDevice;
  const data = new Float32Array(matrices.length * 16);
  matrices.forEach((m, i) => data.set(m.data, i * 16));

  const vb = new pc.VertexBuffer(device, pc.VertexFormat.getDefaultInstancingFormat(device), matrices.length, { data });
  const mi = new pc.MeshInstance(mesh, material);
  mi.setInstancing(vb); // 画面外判定はしない（森全体を 1 つの部品として常に描く）
  mi.instancingCount = matrices.length;
  sceneBudget.triangles += (mesh.primitive[0].count / 3) * matrices.length;
  sceneBudget.instances += matrices.length;

  // 全インスタンスを囲む箱。これが無いと、エンジンは原点の 1 本分の大きさしかないと判断し、
  // 太陽の影を落とす物の範囲から外してしまう（影が出ない）
  const local = mesh.aabb;
  const reach = local.center.length() + local.halfExtents.length();
  const min = new pc.Vec3(Infinity, Infinity, Infinity), max = new pc.Vec3(-Infinity, -Infinity, -Infinity);
  const t = new pc.Vec3();
  for (const m of matrices) {
    m.getTranslation(t);
    const s = m.getScale(new pc.Vec3());
    const r = reach * Math.max(s.x, s.y, s.z);
    min.set(Math.min(min.x, t.x - r), Math.min(min.y, t.y - r), Math.min(min.z, t.z - r));
    max.set(Math.max(max.x, t.x + r), Math.max(max.y, t.y + r), Math.max(max.z, t.z + r));
  }
  const box = new pc.BoundingBox();
  box.setMinMax(min, max);
  mi.setCustomAabb(box);

  const entity = new pc.Entity(name);
  entity.addComponent('render', {
    meshInstances: [mi],
    castShadows,
    receiveShadows,
  });
  app.root.addChild(entity);
  return entity;
}

/** 頂点色を使う、PBR の基本マテリアル */
export function createVertexColorMaterial({ roughness = 0.85, metalness = 0, doubleSided = false } = {}) {
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(1, 1, 1);
  m.diffuseVertexColor = true;
  // 頂点色は見た目の色（sRGB）で書いているので、エンジンにそう伝える（既定はリニア扱い）
  m.vertexColorGamma = true;
  m.useMetalness = true;
  m.metalness = metalness;
  m.gloss = 1 - roughness;
  if (doubleSided) m.cull = pc.CULLFACE_NONE;
  m.update();
  return m;
}
