// 村の小物（家の周り）と井戸。形は world/build-kit.js の箱と多角柱で作り、村の形にまとめる（描画命令は増えない）
//   樽（鉄の箍）・薪の山（小さな屋根付き）・長椅子・干し草の束・井戸（石の縁と笠石・巻き上げの軸と取っ手・桶・わらぶきの屋根）
// 置く場所は world/castle.js が家ごとに決める（家の座標系 F：x は横、z は前）
import { box, obox, prism, frame, v3 } from './build-kit.js';

const IRON = [0.11, 0.1, 0.095];
const CUT = [0.74, 0.6, 0.42];   // 薪の切り口

/** 樽（立てて置く）。x, y, z は底の真ん中（世界の座標） */
export function barrel(B, x, y, z, r = 0.3, h = 0.86) {
  prism(B, 'wood', [x, y + h / 2, z], [0, 1, 0], h, r, 10, 0.85, { bulge: 0.13, capShade: 0.6 });
  for (const t of [0.14, 0.86]) prism(B, 'cloth', [x, y + h * t, z], [0, 1, 0], 0.05, r * (1 + 0.13 * (1 - Math.abs(t - 0.5) * 2) * 0.9) + 0.012, 10, IRON, { caps: false });
}

/** 長椅子（家の壁に沿って）。F は家の座標系、(lx, lz) は家の中の座標 */
export function bench(B, F, yaw, lx, lz, len = 1.3) {
  const P = (x, z) => F.at(x, 0, z);
  const p = P(lx, lz);
  box(B, 'wood', p[0], p[1] + 0.42, p[2], len, 0.34, 0.06, yaw, { shade: 0.75, bottom: true });
  for (const s of [-1, 1]) { const q = P(lx + s * (len / 2 - 0.15), lz); box(B, 'wood', q[0], q[1], q[2], 0.08, 0.3, 0.42, yaw, { shade: 0.65 }); }
}

/** 干し草の束（いくつか積む） */
export function hay(B, F, yaw, lx, lz, rnd) {
  const n = 1 + Math.floor(rnd.next() * 3);
  for (let i = 0; i < n; i++) {
    const up = i === 2;
    const q = F.at(lx + (up ? 0.25 : (i - 0.5) * 1.05), 0, lz + (rnd.next() - 0.5) * 0.15);
    box(B, 'thatch', q[0], q[1] + (up ? 0.46 : 0), q[2], 1.0, 0.5, 0.46, yaw + (rnd.next() - 0.5) * 12, { shade: 0.95 });
  }
}

/**
 * 薪の山（家の横の壁に沿って）と、上の小さな屋根。side：家の右（+1）か左（-1）、z0..z1：山の前後の範囲（家の中の座標）
 * wallX：家の横の壁の外の面（家の中の x）
 */
export function woodpile(B, F, yaw, side, wallX, z0, z1, rnd) {
  const D = (d) => F.dir(d[0], d[1], d[2]);
  const len = z1 - z0, rows = 4, r = 0.075;
  const x0 = side * (wallX + 0.22);
  // 山の体（奥の丸太の側面は見えないので、暗い木の箱）と、外を向いた丸太の切り口（少しずつ出っ張りを変える）
  const hgt = 0.08 + rows * (2 * r - 0.012);
  { const q = F.at(x0 + side * 0.26, 0.08, (z0 + z1) / 2); box(B, 'wood', q[0], q[1], q[2], 0.5, len, hgt - 0.08, yaw, { shade: 0.42 }); }
  const sides = 6, a0 = D([side, 0, 0]);
  for (let row = 0; row < rows; row++) {
    const n = Math.floor(len / (2 * r + 0.01)) - (row % 2);
    for (let i = 0; i < n; i++) {
      const lz = z0 + r + (row % 2) * r + i * (2 * r + 0.01), rr = r * (0.88 + rnd.next() * 0.24);
      const top = row === rows - 1;
      const cx = x0 + side * (top ? 0.53 + rnd.next() * 0.04 : 0.505 + rnd.next() * 0.025), cy = 0.08 + r + row * (2 * r - 0.012);
      const c = F.at(cx, cy, lz);
      // 切り口（六角）。上の段だけ丸太の側面も（上から丸みが見える）。下の段は箱の面にほぼ付いているので側面は要らない
      if (top) prism(B, 'wood', F.at(cx - side * 0.25, cy, lz), a0, 0.5, rr, sides, 0.55, { caps: false });
      const ring = (k) => { const t = (k / sides) * Math.PI * 2; return F.at(cx, cy + Math.sin(t) * rr, lz + Math.cos(t) * rr); };
      const cs = CUT.map((v) => v * (0.85 + rnd.next() * 0.25));
      for (let k = 0; k < sides; k += 2) B.quad('cloth', c, ring(k), ring(k + 1), ring(k + 2), a0, cs);
    }
  }
  // 下の横木 2 本、柱 2 本、板の屋根（壁から外へ下がる）
  for (const lz of [z0 + 0.1, z1 - 0.1]) { const q = F.at(x0 + side * 0.28, 0, lz); box(B, 'wood', q[0], q[1], q[2], 0.62, 0.08, 0.08, yaw, { shade: 0.5 }); }
  for (const lz of [z0 - 0.05, z1 + 0.05]) { const q = F.at(x0 + side * 0.62, 0, lz); box(B, 'wood', q[0], q[1], q[2], 0.08, 0.08, 1.12, yaw, { shade: 0.55 }); }
  const xa = side * (wallX + 0.05), xb = side * (wallX + 0.9), ya = 1.42, yb = 1.08;
  const along = v3.norm(D([xb - xa, yb - ya, 0])), zAx = D([0, 0, 1]);
  const nn = v3.cross(zAx, along), up = nn[1] > 0 ? nn : v3.mul(nn, -1);
  const mid = F.at((xa + xb) / 2, (ya + yb) / 2 + 0.03, (z0 + z1) / 2);
  obox(B, 'wood', mid, zAx, along, up, len + 0.4, Math.hypot(xb - xa, yb - ya), 0.05, 0.6);
}

