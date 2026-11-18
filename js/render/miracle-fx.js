// 祓魔僧の奇跡の見た目（2026-11-17。game/miracles.js・game/combat.js の知らせで出す）。
//   唱える：護符（左の拳から下がる）に光が集まり、琥珀の玉が明るくなる（光の粒が護符へ吸い込まれる）
//   治癒：足もとから金と若葉色の光の柱が立ち、光の粒が昇る／蘇生：金の光の柱。加護の間は足もとに金の光の輪が回る
//   蘇る：白金の大きな光の柱と、広がる光の輪、たくさんの光の粒
//   光壁：前に、菱の目の模様の光の壁（少し丸い）。当たると波打って光り、受け止められる量が減るほど薄くなる。砕けると欠片が散る
//   淨炎：鎚矛の頭に金色の炎（清めの火）と火の粉／燃えている人：体に橙の炎と火の粉
// 描画命令：光の粒 1・光の玉 1（どちらも出ている間だけ）、光の柱・輪は 1 本 1 つ、光壁は 1 枚 1 つ、炎は舌 1 枚 1 つ
// 炎の形・光の玉・板をまとめる道具は render/hall-fire.js（大廳の火）と同じ
import * as pc from 'playcanvas';
import { FLAME_VS, FLAME_FS, flameQuad, canvasTexture, glowTex, addMat, quads, billboard } from './hall-fire.js';
import { MIRACLES } from '../game/data.js';

// 清めの火：大廳の炎と同じ形で、色だけを金と白へ寄せる（uHoly：0 で橙の火、1 で金の火）
const HOLY_FS = FLAME_FS
  .replace('uniform float uIntensity;', 'uniform float uIntensity;\nuniform float uHoly;')
  .replace('  float a = smoothstep(0.05, 0.45, heat)', `  vec3 holy = mix(vec3(0.42, 0.2, 0.02), vec3(1.0, 0.7, 0.2), smoothstep(0.08, 0.32, heat));
  holy = mix(holy, vec3(1.0, 0.9, 0.55), smoothstep(0.32, 0.62, heat));
  holy = mix(holy, vec3(1.0, 1.0, 0.92), smoothstep(0.66, 1.0, heat));
  col = mix(col, holy, uHoly);
  float a = smoothstep(0.05, 0.45, heat)`);

// 光の柱：縁ほど濃く、真ん中は透ける（見る向きと面の向きで決める）。上へ消え、筋がゆっくり昇る。
// 重ね方はふつう（色を塗り重ねる）。加算にすると昼の明るい空の前で白く飛ぶので、金の薄い帳のように描く（夜は明るく光って見える）
const PILLAR_VS = /* glsl */ `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUv0;
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
varying vec3 vPosW;
varying vec3 vNormalW;
varying vec2 vUv;
void main() {
  vec4 w = matrix_model * vec4(aPosition, 1.0);
  vPosW = w.xyz;
  vNormalW = normalize(mat3(matrix_model) * aNormal);
  vUv = aUv0;
  gl_Position = matrix_viewProjection * w;
}`;
const PILLAR_FS = /* glsl */ `
#include "gammaPS"
#include "tonemappingPS"
uniform vec3 view_position;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uFade;
uniform float uTime;
varying vec3 vPosW;
varying vec3 vNormalW;
varying vec2 vUv;
void main() {
  vec3 V = normalize(view_position - vPosW);
  float rim = 1.0 - abs(dot(normalize(vNormalW), V));
  rim = pow(rim, 1.8);
  float y = vUv.y;
  float vert = pow(1.0 - y, 1.05) * smoothstep(0.0, 0.05, y);
  float streak = 0.55 + 0.45 * sin(vUv.x * 6.2832 * 7.0 + sin(y * 5.0 - uTime * 2.6) * 1.5);
  float a = (rim * 1.1 + 0.14) * vert * (0.6 + 0.4 * streak) * uFade;
  vec3 c = uColor * uIntensity * (0.75 + 0.6 * a);
  gl_FragColor = vec4(gammaCorrectOutput(toneMap(c)), clamp(a, 0.0, 0.9));
}`;

