// 環境音：風・葉のざわめき・鳥のさえずり・夜の虫（コオロギ）・梟。
//   風：茶色の雑音をこもらせた低い音。突風で強くなる。大草原で強く、深い森で弱い
//   葉：白い雑音の高い所を、細かく揺らした「さわさわ」。森で強く、突風で増える（大草原は草のそよぎ）
//   鳥：5 羽が、自分の周りの木の上で、それぞれの鳴き方（ウグイスのような節・シジュウカラのような二音・さえずりの連打・
//       キジバトのような低い声・ヒバリのような長いさえずり）を、間をあけて繰り返す。朝が一番多く、夕暮れは少なく、夜は鳴かない
//   虫：夜（夕暮れから少し）、周りの 5 匹のコオロギが「リリリ」と鳴く
//   梟：夜の森で、ときどき遠くで「ホー、ホッホッホー」
//   家の中：外の音がこもって小さくなる
// 強さは時間帯の fx（world/time-of-day.js の birds・insects）、場所（エリア）、風（world/wind.js の突風）で決まる
import { audio, placeOf, outlet, toneHit, noiseHit } from './engine.js';

const R = Math.random;
const lerp = (a, b, t) => a + (b - a) * t;

export function createAmbience({ timeOfDay, wind, zones = null }) {
  let ctx = null, bus = null, busLP = null, windSrc = null, windLP = null, windGain = null, leafSrc = null, leafGain = null;
  const birds = [], crickets = [];
  let owlTimer = 20, flutter = 0, leafLevel = 0;

  /** 最初に音が出せるようになったとき、ずっと鳴る音（風・葉）を用意する */
  function init() {
    ctx = audio.ctx;
    // 環境音のまとめ：家の中ではこもらせる
    bus = ctx.createGain(); bus.gain.value = 0.9;
    busLP = ctx.createBiquadFilter(); busLP.type = 'lowpass'; busLP.frequency.value = 18000;
    bus.connect(busLP); busLP.connect(audio.out);
    // 風
    windSrc = ctx.createBufferSource(); windSrc.buffer = audio.brown; windSrc.loop = true;
    windLP = ctx.createBiquadFilter(); windLP.type = 'lowpass'; windLP.frequency.value = 400; windLP.Q.value = 0.7;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    windSrc.connect(windLP); windLP.connect(windGain); windGain.connect(bus);
    windSrc.start();
    // 葉のざわめき
    leafSrc = ctx.createBufferSource(); leafSrc.buffer = audio.white; leafSrc.loop = true; leafSrc.playbackRate.value = 0.9;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 4500; pk.gain.value = 6; pk.Q.value = 0.8;
    leafGain = ctx.createGain(); leafGain.gain.value = 0;
    leafSrc.connect(hp); hp.connect(pk); pk.connect(leafGain); leafGain.connect(bus);
    leafSrc.start();
  }

  // ===== 鳥 =====
  const SPECIES = ['warbler', 'tit', 'trill', 'dove', 'lark'];
  function placeBird(b) {
    const L = audio.listener;
    const a = R() * Math.PI * 2, r = 10 + R() * 45;
    b.x = L.x + Math.cos(a) * r; b.z = L.z + Math.sin(a) * r; b.y = L.y + 4 + R() * 9;
    const w = zones ? zones.weights(b.x, b.z) : { prairie: 0 };
    b.kind = w.prairie > 0.6 ? (R() < 0.6 ? 'lark' : 'trill') : SPECIES[Math.floor(R() * 4)];
    b.pitch = 0.85 + R() * 0.3;
    b.wait = 1 + R() * 6;
  }
  for (let i = 0; i < 5; i++) birds.push({});

  /** 1 回のさえずり（場所の音の出口 dest へ） */
  function sing(b, dest) {
    const m = b.pitch;
    if (b.kind === 'warbler') {
      let t = 0;
      const n = 5 + Math.floor(R() * 5);
      for (let i = 0; i < n; i++) {
        const f = (2600 + R() * 2200) * m, d = 0.05 + R() * 0.07;
        toneHit(dest, { t, f0: f, f1: f * (0.8 + R() * 0.45), dur: d, gain: 0.16, attack: 0.008 });
        t += d + 0.03 + R() * 0.04;
      }
      return t;
    }
    if (b.kind === 'tit') {
      let t = 0;
      for (let i = 0; i < 3 + Math.floor(R() * 2); i++) {
        toneHit(dest, { t, f0: 5200 * m, f1: 4500 * m, dur: 0.09, gain: 0.14, attack: 0.006 });
        toneHit(dest, { t: t + 0.12, f0: 3300 * m, f1: 3050 * m, dur: 0.11, gain: 0.13, attack: 0.008 });
        t += 0.36;
      }
      return t;
    }
    if (b.kind === 'trill') {
      let t = 0;
      const n = 12 + Math.floor(R() * 10), f = 3600 * m;
      for (let i = 0; i < n; i++) { toneHit(dest, { t, f0: f * (1 + i * 0.004), f1: f * 0.9, dur: 0.028, gain: 0.12, attack: 0.003 }); t += 0.045; }
      return t;
    }
    if (b.kind === 'dove') {
      // 低い「デーデー、ポッポー」
      const f = 560 * m, notes = [[0.32, 1], [0.45, 1.08], [0.3, 0.95], [0.5, 1]];
      let t = 0;
      for (const [d, k] of notes) { toneHit(dest, { t, f0: f * k, f1: f * k * 0.94, dur: d, gain: 0.1, attack: 0.05, type: 'sine' }); t += d + 0.12; }
      return t;
    }
    // lark：高くて速い、長いさえずり
    let t = 0;
    const n = 25 + Math.floor(R() * 20);
    for (let i = 0; i < n; i++) {
      const f = (2200 + R() * 4000) * m, d = 0.025 + R() * 0.05;
      toneHit(dest, { t, f0: f, f1: f * (0.85 + R() * 0.3), dur: d, gain: 0.1, attack: 0.004 });
      t += d + 0.015;
    }
    return t;
  }

  // ===== 虫（コオロギ）：1 匹ずつ音程の決まった音を、細かく区切って鳴らす =====
  function startCricket(c) {
    const L = audio.listener;
    const a = R() * Math.PI * 2, r = 5 + R() * 25;
    c.x = L.x + Math.cos(a) * r; c.z = L.z + Math.sin(a) * r;
    if (!c.osc) {
      c.osc = ctx.createOscillator(); c.osc.type = 'sine';
      c.osc.frequency.value = 4200 + R() * 700;
      c.gate = ctx.createGain(); c.gate.gain.value = 0;
      c.out = outlet({ gain: 0, pan: 0, cutoff: 12000, dest: bus });
      c.osc.connect(c.gate); c.gate.connect(c.out);
      c.osc.start();
      c.next = ctx.currentTime + R();
    }
  }
  /** 先の 1 秒ぶんの「リリリ」を、音量の予定として書き込む */
  function scheduleCricket(c) {
    const now = ctx.currentTime;
    if (c.next < now) c.next = now + 0.05;
    while (c.next < now + 1.2) {
      const pulses = 3 + Math.floor(R() * 2);
      let t = c.next;
      for (let i = 0; i < pulses; i++) {
        c.gate.gain.setValueAtTime(0, t);
        c.gate.gain.linearRampToValueAtTime(1, t + 0.004);
        c.gate.gain.setValueAtTime(1, t + 0.016);
        c.gate.gain.linearRampToValueAtTime(0, t + 0.02);
        t += 0.034;
      }
      c.next = t + 0.3 + R() * 0.5;
    }
  }

  // ===== 梟 =====
  function owl() {
    const L = audio.listener, a = R() * Math.PI * 2, r = 25 + R() * 25;
    const p = placeOf(L.x + Math.cos(a) * r, L.y + 8, L.z + Math.sin(a) * r, { ref: 10, max: 90 });
    const dest = outlet({ gain: Math.min(1, p.gain * 2), pan: p.pan, cutoff: p.cutoff, dest: bus });
    const f = 370 + R() * 40;
    let t = 0;
    for (const [d, g] of [[0.42, 0.22], [0.16, 0.16], [0.16, 0.16], [0.7, 0.2]]) {
      toneHit(dest, { t, f0: f * 1.03, f1: f * 0.97, dur: d, gain: g, attack: 0.05, curve: 'lin' });
      noiseHit(dest, { t, dur: d, type: 'bandpass', freq: f * 1.1, q: 3, gain: g * 0.25, attack: 0.05 });
      t += d + (t === 0 ? 0.35 : 0.08);
    }
  }

  return {
    update(dt) {
      if (!audio.ready) return;
      if (!ctx) init();
      const L = audio.listener, fx = timeOfDay.fx, now = ctx.currentTime;
      const w = zones ? zones.weights(L.x, L.z) : { mixed: 1, deep: 0, prairie: 0, castle: 0 };
      const indoor = L.indoor;
      const gust = wind?.gust ?? 0;
      // 家の中は外の音がこもる
      busLP.frequency.setTargetAtTime(lerp(18000, 900, indoor), now, 0.3);
      bus.gain.setTargetAtTime(lerp(0.9, 0.55, indoor), now, 0.3);

      // 風：大草原で強く、深い森で弱い。突風で強く高くなる
      const open = w.prairie * 1 + w.mixed * 0.65 + w.deep * 0.4 + w.castle * 0.7;
      windGain.gain.setTargetAtTime((0.15 + 0.3 * gust) * open, now, 0.4);
      windLP.frequency.setTargetAtTime(280 + 700 * gust + 150 * w.prairie, now, 0.4);

      // 葉：森で強い（大草原は草のそよぎ）。細かく揺らす
      flutter -= dt;
      if (flutter <= 0) {
        flutter = 0.07 + R() * 0.15;
        const trees = w.mixed * 0.8 + w.deep * 1 + w.prairie * 0.35 + w.castle * 0.25;
        leafLevel = trees * (0.02 + 0.07 * gust) * (0.5 + R() * 0.7);
        leafGain.gain.setTargetAtTime(leafLevel, now, 0.06);
      }

      // 鳥：時間帯と場所で鳴く回数が変わる
      const birdRate = (fx.birds ?? 0) * (w.mixed * 1 + w.deep * 0.7 + w.prairie * 0.8 + w.castle * 0.5);
      for (const b of birds) {
        if (b.x === undefined || Math.hypot(b.x - L.x, b.z - L.z) > 70) placeBird(b);
        b.wait -= dt * Math.max(0.05, birdRate);
        if (b.wait > 0 || birdRate < 0.02) continue;
        const p = placeOf(b.x, b.y, b.z, { ref: 8, max: 75 });
        if (p.gain > 0.01) sing(b, outlet({ gain: Math.min(1, p.gain * 2.2), pan: p.pan, cutoff: p.cutoff, dest: bus }));
        b.wait = 3 + R() * 9;
        if (R() < 0.15) placeBird(b);   // ときどき別の鳥に入れ替わる
      }

      // 虫：夜
      const insects = fx.insects ?? 0;
      if (insects > 0.02) {
        if (!crickets.length) for (let i = 0; i < 5; i++) crickets.push({});
        for (const c of crickets) {
          if (!c.osc || Math.hypot(c.x - L.x, c.z - L.z) > 40) startCricket(c);
          const p = placeOf(c.x, L.y, c.z, { ref: 4, max: 45 });
          c.out.gain.setTargetAtTime(p.gain * 0.16 * insects * (1 - 0.5 * w.castle), now, 0.2);
          scheduleCricket(c);
        }
      } else for (const c of crickets) if (c.out) c.out.gain.setTargetAtTime(0, now, 0.3);

      // 梟：夜の森で、ときどき
      if (insects > 0.6 && (fx.birds ?? 0) < 0.05) {
        owlTimer -= dt;
        if (owlTimer <= 0) { owlTimer = 18 + R() * 30; if (w.mixed + w.deep > 0.5) owl(); }
      }
    },
  };
}