/** 井戸：石の丸い縁と笠石、木の柱と横木、巻き上げの軸と取っ手、縄と桶、わらぶきの屋根（厚み付き） */
export function well(B, cx, y0, cz) {
  const sides = 12;
  for (let i = 0; i < sides; i++) {
    const a = ((i + 0.5) / sides) * Math.PI * 2;
    box(B, 'stone', cx + Math.cos(a) * 0.9, y0 - 0.2, cz + Math.sin(a) * 0.9, 0.5, 0.52, 0.95, (-a * 180) / Math.PI, { shade: 0.9 + (i % 3) * 0.05, grad: [0.75, 1] });
    box(B, 'stone', cx + Math.cos(a) * 0.92, y0 + 0.75, cz + Math.sin(a) * 0.92, 0.56, 0.6, 0.1, (-a * 180) / Math.PI, { shade: 1.1, bottom: true });   // 笠石
  }
  box(B, 'cloth', cx, y0 + 0.3, cz, 1.2, 1.2, 0.01, 0, { shade: [0.03, 0.035, 0.04] });   // 暗い水面
  for (const s of [-1, 1]) {
    box(B, 'wood', cx + s * 0.98, y0 - 0.1, cz, 0.18, 0.18, 2.4, 0, { shade: 0.6 });
    // 柱と横木の間の斜めの木、棟木を支える短い束
    const a = v3.norm([-s * 0.38, 0.4, 0]), b = [0, 0, 1];
    obox(B, 'wood', [cx + s * 0.8, y0 + 2.0, cz], a, b, v3.cross(a, b), 0.56, 0.1, 0.1, 0.55);
    box(B, 'wood', cx + s * 0.98, y0 + 2.36, cz, 0.1, 0.1, 0.34, 0, { shade: 0.55 });
  }
  box(B, 'wood', cx, y0 + 2.2, cz, 2.36, 0.16, 0.16, 0, { shade: 0.6, bottom: true });
  box(B, 'wood', cx, y0 + 2.58, cz, 2.6, 0.12, 0.12, 0, { shade: 0.55, bottom: true });
  // 巻き上げの軸と取っ手、縄、桶
  prism(B, 'wood', [cx, y0 + 1.35, cz], [1, 0, 0], 1.8, 0.09, 8, 0.7, { capShade: 0.5 });
  box(B, 'wood', cx + 1.12, y0 + 1.3, cz, 0.05, 0.05, 0.36, 0, { shade: 0.5 });
  box(B, 'wood', cx + 1.12, y0 + 1.03, cz + 0.11, 0.05, 0.25, 0.05, 0, { shade: 0.5 });
  box(B, 'cloth', cx - 0.1, y0 + 0.62, cz, 0.025, 0.025, 0.66, 0, { shade: [0.5, 0.42, 0.3] });
  prism(B, 'wood', [cx - 0.1, y0 + 0.5, cz], [0, 1, 0], 0.26, 0.15, 8, 0.7, { capShade: 0.4, bulge: 0.08 });
  prism(B, 'cloth', [cx - 0.1, y0 + 0.6, cz], [0, 1, 0], 0.03, 0.165, 8, IRON, { caps: false });
  // 屋根：厚みのあるわらぶき 2 枚と、棟
  const F = frame(cx, y0, cz, 0);
  for (const s of [-1, 1]) {
    const a = v3.norm([0, -0.65, s * 0.95]), n = v3.norm([0, 0.95, s * 0.65]);
    const c = v3.add(F.at(0, 2.38, s * 0.48), v3.mul(n, 0.08));
    obox(B, 'thatch', c, [1, 0, 0], a, n, 2.9, 1.2, 0.16, 1);
  }
  obox(B, 'thatch', [cx, y0 + 2.78, cz], [1, 0, 0], v3.norm([0, 1, 1]), v3.norm([0, 1, -1]), 3.0, 0.24, 0.24, 0.8);
}
