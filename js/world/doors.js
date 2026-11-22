// 家の扉：開け閉めできる（利用者の指示 2026-11-14：「村の小屋には全て扉をつけて、出入りできるようにしてください」。
//   開け方は利用者が選んだ「ボタンで開け閉め」）。
//   ・扉は板戸 1 枚。蝶番は扉口の右（家の中から見て左）で、内へ開く（開くと、扉口の内側で壁に沿う）
//   ・閉じている間は通れず、向こうが見えない（当たり判定の円と、bot の目をさえぎる箱を切り替える。矢も通らない）
//   ・扉口に人がいる間は閉められない
//   ・蝶番の場所と、切り替える当たり判定・箱は world/house-builder.js が登録する
// 見た目は、同じ大きさの扉を 1 つの描画命令にまとめる（インスタンシング）。動いた扉だけ書き換える。
// 2026-11-22：教会の両開きの扉（world/church.js）のため、大きさの違う扉（大きさごとに 1 つの描画命令）・左右を映した扉（flip）・
//   2 枚で 1 組の扉（pair。片方を開け閉めすると、もう片方も）を扱えるようにした
import * as pc from 'playcanvas';
import { createMesh } from '../core/mesh-utils.js';
import { builder, box } from './build-kit.js';
import { instanced } from '../render/furniture-motion.js';

const OPEN_ANGLE = 97;   // 開ききった角度（度。内へ）
const SPEED = 230;       // 開け閉めの速さ（度/秒。約 0.4 秒）
export const DOOR_REACH = 1.9;   // 扉口の真ん中からこの距離まで近づくと、開け閉めできる（m）

/**
 * @param {object[]} list world/house-builder.js が登録した扉
 *   { x, y, z（蝶番。y は床）, yaw（家の向き）, w, h, cx, cz（扉口の真ん中）, nx, nz（外への向き）, closedSolids, openSolids, closedSight, openSight,
 *     flip（左右を映す：蝶番から +x へ伸び、逆に回って内へ開く）, pair（組の扉） }
 * @param {{ material: pc.StandardMaterial }} o material：村の木の扉の質感（gate）
 */
export function createDoors(app, list, { material }) {
  const doors = list.map((d, i) => Object.assign(d, { id: i, open: false, angle: 0 }));
  const listeners = [];
  // 大きさごとの組（形とインスタンシングの入れ物）
  const sets = new Map();
  if (doors.length && material) {
    for (const d of doors) {
      const key = `${d.w.toFixed(3)}x${d.h.toFixed(3)}`;
      if (!sets.has(key)) sets.set(key, { list: [], W: d.w, H: d.h });
      const g = sets.get(key);
      d.slot = g.list.length; d.group = g;
      g.list.push(d);
    }
    for (const [key, g] of sets) {
      // 板戸：蝶番を原点に、閉じたとき -x へ伸びる。鉄の帯 2 本と、引き手（内と外）
      const B = builder();
      const { W, H } = g;
      box(B, 'gate', -W / 2 + 0.02, 0, 0, W - 0.06, 0.06, H, 0, { shade: 0.92, bottom: true });
      for (const y of [0.32, H - 0.42]) for (const z of [0.034, -0.034]) box(B, 'gate', -W / 2 + 0.05, y, z, W - 0.16, 0.012, 0.09, 0, { shade: 0.22, bottom: true });
      for (const z of [0.05, -0.05]) box(B, 'gate', -W + 0.2, 0.98, z, 0.05, 0.04, 0.16, 0, { shade: 0.18, bottom: true });
      g.set = instanced(app, `house-doors-${key}`, createMesh(app.graphicsDevice, B.parts.gate), material, g.list);
    }
  }
  const pos = new pc.Vec3(), q = new pc.Quat(), one = new pc.Vec3(1, 1, 1), m = new pc.Mat4();
  const write = (k) => {
    const d = doors[k], set = d.group?.set;
    if (!set) return;
    pos.set(d.x, d.y, d.z);
    // 内（家の -z の側）へ開く。左右を映した扉は、180 度回して逆へ回る
    q.setFromEulerAngles(0, d.flip ? d.yaw + 180 + d.angle : d.yaw - d.angle, 0);
    m.setTRS(pos, q, one);
    set.data.set(m.data, d.slot * 16);
    d.group.dirty = true;
  };
  const flush = () => { for (const g of sets.values()) if (g.dirty && g.set) { g.set.vb.setData(g.set.data); g.dirty = false; } };
  /** 当たり判定と、視線をさえぎる箱を、今の開け閉めに合わせる */
  const apply = (d) => {
    for (const o of d.closedSolids) if (o) o.off = d.open;
    for (const o of d.openSolids) if (o) o.off = !d.open;
    if (d.closedSight) d.closedSight.off = d.open;
    if (d.openSight) d.openSight.off = !d.open;
  };
  for (const d of doors) apply(d);
  for (let k = 0; k < doors.length; k++) write(k);
  flush();

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
      if (d.open && people && d.pair) {
        const e = d.pair;
        for (const f of people) if (f.alive !== false && Math.abs((f.y ?? e.y) - e.y) < 1.3 && Math.hypot(f.x - e.cx, f.z - e.cz) < 0.75) return false;
      }
      d.open = !d.open;
      d.wait = by ? 0.16 : 0;   // 人が開け閉めしたときは、手が届くまで（扉を押す動きの 0.16 秒）待ってから動き出す（通れる・見通せるのはすぐ切り替わる）
      apply(d);
      if (d.pair) { d.pair.open = d.open; d.pair.wait = d.wait; apply(d.pair); }   // 両開き：もう片方も
      for (const fn of listeners) fn({ door: d, open: d.open, by });
      return true;
    },
    /** 全部の扉を開ける・閉める（試合の始め・教練） */
    setAll(open) {
      for (const d of doors) { d.open = !!open; d.angle = open ? OPEN_ANGLE : 0; apply(d); }
      for (let k = 0; k < doors.length; k++) write(k);
      flush();
    },
    /** 開け閉めの知らせ（音を鳴らす・bot に聞こえる）：fn({ door, open, by })。試合ごとに付け替える（前の試合の物は外す） */
    on(fn) { listeners.length = 0; listeners.push(fn); },
    update(dt) {
      if (!sets.size) return;
      for (let k = 0; k < doors.length; k++) {
        const d = doors[k], goal = d.open ? OPEN_ANGLE : 0;
        if (d.angle === goal) continue;
        if (d.wait > 0) { d.wait -= dt; continue; }
        d.angle += Math.max(-SPEED * dt, Math.min(SPEED * dt, goal - d.angle));
        write(k);
      }
      flush();
    },
  };
}
