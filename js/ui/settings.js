// 設定：性能表示、テスト用（フェーズの長さ・フェーズを飛ばす など）。設定はこの端末に保存する（保存できない環境でも動く）
const KEY = 'forest-game.settings';
const DEFAULTS = { stats: 'on', phaseLen: 'normal', sound: 'mid', titleBgm: 'ja' };   // titleBgm：題曲の版（日本・羅甸・獨逸・伊太利）

/** この端末に保存した設定（無ければ初めの値）。設定の画面を作る前に読むとき用 */
export function loadSettings() { return load(); }
function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 保存できなくても続ける */ }
}

/**
 * @param {(settings: object) => void} onChange 設定が変わったとき（起動直後にも 1 回呼ぶ）
 * @param {(action: string) => void} onTest テスト用のボタンを押したとき（skip / kill-bot / die）
 */
export function createSettings(onChange, onTest = () => {}) {
  const panel = document.getElementById('settings');
  const settings = load();

  function render() {
    for (const seg of panel.querySelectorAll('.seg')) {
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', settings[seg.dataset.key] === b.dataset.val);
    }
  }
  panel.addEventListener('click', (e) => {
    // テスト用のボタン：押したら設定を閉じて試合に戻る
    const t = e.target.closest('[data-test]');
    if (t) { onTest(t.dataset.test); panel.hidden = true; return; }
    const b = e.target.closest('.seg button');
    if (!b) return;
    settings[b.closest('.seg').dataset.key] = b.dataset.val;
    save(settings);
    render();
    onChange(settings);
  });
  const open = () => { render(); panel.hidden = false; };
  document.getElementById('settings-btn').addEventListener('click', open);
  // 大廳の「設定」からも開く（保存する設定には入れない）
  Object.defineProperty(settings, 'open', { value: open, enumerable: false });
  document.getElementById('settings-close').addEventListener('click', () => { panel.hidden = true; });

  render();
  onChange(settings);
  return settings;
}
