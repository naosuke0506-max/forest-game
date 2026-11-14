// 川の水面と滝（見た目だけ。形は world/landform.js）。利用者の指示（2026-11-14）：マップを自然に（川・谷・山）
//   水面：川の線に沿った 1 つの形。幅は川の幅より少し広く（岸の土の下へ入れて、水際の継ぎ目を隠す）。水面の高さは下流ほど低い。
//         さざ波の絵（作った法線の絵）を流れの向きへ流す。空を映し、少し透ける。描画命令 1 つ
//   滝：落ち口から滝壺へ垂れる白い幕（筋の絵を下へ流す）と、滝壺の泡の輪。描画命令 2 つ
import * as pc from 'playcanvas';
import { sceneBudget } from '../core/mesh-utils.js';

/** 繰り返しても継ぎ目の出ない、さざ波の法線の絵（周期の合う波を重ねて作る） */
function rippleNormals(device, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const waves = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 14; k++) {
    const fx = Math.round((rnd() - 0.5) * 10), fz = Math.round(1 + rnd() * 8);   // 整数の回数で並べると、絵の端がつながる
    waves.push({ fx, fz, a: 1 / Math.hypot(fx, fz), p: rnd() * Math.PI * 2 });
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let dx = 0, dy = 0;
    for (const w of waves) {
      const t = 2 * Math.PI * (w.fx * x / size + w.fz * y / size) + w.p;
      const c0 = Math.cos(t) * w.a;
      dx += c0 * w.fx; dy += c0 * w.fz;
    }
    const nx = -dx * 0.12, ny = -dy * 0.12, l = Math.hypot(nx, ny, 1);
    const o = (y * size + x) * 4;
    img.data[o] = (nx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new pc.Texture(device, { name: 'water-ripple', width: size, height: size, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT });
  t.setSource(c);
  return t;
}

/** 滝の幕の絵：縦の白い筋（上下につながる）。白の濃さは透け具合 */
function streakTexture(device) {
  const W = 64, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, w = 0.6 + rnd() * 2.2, y = rnd() * H, len = 20 + rnd() * 60, a = 0.25 + rnd() * 0.55;
    for (const oy of [0, -H, H]) {   // 上下につながるように、はみ出た分を反対側にも描く
      const grad = g.createLinearGradient(0, y + oy, 0, y + oy + len);
      grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.3, `rgba(255,255,255,${a})`); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(x, y + oy, w, len);
    }
  }
  const t = new pc.Texture(device, { name: 'water-streak', width: W, height: H, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT });
  t.setSource(c);
  return t;
}

/** 滝壺の泡の絵：まだらな白い輪 */
function foamTexture(device) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 420; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.48 * S, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
    const fade = 1 - r / (0.48 * S);
    g.fillStyle = `rgba(255,255,255,${(0.08 + rnd() * 0.25) * fade})`;
    g.beginPath(); g.arc(x, y, 1.5 + rnd() * 5 * (0.4 + fade), 0, Math.PI * 2); g.fill();
  }
  const t = new pc.Texture(device, { name: 'water-foam', width: S, height: S, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR });
  t.setSource(c);
  return t;
}

const meshOf = (device, positions, normals, uvs, indices) => {
  const m = new pc.Mesh(device);
  m.setPositions(positions); m.setNormals(normals); m.setUvs(0, uvs); m.setIndices(indices);
  m.update(pc.PRIMITIVE_TRIANGLES);
  return m;
};

/**
 * @param {object} land world/landform.js
 */
