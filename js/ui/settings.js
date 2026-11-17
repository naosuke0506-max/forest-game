// 設定：性能表示、テスト用（フェーズの長さ・フェーズを飛ばす など）。設定はこの端末に保存する（保存できない環境でも動く）
import { returnToHall } from '../core/resume.js';

const KEY = 'forest-game.settings';
const DEFAULTS = { stats: 'on', phaseLen: 'normal', sound: 'mid', titleBgm: 'ja', view: 'first' };   // view：視點（一人稱・三人稱）   // titleBgm：題曲の版（日本・羅甸・獨逸・伊太利・西班牙・英吉利）

/** この端末に保存した設定（無ければ初めの値）。設定の画面を作る前に読むとき用 */
export function loadSettings() { return load(); }
// 試驗用の「刻之長」は端末に残さない（2026-11-17：前に試した 60 秒が残ったままで、刻が 1 分になっていた）。
//   今のタブの間だけ覚える（sessionStorage。大廳へ戻る読み込み直しでは残り、アプリを開き直すと通常に戻る）
const SESSION_KEYS = ['phaseLen'];
function load() {
  let s;
  try { s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { s = { ...DEFAULTS }; }
  for (const k of SESSION_KEYS) {
    let v = null;
    try { v = sessionStorage.getItem(`${KEY}.${k}`); } catch { /* 読めなければ初めの値 */ }
    s[k] = v ?? DEFAULTS[k];   // 端末に残っていた前の値は使わない
  }
  return s;
}
function save(s) {
  const kept = { ...s };
  for (const k of SESSION_KEYS) {
    delete kept[k];
    try { sessionStorage.setItem(`${KEY}.${k}`, s[k]); } catch { /* 保存できなくても続ける */ }
  }
  try { localStorage.setItem(KEY, JSON.stringify(kept)); } catch { /* 保存できなくても続ける */ }
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
  // 設定の画面の外（試合中の視點のボタン）で変えたときに保存する
  Object.defineProperty(settings, 'save', { value: () => { save(settings); render(); }, enumerable: false });
  document.getElementById('settings-close').addEventListener('click', () => { panel.hidden = true; });
  // 退出：試合・教練の間だけ出る（main.js が setInMatch(true) で出す）。押すと大廳へ戻る（core/resume.js）
  const leave = document.getElementById('settings-leave');
  leave?.addEventListener('click', () => { panel.hidden = true; returnToHall(); });
  Object.defineProperty(settings, 'setInMatch', { value: (v) => { if (leave) leave.hidden = !v; }, enumerable: false });

  render();
  onChange(settings);
  return settings;
}
