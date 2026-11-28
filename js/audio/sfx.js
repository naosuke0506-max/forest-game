// 効果音と声。録音の音（assets/sounds/。CC0）を鳴らし、足りない所はその場で作る。
//   足音：地面で変わる（草・落ち葉・土の道・板の床・石畳）。左右の足で録音を選び分け、少しずつ高さを揺らす。重い鎧は鎖帷子が鳴る
//   声：キャラごとの高さと声（倒れる声はキャラごとに違う録音）。
//     回避ステップでは息を止めるような声、スタミナが 4 割以下になってからの攻撃で声、攻撃を受けて痛がる声、倒れる声
//   息遣い：スタミナが減るほど荒くなる（深い息 → 荒い息）。隠れている間は 1.2 倍大きい。近くの人の息も聞こえる
//   振る：武器の重さで違う風の音（剣は鋭く、メイスは重く、槍は短い突き）。刃が通る時に鳴る
//   当たる：斬る・突く・打つで違い、当たった物で変わる（盾・金属の鎧・革や布の鎧・木・石）
//   回避：前転は体が転がる布ずれと地面に着く音（中装は鎖帷子も）。回避ステップは足のすり音と声
//   ぴったり回避（無敵の間に攻撃をかわした）：特別な音（画面の白い光は match-session.js）
//   倒れる：キャラごとの声と、体が倒れる音（鎧の重さで金属の音）
//   フェーズの始まり：時計台の鐘（チャイムの節と、時を打つ大きな鐘。残響付き）
import { audio, placeOf, outlet, noiseHit, toneHit, metal, playSample } from './engine.js';
import { attackStats } from '../game/combat.js';
import { breathLevel } from '../game/hiding.js';
import { MIRACLES } from '../game/data.js';

const R = Math.random;
const jitter = (k = 0.06) => 1 + (R() * 2 - 1) * k;

// キャラごとの声：高さ（1 より大きいと高い）と、倒れる声の録音
const VOICE = {
  shield:  { pitch: 1.0, death: 'v_death_0' },
  sword:   { pitch: 0.94, death: 'v_death_1' },
  polearm: { pitch: 0.88, death: 'v_death_3' },
  blunt:   { pitch: 0.84, death: 'v_death_4' },
  archer:  { pitch: 1.07, death: 'v_death_2' },
  cleric:  { pitch: 1.12, death: 'v_death_5' },
};
const voiceOf = (f) => VOICE[f?.char] || VOICE.shield;

// 武器の種類：斬る（剣・ダガー）・突く（槍・矢）・打つ（メイス）
const KIND = { armingsword: 'slash', longsword: 'slash', dagger: 'slash', spear: 'pierce', mace: 'blunt', warhammer: 'blunt', lucerne: 'blunt', longbow: 'pierce' };
// 振る音：録音の組・高さ・大きさ
const SWING = {
  armingsword: { set: 'swing_light', rate: 1.0, gain: 0.8 },
  longsword:   { set: 'swing_mid', rate: 0.92, gain: 0.95 },
  dagger:      { set: 'swing_light', rate: 1.2, gain: 0.6 },
  spear:       { set: 'swing_mid', rate: 1.15, gain: 0.7 },
  mace:        { set: 'swing_heavy', rate: 0.78, gain: 1.0 },
  warhammer:   { set: 'swing_heavy', rate: 0.7, gain: 1.05 },   // 鎚矛より重く、低い音
  lucerne:     { set: 'swing_heavy', rate: 0.84, gain: 0.95 },  // 長い柄が風を切る
};

/**
 * @param {{ terrain: object, zones: object, plazas: {x, z, r}[] }} world plazas：村の広場（石畳。world/villages.js）
 */
