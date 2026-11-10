// 技能（專用技能）：技能ボタンで使う（docs/DESIGN.md「技能」）。計算だけ（PlayCanvas に依存しない）。
//   使うと効き目が time 秒続き、効き目が切れてから cd 秒待つとまた使える（数字は data.js の EXCLUSIVE_SKILLS・SKILL_FX）。
//   効き目そのもの（反擊・強靱・剛力・鷹目の矢）は game/combat.js、bot の使い方は game/bot.js、鷹目の見え方は render/heat-vision.js
import { EXCLUSIVE_SKILLS } from './data.js';

/** その人の專用技能（まだ作っていない技能は null） */
export function skillOf(f) {
  const s = f && EXCLUSIVE_SKILLS[f.char];
  return s && !s.planned ? s : null;
}

/** 技能の効き目が今あるか。effect：counter（反擊）・tough（強靱）・might（剛力）・hawk（鷹目） */
export function skillOn(f, effect) {
  return !!f && f.skillLeft > 0 && skillOf(f)?.effect === effect;
}

/** 今使えるか（効き目の間と、待ち時間の間は使えない） */
export function skillReady(f) {
  return !!skillOf(f) && f.alive && !(f.skillLeft > 0) && !(f.skillCool > 0);
}

/** 使う。使えたら true（鷹目は、次に放つ 1 本が貫く矢になる） */
export function useSkill(f) {
  const s = skillOf(f);
  if (!s || !skillReady(f)) return false;
  f.skillLeft = s.time;
  f.skillCool = 0;
  if (s.effect === 'hawk') f.pierceArrow = true;
  return true;
}

/** 時間を進める（毎フレーム。時間が止まっている間は呼ばない） */
export function updateSkill(f, dt) {
  if (f.skillLeft > 0) {
    f.skillLeft -= dt;
    if (f.skillLeft <= 0) { f.skillLeft = 0; f.skillCool = skillOf(f)?.cd ?? 0; f.pierceArrow = false; }
    return;
  }
  if (f.skillCool > 0) f.skillCool = Math.max(0, f.skillCool - dt);
}
