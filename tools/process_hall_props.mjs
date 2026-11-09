// 大廳の小物（Poly Haven, CC0）を、ゲーム用に軽くする（開発用の道具。ゲームには含まれない）
//
//   python3 fetch_polyhaven_hall.py <取り込み先>   … 先に取り込む
//   cd tools && npm ci
//   node process_hall_props.mjs <取り込み先> ../assets/hall
//
// 模型ごとに 1 つの GLB にする：部品の位置を頂点に焼き込み、同じ質感の部品をまとめ、三角形を目標まで減らし、
// 質感画像を小さな WebP にして中に入れる（EXT_texture_webp）。法線と UV は小さな整数にして軽くする。
// hall.json に三角形の数と大きさ（床からの高さ・幅）を書く
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, join, weld, simplify, prune, dedup, textureCompress, quantize, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

// target：三角形の目標（全体）。tex：色・凹凸の画像の一辺、arm：陰影と粗さの画像の一辺
const PROPS = {
  wine_barrel_01: { target: 2400, tex: 512, arm: 256 },
  WoodenTable_01: { target: 952, tex: 512, arm: 256 },
  treasure_chest: { target: 6000, tex: 512, arm: 256 },
  kite_shield: { target: 2600, tex: 512, arm: 256 },
  brass_goblets: { target: 1800, tex: 256, arm: 128 },
  wooden_candlestick: { target: 900, tex: 256, arm: 128 },
  wooden_lantern_01: { target: 2400, tex: 256, arm: 128 },
  wooden_stool_02: { target: 1600, tex: 512, arm: 256 },
};

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error('使い方: node process_hall_props.mjs <取り込み先> <出力フォルダ>');
  process.exit(1);
}
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await fs.mkdir(outDir, { recursive: true });

const tris = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + p.getIndices().getCount() / 3, 0), 0);
const meta = {};
for (const [id, opt] of Object.entries(PROPS)) {
  const doc = await io.read(path.join(srcDir, id, `${id}_1k.gltf`));
  const before = tris(doc);
  // 部品の位置を焼き込み、同じ質感の部品を 1 つにまとめる
  await doc.transform(flatten(), join({ keepNamed: false }), weld());
  if (before > opt.target) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: opt.target / tris(doc), error: 0.02, lockBorder: false }));
  }
  // 質感画像：色と凹凸は opt.tex、陰影・粗さ（ARM）は opt.arm の WebP に
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [opt.tex, opt.tex], quality: 84, slots: /^(baseColorTexture|normalTexture)$/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [opt.arm, opt.arm], quality: 84, slots: /^(occlusionTexture|metallicRoughnessTexture)$/ }),
    quantize({ pattern: /^(NORMAL|TEXCOORD_0)$/, quantizeNormal: 8, quantizeTexcoord: 12 }),
    prune(), dedup(),
  );
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  const file = path.join(outDir, `${id}.glb`);
  await io.write(file, doc);
  const size = (await fs.stat(file)).size;
  meta[id] = {
    tris: Math.round(tris(doc)),
    min: b.min.map((v) => +v.toFixed(3)), max: b.max.map((v) => +v.toFixed(3)),
    materials: doc.getRoot().listMaterials().map((m) => m.getName()),
    kb: Math.round(size / 1024),
  };
  console.log(`${id}: 三角形 ${before} → ${meta[id].tris}  ${meta[id].kb}KB  大きさ ${meta[id].min} 〜 ${meta[id].max}`);
}
await fs.writeFile(path.join(outDir, 'hall.json'), JSON.stringify(meta, null, 2) + '\n');
