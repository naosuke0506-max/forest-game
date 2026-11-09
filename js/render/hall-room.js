// 大廳の広間の形：石の床と壁・腰石・奥の大きな暖炉（アーチの口・煤・炉床・薪台・炉棚）・丸い柱・壇・絨毯・旗・壁の松明の受け・火鉢
//   質感は Poly Haven（CC0）の実写：壁は切り石（medieval_blocks_03）、床は大きな敷石（large_floor_tiles_02）、
//   炉の中と腰石は荒石（castle_wall_varriation）、梁と天井は古い板（old_planks_02）、絨毯と旗は布（velour_velvet）
//   部屋の隅・床と壁の境・柱や壇や小物の根もとは、頂点の色で暗くする（光が回り込みにくい所の陰）
//   カメラに映るのは、床と、奥の壁の高さ 4 m ほどまで（横長の画面では左寄り）。手間はそこに掛ける
import * as pc from 'playcanvas';
import { geo, toMesh, lathe, bevelBox, hexa } from './geo.js';

const TAU = Math.PI * 2;
export const W = 11, D = 15, H = 6.4;
export const BACK = -4.2;               // 奥の壁
export const DAIS = 0.24;               // 人物が立つ壇の高さ（2 段）
const hx = W / 2, f0 = BACK, f1 = BACK + D;

// 暖炉：壁から張り出した胸壁（x0〜x1、手前の面 zf）に、楕円のアーチの口（幅 2×ox、脚 jamb、アーチの高さ rise）
export const FIRE = { x0: -1.75, x1: 1.75, zf: BACK + 0.78, zb: BACK + 0.04, ox: 1.08, jamb: 1.0, rise: 0.56, Hs: 1.95 };
export const PILLARS = [[-3.7, -1.5], [3.7, -1.5], [-3.7, 2.6], [3.7, 2.6]];
/** 壁の松明（奥の壁）：受けの位置と、炎の位置 */
export const TORCHES = [-3.35, 3.35].map((x) => ({ x, y: 2.62, z: f0 + 0.05, flame: [x, 2.72, f0 + 0.4] }));
/** 火鉢（壇の奥の左右）：脚の付け根と、炎の位置 */
export const BRAZIERS = [-2.05, 2.05].map((x) => ({ x, z: -1.45, flame: [x, 1.0, -1.45] }));
/** 旗（暖炉の左右） */
const BANNERS = [-2.48, 2.48];
/** 床の上の物（根もとの陰を床に付ける）：[x, z, 半径] */
export const FLOOR_SPOTS = [
  [-2.75, -3.55, 0.42], [-2.05, -3.82, 0.36], [-2.35, -2.55, 0.5],   // 樽・樽・宝箱
  [2.75, -3.55, 0.75], [2.45, -2.75, 0.22],                           // 机・腰掛け
  ...BRAZIERS.map((b) => [b.x, b.z, 0.32]),
];

const boxDist = (x, z, x0, x1, z0, z1) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
const dark = (k, d, r) => 1 - k * Math.exp(-Math.max(0, d) / r);

/** 床の陰：壁際・暖炉の胸壁・壇・柱・床の上の物の根もと */
function floorShade(x, z) {
  let k = dark(0.5, Math.min(x + hx, hx - x, z - f0), 0.6);
  k *= dark(0.42, boxDist(x, z, FIRE.x0, FIRE.x1, f0, FIRE.zf + 0.55), 0.35);
  k *= dark(0.4, boxDist(x, z, -1.7, 1.7, -1.3, 1.3), 0.2);
  for (const [px, pz] of PILLARS) k *= dark(0.45, Math.hypot(x - px, z - pz) - 0.5, 0.35);
  for (const [px, pz, r] of FLOOR_SPOTS) k *= dark(0.5, Math.hypot(x - px, z - pz) - r * 0.7, r * 0.6);
  return k;
}
/** 壁の陰：床際・天井際・部屋の隅（along：壁に沿った位置、a0・a1：その壁の両端） */
function wallShade(y, along, a0, a1) {
  return dark(0.5, y, 0.45) * dark(0.4, H - y, 0.9) * dark(0.35, Math.min(along - a0, a1 - along), 0.6);
}
const tint = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// 色味（質感の色に掛ける）
const STONE = [0.6, 0.55, 0.5], FLOOR = [0.62, 0.59, 0.56], RUBBLE = [0.55, 0.5, 0.46], WOOD = [0.55, 0.45, 0.37];
const IRON = [0.12, 0.115, 0.11], GOLD = [0.85, 0.62, 0.26];

