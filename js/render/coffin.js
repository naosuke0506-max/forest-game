// 棺桶から出る：試合の始まり。利用者の指示（2026-11-14）：
//   「出現の仕方も、普通に現れるのではなく、棺桶から出てきます。棺桶の中の視点から始まり、棺桶を開けて出てくると、ようやく操作可能になります」
//   ・戦う人それぞれの出る所に、木の棺桶を 1 つ置く（頭は後ろ、足は前。地面の傾きに合わせて寝かせる）
//   ・自分は棺桶の中で仰向けに寝た視点から始まる（暗い。蓋の板の隙間から光が漏れる）
//   ・「開棺」（PC は E・スペース・Enter）で蓋を押し開ける → 起き上がって立つ → 操作できる。相手（bot）の蓋も同じ時に開く
//   ・押さずにいても、WAIT 秒で勝手に開く
//   ・棺桶は試合の間そのまま残る（当たり判定は無い。縁の高さは 0.4 m で、またいで通れる）
// 形は村の木の質感（world/build-kit.js の wood）で、箱 1 つ・蓋 1 つの形を全部の棺桶で使い回す（描画命令は棺桶 1 つにつき 2）
import * as pc from 'playcanvas';
import { createMesh } from '../core/mesh-utils.js';
import { builder } from '../world/build-kit.js';

const WAIT = 12;       // 押さなくても開くまで（秒）
const OPEN = 1.25;     // 蓋が開く長さ（秒）
const RISE = 1.75;     // 起き上がって立つ長さ（秒）
const H = 0.40, LID = 0.035, WALL = 0.03;   // 箱の高さ・蓋の厚さ・板の厚さ（m）
// 上から見た形（六角。頭の側が +z、足の側が -z。x は右）
const OUT = [[-0.27, 1.05], [0.27, 1.05], [0.40, 0.50], [0.22, -1.05], [-0.22, -1.05], [-0.40, 0.50]];
const halfW = (z) => (z > 0.5 ? 0.40 + ((z - 0.5) / 0.55) * (0.27 - 0.40) : 0.22 + ((z + 1.05) / 1.55) * (0.40 - 0.22));
const HINGE = { x: 0.415, y: H };   // 蓋が回る軸（右の縁）

