// 効果音（その場で作る音）：
//   足音：地面の種類で変わる（草・落ち葉・土の道・板の床・石畳）。重い鎧は金具がかちゃっと鳴る。ほかの人の足音も、近ければ聞こえる
//   戦闘：振る音・当たる音（鎧に当たる鈍い音）・盾で受ける音・防御が崩れる音・弓を引く・放つ・矢が刺さる・回避・倒れる
//   拾う（木・石・鉄・布で違う音）・箱を開ける・クラフト（金槌と金床）
//   隠れる・出る（タンスの扉のきしみ・ベッドの布ずれ）・探す・見つかった・致命の一撃・暗殺・暗殺の失敗
//   フェーズの始まり：遠くの鐘
// ほかの人の音は、位置で左右・大きさ・こもりが変わる（audio/engine.js の placeOf）
import { audio, placeOf, outlet, noiseHit, toneHit, metal } from './engine.js';

const R = Math.random;

/**
 * @param {{ terrain: object, zones: object, insideHouse: Function }} world
 */
export function createSfx({ terrain, zones = null, insideHouse = null, villageCenter = null }) {
  /** 音の出口：自分の音は真ん中、ほかの人の音は位置から。聞こえないほど遠ければ null */
  function at(f, gain = 1, opts = {}) {
    if (!audio.ready) return null;
    if (!f || f.isPlayer) return outlet({ gain });
    const p = placeOf(f.x, (f.y ?? 0) + 1, f.z, opts);
    if (p.gain < 0.02) return null;
    return outlet({ gain: gain * p.gain, pan: p.pan, cutoff: p.cutoff });
  }

  /** 地面の種類：家の床（地面より高い）・石畳（村の広場）・土の道・落ち葉（深い森）・草 */
  function surfaceAt(f) {
    const g = terrain.heightAt(f.x, f.z);
    if ((f.y ?? g) > g + 0.25) return 'wood';
    if (!zones) return 'grass';
    if (villageCenter && Math.hypot(f.x - villageCenter.x, f.z - villageCenter.z) < 6.5) return 'stone';
    if (zones.path(f.x, f.z) > 0.5) return 'dirt';
    const w = zones.weights(f.x, f.z);
    if (w.castle > 0.6) return 'dirt';
    if (w.deep > 0.5) return 'leaves';
    return 'grass';
  }

  let steps = 0;   // 確認用：鳴らした足音の数
  /** 足音 1 歩 */
  function step(f, run) {
    steps++;
    const d = at(f, (run ? 1 : 0.8) * 1.9, { ref: 2, max: 30 });   // 足音は環境音より 6〜8dB ほど大きく
    if (!d) return;
    const s = surfaceAt(f), k = 0.8 + R() * 0.4;
    if (s === 'grass') {
      noiseHit(d, { dur: 0.1, type: 'bandpass', freq: 2200 * k, q: 0.8, gain: 0.39 });
      noiseHit(d, { dur: 0.06, type: 'lowpass', freq: 280, gain: 0.3, buf: audio.brown });
    } else if (s === 'leaves') {
      for (let i = 0; i < 3; i++) noiseHit(d, { t: i * 0.018, dur: 0.035, type: 'bandpass', freq: (3000 + R() * 1800) * k, q: 1.2, gain: 0.3 });
      noiseHit(d, { dur: 0.06, type: 'lowpass', freq: 300, gain: 0.26, buf: audio.brown });
    } else if (s === 'dirt') {
      noiseHit(d, { dur: 0.08, type: 'lowpass', freq: 1300 * k, gain: 0.42 });
      noiseHit(d, { dur: 0.05, type: 'lowpass', freq: 260, gain: 0.3, buf: audio.brown });
    } else if (s === 'wood') {
      toneHit(d, { dur: 0.1, f0: 150 * k, f1: 85, type: 'triangle', gain: 0.54 });
      noiseHit(d, { dur: 0.05, type: 'bandpass', freq: 750 * k, q: 2, gain: 0.3 });
    } else {
      noiseHit(d, { dur: 0.035, type: 'bandpass', freq: 2600 * k, q: 1.5, gain: 0.39 });
      toneHit(d, { dur: 0.05, f0: 240 * k, f1: 160, type: 'triangle', gain: 0.18 });
    }
    // 重い鎧：金具が鳴る
    if (f.weight === 'heavy' && R() < 0.6) metal(d, { t: 0.01, base: 3000 + R() * 900, dur: 0.14, gain: 0.075 });
    else if (f.weight === 'medium' && R() < 0.3) metal(d, { t: 0.01, base: 3600 + R() * 900, dur: 0.1, gain: 0.045 });
  }

  /** きしみ（木の扉・弓）：短い粗い音を、音程を揺らしながら並べる */
  function creak(d, { t = 0, dur = 0.4, f0 = 150, f1 = 240, gain = 0.06 }) {
    if (!d) return;
    const bp = audio.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 5;
    bp.connect(d);
    const n = Math.max(3, Math.round(dur / 0.035));
    for (let i = 0; i < n; i++) {
      const f = f0 + (f1 - f0) * (i / n) + (R() - 0.5) * 30;
      toneHit(bp, { t: t + i * (dur / n), dur: dur / n * 1.4, f0: f, type: 'sawtooth', gain, attack: 0.003 });
    }
  }
  const thud = (d, t = 0, gain = 0.3, f0 = 110) => { if (d) toneHit(d, { t, dur: 0.14, f0, f1: f0 * 0.5, gain }); };

  // 歩いた距離を数えて、一定の距離ごとに 1 歩
  const walked = new Map();
  const actions = new Map();

  const api = {
    surfaceAt,
    get steps() { return steps; },
    /** 毎フレーム：足音（全員）と、弓を引き始めた音 */
    update(dt, fighters) {
      if (!audio.ready) return;
      const L = audio.listener;
      for (const f of fighters) {
        if (!f.alive || f.hidden) { walked.delete(f); continue; }
        if (!f.isPlayer && Math.hypot(f.x - L.x, f.z - L.z) > 32) { walked.delete(f); continue; }
        // 弓を引き始めた（止まっていても鳴らす）
        const a = f.action;
        if (a && a !== actions.get(f) && a.kind === 'draw') creak(at(f, 0.8), { dur: 0.45, f0: 90, f1: 130, gain: 0.035 });
        actions.set(f, a);
        const w = walked.get(f);
        if (!w) { walked.set(f, { x: f.x, z: f.z, d: 0 }); continue; }
        const moved = Math.hypot(f.x - w.x, f.z - w.z);
        w.x = f.x; w.z = f.z;
        if (moved > 3) { w.d = 0; continue; }   // 一瞬で移った（出現・隠れ場所から出た）
        const speed = moved / Math.max(dt, 1e-3);
        // 止まった：0.25 秒以上動かなければ、歩いた距離を数え直す（1 フレームだけ動かなかったときは続ける）
        if (speed < 0.4 || f.action?.kind === 'dodge') { w.still = (w.still || 0) + dt; if (w.still > 0.25) w.d = Math.min(w.d, 0.4); continue; }
        w.still = 0;
        w.speed = speed;
        w.d += moved;
        const stride = speed > 4.2 ? 0.95 : 0.72;
        if (w.d >= stride) { w.d -= stride; step(f, speed > 4.2); }
      }
    },
    swing(f, heavy) {
      const d = at(f, 1);
      if (!d) return;
      noiseHit(d, { t: heavy ? 0.12 : 0.05, dur: heavy ? 0.3 : 0.18, type: 'bandpass', freq: heavy ? 300 : 500, freqEnd: heavy ? 1300 : 2400, q: 1.2, gain: heavy ? 0.5 : 0.4 });
    },
    hit(target, guarded, kind) {
      const d = at(target, 1);
      if (!d) return;
      if (guarded) {   // 盾で受けた
        thud(d, 0, 0.22, 180);
        metal(d, { base: 880 + R() * 120, dur: 0.55, gain: 0.13 });
        return;
      }
      if (kind === 'arrow') {
        noiseHit(d, { dur: 0.06, type: 'lowpass', freq: 900, gain: 0.25 });
        thud(d, 0, 0.2, 160);
        return;
      }
      thud(d, 0, 0.34, 110);
      noiseHit(d, { dur: 0.09, type: 'lowpass', freq: 1700, gain: 0.24 });
      metal(d, { t: 0.005, base: 640 + R() * 160, dur: 0.28, gain: 0.07 });   // 鎧に当たる
    },
    guardBreak(f) {
      const d = at(f, 1);
      if (!d) return;
      metal(d, { base: 520, dur: 0.9, gain: 0.2 });
      noiseHit(d, { dur: 0.15, type: 'bandpass', freq: 1800, q: 0.7, gain: 0.2 });
    },
    bowRelease(f) {
      const d = at(f, 1);
      if (!d) return;
      toneHit(d, { dur: 0.28, f0: 215, f1: 190, type: 'triangle', gain: 0.18 });
      noiseHit(d, { dur: 0.16, type: 'highpass', freq: 2800, gain: 0.08 });
    },
    arrowStuck(p) {
      const d = at({ x: p.x, y: p.y - 1, z: p.z }, 1, { ref: 3, max: 40 });
      if (!d) return;
      toneHit(d, { dur: 0.06, f0: 320, f1: 140, type: 'triangle', gain: 0.18 });
      noiseHit(d, { dur: 0.03, type: 'bandpass', freq: 1500, gain: 0.12 });
    },
    dodge(f) {
      const d = at(f, 1);
      if (!d) return;
      noiseHit(d, { dur: 0.32, type: 'bandpass', freq: 900, freqEnd: 1900, q: 0.7, gain: 0.25 });
      thud(d, f.weight === 'heavy' ? 0.2 : 0.35, f.weight === 'heavy' ? 0.28 : 0.18, 90);
      if (f.weight !== 'light') metal(d, { t: 0.05, base: 2600, dur: 0.2, gain: 0.04 });
    },
    death(f) {
      const d = at(f, 1);
      if (!d) return;
      thud(d, 0.15, 0.4, 80);
      noiseHit(d, { t: 0.15, dur: 0.35, type: 'lowpass', freq: 500, gain: 0.22, buf: audio.brown });
      metal(d, { t: 0.18, base: 600, dur: 0.6, gain: 0.1 });
    },
    switchWeapon(f) {
      const d = at(f, 0.8);
      if (!d) return;
      noiseHit(d, { dur: 0.2, type: 'bandpass', freq: 4200, freqEnd: 2600, q: 3, gain: 0.08 });
    },
    pickup(kind, isMe = true) {
      if (!isMe) return;
      const d = at(null, 1);
      if (!d) return;
      if (kind === 'wood') { toneHit(d, { dur: 0.07, f0: 420, type: 'triangle', gain: 0.16 }); toneHit(d, { t: 0.09, dur: 0.07, f0: 340, type: 'triangle', gain: 0.14 }); }
      else if (kind === 'stone') { for (let i = 0; i < 3; i++) noiseHit(d, { t: i * 0.06, dur: 0.04, type: 'bandpass', freq: 2400 + R() * 800, q: 2, gain: 0.12 }); }
      else if (kind === 'iron') { metal(d, { base: 1700, dur: 0.35, gain: 0.08 }); metal(d, { t: 0.1, base: 2300, dur: 0.3, gain: 0.06 }); }
      else if (kind === 'cloth') noiseHit(d, { dur: 0.25, type: 'bandpass', freq: 1200, q: 0.8, gain: 0.25 });
      else {   // 箱を開ける：蓋のきしみと、置く音
        creak(d, { dur: 0.45, f0: 140, f1: 230, gain: 0.05 });
        thud(d, 0.5, 0.25, 140);
      }
    },
    craft() {
      const d = at(null, 1);
      if (!d) return;
      for (const t of [0, 0.28]) metal(d, { t, base: 1150 + R() * 60, ratios: [1, 2.76, 5.4, 8.9], dur: 0.9, gain: 0.16 });
    },
    hide(f, kind) {
      const d = at(f, f.isPlayer ? 0.9 : 0.6, { ref: 2, max: 18 });
      if (!d) return;
      if (kind === 'wardrobe') { creak(d, { dur: 0.35, f0: 170, f1: 260, gain: 0.05 }); thud(d, 0.42, 0.16, 160); }
      else noiseHit(d, { dur: 0.5, type: 'bandpass', freq: 1000, q: 0.6, gain: 0.22 });
    },
    search(f, kind) {
      const d = at(f, 1, { ref: 2, max: 25 });
      if (!d) return;
      if (kind === 'wardrobe') creak(d, { dur: 0.55, f0: 260, f1: 160, gain: 0.06 });
      else noiseHit(d, { dur: 0.4, type: 'bandpass', freq: 900, q: 0.6, gain: 0.28 });
    },
    /** 見つかった・見つけた：低い太鼓と、不安な和音 */
    found() {
      const d = at(null, 1);
      if (!d) return;
      thud(d, 0, 0.45, 70);
      for (const f of [233, 247]) toneHit(d, { dur: 0.9, f0: f, f1: f * 0.96, type: 'sawtooth', gain: 0.025, attack: 0.02 });
    },
    lethal(target) {
      const d = at(target, 1);
      if (!d) return;
      noiseHit(d, { dur: 0.09, type: 'highpass', freq: 2500, gain: 0.25 });
      thud(d, 0.03, 0.45, 95);
      toneHit(d, { t: 0.02, dur: 0.6, f0: 60, f1: 40, gain: 0.3 });
    },
    assassinate(f) {
      const d = at(f, 1);
      if (!d) return;
      noiseHit(d, { dur: 0.25, type: 'bandpass', freq: 600, freqEnd: 2600, q: 1, gain: 0.2 });
    },
    assassinFail(f) {
      const d = at(f, 1);
      if (!d) return;
      noiseHit(d, { dur: 0.3, type: 'bandpass', freq: 3000, freqEnd: 1200, q: 3, gain: 0.1 });
    },
    /** 遠くの鐘（フェーズの始まり） */
    bell(times = 3) {
      if (!audio.ready) return;
      const d = outlet({ gain: 0.7, cutoff: 3200 });
      for (let i = 0; i < times; i++) metal(d, { t: i * 1.5, base: 220, ratios: [0.5, 1, 1.19, 1.5, 2, 2.52, 3.01], dur: 4.5, gain: 0.22 });
    },
  };
  return api;
}

