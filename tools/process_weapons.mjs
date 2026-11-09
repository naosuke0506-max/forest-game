// 武器・盾の模型（Tripo AI）をゲーム用に軽くし、持ち手の位置と向きをそろえる（開発用の道具。ゲームには含まれない）
//
//   cd tools && npm ci
//   node process_weapons.mjs ../source_models/weapons ../assets/weapons
//
// ゲームでの向き（js/render/weapons.js の仮の形と同じ決まり）：
//   剣・槍：持ち手が原点、刃先（穂先）が -Z、刃の幅（鍔の向き）が X
//   盾    ：中心が原点、縦が Y（上が +Y）、表（腕と反対の側）が +X、横幅が Z
// 向きは形から自動で見つける：
//   剣：長い軸の上で一番幅が広い所が鍔。鍔から短い側が柄、長い側が刃
//   槍：長い軸の両端のうち、太い方が穂先
//   鎚（鎚矛・戰鎚・長柄鎚）：槍と同じく太い方が頭。頭の一番広い向きを X にし、鎚の面（嘴より短く出ている側）を +X にする
//     （技の動きの「打つ側」が +X。鎚矛は頭が丸いので、どちらでもよい）
//   盾：一番薄い軸が厚み。横幅の広い側が上。真ん中の出っ張り（ボス）が出ている側が表
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, weld, simplify, prune, dedup, transformMesh, quantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

// length：ゲームでの全長（盾は高さ）m、grip：持つ位置（剣は鍔から柄頭までの何割の所、槍は石突きから全長の何割の所）
const WEAPONS = {
  armingsword: { kind: 'sword', length: 0.95, grip: 0.4, tris: 2500, tex: 512 },
  longsword:   { kind: 'sword', length: 1.25, grip: 0.25, tris: 2500, tex: 512 },  // 両手持ち：右手は鍔のすぐ下
  spear:       { kind: 'spear', length: 2.5,  grip: 0.25, tris: 2000, tex: 512 },
  // 利用者が送った模型（2026-11-09）。元（source_models/weapons/）は tools/decimate_weapon.py で 4 万三角形に減らした物。
  // ここへ渡す前に、もう一度 decimate_weapon.py で 3000 三角形にした物を使う（この道具の減らし方は、Tripo の模型の継ぎ目で止まるため）
  mace:        { kind: 'hammer', length: 0.75, grip: 0.2, tris: 3000, tex: 512, error: 0.06 },   // 鎚矛：片手。持ち手は柄頭から 2 割
  warhammer:   { kind: 'hammer', length: 1.15, grip: 0.36, tris: 3000, tex: 512, error: 0.06 },  // 戰鎚：両手。右手（上の手）は柄頭から 36%、左手はその 0.3 m 下
  lucerne:     { kind: 'hammer', length: 2.05, grip: 0.5, tris: 3000, tex: 512, error: 0.06, face: -1 },   // 長柄鎚：両手。右手（前の手）は真ん中、左手はその 0.7 m 後ろ。三つ又と嘴の長さがほぼ同じで見分けられないので、向きを決めて書く
  dagger:      { kind: 'sword', length: 0.40, grip: 0.45, tris: 2000, tex: 512, error: 0.06 },   // 短劍：片手
  kite_shield: { kind: 'shield', length: 0.9, tris: 3000, tex: 1024 },
};

const [srcDir, outDir, ...only] = process.argv.slice(2);   // only：名前を渡すと、その武器だけ作り直す
if (!srcDir || !outDir) { console.error('使い方: node process_weapons.mjs <元の模型のフォルダ> <出力フォルダ> [武器の名前…]'); process.exit(1); }
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** 頂点を読み出す */
function readPositions(prim) {
  const a = prim.getAttribute('POSITION'), n = a.getCount(), out = new Float64Array(n * 3), p = [0, 0, 0];
  for (let i = 0; i < n; i++) { a.getElement(i, p); out.set(p, i * 3); }
  return out;
}
const extent = (P, axis) => {
  let lo = Infinity, hi = -Infinity;
  for (let i = axis; i < P.length; i += 3) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); }
  return [lo, hi];
};
/** 長い軸に沿って輪切りにし、それぞれの幅（他の 2 軸の広がり）を測る */
function profile(P, axis, bins = 60) {
  const [lo, hi] = extent(P, axis);
  const o = [0, 1, 2].filter((k) => k !== axis);
  const w = Array.from({ length: bins }, () => ({ a: [Infinity, -Infinity], b: [Infinity, -Infinity] }));
  for (let i = 0; i < P.length; i += 3) {
    const k = Math.min(bins - 1, Math.floor(((P[i + axis] - lo) / (hi - lo)) * bins));
    const s = w[k];
    s.a[0] = Math.min(s.a[0], P[i + o[0]]); s.a[1] = Math.max(s.a[1], P[i + o[0]]);
    s.b[0] = Math.min(s.b[0], P[i + o[1]]); s.b[1] = Math.max(s.b[1], P[i + o[1]]);
  }
  return { lo, hi, o, slices: w.map((s) => ({ wa: s.a[1] - s.a[0], wb: s.b[1] - s.b[0] })) };
}

