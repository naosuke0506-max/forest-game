// 森の小物：草・シダ・落ち枝・岩・切り株（Poly Haven の CC0 模型を tools/process_props.mjs で軽くしたもの）
//
// 種類ごとに数個の形（バリエーション）があり、それぞれ近く用（lod0）と遠く用（lod1）を持つ。
// プレイヤーとの距離で、近く用 → 遠く用 → 描かない、を少しずつ入れ替える。
// 形ごとに「インスタンシング」で、1 回の描画命令でまとめて描く。
// 草とシダは、葉の形を色の画像の透明部分で切り抜く（アルファテスト）。
import * as pc from 'playcanvas';
import { createRandom, fbm } from '../core/random.js';
import { sceneBudget } from '../core/mesh-utils.js';
import { applyWind } from './wind.js';

const ROOT = './assets/props';

/**
 * 種類ごとの置き方。置く順番もこの順（大きい物から。小さい物は大きい物を避ける）
 *   count     ：本数（関数なら画質ごとの値を返す）
 *   area      ：置く範囲の半径（m）
 *   near / far：この距離までは近く用 / 遠く用で描く（それより遠くは描かない）
 *   scale     ：大きさの倍率の範囲
 *   sink      ：高さに対する、地面に埋める割合
 *   spacing   ：ほかの物との間隔（m。大きさの倍率を掛ける）
 *   collide   ：当たり判定の半径（横幅に対する割合。0 は判定なし）
 *   tilt      ：傾きの最大（度）
 *   shadows   ：影を落とすか
 *   wind      ：風での揺れ方（applyWind に渡す値）
 *   onSoil    ：土の見えている所にも置くか（false なら苔の多い所だけ）
 *   tint      ：色の画像に掛ける色（細い葉は影が目立って暗く見えるので、草は少し明るくする）
 */
const RULES = {
  rock_large:  { count: 12, area: 66, near: 30, far: 170, scale: [0.7, 1.25], sink: 0.28, spacing: 2.4, collide: 0.36, tilt: 6, shadows: true },
  rock_medium: { count: 30, area: 66, near: 25, far: 170, scale: [0.6, 1.3], sink: 0.22, spacing: 1.4, collide: 0.36, tilt: 8, shadows: true },
  stump:       { count: 8, area: 60, near: 25, far: 120, scale: [0.8, 1.15], sink: 0.12, spacing: 1.2, collide: 0.28, tilt: 3, shadows: true },
  branches:    { count: 55, area: 60, near: 15, far: 45, scale: [0.9, 1.4], sink: 0.15, spacing: 0.6, collide: 0, tilt: 6, shadows: true },
  fern:        { count: 160, area: 58, near: 18, far: 50, scale: [1.0, 1.7], sink: 0.05, spacing: 0.7, collide: 0, tilt: 4, shadows: false,
                 wind: { height: 0.45, bend: 0.18, flutter: 0.025 }, onSoil: true },
  grass:       { count: (q) => q.grassClumps, area: 48, near: 14, far: 34, scale: [2.5, 4.0], sink: 0.04, spacing: 0.18, collide: 0, tilt: 8, shadows: false,
                 wind: { height: 0.55, bend: 0.45, flutter: 0.03 }, onSoil: false, tint: [1.35, 1.4, 1.15] },
};
export const PROP_TYPES = Object.keys(RULES);

function loadContainer(app, url) {
  return new Promise((resolve, reject) => {
    const asset = new pc.Asset(url, 'container', { url });
    asset.once('load', () => resolve(asset.resource.renders[0].resource.meshes[0]));
    asset.once('error', (err) => reject(new Error(`模型を読み込めません: ${url}（${err}）`)));
    app.assets.add(asset);
    app.assets.load(asset);
  });
}

