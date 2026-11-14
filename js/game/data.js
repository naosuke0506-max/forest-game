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
  // 雙劍：劍騎士の片手劍を 2 本（二刀流。利用者の指示 2026-11-10）。1 撃は軽いが速い。左手の剣は模型の socket_L2 に付ける（dual）
  dualsword: { name: '雙劍', kind: 'melee', damage: 19, reach: 2.1, arc: 120, windup: 0.18, recovery: 0.30, stamina: 10, guardPierce: 0.0, stance: 'dw', dual: true },
  mace:      { name: '鎚矛',         kind: 'melee', damage: 32, reach: 1.9, arc: 90,  windup: 0.36, recovery: 0.44, stamina: 18, guardPierce: 0.35 },
  spear:     { name: '槍',           kind: 'melee', damage: 22, reach: 3.1, arc: 34,  windup: 0.22, recovery: 0.30, stamina: 12, guardPierce: 0.0 },
  dagger:    { name: '短劍',         kind: 'melee', damage: 14, reach: 1.5, arc: 90,  windup: 0.16, recovery: 0.26, stamina: 8,  guardPierce: 0.0 },
  // 両手で持つ打撃武器（打擊騎士）。戰鎚は鎚矛より重く遅い。長柄鎚は間合いが長い
  warhammer: { name: '戰鎚',         kind: 'melee', damage: 38, reach: 2.2, arc: 80,  windup: 0.40, recovery: 0.50, stamina: 22, guardPierce: 0.45, stance: 'wh' },
  lucerne:   { name: '長柄鎚',       kind: 'melee', damage: 34, reach: 3.2, arc: 60,  windup: 0.38, recovery: 0.48, stamina: 20, guardPierce: 0.40, stance: 'lc' },
  longbow:   { name: '長弓',         kind: 'bow',   damage: 30, drawTime: 0.75, minDraw: 0.2, speed: 48, stamina: 8, reach: 1.2 },
};

