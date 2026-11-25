// 練習モードの試合：あなた＋bot 3 体。試合の計算（game/）と、見た目・画面（render/・ui/）をつなぐ
import * as pc from 'playcanvas';
import { CHARACTERS, BOT_NAMES, WEAPONS, AREA_RADIUS, ARMS, MUTATIONS, SHIELD_SKILLS, SHIELD_MOVES, SPRINT, DASH, MIRACLES, ELEMENTS } from './game/data.js';
import { selectedMiracle, miraclesOf, miracleCool } from './game/miracles.js';
import { createMinimap } from './ui/minimap.js';
import { ZONE_NAMES } from './world/zones.js';
import { TIMES } from './world/time-of-day.js';
import { createFighter, createMatch, randomLoadout } from './game/match.js';
import { createBot } from './game/bot.js';
import { createCombat } from './game/combat.js';
import { createRandom } from './core/random.js';
import { createFighterView } from './render/fighter-view.js';
import { loadCharacterModel, createCharacterView } from './render/character-view.js';
import { loadWeaponModels } from './render/weapons.js';
import { createViewModel } from './render/viewmodel.js';
import { createProjectileViews } from './render/projectiles.js';
import { createHud } from './ui/hud.js';
import { createHiding } from './game/hiding.js';
import { createCover } from './game/cover.js';
import { L } from './ui/labels.js';
import { createSfx, wireSounds } from './audio/sfx.js';
import { ICONS, weaponIconOf } from './ui/icons.js';
import { createSenses } from './game/senses.js';
import { stanceButton, stanceSpeed, canRun, stanceShape, resetStance } from './game/stance.js';
import { swimSpeed, toggleDive } from './game/swim.js';
import { STANCES, BODY_TURN } from './game/data.js';
import { ultOf, elementOf, ultLeft } from './game/ultimate.js';
import { createHeatVision } from './render/heat-vision.js';
import { createUltDust } from './render/ult-dust.js';
import { createUltFx } from './render/ult-fx.js';
import { createUltShow, mixColor } from './render/ult-show.js';
import { crestSvg } from './ui/crests.js';
import { createMiracleFx } from './render/miracle-fx.js';
import { createArrowHoles } from './world/arrow-holes.js';
import { LESSONS, createTutorBot, createTutorState } from './game/tutorial.js';
import { createTutorPanel } from './ui/tutor-panel.js';
import { returnToHall } from './core/resume.js';
import { createLanterns } from './render/lantern.js';
import { createTimeGate } from './ui/time-gate.js';
import { createLockOn } from './game/lockon.js';

const PLAYER_COLOR = '#ffd75e';
const BOT_COLORS = ['#e0574a', '#5aa6e0', '#7cc070'];

/**
 * 相手の顔ぶれを決める（開戰の前のマッチング画面 ui/matching.js に出すので、試合を作る前に決める）。
 * 今は本当の相手を探す仕組みが無いので、全員 bot。自分と違う人物から選ぶ（毎回入れ替わる）
 * @returns {{ char: string, name: string, bot: boolean }[]}
 */
export function planRoster(myChar, count = 3) {
  const others = Object.keys(CHARACTERS).filter((c) => c !== myChar);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const names = [...BOT_NAMES];
  return Array.from({ length: count }, (_, i) => ({
    char: others[i % others.length], bot: true,
    name: names.splice(Math.floor(Math.random() * names.length), 1)[0],
  }));
}

/**
 * @param {object} ctx { app, config, terrain, obstacles, player, myChar, loadout, debug, phaseDuration }
 *   roster：相手の顔ぶれ（planRoster。無ければここで決める）
 *   staged：試合を作っても、すぐには始めない（マップ紹介 → 棺桶から出る、の後で begin() を呼ぶ。それまで update は呼ばれない）
 *   loadout：試合の前に選んだ武器 { main, side, shield }（game/data.js の LOADOUTS から。無ければキャラの最初の物）
 */
