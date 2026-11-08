// 大廳（試合の前の待つ所）：松明だけが灯る薄暗い石の広間に、選んだ人物が立っている。題の画面と、戰鬥・人物選びの後ろに出す
//   森とは別の「層」（Hall）に作り、大廳のカメラはこの層だけを描く：森の空・霧・太陽の光は入らず、森も描かないので重くならない
//   形は村と同じ道具（world/build-kit.js）と実写の質感（Poly Haven）。人物は試合と同じ見た目（render/character-view.js）
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { SURFACES, builder, box } from '../world/build-kit.js';
import { loadTextureSet } from '../world/materials.js';
import { createFighter } from '../game/match.js';
import { loadCharacterModel, createCharacterView } from './character-view.js';
import { loadWeaponModels, createWeaponModel, createShieldModel } from './weapons.js';

const ORIGIN = [0, -400, 0];       // 森の下の、誰も行かない所に建てる（描くのは大廳のカメラだけなので、場所はどこでもよい）
const W = 11, D = 15, H = 6.2;     // 広間の幅・奥行き・高さ（m）
const BACK = -4.2;                 // 奥の壁（人物は真ん中に立ち、カメラは手前）
const DAIS = 0.24;                 // 人物が立つ壇の高さ
const AMBIENT = [0.05, 0.045, 0.05];   // 空から回り込む光は無い。材質の「周りの光」をこれだけに絞る（松明の光が主）

/** 炎の絵（中心が白く、外へ橙から透明へ）。画面に足して描く */
function flameTexture(device) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 92, 2, 32, 80, 60);
  grd.addColorStop(0, 'rgba(255,246,214,1)');
  grd.addColorStop(0.18, 'rgba(255,196,96,0.95)');
  grd.addColorStop(0.45, 'rgba(236,104,28,0.55)');
  grd.addColorStop(1, 'rgba(120,30,0,0)');
  g.fillStyle = grd;
  // 炎の形：下が丸く、上へ細く伸びる
  g.beginPath();
  g.moveTo(32, 2);
  g.bezierCurveTo(50, 40, 60, 80, 32, 124);
  g.bezierCurveTo(4, 80, 14, 40, 32, 2);
  g.fill();
  const t = new pc.Texture(device, { width: 64, height: 128, format: pc.PIXELFORMAT_RGBA8, mipmaps: true });
  t.setSource(c);
  return t;
}

/** 光の輪（松明のまわりの、空気が照らされた明るさ） */
function glowTexture(device) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,170,80,0.5)');
  grd.addColorStop(0.4, 'rgba(200,90,30,0.16)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new pc.Texture(device, { width: 128, height: 128, format: pc.PIXELFORMAT_RGBA8, mipmaps: true });
  t.setSource(c);
  return t;
}

/** 大廳の材質：空からの光と霧は使わない（森の時間帯に左右されない） */
function hallMaterial(m) {
  m.useSkybox = false;
  m.useFog = false;
  m.ambient = new pc.Color(...AMBIENT);
  m.update();
  return m;
}

/**
 * @param {pc.AppBase} app
 * @param {object} config 画質（質感の画像の大きさ）
 */
