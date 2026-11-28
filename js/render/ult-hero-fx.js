// 英雄ごとの必殺技の見た目（2 回目。2026-11-25。みんなの画面に出る。game/ult-moves.js の知らせで出す）。共通の光・輪・粒は render/ult-fx.js（fx）を使う
//   楯劍騎士「大海嘯」：足もとから渦を巻いて昇る水の竜巻（2 枚の筒が逆に回る）→ あふれ出す水の壁（外へ広がる波の輪）としぶき → 水の衣（体に巻く細い渦）。
//     弾いた矢・奇跡はしぶき
//   劍騎士「雷霆一閃」：閃光 → 稲妻の姿（体の形に走る稲妻と光の芯）・走った跡の稲妻・道の残像 → 貫いた所の火花 → 踏み込みの斬撃の光の筋 → 空からの落雷。
//     雷の衣：体のまわりでぱちぱち。回避・疾驅の間は稲妻の姿。自分への落雷
//   弓兵「颶風一矢」：大弓に巻く風（体のまわりの螺旋の筋と、弓へ吸い込まれる風の粒）→ 放つ閃光 → 嵐の大矢（光の芯・3 本の螺旋の風・後ろへ散る風の粒）→
//     家の壁を破る所の木と漆喰の破片（world/arrow-holes.js の 'wallHole'）
//   長柄騎士「千岩槍獄」（2026-11-26）：突き立てた所から地が割れる（琥珀に光る割れ目）→ 岩の槍（五角の錐）が輪になって次々に突き上がる・岩の破片と砂煙 →
//     閉じ込めた敵のまわりに岩の檻 → 最後に大きな岩の槍。岩の鎧：足もとから琥珀の粒が昇る
//   打擊騎士「紅蓮崩天」：足もとから炎の柱（2 枚の筒が逆に回る）が昇り、跳び上がる体を包む・火の粉の尾 → 叩きつけると、まわりへ走る溶けた割れ目と
//     噴き上がる炎（地面の火は game/combat.js の地面の火）。紅蓮の衣：体から火の粉。一撃ごとに炎が爆ぜる
//   祓魔僧「天門開闢」：昇る光の粒 → 頭上の光の門（金の二重の輪と回る光の筋）→ 門から降る光の槍（落ちた所に光の輪）→ 門から太い光の柱。
//     光輪：頭の上の金の輪・時々光の粒。返した光は、攻めた人へ走る光の筋
//   状態異常（③-1。2026-11-27）：濡＝しずくが落ちる・重＝足もとの砂ぼこり・崩＝体のまわりの風の筋・眩＝頭の光。発動した時はその色の弾け。
//   纏（属性強化）：武器に沿って属性の粒（水のしぶき・火花・礫・火の粉・風・光）。当てると相手のところで弾ける。組み合わせ（感電・煽火・盲撃）にも弾け
//   操（③-2。2026-11-28。game/controls.js の 'ctrlFx'）：水鞭＝剣の先から伸びてなぎ払う水の鞭としずく・雷步＝稲妻の姿（必殺技と同じ）と道の残像・
//     岩壁＝並んで突き上がる岩の槍の壁（崩れる・時間で沈む）・爆炎＝溶けた割れ目と噴き上がる炎・旋風＝体のまわりの風の筒と渦の筋と木の葉。そらした矢は風の弾け
//   描画命令：線（稲妻・筋・割れ目・門）1・破片 1・岩の槍 1（どれも出ている間だけ）、水の筒・波・炎の筒・風の筒は 1 つずつ（出ている間だけ）。粒と光の玉は render/ult-fx.js
import * as pc from 'playcanvas';
import { canvasTexture, addMat, quads, billboard } from './hall-fire.js';
import { ELEMENT_KINDS, ULT_SPECS, WEAPONS, ULTIMATES } from '../game/data.js';

const LINES = 420, DEBRIS = 160, SPIKES = 96;   // 岩の槍は岩壁（操）の分も足した
const rnd = Math.random;
const ULTIMATE_EL = Object.fromEntries(Object.entries(ULTIMATES).map(([k, u]) => [k, u.element]));   // 英雄 → 属性
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** 線の板の絵（横に柔らかく、真ん中が明るい。加算） */
const lineTex = (device) => canvasTexture(device, 64, (g, S) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const gr = g.createLinearGradient(0, 0, S, 0);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.3, 'rgba(120,120,120,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)');
  gr.addColorStop(0.7, 'rgba(120,120,120,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
});
/** 水の筋（透き通った所は透明。白と水色の細い流れ） */
const waterTex = (device) => canvasTexture(device, 128, (g, S) => {
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * S, w = 2 + Math.random() * 6, y = Math.random() * S, h = S * (0.3 + Math.random() * 0.6), k = 0.25 + Math.random() * 0.6;
    const gr = g.createLinearGradient(0, y, 0, y + h);
    const c = Math.random() < 0.5 ? '255,255,255' : '170,225,255';
    gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(0.5, `rgba(${c},${k})`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr;
    for (const dy of [0, -S]) for (const dx of [0, -S]) g.fillRect(x + dx, y + dy, w, h);
  }
});
/** 破片の粒（丸い、縁が柔らかい。ふつうの重ね方） */
const chipTex = (device) => canvasTexture(device, 32, (g, S) => {
  g.clearRect(0, 0, S, S);
  const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.6, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, S, S);
});

/** 筒（高さ 1。半径は高さで変わる rOf(v)）。筋は斜めに貼る（渦）。上下の端は透ける（頂点の a） */
function twisterMesh(device, rOf, N = 36, NY = 10, twist = 1.2) {
  const pos = [], uv = [], col = [], idx = [];
  for (let j = 0; j <= NY; j++) {
    const v = j / NY, r = rOf(v), a = Math.min(1, v / 0.12) * Math.min(1, (1 - v) / 0.3);
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2;
      pos.push(Math.cos(t) * r, v, Math.sin(t) * r); uv.push(i / N * 3 + v * twist, v * 1.5); col.push(1, 1, 1, a);
    }
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + N + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const m = new pc.Mesh(device);
  m.setPositions(pos); m.setUvs(0, uv); m.setColors(col); m.setIndices(idx);
  m.update(pc.PRIMITIVE_TRIANGLES);
  return m;
}
/** 波の壁（半径 1 の輪。内の縁から高く盛り上がって外へ崩れる。高さ 1） */
function waveMesh(device) {
  const N = 72, R = [0.6, 0.7, 0.8, 0.88, 0.94, 1.0], H = [0.0, 0.45, 0.85, 1.0, 0.75, 0.0], A = [0, 0.55, 0.85, 0.95, 0.7, 0];
  const pos = [], uv = [], col = [], idx = [];
  for (let j = 0; j < R.length; j++) {
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2, wob = 1 + Math.sin(t * 7) * 0.02;
      pos.push(Math.cos(t) * R[j] * wob, H[j], Math.sin(t) * R[j] * wob); uv.push(i / N * 8, j / (R.length - 1)); col.push(1, 1, 1, A[j]);
    }
  }
  for (let j = 0; j < R.length - 1; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + N + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const m = new pc.Mesh(device);
  m.setPositions(pos); m.setUvs(0, uv); m.setColors(col); m.setIndices(idx);
  m.update(pc.PRIMITIVE_TRIANGLES);
  return m;
}

/**
 * @param {pc.AppBase} app
 * @param {{ combat, fighters, views: Map, camera: pc.Entity, fx: object, me?: object, firstPerson?: () => boolean }} o fx：render/ult-fx.js
 */