const SPARKS = 220, GLOWS = 24, FLAMES = 14;
const rnd = Math.random;

/** 光の柱：上の開いた円柱（下は明るく、上へ消える。頂点の色で）。半径 1・高さ 1 */
function pillarMesh(device) {
  const N = 28, pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    pos.push(x, 0, z, x, 1, z);
    nor.push(x, 0, z, x, 0, z);
    uv.push(i / N, 0, i / N, 1);
  }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const m = new pc.Mesh(device);
  m.setPositions(pos); m.setNormals(nor); m.setUvs(0, uv); m.setIndices(idx);
  m.update(pc.PRIMITIVE_TRIANGLES);
  return m;
}
/** 光の輪（地面に寝かせる）：内の縁（透明）→ 光る帯 → 外の縁（透明）。半径 1 */
function ringMesh(device, inner = 0.72) {
  const SEG = 56, radii = [inner, (inner + 1) / 2, 1.0], alphas = [0, 1, 0];
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    radii.forEach((r, j) => { pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); col.push(alphas[j], alphas[j], alphas[j], 1); });
  }
  for (let i = 0; i < SEG; i++) for (let j = 0; j < 2; j++) {
    const a = i * 3 + j, b = (i + 1) * 3 + j;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const m = new pc.Mesh(device);
  m.setPositions(pos); m.setColors(col); m.setIndices(idx);
  m.update(pc.PRIMITIVE_TRIANGLES);
  return m;
}
/** 光壁の形：少し丸い板（幅 1・高さ 1。丸みは前へ。x：-0.5〜0.5、y：0〜1）。縁と上へ行くほど薄く（頂点の色） */
function wallMesh(device) {
  const NX = 18, NY = 6, pos = [], uv = [], col = [], idx = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const u = i / NX, v = j / NY, x = u - 0.5;
    pos.push(x, v, -0.12 * (1 - (2 * x) ** 2));
    uv.push(u * 2, v * 1.6);
    const edge = Math.min(1, Math.min(u, 1 - u) * 7) * Math.min(1, v * 8 + 0.2) * (1 - 0.55 * v);
    col.push(edge, edge, edge, 1);
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + NX + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const m = new pc.Mesh(device);
  m.setPositions(pos); m.setUvs(0, uv); m.setColors(col); m.setIndices(idx);
  m.update(pc.PRIMITIVE_TRIANGLES);
  return m;
}
/** 光壁の模様：菱の目の光の線と、その交わりの光の点（黒地。加算で足す） */
const latticeTex = (device) => canvasTexture(device, 256, (g, S) => {
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,226,160,0.13)'; g.fillRect(0, 0, S, S);   // 線の間：うすい光のガラス
  g.lineCap = 'round';
  for (const [w, a] of [[18, 0.10], [8, 0.38], [3.4, 0.95]]) {
    g.strokeStyle = `rgba(255,236,190,${a})`; g.lineWidth = w;
    g.beginPath();
    for (let k = -2; k <= 2; k++) {
      g.moveTo(k * S / 2, 0); g.lineTo(k * S / 2 + S, S);
      g.moveTo(k * S / 2 + S, 0); g.lineTo(k * S / 2, S);
    }
    g.stroke();
  }
  for (const [x, y] of [[0, 0], [S / 2, S / 2], [S, 0], [0, S], [S, S], [S / 2, 0], [0, S / 2], [S, S / 2], [S / 2, S]]) {
    const big = (x + y) % S === 0;
    const r = g.createRadialGradient(x, y, 0, x, y, big ? 26 : 14);
    r.addColorStop(0, 'rgba(255,250,225,0.95)'); r.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = r; g.fillRect(x - 30, y - 30, 60, 60);
  }
});
/**
 * @param {pc.AppBase} app
 * @param {{ combat: object, fighters: object[], views: Map, camera: pc.Entity, firstPerson: () => boolean, me: object }} o
 *   firstPerson：自分を一人称で見ているか（一人称では、自分の体の炎を出さない。目の前をふさぐので）
 */
