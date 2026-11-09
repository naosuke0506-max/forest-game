// 大廳の火と空気：動く炎（その場の計算で揺らめく模様を上へ流す）・熾火・火の粉・揺らぐ光、窓からの月の光の筋と漂う塵
//   炎は、カメラの方を向く縦長の板に、雲のような模様（fbm）を上へ流して描く。芯は白く、外へ黄・橙・赤へ。光を足す（加算）
//   火の粉・塵は、それぞれ全部を 1 つの形にまとめ、毎フレーム位置と色を入れ直す（描画命令は 1 つずつ）
import * as pc from 'playcanvas';

const FLAME_VS = /* glsl */ `
attribute vec3 aPosition;
attribute vec2 aUv0;
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
uniform mat4 matrix_view;
varying vec2 vUv;
void main() {
  // 縦は世界の上、横はカメラの右（縦の軸の周りだけ回ってカメラを向く）
  vec3 origin = matrix_model[3].xyz;
  float sx = length(matrix_model[0].xyz), sy = length(matrix_model[1].xyz);
  vec3 right = normalize(vec3(matrix_view[0][0], matrix_view[1][0], matrix_view[2][0]) * vec3(1.0, 0.0, 1.0) + vec3(0.0001));
  vec3 p = origin + right * aPosition.x * sx + vec3(0.0, 1.0, 0.0) * aPosition.y * sy;
  vUv = aUv0;
  gl_Position = matrix_viewProjection * vec4(p, 1.0);
}`;
const FLAME_FS = /* glsl */ `
#include "gammaPS"
#include "tonemappingPS"
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.07 + 1.3; a *= 0.5; } return v; }
void main() {
  float y = vUv.y, t = uTime + uSeed * 31.0;
  // 模様を上へ流し、さらに模様で模様をゆがめる（炎の舌が分かれて揺れる）
  vec2 p = vec2((vUv.x - 0.5) * 2.2, y * 2.0);
  vec2 w = vec2(fbm(p * 1.3 + vec2(uSeed * 7.0, -t * 1.9)), fbm(p * 1.3 + vec2(3.7, -t * 2.3)));
  float n = fbm(p * 2.2 + (w - 0.5) * 1.6 + vec2(0.0, -t * 2.8));
  float x = (vUv.x - 0.5) * 2.0 + (w.x - 0.5) * 0.85 * (0.25 + y);
  // 形：下は広く丸く、上は細く分かれて消える
  float width = 0.78 * pow(1.0 - y, 0.55) * smoothstep(0.0, 0.12, y + 0.05);
  float body = 1.0 - smoothstep(width * 0.3, width, abs(x));
  float heat = body * smoothstep(1.02, 0.15, y + (n - 0.5) * 0.9);
  heat *= 0.45 + 0.9 * n;
  // 色：芯は黄金色、外へ橙・深い赤、上は暗い赤（煙に変わる）
  vec3 col = mix(vec3(0.38, 0.04, 0.0), vec3(0.95, 0.28, 0.03), smoothstep(0.08, 0.32, heat));
  col = mix(col, vec3(1.0, 0.58, 0.14), smoothstep(0.32, 0.62, heat));
  col = mix(col, vec3(1.0, 0.86, 0.55), smoothstep(0.66, 1.0, heat));
  float a = smoothstep(0.05, 0.45, heat) * (1.0 - smoothstep(0.82, 1.0, y));
  vec3 c = col * a * uIntensity * (0.35 + heat * 1.25);
  gl_FragColor = vec4(gammaCorrectOutput(toneMap(c)), 1.0);
}`;

