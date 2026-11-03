// 素材とクラフト（計算だけ。PlayCanvas に依存しない）。
//   素材の出し入れ・武器を作る・武器の強化（2 回まで）・防具の強化（2 回まで）・持つ武器を替える
// クラフトはどこでも、すぐできる（試合は止まらない）
import { CHARACTERS, WEAPONS, MATERIAL_KEYS, START_MATERIALS, WEAPON_COST, UPGRADE, ARMOR } from './data.js';

/** 戦う人に、素材・持っている武器・強化の段階を持たせる（createFighter の後に 1 回呼ぶ） */
export function initInventory(f) {
  const c = CHARACTERS[f.char];
  f.materials = { ...START_MATERIALS };
  // 持っている武器と、その強化の段階（0〜2）。最初の武器（弓兵はダガーも）を持っている
  f.owned = { [c.weapon]: 0 };
  if (c.sidearm) f.owned[c.sidearm] = 0;
  f.armorLevel = 0;
  f.baseArmor = f.armor;
}

/** 足りているか */
export function canAfford(f, cost) {
  return MATERIAL_KEYS.every((k) => (f.materials[k] || 0) >= (cost[k] || 0));
}
function pay(f, cost) {
  for (const k of MATERIAL_KEYS) f.materials[k] -= cost[k] || 0;
}
export function addMaterials(f, add) {
  for (const k of MATERIAL_KEYS) f.materials[k] = (f.materials[k] || 0) + (add[k] || 0);
}

/** 武器の強化の段階（持っていなければ -1） */
export const levelOf = (f, weaponId) => (weaponId in (f.owned || {}) ? f.owned[weaponId] : -1);

/**
 * そのキャラがクラフト画面でできること（画面と bot が使う）
 *   weapons：[{ id, owned, level, next: 'make' | 'upgrade' | null, cost, equipped }]
 *   armor  ：{ level, cost（次の強化。最大なら null） }
 */
export function craftOptions(f) {
  const c = CHARACTERS[f.char];
  const weapons = c.crafts.map((id) => {
    const level = levelOf(f, id);
    const owned = level >= 0;
    const next = !owned ? 'make' : level < UPGRADE.length - 1 ? 'upgrade' : null;
    const cost = next === 'make' ? WEAPON_COST[id] : next === 'upgrade' ? UPGRADE[level + 1].cost : null;
    const equipped = f.primary === id || f.sidearm === id;
    return { id, name: WEAPONS[id].name, owned, level, next, cost, equipped, canEquip: owned && !equipped && id !== c.sidearm };
  });
  const lv = f.armorLevel;
  const armor = { name: c.armorName, level: lv, cost: lv < ARMOR.length - 1 ? ARMOR[lv + 1].cost : null };
  return { weapons, armor };
}

/** 武器を作る（持っていない武器）。できたら true */
export function makeWeapon(f, id) {
  if (levelOf(f, id) >= 0 || !CHARACTERS[f.char].crafts.includes(id)) return false;
  const cost = WEAPON_COST[id];
  if (!canAfford(f, cost)) return false;
  pay(f, cost);
  f.owned[id] = 0;
  return true;
}

/** 武器を強化する（持っている武器、2 回まで） */
export function upgradeWeapon(f, id) {
  const lv = levelOf(f, id);
  if (lv < 0 || lv >= UPGRADE.length - 1) return false;
  const cost = UPGRADE[lv + 1].cost;
  if (!canAfford(f, cost)) return false;
  pay(f, cost);
  f.owned[id] = lv + 1;
  return true;
}

/** 防具を強化する（2 回まで）。受けるダメージの倍率（armor）が下がる */
export function upgradeArmor(f) {
  const lv = f.armorLevel;
  if (lv >= ARMOR.length - 1) return false;
  const cost = ARMOR[lv + 1].cost;
  if (!canAfford(f, cost)) return false;
  pay(f, cost);
  f.armorLevel = lv + 1;
  f.armor = f.baseArmor * ARMOR[f.armorLevel].taken;
  return true;
}

/**
 * 主の武器（右手）を持ち替える。持っている武器だけ。弓兵の持ち替える近接武器（sidearm）はそのまま
 * 今、主の武器を手にしていれば、手の武器も替える
 */
export function equipWeapon(f, id) {
  if (levelOf(f, id) < 0 || f.primary === id || f.sidearm === id) return false;
  const holdingPrimary = f.weapon === f.primary;
  f.primary = id;
  if (holdingPrimary) { f.weapon = id; f.action = null; }
  return true;
}

/** 強化の倍率（戦闘が使う）：威力とスタミナ */
export function upgradeOf(f, weaponId) {
  const lv = Math.max(0, levelOf(f, weaponId));
  return UPGRADE[lv] || { damage: 1, stamina: 1 };
}

/**
 * bot のクラフト：素材があれば、強化を順に試す（今の武器 → 防具 → 2 回目）
 * 何か作ったら、その説明を返す（無ければ null）
 */
export function botCraft(f) {
  const main = f.primary;
  if (levelOf(f, main) === 0 && upgradeWeapon(f, main)) return `${WEAPONS[main].name}を強化`;
  if (f.armorLevel === 0 && upgradeArmor(f)) return '防具を強化';
  if (levelOf(f, main) === 1 && upgradeWeapon(f, main)) return `${WEAPONS[main].name}を強化`;
  if (f.armorLevel === 1 && upgradeArmor(f)) return '防具を強化';
  return null;
}
