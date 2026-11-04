// タイトル画面（キャラ選択）と、画面隅の性能表示（FPS・描画命令の数・三角形の数）
import { L } from './labels.js';
import { sceneBudget } from '../core/mesh-utils.js';
import { CHARACTERS } from '../game/data.js';

export function createTitleScreen() {
  const title = document.getElementById('title');
  const button = document.getElementById('start');

  // キャラ選択
  let selected = 'shield';
  const list = document.getElementById('char-select');
  const desc = document.getElementById('char-desc');
  const render = () => {
    for (const b of list.children) b.classList.toggle('sel', b.dataset.id === selected);
    desc.textContent = CHARACTERS[selected].desc;
  };
  for (const [id, c] of Object.entries(CHARACTERS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'char-btn';
    b.dataset.id = id;
    b.textContent = c.name;
    b.addEventListener('click', () => { selected = id; render(); });
    list.appendChild(b);
  }
  render();

  return {
    /** 読み込みの進み具合 */
    progress(done, total) {
      button.textContent = `${L.loading}… ${Math.round((done / total) * 100)}%`;
    },
    /** 読み込みが終わったら押せるようにする */
    ready(onStart) {
      button.disabled = false;
      button.textContent = L.start;
      button.addEventListener('click', async () => {
        // キャラの模型を読み込む間は、タイトルを出したまま待つ
        button.disabled = true;
        button.textContent = `${L.loading}…`;
        try { await onStart(selected); } finally { title.hidden = true; }
      }, { once: true });
    },
    fail(message) {
      button.textContent = L.startFail;
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
