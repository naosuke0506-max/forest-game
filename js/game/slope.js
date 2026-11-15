// 坂の上り下り（計算だけ）：進む向きの地面の傾きで、歩く速さが変わる（利用者の指示 2026-11-14：坂の登り・下りが不自然）。
//   前は、どんな急な坂も平地と同じ速さで上り下りしていた（横に進む速さが同じなので、急な坂ほど実際には速く動いていた）。
//   上り：ゆるい坂（6 度まで）は平地と同じ。急になるほど遅く、55 度をこえる崖は上れない
//   下り：ゆるい坂は少し速い。急な下りは足もとを確かめながら下りるので遅い
// プレイヤー（player/controller.js）と bot（game/movement.js）が同じ式を使う。家の床・階段・橋の上では使わない（地面の上だけ）
import { SLOPE } from './data.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * 速さの倍率
 * @param {number} g 進む向きの勾配（高さ ÷ 水平の長さ。上りが正）
 */
export function slopeSpeed(g) {
  if (g >= 0) {
    const k = Math.max(SLOPE.upMin, Math.exp(-SLOPE.up * Math.max(0, g - SLOPE.free)));
    return k * (1 - smooth(SLOPE.wall[0], SLOPE.wall[1], g));
  }
  const d = -g;
  const easy = 1 + SLOPE.downBoost * smooth(SLOPE.free, 0.3, d);
  return easy + (SLOPE.downSteep - easy) * smooth(0.55, 1.1, d);
}

/**
 * 今いる所から (dx, dz) の向き（長さ 1）へ進むときの勾配。地面（heightAt）の上に立っているときだけ求める（床や橋の上は 0）
 * @param {(x: number, z: number) => number} heightAt 地面の高さ
 * @param {number} y 今の足の高さ
 */
export function slopeAhead(heightAt, x, z, y, dx, dz) {
  const h = heightAt(x, z);
  if (y != null && Math.abs(y - h) > 0.12) return 0;   // 家の床・階段・橋の上
  return (heightAt(x + dx * SLOPE.probe, z + dz * SLOPE.probe) - h) / SLOPE.probe;
}
