// 試合のデータ：キャラ・武器・試合の前に選ぶ武器・フェーズ・ポイント・フェーズ報酬。
// 数値はすべてここに集める（調整しやすく、後で武器や時代を増やしやすくするため）

/**
 * 中世のキャラ（6 種）。
 *   model      ：見た目の模型（assets/characters/<model>.glb）
 *   持つ武器と楯は、試合の前に選ぶ（LOADOUTS）
 *   armor      ：鎧の硬さ（受けるダメージの倍率。小さいほど硬い）
 *   speed      ：移動の速さの倍率（鎧が重いほど遅い）
 *   weight     ：装備の重さ（light 軽装 / medium 中装 / heavy 重装）。回避の仕方が変わる（DODGE）
 *   left       ：左手ボタンでできること（guard 盾で防御 / heavy 強攻撃 / switch 近接武器と持ち替え / null 無し）、leftLabel：ボタンの文字
 *                劍騎士は左手ボタンが無い（重擊は無くした。強い一撃は攻擊ボタンの長押しの溜攻撃）
 *   armorName  ：専用の防具の名前（防具は 1 つだけ）
 *   sight      ：見える距離（m）。bot がこの距離まで目で気づける（兜の覗き穴が狭いほど短い。game/senses.js）
 * 防具はキャラごとに 1 つ（強化は無い）。扱える武器の全体は docs/DESIGN.md
 */