/** 板（横 -0.5〜0.5、縦 0〜1） */
function flameQuad(device) {
  const m = new pc.Mesh(device);
  m.setPositions([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]);
  m.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
  m.setIndices([0, 1, 2, 0, 2, 3]);
  m.update(pc.PRIMITIVE_TRIANGLES);
  return m;
}
function canvasTexture(device, S, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  draw(c.getContext('2d'), S);
  const t = new pc.Texture(device, { width: S, height: S, format: pc.PIXELFORMAT_RGBA8, srgb: true, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
  t.setSource(c);
  return t;
}
/** 黒地の柔らかい光の玉（加算） */
const glowTex = (device) => canvasTexture(device, 128, (g, S) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.15, 'rgba(255,255,255,0.45)'); r.addColorStop(0.45, 'rgba(255,255,255,0.1)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, S, S);
});
/** 熾火（黒い炭の割れ目から赤く光る）。加算で光を足す */
const coalTex = (device) => canvasTexture(device, 256, (g, S) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 420; i++) {
    const x = S / 2 + (Math.random() - 0.5) * S * 0.9, y = S / 2 + (Math.random() - 0.5) * S * 0.9;
    const d = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
    if (d > 0.95) continue;
    const r = 2 + Math.random() * 9, k = (1 - d) * (0.3 + Math.random() * 0.7);
    const q = g.createRadialGradient(x, y, 0, x, y, r);
    q.addColorStop(0, `rgba(255,${120 + Math.random() * 90 | 0},40,${k})`); q.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = q; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
});
/** 光の筋（横に柔らかく、縦は上が強く下へ消える） */
const shaftTex = (device) => canvasTexture(device, 128, (g, S) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / (S - 1), v = y / (S - 1);
    const k = Math.pow(Math.sin(Math.PI * u), 2.2) * (0.25 + 0.75 * Math.pow(1 - v, 0.8)) * Math.min(1, v * 6) * (0.85 + 0.15 * Math.sin(u * 40));
    const i = (y * S + x) * 4; d[i] = d[i + 1] = d[i + 2] = k * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
});

function addMat(tex, color, intensity, vertexColor = false) {
  const m = new pc.StandardMaterial();
  m.useLighting = false; m.useSkybox = false; m.useFog = false;
  m.diffuse = new pc.Color(0, 0, 0);
  m.emissive = new pc.Color(...color); m.emissiveIntensity = intensity;
  m.emissiveMap = tex; m.emissiveVertexColor = vertexColor;
  m.blendType = pc.BLEND_ADDITIVE; m.depthWrite = false; m.cull = pc.CULLFACE_NONE;
  m.update();
  return m;
}

/** n 枚の板を 1 つにまとめた形（位置と色を毎回入れ直す） */
function quads(device, n) {
  const uvs = [], idx = [], nor = new Float32Array(n * 12);
  for (let i = 0; i < n; i++) {
    uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    for (let v = 0; v < 4; v++) nor[(i * 4 + v) * 3 + 1] = 1;
  }
  const pos = new Float32Array(n * 12), col = new Float32Array(n * 16);
  const mesh = new pc.Mesh(device);
  mesh.setPositions(pos); mesh.setNormals(nor); mesh.setUvs(0, uvs); mesh.setColors(col); mesh.setIndices(idx);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return { mesh, pos, col, n };
}
/** 板 i をカメラに向けて置く（right・up：カメラの右と上） */
function billboard(q, i, x, y, z, sx, sy, right, up, r, g, b, a = 1) {
  const o = i * 12, p = q.pos;
  const rx = right.x * sx, ry = right.y * sx, rz = right.z * sx, ux = up.x * sy, uy = up.y * sy, uz = up.z * sy;
  p[o] = x - rx - ux; p[o + 1] = y - ry - uy; p[o + 2] = z - rz - uz;
  p[o + 3] = x + rx - ux; p[o + 4] = y + ry - uy; p[o + 5] = z + rz - uz;
  p[o + 6] = x + rx + ux; p[o + 7] = y + ry + uy; p[o + 8] = z + rz + uz;
  p[o + 9] = x - rx + ux; p[o + 10] = y - ry + uy; p[o + 11] = z - rz + uz;
  for (let v = 0; v < 4; v++) { const c = (i * 4 + v) * 4; q.col[c] = r; q.col[c + 1] = g; q.col[c + 2] = b; q.col[c + 3] = a; }
}

