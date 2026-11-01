// 木の 3D モデル（Tripo AI の GLB）を、ゲーム用に軽くする（開発用の道具。ゲームには含まれない）
//
//   cd tools && npm ci
//   node process_trees.mjs <元の GLB があるフォルダ> ../assets/trees
//
// 元の GLB は <フォルダ>/<名前>.glb（名前は下の TREES の key）。1 本ごとに次を作る：
//   <名前>_lod0.glb   近く用：形だけ（約 6,000 三角形）
//   <名前>_lod1.glb   遠く用：形だけ（約 1,200 三角形）
//   <名前>_color.webp 色の画像（1024px、近く用と遠く用で共有）
//   trees.json        高さ・幹の太さ・根の張り出し・葉の広がり・三角形の数など
//
// していること：圧縮（meshopt）と量子化を解く → 実際の高さ（m）に合わせて根元を原点へ →
// 面を減らす → 葉の向き（法線）を葉のかたまりの外向きにそろえる → 色の画像を縮め、葉の色を落ち着かせて WebP に
//
// 葉と幹の見分け：色の画像の、その頂点の場所の色が「緑〜黄緑で、灰色でない」なら葉
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, weld, simplify, prune, dedup, transformMesh, compactPrimitive, quantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

// 名前：実際の高さ（m）と、近く用・遠く用の三角形の目標
// leafSat：葉の色の鮮やかさの倍率（AI の葉の色は派手になりがちなので、少し落ち着かせる）
const TREES = {
  fir:       { height: 15.0, lod0: 6000, lod1: 1200, leafSat: 0.88 },
  red_pine:  { height: 16.0, lod0: 6000, lod1: 1200, leafSat: 0.88 },
  broadleaf: { height: 12.0, lod0: 6500, lod1: 1300, leafSat: 0.72 },
  birch:     { height: 13.0, lod0: 5500, lod1: 1100, leafSat: 0.85 },
  dead:      { height: 10.0, lod0: 5000, lod1: 1000, leafSat: 1.0 },
  sapling:   { height: 2.4,  lod0: 2500, lod1: 600, leafSat: 0.88, lod0Sloppy: true }, // 小さい木は近く用も大まかでよい
};
const TEXTURE_SIZE = 1024;
const LEAF_NORMAL_BEND = 0.7; // 葉の法線を、かたまりの外向きにどれだけ寄せるか（0〜1）

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}
const isLeafColor = (r, g, b) => {
  const [h, sat] = rgbToHsv(r, g, b);
  return h >= 50 && h <= 170 && sat >= 0.22;
};

function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error('使い方: node process_trees.mjs <元の GLB があるフォルダ> <出力フォルダ>');
  process.exit(1);
}

await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

await fs.mkdir(outDir, { recursive: true });
const meta = {};

