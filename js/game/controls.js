// 操（属性強化の 2 段目。2026-11-28。docs/DESIGN.md「英雄の属性と必殺技」）。計算だけ（PlayCanvas に依存しない）。
//   刻の報酬で「操」を選ぶと、操ボタン（PC は B）で、その人の属性を操る技が出せる（待ち時間あり）。数は data.js の CONTROL
//   楯劍騎士「水鞭」：前をなぎ払う水の鞭。濡を溜め、引き寄せる
//   劍騎士「雷步」：見ている向きへ稲妻になって移る（その間は無敵）。通り道の敵に雷
//   長柄騎士「岩壁」：前に岩の壁。攻撃と矢を止め、人も通れない（受けすぎると崩れる）
//   打擊騎士「爆炎」：前の地面を叩いて爆炎。炎を溜め、地面に火
//   弓兵「旋風」：まわりに旋風。近くの敵を吹き飛ばして崩を溜め、しばらく矢と飛ぶ奇跡をそらす
//   祓魔僧「聖化」：ボタンは増えない。奇跡の待ち時間が短くなり、攻める奇跡が当たると眩が溜まる（combat.js と miracles.js）
//   見た目は render/ult-hero-fx.js、音は audio/sfx.js が、ここで出す知らせ（'ctrlFx'）で出す
import { CONTROL, COMBAT } from './data.js';

const DEG = Math.PI / 180;
const wrap = (a) => ((a + 540) % 360) - 180;
const fwdOf = (yaw) => [-Math.sin(yaw * DEG), -Math.cos(yaw * DEG)];
const angleTo = (yaw, dx, dz) => Math.abs(wrap(Math.atan2(-dx, -dz) / DEG - yaw));
/** 点 (px, pz) と線分 a→b の水平の近さ */
function segDist(px, pz, ax, az, bx, bz) {
  const sx = bx - ax, sz = bz - az, l2 = sx * sx + sz * sz || 1e-9;
  const k = Math.max(0, Math.min(1, ((px - ax) * sx + (pz - az) * sz) / l2));
  return Math.hypot(ax + sx * k - px, az + sz * k - pz);
}

/** その人の操の数（無ければ null） */
export const ctrlSpec = (f) => CONTROL[f?.char] || null;
/** 操を覚えていて、操ボタンで出す技がある（祓魔僧はボタンが無い） */
export function hasControl(f) { const S = ctrlSpec(f); return !!(f?.ctrl && S && !S.passive); }
/** 待ち時間の残り（秒） */
export const controlCool = (f) => f?.ctrl?.cool || 0;
/** 今出せるか（待ち時間が無い） */
export const controlReady = (f) => hasControl(f) && controlCool(f) <= 0;
/** 祓魔僧の聖化：奇跡の待ち時間にかける割合（ほかの人は 1） */
export function miracleCdScale(f) { const S = ctrlSpec(f); return f?.ctrl && S?.passive ? 1 - S.cdCut : 1; }
/** 祓魔僧の聖化：攻める奇跡が当たった時に溜める眩（ほかの人は 0） */
export function holyMark(f) { const S = ctrlSpec(f); return f?.ctrl && S?.passive ? S.buildup : 0; }
/** 操の動き（動きの名前・効く秒・動きの長さ）。打擊騎士は武器ごと */
export function ctrlMotion(f) {
  const S = ctrlSpec(f);
  if (!S) return null;
  if (S.clip && typeof S.clip === 'object') {
    const [clip, at, time] = S.clip[f.weapon] || Object.values(S.clip)[0];
    return { clip, at, time };
  }
  return { clip: S.clip, at: S.at, time: S.time };
}

/**
 * @param {object} ctx combat.js から渡す道具：
 *   fighters, yOf(f), floorAt(x, z, y), obstacles, sight, shove(f, dx, dz), walls, breakWall(w, broke),
 *   elementHit(t, by, el, raw, buildup, opt), afflict(t, el, amount, by), knock(t, fromX, fromZ, push, stun, time), fan(t, by),
 *   kindle(spot, y, owner), guardsFront(t, fromX, fromZ), emit(type, data), rnd()
 */
