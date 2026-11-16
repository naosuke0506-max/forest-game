// 角燈（ランタン）：腰に下げる小さな明かり。利用者の指示（2026-11-15）：
//   「ランタンをつけるボタンを追加し、押すと腰にランタンをぶら下げることができ、光を灯します（明るすぎず、むしろ弱いくらい）
//    いつでも外したり、つけたりできます」
//   ・ボタン（點燈／消燈。PC は N）で、左の腰に角燈を下げて灯す・外す。試合の間いつでも
//   ・光は弱い（届くのは RANGE m。足もとと、すぐそばの壁が見えるくらい）。影は落とさない（iPad で重くしない）
//   ・洞窟の奥は岩の色そのものを暗くしてある（world/cave.js の shadeOf：口から 36 m で一番暗い）ので、同じ強さでは照らしても
//     ほとんど見えない。奥ほど光を強める（最大 CAVE_BOOST 倍。それでも外より暗く見える）。口の近くは外と同じ強さ
//   ・相手（bot）も、洞窟の中では灯す。遠く（FAR m より先）の人の光は計算しない
// 形は鉄の枠と、光る芯の 2 つ（全員で同じ形を使い回す。描画命令は灯している人 1 人につき 2）
import * as pc from 'playcanvas';
import { createMesh } from '../core/mesh-utils.js';

const RANGE = 7.5;            // 光の届く遠さ（m）
const POWER = 0.62;           // 光の強さ。弱め（利用者の指示：明るすぎず、むしろ弱いくらい）
const CAVE_BOOST = 3;         // 洞窟の奥で強める上限（倍）。奥の岩は色そのものが暗いので、同じ強さでは照らしても見えない
const FAR = 60;               // これより遠い人の光は消す（m）
const COLOR = [1.0, 0.64, 0.32];
// 腰の骨（Pelvis）からの位置（体の向きで。右・上・後ろへ m）：左の腰の少し後ろに下げる
const HIP = { right: -0.21, up: -0.13, back: 0.05 };

/** 軸に沿った箱を足す（色付き） */
function addBox(g, cx, cy, cz, w, h, d, c) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const faces = [
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
  ];
  for (const [p0, p1, p2, p3, n] of faces) {
    const b = g.positions.length / 3;
    for (const p of [p0, p1, p2, p3]) { g.positions.push(...p); g.normals.push(...n); g.colors.push(c[0], c[1], c[2], 1); }
    g.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
}

function buildMeshes(device) {
  const geo = () => ({ positions: [], normals: [], colors: [], indices: [] });
  // 枠：原点は吊り輪の上（ここを腰に留める）。下へ伸びる
  const F = geo(), iron = [0.1, 0.09, 0.08], brass = [0.34, 0.25, 0.12];
  addBox(F, 0, -0.015, 0, 0.012, 0.03, 0.012, iron);          // 吊り金具
  addBox(F, 0, -0.04, 0, 0.07, 0.014, 0.07, brass);           // 上の蓋
  addBox(F, 0, -0.052, 0, 0.092, 0.012, 0.092, iron);         // 蓋の縁
  for (const sx of [1, -1]) for (const sz of [1, -1]) addBox(F, sx * 0.04, -0.115, sz * 0.04, 0.009, 0.115, 0.009, iron);   // 4 本の柱
  addBox(F, 0, -0.178, 0, 0.096, 0.014, 0.096, iron);         // 底
  // 光る芯：ガラスの中の火
  const G = geo();
  addBox(G, 0, -0.115, 0, 0.066, 0.1, 0.066, [1, 1, 1]);
  return { frame: createMesh(device, F), glow: createMesh(device, G), triangles: (F.indices.length + G.indices.length) / 3 };
}

/**
 * @param {pc.AppBase} app
 * @param {object[]} fighters
 * @param {Map<object, object>} views 戦う人 → 見た目（render/character-view.js。root を持つ）
 * @param {{ cave?: object }} o cave：world/cave-plan.js（洞窟の中かどうか）
 */
