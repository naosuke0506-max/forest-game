// 試合のデータ：キャラ・フェーズ・ポイント・フェーズ報酬。
// 数値はすべてここに集める（調整しやすく、後で武器や時代を増やしやすくするため）

/** 中世のキャラ。weapon は「作れる武器の系統」（手順 4 のクラフトで使う） */
export const CHARACTERS = {
  knight:  { name: '騎士', weapon: 'slash',  desc: '剣を使いこなす。受け流しと反撃、馬上の突撃が得意', color: '#d8b45c' },
  archer:  { name: '弓兵', weapon: 'bow',    desc: '弓を使いこなす。遠くから連射し、矢を自分で作れる', color: '#7cc070' },
  maceman: { name: '鎚兵', weapon: 'blunt',  desc: '打撃武器を扱う。鎧の上から効き、強化状態やクリーチャーに強い', color: '#c8433a' },
  spearman:{ name: '槍兵', weapon: 'thrust', desc: '刺突武器を扱う。間合いが長く、突撃を止める', color: '#5a9fd0' },
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
