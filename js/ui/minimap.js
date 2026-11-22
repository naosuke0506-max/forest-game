// 地図。
//   左上の小さな地図（ミニマップ）：今いるエリアだけを大きく映す（ほかのエリアは暗くする）。別のエリアに入ると切り替わる。
//     自分の矢印と、見ている向き（扇形）を描く
//   ミニマップをタップ：画面の 8 割ほどの大きな地図（羊皮紙に描いた地図の見た目）で、マップ全体を見られる（もう一度タップで閉じる）
// 地図の絵は最初に 1 回だけ描く：
//   1. エリアの色に、地面の起伏の陰影（北西から光が当たる）と細かなむらを重ねる（1 画素 ≒ 1m）
//   2. 2 倍の細かさの絵に広げ、木の葉の広がり（上から見た丸）・道・村の家と柵・歩ける範囲の縁（点線）を描く。川は青、山の高い所は岩の色
// 毎回は、自分の矢印と見ている向きだけを重ねる。ほかのプレイヤーは描かない（見つけるのは自分の目で）
import { L } from './labels.js';
import { ZONE_NAMES } from '../world/zones.js';
import { fbm } from '../core/random.js';

const ZONE_KEYS = ['mixed', 'deep', 'prairie', 'castle'];
// エリアの色（上から見た自然な色で、見分けがつくように）
const COLORS = {
  mixed: [92, 124, 66],     // 森：緑
  deep: [44, 74, 50],       // 深い森：暗い青緑
  prairie: [170, 166, 98],  // 大草原：明るい黄緑
  castle: [150, 132, 98],   // 村：土色
};
const TREE = { mixed: [52, 86, 44], deep: [30, 56, 36], prairie: [70, 100, 50], castle: [60, 92, 48] };
const RES = 360;            // 起伏と色の絵の大きさ（画素）。1 画素 ≒ 1m
const DRES = 720;           // 木・道・家を描く絵の大きさ（2 倍）
const INK = '#3b2a17';

/**
 * @param {HTMLCanvasElement} canvas 左上の小さな地図
 * @param {{ areaRadius: number, zones: object, buildings: object[], heightAt: Function, trees: {x, z, r}[] }} opt
 */
