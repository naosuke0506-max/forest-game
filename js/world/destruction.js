// 壊せる物（利用者の指示 2026-11-10）：
//   祓魔僧の神怒（game/combat.js の 'wrath'）：1 m 未満の物（樽・袋）は吹き飛び、近くの家の屋根（と家の中の梁）は崩れ落ちる。
//     崩れ落ちた屋根の下（一番上の階）にいた人は下敷きになって倒れる（即死。onCrush）。神怒を放った本人は神の加護で下敷きにならない
//   弓兵の鷹目の貫く矢（combat の projectiles の pierce）：通り抜けた家の壁に、矢の大きさの穴が開く（壁の外と中の両方の面）
// 村の形は質感ごとに 1 つにまとめてあるので（world/castle.js）、壊れた部品の三角形は番号を 0 にして消し、
// 同じ形を写した小さな形（飛ぶ・落ちる破片）を別に作って動かす（破片の数だけ描画命令が増える。落ちた破片はそのまま残る）
import * as pc from 'playcanvas';
import { WRATH } from '../game/data.js';

const G = 9.8;
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
 * @param {object} village world/castle.js の destructible { pieces, meshes, materials, houses }
 * @param {object} o
 * @param {(x: number, z: number, y?: number) => number} o.groundAt 足もとの高さ（家の床も）
 * @param {(target: object, by: object) => void} o.onCrush 下敷きになった人を倒す
 */
