// 戦う人の移動（計算だけ）：入力（前後・左右・向き）を受けて動き、障害物を避け、歩ける範囲の外へ出ない。
// bot はこれを使う。人間のプレイヤーも、いずれこれに寄せる（オンライン化のとき、同じ計算で動かすため）

export const WALK_SPEED = 3.0; // m/s
export const RUN_SPEED = 5.2;
export const BODY_RADIUS = 0.35;

/**
 * @param {object} f 戦う人（createFighter の記録）
 * @param {{forward: number, strafe: number, run: boolean, yaw: number}} input
 * @param {{obstacles: object, areaRadius: number}} world
 */
export function moveFighter(f, input, dt, world) {
  f.yaw = input.yaw;
  const mag = Math.min(1, Math.hypot(input.forward, input.strafe));
  if (mag > 0) {
    const speed = (input.run ? RUN_SPEED : WALK_SPEED) * f.stats.speed * (f.moveScale ?? 1); // 防御中・攻撃中は遅い
    const rad = (f.yaw * Math.PI) / 180;
    const fx = -Math.sin(rad), fz = -Math.cos(rad);  // 前（-Z を向きで回したもの）
    const rx = Math.cos(rad), rz = -Math.sin(rad);   // 右
    const k = (speed * dt) / Math.max(1, Math.hypot(input.forward, input.strafe));
    f.x += (fx * input.forward + rx * input.strafe) * k;
    f.z += (fz * input.forward + rz * input.strafe) * k;
  }
  world.obstacles.resolve(f, BODY_RADIUS);
  keepInside(f, world.areaRadius);
  return mag;
}

/** 歩ける範囲（円）の外へ出ない */
export function keepInside(p, radius) {
  const r = Math.hypot(p.x, p.z);
  if (r > radius) { p.x *= radius / r; p.z *= radius / r; }
}
