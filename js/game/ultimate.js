// 必殺技（利用者の指示 2026-11-25。docs/DESIGN.md「必殺技」）：必殺ボタン（PC は G）で使う。計算だけ（PlayCanvas に依存しない）。
//   1 つの試合で ULTIMATE.uses 回だけ。延長戰（第 6 刻から）に入ると、もう ULTIMATE.overtimeUses 回使える（game/match.js が足す）。
//   必殺技の間は無敵（f.invuln。game/combat.js の startUlt）。技の中身は combat.js の startUlt・ultBurst、
//   見た目は render/ult-fx.js（光・衝撃波・粒）と render/ult-show.js（自分の画面だけ：名前と紋・寄るカメラ・揺れ・閃光・ヒットストップ）
import { ULTIMATES, ELEMENT_KINDS } from './data.js';

/** その人の必殺技（ULTIMATES の 1 つ） */
export const ultOf = (f) => (f && ULTIMATES[f.char]) || null;
/** その人の属性（ELEMENT_KINDS の 1 つ） */
export const elementOf = (f) => ELEMENT_KINDS[ultOf(f)?.element] || null;
/** 残りの回数（教練では減らない：f.ultFree） */
export const ultLeft = (f) => (f?.ultFree ? Infinity : f?.ultLeft ?? 0);

// 必殺技を出すと取りやめになる動き（攻撃・溜め・弓を引く・放った後・楯の技・疾驅攻撃の後の隙）。
// もしもの時の技なので、振っている途中からでも出せる。回避・ひるみ・暗殺などの間は出せない
const CANCELABLE = new Set(['attack', 'charge', 'charge2', 'draw', 'release', 'recover', 'shield']);

/** 今出せるか */
export function canUlt(f) {
  if (!f?.alive || !ultOf(f) || !(ultLeft(f) > 0)) return false;
  if (f.hidden || f.swimming || f.falling || f.ladder) return false;   // 壁裏隠れからは出せる（壁から離れて放つ）
  if (f.stun > 0 || f.helpless > 0 || f.paralyzed > 0) return false;
  return !f.action || CANCELABLE.has(f.action.kind);
}

/** 1 回使う（教練では減らない） */
export function spendUlt(f) {
  if (!f.ultFree) f.ultLeft = Math.max(0, (f.ultLeft ?? 0) - 1);
  f.ultUsed = (f.ultUsed || 0) + 1;
}
