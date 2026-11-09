// 武器と盾の見た目。
// Tripo AI の模型（assets/weapons/。tools/process_weapons.mjs で向きをそろえたもの）があればそれを使い、
// 無い武器（メイス・弓など）は、箱・円柱・球の組み合わせの仮の形で作る。
// どちらも持ち手（手の位置）を原点にする。剣・メイス・槍は -Z の向きへ伸び、弓は Z の向きに立つ
import * as pc from 'playcanvas';
import { BUILD } from '../version.js';

// 模型がある武器（武器の名前 → assets/weapons/ のファイル名）
const MODEL_FILES = {
  armingsword: 'armingsword', longsword: 'longsword', spear: 'spear', shield: 'kite_shield',
  mace: 'mace', warhammer: 'warhammer', lucerne: 'lucerne', dagger: 'dagger',   // 利用者が送った模型（2026-11-09）
};
const models = new Map();

/** 武器・盾の模型を読み込む（読み込めなかった物は仮の形で続ける） */
export function loadWeaponModels(app, weaponIds) {
  const files = [...new Set(weaponIds.map((id) => MODEL_FILES[id]).filter(Boolean))].filter((f) => !models.has(f));
  return Promise.all(files.map((file) => new Promise((resolve) => {
    const asset = new pc.Asset(`weapon-${file}`, 'container', { url: `assets/weapons/${file}.glb?v=${BUILD}` });
    asset.once('load', () => { models.set(file, asset.resource); resolve(); });
    asset.once('error', (err) => { console.warn(`武器の模型 ${file}:`, err); resolve(); });
    app.assets.add(asset);
    app.assets.load(asset);
  })));
}
function modelOf(id, shadows) {
  const res = models.get(MODEL_FILES[id]);
  return res ? res.instantiateRenderEntity({ castShadows: shadows, receiveShadows: true }) : null;
}

const mats = {};
function mat(name, color, { gloss = 0.4, metal = 0 } = {}) {
  if (mats[name]) return mats[name];
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(...color);
  m.gloss = gloss;
  m.useMetalness = true;
  m.metalness = metal;
  m.update();
  return (mats[name] = m);
}
const steel = () => mat('steel', [0.72, 0.74, 0.78], { gloss: 0.75, metal: 0.9 });
const iron = () => mat('iron', [0.35, 0.36, 0.38], { gloss: 0.5, metal: 0.8 });
const wood = () => mat('wood', [0.42, 0.28, 0.16], { gloss: 0.3 });
const leather = () => mat('leather', [0.25, 0.16, 0.1], { gloss: 0.25 });
const shieldPaint = () => mat('shieldPaint', [0.55, 0.12, 0.1], { gloss: 0.35 });

function part(parent, type, material, pos, scale, rot = [0, 0, 0], shadows = true) {
  const e = new pc.Entity();
  e.addComponent('render', { type, material, castShadows: shadows, receiveShadows: true });
  e.setLocalPosition(...pos);
  e.setLocalScale(...scale);
  e.setLocalEulerAngles(...rot);
  parent.addChild(e);
  return e;
}

