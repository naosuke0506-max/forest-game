// PC で確認するための補助操作（iPad に外付けキーボードやトラックパッドをつないだときにも使える）
//   W A S D / 矢印：移動　Shift：走る　マウスでドラッグ：見回す

export function createDesktopInput(layer, config) {
  const cfg = config.input;
  const state = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
  const keys = new Set();
  let dragging = false, lastX = 0, lastY = 0;

  const update = () => {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const len = Math.hypot(f, r) || 1;
    const k = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0.55; // 普段は歩き、Shift で走る
    state.moveX = (r / len) * k;
    state.moveY = (f / len) * k;
  };

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    keys.add(e.code);
    update();
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); update(); });
  window.addEventListener('blur', () => { keys.clear(); update(); });

  layer.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    layer.setPointerCapture?.(e.pointerId);
  });
  layer.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !dragging) return;
    state.lookX += (e.clientX - lastX) * cfg.mouseLookSpeed;
    state.lookY += (e.clientY - lastY) * cfg.mouseLookSpeed;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const end = (e) => { if (e.pointerType === 'mouse') dragging = false; };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);

  function reset() {
    keys.clear();
    dragging = false;
    update();
  }

  return { state, reset };
}
