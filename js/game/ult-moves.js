// 英雄ごとの必殺技の中身（2 回目。2026-11-25。docs/DESIGN.md「英雄の属性と必殺技」）。計算だけ（PlayCanvas に依存しない）。
//   数は data.js の ULT_SPECS、技の姿は ULTIMATES の desc（利用者が決めた）。ここに無い英雄は、まだ仮の属性の衝撃波（combat.js の ultBurst）
//   楯劍騎士「大海嘯」：楯を掲げ、足もとから渦を巻く水が湧き上がってあふれ出し、周りに傷と強い吹き飛ばし。その後 10 秒、水の衣（combat.js の aura）
//   劍騎士「雷霆一閃」：閃光で目くらまし → 稲妻の姿で 12 回折れて敵を貫く（しびれ続ける）→ 体に戻って構え → カメラの向きへ一瞬で踏み込んで斬る → 落雷。
//     その後 10 秒、雷の衣（回避と疾驅で稲妻になる。回避は遠くまで・その間は無敵。時々自分に落雷）
//   弓兵「颶風一矢」：鷹の目で建物越しに敵が見え、大弓を引いて嵐の大矢を放つ（人・木・家を貫く。家の壁に通れる穴＝world/arrow-holes.js）。その後 12 秒、鷹の目が続く
//   見た目は render/ult-fx.js、自分の画面のカメラは render/ult-show.js、音は audio/sfx.js が、ここで出す知らせ（emit）で出す
import { ULT_SPECS } from './data.js';

const DEG = Math.PI / 180;
const fwdOf = (yaw) => [-Math.sin(yaw * DEG), -Math.cos(yaw * DEG)];
const yawTo = (f, x, z) => Math.atan2(-(x - f.x), -(z - f.z)) / DEG;
/** 点 (px, pz) と線分 a→b の水平の近さ */
function segDist(px, pz, ax, az, bx, bz) {
  const sx = bx - ax, sz = bz - az, l2 = sx * sx + sz * sz || 1e-9;
  const k = Math.max(0, Math.min(1, ((px - ax) * sx + (pz - az) * sz) / l2));
  return Math.hypot(ax + sx * k - px, az + sz * k - pz);
}

/**
 * @param {object} ctx combat.js から渡す道具：
 *   fighters, match, yOf(f), floorAt(x, z, y), obstacles, sight, keepInside(f, r), shove(f, dx, dz),
 *   damage(t, raw, by, opt), afflict(t, el, amount, by), paralyze(t, by, secs), knock(t, fromX, fromZ, push, stun, time),
 *   addProjectile(p), emit(type, data), rnd()
 */
