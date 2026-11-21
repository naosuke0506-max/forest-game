// 題の画面の「歷代」の演出（利用者の指示 2026-11-20）：題の曲（歷代）の時刻から、今どうなっているかを決める。計算だけ。
//   画面に触れる → 時の輪の刻みがだんだん速くなり、歯車も速く回る → 合図（鐘と歯車の音・光）で原始の背景 → 原始の曲 →
//   時の輪に戻り、また速くなって合図 → 中世 … → 未来 → 時の輪に戻って刻みだけ → 頭へ（繰り返す）
//   時刻表は audio/title-timeline.js（曲を組み立てた道具が書き出した物）。針は「歩」ごとに 45° 進み、合図で真上に着く
import { TITLE_TIMELINE } from '../audio/title-timeline.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 並んだ数のうち、t 以下の数がいくつあるか */
function countLE(arr, t) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m + 1; else hi = m; }
  return lo;
}

export function createTitleShow(TL = TITLE_TIMELINE) {
  const eras = TL.sections.filter((s) => s.kind === 'era');
  const envAt = (t) => {
    const i = Math.max(0, Math.min(TL.env.length - 1, Math.floor(t * 10)));
    return (TL.env.charCodeAt(i) - 48) / 40;
  };
  return {
    duration: TL.duration,
    eras: eras.map((s) => s.era),
    /** t の後に来る時代（曲の終わりの後は、頭の原始） */
    nextEra(t) { return (eras.find((s) => s.t0 > t) || eras[0]).era; },
    /**
     * 曲の時刻 t（秒）での様子：
     *   hand：針の拍（render/title-scene.js の handAngle に渡す形。i 歩目の音で i × 45° の所に着き、合図で真上）・
     *   spin：歯車の速さの倍（刻みが速いほど大きい）・tick：直前の刻みからの光（0〜1）・bell：鐘の光（0〜1）・
     *   era・alpha（時代の背景の濃さ 0〜1）・et（その時代の始まりからの秒）・sec・bar・beat・env・flash（合図の光）
     */
    state(t) {
      const S = TL.steps;
      const n = countLE(S, t);
      const last = n ? S[n - 1] : -1;
      const gap = n > 0 && n < S.length ? S[n] - S[n - 1] : 0.5;
      const k = last >= 0 ? Math.min(1, (t - last) / Math.min(0.07, gap * 0.6)) : 1;
      const hand = n - 1 + k * 0.08;   // 拍の形に直す（title-scene の handAngle は、拍の頭の 0.08 拍で次の目盛りへ進む）
      // 歯車の速さ：刻みの間が短いほど速い（0.5 秒＝ふつう、0.03 秒で 30 倍ほど）
      const rate = gap < 0.6 ? 1 / gap : 2;
      const spin = Math.max(1, (rate / 2) ** 1.25);
      const tick = last >= 0 && t - last < 1 ? Math.exp(-(t - last) * 9) : 0;
      const nb = countLE(TL.bells, t), lb = nb ? TL.bells[nb - 1] : -9;
      const bell = t - lb < 2 ? Math.exp(-(t - lb) * 1.6) : 0;
      const nm = countLE(TL.booms, t), lm = nm ? TL.booms[nm - 1] : -9;
      const flash = t - lm < 1.5 && t >= lm ? Math.exp(-(t - lm) * 4.5) * 0.85 : 0;
      // 時代の背景：合図で一気に出し、終わりの 0.6 秒で時の輪へ戻す
      let era = null, alpha = 0, et = 0, sec = null, bar = -1, beat = -1;
      for (const s of eras) {
        if (t >= s.t0 - 0.02 && t < s.t1) {
          sec = s; era = s.era; et = t - s.t0;
          alpha = smooth(s.t0 - 0.02, s.t0 + 0.25, t) * (1 - smooth(s.t1 - 0.6, s.t1, t));
          const b = countLE(s.bars, t) - 1;
          if (b >= 0) {
            bar = b;
            const b0 = s.bars[b], b1 = s.bars[b + 1] ?? b0 + (s.bars[1] - s.bars[0] || 2);
            beat = b * 4 + Math.min(3, Math.floor(((t - b0) / (b1 - b0)) * 4));
          }
          break;
        }
      }
      return { t, hand, spin, tick, bell, flash, era, alpha, et, sec, bar, beat, env: envAt(t) };
    },
  };
}
