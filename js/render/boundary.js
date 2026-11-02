// 歩ける範囲の境界：うっすら光る円い壁。フェーズが進むと外へ広がる
// （形は円周に沿った帯。半径が変わったときだけ頂点を作り直す）
import * as pc from 'playcanvas';

export function createBoundary(app, terrain) {
  const SEG = 96, HEIGHT = 4;
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    positions.push(Math.cos(a), 0, Math.sin(a), Math.cos(a), 1, Math.sin(a));
    uvs.push(i / SEG * 24, 0, i / SEG * 24, 1);
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const mesh = new pc.Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.setUvs(0, uvs);
  mesh.setIndices(indices);
  mesh.update();

  // 下ほど濃く、上ほど薄くなる光の帯（縦のグラデーションを小さな画像で作る）
  const W = 4, H = 32, pixels = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const alpha = Math.round(255 * Math.pow(1 - t, 2.2) * 0.55);
    for (let x = 0; x < W; x++) pixels.set([150, 205, 255, alpha], (y * W + x) * 4);
  }
  const tex = new pc.Texture(app.graphicsDevice, {
    width: W, height: H, format: pc.PIXELFORMAT_RGBA8, mipmaps: false,
    addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_CLAMP_TO_EDGE, levels: [pixels],
  });

  const mat = new pc.StandardMaterial();
  mat.diffuse = new pc.Color(0, 0, 0);
  mat.emissive = new pc.Color(0.45, 0.75, 1.0);
  mat.emissiveIntensity = 0.8;    // 加算で重ねるので控えめに（強いと白い壁に見える）
  mat.opacityMap = tex;
  mat.opacityMapChannel = 'a';
  mat.blendType = pc.BLEND_ADDITIVEALPHA; // 透明度を掛けてから足す（BLEND_ADDITIVE は透明度を使わない）
  mat.depthWrite = false;
  mat.cull = pc.CULLFACE_NONE;
  mat.useFog = false;            // 加算に霧の色まで足されると白く浮くので、霧は掛けない
  mat.update();

  const entity = new pc.Entity('Boundary');
  entity.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], castShadows: false, receiveShadows: false });
  app.root.addChild(entity);

  let shownRadius = -1;
  return {
    /** 半径を合わせる。壁の下端を、円周の各地点の地面の高さに沿わせる（起伏に埋もれないように） */
    update(dt, radius) {
      if (Math.abs(radius - shownRadius) < 0.01) return;
      shownRadius = radius;
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
        const y = terrain.heightAt(x, z) - 0.5;
        positions[i * 6] = x; positions[i * 6 + 1] = y; positions[i * 6 + 2] = z;
        positions[i * 6 + 3] = x; positions[i * 6 + 4] = y + HEIGHT; positions[i * 6 + 5] = z;
      }
      mesh.setPositions(positions);
      mesh.update();
    },
  };
}
