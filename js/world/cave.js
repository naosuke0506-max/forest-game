// 洞窟の見た目（岩の床・壁・天井の殻、口の岩の面、口のまわりの細かい地面）と、床・壁の登録。
// 配置と形は world/cave-plan.js（world/landform.js の cave）。利用者の指示（2026-11-14）：
//   「洞窟内から外が見えたりする」→ 中は、すき間の無い 1 つの殻にする（床・壁・天井がつながった袋。口だけが開いている）
//   「洞窟内にはとても広い空洞なども」「マップの地下を洞窟が占領」→ 形は 0.8 m の升目（cave-plan.js が焼く）から作るので、
//     通り道も広間も柱も、同じ作り方で 1 つにつながる
// 作り方：
//   殻：升目の「中」の升ごとに、床と天井の面を作る。中と外の境目には、床から天井の縁まで壁を立てる（境目の線は升の辺の上で補間）。
//       口の所は、口の面（切り通しとの境）でちょうど切って、そこには壁を立てない
//   口の岩の面：口の面に立てる岩の壁（洞窟の穴の形にくり抜く）。上は岩山の地面、下は切り通しの地面まで
//   口のまわりの地面：地面の網（2.6 m ごと）では口の形が出ないので、口のまわりだけ 0.7 m ごとの細かい地面を作る
//       （地面と同じ質感と色。world/terrain.js は、ここの網を抜き、足の高さは計算の高さを使う）
//   当たり：床は world/floors.js の「地面の下の層」、壁は world/obstacles.js の「場」に登録する（どちらも cave-plan.js の升目を読む）
// 重さ：殻は 40 m 四方ごとに分けて、近くの物だけ描く。地上にいて口から遠いときは、どれも描かない
import * as pc from 'playcanvas';
import { createMesh, sceneBudget } from '../core/mesh-utils.js';
import { fbm } from '../core/random.js';
import { PATCH, skyWarp } from './cave-plan.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TILE = 40;        // 殻を分ける大きさ（m）
const SHOW = 75;        // この距離より近い殻だけ描く（m）
const MOUTH_NEAR = 60;  // 地上にいるとき、口からこの距離より近ければ殻を描く（m）

/**
 * @param {object} land world/landform.js（cave と uncarved）
 * @param {{ obstacles, floors, rockTex, seed, terrain }} o terrain：world/terrain.js（地面の質感・色・計算の高さ）
 */
