// 戦闘（計算だけ）：攻撃・防御・弓と矢・ダメージ・ひるみ・スタミナ。
// 人間も bot も、同じ形の入力 { attack: 押している, guard: 押している } で動かす。
// PlayCanvas に依存しない（後でオンライン化するとき、サーバーにそのまま移せるように）
import { WEAPONS, COMBAT, DODGE, HEAVY } from './data.js';
import { keepInside, BODY_RADIUS } from './movement.js';
import { SEARCH_TIME } from './hiding.js';
import { setStance, updateStance, stanceShape } from './stance.js';
import { techSetOf, controlTech, updateTech, interruptTech } from './techniques.js';
import { reactKind, startReact, updateReact } from './reactions.js';

// 隠れる・探すに関わる動き
const FINISH_REACH = 2.4;   // 致命の一撃が届く近さ（無防備な相手まで m）
const FINISH_HIT = 0.45;    // 致命の一撃が入るまで（秒）
const ASSN_REACH = 3.2;     // 隠れた所から暗殺へ移れる近さ（m）
const ASSN_WIN = 0.45;      // 暗殺の猶予（秒）。この間に相手が回避すると失敗する

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
 */
export function createCombat({ match, heightAt, obstacles, groundAt = null, hiding = null, cover = null }) {
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
  function damage(target, raw, attacker, { pierce = 0, fromX, fromZ, kind = 'melee', power = 'l' } = {}) {
    if (!target.alive || match.state !== 'running') return;
    // 回避中の、攻撃が当たらない時間
    const a = target.action;
    if (a?.kind === 'dodge') {
      const d = DODGE[target.weight];
      if (a.t >= d.invuln[0] && a.t <= d.invuln[1]) { emit('dodged', { attacker, target }); return; }
    }
    let amount = (raw * (attacker ? attacker.stats.attack : 1) * target.armor) / target.stats.defense;
    let guarded = false, broke = false;
    // 防御：前から来た攻撃だけ。盾があるほど多く減らせる。減らした分だけスタミナを使う
    const dx = fromX - target.x, dz = fromZ - target.z;
    if (target.guarding && target.stamina > 0 && angleTo(target.yaw, dx, dz) <= COMBAT.guardArc / 2) {
      const reduce = (target.shield ? COMBAT.guardReduceShield : COMBAT.guardReduce) * (1 - pierce);
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
    startReact(target, reactKind(target, { guarded, broke, power, pierce }), fromX, fromZ);
    if (!guarded) {                             // まともに受けるとひるむ（振りかぶり・溜めも止まる）
      const ta = target.action;
      if (ta && ((ta.kind === 'attack' && !ta.hit) || ta.kind === 'charge' || ta.kind === 'charge2')) target.action = null;
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
  /** 押されて動く（木や岩・壁を避け、歩ける範囲の中・床の高さへ）。実際に動いた分を返す */
  const shove = (f, dx, dz) => {
    const ox = f.x, oz = f.z;
    f.x += dx; f.z += dz;
    obstacles.resolve(f, BODY_RADIUS);
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
    const speed = w.speed * (0.45 + 0.55 * power);
    const dir = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const p = {
      owner: f,
      x: f.x + dir[0] * 0.5, y: yOf(f) + 1.5, z: f.z + dir[2] * 0.5,
      vx: dir[0] * speed, vy: dir[1] * speed, vz: dir[2] * speed,
      damage: w.damage * (0.35 + 0.65 * power),
      power: power >= 0.9 ? 'h' : 'l',   // 引き切った矢は重い一撃
      life: 5,
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
      if (t === p.owner || !t.alive || t.hidden) continue;
      const g = yOf(t);
      if (p.y < g || p.y > g + stanceShape(t).height) continue;   // しゃがむ・伏せると体が低い
      const sx = p.x - ox, sz = p.z - oz, len2 = sx * sx + sz * sz || 1e-6;
      const k = Math.max(0, Math.min(1, ((t.x - ox) * sx + (t.z - oz) * sz) / len2));
      if (Math.hypot(ox + sx * k - t.x, oz + sz * k - t.z) <= COMBAT.bodyRadius) {
        damage(t, p.damage, p.owner, { fromX: ox, fromZ: oz, kind: 'arrow', power: p.power });
        emit('projectileHit', { projectile: p, target: t });
        return false;
      }
    }
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
     * @param {{attack: boolean, left?: boolean, guard?: boolean, dodge?: boolean, moveX?: number, moveY?: number}} input
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
      f._leftHeld = leftHeld;
      const dodgePressed = input.dodge && !f._dodgeHeld;
      f._dodgeHeld = !!input.dodge;
      const searchPressed = input.search && !f._searchHeld;
      f._searchHeld = !!input.search;
      if (f.stun > 0) { f.guarding = false; if (f.action?.kind === 'draw') f.action = null; return; }

      // 隠れている：攻撃ボタンで、近くの相手へ飛び出して暗殺（相手が猶予の間に回避すると失敗）。ほかのことはできない
      if (f.hidden) {
        f.guarding = false;
        const t = pressed ? nearestFoe(f, ASSN_REACH + 1.2) : null;
        if (t && Math.hypot(t.x - f.hidden.outX, t.z - f.hidden.outZ) < ASSN_REACH) {
          hiding?.exit(f);
          faceTo(f, t);
          f.action = { kind: 'assassinate', t: 0, target: t, dodged: false };
          emit('assassinate', { attacker: f, target: t });
        }
        return;
      }
      // 壁裏隠れ：壁から離れるのは、暗殺したとき・「離壁」で離れたとき（攻撃を受けたとき・倒れたときも）だけ。
      // 攻撃ボタンは、近くに相手がいれば飛びかかって暗殺（近くに来たらいつでも。猶予の間に相手が回避すると失敗）。
      // 近くに相手がいなければ何もしない。左手・回避も、壁に隠れている間は何もしない
      if (f.cover) {
        f.guarding = false;
        const t = pressed ? nearestFoe(f, ASSN_REACH) : null;
        if (t) {
          cover?.exit(f);
          faceTo(f, t);
          f.action = { kind: 'assassinate', t: 0, target: t, dodged: false };
          emit('assassinate', { attacker: f, target: t });
        }
        return;
      }
      // 姿勢：伏せる・起き上がる途中は何もできない。伏せているときは、攻撃・左手・回避を押すと起き上がる（その押下では何もしない）。
      // しゃがんでいれば、すぐ立って、そのまま攻撃・防御・回避する（game/stance.js）
      if (f.stanceT > 0) { f.guarding = false; return; }
      if (f.stance === 'prone') {
        if (pressed || leftPressed || dodgePressed) setStance(f, 'stand');
        f.guarding = false;
        return;
      }
      if (f.stance === 'crouch' && (pressed || leftPressed || dodgePressed || (leftHeld && f.left === 'guard'))) setStance(f, 'stand');
      // 探す：近くのベッドやタンスを開ける
      if (searchPressed && !f.action && hiding) {
        const spot = hiding.nearest(f);
        if (spot) { f.action = { kind: 'search', t: 0, spot }; f.guarding = false; emit('searchStart', { fighter: f, spot }); return; }
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
        const rad = (f.yaw * Math.PI) / 180;
        const fx = -Math.sin(rad), fz = -Math.cos(rad), rx = Math.cos(rad), rz = -Math.sin(rad);
        f.action = { kind: 'dodge', t: 0, dirX: (fx * my + rx * mx) / len, dirZ: (fz * my + rz * mx) / len, moved: 0 };
        f.guarding = false;
        spendStamina(f, d.stamina);
        emit('dodge', { fighter: f });
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
        // スタミナ：使ってから少しして戻る（防御中は半分）
        f.staminaDelay -= dt;
        if (f.staminaDelay <= 0) f.stamina = Math.min(f.stats.maxStamina, f.stamina + COMBAT.staminaRegen * (f.guarding ? 0.5 : 1) * dt);
        // 行動を進める
        const a = f.action;
        const w = WEAPONS[f.weapon];
        if (a) {
          a.t += dt;
          if (a.kind === 'attack' && a.tech) {
            updateTech(f, a, clock, { strike: meleeHit, spend: spendStamina, emit });
          } else if (a.kind === 'attack') {
            const st = attackStats(f.weapon, a.heavy);
            if (!a.hit && a.t >= st.windup) { a.hit = true; meleeHit(f, st); }
            if (a.t >= st.windup + st.recovery) f.action = null;
          } else if (a.kind === 'release' && a.t >= 0.25) {
            f.action = null;
          } else if (a.kind === 'search') {
            if (a.t >= SEARCH_TIME) { f.action = null; hiding?.reveal(f, a.spot); }
          } else if (a.kind === 'finisher') {
            const t = a.target;
            if (t.alive) faceTo(f, t);
            if (!a.hit && a.t >= FINISH_HIT) {
              a.hit = true;
              if (t.alive && t.helpless > 0 && Math.hypot(t.x - f.x, t.z - f.z) < FINISH_REACH + 0.6) lethal(t, f, 'finisher');
            }
            if (a.t >= FINISH_HIT + 0.45) f.action = null;
          } else if (a.kind === 'assassinate') {
            // 相手へ飛びかかる。猶予の間に相手が回避したら失敗
            const t = a.target;
            if (t.action?.kind === 'dodge') a.dodged = true;
            const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz);
            if (!a.done && d > 0.9) {
              const step = Math.min(d - 0.9, 7 * dt);
              f.x += (dx / d) * step; f.z += (dz / d) * step;
              obstacles.resolve(f, BODY_RADIUS);
              f.y = floorAt(f.x, f.z, f.y);
              faceTo(f, t);
            }
            if (!a.done && a.t >= ASSN_WIN) {
              a.done = true;
              if (!a.dodged && t.alive && !t.hidden && d < 2.2) lethal(t, f, 'assassinate');
              else { f.stun = 0.8; emit('assassinFail', { attacker: f, target: t }); f.action = null; }
            }
            if (f.action && a.t >= ASSN_WIN + 0.4) f.action = null;
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
        // 動きの速さ：防御中・攻撃中・ひるみ中は遅い
        const still = f.hidden || f.helpless > 0 || ['dodge', 'search', 'finisher', 'assassinate'].includes(f.action?.kind);
        f.moveScale = still ? 0 : f.stun > 0 ? 0.25 : f.guarding ? COMBAT.guardMoveScale
          : (a && a.kind !== 'release') ? COMBAT.attackMoveScale : 1;
      }
      for (let i = projectiles.length - 1; i >= 0; i--) {
        if (!stepProjectile(projectiles[i], dt)) projectiles.splice(i, 1);
      }
    },

    /** 武器の情報（見た目や bot が使う） */
    weaponOf: (f) => WEAPONS[f.weapon],
  };
}
