// 大廳（試合の前の待つ所）：中世の城の広間。奥の大きな暖炉の火・左右の火鉢と壁の松明だけが灯り、選んだ人物が壇の上に立つ。題の画面と、戰鬥・人物選びの後ろに出す
//   森とは別の「層」（Hall）に作り、大廳のカメラはこの層だけを描く：森の空・霧・太陽の光は入らず、森も描かないので重くならない
//   形は render/hall-room.js（石の床と壁・暖炉・柱・壇・絨毯・旗）、火と空気は render/hall-fire.js、小物は render/hall-props.js
//   質感はどれも Poly Haven（CC0）の実写。人物は試合と同じ見た目（render/character-view.js）
//   画質：low は暖炉の影と仕上げ（にじむ光）を省く。medium は暖炉の火の影と、にじむ光・周りを暗く・色味。high はさらに火鉢の影・隅の陰（SSAO）・縁のなめらかさ
import * as pc from 'playcanvas';
import { sceneBudget } from '../core/mesh-utils.js';
import { loadTextureSet } from '../world/materials.js';
import { createFighter } from '../game/match.js';
import { loadCharacterModel, createCharacterView } from './character-view.js';
import { loadWeaponModels, createWeaponModel, createShieldModel } from './weapons.js';
import { buildRoom, DAIS, FIRE, TORCHES, BRAZIERS } from './hall-room.js';
import { createHallFire } from './hall-fire.js';
import { loadHallProps } from './hall-props.js';
import { BUILD } from '../version.js';

const ORIGIN = [0, -400, 0];       // 森の下の、誰も行かない所に建てる（描くのは大廳のカメラだけなので、場所はどこでもよい）
const AMBIENT = [0.035, 0.03, 0.032];   // 空から回り込む光は無い。材質の「周りの光」をこれだけに絞る（火の光が主）

// 広間の質感（Poly Haven の名前）。gloss：滑らかさの上限（濡れたように光りすぎないように）
const SURFACES = {
  wall: { id: 'medieval_blocks_03', bump: 1.0 },
  floor: { id: 'large_floor_tiles_02', bump: 0.8, glossMax: 0.75 },
  rubble: { id: 'castle_wall_varriation', bump: 1.0 },
  wood: { id: 'old_planks_02', bump: 0.8 },
  carpet: { id: 'velour_velvet', bump: 0.6, tiling: 3 },   // 色は絨毯の絵（hall-room.js）、凹凸と粗さは布
  iron: { id: null, metalness: 0.8, gloss: 0.45 },
  gold: { id: null, metalness: 1, gloss: 0.7 },   // 暖炉の上の金箔の浮き彫り
};

/** 部屋の霧：遠い所ほど暗い煙たい空気に沈む（大廳のカメラだけ） */
function hallFog() {
  const f = new pc.FogParams();
  f.type = pc.FOG_LINEAR;
  f.color = new pc.Color(0.018, 0.012, 0.01);
  f.start = 7; f.end = 30;
  return f;
}

/**
 * 金属に映る部屋の様子（球の絵。見る向きから決まる）：下から暖炉と火鉢の橙、真ん中は暗い石の茶、上は暗い天井。
 * 空の写真が無い部屋でも、金・鉄・真鍮が金属らしく光る
 */
let roomSphere = null;
function roomReflection(device) {
  if (roomSphere) return roomSphere;
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0705'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  const blob = (x, y, r, rgb, a) => { const q = g.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S); q.addColorStop(0, `rgba(${rgb},${a})`); q.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = q; g.fillRect(0, 0, S, S); };
  blob(0.5, 0.5, 0.5, '105,66,36', 0.9);
  blob(0.5, 0.85, 0.35, '255,140,50', 0.9);
  blob(0.22, 0.7, 0.18, '255,170,80', 0.6);
  blob(0.8, 0.68, 0.18, '255,170,80', 0.6);
  blob(0.15, 0.3, 0.14, '90,120,200', 0.35);   // 左上：月の光
  roomSphere = new pc.Texture(device, { width: S, height: S, format: pc.PIXELFORMAT_RGBA8, srgb: true, mipmaps: false, minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR });
  roomSphere.setSource(c);
  return roomSphere;
}

/** 大廳の材質：空からの光は使わない（森の時間帯に左右されない）。部屋の霧は使う。金属には部屋の映り込み */
function hallMaterial(m, device = null) {
  m.useSkybox = false;
  m.useFog = true;
  m.ambient = new pc.Color(...AMBIENT);
  if (device && (m.metalness > 0.3 || m.metalnessMap)) { m.sphereMap = roomReflection(device); m.reflectivity = 1; }
  m.update();
  return m;
}

/**
 * @param {pc.AppBase} app
 * @param {object} config 画質（質感の画像の大きさ・影・仕上げ）
 */
