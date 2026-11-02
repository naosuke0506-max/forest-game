// 武器と盾の仮の見た目（箱・円柱・球の組み合わせ）。
// 持ち手（手の位置）を原点にして作る。剣・メイス・槍は -Z の向きへ伸び、弓は Z の向きに立つ
import * as pc from 'playcanvas';

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
  const P = (type, m, pos, scale, rot) => part(root, type, m, pos, scale, rot, shadows);
  switch (weaponId) {
    case 'longsword':
      P('cylinder', leather(), [0, 0, 0.05], [0.04, 0.22, 0.04], [90, 0, 0]);        // 柄
      P('box', iron(), [0, 0, -0.08], [0.24, 0.03, 0.04]);                           // 鍔
      P('box', steel(), [0, 0, -0.55], [0.055, 0.012, 0.9]);                         // 刃
      P('sphere', iron(), [0, 0, 0.18], [0.06, 0.06, 0.06]);                         // 柄頭
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
