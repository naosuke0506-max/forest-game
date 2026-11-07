// 壁裏隠れ（計算だけ。PlayCanvas に依存しない）
//   家の外の壁と中の壁に沿った線（world/house-builder.js が登録する）に背を付けて、待ち構える
//   近く（COVER_REACH）の壁で「壁に隠れる」。移動スティックを倒すと、壁に背を付けたまま壁際を左右へ歩く
//   隠れていても見つかることはある（bot の目と耳はふだんと同じ。game/senses.js）。近くに来た相手は、いつでも暗殺できる（game/combat.js）
//   壁から離れるのは、「離壁」で離れたとき・暗殺したとき・攻撃を受けたとき・倒れたときだけ（ほかのボタンでは離れない）
// 線：a→b（世界の座標 x, z）、n（壁から外へ向く向き＝背を付けた人の向く向き）、y（床の高さ。外の壁は null で地面の高さ）
import { resetStance } from './stance.js';

export const COVER_REACH = 0.9;   // 壁の線からこれだけ近ければ「壁に隠れる」が出る（m）
export const COVER_SPEED = 1.1;   // 壁に沿った横歩きの速さ（m/秒）
const END = 0.2;                  // 線の端からこれだけ内側までしか行けない

/**
 * @param {object[]} segments 壁の線 { ax, az, bx, bz, nx, nz, y, inside }
 * @param {{ isFree: Function, groundAt: Function }} opt isFree：その場所に物が無いか、groundAt：立てる高さ
 */
export function createCover(segments, { isFree, groundAt }) {
  const listeners = {};
  const emit = (type, data) => (listeners[type] || []).forEach((fn) => fn(data));
  for (const s of segments) {
    s.len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    s.tx = (s.bx - s.ax) / s.len; s.tz = (s.bz - s.az) / s.len;
  }
  const pointOf = (s, t) => ({ x: s.ax + s.tx * t, z: s.az + s.tz * t });
  const yOf = (s, p, y) => (s.y ?? groundAt(p.x, p.z, y ?? null));
  const free = (p) => isFree(p.x, p.z, 0.15, true);
  /** 背を付けた人の向き（度。戦う人の向きの約束：-Z が前） */
  const yawOf = (s) => (Math.atan2(-s.nx, -s.nz) * 180) / Math.PI;

  /** 線の上の位置へ置く */
  function place(f) {
    const c = f.cover, p = pointOf(c.seg, c.t);
    f.x = p.x; f.z = p.z; f.y = yOf(c.seg, p, f.y);
    f.yaw = yawOf(c.seg);
  }

  const m = {
    segments,
    on(type, fn) { (listeners[type] ||= []).push(fn); return m; },

    /** f の近くで背を付けられる所：{ seg, t, d } か null */
    nearest(f, reach = COVER_REACH) {
      let best = null;
      const fy = f.y ?? 0;
      for (const s of segments) {
        const dx = f.x - s.ax, dz = f.z - s.az;
        const t = Math.max(END, Math.min(s.len - END, dx * s.tx + dz * s.tz));
        const p = pointOf(s, t);
        const d = Math.hypot(f.x - p.x, f.z - p.z);
        if (d > reach || (best && d >= best.d)) continue;
        if (Math.abs(yOf(s, p, fy) - fy) > 0.6) continue;
        if (!free(p)) continue;
        best = { seg: s, t, d };
      }
      return best;
    },

    /** 壁に背を付ける。side：覗く向き（'l' 左・'r' 右） */
    enter(f, spot, side = 'l') {
      if (!f.alive || f.hidden || f.cover || !spot) return false;
      f.cover = { seg: spot.seg, t: spot.t, side, moving: 0 };
      f.action = null; f.guarding = false;
      resetStance(f);   // 壁には立って背を付ける
      place(f);
      emit('enter', { fighter: f });
      return true;
    },

    /** 壁から離れる（少し前へ出る） */
    exit(f) {
      const c = f.cover;
      if (!c) return;
      f.cover = null;
      f.x += c.seg.nx * 0.2; f.z += c.seg.nz * 0.2;
      emit('exit', { fighter: f });
    },

    /**
     * 壁に沿って横歩き。right：体の右へ（+1）・左へ（-1）の割合（0〜1）。進んだ向きへ覗く向きも変える
     * @returns {number} 動いた割合（足音と見た目に使う）
     */
    slide(f, right, dt) {
      const c = f.cover;
      if (!c) return 0;
      c.moving = 0;
      if (Math.abs(right) < 0.15) return 0;
      // 体の右（向きの右）と線の向きの関係
      const s = c.seg, rx = -s.nz, rz = s.nx;
      const sign = s.tx * rx + s.tz * rz >= 0 ? 1 : -1;
      const nt = Math.max(END, Math.min(s.len - END, c.t + right * sign * COVER_SPEED * dt));
      c.side = right > 0 ? 'r' : 'l';
      if (nt === c.t || !free(pointOf(s, nt))) return 0;
      c.t = nt;
      place(f);
      c.moving = Math.min(1, Math.abs(right));
      return c.moving;
    },

    /** 覗く向きの、世界の向き（単位ベクトル {x, z}） */
    peekDir(f) {
      const c = f.cover;
      if (!c) return null;
      const s = c.seg, rx = -s.nz, rz = s.nx;
      return c.side === 'r' ? { x: rx, z: rz } : { x: -rx, z: -rz };
    },

    /** 倒れた・隠れ場所に入った人は壁から外す */
    drop(f) { if (f.cover) m.exit(f); },
  };
  return m;
}
