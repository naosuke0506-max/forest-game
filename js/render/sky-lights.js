// 空の光：太陽と月の円盤、木漏れ日の光の筋（光芒）。
//   太陽・月：光の来る向きの遠く（空の手前）に、カメラを向いた板を置く。木に隠れると見えなくなる（深さで判定）。
//     太陽は白く輝く円と、周りの柔らかい光の暈（かさ）。月は模様のある円と、小さな淡い暈
//   光の筋：森の中で、木の葉の間から地面へ差す細長い光の帯。葉の近くを通る所にだけ出る（空が開けた所には出ない）。
//     太陽の方を向くほど濃く見える（光は前へ散るため）。ゆっくり明滅し、しばらくすると別の場所へ移る
// どれも光を足すだけの板（加算）で、影や霧の計算をしないので軽い。強さは時間帯の fx（world/time-of-day.js）で決まる
import * as pc from 'playcanvas';
import { fbm } from '../core/random.js';

/** キャンバスに描いた絵から、明るさの画像を作る */
function canvasTexture(device, size, draw, name) {
  const c = document.createElement('canvas');
  c.width = size[0]; c.height = size[1];
  draw(c.getContext('2d'), c.width, c.height);
  const t = new pc.Texture(device, {
    name, width: c.width, height: c.height, format: pc.PIXELFORMAT_RGBA8, srgb: false, mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  t.setSource(c);
  return t;
}

/** 太陽：中心の白い円（縁はなめらか）と、外へ弱まっていく光の暈 */
function drawSun(g, w, h) {
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = Math.hypot(x - w / 2 + 0.5, y - h / 2 + 0.5) / (w / 2);
    const disc = 1 - Math.min(1, Math.max(0, (r - 0.045) / 0.012));
    const glow = Math.exp(-r * 9) * 0.55 + Math.exp(-r * 3.2) * 0.22 * (1 - r);
    const v = Math.min(1, disc + Math.max(0, glow));
    const i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * v); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
/** 月：まだら模様のある円と、淡い暈 */
function drawMoon(g, w, h) {
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - w / 2 + 0.5) / (w / 2), dy = (y - h / 2 + 0.5) / (h / 2), r = Math.hypot(dx, dy);
    const R = 0.18;
    const disc = 1 - Math.min(1, Math.max(0, (r - R) / 0.015));
    const mare = 0.78 + 0.22 * fbm(dx * 9 + 3, dy * 9 + 7, 5) - 0.18 * Math.max(0, fbm(dx * 4, dy * 4, 9) - 0.5);
    const limb = Math.sqrt(Math.max(0, 1 - (r / R) * (r / R))) * 0.25 + 0.75;   // 縁が少し暗い
    const glow = Math.exp(-Math.max(0, r - R) * 14) * 0.18;
    const v = Math.min(1, disc * mare * limb + (1 - disc) * glow);
    const i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * v); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
/** 光の筋：横はなめらかな山形、縦は上下の端で消える。細い筋を何本か重ねる */
function drawShaft(g, w, h) {
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w * 2 - 1, v = (y + 0.5) / h;
    const across = Math.exp(-u * u * 3.2) * (0.75 + 0.25 * Math.sin(u * 9.0 + 1.3) * Math.sin(u * 5.3));
    const along = Math.min(1, v / 0.25) * Math.min(1, (1 - v) / 0.45);
    const val = Math.max(0, across * along * along);
    const i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * val); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

function glowMaterial(tex) {
  const m = new pc.StandardMaterial();
  m.useLighting = false;
  m.useFog = false;
  m.useSkybox = false;
  m.diffuse = new pc.Color(0, 0, 0);
  m.emissive = new pc.Color(1, 1, 1);
  m.emissiveMap = tex;
  m.blendType = pc.BLEND_ADDITIVE;
  m.depthWrite = false;
  m.cull = pc.CULLFACE_NONE;
  m.update();
  return m;
}

/** 四角の板（XY 平面、+Z を向く。中心が原点、一辺 1） */
function quadMesh(device) {
  const mesh = new pc.Mesh(device);
  mesh.setPositions([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
  mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
  mesh.setIndices([0, 1, 2, 0, 2, 3]);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return mesh;
}

/**
 * @param {pc.Entity} camera
 * @param {pc.Entity} sun 太陽（深夜は月）の光。光は -Y へ進むので、空の光のある向きは +Y
 * @param {object} timeOfDay world/time-of-day.js（fx：飾りの強さ）
 * @param {{ canopies: {x,y,z,r}[], heightAt: Function, zones: object }} world
 */
export function createSkyLights(app, camera, sun, timeOfDay, { canopies = [], heightAt, zones = null, farClip = 160 }) {
  const device = app.graphicsDevice;
  const D = farClip * 0.82;                 // 円盤を置く遠さ（空のドームより手前、描く木より奥）

  // ===== 太陽と月の円盤 =====
  const sunMat = glowMaterial(canvasTexture(device, [256, 256], drawSun, 'sun-disc'));
  const moonMat = glowMaterial(canvasTexture(device, [256, 256], drawMoon, 'moon-disc'));
  const q = quadMesh(device);
  const disc = (mat, name) => {
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(q, mat)], castShadows: false, receiveShadows: false });
    app.root.addChild(e);
    return e;
  };
  const sunDisc = disc(sunMat, 'sun-disc');
  const moonDisc = disc(moonMat, 'moon-disc');
  const sunSize = 2 * D * Math.tan((13 * Math.PI) / 180);    // 暈まで含めた板の大きさ（見た目で約 26 度）
  const moonSize = 2 * D * Math.tan((4.5 * Math.PI) / 180);

  // ===== 光の筋 =====
  const N = 18;
  const shafts = [];
  const shaftMat = glowMaterial(canvasTexture(device, [64, 256], drawShaft, 'light-shaft'));
  const pos = new Float32Array(N * 4 * 3);
  const uvs = [], idx = [];
  for (let i = 0; i < N; i++) {
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  // 筋ごとの明るさは頂点色で（加算なので、色が暗いほど薄い）
  const cols = new Float32Array(N * 4 * 4);
  const shaftMesh = new pc.Mesh(device);
  shaftMesh.setPositions(pos);
  shaftMesh.setUvs(0, uvs);
  shaftMesh.setColors(cols);
  shaftMesh.setIndices(idx);
  shaftMesh.update(pc.PRIMITIVE_TRIANGLES);
  shaftMat.emissiveVertexColor = true;
  shaftMat.update();
  const shaftMi = new pc.MeshInstance(shaftMesh, shaftMat);
  shaftMi.cull = false;   // 位置は毎回変わるので、画面外の判定はしない
  const shaftEnt = new pc.Entity('light-shafts');
  shaftEnt.addComponent('render', { meshInstances: [shaftMi], castShadows: false, receiveShadows: false });
  app.root.addChild(shaftEnt);

  /** 地点から太陽の向きへ伸ばした線の近くに、木の葉があるか（あれば、その高さ。無ければ null） */
  function canopyOnRay(x, y, z, d) {
    let best = null;
    for (const c of canopies) {
      if (Math.abs(c.x - x) > 55 || Math.abs(c.z - z) > 55) continue;
      const px = c.x - x, py = c.y - y, pz = c.z - z;
      const t = px * d.x + py * d.y + pz * d.z;
      if (t < 3 || t > 55) continue;   // 朝と夕方は太陽が低いので、葉まで遠い
      const d2 = px * px + py * py + pz * pz - t * t;
      // 葉の縁の近く（葉の中を通る線は、光が通らないので除く）
      if (d2 < (c.r * 1.9) ** 2 && d2 > (c.r * 0.6) ** 2 && (best === null || t < best)) best = t;
    }
    return best;
  }
  const sunDir = new pc.Vec3(), discDir = new pc.Vec3(), cam = new pc.Vec3(), tmp = new pc.Vec3(), right = new pc.Vec3(), toCam = new pc.Vec3();
  function respawn(s, first) {
    s.active = false;
    s.timer = first ? Math.random() * 3 : 0.5 + Math.random() * 2;
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 26;
      const x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
      const w = zones ? zones.weights(x, z) : { mixed: 1, deep: 0 };
      const forest = (w.mixed || 0) * 0.8 + (w.deep || 0);
      if (forest < 0.3) continue;
      const y = heightAt(x, z);
      const len = canopyOnRay(x, y, z, sunDir);
      if (!len) continue;
      Object.assign(s, {
        active: true, x, y: y - 0.2, z, len: Math.min(26, len + 2), width: 0.4 + Math.random() * 1.2,
        life: 0, span: 8 + Math.random() * 10, phase: Math.random() * 10, strength: forest * (0.5 + Math.random() * 0.5),
      });
      return;
    }
  }
  for (let i = 0; i < N; i++) shafts.push({ active: false, timer: 0 });
  let t = 0, inited = false;

  return {
    /** 確認用：今出ている光の筋の数と、いちばん濃い筋の濃さ */
    get shaftInfo() { return { active: shafts.filter((s) => s.active).length, max: Math.max(...Array.from(cols).filter((_, i) => i % 4 === 0)) }; },
    update(dt) {
      t += dt;
      const fx = timeOfDay.fx;
      cam.copy(camera.getPosition());
      sunDir.copy(sun.up).normalize();
      const lc = sun.light.color;
      const fwd = camera.forward;
      const facing = Math.max(0, fwd.x * sunDir.x + fwd.y * sunDir.y + fwd.z * sunDir.z);

      // 円盤：空の写真の中の太陽（月）の向きの遠くに、カメラを向けて置く（写真の光の暈と重なるように）
      discDir.copy(timeOfDay.skyDir ?? sunDir);
      const above = Math.min(1, Math.max(0, (discDir.y + 0.03) / 0.06));
      sunDisc.enabled = fx.sun > 0.01 && above > 0;
      if (sunDisc.enabled) {
        tmp.copy(discDir).mulScalar(D).add(cam);
        sunDisc.setPosition(tmp); sunDisc.lookAt(cam); sunDisc.setLocalScale(sunSize, sunSize, 1);
        const g = timeOfDay.glare.color;
        sunMat.emissive.set(g[0], g[1], g[2]);
        sunMat.emissiveIntensity = 3.2 * fx.sun * above;
        sunMat.update();
      }
      moonDisc.enabled = fx.moon > 0.01 && above > 0;
      if (moonDisc.enabled) {
        tmp.copy(discDir).mulScalar(D).add(cam);
        moonDisc.setPosition(tmp); moonDisc.lookAt(cam); moonDisc.setLocalScale(moonSize, moonSize, 1);
        moonMat.emissive.set(0.86, 0.9, 1.0);
        moonMat.emissiveIntensity = 1.6 * fx.moon;
        moonMat.update();
      }

      // 光の筋
      const on = fx.shafts > 0.01 && sunDir.y > 0.08;
      shaftEnt.enabled = on;
      if (!on) { inited = false; return; }
      if (!inited) { for (const s of shafts) respawn(s, true); inited = true; }
      for (let i = 0; i < N; i++) {
        const s = shafts[i];
        let k = 0;
        if (!s.active) {
          s.timer -= dt;
          if (s.timer <= 0) respawn(s, false);
        } else {
          s.life += dt;
          const dist = Math.hypot(s.x - cam.x, s.z - cam.z);
          if (s.life > s.span || dist > 34) respawn(s, false);
          else {
            const fade = Math.min(1, s.life / 2) * Math.min(1, (s.span - s.life) / 2);
            const flicker = 0.7 + 0.3 * Math.sin(t * 0.9 + s.phase) * Math.sin(t * 0.37 + s.phase * 2);
            const near = Math.min(1, Math.max(0, (dist - 3) / 6));   // すぐそばの筋は薄く（目の前に光の板が見えないように）
            k = fx.shafts * s.strength * fade * flicker * near * (0.35 + 0.65 * facing * facing);
          }
        }
        // 板の 4 隅：根元（地面）と先（葉の所）、カメラに向けて横に広げる
        const bx = s.x ?? 0, by = s.y ?? 0, bz = s.z ?? 0, L = s.len ?? 1, hw = (s.width ?? 1) / 2;
        const tx = bx + sunDir.x * L, ty = by + sunDir.y * L, tz = bz + sunDir.z * L;
        toCam.set(cam.x - (bx + tx) / 2, cam.y - (by + ty) / 2, cam.z - (bz + tz) / 2);
        right.cross(sunDir, toCam).normalize().mulScalar(hw);
        const o = i * 12;
        pos[o] = bx - right.x; pos[o + 1] = by - right.y; pos[o + 2] = bz - right.z;
        pos[o + 3] = bx + right.x; pos[o + 4] = by + right.y; pos[o + 5] = bz + right.z;
        pos[o + 6] = tx + right.x; pos[o + 7] = ty + right.y; pos[o + 8] = tz + right.z;
        pos[o + 9] = tx - right.x; pos[o + 10] = ty - right.y; pos[o + 11] = tz - right.z;
        const a = k * 0.42;
        for (let v = 0; v < 4; v++) {
          cols[(i * 4 + v) * 4] = lc.r * a; cols[(i * 4 + v) * 4 + 1] = lc.g * a * 0.97; cols[(i * 4 + v) * 4 + 2] = lc.b * a * 0.9; cols[(i * 4 + v) * 4 + 3] = 1;
        }
      }
      shaftMesh.setPositions(pos);
      shaftMesh.setColors(cols);
      shaftMesh.update(pc.PRIMITIVE_TRIANGLES);
    },
  };
}
