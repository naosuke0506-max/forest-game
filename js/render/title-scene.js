// 題の画面の背景（3D）：どの時代にも寄らない「時の輪」。暗い空間に、刻み目のある巨大な石の輪が三重に浮かび、
//   それぞれ別の向きにゆっくり回る（時計や天球儀のよう。時代を超えて戦う場）。中心に光る核、周りを漂う岩のかけら、舞い上がる火の粉
//   大廳（render/hall.js）と同じく、森とは別の層（Title）に作り、このカメラだけが描く（森の空・霧・光は入らない）
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { SURFACES, builder, box } from '../world/build-kit.js';
import { loadTextureSet } from '../world/materials.js';
import { createRandom } from '../core/random.js';

const ORIGIN = [0, -800, 0];   // 森とも大廳とも離れた所（描くのはこのカメラだけ）
const AMBIENT = [0.06, 0.06, 0.09];

/** 円い光の絵（中心が明るく、外へ透明に） */
function radialTexture(device, stops, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new pc.Texture(device, { width: size, height: size, format: pc.PIXELFORMAT_RGBA8, mipmaps: true });
  t.setSource(c);
  return t;
}
/** 遠くの空：暗い藍の雲と、小さな星 */
function skyTexture(device, rnd) {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#040508'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {   // 雲
    const x = rnd.next() * S, y = rnd.next() * S, r = 60 + rnd.next() * 170;
    const hue = rnd.next() < 0.5 ? '30,46,92' : rnd.next() < 0.5 ? '70,34,82' : '20,70,80';
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${hue},${0.10 + rnd.next() * 0.12})`);
    grd.addColorStop(1, `rgba(${hue},0)`);
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  }
  for (let i = 0; i < 420; i++) {   // 星
    const b = rnd.next(), a = 0.25 + b * 0.75;
    g.fillStyle = `rgba(${220 + b * 35},${215 + b * 30},${200 + b * 40},${a})`;
    const s = b > 0.96 ? 2 : 1;
    g.fillRect(rnd.next() * S, rnd.next() * S, s, s);
  }
  const t = new pc.Texture(device, { width: S, height: S, format: pc.PIXELFORMAT_RGBA8, mipmaps: true });
  t.setSource(c);
  return t;
}
function glowMaterial(tex, color = [1, 1, 1]) {
  const m = new pc.StandardMaterial();
  m.useLighting = false; m.useSkybox = false; m.useFog = false;
  m.emissiveMap = tex; m.emissive = new pc.Color(...color);
  m.opacityMap = tex; m.opacityMapChannel = 'a';
  m.blendType = pc.BLEND_ADDITIVE; m.depthWrite = false; m.cull = pc.CULLFACE_NONE;
  m.diffuse = new pc.Color(0, 0, 0);
  m.update();
  return m;
}
function stoneMaterial() {
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(1, 1, 1);
  m.diffuseVertexColor = true; m.vertexColorGamma = true;
  m.useMetalness = true; m.metalness = 0; m.gloss = 0.3;
  m.cull = pc.CULLFACE_NONE;
  m.useSkybox = false; m.useFog = false;
  m.ambient = new pc.Color(...AMBIENT);
  m.update();
  return m;
}

/**
 * 刻み目のある石の輪（XZ の面に作る。回す軸は Y）
 * @param {number} r 半径、@param {number} wid 輪の幅（半径の向き）、@param {number} h 厚み、@param {number} n 区切りの数
 */
function ringParts(B, r, wid, h, n, teeth) {
  const da = (Math.PI * 2) / n, seg = r * da * 0.94;
  for (let i = 0; i < n; i++) {
    const a = i * da, deg = (a * 180) / Math.PI;
    const cx = Math.sin(a) * r, cz = Math.cos(a) * r;
    box(B, 'stone', cx, -h / 2, cz, seg, wid, h, deg, { shade: 0.62 + 0.18 * ((i * 7) % 5) / 4, bottom: true });
    if (teeth && i % teeth === 0) {   // 外へ突き出た歯（時計の目盛りのよう）
      const ro = r + wid / 2 + 0.16;
      box(B, 'stone', Math.sin(a) * ro, -h * 0.3, Math.cos(a) * ro, seg * 0.45, 0.32, h * 0.6, deg, { shade: 0.5, bottom: true });
    }
  }
}
/** 輪の表に刻んだ、光る印（金色に光る小さな板） */
function runeParts(B, r, h, n, every) {
  const da = (Math.PI * 2) / n;
  for (let i = 0; i < n; i += every) {
    const a = i * da + da / 2, deg = (a * 180) / Math.PI;
    box(B, 'cloth', Math.sin(a) * r, h / 2, Math.cos(a) * r, r * da * 0.5, 0.06, 0.012, deg, { shade: [1, 0.78, 0.36], bottom: true });
  }
}

export function createTitleScene(app, config) {
  const device = app.graphicsDevice;
  const layer = new pc.Layer({ name: 'Title' });
  app.scene.layers.push(layer);
  const L = [layer.id];
  const rnd = createRandom(4242);
  const root = new pc.Entity('title-scene');
  root.setPosition(...ORIGIN);
  app.root.addChild(root);
  const stone = stoneMaterial();
  const runeMat = new pc.StandardMaterial();
  runeMat.useLighting = false; runeMat.useSkybox = false; runeMat.useFog = false;
  runeMat.emissive = new pc.Color(1, 0.72, 0.3); runeMat.emissiveVertexColor = false; runeMat.diffuse = new pc.Color(0, 0, 0);
  runeMat.update();
  loadTextureSet(device, SURFACES.stone.id, config.quality).then((t) => {
    if (!t) return;
    stone.diffuseMap = t.diffuse; stone.normalMap = t.normal;
    stone.aoMap = t.arm; stone.aoMapChannel = 'r';
    stone.glossMap = t.arm; stone.glossMapChannel = 'g'; stone.glossInvert = true; stone.gloss = 1;
    stone.update();
  });
  const meshOf = (fill, surf) => { const B = builder(); fill(B); return createMesh(device, B.parts[surf]); };
  const add = (name, mesh, mat, parent = root, shadows = false) => {
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], castShadows: shadows, receiveShadows: false, layers: L });
    parent.addChild(e);
    sceneBudget.triangles += mesh.primitive[0].count / 3;
    return e;
  };

  // ---- 遠くの空 ----
  const sky = new pc.Entity('title-sky');
  sky.addComponent('render', { type: 'plane', material: glowMaterial(skyTexture(device, rnd), [0.9, 0.9, 1]), castShadows: false, receiveShadows: false, layers: L });
  sky.setLocalPosition(0, 0, -40);
  sky.setLocalEulerAngles(90, 0, 0);
  sky.setLocalScale(130, 1, 130);
  root.addChild(sky);

  // ---- 時の輪（三重）：輪ごとに傾きと回る速さを変える ----
  const rings = [];
  const ringDefs = [
    { r: 6.4, wid: 0.62, h: 0.55, n: 72, teeth: 3, runes: 6, tilt: [78, 0, 8], spin: 4.5 },
    { r: 4.8, wid: 0.46, h: 0.42, n: 56, teeth: 4, runes: 4, tilt: [62, 30, -14], spin: -7 },
    { r: 3.3, wid: 0.34, h: 0.32, n: 40, teeth: 0, runes: 2, tilt: [96, -24, 20], spin: 11 },
  ];
  for (const d of ringDefs) {
    const pivot = new pc.Entity('ring');
    pivot.setLocalEulerAngles(...d.tilt);
    root.addChild(pivot);
    const spin = new pc.Entity();
    pivot.addChild(spin);
    add('ring-stone', meshOf((B) => ringParts(B, d.r, d.wid, d.h, d.n, d.teeth), 'stone'), stone, spin);
    add('ring-runes', meshOf((B) => runeParts(B, d.r, d.h, d.n, d.runes), 'cloth'), runeMat, spin);
    rings.push({ spin, speed: d.spin, wobble: rnd.next() * 6 });
  }

  // ---- 中心の核：光る玉と、大きな光の輪、ゆっくり回る光の筋 ----
  const coreMat = new pc.StandardMaterial();
  coreMat.useLighting = false; coreMat.useSkybox = false; coreMat.useFog = false;
  coreMat.emissive = new pc.Color(0.95, 0.68, 0.38); coreMat.diffuse = new pc.Color(0, 0, 0);
  coreMat.update();
  const core = new pc.Entity('core');
  core.addComponent('render', { type: 'sphere', material: coreMat, castShadows: false, receiveShadows: false, layers: L });
  core.setLocalScale(0.55, 0.55, 0.55);
  root.addChild(core);
  const glowTex = radialTexture(device, [[0, 'rgba(255,214,160,0.7)'], [0.15, 'rgba(240,150,80,0.32)'], [0.5, 'rgba(160,70,40,0.08)'], [1, 'rgba(0,0,0,0)']], 256);
  const glow = new pc.Entity('core-glow');
  glow.addComponent('render', { type: 'plane', material: glowMaterial(glowTex), castShadows: false, receiveShadows: false, layers: L });
  glow.setLocalEulerAngles(90, 0, 0);
  glow.setLocalScale(7, 1, 7);
  glow.setLocalPosition(0, 0, 0.6);
  root.addChild(glow);
  const rayTex = (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 256;
    const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, 'rgba(255,220,160,0)'); grd.addColorStop(0.5, 'rgba(255,214,150,0.1)'); grd.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 16, 256);
    const t = new pc.Texture(device, { width: 16, height: 256, format: pc.PIXELFORMAT_RGBA8 }); t.setSource(c); return t;
  })();
  const rays = new pc.Entity('rays');
  root.addChild(rays);
  const rayMat = glowMaterial(rayTex, [0.55, 0.46, 0.34]);
  for (let i = 0; i < 6; i++) {
    // 光の筋：画面に平行な面の中で、核を通る線（回す入れ物 → 立てた細長い板）
    const holder = new pc.Entity();
    holder.setLocalEulerAngles(0, 0, i * (180 / 6) + rnd.next() * 12);
    holder.setLocalPosition(0, 0, 0.3);
    const r = new pc.Entity();
    r.addComponent('render', { type: 'plane', material: rayMat, castShadows: false, receiveShadows: false, layers: L });
    r.setLocalEulerAngles(90, 0, 0);
    r.setLocalScale(0.05 + rnd.next() * 0.12, 1, 26 + rnd.next() * 10);
    holder.addChild(r);
    rays.addChild(holder);
  }
  // 核の光：輪の内側を照らす暖かい光と、手前から輪郭を浮かせる冷たい光
  const light = new pc.Entity('core-light');
  light.addComponent('light', { type: 'omni', color: new pc.Color(1, 0.72, 0.42), intensity: 2.2, range: 14, castShadows: false, layers: L });
  root.addChild(light);
  const cool = new pc.Entity('title-cool');
  cool.addComponent('light', { type: 'directional', color: new pc.Color(0.45, 0.55, 0.85), intensity: 0.35, castShadows: false, layers: L });
  cool.setLocalEulerAngles(40, 30, 0);
  root.addChild(cool);

  // ---- 漂う岩のかけら ----
  const shardMesh = (() => { const B = builder(); box(B, 'stone', 0, -0.5, 0, 1, 1, 1, 0, { bottom: true, shade: 0.55 }); return createMesh(device, B.parts.stone); })();
  const shards = [];
  for (let i = 0; i < 34; i++) {
    const e = new pc.Entity('shard');
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(shardMesh, stone)], castShadows: false, receiveShadows: false, layers: L });
    const s = 0.12 + rnd.next() ** 2 * 0.7;
    e.setLocalScale(s * (0.6 + rnd.next()), s * (0.5 + rnd.next()), s * (0.6 + rnd.next()));
    root.addChild(e);
    shards.push({ e, r: 7.5 + rnd.next() * 8, a: rnd.next() * Math.PI * 2, y: (rnd.next() - 0.5) * 9, z: -2 - rnd.next() * 10, w: (0.02 + rnd.next() * 0.05) * (rnd.next() < 0.5 ? -1 : 1), spin: [rnd.next() * 30, rnd.next() * 30, rnd.next() * 30] });
  }
  sceneBudget.triangles += 12 * shards.length;

  // ---- 舞い上がる火の粉 ----
  const emberMat = new pc.StandardMaterial();
  emberMat.useLighting = false; emberMat.useSkybox = false; emberMat.useFog = false;
  emberMat.emissive = new pc.Color(1, 0.62, 0.22); emberMat.diffuse = new pc.Color(0, 0, 0);
  emberMat.blendType = pc.BLEND_ADDITIVE; emberMat.depthWrite = false;
  emberMat.update();
  const embers = [];
  for (let i = 0; i < 90; i++) {
    const e = new pc.Entity('ember');
    e.addComponent('render', { type: 'box', material: emberMat, castShadows: false, receiveShadows: false, layers: L });
    const s = 0.025 + rnd.next() * 0.04;
    e.setLocalScale(s, s, s);
    root.addChild(e);
    embers.push({ e, x: (rnd.next() - 0.5) * 22, y: (rnd.next() - 0.5) * 14, z: -6 + rnd.next() * 12, v: 0.3 + rnd.next() * 0.6, ph: rnd.next() * 6 });
  }

  // ---- 時計の針：題の曲の時計の刻みに合わせて 1 拍ずつ進み（8 拍で一周）、鐘の鳴る拍で一周して光る ----
  const handMat = new pc.StandardMaterial();
  handMat.useLighting = false; handMat.useSkybox = false; handMat.useFog = false;
  handMat.emissive = new pc.Color(1, 0.78, 0.4); handMat.diffuse = new pc.Color(0, 0, 0);
  handMat.update();
  const hand = new pc.Entity('clock-hand');
  hand.setLocalPosition(0, 0, 0.9);
  root.addChild(hand);
  const handMesh = (() => {
    const B = builder();
    box(B, 'cloth', 0, 0, 0, 0.22, 0.05, 4.9, 0, { shade: [1, 1, 1], bottom: true });           // 長い針（上へ伸びる）
    box(B, 'cloth', 0, -1.5, 0, 0.36, 0.06, 1.5, 0, { shade: [1, 1, 1], bottom: true });        // 反対側のおもり
    return createMesh(device, B.parts.cloth);
  })();
  const handBody = new pc.Entity();
  handBody.addComponent('render', { meshInstances: [new pc.MeshInstance(handMesh, handMat)], castShadows: false, receiveShadows: false, layers: L });
  hand.addChild(handBody);   // 箱の高さ（Y）が画面の上。針の面は画面に平行（カメラは -Z を見る）
  // 針の先の矢じり（平たい円錐）と、中心の丸い軸
  const tip = new pc.Entity();
  tip.addComponent('render', { type: 'cone', material: handMat, castShadows: false, receiveShadows: false, layers: L });
  tip.setLocalPosition(0, 5.25, 0);
  tip.setLocalScale(0.62, 0.75, 0.08);
  hand.addChild(tip);
  const hub = new pc.Entity();
  hub.addComponent('render', { type: 'cylinder', material: handMat, castShadows: false, receiveShadows: false, layers: L });
  hub.setLocalEulerAngles(90, 0, 0);
  hub.setLocalScale(0.85, 0.1, 0.85);
  hand.addChild(hub);
  let lastStep = null, flash = 0;
  /** 拍（小数）から針の角度：拍の始めにすばやく進み（0.08 拍で）、あとは止まる。8 拍で一周 */
  const handAngle = (beat) => {
    const step = Math.floor(beat), frac = beat - step;
    const k = Math.min(1, frac / 0.08);
    return -((step + (1 - (1 - k) ** 3)) * 45);
  };

  // ---- カメラ ----
  const cam = new pc.Entity('title-camera');
  cam.addComponent('camera', {
    fov: 50, nearClip: 0.1, farClip: 120, layers: L,
    clearColor: new pc.Color(0.012, 0.014, 0.024),
    toneMapping: pc.TONEMAP_ACES, gammaCorrection: pc.GAMMA_SRGB,
  });
  root.addChild(cam);
  const look = new pc.Vec3();

  let active = false, time = 0, beatOf = null;
  return {
    /** 時計の針の拍を受け取る（題の曲が流れていれば、その拍。無ければ 120 拍で自分で進む） */
    setBeatSource(fn) { beatOf = fn; },
    get active() { return active; },
    /** 題の画面の背景を出す（このカメラで描く）・しまう */
    setActive(v, otherCameras = []) {
      active = v;
      root.enabled = v;
      for (const c of otherCameras) if (c) c.enabled = !v;
    },
    update(dt) {
      if (!active) return;
      time += dt;
      for (const r of rings) r.spin.rotateLocal(0, r.speed * dt, 0);
      rays.setLocalEulerAngles(0, 0, time * 3);
      // 時計の針：曲の拍に合わせて進め、鐘の鳴る拍（8 拍ごと）で一周したら光る
      const beat = beatOf?.() ?? time * 2;
      hand.setLocalEulerAngles(0, 0, handAngle(beat));
      const step = Math.floor(beat);
      if (lastStep !== null && step !== lastStep && ((step % 8) + 8) % 8 === 0) flash = 1;
      lastStep = step;
      flash = Math.max(0, flash - dt * 1.4);
      const pulse = 1 + 0.06 * Math.sin(time * 1.7) + 0.03 * Math.sin(time * 4.3);
      glow.setLocalScale(7 * (pulse + flash * 0.5), 1, 7 * (pulse + flash * 0.5));
      light.light.intensity = 1.9 * pulse + flash * 2.2;
      const glowK = 1 + flash * 1.5;
      if (Math.abs(glowK - handMat.emissiveIntensity) > 0.01) { handMat.emissiveIntensity = glowK; handMat.update(); }
      for (const s of shards) {
        s.a += s.w * dt;
        s.e.setLocalPosition(Math.cos(s.a) * s.r, s.y + Math.sin(time * 0.3 + s.a) * 0.4, s.z + Math.sin(s.a) * s.r * 0.35);
        s.e.rotateLocal(s.spin[0] * dt, s.spin[1] * dt, s.spin[2] * dt);
      }
      for (const m of embers) {
        m.y += m.v * dt;
        if (m.y > 8) { m.y = -8; m.x = (Math.random() - 0.5) * 22; }
        m.e.setLocalPosition(m.x + Math.sin(time * 0.8 + m.ph) * 0.5, m.y, m.z);
      }
      // ゆっくり漂うカメラ（少し下から見上げる）
      cam.setLocalPosition(Math.sin(time * 0.07) * 1.6, -1.2 + Math.sin(time * 0.05) * 0.4, 14.5);
      look.set(ORIGIN[0], ORIGIN[1] + 0.4, ORIGIN[2]);
      cam.lookAt(look);
    },
  };
}
