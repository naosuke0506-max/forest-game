// 地図。
//   左上の小さな地図（ミニマップ）：今いるエリアだけを大きく映す（ほかのエリアは暗くする）。別のエリアに入ると切り替わる
//   ミニマップをタップ：画面の 8 割ほどの大きな地図で、マップ全体を見られる（もう一度タップで閉じる）
// 地図の絵（エリアの色・境目・道・柵・エリアの名前）は最初に 1 回だけ描き、毎回は自分の矢印だけを重ねる。
// ほかのプレイヤーは描かない（見つけるのは自分の目で）
import { ZONE_NAMES } from '../world/zones.js';

const ZONE_KEYS = ['mixed', 'deep', 'prairie', 'castle'];
// エリアの色（はっきり見分けられるように）
const COLORS = {
  mixed: [74, 118, 62],     // 森：緑
  deep: [22, 60, 46],       // 深い森：暗い青緑
  prairie: [184, 176, 96],  // 大草原：明るい黄緑
  castle: [156, 126, 94],   // 村：土色
};
const PATH = [214, 190, 146];
const RES = 360;            // 地図の絵の大きさ（画素）。1 画素 ≒ 1m

/**
 * @param {HTMLCanvasElement} canvas 左上の小さな地図
 * @param {{ areaRadius: number, zones: object }} opt
 */
