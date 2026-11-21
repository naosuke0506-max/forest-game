// 家具（家の中の座標で置く）。③ 家の中と人が消えた直後（2026-11-21。利用者の指示：マップは全部現代。家具は「全部今の家具にする」）：
//   ベッド（低い木の台・厚いマットレス・布の頭板）・白いタンス・木の食卓と白い椅子・整理だんす（上にテレビ）・本棚・冷蔵庫・台所・
//   薪ストーブ（石の煙突の前）・ソファ・ナイトテーブルと灯り・敷物・額・掛け時計・吊り灯。前の中世の家具（長持・袋・壺・腰掛け・暖炉）は無くした
//   ぶつかる範囲はその階の高さだけ（world/obstacles.js の高さの範囲）。
//   ベッドの下とタンスの中は隠れ場所（game/hiding.js）として記録する（前と同じ大きさ・同じ場所）
//   タンスの扉とベッドの掛け布（横に垂れた所）は動く部品：ここでは形に入れず、蝶番の位置と向きを隠れ場所に記録し、
//   render/furniture-motion.js が隠れる・出る・探す動きに合わせて開け閉めする
//   Poly Haven の模型（椅子・電気コンロ・額・時計・吊り灯・食べ物など）は world/village-items.js が描く（reg.items）
//   夜の灯り・テレビの光・ストーブの熾火の場所は、家ごとの記録（life）に書く（world/house-life.js が光らせる）
// 家の中の座標：x は横（右が +）、z は奥行き（前＝扉の側が +）、y は高さ
// 乱数：rnd は村の乱数（家の並び・屋根と同じ流れ）なので、前と同じ回数だけ使う。新しく決める事は deco（家ごとの飾りの乱数）で決める
import { box, prism } from './build-kit.js';

/** ベッドの掛け布団の色（4 通り。掛け布も同じ色。render/furniture-motion.js も使う）：明るい灰・紺・セージ・からし色 */
export const BLANKETS = [[0.74, 0.74, 0.76], [0.17, 0.23, 0.38], [0.5, 0.58, 0.5], [0.74, 0.56, 0.22]];
/** タンスの色（明るい木。白い台所の戸棚・冷蔵庫と見分けが付くように。render/furniture-motion.js の扉も同じ色） */
export const CABINET = [0.74, 0.6, 0.44];
const WHITE = [0.9, 0.89, 0.86];             // 白い家具
const OAK = [0.78, 0.62, 0.43];              // 明るい木（食卓・天板）
const BLACK = [0.07, 0.07, 0.075];           // 黒い鉄・テレビ
const LINE = [0.32, 0.31, 0.3];              // 引き出しの継ぎ目
const COUNTER = [0.3, 0.3, 0.31];            // 台所の天板
/** 布の色（ソファ・頭板・敷物） */
const FABRICS = [[0.45, 0.46, 0.48], [0.25, 0.31, 0.42], [0.6, 0.54, 0.45], [0.33, 0.41, 0.35], [0.5, 0.3, 0.26]];
const RUGS = [[0.42, 0.33, 0.26], [0.27, 0.29, 0.34], [0.46, 0.24, 0.2], [0.48, 0.45, 0.4], [0.3, 0.36, 0.3]];
/** 本の背の色 */
const BOOKS = [[0.55, 0.12, 0.1], [0.14, 0.25, 0.45], [0.2, 0.38, 0.24], [0.8, 0.72, 0.5], [0.15, 0.15, 0.16], [0.7, 0.42, 0.15], [0.85, 0.84, 0.8]];

