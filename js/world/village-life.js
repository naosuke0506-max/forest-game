// 現代の村の暮らしの物を置く（② 村の暮らしの物。2026-11-21。利用者の指示：マップは全部現代。森はヨーロッパの山村の「人が消えた直後」）
//   家のまわり：ごみ箱・ごみ袋・植木箱（扉の前）・室外機・ガス瓶（壁ぎわ）・木の食卓と椅子・古いタイヤ・携行缶（裏や横）・
//              家の横に止めた車（小さい車・ワゴン・荷台のある車。たまに覆いを掛けた車）・壁に立てかけた自転車
//   村の道ばた：路肩に止めた車。野邑の畑：トラクター
//   ここでは「人が消えた」演出（ドアの開いた車・道の真ん中で止まった車など）はまだしない（③ 家の中と人が消えた演出で足す）
// 置く場所を決め、当たり判定と bot の目をさえぎる箱を登録する。形は world/village-items.js が描く。
// 前からある家の並び・樽などの置き方を変えないよう、別の乱数を使う。PlayCanvas に依存しない（計算だけ）
import { createRandom } from '../core/random.js';
import { frame } from './build-kit.js';

/**
 * 小物の大きさ（village.json から。r：当たり判定の円の半径・h：高さ・lift：底を地面に合わせる持ち上げ・box：[幅, 奥行き]・shadow：影を落とす）
 * 模型の前は +Z
 */
export const PROP_INFO = {
  metal_trash_can: { r: 0.34, h: 0.91, shadow: true },
  trashbag: { r: 0.24, h: 0.57 },
  exterior_aircon_unit: { r: 0.36, h: 0.92, lift: 0.319, box: [0.8, 0.38], shadow: true },
  propane_tank: { r: 0.17, h: 0.55 },
  wooden_picnic_table: { r: 1.1, h: 0.74, box: [2.24, 3.02], shadow: true },
  plastic_monobloc_chair_01: { r: 0.3, h: 0.88 },
  planter_box_01: { r: 0.22, h: 0.43, box: [0.91, 0.41] },
  old_tyre: { r: 0.3, h: 0.6, lift: 0.3, flatLift: 0.083 },
  metal_jerrycan: { r: 0.15, h: 0.45 },
  covered_car: { r: 0.9, h: 1.41, box: [1.79, 4.34], shadow: true },
  // 家の中（③ 2026-11-21。inside：家の中の物。近くだけ描き、影は落とさない。置く場所は world/furniture.js）
  electric_stove: { r: 0.3, h: 0.86, inside: true },
  wall_clock: { r: 0.16, h: 0.32, inside: true },
  hanging_picture_frame_02: { r: 0.38, h: 0.5, inside: true },
  fancy_picture_frame_01: { r: 0.3, h: 0.46, inside: true },
  painted_wooden_chair_01: { r: 0.25, h: 0.96, inside: true },
  mid_century_lounge_chair: { r: 0.55, h: 1.17, inside: true },
  modern_ceiling_lamp_01: { r: 0.22, h: 0.95, inside: true },
  food_apple_01: { r: 0.05, h: 0.08, inside: true },
  croissant: { r: 0.1, h: 0.06, inside: true },
  jug_01: { r: 0.14, h: 0.21, inside: true },
  ceramic_vase_01: { r: 0.1, h: 0.4, inside: true },
};
/** 乗り物の大きさ（tools/make_vehicles.py の三角形と大きさ）。前は +Z */
export const VEHICLE_INFO = {
  car_small: { box: [1.94, 3.95], h: 1.48 },
  car_wagon: { box: [1.94, 4.68], h: 1.52 },
  pickup: { box: [2.09, 5.31], h: 1.65 },
  tractor: { box: [2.19, 3.64], h: 2.71 },
  bicycle: { box: [0.54, 1.79], h: 1.05 },
  fuel_pump: { box: [0.98, 0.5], h: 1.93 },
};
/** 車の色（sRGB。ヨーロッパの村に多い、白・銀・灰・黒・紺・赤・深緑・ベージュ・水色） */
export const CAR_COLORS = [
  [0.86, 0.86, 0.84], [0.86, 0.86, 0.84], [0.62, 0.63, 0.65], [0.62, 0.63, 0.65], [0.28, 0.29, 0.31], [0.05, 0.05, 0.06],
  [0.08, 0.13, 0.3], [0.55, 0.06, 0.05], [0.1, 0.24, 0.15], [0.66, 0.6, 0.47], [0.4, 0.55, 0.66],
];
const TRACTOR_COLORS = [[0.18, 0.42, 0.14], [0.62, 0.08, 0.05], [0.1, 0.26, 0.56]];
const BIKE_COLORS = [[0.1, 0.1, 0.11], [0.55, 0.06, 0.05], [0.1, 0.22, 0.45], [0.8, 0.8, 0.78], [0.15, 0.35, 0.18]];

