// 調整用の数値をここに集める。URL の ?q=low / ?q=high で画質を切り替えられる
// （既定は medium。iPad Pro M2 を基準にした目安で、実機の FPS を見て詰める）

const QUALITY = {
  low: {
    maxPixelRatio: 1.0,
    antialias: false,
    shadowResolution: 1024,
    shadowDistance: 30,
    grassClumps: 1500,
  },
  medium: {
    maxPixelRatio: 1.5,
    antialias: true,
    shadowResolution: 2048,
    shadowDistance: 40,
    grassClumps: 3000,
  },
  high: {
    maxPixelRatio: 2.0,
    antialias: true,
    shadowResolution: 2048,
    shadowDistance: 55,
    grassClumps: 5000,
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
    conifers: 110,
    broadleaves: 45,
    rocks: 45,
    grassRadius: 48,        // 草を置く範囲の半径（m）
  },

  atmosphere: {
    fogColor: [0.62, 0.68, 0.66],
    fogDensity: 0.022,
    ambient: [0.22, 0.25, 0.25],
    sunColor: [1.0, 0.92, 0.80],
    sunIntensity: 2.2,
    sunEuler: [48, 35, 0],  // 太陽の向き（度）
    exposure: 1.0,
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
