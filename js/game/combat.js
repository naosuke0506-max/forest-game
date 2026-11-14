// 戦闘（計算だけ）：攻撃・防御・弓と矢・ダメージ・ひるみ・スタミナ。
// 人間も bot も、同じ形の入力 { attack: 押している, guard: 押している } で動かす。
// PlayCanvas に依存しない（後でオンライン化するとき、サーバーにそのまま移せるように）
import { WEAPONS, COMBAT, DODGE, HEAVY, TECH, SHIELD_SKILLS, SHIELD_MOVES, SHIELDS, DASH_ATTACKS, DASH, SKILL_FX, SWORD_ULT, WRATH } from './data.js';
import { skillOf, skillOn, skillReady, useSkill, updateSkill } from './skills.js';
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
 */
export function createCombat({ match, heightAt, obstacles, groundAt = null, hiding = null, cover = null, senses = null }) {
  const floorAt = groundAt || ((x, z) => heightAt(x, z));
  const yOf = (f) => f.y ?? heightAt(f.x, f.z);   // 足の高さ（家の二階にいれば高い）
  const projectiles = [];
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
      if (a.t >= d.invuln[0] && a.t <= d.invuln[1]) { emit('dodged', { attacker, target }); return; }
    }
    let amount = (raw * (attacker ? attacker.stats.attack : 1) * target.armor) / target.stats.defense;
    let guarded = false, broke = false;
    // 技能（game/skills.js）：剛力（攻めた人）は傷 1.5 倍・楯の上から半分通る・当たりが重い。強靱（受けた人）は受ける傷が減る
    const might = physical && skillOn(attacker, 'might'), crush = might && power === 'h';
    // 楯を通る割合：pierce は武器の「防禦の上から響く」分、skillPierce は楯の上からでも通ると決めた技能の分（剛力・鷹目の貫く矢 through）
    let skillPierce = through ? 1 : 0;
    if (might) { amount *= SKILL_FX.might.damage; pierce = Math.max(pierce, SKILL_FX.might.pierce); skillPierce = Math.max(skillPierce, SKILL_FX.might.pierce); power = 'h'; }
    const tough = skillOn(target, 'tough');
    if (tough) amount /= SKILL_FX.tough.defense;
    const steady = tough || target.action?.kind === 'wrath';   // ひるまない（強靱の間・神怒で宙に浮いている間）
    // 防御：前から来た物理の攻撃だけ。楯ごとに減らせる割合が違う（data.js の SHIELDS の cut：鳶形楯・大楯 100%・小楯 70%）。
    // 減らした分だけスタミナを使う。防禦の上から響く武器（pierce）は、その割合だけ通る。
    // ただし鳶形楯・大楯（100%）は、物理の攻撃を全部止める（鈍器・奧義の響く分も止める。利用者の指示 2026-11-13）。
    // 通るのは、楯の上から通ると決めた技能だけ（打擊騎士の剛力 50%・鷹目の貫く矢）
    const dx = fromX - target.x, dz = fromZ - target.z;
    const impact = amount;   // 受けた一撃の強さ（防禦の受けの動きを、強さで使い分ける）
    if (physical && target.guarding && target.stamina > 0 && angleTo(target.yaw, dx, dz) <= COMBAT.guardArc / 2) {
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
    // 反擊（楯劍騎士の技能）：近くの相手の近接攻撃を楯で受けたら、受けの動きの代わりに、すぐ強い反撃を返す
    const countered = guarded && !broke && kind === 'melee' && attacker?.alive && skillOn(target, 'counter') && !target.action
      && Math.hypot(attacker.x - target.x, attacker.z - target.z) <= SKILL_FX.counter.reach && startCounter(target, attacker);
    // 受けた動き：被弾（軽い・重い）・よろめき・防禦の受け（game/reactions.js）。ひるむ時間もここで決まる。
    // 強靱（長柄騎士の技能）の間は、どんな攻撃でもひるまない（振り・溜めも止まらない）
    if (!countered && !steady) startReact(target, reactKind(target, { guarded, broke, power, pierce, impact, crush }), fromX, fromZ);
    if (!guarded && !steady) {                   // まともに受けるとひるむ（振りかぶり・溜めも止まる）
      const ta = target.action;
      if (ta?.kind === 'assassinate' && !ta.hit) { assassin.cancel(target); target.action = null; }   // 止めを刺す前に斬られた：相手を放す
      if (ta?.kind === 'drag' && !ta.hit) { if (ta.victim.action?.kind === 'dragged') ta.victim.action = null; target.action = null; }
      if (ta && ['hideIn', 'hideOut', 'search'].includes(ta.kind)) target.action = null;   // 隠れる・出る・探すのを取りやめる
      if (ta && ((ta.kind === 'attack' && !ta.hit) || (ta.kind === 'shield' && !ta.hit) || ta.kind === 'charge' || ta.kind === 'charge2')) target.action = null;
      interruptTech(target);
    }
    emit('hit', { attacker, target, amount, guarded, kind, power });
    if (target.stats.hp <= 0) {
      target.stats.hp = 0;
      target.action = null;
      target.guarding = false;
      match.eliminate(target, attacker);
    }
  }

  /**
   * 神怒の衝撃波：周りの人に傷（楯では防げない）を与え、外へ吹き飛ばす（近いほど強く遠く）。光の輪と音は 'wrath' の知らせで出す
   */
  function wrathBlast(f) {
    const fy = yOf(f), W = WRATH;
    for (const t of fighters) {
      if (t === f || !t.alive || t.hidden) continue;
      const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz);
      if (d > W.radius || Math.abs(yOf(t) - fy) > 4) continue;
      const k = 1 - d / W.radius;
      if (t.cover) cover?.exit(t);
      damage(t, W.damage * (W.minK + (1 - W.minK) * k), f, { fromX: f.x, fromZ: f.z, kind: 'wrath', power: 'h', physical: false });
      if (!t.alive) continue;
      // 吹き飛ぶ：していたことは取りやめ、よろめいて遠くへ下がる（強靱の間も吹き飛ぶ）
      const ta = t.action;
      if (ta && !LOCKED.has(ta.kind)) t.action = null;
      t.guarding = false;
      interruptTech(t);
      startReact(t, 'stagger', f.x, f.z);
      t.react.push = W.pushMin + (W.push - W.pushMin) * k;
      t.react.time = 0.9 + 0.4 * k;
      t.stun = Math.max(t.stun, W.stun * (0.6 + 0.4 * k));
    }
    emit('wrath', { fighter: f, x: f.x, y: fy, z: f.z, radius: W.radius });
  }

  /** 劍騎士の奧義：動きを流し、決まった時刻に当てる（雙劍は前へ滑る・長劍は砂煙を立てる。update で進める） */
  function startUltimate(f, U) {
    const T = { ...U, single: true, ult: true, stamina: 0, chain: U.time };
    if (f.cover) cover?.exit(f);
    f.guarding = false;
    f.action = { kind: 'attack', t: 0, hit: false, heavy: true, tech: T, name: 'ult', step: 0, charge: 0, n: 0, moved: 0, dusted: false };
    f._press = { at: clock, follow: false, used: true };   // この押下で通常攻撃を出さない
    f._queued = false;
    emit('swing', { fighter: f, heavy: true, tech: T });
    emit('ultimate', { fighter: f, ult: U });
  }

  /**
   * 反擊（楯劍騎士の技能）：持っている武器の溜攻撃 1 の動きを、速く・強く出す（受けた相手の方を向く）。出せたら true
   */
  function startCounter(f, foe) {
    const base = techSetOf(f.weapon)?.charge || DASH_ATTACKS[f.weapon];
    if (!base) return false;
    const C = SKILL_FX.counter, k = 1 / C.speed;
    const reach = (Array.isArray(base.reach) ? base.reach[0] : base.reach) ?? WEAPONS[f.weapon].reach;
    const T = { name: '反擊', clip: base.clip, time: base.time * k, hits: [base.hits[0] * k], damage: C.damage, reach: reach + C.reachAdd,
      arc: C.arc, power: 'h', single: true, stamina: 0, chain: base.time * k };
    f.guarding = false;
    f.yaw = (Math.atan2(-(foe.x - f.x), -(foe.z - f.z)) * 180) / Math.PI;
    f.action = { kind: 'attack', t: 0, hit: false, heavy: true, tech: T, name: 'counter', step: 0, charge: 0, n: 0 };
    f._press = null; f._queued = false;
    emit('swing', { fighter: f, heavy: true, tech: T });
    emit('counter', { fighter: f, target: foe });
    return true;
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
    if (t.cover) cover?.exit(t);
    if (skillOn(t, 'tough')) { t.lastHitBy = f; emit('shieldPushed', { attacker: f, target: t }); return; }   // 強靱の間は押されても崩れない
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
    const amount = target.stats.hp;
    target.stats.hp = 0;
    target.hitFlash = 0.25;
    target.action = null; target.helpless = 0;
    emit('hit', { attacker, target, amount, guarded: false, kind: how });
    emit('lethal', { attacker, target, how });
    match.eliminate(target, attacker);
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
  const assassin = createAssassin({ fighters, senses, yOf, move: (f, dx, dz) => shove(f, dx, dz), lethal, emit });
  // タンス・ベッドに隠れる・出る・探す動きと、見つけたら引きずり出して止め（game/hide-acts.js）
  const acts = hiding ? createHideActs({ hiding, move: (f, dx, dz) => shove(f, dx, dz), lethal, emit }) : null;
  const LOCKED = new Set(['assassinate', 'assassinated', 'hideIn', 'hideOut', 'search', 'drag', 'dragged', 'wrath']);   // している間はほかのことができない（神怒の間も）
  /** 押されて動く（木や岩・壁を避け、歩ける範囲の中・床の高さへ）。実際に動いた分を返す */
  const shove = (f, dx, dz) => {
    const ox = f.x, oz = f.z;
    // 大きく動くとき（神怒で吹き飛ぶ・奧義で滑る）は、壁を通り抜けないように 0.25 m ずつ動かして、そのたびに押し戻す
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
    for (let i = 0; i < n; i++) {
      f.x += dx / n; f.z += dz / n;
      obstacles.resolve(f, BODY_RADIUS);
    }
    keepInside(f, match.areaRadius);
    f.y = floorAt(f.x, f.z, f.y);
    return [f.x - ox, f.z - oz];
  };

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
      hits++;
    }
    // 振り終わり：誰にも当たらなければ、前に木の幹や壁があるか（当たった音を変える）
    let blocked = false;
    if (!hits) {
      const yaw = f.yaw * DEG, r = w.reach * 0.75;
      blocked = !obstacles.isFree(f.x - Math.sin(yaw) * r, f.z - Math.cos(yaw) * r, 0.15, true);
    }
    emit('strike', { fighter: f, weapon: f.weapon, hits, blocked });
  }

  /** 矢を放つ。power：引いた割合（0〜1） */
  function fire(f, w, power) {
    const yaw = f.yaw * DEG, pitch = (f.pitch || 0) * DEG;
    // 鷹目（弓兵の技能）の間に放つ最初の 1 本：人も木も壁も貫く矢（傷 2 倍・防禦できない。速く飛ぶ）
    const piercing = !!f.pierceArrow;
    f.pierceArrow = false;
    const H = SKILL_FX.hawk;
    const speed = w.speed * (0.45 + 0.55 * power) * (piercing ? H.arrowSpeed : 1);
    const dir = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const p = {
      owner: f,
      x: f.x + dir[0] * 0.5, y: yOf(f) + 1.5, z: f.z + dir[2] * 0.5,
      vx: dir[0] * speed, vy: dir[1] * speed, vz: dir[2] * speed,
      damage: w.damage * (0.35 + 0.65 * power) * (piercing ? H.arrowDamage : 1),
      power: piercing || power >= 0.9 ? 'h' : 'l',   // 引き切った矢は重い一撃
      life: piercing ? H.arrowLife : 5,
      pierce: piercing, struck: piercing ? new Set() : null,   // 貫く矢：当たった人（同じ人には 1 度だけ）
      x0: f.x + dir[0] * 0.5, y0: yOf(f) + 1.5, z0: f.z + dir[2] * 0.5,   // 放った所（貫く矢が最初の一歩で通り抜けた壁にも穴を開ける）
      stuck: 0,               // 刺さってからの時間（見た目用。刺さった矢は少し残す）
      id: Math.random(),
    };
    projectiles.push(p);
    emit('fire', { fighter: f, projectile: p });
  }

  function stepProjectile(p, dt) {
    if (p.stuck) { p.stuck += dt; return p.stuck < 6; }
    p.life -= dt;
    if (p.life <= 0) return false;
    const ox = p.x, oz = p.z;
    p.vy -= COMBAT.gravity * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    // 人に当たる：線分（前の位置 → 今の位置）と、体の円柱
    for (const t of fighters) {
      if (t === p.owner || !t.alive || (t.hidden && !p.pierce)) continue;   // 隠れている人には当たらない（貫く矢は、隠れ場所ごと貫く）
      const g = yOf(t);
      if (p.y < g || p.y > g + stanceShape(t).height) continue;   // しゃがむ・伏せると体が低い
      const sx = p.x - ox, sz = p.z - oz, len2 = sx * sx + sz * sz || 1e-6;
      const k = Math.max(0, Math.min(1, ((t.x - ox) * sx + (t.z - oz) * sz) / len2));
      if (Math.hypot(ox + sx * k - t.x, oz + sz * k - t.z) <= COMBAT.bodyRadius) {
        if (p.pierce) {   // 貫く矢：当たっても止まらず、次の人へ
          if (p.struck.has(t)) continue;
          p.struck.add(t);
          damage(t, p.damage, p.owner, { fromX: ox, fromZ: oz, kind: 'arrow', power: p.power, pierce: 1, through: true });
          emit('projectileHit', { projectile: p, target: t, through: true });
          continue;
        }
        damage(t, p.damage, p.owner, { fromX: ox, fromZ: oz, kind: 'arrow', power: p.power });
        emit('projectileHit', { projectile: p, target: t });
        return false;
      }
    }
    // 貫く矢：木・壁・床は通り抜ける（建物に穴が開くのは、建物を壊す仕組みを作るとき）。地面と外周では消える
    if (p.pierce) return p.y > heightAt(p.x, p.z) && Math.hypot(p.x, p.z) <= match.areaRadius + 0.5;
    // 外周の柵（と、その上の見えない壁）：柵の高さまでなら柵に刺さり、それより上は落ちて消える
    if (Math.hypot(p.x, p.z) > match.areaRadius + 0.5) {
      if (p.y < heightAt(p.x, p.z) + 10) { p.stuck = 1e-6; emit('projectileStuck', { projectile: p }); return true; }
      return false;
    }
    // 地面や木の幹に刺さる
    if (p.y <= floorAt(p.x, p.z, p.y) || obstacles.isFree(p.x, p.z, 0.05, true) === false && p.y < heightAt(p.x, p.z) + 8) {
      p.stuck = 0.0001;
      emit('projectileStuck', { projectile: p });
    }
    return true;
  }

  return {
    projectiles,
    on(type, fn) { (listeners[type] ||= []).push(fn); },

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
      const skillPressed = input.skill && !f._skillHeld;      // 技能ボタン（專用技能。game/skills.js）
      f._skillHeld = !!input.skill;
      // 暗殺している・されている・隠れる・出る・探す・引きずり出す間は、ほかのことはできない
      if (LOCKED.has(f.action?.kind)) { f.guarding = false; return; }
      if (f.stun > 0) { f.guarding = false; if (f.action?.kind === 'draw') f.action = null; return; }
      // 技能：隠れている間・ひるんでいる間・暗殺などの間は使えない。使っても、していることは続ける（効き目が付くだけ）。
      // 劍騎士の奧義（一撃の技）は、何もしていないときだけ出せる（持っている武器の動き。data.js の SWORD_ULT）
      if (skillPressed && !f.hidden) {
        const sk = skillOf(f);
        if (sk?.effect === 'ultimate') {
          const U = SWORD_ULT[f.weapon];
          if (U && !f.action && skillReady(f)) {
            useSkill(f);
            emit('skill', { fighter: f, skill: sk });
            startUltimate(f, U);
            return;
          }
        } else if (sk?.effect === 'wrath') {
          // 祓魔僧の神怒：宙に浮いて衝撃波を放つ（動きの間は何もできない。攻撃を受けても止まらない）
          if (!f.action && skillReady(f)) {
            useSkill(f);
            if (f.cover) cover?.exit(f);
            f.guarding = false;
            f.action = { kind: 'wrath', t: 0, fired: false };
            emit('skill', { fighter: f, skill: sk });
            return;
          }
        } else if (useSkill(f)) emit('skill', { fighter: f, skill: sk });
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
        if (pressed || leftPressed || dodgePressed || shieldPressed) setStance(f, 'stand');
        f.guarding = false;
        return;
      }
      if (f.stance === 'crouch' && (pressed || leftPressed || dodgePressed || shieldPressed || (leftHeld && f.left === 'guard'))) setStance(f, 'stand');
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

      // 回避：移動スティックの向きへ（倒していなければ後ろへ）。行動中（弓を引いている途中は除く）はできない
      if (f.action?.kind === 'dodge') { f.guarding = false; return; }
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
        f.action = { kind: 'dodge', t: 0, dirX: (fx * my + rx * mx) / len, dirZ: (fz * my + rz * mx) / len, moved: 0 };
        f.guarding = false;
        spendStamina(f, d.stamina);
        emit('dodge', { fighter: f });
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
      f.guarding = leftHeld && f.left === 'guard' && f.shield && !f.action && f.stamina > 0;   // 防御できるのは盾だけ（武器では受けられない）
    },

    update(dt) {
      clock += dt;
      for (const f of fighters) {
        if (!f.alive) continue;
        updateStance(f, dt);
        updateReact(f, dt, shove);   // 重い被弾・よろめきで押されて下がる
        f.stun = Math.max(0, f.stun - dt);
        f.hitFlash = Math.max(0, f.hitFlash - dt);
        if (f.helpless > 0) f.helpless = Math.max(0, f.helpless - dt);
        updateSkill(f, dt);   // 技能の効き目と待ち時間
        // スタミナ：走っている間（全速力はもっと）と、防禦を構えている間は減り続け、その間は戻らない（利用者の指示 2026-11-14）。
        // 防禦で受けた分も、今までどおり減る（damage）。走って使い切ると息が切れ、COMBAT.windedRecover まで戻るまで走れない（game/stance.js の canRun）
        const running = f.gait === 'run' && !f.action && !f.guarding;   // 防禦の構えで歩いているのは走りではない
        const drain = (running ? (f.sprinting ? COMBAT.sprintStamina : COMBAT.runStamina) : 0) + (f.guarding ? COMBAT.guardHoldStamina : 0);
        if (drain > 0) {
          spendStamina(f, drain * dt);
          if (running && f.stamina <= 0) f.winded = true;
        }
        f.staminaDelay -= dt;
        if (f.staminaDelay <= 0) f.stamina = Math.min(f.stats.maxStamina, f.stamina + COMBAT.staminaRegen * dt);
        if (f.winded && f.stamina >= COMBAT.windedRecover) f.winded = false;
        // 行動を進める
        const a = f.action;
        const w = WEAPONS[f.weapon];
        if (a) {
          a.t += dt;
          if (a.kind === 'attack' && a.tech) {
            // 奧義（雙劍）：決まった間、前へ高速で滑る（同じ速さで）
            const sl = a.tech.slide;
            if (sl && a.t > sl.from && a.moved < sl.dist) {
              const goal = sl.dist * Math.min(1, (a.t - sl.from) / (sl.to - sl.from));
              const step = goal - a.moved;
              a.moved = goal;
              const rad = (f.yaw * Math.PI) / 180;
              shove(f, -Math.sin(rad) * step, -Math.cos(rad) * step);
            }
            // 奧義（長劍・大劍）：切っ先が地面にめり込む所に砂煙を立てる（見た目は render/ult-dust.js）
            const du = a.tech.dust;
            if (du && !a.dusted && a.t >= du.at) {
              a.dusted = true;
              const rad = (f.yaw * Math.PI) / 180, x = f.x - Math.sin(rad) * du.ahead, z = f.z - Math.cos(rad) * du.ahead;
              emit('dust', { fighter: f, x, z, y: floorAt(x, z, yOf(f)), lift: du.lift - du.at });
            }
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
          } else if (a.kind === 'wrath') {
            if (!a.fired && a.t >= WRATH.at) { a.fired = true; wrathBlast(f); }
            if (a.t >= WRATH.time) f.action = null;
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
            // 暗殺されている：止めを刺される（暗殺する人が倒れた・ひるんだら放される）
            if (!a.by.alive || a.by.action?.kind !== 'assassinate') f.action = null;
          } else if (a.kind === 'dodge') {
            // 始めに速く、終わりにゆっくり進む
            const d = DODGE[f.weight] || DODGE.medium;
            const u = Math.min(1, a.t / d.duration);
            const goal = d.distance * (1 - (1 - u) * (1 - u));
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
        // 防禦の構えの間だけは、ゆっくり歩ける
        const busy = f.hidden || f.helpless > 0 || f.stun > 0 || !!f.action;
        f.moveScale = busy ? COMBAT.attackMoveScale : f.guarding ? COMBAT.guardMoveScale : 1;
      }
      for (let i = projectiles.length - 1; i >= 0; i--) {
        if (!stepProjectile(projectiles[i], dt)) projectiles.splice(i, 1);
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
