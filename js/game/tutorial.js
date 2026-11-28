// 教練（チュートリアル。利用者の指示 2026-11-13）：大廳の「教練」から選ぶ。試合と同じ森と村で、決まった相手（動きの決まった傀儡）を置き、
// 手順を 1 つずつこなす。手順は画面の左に出て、できた物に印が付く（ui/tutor-panel.js）。全部できたら達成。
//   共通：基本（動く・見回す・疾驅・攻擊・迴避）、暗殺・簞笥（タンスに隠れた敵を見つけて倒す）、暗殺・寢臺（ベッドの下に隠れた敵を見つけて倒す）、
//         暗殺・潛伏（タンスかベッドに隠れて待ち、部屋に入ってきた敵を暗殺）、暗殺・壁潛（壁に背を付けて待ち、通りかかった敵を暗殺）。
//         寢臺・潛伏は利用者の指示（2026-11-14）。暗殺・迴避（タンスから飛び出してくる敵の暗殺を、回避でかわす）も利用者の指示（2026-11-14「暗殺避け」）
//   必殺（大廳で選んでいる人物の必殺技。2026-11-25）。人物ごと：楯劍騎士（防禦）・祓魔僧（奇跡・奇跡・攻）。
//   前の專用技能の教練（反擊・奧義・強靱・剛力・鷹目・神怒）は、技能を無くしたので消した（利用者の指示 2026-11-25「今ある技は残しません」）
// 教練では時間で刻が進まず、自分は倒れない（体力が 3 割を切ると戻る）。計算だけ（PlayCanvas に依存しない）
import { moveFighter } from './movement.js';
import { BODY_TURN } from './data.js';
import { learnMiracle, selectMiracle } from './miracles.js';

const DEG = Math.PI / 180;
const wrap = (a) => ((a + 540) % 360) - 180;
const yawTo = (f, x, z) => Math.atan2(-(x - f.x), -(z - f.z)) / DEG;
const fwd = (yaw) => [-Math.sin(yaw * DEG), -Math.cos(yaw * DEG)];

