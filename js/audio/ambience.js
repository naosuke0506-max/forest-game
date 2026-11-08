// 環境音：風・葉のざわめき（その場で作る）と、録音の鳥・虫・カラス（assets/sounds/。CC0）。
//   風：茶色の雑音をこもらせた低い音。突風で強くなる。大草原で強く、深い森で弱い
//   葉：白い雑音の高い所を、細かく揺らした「さわさわ」。森で強く、突風で増える（大草原は草のそよぎ）
//   鳥のさえずり：朝だけ。森の鳥たちの録音をずっと流し、ときどき近くで 1 羽がさえずる
//   虫（コオロギ）：夜だけ。録音を左右 2 か所から少しずらして流し、はっきり聞こえるように
//   カラス：昼・夕暮れ・夜。ときどき遠くの木の上で鳴く（1 羽のときも、何羽かで鳴き交わすときも）
//   家の中：外の音がこもって小さくなる
// 強さは時間帯の fx（world/time-of-day.js の birds・insects・crows）、場所（エリア）、風（world/wind.js の突風）で決まる
import { audio, placeOf, outlet, playSample } from './engine.js';

const R = Math.random;
const lerp = (a, b, t) => a + (b - a) * t;

export function createAmbience({ timeOfDay, wind, zones = null }) {
  let ctx = null, bus = null, busLP = null, windLP = null, windGain = null, leafGain = null;
  let flutter = 0, birdLoop = null, crickets = [], crowTimer = 8, chirpTimer = 5;

  /** 最初に音が出せるようになったとき、ずっと鳴る音（風・葉）を用意する */
  function init() {
    ctx = audio.ctx;
    // 環境音のまとめ：家の中ではこもらせる
    bus = ctx.createGain(); bus.gain.value = 0.9;
    busLP = ctx.createBiquadFilter(); busLP.type = 'lowpass'; busLP.frequency.value = 18000;
    bus.connect(busLP); busLP.connect(audio.out);
    // 風
    const windSrc = ctx.createBufferSource(); windSrc.buffer = audio.brown; windSrc.loop = true;
    windLP = ctx.createBiquadFilter(); windLP.type = 'lowpass'; windLP.frequency.value = 400; windLP.Q.value = 0.7;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    windSrc.connect(windLP); windLP.connect(windGain); windGain.connect(bus);
    windSrc.start();
    // 葉のざわめき
    const leafSrc = ctx.createBufferSource(); leafSrc.buffer = audio.white; leafSrc.loop = true; leafSrc.playbackRate.value = 0.9;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 4500; pk.gain.value = 6; pk.Q.value = 0.8;
    leafGain = ctx.createGain(); leafGain.gain.value = 0;
    leafSrc.connect(hp); hp.connect(pk); pk.connect(leafGain); leafGain.connect(bus);
    leafSrc.start();
  }

  /** 繰り返す録音を、音量 0 で流し始める（読めていなければ null） */
  const loopOf = (name, pan = 0, rate = 1) => {
    const out = outlet({ gain: 0, pan, dest: bus });
    const s = playSample(out, name, { loop: true, rate, offset: R() * 20 });
    return s ? { s, out } : null;
  };

  /** 遠くの木の上のカラス */
  function crow() {
    const L = audio.listener, a = R() * Math.PI * 2, r = 25 + R() * 35;
    const p = placeOf(L.x + Math.cos(a) * r, L.y + 12, L.z + Math.sin(a) * r, { ref: 12, max: 90 });
    const d = outlet({ gain: Math.min(1, p.gain * 1.6), pan: p.pan, cutoff: p.cutoff, dest: bus });
    if (R() < 0.35) playSample(d, R() < 0.5 ? 'crow_2' : 'crow_3', { rate: 0.95 + R() * 0.1, gain: 0.8 });
    else {
      // 1 羽が 2〜3 回鳴く
      const n = 2 + Math.floor(R() * 2), name = R() < 0.5 ? 'crow_0' : 'crow_1', rate = 0.9 + R() * 0.2;
      for (let i = 0; i < n; i++) playSample(d, name, { t: i * (0.55 + R() * 0.25), rate, gain: 0.9 });
    }
  }
  /** 近くの 1 羽のさえずり（朝） */
  function chirp() {
    const L = audio.listener, a = R() * Math.PI * 2, r = 8 + R() * 20;
    const p = placeOf(L.x + Math.cos(a) * r, L.y + 6, L.z + Math.sin(a) * r, { ref: 8, max: 50 });
    playSample(outlet({ gain: Math.min(1, p.gain * 1.4), pan: p.pan, cutoff: p.cutoff, dest: bus }), 'amb_chirp', { rate: 0.9 + R() * 0.25, gain: 0.8 });
  }

  let muted = false;   // 大廳にいる間は森の音を止める
  return {
    /** 森の音を止める・戻す（大廳） */
    setMuted(v) {
      if (v === muted) return;
      muted = v;
      if (bus) bus.gain.setTargetAtTime(v ? 0 : 0.9, ctx.currentTime, 0.2);
    },
    update(dt) {
      if (!audio.ready) return;
      if (!ctx) init();
      const L = audio.listener, fx = timeOfDay.fx, now = ctx.currentTime;
      const w = zones ? zones.weights(L.x, L.z) : { mixed: 1, deep: 0, prairie: 0, castle: 0 };
      const indoor = L.indoor;
      const gust = wind?.gust ?? 0;
      // 家の中は外の音がこもる
      busLP.frequency.setTargetAtTime(lerp(18000, 900, indoor), now, 0.3);
      bus.gain.setTargetAtTime(muted ? 0 : lerp(0.9, 0.55, indoor), now, 0.3);

      // 風：大草原で強く、深い森で弱い。突風で強く高くなる
      const open = w.prairie * 1 + w.mixed * 0.65 + w.deep * 0.4 + w.castle * 0.7;
      windGain.gain.setTargetAtTime((0.15 + 0.3 * gust) * open, now, 0.4);
      windLP.frequency.setTargetAtTime(280 + 700 * gust + 150 * w.prairie, now, 0.4);

      // 葉：森で強い（大草原は草のそよぎ）。細かく揺らす
      flutter -= dt;
      if (flutter <= 0) {
        flutter = 0.07 + R() * 0.15;
        const trees = w.mixed * 0.8 + w.deep * 1 + w.prairie * 0.35 + w.castle * 0.25;
        leafGain.gain.setTargetAtTime(trees * (0.02 + 0.07 * gust) * (0.5 + R() * 0.7), now, 0.06);
      }

      // 鳥のさえずり：朝だけ（森で多く、村と大草原は少し）
      const birds = (fx.birds ?? 0) * (w.mixed * 1 + w.deep * 0.8 + w.prairie * 0.45 + w.castle * 0.55);
      if (birds > 0.01 && !birdLoop) birdLoop = loopOf('amb_birds');
      if (birdLoop) birdLoop.out.gain.setTargetAtTime(birds * 0.9, now, 1.5);
      if (birds > 0.2 && (chirpTimer -= dt) <= 0) { chirpTimer = 4 + R() * 7; chirp(); }

      // 虫：夜だけ。左右から少しずらして流す（はっきり、広がって聞こえる）
      const insects = (fx.insects ?? 0) * (1 - 0.4 * w.castle);
      if (insects > 0.01 && !crickets.length) crickets = [loopOf('amb_crickets', -0.6, 1), loopOf('amb_crickets', 0.6, 0.97)].filter(Boolean);
      for (const c of crickets) c.out.gain.setTargetAtTime(insects * 1.1, now, 1.5);

      // カラス：昼・夕暮れ・夜に、ときどき
      const crows = fx.crows ?? 0;
      if (crows > 0.05 && (crowTimer -= dt * crows) <= 0) { crowTimer = 12 + R() * 22; crow(); }
    },
  };
}