/**
 * 元の座標 → ゲームの座標 の変換（行列、列優先）を求める
 * 新しい軸 X, Y, Z が、元の座標でどの向きか（ex, ey, ez）と、原点にする元の点 o から作る
 */
function frame(ex, ey, ez, o, scale) {
  // 新しい座標 = scale * R^T (p - o)。R の列が ex, ey, ez
  const m = [
    ex[0], ey[0], ez[0], 0,
    ex[1], ey[1], ez[1], 0,
    ex[2], ey[2], ez[2], 0,
    0, 0, 0, 1,
  ];
  const t = [
    -(ex[0] * o[0] + ex[1] * o[1] + ex[2] * o[2]),
    -(ey[0] * o[0] + ey[1] * o[1] + ey[2] * o[2]),
    -(ez[0] * o[0] + ez[1] * o[1] + ez[2] * o[2]),
  ];
  for (let i = 0; i < 12; i++) m[i] *= scale;
  m[12] = t[0] * scale; m[13] = t[1] * scale; m[14] = t[2] * scale;
  return m;
}
const unit = (axis, sign = 1) => { const v = [0, 0, 0]; v[axis] = sign; return v; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function orient(id, opt, P) {
  const ext = [0, 1, 2].map((k) => extent(P, k));
  const size = ext.map(([lo, hi]) => hi - lo);
  const long = size.indexOf(Math.max(...size));
  const { lo, hi, o, slices } = profile(P, long);
  const L = hi - lo, bins = slices.length, at = (k) => lo + ((k + 0.5) / bins) * L;
  const mid = ext.map(([a, b]) => (a + b) / 2);

  if (opt.kind === 'sword') {
    const width = slices.map((s) => Math.max(s.wa, s.wb));
    const guard = width.indexOf(Math.max(...width));
    const toHilt = guard < bins / 2 ? -1 : 1;              // 柄の向き（元の長い軸の上で）
    const hiltEnd = toHilt < 0 ? lo : hi;
    const guardPos = at(guard);
    const gripPos = guardPos + (hiltEnd - guardPos) * opt.grip;
    const s = slices[guard];
    const wide = s.wa >= s.wb ? o[0] : o[1];               // 鍔が伸びる向き → X
    const ez = unit(long, toHilt);                          // 刃先は -Z、つまり +Z は柄の向き
    const ex = unit(wide, 1);
    const ey = cross(ez, ex);
    const origin = [...mid]; origin[long] = gripPos;
    return { m: frame(ex, ey, ez, origin, opt.length / L), note: `鍔 ${(guard / bins).toFixed(2)}` };
  }
  if (opt.kind === 'hammer') {
    const width = slices.map((s) => Math.max(s.wa, s.wb));
    const n = Math.round(bins * 0.2);
    const a = Math.max(...width.slice(0, n)), b = Math.max(...width.slice(bins - n));
    const toButt = a > b ? 1 : -1;                          // 太い方が頭。その反対が柄頭
    const buttEnd = toButt > 0 ? hi : lo;
    const gripPos = buttEnd - toButt * L * opt.grip;
    const hk = a > b ? width.indexOf(a) : bins - n + width.slice(bins - n).indexOf(b);   // 頭の一番広い輪切り
    const s = slices[hk];
    const wide = s.wa >= s.wb ? o[0] : o[1];
    // 柄の真ん中（長さの 3〜7 割の所の、広い向きの座標の平均）から、頭がどちら側へ長く出ているか：長い側が嘴、短い側が鎚の面
    const headLo = lo + (hk - 2) / bins * L, headHi = lo + (hk + 3) / bins * L;
    let shaft = 0, ns = 0, mn = Infinity, mx = -Infinity;
    for (let i = 0; i < P.length; i += 3) {
      const t = (P[i + long] - lo) / L;
      if (t > 0.3 && t < 0.7) { shaft += P[i + wide]; ns++; }
      if (P[i + long] >= headLo && P[i + long] <= headHi) { mn = Math.min(mn, P[i + wide]); mx = Math.max(mx, P[i + wide]); }
    }
    shaft /= Math.max(1, ns);
    let face = (mx - shaft) < (shaft - mn) ? 1 : -1;         // 短く出ている側を +X（鎚の面）
    if (opt.face) face *= opt.face;                           // 見分けられない物は、写して確かめて向きを書く
    const ez = unit(long, toButt), ex = unit(wide, face), ey = cross(ez, ex);
    const origin = [...mid]; origin[long] = gripPos; origin[wide] = shaft;
    return { m: frame(ex, ey, ez, origin, opt.length / L), note: `頭 ${a > b ? '始め' : '終わり'}側・鎚の面 ${face > 0 ? '+' : '-'}（+ ${(mx - shaft).toFixed(3)} / - ${(shaft - mn).toFixed(3)}）` };
  }
  if (opt.kind === 'spear') {
    const width = slices.map((s) => Math.max(s.wa, s.wb));
    const n = Math.round(bins * 0.2);
    const a = Math.max(...width.slice(0, n)), b = Math.max(...width.slice(bins - n));
    const toButt = a > b ? 1 : -1;                          // 太い方が穂先。その反対が石突き
    const buttEnd = toButt > 0 ? hi : lo;
    const gripPos = buttEnd - toButt * L * opt.grip;
    const s = slices[a > b ? width.indexOf(a) : bins - n + width.slice(bins - n).indexOf(b)];
    const wide = s.wa >= s.wb ? o[0] : o[1];
    const ez = unit(long, toButt), ex = unit(wide, 1), ey = cross(ez, ex);
    const origin = [...mid]; origin[long] = gripPos;
    return { m: frame(ex, ey, ez, origin, opt.length / L), note: `穂先 ${a > b ? '始め' : '終わり'}側` };
  }
  // 盾
  const thin = size.indexOf(Math.min(...size));
  const side = [0, 1, 2].find((k) => k !== thin && k !== long);
  const width = slices.map((s) => (o[0] === side ? s.wa : s.wb));
  const n = Math.round(bins * 0.25);
  const top = Math.max(...width.slice(0, n)) > Math.max(...width.slice(bins - n)) ? -1 : 1;  // 幅の広い側が上
  // 表：厚みの軸で、中心から遠くまで出ている側（ボスが出っ張る）
  const [tlo, thi] = ext[thin];
  let sum = 0;
  for (let i = thin; i < P.length; i += 3) sum += P[i];
  const meanT = sum / (P.length / 3);
  const front = (thi - meanT) > (meanT - tlo) ? 1 : -1;
  const ey = unit(long, top), ex = unit(thin, front), ez = cross(ex, ey);
  return { m: frame(ex, ey, ez, mid, opt.length / L), note: `上 ${top > 0 ? '+' : '-'} 表 ${front > 0 ? '+' : '-'}` };
}

await fs.mkdir(outDir, { recursive: true });
const meta = {};
const prev = JSON.parse(await fs.readFile(path.join(outDir, 'weapons.json'), 'utf8').catch(() => '{}'));
Object.assign(meta, prev);
for (const [id, opt] of Object.entries(WEAPONS)) {
  if (only.length && !only.includes(id)) continue;
  const file = path.join(srcDir, `${id}.glb`);
  const doc = await io.read(file);
  const root = doc.getRoot();
  await doc.transform(dequantize());
  // ノードの回転・拡大を頂点に焼き込み、1 つの形にする
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (mesh) transformMesh(mesh, node.getWorldMatrix());
  }
  for (const node of root.listNodes()) node.setMatrix(IDENTITY);
  const prim = root.listMeshes()[0].listPrimitives()[0];
  const P = readPositions(prim);
  const { m, note } = orient(id, opt, P);
  transformMesh(root.listMeshes()[0], m);

  const tris = () => prim.getIndices().getCount() / 3;
  const before = tris();
  if (tris() > opt.tris) await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: opt.tris / tris(), error: opt.error ?? 0.02, lockBorder: false }));
  // 質感の画像を小さくする
  for (const tex of root.listTextures()) {
    const img = tex.getImage();
    if (!img) continue;
    const out = await sharp(Buffer.from(img)).resize(opt.tex, opt.tex, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
    tex.setImage(new Uint8Array(out)).setMimeType('image/jpeg');
  }
  await doc.transform(prune(), dedup(), quantize({ pattern: /^(NORMAL|TEXCOORD_0)$/, quantizeNormal: 8, quantizeTexcoord: 12 }));
  for (const ext of root.listExtensionsUsed()) {
    if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();   // ゲーム側で展開しなくて済むように、圧縮せずに書く
  }
  const out = path.join(outDir, `${id}.glb`);
  await io.write(out, doc);
  const Q = readPositions(prim);
  const box = [0, 1, 2].map((k) => extent(Q, k).map((v) => +v.toFixed(3)));
  meta[id] = { kind: opt.kind, triangles: tris(), box };
  console.log(`${id}: ${before} → ${tris()} 三角形  ${note}  範囲 X${box[0]} Y${box[1]} Z${box[2]}  ${Math.round((await fs.stat(out)).size / 1024)}KB`);
}
await fs.writeFile(path.join(outDir, 'weapons.json'), JSON.stringify(meta, null, 2) + '\n');
