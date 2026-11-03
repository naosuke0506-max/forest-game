// マップのエリア分け（計算だけ。PlayCanvas に依存しない）。
//   中央・その他：森と草原が混ざる森（mixed）
//   北：深い森（deep）。木が密で、空がほぼ葉で覆われる。霧も濃い
//   東：大草原（prairie）。木はまばらで、背の高い草が茂る（草は手順 4）
//   南西：村の場所（castle という名前のまま）。長方形。平らにならし、木や岩を置かない（家と柵は castle.js）
//   中央から各エリアへ土の道（path）
// 地図の上で北は -Z、東は +X。境目はノイズで少し揺らし、なめらかに混ぜる
import { fbm } from '../core/random.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const DEG = Math.PI / 180;

export const ZONE_NAMES = { mixed: '森', deep: '深い森', prairie: '大草原', castle: '村' };

/**
 * @param {number} seed 種（同じ種なら同じ配置）
 * @param {number} radius 歩ける範囲の半径
 */
export function createZones(seed, radius) {
  const centerR = radius * 0.34;              // 中央の森の半径（約 60m）
  // 村：南西、中心から半径の 6 割の所に、長方形（森の中央へ向かう向きに奥行き、横に長い）
  //   f は森の中央への向き、r は右。halfF・halfR は平らにならす範囲の半分（その内側 5m に柵）
  const castleAng = 225 * DEG;                 // 北から時計回り（北 0、東 90、南 180、西 270）
  const cx0 = Math.sin(castleAng) * radius * 0.6, cz0 = -Math.cos(castleAng) * radius * 0.6, cl = Math.hypot(cx0, cz0) || 1;
  const cf = [-cx0 / cl, -cz0 / cl];
  const castle = { x: cx0, z: cz0, f: cf, r: [cf[1], -cf[0]], halfF: 32, halfR: 47 };
  /** 村の長方形からの距離（内側は負） */
  const villageDist = (x, z) => {
    const dx = x - castle.x, dz = z - castle.z;
    const a = Math.abs(dx * castle.f[0] + dz * castle.f[1]) - castle.halfF;
    const b = Math.abs(dx * castle.r[0] + dz * castle.r[1]) - castle.halfR;
    return a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b);
  };
  const sectors = {
    deep: { ang: 0, half: 58 },                // 北
    prairie: { ang: 95, half: 50 },            // 東
  };

  // 道：中央から各エリアの中へ。途中を少し曲げる（点を順につないだ折れ線）
  const toward = (angDeg, dist) => ({ x: Math.sin(angDeg * DEG) * dist, z: -Math.cos(angDeg * DEG) * dist });
  const bend = (p, k) => ({ x: p.x + (fbm(k, 3.1, seed + 91) - 0.5) * 30, z: p.z + (fbm(k, 7.7, seed + 92) - 0.5) * 30 });
  const paths = [
    [{ x: 0, z: 0 }, bend(toward(5, radius * 0.4), 1), toward(0, radius * 0.75)],
    [{ x: 0, z: 0 }, bend(toward(92, radius * 0.4), 2), toward(95, radius * 0.75)],
    [{ x: 0, z: 0 }, bend(toward(220, radius * 0.3), 3), { x: castle.x, z: castle.z }],
  ];
  const PATH_W = 2.2;                          // 道の半分の幅（m）

  function distToSeg(x, z, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
  }

  /** 道の上か（1 = 道の真ん中、0 = 道ではない） */
  function path(x, z) {
    let d = Infinity;
    for (const p of paths) for (let i = 0; i < p.length - 1; i++) d = Math.min(d, distToSeg(x, z, p[i], p[i + 1]));
    return 1 - smooth(PATH_W * 0.6, PATH_W * 1.6, d);
  }

  /** 地点 (x, z) が、それぞれのエリアにどれだけ属するか（合わせて 1） */
  function weights(x, z) {
    const r = Math.hypot(x, z);
    const wobble = (fbm(x * 0.012, z * 0.012, seed + 77) - 0.5) * 30;   // 境目の揺らぎ（度・m）
    const outer = smooth(centerR - 12, centerR + 12, r + wobble);       // 中央から外へ出た割合
    let ang = Math.atan2(x, -z) / DEG;                                    // 北から時計回り（度）
    if (ang < 0) ang += 360;
    const sector = (s) => {
      const d = Math.abs(((ang - s.ang + 540) % 360) - 180);
      return 1 - smooth(s.half - 14, s.half + 14, d + wobble * 0.5);
    };
    const castleW = 1 - smooth(0, 16, villageDist(x, z) + Math.abs(wobble) * 0.3);
    const deep = sector(sectors.deep) * outer * (1 - castleW);
    const prairie = sector(sectors.prairie) * outer * (1 - castleW);
    const mixed = Math.max(0, 1 - deep - prairie - castleW);
    return { mixed, deep, prairie, castle: castleW };
  }

  /** 一番強いエリアの名前 */
  function zoneAt(x, z) {
    const w = weights(x, z);
    let best = 'mixed';
    for (const k of Object.keys(w)) if (w[k] > w[best]) best = k;
    return best;
  }

  /** 木の多さ（中央の森を 1 とした倍率）。道の上と城の場所には置かない */
  function treeDensity(x, z) {
    const w = weights(x, z);
    return (w.mixed * 1 + w.deep * 3.2 + w.prairie * 0.06) * (1 - path(x, z));
  }

  return { weights, zoneAt, path, treeDensity, castle, paths, centerR, sectors };
}
