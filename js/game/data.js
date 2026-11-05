// 試合のデータ：キャラ・フェーズ・ポイント・フェーズ報酬。
// 数値はすべてここに集める（調整しやすく、後で武器や時代を増やしやすくするため）

/**
 * 中世のキャラ（6 種）。
 *   model      ：見た目の模型（assets/characters/<model>.glb）
 *   weaponClass：作れる武器の系統（手順 4 のクラフトで使う）
 *   weapon     ：初期の武器（WEAPONS の名前）
 *   shield     ：盾を持つか（防御で減らせる量が増える）
 *   armor      ：鎧の硬さ（受けるダメージの倍率。小さいほど硬い）
 *   speed      ：移動の速さの倍率（鎧が重いほど遅い）
 *   weight     ：装備の重さ（light 軽装 / medium 中装 / heavy 重装）。回避の仕方が変わる（DODGE）
 *   left       ：左手ボタンでできること（guard 盾で防御 / heavy 強攻撃 / switch 近接武器と持ち替え）、leftLabel：ボタンの文字
 *   sidearm    ：持ち替える近接武器（left が switch のとき）
 *   crafts     ：クラフトで作れる・強化できる武器（WEAPONS の名前。今ある武器のうち、そのキャラが扱える物）
 *   armorName  ：専用の防具の名前（防具は 1 つだけ。クラフトで強化する）
 *   sight      ：見える距離（m）。bot がこの距離まで目で気づける（兜の覗き穴が狭いほど短い。game/senses.js）
 * 防具はキャラごとに 1 つ（強化は手順 4）。扱える武器の全体は docs/DESIGN.md
 */
export const CHARACTERS = {
  shield:  { name: '楯劍騎士', model: 'shield', weight: 'medium', left: 'guard', leftLabel: '防禦',  weaponClass: 'shieldsword', weapon: 'armingsword', crafts: ['armingsword', 'mace'], armorName: '青鋼板金鎧', shield: true,  armor: 0.85, speed: 1.0,  maxHp: 105, sight: 40,
             desc: '盾と片手武器。受けが固く、攻守のつり合いがよい（中装より少し軽い鎧）' },
  sword:   { name: '劍騎士',   model: 'sword', weight: 'medium', left: 'heavy', leftLabel: '重擊',   weaponClass: 'sword',       weapon: 'longsword',   crafts: ['longsword', 'armingsword'], armorName: '十字兜鎧', shield: false, armor: 0.8,  speed: 0.97, maxHp: 110, sight: 35,
             desc: '両手の剣と二刀流。振りが大きく、広く斬れる（中装より少し重い鎧）' },
  polearm: { name: '長柄騎士', model: 'polearm', weight: 'heavy', left: 'heavy', leftLabel: '薙拂', weaponClass: 'polearm',     weapon: 'spear',       crafts: ['spear'], armorName: '鋲打重鎧', shield: false, armor: 0.7,  speed: 0.9,  maxHp: 120, sight: 35,
             desc: '長柄の武器。間合いが一番長く、近づく前に突ける（重めの重装）' },
  blunt:   { name: '打擊騎士', model: 'blunt', weight: 'heavy', left: 'heavy', leftLabel: '擊碎',   weaponClass: 'blunt',       weapon: 'mace',        crafts: ['mace'], armorName: '大兜鎧', shield: false, armor: 0.75, speed: 0.92, maxHp: 120, sight: 30,
             desc: '打撃武器。一撃が重く、防御の上からも響く（重装より少し軽い鎧）' },
  archer:  { name: '弓兵',     model: 'archer', weight: 'light', left: 'switch', leftLabel: '持替',  weaponClass: 'bow',         weapon: 'longbow', sidearm: 'dagger', crafts: ['longbow', 'dagger'], armorName: '革鎖輕鎧', shield: false, armor: 0.95, speed: 1.05, maxHp: 90, sight: 55,
             desc: '弓で遠くから射る。引くほど強い。近寄られると弱い（軽装より少し重い）' },
  cleric:  { name: '祓魔僧',   model: 'cleric', weight: 'light', left: 'heavy', leftLabel: '重擊',  weaponClass: 'cleric',      weapon: 'mace',        crafts: ['mace'], armorName: '祓魔法衣', shield: false, armor: 1.0,  speed: 1.08, maxHp: 95, sight: 45,
             desc: '聖なる奇跡を扱う（奇跡は後で追加）。今はメイスで戦う（軽装）' },
};

/**
 * 武器。近接は「振りかぶり（windup）→ 当たり → 戻り（recovery）」の順に動く。
 *   damage：ダメージ、reach：間合い（m）、arc：当たる角度（度）、stamina：振るのに使うスタミナ
 *   guardPierce：防御されても通る割合（打撃武器は防御の上から響く）
 * 弓は押している間に引き（drawTime で満タン）、離すと放つ。引いた割合で威力と速さが変わる
 */
