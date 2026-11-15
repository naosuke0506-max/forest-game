// 洞窟の配置と形（計算だけ。PlayCanvas に依存しない）。world/landform.js が作り、world/cave.js が形にする。
// 利用者の指示（2026-11-14）：
//   「左上の入り口から、マップの地下を洞窟が占領しています。全て洞窟というわけではないですが、入り組んでいます」
//   「洞窟内にはとても広い空洞なども作ってください」「洞窟内から外が見えたりする」（→ 見えないように）
//   出入り口は北西（風穴の口 2 つ）のほかに、遠くに 3 か所（利用者が選んだ「北西＋遠くに出口も」）
// 作り方：
//   ・通り道（幅と天井の高さを持つ線）と、広間（円）を、地図の上に並べる。上下に重ならないように置く（地図の 1 点に洞窟は 1 つだけ）
//   ・床の高さは、上の地面（川床も）より「岩の厚み＋天井の高さ」だけ低い所まで下げ、坂が急になりすぎないように決める
//   ・口：地面を掘った切り通し（屋根なし）の突き当たりの岩の面に開く。口の後ろは岩山（口ごとの小さな岩山か、風穴の大きな岩山）
//   ・形は 0.8 m の升目に焼いておく（壁からの距離・床・天井）。見た目（world/cave.js）も、当たり判定も、同じ升目から作る
import { fbm, createRandom } from '../core/random.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** 数（m）。Claude の仮の値 */
export const CAVE = {
  step: 1.5,        // 通り道を区切る長さ
  cell: 0.8,        // 形を焼く升目
  cover: 3.5,       // 天井の上に残す岩の厚み（地面・川床まで）
  coverMouth: 1.3,  // 口のすぐ後ろで残す岩の厚み
  grade: 0.25,      // 床の坂の一番急な勾配（14 度）
  wallH: 2.3,       // 壁がまっすぐ立ち上がる高さ（その上は丸い天井）
  hill: 13,         // 風穴の岩山の高さ
  drop: 4.9,        // 平らな所の口：切り通しが地面から下る深さ
};

/**
 * 口のまわりの、細かく作り直す地面の広さ（口の枠で。m）：front 切り通しの外の端より外へ、back 口の面より奥へ、side 通り道の壁より横へ。
 * 地面の網を抜く所（holeAt）より、網 1 升の対角（3.7 m）より広く取る（抜いた升を、細かい地面がすっかり覆うように）
 */
export const PATCH = { front: 5.5, back: 7.5, side: 13 };