/**
 * 教練の一覧。char：使う人物（null は大廳で選んでいる人物）、bots：相手（char・role・loadout）、
 * setup(ctx)：自分と相手を置く、steps：手順（text：画面に出す文、done(S)：できたか。S は試合の出来事から数えた記録）
 *   role：dummy（立っているだけ。倒れない）・guard（楯を構えて立つ。倒れない）・attacker（近づいて攻撃してくる。弱い）・
 *         patrol（f.patrol の点を順に行き来する。こちらに気づかない。f.patrolGate があれば、それが true になるまで待つ。
 *         f.patrolWait 秒、端で立ち止まる）・hidden（タンス・ベッドに隠れている）・
 *         ambusher（タンスに隠れて待ち、こちらが近づくと飛び出して暗殺してくる。かわされた後は attacker と同じ）
 *   retry(ctx)：自分が「やられた」とき（教練では倒れない）に、置き直してやり直す（無ければ、やり直さずそのまま続く）
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
      { text: '暗殺を決める（後ろからは体力の 6 割、前・横からは 2 割 5 分を削る）', done: (S) => S.assassinKills >= 1 },
    ],
  },
  evade: {
    name: '暗殺・迴避', char: null, desc: 'タンスから飛び出してくる敵の暗殺を、迴避でかわす',
    bots: [{ char: 'shield', role: 'ambusher', loadout: { main: 'armingsword' } }],
    setup: setupSearch('wardrobe'),
    retry: setupSearch('wardrobe'),   // かわせなかったら、敵はタンスに戻り、自分は扉の外からやり直す
    steps: [
      { text: '目の前の家に入る。タンスに敵が隠れていて、近づくと飛び出してくる', done: (S) => S.inside },
      { text: '「暗殺！」と出たら、すぐ迴避ボタン（PC はスペース）で避ける。遅れても、やり直せる（猶予は本番 0.45 秒、教練は 0.7 秒）', done: (S) => S.evaded >= 1 },
      { text: '暗殺をしくじった敵は、少しの間ひるむ。その間に倒す', done: (S) => S.kills >= 1 },
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
      { text: '暗殺を決める（後ろからは体力の 6 割、前・横からは 2 割 5 分を削る）', done: (S) => S.assassinKills >= 1 },
    ],
  },
  // 必殺技（利用者の指示 2026-11-25）：試合では 1 回だけだが、教練では何度でも使える（me.ultFree）。1 回目は、どの英雄も仮の属性の衝撃波
  ult: {
    name: '必殺', char: null, desc: '必殺ボタンで、英雄の必殺技を放つ（1 つの試合で 1 回だけ。延長戰でもう 1 回。必殺技の間は無敵）',
    bots: [{ char: 'shield', role: 'dummy' }, { char: 'blunt', role: 'dummy' }, { char: 'archer', role: 'dummy' }],
    setup({ me, bots }) {
      me.ultFree = true;
      place(bots[0], me, 3.5, 0); place(bots[1], me, 4, 120); place(bots[2], me, 4.5, -120);
    },
    steps: [
      { text: '必殺ボタン（PC は G）で必殺技を放つ', done: (S) => S.ult },
      { text: '必殺技を、2 人以上に当てる', done: (S) => S.ultHits >= 2 },   // 前は「衝撃波で吹き飛ばす」（1 回目の仮の技）。英雄ごとの技は吹き飛ばさない物もある
    ],
  },
  shield: {
    name: '防禦', char: 'shield', desc: '楯で攻撃を受け止め、楯擊で返す（楯劍騎士）',
    bots: [{ char: 'sword', role: 'attacker', loadout: { main: 'longsword' } }],
    setup({ me, bots }) { place(bots[0], me, 8, 0); },   // 8 m 前（まっすぐ 5 m 歩いてもぶつからない）
    steps: [
      { text: '左手ボタン（防禦。PC は K）を押したまま、敵の攻撃を楯で 3 回受ける', done: (S) => S.guarded >= 3 },
      { text: '楯擊ボタン（PC は U）で、敵に楯擊を当てる', done: (S) => S.shieldHits >= 1 },
    ],
  },
  // 奇跡（2026-11-17。利用者の指示：祓魔僧の奇跡）：試合では刻の褒美で覚えるが、教練では初めから 4 つ覚えている
  miracle: {
    name: '奇跡', char: 'cleric', desc: '左手の護符で奇跡を唱える。替ボタンで唱える奇跡を替える（祓魔僧）',
    bots: [{ char: 'polearm', role: 'dummy' }],
    setup({ me, bots }) {
      me.miracle = { owned: [], sel: 0, cool: {} };   // 試合では初めから全部の奇跡を使えるが、教練では 4 つ（替える順番を手順に合わせる）
      for (const id of ['flame', 'heal', 'wall', 'revive']) learnMiracle(me, id);
      selectMiracle(me, 'flame');
      place(bots[0], me, 3, 0);
    },
    steps: [
      { text: '奇跡ボタン（PC は K）で「淨炎」を唱え、鎚矛に清めの炎をまとわせる', done: (S) => S.miracles.flame },
      { text: '炎をまとった鎚矛で案山子を打ち、燃やす', done: (S) => S.ignited >= 1 },
      { text: '替ボタン（PC は H）で「治癒」に替えて唱える', done: (S) => S.miracles.heal },
      { text: '「光壁」に替えて唱え、前に光の壁を張る', done: (S) => S.miracles.wall },
    ],
  },
  // 奇跡・攻（2026-11-17。奇跡の 2 回目）：天光柱・聖火彈・神罰雷で、離れた案山子を攻める
  miracleStrike: {
    name: '奇跡・攻', char: 'cleric', desc: '天光柱・聖火彈・神罰雷で、離れた敵を攻める（祓魔僧）',
    bots: [{ char: 'polearm', role: 'dummy' }, { char: 'shield', role: 'dummy' }, { char: 'blunt', role: 'dummy' }],
    setup({ me, bots, isFree, insideHouse, heightAt, spawn }) {
      me.miracle = { owned: [], sel: 0, cool: {} };   // 教練では攻める奇跡の 3 つだけ
      for (const id of ['pillar', 'fireball', 'thunder']) learnMiracle(me, id);
      selectMiracle(me, 'pillar');
      // 開けた所を探す：前 18 m・左右 3 m に、木・岩・家が無く、地面の高さがほぼ同じ所（火の玉と雷の槍が、途中の物に当たらないように）
      const open = (x, z, h0) => (!isFree || isFree(x, z, 0.9)) && !(insideHouse && insideHouse(x, z)) && (!heightAt || Math.abs(heightAt(x, z) - h0) < 1.0);
      const lane = (x, z, yaw) => {
        const h0 = heightAt ? heightAt(x, z) : 0, [fx, fz] = fwd(yaw), rx = Math.cos(yaw * DEG), rz = -Math.sin(yaw * DEG);
        for (let d = 1; d <= 18; d++) for (const s of [-3, 0, 3]) if (!open(x + fx * d + rx * s * (d / 18), z + fz * d + rz * s * (d / 18), h0)) return false;
        return true;
      };
      search: for (let r = 0; r <= 80; r += 8) {
        for (let k = 0; k < (r ? 12 : 1); k++) {
          const a = k * 30 * DEG, x = me.x + Math.cos(a) * r, z = me.z + Math.sin(a) * r;
          if (!open(x, z, heightAt ? heightAt(x, z) : 0)) continue;
          for (let yaw = 0; yaw < 360; yaw += 30) if (lane(x, z, yaw)) { spawn?.(x, z, yaw); break search; }
        }
      }
      place(bots[0], me, 10, 0); place(bots[1], me, 13, 12); place(bots[2], me, 15, -10);
    },
    steps: [
      { text: '奇跡ボタン（PC は K）で「天光柱」を唱え、降ってくる光の柱を案山子に当てる', done: (S) => S.strikeHits.pillar >= 1 },
      { text: '替ボタン（PC は H）で「聖火彈」に替えて唱え、火の玉を案山子に当てる', done: (S) => S.strikeHits.fireball >= 1 },
      { text: '「神罰雷」に替えて、案山子を狙って雷の槍を投げ、当てる', done: (S) => S.strikeHits.thunder >= 1 },
    ],
  },
};
/** 大廳に並べる順 */
export const LESSON_ORDER = ['basic', 'search', 'searchBed', 'ambush', 'cover', 'evade', 'ult', 'shield', 'miracle', 'miracleStrike'];

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
  // 待ち伏せ（ambusher）：こちらが暗殺できる近さに来てから少し待って、飛び出す。避ける猶予は本番より少し長い
  let leap = false, lurk = 0, sprung = false;
  if (role === 'ambusher') { f.graceTime = 0.7; f.stats.attack *= 0.35; }
  // 倒れない案山子（dummy・guard）。攻めてくる相手は弱くする（教練で自分が倒れないように）
  if (role === 'dummy' || role === 'guard') { f.stats.maxHp = f.stats.hp = 5000; }
  if (role === 'attacker') f.stats.attack *= 0.35;
  return {
    fighter: f,
    alert() {}, knowSpot() {}, forget() {},
    update(dt, world) {
      if (role === 'ambusher' && f.alive && f.hidden) {
        // タンスの中で待つ：こちらが近くに来たら、0.6 秒待って飛び出す（やり直しで戻ってきたときも同じ）
        sprung = false;
        lurk = world.assassinTarget?.(f)?.target === me ? lurk + dt : 0;
        if (lurk > 0.6) { leap = true; lurk = 0; }
        return 0;
      }
      if (!f.alive || f.hidden || f.helpless > 0 || (f.action && ['assassinate', 'assassinated', 'dragged', 'hideIn', 'hideOut'].includes(f.action.kind))) { if (f.action?.kind === 'assassinate') sprung = true; return 0; }
      if (role === 'ambusher' && (!sprung || f.stun > 0)) return 0;   // 飛び出す前・しくじってひるんでいる間は動かない
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
        if (role === 'attacker' || role === 'ambusher') {
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
      const attack = tap, assassinate = leap;
      tap = false; leap = false;
      return { attack, assassinate, left: role === 'guard', dodge: false, moveX: 0, moveY: 0 };
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
    assassinTries: 0, assassinKills: 0, guarded: 0, ult: false, ultHits: 0, shieldHits: 0,
    evaded: 0, miracles: {}, ignited: 0, strikeHits: { pillar: 0, fireball: 0, thunder: 0 } };
  const ultHit = new Set();
  let lastX = me.x, lastZ = me.z, lastYaw = me.yaw;
  combat.on('hit', ({ attacker, target, amount, guarded, kind }) => {
    if (attacker === me && target !== me) {
      S.hits++;
      if (kind === 'ult') { ultHit.add(target); S.ultHits = ultHit.size; }   // 必殺技の衝撃波が当たった人（何人か）
      if (kind in S.strikeHits) S.strikeHits[kind]++;   // 天光柱・聖火彈・神罰雷が当たった
    }
    if (target === me && guarded) S.guarded++;
  });
  combat.on('ult', ({ fighter }) => { if (fighter === me) S.ult = true; });
  combat.on('shieldStrike', ({ fighter, hits }) => { if (fighter === me && hits) S.shieldHits++; });   // 楯擊・楯押が当たった
  combat.on('miracle', ({ fighter, id }) => { if (fighter === me) S.miracles[id] = true; });   // 奇跡を唱えた（効き目が出た）
  combat.on('ignite', ({ by }) => { if (by === me) S.ignited++; });                            // 淨炎で相手を燃やした
  combat.on('dodge', ({ fighter }) => { if (fighter === me) S.dodges++; });
  combat.on('searchStart', ({ fighter }) => { if (fighter === me) S.searched++; });
  combat.on('assassinate', ({ attacker }) => { if (attacker === me) S.assassinTries++; });
  combat.on('assassinFail', ({ target }) => { if (target === me) S.evaded++; });   // 自分への暗殺を、回避でかわした
  cover.on('enter', ({ fighter }) => { if (fighter === me) S.covered = true; });
  match.on('eliminated', ({ victim, killer }) => { if (killer === me && victim !== me) S.kills++; });
  combat.on('hit', ({ attacker, kind }) => { if (attacker === me && kind === 'assassinate') S.assassinKills++; });   // 暗殺を決めた（2026-11-18 から、暗殺は体力の一部を削る。倒しきったときも同じ知らせ）
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
