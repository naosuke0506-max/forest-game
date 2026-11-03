// 落ちている素材と村の箱（計算だけ。PlayCanvas に依存しない）。
//   素材の山：エリアの置きやすさ（data.js の PICKUPS.zone）に合わせて、森じゅうに散らばる。拾うと消える
//   村の箱：村の家の前。開けると中身（CRATE.loot）が手に入る（1 回だけ。開いた箱は残る）
//   フェーズが始まるたびに、素材の山を少し足す
import { PICKUPS, CRATE, MATERIAL_KEYS } from './data.js';

/**
 * @param {object} opt
 * @param {{next: () => number}} opt.rng 種から決まる乱数
 * @param {object|null} opt.zones エリア分け（weights）
 * @param {(x: number, z: number, r: number, solidOnly: boolean) => boolean} opt.isFree 木の幹・岩・家と重ならないか
 * @param {number} opt.areaRadius 歩ける範囲の半径
 * @param {{x: number, z: number, yaw: number}[]} opt.crateSpots 村の箱の場所
 * @param {(x: number, z: number) => boolean} [opt.blocked] 置かない場所（家の中）
 */
export function createPickups({ rng, zones, isFree, areaRadius, crateSpots = [], blocked = null }) {
  const items = [];
  const listeners = {};
  const emit = (type, data) => (listeners[type] || []).forEach((fn) => fn(data));
  let nextId = 1;
  const range = ([a, b]) => a + Math.floor(rng.next() * (b - a + 1));
  const maxZone = (kind) => Math.max(...Object.values(PICKUPS[kind].zone));

  /** 1 つ置く（置ける場所が見つからなければ置かない） */
  function place(kind) {
    const rule = PICKUPS[kind];
    for (let tries = 0; tries < 40; tries++) {
      const r = Math.sqrt(rng.next()) * (areaRadius - 5);
      const a = rng.next() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (zones) {
        const w = zones.weights(x, z);
        const p = Object.entries(rule.zone).reduce((s, [k, v]) => s + (w[k] || 0) * v, 0) / maxZone(kind);
        if (rng.next() > p) continue;
      }
      if (!isFree(x, z, 0.9, true)) continue;
      if (blocked?.(x, z)) continue;
      if (items.some((o) => !o.taken && Math.abs(o.x - x) < 3 && Math.abs(o.z - z) < 3)) continue;
      const item = { id: nextId++, kind, x, z, yaw: rng.next() * 360, amount: range(rule.amount), taken: false };
      items.push(item);
      return item;
    }
    return null;
  }

  for (const kind of MATERIAL_KEYS) for (let i = 0; i < PICKUPS[kind].count; i++) place(kind);
  // 村の箱
  for (const s of crateSpots.slice(0, CRATE.count)) {
    const loot = {};
    for (const [k, r] of Object.entries(CRATE.loot)) { const n = range(r); if (n) loot[k] = n; }
    items.push({ id: nextId++, kind: 'crate', x: s.x, z: s.z, yaw: s.yaw, loot, taken: false });
  }

  const m = {
    items,
    version: 0,      // 何か変わるたびに増える（見た目を作り直す合図）
    on(type, fn) { (listeners[type] ||= []).push(fn); return m; },

    /** f の近く（reach m 以内）で、まだ取られていない一番近い物 */
    nearest(f, reach = PICKUPS.reach) {
      let best = null, bd = reach;
      for (const o of items) {
        if (o.taken) continue;
        const d = Math.hypot(o.x - f.x, o.z - f.z);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    },

    /** 拾う・開ける。手に入った素材を返す（取れなければ null） */
    take(f, item) {
      if (!item || item.taken || !f.alive || Math.hypot(item.x - f.x, item.z - f.z) > PICKUPS.reach + 0.3) return null;
      item.taken = true;
      const got = item.kind === 'crate' ? { ...item.loot } : { [item.kind]: item.amount };
      for (const k of MATERIAL_KEYS) f.materials[k] = (f.materials[k] || 0) + (got[k] || 0);
      m.version++;
      emit('taken', { fighter: f, item, got });
      return got;
    },

    /** フェーズが始まったとき：素材の山を足す（種類の割合は最初と同じ） */
    refill(n = PICKUPS.refill) {
      const total = MATERIAL_KEYS.reduce((s, k) => s + PICKUPS[k].count, 0);
      for (let i = 0; i < n; i++) {
        let t = rng.next() * total;
        const kind = MATERIAL_KEYS.find((k) => (t -= PICKUPS[k].count) < 0) || 'wood';
        place(kind);
      }
      // 取られた山は、記録から消す（箱は開いたまま残す）
      for (let i = items.length - 1; i >= 0; i--) if (items[i].taken && items[i].kind !== 'crate') items.splice(i, 1);
      m.version++;
    },
  };
  return m;
}
