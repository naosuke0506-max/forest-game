// Blender で作った乗り物と給油機（tools/make_vehicles.py の書き出し）を、ゲーム用に軽くする（開発用の道具。ゲームには含まれない）
//
//   blender -b --python make_vehicles.py -- <作業用の場所>/vehicles.glb
//   cd tools && npm ci
//   node process_vehicles.mjs <作業用の場所>/vehicles.glb ../assets/village/vehicles.glb
//
// 同じ頂点をまとめ（weld）、位置と法線を小さな整数にする（KHR_mesh_quantization）。
// 部品（car_small など）の名前と、材質の名前（paint・glass など）はそのまま残す（ゲームの world/village-items.js が名前で読む）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, quantize, prune, dedup } from '@gltf-transform/functions';
import fs from 'node:fs/promises';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('使い方: node process_vehicles.mjs <Blender の書き出し.glb> <出力.glb>');
  process.exit(1);
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
await doc.transform(dedup(), weld(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizationVolume: 'mesh' }));
await io.write(out, doc);
const kb = Math.round((await fs.stat(out)).size / 1024);
let tris = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) tris += p.getIndices().getCount() / 3;
console.log(`${out}：${kb} KB・三角形 ${tris}`);
