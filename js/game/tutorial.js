// 教練（チュートリアル。利用者の指示 2026-11-13）：大廳の「教練」から選ぶ。試合と同じ森と村で、決まった相手（動きの決まった傀儡）を置き、
// 手順を 1 つずつこなす。手順は画面の左に出て、できた物に印が付く（ui/tutor-panel.js）。全部できたら達成。
//   共通：基本（動く・見回す・疾驅・攻擊・迴避）、暗殺・搜索（タンスに隠れた敵を見つけて倒す）、暗殺・壁潛（壁に背を付けて待ち、通りかかった敵を暗殺）
//   人物ごと：楯劍騎士（防禦と反擊）・劍騎士（奧義）・長柄騎士（強靱）・打擊騎士（剛力）・弓兵（鷹目）・祓魔僧（神怒）
// 教練では時間で刻が進まず、自分は倒れない（体力が 3 割を切ると戻る）。計算だけ（PlayCanvas に依存しない）
import { moveFighter } from './movement.js';
import { BODY_TURN } from './data.js';

const DEG = Math.PI / 180;
const wrap = (a) => ((a + 540) % 360) - 180;
const yawTo = (f, x, z) => Math.atan2(-(x - f.x), -(z - f.z)) / DEG;
const fwd = (yaw) => [-Math.sin(yaw * DEG), -Math.cos(yaw * DEG)];

/**
 * 教練の一覧。char：使う人物（null は大廳で選んでいる人物）、bots：相手（char・role・loadout）、
 * setup(ctx)：自分と相手を置く、steps：手順（text：画面に出す文、done(S)：できたか。S は試合の出来事から数えた記録）
 *   role：dummy（立っているだけ。倒れない）・guard（楯を構えて立つ。倒れない）・attacker（近づいて攻撃してくる。弱い）・
 *         patrol（2 か所の間を歩く。こちらに気づかない）・hidden（タンスに隠れている）
 */