export const WEAPONS = {
  armingsword: { name: '片手劍', kind: 'melee', damage: 22, reach: 2.1, arc: 110, windup: 0.22, recovery: 0.34, stamina: 12, guardPierce: 0.0 },
  longsword: { name: '長劍', kind: 'melee', damage: 28, reach: 2.5, arc: 120, windup: 0.28, recovery: 0.38, stamina: 16, guardPierce: 0.0 },
  mace:      { name: '鎚矛',         kind: 'melee', damage: 32, reach: 1.9, arc: 90,  windup: 0.36, recovery: 0.44, stamina: 18, guardPierce: 0.35 },
  spear:     { name: '槍',           kind: 'melee', damage: 22, reach: 3.1, arc: 34,  windup: 0.22, recovery: 0.30, stamina: 12, guardPierce: 0.0 },
  dagger:    { name: '短劍',         kind: 'melee', damage: 14, reach: 1.5, arc: 90,  windup: 0.16, recovery: 0.26, stamina: 8,  guardPierce: 0.0 },
  longbow:   { name: '長弓',         kind: 'bow',   damage: 30, drawTime: 0.75, minDraw: 0.2, speed: 48, stamina: 8, reach: 1.2 },
};

/**
 * 姿勢：立つ・しゃがむ・伏せる（1 つのボタン：押す＝しゃがむ／立つ、長押し＝伏せる）
 *   eye：目の高さ（m）、height：体の高さ（bot から見える割合を数えるのに使う）、speed：歩く速さの倍率（走れない）
 *   noise：足音の大きさの倍率（bot に聞こえる距離）
 */
export const STANCES = {
  stand:  { name: '立',       eye: 1.6,  height: 1.75, speed: 1,    noise: 1 },
  crouch: { name: '屈身',     eye: 1.05, height: 1.15, speed: 0.5,  noise: 0.35 },
  prone:  { name: '伏臥',     eye: 0.32, height: 0.45, speed: 0.22, noise: 0.15 },
};
/** 伏せる・起き上がるのにかかる時間（秒。その間は動けない）。長押しと見なす時間 */
export const STANCE_TIME = { down: 0.7, up: 0.7, hold: 0.45 };

/**
 * bot の目と耳（game/senses.js）
 *   目：前の fov 度の中で、キャラの見える距離（CHARACTERS の sight）まで。体の visible 以上が直接見えれば気づく
 *   耳：音が届く距離（m）の中にいれば気づき、音のした所を覚える。足音は歩き方・姿勢・鎧の重さで変わる
 *   見失ったら：最後に見た（聞いた）所へ行き、lookAround 秒見回す。memory 秒たったら忘れる
 */
export const SENSES = {
  fov: 120,
  visible: 0.5,
  memory: 25,
  lookAround: 4,
  steps: { run: 22, walk: 10 },
  weight: { light: 0.8, medium: 1, heavy: 1.3 },
  noise: { swing: 12, hit: 25, dodge: 9, bow: 10, crate: 10, pickup: 5, craft: 6, search: 8, hide: 4 },
};

/**
 * 回避：移動スティックの向きへ（倒していなければ後ろへ）素早く動く。装備の重さで仕方が変わる。
 *   anim：動き（roll 前転 / step 身をかがめて跳ぶ回避ステップ）
 *   duration：かかる時間（秒）、distance：進む距離（m）
 *   invuln：攻撃が当たらない時間 [始め, 終わり]（秒）、stamina：使うスタミナ
 */
export const DODGE = {
  light:  { name: '輕身前轉', anim: 'roll', duration: 0.55, distance: 4.5, invuln: [0.04, 0.38], stamina: 16 },
  medium: { name: '前轉',         anim: 'roll', duration: 0.75, distance: 3.8, invuln: [0.08, 0.42], stamina: 20 },
  heavy:  { name: '跳避',         anim: 'step', duration: 0.5,  distance: 2.4, invuln: [0.04, 0.2],  stamina: 24 },
};

/**
 * 強攻撃（左手ボタン）：ふつうの攻撃に対する倍率。振りかぶりが長く、隙も大きいが、重い。
 * 武器ごとに arc（当たる角度）や guardPierce（防御の上から響く割合）を足せる
 */
export const HEAVY = {
  damage: 1.7, windup: 1.7, recovery: 1.3, stamina: 1.8,
  byWeapon: {
    spear: { arc: 150, reach: 0.9 },          // なぎ払い：広く払う（間合いは少し短い）
    mace: { guardPierce: 0.3 },               // 叩きつけ：防御の上からさらに響く
  },
};

/**
 * 素材（4 種類）。マップに落ちている物を拾う・村の家の前の箱を開ける（クリーチャーとプレイヤーからは後で）
 */
export const MATERIALS = {
  wood:  { name: '木材' },
  stone: { name: '石塊' },
  iron:  { name: '屑鐵' },
  cloth: { name: '皮革' },
};
export const MATERIAL_KEYS = Object.keys(MATERIALS);
/** 最初に持っている素材（全キャラ同じ） */
export const START_MATERIALS = { wood: 2, stone: 2, iron: 1, cloth: 1 };