export function createMiracleFx(app, { combat, fighters, views, camera, firstPerson = () => false, me = null }) {
  const device = app.graphicsDevice;
  const tmp = new pc.Vec3(), tmp2 = new pc.Vec3(), right = new pc.Vec3(), up = new pc.Vec3();
  const yOf = (f) => f.y ?? 0;
  let time = 0;

  // ---- 光の粒（全部で 1 つの形） ----
  const sq = quads(device, SPARKS);
  const sparkMi = new pc.MeshInstance(sq.mesh, addMat(glowTex(device), [1, 1, 1], 1.6, true));
  sparkMi.cull = false;
  const sparkE = new pc.Entity('miracle-sparks');
  sparkE.addComponent('render', { meshInstances: [sparkMi], castShadows: false, receiveShadows: false });
  sparkE.enabled = false;
  app.root.addChild(sparkE);
  const sparks = Array.from({ length: SPARKS }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.03, r: 1, g: 1, b: 1, pull: null, drag: 0 }));
  let sparkCursor = 0;
  function spark(x, y, z, vx, vy, vz, life, size, [r, g, b], opt = {}) {
    let s = null;
    for (let k = 0; k < SPARKS; k++) { const c = sparks[(sparkCursor + k) % SPARKS]; if (c.life <= 0) { s = c; sparkCursor = (sparkCursor + k + 1) % SPARKS; break; } }
    if (!s) { s = sparks[sparkCursor]; sparkCursor = (sparkCursor + 1) % SPARKS; }
    Object.assign(s, { x, y, z, vx, vy, vz, life, max: life, s: size, r, g, b, pull: opt.pull || null, drag: opt.drag ?? 0.6, grav: opt.grav ?? 0 });
  }

  // ---- 光の玉（護符に集まる光・当たった所の光。毎フレーム作り直す） ----
  const gq = quads(device, GLOWS);
  const glowMi = new pc.MeshInstance(gq.mesh, addMat(glowTex(device), [1, 1, 1], 1.4, true));
  glowMi.cull = false;
  const glowE = new pc.Entity('miracle-glows');
  glowE.addComponent('render', { meshInstances: [glowMi], castShadows: false, receiveShadows: false });
  glowE.enabled = false;
  app.root.addChild(glowE);
  const flashes = [];   // { x, y, z, size, life, max, color }

  // ---- 光の柱・輪（数本を使い回す。材質は 1 本ずつ） ----
  const pMesh = pillarMesh(device), rMesh = ringMesh(device, 0.84), hMesh = ringMesh(device, 0.9);
  const makePool = (n, mesh, tex, name) => Array.from({ length: n }, () => {
    const mat = tex ? addMat(tex, [1, 1, 1], 1, true) : addMat(null, [1, 1, 1], 1, true);
    if (!tex) { mat.emissiveMap = null; mat.update(); }
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], castShadows: false, receiveShadows: false });
    e.enabled = false;
    app.root.addChild(e);
    return { e, mat, t: -1 };
  });
  const pillars = Array.from({ length: 4 }, () => {
    const mat = new pc.ShaderMaterial({ uniqueName: 'miracle-pillar', vertexGLSL: PILLAR_VS, fragmentGLSL: PILLAR_FS,
      attributes: { aPosition: pc.SEMANTIC_POSITION, aNormal: pc.SEMANTIC_NORMAL, aUv0: pc.SEMANTIC_TEXCOORD0 } });
    mat.blendType = pc.BLEND_NORMAL; mat.depthWrite = false; mat.cull = pc.CULLFACE_NONE;
    mat.setParameter('uColor', [1, 1, 1]); mat.setParameter('uIntensity', 1); mat.setParameter('uFade', 0); mat.setParameter('uTime', 0);
    mat.update();
    const e = new pc.Entity('miracle-pillar');
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(pMesh, mat)], castShadows: false, receiveShadows: false });
    e.enabled = false;
    app.root.addChild(e);
    return { e, mat, t: -1, shader: true };
  });
  const rings = makePool(4, rMesh, null, 'miracle-ring');
  const haloPool = makePool(4, hMesh, null, 'miracle-halo');   // 加護の輪（細い）
  const bursts = [];   // { item, kind: 'pillar'|'ring', x, y, z, life, t, color, r0, r1, h, intensity, follow }
  function take(pool) { return pool.find((p) => !p.e.enabled) || null; }
  function pillar(f, { radius = 0.75, height = 3.4, life = 1.3, color = [1, 0.85, 0.5], intensity = 1.6 } = {}) {
    const it = take(pillars);
    if (!it) return;
    it.e.enabled = true;
    bursts.push({ it, kind: 'pillar', f, x: f.x, y: yOf(f), z: f.z, life, t: 0, color, r0: radius * 0.4, r1: radius, h: height, intensity });
  }
  function ring(x, y, z, { r0 = 0.4, r1 = 3, life = 0.8, color = [1, 0.86, 0.5], intensity = 2 } = {}) {
    const it = take(rings);
    if (!it) return;
    it.e.enabled = true;
    bursts.push({ it, kind: 'ring', x, y, z, life, t: 0, color, r0, r1, intensity });
  }
  // 加護の輪（蘇生の加護の間ずっと。人ごと）
  const halos = new Map();

  // ---- 光壁 ----
  const wMesh = wallMesh(device), lTex = latticeTex(device);
  lTex.addressU = pc.ADDRESS_REPEAT; lTex.addressV = pc.ADDRESS_REPEAT;   // 模様を壁に繰り返して貼る（端の色を引き伸ばさない）
  const wallViews = new Map();   // 壁 → { e, mat, hit }
  combat.on('wallUp', ({ wall }) => {
    // ふつうの重ね方（加算にすると昼の空の前で白く飛ぶ）：模様の線は濃く光り、線の間はうすいガラス。縁と上は頂点の色で薄く
    const mat = new pc.StandardMaterial();
    mat.useLighting = false; mat.useSkybox = false; mat.useFog = false;
    mat.diffuse = new pc.Color(0, 0, 0);
    mat.emissive = new pc.Color(1, 0.86, 0.52); mat.emissiveMap = lTex; mat.emissiveVertexColor = true; mat.emissiveIntensity = 0;
    mat.opacityMap = lTex; mat.opacityMapChannel = 'a'; mat.opacityVertexColor = true; mat.opacityVertexColorChannel = 'r';
    mat.blendType = pc.BLEND_NORMAL; mat.depthWrite = false; mat.cull = pc.CULLFACE_NONE;
    mat.update();
    const e = new pc.Entity('light-wall');
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(wMesh, mat)], castShadows: false, receiveShadows: false });
    e.setPosition(wall.x, wall.y - 0.05, wall.z);
    e.setEulerAngles(0, wall.yaw, 0);
    e.setLocalScale(wall.half * 2, wall.height, 1);
    app.root.addChild(e);
    wallViews.set(wall, { e, mat, hit: 0, shown: -1 });
    // 立ち上がる光の粒（壁の下の線から）
    const rx = Math.cos((wall.yaw * Math.PI) / 180), rz = -Math.sin((wall.yaw * Math.PI) / 180);
    for (let i = 0; i < 26; i++) {
      const v = (rnd() - 0.5) * wall.half * 2;
      spark(wall.x + rx * v, wall.y + 0.05, wall.z + rz * v, 0, 1.2 + rnd() * 1.6, 0, 0.6 + rnd() * 0.5, 0.05 + rnd() * 0.05, [1, 0.9, 0.62], { drag: 0.9 });
    }
  });
  combat.on('wallHit', ({ wall, x, y, z, amount }) => {
    const v = wallViews.get(wall);
    if (v) v.hit = 1;
    flashes.push({ x, y, z, size: 0.5 + Math.min(1, amount / 30) * 0.6, life: 0.35, max: 0.35, color: [1, 0.95, 0.75] });
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2, sp = 1 + rnd() * 2.5;
      spark(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp + 0.5, (rnd() - 0.5) * sp, 0.35 + rnd() * 0.3, 0.035 + rnd() * 0.03, [1, 0.93, 0.7], { grav: 4 });
    }
  });
  combat.on('wallEnd', ({ wall, broke }) => {
    const v = wallViews.get(wall);
    if (!v) return;
    if (broke) {
      // 砕ける：欠片（光の粒）が散って落ちる
      const rx = Math.cos((wall.yaw * Math.PI) / 180), rz = -Math.sin((wall.yaw * Math.PI) / 180);
      for (let i = 0; i < 70; i++) {
        const h = (rnd() - 0.5) * wall.half * 2, y = wall.y + rnd() * wall.height;
        spark(wall.x + rx * h, y, wall.z + rz * h, (rnd() - 0.5) * 3, rnd() * 2, (rnd() - 0.5) * 3, 0.5 + rnd() * 0.6, 0.04 + rnd() * 0.05, [1, 0.92, 0.68], { grav: 7, drag: 0.4 });
      }
      flashes.push({ x: wall.x, y: wall.y + wall.height * 0.5, z: wall.z, size: 2.6, life: 0.3, max: 0.3, color: [1, 0.95, 0.8] });
      v.e.destroy();
      wallViews.delete(wall);
    } else v.fading = 0.5;   // 時間が来た：ゆっくり消える
  });

  // ---- 炎（淨炎の鎚矛・燃えている人） ----
  const flameMat = new pc.ShaderMaterial({ uniqueName: 'miracle-flame', vertexGLSL: FLAME_VS, fragmentGLSL: HOLY_FS,
    attributes: { aPosition: pc.SEMANTIC_POSITION, aUv0: pc.SEMANTIC_TEXCOORD0 } });
  flameMat.blendType = pc.BLEND_ADDITIVE; flameMat.depthWrite = false; flameMat.cull = pc.CULLFACE_NONE;
  flameMat.setParameter('uTime', 0); flameMat.update();
  const fQuad = flameQuad(device);
  const flames = Array.from({ length: FLAMES }, () => {
    const mi = new pc.MeshInstance(fQuad, flameMat);
    mi.setParameter('uSeed', rnd()); mi.setParameter('uIntensity', 1.6); mi.setParameter('uHoly', 1);
    const e = new pc.Entity('miracle-flame');
    e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
    e.enabled = false;
    app.root.addChild(e);
    return { e, mi, holy: -1, k: -1 };
  });
  let flameUsed = 0;
  function flame(x, y, z, h, w, holy, k) {
    const fl = flames[flameUsed++];
    if (!fl) return;
    fl.e.enabled = true;
    fl.e.setPosition(x, y, z);
    fl.e.setLocalScale(w, h, 1);
    if (fl.holy !== holy) { fl.holy = holy; fl.mi.setParameter('uHoly', holy); }
    const kk = Math.round(k * 20) / 20;
    if (fl.k !== kk) { fl.k = kk; fl.mi.setParameter('uIntensity', 1.7 * kk); }
  }

  // ---- 奇跡の知らせ ----
  const GOLD = [1, 0.84, 0.48], GREEN = [0.72, 1, 0.55], WHITE = [1, 0.97, 0.86];
  combat.on('miracle', ({ fighter: f, id }) => {
    const y = yOf(f);
    if (id === 'heal') {
      pillar(f, { radius: 0.55, height: 2.8, life: 1.3, color: [0.5, 1, 0.32], intensity: 1.3 });
      ring(f.x, y + 0.05, f.z, { r0: 0.3, r1: 1.5, life: 0.9, color: [0.7, 1, 0.5], intensity: 0.7 });
      for (let i = 0; i < 46; i++) {
        const a = rnd() * Math.PI * 2, r = 0.25 + rnd() * 0.55;
        spark(f.x + Math.cos(a) * r, y + rnd() * 1.2, f.z + Math.sin(a) * r, 0, 0.8 + rnd() * 1.6, 0, 0.8 + rnd() * 0.8, 0.03 + rnd() * 0.04, rnd() < 0.5 ? GREEN : GOLD, { drag: 0.95 });
      }
    } else if (id === 'revive') {
      pillar(f, { radius: 0.6, height: 3.6, life: 1.4, color: [1, 0.7, 0.25], intensity: 1.15 });
      ring(f.x, y + 0.05, f.z, { r0: 0.4, r1: 2.0, life: 1.0, color: GOLD, intensity: 0.5 });
    } else if (id === 'flame') {
      const v = views.get(f), p = v?.weaponHead?.(tmp);
      if (p) for (let i = 0; i < 24; i++) spark(p.x, p.y, p.z, (rnd() - 0.5) * 2, rnd() * 2.5, (rnd() - 0.5) * 2, 0.4 + rnd() * 0.4, 0.03 + rnd() * 0.03, [1, 0.78, 0.35], { grav: -1 });
    }
    f.talismanFlash = 1;   // 効き目が出た：護符が強く光ってから収まる
  });
  combat.on('revived', ({ fighter: f }) => {
    const y = yOf(f);
    pillar(f, { radius: 0.9, height: 7, life: 2.0, color: [1, 0.86, 0.55], intensity: 2.2 });
    ring(f.x, y + 0.05, f.z, { r0: 0.5, r1: 5.0, life: 1.1, color: [1, 0.88, 0.6], intensity: 0.8 });
    flashes.push({ x: f.x, y: y + 1, z: f.z, size: 2.4, life: 0.45, max: 0.45, color: [0.8, 0.76, 0.66] });
    for (let i = 0; i < 80; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 1.2;
      spark(f.x + Math.cos(a) * r, y + rnd() * 0.4, f.z + Math.sin(a) * r, Math.cos(a) * 0.6, 1.5 + rnd() * 3.5, Math.sin(a) * 0.6, 1 + rnd() * 1.2, 0.04 + rnd() * 0.05, rnd() < 0.6 ? WHITE : GOLD, { drag: 0.85 });
    }
  });
  combat.on('ignite', ({ fighter: f }) => {
    for (let i = 0; i < 20; i++) spark(f.x + (rnd() - 0.5) * 0.4, yOf(f) + 0.8 + rnd() * 0.8, f.z + (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 1.5, 1 + rnd() * 2, (rnd() - 0.5) * 1.5, 0.4 + rnd() * 0.4, 0.035, [1, 0.6, 0.2], { grav: -1 });
  });

  let emberT = 0;
  return {
    /** 毎フレーム（時間が止まっている間は dt を 0 にする） */
    update(dt) {
      time += dt;
      emberT += dt;
      const wm = camera.getWorldTransform();
      wm.getX(right).normalize(); wm.getY(up).normalize();
      flameMat.setParameter('uTime', time); flameMat.update();

      // 唱えている人：護符へ光が集まる（光の玉と、吸い込まれる光の粒）。効き目が出た後は、強い光が収まっていく
      for (const f of fighters) {
        const a = f.action;
        const casting = f.alive && a?.kind === 'miracle' && !a.done;
        const M = casting ? MIRACLES[a.id] : null;
        const k = casting ? Math.min(1, a.t / M.at) : 0;
        f.talismanFlash = Math.max(0, (f.talismanFlash || 0) - dt * 2.2);
        f.talismanGlow = Math.max(k * k, f.talismanFlash || 0);
        if (!(f.talismanGlow > 0.02)) continue;
        const p = views.get(f)?.talismanPos?.(tmp);
        if (!p) continue;
        flashes.push({ x: p.x, y: p.y, z: p.z, size: 0.18 + f.talismanGlow * 0.55, life: 1e-3, max: 1e-3, color: [1, 0.86, 0.55], keep: f.talismanGlow });
        if (casting && dt > 0 && rnd() < dt * 40) {
          const th = rnd() * Math.PI * 2, ph = rnd() * Math.PI, r = 0.5 + rnd() * 0.3;
          const sx = p.x + Math.sin(ph) * Math.cos(th) * r, sy = p.y + Math.cos(ph) * r, sz = p.z + Math.sin(ph) * Math.sin(th) * r;
          spark(sx, sy, sz, (p.x - sx) * 2.4, (p.y - sy) * 2.4, (p.z - sz) * 2.4, 0.4, 0.025 + rnd() * 0.02, [1, 0.9, 0.6], { drag: 1 });
        }
      }

      // 加護の輪（蘇生の加護の間）：足もとで回り、脈打つ。ときどき光の粒が昇る
      for (const f of fighters) {
        const on = f.alive && f.blessing > 0 && !f.hidden;
        let h = halos.get(f);
        if (on && !h) {
          const it = take(haloPool);
          if (it) { it.e.enabled = true; h = { it }; halos.set(f, h); }
        }
        if (!on && h) { h.it.e.enabled = false; halos.delete(f); continue; }
        if (!h) continue;
        const pulse = 0.75 + 0.25 * Math.sin(time * 3.1 + f.id);
        const fade = Math.min(1, f.blessing / 3);   // 切れる前の 3 秒で薄れる
        h.it.e.setPosition(f.x, yOf(f) + 0.04, f.z);
        h.it.e.setEulerAngles(0, time * 40, 0);
        h.it.e.setLocalScale(0.85, 1, 0.85);
        h.it.mat.emissive.set(1, 0.84, 0.46); h.it.mat.emissiveIntensity = 0.55 * pulse * fade; h.it.mat.update();
        if (dt > 0 && rnd() < dt * 3) {
          const a = rnd() * Math.PI * 2;
          spark(f.x + Math.cos(a) * 0.8, yOf(f) + 0.05, f.z + Math.sin(a) * 0.8, 0, 0.6 + rnd() * 0.6, 0, 1.2, 0.03, GOLD, { drag: 1 });
        }
      }

      // 光の柱・輪の広がり
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.t += dt;
        const u = Math.min(1, b.t / b.life);
        const fade = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
        const e = b.it.e, m = b.it.mat;
        if (b.kind === 'pillar') {
          if (b.f) { b.x = b.f.x; b.z = b.f.z; b.y = yOf(b.f); }
          const r = b.r0 + (b.r1 - b.r0) * Math.min(1, u * 3);
          e.setPosition(b.x, b.y, b.z);
          e.setEulerAngles(0, time * 30, 0);
          e.setLocalScale(r, b.h * (0.6 + 0.4 * Math.min(1, u * 4)), r);
        } else {
          const r = b.r0 + (b.r1 - b.r0) * (1 - (1 - u) * (1 - u));
          e.setPosition(b.x, b.y, b.z);
          e.setLocalScale(r, 1, r);
        }
        if (b.it.shader) { m.setParameter('uColor', b.color); m.setParameter('uIntensity', b.intensity); m.setParameter('uFade', Math.max(0, fade)); m.setParameter('uTime', time); }
        else { m.emissive.set(...b.color); m.emissiveIntensity = b.intensity * Math.max(0, fade); m.update(); }
        if (u >= 1) { e.enabled = false; bursts.splice(i, 1); }
      }

      // 光壁：受け止められる残りが少ないほど薄く、当たると波打って明るく。時間が来たら消える
      for (const [wall, v] of wallViews) {
        v.hit = Math.max(0, v.hit - dt * 3.5);
        const age = wall.life - wall.left;
        const grow = Math.min(1, age / 0.25);
        let k = (0.55 + 0.45 * Math.max(0, wall.guard) / MIRACLES.wall.guard) * (0.92 + 0.08 * Math.sin(time * 9 + wall.id * 10));
        k = k * grow + v.hit * 1.4;
        if (wall.left < 0.8) k *= Math.max(0, wall.left / 0.8);
        if (v.fading !== undefined) {
          v.fading -= dt;
          k *= Math.max(0, v.fading / 0.5);
          if (v.fading <= 0) { v.e.destroy(); wallViews.delete(wall); continue; }
        }
        v.e.setLocalScale(wall.half * 2, wall.height * (0.2 + 0.8 * grow), 1);
        const kk = Math.round(k * 50) / 50;
        if (kk !== v.shown) { v.shown = kk; v.mat.emissiveIntensity = 1.6 * kk; v.mat.opacity = Math.min(1, kk); v.mat.update(); }
      }

      // 炎：淨炎の鎚矛の頭（金の火）と、燃えている人の体（橙の火）
      flameUsed = 0;
      const fp = firstPerson();
      for (const f of fighters) {
        if (!f.alive || f.hidden) continue;
        const v = views.get(f);
        if (f.flame > 0) {
          const p = v?.weaponHead?.(tmp);
          if (p) {
            const k = Math.min(1, f.flame / 1.5) * Math.min(1, (MIRACLES.flame.life - f.flame) / 0.3 + 0.2);
            flame(p.x, p.y - 0.1, p.z, 0.42, 0.26, 1, k);
            flame(p.x, p.y - 0.06, p.z, 0.3, 0.2, 1, k * 0.8);
            if (dt > 0 && rnd() < dt * 18) spark(p.x, p.y + 0.05, p.z, (rnd() - 0.5) * 0.6, 0.6 + rnd() * 1.2, (rnd() - 0.5) * 0.6, 0.5 + rnd() * 0.4, 0.02 + rnd() * 0.02, [1, 0.8, 0.4], { drag: 0.9 });
          }
        }
        if (f.burn && !(f === me && fp)) {
          const y = yOf(f), k = Math.min(1, f.burn.left / 0.6);
          flame(f.x, y + 0.6, f.z, 1.0, 0.6, 0, k);
          flame(f.x + right.x * 0.18, y + 0.9, f.z + right.z * 0.18, 0.7, 0.4, 0, k * 0.8);
          flame(f.x - right.x * 0.2, y + 1.0, f.z - right.z * 0.2, 0.6, 0.36, 0, k * 0.7);
          if (dt > 0 && rnd() < dt * 22) spark(f.x + (rnd() - 0.5) * 0.4, y + 1 + rnd() * 0.6, f.z + (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.5, 1 + rnd() * 1.5, (rnd() - 0.5) * 0.5, 0.6 + rnd() * 0.5, 0.025, [1, 0.55, 0.18], { drag: 0.9 });
        }
      }
      for (let i = flameUsed; i < FLAMES; i++) if (flames[i].e.enabled) flames[i].e.enabled = false;

      // 光の粒を進めて、板に書き込む
      let alive = 0;
      for (let i = 0; i < SPARKS; i++) {
        const s = sparks[i];
        if (s.life <= 0) { billboard(sq, i, 0, -9999, 0, 0, 0, right, up, 0, 0, 0, 0); continue; }
        s.life -= dt;
        const dr = Math.pow(s.drag, dt);
        s.vx *= dr; s.vy = s.vy * dr - s.grav * dt; s.vz *= dr;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        const u = Math.max(0, s.life / s.max), a = Math.min(1, u * 2.5) * Math.min(1, (1 - u) * 8 + 0.3);
        billboard(sq, i, s.x, s.y, s.z, s.s, s.s, right, up, s.r * a, s.g * a, s.b * a, 1);
        alive++;
      }
      sparkE.enabled = alive > 0;
      if (alive) { sq.mesh.setPositions(sq.pos); sq.mesh.setColors(sq.col); sq.mesh.update(pc.PRIMITIVE_TRIANGLES); }

      // 光の玉
      let gi = 0;
      for (let i = flashes.length - 1; i >= 0; i--) {
        const fl = flashes[i];
        if (gi < GLOWS) {
          const k = fl.keep ?? Math.max(0, fl.life / fl.max);
          const sz = fl.size * (fl.keep !== undefined ? 1 : 0.6 + 0.4 * k);
          billboard(gq, gi++, fl.x, fl.y, fl.z, sz, sz, right, up, fl.color[0] * k, fl.color[1] * k, fl.color[2] * k, 1);
        }
        fl.life -= dt;
        if (fl.life <= 0 || fl.keep !== undefined) flashes.splice(i, 1);
      }
      for (let i = gi; i < GLOWS; i++) billboard(gq, i, 0, -9999, 0, 0, 0, right, up, 0, 0, 0, 0);
      glowE.enabled = gi > 0;
      if (gi) { gq.mesh.setPositions(gq.pos); gq.mesh.setColors(gq.col); gq.mesh.update(pc.PRIMITIVE_TRIANGLES); }
    },
    /** 確認用：今出ている物の数 */
    get stats() {
      return { sparks: sparks.filter((s) => s.life > 0).length, flames: flameUsed, walls: wallViews.size, bursts: bursts.length, halos: halos.size };
    },
  };
}