export const LESSONS = {
  basic: {
    name: '基本', char: null, desc: '動く・見回す・疾驅・攻擊・迴避を覚える。案山子が 1 人立っている',
    bots: [{ char: 'polearm', role: 'dummy' }],
    setup({ me, bots }) { place(bots[0], me, 8, 0); },   // 8 m 前（まっすぐ 5 m 歩いてもぶつからない）
    steps: [
      { text: '移動スティック（PC は W A S D）で 5 m 歩く', done: (S) => S.moved >= 5 },
      { text: '画面の右側をなぞって（PC はマウスで引いて）、向きを 90 度変える', done: (S) => S.turned >= 90 },
      { text: '疾驅ボタン（PC は Q）を押してから歩き出し、全速力で走る', done: (S) => S.sprinted },
      { text: '案山子に攻擊ボタン（PC は J）で 3 回当てる', done: (S) => S.hits >= 3 },
      { text: '迴避ボタン（PC はスペース）で避ける', done: (S) => S.dodges >= 1 },
    ],
  },
  search: {
    name: '暗殺・搜索', char: null, desc: 'タンスに隠れている敵を見つけ出し、倒す',
    bots: [{ char: 'archer', role: 'hidden' }],
    setup({ me, bots, hides, hiding, spawn }) {
      const spot = hides.find((s) => s.kind === 'wardrobe' && s.route?.length >= 3) || hides.find((s) => s.kind === 'wardrobe');
      if (!spot) return;
      hiding.hide(bots[0], spot);
      const [a, b] = spot.route;
      spawn(a.x, a.z, yawTo(a, b.x, b.z));   // 家の扉の外に立ち、家の方を向く
    },
    steps: [
      { text: '目の前の家に入る。どこかのタンスに敵が隠れている', done: (S) => S.inside },
      { text: 'タンスの前で搜索ボタン（PC は F）を押して、中を探す', done: (S) => S.searched >= 1 },
      { text: '見つけた敵を倒す', done: (S) => S.kills >= 1 },
    ],
  },
  cover: {
    name: '暗殺・壁潛', char: null, desc: '壁に背を付けて待ち、通りかかった敵を暗殺する',
    bots: [{ char: 'blunt', role: 'patrol' }],
    setup({ me, bots, coverSegs, spawn }) {
      const seg = coverSegs.filter((s) => !s.inside).sort((p, q) => Math.hypot(q.bx - q.ax, q.bz - q.az) - Math.hypot(p.bx - p.ax, p.bz - p.az))[0];
      if (!seg) return;
      const len = Math.hypot(seg.bx - seg.ax, seg.bz - seg.az), tx = (seg.bx - seg.ax) / len, tz = (seg.bz - seg.az) / len;
      const mx = (seg.ax + seg.bx) / 2, mz = (seg.az + seg.bz) / 2;
      // 壁の前に、壁の方を向いて立つ（壁潛ボタンが出る 0.9 m（game/cover.js の COVER_REACH）より内側）
      spawn(mx + seg.nx * 0.55, mz + seg.nz * 0.55, Math.atan2(seg.nx, seg.nz) / DEG);
      const L = Math.min(6, len / 2 + 2);
      bots[0].patrol = [{ x: mx - tx * L + seg.nx * 2.0, z: mz - tz * L + seg.nz * 2.0 }, { x: mx + tx * L + seg.nx * 2.0, z: mz + tz * L + seg.nz * 2.0 }];
      bots[0].x = bots[0].patrol[0].x; bots[0].z = bots[0].patrol[0].z;
    },
    steps: [
      { text: '壁の近くで壁潛ボタン（PC は E）を押して、壁に背を付ける', done: (S) => S.covered },
      { text: '敵が近くを通ったら、暗殺ボタン（PC は R）で飛び出す', done: (S) => S.assassinTries >= 1 },
      { text: '暗殺で倒す', done: (S) => S.assassinKills >= 1 },
    ],
  },
  shield: {
    name: '防禦と反擊', char: 'shield', desc: '楯で攻撃を受け止め、技能「反擊」で返す（楯劍騎士）',
    bots: [{ char: 'sword', role: 'attacker', loadout: { main: 'longsword' } }],
    setup({ me, bots }) { place(bots[0], me, 8, 0); },   // 8 m 前（まっすぐ 5 m 歩いてもぶつからない）
    steps: [
      { text: '左手ボタン（防禦。PC は K）を押したまま、敵の攻撃を楯で 3 回受ける', done: (S) => S.guarded >= 3 },
      { text: '技能ボタン（PC は G）で「反擊」を使う', done: (S) => S.skill },
      { text: '反擊の間に楯で受けて、自動の反撃を当てる', done: (S) => S.counters >= 1 },
    ],
  },
  sword: {
    name: '奧義', char: 'sword', desc: '技能「奧義」で、並んだ敵をまとめて斬る（劍騎士。雙劍と長劍で動きが違う）',
    bots: [{ char: 'blunt', role: 'dummy' }, { char: 'polearm', role: 'dummy' }],
    setup({ me, bots }) {
      if (me.weapon === 'dualsword') { place(bots[0], me, 2.6); place(bots[1], me, 5.2, 0, 0.3); }   // 雙劍：前へ滑る道に 2 人
      else { place(bots[0], me, 2.2, 0, -0.7); place(bots[1], me, 2.2, 0, 0.7); }                 // 長劍：目の前に 2 人
    },
    steps: [
      { text: '技能ボタン（PC は G）で「奧義」を放つ', done: (S) => S.skill },
      { text: '奧義で 2 人に当てる', done: (S) => S.ultTargets >= 2 },
    ],
  },
  polearm: {
    name: '強靱', char: 'polearm', desc: '技能「強靱」で、攻撃を受けてもひるまずに攻め続ける（長柄騎士）',
    bots: [{ char: 'shield', role: 'attacker', loadout: { main: 'armingsword' } }],
    setup({ me, bots }) { place(bots[0], me, 4, 0); },
    steps: [
      { text: '技能ボタン（PC は G）で「強靱」を使う', done: (S) => S.skill },
      { text: '強靱の間に、敵へ 3 回当てる（攻撃を受けても止まらない）', done: (S) => S.skillHits >= 3 },
    ],
  },
  blunt: {
    name: '剛力', char: 'blunt', desc: '技能「剛力」で、楯を構えた敵に、楯の上から傷を通す（打擊騎士）',
    bots: [{ char: 'shield', role: 'guard' }],
    setup({ me, bots }) { place(bots[0], me, 1.8, 0); },
    steps: [
      { text: '楯を構えた敵を打つ（楯で全部止められる）', done: (S) => S.blocked >= 1 },
      { text: '技能ボタン（PC は G）で「剛力」を使う', done: (S) => S.skill },
      { text: '剛力の間に打って、楯の上から傷を通す', done: (S) => S.pierced >= 1 },
    ],
  },
  archer: {
    name: '鷹目', char: 'archer', desc: '技能「鷹目」で、家の中の敵を壁越しに見つけ、貫く矢で射抜く（弓兵）',
    bots: [{ char: 'polearm', role: 'dummy' }],
    setup({ me, bots, houses, spawn }) {
      const hh = houses.find((h) => h.stories === 1) || houses[0];
      if (!hh) return;
      const a = hh.yaw * DEG, R = [Math.cos(a), -Math.sin(a)];
      bots[0].x = hh.x; bots[0].z = hh.z; bots[0].y = hh.y0 + 0.5;
      const x = hh.x + R[0] * (hh.w / 2 + 7), z = hh.z + R[1] * (hh.w / 2 + 7);
      spawn(x, z, Math.atan2(-(hh.x - x), -(hh.z - z)) / DEG);   // 家の横の壁から 7 m 離れて、家の方を向く
    },
    steps: [
      { text: '技能ボタン（PC は G）で「鷹目」を使い、壁の向こうの敵を体温で見つける', done: (S) => S.skill },
      { text: '射ボタン（PC は J）を長押しして離し、貫く矢で壁越しに射抜く', done: (S) => S.pierceHits >= 1 },
    ],
  },
  cleric: {
    name: '神怒', char: 'cleric', desc: '技能「神怒」で宙に浮き、衝撃波で周りの敵を吹き飛ばす（祓魔僧）',
    bots: [{ char: 'shield', role: 'dummy' }, { char: 'blunt', role: 'dummy' }, { char: 'archer', role: 'dummy' }],
    setup({ me, bots }) { place(bots[0], me, 3.5, 0); place(bots[1], me, 4, 120); place(bots[2], me, 4.5, -120); },
    steps: [
      { text: '技能ボタン（PC は G）で「神怒」を放つ', done: (S) => S.skill },
      { text: '衝撃波で 2 人以上を吹き飛ばす', done: (S) => S.wrathHits >= 2 },
    ],
  },
};
/** 大廳に並べる順 */
export const LESSON_ORDER = ['basic', 'search', 'cover', 'shield', 'sword', 'polearm', 'blunt', 'archer', 'cleric'];