/**
 * クラフト（どこでも、すぐできる）。費用は素材の数
 *   WEAPON_COST：新しく武器を作る
 *   UPGRADE    ：武器の強化（2 回まで）。今は数値だけ（威力・スタミナ）。新しい動きは、動きを作るときに段階へ足す
 *   ARMOR      ：防具の強化（2 回まで）。受けるダメージを減らす
 */
export const WEAPON_COST = {
  armingsword: { wood: 1, iron: 3, cloth: 1 },
  longsword:   { wood: 1, iron: 5, cloth: 1 },
  mace:        { wood: 2, stone: 1, iron: 3 },
  spear:       { wood: 3, iron: 2 },
  dagger:      { iron: 2, cloth: 1 },
  longbow:     { wood: 4, cloth: 2 },
};
export const UPGRADE = [
  null,                                                                   // 強化なし
  { damage: 1.12, stamina: 0.9, cost: { wood: 1, stone: 2, iron: 2 } },  // 1 回目
  { damage: 1.25, stamina: 0.8, cost: { stone: 3, iron: 4, cloth: 1 } }, // 2 回目
];
export const ARMOR = [
  null,
  { taken: 0.9, cost: { iron: 3, cloth: 2 } },             // 受けるダメージ -10%
  { taken: 0.8, cost: { stone: 1, iron: 5, cloth: 4 } },   // 受けるダメージ -20%
];

/**
 * 落ちている素材。count：マップ全体の山の数（エリアの多さで場所を選ぶ）、amount：1 つの山の数の範囲
 * zone：エリアごとの置きやすさ。refill：フェーズが始まるたびに足す山の数
 * 村の箱（crate）：村の家の前に置く。開けると loot の数だけ手に入る（1 回だけ）
 */
export const PICKUPS = {
  wood:  { count: 80, amount: [1, 3], zone: { mixed: 1, deep: 1.4, prairie: 0.3, castle: 0.3 } },
  stone: { count: 55, amount: [1, 3], zone: { mixed: 1, deep: 0.7, prairie: 1.4, castle: 0.4 } },
  iron:  { count: 22, amount: [1, 2], zone: { mixed: 0.8, deep: 1, prairie: 1, castle: 0.6 } },
  cloth: { count: 22, amount: [1, 2], zone: { mixed: 0.8, deep: 0.6, prairie: 1, castle: 0.6 } },
  refill: 24,
  reach: 2.2,      // 拾える近さ（m）
};
export const CRATE = { count: 12, loot: { iron: [2, 4], cloth: [2, 3], stone: [0, 2], wood: [0, 1] } };

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
export const BOT_NAMES = ['玄馬', '志乃', '伊吹', '颯', '朱音', '鐵心'];

/**
 * フェーズ。duration：長さ（秒）、radius：歩ける範囲の半径（m）、time：時間帯（world/time-of-day.js の TIMES）
 * 歩ける範囲はフェーズで広げない（最初から森全体）。フェーズが進むと時間帯が変わり、夜に向かう
 * 最後のフェーズの時間が切れたら、生き残りが 1 人になるまで延長する
 */
export const AREA_RADIUS = 175;   // js/config.js の world.playRadius と同じ値（端から端まで 350m）
export const PHASES = [
  { name: '第壹刻', duration: 180, radius: AREA_RADIUS, time: 'morning', note: '朝の森。素材を集め、装備を整えよ' },
  { name: '第貳刻', duration: 180, radius: AREA_RADIUS, time: 'day',     note: '日が高くなった' },
  { name: '第參刻', duration: 180, radius: AREA_RADIUS, time: 'dusk',    note: '日が傾き、森が赤く染まる' },
  { name: '第肆刻', duration: 180, radius: AREA_RADIUS, time: 'night',   note: '夜が来た。暗い森に気をつけよ' },
  { name: '終刻', duration: 240, radius: AREA_RADIUS, time: 'night',   note: '最後の一人になるまで終わらない' },
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
  { id: 'maxHp',   name: '體力上限',     unit: '',  values: [10, 15, 20, 30, 40],  apply: (f, v) => { f.stats.maxHp += v; f.stats.hp += v; } },
  { id: 'attack',  name: '攻擊力',       unit: '%', values: [5, 8, 10, 14, 18],    apply: (f, v) => { f.stats.attack *= 1 + v / 100; } },
  { id: 'defense', name: '防禦力',       unit: '%', values: [5, 8, 10, 14, 18],    apply: (f, v) => { f.stats.defense *= 1 + v / 100; } },
  { id: 'speed',   name: '迅速',         unit: '%', values: [3, 4, 5, 6, 8],       apply: (f, v) => { f.stats.speed *= 1 + v / 100; } },
  { id: 'stamina', name: '氣力',         unit: '',  values: [10, 15, 20, 25, 30],  apply: (f, v) => { f.stats.maxStamina += v; } },
];
