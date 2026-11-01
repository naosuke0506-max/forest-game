// 木の 3D モデル（Tripo AI の GLB）を、ゲーム用に軽くする（開発用の道具。ゲームには含まれない）
//
//   cd tools && npm ci
//   node process_trees.mjs <元の GLB があるフォルダ> ../assets/trees
//
// 元の GLB は <フォルダ>/<名前>.glb（名前は下の TREES の key）。1 本ごとに次を作る：
//   <名前>_lod0.glb   近く用：形だけ（約 6,000 三角形）
//   <名前>_lod1.glb   遠く用：形だけ（約 1,200 三角形）
//   <名前>_color.webp 色の画像（1024px、近く用と遠く用で共有）
//   trees.json        高さ・幹の太さ・葉の広がり・三角形の数など
//
// していること：圧縮（meshopt）と量子化を解く → 実際の高さ（m）に合わせて根元を原点へ →
// 頂点をつなぎ直して面を減らす（形と UV の境目を保つ）→ 色の画像を縮めて WebP に
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, weld, simplify, prune, dedup, transformMesh, compactPrimitive, quantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

// 名前：実際の高さ（m）と、近く用・遠く用の三角形の目標
const TREES = {
  fir:       { height: 15.0, lod0: 6000, lod1: 1200 },
  red_pine:  { height: 16.0, lod0: 6000, lod1: 1200 },
  broadleaf: { height: 12.0, lod0: 6500, lod1: 1300 },
  birch:     { height: 13.0, lod0: 5500, lod1: 1100 },
  dead:      { height: 10.0, lod0: 5000, lod1: 1000 },
  sapling:   { height: 2.4,  lod0: 2500, lod1: 600, lod0Sloppy: true }, // 小さい木は近く用も大まかでよい
};
const TEXTURE_SIZE = 1024;

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

  // 色の画像を取り出して縮める
  const base = await io.read(src);
  const texture = base.getRoot().listTextures()[0];
  if (texture) {
    await sharp(Buffer.from(texture.getImage()))
      .resize(TEXTURE_SIZE, TEXTURE_SIZE)
      .webp({ quality: 82 })
      .toFile(path.join(outDir, `${name}_color.webp`));
  }

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
      // 幹の太さ：高さ 0.3〜1.5m の頂点の、中心からの距離の 15 パーセンタイル（当たり判定に使う）
      //   （低い枝のある木では、その高さに枝の頂点も混ざるので、内側の値を取る）
      // 葉の広がり：全頂点の水平距離の 95 パーセンタイル（木どうしの間隔に使う）
      const trunk = [], all = [];
      for (let i = 0; i < outPos.getCount(); i++) {
        outPos.getElement(i, p);
        const r = Math.hypot(p[0], p[2]);
        all.push(r);
        if (p[1] > 0.3 && p[1] < 1.5) trunk.push(r);
      }
      trunk.sort((a, b) => a - b);
      all.sort((a, b) => a - b);
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
