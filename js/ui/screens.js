// 画面隅の性能表示（FPS・描画命令の数・三角形の数）。題の画面と大廳は ui/lobby.js
import { sceneBudget } from '../core/mesh-utils.js';

export function createStats(app, enabled, qualityName) {
  const el = document.getElementById('stats');
  if (!enabled) return { update() {} };

  let frames = 0, time = 0;
  return {
    update(dt) {
      frames++;
      time += dt;
      if (time < 0.5) return;
      const fps = Math.round(frames / time);
      const s = app.stats;
      const dpr = app.graphicsDevice.maxPixelRatio.toFixed(2);
      el.textContent = `${fps} fps\ndraw ${s.drawCalls.total}  tri ${(sceneBudget.triangles / 1000).toFixed(0)}k\n${qualityName} ×${dpr}`;
      frames = 0;
      time = 0;
    },
  };
}
