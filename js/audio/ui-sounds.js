// 画面の音（試合の外）：題の画面で「入」を押したときの「時が動き出す音」（録音を使わず、その場で作る）
//   1. 時計のカチ・コチが、だんだん速くなる（左右に振り分ける。音も少しずつ高くなる）
//   2. 音が吸い上がるように高まる：上へ滑る和音（揺れがだんだん速くなる）、上へ抜ける風の音、逆さまに鳴る鐘
//   3. 大廳に切り替わる頃（PEAK 秒）に、鐘と光のような明るい響きが弾けて広がる（きらめき・下へ流れる風・大きな残響）
//   iPad の小さなスピーカーでも聞こえるよう、中〜高い音（500〜6000 Hz）を主にする。低い音は控えめに添えるだけ
//   鳴らす間は、題の曲をすぐ下げ、大廳の曲は弾けた後から上げる（main.js の「入」）
import { audio } from './engine.js';

/** 弾ける時刻（押してから。画面が大廳に切り替わる頃） */
export const TIME_START_PEAK = 0.85;

export function playTimeStart() {
  if (!audio.ctx) return;
  // 押した直後は、音の準備（resume）がまだ終わっていないことがある：終わってから鳴らす（黙って捨てない）
  if (!audio.ready) { audio.ctx.resume().then(() => { if (audio.ready) go(); }).catch(() => {}); return; }
  go();
}
function go() {
  const ctx = audio.ctx;
  const dry = ctx.createGain(); dry.gain.value = 0.85;
  dry.connect(audio.master);
  synthTimeStart(ctx, dry, audio.reverb, audio.white, ctx.currentTime + 0.02);
}

/**
 * 「時が動き出す音」を組み立てる（ゲームでも、確かめるための書き出し（OfflineAudioContext）でも使う）
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} dest 乾いた音の出口
 * @param {AudioNode|null} reverb 残響の入口（無ければ残響なし）
 * @param {AudioBuffer|null} noise 白い雑音（無ければ作る）
 * @param {number} t0 鳴らし始める時刻（ctx の時計で）
 */
