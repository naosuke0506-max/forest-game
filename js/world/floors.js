// 歩ける床（地面のほかに乗れる面）：家の一階・二階の床、階段（坂として扱う）。
// groundAt(x, z, y)：今の高さ y から「段差として上がれる（STEP 以内）」面のうち、一番高い面の高さを返す。
//   一階にいる人の真上に二階の床があっても、高すぎて上がれないので一階に立つ。階段は少しずつ上がるので、二階まで上がれる。
//   どの面にも乗っていなければ地面（terrain.heightAt）
// 面は「向き付きの四角」：中心 cx・cz、向き yaw（度）、横の半分 hw・奥行きの半分 hd。
//   平らな床は高さ y。坂（階段）は奥行きの -hd の端で y0、+hd の端で y1。
//   でこぼこの面（洞窟の上の岩山）は、高さを求める関数 at(x, z) を持つ（null を返す所は面が無い）
// 計算だけ（PlayCanvas に依存しない）。プレイヤー・bot・戦闘・矢が同じ高さを使う
const CELL = 8;
export const STEP = 0.65;   // 一度に上がれる段差（m）

export function createFloors(heightAt) {
  const grid = new Map();
  const key = (gx, gz) => gx * 73856093 ^ gz * 19349663;
  const list = [];

  function add(s) {
    const a = (s.yaw * Math.PI) / 180;
    s.f = [Math.sin(a), Math.cos(a)];      // 奥行きの向き
    s.r = [Math.cos(a), -Math.sin(a)];     // 横の向き
    const R = Math.hypot(s.hw, s.hd);
    for (let gx = Math.floor((s.cx - R) / CELL); gx <= Math.floor((s.cx + R) / CELL); gx++) {
      for (let gz = Math.floor((s.cz - R) / CELL); gz <= Math.floor((s.cz + R) / CELL); gz++) {
        const k = key(gx, gz);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(s);
      }
    }
    list.push(s);
    return s;
  }

  /** 面の上の、地点の高さ（面の外なら null） */
  function heightOn(s, x, z) {
    const dx = x - s.cx, dz = z - s.cz;
    const lx = dx * s.r[0] + dz * s.r[1], lz = dx * s.f[0] + dz * s.f[1];
    if (Math.abs(lx) > s.hw || Math.abs(lz) > s.hd) return null;
    if (s.at) return s.at(x, z);
    if (s.y !== undefined) return s.y;
    return s.y0 + (s.y1 - s.y0) * ((lz + s.hd) / (2 * s.hd));
  }

  return {
    list,
    /** 平らな床 */
    addFloor: ({ cx, cz, yaw, hw, hd, y }) => add({ cx, cz, yaw, hw, hd, y }),
    /** 坂（階段）：-hd の端で y0、+hd の端で y1 */
    addRamp: ({ cx, cz, yaw, hw, hd, y0, y1 }) => add({ cx, cz, yaw, hw, hd, y0, y1 }),
    /** でこぼこの面：四角の中の高さは at(x, z)。null を返す所には面が無い */
    addSurface: ({ cx, cz, yaw, hw, hd, at }) => add({ cx, cz, yaw, hw, hd, at }),
    /**
     * 立てる高さ
     * @param {number|null|undefined} y 今の足の高さ（無ければ地面から上がれる面）
     */
    groundAt(x, z, y = null) {
      const ground = heightAt(x, z);
      const from = y ?? ground;
      let best = ground;
      for (const s of grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || []) {
        const h = heightOn(s, x, z);
        if (h != null && h <= from + STEP && h > best) best = h;
      }
      return best;
    },
  };
}
