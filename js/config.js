// 調整用の数値をここに集める。URL の ?q=low / ?q=high で画質を切り替えられる
// （既定は medium。iPad Pro M2 を基準にした目安で、実機の FPS を見て詰める）

const QUALITY = {
  low: {
    maxPixelRatio: 1.0,
    antialias: false,
    shadowResolution: 1024,
    anisotropy: 2,
    shadowDistance: 30,
    grassClumps: 1500,
    treeLodDistance: 25,   // これより近い木は精細な形（近く用）で描く（m）
  },
  medium: {
    maxPixelRatio: 1.5,
    antialias: true,
    shadowResolution: 2048,
    anisotropy: 4,
    shadowDistance: 40,
    grassClumps: 3000,
    treeLodDistance: 35,
  },
  high: {
    maxPixelRatio: 2.0,
    antialias: true,
    shadowResolution: 2048,
    anisotropy: 8,
    shadowDistance: 55,
    grassClumps: 5000,
    treeLodDistance: 50,
  },
};

const params = new URLSearchParams(location.search);
const qualityName = QUALITY[params.get('q')] ? params.get('q') : 'medium';

export const CONFIG = {
  qualityName,
  quality: QUALITY[qualityName],
  showStats: params.get('stats') !== '0',

  // 同じ種からは必ず同じ森ができる（将来のマルチプレイで全員が同じ地形を共有するため）
  seed: Number(params.get('seed')) || 20261031,

  world: {
    terrainSize: 180,       // 地面の一辺（m）
    terrainSegments: 72,    // 地面の分割数（多いほど滑らかで重い）
    playRadius: 62,         // 歩ける範囲の半径（m）
    forestRadius: 70,       // 木を置く範囲の半径（m）
    clearingRadius: 7,      // 開始地点の周りの空き地（m）
    // 木の本数（Tripo AI の模型を使うとき）。置く順番もこの順（大きい木から）
    trees: { fir: 60, red_pine: 22, broadleaf: 26, birch: 22, dead: 10, sapling: 60 },
    conifers: 110,          // 模型が読み込めなかったときの仮の木の本数
    broadleaves: 45,
    rocks: 45,
    grassRadius: 48,        // 草を置く範囲の半径（m）
  },

  atmosphere: {
    fogColor: [0.62, 0.68, 0.66], // 空の写真が無いときの霧の色
    fogDensity: 0.013,
    ambient: [0.34, 0.37, 0.38], // 空の写真が無いときの環境光
    sunColor: [1.0, 0.92, 0.80],  // 空の写真が無いときの太陽の色（あるときは写真から求める）
    sunIntensity: 2.0,      // 空の写真が無いときの太陽の強さ
    sunEuler: [48, 35, 0],  // 太陽の向き（度）。空の写真があるときは写真の太陽に合わせるので使わない
    exposure: 1.0,
    skyBrightness: 1.0,     // 空の写真の明るさの倍率（背景と、空から回り込む光の両方）
    sunScale: 1.0,          // 写真から求めた太陽光の強さに対する倍率
    fogTint: 1.0,           // 霧の色の明るさ（地平線の空の色に対する倍率）
    farClip: 160,
  },

  player: {
    eyeHeight: 1.65,
    radius: 0.35,
    walkSpeed: 3.0,         // m/s（スティックを半分ほど倒したとき）
    runSpeed: 5.2,          // m/s（スティックを端まで倒したとき）
    fov: 70,
    pitchLimit: 85,
  },

  input: {
    stickRadiusRatio: 0.065, // 画面の短い辺に対するスティックの半径
    stickDeadZone: 0.12,
    touchLookSpeed: 0.16,    // 度 / ピクセル
    mouseLookSpeed: 0.18,
  },
};