/** 線分 a→b を軸にした円柱（丸太・柄・脚） */
function rod(G, a, b, r, segs, col, caps = true) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d);
  const w = d.map((v) => v / len);
  const t = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [w[1] * t[2] - w[2] * t[1], w[2] * t[0] - w[0] * t[2], w[0] * t[1] - w[1] * t[0]];
  const ul = Math.hypot(...u); u = u.map((v) => v / ul);
  const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  const base = G.count;
  for (let i = 0; i <= segs; i++) {
    const ang = (i / segs) * TAU, cs = Math.cos(ang), sn = Math.sin(ang);
    const n = [u[0] * cs + v[0] * sn, u[1] * cs + v[1] * sn, u[2] * cs + v[2] * sn];
    for (const [p, s] of [[a, 0], [b, 1]]) {
      const c = typeof col === 'function' ? col(p) : col;
      G.vert([p[0] + n[0] * r, p[1] + n[1] * r, p[2] + n[2] * r], n, [(ang * r) / G.tile, (s * len) / G.tile], c);
    }
  }
  for (let i = 0; i < segs; i++) { const k = base + i * 2; G.tri(k, k + 1, k + 3); G.tri(k, k + 3, k + 2); }
  if (caps) {
    for (const [p, sgn] of [[a, -1], [b, 1]]) {
      const pts = [];
      for (let i = 0; i < segs; i++) {
        const ang = (i / segs) * TAU, cs = Math.cos(ang), sn = Math.sin(ang);
        pts.push([p[0] + (u[0] * cs + v[0] * sn) * r, p[1] + (u[1] * cs + v[1] * sn) * r, p[2] + (u[2] * cs + v[2] * sn) * r]);
      }
      G.flat(pts, typeof col === 'function' ? col(p) : col, w.map((x) => x * sgn));
    }
  }
}