function buildMeshes(device) {
  // ---- 箱：外の面・内の面（暗い）・縁・底 ----
  const B = builder();
  const n2 = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dz / l, -dx / l]; };   // 外向き（時計回りに並べた辺）
  for (let i = 0; i < OUT.length; i++) {
    const a = OUT[i], b = OUT[(i + 1) % OUT.length], [nx, nz] = n2(a, b);
    const ai = [a[0] - nx * WALL, a[1] - nz * WALL], bi = [b[0] - nx * WALL, b[1] - nz * WALL];
    // 外（地面の下 0.45 m まで。斜面でも下にすき間が出ない）
    B.quad('wood', [b[0], -0.45, b[1]], [a[0], -0.45, a[1]], [a[0], H, a[1]], [b[0], H, b[1]], [nx, 0, nz], 0.62, [0.45, 0.45, 1, 1]);
    // 内（暗い）
    B.quad('wood', [ai[0], 0.04, ai[1]], [bi[0], 0.04, bi[1]], [bi[0], H, bi[1]], [ai[0], H, ai[1]], [-nx, 0, -nz], 0.2, [0.55, 0.55, 1, 1]);
    // 縁
    B.quad('wood', [a[0], H, a[1]], [ai[0], H, ai[1]], [bi[0], H, bi[1]], [b[0], H, b[1]], [0, 1, 0], 0.5);
  }
  // 底（2 枚の四角で六角を埋める）
  B.quad('wood', [OUT[0][0], 0.04, OUT[0][1]], [OUT[5][0], 0.04, OUT[5][1]], [OUT[2][0], 0.04, OUT[2][1]], [OUT[1][0], 0.04, OUT[1][1]], [0, 1, 0], 0.22);
  B.quad('wood', [OUT[5][0], 0.04, OUT[5][1]], [OUT[4][0], 0.04, OUT[4][1]], [OUT[3][0], 0.04, OUT[3][1]], [OUT[2][0], 0.04, OUT[2][1]], [0, 1, 0], 0.22);
  // 鉄の帯（外の面の上に 2 本。暗い色の薄い板）
  for (const z of [0.72, -0.62]) {
    const w = halfW(z) + 0.004;
    for (const s of [1, -1]) B.quad('wood', [s * w, 0.02, z - 0.035 * s], [s * w, 0.02, z + 0.035 * s], [s * w, H + 0.001, z + 0.035 * s], [s * w, H + 0.001, z - 0.035 * s], [s, 0, 0], 0.16);
  }
  const box = createMesh(device, B.parts.wood);

  // ---- 蓋：板 3 枚（すき間 14 mm。中から、すき間に外の光が見える）。原点は回る軸（HINGE） ----
  const L = builder();
  const ox = -HINGE.x, y0 = 0, y1 = LID;   // 軸からの位置
  const zs = [-1.07, -0.3, 0.5, 1.07];       // 幅の変わり目（と、途中に 1 つ）
  const over = 0.018;                        // 箱より少し大きい
  const edge = (z) => halfW(Math.max(-1.05, Math.min(1.05, z))) + over;
  // 板 3 枚の幅の割り方：左の縁〜-0.123、-0.109〜0.109、0.123〜右の縁（すき間 14 mm）
  const strips = [[(z) => -edge(z), () => -0.123], [() => -0.109, () => 0.109], [() => 0.123, (z) => edge(z)]];
  strips.forEach(([xa, xb], si) => {
    const tone = [0.66, 0.74, 0.6][si];
    for (let k = 0; k < zs.length - 1; k++) {
      const za = zs[k], zb = zs[k + 1];
      const p = (xf, z, y) => [ox + xf(z), y, z];
      // 表（上）・裏（下。暗い）
      L.quad('wood', p(xa, za, y1), p(xa, zb, y1), p(xb, zb, y1), p(xb, za, y1), [0, 1, 0], tone);
      L.quad('wood', p(xa, za, y0), p(xb, za, y0), p(xb, zb, y0), p(xa, zb, y0), [0, -1, 0], 0.17 + 0.03 * si);
      // 板の横の面（すき間の中・外の縁）
      L.quad('wood', p(xa, zb, y0), p(xa, zb, y1), p(xa, za, y1), p(xa, za, y0), [-1, 0, 0], 0.3);
      L.quad('wood', p(xb, za, y0), p(xb, za, y1), p(xb, zb, y1), p(xb, zb, y0), [1, 0, 0], 0.3);
    }
    // 頭と足の端
    const zh = zs.at(-1), zf = zs[0];
    L.quad('wood', [ox + xa(zh), y0, zh], [ox + xb(zh), y0, zh], [ox + xb(zh), y1, zh], [ox + xa(zh), y1, zh], [0, 0, 1], 0.4);
    L.quad('wood', [ox + xb(zf), y0, zf], [ox + xa(zf), y0, zf], [ox + xa(zf), y1, zf], [ox + xb(zf), y1, zf], [0, 0, -1], 0.4);
  });
  // 蓋をつなぐ横木 2 本（裏。板 3 枚を留める）と、表の十字（暗い鉄）
  for (const z of [0.72, -0.62]) {
    const w = edge(z) - 0.03;
    L.quad('wood', [ox - w, y0 - 0.02, z - 0.04], [ox + w, y0 - 0.02, z - 0.04], [ox + w, y0 - 0.02, z + 0.04], [ox - w, y0 - 0.02, z + 0.04], [0, -1, 0], 0.13);
    L.quad('wood', [ox - w, y0 - 0.02, z + 0.04], [ox + w, y0 - 0.02, z + 0.04], [ox + w, y0, z + 0.04], [ox - w, y0, z + 0.04], [0, 0, 1], 0.15);
    L.quad('wood', [ox + w, y0 - 0.02, z - 0.04], [ox - w, y0 - 0.02, z - 0.04], [ox - w, y0, z - 0.04], [ox + w, y0, z - 0.04], [0, 0, -1], 0.15);
  }
  const cross = (x0, x1, z0, z1) => L.quad('wood', [ox + x0, y1 + 0.004, z0], [ox + x0, y1 + 0.004, z1], [ox + x1, y1 + 0.004, z1], [ox + x1, y1 + 0.004, z0], [0, 1, 0], 0.15);
  cross(-0.03, 0.03, -0.55, 0.85);
  cross(-0.2, 0.2, 0.42, 0.48);
  const lid = createMesh(device, L.parts.wood);
  return { box, lid, triangles: (B.parts.wood.indices.length + L.parts.wood.indices.length) / 3 };
}