export function createHall(app, config) {
  const device = app.graphicsDevice;
  const q = config.qualityName || 'medium';
  const low = q === 'low', high = q === 'high';
  const layer = new pc.Layer({ name: 'Hall' });
  app.scene.layers.push(layer);
  const L = [layer.id];

  const root = new pc.Entity('hall');
  root.setPosition(...ORIGIN);
  app.root.addChild(root);

  // ---- 広間の形（質感ごとに 1 つ）と旗 ----
  const room = buildRoom(device, config.quality);
  let tris = 0;
  for (const [surf, { mesh, tris: t }] of Object.entries(room.surfaces)) {
    const S = SURFACES[surf];
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color(1, 1, 1);
    m.diffuseVertexColor = true;
    m.vertexColorGamma = true;
    m.useMetalness = true;
    m.metalness = S.metalness ?? 0;
    m.gloss = S.gloss ?? 0.25;
    hallMaterial(m, device);
    const e = new pc.Entity(`hall-${surf}`);
    // 床と壁は影を受けるだけ（落とす物は、壇・柱・小物・人物）
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, m)], castShadows: surf === 'iron' || surf === 'wood' || surf === 'gold', receiveShadows: true, layers: L });
    root.addChild(e);
    tris += t;
    if (!S.id) continue;
    if (surf === 'carpet') { m.diffuseMap = room.carpetTex; m.diffuseMapOffset = new pc.Vec2(0.5, 0); m.update(); }
    loadTextureSet(device, S.id, config.quality).then((tx) => {
      if (!tx) return;
      if (surf !== 'carpet') m.diffuseMap = tx.diffuse;
      m.normalMap = tx.normal; m.bumpiness = S.bump ?? 1;
      if (S.tiling) for (const k of ['normalMapTiling', 'aoMapTiling', 'glossMapTiling']) m[k] = new pc.Vec2(S.tiling, S.tiling);
      m.aoMap = tx.arm; m.aoMapChannel = 'r';
      m.glossMap = tx.arm; m.glossMapChannel = 'g'; m.glossInvert = true; m.gloss = S.glossMax ?? 0.62;
      m.update();
    });
  }
  // 旗：絵（紋）に、布の凹凸。両面
  {
    const m = new pc.StandardMaterial();
    m.diffuseMap = room.banner.tex;
    m.useMetalness = true; m.metalness = 0; m.gloss = 0.3;
    m.cull = pc.CULLFACE_NONE; m.twoSidedLighting = true;
    hallMaterial(m);
    loadTextureSet(device, SURFACES.carpet.id, config.quality).then((tx) => {
      if (!tx) return;
      m.normalMap = tx.normal; m.normalMapTiling = new pc.Vec2(3, 7); m.bumpiness = 0.8;
      m.update();
    });
    for (const b of room.banner.meshes) {
      const e = new pc.Entity('hall-banner');
      e.addComponent('render', { meshInstances: [new pc.MeshInstance(b.mesh, m)], castShadows: true, receiveShadows: true, layers: L });
      e.setLocalPosition(b.x, room.banner.top, room.banner.z);
      root.addChild(e);
      tris += b.mesh.primitive[0].count / 3;
    }
  }
  sceneBudget.triangles += tris;

  // ---- 火（暖炉・火鉢・壁の松明・蝋燭）と、空気（火の粉・煙・月の光の筋と塵） ----
  const fire = createHallFire(app, L, root, { sparks: low ? 40 : 90, motes: low ? 30 : 70 });
  // 暖炉：人物の後ろから照らす一番強い火。画質が medium 以上なら、人物と壇の影を手前へ落とす
  fire.addCoals([0, 0.03, FIRE.zf - 0.42], 1.5, 0.55);
  fire.addFire([0, 0.1, FIRE.zf - 0.42], 1.0, { tongues: 6, spread: 1.15, glow: 2.0, intensity: 1.5,
    light: { intensity: 1.5, range: 10, shadow: low ? 0 : 512, forward: 0.55 } });
  for (const b of BRAZIERS) {
    fire.addCoals([b.flame[0], 0.97, b.flame[2]], 0.62, 0.62);
    fire.addFire([b.flame[0], 0.95, b.flame[2]], 0.62, { tongues: 3, spread: 0.36, glow: 2.2, intensity: 1.4, light: { intensity: 0.55, range: 7, shadow: high ? 256 : 0, forward: 0 } });
  }
  for (const t of TORCHES) fire.addFire(t.flame, 0.34, { tongues: 2, spread: 0.06, glow: 2.4, intensity: 1.4, light: { intensity: 0.32, range: 5.5, forward: 0.1 } });
  // 月の光：左奥の見えない高い窓から、壇の左手前の床へ斜めに差し込む（暖かい火の中の、冷たい青い光）
  const MOON_FROM = [-4.9, 6.2, -2.9], MOON_TO = [-0.95, 0, 1.55];
  fire.addMoonShaft(MOON_FROM, MOON_TO, 1.0);
  const moon = new pc.Entity('hall-moon');
  moon.addComponent('light', {
    type: 'spot', color: new pc.Color(0.42, 0.56, 1.0), intensity: 3.6, range: 16, innerConeAngle: 6, outerConeAngle: 13,
    castShadows: false, falloffMode: pc.LIGHTFALLOFF_LINEAR, layers: L,
  });
  root.addChild(moon);
  moon.setLocalPosition(...MOON_FROM);
  moon.lookAt(new pc.Vec3(ORIGIN[0] + MOON_TO[0], ORIGIN[1] + MOON_TO[1], ORIGIN[2] + MOON_TO[2]));
  moon.rotateLocal(90, 0, 0);   // 光は自分の -Y へ進む（lookAt は -Z を向けるので、-Y を向け直す）

  // 人物を照らす光：手前の左上の大きな火（画面の外）から。人物の影を壇に落とす
  const key = new pc.Entity('hall-key');
  key.addComponent('light', {
    type: 'spot', color: new pc.Color(1, 0.68, 0.4), intensity: 1.1, range: 12, innerConeAngle: 10, outerConeAngle: 24,
    castShadows: true, shadowResolution: low ? 512 : 1024, shadowBias: 0.2, normalOffsetBias: 0.05, layers: L,
  });
  root.addChild(key);
  key.setLocalPosition(-2.4, 4.4, 3.6);
  key.lookAt(new pc.Vec3(ORIGIN[0], ORIGIN[1] + 0.9, ORIGIN[2]));
  key.rotateLocal(90, 0, 0);
  // 部屋全体の、とても弱い光（真っ暗にしない。空から回り込む光の代わり）
  const fill = new pc.Entity('hall-fill');
  fill.addComponent('light', { type: 'omni', color: new pc.Color(0.55, 0.45, 0.42), intensity: 0.025, range: 24, castShadows: false, layers: L });
  fill.setLocalPosition(0, 4, 3);
  root.addChild(fill);

  // ---- 小物（樽・宝箱・机と杯・燭台・灯・腰掛け・壁の楯） ----
  loadHallProps(app, L, root, fire, (m) => hallMaterial(m, device), BUILD)
    .then(({ tris: t }) => { sceneBudget.triangles += t; })
    .catch((err) => console.warn('大廳の小物:', err));

  // ---- カメラ ----
  const cam = new pc.Entity('hall-camera');
  cam.addComponent('camera', {
    fov: 38, nearClip: 0.1, farClip: 40, layers: L,
    clearColor: new pc.Color(0.012, 0.009, 0.008),
    toneMapping: pc.TONEMAP_ACES, gammaCorrection: pc.GAMMA_SRGB,
  });
  cam.camera.fog = hallFog();
  root.addChild(cam);
  // 仕上げ（medium 以上）：明るい所がにじむ光・周りを暗く・色味。high は隅の陰（SSAO）と、縁のなめらかさ（2 倍の重ね描き）も
  let frameFx = null;
  if (!low && pc.CameraFrame) {
    try {
      frameFx = new pc.CameraFrame(app, cam.camera);
      frameFx.rendering.toneMapping = pc.TONEMAP_ACES;
      frameFx.rendering.samples = high ? 2 : 1;
      frameFx.bloom.intensity = 0.05;
      frameFx.bloom.blurLevel = 12;
      frameFx.grading.enabled = true;
      frameFx.grading.brightness = 1.0; frameFx.grading.contrast = 1.08; frameFx.grading.saturation = 1.06;
      frameFx.grading.tint = new pc.Color(1.02, 0.99, 0.95, 1);
      frameFx.vignette.intensity = 0.42; frameFx.vignette.inner = 0.45; frameFx.vignette.outer = 1.15; frameFx.vignette.curvature = 0.6;
      if (high) {
        frameFx.ssao.type = pc.SSAOTYPE_COMBINE;
        frameFx.ssao.intensity = 0.45; frameFx.ssao.radius = 0.6; frameFx.ssao.samples = 12; frameFx.ssao.scale = 0.5;
      }
      frameFx.update();
      frameFx.enabled = false;   // 大廳を出すときに有効にする
    } catch (err) { console.warn('大廳の仕上げ（CameraFrame）を使えません', err); frameFx = null; }
  }
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
  const origin = new pc.Vec3(...ORIGIN);

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
    // 技の動きは、その技の武器を持たせる（選んだ武器と違えば、模型を読み込んでから付け直す）
    const wid = info ? view.weaponFor(name) : null;
    if (wid) { const v = view; loadWeaponModels(app, [wid]).then(() => { if (v === view) v.refreshWeapon(); }); }
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
      if (frameFx) frameFx.enabled = v;
      if (worldCamera) worldCamera.enabled = !v;
      if (v) frame();
    },
    /** 立っている人物（キャラと武器） */
    show,
    update(dt) {
      if (!active) return;
      time += dt;
      fire.update(dt, cam, origin);   // 炎の揺らぎ・光の揺らぎ・火の粉・煙・月の光の塵
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