export function createCave(app, land, { obstacles, floors, rockTex = null, seed = 1, terrain = null, waterMat = null }) {
  const C = land.cave, B = C.baked, G = B.G, nx = B.nx, nz = B.nz;
  const device = app.graphicsDevice;
  const SK = C.sky;   // 天坑（world/cave-plan.js の SKY と、決めた高さ）
  /** 天坑から入る空の光の当たり具合（0〜1。穴の真下が 1）：岩の色に焼き込む */
  const sunAt = (x, z) => 1 - smooth(SK.low - 2, SK.low + 10, Math.hypot(x - SK.x, z - SK.z));
  /** 天坑の穴の形にならした距離（world/cave-plan.js の skyWarp） */
  const skyN = (x, z) => Math.hypot(x - SK.x, z - SK.z) / skyWarp(Math.atan2(z - SK.z, x - SK.x));

  // ---- 殻に使う「壁からの距離」：口の面より前（切り通し）は外にする。口の面でちょうど 0 になる ----
  const D = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const k = iz * nx + ix, x = B.x0 + ix * G, z = B.z0 + iz * G;
    let d = B.D[k];
    for (const m of C.mouths) {
      const [s, l] = C.frame(m, x, z);
      if (s < 4 && s > -m.len - 8 && Math.abs(l) < m.hw + 7) d = Math.max(d, -s);
    }
    D[k] = d;
  }
  const xOf = (ix) => B.x0 + ix * G, zOf = (iz) => B.z0 + iz * G;
  /** 升目の値を、4 点の間をなめらかに読む */
  const sample = (A, x, z) => {
    const fx = Math.min(nx - 1.001, Math.max(0, (x - B.x0) / G)), fz = Math.min(nz - 1.001, Math.max(0, (z - B.z0) / G));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, k = iz * nx + ix;
    return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - tz) + (A[k + nx] * (1 - tx) + A[k + nx + 1] * tx) * tz;
  };
  /** 口からの道のりで決まる明るさ（口の近くは明るく、奥は暗い） */
  const shadeOf = (dist) => 0.85 - 0.5 * smooth(5, 36, dist);

  // ---- 明かり：光る結晶（奥は真っ暗なので、広間と通り道の所々に置く。見た目の飾りで、岩の色に明かりを焼き込む。動く光は使わない） ----
  let rs = (seed * 9301 + 49297) >>> 0;
  const rnd = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296);
  const lights = [];   // { x, y, z, r（届く遠さ）, k（強さ）, tint: [r, g, b] }
  const TINTS = [[0.35, 0.9, 1.0], [0.45, 1.0, 0.75], [0.6, 0.75, 1.0]];
  const addLight = (x, z, r, k) => {
    const q = C.at(x, z);
    if (!q || q.d > -0.3 || q.open > 0.5) return;
    if (Math.hypot(x - SK.x, z - SK.z) < SK.pond + 1.2) return;   // 天坑の下の池の中には置かない
    if (C.crypt && Math.hypot(x - C.crypt.x, z - C.crypt.z) < 1.6) return;   // 教会の縦穴の梯子の足もとにも
    lights.push({ x, y: q.floor + 0.5, z, r, k, tint: TINTS[Math.floor(rnd() * TINTS.length)] });
  };
  for (const sm of C.samples) {
    if (!sm.room) continue;
    // 広間：壁ぎわに、広さに合わせた数（大空洞は 8 つ）
    const n = Math.max(2, Math.round(sm.room.r / 2.7));
    for (let k = 0; k < n; k++) {
      const a = ((k + rnd() * 0.7) / n) * Math.PI * 2;
      let r = sm.room.r * 0.3;
      while (r < sm.room.r + 3 && sample(D, sm.x + Math.cos(a) * (r + 0.8), sm.z + Math.sin(a) * (r + 0.8)) < -0.5) r += 0.5;
      addLight(sm.x + Math.cos(a) * r, sm.z + Math.sin(a) * r, 8 + sm.room.r * 0.25, 0.7 + rnd() * 0.3);
    }
  }
  for (const pl of C.pillars) { const a = rnd() * 6.28; addLight(pl.x + Math.cos(a) * (pl.r + 1.1), pl.z + Math.sin(a) * (pl.r + 1.1), 10, 0.9); }
  for (const ps of C.passages) {
    // 通り道：約 34 m ごとに 1 つ、壁ぎわ（口の近く 14 m は外の光があるので置かない）
    let acc = 14 + rnd() * 20;
    for (let i = 1; i < ps.samples.length - 1; i++) {
      const a = ps.samples[i - 1], b = ps.samples[i], L = Math.hypot(b.x - a.x, b.z - a.z);
      acc -= L;
      if (acc > 0 || b.dist < 14 || b.room) continue;
      acc = 28 + rnd() * 14;
      const sd = rnd() < 0.5 ? -1 : 1, off = Math.max(0.2, b.hw - 0.55);
      addLight(b.x - ((b.z - a.z) / L) * sd * off, b.z + ((b.x - a.x) / L) * sd * off, 7.5, 0.6 + rnd() * 0.3);
    }
  }
  const LB = 12, lightBins = new Map();
  for (const l of lights) for (let gx = Math.floor((l.x - l.r) / LB); gx <= Math.floor((l.x + l.r) / LB); gx++) for (let gz = Math.floor((l.z - l.r) / LB); gz <= Math.floor((l.z + l.r) / LB); gz++) {
    const k = gx * 4096 + gz;
    if (!lightBins.has(k)) lightBins.set(k, []);
    lightBins.get(k).push(l);
  }
  /** その点に届く結晶の明かり [r, g, b]（近いほど明るい） */
  const glow = [0, 0, 0];
  const glowAt = (x, y, z) => {
    glow[0] = glow[1] = glow[2] = 0;
    const list = lightBins.get(Math.floor(x / LB) * 4096 + Math.floor(z / LB));
    if (!list) return glow;
    for (const l of list) {
      const d = Math.hypot(x - l.x, (y - l.y) * 0.6, z - l.z);
      if (d >= l.r) continue;
      const w = l.k * (1 - d / l.r) ** 2 * 0.55;
      glow[0] += l.tint[0] * w; glow[1] += l.tint[1] * w; glow[2] += l.tint[2] * w;
    }
    return glow;
  };

  // ---- 殻を作る（40 m 四方ごとの入れ物に分ける） ----
  const tiles = new Map();
  const tileAt = (x, z) => {
    const key = Math.floor((x - B.x0) / TILE) * 1000 + Math.floor((z - B.z0) / TILE);
    let t = tiles.get(key);
    if (!t) { t = { positions: [], normals: [], uvs: [], colors: [], indices: [], verts: new Map(), cx: 0, cz: 0, n: 0, gem: { positions: [], colors: [], indices: [] } }; tiles.set(key, t); }
    return t;
  };
  const tileOf = (ix, iz) => tileAt(B.x0 + ix * G, B.z0 + iz * G);
  const pushVert = (t, x, y, z, nxn, nyn, nzn, u, v, c) => {
    const g = glowAt(x, y, z);
    t.positions.push(x, y, z); t.normals.push(nxn, nyn, nzn); t.uvs.push(u, v);
    // 天坑の下：空の光が当たる所は明るく、上を向いた床は苔で緑がかる（2026-11-22）
    const sl = sunAt(x, z);
    let cr = c, cg = c * 0.97, cb = c * 0.93;
    if (sl > 0) {
      const b = c + (0.72 - c) * sl * 0.6, moss = sl * Math.max(0, nyn) * 0.5;
      cr = b * (1 - 0.3 * moss); cg = b * 0.97 * (1 + 0.05 * moss); cb = b * 0.93 * (1 - 0.4 * moss);
    }
    t.colors.push(Math.min(1, cr + g[0]), Math.min(1, cg + g[1]), Math.min(1, cb + g[2]), 1);
    return t.positions.length / 3 - 1;
  };
  const vert = (t, key, x, y, z, nxn, nyn, nzn, u, v, c) => {
    let i = t.verts.get(key);
    if (i !== undefined) return i;
    i = pushVert(t, x, y, z, nxn, nyn, nzn, u, v, c);
    t.verts.set(key, i);
    t.cx += x; t.cz += z; t.n++;
    return i;
  };
  /** 三角形を足す。向き（表）は want（面の表の向き）に合わせる */
  const tri = (t, a, b, c, wx, wy, wz) => {
    const P = t.positions, ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const nxn = uy * vz - uz * vy, nyn = uz * vx - ux * vz, nzn = ux * vy - uy * vx;
    if (Math.abs(nxn) + Math.abs(nyn) + Math.abs(nzn) < 1e-9) return;
    if (nxn * wx + nyn * wy + nzn * wz >= 0) t.indices.push(a, b, c); else t.indices.push(a, c, b);
  };
  const e = G;
  const gradOf = (A, x, z) => [(sample(A, x + e, z) - sample(A, x - e, z)) / (2 * e), (sample(A, x, z + e) - sample(A, x, z - e)) / (2 * e)];
  /** 升の角・辺の上の点（kind：f 床 / c 天井 / w0〜w2 壁の下・中・上） */
  const pointAt = (a, b) => {
    // a・b：升目の点の番号。a === b なら角、違えば辺の上の、距離が 0 になる所
    if (a === b) return { x: xOf(a % nx), z: zOf(Math.floor(a / nx)), F: B.F[a], C: B.C[a], S: B.S[a], W: B.W[a], key: `n${a}`, mouth: false };
    const t = D[a] / (D[a] - D[b]);
    const x = xOf(a % nx) + (xOf(b % nx) - xOf(a % nx)) * t, z = zOf(Math.floor(a / nx)) + (zOf(Math.floor(b / nx)) - zOf(Math.floor(a / nx))) * t;
    const F = B.F[a] + (B.F[b] - B.F[a]) * t, W = B.W[a] + (B.W[b] - B.W[a]) * t;
    // 口の面の上の点か（元の距離ではまだ中）：天井は洞窟の天井のまま。ふつうの壁の上の点：天井の縁は壁の高さ
    const mouth = B.D[a] + (B.D[b] - B.D[a]) * t < -0.05;
    const Cc = mouth ? B.C[a] + (B.C[b] - B.C[a]) * t : F + W;
    return { x, z, F, C: Cc, S: B.S[a] + (B.S[b] - B.S[a]) * t, W, key: a < b ? `e${a}_${b}` : `e${b}_${a}`, mouth };
  };
  const floorVert = (t, p) => {
    const [gx, gz] = gradOf(B.F, p.x, p.z), l = Math.hypot(gx, 1, gz);
    return vert(t, 'f' + p.key, p.x, p.F + 0.02, p.z, -gx / l, 1 / l, -gz / l, p.x / 3, p.z / 3, shadeOf(p.S) * 0.82);
  };
  /** 天坑の天井の穴の中か（縦穴の下の端の半径より内） */
  const inSky = (p) => skyN(p.x, p.z) < SK.low;
  // 教会の隠し扉の縦穴（world/cave-plan.js の CRYPT）：下の間の天井に、教会の向きの四角い穴（world/church.js が縦穴の石の壁と梯子を作る）
  const KR = C.crypt;
  const cryptQ = (p) => { const [lx, lz] = C.cryptLocal(p.x, p.z); return [lx, lz, Math.max(Math.abs(lx), Math.abs(lz))]; };
  const inCrypt = (p) => !!KR && cryptQ(p)[2] < KR.half;
  /** 天井に穴が開いている所か（天坑・教会の縦穴） */
  const inHole = (p) => inSky(p) || inCrypt(p);
  const ceilVert = (t, p0) => {
    // 穴の中の点は、穴のふちへ寄せる（穴の形を、升目のぎざぎざでなく丸く・四角くする。縦穴の壁がそこから立ち上がる）
    //   天坑：真ん中から外へ、半径 low（ゆがみを掛けた）の所へ。教会の縦穴：真ん中から外へ、四角の縁へ
    let p = p0;
    if (inSky(p0)) {
      const dx = p0.x - SK.x, dz = p0.z - SK.z, k = (SK.low * skyWarp(Math.atan2(dz, dx))) / Math.max(1e-4, Math.hypot(dx, dz)), x = SK.x + dx * k, z = SK.z + dz * k;
      p = { ...p0, x, z, C: sample(B.C, x, z) };
    } else if (inCrypt(p0)) {
      const [lx, lz, m] = cryptQ(p0), k = KR.half / Math.max(1e-4, m), sx = lx * k, sz = lz * k;
      const x = KR.x + KR.r[0] * sx + KR.f[0] * sz, z = KR.z + KR.r[1] * sx + KR.f[1] * sz;
      p = { ...p0, x, z, C: sample(B.C, x, z) };
    }
    const [gx, gz] = gradOf(B.C, p.x, p.z), l = Math.hypot(gx, 1, gz);
    return vert(t, 'c' + p.key, p.x, p.C, p.z, gx / l, -1 / l, gz / l, p.x / 3.4, p.z / 3.4, shadeOf(p.S) * 0.92);
  };
  const wallVert = (t, p, row) => {
    // 壁の向き：中へ向く（距離が減る向き）
    let [gx, gz] = gradOf(D, p.x, p.z);
    const l = Math.hypot(gx, gz) || 1; gx /= l; gz /= l;
    const h = [0, 0.52, 1][row] * (p.C - p.F);
    // 真ん中の段は、外へ少しふくらませる（岩のごつごつ。まっすぐな板に見えないように）
    const out = row === 1 ? 0.08 + 0.3 * fbm(p.x * 0.9 + p.F, p.z * 0.9, seed + 71) : 0;
    const u = Math.abs(gx) > Math.abs(gz) ? p.z : p.x;
    return vert(t, `w${row}` + p.key, p.x + gx * out, p.F + h + (row === 0 ? 0.02 : 0), p.z + gz * out, -gx, 0, -gz, u / 3, (p.F + h) / 3, shadeOf(p.S) * (0.78 + 0.12 * row));
  };
  const onMouthPlane = (p) => p.mouth;

  let tris = 0;
  for (let iz = 0; iz < nz - 1; iz++) for (let ix = 0; ix < nx - 1; ix++) {
    const k = iz * nx + ix;
    const corner = [k, k + 1, k + nx + 1, k + nx];
    const ins = corner.map((c) => D[c] < 0);
    if (!ins[0] && !ins[1] && !ins[2] && !ins[3]) continue;
    const t = tileOf(ix, iz);
    // 升をひと回りして、中にある所の多角形を作る（角と、辺の上の境目の点）
    const poly = [];
    for (let i = 0; i < 4; i++) {
      const a = corner[i], b = corner[(i + 1) % 4];
      if (ins[i]) poly.push(pointAt(a, a));
      if (ins[i] !== ins[(i + 1) % 4]) poly.push(ins[i] ? pointAt(a, b) : pointAt(b, a));
    }
    if (poly.length < 3) continue;
    const fv = poly.map((p) => floorVert(t, p)), cv = poly.map((p) => ceilVert(t, p));
    for (let i = 1; i < poly.length - 1; i++) {
      tri(t, fv[0], fv[i], fv[i + 1], 0, 1, 0);
      // 穴の所は天井を作らない（3 つの点が同じ穴の中）
      const allSky = inSky(poly[0]) && inSky(poly[i]) && inSky(poly[i + 1]), allCrypt = inCrypt(poly[0]) && inCrypt(poly[i]) && inCrypt(poly[i + 1]);
      if (!allSky && !allCrypt) tri(t, cv[0], cv[i], cv[i + 1], 0, -1, 0);
    }
    // 壁：境目の点が 2 つ続く所（その間が外）。口の面の上は開けておく
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      if (p.key[0] !== 'e' || q.key[0] !== 'e') continue;
      if (onMouthPlane(p) && onMouthPlane(q)) continue;
      const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
      const [gx, gz] = gradOf(D, mx, mz);
      const rows = [0, 1, 2].map((r) => [wallVert(t, p, r), wallVert(t, q, r)]);
      for (let r = 0; r < 2; r++) {
        tri(t, rows[r][0], rows[r][1], rows[r + 1][1], -gx, 0, -gz);
        tri(t, rows[r][0], rows[r + 1][1], rows[r + 1][0], -gx, 0, -gz);
      }
      // 壁の上の縁と天井の縁の間（壁の上の段はふくらませていないので、同じ所にある。念のため細い面でつなぐ）
    }
  }

  // ---- 鍾乳石：広間の天井から下がる岩のつらら（通り道の天井には、高い所だけ）。頭の上 2.6 m は空ける ----
  const cone = (t, x, yTop, z, len, r, shade) => {
    const SIDES = 5, base = [];
    const a0 = rnd() * 6.28;
    for (let i = 0; i < SIDES; i++) {
      const a = a0 + (i / SIDES) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
      base.push(pushVert(t, x + cx * r, yTop + 0.25, z + cz * r, cx, -0.25, cz, i / SIDES, 0, shade));
    }
    const tip = pushVert(t, x + (rnd() - 0.5) * r * 0.5, yTop - len, z + (rnd() - 0.5) * r * 0.5, 0, -1, 0, 0.5, len / 2, shade * 0.9);
    for (let i = 0; i < SIDES; i++) t.indices.push(base[i], tip, base[(i + 1) % SIDES]);
  };
  for (const sm of C.samples) {
    if (!sm.room) continue;
    const n = Math.round((Math.PI * sm.room.r * sm.room.r) / 26);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.28, r = Math.sqrt(rnd()) * sm.room.r * 0.95, x = sm.x + Math.cos(a) * r, z = sm.z + Math.sin(a) * r;
      const q = C.at(x, z);
      if (!q || q.d > -1.2 || q.open > 0.5) continue;
      if (Math.hypot(x - SK.x, z - SK.z) < SK.low + 1.5) continue;   // 天坑の穴のまわりには下げない
      if (KR && Math.hypot(x - KR.x, z - KR.z) < 2.2) continue;     // 教会の縦穴（梯子）のまわりにも
      const room = q.ceil - q.floor, len = Math.min(room - 2.6, (0.4 + rnd() * rnd() * 3.2) * Math.min(1, room / 7));
      if (len < 0.35) continue;
      cone(tileAt(x, z), x, q.ceil, z, len, 0.14 + len * 0.11, shadeOf(q.dist) * 0.9);
    }
  }
  // ---- 結晶の形：明かりごとに、とがった柱を 3〜6 本（光って見える。影は付けない） ----
  for (const l of lights) {
    const t = tileAt(l.x, l.z), g = t.gem, n = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.28, d = rnd() * 0.55, bx = l.x + Math.cos(a) * d, bz = l.z + Math.sin(a) * d, by = l.y - 0.55;
      const h = 0.35 + rnd() * 0.75, w = 0.07 + h * 0.1, tilt = 0.35, tx = (rnd() - 0.5) * tilt, tz = (rnd() - 0.5) * tilt;
      const base = g.positions.length / 3, br = 0.55 + rnd() * 0.45;
      for (let i = 0; i < 4; i++) {
        const c = Math.cos(a + i * Math.PI / 2) * w, sn = Math.sin(a + i * Math.PI / 2) * w;
        g.positions.push(bx + c, by, bz + sn); g.colors.push(l.tint[0] * br * 0.5, l.tint[1] * br * 0.5, l.tint[2] * br * 0.5, 1);
        g.positions.push(bx + c * 0.8 + tx * h, by + h * 0.72, bz + sn * 0.8 + tz * h); g.colors.push(l.tint[0] * br, l.tint[1] * br, l.tint[2] * br, 1);
      }
      g.positions.push(bx + tx * h * 1.35, by + h, bz + tz * h * 1.35); g.colors.push(Math.min(1, l.tint[0] * br * 1.3), Math.min(1, l.tint[1] * br * 1.3), Math.min(1, l.tint[2] * br * 1.3), 1);
      const tip = base + 8;
      for (let i = 0; i < 4; i++) {
        const a0 = base + i * 2, a1 = a0 + 1, b0 = base + ((i + 1) % 4) * 2, b1 = b0 + 1;
        g.indices.push(a0, a1, b0, b0, a1, b1, a1, tip, b1);
      }
    }
  }

  // ---- 岩の質感（殻と、口の岩の面） ----
  const mat = new pc.StandardMaterial();
  mat.diffuse = new pc.Color(0.82, 0.78, 0.72);
  mat.diffuseVertexColor = true;
  mat.vertexColorGamma = true;
  mat.useMetalness = true; mat.metalness = 0; mat.gloss = 0.22;
  if (rockTex) {
    mat.diffuseMap = rockTex.diffuse;
    if (rockTex.normal) mat.normalMap = rockTex.normal;
  }
  mat.cull = pc.CULLFACE_NONE;
  mat.useFog = false;   // 中は霧を掛けない（霧の色は明るいので、外から見ると穴の奥が光って見えてしまう。暗さは岩の色で付ける）
  mat.update();
  const faceMat = mat.clone();   // 口の岩の面は外にあるので、霧を掛ける
  faceMat.useFog = true;
  faceMat.update();
  // 結晶：自分で光る（明かりの計算をしない）
  const gemMat = new pc.StandardMaterial();
  gemMat.useLighting = false;
  gemMat.diffuse = new pc.Color(0, 0, 0);
  gemMat.emissive = new pc.Color(1, 1, 1);
  gemMat.emissiveVertexColor = true;
  gemMat.emissiveIntensity = 1.0;
  gemMat.useFog = false;
  gemMat.cull = pc.CULLFACE_NONE;
  gemMat.update();

  const chunks = [];
  let gemTris = 0;
  for (const t of tiles.values()) {
    if (!t.indices.length) continue;
    const mesh = createMesh(device, { positions: t.positions, normals: t.normals, uvs: t.uvs, colors: t.colors, indices: t.indices });
    const mis = [new pc.MeshInstance(mesh, mat)];
    if (t.gem.indices.length) { mis.push(new pc.MeshInstance(createMesh(device, t.gem), gemMat)); gemTris += t.gem.indices.length / 3; }
    const ent = new pc.Entity('cave-shell');
    ent.addComponent('render', { meshInstances: mis, castShadows: false, receiveShadows: false });
    ent.enabled = false;
    app.root.addChild(ent);
    chunks.push({ ent, x: t.cx / t.n, z: t.cz / t.n });
    tris += t.indices.length / 3;
  }
  tris += gemTris;

  // ---- 口：岩の面と、まわりの細かい地面（口ごとに 1 つずつの形。見えない口は描かれない） ----
  const groundAt = terrain ? terrain.analyticAt : land.heightAt;
  const footprints = [];
  let patchTris = 0;
  for (const m of C.mouths) {
    const face = { positions: [], uvs: [], colors: [], indices: [] };   // 向き（法線）は形から計算する
    const patch = { positions: [], uvs: [], colors: [], indices: [] };
    const at = (s, l) => [m.x + m.in[0] * s + m.in[1] * l, m.z + m.in[1] * s - m.in[0] * l];
    // 岩の面：口の面（少し奥）に立てる。横に 0.25 m ごとの柱に分け、穴の所だけ開ける
    // 柱の間隔：穴のまわり（通り道の幅＋両脇 1 m）は 0.2 m（穴の形を出す）、その外は 0.7 m
    const W = m.hw + 8, cols = [], ls = [];
    for (let l = -W; l < -m.hw - 1; l += 0.7) ls.push(l);
    for (let l = -m.hw - 1; l < m.hw + 1; l += 0.2) ls.push(l);
    for (let l = m.hw + 1; l <= W + 1e-6; l += 0.7) ls.push(l);
    for (const l of ls) {
      const [bx, bz] = at(0.35, l), [fx, fz] = at(-0.35, l), [px, pz] = at(0.12, l);
      const top = groundAt(bx, bz) + 0.3, bottom = Math.min(groundAt(fx, fz), top) - 0.7;
      // 穴：口のすぐ奥の洞窟の中。殻の口より少し小さくする（壁から 0.2 m・天井から 0.15 m 内側。殻と岩の面の間にすき間を作らない）
      let hole = null, okAll = true, ceil = Infinity, floor = Infinity;
      for (const sd of [0.06, 0.3, 0.6]) {
        const q = C.at(...at(sd, l));
        if (!q || q.d > -0.2) { okAll = false; break; }
        ceil = Math.min(ceil, q.ceil); floor = Math.min(floor, q.floor);
      }
      if (okAll) hole = [floor - 0.4, Math.min(ceil - 0.15, top - 0.2)];
      cols.push({ l, x: px, z: pz, top, bottom, hole });
    }
    // 岩の面のでこぼこ（2026-11-21 に強めた。利用者の指摘「入り口が平ら」）：口の面から手前へ最大 1.6 m ふくらませる（大きなうねりと細かいでこぼこの 2 段）。
    // 穴の上は、口にかぶさる張り出し（岩のひさし）にする。穴とその両脇の低い所、上と下のふちはふくらませない（通り道に岩が出ないように）
    // 前は向き（法線）を全部同じにしていたので、ふくらみに陰影が付かず、平らな板に見えていた → 形から向きを計算する（createMesh）
    const holeL = cols.filter((c) => c.hole).map((c) => c.l), hl0 = Math.min(...holeL), hl1 = Math.max(...holeL);
    const holeTop = Math.min(...cols.filter((c) => c.hole).map((c) => c.hole[1]));
    const ROWS = Math.max(3, Math.ceil(Math.max(...cols.map((c) => c.top - c.bottom)) / 0.8));
    const fv = (c, y, shade, edge) => {
      const nearHole = Math.max(hl0 - c.l, c.l - hl1, 0);
      const low = smooth(m.y + 0.5, m.y + 3.2, y);                       // 通り道の高さ（人の背まで）は、穴の横でふくらませない
      const k = edge * Math.max(smooth(0.5, 1.8, nearHole), low * smooth(0, 0.6, nearHole));
      const big = fbm(c.l * 0.18 + 3, y * 0.22, seed + 129), fine = fbm(c.l * 0.7 + 7, y * 0.75, seed + 131);
      // 高い岩の面（風穴の大きな岩山）ほど大きくふくらませ、縦のひだ（岩の割れ目）も付ける（遠くから見ても平らな壁に見えないように）
      const tall = Math.min(1, Math.max(0, (c.top - c.bottom - 5) / 8));
      const ridge = Math.abs(Math.sin(c.l * 0.55 + big * 4));
      let out = ((1.15 + 1.4 * tall) * big + 0.45 * fine + (0.25 + 0.6 * tall) * ridge) * k;
      // 口のひさし：穴の上 0.3〜3 m を、穴の幅の所で手前へ張り出す
      const lip = smooth(holeTop + 0.1, holeTop + 0.9, y) * (1 - smooth(holeTop + 2.2, holeTop + 4, y)) * (1 - smooth(0.5, 3.5, nearHole)) * edge;
      out += lip * (0.8 + 0.5 * fine);
      face.positions.push(c.x - m.in[0] * out, y, c.z - m.in[1] * out); face.uvs.push(c.l / 3, y / 3);
      const sh = shade * (0.78 + 0.32 * fbm(c.l * 0.3, y * 0.3, seed + 133)) * (1 - 0.18 * lip);
      face.colors.push(sh, sh * 0.97, sh * 0.93, 1);
      return face.positions.length / 3 - 1;
    };
    const quad = (a, b, ya0, ya1, yb0, yb1, s0, s1) => {
      if (ya1 - ya0 < 0.02 && yb1 - yb0 < 0.02) return;
      // 縦に分ける。分ける数はこの岩の面のどの柱も同じ（隣の面と、柱の上の点の高さがそろい、すき間ができない）
      const n = ROWS;
      let pa = fv(a, ya0, s0, 0), pb = fv(b, yb0, s0, 0);
      for (let r = 1; r <= n; r++) {
        const t = r / n, edge = r === n ? 0 : 1;
        const qa = fv(a, ya0 + (ya1 - ya0) * t, s0 + (s1 - s0) * t, edge), qb = fv(b, yb0 + (yb1 - yb0) * t, s0 + (s1 - s0) * t, edge);
        face.indices.push(pa, qb, pb, pa, qa, qb);   // 外（口の前）から見て表になる向き（形から計算する法線が外を向くように）
        pa = qa; pb = qb;
      }
    };
    for (let i = 0; i < cols.length - 1; i++) {
      const a = cols[i], b = cols[i + 1];
      if (a.top - a.bottom < 0.75 && b.top - b.bottom < 0.75) continue;   // 段の無い所（岩の面の端）
      if (a.hole && b.hole) quad(a, b, a.hole[1], a.top, b.hole[1], b.top, 0.5, 0.8);   // 穴の上
      else quad(a, b, a.bottom, a.top, b.bottom, b.top, 0.62, 0.8);
    }
    // まわりの細かい地面：口の面をはさんで、前（切り通しと、その両脇）と後ろ（岩山の上）。
    // 前の最後の列は、口の面の少し奥まで延ばす（高さは口の面の手前のまま。殻の床の下にもぐり、床との間にすき間を作らない）
    const S0 = -m.len - PATCH.front, S1 = PATCH.back, LW = m.hw + PATCH.side, PS = 0.7;
    const rowsS = [];   // [置く所の s, 高さを読む所の s]
    for (let sv = S0; sv < -0.02; sv += PS) rowsS.push([sv, sv]);
    rowsS.push([-0.02, -0.02], [0.1, -0.02], [0.02, 0.02]);
    for (let sv = PS; sv <= S1 + 1e-6; sv += PS) rowsS.push([sv, sv]);
    const nl = Math.round((2 * LW) / PS);
    for (const [sp, sh] of rowsS) for (let j = 0; j <= nl; j++) {
      const l = -LW + (2 * LW * j) / nl, [x, z] = at(sp, l), [hx, hz] = at(sh, l);
      patch.positions.push(x, groundAt(hx, hz) + 0.05, z);
      patch.uvs.push(x / (terrain?.uvTile || 2), z / (terrain?.uvTile || 2));
      // 口のまわりは草を生やさず、土と灰色の岩肌に（2026-11-21。前は芝の盛り土のように見えた）：
      //   切り通しの床は土、口の面の近く（前 6 m・後ろ 4 m）と切り通しの壁は、岩の色の土
      const base = terrain ? terrain.colorAt(hx, hz) : [0.6, 0.6, 0.55, 0.5];
      const al = Math.abs(l);
      const rock = sp < 0 ? (1 - smooth(5, 10, -sp)) * (1 - smooth(m.hw + 4, m.hw + 9, al)) : (1 - smooth(2.5, 6, sp)) * (1 - smooth(m.hw + 3, m.hw + 8, al));
      const floorK = sp < 0 ? (1 - smooth(m.hw - 0.5, m.hw + 1.5, al)) * smooth(-m.len - 5, -m.len + 1, sp) : 0;
      const ROCK = [0.5, 0.48, 0.45, 0.5], DIRT = [0.62, 0.55, 0.46, 0.5];
      const c4 = base.map((v, i) => v + (ROCK[i] - v) * Math.min(1, rock * 1.2));
      patch.colors.push(...c4.map((v, i) => v + (DIRT[i] - v) * floorK));
    }
    for (let r = 0; r < rowsS.length - 1; r++) {
      if (rowsS[r][1] < 0 && rowsS[r + 1][1] > 0) continue;   // 口の面をまたぐ所は作らない（そこは岩の面）
      for (let j = 0; j < nl; j++) {
        const a = r * (nl + 1) + j, b = a + 1, c = a + nl + 1, d = c + 1;
        // 上から見て表になる向きにそろえる
        const q = patch.positions, ux = q[c * 3] - q[a * 3], uz = q[c * 3 + 2] - q[a * 3 + 2], vx = q[b * 3] - q[a * 3], vz = q[b * 3 + 2] - q[a * 3 + 2];
        if (uz * vx - ux * vz > 0) patch.indices.push(a, c, b, b, c, d); else patch.indices.push(a, b, c, b, d, c);
      }
    }
    if (face.indices.length) {
      const ent = new pc.Entity('cave-face');
      ent.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, face), faceMat)], castShadows: true, receiveShadows: true });
      app.root.addChild(ent);
      tris += face.indices.length / 3;
    }
    if (terrain && patch.indices.length) {
      const ent = new pc.Entity('cave-mouth-ground');
      ent.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, patch), terrain.material)], castShadows: false, receiveShadows: true });
      app.root.addChild(ent);
      patchTris += patch.indices.length / 3;
    }
    footprints.push({ type: 'cave', x: m.x, z: m.z, name: m.name, dx: m.in[0], dz: m.in[1] });
  }

  // ---- 天坑（2026-11-22）：縦穴の岩の壁・穴のまわりの細かい地面・池の水面・空から差し込む光の筋 ----
  const skyParts = [];   // 近くにいるときだけ描く物（水面と光の筋）
  let skyTris = 0, beamMat = null, beamEnt = null, glintMat = null;
  {
    const groundH = terrain ? terrain.analyticAt : land.heightAt;
    // 縦穴の壁：下（天井の穴のふち。少し外から始めて、天井の切り口のすき間を隠す）から、上（地面の穴のふち）まで。
    // 下ほど広いベル形。岩のでこぼこ（横のうねり・縦の割れ目）と、上の方の苔。形から向き（法線）を計算する
    const NA = 64, NR = 16, wall = { positions: [], uvs: [], colors: [], indices: [] };
    for (let j = 0; j <= NR; j++) {
      const t = j / NR;
      for (let i = 0; i <= NA; i++) {
        const a = ((i % NA) / NA) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), w = skyWarp(a);   // w：穴の形のゆがみ
        const top = groundH(SK.x + ca * (SK.r - 0.05) * w, SK.z + sa * (SK.r - 0.05) * w) - 0.04;
        const bottom = sample(B.C, SK.x + ca * SK.low * w, SK.z + sa * SK.low * w) - 0.08;   // 天井の切り口のすぐ下から（下へ垂らすと、下から見て縁が二重に見えた）
        const y = bottom + (top - bottom) * t;
        const edge = smooth(0, 0.14, t) * (1 - smooth(0.86, 1, t));
        const big = fbm(ca * 1.6 + y * 0.2 + 5, sa * 1.6 - y * 0.16, seed + 151), crack = Math.abs(Math.sin(a * 11 + big * 5));
        const rr = (SK.low + 0.12 + (SK.r - 0.05 - SK.low - 0.12) * smooth(0, 0.4, t)) * w + ((big - 0.42) * 1.5 + (crack - 0.5) * 0.15) * edge;
        wall.positions.push(SK.x + ca * rr, y, SK.z + sa * rr);
        wall.uvs.push((a * SK.r) / 3, y / 3);
        // 色：下は暗く、上ほど明るい。上の 1/4 は苔で緑がかる。割れ目は暗い
        const sh = (0.42 + 0.3 * t) * (0.82 + 0.3 * fbm(ca * 4 + y * 0.6, sa * 4, seed + 153)) * (1 - 0.1 * (1 - crack) * edge);
        const moss = smooth(0.7, 0.95, t) * (0.6 + 0.4 * big);
        wall.colors.push(sh * (1 - 0.35 * moss), sh * (0.97 + 0.05 * moss), sh * (0.93 - 0.4 * moss), 1);
      }
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
      const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1;
      wall.indices.push(a, b, c, b, d, c);   // 内（穴の真ん中）から見て表（下の確かめで向きをそろえる）
    }
    {
      // 向きの確かめ：最初の三角形の表が、穴の真ん中を向いているか。違えば全部裏返す
      const P = wall.positions, [a, b, c] = wall.indices;
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      const nxn = uy * vz - uz * vy, nzn = ux * vy - uy * vx;
      if (nxn * (SK.x - P[a * 3]) + nzn * (SK.z - P[a * 3 + 2]) < 0) for (let k = 0; k < wall.indices.length; k += 3) { const q = wall.indices[k + 1]; wall.indices[k + 1] = wall.indices[k + 2]; wall.indices[k + 2] = q; }
    }
    const wallEnt = new pc.Entity('sky-shaft');
    wallEnt.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, wall), faceMat)], castShadows: false, receiveShadows: true });
    app.root.addChild(wallEnt);
    skyTris += wall.indices.length / 3;

    // 穴のまわりの細かい地面：地面の網（2.6 m ごと）では丸い穴の形が出ないので、輪の形に細かく作る（地面と同じ質感と色）。
    // 内のふちは縦穴の壁の上の端に少しかぶせ、外のふちは地面の網に重ねる（地面の網は、穴のふちの下りの外まで抜いてある）
    if (terrain) {
      const ring = { positions: [], uvs: [], colors: [], indices: [] };
      const radii = [SK.r - 0.22];
      for (let r = SK.r + 0.05; r < SK.patch - 0.01; r += 0.25 + (r - SK.r) * 0.22) radii.push(r);
      radii.push(SK.patch);
      const NB = 72;
      const DIRT = [0.46, 0.42, 0.34, 0.5], ROCK = [0.42, 0.42, 0.38, 0.5];
      for (const r of radii) for (let i = 0; i <= NB; i++) {
        const a = ((i % NB) / NB) * Math.PI * 2, w = skyWarp(a), rw = r * (w + (1 - w) * smooth(SK.r + SK.lip, SK.patch, r));   // 内は穴の形、外の端は丸
        const x = SK.x + Math.cos(a) * rw, z = SK.z + Math.sin(a) * rw;
        ring.positions.push(x, groundH(x, z) + (r < SK.r ? 0.02 : 0.05), z);
        ring.uvs.push(x / (terrain.uvTile || 2), z / (terrain.uvTile || 2));
        // 穴のふち（下り）は草の無い土と岩肌、その外 2 m で元の地面の色へ
        // 土の帯の幅も向きで変える（輪の形に見えないように）。ふちの下りは岩肌と苔
        const nz = fbm(Math.cos(a) * 2 + 3, Math.sin(a) * 2, seed + 155), soilW = 0.3 + 1.6 * nz;
        const base = terrain.colorAt(x, z), k = 1 - smooth(SK.r + SK.lip - 0.3, SK.r + SK.lip + soilW, r), rock = (1 - smooth(SK.r, SK.r + SK.lip * 0.9, r)) * (0.45 + 0.55 * fbm(x * 0.5, z * 0.5, seed + 157));
        ring.colors.push(...base.map((v, c) => { const w = v + (DIRT[c] - v) * k; return w + (ROCK[c] - w) * rock; }));
      }
      for (let j = 0; j < radii.length - 1; j++) for (let i = 0; i < NB; i++) {
        const a = j * (NB + 1) + i, b = a + 1, c = a + NB + 1, d = c + 1;
        const q = ring.positions, ux = q[c * 3] - q[a * 3], uz = q[c * 3 + 2] - q[a * 3 + 2], vx = q[b * 3] - q[a * 3], vz = q[b * 3 + 2] - q[a * 3 + 2];
        if (uz * vx - ux * vz > 0) ring.indices.push(a, c, b, b, c, d); else ring.indices.push(a, b, c, b, d, c);   // 上から見て表
      }
      const ent = new pc.Entity('sky-rim-ground');
      ent.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, ring), terrain.material)], castShadows: false, receiveShadows: true });
      app.root.addChild(ent);
      patchTris += ring.indices.length / 3;
    }

    // 池の水面：川と同じ材質（さざ波が流れる）。岸の線は、床が水面より上に出る所（床のでこぼこに沿ってくねる）
    if (waterMat) {
      const N = 48, R = SK.pond + 0.5, wp = [SK.x, SK.surface, SK.z], wn = [0, 1, 0], wu = [SK.x / 3, SK.z / 3], wi = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2, x = SK.x + Math.cos(a) * R, z = SK.z + Math.sin(a) * R;
        wp.push(x, SK.surface, z); wn.push(0, 1, 0); wu.push(x / 3, z / 3);
        wi.push(0, 1 + ((i + 1) % N), 1 + i);
      }
      const ent = new pc.Entity('sky-pond');
      ent.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, { positions: wp, normals: wn, uvs: wu, indices: wi }), waterMat)], castShadows: false, receiveShadows: false });
      ent.enabled = false;
      app.root.addChild(ent);
      skyParts.push(ent);
      skyTris += N;
    }

    // 空から差し込む光の筋：天井の穴から池へ下りる、ぼんやりした光の幕（足し合わせて光る。昼は明るく、夜はほとんど見えない）。
    // 1 枚の板をいつもカメラへ向ける（横から見ると、真ん中が明るく両端へ消える）。上から・真下から見ると板の縁しか見えないので、穴を白く覆わない。
    // 前は円筒にしていて、白い幕の筒に見え、地上から覗くと穴の中が白くかすんでいた（2026-11-22 に撮って直した）
    {
      const COLS = 12, ROWS = 8, bp = [], bc = [], bi = [];
      const yTop = SK.ceil + 1.2, yBot = SK.surface + 0.05;
      for (let j = 0; j <= ROWS; j++) {
        const t = j / ROWS, y = yTop + (yBot - yTop) * t, half = SK.r * 0.85 + (SK.low * 1.0 - SK.r * 0.85) * t;
        // 上の端と下の端は消える。上の方ほど濃い
        const kv = smooth(0, 0.2, t) * (1 - smooth(0.6, 1, t)) * (1 - 0.4 * t);
        for (let i = 0; i <= COLS; i++) {
          const u = i / COLS, across = Math.pow(Math.sin(Math.PI * u), 1.6);   // 真ん中が明るく、両端で 0
          const streak = 0.55 + 0.45 * fbm(u * 6 + 11, t * 0.6, seed + 159);
          bp.push((u - 0.5) * 2 * half, y, 0);
          const v = kv * across * streak;
          bc.push(v, v * 0.95, v * 0.8, 1);
        }
      }
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) { const a = j * (COLS + 1) + i, b = a + 1, c = a + COLS + 1, d = c + 1; bi.push(a, b, c, b, d, c); }
      beamMat = new pc.StandardMaterial();
      beamMat.useLighting = false; beamMat.useSkybox = false; beamMat.useFog = false;
      beamMat.diffuse = new pc.Color(0, 0, 0);
      beamMat.emissive = new pc.Color(1, 1, 1); beamMat.emissiveVertexColor = true; beamMat.emissiveIntensity = 0.1;
      beamMat.blendType = pc.BLEND_ADDITIVE; beamMat.depthWrite = false; beamMat.cull = pc.CULLFACE_NONE;
      beamMat.update();
      const nrm = [];
      for (let i = 0; i < bp.length; i += 3) nrm.push(0, 0, 1);
      beamEnt = new pc.Entity('sky-beam');
      beamEnt.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, { positions: bp, normals: nrm, colors: bc, indices: bi }), beamMat)], castShadows: false, receiveShadows: false });
      beamEnt.setPosition(SK.x, 0, SK.z);
      beamEnt.enabled = false;
      app.root.addChild(beamEnt);
      skyParts.push(beamEnt);
      skyTris += bi.length / 3;
      // 池の水面の、光が当たって光る所（穴の真下。足し合わせて光る丸。真ん中が明るく、ふちへ消える）：暗い池が黒い穴に見えないように
      const N = 32, gp = [SK.x, SK.surface + 0.03, SK.z], gc = [1, 0.97, 0.88, 1], gi = [], gn = [0, 1, 0];
      for (const [ring, v] of [[0.55, 0.45], [1, 0]]) for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2, w = skyWarp(a) * SK.r * 1.05 * ring;
        gp.push(SK.x + Math.cos(a) * w, SK.surface + 0.03, SK.z + Math.sin(a) * w); gc.push(v, v * 0.97, v * 0.88, 1); gn.push(0, 1, 0);
      }
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        gi.push(0, 1 + j, 1 + i, 1 + i, 1 + j, 1 + N + j, 1 + i, 1 + N + j, 1 + N + i);
      }
      glintMat = beamMat.clone();
      glintMat.update();
      const glint = new pc.Entity('sky-glint');
      glint.addComponent('render', { meshInstances: [new pc.MeshInstance(createMesh(device, { positions: gp, normals: gn, colors: gc, indices: gi }), glintMat)], castShadows: false, receiveShadows: false });
      glint.enabled = false;
      app.root.addChild(glint);
      skyParts.push(glint);
      skyTris += gi.length / 3;
    }
  }
  tris += skyTris;
  sceneBudget.triangles += tris + patchTris;

  // ---- 歩く・ぶつかる ----
  floors.setUnder((x, z, y) => C.layer(x, z, y));
  obstacles.addField({ resolve: (p, radius) => C.resolve(p, radius) });

  let shown = -1, timer = 0;
  return {
    triangles: tris + patchTris, shellTriangles: tris, patchTriangles: patchTris, footprints, chunks,
    /**
     * 毎フレーム：近くの殻だけ描く。地上にいて口から遠いときは、どれも描かない
     * @param {{x: number, z: number}} cam カメラの位置、inside：洞窟の中にいる度合い（0〜1）、day：昼の明るさ（0〜1。天坑の光の筋の濃さ）
     */
    update(dt, cam, inside, day = 1) {
      // 天坑の光の幕は、いつもカメラの方を向ける（縦の軸のまわりだけ回す）
      if (beamEnt?.enabled) beamEnt.setEulerAngles(0, (Math.atan2(cam.x - SK.x, cam.z - SK.z) * 180) / Math.PI, 0);
      timer -= dt;
      if (timer > 0) return;
      timer = 0.25;
      // 光の幕は、カメラが大空洞の天井より上（縦穴の中・地上）にあるときは消す（上から見ると、池の上に光の帯が横たわって見えるため）
      // 夕方・夜はほとんど消える（昼の明るさの 2 乗）
      const beam = (0.006 + 0.1 * day * day) * (1 - smooth(SK.ceil - 2.5, SK.ceil + 1, cam.y ?? -99));
      if (beamMat && Math.abs(beamMat.emissiveIntensity - beam) > 0.004) { beamMat.emissiveIntensity = beam; beamMat.update(); }
      const glint = 0.012 + 0.14 * day * day;
      if (glintMat && Math.abs(glintMat.emissiveIntensity - glint) > 0.004) { glintMat.emissiveIntensity = glint; glintMat.update(); }
      let near = inside > 0.05;
      if (!near) for (const m of C.mouths) if (Math.hypot(cam.x - m.x, cam.z - m.z) < MOUTH_NEAR) { near = true; break; }
      // 天坑：地上で穴の近くにいれば、穴から下の大空洞が見えるので描く
      const nearSky = Math.hypot(cam.x - SK.x, cam.z - SK.z) < (inside > 0.05 ? SHOW : MOUTH_NEAR);
      if (nearSky) near = true;
      if (KR && Math.hypot(cam.x - KR.x, cam.z - KR.z) < 30) near = true;   // 教会の中：隠し扉の縦穴から下の間が見える
      for (const e of skyParts) if (e.enabled !== nearSky) e.enabled = nearSky;
      let n = 0;
      for (const c of chunks) {
        const on = near && Math.hypot(cam.x - c.x, cam.z - c.z) < SHOW;
        if (c.ent.enabled !== on) c.ent.enabled = on;
        if (on) n++;
      }
      shown = n;
    },
    get shown() { return shown; },
  };
}
