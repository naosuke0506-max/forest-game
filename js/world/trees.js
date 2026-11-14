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

// 木の模型：Blender（Sapling Tree Gen）で作ったもの。tools/trees_blender/ で作り直せる。
// 各模型は「樹皮（bark）」と「葉（leaves）」の 2 つの部分を持ち、それぞれ別の画像を貼る
// （前の Tripo AI の木は assets/trees/ に残してある）
const ROOT = './assets/trees_blender';
export const TREE_TYPES = ['fir', 'red_pine', 'broadleaf', 'birch', 'dead', 'sapling', 'bush'];
// 小さな木（若木・低い木）：踏み分けて通れ、太陽もさえぎらない。描く遠さも短い
const SMALL = { sapling: 60, bush: 60 };

/** 模型を読み込み、部分ごとの形（材質の名前 → 形）にする */
function loadContainer(app, url) {
  return new Promise((resolve, reject) => {
    const asset = new pc.Asset(url, 'container', { url });
    asset.once('load', () => {
      const e = asset.resource.instantiateRenderEntity();
      const parts = {};
      for (const r of e.findComponents('render')) for (const mi of r.meshInstances) parts[mi.material.name] = mi.mesh;
      e.destroy();
      resolve(parts);
    });
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
    // 画像：樹皮（繰り返して貼る）と葉の房（透明あり）。同じ画像は 1 回だけ読む
    const textures = {};
    const textureOf = (file, repeat) => (textures[file] ||= loadImage(`${ROOT}/${file}`).then((img) => {
      const tex = new pc.Texture(app.graphicsDevice, {
        name: file, width: img.width, height: img.height,
        format: pc.PIXELFORMAT_RGBA8, srgb: true, mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
        addressU: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
        addressV: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
        anisotropy: quality.anisotropy,
      });
      tex.setSource(img);
      return tex;
    }));
    const types = {};
    await Promise.all(TREE_TYPES.map(async (name) => {
      const m = meta[name];
      const [lod1, bark, leaves] = await Promise.all([
        loadContainer(app, `${ROOT}/${name}_lod1.glb`),
        textureOf(`bark_${m.bark}.webp`, true),
        m.leafAtlas ? textureOf(`leaves_${m.leafAtlas}.webp`, false) : null,
      ]);
      types[name] = { meta: m, lod1, lod0: null, textures: { bark, leaves } };
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
      .then((parts) => { models.types[name].lod0 = parts; onLoaded(name); })
      .catch((err) => console.warn(err)); // 近く用が無くても遠く用で描けるので、知らせは出さない
  }
}

// 風での揺れ方：bend＝てっぺんの揺れ幅（高さに対する割合）、flutter＝葉のそよぎ（m）
const WIND = {
  fir:       { bend: 0.040, flutter: 0.10 },
  red_pine:  { bend: 0.038, flutter: 0.10 },
  broadleaf: { bend: 0.050, flutter: 0.15 },
  birch:     { bend: 0.060, flutter: 0.15 },
  dead:      { bend: 0.015, flutter: 0.01 },
  sapling:   { bend: 0.080, flutter: 0.06 },
  bush:      { bend: 0.06, flutter: 0.1 },
};

// 葉の色に掛ける色（葉の房の画像は明るい黄緑なので、種類ごとに落ち着いた色にする）
const LEAF_TINT = {
  fir: [0.62, 0.78, 0.6], red_pine: [0.7, 0.82, 0.62], sapling: [0.66, 0.82, 0.62],
  broadleaf: [0.66, 0.78, 0.5], birch: [0.78, 0.9, 0.55], dead: [1, 1, 1], bush: [0.8, 0.88, 0.45],
};

/** 樹皮（不透明。画像を繰り返して貼る）と葉（透明な所を切り抜く。両面）の材質 */
function createTreeMaterials(t, name, antialias) {
  const wind = { height: t.meta.height, ...WIND[name] };
  const bark = new pc.StandardMaterial();
  bark.diffuseMap = t.textures.bark;
  bark.useMetalness = true;
  bark.metalness = 0;
  bark.gloss = 0.15;
  applyWind(bark, wind);
  let leaves = null;
  if (t.textures.leaves) {
    leaves = new pc.StandardMaterial();
    leaves.diffuseMap = t.textures.leaves;
    leaves.diffuse = new pc.Color(...LEAF_TINT[name]);
    leaves.opacityMap = t.textures.leaves;
    leaves.opacityMapChannel = 'a';
    leaves.alphaTest = 0.45;
    leaves.alphaToCoverage = !!antialias;   // 縁をなめらかに（画面のなめらか処理があるときだけ効く）
    leaves.useMetalness = true;
    leaves.metalness = 0;
    leaves.gloss = 0.25;
    leaves.cull = pc.CULLFACE_NONE;   // 葉は薄い板なので両面を描く
    leaves.twoSidedLighting = true;   // 裏面も正しい向きで光を受ける
    applyWind(leaves, wind);
  }
  return { bark, leaves };
}

/**
 * 木を置いて描く。毎フレーム update(カメラの位置) を呼ぶと、距離で近く用・遠く用を入れ替える
 */
export function createModelTrees(app, config, seed, terrain, obstacles, models, zones = null) {
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
  const canopies = [];
  const trunks = [];
  for (const name of TREE_TYPES) placements[name] = [];
  const order = Object.entries(w.trees); // [[種類, 本数], ...]
  // エリアごとの木の多さ（中央の森を 1 とした倍率。深い森は 3 倍以上、大草原はまばら、村と道には置かない）。
  // 本数は「森全体が中央の森と同じ多さ」のときの数なので、平均の多さを掛けて実際の本数にする
  // 茂み（bush）だけは、深い森でも増やしすぎない（下草として森全体にほどよく）
  // 歩ける範囲の外（縁から 1.5〜7m 先から）は、大きな木を少し密にする：周りの山の斜面にも森が続いて見える。
  // 山の高い所（岩場）は少なくする（2026-11-14：外周の柵を無くし、山が端になった）。茂みと若木は範囲の外には置かない
  const beltOf = (x, z) => {
    const t = Math.min(1, Math.max(0, (Math.hypot(x, z) - (w.playRadius + 1.5)) / 5.5));
    return t * t * (3 - 2 * t);
  };
  const densityOf = (name) => {
    if (!zones) return () => 1;
    if (name in SMALL) return (x, z) => (name === 'bush' ? bushDensity(x, z) : zones.treeDensity(x, z)) * (1 - beltOf(x, z));
    return (x, z) => { const d = zones.treeDensity(x, z), b = beltOf(x, z) * (1 - (zones.rocky?.(x, z) ?? 0)); return d + (1.8 - d) * b; };
  };
  const bushDensity = (x, z) => {
    const w = zones.weights(x, z);
    return (w.mixed * 1 + w.deep * 0.8 + w.prairie * 0.25) * (1 - zones.path(x, z)) * (1 - (zones.wet?.(x, z) ?? 0)) * (1 - 0.7 * (zones.rocky?.(x, z) ?? 0)) * (1 - (zones.caveArea?.(x, z) ?? 0));
  };
  const avgOf = (fn) => {
    if (!zones) return 1;
    const probe = createRandom(seed + 4321);
    let avg = 0;
    for (let i = 0; i < 4000; i++) {
      const r = Math.sqrt(probe.next()) * w.forestRadius, a = probe.next() * Math.PI * 2;
      avg += fn(Math.cos(a) * r, Math.sin(a) * r);
    }
    return avg / 4000;
  };
  const MAX_D = 3.2;
  for (const [name, baseCount] of order) {
    const m = models.types[name].meta;
    const isSapling = name in SMALL;
    const densityAt = densityOf(name);
    const count = Math.round(baseCount * avgOf(densityAt));
    for (let tries = 0, n = 0; n < count && tries < count * 60; tries++) {
      const r = Math.sqrt(rnd.next()) * w.forestRadius;
      const a = rnd.range(0, Math.PI * 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (r < w.clearingRadius + (isSapling ? 0 : 2)) continue;
      const dens = densityAt(x, z);
      if (rnd.next() * MAX_D > dens) continue;          // 多い所ほど置かれやすい
      const s = rnd.range(0.8, 1.2);
      // 深い森は木と木の間を詰める（葉が重なって空を覆うように）
      const tight = 1 - 0.45 * Math.min(1, Math.max(0, dens - 1) / 2.2);
      const spacing = isSapling ? 1.2 : Math.max(1.6, m.crownRadius * 0.55 * s * tight);
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
      // 葉の広がり（太陽のまぶしさを葉がさえぎるかの判定に使う、だいたいの球）
      if (!isSapling) {
        const base = mat.getTranslation(new pc.Vec3()).y;
        canopies.push({ x, y: base + m.height * sy * 0.62, z, r: Math.max(1.5, m.crownRadius * s * 0.55) });
        trunks.push({ x, z, r: Math.max(0.15, m.trunkRadius * s), top: base + m.height * sy * 0.8 });
      }
      // 若木は踏み分けて通れるように当たり判定を小さく、それ以外は幹の太さで
      obstacles.add(x, z, isSapling ? 0.01 : Math.max(0.15, m.trunkRadius * s), !isSapling);
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
    const material = createTreeMaterials(t, name, config.quality.antialias);
    // 1 本分の形（樹皮と葉の 2 つ）を、同じ置き場所の入れ物（インスタンス）で描く
    const makeLayer = (parts, label) => {
      const data = new Float32Array(list.length * 16);
      const vb = new pc.VertexBuffer(device, pc.VertexFormat.getDefaultInstancingFormat(device), list.length, {
        data, usage: pc.BUFFER_DYNAMIC,
      });
      const mis = [];
      for (const part of ['bark', 'leaves']) {
        if (!parts[part] || !material[part]) continue;
        const mi = new pc.MeshInstance(parts[part], material[part]);
        mi.setInstancing(vb);
        mi.instancingCount = 0;
        mi.setCustomAabb(forestBox); // 森全体を囲む箱（影の計算から外されないように）
        mis.push(mi);
      }
      const entity = new pc.Entity(`${name}-${label}`);
      entity.addComponent('render', { meshInstances: mis, castShadows: true, receiveShadows: true });
      app.root.addChild(entity);
      // 本数を変えるときは、両方の部分に同じ数を入れる
      const mi = { set instancingCount(n) { for (const x of mis) x.instancingCount = n; } };
      return { entity, mi, vb, data };
    };
    groups.push({
      name, list, material, makeLayer,
      maxDist2: SMALL[name] ? SMALL[name] * SMALL[name] : Infinity,   // 小さな木は近くだけ描く
      far: makeLayer(t.lod1, 'far'),
      near: null,               // 近く用の形が届いたら作る
      tris: { lod0: t.meta.lod0Triangles, lod1: t.meta.lod1Triangles },
    });
  }

  // 3. 距離で振り分ける
  let lastX = Infinity, lastZ = Infinity, lastYaw = Infinity, timer = 0, forceUpdate = true;
  // 描かない木：見える遠さ（霧でほぼ見えなくなる所）より遠い木と、カメラの後ろの木（影が届く近さより遠いもの）
  let drawDist2 = Math.pow(config.world.drawDistance ?? config.atmosphere.farClip, 2);
  const keep2 = Math.pow(config.quality.shadowDistance + 8, 2);
  const cosView = Math.cos((72 * Math.PI) / 180);
  const MAX_NEAR = 30;   // 精細な形で描く木は、近い順に最大 30 本（深い森で増えすぎないように）
  let ddList = new Float32Array(256);
  function assign(cx, cz, fx, fz) {
    // 精細な形にする距離：lodDistance と、「近い順に 30 本目」の距離の、近い方
    let d2 = lodDistance * lodDistance, nd = 0;
    for (const g of groups) {
      if (!g.near) continue;
      for (const p of g.list) {
        const dx = p.x - cx, dz = p.z - cz, dd = dx * dx + dz * dz;
        if (dd < d2) {
          if (nd >= ddList.length) { const a = new Float32Array(ddList.length * 2); a.set(ddList); ddList = a; }
          ddList[nd++] = dd;
        }
      }
    }
    if (nd > MAX_NEAR) d2 = ddList.subarray(0, nd).sort()[MAX_NEAR - 1];
    let tris = 0;
    for (const g of groups) {
      let nNear = 0, nFar = 0;
      for (const p of g.list) {
        const dx = p.x - cx, dz = p.z - cz, dd = dx * dx + dz * dz;
        if (dd > drawDist2 || dd > g.maxDist2) continue;
        if (dd > keep2 && (dx * fx + dz * fz) / Math.sqrt(dd) < cosView - 8 / Math.sqrt(dd)) continue;
        if (g.near && dd < d2) g.near.data.set(p.mat.data, (nNear++) * 16);
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
      const parts = models.types[name].lod0;
      if (!g || !parts || g.near) return;
      g.near = g.makeLayer(parts, 'near');
      forceUpdate = true;
    },
    /** 木を描く遠さを変える（深い森の中は霧が濃く遠くが見えないので、近くだけ描く） */
    setDrawDistance(d) {
      const d2 = d * d;
      if (Math.abs(d2 - drawDist2) > 25) { drawDist2 = d2; forceUpdate = true; }
    },
    /** 毎フレーム呼ぶ。カメラが 2m 以上動いたか、向きが変わったか、0.5 秒たったら振り分け直す */
    update(dt, camPos, camFwd = null) {
      timer += dt;
      const moved = Math.hypot(camPos.x - lastX, camPos.z - lastZ) > 2;
      const yaw = camFwd ? Math.atan2(camFwd.x, camFwd.z) : 0;
      const turned = Math.abs(((yaw - lastYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.15;
      if (!forceUpdate && !moved && !turned && timer < 0.5) return;
      timer = 0;
      forceUpdate = false;
      lastX = camPos.x;
      lastZ = camPos.z;
      lastYaw = yaw;
      const fl = camFwd ? Math.hypot(camFwd.x, camFwd.z) || 1 : 1;
      assign(camPos.x, camPos.z, camFwd ? camFwd.x / fl : 0, camFwd ? camFwd.z / fl : 1);
      sceneBudget.triangles += treeTriangles - counted;
      counted = treeTriangles;
    },
    counts: Object.fromEntries(groups.map((g) => [g.name, g.list.length])),
    placements, // 確認用（自動テストから木の位置を読むため）
    canopies,   // 葉の広がり（だいたいの球）。太陽のまぶしさを葉がさえぎるかの判定に使う
    trunks,     // 幹（円柱）。同じく太陽をさえぎるかの判定に使う
  };
}
