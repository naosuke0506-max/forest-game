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
const KIND = { armingsword: 'slash', longsword: 'slash', dagger: 'slash', spear: 'pierce', mace: 'blunt', longbow: 'pierce' };
// 振る音：録音の組・高さ・大きさ
const SWING = {
  armingsword: { set: 'swing_light', rate: 1.0, gain: 0.8 },
  longsword:   { set: 'swing_mid', rate: 0.92, gain: 0.95 },
  dagger:      { set: 'swing_light', rate: 1.2, gain: 0.6 },
  spear:       { set: 'swing_mid', rate: 1.15, gain: 0.7 },
  mace:        { set: 'swing_heavy', rate: 0.78, gain: 1.0 },
};

/**
 * @param {{ terrain: object, zones: object, villageCenter: {x, z} }} world
 */
export function createSfx({ terrain, zones = null, villageCenter = null }) {
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
    if (villageCenter && Math.hypot(f.x - villageCenter.x, f.z - villageCenter.z) < 6.5) return 'stone';
    if (zones.path(f.x, f.z) > 0.5) return 'dirt';
    const w = zones.weights(f.x, f.z);
    if (w.castle > 0.6) return 'dirt';
    if (w.deep > 0.5) return 'leaves';
    return 'grass';
  }

  let steps = 0;   // 確認用：鳴らした足音の数
  /** 足音 1 歩（録音。地面で選ぶ） */
  function step(f, run) {
    steps++;
    // しゃがむと足音が小さく、伏せていれば体を引きずる布ずれ（bot にも聞こえにくい。game/senses.js）
    const st = f.stance || 'stand';
    if (st === 'prone') {
      const dp = at(f, 0.35, { ref: 2, max: 14 });
      if (dp) playSample(dp, 'roll_cloth', { rate: 0.75 * jitter(0.08), gain: 0.5 });
      return;
    }
    const d = at(f, (run ? 1 : 0.8) * (st === 'crouch' ? 0.42 : 1), { ref: 2, max: st === 'crouch' ? 16 : 30 });
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

  /** 時計台の鐘の 1 打（教会の鐘の倍音：ハム・基音・短三度・五度・ノミナル…。高い倍音ほど早く消える） */
  function bellStrike(d, t, f, gain) {
    const parts = [[0.5, 0.55, 9], [1.0, 0.6, 6], [1.2, 0.42, 4.5], [1.5, 0.28, 3.5], [2.0, 0.75, 3.2], [2.5, 0.2, 2.2], [3.0, 0.3, 1.8], [4.0, 0.16, 1.2], [5.3, 0.08, 0.7]];
    for (const [k, a, dur] of parts) {
      toneHit(d, { t, f0: f * k, dur, gain: gain * a, attack: 0.003 });
      toneHit(d, { t, f0: f * k * 1.0015 + 0.4, dur: dur * 0.9, gain: gain * a * 0.35, attack: 0.003 });   // わずかにずれた音（うなり）
    }
    noiseHit(d, { t, dur: 0.05, type: 'bandpass', freq: f * 6, q: 3, gain: gain * 0.5 });   // 撞木が当たる音
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
        const stride = f.stance === 'prone' ? 0.45 : f.stance === 'crouch' ? 0.55 : speed > 4.2 ? 0.95 : 0.72;
        if (w.d >= stride) { w.d -= stride; step(f, speed > 4.2); }
      }
    },
    /** 振り始め：刃が通る時に風の音。スタミナが 4 割以下なら声も */
    swing(f, heavy) {
      const st = attackStats(f.weapon, heavy);
      const sw = SWING[f.weapon] || SWING.armingsword;
      const d = at(f, 1);
      if (d) playSample(d, heavy ? 'swing_heavy' : sw.set, { t: Math.max(0, st.windup - 0.09), rate: sw.rate * (heavy ? 0.85 : 1) * jitter(0.05), gain: sw.gain * (heavy ? 1.15 : 1) });
      if (f.stamina / (f.stats?.maxStamina || 100) <= 0.4 && R() < 0.8) voice(f, 'v_attack', 0.75, { t: Math.max(0, st.windup - 0.15) });
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
    pickup(kind, isMe = true) {
      if (!isMe) return;
      const d = at(null, 1);
      if (!d) return;
      if (kind === 'wood') playSample(d, 'pick_wood', { rate: jitter(0.06), gain: 0.9 });
      else if (kind === 'stone') playSample(d, 'pick_stone', { rate: jitter(0.06), gain: 0.8 });
      else if (kind === 'iron') playSample(d, 'pick_metal', { rate: jitter(0.06), gain: 0.8 });
      else if (kind === 'cloth') playSample(d, 'pick_cloth', { rate: jitter(0.06), gain: 0.9 });
      else { playSample(d, 'crate_open', { gain: 0.9 }); playSample(d, 'wood_close', { t: 0.45, gain: 0.6 }); }   // 箱：蓋を開けて置く
    },
    craft() {
      const d = at(null, 1);
      if (!d) return;
      playSample(d, 'hammer', { gain: 0.9 });
      playSample(d, 'hammer', { t: 0.3, rate: 1.05, gain: 0.8 });
    },
    hide(f, kind) {
      const d = at(f, f.isPlayer ? 0.9 : 0.6, { ref: 2, max: 18 });
      if (!d) return;
      if (kind === 'wardrobe') { playSample(d, 'wood_creak', { gain: 0.7 }); playSample(d, 'wood_close', { t: 0.35, gain: 0.6 }); }
      else { playSample(d, 'bed_rustle', { gain: 0.8 }); playSample(d, 'roll_cloth', { t: 0.1, rate: 1.2, gain: 0.4 }); }
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
     * 時計台の鐘：4 つの鐘のチャイム（ウェストミンスターの節）と、時を打つ大きな鐘（strikes 回）。
     * 遠くの塔から聞こえるように、こもらせて残響を付ける
     */
    bell(strikes = 3) {
      if (!audio.ready) return;
      const d = outlet({ gain: 0.55, cutoff: 4200 });
      if (audio.reverb) { const send = audio.ctx.createGain(); send.gain.value = 0.9; d.connect(send); send.connect(audio.reverb); }
      const E4 = 329.6, Fs4 = 370.0, Gs4 = 415.3, B3 = 246.9;
      const tune = [[Gs4, Fs4, E4, B3], [E4, Gs4, Fs4, B3]];
      let t = 0;
      for (const phrase of tune) {
        for (const f of phrase) { bellStrike(d, t, f, 0.11); t += 0.72; }
        t += 0.55;
      }
      t += 0.9;
      for (let i = 0; i < strikes; i++) { bellStrike(d, t, 164.8, 0.2); t += 2.4; }   // 大きな鐘（E3）
    },
  };
  return api;
}

