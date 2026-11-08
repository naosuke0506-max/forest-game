// 攻撃を受けたときの動き：被弾（軽い・重い）・よろめき・防禦の受け（弱い・強い）。計算だけ（game/combat.js から使う）
//   被弾とよろめきは、攻撃された向き（前・後ろ・左・右）で動きが変わり、重い被弾とよろめきは押された向きへ下がる
//   見た目（どの動きを流すか）は render/character-view.js が f.react を見て決める。数値は game/data.js の REACT
import { REACT } from './data.js';

const DEG = Math.PI / 180;
const wrap = (a) => ((a + 540) % 360) - 180;
let nextId = 1;

/** 攻撃された向き：受けた人から見て、攻撃した所が前（f）・後ろ（b）・左（l）・右（r）のどれか */
export function hitDir(f, fromX, fromZ) {
  const to = Math.atan2(-(fromX - f.x), -(fromZ - f.z)) / DEG;
  const rel = wrap(to - f.yaw);   // 正なら左（向き yaw は左回りが正）
  if (Math.abs(rel) <= 45) return 'f';
  if (Math.abs(rel) >= 135) return 'b';
  return rel > 0 ? 'l' : 'r';
}

/**
 * 受けた動きを決める
 * @param {object} o { guarded（楯で受けた）, broke（防禦が崩れた）, power（l 軽い / h 重い）, pierce（防禦の上から響く割合） }
 */
export function reactKind(target, { guarded, broke, power, pierce }) {
  if (broke) return 'stagger';
  if (guarded) return power === 'h' || pierce > 0 ? 'guard_h' : 'guard_l';
  if (power !== 'h') return 'hit_l';
  // 重い被弾でひるんでいる間に、また重い一撃を受けた：よろめく
  const r = target.react;
  return target.stun > 0 && r && (r.kind === 'hit_h' || r.kind === 'stagger') ? 'stagger' : 'hit_h';
}

/** 受けた動きを始める：ひるむ時間と、押される向き（攻撃した所から離れる向き） */
export function startReact(f, kind, fromX, fromZ) {
  const R = REACT[kind];
  const dx = f.x - fromX, dz = f.z - fromZ, d = Math.hypot(dx, dz) || 1;
  f.react = {
    kind, dir: kind.startsWith('guard') ? null : hitDir(f, fromX, fromZ), id: nextId++, t: 0,
    px: dx / d, pz: dz / d, push: R.push || 0, time: R.time || 0, done: 0,
    moved: { x: 0, z: 0 },   // 押されて実際に下がった分（木や壁に当たれば少ない。見た目はこの分だけ戻して描く）
  };
  f.stun = Math.max(f.stun, R.stun);
}

/**
 * 押されて下がる（始めに速く、終わりにゆっくり。動きの 7 割の間に下がりきる）
 * @param {(f: object, dx: number, dz: number) => [number, number]} move 動かして、実際に動いた分を返す（木や壁を避ける）
 */
export function updateReact(f, dt, move) {
  const r = f.react;
  if (!r) return;
  r.t += dt;
  if (!r.push || r.done >= r.push) return;
  const u = Math.min(1, r.t / (r.time * 0.7));
  const goal = r.push * (1 - (1 - u) * (1 - u));
  const step = goal - r.done;
  r.done = goal;
  const [mx, mz] = move(f, r.px * step, r.pz * step);
  r.moved.x += mx; r.moved.z += mz;
}