for (const [name, opt] of Object.entries(TREES)) {
  const src = path.join(srcDir, `${name}.glb`);
  try { await fs.access(src); } catch { console.log(`（なし）${src}`); continue; }

  // 色の画像を取り出して縮め、葉の色を落ち着かせる。縮めた画像は、葉の見分けにも使う
  const base = await io.read(src);
  const texture = base.getRoot().listTextures()[0];
  const tex = await sharp(Buffer.from(texture.getImage()))
    .resize(TEXTURE_SIZE, TEXTURE_SIZE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const leafAt = (u, v) => {
    const x = Math.min(tex.info.width - 1, Math.max(0, Math.floor(u * tex.info.width)));
    const y = Math.min(tex.info.height - 1, Math.max(0, Math.floor(v * tex.info.height)));
    const k = (y * tex.info.width + x) * 3;
    return isLeafColor(tex.data[k], tex.data[k + 1], tex.data[k + 2]);
  };
  const graded = Buffer.from(tex.data);
  for (let k = 0; k < graded.length; k += 3) {
    const r = graded[k], g = graded[k + 1], b = graded[k + 2];
    if (!isLeafColor(r, g, b)) continue;
    const [h, sat, val] = rgbToHsv(r, g, b);
    const out = hsvToRgb(h, sat * opt.leafSat, val * (0.94 + 0.06 * opt.leafSat));
    graded[k] = out[0]; graded[k + 1] = out[1]; graded[k + 2] = out[2];
  }
  await sharp(graded, { raw: { width: tex.info.width, height: tex.info.height, channels: 3 } })
    .webp({ quality: 82 })
    .toFile(path.join(outDir, `${name}_color.webp`));

  const info = {};
  for (const [lod, target] of [['lod0', opt.lod0], ['lod1', opt.lod1]]) {
    const doc = await io.read(src);
    const root = doc.getRoot();
    // 圧縮・量子化を解き、ノードの変換を頂点に焼き込む
    await doc.transform(dequantize());
    for (const ext of root.listExtensionsUsed()) {
      if (['EXT_meshopt_compression', 'KHR_mesh_quantization'].includes(ext.extensionName)) ext.dispose();
    }
    const node = root.listNodes().find((n) => n.getMesh());
    const mesh = node.getMesh();
    transformMesh(mesh, node.getWorldMatrix());
    const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const n of root.listNodes()) n.setMatrix(IDENTITY);

    // 大きさをそろえる：根元（いちばん下）を y = 0、幹の中心を x = z = 0、高さを opt.height に
    const prim = mesh.listPrimitives()[0];
    const pos = prim.getAttribute('POSITION');
    let minY = Infinity, maxY = -Infinity;
    const p = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, p); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    // 幹の中心：下から 5% の高さまでの頂点の平均
    let cx = 0, cz = 0, cn = 0;
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, p);
      if (p[1] < minY + (maxY - minY) * 0.05) { cx += p[0]; cz += p[2]; cn++; }
    }
    cx /= cn; cz /= cn;
    const s = opt.height / (maxY - minY);
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, p);
      pos.setElement(i, [(p[0] - cx) * s, (p[1] - minY) * s, (p[2] - cz) * s]);
    }

    // 面を減らす。Tripo の木は、葉が何千もの小さな「島」（つながっていない板）でできているため、
    //   近く用：ふつうの簡略化（形を保つ。島どうしはつなげないので、減らせる所まで）
    //   遠く用：近い頂点をまとめる大まかな簡略化（sloppy。島も含めて目標の数まで減らせる）
    const tris = (prim.getIndices() ? prim.getIndices().getCount() : pos.getCount()) / 3;
    if (lod === 'lod0' && !opt.lod0Sloppy) {
      await doc.transform(
        weld(),
        simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / tris), error: 0.05, lockBorder: false }),
      );
    } else {
      await doc.transform(weld());
      const positions = new Float32Array(prim.getAttribute('POSITION').getArray());
      const indices = new Uint32Array(prim.getIndices().getArray());
      const [out] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, Math.min(indices.length, target * 3), 0.2);
      prim.getIndices().setArray(prim.getAttribute('POSITION').getCount() > 65535 ? out : new Uint16Array(out));
      compactPrimitive(prim); // 使わなくなった頂点を捨てる
    }

    // 葉の向きをそろえる：葉の頂点の法線を、葉のかたまり（だ円体）の外向きに寄せる。
    // 何千枚もの板がばらばらの向きで光を受けて紙のように見えるのを、丸い立体の明暗にする
    {
      const pr = root.listMeshes()[0].listPrimitives()[0];
      const P = pr.getAttribute('POSITION'), N = pr.getAttribute('NORMAL'), T = pr.getAttribute('TEXCOORD_0');
      const q = [0, 0, 0], nn = [0, 0, 0], tt = [0, 0];
      const leaf = new Uint8Array(P.getCount());
      let cy = 0, cnt = 0;
      for (let i = 0; i < P.getCount(); i++) {
        T.getElement(i, tt);
        if (leafAt(tt[0], tt[1])) { leaf[i] = 1; P.getElement(i, q); cy += q[1]; cnt++; }
      }
      if (cnt > 50) {
        cy /= cnt;
        const ax = [], ay = [], az = [];
        for (let i = 0; i < P.getCount(); i++) {
          if (!leaf[i]) continue;
          P.getElement(i, q);
          ax.push(Math.abs(q[0])); ay.push(Math.abs(q[1] - cy)); az.push(Math.abs(q[2]));
        }
        const p90 = (a) => { a.sort((x, y) => x - y); return Math.max(0.05, a[Math.floor(a.length * 0.9)]); };
        const rx = p90(ax), ry = p90(ay), rz = p90(az);
        for (let i = 0; i < P.getCount(); i++) {
          if (!leaf[i]) continue;
          P.getElement(i, q); N.getElement(i, nn);
          let dx = q[0] / rx, dy = (q[1] - cy) / ry, dz = q[2] / rz;
          const dl = Math.hypot(dx, dy, dz) || 1;
          dx /= dl; dy /= dl; dz /= dl;
          let x = nn[0] + (dx - nn[0]) * LEAF_NORMAL_BEND, y = nn[1] + (dy - nn[1]) * LEAF_NORMAL_BEND, z = nn[2] + (dz - nn[2]) * LEAF_NORMAL_BEND;
          const l = Math.hypot(x, y, z) || 1;
          N.setElement(i, [x / l, y / l, z / l]);
        }
      }
    }

    // 形だけを残す（質感画像は別ファイルで共有するので外す）
    for (const m of root.listMaterials()) m.dispose();
    for (const t of root.listTextures()) t.dispose();
    await doc.transform(prune(), dedup());
    // 法線と UV だけを小さな整数にしてファイルを軽くする。
    // 位置は小数のまま（位置を量子化するとノード側に拡大・移動が付き、ゲームの読み込み方と合わなくなる）
    await doc.transform(quantize({ pattern: /^(NORMAL|TEXCOORD_0)$/, quantizeNormal: 8, quantizeTexcoord: 12 }));

    const outPrim = root.listMeshes()[0].listPrimitives()[0];
    const outPos = outPrim.getAttribute('POSITION');
    const outTris = outPrim.getIndices().getCount() / 3;

    if (lod === 'lod0') {
      // 幹の太さ：高さ 0.3〜1.5m の樹皮の頂点の、中心からの距離の 15 パーセンタイル（当たり判定に使う）
      // 葉の広がり：全頂点の水平距離の 95 パーセンタイル（木どうしの間隔に使う）
      // 根の張り出し：高さ 35cm までの頂点の水平距離の 90 パーセンタイル（坂で根が浮かないよう沈める量の計算に使う）
      const trunk = [], all = [], roots = [];
      const outUv = outPrim.getAttribute('TEXCOORD_0');
      const tuv = [0, 0];
      for (let i = 0; i < outPos.getCount(); i++) {
        outPos.getElement(i, p);
        outUv.getElement(i, tuv);
        const r = Math.hypot(p[0], p[2]);
        all.push(r);
        // 幹の太さは、葉ではない頂点（樹皮）だけで測る（低い枝の葉を数えないように）
        if (p[1] > 0.3 && p[1] < 1.5 && !leafAt(tuv[0], tuv[1])) trunk.push(r);
        if (p[1] < 0.35) roots.push(r);
      }
      trunk.sort((a, b) => a - b);
      all.sort((a, b) => a - b);
      roots.sort((a, b) => a - b);
      info.rootRadius = +(roots.length ? roots[Math.floor(roots.length * 0.9)] : 0.3).toFixed(3);
      // 根が幹に合流する高さ：樹皮の頂点を 10cm ごとの輪切りにし、広がり（90 パーセンタイル）が
      // 幹の太さの 1.8 倍以下になる、いちばん低い高さ。タコ足のように下へ伸びる根の木は高くなる
      {
        const slices = new Map();
        for (let i = 0; i < outPos.getCount(); i++) {
          outPos.getElement(i, p);
          outUv.getElement(i, tuv);
          if (p[1] > opt.height * 0.25 || leafAt(tuv[0], tuv[1])) continue;
          const k = Math.floor(p[1] / 0.1);
          if (!slices.has(k)) slices.set(k, []);
          slices.get(k).push(Math.hypot(p[0], p[2]));
        }
        const trunkR = trunk.length ? trunk[Math.floor(trunk.length * 0.15)] : 0.2;
        let junction = 0;
        for (const k of [...slices.keys()].sort((a, b) => a - b)) {
          const a = slices.get(k).sort((x, y) => x - y);
          if (a.length >= 4 && a[Math.floor(a.length * 0.9)] <= trunkR * 1.8) { junction = k * 0.1; break; }
        }
        info.rootJunction = +junction.toFixed(2);
      }
      info.height = opt.height;
      info.trunkRadius = +(trunk.length ? trunk[Math.floor(trunk.length * 0.15)] : 0.2).toFixed(3);
      info.crownRadius = +all[Math.floor(all.length * 0.95)].toFixed(3);
    }
    info[`${lod}Triangles`] = outTris;

    await io.write(path.join(outDir, `${name}_${lod}.glb`), doc);
  }
  meta[name] = info;
  console.log(name, JSON.stringify(info));
}

await fs.writeFile(path.join(outDir, 'trees.json'), JSON.stringify(meta, null, 2) + '\n');
for (const f of (await fs.readdir(outDir)).sort()) {
  const st = await fs.stat(path.join(outDir, f));
  console.log(`${f}  ${Math.round(st.size / 1024)}KB`);
}
