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

  // 右手（攻撃）・左手（防御・強攻撃・持ち替え）・回避・拾う：画面右側のボタン（押している間 true）と、
  // PC の J（右手）・K（左手）・L かスペース（回避）・E（拾う・開ける）
  const held = { attack: false, left: false, dodge: false, use: false, search: false, assassinate: false, shield: false };
  const keys = { attack: false, left: false, dodge: false, use: false, search: false, assassinate: false, shield: false };
  // 押した瞬間を覚えておく：フレームの間隔より短い押下（素早いタップ）でも、必ず 1 回は攻撃として伝える
  const latched = { attack: false, left: false, dodge: false, use: false, search: false, assassinate: false, shield: false };
  for (const [id, key] of [['btn-attack', 'attack'], ['btn-left', 'left'], ['btn-dodge', 'dodge'], ['btn-use', 'use'], ['btn-search', 'search'], ['btn-assassinate', 'assassinate'], ['btn-shield', 'shield']]) {
    const el = document.getElementById(id);
    if (!el) continue;
    const down = (e) => { e.preventDefault(); held[key] = true; latched[key] = true; el.classList.add('down'); try { el.setPointerCapture?.(e.pointerId); } catch { /* 指がもう離れていたら何もしない */ } };
    const up = () => { held[key] = false; el.classList.remove('down'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }
  // しゃがむボタン（と PC の X）：押して離す＝しゃがむ／立つ、長押し＝伏せる。押した・長押しした瞬間を 1 回だけ伝える
  const HOLD = 0.45;   // 長押しと見なす時間（秒。game/data.js の STANCE_TIME.hold と同じ）
  const stance = { held: false, fired: false, tap: false, hold: false, downAt: 0 };
  // 長押しは時計で決める（押したまま 0.45 秒で伏せる。離さなくてよい）。毎フレームの読み取りでも時間を見る
  // （画面がとても忙しいと時計が遅れるため）。どちらより先に離したら「押した」
  let holdTimer = 0;
  const stanceDown = () => {
    if (stance.held) return;
    stance.held = true; stance.fired = false; stance.downAt = performance.now();
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { if (stance.held && !stance.fired) { stance.fired = true; stance.hold = true; } }, HOLD * 1000);
  };
  const stanceUp = () => {
    if (!stance.held) return;
    stance.held = false; clearTimeout(holdTimer);
    if (!stance.fired) stance.tap = true;
  };
  {
    const el = document.getElementById('btn-stance');
    if (el) {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('down'); try { el.setPointerCapture?.(e.pointerId); } catch { /* 指がもう離れていたら何もしない */ } stanceDown(); });
      const up = () => { el.classList.remove('down'); stanceUp(); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    }
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyX' && !e.repeat) stanceDown(); });
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyX') stanceUp(); });
  }
  const keyOf = { KeyJ: 'attack', KeyK: 'left', KeyL: 'dodge', Space: 'dodge', KeyE: 'use', KeyF: 'search', KeyR: 'assassinate', KeyU: 'shield' };
  window.addEventListener('keydown', (e) => { if (keyOf[e.code] && !e.repeat) { keys[keyOf[e.code]] = true; latched[keyOf[e.code]] = true; } });
  window.addEventListener('keyup', (e) => { if (keyOf[e.code]) keys[keyOf[e.code]] = false; });
  const resetButtons = () => { for (const o of [held, keys]) o.attack = o.left = o.dodge = o.use = o.search = o.assassinate = o.shield = false; stance.held = false; stance.tap = stance.hold = false; };
  document.addEventListener('visibilitychange', resetButtons);

  const frame = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, turnX: 0, turnY: 0, attack: false, left: false, dodge: false, use: false, search: false, assassinate: false, shield: false, stance: null };

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
    // 向きを変える（PC の Z・C：turnX。iPad は見回して首の範囲を越えると体が回る。player/controller.js）
    let tx = 0, ty = 0;
    for (const { state } of sources) { tx += state.turnX || 0; ty += state.turnY || 0; }
    const tl = Math.hypot(tx, ty);
    frame.turnX = tl > 1 ? tx / tl : tx; frame.turnY = tl > 1 ? ty / tl : ty;
    frame.attack = held.attack || keys.attack || latched.attack;
    frame.left = held.left || keys.left || latched.left;
    frame.dodge = held.dodge || keys.dodge || latched.dodge;
    frame.use = held.use || keys.use || latched.use;
    frame.search = held.search || keys.search || latched.search;
    frame.assassinate = held.assassinate || keys.assassinate || latched.assassinate;
    frame.shield = held.shield || keys.shield || latched.shield;   // 楯攻撃ボタン（楯を持つキャラだけ。PC は U）
    latched.attack = latched.left = latched.dodge = latched.use = latched.search = latched.assassinate = latched.shield = false;
    // しゃがむボタン：'tap'（押して離した）・'hold'（長押しになった）・null
    if (stance.held && !stance.fired && performance.now() - stance.downAt >= HOLD * 1000) { stance.fired = true; stance.hold = true; }
    frame.stance = stance.hold ? 'hold' : stance.tap ? 'tap' : null;
    stance.tap = stance.hold = false;
    return frame;
  }

  return { read, reset: () => { sources.forEach((s) => s.reset()); resetButtons(); } };
}
