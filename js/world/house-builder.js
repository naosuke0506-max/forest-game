// 家（中に入れる。一階建て・二階建て）を建てる。形の道具は world/build-kit.js、外の細部は world/house-parts.js、家具は world/furniture.js
//   一階：石の土台（上に張り出した段）。しっくいの壁に浮き出た木組み（隅柱・土台・桁・間柱・筋交い・貫）か、
//         石積みの壁（隅石・石のまぐさと窓台・石の扉の枠）。扉口（開いた板戸と鉄の帯・石の段 2 つ・一階建ては小さな庇）
//   二階建て：二階は前へ張り出す（根太の端と持ち送り）。木組みか板張り。階段の前に踊り場、階段の穴の周りに手すり
//   屋根：切妻（棟は奥行きの向き）。厚み・軒裏・瓦は破風板と垂木と棟瓦、わらぶきは太い棟。妻壁の木組みと小窓。暖炉の煙突
//   家具：ベッド・タンス・机と腰掛け・長持・棚・袋・暖炉。ベッドの下とタンスの中は隠れ場所
//   歩ける面（床・階段）は world/floors.js へ、ぶつかる物（壁・家具・手すり）は world/obstacles.js へ登録する
// 家の中の座標：x は横（右が +）、z は奥行き（前＝扉の側が +）、y は高さ
import { frame, box } from './build-kit.js';
import { Furniture } from './furniture.js';
import { createParts } from './house-parts.js';
export { SURFACES, builder, frame, box, obox, prism } from './build-kit.js';

const STORY = 2.9;    // 床から上の階の床まで（m）
const T = 0.22;       // 壁の厚さ
const FOUND = 0.45;   // 石の土台の高さ（一階の床の高さ）
const DOOR_W = 1.2, DOOR_H = 2.2;
const WIN_W = 0.8, WIN_H = 0.95, SILL = 0.95;
const STAIR_W = 1.1, STAIR_L = 3.6;   // 階段の幅と長さ（左の壁沿い。前から後ろへ上がる）
const LANDING = 1.0;  // 階段の下の踊り場（前の壁との間。扉から入って、ここから階段へ上がる）
const JETTY = 0.4;    // 二階が前へ張り出す長さ
const INSIDE = 0.78;  // 家の中の面は少し暗く（外の光が入りにくい感じ）
// 鎧戸の色（木のまま・緑・赤・青・茶）と、花箱の花の色
const SHUTTERS = [[0.82, 0.76, 0.7], [0.5, 0.64, 0.46], [0.74, 0.42, 0.34], [0.46, 0.56, 0.72], [0.6, 0.5, 0.4]];
const FLOWERS = [[[0.82, 0.12, 0.1], [0.95, 0.8, 0.2]], [[0.62, 0.28, 0.72], [0.95, 0.95, 0.9]], [[0.92, 0.45, 0.15], [0.85, 0.2, 0.32]]];

/**
 * 家を 1 軒建てる
 * @param {object} B builder()
 * @param {object} h { cx, cz, y0（地面の高さ）, yaw, w（横）, d（奥行き）, stories（1 か 2）, roof（'thatch' | 'tiles'）, wall（しっくいの色）,
 *                     rnd（村の乱数。家の並びと同じ流れ）, deco（飾りの乱数。家ごと） }
 * @param {object} reg 登録先 { floors, solid(x, z, r, range?), hides: [] }
 */
