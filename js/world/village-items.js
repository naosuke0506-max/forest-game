// 現代の村の暮らしの物（② 村の暮らしの物。2026-11-21。マップは全部現代）を描く。置く場所は world/village-life.js と world/landmarks.js が決める
//   小物：Poly Haven（CC0）の模型を tools/process_village_props.mjs で軽くした物（ごみ箱・ごみ袋・室外機・ガス瓶・木の食卓・椅子・
//         植木箱・古いタイヤ・携行缶・覆いを掛けた車）。模型ごとに「インスタンシング」で 1 回の描画命令にまとめ、
//         近くの物だけを描く（遠くの小物は見えないので）
//   乗り物：Blender で作った模型（tools/make_vehicles.py → tools/process_vehicles.mjs。小さい車・ワゴン・荷台のある車・トラクター・
//         自転車・給油機）。置く場所ごと（村・ガソリンスタンド）に、つやのある物とつやの無い物の 2 つの形へ焼き込む（描画命令 2 つ）。
//         色は材質の名前で決め、塗装（paint）だけは置くたびに色を変える
// 模型は起動の後に裏で読み込む（届くまでは何も無い。当たり判定は先に置く）
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { BUILD } from '../version.js';
import { PROP_INFO } from './village-life.js';

const ROOT = './assets/village';

/** 乗り物の材質の名前 → 色（sRGB）とつや（gloss の形に入れるか） */
const VEHICLE_MATS = {
  paint: { c: null, gloss: true },
  glass: { c: [0.05, 0.07, 0.08], gloss: true },
  chrome: { c: [0.72, 0.72, 0.74], gloss: true },
  light: { c: [0.86, 0.86, 0.82], gloss: true },
  taillight: { c: [0.52, 0.05, 0.04], gloss: true },
  screen: { c: [0.03, 0.04, 0.04], gloss: true },
  rubber: { c: [0.05, 0.05, 0.05], gloss: false },
  plastic: { c: [0.09, 0.09, 0.095], gloss: false },
  seat: { c: [0.13, 0.12, 0.12], gloss: false },
  metal: { c: [0.36, 0.37, 0.39], gloss: false },
};

/** 横の向き（ヨー）・前後の傾き（ピッチ）・横の傾き（ロール）から回転を作る（度） */
function quatOf(yaw, pitch = 0, roll = 0) {
  return new pc.Quat().setFromEulerAngles(0, yaw, 0).mul(new pc.Quat().setFromEulerAngles(pitch, 0, roll));
}

/**
 * GLB を自分で読む（乗り物は頂点を取り出して焼き込むので、エンジンの読み込みは使わない）。
 * 位置と法線を小さな整数にした物（KHR_mesh_quantization）にも対応する。返す形：{ 部品の名前: [{ mat, pos, nor, idx }] }
 */
async function readGlb(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error(`GLB ではありません: ${url}`);
  const jlen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jlen)));
  const binStart = 20 + jlen + 8;
  const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const read = (ai) => {
    const a = json.accessors[ai], bv = json.bufferViews[a.bufferView];
    const n = COMP[a.type], sz = SIZE[a.componentType], stride = bv.byteStride || n * sz;
    const base = binStart + (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = new Float32Array(a.count * n);
    const get = {
      5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true),
      5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true),
    }[a.componentType];
    // 小さな整数の正規化（-1〜1 / 0〜1 に戻す）
    const norm = a.normalized ? { 5120: 1 / 127, 5121: 1 / 255, 5122: 1 / 32767, 5123: 1 / 65535 }[a.componentType] : 1;
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) {
      const v = get(base + i * stride + k * sz) * norm;
      out[i * n + k] = a.normalized && (a.componentType === 5120 || a.componentType === 5122) ? Math.max(-1, v) : v;
    }
    return out;
  };
  const models = {};
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    const t = node.translation || [0, 0, 0], s = node.scale || [1, 1, 1], r = node.rotation || [0, 0, 0, 1];
    const q = new pc.Quat(r[0], r[1], r[2], r[3]);
    const tmp = new pc.Vec3();
    const prims = [];
    for (const p of json.meshes[node.mesh].primitives) {
      const pos = read(p.attributes.POSITION), nor = read(p.attributes.NORMAL), idx = read(p.indices);
      // 部品の動き（位置・回転・大きさ）を頂点に焼き込む。法線は大きさの逆数を掛けてから回す
      for (let i = 0; i < pos.length; i += 3) {
        tmp.set(pos[i] * s[0], pos[i + 1] * s[1], pos[i + 2] * s[2]);
        q.transformVector(tmp, tmp);
        pos[i] = tmp.x + t[0]; pos[i + 1] = tmp.y + t[1]; pos[i + 2] = tmp.z + t[2];
        tmp.set(nor[i] / s[0], nor[i + 1] / s[1], nor[i + 2] / s[2]);
        q.transformVector(tmp, tmp).normalize();
        nor[i] = tmp.x; nor[i + 1] = tmp.y; nor[i + 2] = tmp.z;
      }
      prims.push({ mat: json.materials[p.material]?.name || 'paint', pos, nor, idx });
    }
    models[node.name] = prims;
  }
  return models;
}

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
 * 置く物を貯めて、模型が届いたら描く
 * @param {object} config 設定（config.qualityName で描く距離を変える）
 */
