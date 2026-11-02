// bot の考え（計算だけ）。人間と同じ形の入力（前後・左右・走る・向き）を出す。
// 手順 1 では森を歩き回るだけ。手順 3 で、探索・採取・戦闘・逃走を足す
import { moveFighter } from './movement.js';

export function createBot(fighter, rng) {
  const b = {
    fighter,
    goal: null,         // 向かう場所
    thinkTimer: 0,
    waitTimer: 0,       // 立ち止まって周りを見る時間
    stuckTimer: 0,
    lastX: fighter.x, lastZ: fighter.z,
    input: { forward: 0, strafe: 0, run: false, yaw: fighter.yaw },
  };

  function pickGoal(areaRadius) {
    const r = Math.sqrt(rng.next()) * areaRadius * 0.85;
    const a = rng.next() * Math.PI * 2;
    b.goal = { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }

  /** 考えて入力を決める（0.3〜0.6 秒ごと） */
  function think(world) {
    const f = fighter;
    if (!b.goal || Math.hypot(b.goal.x - f.x, b.goal.z - f.z) < 2) {
      if (b.goal && b.waitTimer <= 0) b.waitTimer = 1 + rng.next() * 3; // 着いたら少し立ち止まる
      pickGoal(world.areaRadius);
    }
    // 引っかかって進めないときは、別の場所を目指す
    if (Math.hypot(f.x - b.lastX, f.z - b.lastZ) < 0.15 && b.input.forward > 0) b.stuckTimer += 0.45;
    else b.stuckTimer = 0;
    if (b.stuckTimer > 1.2) { pickGoal(world.areaRadius); b.stuckTimer = 0; }
    b.lastX = f.x; b.lastZ = f.z;

    const dx = b.goal.x - f.x, dz = b.goal.z - f.z;
    b.input.yaw = (Math.atan2(-dx, -dz) * 180) / Math.PI;
    b.input.forward = b.waitTimer > 0 ? 0 : 1;
    b.input.strafe = 0;
    b.input.run = rng.next() < 0.15;
  }

  return {
    fighter,
    update(dt, world) {
      if (!fighter.alive) return 0;
      b.waitTimer -= dt;
      b.thinkTimer -= dt;
      if (b.thinkTimer <= 0) { b.thinkTimer = 0.3 + rng.next() * 0.3; think(world); }
      // 向きはなめらかに変える
      let d = b.input.yaw - fighter.yaw;
      d = ((d + 540) % 360) - 180;
      const turned = { ...b.input, yaw: fighter.yaw + Math.max(-1, Math.min(1, d / 30)) * Math.min(Math.abs(d), 240 * dt) };
      return moveFighter(fighter, turned, dt, world);
    },
  };
}