/** 試合の出来事に、効果音をつなぐ */
export function wireSounds(sfx, { combat, match, hiding, pickups, me }) {
  combat.on('swing', ({ fighter, heavy }) => sfx.swing(fighter, heavy));
  combat.on('hit', ({ target, guarded, kind }) => { if (kind === 'melee' || kind === 'arrow') sfx.hit(target, guarded, kind); });
  combat.on('guardBreak', ({ fighter }) => sfx.guardBreak(fighter));
  combat.on('fire', ({ fighter }) => sfx.bowRelease(fighter));
  combat.on('projectileStuck', ({ projectile }) => sfx.arrowStuck(projectile));
  combat.on('dodge', ({ fighter }) => sfx.dodge(fighter));
  combat.on('switch', ({ fighter }) => sfx.switchWeapon(fighter));
  combat.on('searchStart', ({ fighter, spot }) => sfx.search(fighter, spot.kind));
  combat.on('lethal', ({ target }) => sfx.lethal(target));
  combat.on('assassinate', ({ attacker }) => sfx.assassinate(attacker));
  combat.on('assassinFail', ({ attacker }) => sfx.assassinFail(attacker));
  match.on('eliminated', ({ victim }) => sfx.death(victim));
  match.on('phaseStart', () => sfx.bell(3));
  hiding.on('hide', ({ fighter, spot }) => sfx.hide(fighter, spot.kind));
  hiding.on('exit', ({ fighter, spot }) => sfx.hide(fighter, spot.kind));
  hiding.on('found', ({ searcher, victim }) => { if (searcher === me || victim === me) sfx.found(); });
  pickups.on('taken', ({ fighter, item }) => sfx.pickup(item.kind, fighter === me));
}
