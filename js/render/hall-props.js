// 大廳の小物（Poly Haven, CC0。tools/process_hall_props.mjs で軽くした GLB）を読み込んで並べる
//   樽・宝箱・机と杯・燭台（蝋燭の火）・吊り手のある灯（中に蝋燭）・腰掛け・壁の楯（松明の下）
//   どれも影を落とす。材質は大廳の光に合わせる（空の映り込みは使わない。部屋の霧は使う）
import * as pc from 'playcanvas';
import { BACK } from './hall-room.js';

const ROOT = './assets/hall';
// 置き方：位置（床・机の上など）・向き（Y の回転、度）・大きさ。candle：蝋燭の炎の高さ（模型の上に足す）
const TABLE_TOP = 0.549 * 1.3;
const PLACE = [
  { id: 'wine_barrel_01', pos: [-2.75, 0, -3.55], rot: 15, s: 1.0 },
  { id: 'wine_barrel_01', pos: [-2.05, 0, -3.82], rot: -50, s: 0.85 },
  { id: 'wooden_lantern_01', pos: [-2.72, 0.871, -3.5], rot: 35, s: 1.0, candle: { at: [0, 0.16, 0], size: 0.06, light: 0.1 } },
  { id: 'treasure_chest', pos: [-2.4, 0, -2.5], rot: 28, s: 1.0 },
  { id: 'WoodenTable_01', pos: [2.98, 0, -3.5], rot: 0, s: 1.3 },
  { id: 'brass_goblets', pos: [2.6, TABLE_TOP, -3.42], rot: 25, s: 1.0 },
  { id: 'wooden_candlestick', pos: [3.55, TABLE_TOP, -3.6], rot: 0, s: 1.4, candle: { at: [0, 0.31, 0], size: 0.075, light: 0.13 } },
  { id: 'wooden_stool_02', pos: [2.55, 0, -2.62], rot: 12, s: 2.5 },
  { id: 'kite_shield', pos: [-3.35, 1.62, BACK + 0.075], rot: 0, s: 0.85 },
  { id: 'kite_shield', pos: [3.35, 1.62, BACK + 0.075], rot: 0, s: 0.85 },
];

function loadContainer(app, url) {
  return new Promise((resolve, reject) => {
    const asset = new pc.Asset(url, 'container', { url });
    asset.once('load', () => resolve(asset.resource));
    asset.once('error', (err) => reject(new Error(`模型を読み込めません: ${url}（${err}）`)));
    app.assets.add(asset);
    app.assets.load(asset);
  });
}

/**
 * 小物を読み込んで置く。蝋燭の火は fire.addFire で足す。読み込めなかった物は置かない（大廳はそのまま使える）
 * @param {(m: pc.Material) => pc.Material} adopt 材質を大廳の光に合わせる
 */
export async function loadHallProps(app, L, root, fire, adopt, build = '') {
  const ids = [...new Set(PLACE.map((p) => p.id))];
  const res = {};
  await Promise.all(ids.map(async (id) => {
    try {
      res[id] = await loadContainer(app, `${ROOT}/${id}.glb${build ? `?v=${build}` : ''}`);
      // 材質は模型ごとに 1 回だけ直す（同じ模型のいくつかで使い回す）
      for (const m of res[id].materials?.map((a) => a.resource) || []) {
        if (id === 'kite_shield') m.diffuse = new pc.Color(0.55, 0.5, 0.46);   // 白い塗りが火の明かりで浮きすぎるので、少し古びた色に
        adopt(m);
      }
    } catch (err) { console.warn(err); }
  }));
  let tris = 0;
  for (const p of PLACE) {
    const r = res[p.id];
    if (!r) continue;
    const e = r.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
    for (const rc of e.findComponents('render')) {
      rc.layers = L;
      for (const mi of rc.meshInstances) tris += mi.mesh.primitive[0].count / 3;
    }
    e.setLocalPosition(...p.pos);
    e.setLocalEulerAngles(0, p.rot, 0);
    e.setLocalScale(p.s, p.s, p.s);
    root.addChild(e);
    if (p.candle && fire) {
      const at = [p.pos[0] + p.candle.at[0] * p.s, p.pos[1] + p.candle.at[1] * p.s, p.pos[2] + p.candle.at[2] * p.s];
      fire.addFire(at, p.candle.size, { light: { intensity: p.candle.light, range: 2.6 }, glow: 4, intensity: 1.4 });
    }
  }
  return { tris };
}