export function createSfx({ terrain, zones = null, plazas = [] }) {
  /** 音の出口：自分の音は真ん中、ほかの人の音は位置から。聞こえないほど遠ければ null */
  function at(f, gain = 1, opts = {}) {
    if (!audio.ready) return null;
    if (!f || f.isPlayer) return outlet({ gain });
    const p = placeOf(f.x, (f.y ?? 0) + 1, f.z, opts);
    if (p.gain < 0.02) return null;
    return outlet({ gain: gain * p.gain, pan: p.pan, cutoff: p.cutoff });
  }
  /** こもらせた出口（土の道の足音など） */
  function muffled(d, hz) {
    if (!d) return null;
    const f = audio.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = hz;
    f.connect(d);
    return f;
  }

  /** 地面の種類：家の床（地面より高い）・石畳（村の広場）・土の道・落ち葉（深い森）・草 */
  function surfaceAt(f) {
    const g = terrain.heightAt(f.x, f.z);
    if ((f.y ?? g) > g + 0.25) return 'wood';
    if (!zones) return 'grass';
    if (plazas.some((p) => (p.inside ? p.inside(f.x, f.z) : Math.hypot(f.x - p.x, f.z - p.z) < p.r))) return 'stone';   // 村の広場の石畳（橋の上は 'wood'）
    if (zones.paved?.(f.x, f.z)) return 'stone';   // アスファルト（硬い音。2026-11-22。前は土の道の音だった）
    if (zones.path(f.x, f.z) > 0.5) return 'dirt';
    const w = zones.weights(f.x, f.z);
    if (w.castle > 0.6) return 'dirt';
    if (w.deep > 0.5) return 'leaves';
    return 'grass';
  }

  let steps = 0;   // 確認用：鳴らした足音の数
  /** 足音 1 歩（録音。地面で選ぶ） */
  // 自分の足音の大きさ：自分の音は距離で小さくならず、いつも一番大きく鳴るので、うるさくないように下げる（利用者の指示）
  const OWN_STEP = 0.35;
  /** 川の中の 1 歩・泳ぎの 1 かき（作った音。利用者の指示 2026-11-14：川は泳げる）。深いほど低く大きい */
  function splash(f, run) {
    const own = f.isPlayer ? OWN_STEP * 1.6 : 1;
    if (f.swimming) {
      const d = at(f, 0.75 * own, { ref: 3, max: 34 });
      if (!d) return;
      noiseHit(d, { dur: 0.32, type: 'bandpass', freq: 900 * jitter(0.15), freqEnd: 420, q: 0.9, attack: 0.03, gain: 0.32 });
      noiseHit(d, { t: 0.05, dur: 0.18, type: 'highpass', freq: 2600, q: 0.5, gain: 0.12 });
      return;
    }
    const deep = Math.min(1, (f.waterDepth || 0) / 1.0);
    const d = at(f, (run ? 1 : 0.8) * own, { ref: 2, max: 30 });
    if (!d) return;
    noiseHit(d, { dur: 0.12 + deep * 0.14, type: 'bandpass', freq: (1900 - deep * 900) * jitter(0.12), freqEnd: 700, q: 0.8, gain: 0.3 + deep * 0.15 });
    toneHit(d, { dur: 0.08, f0: 260 - deep * 90, f1: 140, gain: 0.08 + deep * 0.06 });
  }
  function step(f, run) {
    steps++;
    if (f.swimming || f.waterDepth > 0.08) { splash(f, run); return; }   // 川の中は水音
    const own = f.isPlayer ? OWN_STEP : 1;
    // しゃがむと足音が小さく、伏せていれば体を引きずる布ずれ（bot にも聞こえにくい。game/senses.js）
    const st = f.stance || 'stand';
    if (st === 'prone') {
      const dp = at(f, 0.35 * own, { ref: 2, max: 14 });
      if (dp) playSample(dp, 'roll_cloth', { rate: 0.75 * jitter(0.08), gain: 0.5 });
      return;
    }
    const d = at(f, (run ? 1 : 0.8) * (st === 'crouch' ? 0.42 : 1) * own, { ref: 2, max: st === 'crouch' ? 16 : 30 });
    if (!d) return;
    const s = surfaceAt(f), r = jitter(0.07) * (run ? 1.04 : 1);
    if (s === 'grass') playSample(d, 'step_grass', { rate: r, gain: 0.7 });
    else if (s === 'leaves') playSample(d, 'step_sand', { rate: r * 1.05, gain: 0.55 });
    else if (s === 'dirt') playSample(muffled(d, 2600), 'step_sand', { rate: r * 0.88, gain: 0.7 });
    else if (s === 'wood') playSample(d, 'step_wood', { rate: r, gain: 0.9 });
    else playSample(d, 'step_stone', { rate: r, gain: 0.55 });
    // 鎧：重いほど鎖帷子が鳴る（毎歩ではなく、ときどき）
    if (f.weight === 'heavy' && R() < 0.55) playSample(d, R() < 0.5 ? 'armor_chain' : 'armor_plate', { rate: jitter(0.1), gain: 0.18 });
    else if (f.weight === 'medium' && R() < 0.3) playSample(d, 'armor_chain', { rate: jitter(0.1), gain: 0.1 });
  }

  /** 声（キャラごとの高さ） */
  function voice(f, set, gain = 1, opts = {}) {
    const d = at(f, gain, { ref: 3, max: 40 });
    if (!d) return;
    playSample(d, set, { rate: voiceOf(f).pitch * jitter(0.03), ...opts });
  }

  // ===== 息遣い：人ごとに 2 つの繰り返す音（深い息・荒い息）を、スタミナで混ぜる =====
  const breaths = new Map();
  function updateBreath(f, dt) {
    const L = audio.listener;
    const far = !f.isPlayer && Math.hypot(f.x - L.x, f.z - L.z) > 9;
    let b = breaths.get(f);
    if (!f.alive || far) { if (b) { b.deep?.stop(); b.pant?.stop(); breaths.delete(f); } return; }
    if (!b) {
      const out = f.isPlayer ? outlet({ gain: 1 }) : outlet({ gain: 0 });
      b = { out, level: 0, deep: playSample(out, 'breath_deep', { loop: true, gain: 0, rate: voiceOf(f).pitch, offset: R() * 10 }),
        pant: playSample(out, 'breath_pant', { loop: true, gain: 0, rate: voiceOf(f).pitch, offset: R() * 8 }) };
      if (!b.deep) return;   // 録音がまだ読めていない
      breaths.set(f, b);
    }
    // 息の荒さ：スタミナが 7 割を切ると聞こえ始め、減るほど荒く。上がるのは速く、収まるのはゆっくり
    const want = Math.max(0, breathLevel(f) - 0.25) / 0.75 * (f.hidden ? 1.2 : 1) + (f.hidden ? 0.25 : 0);
    b.level += (want - b.level) * Math.min(1, dt * (want > b.level ? 2.5 : 0.5));
    const s = f.stamina / (f.stats?.maxStamina || 100);
    const pant = Math.max(0, Math.min(1, (0.4 - s) / 0.3));
    const now = audio.ctx.currentTime;
    const base = f.isPlayer ? 0.45 : 0.6;
    b.deep.gainNode.gain.setTargetAtTime(base * b.level * (1 - pant), now, 0.2);
    b.pant.gainNode.gain.setTargetAtTime(base * b.level * pant, now, 0.2);
    if (!f.isPlayer) {
      const p = placeOf(f.x, (f.y ?? 0) + 1.5, f.z, { ref: 1.5, max: 9 });
      b.out.gain.setTargetAtTime(p.gain, now, 0.1);
    }
  }

  // 歩いた距離を数えて、一定の距離ごとに 1 歩
  const walked = new Map();
  const actions = new Map();

  /**
   * 鉄の鐘の 1 打（金属の音。利用者の指示で、穏やかな教会の鐘から替えた）：倍音は整っていない並び（鉄の板・鐘を強く打った「カーン」）で、
   * 高い倍音も強く長く残る。少しずれた音を重ねてうなりを付け、撞木が当たる「ガッ」という硬い音を強く入れる
   */
  function ironStrike(d, t, f, gain) {
    const parts = [[1.0, 1.0, 5.5], [2.76, 0.85, 3.6], [5.40, 0.7, 2.6], [8.93, 0.5, 1.8], [13.34, 0.32, 1.2], [18.64, 0.2, 0.8], [0.52, 0.35, 6.5]];
    for (const [k, a, dur] of parts) {
      toneHit(d, { t, f0: f * k, dur, gain: gain * a, attack: 0.001 });
      toneHit(d, { t, f0: f * k * 1.0032 + 0.7, dur: dur * 0.85, gain: gain * a * 0.5, attack: 0.001 });   // ずれた音（金属のうなり）
    }
    noiseHit(d, { t, dur: 0.07, type: 'highpass', freq: 2600, gain: gain * 1.1 });              // 撞木が当たる硬い音
    noiseHit(d, { t, dur: 0.18, type: 'bandpass', freq: f * 9, q: 6, gain: gain * 0.6 });       // 当たった直後の、きしむような響き
  }

  const api = {
    surfaceAt,
    get steps() { return steps; },
    /** 毎フレーム：足音・息遣い（全員）と、弓を引き始めた音 */
    update(dt, fighters) {
      if (!audio.ready) return;
      const L = audio.listener;
      for (const f of fighters) {
        updateBreath(f, dt);
        if (!f.alive || f.hidden) { walked.delete(f); continue; }
        if (!f.isPlayer && Math.hypot(f.x - L.x, f.z - L.z) > 32) { walked.delete(f); continue; }
        // 弓を引き始めた（止まっていても鳴らす）：弓のしなり
        const a = f.action;
        if (a && a !== actions.get(f) && a.kind === 'draw') playSample(at(f, 0.5), 'wood_creak', { rate: 0.75 * jitter(0.05), gain: 0.5 });
        actions.set(f, a);
        const w = walked.get(f);
        if (!w) { walked.set(f, { x: f.x, z: f.z, d: 0 }); continue; }
        const moved = Math.hypot(f.x - w.x, f.z - w.z);
        w.x = f.x; w.z = f.z;
        if (moved > 3) { w.d = 0; continue; }   // 一瞬で移った（出現・隠れ場所から出た）
        const speed = moved / Math.max(dt, 1e-3);
        // 止まった：0.25 秒以上動かなければ、歩いた距離を数え直す（1 フレームだけ動かなかったときは続ける）
        if (speed < (f.stance === 'prone' ? 0.2 : 0.4) || f.action?.kind === 'dodge') { w.still = (w.still || 0) + dt; if (w.still > 0.25) w.d = Math.min(w.d, 0.4); continue; }
        w.still = 0;
        w.d += moved;
        const stride = f.swimming ? 1.4 : f.stance === 'prone' ? 0.45 : f.stance === 'crouch' ? 0.55 : speed > 4.2 ? 0.95 : 0.72;   // 泳ぎは 1 かきが長い
        if (w.d >= stride) { w.d -= stride; step(f, speed > 4.2); }
      }
    },
    /** 振り始め：刃が通る時に風の音（技は当たる時刻ごとに。game/data.js の TECHNIQUES）。スタミナが 4 割以下なら声も */
    swing(f, heavy, tech = null) {
      const hits = tech ? tech.hits : [attackStats(f.weapon, heavy).windup];
      const sw = SWING[f.weapon] || SWING.armingsword;
      const d = at(f, 1);
      if (d) {
        hits.forEach((h, i) => {
          const big = tech ? [].concat(tech.power)[Math.min(i, [].concat(tech.power).length - 1)] === 'h' : heavy;
          playSample(d, big ? 'swing_heavy' : sw.set, { t: Math.max(0, h - 0.09), rate: sw.rate * (big ? 0.85 : 1) * jitter(0.05), gain: sw.gain * (big ? 1.15 : 1) });
        });
      }
      if (f.stamina / (f.stats?.maxStamina || 100) <= 0.4 && R() < 0.8) voice(f, 'v_attack', 0.75, { t: Math.max(0, hits[0] - 0.15) });
    },
    /** 攻撃が当たった：斬る・突く・打つ × 当たった物（盾・金属の鎧・革や布） */
    hit(attacker, target, guarded, kind) {
      const d = at(target, 1);
      if (!d) return;
      const how = kind === 'arrow' ? 'pierce' : KIND[attacker?.weapon] || 'slash';
      if (guarded) {   // 盾で受けた
        playSample(d, 'hit_shield', { rate: jitter(0.06) * (how === 'blunt' ? 0.85 : 1), gain: how === 'blunt' ? 1 : 0.85 });
        return;
      }
      const armored = target.weight !== 'light';   // 軽装は革と布、中装・重装は金属の鎧
      if (how === 'blunt') {
        playSample(d, 'hit_blunt', { rate: jitter(0.06), gain: 1 });
        if (armored) playSample(d, 'hit_metal', { rate: 0.7 * jitter(0.05), gain: 0.45 });
      } else if (armored) {
        playSample(d, 'hit_metal', { rate: (how === 'pierce' ? 1.15 : 1) * jitter(0.06), gain: 0.9 });
        playSample(d, 'hit_flesh', { rate: jitter(0.05), gain: 0.3 });
      } else {
        playSample(d, 'hit_flesh', { rate: (how === 'pierce' ? 1.1 : 1) * jitter(0.06), gain: 1 });
        playSample(d, 'pick_cloth', { rate: 1.3, gain: 0.35 });
      }
      if (R() < 0.5) voice(target, 'v_hurt', 0.8);   // 痛がる声
    },
    /** 刃が誰にも当たらず、木の幹や壁に当たった */
    strikeObstacle(f) {
      const d = at(f, 0.9);
      if (d) playSample(d, 'hit_wood', { rate: jitter(0.08), gain: 0.9 });
    },
    /** 楯の技を始めた：楯を振る革と布のすれ、ときどき力む声 */
    shieldSwing(f) {
      const d = at(f, 0.8);
      if (!d) return;
      playSample(d, 'pick_cloth', { rate: 0.8 * jitter(0.06), gain: 0.6 });
      if (R() < 0.5) voice(f, 'v_attack', 0.7, { t: 0.15 });
    },
    /** 楯の技が当たった：楯擊は楯で殴る鈍い音、楯押は楯が体にぶつかる重い音 */
    shieldHit(f, push) {
      const d = at(f, 1);
      if (!d) return;
      playSample(d, 'hit_shield', { rate: (push ? 0.7 : 0.9) * jitter(0.05), gain: 1 });
      playSample(d, push ? 'hit_wood' : 'hit_blunt', { t: 0.01, rate: 0.8 * jitter(0.05), gain: 0.7 });
    },
    guardBreak(f) {
      const d = at(f, 1);
      if (!d) return;
      playSample(d, 'hit_shield', { rate: 0.75, gain: 1 });
      playSample(d, 'hit_metal', { t: 0.04, rate: 0.6, gain: 0.6 });
      voice(f, 'v_hurt', 0.8, { t: 0.05 });
    },
    bowRelease(f) {
      const d = at(f, 1);
      if (!d) return;
      toneHit(d, { dur: 0.25, f0: 200, f1: 180, type: 'triangle', gain: 0.16 });   // 弦が鳴る
      playSample(d, 'swing_light', { rate: 1.6, gain: 0.45 });                    // 矢が空を切る
    },
    arrowStuck(p) {
      const d = at({ x: p.x, y: p.y - 1, z: p.z }, 1, { ref: 3, max: 40 });
      if (d) playSample(d, 'hit_wood', { rate: 1.35 * jitter(0.06), gain: 0.55 });
    },
    /** 回避：軽装・中装は前転（体が転がる）、重装は回避ステップ（声と足のすり音） */
    dodge(f) {
      const d = at(f, 1);
      if (!d) return;
      if (f.weight === 'heavy') {
        voice(f, 'v_effort', 0.85);
        playSample(d, 'step_sand', { rate: 0.8, gain: 0.7 });
        playSample(d, 'step_sand', { t: 0.32, rate: 0.75, gain: 0.8 });
        playSample(d, 'armor_plate', { t: 0.3, rate: jitter(0.06), gain: 0.35 });
      } else {
        playSample(d, 'roll_cloth', { rate: (f.weight === 'light' ? 1.15 : 1) * jitter(0.05), gain: 0.85 });
        playSample(d, 'body_fall', { t: 0.12, rate: 1.25, gain: 0.35 });   // 肩から地面に着く
        playSample(d, 'step_sand', { t: f.weight === 'light' ? 0.42 : 0.55, rate: 0.85, gain: 0.6 });   // 起き上がって足を着く
        if (f.weight === 'medium') playSample(d, 'armor_chain', { t: 0.15, rate: jitter(0.08), gain: 0.3 });
      }
    },
    /** ぴったり回避（無敵の間に攻撃をかわした）：鋭く空気を裂く音と、澄んだ響き */
    perfectDodge(f) {
      const d = at(f, 1);
      if (!d) return;
      playSample(d, 'swing_heavy', { rate: 0.55, gain: 0.9 });
      for (const [k, t] of [[1, 0.02], [1.5, 0.05], [2, 0.08]]) toneHit(d, { t, f0: 1320 * k, f1: 1320 * k * 1.02, dur: 0.6, gain: 0.05, attack: 0.004 });
      toneHit(d, { f0: 70, f1: 45, dur: 0.35, gain: 0.25 });
    },
    death(f) {
      const d = at(f, 1);
      if (!d) return;
      voice(f, voiceOf(f).death, 1);
      playSample(d, 'body_fall', { t: 0.35, rate: jitter(0.05), gain: 0.9 });
      if (f.weight !== 'light') playSample(d, 'armor_fall', { t: 0.4, rate: (f.weight === 'heavy' ? 0.9 : 1.05) * jitter(0.04), gain: f.weight === 'heavy' ? 0.8 : 0.5 });
    },
    switchWeapon(f) {
      const d = at(f, 0.8);
      if (d) playSample(d, 'pick_metal', { rate: jitter(0.08), gain: 0.6 });
    },
    hide(f, kind) {
      const d = at(f, f.isPlayer ? 0.9 : 0.6, { ref: 2, max: 18 });
      if (!d) return;
      if (kind === 'wardrobe') { playSample(d, 'wood_creak', { gain: 0.7 }); playSample(d, 'wood_close', { t: 0.35, gain: 0.6 }); }
      else { playSample(d, 'bed_rustle', { gain: 0.8 }); playSample(d, 'roll_cloth', { t: 0.1, rate: 1.2, gain: 0.4 }); }
    },
    /** 家の扉を開ける・閉める（world/doors.js）：きしむ音。閉めるときは、閉まる音も */
    door(f, open) {
      const d = at(f, 0.9, { ref: 2, max: 28 });
      if (!d) return;
      playSample(d, 'wood_creak', { rate: (open ? 0.82 : 0.95) * jitter(0.06), gain: 0.85 });
      if (!open) playSample(d, 'wood_close', { t: 0.3, rate: 0.9, gain: 0.8 });
    },
    /** 教会の隠し扉の石板を開ける・閉める（2026-11-22）：重い石が床を擦る低い音（約 1.3 秒）と、止まるときの鈍い音 */
    slab(f, open = true) {
      const d = at(f, 0.9, { ref: 3, max: 30 });
      if (!d) return;
      noiseHit(d, { dur: 1.25, type: 'lowpass', freq: 520 * jitter(0.1), freqEnd: 300, q: 1.4, attack: 0.18, gain: 0.42 });
      noiseHit(d, { t: 0.1, dur: 1.0, type: 'bandpass', freq: 1300, freqEnd: 900, q: 2.5, attack: 0.2, gain: 0.08 });
      toneHit(d, { t: 1.3, dur: 0.22, f0: open ? 95 : 85, f1: 55, gain: 0.3 });
      noiseHit(d, { t: 1.3, dur: 0.16, type: 'lowpass', freq: 400, q: 0.8, gain: 0.3 });
    },
    /** 水の中へ潜る・水面へ浮く：水をかく音（川を泳ぐ音と同じ作り） */
    splash(f) { splash(f, false); },
    /**
     * 高い所から落ちて着いた（天坑から地底の池へ。game/fall.js）：水なら、どぼんという低い音と、しぶきと、洞窟の中に響く余韻。
     * 床なら、どさっという音。速いほど大きい
     */
    plunge(f, speed = 15, water = true) {
      const k = Math.min(1, speed / 20);
      const d = at(f, (f.isPlayer ? 0.9 : 1) * (0.6 + 0.4 * k), { ref: 6, max: 60 });
      if (!d) return;
      if (water) {
        toneHit(d, { dur: 0.35, f0: 150, f1: 55, gain: 0.35 * (0.6 + 0.4 * k) });
        noiseHit(d, { dur: 0.6, type: 'bandpass', freq: 700, freqEnd: 260, q: 0.7, attack: 0.01, gain: 0.5 * (0.6 + 0.4 * k) });
        noiseHit(d, { t: 0.04, dur: 0.5, type: 'highpass', freq: 2200, q: 0.4, gain: 0.22 });
        // しぶきが落ちる音（遅れて、細かく）と、洞窟に響く低い余韻
        noiseHit(d, { t: 0.45, dur: 0.9, type: 'bandpass', freq: 1500, freqEnd: 900, q: 0.6, attack: 0.15, gain: 0.12 });
        toneHit(d, { t: 0.1, dur: 1.4, f0: 70, f1: 48, gain: 0.12 });
      } else {
        noiseHit(d, { dur: 0.22, type: 'lowpass', freq: 600, freqEnd: 200, q: 0.8, gain: 0.45 * (0.6 + 0.4 * k) });
        toneHit(d, { dur: 0.14, f0: 110, f1: 60, gain: 0.25 });
      }
    },
    /** 角燈（ランタン）を灯す・外す：金具の小さな音 */
    lantern(f, on) {
      const d = at(f, 0.7, { ref: 1.5, max: 14 });
      if (d) playSample(d, 'pick_metal', { rate: (on ? 1.5 : 1.2) * jitter(0.05), gain: 0.4 });
    },
    /** 捕捉（ロックオン）・解除（2026-11-24）：自分だけに聞こえる、金具が噛み合う小さな「カチッ」（解除は低く短い） */
    lock(on) {
      if (!audio.ready) return;
      const d = outlet({ gain: 0.55, cutoff: 11000 });
      noiseHit(d, { t: 0, dur: 0.018, type: 'highpass', freq: on ? 3200 : 2200, gain: 0.5, attack: 0.001 });
      toneHit(d, { t: 0, dur: on ? 0.09 : 0.05, f0: on ? 1760 : 990, f1: on ? 1980 : 880, gain: 0.08, attack: 0.001 });
      if (on) toneHit(d, { t: 0.045, dur: 0.08, f0: 2640, gain: 0.05, attack: 0.001 });
    },
    /** 棺桶の蓋を押し開ける（render/coffin.js）：木のきしみ → 蓋が地面に落ちる音 */
    coffin(f) {
      const d = at(f, 1, { ref: 2, max: 30 });
      if (!d) return;
      playSample(d, 'wood_creak', { rate: 0.62, gain: 1 });
      playSample(d, 'wood_close', { t: 0.95, rate: 0.6, gain: 0.9 });
      playSample(d, 'body_fall', { t: 1.0, rate: 0.8, gain: 0.35 });
    },
    search(f, kind) {
      const d = at(f, 1, { ref: 2, max: 25 });
      if (!d) return;
      if (kind === 'wardrobe') playSample(d, 'wood_creak', { rate: 0.9, gain: 0.9 });
      else playSample(d, 'bed_rustle', { rate: 0.9, gain: 1 });
    },
    /** 見つかった・見つけた：低い太鼓と、不安な和音 */
    found() {
      const d = at(null, 1);
      if (!d) return;
      toneHit(d, { dur: 0.5, f0: 70, f1: 40, gain: 0.45 });
      for (const f of [233, 247]) toneHit(d, { dur: 0.9, f0: f, f1: f * 0.96, type: 'sawtooth', gain: 0.025, attack: 0.02 });
    },
    lethal(target) {
      const d = at(target, 1);
      if (!d) return;
      playSample(d, 'hit_flesh', { rate: 0.85, gain: 1 });
      playSample(d, 'hit_blunt', { t: 0.02, rate: 0.8, gain: 0.7 });
      toneHit(d, { t: 0.02, dur: 0.6, f0: 60, f1: 40, gain: 0.3 });
    },
    assassinate(f) {
      const d = at(f, 1);
      if (!d) return;
      playSample(d, 'swing_heavy', { rate: 0.9, gain: 0.9 });
      voice(f, 'v_attack', 0.8);
    },
    assassinFail(f) {
      const d = at(f, 1);
      if (d) playSample(d, 'swing_light', { rate: 0.8, gain: 0.7 });
    },
    /**
     * 時計台の秒針（刻の終わりの 10 秒。1 秒ごと）：歯車が 1 つ進む「カチッ」。硬い爪の当たる音と、短い金属の響き、
     * 大きな時計の仕掛けの木と鉄の胴鳴り。残り 3 秒からは少し強く（もうすぐ鐘が鳴る）
     * @param {number} left 残りの秒
     * @param {number} [at] 今から何秒後に鳴らすか（音の時計で正確に並べるとき）
     */
    clockTick(left = 10, at = 0) {
      if (!audio.ready) return;
      const k = left <= 3 ? 1.25 : 1;
      const d = outlet({ gain: 0.95 * k, cutoff: 12000 });
      if (audio.reverb) { const send = audio.ctx.createGain(); send.gain.value = 0.3; d.connect(send); send.connect(audio.reverb); }
      const t = at;
      noiseHit(d, { t, dur: 0.02, type: 'highpass', freq: 3000, gain: 0.6, attack: 0.001 });                       // 爪が当たる「カ」
      noiseHit(d, { t: t + 0.003, dur: 0.035, type: 'bandpass', freq: 1900, q: 4, gain: 0.4, attack: 0.001 });   // 「チッ」
      toneHit(d, { t, dur: 0.06, f0: 2350, f1: 2200, gain: 0.09, attack: 0.001 });                                // 短い金属の響き
      toneHit(d, { t, dur: 0.045, f0: 3710, gain: 0.045, attack: 0.001 });
      noiseHit(d, { t: t + 0.004, dur: 0.07, type: 'bandpass', freq: 650, q: 2.5, gain: 0.3, attack: 0.002 });    // 仕掛けの胴鳴り
    },
    /**
     * 時計台の鐘（刻が変わった瞬間）：鉄の鐘を強く 2 度打つ「カーン、カーン！」（利用者の指示。秒針の音の続き）。
     * 金属の硬い響き。高い音もこもらせずに残し、残響を付ける
     */
    bell(at = 0) {
      if (!audio.ready) return;
      const d = outlet({ gain: 0.65, cutoff: 9500 });
      if (audio.reverb) { const send = audio.ctx.createGain(); send.gain.value = 0.75; d.connect(send); send.connect(audio.reverb); }
      ironStrike(d, at, 293.7, 0.2);           // カーン（D4）
      ironStrike(d, at + 0.8, 293.7, 0.23);    // カーン！
    },
    /**
     * 刻の門（js/ui/time-gate.js）の音。利用者の指示（2026-11-17）：ゲートのようにガシャンガシャンと言いながら開く。
     *   slam：重い鉄の扉がぶつかって閉まる（ガシャーン）／bolt：かんぬきが差さる・抜ける（ガシャン）／
     *   clank：扉が引っかかりながら少し開く（ガシャン）／grind：擦れながら一気に開く（ゴゴゴ）
     * 録音の金属の音（低く落とす）と、その場で作る鉄の響き・低い衝撃・鎖の鳴りを重ねる
     */
    gate(kind) {
      if (!audio.ready) return;
      const d = outlet({ gain: 0.95, cutoff: 12000 });
      if (audio.reverb) { const send = audio.ctx.createGain(); send.gain.value = 0.55; d.connect(send); send.connect(audio.reverb); }
      if (kind === 'slam') {
        toneHit(d, { f0: 74, f1: 34, dur: 0.85, gain: 0.6, attack: 0.002 });                                  // 床まで響く低い衝撃
        noiseHit(d, { dur: 0.42, type: 'lowpass', freq: 1400, freqEnd: 180, gain: 0.75, attack: 0.001 });       // ぶつかる音の塊
        noiseHit(d, { dur: 0.06, type: 'highpass', freq: 3000, gain: 0.35, attack: 0.001 });                    // 硬い当たり
        ironStrike(d, 0.0, 92, 0.085);                                                                         // 鉄の扉の大きな響き
        ironStrike(d, 0.012, 139, 0.05);
        playSample(d, 'hit_metal', { rate: 0.48 * jitter(0.04), gain: 0.95 });
        playSample(d, 'armor_fall', { t: 0.02, rate: 0.55, gain: 0.7 });
        playSample(d, 'armor_chain', { t: 0.07, rate: 0.75, gain: 0.45 });                                      // 鎖・金具の鳴り
        playSample(d, 'hammer', { t: 0.11, rate: 0.6, gain: 0.35 });                                            // 跳ね返り
      } else if (kind === 'bolt') {
        noiseHit(d, { dur: 0.16, type: 'bandpass', freq: 1700, freqEnd: 600, q: 1.4, gain: 0.45, attack: 0.002 });   // 棒が擦れる
        playSample(d, 'hit_metal', { t: 0.1, rate: 0.82 * jitter(0.05), gain: 0.85 });                          // 止めに当たる
        ironStrike(d, 0.1, 240, 0.04);
        toneHit(d, { t: 0.1, f0: 120, f1: 70, dur: 0.25, gain: 0.25, attack: 0.002 });
      } else if (kind === 'clank') {
        toneHit(d, { f0: 88, f1: 46, dur: 0.5, gain: 0.45, attack: 0.002 });
        noiseHit(d, { dur: 0.22, type: 'lowpass', freq: 1100, freqEnd: 250, gain: 0.5, attack: 0.001 });
        ironStrike(d, 0.0, 118 * jitter(0.04), 0.05);
        playSample(d, 'hit_metal', { rate: 0.6 * jitter(0.06), gain: 0.8 });
        playSample(d, 'armor_chain', { t: 0.03, rate: 0.85 * jitter(0.05), gain: 0.35 });
      } else if (kind === 'grind') {
        noiseHit(d, { dur: 0.55, type: 'bandpass', freq: 520, freqEnd: 260, q: 2.2, gain: 0.5, attack: 0.04 });   // 擦れながら滑る
        noiseHit(d, { dur: 0.5, type: 'bandpass', freq: 2100, freqEnd: 1300, q: 5, gain: 0.12, attack: 0.05 }); // きしみ
        toneHit(d, { f0: 58, f1: 44, dur: 0.6, gain: 0.3, attack: 0.05 });
        playSample(d, 'armor_chain', { t: 0.05, rate: 0.6, gain: 0.4 });
        playSample(d, 'hit_metal', { t: 0.42, rate: 0.5, gain: 0.55 });                                         // 開ききって当たる
      }
    },
    /**
     * 必殺技の溜め（利用者の指示 2026-11-25：音を大きく）：低いうなりが上がっていき、吹き上がる風がふくらむ。属性ごとに音を重ねる
     * （水＝渦巻く水の音・雷＝はじける火花と電気のうなり・地＝地鳴りと岩のきしみ・炎＝炎のうなり・風＝風の鳴き声・聖＝聖歌の和音と鈴）。
     * 遠くまで聞こえる（ほかの人の必殺技も 200 m ほど先まで）。dur：放つまでの秒
     */
    ultCharge(f, element, dur = 1.2) {
      const d = at(f, 1.6, { ref: 25, max: 200 });
      if (!d) return;
      const c = audio.ctx, t0 = c.currentTime;
      if (audio.reverb) { const send = c.createGain(); send.gain.value = 0.6; d.connect(send); send.connect(audio.reverb); }
      // 低いうなり（上がっていく）
      const hum = c.createOscillator(), hg = c.createGain(), lp = c.createBiquadFilter();
      hum.type = 'sawtooth'; hum.frequency.setValueAtTime(62, t0); hum.frequency.exponentialRampToValueAtTime(170, t0 + dur);
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t0); lp.frequency.exponentialRampToValueAtTime(900, t0 + dur);
      hg.gain.setValueAtTime(0.0001, t0); hg.gain.exponentialRampToValueAtTime(0.26, t0 + dur * 0.9); hg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.12);
      hum.connect(lp); lp.connect(hg); hg.connect(d); hum.start(t0); hum.stop(t0 + dur + 0.2);
      noiseHit(d, { t: 0, dur: dur + 0.05, type: 'bandpass', freq: 300, freqEnd: 2200, q: 0.8, attack: dur * 0.85, gain: 0.4 });   // 吹き上がる風
      if (element === 'water') {
        noiseHit(d, { t: 0, dur: dur, type: 'bandpass', freq: 500, freqEnd: 1400, q: 1.6, attack: dur * 0.6, gain: 0.45 });
        for (let i = 0; i < 10; i++) toneHit(d, { t: R() * dur, dur: 0.09, f0: 300 + R() * 500, f1: 900 + R() * 700, type: 'sine', attack: 0.01, gain: 0.05 });   // 泡の音
      } else if (element === 'thunder') {
        const o = c.createOscillator(), og = c.createGain(), bp = c.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t0);
        bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 2;
        og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.12, t0 + dur); og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.05);
        o.connect(bp); bp.connect(og); og.connect(d); o.start(t0); o.stop(t0 + dur + 0.1);
        for (let i = 0; i < 26; i++) { const u = Math.sqrt(R()); noiseHit(d, { t: u * dur, dur: 0.012, type: 'highpass', freq: 3000, attack: 0.001, gain: 0.08 + u * 0.14 }); }   // だんだん多く
      } else if (element === 'earth') {
        noiseHit(d, { t: 0, dur: dur + 0.1, type: 'lowpass', freq: 140, attack: dur * 0.7, gain: 0.8 });   // 地鳴り
        for (let i = 0; i < 8; i++) noiseHit(d, { t: R() * dur, dur: 0.12, type: 'bandpass', freq: 400 + R() * 400, q: 3, attack: 0.01, gain: 0.12 });   // 岩のきしみ
      } else if (element === 'fire') {
        noiseHit(d, { t: 0, dur: dur + 0.05, type: 'lowpass', freq: 500, freqEnd: 1600, attack: dur * 0.6, gain: 0.55 });   // 炎のうなり
        for (let i = 0; i < 14; i++) noiseHit(d, { t: R() * dur, dur: 0.02, type: 'highpass', freq: 2000, attack: 0.001, gain: 0.09 });   // はぜる音
      } else if (element === 'wind') {
        noiseHit(d, { t: 0, dur: dur + 0.05, type: 'bandpass', freq: 700, freqEnd: 2600, q: 9, attack: dur * 0.5, gain: 0.5 });   // 風の鳴き声
        noiseHit(d, { t: dur * 0.3, dur: dur * 0.75, type: 'bandpass', freq: 1200, freqEnd: 600, q: 7, attack: dur * 0.3, gain: 0.3 });
      } else {
        // 聖：聖歌のような和音（ゆっくり揺れる。だんだん大きく）と鈴
        for (const [fr, g] of [[220, 0.07], [277.2, 0.06], [329.6, 0.06], [440, 0.04]]) {
          const o = c.createOscillator(), og = c.createGain(), vib = c.createOscillator(), vg = c.createGain();
          o.type = 'triangle'; o.frequency.value = fr;
          vib.frequency.value = 5.2; vg.gain.value = fr * 0.006; vib.connect(vg); vg.connect(o.frequency);
          og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(g, t0 + dur); og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.25);
          o.connect(og); og.connect(d); o.start(t0); vib.start(t0); o.stop(t0 + dur + 0.3); vib.stop(t0 + dur + 0.3);
        }
        for (let i = 0; i < 6; i++) metal(d, { t: (i / 6) * dur, base: 1760 * (1 + (i % 3) * 0.25), dur: 0.5, gain: 0.04 });
      }
    },
    /**
     * 祓魔僧の奇跡の音（2026-11-17）。kind：
     *   cast（唱え始め：祈りの和音がふくらむ。dur 秒）・heal（鈴の上がる分散和音と温かい和音）・revive（加護：深い鐘と聖歌の和音）・
     *   revived（蘇る：低い響きと大きな聖歌と鐘）・wall（光壁：ガラスのきらめきが立ち上がる）・wallHit（壁に当たる：澄んだ音）・
     *   wallBreak（砕ける：ガラスの割れる音）・flame（淨炎：炎が吹き上がる）・ignite（相手が燃える）・broken（途切れる）・notReady（まだ唱えられない）
     *   （2 回目）pillarCall（天光柱を唱えた：天へ昇る和音）・pillarWarn（降る前：高い光の音が上がる）・pillarStrike（降った：光の轟きと鐘）・
     *   fireball（聖火彈を放つ：炎の吹き出し）・fireballBoom（爆発）・thunder（神罰雷を投げる：雷のはじける音）・thunderHit（雷鳴）・shock（しびれ：電気のうなり）
     */
    miracle(kind, f, { dur = 1, x, y, z } = {}) {
      const src = x !== undefined ? { x, y, z, isPlayer: false } : f;
      const loud = { cast: 0.8, heal: 0.9, revive: 1.0, revived: 1.4, wall: 0.95, wallHit: 0.8, wallBreak: 1.1, flame: 0.9, ignite: 0.8, broken: 0.6, notReady: 0.35,
        pillarCall: 1.0, pillarWarn: 0.6, pillarStrike: 1.2, fireball: 0.9, fireballBoom: 1.4, thunder: 1.0, thunderHit: 1.6, shock: 0.7,
        blaze: 1.2, blazeOut: 0.8, fireSpread: 0.8, charred: 1.1 }[kind] ?? 0.8;
      const far = kind === 'thunderHit' || kind === 'fireballBoom' || kind === 'pillarStrike';   // 大きな音は遠くまで聞こえる
      const d = at(src, loud, far ? { ref: 20, max: 160 } : { ref: 12, max: 90 });
      if (!d) return;
      const c = audio.ctx, t0 = c.currentTime;
      const verb = (g) => { if (audio.reverb) { const send = c.createGain(); send.gain.value = g; d.connect(send); send.connect(audio.reverb); } };
      const pad = (freqs, t, len, g, attack = 0.3, type = 'triangle') => {
        for (const fr of freqs) {
          const o = c.createOscillator(), og = c.createGain(), vib = c.createOscillator(), vg = c.createGain();
          o.type = type; o.frequency.value = fr;
          vib.frequency.value = 4.6 + R() * 1.2; vg.gain.value = fr * 0.005; vib.connect(vg); vg.connect(o.frequency);
          og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(g, t + attack); og.gain.exponentialRampToValueAtTime(0.0001, t + len);
          o.connect(og); og.connect(d); o.start(t); vib.start(t); o.stop(t + len + 0.05); vib.stop(t + len + 0.05);
        }
      };
      const chime = (fr, dt, g = 0.12, len = 1.2) => metal(d, { t: dt, base: fr, ratios: [1, 2.0, 2.76, 4.07], dur: len, gain: g, decay: 0.5 });   // dt：今からの秒
      if (kind === 'cast') {
        verb(0.5);
        pad([196, 246.9, 293.7], t0, dur + 0.3, 0.045, dur * 0.8);                                  // 祈りの和音（ゆっくりふくらむ）
        noiseHit(d, { t: 0, dur: dur, type: 'bandpass', freq: 900, freqEnd: 2600, q: 1.2, attack: dur * 0.85, gain: 0.12 });   // 光が集まる息
      } else if (kind === 'heal') {
        verb(0.6);
        [523.3, 659.3, 784, 1046.5, 1318.5].forEach((fr, i) => chime(fr, i * 0.07, 0.09, 1.4));   // 上がっていく鈴
        pad([261.6, 329.6, 392], t0, 1.6, 0.05, 0.15);
      } else if (kind === 'revive') {
        verb(0.8);
        metal(d, { t: 0, base: 220, ratios: [1, 2.0, 2.4, 3.0, 4.2], dur: 3.0, gain: 0.22, decay: 1.1 });   // 深い鐘
        pad([220, 277.2, 329.6, 440], t0, 2.4, 0.045, 0.4);
      } else if (kind === 'revived') {
        verb(1.0);
        toneHit(d, { t: 0, dur: 1.8, f0: 70, f1: 110, type: 'sine', attack: 0.3, gain: 0.5 });              // 下から湧き上がる響き
        pad([196, 246.9, 293.7, 392, 493.9], t0 + 0.1, 2.6, 0.06, 0.6);                                      // 大きな聖歌
        metal(d, { t: 0.55, base: 660, ratios: [1, 1.5, 2.01, 2.76, 3.4], dur: 2.6, gain: 0.2, decay: 0.9 });
        noiseHit(d, { t: 0, dur: 1.4, type: 'bandpass', freq: 500, freqEnd: 3000, q: 0.8, attack: 1.0, gain: 0.25 });
      } else if (kind === 'wall') {
        verb(0.7);
        noiseHit(d, { t: 0, dur: 0.6, type: 'highpass', freq: 2200, freqEnd: 6000, attack: 0.15, gain: 0.22 });   // 光が立ち上がる
        [880, 1174.7, 1568, 2093].forEach((fr, i) => chime(fr, 0.05 + i * 0.04, 0.07, 1.6));
        toneHit(d, { t: 0, dur: 0.9, f0: 140, f1: 220, type: 'sine', attack: 0.08, gain: 0.25 });
      } else if (kind === 'wallHit') {
        verb(0.4);
        metal(d, { t: 0, base: 1500 * jitter(0.08), ratios: [1, 1.41, 2.3, 3.1], dur: 0.9, gain: 0.16, decay: 0.35 });   // 澄んだ当たり
        noiseHit(d, { t: 0, dur: 0.12, type: 'highpass', freq: 3000, attack: 0.001, gain: 0.2 });
      } else if (kind === 'wallBreak') {
        verb(0.6);
        for (let i = 0; i < 9; i++) metal(d, { t: R() * 0.25, base: 1800 + R() * 2600, ratios: [1, 1.37, 2.2], dur: 0.5, gain: 0.07, decay: 0.25 });   // 欠片
        noiseHit(d, { t: 0, dur: 0.45, type: 'highpass', freq: 2500, freqEnd: 1200, attack: 0.002, gain: 0.45 });   // 割れる
        toneHit(d, { t: 0, dur: 0.6, f0: 300, f1: 90, type: 'triangle', attack: 0.002, gain: 0.25 });
      } else if (kind === 'flame' || kind === 'ignite') {
        noiseHit(d, { t: 0, dur: 0.7, type: 'bandpass', freq: 300, freqEnd: 1400, q: 0.7, attack: 0.08, gain: kind === 'flame' ? 0.55 : 0.45 });   // ぼうっと吹き上がる
        noiseHit(d, { t: 0, dur: 0.5, type: 'lowpass', freq: 600, freqEnd: 200, attack: 0.02, gain: 0.3 });
        for (let i = 0; i < 7; i++) noiseHit(d, { t: 0.1 + R() * 0.7, dur: 0.02, type: 'highpass', freq: 2500, attack: 0.001, gain: 0.12 + R() * 0.1 });   // ぱちぱち
        if (kind === 'flame') chime(784, 0.05, 0.05, 1.0);   // 清めの火：小さな鈴
      } else if (kind === 'broken') {
        noiseHit(d, { t: 0, dur: 0.35, type: 'bandpass', freq: 1800, freqEnd: 500, q: 2, attack: 0.002, gain: 0.25 });   // しぼむ
        toneHit(d, { t: 0, dur: 0.4, f0: 330, f1: 200, type: 'triangle', attack: 0.003, gain: 0.12 });
      } else if (kind === 'notReady') {
        toneHit(d, { t: 0, dur: 0.12, f0: 220, f1: 180, type: 'square', attack: 0.002, gain: 0.05 });
      } else if (kind === 'pillarCall') {
        verb(0.8);
        pad([293.7, 370, 440, 587.3], t0, 1.6, 0.045, 0.2);                                        // 天へ昇る和音
        noiseHit(d, { t: 0, dur: 0.9, type: 'bandpass', freq: 1200, freqEnd: 5000, q: 1.5, attack: 0.5, gain: 0.15 });
      } else if (kind === 'pillarWarn') {
        verb(0.5);
        toneHit(d, { t: 0, dur: 0.55, f0: 900, f1: 1800, type: 'sine', attack: 0.4, gain: 0.06 });   // 高い光の音が上がる
        noiseHit(d, { t: 0, dur: 0.55, type: 'highpass', freq: 3000, freqEnd: 7000, attack: 0.45, gain: 0.06 });
      } else if (kind === 'pillarStrike') {
        verb(0.8);
        toneHit(d, { t: 0, dur: 1.1, f0: 140, f1: 40, type: 'sine', attack: 0.004, gain: 0.55 });   // 光が落ちた轟き
        noiseHit(d, { t: 0, dur: 0.5, type: 'lowpass', freq: 3500, freqEnd: 300, attack: 0.003, gain: 0.5 });
        metal(d, { t: 0.01, base: 990 * jitter(0.05), ratios: [1, 1.5, 2.01, 2.76], dur: 1.6, gain: 0.12, decay: 0.7 });   // 鐘のきらめき
      } else if (kind === 'fireball') {
        noiseHit(d, { t: 0, dur: 0.6, type: 'bandpass', freq: 400, freqEnd: 1600, q: 0.8, attack: 0.03, gain: 0.6 });   // 炎が吹き出す
        toneHit(d, { t: 0, dur: 0.4, f0: 120, f1: 70, type: 'triangle', attack: 0.01, gain: 0.2 });
        for (let i = 0; i < 6; i++) noiseHit(d, { t: 0.05 + R() * 0.5, dur: 0.02, type: 'highpass', freq: 2500, attack: 0.001, gain: 0.1 });
      } else if (kind === 'fireballBoom') {
        verb(0.7);
        toneHit(d, { t: 0, dur: 1.2, f0: 90, f1: 30, type: 'sine', attack: 0.003, gain: 0.8 });     // 爆発の低い音
        noiseHit(d, { t: 0, dur: 0.9, type: 'lowpass', freq: 2200, freqEnd: 150, attack: 0.002, gain: 0.85 });
        noiseHit(d, { t: 0.02, dur: 0.6, type: 'bandpass', freq: 600, freqEnd: 250, q: 0.7, attack: 0.01, gain: 0.4 });   // 炎のごうっという音
        for (let i = 0; i < 8; i++) noiseHit(d, { t: 0.1 + R() * 0.7, dur: 0.02, type: 'highpass', freq: 2200, attack: 0.001, gain: 0.12 });
      } else if (kind === 'thunder') {
        noiseHit(d, { t: 0, dur: 0.25, type: 'highpass', freq: 2500, freqEnd: 6000, attack: 0.002, gain: 0.5 });   // 雷のはじける音
        toneHit(d, { t: 0, dur: 0.35, f0: 1400, f1: 300, type: 'sawtooth', attack: 0.002, gain: 0.06 });
        for (let i = 0; i < 10; i++) noiseHit(d, { t: R() * 0.3, dur: 0.012, type: 'highpass', freq: 4000, attack: 0.001, gain: 0.15 });
      } else if (kind === 'thunderHit') {
        verb(1.0);
        noiseHit(d, { t: 0, dur: 0.12, type: 'highpass', freq: 1800, attack: 0.001, gain: 0.9 });     // ばりっ
        noiseHit(d, { t: 0.02, dur: 1.8, type: 'lowpass', freq: 900, freqEnd: 80, attack: 0.02, gain: 0.9 });   // ごろごろ
        toneHit(d, { t: 0.01, dur: 1.5, f0: 70, f1: 30, type: 'sine', attack: 0.01, gain: 0.6 });
      } else if (kind === 'blaze') {
        // 火炎：ごうっと燃え上がる（低い炎の音と、たくさんのはぜる音）
        noiseHit(d, { t: 0, dur: 1.4, type: 'bandpass', freq: 250, freqEnd: 900, q: 0.6, attack: 0.05, gain: 0.8 });
        noiseHit(d, { t: 0, dur: 0.8, type: 'lowpass', freq: 800, freqEnd: 200, attack: 0.02, gain: 0.5 });
        for (let i = 0; i < 14; i++) noiseHit(d, { t: R() * 1.3, dur: 0.02, type: 'highpass', freq: 2200, attack: 0.001, gain: 0.12 + R() * 0.1 });
      } else if (kind === 'blazeOut') {
        // 火が消える：じゅっという音
        noiseHit(d, { t: 0, dur: 0.7, type: 'highpass', freq: 3000, freqEnd: 6000, attack: 0.01, gain: 0.35 });
        noiseHit(d, { t: 0, dur: 0.4, type: 'bandpass', freq: 1200, freqEnd: 600, q: 1, attack: 0.01, gain: 0.2 });
      } else if (kind === 'fireSpread') {
        noiseHit(d, { t: 0, dur: 0.6, type: 'bandpass', freq: 300, freqEnd: 1100, q: 0.7, attack: 0.05, gain: 0.45 });
        for (let i = 0; i < 5; i++) noiseHit(d, { t: 0.1 + R() * 0.5, dur: 0.02, type: 'highpass', freq: 2500, attack: 0.001, gain: 0.1 });
      } else if (kind === 'charred') {
        // 焦げて倒れる：はぜる音と、崩れる低い音
        for (let i = 0; i < 10; i++) noiseHit(d, { t: R() * 0.6, dur: 0.025, type: 'highpass', freq: 1800, attack: 0.001, gain: 0.18 });
        noiseHit(d, { t: 0, dur: 1.2, type: 'highpass', freq: 2500, freqEnd: 5000, attack: 0.05, gain: 0.25 });
        toneHit(d, { t: 0.05, dur: 0.8, f0: 110, f1: 45, type: 'sine', attack: 0.01, gain: 0.35 });
      } else if (kind === 'shock') {
        const o = c.createOscillator(), og = c.createGain();                                          // 電気のうなり（ぶーん、と震える）
        o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t0);
        og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.07, t0 + 0.05); og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        const lp = c.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 900; lp.Q.value = 2;
        o.connect(lp); lp.connect(og); og.connect(d); o.start(t0); o.stop(t0 + dur + 0.05);
        for (let i = 0; i < 12; i++) noiseHit(d, { t: R() * dur, dur: 0.01, type: 'highpass', freq: 3500, attack: 0.001, gain: 0.12 });
      }
    },
    /**
     * 英雄ごとの必殺技の音（2 回目。2026-11-25）。kind：
     *   flash（雷霆一閃の閃光：裂ける音と高い電気の音）・bolt（稲妻で走る：dur 秒、ぱちぱちと折れるたびの雷鳴）・pierce（貫いた）・stance（構え：刃の鳴る音）・
     *   dash（踏み込み：風を切る音と雷の斬撃）・auraStrike（雷の衣の自分への落雷）・draw（颶風一矢：大弓のきしみと、ふくらむ風。dur 秒）・
     *   release（嵐の大矢を放つ：大きな風の唸りと爆音）・wallBreak（家の壁が破れる）・deflect（水の衣が弾いた）
     */
    ultHero(kind, f, { dur = 1, x, y, z } = {}) {
      const src = x !== undefined ? { x, y, z, isPlayer: false } : f;
      const loud = { flash: 1.6, bolt: 1.4, pierce: 0.9, stance: 0.9, dash: 1.5, auraStrike: 1.0, draw: 1.2, release: 1.9, wallBreak: 1.5, deflect: 0.8,
        rockRing: 1.4, bigSpike: 1.8, fireRise: 1.3, fireJump: 1.3, auraBurst: 0.9, gate: 1.6, spear: 0.8, holyImpact: 0.7, reflect: 0.8,
        ailWater: 0.9, ailEarth: 1.0, ailWind: 1.0, ailHoly: 0.8, enchant: 0.45, comboShock: 1.0, comboFan: 1.0 }[kind] ?? 1;
      const d = at(src, loud, { ref: 25, max: 200 });
      if (!d) return;
      const c = audio.ctx;
      const verb = (g) => { if (audio.reverb) { const send = c.createGain(); send.gain.value = g; d.connect(send); send.connect(audio.reverb); } };
      if (kind === 'flash') {
        verb(0.6);
        noiseHit(d, { t: 0, dur: 0.12, type: 'highpass', freq: 1800, attack: 0.0005, gain: 0.9 });
        toneHit(d, { t: 0, dur: 0.9, f0: 2600, f1: 900, type: 'sawtooth', attack: 0.005, gain: 0.08 });
        noiseHit(d, { t: 0.05, dur: 1.2, type: 'lowpass', freq: 380, freqEnd: 90, attack: 0.05, gain: 0.5 });
      } else if (kind === 'bolt') {
        verb(0.5);
        const n = 12;
        for (let i = 0; i < n; i++) {
          const t = (i / n) * dur;
          noiseHit(d, { t, dur: 0.05, type: 'highpass', freq: 2200 + R() * 1500, attack: 0.001, gain: 0.35 });
          toneHit(d, { t, dur: 0.12, f0: 900 + R() * 600, f1: 200, type: 'sawtooth', attack: 0.002, gain: 0.05 });
        }
        noiseHit(d, { t: 0, dur: dur + 0.3, type: 'bandpass', freq: 1200, freqEnd: 3000, q: 1.5, attack: 0.05, gain: 0.25 });
      } else if (kind === 'pierce') {
        noiseHit(d, { t: 0, dur: 0.06, type: 'highpass', freq: 3000, attack: 0.001, gain: 0.5 });
        toneHit(d, { t: 0, dur: 0.18, f0: 700, f1: 160, type: 'square', attack: 0.002, gain: 0.07 });
      } else if (kind === 'stance') {
        metal(d, { t: 0, base: 1900, ratios: [1, 1.5, 2.4], dur: 0.9, gain: 0.09 });
        noiseHit(d, { t: 0, dur: 0.25, type: 'bandpass', freq: 5000, freqEnd: 2500, q: 2, attack: 0.01, gain: 0.15 });
      } else if (kind === 'dash') {
        verb(0.7);
        noiseHit(d, { t: 0, dur: 0.35, type: 'bandpass', freq: 600, freqEnd: 3500, q: 0.8, attack: 0.01, gain: 0.7 });
        noiseHit(d, { t: 0.08, dur: 0.1, type: 'highpass', freq: 2500, attack: 0.001, gain: 0.8 });
        metal(d, { t: 0.08, base: 1400, ratios: [1, 1.7, 2.9], dur: 0.7, gain: 0.08 });
      } else if (kind === 'auraStrike') {
        verb(0.5);
        noiseHit(d, { t: 0, dur: 0.06, type: 'highpass', freq: 2000, attack: 0.0005, gain: 0.7 });
        noiseHit(d, { t: 0.03, dur: 0.9, type: 'lowpass', freq: 500, freqEnd: 100, attack: 0.02, gain: 0.45 });
      } else if (kind === 'draw') {
        for (let i = 0; i < 5; i++) noiseHit(d, { t: (i / 5) * dur, dur: 0.18, type: 'bandpass', freq: 380 + i * 40, q: 6, attack: 0.03, gain: 0.12 });   // 大弓のきしみ
        noiseHit(d, { t: 0, dur: dur + 0.1, type: 'bandpass', freq: 400, freqEnd: 2200, q: 2.5, attack: dur * 0.8, gain: 0.45 });   // ふくらむ風
      } else if (kind === 'release') {
        verb(0.8);
        toneHit(d, { t: 0, dur: 0.25, f0: 140, f1: 60, type: 'triangle', attack: 0.002, gain: 0.5 });       // 弦の鳴る音
        noiseHit(d, { t: 0, dur: 1.6, type: 'bandpass', freq: 2600, freqEnd: 250, q: 1.1, attack: 0.005, gain: 0.85 });   // 大きな風の唸り
        noiseHit(d, { t: 0, dur: 0.5, type: 'lowpass', freq: 900, freqEnd: 120, attack: 0.002, gain: 0.6 });
      } else if (kind === 'wallBreak') {
        verb(0.6);
        noiseHit(d, { t: 0, dur: 0.6, type: 'lowpass', freq: 1400, freqEnd: 200, attack: 0.001, gain: 0.8 });
        for (let i = 0; i < 12; i++) noiseHit(d, { t: 0.05 + R() * 0.6, dur: 0.05, type: 'bandpass', freq: 700 + R() * 1500, q: 2, attack: 0.002, gain: 0.15 });
      } else if (kind === 'deflect') {
        noiseHit(d, { t: 0, dur: 0.4, type: 'bandpass', freq: 1400, freqEnd: 600, q: 1, attack: 0.005, gain: 0.5 });
        toneHit(d, { t: 0, dur: 0.15, f0: 500, f1: 900, type: 'sine', attack: 0.01, gain: 0.08 });
      } else if (kind === 'rockRing') {
        // 千岩槍獄：岩の槍の輪が突き上がる（地鳴りと、岩の割れる音がばらばらに）
        verb(0.5);
        toneHit(d, { t: 0, dur: 0.6, f0: 70, f1: 38, type: 'sine', attack: 0.005, gain: 0.55 });
        noiseHit(d, { t: 0, dur: 0.45, type: 'lowpass', freq: 900, freqEnd: 160, attack: 0.002, gain: 0.55 });
        for (let i = 0; i < 9; i++) noiseHit(d, { t: R() * 0.12, dur: 0.06, type: 'bandpass', freq: 400 + R() * 900, q: 1.2, attack: 0.001, gain: 0.18 });
      } else if (kind === 'bigSpike') {
        verb(0.8);
        toneHit(d, { t: 0, dur: 1.2, f0: 85, f1: 28, type: 'sine', attack: 0.003, gain: 0.85 });
        noiseHit(d, { t: 0, dur: 0.9, type: 'lowpass', freq: 1200, freqEnd: 140, attack: 0.001, gain: 0.85 });
        noiseHit(d, { t: 0, dur: 0.12, type: 'highpass', freq: 1600, attack: 0.001, gain: 0.5 });
        for (let i = 0; i < 14; i++) noiseHit(d, { t: 0.2 + R() * 1.0, dur: 0.07, type: 'bandpass', freq: 500 + R() * 900, q: 1.5, attack: 0.002, gain: 0.1 });   // 礫が降る
      } else if (kind === 'fireRise') {
        // 紅蓮崩天：足もとから炎の柱が昇る（ごうっと唸る）
        verb(0.4);
        noiseHit(d, { t: 0, dur: dur + 0.3, type: 'bandpass', freq: 250, freqEnd: 900, q: 0.8, attack: dur * 0.6, gain: 0.65 });
        noiseHit(d, { t: 0, dur: dur + 0.3, type: 'lowpass', freq: 300, attack: 0.1, gain: 0.4 });
        for (let i = 0; i < 10; i++) noiseHit(d, { t: R() * dur, dur: 0.02, type: 'highpass', freq: 2400, attack: 0.001, gain: 0.08 });
      } else if (kind === 'fireJump') {
        verb(0.5);
        noiseHit(d, { t: 0, dur: 0.7, type: 'bandpass', freq: 300, freqEnd: 1800, q: 0.9, attack: 0.02, gain: 0.7 });   // 跳び上がる炎の風
        toneHit(d, { t: 0, dur: 0.3, f0: 120, f1: 60, type: 'triangle', attack: 0.003, gain: 0.35 });                     // 踏み切り
      } else if (kind === 'auraBurst') {
        noiseHit(d, { t: 0, dur: 0.35, type: 'lowpass', freq: 1400, freqEnd: 200, attack: 0.002, gain: 0.55 });   // 炎が爆ぜる
        for (let i = 0; i < 6; i++) noiseHit(d, { t: R() * 0.25, dur: 0.02, type: 'highpass', freq: 2400, attack: 0.001, gain: 0.1 });
      } else if (kind === 'gate') {
        // 天門開闢：光の門が開く（鐘の和音と、聖歌のような長い響き）
        verb(1.0);
        metal(d, { t: 0, base: 880, ratios: [1, 1.25, 1.5, 2.0, 2.5], dur: 2.6, gain: 0.16, decay: 0.85 });
        for (const [fq, g] of [[220, 0.06], [277, 0.05], [330, 0.05], [440, 0.04]]) toneHit(d, { t: 0, dur: 2.2, f0: fq, f1: fq, type: 'sine', attack: 0.5, gain: g });
        noiseHit(d, { t: 0, dur: 2.0, type: 'bandpass', freq: 3000, freqEnd: 5000, q: 4, attack: 0.6, gain: 0.08 });
      } else if (kind === 'spear') {
        noiseHit(d, { t: 0, dur: 0.18, type: 'bandpass', freq: 5000, freqEnd: 1500, q: 2, attack: 0.01, gain: 0.25 });   // 光の槍が落ちてくる
      } else if (kind === 'holyImpact') {
        metal(d, { t: 0, base: 1760 + R() * 300, ratios: [1, 2.01, 2.76], dur: 0.5, gain: 0.08 });
        noiseHit(d, { t: 0, dur: 0.12, type: 'lowpass', freq: 1800, freqEnd: 300, attack: 0.001, gain: 0.35 });
      } else if (kind === 'ailWater') {
        // 状態異常（③-1）：濡＝水をかぶる音・重＝どすんと倒れる・崩＝突風・眩＝きらめき
        noiseHit(d, { t: 0, dur: 0.5, type: 'bandpass', freq: 1300, freqEnd: 500, q: 0.9, attack: 0.01, gain: 0.55 });
        for (let i = 0; i < 8; i++) noiseHit(d, { t: 0.1 + R() * 0.5, dur: 0.04, type: 'bandpass', freq: 1800 + R() * 1500, q: 2, attack: 0.003, gain: 0.07 });
      } else if (kind === 'ailEarth') {
        toneHit(d, { t: 0, dur: 0.35, f0: 90, f1: 45, type: 'sine', attack: 0.003, gain: 0.6 });
        noiseHit(d, { t: 0, dur: 0.3, type: 'lowpass', freq: 700, freqEnd: 150, attack: 0.002, gain: 0.5 });
      } else if (kind === 'ailWind') {
        noiseHit(d, { t: 0, dur: 0.6, type: 'bandpass', freq: 2200, freqEnd: 500, q: 1.2, attack: 0.01, gain: 0.6 });
      } else if (kind === 'ailHoly') {
        metal(d, { t: 0, base: 2000, ratios: [1, 1.5, 2.4], dur: 0.6, gain: 0.07 });
      } else if (kind === 'enchant') {
        noiseHit(d, { t: 0, dur: 0.12, type: 'bandpass', freq: 2400, freqEnd: 900, q: 1.5, attack: 0.002, gain: 0.25 });
      } else if (kind === 'comboShock') {
        noiseHit(d, { t: 0, dur: 0.05, type: 'highpass', freq: 2600, attack: 0.0005, gain: 0.6 });
        toneHit(d, { t: 0, dur: 0.3, f0: 1400, f1: 300, type: 'sawtooth', attack: 0.002, gain: 0.06 });
        noiseHit(d, { t: 0.02, dur: 0.4, type: 'bandpass', freq: 1800, freqEnd: 3500, q: 1.5, attack: 0.01, gain: 0.3 });
      } else if (kind === 'comboFan') {
        noiseHit(d, { t: 0, dur: 0.8, type: 'lowpass', freq: 1400, freqEnd: 250, attack: 0.02, gain: 0.6 });   // ごうっと燃え広がる
        for (let i = 0; i < 10; i++) noiseHit(d, { t: R() * 0.6, dur: 0.02, type: 'highpass', freq: 2400, attack: 0.001, gain: 0.1 });
      } else if (kind === 'reflect') {
        metal(d, { t: 0, base: 2200, ratios: [1, 1.5, 2.4], dur: 0.4, gain: 0.07 });
        noiseHit(d, { t: 0, dur: 0.15, type: 'bandpass', freq: 3500, freqEnd: 1200, q: 2, attack: 0.002, gain: 0.25 });
      }
    },
    /**
     * 必殺技を放つ：地を揺らす大きな爆音・吹き飛ばす風圧・はじける音・長い響き。属性ごとに重ねる
     * （水＝大きなしぶき・雷＝雷鳴・地＝岩が砕けて礫が降る・炎＝爆炎・風＝突風・聖＝鐘と聖歌）
     */
    ultBurst(f, element) {
      const d = at(f, 2.0, { ref: 28, max: 220 });
      if (!d) return;
      const c = audio.ctx;
      if (audio.reverb) { const send = c.createGain(); send.gain.value = 0.9; d.connect(send); send.connect(audio.reverb); }
      toneHit(d, { t: 0, dur: 1.7, f0: 92, f1: 26, type: 'sine', attack: 0.004, gain: 0.95 });          // 地を揺らす低い爆音
      toneHit(d, { t: 0, dur: 0.9, f0: 190, f1: 42, type: 'triangle', attack: 0.003, gain: 0.36 });
      noiseHit(d, { t: 0, dur: 1.2, type: 'lowpass', freq: 2800, freqEnd: 170, q: 0.7, attack: 0.002, gain: 0.85 });   // 吹き飛ばす風圧
      noiseHit(d, { t: 0, dur: 0.16, type: 'highpass', freq: 2400, attack: 0.001, gain: 0.55 });                       // はじける音
      if (element === 'water') {
        noiseHit(d, { t: 0.02, dur: 1.4, type: 'bandpass', freq: 1400, freqEnd: 500, q: 0.9, attack: 0.02, gain: 0.7 });   // 大きなしぶき
        for (let i = 0; i < 16; i++) noiseHit(d, { t: 0.35 + R() * 1.1, dur: 0.05, type: 'bandpass', freq: 1800 + R() * 1500, q: 2, attack: 0.003, gain: 0.08 });   // 落ちる水滴
      } else if (element === 'thunder') {
        noiseHit(d, { t: 0, dur: 0.08, type: 'highpass', freq: 1800, attack: 0.0005, gain: 0.9 });   // 雷の裂ける音
        noiseHit(d, { t: 0.06, dur: 2.4, type: 'lowpass', freq: 420, freqEnd: 90, attack: 0.05, gain: 0.8 });   // 長い雷鳴
        for (let i = 0; i < 18; i++) noiseHit(d, { t: R() * 0.6, dur: 0.015, type: 'highpass', freq: 3500, attack: 0.001, gain: 0.14 });
      } else if (element === 'earth') {
        noiseHit(d, { t: 0, dur: 0.9, type: 'lowpass', freq: 700, freqEnd: 120, attack: 0.002, gain: 0.8 });   // 岩が砕ける
        for (let i = 0; i < 14; i++) noiseHit(d, { t: 0.25 + R() * 1.0, dur: 0.07, type: 'bandpass', freq: 500 + R() * 900, q: 1.5, attack: 0.002, gain: 0.12 });   // 礫が降る
      } else if (element === 'fire') {
        noiseHit(d, { t: 0, dur: 1.8, type: 'lowpass', freq: 1200, freqEnd: 220, attack: 0.01, gain: 0.75 });   // 爆炎
        for (let i = 0; i < 22; i++) noiseHit(d, { t: R() * 1.5, dur: 0.02, type: 'highpass', freq: 2200, attack: 0.001, gain: 0.1 });   // 火の粉がはぜる
      } else if (element === 'wind') {
        noiseHit(d, { t: 0, dur: 1.5, type: 'bandpass', freq: 2400, freqEnd: 300, q: 1.2, attack: 0.01, gain: 0.7 });   // 突風
        noiseHit(d, { t: 0.1, dur: 1.2, type: 'bandpass', freq: 1600, freqEnd: 900, q: 10, attack: 0.05, gain: 0.35 });   // 風の鳴き声
      } else {
        metal(d, { t: 0.02, base: 1320, ratios: [1, 1.5, 2.01, 2.76, 3.4], dur: 2.4, gain: 0.18, decay: 0.85 });   // 光のきらめき（鐘のような長い響き）
        metal(d, { t: 0.05, base: 660, ratios: [1, 2, 2.76], dur: 2.2, gain: 0.14 });
      }
    },
  };
  return api;
}

