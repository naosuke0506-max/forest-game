// 当たり判定：木の幹や岩を「円」として持ち、格子で引けるようにする
// （物理エンジンは使わない。円の押し出しだけなら軽く、iPad でも負担が小さい）

const CELL = 8; // m

export function createObstacles() {
  const grid = new Map();
  const all = [];
  const key = (gx, gz) => gx * 73856093 ^ gz * 19349663;

  /**
   * @param {boolean} solid ぶつかる物か。false は「置き場所が重ならないように場所を取るだけ」（草・若木など）
   */
  function add(x, z, r, solid = true) {
    const o = { x, z, r, solid };
    all.push(o);
    for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++) {
      for (let gz = Math.floor((z - r) / CELL); gz <= Math.floor((z + r) / CELL); gz++) {
        const k = key(gx, gz);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(o);
      }
    }
  }

  /** 近くにある円の一覧 */
  function near(x, z) {
    return grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || [];
  }

  /** 位置 p（{x, z}）を、半径 radius の円として障害物から押し出す */
  function resolve(p, radius) {
    for (const o of near(p.x, p.z)) {
      if (!o.solid) continue;
      const dx = p.x - o.x, dz = p.z - o.z;
      const min = o.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = o.x + (dx / d) * min;
        p.z = o.z + (dz / d) * min;
      }
    }
  }

  /** その場所に、ほかの物と重ならずに置けるか */
  function isFree(x, z, r) {
    for (let gx = Math.floor((x - r) / CELL) - 1; gx <= Math.floor((x + r) / CELL) + 1; gx++) {
      for (let gz = Math.floor((z - r) / CELL) - 1; gz <= Math.floor((z + r) / CELL) + 1; gz++) {
        for (const o of grid.get(key(gx, gz)) || []) {
          if (Math.hypot(x - o.x, z - o.z) < o.r + r) return false;
        }
      }
    }
    return true;
  }

  return { add, resolve, isFree, all };
}
