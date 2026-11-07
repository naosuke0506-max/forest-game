// タイトル画面（キャラと武器を選ぶ）と、画面隅の性能表示（FPS・描画命令の数・三角形の数）
import { L } from './labels.js';
import { sceneBudget } from '../core/mesh-utils.js';
import { CHARACTERS, LOADOUTS, WEAPONS, SHIELDS, PLANNED } from '../game/data.js';
import { resolveLoadout } from '../game/match.js';

// 武器を選ぶ枠：右手（主の武器）・左手（楯）・持替（弓兵の近接武器）
const SLOTS = [['main', L.main], ['shield', L.shield], ['side', L.side]];
const nameOf = (slot, id) => (slot === 'shield' ? SHIELDS[id]?.name : WEAPONS[id]?.name ?? PLANNED[id]) || id;
const plannedOf = (slot, id) => (slot === 'shield' ? !SHIELDS[id] || SHIELDS[id].planned : !WEAPONS[id]);

export function createTitleScreen() {
  const title = document.getElementById('title');
  const button = document.getElementById('start');

  // キャラ選択と、そのキャラの武器選び（試合の途中では替えられない。模型と動きがまだ無い物は「未完」で選べない）
  let selected = 'shield';
  const picks = Object.fromEntries(Object.keys(CHARACTERS).map((id) => [id, resolveLoadout(id)]));
  const list = document.getElementById('char-select');
  const desc = document.getElementById('char-desc');
  const loadoutEl = document.getElementById('loadout');
  const renderLoadout = () => {
    const lo = LOADOUTS[selected], pick = picks[selected];
    loadoutEl.innerHTML = SLOTS.filter(([slot]) => lo[slot]?.length).map(([slot, label]) => `<div class="lo-row" role="group" aria-label="${label}">
      <span class="lo-label">${label}</span>
      <div class="lo-opts">${lo[slot].map((id) => {
        const off = plannedOf(slot, id);
        return `<button type="button" class="lo-btn${pick[slot] === id ? ' sel' : ''}" data-slot="${slot}" data-id="${id}" aria-pressed="${pick[slot] === id}"${off ? ' disabled' : ''}>${nameOf(slot, id)}${off ? `<small>${L.planned}</small>` : ''}</button>`;
      }).join('')}</div>
    </div>`).join('');
  };
  loadoutEl.addEventListener('click', (e) => {
    const b = e.target.closest('.lo-btn');
    if (!b || b.disabled) return;
    picks[selected][b.dataset.slot] = b.dataset.id;
    renderLoadout();
  });
  const render = () => {
    for (const b of list.children) b.classList.toggle('sel', b.dataset.id === selected);
    desc.textContent = CHARACTERS[selected].desc;
    renderLoadout();
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
        try { await onStart(selected, { ...picks[selected] }); } finally { title.hidden = true; }
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