export async function startPracticeMatch({ app, config, terrain, obstacles, player, myChar, loadout = null, timeOfDay = null, zones = null, buildings = [], trees = [], groundAt = null, insideHouse = null, hides = [], covers = [], furniture = null, sight = null, debug = false, phaseDuration = null, houses = [], tutorial = null, doors = null, church = null, roster = null, staged = false, trunks = [] }) {
  const rng = createRandom(config.seed + 9000);

  // 戦う人：あなた（0 番）と bot 3 体。bot は、あなたと違うキャラから選ぶ（毎回入れ替わる。planRoster）。bot の武器は、選べる物から乱数で選ぶ
  const names = [...BOT_NAMES];
  const fighters = [createFighter({ id: 0, name: L.you, char: myChar, isPlayer: true, color: PLAYER_COLOR, loadout })];
  // 教練（game/tutorial.js）：相手はその教練で決まった人物と動き。ほかは bot 3 体
  const lesson = tutorial ? LESSONS[tutorial] : null;
  const foes = lesson ? lesson.bots : (roster || planRoster(myChar));
  foes.forEach((b, i) => {
    const name = b.name || names.splice(Math.floor(rng.next() * names.length), 1)[0];
    fighters.push(createFighter({ id: i + 1, name, char: b.char, isPlayer: false, color: BOT_COLORS[i % BOT_COLORS.length], loadout: b.loadout || randomLoadout(b.char, () => rng.next()) }));
    fighters.at(-1).bot = true;   // bot（マッチング画面・順位に「bot」と書く。利用者の指示 2026-11-14）
  });
  const me = fighters[0];
  const match = createMatch({ fighters, rng, phaseDuration });

  // 出現する場所：最初の範囲の中で、互いに 80m 以上離れ、木や岩から離れた所
  const spots = [];
  for (const f of fighters) {
    let best = null;
    for (let k = 0; k < 200; k++) {
      const r = 6 + Math.sqrt(rng.next()) * (match.areaRadius - 30);   // 周りの山の斜面には出さない
      const a = rng.next() * Math.PI * 2;
      const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      if (!obstacles.isFree(p.x, p.z, 3.5, true)) continue; // 木の幹や岩から 3.5m 以上（低い枝の中に出ないように）
      if (zones?.wet && zones.wet(p.x, p.z) > 0.05) continue;   // 川と岸には出さない
      if (zones?.caveArea && zones.caveArea(p.x, p.z) > 0) continue;   // 洞窟の中と切り通しには出さない
      best = p;
      if (spots.every((s) => Math.hypot(s.x - p.x, s.z - p.z) > 80)) break;   // 広い森なので、最初は互いに遠く離す
    }
    spots.push(best || { x: 0, z: 0 });
    f.x = spots.at(-1).x; f.z = spots.at(-1).z;
    f.yaw = (Math.atan2(f.x, f.z) * 180) / Math.PI; // 森の中心を向く
  }
  player.spawn(me.x, me.z, me.yaw);

  // 隠れ場所（村の家のベッドの下・タンスの中）
  const hiding = createHiding(hides);
  furniture?.reset();   // 前の試合で開けたままの扉を閉める
  // 家の扉（world/doors.js）：試合の始めは全部閉じている。教練では全部開けておく（教練の手順は、扉が開いている前提で作ってある）
  // 戦闘と bot
  // 壁裏隠れ（村の家の外の壁と中の壁に背を付ける）
  const cover = createCover(covers, { isFree: obstacles.isFree, groundAt: groundAt || ((x, z) => terrain.heightAt(x, z)) });
  // bot の目と耳（game/senses.js）：見える相手・聞こえた音で気づく。音を鳴らす出来事をつなぐ
  const senses = createSenses({ sight, heightAt: terrain.heightAt });
  // 燃える物（利用者の指示 2026-11-18：火炎の人が草・木に触れると火が移る）：木の幹（4 m の升目で探す）と、大草原の草（1.2 m の升目に寄せる）。家の中は燃えない
  const trunkGrid = new Map();
  for (const t of trunks) { const k = `${Math.floor(t.x / 4)},${Math.floor(t.z / 4)}`; if (!trunkGrid.has(k)) trunkGrid.set(k, []); trunkGrid.get(k).push(t); }
  const flammable = (x, z) => {
    if (insideHouse && insideHouse(x, z)) return null;
    const gx = Math.floor(x / 4), gz = Math.floor(z / 4);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const t of trunkGrid.get(`${gx + i},${gz + j}`) || []) if (Math.hypot(t.x - x, t.z - z) < t.r + 0.8) return { kind: 'tree', x: t.x, z: t.z, top: t.top };
    }
    if (zones && zones.weights(x, z).prairie > 0.35) return { kind: 'grass', x: Math.round(x / 1.2) * 1.2, z: Math.round(z / 1.2) * 1.2 };
    return null;
  };
  const combat = createCombat({ match, heightAt: terrain.heightAt, obstacles, groundAt, hiding, cover, senses, flammable });
  // 教練では、決まった所に置き（自分の近く・家の中・壁の前など）、動きの決まった相手にする（game/tutorial.js）
  const lessonCtx = () => ({
    me, bots: fighters.filter((f) => !f.isPlayer), hides, hiding, coverSegs: covers, houses, isFree: (x, z, r) => obstacles.isFree(x, z, r, true),
    insideHouse: insideHouse || null, heightAt: (x, z) => terrain.heightAt(x, z),   // 家の中か・地面の高さ（教練「奇跡・攻」が開けた所を探す）
    spawn: (x, z, yaw) => { player.spawn(x, z, yaw); me.x = x; me.z = z; me.yaw = yaw; me.y = player.position.y; },
  });
  if (lesson) {
    me.deathless = true;   // 教練では自分は倒れない（暗殺されても体力が戻り、やり直せる。game/combat.js の lethal）
    const foeFighters = fighters.filter((f) => !f.isPlayer);
    lesson.setup(lessonCtx());
    for (const f of foeFighters) if (!f.hidden) f.y = (groundAt || ((x, z) => terrain.heightAt(x, z)))(f.x, f.z, f.y ?? null);
  }
  const bots = fighters.filter((f) => !f.isPlayer).map((f, i) => (lesson ? createTutorBot(f, lesson.bots[i].role, me)
    : createBot(f, createRandom(config.seed + 100 + i), fighters)));
  const botOf = new Map(bots.map((b) => [b.fighter, b]));
  combat.on('swing', ({ fighter }) => senses.noise(fighter, 'swing'));
  combat.on('hit', ({ attacker, target }) => { senses.noise(attacker, 'hit', target); botOf.get(target)?.alert(attacker); });
  combat.on('dodge', ({ fighter }) => senses.noise(fighter, 'dodge'));
  // 楯押：傷は無いが、押された人は押した人に気づく
  combat.on('shieldPushed', ({ attacker, target }) => { senses.noise(attacker, 'hit', target); botOf.get(target)?.alert(attacker); });
  combat.on('fire', ({ fighter }) => senses.noise(fighter, 'bow'));
  combat.on('searchStart', ({ fighter }) => senses.noise(fighter, 'search'));
  hiding.on('hide', ({ fighter }) => senses.noise(fighter, 'hide'));

  // 見た目
  // キャラの模型を読み込む。読み込めなかったキャラは、仮の人形で続ける（画面下に知らせを出す）
  const models = new Map();
  // 武器の模型：みんなの武器（持替の武器も）と楯
  const weaponsLoaded = loadWeaponModels(app, fighters.flatMap((f) => [f.primary, ...(f.sidearm ? [f.sidearm] : []), ...(f.shield ? ['shield'] : []), ...(f.left === 'miracle' ? ['talisman'] : [])]));
  const charIds = [...new Set(fighters.map((f) => CHARACTERS[f.char].model))];
  await Promise.all([weaponsLoaded, ...charIds.map((id) =>
    loadCharacterModel(app, id).then((m) => models.set(id, m)).catch((err) => {
      console.warn(err);
      window.__showError?.(`キャラの模型を読み込めませんでした（仮の人形で続けます）: ${err.message}`);
    }))]);
  const views = new Map(fighters.map((f) => {
    const m = models.get(CHARACTERS[f.char].model);
    return [f, m ? createCharacterView(app, f, terrain, m) : createFighterView(app, f, terrain)];
  }));
  const hud = createHud(match, me, { label: lesson ? ['教練', lesson.name] : null, trial: !lesson && phaseDuration && phaseDuration < 1e5 ? phaseDuration : null });   // 教練では残り時間の代わりに教練の名前
  // 試合の前に選んだ兵器・變異：その刻を越えたときに届く（中身はまだ無いので、今は知らせだけ）
  const arms = ARMS[loadout?.arms], mutation = MUTATIONS[loadout?.mutation];
  me.arms = null; me.potion = null;
  match.on('phaseStart', ({ phase }) => {
    if (!me.alive) return;
    if (arms && phase === arms.tier) { me.arms = loadout.arms; hud.addFeed(`兵器「${arms.name}」が届いた${arms.planned ? '（使う仕組みはこれから）' : ''}`); }
    if (mutation && phase === mutation.tier) { me.potion = loadout.mutation; hud.addFeed(`變異の藥「${mutation.name}」が届いた${mutation.planned ? '（飲む仕組みはこれから）' : ''}`); }
  });
  const minimap = createMinimap(document.getElementById('minimap'), { areaRadius: AREA_RADIUS, zones, buildings, heightAt: terrain.heightAt, trees, waterAt: terrain.riverAt || terrain.waterAt });   // 地上の地図は川だけ（天坑の池は地下）
  // 別のエリアに入ったら、左の知らせに出す
  let zoneNow = zones ? zones.zoneAt(me.x, me.z) : null, zoneTimer = 0;
  // ボタン：絵と文字。右手・左手の文字をキャラに合わせる（左手：盾持ちは防御、ほかは強攻撃・持ち替え など）
  // ボタンの中身：絵・名前の札・（あれば）真ん中の秒。見た目は css/style.css の .act-btn（金の輪・色の面・札）
  const setBtn = (el, icon, label, num = '') => { el.innerHTML = `<span class="ab-icon">${icon}</span><span class="ab-label">${label}</span>${num !== '' ? `<span class="ab-num">${num}</span>` : ''}`; };
  // 待ち時間の影（時計回りに減る。--cd：残りの割合 0〜1）。1/50 刻みで、変わったときだけ書く
  const setCd = (el, k) => { const v = Math.round(Math.max(0, Math.min(1, k)) * 50) / 50; if (el._cd !== v) { el._cd = v; el.style.setProperty('--cd', v); } };
  const leftBtn = document.getElementById('btn-left');
  // 左手ボタンの無いキャラ（劍騎士）は、ボタンを出さない
  leftBtn.hidden = !me.left;
  if (me.left) setBtn(leftBtn, me.left === 'guard' ? ICONS.shield : me.left === 'switch' ? ICONS.switch : ICONS.heavy, CHARACTERS[me.char].leftLabel);
  leftBtn.classList.toggle('guard', me.left === 'guard');
  setBtn(document.getElementById('btn-dodge'), ICONS.dodge, L.dodge);
  // 全速力（疾驅ボタン。data.js の SPRINT）：ready（使える）→ 押す → armed（動き出すのを待つ）→ 動き出す → on（time 秒の間、
  // スティックを倒すと全速力）→ cool（待ち時間）→ ready。もう一度押すか、疾驅攻撃をすると早く終わる。しゃがむ・伏せると使えない
  const sprintBtn = document.getElementById('btn-sprint');
  const sprint = { state: 'ready', left: 0 };
  let sprintShown = '';
  const showSprint = () => {
    const sec = sprint.state === 'on' || sprint.state === 'cool' ? Math.ceil(sprint.left) : 0;
    setCd(sprintBtn, sprint.state === 'cool' ? sprint.left / SPRINT.cooldown : 0);
    const key = `${sprint.state}${sec}`;
    if (key === sprintShown) return;
    sprintShown = key;
    setBtn(sprintBtn, ICONS.sprint, L.sprint, sec || '');
    for (const c of ['armed', 'on', 'cool']) sprintBtn.classList.toggle(c, sprint.state === c);
  };
  const endSprint = () => { if (sprint.state === 'on' || sprint.state === 'armed') { sprint.state = 'cool'; sprint.left = SPRINT.cooldown; } };
  combat.on('dashAttack', ({ fighter }) => { if (fighter === me) endSprint(); });
  showSprint();
  // 必殺ボタン（利用者の指示 2026-11-25。game/ultimate.js。PC は G）：英雄の紋と属性の色。使える間は英雄の色に脈打ち、右上に残りの回数。
  // 使い切ると暗くなる（延長戰＝第 6 刻から、もう 1 回使える）。必殺技の間は明るく光る
  const ultBtn = document.getElementById('btn-ult') || document.createElement('button');
  const myUlt = ultOf(me), myEl = elementOf(me);
  if (myEl) {
    ultBtn.style.setProperty('--c1', myEl.color); ultBtn.style.setProperty('--c2', mixColor(myEl.color, myEl.deep, 0.55));
    ultBtn.style.setProperty('--c3', myEl.deep); ultBtn.style.setProperty('--uc', myEl.color);
  }
  let ultShown = '';
  const showUlt = () => {
    if (!myUlt) return;
    const n = ultLeft(me), on = me.action?.kind === 'ult';
    const key = `${n}|${on}`;
    if (key === ultShown) return;
    ultShown = key;
    setBtn(ultBtn, crestSvg(myUlt.crest, { ring: false }), L.ult);
    if (n !== Infinity) ultBtn.insertAdjacentHTML('beforeend', `<span class="ab-count">${n}</span>`);   // 教練では回数を出さない（何度でも使える）
    ultBtn.classList.toggle('ready', n > 0 && !on);
    ultBtn.classList.toggle('spent', !(n > 0) && !on);
    ultBtn.classList.toggle('on', on);
  };
  showUlt();
  combat.on('ultDenied', ({ fighter }) => {
    if (fighter !== me) return;
    if (!(ultLeft(me) > 0)) hud.addFeed(match.overtime ? '必殺技は使い切った' : '必殺技は使い切った（延長戰で、もう一度だけ使える）');
    else hud.addFeed('今は必殺技を出せない');
  });
  combat.on('ult', ({ fighter, ult }) => {
    if (fighter === me || !ult) return;
    const d = Math.hypot(fighter.x - me.x, fighter.z - me.z);
    if (d < 120) hud.addFeed(`${fighter.name}の必殺技「${ult.name}」！`);
  });
  // 延長戰（第 6 刻から）：必殺技がもう 1 回使える。刻の門が開いてから知らせる
  let overtimeNote = false;
  match.on('overtime', () => { overtimeNote = true; showUlt(); });
  match.on('thaw', () => {
    if (!overtimeNote) return;
    overtimeNote = false;
    if (me.alive && !lesson) { hud.centerMsg(L.overtime, '必殺技を、もう一度だけ使える', 3.4); hud.addFeed('延長戰：必殺技がもう一度使える'); }
  });
  // 奇跡（祓魔僧。game/miracles.js）：左手の奇跡ボタンで、選んでいる奇跡を唱える。替ボタン（楯擊の所。PC は H）で次の奇跡へ。
  // 1 つも覚えていない間は出さない。待ち時間の間は暗い影と残りの秒、唱えている間と蘇生の加護の間は金に脈打つ。替ボタンの上に次の奇跡の名前
  const isCleric = me.left === 'miracle';
  const swapBtn = document.getElementById('btn-swap') || document.createElement('button');
  leftBtn.classList.toggle('miracle', isCleric);
  let miracleShown = '';
  const showMiracle = (canShow) => {
    if (!isCleric) return;
    const id = selectedMiracle(me), owned = miraclesOf(me);
    leftBtn.hidden = !canShow || !id;
    swapBtn.hidden = !canShow || owned.length < 2;
    if (!id) return;
    const M = MIRACLES[id], cool = miracleCool(me, id), blessed = id === 'revive' && me.blessing > 0;
    const casting = me.action?.kind === 'miracle' && me.action.id === id;
    const sec = blessed ? Math.ceil(me.blessing) : cool > 0 ? Math.ceil(cool) : 0;
    setCd(leftBtn, cool > 0 ? cool / M.cd : 0);
    const next = owned.length > 1 ? owned[(owned.indexOf(id) + 1) % owned.length] : null;
    const key = `${id}|${sec}|${casting}|${blessed}|${next}`;
    if (key === miracleShown) return;
    miracleShown = key;
    setBtn(leftBtn, ICONS[`m_${id}`] || ICONS.skill, M.name, sec || '');
    leftBtn.classList.toggle('cool', cool > 0);
    leftBtn.classList.toggle('on', casting || blessed);
    setBtn(swapBtn, ICONS.switch, L.swap);
    if (next) swapBtn.insertAdjacentHTML('beforeend', `<span class="ab-next">${MIRACLES[next].name}</span>`);
  };
  // 効き目の残り（体力の板の上）：加護・淨炎・光壁・燃えている
  const buffsEl = document.getElementById('buffs');
  let buffsShown = '';
  const showBuffs = () => {
    if (!buffsEl) return;
    const list = [];
    if (me.alive) {
      if (me.blessing > 0) list.push(['', ICONS.m_revive, '加護', me.blessing]);
      if (me.flame > 0) list.push(['', ICONS.m_flame, '淨炎', me.flame]);
      const w = combat.walls.find((x) => x.owner === me);
      if (w) list.push(['', ICONS.m_wall, '光壁', w.left]);
      // 状態異常（利用者の指示 2026-11-18）：火炎（回避を続けた数）・雷痺。発動していない間は、溜まり（％）を小さな棒で
      if (me.blaze) list.push(['blaze', ICONS.m_flame, `火炎 ${me.blaze.dodges}/${ELEMENTS.fire.dodges}`, me.blaze.left]);
      else if (me.burn) list.push(['burn', ICONS.m_flame, '燃', me.burn.left]);
      if (me.paralyzed > 0) list.push(['para', ICONS.m_thunder, '雷痺', me.paralyzed]);
      else if (me.shock > 0) list.push(['shock', ICONS.m_thunder, '痺', me.shock]);
      if (me.blind > 0) list.push(['', ICONS.m_pillar, '眩', me.blind]);
      const ail = me.ail;
      if (ail && ail.fire >= 1 && !me.blaze) list.push(['gauge fire', ICONS.m_flame, '炎', ail.fire, true]);
      if (ail && ail.thunder >= 1 && !(me.paralyzed > 0)) list.push(['gauge thunder', ICONS.m_thunder, '雷', ail.thunder, true]);
    }
    const key = list.map((b) => `${b[2]}${b[4] ? Math.round(b[3] / 5) : Math.ceil(b[3])}`).join('|');
    if (key === buffsShown) return;
    buffsShown = key;
    buffsEl.hidden = !list.length;
    buffsEl.innerHTML = list.map(([c, icon, name, v, gauge]) => gauge
      ? `<span class="bf ${c}"><i style="width:${Math.round(v)}%"></i>${icon}${name}<b>${Math.round(v)}%</b></span>`
      : `<span class="bf ${c}">${icon}${name}<b>${Math.ceil(v)}</b></span>`).join('');
  };
  // 属性と状態異常の知らせ（利用者の指示 2026-11-18）
  combat.on('blaze', ({ fighter, by }) => {
    if (fighter === me) hud.centerMsg('火炎', `回避を続けて ${ELEMENTS.fire.dodges} 回転がるか、水に入ると消える（消せないと焦げて倒れる）`, 3);
    else if (by === me) hud.addFeed(`${fighter.name}が火炎に包まれた`);
  });
  combat.on('blazeDodge', ({ fighter, count, need }) => { if (fighter === me) hud.addFeed(`火を消す：あと ${need - count} 回`); });
  combat.on('blazeEnd', ({ fighter, how }) => { if (fighter === me && how !== 'burnt' && how !== 'gone') hud.addFeed(how === 'water' ? '水で火が消えた' : how === 'heal' ? '治癒で火が消えた' : '転がって火を消した'); });
  combat.on('paralyzed', ({ fighter, by }) => {
    if (fighter === me) hud.centerMsg('雷痺', 'しびれて動けない（無防備）', 2.2);
    else if (by === me || Math.hypot(fighter.x - me.x, fighter.z - me.z) < 20) hud.addFeed(`${fighter.name}が雷痺した（近づいて致命の一撃を）`);
  });
  combat.on('fireSpread', ({ fire }) => { if (fire.kind === 'tree' && Math.hypot(fire.x - me.x, fire.z - me.z) < 25) hud.addFeed('木に火が移った'); });
  combat.on('hit', ({ attacker, target, kind, wound, back }) => {
    if (kind !== 'assassinate' || !wound) return;
    if (attacker === me) hud.addFeed(`暗殺（${back ? '背後' : '前・横'}）：体力の ${back ? '6 割' : '2 割 5 分'}を削った`);
    else if (target === me) hud.addFeed(`暗殺された：体力の ${back ? '6 割' : '2 割 5 分'}を失った`);
  });
  combat.on('miracle', ({ fighter, id, amount }) => {
    if (fighter !== me) return;
    const M = MIRACLES[id];
    hud.addFeed(id === 'heal' ? `治癒を唱えた（体力 +${Math.round(amount)}）` : id === 'revive' ? `蘇生の加護を受けた（${M.life} 秒）`
      : id === 'wall' ? `光壁を張った（${M.life} 秒）` : id === 'flame' ? `淨炎をまとった（${M.life} 秒）`
      : id === 'pillar' ? '天光柱を唱えた' : id === 'fireball' ? '聖火彈を放った' : '神罰雷を投げた');
  });
  combat.on('miracleBroken', ({ fighter, id }) => { if (fighter === me) hud.addFeed(`${MIRACLES[id].name}が途切れた`); });
  combat.on('revived', ({ fighter }) => {
    if (fighter === me) hud.centerMsg(MIRACLES.revive.name, '光の中から蘇った', 2.6);
    else hud.addFeed(`${fighter.name}が光の中から蘇った`);
  });
  combat.on('wallEnd', ({ wall, broke }) => { if (wall.owner === me && broke) hud.addFeed('光壁が砕けた'); });
  combat.on('blinded', ({ fighter, by }) => {
    if (fighter === me) hud.addFeed('光で目がくらんだ');
    else if (by === me) hud.addFeed(`${fighter.name}の目がくらんだ`);
  });
  combat.on('shocked', ({ fighter, by }) => {
    if (fighter === me) hud.addFeed('雷でしびれて動けない');
    else if (by === me) hud.addFeed(`${fighter.name}がしびれた`);
  });
  // 目くらまし（天光柱）：白い光が画面を覆い、最後の 1 秒で薄れていく
  const blindEl = document.getElementById('blind');
  let blindShown = -1;
  const showBlind = () => {
    if (!blindEl) return;
    const k = me.alive && !spectating ? Math.min(1, (me.blind || 0) / 1.0) * 0.94 : 0;
    const v = Math.round(k * 50) / 50;
    if (v === blindShown) return;
    blindShown = v;
    blindEl.hidden = v <= 0;
    blindEl.style.opacity = String(v);
  };
  combat.on('ignite', ({ fighter, by }) => {
    if (fighter === me) hud.addFeed('燃えている！（水に入ると消える）');
    else if (by === me) hud.addFeed(`${fighter.name}が燃えた`);
  });
  // 楯攻撃ボタン：楯の技があるキャラ（楯劍騎士）だけ。名前は楯の技（鳶形楯は楯擊）
  // （ボタンが画面に無いときは、楯擊ボタンを出さないだけにする。無いまま進めると試合が始まらない：2026-11-10 に一度起きた）
  const shieldBtn = document.getElementById('btn-shield') || document.createElement('button');
  const shieldMoves = me.left === 'guard' && me.shield ? SHIELD_MOVES[me.shield] : null;
  shieldBtn.hidden = !shieldMoves;
  if (shieldMoves) setBtn(shieldBtn, ICONS.shield, SHIELD_SKILLS[shieldMoves.guardAttack].name);
  document.getElementById('settings-btn').innerHTML = ICONS.gear;
  const attackBtn = document.getElementById('btn-attack');
  const attackLabel = () => (WEAPONS[me.weapon].kind === 'bow' ? L.shoot : me.weapon === 'spear' ? L.thrust : L.attack);
  let attackMode = '';   // 攻撃ボタンの今の表示（ふつう / 暗殺 / とどめ）
  const refreshAttack = (mode = attackMode) => {
    attackMode = mode;
    if (mode === 'assassinate') setBtn(attackBtn, ICONS.dagger, L.assassinate);
    else if (mode === 'finisher') setBtn(attackBtn, ICONS.skull, L.finisher);
    else setBtn(attackBtn, weaponIconOf(me.weapon), attackLabel());
  };
  refreshAttack();
  combat.on('switch', ({ fighter }) => { if (fighter === me) refreshAttack(); });

  // 右のボタン（出る・隠れる・壁に背を付ける・壁から離れる）
  const useBtn = document.getElementById('btn-use');
  let nearSpot = null, nearWall = null, useTimer = 0;
  const held = { use: false, sprint: false, door: false, lantern: false, lock: false };   // 前のフレームにボタンを押していたか
  // 捕捉（ロックオン。2026-11-24。利用者の指示。game/lockon.js・数は data.js の LOCK）：「捕捉」ボタン（PC は Tab）で、
  // 近くの直接見える敵を捕まえる。捕まえている間は体が自動でその敵へ向き（player/controller.js の lockAim）、胸に照準の印が出る。
  // もう一度押す（「解除」）か、相手が倒れる・隠れる・遠ざかる・見えなくなる、自分が倒れる・隠れる・壁に背を付ける・梯子を掴むと外れる
  const lockon = createLockOn({ senses, sight, heightAt: terrain.heightAt });
  const lockBtn = document.getElementById('btn-lock') || document.createElement('button');
  const lockMark = document.getElementById('lockmark');
  let lock = null, lockShown = null, lockCheck = 0, lockFind = 0, lockReady = false;
  const lockScreen = new pc.Vec3(), lockFwd = new pc.Vec3();
  const LOCK_WHY = { dead: (n) => `${n}が倒れた`, hidden: (n) => `${n}が隠れた`, far: (n) => `${n}が遠ざかった`, lost: (n) => `${n}を見失った` };
  let lockWhy = null;   // 確認用：最後に外れた訳
  const releaseLock = (why = null) => {
    if (!lock) return;
    lockWhy = why || 'other';
    if (why && LOCK_WHY[why]) hud.addFeed(`捕捉が外れた（${LOCK_WHY[why](lock.target.name)}）`);
    else if (why === 'manual') sfx.lock?.(false);
    lock = null; player.lockAim = null;
  };
  const showLock = () => {
    const want = lock ? 'on' : lockReady ? 'ready' : 'idle';
    if (want === lockShown) return;
    lockShown = want;
    setBtn(lockBtn, ICONS.lock, lock ? L.lockOff : L.lockOn);
    lockBtn.classList.toggle('on', !!lock);
    lockBtn.classList.toggle('idle', want === 'idle');
  };
  showLock();
  // 角燈（ランタン）のボタン：いつでも、腰の角燈を灯す・外す（PC は N。render/lantern.js）。相手（bot）は洞窟の中で灯す
  const lanternBtn = document.getElementById('btn-lantern') || document.createElement('button');
  const lanterns = createLanterns(app, fighters, views, { cave: terrain.land?.cave || null });
  let lanternShown = null, botLanternTimer = 0;
  const showLantern = () => {
    const on = lanterns.isOn(me);
    if (on === lanternShown) return;
    lanternShown = on;
    setBtn(lanternBtn, ICONS.lantern, on ? L.lanternOff : L.lanternOn);
    lanternBtn.classList.toggle('on', on);
  };
  showLantern();
  // 扉のボタン（家の扉の近くにいる間だけ出る。開いていれば「閉」、閉じていれば「開」。PC は T）
  const doorBtn = document.getElementById('btn-door');
  let nearDoor = null, botDoorTimer = 0;
  doors?.setAll(!!lesson);
  doors?.on(({ door, open, by }) => {
    const who = by || { x: door.cx, z: door.cz, y: door.y };
    sfx.door(who, open);
    if (by) senses.noise(by, 'search');   // 扉の音は、探す音と同じくらい遠くまで聞こえる
    if (by) views.get(by)?.doorPush?.();  // 左手を伸ばして扉を押す・引く動き（上半身だけ。render/character-view.js）
  });
  // 教会の隠し扉の石板（world/church.js。扉のボタンで開け閉め。石の擦れる音は、扉と同じく bot に聞こえる）と梯子
  const slab = church?.slab || null, ladderDef = church?.ladder || null;
  if (slab) slab.listeners = [({ open, by }) => { sfx.slab?.(by || { x: slab.cx, z: slab.cz, y: slab.y }, open); if (by) { senses.noise(by, 'search'); views.get(by)?.doorPush?.(); } }];
  /** 扉のボタンで開け閉めできる石板（近くにいて、同じ高さ・梯子に掴まっていない） */
  const nearSlab = () => (slab && !player.ladder && Math.abs((me.y ?? slab.y) - slab.y) < 1.3 && Math.hypot(me.x - slab.cx, me.z - slab.cz) < 1.7 ? slab : null);
  /** 掴める梯子の端（'top'：上の床から下りる・'bottom'：下の間から上る）。上は石板が開いているときだけ */
  const ladderEnd = () => {
    const L = ladderDef;
    if (!L || player.ladder || me.swimming || me.falling) return null;
    if (L.open && Math.abs((me.y ?? 0) - L.top) < 0.5 && Math.hypot(me.x - L.topStand.x, me.z - L.topStand.z) < 0.9) return 'top';
    if (Math.abs((me.y ?? 0) - L.bottom) < 0.8 && Math.hypot(me.x - L.x, me.z - L.z) < 1.1) return 'bottom';
    return null;
  };
  let ladderNear = null;
  player.onLadderOff = (end) => { if (end === 'offTop') hud.addFeed('教会の後陣へ上がった'); };
  let coverStick = null;   // 壁際を歩く向きの見方（スティックを倒し始めたときのカメラの右と前）
  const searchBtn = document.getElementById('btn-search');
  const assassinBtn = document.getElementById('btn-assassinate');
  setBtn(assassinBtn, ICONS.dagger, L.assassinate);
  // 試合の計算が体を動かす行動（暗殺する・される）：その間はプレイヤーの操作の位置と向きを、戦う人の記録に合わせる
  const SCRIPTED = new Set(['assassinate', 'assassinated', 'hideIn', 'hideOut', 'search', 'drag', 'dragged']);
  let wasScripted = false, twistBase = null;
  setBtn(searchBtn, ICONS.eye, L.search);
  // 姿勢ボタン：押したときにすること（立っていれば「しゃがむ」、しゃがむ・伏せていれば「立つ」）。長押しで伏せる
  const stanceBtn = document.getElementById('btn-stance');
  let stanceShown = '';
  const refreshStance = () => {
    // 泳いでいる間は、姿勢ボタンが「潛水」（潜る）・「浮上」（浮く）になる（利用者の指示 2026-11-16。game/swim.js）
    const now = me.swimming ? (me.diving ? 'surface' : 'dive') : (me.stanceTo || me.stance);
    if (now === stanceShown) return;
    stanceShown = now;
    if (now === 'dive') setBtn(stanceBtn, ICONS.dive, L.dive);
    else if (now === 'surface') setBtn(stanceBtn, ICONS.surface, L.surface);
    else if (now === 'stand') setBtn(stanceBtn, ICONS.crouch, L.crouch);
    else setBtn(stanceBtn, ICONS.stand, now === 'prone' ? L.getUp : L.stand);
    stanceBtn.classList.toggle('low', now !== 'stand' && now !== 'dive');
  };
  // 水の中の見え方（目が水面の下にあるとき、画面を青緑に染める）
  const underEl = document.getElementById('underwater');
  let underShown = false;
  combat.on('gasp', ({ fighter }) => { if (fighter === me) { hud.addFeed('息が続かない。水面へ浮いた'); sfx.splash?.(me); } });
  // 天坑から落ちて、下の池（か床）に着いた（game/fall.js）：大きな水音（遠くの bot にも聞こえる）。自分なら知らせる
  const landed = (f, speed, water) => {
    sfx.plunge?.(f, speed, water);
    if (water) senses.noise(f, 'plunge');
    if (f === me) hud.addFeed(water ? '天坑から落ち、地底の池に飛び込んだ' : '高い所から落ちた');
  };
  player.onLand = (speed, water) => { me.y = player.position.y; landed(me, speed, water); };
  refreshStance();
  const hideView = document.getElementById('hideview');

  // 効果音（足音・戦闘・隠れる・鐘など）
  const sfx = createSfx({ terrain, zones, insideHouse, plazas: zones?.plazas || [] });
  wireSounds(sfx, { combat, match, hiding, me });
  // 刻の門（時間が止まっている間に画面をふさぐ鉄の門。ガシャンと閉まり、ガシャン、ガシャンと開く。js/ui/time-gate.js）
  const timeGate = createTimeGate({ sfx });

  // 隠れる・探す：自分が隠れたら隙間から覗く見た目に。近くの bot に見られていたら、その bot は場所を覚えて探しに来る
  // 隠れるところを見たか：隠れる直前に立っていた所が、bot の目（前の 120 度・見える距離・体の半分以上が見える）に入っていたか
  const sees = (b, f, from) => senses.canSee(b, { ...f, ...from, hidden: null });
  hiding.on('hide', ({ fighter, spot, from }) => {
    for (const b of bots) if (b.fighter !== fighter && b.fighter.alive && sees(b.fighter, fighter, from)) b.knowSpot(spot);
    if (fighter !== me) return;
    player.setHide(spot);
    viewModel.setVisible(false);   // 隠れている間は、手元の武器は出さない
    // 一人称：家具の中から隙間を覗く見た目（タンスは扉の縦の隙間、ベッドの下は上が板でふさがる）を重ねる。三人称は「潛伏中」の札だけ
    hideView.className = `hideview ${thirdPerson ? 'third' : spot.kind}`;
    hideView.hidden = false;
    hud.addFeed(spot.kind === 'bed' ? 'ベッドの下に隠れた' : 'タンスの中に隠れた');
  });
  const leaveHideView = () => {
    player.leaveHide(me.x, me.z, me.y, me.yaw);
    viewModel.setVisible(!thirdPerson);
    hideView.hidden = true;
  };
  hiding.on('exit', ({ fighter }) => { if (fighter === me) leaveHideView(); });
  hiding.on('found', ({ searcher, victim, spot }) => {
    if (victim === me) { leaveHideView(); hud.centerMsg('見つかった', '動けない……', 2.5); }
    if (searcher === me) hud.addFeed(`${victim.name}を見つけた！ 引きずり出す`);
    else if (victim !== me && Math.hypot(spot.x - me.x, spot.z - me.z) < 25) hud.addFeed(`${searcher.name} が ${victim.name} を見つけた`);
  });
  hiding.on('empty', ({ searcher, spot }) => { if (searcher === me) hud.addFeed(spot.kind === 'bed' ? 'ベッドの下には誰もいない' : 'タンスの中には誰もいない'); });
  combat.on('lethal', ({ attacker, target, how }) => {
    if (attacker === me) hud.addFeed(how === 'assassinate' ? `${target.name}を暗殺した` : `致命の一撃：${target.name}`);
  });
  combat.on('assassinate', ({ attacker, target }) => {
    if (target === me) hud.centerMsg('暗殺！', '回避で逃げろ', 1.2);
    if (attacker === me) { player.leaveHide(me.x, me.z, me.y, me.yaw); }
  });
  // ぴったり回避（無敵の間に攻撃をかわした）：画面が一瞬白く光る（音は audio/sfx.js）
  const perfectEl = document.getElementById('perfect');
  combat.on('dodged', ({ target }) => {
    if (target !== me) return;
    perfectEl.classList.remove('on'); void perfectEl.offsetWidth; perfectEl.classList.add('on');
  });
  combat.on('assassinFail', ({ attacker, target }) => {
    if (attacker === me) hud.addFeed('暗殺に失敗した（回避された）');
    if (target === me) { hud.addFeed(`${attacker.name}の暗殺をかわした`); if (lesson) hud.centerMsg('かわした！', '敵がひるんでいる間に倒せ', 2); }
  });
  // 教練で自分が「やられた」（倒れない）：動きが終わったら、置き直してやり直す（その教練に retry があるとき）
  let retryWait = false;
  combat.on('spared', ({ target }) => {
    if (target !== me) return;
    hud.hurt(1);
    hud.centerMsg('やられた', lesson?.retry ? 'もう一度。「暗殺！」と出たら、すぐ迴避' : '教練では倒れない', 2.6);
    retryWait = !!lesson?.retry;
  });
  const viewModel = createViewModel(player.camera, me);
  // 鷹の目の見え方（白黒にして、敵の体温を壁越しに描く）：前は弓兵の鷹目。2 回目で弓兵の必殺技「颶風一矢」に使う（me.hawkEye：残りの秒）
  const heat = createHeatVision(player.camera);
  const dust = createUltDust(app, player.camera);  // 砂煙（必殺技の地の属性）
  combat.on('dust', (e) => dust.burst(e));
  // 貫く矢は壁に穴を開ける（2 回目で弓兵の必殺技に使う）
  const holes = createArrowHoles(app, houses);
  // 必殺技（2026-11-25）：光・衝撃波・粒（みんなの画面。render/ult-fx.js）と、自分の画面だけの演出（render/ult-show.js）
  const ultFx = createUltFx(app, { combat, fighters, camera: player.camera, dust });
  const ultShow = createUltShow({ camera: player.camera, player, views, me, heightAt: terrain.heightAt });
  combat.on('ult', ({ fighter, ult, time, at }) => { if (fighter === me && ult) ultShow.play(me, ult, { time, at }); });
  combat.on('ultBurst', (e) => ultShow.burst(e));
  match.on('eliminated', ({ victim }) => { if (victim === me) ultShow.cancel(); });
  const arrows = createProjectileViews(app, combat);
  let thirdPerson = false;
  // 祓魔僧の奇跡の見た目（護符に集まる光・光の柱・加護の輪・光壁・清めの炎・燃える人。render/miracle-fx.js）
  const miracleFx = createMiracleFx(app, { combat, fighters, views, camera: player.camera, firstPerson: () => !thirdPerson && !spectating, me });
  // 一人称でも自分の体（模型）を映す：手・腕・盾・脚が見える（頭は隠す。render/character-view.js）。
  // 模型が読めなかったとき（仮の人形）だけ、画面の手前に武器だけを出す（render/viewmodel.js）
  const fpBody = !!views.get(me).setFirstPerson;
  /** 自分の見え方を、今の状態（一人称・三人称・壁裏・隠れている・観戦）に合わせる（毎フレーム） */
  function refreshMyView() {
    const v = views.get(me);
    const third = thirdPerson || ultShow.active;         // 三人称（確認用）。壁裏隠れも一人称。必殺技の寄るカメラの間は体を全部映す
    // 隠れている・観戦している・一人称で泳いでいる（体が水平になり、目の前をふさぐ）：自分の体は出さない
    const gone = !!me.hidden || !!spectating || (!!me.swimming && !third);
    const body = !gone && (third || (fpBody && me.alive));   // 倒れた後は（観戦に移るまで）一人称で自分の体を出さない
    v.setVisible(body);
    v.setFirstPerson?.(body && !third);
    v.setHeadHidden?.(body && third && player.thirdDistance < 0.7);   // 三人称のカメラが壁に押されて頭のすぐ後ろまで寄った：兜を隠す
    v.setFpLeftHidden?.(body && !third && SCRIPTED.has(me.action?.kind));   // 一人称の暗殺などの間：左腕と楯で前が見えなくならないように
    viewModel.setVisible(!gone && !third && !fpBody && me.alive);
    player.setEyeOffset(body && !third ? v.eyeOffset : null);
  }

  // 戦闘の知らせ：自分が与えたダメージの数字、自分が受けたときの赤い縁
  combat.on('hit', ({ attacker, target, amount, guarded }) => {
    if (attacker === me) hud.showDamage(player.camera, target.x, (target.y ?? terrain.heightAt(target.x, target.z)) + 1.6, target.z, amount, guarded);
    if (target === me) hud.hurt(amount / 25);
  });
  combat.on('guardBreak', ({ fighter }) => { if (fighter === me) hud.addFeed('防禦が崩れた'); });
  combat.on('shieldPushed', ({ attacker, target }) => {
    if (target === me) { hud.hurt(0.25); hud.addFeed('楯で押し返された'); }
    else if (attacker === me) hud.addFeed(`${target.name}を楯で押し返した`);
  });

  // 脱落したら、生き残りを肩越しに観戦する
  let spectating = null;
  const spectateEl = document.getElementById('spectate');
  const nextSpectate = () => {
    const alive = fighters.filter((f) => f.alive && f !== me);
    if (!alive.length) return;
    const i = alive.indexOf(spectating);
    spectating = alive[(i + 1) % alive.length];
    document.getElementById('spectate-name').textContent = `${L.spectating}：${spectating.name}`;
  };
  document.getElementById('spectate-next').addEventListener('click', nextSpectate);
  match.on('eliminated', ({ victim }) => {
    if (victim === me) {
      setTimeout(() => {
        if (match.state !== 'running') return;
        document.querySelector('.vitals').hidden = true;
        document.getElementById('btn-attack').hidden = true;
        document.getElementById('btn-left').hidden = true;
        document.getElementById('btn-dodge').hidden = true;
        stanceBtn.hidden = true; shieldBtn.hidden = true; swapBtn.hidden = true;
        useBtn.hidden = true;
        searchBtn.hidden = true;
        if (doorBtn) doorBtn.hidden = true;
        lanternBtn.hidden = true;
        hideView.hidden = true;
        spectateEl.hidden = false;
        nextSpectate();
      }, 2500);
    } else if (victim === spectating) {
      setTimeout(nextSpectate, 1500);
    }
  });
  match.on('end', () => { spectateEl.hidden = true; });

  const world = { obstacles, groundAt, heightAt: terrain.heightAt, hiding, cover, sight, senses, water: terrain.waterAt || null, get areaRadius() { return match.areaRadius; },
    /** 洞窟（world/cave-plan.js）：bot が中を道なりに歩く・口から出入りするのに使う */
    cave: terrain.land?.cave || null,
    /** f が今暗殺できる相手 { target, grace } か null（bot が暗殺ボタンを押すか決める） */
    assassinTarget: (f) => combat.assassinTarget(f),
    /** 隠れる・出る（動きをしてから。game/hide-acts.js） */
    hideIn: (f, spot) => combat.hideIn(f, spot), hideOut: (f) => combat.hideOut(f) };
  match.on('eliminated', ({ victim }) => { hiding.drop(victim); cover.drop(victim); });
  hiding.on('hide', ({ fighter }) => cover.drop(fighter));
  // 壁裏隠れ：一人称のまま（体の見え方は refreshMyView が毎フレーム合わせる）
  cover.on('enter', ({ fighter }) => {
    if (fighter !== me) return;
    hud.addFeed('壁に背を付けた（スティックで壁際を歩く。離れるときは「離壁」）');
  });
  cover.on('exit', ({ fighter }) => {
    if (fighter !== me) return;
    player.setCover(null);
    me.x = player.position.x; me.z = player.position.z; me.yaw = player.yaw;
  });
  match.on('eliminated', ({ victim }) => { if (victim === me) player.setFrozen(true); });
  match.on('end', (res) => { if (!lesson) setTimeout(() => hud.showResult(res), 1200); });   // 教練では試合の結果を出さない（手順の札に「教練達成」）
  match.on('rewardChosen', ({ fighter }) => { if (fighter === me) player.speedScale = me.stats.speed; });

  // bot はフェーズ報酬を少し考えてから選ぶ（手順 3 で、キャラに合った選び方にする）
  match.on('phaseEnd', () => {
    for (const b of bots) {
      if (!b.fighter.alive) continue;
      setTimeout(() => match.chooseReward(b.fighter, Math.floor(rng.next() * 3)), 1000 + rng.next() * 3000);   // 時間が止まっている 5 秒のうちに
    }
  });

  // 教練：手順の札を出し、出来事を数えて手順を進める（game/tutorial.js・ui/tutor-panel.js）
  const tutor = lesson ? createTutorState(lesson, { me, combat, cover, match }) : null;
  const tutorPanel = lesson ? createTutorPanel(lesson) : null;
  // 始まりの知らせ。棺桶から出てから始まる試合（staged）では、出た時（begin）に出す
  let begun = !staged;
  const opening = () => {
    if (lesson) hud.centerMsg(`教練・${lesson.name}`, lesson.desc);
    else hud.centerMsg(`${match.phaseInfo.name}・${TIMES[match.phaseInfo.time].name}`, match.phaseInfo.note);
  };
  if (begun) opening();
  else { for (const v of views.values()) v.setVisible(false); viewModel.setVisible(false); }   // 棺桶から出るまで、誰の体も（手元の武器も）出さない
  // 時間帯：フェーズが進むと変わる（朝 → 昼 → 夕暮れ → 深夜）
  timeOfDay?.set(match.phaseInfo.time, 2);
  match.on('phaseStart', ({ info }) => timeOfDay?.set(info.time, 20));   // 20 秒かけてゆっくり移り変わる

  // テスト用の操作：設定画面のボタンと、?debug=1 のときの画面上のボタンから使う
  function debugAction(act) {
    if (match.state !== 'running') return;
    if (act === 'kill-bot') {
      const target = fighters.find((f) => !f.isPlayer && f.alive);
      if (target) match.eliminate(target, me.alive ? me : null);
    } else if (act === 'die') {
      if (me.alive) match.eliminate(me, fighters.find((f) => !f.isPlayer && f.alive) || null);
    } else if (act === 'skip') {
      match.timeLeft = 0.01;
    }
  }
  if (debug) {
    const panel = document.getElementById('debug');
    panel.hidden = false;
    panel.addEventListener('click', (e) => { if (e.target.dataset.act) debugAction(e.target.dataset.act); });
  }
  document.getElementById('again').onclick = () => returnToHall();   // 試合の後は大廳へ戻る（core/resume.js）
  let tutorDone = false;

  return {
    match,
    fighters,
    combat,
    bots,
    me,
    /** 棺桶から出た：試合を始める（staged のとき。相手の体を出し、始まりの知らせを出す） */
    begin() {
      if (begun) return;
      begun = true;
      for (const f of fighters) if (f !== me && f.alive) views.get(f).setVisible(true);
      opening();
    },
    get begun() { return begun; },
    /** 三人称のときは自分の体を見せ、手元の武器を隠す */
    showMyBody(v) {
      thirdPerson = v;
      if (me.hidden) hideView.className = `hideview ${v ? 'third' : me.hidden.kind}`;   // 隠れている間に視點を替えた：覗く見た目も替える
      if (!begun) return;
      views.get(me).setVisible(v); viewModel.setVisible(!v);
    },   // 棺桶から出るまでは、体も手元の武器も出さない
    /** @param {{attack: boolean, left: boolean, dodge: boolean, moveX: number, moveY: number}} input プレイヤーの右手・左手・回避と移動スティック */
    update(dt, input) {
      // 1 回の計算で進める時間は最大 0.1 秒（裏から戻った直後などに、一気に動いたり判定を飛ばしたりしないように）
      dt = Math.min(dt, 0.1);
      match.update(dt);
      // 刻が変わった直後は時間が止まる（match.freeze 秒）：誰も動けず、攻撃も当たらない（戦い・bot・矢を進めない）。報酬だけ選べる
      const frozenTime = match.state === 'running' && match.freeze > 0;
      const running = match.state === 'running' && !frozenTime;
      player.setFrozen(frozenTime || !me.alive);
      document.body.classList.toggle('timestop', frozenTime);
      timeGate.update(dt, frozenTime ? match.freeze : 0, me.alive && !spectating);   // 倒れて観戦している間は、門を出さない
      for (const v of views.values()) v.setPaused?.(frozenTime);
      player.setAreaRadius(match.areaRadius);
      // 姿勢：ボタン（押す＝しゃがむ／立つ、長押し＝伏せる）。しゃがむ・伏せると遅く、走れず、目が低い
      if (input.stance && running && me.alive && !me.hidden && !me.cover) {
        if (me.swimming) {
          // 泳いでいる間：潜る・浮く
          const r = toggleDive(me);
          if (r === 'dive') { hud.addFeed('水の中へ潜った（息が続く間だけ）'); sfx.splash?.(me); }
          else if (r === 'surface') sfx.splash?.(me);
          else if (r === 'nobreath') hud.addFeed('息が整うまで潜れない');
        } else stanceButton(me, input.stance);
      }
      player.diveK = me.diveK || 0;
      player.speedScale = me.stats.speed * (me.moveScale ?? 1) * stanceSpeed(me);
      // その場で回る速さ：鎧の重さで決まる（data.js の BODY_TURN）。ひるんでいる間は遅く、伏せていればとても遅い
      player.turnSpeed = BODY_TURN.turn[me.weight] || BODY_TURN.turn.medium;
      player.turnScale = !me.alive ? 0 : (me.stun > 0 ? 0.3 : 1) * (me.stance === 'prone' ? 0.35 : me.stance === 'crouch' ? 0.75 : 1);
      player.noRun = !canRun(me);
      // ボタンは押した瞬間だけ働かせる（押している間ずっと働くと、指を離すまでの数フレームで入って出てしまう：壁裏隠れ・疾驅）
      const usePressed = input.use && !held.use, sprintPressed = input.sprint && !held.sprint, doorPressed = input.door && !held.door;
      const lanternPressed = input.lantern && !held.lantern, lockPressed = input.lock && !held.lock;
      held.use = !!input.use; held.sprint = !!input.sprint; held.door = !!input.door; held.lantern = !!input.lantern; held.lock = !!input.lock;
      // 捕捉（ロックオン）：押すと、近くの直接見える敵を捕まえる。捕まえていれば外す
      const lockFree = running && me.alive && !me.hidden && !me.cover && !player.ladder && !spectating;
      if (lockPressed && lockFree) {
        if (lock) releaseLock('manual');
        else {
          const t = lockon.pick(me, fighters, player.viewYaw);
          if (t) { lock = { target: t, lostFor: 0, seen: true }; lockCheck = 0; sfx.lock?.(true); hud.addFeed(`${t.name}を捕捉した`); }
          else hud.addFeed('捕捉できる敵がいない（近くに、直接見える敵がいない）');
        }
      }
      if (lock && !lockFree && match.state !== 'running') releaseLock();
      else if (lock && (!me.alive || me.hidden || me.cover || player.ladder || spectating)) releaseLock();
      if (lock && (lockCheck -= dt) <= 0) {   // 続けられるか（1 秒に 10 回）
        const why = lockon.keep(me, lock, 0.1 - lockCheck);
        lockCheck = 0.1;
        if (why) releaseLock(why);
      }
      player.lockAim = lock ? lockon.aimAt(lock.target) : null;
      // ボタン：捕まえられる相手がいない間は暗く（1 秒に 4 回調べる）
      if (!lock && lockFree && (lockFind -= dt) <= 0) { lockFind = 0.25; lockReady = !!lockon.pick(me, fighters, player.viewYaw); }
      lockBtn.hidden = !lockFree;
      showLock();
      // 角燈：灯す・外す（いつでも。隠れている間は灯せない）
      if (lanternPressed && running && me.alive && !me.hidden) {
        const on = lanterns.toggle(me);
        sfx.lantern?.(me, on);
        hud.addFeed(on ? '角燈を灯した' : '角燈を外した');
      }
      // 相手（bot）：洞窟の中にいる間は灯し、出たら外す
      if ((botLanternTimer -= dt) <= 0) {
        botLanternTimer = 0.6;
        const cv = terrain.land?.cave;
        for (const f of fighters) if (!f.isPlayer && f.alive) lanterns.set(f, !!cv && cv.inside(f.x, f.z, f.y ?? 0) > 0.6);
      }
      lanternBtn.hidden = !running || !me.alive || !!me.hidden;
      showLantern();
      // 家の扉：近くの扉を開ける・閉める（扉口に人がいる間は閉められない）
      if (doorPressed && nearDoor && running && me.alive && !me.hidden && !(me.helpless > 0)) {
        if (nearDoor.custom) { if (!nearDoor.toggle(me, fighters)) hud.addFeed('石板の上に人がいて閉められない'); }   // 教会の隠し扉の石板
        else if (!doors.toggle(nearDoor, me, fighters)) hud.addFeed('扉口に人がいて閉められない');
        useTimer = 0;
      }
      // bot は、閉じた扉へ向かって歩いているときに、自分で開ける
      if (doors && (botDoorTimer -= dt) <= 0) {
        botDoorTimer = 0.25;
        for (const f of fighters) {
          if (f.isPlayer || !f.alive || f.hidden || f.helpless > 0) continue;
          const d = doors.nearest(f.x, f.z, f.y ?? null, 1.35);
          if (!d || d.open) continue;
          const a = (f.yaw * Math.PI) / 180, dx = d.cx - f.x, dz = d.cz - f.z, dl = Math.hypot(dx, dz) || 1;
          if ((-Math.sin(a) * dx - Math.cos(a) * dz) / dl > 0.25) doors.toggle(d, f, fighters);   // 扉の方を向いている
        }
      }
      doors?.update(dt);
      // 全速力：押したら動き出すのを待ち、動き出したら SPRINT.time 秒。しゃがむ・伏せる・隠れる・倒れると終わる
      if (sprintPressed && running && me.alive) {
        if (sprint.state === 'ready' && canRun(me) && !me.hidden && !me.cover) sprint.state = 'armed';
        else if (sprint.state === 'armed' || sprint.state === 'on') endSprint();
      }
      if ((sprint.state === 'armed' || sprint.state === 'on') && (!me.alive || !canRun(me) || me.hidden || me.cover)) endSprint();
      if (sprint.state === 'armed' && player.moving > 0.12) { sprint.state = 'on'; sprint.left = SPRINT.time; }
      if (running && (sprint.state === 'on' || sprint.state === 'cool')) {
        sprint.left -= dt;
        if (sprint.left <= 0) { if (sprint.state === 'on') { sprint.state = 'cool'; sprint.left = SPRINT.cooldown; } else sprint.state = 'ready'; }
      }
      const sprintOn = sprint.state === 'on';
      player.sprint = sprintOn && !me.action && !me.guarding;
      player.sprintSpeed = SPRINT.speed * me.stats.speed;
      me.sprinting = sprintOn && player.moving > 0.12;   // 全速力で走っている（攻擊ボタンが疾驅攻撃になる。game/combat.js）
      sprintBtn.hidden = !running || !me.alive || !!me.hidden || !!me.cover;
      showSprint();
      ultBtn.hidden = !myUlt || !running || !me.alive || !!me.hidden;
      showUlt();
      showMiracle(running && me.alive && !me.hidden && !spectating);
      showBuffs();
      showBlind();
      player.setEyeHeight((config.player.eyeHeight * stanceShape(me).eye) / STANCES.stand.eye);
      me.gait = (player.moving > 0.75 || me.sprinting) && canRun(me) ? 'run' : player.moving > 0.05 ? 'walk' : 'still';   // 足音の大きさ（bot の耳）
      refreshStance();
      // あなたの位置を、試合の記録へ写す（いずれ人間も試合の計算で動かす）
      // 隠れている間は、隠れ場所が自分の位置（体は動かない）。暗殺の動きなど、試合の計算が体を動かす間は写さない（あとで逆に合わせる）
      const scripted = SCRIPTED.has(me.action?.kind);
      if (me.alive && !me.hidden && !me.cover && !scripted) { me.x = player.position.x; me.z = player.position.z; me.y = player.position.y; me.yaw = player.yaw; me.pitch = player.pitch; me.headYaw = player.headYaw; }
      // 川（game/swim.js）：足もとの水の深さ・泳いでいるか。泳ぐ速さはキャラの速さとスタミナで決まる
      if (!me.alive && player.ladder) { player.leaveLadder(); me.ladder = null; }   // 梯子に掴まったまま倒れたら、手を離す
      // 下から梯子を上って、閉じた石板に頭が届いた：押し開ける（重い石の音）
      if (player.ladder && slab && !slab.open && ladderDef && player.position.y > ladderDef.top - 1.45) { slab.toggle(me); hud.addFeed('石板を押し上げて開けた'); }
      if (me.alive && !me.hidden) {
        me.waterDepth = player.waterDepth; me.waterSurface = player.waterSurface; me.swimming = player.swimming;
        me.falling = player.falling;   // 天坑の縦穴を落ちている（game/fall.js。その間は何もできない）
        me.ladder = player.ladder;     // 梯子に掴まっている（その間は何もできない。動きは render/character-view.js）
        if (me.waterDepth > 0.35 && me.stance && me.stance !== 'stand') resetStance(me);   // 水の中ではしゃがめない・伏せられない
      }
      player.swimSpeed = swimSpeed(me);
      // 壁裏隠れ：離れるのは「離壁」か暗殺のときだけ。移動スティックを倒すと、壁に背を付けたまま壁際を歩く
      // （スティックの向きを画面の向きで地面の向きにし、壁に沿った分だけ進む）。カメラは三人称で覗く向きを見る
      // 歩く向きの見方（カメラの右と前）は、スティックを倒し始めたときのものを、離すまで使う
      // （壁際を逆へ歩くと覗く向きが変わってカメラが振り向くため、その度に向きが入れ替わらないように）
      const stickOn = Math.hypot(input.moveX, input.moveY) > 0.15;
      if (!me.cover || !stickOn) coverStick = null;
      if (me.cover && running) {
        if (stickOn && !coverStick) {
          const cr = player.camera.right, cf = player.camera.forward, fl = Math.hypot(cf.x, cf.z) || 1;
          coverStick = { rx: cr.x, rz: cr.z, fx: cf.x / fl, fz: cf.z / fl };
        }
        const k = coverStick || { rx: 0, rz: 0, fx: 0, fz: 0 };
        const mx = k.rx * input.moveX + k.fx * input.moveY, mz = k.rz * input.moveX + k.fz * input.moveY;
        const sg = me.cover.seg;
        const along = mx * -sg.nz + mz * sg.nx;   // 壁から外を向いた体の右へ進む量
        const mv = cover.slide(me, Math.max(-1, Math.min(1, along)), dt);
        me.gait = mv > 0 ? 'walk' : 'still';
        const pd = cover.peekDir(me);
        player.setCover({ x: me.x, y: me.y, z: me.z, nx: sg.nx, nz: sg.nz, px: pd.x, pz: pd.z });
      }
      if (me.hidden) { me.yaw = player.yaw; me.pitch = player.pitch; }
      if (running) combat.control(me, { ...input, viewYaw: player.viewYaw });   // 回避の向きは、見ている向きから（スティックの向き）
      // 攻撃ボタン：溜めている間は縁が光り、溜めるほど強く光る（溜攻撃 2 を待つ間は満タンの光）
      {
        const a = me.action, k = a?.kind === 'charge' ? Math.min(1, a.t / a.tech.full) : a?.kind === 'charge2' ? 1 : -1;
        attackBtn.classList.toggle('charging', k >= 0);
        if (k >= 0) attackBtn.style.setProperty('--charge', k.toFixed(2));
      }
      // 右のボタン：隠れている間は「出る」。近くにベッドやタンスがあれば「隠れる」と「探す」、家の壁があれば「壁に背を付ける」
      if ((useTimer -= dt) <= 0) {
        useTimer = 0.12;
        const free = running && me.alive && !(me.helpless > 0) && !me.action && !player.ladder;   // 梯子に掴まっている間は、ほかのボタンは出ない
        nearSpot = free && !me.hidden && !me.cover ? hiding.nearest(me) : null;
        nearWall = free && !me.hidden && !me.cover && !nearSpot ? cover.nearest(me) : null;
        ladderNear = free && !me.hidden && !me.cover && !nearSpot ? ladderEnd() : null;   // 教会の隠し扉の梯子
        const mode = me.hidden ? 'exit' : me.cover ? 'leave' : nearSpot ? 'hide' : ladderNear ? 'ladder' : nearWall ? 'wall' : '';
        useBtn.hidden = !mode;
        stanceBtn.hidden = !running || !me.alive || !!me.hidden || !!me.cover;
        shieldBtn.hidden = !shieldMoves || stanceBtn.hidden;
        if (mode && useBtn.dataset.label !== mode) {
          useBtn.dataset.label = mode;
          if (mode === 'exit') setBtn(useBtn, ICONS.exit, L.exit);
          else if (mode === 'hide') setBtn(useBtn, ICONS.hood, L.hide);
          else if (mode === 'wall') setBtn(useBtn, ICONS.wall, L.wall);
          else if (mode === 'leave') setBtn(useBtn, ICONS.exit, L.leave);
          else if (mode === 'ladder') setBtn(useBtn, ICONS.ladder, L.ladder);
        }
        searchBtn.hidden = !nearSpot;
        // 扉のボタン
        nearDoor = free && !me.hidden && !me.cover ? (doors?.nearest(me.x, me.z, me.y ?? null) || nearSlab()) : null;
        if (doorBtn) {
          doorBtn.hidden = !nearDoor;
          const dm = nearDoor ? (nearDoor.open ? 'close' : 'open') : '';
          if (dm && doorBtn.dataset.label !== dm) { doorBtn.dataset.label = dm; setBtn(doorBtn, ICONS.door, dm === 'open' ? L.doorOpen : L.doorClose); }
        }
        // 攻撃ボタン：無防備な相手が近くにいれば「とどめ」（暗殺は別の暗殺ボタン）
        const helplessNear = fighters.some((f) => f !== me && f.alive && f.helpless > 0 && Math.hypot(f.x - me.x, f.z - me.z) < 2.6);
        const want = helplessNear ? 'finisher' : '';
        if (want !== attackMode) refreshAttack(want);
        // 暗殺ボタン：暗殺できる相手が近くにいるときだけ出る（壁裏隠れ・隠れ場所からだけ。game/assassin.js）
        assassinBtn.hidden = !(running && me.alive && combat.assassinTarget(me));
      }
      if (usePressed && running && me.alive) {
        if (me.hidden) combat.hideOut(me);                // 出る動きをしてから出る（game/hide-acts.js）
        else if (me.cover) cover.exit(me);
        else if (nearSpot) combat.hideIn(me, nearSpot);   // 隠れる動きをしてから隠れる。誰かがいれば、覗いて見つけて引きずり出す
        else if (ladderNear && !player.ladder) { player.grabLadder(ladderDef, ladderNear === 'top'); ladderNear = null; useBtn.hidden = true; }   // 梯子を掴む
        else if (nearWall) {
          // 覗く向き：今見ている向きが、壁に背を付けたときの右か左か
          const sg = nearWall.seg, a = (player.yaw * Math.PI) / 180;
          const right = (-Math.sin(a)) * -sg.nz + (-Math.cos(a)) * sg.nx;
          if (cover.enter(me, nearWall, right > 0 ? 'r' : 'l')) {
            const pd = cover.peekDir(me);
            player.setCover({ x: me.x, y: me.y, z: me.z, nx: sg.nx, nz: sg.nz, px: pd.x, pz: pd.z });
          }
        }
        nearSpot = nearWall = null; useTimer = 0;
      }
      for (const b of bots) {
        const moving = running ? b.update(dt, world) : 0;
        if (b.fighter.landed) { landed(b.fighter, b.fighter.landed, b.fighter.landedWater); b.fighter.landed = 0; }   // 天坑から落ちて着いた
        if (running) combat.control(b.fighter, b.combatInput);
        views.get(b.fighter).update(dt, moving);
        // 隠れている人も、タンスの中・ベッドの下にいる（render/character-view.js。扉や掛け布の隙間から見えることがある）
      }
      // 試合が終わった後も（最後の 1 人を暗殺で倒した時など）、していた動きは最後まで進める。
      // 前は、試合が終わった瞬間に暗殺の動きが途中で止まり、体の回りに付いて回る目（一人称）が横や後ろを向いたまま動けなくなっていた
      // （2026-11-17。利用者の指摘：タンスやベッドから暗殺すると視点がおかしくなる。教練は 1 人倒すと試合が終わるので、必ず起きていた）
      if (!frozenTime) combat.update(dt);
      if (!frozenTime) { senses.update(dt); sfx.update(dt, fighters); }   // 時間が止まっている間は、見聞きも息遣いも止まる
      viewModel.paused = frozenTime;
      furniture?.update(dt, fighters, frozenTime);   // タンスの扉・ベッドの掛け布（隠れる・探す動きに合わせて）
      // 回避・暗殺の飛びかかり・押されて下がる（重い被弾・よろめき）は試合の計算が体を動かすので、その位置をプレイヤーの操作へ戻す
      const pushed = me.react && me.react.push > 0 && me.react.t <= me.react.time;
      const lunging = me.action?.kind === 'attack' && ((me.action.tech?.dash && me.action.t <= DASH.lungeTime + 0.05) || me.action.tech?.slide);   // 疾驅攻撃の踏み込み・奧義の滑り
      if (me.alive && (me.action?.kind === 'dodge' || pushed || lunging)) { player.position.x = me.x; player.position.z = me.z; player.position.y = me.y; }
      // 暗殺の動きなど：体の位置と向きを、プレイヤーの操作へ合わせる（動きが終わった時の、体の移った所と向きも）
      const scriptedNow = SCRIPTED.has(me.action?.kind);
      const viewBefore = player.viewYaw;
      // 隠れている間は合わせない（隠れた時の外を見る向き player.setHide を、家具の方を向いた体の向きで上書きしないように）
      if (me.alive && !me.hidden && (scriptedNow || wasScripted)) player.follow(me.x, me.y, me.z, me.yaw);
      wasScripted = scriptedNow;
      views.get(me).update(dt, player.moving);
      viewModel.update(dt, player.moving);
      arrows.update();
      // 観戦：見ている人の肩越しにカメラを置く
      if (spectating) {
        if (!spectating.alive) nextSpectate();
        player.setPose(spectating.x, spectating.z, spectating.yaw, spectating.y);
      }
      refreshMyView();
      lanterns.update(dt, player.camera.getPosition());   // 角燈を腰に付け、光を置く（体の姿が決まった後）
      if (me.hawkEye > 0) me.hawkEye = Math.max(0, me.hawkEye - (frozenTime ? 0 : dt));
      heat.update(dt, me.hawkEye > 0 && me.alive && !spectating, fighters, me, views);   // 鷹の目：白黒にして、敵の体温を壁越しに描く
      if (!frozenTime) { dust.update(dt); holes.update(combat.projectiles); }
      ultShow.update(frozenTime ? 0 : dt); // 必殺技の寄るカメラ・揺れ（プレイヤーの操作がカメラを置いた後。時間が止まっている間は、技と一緒に止まる）
      ultFx.update(frozenTime ? 0 : dt);   // 必殺技の光・衝撃波・粒（板は、動かした後のカメラへ向ける）
      miracleFx.update(frozenTime ? 0 : dt);   // 時間が止まっている間は、光も炎も止まる
      if (tutor && tutor.update(dt, { insideHouse })) {
        tutorPanel.show(tutor.step);
        // 全部できた：少し見せてから、自動で大廳へ戻る（利用者の指示 2026-11-14）
        if (tutor.step >= lesson.steps.length && !tutorDone) {
          tutorDone = true;
          hud.centerMsg('教練達成', `${lesson.name}　大廳へ戻ります`, 3.6);
          setTimeout(returnToHall, 3800);
        }
      }
      // 教練でやられた後：暗殺の動きが終わったら、置き直してやり直す
      if (retryWait && !tutorDone && !me.action && !fighters.some((f) => f.action?.kind === 'assassinate')) {
        retryWait = false;
        for (const f of fighters) { if (f !== me && f.alive) { f.stun = 0; f.action = null; if (f.hidden) hiding.exit(f); } }
        lesson.retry(lessonCtx());
        player.follow(me.x, me.y, me.z, me.yaw);
      }
      // 暗殺の動きの間は、一人称の目が体（肩の線）の回った分に付いて回る（動きの始めの肩の向きから。動きの終わりに体の向きが移ると 0 に戻る）
      const ma = me.action, twisting = (ma?.kind === 'assassinate' && ma.phase === 'strike') || (SCRIPTED.has(ma?.kind) && ma?.kind !== 'assassinate');
      if (twisting) {
        // 一人称の目は、頭の向いている向きに合わせる（肩の線に合わせると、前かがみや振り向きの途中で、目が自分の体の方を向くことがあった。
        // 2026-11-17）。頭の向きを測れていない模型（仮の人形）は、今までどおり肩の線
        const vw = views.get(me), sy = vw.headYaw ?? vw.shoulderYaw;
        // 始めの肩の向きの分は引く（構えの姿の少しのねじれ）。ただし、動きの始めから体が大きく回っている
        // （タンスの中で外を向いている・出る動き）ときは引かない（目は体の向く外を見る）
        if (twistBase === null) { const d0 = (((sy - me.yaw) + 540) % 360) - 180; twistBase = Math.abs(d0) < 30 ? d0 : 0; }
        player.setTwist((((sy - me.yaw - twistBase) + 540) % 360) - 180);
      } else {
        // 動きが終わった：体の向きが移っても、見ている向きはそのまま（首の向きへ引き継ぐ）
        // ただし隠れた時は引き継がない（タンスに後ろ向きに入る 180 度の回りが首の向きに残り、隠れている間の目が横の壁を向いていた。2026-11-14 に直した）
        if (twistBase !== null) { player.setTwist(0); if (!me.hidden) player.keepView(viewBefore); }
        twistBase = null; player.setTwist(0);
      }
      // 水の中：目（カメラ）が水面の下にあるとき、画面を青緑に染める
      {
        const cp = player.camera.getPosition(), wq = terrain.waterAt?.(cp.x, cp.z);
        const under = !!wq && cp.y < wq.surface - 0.03 && cp.y > wq.surface - wq.depth - 0.8;
        if (under !== underShown) { underShown = under; if (underEl) underEl.hidden = !under; }
      }
      // 捕捉の照準：相手の胸の画面の位置に置く（カメラの後ろなら隠す。見えていない間は薄く）
      if (lockMark) {
        let on = false;
        if (lock) {
          const a = lockon.aimAt(lock.target), cam = player.camera;
          lockFwd.set(a.x, a.y, a.z).sub(cam.getPosition());
          if (lockFwd.dot(cam.forward) > 0.2) {
            cam.camera.worldToScreen(lockFwd.set(a.x, a.y, a.z), lockScreen);
            lockMark.style.transform = `translate(${lockScreen.x.toFixed(1)}px, ${lockScreen.y.toFixed(1)}px)`;
            lockMark.classList.toggle('dim', !lock.seen);
            on = true;
          }
        }
        if (lockMark.hidden === on) lockMark.hidden = !on;
      }
      hud.update(dt);
      hud.updateVitals(me);
      minimap.update(dt, spectating || me);
      if (zones && me.alive && (zoneTimer -= dt) <= 0) {
        zoneTimer = 0.5;
        const z = zones.zoneAt(me.x, me.z);
        // 村は 3 つあるので、村の中なら村の名前（山邑・川邑・野邑）
        const name = zones.caveAt?.(me.x, me.z, me.y) > 0.5 ? (zones.caveName?.(me.x, me.z) || '風穴')   // 洞窟の中（風穴・地底洞・大空洞）
          : z === 'castle' ? (zones.villageAt?.(me.x, me.z)?.name || ZONE_NAMES.castle) : ZONE_NAMES[z];
        if (name !== zoneNow) { zoneNow = name; hud.addFeed(`${name}に入った`); }
      }
      // 敵の頭上の名前と体力は出さない（見つけるのも、相手の残りを見極めるのも自分の目で）
    },
    get spectating() { return spectating; },
    /** 目が水面の下にあるか（水の中では外の音がこもる。main.js） */
    get underwater() { return underShown; },
    debugAction,
    views,   // 確認用（自動テストから見た目の状態を読むため）
    combat,  // 確認用（自動テストから戦闘の出来事を数えるため）
    miracleFx,  // 確認用（奇跡の見た目の数）
    hiding,
    sfx,
    senses,
    cover,
    holes,   // 確認用（矢の穴）
    ultFx,   // 確認用（必殺技の見た目の数）
    ultShow, // 確認用（必殺技の寄るカメラ）
    lanterns,   // 確認用（角燈）
    /** 確認用：捕捉している相手（無ければ null）と、捕まえられる相手がいるか */
    get lock() { return lock ? { name: lock.target.name, seen: lock.seen, lostFor: lock.lostFor } : null; },
    get lockReady() { return lockReady; },
    get lockWhy() { return lockWhy; },
  };
}