export function createLanterns(app, fighters, views, { cave = null } = {}) {
  let meshes = null, frameMat = null, glowMat = null;
  const items = new Map();   // 戦う人 → { on, body, light, pelvis, t, k, px, pz, swing }
  const v = new pc.Vec3();

  function make(f) {
    if (!meshes) {
      meshes = buildMeshes(app.graphicsDevice);
      frameMat = new pc.StandardMaterial();
      frameMat.diffuse = new pc.Color(1, 1, 1);
      frameMat.diffuseVertexColor = true;
      frameMat.useMetalness = true; frameMat.metalness = 0.5; frameMat.gloss = 0.45;
      frameMat.update();
      glowMat = new pc.StandardMaterial();
      glowMat.useLighting = false;
      glowMat.diffuse = new pc.Color(0, 0, 0);
      glowMat.emissive = new pc.Color(COLOR[0], COLOR[1] * 0.92, COLOR[2] * 0.7);
      glowMat.emissiveIntensity = 2.4;
      glowMat.useFog = false;
      glowMat.update();
    }
    const body = new pc.Entity('lantern');
    body.addComponent('render', { meshInstances: [new pc.MeshInstance(meshes.frame, frameMat), new pc.MeshInstance(meshes.glow, glowMat)], castShadows: false, receiveShadows: false });
    const light = new pc.Entity('lantern-light');
    light.addComponent('light', { type: 'omni', color: new pc.Color(...COLOR), intensity: 0, range: RANGE, castShadows: false });
    body.enabled = false; light.enabled = false;
    app.root.addChild(body); app.root.addChild(light);
    const root = views.get(f)?.root || null;
    const it = { on: false, body, light, root, pelvis: root?.findByName?.('Pelvis') || null, t: Math.random() * 10, k: 0, px: f.x, pz: f.z, swing: 0 };
    items.set(f, it);
    return it;
  }

  return {
    get triangles() { return meshes ? meshes.triangles : 0; },
    isOn: (f) => !!items.get(f)?.on,
    /** 灯す・外す */
    set(f, on) { const it = items.get(f) || (on ? make(f) : null); if (it) it.on = !!on; },
    toggle(f) { this.set(f, !this.isOn(f)); return this.isOn(f); },
    /** 今灯っている光の数（確かめ用） */
    get lit() { let n = 0; for (const it of items.values()) if (it.light.enabled) n++; return n; },
    /**
     * 毎フレーム：腰に付け、光を置く
     * @param {pc.Vec3} cam カメラの位置（遠い人の光は消す）
     */
    update(dt, cam) {
      for (const [f, it] of items) {
        // 灯す・外すは少しかけて（k：0〜1）。倒れた・隠れている間は消える
        const want = it.on && f.alive && !f.hidden ? 1 : 0;
        it.k += Math.max(-dt * 4, Math.min(dt * 4, want - it.k));
        if (it.k <= 0.001) { it.body.enabled = false; it.light.enabled = false; continue; }
        const root = it.root, shown = !!root?.enabled;
        // 腰の位置（体が出ていないとき＝一人称で体の模型が無いときなどは、足もとから決める）
        const a = (f.yaw * Math.PI) / 180, rx = Math.cos(a), rz = -Math.sin(a), bx = Math.sin(a), bz = Math.cos(a);   // 右・後ろ
        let x, y, z;
        if (shown && it.pelvis) { const p = it.pelvis.getPosition(); x = p.x; y = p.y; z = p.z; }
        else { x = f.x; y = (f.y ?? 0) + 0.95; z = f.z; }
        x += rx * HIP.right + bx * HIP.back; y += HIP.up + 0.05; z += rz * HIP.right + bz * HIP.back;
        // 歩くと少し揺れる
        const sp = Math.min(1, Math.hypot(f.x - it.px, f.z - it.pz) / Math.max(dt, 1e-3) / 4);
        it.px = f.x; it.pz = f.z;
        it.swing += (sp - it.swing) * Math.min(1, dt * 5);
        it.t += dt;
        it.body.enabled = shown;
        if (shown) {
          it.body.setPosition(x, y, z);
          it.body.setEulerAngles(Math.sin(it.t * 7.3) * 9 * it.swing, f.yaw, Math.sin(it.t * 5.1 + 1) * 7 * it.swing);
        }
        // 光：角燈の少し外・少し上（体のすぐそばに置くと、自分の脚だけが明るくなる）。火のゆらぎ
        const d = cam ? Math.hypot(x - cam.x, z - cam.z) : 0;
        it.light.enabled = d < FAR;
        if (it.light.enabled) {
          // 洞窟の奥：岩の暗さ（world/cave.js の shadeOf と同じ式）の分を、途中まで補う
          let boost = 1;
          if (cave && cave.inside(f.x, f.z, f.y ?? 0) > 0.5) {
            const q = cave.at(f.x, f.z), dist = q ? q.dist : 0;
            const k = Math.max(0, Math.min(1, (dist - 5) / 31)), sh = 0.85 - 0.5 * k * k * (3 - 2 * k);
            boost = Math.min(CAVE_BOOST, Math.pow(0.7 / Math.pow(sh, 2.2), 0.8));
          }
          const flick = 1 + Math.sin(it.t * 11.7) * 0.035 + Math.sin(it.t * 23.1 + 2) * 0.025;
          it.light.light.intensity = POWER * boost * it.k * flick;
          v.set(x + rx * -0.16, y + 0.18, z + rz * -0.16);
          it.light.setPosition(v);
        }
      }
    },
    destroy() { for (const it of items.values()) { it.body.destroy(); it.light.destroy(); } items.clear(); },
  };
}