export function createControls(ctx) {
  const { fighters, yOf, emit } = ctx;
  const rnd = ctx.rnd || Math.random;
  const foes = (f, range, dy = 1.8) => fighters.filter((t) => t !== f && t.alive && !t.hidden && !(t.invuln > 0)
    && Math.hypot(t.x - f.x, t.z - f.z) <= range && Math.abs(yOf(t) - yOf(f)) <= dy);
  /** 目の高さ同士で見通せるか（壁・岩・木の幹） */
  const sees = (a, bx, by, bz) => !ctx.sight || !ctx.sight.blocked([a.x, yOf(a) + 1.2, a.z], [bx, by, bz], { solidsOnly: true });

  // ===================== 楯劍騎士「水鞭」 =====================
  function whip(f) {
    const S = CONTROL.shield, fy = yOf(f);
    let hits = 0;
    for (const t of foes(f, S.range + COMBAT.bodyRadius)) {
      const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz);
      if (d > 0.6 && angleTo(f.yaw, dx, dz) > S.arc / 2) continue;
      if (!sees(f, t.x, yOf(t) + 1.1, t.z)) continue;
      const guarded = ctx.guardsFront(t, f.x, f.z);
      if (!ctx.elementHit(t, f, 'water', S.damage, S.buildup, { fromX: f.x, fromZ: f.z, kind: 'control', power: 'l' })) continue;
      hits++;
      // 引き寄せる（楯で受けた相手は引かれない。近すぎる相手もそのまま）：相手の後ろから押すと、こちらへ寄る
      const pull = Math.min(S.pull, d - 1.3);
      if (!guarded && t.alive && pull > 0.1) ctx.knock(t, t.x + dx / d, t.z + dz / d, pull, 0.45, 0.35);
    }
    emit('ctrlFx', { fighter: f, kind: 'whip', x: f.x, y: fy, z: f.z, yaw: f.yaw, range: S.range, arc: S.arc, hits });
  }

  // ===================== 劍騎士「雷步」 =====================
  function boltStart(f, a) {
    const S = CONTROL.sword, yaw = f._viewYaw ?? f.yaw, [dx, dz] = fwdOf(yaw);
    f.yaw = yaw;
    f.boltForm = true;
    f.invuln = Math.max(f.invuln || 0, S.travel + 0.12);
    a.bolt = { x0: f.x, z0: f.z, y0: yOf(f), dx, dz, moved: 0, struck: new Set(), t: 0 };
    emit('ctrlFx', { fighter: f, kind: 'bolt', phase: 'start', x: f.x, y: yOf(f), z: f.z, yaw });
  }
  function boltStep(f, a, dt) {
    const S = CONTROL.sword, B = a.bolt;
    B.t += dt;
    const goal = Math.min(S.dist, (S.dist * B.t) / S.travel), step = goal - B.moved;
    const ox = f.x, oz = f.z;
    if (step > 0) {
      const [mx, mz] = ctx.shove(f, B.dx * step, B.dz * step);
      // 壁・木にぶつかって進めない：そこで止まる
      if (Math.hypot(mx, mz) < step * 0.35) B.moved = S.dist;
      else B.moved = goal;
    }
    // 通り道の敵：雷の傷と雷を溜める（1 人に 1 度）
    for (const t of foes(f, S.dist + 2, 2)) {
      if (B.struck.has(t)) continue;
      if (segDist(t.x, t.z, ox, oz, f.x, f.z) > S.width / 2 + COMBAT.bodyRadius) continue;
      B.struck.add(t);
      ctx.elementHit(t, f, 'thunder', S.damage, S.buildup, { fromX: ox, fromZ: oz, kind: 'control', power: 'l' });
    }
    if (B.moved >= S.dist) boltEnd(f, a);
  }
  function boltEnd(f, a) {
    const B = a.bolt;
    if (!B || B.done) return;
    B.done = true;
    f.boltForm = false;
    emit('ctrlFx', { fighter: f, kind: 'bolt', phase: 'end', x0: B.x0, y0: B.y0, z0: B.z0, x: f.x, y: yOf(f), z: f.z, hits: B.struck.size });
  }

  // ===================== 長柄騎士「岩壁」 =====================
  function rockWall(f) {
    const S = CONTROL.polearm, [fx, fz] = fwdOf(f.yaw), rx = Math.cos(f.yaw * DEG), rz = -Math.sin(f.yaw * DEG);
    for (const w of [...ctx.walls]) if (w.owner === f && w.kind === 'rock') ctx.breakWall(w, false);   // 1 人 1 枚
    const x = f.x + fx * S.ahead, z = f.z + fz * S.ahead, y = ctx.floorAt(x, z, yOf(f));
    const w = { kind: 'rock', solid: true, owner: f, x, z, y, yaw: f.yaw, half: S.width / 2, height: S.height, left: S.life, life: S.life,
      guard: S.hp, id: rnd(), obs: [], box: null };
    // 人が通れない：壁に沿って円を並べる（その高さの人だけ。下の洞窟の人には当てない）。bot の目・三人称のカメラ・太陽もさえぎる
    const n = Math.ceil(S.width / 0.7) + 1;
    for (let i = 0; i < n; i++) {
      const v = -w.half + (i / (n - 1)) * S.width;
      const o = ctx.obstacles.add?.(x + rx * v, z + rz * v, 0.42, true, { y0: y - 1.2, y1: y + S.height });
      if (o) w.obs.push(o);
    }
    w.box = ctx.sight?.addYawBox?.(x, y - 0.2, z, S.width, 0.7, S.height + 0.2, f.yaw) || null;
    ctx.walls.push(w);
    emit('wallUp', { wall: w });
    emit('ctrlFx', { fighter: f, kind: 'wall', x, y, z, yaw: f.yaw, wall: w });
  }

  // ===================== 打擊騎士「爆炎」 =====================
  function blast(f) {
    const S = CONTROL.blunt, [fx, fz] = fwdOf(f.yaw), fy = yOf(f);
    // 叩く所：前 ahead m（途中に壁・木があれば、その手前）
    let d = 0.6;
    for (let s = 0.6; s <= S.ahead + 1e-6; s += 0.4) {
      const px = f.x + fx * s, pz = f.z + fz * s;
      if (ctx.obstacles.isFree && !ctx.obstacles.isFree(px, pz, 0.2, true)) break;
      if (!sees(f, px, fy + 0.6, pz)) break;
      d = s;
    }
    const cx = f.x + fx * d, cz = f.z + fz * d, cy = ctx.floorAt(cx, cz, fy);
    let hits = 0;
    for (const t of foes(f, d + S.radius + 1, 2.2)) {
      const r = Math.hypot(t.x - cx, t.z - cz);
      if (r > S.radius + COMBAT.bodyRadius || Math.abs(yOf(t) - cy) > 2) continue;
      const k = Math.max(0, 1 - r / S.radius);
      const guarded = ctx.guardsFront(t, cx, cz);
      if (!ctx.elementHit(t, f, 'fire', S.damage * (0.55 + 0.45 * k), S.buildup * (0.6 + 0.4 * k), { fromX: cx, fromZ: cz, kind: 'control', power: 'h' })) continue;
      hits++;
      if (!guarded && t.alive) ctx.knock(t, cx, cz, S.push * (0.5 + 0.5 * k), 0.5, 0.5);
    }
    // 地面の火：叩いた所のまわりに fires か所
    for (let i = 0; i < S.fires; i++) {
      const a = (i / S.fires) * Math.PI * 2 + rnd() * 0.8, r = 0.5 + rnd() * (S.radius * 0.5);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      ctx.kindle?.({ kind: 'grass', x, z }, ctx.floorAt(x, z, cy), f);
    }
    emit('ctrlFx', { fighter: f, kind: 'blast', x: cx, y: cy, z: cz, radius: S.radius, hits });
  }

  // ===================== 弓兵「旋風」 =====================
  function gale(f) {
    const S = CONTROL.archer, fy = yOf(f);
    f.gale = { left: S.life, time: S.life, r: S.radius };
    let hits = 0;
    for (const t of foes(f, S.radius + COMBAT.bodyRadius, 2)) {
      hits++;
      ctx.knock(t, f.x, f.z, S.push, S.stun, 0.6);         // 先に吹き飛ばす（崩で吹き飛ぶ時は、同じ向きのまま）
      if (t.burn || t.blaze) ctx.fan(t, f);               // 煽火：燃えている相手に風が当たると、まわりへ燃え広がる
      ctx.afflict(t, 'wind', S.buildup, f);
    }
    emit('ctrlFx', { fighter: f, kind: 'gale', phase: 'start', x: f.x, y: fy, z: f.z, radius: S.radius, life: S.life, hits });
  }

  return {
    /** 操を始める（combat.js が、出せる時だけ呼ぶ）。待ち時間は効いた時に始まる（効く前に途切れたら、待ち時間は無い） */
    start(f) {
      const M = ctrlMotion(f), S = ctrlSpec(f);
      f.action = { kind: 'control', t: 0, fired: false, at: M.at, time: M.time, clip: M.clip, id: f.char };
      emit('control', { fighter: f, spec: S, clip: M.clip, time: M.time, at: M.at });
      return f.action;
    },
    /** 1 歩進める。終わったら true */
    update(f, a, dt) {
      const S = ctrlSpec(f);
      if (!a.fired && a.t >= a.at) {
        a.fired = true;
        f.ctrl.cool = S.cd;
        if (f.char === 'shield') whip(f);
        else if (f.char === 'sword') boltStart(f, a);
        else if (f.char === 'polearm') rockWall(f);
        else if (f.char === 'blunt') blast(f);
        else if (f.char === 'archer') gale(f);
      }
      if (a.bolt && !a.bolt.done) boltStep(f, a, dt);
      return a.t >= a.time;
    },
    /** 終わった・途切れた（稲妻の姿を戻す） */
    end(f, a) { if (a?.bolt) boltEnd(f, a); if (f.boltForm && f.action?.kind !== 'ult') f.boltForm = false; },
    /** 毎フレーム：待ち時間と旋風の残り */
    tick(f, dt) {
      if (f.ctrl?.cool > 0) f.ctrl.cool = Math.max(0, f.ctrl.cool - dt);
      if (f.gale) {
        f.gale.left -= dt;
        if (f.gale.left <= 0 || !f.alive) { f.gale = null; emit('ctrlFx', { fighter: f, kind: 'gale', phase: 'end', x: f.x, y: yOf(f), z: f.z }); }
      }
    },
    /** (x, y, z) が、owner 以外の誰かの旋風の中か。中なら、その人 */
    galeAt(x, y, z, owner) {
      for (const g of fighters) {
        if (!g.gale || g === owner || !g.alive) continue;
        const gy = yOf(g);
        if (y < gy - 0.5 || y > gy + 4) continue;
        if (Math.hypot(x - g.x, z - g.z) <= g.gale.r) return g;
      }
      return null;
    },
  };
}