export function createMinimap(canvas, { areaRadius, zones = null, buildings = [], heightAt = null, trees = [], waterAt = null, cave = zones?.cave || null }) {
  const view = areaRadius + 8;                      // 地図に入れる範囲の半径（m）
  const toPx = (x, z) => [(x / view * 0.5 + 0.5) * RES, (z / view * 0.5 + 0.5) * RES];
  const toD = (x, z) => [(x / view * 0.5 + 0.5) * DRES, (z / view * 0.5 + 0.5) * DRES];
  const kD = DRES / (2 * view);                     // 1m あたりの画素（細かい絵）

  // ===== 1. 起伏と色 =====
  const base = document.createElement('canvas');
  base.width = base.height = RES;
  const bctx = base.getContext('2d');
  const zoneOf = new Uint8Array(RES * RES).fill(255);      // 画素ごとのエリア（255 = 柵の外）
  const H = new Float32Array(RES * RES);
  const px2w = (p) => ((p + 0.5) / RES * 2 - 1) * view;
  if (heightAt) for (let py = 0; py < RES; py++) for (let px = 0; px < RES; px++) H[py * RES + px] = heightAt(px2w(px), px2w(py));
  const img = bctx.createImageData(RES, RES);
  for (let py = 0; py < RES; py++) {
    for (let px = 0; px < RES; px++) {
      const x = px2w(px), z = px2w(py);
      const i = py * RES + px;
      const r = Math.hypot(x, z);
      let col, zi = 0;
      if (zones) {
        const w = zones.weights(x, z);
        zi = ZONE_KEYS.reduce((b, k, j) => (w[k] > w[ZONE_KEYS[b]] ? j : b), 0);
        col = [0, 1, 2].map((c) => ZONE_KEYS.reduce((s, k) => s + w[k] * COLORS[k][c], 0));
      } else col = COLORS.mixed.slice();
      // 起伏の陰影：北西から光（左上が明るく、右下の斜面が暗い）
      let shade = 1;
      if (heightAt && px > 0 && py > 0 && px < RES - 1 && py < RES - 1) {
        const dx = H[i + 1] - H[i - 1], dz = H[i + RES] - H[i - RES];
        shade = Math.max(0.7, Math.min(1.25, 1 + (-dx - dz) * 0.35));
      }
      // 細かなむら（草地の濃淡）
      const n = 0.92 + 0.16 * fbm(x * 0.09, z * 0.09, 991);
      // 山の高い所は岩の色（2026-11-14：周りの山。world/landform.js）
      const rk = zones?.rocky ? zones.rocky(x, z) : 0;
      if (rk > 0) col = col.map((c, k) => c + ([142, 136, 124][k] - c) * rk);
      col = col.map((c) => c * shade * n);
      // 川：深いほど濃い青（陰影は付けない）
      const wa = waterAt ? waterAt(x, z) : null;
      if (wa) { const k = Math.min(1, wa.depth / 2); col = [78 - 30 * k, 122 - 30 * k, 148 - 20 * k]; }
      if (r > areaRadius) col = col.map((c) => c * 0.55);  // 歩ける範囲の外（周りの山）は暗く
      else zoneOf[i] = zi;
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
  }
  bctx.putImageData(img, 0, 0);

  // ===== 2. 細かい絵：木・道・家・柵 =====
  const full = document.createElement('canvas');
  full.width = full.height = DRES;
  const fctx = full.getContext('2d');
  fctx.imageSmoothingEnabled = true;
  fctx.drawImage(base, 0, 0, DRES, DRES);
  // エリアの境目（うすい明るい線）
  fctx.save();
  fctx.globalAlpha = 0.5;
  fctx.fillStyle = 'rgb(240, 228, 190)';
  for (let py = 1; py < RES - 1; py++) for (let px = 1; px < RES - 1; px++) {
    const i = py * RES + px, z0 = zoneOf[i];
    if (z0 !== 255 && (zoneOf[i + 1] !== z0 || zoneOf[i + RES] !== z0)) fctx.fillRect(px * 2, py * 2, 2, 2);
  }
  fctx.restore();
  // 道：土色の帯（縁を少し濃く）
  if (zones?.paths) {
    fctx.lineCap = fctx.lineJoin = 'round';
    for (const [w, color] of [[5.6, 'rgba(92, 70, 40, .55)'], [4.2, 'rgb(196, 170, 122)']]) {
      fctx.lineWidth = w * kD;
      fctx.strokeStyle = color;
      for (const p of zones.paths) {
        fctx.beginPath();
        p.forEach((q, i) => { const [x, y] = toD(q.x, q.z); if (i) fctx.lineTo(x, y); else fctx.moveTo(x, y); });
        fctx.stroke();
      }
    }
  }
  // 木：上から見た葉の広がり（影 → 葉 → 光の当たる所）
  const crown = (t) => (t.r / 0.55) * kD;            // canopies の r は葉の広がりの 55%
  fctx.fillStyle = 'rgba(0, 0, 0, .28)';
  for (const t of trees) { const [x, y] = toD(t.x, t.z); fctx.beginPath(); fctx.arc(x + 1.5, y + 1.5, crown(t), 0, Math.PI * 2); fctx.fill(); }
  for (const t of trees) {
    const [x, y] = toD(t.x, t.z);
    const zk = zones ? zones.zoneAt(t.x, t.z) : 'mixed';
    const c = TREE[zk] || TREE.mixed, v = 0.85 + ((t.x * 7.3 + t.z * 3.1) % 1 + 1) % 1 * 0.3;
    fctx.fillStyle = `rgb(${c[0] * v | 0}, ${c[1] * v | 0}, ${c[2] * v | 0})`;
    fctx.beginPath(); fctx.arc(x, y, crown(t), 0, Math.PI * 2); fctx.fill();
  }
  fctx.fillStyle = 'rgba(200, 230, 150, .16)';
  for (const t of trees) { const [x, y] = toD(t.x, t.z); fctx.beginPath(); fctx.arc(x - crown(t) * 0.3, y - crown(t) * 0.3, crown(t) * 0.5, 0, Math.PI * 2); fctx.fill(); }
  // 村の家・井戸・柵
  for (const b of buildings) {
    const [bx, by] = toD(b.x, b.z);
    if (b.type === 'line') {
      fctx.beginPath();
      b.pts.forEach(([x, z], i) => { const [px, py] = toD(x, z); if (i) fctx.lineTo(px, py); else fctx.moveTo(px, py); });
      fctx.strokeStyle = 'rgba(70, 46, 24, .95)';
      fctx.lineWidth = 2.2;
      fctx.setLineDash([3, 2]);
      fctx.stroke();
      fctx.setLineDash([]);
    } else if (b.type === 'cave') {
      // 洞窟の口：黒い半円（中の通り道は描かない。中は自分で確かめる）
      fctx.fillStyle = '#1c140c';
      fctx.beginPath(); fctx.arc(bx, by, 2.4 * kD, Math.PI, 0); fctx.closePath(); fctx.fill();
      fctx.strokeStyle = 'rgba(150, 130, 100, .9)'; fctx.lineWidth = 1.2; fctx.stroke();
    } else if (b.type === 'bridge') {
      // 橋：板の色の細長い四角
      fctx.save(); fctx.translate(bx, by); fctx.rotate((-b.yaw * Math.PI) / 180);
      fctx.fillStyle = '#7a5434'; fctx.fillRect((-b.w / 2) * kD, (-b.d / 2) * kD, b.w * kD, b.d * kD);
      fctx.strokeStyle = 'rgba(40, 26, 14, .9)'; fctx.lineWidth = 1; fctx.strokeRect((-b.w / 2) * kD, (-b.d / 2) * kD, b.w * kD, b.d * kD);
      fctx.restore();
    } else if (b.type === 'slab') {
      // コンクリートの敷地・ガソリンスタンドの屋根（2026-11-21）：灰色の四角
      fctx.save(); fctx.translate(bx, by); fctx.rotate((-b.yaw * Math.PI) / 180);
      fctx.fillStyle = b.shade === 'canopy' ? '#d8d8d2' : '#a7a49c';
      fctx.fillRect((-b.w / 2) * kD, (-b.d / 2) * kD, b.w * kD, b.d * kD);
      if (b.shade === 'canopy') { fctx.strokeStyle = 'rgba(30, 90, 50, .9)'; fctx.lineWidth = 1.4; fctx.strokeRect((-b.w / 2) * kD, (-b.d / 2) * kD, b.w * kD, b.d * kD); }
      fctx.restore();
    } else if (b.type === 'circle') {
      fctx.fillStyle = '#8c8478';
      fctx.beginPath(); fctx.arc(bx, by, b.r * kD, 0, Math.PI * 2); fctx.fill();
    } else {
      fctx.save(); fctx.translate(bx, by); fctx.rotate((-b.yaw * Math.PI) / 180);
      const w = b.w * kD, d = b.d * kD;
      fctx.fillStyle = 'rgba(0,0,0,.35)'; fctx.fillRect(-w / 2 + 2, -d / 2 + 2, w, d);           // 影
      fctx.fillStyle = b.roof === 'thatch' ? '#c4a062' : b.roof === 'flat' ? '#6f6d68' : '#a9543a';   // flat：平らな屋根（ガソリンスタンドの売店）
      fctx.fillRect(-w / 2, -d / 2, w, d);
      fctx.fillStyle = 'rgba(255,255,255,.18)'; fctx.fillRect(-w / 2, -d / 2, w / 2, d);          // 屋根の日の当たる側
      fctx.strokeStyle = 'rgba(40, 26, 14, .9)'; fctx.lineWidth = 1; fctx.strokeRect(-w / 2, -d / 2, w, d);
      fctx.beginPath(); fctx.moveTo(0, -d / 2); fctx.lineTo(0, d / 2); fctx.stroke();             // 棟
      fctx.restore();
    }
  }
  // 天坑（2026-11-22。world/cave-plan.js の SKY）：地面に開いた穴。黒い丸と、ふちの岩の輪
  const sky = cave?.sky || null;
  if (sky) {
    const [x, y] = toD(sky.x, sky.z), r = sky.r * kD;
    fctx.fillStyle = 'rgba(120, 104, 84, .9)'; fctx.beginPath(); fctx.arc(x, y, r + (sky.lip + 0.6) * kD, 0, Math.PI * 2); fctx.fill();
    const hg = fctx.createRadialGradient(x, y, 0, x, y, r);
    hg.addColorStop(0, '#05080a'); hg.addColorStop(0.75, '#10161a'); hg.addColorStop(1, '#2a2620');
    fctx.fillStyle = hg; fctx.beginPath(); fctx.arc(x, y, r, 0, Math.PI * 2); fctx.fill();
    fctx.strokeStyle = INK; fctx.lineWidth = 1.2; fctx.stroke();
  }
  // 歩ける範囲の縁：点線（2026-11-14：外周の柵を無くし、周りの山が端になった）
  {
    const R = (areaRadius / view) * DRES / 2;
    fctx.save();
    fctx.setLineDash([7, 5]);
    fctx.beginPath(); fctx.arc(DRES / 2, DRES / 2, R, 0, Math.PI * 2);
    fctx.strokeStyle = 'rgba(52, 34, 18, .85)'; fctx.lineWidth = 2.2; fctx.stroke();
    fctx.restore();
  }

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
    { key: 'mixed', x: -48, z: -4 },
    // 深い森・大草原は、その広がり（world/zones.js の blobs）の真ん中
    { key: 'deep', x: (zones.blobs?.deep.x ?? 0) + 30, z: (zones.blobs?.deep.z ?? -areaRadius * 0.68) + 36 },   // 風穴（洞窟）の名前と重ならないよう南東へ
    { key: 'prairie', x: (zones.blobs?.prairie.x ?? areaRadius * 0.6) + 12, z: (zones.blobs?.prairie.z ?? 0) + 46 },   // 野邑（大草原の真ん中）と重ならないよう南へ
    // 村は 3 つ（world/villages.js）：それぞれの名前（山邑・川邑・野邑）を村の少し北に
    ...(zones.villages?.length ? zones.villages.map((v) => ({ key: 'castle', name: v.name, x: v.x, z: v.z - v.r * 0.75 }))
      : [{ key: 'castle', x: zones.castle.x, z: zones.castle.z - 40 }]),
  ] : [];

  // 洞窟の口の名前：同じ名前の口（風穴は 2 つ）は、その真ん中の少し東に 1 つだけ書く
  {
    const byName = new Map();
    for (const b of buildings) if (b.type === 'cave') { const k = b.name || '風穴'; if (!byName.has(k)) byName.set(k, []); byName.get(k).push(b); }
    for (const [name, list] of byName) labels.push({ key: 'cave', name, x: list.reduce((s, b) => s + b.x, 0) / list.length + 6, z: list.reduce((s, b) => s + b.z, 0) / list.length });
    // 天坑の名前は地上の地図には書かない（混淆林・川邑の名前と重なるため。穴の印だけ。名前は地下の地図に書く）
  }

  // ===== 地下の地図（2026-11-21。利用者の指示：洞窟に入ったら地下の地図に切り替える）=====
  //   洞窟の形（world/cave-plan.js が 0.8 m の升目に焼いた、壁からの距離）から、通り道と広間を描く。初めて洞窟に入ったときに 1 回だけ描く。
  //   通り道は床の高さで濃さを変える（深い所ほど暗い）。壁の縁は墨の線。口は外へ向いた印と名前。外（岩）は暗い色
  const caveLabels = [];
  if (cave) {
    for (const n of cave.names || []) caveLabels.push({ name: n.name, x: n.x, z: n.z });
    if (cave.sky) caveLabels.push({ name: cave.sky.name, x: cave.sky.x - 2, z: cave.sky.z - 13, small: true });   // 天坑（池の少し北。大空洞の名前と重ならないように）
    const byName = new Map();
    for (const m of cave.mouths) { if (!byName.has(m.name)) byName.set(m.name, []); byName.get(m.name).push(m); }
    for (const [name, list] of byName) caveLabels.push({ name, x: list.reduce((a, m) => a + m.x, 0) / list.length - list[0].in[0] * 9, z: list.reduce((a, m) => a + m.z, 0) / list.length - list[0].in[1] * 9 });
  }
  let caveFull = null;
  function buildCaveMap() {
    const img = new ImageData(RES, RES);
    let lo = Infinity, hi = -Infinity;
    const D = new Float32Array(RES * RES).fill(9), Fl = new Float32Array(RES * RES);
    for (let py = 0; py < RES; py++) for (let px = 0; px < RES; px++) {
      const q = cave.at(px2w(px), px2w(py));
      if (!q) continue;
      const i = py * RES + px;
      D[i] = q.d; Fl[i] = q.floor;
      if (q.d < 0) { lo = Math.min(lo, q.floor); hi = Math.max(hi, q.floor); }
    }
    for (let py = 0; py < RES; py++) for (let px = 0; px < RES; px++) {
      const i = py * RES + px, x = px2w(px), z = px2w(py);
      const n = fbm(x * 0.08, z * 0.08, 41);
      let c;
      if (D[i] < -0.4) {
        // 通り道：床が高い（浅い）所ほど明るい土色
        const t = hi > lo ? (Fl[i] - lo) / (hi - lo) : 0.5;
        const k = 0.72 + 0.28 * t + (n - 0.5) * 0.08;
        c = [176 * k, 152 * k, 112 * k];
        // 天坑の下の池：水の色（深いほど濃い）。真上の穴から光が入る所は明るく
        const w = cave.pondAt?.(x, z);
        if (w) { const d = Math.min(1, w.depth / 2.5); c = [96 - 40 * d, 138 - 40 * d, 150 - 26 * d]; }
      } else if (D[i] < 0.9) c = [52, 36, 20];                 // 壁の縁（墨の線）
      else c = [34 + n * 14, 30 + n * 12, 26 + n * 10];         // 岩
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    const b = document.createElement('canvas'); b.width = b.height = RES; b.getContext('2d').putImageData(img, 0, 0);
    const f = document.createElement('canvas'); f.width = f.height = DRES;
    const g = f.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(b, 0, 0, DRES, DRES);
    // 天坑：天井の穴（空が見える所）を点線の丸で
    if (cave.sky) {
      const [x, y] = toD(cave.sky.x, cave.sky.z);
      g.save(); g.setLineDash([4, 3]); g.strokeStyle = 'rgba(250, 236, 190, .95)'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(x, y, cave.sky.low * kD, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    // 柱（大空洞の岩の柱）
    g.fillStyle = 'rgba(40, 28, 16, .95)';
    for (const p of cave.pillars || []) { const [x, y] = toD(p.x, p.z); g.beginPath(); g.arc(x, y, p.r * kD, 0, Math.PI * 2); g.fill(); }
    // 口：外の切り通しへ延びる明るい道と、外を向いた矢じり
    for (const m of cave.mouths) {
      const [x0, y0] = toD(m.x, m.z), [x1, y1] = toD(m.from[0], m.from[1]);
      g.strokeStyle = 'rgba(214, 196, 140, .9)'; g.lineWidth = m.hw * 2 * kD; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.save(); g.translate(x1, y1); g.rotate(Math.atan2(-m.in[1], -m.in[0]));
      g.fillStyle = '#e8d38a'; g.strokeStyle = INK; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(9, 0); g.lineTo(-5, -7); g.lineTo(-2, 0); g.lineTo(-5, 7); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    // 歩ける範囲の縁（地上と同じ点線）
    g.save(); g.setLineDash([7, 5]);
    g.beginPath(); g.arc(DRES / 2, DRES / 2, (areaRadius / view) * DRES / 2, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(200, 180, 140, .5)'; g.lineWidth = 2; g.stroke(); g.restore();
    caveFull = f;
  }

  // ===== 小さな地図：今いるエリアの範囲を映す =====
  const ctx = canvas.getContext('2d');
  let size = 0, timer = 0, zoneNow = null, villageNow = null;   // villageNow：村の中なら、その村（名前と映す範囲）
  let underName = null;   // 洞窟の中にいる間は、その名前（風穴・地底洞・大空洞）
  const cam = { cx: RES / 2, cy: RES / 2, half: RES / 2 };      // 映している範囲（起伏の絵の画素で）
  const target = { cx: RES / 2, cy: RES / 2, half: RES / 2 };

  function aim(zone, px, py) {
    // 洞窟の中：自分を真ん中に、まわり 45 m を映す（地下の地図）
    if (underName && cave) { Object.assign(target, { cx: px, cy: py, half: (45 / view) * RES / 2 }); return; }
    // 村の中：その村のまわりだけを映す（村は 3 つに分かれているので、エリア全体の四角では広すぎる）
    if (zone === 'castle' && villageNow) {
      const [vx, vy] = toPx(villageNow.x, villageNow.z);
      Object.assign(target, { cx: vx, cy: vy, half: ((villageNow.r + 16) / view) * RES / 2 });
      return;
    }
    const b = bounds[zone];
    if (!b || b.x1 < b.x0) { Object.assign(target, { cx: RES / 2, cy: RES / 2, half: RES / 2 }); return; }
    // エリアの四角に少し余白をつける。広すぎるエリア（中央の森など）は、自分の周り 100m までに絞る
    let half = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 8;
    let cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const maxHalf = (100 / view) * RES / 2;
    if (half > maxHalf) { half = maxHalf; cx = px; cy = py; }
    Object.assign(target, { cx, cy, half: Math.max(half, (35 / view) * RES / 2) });
  }

  function drawArrow(c, x, y, yaw, s, alive, cone = 0) {
    c.save();
    c.translate(x, y);
    c.rotate((-yaw * Math.PI) / 180);
    if (cone && alive !== false) {
      // 見ている向き（扇形）
      const g = c.createRadialGradient(0, 0, 0, 0, 0, cone);
      g.addColorStop(0, 'rgba(255, 236, 170, .55)');
      g.addColorStop(1, 'rgba(255, 236, 170, 0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, cone, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); c.closePath(); c.fill();
    }
    c.beginPath();
    c.moveTo(0, -s * 1.3); c.lineTo(s * 0.8, s); c.lineTo(0, s * 0.45); c.lineTo(-s * 0.8, s);
    c.closePath();
    c.fillStyle = alive === false ? 'rgba(160,160,160,.9)' : '#ffd75e';
    c.strokeStyle = 'rgba(0,0,0,.85)';
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
    const inCave = underName && cave;
    if (inCave) {
      if (!caveFull) buildCaveMap();
      ctx.fillStyle = '#221e1a'; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(caveFull, sx * 2, sy * 2, sw * 2, sw * 2, 0, 0, size, size);
    } else {
      ctx.drawImage(full, sx * 2, sy * 2, sw * 2, sw * 2, 0, 0, size, size);
      if (zoneNow && masks[zoneNow]) ctx.drawImage(masks[zoneNow], sx, sy, sw, sw, 0, 0, size, size);
    }
    // 縁の内側を少し暗く（丸い窓から覗いた感じ）
    const v = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size / 2);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, size, size);
    const [px, py] = toPx(me.x, me.z);
    drawArrow(ctx, ((px - sx) / sw) * size, ((py - sy) / sw) * size, me.yaw, size / 18, me.alive, size * 0.3);
    ctx.restore();
    // 北の印・エリアの名前
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(size / 11)}px "Hiragino Mincho ProN", serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText(L.north, size / 2, size / 10);
    ctx.fillStyle = '#f3dc9a';
    ctx.fillText(L.north, size / 2, size / 10);
    // 洞窟の中：地下の地図（上）。洞窟の形が無いときだけ、前と同じく地上の地図を暗くする
    if (underName && !cave) { ctx.fillStyle = 'rgba(8, 6, 4, .55)'; ctx.fillRect(0, 0, size, size); }
    if (zoneNow) {
      ctx.font = `700 ${Math.round(size / 10)}px "Hiragino Mincho ProN", serif`;
      const name = underName || villageNow?.name || ZONE_NAMES[zoneNow];
      ctx.strokeText(name, size / 2, size - size / 9);
      ctx.fillStyle = '#fff3cf';
      ctx.fillText(name, size / 2, size - size / 9);
    }
  }

  // ===== 大きな地図（羊皮紙の地図）=====
  const bigWrap = document.getElementById('mapview');
  const big = bigWrap?.querySelector('canvas');
  let open = false, lastMe = null, paper = null, paperSize = 0, paperUnder = false;

  /** 羊皮紙と、地図の絵（色を少し古びさせる）・飾り（方位・縮尺・題・凡例）を 1 回だけ描く */
  function drawPaper(s, under = false) {
    const src = under ? caveFull : full, list = under ? caveLabels : labels;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    // 羊皮紙：明るい中央から、焦げた縁へ。紙のむら
    const bg = g.createRadialGradient(s / 2, s / 2, s * 0.2, s / 2, s / 2, s * 0.75);
    bg.addColorStop(0, '#e9d9b0'); bg.addColorStop(0.7, '#d4bc88'); bg.addColorStop(1, '#8a6a3a');
    g.fillStyle = bg;
    g.fillRect(0, 0, s, s);
    // 紙のむら：小さな絵（256 画素）で作って広げる（大きな絵で 1 画素ずつ作ると iPad で重い）
    const GS = 256;
    const grain = new ImageData(GS, GS);
    for (let i = 0; i < GS * GS; i++) {
      const x = i % GS, y = (i / GS) | 0;
      const n = fbm(x * 0.03, y * 0.03, 17) * 0.65 + fbm(x * 0.2, y * 0.2, 23) * 0.35;
      grain.data[i * 4] = 70; grain.data[i * 4 + 1] = 46; grain.data[i * 4 + 2] = 20;
      grain.data[i * 4 + 3] = Math.max(0, (n - 0.42) * 110);
    }
    const gc = document.createElement('canvas'); gc.width = gc.height = GS; gc.getContext('2d').putImageData(grain, 0, 0);
    g.drawImage(gc, 0, 0, s, s);
    // 地図（丸）：紙の色を重ねて少し褪せさせ、紙になじませる（Safari は canvas の filter が使えないので、重ねて塗る）
    const R = s * 0.43, cx = s / 2, cy = s / 2 + s * 0.015;
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
    g.drawImage(src, cx - R, cy - R, R * 2, R * 2);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = under ? 'rgba(236, 210, 160, .25)' : 'rgba(236, 210, 160, .55)';
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    g.globalAlpha = 0.5;
    g.drawImage(gc, 0, 0, s, s);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    const vg = g.createRadialGradient(cx, cy, R * 0.75, cx, cy, R);
    vg.addColorStop(0, 'rgba(120, 90, 50, 0)'); vg.addColorStop(1, 'rgba(120, 90, 50, .35)');
    g.fillStyle = vg; g.fillRect(cx - R, cy - R, R * 2, R * 2);
    g.restore();
    // 地図の縁：二重の墨の輪
    g.strokeStyle = INK;
    g.lineWidth = s / 260; g.beginPath(); g.arc(cx, cy, R + s * 0.006, 0, Math.PI * 2); g.stroke();
    g.lineWidth = s / 520; g.beginPath(); g.arc(cx, cy, R + s * 0.016, 0, Math.PI * 2); g.stroke();
    // エリアの名前（墨の明朝体。白く縁取る）
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const scale = (2 * R) / (2 * view);
    for (const l of list) {
      const x = cx + l.x * scale, y = cy + l.z * scale;
      g.font = `700 ${Math.round(s / (l.small ? 34 : 24))}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
      const name = l.name || ZONE_NAMES[l.key];
      g.lineWidth = s / 110; g.strokeStyle = 'rgba(240, 225, 190, .85)'; g.strokeText(name, x, y);
      g.fillStyle = '#2b1d0e'; g.fillText(name, x, y);
    }
    // 題
    g.font = `700 ${Math.round(s / 20)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
    g.fillStyle = '#3b2a17';
    g.textAlign = 'left';
    g.fillText(under ? `${L.title}・${L.caveMap}` : L.title, s * 0.04, s * 0.055);
    g.font = `${Math.round(s / 42)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
    g.fillText(L.span, s * 0.045, s * 0.1);
    // 方位（右上）
    {
      const ox = s * 0.89, oy = s * 0.11, r = s * 0.055;
      g.save(); g.translate(ox, oy);
      g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = s / 600;
      g.beginPath(); g.arc(0, 0, r * 0.75, 0, Math.PI * 2); g.stroke();
      for (let k = 0; k < 4; k++) {
        g.save(); g.rotate((k * Math.PI) / 2);
        g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 0.18, 0); g.lineTo(0, r * 0.12); g.lineTo(-r * 0.18, 0); g.closePath();
        g.fillStyle = k === 0 ? '#8a2a1a' : INK; g.fill();
        g.restore();
      }
      g.font = `700 ${Math.round(s / 34)}px "Hiragino Mincho ProN", serif`;
      g.textAlign = 'center'; g.fillStyle = '#8a2a1a';
      g.fillText(L.north, 0, -r - s * 0.018);
      g.restore();
    }
    // 縮尺（左下）：50m
    {
      const len = 50 * scale, x0 = s * 0.05, y0 = s * 0.95;
      g.fillStyle = INK; g.strokeStyle = INK; g.lineWidth = s / 500;
      g.fillRect(x0, y0 - s * 0.006, len / 2, s * 0.008);
      g.strokeRect(x0, y0 - s * 0.006, len, s * 0.008);
      g.font = `${Math.round(s / 42)}px "Hiragino Mincho ProN", serif`;
      g.textAlign = 'left'; g.fillText(`50 ${L.meter}`, x0 + len + s * 0.01, y0 - s * 0.002);
    }
    // 凡例（右下）
    {
      const x0 = s * 0.74, y0 = s * 0.85, lh = s * 0.032;
      g.font = `${Math.round(s / 44)}px "Hiragino Mincho ProN", serif`;
      g.textAlign = 'left';
      const items = under ? [[L.cavePath, (x, y) => { g.fillStyle = '#b09670'; g.fillRect(x, y - 4, 20, 8); }],
        [L.caveMouth, (x, y) => { g.fillStyle = '#e8d38a'; g.beginPath(); g.moveTo(x + 18, y); g.lineTo(x + 4, y - 7); g.lineTo(x + 7, y); g.lineTo(x + 4, y + 7); g.closePath(); g.fill(); }],
        [L.you, (x, y) => drawArrow(g, x + 10, y, 0, 6, true)]]
        : [[L.road, (x, y) => { g.fillStyle = '#c4aa7a'; g.fillRect(x, y - 3, 20, 6); }],
        [L.house, (x, y) => { g.fillStyle = '#a9543a'; g.fillRect(x + 4, y - 6, 12, 12); }],
        [L.tree, (x, y) => { g.fillStyle = '#3a5a32'; g.beginPath(); g.arc(x + 10, y, 7, 0, Math.PI * 2); g.fill(); }],
        [L.you, (x, y) => drawArrow(g, x + 10, y, 0, 6, true)]];
      items.forEach(([name, mark], k) => {
        const y = y0 + k * lh;
        mark(x0, y);
        g.fillStyle = '#2b1d0e'; g.fillText(name, x0 + 28, y + 1);
      });
    }
    return { canvas: c, R, cx, cy };
  }

  function drawBig(me) {
    if (!big) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const s = Math.min(1600, Math.round(big.clientWidth * dpr));
    if (!s) return;
    if (big.width !== s) big.width = big.height = s;
    const under = !!(underName && cave);
    if (under && !caveFull) buildCaveMap();
    if (!paper || paperSize !== s || paperUnder !== under) { paper = drawPaper(s, under); paperSize = s; paperUnder = under; }
    const c = big.getContext('2d');
    c.clearRect(0, 0, s, s);
    c.drawImage(paper.canvas, 0, 0);
    if (me) {
      const scale = paper.R / view;
      drawArrow(c, paper.cx + me.x * scale, paper.cy + me.z * scale, me.yaw, s / 60, me.alive, s * 0.06);
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
        villageNow = z === 'castle' && zones.villageAt ? zones.villageAt(me.x, me.z) : null;
        underName = zones.caveAt && zones.caveAt(me.x, me.z, me.y ?? null) > 0.5 ? (zones.caveName?.(me.x, me.z) || null) : null;
        if (underName) villageNow = null;
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
