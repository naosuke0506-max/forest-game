// 隠れる・探す（計算だけ。PlayCanvas に依存しない）。
//   隠れ場所：家の中のベッドの下とタンスの中（world/house-builder.js が場所を記録する）。1 か所に 1 人
//   隠れる：近く（同じ階・1.7m 以内）の隠れ場所へ。隠れている間は見つからず、攻撃も当たらない。動けないが外を覗ける
//   出る：隠れ場所の前へ出る
//   探す：近くの隠れ場所を開けて探す。誰かいれば、その人は隠れ場所から出され、見つけた人がそのまま引きずり出して止めを刺す
//     （隠れる・出る・探す・引きずり出す動きの流れは game/hide-acts.js。ここは誰が入っているかだけ）
//   すでに誰かが隠れている所に隠れようとしたら、見つけたのと同じ
import { resetStance } from './stance.js';

export const HIDE_REACH = 1.7;   // 隠れる・探すことができる近さ（m）
export const SEARCH_TIME = 0.6;  // 探す（開ける）のにかかる時間（秒）
export const HELPLESS = 2.6;     // 見つかった人が無防備でいる時間（秒）
export const HIDE_BREATH = 1.2;  // 隠れている間は、息遣いが 1.2 倍大きい（息を潜めても、狭い所では響く）
export const HEAR_REACH = 4.5;   // 隠れている人の息が聞こえる近さ（m）

/**
 * (x, z) が部屋の内側か（room：world/house-builder.js が隠れ場所に付ける { x, z, yaw, hw, z0, z1 }。家の中の座標で、
 * 横 -hw〜hw・前後 z0〜z1 が壁の内側）。壁の厚さの分だけ内へ寄せて見る。部屋の無い隠れ場所（確かめ用）は、どこからでもよい
 */
export function inRoom(room, x, z, margin = 0.05) {
  if (!room) return true;
  const a = (room.yaw * Math.PI) / 180, dx = x - room.x, dz = z - room.z;
  const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
  return Math.abs(lx) <= room.hw - margin && lz >= room.z0 + margin && lz <= room.z1 - margin;
}

/**
 * 息遣いの大きさ（0〜1 くらい）：スタミナが減るほど荒い。隠れている間は 1.2 倍
 * 音（audio/sfx.js）と、bot が隠れている人に気づく確からしさ（game/bot.js）に使う
 */
export function breathLevel(f) {
  const s = Math.max(0, Math.min(1, f.stamina / (f.stats?.maxStamina || 100)));
  const base = 0.25 + 0.75 * Math.max(0, (0.7 - s) / 0.7);
  return base * (f.hidden ? HIDE_BREATH : 1);
}

/**
 * @param {object[]} spots 隠れ場所 { kind: 'bed' | 'wardrobe', x, z, y, yaw, eyeX, eyeZ, eyeH, outX, outZ, route }
 */
export function createHiding(spots) {
  const listeners = {};
  const emit = (type, data) => (listeners[type] || []).forEach((fn) => fn(data));
  spots.forEach((s, i) => { s.id = i; s.occupant = null; });

  /** 隠れ場所から出す（出た所に立たせる） */
  function release(f) {
    const s = f.hidden;
    if (!s) return;
    s.occupant = null;
    f.hidden = null;
    f.x = s.outX; f.z = s.outZ; f.y = s.y;
    f.yaw = s.yaw + 180;   // 出た向き（外を向く。戦う人の向きは -Z が前）
  }

  const m = {
    spots,
    on(type, fn) { (listeners[type] ||= []).push(fn); return m; },

    /**
     * f の近くの隠れ場所（同じ家の同じ階の部屋の中にいて、reach 以内の一番近い所）。
     * 家の外から、壁越しに隠れたり探したりはできない（利用者の指示 2026-11-14）
     */
    nearest(f, reach = HIDE_REACH) {
      let best = null, bd = reach;
      const y = f.y ?? 0;
      for (const s of spots) {
        if (s.occupant === f || Math.abs(s.y - y) > 1.0) continue;
        if (!inRoom(s.room, f.x, f.z)) continue;
        const d = Math.hypot(s.x - f.x, s.z - f.z);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    },

    /** 空いている隠れ場所のうち、近い所（bot が逃げ込む先を選ぶ） */
    freeNear(x, z, maxDist) {
      let best = null, bd = maxDist;
      for (const s of spots) {
        if (s.occupant) continue;
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    },

    /**
     * 隠れる。すでに誰かがいれば、隠れられずにその人を見つける（{ found }）。隠れたら { hidden: true }
     */
    hide(f, s) {
      if (!f.alive || f.hidden || !s) return null;
      if (s.occupant && s.occupant !== f) return m.reveal(f, s);
      const from = { x: f.x, z: f.z, y: f.y };   // 隠れる前に立っていた所（見られたかどうかは、ここで決める）
      s.occupant = f;
      f.hidden = s;
      resetStance(f);   // 隠れたら立った姿勢に（出たときも立っている）
      f.x = s.x; f.z = s.z; f.y = s.y;
      f.action = null; f.guarding = false;
      emit('hide', { fighter: f, spot: s, from });
      return { hidden: true };
    },

    /** 出る */
    exit(f) {
      if (!f.hidden) return;
      const s = f.hidden;
      release(f);
      emit('exit', { fighter: f, spot: s });
    },

    /** 開けて中を見る（探すの結果）。誰かいれば隠れ場所から出す（引きずり出して止めを刺すのは game/hide-acts.js） */
    reveal(searcher, s) {
      const v = s.occupant;
      if (!v || v === searcher) { emit('empty', { searcher, spot: s }); return { found: null }; }
      release(v);
      resetStance(v);
      v.action = null; v.guarding = false;
      v.foundBy = searcher;
      emit('found', { searcher, victim: v, spot: s });
      return { found: v };
    },

    /** 倒れた人は隠れ場所から外す */
    drop(f) { if (f.hidden) release(f); },
  };
  return m;
}