export function createHall(app, config) {
  const device = app.graphicsDevice;
  const layer = new pc.Layer({ name: 'Hall' });
  app.scene.layers.push(layer);
  const L = [layer.id];

  const root = new pc.Entity('hall');
  root.setPosition(...ORIGIN);
  app.root.addChild(root);

  // ---- 形（質感ごとに 1 つ） ----
  const B = builder();
  const hx = W / 2, f0 = BACK, f1 = BACK + D;
  // 床（石畳）と天井（板）
  B.quad('cobble', [-hx, 0, f1], [hx, 0, f1], [hx, 0, f0], [-hx, 0, f0], [0, 1, 0], 0.8);
  B.quad('wood', [-hx, H, f0], [hx, H, f0], [hx, H, f1], [-hx, H, f1], [0, -1, 0], 0.45);
  // 壁（内側を向く。石積み）
  const wallShade = 0.75;
  B.quad('stone', [-hx, 0, f0], [hx, 0, f0], [hx, H, f0], [-hx, H, f0], [0, 0, 1], wallShade);           // 奥
  B.quad('stone', [-hx, 0, f1], [-hx, 0, f0], [-hx, H, f0], [-hx, H, f1], [1, 0, 0], wallShade);         // 左
  B.quad('stone', [hx, 0, f0], [hx, 0, f1], [hx, H, f1], [hx, H, f0], [-1, 0, 0], wallShade);            // 右
  B.quad('stone', [hx, 0, f1], [-hx, 0, f1], [-hx, H, f1], [hx, H, f1], [0, 0, -1], wallShade);          // 手前（後ろに映る）
  // 人物が立つ壇（2 段）
  box(B, 'stone', 0, 0, 0, 3.4, 2.6, DAIS * 0.5, 0, { shade: 0.9 });
  box(B, 'stone', 0, DAIS * 0.5, -0.1, 2.6, 2.0, DAIS * 0.5, 0, { shade: 1.0 });
  // 柱（左右に 2 本ずつ）と、天井の梁
  for (const sx of [-1, 1]) {
    for (const z of [-2.2, 2.4]) {
      box(B, 'stone', sx * 3.3, 0, z, 0.9, 0.9, 0.35, 0, { shade: 0.8 });
      box(B, 'stone', sx * 3.3, 0.35, z, 0.68, 0.68, H - 0.35, 0, { shade: 0.85 });
    }
  }
  for (const z of [-2.2, 0.1, 2.4, 4.7]) box(B, 'wood', 0, H - 0.42, z, W, 0.34, 0.42, 0, { shade: 0.5, bottom: true });
  for (const sx of [-1, 1]) box(B, 'wood', sx * 3.3, H - 0.72, 0.1, 0.3, D, 0.3, 0, { shade: 0.45, bottom: true });
  // 奥の壁の旗（赤い布に金の縁）。旗竿は鉄
  for (const sx of [-1, 1]) {
    const x = sx * 1.75;
    box(B, 'cloth', x, 1.5, f0 + 0.06, 1.15, 0.04, 3.4, 0, { shade: [0.36, 0.05, 0.04] });
    box(B, 'cloth', x, 1.5, f0 + 0.085, 0.95, 0.02, 3.25, 0, { shade: [0.5, 0.08, 0.05] });
    for (const y of [1.62, 4.62]) box(B, 'cloth', x, y, f0 + 0.1, 0.95, 0.02, 0.07, 0, { shade: [0.55, 0.42, 0.16] });   // 金の縁
    box(B, 'cloth', x, 4.92, f0 + 0.12, 1.4, 0.07, 0.07, 0, { shade: [0.12, 0.11, 0.1] });
  }
  // 壁の松明（鉄の受けと木の柄）。奥の壁の左右と、横の壁
  const torches = [[-2.68, 2.35, f0 + 0.28, 0], [2.68, 2.35, f0 + 0.28, 0], [-hx + 0.28, 2.35, 1.0, 90], [hx - 0.28, 2.35, 1.0, -90]];
  for (const [x, y, z, rot] of torches) {
    box(B, 'cloth', x, y - 0.42, z, 0.07, 0.07, 0.45, rot, { shade: [0.25, 0.16, 0.09], bottom: true });   // 柄
    box(B, 'cloth', x, y - 0.02, z, 0.16, 0.16, 0.08, rot, { shade: [0.1, 0.1, 0.1], bottom: true });       // 鉄の受け
  }
  // 奥の壁の下の、大きな火鉢（人物の後ろを照らす）
  box(B, 'stone', 0, 0, f0 + 0.9, 1.0, 0.7, 0.55, 0, { shade: 0.6 });
  box(B, 'cloth', 0, 0.55, f0 + 0.9, 1.1, 0.8, 0.08, 0, { shade: [0.08, 0.07, 0.06] });

  const materials = {};
  let tris = 0;
  for (const [surf, g] of Object.entries(B.parts)) {
    if (!g.indices.length) continue;
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color(1, 1, 1);
    m.diffuseVertexColor = true;
    m.vertexColorGamma = true;
    m.useMetalness = true;
    m.metalness = 0;
    m.gloss = 0.2;
    m.cull = pc.CULLFACE_NONE;
    hallMaterial(m);
    materials[surf] = m;
    const e = new pc.Entity(`hall-${surf}`);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, g), m)], castShadows: true, receiveShadows: true, layers: L });
    root.addChild(e);
    tris += g.indices.length / 3;
  }
  sceneBudget.triangles += tris;
  for (const [surf, m] of Object.entries(materials)) {
    if (!SURFACES[surf].id) continue;
    loadTextureSet(device, SURFACES[surf].id, config.quality).then((t) => {
      if (!t) return;
      m.diffuseMap = t.diffuse; m.normalMap = t.normal;
      m.aoMap = t.arm; m.aoMapChannel = 'r';
      m.glossMap = t.arm; m.glossMapChannel = 'g'; m.glossInvert = true; m.gloss = 1;
      m.update();
    });
  }

  // ---- 炎（絵を画面に足して描く）と、光 ----
  const flameMat = new pc.StandardMaterial();
  flameMat.useLighting = false; flameMat.useSkybox = false; flameMat.useFog = false;
  flameMat.emissiveMap = flameTexture(device); flameMat.emissive = new pc.Color(1, 1, 1);
  flameMat.opacityMap = flameMat.emissiveMap; flameMat.opacityMapChannel = 'a';
  flameMat.blendType = pc.BLEND_ADDITIVE; flameMat.depthWrite = false; flameMat.cull = pc.CULLFACE_NONE;
  flameMat.diffuse = new pc.Color(0, 0, 0);
  flameMat.update();
  const glowMat = flameMat.clone();
  glowMat.emissiveMap = glowMat.opacityMap = glowTexture(device);
  glowMat.update();
  const fires = [];
  /** 炎 1 つ（十字に組んだ 2 枚の絵）と光の輪、光（omni）。size：炎の高さ */
  function addFire(x, y, z, size, light) {
    const e = new pc.Entity('fire');
    e.setLocalPosition(x, y, z);
    root.addChild(e);
    const flame = new pc.Entity();
    for (const a of [0, 90]) {
      const q = new pc.Entity();
      q.addComponent('render', { type: 'plane', material: flameMat, castShadows: false, receiveShadows: false, layers: L });
      q.setLocalEulerAngles(90, a, 0);   // 平面を立てる
      q.setLocalScale(size * 0.5, 1, size);
      q.setLocalPosition(0, size * 0.45, 0);
      flame.addChild(q);
    }
    e.addChild(flame);
    const glow = new pc.Entity();
    glow.addComponent('render', { type: 'plane', material: glowMat, castShadows: false, receiveShadows: false, layers: L });
    glow.setLocalEulerAngles(90, 0, 0);
    glow.setLocalScale(size * 3.2, 1, size * 3.2);
    glow.setLocalPosition(0, size * 0.4, 0.02);
    e.addChild(glow);
    const lt = new pc.Entity();
    lt.addComponent('light', { type: 'omni', color: new pc.Color(1, 0.52, 0.22), intensity: light.intensity, range: light.range, castShadows: false, layers: L });
    lt.setLocalPosition(0, size * 0.5, 0.15);
    e.addChild(lt);
    fires.push({ flame, glow, light: lt.light, base: light.intensity, seed: Math.random() * 100, size });
  }
  for (const [x, y, z] of torches) addFire(x, y + 0.06, z, 0.42, { intensity: 0.5, range: 5.5 });
  addFire(0, 0.63, f0 + 0.9, 0.62, { intensity: 0.7, range: 4.5 });   // 火鉢

  // 人物を照らす光：手前の左上の大きな火（画面の外）から。人物の影を壇に落とす
  const key = new pc.Entity('hall-key');
  key.addComponent('light', {
    type: 'spot', color: new pc.Color(1, 0.7, 0.42), intensity: 1.7, range: 12, innerConeAngle: 9, outerConeAngle: 22,
    castShadows: true, shadowResolution: 1024, shadowBias: 0.2, normalOffsetBias: 0.05, layers: L,
  });
  root.addChild(key);
  key.setLocalPosition(-2.4, 4.4, 3.6);
  key.lookAt(new pc.Vec3(ORIGIN[0], ORIGIN[1] + 0.9, ORIGIN[2]));
  key.rotateLocal(90, 0, 0);   // 光は自分の -Y へ進む（lookAt は -Z を向けるので、-Y を向け直す）
  // 後ろからの冷たい光（窓の月明かり）：人物の輪郭を浮かせる
  const rim = new pc.Entity('hall-rim');
  rim.addComponent('light', { type: 'omni', color: new pc.Color(0.42, 0.5, 0.75), intensity: 0.35, range: 4.5, castShadows: false, layers: L });
  rim.setLocalPosition(1.2, 3.2, -2.2);
  root.addChild(rim);
  // 部屋全体の、とても弱い光（真っ暗にしない。空から回り込む光の代わり）
  const fill = new pc.Entity('hall-fill');
  fill.addComponent('light', { type: 'omni', color: new pc.Color(0.5, 0.45, 0.5), intensity: 0.07, range: 22, castShadows: false, layers: L });
  fill.setLocalPosition(0, 4, 2);
  root.addChild(fill);

  // ---- カメラ ----
  const cam = new pc.Entity('hall-camera');
  cam.addComponent('camera', {
    fov: 38, nearClip: 0.1, farClip: 40, layers: L,
    clearColor: new pc.Color(0.02, 0.015, 0.012),
    toneMapping: pc.TONEMAP_ACES, gammaCorrection: pc.GAMMA_SRGB,
  });
  root.addChild(cam);
  const target = new pc.Vec3();
  /** 画面の形に合わせて人物を置く：横長は人物を左に（右に選ぶ画面）、縦長は真ん中の上に */
  function frame() {
    const c = app.graphicsDevice.canvas, aspect = c.clientWidth / Math.max(1, c.clientHeight);
    const wide = aspect > 1.05;
    const side = wide ? Math.min(1.25, 0.55 + (aspect - 1) * 1.4) : 0;
    cam.setLocalPosition(side * 0.8, 1.5, 5.4);
    target.set(ORIGIN[0] + side, ORIGIN[1] + (wide ? 1.02 : 0.7), ORIGIN[2]);
    cam.lookAt(target);
    cam.camera.fov = wide ? 38 : 50;
  }
  frame();
  window.addEventListener('resize', frame);

  // ---- 人物 ----
  let view = null, showing = null, token = 0;
  /** 人物の見た目を大廳の層へ移し、材質を大廳の光に合わせる（試合の見た目とは別の材質にする） */
  function adopt(entity) {
    for (const r of entity.findComponents('render')) {
      r.layers = L;
      for (const mi of r.meshInstances) mi.material = hallMaterial(mi.material.clone());
    }
  }
  async function show(char, loadout) {
    const key = `${char}|${JSON.stringify(loadout || {})}`;
    if (key === showing) return;
    showing = key;
    const my = ++token;
    const f = createFighter({ id: 'hall', name: '', char, isPlayer: false, color: [1, 1, 1], loadout });
    f.x = ORIGIN[0]; f.y = ORIGIN[1] + DAIS; f.z = ORIGIN[2]; f.yaw = 195;   // こちらを向き、少し右（選ぶ画面の側）へ向いて立つ
    const [model] = await Promise.all([
      loadCharacterModel(app, char),
      loadWeaponModels(app, [f.primary, ...(f.sidearm ? [f.sidearm] : []), ...(f.shield ? ['shield'] : [])]),
    ]);
    if (my !== token) return;   // 読み込む間に別の人物が選ばれた
    view?.destroy();
    view = createCharacterView(app, f, null, model);
    view.update(0);
    view.root.reparent(root);
    adopt(view.root);
    view.root.enabled = !shownWeapon;
    directed = null;
  }

  // ---- 圖鑑：選んだ動きを流す（流す・止める・繰り返す・速さ・好きな時刻へ） ----
  let directed = null;   // { name, duration, loop（繰り返す）, playing, speed, lastT }
  function direct(name) {
    if (!view) return null;
    const info = name && view.clipInfo(name);
    view.direct(info ? name : null);
    directed = info ? { name, duration: info.duration, loop: directed?.loop ?? true, playing: true, speed: directed?.speed ?? 1, lastT: 0 } : null;
    return directed;
  }
  function stepDirected() {
    if (!directed || !view) return;
    const layer = view.anim.baseLayer, d = directed;
    view.anim.speed = d.playing ? d.speed : 0;
    const t = layer.activeStateCurrentTime ?? 0;
    // 終わりまで来た：繰り返すなら最初から、繰り返さないなら終わりの姿で止める（模型の動きが繰り返す物でも）
    const wrapped = t < d.lastT - 0.05;
    if (d.playing && (t >= d.duration - 0.01 || wrapped)) {
      if (d.loop) { if (!wrapped) layer.activeStateCurrentTime = 0; }
      else { d.playing = false; view.anim.speed = 0; layer.activeStateCurrentTime = d.duration - 0.001; }
    }
    d.lastT = layer.activeStateCurrentTime ?? t;
  }

  // ---- 圖鑑：武器を壇の上に浮かべて、ゆっくり回して見せる（人物は隠す） ----
  let shownWeapon = null, display = null, wtoken = 0;
  const pivot = new pc.Entity('hall-display');
  root.addChild(pivot);
  pivot.setLocalPosition(0, DAIS + 1.15, 0.1);
  async function showWeapon(id) {
    shownWeapon = id;
    display?.destroy(); display = null;
    if (view) view.root.enabled = !id;
    if (!id) return;
    const my = ++wtoken;
    await loadWeaponModels(app, [id === 'kite' ? 'shield' : id]);
    if (my !== wtoken || shownWeapon !== id) return;
    const model = id === 'kite' ? createShieldModel() : createWeaponModel(id);
    if (!model) return;
    // 回す軸（pivot）→ 傾け・大きさ（display）→ 真ん中合わせ（shift）→ 立てる（orient）→ 模型
    //   武器の模型は刃先が -Z（前）へ伸びる形なので、X で 90 度回して刃先を上に立てる（楯はそのまま立っている）
    display = new pc.Entity('weapon');
    const shift = new pc.Entity(), orient = new pc.Entity();
    orient.setLocalEulerAngles(id === 'kite' ? 0 : 90, 0, 0);
    orient.addChild(model);
    shift.addChild(orient);
    display.addChild(shift);
    pivot.setLocalEulerAngles(0, 0, 0);   // 測る間は回さない（形の真ん中を、回す軸の座標で求める）
    pivot.addChild(display);
    adopt(display);
    // 形の真ん中を回す軸に合わせ、長い物は小さくして収める（槍は 2.5 m を超える）
    const box = new pc.BoundingBox(), tmp = new pc.BoundingBox();
    let first = true;
    for (const r of display.findComponents('render')) for (const mi of r.meshInstances) { if (first) { box.copy(mi.aabb); first = false; } else { tmp.copy(mi.aabb); box.add(tmp); } }
    const size = Math.max(box.halfExtents.x, box.halfExtents.y, box.halfExtents.z) * 2 || 1;
    const c = box.center, p = pivot.getPosition();
    shift.setLocalPosition(p.x - c.x, p.y - c.y, p.z - c.z);
    const k = Math.min(1.6, 1.9 / size);
    display.setLocalScale(k, k, k);
    display.setLocalEulerAngles(0, 0, id === 'kite' ? 0 : -28);   // 武器は少し斜めに（刃先を右上へ）
  }

  let active = false, time = 0;
  return {
    layer,
    get active() { return active; },
    /** 大廳を出す（大廳のカメラで描く）・しまう（森のカメラに戻す） */
    setActive(v, worldCamera) {
      active = v;
      root.enabled = v;
      if (worldCamera) worldCamera.enabled = !v;
      if (v) frame();
    },
    /** 立っている人物（キャラと武器） */
    show,
    update(dt) {
      if (!active) return;
      time += dt;
      // 炎のゆらぎ：大きさと光の強さを、いくつかの波を重ねて揺らす
      for (const f of fires) {
        const s = f.seed + time;
        const k = 0.82 + 0.1 * Math.sin(s * 7.3) + 0.06 * Math.sin(s * 13.1 + 1.7) + 0.04 * Math.sin(s * 23.7);
        f.flame.setLocalScale(1 + 0.08 * Math.sin(s * 9.1), k, 1);
        f.glow.setLocalScale(1, 1, 1);
        f.light.intensity = f.base * (0.85 + 0.15 * k);
      }
      view?.update(dt);   // 待機の動き（体の位置は、作るときに決めた壇の上）
      stepDirected();
      if (display) pivot.rotateLocal(0, 24 * dt, 0);
    },
    /** 圖鑑：動きを流す（null で待機に戻す）。返り値は流している動き { name, duration, loop, playing, speed } */
    direct,
    /** 圖鑑：流している動きの今の時刻（秒） */
    get directed() { return directed ? { ...directed, t: view?.anim.baseLayer.activeStateCurrentTime ?? 0 } : null; },
    setPlaying(v) {
      if (!directed) return;
      if (v && !directed.playing && (view.anim.baseLayer.activeStateCurrentTime ?? 0) >= directed.duration - 0.02) view.anim.baseLayer.activeStateCurrentTime = 0;   // 終わりで止まっていたら最初から
      directed.playing = v;
    },
    setLoop(v) { if (directed) directed.loop = v; },
    setSpeed(v) { if (directed) directed.speed = v; },
    seek(t) { if (!directed || !view) return; directed.playing = false; view.anim.speed = 0; view.anim.baseLayer.activeStateCurrentTime = Math.max(0, Math.min(directed.duration - 0.001, t)); directed.lastT = t; },
    /** 立っている人物が持つ動きの名前（模型を読み終わるまでは空） */
    get clipNames() { return view ? view.clipNames : []; },
    /** 圖鑑：武器を見せる（null で人物に戻す） */
    showWeapon,
    /** 試合が始まるとき：人物の見た目を片付ける（模型そのものは試合でも使うので残す） */
    clear() { view?.destroy(); view = null; showing = null; token++; wtoken++; display?.destroy(); display = null; shownWeapon = null; directed = null; },
  };
}