export const CHARACTERS = {
  shield:  { name: '楯劍騎士', model: 'shield', weight: 'medium', left: 'guard', leftLabel: '防禦',  armorName: '青鋼板金鎧', armor: 0.85, speed: 1.0,  maxHp: 105, sight: 40,
             desc: '盾と片手武器。受けが固く、攻守のつり合いがよい（中装より少し軽い鎧）' },
  sword:   { name: '劍騎士',   model: 'sword', weight: 'medium', left: null, leftLabel: null,     armorName: '十字兜鎧', armor: 0.8,  speed: 0.97, maxHp: 110, sight: 35,
             desc: '両手の剣と二刀流。振りが大きく、広く斬れる（中装より少し重い鎧）' },
  polearm: { name: '長柄騎士', model: 'polearm', weight: 'heavy', left: 'heavy', leftLabel: '薙拂', armorName: '鋲打重鎧', armor: 0.7,  speed: 0.9,  maxHp: 120, sight: 35,
             desc: '長柄の武器。間合いが一番長く、近づく前に突ける（重めの重装）' },
  blunt:   { name: '打擊騎士', model: 'blunt', weight: 'heavy', left: 'heavy', leftLabel: '擊碎',   armorName: '大兜鎧', armor: 0.75, speed: 0.92, maxHp: 120, sight: 30,
             desc: '打撃武器。一撃が重く、防御の上からも響く（重装より少し軽い鎧）' },
  archer:  { name: '弓兵',     model: 'archer', weight: 'light', left: 'switch', leftLabel: '持替',  armorName: '革鎖輕鎧', armor: 0.95, speed: 1.05, maxHp: 90, sight: 55,
             desc: '弓で遠くから射る。引くほど強い。近寄られると弱い（軽装より少し重い）' },
  cleric:  { name: '祓魔僧',   model: 'cleric', weight: 'light', left: 'heavy', leftLabel: '重擊',  armorName: '祓魔法衣', armor: 1.0,  speed: 1.08, maxHp: 95, sight: 45,
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
 * 武器の技（片手劍・長劍。docs/DESIGN.md の「片手劍の技」「長劍の技」）。動きは模型に入っている
 * （tools/characters/onehand_moves.py・longsword_moves.py）。技の流れは game/techniques.js
 *   combo：通常攻撃（攻擊ボタンを短く押す）。1 段目 → 2 段目 → また 1 段目
 *   charge：溜攻撃 1（長押しで溜め、離して放つ）。in・hold は溜めに入る・溜めている間の動き。溜めた長さ（full 秒で満タン）で damage [最小, 最大] の間
 *   charge2：溜攻撃 2（溜攻撃 1 の後、すぐもう一度長押しして離す）
 * 技ごとに：clip 動き、time 長さ（秒。動きを作った速さのまま）、hits 当たる時刻（秒）、damage 武器の damage に掛ける倍率、
 *   reach 間合い（m）、arc 当たる角度（度。当たりが 2 回ある技は 1 回ごと）、stamina、chain 次の技へ移れる時刻（秒。先に押しておけばこの時刻に移る）、
 *   power 威力（l 軽い / h 重い。被弾・防禦の受け方を変える）
 * 数値は仮（遊んで調整する）
 */
export const TECHNIQUES = {
  armingsword: {
    combo: [
      { name: '踏込突', clip: 'oh_thrust', time: 0.7, hits: [0.24], damage: 1.0, reach: 2.3, arc: 40, stamina: 12, chain: 0.4, power: 'l' },
      { name: '逆袈裟', clip: 'oh_rise', time: 0.73, hits: [0.24], damage: 1.05, reach: 2.0, arc: 120, stamina: 12, chain: 0.42, power: 'l' },
    ],
    charge: { name: '袈裟斬', in: 'oh_c1_in', hold: 'oh_c1_hold', clip: 'oh_c1_out', time: 0.8, hits: [0.16], damage: [1.4, 2.0], full: 1.0,
      reach: 2.2, arc: 110, stamina: 20, chain: 0.45, power: 'h' },
    charge2: { name: '旋風斬', clip: 'oh_c2', time: 1.67, hits: [0.54, 1.2], damage: [1.0, 1.5], reach: 2.2, arc: [360, 140], stamina: 24,
      chain: 1.4, power: ['l', 'h'] },
  },
  longsword: {   // 片手劍より振りが大きく、隙も少し大きい
    combo: [
      { name: '唐竹', clip: 'ls_cut1', time: 0.93, hits: [0.34], damage: 1.0, reach: 2.6, arc: 50, stamina: 16, chain: 0.58, power: 'l' },
      { name: '横薙', clip: 'ls_cut2', time: 0.97, hits: [0.36], damage: 1.0, reach: 2.5, arc: 150, stamina: 16, chain: 0.6, power: 'l' },
    ],
    charge: { name: '長突', in: 'ls_c1_in', hold: 'ls_c1_hold', clip: 'ls_c1_out', time: 0.93, hits: [0.16], damage: [1.4, 2.0], full: 1.1,
      reach: 3.2, arc: 30, stamina: 26, chain: 0.55, power: 'h' },
    charge2: { name: '斬返', clip: 'ls_c2', time: 1.47, hits: [0.3, 0.78], damage: [1.0, 1.5], reach: 2.6, arc: [110, 110], stamina: 30,
      chain: 1.05, power: ['l', 'h'] },
  },
};
/**
 * 技の操作：hold 長押しと見なす時間（秒。これより早く離せば通常攻撃）、comboWindow 通常攻撃の後に次の段へつながる時間（秒）、
 * followWindow 溜攻撃 1 の後に溜攻撃 2 へつながる時間（秒。放った一撃が当たる時刻から、動きの終わりのこの秒後まで）
 */
export const TECH = { hold: 0.25, comboWindow: 0.4, followWindow: 0.5 };

/**
 * 試合の前に選ぶ武器（キャラごと）。鍛冶・強化は無い。試合の途中では替えられない
 *   main：右手（主の武器）、side：持替で持つ近接武器（弓兵）、shield：左手の楯（楯劍騎士）
 *   並びの最初が、選ばなかったときの物。WEAPONS・SHIELDS に無い物（PLANNED）は、模型と動きができるまで「未完」で選べない
 */
export const LOADOUTS = {
  shield:  { main: ['armingsword', 'mace', 'falchion'], shield: ['kite', 'buckler', 'pavise'] },
  sword:   { main: ['longsword', 'armingsword', 'greatsword', 'falchion'] },
  polearm: { main: ['spear', 'pike', 'halberd'] },
  blunt:   { main: ['mace', 'warhammer', 'lucerne', 'flail'] },
  archer:  { main: ['longbow', 'crossbow'], side: ['dagger', 'falchion', 'battleaxe'] },
  cleric:  { main: ['mace'] },
};
/** 楯。planned：模型と動きがまだ無い */
export const SHIELDS = {
  kite:    { name: '鳶形楯' },
  buckler: { name: '小楯', planned: true },
  pavise:  { name: '大楯', planned: true },
};
/** まだ模型と動きが無い武器の名前（題の画面に「未完」と出す） */
export const PLANNED = {
  falchion: '片刃劍', greatsword: '兩手大劍', pike: '長槍', halberd: '斧槍', warhammer: '戰鎚',
  lucerne: '長柄鎚', flail: '連枷', battleaxe: '戰斧', crossbow: '弩',
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
  noise: { swing: 12, hit: 25, dodge: 9, bow: 10, search: 8, hide: 4 },
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
 * 攻撃を受けたときの動き（docs/DESIGN.md「片手劍の技」の被弾・よろめき、「楯の技」の防禦の受け）。動きは模型に入っている（tools/characters/body_moves.py）
 *   hit_l：軽い被弾（ふつうの攻撃）、hit_h：重い被弾（溜攻撃・強攻撃・引き切った矢）、stagger：よろめき（防禦が崩れた・重い被弾でひるんでいる間にまた重い一撃）
 *   guard_l・guard_h：楯で受けた（弱い・強い一撃か鎚矛）。被弾とよろめきは、攻撃された向き（前・後ろ・左・右）で動きが変わる
 *   stun：何もできない時間（秒。動きの終わりより少し早く動けるようにしてある）
 *   push：押された向きへ下がる距離（m。動きを作ったときに体が動いた距離と同じ）、time：その間（秒。動きの長さ）
 */
export const REACT = {
  hit_l:   { stun: 0.28 },
  hit_h:   { stun: 0.62, push: 0.30, time: 0.93 },
  stagger: { stun: 1.1,  push: 0.66, time: 1.4 },
  guard_l: { stun: 0 },
  guard_h: { stun: 0.35 },
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
  { name: '第壹刻', duration: 180, radius: AREA_RADIUS, time: 'morning', note: '朝の森。息を潜め、敵を探せ' },
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