function loadTexture(device, url, srgb, anisotropy) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const tex = new pc.Texture(device, {
        name: url, width: img.width, height: img.height, format: pc.PIXELFORMAT_RGBA8, srgb, mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, anisotropy,
      });
      tex.setSource(img);
      resolve(tex);
    };
    img.onerror = () => reject(new Error(`画像を読み込めません: ${url}`));
    img.src = url;
  });
}

/** 全部の小物の形と質感画像を読み込む。失敗したら null（そのときは今までの仮の岩と草で続ける） */
export async function loadProps(app, quality) {
  try {
    const meta = await (await fetch(`${ROOT}/props.json`)).json();
    const device = app.graphicsDevice;
    const types = {};
    await Promise.all(PROP_TYPES.map(async (id) => {
      const m = meta[id];
      const dir = `${ROOT}/${id}`;
      const [diff, nor, arm] = await Promise.all([
        loadTexture(device, `${dir}/${id}_diff.webp`, true, quality.anisotropy),
        loadTexture(device, `${dir}/${id}_nor.webp`, false, quality.anisotropy),
        loadTexture(device, `${dir}/${id}_arm.webp`, false, quality.anisotropy),
      ]);
      const variants = {};
      await Promise.all(Object.entries(m.variants).map(async ([v, vm]) => {
        const [lod0, lod1] = await Promise.all([
          loadContainer(app, `${dir}/${v}_lod0.glb`),
          loadContainer(app, `${dir}/${v}_lod1.glb`),
        ]);
        variants[v] = { ...vm, lod0, lod1 };
      }));
      types[id] = { alpha: m.alpha, textures: { diff, nor, arm }, variants };
    }));
    return types;
  } catch (err) {
    console.warn(err);
    window.__showError?.(`森の小物（草・岩など）を読み込めませんでした。仮の形で続けます。\n  ${err.message}`);
    return null;
  }
}

function createPropMaterial(type, rule, antialias) {
  const { diff, nor, arm } = type.textures;
  const m = new pc.StandardMaterial();
  m.diffuseMap = diff;
  if (rule.tint) m.diffuse = new pc.Color(...rule.tint);
  m.normalMap = nor;
  m.aoMap = arm;
  m.aoMapChannel = 'r';
  m.glossMap = arm;
  m.glossMapChannel = 'g';
  m.glossInvert = true;       // 粗さ → 滑らかさ
  m.useMetalness = true;
  m.metalness = 0;
  m.cull = pc.CULLFACE_NONE;
  m.twoSidedLighting = true;
  if (type.alpha) {
    // 葉の形を、色の画像の透明部分で切り抜く。アンチエイリアスがあるときは縁をなめらかに
    m.opacityMap = diff;
    m.opacityMapChannel = 'a';
    m.alphaTest = 0.3;   // 低めにして、遠くで細い葉が消えにくくする
    m.alphaToCoverage = antialias;
  }
  if (rule.wind) applyWind(m, rule.wind);
  else m.update();
  return m;
}

/**
 * 小物を置いて描く。毎フレーム update(dt, カメラの位置) を呼ぶ
 */
