// 題の画面の「時代の背景」（利用者の指示 2026-11-20）：題の曲（歷代）の時代の部分のあいだ、時の輪の代わりに出す絵。
//   原始（夜の雪山・マンモスの群れ・燃える草原）・中世（夕焼けの城攻め・投石機）・近世（朝靄の天守・鉄砲の一斉射撃・幟）・
//   現代（崩れた街・探照灯・ヘリコプター・爆発）・未来（光の街・空の光の輪・巨大な人型兵器・無人機の群れ）。
//   どれも 2D の絵（canvas）で、その場で描く（読み込む画像は無い）。動かない層は大きさが変わったときだけ描き直し、
//   毎回は動く物（炎・煙・粒・光）だけを描く。曲の時刻表（audio/title-timeline.js）の小節の頭や大きさに合わせて動く。
//   絵は 1600×900 の大きさで考え、画面いっぱいに覆う（はみ出す所は切る。iPad の 4:3 では左右が少し切れる）
import { createRandom } from '../core/random.js';

const W = 1600, H = 900, M = 80;   // 絵の大きさ・動く層の余白
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d')];
}
/** 縦のぼかし色（stops：[[位置, 色], …]） */
function vgrad(g, y0, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  for (const [p, c] of stops) gr.addColorStop(p, c);
  return gr;
}
/** 光の玉の絵（白。色は重ねるときに付ける） */
function glowSprite(size, core = 0.18, rgb = '255,255,255') {
  const [c, g] = mk(size, size), r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(core, `rgba(${rgb},0.75)`);
  gr.addColorStop(0.5, `rgba(${rgb},0.18)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
/** 炎の舌（下が太く、上へ細い。白い芯 → 黄 → 橙 → 赤 → 透明） */
function flameSprite(w, h, rnd) {
  const [c, g] = mk(w, h);
  const cx = w / 2;
  g.beginPath();
  g.moveTo(cx - w * 0.42, h);
  g.bezierCurveTo(cx - w * 0.5, h * 0.62, cx - w * (0.08 + rnd.next() * 0.1), h * 0.36, cx + (rnd.next() - 0.5) * w * 0.2, 0);
  g.bezierCurveTo(cx + w * (0.1 + rnd.next() * 0.1), h * 0.38, cx + w * 0.5, h * 0.6, cx + w * 0.42, h);
  g.closePath();
  const gr = g.createLinearGradient(0, h, 0, 0);
  gr.addColorStop(0, 'rgba(255,170,60,0.55)'); gr.addColorStop(0.12, 'rgba(255,215,110,1)'); gr.addColorStop(0.25, 'rgba(255,190,70,1)');
  gr.addColorStop(0.5, 'rgba(255,110,25,0.9)'); gr.addColorStop(0.8, 'rgba(200,40,10,0.5)'); gr.addColorStop(1, 'rgba(120,20,5,0)');
  g.fillStyle = gr; g.fill();
  return c;
}
/** 煙のかたまり（rgb の色。濃さは重ねるときに決める）。lit：下の縁を火の色で照らす */
function smokeSprite(size, rnd, rgb = '255,255,255', lit = null) {
  const [c, g] = mk(size, size), r = size / 2;
  for (let i = 0; i < 9; i++) {
    const a = rnd.next() * TAU, d = rnd.next() * r * 0.35, rr = r * (0.35 + rnd.next() * 0.3);
    const x = r + Math.cos(a) * d, y = r + Math.sin(a) * d;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    const col = lit && y > r * 1.05 ? lit : rgb;
    gr.addColorStop(0, `rgba(${col},0.32)`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  return c;
}
/** 稜線の点（左から右へ）。y0 を中心に amp の高さで、細かさ rough */
function ridge(rnd, y0, amp, { n = 9, rough = 0.5, x0 = -M, x1 = W + M } = {}) {
  let pts = [[x0, y0 + (rnd.next() - 0.5) * amp], [x1, y0 + (rnd.next() - 0.5) * amp]];
  let a = amp;
  for (let k = 0; k < n; k++) {
    const nx = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      nx.push(pts[i], [(ax + bx) / 2, (ay + by) / 2 + (rnd.next() - 0.5) * a]);
    }
    nx.push(pts[pts.length - 1]);
    pts = nx; a *= rough;
  }
  return pts;
}
/** 高い峰のある山並み：三角の峰をいくつか重ね、細かいぎざぎざを足す */
function peaks(rnd, base, { n = 7, hMin = 120, hMax = 300, x0 = -M, x1 = W + M } = {}) {
  const P = [];
  for (let i = 0; i < n; i++) P.push({ x: lerp(x0, x1, (i + 0.5) / n) + (rnd.next() - 0.5) * 140, h: hMin + rnd.next() * (hMax - hMin), w: 160 + rnd.next() * 200 });
  const pts = [];
  for (let x = x0; x <= x1; x += 6) {
    let y = base;
    for (const p of P) y = Math.min(y, base - p.h * Math.max(0, 1 - Math.abs(x - p.x) / p.w) ** 1.15);
    pts.push([x, y]);
  }
  for (let k = 1; k < pts.length - 1; k++) pts[k][1] += (rnd.next() - 0.5) * 9 + Math.sin(k * 0.9) * 3;
  return pts;
}
function fillRidge(g, pts, style, bottom = H + M) {
  g.beginPath(); g.moveTo(pts[0][0], bottom);
  for (const [x, y] of pts) g.lineTo(x, y);
  g.lineTo(pts[pts.length - 1][0], bottom); g.closePath();
  g.fillStyle = style; g.fill();
}
/** 稜線の高さ（x の所） */
function ridgeY(pts, x) {
  for (let i = 0; i < pts.length - 1; i++) if (x >= pts[i][0] && x <= pts[i + 1][0]) {
    const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return lerp(pts[i][1], pts[i + 1][1], t);
  }
  return pts[pts.length - 1][1];
}
function stars(g, rnd, n, yMax, alpha = 1) {
  for (let i = 0; i < n; i++) {
    const x = rnd.next() * (W + 2 * M) - M, y = rnd.next() ** 1.4 * yMax, b = rnd.next() ** 3;
    g.fillStyle = `rgba(${220 + b * 35},${225 + b * 30},255,${(0.25 + b * 0.75) * alpha})`;
    const s = 0.8 + b * 1.8;
    g.fillRect(x, y, s, s);
  }
}
/** はためく旗（棒の先から横へ。wave：時刻） */
function flag(g, x, y, w, h, t, color, seed = 0, vertical = false) {
  g.fillStyle = color;
  g.beginPath();
  const N = 10;
  if (!vertical) {
    for (let i = 0; i <= N; i++) { const u = i / N; g.lineTo(x + u * w, y + Math.sin(t * 5 + u * 5 + seed) * h * 0.18 * u); }
    for (let i = N; i >= 0; i--) { const u = i / N; g.lineTo(x + u * w, y + h + Math.sin(t * 5 + u * 5 + seed + 0.6) * h * 0.18 * u - (u > 0.85 ? (u - 0.85) * h * 1.5 : 0)); }
  } else {
    // 幟（のぼり）：縦長。上の横木から垂れ、風で横へ揺れる
    for (let i = 0; i <= N; i++) { const u = i / N; g.lineTo(x + Math.sin(t * 3.2 + u * 4 + seed) * w * 0.16 * u, y + u * h); }
    for (let i = N; i >= 0; i--) { const u = i / N; g.lineTo(x + w + Math.sin(t * 3.2 + u * 4 + seed + 0.5) * w * 0.16 * u, y + u * h); }
  }
  g.closePath(); g.fill();
}

// =====================================================================
// 粒（火の粉・灰・雨・煙）：時代ごとに数と動きを変える
// =====================================================================
function particles(n, spawn) {
  const P = [];
  for (let i = 0; i < n; i++) { const p = {}; spawn(p, true); P.push(p); }
  P.spawn = (p) => spawn(p, false);   // 消えた粒をもう一度生む
  return P;
}

// =====================================================================
// 時代ごとの絵
// =====================================================================
const ERAS = {};

// ---------------- 原始：夜の雪山、月とオオカミ、マンモスの群れ、燃え上がる草原 ----------------
ERAS.genshi = (S) => {
  const rnd = createRandom(101);
  const far = peaks(rnd, 560, { n: 7, hMin: 140, hMax: 320 }), far2 = peaks(rnd, 600, { n: 9, hMin: 60, hMax: 160 });
  const plain = ridge(rnd, 655, 40, { rough: 0.45 });
  const grass = [];
  for (let x = -M; x < W + M; x += 6) grass.push([x, 820 + (rnd.next() - 0.5) * 14 - rnd.next() ** 3 * 50]);
  const layers = {
    sky: (g) => {
      g.fillStyle = vgrad(g, 0, H, [[0, '#03050b'], [0.45, '#0a1022'], [0.72, '#1b1420'], [1, '#2b140c']]);
      g.fillRect(-M, 0, W + 2 * M, H);
      stars(g, rnd, 260, 520);
      // 月：大きく、淡い光の輪
      const mx = 330, my = 170;
      const halo = g.createRadialGradient(mx, my, 30, mx, my, 220);
      halo.addColorStop(0, 'rgba(200,215,255,0.32)'); halo.addColorStop(1, 'rgba(200,215,255,0)');
      g.fillStyle = halo; g.fillRect(mx - 240, my - 240, 480, 480);
      g.fillStyle = '#e6e4da'; g.beginPath(); g.arc(mx, my, 48, 0, TAU); g.fill();
      g.fillStyle = 'rgba(160,160,170,0.35)';
      for (const [dx, dy, r] of [[-14, -8, 10], [12, 10, 7], [6, -20, 5], [-6, 16, 6]]) { g.beginPath(); g.arc(mx + dx, my + dy, r, 0, TAU); g.fill(); }
    },
    far: (g) => {
      // 雪の山：明るい稜線の下を、少し下げた同じ形で塗って、頂の雪を残す
      // 頂の雪：明るい山を塗り、その少し下から暗い山を重ねる（高い所ほど雪が深い）
      fillRidge(g, far, '#8c97ad');
      fillRidge(g, far.map(([x, y]) => [x, y + 10 + Math.max(0, 560 - y) * 0.28]), '#283145');
      fillRidge(g, far2, '#3a4458');
      fillRidge(g, far2.map(([x, y]) => [x, y + 8 + Math.max(0, 600 - y) * 0.2]), '#171d2b');
      // 遠くの霧
      g.fillStyle = vgrad(g, 520, 680, [[0, 'rgba(60,40,40,0)'], [1, 'rgba(70,40,30,0.55)']]);
      g.fillRect(-M, 520, W + 2 * M, 160);
    },
    mid: (g) => {
      fillRidge(g, plain, '#0b0d13');
      // 左の岩山と、遠吠えするオオカミ（月の下）
      g.fillStyle = '#080a10';
      g.beginPath(); g.moveTo(150, 700); g.lineTo(210, 600); g.lineTo(250, 585); g.lineTo(300, 560); g.lineTo(345, 566); g.lineTo(380, 600); g.lineTo(430, 700); g.closePath(); g.fill();
      g.save(); g.translate(318, 562); g.scale(1.3, 1.3);
      g.beginPath();
      g.moveTo(-34, 0); g.lineTo(-30, -14); g.lineTo(-26, -20); g.lineTo(-10, -22); g.lineTo(4, -24); g.lineTo(12, -32);   // 背中から首
      g.lineTo(16, -44); g.lineTo(20, -50); g.lineTo(22, -47); g.lineTo(24, -52); g.lineTo(27, -46);                      // 耳と頭
      g.lineTo(36, -56); g.lineTo(38, -52); g.lineTo(28, -40); g.lineTo(22, -26); g.lineTo(18, -14);                      // 上を向いた口
      g.lineTo(16, 0); g.lineTo(12, 0); g.lineTo(10, -10); g.lineTo(-18, -10); g.lineTo(-22, 0); g.lineTo(-26, 0); g.lineTo(-27, -12);
      g.lineTo(-40, -8); g.lineTo(-48, -2); g.lineTo(-38, -14); g.closePath();
      g.fill(); g.restore();
    },
    fore: (g) => {
      // 手前の地面と草の影
      g.fillStyle = '#040405';
      g.beginPath(); g.moveTo(-M, H + M);
      for (const [x, y] of grass) g.lineTo(x, y);
      g.lineTo(W + M, H + M); g.closePath(); g.fill();
      // 枯れ木（左右）
      const tree = (x, y, s, dir) => {
        g.strokeStyle = '#040405'; g.lineCap = 'round';
        const br = (x0, y0, a, len, w, d) => {
          if (d > 5 || len < 6) return;
          const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
          g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
          br(x1, y1, a - 0.35 - rnd.next() * 0.3, len * (0.62 + rnd.next() * 0.15), w * 0.66, d + 1);
          br(x1, y1, a + 0.3 + rnd.next() * 0.3, len * (0.58 + rnd.next() * 0.15), w * 0.62, d + 1);
        };
        br(x, y, -Math.PI / 2 + dir * 0.12, 120 * s, 16 * s, 0);
      };
      tree(90, 840, 1.6, -1); tree(1520, 850, 1.4, 1); tree(1380, 860, 0.9, 1);
    },
  };
  const flames = [];
  for (let i = 0; i < 6; i++) flames.push(flameSprite(48, 120, rnd));
  const fireRow = [];
  for (let x = -40; x < W + 40; x += 22) fireRow.push({ x: x + (rnd.next() - 0.5) * 12, s: 0.6 + rnd.next() * 0.8, ph: rnd.next() * 10, k: (rnd.next() * 6) | 0, y: 818 + rnd.next() * 30 });
  // 木に付いた炎
  for (const [x, y] of [[90, 760], [70, 700], [120, 690], [1520, 760], [1545, 700], [1380, 800]]) fireRow.push({ x, y, s: 0.8, ph: rnd.next() * 10, k: (rnd.next() * 6) | 0, tree: true });
  const glow = glowSprite(128), smoke = smokeSprite(160, rnd, '34,24,22', '150,60,25');
  const embers = particles(S.low ? 70 : 140, (p, init) => {
    p.x = rnd.next() * W; p.y = init ? 300 + rnd.next() * 600 : 840 + rnd.next() * 40;
    p.vx = (rnd.next() - 0.5) * 20; p.vy = -(40 + rnd.next() * 90); p.s = 2 + rnd.next() * 5; p.ph = rnd.next() * 10; p.life = 0;
  });
  const smokes = particles(S.low ? 10 : 18, (p, init) => {
    p.x = rnd.next() * W; p.y = init ? 300 + rnd.next() * 500 : 860; p.vx = -10 - rnd.next() * 18; p.vy = -18 - rnd.next() * 14;
    p.s = 180 + rnd.next() * 220; p.a = 0.0; p.age = init ? rnd.next() * 20 : 0;
  });
  const herd = [{ x: 900, u: 40, ph: 0, dy: 40 }, { x: 1150, u: 27, ph: 1.7, dy: 12 }, { x: 1300, u: 20, ph: 0.9, dy: 4 }, { x: 640, u: 16, ph: 2.4, dy: 0 }];
  /** マンモス（左向き）：u は大きさ。walk は脚の振り、trunk は鼻の上がり具合（0〜1）、rim は炎の照り返し */
  const mammoth = (g, x, y, u, walk, trunk, rim) => {
    g.save(); g.translate(x, y);
    g.fillStyle = '#06070a';
    // 脚（柱のよう。前後で振る）
    const leg = (lx, a) => { g.save(); g.translate(lx * u, -1.75 * u); g.rotate(a); g.fillRect(-0.32 * u, 0, 0.64 * u, 1.8 * u); g.restore(); };
    leg(-1.2, Math.sin(walk) * 0.18); leg(1.3, -Math.sin(walk) * 0.18); leg(-0.6, -Math.sin(walk) * 0.18); leg(1.8, Math.sin(walk) * 0.18);
    // 体と毛の裾、頭のこぶ
    g.beginPath();
    g.moveTo(2.6 * u, -1.0 * u);
    g.bezierCurveTo(2.9 * u, -2.6 * u, 1.4 * u, -3.0 * u, -0.6 * u, -3.1 * u);
    g.bezierCurveTo(-1.3 * u, -3.9 * u, -2.6 * u, -4.1 * u, -2.9 * u, -3.0 * u);
    g.bezierCurveTo(-3.1 * u, -2.3 * u, -2.9 * u, -1.7 * u, -2.6 * u, -1.4 * u);
    for (let i = 0; i <= 10; i++) { const px = lerp(-2.4, 2.5, i / 10); g.lineTo(px * u, (-1.15 + (i % 2) * 0.24 - Math.sin(i * 1.7) * 0.06) * u); }
    g.closePath(); g.fill();
    // 鼻（下がっている → 高く上げる）
    const tx = lerp(-3.3, -4.0, trunk), ty = lerp(-0.2, -4.6, trunk);
    g.lineWidth = 0.55 * u; g.strokeStyle = '#06070a'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-2.85 * u, -2.3 * u);
    g.quadraticCurveTo(lerp(-3.4, -3.3, trunk) * u, lerp(-1.4, -3.0, trunk) * u, tx * u, ty * u); g.stroke();
    // 牙（曲がった象牙）
    g.strokeStyle = 'rgba(214,204,182,0.85)'; g.lineWidth = 0.22 * u;
    g.beginPath(); g.moveTo(-2.7 * u, -1.8 * u); g.bezierCurveTo(-3.6 * u, -1.0 * u, -4.4 * u, -1.6 * u, -4.0 * u, -2.6 * u); g.stroke();
    g.restore();
  };
  let fireLv = 0.12, burst = 0;
  return {
    layers,
    draw(g, st) {
      const { t, et, dt, sec, env } = st;
      const tm = sec.mammoth != null ? sec.mammoth - sec.t0 : 2, tf = sec.fire != null ? sec.fire - sec.t0 : 6;
      // 炎の強さ：雄叫びまでは燻り、燃え上がりで一気に（曲の大きさでも揺れる）
      const want = et < tf ? 0.12 + 0.06 * Math.sin(t * 2) : 0.75 + env * 0.45;
      fireLv += (want - fireLv) * clamp(dt * (et < tf + 0.5 ? 9 : 2));
      if (et >= tf && et - dt < tf) burst = 1;
      burst = Math.max(0, burst - dt * 0.9);
      const lv = fireLv + burst * 0.6;
      // 地平の火の照り（加算）
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = vgrad(g, 450, H, [[0, 'rgba(255,90,20,0)'], [0.6, `rgba(255,90,20,${0.18 * lv})`], [1, `rgba(255,140,40,${0.45 * lv})`]]);
      g.fillRect(-M, 450, W + 2 * M, H - 450 + M);
      g.globalCompositeOperation = 'source-over';
      // マンモスの群れ：ゆっくり左へ歩く。雄叫びで先頭が鼻を上げる
      const call = smooth(tm - 0.3, tm + 0.4, et) * (1 - smooth(tm + 2.6, tm + 3.6, et));
      for (const [i, m] of herd.entries()) {
        const x = m.x - et * 9 * (1 - i * 0.12);
        mammoth(g, x, ridgeY(plain, x) + 6 + m.dy, m.u, (et * 2.2 + m.ph) * (1 - call * 0.8), i === 0 ? call : call * 0.4, lv);
      }
      // 煙（暗い。下は炎で赤く照る）
      for (const p of smokes) {
        p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y < -200 || p.x < -300) st.respawn(p, smokes);
        const a = clamp(p.age / 3) * 0.55 * (0.4 + lv * 0.6);
        g.globalAlpha = a;
        g.drawImage(smoke, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
      g.globalAlpha = 1;
      // 炎の列
      g.globalCompositeOperation = 'lighter';
      for (const f of fireRow) {
        const fl = 0.75 + 0.25 * Math.sin(t * 9 + f.ph) * Math.sin(t * 5.3 + f.ph * 2);
        const hgt = (f.tree ? 70 : 110) * f.s * lv * fl * (f.tree ? clamp((et - tf) / 2) : 1);
        if (hgt < 3) continue;
        const w = 38 * f.s * (0.8 + lv * 0.3);
        g.globalAlpha = clamp(lv * 1.3);
        g.drawImage(flames[(f.k + ((t * 10 + f.ph) | 0)) % 6], f.x - w / 2, f.y - hgt, w, hgt);
        if (f.k === 0) { g.globalAlpha = 0.3 * clamp(lv); g.drawImage(glow, f.x - hgt * 1.4, f.y - hgt * 1.5, hgt * 2.8, hgt * 2.8); }
      }
      g.globalAlpha = 1;
      // 火の粉（燃え上がりで一気に増える）
      for (const p of embers) {
        p.life += dt; p.x += (p.vx + Math.sin(t * 2 + p.ph) * 18) * dt; p.y += p.vy * dt * (0.5 + lv);
        if (p.y < -20) st.respawn(p, embers);
        const a = clamp(lv) * (0.5 + 0.5 * Math.sin(t * 8 + p.ph));
        g.globalAlpha = a; g.drawImage(glow, p.x - p.s * 2, p.y - p.s * 2, p.s * 4, p.s * 4);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      st.paint('fore');
      // 手前の炎（地面の影の前。根元は画面の外）
      g.globalCompositeOperation = 'lighter';
      for (const f of fireRow) {
        if (f.tree || f.k > 1) continue;
        const hgt = 150 * f.s * lv * (0.75 + 0.25 * Math.sin(t * 7 + f.ph * 2));
        if (hgt < 4) continue;
        g.globalAlpha = clamp(lv) * 0.85;
        g.drawImage(flames[(f.k + 3 + ((t * 9 + f.ph) | 0)) % 6], f.x + 11 - 30 * f.s, 905 - hgt, 60 * f.s, hgt);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      // 揺れ：雄叫びと燃え上がり
      st.shake = Math.max(st.shake, (smooth(tm, tm + 0.15, et) * (1 - smooth(tm + 0.15, tm + 1.6, et))) * 7 + burst * 9);
      st.flash = Math.max(st.flash, burst * 0.5);
    },
  };
};

// ---------------- 中世：夕焼けの空、燃える城、投石機、矢の雨、はためく旗 ----------------
ERAS.chusei = (S) => {
  const rnd = createRandom(202);
  const hills = ridge(rnd, 560, 120, { rough: 0.5 }), hills2 = ridge(rnd, 640, 60, { rough: 0.45 });
  const cloudPuffs = smokeSprite(256, rnd, '40,14,24', '235,105,50');
  // 城の形（右の丘の上）
  const CX = 1130, CY = 520;
  const towers = [[-170, 150, 34], [-60, 210, 44], [70, 170, 38], [175, 130, 30]];   // [x, 高さ, 幅]
  const layers = {
    sky: (g) => {
      g.fillStyle = vgrad(g, 0, H, [[0, '#12091a'], [0.3, '#3a1222'], [0.55, '#8a2a1c'], [0.7, '#d0581e'], [0.8, '#f08a30'], [1, '#3a160c']]);
      g.fillRect(-M, 0, W + 2 * M, H);
      // 沈む日
      const sx = 1120, sy = 600;
      const halo = g.createRadialGradient(sx, sy, 20, sx, sy, 420);
      halo.addColorStop(0, 'rgba(255,190,90,0.8)'); halo.addColorStop(0.2, 'rgba(255,120,40,0.35)'); halo.addColorStop(1, 'rgba(255,80,20,0)');
      g.fillStyle = halo; g.fillRect(sx - 450, sy - 450, 900, 900);
      g.fillStyle = '#ffd9a0'; g.beginPath(); g.arc(sx, sy, 70, 0, TAU); g.fill();
      // 雲：下の縁が赤く照る、ふわっとしたかたまりを横に並べる（上ほど暗く濃い）
      for (let i = 0; i < 140; i++) {
        const y = 40 + rnd.next() ** 1.3 * 420, sz = 160 + rnd.next() * 260, x = rnd.next() * (W + 2 * M) - M;
        g.globalAlpha = 0.5 + 0.4 * (1 - y / 460);
        g.drawImage(cloudPuffs, x - sz / 2, y - sz * 0.25, sz, sz * 0.5);
      }
      g.globalAlpha = 1;
    },
    far: (g) => {
      fillRidge(g, hills, '#2a1016');
      // 城：城壁・塔・円錐の屋根・狭間（凸凹）
      g.fillStyle = '#16080c';
      const wallTop = CY - 70;
      g.fillRect(CX - 200, wallTop, 400, 140);
      for (let x = CX - 200; x < CX + 200; x += 14) g.fillRect(x, wallTop - 10, 8, 10);
      for (const [dx, h, w] of towers) {
        const x = CX + dx, top = CY - h;
        g.fillRect(x - w / 2, top, w, h + 70);
        for (let k = -w / 2; k < w / 2; k += 9) g.fillRect(x + k, top - 8, 6, 8);
        g.beginPath(); g.moveTo(x - w / 2 - 6, top - 8); g.lineTo(x, top - 8 - w * 1.3); g.lineTo(x + w / 2 + 6, top - 8); g.closePath(); g.fill();
        g.fillRect(x - 1, top - 8 - w * 1.3 - 26, 2, 26);   // 旗の竿
      }
      // 門
      g.fillStyle = '#060204'; g.beginPath(); g.moveTo(CX - 22, CY + 70); g.lineTo(CX - 22, CY + 20); g.arc(CX, CY + 20, 22, Math.PI, 0); g.lineTo(CX + 22, CY + 70); g.fill();
      fillRidge(g, hills2, '#1a0a0e');
      g.fillStyle = vgrad(g, 560, 720, [[0, 'rgba(120,40,20,0)'], [1, 'rgba(90,30,15,0.5)']]);
      g.fillRect(-M, 560, W + 2 * M, 160);
    },
    mid: (g) => {
      // 軍勢：槍の列（尾根の上に、細い線の林）
      g.strokeStyle = '#0c0507'; g.fillStyle = '#0c0507';
      for (let row = 0; row < 3; row++) {
        const y0 = 690 + row * 24;
        g.fillRect(-M, y0, W + 2 * M, 60);
        for (let x = -M; x < 760 - row * 60; x += 7 + rnd.next() * 5) {
          const h = 60 + rnd.next() * 30, lean = (rnd.next() - 0.5) * 6;
          g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y0 + 4); g.lineTo(x + lean, y0 - h); g.stroke();
          g.beginPath(); g.arc(x, y0 - 2, 5, Math.PI, 0); g.fill();   // 兜
        }
      }
      // 投石機（左）：台
      g.fillStyle = '#0a0406';
      g.beginPath(); g.moveTo(300, 700); g.lineTo(350, 560); g.lineTo(370, 560); g.lineTo(420, 700); g.closePath(); g.fill();
      g.fillRect(270, 690, 180, 16);
    },
    fore: (g) => {
      g.fillStyle = '#070304';
      g.beginPath(); g.moveTo(-M, H + M);
      for (let x = -M; x <= W + M; x += 8) g.lineTo(x, 830 + Math.sin(x * 0.01) * 12 - rnd.next() ** 4 * 40);
      g.lineTo(W + M, H + M); g.closePath(); g.fill();
      // 折れた柵の杭
      for (let x = 420; x < 900; x += 34 + rnd.next() * 20) {
        const h = 40 + rnd.next() * 50; g.save(); g.translate(x, 835); g.rotate((rnd.next() - 0.5) * 0.4); g.fillRect(-4, -h, 8, h + 10); g.restore();
      }
      // 旗の竿（左右）
      g.fillRect(250, 300, 8, 560); g.fillRect(1360, 340, 8, 520);
    },
  };
  const glow = glowSprite(128), smoke = smokeSprite(160, rnd, '38,30,32', '160,70,40'), flames = [0, 1, 2, 3].map(() => flameSprite(40, 100, rnd));
  const embers = particles(S.low ? 40 : 90, (p, init) => { p.x = rnd.next() * W; p.y = init ? rnd.next() * H : H + 10; p.vx = -10 + rnd.next() * 30; p.vy = -(25 + rnd.next() * 50); p.s = 1.5 + rnd.next() * 3; p.ph = rnd.next() * 9; });
  const smokes = particles(S.low ? 8 : 14, (p, init) => { p.x = CX + (rnd.next() - 0.5) * 300; p.y = init ? 200 + rnd.next() * 300 : CY - 100; p.vx = -20 - rnd.next() * 20; p.vy = -25 - rnd.next() * 15; p.s = 140 + rnd.next() * 200; p.age = init ? 5 : 0; });
  const shots = [];   // 投石機の火の玉
  const volleys = [];  // 矢の雨
  let lastBar = -1, armA = 0;
  return {
    layers,
    draw(g, st) {
      const { t, et, dt, sec, bar, env } = st;
      // 小節の頭：2 小節ごとに投石機が火の玉を放ち、ほかの小節で矢の雨
      if (bar !== lastBar && bar >= 0) {
        if (bar % 2 === 0) { shots.push({ t0: et, x0: 360, y0: 540, x1: CX + (rnd.next() - 0.5) * 300, y1: CY - 40 + rnd.next() * 60 }); armA = 1; }
        else if (volleys.length < 3) {
          const v = { t0: et, a: [] };
          for (let i = 0; i < (st.low ? 20 : 40); i++) v.a.push({ x: 100 + rnd.next() * 600, d: rnd.next() * 0.4, h: 180 + rnd.next() * 120, len: 500 + rnd.next() * 300 });
          volleys.push(v);
        }
        lastBar = bar;
      }
      armA = Math.max(0, armA - dt * 3);
      // 投石機の腕
      g.save(); g.translate(360, 565); g.rotate(-0.9 + (1 - armA) * 1.8 - 0.4);
      g.fillStyle = '#0a0406'; g.fillRect(-6, -150, 12, 190); g.restore();
      // 城の窓の灯と、燃える塔
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const x = CX - 180 + i * 45, y = CY - 30 + (i % 3) * 22;
        const k = 0.6 + 0.4 * Math.sin(t * 7 + i * 3) * Math.sin(t * 3.1 + i);
        g.globalAlpha = 0.5 * k; g.drawImage(glow, x - 14, y - 14, 28, 28);
      }
      for (const [dx, h] of [[-60, 210], [175, 130]]) {
        const x = CX + dx, y = CY - h + 10;
        for (let k = 0; k < 4; k++) {
          const fh = (60 + 30 * Math.sin(t * 6 + k * 2)) * (0.8 + env * 0.4);
          g.globalAlpha = 0.9; g.drawImage(flames[k], x - 22 + k * 10, y - fh + 20, 30, fh);
        }
        g.globalAlpha = 0.35; g.drawImage(glow, x - 110, y - 120, 220, 220);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      for (const p of smokes) {
        p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.s += dt * 20;
        if (p.y < -250) st.respawn(p, smokes);
        g.globalAlpha = clamp(p.age / 2) * 0.45; g.drawImage(smoke, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
      g.globalAlpha = 1;
      // 火の玉：放物線で城へ。当たると光と煙
      g.globalCompositeOperation = 'lighter';
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i], u = (et - s.t0) / 1.6;
        if (u > 1.6) { shots.splice(i, 1); continue; }
        if (u <= 1) {
          const x = lerp(s.x0, s.x1, u), y = lerp(s.y0, s.y1, u) - Math.sin(u * Math.PI) * 330;
          for (let k = 0; k < 6; k++) {
            const uu = Math.max(0, u - k * 0.02), xx = lerp(s.x0, s.x1, uu), yy = lerp(s.y0, s.y1, uu) - Math.sin(uu * Math.PI) * 330;
            g.globalAlpha = 0.5 * (1 - k / 6); g.drawImage(glow, xx - 20, yy - 20, 40, 40);
          }
          g.globalAlpha = 1; g.drawImage(glow, x - 26, y - 26, 52, 52);
        } else {
          const k = 1 - (u - 1) / 0.6;
          g.globalAlpha = k; g.drawImage(glow, s.x1 - 160 * k, s.y1 - 160 * k, 320 * k, 320 * k);
          if (u - dt / 1.6 <= 1) { st.shake = Math.max(st.shake, 4); smokes.length && st.respawn(smokes[(rnd.next() * smokes.length) | 0], smokes, { x: s.x1, y: s.y1 }); }
        }
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      // 矢の雨：左から右へ、細い影の線
      g.strokeStyle = 'rgba(15,6,8,0.85)'; g.lineWidth = 1.6;
      for (let i = volleys.length - 1; i >= 0; i--) {
        const v = volleys[i], age = et - v.t0;
        if (age > 2.4) { volleys.splice(i, 1); continue; }
        g.beginPath();
        for (const a of v.a) {
          const u = clamp((age - a.d) / 1.8); if (u <= 0 || u >= 1) continue;
          const x = a.x + u * a.len, y = 620 - Math.sin(u * Math.PI) * a.h - u * 40;
          const ang = Math.atan2(-Math.cos(u * Math.PI) * a.h * Math.PI - 40, a.len);
          g.moveTo(x, y); g.lineTo(x - Math.cos(ang) * 16, y - Math.sin(ang) * 16);
        }
        g.stroke();
      }
      st.paint('fore');
      // はためく旗（手前の左右）
      flag(g, 258, 305, 190, 90, t, '#5c0f12', 0);
      flag(g, 258, 305, 190, 6, t, '#c99a3a', 0.2);
      flag(g, 1368, 345, -170, 80, t + 0.7, '#1a1a40', 1.3);
      for (const p of embers) {
        p.x += p.vx * dt; p.y += p.vy * dt; if (p.y < -10) st.respawn(p, embers);
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 7 + p.ph);
        g.drawImage(glow, p.x - p.s * 2, p.y - p.s * 2, p.s * 4, p.s * 4);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    },
  };
};

// ---------------- 近世：朝靄の天守と石垣、鉄砲の一斉射撃、大砲、幟 ----------------
ERAS.kinsei = (S) => {
  const rnd = createRandom(303);
  const mts = peaks(rnd, 560, { n: 6, hMin: 70, hMax: 170 }), field = ridge(rnd, 660, 30, { rough: 0.4 });
  const rows = [690, 720, 752];
  const soldiers = rows.map((y, r) => { const a = []; for (let x = 520 + r * 30; x < 1250 - r * 20; x += 26 + rnd.next() * 6) a.push(x); return { y, a }; });
  const layers = {
    sky: (g) => {
      g.fillStyle = vgrad(g, 0, H, [[0, '#2f3644'], [0.35, '#6e6a66'], [0.6, '#c9ad80'], [0.72, '#f0d49c'], [1, '#8a7a62']]);
      g.fillRect(-M, 0, W + 2 * M, H);
      const sx = 980, sy = 400;
      const halo = g.createRadialGradient(sx, sy, 10, sx, sy, 300);
      halo.addColorStop(0, 'rgba(255,245,215,0.95)'); halo.addColorStop(0.15, 'rgba(255,230,180,0.5)'); halo.addColorStop(1, 'rgba(255,220,160,0)');
      g.fillStyle = halo; g.fillRect(sx - 320, sy - 320, 640, 640);
    },
    far: (g) => {
      fillRidge(g, mts, 'rgba(96,100,112,0.85)');
      g.fillStyle = vgrad(g, 420, 640, [[0, 'rgba(230,214,180,0)'], [1, 'rgba(230,214,180,0.75)']]);
      g.fillRect(-M, 420, W + 2 * M, 220);
      // 天守：石垣（裾が反った台形）と、三重の屋根（反り上がった軒）
      const x = 380, base = 640;
      g.fillStyle = '#3a3d47';
      g.beginPath(); g.moveTo(x - 190, base); g.quadraticCurveTo(x - 150, base - 40, x - 130, base - 110); g.lineTo(x + 130, base - 110); g.quadraticCurveTo(x + 150, base - 40, x + 190, base); g.closePath(); g.fill();
      const tier = (y, w, h) => {
        g.fillStyle = '#2b2e37'; g.fillRect(x - w / 2 + 12, y - h, w - 24, h);
        g.fillStyle = '#20232b';
        g.beginPath(); g.moveTo(x - w / 2 - 26, y - h + 8); g.quadraticCurveTo(x - w / 2, y - h - 4, x - w / 2 + 20, y - h - 22);
        g.lineTo(x + w / 2 - 20, y - h - 22); g.quadraticCurveTo(x + w / 2, y - h - 4, x + w / 2 + 26, y - h + 8); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,230,180,0.25)';
        for (let k = -w / 2 + 24; k < w / 2 - 24; k += 18) g.fillRect(x + k, y - h * 0.65, 8, 6);
      };
      tier(base - 110, 230, 50); tier(base - 182, 180, 44); tier(base - 248, 128, 40);
      g.fillStyle = '#1a1c22';
      g.beginPath(); g.moveTo(x - 80, base - 290); g.quadraticCurveTo(x - 50, base - 300, x - 34, base - 318); g.lineTo(x + 34, base - 318); g.quadraticCurveTo(x + 50, base - 300, x + 80, base - 290); g.closePath(); g.fill();
      g.fillRect(x - 40, base - 330, 4, 12); g.fillRect(x + 36, base - 330, 4, 12);   // 鯱
      // 松
      const pine = (px, py, s) => {
        g.fillStyle = '#23282a'; g.fillRect(px - 3 * s, py - 60 * s, 6 * s, 60 * s);
        for (const [dx, dy, w] of [[-10, -70, 60], [14, -92, 54], [-6, -112, 44]]) { g.beginPath(); g.ellipse(px + dx * s, py + dy * s, w * s / 2, 12 * s, 0, 0, TAU); g.fill(); }
      };
      pine(140, 650, 1.1); pine(620, 655, 0.9); pine(680, 660, 0.7);
    },
    mid: (g) => {
      fillRidge(g, field, '#4d4436');
      // 足軽の列（陣笠・体・鉄砲）
      g.fillStyle = '#1e1b18'; g.strokeStyle = '#1e1b18';
      for (const [r, row] of soldiers.entries()) {
        const s = 0.8 + r * 0.15;
        for (const x of row.a) {
          g.fillRect(x - 5 * s, row.y - 26 * s, 10 * s, 26 * s);
          g.beginPath(); g.moveTo(x - 11 * s, row.y - 26 * s); g.lineTo(x, row.y - 36 * s); g.lineTo(x + 11 * s, row.y - 26 * s); g.closePath(); g.fill();
          g.lineWidth = 2.2 * s; g.beginPath(); g.moveTo(x - 4 * s, row.y - 18 * s); g.lineTo(x - 30 * s, row.y - 22 * s); g.stroke();
        }
      }
      // 大砲（右）
      g.fillStyle = '#1a1714';
      g.save(); g.translate(1360, 715); g.rotate(-0.2); g.fillRect(-70, -12, 90, 24); g.restore();
      g.beginPath(); g.arc(1345, 728, 18, 0, TAU); g.fill();
    },
    fore: (g) => {
      g.fillStyle = '#2a241c';
      g.beginPath(); g.moveTo(-M, H + M);
      for (let x = -M; x <= W + M; x += 10) g.lineTo(x, 840 + Math.sin(x * 0.008) * 10 - rnd.next() ** 5 * 30);
      g.lineTo(W + M, H + M); g.closePath(); g.fill();
      g.fillStyle = '#15120e';
      for (const x of [228, 318, 1246, 1336]) g.fillRect(x, 250, 7, 620);   // 幟の竿
    },
  };
  const glow = glowSprite(128), smoke = smokeSprite(180, rnd, '240,236,226');
  const puffs = [];
  let lastBar = -1;
  const crest = (g, x, y, r) => {   // 幟の紋（作り物：時の輪。輪と、8 つの目盛りと、真ん中の点）
    g.strokeStyle = 'rgba(240,232,215,0.92)'; g.fillStyle = 'rgba(240,232,215,0.92)'; g.lineWidth = r * 0.14;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
    for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55); g.lineTo(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82); g.stroke(); }
    g.beginPath(); g.arc(x, y, r * 0.2, 0, TAU); g.fill();
  };
  return {
    layers,
    draw(g, st) {
      const { t, et, dt, bar, env } = st;
      if (bar !== lastBar && bar >= 0) {
        // 小節の頭：列ごとに一斉射撃。4 小節ごとに大砲
        const row = soldiers[bar % 3];
        for (const x of row.a) puffs.push({ x: x - 32, y: row.y - 22, t0: et, s: 30 + rnd.next() * 20, gun: true, vx: -6 - rnd.next() * 10 });
        if (bar % 4 === 0) { puffs.push({ x: 1285, y: 700, t0: et, s: 140, gun: true, big: true, vx: -14 }); st.shake = Math.max(st.shake, 6); }
        lastBar = bar;
      }
      // 硝煙：白く膨らみ、ゆっくり流れる。撃った瞬間は火が光る
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i], age = et - p.t0;
        if (age > 9) { puffs.splice(i, 1); continue; }
        const r = p.s * (0.4 + Math.sqrt(age) * (p.big ? 1.2 : 0.9));
        g.globalAlpha = clamp(age * 6) * Math.max(0, 1 - age / 9) * (p.big ? 0.7 : 0.55);
        g.drawImage(smoke, p.x + p.vx * age - r, p.y - age * 8 - r, r * 2, r * 2);
        if (age < 0.12) {
          g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - age / 0.12;
          const f = p.big ? 160 : 34; g.drawImage(glow, p.x - f / 2, p.y - f / 2, f, f);
          g.globalCompositeOperation = 'source-over';
        }
      }
      g.globalAlpha = 1;
      // 漂う靄
      g.fillStyle = `rgba(235,220,190,${0.12 + env * 0.08})`;
      g.fillRect(-M, 600 + Math.sin(t * 0.3) * 10, W + 2 * M, 120);
      st.paint('fore');
      // 幟（縦長の旗。紋入り）
      const cols = ['#5d1416', '#16161a', '#5d1416', '#16161a'];
      for (const [i, x] of [235, 325, 1253, 1343].entries()) {
        flag(g, x, 262, 62, 300, t + i * 0.8, cols[i], i * 1.7, true);
        crest(g, x + 31 + Math.sin(t * 3.2 + 1.4 + i * 1.7) * 4, 330, 18);
      }
    },
  };
};

// ---------------- 現代：崩れた街、探照灯、ヘリコプター、爆発、曳光弾 ----------------
ERAS.gendai = (S) => {
  const rnd = createRandom(404);
  const blds = [];
  for (let x = -M; x < W + M;) { const w = 40 + rnd.next() * 90; blds.push({ x, w, h: 120 + rnd.next() * 260, broken: rnd.next() < 0.45, far: true }); x += w + rnd.next() * 6; }
  const near = [];
  for (let x = -M; x < W + M;) { const w = 70 + rnd.next() * 120; near.push({ x, w, h: 60 + rnd.next() * 200, broken: rnd.next() < 0.6 }); x += w + 10 + rnd.next() * 40; }
  const building = (g, b, base, col, winCol) => {
    g.fillStyle = col;
    g.beginPath(); g.moveTo(b.x, base); g.lineTo(b.x, base - b.h);
    if (b.broken) { const n = 5; for (let i = 1; i <= n; i++) g.lineTo(b.x + (b.w * i) / n, base - b.h + (rnd.next() * 0.45) * b.h * (i % 2 ? 1 : 0.4)); }
    else g.lineTo(b.x + b.w, base - b.h);
    g.lineTo(b.x + b.w, base); g.closePath(); g.fill();
    for (let y = base - b.h + 14; y < base - 10; y += 16) for (let x = b.x + 6; x < b.x + b.w - 8; x += 12) {
      if (rnd.next() < 0.1) { g.fillStyle = winCol[(rnd.next() * winCol.length) | 0]; g.fillRect(x, y, 5, 7); }
    }
  };
  const layers = {
    sky: (g) => {
      g.fillStyle = vgrad(g, 0, H, [[0, '#07080b'], [0.45, '#151218'], [0.68, '#3a2422'], [0.78, '#5a3020'], [1, '#120c0a']]);
      g.fillRect(-M, 0, W + 2 * M, H);
      // 低い雲：下が火に照らされる
      for (let i = 0; i < 6; i++) {
        const y = 120 + i * 60, pts = ridge(rnd, y, 60, { rough: 0.6, n: 7 });
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const [x, yy] of pts) g.lineTo(x, yy);
        for (let k = pts.length - 1; k >= 0; k--) g.lineTo(pts[k][0], pts[k][1] + 50);
        g.closePath();
        g.fillStyle = vgrad(g, y - 30, y + 60, [[0, 'rgba(12,10,12,0.7)'], [1, `rgba(${90 + i * 20},${40 + i * 6},30,0.45)`]]); g.fill();
      }
    },
    far: (g) => {
      for (const b of blds) building(g, b, 640, '#15161b', ['rgba(255,200,120,0.6)', 'rgba(160,190,255,0.4)']);
      g.fillStyle = vgrad(g, 520, 660, [[0, 'rgba(90,50,30,0)'], [1, 'rgba(110,60,35,0.6)']]); g.fillRect(-M, 520, W + 2 * M, 140);
    },
    mid: (g) => {
      for (const b of near) building(g, b, 760, '#0b0b0e', ['rgba(255,170,90,0.5)']);
      g.fillStyle = '#0b0b0e'; g.fillRect(-M, 750, W + 2 * M, 30);
    },
    fore: (g) => {
      // 瓦礫と、鉄筋の出た壁、有刺鉄線
      g.fillStyle = '#050506';
      g.beginPath(); g.moveTo(-M, H + M);
      for (let x = -M; x <= W + M; x += 14) g.lineTo(x, 820 + Math.sin(x * 0.02) * 14 - rnd.next() ** 3 * 50);
      g.lineTo(W + M, H + M); g.closePath(); g.fill();
      g.fillRect(1240, 640, 170, 220);
      g.beginPath(); g.moveTo(1240, 640); g.lineTo(1290, 610); g.lineTo(1330, 655); g.lineTo(1370, 600); g.lineTo(1410, 640); g.fill();
      g.strokeStyle = '#050506'; g.lineWidth = 3;
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(1260 + k * 26, 615 + (k % 2) * 20); g.lineTo(1265 + k * 26 + (rnd.next() - 0.5) * 30, 540 + rnd.next() * 40); g.stroke(); }
      g.lineWidth = 1.4;
      for (let x = 60; x < 700; x += 22) { g.beginPath(); g.ellipse(x, 800, 14, 18, 0.3, 0, TAU); g.stroke(); }
    },
  };
  const glow = glowSprite(128), smoke = smokeSprite(180, rnd, '44,42,44', '150,80,45'), fire = flameSprite(48, 120, rnd);
  const lights = [{ x: 260, a: -1.2, s: 0.23 }, { x: 760, a: -1.9, s: -0.17 }, { x: 1280, a: -1.5, s: 0.13 }];
  const helis = [{ x: -200, y: 230, v: 70, s: 1 }, { x: 1900, y: 320, v: -55, s: 0.7 }];
  const booms = [];
  const ash = particles(S.low ? 50 : 110, (p, init) => { p.x = rnd.next() * W; p.y = init ? rnd.next() * H : -10; p.vx = 10 + rnd.next() * 15; p.vy = 18 + rnd.next() * 25; p.s = 1 + rnd.next() * 2; });
  const smokes = particles(S.low ? 6 : 12, (p, init) => { p.x = 200 + rnd.next() * 1200; p.y = init ? 300 + rnd.next() * 300 : 640; p.vx = 12 + rnd.next() * 10; p.vy = -14 - rnd.next() * 10; p.s = 160 + rnd.next() * 200; p.age = init ? 4 : 0; });
  const fires = [[330, 640], [870, 642], [1180, 640], [600, 760]];
  let lastBar = -1, lastBeat = -1;
  const tracers = [];
  return {
    layers,
    draw(g, st) {
      const { t, et, dt, bar, beat, env } = st;
      if (bar !== lastBar && bar >= 0) {
        booms.push({ x: 120 + rnd.next() * 1360, y: 600 + rnd.next() * 50, t0: et, s: 0.7 + rnd.next() * 0.7 });
        st.shake = Math.max(st.shake, 3); lastBar = bar;
      }
      if (beat !== lastBeat && beat >= 0) {
        lastBeat = beat;
        const n = st.low ? 2 : 4, x0 = rnd.next() < 0.5 ? 0 : W, red = rnd.next() < 0.6;
        for (let k = 0; k < n; k++) tracers.push({ t0: et + k * 0.06, x0, y0: 560 + rnd.next() * 120, dx: (x0 ? -1 : 1) * (900 + rnd.next() * 400), dy: -250 - rnd.next() * 200, red });
      }
      // 探照灯：根元から空へ、ゆっくり振れる光の筋
      g.globalCompositeOperation = 'lighter';
      for (const L of lights) {
        const a = L.a + Math.sin(t * L.s * 2 + L.x) * 0.45;
        const len = 1100, w = 0.07;
        const gr = g.createLinearGradient(L.x, 760, L.x + Math.cos(a) * len, 760 + Math.sin(a) * len);
        gr.addColorStop(0, 'rgba(200,215,255,0.32)'); gr.addColorStop(1, 'rgba(200,215,255,0)');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(L.x, 760);
        g.lineTo(L.x + Math.cos(a - w) * len, 760 + Math.sin(a - w) * len); g.lineTo(L.x + Math.cos(a + w) * len, 760 + Math.sin(a + w) * len);
        g.closePath(); g.fill();
      }
      // 遠くの火事
      for (const [i, [x, y]] of fires.entries()) {
        const k = 0.75 + 0.25 * Math.sin(t * 6 + i * 2);
        g.globalAlpha = 0.9; g.drawImage(fire, x - 18, y - 70 * k, 36, 70 * k);
        g.globalAlpha = 0.3; g.drawImage(glow, x - 90, y - 110, 180, 180);
      }
      // 爆発（小節の頭）：閃光と火の玉
      for (let i = booms.length - 1; i >= 0; i--) {
        const b = booms[i], age = et - b.t0;
        if (age > 2.2) { booms.splice(i, 1); continue; }
        const k = Math.exp(-age * 2.4), r = (60 + age * 160) * b.s;
        g.globalAlpha = k; g.drawImage(glow, b.x - r, b.y - r, r * 2, r * 2);
        g.globalAlpha = k * 0.8; g.drawImage(fire, b.x - r * 0.4, b.y - r * 1.1, r * 0.8, r * 1.2);
        st.flash = Math.max(st.flash, Math.exp(-age * 9) * 0.25);
      }
      // 曳光弾
      g.lineWidth = 2;
      for (let i = tracers.length - 1; i >= 0; i--) {
        const tr = tracers[i], u = (et - tr.t0) / 1.1;
        if (u > 1) { tracers.splice(i, 1); continue; }
        if (u < 0) continue;
        const x = tr.x0 + tr.dx * u, y = tr.y0 + tr.dy * u + u * u * 120;
        g.globalAlpha = 1 - u;
        g.strokeStyle = tr.red ? 'rgba(255,90,60,1)' : 'rgba(140,255,120,1)';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - tr.dx * 0.05, y - tr.dy * 0.05); g.stroke();
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      for (const p of smokes) {
        p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.s += dt * 14;
        if (p.y < -200) st.respawn(p, smokes);
        g.globalAlpha = clamp(p.age / 3) * 0.5; g.drawImage(smoke, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
      g.globalAlpha = 1;
      // ヘリコプター：影の形と、回る羽根のぼかし、点滅する赤い灯
      for (const h of helis) {
        h.x += h.v * dt; if (h.v > 0 && h.x > W + 300) h.x = -300; if (h.v < 0 && h.x < -300) h.x = W + 300;
        const y = h.y + Math.sin(t * 1.2 + h.s) * 8, s = h.s, d = Math.sign(h.v);
        g.save(); g.translate(h.x, y); g.scale(s * d, s);
        g.fillStyle = '#06060a';
        g.beginPath(); g.ellipse(0, 0, 46, 16, 0, 0, TAU); g.fill();
        g.fillRect(-110, -6, 80, 7); g.fillRect(-116, -20, 8, 22);
        g.fillRect(-20, 16, 50, 3); g.fillRect(-14, 12, 3, 6); g.fillRect(20, 12, 3, 6);
        g.fillStyle = 'rgba(10,10,14,0.55)'; g.beginPath(); g.ellipse(0, -18, 95, 5, 0, 0, TAU); g.fill();
        g.restore();
        if (Math.sin(t * 6 + h.s * 3) > 0.7) { g.globalCompositeOperation = 'lighter'; g.drawImage(glow, h.x - 10, y - 10, 20, 20); g.globalCompositeOperation = 'source-over'; }
      }
      st.paint('fore');
      g.fillStyle = 'rgba(180,170,165,0.55)';
      for (const p of ash) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > H + 10) st.respawn(p, ash); g.fillRect(p.x, p.y, p.s, p.s); }
    },
  };
};

// ---------------- 未来：光の街、空に浮かぶ光の輪、巨大な人型兵器、無人機の群れ、光線、雨 ----------------
ERAS.mirai = (S) => {
  const rnd = createRandom(505);
  const towers = [];
  for (let x = -M; x < W + M;) { const w = 30 + rnd.next() * 70; towers.push({ x, w, h: 200 + rnd.next() * 380, spire: rnd.next() < 0.3 }); x += w + rnd.next() * 12; }
  const near = [];
  for (let x = -M; x < W + M;) { const w = 60 + rnd.next() * 110; near.push({ x, w, h: 160 + rnd.next() * 260 }); x += w + 30 + rnd.next() * 60; }
  const neon = ['rgba(60,230,255,0.85)', 'rgba(255,60,200,0.8)', 'rgba(120,140,255,0.8)'];
  const layers = {
    sky: (g) => {
      g.fillStyle = vgrad(g, 0, H, [[0, '#03040b'], [0.4, '#0a1230'], [0.62, '#1d2350'], [0.72, '#45184a'], [1, '#07060c']]);
      g.fillRect(-M, 0, W + 2 * M, H);
      stars(g, rnd, 90, 300, 0.5);
    },
    far: (g) => {
      for (const b of towers) {
        g.fillStyle = '#0c1024'; g.fillRect(b.x, 680 - b.h, b.w, b.h);
        if (b.spire) { g.fillRect(b.x + b.w / 2 - 2, 680 - b.h - 80, 4, 80); }
        for (let y = 680 - b.h + 10; y < 670; y += 9) for (let x = b.x + 4; x < b.x + b.w - 4; x += 7) {
          if (rnd.next() < 0.18) { g.fillStyle = neon[(rnd.next() * 3) | 0].replace(/[\d.]+\)$/, `${0.25 + rnd.next() * 0.4})`); g.fillRect(x, y, 3, 4); }
        }
      }
      g.fillStyle = vgrad(g, 560, 700, [[0, 'rgba(255,60,200,0)'], [1, 'rgba(120,40,160,0.45)']]); g.fillRect(-M, 560, W + 2 * M, 140);
    },
    mid: (g) => {
      for (const b of near) {
        g.fillStyle = '#05060f'; g.fillRect(b.x, 790 - b.h, b.w, b.h);
        const c = neon[(rnd.next() * 3) | 0];
        g.fillStyle = c; g.fillRect(b.x + b.w * 0.2, 790 - b.h + 30, 4, b.h * 0.5);
        g.fillStyle = c.replace(/[\d.]+\)$/, '0.5)'); g.fillRect(b.x, 790 - b.h, b.w, 3);
      }
    },
    fore: (g) => {
      // 濡れた床：街の光が映る
      g.fillStyle = vgrad(g, 790, H, [[0, '#0a0b18'], [1, '#020205']]); g.fillRect(-M, 790, W + 2 * M, H - 790 + M);
      for (let i = 0; i < 40; i++) {
        const x = rnd.next() * W, c = neon[(rnd.next() * 3) | 0].replace(/[\d.]+\)$/, `${0.12 + rnd.next() * 0.15})`);
        g.fillStyle = c; g.fillRect(x, 800 + rnd.next() * 80, 2 + rnd.next() * 3, 30 + rnd.next() * 60);
      }
    },
  };
  const glow = glowSprite(128);
  const drones = particles(S.low ? 30 : 60, (p) => { p.ph = rnd.next() * TAU; p.r = 80 + rnd.next() * 160; p.sp = 0.3 + rnd.next() * 0.4; p.c = rnd.next() < 0.5; });
  const rain = particles(S.low ? 90 : 200, (p, init) => { p.x = rnd.next() * (W + 400) - 200; p.y = init ? rnd.next() * H : -20; p.v = 900 + rnd.next() * 500; p.l = 14 + rnd.next() * 20; });
  const traffic = particles(S.low ? 12 : 24, (p) => { p.y = 380 + rnd.next() * 220; p.x = rnd.next() * W; p.v = (rnd.next() < 0.5 ? -1 : 1) * (120 + rnd.next() * 260); p.c = rnd.next() < 0.5; });
  const beams = [];
  let lastBeat = -1, lastBar = -1, eye = 0;
  return {
    layers,
    draw(g, st) {
      const { t, et, dt, bar, beat, env } = st;
      g.globalCompositeOperation = 'lighter';
      // 空の光の輪（時の輪の形）：傾いた楕円が何重にも回る
      const cx = 820, cy = 260;
      for (let k = 0; k < 3; k++) {
        const R = 300 - k * 70, sq = 0.32 + k * 0.08, rot = t * (0.12 + k * 0.07) * (k % 2 ? -1 : 1);
        g.strokeStyle = `rgba(80,220,255,${0.28 + env * 0.2})`; g.lineWidth = 2;
        g.beginPath(); g.ellipse(cx, cy, R, R * sq, -0.12, 0, TAU); g.stroke();
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * TAU + rot, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * sq;
          const front = Math.sin(a) > 0 ? 1 : 0.4;
          g.fillStyle = `rgba(120,240,255,${0.5 * front})`; g.fillRect(x - 1.5, y - (i % 4 ? 2 : 6), 3, i % 4 ? 4 : 12);
        }
      }
      g.globalAlpha = 0.25 + env * 0.25; g.drawImage(glow, cx - 120, cy - 120, 240, 240); g.globalAlpha = 1;
      // 空の道を走る光
      for (const p of traffic) {
        p.x += p.v * dt; if (p.x > W + 40) p.x = -40; if (p.x < -40) p.x = W + 40;
        g.fillStyle = p.c ? 'rgba(255,90,210,0.8)' : 'rgba(90,230,255,0.8)'; g.fillRect(p.x, p.y, Math.sign(p.v) * -26, 2);
      }
      g.globalCompositeOperation = 'source-over';
      // 巨大な人型兵器：右から左へゆっくり歩く。小節の頭で目が光り、光線を撃つ
      const mx = 1180 - et * 6, my = 840, step = Math.sin(et * 1.6);
      g.save(); g.translate(mx, my); g.scale(1.35, 1.35); g.fillStyle = '#04050b';
      g.shadowColor = 'rgba(80,220,255,0.9)'; g.shadowBlur = 14;
      const leg = (dx, ph) => {
        const k = Math.sin(et * 1.6 + ph);
        g.beginPath(); g.moveTo(dx - 14, -190); g.lineTo(dx + 14, -190); g.lineTo(dx + 40 + k * 10, -100); g.lineTo(dx + 10 + k * 18, 0); g.lineTo(dx - 18 + k * 18, 0); g.lineTo(dx + 14 + k * 10, -100); g.closePath(); g.fill();
      };
      leg(-40, 0); leg(30, Math.PI);
      g.beginPath(); g.moveTo(-90, -190 + step * 3); g.lineTo(90, -190 + step * 3); g.lineTo(70, -290 + step * 3); g.lineTo(-60, -300 + step * 3); g.closePath(); g.fill();
      g.fillRect(-30, -330 + step * 3, 60, 34);
      g.fillRect(-150, -270 + step * 3, 70, 26); g.fillRect(-190, -262 + step * 3, 60, 10);   // 砲の腕
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,60,90,0.9)'; g.fillRect(-20, -318 + step * 3, 40, 5);   // 目の帯
      g.fillStyle = 'rgba(80,220,255,0.6)'; for (const [x, y] of [[-40, -190], [30, -190], [-60, -250], [60, -250]]) g.fillRect(x - 3, y + step * 3 - 3, 6, 6);
      g.restore();
      if (bar !== lastBar && bar >= 0) { lastBar = bar; eye = 1; beams.push({ t0: et, x0: mx - 190 * 1.35, y0: my - 257 * 1.35, x1: mx - 900 - rnd.next() * 400, y1: my - 40 + rnd.next() * 60, w: 6, c: '120,240,255' }); st.shake = Math.max(st.shake, 4); }
      if (beat !== lastBeat && beat >= 0) {
        lastBeat = beat;
        const fromL = rnd.next() < 0.5;
        beams.push({ t0: et, x0: fromL ? -50 : W + 50, y0: 200 + rnd.next() * 300, x1: fromL ? W * (0.4 + rnd.next() * 0.6) : W * rnd.next() * 0.6, y1: 500 + rnd.next() * 250, w: 2.5, c: rnd.next() < 0.5 ? '255,80,210' : '120,240,255' });
      }
      eye = Math.max(0, eye - dt * 2);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.6 + eye * 0.4; g.drawImage(glow, mx - 40, my - (318 - step * 3) * 1.35 - 40, 80, 80);
      // 光線
      for (let i = beams.length - 1; i >= 0; i--) {
        const b = beams[i], age = et - b.t0;
        if (age > 0.6) { beams.splice(i, 1); continue; }
        const k = 1 - age / 0.6;
        g.globalAlpha = k; g.strokeStyle = `rgba(${b.c},1)`; g.lineWidth = b.w * (1 + (1 - k) * 2);
        g.beginPath(); g.moveTo(b.x0, b.y0); g.lineTo(b.x1, b.y1); g.stroke();
        g.globalAlpha = k * 0.6; g.drawImage(glow, b.x1 - 60, b.y1 - 60, 120, 120);
      }
      // 無人機の群れ（8 の字を描いて飛ぶ光の点）
      for (const p of drones) {
        const a = t * p.sp + p.ph;
        const x = 500 + Math.sin(a) * p.r * 2.2 + Math.sin(t * 0.2) * 200, y = 330 + Math.sin(a * 2) * p.r * 0.5;
        g.globalAlpha = 0.7; g.drawImage(glow, x - 5, y - 5, 10, 10);
        g.fillStyle = p.c ? 'rgba(255,120,220,1)' : 'rgba(140,240,255,1)'; g.fillRect(x - 1, y - 1, 2, 2);
      }
      g.globalAlpha = 1;
      st.paint('fore');
      // 雨（斜めの細い線）
      g.strokeStyle = 'rgba(150,190,255,0.28)'; g.lineWidth = 1;
      g.beginPath();
      for (const p of rain) { p.y += p.v * dt; p.x += p.v * 0.18 * dt; if (p.y > H) st.respawn(p, rain); g.moveTo(p.x, p.y); g.lineTo(p.x - p.l * 0.18, p.y - p.l); }
      g.stroke();
      g.globalCompositeOperation = 'source-over';
      // 光る走査線（未来らしい、うすい横縞）
      g.fillStyle = 'rgba(120,200,255,0.035)';
      for (let y = (t * 40) % 6; y < H; y += 6) g.fillRect(-M, y, W + 2 * M, 1);
    },
  };
};

// =====================================================================
// 本体：画面いっぱいの canvas。題の曲の時刻表に合わせて、時代の絵を出す・しまう
// =====================================================================
export const ERA_NAMES = Object.keys(ERAS);

export function createEraBackdrop({ quality = 'medium', parent = document.body } = {}) {
  const low = quality === 'low';
  const cap = low ? 1280 : quality === 'high' ? 2048 : 1600;   // 横の画素の上限（iPad で重くしない）
  const el = document.createElement('canvas');
  el.className = 'era-backdrop';
  el.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:12;pointer-events:none;opacity:0;display:block;';
  parent.appendChild(el);
  const g = el.getContext('2d');
  let cw = 0, ch = 0, s = 1, ox = 0, oy = 0;
  const built = {};   // 時代ごとの { scene, layers: { name: canvas } }
  let cur = null, shownAlpha = 0, shakeLv = 0, flashLv = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    let pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (pw > cap) { ph = Math.round(ph * (cap / pw)); pw = cap; }
    if (pw === cw && ph === ch) return;
    cw = el.width = pw; ch = el.height = ph;
    s = Math.max(cw / W, ch / H);           // 覆うように拡げる
    ox = (cw - W * s) / 2; oy = (ch - H * s) / 2;
    for (const k of Object.keys(built)) built[k].layers = null;   // 動かない層は描き直す
  }
  function layersOf(b) {
    if (b.layers) return b.layers;
    b.layers = {};
    for (const [name, paint] of Object.entries(b.scene.layers)) {
      const k = s * (name === 'sky' ? 0.5 : 0.75);
      const [c, cg] = mk((W + 2 * M) * k, (H + 2 * M) * k);
      cg.setTransform(k, 0, 0, k, M * k, M * k);
      paint(cg);
      b.layers[name] = c;
    }
    return b.layers;
  }
  function scene(era) {
    if (!built[era]) built[era] = { scene: ERAS[era]({ low }), layers: null };
    return built[era];
  }
  const respawnRnd = createRandom(909);
  /** 動かない層を、少しずつずらして描く（遠い層ほど動かない） */
  function paintLayer(L, name, dx, dy) {
    const c = L[name]; if (!c) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(c, ox - M * s + dx * s, oy - M * s + dy * s, (W + 2 * M) * s, (H + 2 * M) * s);
  }

  return {
    el,
    /** 先に絵を作っておく（出るときの引っかかりを無くす）。今の時代と次の時代のほかは、絵を捨てる（メモリ） */
    prepare(era) {
      if (!ERAS[era]) return;
      resize(); layersOf(scene(era));
      for (const k of Object.keys(built)) if (k !== era && k !== cur) built[k].layers = null;
    },
    /** 全部の絵を捨てる（題の画面を離れたとき） */
    release() { for (const k of Object.keys(built)) built[k].layers = null; cur = null; el.style.opacity = '0'; shownAlpha = 0; },
    /**
     * 毎フレーム。st：{ era, alpha（0〜1）, t（曲の時刻）, et（時代の始まりからの秒）, dt, sec（時刻表の時代の部分）,
     *   bar・beat（時代の始まりから何小節目・何拍目。無ければ -1）, env（曲の大きさ 0〜1） }
     */
    update(st) {
      const a = st ? clamp(st.alpha) : 0;
      if (a !== shownAlpha) { el.style.opacity = a.toFixed(3); shownAlpha = a; }
      if (a <= 0.001 || !st.era || !ERAS[st.era]) { cur = null; return; }
      resize();
      const b = scene(st.era), L = layersOf(b);
      if (cur !== st.era) { cur = st.era; }
      const sx = Math.sin(st.et * 0.09) * 26, sy = Math.cos(st.et * 0.07) * 6;
      const jx = (Math.random() - 0.5) * shakeLv, jy = (Math.random() - 0.5) * shakeLv;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch);
      paintLayer(L, 'sky', sx * 0.15 + jx * 0.3, sy * 0.15 + jy * 0.3);
      paintLayer(L, 'far', sx * 0.35 + jx * 0.5, sy * 0.3 + jy * 0.5);
      paintLayer(L, 'mid', sx * 0.6 + jx, sy * 0.5 + jy);
      // 動く物は、手前の層の少し後ろ（mid と fore の間）に描き、fore は scene が呼ぶ
      const ctx = {
        ...st, low,
        shake: 0, flash: 0,
        paint: (name) => {
          paintLayer(L, name, sx + jx * 1.3, sy * 0.8 + jy * 1.3);
          g.setTransform(s, 0, 0, s, ox + (sx + jx * 1.3) * s, oy + (sy * 0.8 + jy * 1.3) * s);
        },
        respawn: (p, list, at) => {   // 粒をもう一度生む（at があればその所から）
          list.spawn?.(p);
          if (at) { p.x = at.x; p.y = at.y; p.age = 0; }
        },
      };
      g.setTransform(s, 0, 0, s, ox + (sx * 0.6 + jx) * s, oy + (sy * 0.5 + jy) * s);
      b.scene.draw(g, ctx);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      // 題の文字が読めるよう、真ん中の上を少し暗く（ふち取りの影）
      const v = g.createRadialGradient(cw / 2, ch * 0.45, Math.min(cw, ch) * 0.1, cw / 2, ch * 0.45, Math.max(cw, ch) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0.28)'); v.addColorStop(0.5, 'rgba(0,0,0,0.05)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = v; g.fillRect(0, 0, cw, ch);
      // 揺れと光：絵が出した分は少しずつ収める。切り替わりの合図の光（st.flash）はそのまま重ねる
      shakeLv = Math.max(shakeLv * Math.exp(-st.dt * 8), ctx.shake);
      flashLv = Math.max(flashLv * Math.exp(-st.dt * 5), ctx.flash);
      const fl = Math.max(st.flash || 0, flashLv);
      if (fl > 0.01) { g.fillStyle = `rgba(255,236,200,${clamp(fl)})`; g.fillRect(0, 0, cw, ch); }
    },
    dispose() { el.remove(); },
  };
}
