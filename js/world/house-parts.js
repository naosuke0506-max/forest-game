// 家の外の作り込み（凹凸）。world/house-builder.js が家の骨組みを決め、ここで外から見える細部を足す。
//   木組み：しっくいの面から浮き出た隅柱・土台・桁・間柱・筋交い・貫（正面は窓の下に飾りの斜め十字）
//   張り出し（二階建て）：二階が前へ出る。根太の端が並び、隅の持ち送りが支える
//   石積みの階：隅石（長短を互い違い）、石のまぐさと窓台、扉は石の枠と要石
//   窓：枠の内張り・十字の桟・張り出した窓台と水切り・板の鎧戸（桟と斜めの補強）・花箱
//   扉：まぐさの板・板戸の鉄の帯・小さな庇（一階建て）・石の段
//   屋根：厚み（軒裏・鼻隠し・けらば）、瓦は破風板と垂木の端と棟瓦、わらぶきは太い棟
//   妻壁：木組み（梁・束・斜めの木）と小窓
// 家の中の座標：x は横（右が +）、z は奥行き（前＝扉の側が +）、y は高さ（家の地面から）
// 壁の面 fc：o（壁の真ん中・その階の床の高さの、外の面の点）、u（壁に沿う向き）、n（外向き）。面の座標は s（u に沿って）・v（高さ）・out（外へ）
import { box, obox, v3 } from './build-kit.js';

// 木組みの出（しっくいの面から外へ出る厚み。壁へ EMBED だけめり込ませる）。重なる所がちらつかないよう、種類ごとに違える
const DEP = { plate: 0.1, stud: 0.09, brace: 0.075, rail: 0.065 };
const EMBED = 0.02;
const IRON = [0.1, 0.095, 0.09];
const SQ = Math.SQRT1_2;

/**
 * @param {object} B builder()
 * @param {object} F 家の座標系 frame(cx, y0, cz, yaw)
 * @param {number} yaw 家の向き
 * @param {object} deco 飾りの乱数（家の並びを変えないよう、家ごとに別の乱数）
 */
