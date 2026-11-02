// 飛んでいる矢の見た目：計算（game/combat.js の projectiles）に合わせて、矢の模型を置く
import * as pc from 'playcanvas';
import { createArrowModel } from './weapons.js';

export function createProjectileViews(app, combat) {
  const views = new Map(); // projectile → entity
  const pool = [];
  const dir = new pc.Vec3();

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
        }
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
