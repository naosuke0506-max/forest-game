// 劍騎士の奧義（長劍・大劍）の砂煙：切っ先が地面にめり込んだ所から、土ぼこりが輪のように広がり、
// 斬り上げると一緒に上へ舞い上がる（game/combat.js の 'dust' の知らせ。lift 秒後に斬り上げ）。
// 粒は 48 枚の板を 1 つの形にまとめ、毎フレーム、カメラに向けて並べ直す（舞っている間だけ描く。描画命令 1 つ）
import * as pc from 'playcanvas';

const N = 48;

function dotTexture(device) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new pc.Texture(device, { name: 'ult-dust', width: 64, height: 64, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
  t.setSource(c);
  return t;
}

export function createUltDust(app, camera) {
  const device = app.graphicsDevice;
  const uvs = [], idx = [];
  for (let i = 0; i < N; i++) { uvs.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3); }
  const pos = new Float32Array(N * 12), col = new Float32Array(N * 16), nor = new Float32Array(N * 12);
  for (let i = 0; i < N * 4; i++) nor[i * 3 + 1] = 1;
  const mesh = new pc.Mesh(device);
  mesh.setPositions(pos); mesh.setNormals(nor); mesh.setUvs(0, uvs); mesh.setColors(col); mesh.setIndices(idx);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  const tex = dotTexture(device);
  const mat = new pc.StandardMaterial();
  mat.useLighting = false; mat.useSkybox = false;
  mat.diffuse = new pc.Color(0, 0, 0);
  mat.emissive = new pc.Color(1, 1, 1);
  mat.emissiveVertexColor = true;
  mat.opacityMap = tex; mat.opacityMapChannel = 'r';
  mat.opacityVertexColor = true; mat.opacityVertexColorChannel = 'a';
  mat.blendType = pc.BLEND_NORMAL;
  mat.depthWrite = false;
  mat.cull = pc.CULLFACE_NONE;
  mat.update();
  const mi = new pc.MeshInstance(mesh, mat);
  mi.cull = false;
  const ent = new pc.Entity('ult-dust');
  ent.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
  ent.enabled = false;
  app.root.addChild(ent);

  // 粒：位置・速さ・残りの時間・大きさ。lift：斬り上げで舞い上がるまでの秒
  const P = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.3, grow: 0.6, shade: 1 }));
  const lifts = [];
  const right = new pc.Vec3(), up = new pc.Vec3(), eye = new pc.Vec3();

  function spawn(p, x, y, z, a, speed, vy, life, size) {
    Object.assign(p, { x, y, z, vx: Math.cos(a) * speed, vy, vz: Math.sin(a) * speed, life, max: life, size, grow: 0.5 + Math.random() * 0.6, shade: 0.8 + Math.random() * 0.3 });
  }

  return {
    /** 砂煙を立てる（x, y, z：めり込んだ所。lift：斬り上げまでの秒） */
    burst({ x, y, z, lift = 0.7 }) {
      let k = 0;
      for (const p of P) {
        if (p.life > 0) continue;
        const a = (k / 32) * Math.PI * 2 + Math.random() * 0.3;
        spawn(p, x + Math.cos(a) * 0.2, y + 0.05, z + Math.sin(a) * 0.2, a, 1.6 + Math.random() * 1.6, 0.4 + Math.random() * 0.8, 1.6 + Math.random() * 1.2, 0.25 + Math.random() * 0.2);
        if (++k >= 32) break;
      }
      lifts.push({ t: lift, x, y, z });
      ent.enabled = true;
    },
    update(dt) {
      // 斬り上げ：近くの粒を上へ吹き上げ、新しく上へ舞う粒を足す
      for (let i = lifts.length - 1; i >= 0; i--) {
        const L = lifts[i];
        L.t -= dt;
        if (L.t > 0) continue;
        lifts.splice(i, 1);
        for (const p of P) if (p.life > 0 && Math.hypot(p.x - L.x, p.z - L.z) < 3) { p.vy += 2.5 + Math.random() * 1.5; p.life = Math.max(p.life, 1.2); }
        let k = 0;
        for (const p of P) {
          if (p.life > 0) continue;
          spawn(p, L.x + (Math.random() - 0.5) * 0.5, L.y + 0.1, L.z + (Math.random() - 0.5) * 0.5, Math.random() * 6.283, 0.4 + Math.random() * 0.6, 3 + Math.random() * 2.5, 1.4 + Math.random() * 0.8, 0.22);
          if (++k >= 14) break;
        }
      }
      if (!ent.enabled) return;
      const cm = camera.getWorldTransform();
      cm.getX(right); cm.getY(up); cm.getTranslation(eye);
      let alive = 0;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        let a = 0, s = 0;
        if (p.life > 0) {
          p.life -= dt;
          // 空気で遅くなり、ゆっくり落ちる
          const drag = Math.exp(-2.2 * dt);
          p.vx *= drag; p.vz *= drag; p.vy = p.vy * Math.exp(-1.6 * dt) - 0.6 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          const u = 1 - Math.max(0, p.life) / p.max;
          s = p.size * (1 + p.grow * 3 * u);
          // 目のすぐ前の粒は薄くする（一人称で、画面が砂煙で埋まらないように）
          const near = Math.min(1, Math.max(0, (Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) - 0.6) / 2.2));
          a = Math.min(1, u * 8) * (1 - u) * 0.55 * near;
          if (p.life > 0) alive++;
        }
        for (let c = 0; c < 4; c++) {
          const sx = c === 0 || c === 3 ? -s : s, sy = c < 2 ? -s : s, o = (i * 4 + c) * 3;
          pos[o] = p.x + right.x * sx + up.x * sy;
          pos[o + 1] = p.y + right.y * sx + up.y * sy;
          pos[o + 2] = p.z + right.z * sx + up.z * sy;
          const q = (i * 4 + c) * 4;
          col[q] = 0.62 * p.shade; col[q + 1] = 0.54 * p.shade; col[q + 2] = 0.42 * p.shade; col[q + 3] = a;
        }
      }
      mesh.setPositions(pos); mesh.setColors(col);
      mesh.update(pc.PRIMITIVE_TRIANGLES);
      if (!alive && !lifts.length) ent.enabled = false;
    },
  };
}
