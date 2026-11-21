// 家の中の「人が消えた直後」（③ 2026-11-21。利用者が選んだ「静か」・音は出さない）：荒れていない、さっきまで人がいた家。
//   ・灯りが点いたまま：食卓の上の吊り灯・ナイトテーブルの灯り。夜は窓から灯りが漏れる（家ごとに、一階・二階が点いているか決まっている）
//   ・テレビが点いたまま：画面が青白く光り、場面が変わるように明るさが時々変わる（音は無し）
//   ・薪ストーブに熾火が残っている：ガラス窓の奥がうっすら赤い
//   食べかけの食事・引かれた椅子・めくれた掛け布団は world/furniture.js が形で置く
// 光の作り（iPad で重くしない）：
//   ・窓の灯り・電球・テレビの画面・熾火は、加算で重ねる光の板（本物の光ではない）。種類ごとに 1 つの形（描画命令 4 つ）
//   ・本物の光（部屋を照らす）は、カメラに近い所の 3 つだけ（POOL）。影は落とさない
// 場所は world/house-builder.js・world/furniture.js が家ごとの記録（life）に書く
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { glowTexture } from './roadside.js';
import { createRandom } from '../core/random.js';

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const WARM = [1.0, 0.74, 0.45];       // 電球の色
const WINDOW = [1.0, 0.58, 0.26];     // 窓から漏れる灯りの色（夜は画面全体が明るく写るので、濃い橙で弱めに）
const TV = [0.45, 0.65, 1.0];         // テレビの画面の色（青白い）
const EMBER = [1.0, 0.38, 0.12];      // 熾火の色
const POOL = 3;                       // 本物の光の数（カメラに近い所だけ）
const REACH = 26;                     // これより遠い所には本物の光を置かない（m）

/** 四角い光の絵（窓・画面）：真ん中は白く、縁でぼける。加算で重ねるので黒地 */
function rectTexture(device) {
  const S = 64, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = Math.max(0, Math.abs(x + 0.5 - S / 2) - S * 0.3), dy = Math.max(0, Math.abs(y + 0.5 - S / 2) - S * 0.3);
    const v = Math.round(255 * (1 - smoothstep(0, S * 0.2, Math.hypot(dx, dy))));
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new pc.Texture(device, { width: S, height: S, format: pc.PIXELFORMAT_RGBA8, mipmaps: true, name: 'window-glow' });
  t.setSource(c);
  return t;
}

/**
 * @param {pc.Application} app
 * @param {object[]} houses 家ごとの記録（world/house-builder.js の life）
 * @param {number} seed テレビのちらつきの乱数
 */
