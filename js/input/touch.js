// iPad のタッチ操作（Pointer Events）
//   左下：移動スティック（いつも同じ場所に出ている）。画面の左半分の下の方に触れると、スティックを動かす
//   右側（迴避ボタンの上）：向きを変えるスティック。その輪の中に触れると動かす。倒した向きへ体が回る（player/controller.js）
//   それ以外（右側など）：なぞった分だけ見回す（首だけ。右下のボタンの上は除く）
// 複数の指を同時に扱う（左で歩きながら右で見回せる）

export function createTouchInput(layer, stickEl, config, turnEl = null) {
  const cfg = config.input;
  const knob = stickEl.querySelector('.stick-knob');
  const tKnob = turnEl?.querySelector('.stick-knob');
  const state = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, turnX: 0, turnY: 0 };
  let turnId = null, turnOx = 0, turnOy = 0, turnR = 50;

  let stickId = null, stickOx = 0, stickOy = 0, stickR = 60;
  const lookers = new Map(); // pointerId → 直前の位置

  // スティックの大きさと場所：画面の短い辺に合わせ、左下に置く
  const sizeStick = () => {
    stickR = Math.max(44, Math.min(window.innerWidth, window.innerHeight) * cfg.stickRadiusRatio);
    document.documentElement.style.setProperty('--stick-size', `${stickR * 2}px`);
    const safeL = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-l')) || 0;
    const safeB = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b')) || 0;
    stickOx = safeL + 36 + stickR;
    stickOy = window.innerHeight - safeB - 36 - stickR;
    stickEl.style.left = `${stickOx}px`;
    stickEl.style.top = `${stickOy}px`;
    // 向きを変えるスティック：右側、迴避ボタン（下から 256 px まで）の上
    if (turnEl) {
      turnR = stickR * 0.85;
      const safeR = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-r')) || 0;
      turnOx = window.innerWidth - safeR - 40 - turnR;
      turnOy = window.innerHeight - safeB - 290 - turnR;
      turnEl.style.setProperty('--stick-size', `${turnR * 2}px`);
      turnEl.style.left = `${turnOx}px`;
      turnEl.style.top = `${turnOy}px`;
    }
  };
  sizeStick();
  window.addEventListener('resize', sizeStick);
  stickEl.hidden = false;
  if (turnEl) turnEl.hidden = false;

  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function onDown(e) {
    if (e.pointerType === 'mouse') return; // マウスは desktop.js が扱う
    e.preventDefault();
    layer.setPointerCapture?.(e.pointerId);
    // 左半分の下の方（上の 3 割はミニマップなどがあるので除く）に触れたらスティック
    const stickZone = e.clientX < window.innerWidth * 0.5 && e.clientY > window.innerHeight * 0.3;
    // 向きを変えるスティックの輪（少し広め）に触れたら、そのスティック
    const turnZone = turnEl && Math.hypot(e.clientX - turnOx, e.clientY - turnOy) < turnR * 1.35;
    if (turnZone && turnId === null) {
      turnId = e.pointerId;
      turnEl.classList.add('active');
      updateTurn(e.clientX, e.clientY);
    } else if (stickZone && stickId === null) {
      stickId = e.pointerId;
      stickEl.classList.add('active');
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

  function updateTurn(px, py) {
    let dx = px - turnOx, dy = py - turnOy;
    const len = Math.hypot(dx, dy);
    if (len > turnR) { dx *= turnR / len; dy *= turnR / len; }
    tKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    state.turnX = dx / turnR; state.turnY = -dy / turnR;   // 上へ倒すと今の正面（回らない）
  }

  function onMove(e) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    if (e.pointerId === turnId) {
      updateTurn(e.clientX, e.clientY);
    } else if (e.pointerId === stickId) {
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
      stickEl.classList.remove('active');
    }
    if (e.pointerId === turnId) {
      turnId = null;
      state.turnX = state.turnY = 0;
      tKnob.style.transform = '';
      turnEl.classList.remove('active');
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
    stickEl.classList.remove('active');
    turnId = null;
    state.turnX = state.turnY = 0;
    if (tKnob) tKnob.style.transform = '';
    turnEl?.classList.remove('active');
  }

  return { state, reset };
}
