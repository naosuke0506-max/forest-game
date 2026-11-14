// マップのエリア分け（計算だけ。PlayCanvas に依存しない）。
//   その他：森と草原が混ざる森（mixed）
//   北西：深い森（deep）。木が密で、空がほぼ葉で覆われる。霧も濃い。北の山のふもとまで
//   東：大草原（prairie）。木はまばらで、背の高い草が茂る
//   南西：村の場所（castle という名前のまま）。長方形。平らにならし、木や岩を置かない（家と柵は castle.js。村は地図作りの 2 回目で作り直す）
//   中央から各エリアへ土の道（path）
// 地図の上で北は -Z、東は +X。境目はノイズで揺らし、なめらかに混ぜる。
// 2026-11-14（利用者の指示：マップを自然に）：深い森と大草原を、扇形から、まわりの形が揺れた丸い広がりに変えた。
// 川と岸（world/landform.js の wet）と山の高い所（rocky）には、木を置かない・少なくする
import { fbm } from '../core/random.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const DEG = Math.PI / 180;

export const ZONE_NAMES = { mixed: '混淆林', deep: '幽邃林', prairie: '大曠野', castle: '邑' };   // 場所の名前（漢字だけ・旧字体）

/**
 * @param {number} seed 種（同じ種なら同じ配置）
 * @param {number} radius 歩ける範囲の半径
 */
export function createZones(seed, radius, land = null) {
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
  // 深い森（北西）と大草原（東）の広がり：真ん中と半径。縁はノイズで揺らす
  const blobs = {
    deep: { x: -82, z: -96, r: 92 },
    prairie: { x: 108, z: -8, r: 78 },
  };
  const sectors = { deep: { ang: 320, half: 50 }, prairie: { ang: 95, half: 45 } };   // 道の向き（ミニマップの名前の位置などで使う）

  // 道：中央から各エリアの中へ。途中を少し曲げる（点を順につないだ折れ線）
  const toward = (angDeg, dist) => ({ x: Math.sin(angDeg * DEG) * dist, z: -Math.cos(angDeg * DEG) * dist });
  const bend = (p, k) => ({ x: p.x + (fbm(k, 3.1, seed + 91) - 0.5) * 30, z: p.z + (fbm(k, 7.7, seed + 92) - 0.5) * 30 });
  const paths = [
    [{ x: 0, z: 0 }, bend(toward(318, radius * 0.4), 1), toward(318, radius * 0.72)],
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
    const wobble = (fbm(x * 0.012, z * 0.012, seed + 77) - 0.5) * 30;   // 境目の揺らぎ（m）
    const blob = (b) => 1 - smooth(b.r - 22, b.r + 18, Math.hypot(x - b.x, z - b.z) + wobble);
    const castleW = 1 - smooth(0, 16, villageDist(x, z) + Math.abs(wobble) * 0.3);
    const deep = blob(blobs.deep) * (1 - castleW);
    const prairie = Math.min(1 - deep, blob(blobs.prairie)) * (1 - castleW);
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

  /** 水辺（0〜1。川の中と岸。world/landform.js）・岩場（0〜1。山の高い所） */
  const wet = (x, z) => (land ? land.wet(x, z) : 0);
  const rocky = (x, z) => (land ? land.rocky(x, z) : 0);
  /** 木の多さ（中央の森を 1 とした倍率）。道の上・城の場所・川と岸には置かない。山の高い所はまばら */
  function treeDensity(x, z) {
    const w = weights(x, z);
    return (w.mixed * 1 + w.deep * 3.2 + w.prairie * 0.06) * (1 - path(x, z)) * (1 - wet(x, z)) * (1 - 0.8 * rocky(x, z));
  }

  return { weights, zoneAt, path, treeDensity, wet, rocky, castle, paths, centerR, sectors, blobs };
}
