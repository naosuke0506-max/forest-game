// 家具（家の中の座標で置く）：ベッド・タンス・机と腰掛け・長持（箱）・棚・袋・暖炉と煙突。
//   ぶつかる範囲はその階の高さだけ（world/obstacles.js の高さの範囲）。
//   ベッドの下とタンスの中は隠れ場所（game/hiding.js）として記録する
// 家の中の座標：x は横（右が +）、z は奥行き（前＝扉の側が +）、y は高さ
import { box } from './build-kit.js';

/** 家具（家の中の座標で置く）。ぶつかる範囲はその階の高さだけ */
export class Furniture {
  constructor(B, F, y0, yaw, reg, range, routes) { Object.assign(this, { B, F, y0, yaw, reg, range, routes }); }
  /** 視線をさえぎる箱（家の中の座標。bot の目。game/sight.js） */
  block(x, y, z, w, d, h, rot) { this.reg.block?.(x, y, z, w, d, h, rot); }
  bx(surf, x, y, z, w, d, h, rot, opt = {}) {
    const p = this.F.at(x, 0, z);
    box(this.B, surf, p[0], this.y0 + y, p[2], w, d, h, this.yaw + rot, opt);
  }
  /** 家具の中の座標（向き rot で回した）→ 家の中の座標 */
  local(x, z, dx, dz, rot) {
    const a = (rot * Math.PI) / 180;
    return [x + Math.cos(a) * dx + Math.sin(a) * dz, z - Math.sin(a) * dx + Math.cos(a) * dz];
  }
  solid(x, z, r, floorY) {
    const p = this.F.at(x, 0, z);
    this.reg.solid(p[0], p[2], r, { y0: this.y0 + floorY - 0.6, y1: this.y0 + floorY + 0.7 });
  }
  /**
   * 隠れ場所を記録する（game/hiding.js が使う）
   *   x, z：隠れている人の位置、y：床の高さ、yaw：外を覗く向き（家の座標の向きの約束：0 で +z）
   *   eye：覗く目の位置（eyeX, eyeZ と床からの高さ eyeH）、out：出たときに立つ位置、route：外からの道順
   */
  hide(kind, x, z, floorY, lookRot, { eyeAhead, eyeH, outAhead }) {
    const a = (lookRot * Math.PI) / 180, dx = Math.sin(a), dz = Math.cos(a);
    const p = this.F.at(x, 0, z), e = this.F.at(x + dx * eyeAhead, 0, z + dz * eyeAhead), o = this.F.at(x + dx * outAhead, 0, z + dz * outAhead);
    this.reg.hides.push({
      kind, x: p[0], z: p[2], y: this.y0 + floorY, yaw: this.yaw + lookRot,
      eyeX: e[0], eyeZ: e[2], eyeH, outX: o[0], outZ: o[2],
      route: this.routes[floorY > 2 ? 1 : 0],
    });
  }
  /** ベッド：長さ 2m・幅 1m。頭は rot の向きの後ろ。下に 0.3m の隙間（潜って隠れる） */
  bed(x, z, y, rot, rnd) {
    const L = 2.0, Wd = 1.0;
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [px, pz] = P(sx * (Wd / 2 - 0.05), sz * (L / 2 - 0.05)); this.bx('wood', px, y, pz, 0.09, 0.09, 0.45, rot); }
    { const [px, pz] = P(0, 0); this.bx('wood', px, y + 0.3, pz, Wd, L, 0.12, rot); this.block(px, y + 0.3, pz, Wd, L, 0.33, rot); }   // 枠（と布団の分の高さ）
    { const [px, pz] = P(0, -L / 2 + 0.03); this.bx('wood', px, y, pz, Wd + 0.06, 0.08, 1.05, rot); this.block(px, y, pz, Wd + 0.06, 0.08, 1.05, rot); }      // 頭板
    { const [px, pz] = P(0, L / 2 - 0.03); this.bx('wood', px, y, pz, Wd + 0.06, 0.08, 0.62, rot); }       // 足板
    { const [px, pz] = P(0, 0.02); this.bx('cloth', px, y + 0.42, pz, Wd - 0.08, L - 0.12, 0.16, rot, { shade: [0.86, 0.8, 0.66] }); }  // 敷布団
    const blanket = [[0.55, 0.16, 0.12], [0.2, 0.32, 0.5], [0.3, 0.42, 0.22], [0.52, 0.4, 0.22]][Math.floor(rnd.next() * 4)];
    { const [px, pz] = P(0, 0.3); this.bx('cloth', px, y + 0.57, pz, Wd - 0.02, L * 0.6, 0.05, rot, { shade: blanket }); }  // 毛布
    { const [px, pz] = P(0, -L / 2 + 0.32); this.bx('cloth', px, y + 0.57, pz, Wd * 0.6, 0.35, 0.1, rot, { shade: [0.92, 0.9, 0.84] }); }  // 枕
    for (const dz of [-0.6, 0, 0.6]) { const [px, pz] = P(0, dz); this.solid(px, pz, 0.48, y); }
    // 下に潜って覗く向き：ベッドの横のうち、部屋の真ん中の側
    const side = Math.cos((rot * Math.PI) / 180) * -x + -Math.sin((rot * Math.PI) / 180) * -z >= 0 ? 1 : -1;
    { const [px, pz] = P(0, 0.1); this.hide('bed', px, pz, y, rot + side * 90, { eyeAhead: 0.4, eyeH: 0.2, outAhead: 1.05 }); }
  }
  /** タンス：幅 1.05・奥行き 0.55・高さ 1.95。扉は rot の向きの前（中に入って隠れる） */
  wardrobe(x, z, y, rot) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    { const [px, pz] = P(0, 0); this.bx('wood', px, y, pz, 1.05, 0.55, 1.95, rot, { shade: 0.72 }); this.block(px, y, pz, 1.05, 0.58, 2.03, rot); }
    { const [px, pz] = P(0, 0.01); this.bx('wood', px, y + 1.95, pz, 1.15, 0.62, 0.08, rot, { shade: 0.6 }); }   // 上の飾り
    for (const s of [-1, 1]) {
      const [px, pz] = P(s * 0.26, 0.285);
      this.bx('gate', px, y + 0.12, pz, 0.47, 0.03, 1.72, rot, { shade: 0.8 });   // 扉
      const [kx, kz] = P(s * 0.05, 0.31);
      this.bx('wood', kx, y + 0.95, kz, 0.04, 0.04, 0.12, rot, { shade: 0.35 });  // 取っ手
    }
    { const [px, pz] = P(0, 0); this.solid(px, pz, 0.5, y); }
    { const [px, pz] = P(0, 0.05); this.hide('wardrobe', px, pz, y, rot, { eyeAhead: 0.2, eyeH: 1.55, outAhead: 0.85 }); }
  }
  /** 机（1.4 × 0.8）と腰掛け 2 つ */
  table(x, z, y, rnd) {
    const rot = rnd.next() < 0.5 ? 0 : 90;
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    { const [px, pz] = P(0, 0); this.bx('wood', px, y + 0.72, pz, 1.4, 0.8, 0.06, rot); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [px, pz] = P(sx * 0.62, sz * 0.32); this.bx('wood', px, y, pz, 0.08, 0.08, 0.72, rot, { shade: 0.8 }); }
    for (const s of [-1, 1]) {
      const [px, pz] = P(s * 0.3, s * 0.68);
      this.bx('wood', px, y + 0.42, pz, 0.36, 0.36, 0.05, rot);
      for (const a of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [lx, lz] = P(s * 0.3 + a[0] * 0.13, s * 0.68 + a[1] * 0.13); this.bx('wood', lx, y, lz, 0.05, 0.05, 0.42, rot, { shade: 0.8 }); }
      this.solid(px, pz, 0.25, y);
    }
    for (const dx of [-0.4, 0.4]) { const [px, pz] = P(dx, 0); this.solid(px, pz, 0.45, y); }
  }
  /** 長持（ふた付きの箱） */
  chest(x, z, y, rot) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    { const [px, pz] = P(0, 0); this.bx('wood', px, y, pz, 0.95, 0.52, 0.5, rot, { shade: 0.85 }); this.block(px, y, pz, 0.95, 0.52, 0.56, rot); }
    { const [px, pz] = P(0, 0); this.bx('wood', px, y + 0.5, pz, 1.0, 0.56, 0.06, rot, { shade: 0.65 }); }
    for (const dx of [-0.3, 0.3]) { const [px, pz] = P(dx, 0); this.bx('stone', px, y + 0.02, pz, 0.06, 0.58, 0.52, rot, { shade: 0.35 }); }   // 鉄の帯
    { const [px, pz] = P(0, 0); this.solid(px, pz, 0.45, y); }
  }
  /** 棚（壁に付いた板 2 枚と、上の壺や袋） */
  shelf(x, z, y, rot) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    for (const dy of [0, 0.45]) { const [px, pz] = P(0, 0.12); this.bx('wood', px, y + dy, pz, 1.2, 0.26, 0.04, rot); }
    // 素焼きの壺（胴と口）
    for (const [dx, hh] of [[-0.35, 0.24], [0.05, 0.18], [0.4, 0.28]]) {
      const [px, pz] = P(dx, 0.12);
      this.bx('cloth', px, y + 0.04, pz, 0.17, 0.17, hh, rot + 45, { shade: [0.62, 0.36, 0.22] });
      this.bx('cloth', px, y + 0.04 + hh, pz, 0.1, 0.1, 0.05, rot + 45, { shade: [0.5, 0.29, 0.18] });
    }
  }
  /** 袋（穀物の袋）を 2〜3 個 */
  sacks(x, z, y, rnd) {
    const n = 2 + Math.floor(rnd.next() * 2);
    for (let i = 0; i < n; i++) {
      const dx = (i - (n - 1) / 2) * 0.42, h = 0.55 + rnd.next() * 0.15;
      this.bx('cloth', x + dx, y, z, 0.4, 0.36, h, rnd.next() * 30, { shade: [0.7, 0.6, 0.42] });
      this.bx('cloth', x + dx, y + h, z, 0.18, 0.16, 0.12, 0, { shade: [0.6, 0.5, 0.34] });
    }
    this.solid(x, z, 0.45, y);
    this.block(x, y, z, n * 0.42, 0.36, 0.6, 0);
  }
  /** 暖炉（石。中は暗い）と、屋根の上まで届く煙突。火を焚く口は rot の向きの前 */
  hearth(x, z, y, chimneyTop, rot = 0) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    this.bx('stone', x, y, z, 1.5, 0.62, 1.1, rot, { shade: 0.85 });
    this.block(x, y, z, 1.5, 0.62, 1.1, rot);
    { const [px, pz] = P(0, 0.06); this.bx('stone', px, y + 0.06, pz, 0.9, 0.55, 0.62, rot, { shade: 0.12 }); }   // 火を焚く所（煤けて暗い）
    { const [px, pz] = P(0, 0.02); this.bx('wood', px, y + 1.1, pz, 1.7, 0.75, 0.1, rot, { shade: 0.6 }); }       // 炉棚
    { const [px, pz] = P(0, -0.05); this.bx('stone', px, y + 1.2, pz, 0.9, 0.5, chimneyTop - (y + 1.2), rot, { shade: 0.85 }); this.block(px, y + 1.2, pz, 0.9, 0.5, chimneyTop - (y + 1.2), rot); }   // 煙突
    // 煙突の頭：張り出した段と笠石、煤けた口、素焼きの煙出し 2 本
    { const [px, pz] = P(0, -0.05);
      this.bx('stone', px, chimneyTop - 0.34, pz, 1.06, 0.66, 0.16, rot, { shade: 0.95, bottom: true });
      this.bx('stone', px, chimneyTop - 0.02, pz, 1.02, 0.62, 0.1, rot, { shade: 1.05, bottom: true });
      this.bx('cloth', px, chimneyTop + 0.08, pz, 0.62, 0.3, 0.012, rot, { shade: [0.05, 0.045, 0.04] }); }
    for (const dx of [-0.2, 0.2]) { const [px, pz] = P(dx, -0.05); this.bx('cloth', px, chimneyTop + 0.08, pz, 0.16, 0.16, 0.3, rot + 45, { shade: [0.55, 0.3, 0.2] }); }
    for (const dx of [-0.4, 0.4]) { const [px, pz] = P(dx, 0.1); this.solid(px, pz, 0.4, y); }
    { const [px, pz] = P(0, -0.05); this.solid(px, pz, 0.4, y + 2.9); }   // 二階を通る煙突
  }
}
