// 貫く矢（combat の projectiles の pierce。前は弓兵の鷹目。2 回目で弓兵の必殺技に使う）が通り抜けた家の壁に、矢の大きさの穴を開ける（壁の外と中の両方の面に穴の絵を貼る）。
// 利用者の指示（2026-11-10：矢の大きさの穴が開くだけ）。神怒で家が壊れる仕組みは、利用者の指示（2026-11-13）で消した
//   嵐の大矢（弓兵の必殺技「颶風一矢」。2026-11-25。利用者の指示：家でさえも貫通して穴が開き、通れるようになるレベル）は、壁に人が通れる穴を開ける：
//     見た目は壁の質感（石・漆喰・木）の色を決める所で、穴の中の点を描かない（HOLE_PS。家が建った時から付けておく）、縁に割れた跡の絵、破片が飛ぶ（render/ult-hero-fx.js）。
//     一階の穴は、壁の当たり判定（world/obstacles.js の円）を外して通れるようにする。視線（game/sight.js）も通す。数は 12 まで（それより多いと古い物から絵だけ戻らない）
import * as pc from 'playcanvas';
import { ULT_SPECS } from '../game/data.js';

const T = 0.22;            // 家の壁の厚さ（world/house-builder.js の T）
const FOUND = 0.45, STORY = 2.9;
const HOLE = 0.075;        // 矢の穴の半径（m）
const MAX_HOLES = 60;
const MAX_BIG = 12;        // 嵐の大矢の大きな穴の数（シェーダーに渡す）

// 壁の質感の色を決める所（エンジンの diffusePS）に、穴の中の点を描かない処理を足す（穴の形：下は床から、上は丸い。縁は少しぎざぎざ）
const HOLE_PS = /* glsl */ `
uniform vec3 material_diffuse;
uniform vec4 uHoleA[${MAX_BIG}];
uniform vec4 uHoleB[${MAX_BIG}];
uniform float uHoleN;
void holeClip() {
	for (int i = 0; i < ${MAX_BIG}; i++) {
		if (float(i) >= uHoleN) break;
		vec4 a = uHoleA[i];
		vec4 b = uHoleB[i];
		vec3 d = vPositionW - a.xyz;
		float dn = d.x * b.x + d.z * b.y;
		if (dn > 0.09 || dn < -0.36) continue;
		float t = (-d.x * b.y + d.z * b.x) / a.w;
		float y = d.y;
		if (y < -0.02) continue;
		float jag = 0.07 * sin(vPositionW.x * 23.0 + vPositionW.z * 19.0 + y * 17.0) * sin(y * 31.0 + vPositionW.x * 7.0 - vPositionW.z * 5.0);
		float rw = 1.0 + jag;
		float top = b.z - a.w;
		float q = (y - top) / a.w;
		bool inside = y < top ? abs(t) < rw : (t * t + q * q) < rw * rw;
		if (inside) discard;
	}
}
void getAlbedo() {
	holeClip();
	dAlbedo = material_diffuse.rgb;
	#ifdef STD_DIFFUSE_TEXTURE
		dAlbedo *= {STD_DIFFUSE_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSE_TEXTURE_NAME}, {STD_DIFFUSE_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_DIFFUSE_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_DIFFUSE_VERTEX
		dAlbedo *= saturate(vVertexColor.{STD_DIFFUSE_VERTEX_CHANNEL});
	#endif
}
`;
/** 家の壁の質感に、大きな穴を描かない処理を付ける（村ができた時に 1 度。穴が無い間は何もしない） */
export function applyHoleClip(material) {
  material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set('diffusePS', HOLE_PS);
  material.setParameter('uHoleN', 0);
  material.setParameter('uHoleA[0]', new Float32Array(MAX_BIG * 4));
  material.setParameter('uHoleB[0]', new Float32Array(MAX_BIG * 4));
  material.update();
}

