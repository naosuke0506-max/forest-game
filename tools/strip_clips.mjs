// 模型（GLB）から、名前で指定した動き（アニメーション）を外す。Blender で作り直さずに、使わなくなった動きだけを消すための道具。
//   cd tools && node strip_clips.mjs ../assets/characters/archer.glb ma1 ma2 ma3
// 模型の横の <名前>.json（動きの長さの一覧）からも同じ名前を消す。ほかの中身（形・骨・質感・ほかの動き）は変えない
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import fs from 'node:fs';

const [file, ...names] = process.argv.slice(2);
if (!file || !names.length) { console.error('使い方：node strip_clips.mjs <模型.glb> <動きの名前> ...'); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const root = doc.getRoot();
const before = { anims: root.listAnimations().length, accessors: root.listAccessors().length, size: fs.statSync(file).size };
let removed = 0;
for (const a of root.listAnimations()) {
  if (!names.includes(a.getName())) continue;
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
  removed++;
}
// 使われなくなった数値の列（アクセサ）だけを消す。骨や付け根の点（socket）は消さない
await doc.transform(prune({ propertyTypes: [PropertyType.ACCESSOR], keepLeaves: true, keepAttributes: true }));
await io.write(file, doc);
const jsonPath = file.replace(/\.glb$/, '.json');
if (fs.existsSync(jsonPath)) {
  // 文字のまま消す（書き方を変えない。0.0 が 0 になるなどの余計な差を出さないため）。うまく消せなかったら、読んで書き直す
  let text = fs.readFileSync(jsonPath, 'utf8');
  for (const n of names) text = text.replace(new RegExp(`\\n\\s*"${n}": \\{[^}]*\\},?`), '');
  try { JSON.parse(text); } catch {
    const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    for (const n of names) delete j.clips?.[n];
    text = JSON.stringify(j, null, 1);
  }
  fs.writeFileSync(jsonPath, text);
}
console.log(`外した動き ${removed} / ${names.length}。動き ${before.anims} → ${root.listAnimations().length}、数値の列 ${before.accessors} → ${root.listAccessors().length}、大きさ ${before.size} → ${fs.statSync(file).size} バイト`);
