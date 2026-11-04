// 姿勢（計算だけ）：立つ・しゃがむ・伏せる。人間も bot も同じ決まりで動く
//   押す（tap）：立っている → しゃがむ、しゃがんでいる → 立つ、伏せている → 起き上がる
//   長押し（hold）：伏せる（少し時間がかかり、その間は動けない）。起き上がるのも同じ
//   しゃがんでいて攻撃・左手・回避を押すと、すぐ立って、そのまま動く。伏せているときは、まず起き上がる（その押下では何もしない）
//   隠れる・見つかる・倒れるなどで、立った姿勢に戻る
import { STANCES, STANCE_TIME } from './data.js';

/** 戦う人に姿勢の記録を付ける */
export function initStance(f) {
  f.stance = 'stand';     // 今の姿勢
  f.stanceTo = null;      // 移っている途中の姿勢（伏せる・起き上がる）
  f.stanceT = 0;          // 移り終わるまでの残り時間
}

/** 姿勢を変える */
export function setStance(f, want) {
  if (!f.alive || f.hidden || f.helpless > 0) return;
  const now = f.stanceTo || f.stance;
  if (want === now) return;
  // 伏せる・伏せから起き上がるのは時間がかかる。しゃがむ・立つはすぐ
  if (want === 'prone' || now === 'prone' || f.stance === 'prone') {
    f.stanceTo = want;
    f.stanceT = want === 'prone' ? STANCE_TIME.down : STANCE_TIME.up;
    return;
  }
  f.stance = want; f.stanceTo = null; f.stanceT = 0;
}

/** ボタン：押した（tap）・長押しした（hold） */
export function stanceButton(f, kind) {
  const now = f.stanceTo || f.stance;
  if (kind === 'hold') setStance(f, 'prone');
  else setStance(f, now === 'stand' ? 'crouch' : 'stand');
}

/** すぐ立った姿勢に戻す（隠れた・見つかった・倒れた・出現） */
export function resetStance(f) { f.stance = 'stand'; f.stanceTo = null; f.stanceT = 0; }

/** 毎フレーム：移っている途中の姿勢を進める */
export function updateStance(f, dt) {
  if (f.stanceT > 0) {
    f.stanceT -= dt;
    if (f.stanceT <= 0) { f.stance = f.stanceTo; f.stanceTo = null; f.stanceT = 0; }
  }
}

/** 今、動けるか（伏せる・起き上がる途中は動けない） */
export const canMove = (f) => !(f.stanceT > 0);
/** 歩く速さの倍率（走れない姿勢は、歩きの速さまで） */
export const stanceSpeed = (f) => (f.stanceT > 0 ? 0 : STANCES[f.stance || 'stand'].speed);
/** 走れるか */
export const canRun = (f) => (f.stance || 'stand') === 'stand' && !(f.stanceT > 0);

/**
 * 目と体の高さ（伏せる・起き上がる途中は、間を取る）
 * @returns {{ eye: number, height: number, prone: number }} prone：伏せている割合（0〜1。体が横になっている度合い）
 */
export function stanceShape(f) {
  const a = STANCES[f.stance || 'stand'];
  if (!(f.stanceT > 0)) return { eye: a.eye, height: a.height, prone: f.stance === 'prone' ? 1 : 0 };
  const b = STANCES[f.stanceTo];
  const total = f.stanceTo === 'prone' ? STANCE_TIME.down : STANCE_TIME.up;
  const k = 1 - f.stanceT / total;
  const lerp = (x, y) => x + (y - x) * k;
  const pa = f.stance === 'prone' ? 1 : 0, pb = f.stanceTo === 'prone' ? 1 : 0;
  return { eye: lerp(a.eye, b.eye), height: lerp(a.height, b.height), prone: lerp(pa, pb) };
}
