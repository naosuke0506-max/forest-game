// 飛んでいる矢の見た目：計算（game/combat.js の projectiles）に合わせて、矢の模型を置く
import * as pc from 'playcanvas';
import { createArrowModel } from './weapons.js';

export function createProjectileViews(app, combat) {
  const views = new Map(); // projectile → entity
  const pool = [];
  const dir = new pc.Vec3();
  // 鷹目の貫く矢：後ろに金色の光の筋を引く（その矢が飛んでいる間だけ。描画命令 1 つ）
  let streakMat = null;
  function streakOf(e) {
    if (e._streak) return e._streak;
    if (!streakMat) {
      streakMat = new pc.StandardMaterial();
      streakMat.diffuse = new pc.Color(0, 0, 0);
      streakMat.emissive = new pc.Color(1, 0.72, 0.3);
      streakMat.useLighting = false;
      streakMat.blendType = pc.BLEND_ADDITIVE;
      streakMat.opacity = 0.75;
      streakMat.depthWrite = false;
      streakMat.update();
    }
    const st = new pc.Entity('pierce-streak');
    st.addComponent('render', { type: 'box', material: streakMat, castShadows: false, receiveShadows: false });
    st.setLocalScale(0.035, 0.035, 2.4);
    st.setLocalPosition(0, 0, 1.2);   // 矢の模型は -Z が前なので、光の筋は +Z（後ろ）へ
    e.addChild(st);
    e._streak = st;
    return st;
  }

  return {
    update() {
      const live = new Set(combat.projectiles);
      for (const [p, e] of views) {
        if (!live.has(p)) { e.enabled = false; pool.push(e); views.delete(p); }
      }
      for (const p of combat.projectiles) {
        let e = views.get(p);
        if (!e) {
          e = pool.pop() || createArrowModel();
          if (!e.parent) app.root.addChild(e);
          e.enabled = true;
          views.set(p, e);
          if (p.pierce) streakOf(e).enabled = true;
          else if (e._streak) e._streak.enabled = false;
        }
        if (e._streak?.enabled && p.stuck) e._streak.enabled = false;
        e.setPosition(p.x, p.y, p.z);
        if (!p.stuck) {
          // 飛ぶ向きへ矢を向ける（矢の模型は -Z が前）
          dir.set(p.x + p.vx, p.y + p.vy, p.z + p.vz);
          e.lookAt(dir);
        }
      }
    },
  };
}