/**
 * 武器の技（片手劍・長劍・鎚矛・戰鎚・長柄鎚・短劍。docs/DESIGN.md の「〇〇の技」）。動きは模型に入っている
 * （tools/characters/onehand_moves.py・longsword_moves.py・mace_moves.py・warhammer_moves.py・lucerne_moves.py・dagger_moves.py）。
 * 技の流れは game/techniques.js
 *   combo：通常攻撃（攻擊ボタンを短く押す）。1 段目 → 2 段目 → また 1 段目
 *   charge：溜攻撃 1（長押しで溜め、離して放つ）。in・hold は溜めに入る・溜めている間の動き。溜めた長さ（full 秒で満タン）で damage [最小, 最大] の間
 *   charge2：溜攻撃 2（溜攻撃 1 の後、すぐもう一度長押しして離す）。hold があれば、溜攻撃 2 を待つ間はその動き（無ければ溜攻撃 1 の振り終わりの姿）
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
  dualsword: {   // 雙劍（二刀流）：右・左・両方と続けて斬る。1 撃は軽いが速い（技の形は Claude の案。tools/characters/dualsword_moves.py）
    combo: [
      { name: '右袈裟', clip: 'dw_cut1', time: 0.7, hits: [0.22], damage: 0.9, reach: 2.1, arc: 110, stamina: 9, chain: 0.4, power: 'l' },
      { name: '左薙', clip: 'dw_cut2', time: 0.73, hits: [0.27], damage: 0.9, reach: 2.1, arc: 140, stamina: 9, chain: 0.44, power: 'l' },
      { name: '十字斬', clip: 'dw_cut3', time: 0.93, hits: [0.32], damage: 1.5, reach: 2.2, arc: 90, stamina: 14, chain: 0.6, power: 'h' },
    ],
    charge: { name: '開斬', in: 'dw_c1_in', hold: 'dw_c1_hold', clip: 'dw_c1_out', time: 0.7, hits: [0.1], damage: [1.3, 1.9], full: 1.0,
      reach: 2.3, arc: 220, stamina: 20, chain: 0.4, power: 'h' },
    charge2: { name: '雙旋', clip: 'dw_c2', time: 1.1, hits: [0.31, 0.58], damage: [1.0, 1.3], reach: 2.3, arc: [360, 360], stamina: 24,
      chain: 0.9, power: ['l', 'h'] },
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
  mace: {   // 楯劍騎士・打擊騎士・祓魔僧。片手で振る重い鎚。防禦の上から響く（動きの形は利用者の指示 2026-11-09）
    combo: [
      { name: '橫打', clip: 'mc_cut1', time: 0.87, hits: [0.31], damage: 1.0, reach: 1.9, arc: 130, stamina: 16, chain: 0.5, power: 'l' },
      { name: '返打', clip: 'mc_cut2', time: 0.83, hits: [0.27], damage: 1.0, reach: 1.9, arc: 130, stamina: 16, chain: 0.46, power: 'l' },
      { name: '打上', clip: 'mc_cut3', time: 1.17, hits: [0.56], damage: 1.25, reach: 1.9, arc: 60, stamina: 20, chain: 0.85, power: 'h' },
    ],
    charge: { name: '昇擊', in: 'mc_c1_in', hold: 'mc_c1_hold', clip: 'mc_c1_out', time: 0.97, hits: [0.16], damage: [1.4, 2.1], full: 1.0,
      reach: 2.0, arc: 60, stamina: 24, chain: 0.5, power: 'h' },
    charge2: { name: '地碎', hold: 'mc_c2_hold', clip: 'mc_c2', time: 1.2, hits: [0.32], damage: 1.8, reach: 2.1, arc: 100, stamina: 28,
      chain: 0.9, power: 'h' },
  },
  warhammer: {   // 打擊騎士。両手で持つ重い鎚。いちばん遅いが、一撃が重い（動きの形は利用者の指示 2026-11-09）
    combo: [
      { name: '薙擊', clip: 'wh_cut1', time: 1.03, hits: [0.42], damage: 1.0, reach: 2.2, arc: 140, stamina: 22, chain: 0.66, power: 'l' },
      { name: '返擊', clip: 'wh_cut2', time: 0.93, hits: [0.31], damage: 1.0, reach: 2.2, arc: 140, stamina: 22, chain: 0.56, power: 'l' },
      { name: '天墜', clip: 'wh_cut3', time: 1.77, hits: [0.92], damage: 1.5, reach: 2.4, arc: 60, stamina: 30, chain: 1.3, power: 'h' },
    ],
    charge: { name: '袈裟返', in: 'wh_c1_in', hold: 'wh_c1_hold', clip: 'wh_c1_out', time: 1.27, hits: [0.2, 0.6], damage: [1.3, 1.9], full: 1.2,
      reach: 2.3, arc: [80, 80], stamina: 30, chain: 0.85, power: 'h' },
    charge2: { name: '旋擊', hold: 'wh_c2_hold', clip: 'wh_c2', time: 1.4, hits: [0.72], damage: 1.9, reach: 2.3, arc: 120, stamina: 34,
      chain: 1.0, power: 'h' },
  },
  lucerne: {   // 打擊騎士。柄の先を持ち、長い柄で遠くから叩く（動きの形は利用者の指示 2026-11-09）
    combo: [
      { name: '打落', clip: 'lc_cut1', time: 1.0, hits: [0.38], damage: 1.0, reach: 3.3, arc: 40, stamina: 18, chain: 0.62, power: 'l' },
      { name: '撥上', clip: 'lc_cut2', time: 0.93, hits: [0.26], damage: 1.0, reach: 3.1, arc: 40, stamina: 18, chain: 0.52, power: 'l' },
    ],
    charge: { name: '大薙', in: 'lc_c1_in', hold: 'lc_c1_hold', clip: 'lc_c1_out', time: 0.97, hits: [0.22], damage: [1.4, 2.1], full: 1.1,
      reach: 3.3, arc: 160, stamina: 28, chain: 0.6, power: 'h' },
    charge2: { name: '車輪', hold: 'lc_c2_hold', clip: 'lc_c2', time: 1.4, hits: [0.18, 0.79], damage: [1.0, 1.4], reach: [3.3, 3.3], arc: [360, 360], stamina: 30,
      chain: 1.05, power: ['l', 'h'] },
  },
  dagger: {   // 弓兵が持ち替えて使う。軽くて速い。間合いは短い（動きの形は利用者の指示 2026-11-09）
    combo: [
      { name: '斜斬', clip: 'dg_cut1', time: 0.57, hits: [0.18], damage: 1.0, reach: 1.5, arc: 100, stamina: 8, chain: 0.32, power: 'l' },
      { name: '斬上', clip: 'dg_cut2', time: 0.57, hits: [0.17], damage: 1.0, reach: 1.5, arc: 100, stamina: 8, chain: 0.31, power: 'l' },
      { name: '刺突', clip: 'dg_cut3', time: 0.67, hits: [0.22], damage: 1.3, reach: 1.7, arc: 30, stamina: 10, chain: 0.4, power: 'l' },
    ],
    charge: { name: '亂斬', in: 'dg_c1_in', hold: 'dg_c1_hold', clip: 'dg_c1_out', time: 1.0, hits: [0.13, 0.31, 0.49], damage: [0.8, 1.2], full: 0.8,
      reach: 1.7, arc: [110, 110, 110], stamina: 14, chain: 0.62, power: 'l' },
    charge2: { name: '雙斬', hold: 'dg_c2_hold', clip: 'dg_c2', time: 0.87, hits: [0.14, 0.34], damage: [1.0, 1.3], reach: [1.6, 1.6], arc: [110, 110], stamina: 14,
      chain: 0.6, power: ['l', 'h'] },
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
  sword:   { main: ['longsword', 'dualsword', 'greatsword', 'falchion'] },   // 片手劍は二刀流（雙劍）にした（2026-11-10）
  polearm: { main: ['spear', 'pike', 'halberd'] },
  blunt:   { main: ['mace', 'warhammer', 'lucerne', 'flail'] },
  archer:  { main: ['longbow', 'crossbow'], side: ['dagger', 'falchion', 'battleaxe'] },
  cleric:  { main: ['mace'] },
};
/**
 * 楯の技（docs/DESIGN.md「楯の技」）。楯ごとに 2 つ：左手ボタンを短く押して離す技（tap）と、防禦の構えの間に攻擊ボタンの技（guardAttack）
 *   clip 動き（楯劍騎士の模型に入っている）、time 長さ（秒）、hit 当たる時刻（秒）、reach 間合い（m。体の太さの外から）、arc 当たる角度（度）、
 *   stamina、damage（この値の傷。武器の威力は使わない）、power 受けた側の動き（h：重い被弾）、
 *   push 押し返す距離（m。傷は無く、防禦の上からでも体勢を崩してよろめかせる）、pushTime 押し返す間（秒）
 */
