// 入力をまとめる：タッチとキーボード・マウスを、
// 「どちらへ動くか（move）」「どれだけ向きを変えるか（look）」の形にそろえる。
// ゲーム側はこの形だけを見るので、将来オンライン化するときもこの形をそのまま送ればよい
import { createTouchInput } from './touch.js';
import { createDesktopInput } from './desktop.js';

export function createInput(layer, stickEl, config) {
  const touch = createTouchInput(layer, stickEl, config);
  const desktop = createDesktopInput(layer, config);
  const sources = [touch, desktop];

  // Safari の拡大・ダブルタップ拡大・長押しメニューを止める
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  layer.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // 裏に回った・戻ったときは、押しっぱなしの状態を残さない
  document.addEventListener('visibilitychange', () => sources.forEach((s) => s.reset()));

  const frame = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };

  /** 1 フレーム分の入力を取り出す（向きの変化量はここで 0 に戻す） */
  function read() {
    let mx = 0, my = 0, lx = 0, ly = 0;
    for (const { state } of sources) {
      mx += state.moveX; my += state.moveY;
      lx += state.lookX; ly += state.lookY;
      state.lookX = 0; state.lookY = 0;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    frame.moveX = mx; frame.moveY = my; frame.lookX = lx; frame.lookY = ly;
    return frame;
  }

  return { read, reset: () => sources.forEach((s) => s.reset()) };
}