export function synthTimeStart(ctx, dest, reverb, noise, t0) {
  const P = TIME_START_PEAK;
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  let send = null;
  if (reverb) { send = ctx.createGain(); send.gain.value = 0.9; send.connect(reverb); }
  /** 出口（左右の振り分けと、残響へ送る量） */
  const bus = (pan = 0, wet = 0) => {
    const g = ctx.createGain();
    let n = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); n = p; }
    n.connect(dest);
    if (send && wet > 0) { const w = ctx.createGain(); w.gain.value = wet; n.connect(w); w.connect(send); }
    return g;
  };
  /** 音量の山：at から attack 秒で peak へ、そこから dur 秒で消える（指数） */
  const env = (param, at, attack, peak, dur) => {
    param.setValueAtTime(0.0001, at);
    param.exponentialRampToValueAtTime(peak, at + attack);
    param.exponentialRampToValueAtTime(0.0001, at + attack + dur);
  };
  const noiseSrc = (at, len, offset = 0) => {
    const s = ctx.createBufferSource();
    s.buffer = noise; s.loop = true;
    s.start(at, offset % noise.duration); s.stop(at + len);
    return s;
  };

  // ---- 1. 時計のカチ・コチ（間がだんだん詰まる） ----
  let tt = 0, iv = 0.16, k = 0;
  while (tt < P - 0.04) {
    const u = tt / P, at = t0 + tt, hi = k % 2 === 0;   // カチ（高い）とコチ（少し低い）を交互に
    const o = bus(hi ? -0.4 : 0.4, 0.15);
    // 雑音の短い粒（打つ音）
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = (hi ? 3400 : 2600) * (1 + u * 0.5); f.Q.value = 3;
    const g = ctx.createGain();
    env(g.gain, at, 0.001, 0.5 + 0.7 * u, 0.035);
    noiseSrc(at, 0.06, k * 0.13).connect(f); f.connect(g); g.connect(o);
    // 小さな金属の響き（時計のばね）
    for (const [fr, a] of [[hi ? 2200 : 1700, 0.14], [hi ? 3310 : 2560, 0.08]]) {
      const os = ctx.createOscillator(); os.type = 'sine'; os.frequency.value = fr * (1 + u * 0.6);
      const og = ctx.createGain(); env(og.gain, at, 0.002, a * (0.6 + u), 0.07);
      os.connect(og); og.connect(o); os.start(at); os.stop(at + 0.12);
    }
    tt += iv; iv *= 0.82; k++;
  }

  // ---- 2. 吸い上がる音 ----
  // 上へ滑る和音（イ短調の 4 つの音が 2.5 倍の高さへ）。揺れ（トレモロ）が 5 回/秒から 26 回/秒へ速くなる
  {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(700, t0); lp.frequency.exponentialRampToValueAtTime(7500, t0 + P);
    const trem = ctx.createGain(); trem.gain.value = 0.55;
    const lfo = ctx.createOscillator(); lfo.frequency.setValueAtTime(5, t0); lfo.frequency.exponentialRampToValueAtTime(26, t0 + P);
    const depth = ctx.createGain(); depth.gain.value = 0.45; lfo.connect(depth); depth.connect(trem.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.2, t0 + P - 0.02); g.gain.linearRampToValueAtTime(0.0001, t0 + P + 0.04);
    lp.connect(trem); trem.connect(g); g.connect(bus(0, 0.3));
    [220, 261.6, 329.6, 440].forEach((fr, i) => {
      for (const det of [-8, 8]) {
        const os = ctx.createOscillator(); os.type = i % 2 ? 'sawtooth' : 'triangle'; os.detune.value = det;
        os.frequency.setValueAtTime(fr, t0); os.frequency.exponentialRampToValueAtTime(fr * 2.5, t0 + P);
        const og = ctx.createGain(); og.gain.value = i % 2 ? 0.12 : 0.22;
        os.connect(og); og.connect(lp); os.start(t0); os.stop(t0 + P + 0.06);
      }
    });
    lfo.start(t0); lfo.stop(t0 + P + 0.06);
  }
  // 上へ抜ける風（雑音の帯が 400 Hz から 6000 Hz へ。左右で少し違う）
  for (const [pan, off] of [[-0.5, 0.3], [0.5, 0.9]]) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(400, t0); bp.frequency.exponentialRampToValueAtTime(6000, t0 + P);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + P - 0.01); g.gain.linearRampToValueAtTime(0.0001, t0 + P + 0.05);
    noiseSrc(t0, P + 0.1, off).connect(bp); bp.connect(g); g.connect(bus(pan, 0.4));
  }
  // 逆さまに鳴る鐘（だんだん大きくなって、弾ける瞬間に切れる。吸い込まれる感じ）
  [[523.3, 0.1], [1046.5, 0.06], [1444, 0.045], [1570, 0.035], [2130, 0.025]].forEach(([fr, a]) => {
    const os = ctx.createOscillator(); os.frequency.value = fr;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0 + 0.1); og.gain.exponentialRampToValueAtTime(a, t0 + P - 0.01); og.gain.linearRampToValueAtTime(0.0001, t0 + P + 0.02);
    os.connect(og); og.connect(bus(0, 0.6)); os.start(t0 + 0.1); os.stop(t0 + P + 0.05);
  });

  // ---- 3. 弾ける（PEAK 秒）：鐘の和音・きらめき・下へ流れる風・空気の抜け・低い支え ----
  const T = t0 + P;
  // 鐘（ホ・ロ・高いホ）：鐘らしい揃わない倍音。高い倍音ほど早く消える。少しずらした 2 つでうなりを付ける
  [[659.3, 0.2, -0.2], [987.8, 0.14, 0.25], [1318.5, 0.08, 0]].forEach(([base, a, pan]) => {
    const o = bus(pan, 0.8);
    [[1, 1, 2.8], [2.0, 0.55, 1.9], [2.4, 0.45, 1.5], [3.0, 0.35, 1.1], [4.5, 0.22, 0.8], [5.9, 0.14, 0.55]].forEach(([r, amp, dur]) => {
      for (const beat of [0, 0.7]) {
        const os = ctx.createOscillator(); os.frequency.value = base * r + beat;
        const og = ctx.createGain(); env(og.gain, T, 0.004, a * amp * 0.6, dur);
        os.connect(og); og.connect(o); os.start(T); os.stop(T + dur + 0.1);
      }
    });
  });
  // きらめき（高い短い音が、ばらばらの時刻・高さ・左右に散る）
  for (let i = 0; i < 18; i++) {
    const at = T + 0.02 + Math.pow(Math.random(), 1.6) * 1.1;
    const os = ctx.createOscillator(); os.frequency.value = 2400 + Math.random() * 4600;
    const og = ctx.createGain(); env(og.gain, at, 0.003, 0.05 + Math.random() * 0.05, 0.08 + Math.random() * 0.2);
    os.connect(og); og.connect(bus(Math.random() * 1.6 - 0.8, 0.7)); os.start(at); os.stop(at + 0.4);
  }
  // 下へ流れる風（7000 Hz から 700 Hz へ）
  {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(7000, T); bp.frequency.exponentialRampToValueAtTime(700, T + 1.0);
    const g = ctx.createGain(); env(g.gain, T, 0.01, 0.4, 1.0);
    noiseSrc(T, 1.2, 0.5).connect(bp); bp.connect(g); g.connect(bus(0, 0.6));
  }
  // 空気の抜け（高い雑音の短い塊）
  {
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = ctx.createGain(); env(g.gain, T, 0.003, 0.35, 0.35);
    noiseSrc(T, 0.5, 1.3).connect(hp); hp.connect(g); g.connect(bus(0, 0.3));
  }
  // 低い支え（イヤホンで聞くと重みが出る。iPad のスピーカーでは控えめに鳴る高さから沈む）
  {
    const os = ctx.createOscillator(); os.frequency.setValueAtTime(130, T); os.frequency.exponentialRampToValueAtTime(48, T + 0.6);
    const og = ctx.createGain(); env(og.gain, T, 0.006, 0.4, 0.7);
    os.connect(og); og.connect(bus(0, 0.2)); os.start(T); os.stop(T + 0.9);
  }
}
