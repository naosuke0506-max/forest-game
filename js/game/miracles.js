// 祓魔僧の奇跡（docs/DESIGN.md「祓魔僧の奇跡」）。計算だけ（PlayCanvas に依存しない）。
//   利用者の指示（2026-11-17）：刻を越えたときの褒美で、奇跡を 3 つから 1 つ選んで覚える（最大 4 つ。そろった後は能力値）。
//   左手の奇跡ボタン（PC は K）で選んでいる奇跡を唱え、替ボタン（PC は H）で次の奇跡へ替える。全部で 7 つ（2 回に分けて作った）。
//   唱えるのは game/combat.js（動きの間に攻撃を受けてひるむと途切れる）。効き目の数字は data.js の MIRACLES
//
//   f.miracle = { owned: [名前…], sel: 選んでいる番号, cool: { 名前: 残りの待ち時間 } }
//   効き目：f.blessing（蘇生の加護の残り秒）・f.flame（淨炎の残り秒）・f.burn（燃えている { left, dps, by }）・
//          f.invuln（傷を受けない残り秒。蘇った後）・f.blind（天光柱の目くらまし）・f.shock（神罰雷のしびれ）。
//          光壁・聖火彈・神罰雷・天光柱は combat.js が持つ（walls・spells・strikes）
import { CHARACTERS, MIRACLES, MIRACLE_SLOTS } from './data.js';

/** 奇跡を使う人か（祓魔僧） */
export const canMiracle = (f) => !!f && CHARACTERS[f.char]?.left === 'miracle';

/** 今ゲームで使える奇跡の名前（2 回目の物はまだ使えない） */
export const MIRACLE_IDS = Object.keys(MIRACLES).filter((id) => !MIRACLES[id].planned);

function state(f) {
  if (!f.miracle) f.miracle = { owned: [], sel: 0, cool: {} };
  return f.miracle;
}

/** 覚えている奇跡（名前の並び） */
export const miraclesOf = (f) => f?.miracle?.owned || [];

/** 選んでいる奇跡の名前（覚えていなければ null） */
export function selectedMiracle(f) {
  const m = f?.miracle;
  return m && m.owned.length ? m.owned[Math.min(m.sel, m.owned.length - 1)] : null;
}

/** 覚える（覚えたら選ぶ）。覚えられたら true */
export function learnMiracle(f, id) {
  const m = state(f);
  if (!MIRACLES[id] || MIRACLES[id].planned || m.owned.includes(id) || m.owned.length >= MIRACLE_SLOTS) return false;
  m.owned.push(id);
  m.sel = m.owned.length - 1;
  return true;
}

/** 次の奇跡へ替える。替えたら true */
export function cycleMiracle(f) {
  const m = f?.miracle;
  if (!m || m.owned.length < 2) return false;
  m.sel = (m.sel + 1) % m.owned.length;
  return true;
}

/** 名前で選ぶ（bot が使う） */
export function selectMiracle(f, id) {
  const m = f?.miracle;
  const i = m ? m.owned.indexOf(id) : -1;
  if (i >= 0) m.sel = i;
  return i >= 0;
}

/** 残りの待ち時間（秒） */
export const miracleCool = (f, id) => f?.miracle?.cool[id] || 0;

/** 今唱えられるか（覚えていて、待ち時間が無い。蘇生は加護の間は唱えられない） */
export function miracleReady(f, id) {
  if (!f?.alive || !miraclesOf(f).includes(id) || miracleCool(f, id) > 0) return false;
  if (id === 'revive' && f.blessing > 0) return false;
  return true;
}

/** 効き目が出たときに、待ち時間を始める（蘇生は加護が終わってから） */
export function startCool(f, id) {
  const M = MIRACLES[id];
  state(f).cool[id] = id === 'revive' ? 0 : M.cd;
}

/**
 * 時間を進める（毎フレーム。時間が止まっている間は呼ばない）。燃えている傷は combat.js が与える
 */
export function updateMiracles(f, dt) {
  const m = f.miracle;
  if (m) for (const id of m.owned) if (m.cool[id] > 0) m.cool[id] = Math.max(0, m.cool[id] - dt);
  if (f.flame > 0) f.flame = Math.max(0, f.flame - dt);
  if (f.blind > 0) f.blind = Math.max(0, f.blind - dt);   // 天光柱で目がくらんでいる（bot は見えない。自分は画面が白い）
  if (f.shock > 0) f.shock = Math.max(0, f.shock - dt);   // 神罰雷でしびれている（動けないのは stun。shock は見た目と知らせ）
  if (f.invuln > 0) f.invuln = Math.max(0, f.invuln - dt);
  if (f.blessing > 0) {
    f.blessing = Math.max(0, f.blessing - dt);
    if (f.blessing <= 0 && m) m.cool.revive = MIRACLES.revive.cd;   // 加護が切れた：待ち時間に入る
  }
}

/** 刻の褒美の候補：まだ覚えていない奇跡（乱数 rnd で並べ替えて、最大 n 個） */
export function miracleOffers(f, rnd, n = 3) {
  if (!canMiracle(f) || miraclesOf(f).length >= MIRACLE_SLOTS) return [];
  const pool = MIRACLE_IDS.filter((id) => !miraclesOf(f).includes(id));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}