export function createUltHeroFx(app, { combat, fighters, views, camera, fx, me = null, firstPerson = () => false, dust = null }) {
  const device = app.graphicsDevice;
  const yOf = (f) => f.y ?? 0;
  const right = new pc.Vec3(), up = new pc.Vec3(), tmp = new pc.Vec3();
  let time = 0;

  // ---- 線（稲妻・斬撃の筋・嵐の矢の芯と螺旋。全部で 1 つの形） ----
  const lq = quads(device, LINES);
  const lineMi = new pc.MeshInstance(lq.mesh, addMat(lineTex(device), [1, 1, 1], 2.0, true));
  lineMi.cull = false;
  const lineE = new pc.Entity('ult-lines');
  lineE.addComponent('render', { meshInstances: [lineMi], castShadows: false, receiveShadows: false });
  lineE.enabled = false;
  app.root.addChild(lineE);
  let lineUsed = 0;
  /** カメラの方を向いた線の板（p → q。幅 w） */
  function segment(px, py, pz, qx, qy, qz, w, r, g, b) {
    if (lineUsed >= LINES) return;
    const i = lineUsed++, o = i * 12, P = lq.pos;
    const cp = camera.getPosition();
    const dx = qx - px, dy = qy - py, dz = qz - pz;
    const mx = (px + qx) / 2 - cp.x, my = (py + qy) / 2 - cp.y, mz = (pz + qz) / 2 - cp.z;
    let sx = dy * mz - dz * my, sy = dz * mx - dx * mz, sz = dx * my - dy * mx;
    const sl = Math.hypot(sx, sy, sz) || 1, h = w / 2;
    sx = (sx / sl) * h; sy = (sy / sl) * h; sz = (sz / sl) * h;
    P[o] = px - sx; P[o + 1] = py - sy; P[o + 2] = pz - sz;
    P[o + 3] = px + sx; P[o + 4] = py + sy; P[o + 5] = pz + sz;
    P[o + 6] = qx + sx; P[o + 7] = qy + sy; P[o + 8] = qz + sz;
    P[o + 9] = qx - sx; P[o + 10] = qy - sy; P[o + 11] = qz - sz;
    for (let v = 0; v < 4; v++) { const c = (i * 4 + v) * 4; lq.col[c] = r; lq.col[c + 1] = g; lq.col[c + 2] = b; lq.col[c + 3] = 1; }
  }
  /** 稲妻：p → q を n に折った線。jag：横へずれる大きさ */
  function bolt(px, py, pz, qx, qy, qz, n, jag, w, r, g, b) {
    let ax = px, ay = py, az = pz;
    for (let k = 1; k <= n; k++) {
      const u = k / n, e = k === n ? 0 : jag * (1 - Math.abs(u - 0.5));
      const bx = px + (qx - px) * u + (rnd() - 0.5) * 2 * e, by = py + (qy - py) * u + (rnd() - 0.5) * 2 * e, bz = pz + (qz - pz) * u + (rnd() - 0.5) * 2 * e;
      segment(ax, ay, az, bx, by, bz, w, r, g, b);
      ax = bx; ay = by; az = bz;
    }
  }

  // ---- 破片（家の壁を破った所。木と漆喰。ふつうの重ね方で 1 つの形） ----
  const dq = quads(device, DEBRIS);
  const chipMat = new pc.StandardMaterial();
  chipMat.useLighting = false; chipMat.diffuse = new pc.Color(0, 0, 0); chipMat.emissive = new pc.Color(1, 1, 1); chipMat.emissiveVertexColor = true;
  chipMat.opacityMap = chipTex(device); chipMat.opacityMapChannel = 'a'; chipMat.blendType = pc.BLEND_NORMAL; chipMat.depthWrite = false; chipMat.cull = pc.CULLFACE_NONE;
  chipMat.update();
  const chipMi = new pc.MeshInstance(dq.mesh, chipMat);
  chipMi.cull = false;
  const chipE = new pc.Entity('ult-debris');
  chipE.addComponent('render', { meshInstances: [chipMi], castShadows: false, receiveShadows: false });
  chipE.enabled = false;
  app.root.addChild(chipE);
  const chips = Array.from({ length: DEBRIS }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.05, c: [1, 1, 1], floor: 0 }));
  let chipCursor = 0;
  function chip(x, y, z, vx, vy, vz, life, s, c, floor) {
    const it = chips[chipCursor]; chipCursor = (chipCursor + 1) % DEBRIS;
    Object.assign(it, { x, y, z, vx, vy, vz, life, max: life, s, c, floor });
  }

  // ---- 水（大海嘯） ----
  const wTex = waterTex(device);
  wTex.addressU = pc.ADDRESS_REPEAT; wTex.addressV = pc.ADDRESS_REPEAT;
  const waterMat = (color, opacity) => {
    const m = new pc.StandardMaterial();
    m.useLighting = false; m.useSkybox = false; m.useFog = false;
    m.diffuse = new pc.Color(0, 0, 0); m.emissive = new pc.Color(...color); m.emissiveMap = wTex; m.emissiveIntensity = 1.2;
    m.opacityMap = wTex; m.opacityMapChannel = 'a'; m.opacityVertexColor = true; m.opacityVertexColorChannel = 'a'; m.opacity = opacity;
    m.blendType = pc.BLEND_NORMAL; m.depthWrite = false; m.cull = pc.CULLFACE_NONE;
    m.update();
    return m;
  };
  const tornadoMesh = twisterMesh(device, (v) => 0.5 + 1.0 * Math.pow(v, 1.4), 40, 12, 1.4);
  const veilMesh = twisterMesh(device, (v) => 0.62 + 0.12 * Math.sin(v * Math.PI), 32, 6, 2.0);
  const wMesh = waveMesh(device);
  const makeEnt = (mesh, mat, name) => {
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], castShadows: false, receiveShadows: false });
    e.enabled = false;
    app.root.addChild(e);
    return { e, mat, busy: false };
  };
  const tornados = Array.from({ length: 2 }, () => ({ a: makeEnt(tornadoMesh, waterMat([0.6, 0.88, 1.0], 0.9), 'ult-tornado-a'),
    b: makeEnt(tornadoMesh, waterMat([0.85, 0.96, 1.0], 0.75), 'ult-tornado-b'), busy: false }));
  const waves = Array.from({ length: 2 }, () => makeEnt(wMesh, waterMat([0.62, 0.88, 1.0], 0.95), 'ult-wave'));
  const veils = Array.from({ length: 3 }, () => makeEnt(veilMesh, waterMat([0.7, 0.92, 1.0], 0.5), 'ult-veil'));
  const active = [];   // { kind: 'tornado'|'wave', ... }
  const veilOf = new Map();

  // ---- 岩の槍（千岩槍獄）：地面から突き上がる五角の錐。全部で 1 つの形（光を受ける） ----
  const SV = SPIKES * 15;
  const spikePos = new Float32Array(SV * 3), spikeNor = new Float32Array(SV * 3), spikeCol = new Float32Array(SV * 4);
  const spikeMesh = new pc.Mesh(device);
  spikeMesh.setPositions(spikePos); spikeMesh.setNormals(spikeNor); spikeMesh.setColors(spikeCol);
  spikeMesh.setIndices(Array.from({ length: SV }, (_, i) => i));
  spikeMesh.update(pc.PRIMITIVE_TRIANGLES);
  const rockMat = new pc.StandardMaterial();
  // 岩の色は材質で決める（頂点の色だけでは効かず、昼の光で白く氷のように見えた）。頂点の色は明るさの揺らぎだけ
  rockMat.diffuse = new pc.Color(0.36, 0.31, 0.26); rockMat.diffuseVertexColor = true; rockMat.useMetalness = true; rockMat.metalness = 0; rockMat.gloss = 0.12;
  rockMat.update();
  const spikeMi = new pc.MeshInstance(spikeMesh, rockMat);
  spikeMi.cull = false;
  const spikeE = new pc.Entity('ult-rock-spikes');
  spikeE.addComponent('render', { meshInstances: [spikeMi], castShadows: false, receiveShadows: true });
  spikeE.enabled = false;
  app.root.addChild(spikeE);
  const spikes = [];   // { x, y, z, r, h, tx, tz, b: [5], a0, t, life, rise, sink, shade }
  /** 岩の槍を 1 本出す（delay 秒後に突き上がる。tilt：傾き（外向き＋）、dir：傾ける向き（ラジアン）） */
  function spike(x, y, z, r, h, tilt, dir, life, delay = 0) {
    if (spikes.length >= SPIKES) spikes.shift();
    const K = { x, y, z, r, h, tx: Math.cos(dir) * tilt, tz: Math.sin(dir) * tilt, b: Array.from({ length: 5 }, () => 0.78 + rnd() * 0.4),
      a0: rnd() * Math.PI, t: -delay, life, rise: 0.11, sink: 0.45, shade: 0.75 + rnd() * 0.3 };
    spikes.push(K);
    return K;
  }
  const cracks = [];    // { pts, t, life, c }：地の割れ目・溶けた割れ目（光る線）
  /** 地の割れ目：中心からまわりへ n 本、len m ほど（折れながら） */
  function crack(x, y, z, n, len, c, life, to = null) {
    for (let k = 0; k < n; k++) {
      const th = to ? to[k].th : (k / n) * Math.PI * 2 + rnd() * 0.5, L = to ? Math.hypot(to[k].x - x, to[k].z - z) + 0.6 : len * (0.7 + rnd() * 0.4);
      const pts = [];
      for (let j = 0; j <= 6; j++) {
        const u = j / 6, side = j === 0 ? 0 : (rnd() - 0.5) * 0.7;
        pts.push({ x: x + Math.cos(th) * L * u - Math.sin(th) * side, y: y + 0.06, z: z + Math.sin(th) * L * u + Math.cos(th) * side });
      }
      cracks.push({ pts, t: 0, life, c, grow: 0.25 });
    }
  }
  const EARTH = ELEMENT_KINDS.earth.rgb, FIRE = ELEMENT_KINDS.fire.rgb, HOLY = ELEMENT_KINDS.holy.rgb;

  // ---- 炎の柱（紅蓮崩天）：水の竜巻と同じ筒を、炎の色で（加算） ----
  const fireMat = (color, opacity) => {
    const m = new pc.StandardMaterial();
    m.useLighting = false; m.useSkybox = false; m.useFog = false;
    m.diffuse = new pc.Color(0, 0, 0); m.emissive = new pc.Color(...color); m.emissiveMap = wTex; m.emissiveIntensity = 1.6;
    m.opacityMap = wTex; m.opacityMapChannel = 'a'; m.opacityVertexColor = true; m.opacityVertexColorChannel = 'a'; m.opacity = opacity;
    m.blendType = pc.BLEND_ADDITIVEALPHA; m.depthWrite = false; m.cull = pc.CULLFACE_NONE;
    m.update();
    return m;
  };
  const pillarMesh = twisterMesh(device, (v) => 0.75 + 0.55 * v, 36, 10, 1.8);
  // 赤橙の外と、橙の内（前は黄が強く、金色の光に見えた）
  const firePillars = Array.from({ length: 2 }, () => ({ a: makeEnt(pillarMesh, fireMat([1.0, 0.26, 0.04], 0.95), 'ult-fire-a'),
    b: makeEnt(pillarMesh, fireMat([1.0, 0.55, 0.12], 0.7), 'ult-fire-b'), busy: false }));
  const fireActs = [];   // { p, f, t, life, landed }

  // ---- 光の門（天門開闢） ----
  const gates = [];      // { x, y, z, t, life }
  const spears = [];     // { x, y, z, from, t, fall }
  const beams = [];      // { a, b, t, life }：光輪が返した光

  // ---- 雷（雷霆一閃） ----
  const trails = new Map();   // fighter → [{x, y, z, t}]
  const paths = [];           // { pts, t, life }
  const slashes = [];         // { from, to, t, life }
  const skyBolts = [];        // { x, y, z, t, life, big }
  const TH = ELEMENT_KINDS.thunder.rgb, WIND = ELEMENT_KINDS.wind.rgb;

  combat.on('ultWater', ({ fighter }) => {
    const tw = tornados.find((x) => !x.busy);
    if (!tw) return;
    tw.busy = true; tw.a.e.enabled = true; tw.b.e.enabled = true;
    active.push({ kind: 'tornado', tw, f: fighter, t: 0, x: fighter.x, z: fighter.z, y: yOf(fighter) });
  });
  combat.on('ultBurst', ({ fighter, x, y, z, radius, strike }) => {
    if (fighter.char === 'shield' && ULT_SPECS.shield) {
      const w = waves.find((it) => !it.busy);
      if (w) { w.busy = true; w.e.enabled = true; active.push({ kind: 'wave', it: w, x, y, z, R: radius, t: 0, life: 0.85 }); }
    }
    if (strike) skyBolts.push({ x, y, z, t: 0, life: 0.45, big: true });
  });
  combat.on('ultThunder', ({ fighter, phase, path, from, to }) => {
    const y = yOf(fighter);
    if (phase === 'flashed') fx.glow(fighter.x, y + 1.3, fighter.z, 14, 0.3, [1, 1, 1]);
    if (phase === 'bolt' && path) paths.push({ pts: path, t: 0, life: ULT_SPECS.sword.stance - ULT_SPECS.sword.bolt.from + 0.6 });
    if (phase === 'stance') { fx.glow(fighter.x, y + 1.0, fighter.z, 3.5, 0.3, TH); for (let i = 0; i < 30; i++) burstSpark(fighter.x, y + 1, fighter.z, TH, 5); }
    if (phase === 'dashed' && from && to) slashes.push({ from, to, t: 0, life: 0.55 });
  });
  combat.on('ultPierce', ({ x, y, z, slash }) => {
    fx.glow(x, y, z, slash ? 2.6 : 1.8, 0.25, [1, 1, 1]);
    for (let i = 0; i < (slash ? 26 : 16); i++) burstSpark(x, y, z, i % 2 ? TH : [1, 1, 1], slash ? 9 : 6);
  });
  combat.on('auraStrike', ({ x, y, z }) => skyBolts.push({ x, y, z, t: 0, life: 0.28, big: false }));
  combat.on('ultWind', ({ fighter, phase }) => {
    if (phase !== 'release') return;
    const p = views.get(fighter)?.bowPos?.(tmp) || { x: fighter.x, y: yOf(fighter) + 1.4, z: fighter.z };
    fx.glow(p.x, p.y, p.z, 7, 0.35, [0.85, 1, 0.9]);
    fx.ring(fighter.x, yOf(fighter), fighter.z, 6, 0.55, WIND, 2.2);
    for (let i = 0; i < 40; i++) burstSpark(p.x, p.y, p.z, i % 2 ? WIND : [1, 1, 1], 8);
  });
  // ---- 千岩槍獄 ----
  combat.on('ultEarth', ({ fighter, phase, x, y, z, r0, r1, i, target }) => {
    const S = ULT_SPECS.polearm;
    if (phase === 'slam') {
      crack(x, y, z, 9, S.rings[S.rings.length - 1].r1 + 0.8, EARTH, S.time - S.at + 0.8);
      fx.glow(x, y + 0.3, z, 3.2, 0.35, EARTH.map((c) => c * 0.9));
      for (let n = 0; n < 26; n++) chip(x, y + 0.1, z, (rnd() - 0.5) * 6, 2 + rnd() * 5, (rnd() - 0.5) * 6, 1 + rnd() * 0.8, 0.05 + rnd() * 0.08, rockCol(), y);
    }
    if (phase === 'ring') {
      const rm = (r0 + r1) / 2, n = Math.max(6, Math.round((2 * Math.PI * rm) / 1.7)), life = S.time - S.rings[i].at + 1.0;
      for (let k = 0; k < n; k++) {
        const th = (k / n) * Math.PI * 2 + (i % 2) * 0.3 + (rnd() - 0.5) * 0.25, rr = rm + (rnd() - 0.5) * (r1 - r0) * 0.6;
        const px = x + Math.cos(th) * rr, pz = z + Math.sin(th) * rr;
        spike(px, y, pz, 0.40 + rnd() * 0.2, 1.3 + i * 0.25 + rnd() * 0.6, 0.12 + rnd() * 0.18, th, life, rnd() * 0.08);
        if (rnd() < 0.5) for (let c = 0; c < 3; c++) chip(px, y + 0.2, pz, Math.cos(th) * (1 + rnd() * 2), 2 + rnd() * 4, Math.sin(th) * (1 + rnd() * 2), 0.8 + rnd() * 0.6, 0.04 + rnd() * 0.06, rockCol(), y);
      }
      dust?.burst({ x, y, z, lift: 0.3 });
    }
    if (phase === 'hit' && target) {
      // 岩の檻：閉じ込めた敵のまわりに、内へ傾いた 3 本
      for (let k = 0; k < 3; k++) {
        const th = (k / 3) * Math.PI * 2 + rnd() * 0.5;
        spike(x + Math.cos(th) * 0.62, y, z + Math.sin(th) * 0.62, 0.2, 1.7 + rnd() * 0.3, -0.32, th, Math.max(0.6, target.pinned || 1.5) + 0.2, 0.05);
      }
      fx.glow(x, y + 1, z, 1.4, 0.2, EARTH);
    }
    if (phase === 'big') {
      spike(x, y, z, 1.05, 6.2, 0.04, rnd() * 6.28, 1.5);
      for (let k = 0; k < 5; k++) { const th = rnd() * 6.28; spike(x + Math.cos(th) * 1.3, y, z + Math.sin(th) * 1.3, 0.35, 2 + rnd(), 0.35, th, 1.4, 0.04); }
      crack(x, y, z, 6, 3.5, EARTH, 1.4);
      fx.glow(x, y + 1, z, 4, 0.3, EARTH);
      fx.ring(x, y, z, 4.5, 0.5, EARTH, 2.2);
      for (let n = 0; n < 40; n++) chip(x, y + 0.5, z, (rnd() - 0.5) * 8, 3 + rnd() * 8, (rnd() - 0.5) * 8, 1.2 + rnd(), 0.06 + rnd() * 0.1, rockCol(), y);
      dust?.burst({ x, y, z, lift: 0.2 });
    }
  });
  const rockCol = () => { const k = 0.32 + rnd() * 0.25; return [k * 1.05, k * 0.95, k * 0.82]; };

  // ---- 紅蓮崩天 ----
  combat.on('ultFire', ({ fighter, phase, x, y, z, fissures }) => {
    if (phase === 'pillar') {
      const p = firePillars.find((it) => !it.busy);
      if (p) { p.busy = true; p.a.e.enabled = true; p.b.e.enabled = true; fireActs.push({ p, f: fighter, t: 0, x, y, z }); }
    }
    if (phase === 'jump') { fx.ring(x, y, z, 3.5, 0.45, FIRE, 2.2); fx.glow(x, y + 0.5, z, 3, 0.3, FIRE); }
    if (phase === 'slam') {
      crack(x, y, z, fissures?.length || 7, 5, [1, 0.45, 0.1], 2.4, fissures?.length ? fissures : null);
      crack(x, y, z, 6, 3, [1, 0.7, 0.25], 1.6);
      for (const q of fissures || []) for (let n = 0; n < 14; n++) {
        fx.spark(q.x + (rnd() - 0.5) * 0.6, q.y + 0.1, q.z + (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 1.5, 5 + rnd() * 7, (rnd() - 0.5) * 1.5, 0.6 + rnd() * 0.5, 0.08 + rnd() * 0.08,
          rnd() < 0.5 ? [1, 0.45, 0.08] : [1, 0.8, 0.3], { grav: 6, drag: 0.4 });
      }
      for (let n = 0; n < 30; n++) chip(x, y + 0.2, z, (rnd() - 0.5) * 9, 3 + rnd() * 6, (rnd() - 0.5) * 9, 1 + rnd() * 0.8, 0.05 + rnd() * 0.08, rnd() < 0.5 ? [0.25, 0.12, 0.08] : [1, 0.45, 0.1], y);
      fx.glow(x, y + 0.5, z, 5, 0.4, FIRE);
    }
  });
  combat.on('auraBurst', ({ x, y, z, radius }) => {
    fx.glow(x, y, z, 2.6, 0.25, [1, 0.55, 0.15]);
    fx.ring(x, y - 0.9, z, radius, 0.35, FIRE, 2.4);
    for (let n = 0; n < 22; n++) burstSpark(x, y, z, rnd() < 0.5 ? [1, 0.5, 0.1] : [1, 0.85, 0.35], 6);
  });

  // ---- 天門開闢 ----
  combat.on('ultHoly', ({ fighter, phase, x, y, z, from, fall }) => {
    if (phase === 'gate') { gates.push({ x, y, z, t: 0, life: ULT_SPECS.cleric.time - ULT_SPECS.cleric.at + 0.4 }); fx.glow(x, y, z, 9, 0.5, HOLY); }
    if (phase === 'spear' && from) spears.push({ x, y, z, from, t: 0, fall: fall || 0.18 });
    if (phase === 'impact') {
      fx.glow(x, y + 0.4, z, 2.2, 0.25, [1, 0.92, 0.6]);
      fx.ring(x, y, z, 1.8, 0.35, HOLY, 2.4);
      for (let n = 0; n < 12; n++) burstSpark(x, y + 0.2, z, rnd() < 0.5 ? HOLY : [1, 1, 0.9], 5);
    }
    if (phase === 'pillar') {
      const g = gates[gates.length - 1];
      if (g) { g.pillar = 0; g.px = x; g.pz = z; g.py = y; }
    }
  });
  combat.on('auraReflect', ({ fighter, target }) => {
    beams.push({ a: { x: fighter.x, y: yOf(fighter) + 1.3, z: fighter.z }, b: { x: target.x, y: yOf(target) + 1.2, z: target.z }, t: 0, life: 0.3 });
    fx.glow(target.x, yOf(target) + 1.2, target.z, 1.6, 0.2, HOLY);
  });

  // ---- 状態異常・纏・組み合わせ（③-1） ----
  const ELC = (el) => ELEMENT_KINDS[el]?.rgb || [1, 1, 1];
  // 武器の長さ（持ち手から先まで。纏の粒を武器に沿って出す）
  const BLADE = { armingsword: 0.75, falchion: 0.7, longsword: 1.0, greatsword: 1.2, dualsword: 0.75, mace: 0.5, warhammer: 0.64, lucerne: 1.24, spear: 1.3, dagger: 0.3 };
  combat.on('ailment', ({ fighter: f, el }) => {
    const y = yOf(f) + (f.lift || 0), c = ELC(el);
    if (el === 'water') {
      fx.ring(f.x, y, f.z, 2.2, 0.4, c, 2.4);
      for (let n = 0; n < 26; n++) { const a = rnd() * 6.28, sp = 2 + rnd() * 3; fx.spark(f.x, y + 1 + rnd() * 0.6, f.z, Math.cos(a) * sp, 1.5 + rnd() * 3, Math.sin(a) * sp, 0.6 + rnd() * 0.3, 0.04 + rnd() * 0.03, [0.65, 0.88, 1], { grav: 9, drag: 0.5 }); }
    } else if (el === 'earth') {
      fx.ring(f.x, y, f.z, 2.5, 0.45, c, 2.2);
      for (let n = 0; n < 16; n++) chip(f.x + (rnd() - 0.5) * 0.8, y + 0.1, f.z + (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 3, 1 + rnd() * 2.5, (rnd() - 0.5) * 3, 0.8 + rnd() * 0.5, 0.04 + rnd() * 0.05, rockCol(), y);
      dust?.burst({ x: f.x, y, z: f.z, lift: 0.2 });
    } else if (el === 'wind') {
      fx.ring(f.x, y, f.z, 3, 0.4, c, 2.2);
      for (let n = 0; n < 24; n++) { const a = rnd() * 6.28; fx.spark(f.x + Math.cos(a) * 0.5, y + 0.3 + rnd() * 1.4, f.z + Math.sin(a) * 0.5, -Math.sin(a) * 5, 1 + rnd() * 2, Math.cos(a) * 5, 0.5, 0.035, rnd() < 0.5 ? c : [0.9, 1, 0.95], { drag: 0.4 }); }
    } else if (el === 'holy') {
      fx.glow(f.x, y + 1.6, f.z, 2.6, 0.35, c);
    }
  });
  combat.on('enchantHit', ({ target: t, el }) => {
    const y = yOf(t) + (t.lift || 0) + 1.1, c = ELC(el);
    fx.glow(t.x, y, t.z, 1.2, 0.15, c.map((v) => v * 0.8));
    for (let n = 0; n < 12; n++) burstSpark(t.x, y, t.z, rnd() < 0.6 ? c : [1, 1, 1], 5);
  });
  combat.on('combo', ({ fighter: t, combo }) => {
    const y = yOf(t) + (t.lift || 0);
    if (combo === 'shock') { for (let n = 0; n < 2; n++) skyBolts.push({ x: t.x + (rnd() - 0.5) * 0.6, y, z: t.z + (rnd() - 0.5) * 0.6, t: 0, life: 0.22, big: false }); fx.glow(t.x, y + 1, t.z, 2, 0.2, [0.7, 0.85, 1]); }
    if (combo === 'fan') { fx.ring(t.x, y, t.z, 3.2, 0.45, FIRE, 2.4); for (let n = 0; n < 24; n++) burstSpark(t.x, y + 0.8, t.z, rnd() < 0.5 ? [1, 0.5, 0.1] : [1, 0.85, 0.3], 7); }
    if (combo === 'blind') fx.glow(t.x, y + 1.4, t.z, 2.2, 0.3, HOLY);
  });

  combat.on('deflect', ({ x, y, z }) => {
    fx.glow(x, y, z, 1.6, 0.25, [0.6, 0.85, 1]);
    for (let i = 0; i < 22; i++) { const a = rnd() * Math.PI * 2, sp = 2 + rnd() * 3; fx.spark(x, y, z, Math.cos(a) * sp, 1 + rnd() * 3, Math.sin(a) * sp, 0.5 + rnd() * 0.4, 0.05 + rnd() * 0.04, [0.6, 0.85, 1], { grav: 9, drag: 0.6 }); }
  });
  // ===================== 操（③-2。2026-11-28） =====================
  const WATER = ELEMENT_KINDS.water.rgb;
  const DEGR = Math.PI / 180;
  const whips = [];    // { f, t, yaw, range, arc }：水鞭
  const blasts = [];   // { x, y, z, r, t, life }：爆炎の噴き上がる炎
  const wallRocks = new Map();   // 岩壁 → その岩の槍
  // 旋風の筒（風の色。水の筒と同じ作り）：2 人分
  const galeMesh = twisterMesh(device, (v) => 0.78 + 0.3 * v, 36, 8, 2.4);
  const galeTubes = Array.from({ length: 2 }, () => ({ a: makeEnt(galeMesh, waterMat([0.82, 1.0, 0.86], 0.32), 'ctrl-gale-a'),
    b: makeEnt(galeMesh, waterMat([0.95, 1.0, 0.95], 0.22), 'ctrl-gale-b'), busy: false, f: null }));
  const leafCol = () => (rnd() < 0.5 ? [0.42, 0.5, 0.2] : rnd() < 0.5 ? [0.55, 0.42, 0.2] : [0.3, 0.38, 0.16]);
  /** 岩壁：壁に沿って岩の槍を並べて突き上げる（真ん中から外へ）。根もとは低く太い岩でつなぐ */
  function raiseRockWall(w) {
    const rx = Math.cos(w.yaw * DEGR), rz = -Math.sin(w.yaw * DEGR), fx0 = -Math.sin(w.yaw * DEGR), fz0 = -Math.cos(w.yaw * DEGR);
    // 1 枚の壁に見えるよう、すき間なく 2 列に並べ（前の列が高い）、根もとを太く低い岩でつなぐ（前は 1 列で、すき間から向こうが見えた）
    const list = [], life = w.life + 0.6;
    const row = (n, back, rMin, rAdd, hMin, hAdd, tilt) => {
      for (let i = 0; i < n; i++) {
        const v = -w.half + ((i + 0.5) / n) * w.half * 2 + (rnd() - 0.5) * 0.1, d = back + (rnd() - 0.5) * 0.15;
        list.push(spike(w.x + rx * v - fx0 * d, w.y, w.z + rz * v - fz0 * d, rMin + rnd() * rAdd, w.height * (hMin + rnd() * hAdd), tilt * rnd(),
          rnd() * Math.PI * 2, life, Math.abs(v) * 0.06));
      }
    };
    row(12, -0.12, 0.5, 0.16, 0.9, 0.24, 0.06);    // 前の列（高い）
    row(9, 0.32, 0.55, 0.15, 0.62, 0.22, 0.05);    // 後ろの列（すき間を埋める）
    row(6, 0.08, 0.82, 0.16, 0.42, 0.16, 0.02);    // 根もとの太く低い岩
    wallRocks.set(w, list);
    const ends = [{ th: Math.atan2(rz, rx), x: w.x + rx * w.half, z: w.z + rz * w.half }, { th: Math.atan2(-rz, -rx), x: w.x - rx * w.half, z: w.z - rz * w.half }];
    crack(w.x, w.y, w.z, 2, w.half, EARTH, 1.0, ends);
    fx.glow(w.x, w.y + 0.6, w.z, 3.4, 0.3, EARTH.map((c) => c * 0.9));
    for (let k = 0; k < 30; k++) {
      const v = (rnd() - 0.5) * w.half * 2;
      chip(w.x + rx * v, w.y + 0.2, w.z + rz * v, (rnd() - 0.5) * 3 + fx0 * 2, 2 + rnd() * 5, (rnd() - 0.5) * 3 + fz0 * 2, 0.9 + rnd() * 0.6, 0.05 + rnd() * 0.08, rockCol(), w.y);
    }
    dust?.burst({ x: w.x, y: w.y, z: w.z, lift: 0.25 });
  }
  combat.on('ctrlFx', (e) => {
    const f = e.fighter;
    if (e.kind === 'whip') {
      whips.push({ f, t: 0, yaw: e.yaw, range: e.range, arc: e.arc });
    } else if (e.kind === 'bolt') {
      // 雷步：稲妻の姿は f.boltForm（必殺技と同じ）。始めと終わりに閃光と火花、終わったら道の残像
      fx.glow(e.x, e.y + 1.1, e.z, e.phase === 'start' ? 2.8 : 3.4, 0.22, TH);
      for (let i = 0; i < 18; i++) burstSpark(e.x, e.y + 1, e.z, i % 2 ? TH : [1, 1, 1], e.phase === 'start' ? 5 : 7);
      if (e.phase === 'end') paths.push({ pts: [{ x: e.x0, y: e.y0, z: e.z0 }, { x: e.x, y: e.y, z: e.z }], t: 0, life: 0.5 });
    } else if (e.kind === 'wall') {
      raiseRockWall(e.wall);
    } else if (e.kind === 'blast') {
      // 爆炎：溶けた割れ目・炎の輪・火の粉と礫・砂煙。噴き上がる炎は blasts（少しの間）
      crack(e.x, e.y, e.z, 7, e.radius, [1, 0.45, 0.1], 1.6);
      crack(e.x, e.y, e.z, 5, e.radius * 0.55, [1, 0.72, 0.28], 1.1);
      fx.glow(e.x, e.y + 0.7, e.z, 4.8, 0.35, FIRE);
      fx.ring(e.x, e.y, e.z, e.radius + 0.4, 0.4, FIRE, 2.2);
      for (let n = 0; n < 36; n++) {
        fx.spark(e.x + (rnd() - 0.5) * 1.2, e.y + 0.15, e.z + (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 5, 4 + rnd() * 8, (rnd() - 0.5) * 5, 0.5 + rnd() * 0.5, 0.07 + rnd() * 0.09,
          rnd() < 0.5 ? [1, 0.45, 0.08] : [1, 0.8, 0.3], { grav: 5, drag: 0.5 });
      }
      for (let n = 0; n < 22; n++) chip(e.x, e.y + 0.2, e.z, (rnd() - 0.5) * 8, 3 + rnd() * 5, (rnd() - 0.5) * 8, 0.9 + rnd() * 0.7, 0.05 + rnd() * 0.07, rnd() < 0.5 ? [0.25, 0.12, 0.08] : [1, 0.45, 0.1], e.y);
      blasts.push({ x: e.x, y: e.y, z: e.z, r: e.radius, t: 0, life: 0.55 });
      dust?.burst({ x: e.x, y: e.y, z: e.z, lift: 0.2 });
    } else if (e.kind === 'gale' && e.phase === 'start') {
      // 旋風：足もとから外へ走る風の輪・木の葉と砂ぼこりが外へ飛ぶ
      fx.ring(e.x, e.y + 0.1, e.z, e.radius + 0.8, 0.45, WIND, 2.4);
      fx.ring(e.x, e.y + 1.0, e.z, e.radius * 0.8, 0.35, [0.9, 1, 0.92], 2.0);
      fx.glow(e.x, e.y + 1.1, e.z, 3, 0.25, [0.85, 1, 0.9]);
      for (let n = 0; n < 26; n++) {
        const th = rnd() * Math.PI * 2, sp = 5 + rnd() * 5;
        chip(e.x + Math.cos(th) * 0.6, e.y + 0.3 + rnd() * 1.2, e.z + Math.sin(th) * 0.6, Math.cos(th) * sp - Math.sin(th) * 3, 1.5 + rnd() * 3, Math.sin(th) * sp + Math.cos(th) * 3,
          1.0 + rnd() * 0.6, 0.05 + rnd() * 0.05, leafCol(), e.y);
      }
      dust?.burst({ x: e.x, y: e.y, z: e.z, lift: 0.15 });
      const g = galeTubes.find((it) => !it.busy) || galeTubes[0];
      g.busy = true; g.f = f; g.a.e.enabled = true; g.b.e.enabled = true;
    }
  });
  // 操の当たり：当てた所で、その属性の弾け
  combat.on('hit', ({ target: t, kind, attacker }) => {
    if (kind !== 'control' || !t?.alive || !attacker) return;
    const c = ELC(ULTIMATE_EL[attacker.char]), y = yOf(t) + 1.1;
    for (let i = 0; i < 14; i++) burstSpark(t.x, y, t.z, i % 3 ? c : [1, 1, 1], 5);
    if (attacker.char === 'shield') for (let i = 0; i < 16; i++) { const a = rnd() * 6.28; fx.spark(t.x, y, t.z, Math.cos(a) * 3, 1 + rnd() * 3, Math.sin(a) * 3, 0.5 + rnd() * 0.3, 0.05, [0.7, 0.9, 1], { grav: 9, drag: 0.6 }); }
  });
  // 岩壁：当たった所から礫、崩れる（時間で沈む）
  combat.on('wallHit', ({ wall: w, x, y, z }) => {
    if (w.kind !== 'rock') return;
    for (let k = 0; k < 8; k++) chip(x, y, z, (rnd() - 0.5) * 4, 1 + rnd() * 3, (rnd() - 0.5) * 4, 0.7 + rnd() * 0.4, 0.04 + rnd() * 0.05, rockCol(), w.y);
  });
  combat.on('wallEnd', ({ wall: w, broke }) => {
    if (w.kind !== 'rock') return;
    for (const K of wallRocks.get(w) || []) if (spikes.includes(K)) { K.sink = broke ? 0.3 : 0.7; K.life = Math.min(K.life, Math.max(0, K.t) + K.sink); }
    wallRocks.delete(w);
    if (broke) {
      const rx = Math.cos(w.yaw * DEGR), rz = -Math.sin(w.yaw * DEGR);
      for (let k = 0; k < 40; k++) {
        const v = (rnd() - 0.5) * w.half * 2;
        chip(w.x + rx * v, w.y + 0.3 + rnd() * w.height, w.z + rz * v, (rnd() - 0.5) * 6, 1 + rnd() * 4, (rnd() - 0.5) * 6, 1 + rnd() * 0.6, 0.06 + rnd() * 0.1, rockCol(), w.y);
      }
      dust?.burst({ x: w.x, y: w.y, z: w.z, lift: 0.3 });
    }
  });
  // 旋風にそらされた矢・奇跡：風の弾け
  combat.on('galeDeflect', ({ x, y, z }) => {
    fx.glow(x, y, z, 1.2, 0.18, [0.85, 1, 0.9]);
    for (let i = 0; i < 12; i++) burstSpark(x, y, z, i % 2 ? WIND : [1, 1, 1], 5);
  });

  function burstSpark(x, y, z, c, sp) {
    const a = rnd() * Math.PI * 2, e = (rnd() - 0.3) * 1.2, v = sp * (0.4 + rnd() * 0.6);
    fx.spark(x, y, z, Math.cos(a) * v, e * v * 0.6, Math.sin(a) * v, 0.18 + rnd() * 0.25, 0.04 + rnd() * 0.04, c, { drag: 0.05, flick: true });
  }

  /** 体の形に走る稲妻（稲妻の姿） */
  const BODY = [[0, 1.72], [0, 1.4], [0.32, 1.35], [-0.32, 1.35], [0.45, 0.95], [-0.45, 0.95], [0, 0.95], [0.15, 0.05], [-0.15, 0.05]];
  function boltFigure(f, k = 1) {
    const y = yOf(f), a = (f.yaw * Math.PI) / 180, ca = Math.cos(a), sa = -Math.sin(a);
    const P = (i) => { const [r, h] = BODY[i]; return [f.x + ca * r + (rnd() - 0.5) * 0.15, y + h + (rnd() - 0.5) * 0.1, f.z + sa * r + (rnd() - 0.5) * 0.15]; };
    for (let n = 0; n < 6; n++) {
      const p = P(Math.floor(rnd() * BODY.length)), q = P(Math.floor(rnd() * BODY.length));
      const c = rnd() < 0.5 ? [1, 1, 1] : TH;
      bolt(p[0], p[1], p[2], q[0], q[1], q[2], 4, 0.18, (0.04 + rnd() * 0.05) * k, c[0] * k, c[1] * k, c[2] * k);
    }
    fx.glow(f.x, y + 1.1, f.z, 1.6 * k, 1e-3, TH.map((c) => c * 0.8));
  }

  return {
    update(dt) {
      if (dt <= 0) { lineE.enabled = lineUsed > 0; return; }
      time += dt;
      lineUsed = 0;
      right.copy(camera.right); up.copy(camera.up);

      // ---- 水 ----
      for (let i = active.length - 1; i >= 0; i--) {
        const A = active[i];
        A.t += dt;
        if (A.kind === 'tornado') {
          const S = ULT_SPECS.shield, f = A.f, rise = Math.min(1, A.t / S.at), out = Math.max(0, (A.t - S.at) / 0.7);
          const H = lerp(0.6, 5.8, ease(rise)) * (1 + out * 0.3), s = lerp(0.7, 1.3, rise) * (1 + out * 1.4);
          const fade = 1 - ease(out);
          for (const [it, dir, sp] of [[A.tw.a, 1, 520], [A.tw.b, -1, 380]]) {
            it.e.setPosition(f.x, yOf(f) - 0.05, f.z);
            it.e.setLocalScale(s * (dir > 0 ? 1 : 0.82), H * (dir > 0 ? 1 : 0.9), s * (dir > 0 ? 1 : 0.82));
            it.e.setEulerAngles(0, time * sp * dir, 0);
            it.mat.emissiveMapOffset.set(0, -time * 1.8); it.mat.opacityMapOffset.set(0, -time * 1.8);
            it.mat.opacity = (dir > 0 ? 0.9 : 0.7) * fade * Math.min(1, A.t / 0.15);
            it.mat.update();
          }
          // 昇るしぶき
          if (fade > 0.05 && rnd() < 0.6) for (let n = 0; n < 2; n++) {
            const th = rnd() * Math.PI * 2, r = s * (0.6 + rnd() * 0.5), hy = rnd() * H * 0.8;
            fx.spark(f.x + Math.cos(th) * r, yOf(f) + hy, f.z + Math.sin(th) * r, -Math.sin(th) * 4, 2 + rnd() * 2, Math.cos(th) * 4, 0.4 + rnd() * 0.3, 0.03 + rnd() * 0.03, [0.7, 0.9, 1], { grav: 8, drag: 0.6 });
          }
          if (out >= 1) { A.tw.a.e.enabled = false; A.tw.b.e.enabled = false; A.tw.busy = false; active.splice(i, 1); }
        } else if (A.kind === 'wave') {
          const u = Math.min(1, A.t / A.life), R = lerp(1.2, A.R * 1.05, 1 - (1 - u) * (1 - u)), H = lerp(2.6, 0.25, u);
          A.it.e.setPosition(A.x, A.y - 0.05, A.z);
          A.it.e.setLocalScale(R, H, R);
          A.it.mat.emissiveMapOffset.set(time * 0.6, -time * 1.2); A.it.mat.opacityMapOffset.set(time * 0.6, -time * 1.2);
          A.it.mat.opacity = 0.95 * (1 - Math.pow(u, 2.2));
          A.it.mat.update();
          // 波頭から上がるしぶき
          for (let n = 0; n < 7; n++) {
            const th = rnd() * Math.PI * 2, r = R * (0.88 + rnd() * 0.08);
            fx.spark(A.x + Math.cos(th) * r, A.y + H * 0.9, A.z + Math.sin(th) * r, Math.cos(th) * 3, 2 + rnd() * 4, Math.sin(th) * 3, 0.45 + rnd() * 0.35, 0.04 + rnd() * 0.05, [0.75, 0.92, 1], { grav: 9, drag: 0.6 });
          }
          if (u >= 1) { A.it.e.enabled = false; A.it.busy = false; active.splice(i, 1); }
        }
      }
      // 水の衣：体に巻く細い渦。時々しずく
      for (const f of fighters) {
        const has = f.alive && f.aura?.kind === 'water' && !f.hidden;
        let v = veilOf.get(f);
        if (has && !v) { v = veils.find((x) => !x.busy); if (v) { v.busy = true; v.e.enabled = true; veilOf.set(f, v); } }
        if (!has && v) { v.busy = false; v.e.enabled = false; veilOf.delete(f); continue; }
        if (!v) continue;
        const fp = f === me && firstPerson();
        v.e.enabled = !fp;   // 一人称では自分の渦を出さない（目の前をふさぐ）
        const k = Math.min(1, (f.aura.time - f.aura.left) / 0.4) * Math.min(1, f.aura.left / 0.8);
        v.e.setPosition(f.x, yOf(f) + 0.05, f.z); v.e.setLocalScale(1, 2.1, 1); v.e.setEulerAngles(0, time * 300, 0);
        v.mat.emissiveMapOffset.set(0, -time * 1.4); v.mat.opacityMapOffset.set(0, -time * 1.4);
        v.mat.opacity = 0.55 * k; v.mat.update();
        if (rnd() < dt * 12) { const th = rnd() * Math.PI * 2; fx.spark(f.x + Math.cos(th) * 0.7, yOf(f) + 0.4 + rnd() * 1.6, f.z + Math.sin(th) * 0.7, 0, -0.5, 0, 0.5, 0.04, [0.65, 0.88, 1], { grav: 6 }); }
      }

      // ---- 雷 ----
      for (const f of fighters) {
        if (!f.alive) { trails.delete(f); continue; }
        const dodging = f.action?.kind === 'dodge' || !!f.sprinting;
        const form = !!f.boltForm || (f.aura?.kind === 'thunder' && dodging);
        if (form) {
          if (!(f === me && firstPerson() && !f.boltForm)) boltFigure(f);
          const tr = trails.get(f) || []; tr.push({ x: f.x, y: yOf(f) + 1.0, z: f.z, t: time }); trails.set(f, tr);
        } else if (f.aura?.kind === 'thunder' && rnd() < 0.6 && !(f === me && firstPerson())) {
          // 雷の衣：体のまわりでぱちぱち
          const y = yOf(f), a1 = rnd() * Math.PI * 2, a2 = a1 + (rnd() - 0.5) * 2, h1 = 0.2 + rnd() * 1.5;
          bolt(f.x + Math.cos(a1) * 0.4, y + h1, f.z + Math.sin(a1) * 0.4, f.x + Math.cos(a2) * 0.4, y + h1 + (rnd() - 0.5) * 0.8, f.z + Math.sin(a2) * 0.4, 3, 0.1, 0.04, TH[0], TH[1], TH[2]);
        }
        const tr = trails.get(f);
        if (tr) {
          while (tr.length && time - tr[0].t > 0.3) tr.shift();
          for (let i = 1; i < tr.length; i++) {
            const k = 1 - (time - tr[i].t) / 0.3, a = tr[i - 1], b = tr[i];
            if (Math.hypot(b.x - a.x, b.z - a.z) < 0.02) continue;
            bolt(a.x, a.y, a.z, b.x, b.y, b.z, 3, 0.25, 0.22 * k, TH[0] * k, TH[1] * k, TH[2] * k);
            bolt(a.x, a.y, a.z, b.x, b.y, b.z, 2, 0.1, 0.07 * k, k, k, k);
          }
          if (!tr.length) trails.delete(f);
        }
      }
      // 稲妻の道の残像（ちらつく）
      for (let i = paths.length - 1; i >= 0; i--) {
        const P = paths[i];
        P.t += dt;
        const k = Math.max(0, 1 - P.t / P.life) * (0.5 + 0.5 * Math.abs(Math.sin(time * 37)));
        for (let j = 1; j < P.pts.length; j++) {
          const a = P.pts[j - 1], b = P.pts[j];
          bolt(a.x, a.y + 1.0, a.z, b.x, b.y + 1.0, b.z, 4, 0.3, 0.09 * k, TH[0] * k * 0.8, TH[1] * k * 0.8, TH[2] * k * 0.8);
        }
        if (P.t >= P.life) paths.splice(i, 1);
      }
      // 踏み込みの斬撃の光の筋
      for (let i = slashes.length - 1; i >= 0; i--) {
        const S = slashes[i];
        S.t += dt;
        const k = Math.max(0, 1 - S.t / S.life);
        const a = S.from, b = S.to;
        segment(a.x, a.y + 1.1, a.z, b.x, b.y + 1.1, b.z, 0.5 * k, TH[0] * k, TH[1] * k, TH[2] * k);
        segment(a.x, a.y + 1.1, a.z, b.x, b.y + 1.1, b.z, 0.14 * k, k, k, k);
        bolt(a.x, a.y + 1.1, a.z, b.x, b.y + 1.1, b.z, 8, 0.35, 0.08 * k, k, k, k);
        if (S.t >= S.life) slashes.splice(i, 1);
      }
      // 空からの落雷
      for (let i = skyBolts.length - 1; i >= 0; i--) {
        const B = skyBolts[i];
        B.t += dt;
        const k = Math.max(0, 1 - B.t / B.life) * (0.6 + 0.4 * Math.abs(Math.sin(time * 53)));
        const top = B.big ? 30 : 16, w = B.big ? 0.5 : 0.22;
        for (let n = 0; n < (B.big ? 3 : 2); n++) {
          const ox = (rnd() - 0.5) * 3, oz = (rnd() - 0.5) * 3;
          bolt(B.x + ox, B.y + top, B.z + oz, B.x, B.y, B.z, B.big ? 14 : 9, B.big ? 1.6 : 0.9, w * k, TH[0] * k, TH[1] * k, TH[2] * k);
          bolt(B.x + ox, B.y + top, B.z + oz, B.x, B.y, B.z, B.big ? 14 : 9, B.big ? 1.4 : 0.8, w * 0.35 * k, k, k, k);
        }
        if (B.t < 0.05) fx.glow(B.x, B.y + 1, B.z, B.big ? 6 : 3.5, 0.2, [0.85, 0.75, 1]);   // 大きく白い光は画面が白く飛んだ（写して小さく・紫寄りに）
        if (B.t >= B.life) skyBolts.splice(i, 1);
      }

      // ---- 風（颶風一矢） ----
      for (const f of fighters) {
        if (!f.alive || !f.greatBow || f.hidden) continue;
        const y = yOf(f), bp = views.get(f)?.bowPos?.(tmp);
        // 体のまわりを昇る 2 本の螺旋の風
        if (!(f === me && firstPerson())) {
          for (let j = 0; j < 2; j++) {
            let px = 0, py = 0, pz = 0;
            for (let n = 0; n <= 20; n++) {
              const v = n / 20, th = time * 9 + v * 8 + j * Math.PI, r = 0.8 + v * 0.5;
              const x = f.x + Math.cos(th) * r, yy = y + v * 2.6, z = f.z + Math.sin(th) * r;
              if (n) { const k = Math.sin(v * Math.PI) * 0.9; segment(px, py, pz, x, yy, z, 0.07, WIND[0] * k, WIND[1] * k, WIND[2] * k); }
              px = x; py = yy; pz = z;
            }
          }
        }
        // 弓へ吸い込まれる風の粒
        if (bp) for (let n = 0; n < 4; n++) {
          const th = rnd() * Math.PI * 2, R = 1.5 + rnd() * 1.2, sx = bp.x + Math.cos(th) * R, sy = bp.y + (rnd() - 0.5) * 1.6, sz = bp.z + Math.sin(th) * R, life = 0.3;
          fx.spark(sx, sy, sz, (bp.x - sx) / life, (bp.y - sy) / life, (bp.z - sz) / life, life, 0.035, rnd() < 0.5 ? WIND : [0.9, 1, 0.95], { drag: 1 });
        }
      }
      // 嵐の大矢：光の芯・3 本の螺旋の風・後ろへ散る風の粒
      for (const p of combat.projectiles) {
        if (!p.storm || p.stuck) continue;
        const sp = Math.hypot(p.vx, p.vy, p.vz) || 1, dx = p.vx / sp, dy = p.vy / sp, dz = p.vz / sp;
        // 進む向きに直角な 2 つの向き
        let ux = -dz, uy = 0, uz = dx; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
        const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
        const back = Math.min(12, Math.hypot(p.x - p.x0, p.y - p.y0, p.z - p.z0));
        segment(p.x - dx * back * 0.6, p.y - dy * back * 0.6, p.z - dz * back * 0.6, p.x, p.y, p.z, 0.7, WIND[0] * 0.6, WIND[1] * 0.6, WIND[2] * 0.6);
        segment(p.x - dx * 3, p.y - dy * 3, p.z - dz * 3, p.x + dx * 0.6, p.y + dy * 0.6, p.z + dz * 0.6, 0.22, 1, 1, 1);
        fx.glow(p.x, p.y, p.z, 1.6, 1e-3, [0.8, 1, 0.85]);
        for (let j = 0; j < 3; j++) {
          let qx = 0, qy = 0, qz = 0;
          for (let n = 0; n <= 28; n++) {   // 細かく刻む（前は 16 で、写すとカクカクの線に見えた）
            const s = (n / 28) * back, th = time * 30 + s * 1.0 + j * 2.094, r = 0.3 + s * 0.06;
            const c = Math.cos(th) * r, d = Math.sin(th) * r;
            const x = p.x - dx * s + ux * c + vx * d, y = p.y - dy * s + uy * c + vy * d, z = p.z - dz * s + uz * c + vz * d;
            if (n) { const k = (1 - n / 28) * 0.9; segment(qx, qy, qz, x, y, z, 0.09, WIND[0] * k + 0.2 * k, WIND[1] * k + 0.1 * k, WIND[2] * k + 0.2 * k); }
            qx = x; qy = y; qz = z;
          }
        }
        for (let n = 0; n < 6; n++) {
          const th = rnd() * Math.PI * 2, c = Math.cos(th), d = Math.sin(th), v = 3 + rnd() * 4;
          fx.spark(p.x - dx * rnd() * 2, p.y - dy * rnd() * 2, p.z - dz * rnd() * 2, (ux * c + vx * d) * v - dx * 6, (uy * c + vy * d) * v, (uz * c + vz * d) * v - dz * 6,
            0.35 + rnd() * 0.3, 0.04 + rnd() * 0.04, rnd() < 0.5 ? WIND : [0.95, 1, 0.95], { drag: 0.3 });
        }
      }

      // ---- 岩の槍（千岩槍獄）：突き上がる（少し行き過ぎて戻る）→ 立つ → 沈む ----
      let sv = 0;
      for (let i = spikes.length - 1; i >= 0; i--) {
        const K = spikes[i];
        K.t += dt;
        if (K.t >= K.life) { spikes.splice(i, 1); continue; }
      }
      for (const K of spikes) {
        if (K.t < 0) continue;
        const u = Math.min(1, K.t / K.rise), over = u < 1 ? u * (1 + 0.25 * Math.sin(u * Math.PI)) : 1;
        const sink = K.t > K.life - K.sink ? (K.life - K.t) / K.sink : 1;
        const k = Math.max(0, Math.min(over, 1.1) * sink), yo = -(1 - k) * K.h * 1.05;
        const ax = K.x + K.tx * K.h, ay = K.y + K.h + yo, az = K.z + K.tz * K.h;
        for (let j = 0; j < 5; j++) {
          const t0 = K.a0 + (j / 5) * Math.PI * 2, t1 = K.a0 + ((j + 1) / 5) * Math.PI * 2;
          const bx0 = K.x + Math.cos(t0) * K.r * K.b[j], bz0 = K.z + Math.sin(t0) * K.r * K.b[j];
          const bx1 = K.x + Math.cos(t1) * K.r * K.b[(j + 1) % 5], bz1 = K.z + Math.sin(t1) * K.r * K.b[(j + 1) % 5];
          const by = K.y + yo - 0.25;
          // 面の向き（外向き）
          const ex = bx1 - bx0, ey = 0, ez = bz1 - bz0, fx2 = ax - bx0, fy2 = ay - by, fz2 = az - bz0;
          let nx = ey * fz2 - ez * fy2, ny = ez * fx2 - ex * fz2, nz = ex * fy2 - ey * fx2;
          const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          if (nx * (bx0 + bx1 - 2 * K.x) + nz * (bz0 + bz1 - 2 * K.z) < 0) { nx = -nx; ny = -ny; nz = -nz; }
          const sh = K.shade * (0.85 + 0.15 * ((j * 7) % 3) / 2);
          for (const [px, py, pz, top] of [[bx0, by, bz0, 0], [bx1, by, bz1, 0], [ax, ay, az, 1]]) {
            if (sv >= SV) break;
            spikePos[sv * 3] = px; spikePos[sv * 3 + 1] = py; spikePos[sv * 3 + 2] = pz;
            spikeNor[sv * 3] = nx; spikeNor[sv * 3 + 1] = ny; spikeNor[sv * 3 + 2] = nz;
            const c = top ? 1.0 * sh : 0.62 * sh;   // 根もとは暗く、先は明るい（岩の色は材質）
            spikeCol[sv * 4] = c; spikeCol[sv * 4 + 1] = c * 0.97; spikeCol[sv * 4 + 2] = c * 0.92; spikeCol[sv * 4 + 3] = 1;
            sv++;
          }
        }
      }
      for (let v = sv; v < SV; v++) { spikePos[v * 3 + 1] = -9999; }
      spikeE.enabled = sv > 0;
      if (sv) { spikeMesh.setPositions(spikePos); spikeMesh.setNormals(spikeNor); spikeMesh.setColors(spikeCol); spikeMesh.update(pc.PRIMITIVE_TRIANGLES); }
      // 割れ目（地の割れ目は琥珀、溶けた割れ目は橙）：中から外へ走り、光りながら消える
      for (let i = cracks.length - 1; i >= 0; i--) {
        const C = cracks[i];
        C.t += dt;
        if (C.t >= C.life) { cracks.splice(i, 1); continue; }
        const grow = Math.min(1, C.t / C.grow), k = Math.min(1, (C.life - C.t) / 0.6) * (0.75 + 0.25 * Math.sin(time * 9 + i));
        const n = C.pts.length - 1, upto = grow * n;
        for (let j = 1; j <= n; j++) {
          if (j - 1 > upto) break;
          const a = C.pts[j - 1], b0 = C.pts[j], m = Math.min(1, upto - (j - 1));
          const bx = a.x + (b0.x - a.x) * m, bz = a.z + (b0.z - a.z) * m;
          const w = 0.22 * (1 - (j / n) * 0.6);
          segment(a.x, a.y, a.z, bx, b0.y, bz, w, C.c[0] * k, C.c[1] * k, C.c[2] * k);
        }
      }
      // 岩の鎧：足もとから琥珀の粒が昇る
      for (const f of fighters) {
        if (!f.alive || f.hidden || f.aura?.kind !== 'rock' || (f === me && firstPerson())) continue;
        if (rnd() < dt * 14) { const th = rnd() * 6.28; fx.spark(f.x + Math.cos(th) * 0.5, yOf(f) + 0.1, f.z + Math.sin(th) * 0.5, 0, 0.8 + rnd(), 0, 0.8, 0.04, EARTH, { drag: 0.5 }); }
        if (rnd() < dt * 3) chip(f.x + (rnd() - 0.5) * 0.6, yOf(f) + 0.3 + rnd() * 1.2, f.z + (rnd() - 0.5) * 0.6, 0, 0.5, 0, 0.6, 0.04, rockCol(), yOf(f));
      }

      // ---- 炎の柱（紅蓮崩天）：跳ぶ体を包んで昇り、叩きつけた後に消える ----
      for (let i = fireActs.length - 1; i >= 0; i--) {
        const A = fireActs[i], f = A.f, S = ULT_SPECS.blunt;
        A.t += dt;
        const up = Math.min(1, A.t / S.jump.from), after = Math.max(0, (A.t - S.at) / 0.5);
        const lift = f.lift || 0, H = lerp(1.0, 6.5, ease(up)) + lift * 1.1, sc = lerp(0.6, 1.0, up) * (1 + after * 1.6 + lift * 0.12);
        const fade = 1 - ease(after);
        for (const [it, dir, sp] of [[A.p.a, 1, 460], [A.p.b, -1, 340]]) {
          it.e.setPosition(f.x, yOf(f) - 0.05, f.z);
          it.e.setLocalScale(sc * (dir > 0 ? 1 : 0.78), H * (dir > 0 ? 1 : 0.92), sc * (dir > 0 ? 1 : 0.78));
          it.e.setEulerAngles(0, time * sp * dir, 0);
          it.mat.emissiveMapOffset.set(0, -time * 2.4); it.mat.opacityMapOffset.set(0, -time * 2.4);
          it.mat.opacity = (dir > 0 ? 0.95 : 0.7 * (1 - Math.min(0.6, lift * 0.2))) * fade * Math.min(1, A.t / 0.15);   // 宙にいる間は内を薄く（体が隠れない）
          it.mat.update();
        }
        // 火の粉（跳んでいる間は体から尾を引く）
        if (fade > 0.05) for (let n = 0; n < 3; n++) {
          const th = rnd() * 6.28, r = sc * (0.5 + rnd() * 0.6);
          fx.spark(f.x + Math.cos(th) * r, yOf(f) + lift + rnd() * 1.6, f.z + Math.sin(th) * r, (rnd() - 0.5) * 1.5, 2 + rnd() * 3, (rnd() - 0.5) * 1.5, 0.5 + rnd() * 0.4, 0.05 + rnd() * 0.05,
            rnd() < 0.5 ? [1, 0.45, 0.08] : [1, 0.82, 0.35], { grav: -1, drag: 0.6 });
        }
        if (after >= 1 || !f.alive) { A.p.a.e.enabled = false; A.p.b.e.enabled = false; A.p.busy = false; fireActs.splice(i, 1); }
      }
      // 紅蓮の衣：体から火の粉と小さな炎
      for (const f of fighters) {
        if (!f.alive || f.hidden || f.aura?.kind !== 'fire' || (f === me && firstPerson())) continue;
        if (rnd() < dt * 22) {
          const th = rnd() * 6.28, r = 0.25 + rnd() * 0.25;
          fx.spark(f.x + Math.cos(th) * r, yOf(f) + 0.3 + rnd() * 1.4, f.z + Math.sin(th) * r, 0, 1.2 + rnd() * 1.5, 0, 0.45 + rnd() * 0.3, 0.05 + rnd() * 0.04,
            rnd() < 0.6 ? [1, 0.42, 0.08] : [1, 0.75, 0.3], { grav: -1, drag: 0.8 });
        }
      }

      // ---- 光の門（天門開闢）：金の二重の輪・回る光の筋・最後に太い光の柱 ----
      for (let i = gates.length - 1; i >= 0; i--) {
        const G = gates[i];
        G.t += dt;
        if (G.t >= G.life) { gates.splice(i, 1); continue; }
        const open = ease(G.t / 0.45), k = open * Math.min(1, (G.life - G.t) / 0.4) * (0.85 + 0.15 * Math.sin(time * 6));
        const R1 = 5.2 * open, R2 = 3.4 * open, N = 28;
        for (const [R, w, c, spin] of [[R1, 0.32, HOLY, 0.25], [R2, 0.2, [1, 0.95, 0.75], -0.4]]) {
          for (let j = 0; j < N; j++) {
            const a0 = (j / N) * Math.PI * 2 + time * spin, a1 = ((j + 1) / N) * Math.PI * 2 + time * spin;
            segment(G.x + Math.cos(a0) * R, G.y, G.z + Math.sin(a0) * R, G.x + Math.cos(a1) * R, G.y, G.z + Math.sin(a1) * R, w, c[0] * k, c[1] * k, c[2] * k);
          }
        }
        for (let j = 0; j < 12; j++) {   // 回る光の筋（門の中）
          const a = (j / 12) * Math.PI * 2 - time * 0.6;
          segment(G.x + Math.cos(a) * R2 * 0.2, G.y, G.z + Math.sin(a) * R2 * 0.2, G.x + Math.cos(a) * R1 * 0.95, G.y, G.z + Math.sin(a) * R1 * 0.95, 0.16, HOLY[0] * k * 0.7, HOLY[1] * k * 0.7, HOLY[2] * k * 0.7);
        }
        if (rnd() < 0.5) fx.glow(G.x, G.y, G.z, 4.5 * open, 0.12, HOLY.map((c) => c * 0.38 * k));   // 門の真ん中の光（強すぎると白く飛ぶ）
        // 光の柱：門から地面へ（太い筋を重ねる）
        if (G.pillar !== undefined) {
          G.pillar += dt;
          const pk = Math.max(0, 1 - G.pillar / 0.8) * Math.min(1, G.pillar / 0.06);
          if (pk > 0) {
            // 前は幅 3.6 m と白い芯 1.4 m で、画面が白く飛んだ（共通の光の柱も重なる）。細く、金色に
            segment(G.px, G.py, G.pz, G.x, G.y, G.z, 2.2 * pk, HOLY[0] * pk * 0.6, HOLY[1] * pk * 0.55, HOLY[2] * pk * 0.4);
            segment(G.px, G.py, G.pz, G.x, G.y, G.z, 0.7 * pk, pk * 0.8, pk * 0.75, pk * 0.55);
          }
        }
      }
      // 光の槍：門から落ちる（光の芯と、金の尾）
      for (let i = spears.length - 1; i >= 0; i--) {
        const P = spears[i];
        P.t += dt;
        const u = Math.min(1, P.t / P.fall);
        const hx = lerp(P.from.x, P.x, u), hy = lerp(P.from.y, P.y, u), hz = lerp(P.from.z, P.z, u);
        const dx = P.x - P.from.x, dy = P.y - P.from.y, dz = P.z - P.from.z, dl = Math.hypot(dx, dy, dz) || 1, L = Math.min(4, dl * u);
        segment(hx - (dx / dl) * L, hy - (dy / dl) * L, hz - (dz / dl) * L, hx, hy, hz, 0.34, HOLY[0], HOLY[1], HOLY[2]);
        segment(hx - (dx / dl) * L * 0.6, hy - (dy / dl) * L * 0.6, hz - (dz / dl) * L * 0.6, hx, hy, hz, 0.1, 1, 1, 0.95);
        if (P.t >= P.fall + 0.05) spears.splice(i, 1);
      }
      // 光輪：頭の上の金の輪（宙に浮いている間も）・時々光の粒
      for (const f of fighters) {
        if (!f.alive || f.hidden || f.aura?.kind !== 'holy' || (f === me && firstPerson())) continue;
        const k = Math.min(1, (f.aura.time - f.aura.left) / 0.4) * Math.min(1, f.aura.left / 0.6);
        const hy = yOf(f) + (f.lift || 0) + 2.0, N = 14, R = 0.3;
        for (let j = 0; j < N; j++) {
          const a0 = (j / N) * Math.PI * 2, a1 = ((j + 1) / N) * Math.PI * 2;
          segment(f.x + Math.cos(a0) * R, hy, f.z + Math.sin(a0) * R, f.x + Math.cos(a1) * R, hy, f.z + Math.sin(a1) * R, 0.07, HOLY[0] * k, HOLY[1] * k, HOLY[2] * k);
        }
        if (rnd() < dt * 8) { const th = rnd() * 6.28; fx.spark(f.x + Math.cos(th) * 0.5, yOf(f) + 0.3 + rnd() * 1.4, f.z + Math.sin(th) * 0.5, 0, 0.6, 0, 0.7, 0.035, HOLY, { drag: 0.5 }); }
      }
      // 祓魔僧が浮いて昇る間：まわりを昇る光の粒
      for (const f of fighters) {
        if (!f.alive || f.char !== 'cleric' || f.action?.kind !== 'ult' || !(f.lift > 0.05)) continue;
        for (let n = 0; n < 2; n++) {
          const th = time * 4 + n * Math.PI + rnd() * 0.4, r = 0.9;
          fx.spark(f.x + Math.cos(th) * r, yOf(f) + rnd() * (f.lift + 1.8), f.z + Math.sin(th) * r, -Math.sin(th) * 1.5, 2 + rnd() * 2, Math.cos(th) * 1.5, 0.6, 0.045, rnd() < 0.5 ? HOLY : [1, 1, 0.9], { drag: 0.6 });
        }
      }
      // 返した光：光輪の人から、攻めた人へ走る
      for (let i = beams.length - 1; i >= 0; i--) {
        const B = beams[i];
        B.t += dt;
        const k = Math.max(0, 1 - B.t / B.life);
        segment(B.a.x, B.a.y, B.a.z, B.b.x, B.b.y, B.b.z, 0.22 * k, HOLY[0] * k, HOLY[1] * k, HOLY[2] * k);
        segment(B.a.x, B.a.y, B.a.z, B.b.x, B.b.y, B.b.z, 0.07 * k, k, k, k);
        if (B.t >= B.life) beams.splice(i, 1);
      }

      // ---- 状態異常の続き（濡・重・崩）と纏 ----
      for (const f of fighters) {
        if (!f.alive || f.hidden) continue;
        const fp = f === me && firstPerson(), y = yOf(f) + (f.lift || 0);
        if (f.wet > 0 && !fp && rnd() < dt * 30) {   // 濡：体からしずくが落ちる（写すと小さくて見えなかったので、大きく多く）
          const a = rnd() * 6.28, r = 0.18 + rnd() * 0.2;
          fx.spark(f.x + Math.cos(a) * r, y + 0.5 + rnd() * 1.3, f.z + Math.sin(a) * r, 0, -0.5, 0, 0.6, 0.045 + rnd() * 0.02, [0.55, 0.82, 1], { grav: 9 });
        }
        if (f.heavy > 0 && rnd() < dt * 12) {   // 重：足もとの砂ぼこりと、落ちる小石
          const a = rnd() * 6.28, r = 0.3 + rnd() * 0.3;
          fx.spark(f.x + Math.cos(a) * r, y + 0.05, f.z + Math.sin(a) * r, Math.cos(a) * 0.4, 0.3 + rnd() * 0.4, Math.sin(a) * 0.4, 0.7, 0.07, [0.62, 0.5, 0.34], { drag: 0.8 });
          if (rnd() < 0.3) chip(f.x + (rnd() - 0.5) * 0.5, y + 0.8 + rnd() * 0.8, f.z + (rnd() - 0.5) * 0.5, 0, 0, 0, 0.5, 0.03, rockCol(), y);
        }
        if (f.broken > 0 && !fp) {   // 崩：体のまわりを風の筋が回る
          const W = ELC('wind'), k = Math.min(1, f.broken / 0.5);
          for (let j = 0; j < 2; j++) {
            let px = 0, py = 0, pz = 0;
            for (let n = 0; n <= 8; n++) {
              const v = n / 8, th = time * 10 + v * 3 + j * Math.PI, r = 0.55;
              const x = f.x + Math.cos(th) * r, yy = y + 0.3 + v * 1.4, z = f.z + Math.sin(th) * r;
              if (n) segment(px, py, pz, x, yy, z, 0.05, W[0] * k * 0.8, W[1] * k * 0.8, W[2] * k * 0.8);
              px = x; py = yy; pz = z;
            }
          }
        }
        if (f.enchant) {   // 纏：武器に沿って属性の粒と、武器の頭に小さな光（写すと粒が小さくて見えなかったので、大きく多く）
          const v = views.get(f), c = ELC(f.enchant), isBow = WEAPONS[f.weapon]?.kind === 'bow', L = BLADE[f.weapon] || 0.6;
          const head = isBow ? v?.bowPos?.(tmp) : v?.weaponHead?.(tmp, L * 0.85);
          if (head) fx.glow(head.x, head.y, head.z, 0.45, 1e-3, c.map((k) => k * 0.55));
          const n = rnd() < dt * 40 ? 1 : 0;
          const p = n && (isBow ? v?.bowPos?.(tmp) : v?.weaponHead?.(tmp, L * (0.25 + rnd() * 0.75)));
          if (p) {
            const fire = f.enchant === 'fire', water = f.enchant === 'water', earth = f.enchant === 'earth';
            fx.spark(p.x + (rnd() - 0.5) * 0.08, p.y + (rnd() - 0.5) * 0.08, p.z + (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.5, fire ? 0.9 : water || earth ? -0.3 : 0.3, (rnd() - 0.5) * 0.5,
              0.4 + rnd() * 0.25, 0.04 + rnd() * 0.03, rnd() < 0.7 ? c : [1, 1, 1], { grav: water || earth ? 5 : fire ? -1 : 0, drag: 0.6, flick: f.enchant === 'thunder' });
          }
        }
      }

      // ---- 操：水鞭（剣の先から伸びて、右から左へなぎ払う水の鞭） ----
      for (let i = whips.length - 1; i >= 0; i--) {
        const W = whips[i], f = W.f;
        W.t += dt;
        const SW = 0.2, LIFE = 0.62;
        if (W.t >= LIFE || !f.alive) { whips.splice(i, 1); continue; }
        const u = Math.min(1, W.t / SW), fade = W.t < SW ? 1 : 1 - (W.t - SW) / (LIFE - SW);
        const v = views.get(f), head = v?.weaponHead?.(tmp, (BLADE[f.weapon] || 0.75) * 0.95);
        const bx = head ? head.x : f.x, by = head ? head.y : yOf(f) + 1.2, bz = head ? head.z : f.z;
        const base = W.yaw - W.arc / 2 + W.arc * ease(u);              // 右（向き − arc/2）から左へ
        const reach = W.range * (W.t < SW ? 0.6 + 0.4 * u : 1 - 0.55 * (1 - fade));
        const N = 14;
        let px = bx, py = by, pz = bz;
        for (let k = 1; k <= N; k++) {
          const sN = k / N, ang = (base - 26 * sN * (W.t < SW ? 1 : 0.35)) * DEGR;   // 先は少し遅れてしなる
          const d = 0.4 + sN * reach, sag = Math.sin(sN * Math.PI) * 0.22 + Math.sin(time * 30 + k) * 0.03;
          const qx = f.x - Math.sin(ang) * d, qz = f.z - Math.cos(ang) * d, qy = lerp(by, yOf(f) + 1.05, sN) - sag;
          // 明るい昼の空でも見えるよう、太い水の帯・青い芯・白い芯の 3 重（加算なので、色は濃いめに）
          const w = lerp(0.42, 0.14, sN) * (0.55 + 0.45 * fade);
          segment(px, py, pz, qx, qy, qz, w * 1.8, 0.12 * fade, 0.3 * fade, 0.45 * fade);
          segment(px, py, pz, qx, qy, qz, w, WATER[0] * 1.1 * fade, WATER[1] * 1.1 * fade, WATER[2] * 1.2 * fade);
          segment(px, py, pz, qx, qy, qz, w * 0.4, fade, fade, fade);
          if (rnd() < 0.35 * fade) fx.spark(qx, qy, qz, (rnd() - 0.5) * 1.5, 0.5 + rnd() * 1.5, (rnd() - 0.5) * 1.5, 0.4 + rnd() * 0.3, 0.04 + rnd() * 0.03, [0.72, 0.9, 1], { grav: 9, drag: 0.6 });
          px = qx; py = qy; pz = qz;
        }
        fx.glow(px, py, pz, 0.9 * fade, 1e-3, [0.45, 0.75, 1]);   // 鞭の先の光
      }
      // ---- 操：爆炎（叩いた所から噴き上がる炎） ----
      for (let i = blasts.length - 1; i >= 0; i--) {
        const B = blasts[i];
        B.t += dt;
        if (B.t >= B.life) { blasts.splice(i, 1); continue; }
        const k = 1 - B.t / B.life;
        for (let n = 0; n < 6; n++) {
          const th = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * B.r * 0.7;
          fx.spark(B.x + Math.cos(th) * r, B.y + 0.1, B.z + Math.sin(th) * r, (rnd() - 0.5) * 0.8, 3 + rnd() * 4 * k, (rnd() - 0.5) * 0.8, 0.35 + rnd() * 0.3,
            0.16 + rnd() * 0.16 * k, rnd() < 0.6 ? [1, 0.38, 0.06] : [1, 0.7, 0.2], { grav: -1, drag: 0.8 });
        }
        fx.glow(B.x, B.y + 0.8, B.z, 2.4 * k + 0.6, 1e-3, FIRE.map((c) => c * 0.7 * k));
      }
      // ---- 操：旋風（体のまわりの風の筒・渦を巻く筋・回る木の葉） ----
      for (const g of galeTubes) {
        if (!g.busy) continue;
        const f = g.f, G = f?.gale;
        if (!G || !f.alive) { g.busy = false; g.f = null; g.a.e.enabled = false; g.b.e.enabled = false; continue; }
        const k = Math.min(1, (G.time - G.left) / 0.25) * Math.min(1, G.left / 0.5), y = yOf(f), R = G.r;
        const fp = f === me && firstPerson();
        for (const [it, dir, sp, sc, op] of [[g.a, 1, 520, 1, 0.32], [g.b, -1, 380, 0.72, 0.22]]) {
          it.e.enabled = !fp;
          it.e.setPosition(f.x, y - 0.05, f.z);
          it.e.setLocalScale(R * sc, 2.6 * (sc > 0.9 ? 1 : 1.25), R * sc);
          it.e.setEulerAngles(0, time * sp * dir, 0);
          it.mat.emissiveMapOffset.set(0, -time * 2.2); it.mat.opacityMapOffset.set(0, -time * 2.2);
          it.mat.opacity = op * k; it.mat.update();
        }
        // 渦の筋（円の一部を、昇りながら回る）
        for (let n = 0; n < 7; n++) {
          const ph = time * 7 + n * 0.9, a0 = ph % (Math.PI * 2), rr = R * (0.55 + 0.42 * ((n * 37) % 10) / 10), h = 0.2 + ((time * 1.6 + n * 0.37) % 1) * 2.4;
          let ax = f.x + Math.cos(a0) * rr, az = f.z + Math.sin(a0) * rr, ay = y + h;
          for (let j = 1; j <= 3; j++) {
            const a1 = a0 + j * 0.28, bx2 = f.x + Math.cos(a1) * rr, bz2 = f.z + Math.sin(a1) * rr, by2 = ay + 0.06;
            const c = (0.45 + 0.25 * j / 3) * k;
            segment(ax, ay, az, bx2, by2, bz2, 0.05 + 0.03 * j / 3, WIND[0] * c + 0.25 * c, WIND[1] * c + 0.25 * c, WIND[2] * c + 0.25 * c);
            ax = bx2; ay = by2; az = bz2;
          }
        }
        if (rnd() < dt * 30 * k) {
          const th = rnd() * Math.PI * 2, rr = R * (0.5 + rnd() * 0.5);
          fx.spark(f.x + Math.cos(th) * rr, y + 0.2 + rnd() * 2, f.z + Math.sin(th) * rr, -Math.sin(th) * 6, 1 + rnd() * 1.5, Math.cos(th) * 6, 0.35 + rnd() * 0.25, 0.05 + rnd() * 0.04,
            rnd() < 0.6 ? leafCol() : [0.92, 1, 0.94], { drag: 0.2 });
        }
      }

      // ---- 線を描く ----
      for (let i = lineUsed; i < LINES; i++) { const o = i * 12; for (let k = 0; k < 12; k++) lq.pos[o + k] = k % 3 === 1 ? -9999 : 0; }
      lineE.enabled = lineUsed > 0;
      if (lineUsed) { lq.mesh.setPositions(lq.pos); lq.mesh.setColors(lq.col); lq.mesh.update(pc.PRIMITIVE_TRIANGLES); }
      // ---- 破片 ----
      let alive = 0;
      for (let i = 0; i < DEBRIS; i++) {
        const c = chips[i];
        if (c.life <= 0) { billboard(dq, i, 0, -9999, 0, 0, 0, right, up, 0, 0, 0, 0); continue; }
        c.life -= dt;
        c.vy -= 9.8 * dt; c.vx *= Math.pow(0.5, dt); c.vz *= Math.pow(0.5, dt);
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        if (c.y < c.floor) { c.y = c.floor; c.vy = 0; c.vx *= 0.5; c.vz *= 0.5; }
        const a = Math.min(1, c.life / 0.4);
        billboard(dq, i, c.x, c.y, c.z, c.s, c.s, right, up, c.c[0], c.c[1], c.c[2], a);
        alive++;
      }
      chipE.enabled = alive > 0;
      if (alive) { dq.mesh.setPositions(dq.pos); dq.mesh.setColors(dq.col); dq.mesh.update(pc.PRIMITIVE_TRIANGLES); }
    },
    /** 家の壁が破れた（world/arrow-holes.js）：木と漆喰の破片が矢の向きへ飛び散る */
    wallBreak({ x, y, z, nx, nz, dir, floor, surf }) {
      const cols = surf === 'stone' ? [[0.55, 0.52, 0.48], [0.4, 0.38, 0.35]] : surf === 'plaster' ? [[0.92, 0.88, 0.8], [0.45, 0.32, 0.2]] : [[0.5, 0.36, 0.22], [0.36, 0.25, 0.15]];
      for (let i = 0; i < 60; i++) {
        const c = cols[i % 2], s = 0.04 + rnd() * 0.1, sp = 3 + rnd() * 7;
        chip(x + (rnd() - 0.5) * 1.4, y + (rnd() - 0.2) * 1.6, z + (rnd() - 0.5) * 1.4,
          dir[0] * sp + (rnd() - 0.5) * 4, 1 + rnd() * 4, dir[2] * sp + (rnd() - 0.5) * 4, 1.2 + rnd() * 1.2, s, c, floor);
      }
      fx.glow(x, y, z, 2.5, 0.3, [0.85, 1, 0.9]);
    },
    get stats() { return { lines: lineUsed, chips: chips.filter((c) => c.life > 0).length, active: active.length, veils: veilOf.size, spikes: spikes.length, fire: fireActs.length, gates: gates.length,
      whips: whips.length, blasts: blasts.length, gales: galeTubes.filter((g) => g.busy).length }; },
  };
}
