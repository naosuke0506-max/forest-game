// 試合のデータ：キャラ・フェーズ・ポイント・フェーズ報酬。
// 数値はすべてここに集める（調整しやすく、後で武器や時代を増やしやすくするため）

/**
 * 中世のキャラ。
 *   weaponClass：作れる武器の系統（手順 4 のクラフトで使う）
 *   weapon     ：初期の武器（WEAPONS の名前）
 *   shield     ：盾を持つか（防御で減らせる量が増える）
 *   armor      ：鎧の硬さ（受けるダメージの倍率。小さいほど硬い）
 *   speed      ：移動の速さの倍率（鎧が重いほど遅い）
 */
export const CHARACTERS = {
  knight:   { name: '騎士', weaponClass: 'slash',  weapon: 'longsword', shield: true,  armor: 0.8,  speed: 0.96, maxHp: 110,
              desc: '剣と盾。受けが固く、攻守のつり合いがよい' },
  archer:   { name: '弓兵', weaponClass: 'bow',    weapon: 'shortbow',  shield: false, armor: 1.0,  speed: 1.05, maxHp: 90,
              desc: '弓で遠くから射る。引くほど強い。近寄られると弱い' },
  maceman:  { name: '鎚兵', weaponClass: 'blunt',  weapon: 'mace',      shield: false, armor: 0.85, speed: 0.95, maxHp: 115,
              desc: '打撃武器。一撃が重く、防御の上からも響く。強化状態やクリーチャーに強い' },
  spearman: { name: '槍兵', weaponClass: 'thrust', weapon: 'spear',     shield: false, armor: 0.9,  speed: 1.0,  maxHp: 100,
              desc: '刺突武器。間合いが一番長く、近づく前に突ける' },
};

/**
 * 武器。近接は「振りかぶり（windup）→ 当たり → 戻り（recovery）」の順に動く。
 *   damage：ダメージ、reach：間合い（m）、arc：当たる角度（度）、stamina：振るのに使うスタミナ
 *   guardPierce：防御されても通る割合（打撃武器は防御の上から響く）
 * 弓は押している間に引き（drawTime で満タン）、離すと放つ。引いた割合で威力と速さが変わる
 */
export const WEAPONS = {
  longsword: { name: 'ロングソード', kind: 'melee', damage: 24, reach: 2.3, arc: 110, windup: 0.24, recovery: 0.34, stamina: 14, guardPierce: 0.0 },
  mace:      { name: 'メイス',       kind: 'melee', damage: 32, reach: 1.9, arc: 90,  windup: 0.36, recovery: 0.44, stamina: 18, guardPierce: 0.35 },
  spear:     { name: 'スピア',       kind: 'melee', damage: 22, reach: 3.1, arc: 34,  windup: 0.22, recovery: 0.30, stamina: 12, guardPierce: 0.0 },
  shortbow:  { name: '短弓',         kind: 'bow',   damage: 30, drawTime: 0.75, minDraw: 0.2, speed: 48, stamina: 8, reach: 1.2 },
};

/** 戦闘の決まりごと */
export const COMBAT = {
  staminaRegen: 22,        // 1 秒に戻るスタミナ
  staminaRegenDelay: 0.6,  // 使ってから戻り始めるまで（秒）
  maxStamina: 100,
  guardReduce: 0.75,       // 防御で減らせる割合（盾なし）
  guardReduceShield: 0.9,  // 盾あり
  guardArc: 120,           // 防御できる角度（前方、度）
  guardStaminaPerDamage: 1.0, // 防御で受けたダメージ 1 ごとに使うスタミナ
  guardMoveScale: 0.5,     // 防御中の移動の速さ
  attackMoveScale: 0.55,   // 攻撃中の移動の速さ
  hitStun: 0.22,           // ひるむ時間（秒）
  bodyRadius: 0.4,         // 当たり判定の体の太さ（m）
  bodyHeight: 1.8,
  gravity: 9.8,
};

/** bot の名前（練習モードの相手） */
export const BOT_NAMES = ['玄馬', '志乃', '伊吹', '颯', '朱音', '鉄心'];

/**
 * フェーズ。duration：長さ（秒）、radius：歩ける範囲の半径（m）
 * 最後のフェーズの時間が切れたら、生き残りが 1 人になるまで延長する
 */
export const PHASES = [
  { name: '第一フェーズ', duration: 180, radius: 30, note: '素材を集め、装備を整えよ' },
  { name: '第二フェーズ', duration: 180, radius: 40, note: '森が広がった。新しいクリーチャーが現れる' },
  { name: '第三フェーズ', duration: 180, radius: 50, note: '強いクリーチャーが目を覚ました' },
  { name: '第四フェーズ', duration: 180, radius: 58, note: '森の奥まで開いた' },
  { name: '最終フェーズ', duration: 240, radius: 62, note: 'ボスが現れる。最後の一人になるまで終わらない' },
];

/** ポイント */
export const POINTS = {
  phaseSurvive: [50, 75, 100, 150, 200], // フェーズを生き残るたび（フェーズの番号ごと）
  killCreature: 30,
  killPlayer: 150,
  killMutatedPlayer: 250,   // クリーチャー状態（変異薬）のプレイヤーを倒す
  killEnhancedPlayer: 200,  // 肉体強化状態のプレイヤーを倒す
  lastSurvivor: 600,        // 最後の生き残り
};

/** フェーズ報酬が選べるまでの時間（秒）。過ぎたら最初の候補を自動で選ぶ（対戦中なので止めない） */
export const REWARD_PICK_TIME = 15;

/**
 * フェーズ報酬（ステータス向上）。values はフェーズの番号ごとの強さ。
 * スキルは、戦闘ができてから（手順 2 以降）足す
 */
export const REWARDS = [
  { id: 'maxHp',   name: '体力の上限',   unit: '',  values: [10, 15, 20, 30, 40],  apply: (f, v) => { f.stats.maxHp += v; f.stats.hp += v; } },
  { id: 'attack',  name: '攻撃力',       unit: '%', values: [5, 8, 10, 14, 18],    apply: (f, v) => { f.stats.attack *= 1 + v / 100; } },
  { id: 'defense', name: '防御力',       unit: '%', values: [5, 8, 10, 14, 18],    apply: (f, v) => { f.stats.defense *= 1 + v / 100; } },
  { id: 'speed',   name: '移動の速さ',   unit: '%', values: [3, 4, 5, 6, 8],       apply: (f, v) => { f.stats.speed *= 1 + v / 100; } },
  { id: 'stamina', name: 'スタミナ',     unit: '',  values: [10, 15, 20, 25, 30],  apply: (f, v) => { f.stats.maxStamina += v; } },
];