export const SHIELD_SKILLS = {
  push: { name: '楯押', clip: 'sb_push', time: 0.73, hit: 0.30, reach: 1.25, arc: 80, stamina: 14, damage: 0, push: 2.0, pushTime: 0.8 },
  bash: { name: '楯擊', clip: 'sb_bash', time: 0.73, hit: 0.30, reach: 1.2, arc: 100, stamina: 16, damage: 9, power: 'h' },
};
/** 楯ごとの技（小楯の受流・大楯の楯突貫は、その楯の模型ができたら） */
export const SHIELD_MOVES = {
  kite: { tap: 'push', guardAttack: 'bash' },
};

/** 楯。planned：模型と動きがまだ無い */
export const SHIELDS = {
  // cut：防禦で受けたときに減らす割合（物理の攻撃だけ。利用者の指示 2026-11-10：中盾＝鳶形楯 100%・小楯 70%・大楯 100%）
  kite:    { name: '鳶形楯', cut: 1.0 },
  buckler: { name: '小楯', cut: 0.7, planned: true },
  pavise:  { name: '大楯', cut: 1.0, planned: true },
};
/** まだ模型と動きが無い武器の名前（題の画面に「未完」と出す） */
export const PLANNED = {
  falchion: '片刃劍', greatsword: '兩手大劍', pike: '長槍', halberd: '斧槍',
  flail: '連枷', battleaxe: '戰斧', crossbow: '弩',
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
  track: 10,               // 見つけた相手の居場所が、見失ってもこの秒だけ分かる（利用者の指示 2026-11-10）
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

/**
 * 体の向きと首（docs/DESIGN.md「動き」）：見回す（なぞる）と首だけが動き、体の向きは変わらない。体の向きは向きを変えるスティックで変える
 *   neckYaw：首だけで見られる左右（度）、neckUp・neckDown：上・下（度。首と上体で）、headSpeed：首が回る速さ（度/秒）
 *   turn：その場で足踏みしながら回る速さ（度/秒。鎧が重いほど遅い）。bot も同じ速さでしか向きを変えられない
 */
export const BODY_TURN = { neckYaw: 70, neckUp: 55, neckDown: 65, headSpeed: 320, turn: { light: 220, medium: 180, heavy: 150 } };

/**
 * 暗殺（docs/DESIGN.md「暗殺」）：攻擊ボタンとは別の「暗殺」ボタン。近く（reach）に暗殺できる相手がいると出る
 *   できるとき：壁裏隠れ・隠れ場所（タンス・ベッド）から飛び出すときだけ（見られていてもよい。利用者の指示 2026-11-10：何もない所ではできない）。
 *              seen は前の決まり（体の 7 割以上見られていなければどこでもできた）の数字で、今は使っていない
 *   grace：避ける猶予（秒）。この間に相手が回避すると失敗する（bot は前・横からなら 40%、その相手をもう見つけていれば必ず、後ろからは 35% 避ける。game/bot.js）
 *   dash：飛びかかる速さ（m/秒）
 *   moves：片手劍の暗殺の動き（onehand_moves.py）。背中側からは背刺、前・横からは滑斬
 *     gap 動き始めの相手との間（m）、kill 止めを刺す時刻（秒）、time 動きの長さ、end 動き終わりの体の位置（右 r・前 f。m）と向き（右回り yaw。度）
 *   片手劍を持たない人は、今までどおり飛びかかって強い一撃（ほかの武器の暗殺の動きは、その武器を作るときに作る）
 */
export const ASSASSIN = {
  reach: 3.0, seen: 0.7, grace: 0.45, dash: 8,
  moves: {
    back:  { clip: 'as_back',  victim: 'as_back_v',  gap: 0.64, kill: 0.40, time: 2.03, end: { r: 0, f: 0, yaw: 0 } },
    slide: { clip: 'as_slide', victim: 'as_slide_v', gap: 2.2,  kill: 0.60, time: 2.6,  end: { r: -0.42, f: 3.02, yaw: 150 } },
    // 鈍器（背後から）：相手の肩に振り下ろし（0.45 秒）、跪いたところへ頭に返しで振り下ろす（1.30 秒で倒す）。される側は全員同じ as_blunt_v
    mace_back:      { clip: 'mc_as_back', victim: 'as_blunt_v', gap: 0.95, kill: 1.30, time: 2.2, end: { r: 0, f: 0, yaw: 0 } },
    warhammer_back: { clip: 'wh_as_back', victim: 'as_blunt_v', gap: 1.20, kill: 1.30, time: 2.2, end: { r: 0, f: 0, yaw: 0 } },
    lucerne_back:   { clip: 'lc_as_back', victim: 'as_blunt_v', gap: 1.85, kill: 1.30, time: 2.2, end: { r: 0, f: 0, yaw: 0 } },
    // 短劍（背後から）：背中を刺す。片手劍の背刺と同じ並び・時刻（される側は as_back_v）
    dagger_back:    { clip: 'dg_as_back', victim: 'as_back_v', gap: 0.64, kill: 0.40, time: 2.03, end: { r: 0, f: 0, yaw: 0 } },
    // 雙劍（背後から）：2 本を同時に背中へ突き刺し、蹴り飛ばして抜く。片手劍の背刺と同じ並び・時刻（される側は as_back_v）
    dualsword_back: { clip: 'dw_as_back', victim: 'as_back_v', gap: 0.64, kill: 0.40, time: 2.03, end: { r: 0, f: 0, yaw: 0 } },
  },
  /** 武器ごとの暗殺の動き（back：相手の背中側から・front：前・横から）。無い所は、飛びかかって強い一撃 */
  byWeapon: {
    armingsword: { back: 'back', front: 'slide' }, dualsword: { back: 'dualsword_back', front: 'slide' },
    mace: { back: 'mace_back' }, warhammer: { back: 'warhammer_back' }, lucerne: { back: 'lucerne_back' }, dagger: { back: 'dagger_back' },
  },
};

/**
 * タンス・ベッドに隠れる・出る・探す動き（docs/DESIGN.md「隠れる・探す」。動きは tools/characters/hide_moves.py）。
 * どれも、家具の前の「出る所」に家具の方を向いて立ち、動きを最後までしてから隠れる・出る・開ける（利用者の指示）。
 * 探して見つけたら、そのまま引きずり出して止めを刺す（自動。避けられない）
 *   inClip・inTime：隠れる動きと長さ（秒。終わると隠れる）、outClip・outTime：出る動き（終わると家具に背を向けて立つ）
 *   searchClip・searchTime・revealAt：探す動き・長さ・中が見える時刻（ここで見つかる）
 *   drag：引きずり出して止め（clip 攻める側・victim される側・kill 止めの時刻・time 長さ・end 動き終わりの体の位置（右 r・前 f）と向き（右回り yaw））。
 *         引きずり出す動きは片手劍だけ（ほかの武器は、される側の動きに合わせて強い一撃。動きはその武器を作るときに作る）
 */
export const HIDE_ACTS = {
  wardrobe: { inClip: 'hide_wd_in', inTime: 1.7, outClip: 'hide_wd_out', outTime: 1.0, searchClip: 'search_wd', searchTime: 1.1, revealAt: 0.8,
    drag: { clip: 'drag_wd', victim: 'drag_wd_v', kill: 1.70, time: 2.53, end: { r: 1.22, f: -0.25, yaw: 25 } } },
  bed: { inClip: 'hide_bed_in', inTime: 1.6, outClip: 'hide_bed_out', outTime: 1.47, searchClip: 'search_bed', searchTime: 1.2, revealAt: 0.7,
    drag: { clip: 'drag_bed', victim: 'drag_bed_v', kill: 1.40, time: 2.27, end: { r: 0.02, f: -0.48, yaw: 40 } } },
};

/** 戦闘の決まりごと */
export const COMBAT = {
  staminaRegen: 22,        // 1 秒に戻るスタミナ
  staminaRegenDelay: 0.6,  // 使ってから戻り始めるまで（秒）
  maxStamina: 100,
  guardReduce: 0.75,       // 防御で減らせる割合（盾なし）
  guardReduceShield: 0.9,  // 盾あり（楯ごとの割合は SHIELDS の cut。無いときだけこれ）
  guardHeavyImpact: 26,    // 防禦で受けた一撃がこれより強い（傷の元の大きさ）か、重い攻撃なら「強い受け」（guard_h）。弱ければ「弱い受け」（guard_l）
  guardArc: 120,           // 防御できる角度（前方、度）
  guardStaminaPerDamage: 1.0, // 防御で受けたダメージ 1 ごとに使うスタミナ
  guardMoveScale: 0.5,     // 防御中の移動の速さ
  attackMoveScale: 0.55,   // 攻撃中の移動の速さ
  bodyRadius: 0.4,         // 当たり判定の体の太さ（m）
  bodyHeight: 1.8,
  gravity: 9.8,
};

/**
 * 全速力（疾驅ボタン。利用者の指示 2026-11-10）：押してから動き出すと time 秒の間、移動スティックを倒すと speed m/s で走る。
 * 終わったら cooldown 秒は使えない（待ち時間は Claude の案）。全速力の間の攻擊ボタンは疾驅攻撃（DASH_ATTACKS）
 */
export const SPRINT = { time: 10, cooldown: 10, speed: 8.0 };

/**
 * 疾驅攻撃（全速力の間の通常攻撃）：威力が大きい反面、隙も大きい（利用者の指示）。動きは、その武器の強い技の動きを使う
 *   clip・time・hits は技と同じ書き方。damage は武器の damage に掛ける倍率、recover は動きの後に動けない時間（秒。隙）、
 *   lunge は振り始めに前へ滑る距離（m）と時間（秒）
 */
export const DASH_ATTACKS = {
  armingsword: { name: '疾驅斬', clip: 'oh_c1_out', time: 0.8, hits: [0.16], damage: 2.0, reach: 2.4, arc: 110 },
  longsword:   { name: '疾驅斬', clip: 'ls_c1_out', time: 0.93, hits: [0.16], damage: 2.0, reach: 3.0, arc: 40 },
  mace:        { name: '疾驅擊', clip: 'mc_c1_out', time: 0.97, hits: [0.16], damage: 2.0, reach: 2.1, arc: 70 },
  warhammer:   { name: '疾驅擊', clip: 'wh_c1_out', time: 1.27, hits: [0.2, 0.6], damage: 1.6, reach: 2.3, arc: 90 },
  lucerne:     { name: '疾驅擊', clip: 'lc_cut1', time: 1.0, hits: [0.38], damage: 2.0, reach: 3.3, arc: 50 },
  dagger:      { name: '疾驅刺', clip: 'dg_cut3', time: 0.67, hits: [0.22], damage: 2.2, reach: 1.9, arc: 40 },
  dualsword:   { name: '疾驅斬', clip: 'dw_cut3', time: 0.93, hits: [0.32], damage: 2.2, reach: 2.3, arc: 90 },
  spear:       { name: '疾驅突', clip: 'heavy', time: 1.27, hits: [0.55], damage: 2.0, reach: 3.3, arc: 60 },
};
/** 疾驅攻撃の共通の数値：隙（動けない秒）・前へ滑る距離と時間・スタミナ・威力 */
export const DASH = { recover: 0.75, lunge: 1.6, lungeTime: 0.35, stamina: 24, power: 'h' };

/** bot 同士で戦う確率（利用者の指示 2026-11-10：bot 同士の戦いを減らす）。別の bot を見つけたとき、この確率で戦う（決めたら fightFor 秒は変えない）。
 *  攻撃してきた相手とは、いつでも戦う */
export const BOT_RIVALRY = { fight: 0.25, fightFor: 20 };

/** bot の名前（練習モードの相手） */
export const BOT_NAMES = ['玄馬', '志乃', '伊吹', '颯', '朱音', '鐵心'];

/**
 * フェーズ。duration：長さ（秒）、radius：歩ける範囲の半径（m）、time：時間帯（world/time-of-day.js の TIMES）
 * 歩ける範囲はフェーズで広げない（最初から森全体）。フェーズが進むと時間帯が変わり、夜に向かう
 * 最後のフェーズの時間が切れたら、生き残りが 1 人になるまで延長する
 */
export const AREA_RADIUS = 175;   // js/config.js の world.playRadius と同じ値（端から端まで 350m）
export const PHASES = [
  { name: '第1刻', duration: 180, radius: AREA_RADIUS, time: 'morning', note: '朝の森。息を潜め、敵を探せ' },
  { name: '第2刻', duration: 180, radius: AREA_RADIUS, time: 'day',     note: '日が高くなった' },
  { name: '第3刻', duration: 180, radius: AREA_RADIUS, time: 'dusk',    note: '日が傾き、森が赤く染まる' },
  { name: '第4刻', duration: 180, radius: AREA_RADIUS, time: 'night',   note: '夜が来た。暗い森に気をつけよ' },
  { name: '終刻', duration: 240, radius: AREA_RADIUS, time: 'night',   note: '最後の一人になるまで終わらない' },
];

/**
 * 技能（スキル。docs/DESIGN.md「技能」）：技能ボタンを押して使う。使うと効き目が time 秒続き、使った後は cd 秒待つとまた使える
 *   專用技能：キャラ 1 人に 1 つ（最初から使える）。共通技能：全キャラ共通で、刻を越えるたびの報酬で 3 つから 1 つ選ぶ（最大 4 つ）
 *   type：SKILL_TYPES。planned：まだゲームの中で使えない（今は圖鑑に載せるだけ。数字は案）
 */
export const SKILL_TYPES = { finisher: '必殺', buff: '強化', hinder: '妨害', heal: '回復', stealth: '隱密', sense: '探知' };
export const EXCLUSIVE_SKILLS = {
  // 利用者の指示（2026-11-10）の專用技能。名前・効き目の秒・待ち時間（cd）の数字は Claude の案。effect は game/skills.js と combat.js が見る
  shield:  { name: '反擊', type: 'buff', effect: 'counter', time: 8, cd: 45,
             desc: '8 秒、楯で受けると、すぐに自動で強い反撃を返す（その武器の溜攻撃 1 を、速く・強く）。反撃を受けた相手は大きくひるむ' },
  sword:   { name: '奧義', type: 'finisher', effect: 'ultimate', time: 0, cd: 60,
             desc: '雙劍：2 本を交差させて低く構え、前へ 7 m を高速で滑りながら、通り抜けざまに左右へ切り裂く（3 回当たる）。長劍・大劍：頭上から振り下ろして切っ先を地面にめり込ませ（周りの敵に当たる）、引き抜きざまに砂煙ごと斬り上げる（2 回当たる）' },
  polearm: { name: '強靱', type: 'buff', effect: 'tough', time: 10, cd: 50,
             desc: '10 秒、体幹と防禦力が上がる（受ける傷が 3 分の 2 になる）。どんな攻撃を受けてもひるまず、振り・溜めも止まらない（楯押でも崩れない）' },
  blunt:   { name: '剛力', type: 'buff', effect: 'might', time: 10, cd: 50,
             desc: '10 秒、一撃の衝撃が大きく上がる（傷が 1.5 倍）。楯の上からでも傷の半分が通り、当たった相手は大きくひるむ（重い一撃はよろめかせる）' },
  archer:  { name: '鷹目', type: 'sense', effect: 'hawk', time: 12, cd: 60,
             desc: '12 秒、目に映る物が白黒になり、80 m 以内の敵が体温で壁越しに見える（隠れ場所の中も）。その間に放つ最初の 1 本は、人も木も壁も貫く矢になる（傷 2 倍・防禦できない）' },
  cleric:  { name: '神怒', type: 'finisher', effect: 'wrath', time: 0, cd: 90,
             desc: '胸の前で腕を交差して宙に浮き、腕を広げて神の衝撃波を広く放つ（周り 9 m。楯では防げない）。周りの人に傷を与えて吹き飛ばす' },
};
/**
 * 劍騎士の奧義（必殺技。技能ボタン）：持っている武器ごとの動き（利用者の指示 2026-11-10。数字は Claude の案）。
 *   clip・time：動きと長さ、hits：当たる時刻、damage・reach・arc：当たるごとの倍率・間合い（m）・角度、power：当たりの重さ、
 *   slide：前へ滑る（from〜to 秒の間に dist m。雙劍）、dust：砂煙を立てる時刻と、立つ所（体の前 m。長劍・大劍）、pierce：防禦の上から通る割合
 */
export const SWORD_ULT = {
  dualsword: { name: '奧義・交差滑斬', clip: 'dw_ult', time: 1.47, hits: [0.48, 0.62, 0.74], damage: [1.3, 1.3, 2.0], reach: 2.0, arc: [150, 150, 200],
    power: ['l', 'l', 'h'], slide: { from: 0.30, to: 0.76, dist: 7 }, pierce: 0.3 },
  longsword: { name: '奧義・地穿昇斬', clip: 'ls_ult', time: 1.87, hits: [0.42, 1.16], damage: [2.6, 2.4], reach: [3.0, 2.8], arc: [80, 100],
    power: ['h', 'h'], dust: { at: 0.42, ahead: 1.6, lift: 1.16 }, pierce: 0.5 },
};
SWORD_ULT.greatsword = SWORD_ULT.longsword;   // 兩手大劍ができたら、同じ奧義を使う

/**
 * 祓魔僧の神怒（必殺。技能ボタン）：動き cl_ult（time 秒）の at 秒で衝撃波を放つ（tools/characters/cleric_moves.py の RELEASE と同じ）。
 *   radius：届く所（m）、damage：傷（近いほど大きい。端で minK 倍）、push：吹き飛ぶ距離（m。近いほど遠く）、stun：ひるむ秒、
 *   数字は Claude の案。家が壊れる仕組みは、利用者の指示（2026-11-13）で消した
 */
export const WRATH = { clip: 'cl_ult', time: 2.7, at: 1.4, radius: 9, damage: 34, minK: 0.4, push: 7, pushMin: 2.5, stun: 1.6 };

/** 專用技能の効き目の数字（game/combat.js・game/bot.js・render/heat-vision.js が使う） */
export const SKILL_FX = {
  counter: { damage: 2.4, speed: 1.35, arc: 150, reachAdd: 0.3, reach: 4.0 },   // 反擊：溜攻撃 1 を 1.35 倍の速さで。傷は武器の 2.4 倍。受けた相手が reach m 以内なら返す
  tough:   { defense: 1.5 },                                                     // 強靱：受ける傷を 1.5 で割る。ひるまない
  might:   { damage: 1.5, pierce: 0.5 },                                         // 剛力：傷 1.5 倍、楯の上から半分通る、当たりは重く（重い一撃はよろめき）
  hawk:    { range: 80, arrowDamage: 2.0, arrowSpeed: 1.3, arrowLife: 3 },      // 鷹目：見える距離（m）、貫く矢の傷・速さの倍率と飛ぶ秒
};
export const SHARED_SKILLS = {
  imbue:   { name: '屬性付與', type: 'buff', time: 15, cd: 60, planned: true,
             desc: '15 秒、武器にマップの屬性を宿す（森は火。当たった相手は燃えて少しずつ傷が増え、草や木に燃え移る）' },
  warcry:  { name: '鬨聲', type: 'hinder', time: 0, cd: 45, planned: true,
             desc: '雄叫び。周り 8 m の敵が 1 秒ひるみ、自分のスタミナが全部戻る。大きな声なので居場所が知れる' },
  gale:    { name: '疾風', type: 'buff', time: 8, cd: 40, planned: true,
             desc: '8 秒、移動が 30% 速くなり、走る・回避でスタミナが減らない' },
  ironskin:{ name: '鐵膚', type: 'buff', time: 8, cd: 50, planned: true,
             desc: '8 秒、受ける傷が 40% 減り、軽い攻撃ではひるまない' },
  bandage: { name: '止血', type: 'heal', time: 4, cd: 60, planned: true,
             desc: '4 秒かけて体力の 35% が戻る。その間は攻撃できず、ゆっくり歩く' },
  smoke:   { name: '煙玉', type: 'hinder', time: 8, cd: 45, planned: true,
             desc: '投げた所に煙が 8 秒広がる（半径 6 m）。中も、その向こうも見えない' },
  shadow:  { name: '隱形', type: 'stealth', time: 10, cd: 50, planned: true,
             desc: '10 秒、足音と息遣いがしない。しゃがみ歩きが、ふつうの歩きと同じ速さになる' },
  foresee: { name: '見切', type: 'buff', time: 5, cd: 40, planned: true,
             desc: '5 秒以内に受けた最初の攻撃を、自動でぴったり回避する。そのあと周りが 2 秒ゆっくりになる' },
};

/**
 * 戰鬥（試合の形）と戰場（マップ）。大廳の「戰鬥」から選ぶ。今は蠱毒と森だけ
 */
export const MODES = {
  kodoku: { name: '蠱毒', desc: '4 人で、最後の 1 人になるまで生き残りを争う。試合は刻（こく）という区切りで進み、時間が来るたびに次の刻へ移って、越えると褒美を選べる。今は練習（あなた＋コンピューターが動かす相手 3 人）' },
};
export const MAPS = {
  forest: { name: '森', desc: '混淆林・深林・大草原・村。端から端まで 350m。刻が進むと、朝から昼・夕暮れ・夜へ移る' },
};
/** 時代（キャラ・兵器の時代。今は中世だけ。キャラに era が無ければ中世） */
export const ERAS = { medieval: { name: '中世' } };

/**
 * 兵器と變異：試合の前に、キャラの時代のものからそれぞれ 1 つだけ選ぶ。強いほど遅く届く
 *   tier：この番号の刻（1 なら第1刻）を越えたとき（時間が止まる間）に届く
 *   兵器は届くと近くに来る（馬は呼ぶと来る、攻城兵器は近くに置かれる）。變異はクリーチャーに変わる藥で、届いた後いつでも飲める
 *   planned：中身（乗る・撃つ・クリーチャーになる）はまだ無い。今は届いた知らせだけ
 */
export const ARMS = {
  horse:     { name: '馬',     tier: 1, era: 'medieval', desc: '速く走れる。呼ぶと来る', planned: true },
  barded:    { name: '鎧馬',   tier: 2, era: 'medieval', desc: '鎧を着けた馬。矢や刃に強い。呼ぶと来る', planned: true },
  ballista:  { name: '弩砲',   tier: 3, era: 'medieval', desc: '大きな弩。遠くの敵を貫く。近くに置かれる', planned: true },
  trebuchet: { name: '投石機', tier: 4, era: 'medieval', desc: '大きな石を遠くへ投げる。近くに置かれる', planned: true },
};
export const MUTATIONS = {
  potion1: { name: '1號藥', tier: 1, era: 'medieval', creature: null, desc: '飲むと小さなクリーチャーに変わる', planned: true },
  potion2: { name: '2號藥', tier: 2, era: 'medieval', creature: null, desc: '飲むと中くらいのクリーチャーに変わる', planned: true },
  potion3: { name: '3號藥', tier: 3, era: 'medieval', creature: null, desc: '飲むと大きなクリーチャーに変わる', planned: true },
  potion4: { name: '4號藥', tier: 4, era: 'medieval', creature: null, desc: '飲むと最も強いクリーチャーに変わる', planned: true },
};

/** ポイント */
export const POINTS = {
  phaseSurvive: [50, 75, 100, 150, 200], // フェーズを生き残るたび（フェーズの番号ごと）
  killCreature: 30,
  killPlayer: 150,
  killMutatedPlayer: 250,   // クリーチャー状態（変異薬）のプレイヤーを倒す
  killEnhancedPlayer: 200,  // 肉体強化状態のプレイヤーを倒す
  lastSurvivor: 600,        // 最後の生き残り
};

/**
 * 刻（フェーズ）が変わったら、全員がこの秒数だけ止まる（利用者の指示）：時間が止まり、誰も動けず、攻撃も当たらない（矢も止まる）。
 * その間にフェーズ報酬を選ぶ（REWARD_PICK_TIME 秒。過ぎたら最初の候補を自動で選ぶ）
 */
export const PHASE_FREEZE = 5;
/** 刻の終わりの、この秒数から 1 秒ごとに時計台の秒針の音（カチッ）を鳴らす。0 秒で鐘（カーンカーン） */
export const PHASE_TICKS = 10;
export const REWARD_PICK_TIME = PHASE_FREEZE;

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