/** 大きな穴の縁の絵：穴の形（下は四角・上は丸い）に沿った、割れた木と漆喰のぎざぎざの帯。W・H は絵の幅と高さ（穴より少し大きい） */
function rimTexture(device, hw, h) {
  const W = 128, Hh = Math.round((128 * (h * 1.1)) / (hw * 2 * 1.3));
  const c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  const sx = W / (hw * 2 * 1.3), sy = Hh / (h * 1.1);
  const cx = W / 2, by = Hh;   // 穴の下の真ん中（絵の下の縁）
  const outline = (grow) => {
    g.beginPath();
    const top = h - hw;
    g.moveTo(cx - (hw + grow) * sx, by);
    g.lineTo(cx - (hw + grow) * sx, by - top * sy);
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI - (i / 24) * Math.PI, j = 1 + (Math.sin(i * 2.7) * 0.05);
      g.lineTo(cx + Math.cos(a) * (hw + grow) * j * sx, by - (top + Math.sin(a) * (hw + grow) * j) * sy);
    }
    g.lineTo(cx + (hw + grow) * sx, by);
  };
  g.clearRect(0, 0, W, Hh);
  // 割れた縁：外へ向かって薄くなる、ぎざぎざの帯
  for (let k = 0; k < 3; k++) {
    g.save();
    outline(0.06 + k * 0.05);
    g.lineWidth = (10 - k * 3) * (W / 128);
    g.strokeStyle = [`rgba(52,40,30,0.95)`, `rgba(110,90,70,0.8)`, `rgba(200,190,175,0.55)`][k];
    g.setLineDash([3 + k * 2, 2 + k]);
    g.stroke();
    g.restore();
  }
  // 割れ目（縁から外へ伸びる細い線）
  g.strokeStyle = 'rgba(40,30,22,0.8)'; g.lineWidth = 1.2;
  for (let i = 0; i < 18; i++) {
    const a = Math.PI - (i / 17) * Math.PI, r0 = hw + 0.06, r1 = hw + 0.12 + Math.random() * 0.12, top = h - hw;
    const x0 = cx + Math.cos(a) * r0 * sx, y0 = by - (top + Math.sin(a) * r0) * sy;
    const x1 = cx + Math.cos(a) * r1 * sx + (Math.random() - 0.5) * 6, y1 = by - (top + Math.sin(a) * r1) * sy + (Math.random() - 0.5) * 6;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  const t = new pc.Texture(device, { name: 'wall-rim', width: W, height: Hh, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
  t.setSource(c);
  return t;
}

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
 * @param {{ materials?: object, obstacles?: object, sight?: object, onBreak?: Function }} [opt]
 *   materials：村の質感（stone・plaster・wood に穴を描かない処理が付いている）、obstacles・sight：穴を通れる・見通せるようにする、
 *   onBreak({ x, y, z, nx, nz, dir, floor, surf })：壁が破れた（破片を飛ばす）
 */
export function createArrowHoles(app, houses = [], { materials = null, obstacles = null, sight = null, onBreak = null } = {}) {
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
  // ---- 嵐の大矢の大きな穴（人が通れる） ----
  const HS = ULT_SPECS.archer.hole, hw = HS.w / 2;
  const bigList = [];   // { x, y, z, nx, nz, hw, h, story, house }
  const holeA = new Float32Array(MAX_BIG * 4), holeB = new Float32Array(MAX_BIG * 4);
  const clipMats = materials ? ['stone', 'plaster', 'wood'].map((k) => materials[k]).filter(Boolean) : [];
  const rimMax = MAX_BIG * 2;
  const rp = new Float32Array(rimMax * 12), rn = new Float32Array(rimMax * 12), ruv = [], ridx = [];
  for (let i = 0; i < rimMax; i++) { ruv.push(0, 0, 1, 0, 1, 1, 0, 1); ridx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3); }
  const rimMesh = new pc.Mesh(device);
  rimMesh.setPositions(rp); rimMesh.setNormals(rn); rimMesh.setUvs(0, ruv); rimMesh.setIndices(ridx);
  rimMesh.update(pc.PRIMITIVE_TRIANGLES);
  const rimTex = rimTexture(device, hw, HS.h);
  const rimMat = new pc.StandardMaterial();
  rimMat.diffuseMap = rimTex; rimMat.opacityMap = rimTex; rimMat.opacityMapChannel = 'a'; rimMat.alphaTest = 0.3;
  rimMat.useMetalness = true; rimMat.metalness = 0; rimMat.gloss = 0.1; rimMat.cull = pc.CULLFACE_NONE;
  rimMat.depthBias = -2; rimMat.depthBiasSlope = -4;
  rimMat.update();
  const rimEnt = new pc.Entity('wall-rims');
  rimEnt.addComponent('render', { meshInstances: [new pc.MeshInstance(rimMesh, rimMat)], castShadows: false, receiveShadows: true });
  rimEnt.enabled = false;
  app.root.addChild(rimEnt);
  let rimCount = 0;
  /** 縁の絵を 1 枚（壁の面に。x・z は穴の下の真ん中、n は面の向き） */
  function rimQuad(px, yb, pz, nx, nz) {
    const i = rimCount % rimMax;
    rimCount++;
    const ux = -nz, uz = nx, W = hw * 1.3, H = HS.h * 1.1;
    [[-W, 0], [W, 0], [W, H], [-W, H]].forEach(([a, b], k) => {
      const o = (i * 4 + k) * 3;
      rp[o] = px + ux * a; rp[o + 1] = yb + b; rp[o + 2] = pz + uz * a;
      rn[o] = nx; rn[o + 1] = 0; rn[o + 2] = nz;
    });
  }
  /** 大きな穴を開ける（hh：家、story：何階か、wx・wz：壁の外の面の点、y：矢の高さ、nx・nz：外向き、dir：矢の向き） */
  function bigHole(hh, story, wx, wz, y, nx, nz, dir) {
    for (const B of bigList) if (B.house === hh && Math.hypot(B.x - wx, B.z - wz) < hw * 1.2 && B.story === story) return;   // もう開いている
    const floorY = hh.y0 + FOUND + 0.05 + story * STORY;      // その階の床の高さ
    const ceil = hh.y0 + FOUND + (story + 1) * STORY - 0.12;
    const yb = floorY + 0.02, h = Math.min(HS.h, ceil - yb);
    const i = bigList.length % MAX_BIG;
    bigList.push({ x: wx, y: yb, z: wz, nx, nz, hw, h, story, house: hh });
    holeA.set([wx, yb, wz, hw], i * 4); holeB.set([nx, nz, h, 0], i * 4);
    const n = Math.min(bigList.length, MAX_BIG);
    for (const m of clipMats) { m.setParameter('uHoleA[0]', holeA); m.setParameter('uHoleB[0]', holeB); m.setParameter('uHoleN', n); }
    rimQuad(wx + nx * 0.015, yb, wz + nz * 0.015, nx, nz);
    rimQuad(wx - nx * (T + 0.015), yb, wz - nz * (T + 0.015), -nx, -nz);
    rimMesh.setPositions(rp); rimMesh.setNormals(rn); rimMesh.update(pc.PRIMITIVE_TRIANGLES);
    rimEnt.enabled = true;
    // 視線を通す
    sight?.addHole({ x: wx, z: wz, nx, nz, hw, y0: yb, y1: yb + h });
    // 一階の穴：壁の当たり判定（壁の真ん中の線に並ぶ円）を外して、通れるようにする
    if (story === 0 && obstacles?.circlesNear) {
      const cx = wx - nx * (T / 2), cz = wz - nz * (T / 2);
      for (const o of obstacles.circlesNear(cx, cz, hw + 0.3)) {
        const dx = o.x - cx, dz = o.z - cz;
        if (Math.abs(dx * nx + dz * nz) > 0.08) continue;                 // 壁の真ん中の線の上の円だけ
        if (Math.abs(-dx * nz + dz * nx) > hw - 0.05) continue;          // 穴の幅の中
        if (o.y0 > floorY + 0.5) continue;                               // 二階の物は残す
        o.off = true;
      }
    }
    onBreak?.({ x: wx, y: y, z: wz, nx, nz, dir, floor: hh.y0 + (story === 0 ? 0 : FOUND + story * STORY), surf: null });
  }

  /** 矢が a → b を飛んだ：通り抜けた家の壁（外の面）に穴を開ける。big：嵐の大矢（人が通れる大きな穴） */
  function arrowSegment(ax, ay, az, bx, by, bz, big = false) {
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
        if (big) {
          const story = Math.max(0, Math.min(hh.stories - 1, Math.floor((y - wy0) / STORY)));
          const dl = Math.hypot(bx - ax, by - ay, bz - az) || 1;
          bigHole(hh, story, wx, wz, y, nx, nz, [(bx - ax) / dl, (by - ay) / dl, (bz - az) / dl]);
        } else hole(wx, y, wz, nx, nz);
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
        arrowSegment(lp[0], lp[1], lp[2], p.x, p.y, p.z, !!p.storm);
        lastPos.set(p, [p.x, p.y, p.z]);
      }
      for (const p of lastPos.keys()) if (!seen.has(p)) lastPos.delete(p);
    },
    /** 確かめ用：開いた穴（位置と外向き） */
    get holes() { return holeList; },
    /** 確かめ用：嵐の大矢の大きな穴 */
    get bigHoles() { return bigList.map(({ house, ...b }) => ({ ...b, houseAt: [house.x, house.z] })); },
  };
}