/** 相手を、自分の向きから右へ ang 度の向きに d m、さらに右へ side m ずらして置き、こちらを向かせる */
function place(f, me, d, ang = 0, side = 0) {
  const yaw = me.yaw - ang;   // 向きの角度は左回りが正
  const [fx, fz] = fwd(yaw), rx = Math.cos(yaw * DEG), rz = -Math.sin(yaw * DEG);
  f.x = me.x + fx * d + rx * side; f.z = me.z + fz * d + rz * side;
  f.yaw = yawTo(f, me.x, me.z);
}

/**
 * 教練の相手（動きの決まった傀儡）：bot（game/bot.js）と同じ形（update・combatInput）で動く
 * @param {object} f 戦う人
 * @param {string} role dummy・guard・attacker・patrol・hidden
 * @param {object} me 自分（向く相手・攻める相手）
 */
export function createTutorBot(f, role, me) {
  const input = { forward: 0, strafe: 0, run: false, yaw: f.yaw, pitch: 0 };
  let tap = false, cd = 1.2, leg = 1;
  // 倒れない案山子（dummy・guard）。攻めてくる相手は弱くする（教練で自分が倒れないように）
  if (role === 'dummy' || role === 'guard') { f.stats.maxHp = f.stats.hp = 5000; }
  if (role === 'attacker') f.stats.attack *= 0.35;
  return {
    fighter: f,
    alert() {}, knowSpot() {}, forget() {},
    update(dt, world) {
      if (!f.alive || f.hidden || f.helpless > 0 || (f.action && ['assassinated', 'dragged', 'hideIn', 'hideOut'].includes(f.action.kind))) return 0;
      cd -= dt;
      input.forward = 0; input.strafe = 0; input.run = false;
      let want = f.yaw;
      if (role === 'patrol' && f.patrol) {
        const g = f.patrol[leg];
        if (Math.hypot(g.x - f.x, g.z - f.z) < 0.5) leg = 1 - leg;
        want = yawTo(f, f.patrol[leg].x, f.patrol[leg].z);
        input.forward = 0.55;   // ゆっくり歩く（こちらには気づかない）
      } else if (me.alive) {
        want = yawTo(f, me.x, me.z);
        if (role === 'attacker') {
          const d = Math.hypot(me.x - f.x, me.z - f.z);
          if (d > 1.9) input.forward = 0.8;
          else if (cd <= 0 && !f.action) { tap = true; cd = 1.3 + Math.random() * 0.6; }
        }
      }
      // 向きは鎧の重さの速さで変える（bot と同じ）
      const turn = (BODY_TURN.turn[f.weight] || BODY_TURN.turn.medium) * dt, dy = wrap(want - f.yaw);
      input.yaw = f.yaw + Math.sign(dy) * Math.min(Math.abs(dy), turn);
      const mag = moveFighter(f, input, dt, world);
      f.gait = mag > 0.05 ? 'walk' : 'still';
      return mag;
    },
    get combatInput() {
      const attack = tap;
      tap = false;
      return { attack, left: role === 'guard', dodge: false, moveX: 0, moveY: 0 };
    },
  };
}

