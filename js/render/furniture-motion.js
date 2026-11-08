// タンスの扉とベッドの掛け布を、隠れる・出る・探す・引きずり出す動きに合わせて開け閉めする（見た目だけ）
//   形と蝶番の位置は world/furniture.js が隠れ場所に記録する（spot.doors・spot.flap）
//   扉はすべて同じ形なので 1 つの描画命令（インスタンシング）、掛け布は毛布の色ごとに 1 つ。動いた所だけ書き換える
//   開く角度の時刻は、動きを作ったとき（tools/characters/hide_moves.py の DOORS）と同じ
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { builder, box } from '../world/build-kit.js';
import { BLANKETS } from '../world/furniture.js';

// 扉の開く角度（度）：{動き: [右の扉 [[時刻, 角度]…], 左の扉]}。右・左は、タンスに向いて立った人から見て
const DOORS = {
  hide_wd_in: [[[0.30, 0], [0.55, 70], [1.10, 70], [1.40, 0]], [[0, 0]]],
  hide_wd_out: [[[0.25, 0], [0.50, 60], [1.0, 60]], [[0, 0]]],
  search_wd: [[[0.30, 0], [0.55, 90], [1.1, 90]], [[0.30, 0], [0.55, 90], [1.1, 90]]],
  drag_wd: [[[0, 90]], [[0, 90]]],
};
// 中に入って扉を閉めるとき、もう開いていた扉（前に誰かが探して開けたまま）も、この時刻の間に中から閉める
const CLOSE_INSIDE = { hide_wd_in: [1.10, 1.40] };
// 掛け布を持ち上げる角度（度。0 で真下に垂れ、90 で横）：探すときは手で持ち上げ、潜る・出るときは体で押し上げる
const FLAPS = {
  hide_bed_in: [[0.80, 0], [1.05, 40], [1.35, 40], [1.60, 0]],
  hide_bed_out: [[0, 0], [0.12, 40], [0.45, 40], [0.75, 0]],
  search_bed: [[0.35, 0], [0.70, 60], [1.2, 60]],
  drag_bed: [[0, 60], [0.25, 65], [0.85, 65], [1.15, 0]],
};
const FLAP_DROP = 220;   // 動きが終わって手を離した掛け布が垂れ下がる速さ（度/秒）
const FLAP_LEN = 0.26;   // 掛け布の垂れる長さ
const MAX_SPEED = 500;   // 扉・掛け布が回る速さの上限（度/秒。動きが急に切り替わっても跳ばないように）

/** 時刻 t の角度（間はなめらかにつなぐ） */
function curve(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t > keys[i][0]) continue;
    const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
    const u = (t - t0) / Math.max(1e-6, t1 - t0);
    return v0 + (v1 - v0) * u * u * (3 - 2 * u);
  }
  return keys[keys.length - 1][1];
}

/** 隠れ場所に関わる動きの名前（タンス・ベッドで違う） */
function clipOf(a) {
  const k = a.spot.kind === 'bed' ? 'bed' : 'wd';
  if (a.kind === 'hideIn') return `hide_${k}_in`;
  if (a.kind === 'hideOut') return `hide_${k}_out`;
  if (a.kind === 'search') return `search_${k}`;
  if (a.kind === 'drag') return `drag_${k}`;
  return null;
}

/** 部品を並べて 1 つの描画命令で描く（動いた部品の向きだけ書き換える） */
function instanced(app, name, mesh, material, parts) {
  const device = app.graphicsDevice;
  const data = new Float32Array(parts.length * 16);
  const vb = new pc.VertexBuffer(device, pc.VertexFormat.getDefaultInstancingFormat(device), parts.length, { data, usage: pc.BUFFER_DYNAMIC });
  const mi = new pc.MeshInstance(mesh, material);
  mi.setInstancing(vb);
  mi.instancingCount = parts.length;
  // 全部の部品を囲む箱（これが無いと、原点の 1 つ分の大きさとされ、画面外として描かれなかったり影が出なかったりする）
  const min = new pc.Vec3(Infinity, Infinity, Infinity), max = new pc.Vec3(-Infinity, -Infinity, -Infinity);
  for (const p of parts) {
    min.set(Math.min(min.x, p.x - 2), Math.min(min.y, p.y - 2), Math.min(min.z, p.z - 2));
    max.set(Math.max(max.x, p.x + 2), Math.max(max.y, p.y + 2), Math.max(max.z, p.z + 2));
  }
  const aabb = new pc.BoundingBox();
  aabb.setMinMax(min, max);
  mi.setCustomAabb(aabb);
  const e = new pc.Entity(name);
  e.addComponent('render', { meshInstances: [mi], castShadows: true, receiveShadows: true });
  app.root.addChild(e);
  sceneBudget.triangles += (mesh.primitive[0].count / 3) * parts.length;
  sceneBudget.instances += parts.length;
  return { data, vb };
}

/**
 * @param {pc.Application} app
 * @param {object[]} hides 隠れ場所（world/furniture.js が doors・flap を付けたもの）
 * @param {Record<string, pc.StandardMaterial>} materials 村の質感（gate：扉、cloth：布）
 */