export function createProps(app, config, seed, terrain, obstacles, types) {
  const device = app.graphicsDevice;
  const q = config.quality;
  const rnd = createRandom(seed + 5000);
  const groups = [];
  const box = new pc.BoundingBox(new pc.Vec3(0, 5, 0), new pc.Vec3(config.world.forestRadius + 10, 15, config.world.forestRadius + 10));

  for (const id of PROP_TYPES) {
    const type = types[id];
    if (!type) continue;
    const rule = RULES[id];
    const count = typeof rule.count === 'function' ? rule.count(q) : rule.count;
    const vnames = Object.keys(type.variants);
    const lists = Object.fromEntries(vnames.map((v) => [v, []]));

    // 1. 置く場所を決める
    for (let tries = 0, n = 0; n < count && tries < count * 25; tries++) {
      const r = Math.sqrt(rnd.next()) * rule.area;
      const a = rnd.range(0, Math.PI * 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (r < config.world.clearingRadius * (rule.collide ? 1 : 0.5)) continue;
      // 土が見えている所（地面の色と同じノイズ）を避ける種類
      if (!rule.onSoil && rule.onSoil !== undefined && fbm(x * 0.06, z * 0.06, seed + 31) > 0.58) continue;
      const v = vnames[Math.floor(rnd.next() * vnames.length)];
      const vm = type.variants[v];
      const s = rnd.range(rule.scale[0], rule.scale[1]);
      const width = Math.max(vm.size[0], vm.size[2]) * s;
      if (!obstacles.isFree(x, z, Math.max(rule.spacing * s, rule.collide ? width * 0.4 : 0))) continue;
      const y = terrain.heightAt(x, z) - vm.size[1] * s * rule.sink;
      const mat = new pc.Mat4().setTRS(
        new pc.Vec3(x, y, z),
        new pc.Quat().setFromEulerAngles(rnd.range(-rule.tilt, rule.tilt), rnd.range(0, 360), rnd.range(-rule.tilt, rule.tilt)),
        new pc.Vec3(s, s * rnd.range(0.9, 1.1), s),
      );
      lists[v].push({ x, z, mat });
      // 岩と切り株は当たり判定。草などは場所の重なりを避けるためだけに小さく登録する
      obstacles.add(x, z, rule.collide ? width * rule.collide : 0.01, !!rule.collide);
      n++;
    }

    // 2. 形ごとに近く用・遠く用のインスタンシングを用意する
    const material = createPropMaterial(type, rule, q.antialias);
    for (const v of vnames) {
      const list = lists[v];
      if (!list.length) continue;
      const layer = (mesh, label) => {
        const data = new Float32Array(list.length * 16);
        const vb = new pc.VertexBuffer(device, pc.VertexFormat.getDefaultInstancingFormat(device), list.length, { data, usage: pc.BUFFER_DYNAMIC });
        const mi = new pc.MeshInstance(mesh, material);
        mi.setInstancing(vb);
        mi.instancingCount = 0;
        mi.setCustomAabb(box);
        const e = new pc.Entity(`${id}-${v}-${label}`);
        e.addComponent('render', { meshInstances: [mi], castShadows: rule.shadows, receiveShadows: true });
        app.root.addChild(e);
        return { mi, vb, data };
      };
      groups.push({
        id, rule, list,
        near: layer(type.variants[v].lod0, 'near'),
        far: layer(type.variants[v].lod1, 'far'),
        tris: [type.variants[v].lod0Triangles, type.variants[v].lod1Triangles],
      });
    }
  }

  // 3. 距離で振り分ける
  let lastX = Infinity, lastZ = Infinity, timer = 0, counted = 0;
  function assign(cx, cz) {
    let tris = 0;
    for (const g of groups) {
      const n2 = g.rule.near * g.rule.near, f2 = g.rule.far * g.rule.far;
      let nn = 0, nf = 0;
      for (const p of g.list) {
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 < n2) g.near.data.set(p.mat.data, (nn++) * 16);
        else if (d2 < f2) g.far.data.set(p.mat.data, (nf++) * 16);
      }
      g.near.mi.instancingCount = nn;
      g.far.mi.instancingCount = nf;
      if (nn) g.near.vb.unlock(0, nn * 64);
      if (nf) g.far.vb.unlock(0, nf * 64);
      tris += nn * g.tris[0] + nf * g.tris[1];
    }
    sceneBudget.triangles += tris - counted;
    counted = tris;
  }

  return {
    update(dt, camPos) {
      timer += dt;
      if (Math.hypot(camPos.x - lastX, camPos.z - lastZ) < 1.5 && timer < 0.5) return;
      timer = 0;
      lastX = camPos.x;
      lastZ = camPos.z;
      assign(camPos.x, camPos.z);
    },
    counts: Object.fromEntries(PROP_TYPES.map((id) => [id, groups.filter((g) => g.id === id).reduce((s, g) => s + g.list.length, 0)])),
  };
}