/** 試合の出来事に、効果音をつなぐ */
export function wireSounds(sfx, { combat, match, hiding, me }) {
  combat.on('swing', ({ fighter, heavy, tech }) => sfx.swing(fighter, heavy, tech));
  combat.on('hit', ({ attacker, target, guarded, kind }) => { if (kind === 'melee' || kind === 'arrow') sfx.hit(attacker, target, guarded, kind); });
  combat.on('strike', ({ fighter, hits, blocked }) => { if (!hits && blocked) sfx.strikeObstacle(fighter); });
  combat.on('guardBreak', ({ fighter }) => sfx.guardBreak(fighter));
  combat.on('shieldSkill', ({ fighter }) => sfx.shieldSwing(fighter));
  combat.on('shieldStrike', ({ fighter, skill, hits }) => { if (hits) sfx.shieldHit(fighter, !!skill.push); });
  combat.on('fire', ({ fighter }) => sfx.bowRelease(fighter));
  // 必殺技（2026-11-25）：溜めの音と、放つ大きな音（属性ごとに重ねる）
  // 溜めの音は、力が放たれるまで（劍騎士は最後の落雷・弓兵は放つまで）
  combat.on('ult', ({ fighter, ult, at, spec }) => sfx.ultCharge(fighter, ult?.element, spec ? (spec.at ?? spec.release ?? spec.strike?.at ?? at) : at));
  combat.on('ultThunder', ({ fighter, phase }) => {
    if (phase === 'flashed') sfx.ultHero('flash', fighter);
    else if (phase === 'bolt') sfx.ultHero('bolt', fighter, { dur: 1.1 });
    else if (phase === 'stance') sfx.ultHero('stance', fighter);
    else if (phase === 'dashed') sfx.ultHero('dash', fighter);
  });
  combat.on('ultPierce', ({ fighter, x, y, z }) => sfx.ultHero('pierce', fighter, { x, y, z }));
  combat.on('auraStrike', ({ fighter }) => sfx.ultHero('auraStrike', fighter));
  combat.on('ultWind', ({ fighter, phase }) => sfx.ultHero(phase === 'release' ? 'release' : 'draw', fighter, { dur: 1.4 }));
  combat.on('deflect', ({ target, x, y, z }) => sfx.ultHero('deflect', target, { x, y, z }));
  // （後半 2026-11-26）千岩槍獄・紅蓮崩天・天門開闢と、纏う物の音
  combat.on('ultEarth', ({ fighter, phase, x, y, z }) => {
    if (phase === 'ring') sfx.ultHero('rockRing', fighter, { x, y, z });
    else if (phase === 'big') sfx.ultHero('bigSpike', fighter, { x, y, z });
  });
  combat.on('ultFire', ({ fighter, phase }) => {
    if (phase === 'pillar') sfx.ultHero('fireRise', fighter, { dur: 1.2 });
    else if (phase === 'jump') sfx.ultHero('fireJump', fighter);
  });
  combat.on('ultHoly', ({ fighter, phase, x, y, z }) => {
    if (phase === 'gate') sfx.ultHero('gate', fighter);
    else if (phase === 'spear') sfx.ultHero('spear', fighter, { x, y: y + 4, z });
    else if (phase === 'impact') sfx.ultHero('holyImpact', fighter, { x, y, z });
  });
  combat.on('auraBurst', ({ fighter, x, y, z }) => sfx.ultHero('auraBurst', fighter, { x, y, z }));
  combat.on('auraReflect', ({ target }) => sfx.ultHero('reflect', target));
  // 状態異常・纏・組み合わせ（③-1。2026-11-27）
  combat.on('ailment', ({ fighter, el }) => { const k = { water: 'ailWater', earth: 'ailEarth', wind: 'ailWind', holy: 'ailHoly' }[el]; if (k) sfx.ultHero(k, fighter); });
  combat.on('enchantHit', ({ target }) => sfx.ultHero('enchant', target));
  combat.on('combo', ({ fighter, combo }) => { if (combo === 'shock') sfx.ultHero('comboShock', fighter); else if (combo === 'fan') sfx.ultHero('comboFan', fighter); });
  combat.on('ultBurst', ({ fighter, ult }) => sfx.ultBurst(fighter, ult?.element));
  // 祓魔僧の奇跡（game/miracles.js）：唱え始め・効き目・蘇る・光壁・炎・途切れる
  combat.on('miracleCast', ({ fighter, id }) => sfx.miracle('cast', fighter, { dur: MIRACLES[id].at }));
  combat.on('miracle', ({ fighter, id }) => sfx.miracle({ heal: 'heal', revive: 'revive', wall: 'wall', flame: 'flame', pillar: 'pillarCall', fireball: 'fireball', thunder: 'thunder' }[id] || 'cast', fighter));
  combat.on('pillarWarn', ({ owner, x, y, z }) => sfx.miracle('pillarWarn', owner, { x, y, z }));
  combat.on('pillarStrike', ({ owner, x, y, z }) => sfx.miracle('pillarStrike', owner, { x, y, z }));
  combat.on('fireballBoom', ({ owner, x, y, z }) => sfx.miracle('fireballBoom', owner, { x, y, z }));
  combat.on('thunderHit', ({ spell, x, y, z }) => sfx.miracle('thunderHit', spell?.owner, { x, y, z }));
  combat.on('shocked', ({ fighter, time }) => sfx.miracle('shock', fighter, { dur: time }));
  // 属性と状態異常（2026-11-18）：火炎・燃え移り・火が消える・焦げて倒れる・雷痺（長くしびれる）
  combat.on('blaze', ({ fighter }) => sfx.miracle('blaze', fighter));
  combat.on('blazeEnd', ({ fighter, how }) => { if (how !== 'burnt' && how !== 'gone') sfx.miracle('blazeOut', fighter); });
  combat.on('fireSpread', ({ fire }) => sfx.miracle('fireSpread', null, { x: fire.x, y: fire.y + 0.5, z: fire.z }));
  combat.on('lethal', ({ target, how }) => { if (how === 'charred') sfx.miracle('charred', target); });
  combat.on('paralyzed', ({ fighter, time }) => sfx.miracle('shock', fighter, { dur: time }));
  combat.on('revived', ({ fighter }) => sfx.miracle('revived', fighter));
  combat.on('wallHit', ({ wall, x, y, z }) => sfx.miracle('wallHit', wall.owner, { x, y, z }));
  combat.on('wallEnd', ({ wall, broke }) => { if (broke) sfx.miracle('wallBreak', wall.owner, { x: wall.x, y: wall.y + 1.2, z: wall.z }); });
  combat.on('ignite', ({ fighter }) => sfx.miracle('ignite', fighter));
  combat.on('miracleBroken', ({ fighter }) => sfx.miracle('broken', fighter));
  combat.on('miracleNotReady', ({ fighter }) => { if (fighter === me) sfx.miracle('notReady', fighter); });
  combat.on('projectileStuck', ({ projectile }) => sfx.arrowStuck(projectile));
  combat.on('dodge', ({ fighter }) => sfx.dodge(fighter));
  combat.on('dodged', ({ target }) => sfx.perfectDodge(target));
  combat.on('switch', ({ fighter }) => sfx.switchWeapon(fighter));
  combat.on('searchStart', ({ fighter, spot }) => sfx.search(fighter, spot.kind));
  combat.on('lethal', ({ target }) => sfx.lethal(target));
  combat.on('hit', ({ target, kind, wound }) => { if (kind === 'assassinate' && wound) sfx.lethal(target); });   // 暗殺で倒しきらなかったときも、刺す・打つ音（2026-11-18）
  combat.on('assassinate', ({ attacker }) => sfx.assassinate(attacker));
  combat.on('assassinFail', ({ attacker }) => sfx.assassinFail(attacker));
  match.on('eliminated', ({ victim }) => sfx.death(victim));
  match.on('tick', ({ left }) => sfx.clockTick(left));   // 刻の終わりの 10 秒：秒針の「カチッ」
  match.on('phaseStart', () => sfx.bell());              // 0 秒（刻が変わった瞬間）：鐘の「カーン、カーン！」
  hiding.on('hide', ({ fighter, spot }) => sfx.hide(fighter, spot.kind));
  hiding.on('exit', ({ fighter, spot }) => sfx.hide(fighter, spot.kind));
  hiding.on('found', ({ searcher, victim }) => { if (searcher === me || victim === me) sfx.found(); });
}
