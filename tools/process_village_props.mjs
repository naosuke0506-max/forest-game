// 村の小物（② 村の暮らしの物。2026-11-21。Poly Haven, CC0）を、ゲーム用に軽くする（開発用の道具。ゲームには含まれない）
//   作りは大廳の小物（process_hall_props.mjs）と同じ。村には同じ物をたくさん置くので、三角形は少なめにする
//
//   python3 fetch_polyhaven_modern.py <取り込み先>   … 先に取り込む
//   cd tools && npm ci
//   node process_village_props.mjs <取り込み先> ../assets/village
//
// 模型ごとに 1 つの GLB にする：部品の位置を頂点に焼き込み、同じ質感の部品をまとめ、三角形を目標まで減らし、
// 質感画像を小さな WebP にして中に入れる（EXT_texture_webp）。法線と UV は小さな整数にして軽くする。
// village.json に三角形の数と大きさ（床からの高さ・幅）を書く
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, join, weld, simplify, prune, dedup, textureCompress, quantize, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

// target：三角形の目標（全体）。tex：色・凹凸の画像の一辺、arm：陰影と粗さの画像の一辺。error：減らすときに許す形のずれ（無ければ 0.02）
const PROPS = {
  metal_trash_can: { target: 700, tex: 256, arm: 128, keep: /^metal_trash_can(?!_rust)/, shift: [-0.5, 0, 0] },   // 中にきれいな物と錆びた物。きれいな方（蓋・取っ手ごと）
  trashbag: { target: 500, tex: 256, arm: 128 },
  exterior_aircon_unit: { target: 900, tex: 256, arm: 128, keep: /^exterior_aircon_unit$/, shift: [0.5, 0, 0] },   // 中に 2 台（きれいな物と錆びた物）。きれいな方だけ
  propane_tank: { target: 600, tex: 256, arm: 128 },
  wooden_picnic_table: { target: 900, tex: 512, arm: 256 },
  plastic_monobloc_chair_01: { target: 700, tex: 256, arm: 128 },
  planter_box_01: { target: 900, tex: 256, arm: 128 },
  old_tyre: { target: 600, tex: 256, arm: 128 },
  metal_jerrycan: { target: 500, tex: 256, arm: 128 },
  covered_car: { target: 3000, tex: 512, arm: 256 },
  // 家の中（③ 家の中と人が消えた直後。2026-11-21）
  electric_stove: { target: 1200, tex: 256, arm: 128, error: 0.06 },   // 部品が多く、誤差 0.02 では 2600 までしか減らない
  wall_clock: { target: 600, tex: 256, arm: 128 },
  hanging_picture_frame_02: { target: 300, tex: 256, arm: 128 },
  fancy_picture_frame_01: { target: 600, tex: 512, arm: 128 },
  painted_wooden_chair_01: { target: 724, tex: 256, arm: 128 },
  mid_century_lounge_chair: { target: 1500, tex: 256, arm: 128 },
  modern_ceiling_lamp_01: { target: 700, tex: 256, arm: 128 },
  food_apple_01: { target: 250, tex: 128, arm: 64 },
  croissant: { target: 300, tex: 256, arm: 128 },
  jug_01: { target: 500, tex: 256, arm: 128 },
  ceramic_vase_01: { target: 400, tex: 256, arm: 128, error: 0.06 },
};

const [srcDir, outDir, onlyArg] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error('使い方: node process_village_props.mjs <取り込み先> <出力フォルダ> [名前,名前…（この物だけ作り直す）]');
  process.exit(1);
}
const only = onlyArg ? new Set(onlyArg.split(',')) : null;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await fs.mkdir(outDir, { recursive: true });

const tris = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + p.getIndices().getCount() / 3, 0), 0);
// 前に作った物の記録は残し、作り直した物だけ書き換える
let meta = {};
try { meta = JSON.parse(await fs.readFile(path.join(outDir, 'village.json'), 'utf8')); } catch { meta = {}; }
for (const [id, opt] of Object.entries(PROPS)) {
  if (only && !only.has(id)) continue;
  const doc = await io.read(path.join(srcDir, id, `${id}_1k.gltf`));
  // keep：名前が合う部品だけを残し、shift だけずらして真ん中へ寄せる（1 つのファイルに型違いが並んでいる物）
  if (opt.keep) {
    for (const node of doc.getRoot().listNodes()) {
      if (!opt.keep.test(node.getName())) { if (node.getMesh()) node.dispose(); continue; }
      if (opt.shift && !node.getParentNode()) { const t = node.getTranslation(); node.setTranslation([t[0] + opt.shift[0], t[1] + opt.shift[1], t[2] + opt.shift[2]]); }
    }
    await doc.transform(prune());
  }
  const before = tris(doc);
  // 部品の位置を焼き込み、同じ質感の部品を 1 つにまとめる
  await doc.transform(flatten(), join({ keepNamed: false }), weld());
  if (before > opt.target) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: opt.target / tris(doc), error: opt.error ?? 0.02, lockBorder: false }));
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
await fs.writeFile(path.join(outDir, 'village.json'), JSON.stringify(meta, null, 2) + '\n');