export function createParts(B, F, yaw, deco) {
  const W = (p) => F.at(p[0], p[1], p[2]);
  const D = (d) => F.dir(d[0], d[1], d[2]);
  // 画像のずらし（同じ模様が並ばないように。乱数を使わずに散らす）
  let ko = 0;
  const off = () => { ko++; return [((ko * 0.618) % 1) * 1.6, ((ko * 0.377) % 1) * 1.6]; };
  /** 家の中の座標で、向きを決めた箱 */
  const lbox = (surf, c, a, b, n, la, lb, ln, shade, opt = {}) => obox(B, surf, W(c), D(a), D(b), D(n), la, lb, ln, shade, { off: off(), ...opt });
  /** 家の中の座標で、横に回すだけの箱（底の高さ y） */
  const bxL = (surf, x, y, z, w, d, h, opt = {}, rot = 0) => { const p = F.at(x, y, z); box(B, surf, p[0], p[1], p[2], w, d, h, yaw + rot, opt); };
  /** 壁の面の上の点 */
  const fp = (fc, s, v, out) => [fc.o[0] + fc.u[0] * s + fc.n[0] * out, fc.o[1] + v, fc.o[2] + fc.u[2] * s + fc.n[2] * out];

  /**
   * 壁に沿った木（柱・梁・筋交い）。(s0, v0) から (s1, v1) へ、幅 wid、出 dep
   * at：面から浮かせる距離（鎧戸の上の桟など）、ends：端の面も描くか、ext：両端を延ばす長さ（ほかの木に差し込む）
   */
  function beam(fc, s0, v0, s1, v1, wid, dep, shade, { surf = 'wood', ends = false, ext = 0, at = 0 } = {}) {
    const ds = s1 - s0, dv = v1 - v0, L = Math.hypot(ds, dv);
    if (L < 0.02) return;
    const a = [(fc.u[0] * ds) / L, dv / L, (fc.u[2] * ds) / L];
    const b = v3.cross(fc.n, a);
    const c = fp(fc, (s0 + s1) / 2, (v0 + v1) / 2, at + dep / 2 - EMBED);
    lbox(surf, c, a, b, fc.n, L + ext, wid, dep, shade, { skip: ends ? '-n' : '-n+a-a' });
  }
  /** 壁に沿った箱（石・窓台など）。s は真ん中、v は下の端、out は奥行きの真ん中 */
  function fbox(fc, surf, s, v, out, ls, lv, lo, shade, skip = '-n') {
    lbox(surf, fp(fc, s, v + lv / 2, out), fc.u, [0, 1, 0], fc.n, ls, lv, lo, shade, { skip });
  }

  const parts = {
    beam, fbox, bxL, lbox, fp,

    /**
     * しっくいの壁の木組み（1 つの階・1 枚の壁）
     *   s0..s1：壁の端から端（面の座標）。H：階の高さ。ops：開口 [{ c, w, y, h }]（面の座標）
     *   railV：貫（横の木）の高さ（窓の下の横木とそろえる）。fancy：正面の飾り（窓の下と区画の下の斜め十字）
     */
    framing(fc, s0, s1, H, ops, tone, { fancy = false, base = true, railV = 0.88 } = {}) {
      const e0 = s0 + 0.2, e1 = s1 - 0.2;   // 隅柱の内側
      if (base) beam(fc, s0, 0.1, s1, 0.1, 0.2, DEP.plate, tone);   // 土台
      beam(fc, s0, H - 0.1, s1, H - 0.1, 0.2, DEP.plate, tone);     // 桁
      const lo = 0.2, hi = H - 0.2, JW = 0.14, SW = 0.13;
      const blocks = ops.map((o) => ({ o, a: o.c - o.w / 2 - JW, b: o.c + o.w / 2 + JW })).sort((p, q) => p.a - q.a);
      const panels = [];
      // 開口の無い所：1.25m ごとに間柱を立て、区画に分ける
      const fill = (g0, g1) => {
        const gw = g1 - g0;
        if (gw <= 0.06) return;
        const n = Math.max(0, Math.ceil(gw / 1.25) - 1);
        const step = (gw - n * SW) / (n + 1);
        let p = g0;
        for (let i = 0; i <= n; i++) {
          panels.push({ a: p, b: p + step });
          p += step;
          if (i < n) { beam(fc, p + SW / 2, lo, p + SW / 2, hi, SW, DEP.stud, tone); p += SW; }
        }
      };
      let cur = e0;
      for (const bl of blocks) { fill(cur, bl.a); cur = bl.b; }
      fill(cur, e1);
      // 開口：両側の枠の柱、上のまぐさ、窓は下の窓台の木。窓の下には飾りの斜め十字
      for (const { o, a, b } of blocks) {
        beam(fc, a + JW / 2, lo, a + JW / 2, hi, JW, DEP.stud, tone);
        beam(fc, b - JW / 2, lo, b - JW / 2, hi, JW, DEP.stud, tone);
        const t = o.y + o.h;
        if (hi - t > 0.1) beam(fc, a + JW, t + 0.07, b - JW, t + 0.07, 0.14, DEP.rail, tone, { ext: 0.06 });
        if (o.y > 0.4) {
          beam(fc, a + JW, o.y - 0.07, b - JW, o.y - 0.07, 0.14, DEP.rail, tone, { ext: 0.06 });
          if (fancy && o.y - 0.14 - lo > 0.35) {
            beam(fc, a + JW + 0.05, lo, b - JW - 0.05, o.y - 0.14, 0.1, DEP.brace, tone, { ext: 0.08 });
            beam(fc, b - JW - 0.05, lo, a + JW + 0.05, o.y - 0.14, 0.1, DEP.brace, tone, { ext: 0.08 });
          }
        }
      }
      // 開口の無い区画：両端（隅柱の隣）は筋交い、ほかは貫。正面は貫の下に斜め十字
      for (const p of panels) {
        const wd = p.b - p.a;
        const atL = Math.abs(p.a - e0) < 0.01, atR = Math.abs(p.b - e1) < 0.01;
        if ((atL || atR) && !(atL && atR) && wd >= 0.45) {
          if (atL) beam(fc, p.b - 0.08, lo, p.a + 0.08, hi, 0.14, DEP.brace, tone, { ext: 0.14 });
          else beam(fc, p.a + 0.08, lo, p.b - 0.08, hi, 0.14, DEP.brace, tone, { ext: 0.14 });
        }
        if (wd < 0.3) continue;
        beam(fc, p.a, railV, p.b, railV, 0.14, DEP.rail, tone, { ext: 0.06 });
        if (fancy && !atL && !atR && wd >= 0.55) {
          beam(fc, p.a + 0.05, lo, p.b - 0.05, railV - 0.07, 0.1, DEP.brace, tone, { ext: 0.08 });
          beam(fc, p.b - 0.05, lo, p.a + 0.05, railV - 0.07, 0.1, DEP.brace, tone, { ext: 0.08 });
        }
      }
    },

    /** 隅柱（1 つの階の 4 隅）。前の面 zf・後ろの面 zb・横の面 ±w/2 から 0.1m 出る */
    cornerPosts(w, zf, zb, y, H, tone) {
      // 木目を縦に（柱は縦の木）
      for (const sx of [-1, 1]) for (const z of [zf - 0.05, zb + 0.05]) lbox('wood', [sx * (w / 2 - 0.05), y + H / 2, z], [0, 1, 0], [1, 0, 0], [0, 0, 1], H, 0.3, 0.3, tone, { skip: '+a-a' });
    },

    /** 隅石（石積みの階の 4 隅。長い石と短い石を互い違いに積み、壁から 5cm 出る） */
    quoins(w, zf, zb, y, H, shade) {
      const n = Math.max(4, Math.round(H / 0.34)), qh = H / n, PQ = 0.05;
      for (const sx of [-1, 1]) for (const [zc, sz] of [[zf, 1], [zb, -1]]) for (let k = 0; k < n; k++) {
        const long = (k + (sx * sz > 0 ? 0 : 1)) % 2 === 0;
        const lx = long ? 0.62 : 0.34, lz = long ? 0.34 : 0.62;
        const sh = shade * (0.93 + ((k * 7 + sx * 3 + sz + 4) % 5) * 0.035);
        // 外から見える 2 面と、上の段とずれて見える上の面（壁の中に入る面は描かない）
        bxL('stone', sx * (w / 2 + PQ - lx / 2), y + k * qh + 0.012, zc + sz * (PQ - lz / 2), lx, lz, qh - 0.024, { shade: sh, skip: (sx > 0 ? 'left' : 'right') + (sz > 0 ? 'back' : 'front') });
      }
    },

    /**
     * 二階の張り出し（前だけ）。yb：二階の床の高さ、J：張り出す長さ
     * 根太の端が並び、その間に板、隅に斜めの持ち送り
     */
    jetty(w, d, J, yb, tone) {
      const n = Math.max(3, Math.round((w - 0.14) / 0.5));
      for (let i = 0; i <= n; i++) {
        const x = -w / 2 + 0.07 + ((w - 0.14) * i) / n;
        bxL('wood', x, yb - 0.2, d / 2 + J / 2, 0.13, J + 0.08, 0.2, { shade: tone, bottom: true, top: false });
      }
      bxL('wood', 0, yb - 0.07, d / 2 + J / 2, w + 0.2, J, 0.07, { shade: tone * 0.85, bottom: true, top: false });
      for (const sx of [-1, 1]) {
        const fc = { o: [(sx * w) / 2, yb, 0], u: [0, 0, 1], n: [sx, 0, 0] };
        beam(fc, d / 2 - 0.14, -1.05, d / 2 + J - 0.1, -0.2, 0.15, 0.15, tone, { ends: true, ext: 0.12 });
      }
    },

    /**
     * 窓の作り込み。c：面の座標の真ん中、v0：窓の下の端の高さ（面の座標）、ww・wh：窓の大きさ、T：壁の厚さ
     * kind：'timber'（木組みの階）・'stone'（石積み）・'boards'（板張り）
     */
    windowDress(fc, c, v0, ww, wh, T, kind, tone, { shutter = [0.8, 0.75, 0.7], flowers = null } = {}) {
      const lin = tone * 1.15;
      // 枠の内張り（壁の厚みの所）と十字の桟
      // （見えない面は描かない：壁に付いた面・ほかの木に隠れる端。材は両面を描くので、裏から見ても抜けない）
      fbox(fc, 'wood', c, v0 - 0.02, -T / 2, ww, 0.04, T + 0.02, lin, '-b+a-a-n');
      fbox(fc, 'wood', c, v0 + wh - 0.04, -T / 2, ww, 0.05, T + 0.02, lin, '+b+a-a-n');
      for (const s of [-1, 1]) fbox(fc, 'wood', c + s * (ww / 2 - 0.025), v0, -T / 2, 0.05, wh, T + 0.02, lin, (s < 0 ? '-a' : '+a') + '+b-b-n');
      fbox(fc, 'wood', c, v0, -0.07, 0.06, wh, 0.06, tone, '+b-b');
      fbox(fc, 'wood', c, v0 + wh * 0.58, -0.07, ww - 0.04, 0.06, 0.06, tone, '+a-a');
      if (kind === 'stone') {
        fbox(fc, 'stone', c, v0 - 0.12, 0.05, ww + 0.34, 0.12, 0.22, 1.08, '-n');   // 窓台
        fbox(fc, 'stone', c, v0 + wh, 0.0, ww + 0.46, 0.26, 0.12, 1.1, '-n');        // まぐさ
      } else {
        fbox(fc, 'wood', c, v0 - 0.07, 0.07, ww + 0.36, 0.06, 0.18, tone * 1.1, '-n');      // 張り出した窓台
        fbox(fc, 'wood', c, v0 + wh + 0.14, 0.055, ww + 0.42, 0.06, 0.15, tone * 0.95, '-n'); // 水切り
      }
      // 鎧戸（開いて壁に沿う）：板と、上下の桟と斜めの補強
      const timber = kind === 'timber', at = timber ? 0.1 : 0.02, sw = ww / 2;
      for (const s of [-1, 1]) {
        const sc = c + s * (ww / 2 + (timber ? 0.14 : 0.06) + sw / 2);
        fbox(fc, 'gate', sc, v0 + 0.02, at + 0.0175, sw, wh - 0.04, 0.035, shutter, '-n');
        for (const vv of [0.14, wh - 0.18]) beam(fc, sc - sw / 2 + 0.04, v0 + vv, sc + sw / 2 - 0.04, v0 + vv, 0.08, 0.03, shutter.map((x) => x * 0.8), { at: at + 0.035 + EMBED });
        beam(fc, sc - s * (sw / 2 - 0.06), v0 + 0.2, sc + s * (sw / 2 - 0.06), v0 + wh - 0.24, 0.07, 0.025, shutter.map((x) => x * 0.8), { at: at + 0.035 + EMBED });
        for (const vv of [0.16, wh - 0.16]) fbox(fc, 'cloth', c + s * (ww / 2 + 0.02), v0 + vv, at + 0.04, 0.16, 0.035, 0.012, IRON, '-n+a-a+b-b');   // 蝶番
      }
      // 花箱：窓台の下の箱と、緑の葉と色とりどりの花
      if (flowers) {
        const fo = kind === 'stone' ? 0.17 : 0.22;
        fbox(fc, 'wood', c, v0 - 0.3, fo, ww + 0.12, 0.2, 0.22, tone * 0.9, '-n');
        const n = 6;
        for (let i = 0; i < n; i++) {
          const s = c - ww / 2 + 0.02 + ((ww - 0.04) * (i + 0.5)) / n, h = 0.1 + deco.next() * 0.12;
          fbox(fc, 'cloth', s, v0 - 0.12, fo, (ww / n) * 1.2, h, 0.18, [0.16, 0.3 + deco.next() * 0.1, 0.1], '-n-b');
          if (deco.next() < 0.8) fbox(fc, 'cloth', s + (deco.next() - 0.5) * 0.05, v0 - 0.12 + h - 0.02, fo + (deco.next() - 0.5) * 0.08, 0.07, 0.07, 0.07, flowers[i % flowers.length], '-n-b');
        }
      }
    },

    /**
     * 扉口の作り込み（前の面）。dw・dh：扉口の大きさ、T：壁の厚さ
     */
    doorDress(fc, dw, dh, T, kind, tone) {
      // 枠の内張り
      for (const s of [-1, 1]) fbox(fc, 'wood', s * (dw / 2 - 0.025), 0, -T / 2, 0.05, dh, T + 0.04, tone * 1.1, (s < 0 ? '-a' : '+a') + '+b-b');
      fbox(fc, 'wood', 0, dh - 0.05, -T / 2, dw, 0.05, T + 0.04, tone * 1.1, '+b+a-a');
      if (kind === 'stone') {
        // 長い石と短い石を互い違いにした石の枠、まぐさと要石
        const n = 5;
        for (let k = 0; k < n; k++) for (const s of [-1, 1]) {
          const lw = k % 2 ? 0.3 : 0.46;
          fbox(fc, 'stone', s * (dw / 2 + lw / 2), (k * dh) / n + 0.012, 0.0, lw, dh / n - 0.024, 0.1, 1.06 + (k % 3) * 0.03, '-n');
        }
        fbox(fc, 'stone', 0, dh, 0.0, dw + 0.8, 0.34, 0.12, 1.1, '-n');
        fbox(fc, 'stone', 0, dh - 0.06, 0.03, 0.26, 0.46, 0.16, 1.16, '-n');
      } else {
        fbox(fc, 'wood', 0, dh + 0.14, 0.05, dw + 0.62, 0.2, 0.14, tone * 0.9, '-n');   // まぐさの板
        for (const s of [-1, 1]) beam(fc, s * (dw / 2 + 0.07), dh - 0.4, s * (dw / 2 + 0.26), dh + 0.14, 0.1, 0.11, tone, { ends: true });   // 方杖
      }
    },

    /** 開いた板戸の鉄の帯と取っ手（戸は家の中の座標：x、z の真ん中、幅（奥行きの向き）len、高さ h。面は -x 向き） */
    doorStraps(x, y, z, len, h) {
      for (const v of [0.32, h - 0.42]) bxL('cloth', x, y + v, z + 0.04, 0.014, len - 0.12, 0.06, { shade: IRON });
      bxL('cloth', x, y + h * 0.48, z - len / 2 + 0.18, 0.04, 0.05, 0.12, { shade: IRON });
    },

    /**
     * 扉の上の小さな庇（前の面）。width：幅、depth：出、vTop：壁に付く高さ（面の座標）、surf：屋根の質感
     */
    canopy(fc, width, depth, vTop, surf, tone) {
      const drop = depth * 0.55, L = Math.hypot(depth, drop), t = surf === 'thatch' ? 0.16 : 0.08;
      const a = fc.u, bdir = v3.norm([fc.n[0] * depth, -drop, fc.n[2] * depth]);
      const nn = v3.norm(v3.cross(a, bdir));
      const up = nn[1] > 0 ? nn : v3.mul(nn, -1);
      const mid = fp(fc, 0, vTop - drop / 2, depth / 2);
      lbox(surf, v3.add(mid, v3.mul(up, t / 2)), a, bdir, up, width, L, t, 1, { skip: '-n' });
      lbox('wood', v3.sub(mid, v3.mul(up, 0.015)), a, bdir, up, width - 0.04, L - 0.02, 0.03, tone * 0.85);
      fbox(fc, 'wood', 0, vTop - 0.2, 0.06, width - 0.1, 0.16, 0.12, tone);   // 壁の横木
      for (const s of [-1, 1]) {
        const p0 = fp(fc, s * (width / 2 - 0.16), 0, 0);
        const side = { o: p0, u: fc.n, n: fc.u };
        beam(side, 0.02, vTop - 0.95, depth - 0.18, vTop - drop * ((depth - 0.18) / depth) - 0.05, 0.1, 0.1, tone, { ends: true, ext: 0.06 });
      }
    },

    /**
     * 屋根（切妻。棟は奥行き z の向き）。軒裏の面が、横の壁の外の面の上の端（x = ±w/2, y = top）を通る
     *   zF・zB：屋根の前と後ろの端、rh：棟の高さ（軒裏で）、over：横の軒の出、t：厚み
     * 返り値：topAt(x)（屋根の上の面の高さ）
     */
    roof({ w, zF, zB, top, rh, over, t, surf, tone }) {
      const tiles = surf === 'tiles';
      const k = rh / (w / 2), cs = 1 / Math.sqrt(1 + k * k), tv = t / cs;
      const xe = w / 2 + over, yEu = top - k * over, yEt = yEu + tv, yRu = top + rh, yRt = yRu + tv;
      const P = (x, y, z) => W([x, y, z]);
      const underSurf = tiles ? 'wood' : 'thatch', underShade = tiles ? tone * 0.9 : 0.5;
      const edgeSurf = tiles ? 'wood' : 'thatch', edgeShade = tiles ? tone : 0.72;
      for (const sx of [-1, 1]) {
        const n = D([sx * k * cs, cs, 0]), nd = D([-sx * k * cs, -cs, 0]);
        // 上の面（画像の縦を坂に沿わせる）
        if (sx > 0) B.slope(surf, P(xe, yEt, zB), P(xe, yEt, zF), P(0, yRt, zF), P(0, yRt, zB), n);
        else B.slope(surf, P(-xe, yEt, zF), P(-xe, yEt, zB), P(0, yRt, zB), P(0, yRt, zF), n);
        // 軒裏（家の中からも見える）
        if (sx > 0) B.slope(underSurf, P(xe, yEu, zF), P(xe, yEu, zB), P(0, yRu, zB), P(0, yRu, zF), nd, underShade);
        else B.slope(underSurf, P(-xe, yEu, zB), P(-xe, yEu, zF), P(0, yRu, zF), P(0, yRu, zB), nd, underShade);
        // 軒先の厚み（瓦は鼻隠しの板。少し下へ出す）
        const eb = tiles ? 0.08 : 0;
        B.slope(edgeSurf, P(sx * xe, yEu - eb, sx > 0 ? zF : zB), P(sx * xe, yEu - eb, sx > 0 ? zB : zF), P(sx * xe, yEt, sx > 0 ? zB : zF), P(sx * xe, yEt, sx > 0 ? zF : zB), D([sx, 0, 0]), edgeShade);
        // けらば（妻側の端）。瓦は破風板（屋根の下へ出る板と、その裏・下の面）
        for (const [z, sz] of [[zF, 1], [zB, -1]]) {
          const bb = tiles ? 0.16 : 0;
          const q = (yE, yR, zz) => [P(sx * xe, yE, zz), P(0, yR, zz)];
          const [a0, a1] = q(yEu - bb, yRu - bb, z), [b0, b1] = q(yEt + (tiles ? 0.02 : 0), yRt + (tiles ? 0.02 : 0), z);
          B.quad(edgeSurf, a0, a1, b1, b0, D([0, 0, sz]), edgeShade);
          if (tiles) {
            const zi = z - sz * 0.05;
            const [c0, c1] = q(yEu - bb, yRu - bb, zi), [d0, d1] = q(yEu, yRu, zi);
            B.quad('wood', c0, c1, d1, d0, D([0, 0, -sz]), tone * 0.8);
            B.quad('wood', a0, a1, c1, c0, D([-sx * k * cs, -cs, 0]), tone * 0.7);
          }
        }
        // 垂木の端（瓦）：軒裏の下に、壁から軒先まで
        if (tiles) {
          const dirA = D([sx * cs, -k * cs, 0]), dirN = D([sx * k * cs, cs, 0]), dirB = D([0, 0, 1]);
          const len = over / cs;
          for (let z = zB + 0.25; z <= zF - 0.2; z += 0.6) {
            const xm = sx * (w / 2 + over / 2 - 0.01), yu = top - k * (over / 2 - 0.01);
            const c = v3.sub(W([xm, yu, z]), v3.mul(dirN, 0.06));
            obox(B, 'wood', c, dirA, dirB, dirN, len - 0.02, 0.1, 0.12, tone * 0.8, { skip: '+n-a', off: off() });
          }
        }
      }
      // 棟：瓦は棟瓦、わらぶきは太い棟
      const L = zF - zB, zc = (zF + zB) / 2;
      const rb = D([SQ, SQ, 0]), rn = D([-SQ, SQ, 0]), ra = D([0, 0, 1]);
      if (tiles) obox(B, 'tiles', W([0, yRt - 0.05, zc]), ra, rb, rn, L + 0.06, 0.26, 0.26, 0.78, { off: off() });
      else obox(B, 'thatch', W([0, yRt - 0.12, zc]), ra, rb, rn, L + 0.12, 0.46, 0.46, 0.8, { off: off() });
      // 視線をさえぎる板（家の中の座標）：左右の坂
      const planes = [-1, 1].map((sx) => {
        const e = [sx * xe, yEu + tv / 2, zc], r = [0, yRu + tv / 2, zc];
        const bl = Math.hypot(r[0] - e[0], r[1] - e[1]);
        return { c: [(e[0] + r[0]) / 2, (e[1] + r[1]) / 2, zc], a: [0, 0, 1], b: [(r[0] - e[0]) / bl, (r[1] - e[1]) / bl, 0], n: [sx * k * cs, cs, 0], la: L, lb: bl, ln: t };
      });
      return { topAt: (x) => top + rh - k * Math.abs(x) + tv, k, tv, planes };
    },

    /**
     * 妻壁（三角）。fc：妻の面（o は壁の上の端の真ん中）。w：幅、rh：高さ、T：壁の厚さ
     * kind：'timber' は木組みと小窓、'stone' は石、'boards' は板
     */
    gable(fc, w, rh, T, kind, wallShade, tone, { window = false } = {}) {
      const surf = kind === 'stone' ? 'stone' : kind === 'boards' ? 'wood' : 'plaster';
      const sh = kind === 'stone' ? 0.88 : kind === 'boards' ? tone * 1.3 : wallShade;
      const p = (s, v, out) => W(fp(fc, s, v, out));
      B.tri(surf, p(-w / 2, 0, 0), p(w / 2, 0, 0), p(0, rh, 0), D(fc.n), sh);
      B.tri(surf, p(w / 2, 0, -T), p(-w / 2, 0, -T), p(0, rh, -T), D(v3.mul(fc.n, -1)), sh);
      if (kind !== 'timber') return;
      const vc = rh * 0.42, hwc = (w / 2) * (1 - vc / rh) - 0.16;
      beam(fc, -hwc, vc, hwc, vc, 0.16, DEP.plate, tone);                                      // 梁
      beam(fc, 0, vc + 0.08, 0, rh - 0.16, 0.16, DEP.stud, tone, { ext: 0.04 });               // 束
      const winW = 0.5, winH = Math.min(0.62, vc - 0.42);
      const hasWin = window && winH > 0.3;
      const sIn = hasWin ? winW / 2 + 0.2 : 0.2;
      beam(fc, -(w / 2 - 0.22), 0.08, w / 2 - 0.22, 0.08, 0.16, DEP.plate, tone);             // 妻の土台
      for (const s of [-1, 1]) beam(fc, s * w * 0.3, 0.16, s * sIn, vc - 0.08, 0.14, DEP.brace, tone, { ext: 0.16 });   // 斜めの木
      for (const s of [-1, 1]) {   // 束の両側の斜めの木（梁の上）
        const hw = (w / 2) * (1 - (vc + 0.08) / rh) - 0.3;
        if (hw > 0.35) beam(fc, s * hw, vc + 0.08, s * 0.08, Math.min(rh - 0.3, vc + 0.08 + hw * 0.8), 0.12, DEP.brace, tone, { ext: 0.12 });
      }
      if (hasWin) {
        const v0 = vc - 0.12 - winH;
        fbox(fc, 'cloth', 0, v0, 0.006, winW, winH, 0.012, [0.06, 0.06, 0.07], '');
        for (const s of [-1, 1]) beam(fc, s * (winW / 2 + 0.05), v0 - 0.05, s * (winW / 2 + 0.05), v0 + winH + 0.05, 0.1, DEP.stud, tone, { ends: true });
        beam(fc, -winW / 2 - 0.1, v0 - 0.05, winW / 2 + 0.1, v0 - 0.05, 0.1, DEP.stud, tone, { ends: true });
        fbox(fc, 'wood', 0, v0, 0.03, 0.05, winH, 0.04, tone, '');
        fbox(fc, 'wood', 0, v0 + winH * 0.55, 0.03, winW, 0.05, 0.04, tone, '');
        fbox(fc, 'wood', 0, v0 - 0.16, 0.06, winW + 0.32, 0.06, 0.14, tone * 1.1, '-n');
      }
    },
  };
  return parts;
}
