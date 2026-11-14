// マップのエリア分け（計算だけ。PlayCanvas に依存しない）。
//   その他：森と草原が混ざる森（mixed）
//   北西：深い森（deep）。木が密で、空がほぼ葉で覆われる。霧も濃い。北の山のふもとまで
//   東：大草原（prairie）。木はまばらで、背の高い草が茂る
//   村（castle という名前のまま）：山邑・川邑・野邑の 3 つ（world/villages.js）。家・広場・畑のまわり。木や岩を置かない
//   道（path）：村と村・盆地の真ん中・北西の深い森をつなぐ曲がりくねった土の道（world/villages.js）
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
 * @param {object} [land] world/landform.js（川・山）
 * @param {object} [plan] world/villages.js（村・道・橋）
 */
export function createZones(seed, radius, land = null, plan = null) {
  const centerR = radius * 0.34;              // 中央の森の半径（約 60m）
  // 村（2026-11-14 から 3 つ。world/villages.js）：村の広がり（家・広場・畑のまわり）が「村」のエリア。castle は一番大きい川邑
  const villages = plan ? plan.villages : [];
  const main = villages.find((v) => v.id === 'river') || villages[0] || { x: 0, z: 0 };
  const castle = { x: main.x, z: main.z };
  // 深い森（北西）と大草原（東）の広がり：真ん中と半径。縁はノイズで揺らす
  const blobs = {
    deep: { x: -110, z: -64, r: 78 },   // 滝と滝壺は入れない（深い森は霧が濃く、滝が見えなくなるため）
    prairie: { x: 108, z: -8, r: 78 },
  };
  const sectors = { deep: { ang: 320, half: 50 }, prairie: { ang: 95, half: 45 } };   // 向き（ミニマップなどで使う）

  // 道（world/villages.js）：村と村・盆地の真ん中・北西の深い森をつなぐ、曲がりくねった道。ミニマップに描く折れ線
  const paths = plan ? plan.roads.map((r) => r.pts.map(([x, z]) => ({ x, z }))) : [];

  /** 道の上か（1 = 道の真ん中、0 = 道ではない） */
  const path = (x, z) => (plan ? plan.pathAt(x, z) : 0);

  /** 地点 (x, z) が、それぞれのエリアにどれだけ属するか（合わせて 1） */
  function weights(x, z) {
    const wobble = (fbm(x * 0.012, z * 0.012, seed + 77) - 0.5) * 30;   // 境目の揺らぎ（m）
    const blob = (b) => 1 - smooth(b.r - 22, b.r + 18, Math.hypot(x - b.x, z - b.z) + wobble);
    const castleW = plan ? plan.areaAt(x, z) : 0;
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
  /** 洞窟の通り道とその切り通しのまわり（0〜1。木・草・小物を置かない。world/cave-shape.js） */
  const caveArea = (x, z) => (land?.cave ? land.cave.area(x, z) : 0);
  /** 洞窟の中か（0〜1。y があれば岩山の上は外） */
  const caveAt = (x, z, y = null) => (land?.cave ? land.cave.inside(x, z, y) : 0);
  /** 木の多さ（中央の森を 1 とした倍率）。道の上・村の家のまわり・川と岸・洞窟には置かない。山の高い所はまばら */
  function treeDensity(x, z) {
    const w = weights(x, z);
    return (w.mixed * 1 + w.deep * 3.2 + w.prairie * 0.06) * (1 - path(x, z)) * (1 - wet(x, z)) * (1 - 0.8 * rocky(x, z)) * (1 - caveArea(x, z));
  }
  /** 一番近い村（その広がりの中なら。名前を出す・村の音） */
  const villageAt = (x, z) => (plan ? plan.villageAt(x, z) : null);

  const plazas = plan ? plan.wells.map((w) => w.plaza) : [];   // 村の広場（石畳の足音。audio/sfx.js）
  return { weights, zoneAt, path, treeDensity, wet, rocky, caveArea, caveAt, castle, villages, villageAt, plazas, paths, centerR, sectors, blobs };
}
