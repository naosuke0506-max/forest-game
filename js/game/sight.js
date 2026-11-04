// 視線をさえぎる物（計算だけ。PlayCanvas に依存しない）。bot の「目」（game/senses.js）が使う。
//   物の形：向きを自由に決めた箱（家の壁・床・屋根・家具・柵の横木・樽など）、縦の円柱（木の幹・岩・柵の杭・井戸）、三角（妻壁）
//   地面の起伏（丘の向こうは見えない）と、大草原の背の高い草（低い所を 2m 以上通ると見えない）もさえぎる
//   格子（8m）に入れておき、線分が通る升だけを調べる。家は外側の箱で先にふるい、当たりそうなときだけ中の物を調べる
const CELL = 8;
const EPS = 1e-4;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * @param {(x: number, z: number) => number} heightAt 地面の高さ
 * @param {{ grassAt?: (x: number, z: number) => number }} [opt] grassAt：その場所の背の高い草の高さ（m。無ければ 0）
 */
export function createSight(heightAt, { grassAt = null } = {}) {
  const grid = new Map();
  const key = (gx, gz) => gx * 73856093 ^ gz * 19349663;
  let stamp = 0;
  let count = 0;
  let group = null;   // 今まとめている家（addGroup〜endGroup の間に足した物は、その家の中に入る）

  function insert(o, minx, minz, maxx, maxz) {
    o.stamp = 0;
    count++;
    if (group) { group.items.push(o); return; }
    for (let gx = Math.floor(minx / CELL); gx <= Math.floor(maxx / CELL); gx++) {
      for (let gz = Math.floor(minz / CELL); gz <= Math.floor(maxz / CELL); gz++) {
        const k = key(gx, gz);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(o);
      }
    }
  }

  /** 箱：中心 c、軸 a・b・n（互いに直角の単位ベクトル）、大きさ la・lb・ln（全体の長さ） */
  function addBox(c, a, b, n, la, lb, ln) {
    const h = [la / 2, lb / 2, ln / 2];
    const ex = Math.abs(a[0]) * h[0] + Math.abs(b[0]) * h[1] + Math.abs(n[0]) * h[2];
    const ez = Math.abs(a[2]) * h[0] + Math.abs(b[2]) * h[1] + Math.abs(n[2]) * h[2];
    const o = { t: 0, c, ax: [a, b, n], h };
    insert(o, c[0] - ex, c[2] - ez, c[0] + ex, c[2] + ez);
    return o;
  }
  /** 横に回すだけの箱（world/build-kit.js の box と同じ決め方：中心 cx・cz、底 y0、幅 w・奥行き d・高さ h、向き yaw 度） */
  function addYawBox(cx, y0, cz, w, d, h, yawDeg) {
    const r = (yawDeg * Math.PI) / 180;
    return addBox([cx, y0 + h / 2, cz], [Math.cos(r), 0, -Math.sin(r)], [0, 1, 0], [Math.sin(r), 0, Math.cos(r)], w, h, d);
  }
  /** 縦の円柱（木の幹・岩・杭）：y0 から y1 まで */
  function addCyl(x, z, r, y0, y1) {
    const o = { t: 1, x, z, r, y0, y1 };
    insert(o, x - r, z - r, x + r, z + r);
    return o;
  }
  /** 三角（妻壁） */
  function addTri(p0, p1, p2) {
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const o = { t: 2, p0, e1, e2 };
    insert(o, Math.min(p0[0], p1[0], p2[0]), Math.min(p0[2], p1[2], p2[2]), Math.max(p0[0], p1[0], p2[0]), Math.max(p0[2], p1[2], p2[2]));
    return o;
  }
  /**
   * 家などのまとまりを始める：外側の箱（bounds：addBox と同じ引数）に当たったときだけ、中の物を調べる
   * endGroup までに足した物が中に入る
   */
  function beginGroup(c, a, b, n, la, lb, ln) {
    const h = [la / 2, lb / 2, ln / 2];
    const ex = Math.abs(a[0]) * h[0] + Math.abs(b[0]) * h[1] + Math.abs(n[0]) * h[2];
    const ez = Math.abs(a[2]) * h[0] + Math.abs(b[2]) * h[1] + Math.abs(n[2]) * h[2];
    const g = { t: 3, c, ax: [a, b, n], h, items: [] };
    insert(g, c[0] - ex, c[2] - ez, c[0] + ex, c[2] + ez);
    group = g;
  }
  function endGroup() { group = null; }

  // ---- 線分（p から p + d の t = 0〜1）と物 ----
  function hitBox(o, p, d) {
    let t0 = 0, t1 = 1;
    const rx = p[0] - o.c[0], ry = p[1] - o.c[1], rz = p[2] - o.c[2];
    for (let k = 0; k < 3; k++) {
      const a = o.ax[k], h = o.h[k];
      const lp = rx * a[0] + ry * a[1] + rz * a[2], ld = d[0] * a[0] + d[1] * a[1] + d[2] * a[2];
      if (Math.abs(ld) < 1e-9) { if (lp < -h || lp > h) return false; continue; }
      let u0 = (-h - lp) / ld, u1 = (h - lp) / ld;
      if (u0 > u1) { const s = u0; u0 = u1; u1 = s; }
      if (u0 > t0) t0 = u0;
      if (u1 < t1) t1 = u1;
      if (t0 > t1) return false;
    }
    return t1 > EPS && t0 < 1 - EPS;
  }
  function hitCyl(o, p, d) {
    const fx = p[0] - o.x, fz = p[2] - o.z;
    const A = d[0] * d[0] + d[2] * d[2], Bq = 2 * (fx * d[0] + fz * d[2]), C = fx * fx + fz * fz - o.r * o.r;
    let t0, t1;
    if (A < 1e-9) { if (C > 0) return false; t0 = 0; t1 = 1; }
    else {
      const disc = Bq * Bq - 4 * A * C;
      if (disc < 0) return false;
      const s = Math.sqrt(disc);
      t0 = Math.max(0, (-Bq - s) / (2 * A)); t1 = Math.min(1, (-Bq + s) / (2 * A));
      if (t0 > t1) return false;
    }
    // その間の高さが円柱の高さに重なるか
    const ya = p[1] + d[1] * t0, yb = p[1] + d[1] * t1;
    return Math.max(ya, yb) >= o.y0 && Math.min(ya, yb) <= o.y1 && t1 > EPS && t0 < 1 - EPS;
  }
  function hitTri(o, p, d) {
    const e1 = o.e1, e2 = o.e2;
    const px = d[1] * e2[2] - d[2] * e2[1], py = d[2] * e2[0] - d[0] * e2[2], pz = d[0] * e2[1] - d[1] * e2[0];
    const det = e1[0] * px + e1[1] * py + e1[2] * pz;
    if (Math.abs(det) < 1e-9) return false;
    const inv = 1 / det;
    const sx = p[0] - o.p0[0], sy = p[1] - o.p0[1], sz = p[2] - o.p0[2];
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) return false;
    const qx = sy * e1[2] - sz * e1[1], qy = sz * e1[0] - sx * e1[2], qz = sx * e1[1] - sy * e1[0];
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) return false;
    const t = (e2[0] * qx + e2[1] * qy + e2[2] * qz) * inv;
    return t > EPS && t < 1 - EPS;
  }
  function hit(o, p, d) {
    if (o.stamp === stamp) return false;
    o.stamp = stamp;
    if (o.t === 0) return hitBox(o, p, d);
    if (o.t === 1) return hitCyl(o, p, d);
    if (o.t === 2) return hitTri(o, p, d);
    // 家：外側の箱に当たれば、中の物
    if (!hitBox(o, p, d)) return false;
    for (const it of o.items) if (hit(it, p, d)) return true;
    return false;
  }

  /** 地面と背の高い草：線分に沿って少しずつ確かめる（両端の近くは除く。立っている足もとが地面に触れるため） */
  function groundBlocks(p, d, len) {
    const n = Math.max(2, Math.ceil(len / 1.2));
    let grass = 0;
    const gstep = len / n;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = p[0] + d[0] * t, y = p[1] + d[1] * t, z = p[2] + d[2] * t;
      const g = heightAt(x, z);
      if (y < g - 0.05) return true;
      if (grassAt && y - g < 1.7) {
        const gh = grassAt(x, z);
        if (gh > 0 && y - g < gh) { grass += gstep; if (grass > 2.0) return true; }
      }
    }
    return false;
  }

  /** p から q が見通せないか（何かに当たれば true） */
  function blocked(p, q) {
    const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 0.05) return false;
    stamp++;
    // 升を順にたどる（線分が通る升だけ）
    let gx = Math.floor(p[0] / CELL), gz = Math.floor(p[2] / CELL);
    const ex = Math.floor(q[0] / CELL), ez = Math.floor(q[2] / CELL);
    const sx = Math.sign(d[0]), sz = Math.sign(d[2]);
    const tdx = sx ? Math.abs(CELL / d[0]) : Infinity, tdz = sz ? Math.abs(CELL / d[2]) : Infinity;
    let tmx = sx ? ((sx > 0 ? (gx + 1) * CELL : gx * CELL) - p[0]) / d[0] : Infinity;
    let tmz = sz ? ((sz > 0 ? (gz + 1) * CELL : gz * CELL) - p[2]) / d[2] : Infinity;
    for (let guard = 0; guard < 64; guard++) {
      const list = grid.get(key(gx, gz));
      if (list) for (const o of list) if (hit(o, p, d)) return true;
      if (gx === ex && gz === ez) break;
      if (tmx < tmz) { if (tmx > 1) break; gx += sx; tmx += tdx; }
      else { if (tmz > 1) break; gz += sz; tmz += tdz; }
    }
    return groundBlocks(p, d, len);
  }

  return { addBox, addYawBox, addCyl, addTri, beginGroup, endGroup, blocked, get count() { return count; } };
}
