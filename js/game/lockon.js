// 捕捉（ロックオン。2026-11-24。利用者の指示：「ロックオン機能を追加してください。敵が一定の範囲に入るのと、障害物に挟まれずに直視できる場合のみ可能。
//   ロックオンというボタンが追加され、押すことで敵をロックオンできます。移動スティックを動かさなくても、自動的に敵に身体が向きます。
//   ロックオンを解除することもできます」）。数は game/data.js の LOCK。計算だけ（PlayCanvas に依存しない）
//   ・選ぶ：範囲（LOCK.range）の中で、見ている向きの前（左右 LOCK.fov 度）にいて、体の点の LOCK.visible 以上が目から直接見える敵。
//     見ている向きの真ん中に近く、近い敵ほど先に選ぶ
//   ・続ける：相手が倒れる・隠れる・LOCK.keep より遠い・LOCK.lost 秒続けて見えない、のどれかで外れる
import { LOCK, DIVE } from './data.js';
import { stanceShape } from './stance.js';

const DEG = Math.PI / 180;

/**
 * @param {{ senses: object, sight: object|null, heightAt: Function }} o senses：体の点（game/senses.js の bodyPoints）、sight：視線をさえぎる物
 */
export function createLockOn({ senses, sight = null, heightAt }) {
  const yOf = (f) => f.y ?? heightAt(f.x, f.z);
  const eyeOf = (f) => [f.x, yOf(f) + stanceShape(f).eye, f.z];

  /** 目から相手の体の点のうち、直接見える割合（0〜1） */
  function seenPart(me, t) {
    if (!sight) return 1;
    const eye = eyeOf(me), pts = senses.bodyPoints(t, me);
    let seen = 0;
    for (const q of pts) if (!sight.blocked(eye, q)) seen++;
    return seen / pts.length;
  }
  /** 捕まえられる相手か（倒れていない・隠れていない・深く潜っていない） */
  const fair = (me, t) => t !== me && t.alive && !t.hidden && !(t.diving && (t.diveK || 0) > 0.6 && Math.hypot(t.x - me.x, t.z - me.z) > DIVE.seen);

  return {
    /**
     * 捕まえる相手を選ぶ（いなければ null）
     * @param {object} me 自分（x, z, y, stance）
     * @param {object[]} fighters 試合の全員
     * @param {number} viewYaw 見ている向き（度。0 で -Z。体の向き＋首の向き）
     */
    pick(me, fighters, viewYaw) {
      const a = viewYaw * DEG, fx = -Math.sin(a), fz = -Math.cos(a), half = Math.cos((LOCK.fov / 2) * DEG);
      let best = null;
      for (const t of fighters) {
        if (!fair(me, t)) continue;
        const dx = t.x - me.x, dz = t.z - me.z, d = Math.hypot(dx, dz);
        if (d > LOCK.range) continue;
        const cos = d > 0.3 ? (fx * dx + fz * dz) / d : 1;
        if (cos < half) continue;
        if (seenPart(me, t) < LOCK.visible) continue;
        // 見ている向きの真ん中に近いほど・近いほど先に（真ん中から 30 度ずれると、10 m 遠いのと同じくらい）
        const score = (1 - cos) * 40 + d;
        if (!best || score < best.score) best = { t, score };
      }
      return best ? best.t : null;
    },
    /**
     * 捕まえ続けられるか（毎回呼ぶ）。lock：{ target, lostFor }。外れたら、その訳（'dead'・'hidden'・'far'・'lost'）を返す。続けるなら null
     * 見えていない間は lock.lostFor を増やし、lock.seen を false にする（印を薄くする）
     */
    keep(me, lock, dt) {
      const t = lock.target;
      if (!t.alive) return 'dead';
      if (!fair(me, t)) return 'hidden';
      if (Math.hypot(t.x - me.x, t.z - me.z) > LOCK.keep) return 'far';
      lock.seen = seenPart(me, t) >= LOCK.visible * 0.5;
      lock.lostFor = lock.seen ? 0 : (lock.lostFor || 0) + dt;
      return lock.lostFor > LOCK.lost ? 'lost' : null;
    },
    /** 狙う所：相手の胸（m） */
    aimAt(t) {
      const sh = stanceShape(t);
      return { x: t.x, y: yOf(t) + sh.height * LOCK.pitch, z: t.z };
    },
  };
}
