// 題の画面の背景（3D）：どの時代にも寄らない「時の輪」。
//   暗い星空に、古びた青銅の輪が三重に浮かび、それぞれ別の傾きでゆっくり回る（時計や天球儀のよう。時代を超えて戦う場）。
//   外の輪は歯車で、両脇の小さな歯車と歯の数の比で噛み合って回る。真ん中の輪は目盛りの環、内の輪は内向きの歯の歯車。
//   どの輪も溝に作り字の印や目盛りが金色に光る（どの国・時代の字でもない）。
//   中心に光る核と柔らかい光の筋。その前に光る文字盤と金の針：長い針は題の曲の時計の音に合わせて 1 拍ずつ 45° 進み、
//   鐘の拍（8 拍ごと）で一周して光り、光の輪が広がる。短い針は鐘の拍ごとに 1 目盛り進む。
//   周りを漂う岩のかけら、舞い上がる火の粉、遠くの星と星雲
// 大廳（render/hall.js）と同じく、森とは別の層（Title）に作り、このカメラだけが描く（森の空・霧・光は入らない）
// iPad で重くしない：描画命令は 50 回ほど。星と火の粉はそれぞれ 1 つの形にまとめる。
//   絵はその場で作る（読み込む画像は岩の質感だけ）。画質が low なら輪の細かさ・粒の数・絵の大きさを落とす
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { SURFACES } from '../world/build-kit.js';
import { loadTextureSet } from '../world/materials.js';
import { createRandom } from '../core/random.js';

const ORIGIN = [0, -800, 0];   // 森とも大廳とも離れた所（描くのはこのカメラだけ）
const TAU = Math.PI * 2;
const smooth = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, x) => smooth(Math.min(1, Math.max(0, (x - a) / (b - a))));

// =====================================================================
// 絵（その場で作る）
// =====================================================================

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
/** 絵から質感を作る。wrap：'u' なら横だけ繰り返す、'uv' なら縦横とも。srgb：色の絵は true（法線の絵は false） */
function makeTexture(device, canvas, { mipmaps = true, wrap = '', srgb = true, name = 'title' } = {}) {
  const t = new pc.Texture(device, {
    name, width: canvas.width, height: canvas.height, format: pc.PIXELFORMAT_RGBA8, mipmaps, srgb,
    minFilter: mipmaps ? pc.FILTER_LINEAR_MIPMAP_LINEAR : pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR,
    addressU: wrap.includes('u') ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: wrap.includes('v') ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
  });
  t.setSource(canvas);
  return t;
}
/**
 * 画素ごとに色を決める絵。f(u, v, i, out)：u・v は -1〜1、i は画素の番号、out に [r, g, b]（0〜1）を入れる。
 * 加算で重ねる光の絵は黒地にする（透明を使うと、薄い所で色が崩れて点々が出る）
 */
function pixelTexture(device, w, h, f, opts) {
  const [c, g] = canvas2d(w, h);
  const img = g.createImageData(w, h), d = img.data, out = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      f(((x + 0.5) / w) * 2 - 1, ((y + 0.5) / h) * 2 - 1, i, out);
      d[i * 4] = Math.min(255, Math.max(0, out[0] * 255));
      d[i * 4 + 1] = Math.min(255, Math.max(0, out[1] * 255));
      d[i * 4 + 2] = Math.min(255, Math.max(0, out[2] * 255));
      d[i * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return makeTexture(device, c, opts);
}
/** 端が繋がる雲のような値（0〜1）。S×S。octaves 段の細かさを重ねる */
function fbm(S, rnd, octaves = 5, base = 4, gain = 0.55) {
  const out = new Float32Array(S * S);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const G = Math.min(S, base << o), grid = new Float32Array(G * G);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd.next();
    const k = G / S;
    for (let y = 0; y < S; y++) {
      const fy = y * k, y0 = Math.floor(fy), ty = smooth(fy - y0), r0 = (y0 % G) * G, r1 = ((y0 + 1) % G) * G;
      for (let x = 0; x < S; x++) {
        const fx = x * k, x0 = Math.floor(fx) % G, tx = smooth(fx - Math.floor(fx)), x1 = (x0 + 1) % G;
        const a = grid[r0 + x0] + (grid[r0 + x1] - grid[r0 + x0]) * tx;
        const b = grid[r1 + x0] + (grid[r1 + x1] - grid[r1 + x0]) * tx;
        out[y * S + x] += amp * (a + (b - a) * ty);
      }
    }
    total += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** 青銅の肌：明るさのむらと、くぼみの緑青（色の絵）、打ち出したような細かな凹凸（法線の絵） */
function patinaTextures(device, rnd) {
  const S = 256, H = fbm(S, rnd, 6, 4, 0.55), F = fbm(S, rnd, 4, 8, 0.5);
  const col = pixelTexture(device, S, S, (u, v, i, out) => {
    const h = H[i], f = F[i];
    const shade = 0.7 + 0.42 * h - 0.25 * Math.max(0, 0.42 - f);
    const green = Math.max(0, 0.4 - h) * 1.2;
    out[0] = shade * (1 - green * 0.55); out[1] = shade * (1 + green * 0.1); out[2] = shade * (1 - green * 0.15);
  }, { wrap: 'uv', name: 'title-patina' });
  const nor = pixelTexture(device, S, S, (u, v, i, out) => {
    const x = i % S, y = (i / S) | 0;
    const hx = H[y * S + ((x + 1) % S)] - H[y * S + ((x + S - 1) % S)];
    const hy = H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x];
    let nx = -hx * 5, ny = -hy * 5, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    out[0] = nx * 0.5 + 0.5; out[1] = ny * 0.5 + 0.5; out[2] = nz * 0.5 + 0.5;
  }, { wrap: 'uv', srgb: false, name: 'title-patina-normal' });
  return { diffuse: col, normal: nor };
}

/**
 * 金属に映る周り（球の絵。見る向きから決まる）。真ん中＝正面、上が上。
 * 左上に強い光、下に核の橙、右の縁に冷たい光。空の写真が無くても金属らしく光る
 */
function sphereTexture(device) {
  const S = 256, [c, g] = canvas2d(S, S);
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  const blob = (x, y, r, rgb, a) => {
    const gr = g.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  };
  blob(0.5, 0.5, 0.52, '150,108,62', 0.9);       // 正面：暖かい鈍い光
  blob(0.3, 0.26, 0.3, '255,232,184', 1);         // 左上：強い光
  blob(0.36, 0.2, 0.1, '255,250,235', 0.9);       // その芯
  blob(0.52, 0.84, 0.32, '255,138,46', 0.8);      // 下：核の橙
  blob(0.9, 0.48, 0.2, '96,140,240', 0.35);       // 右の縁：冷たい光
  blob(0.1, 0.66, 0.18, '255,196,120', 0.45);     // 左下：照り返し
  // 円の外（向こう向きの反射）は暗く
  g.globalCompositeOperation = 'multiply';
  const v = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.5);
  v.addColorStop(0, '#fff'); v.addColorStop(1, '#1a1410');
  g.fillStyle = v; g.fillRect(0, 0, S, S);
  return makeTexture(device, c, { name: 'title-sphere' });
}

/** 柔らかい光の玉（黒地）。fall(r)：中心からの距離 r（0〜1）→ 明るさ */
function glowTexture(device, S, rgb, fall) {
  return pixelTexture(device, S, S, (u, v, i, out) => {
    const r = Math.min(1, Math.hypot(u, v));
    const k = fall(r) * (1 - smoothstep(0.8, 1, r));
    out[0] = rgb[0] * k; out[1] = rgb[1] * k; out[2] = rgb[2] * k;
  }, { name: 'title-glow' });
}