export function createDestruction(app, village, { groundAt, onCrush }) {
  const device = app.graphicsDevice;
  const { pieces = [], meshes = {}, materials = {}, houses = [] } = village || {};
  const roofs = new Map();   // 家の番号 → 屋根の部品
  for (const p of pieces) if (p.meta.kind === 'roof' && p.meta.house >= 0) roofs.set(p.meta.house, p);
  const props = pieces.filter((p) => p.meta.kind === 'prop');
  const moving = [];   // 飛んでいる・落ちている破片
  const crushes = [];  // 屋根が落ちきる時刻を待っている家 { t, piece, caster }

  // ---- 部品の三角形を消す（番号を 0 にして、描き直す） ----
  function hide(p) {
    p.gone = true;
    for (const [surf, [i0, i1]] of Object.entries(p.ranges)) {
      const m = meshes[surf];
      if (!m) continue;
      m.idx.fill(0, i0, i1);
      m.dirty = true;
    }
  }
  function flush() {
    for (const m of Object.values(meshes)) {
      if (!m.dirty) continue;
      m.dirty = false;
      m.mesh.setIndices(m.idx);
      m.mesh.update(pc.PRIMITIVE_TRIANGLES);
    }
  }

  /** 部品の形のうち、選んだ三角形だけで小さな形を作る（中心 c からの位置にする） */
  function subMesh(geo, tris, c) {
    const n = tris.length * 3;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 4), idx = [];
    let v = 0;
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const s = geo.indices[t * 3 + k];
        pos[v * 3] = geo.positions[s * 3] - c[0]; pos[v * 3 + 1] = geo.positions[s * 3 + 1] - c[1]; pos[v * 3 + 2] = geo.positions[s * 3 + 2] - c[2];
        nor.set(geo.normals.subarray(s * 3, s * 3 + 3), v * 3);
        uv.set(geo.uvs.subarray(s * 2, s * 2 + 2), v * 2);
        col.set(geo.colors.subarray(s * 4, s * 4 + 4), v * 4);
        idx.push(v);
        v++;
      }
    }
    const mesh = new pc.Mesh(device);
    mesh.setPositions(pos); mesh.setNormals(nor); mesh.setUvs(0, uv); mesh.setColors(col, 4);
    mesh.setVertexStream(pc.SEMANTIC_TANGENT, pc.calculateTangents(pos, nor, uv, idx), 4);   // 凹凸の画像に要る
    mesh.setIndices(idx);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    return mesh;
  }

  /** 破片を作って動かす。parts：[{ surf, geo, tris }]、c：中心（世界）、vel・spin：速さと回り方、floor：止まる高さ */
  function launch(parts, c, vel, spin, floor, { bounce = true } = {}) {
    const mis = parts.filter((q) => q.tris.length).map((q) => new pc.MeshInstance(subMesh(q.geo, q.tris, c), materials[q.surf]));
    if (!mis.length) return null;
    const ent = new pc.Entity('debris');
    ent.addComponent('render', { meshInstances: mis, castShadows: true, receiveShadows: true });
    ent.setPosition(c[0], c[1], c[2]);
    app.root.addChild(ent);
    const m = { ent, x: c[0], y: c[1], z: c[2], vx: vel[0], vy: vel[1], vz: vel[2], spin, floor, bounce, rest: false, bounces: 0 };
    moving.push(m);
    return m;
  }

  const allTris = (geo) => Array.from({ length: geo.indices.length / 3 }, (_, i) => i);

  /** 小物を吹き飛ばす（中心 x, z から外へ。k：近さ 0〜1） */
  function fling(p, x, z, k) {
    hide(p);
    if (p.meta.obstacle) p.meta.obstacle.solid = false;   // 当たり判定を外す
    const M = p.meta, h = M.size || 0.8;
    const dx = M.x - x, dz = M.z - z, d = Math.hypot(dx, dz) || 1;
    const indoor = M.y > groundAt(M.x, M.z, null) + 0.2;   // 家の中の物は、あまり遠くへ飛ばない
    const sp = (4 + 9 * k) * (indoor ? 0.35 : 1);
    const c = [M.x, M.y + h / 2, M.z];
    const m = launch(Object.entries(p.geo).map(([surf, geo]) => ({ surf, geo, tris: allTris(geo) })), c,
      [(dx / d) * sp, (3.5 + 4 * k) * (indoor ? 0.5 : 1), (dz / d) * sp],
      [(Math.random() - 0.5) * 720, (Math.random() - 0.5) * 360, (Math.random() - 0.5) * 720], null);
    if (m) m.half = h * 0.35;   // 地面に着いたとき、真ん中が地面からこれだけ上
  }

  /** 屋根を崩す：三角形を家の横（左右）と奥行き（3 つ）で 6 つの塊に分け、上の階の床へ落とす */
  function collapse(p, caster) {
    hide(p);
    const M = p.meta, a = (M.yaw * Math.PI) / 180;
    const r = [Math.cos(a), -Math.sin(a)], f = [Math.sin(a), Math.cos(a)];
    const chunks = Array.from({ length: 6 }, () => ({}));
    for (const [surf, geo] of Object.entries(p.geo)) {
      for (let t = 0; t < geo.indices.length / 3; t++) {
        let cx = 0, cz = 0;
        for (let k = 0; k < 3; k++) { const s = geo.indices[t * 3 + k]; cx += geo.positions[s * 3]; cz += geo.positions[s * 3 + 2]; }
        cx = cx / 3 - M.cx; cz = cz / 3 - M.cz;
        const lx = cx * r[0] + cz * r[1], lz = cx * f[0] + cz * f[1] - M.zc;
        const j = (lx < 0 ? 0 : 1) + 2 * Math.min(2, Math.max(0, Math.floor((lz / M.d + 0.5) * 3)));
        (chunks[j][surf] ||= []).push(t);
      }
    }
    for (const ch of chunks) {
      const list = Object.entries(ch).map(([surf, tris]) => ({ surf, geo: p.geo[surf], tris }));
      if (!list.length) continue;
      // 塊の真ん中
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const q of list) for (const t of q.tris) for (let k = 0; k < 3; k++) { const s = q.geo.indices[t * 3 + k]; sx += q.geo.positions[s * 3]; sy += q.geo.positions[s * 3 + 1]; sz += q.geo.positions[s * 3 + 2]; n++; }
      const c = [sx / n, sy / n, sz / n];
      launch(list, c, [(Math.random() - 0.5) * 0.8, -0.5 - Math.random(), (Math.random() - 0.5) * 0.8],
        [(Math.random() - 0.5) * 70, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 70], M.floorY + 0.35 + Math.random() * 0.25, { bounce: false });
    }
    crushes.push({ t: WRATH.crushAfter, piece: p, caster });
  }

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
    /** 神怒の衝撃波（x, y, z：放った所、radius：届く所、caster：放った人） */
    blast({ x, y, z, radius, fighter }) {
      for (const p of props) {
        if (p.gone) continue;
        const d = Math.hypot(p.meta.x - x, p.meta.z - z);
        if (d > radius || Math.abs(p.meta.y - y) > 4) continue;
        fling(p, x, z, 1 - d / radius);
      }
      houses.forEach((hh, i) => {
        const p = roofs.get(i);
        if (!p || p.gone) return;
        const [lx, lz] = local(hh, x, z);
        const ox = Math.max(0, Math.abs(lx) - hh.w / 2), oz = Math.max(0, Math.abs(lz) - hh.d / 2);
        if (Math.hypot(ox, oz) > WRATH.roofReach) return;
        collapse(p, fighter);
      });
      flush();
    },
    /** 毎フレーム：破片を動かし、屋根の下敷きを見る、貫く矢の穴を開ける */
    update(dt, fighters, projectiles) {
      for (const m of moving) {
        if (m.rest) continue;
        m.vy -= G * dt;
        m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
        const floor = m.floor ?? groundAt(m.x, m.z, m.y + 0.5) + (m.half || 0.2);
        if (m.y <= floor) {
          m.y = floor;
          if (m.bounce && m.bounces < 1 && m.vy < -2.5) { m.vy *= -0.3; m.vx *= 0.5; m.vz *= 0.5; m.bounces++; m.spin = m.spin.map((s) => s * 0.4); }
          else m.rest = true;
        }
        m.ent.setPosition(m.x, m.y, m.z);
        if (!m.rest) m.ent.rotateLocal(m.spin[0] * dt, m.spin[1] * dt, m.spin[2] * dt);
      }
      // 屋根が落ちきった：家の一番上の階にいた人は下敷き（放った本人は除く）
      for (let i = crushes.length - 1; i >= 0; i--) {
        const c = crushes[i];
        c.t -= dt;
        if (c.t > 0) continue;
        crushes.splice(i, 1);
        const M = c.piece.meta, hh = houses[M.house];
        for (const f of fighters) {
          if (!f.alive || f === c.caster) continue;
          const [lx, lz] = local(hh, f.x, f.z);
          if (Math.abs(lx) > hh.w / 2 || Math.abs(lz - M.zc) > M.d / 2) continue;   // 家の外にいる人（吹き飛ばされて出た人も）は助かる
          if ((f.y ?? 0) < M.floorY - 0.5) continue;   // 下の階にいる人は、上の階の床が守る
          onCrush(f, c.caster);
        }
      }
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
    /** 確かめ用：家の一覧（位置・大きさ・向き） */
    get houses() { return houses; },
    /** 確かめ用：開いた穴（位置と外向き） */
    get holes() { return holeList; },
    /** 確かめ用：壊れた部品の数・動いている破片の数・穴の数 */
    get stats() {
      // 覚えている形の大きさ（バイト）：部品の形の写し＋三角形の番号の写し
      let bytes = 0;
      for (const p of pieces) for (const g of Object.values(p.geo)) bytes += g.positions.byteLength + g.normals.byteLength + g.uvs.byteLength + g.colors.byteLength + g.indices.byteLength;
      for (const m of Object.values(meshes)) bytes += m.idx.byteLength;
      return { gone: pieces.filter((p) => p.gone).length, debris: moving.length, holes: Math.min(holeCount, holeMax) / 2, props: props.length, roofs: roofs.size, kb: Math.round(bytes / 1024) };
    },
  };
}
