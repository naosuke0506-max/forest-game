// 落ちる（計算だけ。PlayCanvas に依存しない）。2026-11-22：天坑（world/cave-plan.js の SKY）の穴へ入ると、縦穴を落ちて下の池へ飛び込む。
//   足もとの床（world/floors.js の groundAt）が、今の足の高さより FALL.start 以上低くなったら、すぐにはそこへ移らず、重さで落ちていく。
//   床か水面に着いたら止まる。落ちている間は、攻撃・防禦・回避・技能はできない（game/combat.js）。横へは少しだけ動ける（FALL.air）。
//   プレイヤー（player/controller.js）と bot（game/movement.js）が同じ計算を使う
import { FALL } from './data.js';

/**
 * 1 フレーム分、落ちる
 * @param {{ y?: number, swimming?: boolean, falling?: boolean, fallV?: number, landed?: number, landedWater?: boolean }} s 落ちる人（足の高さ y・泳いでいるか）。falling・fallV を書き換える
 * @param {number} ground 足もとの床の高さ
 * @param {number} dt
 * @param {number|null} waterSurface 足もとの水面（足より下にあるとき）。水面に着いたら止まる（その後は泳ぐ。game/swim.js）
 * @returns {number|null} まだ落ちている間は新しい足の高さ。落ちていない・着いたときは null（いつもどおり床・水面に合わせる）。
 *   着いたフレームは s.landed（着いた速さ m/秒）と s.landedWater（水に落ちたか）が入る（音・知らせ。読んだ方が消す）
 */
export function fallStep(s, ground, dt, waterSurface = null) {
  if (s.y === undefined || s.y === null || !Number.isFinite(ground)) return null;
  if (!s.falling) {
    // 泳いでいる人は落ちない（深い池では、水に浮いた足と池の底の差が FALL.start をこえるため）
    if (s.swimming || !(ground < s.y - FALL.start)) return null;
    s.falling = true; s.fallV = 0;
  }
  s.fallV = Math.min(FALL.max, (s.fallV || 0) + FALL.gravity * dt);
  const ny = s.y - s.fallV * dt;
  const water = waterSurface !== null && waterSurface !== undefined && waterSurface > ground ? waterSurface : null;
  const stop = water ?? ground;
  if (ny > stop) return ny;
  s.falling = false; s.landed = s.fallV; s.landedWater = water !== null; s.fallV = 0;
  return null;
}
