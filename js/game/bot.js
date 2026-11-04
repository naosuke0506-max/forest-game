// bot の考え（計算だけ）。人間と同じ形の入力（前後・左右・走る・向き・上下の向き・攻撃・防御）を出す。
//   ・相手がいないとき：森を歩き回る
//   ・近接キャラ：一番近い相手に詰めて、間合いに入ったら攻撃。相手の振りかぶりが見えたら、ときどき防御
//   ・弓兵：近すぎると下がり、中距離で横に動きながら、引いて射る（矢が落ちる分だけ上を狙う）
//   ・素材：相手がいないとき、近くの素材の山や村の箱へ行って拾い、素材がそろえば強化する（game/craft.js の botCraft）
//   ・隠れる：体力が少ないとき、近くの家のベッドやタンスへ逃げ込む（扉 →（階段）→ 隠れ場所の道順で歩く）。
//     隠れている間に相手がすぐそばを通れば、飛び出して暗殺する。しばらくしたら出る
//   ・探す：誰かが隠れるところを見たら、その場所へ行って探す。見つけたら致命の一撃
//   ・暗殺されそうになったら、ときどき回避する
//   ・目と耳（game/senses.js）：前の 120 度で、体の半分以上が直接見える相手にだけ気づく。音が聞こえても気づく。
//     見失ったら（聞こえただけのときも）、最後に分かった所へ行って見回し、見つからなければ元の行動に戻る。
//     近づくときはしゃがんで忍び寄る（足音が小さい）。相手が見えたら立って戦う
//   ・壁裏隠れ（game/cover.js）：見えない相手の足音が近づいてくると、ときどき近くの家の壁に背を付けて待ち伏せし、
//     近くに来た相手を暗殺する。しばらくしても来なければ、または見えている相手が離れていれば、壁から離れる
// 後で、逃走・アイテムの使用を足す
import { moveFighter } from './movement.js';
import { canRun, setStance } from './stance.js';
import { WEAPONS, COMBAT, SENSES } from './data.js';
import { botCraft } from './craft.js';
import { breathLevel, HEAR_REACH } from './hiding.js';

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
    dodgeCooldown: 0,
    route: null,         // 歩いている道順 { pts: [{x, z}], i, why: 'hide' | 'search' | 'leave', spot }
    hideTimer: 0,        // 隠れている残りの時間
    hideCooldown: 0,     // 次に隠れようとするまで
    knownSpot: null,     // 誰かが隠れるのを見た場所
    seenAssassin: null,  // 回避するか決めた暗殺
    known: new Map(),    // 気づいた相手 → { x, y, z, age（分かってからの秒）, seen（今見えているか） }
    look: null,          // 最後に分かった所へ探しに行っている { t（相手）, x, z, arrived, timer, base（見回しの中心の向き）, stuck }
    ambush: null,        // 待ち伏せする壁へ向かっている { spot, side, wait, stuck, lx, lz }
    coverTimer: 0,       // 壁に隠れている残りの時間
    ambushCooldown: 8,   // 次に待ち伏せしようとするまで
    lastThink: 0,
    input: { forward: 0, strafe: 0, run: false, yaw: fighter.yaw, pitch: 0, attack: false, guard: false, left: false, dodge: false, dodgeX: 0, dodgeY: 0, search: false },
  };
  const f = fighter;
  const w = () => WEAPONS[f.weapon];

  function pickGoal(areaRadius) {
    const r = Math.sqrt(rng.next()) * areaRadius * 0.85;
    const a = rng.next() * Math.PI * 2;
    b.goal = { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }

  /**
   * 目と耳：見える相手・聞こえた相手を覚える（world.senses が無いときは、40m 以内の全員が分かる）
   * @param {number} dt 前に考えてからの時間
   */
  function perceive(world, dt) {
    const S = world.senses;
    for (const [t, k] of b.known) { k.age += dt; if (!t.alive || k.age > SENSES.memory) b.known.delete(t); }
    for (const t of fighters) {
      if (t === f || !t.alive) continue;
      const see = S ? S.canSee(f, t) : !t.hidden && Math.hypot(t.x - f.x, t.z - f.z) <= 40;
      const k = b.known.get(t);
      if (see) b.known.set(t, { x: t.x, y: t.y, z: t.z, age: 0, seen: true });
      else if (k) k.seen = false;
    }
    if (!S) return;
    for (const n of S.hear(f, fighters)) {
      const k = b.known.get(n.f);
      if (k?.seen) continue;
      b.known.set(n.f, { x: n.x, y: n.y, z: n.z, age: 0, seen: false });
    }
  }

  /** 狙う相手：今見えている人のうち、近い人。体力の少ない相手は少し狙いやすい */
  function pickTarget() {
    let best = null, bestScore = Infinity;
    for (const [t, k] of b.known) {
      if (!k.seen || !t.alive || t.hidden) continue;   // 見えている人だけ（隠れている人は見えない）
      const d = Math.hypot(t.x - f.x, t.z - f.z);
      const score = d * (0.7 + 0.3 * (t.stats.hp / t.stats.maxHp)) * (t.helpless > 0 ? 0.3 : 1);   // 無防備な相手は真っ先に
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  /** 近くの素材の山・箱へ向かい、着いたら拾ってクラフトする（相手がいないとき） */
  function gather(world) {
    const p = world.pickups;
    if (!p) return false;
    const here = p.nearest(f);
    if (here) {
      if (p.take(f, here)) {
        const made = botCraft(f);
        if (made) world.onBotCraft?.(f, made);
      }
      return false;
    }
    if (!b.loot || b.loot.taken) {
      b.loot = null;
      let bd = 28;
      for (const o of p.items) {
        if (o.taken || o.botSkip) continue;   // 行けなかった物は諦める
        const d = Math.hypot(o.x - f.x, o.z - f.z);
        if (d < bd) { bd = d; b.loot = o; }
      }
    }
    if (!b.loot) return false;
    b.goal = { x: b.loot.x, z: b.loot.z };
    return true;
  }

  function wander(world) {
    const gathering = gather(world);
    if (gathering) b.waitTimer = 0;
    if (!b.goal || (!gathering && Math.hypot(b.goal.x - f.x, b.goal.z - f.z) < 2)) {
      if (b.goal && b.waitTimer <= 0) b.waitTimer = 1 + rng.next() * 3;
      pickGoal(world.areaRadius);
    }
    if (Math.hypot(f.x - b.lastX, f.z - b.lastZ) < 0.15 && b.input.forward > 0) b.stuckTimer += 0.3;
    else b.stuckTimer = 0;
    if (b.stuckTimer > 1.2) { pickGoal(world.areaRadius); b.stuckTimer = 0; if (b.loot) { b.loot.botSkip = true; b.loot = null; } }
    b.input.yaw = yawTo(f, b.goal.x, b.goal.z);
    b.input.forward = b.waitTimer > 0 ? 0 : 1;
    b.input.strafe = 0;
    b.input.run = rng.next() < 0.15;
    b.input.attack = false;
    b.input.guard = false;
  }

  /** 道順を歩く。着いたら、隠れる・探す・家を出る */
  function followRoute(world) {
    const r = b.route;
    const p = r.pts[r.i];
    const d = Math.hypot(p.x - f.x, p.z - f.z);
    // 次の点へ近づけていなければ（家具や壁に引っかかっている）、横へよけてから、もう一度向かう。それでもだめなら諦める
    if (r.best === undefined || d < r.best - 0.15) { r.best = d; r.since = 0; } else r.since += 0.25;
    if (r.since > 4) { b.route = null; if (r.why === 'search') b.knownSpot = null; return; }
    if (r.since > 1 && !(r.sideT > 0)) { r.side = rng.next() < 0.5 ? -1 : 1; r.sideT = 0.6; }
    const last = r.i === r.pts.length - 1;
    if (d < (last ? 0.9 : 0.7)) {
      if (!last) { r.i++; r.best = undefined; return; }
      const H = world.hiding;
      if (r.why === 'hide' && H && !r.spot.occupant) {
        H.hide(f, r.spot);
        b.hideTimer = 10 + rng.next() * 15;
        b.route = null;
        return;
      }
      if (r.why === 'search' && H) {
        b.input.search = true;   // 開けて探す（game/combat.js の search）
        b.knownSpot = null;
        b.route = { pts: [...r.spot.route].reverse(), i: 0, why: 'leave' };
        return;
      }
      b.route = null;
      return;
    }
    b.input.yaw = yawTo(f, p.x, p.z);
    b.input.forward = 1;
    b.input.strafe = 0;
    if (r.sideT > 0) { r.sideT -= 0.25; b.input.forward = 0.3; b.input.strafe = r.side; }   // 横へよける
    b.input.run = r.why === 'hide' || d > 6;
    b.input.attack = false;
    b.input.guard = false;
  }
  /** 隠れ場所への道順。すでに同じ階の近く（同じ家の中）にいれば、まっすぐ向かう */
  const routeTo = (spot, why) => {
    const pts = [...spot.route, { x: spot.outX, z: spot.outZ }];   // 最後は家具の前（家具の中へは歩けない）
    const inside = Math.abs((f.y ?? -99) - spot.y) < 0.25 && Math.hypot(f.x - spot.x, f.z - spot.z) < 8;
    return { pts, i: inside ? pts.length - 1 : 0, why, spot };
  };

  /**
   * 最後に分かった所へ探しに行く：着いたら見回し、見つからなければ忘れる。行けなければ（壁などで）諦める
   * @returns {boolean} 探しに行っているか
   */
  function investigate(world) {
    // 一番新しく分かった相手（見えていない人）
    if (!b.look || !b.known.has(b.look.t)) {
      let best = null;
      for (const [t, k] of b.known) if (!k.seen && (!best || k.age < best[1].age)) best = [t, k];
      if (!best) { b.look = null; return false; }
      b.look = { t: best[0], x: best[1].x, z: best[1].z, arrived: false, timer: 0, base: f.yaw, stuck: 0, lx: f.x, lz: f.z };
    }
    const L = b.look, k = b.known.get(L.t);
    if (k.age < 0.5) { L.x = k.x; L.z = k.z; L.arrived = false; }   // 新しく分かった（音がまた聞こえた）
    b.input.attack = false; b.input.guard = false; b.input.left = false;
    const d = Math.hypot(L.x - f.x, L.z - f.z);
    setStance(f, d < 12 || L.arrived ? 'crouch' : 'stand');   // 近くまで来たら、しゃがんで忍び寄る
    if (!L.arrived && d > 1.6) {
      // 歩いて近づく（遠ければ走る）。動けていなければ諦める
      if (Math.hypot(f.x - L.lx, f.z - L.lz) < 0.12) L.stuck += 0.25; else L.stuck = 0;
      L.lx = f.x; L.lz = f.z;
      if (L.stuck > 2.5) { b.known.delete(L.t); b.look = null; return false; }
      b.input.yaw = yawTo(f, L.x, L.z);
      b.input.forward = 1; b.input.strafe = 0; b.input.run = d > 12;
      return true;
    }
    // 着いた：その場で左右を見回す
    if (!L.arrived) { L.arrived = true; L.timer = 0; L.base = f.yaw; }
    L.timer += 0.25;
    b.input.forward = 0; b.input.strafe = 0; b.input.run = false;
    b.input.yaw = L.base + Math.sin(L.timer * 1.3) * 95;
    if (L.timer > SENSES.lookAround) { b.known.delete(L.t); b.look = null; }
    return true;
  }

  /**
   * 待ち伏せ：見えない相手（音で分かった）が近いとき、近くの壁へ行って背を付ける
   * @returns {boolean} 壁へ向かっている（または着いて隠れた）か
   */
  function ambush(world) {
    const C = world.cover;
    if (!C) return false;
    if (!b.ambush) {
      if (b.ambushCooldown > 0) return false;
      let foe = null;
      for (const [t, k] of b.known) if (!k.seen && k.age < 1 && Math.hypot(k.x - f.x, k.z - f.z) < 16) { foe = k; break; }
      if (!foe) return false;
      b.ambushCooldown = 12;
      if (rng.next() > 0.55) return false;
      const spot = C.nearest(f, 7);
      if (!spot) return false;
      const p = { x: spot.seg.ax + spot.seg.tx * spot.t, z: spot.seg.az + spot.seg.tz * spot.t };
      const y = (f.y ?? 0) + 0.5;
      if (world.sight?.blocked([f.x, y, f.z], [p.x, y, p.z])) return false;   // 壁の向こう側など、まっすぐ行けない所は選ばない
      // 覗く向き：相手が来る側（背を付けたときの右か左か）
      const rx = -spot.seg.nz, rz = spot.seg.nx;
      b.ambush = { spot, p, side: (foe.x - p.x) * rx + (foe.z - p.z) * rz > 0 ? 'r' : 'l', wait: 12 + rng.next() * 10, stuck: 0, lx: f.x, lz: f.z };
    }
    const A = b.ambush, d = Math.hypot(A.p.x - f.x, A.p.z - f.z);
    if (d < 0.45) {
      b.ambush = null;
      if (C.enter(f, A.spot, A.side)) { b.coverTimer = A.wait; b.ambushCooldown = 30; return true; }
      return false;
    }
    if (Math.hypot(f.x - A.lx, f.z - A.lz) < 0.1) A.stuck += 0.25; else A.stuck = 0;
    A.lx = f.x; A.lz = f.z;
    if (A.stuck > 2) { b.ambush = null; return false; }
    setStance(f, 'stand');
    b.input.yaw = yawTo(f, A.p.x, A.p.z);
    b.input.forward = Math.min(1, d / 1.5 + 0.3); b.input.strafe = 0; b.input.run = false;
    b.input.attack = false; b.input.guard = false; b.input.left = false;
    return true;
  }

  /** 考えて入力を決める（0.15〜0.3 秒ごと） */
  function think(world) {
    b.input.search = false;
    // 隠れている：相手がすぐ前を通れば飛び出して暗殺。時間が来たら出る
    if (f.hidden) {
      b.hideTimer -= 0.25;
      b.input.forward = 0; b.input.strafe = 0; b.input.left = false; b.input.dodge = false;
      const s = f.hidden;
      const near = fighters.some((t) => t !== f && t.alive && !t.hidden && Math.hypot(t.x - s.outX, t.z - s.outZ) < 2.6 && Math.abs((t.y ?? 0) - s.y) < 1.2);
      b.input.attack = near && !b.input.attack && rng.next() < 0.7;
      if (!near && b.hideTimer <= 0) { world.hiding?.exit(f); b.route = { pts: [...s.route].reverse(), i: 0, why: 'leave' }; b.hideCooldown = 20; }
      return;
    }
    // 壁に隠れている：近くに来た相手を暗殺（近くに来たらいつでも）。時間が来たら、または見えている相手が離れていれば壁から離れる
    if (f.cover) {
      b.coverTimer -= 0.25;
      b.input.forward = 0; b.input.strafe = 0; b.input.left = false; b.input.dodge = false; b.input.guard = false;
      perceive(world, b.lastThink || 0.2);
      const near = fighters.some((t) => t !== f && t.alive && !t.hidden && Math.hypot(t.x - f.x, t.z - f.z) < 3.0 && Math.abs((t.y ?? 0) - (f.y ?? 0)) < 1.2);
      b.input.attack = near && !b.input.attack && rng.next() < 0.75;
      const seen = pickTarget();
      if (!near && (b.coverTimer <= 0 || (seen && Math.hypot(seen.x - f.x, seen.z - f.z) > 7 && rng.next() < 0.15))) world.cover?.exit(f);
      return;
    }
    // 暗殺されそう：ときどき回避する（猶予は短い）
    const assassin = fighters.find((t) => t.action?.kind === 'assassinate' && t.action.target === f);
    if (assassin && b.seenAssassin !== assassin.action) {
      b.seenAssassin = assassin.action;
      if (rng.next() < 0.35 && f.stamina > 15) {
        b.input.dodge = true;
        b.input.dodgeX = (rng.next() < 0.5 ? -1 : 1); b.input.dodgeY = -0.4;
        return;
      }
    }
    perceive(world, b.lastThink || 0.2);
    b.target = pickTarget();
    if (b.target) b.look = null;
    if (!b.look) setStance(f, 'stand');   // 探しに行っていなければ立つ（相手が見えたら立って戦う）
    // 近くに隠れている人の息遣いが聞こえたら、その場所を覚えて探す（息が荒いほど気づきやすい）
    if (!b.knownSpot) {
      for (const t of fighters) {
        if (t === f || !t.alive || !t.hidden) continue;
        const d = Math.hypot(t.x - f.x, t.z - f.z);
        if (d > HEAR_REACH || Math.abs((t.y ?? 0) - (f.y ?? 0)) > 1.5) continue;
        if (rng.next() < 0.05 * breathLevel(t) * (1 - d / HEAR_REACH * 0.5)) { b.knownSpot = t.hidden; break; }
      }
    }
    // 体力が少なく、相手が近い：近くのベッドやタンスへ逃げ込む
    b.hideCooldown -= 0.25;
    const H = world.hiding;
    if (H && !b.route && b.hideCooldown <= 0 && b.target && f.stats.hp < f.stats.maxHp * 0.4 && !(b.target.helpless > 0)) {
      const spot = H.freeNear(f.x, f.z, 30);
      b.hideCooldown = 8;
      if (spot) b.route = routeTo(spot, 'hide');
    }
    // 誰かが隠れるのを見た：探しに行く（相手が見えていて、無防備でなければ戦う方が先）
    if (H && !b.route && b.knownSpot && !b.target) b.route = routeTo(b.knownSpot, 'search');
    b.lastX = f.x; b.lastZ = f.z;
    if (b.route) { followRoute(world); if (b.route?.why !== 'leave' || !b.target) return; b.route = null; }
    b.ambushCooldown -= 0.25;
    if (!b.target) { if (!ambush(world) && !investigate(world)) wander(world); return; }
    b.ambush = null;
    const t = b.target, d = Math.hypot(t.x - f.x, t.z - f.z), weapon = w();
    const lowHp = f.stats.hp < f.stats.maxHp * 0.35;
    b.input.run = d > 9;
    b.input.left = false;
    // 弓兵：近づかれたらダガーに持ち替え、離れたら弓に戻す（押して離す 1 回で持ち替え）
    if (f.left === 'switch' && !f.action) {
      const wantMelee = d < 4.5, isMelee = f.weapon !== f.primary;
      if (wantMelee !== isMelee && (wantMelee || d > 9)) { b.input.left = true; b.input.attack = false; return; }
    }

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
      b.input.dodge = false;
      const close = t.action && t.action.kind === 'attack' && d < (WEAPONS[t.weapon].reach || 2) + 1.5;
      if (close && b.dodgeCooldown <= 0 && f.stamina > 25 && rng.next() < 0.5) {
        b.input.dodge = true; b.input.attack = false;
        b.dodgeCooldown = 1 + rng.next();
        b.input.dodgeX = b.strafeDir * 0.5; b.input.dodgeY = -1;
      }
      return;
    }

    // 近接
    const reach = weapon.reach;
    const threat = t.action && t.action.kind === 'attack' && !t.action.hit && d < WEAPONS[t.weapon].reach + 1;
    if (f.shield && b.guardTimer <= 0 && threat && f.stamina > 20 && rng.next() < (lowHp ? 0.75 : 0.45)) b.guardTimer = 0.5 + rng.next() * 0.4;
    b.input.guard = b.guardTimer > 0;
    // 回避：相手の振りかぶりが見えたら、ときどき後ろか横へ避ける（盾があれば防御の方を多く使う）
    b.input.dodge = false;
    const dodgeChance = (f.shield ? 0.12 : 0.4) * (lowHp ? 1.4 : 1);
    if (threat && !b.input.guard && !f.action && b.dodgeCooldown <= 0 && f.stamina > 30 && rng.next() < dodgeChance) {
      b.input.dodge = true;
      b.dodgeCooldown = 1.2 + rng.next() * 1.5;
      const side = rng.next() < 0.5;
      b.input.dodgeX = side ? b.strafeDir : 0;
      b.input.dodgeY = side ? -0.3 : -1;
      return;
    }
    if (d > reach * 0.85) {
      b.input.forward = 1;
      b.input.strafe = 0;
      b.input.attack = false;
    } else {
      b.input.forward = d < reach * 0.5 ? -0.5 : 0;
      b.input.strafe = b.strafeDir * 0.4;
      const facing = Math.abs(wrap(yawTo(f, t.x, t.z) - f.yaw)) < 22;
      // 押して離す（1 回の攻撃）。押しっぱなしにしないよう、次の考えで離す
      const ready = facing && !f.action && !b.input.guard && b.attackCooldown <= 0;
      // 強攻撃（左手）：相手が防御している・ひるんでいるときに多く使う。スタミナが多く要る
      const heavyChance = t.guarding || t.stun > 0 ? 0.55 : 0.18;
      if (f.left === 'heavy' && ready && !b.input.attack && f.stamina > weapon.stamina * 2 && rng.next() < heavyChance) {
        b.input.left = true;
        b.input.attack = false;
        b.attackCooldown = 0.5 + rng.next() * 0.8;
      } else {
        b.input.attack = !b.input.attack && ready && f.stamina > weapon.stamina;
        if (b.input.attack) b.attackCooldown = 0.25 + rng.next() * 0.7;
      }
    }
  }

  return {
    fighter,
    get target() { return b.target; },
    /** 確認用：歩いている道順と、覚えた隠れ場所 */
    get debug() { return { route: b.route && { why: b.route.why, i: b.route.i, pts: b.route.pts.map((q) => [+q.x.toFixed(1), +q.z.toFixed(1)]) }, known: b.knownSpot?.id ?? null, target: b.target?.name ?? null }; },
    /** 誰かが隠れるところを見た */
    knowSpot(spot) { if (!f.hidden) b.knownSpot = spot; },
    update(dt, world) {
      if (!f.alive) return 0;
      b.waitTimer -= dt;
      b.thinkTimer -= dt;
      b.attackCooldown -= dt;
      b.guardTimer -= dt;
      b.dodgeCooldown -= dt;
      b.strafeTimer -= dt;
      if (b.strafeTimer <= 0) { b.strafeTimer = 1 + rng.next() * 2; b.strafeDir = rng.next() < 0.5 ? -1 : 1; }
      if (b.thinkTimer <= 0) { b.lastThink = b.thinkTimer = 0.15 + rng.next() * 0.15; think(world); }

      // 隠れている・壁に隠れている・無防備なときは動かない
      if (f.hidden || f.cover || f.helpless > 0) return 0;
      // 相手がいれば、毎フレーム相手の方を向く（弓は矢が落ちる分だけ上を狙う）。道順を歩いている間は道の方
      const t = b.target;
      if (t && t.alive && !b.route) {
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
      const mag = moveFighter(f, turned, dt, world);
      f.gait = mag > 0.05 ? (turned.run && canRun(f) ? 'run' : 'walk') : 'still';   // 足音の大きさ（game/senses.js）
      return mag;
    },
    /** 攻撃された：攻撃した人の居場所が分かる（見えていなくても。遠くから射られたときなど） */
    alert(attacker) {
      if (!attacker || attacker === f || !attacker.alive) return;
      const k = b.known.get(attacker);
      if (!k?.seen) b.known.set(attacker, { x: attacker.x, y: attacker.y, z: attacker.z, age: 0, seen: false });
    },
    /** 確認用：気づいたことを全部忘れる */
    forget() { b.known.clear(); b.look = null; b.target = null; },
    /** 確認用：気づいている相手 */
    get knows() { return [...b.known].map(([t, k]) => ({ name: t.name, seen: k.seen, age: +k.age.toFixed(1) })); },
    get looking() { return b.look && { name: b.look.t.name, arrived: b.look.arrived }; },
    /** 戦闘の入力（combat.control に渡す） */
    get combatInput() {
      const i = b.input;
      // 左手ボタン：盾持ちは防御、ほかは強攻撃・持ち替え
      return { attack: i.attack, left: f.left === 'guard' ? i.guard : i.left, dodge: i.dodge, moveX: i.dodgeX, moveY: i.dodgeY, search: i.search };
    },
  };
}
