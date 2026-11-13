// 武器の技（片手劍・長劍）の流れ。計算だけ（PlayCanvas に依存しない。game/combat.js から使う）
//   攻擊ボタンを短く押す＝通常攻撃（1 段目 → 2 段目 → また 1 段目。攻撃の途中で押しておけば、次の段へつながる）
//   長押し（TECH.hold 秒）＝溜める。離すと溜攻撃 1（溜めた長さで強くなる）
//   溜攻撃 1 の一撃のすぐ後に、もう一度長押しして離す＝溜攻撃 2
// 数値は game/data.js の TECHNIQUES・TECH
import { WEAPONS, TECHNIQUES, TECH } from './data.js';

const lerp = (a, b, t) => a + (b - a) * t;
const nth = (v, i) => (Array.isArray(v) ? v[Math.min(i, v.length - 1)] : v);

/** この武器の技（無ければ null。今までの振り a1〜a3 と強攻撃を使う） */
export const techSetOf = (weaponId) => TECHNIQUES[weaponId] || null;

/**
 * 技の i 回目の当たりの数値（武器の数値に、技の倍率を掛ける）
 * @param {number} charge 溜めた割合（0〜1。溜攻撃 1 だけ）
 */
export function techStrike(weaponId, tech, i, charge = 0) {
  const w = WEAPONS[weaponId];
  const mul = tech.full ? lerp(tech.damage[0], tech.damage[1], charge) : nth(tech.damage, i);
  // 防禦の上から通る割合：武器の分か、技の分（奧義など）の大きい方
  return { damage: w.damage * mul, reach: nth(tech.reach, i), arc: nth(tech.arc, i), guardPierce: Math.max(w.guardPierce || 0, tech.pierce || 0), power: nth(tech.power, i) };
}

/** 攻撃を受けてひるんだ：押していたボタン・先に押しておいた次の段を忘れる */
export function interruptTech(f) {
  f._press = null;
  f._queued = false;
}

/** 技を 1 つ始める。paid：スタミナはもう払った（溜攻撃 1 は溜め始めに払う） */
function start(f, tech, name, step, ctx, charge = 0, paid = false) {
  if (!paid) {
    if (f.stamina < tech.stamina * 0.5) return false;
    ctx.spend(f, tech.stamina);
  }
  f.action = { kind: 'attack', t: 0, hit: false, heavy: false, tech, name, step, charge, n: 0 };
  f._queued = false;
  ctx.emit('swing', { fighter: f, heavy: nth(tech.power, 0) === 'h', tech });
  return true;
}

/**
 * 入力（毎フレーム。combat.control から、回避・持ち替えを見た後に呼ぶ）
 * @param {object} ctx { pressed, released（攻擊ボタンを押した・離した瞬間）, spend(f, n), emit(type, data) }
 * @param {number} now 試合の時計（秒）
 */
export function controlTech(f, set, input, now, ctx) {
  const a = f.action;
  if (ctx.pressed) f._press = { at: now, follow: now <= (f._followUntil ?? -1), used: false };
  const p = f._press;
  // 長押しになった：溜攻撃 1 のすぐ後なら 2 段目を待つ（溜攻撃 1 の一撃の後なら、戻りを待たずに移る）。ほかは溜め始める
  if (input.attack && p && !p.used && now - p.at >= TECH.hold) {
    if (p.follow && set.charge2 && (!a || (a.kind === 'attack' && a.name === 'charge' && a.hit))) {
      p.used = true;
      f.action = { kind: 'charge2', t: 0 };
      f._queued = false;
      ctx.emit('charge', { fighter: f, second: true });
    } else if (!a && f.stamina >= set.charge.stamina * 0.5) {
      p.used = true;
      ctx.spend(f, set.charge.stamina);
      f.action = { kind: 'charge', t: 0, tech: set.charge };
      f._queued = false;
      ctx.emit('charge', { fighter: f, second: false });
    }
  }
  // 溜めている間にボタンが離れていれば、離した瞬間を見逃していても放つ（隠れる・ひるむなどで入力を受けなかったとき）
  const charging = a?.kind === 'charge' || a?.kind === 'charge2';
  if (!ctx.released && !(charging && !input.attack)) return;
  // 離した：溜めていれば放つ。短く押しただけなら通常攻撃（攻撃の途中なら、次の段として覚えておく）
  if (a?.kind === 'charge') start(f, set.charge, 'charge', 0, ctx, Math.min(1, a.t / set.charge.full), true);
  else if (a?.kind === 'charge2') { if (!start(f, set.charge2, 'charge2', 0, ctx)) f.action = null; }
  else if (p && !p.used) {
    if (!a) {
      const step = (f._comboUntil ?? -1) >= now ? (f._comboStep + 1) % set.combo.length : 0;
      start(f, set.combo[step], 'combo', step, ctx);
    } else if (a.kind === 'attack' && a.tech) {
      f._queued = true;
    }
  }
  f._press = null;
}

/**
 * 技を進める（毎フレーム。a.t はもう進めてある）
 * @param {object} ctx { strike(f, stats), spend, emit }
 */
export function updateTech(f, a, now, ctx) {
  const T = a.tech, set = techSetOf(f.weapon);
  // 当たる時刻になった当たり（2 回ある技は 2 回）
  while (a.n < T.hits.length && a.t >= T.hits[a.n]) {
    ctx.strike(f, techStrike(f.weapon, T, a.n, a.charge));
    a.n++;
    a.hit = true;
    // 溜攻撃 1 の一撃：ここから動きの終わりの少し後まで、溜攻撃 2 へつながる
    if (a.name === 'charge' && a.n === 1) f._followUntil = now + (T.time - a.t) + TECH.followWindow;
  }
  // 動きの後に隙がある技（疾驅攻撃）：動きが終わったら recover 秒動けない
  const finish = () => { f.action = T.recover ? { kind: 'recover', t: 0, time: T.recover } : null; };
  if (!set || T.single) { if (a.t >= T.time) { finish(); f._queued = false; } return; }   // 1 回だけの技（疾驅攻撃・反擊）：次の段へつながない
  // 先に押しておいた次の段へ（溜攻撃の後は通常攻撃の 1 段目）
  if (f._queued && a.hit && a.t >= T.chain) {
    const step = a.name === 'combo' ? (a.step + 1) % set.combo.length : 0;
    if (!start(f, set.combo[step], 'combo', step, ctx)) { f.action = null; f._queued = false; }
    return;
  }
  if (a.t >= T.time) {
    f.action = null;
    if (a.name === 'combo') { f._comboStep = a.step; f._comboUntil = now + TECH.comboWindow; }
    else f._comboUntil = -1;
  }
}
