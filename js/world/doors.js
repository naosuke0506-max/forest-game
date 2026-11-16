// 家の扉：開け閉めできる（利用者の指示 2026-11-14：「村の小屋には全て扉をつけて、出入りできるようにしてください」。
//   開け方は利用者が選んだ「ボタンで開け閉め」）。
//   ・扉は板戸 1 枚。蝶番は扉口の右（家の中から見て左）で、内へ開く（開くと、扉口の内側で壁に沿う）
//   ・閉じている間は通れず、向こうが見えない（当たり判定の円と、bot の目をさえぎる箱を切り替える。矢も通らない）
//   ・扉口に人がいる間は閉められない
//   ・蝶番の場所と、切り替える当たり判定・箱は world/house-builder.js が登録する
// 見た目は、どの扉も同じ形なので 1 つの描画命令（インスタンシング）。動いた扉だけ書き換える
import * as pc from 'playcanvas';
import { createMesh } from '../core/mesh-utils.js';
import { builder, box } from './build-kit.js';
import { instanced } from '../render/furniture-motion.js';

const OPEN_ANGLE = 97;   // 開ききった角度（度。内へ）
const SPEED = 230;       // 開け閉めの速さ（度/秒。約 0.4 秒）
export const DOOR_REACH = 1.9;   // 扉口の真ん中からこの距離まで近づくと、開け閉めできる（m）

/**
 * @param {object[]} list world/house-builder.js が登録した扉
 *   { x, y, z（蝶番。y は床）, yaw（家の向き）, w, h, cx, cz（扉口の真ん中）, nx, nz（外への向き）, closedSolids, openSolids, closedSight, openSight }
 * @param {{ material: pc.StandardMaterial }} o material：村の木の扉の質感（gate）
 */
export function createDoors(app, list, { material }) {
  const doors = list.map((d, i) => Object.assign(d, { id: i, open: false, angle: 0 }));
  const listeners = [];
  let set = null;
  if (doors.length && material) {
    // 板戸：蝶番を原点に、閉じたとき -x へ伸びる。鉄の帯 2 本と、引き手（内と外）
    const B = builder();
    const W = doors[0].w, H = doors[0].h;
    box(B, 'gate', -W / 2 + 0.02, 0, 0, W - 0.06, 0.06, H, 0, { shade: 0.92, bottom: true });
    for (const y of [0.32, H - 0.42]) for (const z of [0.034, -0.034]) box(B, 'gate', -W / 2 + 0.05, y, z, W - 0.16, 0.012, 0.09, 0, { shade: 0.22, bottom: true });
    for (const z of [0.05, -0.05]) box(B, 'gate', -W + 0.2, 0.98, z, 0.05, 0.04, 0.16, 0, { shade: 0.18, bottom: true });
    set = instanced(app, 'house-doors', createMesh(app.graphicsDevice, B.parts.gate), material, doors);
  }
  const pos = new pc.Vec3(), q = new pc.Quat(), one = new pc.Vec3(1, 1, 1), m = new pc.Mat4();
  const write = (k) => {
    const d = doors[k];
    pos.set(d.x, d.y, d.z);
    q.setFromEulerAngles(0, d.yaw - d.angle, 0);   // 内（家の -z の側）へ開く
    m.setTRS(pos, q, one);
    set.data.set(m.data, k * 16);
  };
  /** 当たり判定と、視線をさえぎる箱を、今の開け閉めに合わせる */
  const apply = (d) => {
    for (const o of d.closedSolids) if (o) o.off = d.open;
    for (const o of d.openSolids) if (o) o.off = !d.open;
    if (d.closedSight) d.closedSight.off = d.open;
    if (d.openSight) d.openSight.off = !d.open;
  };
  for (const d of doors) apply(d);
  if (set) { for (let k = 0; k < doors.length; k++) write(k); set.vb.setData(set.data); }

  return {
    doors,
    /** 開け閉めできる近さにある扉（足の高さ y が同じ階のもの）。無ければ null */
    nearest(x, z, y = null, reach = DOOR_REACH) {
      let best = null, bd = reach;
      for (const d of doors) {
        if (y !== null && Math.abs(y - d.y) > 1.3) continue;
        const dist = Math.hypot(x - d.cx, z - d.cz);
        if (dist < bd) { bd = dist; best = d; }
      }
      return best;
    },
    /**
     * 開ける・閉める。閉めるとき、扉口に人がいれば閉められない（false を返す）
     * @param {object} by 開け閉めした人（音・知らせ用）
     * @param {object[]} [people] 扉口をふさいでいないか見る人たち（{ x, z, y, alive }）
     */
    toggle(d, by = null, people = null) {
      if (d.open && people) {
        for (const f of people) {
          if (f.alive === false) continue;
          if (Math.abs((f.y ?? d.y) - d.y) < 1.3 && Math.hypot(f.x - d.cx, f.z - d.cz) < 0.75) return false;
        }
      }
      d.open = !d.open;
      d.wait = by ? 0.16 : 0;   // 人が開け閉めしたときは、手が届くまで（扉を押す動きの 0.16 秒）待ってから動き出す（通れる・見通せるのはすぐ切り替わる）
      apply(d);
      for (const fn of listeners) fn({ door: d, open: d.open, by });
      return true;
    },
    /** 全部の扉を開ける・閉める（試合の始め・教練） */
    setAll(open) {
      for (const d of doors) { d.open = !!open; d.angle = open ? OPEN_ANGLE : 0; apply(d); }
      if (set) { for (let k = 0; k < doors.length; k++) write(k); set.vb.setData(set.data); }
    },
    /** 開け閉めの知らせ（音を鳴らす・bot に聞こえる）：fn({ door, open, by })。試合ごとに付け替える（前の試合の物は外す） */
    on(fn) { listeners.length = 0; listeners.push(fn); },
    update(dt) {
      if (!set) return;
      let dirty = false;
      for (let k = 0; k < doors.length; k++) {
        const d = doors[k], goal = d.open ? OPEN_ANGLE : 0;
        if (d.angle === goal) continue;
        if (d.wait > 0) { d.wait -= dt; continue; }
        d.angle += Math.max(-SPEED * dt, Math.min(SPEED * dt, goal - d.angle));
        write(k); dirty = true;
      }
      if (dirty) set.vb.setData(set.data);
    },
  };
}
