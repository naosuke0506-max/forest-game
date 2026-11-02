// 入力をまとめる：タッチとキーボード・マウスを、
// 「どちらへ動くか（move）」「どれだけ向きを変えるか（look）」「攻撃・防御を押しているか」の形にそろえる。
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

  // 攻撃・防御：画面右下のボタン（押している間 true）と、PC の J（攻撃）・K（防御）
  const held = { attack: false, guard: false };
  const keys = { attack: false, guard: false };
  // 押した瞬間を覚えておく：フレームの間隔より短い押下（素早いタップ）でも、必ず 1 回は攻撃として伝える
  const latched = { attack: false, guard: false };
  for (const [id, key] of [['btn-attack', 'attack'], ['btn-guard', 'guard']]) {
    const el = document.getElementById(id);
    if (!el) continue;
    const down = (e) => { e.preventDefault(); held[key] = true; latched[key] = true; el.classList.add('down'); el.setPointerCapture?.(e.pointerId); };
    const up = () => { held[key] = false; el.classList.remove('down'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }
  const keyOf = { KeyJ: 'attack', KeyK: 'guard' };
  window.addEventListener('keydown', (e) => { if (keyOf[e.code] && !e.repeat) { keys[keyOf[e.code]] = true; latched[keyOf[e.code]] = true; } });
  window.addEventListener('keyup', (e) => { if (keyOf[e.code]) keys[keyOf[e.code]] = false; });
  const resetButtons = () => { held.attack = held.guard = keys.attack = keys.guard = false; };
  document.addEventListener('visibilitychange', resetButtons);

  const frame = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, attack: false, guard: false };

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
    frame.attack = held.attack || keys.attack || latched.attack;
    frame.guard = held.guard || keys.guard || latched.guard;
    latched.attack = latched.guard = false;
    return frame;
  }

  return { read, reset: () => { sources.forEach((s) => s.reset()); resetButtons(); } };
}
