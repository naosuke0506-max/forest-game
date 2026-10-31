// タイトル画面と、画面隅の性能表示（FPS・描画命令の数・三角形の数）
import { sceneBudget } from '../core/mesh-utils.js';

export function createTitleScreen() {
  const title = document.getElementById('title');
  const button = document.getElementById('start');

  return {
    /** 読み込みの進み具合 */
    progress(done, total) {
      button.textContent = `読み込み中… ${Math.round((done / total) * 100)}%`;
    },
    /** 読み込みが終わったら押せるようにする */
    ready(onStart) {
      button.disabled = false;
      button.textContent = '森に入る';
      button.addEventListener('click', () => {
        title.hidden = true;
        onStart();
      }, { once: true });
    },
    fail(message) {
      button.textContent = '起動できませんでした';
      window.__showError?.(message);
    },
  };
}

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