/** 家具（家の中の座標で置く）。ぶつかる範囲はその階の高さだけ */
export class Furniture {
  constructor(B, F, y0, yaw, reg, range, routes, rooms = [], { deco = null, life = null } = {}) {
    Object.assign(this, { B, F, y0, yaw, reg, range, routes, rooms, deco, life, items: reg.items || null });
  }
  /** 視線をさえぎる箱（家の中の座標。bot の目。game/sight.js） */
  block(x, y, z, w, d, h, rot) { this.reg.block?.(x, y, z, w, d, h, rot); }
  bx(surf, x, y, z, w, d, h, rot, opt = {}) {
    const p = this.F.at(x, 0, z);
    box(this.B, surf, p[0], this.y0 + y, p[2], w, d, h, this.yaw + rot, opt);
  }
  /** 立てた丸い物（皿・杯・灯りの笠） */
  cyl(surf, x, y, z, r, h, shade, sides = 10) {
    const p = this.F.at(x, 0, z);
    prism(this.B, surf, [p[0], this.y0 + y + h / 2, p[2]], [0, 1, 0], h, r, sides, shade);
  }
  /** 家具の中の座標（向き rot で回した）→ 家の中の座標 */
  local(x, z, dx, dz, rot) {
    const a = (rot * Math.PI) / 180;
    return [x + Math.cos(a) * dx + Math.sin(a) * dz, z - Math.sin(a) * dx + Math.cos(a) * dz];
  }
  /** 家の中の座標 → 世界の座標 [x, y, z] */
  world(x, y, z) { const p = this.F.at(x, 0, z); return [p[0], this.y0 + y, p[2]]; }
  solid(x, z, r, floorY) {
    const p = this.F.at(x, 0, z);
    this.reg.solid(p[0], p[2], r, { y0: this.y0 + floorY - 0.6, y1: this.y0 + floorY + 0.7 });
  }
  /** Poly Haven の模型を置く（家の中の座標と向き） */
  prop(id, x, y, z, rot, opt) {
    if (!this.items) return;
    const [wx, wy, wz] = this.world(x, y, z);
    this.items.prop(id, wx, wy, wz, this.yaw + rot, opt);
  }
  /** 0〜1 の乱数（家ごとの飾りの乱数。無ければ決まった値） */
  r() { return this.deco ? this.deco.next() : 0.5; }
  pick(arr) { return arr[Math.floor(this.r() * arr.length) % arr.length]; }
  /**
   * 隠れ場所を記録する（game/hiding.js が使う）
   *   x, z：隠れている人の位置、y：床の高さ、yaw：外を覗く向き（家の座標の向きの約束：0 で +z）
   *   eye：覗く目の位置（eyeX, eyeZ と床からの高さ eyeH）、out：出たときに立つ位置、route：外からの道順
   */
  hide(kind, x, z, floorY, lookRot, { eyeAhead, eyeH, outAhead }) {
    const a = (lookRot * Math.PI) / 180, dx = Math.sin(a), dz = Math.cos(a);
    const p = this.F.at(x, 0, z), e = this.F.at(x + dx * eyeAhead, 0, z + dz * eyeAhead), o = this.F.at(x + dx * outAhead, 0, z + dz * outAhead);
    const spot = {
      kind, x: p[0], z: p[2], y: this.y0 + floorY, yaw: this.yaw + lookRot,
      eyeX: e[0], eyeZ: e[2], eyeH, outX: o[0], outZ: o[2],
      route: this.routes[floorY > 2 ? 1 : 0],
      room: this.rooms[floorY > 2 ? 1 : 0] || null,   // その階の部屋の内側（game/hiding.js の inRoom。家の外から隠れられないように）
    };
    this.reg.hides.push(spot);
    return spot;
  }
  /** 動く部品の蝶番（家の中の座標 x, z と高さ y）→ 世界の位置と、部品の向き（家具の向き rot に足す角度 turn） */
  hinge(x, y, z, rot, turn = 0) {
    const p = this.F.at(x, 0, z);
    return { x: p[0], y: this.y0 + y, z: p[2], yaw: this.yaw + rot + turn };
  }

