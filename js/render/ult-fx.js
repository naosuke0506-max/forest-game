// 必殺技の光・衝撃波・粒（利用者の指示 2026-11-25「光・衝撃波・粒」。みんなの画面に出る。docs/DESIGN.md「必殺技」）。
//   溜め（必殺技の動きが始まってから放つまで）：英雄のまわりに属性の色の渦（光の筒が回りながら昇る）、足もとの光の輪、
//     まわりから吸い込まれる光の粒、だんだん強くなる光（本物の光 1 つ）
//   放つ（game/combat.js の 'ultBurst'）：地面を走る 2 本の衝撃波の輪・広がる光の半球・空へ伸びる光の柱・属性ごとの粒
//     （水＝しぶきが弧を描いて落ちる・雷＝速く短い火花・地＝重い礫と砂煙・炎＝火の粉が昇る・風＝渦を巻いて舞う・聖＝光の粒がゆっくり昇る）・
//     真ん中の大きな光の玉・強い光（本物の光）
//   描画命令：粒 1・光の玉 1（どちらも出ている間だけ）、渦・輪・半球・柱は 1 つずつ（出ている間だけ）。本物の光は最大 2 つ
//   1 回目（2026-11-25）はどの英雄も同じ「属性の衝撃波」。2 回目で英雄ごとの技の見た目を足す
import * as pc from 'playcanvas';
import { canvasTexture, glowTex, addMat, quads, billboard } from './hall-fire.js';
import { ELEMENT_KINDS, ULT_BURST } from '../game/data.js';
import { ultOf } from '../game/ultimate.js';

const SPARKS = 420, GLOWS = 12;
const rnd = Math.random;
const lerp = (a, b, k) => a + (b - a) * k;
const range = ([a, b]) => a + (b - a) * rnd();

// 属性ごとの粒の飛び方：grav（下向きの重さ。負は昇る）、up・out（上へ・外への速さ m/秒）、drag（1 秒で残る速さの割合）、
// life（秒）、size（m）、spin（渦の速さ）、flick（ちらつく）、tint（色の幅）
const STYLE = {
  water:   { grav: 9, up: [2.5, 6.5], out: [5, 11], drag: 0.5, life: [0.7, 1.2], size: [0.05, 0.12], tint: [[0.5, 0.78, 1], [0.88, 0.97, 1]] },
  thunder: { grav: 0, up: [0, 3], out: [12, 22], drag: 0.04, life: [0.16, 0.34], size: [0.04, 0.08], flick: true, tint: [[0.8, 0.72, 1], [1, 1, 1]] },
  earth:   { grav: 15, up: [3, 8], out: [4, 9], drag: 0.6, life: [0.8, 1.3], size: [0.07, 0.15], tint: [[1, 0.64, 0.24], [0.62, 0.44, 0.26]] },
  fire:    { grav: -2.5, up: [2, 5.5], out: [5, 10], drag: 0.35, life: [0.8, 1.5], size: [0.05, 0.11], flick: true, tint: [[1, 0.6, 0.16], [1, 0.24, 0.04]] },
  wind:    { grav: -1.2, up: [1, 4], out: [6, 11], drag: 0.4, life: [0.7, 1.3], size: [0.04, 0.09], spin: 7, tint: [[0.45, 1, 0.66], [0.86, 1, 0.92]] },
  holy:    { grav: -1.6, up: [1.5, 4], out: [4, 8], drag: 0.5, life: [1.0, 1.7], size: [0.05, 0.1], tint: [[1, 0.86, 0.46], [1, 1, 0.84]] },
};

/** 細い筋（渦の筒・光の柱に貼る。上下左右に繰り返す。筒の形が斜めに貼るので、渦を巻いて見える） */
const streakTex = (device) => canvasTexture(device, 128, (g, S) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * S, w = 1 + Math.random() * 3, y = Math.random() * S, h = S * (0.25 + Math.random() * 0.5), k = 0.15 + Math.random() * 0.5;
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${k})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    for (const dy of [0, -S]) for (const dx of [0, -S]) g.fillRect(x + dx, y + dy, w, h);   // 端でつながるように
  }
});

