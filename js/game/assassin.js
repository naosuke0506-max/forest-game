// 暗殺（計算だけ。PlayCanvas に依存しない。game/combat.js から使う）。暗殺ボタン（攻擊ボタンとは別）で、近くの相手を一撃で倒す
//   できるとき：壁裏隠れ・隠れ場所（タンス・ベッド）から飛び出すときだけ（見られていてもよい。利用者の指示 2026-11-10：何もない所ではできない）
//   避ける猶予：いつもある（ASSASSIN.grace 秒の間に相手が回避すると失敗。bot は game/bot.js の確率で避ける）
//   動き：武器ごと（data.js の ASSASSIN.byWeapon）。片手劍は背中側なら背刺・前横なら滑斬、鎚矛・戰鎚・長柄鎚・短劍は背中側からの専用の動き
//         （相手にもされる側の動きを流す）。専用の動きの無い所は、飛びかかって強い一撃
//   流れ：飛びかかる（approach。動き始めの所まで素早く寄る）→ 動き（strike。決まった時刻に止めを刺す）→ 動き終わりの所へ体を移す
// 数値は game/data.js の ASSASSIN
import { ASSASSIN } from './data.js';
import { inRoom } from './hiding.js';

const DEG = Math.PI / 180;
const wrap = (a) => ((a + 540) % 360) - 180;
/** from から to への向き（度。戦う人の向きの約束：-Z が前） */
const yawToward = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z)) / DEG;
const fwdOf = (yaw) => [-Math.sin(yaw * DEG), -Math.cos(yaw * DEG)];
const rightOf = (yaw) => [Math.cos(yaw * DEG), -Math.sin(yaw * DEG)];
const PLAIN = { approachTo: 0.9, kill: 0.25, time: 0.7 };   // 片手劍を持たない人：0.9 m まで寄って強い一撃

/**
 * @param {object} o
 * @param {object[]} o.fighters
 * @param {object} [o.senses] 目（game/senses.js。相手に見られているか）
 * @param {(f: object) => number} o.yOf 足の高さ
 * @param {(f: object, dx: number, dz: number) => void} o.move 動かす（木や壁を避ける）
 * @param {(t: object, f: object, how: string) => void} o.lethal 一撃で倒す
 * @param {(type: string, data: object) => void} o.emit
 */
