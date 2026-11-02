// 戦闘（計算だけ）：攻撃・防御・弓と矢・ダメージ・ひるみ・スタミナ。
// 人間も bot も、同じ形の入力 { attack: 押している, guard: 押している } で動かす。
// PlayCanvas に依存しない（後でオンライン化するとき、サーバーにそのまま移せるように）
import { WEAPONS, COMBAT } from './data.js';

const DEG = Math.PI / 180;
const wrap = (a) => ((a + 540) % 360) - 180;
/** 向き yaw（度）の正面と、(dx, dz) の方向のなす角（度） */
function angleTo(yaw, dx, dz) {
  const to = Math.atan2(-dx, -dz) / DEG;
  return Math.abs(wrap(to - yaw));
}

/**
 * @param {object} opt
 * @param {object} opt.match 試合（脱落と加点に使う）
 * @param {(x: number, z: number) => number} opt.heightAt 地面の高さ
 * @param {object} opt.obstacles 木の幹や岩（矢が刺さる）
 */
export function createCombat({ match, heightAt, obstacles }) {
  const projectiles = [];
  const listeners = {};
  const emit = (type, data) => (listeners[type] || []).forEach((fn) => fn(data));
  const fighters = match.fighters;

  function spendStamina(f, n) {
    f.stamina = Math.max(0, f.stamina - n);
    f.staminaDelay = COMBAT.staminaRegenDelay;
  }

  /** ダメージを与える。from：攻撃した人（向きの判定に使う） */
  function damage(target, raw, attacker, { pierce = 0, fromX, fromZ, kind = 'melee' } = {}) {
    if (!target.alive || match.state !== 'running') return;
    let amount = (raw * (attacker ? attacker.stats.attack : 1) * target.armor) / target.stats.defense;
    let guarded = false;
    // 防御：前から来た攻撃だけ。盾があるほど多く減らせる。減らした分だけスタミナを使う
    const dx = fromX - target.x, dz = fromZ - target.z;
    if (target.guarding && target.stamina > 0 && angleTo(target.yaw, dx, dz) <= COMBAT.guardArc / 2) {
      const reduce = (target.shield ? COMBAT.guardReduceShield : COMBAT.guardReduce) * (1 - pierce);
      const blocked = amount * reduce;
      spendStamina(target, blocked * COMBAT.guardStaminaPerDamage);
      amount -= blocked;
      guarded = true;
      if (target.stamina <= 0) {                // 防御が崩れた
        target.guarding = false;
        target.stun = 0.7;
        target.action = null;
        emit('guardBreak', { fighter: target });
      }
    }
    target.stats.hp -= amount;
    target.hitFlash = 0.25;
    target.lastHitBy = attacker;
    if (!guarded) {                             // まともに受けるとひるむ（振りかぶりも止まる）
      target.stun = Math.max(target.stun, COMBAT.hitStun);
      if (target.action && target.action.kind === 'attack' && !target.action.hit) target.action = null;
    }
    emit('hit', { attacker, target, amount, guarded, kind });
    if (target.stats.hp <= 0) {
      target.stats.hp = 0;
      target.action = null;
      target.guarding = false;
      match.eliminate(target, attacker);
    }
  }

  /** 近接の当たり判定：間合いと角度に入っている、ほかの全員に当たる */
  function meleeHit(f, w) {
    const fy = heightAt(f.x, f.z);
    for (const t of fighters) {
      if (t === f || !t.alive) continue;
      const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz);
      if (d > w.reach + COMBAT.bodyRadius) continue;
      if (Math.abs(heightAt(t.x, t.z) - fy) > 1.6) continue;
      if (d > 0.6 && angleTo(f.yaw, dx, dz) > w.arc / 2) continue;
      damage(t, w.damage, f, { pierce: w.guardPierce, fromX: f.x, fromZ: f.z });
    }
  }

  /** 矢を放つ。power：引いた割合（0〜1） */
  function fire(f, w, power) {
    const yaw = f.yaw * DEG, pitch = (f.pitch || 0) * DEG;
    const speed = w.speed * (0.45 + 0.55 * power);
    const dir = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const p = {
      owner: f,
      x: f.x + dir[0] * 0.5, y: heightAt(f.x, f.z) + 1.5, z: f.z + dir[2] * 0.5,
      vx: dir[0] * speed, vy: dir[1] * speed, vz: dir[2] * speed,
      damage: w.damage * (0.35 + 0.65 * power),
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
      if (t === p.owner || !t.alive) continue;
      const g = heightAt(t.x, t.z);
      if (p.y < g || p.y > g + COMBAT.bodyHeight) continue;
      const sx = p.x - ox, sz = p.z - oz, len2 = sx * sx + sz * sz || 1e-6;
      const k = Math.max(0, Math.min(1, ((t.x - ox) * sx + (t.z - oz) * sz) / len2));
      if (Math.hypot(ox + sx * k - t.x, oz + sz * k - t.z) <= COMBAT.bodyRadius) {
        damage(t, p.damage, p.owner, { fromX: ox, fromZ: oz, kind: 'arrow' });
        emit('projectileHit', { projectile: p, target: t });
        return false;
      }
    }
    // 地面や木の幹に刺さる
    if (p.y <= heightAt(p.x, p.z) || obstacles.isFree(p.x, p.z, 0.05, true) === false && p.y < heightAt(p.x, p.z) + 8) {
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
     * @param {{attack: boolean, guard: boolean}} input 押している間 true
     */
    control(f, input) {
      if (!f.alive) { f.guarding = false; return; }
      const w = WEAPONS[f.weapon];
      const pressed = input.attack && !f._attackHeld;
      const released = !input.attack && f._attackHeld;
      f._attackHeld = input.attack;
      if (f.stun > 0) { f.guarding = false; if (f.action?.kind === 'draw') f.action = null; return; }

      if (w.kind === 'melee') {
        if (pressed && !f.action && f.stamina >= w.stamina * 0.5) {
          f.action = { kind: 'attack', t: 0, hit: false };
          spendStamina(f, w.stamina);
          emit('swing', { fighter: f });
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
      f.guarding = input.guard && !f.action && f.stamina > 0;
    },

    update(dt) {
      for (const f of fighters) {
        if (!f.alive) continue;
        f.stun = Math.max(0, f.stun - dt);
        f.hitFlash = Math.max(0, f.hitFlash - dt);
        // スタミナ：使ってから少しして戻る（防御中は半分）
        f.staminaDelay -= dt;
        if (f.staminaDelay <= 0) f.stamina = Math.min(f.stats.maxStamina, f.stamina + COMBAT.staminaRegen * (f.guarding ? 0.5 : 1) * dt);
        // 行動を進める
        const a = f.action;
        const w = WEAPONS[f.weapon];
        if (a) {
          a.t += dt;
          if (a.kind === 'attack') {
            if (!a.hit && a.t >= w.windup) { a.hit = true; meleeHit(f, w); }
            if (a.t >= w.windup + w.recovery) f.action = null;
          } else if (a.kind === 'release' && a.t >= 0.25) {
            f.action = null;
          }
        }
        // 動きの速さ：防御中・攻撃中・ひるみ中は遅い
        f.moveScale = f.stun > 0 ? 0.25 : f.guarding ? COMBAT.guardMoveScale
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
