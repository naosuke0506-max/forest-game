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
 *   stream    ：自分の周りだけに置く（数が多い草・シダ・落ち枝）。12m 四方の区画ごとに、種から決まる置き方で作る。
 *               count と area は「密度」（count ÷ 半径 area の円の広さ）として使う
 * area は歩ける範囲が半径 62m だったときの値。今の広さに合わせて、count を広さの比で増やす（stream 以外）
 */
const RULES = {
  rock_large:  { count: 12, area: 66, near: 30, far: 170, scale: [0.7, 1.25], sink: 0.28, spacing: 2.4, collide: 0.36, tilt: 6, shadows: true },
  rock_medium: { count: 30, area: 66, near: 25, far: 170, scale: [0.6, 1.3], sink: 0.22, spacing: 1.4, collide: 0.36, tilt: 8, shadows: true },
  stump:       { count: 8, area: 60, near: 25, far: 120, scale: [0.8, 1.15], sink: 0.12, spacing: 1.2, collide: 0.28, tilt: 3, shadows: true },
  branches:    { count: 55, area: 60, near: 15, far: 45, scale: [0.9, 1.4], sink: 0.15, spacing: 0.6, collide: 0, tilt: 6, shadows: true, stream: true },
  fern:        { count: 160, area: 58, near: 18, far: 50, scale: [1.0, 1.7], sink: 0.05, spacing: 0.7, collide: 0, tilt: 4, shadows: false,
                 wind: { height: 0.45, bend: 0.18, flutter: 0.025 }, onSoil: true, stream: true },
  grass:       { count: (q) => q.grassClumps, area: 48, near: 14, far: 34, scale: [2.5, 4.0], sink: 0.04, spacing: 0.18, collide: 0, tilt: 8, shadows: false,
                 wind: { height: 0.55, bend: 0.45, flutter: 0.03 }, onSoil: false, tint: [1.35, 1.4, 1.15], stream: true },
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
  const streams = [];
  const R = config.world.forestRadius;
  const box = new pc.BoundingBox(new pc.Vec3(0, 5, 0), new pc.Vec3(R + 10, 15, R + 10));
  const areaScale = config.world.playRadius / 62;   // 置く範囲の倍率（もとは半径 62m で決めた値）
  const CELL = 12;

  /** 1 本分の置き方を決める（置けなければ null）。stream の物は、木や岩（ぶつかる物）だけを避ける */
  function placeOne(rule, type, vnames, r01, x, z) {
    const r = Math.hypot(x, z);
    if (r < config.world.clearingRadius * (rule.collide ? 1 : 0.5) || r > R) return null;
    if (!rule.onSoil && rule.onSoil !== undefined && fbm(x * 0.06, z * 0.06, seed + 31) > 0.58) return null;
    const v = vnames[Math.floor(r01() * vnames.length)];
    const vm = type.variants[v];
    const s = rule.scale[0] + (rule.scale[1] - rule.scale[0]) * r01();
    const width = Math.max(vm.size[0], vm.size[2]) * s;
    const clear = Math.max(rule.spacing * s, rule.collide ? width * 0.4 : 0);
    if (!obstacles.isFree(x, z, rule.stream ? Math.max(0.3, clear * 0.5) : clear, !!rule.stream)) return null;
    const y = terrain.heightAt(x, z) - vm.size[1] * s * rule.sink;
    const mat = new pc.Mat4().setTRS(
      new pc.Vec3(x, y, z),
      new pc.Quat().setFromEulerAngles((r01() * 2 - 1) * rule.tilt, r01() * 360, (r01() * 2 - 1) * rule.tilt),
      new pc.Vec3(s, s * (0.9 + r01() * 0.2), s),
    );
    return { v, x, z, mat, width };
  }

  for (const id of PROP_TYPES) {
    const type = types[id];
    if (!type) continue;
    const rule = RULES[id];
    const baseCount = typeof rule.count === 'function' ? rule.count(q) : rule.count;
    const vnames = Object.keys(type.variants);
    const lists = Object.fromEntries(vnames.map((v) => [v, []]));

    // 1. 置く場所を決める（stream の物は、あとで自分の周りの区画ごとに作る）
    if (!rule.stream) {
      const count = Math.round(baseCount * areaScale * areaScale);
      const area = Math.min(R, rule.area * areaScale);
      for (let tries = 0, n = 0; n < count && tries < count * 25; tries++) {
        const r = Math.sqrt(rnd.next()) * area;
        const a = rnd.range(0, Math.PI * 2);
        const p = placeOne(rule, type, vnames, () => rnd.next(), Math.cos(a) * r, Math.sin(a) * r);
        if (!p) continue;
        lists[p.v].push(p);
        // 岩と切り株は当たり判定。それ以外は場所の重なりを避けるためだけに小さく登録する
        obstacles.add(p.x, p.z, rule.collide ? p.width * rule.collide : 0.01, !!rule.collide);
        n++;
      }
    }

    // 2. 形ごとに近く用・遠く用のインスタンシングを用意する
    const material = createPropMaterial(type, rule, q.antialias);
    const density = baseCount / (Math.PI * rule.area * rule.area);   // 1 平方メートルあたりの数（stream 用）
    const perCell = density * CELL * CELL;
    const capacity = rule.stream ? Math.ceil(perCell * Math.pow((2 * rule.far) / CELL + 2, 2) * 1.2 / vnames.length) + 16 : 0;
    for (const v of vnames) {
      const list = lists[v];
      if (!rule.stream && !list.length) continue;
      const size = rule.stream ? capacity : list.length;
      const layer = (mesh, label) => {
        const data = new Float32Array(size * 16);
        const vb = new pc.VertexBuffer(device, pc.VertexFormat.getDefaultInstancingFormat(device), size, { data, usage: pc.BUFFER_DYNAMIC });
        const mi = new pc.MeshInstance(mesh, material);
        mi.setInstancing(vb);
        mi.instancingCount = 0;
        mi.setCustomAabb(box);
        const e = new pc.Entity(`${id}-${v}-${label}`);
        e.addComponent('render', { meshInstances: [mi], castShadows: rule.shadows, receiveShadows: true });
        app.root.addChild(e);
        return { mi, vb, data, size };
      };
      groups.push({
        id, rule, v, list,
        near: layer(type.variants[v].lod0, 'near'),
        far: layer(type.variants[v].lod1, 'far'),
        tris: [type.variants[v].lod0Triangles, type.variants[v].lod1Triangles],
      });
    }
    // stream の物：区画（12m 四方）ごとに、種から決まる乱数で置く。同じ区画は何度作っても同じ置き方
    if (rule.stream) {
      const cells = new Map();
      const typeSeed = seed + 7000 + PROP_TYPES.indexOf(id) * 1013;
      streams.push({
        id, rule, cells,
        groups: groups.filter((g) => g.id === id),
        make(cx, cz) {
          const r = createRandom(typeSeed + cx * 73856093 + cz * 19349663);
          const out = [];
          const n = Math.floor(perCell) + (r.next() < perCell % 1 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const p = placeOne(rule, type, vnames, () => r.next(), (cx + r.next()) * CELL, (cz + r.next()) * CELL);
            if (p) out.push(p);
          }
          return out;
        },
      });
    }
  }

  // 3. 距離と向きで振り分ける：近く用・遠く用・描かない。
  //    カメラの後ろにある物は、影が届く近さ（shadowDistance）より遠ければ描かない
  let lastX = Infinity, lastZ = Infinity, lastYaw = Infinity, timer = 0, counted = 0;
  const keep2 = (q.shadowDistance + 5) * (q.shadowDistance + 5);
  const cosView = Math.cos((72 * Math.PI) / 180);
  function visible(dx, dz, d2, fx, fz) {
    if (d2 < keep2) return true;
    const d = Math.sqrt(d2);
    return (dx * fx + dz * fz) / d > cosView - 4 / d;   // 物の大きさの分だけ、少し広めに見る
  }
  function updateStreams(cx, cz) {
    for (const st of streams) {
      const reach = st.rule.far + CELL;
      const x0 = Math.floor((cx - reach) / CELL), x1 = Math.floor((cx + reach) / CELL);
      const z0 = Math.floor((cz - reach) / CELL), z1 = Math.floor((cz + reach) / CELL);
      for (const [k, c] of st.cells) {   // 遠くなった区画は捨てる
        if (c.cx < x0 - 1 || c.cx > x1 + 1 || c.cz < z0 - 1 || c.cz > z1 + 1) st.cells.delete(k);
      }
      for (let gx = x0; gx <= x1; gx++) {
        for (let gz = z0; gz <= z1; gz++) {
          const k = `${gx},${gz}`;
          if (!st.cells.has(k)) st.cells.set(k, { cx: gx, cz: gz, items: st.make(gx, gz) });
        }
      }
    }
  }
  function assign(cx, cz, fx, fz) {
    let tris = 0;
    for (const g of groups) {
      const far = Math.min(g.rule.far, config.world.drawDistance ?? g.rule.far);
      const n2 = g.rule.near * g.rule.near, f2 = far * far;
      let nn = 0, nf = 0;
      const put = (p) => {
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= f2 || !visible(dx, dz, d2, fx, fz)) return;
        if (d2 < n2) { if (nn < g.near.size) g.near.data.set(p.mat.data, (nn++) * 16); }
        else if (nf < g.far.size) g.far.data.set(p.mat.data, (nf++) * 16);
      };
      if (g.rule.stream) {
        const st = streams.find((x) => x.id === g.id);
        for (const c of st.cells.values()) for (const p of c.items) if (p.v === g.v) put(p);
      } else {
        for (const p of g.list) put(p);
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
    /** 毎フレーム呼ぶ。camFwd：カメラの向き（後ろの物を描かないため） */
    update(dt, camPos, camFwd = null) {
      timer += dt;
      const yaw = camFwd ? Math.atan2(camFwd.x, camFwd.z) : 0;
      const turned = Math.abs(((yaw - lastYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.15;
      if (Math.hypot(camPos.x - lastX, camPos.z - lastZ) < 1.5 && !turned && timer < 0.5) return;
      timer = 0;
      lastX = camPos.x;
      lastZ = camPos.z;
      lastYaw = yaw;
      const fl = camFwd ? Math.hypot(camFwd.x, camFwd.z) || 1 : 1;
      updateStreams(camPos.x, camPos.z);
      assign(camPos.x, camPos.z, camFwd ? camFwd.x / fl : 0, camFwd ? camFwd.z / fl : 1);
    },
    counts: Object.fromEntries(PROP_TYPES.map((id) => [id, groups.filter((g) => g.id === id).reduce((s, g) => s + g.list.length, 0)])),
  };
}