/** 家（向きのある長方形）の外からの距離（中なら 0） */
function rectDist(h, x, z) {
  const a = (h.yaw * Math.PI) / 180, dx = x - h.x, dz = z - h.z;
  const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
  const ox = Math.max(0, Math.abs(lx) - h.w / 2), oz = Math.max(0, Math.abs(lz) - h.d / 2);
  return Math.hypot(ox, oz);
}

/**
 * @param {object} ctx
 *   plan（world/villages.js）・terrain・land・obstacles・sight・items（village-items.js）・solid(x, z, r)・seed
 *   used：家ごとに、前からある小物が使った所 { front: 扉のどちら側（-1/1/0）, side: 薪の山の側（-1/1/0） }
 *   avoid：ほかに避ける長方形（教会・ガソリンスタンド。{ x, z, w, d, yaw }）
 */
export function placeVillageLife(ctx) {
  const { plan, terrain, land, obstacles, sight, items, solid, seed, used = [], avoid = [] } = ctx;
  const rnd = createRandom(seed + 337);
  const pick = (arr) => arr[Math.floor(rnd.next() * arr.length) % arr.length];
  const H = (x, z) => terrain.heightAt(x, z);
  const houses = plan.houses;
  const counts = {};
  const count = (id) => { counts[id] = (counts[id] || 0) + 1; };
  const dry = (x, z) => !land || land.wet(x, z) <= 0.01;
  /** 家・教会などの長方形から pad m 以上離れているか（自分の家は ownPad） */
  const clearOfBuildings = (x, z, pad, own = null, ownPad = pad) =>
    houses.every((h) => rectDist(h, x, z) >= (h === own ? ownPad : pad)) && avoid.every((b) => rectDist(b, x, z) >= pad);

  /** 小物を 1 つ置けるか確かめて置く（lx, lz：家の中の座標。yaw：家の向きからの角度） */
  function putProp(h, F, id, lx, lz, yawLocal, opts = {}) {
    const info = PROP_INFO[id];
    const [x, , z] = F.at(lx, 0, lz);
    const r = info.r;
    if (!dry(x, z) || plan.pathAt(x, z) > 0.35) return false;
    if (!clearOfBuildings(x, z, r + 0.4, h, r + 0.17)) return false;
    if (!obstacles.isFree(x, z, r, true)) return false;
    // 坂の上には置かない（片側が浮く）
    const y = H(x, z);
    if (Math.abs(H(x + r, z) - y) > 0.18 || Math.abs(H(x, z + r) - y) > 0.18) return false;
    items.prop(id, x, y - 0.015, z, h.yaw + yawLocal, opts);
    if (!opts.noSolid) solid(x, z, opts.solidR ?? r);
    if (opts.blockSight) sight?.addCyl(x, z, r * 0.9, y, y + info.h);
    count(id);
    return true;
  }
  /** 長い物（車・食卓）：真ん中の線に沿って当たり判定の円を並べる */
  function solidRect(x, z, w, d, yaw) {
    const a = (yaw * Math.PI) / 180, fx = Math.sin(a), fz = Math.cos(a);
    const r = (w / 2) * 0.95, L = Math.max(0, d / 2 - r);
    const n = Math.max(1, Math.ceil((2 * L) / (r * 0.8)));
    for (let i = 0; i <= n; i++) { const t = -L + (2 * L * i) / n; solid(x + fx * t, z + fz * t, r); }
  }
  /**
   * 車などを地面に合わせて置ける形を調べる：四隅の地面の高さから、高さ・前後の傾き・横の傾きを決める。置けなければ null
   */
  function fitGround(x, z, w, d, yaw, { tilt = 0.9, road = 0.7, own = null } = {}) {
    const F = frame(x, 0, z, yaw);
    const pts = [[0, 0], [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, d / 2], [0, -d / 2]].map(([u, v]) => F.at(u, 0, v));
    for (const p of pts) {
      if (!dry(p[0], p[2]) || plan.pathAt(p[0], p[2]) > road) return null;
      if (!clearOfBuildings(p[0], p[2], 0.45, own, 0.3)) return null;
    }
    const r = w / 2;
    for (let t = -(d / 2 - r); t <= d / 2 - r + 0.01; t += r) { const p = F.at(0, 0, t); if (!obstacles.isFree(p[0], p[2], r, true)) return null; }
    const hAt = (uu, vv) => { const p = F.at(uu, 0, vv); return H(p[0], p[2]); };
    const fl = hAt(-w / 2, d / 2), fr = hAt(w / 2, d / 2), bl = hAt(-w / 2, -d / 2), br = hAt(w / 2, -d / 2);
    const hf = (fl + fr) / 2, hb = (bl + br) / 2, hl = (fl + bl) / 2, hr = (fr + br) / 2;
    if (Math.abs(hf - hb) > tilt || Math.abs(hl - hr) > tilt * 0.4) return null;   // 横の傾きは前後より小さく（横に傾いた車は不自然に見える）
    const pitch = (Math.atan2(hb - hf, d) * 180) / Math.PI;
    const roll = (Math.atan2(hr - hl, w) * 180) / Math.PI;
    return { y: (hf + hb + hl + hr) / 4 - 0.03, pitch, roll };
  }
  /** 車を置く（id が covered_car なら覆いを掛けた車の小物） */
  function putCar(id, x, z, yaw, group, opt) {
    const isCover = id === 'covered_car';
    const info = isCover ? PROP_INFO.covered_car : VEHICLE_INFO[id];
    const [w, d] = info.box;
    const g = fitGround(x, z, w, d, yaw, opt);
    if (!g) return false;
    if (isCover) items.prop(id, x, g.y, z, yaw, { pitch: g.pitch, roll: g.roll });
    else items.vehicle(id, x, g.y, z, yaw, id === 'tractor' ? pick(TRACTOR_COLORS) : pick(CAR_COLORS), group, { pitch: g.pitch, roll: g.roll });
    solidRect(x, z, w, d, yaw);
    sight?.addYawBox(x, g.y, z, w * 0.95, d * 0.95, info.h * 0.85, yaw);
    count(id);
    return true;
  }

  // ---- 1. 家のまわり ----
  const DOOR = 0.75;   // 扉口の半分と、前の段の分（ここは空ける）
  houses.forEach((h, i) => {
    const u = used[i] || {};
    const F = frame(h.x, 0, h.z, h.yaw);
    const W = h.w / 2, D = h.d / 2;
    const fs = u.front ? -u.front : rnd.next() < 0.5 ? -1 : 1;   // 扉の横の空いている側
    // ごみ箱（扉の横の角）とごみ袋
    if (rnd.next() < 0.7) {
      const lx = fs * (W - 0.45);
      if (putProp(h, F, 'metal_trash_can', lx, D + 0.55, (rnd.next() - 0.5) * 30)) {
        if (rnd.next() < 0.3) putProp(h, F, 'metal_trash_can', lx - fs * 0.75, D + 0.55, (rnd.next() - 0.5) * 30);
        if (rnd.next() < 0.4) putProp(h, F, 'trashbag', lx + fs * 0.1, D + 1.15, rnd.next() * 360, { solidR: 0.2 });
      }
    }
    // 植木箱（前の窓の下か、扉の横）
    if (rnd.next() < 0.4) {
      const lx = h.w >= 6.4 ? h.w * 0.3 : -fs * (DOOR + 0.55);
      putProp(h, F, 'planter_box_01', lx, D + 0.42, 0, { solidR: 0.24 });
    }
    // 自転車：横の壁に立てかける（壁へ少し傾ける）
    const carSide = u.side ? -u.side : rnd.next() < 0.5 ? -1 : 1;
    if (rnd.next() < 0.22) {
      const back = rnd.next() < 0.5;
      // 車を止めない側から試す（薪の山がある側なら、もう一方へ）
      for (const bs of [-carSide, carSide]) {
        const [x, , z] = F.at(bs * (W + 0.62), 0, D - 1.25);
        // 壁の当たり判定（壁の中ほどに並んだ円）に掛からない所。前と後ろの端も見る
        const ends = [-0.75, 0.75].map((t) => F.at(bs * (W + 0.62), 0, D - 1.25 + t));
        if (!dry(x, z) || !obstacles.isFree(x, z, 0.3, true) || !ends.every((p) => obstacles.isFree(p[0], p[2], 0.25, true)) || !clearOfBuildings(x, z, 0.6, h, 0.3)) continue;
        const yaw = h.yaw + (back ? 180 : 0);
        items.vehicle('bicycle', x, H(x, z) - 0.02, z, yaw, pick(BIKE_COLORS), h.village || 'road', { roll: bs * (back ? -1 : 1) * 11 });
        for (const t of [-0.55, 0, 0.55]) { const p = F.at(bs * (W + 0.62), 0, D - 1.25 + t); solid(p[0], p[2], 0.28); }
        count('bicycle');
        break;
      }
    }
    // 室外機（裏の壁ぎわ。前は外を向く）・ガス瓶
    if (rnd.next() < 0.4) {
      const lx = (rnd.next() < 0.5 ? -1 : 1) * (W - 0.9);
      putProp(h, F, 'exterior_aircon_unit', lx, -D - 0.42, 180, { solidR: 0.4 });
    }
    if (rnd.next() < 0.25) {
      const lx = (rnd.next() < 0.5 ? -1 : 1) * (W - 0.4), n = rnd.next() < 0.4 ? 2 : 1;
      for (let k = 0; k < n; k++) putProp(h, F, 'propane_tank', lx - Math.sign(lx) * k * 0.38, -D - 0.38, rnd.next() * 360);
    }
    // 裏庭：木の食卓と椅子、または椅子だけ
    const yard = rnd.next();
    if (yard < 0.16) {
      const lx = (rnd.next() - 0.5) * Math.max(0, h.w - 3.2);
      const [x, , z] = F.at(lx, 0, -D - 2.9);
      const yaw = h.yaw + 90 + (rnd.next() - 0.5) * 20;
      const g = fitGround(x, z, 2.24, 3.02, yaw, { tilt: 0.25, road: 0.3, own: h });
      if (g) {
        items.prop('wooden_picnic_table', x, g.y + 0.02, z, yaw, { pitch: g.pitch, roll: g.roll });
        solidRect(x, z, 2.0, 3.0, yaw);
        count('wooden_picnic_table');
      }
    } else if (yard < 0.4) {
      const lx = (rnd.next() < 0.5 ? -1 : 1) * (W - 0.6), n = rnd.next() < 0.5 ? 2 : 1;
      for (let k = 0; k < n; k++) putProp(h, F, 'plastic_monobloc_chair_01', lx - Math.sign(lx) * k * 0.85, -D - 1.1 - rnd.next() * 0.4, 160 + (rnd.next() - 0.5) * 60);
    }
    // 古いタイヤ（寝かせて重ねる・壁に立てかける）・携行缶
    if (rnd.next() < 0.2) {
      const lx = (rnd.next() < 0.5 ? -1 : 1) * (W - 0.5);
      const [x, , z] = F.at(lx, 0, -D - 0.55);
      if (dry(x, z) && obstacles.isFree(x, z, 0.32, true) && clearOfBuildings(x, z, 0.5, h, 0.4)) {
        const y = H(x, z) - 0.01, n = 1 + Math.floor(rnd.next() * 3);
        for (let k = 0; k < n; k++) items.prop('old_tyre', x + (rnd.next() - 0.5) * 0.06, y + k * 0.16, z + (rnd.next() - 0.5) * 0.06, rnd.next() * 360, { flat: true });
        solid(x, z, 0.32);
        count('old_tyre');
      }
    }
    if (rnd.next() < 0.15) putProp(h, F, 'metal_jerrycan', carSide * (W + 0.3), -D + 0.6 + rnd.next(), 90 * carSide);
    // 家の横に止めた車（前は道の方。たまに後ろ向き）。覆いを掛けた車もたまに
    if (rnd.next() < 0.5) {
      const r = rnd.next();
      const id = r < 0.1 ? 'covered_car' : r < 0.45 ? 'car_small' : r < 0.75 ? 'car_wagon' : 'pickup';
      const [w, d] = (id === 'covered_car' ? PROP_INFO.covered_car : VEHICLE_INFO[id]).box;
      const yaw = h.yaw + (rnd.next() < 0.25 ? 180 : 0) + (rnd.next() - 0.5) * 6;
      let ok = false;
      for (const side of [carSide, -carSide]) {
        for (const lz of [D + 0.4 - d / 2, D - d / 2 - 0.6, D + 1.4 - d / 2]) {
          const [x, , z] = F.at(side * (W + 0.45 + w / 2), 0, lz);
          if (putCar(id, x, z, yaw, h.village || 'road', { own: h })) { ok = true; break; }
        }
        if (ok) break;
      }
    }
  });

  // ---- 2. 村の道ばた：路肩に止めた車（1 つの村に 1〜3 台） ----
  const halfOf = (r) => (r.lane ? 1.6 : r.w >= 2 ? 2.2 : 2.0);
  for (const v of plan.villages) {
    const want = 1 + Math.floor(rnd.next() * 3);
    let n = 0;
    const cands = [];
    for (const r of plan.roads) {
      if (!r.paved) continue;
      if (r.lane && r.village !== v.id) continue;
      for (let i = 3; i < r.pts.length - 3; i += 2) {
        const [px, pz] = r.pts[i];
        if (Math.hypot(px - v.x, pz - v.z) > v.r) continue;
        cands.push({ r, i, k: rnd.next() });
      }
    }
    cands.sort((a, b) => a.k - b.k);
    for (const c of cands) {
      if (n >= want) break;
      const [ax, az] = c.r.pts[c.i - 1], [bx, bz] = c.r.pts[c.i + 1];
      const L = Math.hypot(bx - ax, bz - az) || 1, tx = (bx - ax) / L, tz = (bz - az) / L;
      // 曲がっている所は避ける
      const [cx0, cz0] = c.r.pts[c.i - 3], [cx1, cz1] = c.r.pts[c.i + 3];
      const L2 = Math.hypot(cx1 - cx0, cz1 - cz0);
      if (Math.abs(((cx1 - cx0) * tx + (cz1 - cz0) * tz) / L2) < 0.97) continue;
      // 分かれ道の近くは避ける（ほかの道の点が近い）
      const [px, pz] = c.r.pts[c.i];
      if (plan.roads.some((o) => o !== c.r && o.pts.some((p) => Math.hypot(p[0] - px, p[1] - pz) < 9))) continue;
      if (plan.bridges.some((b) => Math.hypot((b.ax + b.bx) / 2 - px, (b.az + b.bz) / 2 - pz) < 30)) continue;
      const side = rnd.next() < 0.5 ? -1 : 1, nx = -tz * side, nz = tx * side;
      const r = rnd.next(), id = r < 0.4 ? 'car_small' : r < 0.75 ? 'car_wagon' : 'pickup';
      const w = VEHICLE_INFO[id].box[0], off = halfOf(c.r) - 0.45 + w / 2;
      // 右側通行：道の右の路肩に、進む向きに止める
      const yaw = (Math.atan2(tx * -side, tz * -side) * 180) / Math.PI;
      if (putCar(id, px + nx * off, pz + nz * off, yaw, v.id, { road: 2, tilt: 0.7 })) n++;
    }
  }

  // ---- 3. 野邑の畑：トラクター（入り口の内側）と携行缶 ----
  for (const f of plan.fields || []) {
    if (counts.tractor >= 2 || (rnd.next() < 0.35 && counts.tractor)) continue;   // トラクターは多くて 2 台
    const a = (f.yaw * Math.PI) / 180, R = [Math.cos(a), -Math.sin(a)], Fw = [Math.sin(a), Math.cos(a)];
    const at = (uu, vv) => [f.x + R[0] * uu + Fw[0] * vv, f.z + R[1] * uu + Fw[1] * vv];
    for (const [uu, vv, turn] of [[3.5, -f.d / 2 + 3.2, 20], [-4, -f.d / 2 + 3.4, -15], [0, 0, 70]]) {
      const [x, z] = at(uu, vv);
      if (putCar('tractor', x, z, f.yaw + turn, 'field', { road: 0.4, tilt: 0.8 })) {
        const [jx, jz] = at(uu + 1.9, vv - 1.0);
        if (dry(jx, jz) && obstacles.isFree(jx, jz, 0.18, true)) { items.prop('metal_jerrycan', jx, H(jx, jz) - 0.01, jz, f.yaw + 40); solid(jx, jz, 0.16); count('metal_jerrycan'); }
        break;
      }
    }
  }
  return counts;
}
