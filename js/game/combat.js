// 戦闘（計算だけ）：攻撃・防御・弓と矢・ダメージ・ひるみ・スタミナ。
// 人間も bot も、同じ形の入力 { attack: 押している, guard: 押している } で動かす。
// PlayCanvas に依存しない（後でオンライン化するとき、サーバーにそのまま移せるように）
import { updateDive } from './swim.js';
import { WEAPONS, COMBAT, DODGE, HEAVY, TECH, SHIELD_SKILLS, SHIELD_MOVES, SHIELDS, DASH_ATTACKS, DASH, SWIM, MIRACLES, REVIVE_TIME, ELEMENTS, ASSASSIN, ULT_BURST, ULTIMATE, PIERCE_ARROW, ULT_SPECS, ENCHANT } from './data.js';
import { selectedMiracle, selectMiracle, cycleMiracle, miracleReady, startCool, updateMiracles } from './miracles.js';
import { canUlt, spendUlt, ultOf } from './ultimate.js';
import { createUltMoves } from './ult-moves.js';
import { createControls, hasControl, controlReady, holyMark } from './controls.js';
import { keepInside, BODY_RADIUS } from './movement.js';
import { setStance, updateStance, stanceShape, resetStance } from './stance.js';
import { techSetOf, controlTech, updateTech, interruptTech } from './techniques.js';
import { reactKind, startReact, updateReact } from './reactions.js';
import { createAssassin } from './assassin.js';
import { createHideActs } from './hide-acts.js';

// 隠れる・探すに関わる動き
const FINISH_REACH = 2.4;   // 致命の一撃が届く近さ（無防備な相手まで m）
const FINISH_HIT = 0.45;    // 致命の一撃が入るまで（秒）

const DEG = Math.PI / 180;
const wrap = (a) => ((a + 540) % 360) - 180;
/** 向き yaw（度）の正面と、(dx, dz) の方向のなす角（度） */
function angleTo(yaw, dx, dz) {
  const to = Math.atan2(-dx, -dz) / DEG;
  return Math.abs(wrap(to - yaw));
}

/**
 * 1 回の近接攻撃の数値（ふつうの攻撃か、左手ボタンの強攻撃か）。見た目（動きの長さ）もこれに合わせる
 */
export function attackStats(weaponId, heavy = false) {
  const w = WEAPONS[weaponId];
  if (!heavy) return w;
  const extra = HEAVY.byWeapon[weaponId] || {};
  return {
    ...w,
    power: 'h',   // 強攻撃は重い一撃（受けた側は重い被弾・強い受け）
    damage: w.damage * HEAVY.damage,
    windup: w.windup * HEAVY.windup,
    recovery: w.recovery * HEAVY.recovery,
    stamina: w.stamina * HEAVY.stamina,
    arc: extra.arc ?? w.arc,
    reach: w.reach * (extra.reach ?? 1),
    guardPierce: Math.min(1, (w.guardPierce || 0) + (extra.guardPierce || 0)),
  };
}

/**
 * @param {object} opt
 * @param {object} opt.match 試合（脱落と加点に使う）
 * @param {(x: number, z: number) => number} opt.heightAt 地面の高さ
 * @param {(x: number, z: number, y?: number) => number} [opt.groundAt] 立てる高さ（家の床・階段。無ければ地面）
 * @param {object} [opt.hiding] 隠れ場所（game/hiding.js）。隠れている人には攻撃が当たらない
 * @param {object} [opt.cover] 壁裏隠れ（game/cover.js）。壁に背を付けた所から暗殺できる
 * @param {object} opt.obstacles 木の幹や岩（矢が刺さる）
 * @param {object} [opt.senses] 目（game/senses.js）
 * @param {(x: number, z: number) => ({ kind: 'grass'|'tree', x: number, z: number }|null)} [opt.flammable] 燃える物（草・木）。火炎の人が触れると火が移る
 */
