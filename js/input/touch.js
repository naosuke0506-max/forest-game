// iPad のタッチ操作（Pointer Events）
//   画面の左半分：触れた所に移動スティックが出る（離すと消える）
//   画面の右半分：なぞった分だけ見回す
// 複数の指を同時に扱う（左で歩きながら右で見回せる）

export function createTouchInput(layer, stickEl, config) {
  const cfg = config.input;
  const knob = stickEl.querySelector('.stick-knob');
  const state = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };

  let stickId = null, stickOx = 0, stickOy = 0, stickR = 60;
  const lookers = new Map(); // pointerId → 直前の位置

  const sizeStick = () => {
    stickR = Math.max(44, Math.min(window.innerWidth, window.innerHeight) * cfg.stickRadiusRatio);
    stickEl.style.setProperty('--stick-size', `${stickR * 2}px`);
  };
  sizeStick();
  window.addEventListener('resize', sizeStick);

  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function onDown(e) {
    if (e.pointerType === 'mouse') return; // マウスは desktop.js が扱う
    e.preventDefault();
    layer.setPointerCapture?.(e.pointerId);
    const leftSide = e.clientX < window.innerWidth * 0.5;
    if (leftSide && stickId === null) {
      stickId = e.pointerId;
      // 画面の端に寄りすぎないように、スティックの中心を内側へずらす
      stickOx = Math.max(stickR + 8, e.clientX);
      stickOy = Math.min(window.innerHeight - stickR - 8, Math.max(stickR + 8, e.clientY));
      stickEl.style.left = `${stickOx}px`;
      stickEl.style.top = `${stickOy}px`;
      stickEl.hidden = false;
      updateStick(e.clientX, e.clientY);
    } else {
      lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  }

  function updateStick(px, py) {
    let dx = px - stickOx, dy = py - stickOy;
    const len = Math.hypot(dx, dy);
    if (len > stickR) { dx *= stickR / len; dy *= stickR / len; }
    setKnob(dx, dy);
    let nx = dx / stickR, ny = -dy / stickR; // 上へ倒すと前進
    const mag = Math.hypot(nx, ny);
    if (mag < cfg.stickDeadZone) { nx = 0; ny = 0; }
    else {
      // 遊びの分を差し引いて 0〜1 に伸ばす
      const k = (mag - cfg.stickDeadZone) / (1 - cfg.stickDeadZone) / mag;
      nx *= k; ny *= k;
    }
    state.moveX = nx;
    state.moveY = ny;
  }

  function onMove(e) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    if (e.pointerId === stickId) {
      updateStick(e.clientX, e.clientY);
    } else if (lookers.has(e.pointerId)) {
      const last = lookers.get(e.pointerId);
      state.lookX += (e.clientX - last.x) * cfg.touchLookSpeed;
      state.lookY += (e.clientY - last.y) * cfg.touchLookSpeed;
      last.x = e.clientX;
      last.y = e.clientY;
    }
  }

  function onUp(e) {
    if (e.pointerType === 'mouse') return;
    if (e.pointerId === stickId) {
      stickId = null;
      state.moveX = 0;
      state.moveY = 0;
      setKnob(0, 0);
      stickEl.hidden = true;
    }
    lookers.delete(e.pointerId);
  }

  layer.addEventListener('pointerdown', onDown, { passive: false });
  layer.addEventListener('pointermove', onMove, { passive: false });
  layer.addEventListener('pointerup', onUp);
  layer.addEventListener('pointercancel', onUp); // 通知や画面の切り替えで指が奪われたとき
  layer.addEventListener('lostpointercapture', onUp);

  /** アプリが裏に回ったときなど、指の状態を全部捨てる */
  function reset() {
    stickId = null;
    lookers.clear();
    state.moveX = state.moveY = 0;
    setKnob(0, 0);
    stickEl.hidden = true;
  }

  return { state, reset };
}
