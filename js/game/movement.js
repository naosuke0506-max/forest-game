// 戦う人の移動（計算だけ）：入力（前後・左右・向き）を受けて動き、障害物を避け、歩ける範囲の外へ出ない。
// bot はこれを使う。人間のプレイヤーも、いずれこれに寄せる（オンライン化のとき、同じ計算で動かすため）
// しゃがむ・伏せると遅くなり、走れない（game/stance.js）。伏せる・起き上がる途中は動けない
import { stanceSpeed, canRun } from './stance.js';
import { applyWater, swimSpeed, wadeScale } from './swim.js';
import { slopeSpeed, slopeAhead } from './slope.js';

export const WALK_SPEED = 3.0; // m/s
export const RUN_SPEED = 4.5;   // 歩きの 1.5 倍（利用者の指示 2026-11-16：走る速度が速い。前は 5.2）
export const BODY_RADIUS = 0.35;

/**
 * @param {object} f 戦う人（createFighter の記録）
 * @param {{forward: number, strafe: number, run: boolean, yaw: number}} input
 * @param {{obstacles: object, areaRadius: number, groundAt?: Function, heightAt?: Function}} world  heightAt：地面の高さ（坂の速さに使う）
 */
export function moveFighter(f, input, dt, world) {
  f.yaw = input.yaw;
  const mag = Math.min(1, Math.hypot(input.forward, input.strafe));
  if (mag > 0) {
    // 防御中・攻撃中は遅い。川の中は遅く、深い所は泳ぐ（game/swim.js）
    const speed = f.swimming ? swimSpeed(f) * (f.moveScale ?? 1)
      : (input.run && canRun(f) ? RUN_SPEED : WALK_SPEED) * f.stats.speed * (f.moveScale ?? 1) * stanceSpeed(f) * wadeScale(f.waterDepth);
    const rad = (f.yaw * Math.PI) / 180;
    const fx = -Math.sin(rad), fz = -Math.cos(rad);  // 前（-Z を向きで回したもの）
    const rx = Math.cos(rad), rz = -Math.sin(rad);   // 右
    let k = (speed * dt) / Math.max(1, Math.hypot(input.forward, input.strafe));
    let mx = fx * input.forward + rx * input.strafe, mz = fz * input.forward + rz * input.strafe;
    // 坂（game/slope.js）：上りは遅く、急な下りも遅い。泳いでいる間は関係ない
    // 洞窟の口のまわり（口の後ろは岩山の崖。地面の高さで見ると「上れない坂」に見えてしまう）と洞窟の中では使わない
    if (world.heightAt && !f.swimming && !(world.cave && world.cave.patchAt(f.x, f.z))) {
      const ml = Math.hypot(mx, mz) || 1;
      k *= slopeSpeed(slopeAhead(world.heightAt, f.x, f.z, f.y, mx / ml, mz / ml));
    }
    f.x += mx * k;
    f.z += mz * k;
  }
  world.obstacles.resolve(f, BODY_RADIUS);
  keepInside(f, world.areaRadius);
  if (world.groundAt) f.y = world.groundAt(f.x, f.z, f.y);   // 家の床・階段の高さ
  if (world.water) applyWater(f, world.water);               // 川の中を歩く・泳ぐ（泳いでいれば水面に浮く）
  return mag;
}

/** 歩ける範囲（円）の外へ出ない */
export function keepInside(p, radius) {
  const r = Math.hypot(p.x, p.z);
  if (r > radius) { p.x *= radius / r; p.z *= radius / r; }
}
