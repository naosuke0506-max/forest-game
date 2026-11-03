// Tripo AI で作った森の小物（倒木・キノコ・焚き火の跡）をゲーム用に軽くする（開発用の道具。ゲームには含まれない）
//
//   cd tools && npm ci
//   BLENDER=<blender の実行ファイル> node process_tripo_props.mjs ../source_models/props ../assets/props
//
// Tripo の模型は色の画像が細かい切れ端に分かれていて、普通に面を減らすと数千三角形より減らせない（減らしすぎると画像の貼り方が崩れる）。
// そこで Blender（props_blender/bake_prop.py）で、面を減らした形に新しく画像を貼り直し、元の模型の色を焼き付ける。
//   1. meshopt の圧縮を外した GLB を作る（Blender は圧縮された GLB を読めない）
//   2. Blender で：大きさ・向きをそろえ、面を減らし、UV を作り直して色を焼き付け、近く用・遠く用を書き出す
//   3. js/world/props.js が読む形（process_props.mjs と同じ）にそろえる：
//      <種類>/a_lod0.glb, a_lod1.glb       形だけ（底が y=0、横の真ん中が原点、実物の大きさ）
//      <種類>/<種類>_diff.webp             焼き付けた色
//      <種類>/<種類>_nor.webp, _arm.webp   平らな凹凸と、一定の粗さ（小さな画像）
//      props.json に、種類ごとの大きさと三角形の数を書き足す（ほかの種類はそのまま）
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

// size：一番長い辺を何 m にするか、align：細長い物の長い向きを前後（z）にそろえる（当たり判定を長さに沿わせるため）、
// lod0 / lod1：三角形の目標、tex：色の画像の大きさ、rough：粗さ（0〜1）
const PROPS = {
  fallen_log: { file: 'fallen_log.glb', size: 4.5, align: true, lod0: 1600, lod1: 300, tex: 1024, rough: 0.9 },
  mushrooms:  { file: 'mushrooms.glb', size: 0.35, lod0: 700, lod1: 240, tex: 512, rough: 0.6 },
  campfire:   { file: 'campfire.glb', size: 1.2, lod0: 1600, lod1: 450, tex: 512, rough: 0.9 },
};

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) { console.error('使い方: BLENDER=<blender> node process_tripo_props.mjs <元の模型のフォルダ> <出力フォルダ>'); process.exit(1); }
const BLENDER = process.env.BLENDER || 'blender';
const script = path.join(path.dirname(new URL(import.meta.url).pathname), 'props_blender', 'bake_prop.py');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tripo-props-'));

const metaPath = path.join(outDir, 'props.json');
const meta = JSON.parse(await fs.readFile(metaPath, 'utf8').catch(() => '{}'));
for (const [id, opt] of Object.entries(PROPS)) {
  // 1. 圧縮を外す
  const doc = await io.read(path.join(srcDir, opt.file));
  await doc.transform(dequantize());
  for (const e of doc.getRoot().listExtensionsUsed()) e.dispose();
  await doc.transform(prune());
  const plain = path.join(tmp, `${id}_src.glb`);
  await io.write(plain, doc);
  // 2. Blender で減らして焼き付ける
  execFileSync(BLENDER, ['-b', '--python', script, '--', plain, tmp, id, String(opt.size), opt.align ? '1' : '0',
    String(opt.lod0), String(opt.lod1), String(opt.tex)], { stdio: ['ignore', 'ignore', 'inherit'] });
  const info = JSON.parse(await fs.readFile(path.join(tmp, `${id}.json`), 'utf8'));
  // 3. ゲームの形にそろえる
  const dir = path.join(outDir, id);
  await fs.mkdir(dir, { recursive: true });
  for (const lod of ['lod0', 'lod1']) await fs.copyFile(path.join(tmp, `${id}_${lod}.glb`), path.join(dir, `a_${lod}.glb`));
  await sharp(path.join(tmp, `${id}_diff.png`)).webp({ quality: 85 }).toFile(path.join(dir, `${id}_diff.webp`));
  await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 128, g: 128, b: 255 } } }).webp({ lossless: true }).toFile(path.join(dir, `${id}_nor.webp`));
  await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 255, g: Math.round(opt.rough * 255), b: 0 } } }).webp({ lossless: true }).toFile(path.join(dir, `${id}_arm.webp`));
  meta[id] = { source: `tripo:${opt.file}`, alpha: false, variants: { a: { size: info.size, lod0Triangles: info.lod0Triangles, lod1Triangles: info.lod1Triangles } } };
  console.log(`${id}: lod0 ${info.lod0Triangles}  lod1 ${info.lod1Triangles}  size ${info.size.join('×')}m`);
}
await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n');
await fs.rm(tmp, { recursive: true, force: true });
