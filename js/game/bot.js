// bot の考え（計算だけ）。人間と同じ形の入力（前後・左右・走る・向き・上下の向き・攻撃・防御）を出す。
//   ・相手がいないとき：森を歩き回る
//   ・近接キャラ：一番近い相手に詰めて、間合いに入ったら攻撃。相手の振りかぶりが見えたら、ときどき防御
//   ・弓兵：近すぎると下がり、中距離で横に動きながら、引いて射る（矢が落ちる分だけ上を狙う）
// 手順 3 で、探索・採取・逃走・アイテムの使用を足す
import { moveFighter } from './movement.js';
import { WEAPONS, COMBAT } from './data.js';

const DEG = Math.PI / 180;
const wrap = (a) => ((a + 540) % 360) - 180;
const yawTo = (f, x, z) => Math.atan2(-(x - f.x), -(z - f.z)) / DEG;

export function createBot(fighter, rng, fighters) {
  const b = {
    goal: null,
    thinkTimer: 0,
    waitTimer: 0,
    stuckTimer: 0,
    lastX: fighter.x, lastZ: fighter.z,
    target: null,
    attackCooldown: 0,
    guardTimer: 0,
    strafeDir: 1,
    strafeTimer: 0,
    drawGoal: 0,         // 弓：どれだけ引いてから放つか（秒）
    input: { forward: 0, strafe: 0, run: false, yaw: fighter.yaw, pitch: 0, attack: false, guard: false },
  };
  const f = fighter;
  const w = () => WEAPONS[f.weapon];

  function pickGoal(areaRadius) {
    const r = Math.sqrt(rng.next()) * areaRadius * 0.85;
    const a = rng.next() * Math.PI * 2;
    b.goal = { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }

  /** 狙う相手：近い人。体力の少ない相手は少し狙いやすい */
  function pickTarget() {
    let best = null, bestScore = Infinity;
    for (const t of fighters) {
      if (t === f || !t.alive) continue;
      const d = Math.hypot(t.x - f.x, t.z - f.z);
      if (d > 40) continue;
      const score = d * (0.7 + 0.3 * (t.stats.hp / t.stats.maxHp));
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  function wander(world) {
    if (!b.goal || Math.hypot(b.goal.x - f.x, b.goal.z - f.z) < 2) {
      if (b.goal && b.waitTimer <= 0) b.waitTimer = 1 + rng.next() * 3;
      pickGoal(world.areaRadius);
    }
    if (Math.hypot(f.x - b.lastX, f.z - b.lastZ) < 0.15 && b.input.forward > 0) b.stuckTimer += 0.3;
    else b.stuckTimer = 0;
    if (b.stuckTimer > 1.2) { pickGoal(world.areaRadius); b.stuckTimer = 0; }
    b.input.yaw = yawTo(f, b.goal.x, b.goal.z);
    b.input.forward = b.waitTimer > 0 ? 0 : 1;
    b.input.strafe = 0;
    b.input.run = rng.next() < 0.15;
    b.input.attack = false;
    b.input.guard = false;
  }

  /** 考えて入力を決める（0.15〜0.3 秒ごと） */
  function think(world) {
    b.target = pickTarget();
    b.lastX = f.x; b.lastZ = f.z;
    if (!b.target) { wander(world); return; }
    const t = b.target, d = Math.hypot(t.x - f.x, t.z - f.z), weapon = w();
    const lowHp = f.stats.hp < f.stats.maxHp * 0.35;
    b.input.run = d > 9;

    if (weapon.kind === 'bow') {
      // 弓：近すぎると下がる、中距離で横に動く、遠すぎると近づく
      if (d < 7) { b.input.forward = -1; b.input.strafe = b.strafeDir * 0.6; }
      else if (d > 26) { b.input.forward = 1; b.input.strafe = 0; }
      else { b.input.forward = 0; b.input.strafe = b.strafeDir * 0.7; }
      if (!f.action && !b.input.attack && b.attackCooldown <= 0 && f.stamina > 15) {
        b.input.attack = true;
        b.drawGoal = weapon.drawTime * (0.7 + rng.next() * 0.35);
      }
      b.input.guard = false;
      return;
    }

    // 近接
    const reach = weapon.reach;
    const threat = t.action && t.action.kind === 'attack' && !t.action.hit && d < WEAPONS[t.weapon].reach + 1;
    if (b.guardTimer <= 0 && threat && f.stamina > 20 && rng.next() < (lowHp ? 0.75 : 0.45)) b.guardTimer = 0.5 + rng.next() * 0.4;
    b.input.guard = b.guardTimer > 0;
    if (d > reach * 0.85) {
      b.input.forward = 1;
      b.input.strafe = 0;
      b.input.attack = false;
    } else {
      b.input.forward = d < reach * 0.5 ? -0.5 : 0;
      b.input.strafe = b.strafeDir * 0.4;
      const facing = Math.abs(wrap(yawTo(f, t.x, t.z) - f.yaw)) < 22;
      // 押して離す（1 回の攻撃）。押しっぱなしにしないよう、次の考えで離す
      b.input.attack = !b.input.attack && facing && !f.action && !b.input.guard && b.attackCooldown <= 0 && f.stamina > weapon.stamina;
      if (b.input.attack) b.attackCooldown = 0.25 + rng.next() * 0.7;
    }
  }

  return {
    fighter,
    get target() { return b.target; },
    update(dt, world) {
      if (!f.alive) return 0;
      b.waitTimer -= dt;
      b.thinkTimer -= dt;
      b.attackCooldown -= dt;
      b.guardTimer -= dt;
      b.strafeTimer -= dt;
      if (b.strafeTimer <= 0) { b.strafeTimer = 1 + rng.next() * 2; b.strafeDir = rng.next() < 0.5 ? -1 : 1; }
      if (b.thinkTimer <= 0) { b.thinkTimer = 0.15 + rng.next() * 0.15; think(world); }

      // 相手がいれば、毎フレーム相手の方を向く（弓は矢が落ちる分だけ上を狙う）
      const t = b.target;
      if (t && t.alive) {
        b.input.yaw = yawTo(f, t.x, t.z);
        const weapon = w();
        if (weapon.kind === 'bow') {
          const d = Math.hypot(t.x - f.x, t.z - f.z);
          const v = weapon.speed * (0.45 + 0.55 * Math.min(1, (f.action?.t || weapon.drawTime) / weapon.drawTime));
          const s = Math.min(1, (COMBAT.gravity * d) / (v * v));
          b.input.pitch = (0.5 * Math.asin(s)) / DEG + (rng.next() - 0.5) * 2.5; // 少しぶれる
          // 引ききったら放つ
          if (f.action?.kind === 'draw' && f.action.t >= b.drawGoal) { b.input.attack = false; b.attackCooldown = 0.4 + rng.next() * 0.8; }
        }
      }
      f.pitch = b.input.pitch;

      // 向きはなめらかに変える（1 秒に 300 度まで）
      const dYaw = wrap(b.input.yaw - f.yaw);
      const turned = { ...b.input, yaw: f.yaw + Math.sign(dYaw) * Math.min(Math.abs(dYaw), 300 * dt) };
      return moveFighter(f, turned, dt, world);
    },
    /** 戦闘の入力（combat.control に渡す） */
    get combatInput() { return { attack: b.input.attack, guard: b.input.guard }; },
  };
}