export function createFurnitureMotion(app, hides, materials) {
  const pos = new pc.Vec3(), q = new pc.Quat(), qb = new pc.Quat(), one = new pc.Vec3(1, 1, 1), m = new pc.Mat4();

  // ---- 扉（取っ手付き。蝶番を原点に、閉じたとき -x へ伸びる） ----
  const doors = [];
  for (const s of hides) if (s.doors) s.doors.forEach((d, i) => doors.push(Object.assign(d, { i, angle: 0, spot: s })));
  let doorSet = null;
  if (doors.length && materials.gate) {
    const B = builder();
    box(B, 'gate', -0.235, 0, 0, 0.47, 0.03, 1.72, 0, { shade: 0.8, bottom: true });
    box(B, 'gate', -0.445, 0.83, 0.025, 0.04, 0.04, 0.12, 0, { shade: 0.3, bottom: true });   // 取っ手
    doorSet = { kind: 'door', parts: doors, ...instanced(app, 'wardrobe-doors', createMesh(app.graphicsDevice, B.parts.gate), materials.gate, doors) };
  }
  // ---- 掛け布（毛布の縁を原点に、下へ垂れる。毛布の色ごと） ----
  const flapSets = [];
  if (materials.cloth) {
    BLANKETS.forEach((color, tone) => {
      const parts = [];
      for (const s of hides) if (s.flap && s.flap.tone === tone) parts.push(Object.assign(s.flap, { angle: 0, spot: s }));
      if (!parts.length) return;
      const B = builder();
      box(B, 'cloth', 0, -FLAP_LEN, 0, 0.03, 1.2, FLAP_LEN, 0, { shade: color, bottom: true });
      flapSets.push({ kind: 'flap', parts, ...instanced(app, `bed-flaps-${tone}`, createMesh(app.graphicsDevice, B.parts.cloth), materials.cloth, parts) });
    });
  }

  /** 部品の向きを、角度に合わせて書き込む（扉は縦の軸、掛け布は毛布の縁の軸で回す） */
  function write(set, k) {
    const p = set.parts[k];
    pos.set(p.x, p.y, p.z);
    if (set.kind === 'door') {
      q.setFromEulerAngles(0, p.yaw + (p.i === 0 ? p.angle : -p.angle), 0);
    } else {
      qb.setFromEulerAngles(0, 0, p.angle);
      q.setFromEulerAngles(0, p.yaw, 0).mul(qb);
    }
    m.setTRS(pos, q, one);
    set.data.set(m.data, k * 16);
  }
  const refresh = (set) => { for (let k = 0; k < set.parts.length; k++) write(set, k); set.vb.setData(set.data); };
  if (doorSet) refresh(doorSet);
  for (const fs of flapSets) refresh(fs);

  // 扉ごとの、今の動きでの開き方（動きの始めの角度から、なめらかに続ける）
  const follow = new Map();   // 扉 → { act, start, reached }
  const active = new Set();
  /** 角度を目標へ（回る速さの上限まで）。変わったら true */
  const turn = (p, goal, dt) => {
    const v = p.angle + Math.max(-MAX_SPEED * dt, Math.min(MAX_SPEED * dt, goal - p.angle));
    if (Math.abs(v - p.angle) < 0.01) return false;
    p.angle = v;
    return true;
  };

  return {
    /** 毎フレーム：隠れる・出る・探す・引きずり出す動きをしている人の家具だけ動かす。時間が止まっている間は動かさない */
    update(dt, fighters, paused = false) {
      if (paused) return;
      active.clear();
      let doorsMoved = false;
      const flapMoved = new Set();
      for (const f of fighters) {
        const a = f.action;
        if (!a?.spot) continue;
        const clip = clipOf(a);
        if (!clip) continue;
        const s = a.spot;
        active.add(s);
        if (s.doors && DOORS[clip]) {
          s.doors.forEach((d, i) => {
            let st = follow.get(d);
            if (!st || st.act !== a) { st = { act: a, start: d.angle, reached: d.angle <= 0.5 }; follow.set(d, st); }
            const keys = DOORS[clip][i], v = curve(keys, a.t);
            let ang;
            if (st.reached || v >= st.start - 0.5) { st.reached = true; ang = v; }
            else if (CLOSE_INSIDE[clip] && keys[keys.length - 1][1] < st.start) {
              // 開いたままだった扉：この動きでは触らないが、中に入って閉めるときに一緒に閉める
              const [c0, c1] = CLOSE_INSIDE[clip];
              ang = curve([[c0, st.start], [c1, 0]], a.t);
            } else ang = st.start;   // 開いたままの扉は、動きがそれより大きく開くまでそのまま
            if (turn(d, ang, dt)) doorsMoved = true;
          });
        }
        if (s.flap && FLAPS[clip]) {
          if (turn(s.flap, curve(FLAPS[clip], a.t), dt)) flapMoved.add(s.flap.tone);
        }
      }
      // 手を離した掛け布は垂れ下がる
      for (const fs of flapSets) {
        for (const p of fs.parts) {
          if (p.angle <= 0 || active.has(p.spot)) continue;
          p.angle = Math.max(0, p.angle - FLAP_DROP * dt);
          flapMoved.add(p.tone);
        }
      }
      if (doorsMoved && doorSet) refresh(doorSet);
      for (const fs of flapSets) if (flapMoved.has(fs.parts[0].tone)) refresh(fs);
    },
    /** 試合の始め：扉を閉め、掛け布を垂らす（前の試合で開けたままの扉も） */
    reset() {
      follow.clear();
      for (const d of doors) d.angle = 0;
      if (doorSet) refresh(doorSet);
      for (const fs of flapSets) { for (const p of fs.parts) p.angle = 0; refresh(fs); }
    },
    /** 試験用：扉・掛け布の数 */
    get counts() { return { doors: doors.length, flaps: flapSets.reduce((n, fs) => n + fs.parts.length, 0) }; },
  };
}
