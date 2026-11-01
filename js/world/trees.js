// 木：Tripo AI で作った 3D モデル（tools/process_trees.mjs でゲーム用に軽くしたもの）を並べる。
//
// 1 種類につき「近く用（lod0）」と「遠く用（lod1）」の 2 つの形を持ち、
// プレイヤーとの距離で、どの木をどちらで描くかを少しずつ入れ替える（LOD）。
// どちらも「インスタンシング」で、種類ごとに 1 回の描画命令で全部の木を描く。
//
// 起動を速くするため、最初は遠く用と色の画像だけを読み込み、近く用は遊び始めてから裏で読み込む。
// 近く用が届くまでは、近くの木も遠く用で描く。
// ※ ファイル名を変えたら、index.html の <link rel="preload"> も直す
import * as pc from 'playcanvas';
import { createRandom } from '../core/random.js';
import { sceneBudget } from '../core/mesh-utils.js';
import { applyWind } from './wind.js';

const ROOT = './assets/trees';
export const TREE_TYPES = ['fir', 'red_pine', 'broadleaf', 'birch', 'dead', 'sapling'];

function loadContainer(app, url) {
  return new Promise((resolve, reject) => {
    const asset = new pc.Asset(url, 'container', { url });
    asset.once('load', () => resolve(asset.resource.renders[0].resource.meshes[0]));
    asset.once('error', (err) => reject(new Error(`模型を読み込めません: ${url}（${err}）`)));
    app.assets.add(asset);
    app.assets.load(asset);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`画像を読み込めません: ${url}`));
    img.src = url;
  });
}

/**
 * 遠く用の形と色の画像を読み込む（近く用は startLoadingNear() で後から）。
 * 失敗したら null を返す（そのときは今までの仮の木で続ける）
 */
export async function loadTreeModels(app, quality) {
  try {
    const meta = await (await fetch(`${ROOT}/trees.json`)).json();
    const types = {};
    await Promise.all(TREE_TYPES.map(async (name) => {
      const [lod1, img] = await Promise.all([
        loadContainer(app, `${ROOT}/${name}_lod1.glb`),
        loadImage(`${ROOT}/${name}_color.webp`),
      ]);
      const tex = new pc.Texture(app.graphicsDevice, {
        name: `${name}_color`,
        width: img.width,
        height: img.height,
        format: pc.PIXELFORMAT_RGBA8,
        srgb: true,
        mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        anisotropy: quality.anisotropy,
      });
      tex.setSource(img);
      types[name] = { meta: meta[name], lod1, lod0: null, texture: tex };
    }));
    return { types };
  } catch (err) {
    console.warn(err);
    window.__showError?.(`木の模型を読み込めませんでした。仮の木で続けます。\n  ${err.message}`);
    return null;
  }
}

/** 近く用の形を裏で読み込み、届いた種類から順に onLoaded(name) を呼ぶ */
export function startLoadingNear(app, models, onLoaded) {
  for (const name of TREE_TYPES) {
    loadContainer(app, `${ROOT}/${name}_lod0.glb`)
      .then((mesh) => { models.types[name].lod0 = mesh; onLoaded(name); })
      .catch((err) => console.warn(err)); // 近く用が無くても遠く用で描けるので、知らせは出さない
  }
}

// 風での揺れ方：bend＝てっぺんの揺れ幅（高さに対する割合）、flutter＝葉のそよぎ（m）
const WIND = {
  fir:       { bend: 0.010, flutter: 0.035 },
  red_pine:  { bend: 0.010, flutter: 0.035 },
  broadleaf: { bend: 0.016, flutter: 0.06 },
  birch:     { bend: 0.020, flutter: 0.06 },
  dead:      { bend: 0.005, flutter: 0.004 },
  sapling:   { bend: 0.035, flutter: 0.03 },
};

function createTreeMaterial(texture, name, height) {
  const m = new pc.StandardMaterial();
  m.diffuseMap = texture;
  m.useMetalness = true;
  m.metalness = 0;
  m.gloss = 0.18;              // 樹皮も葉もほぼつやなし
  m.cull = pc.CULLFACE_NONE;   // 葉は薄い板なので両面を描く
  m.twoSidedLighting = true;   // 裏面も正しい向きで光を受ける
  applyWind(m, { height, ...WIND[name] });
  return m;
}

/**
 * 木を置いて描く。毎フレーム update(カメラの位置) を呼ぶと、距離で近く用・遠く用を入れ替える
 */
