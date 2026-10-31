// 実写の質感画像（Poly Haven, CC0）を読み込む。出典は assets/textures/CREDITS.md
// 1 種類につき 3 枚：色（diff）、凹凸（nor_gl）、陰影と粗さ（arm）
// 読み込むのは tools/optimize_textures.py で軽くした WebP。
// ※ ファイル名を変えたら、index.html の <link rel="preload"> も合わせて直す
import * as pc from 'playcanvas';

const ROOT = './assets/textures';

/** 使う質感と、画像 1 枚が表す実物の大きさ（m） */
export const TEXTURE_SETS = {
  ground: { id: 'forrest_ground_01', size: 2.0 },
  bark: { id: 'pine_bark', size: 2.0 },
  rock: { id: 'mossy_rock', size: 3.0 },
};

const MAPS = [
  { key: 'diffuse', suffix: 'diff', srgb: true },   // 色は sRGB
  { key: 'normal', suffix: 'nor_gl', srgb: false }, // 凹凸と粗さはリニア（数値として読む）
  { key: 'arm', suffix: 'arm', srgb: false },
];

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`画像を読み込めません: ${url}`));
    img.src = url;
  });
}

function createTexture(device, img, name, srgb, anisotropy) {
  const tex = new pc.Texture(device, {
    name,
    width: img.width,
    height: img.height,
    format: pc.PIXELFORMAT_RGBA8,
    srgb,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_REPEAT,
    addressV: pc.ADDRESS_REPEAT,
    anisotropy, // 地面を斜めに見たときのぼやけを抑える
  });
  tex.setSource(img);
  return tex;
}

/**
 * 全部の質感画像を読み込む。1 枚でも失敗した種類は null にする
 * （その種類は今までの色だけの見た目で描き、ゲーム自体は止めない）
 * @param {(done: number, total: number) => void} onProgress
 */
export async function loadTextureSets(device, quality, onProgress = () => {}) {
  const entries = Object.entries(TEXTURE_SETS);
  const total = entries.length * MAPS.length;
  let done = 0;
  const result = {};

  await Promise.all(entries.map(async ([name, set]) => {
    try {
      const images = await Promise.all(MAPS.map(async (map) => {
        const img = await loadImage(`${ROOT}/${set.id}/${set.id}_${map.suffix}.webp`);
        onProgress(++done, total);
        return img;
      }));
      const textures = { size: set.size };
      MAPS.forEach((map, i) => {
        textures[map.key] = createTexture(device, images[i], `${set.id}_${map.suffix}`, map.srgb, quality.anisotropy);
      });
      result[name] = textures;
    } catch (err) {
      console.warn(err);
      window.__showError?.(`質感画像の読み込みに失敗しました（${name}）。色だけの表示で続けます。\n  ${err.message}`);
      result[name] = null;
    }
  }));

  return result;
}