  /** ベッド：長さ 2m・幅 1m。頭は rot の向きの後ろ。下に 0.3m の隙間（潜って隠れる）。低い木の台・厚いマットレス・布の頭板 */
  bed(x, z, y, rot, rnd) {
    const L = 2.0, Wd = 1.0;
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [px, pz] = P(sx * (Wd / 2 - 0.07), sz * (L / 2 - 0.07)); this.bx('steel', px, y, pz, 0.05, 0.05, 0.31, rot, { shade: BLACK }); }   // 細い鉄の脚
    { const [px, pz] = P(0, 0); this.bx('cloth', px, y + 0.3, pz, Wd + 0.04, L, 0.1, rot, { shade: OAK, bottom: true }); this.block(px, y + 0.3, pz, Wd, L, 0.33, rot); }   // 台（と布団の分の高さ）
    { const [px, pz] = P(0, 0.01); this.bx('cloth', px, y + 0.4, pz, Wd - 0.04, L - 0.06, 0.22, rot, { shade: [0.93, 0.92, 0.89] }); }   // マットレス
    const fabric = this.pick(FABRICS);
    { const [px, pz] = P(0, -L / 2 + 0.03); this.bx('cloth', px, y + 0.3, pz, Wd + 0.12, 0.1, 0.92, rot, { shade: fabric }); this.block(px, y, pz, Wd + 0.12, 0.1, 1.22, rot); }   // 布の頭板
    const tone = Math.floor(rnd.next() * 4), blanket = BLANKETS[tone];
    { const [px, pz] = P(0, 0.22); this.bx('cloth', px, y + 0.62, pz, Wd + 0.02, L * 0.76, 0.06, rot, { shade: blanket }); }   // 掛け布団
    { const [px, pz] = P(0, L / 2 - 0.01); this.bx('cloth', px, y + 0.4, pz, Wd + 0.02, 0.03, 0.28, rot, { shade: blanket.map((c) => c * 0.92) }); }   // 足もとに垂れた所
    { const [px, pz] = P(0, -L / 2 + 0.3); this.bx('cloth', px, y + 0.62, pz, Wd * 0.72, 0.36, 0.12, rot, { shade: [0.96, 0.95, 0.92] }); }   // 枕
    // 人が消えた直後：掛け布団がめくれている（半分のベッド）
    if (this.r() < 0.5) { const [px, pz] = P(0, -L / 2 + 0.72); this.bx('cloth', px, y + 0.68, pz, Wd + 0.02, 0.3, 0.05, rot + 4, { shade: blanket.map((c) => c * 1.06) }); }
    for (const dz of [-0.6, 0, 0.6]) { const [px, pz] = P(0, dz); this.solid(px, pz, 0.48, y); }
    // 下に潜って覗く向き：ベッドの横のうち、部屋の真ん中の側
    const side = Math.cos((rot * Math.PI) / 180) * -x + -Math.sin((rot * Math.PI) / 180) * -z >= 0 ? 1 : -1;
    const spot = (() => { const [px, pz] = P(0, 0.1); return this.hide('bed', px, pz, y, rot + side * 90, { eyeAhead: 0.4, eyeH: 0.2, outAhead: 1.05 }); })();
    // 掛け布団の、部屋の側に垂れた所（掛け布）：縁から下へ垂れ、探すときに持ち上げられる（動く部品。蝶番は掛け布団の縁）
    { const [px, pz] = P(side * (Wd / 2 + 0.015), 0.3); spot.flap = { ...this.hinge(px, y + 0.62, pz, rot, side > 0 ? 0 : 180), tone }; }
    return { side };
  }
  /** タンス：幅 1.05・奥行き 0.55・高さ 1.95。扉は rot の向きの前（中に入って隠れる）。明るい木の平らな板の今ふうのタンス */
  wardrobe(x, z, y, rot) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    // 本体は前の面が無い箱（扉を開けると中が見える）。中は明るい灰の板で、奥の壁・底・天井・横の壁を内側に張る
    { const [px, pz] = P(0, 0); this.bx('cloth', px, y, pz, 1.05, 0.55, 1.95, rot, { shade: CABINET, skip: 'front' }); this.block(px, y, pz, 1.05, 0.58, 2.03, rot); }
    { const [px, pz] = P(0, -0.25); this.bx('cloth', px, y + 0.05, pz, 0.97, 0.02, 1.85, rot, { shade: [0.55, 0.54, 0.52] }); }    // 奥の壁
    for (const s of [-1, 1]) { const [px, pz] = P(s * 0.495, 0.01); this.bx('cloth', px, y + 0.05, pz, 0.02, 0.5, 1.85, rot, { shade: [0.6, 0.59, 0.57] }); }   // 横の壁
    { const [px, pz] = P(0, 0.01); this.bx('cloth', px, y, pz, 0.97, 0.5, 0.06, rot, { shade: [0.5, 0.49, 0.47] }); this.bx('cloth', px, y + 1.88, pz, 0.97, 0.5, 0.05, rot, { shade: [0.45, 0.44, 0.42], bottom: true }); }   // 底と天井
    { const [px, pz] = P(0, 0.06); this.bx('steel', px, y + 1.62, pz, 0.92, 0.02, 0.02, rot, { shade: [0.6, 0.6, 0.62] }); }   // 掛ける棒
    { const [px, pz] = P(0, 0); this.solid(px, pz, 0.5, y); }
    const spot = (() => { const [px, pz] = P(0, 0.05); return this.hide('wardrobe', px, pz, y, rot, { eyeAhead: 0.2, eyeH: 1.55, outAhead: 0.85 }); })();
    // 扉 2 枚（取っ手付き。動く部品）：蝶番は外の縁。右・左は、タンスに向いて立った人から見て（右の扉は +x の側）。
    // 左の扉は、右の扉の形を 180 度回して使う
    spot.doors = [1, -1].map((s) => { const [px, pz] = P(s * 0.495, 0.285); return this.hinge(px, y + 0.12, pz, rot, s > 0 ? 0 : 180); });
  }
  /**
   * 食卓（1.4 × 0.8。明るい木の天板と黒い鉄の脚）と白い椅子 2 つ。人が消えた直後：皿と食べかけの物・杯・水差し。椅子が 1 つ引かれている
   *   ceil：上の天井の高さ（吊り灯を下げる。無ければ下げない）
   */
  table(x, z, y, rnd, { ceil = null, meal = true } = {}) {
    const rot = rnd.next() < 0.5 ? 0 : 90;
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    { const [px, pz] = P(0, 0); this.bx('cloth', px, y + 0.72, pz, 1.4, 0.8, 0.045, rot, { shade: OAK, bottom: true }); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [px, pz] = P(sx * 0.62, sz * 0.32); this.bx('steel', px, y, pz, 0.05, 0.05, 0.72, rot, { shade: BLACK }); }
    // 椅子：机の長い辺の両側（前の腰掛けと同じ所）。机の方を向く。1 つは引かれて斜め（さっきまで座っていた）
    const pulled = this.r() < 0.5 ? 1 : -1;
    for (const s of [-1, 1]) {
      const back = s === pulled ? 0.22 : 0, turn = s === pulled ? (this.r() - 0.5) * 50 : (this.r() - 0.5) * 10;
      const [px, pz] = P(s * 0.3, s * (0.62 + back));
      this.prop('painted_wooden_chair_01', px, y, pz, rot + (s > 0 ? 180 : 0) + turn);
      this.solid(px, pz, 0.25, y);
    }
    for (const dx of [-0.4, 0.4]) { const [px, pz] = P(dx, 0); this.solid(px, pz, 0.45, y); }
    const top = y + 0.765;
    if (meal) {
      // 皿 2 枚（白）と、食べかけの物（クロワッサン・りんご）・杯。真ん中に水差しか花瓶
      for (const s of [-1, 1]) {
        const [px, pz] = P(s * 0.3, s * 0.2);
        this.cyl('cloth', px, top, pz, 0.12, 0.018, [0.95, 0.95, 0.93], 12);
        const k = this.r();
        if (k < 0.45) this.prop('croissant', px, top + 0.018, pz, rot + this.r() * 360);
        else if (k < 0.8) this.prop('food_apple_01', px, top + 0.018, pz, this.r() * 360);
        const [cx, cz] = P(s * 0.3 + s * 0.2, s * 0.24);
        this.cyl('cloth', cx, top, cz, 0.04, 0.09, this.pick([[0.92, 0.92, 0.9], [0.3, 0.45, 0.62], [0.7, 0.3, 0.2]]), 8);
      }
      const [mx, mz] = P(-0.4 + this.r() * 0.2, 0);
      this.prop(this.r() < 0.55 ? 'jug_01' : 'ceramic_vase_01', mx, top, mz, this.r() * 360);
    }
    // 吊り灯（食卓の上。夜は灯る）
    if (ceil !== null) this.lamp(x, z, y, ceil);
    return { rot };
  }
  /** 天井から下げた灯り（Poly Haven の模型）。灯の場所を記録する（world/house-life.js） */
  lamp(x, z, y, ceil) {
    const LAMP_TOP = 1.173, BULB = 0.33;   // 模型の一番上（吊り具）と、笠の中の電球の高さ（模型の原点から）
    this.prop('modern_ceiling_lamp_01', x, ceil - LAMP_TOP, z, 0);
    this.life?.lamps.push({ p: this.world(x, ceil - LAMP_TOP + BULB, z), floor: y > 2 ? 1 : 0 });
  }
  /** 整理だんす（白い引き出し 3 段と明るい木の天板）。tv：上に薄いテレビを置き、tvRot の向きへ向ける */
  dresser(x, z, y, rot, { tv = false, tvRot = rot } = {}) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    { const [px, pz] = P(0, 0); this.bx('cloth', px, y, pz, 0.95, 0.5, 0.78, rot, { shade: WHITE }); this.block(px, y, pz, 0.95, 0.52, 0.8, rot); }
    { const [px, pz] = P(0, 0); this.bx('cloth', px, y + 0.78, pz, 0.98, 0.53, 0.03, rot, { shade: OAK, bottom: true }); }
    for (const v of [0.27, 0.52]) { const [px, pz] = P(0, 0.252); this.bx('cloth', px, y + v, pz, 0.9, 0.006, 0.012, rot, { shade: LINE }); }   // 引き出しの継ぎ目
    for (const v of [0.15, 0.4, 0.65]) { const [px, pz] = P(0, 0.258); this.bx('steel', px, y + v, pz, 0.16, 0.015, 0.02, rot, { shade: [0.55, 0.55, 0.57] }); }   // 取っ手
    { const [px, pz] = P(0, 0); this.solid(px, pz, 0.45, y); }
    if (tv) this.tv(x, z, y + 0.81, tvRot);
  }
  /** 薄いテレビ（台と画面）。画面の場所と向きを記録する（点いたまま。world/house-life.js が光らせる） */
  tv(x, z, y, rot) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    { const [px, pz] = P(0, -0.02); this.bx('steel', px, y, pz, 0.3, 0.16, 0.02, rot, { shade: BLACK }); this.bx('steel', px, y + 0.02, pz, 0.05, 0.03, 0.08, rot, { shade: BLACK }); }   // 台
    { const [px, pz] = P(0, 0); this.bx('steel', px, y + 0.08, pz, 0.84, 0.04, 0.5, rot, { shade: BLACK, bottom: true }); }   // 画面の枠
    const [sx, sz] = P(0, 0.022);
    const n = this.F.dir(Math.sin((rot * Math.PI) / 180), 0, Math.cos((rot * Math.PI) / 180));
    const u = this.F.dir(Math.cos((rot * Math.PI) / 180), 0, -Math.sin((rot * Math.PI) / 180));
    this.life?.tvs.push({ p: this.world(sx, y + 0.33, sz), n: [n[0], 0, n[2]], u: [u[0], 0, u[2]], w: 0.78, h: 0.44, floor: y > 2 ? 1 : 0 });
  }
  /** 本棚（壁に付いた白い板 2 枚と、本・花瓶） */
  shelf(x, z, y, rot) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    for (const dy of [0, 0.42]) { const [px, pz] = P(0, 0.13); this.bx('cloth', px, y + dy, pz, 1.2, 0.26, 0.03, rot, { shade: WHITE, bottom: true }); }
    // 下の板：本が並ぶ（高さと色はいろいろ）。上の板：寝かせた本と花瓶
    let dx = -0.56;
    while (dx < 0.5) {
      const bw = 0.03 + this.r() * 0.035, bh = 0.18 + this.r() * 0.1;
      const [px, pz] = P(dx + bw / 2, 0.14);
      this.bx('cloth', px, y + 0.03, pz, bw, 0.18 + this.r() * 0.04, bh, rot, { shade: this.pick(BOOKS) });
      dx += bw + 0.004 + (this.r() < 0.1 ? 0.08 : 0);
    }
    for (let i = 0; i < 3; i++) { const [px, pz] = P(-0.4, 0.14); this.bx('cloth', px, y + 0.45 + i * 0.035, pz, 0.26 - i * 0.02, 0.2, 0.033, rot + (this.r() - 0.5) * 10, { shade: this.pick(BOOKS) }); }
    { const [px, pz] = P(0.3, 0.14); this.prop('ceramic_vase_01', px, y + 0.45, pz, rot); }
  }
  /** 冷蔵庫（白。上が冷凍室）：前は rot の向き */
  fridge(x, z, y, rot) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    { const [px, pz] = P(0, 0); this.bx('cloth', px, y, pz, 0.62, 0.64, 1.8, rot, { shade: [0.93, 0.93, 0.92] }); this.block(px, y, pz, 0.62, 0.64, 1.8, rot); }
    { const [px, pz] = P(0, 0.322); this.bx('cloth', px, y + 1.22, pz, 0.6, 0.006, 0.012, rot, { shade: LINE }); }
    for (const [v, hh] of [[0.75, 0.4], [1.3, 0.25]]) { const [px, pz] = P(-0.24, 0.335); this.bx('steel', px, y + v, pz, 0.025, 0.025, hh, rot, { shade: [0.7, 0.7, 0.72] }); }
    { const [px, pz] = P(0, 0); this.solid(px, pz, 0.38, y); }
  }
  /**
   * 台所の流し台（白い戸棚・暗い天板・流しと蛇口・電気の焜炉の板）。cx, cz：真ん中、len：長さ（rot の横）、前は rot の向き
   *   stove：端に Poly Haven の電気コンロ（オーブン付き）を置く（-1 / 1：左 / 右の端。0：置かず、天板に焜炉の板）
   */
  kitchen(cx, cz, len, y, rot, { stove = 0 } = {}) {
    const P = (dx, dz) => this.local(cx, cz, dx, dz, rot);
    const SW = 0.52;   // 電気コンロの幅
    const run = stove ? len - SW : len, rc = stove ? -stove * SW / 2 : 0;   // 戸棚の長さと真ん中（コンロの分をずらす）
    if (run >= 0.5) {
      { const [px, pz] = P(rc, -0.01); this.bx('cloth', px, y + 0.1, pz, run, 0.56, 0.76, rot, { shade: WHITE }); this.block(px, y, pz, run, 0.6, 0.9, rot); }
      { const [px, pz] = P(rc, -0.04); this.bx('cloth', px, y, pz, run - 0.02, 0.5, 0.1, rot, { shade: [0.2, 0.2, 0.21] }); }   // 蹴込み
      { const [px, pz] = P(rc, 0); this.bx('cloth', px, y + 0.86, pz, run + 0.02, 0.62, 0.04, rot, { shade: COUNTER, bottom: true }); }   // 天板
      // 戸の継ぎ目と取っ手（約 0.6 m ごと）
      const n = Math.max(1, Math.round(run / 0.6));
      for (let i = 0; i < n; i++) {
        const a = rc - run / 2 + (run * (i + 0.5)) / n;
        if (i > 0) { const [px, pz] = P(rc - run / 2 + (run * i) / n, 0.272); this.bx('cloth', px, y + 0.12, pz, 0.008, 0.006, 0.72, rot, { shade: LINE }); }
        const [hx, hz] = P(a, 0.28); this.bx('steel', hx, y + 0.72, hz, 0.18, 0.015, 0.02, rot, { shade: [0.6, 0.6, 0.62] });
      }
      // 流し（凹んだ鉄の板）と蛇口
      const sinkX = rc + (stove ? stove * 0.1 : -run * 0.22);
      { const [px, pz] = P(sinkX, 0.02); this.bx('steel', px, y + 0.885, pz, 0.5, 0.38, 0.02, rot, { shade: [0.62, 0.63, 0.65] }); this.bx('steel', px, y + 0.89, pz, 0.42, 0.3, 0.02, rot, { shade: [0.25, 0.26, 0.27] }); }
      { const [px, pz] = P(sinkX, -0.22); this.bx('steel', px, y + 0.9, pz, 0.03, 0.03, 0.26, rot, { shade: [0.7, 0.7, 0.72] }); }
      { const [px, pz] = P(sinkX, -0.14); this.bx('steel', px, y + 1.13, pz, 0.025, 0.18, 0.025, rot, { shade: [0.7, 0.7, 0.72] }); }
      // 焜炉の板（コンロを置かないとき）：黒いガラスの板
      if (!stove && run >= 1.1) { const [px, pz] = P(rc + run * 0.25, 0.02); this.bx('cloth', px, y + 0.9, pz, 0.56, 0.48, 0.008, rot, { shade: BLACK }); }
    }
    if (stove) { const [px, pz] = P(stove * (len / 2 - SW / 2), -0.02); this.prop('electric_stove', px, y, pz, rot); }
    // 当たり判定：長さに沿って円を並べる
    const m = Math.max(1, Math.round(len / 0.5));
    for (let i = 0; i <= m; i++) { const [px, pz] = P(-len / 2 + 0.25 + ((len - 0.5) * i) / m, 0); this.solid(px, pz, 0.32, y); }
  }
  /** ソファ（2〜3 人掛け。布張り）：長さ 1.9・奥行き 0.88。前は rot の向き */
  sofa(x, z, y, rot) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    const L = 1.9, D = 0.88, c = this.pick(FABRICS), dark = c.map((v) => v * 0.82);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [px, pz] = P(sx * (L / 2 - 0.08), sz * (D / 2 - 0.08)); this.bx('steel', px, y, pz, 0.04, 0.04, 0.1, rot, { shade: BLACK }); }
    { const [px, pz] = P(0, 0); this.bx('cloth', px, y + 0.1, pz, L, D, 0.3, rot, { shade: dark }); this.block(px, y, pz, L, D, 0.85, rot); }
    for (const s of [-1, 1]) { const [px, pz] = P(s * (L / 4 - 0.07), 0.08); this.bx('cloth', px, y + 0.4, pz, L / 2 - 0.2, D - 0.2, 0.13, rot, { shade: c }); }   // 座面
    { const [px, pz] = P(0, -D / 2 + 0.12); this.bx('cloth', px, y + 0.4, pz, L - 0.36, 0.24, 0.45, rot, { shade: c }); }   // 背もたれ
    for (const s of [-1, 1]) { const [px, pz] = P(s * (L / 2 - 0.09), 0); this.bx('cloth', px, y + 0.1, pz, 0.18, D, 0.52, rot, { shade: dark }); }   // 肘掛け
    { const [px, pz] = P(-L / 2 + 0.42, -D / 2 + 0.3); this.bx('cloth', px, y + 0.5, pz, 0.38, 0.12, 0.34, rot + 12, { shade: this.pick(RUGS) }); }   // クッション
    for (const dx of [-0.6, 0, 0.6]) { const [px, pz] = P(dx, 0); this.solid(px, pz, 0.45, y); }
  }
  /** 一人掛けの椅子（Poly Haven の革の椅子）：前は rot の向き */
  armchair(x, z, y, rot) {
    this.prop('mid_century_lounge_chair', x, y, z, rot);
    this.solid(x, z, 0.45, y);
    this.block(x, y, z, 0.9, 0.9, 0.9, rot);
  }
  /** ナイトテーブルと灯り（夜は灯る） */
  nightstand(x, z, y, rot) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    { const [px, pz] = P(0, 0); this.bx('cloth', px, y, pz, 0.44, 0.38, 0.5, rot, { shade: WHITE }); this.bx('cloth', px, y + 0.5, pz, 0.46, 0.4, 0.025, rot, { shade: OAK, bottom: true }); }
    { const [px, pz] = P(0, 0.192); this.bx('steel', px, y + 0.36, pz, 0.12, 0.012, 0.018, rot, { shade: [0.55, 0.55, 0.57] }); }
    const [lx, lz] = P(0.06, -0.04);
    this.cyl('steel', lx, y + 0.525, lz, 0.06, 0.03, BLACK, 8);
    this.cyl('steel', lx, y + 0.555, lz, 0.012, 0.2, BLACK, 6);
    this.cyl('cloth', lx, y + 0.7, lz, 0.12, 0.16, [0.95, 0.9, 0.78], 10);
    this.life?.glows.push({ p: this.world(lx, y + 0.78, lz), r: 0.32, floor: y > 2 ? 1 : 0 });
    { const [px, pz] = P(0, 0); this.solid(px, pz, 0.26, y); }
  }
  /** 敷物（床の上の薄い布） */
  rug(x, z, y, w, d, rot) {
    // 縁（濃い色）と内側（少し明るい色）の 2 枚
    const c = this.pick(RUGS);
    this.bx('cloth', x, y + 0.004, z, w, d, 0.008, rot, { shade: c.map((v) => v * 0.7) });
    this.bx('cloth', x, y + 0.006, z, w - 0.16, d - 0.16, 0.008, rot, { shade: c, skip: 'front back left right' });
  }
  /** 壁の額・時計（壁の面の家の中の座標 x, z、高さ y、向き rot＝部屋の内側へ向く向き） */
  wall(id, x, y, z, rot) { this.prop(id, x, y, z, rot); }
  /** 前の「穀物の袋」の分だけ村の乱数を使う（家の並び・屋根が前と同じになるように） */
  burnSacks(rnd) {
    const n = 2 + Math.floor(rnd.next() * 2);
    for (let i = 0; i < n; i++) { rnd.next(); rnd.next(); }
  }
  /**
   * 薪ストーブ（黒い鉄。前に小さなガラス窓。熾火が残っている）と、石の煙突（屋根の上まで）。ストーブの口は rot の向きの前
   *   前の暖炉と同じ場所・同じ煙突（外から見た煙突は変わらない）
   */
  stove(x, z, y, chimneyTop, rot = 0) {
    const P = (dx, dz) => this.local(x, z, dx, dz, rot);
    // 煙突（床から屋根の上まで。石のまま）
    { const [px, pz] = P(0, -0.05); this.bx('stone', px, y, pz, 0.9, 0.5, chimneyTop - y, rot, { shade: 0.85 }); this.block(px, y, pz, 0.9, 0.5, chimneyTop - y, rot); }
    // ストーブ：台の板・脚・箱・ガラス窓・上の煙突の管（煙突へ入る）
    const [sx, sz] = P(0, 0.52);
    this.bx('stone', sx, y, sz, 0.9, 0.62, 0.04, rot, { shade: 0.6 });   // 床の石の板（火の粉よけ）
    for (const a of [-1, 1]) for (const b of [-1, 1]) { const [px, pz] = P(a * 0.22, 0.52 + b * 0.16); this.bx('steel', px, y + 0.04, pz, 0.05, 0.05, 0.14, rot, { shade: BLACK }); }
    { const [px, pz] = P(0, 0.52); this.bx('steel', px, y + 0.18, pz, 0.56, 0.44, 0.6, rot, { shade: [0.1, 0.1, 0.105], bottom: true }); this.block(px, y, pz, 0.56, 0.44, 0.8, rot); }
    { const [px, pz] = P(0, 0.745); this.bx('cloth', px, y + 0.3, pz, 0.36, 0.006, 0.3, rot, { shade: [0.16, 0.06, 0.03] }); }   // ガラス窓
    { const [px, pz] = P(0, 0.45); this.cyl('steel', px, y + 0.78, pz, 0.07, 0.5, BLACK, 10); }
    { const [px, pz] = P(0, 0.3); this.bx('steel', px, y + 1.2, pz, 0.12, 0.34, 0.12, rot, { shade: BLACK }); }
    // 熾火（ガラス窓の奥がうっすら赤い。world/house-life.js が光らせる）
    { const [px, pz] = P(0, 0.75); const n = this.F.dir(Math.sin((rot * Math.PI) / 180), 0, Math.cos((rot * Math.PI) / 180)); this.life?.embers.push({ p: this.world(px, y + 0.45, pz), n: [n[0], 0, n[2]], floor: y > 2 ? 1 : 0 }); }
    // 煙突の頭：張り出した段と笠石、煤けた口、素焼きの煙出し 2 本
    { const [px, pz] = P(0, -0.05);
      this.bx('stone', px, chimneyTop - 0.34, pz, 1.06, 0.66, 0.16, rot, { shade: 0.95, bottom: true });
      this.bx('stone', px, chimneyTop - 0.02, pz, 1.02, 0.62, 0.1, rot, { shade: 1.05, bottom: true });
      this.bx('cloth', px, chimneyTop + 0.08, pz, 0.62, 0.3, 0.012, rot, { shade: [0.05, 0.045, 0.04] }); }
    for (const dx of [-0.2, 0.2]) { const [px, pz] = P(dx, -0.05); this.bx('cloth', px, chimneyTop + 0.08, pz, 0.16, 0.16, 0.3, rot + 45, { shade: [0.55, 0.3, 0.2] }); }
    { const [px, pz] = P(0, -0.05); this.solid(px, pz, 0.45, y); }
    { const [px, pz] = P(0, 0.52); this.solid(px, pz, 0.36, y); }
    { const [px, pz] = P(0, -0.05); this.solid(px, pz, 0.4, y + 2.9); }   // 二階を通る煙突
  }
}
