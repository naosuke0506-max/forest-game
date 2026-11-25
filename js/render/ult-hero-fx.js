// 英雄ごとの必殺技の見た目（2 回目。2026-11-25。みんなの画面に出る。game/ult-moves.js の知らせで出す）。共通の光・輪・粒は render/ult-fx.js（fx）を使う
//   楯劍騎士「大海嘯」：足もとから渦を巻いて昇る水の竜巻（2 枚の筒が逆に回る）→ あふれ出す水の壁（外へ広がる波の輪）としぶき → 水の衣（体に巻く細い渦）。
//     弾いた矢・奇跡はしぶき
//   劍騎士「雷霆一閃」：閃光 → 稲妻の姿（体の形に走る稲妻と光の芯）・走った跡の稲妻・道の残像 → 貫いた所の火花 → 踏み込みの斬撃の光の筋 → 空からの落雷。
//     雷の衣：体のまわりでぱちぱち。回避・疾驅の間は稲妻の姿。自分への落雷
//   弓兵「颶風一矢」：大弓に巻く風（体のまわりの螺旋の筋と、弓へ吸い込まれる風の粒）→ 放つ閃光 → 嵐の大矢（光の芯・3 本の螺旋の風・後ろへ散る風の粒）→
//     家の壁を破る所の木と漆喰の破片（world/arrow-holes.js の 'wallHole'）
//   描画命令：線（稲妻・筋）1・破片 1（どれも出ている間だけ）、水の筒・波は 1 つずつ（出ている間だけ）
import * as pc from 'playcanvas';
import { canvasTexture, addMat, quads, billboard } from './hall-fire.js';
import { ELEMENT_KINDS, ULT_SPECS } from '../game/data.js';

const LINES = 360, DEBRIS = 160;
const rnd = Math.random;
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
export function createUltHeroFx(app, { combat, fighters, views, camera, fx, me = null, firstPerson = () => false }) {
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
  combat.on('deflect', ({ x, y, z }) => {
    fx.glow(x, y, z, 1.6, 0.25, [0.6, 0.85, 1]);
    for (let i = 0; i < 22; i++) { const a = rnd() * Math.PI * 2, sp = 2 + rnd() * 3; fx.spark(x, y, z, Math.cos(a) * sp, 1 + rnd() * 3, Math.sin(a) * sp, 0.5 + rnd() * 0.4, 0.05 + rnd() * 0.04, [0.6, 0.85, 1], { grav: 9, drag: 0.6 }); }
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
        if (B.t < 0.05) fx.glow(B.x, B.y + 1, B.z, B.big ? 9 : 4, 0.2, [1, 1, 1]);
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
            for (let n = 0; n <= 14; n++) {
              const v = n / 14, th = time * 9 + v * 8 + j * Math.PI, r = 0.8 + v * 0.5;
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
          for (let n = 0; n <= 16; n++) {
            const s = (n / 16) * back, th = time * 30 + s * 1.4 + j * 2.094, r = 0.3 + s * 0.06;
            const c = Math.cos(th) * r, d = Math.sin(th) * r;
            const x = p.x - dx * s + ux * c + vx * d, y = p.y - dy * s + uy * c + vy * d, z = p.z - dz * s + uz * c + vz * d;
            if (n) { const k = (1 - n / 16) * 0.9; segment(qx, qy, qz, x, y, z, 0.09, WIND[0] * k + 0.2 * k, WIND[1] * k + 0.1 * k, WIND[2] * k + 0.2 * k); }
            qx = x; qy = y; qz = z;
          }
        }
        for (let n = 0; n < 6; n++) {
          const th = rnd() * Math.PI * 2, c = Math.cos(th), d = Math.sin(th), v = 3 + rnd() * 4;
          fx.spark(p.x - dx * rnd() * 2, p.y - dy * rnd() * 2, p.z - dz * rnd() * 2, (ux * c + vx * d) * v - dx * 6, (uy * c + vy * d) * v, (uz * c + vz * d) * v - dz * 6,
            0.35 + rnd() * 0.3, 0.04 + rnd() * 0.04, rnd() < 0.5 ? WIND : [0.95, 1, 0.95], { drag: 0.3 });
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
    get stats() { return { lines: lineUsed, chips: chips.filter((c) => c.life > 0).length, active: active.length, veils: veilOf.size }; },
  };
}
