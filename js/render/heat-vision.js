// 鷹目（弓兵の專用技能。docs/DESIGN.md「技能」）の見え方：目に映る物を白黒にし（css の body.hawk）、
// 80 m 以内の敵を体温の色で壁越しに描く。体温の形は、模型の骨（頭・胸・腰・腕・脚）の位置を画面へ写し、
// 太さの違う線を重ねて描く 2D の絵（3D の描画命令・三角形は増えない）。
// 隠れ場所の中の人（模型が映っていない）と骨の無い仮の人形は、体の位置から作った形で描く
import * as pc from 'playcanvas';
import { SKILL_FX } from '../game/data.js';

// 体の線：骨 → 骨、太さ（m）
const LIMBS = [
  ['Head', 'Spine02', 0.2], ['Spine02', 'Pelvis', 0.34],
  ['Spine02', 'L_Upperarm', 0.18], ['L_Upperarm', 'L_Forearm', 0.12], ['L_Forearm', 'L_Hand', 0.09],
  ['Spine02', 'R_Upperarm', 0.18], ['R_Upperarm', 'R_Forearm', 0.12], ['R_Forearm', 'R_Hand', 0.09],
  ['Pelvis', 'L_Thigh', 0.2], ['L_Thigh', 'L_Calf', 0.15], ['L_Calf', 'L_Foot', 0.11],
  ['Pelvis', 'R_Thigh', 0.2], ['R_Thigh', 'R_Calf', 0.15], ['R_Calf', 'R_Foot', 0.11],
];
const HEAD_R = 0.14;
// 体温の色：外側から（赤 → 橙 → 黄 → 白い芯）。幅の倍率と色
const LAYERS = [[2.0, 'rgba(150, 20, 40, 0.55)'], [1.45, 'rgba(235, 70, 20, 0.85)'], [0.95, 'rgba(255, 175, 40, 0.95)'], [0.4, 'rgba(255, 245, 210, 1)']];
// 骨の無い人の形（体の向きの座標。右 x・上 y・前 z）。h は身の丈の割合
const GENERIC = {
  Head: [0, 1.52, 0], Spine02: [0, 1.32, 0], Pelvis: [0, 0.95, 0],
  L_Upperarm: [-0.2, 1.38, 0], L_Forearm: [-0.26, 1.1, 0.02], L_Hand: [-0.28, 0.85, 0.06],
  R_Upperarm: [0.2, 1.38, 0], R_Forearm: [0.26, 1.1, 0.02], R_Hand: [0.28, 0.85, 0.06],
  L_Thigh: [-0.11, 0.92, 0], L_Calf: [-0.12, 0.5, 0.02], L_Foot: [-0.12, 0.08, 0.05],
  R_Thigh: [0.11, 0.92, 0], R_Calf: [0.12, 0.5, 0.02], R_Foot: [0.12, 0.08, 0.05],
};

export function createHeatVision(cameraEntity) {
  const canvas = document.createElement('canvas');
  canvas.className = 'heat';
  canvas.hidden = true;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const v = new pc.Vec3(), out = new pc.Vec3();
  const generic = {};
  let shown = false, time = 0;

  /** 世界の位置 → 重ねた絵の位置（ピクセル）と奥行き。カメラの後ろなら null */
  function project(p, dpr) {
    v.set(p.x, p.y, p.z);
    cameraEntity.camera.worldToScreen(v, out);
    return out.z > 0.1 ? { x: out.x * dpr, y: out.y * dpr, z: out.z } : null;
  }

  /** 骨の無い人：体の位置・向きから形を作る（隠れている人は、うずくまった低い形） */
  function genericJoints(f) {
    const a = (f.yaw * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const h = f.hidden ? 0.6 : 1, y0 = f.y ?? 0;
    for (const [name, [x, y, z]] of Object.entries(GENERIC)) {
      // 右（cos a, -sin a）・前（-sin a, -cos a）
      generic[name] = { x: f.x + x * c - z * s, y: y0 + y * h, z: f.z - x * s - z * c };
    }
    return generic;
  }

  function clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

  return {
    /**
     * 毎フレーム。on：鷹目の効き目があるか。me：自分、views：人 → 見た目（render/character-view.js）
     */
    update(dt, on, fighters, me, views) {
      if (on !== shown) {
        shown = on;
        canvas.hidden = !on;
        document.body.classList.toggle('hawk', on);
        if (!on) clear();
      }
      if (!on) return;
      time += dt;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      clear();
      // 1 m が奥行き 1 m で何ピクセルになるか（縦の視野角から）
      const fov = (cameraEntity.camera.fov * Math.PI) / 180;
      const pxPerM = h / (2 * Math.tan(fov / 2));
      const range = SKILL_FX.hawk.range;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const f of fighters) {
        if (f === me || !f.alive) continue;
        const d = Math.hypot(f.x - me.x, f.z - me.z);
        if (d > range) continue;
        const joints = views.get(f)?.heatJoints?.() || genericJoints(f);
        const P = {};
        for (const k in joints) P[k] = project(joints[k], dpr);
        const hj = joints.Head;   // 頭の骨は首の付け根にあるので、頭の丸は少し上に描く
        P.HeadTop = hj ? project({ x: hj.x, y: hj.y + 0.1, z: hj.z }, dpr) : null;
        // 遠いほど少し薄く、ゆっくり揺らめく
        ctx.globalAlpha = (0.65 + 0.35 * (1 - d / range)) * (0.92 + 0.08 * Math.sin(time * 5 + f.id));
        for (const [wMul, color] of LAYERS) {
          ctx.strokeStyle = color;
          for (const [a, b, wid] of LIMBS) {
            const p = P[a], q = P[b];
            if (!p || !q) continue;
            ctx.lineWidth = Math.max(1.5, (wid * wMul * pxPerM) / ((p.z + q.z) / 2));
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
          const hd = P.HeadTop;
          if (hd) {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(hd.x, hd.y, Math.max(1.5, (HEAD_R * wMul * pxPerM) / hd.z), 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
    },
    destroy() { document.body.classList.remove('hawk'); canvas.remove(); },
  };
}