export function createVillageItems(app, config) {
  const props = [];      // { id, x, z, mat: pc.Mat4 }
  const vehicles = [];   // { id, group, mat: pc.Mat4, rot: pc.Quat, color }
  // 小物を描く距離（m）：画質で変える
  const NEAR = config.qualityName === 'low' ? 45 : config.qualityName === 'high' ? 85 : 65;
  const groups = [];     // 小物：模型の部品ごとのインスタンシング
  const far = [];        // 乗り物の形（置く場所ごと）：遠くなら描かない
  const VEH_FAR = 150;   // これより遠い所の乗り物は描かない（m。木を描く遠さ 125 m と霧に合わせる）
  let ready = false, timer = 0, counted = 0;
  const stats = { props: 0, vehicles: 0, vehicleTris: 0, drawCalls: 0 };

  const api = {
    stats,
    /** 確かめ用：置いた所 */
    get placed() {
      return {
        props: props.map((p) => ({ id: p.id, x: p.x, z: p.z })),
        vehicles: vehicles.map((v) => ({ id: v.id, group: v.group, x: v.mat.data[12], y: v.mat.data[13], z: v.mat.data[14] })),
      };
    },
    /**
     * 小物を 1 つ置く（x, y, z：底の真ん中。y は地面の高さ。yaw：前（+Z）の向き。flat：寝かせる（タイヤ）・
     * pitch・roll：傾き（度）・lean：立てた物の横の傾き）
     */
    prop(id, x, y, z, yaw, { pitch = 0, roll = 0, flat = false, scale = 1 } = {}) {
      const info = PROP_INFO[id];
      if (!info) return;
      const lift = flat ? info.flatLift ?? 0 : info.lift ?? 0;
      const rot = flat ? quatOf(yaw).mul(new pc.Quat().setFromEulerAngles(90, 0, 0)) : quatOf(yaw, pitch, roll);
      const mat = new pc.Mat4().setTRS(new pc.Vec3(x, y + lift * scale, z), rot, new pc.Vec3(scale, scale, scale));
      props.push({ id, x, z, mat });
    },
    /**
     * 乗り物を 1 つ置く。group：焼き込む先（同じ場所の物をまとめる。見えない所の物は描かない）・color：塗装の色（sRGB）
     */
    vehicle(id, x, y, z, yaw, color, group, { pitch = 0, roll = 0 } = {}) {
      const rot = quatOf(yaw, pitch, roll);
      vehicles.push({ id, group, rot, color, mat: new pc.Mat4().setTRS(new pc.Vec3(x, y, z), rot, pc.Vec3.ONE) });
    },
    /** 模型を読み込んで描く（裏で。失敗しても村はそのまま使える） */
    async load() {
      const v = BUILD;
      await Promise.all([loadProps(v).catch((e) => console.warn(e)), loadVehicles(v).catch((e) => console.warn(e))]);
      ready = true;
      timer = 0;
    },
    /** 近くの小物だけを描く（0.4 秒ごとに選び直す） */
    update(dt, cx, cz) {
      if (!ready) return;
      timer -= dt;
      if (timer > 0) return;
      timer = 0.4;
      let tris = 0;
      for (const f of far) {
        f.e.enabled = Math.hypot(f.x - cx, f.z - cz) < VEH_FAR + f.r;
        if (f.e.enabled) tris += f.tris;
      }
      for (const g of groups) {
        let n = 0;
        const lim = (NEAR * g.reach) ** 2;
        for (const p of g.list) {
          const dx = p.x - cx, dz = p.z - cz;
          if (dx * dx + dz * dz < lim) g.data.set(p.mat.data, (n++) * 16);
        }
        g.mi.instancingCount = n;
        if (n) g.vb.unlock(0, n * 64);
        tris += n * g.tris;
      }
      sceneBudget.triangles += tris - counted;
      counted = tris;
    },
  };

  async function loadProps(v) {
    const ids = [...new Set(props.map((p) => p.id))];
    const device = app.graphicsDevice;
    await Promise.all(ids.map(async (id) => {
      const res = await loadContainer(app, `${ROOT}/${id}.glb?v=${v}`);
      const list = props.filter((p) => p.id === id);
      // 模型の部品（形と材質）を 1 回だけ取り出して、それぞれをインスタンシングにする
      const tmp = res.instantiateRenderEntity();
      // 部品の向きと位置（模型の中の節に残っていることがある。ごみ箱は回転、覆いの車はずれ）も一緒に取り出す
      const parts = [];
      for (const rc of tmp.findComponents('render')) for (const mi of rc.meshInstances) parts.push({ mesh: mi.mesh, material: mi.material, local: mi.node.getWorldTransform().clone() });
      tmp.destroy();
      // 全部の置き場所を囲む箱（見えない所の物を描かないための箱。影から外されないよう広めに）
      const lo = new pc.Vec3(Infinity, Infinity, Infinity), hi = new pc.Vec3(-Infinity, -Infinity, -Infinity);
      for (const p of list) { const t = p.mat.getTranslation(); lo.min(t); hi.max(t); }
      const aabb = new pc.BoundingBox();
      aabb.setMinMax(lo.sub(new pc.Vec3(5, 2, 5)), hi.add(new pc.Vec3(5, 5, 5)));
      const info = PROP_INFO[id];
      for (const part of parts) {
        const m = part.material;
        m.cull = pc.CULLFACE_NONE;
        m.update();
        const data = new Float32Array(list.length * 16);
        const vb = new pc.VertexBuffer(device, pc.VertexFormat.getDefaultInstancingFormat(device), list.length, { data, usage: pc.BUFFER_DYNAMIC });
        const mi = new pc.MeshInstance(part.mesh, m);
        mi.setInstancing(vb);
        mi.instancingCount = 0;
        mi.setCustomAabb(aabb);
        const e = new pc.Entity(`village-item-${id}`);
        e.addComponent('render', { meshInstances: [mi], castShadows: !!info.shadow, receiveShadows: true });
        app.root.addChild(e);
        // 大きな物（覆いの車・食卓）は遠くまで描く
        const reach = info.r > 0.8 ? 1.8 : 1;
        // 置き場所の行列 × 部品の行列
        const mats = list.map((p) => ({ x: p.x, z: p.z, mat: new pc.Mat4().mul2(p.mat, part.local) }));
        groups.push({ id, list: mats, data, vb, mi, reach, tris: part.mesh.primitive[0].count / 3 });
      }
      stats.props += list.length;
    }));
    stats.drawCalls += groups.length;
  }

  async function loadVehicles(v) {
    if (!vehicles.length) return;
    const models = await readGlb(`${ROOT}/vehicles.glb?v=${v}`);
    const byGroup = new Map();
    for (const it of vehicles) {
      if (!byGroup.has(it.group)) byGroup.set(it.group, []);
      byGroup.get(it.group).push(it);
    }
    const mats = {};
    for (const gloss of [true, false]) {
      const m = new pc.StandardMaterial();
      m.diffuseVertexColor = true;
      m.vertexColorGamma = true;
      m.useMetalness = true;
      m.metalness = 0;
      m.gloss = gloss ? 0.72 : 0.28;
      m.update();
      mats[gloss] = m;
    }
    const P = new pc.Vec3(), N = new pc.Vec3();
    for (const [group, list] of byGroup) {
      const geo = { true: { positions: [], normals: [], colors: [], indices: [] }, false: { positions: [], normals: [], colors: [], indices: [] } };
      for (const it of list) {
        for (const prim of models[it.id] || []) {
          const mm = VEHICLE_MATS[prim.mat] || VEHICLE_MATS.plastic;
          const g = geo[mm.gloss];
          const c = mm.c || it.color || [0.6, 0.6, 0.6];
          const b = g.positions.length / 3;
          for (let i = 0; i < prim.pos.length; i += 3) {
            P.set(prim.pos[i], prim.pos[i + 1], prim.pos[i + 2]);
            it.mat.transformPoint(P, P);
            N.set(prim.nor[i], prim.nor[i + 1], prim.nor[i + 2]);
            it.rot.transformVector(N, N);
            g.positions.push(P.x, P.y, P.z);
            g.normals.push(N.x, N.y, N.z);
            g.colors.push(c[0], c[1], c[2], 1);
          }
          for (let i = 0; i < prim.idx.length; i++) g.indices.push(b + prim.idx[i]);
        }
      }
      for (const gloss of [true, false]) {
        const g = geo[gloss];
        if (!g.indices.length) continue;
        const mesh = createMesh(app.graphicsDevice, g);
        const e = new pc.Entity(`village-vehicles-${group}-${gloss ? 'gloss' : 'matte'}`);
        e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mats[gloss])], castShadows: true, receiveShadows: true });
        app.root.addChild(e);
        // 遠くの村の車は描かない（霧で見えない所。真ん中と広がりを覚えておく）
        const ab = mesh.aabb;
        const tris = g.indices.length / 3;
        far.push({ e, x: ab.center.x, z: ab.center.z, r: Math.hypot(ab.halfExtents.x, ab.halfExtents.z), tris });
        stats.vehicleTris += tris;   // 場面の三角形の数（sceneBudget）には、描いている物だけを update で足す
        stats.drawCalls++;
      }
    }
    stats.vehicles = vehicles.length;
  }

  return api;
}