export function createUltMoves(ctx) {
  const { fighters, yOf, emit } = ctx;
  const rnd = ctx.rnd || Math.random;
  const foes = (f, range, dy = 3) => fighters.filter((t) => t !== f && t.alive && !t.hidden
    && Math.hypot(t.x - f.x, t.z - f.z) <= range && Math.abs(yOf(t) - yOf(f)) <= dy);
  /** 目の高さ同士で見通せるか（壁・岩・木の幹） */
  const sees = (a, b) => !ctx.sight || !ctx.sight.blocked([a.x, yOf(a) + 1.5, a.z], [b.x, yOf(b) + 1.4, b.z], { solidsOnly: true });

  // ===================== 楯劍騎士「大海嘯」 =====================
  const water = {
    start(f, a) { a.burst = false; emit('ultWater', { fighter: f, phase: 'rise' }); },
    update(f, a) {
      const S = ULT_SPECS.shield;
      if (!a.burst && a.t >= S.at) {
        a.burst = true;
        const fy = yOf(f);
        let hits = 0;
        for (const t of foes(f, S.radius, 4)) {
          if (t.invuln > 0) continue;
          const d = Math.hypot(t.x - f.x, t.z - f.z), k = 1 - d / S.radius;
          ctx.damage(t, S.damage * (S.minK + (1 - S.minK) * k), f, { fromX: f.x, fromZ: f.z, kind: 'ult', power: 'h', physical: false });
          if (!t.alive) continue;
          hits++;
          ctx.knock(t, f.x, f.z, S.pushMin + (S.push - S.pushMin) * k, S.stun * (0.6 + 0.4 * k), 1.0 + 0.4 * k);
        }
        emit('ultBurst', { fighter: f, ult: f.ultInfo, x: f.x, y: fy, z: f.z, radius: S.radius, hits });
      }
      return a.t >= S.time;
    },
    end(f) { const A = ULT_SPECS.shield.aura; f.aura = { kind: A.kind, left: A.time, time: A.time, cut: A.cut }; emit('auraStart', { fighter: f, aura: f.aura }); },
  };

  // ===================== 劍騎士「雷霆一閃」 =====================
  /** 稲妻の道：始めの所から turns 回折れる。近くの敵を順に貫き（通り抜けて少し先へ）、敵がいなければ前へ左右にジグザグ */
  function boltPath(f) {
    const B = ULT_SPECS.sword.bolt;
    const targets = foes(f, B.range).filter((t) => sees(f, t));
    const pts = [{ x: f.x, z: f.z, y: yOf(f) }];
    let heading = f.yaw;
    for (let k = 1; k <= B.turns; k++) {
      const prev = pts[pts.length - 1];
      let made = null;
      for (let tries = 0; tries < 6 && !made; tries++) {
        let cx, cz;
        if (targets.length) {
          const tg = targets[(k - 1 + tries) % targets.length];
          const dx = tg.x - prev.x, dz = tg.z - prev.z, dl = Math.hypot(dx, dz) || 1;
          const over = 2.2 + rnd() * 2.2, side = (rnd() - 0.5) * 3.2 * (tries ? 0.5 : 1);
          cx = prev.x + (dx / dl) * (dl + over) - (dz / dl) * side;
          cz = prev.z + (dz / dl) * (dl + over) + (dx / dl) * side;
        } else {
          heading += (k % 2 ? 1 : -1) * (55 + rnd() * 35);
          const [fx, fz] = fwdOf(heading), len = (3 + rnd() * 2.5) * (tries ? 0.6 : 1);
          cx = prev.x + fx * len; cz = prev.z + fz * len;
        }
        const p = { x: cx, z: cz };
        ctx.keepInside(p, ctx.match.areaRadius - 1);
        if (!ctx.obstacles.isFree(p.x, p.z, 0.35, true)) continue;
        const y = ctx.floorAt(p.x, p.z, prev.y);
        if (Math.abs(y - prev.y) > 2.5) continue;
        if (ctx.sight && ctx.sight.blocked([prev.x, prev.y + 1.1, prev.z], [p.x, y + 1.1, p.z], { solidsOnly: true })) continue;
        made = { x: p.x, z: p.z, y };
      }
      pts.push(made || { ...prev });
    }
    return pts;
  }
  /** 稲妻・踏み込みが通った線分 a→b の近くの敵を貫く（同じ線分では 1 人 1 度） */
  function pierceAlong(f, ax, az, bx, bz, width, seen, hit) {
    for (const t of foes(f, 40, 3)) {
      if (seen.has(t) || t.invuln > 0) continue;
      if (segDist(t.x, t.z, ax, az, bx, bz) > width) continue;
      seen.add(t);
      hit(t);
    }
  }
  const thunder = {
    start(f, a) {
      a.flashed = false; a.path = null; a.seg = -1; a.segSeen = null; a.stanced = false; a.dashed = 0; a.struck = false;
      a.aimYaw = null;
      emit('ultThunder', { fighter: f, phase: 'flash' });
    },
    update(f, a, dt) {
      const S = ULT_SPECS.sword, B = S.bolt;
      // 閃光：見えている敵の目がくらむ。体が稲妻になる
      if (!a.flashed && a.t >= S.flash.at) {
        a.flashed = true;
        f.boltForm = true;
        for (const t of foes(f, S.flash.range, 6)) {
          if (t.invuln > 0 || !sees(t, f)) continue;
          t.blind = Math.max(t.blind || 0, S.flash.blind);
          emit('blinded', { fighter: t, time: S.flash.blind, by: f });
        }
        emit('ultThunder', { fighter: f, phase: 'flashed' });
      }
      // 稲妻の姿で折れて走る
      if (a.t >= B.from && a.t < S.stance) {
        if (!a.path) { a.path = boltPath(f); emit('ultThunder', { fighter: f, phase: 'bolt', path: a.path }); }
        const u = Math.min(1, (a.t - B.from) / (B.to - B.from)) * B.turns;
        const i = Math.min(B.turns - 1, Math.floor(u)), k = u - i;
        const p0 = a.path[i], p1 = a.path[i + 1];
        const ox = f.x, oz = f.z;
        f.x = p0.x + (p1.x - p0.x) * k; f.z = p0.z + (p1.z - p0.z) * k; f.y = p0.y + (p1.y - p0.y) * k;
        if (i !== a.seg) { a.seg = i; a.segSeen = new Set(); }
        const left = S.time - a.t + B.para;   // しびれは技が終わるまで続ける
        pierceAlong(f, ox, oz, f.x, f.z, B.width, a.segSeen, (t) => {
          a.hitCount ||= new Map();
          const n = (a.hitCount.get(t) || 0) + 1;
          a.hitCount.set(t, n);
          if (n <= B.maxHits) ctx.damage(t, B.damage, f, { fromX: ox, fromZ: oz, kind: 'ult', power: 'h', physical: false });   // 傷は 1 人 maxHits 回まで
          if (t.alive) ctx.paralyze(t, f, left);
          emit('ultPierce', { fighter: f, target: t, x: t.x, y: yOf(t) + 1, z: t.z });
        });
        if (u >= B.turns - 1e-6) { const e = a.path[B.turns]; f.x = e.x; f.z = e.z; f.y = e.y; }
        if (Math.abs(f.x - ox) + Math.abs(f.z - oz) > 1e-4) f.yaw = yawTo({ x: ox, z: oz }, f.x, f.z);
      }
      // 体に戻って構える：踏み込む向きは、自分ならカメラの向き、bot は一番近い敵の向き
      if (!a.stanced && a.t >= S.stance) {
        a.stanced = true;
        f.boltForm = false;
        const end = a.path ? a.path[a.path.length - 1] : null;
        if (end) { f.x = end.x; f.z = end.z; f.y = end.y; }
        a.aimYaw = f.isPlayer && f._viewYaw != null ? f._viewYaw : (() => {
          let best = null, bd = Infinity;
          for (const t of foes(f, 20)) { const d = Math.hypot(t.x - f.x, t.z - f.z); if (d < bd) { bd = d; best = t; } }
          return best ? yawTo(f, best.x, best.z) : f.yaw;
        })();
        f.yaw = a.aimYaw;
        emit('ultThunder', { fighter: f, phase: 'stance', yaw: a.aimYaw });
      }
      // 一瞬で踏み込んで斬る（壁は抜けない）
      if (a.stanced && a.t >= S.dash.at && a.dashed < 1) {
        if (!a.dashFrom) { a.dashFrom = { x: f.x, z: f.z, y: yOf(f) }; a.dashSeen = new Set(); }
        const D = S.dash, u = Math.min(1, (a.t - D.at) / D.time);
        const goal = D.dist * u, step = goal - (a.dashed * D.dist);
        a.dashed = u;
        const ox = f.x, oz = f.z;
        if (step > 0) { const [fx, fz] = fwdOf(a.aimYaw); ctx.shove(f, fx * step, fz * step); }
        pierceAlong(f, ox, oz, f.x, f.z, D.width, a.dashSeen, (t) => {
          ctx.damage(t, D.damage, f, { fromX: ox, fromZ: oz, kind: 'ult', power: 'h', physical: false });
          emit('ultPierce', { fighter: f, target: t, x: t.x, y: yOf(t) + 1, z: t.z, slash: true });
        });
        if (u >= 1) emit('ultThunder', { fighter: f, phase: 'dashed', from: a.dashFrom, to: { x: f.x, z: f.z, y: yOf(f) } });
      }
      // 最後の落雷
      if (!a.struck && a.t >= S.strike.at) {
        a.struck = true;
        const R = S.strike, fy = yOf(f);
        let hits = 0;
        for (const t of foes(f, R.radius, 4)) {
          if (t.invuln > 0) continue;
          const d = Math.hypot(t.x - f.x, t.z - f.z), k = 1 - d / R.radius;
          ctx.damage(t, R.damage * (0.5 + 0.5 * k), f, { fromX: f.x, fromZ: f.z, kind: 'ult', power: 'h', physical: false });
          if (!t.alive) continue;
          hits++;
          ctx.afflict(t, 'thunder', R.buildup, f);
          ctx.knock(t, f.x, f.z, 2.5 * k + 1, 0.8, 0.8);
        }
        emit('ultBurst', { fighter: f, ult: f.ultInfo, x: f.x, y: fy, z: f.z, radius: R.radius, hits, strike: true });
      }
      return a.t >= S.time;
    },
    end(f) {
      f.boltForm = false;
      const A = ULT_SPECS.sword.aura;
      f.aura = { kind: A.kind, left: A.time, time: A.time, tick: A.every * 0.5 };
      emit('auraStart', { fighter: f, aura: f.aura });
    },
  };

  // ===================== 弓兵「颶風一矢」 =====================
  const wind = {
    start(f, a) {
      const S = ULT_SPECS.archer;
      a.fired = false;
      f.greatBow = true;
      f.hawkEye = Math.max(f.hawkEye || 0, S.time + S.hawk);
      emit('ultWind', { fighter: f, phase: 'draw' });
    },
    update(f, a) {
      const S = ULT_SPECS.archer;
      // bot：放つまで、一番近い敵（建物越しでも鷹の目で分かる）の胸を狙う
      if (!f.isPlayer && !a.fired) {
        let best = null, bd = Infinity;
        for (const t of foes(f, 90, 30)) { const d = Math.hypot(t.x - f.x, t.z - f.z); if (d < bd) { bd = d; best = t; } }
        if (best) { f.yaw = yawTo(f, best.x, best.z); f.pitch = Math.atan2(yOf(best) + 1.2 - (yOf(f) + 1.5), bd) / DEG; }
      }
      if (!a.fired && a.t >= S.release) {
        a.fired = true;
        const A = S.arrow, yaw = f.yaw * DEG, pitch = (f.pitch || 0) * DEG;
        const dir = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
        const x0 = f.x + dir[0] * 0.8, y0 = yOf(f) + 1.5, z0 = f.z + dir[2] * 0.8;
        const p = {
          owner: f, x: x0, y: y0, z: z0, x0, y0, z0,
          vx: dir[0] * A.speed, vy: dir[1] * A.speed, vz: dir[2] * A.speed,
          damage: A.damage, power: 'h', life: A.range / A.speed, stuck: 0,
          pierce: true, storm: true, straight: true, width: A.width, push: A.push, struck: new Set(),
        };
        ctx.addProjectile(p);
        emit('ultWind', { fighter: f, phase: 'release', projectile: p });
      }
      return a.t >= S.time;
    },
    end(f) { f.greatBow = false; emit('auraStart', { fighter: f, aura: { kind: 'wind', left: f.hawkEye, time: ULT_SPECS.archer.hawk } }); },
  };

  const MOVES = { shield: water, sword: thunder, archer: wind };
  return {
    /** その人に英雄ごとの必殺技があるか（無ければ仮の属性の衝撃波） */
    has: (f) => !!MOVES[f.char],
    /** 動きの長さ（秒） */
    time: (f) => ULT_SPECS[f.char]?.time,
    start(f, a) { MOVES[f.char].start(f, a); },
    /** 進める。終わったら true */
    update(f, a, dt) { return MOVES[f.char].update(f, a, dt); },
    /** 終わった（纏う物を付ける） */
    end(f) { MOVES[f.char].end(f); },
    /** 途中で止まった（倒れた・試合が終わった） */
    cancel(f) { f.boltForm = false; f.greatBow = false; },
  };
}