/**
 * @param {pc.AppBase} app
 * @param {number[]} L 描く層
 * @param {pc.Entity} root 広間の入れ物（位置は ORIGIN）
 * @param {{ shadows: number }} opts shadows：影を落とす火の数（0：なし、1：暖炉だけ、3：暖炉と火鉢）
 */
export function createHallFire(app, L, root, { shadows = 1, sparks: sparkCount = 90, motes: moteCount = 70 } = {}) {
  const device = app.graphicsDevice;
  const flameMat = new pc.ShaderMaterial({
    uniqueName: 'hall-flame',
    vertexGLSL: FLAME_VS,
    fragmentGLSL: FLAME_FS,
    attributes: { aPosition: pc.SEMANTIC_POSITION, aUv0: pc.SEMANTIC_TEXCOORD0 },
  });
  flameMat.blendType = pc.BLEND_ADDITIVE;
  flameMat.depthWrite = false;
  flameMat.cull = pc.CULLFACE_NONE;
  flameMat.setParameter('uTime', 0);
  flameMat.update();
  const quad = flameQuad(device);
  const glowMat = addMat(glowTex(device), [1, 0.46, 0.16], 0.28);
  const fires = [], flames = [];

  /**
   * 火 1 つ：炎の板（tongues 枚。大きさ・揺らぎをずらす）・光の玉・光（omni）
   * @param {number[]} pos 炎の根もと、size 炎の高さ、light { intensity, range, shadow }
   */
  const coalMat = addMat(coalTex(device), [1, 0.5, 0.2], 1.2);
  const coals = [];
  /** 熾火の床：炎の根もとの、赤く光る炭（w×d m。横に寝かせた板） */
  function addCoals(pos, w, d) {
    const e = new pc.Entity('coals');
    e.addComponent('render', { type: 'plane', material: coalMat, castShadows: false, receiveShadows: false, layers: L });
    e.setLocalPosition(...pos);
    e.setLocalScale(w, 1, d);
    root.addChild(e);
    coals.push(e);
  }
  function addFire(pos, size, { tongues = 1, spread = 0, light = null, glow = 3, intensity = 1.6 } = {}) {
    const e = new pc.Entity('fire');
    e.setLocalPosition(...pos);
    root.addChild(e);
    for (let i = 0; i < tongues; i++) {
      const f = new pc.Entity();
      const mi = new pc.MeshInstance(quad, flameMat);
      const seed = Math.random();
      mi.setParameter('uSeed', seed);
      mi.setParameter('uIntensity', intensity * (i === 0 ? 1 : 0.8));
      f.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false, layers: L });
      // 舌ごとに位置・高さ・太さをばらつかせる（真ん中ほど高く）
      const u = tongues > 1 ? (i / (tongues - 1)) - 0.5 : 0;
      const off = u * spread + (Math.random() - 0.5) * spread * 0.25;
      const h = size * (i === 0 ? 1 : (0.55 + Math.random() * 0.35) * (1 - Math.abs(u) * 0.5));
      const wk = 0.45 + Math.random() * 0.3;
      f.setLocalPosition(off, 0, (Math.random() - 0.5) * spread * 0.35);
      f.setLocalScale(h * wk, h, 1);
      e.addChild(f);
      flames.push({ e: f, h, w: h * 0.55, seed });
    }
    let lt = null, glowE = null;
    if (glow) {
      glowE = new pc.Entity();
      glowE.addComponent('render', { type: 'plane', material: glowMat, castShadows: false, receiveShadows: false, layers: L });
      glowE.setLocalPosition(0, size * 0.35, 0.02);
      e.addChild(glowE);
    }
    if (light) {
      const le = new pc.Entity();
      le.addComponent('light', {
        type: 'omni', color: new pc.Color(1, 0.55, 0.24), intensity: light.intensity, range: light.range,
        castShadows: !!light.shadow, shadowResolution: light.shadow || 512, shadowType: pc.SHADOW_PCF3_32F,
        shadowBias: 0.12, normalOffsetBias: 0.06, falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED, layers: L,
      });
      le.setLocalPosition(0, size * 0.45, light.forward || 0.05);
      e.addChild(le);
      lt = le.light;
    }
    fires.push({ e, glowE, light: lt, base: light?.intensity ?? 0, size, glowSize: size * glow, seed: Math.random() * 100, pos });
    return fires[fires.length - 1];
  }

  // ---- 火の粉（火から舞い上がる小さな光の粒） ----
  const sp = quads(device, sparkCount);
  const sparkMi = new pc.MeshInstance(sp.mesh, addMat(glowTex(device), [1, 0.6, 0.25], 1.6, true));
  sparkMi.cull = false;
  const sparkE = new pc.Entity('sparks');
  sparkE.addComponent('render', { meshInstances: [sparkMi], castShadows: false, receiveShadows: false, layers: L });
  root.addChild(sparkE);
  const sparks = Array.from({ length: sparkCount }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.01, src: null }));
  const respawn = (s) => {
    const srcs = fires.filter((f) => f.size > 0.45);
    if (!srcs.length) return;
    const f = srcs[Math.floor(Math.random() * srcs.length)];
    s.src = f;
    s.x = f.pos[0] + (Math.random() - 0.5) * f.size * 0.6; s.y = f.pos[1] + f.size * 0.3; s.z = f.pos[2] + (Math.random() - 0.5) * f.size * 0.3;
    s.vx = (Math.random() - 0.5) * 0.25; s.vy = 0.5 + Math.random() * 0.9; s.vz = (Math.random() - 0.5) * 0.25 + 0.05;
    s.max = 0.8 + Math.random() * 1.8; s.life = s.max; s.s = 0.008 + Math.random() * 0.014;
  };

  // ---- 月の光の筋（左上の、見えない高い窓から）と、その中を漂う塵 ----
  let moon = null;
  function addMoonShaft(from, to, width) {
    const dir = new pc.Vec3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const len = dir.length(); dir.normalize();
    const mat = addMat(shaftTex(device), [0.5, 0.62, 0.95], 0.38);
    const planes = [];
    for (let i = 0; i < 2; i++) {
      const e = new pc.Entity('moon-shaft');
      e.addComponent('render', { type: 'plane', material: mat, castShadows: false, receiveShadows: false, layers: L });
      root.addChild(e);
      planes.push(e);
    }
    const mt = quads(device, moteCount);
    const moteMi = new pc.MeshInstance(mt.mesh, addMat(glowTex(device), [0.75, 0.82, 1], 1.0, true));
    moteMi.cull = false;
    const me = new pc.Entity('dust');
    me.addComponent('render', { meshInstances: [moteMi], castShadows: false, receiveShadows: false, layers: L });
    root.addChild(me);
    const motes = Array.from({ length: moteCount }, () => ({ t: Math.random(), r: Math.random() * width * 0.45, a: Math.random() * Math.PI * 2, s: 0.004 + Math.random() * 0.008, ph: Math.random() * 10, sp: 0.01 + Math.random() * 0.02 }));
    moon = { from: new pc.Vec3(...from), dir, len, width, planes, mat, motes, mt };
  }

  const right = new pc.Vec3(), up = new pc.Vec3(), toCam = new pc.Vec3(), tmp = new pc.Vec3(), q = new pc.Quat(), m4 = new pc.Mat4();
  let time = 0;
  return {
    addFire,
    addCoals,
    addMoonShaft,
    get fires() { return fires; },
    /** 毎フレーム：炎の揺らぎ・光の揺らぎ・火の粉・塵。cam：カメラ（世界の向き）、origin：広間の位置 */
    update(dt, cam, origin) {
      time += dt;
      flameMat.setParameter('uTime', time);
      coalMat.emissiveIntensity = 1.05 + 0.2 * Math.sin(time * 2.3) + 0.12 * Math.sin(time * 5.7); coalMat.update();
      const wm = cam.getWorldTransform();
      wm.getX(right).normalize(); wm.getY(up).normalize();
      const camPos = cam.getPosition();
      for (const f of fires) {
        const s = f.seed + time;
        const k = 0.82 + 0.1 * Math.sin(s * 7.3) + 0.06 * Math.sin(s * 13.1 + 1.7) + 0.05 * Math.sin(s * 23.7 + 0.3);
        if (f.light) f.light.intensity = f.base * (0.8 + 0.25 * k);
        if (f.glowE) {
          // 光の玉はカメラに向ける（平面の板を回す）
          f.glowE.lookAt(camPos); f.glowE.rotateLocal(90, 0, 0);
          const g = f.glowSize * (0.9 + 0.12 * k);
          f.glowE.setLocalScale(g, 1, g);
        }
      }
      // 火の粉
      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i];
        if (!s.src) { respawn(s); if (s.src) s.life *= Math.random(); }   // 最初は寿命をばらばらにして、一度に出ないように
        else { s.life -= dt; if (s.life <= 0) respawn(s); }
        if (!s.src) { billboard(sp, i, 0, -100, 0, 0, 0, right, up, 0, 0, 0); continue; }
        s.vy += dt * 0.15; s.vx += (Math.sin(time * 3 + i) * 0.4) * dt; s.vz += (Math.cos(time * 2.3 + i) * 0.3) * dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        const u = s.life / s.max, k = Math.min(1, u * 3) * (0.6 + 0.4 * Math.sin(time * 30 + i * 7));
        billboard(sp, i, s.x, s.y, s.z, s.s, s.s, right, up, 1 * k, 0.55 * k, 0.2 * k);
      }
      sp.mesh.setPositions(sp.pos); sp.mesh.setColors(sp.col); sp.mesh.update(pc.PRIMITIVE_TRIANGLES);
      // 月の光の筋：筋の軸の周りに回して、カメラに広い面を向ける。塵は筋の中をゆっくり漂う
      if (moon) {
        const { from, dir, len, width, planes, motes, mt } = moon;
        const mid = tmp.copy(dir).mulScalar(len / 2).add(from);
        toCam.copy(camPos).sub(origin).sub(mid).normalize();
        const side = new pc.Vec3().cross(dir, toCam).normalize();
        const face = new pc.Vec3().cross(side, dir).normalize();
        planes.forEach((e, i) => {
          // 平面（XZ）の X を横（side）、Z を筋の向き（dir）、Y を面の向き（face）へ
          const s2 = i === 0 ? side : new pc.Vec3().copy(side).mulScalar(0.8).add(new pc.Vec3().copy(face).mulScalar(0.6)).normalize();
          const f2 = new pc.Vec3().cross(s2, dir).normalize();
          m4.set([s2.x, s2.y, s2.z, 0, f2.x, f2.y, f2.z, 0, dir.x, dir.y, dir.z, 0, 0, 0, 0, 1]);
          q.setFromMat4(m4);
          e.setLocalRotation(q);
          e.setLocalPosition(mid.x, mid.y, mid.z);
          e.setLocalScale(width * (i === 0 ? 1 : 0.7), 1, len);
        });
        for (let i = 0; i < motes.length; i++) {
          const m = motes[i];
          m.t = (m.t + dt * m.sp) % 1; m.a += dt * 0.2;
          const px = from.x + dir.x * len * m.t + side.x * Math.cos(m.a) * m.r + face.x * Math.sin(m.a) * m.r;
          const py = from.y + dir.y * len * m.t + side.y * Math.cos(m.a) * m.r + face.y * Math.sin(m.a) * m.r + Math.sin(time * 0.4 + m.ph) * 0.05;
          const pz = from.z + dir.z * len * m.t + side.z * Math.cos(m.a) * m.r + face.z * Math.sin(m.a) * m.r;
          const k = Math.sin(Math.PI * m.t) * (0.5 + 0.5 * Math.sin(time * 1.3 + m.ph)) * (1 - m.r / (width * 0.5));
          billboard(mt, i, px, py, pz, m.s, m.s, right, up, 0.6 * k, 0.7 * k, 0.9 * k);
        }
        mt.mesh.setPositions(mt.pos); mt.mesh.setColors(mt.col); mt.mesh.update(pc.PRIMITIVE_TRIANGLES);
      }
    },
  };
}