/** 道筋（点の列）を、長さの割合で count 点に並べ直す */
function resample(path, count) {
  const L = [0];
  for (let i = 1; i < path.length; i++) L.push(L[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = L[L.length - 1], out = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const s = (total * k) / (count - 1);
    while (j < path.length - 2 && L[j + 1] < s) j++;
    const t = (s - L[j]) / (L[j + 1] - L[j] || 1);
    out.push([path[j][0] + (path[j + 1][0] - path[j][0]) * t, path[j][1] + (path[j + 1][1] - path[j][1]) * t]);
  }
  return out;
}

/** 布の傷み：細かな織りむら・擦れ・下ほどの汚れ（絵の上から重ねる） */
function weathering(g, Wd, Hd, { fibers = 2600, grime = 0.35 } = {}) {
  for (let i = 0; i < fibers; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.55 ? '0,0,0' : '255,220,200'},${Math.random() * 0.06})`;
    g.fillRect(Math.random() * Wd, Math.random() * Hd, 1, 4 + Math.random() * 22);
  }
  for (let i = 0; i < 60; i++) {   // しみ
    const x = Math.random() * Wd, y = Math.random() * Hd, r = 6 + Math.random() * 30;
    const q = g.createRadialGradient(x, y, 0, x, y, r);
    q.addColorStop(0, `rgba(20,10,5,${0.05 + Math.random() * 0.12})`); q.addColorStop(1, 'rgba(20,10,5,0)');
    g.fillStyle = q; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const d = g.createLinearGradient(0, 0, 0, Hd);
  d.addColorStop(0, 'rgba(0,0,0,0.15)'); d.addColorStop(0.5, 'rgba(0,0,0,0)'); d.addColorStop(1, `rgba(25,12,6,${grime})`);
  g.fillStyle = d; g.fillRect(0, 0, Wd, Hd);
}
function canvasTex(device, c, repeat = false) {
  const t = new pc.Texture(device, { width: c.width, height: c.height, format: pc.PIXELFORMAT_RGBA8, srgb: true, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
    addressU: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE, addressV: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE, anisotropy: 4 });
  t.setSource(c);
  return t;
}
/** 金糸の刺繍の色（くすんだ金。上が明るく下が暗い） */
const oldGold = (gg, y0, y1) => { const q = gg.createLinearGradient(0, y0, 0, y1); q.addColorStop(0, '#c9a45a'); q.addColorStop(0.5, '#8a6528'); q.addColorStop(1, '#b08940'); return q; };

/** 旗の絵：古びた深い紅の地に、くすんだ金の縁取りと、時の輪の紋（どの国の紋でもない）。下は燕尾 */
function bannerTexture(device) {
  const Wd = 256, Hd = 640, c = document.createElement('canvas');
  c.width = Wd; c.height = Hd;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, Hd);
  grd.addColorStop(0, '#46090c'); grd.addColorStop(1, '#2a0507');
  g.fillStyle = grd; g.fillRect(0, 0, Wd, Hd);
  const notch = 110;
  g.strokeStyle = oldGold(g, 0, Hd); g.lineWidth = 8;
  g.beginPath(); g.moveTo(14, 8); g.lineTo(14, Hd - 14); g.lineTo(Wd / 2, Hd - notch - 4); g.lineTo(Wd - 14, Hd - 14); g.lineTo(Wd - 14, 8); g.stroke();
  g.lineWidth = 2; g.strokeStyle = 'rgba(176,137,64,.6)';
  g.beginPath(); g.moveTo(26, 22); g.lineTo(26, Hd - 40); g.lineTo(Wd / 2, Hd - notch - 26); g.lineTo(Wd - 26, Hd - 40); g.lineTo(Wd - 26, 22); g.closePath(); g.stroke();
  // 時の輪の紋：二重の輪・8 本の輻・8 つの珠、上に冠の形
  const cx = Wd / 2, cy = 240, R = 62;
  g.save(); g.translate(cx, cy);
  g.strokeStyle = oldGold(g, -R, R); g.fillStyle = oldGold(g, -R, R);
  g.lineWidth = 9; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.arc(0, 0, R * 0.5, 0, TAU); g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    g.lineWidth = 4; g.beginPath(); g.moveTo(Math.sin(a) * R * 0.5, -Math.cos(a) * R * 0.5); g.lineTo(Math.sin(a) * R * 0.92, -Math.cos(a) * R * 0.92); g.stroke();
    g.beginPath(); g.arc(Math.sin(a + TAU / 16) * R * 1.24, -Math.cos(a + TAU / 16) * R * 1.24, 5, 0, TAU); g.fill();
  }
  g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(-34, -R - 20); g.lineTo(-22, -R - 46); g.lineTo(-10, -R - 25); g.lineTo(0, -R - 54); g.lineTo(10, -R - 25); g.lineTo(22, -R - 46); g.lineTo(34, -R - 20); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = oldGold(g, 420, 440); g.fillRect(44, 420, Wd - 88, 6);
  for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(54 + i * ((Wd - 108) / 6), 448, 4, 0, TAU); g.fill(); }
  // 金糸の擦り切れ（ところどころ地の色が出る）
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(60,10,10,${Math.random() * 0.5})`; g.fillRect(Math.random() * Wd, Math.random() * Hd, 2 + Math.random() * 4, 1 + Math.random() * 3); }
  g.globalCompositeOperation = 'source-over';
  weathering(g, Wd, Hd, { grime: 0.4 });
  return canvasTex(device, c);
}

/**
 * 絨毯の絵（横が幅、縦が長さの向きに繰り返す）：茜の地に、暗い菱の格子と小さな花の印、
 * 両端に紺の帯と金茶の細い線と鋸歯の縁。真ん中は歩かれて少し擦れて明るい
 */