export function createCombat({ match, heightAt, obstacles, groundAt = null, hiding = null, cover = null, senses = null, flammable = null, sight = null }) {
  const floorAt = groundAt || ((x, z) => heightAt(x, z));
  const yOf = (f) => f.y ?? heightAt(f.x, f.z);   // 足の高さ（家の二階にいれば高い）
  const projectiles = [];
  // 光壁（祓魔僧の奇跡。game/miracles.js）：{ owner, x, y, z, yaw, half, height, left（残り秒）, guard（受け止められる残りの傷）}
  const walls = [];
  // 飛ばす奇跡（聖火彈・神罰雷）：{ kind: 'fireball'|'thunder', owner, x, y, z, vx, vy, vz, life, target }。矢（projectiles）とは別に持つ
  const spells = [];
  // 天光柱の 1 本ずつ：{ owner, plan, at（唱えてから降り始めるまでの秒）, t, warned, x, y, z }
  const strikes = [];
  // 地面の火（火炎の人が草・木に触れて火が移った所）：{ kind: 'grass'|'tree', x, y, z, r, left, life, owner（燃やした本人。火が効かない）, id }
  const fires = [];
  const listeners = {};
  const emit = (type, data) => (listeners[type] || []).forEach((fn) => fn(data));
  const fighters = match.fighters;
  let clock = 0;   // 試合の時計（秒）。技の長押し・つながる時間を数える

  function spendStamina(f, n) {
    f.stamina = Math.max(0, f.stamina - n);
    f.staminaDelay = COMBAT.staminaRegenDelay;
  }

  /** ダメージを与える。from：攻撃した人（向きの判定に使う） */
  function damage(target, raw, attacker, { pierce = 0, through = false, fromX, fromZ, kind = 'melee', power = 'l', physical = true } = {}) {
    if (!target.alive || match.state !== 'running') return;
    // 回避中の、攻撃が当たらない時間
    const a = target.action;
    if (a?.kind === 'dodge') {
      const d = DODGE[target.weight];
      // 雷の衣（雷霆一閃の後）：稲妻の姿で回避している間は、ずっと当たらない
      if ((a.t >= d.invuln[0] && a.t <= d.invuln[1]) || target.aura?.kind === 'thunder') { emit('dodged', { attacker, target }); return; }
    }
    if (target.invuln > 0) return;   // 蘇ったばかり（蘇生の奇跡）・必殺技の間：傷を受けない
    let amount = (raw * (attacker ? attacker.stats.attack : 1) * target.armor) / target.stats.defense;
    if (firm(target)) amount *= 1 - target.aura.cut;   // 水の衣（大海嘯の後）・岩の鎧（千岩槍獄の後）：受ける傷が半分
    // 淨炎（奇跡）：鎚矛が炎をまとっている間の近接の当たりは、炎の傷を足す（あとで elementHit。楯でも半分通る）
    const flaming = physical && kind === 'melee' && attacker?.flame > 0;
    // 光壁（奇跡）：攻めた所と受ける人の間に光の壁があれば、壁が受け止める（壁を張った人の攻撃は通る。必殺技の衝撃波は通る）
    if (kind !== 'ult' && kind !== 'pillar' && attacker && attacker !== target) {   // 必殺技の衝撃波と天光柱（空から）は壁を越える
      const w = wallBetween(fromX, fromZ, target.x, target.z, yOf(target) + 1.1, attacker);
      if (w) { hitWall(w, amount, attacker, fromX, fromZ, target); return; }
    }
    let guarded = false, broke = false;
    // 楯を通る割合：pierce は武器の「防禦の上から響く」分、skillPierce は楯の上からでも通ると決めた物の分（貫く矢 through）
    const skillPierce = through || (physical && kind === 'melee' && attacker?.aura?.kind === 'fire') ? 1 : 0;   // 紅蓮の衣（紅蓮崩天の後）の近接も、楯の上から通る
    const crush = physical && kind === 'melee' && attacker?.aura?.kind === 'rock';   // 楯の上からでも重い一撃でよろめかせる（岩の鎧＝千岩槍獄の後の槍）
    const steady = target.action?.kind === 'ult' || firm(target);   // ひるまない（必殺技の間・水の衣・岩の鎧）
    // 防御：前から来た物理の攻撃だけ。楯ごとに減らせる割合が違う（data.js の SHIELDS の cut：鳶形楯・大楯 100%・小楯 70%）。
    // 減らした分だけスタミナを使う。防禦の上から響く武器（pierce）は、その割合だけ通る。
    // ただし鳶形楯・大楯（100%）は、物理の攻撃を全部止める（鈍器の響く分も止める。利用者の指示 2026-11-13）。
    // 通るのは、楯の上から通ると決めた物だけ（貫く矢）
    const dx = fromX - target.x, dz = fromZ - target.z;
    const impact = amount;   // 受けた一撃の強さ（防禦の受けの動きを、強さで使い分ける）
    if (!physical && kind !== 'burn' && target.guarding && !!target.shield && target.stamina > 0 && angleTo(target.yaw, dx, dz) <= COMBAT.guardArc / 2) {
      // 物理でない攻撃（炎・雷・聖）：楯で前から受けても半分（ELEMENTS.guardPass）は通る（鳶形楯・大楯でも。利用者の指示 2026-11-18）
      const blocked = amount * (1 - ELEMENTS.guardPass);
      spendStamina(target, blocked * COMBAT.guardStaminaPerDamage);
      amount -= blocked;
      guarded = true;
    } else if (physical && target.guarding && target.stamina > 0 && angleTo(target.yaw, dx, dz) <= COMBAT.guardArc / 2) {
      const cut = target.shield ? (SHIELDS[target.shield]?.cut ?? COMBAT.guardReduceShield) : COMBAT.guardReduce;
      const full = !!target.shield && cut >= 1;
      const reduce = cut * (1 - (full ? skillPierce : pierce));
      const blocked = amount * reduce;
      spendStamina(target, blocked * COMBAT.guardStaminaPerDamage);
      amount -= blocked;
      guarded = true;
      if (target.stamina <= 0) {                // 防御が崩れた（よろめく）
        target.guarding = false;
        target.action = null;
        broke = true;
        emit('guardBreak', { fighter: target });
      }
    }
    target.stats.hp -= amount;
    target.hitFlash = 0.25;
    if (target.cover) cover?.exit(target);   // 攻撃を受けたら壁から離れる
    target.lastHitBy = attacker;
    // 受けた動き：被弾（軽い・重い）・よろめき・防禦の受け（game/reactions.js）。ひるむ時間もここで決まる
    if (!steady) startReact(target, reactKind(target, { guarded, broke, power, pierce, impact, crush }), fromX, fromZ);
    if (crush && guarded && !steady) { target.guarding = false; if (target.action?.kind === 'shield') target.action = null; }   // 岩の鎧の槍：楯ごとよろめく
    if (!guarded && !steady) {                   // まともに受けるとひるむ（振りかぶり・溜めも止まる）
      const ta = target.action;
      if (ta?.kind === 'assassinate' && !ta.hit) { assassin.cancel(target); target.action = null; }   // 止めを刺す前に斬られた：相手を放す
      if (ta?.kind === 'drag' && !ta.hit) { if (ta.victim.action?.kind === 'dragged') ta.victim.action = null; target.action = null; }
      if (ta && ['hideIn', 'hideOut', 'search'].includes(ta.kind)) target.action = null;   // 隠れる・出る・探すのを取りやめる
      if (ta && ((ta.kind === 'attack' && !ta.hit) || (ta.kind === 'shield' && !ta.hit) || ta.kind === 'charge' || ta.kind === 'charge2')) target.action = null;
      if (ta?.kind === 'control' && !ta.fired) { target.action = null; emit('controlBroken', { fighter: target }); }   // 操が効く前に斬られた：途切れる（待ち時間は始まらない）
      // 奇跡を唱えている途中（効き目が出る前）：途切れる（待ち時間は始まらない）
      if (ta?.kind === 'miracle' && !ta.done) { target.action = null; emit('miracleBroken', { fighter: target, id: ta.id }); }
      interruptTech(target);
    }
    emit('hit', { attacker, target, amount, guarded, kind, power });
    if (target.stats.hp <= 0) {
      if (revive(target, attacker)) return;
      target.stats.hp = 0;
      target.action = null;
      target.guarding = false;
      match.eliminate(target, attacker);
      return;
    }
    // 光輪（天門開闢の後）：受けた傷の一部を、攻めた人へ光で返す（返した光は、また返さない）
    if (target.aura?.kind === 'holy' && attacker && attacker !== target && attacker.alive && kind !== 'reflect' && amount > 0) {
      const back = amount * ULT_SPECS.cleric.aura.reflect;
      burnHurt(attacker, back, target);
      emit('auraReflect', { fighter: target, target: attacker, amount: back });
    }
    // 紅蓮の衣（紅蓮崩天の後）：近接の一撃ごとに、当てた相手のまわりで炎が爆ぜる
    if (physical && kind === 'melee' && attacker?.aura?.kind === 'fire') fireBurst(attacker, target);
    // 淨炎：物理の当たりのあとに、炎の傷（武器の MIRACLES.flame.fire 倍）・少し燃やす・火炎を溜める（物理を楯で全部止めても、炎は半分通る）
    if (flaming) elementHit(target, attacker, 'fire', raw * MIRACLES.flame.fire, MIRACLES.flame.buildup, { fromX, fromZ, kind: 'flame' });
  }

  /**
   * 纏（属性強化の 1 段目。2026-11-27）：武器（近接・矢）が当たるたびに、纏った属性の傷（武器の ENCHANT.damage 倍。物理ではない＝楯でも半分）と、
   * その属性の状態異常の溜まり ENCHANT.buildup。by.enchant が属性の名前
   */
  function enchantHit(t, by, base, fromX, fromZ) {
    const el = by?.enchant;
    if (!el || !t.alive || t === by) return;
    if (elementHit(t, by, el, base * ENCHANT.damage, ENCHANT.buildup, { fromX, fromZ, kind: 'enchant' })) emit('enchantHit', { fighter: by, target: t, el });
  }
  /** 水の衣・岩の鎧（必殺技の後）：受ける傷が減り、ひるまず、吹き飛ばされない */
  function firm(t) { const k = t.aura?.kind; return k === 'water' || k === 'rock'; }
  /** 紅蓮の衣：当てた相手のまわりで炎が爆ぜる（炎の傷・火炎を溜める。本人には効かない） */
  function fireBurst(f, at) {
    const A = ULT_SPECS.blunt.aura, ay = yOf(at);
    for (const t of fighters) {
      if (t === f || !t.alive || t.hidden || t.invuln > 0) continue;
      if (Math.hypot(t.x - at.x, t.z - at.z) > A.radius || Math.abs(yOf(t) - ay) > 2) continue;
      elementHit(t, f, 'fire', A.damage, A.buildup, { fromX: f.x, fromZ: f.z, kind: 'flame' });
    }
    emit('auraBurst', { fighter: f, x: at.x, y: ay + 1, z: at.z, radius: A.radius });
  }
  /** 打ち上げる（見た目だけ。体の高さ f.lift を time 秒の間、山なりに h m まで上げる。当たり判定は地面のまま） */
  function launch(t, h, time = 0.8) {
    if (!t.alive || t.invuln > 0) return;
    if (t.launch && t.launch.h >= h && t.launch.t < t.launch.time * 0.5) return;   // もっと高く上がっている途中
    t.launch = { t: 0, time, h };
  }
  /** 閉じ込める（千岩槍獄の岩の槍）：secs 秒動けず、何もできない（していたことも止まる） */
  function pin(t, by, secs) {
    if (!t.alive || t.invuln > 0) return;
    const ta = t.action;
    if (ta && !LOCKED.has(ta.kind)) { if (ta.kind === 'miracle' && !ta.done) emit('miracleBroken', { fighter: t, id: ta.id }); t.action = null; }
    if (t.cover) cover?.exit(t);
    t.guarding = false;
    interruptTech(t);
    t.stun = Math.max(t.stun, secs);
    t.pinned = Math.max(t.pinned || 0, secs);
    emit('pinned', { fighter: t, by, time: secs });
  }

  // ---- 属性（炎・雷）と状態異常（火炎・雷痺）。利用者の指示 2026-11-18（data.js の ELEMENTS） ----
  const EF = ELEMENTS.fire, ET = ELEMENTS.thunder, EW = ELEMENTS.water, EE = ELEMENTS.earth, EWi = ELEMENTS.wind, EH = ELEMENTS.holy;
  const AIL_KEYS = ['fire', 'thunder', 'water', 'earth', 'wind', 'holy'];
  /** t が楯を前（fromX, fromZ の方）へ構えているか */
  const guardsFront = (t, fromX, fromZ) => t.guarding && !!t.shield && t.stamina > 0 && angleTo(t.yaw, fromX - t.x, fromZ - t.z) <= COMBAT.guardArc / 2;
  /**
   * 属性の攻撃を当てる：傷（物理でない。楯では半分）・炎は少し燃やす／雷は少ししびれる・状態異常を溜める（楯で受けたら溜まりも半分）。当たったら true
   */
  function elementHit(t, by, el, raw, buildup, { fromX, fromZ, kind, power = 'l' }) {
    if (!t.alive) return false;
    const guarded = guardsFront(t, fromX, fromZ), before = t.stats.hp;
    // 感電（組み合わせ）：濡れている相手には、雷の傷と溜まりが EW.shock 倍
    const k = el === 'thunder' && t.wet > 0 ? EW.shock : 1;
    if (k > 1) emit('combo', { fighter: t, by, combo: 'shock' });
    damage(t, raw * k, by, { fromX, fromZ, kind, power, physical: false });
    if (!t.alive || t.stats.hp >= before) return false;   // 光壁に止められた・避けられた・傷を受けない・蘇った
    if (el === 'fire') slip(t, by);
    else if (el === 'thunder') jolt(t, by, guarded);
    else if (el === 'wind') fan(t, by);   // 煽火（組み合わせ）：燃えている相手に風が当たると、まわりへ燃え広がる
    afflict(t, el, buildup * k * (guarded ? ELEMENTS.guardPass : 1), by);
    return true;
  }
  /** 煽火（組み合わせ）：燃えている・火炎の相手に風が当たると、まわり EWi.fan.radius m の敵にも炎が溜まって燃える（風を当てた人には効かない） */
  function fan(t, by) {
    if (!t.burn && !t.blaze) return;
    const F = EWi.fan, ty = yOf(t);
    let n = 0;
    for (const o of fighters) {
      if (o === t || o === by || !o.alive || o.hidden || o.invuln > 0) continue;
      if (Math.hypot(o.x - t.x, o.z - t.z) > F.radius || Math.abs(yOf(o) - ty) > 2) continue;
      slip(o, by);
      afflict(o, 'fire', F.buildup, by);
      n++;
    }
    emit('combo', { fighter: t, by, combo: 'fan', spread: n });
  }
  /** 炎：少し燃える（燃えている間にまた当たると、燃える時間が戻る。火炎の間は火炎のほうが強いので足さない） */
  function slip(t, by) {
    if (t.blaze || t.waterDepth > 0.1 || t.wet > 0) return;   // 濡れている間は燃え始めない（消火）
    const lit = !t.burn;
    t.burn = { left: Math.max(t.burn?.left || 0, EF.slip), dps: EF.slipDps, by };
    if (lit) emit('ignite', { fighter: t, by });
  }
  /** 雷：少ししびれる（動けない。振り・唱えるのも止まる。楯で受けたらしびれない） */
  function jolt(t, by, guarded) {
    if (guarded || t.paralyzed > 0 || firm(t)) return;   // 水の衣・岩の鎧はひるまない
    const ta = t.action;
    if (ta && !LOCKED.has(ta.kind) && ta.kind !== 'dodge') { if (ta.kind === 'miracle' && !ta.done) emit('miracleBroken', { fighter: t, id: ta.id }); t.action = null; }
    t.guarding = false;
    interruptTech(t);
    t.stun = Math.max(t.stun, ET.jolt);
    t.shock = Math.max(t.shock || 0, ET.jolt);
    emit('shocked', { fighter: t, time: ET.jolt, by });
  }
  /** 状態異常を溜める（0〜100%）。100% で発動する */
  function afflict(t, el, amount, by) {
    if (!t.alive || !(amount > 0) || t.invuln > 0 || !ELEMENTS[el]) return;   // 必殺技の間・蘇ったばかりは溜まらない
    const st = ailOf(t);
    // 発動している間は溜めない
    if ((el === 'fire' && t.blaze) || (el === 'thunder' && t.paralyzed > 0) || (el === 'water' && t.wet > 0) || (el === 'earth' && t.heavy > 0)
      || (el === 'wind' && t.broken > 0) || (el === 'holy' && t.blind > 0)) return;
    if (el === 'wind' && t.heavy > 0) return;            // 不動（組み合わせ）：重い間は崩れない
    if (el === 'fire' && t.wet > 0) amount *= EW.fireCut;   // 消火：濡れている間は炎が溜まりにくい
    if (el === 'earth' && t.wet > 0) amount *= EW.mud;      // 泥濘：濡れている相手には地がよく溜まる
    st[el] = Math.min(100, st[el] + amount);
    st[`${el}T`] = 0;
    emit('buildup', { fighter: t, el, value: st[el], by });
    if (st[el] < 100) return;
    st[el] = 0;
    if (el === 'fire') startBlaze(t, by);
    else if (el === 'thunder') startParalysis(t, by);
    else if (el === 'water') startWet(t, by);
    else if (el === 'earth') startHeavy(t, by);
    else if (el === 'wind') startBroken(t, by);
    else if (el === 'holy') startDazzle(t, by);
  }
  /** 溜まりの入れ物（6 属性。fireT などは、最後に溜まってからの秒） */
  function ailOf(t) {
    const st = (t.ail ||= {});
    for (const k of AIL_KEYS) { st[k] ??= 0; st[`${k}T`] ??= 0; }
    return st;
  }
  /** 濡：wet 秒、遅くなりスタミナの戻りが鈍る。燃えている・火炎は消え、溜まった炎も消える（消火） */
  function startWet(t, by) {
    t.wet = EW.wet;
    if (t.burn) { t.burn = null; emit('extinguish', { fighter: t }); }
    if (t.blaze) endBlaze(t, 'water');
    if (t.ail) t.ail.fire = 0;
    emit('ailment', { fighter: t, by, el: 'water', time: EW.wet });
  }
  /** 重：転ぶ（倒れて起き上がる）。heavy 秒、回避が短く・走れない */
  function startHeavy(t, by) {
    t.heavy = EE.heavy;
    const ta = t.action;
    if (!ta || !LOCKED.has(ta.kind)) {
      if (ta?.kind === 'miracle' && !ta.done) emit('miracleBroken', { fighter: t, id: ta.id });
      if (t.cover) cover?.exit(t);
      t.guarding = false;
      interruptTech(t);
      t.action = { kind: 'getup', t: 0, time: EE.fall, fell: true };   // 倒れた姿から起き上がる（暗殺で生き残った時と同じ動き）
      t.stun = Math.max(t.stun, EE.fall);
    }
    emit('ailment', { fighter: t, by, el: 'earth', time: EE.heavy });
  }
  /** 崩：吹き飛ばされ、stagger 秒よろめく（その間は防禦できない） */
  function startBroken(t, by) {
    t.broken = EWi.stagger;
    const fx = by ? by.x : t.x - Math.sin((t.yaw * Math.PI) / 180), fz = by ? by.z : t.z - Math.cos((t.yaw * Math.PI) / 180);
    // 同じ瞬間にもう吹き飛ばされている（嵐の大矢は矢の道から横へ）なら、その向きのまま。よろめく長さだけ延ばす
    if (t.react && t.react.push > 0 && t.react.t < 0.05) t.stun = Math.max(t.stun, EWi.stagger);
    else knock(t, fx, fz, EWi.push, EWi.stagger, 0.8);
    t.guarding = false;
    emit('ailment', { fighter: t, by, el: 'wind', time: EWi.stagger });
  }
  /** 眩：blind 秒、目がくらむ（天光柱の目くらましと同じ） */
  function startDazzle(t, by) {
    t.blind = Math.max(t.blind || 0, EH.blind);
    emit('blinded', { fighter: t, time: EH.blind, by });
    emit('ailment', { fighter: t, by, el: 'holy', time: EH.blind });
  }
  /** 火炎：強く燃え上がる。消せないまま時間が来ると焦げて倒れる */
  function startBlaze(t, by) {
    t.burn = null;
    t.blaze = { left: EF.blaze, by, dodges: 0, lastDodge: -99, spread: 0 };
    emit('blaze', { fighter: t, by });
  }
  function endBlaze(t, how) {
    if (!t.blaze) return;
    const by = t.blaze.by;
    t.blaze = null;
    emit('blazeEnd', { fighter: t, how, by });   // how：dodge（回避で消した）・water（水）・heal（治癒）・burnt（焦げて倒れた）・gone（倒れた）
  }
  /** 雷痺：しびれ続けて無防備（致命の一撃を受ける）。secs：しびれる秒（雷霆一閃は技が終わるまで続ける） */
  function startParalysis(t, by, secs = ET.paralysis) {
    const ta = t.action;
    if (ta && !LOCKED.has(ta.kind)) { if (ta.kind === 'miracle' && !ta.done) emit('miracleBroken', { fighter: t, id: ta.id }); t.action = null; }
    if (t.cover) cover?.exit(t);
    t.guarding = false;
    interruptTech(t);
    const fresh = !(t.paralyzed > 0);
    t.paralyzed = Math.max(t.paralyzed || 0, secs);
    t.helpless = Math.max(t.helpless || 0, secs);
    t.stun = Math.max(t.stun, secs);
    t.shock = Math.max(t.shock || 0, secs);
    if (fresh) emit('paralyzed', { fighter: t, by, time: secs });
  }
  /** 地面の火を起こす（火炎の人が草・木に触れた）。近くに同じ火があれば起こさない */
  function kindle(spot, y, owner) {
    for (const fi of fires) if (Math.hypot(fi.x - spot.x, fi.z - spot.z) < (spot.kind === 'tree' ? 0.6 : 0.9)) return;   // もう燃えている
    if (fires.length >= EF.ground.max) { const old = fires.shift(); emit('fireOut', { fire: old }); }
    const life = EF.ground.life[spot.kind];
    const fi = { kind: spot.kind, x: spot.x, z: spot.z, y, r: EF.ground.radius[spot.kind], left: life, life, owner, id: Math.random() };
    fires.push(fi);
    emit('fireSpread', { fire: fi });
  }
  /** 毎フレーム：溜まりが減る・燃える・火炎・雷痺・地面の火 */
  function updateAilments(f, dt) {
    const st = f.ail;
    if (st) {
      for (const el of AIL_KEYS) {
        const E = ELEMENTS[el];
        st[`${el}T`] = (st[`${el}T`] || 0) + dt;
        if (st[el] > 0 && st[`${el}T`] > E.decayDelay) st[el] = Math.max(0, st[el] - E.decay * dt);
      }
    }
    // 濡・重・崩の残り（眩は f.blind。game/miracles.js が減らす）
    for (const [key, el] of [['wet', 'water'], ['heavy', 'earth'], ['broken', 'wind']]) {
      if (!(f[key] > 0)) continue;
      f[key] = Math.max(0, f[key] - dt);
      if (f[key] <= 0) emit('ailmentEnd', { fighter: f, el });
    }
    // 水に触れると、燃えているのも火炎も消える
    if (f.waterDepth > 0.1) {
      if (f.burn) { f.burn = null; emit('extinguish', { fighter: f }); }
      if (f.blaze) endBlaze(f, 'water');
      if (st) st.fire = 0;
    }
    if (f.paralyzed > 0) {
      f.paralyzed = Math.max(0, f.paralyzed - dt);
      if (f.paralyzed <= 0) emit('paralysisEnd', { fighter: f });
    }
    const B = f.blaze;
    if (!B) return;
    B.left -= dt;
    burnHurt(f, EF.blazeDps * dt, B.by);
    if (!f.alive) return;
    // 草・木に触れると火が移る（燃やした本人には、その火は効かない）
    B.spread -= dt;
    if (B.spread <= 0 && flammable) {
      B.spread = EF.ground.every;
      const spot = flammable(f.x, f.z);
      if (spot) kindle(spot, yOf(f), B.by);
    }
    if (B.left <= 0) {
      // 消せなかった：焦げて倒れる（教練の自分は倒れない）
      const by = B.by;
      endBlaze(f, 'burnt');
      lethal(f, by && by !== f ? by : null, 'charred');
    }
  }
  /** 地面の火：触れた人を燃やし、火炎を溜める（燃やした本人には効かない）。時間が来たら消える */
  function updateFires(dt) {
    for (let i = fires.length - 1; i >= 0; i--) {
      const fi = fires[i];
      fi.left -= dt;
      if (fi.left <= 0) { fires.splice(i, 1); emit('fireOut', { fire: fi }); }
    }
    if (!fires.length) return;
    // 火に触れている人：重なった火に触れていても、1 つ分だけ燃える
    for (const t of fighters) {
      if (!t.alive || t.hidden || t.blaze) continue;
      const fi = fires.find((q) => q.owner !== t && Math.hypot(t.x - q.x, t.z - q.z) <= q.r + COMBAT.bodyRadius && Math.abs(yOf(t) - q.y) <= 2.5);
      if (!fi) continue;
      burnHurt(t, EF.ground.dps * dt, fi.owner);
      if (!t.alive) continue;
      slip(t, fi.owner);
      afflict(t, 'fire', EF.ground.buildup * dt, fi.owner);
    }
  }

  /**
   * 必殺技を始める（利用者の指示 2026-11-25。game/ultimate.js）：していたこと（攻撃・溜め・弓など）は取りやめ、必殺技の動きに入る。
   * 必殺技の間は無敵（f.invuln。終わった後も ULTIMATE.guardAfter 秒）。見た目と音は 'ult' の知らせで出す（自分なら寄るカメラと名前）
   */
  function startUlt(f) {
    const U = ultOf(f), B = ULT_BURST, hero = moves.has(f), S = ULT_SPECS[f.char];
    spendUlt(f);
    if (f.cover) cover?.exit(f);
    f.guarding = false;
    interruptTech(f);
    f.ultInfo = U;
    const time = hero ? moves.time(f) : B.time;
    f.action = { kind: 'ult', t: 0, fired: false, hero };
    f.invuln = Math.max(f.invuln || 0, time + ULTIMATE.guardAfter);
    f._press = { at: clock, follow: false, used: true };   // この押下で通常攻撃を出さない
    f._queued = false;
    if (hero) moves.start(f, f.action);
    // at：力が放たれる時刻（溜めの音・寄るカメラの切り替え）。英雄ごとの技は ULT_SPECS
    const at = hero ? (S.at ?? S.release ?? S.flash?.at ?? B.at) : B.at;
    emit('ult', { fighter: f, ult: U, time, at, hero, spec: hero ? S : null });
  }

  /**
   * 仮の必殺技（1 回目。どの英雄も同じ）：属性の衝撃波。周りの人に傷（物理ではない：楯で受けても半分は通る）を与え、
   * 外へ吹き飛ばす（近いほど強く遠く）。光・衝撃波・粒と音は 'ultBurst' の知らせで出す。2 回目で英雄ごとの技に替える
   */
  function ultBurst(f) {
    const fy = yOf(f), B = ULT_BURST, U = ultOf(f);
    let hits = 0;
    for (const t of fighters) {
      if (t === f || !t.alive || t.hidden) continue;
      const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz);
      if (d > B.radius || Math.abs(yOf(t) - fy) > 4) continue;
      if (t.invuln > 0) continue;   // 相手も必殺技の最中（無敵）・蘇ったばかり
      const k = 1 - d / B.radius;
      if (t.cover) cover?.exit(t);
      damage(t, B.damage * (B.minK + (1 - B.minK) * k), f, { fromX: f.x, fromZ: f.z, kind: 'ult', power: 'h', physical: false });
      if (!t.alive) continue;
      hits++;
      knock(t, f.x, f.z, B.pushMin + (B.push - B.pushMin) * k, B.stun * (0.6 + 0.4 * k), 0.9 + 0.4 * k);   // 吹き飛ぶ
    }
    emit('ultBurst', { fighter: f, ult: U, x: f.x, y: fy, z: f.z, radius: B.radius, hits });
  }

  /**
   * 楯の技が当たる（楯擊・楯押）：前の、間合いと角度に入っている相手に。
   *   楯擊は少し傷を与えて重い被弾でひるませる（防禦されれば強い受け）。楯押は傷は無く、防禦の上からでも押し返してよろめかせる
   */
  function shieldStrike(f, S) {
    const fy = yOf(f);
    let hits = 0;
    for (const t of fighters) {
      if (t === f || !t.alive || t.hidden || LOCKED.has(t.action?.kind)) continue;
      const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz);
      if (d > S.reach + COMBAT.bodyRadius || Math.abs(yOf(t) - fy) > 1.6) continue;
      if (d > 0.6 && angleTo(f.yaw, dx, dz) > S.arc / 2) continue;
      hits++;
      if (S.push) shieldPush(t, f, S);
      else damage(t, S.damage, f, { fromX: f.x, fromZ: f.z, power: S.power || 'l', kind: 'shield' });
    }
    emit('shieldStrike', { fighter: f, skill: S, hits });
  }
  /** 楯押：押し返して体勢を崩す（よろめく）。していたことは取りやめになる。回避の、攻撃が当たらない間だけは押されない */
  function shieldPush(t, f, S) {
    if (match.state !== 'running') return;
    const a = t.action;
    if (a?.kind === 'dodge') {
      const d = DODGE[t.weight];
      if (a.t >= d.invuln[0] && a.t <= d.invuln[1]) { emit('dodged', { attacker: f, target: t }); return; }
    }
    if (t.invuln > 0) return;   // 必殺技の間・蘇ったばかり：押されない
    if (firm(t)) { t.lastHitBy = f; emit('shieldPushed', { attacker: f, target: t }); return; }   // 水の衣・岩の鎧：崩れない
    if (t.cover) cover?.exit(t);
    t.guarding = false;
    if (a && ['attack', 'charge', 'charge2', 'shield', 'draw', 'release', 'finisher', 'hideIn', 'hideOut', 'search'].includes(a.kind)) t.action = null;
    interruptTech(t);
    startReact(t, 'stagger', f.x, f.z);
    t.react.push = S.push;          // よろめきの動きより遠くへ押し返す（見た目は render/character-view.js が合わせる）
    t.react.time = S.pushTime;
    t.lastHitBy = f;
    emit('shieldPushed', { attacker: f, target: t });
  }

  /** 致命の一撃・暗殺：一撃で倒す */
  function lethal(target, attacker, how) {
    if (!target.alive || match.state !== 'running') return;
    // 教練の自分（deathless）：倒れない。体力を戻し、「やられた」ことだけ知らせる（暗殺避けの教練でやり直せるように）
    if (target.deathless) {
      target.stats.hp = target.stats.maxHp;
      target.hitFlash = 0.25;
      emit('spared', { attacker, target, how });
      return;
    }
    if (target.invuln > 0) return;
    const amount = target.stats.hp;
    if (revive(target, attacker, how)) return;   // 蘇生の加護があれば、一度だけ蘇る
    if (target.blaze) endBlaze(target, 'gone');
    target.stats.hp = 0;
    target.hitFlash = 0.25;
    target.action = null; target.helpless = 0;
    emit('hit', { attacker, target, amount, guarded: false, kind: how });
    emit('lethal', { attacker, target, how });
    match.eliminate(target, attacker);
  }
  /**
   * 蘇生の加護（奇跡）があれば、倒れずに光の中から蘇る（体力 MIRACLES.revive.hp の割合。蘇る動きの間とその後しばらく、傷を受けない）。
   * 蘇ったら true。教練の自分（deathless）は使わない（教練では倒れない）
   */
  function revive(t, by, how = 'hit') {
    if (!(t.blessing > 0) || t.deathless) return false;
    const R = MIRACLES.revive;
    t.blessing = 0;
    if (t.miracle) t.miracle.cool.revive = R.cd;
    t.stats.hp = Math.max(1, Math.round(t.stats.maxHp * R.hp));
    t.burn = null;
    if (t.blaze) endBlaze(t, 'heal');
    t.paralyzed = 0;
    if (t.ail) for (const k of AIL_KEYS) t.ail[k] = 0;
    t.wet = 0; t.heavy = 0; t.broken = 0;
    t.invuln = REVIVE_TIME + R.invuln;
    t.helpless = 0; t.stun = 0; t.guarding = false;
    if (t.react) t.react.time = 0;
    if (t.hidden) hiding?.exit(t);
    if (t.cover) cover?.exit(t);
    resetStance(t);
    t.action = { kind: 'revive', t: 0 };
    interruptTech(t);
    emit('revived', { fighter: t, by, how });
    return true;
  }

  /** 燃えている傷（淨炎）。体力が尽きれば倒れる（蘇生の加護があれば蘇る） */
  function burnHurt(t, n, byWho = undefined) {
    if (!t.alive || t.invuln > 0 || match.state !== 'running') return;
    t.stats.hp -= n;
    if (t.stats.hp > 0) return;
    const by = byWho !== undefined ? byWho : t.burn?.by || null;
    if (t.blaze) endBlaze(t, 'gone');
    if (revive(t, by, 'burn')) return;
    t.stats.hp = 0;
    t.action = null; t.guarding = false;
    emit('hit', { attacker: by, target: t, amount: n, guarded: false, kind: 'burn' });
    match.eliminate(t, by && by !== t ? by : null);
  }

  // ---- 光壁（奇跡）----
  /** (ax, az) → (bx, bz) の線が、光壁を横切るか（高さ y で）。横切る壁を返す（owner の壁は通す） */
  function wallBetween(ax, az, bx, bz, y, owner) {
    for (const w of walls) {
      if ((w.owner === owner && !w.solid) || w.left <= 0) continue;   // 光壁は張った人の攻撃を通す。岩壁（操）は誰の攻撃も止める
      if (y < w.y - 0.3 || y > w.y + w.height) continue;
      // 壁の線：真ん中 (w.x, w.z) から、壁の向き（右へ）に ±half
      const rx = Math.cos(w.yaw * DEG), rz = -Math.sin(w.yaw * DEG);
      const sx = bx - ax, sz = bz - az;
      const den = sx * rz - sz * rx;
      if (Math.abs(den) < 1e-6) continue;
      const qx = w.x - ax, qz = w.z - az;
      const u = (qx * rz - qz * rx) / den;            // 攻めの線の上の割合（0〜1）
      const v = (qx * sz - qz * sx) / den;            // 壁の上の位置（真ん中から m。右が正）
      if (u > 0 && u < 1 && Math.abs(v) <= w.half) return w;
    }
    return null;
  }
  /** 光壁が受け止める。受け止められる傷を超えたら砕ける */
  function hitWall(w, amount, attacker, fromX, fromZ, target = null) {
    w.guard -= amount;
    // 当たった所（壁の線の上で、攻めた所にいちばん近い点）
    const rx = Math.cos(w.yaw * DEG), rz = -Math.sin(w.yaw * DEG);
    const v = Math.max(-w.half, Math.min(w.half, (fromX - w.x) * rx + (fromZ - w.z) * rz));
    emit('wallHit', { wall: w, attacker, target, amount, x: w.x + rx * v, z: w.z + rz * v, y: w.y + 1.2 });
    if (w.guard <= 0) breakWall(w, true);
  }
  function breakWall(w, broke) {
    const i = walls.indexOf(w);
    if (i < 0) return;
    walls.splice(i, 1);
    w.left = 0;
    // 岩壁（操）：人を止める円と、目・カメラをさえぎる箱を外す
    if (w.obs) for (const o of w.obs) o.off = true;
    if (w.box) w.box.off = true;
    emit('wallEnd', { wall: w, broke });
  }

  /** 奇跡の効き目（唱える動きの at 秒に出る） */
  function castMiracle(f, id) {
    const M = MIRACLES[id];
    startCool(f, id);
    if (id === 'heal') {
      const before = f.stats.hp;
      f.stats.hp = Math.min(f.stats.maxHp, f.stats.hp + f.stats.maxHp * M.amount);
      f.burn = null;
      if (f.blaze) endBlaze(f, 'heal');   // 治癒は火炎も消す（溜まった炎も消える）
      if (f.ail) f.ail.fire = 0;
      emit('miracle', { fighter: f, id, amount: f.stats.hp - before });
    } else if (id === 'revive') {
      f.blessing = M.life;
      emit('miracle', { fighter: f, id });
    } else if (id === 'flame') {
      f.flame = M.life;
      emit('miracle', { fighter: f, id });
    } else if (id === 'wall') {
      // 前の壁は消える（1 人 1 枚）
      for (const w of [...walls]) if (w.owner === f) breakWall(w, false);
      const rad = f.yaw * DEG, x = f.x - Math.sin(rad) * M.ahead, z = f.z - Math.cos(rad) * M.ahead;
      const w = { owner: f, x, z, y: floorAt(x, z, yOf(f)), yaw: f.yaw, half: M.width / 2, height: M.height, left: M.life, life: M.life,
        guard: M.guard, id: Math.random() };
      walls.push(w);
      emit('miracle', { fighter: f, id, wall: w });
      emit('wallUp', { wall: w });
    } else if (id === 'pillar') {
      // 天光柱：前の敵のまわり（いなければ前の決まった所）に、光の柱を何本もばらばらに降らせる。1 本目は狙った敵の所
      const t = aimTarget(f, M.range, 35), rad = f.yaw * DEG;
      const plan = { owner: f, target: t, cx: t ? t.x : f.x - Math.sin(rad) * M.center, cz: t ? t.z : f.z - Math.cos(rad) * M.center };
      for (let i = 0; i < M.count; i++) strikes.push({ owner: f, plan, at: (i / M.count) * M.dur + Math.random() * 0.12, t: 0, warned: false, first: i === 0, x: 0, y: 0, z: 0 });
      emit('miracle', { fighter: f, id, x: plan.cx, z: plan.cz, target: t });
    } else if (id === 'fireball' || id === 'thunder') {
      // 聖火彈・神罰雷：左手（護符）の前から放つ。神罰雷は見ている上下の向きも使う。聖火彈は前の敵を追う
      const rad = f.yaw * DEG, fx = -Math.sin(rad), fz = -Math.cos(rad), rx = Math.cos(rad), rz = -Math.sin(rad);
      const x = f.x + fx * 0.7 - rx * 0.25, y = yOf(f) + 1.45, z = f.z + fz * 0.7 - rz * 0.25;
      const pitch = Math.max(-25, Math.min(25, f.pitch || 0)) * DEG * (id === 'fireball' ? 0.4 : 1);
      const dx = fx * Math.cos(pitch), dy = Math.sin(pitch), dz = fz * Math.cos(pitch);
      const sp = { kind: id, owner: f, x, y, z, vx: dx * M.speed, vy: dy * M.speed, vz: dz * M.speed, id: Math.random(),
        life: id === 'fireball' ? M.life : M.range / M.speed, target: id === 'fireball' ? aimTarget(f, M.seek, 50) : null };
      spells.push(sp);
      emit('miracle', { fighter: f, id, spell: sp });
    }
  }

  /** f が狙う相手：range m 以内・前から half 度の中の、一番近い人（隠れている人は狙わない）。いなければ null */
  function aimTarget(f, range, half) {
    let best = null, bd = range;
    const fy = yOf(f);
    for (const t of fighters) {
      if (t === f || !t.alive || t.hidden) continue;
      const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz);
      if (d < bd && Math.abs(yOf(t) - fy) < 5 && angleTo(f.yaw, dx, dz) <= half) { bd = d; best = t; }
    }
    return best;
  }

  /** 吹き飛ばす（聖火彈の爆発）：していたことを取りやめ、よろめいて外へ下がる。必殺技の間・蘇ったばかりの人は動かない */
  function blowAway(t, fromX, fromZ, push, stun) { knock(t, fromX, fromZ, push, stun, 0.9); }
  /** 吹き飛ばす（必殺技・聖火彈）：push m 外へ、time 秒かけて下がり、stun 秒ひるむ。水の衣・岩の鎧はひるまない（吹き飛ばない） */
  function knock(t, fromX, fromZ, push, stun, time = 0.9) {
    if (!t.alive || t.invuln > 0 || firm(t) || t.heavy > 0) return;   // 不動（組み合わせ）：重い間は吹き飛ばされない
    if (t.cover) cover?.exit(t);
    const ta = t.action;
    if (ta && !LOCKED.has(ta.kind)) t.action = null;
    t.guarding = false;
    interruptTech(t);
    startReact(t, 'stagger', fromX, fromZ);
    t.react.push = push;
    t.react.time = time;
    t.stun = Math.max(t.stun, stun);
  }

  /** 聖火彈の爆発：周りの人に傷（近いほど大きい。楯では防げない）、外へ吹き飛ばし、燃やす */
  function fireballBoom(sp) {
    const M = MIRACLES.fireball, owner = sp.owner;
    let hits = 0;
    for (const t of fighters) {
      if (t === owner || !t.alive || t.hidden) continue;
      const d = Math.hypot(t.x - sp.x, (yOf(t) + 1) - sp.y, t.z - sp.z);
      if (d > M.radius) continue;
      const k = 1 - d / M.radius;
      const guarded = guardsFront(t, sp.x, sp.z);
      if (!elementHit(t, owner, 'fire', M.damage * (M.minK + (1 - M.minK) * k), M.buildup * k, { fromX: sp.x, fromZ: sp.z, kind: 'fireball', power: 'h' })) continue;
      hits++;
      afflict(t, 'holy', holyMark(owner), owner);   // 聖化（祓魔僧の操）：攻める奇跡が当たると眩が溜まる
      if (!guarded && !(t.paralyzed > 0)) blowAway(t, sp.x, sp.z, M.pushMin + (M.push - M.pushMin) * k, 0.8 + 0.5 * k);   // 楯で受けたら吹き飛ばない
    }
    emit('fireballBoom', { x: sp.x, y: sp.y, z: sp.z, gy: floorAt(sp.x, sp.z, sp.y), owner, hits });
  }

  /** 飛ばす奇跡を 1 歩進める。続くなら true */
  function stepSpell(sp, dt) {
    const M = MIRACLES[sp.kind], owner = sp.owner;
    sp.life -= dt;
    if (sp.life <= 0) { if (sp.kind === 'fireball') fireballBoom(sp); else emit('thunderHit', { x: sp.x, y: sp.y, z: sp.z, spell: sp }); return false; }
    // 聖火彈：狙った相手の胸へ向けて、1 秒に turn 度まで曲がる
    const t = sp.target;
    if (sp.kind === 'fireball' && t?.alive && !t.hidden) {
      const tx = t.x - sp.x, ty = yOf(t) + 1.1 - sp.y, tz = t.z - sp.z, tl = Math.hypot(tx, ty, tz) || 1;
      const sl = Math.hypot(sp.vx, sp.vy, sp.vz) || 1;
      const ux = sp.vx / sl, uy = sp.vy / sl, uz = sp.vz / sl, wx = tx / tl, wy = ty / tl, wz = tz / tl;
      const ang = Math.acos(Math.max(-1, Math.min(1, ux * wx + uy * wy + uz * wz)));
      const k = ang > 1e-4 ? Math.min(1, (M.turn * DEG * dt) / ang) : 1;
      let nx = ux + (wx - ux) * k, ny = uy + (wy - uy) * k, nz = uz + (wz - uz) * k;
      const nl = Math.hypot(nx, ny, nz) || 1;
      sp.vx = (nx / nl) * M.speed; sp.vy = (ny / nl) * M.speed; sp.vz = (nz / nl) * M.speed;
    }
    const ox = sp.x, oy = sp.y, oz = sp.z;
    sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.z += sp.vz * dt;
    // 光壁に当たる：壁が受け止める（聖火彈はその場で爆発する）
    const w = walls.length ? wallBetween(ox, oz, sp.x, sp.z, sp.y, owner) : null;
    if (w) {
      hitWall(w, M.damage * (owner ? owner.stats.attack : 1), owner, ox, oz);
      sp.x = ox; sp.y = oy; sp.z = oz;
      if (sp.kind === 'fireball') fireballBoom(sp); else emit('thunderHit', { x: ox, y: oy, z: oz, spell: sp, wall: true });
      return false;
    }
    // 旋風（弓兵の操）：飛ぶ奇跡をそらす（横へ曲がり、もう追わない。旋風の人には当たらない）
    const gv = !sp.galeBy && ctrl.galeAt(sp.x, sp.y, sp.z, owner);
    if (gv) {
      sp.galeBy = gv;
      sp.target = null;
      turnAside(sp, gv);
      emit('galeDeflect', { fighter: gv, x: sp.x, y: sp.y, z: sp.z, spell: sp });
    }
    // 人に当たる：線分（前の位置 → 今の位置）と、体の円柱（聖火彈は少し太い）
    const R = COMBAT.bodyRadius + (sp.kind === 'fireball' ? 0.25 : 0.05);
    for (const v of fighters) {
      if (v === owner || v === sp.galeBy || !v.alive || v.hidden) continue;
      const g = yOf(v);
      if (sp.y < g - 0.2 || sp.y > g + stanceShape(v).height + 0.2) continue;
      const sx = sp.x - ox, sz = sp.z - oz, len2 = sx * sx + sz * sz || 1e-6;
      const kk = Math.max(0, Math.min(1, ((v.x - ox) * sx + (v.z - oz) * sz) / len2));
      if (Math.hypot(ox + sx * kk - v.x, oz + sz * kk - v.z) > R) continue;
      // 水の衣（大海嘯の後）：飛ぶ奇跡（聖火彈・神罰雷）も弾く（水に呑まれて消える）
      if (v.aura?.kind === 'water') { emit('deflect', { target: v, x: sp.x, y: sp.y, z: sp.z, spell: sp }); return false; }
      if (sp.kind === 'fireball') { fireballBoom(sp); return false; }
      // 神罰雷：雷の傷・少ししびれる・雷痺を溜める（楯で前から受けると、傷も溜まりも半分で、しびれない）
      if (elementHit(v, owner, 'thunder', M.damage, M.buildup, { fromX: ox, fromZ: oz, kind: 'thunder', power: 'h' })) afflict(v, 'holy', holyMark(owner), owner);
      emit('thunderHit', { x: sp.x, y: sp.y, z: sp.z, spell: sp, target: v });
      return false;
    }
    // 木・岩・壁・地面に当たる
    const ground = floorAt(sp.x, sp.z, sp.y);
    // 地上の木・岩には、地上を飛ぶ物だけが当たる（地下の洞窟の中では、真上の木の幹に当たらない。2026-11-21）
    const gh = heightAt(sp.x, sp.z);
    const blocked = sp.y <= ground + (sp.kind === 'fireball' ? 0.3 : 0.05) || (obstacles.isFree(sp.x, sp.z, 0.12, true) === false && sp.y < gh + 8 && sp.y > gh - 2.5)
      || Math.hypot(sp.x, sp.z) > match.areaRadius + 0.5;
    if (blocked) {
      if (sp.kind === 'fireball') { sp.y = Math.max(sp.y, ground + 0.3); fireballBoom(sp); }
      else emit('thunderHit', { x: sp.x, y: Math.max(sp.y, ground), z: sp.z, spell: sp });
      return false;
    }
    return true;
  }

  /** 天光柱を進める：降る少し前に地面に光の輪（知らせ）、時刻が来たら光の柱が降って、半径の中の人に傷と目くらまし */
  function stepStrike(s, dt) {
    const M = MIRACLES.pillar, P = s.plan, owner = s.owner;
    s.t += dt;
    if (!s.warned && s.t >= s.at) {
      // 降る所を決める：狙った敵を追って真ん中を寄せる。1 本目はその敵の所。ほかは真ん中のまわりにばらばら
      const tgt = P.target?.alive && !P.target.hidden ? P.target : null;
      if (tgt) { P.cx += (tgt.x - P.cx) * 0.5; P.cz += (tgt.z - P.cz) * 0.5; }
      const a = Math.random() * Math.PI * 2, r = s.first ? 0 : Math.sqrt(Math.random()) * M.spread;
      s.x = (s.first && tgt ? tgt.x : P.cx) + Math.cos(a) * r;
      s.z = (s.first && tgt ? tgt.z : P.cz) + Math.sin(a) * r;
      s.y = floorAt(s.x, s.z, tgt ? yOf(tgt) + 0.5 : yOf(owner) + 0.5);
      s.warned = true;
      emit('pillarWarn', { x: s.x, y: s.y, z: s.z, time: M.warn, owner, radius: M.radius });
    }
    if (!s.warned || s.t < s.at + M.warn) return true;
    let hits = 0;
    for (const t of fighters) {
      if (t === owner || !t.alive || t.hidden) continue;
      if (Math.hypot(t.x - s.x, t.z - s.z) > M.radius + COMBAT.bodyRadius || Math.abs(yOf(t) - s.y) > 3) continue;
      const before = t.stats.hp;
      damage(t, M.damage, owner, { fromX: s.x, fromZ: s.z, kind: 'pillar', power: 'l', physical: false });
      if (!t.alive || t.stats.hp >= before) continue;
      hits++;
      afflict(t, 'holy', holyMark(owner), owner);   // 聖化：目がくらむ前に眩を溜める
      t.blind = Math.max(t.blind || 0, M.blind);
      emit('blinded', { fighter: t, time: M.blind, by: owner });
    }
    emit('pillarStrike', { x: s.x, y: s.y, z: s.z, owner, hits, radius: M.radius });
    return false;
  }

  /**
   * 暗殺の傷（利用者の指示 2026-11-18）：一撃で倒さず、体力の上限の割合を削る（後ろから 6 割・前と横から 2 割 5 分）。
   * 残りの体力がそれより少なければ倒れる。生き残った相手は、される動きの後で起き上がる（getup）。教練の自分は今までどおり「やられた」
   */
  function assassinWound(t, f, back) {
    if (!t.alive) return;
    if (t.deathless) { lethal(t, f, 'assassinate'); return; }
    if (t.invuln > 0) return;
    const blindHit = !back && t.blind > 0;   // 盲撃（組み合わせ）：目がくらんでいる相手には、前・横からも後ろと同じ傷
    if (blindHit) emit('combo', { fighter: t, by: f, combo: 'blind' });
    const cut = t.stats.maxHp * (back || blindHit ? ASSASSIN.cut.back : ASSASSIN.cut.front);
    if (t.stats.hp <= cut + 0.01) { lethal(t, f, 'assassinate'); return; }
    t.stats.hp -= cut;
    t.hitFlash = 0.25;
    t.lastHitBy = f;
    if (t.action?.kind === 'assassinated') t.action.struck = true;   // 倒れる動きまで見せてから、起き上がる
    emit('hit', { attacker: f, target: t, amount: cut, guarded: false, kind: 'assassinate', wound: true, back });
  }

  /** f の近く（reach 以内・同じ高さ）にいる相手のうち、条件に合う一番近い人 */
  function nearestFoe(f, reach, test = () => true) {
    let best = null, bd = reach;
    const fy = yOf(f);
    for (const t of fighters) {
      if (t === f || !t.alive || t.hidden || !test(t)) continue;
      const d = Math.hypot(t.x - f.x, t.z - f.z);
      if (d < bd && Math.abs(yOf(t) - fy) < 1.3) { bd = d; best = t; }
    }
    return best;
  }
  const faceTo = (f, t) => { f.yaw = (Math.atan2(-(t.x - f.x), -(t.z - f.z)) * 180) / Math.PI; };
  // 暗殺（game/assassin.js）：暗殺ボタンで、近くの相手を一撃で倒す
  const assassin = createAssassin({ fighters, senses, yOf, move: (f, dx, dz) => shove(f, dx, dz), lethal, wound: assassinWound, emit });
  // タンス・ベッドに隠れる・出る・探す動きと、見つけたら引きずり出して止め（game/hide-acts.js）
  const acts = hiding ? createHideActs({ hiding, move: (f, dx, dz) => shove(f, dx, dz), lethal, emit }) : null;
  const LOCKED = new Set(['assassinate', 'assassinated', 'hideIn', 'hideOut', 'search', 'drag', 'dragged', 'ult', 'revive', 'getup']);   // している間はほかのことができない（必殺技の間も）
  /** 押されて動く（木や岩・壁を避け、歩ける範囲の中・床の高さへ）。実際に動いた分を返す */
  const shove = (f, dx, dz) => {
    const ox = f.x, oz = f.z;
    // 大きく動くとき（必殺技で吹き飛ぶ）は、壁を通り抜けないように 0.25 m ずつ動かして、そのたびに押し戻す
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
    for (let i = 0; i < n; i++) {
      f.x += dx / n; f.z += dz / n;
      obstacles.resolve(f, BODY_RADIUS);
    }
    keepInside(f, match.areaRadius);
    if (!f.falling) f.y = floorAt(f.x, f.z, f.y);   // 落ちている間（天坑）は、床へ飛ばさない
    return [f.x - ox, f.z - oz];
  };

  /**
   * 必殺技の後に纏う物（f.aura：{ kind, left, time }）を進める。雷の衣は、回避・疾驅の間に every 秒ごとに自分へ落雷（周りの敵に傷）。
   * 鷹の目（f.hawkEye：残りの秒）もここで減らす
   */
  function updateAura(f, dt) {
    if (f.hawkEye > 0) f.hawkEye = Math.max(0, f.hawkEye - dt);
    const A = f.aura;
    if (!A) return;
    A.left -= dt;
    if (A.left <= 0) { f.aura = null; emit('auraEnd', { fighter: f, aura: A }); return; }
    if (A.kind === 'holy') f.stats.hp = Math.min(f.stats.maxHp, f.stats.hp + f.stats.maxHp * ULT_SPECS.cleric.aura.heal * dt);   // 光輪：少しずつ癒える
    if (A.kind === 'thunder' && (f.action?.kind === 'dodge' || f.sprinting)) {
      A.tick -= dt;
      if (A.tick <= 0) { A.tick = ULT_SPECS.sword.aura.every; auraStrike(f); }
    }
  }
  /** 雷の衣：自分へ落雷。周りの敵に雷の傷と、雷痺を少し溜める（自分には効かない） */
  function auraStrike(f) {
    const R = ULT_SPECS.sword.aura, fy = yOf(f);
    let hits = 0;
    for (const t of fighters) {
      if (t === f || !t.alive || t.hidden || t.invuln > 0) continue;
      if (Math.hypot(t.x - f.x, t.z - f.z) > R.radius || Math.abs(yOf(t) - fy) > 2.5) continue;
      if (elementHit(t, f, 'thunder', R.damage, 25, { fromX: f.x, fromZ: f.z, kind: 'ult', power: 'l' })) hits++;
    }
    emit('auraStrike', { fighter: f, x: f.x, y: fy, z: f.z, radius: R.radius, hits });
  }

  // 英雄ごとの必殺技（game/ult-moves.js。2 回目。まだ無い英雄は仮の ultBurst）
  const moves = createUltMoves({
    fighters, match, yOf, floorAt, obstacles, sight, keepInside, shove,
    damage, afflict, knock, emit, launch, pin, elementHit,
    paralyze: (t, by, secs) => startParalysis(t, by, secs),
    kindle: (spot, y, owner) => kindle(spot, y, owner),
    addProjectile: (p) => projectiles.push(p),
  });
  // 操（属性強化の 2 段目。game/controls.js。2026-11-28）
  const ctrl = createControls({
    fighters, yOf, floorAt, obstacles, sight, shove, walls, breakWall,
    elementHit, afflict, knock, fan, guardsFront, emit,
    kindle: (spot, y, owner) => kindle(spot, y, owner),
  });

  /** 近接の当たり判定：間合いと角度に入っている、ほかの全員に当たる */
  function meleeHit(f, w) {
    const fy = yOf(f);
    let hits = 0;
    for (const t of fighters) {
      if (t === f || !t.alive || t.hidden) continue;
      const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz);
      if (d > w.reach + COMBAT.bodyRadius) continue;
      if (Math.abs(yOf(t) - fy) > 1.6) continue;
      if (d > 0.6 && angleTo(f.yaw, dx, dz) > w.arc / 2) continue;
      damage(t, w.damage, f, { pierce: w.guardPierce, fromX: f.x, fromZ: f.z, power: w.power || 'l' });
      enchantHit(t, f, w.damage, f.x, f.z);   // 纏（属性強化）：武器に纏った属性の傷と溜まり
      hits++;
    }
    // 振り終わり：誰にも当たらなければ、前に木の幹や壁があるか（当たった音を変える）
    let blocked = false;
    if (!hits) {
      const yaw = f.yaw * DEG, r = w.reach * 0.75;
      const bx = f.x - Math.sin(yaw) * r, bz = f.z - Math.cos(yaw) * r;
      blocked = (f.y === undefined || f.y > heightAt(bx, bz) - 2.5) && !obstacles.isFree(bx, bz, 0.15, true);   // 地下では地上の物に当てない
    }
    emit('strike', { fighter: f, weapon: f.weapon, hits, blocked });
  }

  /** 矢を放つ。power：引いた割合（0〜1） */
  function fire(f, w, power) {
    const yaw = f.yaw * DEG, pitch = (f.pitch || 0) * DEG;
    // 貫く矢（f.pierceArrow が付いているときの 1 本）：人も木も壁も貫く（傷 2 倍・防禦できない。速く飛ぶ）。
    // 前は鷹目で使った。2 回目で弓兵の必殺技「颶風一矢」の大きな矢に使う
    const piercing = !!f.pierceArrow;
    f.pierceArrow = false;
    const H = PIERCE_ARROW;
    const speed = w.speed * (0.45 + 0.55 * power) * (piercing ? H.speed : 1);
    const dir = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const p = {
      owner: f,
      x: f.x + dir[0] * 0.5, y: yOf(f) + 1.5, z: f.z + dir[2] * 0.5,
      vx: dir[0] * speed, vy: dir[1] * speed, vz: dir[2] * speed,
      damage: w.damage * (0.35 + 0.65 * power) * (piercing ? H.damage : 1),
      power: piercing || power >= 0.9 ? 'h' : 'l',   // 引き切った矢は重い一撃
      life: piercing ? H.life : 5,
      pierce: piercing, struck: piercing ? new Set() : null,   // 貫く矢：当たった人（同じ人には 1 度だけ）
      x0: f.x + dir[0] * 0.5, y0: yOf(f) + 1.5, z0: f.z + dir[2] * 0.5,   // 放った所（貫く矢が最初の一歩で通り抜けた壁にも穴を開ける）
      stuck: 0,               // 刺さってからの時間（見た目用。刺さった矢は少し残す）
      id: Math.random(),
    };
    projectiles.push(p);
    emit('fire', { fighter: f, projectile: p });
  }

  /** 旋風でそらす：飛ぶ物 o の向きを、旋風の人 g から外れる横向きへ曲げる（少し遅くなる） */
  function turnAside(o, g) {
    const sp = Math.hypot(o.vx, o.vz) || 1;
    const ax = o.x - g.x, az = o.z - g.z, al = Math.hypot(ax, az) || 1;
    // 渦の向き（反時計回り）に流しながら、外へ
    const tx = -az / al, tz = ax / al;
    const side = tx * o.vx + tz * o.vz >= 0 ? 1 : -1;
    const nx = tx * side * 0.8 + (ax / al) * 0.6, nz = tz * side * 0.8 + (az / al) * 0.6, nl = Math.hypot(nx, nz) || 1;
    o.vx = (nx / nl) * sp * 0.6; o.vz = (nz / nl) * sp * 0.6;
  }

  function stepProjectile(p, dt) {
    if (p.stuck) { p.stuck += dt; return p.stuck < 6; }
    p.life -= dt;
    if (p.life <= 0) return false;
    const ox = p.x, oz = p.z;
    if (!p.straight) p.vy -= COMBAT.gravity * dt;   // 嵐の大矢（颶風一矢）はまっすぐ飛ぶ
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    // 光壁（奇跡）に当たると、壁が受け止める（貫く矢は通り抜ける）
    if (!p.pierce && walls.length) {
      const w = wallBetween(ox, oz, p.x, p.z, p.y, p.owner);
      if (w) {
        hitWall(w, p.damage * (p.owner ? p.owner.stats.attack : 1), p.owner, ox, oz);
        emit('projectileBlocked', { projectile: p, wall: w });
        return false;
      }
    }
    // 旋風（弓兵の操）：ふつうの矢はそらされて、誰にも当たらない（貫く矢・嵐の大矢はそらせない）
    if (!p.pierce && !p.deflected) {
      const g = ctrl.galeAt(p.x, p.y, p.z, p.owner);
      if (g) {
        p.deflected = true;
        turnAside(p, g);
        p.vy = Math.abs(p.vy) * 0.3 + 2;
        emit('galeDeflect', { fighter: g, x: p.x, y: p.y, z: p.z, projectile: p });
        return true;
      }
    }
    // 人に当たる：線分（前の位置 → 今の位置）と、体の円柱
    for (const t of fighters) {
      if (p.deflected) break;   // 水の衣に弾かれた矢は、もう誰にも当たらない
      if (t === p.owner || !t.alive || (t.hidden && !p.pierce)) continue;   // 隠れている人には当たらない（貫く矢は、隠れ場所ごと貫く）
      const g = yOf(t), wide = p.width || 0;
      if (p.y < g - wide * 0.5 || p.y > g + stanceShape(t).height + wide * 0.5) continue;   // しゃがむ・伏せると体が低い（嵐の大矢は太い）
      const sx = p.x - ox, sz = p.z - oz, len2 = sx * sx + sz * sz || 1e-6;
      const k = Math.max(0, Math.min(1, ((t.x - ox) * sx + (t.z - oz) * sz) / len2));
      const lx = ox + sx * k - t.x, lz = oz + sz * k - t.z;
      if (Math.hypot(lx, lz) <= COMBAT.bodyRadius + wide) {
        // 水の衣（大海嘯の後）：ふつうの矢は弾く（跳ね返って落ちる。誰にも当たらない）。貫く矢・嵐の大矢は弾けない（傷は半分）
        if (!p.pierce && t.aura?.kind === 'water') {
          p.deflected = true;
          p.vx = -p.vx * 0.25 + (Math.random() - 0.5) * 6; p.vz = -p.vz * 0.25 + (Math.random() - 0.5) * 6; p.vy = 3 + Math.random() * 2;
          emit('deflect', { target: t, x: p.x, y: p.y, z: p.z, projectile: p });
          return true;
        }
        if (p.pierce) {   // 貫く矢：当たっても止まらず、次の人へ
          if (p.struck.has(t)) continue;
          p.struck.add(t);
          damage(t, p.damage, p.owner, { fromX: ox, fromZ: oz, kind: p.storm ? 'ult' : 'arrow', power: p.power, pierce: 1, through: true, physical: !p.storm });
          // 嵐の大矢：矢の道から横へ吹き飛ばす
          if (p.storm && t.alive && p.push) { const ll = Math.hypot(lx, lz) || 1; knock(t, t.x + (lx / ll) * 2, t.z + (lz / ll) * 2, p.push, 1.0, 0.8); }
          if (p.storm && t.alive) afflict(t, 'wind', ULT_SPECS.archer.arrow.buildup ?? 100, p.owner);   // 嵐の大矢：崩を溜める（③-1）
          else enchantHit(t, p.owner, p.damage, ox, oz);
          emit('projectileHit', { projectile: p, target: t, through: true });
          continue;
        }
        damage(t, p.damage, p.owner, { fromX: ox, fromZ: oz, kind: 'arrow', power: p.power });
        enchantHit(t, p.owner, p.damage, ox, oz);   // 纏（属性強化）：矢にも属性
        emit('projectileHit', { projectile: p, target: t });
        return false;
      }
    }
    // 貫く矢：木・壁・床は通り抜ける（建物に穴が開くのは、建物を壊す仕組みを作るとき）。地面と外周では消える
    // （地下の洞窟の中では、地面ではなく洞窟の床で消える。前は地面の高さで見ていたので、洞窟の中ではすぐ消えていた）
    if (p.pierce) return p.y > floorAt(p.x, p.z, p.y) && Math.hypot(p.x, p.z) <= match.areaRadius + 0.5;
    // 外周の柵（と、その上の見えない壁）：柵の高さまでなら柵に刺さり、それより上は落ちて消える
    if (Math.hypot(p.x, p.z) > match.areaRadius + 0.5) {
      if (p.y < heightAt(p.x, p.z) + 10) { p.stuck = 1e-6; emit('projectileStuck', { projectile: p }); return true; }
      return false;
    }
    // 地面や木の幹に刺さる
    // （地上の木の幹には、地上を飛ぶ矢だけが刺さる。地下の洞窟の中では刺さらない）
    if (p.y <= floorAt(p.x, p.z, p.y) || obstacles.isFree(p.x, p.z, 0.05, true) === false && p.y < heightAt(p.x, p.z) + 8 && p.y > heightAt(p.x, p.z) - 2.5) {
      p.stuck = 0.0001;
      emit('projectileStuck', { projectile: p });
    }
    return true;
  }

  return {
    projectiles,
    walls,
    spells,    // 飛ばす奇跡（見た目は render/miracle-fx.js）
    fires,     // 地面の火（火炎の人が草・木に触れて火が移った所）
    strikes,   // 天光柱の 1 本ずつ
    on(type, fn) { (listeners[type] ||= []).push(fn); },
    // 属性の当たり・状態異常を溜める・吹き飛ばす・暗殺の傷（計算の試験と、③-2 の操の技から使う）
    afflict, elementHit, knock, assassinWound,

    /**
     * 1 人分の入力を受ける（毎フレーム、移動の後に呼ぶ）
     * @param {{attack: boolean, left?: boolean, guard?: boolean, dodge?: boolean, shield?: boolean, moveX?: number, moveY?: number}} input
     *   attack（右手）・left（左手。古い名前の guard でもよい）・dodge は押している間 true。moveX（右）・moveY（前）は回避の向き（移動スティック）
     */
    control(f, input) {
      if (!f.alive) { f.guarding = false; return; }
      let w = WEAPONS[f.weapon];
      const pressed = input.attack && !f._attackHeld;
      const released = !input.attack && f._attackHeld;
      f._attackHeld = input.attack;
      // 左手ボタン：盾持ちは防御（押している間）、ほかは強攻撃、弓兵は近接武器との持ち替え
      const leftHeld = !!(input.left ?? input.guard);
      const leftPressed = leftHeld && !f._leftHeld;
      const leftReleased = !leftHeld && f._leftHeld;
      if (leftPressed) f._leftDownAt = clock;
      f._leftHeld = leftHeld;
      const dodgePressed = input.dodge && !f._dodgeHeld;
      f._dodgeHeld = !!input.dodge;
      const searchPressed = input.search && !f._searchHeld;
      f._searchHeld = !!input.search;
      const assassinPressed = input.assassinate && !f._assassinHeld;
      f._assassinHeld = !!input.assassinate;
      const shieldPressed = input.shield && !f._shieldHeld;   // 楯攻撃ボタン（楯の技 guardAttack をすぐ出す）
      f._shieldHeld = !!input.shield;
      const ultPressed = input.ult && !f._ultHeld;            // 必殺ボタン（game/ultimate.js。PC は G）
      f._ultHeld = !!input.ult;
      const ctrlPressed = input.control && !f._ctrlHeld;      // 操ボタン（game/controls.js。PC は B）
      f._ctrlHeld = !!input.control;
      // 奇跡（祓魔僧。左手ボタンで唱える）：替ボタンで次の奇跡へ（いつでも替えられる）。bot は唱える奇跡の名前（input.miracle）を渡す
      const swapPressed = input.swap && !f._swapHeld;
      f._swapHeld = !!input.swap;
      if (f.left === 'miracle' && swapPressed && cycleMiracle(f)) emit('miracleSelect', { fighter: f, id: selectedMiracle(f) });
      const castWant = f.left === 'miracle' && (leftPressed || !!input.miracle);
      if (input.viewYaw != null) f._viewYaw = input.viewYaw;   // 見ている向き（雷霆一閃は、体に戻った時のカメラの向きへ踏み込む）
      // 暗殺している・されている・隠れる・出る・探す・引きずり出す間は、ほかのことはできない
      if (LOCKED.has(f.action?.kind)) { f.guarding = false; return; }
      // 泳いでいる間は、攻撃・防禦・回避・技能はできない（利用者の指示 2026-11-14：川は泳げる。game/swim.js）。していたことも止まる
      if (f.swimming) { f.guarding = false; if (f.action && f.action.kind !== 'dodge') f.action = null; return; }
      // 落ちている間（天坑の縦穴。game/fall.js）と、梯子に掴まっている間（教会の隠し扉。world/church.js）も、何もできない
      if (f.falling || f.ladder) { f.guarding = false; if (f.action && f.action.kind !== 'dodge') f.action = null; return; }   // 梯子に掴まっている間も
      if (f.stun > 0) { f.guarding = false; if (f.action?.kind === 'draw') f.action = null; return; }
      // 必殺技（利用者の指示 2026-11-25）：1 つの試合で 1 回（延長戰でもう 1 回）。攻撃・溜め・弓を引いている途中からでも出せる。
      // 隠れている間・ひるんでいる間・回避の間・暗殺などの間は出せない（game/ultimate.js の canUlt）。出せなければ 'ultDenied' を知らせる
      if (ultPressed) {
        if (canUlt(f)) { startUlt(f); return; }
        emit('ultDenied', { fighter: f });
      }

      // 暗殺ボタン（攻擊ボタンとは別）：近くに暗殺できる相手がいれば（game/assassin.js）。
      // 隠れ場所・壁裏から飛び出すときだけ（避ける猶予がある。何もない所ではできない）
      if (assassinPressed) {
        const c = assassin.find(f);
        if (c) {
          if (f.hidden) hiding?.exit(f);
          if (f.cover) cover?.exit(f);
          resetStance(f);   // 暗殺の動きは立ってから
          assassin.start(f, c.target, c.grace);
          return;
        }
      }
      // 隠れている：ほかのことはできない（出るのは「出る」ボタン。game/hiding.js）
      if (f.hidden) { f.guarding = false; return; }
      // 壁裏隠れ：壁から離れるのは、暗殺したとき・「離壁」で離れたとき（攻撃を受けたとき・倒れたときも）だけ。
      // 攻撃・左手・回避は、壁に隠れている間は何もしない
      if (f.cover) { f.guarding = false; return; }
      // 姿勢：伏せる・起き上がる途中は何もできない。伏せているときは、攻撃・左手・回避を押すと起き上がる（その押下では何もしない）。
      // しゃがんでいれば、すぐ立って、そのまま攻撃・防御・回避する（game/stance.js）
      if (f.stanceT > 0) { f.guarding = false; return; }
      if (f.stance === 'prone') {
        if (pressed || leftPressed || dodgePressed || shieldPressed || ctrlPressed) setStance(f, 'stand');
        f.guarding = false;
        return;
      }
      if (f.stance === 'crouch' && (pressed || leftPressed || dodgePressed || shieldPressed || ctrlPressed || (leftHeld && f.left === 'guard'))) setStance(f, 'stand');
      // 探す：近くのベッドやタンスを開ける
      if (searchPressed && !f.action && acts) {
        const spot = hiding.nearest(f);
        if (spot && acts.startSearch(f, spot)) return;   // 開けて覗く動きの後で中が見える（game/hide-acts.js）
      }
      // 致命の一撃：無防備な相手（見つけて引きずり出した相手など）が近くにいれば、攻撃ボタンで
      if (pressed && !f.action) {
        const t = nearestFoe(f, FINISH_REACH, (o) => o.helpless > 0);
        if (t) { faceTo(f, t); f.action = { kind: 'finisher', t: 0, target: t }; f.guarding = false; emit('finisherStart', { attacker: f, target: t }); return; }
      }

      // 奇跡を唱える（祓魔僧）：何もしていないときだけ。唱える動きの間は動けず、効き目が出る前に攻撃を受けてひるむと途切れる
      if (castWant) {
        if (input.miracle) selectMiracle(f, input.miracle);
        const id = selectedMiracle(f);
        if (id && !f.action && miracleReady(f, id)) {
          f.action = { kind: 'miracle', t: 0, id, done: false };
          f.guarding = false;
          f.sprinting = false;
          emit('miracleCast', { fighter: f, id });
          return;
        }
        if (id && leftPressed && !f.action && !miracleReady(f, id)) emit('miracleNotReady', { fighter: f, id });   // 待ち時間の間に押した（音で知らせる）
      }

      // 回避：移動スティックの向きへ（倒していなければ後ろへ）。行動中（弓を引いている途中は除く）はできない
      if (f.action?.kind === 'dodge') { f.guarding = false; return; }
      // 操（属性強化の 2 段目）：何もしていない時か、弓を引いている途中から。待ち時間の間は 'controlDenied'
      if (ctrlPressed && hasControl(f)) {
        if (controlReady(f) && (!f.action || f.action.kind === 'draw')) {
          if (f.cover) cover?.exit(f);
          f.guarding = false;
          f.sprinting = false;
          interruptTech(f);
          ctrl.start(f);
          return;
        }
        emit('controlDenied', { fighter: f });
      }
      // 持ち替え（弓兵）：弓を引いている途中でも、すぐに持ち替える
      if (f.left === 'switch' && leftPressed && f.sidearm && (!f.action || f.action.kind === 'draw')) {
        f.action = null;
        f.weapon = f.weapon === f.primary ? f.sidearm : f.primary;
        w = WEAPONS[f.weapon];
        emit('switch', { fighter: f, weapon: f.weapon });
      }
      const d = DODGE[f.weight] || DODGE.medium;
      if (dodgePressed && (!f.action || f.action.kind === 'draw') && f.stamina >= d.stamina * 0.5) {
        let mx = input.moveX || 0, my = input.moveY || 0;
        if (Math.hypot(mx, my) < 0.2) { mx = 0; my = -1; }
        const len = Math.hypot(mx, my);
        const rad = ((input.viewYaw ?? f.yaw) * Math.PI) / 180;   // プレイヤーは見ている向きから（スティックの向き）。bot は体の向きから
        const fx = -Math.sin(rad), fz = -Math.cos(rad), rx = Math.cos(rad), rz = -Math.sin(rad);
        // 雷の衣（雷霆一閃の後）：稲妻の姿で、遠くまで回避する
        const far = (f.aura?.kind === 'thunder' ? ULT_SPECS.sword.aura.dodge : 1) * (f.heavy > 0 ? EE.dodge : 1);   // 重い間は回避が短い
        f.action = { kind: 'dodge', t: 0, dirX: (fx * my + rx * mx) / len, dirZ: (fz * my + rz * mx) / len, moved: 0, dist: d.distance * far, bolt: far > 1 && f.aura?.kind === 'thunder' };
        f.guarding = false;
        spendStamina(f, d.stamina);
        emit('dodge', { fighter: f });
        // 火炎：回避を続けて（間が EF.gap 秒以内で EF.dodges 回）転がると、火が消える
        if (f.blaze) {
          const B = f.blaze;
          B.dodges = clock - B.lastDodge <= EF.gap ? B.dodges + 1 : 1;
          B.lastDodge = clock;
          if (B.dodges >= EF.dodges) endBlaze(f, 'dodge');
          else emit('blazeDodge', { fighter: f, count: B.dodges, need: EF.dodges });
        }
        return;
      }

      // 楯の技（楯持ち。data.js の SHIELD_SKILLS・SHIELD_MOVES）：防禦の構えの間に攻擊ボタン＝楯擊、
      // 左手ボタンを短く（TECH.hold 秒より短く）押して離す＝楯押。押している間はいつもどおり防禦する（受けが遅れないように）
      const moves = f.left === 'guard' && f.shield ? SHIELD_MOVES[f.shield] : null;
      if (moves && !f.action) {
        const tapped = leftReleased && clock - (f._leftDownAt ?? -9) < TECH.hold;
        const want = shieldPressed || (pressed && leftHeld) ? moves.guardAttack : tapped ? moves.tap : null;
        const S = want && SHIELD_SKILLS[want];
        if (S && f.stamina >= S.stamina * 0.5) {
          spendStamina(f, S.stamina);
          f.action = { kind: 'shield', t: 0, skill: S, name: want, hit: false };
          f.guarding = false;
          if (pressed) f._press = { at: clock, follow: false, used: true };   // この押下で通常攻撃・溜めを出さない（game/techniques.js）
          emit('shieldSkill', { fighter: f, skill: want });
          return;
        }
      }

      // 疾驅攻撃：全速力で走っている間の攻擊ボタン（data.js の DASH_ATTACKS・DASH）。威力が大きい反面、隙も大きい。
      // 振り始めに前へ滑り、動きの後は DASH.recover 秒動けない。全速力はここで終わる
      const dashTech = w.kind === 'melee' && f.sprinting && DASH_ATTACKS[f.weapon];
      if (pressed && dashTech && !f.action && f.stamina >= DASH.stamina * 0.5) {
        const T = { ...dashTech, dash: true, single: true, power: DASH.power, recover: DASH.recover, chain: dashTech.time, stamina: DASH.stamina };
        spendStamina(f, DASH.stamina);
        f.action = { kind: 'attack', t: 0, hit: false, heavy: true, tech: T, name: 'dash', step: 0, charge: 0, n: 0, moved: 0 };
        f._press = { at: clock, follow: false, used: true };   // この押下で通常攻撃・溜めを出さない（game/techniques.js）
        f.guarding = false;
        f.sprinting = false;
        emit('swing', { fighter: f, heavy: true, tech: T });
        emit('dashAttack', { fighter: f });
        return;
      }
      if (w.kind === 'melee') {
        // 強攻撃（左手）を先に見る：両方押したときは重い方
        const heavy = f.left === 'heavy' && leftPressed;
        const a = attackStats(f.weapon, heavy);
        const cost = a.stamina;
        // 技のある武器（片手劍・長劍）：短く押す＝通常攻撃、長押し＝溜め（game/techniques.js）。左手の強攻撃は今までどおり
        const set = techSetOf(f.weapon);
        if (set && !(heavy && !f.action)) {
          controlTech(f, set, input, clock, { pressed, released, spend: spendStamina, emit });
        } else if ((pressed || heavy) && !f.action && f.stamina >= cost * 0.5) {
          f.action = { kind: 'attack', t: 0, hit: false, heavy };
          spendStamina(f, cost);
          emit('swing', { fighter: f, heavy });
        }
      } else {
        // 弓：押して引き、離して放つ
        if (pressed && !f.action && f.stamina >= w.stamina * 0.5) f.action = { kind: 'draw', t: 0 };
        if (released && f.action?.kind === 'draw') {
          if (f.action.t >= w.minDraw) {
            fire(f, w, Math.min(1, f.action.t / w.drawTime));
            spendStamina(f, w.stamina);
            f.action = { kind: 'release', t: 0 };
          } else {
            f.action = null;
          }
        }
      }
      f.guarding = leftHeld && f.left === 'guard' && f.shield && !f.action && f.stamina > 0 && !(f.broken > 0);   // 防御できるのは盾だけ（武器では受けられない）。崩れている間はできない
    },

    update(dt) {
      clock += dt;
      for (const f of fighters) {
        if (!f.alive) { if (f.boltForm || f.greatBow || f.lift) moves.cancel(f); f.aura = null; f.launch = null; f.pinned = 0; if (f.gale) ctrl.tick(f, dt); continue; }   // 倒れた：稲妻の姿・大弓・浮いた体・纏う物を外す
        updateAura(f, dt);
        ctrl.tick(f, dt);   // 操の待ち時間・旋風の残り
        if (f.boltForm && f.action?.kind !== 'control' && f.action?.kind !== 'ult') f.boltForm = false;   // 雷步が途切れた   // 必殺技の後に纏う物（水の衣・雷の衣・岩の鎧・紅蓮の衣・光輪）と鷹の目
        if (f.pinned > 0) f.pinned = Math.max(0, f.pinned - dt);
        if (f.launch) {   // 打ち上げられた（見た目の高さ）
          const L = f.launch;
          L.t += dt;
          const u = Math.min(1, L.t / L.time);
          f.lift = L.h * 4 * u * (1 - u);
          if (u >= 1) { f.launch = null; f.lift = 0; }
        }
        updateStance(f, dt);
        updateReact(f, dt, shove);   // 重い被弾・よろめきで押されて下がる
        f.stun = Math.max(0, f.stun - dt);
        f.hitFlash = Math.max(0, f.hitFlash - dt);
        if (f.helpless > 0) f.helpless = Math.max(0, f.helpless - dt);
        updateMiracles(f, dt);   // 奇跡の待ち時間と、加護・炎の残り（game/miracles.js）
        updateAilments(f, dt);   // 属性の溜まり・火炎・雷痺（利用者の指示 2026-11-18）
        if (!f.alive) continue;
        // 燃えている（淨炎）：少しずつ傷が増える。水に入ると消える
        if (f.burn) {
          if (f.swimming) { f.burn = null; emit('extinguish', { fighter: f }); }
          else {
            f.burn.left -= dt;
            burnHurt(f, f.burn.dps * dt);
            if (f.burn && f.burn.left <= 0) { f.burn = null; emit('extinguish', { fighter: f }); }
            if (!f.alive) continue;
          }
        }
        // スタミナ：走っている間（全速力はもっと）と、防禦を構えている間は減り続け、その間は戻らない（利用者の指示 2026-11-14）。
        // 防禦で受けた分も、今までどおり減る（damage）。走って使い切ると息が切れ、COMBAT.windedRecover まで戻るまで走れない（game/stance.js の canRun）
        const running = f.gait === 'run' && !f.action && !f.guarding;   // 防禦の構えで歩いているのは走りではない
        // 潜る（game/swim.js）：息と、潜っている深さを進める。息が尽きたら、ひとりでに浮く
        if (updateDive(f, dt) === 'gasp') emit('gasp', { fighter: f });
        const drain = (running ? (f.sprinting ? COMBAT.sprintStamina : COMBAT.runStamina) : 0) + (f.guarding ? COMBAT.guardHoldStamina : 0)
          + (f.swimming ? SWIM.stamina : 0);   // 泳いでいる間も減る（尽きると泳ぐのが遅くなる。game/swim.js）
        if (drain > 0) {
          spendStamina(f, drain * dt);
          if (running && f.stamina <= 0) f.winded = true;
        }
        f.staminaDelay -= dt;
        if (f.staminaDelay <= 0) f.stamina = Math.min(f.stats.maxStamina, f.stamina + COMBAT.staminaRegen * (f.wet > 0 ? EW.regen : 1) * dt);   // 濡れている間は戻りが鈍い
        if (f.winded && f.stamina >= COMBAT.windedRecover) f.winded = false;
        // 行動を進める
        const a = f.action;
        const w = WEAPONS[f.weapon];
        if (a) {
          a.t += dt;
          if (a.kind === 'attack' && a.tech) {
            // 疾驅攻撃：振り始めに前へ滑る（始めに速く、だんだん遅く）
            if (a.tech.dash && a.t <= DASH.lungeTime + dt) {
              const u = Math.min(1, a.t / DASH.lungeTime);
              const goal = DASH.lunge * (1 - (1 - u) * (1 - u));
              const step = goal - a.moved;
              a.moved = goal;
              const rad = (f.yaw * Math.PI) / 180;
              shove(f, -Math.sin(rad) * step, -Math.cos(rad) * step);
            }
            updateTech(f, a, clock, { strike: meleeHit, spend: spendStamina, emit });
          } else if (a.kind === 'attack') {
            const st = attackStats(f.weapon, a.heavy);
            if (!a.hit && a.t >= st.windup) { a.hit = true; meleeHit(f, st); }
            if (a.t >= st.windup + st.recovery) f.action = null;
          } else if (a.kind === 'release' && a.t >= 0.25) {
            f.action = null;
          } else if (a.kind === 'ult') {
            // 必殺技：英雄ごとの技（game/ult-moves.js）か、まだ無い英雄は仮の属性の衝撃波（at 秒に放つ）。動きの間は無敵で、何もできない
            if (a.hero) { if (moves.update(f, a, dt)) { f.action = null; moves.end(f); } }
            else {
              if (!a.fired && a.t >= ULT_BURST.at) { a.fired = true; ultBurst(f); }
              if (a.t >= ULT_BURST.time) f.action = null;
            }
          } else if (a.kind === 'control') {
            // 操（game/controls.js）：動きの at 秒に効く
            if (ctrl.update(f, a, dt)) { f.action = null; ctrl.end(f, a); }
          } else if (a.kind === 'miracle') {
            // 奇跡を唱える：動きの at 秒に効き目が出る（data.js の MIRACLES）
            const M = MIRACLES[a.id];
            if (!a.done && a.t >= M.at) { a.done = true; castMiracle(f, a.id); }
            if (a.t >= M.time) f.action = null;
          } else if (a.kind === 'revive') {
            if (a.t >= REVIVE_TIME) f.action = null;   // 蘇る動き（cl_rise）の間は何もできない
          } else if (a.kind === 'getup') {
            if (a.t >= (a.time ?? ASSASSIN.getup)) f.action = null;   // 暗殺されて生き残った・重で転んだ：倒れた姿から起き上がる（prone_up）
          } else if (a.kind === 'recover') {
            if (a.t >= a.time) f.action = null;   // 疾驅攻撃の後の隙：動けない・何もできない
          } else if (a.kind === 'shield') {
            // 楯の技：決まった時刻に当たる
            if (!a.hit && a.t >= a.skill.hit) { a.hit = true; shieldStrike(f, a.skill); }
            if (a.t >= a.skill.time) f.action = null;
          } else if (acts && ['hideIn', 'hideOut', 'search', 'drag', 'dragged'].includes(a.kind)) {
            acts.update(f, a);   // 隠れる・出る・探す・引きずり出して止め（game/hide-acts.js）
          } else if (a.kind === 'finisher') {
            const t = a.target;
            if (t.alive) faceTo(f, t);
            if (!a.hit && a.t >= FINISH_HIT) {
              a.hit = true;
              if (t.alive && t.helpless > 0 && Math.hypot(t.x - f.x, t.z - f.z) < FINISH_REACH + 0.6) lethal(t, f, 'finisher');
            }
            if (a.t >= FINISH_HIT + 0.45) f.action = null;
          } else if (a.kind === 'assassinate') {
            assassin.update(f, a, dt);   // 飛びかかって、動きの決まった時刻に止めを刺す（game/assassin.js）
          } else if (a.kind === 'assassinated') {
            // 暗殺されている：止めを刺される（暗殺する人が倒れた・ひるんだら放される）。傷を受けて生き残ったら、起き上がる
            if (!a.by.alive || a.by.action?.kind !== 'assassinate') f.action = a.struck && f.alive ? { kind: 'getup', t: 0 } : null;
          } else if (a.kind === 'dodge') {
            // 始めに速く、終わりにゆっくり進む
            const d = DODGE[f.weight] || DODGE.medium;
            const u = Math.min(1, a.t / d.duration);
            const goal = (a.dist ?? d.distance) * (1 - (1 - u) * (1 - u));
            const step = goal - a.moved;
            a.moved = goal;
            f.x += a.dirX * step; f.z += a.dirZ * step;
            obstacles.resolve(f, BODY_RADIUS);
            keepInside(f, match.areaRadius);
            f.y = floorAt(f.x, f.z, f.y);
            if (a.t >= d.duration) f.action = null;
          }
        }
        // 動きの速さ：攻撃・溜め・弓を引く・回避・楯の技・技能の動き・ひるみなど、何かの動きをしている間は、移動スティックを倒していても
        // 止まる（利用者の指示 2026-11-14：動きながら滑って動くのはおかしい。回避はスティックの向きへ、動きそのものが体を運ぶ）。
        // 防禦の構えの間と、弓を引いている間（利用者の指示 2026-11-16）だけは、ゆっくり歩ける
        const drawing = f.action?.kind === 'draw' && !f.hidden && !(f.helpless > 0) && !(f.stun > 0);
        const busy = f.hidden || f.helpless > 0 || f.stun > 0 || !!f.action;
        f.moveScale = (drawing ? COMBAT.drawMoveScale : busy ? COMBAT.attackMoveScale : f.guarding ? COMBAT.guardMoveScale : 1) * (f.wet > 0 ? EW.slow : 1);   // 濡れている間は遅い
      }
      for (let i = projectiles.length - 1; i >= 0; i--) {
        if (!stepProjectile(projectiles[i], dt)) projectiles.splice(i, 1);
      }
      // 飛ばす奇跡（聖火彈・神罰雷）と天光柱
      for (let i = spells.length - 1; i >= 0; i--) if (!stepSpell(spells[i], dt)) spells.splice(i, 1);
      for (let i = strikes.length - 1; i >= 0; i--) if (!stepStrike(strikes[i], dt)) strikes.splice(i, 1);
      updateFires(dt);   // 地面の火（草・木）
      // 光壁：時間が来たら消える（張った人が倒れても消える）
      for (const w of [...walls]) {
        w.left -= dt;
        if (w.left <= 0 || (!w.owner.alive && !w.solid)) breakWall(w, false);   // 岩壁は張った人が倒れても残る
      }
    },

    /** 武器の情報（見た目や bot が使う） */
    weaponOf: (f) => WEAPONS[f.weapon],
    /** 隠れる（家具の前で隠れる動きをしてから。誰かが入っていれば、覗いて見つけて引きずり出す）。始めたら true */
    hideIn: (f, spot) => acts?.startHide(f, spot) ?? false,
    /** 隠れ場所から出る（出る動きをしてから、家具に背を向けて立つ）。始めたら true */
    hideOut: (f) => acts?.startExit(f) ?? false,
    /** f が今暗殺できる相手 { target, grace } か null（暗殺ボタンを出す・bot が使う） */
    assassinTarget: (f) => assassin.find(f),
  };
}