/** 柔らかく先細りの光の筋（中心から放つ）。2 枚を逆向きに回して重ねる */
function raysTexture(device, rnd, S) {
  const [c, g] = canvas2d(S, S), m = S / 2;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rnd.next() - 0.5) * 0.16;
    const len = (0.4 + rnd.next() ** 1.4 * 0.6) * m;
    const b = 0.2 + rnd.next() * 0.6;
    for (const [w, k] of [[0.006 + rnd.next() ** 2 * 0.03, 0.5], [0.002 + rnd.next() * 0.006, 1]]) {   // 広く淡い筋と、細く明るい芯
      const gr = g.createRadialGradient(m, m, 0, m, m, len);
      gr.addColorStop(0, `rgba(255,255,255,${b * k})`); gr.addColorStop(0.3, `rgba(255,255,255,${b * k * 0.4})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(m, m);
      g.lineTo(m + Math.sin(a - w) * len, m - Math.cos(a - w) * len);
      g.lineTo(m + Math.sin(a + w) * len, m - Math.cos(a + w) * len);
      g.closePath(); g.fill();
    }
  }
  g.globalCompositeOperation = 'multiply';
  const v = g.createRadialGradient(m, m, 0, m, m, m);
  v.addColorStop(0, '#fff'); v.addColorStop(0.6, '#777'); v.addColorStop(1, '#000');
  g.fillStyle = v; g.fillRect(0, 0, S, S);
  return makeTexture(device, c, { name: 'title-rays' });
}

/** 遠くの星雲：深い藍に、藍・紫・青緑の雲。輪の後ろだけ暖かく、周りへ暗く */
function nebulaTexture(device, rnd, S) {
  const A = fbm(S, rnd, 6, 3, 0.55), B = fbm(S, rnd, 5, 4, 0.5), C = fbm(S, rnd, 4, 2, 0.6);
  return pixelTexture(device, S, S, (u, v, i, out) => {
    const a = A[i], b = B[i], tint = C[i];
    const r = Math.hypot(u, v * 0.85);
    const cloud = smoothstep(0.4, 0.8, a);
    const wisp = smoothstep(0.52, 0.82, b) * (0.4 + cloud);
    let R = 0.012 + cloud * 0.06, G = 0.016 + cloud * 0.08, Bc = 0.04 + cloud * 0.2;
    R += wisp * 0.16 * tint; G += wisp * 0.1 * (1 - tint); Bc += wisp * 0.16;   // 紫と青緑の筋
    const warm = Math.exp(-r * r * 5) * (0.55 + 0.45 * a);                      // 輪の後ろの暖かい光
    R += warm * 0.3; G += warm * 0.14; Bc += warm * 0.04;
    const vig = 1 - smoothstep(0.45, 1.3, r);
    out[0] = R * vig; out[1] = G * vig; out[2] = Bc * vig;
  }, { name: 'title-nebula' });
}

/** 光の輪（鐘の拍で広がる波）：縁が明るく、内へ淡く消える */
function waveTexture(device, S) {
  return pixelTexture(device, S, S, (u, v, i, out) => {
    const r = Math.hypot(u, v);
    const k = r > 1 ? 0 : Math.exp(-(((r - 0.9) / 0.04) ** 2)) * (1 - smoothstep(0.97, 1, r)) + Math.max(0, (r - 0.55) / 0.35) ** 3 * 0.22 * (1 - smoothstep(0.86, 0.93, r));
    out[0] = k; out[1] = k * 0.82; out[2] = k * 0.55;
  }, { name: 'title-wave' });
}

/**
 * 作り字（どの国・時代の字でもない印）：縦・横・斜めの線、円、弧、山形、点を 2〜4 つ組み合わせる。
 * 光る線で描く（shadowBlur で滲ませる）
 */
function drawGlyph(g, cx, cy, s, rnd) {
  const n = 2 + Math.floor(rnd.next() * 3), h = s / 2;
  g.beginPath();
  const dots = [];
  for (let k = 0; k < n; k++) {
    const t = Math.floor(rnd.next() * 7);
    const x = cx + (rnd.next() - 0.5) * s * 0.5, y = cy + (rnd.next() - 0.5) * s * 0.5;
    if (t === 0) { g.moveTo(x, cy - h); g.lineTo(x, cy + h); }
    else if (t === 1) { g.moveTo(cx - h * 0.8, y); g.lineTo(cx + h * 0.8, y); }
    else if (t === 2) { const d = rnd.next() < 0.5 ? 1 : -1; g.moveTo(cx - h * 0.7 * d, cy - h); g.lineTo(cx + h * 0.7 * d, cy + h); }
    else if (t === 3) { g.moveTo(x + s * 0.2, y); g.arc(x, y, s * 0.2, 0, TAU); }
    else if (t === 4) { const a0 = rnd.next() * TAU; g.moveTo(cx + Math.cos(a0) * h * 0.7, cy + Math.sin(a0) * h * 0.7); g.arc(cx, cy, h * 0.7, a0, a0 + Math.PI); }
    else if (t === 5) { const d = rnd.next() < 0.5 ? 1 : -1; g.moveTo(cx - h * 0.7, y - h * 0.4 * d); g.lineTo(cx, y + h * 0.4 * d); g.lineTo(cx + h * 0.7, y - h * 0.4 * d); }
    else dots.push([x, y]);
  }
  g.stroke();
  for (const [x, y] of dots) { g.beginPath(); g.arc(x, y, s * 0.07, 0, TAU); g.fill(); }
}
/** 光る線の描き方（金色の滲み） */
function glowPen(g, width, blur) {
  g.strokeStyle = '#fff3d6'; g.fillStyle = '#fff3d6';
  g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = 'rgba(255,186,90,0.95)'; g.shadowBlur = blur;
}
/**
 * 輪の溝に貼る帯（横に繰り返す）。上（v=0）が輪の外側。
 * 'glyph'：作り字と区切りの菱形、上下に細い線。'ticks'：目盛り（長短）と菱形
 */
function bandTexture(device, rnd, kind) {
  const W = 1024, H = kind === 'ticks' ? 64 : 128, [c, g] = canvas2d(W, H);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  if (kind === 'ticks') {
    glowPen(g, 2, 4);
    g.globalAlpha = 0.55;
    g.beginPath(); g.moveTo(0, 6); g.lineTo(W, 6); g.moveTo(0, H - 6); g.lineTo(W, H - 6); g.stroke();
    g.globalAlpha = 1;
    for (let x = 0; x < W; x += 16) {
      const major = x % 128 === 0, mid = x % 64 === 0;
      g.lineWidth = major ? 4 : mid ? 3 : 2;
      g.beginPath(); g.moveTo(x + 8, 8); g.lineTo(x + 8, major ? H - 14 : mid ? H * 0.62 : H * 0.42); g.stroke();
    }
    for (let x = 64; x < W; x += 128) {
      g.beginPath(); g.moveTo(x + 8, H * 0.5); g.lineTo(x + 14, H * 0.72); g.lineTo(x + 8, H - 10); g.lineTo(x + 2, H * 0.72); g.closePath(); g.fill();
    }
  } else {
    glowPen(g, 2.5, 5);
    g.globalAlpha = 0.6;
    g.beginPath(); g.moveTo(0, 9); g.lineTo(W, 9); g.moveTo(0, H - 9); g.lineTo(W, H - 9); g.stroke();
    g.globalAlpha = 1;
    const cells = 14, cw = W / cells;
    for (let k = 0; k < cells; k++) {
      const cx = (k + 0.5) * cw;
      g.lineWidth = 5.5;
      drawGlyph(g, cx, H / 2, H * 0.52, rnd);
      // 区切りの小さな菱形
      const x = (k + 1) * cw;
      g.beginPath(); g.moveTo(x, H / 2 - 7); g.lineTo(x + 5, H / 2); g.lineTo(x, H / 2 + 7); g.lineTo(x - 5, H / 2); g.closePath(); g.fill();
    }
  }
  return makeTexture(device, c, { wrap: 'u', name: `title-band-${kind}` });
}

/**
 * 光る文字盤（針の後ろ）。8 拍に合わせた 8 つの大きな目盛り（上が鐘の拍）、細かい目盛り 64、作り字、何重かの円
 * 上（キャンバスの上）が画面の上
 */
function dialTexture(device, rnd, S) {
  const [c, g] = canvas2d(S, S), m = S / 2, R = m * 0.985, k = S / 1024;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const P = (a, r) => [m + Math.sin(a) * r, m - Math.cos(a) * r];
  glowPen(g, 2.2 * k, 8 * k);
  const circle = (r, w, a) => { g.globalAlpha = a; g.lineWidth = w * k; g.beginPath(); g.arc(m, m, r, 0, TAU); g.stroke(); };
  circle(R, 2.6, 0.75); circle(R * 0.935, 1.6, 0.45); circle(R * 0.66, 1.4, 0.22); circle(R * 0.6, 1, 0.14); circle(R * 0.2, 1.4, 0.28);
  // 細かい目盛り（1 拍を 8 つに）
  g.globalAlpha = 0.6;
  for (let i = 0; i < 64; i++) {
    if (i % 8 === 0) continue;
    const a = (i / 64) * TAU, half = i % 4 === 0;
    const [x0, y0] = P(a, R * (half ? 0.905 : 0.94)), [x1, y1] = P(a, R * 0.975);
    g.lineWidth = (half ? 3 : 2) * k;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  // 中の淡い放射線
  g.globalAlpha = 0.12; g.lineWidth = 1.5 * k;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, [x0, y0] = P(a, R * 0.22), [x1, y1] = P(a, R * 0.6);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  // 大きな目盛り（細長い菱形）。上は鐘の拍：大きく、上に小さな円
  g.globalAlpha = 1;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, bell = i === 0;
    const r0 = R * (bell ? 0.74 : 0.79), r1 = R * 0.975, w = (bell ? 0.05 : 0.032) * R;
    const [ax, ay] = P(a, r0), [bx, by] = P(a, r1), [mx, my] = P(a, (r0 + r1) / 2);
    const tx = Math.cos(a) * w, ty = Math.sin(a) * w;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(mx + tx, my + ty); g.lineTo(bx, by); g.lineTo(mx - tx, my - ty); g.closePath(); g.fill();
    if (bell) { const [cx, cy] = P(a, R * 0.69); g.lineWidth = 3 * k; g.beginPath(); g.arc(cx, cy, R * 0.028, 0, TAU); g.stroke(); }
  }
  // 大きな目盛りの間の作り字
  g.globalAlpha = 0.5;
  for (let i = 0; i < 8; i++) {
    const [x, y] = P(((i + 0.5) / 8) * TAU, R * 0.8);
    g.lineWidth = 3 * k;
    drawGlyph(g, x, y, R * 0.075, rnd);
  }
  return makeTexture(device, c, { name: 'title-dial' });
}

// =====================================================================
// 形（頂点を貯めて作る）
// =====================================================================

/** 頂点（位置・法線・UV・色）と三角形を貯める入れ物。三角形の表は、頂点の法線の向きに合わせて自動で決める */
function geo() {
  const P = [], N = [], U = [], C = [], I = [];
  const G = {
    P, N, U, C, I,
    vert(p, n, uv, c) {
      P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); U.push(uv[0], uv[1]); C.push(c[0], c[1], c[2], 1);
      return P.length / 3 - 1;
    },
    tri(a, b, c) {
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const mx = N[a * 3] + N[b * 3] + N[c * 3], my = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], mz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
      if (nx * mx + ny * my + nz * mz < 0) I.push(a, c, b); else I.push(a, b, c);
    },
    /** 平らな凸の多角形。hint：表の向きの目安（この向きと同じ側を表にする） */
    flat(pts, c, hint, tile = 1) {
      let nx = 0, ny = 0, nz = 0;
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
      }
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return;
      nx /= l; ny /= l; nz /= l;
      if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      const ids = pts.map((p) => {
        const uv = ay >= ax && ay >= az ? [p[0], p[2]] : ax >= az ? [p[2], p[1]] : [p[0], p[1]];
        return G.vert(p, [nx, ny, nz], [uv[0] / tile, uv[1] / tile], c);
      });
      for (let k = 1; k < n - 1; k++) G.tri(ids[0], ids[k], ids[k + 1]);
    },
  };
  return G;
}
function toMesh(device, G) {
  return createMesh(device, { positions: G.P, normals: G.N, uvs: G.U, colors: G.C, indices: G.I });
}

/**
 * 断面（[半径, 高さ] の閉じた多角形）を軸の周りに一周回した形。継ぎ目なく滑らかに丸く、断面の角は角のまま。
 * axis 'y'：XZ の面に寝た輪（軸 Y。時の輪・歯車）。'z'：XY の面の輪（軸 Z。針の部品。中心 cx, cy）
 * col(k)：断面の k 番目の辺の色
 */
function lathe(G, prof, segs, col, { axis = 'y', cx = 0, cy = 0, tile = 1.2 } = {}) {
  const n = prof.length;
  let area = 0;
  for (let k = 0; k < n; k++) { const A = prof[k], B = prof[(k + 1) % n]; area += A[0] * B[1] - B[0] * A[1]; }
  const sgn = area > 0 ? 1 : -1;
  let vAcc = 0;
  for (let k = 0; k < n; k++) {
    const A = prof[k], B = prof[(k + 1) % n];
    const dr = B[0] - A[0], dh = B[1] - A[1], len = Math.hypot(dr, dh);
    if (len < 1e-6) continue;
    const nr = (sgn * dh) / len, nh = (-sgn * dr) / len;
    const c = col(k), rm = Math.max(0.2, (A[0] + B[0]) / 2);
    const base = G.P.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU, s = Math.sin(a), co = Math.cos(a);
      for (const [Q, v] of [[A, vAcc], [B, vAcc + len]]) {
        const p = axis === 'y' ? [s * Q[0], Q[1], co * Q[0]] : [cx + s * Q[0], cy + co * Q[0], Q[1]];
        const nn = axis === 'y' ? [s * nr, nh, co * nr] : [s * nr, co * nr, nh];
        G.vert(p, nn, [(a * rm) / tile, v / tile], c);
      }
    }
    for (let i = 0; i < segs; i++) { const a = base + i * 2; G.tri(a, a + 1, a + 3); G.tri(a, a + 3, a + 2); }
    vAcc += len;
  }
}
/** 8 つの角の立体（下の面 0〜3、上の面 4〜7 を同じ順に）。凸の形に限る */
function hexa(G, q, c) {
  const m = [0, 0, 0];
  for (const p of q) { m[0] += p[0] / 8; m[1] += p[1] / 8; m[2] += p[2] / 8; }
  for (const f of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
    const pts = f.map((i) => q[i]);
    const fc = [0, 0, 0];
    for (const p of pts) { fc[0] += p[0] / 4; fc[1] += p[1] / 4; fc[2] += p[2] / 4; }
    G.flat(pts, c, [fc[0] - m[0], fc[1] - m[1], fc[2] - m[2]]);
  }
}
/**
 * 歯車の歯（台形の柱）。角度 a の向きに、半径 rb（根もと）から rt（先）へ。wb・wt は根もとと先の幅の半分。
 * h0〜h1 は厚み（Y）。先の厚みは inset だけ薄くして、面取りしたように光を受ける
 */
function tooth(G, a, rb, rt, wb, wt, h0, h1, c, inset = 0) {
  const s = Math.sin(a), co = Math.cos(a);
  const P = (r, w, h) => [s * r + co * w, h, co * r - s * w];
  hexa(G, [P(rb, -wb, h0), P(rb, wb, h0), P(rt, wt, h0 + inset), P(rt, -wt, h0 + inset),
    P(rb, -wb, h1), P(rb, wb, h1), P(rt, wt, h1 - inset), P(rt, -wt, h1 - inset)], c);
}
/** 輪の断面：面取りした角、表に 2 本の縁と、その間の溝（光る帯を入れる） */
function ringProfile(r0, r1, h, { lip = 0.1, depth = 0.06, bev = 0.04 } = {}) {
  const t = h / 2;
  return [
    [r0 + bev, -t], [r1 - bev, -t],                 // 0 裏
    [r1, -t + bev], [r1, t - bev],                   // 1 角・2 外の壁
    [r1 - bev, t],                                    // 3 角（金に光る）
    [r1 - lip, t],                                    // 4 外の縁
    [r1 - lip - depth * 0.7, t - depth],              // 5 溝の斜面
    [r0 + lip + depth * 0.7, t - depth],              // 6 溝の底
    [r0 + lip, t],                                    // 7 溝の斜面
    [r0 + bev, t],                                    // 8 内の縁
    [r0, t - bev], [r0, -t + bev],                    // 9 角・10 内の壁、11 角
  ];
}
const GOLD = [1, 0.8, 0.46], GOLD2 = [0.9, 0.7, 0.4], BRONZE = [0.46, 0.36, 0.25], DARK = [0.24, 0.19, 0.14];
/** 輪の断面の辺ごとの色：角と縁は金、壁は青銅、溝と裏は暗く */
const ringColor = (k) => (k === 3 || k === 9 ? GOLD : k === 4 || k === 8 ? GOLD2 : k === 2 || k === 10 || k === 1 || k === 11 ? BRONZE : DARK);
/** 面取りしただけの輪の断面（歯車の縁・軸） */
const plainProfile = (r0, r1, h0, h1, bev) => [[r0 + bev, h0], [r1 - bev, h0], [r1, h0 + bev], [r1, h1 - bev], [r1 - bev, h1], [r0 + bev, h1], [r0, h1 - bev], [r0, h0 + bev]];
const plainColor = (k) => (k === 3 || k === 5 ? GOLD : k === 4 ? GOLD2 : k === 0 ? DARK : BRONZE);

/** 溝の底に敷く平らな帯（光る印の絵を貼る）。v=0 が外側 */
function bandMesh(device, rA, rB, y, segs, repeats) {
  const G = geo(), W = [1, 1, 1];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * TAU, s = Math.sin(a), c = Math.cos(a);
    G.vert([s * rA, y, c * rA], [0, 1, 0], [(i / segs) * repeats, 1], W);
    G.vert([s * rB, y, c * rB], [0, 1, 0], [(i / segs) * repeats, 0], W);
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; G.tri(a, a + 1, a + 3); G.tri(a, a + 3, a + 2); }
  return toMesh(device, G);
}

/**
 * 針の刃：中心の稜線から両側へ下る 2 枚の斜面（剣の刃のように光を受ける）と、縁の壁。
 * lv：[[y, 幅の半分], ...]（y の小さい順）。表（+Z）を画面へ向ける
 */
function blade(G, lv, z0, z1, ridge, c) {
  const n = lv.length;
  const R = (i, z) => [lv[i][1], lv[i][0], z], L = (i, z) => [-lv[i][1], lv[i][0], z], S = (i) => [0, lv[i][0], z1 + ridge];
  for (let i = 0; i < n - 1; i++) {
    G.flat([R(i, z0), R(i + 1, z0), R(i + 1, z1), R(i, z1)], c, [1, 0, 0]);
    G.flat([L(i, z0), L(i + 1, z0), L(i + 1, z1), L(i, z1)], c, [-1, 0, 0]);
    G.flat([R(i, z1), R(i + 1, z1), S(i + 1), S(i)], c, [0.3, 0, 1]);
    G.flat([L(i, z1), L(i + 1, z1), S(i + 1), S(i)], c, [-0.3, 0, 1]);
  }
  if (lv[0][1] > 0) { G.flat([L(0, z0), R(0, z0), R(0, z1), L(0, z1)], c, [0, -1, 0]); G.flat([L(0, z1), R(0, z1), S(0)], c, [0, -1, 0.2]); }
  if (lv[n - 1][1] > 0) { const k = n - 1; G.flat([L(k, z0), R(k, z0), R(k, z1), L(k, z1)], c, [0, 1, 0]); G.flat([L(k, z1), R(k, z1), S(k)], c, [0, 1, 0.2]); }
}
/** 針の透かしの輪（中心 cx, cy）：表に稜線のある輪 */
function handRing(G, cx, cy, ro, ri, z0, z1, ridge, segs, c) {
  lathe(G, [[ri, z0], [ro, z0], [ro, z1], [(ro + ri) / 2, z1 + ridge], [ri, z1]], segs, () => c, { axis: 'z', cx, cy });
}

// 針の形（XY の面。+Y が針の指す向き）
const MINUTE = {
  blades: [
    [[0.4, 0.1], [0.95, 0.205], [2.47, 0.066]],          // 根もとから透かしの輪まで
    [[2.99, 0.066], [3.3, 0.175], [4.22, 0]],             // 先の槍
    [[-0.9, 0.07], [-0.4, 0.1]],                          // 反対側の柄
    [[-1.92, 0], [-1.63, 0.15], [-1.4, 0.066]],           // おもりの先の菱形
  ],
  rings: [[0, 2.72, 0.33, 0.18], [0, -1.15, 0.3, 0.14]],  // 透かしの輪・おもりの輪 [x, y, 外, 内]
  z0: 0, z1: 0.07, ridge: 0.035,
};
const HOUR = {
  blades: [
    [[0.4, 0.125], [1.0, 0.3], [1.72, 0.088]],
    [[2.2, 0.088], [2.42, 0.215], [2.98, 0]],
    [[-1.05, 0], [-0.72, 0.16], [-0.4, 0.1]],
  ],
  rings: [[0, 1.95, 0.3, 0.15]],
  z0: -0.16, z1: -0.09, ridge: 0.03,
};
function handMesh(device, H, segs) {
  const G = geo();
  for (const lv of H.blades) blade(G, lv, H.z0, H.z1, H.ridge, GOLD);
  for (const [x, y, ro, ri] of H.rings) handRing(G, x, y, ro, ri, H.z0, H.z1, H.ridge, segs, GOLD);
  return toMesh(device, G);
}
/** 針の形の柔らかい光（針の後ろに置く。滲んだ光で、明るい所に置いた金のように見せる） */
const GLOW_BOX = { x0: -0.8, x1: 0.8, y0: -2.2, y1: 4.6 };
function handGlowTexture(device, H) {
  const W = 128, Hh = 512, [c, g] = canvas2d(W, Hh);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, Hh);
  const X = (x) => ((x - GLOW_BOX.x0) / (GLOW_BOX.x1 - GLOW_BOX.x0)) * W, Y = (y) => ((GLOW_BOX.y1 - y) / (GLOW_BOX.y1 - GLOW_BOX.y0)) * Hh;
  const shape = () => {
    for (const lv of H.blades) {
      g.beginPath();
      lv.forEach(([y, w], i) => (i ? g.lineTo(X(w), Y(y)) : g.moveTo(X(w), Y(y))));
      for (let i = lv.length - 1; i >= 0; i--) g.lineTo(X(-lv[i][1]), Y(lv[i][0]));
      g.closePath(); g.fill();
    }
    for (const [x, y, ro, ri] of H.rings) {
      g.lineWidth = ((ro - ri) / (GLOW_BOX.x1 - GLOW_BOX.x0)) * W;
      g.beginPath(); g.arc(X(x), Y(y), (((ro + ri) / 2) / (GLOW_BOX.x1 - GLOW_BOX.x0)) * W, 0, TAU); g.stroke();
    }
    g.beginPath(); g.arc(X(0), Y(0), (0.44 / (GLOW_BOX.x1 - GLOW_BOX.x0)) * W, 0, TAU); g.fill();
  };
  g.fillStyle = g.strokeStyle = '#fff';
  g.shadowColor = '#fff';
  for (const [blur, a] of [[26, 0.55], [12, 0.6], [5, 0.5]]) { g.shadowBlur = blur; g.globalAlpha = a; shape(); }
  return makeTexture(device, c, { name: 'title-hand-glow' });
}

/** 岩のかけら：二十面体を細かくし、半径をばらつかせ、平らな割れ口を作る（面ごとに平らに描く） */
function rockMesh(device, rnd) {
  const t = (1 + Math.sqrt(5)) / 2;
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const cache = new Map();
  const mid = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (!cache.has(key)) { V.push(norm([(V[a][0] + V[b][0]) / 2, (V[a][1] + V[b][1]) / 2, (V[a][2] + V[b][2]) / 2])); cache.set(key, V.length - 1); }
    return cache.get(key);
  };
  F = F.flatMap(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
  V = V.map((v) => { const r = 0.78 + rnd.next() * 0.36; return [v[0] * r, v[1] * r * 0.8, v[2] * r]; });
  for (let k = 0; k < 3; k++) {   // 割れ口：ある面より外の頂点を、その面へ押しつける
    const n = norm([rnd.next() - 0.5, rnd.next() - 0.5, rnd.next() - 0.5]), d = 0.45 + rnd.next() * 0.3;
    V = V.map((v) => { const e = v[0] * n[0] + v[1] * n[1] + v[2] * n[2] - d; return e > 0 ? [v[0] - n[0] * e, v[1] - n[1] * e, v[2] - n[2] * e] : v; });
  }
  const G = geo();
  for (const [a, b, c] of F) {
    const pts = [V[a], V[b], V[c]], cen = [(pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3, (pts[0][2] + pts[1][2] + pts[2][2]) / 3];
    const sh = 0.75 + rnd.next() * 0.25;
    G.flat(pts, [0.42 * sh, 0.38 * sh, 0.36 * sh], cen, 0.8);
  }
  return toMesh(device, G);
}

/** 1×1 の板（XY の面、+Z を向く。絵の上が +Y） */
function quadMesh(device) {
  const G = geo(), W = [1, 1, 1], n = [0, 0, 1];
  const a = G.vert([-0.5, -0.5, 0], n, [0, 1], W), b = G.vert([0.5, -0.5, 0], n, [1, 1], W);
  const c = G.vert([0.5, 0.5, 0], n, [1, 0], W), d = G.vert([-0.5, 0.5, 0], n, [0, 0], W);
  G.tri(a, b, c); G.tri(a, c, d);
  return toMesh(device, G);
}

// =====================================================================
// 質感
// =====================================================================

/** 光を足す（加算）質感。光らない所は黒。vertexColor：頂点色で明るさを変える */
function addMat(tex, color, intensity = 1, vertexColor = false) {
  const m = new pc.StandardMaterial();
  m.useLighting = false; m.useSkybox = false; m.useFog = false;
  m.diffuse = new pc.Color(0, 0, 0);
  m.emissive = new pc.Color(...color); m.emissiveIntensity = intensity;
  if (tex) m.emissiveMap = tex;
  m.emissiveVertexColor = vertexColor;
  m.blendType = pc.BLEND_ADDITIVE; m.depthWrite = false; m.cull = pc.CULLFACE_NONE;
  m.update();
  return m;
}
/** 金属（青銅・金）。色は頂点色、映り込みは球の絵（sphereMap）で付ける */
function metalMat({ sphere, patina = null, gloss = 0.6, metalness = 0.9, bump = 0.6, emissive = [0, 0, 0] }) {
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(1, 1, 1);
  m.diffuseVertexColor = true; m.vertexColorGamma = true;
  if (patina) { m.diffuseMap = patina.diffuse; m.normalMap = patina.normal; m.bumpiness = bump; }
  m.useMetalness = true; m.metalness = metalness; m.gloss = gloss;
  m.sphereMap = sphere; m.reflectivity = 1;
  m.emissive = new pc.Color(...emissive);
  m.useSkybox = false; m.useFog = false;
  m.update();
  return m;
}
/** 明るさを変える質感（変わったときだけ反映する） */
function setGlow(m, v) {
  if (Math.abs(m.emissiveIntensity - v) < 0.004) return;
  m.emissiveIntensity = v;
  m.update();
}

// =====================================================================
// 題の画面
// =====================================================================

export function createTitleScene(app, config) {
  const device = app.graphicsDevice;
  const low = config.qualityName === 'low';
  const SEG = low ? 120 : 192;   // 輪を一周で何分割するか
  const layer = new pc.Layer({ name: 'Title' });
  app.scene.layers.push(layer);
  const L = [layer.id];
  const rnd = createRandom(4242);
  const root = new pc.Entity('title-scene');
  root.setPosition(...ORIGIN);
  app.root.addChild(root);

  const add = (name, mesh, mat, parent = root) => {
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], castShadows: false, receiveShadows: false, layers: L });
    parent.addChild(e);
    sceneBudget.triangles += mesh.primitive[0].count / 3;
    return e;
  };
  const quad = quadMesh(device);
  /** 光の板（画面に平行）。size：[横, 縦] か数 */
  const sprite = (name, mat, size, pos, parent = root) => {
    const e = add(name, quad, mat, parent);
    const [w, h] = Array.isArray(size) ? size : [size, size];
    e.setLocalScale(w, h, 1);
    e.setLocalPosition(...pos);
    return e;
  };

  const sphere = sphereTexture(device);
  const patina = patinaTextures(device, rnd);
  const bronze = metalMat({ sphere, patina, gloss: 0.62, metalness: 0.92, bump: 0.7, emissive: [0.03, 0.018, 0.008] });
  const gold = metalMat({ sphere, gloss: 0.8, metalness: 1, emissive: [0.32, 0.2, 0.07] });
  const rock = new pc.StandardMaterial();
  rock.diffuse = new pc.Color(1, 1, 1); rock.diffuseVertexColor = true; rock.vertexColorGamma = true;
  rock.useMetalness = true; rock.metalness = 0; rock.gloss = 0.32;
  rock.useSkybox = false; rock.useFog = false;
  rock.update();
  loadTextureSet(device, SURFACES.stone.id, config.quality).then((t) => {
    if (!t) return;
    rock.diffuseMap = t.diffuse; rock.normalMap = t.normal;
    rock.aoMap = t.arm; rock.aoMapChannel = 'r';
    rock.update();
  });

  // ---- 遠くの空：星雲の絵と、くっきりした星（1 つの形にまとめる） ----
  sprite('title-nebula', addMat(nebulaTexture(device, rnd, low ? 256 : 512), [1, 1, 1]), [150, 96], [0, 0, -40]);
  const dotTex = glowTexture(device, 64, [1, 1, 1], (r) => Math.exp(-((r / 0.16) ** 2)) + Math.max(0, 1 - r) ** 4 * 0.25);
  {
    const G = geo(), n = [0, 0, 1], count = low ? 260 : 460;
    for (let i = 0; i < count; i++) {
      const x = (rnd.next() - 0.5) * 120, y = (rnd.next() - 0.5) * 70, z = -38 + rnd.next() * 9;
      const b = rnd.next() ** 2.2, s = 0.1 + b * 0.32;
      const tint = rnd.next();
      const c = tint < 0.2 ? [0.7, 0.8, 1] : tint < 0.35 ? [1, 0.85, 0.65] : [0.95, 0.94, 0.9];
      const k = 0.35 + b * 0.9;
      const col = [c[0] * k, c[1] * k, c[2] * k];
      const a = G.vert([x - s, y - s, z], n, [0, 1], col), bb = G.vert([x + s, y - s, z], n, [1, 1], col);
      const cc = G.vert([x + s, y + s, z], n, [1, 0], col), d = G.vert([x - s, y + s, z], n, [0, 0], col);
      G.tri(a, bb, cc); G.tri(a, cc, d);
    }
    add('title-stars', toMesh(device, G), addMat(dotTex, [1, 1, 1], 1.2, true));
  }

  // ---- 時の輪（三重）：輪ごとに傾きと回る速さを変える ----
  const ringDefs = [
    // 外：歯車（外向きの歯 96）。溝に作り字
    { r0: 5.82, r1: 6.62, h: 0.5, lip: 0.12, teeth: 96, tout: 0.3, band: 'glyph', tilt: [78, 0, 8], spin: 4.5 },
    // 真ん中：目盛りの環。8 方に突き出た印
    { r0: 4.52, r1: 5.0, h: 0.36, lip: 0.09, studs: 8, band: 'ticks', tilt: [62, 30, -14], spin: -7 },
    // 内：内向きの歯の歯車（歯 60）。溝に作り字
    { r0: 3.14, r1: 3.5, h: 0.3, lip: 0.07, teeth: 60, tin: 0.16, band: 'glyph', tilt: [96, -24, 20], spin: 11 },
  ];
  const rings = [], bandMats = [];
  const bandTex = { glyph: bandTexture(device, rnd, 'glyph'), ticks: bandTexture(device, rnd, 'ticks') };
  for (const d of ringDefs) {
    const pivot = new pc.Entity('ring');
    pivot.setLocalEulerAngles(...d.tilt);
    root.addChild(pivot);
    const spin = new pc.Entity();
    pivot.addChild(spin);
    const G = geo(), t = d.h / 2;
    lathe(G, ringProfile(d.r0, d.r1, d.h, { lip: d.lip }), SEG, ringColor);
    if (d.tout) {   // 外向きの歯
      const pitch = TAU / d.teeth, w = (d.r1 * pitch) / 2;
      for (let i = 0; i < d.teeth; i++) tooth(G, i * pitch, d.r1 - 0.03, d.r1 + d.tout, w * 0.56, w * 0.3, -t + 0.03, t - 0.03, GOLD2, 0.05);
    }
    if (d.tin) {    // 内向きの歯
      const pitch = TAU / d.teeth, w = (d.r0 * pitch) / 2;
      for (let i = 0; i < d.teeth; i++) tooth(G, i * pitch, d.r0 + 0.03, d.r0 - d.tin, w * 0.56, w * 0.3, -t + 0.03, t - 0.03, GOLD2, 0.04);
    }
    if (d.studs) {  // 8 方の尖った印
      for (let i = 0; i < d.studs; i++) tooth(G, (i / d.studs) * TAU, d.r1 - 0.03, d.r1 + 0.42, 0.11, 0.012, -t * 0.8, t * 0.8, GOLD, t * 0.7);
    }
    add('ring-metal', toMesh(device, G), bronze, spin);
    // 溝の底の光る帯
    const rA = d.r0 + d.lip + 0.06 * 0.7, rB = d.r1 - d.lip - 0.06 * 0.7, wBand = rB - rA;
    const tileLen = wBand * (d.band === 'ticks' ? 16 : 8);
    const repeats = Math.max(1, Math.round((TAU * (rA + rB)) / 2 / tileLen));
    const bm = addMat(bandTex[d.band], [1, 0.74, 0.36], 1.1);
    bandMats.push(bm);
    add('ring-band', bandMesh(device, rA, rB, t - 0.06 + 0.006, SEG, repeats), bm, spin);
    rings.push({ pivot, spin, tilt: d.tilt, speed: d.spin, angle: rnd.next() * 360, wob: rnd.next() * 6 });
  }
  // 外の輪の両脇の小さな歯車：外の輪の歯と噛み合い、歯の数の比で逆に回る（外の輪と同じ傾きの面）
  const outer = ringDefs[0], outerRing = rings[0];
  const Rp = outer.r1 + outer.tout / 2;   // 外の輪の歯の噛み合う半径
  const sats = [];
  for (const [n, slot] of [[24, 27], [32, 79]]) {   // [歯の数, 外の輪の歯の間の番号（噛み合う場所）]
    const rp = (Rp * n) / outer.teeth, D = Rp + rp + 0.02;
    const th = (slot + 0.5) * (TAU / outer.teeth);   // 外の輪の歯の間に、小さな歯車の歯が入る向き
    const G = geo(), h = 0.42, t = h / 2;
    const rRoot = rp - outer.tout / 2, rim = rRoot - 0.24;
    lathe(G, plainProfile(rim, rRoot + 0.02, -t, t, 0.04), low ? 64 : 96, plainColor);
    lathe(G, plainProfile(0.14, 0.42, -t * 1.3, t * 1.3, 0.04), 48, plainColor);
    lathe(G, plainProfile(0, 0.18, -t * 1.6, t * 1.6, 0.04), 32, () => GOLD);
    const spokes = n === 24 ? 5 : 6;
    for (let i = 0; i < spokes; i++) tooth(G, (i / spokes) * TAU + 0.3, 0.38, rim + 0.03, 0.1, 0.07, -t * 0.7, t * 0.7, BRONZE, 0.03);
    const pitch = TAU / n, w = (outer.r1 * (TAU / outer.teeth)) / 2;
    for (let i = 0; i < n; i++) tooth(G, i * pitch, rRoot - 0.03, rp + outer.tout / 2, w * 0.56, w * 0.3, -t + 0.03, t - 0.03, GOLD2, 0.05);
    const e = add('ring-gear', toMesh(device, G), bronze, outerRing.pivot);
    e.setLocalPosition(Math.sin(th) * D, 0, Math.cos(th) * D);
    sats.push({ e, a0: ((th + Math.PI) * 180) / Math.PI, ratio: outer.teeth / n });
  }

  // ---- 中心の核：光る玉と、何重かの柔らかい光、ゆっくり回る光の筋 ----
  const coreMat = new pc.StandardMaterial();
  coreMat.useLighting = false; coreMat.useSkybox = false; coreMat.useFog = false;
  coreMat.emissive = new pc.Color(1, 0.8, 0.5); coreMat.diffuse = new pc.Color(0, 0, 0);
  coreMat.update();
  const core = new pc.Entity('core');
  core.addComponent('render', { type: 'sphere', material: coreMat, castShadows: false, receiveShadows: false, layers: L });
  core.setLocalScale(0.5, 0.5, 0.5);
  root.addChild(core);
  const haloMat = addMat(glowTexture(device, 256, [1, 0.55, 0.22], (r) => Math.exp(-r * 4.2) * 0.9 + (1 - r) ** 3 * 0.12), [1, 1, 1], 0.9);
  const halo = sprite('core-halo', haloMat, 13, [0, 0, 0.2]);
  const hotMat = addMat(glowTexture(device, 128, [1, 0.9, 0.7], (r) => Math.exp(-((r / 0.22) ** 2)) + Math.exp(-r * 6) * 0.35), [1, 1, 1], 1);
  const hot = sprite('core-hot', hotMat, 3.2, [0, 0, 0.32]);
  const raysTex = raysTexture(device, rnd, low ? 256 : 512);
  const rayA = sprite('rays-a', addMat(raysTex, [0.62, 0.46, 0.28], 1), 22, [0, 0, 0.1]);
  const rayB = sprite('rays-b', addMat(raysTex, [0.4, 0.34, 0.3], 1), 17, [0, 0, 0.12]);
  // 光：核から輪の内側を照らす暖かい光、左上の手前からの光（金属の面を光らせる）、右下の奥からの冷たい光（輪郭）
  const light = new pc.Entity('core-light');
  light.addComponent('light', { type: 'omni', color: new pc.Color(1, 0.7, 0.4), intensity: 2.4, range: 16, castShadows: false, layers: L });
  root.addChild(light);
  const key = new pc.Entity('title-key');
  key.addComponent('light', { type: 'directional', color: new pc.Color(1, 0.86, 0.66), intensity: 0.9, castShadows: false, layers: L });
  key.setLocalEulerAngles(55, -35, 0);
  root.addChild(key);
  const cool = new pc.Entity('title-cool');
  cool.addComponent('light', { type: 'directional', color: new pc.Color(0.45, 0.58, 0.95), intensity: 0.4, castShadows: false, layers: L });
  cool.setLocalEulerAngles(-130, 40, 0);
  root.addChild(cool);

  // ---- 漂う岩のかけら（形は 3 通り） ----
  const rockMeshes = [rockMesh(device, rnd), rockMesh(device, rnd), rockMesh(device, rnd)];
  const shards = [];
  for (let i = 0, n = low ? 16 : 24; i < n; i++) {
    const mesh = rockMeshes[i % 3];
    const e = new pc.Entity('shard');
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, rock)], castShadows: false, receiveShadows: false, layers: L });
    const far = rnd.next() < 0.4;
    const s = (far ? 0.3 : 0.14) + rnd.next() ** 2 * (far ? 0.9 : 0.55);
    e.setLocalScale(s * (0.8 + rnd.next() * 0.5), s * (0.7 + rnd.next() * 0.5), s * (0.8 + rnd.next() * 0.5));
    e.setLocalEulerAngles(rnd.next() * 360, rnd.next() * 360, rnd.next() * 360);
    root.addChild(e);
    sceneBudget.triangles += mesh.primitive[0].count / 3;
    shards.push({
      e, r: 7.5 + rnd.next() * 8, a: rnd.next() * TAU, y: (rnd.next() - 0.5) * 9, z: far ? -9 - rnd.next() * 8 : -2 - rnd.next() * 6,
      w: (0.02 + rnd.next() * 0.04) * (rnd.next() < 0.5 ? -1 : 1), spin: [rnd.next() * 20 - 10, rnd.next() * 20 - 10, rnd.next() * 20 - 10],
    });
  }

  // ---- 舞い上がる火の粉：柔らかい光の粒。全部を 1 つの形にまとめ、毎回位置と色を入れ直す ----
  const EMBERS = low ? 45 : 80;
  const emberPos = new Float32Array(EMBERS * 12), emberCol = new Float32Array(EMBERS * 16);
  const emberMesh = (() => {
    const uvs = [], idx = [], nor = new Float32Array(EMBERS * 12);
    for (let i = 0; i < EMBERS; i++) {
      uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      for (let v = 0; v < 4; v++) nor[(i * 4 + v) * 3 + 2] = 1;
    }
    const m = new pc.Mesh(device);
    m.setPositions(emberPos); m.setNormals(nor); m.setUvs(0, uvs); m.setColors(emberCol); m.setIndices(idx);
    m.update(pc.PRIMITIVE_TRIANGLES);
    return m;
  })();
  const emberMi = new pc.MeshInstance(emberMesh, addMat(dotTex, [1, 1, 1], 1.3, true));
  emberMi.cull = false;
  const emberEnt = new pc.Entity('embers');
  emberEnt.addComponent('render', { meshInstances: [emberMi], castShadows: false, receiveShadows: false, layers: L });
  root.addChild(emberEnt);
  const embers = [];
  for (let i = 0; i < EMBERS; i++) {
    const pale = rnd.next() < 0.22;   // 2 割は淡い金の粒（時の塵）
    embers.push({
      x: (rnd.next() - 0.5) * 24, y: (rnd.next() - 0.5) * 16, z: -6 + rnd.next() * 12, v: 0.25 + rnd.next() * 0.55,
      ph: rnd.next() * 6, s: (pale ? 0.05 : 0.06) + rnd.next() ** 2 * 0.1, c: pale ? [1, 0.9, 0.6] : [1, 0.5 + rnd.next() * 0.2, 0.16],
    });
  }

  // ---- 文字盤と時計の針 ----
  //   長い針：題の曲の時計の刻みに合わせて 1 拍ずつ 45° 進む（8 拍で一周）。鐘の鳴る拍（8 拍ごと）で一周して光る
  //   短い針：鐘の拍ごとに 45° 進む。進むたびに先が光り、進んだ跡に残光
  const handRoot = new pc.Entity('clock');
  handRoot.setLocalPosition(0, 0, 0.9);
  root.addChild(handRoot);
  const DIAL_R = 4.6;
  const dialMat = addMat(dialTexture(device, rnd, low ? 512 : 1024), [1, 0.76, 0.42], 0.6);
  sprite('clock-dial', dialMat, DIAL_R * 2, [0, 0, -0.4], handRoot);
  const waveMat = addMat(waveTexture(device, low ? 256 : 512), [1, 0.82, 0.55], 0);
  const wave = sprite('clock-wave', waveMat, 4, [0, 0, -0.3], handRoot);
  wave.enabled = false;
  // 進んだ跡の残光：針の後ろ 45° の扇（針に近いほど明るい）
  const trailMat = addMat(null, [1, 0.74, 0.4], 0, true);
  const trail = (() => {
    const G = geo(), n = [0, 0, 1], seg = 16;
    for (let i = 0; i <= seg; i++) {
      const f = i / seg, a = f * (Math.PI / 4), s = Math.sin(a), c = Math.cos(a);
      for (const [r, k] of [[0.5, 0.15], [2.5, 0.6], [4.25, 1]]) {
        const b = (1 - f) ** 2 * k;
        G.vert([-s * r, c * r, 0], n, [0, 0], [b, b, b]);
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 3;
      G.tri(a, a + 1, a + 4); G.tri(a, a + 4, a + 3); G.tri(a + 1, a + 2, a + 5); G.tri(a + 1, a + 5, a + 4);
    }
    return add('clock-trail', toMesh(device, G), trailMat, handRoot);
  })();
  trail.setLocalPosition(0, 0, -0.2);
  const makeHand = (name, H, glowW) => {
    const pivot = new pc.Entity(name);
    handRoot.addChild(pivot);
    add(`${name}-metal`, handMesh(device, H, low ? 32 : 48), gold, pivot);
    const gm = addMat(handGlowTexture(device, H), [1, 0.7, 0.34], 0.4);
    sprite(`${name}-glow`, gm, [(GLOW_BOX.x1 - GLOW_BOX.x0) * glowW, GLOW_BOX.y1 - GLOW_BOX.y0], [0, (GLOW_BOX.y0 + GLOW_BOX.y1) / 2, H.z0 - 0.05], pivot);
    return { pivot, glow: gm };
  };
  const hourHand = makeHand('clock-hour', HOUR, 1);
  const minuteHand = makeHand('clock-minute', MINUTE, 1);
  // 針の先の光（進むたびに光る）
  const flareMat = addMat(dotTex, [1, 0.8, 0.5], 0);
  sprite('clock-flare', flareMat, 1.1, [0, 4.15, 0.12], minuteHand.pivot);
  const hourFlareMat = addMat(dotTex, [1, 0.8, 0.5], 0);
  sprite('clock-hour-flare', hourFlareMat, 0.9, [0, 2.9, 0.12], hourHand.pivot);
  // 中心の軸（回らない）：重ねた円盤と、光る玉
  {
    const G = geo();
    lathe(G, [[0, 0.07], [0.52, 0.07], [0.52, 0.1], [0.48, 0.14], [0, 0.14]], 48, (k) => (k === 2 ? GOLD : k === 1 ? GOLD2 : BRONZE), { axis: 'z' });
    lathe(G, [[0, 0.14], [0.32, 0.14], [0.32, 0.19], [0.28, 0.23], [0, 0.23]], 40, (k) => (k === 2 ? GOLD : GOLD2), { axis: 'z' });
    for (let i = 0; i < 8; i++) {   // 縁の鋲（小さな四角錐）
      const a = (i / 8) * TAU + TAU / 16, x = Math.sin(a) * 0.41, y = Math.cos(a) * 0.41, w = 0.045;
      G.flat([[x - w, y - w, 0.14], [x + w, y - w, 0.14], [x, y, 0.2]], GOLD, [0, -1, 1]);
      G.flat([[x + w, y - w, 0.14], [x + w, y + w, 0.14], [x, y, 0.2]], GOLD, [1, 0, 1]);
      G.flat([[x + w, y + w, 0.14], [x - w, y + w, 0.14], [x, y, 0.2]], GOLD, [0, 1, 1]);
      G.flat([[x - w, y + w, 0.14], [x - w, y - w, 0.14], [x, y, 0.2]], GOLD, [-1, 0, 1]);
    }
    add('clock-hub', toMesh(device, G), gold, handRoot);
    const jewel = new pc.Entity('clock-jewel');
    jewel.addComponent('render', { type: 'sphere', material: coreMat, castShadows: false, receiveShadows: false, layers: L });
    jewel.setLocalScale(0.24, 0.24, 0.12);
    jewel.setLocalPosition(0, 0, 0.25);
    handRoot.addChild(jewel);
    sprite('clock-jewel-glow', addMat(dotTex, [1, 0.75, 0.45], 0.8), 0.9, [0, 0, 0.3], handRoot);
  }
  /**
   * 拍（小数）から針の角度：拍の始めにすばやく進み（0.08 拍で）、あとは止まる。8 拍で一周。
   * n 拍目の音で、n × 45° の所へ着く（鐘の拍＝8 の倍数で、ちょうど真上に着く）
   */
  const handAngle = (beat) => {
    const step = Math.floor(beat), frac = beat - step;
    const k = Math.min(1, frac / 0.08);
    return -((step - 1 + (1 - (1 - k) ** 3)) * 45);
  };
  /** 短い針：鐘の拍ごとに 45° 進む（0.12 拍で） */
  const hourAngle = (beat) => {
    const step = Math.floor(beat / 8), frac = beat - step * 8;
    const k = Math.min(1, frac / 0.12);
    return -((step - 1 + (1 - (1 - k) ** 3)) * 45);
  };

  // ---- カメラ ----
  const cam = new pc.Entity('title-camera');
  cam.addComponent('camera', {
    fov: 50, nearClip: 0.1, farClip: 140, layers: L,
    clearColor: new pc.Color(0.008, 0.01, 0.02),
    toneMapping: pc.TONEMAP_ACES, gammaCorrection: pc.GAMMA_SRGB,
  });
  root.addChild(cam);
  const look = new pc.Vec3();

  let active = false, time = 0, beatOf = null;
  let lastStep = null, flash = 0, sinceStep = 9, waveT = 1;
  return {
    /** 時計の針の拍を受け取る（題の曲が流れていれば、その拍。無ければ 120 拍で自分で進む） */
    setBeatSource(fn) { beatOf = fn; },
    get active() { return active; },
    /** 題の画面の背景を出す（このカメラで描く）・しまう */
    setActive(v, otherCameras = []) {
      active = v;
      root.enabled = v;
      for (const c of otherCameras) if (c) c.enabled = !v;
    },
    update(dt) {
      if (!active) return;
      time += dt;
      // 輪：それぞれの軸で回し、傾きもゆっくり揺らす。小さな歯車は外の輪と噛み合う比で逆に回す
      for (const r of rings) {
        r.angle = (r.angle + r.speed * dt) % 360;
        r.spin.setLocalEulerAngles(0, r.angle, 0);
        r.pivot.setLocalEulerAngles(r.tilt[0] + Math.sin(time * 0.11 + r.wob) * 2.5, r.tilt[1] + Math.sin(time * 0.07 + r.wob * 1.7) * 3, r.tilt[2]);
      }
      for (const s of sats) s.e.setLocalEulerAngles(0, s.a0 - s.ratio * outerRing.angle, 0);
      rayA.setLocalEulerAngles(0, 0, time * 2.2);
      rayB.setLocalEulerAngles(0, 0, -time * 1.5 + 40);

      // 時計の針：曲の拍に合わせて進め、鐘の鳴る拍（8 拍ごと）で一周したら光る
      const beat = beatOf?.() ?? time * 2;
      minuteHand.pivot.setLocalEulerAngles(0, 0, handAngle(beat));
      hourHand.pivot.setLocalEulerAngles(0, 0, hourAngle(beat));
      const step = Math.floor(beat);
      let bell = false;
      if (lastStep !== null && step !== lastStep) {
        sinceStep = 0;
        if (((step % 8) + 8) % 8 === 0) { flash = 1; bell = true; }
        trail.setLocalEulerAngles(0, 0, -step * 45);
      }
      lastStep = step;
      sinceStep += dt;
      flash = Math.max(0, flash - dt * 1.4);
      const tick = Math.exp(-sinceStep * 6);
      // 鐘の拍：光の輪が広がる
      if (bell) { waveT = 0; wave.enabled = true; }
      if (waveT < 1) {
        waveT = Math.min(1, waveT + dt / 1.5);
        const p = 1 - (1 - waveT) ** 2;
        wave.setLocalScale(3 + p * 17, 3 + p * 17, 1);
        setGlow(waveMat, (1 - waveT) ** 2 * 1.2);
        if (waveT >= 1) wave.enabled = false;
      }
      setGlow(trailMat, tick * 0.55 + flash * 0.25);
      setGlow(flareMat, tick * 1.6 + flash * 1.2);
      setGlow(hourFlareMat, flash * 1.8);
      setGlow(minuteHand.glow, 0.32 + tick * 0.4 + flash * 1.3);
      setGlow(hourHand.glow, 0.26 + flash * 1.1);
      setGlow(dialMat, 0.55 + tick * 0.1 + flash * 0.9);
      for (const m of bandMats) setGlow(m, 1.1 + flash * 1.6);
      setGlow(gold, 1 + flash * 2.2);

      const pulse = 1 + 0.06 * Math.sin(time * 1.7) + 0.03 * Math.sin(time * 4.3);
      halo.setLocalScale(13 * (pulse + flash * 0.35), 13 * (pulse + flash * 0.35), 1);
      hot.setLocalScale(3.2 * (pulse + flash * 0.6), 3.2 * (pulse + flash * 0.6), 1);
      light.light.intensity = 2.2 * pulse + flash * 2.4;

      for (const s of shards) {
        s.a += s.w * dt;
        s.e.setLocalPosition(Math.cos(s.a) * s.r, s.y + Math.sin(time * 0.3 + s.a) * 0.4, s.z + Math.sin(s.a) * s.r * 0.35);
        s.e.rotateLocal(s.spin[0] * dt, s.spin[1] * dt, s.spin[2] * dt);
      }
      for (let i = 0; i < EMBERS; i++) {
        const m = embers[i];
        m.y += m.v * dt;
        if (m.y > 9) { m.y = -9; m.x = (rnd.next() - 0.5) * 24; }
        const x = m.x + Math.sin(time * 0.8 + m.ph) * 0.5, y = m.y, s = m.s;
        const fade = smoothstep(-9, -6, y) * (1 - smoothstep(5, 9, y));
        const k = fade * (0.65 + 0.35 * Math.sin(time * 6 + m.ph * 3));
        const o = i * 12;
        emberPos[o] = x - s; emberPos[o + 1] = y - s; emberPos[o + 2] = m.z;
        emberPos[o + 3] = x + s; emberPos[o + 4] = y - s; emberPos[o + 5] = m.z;
        emberPos[o + 6] = x + s; emberPos[o + 7] = y + s; emberPos[o + 8] = m.z;
        emberPos[o + 9] = x - s; emberPos[o + 10] = y + s; emberPos[o + 11] = m.z;
        for (let v = 0; v < 4; v++) {
          const c = (i * 4 + v) * 4;
          emberCol[c] = m.c[0] * k; emberCol[c + 1] = m.c[1] * k; emberCol[c + 2] = m.c[2] * k; emberCol[c + 3] = 1;
        }
      }
      emberMesh.setPositions(emberPos);
      emberMesh.setColors(emberCol);
      emberMesh.update(pc.PRIMITIVE_TRIANGLES);

      // ゆっくり漂うカメラ（少し下から見上げる）。縦長の画面では引いて、輪が横にはみ出しすぎないように
      const aspect = device.width / Math.max(1, device.height);
      const dist = Math.min(27, Math.max(14.5, 6.6 / (Math.tan((25 * Math.PI) / 180) * aspect)));
      cam.setLocalPosition(Math.sin(time * 0.07) * 1.6, -1.2 + Math.sin(time * 0.05) * 0.4, dist);
      look.set(ORIGIN[0], ORIGIN[1] + 0.4, ORIGIN[2]);
      cam.lookAt(look);
    },
  };
}
