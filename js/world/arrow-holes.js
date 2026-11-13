// 弓兵の鷹目の貫く矢（combat の projectiles の pierce）が通り抜けた家の壁に、矢の大きさの穴を開ける（壁の外と中の両方の面に穴の絵を貼る）。
// 利用者の指示（2026-11-10：矢の大きさの穴が開くだけ）。神怒で家が壊れる仕組みは、利用者の指示（2026-11-13）で消した
import * as pc from 'playcanvas';

const T = 0.22;            // 家の壁の厚さ（world/house-builder.js の T）
const FOUND = 0.45, STORY = 2.9;
const HOLE = 0.075;        // 矢の穴の半径（m）
const MAX_HOLES = 60;

/** 穴の絵：真ん中は暗く、縁はささくれた木の割れ目 */
function holeTexture(device) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.translate(32, 32);
  g.fillStyle = 'rgba(60,44,30,0.95)';
  g.beginPath();
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 2, r = 26 + (i % 2 ? 4 : -2) + Math.sin(i * 2.3) * 3;
    g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  g.fill();
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 20);
  grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(0.8, 'rgba(8,6,4,1)'); grad.addColorStop(1, 'rgba(20,14,10,1)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
  const t = new pc.Texture(device, { name: 'arrow-hole', width: 64, height: 64, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
  t.setSource(c);
  return t;
}

/**
 * @param {object[]} houses world/castle.js の家の一覧 { x, z, w, d, yaw, y0, stories }
 */
export function createArrowHoles(app, houses = []) {
  const device = app.graphicsDevice;

  /** 家の中の座標（x 横・z 奥行き。world/build-kit.js の frame の逆） */
  const local = (hh, x, z) => {
    const a = (hh.yaw * Math.PI) / 180, dx = x - hh.x, dz = z - hh.z;
    return [dx * Math.cos(a) - dz * Math.sin(a), dx * Math.sin(a) + dz * Math.cos(a)];
  };

  // ---- 矢の穴（壁の外と中の面に貼る絵。全部で 1 つの形） ----
  const holeMax = MAX_HOLES * 2;
  const hp = new Float32Array(holeMax * 12), hn = new Float32Array(holeMax * 12), huv = [], hidx = [];
  for (let i = 0; i < holeMax; i++) { huv.push(0, 0, 1, 0, 1, 1, 0, 1); hidx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3); }
  const holeMesh = new pc.Mesh(device);
  holeMesh.setPositions(hp); holeMesh.setNormals(hn); holeMesh.setUvs(0, huv); holeMesh.setIndices(hidx);
  holeMesh.update(pc.PRIMITIVE_TRIANGLES);
  const holeTex = holeTexture(device);
  const holeMat = new pc.StandardMaterial();
  holeMat.diffuseMap = holeTex;
  holeMat.opacityMap = holeTex; holeMat.opacityMapChannel = 'a';
  holeMat.alphaTest = 0.4;
  holeMat.useMetalness = true; holeMat.metalness = 0; holeMat.gloss = 0.1;
  holeMat.cull = pc.CULLFACE_NONE;
  holeMat.update();
  const holeMi = new pc.MeshInstance(holeMesh, holeMat);
  holeMi.cull = false;
  const holeEnt = new pc.Entity('arrow-holes');
  holeEnt.addComponent('render', { meshInstances: [holeMi], castShadows: false, receiveShadows: true });
  holeEnt.enabled = false;
  app.root.addChild(holeEnt);
  let holeCount = 0;
  function addQuad(px, py, pz, nx, nz) {
    const i = holeCount % holeMax;
    holeCount++;
    const ux = -nz, uz = nx, s = HOLE;   // 壁の面の横の向きと、上
    const corners = [[-s, -s], [s, -s], [s, s], [-s, s]];
    corners.forEach(([a, b], k) => {
      const o = (i * 4 + k) * 3;
      hp[o] = px + ux * a; hp[o + 1] = py + b; hp[o + 2] = pz + uz * a;
      hn[o] = nx; hn[o + 1] = 0; hn[o + 2] = nz;
    });
  }
  /** 壁の点（世界）に穴を開ける：外の面と中の面の両方に貼る（n は外向き） */
  const holeList = [];   // 確かめ用：開いた穴（位置と外向き）
  function hole(px, py, pz, nx, nz) {
    holeList.push({ x: px, y: py, z: pz, nx, nz });
    addQuad(px + nx * 0.012, py, pz + nz * 0.012, nx, nz);
    addQuad(px - nx * (T + 0.012), py, pz - nz * (T + 0.012), -nx, -nz);
    holeMesh.setPositions(hp); holeMesh.setNormals(hn);
    holeMesh.update(pc.PRIMITIVE_TRIANGLES);
    holeEnt.enabled = true;
  }
  /** 矢が a → b を飛んだ：通り抜けた家の壁（外の面）に穴を開ける */
  function arrowSegment(ax, ay, az, bx, by, bz) {
    for (const hh of houses) {
      if (Math.hypot(ax - hh.x, az - hh.z) > 30 && Math.hypot(bx - hh.x, bz - hh.z) > 30) continue;
      const [lax, laz] = local(hh, ax, az), [lbx, lbz] = local(hh, bx, bz);
      const wy0 = hh.y0 + FOUND, wy1 = hh.y0 + FOUND + hh.stories * STORY;
      const a = (hh.yaw * Math.PI) / 180, R = [Math.cos(a), -Math.sin(a)], F = [Math.sin(a), Math.cos(a)];
      // 壁の外の面：x = ±w/2（左右）・z = ±d/2（前後）。二階建ての二階の前の壁は 0.4 m 前へ張り出す（house-builder.js の JETTY）
      const two = hh.stories === 2, mid = wy0 + STORY;
      const planes = [['x', hh.w / 2, 1, wy0, wy1], ['x', -hh.w / 2, -1, wy0, wy1], ['z', -hh.d / 2, -1, wy0, wy1],
        ['z', hh.d / 2, 1, wy0, two ? mid : wy1], ...(two ? [['z', hh.d / 2 + 0.4, 1, mid, wy1]] : [])];
      for (const [axis, v, sign, ylo, yhi] of planes) {
        const p0 = axis === 'x' ? lax : laz, p1 = axis === 'x' ? lbx : lbz;
        if ((p0 - v) * (p1 - v) > 0 || p0 === p1) continue;
        const t = (v - p0) / (p1 - p0);
        const o = axis === 'x' ? laz + (lbz - laz) * t : lax + (lbx - lax) * t;
        const lim = axis === 'x' ? hh.d / 2 : hh.w / 2;
        const y = ay + (by - ay) * t;
        if (Math.abs(o) > lim - 0.05 || y < ylo || y > yhi) continue;
        if (axis === 'z' && sign > 0 && Math.abs(o) < 0.65 && y < wy0 + 2.25) continue;   // 扉口（幅 1.2 m・高さ 2.2 m）は壁が無い
        const lx = axis === 'x' ? v : o, lz = axis === 'x' ? o : v;
        const wx = hh.x + R[0] * lx + F[0] * lz, wz = hh.z + R[1] * lx + F[1] * lz;
        const nx = axis === 'x' ? R[0] * sign : F[0] * sign, nz = axis === 'x' ? R[1] * sign : F[1] * sign;
        hole(wx, y, wz, nx, nz);
      }
    }
  }
  const lastPos = new Map();   // 貫く矢 → 前のフレームの位置

  return {
    /** 毎フレーム：貫く矢が通り抜けた壁に穴を開ける */
    update(projectiles) {
      // 貫く矢：前のフレームの位置から今の位置までに通り抜けた壁へ穴
      const seen = new Set();
      for (const p of projectiles) {
        if (!p.pierce || p.stuck) continue;
        seen.add(p);
        const lp = lastPos.get(p) || [p.x0 ?? p.x, p.y0 ?? p.y, p.z0 ?? p.z];   // 初めて見た矢は、放った所から
        arrowSegment(lp[0], lp[1], lp[2], p.x, p.y, p.z);
        lastPos.set(p, [p.x, p.y, p.z]);
      }
      for (const p of lastPos.keys()) if (!seen.has(p)) lastPos.delete(p);
    },
    /** 確かめ用：開いた穴（位置と外向き） */
    get holes() { return holeList; },
  };
}