/**
 * @param {pc.AppBase} app
 * @param {object} o
 * @param {pc.StandardMaterial} o.material 村の木の質感（world/castle.js の materials.wood）
 * @param {(x: number, z: number) => number} o.groundAt 地面の高さ
 * @param {pc.Entity} o.camera 森のカメラ
 */
export function createCoffins(app, { material, groundAt, camera }) {
  const el = document.getElementById('coffin'), openBtn = document.getElementById('coffin-open');
  let meshes = null;
  const items = [];   // { box, lid, q（箱の向き）, pos }
  const qYaw = new pc.Quat(), qX = new pc.Quat(), qZ = new pc.Quat(), qLid = new pc.Quat(), qT = new pc.Quat();
  const v = new pc.Vec3(), v2 = new pc.Vec3();
  let mine = null, state = 'idle', t = 0, done = null, endPose = null, getEnd = null, onOpen = null, onRise = null;
  const lie = { pos: new pc.Vec3(), rot: new pc.Quat() }, ctrl = new pc.Vec3();
  const smooth = (k) => k * k * (3 - 2 * k);

  /** 蓋の姿（k：0 = 閉じている、1 = 開いて横の地面に裏返っている） */
  function poseLid(it, k) {
    const a = 180 * smooth(Math.min(1, k * 1.08));
    const slide = smooth(Math.max(0, (k - 0.4) / 0.6));
    // 開く前のひと押し（少し浮いて戻る）
    const bump = k < 0.12 ? Math.sin((k / 0.12) * Math.PI) * 5 : 0;
    qLid.setFromEulerAngles(0, 0, -(a + bump));   // 右の縁を軸に、右へ倒れる
    v.set(HINGE.x + 0.2 * slide, HINGE.y - (HINGE.y - 0.05) * slide, 0);
    it.q.transformVector(v, v2);
    it.lid.setPosition(it.pos.x + v2.x, it.pos.y + v2.y, it.pos.z + v2.z);
    it.lid.setRotation(qT.mul2(it.q, qLid));
  }

  function clear() {
    for (const it of items) { it.box.destroy(); it.lid.destroy(); }
    items.length = 0;
    mine = null;
  }

  return {
    get triangles() { return meshes ? meshes.triangles * items.length : 0; },
    get count() { return items.length; },
    get state() { return state; },
    /**
     * 棺桶を置く（戦う人の出る所。前の試合の物は片付ける）
     * @param {{ x: number, z: number, yaw: number, isPlayer?: boolean }[]} spots
     */
    place(spots) {
      clear();
      if (!material) return;
      meshes = meshes || buildMeshes(app.graphicsDevice);
      for (const s of spots) {
        const a = (s.yaw * Math.PI) / 180, fx = -Math.sin(a), fz = -Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
        const hHead = groundAt(s.x - fx * 0.9, s.z - fz * 0.9), hFoot = groundAt(s.x + fx * 0.9, s.z + fz * 0.9);
        const hR = groundAt(s.x + rx * 0.4, s.z + rz * 0.4), hL = groundAt(s.x - rx * 0.4, s.z - rz * 0.4);
        const clampA = (d) => Math.max(-16, Math.min(16, d));
        const pitch = clampA((-Math.atan2(hHead - hFoot, 1.8) * 180) / Math.PI), roll = clampA((Math.atan2(hR - hL, 0.8) * 180) / Math.PI);
        const q = new pc.Quat();
        qYaw.setFromEulerAngles(0, s.yaw, 0); qX.setFromEulerAngles(pitch, 0, 0); qZ.setFromEulerAngles(0, 0, roll);
        q.mul2(qYaw, qX).mul(qZ);
        const pos = new pc.Vec3(s.x, (hHead + hFoot + hR + hL) / 4 + 0.01, s.z);
        const mk = (name, mesh) => {
          const e = new pc.Entity(name);
          e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, material)], castShadows: true, receiveShadows: true });
          app.root.addChild(e);
          return e;
        };
        const it = { box: mk('coffin', meshes.box), lid: mk('coffin-lid', meshes.lid), q, pos, spot: s };
        it.box.setPosition(pos); it.box.setRotation(q);
        poseLid(it, 0);
        items.push(it);
        if (s.isPlayer) mine = it;
      }
    },
    /**
     * 棺桶の中から始める。蓋を開けて立ち上がったら終わる（Promise）
     * @param {object} o
     * @param {() => { pos: pc.Vec3, rot: pc.Quat }} o.endPose 立ち上がった後の、プレイヤーのカメラの位置と向き（起き上がる時に 1 回読む）
     * @param {() => void} [o.onOpen] 蓋が開き始めた（音）
     * @param {() => void} [o.onRise] 起き上がり始めた（相手の体を出す など）
     */
    play({ endPose: ep, onOpen: oo = null, onRise: or = null }) {
      getEnd = ep; onOpen = oo; onRise = or;
      state = 'inside'; t = 0;
      el.hidden = false;
      el.classList.remove('open');
      if (mine) {
        // 仰向け：頭は +z の側、目は底から 0.2 m。真上（蓋の裏）を見る
        mine.q.transformVector(v.set(0, 0.2, 0.6), v2);
        lie.pos.set(mine.pos.x + v2.x, mine.pos.y + v2.y, mine.pos.z + v2.z);
        lie.rot.mul2(mine.q, qX.setFromEulerAngles(90, 0, 0));
        mine.q.transformVector(v.set(0, 1.0, 0.45), v2);
        ctrl.set(mine.pos.x + v2.x, mine.pos.y + v2.y, mine.pos.z + v2.z);   // 起き上がる途中に通る辺り（頭の上）
      }
      const open = () => { if (state === 'inside') { state = 'opening'; t = 0; el.classList.add('open'); onOpen?.(); } };
      openBtn.onclick = open;
      const onKey = (e) => { if (['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); open(); } };
      window.addEventListener('keydown', onKey);
      return new Promise((resolve) => {
        done = () => { window.removeEventListener('keydown', onKey); openBtn.onclick = null; el.hidden = true; state = 'idle'; resolve(); };
      });
    },
    /** 確かめ用：すぐ開ける */
    open() { openBtn.onclick?.(); },
    /** 毎フレーム：蓋とカメラを動かす */
    update(dt) {
      if (state === 'idle') return;
      t += Math.min(dt, 0.1);
      if (state === 'inside') {
        if (t > WAIT) openBtn.onclick?.();
        // 息をするくらいの、わずかな揺れ
        if (mine) {
          camera.setPosition(lie.pos.x, lie.pos.y + Math.sin(t * 1.3) * 0.004, lie.pos.z);
          camera.setRotation(lie.rot);
        }
        return;
      }
      if (state === 'opening') {
        const k = Math.min(1, t / OPEN);
        for (const it of items) poseLid(it, k);
        if (mine) {
          // 蓋が開いていく方（右）へ、少し顔を向ける
          qT.mul2(lie.rot, qZ.setFromEulerAngles(0, -9 * smooth(k), 0));
          camera.setPosition(lie.pos);
          camera.setRotation(qT);
        }
        if (k >= 1) { state = 'rising'; t = 0; endPose = getEnd?.() || null; lie.rot.copy(camera.getRotation()); onRise?.(); }
        return;
      }
      if (state === 'rising') {
        const k = Math.min(1, t / RISE), s = smooth(k);
        if (mine && endPose) {
          // 起き上がる：仰向け → 頭の上の辺り → 立った目の位置（なめらかな弧）。向きは先に起こす
          const a = (1 - s) * (1 - s), b = 2 * s * (1 - s), c = s * s;
          camera.setPosition(lie.pos.x * a + ctrl.x * b + endPose.pos.x * c, lie.pos.y * a + ctrl.y * b + endPose.pos.y * c, lie.pos.z * a + ctrl.z * b + endPose.pos.z * c);
          camera.setRotation(qT.slerp(lie.rot, endPose.rot, smooth(Math.min(1, k * 1.2))));
        }
        if (k >= 1) done?.();
      }
    },
    /** 確かめ用：蓋を k（0〜1）まで開けた姿にする */
    poseAll(k) { for (const it of items) poseLid(it, k); },
    clear,
  };
}