export function buildHouse(B, h, reg) {
  const { cx, cz, y0, yaw, w, d, stories, roof, rnd } = h;
  const deco = h.deco || rnd;
  const F = frame(cx, y0, cz, yaw);
  const P = createParts(B, F, yaw, deco);
  const iw = w / 2 - T, id = d / 2 - T;          // 中の広さの半分
  const twoStory = stories === 2;
  const J = twoStory ? JETTY : 0;
  const fy = [FOUND + 0.05, FOUND + 0.05 + STORY]; // 各階の床の高さ（土台からの高さ）
  const top = FOUND + stories * STORY;            // 壁の上
  const wallShade = h.wall || 1;
  const wpos = (x, z) => { const p = F.at(x, 0, z); return [p[0], p[2]]; };
  const range = (floor) => ({ y0: y0 + fy[floor] - 0.6, y1: y0 + fy[floor] + 0.7 });   // その階にいる人だけがぶつかる高さ
  /** 家の中の座標で箱を置く */
  const bx = (surf, x, y, z, bw, bd, bh, opt = {}, rot = 0) => { const p = F.at(x, 0, z); box(B, surf, p[0], y0 + y, p[2], bw, bd, bh, yaw + rot, opt); };

  // ===== 見た目の選び方（家ごと） =====
  const stoneGround = deco.next() < (twoStory ? 0.4 : 0.3);   // 一階が石積み
  const boardsUpper = twoStory && deco.next() < 0.22;          // 二階が板張り
  const tone = deco.next() < 0.6 ? 0.52 : 0.72;                // 木組みの色（濃い・明るい）
  const shutter = SHUTTERS[Math.floor(deco.next() * SHUTTERS.length)];
  const flowers = deco.next() < 0.45 ? FLOWERS[Math.floor(deco.next() * FLOWERS.length)] : null;
  const kindOf = (s) => (s === 0 ? (stoneGround ? 'stone' : 'timber') : boardsUpper ? 'boards' : 'timber');
  const zf = (s) => d / 2 + (s >= 1 ? J : 0);   // その階の前の面（二階は張り出す）
  const idF = id + J;                            // 一番上の階の前の内側（二階建ては張り出した分だけ前）

  // ===== 土台・床・扉の前の段 =====
  bx('stone', 0, -0.6, 0, w + 0.24, d + 0.24, FOUND + 0.46, { grad: [0.78, 0.95] });
  bx('stone', 0, FOUND - 0.14, 0, w + 0.36, d + 0.36, 0.14, { shade: 1.02, bottom: true });   // 土台の上の張り出した段
  bx('wood', 0, FOUND, 0, iw * 2, id * 2, 0.05, { shade: INSIDE });              // 一階の板の床
  const zs = d / 2 + 0.18;
  bx('stone', 0, -0.6, zs + 0.2, DOOR_W + 0.5, 0.4, 0.6 + 0.32, { shade: 0.98 });
  bx('stone', 0, -0.6, zs + 0.6, DOOR_W + 0.8, 0.4, 0.6 + 0.16, { shade: 0.92 });
  { const [x, z] = wpos(0, zs + 0.2); reg.floors.addFloor({ cx: x, cz: z, yaw, hw: (DOOR_W + 0.5) / 2, hd: 0.2, y: y0 + 0.32 }); }
  { const [x, z] = wpos(0, zs + 0.6); reg.floors.addFloor({ cx: x, cz: z, yaw, hw: (DOOR_W + 0.8) / 2, hd: 0.2, y: y0 + 0.16 }); }
  { const [x, z] = wpos(0, 0); reg.floors.addFloor({ cx: x, cz: z, yaw, hw: iw + 0.02, hd: id + 0.02, y: y0 + fy[0] }); }
  // 扉口の床（壁の厚みと土台の張り出しの所）
  { const z0 = d / 2 - T - 0.05, [x, z] = wpos(0, (z0 + zs) / 2); reg.floors.addFloor({ cx: x, cz: z, yaw, hw: DOOR_W / 2, hd: (zs - z0) / 2, y: y0 + fy[0] }); }

  // ===== 壁：開口（扉・窓）を避けて箱を並べる =====
  // 1 本の壁：axis 'x'（前後の壁）・'z'（横の壁）。at：もう一方の軸の位置、mid・len：壁の真ん中と長さ。開口 [{ c（家の真ん中から）, w, y, h }]
  function wall(axis, at, mid, len, story, openings, surf, shade, grad) {
    const y = FOUND + story * STORY, H = STORY;
    const g = (py) => grad[0] + ((grad[1] - grad[0]) * (py - y)) / H;
    const piece = (c, l, py, ph) => {
      if (l <= 0.01 || ph <= 0.01) return;
      const o = { shade, grad: [g(py), g(py + ph)] };
      if (axis === 'x') bx(surf, mid + c, py, at, l, T, ph, o);
      else bx(surf, at, py, mid + c, T, l, ph, o);
    };
    const ops = openings.map((o) => ({ ...o, c: o.c - mid })).sort((a, b) => a.c - b.c);
    let s = -len / 2;
    for (const o of ops) {
      piece((s + o.c - o.w / 2) / 2, o.c - o.w / 2 - s, y, H);                   // 開口の手前の全部の高さ
      piece(o.c, o.w, y, o.y);                                                   // 開口の下
      piece(o.c, o.w, y + o.y + o.h, H - o.y - o.h);                             // 開口の上
      s = o.c + o.w / 2;
    }
    piece((s + len / 2) / 2, len / 2 - s, y, H);
  }
  const win = (c) => ({ c, w: WIN_W, y: SILL, h: WIN_H });
  const isWin = (o) => o.h === WIN_H;
  for (let s = 0; s < stories; s++) {
    const kind = kindOf(s);
    const surf = kind === 'stone' ? 'stone' : kind === 'boards' ? 'wood' : 'plaster';
    const shade = kind === 'stone' ? 0.9 : kind === 'boards' ? tone * 1.3 : wallShade;
    const grad = s === 0 ? [0.78, 1] : [0.92, 1];
    const yb = FOUND + s * STORY, zF = zf(s);
    // 前の壁：一階は扉口（広い家は横に窓も）、二階は窓 2 つ。後ろの壁：窓 1 つ（二階建ての一階は、タンスと重ならない右寄り）
    const front = s === 0 ? [{ c: 0, w: DOOR_W, y: 0, h: DOOR_H }, ...(w >= 6.4 ? [win(w * 0.3)] : [])] : [win(-w * 0.24), win(w * 0.24)];
    const back = [win(twoStory && s === 0 ? w * 0.18 : 0)];
    // 左右の壁：窓 1〜2 つ。二階建ての一階の左（階段の横）は窓なし。一階建ての左の前は暖炉なので窓なし
    const sideWins = (side) => {
      if (side < 0 && twoStory && s === 0) return [];
      if (d >= 7.2) return side < 0 && !twoStory ? [win(-d * 0.22)] : [win(-d * 0.22), win(d * 0.22)];
      return [win(0)];
    };
    wall('x', zF - T / 2, 0, w, s, front, surf, shade, grad);
    wall('x', -d / 2 + T / 2, 0, w, s, back, surf, shade, grad);
    const zIn0 = -d / 2 + T, zIn1 = zF - T;   // 横の壁は、前と後ろの壁の間
    for (const side of [-1, 1]) wall('z', side * (w / 2 - T / 2), (zIn0 + zIn1) / 2, zIn1 - zIn0, s, sideWins(side), surf, shade, grad);

    // 外の細部（木組み・隅石・窓・扉）
    const fFront = { o: [0, yb, zF], u: [1, 0, 0], n: [0, 0, 1] };
    const fBack = { o: [0, yb, -d / 2], u: [1, 0, 0], n: [0, 0, -1] };
    const fSide = (sd) => ({ o: [(sd * w) / 2, yb, 0], u: [0, 0, 1], n: [sd, 0, 0] });
    const railV = SILL - 0.07;
    if (kind === 'timber') {
      P.framing(fFront, -w / 2, w / 2, STORY, front, tone, { fancy: true, railV });
      P.framing(fBack, -w / 2, w / 2, STORY, back, tone, { railV });
      for (const sd of [-1, 1]) P.framing(fSide(sd), -d / 2, zF, STORY, sideWins(sd), tone, { railV });
      P.cornerPosts(w, zF, -d / 2, yb, STORY, tone);
    } else if (kind === 'boards') {
      for (const [fc, a, b] of [[fFront, -w / 2, w / 2], [fBack, -w / 2, w / 2], [fSide(-1), -d / 2, zF], [fSide(1), -d / 2, zF]]) {
        P.beam(fc, a, 0.1, b, 0.1, 0.2, 0.1, tone);
        P.beam(fc, a, STORY - 0.1, b, STORY - 0.1, 0.2, 0.1, tone);
      }
      P.cornerPosts(w, zF, -d / 2, yb, STORY, tone);
    } else {
      P.quoins(w, zF, -d / 2, yb, STORY, 1.05);
    }
    for (const o of front) if (isWin(o)) P.windowDress(fFront, o.c, SILL, WIN_W, WIN_H, T, kind, tone, { shutter, flowers });
    for (const o of back) P.windowDress(fBack, o.c, SILL, WIN_W, WIN_H, T, kind, tone, { shutter });
    for (const sd of [-1, 1]) for (const o of sideWins(sd)) P.windowDress(fSide(sd), o.c, SILL, WIN_W, WIN_H, T, kind, tone, { shutter });
    if (s === 0) {
      P.doorDress(fFront, DOOR_W, DOOR_H, T, kind, tone);
      if (!twoStory) P.canopy(fFront, DOOR_W + 1.0, 0.85, DOOR_H + 0.62, roof, tone);
    }
  }
  if (twoStory) P.jetty(w, d, J, FOUND + STORY, tone);

  // 開いた扉（扉口の内側で、壁に沿って開いている）と鉄の帯
  bx('gate', DOOR_W / 2 + 0.05, FOUND + 0.05, d / 2 - T - 0.55, 0.06, 1.1, DOOR_H - 0.05, {}, 0);
  P.doorStraps(DOOR_W / 2 + 0.05 - 0.037, FOUND + 0.05, d / 2 - T - 0.55, 1.1, DOOR_H - 0.05);
  for (const z of [d / 2 - T - 0.3, d / 2 - T - 0.8]) { const [x, zz] = wpos(DOOR_W / 2 + 0.05, z); reg.solid(x, zz, 0.1, range(0)); }
  // 当たり判定：壁に沿って円を並べる（扉口は空ける）。二階建ては、一階の前の壁と、張り出した二階の前の壁を高さで分ける
  const line = (ax, az, bx2, bz2, rg) => {
    const [x0, z0] = wpos(ax, az), [x1, z1] = wpos(bx2, bz2);
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.25);
    for (let i = 0; i <= n; i++) reg.solid(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, 0.22, rg);
  };
  const ex = w / 2 - T / 2, ez = d / 2 - T / 2;
  const low = twoStory ? { y1: y0 + fy[0] + 1.2 } : undefined;
  line(-ex, ez, -DOOR_W / 2 - 0.25, ez, low);
  line(DOOR_W / 2 + 0.25, ez, ex, ez, low);
  line(-ex, -ez, ex, -ez);
  line(-ex, -ez, -ex, ez);
  line(ex, -ez, ex, ez);
  if (twoStory) {
    const up = { y0: y0 + fy[1] - 0.6 };
    line(-ex, ez + J, ex, ez + J, up);
    line(-ex, ez, -ex, ez + J, up);
    line(ex, ez, ex, ez + J, up);
  }

  // ===== 二階：床（階段の穴を空ける）・階段・手すり =====
  const sx0 = -iw, sx1 = -iw + STAIR_W;           // 階段の横の範囲（左の壁沿い）
  const zb = id - LANDING, zt = zb - STAIR_L;     // 階段の下の端（前）と上の端（後ろ）
  if (twoStory) {
    const y2 = FOUND + STORY;                     // 二階の床の下の面
    // 床の板（穴の右側は奥行き全部、穴の列は階段の上の端より後ろと、踊り場の上）
    bx('wood', (sx1 + iw) / 2, y2 - 0.12, (idF - id) / 2, iw - sx1, id + idF, 0.17, { bottom: true, shade: INSIDE });
    bx('wood', (sx0 + sx1) / 2, y2 - 0.12, (zt - id) / 2, STAIR_W, zt + id, 0.17, { bottom: true, shade: INSIDE });
    bx('wood', (sx0 + sx1) / 2, y2 - 0.12, (zb + idF) / 2, STAIR_W, idF - zb, 0.17, { bottom: true, shade: INSIDE });
    { const [x, z] = wpos((sx1 + iw) / 2, (idF - id) / 2); reg.floors.addFloor({ cx: x, cz: z, yaw, hw: (iw - sx1) / 2 + 0.02, hd: (id + idF) / 2 + 0.02, y: y0 + fy[1] }); }
    { const [x, z] = wpos((sx0 + sx1) / 2, (zt - id) / 2); reg.floors.addFloor({ cx: x, cz: z, yaw, hw: STAIR_W / 2 + 0.02, hd: (zt + id) / 2 + 0.02, y: y0 + fy[1] }); }
    { const [x, z] = wpos((sx0 + sx1) / 2, (zb + idF) / 2); reg.floors.addFloor({ cx: x, cz: z, yaw, hw: STAIR_W / 2 + 0.02, hd: (idF - zb) / 2 + 0.02, y: y0 + fy[1] }); }
    // 一階の天井の根太（階段の穴の所は、穴の右から）と、穴の縁の木
    for (let z = -id + 0.45; z <= idF - 0.3; z += 0.75) {
      const xa = z > zt - 0.1 && z < zb + 0.1 ? sx1 : -iw;
      bx('wood', (xa + iw) / 2, y2 - 0.28, z, iw - xa, 0.14, 0.16, { shade: tone * 1.05, bottom: true, top: false });
    }
    bx('wood', sx1 + 0.07, y2 - 0.28, (zb + zt) / 2, 0.14, STAIR_L, 0.16, { shade: tone * 1.05, bottom: true, top: false });
    // 階段：段を 13 段（下は詰めた箱。段の下へは入れない）。開いた側に側板と手すり
    const N = 13;
    for (let k = 0; k < N; k++) {
      const z = zb - (k + 0.5) * (STAIR_L / N);
      bx('wood', (sx0 + sx1) / 2, FOUND + 0.05, z, STAIR_W, STAIR_L / N + 0.01, ((k + 1) * STORY) / N, { shade: k % 2 ? INSIDE : INSIDE * 0.92 });
    }
    { const fc = { o: [sx1, FOUND + 0.05, 0], u: [0, 0, -1], n: [1, 0, 0] };
      P.beam(fc, -zb, 0.05, -zt, STORY + 0.05, 0.34, 0.05, tone, { ends: true });                 // 側板
      P.beam(fc, -zb + 0.15, 1.0, -zt, STORY + 0.95, 0.07, 0.07, tone, { ends: true, at: 0.02 });   // 手すり
      for (let k = 1; k <= 3; k++) {
        const zz = zb - (k * STAIR_L) / 4, hy = (STORY * (zb - zz)) / STAIR_L;
        bx('wood', sx1 + 0.06, FOUND + 0.05 + hy, zz, 0.06, 0.06, 1.0, { shade: tone });
      }
      bx('wood', sx1 + 0.06, FOUND + 0.05, zb - 0.05, 0.12, 0.12, 1.15, { shade: tone }); }        // 親柱
    { const [x, z] = wpos((sx0 + sx1) / 2, (zb + zt) / 2); reg.floors.addRamp({ cx: x, cz: z, yaw, hw: STAIR_W / 2, hd: STAIR_L / 2, y0: y0 + fy[1], y1: y0 + fy[0] }); }
    // 階段の横と後ろ：一階にいる人は、階段の高い所の横や後ろから入れない（段の下は詰めた箱）
    for (let z = zb - 0.9; z >= zt - 0.05; z -= 0.3) { const [x, zz] = wpos(sx1 + 0.12, z); reg.solid(x, zz, 0.15, range(0)); }
    for (let x = sx0 + 0.15; x <= sx1 + 0.1; x += 0.3) { const [xx, zz] = wpos(x, zt - 0.15); reg.solid(xx, zz, 0.15, range(0)); }
    // 二階の手すり：穴の右側と前側（上と下の横木と、柱）
    const ry = FOUND + STORY + 0.05;
    for (const hh of [0.85, 0.12]) {
      bx('wood', sx1 + 0.04, ry + hh, (zb + zt) / 2, 0.08, STAIR_L, 0.08, { shade: tone });
      bx('wood', (sx0 + sx1) / 2, ry + hh, zb + 0.04, STAIR_W, 0.08, 0.08, { shade: tone });
    }
    for (let z = zt + 0.6; z <= zb + 0.05; z += 0.6) bx('wood', sx1 + 0.04, ry, z, 0.07, 0.07, 0.85, { shade: tone });
    for (let z = zt + 0.3; z <= zb; z += 0.3) { const [x, zz] = wpos(sx1 + 0.17, z); reg.solid(x, zz, 0.15, range(1)); }
    for (let x = sx0 + 0.15; x <= sx1 + 0.1; x += 0.3) { const [xx, zz] = wpos(x, zb + 0.17); reg.solid(xx, zz, 0.15, range(1)); }
  }

  // ===== 屋根（切妻。棟は奥行きの向き）と妻壁 =====
  const rh = w * (0.55 + rnd.next() * 0.2);       // 棟の高さ（急な屋根）
  const zFr = zf(stories - 1);
  const R = P.roof({ w, zF: zFr + 0.42, zB: -d / 2 - 0.42, top, rh, over: 0.5, t: roof === 'thatch' ? 0.34 : 0.13, surf: roof, tone });
  const kindTop = kindOf(stories - 1);
  P.gable({ o: [0, top, zFr], u: [1, 0, 0], n: [0, 0, 1] }, w, rh, T, kindTop, wallShade, tone, { window: true });
  P.gable({ o: [0, top, -d / 2], u: [1, 0, 0], n: [0, 0, -1] }, w, rh, T, kindTop, wallShade, tone, { window: deco.next() < 0.5 });
  // 一番上の階の中：梁と棟木（家の中から見上げる）
  for (let z = -d / 2 + 1.3; z <= zFr - 1.1; z += 1.9) bx('wood', 0, top - 0.2, z, iw * 2, 0.16, 0.2, { shade: tone, bottom: true });
  bx('wood', 0, top + rh - 0.26, (zFr - d / 2) / 2, 0.16, zFr + d / 2 - 0.1, 0.2, { shade: tone * 0.9, bottom: true });
  // 煙突は屋根から 1m ほど上へ（二階建ては右の壁、一階建ては左の壁の暖炉から）
  const chimneyTop = Math.max(top + rh * 0.5, R.topAt(iw - 0.27) + 0.95);

  // ===== 家具 =====
  // 隠れ場所への道順（bot が使う）：扉の外 → 扉の内 →（二階なら）階段の下 → 階段の上 → 穴の後ろを右へ
  const W2 = (x, z) => { const p = F.at(x, 0, z); return { x: p[0], z: p[2] }; };
  // 一階建ては、部屋の真ん中の通り道を奥まで進んでから左右へ（机を避ける）
  const routes = [
    twoStory ? [W2(0, d / 2 + 1.3), W2(0, id - 0.9)] : [W2(0, d / 2 + 1.3), W2(0, id - 0.9), W2(0, -id + 1.55)],
    [W2(0, d / 2 + 1.3), W2(0, id - 0.9), W2((sx0 + sx1) / 2, zb + 0.45), W2((sx0 + sx1) / 2, zt - 0.45), W2(sx1 + 0.75, zt - 0.45)],
  ];
  const furniture = new Furniture(B, F, y0, yaw, reg, range, routes);
  if (twoStory) {
    const g = fy[0], u = fy[1];
    // 一階：暖炉（右の壁）、机と腰掛け、長持、タンス（後ろの壁）、袋（後ろの右の隅。階段の前は空ける）
    furniture.hearth(iw - 0.32, -0.3, g, chimneyTop, -90);
    furniture.table(Math.min(iw - 1.1, 0.6), 0.1, g, rnd);
    furniture.chest(iw - 0.32, id - 1.1, g, -90);
    furniture.wardrobe(sx1 + 0.75, -id + 0.3, g, 0);
    furniture.sacks(iw - 0.75, -id + 0.45, g, rnd);
    // 二階：ベッド（後ろの壁の右）、タンス（右の壁の前）、長持（ベッドの足もと）。広い家はもう 1 つベッド
    furniture.bed(iw - 0.62, -id + 1.08, u, 0, rnd);
    furniture.wardrobe(iw - 0.3, idF - 0.8, u, -90);
    furniture.chest(iw - 1.3, -id + 2.4, u, 0);
    if (w >= 7) furniture.bed(-iw + 1.08, -id + 0.6, u, 90, rnd);
    furniture.shelf(0, idF - 0.12, u + 1.2, 180);
  } else {
    const g = fy[0];
    furniture.bed(-iw + 0.62, -id + 1.08, g, 0, rnd);
    furniture.chest(-iw + 0.62, -id + 2.45, g, 0);
    furniture.wardrobe(iw - 0.3, -id + 0.8, g, -90);
    furniture.table(iw - 1.05, id * 0.25, g, rnd);   // 右の壁寄り（扉から奥への通り道を空ける）
    furniture.shelf(iw - 1.3, -id + 0.12, g + 1.3, 0);
    furniture.sacks(iw - 0.7, id - 0.55, g, rnd);
    furniture.hearth(-iw + 0.32, id - 1.0, g, chimneyTop, 90);
  }
  return { top: top + rh };
}