// ---- 配置（地図の上の点。北は -Z、東は +X）。y は床の高さの目安（実際は settle が上の地面を見て決め直す） ----
// r：広間の半径、h：天井の高さ、name：広間の名前
const NODES = {
  // 風穴（北西の岩山の中。上の段）
  A:  { x: -104.5, z: -49.5 },                         // 口 A（道の行き止まり）
  U1: { x: -110, z: -57, r: 4.6, h: 4.4, y: -1 },      // 入ってすぐの間（ここから地下へ下りる道が分かれる）
  U2: { x: -120, z: -73, y: 2 },
  U3: { x: -125, z: -92, y: 7 },
  B:  { x: -131, z: -104 },                            // 口 B（北西の山の側）
  UD: { x: -147, z: -53, r: 3.6, h: 4.2, y: 2.5 },     // 上の段の行き止まりの間
  // 地下
  H:  { x: -38, z: 12, r: 21, h: 13, y: -22, name: '大空洞' },
  N1: { x: -26, z: -20, r: 5, h: 5, y: -17 },
  N2: { x: -2, z: -50, y: -17 },
  NC: { x: 28, z: -76, r: 11, h: 7.5, y: -15 },
  F:  { x: 3, z: -148 },                               // 口：滝のそば（滝壺の東の岸。北の山のふもとへ入る）
  EC: { x: 94, z: 24, r: 12, h: 8, y: -15 },
  E:  { x: 127, z: 56 },                               // 口：東の大草原の岩場
  S1: { x: -30, z: 46, y: -16 },
  S2: { x: -36, z: 80, y: -15 },
  SC: { x: -12, z: 110, r: 14, h: 9, y: -16 },
  S:  { x: -22, z: 149 },                              // 口：南の山のふもと
  C1: { x: -8, z: 22, y: -17 },
  C2: { x: 20, z: 30, y: -17 },
  C3: { x: 54, z: 34, y: -17 },
  // 行き止まりの間
  D1: { x: -66, z: 66, r: 6, h: 5, y: -14 },
  D2: { x: -8, z: -88, r: 5, h: 4.6, y: -15 },
  D3: { x: 128, z: -2, r: 6, h: 5, y: -13 },
  D4: { x: 2, z: 58, r: 6, h: 5, y: -16 },
  D5: { x: -90, z: 28, r: 7, h: 6, y: -15 },
  D5b: { x: -104, z: 46, r: 4, h: 4, y: -13 },
  D6: { x: 64, z: -8, r: 5, h: 4.6, y: -16 },
  D7: { x: -58, z: 128, r: 5, h: 4.6, y: -13 },
};
// 通り道：pts は通る所（広間・口の名前か [x, z]）、w は幅、h は天井の高さ、hill：上に風穴の岩山を盛る
const PASSAGES = [
  // 風穴（上の段）：口 A → 入ってすぐの間 → 口 B。行き止まり 1 つ
  { id: 'up-a', pts: ['A', 'U1'], w: 3.4, h: 3.6, hill: true },
  { id: 'up-main', pts: ['U1', [-116, -63], 'U2', [-123, -84], 'U3', [-128, -99], 'B'], w: 3.4, h: 3.6, hill: true },
  { id: 'up-dead', pts: ['U2', [-131, -68], [-140, -61], 'UD'], w: 2.5, h: 3.0, hill: true },
  // 地下へ下りる道：入ってすぐの間 → 大空洞
  { id: 'descent', pts: ['U1', [-98, -66], [-84, -62], [-72, -46], [-66, -26], [-58, -6], 'H'], w: 3.2, h: 3.6, hillTo: 2 },
  // 北：大空洞 → 川の下 → 北の間 → 滝のそばの口
  { id: 'north', pts: ['H', 'N1', [-14, -34], 'N2', [14, -62], 'NC'], w: 3.2, h: 3.6 },
  { id: 'falls', pts: ['NC', [31, -104], [35, -130], [29, -150], [15, -159], 'F'], w: 3.0, h: 3.5 },
  // 東：北の間 → 野邑の下 → 東の間 → 東の口
  { id: 'east', pts: ['NC', [58, -60], [82, -34], [96, -6], 'EC'], w: 3.2, h: 3.6 },
  { id: 'east-out', pts: ['EC', [110, 42], 'E'], w: 3.0, h: 3.5 },
  // 南：大空洞 → 南の間 → 南の口
  { id: 'south', pts: ['H', 'S1', 'S2', 'SC'], w: 3.2, h: 3.6 },
  { id: 'south-out', pts: ['SC', [-17, 132], 'S'], w: 3.0, h: 3.5 },
  // 真ん中：大空洞 → 広い川の下 → 東の間
  { id: 'mid', pts: ['H', 'C1', 'C2', 'C3', [76, 30], 'EC'], w: 3.0, h: 3.4 },
  // 輪：南の間 → 川の下 → 東の間／北の脇道
  { id: 'ring', pts: ['SC', [20, 108], [48, 90], [70, 64], 'EC'], w: 2.8, h: 3.3 },
  { id: 'link', pts: ['N1', [-13, 0], 'C1'], w: 2.6, h: 3.1 },
  // 行き止まり
  { id: 'dead1', pts: ['S1', [-50, 56], 'D1'], w: 2.5, h: 3.0 },
  { id: 'dead2', pts: ['N2', [-4, -72], 'D2'], w: 2.5, h: 3.0 },
  { id: 'dead3', pts: ['EC', [114, 10], 'D3'], w: 2.5, h: 3.0 },
  { id: 'dead4', pts: ['C1', [-2, 42], 'D4'], w: 2.5, h: 3.0 },
  { id: 'dead5', pts: ['H', [-66, 18], 'D5', 'D5b'], w: 2.6, h: 3.1 },
  { id: 'dead6', pts: ['C3', [60, 12], 'D6'], w: 2.5, h: 3.0 },
  { id: 'dead7', pts: ['SC', [-38, 120], 'D7'], w: 2.5, h: 3.0 },
];
// 口：from は外から来る所（切り通しの始まり）、drop は切り通しが下る深さ、mound は口の後ろの岩山 { h 高さ, r 半径 }（風穴は大きな岩山があるので無し）
const MOUTHS = {
  A: { from: [-98, -42], drop: 0, name: '風穴' },
  B: { from: [-134.5, -110.5], drop: 0, name: '風穴' },
  F: { from: [-4.5, -141.5], drop: 0.7, mound: { h: 5, r: 15 }, name: '瀧穴' },
  E: { from: [141, 68], drop: CAVE.drop, mound: { h: 4, r: 15 }, name: '野穴' },
  S: { from: [-27, 163], drop: CAVE.drop, mound: { h: 4, r: 15 }, name: '南穴' },
};
// 大空洞の中に立つ岩の柱（天井まで届く）
// 通り道の入る所（北西・北東・東・南・西）を避けて置く
const PILLARS = [{ x: -47, z: 19, r: 2.3 }, { x: -29, z: 7, r: 1.9 }, { x: -41, z: 25, r: 1.6 }, { x: -50, z: 9, r: 1.4 }];