/**
 * 教練の記録：試合の出来事を数え、手順ができたか見る
 * @param {object} lesson LESSONS の 1 つ
 * @param {{ me, combat, cover, match, hiding }} o
 */
export function createTutorState(lesson, { me, combat, cover, match }) {
  const S = { moved: 0, turned: 0, sprinted: false, hits: 0, dodges: 0, inside: false, searched: 0, kills: 0, covered: false,
    assassinTries: 0, assassinKills: 0, guarded: 0, skill: false, counters: 0, ultTargets: 0, skillHits: 0, blocked: 0, pierced: 0,
    pierceHits: 0, wrathHits: 0 };
  const ultHit = new Set();
  let lastX = me.x, lastZ = me.z, lastYaw = me.yaw;
  combat.on('hit', ({ attacker, target, amount, guarded, kind }) => {
    if (attacker === me && target !== me) {
      S.hits++;
      if (me.action?.name === 'ult') { ultHit.add(target); S.ultTargets = ultHit.size; }
      if (me.skillLeft > 0) S.skillHits++;
      if (guarded && amount <= 0.01) S.blocked++;
      if (guarded && amount > 0.01 && me.skillLeft > 0) S.pierced++;
      if (kind === 'wrath') S.wrathHits++;
    }
    if (target === me && guarded) S.guarded++;
  });
  combat.on('skill', ({ fighter }) => { if (fighter === me) S.skill = true; });
  combat.on('counter', ({ fighter }) => { if (fighter === me) S.counters++; });
  combat.on('dodge', ({ fighter }) => { if (fighter === me) S.dodges++; });
  combat.on('searchStart', ({ fighter }) => { if (fighter === me) S.searched++; });
  combat.on('assassinate', ({ attacker }) => { if (attacker === me) S.assassinTries++; });
  combat.on('projectileHit', ({ projectile, through }) => { if (through && projectile.owner === me) S.pierceHits++; });
  cover.on('enter', ({ fighter }) => { if (fighter === me) S.covered = true; });
  match.on('eliminated', ({ victim, killer }) => { if (killer === me && victim !== me) S.kills++; });
  combat.on('hit', ({ attacker, kind }) => { if (attacker === me && kind === 'assassinate') S.assassinKills++; });   // 暗殺で倒した（一撃で倒すときの知らせ）
  let step = 0;
  return {
    S,
    /** 今の手順の番号（全部できたら steps.length） */
    get step() { return step; },
    /** 毎フレーム：歩いた距離・向きを変えた角度などを数え、手順を進める。返り値：手順が進んだか */
    update(dt, { insideHouse = null } = {}) {
      S.moved += Math.hypot(me.x - lastX, me.z - lastZ);
      S.turned += Math.abs(wrap(me.yaw - lastYaw));
      lastX = me.x; lastZ = me.z; lastYaw = me.yaw;
      if (me.sprinting) S.sprinted = true;
      if (insideHouse && insideHouse(me.x, me.z)) S.inside = true;
      // 教練では自分は倒れない：体力が 3 割を切ったら戻す
      if (me.alive && me.stats.hp < me.stats.maxHp * 0.3) me.stats.hp = me.stats.maxHp;
      let moved = false;
      while (step < lesson.steps.length && lesson.steps[step].done(S)) { step++; moved = true; }
      return moved;
    },
  };
}
