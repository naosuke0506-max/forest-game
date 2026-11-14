// 川の中を歩く・泳ぐ（計算だけ。PlayCanvas に依存しない）。利用者の指示（2026-11-14）：川は泳げる（深い所は泳ぐ）
//   水の深さ（足もとから水面まで）が SWIM.depth より深いと泳ぐ：体は水面に浮き（頭と肩が水の上）、ゆっくり進み、スタミナが減る。
//   泳いでいる間は攻撃・防禦・回避・技能・隠れることはできない（game/combat.js）。浅い所は歩けるが遅く、深めの所では走れない（game/stance.js の canRun）
//   水の中を歩く・泳ぐと水音が立つ（bot に聞こえる。game/senses.js）。数は game/data.js の SWIM。水の形は world/landform.js
import { SWIM } from './data.js';
import { resetStance } from './stance.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 水の深さから、歩く速さの割合（膝ほどは少し遅く、腰ほどで SWIM.wade） */
export const wadeScale = (depth) => 1 - (1 - SWIM.wade) * smooth(0.15, 1.2, depth || 0);

/**
 * 戦う人の水の状態を決める（動いた後に毎回）：f.waterDepth（足もとの水の深さ）・f.waterSurface・f.swimming。
 * 泳いでいる間は、足の高さ f.y を水面から決める
 * @param {(x: number, z: number) => ({surface: number, depth: number} | null)} water world/terrain.js の waterAt
 */
export function applyWater(f, water) {
  const w = water ? water(f.x, f.z) : null;
  f.waterDepth = w ? w.depth : 0;
  f.waterSurface = w ? w.surface : null;
  f.swimming = f.waterDepth > SWIM.depth;
  if (f.waterDepth > 0.35 && f.stance && f.stance !== 'stand') resetStance(f);   // 水の中ではしゃがめない・伏せられない
  if (f.swimming) f.y = w.surface - SWIM.float;
  return f.swimming;
}

/** 泳ぐ速さ（m/s）：キャラの速さを掛け、スタミナが尽きたら遅い */
export const swimSpeed = (f) => SWIM.speed * (f.stats?.speed ?? 1) * (f.stamina > 0 ? 1 : SWIM.tired);