/** 試合の出来事に、効果音をつなぐ */
export function wireSounds(sfx, { combat, match, hiding, pickups, me }) {
  combat.on('swing', ({ fighter, heavy }) => sfx.swing(fighter, heavy));
  combat.on('hit', ({ attacker, target, guarded, kind }) => { if (kind === 'melee' || kind === 'arrow') sfx.hit(attacker, target, guarded, kind); });
  combat.on('strike', ({ fighter, hits, blocked }) => { if (!hits && blocked) sfx.strikeObstacle(fighter); });
  combat.on('guardBreak', ({ fighter }) => sfx.guardBreak(fighter));
  combat.on('fire', ({ fighter }) => sfx.bowRelease(fighter));
  combat.on('projectileStuck', ({ projectile }) => sfx.arrowStuck(projectile));
  combat.on('dodge', ({ fighter }) => sfx.dodge(fighter));
  combat.on('dodged', ({ target }) => sfx.perfectDodge(target));
  combat.on('switch', ({ fighter }) => sfx.switchWeapon(fighter));
  combat.on('searchStart', ({ fighter, spot }) => sfx.search(fighter, spot.kind));
  combat.on('lethal', ({ target }) => sfx.lethal(target));
  combat.on('assassinate', ({ attacker }) => sfx.assassinate(attacker));
  combat.on('assassinFail', ({ attacker }) => sfx.assassinFail(attacker));
  match.on('eliminated', ({ victim }) => sfx.death(victim));
  match.on('phaseStart', ({ phase }) => sfx.bell(phase + 1));   // 第二フェーズは 2 回、第三フェーズは 3 回…と時を打つ
  hiding.on('hide', ({ fighter, spot }) => sfx.hide(fighter, spot.kind));
  hiding.on('exit', ({ fighter, spot }) => sfx.hide(fighter, spot.kind));
  hiding.on('found', ({ searcher, victim }) => { if (searcher === me || victim === me) sfx.found(); });
  pickups.on('taken', ({ fighter, item }) => sfx.pickup(item.kind, fighter === me));
}
