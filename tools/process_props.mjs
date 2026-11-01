// Poly Haven（CC0）の模型を、ゲーム用に軽くする（開発用の道具。ゲームには含まれない）
//
//   python3 fetch_polyhaven_models.py <取り込み先>   … 先に取り込む
//   cd tools && npm ci
//   node process_props.mjs <取り込み先> ../assets/props
//
// 1 つの模型ファイルに入っている複数の形（草の株、岩のいくつか など）を「バリエーション」として取り出し、
// それぞれ近く用（lod0）と遠く用（lod1）の形を作る。質感画像は種類ごとに共有する：
//   <種類>/<バリエーション>_lod0.glb, _lod1.glb   形だけ
//   <種類>/<種類>_diff.webp   色（草・シダは透明部分つき：葉の形を切り抜く）
//   <種類>/<種類>_nor.webp    凹凸（法線）
//   <種類>/<種類>_arm.webp    R = 陰影（AO）、G = 粗さ
//   props.json                三角形の数・大きさなど
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, transformMesh, compactPrimitive, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

// far：遠く用に、別の小さな形を使う（草の株。透明な板は簡略化すると崩れるため）
// lod0 / lod1：三角形の目標（null は元のまま）
const PROPS = {
  grass: {
    src: 'grass_medium_01', alpha: true, tex: { diff: 1024, nor: 512, arm: 512 },
    variants: {
      tall_a: { node: 'grass_medium_01_tall_a_LOD0', far: 'grass_medium_01_tiny_a_LOD0' },
      tall_b: { node: 'grass_medium_01_tall_b_LOD0', far: 'grass_medium_01_tiny_e_LOD0' },
      tall_c: { node: 'grass_medium_01_tall_c_LOD0', far: 'grass_medium_01_tiny_f_LOD0' },
      small_b: { node: 'grass_medium_01_small_b_LOD0', far: 'grass_medium_01_tiny_a_LOD0' },
    },
  },
  fern: {
    src: 'fern_02', alpha: true, tex: { diff: 1024, nor: 512, arm: 512 },
    variants: {
      a: { node: 'fern_02_a', lod1: 300 },
      b: { node: 'fern_02_b', lod1: 500 },
      c: { node: 'fern_02_c', lod1: 500 },
      d: { node: 'fern_02_d', lod1: 300 },
    },
  },
  branches: {
    src: 'dry_branches_medium_01', alpha: false, tex: { diff: 512, nor: 512, arm: 512 },
    variants: {
      a: { node: 'dry_branches_medium_01_a', lod0: 1200, lod1: 250 },
      b: { node: 'dry_branches_medium_01_b', lod0: 1200, lod1: 250 },
      c: { node: 'dry_branches_medium_01_c', lod0: 1200, lod1: 250 },
    },
  },
  rock_large: {
    src: 'rock_moss_set_01', alpha: false, tex: { diff: 1024, nor: 512, arm: 512 },
    variants: {
      r1: { node: 'rock_moss_set_01_rock01', lod0: 1800, lod1: 350 },
      r2: { node: 'rock_moss_set_01_rock02', lod0: 1800, lod1: 350 },
      r3: { node: 'rock_moss_set_01_rock03', lod0: 1800, lod1: 350 },
      r5: { node: 'rock_moss_set_01_rock05', lod0: 1800, lod1: 350 },
    },
  },
  rock_medium: {
    src: 'rock_moss_set_02', alpha: false, tex: { diff: 1024, nor: 512, arm: 512 },
    variants: {
      r8: { node: 'rock_moss_set_02_rock08', lod0: 1200, lod1: 250 },
      r9: { node: 'rock_moss_set_02_rock09', lod0: 1200, lod1: 250 },
      r10: { node: 'rock_moss_set_02_rock10', lod0: 1200, lod1: 250 },
      r12: { node: 'rock_moss_set_02_rock12', lod0: 1200, lod1: 250 },
    },
  },
  stump: {
    src: 'tree_stump_01', alpha: false, tex: { diff: 1024, nor: 512, arm: 512 },
    variants: {
      a: { node: 'tree_stump_01', lod0: 2500, lod1: 500 },
    },
  },
};

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error('使い方: node process_props.mjs <取り込み先> <出力フォルダ>');
  process.exit(1);
}
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const texPath = (src, kind) => path.join(srcDir, src, 'textures', `${src}_${kind}_1k.${kind === 'alpha' ? 'png' : 'jpg'}`);
const exists = async (p) => fs.access(p).then(() => true, () => false);