/** なめらかな線（Catmull-Rom）で、step m ごとに区切る */
function spline(pts, step) {
  const out = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const c = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * 洞窟の配置を作る。地面の高さが要る所（床の高さ・切り通し・升目）は、後で settle(ground) を呼んでから使える
 * @param {number} seed 種
 */
export function createCavePlan(seed) {
  const rnd = createRandom(seed + 8642);

  // ---- 1. 口の向き（外 → 口）と、口の枠（s：口から奥へ、l：横） ----
  const mouths = Object.entries(MOUTHS).map(([id, m]) => {
    const n = NODES[id], dx = n.x - m.from[0], dz = n.z - m.from[1], L = Math.hypot(dx, dz);
    return { id, name: m.name, x: n.x, z: n.z, from: m.from, len: L, in: [dx / L, dz / L], drop: m.drop, mound: m.mound || null, hw: 1.7, h: 3.6, y: 0, yFrom: 0 };
  });
  const mouthOf = Object.fromEntries(mouths.map((m) => [m.id, m]));
  /** 口の枠での座標：s（口の面から奥へ +）、l（横。右が +） */
  const frame = (m, x, z) => { const dx = x - m.x, dz = z - m.z; return [dx * m.in[0] + dz * m.in[1], dx * m.in[1] - dz * m.in[0]]; };

  // ---- 2. 通り道を区切る。広間・口・分かれ目の点は、通り道どうしで同じ点を使う ----
  const samples = [];           // { x, z, hw, h, y, lim, fixed, adj: [[相手, 長さ]], node, pid, open, dist }
  const nodeSample = {};
  const getNode = (id, hw, h) => {
    if (!nodeSample[id]) {
      const n = NODES[id];
      nodeSample[id] = { x: n.x, z: n.z, hw, h, y: n.y ?? 0, fixed: !!mouthOf[id], adj: [], node: id, open: 0 };
      samples.push(nodeSample[id]);
    } else { nodeSample[id].hw = Math.max(nodeSample[id].hw, hw); nodeSample[id].h = Math.max(nodeSample[id].h, h); }
    return nodeSample[id];
  };
  const link = (a, b) => { const L = Math.hypot(a.x - b.x, a.z - b.z); a.adj.push([b, L]); b.adj.push([a, L]); };
  const passages = PASSAGES.map((p) => {
    // 通る点：口から入る通り道は、口の向きにまっすぐ 3.5 m 入ってから曲がる（口の面に対して斜めにならないように）
    const ctrl = [];
    p.pts.forEach((q, i) => {
      if (typeof q === 'string') {
        const n = NODES[q], m = mouthOf[q];
        if (m && i > 0) ctrl.push([n.x - m.in[0] * -3.5, n.z - m.in[1] * -3.5]);
        ctrl.push([n.x, n.z]);
        if (m && i === 0) ctrl.push([n.x + m.in[0] * 3.5, n.z + m.in[1] * 3.5]);
      } else ctrl.push([q[0] + (rnd.next() - 0.5) * 3, q[1] + (rnd.next() - 0.5) * 3]);   // 途中の点は少しずらす（まっすぐになりすぎないように）
    });
    const P = spline(ctrl, CAVE.step);
    const first = p.pts[0], last = p.pts[p.pts.length - 1];
    const hw = p.w / 2;
    const list = P.map(([x, z], i) => {
      if (i === 0 && typeof first === 'string') return getNode(first, hw, p.h);
      if (i === P.length - 1 && typeof last === 'string') return getNode(last, hw, p.h);
      // 幅と天井は、場所ごとに少し変える（同じ太さの管にならないように）
      const k = 0.85 + 0.4 * fbm(x * 0.11, z * 0.11, seed + 771);
      const s = { x, z, hw: hw * k, h: p.h * (0.9 + 0.25 * fbm(x * 0.09 + 40, z * 0.09, seed + 773)), y: 0, fixed: false, adj: [], node: null, pid: p.id, open: 0 };
      samples.push(s);
      return s;
    });
    // 途中で通る広間（名前の点）は、その点に一番近い区切りを広間の点に置き換える
    p.pts.slice(1, -1).forEach((q) => {
      if (typeof q !== 'string') return;
      const n = NODES[q];
      let b = 1, bd = Infinity;
      for (let i = 1; i < list.length - 1; i++) { const d = Math.hypot(list[i].x - n.x, list[i].z - n.z); if (d < bd) { bd = d; b = i; } }
      const old = list[b];
      samples.splice(samples.indexOf(old), 1);
      list[b] = getNode(q, hw, p.h);
    });
    for (let i = 0; i < list.length - 1; i++) link(list[i], list[i + 1]);
    return { ...p, samples: list };
  });
  // 広間の点：半径と天井は広間の大きさ
  for (const [id, n] of Object.entries(NODES)) if (nodeSample[id] && n.r) { nodeSample[id].room = { r: n.r, h: n.h }; }
  for (const m of mouths) { const s = nodeSample[m.id]; m.hw = s.hw; m.h = s.h; }

  // ---- 3. 岩山：風穴の大きな岩山（上の段の通り道の上）と、口ごとの小さな岩山。口の前（切り通しの通る所）には盛らない ----
  const hillSegs = [];   // [ax, az, bx, bz, 高さの倍率]
  for (const p of passages) {
    if (!p.hill && !p.hillTo) continue;
    const n = p.hillTo ? Math.ceil(p.samples.length * 0.16) : p.samples.length - 1;
    for (let i = 0; i < n; i++) {
      const a = p.samples[i], b = p.samples[i + 1];
      hillSegs.push([a.x, a.z, b.x, b.z, p.hillTo ? 1 - i / n : 1]);
    }
  }
  const rough = (x, z) => 0.78 + 0.44 * fbm(x * 0.07, z * 0.07, seed + 611);
  /** 岩山の高さ（地面に足す分） */
  function hill(x, z) {
    let h = 0;
    for (const [ax, az, bx, bz, k] of hillSegs) {
      if (Math.abs(x - (ax + bx) / 2) > 24 || Math.abs(z - (az + bz) / 2) > 24) continue;
      const dx = bx - ax, dz = bz - az, u = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const e = Math.hypot(ax + dx * u - x, az + dz * u - z) - 1.7;
      if (e > 20) continue;
      h = Math.max(h, (CAVE.hill * (1 - smooth(6, 20, e)) + 2.5 * (1 - smooth(0, 8, e))) * k);
    }
    for (const m of mouths) {
      if (!m.mound) continue;
      const cx = m.x + m.in[0] * m.mound.r * 0.5, cz = m.z + m.in[1] * m.mound.r * 0.5;
      const d = Math.hypot(x - cx, z - cz);
      if (d < m.mound.r) h = Math.max(h, m.mound.h * (1 - smooth(m.mound.r * 0.3, m.mound.r, d)));
    }
    if (h <= 0) return 0;
    h *= rough(x, z);
    // 口の前：切り通しの通る所（幅＋両脇 2.5 m）には盛らない。その外 5 m で元の岩山へ。口から外へ離れるほど低く
    for (const m of mouths) {
      const [s, l] = frame(m, x, z);
      if (s >= 0 || s < -m.len - 26) continue;
      const side = smooth(m.hw + 2.5, m.hw + 7.5, Math.abs(l));
      h *= side * (1 - 0.55 * smooth(0, 14, -s));
    }
    return h;
  }

  // ここから下は settle の後で使える
  let ground = null;       // 岩山を足し、川を掘った後の地面の高さ（切り通しを掘る前）
  let baked = null;

  /** 切り通し（口の前の、屋根の無い掘った道）：口の枠で s が -len〜0 の間。床は外の地面の高さから口の床の高さへまっすぐ */
  function carve(x, z, h) {
    for (const m of mouths) {
      const [s, l] = frame(m, x, z);
      if (s > 0 || s < -m.len - 4 || Math.abs(l) > m.hw + 4) continue;
      const floor = lerp(m.yFrom, m.y, Math.min(1, Math.max(0, (s + m.len) / m.len)));
      const k = smooth(0.5, 3.5, Math.abs(l) - m.hw);            // 幅の中は床、両脇 3 m で元の地面へ
      const end = smooth(-m.len - 4, -m.len + 1.5, s);            // 外の端はなだらかに始まる
      const cut = floor + (Math.max(h, floor) - floor) * k;
      h = h + (cut - h) * end;
    }
    return h;
  }

  /**
   * 床の高さを決め、形を升目に焼く
   * @param {(x: number, z: number) => number} groundFn 岩山を足し、川を掘った後の地面の高さ
   */
  function settle(groundFn) {
    ground = groundFn;
    // 口の床：外から来る所の地面の高さから、drop だけ下がった所
    for (const m of mouths) {
      m.yFrom = ground(m.from[0], m.from[1]);
      m.y = m.yFrom - m.drop;
      nodeSample[m.id].y = m.y;
    }
    // 上の岩の厚みから決まる、床の一番高い所（lim）
    // まわりの地面の一番低い所。口の面より前（切り通しの側）の地面は数えない（そこは岩の面でふさぐ）
    const front = (x, z) => { for (const m of mouths) { const [fs, fl] = frame(m, x, z); if (fs < 0.3 && fs > -m.len - 8 && Math.abs(fl) < m.hw + 9) return true; } return false; };
    const minGround = (x, z, r) => {
      let g = ground(x, z);
      for (let a = 0; a < 8; a++) for (const k of [0.6, 1]) {
        const px = x + Math.cos(a * Math.PI / 4) * r * k, pz = z + Math.sin(a * Math.PI / 4) * r * k;
        if (!front(px, pz)) g = Math.min(g, ground(px, pz));
      }
      return g;
    };
    for (const s of samples) {
      if (s.fixed) { s.lim = s.y; continue; }
      let near = Infinity;
      for (const m of mouths) near = Math.min(near, Math.hypot(s.x - m.x, s.z - m.z));
      const cover = lerp(CAVE.coverMouth, CAVE.cover, smooth(5, 20, near));
      const r = s.room ? s.room.r : s.hw + 1.5, h = s.room ? s.room.h : s.h;
      s.lim = minGround(s.x, s.z, r) - cover - h;
    }
    // 目安の高さ（tgt）：広間・分かれ目の y の間を、通り道に沿ってまっすぐつなぐ。広間の中は広間の高さ
    for (const s of samples) s.tgt = s.y;
    for (const p of passages) {
      const list = p.samples;
      let i0 = 0;
      for (let i = 1; i < list.length; i++) {
        if (!list[i].node) continue;
        const a = list[i0], b = list[i];
        for (let k = i0 + 1; k < i; k++) list[k].tgt = lerp(a.tgt, b.tgt, (k - i0) / (i - i0));
        i0 = i;
      }
    }
    for (const s of samples) {
      if (s.node && s.room) for (const t of samples) if (!t.fixed && t !== s && Math.hypot(t.x - s.x, t.z - s.z) < s.room.r) t.tgt = Math.min(t.tgt, s.tgt);
    }
    // 口へ上がりきれる高さ（low）：どの口からも、勾配の中で届く高さより低くはしない（目安が深すぎる所は上げる）
    const walk = (start) => {
      const dist = new Map([[start, 0]]), queue = [start];
      while (queue.length) {
        queue.sort((a, b) => dist.get(a) - dist.get(b));
        const s = queue.shift();
        for (const [t, L] of s.adj) { const d = dist.get(s) + L; if (d < (dist.get(t) ?? Infinity)) { dist.set(t, d); queue.push(t); } }
      }
      return dist;
    };
    for (const s of samples) s.low = -Infinity;
    for (const m of mouths) {
      const dist = walk(nodeSample[m.id]);
      for (const [s, d] of dist) s.low = Math.max(s.low, m.y - CAVE.grade * 0.92 * d);
    }
    // 床の高さ：「岩の厚みの許す高さ」と「目安（口へ届く高さまで上げた物）」の低い方から始めて、
    // 隣との高さの差が勾配をこえる所を下げていく（口の床は動かさない）
    for (const s of samples) if (!s.fixed) s.y = Math.min(s.lim, Math.max(s.tgt, s.low));
    for (let it = 0; it < 600; it++) {
      let moved = false;
      for (const s of samples) {
        if (s.fixed) continue;
        for (const [t, L] of s.adj) if (s.y > t.y + CAVE.grade * L + 1e-4) { s.y = t.y + CAVE.grade * L; moved = true; }
      }
      if (!moved) break;
    }
    // 口からの道のり（暗さに使う）
    for (const s of samples) s.dist = Infinity;
    for (const m of mouths) for (const [s, d] of walk(nodeSample[m.id])) s.dist = Math.min(s.dist, d);
    baked = bake();
    return api;
  }

  // ---- 4. 形を升目に焼く：壁からの距離 D（中は負）・床 F・天井 C・口からの道のり S・屋根の無さ O・壁の高さ W ----
  function bake() {
    const G = CAVE.cell;
    // 部品：通り道の区切り（両端の半径・床・天井）と、広間（円）と、切り通し（屋根なし）
    const segs = [];
    const seen = new Set();
    for (const s of samples) for (const [t] of s.adj) {
      const key = samples.indexOf(s) < samples.indexOf(t) ? `${samples.indexOf(s)}_${samples.indexOf(t)}` : `${samples.indexOf(t)}_${samples.indexOf(s)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      segs.push({ ax: s.x, az: s.z, bx: t.x, bz: t.z, ra: s.hw, rb: t.hw, ya: s.y, yb: t.y, ha: s.h, hb: t.h, da: s.dist, db: t.dist, open: 0 });
    }
    for (const s of samples) if (s.room) segs.push({ ax: s.x, az: s.z, bx: s.x, bz: s.z, ra: s.room.r, rb: s.room.r, ya: s.y, yb: s.y, ha: s.room.h, hb: s.room.h, da: s.dist, db: s.dist, open: 0, room: true });
    for (const m of mouths) segs.push({ ax: m.from[0], az: m.from[1], bx: m.x, bz: m.z, ra: m.hw + 0.4, rb: m.hw, ya: m.yFrom, yb: m.y, ha: 30, hb: 30, da: 0, db: 0, open: 1 });
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const g of segs) { const r = Math.max(g.ra, g.rb) + 4; x0 = Math.min(x0, g.ax - r, g.bx - r); x1 = Math.max(x1, g.ax + r, g.bx + r); z0 = Math.min(z0, g.az - r, g.bz - r); z1 = Math.max(z1, g.az + r, g.bz + r); }
    x0 = Math.floor(x0 / G) * G; z0 = Math.floor(z0 / G) * G;
    const nx = Math.ceil((x1 - x0) / G) + 1, nz = Math.ceil((z1 - z0) / G) + 1;
    // 近くの部品を引く升目（8 m）
    const BC = 8, bx = Math.ceil((x1 - x0) / BC) + 1, bz = Math.ceil((z1 - z0) / BC) + 1;
    const bins = Array.from({ length: bx * bz }, () => []);
    segs.forEach((g, i) => {
      const r = Math.max(g.ra, g.rb) + 3.5;
      for (let gx = Math.max(0, Math.floor((Math.min(g.ax, g.bx) - r - x0) / BC)); gx <= Math.min(bx - 1, Math.floor((Math.max(g.ax, g.bx) + r - x0) / BC)); gx++) {
        for (let gz = Math.max(0, Math.floor((Math.min(g.az, g.bz) - r - z0) / BC)); gz <= Math.min(bz - 1, Math.floor((Math.max(g.az, g.bz) + r - z0) / BC)); gz++) bins[gz * bx + gx].push(i);
      }
    });
    const N = nx * nz;
    const D = new Float32Array(N).fill(9), F = new Float32Array(N), C = new Float32Array(N), S = new Float32Array(N), O = new Float32Array(N), W = new Float32Array(N);
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x = x0 + ix * G, z = z0 + iz * G;
      const list = bins[Math.min(bz - 1, Math.floor((z - z0) / BC)) * bx + Math.min(bx - 1, Math.floor((x - x0) / BC))];
      if (!list.length) continue;
      // 口の面より前（切り通しの中）か：そこは屋根が無く、床は切り通しの床（world/landform.js が掘る高さと同じ）。
      // 口の面より奥では、切り通しの部品は床・天井に混ぜない（口の面で、床が切り通しの床とぴったりつながる）
      const cutM = inCut(x, z), frontOf = cutM ? [cutM, frame(cutM, x, z)[0]] : null;
      let d = 9, wSum = 0, f = 0, hd = 0, hw = 0, sd = 0, od = 0, rr = 0;
      for (const i of list) {
        const g = segs[i], dx = g.bx - g.ax, dz = g.bz - g.az, L2 = dx * dx + dz * dz;
        const t = L2 > 0 ? Math.min(1, Math.max(0, ((x - g.ax) * dx + (z - g.az) * dz) / L2)) : 0;
        const r = lerp(g.ra, g.rb, t), e = Math.hypot(g.ax + dx * t - x, g.az + dz * t - z) - r;
        if (e > 3) continue;
        if (e < d) d = e;
        // 床・天井は、近い部品ほど強く混ぜる（中は 1、壁の外 2.5 m で 0）
        if (g.open) continue;   // 切り通しは、壁からの距離だけに使う
        const w = smooth(2.5, -0.6, e) ** 2 * (g.room ? 3 : 1) + 1e-6;
        wSum += w; f += lerp(g.ya, g.yb, t) * w; sd += lerp(g.da, g.db, t) * w; rr += r * w;
        hd += lerp(g.ha, g.hb, t) * w; hw += w;
      }
      if (d > 2.9) continue;
      if (frontOf) {
        const [m, fs] = frontOf;
        f = lerp(m.yFrom, m.y, Math.min(1, Math.max(0, (fs + m.len) / m.len)));
        od = 1; sd = 0; rr = m.hw; hd = hw > 0 ? hd / hw : m.h;
      } else {
        if (wSum <= 0) continue;
        f /= wSum; sd /= wSum; rr /= wSum; hd /= hw;
      }
      // 壁のでこぼこ：広い所ほど大きく（通り道は ±0.3 m、広間は ±1.3 m）
      const amp = 0.3 + Math.min(1, Math.max(0, (rr - 2) / 8)) * 1.0;
      d += (fbm(x * 0.21, z * 0.21, seed + 901) - 0.5) * 2 * amp * (1 - od);
      // 岩の柱（大空洞）：柱の中は壁
      for (const p of PILLARS) d = Math.max(d, p.r * (0.85 + 0.3 * fbm(x * 0.5, z * 0.5, seed + 905)) - Math.hypot(x - p.x, z - p.z));
      const k = iz * nx + ix;
      if (!frontOf && wSum <= 0) continue;
      D[k] = d;
      // 床：広間はすり鉢に少しくぼませ、細かいでこぼこを足す
      const fl = f - Math.min(0.9, Math.max(0, rr - 5) * 0.06) * smooth(0, rr * 0.8, -d) + (fbm(x * 0.33, z * 0.33, seed + 907) - 0.5) * 0.25 * (1 - od);
      F[k] = fl;
      // 天井：壁の所は wallH、中へ入るほど高く（広間は壁から 6 m で一番高い）。でこぼこを足す
      const wallH = Math.min(CAVE.wallH, hd * 0.62);
      const u = Math.min(1, Math.max(0, -d / Math.min(6, Math.max(1.2, rr))));
      const dome = Math.sqrt(1 - (1 - u) * (1 - u));
      C[k] = fl + wallH + (hd - wallH) * dome * (0.86 + 0.28 * fbm(x * 0.16, z * 0.16, seed + 909));
      S[k] = sd; O[k] = od; W[k] = wallH;
    }
    return { G, x0, z0, nx, nz, D, F, C, S, O, W };
  }

  /** 升目から読む（4 点の間をなめらかに）。洞窟から遠ければ null */
  const out = { d: 0, floor: 0, ceil: 0, dist: 0, open: 0 };
  function at(x, z) {
    const b = baked;
    const fx = (x - b.x0) / b.G, fz = (z - b.z0) / b.G, ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= b.nx - 1 || iz >= b.nz - 1) return null;
    const k = iz * b.nx + ix, k2 = k + b.nx;
    const d00 = b.D[k], d10 = b.D[k + 1], d01 = b.D[k2], d11 = b.D[k2 + 1];
    if (d00 > 2.9 && d10 > 2.9 && d01 > 2.9 && d11 > 2.9) return null;
    const tx = fx - ix, tz = fz - iz;
    const mix = (A) => {
      // 形の無い点（遠い点）は混ぜない
      let s = 0, w = 0;
      if (d00 <= 2.9) { const q = (1 - tx) * (1 - tz); s += A[k] * q; w += q; }
      if (d10 <= 2.9) { const q = tx * (1 - tz); s += A[k + 1] * q; w += q; }
      if (d01 <= 2.9) { const q = (1 - tx) * tz; s += A[k2] * q; w += q; }
      if (d11 <= 2.9) { const q = tx * tz; s += A[k2 + 1] * q; w += q; }
      return w > 0 ? s / w : 0;
    };
    out.d = (d00 * (1 - tx) + d10 * tx) * (1 - tz) + (d01 * (1 - tx) + d11 * tx) * tz;
    out.floor = mix(b.F); out.ceil = mix(b.C); out.dist = mix(b.S); out.open = mix(b.O);
    return out;
  }

  /** 口の面より前の、切り通しの中か（その口を返す。違えば null）。ここは屋根が無く、床は掘った地面 */
  const inCut = (x, z) => {
    for (const m of mouths) { const [s, l] = frame(m, x, z); if (s < 0 && s > -m.len - 4 && Math.abs(l) < m.hw + 4.5) return m; }
    return null;
  };
  /** 口の面より奥か（その口の通り道の幅の中で）。口の外（切り通し）は false */
  const behindMouth = (x, z) => {
    for (const m of mouths) {
      const [s, l] = frame(m, x, z);
      if (s < 0 && s > -m.len - 6 && Math.abs(l) < m.hw + 6) return false;
    }
    return true;
  };

  const api = {
    CAVE, mouths, passages, samples, pillars: PILLARS, hill, carve, settle, at, frame,
    get baked() { return baked; },
    /** 洞窟の空いた所（屋根の下）の中か。(x, y, z)。bot の目・矢・カメラが使う */
    voidAt(x, y, z) {
      const q = at(x, z);
      if (!q || q.d > 0 || inCut(x, z)) return false;
      return y > q.floor - 0.4 && y < q.ceil;
    },
    /**
     * 洞窟の中にいるか（0〜1）。暗さ・音のこもり・足もとの床に使う。屋根のある所で、天井より下にいるとき
     * y を渡さなければ、地図の上の位置だけで見る
     */
    inside(x, z, y = null) {
      const q = at(x, z);
      if (!q || q.d > 0.6) return 0;
      if (y !== null && (y > q.ceil + 0.4 || y < q.floor - 2)) return 0;
      return (1 - Math.min(1, q.open * 1.6)) * smooth(0.6, -0.4, q.d);
    },
    /** 足もとの床（洞窟の中にいる人だけ）：{ floor, ceil } か null。world/floors.js が使う */
    layer(x, z, y) {
      if (y === null || y === undefined) return null;
      const q = at(x, z);
      if (!q || q.d > 0.9) return null;
      if (y > q.ceil + 0.3 || y < q.floor - 2.5) return null;
      if (inCut(x, z)) return null;   // 口の面より前は、掘った地面の上（口の面で、同じ高さにつながる）
      return q;
    },
    /**
     * 壁：洞窟の中にいる人（足の高さ y）を、壁から radius だけ離れた所へ押し戻す。world/obstacles.js の「場」として登録する。
     * 切り通しの外の端のあたり（屋根が無く、地面とつながる所）は押さない
     */
    resolve(p, radius) {
      if (p.y === undefined || p.y === null) return;
      const q = at(p.x, p.z);
      if (!q || q.d > 1.2 || q.d < -radius - 0.4) return;
      if (p.y > q.ceil + 0.3 || p.y < q.floor - 2.5) return;
      const lim = -radius - 0.08, d = q.d;
      if (d <= lim) return;
      // 切り通し：外の端の 5 m は壁にしない（地面とつながっている）
      if (q.open > 0.5) {
        for (const m of mouths) { const [s, l] = frame(m, p.x, p.z); if (s < -m.len + 5 && s > -m.len - 6 && Math.abs(l) < m.hw + 6) return; }
      }
      // 壁の向き（距離が増える向き）へ、足りない分だけ戻す
      const e = 0.3;
      const gx = (at(p.x + e, p.z)?.d ?? d) - (at(p.x - e, p.z)?.d ?? d), gz = (at(p.x, p.z + e)?.d ?? d) - (at(p.x, p.z - e)?.d ?? d);
      const gl = Math.hypot(gx, gz);
      if (gl < 1e-5) return;
      const push = Math.min(0.6, d - lim);
      p.x -= (gx / gl) * push; p.z -= (gz / gl) * push;
    },
    /** 地面を細かく作り直す所（口のまわり）の中か：{ mouth } か null。world/terrain.js が、ここは計算の高さを使う */
    patchAt(x, z) {
      for (const m of mouths) { const [s, l] = frame(m, x, z); if (s > -m.len - PATCH.front && s < PATCH.back && Math.abs(l) < m.hw + PATCH.side) return m; }
      return null;
    },
    /** 地面の網を抜く所（口の岩の面をまたぐ所と、切り通し）：網の升の四隅のどれかがここに入れば、その升は描かない */
    holeAt(x, z) {
      for (const m of mouths) {
        const [s, l] = frame(m, x, z);
        if (s > -m.len - 0.5 && s < 2.7 && Math.abs(l) < m.hw + 4.5) return true;
        if (Math.abs(s) < 2.7 && Math.abs(l) < m.hw + 7.8) return true;
      }
      return false;
    },
    /** 木・草・小物を置かない所（0〜1）：口のまわりの作り直す地面と、その外 3 m */
    area(x, z) {
      let a = 0;
      for (const m of mouths) {
        const [s, l] = frame(m, x, z);
        const ds = Math.max(-m.len - PATCH.front - s, s - PATCH.back, 0), dl = Math.max(Math.abs(l) - (m.hw + 9), 0);
        a = Math.max(a, 1 - smooth(0, 3, Math.hypot(ds, dl)));
      }
      return a;
    },
    behindMouth,
    /**
     * 道順（bot が洞窟の中を歩くのに使う）：通り道の点をたどって、(x, z) から行き先まで。[{ x, z }] か、たどれなければ null
     * @param {{ x: number, z: number } | { mouth: string } | { room: true, pick: number }} to
     *   x・z：洞窟の中の行き先、mouth：その口から外へ出る（最後は切り通しの外）、room：広間のどれか（pick は 0〜1 の乱数）
     */
    route(x, z, to) {
      const nearestTo = (px, pz) => { let b = null, bd = Infinity; for (const s of samples) { const d = Math.hypot(s.x - px, s.z - pz); if (d < bd) { bd = d; b = s; } } return bd < 30 ? b : null; };
      const start = nearestTo(x, z);
      if (!start) return null;
      let goal = null, tail = [];
      if (to.mouth) { const m = mouthOf[to.mouth]; goal = nodeSample[m.id]; tail = [{ x: m.from[0] - m.in[0] * 2.5, z: m.from[1] - m.in[1] * 2.5 }]; }
      else if (to.room) { const rooms = samples.filter((q) => q.room && q !== start); goal = rooms[Math.min(rooms.length - 1, Math.floor(to.pick * rooms.length))]; }
      else goal = nearestTo(to.x, to.z);
      if (!goal) return null;
      const prev = new Map([[start, null]]), dist = new Map([[start, 0]]), queue = [start];
      while (queue.length) {
        queue.sort((a, b) => dist.get(a) - dist.get(b));
        const q = queue.shift();
        if (q === goal) break;
        for (const [t, L] of q.adj) { const d = dist.get(q) + L; if (d < (dist.get(t) ?? Infinity)) { dist.set(t, d); prev.set(t, q); queue.push(t); } }
      }
      if (!prev.has(goal)) return null;
      const pts = [];
      for (let q = goal; q; q = prev.get(q)) pts.push({ x: q.x, z: q.z });
      pts.reverse();
      // 点を間引く（2 つに 1 つ。曲がり角で壁に当たらない細かさ）。最後の点は必ず入れる
      const thin = pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1);
      return [...thin, ...tail];
    },
    /** 口の一覧（bot が入る口を選ぶ）：[{ id, x, z（切り通しの外の端）}] */
    get entrances() { return mouths.map((m) => ({ id: m.id, x: m.from[0] - m.in[0] * 2, z: m.from[1] - m.in[1] * 2 })); },
    /** 一番近い口の名前 */
    nearestMouth(x, z) { let b = null, bd = Infinity; for (const m of mouths) { const d = Math.hypot(m.x - x, m.z - z); if (d < bd) { bd = d; b = m.id; } } return b; },
    /** 今いる所の名前（「〜に入った」の知らせ）：大空洞の中は「大空洞」、深い所は「地底洞」、北西の岩山の中は「風穴」 */
    nameAt(x, z) {
      const H = NODES.H;
      if (Math.hypot(x - H.x, z - H.z) < H.r + 2) return H.name;
      const q = at(x, z);
      return q && q.floor < -7 ? '地底洞' : '風穴';
    },
  };
  return api;
}