export function createWater(app, land) {
  const device = app.graphicsDevice;
  const R = land.river;
  const P = R.points, S = R.s;
  let tris = 0;

  // ---- 水面 ----
  const ACROSS = [-1, -0.55, 0, 0.55, 1];
  const pos = [], nor = [], uv = [], idx = [];
  const stride = 2;   // 川の線の区切り 2 つごと（約 3 m）に、横に並べた 5 点
  let rows = 0;
  for (let i = 0; i < P.length; i += stride) {
    const j0 = Math.max(0, i - 1), j1 = Math.min(P.length - 1, i + 1);
    let tx = P[j1][0] - P[j0][0], tz = P[j1][1] - P[j0][1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;                          // 流れに直角（左）
    const s = S[i], hw = R.widthAt(s) / 2 + 2.2, y = R.levelAt(s);
    for (const a of ACROSS) {
      pos.push(P[i][0] + nx * hw * a, y, P[i][1] + nz * hw * a);
      nor.push(0, 1, 0);
      uv.push(a * hw / 6, s / 6);                     // 絵 1 枚が 6 m 四方
    }
    rows++;
  }
  const W = ACROSS.length;
  for (let r = 0; r < rows - 1; r++) for (let k = 0; k < W - 1; k++) {
    const a = r * W + k, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  tris += idx.length / 3;
  const ripple = rippleNormals(device);
  const mat = new pc.StandardMaterial();
  mat.diffuse = new pc.Color(0.035, 0.075, 0.08);
  mat.useMetalness = true; mat.metalness = 0; mat.gloss = 0.88;
  mat.normalMap = ripple; mat.bumpiness = 0.55;
  mat.normalDetailMap = ripple; mat.normalDetailMapTiling = new pc.Vec2(2.7, 2.3); mat.normalDetailMapBumpiness = 0.5;
  mat.opacity = 0.8;
  mat.blendType = pc.BLEND_NORMAL;
  mat.depthWrite = false;
  mat.cull = pc.CULLFACE_NONE;
  mat.update();
  const surf = new pc.Entity('river');
  surf.addComponent('render', { meshInstances: [new pc.MeshInstance(meshOf(device, pos, nor, uv, idx), mat)], castShadows: false, receiveShadows: true });
  app.root.addChild(surf);

  // ---- 滝の幕：落ち口の少し手前から、滝壺の水面まで。流れの向きへ少しせり出して垂れる ----
  const F = R.fall;
  const fallMat = new pc.StandardMaterial();
  fallMat.diffuse = new pc.Color(0.82, 0.86, 0.88);
  fallMat.emissive = new pc.Color(0.32, 0.35, 0.38);
  const streak = streakTexture(device);
  fallMat.opacityMap = streak; fallMat.opacityMapChannel = 'a';
  fallMat.diffuseMap = streak;
  fallMat.blendType = pc.BLEND_NORMAL;
  fallMat.depthWrite = false;
  fallMat.cull = pc.CULLFACE_NONE;
  fallMat.update();
  {
    const fp = [], fn = [], fu = [], fi = [];
    const nx = -F.dz, nz = F.dx, hw = F.width / 2 + 0.6, ROWS = 10;
    for (let r = 0; r <= ROWS; r++) {
      const t = r / ROWS;
      const out = -0.6 + 1.8 * Math.sin(t * Math.PI * 0.5) ** 0.7;   // 上は落ち口の手前、下ほど前へせり出す
      const y = F.top + 0.05 + (F.bottom - F.top - 0.05) * t;
      for (const a of [-1, -0.5, 0, 0.5, 1]) {
        fp.push(F.x + F.dx * out + nx * hw * a * (1 + t * 0.25), y, F.z + F.dz * out + nz * hw * a * (1 + t * 0.25));
        fn.push(F.dx, 0, F.dz);
        fu.push(a * 1.3, t * 2.2);
      }
    }
    for (let r = 0; r < ROWS; r++) for (let k = 0; k < 4; k++) { const a = r * 5 + k; fi.push(a, a + 5, a + 1, a + 1, a + 5, a + 6); }
    tris += fi.length / 3;
    const e = new pc.Entity('waterfall');
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(meshOf(device, fp, fn, fu, fi), fallMat)], castShadows: false, receiveShadows: false });
    app.root.addChild(e);
  }

  // ---- 滝壺の泡：滝の下の水面に、ゆっくり回る白い輪 ----
  const foamMat = new pc.StandardMaterial();
  const foamTex = foamTexture(device);
  foamMat.diffuse = new pc.Color(0.9, 0.93, 0.95);
  foamMat.emissive = new pc.Color(0.25, 0.27, 0.3);
  foamMat.opacityMap = foamTex; foamMat.opacityMapChannel = 'a';
  foamMat.blendType = pc.BLEND_NORMAL;
  foamMat.depthWrite = false;
  foamMat.update();
  const foam = new pc.Entity('waterfall-foam');
  {
    const fp = [], fn = [], fu = [], fi = [], SEG = 20;
    fp.push(0, 0, 0); fn.push(0, 1, 0); fu.push(0.5, 0.5);
    for (let k = 0; k <= SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      fp.push(Math.cos(a), 0, Math.sin(a)); fn.push(0, 1, 0); fu.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      if (k) fi.push(0, k + 1, k);
    }
    tris += fi.length / 3;
    foam.addComponent('render', { meshInstances: [new pc.MeshInstance(meshOf(device, fp, fn, fu, fi), foamMat)], castShadows: false, receiveShadows: false });
    foam.setPosition(F.x + F.dx * 1.8, F.bottom + 0.04, F.z + F.dz * 1.8);
    foam.setLocalScale(F.width * 0.95, 1, F.width * 0.95);
    app.root.addChild(foam);
  }
  sceneBudget.triangles += tris;

  let t = 0, foamYaw = 0;
  return {
    /** 滝の位置（音の出どころ。audio/ambience.js） */
    fall: { x: F.x, y: (F.top + F.bottom) / 2, z: F.z },
    /** 毎フレーム：さざ波と滝の筋を流す */
    update(dt) {
      t += dt;
      mat.normalMapOffset.set(0, -t * 0.16);
      mat.normalDetailMapOffset.set(t * 0.02, -t * 0.26);
      mat.update();
      fallMat.diffuseMapOffset.set(0, -t * 1.1);
      fallMat.opacityMapOffset.set(0, -t * 1.1);
      fallMat.update();
      foamYaw += dt * 9;
      foam.setLocalEulerAngles(0, foamYaw, 0);
    },
    triangles: tris,
  };
}