export function createAssassin({ fighters, senses, yOf, move, lethal, emit }) {
  /** f が t を暗殺できるか。できれば { grace（避ける猶予があるか） }、できなければ null */
  function check(f, t) {
    if (!f.alive || !t.alive || t === f || t.hidden) return null;
    if (t.action?.kind === 'assassinated') return null;   // ほかの人に暗殺されている
    if (f.action?.kind === 'assassinate' || f.action?.kind === 'assassinated') return null;
    const ox = f.hidden ? f.hidden.outX : f.x, oz = f.hidden ? f.hidden.outZ : f.z, oy = f.hidden ? f.hidden.y : yOf(f);
    if (Math.hypot(t.x - ox, t.z - oz) > ASSASSIN.reach) return null;
    if (Math.abs(yOf(t) - oy) > 1.3) return null;
    // 壁越しにはできない：タンス・ベッドからは同じ部屋の中の相手だけ、壁裏隠れからは壁の前（外へ向く側）の相手だけ
    if (f.hidden && !inRoom(f.hidden.room, t.x, t.z, -0.3)) return null;
    if (f.cover && (t.x - f.x) * f.cover.seg.nx + (t.z - f.z) * f.cover.seg.nz < -0.15) return null;
    // 暗殺できるのは、隠れ場所（タンス・ベッド）と壁裏隠れから飛び出すときだけ（利用者の指示 2026-11-10：何もない所ではできない）。
    // 見られていてもよいが、避ける猶予がある
    if (f.hidden || f.cover) return { grace: true };
    return null;
  }

  /** f の近くで暗殺できる、一番近い相手と、その条件 { target, grace } か null */
  function find(f) {
    let best = null, bd = Infinity;
    for (const t of fighters) {
      const c = check(f, t);
      if (!c) continue;
      const d = Math.hypot(t.x - f.x, t.z - f.z);
      if (d < bd) { bd = d; best = { target: t, grace: c.grace }; }
    }
    return best;
  }

  /** 暗殺を始める（隠れ場所・壁裏から出すのは呼ぶ側）。相手の背中側か前・横かで、武器ごとの動きを選ぶ */
  function start(f, t, grace) {
    const behind = Math.abs(wrap(yawToward(t, f) - (t.yaw + 180))) < 70;
    const set = ASSASSIN.byWeapon[f.weapon], key = set && (behind ? set.back : set.front);
    const mv = key ? ASSASSIN.moves[key] : null;
    // 前・横から bot を暗殺するときも、避ける猶予がある（bot が 40%、見つけている相手なら必ず避ける。game/bot.js。利用者の指示 2026-11-10）
    const dodgeable = !!grace || (!behind && !t.isPlayer);
    f.action = { kind: 'assassinate', t: 0, target: t, phase: 'approach', move: mv, back: behind, grace: dodgeable, dodged: false, hit: false };
    f.guarding = false;
    emit('assassinate', { attacker: f, target: t });
  }

  /** 飛びかかる先（位置と向き）：背刺は相手の真後ろ、滑斬は相手の前（今いる側）、ほかは相手の 0.9 m 手前 */
  function goal(f, a) {
    const t = a.target;
    if (a.move && a.back) {
      const [fx, fz] = fwdOf(t.yaw);
      return { x: t.x - fx * a.move.gap, z: t.z - fz * a.move.gap, yaw: t.yaw };
    }
    let dx = f.x - t.x, dz = f.z - t.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const gap = a.move ? a.move.gap : PLAIN.approachTo;
    const g = { x: t.x + dx * gap, z: t.z + dz * gap };
    g.yaw = yawToward(g, t);
    return g;
  }

  /** 進める（毎フレーム。a.t はもう進めてある） */
  function update(f, a, dt) {
    const t = a.target;
    if (a.phase === 'approach') {
      if (!t.alive) { f.action = null; return; }
      if (a.grace && t.action?.kind === 'dodge') a.dodged = true;
      const g = goal(f, a);
      const dx = g.x - f.x, dz = g.z - f.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, ASSASSIN.dash * dt);
      if (d > 1e-3) move(f, (dx / d) * step, (dz / d) * step);
      f.yaw = g.yaw;
      const arrived = d - step < 0.06 || a.t > 0.9;
      if (a.t < (a.grace ? ASSASSIN.grace : 0) || !arrived) return;
      if (a.dodged || t.hidden) {   // 猶予の間に避けられた
        f.stun = 0.8;
        f.action = null;
        emit('assassinFail', { attacker: f, target: t });
        return;
      }
      // 動き始め：位置と向きを合わせ、相手を「される側」にする（滑斬は相手がこちらを向く）
      f.x = g.x; f.z = g.z; f.yaw = g.yaw;
      if (a.move) {
        if (!a.back) t.yaw = yawToward(t, f);
        t.action = { kind: 'assassinated', t: 0, clip: a.move.victim, by: f };
        t.guarding = false;
      }
      a.phase = 'strike';
      a.t = 0;
      return;
    }
    // 動き：決まった時刻に止めを刺す
    const killAt = a.move ? a.move.kill : PLAIN.kill;
    if (!a.hit && a.t >= killAt) {
      a.hit = true;
      if (t.alive) lethal(t, f, 'assassinate');
    }
    if (a.t >= (a.move ? a.move.time : PLAIN.time)) {
      // 動き終わりの体の位置と向き（滑斬は相手を通り過ぎて振り向いている）。見た目は動きの最後の姿のまま切り替える
      if (a.move) {
        const e = a.move.end, [fx, fz] = fwdOf(f.yaw), [rx, rz] = rightOf(f.yaw);
        if (e.r || e.f) move(f, rx * e.r + fx * e.f, rz * e.r + fz * e.f);
        f.yaw -= e.yaw;   // 右回りが正（向きの角度は左回りが正）
        f.snapPose = true;
      }
      f.action = null;
    }
  }

  /** 暗殺する人が止めを刺す前に倒れた・ひるんだ：される側を放す */
  function cancel(f) {
    const a = f.action;
    if (a?.kind !== 'assassinate' || a.hit) return;
    if (a.target.action?.kind === 'assassinated' && a.target.action.by === f) a.target.action = null;
  }

  return { check, find, start, update, cancel };
}
