// 画面の音（試合の外）：題の画面で「入」を押したときの「ドォーン」（鈍く重い、これから始まる音）
//   録音を使わず、その場で作る：低い音が沈みながら長く残り、低い雑音の塊と、遠くの大きな銅鑼のような響きを重ねて、大きな残響に送る
import { audio, outlet, noiseHit, toneHit } from './engine.js';

export function playBoom() {
  if (!audio.ready) return;
  const d = outlet({ gain: 0.5, cutoff: 3200 });   // 低い音は大きく重ねると割れて歪む（中くらいの高さに濁りが出る）ので、全体は控えめに
  if (audio.reverb) { const send = audio.ctx.createGain(); send.gain.value = 0.55; d.connect(send); send.connect(audio.reverb); }
  // 地を揺らす低い音（沈みながら長く残る）。iPad の小さなスピーカーでも聞こえるよう、少し上の高さも重ねる
  toneHit(d, { dur: 3.4, f0: 56, f1: 30, gain: 1.0, attack: 0.012 });
  toneHit(d, { dur: 2.2, f0: 98, f1: 52, gain: 0.7, attack: 0.01 });
  toneHit(d, { dur: 0.9, f0: 160, f1: 80, gain: 0.4, attack: 0.006 });
  // 打ち付けた瞬間の、鈍い雑音の塊（低い所だけ）
  noiseHit(d, { dur: 0.7, type: 'lowpass', freq: 260, freqEnd: 60, q: 0.7, gain: 0.22, attack: 0.006 });
  noiseHit(d, { dur: 0.05, type: 'bandpass', freq: 700, q: 1.2, gain: 0.08, attack: 0.002 });
  // 遠くの大きな銅鑼（倍音が整っていない、低く長い響き）。控えめに
  for (const [k, a, dur] of [[1, 0.07, 4.5], [1.48, 0.04, 3.6], [2.13, 0.025, 3.0], [2.97, 0.015, 2.4]]) {
    toneHit(d, { t: 0.02, dur, f0: 66 * k, f1: 64 * k, gain: a, attack: 0.03 });
  }
}
