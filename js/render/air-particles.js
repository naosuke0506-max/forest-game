// 空気の中の小さな物（自分の周りだけ）：
//   光に舞う塵：ゆっくり漂う細かな粒。太陽の方を向くと光って見える（朝・昼・夕暮れ）
//   舞い落ちる葉：森の中で、木の上からひらひら落ちてくる葉（緑・黄・橙・茶）
//   蛍：夜の森と草原で、地面の近くをふわふわ飛び、ゆっくり光ったり消えたりする
// 粒は全部で 200 個ほどの板。毎フレーム、カメラに向けて並べ直す（数が少ないので軽い）
// 強さは時間帯の fx（world/time-of-day.js）で決まり、0 の物は描かない
import * as pc from 'playcanvas';

const DUST = 110, FIREFLY = 60, LEAF = 26;

function canvasTexture(device, w, h, draw, name, srgb = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new pc.Texture(device, {
    name, width: w, height: h, format: pc.PIXELFORMAT_RGBA8, srgb, mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  t.setSource(c);
  return t;
}
/** 柔らかい光の点 */
function drawDot(g, w, h) {
  const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
}
/** 葉：先のとがった楕円に、葉脈と柄（白で描き、色は頂点色で付ける） */
function drawLeaf(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.save();
  g.translate(w / 2, h / 2);
  g.beginPath();
  g.moveTo(0, -h * 0.44);
  g.bezierCurveTo(w * 0.42, -h * 0.25, w * 0.4, h * 0.2, 0, h * 0.36);
  g.bezierCurveTo(-w * 0.4, h * 0.2, -w * 0.42, -h * 0.25, 0, -h * 0.44);
  const grad = g.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, '#d8d8d8'); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, '#cfcfcf');
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = 'rgba(120,120,120,.8)'; g.lineWidth = w * 0.025;
  g.beginPath(); g.moveTo(0, -h * 0.4); g.lineTo(0, h * 0.46); g.stroke();
  for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(0, k * h * 0.09); g.lineTo(w * 0.22, k * h * 0.09 - h * 0.08); g.moveTo(0, k * h * 0.09); g.lineTo(-w * 0.22, k * h * 0.09 - h * 0.08); g.stroke(); }
  g.restore();
}

/** n 枚の四角の板（位置と色は毎回入れ直す） */
function quads(device, n) {
  const uvs = [], idx = [];
  for (let i = 0; i < n; i++) { uvs.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3); }
  const pos = new Float32Array(n * 12), col = new Float32Array(n * 16), nor = new Float32Array(n * 12);
  for (let i = 0; i < n * 4; i++) nor[i * 3 + 1] = 1;
  const mesh = new pc.Mesh(device);
  mesh.setPositions(pos); mesh.setNormals(nor); mesh.setUvs(0, uvs); mesh.setColors(col); mesh.setIndices(idx);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return { mesh, pos, col, nor };
}

/**
 * @param {object} timeOfDay world/time-of-day.js（fx）
 * @param {{ heightAt: Function, zones: object, sun: pc.Entity }} world
 */