function carpetTexture(device) {
  const Wd = 256, Hd = 512, c = document.createElement('canvas');
  c.width = Wd; c.height = Hd;
  const g = c.getContext('2d');
  g.fillStyle = '#5c1511'; g.fillRect(0, 0, Wd, Hd);
  // 菱の格子（縦に繰り返してもつながるよう、高さを 4 等分した格子）
  g.strokeStyle = 'rgba(30,6,6,.55)'; g.lineWidth = 3;
  const cell = Hd / 4, half = cell / 2, x0 = 58, x1 = Wd - 58, xm = Wd / 2;
  for (let k = -1; k <= 4; k++) {
    const y = k * cell;
    g.beginPath(); g.moveTo(xm, y); g.lineTo(x1, y + half); g.lineTo(xm, y + cell); g.lineTo(x0, y + half); g.closePath(); g.stroke();
    g.fillStyle = 'rgba(180,120,50,.55)';   // 菱の中の小さな花の印
    for (const [dx, dy] of [[0, -8], [8, 0], [0, 8], [-8, 0]]) { g.beginPath(); g.arc(xm + dx, y + half + dy, 3.2, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(20,24,40,.8)'; g.beginPath(); g.arc(xm, y + half, 3, 0, TAU); g.fill();
  }
  // 両端の帯：紺の帯・金茶の線・鋸歯
  for (const side of [0, 1]) {
    const bx = side ? Wd - 46 : 0;
    g.fillStyle = '#16192b'; g.fillRect(bx, 0, 46, Hd);
    g.fillStyle = '#9a6a2c';
    g.fillRect(side ? Wd - 48 : 46, 0, 3, Hd);
    g.fillRect(side ? Wd - 8 : 5, 0, 2, Hd);
    g.fillStyle = '#7a1c14';
    for (let y = 0; y < Hd; y += 16) {
      const ex = side ? Wd - 46 : 46, dir = side ? 1 : -1;
      g.beginPath(); g.moveTo(ex, y); g.lineTo(ex + dir * 10, y + 8); g.lineTo(ex, y + 16); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(190,140,70,.7)';
    for (let y = 8; y < Hd; y += 32) { g.beginPath(); g.arc(side ? Wd - 26 : 24, y, 4, 0, TAU); g.fill(); }
  }
  // 歩かれた擦れ（真ん中が少し明るく、毛羽立つ）と、織りむら
  const wear = g.createLinearGradient(0, 0, Wd, 0);
  wear.addColorStop(0, 'rgba(255,200,170,0)'); wear.addColorStop(0.5, 'rgba(255,200,170,0.07)'); wear.addColorStop(1, 'rgba(255,200,170,0)');
  g.fillStyle = wear; g.fillRect(0, 0, Wd, Hd);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,210,190'},${Math.random() * 0.07})`;
    g.fillRect(Math.random() * Wd, Math.random() * Hd, 1 + Math.random() * 2, 1 + Math.random() * 3);
  }
  return canvasTex(device, c, true);
}

/** 布の旗（ひだ・下は燕尾）。法線はエンジンに任せる（滑らかなひだ） */
function bannerMesh(device, w, len, notch, seed) {
  const nx = 12, ny = 26, P = [], U = [], I = [];
  for (let j = 0; j <= ny; j++) {
    const v = j / ny;
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const l = len - notch * (1 - Math.abs(2 * u - 1));   // 燕尾：真ん中ほど短い
      const fold = 0.032 * Math.sin(u * Math.PI * 5 + seed) * (0.35 + 0.65 * v) + 0.012 * Math.sin(u * Math.PI * 11 + seed * 2) * v;
      P.push((u - 0.5) * w * (1 - 0.03 * v), -v * l, fold + 0.03 * v * v);
      U.push(u, (v * l) / len);
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i;
    I.push(a, a + nx + 2, a + 1, a, a + nx + 1, a + nx + 2);
  }
  const mesh = new pc.Mesh(device);
  const N = pc.calculateNormals(P, I);
  mesh.setPositions(P); mesh.setNormals(N); mesh.setUvs(0, U); mesh.setIndices(I);
  mesh.setVertexStream(pc.SEMANTIC_TANGENT, pc.calculateTangents(P, N, U, I), 4);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return mesh;
}

/**
 * 広間の形を作る。surfaces：質感ごとの { mesh, tile, castShadows }。banner：旗の形と絵
 * @param {object} quality 画質（low は分け方を粗く）
 */
export function buildRoom(device, quality) {
  const step = quality.maxPixelRatio <= 1 ? 0.5 : 0.25;   // 隅の陰を付けるための細かさ
  const G = {
    wall: geo(2.0), floor: geo(3.0), rubble: geo(2.0), wood: geo(2.0), carpet: geo(1.56), iron: geo(1.0), gold: geo(1.0),
  };
  const nx = (len) => Math.max(1, Math.round(len / step));

  // ---- 床（石畳の大きな敷石） ----
  G.floor.plane([-hx, 0, f1], [W, 0, 0], [0, 0, -D], nx(W), nx(D), (p) => tint(FLOOR, floorShade(p[0], p[2])), [0, 1, 0]);
  // ---- 天井（古い板。暗くてほとんど見えない） ----
  G.wood.plane([-hx, H, f0], [W, 0, 0], [0, 0, D], 11, 15, (p) => tint(WOOD, 0.5 * dark(0.4, Math.min(p[0] + hx, hx - p[0], p[2] - f0), 1)), [0, -1, 0]);
  // ---- 壁（奥・左右。手前はカメラの後ろなので作らない） ----
  G.wall.plane([-hx, 0, f0], [W, 0, 0], [0, H, 0], nx(W), nx(H), (p) => tint(STONE, wallShade(p[1], p[0], -hx, hx)), [0, 0, 1]);
  for (const s of [-1, 1]) {
    G.wall.plane([s * hx, 0, f0], [0, 0, D], [0, H, 0], nx(D) / 2 | 0 || 1, nx(H), (p) => tint(STONE, wallShade(p[1], p[2], f0, f1)), [-s, 0, 0]);
  }
  // ---- 腰石（壁の下の張り出した荒石の帯。上は斜めに落とす） ----
  const plinth = (a, b, z, nrm) => {   // 奥の壁に沿う（x：a〜b）
    const zo = z + nrm * 0.13, zt = z + nrm * 0.07;
    G.rubble.plane([a, 0, zo], [b - a, 0, 0], [0, 0.44, 0], nx(b - a), 2, (p) => tint(RUBBLE, dark(0.4, p[1], 0.25) * dark(0.3, Math.min(p[0] + hx, hx - p[0]), 0.5)), [0, 0, nrm]);
    G.rubble.flat([[a, 0.44, zo], [b, 0.44, zo], [b, 0.52, zt], [a, 0.52, zt]], tint(RUBBLE, 0.95), [0, 1, nrm]);
    G.rubble.flat([[a, 0.52, zt], [b, 0.52, zt], [b, 0.52, z], [a, 0.52, z]], tint(RUBBLE, 0.9), [0, 1, 0]);
  };
  plinth(-hx, FIRE.x0, f0, 1); plinth(FIRE.x1, hx, f0, 1);
  for (const s of [-1, 1]) {   // 左右の壁の腰石
    const x = s * hx, xo = x - s * 0.13, xt = x - s * 0.07;
    G.rubble.plane([xo, 0, f0], [0, 0, D], [0, 0.44, 0], nx(D) / 2 | 0, 2, (p) => tint(RUBBLE, dark(0.4, p[1], 0.25)), [-s, 0, 0]);
    G.rubble.flat([[xo, 0.44, f0], [xo, 0.44, f1], [xt, 0.52, f1], [xt, 0.52, f0]], tint(RUBBLE, 0.95), [-s, 1, 0]);
    G.rubble.flat([[xt, 0.52, f0], [xt, 0.52, f1], [x, 0.52, f1], [x, 0.52, f0]], tint(RUBBLE, 0.9), [0, 1, 0]);
  }

  // ---- 暖炉：張り出した胸壁と、アーチの口・煤けた炉の中・炉床・炉棚 ----
  const { x0, x1, zf, zb, ox, jamb, rise, Hs } = FIRE;
  const arch = [];
  arch.push([-ox, 0]);
  for (let i = 0; i <= 24; i++) { const t = (i / 24) * Math.PI; arch.push([-ox * Math.cos(t), jamb + rise * Math.sin(t)]); }
  arch.push([ox, 0]);
  const K = 56;
  const inner = resample(arch, K), outer = resample([[x0, 0], [x0, Hs], [x1, Hs], [x1, 0]], K);
  const archTop = (x) => (Math.abs(x) >= ox ? 0 : jamb + rise * Math.sqrt(1 - (x / ox) ** 2));
  // 口のまわりの煤（アーチの上ほど黒い）
  const sootFront = (p) => {
    const above = p[1] - archTop(p[0]);
    const near = Math.abs(p[0]) < ox + 0.15 ? Math.exp(-Math.max(0, above) / 0.45) : 0;
    return tint(STONE, (1 - 0.6 * near) * dark(0.4, p[1], 0.35));
  };
  for (let i = 0; i < K - 1; i++) {
    const a = inner[i], b = inner[i + 1], c = outer[i + 1], d = outer[i];
    G.wall.flat([[a[0], a[1], zf], [b[0], b[1], zf], [c[0], c[1], zf], [d[0], d[1], zf]], sootFront, [0, 0, 1]);
    // 口の内側（側壁とアーチの下面）：荒石・煤で黒い
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    G.rubble.flat([[a[0], a[1], zf], [b[0], b[1], zf], [b[0], b[1], zb], [a[0], a[1], zb]],
      (p) => tint(RUBBLE, 0.18 + 0.32 * Math.exp(-p[1] / 0.6) * (0.6 + 0.4 * (p[2] - zb) / (zf - zb))), [-mx, 0.6 - my, 0]);
  }
  // 炉の奥（煤で黒く、下だけ炎に照らされた灰色）
  G.rubble.flat(inner.map(([x, y]) => [x, y, zb]), (p) => tint(RUBBLE, 0.12 + 0.28 * Math.exp(-p[1] / 0.5)), [0, 0, 1]);
  // 炉の床（灰）
  G.rubble.plane([-ox, 0.012, zf], [2 * ox, 0, 0], [0, 0, zb - zf], 6, 3, (p) => tint([0.5, 0.47, 0.44], 0.55), [0, 1, 0]);
  // 胸壁の上（炉棚より上）・左右の側面
  G.wall.plane([x0, Hs, zf], [x1 - x0, 0, 0], [0, H - Hs, 0], nx(x1 - x0), nx(H - Hs), (p) => tint(STONE, dark(0.35, H - p[1], 0.9) * dark(0.25, p[1] - Hs, 0.3)), [0, 0, 1]);
  for (const x of [x0, x1]) {
    G.wall.plane([x, 0, f0], [0, 0, zf - f0], [0, H, 0], 4, nx(H), (p) => tint(STONE, wallShade(p[1], p[2], f0 - 0.6, zf + 0.6)), [Math.sign(x), 0, 0]);
  }
  // 炉床の敷石（手前に張り出す）と、炉棚・炉棚を支える持ち送り
  bevelBox(G.floor, [0, 0.04, zf + 0.3], [3.3, 0.08, 0.6], 0.02, tint(FLOOR, 0.82), { skipBottom: true });
  bevelBox(G.wall, [0, Hs + 0.09, zf + 0.12], [x1 - x0 + 0.34, 0.18, 0.34], 0.035, tint(STONE, 0.95));
  for (const x of [x0 + 0.12, x1 - 0.12]) {
    hexa(G.wall, [[x - 0.11, Hs - 0.42, zf], [x + 0.11, Hs - 0.42, zf], [x + 0.11, Hs - 0.42, zf + 0.04], [x - 0.11, Hs - 0.42, zf + 0.04],
      [x - 0.11, Hs, zf], [x + 0.11, Hs, zf], [x + 0.11, Hs, zf + 0.26], [x - 0.11, Hs, zf + 0.26]], tint(STONE, 0.85));
  }
  // 薪（3 本）と薪台（鉄）
  const logCol = (p) => tint(WOOD, 0.35);
  rod(G.wood, [-0.62, 0.14, zf - 0.32], [0.55, 0.13, zf - 0.42], 0.075, 9, logCol);
  rod(G.wood, [-0.45, 0.13, zf - 0.55], [0.66, 0.15, zf - 0.28], 0.07, 9, logCol);
  rod(G.wood, [-0.2, 0.24, zf - 0.5], [0.28, 0.26, zf - 0.3], 0.06, 9, logCol);
  for (const x of [-0.5, 0.5]) {
    rod(G.iron, [x, 0.0, zf - 0.08], [x, 0.36, zf - 0.08], 0.018, 6, IRON);
    rod(G.iron, [x, 0.08, zf - 0.08], [x, 0.08, zf - 0.6], 0.014, 6, IRON);
    G.iron && lathe(G.iron, [[0, 0.36], [0.035, 0.36], [0.04, 0.4], [0.02, 0.44], [0, 0.45]], 8, IRON, { cx: x, cz: zf - 0.08 });
  }

  // 炉棚の上の、金箔の「時の輪」の浮き彫り（旗の紋と同じ形。二重の輪・8 本の輻・8 つの珠・真ん中の飾り）
  {
    const cy = 3.0, zz = zf + 0.005, E = (r0, r1, d) => [[r0, 0], [r1, 0], [r1, d * 0.75], [r1 - 0.012, d], [r0 + 0.012, d], [r0, d * 0.75]];
    const ringRel = (r0, r1, d) => {   // 軸 Z の輪（Y の周りに回す lathe を、前へ向けて作る）
      const segs = 48;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * TAU, a1 = ((i + 1) / segs) * TAU;
        const P = (r, a, z) => [Math.sin(a) * r, cy + Math.cos(a) * r, zz + z];
        G.gold.flat([P(r0, a0, d), P(r1, a0, d), P(r1, a1, d), P(r0, a1, d)], GOLD, [0, 0, 1]);
        G.gold.flat([P(r1, a0, 0), P(r1, a1, 0), P(r1, a1, d), P(r1, a0, d)], tint(GOLD, 0.8), [Math.sin(a0 + 0.06), Math.cos(a0 + 0.06), 0]);
        G.gold.flat([P(r0, a0, 0), P(r0, a1, 0), P(r0, a1, d), P(r0, a0, d)], tint(GOLD, 0.6), [-Math.sin(a0 + 0.06), -Math.cos(a0 + 0.06), 0]);
      }
    };
    ringRel(0.46, 0.56, 0.07);
    ringRel(0.2, 0.25, 0.06);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, s2 = Math.sin(a), c2 = Math.cos(a), px = c2 * 0.025, py = -s2 * 0.025;
      hexa(G.gold, [[s2 * 0.24 - px, cy + c2 * 0.24 - py, zz], [s2 * 0.24 + px, cy + c2 * 0.24 + py, zz], [s2 * 0.47 + px, cy + c2 * 0.47 + py, zz], [s2 * 0.47 - px, cy + c2 * 0.47 - py, zz],
        [s2 * 0.24 - px, cy + c2 * 0.24 - py, zz + 0.045], [s2 * 0.24 + px, cy + c2 * 0.24 + py, zz + 0.045], [s2 * 0.47 + px, cy + c2 * 0.47 + py, zz + 0.045], [s2 * 0.47 - px, cy + c2 * 0.47 - py, zz + 0.045]], GOLD);
      const b2 = a + TAU / 16;
      lathe(G.gold, [[0, 0], [0.035, 0], [0.03, 0.025], [0, 0.035]], 10, GOLD, { cx: Math.sin(b2) * 0.66, cy: cy + Math.cos(b2) * 0.66, cz: zz, axis: 'z' });
    }
    lathe(G.gold, [[0, 0], [0.09, 0], [0.085, 0.04], [0.05, 0.07], [0, 0.08]], 16, GOLD, { cx: 0, cy, cz: zz, axis: 'z' });
  }

  // ---- 丸い柱（四角い台座・刳り形の根もと・少し細る柱身・柱頭と頂板） ----
  for (const [px, pz] of PILLARS) {
    bevelBox(G.wall, [px, 0.16, pz], [0.98, 0.32, 0.98], 0.04, (p) => tint(STONE, 0.8 * dark(0.35, p[1], 0.15)), { skipBottom: true });
    lathe(G.wall, [[0, 0.32], [0.44, 0.32], [0.44, 0.39], [0.4, 0.42], [0.42, 0.47], [0.35, 0.53], [0.31, 0.58], [0.29, 3.55], [0.33, 3.6], [0.33, 3.66], [0.3, 3.7], [0.44, 3.98], [0, 3.98]], 28,
      (k, p) => tint(STONE, 0.88 * dark(0.3, p[1] - 0.32, 0.3)), { cx: px, cz: pz });
    bevelBox(G.wall, [px, 4.08, pz], [1.0, 0.2, 1.0], 0.03, tint(STONE, 0.8));
    bevelBox(G.wall, [px, (4.18 + H) / 2, pz], [0.7, H - 4.18, 0.7], 0.03, tint(STONE, 0.7));
  }
  // 天井の梁（柱から柱へ）
  for (const pz of [-1.5, 2.6]) bevelBox(G.wood, [0, H - 0.25, pz], [W, 0.5, 0.42], 0.03, tint(WOOD, 0.55));

  // ---- 壇（2 段。角を面取り）と絨毯 ----
  const daisCol = (p) => tint(FLOOR, 0.95 * dark(0.3, p[1], 0.06));
  bevelBox(G.floor, [0, DAIS * 0.25, 0], [3.4, DAIS * 0.5, 2.6], 0.025, daisCol, { skipBottom: true });
  bevelBox(G.floor, [0, DAIS * 0.75, -0.1], [2.6, DAIS * 0.5, 2.0], 0.025, daisCol, { skipBottom: true });
  // 絨毯：手前から壇の前へ伸び、段の前の面を越えて壇の上の奥まで続く道（幅 1.56 m。絵が幅に 1 回）
  const RED = [0.78, 0.76, 0.76], cw = 0.78, CZ = 1.3 + 0.008;
  const cshade = (k) => (p) => tint(RED, k * dark(0.25, cw - Math.abs(p[0]), 0.08));
  G.carpet.plane([-cw, 0.008, 9.5], [2 * cw, 0, 0], [0, 0, CZ - 9.5], 4, 28, cshade(0.95), [0, 1, 0]);
  G.carpet.flat([[-cw, DAIS * 0.5 + 0.005, CZ], [cw, DAIS * 0.5 + 0.005, CZ], [cw, 0.008, CZ], [-cw, 0.008, CZ]], cshade(0.75), [0, 0, 1]);
  G.carpet.plane([-cw, DAIS * 0.5 + 0.005, CZ], [2 * cw, 0, 0], [0, 0, 0.9 + 0.006 - CZ], 4, 2, cshade(0.92), [0, 1, 0]);
  G.carpet.flat([[-cw, DAIS + 0.005, 0.906], [cw, DAIS + 0.005, 0.906], [cw, DAIS * 0.5 + 0.005, 0.906], [-cw, DAIS * 0.5 + 0.005, 0.906]], cshade(0.75), [0, 0, 1]);
  G.carpet.plane([-cw, DAIS + 0.005, 0.906], [2 * cw, 0, 0], [0, 0, -1.8], 4, 7, cshade(0.92), [0, 1, 0]);
  // ---- 壁の松明の受け（鉄の板・腕・籠） ----
  for (const t of TORCHES) {
    bevelBox(G.iron, [t.x, t.y - 0.1, f0 + 0.015], [0.13, 0.32, 0.03], 0.008, IRON);
    rod(G.iron, [t.x, t.y - 0.18, f0 + 0.02], [t.x, t.y - 0.02, f0 + 0.3], 0.016, 6, IRON);
    lathe(G.iron, [[0.045, 0.0], [0.07, 0.0], [0.085, 0.09], [0.07, 0.09], [0.055, 0.02]], 10, IRON, { cx: t.x, cy: t.y - 0.06, cz: f0 + 0.32 });
    // 松明の柄（木）：籠から上へ。先に巻いた布（黒く焦げている）
    rod(G.wood, [t.x, t.y - 0.22, f0 + 0.29], [t.x, t.y + 0.06, f0 + 0.39], 0.024, 7, tint(WOOD, 0.55));
    rod(G.rubble, [t.x, t.y + 0.02, f0 + 0.375], [t.x, t.y + 0.12, f0 + 0.405], 0.04, 8, [0.1, 0.08, 0.07]);
  }
  // ---- 火鉢（三本脚の鉄の台に、浅い鉢） ----
  for (const b of BRAZIERS) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.4, fx = Math.sin(a), fz = Math.cos(a);
      rod(G.iron, [b.x + fx * 0.34, 0, b.z + fz * 0.34], [b.x + fx * 0.16, 0.82, b.z + fz * 0.16], 0.022, 6, IRON);
      lathe(G.iron, [[0, 0], [0.05, 0], [0.04, 0.035], [0, 0.04]], 8, IRON, { cx: b.x + fx * 0.34, cz: b.z + fz * 0.34 });
    }
    lathe(G.iron, [[0, 0.76], [0.12, 0.78], [0.34, 0.86], [0.42, 0.96], [0.44, 0.99], [0.4, 0.99], [0.33, 0.9], [0.12, 0.84], [0, 0.83]], 22, IRON, { cx: b.x, cz: b.z });
    rod(G.iron, [b.x - 0.25, 0.42, b.z], [b.x + 0.25, 0.42, b.z], 0.014, 5, IRON);
  }
  // ---- 旗竿（鉄）と、旗を吊る輪 ----
  for (const x of BANNERS) {
    rod(G.iron, [x - 0.68, 4.08, f0 + 0.09], [x + 0.68, 4.08, f0 + 0.09], 0.018, 7, IRON);
    for (const s of [-1, 1]) {
      lathe(G.iron, [[0, -0.04], [0.03, -0.03], [0.035, 0.02], [0, 0.05]], 8, GOLD, { cx: x + s * 0.7, cy: 4.08, cz: f0 + 0.09 });
      rod(G.iron, [x + s * 0.62, 4.08, f0 + 0.09], [x + s * 0.62, 4.08, f0 + 0.02], 0.012, 5, IRON);
    }
  }

  const surfaces = {};
  for (const [k, g] of Object.entries(G)) if (g.I.length) surfaces[k] = { mesh: toMesh(device, g), tris: g.I.length / 3 };
  const carpetTex = carpetTexture(device);
  const banner = { tex: bannerTexture(device), meshes: BANNERS.map((x, i) => ({ x, mesh: bannerMesh(device, 1.12, 2.62, 0.42, 0.7 + i * 2.1) })), top: 4.06, z: f0 + 0.1 };
  return { surfaces, banner, carpetTex };
}
