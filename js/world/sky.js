// 空：写真（HDR, Poly Haven, CC0）から作った 2 つのファイルを使う。出典は assets/sky/CREDITS.md
//   照明用（*_light.f16）：空全体から回り込む光（環境光・反射）を作る
//   背景用（*_sky.webp） ：画面に映る空
// どちらも tools/make_sky.py で作る。※ 名前を変えたら index.html の <link rel="preload"> も直す
import * as pc from 'playcanvas';

const ROOT = './assets/sky';
export const SKY_NAME = 'kloofendal_48d';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`画像を読み込めません: ${url}`));
    img.src = url;
  });
}

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`読み込めません（${res.status}）: ${url}`);
  return res;
}

/** 空のファイルを読み込む。失敗したら null（今までの単色の空と環境光で続ける） */
export async function loadSky(name = SKY_NAME) {
  try {
    const base = `${ROOT}/${name}`;
    const [meta, light, image] = await Promise.all([
      fetchOk(`${base}.json`).then((r) => r.json()),
      fetchOk(`${base}_light.f16`).then((r) => r.arrayBuffer()),
      loadImage(`${base}_sky.webp`),
    ]);
    return { name, meta, light: new Uint16Array(light), image };
  } catch (err) {
    console.warn(err);
    window.__showError?.(`空の読み込みに失敗しました。単色の空で続けます。\n  ${err.message}`);
    return null;
  }
}

/**
 * 写真の中の位置（UV）を、世界の向き（単位ベクトル）に直す。
 * u：横方向（0〜1 で一周）、v：0 = 真上、0.5 = 地平線、1 = 真下
 * 元はエンジンのシェーダー（toSphericalUv）の約束 u = atan(x, z) / 2π + 0.5、v = 0.5 − asin(y) / π。
 * ただし背景の空（立方体マップ）は x が左右反転して表示される（立方体マップの向きの約束による）。
 * 画面で見える太陽と影の向きをそろえるため、x の符号を反転している（画面上の太陽の位置を測って確認済み）
 */
export function uvToDirection(u, v) {
  const azimuth = (u - 0.5) * Math.PI * 2;
  const elevation = (0.5 - v) * Math.PI;
  return new pc.Vec3(
    -Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  ).normalize();
}

/** 線形の明るさ → 画面の色（sRGB）。霧の色を空の地平線に合わせるのに使う */
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/**
 * 空を場面に組み込む：背景の空、空全体からの照明、霧の色
 * @returns {{ sunDirection: pc.Vec3, sunIntensity: number, sunColor: pc.Color, fogColor: pc.Color }}
 */
/**
 * 空のファイルから、空全体からの照明（envAtlas）と背景の空（skybox）を作る（場面にはまだ組み込まない）
 */
export function prepareSky(app, sky) {
  const device = app.graphicsDevice;
  const { meta } = sky;
  const [lw, lh] = meta.lightSize;

  // 照明用：半精度の HDR データ（写真の明るさを skyScale で割ってある）
  const lightTex = new pc.Texture(device, {
    name: 'sky-light',
    width: lw,
    height: lh,
    format: pc.PIXELFORMAT_RGBA16F,
    mipmaps: false,
    projection: pc.TEXTUREPROJECTION_EQUIRECT,
    addressU: pc.ADDRESS_REPEAT,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    levels: [sky.light],
  });
  const source = pc.EnvLighting.generateLightingSource(lightTex, { size: 64 });
  const envAtlas = pc.EnvLighting.generateAtlas(source, { size: 256 });
  lightTex.destroy();
  source.destroy();

  // 背景用：明るさを skyScale で割って保存してあるので、表示するときに掛け戻す
  const skyTex = new pc.Texture(device, {
    name: 'sky-display',
    width: sky.image.width,
    height: sky.image.height,
    format: pc.PIXELFORMAT_RGBA8,
    srgb: true,
    mipmaps: false,
    projection: pc.TEXTUREPROJECTION_EQUIRECT,
    addressU: pc.ADDRESS_REPEAT,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
  });
  skyTex.setSource(sky.image);
  const skybox = pc.EnvLighting.generateSkyboxCubemap(skyTex);
  skyTex.destroy();

  return {
    name: sky.name,
    meta,
    envAtlas,
    skybox,
    sunDirection: uvToDirection(meta.sunU, meta.sunV),
    // 空全体の明るさ（空から回り込む光＋太陽光）。時間帯ごとの明るさをそろえるのに使う
    irradiance: meta.skyIrradiance + meta.sunIrradiance / Math.PI,
  };
}

/** 線形の色 → 画面の色（霧の色に使う） */
export const toSrgbColor = (lin) => new pc.Color(...lin.map((c) => linearToSrgb(Math.min(1, Math.max(0, c)))));

/**
 * 空を場面に組み込む：背景の空、空全体からの照明、霧の色
 * @returns {{ sunDirection: pc.Vec3, sunIntensity: number, sunColor: pc.Color, fogColor: pc.Color, prepared: object }}
 */
export function applySky(app, sky, config) {
  const scene = app.scene;
  const prepared = prepareSky(app, sky);
  const { meta } = prepared;
  scene.envAtlas = prepared.envAtlas;
  scene.skybox = prepared.skybox;
  scene.skyboxMip = 0;
  scene.skyboxIntensity = meta.skyScale * config.atmosphere.skyBrightness;

  // 霧の色 = 地平線のすぐ上の空の色（遠くの木が空に自然に溶け込む）
  const fogColor = toSrgbColor(meta.horizonLinear.map((c) => c * config.atmosphere.skyBrightness * config.atmosphere.fogTint));

  // 太陽光の強さ：写真から求めた「太陽に正対した面が受ける光」。
  // エンジンの平行光源は π で割らない約束なので、ここで π で割って空の光とつり合わせる
  const b = config.atmosphere.skyBrightness;
  const sunIntensity = (meta.sunIrradiance / Math.PI) * b * config.atmosphere.sunScale;
  const sunColor = new pc.Color(...meta.sunColor.map(linearToSrgb));

  return { sunDirection: prepared.sunDirection, sunIntensity, sunColor, fogColor, prepared };
}