export function createHouseLife(app, houses, seed = 1) {
  const device = app.graphicsDevice;
  const rnd = createRandom(seed + 777);
  const geo = () => ({ positions: [], normals: [], uvs: [], colors: [], indices: [] });
  const G = { win: geo(), bulb: geo(), tv: geo(), ember: geo() };
  /** 板を 1 枚足す（c：真ん中、ax・ay：横と縦の向き（半分の長さを掛けた物）、n：表の向き） */
  const quad = (g, c, ax, ay, col, n = [0, 1, 0]) => {
    const b = g.positions.length / 3;
    for (const [px, py] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.positions.push(c[0] + ax[0] * px + ay[0] * py, c[1] + ax[1] * px + ay[1] * py, c[2] + ax[2] * px + ay[2] * py);
      g.normals.push(n[0], n[1], n[2]);
      g.uvs.push((px + 1) / 2, (py + 1) / 2);
      g.colors.push(col[0], col[1], col[2], 1);
    }
    g.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const mul = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const on = (h, floor) => (floor >= 1 ? h.litUp : h.lit);
  const sources = [];   // 本物の光を置ける所 { p, kind, house }
  let counts = { lit: 0, tvs: 0, embers: 0, windows: 0 };

  for (const h of houses) {
    if (h.lit || h.litUp) counts.lit++;
    // 窓の灯り：外を向いた片面の板（家の中からは見えない）。開口より少し大きく
    for (const w of h.windows) {
      if (!on(h, w.floor)) continue;
      // 表（外）から見て反時計回りになるよう、横の向きを決める
      const ax = mul(w.u, w.w * 0.58), ay = [0, w.h * 0.58, 0];
      const c = cross(ax, ay), flip = c[0] * w.n[0] + c[2] * w.n[2] < 0;
      quad(G.win, w.p, flip ? mul(ax, -1) : ax, ay, mul(WINDOW, 0.5), w.n);
      counts.windows++;
    }
    // 電球：十字の 2 枚
    for (const l of h.lamps) {
      if (!on(h, l.floor)) continue;
      quad(G.bulb, l.p, [0.42, 0, 0], [0, 0.42, 0], mul(WARM, 0.9));
      quad(G.bulb, l.p, [0, 0, 0.42], [0, 0.42, 0], mul(WARM, 0.9));
      sources.push({ p: l.p, kind: 'lamp', house: h });
    }
    for (const l of h.glows) {
      if (!on(h, l.floor)) continue;
      quad(G.bulb, l.p, [l.r, 0, 0], [0, l.r, 0], mul(WARM, 0.75));
      quad(G.bulb, l.p, [0, 0, l.r], [0, l.r, 0], mul(WARM, 0.75));
      if (!h.lamps.some((q) => q.floor === l.floor)) sources.push({ p: l.p, kind: 'lamp', house: h });   // 吊り灯の無い階（二階）は、この灯りで照らす
    }
    // テレビの画面（点いたまま）
    if (h.tvOn) for (const t of h.tvs) {
      const p = [t.p[0] + t.n[0] * 0.006, t.p[1], t.p[2] + t.n[2] * 0.006];
      const ax = mul(t.u, t.w / 2), ay = [0, t.h / 2, 0];
      const c = cross(ax, ay), flip = c[0] * t.n[0] + c[2] * t.n[2] < 0;
      quad(G.tv, p, flip ? mul(ax, -1) : ax, ay, mul(TV, 0.22), t.n);   // 夜は画面全体が明るく写るので弱め（0.42 では真ん中が白く飛んだ）
      // 前に漏れる淡い光（少し大きな板）
      quad(G.tv, [p[0] + t.n[0] * 0.02, p[1], p[2] + t.n[2] * 0.02], mul(flip ? mul(ax, -1) : ax, 1.3), mul(ay, 1.4), mul(TV, 0.05), t.n);
      sources.push({ p: [t.p[0] + t.n[0] * 0.5, t.p[1], t.p[2] + t.n[2] * 0.5], kind: 'tv', house: h });
      counts.tvs++;
    }
    // 熾火
    if (h.emberOn) for (const e of h.embers) {
      quad(G.ember, [e.p[0] + e.n[0] * 0.02, e.p[1], e.p[2] + e.n[2] * 0.02], [0.24, 0, 0], [0, 0.2, 0], EMBER);
      quad(G.ember, [e.p[0] + e.n[0] * 0.02, e.p[1], e.p[2] + e.n[2] * 0.02], [0, 0, 0.24], [0, 0.2, 0], EMBER);
      counts.embers++;
    }
  }

  // ---- 形と質感（加算。光の板は霧の色を足さない） ----
  const radial = glowTexture(device), rect = rectTexture(device);
  const parts = {};
  let tris = 0;
  for (const [k, g] of Object.entries(G)) {
    if (!g.indices.length) continue;
    const m = new pc.StandardMaterial();
    m.useLighting = false; m.useSkybox = false; m.useFog = false;
    m.diffuse = new pc.Color(0, 0, 0);
    m.emissive = new pc.Color(1, 1, 1); m.emissiveVertexColor = true;
    m.emissiveMap = k === 'win' || k === 'tv' ? rect : radial;
    m.emissiveIntensity = 0;
    m.blendType = pc.BLEND_ADDITIVE; m.depthWrite = false;
    m.cull = k === 'win' || k === 'tv' ? pc.CULLFACE_BACK : pc.CULLFACE_NONE;   // 窓と画面は表（外・前）からだけ
    m.update();
    const e = new pc.Entity(`house-life-${k}`);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, g), m)], castShadows: false, receiveShadows: false });
    e.enabled = false;
    app.root.addChild(e);
    parts[k] = { e, m, last: -1 };
    tris += g.indices.length / 3;
  }
  sceneBudget.triangles += tris;

  // ---- 本物の光（カメラに近い所だけ） ----
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const e = new pc.Entity(`house-light-${i}`);
    e.addComponent('light', { type: 'omni', color: new pc.Color(...WARM), intensity: 0, range: 5, castShadows: false });
    e.enabled = false;
    app.root.addChild(e);
    pool.push({ e, src: null });
  }

  const set = (part, v) => {
    if (!part) return;
    const q = Math.round(v * 60) / 60;
    if (q === part.last) return;
    part.last = q;
    part.e.enabled = q > 0.005;
    part.m.emissiveIntensity = q;
    part.m.update();
  };
  let tvLevel = 0.9, tvNext = 0, emberT = 0, pick = 0;
  return {
    counts: { ...counts, triangles: tris, sources: sources.length },
    /**
     * 毎フレーム：night（0〜1。夕方から夜で 1）・カメラの位置
     */
    update(dt, night, cx, cy, cz) {
      // テレビ：場面が変わるように、時々明るさが変わる
      tvNext -= dt;
      if (tvNext <= 0) { tvLevel = 0.55 + rnd.next() * 0.55; tvNext = 0.25 + rnd.next() * 1.6; }
      emberT += dt;
      const ember = 0.75 + 0.18 * Math.sin(emberT * 1.7) + 0.07 * Math.sin(emberT * 5.3);
      set(parts.win, smoothstep(0, 1, night) * 0.95);
      set(parts.bulb, 0.55 + 0.45 * night);
      set(parts.tv, tvLevel * (0.7 + 0.3 * night));
      set(parts.ember, ember * (0.6 + 0.4 * night));
      // 本物の光：0.3 秒ごとに、近い所を選び直す（強さは毎フレーム）
      pick -= dt;
      if (pick <= 0) {
        pick = 0.3;
        const near = [];
        for (const s of sources) {
          const d = Math.hypot(s.p[0] - cx, s.p[1] - cy, s.p[2] - cz);
          if (d < REACH) near.push({ s, d: d + (s.kind === 'tv' ? 4 : 0) });
        }
        near.sort((a, b) => a.d - b.d);
        pool.forEach((L, i) => {
          const s = near[i]?.s || null;
          L.src = s;
          L.e.enabled = !!s;
          if (!s) return;
          L.e.setPosition(s.p[0], s.p[1] - (s.kind === 'lamp' ? 0.05 : 0), s.p[2]);
          const c = s.kind === 'tv' ? TV : WARM;
          L.e.light.color = new pc.Color(c[0], c[1], c[2]);
          L.e.light.range = s.kind === 'tv' ? 3.6 : 5.5;
        });
      }
      for (const L of pool) {
        if (!L.src) continue;
        L.e.light.intensity = L.src.kind === 'tv' ? 0.5 * tvLevel : 0.8 + 0.3 * night;   // 吊り灯：夜で 1.1（角燈の 0.62 より明るく、部屋がほんのり見えるくらい）
      }
    },
    /** 確かめ用 */
    get lights() { return pool.filter((L) => L.e.enabled).length; },
  };
}