/** 武器を作る。shadows：影を落とすか（一人称の手元の武器は落とさない） */
export function createWeaponModel(weaponId, { shadows = true } = {}) {
  const root = new pc.Entity(`weapon-${weaponId}`);
  const model = modelOf(weaponId, shadows);
  if (model) { root.addChild(model); return root; }
  const P = (type, m, pos, scale, rot) => part(root, type, m, pos, scale, rot, shadows);
  switch (weaponId) {
    case 'armingsword':
      P('cylinder', leather(), [0, 0, 0.03], [0.04, 0.16, 0.04], [90, 0, 0]);        // 柄
      P('box', iron(), [0, 0, -0.07], [0.2, 0.03, 0.04]);                            // 鍔
      P('box', steel(), [0, 0, -0.45], [0.05, 0.012, 0.75]);                         // 刃
      P('sphere', iron(), [0, 0, 0.13], [0.055, 0.055, 0.055]);                      // 柄頭
      break;
    case 'longsword':  // 両手で持つので柄が長い
      P('cylinder', leather(), [0, 0, 0.08], [0.04, 0.3, 0.04], [90, 0, 0]);         // 柄
      P('box', iron(), [0, 0, -0.08], [0.26, 0.03, 0.04]);                           // 鍔
      P('box', steel(), [0, 0, -0.6], [0.055, 0.012, 1.0]);                          // 刃
      P('sphere', iron(), [0, 0, 0.25], [0.06, 0.06, 0.06]);                         // 柄頭
      break;
    case 'dagger':
      P('cylinder', leather(), [0, 0, 0.02], [0.035, 0.11, 0.035], [90, 0, 0]);       // 柄
      P('box', iron(), [0, 0, -0.05], [0.12, 0.025, 0.03]);                          // 鍔
      P('box', steel(), [0, 0, -0.2], [0.04, 0.01, 0.28]);                           // 刃
      break;
    case 'mace':
      P('cylinder', wood(), [0, 0, -0.18], [0.045, 0.62, 0.045], [90, 0, 0]);        // 柄
      P('sphere', iron(), [0, 0, -0.52], [0.16, 0.16, 0.16]);                        // 頭
      for (let i = 0; i < 6; i++) {                                                  // 出縁
        P('box', iron(), [0, 0, -0.52], [0.2, 0.025, 0.07], [0, 0, i * 30]);
      }
      break;
    case 'spear':
      P('cylinder', wood(), [0, 0, -0.55], [0.04, 2.3, 0.04], [90, 0, 0]);           // 柄（持つのは後ろから 1/4）
      P('cone', steel(), [0, 0, -1.83], [0.07, 0.3, 0.025], [-90, 0, 0]);            // 穂先
      break;
    case 'longbow':
    case 'shortbow': {
      // 弓：Z の向きに立てた 2 本の弧（細い円柱を傾けて組む）と弦
      for (const s of [-1, 1]) {
        P('cylinder', wood(), [0, -0.05, s * 0.33], [0.03, 0.62, 0.03], [90 - s * 18, 0, 0]);
      }
      P('cylinder', leather(), [0, 0, 0], [0.045, 0.14, 0.045], [90, 0, 0]);         // 握り
      const string = P('cylinder', mat('string', [0.9, 0.88, 0.8]), [0, 0.1, 0], [0.006, 1.22, 0.006], [90, 0, 0]);
      string.name = 'string';
      break;
    }
    default:
      P('box', steel(), [0, 0, -0.3], [0.05, 0.05, 0.6]);
  }
  return root;
}

/** 盾（騎士）：腕の外側に付ける */
export function createShieldModel({ shadows = true } = {}) {
  const root = new pc.Entity('shield');
  const model = modelOf('shield', shadows);
  if (model) { root.addChild(model); return root; }
  part(root, 'box', shieldPaint(), [0, 0, 0], [0.06, 0.62, 0.5], [0, 0, 0], shadows);
  part(root, 'box', iron(), [0.035, 0, 0], [0.02, 0.66, 0.06], [0, 0, 0], shadows);
  part(root, 'box', iron(), [0.035, 0, 0], [0.02, 0.06, 0.54], [0, 0, 0], shadows);
  return root;
}

/** 矢 */
export function createArrowModel() {
  const root = new pc.Entity('arrow');
  part(root, 'cylinder', wood(), [0, 0, 0], [0.018, 0.75, 0.018], [90, 0, 0], false);
  part(root, 'cone', iron(), [0, 0, -0.4], [0.04, 0.08, 0.04], [-90, 0, 0], false);
  part(root, 'box', mat('fletch', [0.85, 0.85, 0.8]), [0, 0, 0.32], [0.004, 0.035, 0.09], [0, 0, 0], false);
  part(root, 'box', mat('fletch', [0.85, 0.85, 0.8]), [0, 0, 0.32], [0.035, 0.004, 0.09], [0, 0, 0], false);
  return root;
}