export function createModelTrees(app, config, seed, terrain, obstacles, models) {
  const w = config.world;
  const rnd = createRandom(seed + 1000);
  const device = app.graphicsDevice;
  const lodDistance = config.quality.treeLodDistance;

  // 根元の高さ：幹の中心と、根の張り出しの 8 方向の地面のうち、いちばん低い所に合わせる。
  // 坂では、下り側に張った根が宙に浮かないように、その分だけ木を沈める
  const groundUnderRoots = (x, z, rootR) => {
    let y = terrain.heightAt(x, z);
    const r = rootR * 0.6;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      y = Math.min(y, terrain.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
    return y - 0.08;
  };

  // 1. 置く場所を決める（大きい木 → 若木の順。木どうしは葉の広がりに応じて間をあける）
  const placements = {};
  for (const name of TREE_TYPES) placements[name] = [];
  const order = Object.entries(w.trees); // [[種類, 本数], ...]
  for (const [name, count] of order) {
    const m = models.types[name].meta;
    const isSapling = name === 'sapling';
    for (let tries = 0, n = 0; n < count && tries < count * 40; tries++) {
      const r = Math.sqrt(rnd.next()) * w.forestRadius;
      const a = rnd.range(0, Math.PI * 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (r < w.clearingRadius + (isSapling ? 0 : 2)) continue;
      const s = rnd.range(0.8, 1.2);
      const spacing = isSapling ? 1.2 : Math.max(2.0, m.crownRadius * 0.55 * s);
      if (!obstacles.isFree(x, z, spacing)) continue;
      const yaw = rnd.range(0, 360);
      const sy = s * rnd.range(0.92, 1.08);
      const mat = new pc.Mat4().setTRS(
        // 根の付け根の 7 割を埋める（タコ足のように下へ伸びる根が、地面から浮いて見えないように）
        new pc.Vec3(x, groundUnderRoots(x, z, (m.rootRadius ?? 0.5) * s) - (m.rootJunction ?? 0) * 0.7 * sy, z),
        new pc.Quat().setFromEulerAngles(rnd.range(-1.5, 1.5), yaw, rnd.range(-1.5, 1.5)),
        new pc.Vec3(s, sy, s),
      );
      placements[name].push({ x, z, mat });
      // 若木は踏み分けて通れるように当たり判定を小さく、それ以外は幹の太さで
      obstacles.add(x, z, isSapling ? 0.01 : Math.max(0.15, m.trunkRadius * s));
      n++;
    }
  }

  // 2. 種類ごとに、近く用・遠く用のインスタンシングを用意する（入れ物は全部の本数ぶん）
  const forestBox = new pc.BoundingBox(new pc.Vec3(0, 10, 0), new pc.Vec3(w.forestRadius + 8, 20, w.forestRadius + 8));
  const groups = [];
  for (const name of TREE_TYPES) {
    const list = placements[name];
    if (!list.length) continue;
    const t = models.types[name];
    const material = createTreeMaterial(t.texture, name, t.meta.height);
    const makeLayer = (mesh, label) => {
      const data = new Float32Array(list.length * 16);
      const vb = new pc.VertexBuffer(device, pc.VertexFormat.getDefaultInstancingFormat(device), list.length, {
        data, usage: pc.BUFFER_DYNAMIC,
      });
      const mi = new pc.MeshInstance(mesh, material);
      mi.setInstancing(vb);
      mi.instancingCount = 0;
      mi.setCustomAabb(forestBox); // 森全体を囲む箱（影の計算から外されないように）
      const entity = new pc.Entity(`${name}-${label}`);
      entity.addComponent('render', { meshInstances: [mi], castShadows: true, receiveShadows: true });
      app.root.addChild(entity);
      return { entity, mi, vb, data };
    };
    groups.push({
      name, list, material,
      far: makeLayer(t.lod1, 'far'),
      near: null,               // 近く用の形が届いたら作る
      tris: { lod0: t.meta.lod0Triangles, lod1: t.meta.lod1Triangles },
    });
  }

  // 3. 距離で振り分ける
  let lastX = Infinity, lastZ = Infinity, timer = 0, forceUpdate = true;
  function assign(cx, cz) {
    const d2 = lodDistance * lodDistance;
    let tris = 0;
    for (const g of groups) {
      let nNear = 0, nFar = 0;
      for (const p of g.list) {
        const dx = p.x - cx, dz = p.z - cz;
        if (g.near && dx * dx + dz * dz < d2) g.near.data.set(p.mat.data, (nNear++) * 16);
        else g.far.data.set(p.mat.data, (nFar++) * 16);
      }
      g.far.mi.instancingCount = nFar;
      if (nFar) g.far.vb.unlock(0, nFar * 64);
      if (g.near) {
        g.near.mi.instancingCount = nNear;
        if (nNear) g.near.vb.unlock(0, nNear * 64);
      }
      tris += nFar * g.tris.lod1 + nNear * g.tris.lod0;
    }
    treeTriangles = tris;
  }

  // 画面隅の三角形の数に、木の分（そのときの近く用・遠く用の内訳）を足す
  let treeTriangles = 0, counted = 0;

  return {
    /** 近く用の形が届いた種類の、近く用の描画を作る */
    enableNear(name) {
      const g = groups.find((x) => x.name === name);
      const mesh = models.types[name].lod0;
      if (!g || !mesh || g.near) return;
      const data = new Float32Array(g.list.length * 16);
      const vb = new pc.VertexBuffer(device, pc.VertexFormat.getDefaultInstancingFormat(device), g.list.length, {
        data, usage: pc.BUFFER_DYNAMIC,
      });
      const mi = new pc.MeshInstance(mesh, g.material);
      mi.setInstancing(vb);
      mi.instancingCount = 0;
      mi.setCustomAabb(forestBox);
      const entity = new pc.Entity(`${name}-near`);
      entity.addComponent('render', { meshInstances: [mi], castShadows: true, receiveShadows: true });
      app.root.addChild(entity);
      g.near = { entity, mi, vb, data };
      forceUpdate = true;
    },
    /** 毎フレーム呼ぶ。カメラが 2m 以上動いたか、0.5 秒たったら振り分け直す */
    update(dt, camPos) {
      timer += dt;
      const moved = Math.hypot(camPos.x - lastX, camPos.z - lastZ) > 2;
      if (!forceUpdate && !moved && timer < 0.5) return;
      timer = 0;
      forceUpdate = false;
      lastX = camPos.x;
      lastZ = camPos.z;
      assign(camPos.x, camPos.z);
      sceneBudget.triangles += treeTriangles - counted;
      counted = treeTriangles;
    },
    counts: Object.fromEntries(groups.map((g) => [g.name, g.list.length])),
    placements, // 確認用（自動テストから木の位置を読むため）
  };
}
