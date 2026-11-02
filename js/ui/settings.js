// 設定：視点（一人称 / 三人称）と性能表示。設定はこの端末に保存する（保存できない環境でも動く）
const KEY = 'forest-game.settings';
const DEFAULTS = { view: 'first', stats: 'on' };

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 保存できなくても続ける */ }
}

/**
 * @param {(settings: object) => void} onChange 設定が変わったとき（起動直後にも 1 回呼ぶ）
 */
export function createSettings(onChange) {
  const panel = document.getElementById('settings');
  const settings = load();

  function render() {
    for (const seg of panel.querySelectorAll('.seg')) {
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', settings[seg.dataset.key] === b.dataset.val);
    }
  }
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('.seg button');
    if (!b) return;
    settings[b.closest('.seg').dataset.key] = b.dataset.val;
    save(settings);
    render();
    onChange(settings);
  });
  document.getElementById('settings-btn').addEventListener('click', () => { render(); panel.hidden = false; });
  document.getElementById('settings-close').addEventListener('click', () => { panel.hidden = true; });

  render();
  onChange(settings);
  return settings;
}
