// タンス・ベッドに隠れる・出る・探す動きの流れ（計算だけ。PlayCanvas に依存しない。game/combat.js から使う）
//   どれも、家具の前の「出る所」に家具の方を向いて立ち（動きはこの所と向きで作ってある）、動きを最後までしてから
//   隠れる（hideIn）・出る（hideOut）・開ける（search）。動いている間は見えていて、攻撃を受ければ取りやめになる
//   探して見つけたら、そのまま引きずり出して止めを刺す（drag。される側は dragged）。自動で、避けられない
// 数値は game/data.js の HIDE_ACTS。隠れ場所そのもの（入っている人・出る所）は game/hiding.js
import { HIDE_ACTS } from './data.js';
import { resetStance } from './stance.js';

const DEG = Math.PI / 180;
const fwdOf = (yaw) => [-Math.sin(yaw * DEG), -Math.cos(yaw * DEG)];
const rightOf = (yaw) => [Math.cos(yaw * DEG), -Math.sin(yaw * DEG)];
const PLAIN_SWING = 0.5;   // 片手劍を持たない人：止めの時刻のこれだけ前から強い一撃を振る

/**
 * @param {object} o
 * @param {object} o.hiding 隠れ場所（game/hiding.js）
 * @param {(f: object, dx: number, dz: number) => void} o.move 動かす（木や壁を避ける）
 * @param {(t: object, f: object, how: string) => void} o.lethal 一撃で倒す
 * @param {(type: string, data: object) => void} o.emit
 */
export function createHideActs({ hiding, move, lethal, emit }) {
  const actsOf = (spot) => HIDE_ACTS[spot.kind] || HIDE_ACTS.wardrobe;
  /** 家具の前の出る所に、家具の方を向いて立つ（動きの元の所と向き） */
  function standAt(f, spot) {
    f.x = spot.outX; f.z = spot.outZ; f.y = spot.y;
    f.yaw = spot.yaw;   // 隠れ場所の yaw は家具の方を向いた向き（出たときは +180 で外を向く。game/hiding.js）
    f.guarding = false;
    resetStance(f);
  }

  return {
    /** 隠れ始める。誰かが入っていれば、探すのと同じ（覗いて見つけ、引きずり出して止め） */
    startHide(f, spot) {
      if (!f.alive || f.hidden || !spot || f.action) return false;
      if (spot.occupant && spot.occupant !== f) return this.startSearch(f, spot);
      standAt(f, spot);
      f.action = { kind: 'hideIn', t: 0, spot, clip: actsOf(spot).inClip, time: actsOf(spot).inTime };
      emit('hideStart', { fighter: f, spot });
      return true;
    },
    /** 出始める：隠れ場所から出て（見えるようになり）、出る動きの後で家具に背を向けて立つ */
    startExit(f) {
      const spot = f.hidden;
      if (!spot || f.action) return false;
      hiding.exit(f);          // 隠れ場所を空ける（すぐ出る所に立つ）
      standAt(f, spot);        // 動きの元の所と向き（家具の方）。動きの中で振り返って外を向く
      f.action = { kind: 'hideOut', t: 0, spot, clip: actsOf(spot).outClip, time: actsOf(spot).outTime };
      return true;
    },
    /** 探し始める（開けて覗く） */
    startSearch(f, spot) {
      if (!f.alive || f.hidden || !spot || f.action) return false;
      standAt(f, spot);
      const A = actsOf(spot);
      f.action = { kind: 'search', t: 0, spot, clip: A.searchClip, time: A.searchTime, revealAt: A.revealAt, revealed: false };
      emit('searchStart', { fighter: f, spot });
      return true;
    },

    /** 進める（毎フレーム。a.t はもう進めてある）。終わったら true */
    update(f, a) {
      if (a.kind === 'hideIn') {
        if (a.t < a.time) return false;
        // 入る間に、ほかの誰かが先に入った：覗いて見つけたのと同じ（引きずり出して止め）
        if (a.spot.occupant && a.spot.occupant !== f) {
          const A = actsOf(a.spot);
          f.action = { kind: 'search', t: A.revealAt, spot: a.spot, clip: A.searchClip, time: A.searchTime, revealAt: A.revealAt, revealed: false };
          return false;
        }
        f.action = null;
        hiding.hide(f, a.spot);   // 隠れる
        return true;
      }
      if (a.kind === 'hideOut') {
        if (a.t < a.time) return false;
        f.action = null;
        f.yaw = a.spot.yaw + 180;   // 動きの終わりは家具に背を向けている
        f.snapPose = true;
        return true;
      }
      if (a.kind === 'search') {
        if (!a.revealed && a.t >= a.revealAt) {
          a.revealed = true;
          const v = hiding.reveal(f, a.spot)?.found;
          if (v) {
            // 見つけた：そのまま引きずり出して止め（される側は、家具の中から同じ所と向きの動き）
            const D = actsOf(a.spot).drag;
            standAt(v, a.spot);
            v.action = { kind: 'dragged', t: 0, clip: D.victim, by: f };
            v.stun = 0;
            f.action = { kind: 'drag', t: 0, spot: a.spot, victim: v, move: f.weapon === 'armingsword' ? D : null, drag: D, hit: false };
            emit('dragStart', { attacker: f, target: v });
            return false;
          }
        }
        if (a.t >= a.time) { f.action = null; return true; }
        return false;
      }
      if (a.kind === 'drag') {
        const D = a.drag, v = a.victim;
        if (!a.hit && a.t >= D.kill) {
          a.hit = true;
          if (v.alive) lethal(v, f, 'assassinate');
        }
        if (a.t >= (a.move ? D.time : D.kill + 0.4)) {
          // 動き終わりの体の位置と向き（相手を床へ倒して、横に立っている）
          if (a.move) {
            const e = D.end, [fx, fz] = fwdOf(f.yaw), [rx, rz] = rightOf(f.yaw);
            move(f, rx * e.r + fx * e.f, rz * e.r + fz * e.f);
            f.yaw -= e.yaw;
            f.snapPose = true;
          }
          f.action = null;
          return true;
        }
        return false;
      }
      if (a.kind === 'dragged') {
        // 引きずり出されている：止めを刺されるまで（引きずり出した人が倒れたら放される）
        if (!a.by.alive) f.action = null;
        return false;
      }
      return false;
    },
    /** 片手劍を持たない人が、引きずり出して強い一撃を振り始める時刻 */
    plainSwingAt: (a) => a.drag.kill - PLAIN_SWING,
  };
}
