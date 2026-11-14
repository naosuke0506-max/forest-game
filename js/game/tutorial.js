// 教練（チュートリアル。利用者の指示 2026-11-13）：大廳の「教練」から選ぶ。試合と同じ森と村で、決まった相手（動きの決まった傀儡）を置き、
// 手順を 1 つずつこなす。手順は画面の左に出て、できた物に印が付く（ui/tutor-panel.js）。全部できたら達成。
//   共通：基本（動く・見回す・疾驅・攻擊・迴避）、暗殺・簞笥（タンスに隠れた敵を見つけて倒す）、暗殺・寢臺（ベッドの下に隠れた敵を見つけて倒す）、
//         暗殺・潛伏（タンスかベッドに隠れて待ち、部屋に入ってきた敵を暗殺）、暗殺・壁潛（壁に背を付けて待ち、通りかかった敵を暗殺）。
//         寢臺・潛伏は利用者の指示（2026-11-14）
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
 *         patrol（f.patrol の点を順に行き来する。こちらに気づかない。f.patrolGate があれば、それが true になるまで待つ。
 *         f.patrolWait 秒、端で立ち止まる）・hidden（タンス・ベッドに隠れている）
 */
/** 一階建ての家の、一階のタンスとベッドの隠れ場所（家ごと）。道順（外 → 扉の内 → 部屋の奥）が 3 点ある家 */
function groundRooms(hides) {
  const byRoute = new Map();
  for (const s of hides) {
    if (!(s.route?.length >= 3)) continue;
    if (!byRoute.has(s.route)) byRoute.set(s.route, {});
    byRoute.get(s.route)[s.kind] = s;
  }
  return [...byRoute.values()];
}
/** 隠れている敵を探す教練（タンス・ベッド）の置き方：その家の扉の外に、家の方を向いて立つ */
function setupSearch(kind) {
  return ({ bots, hides, hiding, spawn }) => {
    const room = groundRooms(hides).find((r) => r[kind]);
    const spot = room?.[kind] || hides.find((s) => s.kind === kind);
    if (!spot) return;
    hiding.hide(bots[0], spot);
    const [a, b] = spot.route;
    spawn(a.x, a.z, yawTo(a, b.x, b.z));
  };
}
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
    name: '暗殺・簞笥', char: null, desc: 'タンスに隠れている敵を見つけ出し、倒す',
    bots: [{ char: 'archer', role: 'hidden' }],
    setup: setupSearch('wardrobe'),
    steps: [
      { text: '目の前の家に入る。どこかのタンスに敵が隠れている（家の外からは探せない）', done: (S) => S.inside },
      { text: 'タンスの前で搜索ボタン（PC は F）を押して、中を探す', done: (S) => S.searched >= 1 },
      { text: '見つけた敵を倒す', done: (S) => S.kills >= 1 },
    ],
  },
  searchBed: {
    name: '暗殺・寢臺', char: null, desc: 'ベッドの下に隠れている敵を見つけ出し、倒す',
    bots: [{ char: 'polearm', role: 'hidden' }],
    setup: setupSearch('bed'),
    steps: [
      { text: '目の前の家に入る。ベッドの下に敵が隠れている（よく見ると、掛け布の陰に体が見える）', done: (S) => S.inside },
      { text: 'ベッドの前で搜索ボタン（PC は F）を押して、下を探す', done: (S) => S.searched >= 1 },
      { text: '見つけた敵を倒す', done: (S) => S.kills >= 1 },
    ],
  },
  ambush: {
    name: '暗殺・潛伏', char: null, desc: 'タンスかベッドに隠れて待ち、部屋に入ってきた敵を暗殺する',
    bots: [{ char: 'blunt', role: 'patrol' }],
    setup({ me, bots, hides, isFree, spawn }) {
      // タンスとベッドが一階にある一階建ての家。扉の外に立ち、敵は扉の前の通りで待つ。自分が隠れたら、敵が部屋の奥まで入ってきて戻る
      const room = groundRooms(hides).find((r) => r.wardrobe && r.bed) || groundRooms(hides)[0];
      const spot = room?.wardrobe || room?.bed;
      if (!spot) return;
      const [a, b, c] = spot.route;
      spawn(a.x, a.z, yawTo(a, b.x, b.z));
      const ox = a.x - b.x, oz = a.z - b.z, ol = Math.hypot(ox, oz) || 1;
      let wait = { x: a.x + (ox / ol) * 2, z: a.z + (oz / ol) * 2 };
      for (const k of [6, 5, 4, 3]) {
        const p = { x: a.x + (ox / ol) * k, z: a.z + (oz / ol) * k };
        if (!isFree || isFree(p.x, p.z, 0.6)) { wait = p; break; }
      }
      const f = bots[0];
      f.x = wait.x; f.z = wait.z; f.yaw = yawTo(f, a.x, a.z);
      f.patrol = [wait, a, b, c];
      f.patrolWait = 2.5;
      f.patrolGate = () => !!me.hidden;
    },
    steps: [
      { text: '目の前の家に入る', done: (S) => S.inside },
      { text: 'タンスかベッドの前で潛伏ボタン（PC は E）を押して隠れる。隠れると、外の敵が家に入ってくる', done: (S) => S.hid },
      { text: '敵が近くに来たら、暗殺ボタン（PC は R）で飛び出す', done: (S) => S.assassinTries >= 1 },
      { text: '暗殺で倒す', done: (S) => S.assassinKills >= 1 },
    ],
  },
  cover: {
    name: '暗殺・壁潛', char: null, desc: '壁に背を付けて待ち、通りかかった敵を暗殺する',
    bots: [{ char: 'blunt', role: 'patrol' }],
    setup({ me, bots, coverSegs, isFree, spawn }) {
      // 壁を選ぶ：家の外の壁のうち、見回りの道（壁から 2 m 外を、壁に沿って 2L m）に木・ほかの家の壁・樽などが無い、なるべく長い壁。
      // 家と家の間の狭い路地の壁を選ぶと、見回りの敵が向かいの家にぶつかって通れない（2026-11-13 の確かめで分かった）
      const plan = (s) => {
        const len = Math.hypot(s.bx - s.ax, s.bz - s.az), tx = (s.bx - s.ax) / len, tz = (s.bz - s.az) / len;
        const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2, L = Math.min(6, len / 2 + 2);
        const a = { x: mx - tx * L + s.nx * 2, z: mz - tz * L + s.nz * 2 }, b = { x: mx + tx * L + s.nx * 2, z: mz + tz * L + s.nz * 2 };
        let ok = true;
        const n = Math.ceil((2 * L) / 0.5);
        for (let i = 0; i <= n && ok && isFree; i++) ok = isFree(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n, 0.55);
        return { s, len, mx, mz, a, b, ok };
      };
      const pl = coverSegs.filter((s) => !s.inside).map(plan).sort((p, q) => (q.ok - p.ok) || (q.len - p.len))[0];
      if (!pl) return;
      // 壁の前に、壁の方を向いて立つ（壁潛ボタンが出る 0.9 m（game/cover.js の COVER_REACH）より内側）
      spawn(pl.mx + pl.s.nx * 0.55, pl.mz + pl.s.nz * 0.55, Math.atan2(pl.s.nx, pl.s.nz) / DEG);
      bots[0].patrol = [pl.a, pl.b];
      bots[0].x = pl.a.x; bots[0].z = pl.a.z;
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
export const LESSON_ORDER = ['basic', 'search', 'searchBed', 'ambush', 'cover', 'shield', 'sword', 'polearm', 'blunt', 'archer', 'cleric'];

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
  let tap = false, cd = 1.2, leg = 1, dir = 1, wait = 0, stuck = 0, started = false;
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
        // 点を順に行き来する（端で立ち止まって引き返す）。待つ条件（patrolGate）があれば、それまでその場に立つ
        if (!started) started = !f.patrolGate || f.patrolGate();
        if (started && (wait -= dt) <= 0) {
          const g = f.patrol[leg];
          if (Math.hypot(g.x - f.x, g.z - f.z) < 0.5) {
            if (leg + dir < 0 || leg + dir >= f.patrol.length) { dir = -dir; wait = f.patrolWait || 0; }
            leg += dir;
          }
          want = yawTo(f, f.patrol[leg].x, f.patrol[leg].z);
          if (wait <= 0) input.forward = 0.55;   // ゆっくり歩く（こちらには気づかない）
        }
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
      const px = f.x, pz = f.z;
      const mag = moveFighter(f, input, dt, world);
      // 見回り：何かにつかえて 1 秒進めなければ、引き返す
      if (role === 'patrol') {
        stuck = input.forward > 0 && Math.hypot(f.x - px, f.z - pz) < 0.2 * dt ? stuck + dt : 0;   // 歩こうとしているのに進まない
        if (stuck > 1) { dir = -dir; leg = Math.max(0, Math.min(f.patrol.length - 1, leg + dir)); stuck = 0; }
      }
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
  const S = { moved: 0, turned: 0, sprinted: false, hits: 0, dodges: 0, inside: false, searched: 0, kills: 0, covered: false, hid: false,
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
      if (me.hidden) S.hid = true;
      // 教練では自分は倒れない：体力が 3 割を切ったら戻す
      if (me.alive && me.stats.hp < me.stats.maxHp * 0.3) me.stats.hp = me.stats.maxHp;
      let moved = false;
      while (step < lesson.steps.length && lesson.steps[step].done(S)) { step++; moved = true; }
      return moved;
    },
  };
}