export function createAirParticles(app, camera, timeOfDay, { heightAt, zones = null, sun }) {
  const device = app.graphicsDevice;
  const rnd = Math.random;

  // ===== 光る粒（塵と蛍）：加算で光を足す =====
  const glow = quads(device, DUST + FIREFLY);
  const glowMat = new pc.StandardMaterial();
  glowMat.useLighting = false; glowMat.useFog = false; glowMat.useSkybox = false;
  glowMat.diffuse = new pc.Color(0, 0, 0);
  glowMat.emissive = new pc.Color(1, 1, 1);
  glowMat.emissiveMap = canvasTexture(device, 64, 64, drawDot, 'air-dot');
  glowMat.emissiveVertexColor = true;
  glowMat.blendType = pc.BLEND_ADDITIVE;
  glowMat.depthWrite = false;
  glowMat.cull = pc.CULLFACE_NONE;
  glowMat.update();
  const glowMi = new pc.MeshInstance(glow.mesh, glowMat);
  glowMi.cull = false;
  const glowEnt = new pc.Entity('air-glow');
  glowEnt.addComponent('render', { meshInstances: [glowMi], castShadows: false, receiveShadows: false });
  app.root.addChild(glowEnt);

  // ===== 葉：光を受ける（影は落とさない） =====
  const leaf = quads(device, LEAF);
  const leafMat = new pc.StandardMaterial();
  const leafTex = canvasTexture(device, 64, 64, drawLeaf, 'air-leaf', true);
  leafMat.diffuseMap = leafTex;
  leafMat.opacityMap = leafTex;
  leafMat.opacityMapChannel = 'a';
  leafMat.alphaTest = 0.4;
  leafMat.diffuseVertexColor = true;
  leafMat.vertexColorGamma = true;
  leafMat.useMetalness = true; leafMat.metalness = 0; leafMat.gloss = 0.3;
  leafMat.cull = pc.CULLFACE_NONE;
  leafMat.twoSidedLighting = true;
  leafMat.update();
  const leafMi = new pc.MeshInstance(leaf.mesh, leafMat);
  leafMi.cull = false;
  const leafEnt = new pc.Entity('air-leaves');
  leafEnt.addComponent('render', { meshInstances: [leafMi], castShadows: false, receiveShadows: true });
  app.root.addChild(leafEnt);

  const cam = new pc.Vec3(), sunDir = new pc.Vec3();
  const forestAt = (x, z) => { if (!zones) return 1; const w = zones.weights(x, z); return w.mixed * 0.8 + w.deep; };

  // 塵：カメラの周りの箱（横 14m・高さ 6m）の中。箱から出たら反対側へ回す
  const dust = Array.from({ length: DUST }, () => ({ x: (rnd() - 0.5) * 14, y: rnd() * 6, z: (rnd() - 0.5) * 14, s: 0.018 + rnd() * 0.03, ph: rnd() * 10, b: 0.4 + rnd() * 0.6 }));
  // 蛍：自分の周り 22m。地面から 0.4〜2.4m
  const flies = Array.from({ length: FIREFLY }, () => ({ x: 0, z: 0, h: 0, ph: rnd() * 10, per: 2.5 + rnd() * 3.5, sp: 0.3 + rnd() * 0.5, ok: 0, init: false }));
  // 葉：自分の周り 16m。木の高さから落ちてくる
  const LEAF_COLORS = [[0.45, 0.62, 0.22], [0.62, 0.66, 0.2], [0.82, 0.62, 0.2], [0.78, 0.4, 0.14], [0.52, 0.34, 0.18]];
  const leaves = Array.from({ length: LEAF }, () => ({ init: false }));
  function spawnLeaf(L, anywhere) {
    for (let k = 0; k < 4; k++) {
      const a = rnd() * Math.PI * 2, r = 2 + rnd() * 14;
      const x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
      const f = forestAt(x, z);
      if (rnd() > f) continue;
      const g = heightAt(x, z);
      Object.assign(L, {
        init: true, x, z, g, y: g + (anywhere ? 0.5 + rnd() * 10 : 7 + rnd() * 5),
        vy: 0.55 + rnd() * 0.45, sway: 0.4 + rnd() * 0.8, ph: rnd() * 10, spin: 1.5 + rnd() * 3, s: 0.07 + rnd() * 0.05,
        c: LEAF_COLORS[Math.floor(rnd() * LEAF_COLORS.length)],
      });
      return;
    }
    L.init = false;
  }

  const right = new pc.Vec3(), up = new pc.Vec3();
  let t = 0;
  /** カメラに向けた板を 1 枚書き込む */
  function billboard(m, i, x, y, z, s, r, g, b) {
    const o = i * 12;
    const rx = right.x * s, ry = right.y * s, rz = right.z * s, ux = up.x * s, uy = up.y * s, uz = up.z * s;
    m.pos[o] = x - rx - ux; m.pos[o + 1] = y - ry - uy; m.pos[o + 2] = z - rz - uz;
    m.pos[o + 3] = x + rx - ux; m.pos[o + 4] = y + ry - uy; m.pos[o + 5] = z + rz - uz;
    m.pos[o + 6] = x + rx + ux; m.pos[o + 7] = y + ry + uy; m.pos[o + 8] = z + rz + uz;
    m.pos[o + 9] = x - rx + ux; m.pos[o + 10] = y - ry + uy; m.pos[o + 11] = z - rz + uz;
    for (let v = 0; v < 4; v++) { const c = (i * 4 + v) * 4; m.col[c] = r; m.col[c + 1] = g; m.col[c + 2] = b; m.col[c + 3] = 1; }
  }
  const hideQuad = (m, i) => { m.pos.fill(0, i * 12, i * 12 + 12); };

  return {
    update(dt) {
      t += dt;
      const fx = timeOfDay.fx;
      cam.copy(camera.getPosition());
      right.copy(camera.right); up.copy(camera.up);
      sunDir.copy(sun.up).normalize();
      const fwd = camera.forward;
      const facing = Math.max(0, fwd.x * sunDir.x + fwd.y * sunDir.y + fwd.z * sunDir.z);
      const lc = sun.light.color;

      // ----- 塵と蛍 -----
      const showGlow = fx.dust > 0.01 || fx.fireflies > 0.01;
      glowEnt.enabled = showGlow;
      if (showGlow) {
        const ground = heightAt(cam.x, cam.z);
        const dk = fx.dust * (0.08 + 0.55 * facing * facing) * Math.min(1, Math.max(0, sunDir.y * 4));
        for (let i = 0; i < DUST; i++) {
          const d = dust[i];
          d.x += Math.sin(t * 0.3 + d.ph) * 0.05 * dt + 0.06 * dt;
          d.y += Math.sin(t * 0.21 + d.ph * 1.7) * 0.04 * dt;
          d.z += Math.cos(t * 0.27 + d.ph) * 0.05 * dt;
          // 箱から出たら反対側へ（カメラについて行く）
          let wx = cam.x + ((((d.x - cam.x) % 14) + 21) % 14) - 7;
          let wz = cam.z + ((((d.z - cam.z) % 14) + 21) % 14) - 7;
          d.x = wx; d.z = wz;
          if (d.y < 0 || d.y > 6) d.y = ((d.y % 6) + 6) % 6;
          if (dk < 0.004) { hideQuad(glow, i); continue; }
          const tw = 0.6 + 0.4 * Math.sin(t * 1.3 + d.ph * 3);
          const k = dk * d.b * tw;
          billboard(glow, i, wx, ground + 0.3 + d.y, wz, d.s, lc.r * k, lc.g * k, lc.b * k * 0.9);
        }
        for (let j = 0; j < FIREFLY; j++) {
          const f = flies[j], i = DUST + j;
          // 遠くへ行ったら、自分の周りへ置き直す（森と草原。村と道は少なく）
          if (!f.init || Math.hypot(f.x - cam.x, f.z - cam.z) > 24) {
            const a = rnd() * Math.PI * 2, r = 3 + rnd() * 19;
            f.x = cam.x + Math.cos(a) * r; f.z = cam.z + Math.sin(a) * r;
            const w = zones ? zones.weights(f.x, f.z) : { castle: 0, prairie: 0 };
            f.h = 0.5 + rnd() * 2 + (w.prairie || 0) * 0.9; f.init = true;   // 大草原は背の高い草の上を飛ぶ
            f.ok = (1 - (w.castle || 0)) * (1 - (zones ? zones.path(f.x, f.z) * 0.7 : 0));
          }
          f.x += Math.sin(t * f.sp + f.ph) * 0.5 * dt;
          f.z += Math.cos(t * f.sp * 0.8 + f.ph * 1.3) * 0.5 * dt;
          f.h = Math.min(3.4, Math.max(0.3, f.h + Math.sin(t * 0.7 + f.ph) * 0.15 * dt));
          const cyc = ((t + f.ph) % f.per) / f.per;
          const blink = Math.pow(Math.max(0, Math.sin(cyc * Math.PI * 2)), 3);   // ゆっくり光って消える
          const k = fx.fireflies * f.ok * blink * 6;
          if (k < 0.01) { hideQuad(glow, i); continue; }
          billboard(glow, i, f.x, heightAt(f.x, f.z) + f.h, f.z, 0.11 + 0.1 * blink, 0.75 * k, 1.0 * k, 0.35 * k);
        }
        glow.mesh.setPositions(glow.pos);
        glow.mesh.setColors(glow.col);
        glow.mesh.update(pc.PRIMITIVE_TRIANGLES);
      }

      // ----- 舞い落ちる葉 -----
      leafEnt.enabled = fx.leaves > 0.01;
      if (leafEnt.enabled) {
        const count = Math.round(LEAF * fx.leaves);
        for (let i = 0; i < LEAF; i++) {
          const L = leaves[i];
          if (i >= count) { hideQuad(leaf, i); continue; }
          if (!L.init || L.y < L.g || Math.hypot(L.x - cam.x, L.z - cam.z) > 18) spawnLeaf(L, !L.init);
          if (!L.init) { hideQuad(leaf, i); continue; }
          L.y -= L.vy * dt * (0.7 + 0.3 * Math.sin(t * 2 + L.ph));
          L.x += Math.sin(t * L.sway + L.ph) * 0.6 * dt + 0.15 * dt;
          L.z += Math.cos(t * L.sway * 0.7 + L.ph) * 0.4 * dt;
          // ひらひら回る：板の向きを、時間で回す 2 つの軸で決める
          const a = t * L.spin + L.ph, b = Math.sin(t * 1.7 + L.ph) * 1.2;
          const ax = Math.cos(a), az = Math.sin(a);
          const o = i * 12, s = L.s;
          const ux = -az * Math.sin(b), uy = Math.cos(b), uz = ax * Math.sin(b);
          const p = leaf.pos;
          p[o] = L.x - ax * s - ux * s; p[o + 1] = L.y - uy * s; p[o + 2] = L.z - az * s - uz * s;
          p[o + 3] = L.x + ax * s - ux * s; p[o + 4] = L.y - uy * s; p[o + 5] = L.z + az * s - uz * s;
          p[o + 6] = L.x + ax * s + ux * s; p[o + 7] = L.y + uy * s; p[o + 8] = L.z + az * s + uz * s;
          p[o + 9] = L.x - ax * s + ux * s; p[o + 10] = L.y + uy * s; p[o + 11] = L.z - az * s + uz * s;
          for (let v = 0; v < 4; v++) { const c = (i * 4 + v) * 4; leaf.col[c] = L.c[0]; leaf.col[c + 1] = L.c[1]; leaf.col[c + 2] = L.c[2]; leaf.col[c + 3] = 1; }
        }
        leaf.mesh.setPositions(leaf.pos);
        leaf.mesh.setColors(leaf.col);
        leaf.mesh.update(pc.PRIMITIVE_TRIANGLES);
      }
    },
  };
}