export function createMinimap(canvas, { areaRadius, zones = null, buildings = [] }) {
  const view = areaRadius + 8;                      // 地図に入れる範囲の半径（m）
  const toPx = (x, z) => [(x / view * 0.5 + 0.5) * RES, (z / view * 0.5 + 0.5) * RES];

  // 1. 地図の絵：エリアの色・境目・道・柵の輪
  const full = document.createElement('canvas');
  full.width = full.height = RES;
  const fctx = full.getContext('2d');
  const zoneOf = new Uint8Array(RES * RES).fill(255);      // 画素ごとのエリア（255 = 柵の外）
  const img = fctx.createImageData(RES, RES);
  for (let py = 0; py < RES; py++) {
    for (let px = 0; px < RES; px++) {
      const x = ((px + 0.5) / RES * 2 - 1) * view, z = ((py + 0.5) / RES * 2 - 1) * view;
      const i = py * RES + px;
      const r = Math.hypot(x, z);
      if (r > view) continue;
      let col, zi = 0;
      if (zones) {
        const w = zones.weights(x, z);
        zi = ZONE_KEYS.reduce((b, k, j) => (w[k] > w[ZONE_KEYS[b]] ? j : b), 0);
        col = [0, 1, 2].map((c) => ZONE_KEYS.reduce((s, k) => s + w[k] * COLORS[k][c], 0));
        const pw = zones.path(x, z);
        if (pw > 0.35) col = PATH;
      } else col = COLORS.mixed;
      if (r > areaRadius) col = col.map((c) => c * 0.45);  // 柵の外は暗く
      else zoneOf[i] = zi;
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
  }
  // エリアの境目に線を引く
  for (let py = 1; py < RES - 1; py++) {
    for (let px = 1; px < RES - 1; px++) {
      const i = py * RES + px, z0 = zoneOf[i];
      if (z0 === 255) continue;
      if (zoneOf[i + 1] !== z0 || zoneOf[i + RES] !== z0) {
        img.data[i * 4] = 250; img.data[i * 4 + 1] = 240; img.data[i * 4 + 2] = 205;
      }
    }
  }
  fctx.putImageData(img, 0, 0);
  // 建物（村の家・井戸）と村の柵
  for (const b of buildings) {
    const [bx, by] = toPx(b.x, b.z);
    const k = RES / (2 * view);
    fctx.fillStyle = b.roof === 'thatch' ? '#c9a464' : b.roof === 'tiles' ? '#b0563a' : '#8c8478';
    fctx.strokeStyle = 'rgba(30, 24, 18, .9)';
    fctx.lineWidth = 1;
    if (b.type === 'line') {
      fctx.beginPath();
      b.pts.forEach(([x, z], i) => { const [px, py] = toPx(x, z); if (i) fctx.lineTo(px, py); else fctx.moveTo(px, py); });
      fctx.strokeStyle = 'rgba(92, 60, 32, .95)';
      fctx.lineWidth = 2;
      fctx.stroke();
    } else if (b.type === 'circle') {
      fctx.beginPath(); fctx.arc(bx, by, b.r * k, 0, Math.PI * 2); fctx.fill(); fctx.stroke();
    } else {
      fctx.save(); fctx.translate(bx, by); fctx.rotate((-b.yaw * Math.PI) / 180);
      fctx.fillRect((-b.w / 2) * k, (-b.d / 2) * k, b.w * k, b.d * k);
      fctx.strokeRect((-b.w / 2) * k, (-b.d / 2) * k, b.w * k, b.d * k);
      fctx.restore();
    }
  }
  // 柵の輪
  fctx.beginPath();
  fctx.arc(RES / 2, RES / 2, (areaRadius / view) * RES / 2, 0, Math.PI * 2);
  fctx.strokeStyle = 'rgba(70, 45, 25, .95)';
  fctx.lineWidth = 3;
  fctx.stroke();

  // エリアごとの「暗くする覆い」（そのエリアの外を暗くする）と、エリアの範囲（小さな地図で映す四角）
  const masks = {}, bounds = {};
  for (let zi = 0; zi < ZONE_KEYS.length; zi++) {
    const m = document.createElement('canvas');
    m.width = m.height = RES;
    const mctx = m.getContext('2d');
    const mi = mctx.createImageData(RES, RES);
    let x0 = RES, x1 = 0, y0 = RES, y1 = 0;
    for (let i = 0; i < RES * RES; i++) {
      const inside = zoneOf[i] === zi;
      mi.data[i * 4 + 3] = inside ? 0 : 150;
      if (inside) {
        const px = i % RES, py = (i / RES) | 0;
        if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    mctx.putImageData(mi, 0, 0);
    masks[ZONE_KEYS[zi]] = m;
    bounds[ZONE_KEYS[zi]] = { x0, x1, y0, y1 };
  }

  // エリアの名前を書く場所（そのエリアの中心あたり）
  const labels = zones ? [
    { key: 'mixed', x: 0, z: 0 },
    { key: 'deep', x: 0, z: -areaRadius * 0.68 },
    { key: 'prairie', x: areaRadius * 0.68, z: 0 },
    { key: 'castle', x: zones.castle.x, z: zones.castle.z },
  ] : [];

  // 2. 小さな地図：今いるエリアの範囲を映す
  const ctx = canvas.getContext('2d');
  let size = 0, timer = 0, zoneNow = null;
  const cam = { cx: RES / 2, cy: RES / 2, half: RES / 2 };      // 映している範囲（地図の絵の画素で）
  const target = { cx: RES / 2, cy: RES / 2, half: RES / 2 };

  function aim(zone, px, py) {
    const b = bounds[zone];
    if (!b || b.x1 < b.x0) { Object.assign(target, { cx: RES / 2, cy: RES / 2, half: RES / 2 }); return; }
    // エリアの四角に少し余白をつける。広すぎるエリア（中央の森など）は、自分の周り 100m までに絞る
    let half = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 8;
    let cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const maxHalf = (100 / view) * RES / 2;
    if (half > maxHalf) { half = maxHalf; cx = px; cy = py; }
    Object.assign(target, { cx, cy, half: Math.max(half, (35 / view) * RES / 2) });
  }

  function drawArrow(c, x, y, yaw, s, alive) {
    c.save();
    c.translate(x, y);
    c.rotate((-yaw * Math.PI) / 180);
    c.beginPath();
    c.moveTo(0, -s * 1.3); c.lineTo(s * 0.8, s); c.lineTo(0, s * 0.45); c.lineTo(-s * 0.8, s);
    c.closePath();
    c.fillStyle = alive === false ? 'rgba(160,160,160,.9)' : '#ffd75e';
    c.strokeStyle = 'rgba(0,0,0,.8)';
    c.lineWidth = Math.max(1.5, s / 6);
    c.fill(); c.stroke();
    c.restore();
  }

  function drawSmall(me) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const want = Math.round(canvas.clientWidth * dpr);
    if (want > 0 && want !== size) { size = want; canvas.width = canvas.height = size; }
    if (!size) return;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1c2418';
    ctx.fillRect(0, 0, size, size);
    const sx = cam.cx - cam.half, sy = cam.cy - cam.half, sw = cam.half * 2;
    ctx.drawImage(full, sx, sy, sw, sw, 0, 0, size, size);
    if (zoneNow && masks[zoneNow]) ctx.drawImage(masks[zoneNow], sx, sy, sw, sw, 0, 0, size, size);
    const [px, py] = toPx(me.x, me.z);
    drawArrow(ctx, ((px - sx) / sw) * size, ((py - sy) / sw) * size, me.yaw, size / 18, me.alive);
    ctx.restore();
    // 縁・北の印・エリアの名前
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(236, 231, 218, .6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `600 ${Math.round(size / 11)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(236, 231, 218, .9)';
    ctx.fillText('北', size / 2, size / 9 + 2);
    if (zoneNow) {
      ctx.font = `700 ${Math.round(size / 10)}px sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.strokeText(ZONE_NAMES[zoneNow], size / 2, size - size / 9);
      ctx.fillStyle = '#fff3cf';
      ctx.fillText(ZONE_NAMES[zoneNow], size / 2, size - size / 9);
    }
  }

  // 3. 大きな地図（ミニマップをタップで開く）
  const bigWrap = document.getElementById('mapview');
  const big = bigWrap?.querySelector('canvas');
  let open = false, lastMe = null;
  function drawBig(me) {
    if (!big) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const s = Math.round(big.clientWidth * dpr);
    if (!s) return;
    if (big.width !== s) big.width = big.height = s;
    const c = big.getContext('2d');
    c.clearRect(0, 0, s, s);
    c.save();
    c.beginPath();
    c.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
    c.clip();
    c.drawImage(full, 0, 0, s, s);
    c.restore();
    // エリアの名前
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const l of labels) {
      const [lx, ly] = toPx(l.x, l.z);
      const x = (lx / RES) * s, y = (ly / RES) * s;
      c.font = `700 ${Math.round(s / 22)}px sans-serif`;
      c.lineWidth = Math.max(3, s / 160);
      c.strokeStyle = 'rgba(0,0,0,.75)';
      c.strokeText(ZONE_NAMES[l.key], x, y);
      c.fillStyle = l.key === zoneNow ? '#ffe39a' : '#fff8e6';
      c.fillText(ZONE_NAMES[l.key], x, y);
    }
    c.font = `700 ${Math.round(s / 26)}px sans-serif`;
    c.fillStyle = 'rgba(255,255,255,.9)';
    c.fillText('北', s / 2, s / 20);
    if (me) {
      const [px, py] = toPx(me.x, me.z);
      drawArrow(c, (px / RES) * s, (py / RES) * s, me.yaw, s / 40, me.alive);
    }
  }
  const toggle = (v) => {
    open = v ?? !open;
    if (!bigWrap) return;
    bigWrap.hidden = !open;
    if (open) drawBig(lastMe);
  };
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); toggle(); });
  bigWrap?.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); toggle(false); });

  return {
    /** me：自分（x, z, yaw, alive）。yaw は度（0 で北＝ -Z を向く） */
    update(dt, me) {
      lastMe = me;
      // 今いるエリアが変わったら、映す範囲を変える
      if (zones) {
        const [px, py] = toPx(me.x, me.z);
        const zi = zoneOf[Math.min(RES - 1, Math.max(0, py | 0)) * RES + Math.min(RES - 1, Math.max(0, px | 0))];
        const z = ZONE_KEYS[zi] || zoneNow || 'mixed';
        if (z !== zoneNow) zoneNow = z;
        aim(zoneNow, px, py);
      }
      // 映す範囲はなめらかに動かす
      const k = Math.min(1, dt * 4);
      cam.cx += (target.cx - cam.cx) * k;
      cam.cy += (target.cy - cam.cy) * k;
      cam.half += (target.half - cam.half) * k;
      timer -= dt;
      if (timer > 0) return;
      timer = 0.08;
      drawSmall(me);
      if (open) drawBig(me);
    },
    get zone() { return zoneNow; },
    close() { toggle(false); },
  };
}