/** 開いた筒（半径 1・高さ 1）。上下の端へ薄れる（頂点の色。加算なので暗い＝透ける） */
function tubeMesh(device, N = 32, fadeTop = 0.55, fadeBottom = 0.12) {
  const pos = [], uv = [], col = [], idx = [], NY = 4;
  for (let j = 0; j <= NY; j++) {
    const v = j / NY, k = Math.min(1, v / fadeBottom) * Math.min(1, (1 - v) / fadeTop);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      pos.push(Math.cos(a), v, Math.sin(a)); uv.push((i / N) * 3 + v * 0.8, v); col.push(k, k, k, 1);   // 筋を斜めに（渦）
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
/** 地面の輪（半径 1）：内の縁 → 光る帯 → 外の縁。inner：帯の内側の半径 */
function ringMesh(device, inner) {
  const SEG = 64, radii = [inner, inner + (1 - inner) * 0.7, 1.0], ks = [0, 1, 0];
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    radii.forEach((r, j) => { pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); col.push(ks[j], ks[j], ks[j], 1); });
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
/** 半球（半径 1）：下の縁が明るく、上へ行くほど透ける */
function domeMesh(device) {
  const NL = 8, NA = 36, pos = [], col = [], idx = [];
  for (let j = 0; j <= NL; j++) {
    const th = (j / NL) * (Math.PI / 2), y = Math.sin(th), r = Math.cos(th), k = Math.pow(1 - j / NL, 1.6) * 0.9 + 0.1;
    for (let i = 0; i <= NA; i++) { const a = (i / NA) * Math.PI * 2; pos.push(Math.cos(a) * r, y, Math.sin(a) * r); col.push(k, k, k, 1); }
  }
  for (let j = 0; j < NL; j++) for (let i = 0; i < NA; i++) {
    const a = j * (NA + 1) + i, b = a + NA + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const m = new pc.Mesh(device);
  m.setPositions(pos); m.setColors(col); m.setIndices(idx);
  m.update(pc.PRIMITIVE_TRIANGLES);
  return m;
}

/**
 * @param {pc.AppBase} app
 * @param {{ combat: object, fighters: object[], camera: pc.Entity, dust?: object }} o dust：砂煙（render/ult-dust.js。地の属性で使う）
 */
export function createUltFx(app, { combat, fighters, camera, dust = null }) {
  const device = app.graphicsDevice;
  const right = new pc.Vec3(), up = new pc.Vec3();
  const yOf = (f) => f.y ?? 0;
  let time = 0;

  // ---- 粒（全部で 1 つの形） ----
  const sq = quads(device, SPARKS);
  const sparkMi = new pc.MeshInstance(sq.mesh, addMat(glowTex(device), [1, 1, 1], 2.2, true));
  sparkMi.cull = false;
  const sparkE = new pc.Entity('ult-sparks');
  sparkE.addComponent('render', { meshInstances: [sparkMi], castShadows: false, receiveShadows: false });
  sparkE.enabled = false;
  app.root.addChild(sparkE);
  const sparks = Array.from({ length: SPARKS }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.05, r: 1, g: 1, b: 1, grav: 0, drag: 0.5, pull: null, flick: false }));
  let cursor = 0;
  function spark(x, y, z, vx, vy, vz, life, size, [r, g, b], { grav = 0, drag = 0.5, pull = null, flick = false } = {}) {
    let s = null;
    for (let k = 0; k < SPARKS; k++) { const c = sparks[(cursor + k) % SPARKS]; if (c.life <= 0) { s = c; cursor = (cursor + k + 1) % SPARKS; break; } }
    if (!s) { s = sparks[cursor]; cursor = (cursor + 1) % SPARKS; }
    Object.assign(s, { x, y, z, vx, vy, vz, life, max: life, s: size, r, g, b, grav, drag, pull, flick });
  }
  // ---- 光の玉（真ん中の大きな光） ----
  const gq = quads(device, GLOWS);
  const glowMi = new pc.MeshInstance(gq.mesh, addMat(glowTex(device), [1, 1, 1], 1.6, true));
  glowMi.cull = false;
  const glowE = new pc.Entity('ult-glows');
  glowE.addComponent('render', { meshInstances: [glowMi], castShadows: false, receiveShadows: false });
  glowE.enabled = false;
  app.root.addChild(glowE);
  const glows = [];   // { x, y, z, size, life, max, color }

  // ---- 形（使い回す。材質は 1 つずつ） ----
  const sTex = streakTex(device);
  sTex.addressU = pc.ADDRESS_REPEAT; sTex.addressV = pc.ADDRESS_REPEAT;
  const tube = tubeMesh(device), ring = ringMesh(device, 0.86), wideRing = ringMesh(device, 0.7), dome = domeMesh(device);
  const pool = (n, mesh, tex, name) => Array.from({ length: n }, () => {
    const mat = addMat(tex, [1, 1, 1], 1, true);
    if (!tex) { mat.emissiveMap = null; mat.update(); }
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], castShadows: false, receiveShadows: false });
    e.enabled = false;
    app.root.addChild(e);
    return { e, mat, busy: false };
  });
  const auras = pool(2, tube, sTex, 'ult-aura');        // 溜めの渦
  const footRings = pool(2, ring, null, 'ult-foot');     // 溜めの足もとの輪
  const waves = pool(4, ring, null, 'ult-wave');         // 衝撃波の輪（細く速い）
  const waves2 = pool(2, wideRing, null, 'ult-wave2');   // 衝撃波の輪（太く遅い）
  const domes = pool(2, dome, null, 'ult-dome');
  const pillars = pool(2, tube, sTex, 'ult-pillar');
  const take = (p) => { const it = p.find((x) => !x.busy); if (it) { it.busy = true; it.e.enabled = true; } return it; };
  const free = (it) => { it.busy = false; it.e.enabled = false; };
  const tint = (it, [r, g, b], k) => { it.mat.emissive.set(r, g, b); it.mat.emissiveIntensity = k; it.mat.update(); };

  // ---- 本物の光（溜めと放つ瞬間。2 つまで） ----
  const lights = Array.from({ length: 2 }, () => {
    const e = new pc.Entity('ult-light');
    e.addComponent('light', { type: 'omni', color: new pc.Color(1, 1, 1), intensity: 0, range: 16, castShadows: false });
    e.enabled = false;
    app.root.addChild(e);
    return { e, busy: false };
  });

  // 溜めている人：{ f, E, St, aura, foot, light, t }
  const charging = new Map();
  // 放った後の物：{ kind, it, x, y, z, t, life, ... }
  const bursts = [];

  combat.on('ult', ({ fighter, hero, at }) => {
    const U = ultOf(fighter), E = ELEMENT_KINDS[U?.element] || ELEMENT_KINDS.holy;
    // 英雄ごとの技（2 回目）は、溜めの渦・輪・吸い込まれる粒を出さない（render/ult-hero-fx.js が技ごとの見た目を出す）。光だけ使う
    const c = { f: fighter, E, St: STYLE[U?.element] || STYLE.holy, aura: hero ? null : take(auras), foot: hero ? null : take(footRings),
      light: lights.find((l) => !l.busy) || null, t: 0, acc: 0, hero: !!hero, at: at || ULT_BURST.at };
    if (c.light) { c.light.busy = true; c.light.e.enabled = true; c.light.e.light.color = new pc.Color(...E.rgb); }
    charging.get(fighter) && endCharge(charging.get(fighter));
    charging.set(fighter, c);
  });
  function endCharge(c) {
    if (c.aura) free(c.aura);
    if (c.foot) free(c.foot);
    if (c.light) { c.light.busy = false; c.light.e.enabled = false; c.light.e.light.intensity = 0; }
    charging.delete(c.f);
  }

  combat.on('ultBurst', ({ fighter, ult, x, y, z, radius, ground }) => {
    const c = charging.get(fighter);
    if (c) endCharge(c);
    const el = ult?.element || 'holy', E = ELEMENT_KINDS[el] || ELEMENT_KINDS.holy, St = STYLE[el] || STYLE.holy, rgb = E.rgb;
    const white = [lerp(rgb[0], 1, 0.6), lerp(rgb[1], 1, 0.6), lerp(rgb[2], 1, 0.6)];
    // 衝撃波の輪：細く速い 2 本（少しずらす）と、太く遅い 1 本
    for (const [p, life, k, delay, col] of [[waves, 0.42, 2.2, 0, white], [waves, 0.6, 2.0, 0.08, rgb], [waves2, 0.85, 0.55, 0, rgb]]) {
      const it = take(p);
      if (it) bursts.push({ kind: 'ring', it, x, y: y + 0.12, z, t: -delay, life, r0: 0.6, r1: radius * (p === waves2 ? 0.85 : 1.08), k, color: col });
    }
    // ground：地面を走る技（千岩槍獄）。光の半球と柱は出さない（岩の槍が隠れた）
    const dm = ground ? null : take(domes);
    if (dm) bursts.push({ kind: 'dome', it: dm, x, y, z, t: 0, life: 0.55, r0: 0.8, r1: radius * 0.72, k: 0.45, color: rgb });
    const pl = ground ? null : take(pillars);
    if (pl) bursts.push({ kind: 'pillar', it: pl, x, y, z, t: 0, life: 0.95, k: 1.7, color: rgb });
    // 光の玉：真ん中は小さく白く、まわりは属性の色（昼の明るい所で白く飛ばないように、大きさと明るさを抑える）
    glows.push({ x, y: y + 1.1, z, size: 2.8, life: 0.3, max: 0.3, color: white.map((c) => c * 0.6) });
    glows.push({ x, y: y + 0.6, z, size: ground ? 3.5 : 6.5, life: 0.6, max: 0.6, color: rgb.map((c) => c * (ground ? 0.35 : 0.55)) });
    // 本物の光：強く光ってすぐ消える
    const L = lights.find((l) => !l.busy);
    if (L) {
      L.busy = true; L.e.enabled = true;
      L.e.setPosition(x, y + 1.6, z);
      L.e.light.color = new pc.Color(...white);
      bursts.push({ kind: 'light', it: L, t: 0, life: 0.7 });
    }
    // 属性の粒：外へ飛び散る（地面に沿って広く、少し上へ）
    for (let i = 0; i < 150; i++) {
      const a = rnd() * Math.PI * 2, out = range(St.out), upv = range(St.up), ca = Math.cos(a), sa = Math.sin(a);
      const spin = St.spin ? St.spin * (0.6 + rnd() * 0.6) : 0;
      const t2 = rnd();
      const col = [lerp(St.tint[0][0], St.tint[1][0], t2), lerp(St.tint[0][1], St.tint[1][1], t2), lerp(St.tint[0][2], St.tint[1][2], t2)];
      spark(x + ca * 0.5, y + 0.3 + rnd() * 1.4, z + sa * 0.5, ca * out - sa * spin, upv, sa * out + ca * spin, range(St.life), range(St.size), col,
        { grav: St.grav, drag: St.drag, flick: !!St.flick });
    }
    // 真ん中から上へ吹き上がる粒
    for (let i = 0; i < 50; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 0.8;
      spark(x + Math.cos(a) * r, y + 0.2, z + Math.sin(a) * r, Math.cos(a) * 1.2, 6 + rnd() * 9, Math.sin(a) * 1.2, 0.6 + rnd() * 0.6, 0.05 + rnd() * 0.06, white, { grav: 4, drag: 0.4 });
    }
    if (el === 'earth' && dust) dust.burst({ x, y, z, lift: 0.4 });   // 地：砂煙
  });

  return {
    update(dt) {
      if (dt <= 0) return;
      time += dt;
      right.copy(camera.right); up.copy(camera.up);
      // 溜め：渦・足もとの輪・吸い込まれる粒・強くなる光
      for (const c of [...charging.values()]) {
        const f = c.f, a = f.action;
        if (!f.alive || a?.kind !== 'ult') { endCharge(c); continue; }
        c.t = a.t;
        const k = Math.min(1, c.t / Math.max(0.2, c.at)), y = yOf(f), rgb = c.E.rgb;
        if (c.aura) {
          const r = lerp(1.25, 0.8, k), h = lerp(1.6, 3.2, k);
          c.aura.e.setPosition(f.x, y, f.z);
          c.aura.e.setLocalScale(r, h, r);
          c.aura.e.setEulerAngles(0, time * 220, 0);
          c.aura.mat.emissiveMapOffset.set(0, -time * 1.6);
          tint(c.aura, rgb, 0.6 + 1.6 * k);
        }
        if (c.foot) {
          const r = lerp(2.6, 1.2, k) + Math.sin(time * 18) * 0.05;
          c.foot.e.setPosition(f.x, y + 0.06, f.z);
          c.foot.e.setLocalScale(r, 1, r);
          tint(c.foot, rgb, 1 + 1.8 * k);
        }
        if (c.light) {
          // 体の少し前に置く（寄るカメラが前から映す顔と胸を照らす。体の中に置くと、夜は顔が暗いまま）
          const ya = (f.yaw * Math.PI) / 180;
          c.light.e.setPosition(f.x - Math.sin(ya) * 1.1, y + 1.5, f.z - Math.cos(ya) * 1.1);
          c.light.e.light.intensity = 0.6 + 2.6 * k * k;
        }
        // 吸い込まれる粒（だんだん多く。英雄ごとの技は出さない）
        c.acc += c.hero ? 0 : dt * (40 + 140 * k);
        for (; c.acc >= 1; c.acc--) {
          const th = rnd() * Math.PI * 2, R = 2.2 + rnd() * 1.8, hy = 0.2 + rnd() * 2.4;
          const sx = f.x + Math.cos(th) * R, sy = y + hy, sz = f.z + Math.sin(th) * R;
          const life = 0.32 + rnd() * 0.2, tx = f.x, ty = y + 1.1, tz = f.z;
          spark(sx, sy, sz, (tx - sx) / life, (ty - sy) / life, (tz - sz) / life, life, 0.035 + rnd() * 0.05, rgb, { drag: 1 });
        }
      }
      // 放った後の物
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.t += dt;
        if (b.t < 0) { if (b.it.e) b.it.e.enabled = false; continue; }
        const u = Math.min(1, b.t / b.life);
        if (b.kind === 'ring') {
          b.it.e.enabled = true;
          const s = lerp(b.r0, b.r1, 1 - (1 - u) * (1 - u) * (1 - u));
          b.it.e.setPosition(b.x, b.y, b.z); b.it.e.setLocalScale(s, 1, s);
          tint(b.it, b.color, b.k * (1 - u) * (1 - u * 0.3));
        } else if (b.kind === 'dome') {
          const s = lerp(b.r0, b.r1, 1 - (1 - u) * (1 - u));
          b.it.e.setPosition(b.x, b.y, b.z); b.it.e.setLocalScale(s, s * 0.8, s);
          tint(b.it, b.color, b.k * Math.pow(1 - u, 1.5));
        } else if (b.kind === 'pillar') {
          const r = lerp(0.5, 1.6, u), h = lerp(4, 26, Math.min(1, u * 3));
          b.it.e.setPosition(b.x, b.y, b.z); b.it.e.setLocalScale(r, h, r);
          b.it.e.setEulerAngles(0, time * 300, 0);
          b.it.mat.emissiveMapOffset.set(0, -time * 3);
          tint(b.it, b.color, b.k * Math.pow(1 - u, 1.3));
        } else if (b.kind === 'light') {
          b.it.e.light.intensity = 7 * Math.pow(1 - u, 2);
        }
        if (u >= 1) {
          if (b.kind === 'light') { b.it.busy = false; b.it.e.enabled = false; b.it.e.light.intensity = 0; }
          else free(b.it);
          bursts.splice(i, 1);
        }
      }
      // 粒を進めて、板に書き込む
      let alive = 0;
      for (let i = 0; i < SPARKS; i++) {
        const s = sparks[i];
        if (s.life <= 0) { billboard(sq, i, 0, -9999, 0, 0, 0, right, up, 0, 0, 0, 0); continue; }
        s.life -= dt;
        const dr = Math.pow(s.drag, dt);
        s.vx *= dr; s.vy = s.vy * dr - s.grav * dt; s.vz *= dr;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        const u = Math.max(0, s.life / s.max);
        let a = Math.min(1, u * 2.5) * Math.min(1, (1 - u) * 10 + 0.3);
        if (s.flick) a *= 0.45 + 0.55 * Math.abs(Math.sin(time * 41 + i));
        billboard(sq, i, s.x, s.y, s.z, s.s, s.s, right, up, s.r * a, s.g * a, s.b * a, 1);
        alive++;
      }
      sparkE.enabled = alive > 0;
      if (alive) { sq.mesh.setPositions(sq.pos); sq.mesh.setColors(sq.col); sq.mesh.update(pc.PRIMITIVE_TRIANGLES); }
      // 光の玉
      let gi = 0;
      for (let i = glows.length - 1; i >= 0; i--) {
        const g = glows[i];
        if (gi < GLOWS) {
          const k = Math.max(0, g.life / g.max), sz = g.size * (0.5 + 0.5 * (1 - k * k) + 0.2);
          billboard(gq, gi++, g.x, g.y, g.z, sz, sz, right, up, g.color[0] * k, g.color[1] * k, g.color[2] * k, 1);
        }
        g.life -= dt;
        if (g.life <= 0) glows.splice(i, 1);
      }
      for (let i = gi; i < GLOWS; i++) billboard(gq, i, 0, -9999, 0, 0, 0, right, up, 0, 0, 0, 0);
      glowE.enabled = gi > 0;
      if (gi) { gq.mesh.setPositions(gq.pos); gq.mesh.setColors(gq.col); gq.mesh.update(pc.PRIMITIVE_TRIANGLES); }
    },
    /** 粒・光の玉・衝撃波の輪を足す（render/ult-hero-fx.js が使う） */
    spark, glow: (x, y, z, size, life, color) => glows.push({ x, y, z, size, life, max: life, color }),
    ring(x, y, z, r1, life, color, k = 2, wide = false) {
      const it = take(wide ? waves2 : waves);
      if (it) bursts.push({ kind: 'ring', it, x, y: y + 0.1, z, t: 0, life, r0: 0.4, r1, k, color });
    },
    STYLE,
    /** 確認用：今出ている物の数 */
    get stats() {
      return { sparks: sparks.filter((s) => s.life > 0).length, charging: charging.size, bursts: bursts.length, glows: glows.length,
        lights: lights.filter((l) => l.busy).length };
    },
  };
}