/** 質感画像を作る（種類ごとに 1 組） */
async function makeTextures(id, opt, dir) {
  const { src, tex } = opt;
  // 色（透明部分つきの種類は、Alpha の画像を 4 つ目の色として足す）
  // ※ 元の色の画像は JPG（透明部分なし）。removeAlpha() を書くと、sharp は joinChannel の後に実行してしまい、
  //   足した透明部分が消える（処理は書いた順ではなく決まった順で実行される）ので使わない
  let diff = sharp(texPath(src, 'diff')).resize(tex.diff, tex.diff);
  if (opt.alpha) {
    // 透明部分の画像（白 = 葉）。Poly Haven の PNG は 16 ビットの白黒なので、8 ビットの白黒に直してから使う
    const alpha = await sharp(texPath(src, 'alpha')).resize(tex.diff, tex.diff).toColourspace('b-w').extractChannel(0).raw({ depth: 'uchar' }).toBuffer();
    if (alpha.length !== tex.diff * tex.diff) throw new Error(`透明部分の画像の大きさが合いません: ${alpha.length}`);
    diff = diff.joinChannel(alpha, { raw: { width: tex.diff, height: tex.diff, channels: 1 } });
  }
  await diff.webp({ quality: 85, alphaQuality: 90 }).toFile(path.join(dir, `${id}_diff.webp`));
  await sharp(texPath(src, 'nor_gl')).resize(tex.nor, tex.nor).webp({ quality: 88 }).toFile(path.join(dir, `${id}_nor.webp`));
  // 陰影と粗さ：ARM が無い模型（岩のセット）は、粗さの画像から作る（R = 陰影なし、G = 粗さ）
  if (await exists(texPath(src, 'arm'))) {
    await sharp(texPath(src, 'arm')).resize(tex.arm, tex.arm).webp({ quality: 85 }).toFile(path.join(dir, `${id}_arm.webp`));
  } else {
    const rough = await sharp(texPath(src, 'rough')).resize(tex.arm, tex.arm).greyscale().raw().toBuffer();
    const arm = Buffer.alloc(tex.arm * tex.arm * 3);
    for (let i = 0; i < rough.length; i++) { arm[i * 3] = 255; arm[i * 3 + 1] = rough[i]; arm[i * 3 + 2] = 0; }
    await sharp(arm, { raw: { width: tex.arm, height: tex.arm, channels: 3 } }).webp({ quality: 85 }).toFile(path.join(dir, `${id}_arm.webp`));
  }
}

/** 指定した名前のノードの形だけを取り出し、根元を原点にそろえて、目標の三角形数まで減らした文書を作る */
async function extract(src, nodeName, target) {
  const doc = await io.read(path.join(srcDir, src, `${src}_1k.gltf`));
  const root = doc.getRoot();
  const keep = root.listNodes().find((n) => n.getName() === nodeName);
  if (!keep) throw new Error(`ノードがありません: ${src} / ${nodeName}`);
  const mesh = keep.getMesh();
  transformMesh(mesh, keep.getWorldMatrix()); // 回転・拡大を頂点に焼き込む（位置は下でそろえ直す）
  for (const n of root.listNodes()) { if (n !== keep) n.dispose(); }
  keep.setMatrix(IDENTITY);
  for (const s of root.listScenes()) { s.listChildren().forEach((c) => s.removeChild(c)); s.addChild(keep); }

  // 1 つの形に複数のプリミティブがあれば、最初のものだけ（Poly Haven の模型は 1 つずつ）
  const prims = mesh.listPrimitives();
  for (const p of prims.slice(1)) p.dispose();
  const prim = prims[0];
  const pos = prim.getAttribute('POSITION');
  const p = [0, 0, 0];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, p);
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, p);
    pos.setElement(i, [p[0] - cx, p[1] - minY, p[2] - cz]);
  }

  // 面を減らす：まず形を保つ簡略化、届かなければ大まかな簡略化（sloppy）
  const tris = () => prim.getIndices().getCount() / 3;
  if (target && tris() > target) {
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: target / tris(), error: 0.03, lockBorder: false }));
    if (tris() > target * 1.6) {
      const positions = new Float32Array(prim.getAttribute('POSITION').getArray());
      const [out] = MeshoptSimplifier.simplifySloppy(new Uint32Array(prim.getIndices().getArray()), positions, 3, null, target * 3, 0.2);
      prim.getIndices().setArray(prim.getAttribute('POSITION').getCount() > 65535 ? out : new Uint16Array(out));
      compactPrimitive(prim);
    }
  }

  // 形だけを残す（質感画像は種類ごとに別ファイルで共有）
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  await doc.transform(prune(), dedup());
  await doc.transform(quantize({ pattern: /^(NORMAL|TEXCOORD_0)$/, quantizeNormal: 8, quantizeTexcoord: 12 }));

  const outPrim = root.listMeshes()[0].listPrimitives()[0];
  return {
    doc,
    triangles: outPrim.getIndices().getCount() / 3,
    size: [+(maxX - minX).toFixed(3), +(maxY - minY).toFixed(3), +(maxZ - minZ).toFixed(3)],
  };
}

await fs.mkdir(outDir, { recursive: true });
const meta = {};
for (const [id, opt] of Object.entries(PROPS)) {
  const dir = path.join(outDir, id);
  await fs.mkdir(dir, { recursive: true });
  await makeTextures(id, opt, dir);
  meta[id] = { source: opt.src, alpha: opt.alpha, variants: {} };
  for (const [vname, v] of Object.entries(opt.variants)) {
    const near = await extract(opt.src, v.node, v.lod0 ?? null);
    await io.write(path.join(dir, `${vname}_lod0.glb`), near.doc);
    const far = v.far ? await extract(opt.src, v.far, null) : await extract(opt.src, v.node, v.lod1);
    await io.write(path.join(dir, `${vname}_lod1.glb`), far.doc);
    meta[id].variants[vname] = { size: near.size, lod0Triangles: near.triangles, lod1Triangles: far.triangles };
    console.log(`${id}/${vname}: lod0 ${near.triangles}  lod1 ${far.triangles}  size ${near.size.join('×')}m`);
  }
}
await fs.writeFile(path.join(outDir, 'props.json'), JSON.stringify(meta, null, 2) + '\n');

let total = 0;
for (const id of Object.keys(PROPS)) {
  for (const f of await fs.readdir(path.join(outDir, id))) total += (await fs.stat(path.join(outDir, id, f))).size;
}
console.log(`合計 ${Math.round(total / 1024)}KB`);
