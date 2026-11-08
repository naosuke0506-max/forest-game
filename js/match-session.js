// 練習モードの試合：あなた＋bot 3 体。試合の計算（game/）と、見た目・画面（render/・ui/）をつなぐ
import { CHARACTERS, BOT_NAMES, WEAPONS, AREA_RADIUS, ARMS, MUTATIONS, SHIELD_SKILLS, SHIELD_MOVES } from './game/data.js';
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
import { stanceButton, stanceSpeed, canRun, stanceShape } from './game/stance.js';
import { STANCES, BODY_TURN } from './game/data.js';

const PLAYER_COLOR = '#ffd75e';
const BOT_COLORS = ['#e0574a', '#5aa6e0', '#7cc070'];

/**
 * @param {object} ctx { app, config, terrain, obstacles, player, myChar, loadout, debug, phaseDuration }
 *   loadout：試合の前に選んだ武器 { main, side, shield }（game/data.js の LOADOUTS から。無ければキャラの最初の物）
 */
export async function startPracticeMatch({ app, config, terrain, obstacles, player, myChar, loadout = null, timeOfDay = null, zones = null, buildings = [], trees = [], groundAt = null, insideHouse = null, hides = [], covers = [], furniture = null, sight = null, debug = false, phaseDuration = null }) {
  const rng = createRandom(config.seed + 9000);

  // 戦う人：あなた（0 番）と bot 3 体。bot は、あなたと違うキャラから選ぶ（毎回入れ替わる）。bot の武器は、選べる物から乱数で選ぶ
  const others = Object.keys(CHARACTERS).filter((c) => c !== myChar);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const names = [...BOT_NAMES];
  const fighters = [createFighter({ id: 0, name: L.you, char: myChar, isPlayer: true, color: PLAYER_COLOR, loadout })];
  for (let i = 0; i < 3; i++) {
    const name = names.splice(Math.floor(rng.next() * names.length), 1)[0];
    const char = others[i % others.length];
    fighters.push(createFighter({ id: i + 1, name, char, isPlayer: false, color: BOT_COLORS[i], loadout: randomLoadout(char, () => rng.next()) }));
  }
  const me = fighters[0];
  const match = createMatch({ fighters, rng, phaseDuration });

  // 出現する場所：最初の範囲の中で、互いに 80m 以上離れ、木や岩から離れた所
  const spots = [];
  for (const f of fighters) {
    let best = null;
    for (let k = 0; k < 200; k++) {
      const r = 6 + Math.sqrt(rng.next()) * (match.areaRadius - 9);
      const a = rng.next() * Math.PI * 2;
      const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      if (!obstacles.isFree(p.x, p.z, 3.5, true)) continue; // 木の幹や岩から 3.5m 以上（低い枝の中に出ないように）
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
  // 戦闘と bot
  // 壁裏隠れ（村の家の外の壁と中の壁に背を付ける）
  const cover = createCover(covers, { isFree: obstacles.isFree, groundAt: groundAt || ((x, z) => terrain.heightAt(x, z)) });
  // bot の目と耳（game/senses.js）：見える相手・聞こえた音で気づく。音を鳴らす出来事をつなぐ。暗殺できるか（相手に見られていないか）にも使う
  const senses = createSenses({ sight, heightAt: terrain.heightAt });
  const combat = createCombat({ match, heightAt: terrain.heightAt, obstacles, groundAt, hiding, cover, senses });
  const bots = fighters.filter((f) => !f.isPlayer).map((f, i) => createBot(f, createRandom(config.seed + 100 + i), fighters));
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
  const weaponsLoaded = loadWeaponModels(app, fighters.flatMap((f) => [f.primary, ...(f.sidearm ? [f.sidearm] : []), ...(f.shield ? ['shield'] : [])]));
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
  const hud = createHud(match, me);
  // 試合の前に選んだ兵器・變異：その刻を越えたときに届く（中身はまだ無いので、今は知らせだけ）
  const arms = ARMS[loadout?.arms], mutation = MUTATIONS[loadout?.mutation];
  me.arms = null; me.potion = null;
  match.on('phaseStart', ({ phase }) => {
    if (!me.alive) return;
    if (arms && phase === arms.tier) { me.arms = loadout.arms; hud.addFeed(`兵器「${arms.name}」が届いた${arms.planned ? '（使う仕組みはこれから）' : ''}`); }
    if (mutation && phase === mutation.tier) { me.potion = loadout.mutation; hud.addFeed(`變異の藥「${mutation.name}」が届いた${mutation.planned ? '（飲む仕組みはこれから）' : ''}`); }
  });
  const minimap = createMinimap(document.getElementById('minimap'), { areaRadius: AREA_RADIUS, zones, buildings, heightAt: terrain.heightAt, trees });
  // 別のエリアに入ったら、左の知らせに出す
  let zoneNow = zones ? zones.zoneAt(me.x, me.z) : null, zoneTimer = 0;
  // ボタン：絵と文字。右手・左手の文字をキャラに合わせる（左手：盾持ちは防御、ほかは強攻撃・持ち替え など）
  const setBtn = (el, icon, label) => { el.innerHTML = `<span class="ab-icon">${icon}</span><span class="ab-label">${label}</span>`; };
  const leftBtn = document.getElementById('btn-left');
  // 左手ボタンの無いキャラ（劍騎士）は、ボタンを出さない
  leftBtn.hidden = !me.left;
  if (me.left) setBtn(leftBtn, me.left === 'guard' ? ICONS.shield : me.left === 'switch' ? ICONS.switch : ICONS.heavy, CHARACTERS[me.char].leftLabel);
  leftBtn.classList.toggle('guard', me.left === 'guard');
  setBtn(document.getElementById('btn-dodge'), ICONS.dodge, L.dodge);
  // 楯攻撃ボタン：楯の技があるキャラ（楯劍騎士）だけ。名前は楯の技（鳶形楯は楯擊）
  const shieldBtn = document.getElementById('btn-shield');
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
    const now = me.stanceTo || me.stance;
    if (now === stanceShown) return;
    stanceShown = now;
    if (now === 'stand') setBtn(stanceBtn, ICONS.crouch, L.crouch);
    else setBtn(stanceBtn, ICONS.stand, now === 'prone' ? L.getUp : L.stand);
    stanceBtn.classList.toggle('low', now !== 'stand');
  };
  refreshStance();
  const hideView = document.getElementById('hideview');

  // 効果音（足音・戦闘・隠れる・鐘など）
  const sfx = createSfx({ terrain, zones, insideHouse, villageCenter: zones?.castle });
  wireSounds(sfx, { combat, match, hiding, me });

  // 隠れる・探す：自分が隠れたら隙間から覗く見た目に。近くの bot に見られていたら、その bot は場所を覚えて探しに来る
  // 隠れるところを見たか：隠れる直前に立っていた所が、bot の目（前の 120 度・見える距離・体の半分以上が見える）に入っていたか
  const sees = (b, f, from) => senses.canSee(b, { ...f, ...from, hidden: null });
  hiding.on('hide', ({ fighter, spot, from }) => {
    for (const b of bots) if (b.fighter !== fighter && b.fighter.alive && sees(b.fighter, fighter, from)) b.knowSpot(spot);
    if (fighter !== me) return;
    player.setHide(spot);
    viewModel.setVisible(false);   // 隠れている間は三人称（家具の上の少し後ろから見る）。手元の武器は出さない
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
    if (target === me) hud.addFeed(`${attacker.name}の暗殺をかわした`);
  });
  const viewModel = createViewModel(player.camera, me);
  const arrows = createProjectileViews(app, combat);
  let thirdPerson = false;
  // 一人称でも自分の体（模型）を映す：手・腕・盾・脚が見える（頭は隠す。render/character-view.js）。
  // 模型が読めなかったとき（仮の人形）だけ、画面の手前に武器だけを出す（render/viewmodel.js）
  const fpBody = !!views.get(me).setFirstPerson;
  /** 自分の見え方を、今の状態（一人称・三人称・壁裏・隠れている・観戦）に合わせる（毎フレーム） */
  function refreshMyView() {
    const v = views.get(me);
    const gone = !!me.hidden || !!spectating;           // 隠れている・観戦している：自分の体は出さない
    const third = thirdPerson;                           // 三人称（確認用）。壁裏隠れも一人称
    const body = !gone && (third || (fpBody && me.alive));   // 倒れた後は（観戦に移るまで）一人称で自分の体を出さない
    v.setVisible(body);
    v.setFirstPerson?.(body && !third);
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
        stanceBtn.hidden = true; shieldBtn.hidden = true;
        useBtn.hidden = true;
        searchBtn.hidden = true;
        hideView.hidden = true;
        spectateEl.hidden = false;
        nextSpectate();
      }, 2500);
    } else if (victim === spectating) {
      setTimeout(nextSpectate, 1500);
    }
  });
  match.on('end', () => { spectateEl.hidden = true; });

  const world = { obstacles, groundAt, hiding, cover, sight, senses, get areaRadius() { return match.areaRadius; },
    /** f が今暗殺できる相手 { target, grace } か null（bot が暗殺ボタンを押すか決める） */
    assassinTarget: (f) => combat.assassinTarget(f),
    /** 隠れる・出る（動きをしてから。game/hide-acts.js） */
    hideIn: (f, spot) => combat.hideIn(f, spot), hideOut: (f) => combat.hideOut(f) };
  match.on('eliminated', ({ victim }) => { hiding.drop(victim); cover.drop(victim); });
  hiding.on('hide', ({ fighter }) => cover.drop(fighter));
  // 壁裏隠れ：自分が壁に背を付けたら三人称（体を見せ、手元の武器を隠す）。離れたら元に戻す
  cover.on('enter', ({ fighter }) => {
    if (fighter !== me) return;
    views.get(me).setVisible(true); viewModel.setVisible(false);
    hud.addFeed('壁に背を付けた（スティックで壁際を歩く。離れるときは「離壁」）');
  });
  cover.on('exit', ({ fighter }) => {
    if (fighter !== me) return;
    player.setCover(null);
    me.x = player.position.x; me.z = player.position.z; me.yaw = player.yaw;
    views.get(me).setVisible(thirdPerson); viewModel.setVisible(!thirdPerson);
  });
  match.on('eliminated', ({ victim }) => { if (victim === me) player.setFrozen(true); });
  match.on('end', (res) => setTimeout(() => hud.showResult(res), 1200));
  match.on('rewardChosen', ({ fighter }) => { if (fighter === me) player.speedScale = me.stats.speed; });

  // bot はフェーズ報酬を少し考えてから選ぶ（手順 3 で、キャラに合った選び方にする）
  match.on('phaseEnd', () => {
    for (const b of bots) {
      if (!b.fighter.alive) continue;
      setTimeout(() => match.chooseReward(b.fighter, Math.floor(rng.next() * 3)), 1000 + rng.next() * 3000);   // 時間が止まっている 5 秒のうちに
    }
  });

  hud.centerMsg(`${match.phaseInfo.name}・${TIMES[match.phaseInfo.time].name}`, match.phaseInfo.note);
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
  document.getElementById('again').addEventListener('click', () => location.reload());

  return {
    match,
    fighters,
    combat,
    bots,
    /** 三人称のときは自分の体を見せ、手元の武器を隠す */
    showMyBody(v) { thirdPerson = v; views.get(me).setVisible(v); viewModel.setVisible(!v); },
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
      for (const v of views.values()) v.setPaused?.(frozenTime);
      player.setAreaRadius(match.areaRadius);
      // 姿勢：ボタン（押す＝しゃがむ／立つ、長押し＝伏せる）。しゃがむ・伏せると遅く、走れず、目が低い
      if (input.stance && running && me.alive && !me.hidden && !me.cover) stanceButton(me, input.stance);
      player.speedScale = me.stats.speed * (me.moveScale ?? 1) * stanceSpeed(me);
      // その場で回る速さ：鎧の重さで決まる（data.js の BODY_TURN）。ひるんでいる間は遅く、伏せていればとても遅い
      player.turnSpeed = BODY_TURN.turn[me.weight] || BODY_TURN.turn.medium;
      player.turnScale = !me.alive ? 0 : (me.stun > 0 ? 0.3 : 1) * (me.stance === 'prone' ? 0.35 : me.stance === 'crouch' ? 0.75 : 1);
      player.noRun = !canRun(me);
      player.setEyeHeight((config.player.eyeHeight * stanceShape(me).eye) / STANCES.stand.eye);
      me.gait = player.moving > 0.75 && canRun(me) ? 'run' : player.moving > 0.05 ? 'walk' : 'still';   // 足音の大きさ（bot の耳）
      refreshStance();
      // あなたの位置を、試合の記録へ写す（いずれ人間も試合の計算で動かす）
      // 隠れている間は、隠れ場所が自分の位置（体は動かない）。暗殺の動きなど、試合の計算が体を動かす間は写さない（あとで逆に合わせる）
      const scripted = SCRIPTED.has(me.action?.kind);
      if (me.alive && !me.hidden && !me.cover && !scripted) { me.x = player.position.x; me.z = player.position.z; me.y = player.position.y; me.yaw = player.yaw; me.pitch = player.pitch; me.headYaw = player.headYaw; }
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
      if (running) combat.control(me, input);
      // 攻撃ボタン：溜めている間は縁が光り、溜めるほど強く光る（溜攻撃 2 を待つ間は満タンの光）
      {
        const a = me.action, k = a?.kind === 'charge' ? Math.min(1, a.t / a.tech.full) : a?.kind === 'charge2' ? 1 : -1;
        attackBtn.classList.toggle('charging', k >= 0);
        if (k >= 0) attackBtn.style.setProperty('--charge', k.toFixed(2));
      }
      // 右のボタン：隠れている間は「出る」。近くにベッドやタンスがあれば「隠れる」と「探す」、家の壁があれば「壁に背を付ける」
      if ((useTimer -= dt) <= 0) {
        useTimer = 0.12;
        const free = running && me.alive && !(me.helpless > 0) && !me.action;
        nearSpot = free && !me.hidden && !me.cover ? hiding.nearest(me) : null;
        nearWall = free && !me.hidden && !me.cover && !nearSpot ? cover.nearest(me) : null;
        const mode = me.hidden ? 'exit' : me.cover ? 'leave' : nearSpot ? 'hide' : nearWall ? 'wall' : '';
        useBtn.hidden = !mode;
        stanceBtn.hidden = !running || !me.alive || !!me.hidden || !!me.cover;
        shieldBtn.hidden = !shieldMoves || stanceBtn.hidden;
        if (mode && useBtn.dataset.label !== mode) {
          useBtn.dataset.label = mode;
          if (mode === 'exit') setBtn(useBtn, ICONS.exit, L.exit);
          else if (mode === 'hide') setBtn(useBtn, ICONS.hood, L.hide);
          else if (mode === 'wall') setBtn(useBtn, ICONS.wall, L.wall);
          else if (mode === 'leave') setBtn(useBtn, ICONS.exit, L.leave);
        }
        searchBtn.hidden = !nearSpot;
        // 攻撃ボタン：無防備な相手が近くにいれば「とどめ」（暗殺は別の暗殺ボタン）
        const helplessNear = fighters.some((f) => f !== me && f.alive && f.helpless > 0 && Math.hypot(f.x - me.x, f.z - me.z) < 2.6);
        const want = helplessNear ? 'finisher' : '';
        if (want !== attackMode) refreshAttack(want);
        // 暗殺ボタン：暗殺できる相手が近くにいるときだけ出る（見られていない・壁裏・隠れ場所から。game/assassin.js）
        assassinBtn.hidden = !(running && me.alive && combat.assassinTarget(me));
      }
      if (input.use && running && me.alive) {
        if (me.hidden) combat.hideOut(me);                // 出る動きをしてから出る（game/hide-acts.js）
        else if (me.cover) cover.exit(me);
        else if (nearSpot) combat.hideIn(me, nearSpot);   // 隠れる動きをしてから隠れる。誰かがいれば、覗いて見つけて引きずり出す
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
        if (running) combat.control(b.fighter, b.combatInput);
        views.get(b.fighter).update(dt, moving);
        views.get(b.fighter).setVisible(!b.fighter.hidden);   // 隠れている人は見えない
      }
      if (running) combat.update(dt);
      if (!frozenTime) { senses.update(dt); sfx.update(dt, fighters); }   // 時間が止まっている間は、見聞きも息遣いも止まる
      viewModel.paused = frozenTime;
      furniture?.update(dt, fighters, frozenTime);   // タンスの扉・ベッドの掛け布（隠れる・探す動きに合わせて）
      // 回避・暗殺の飛びかかり・押されて下がる（重い被弾・よろめき）は試合の計算が体を動かすので、その位置をプレイヤーの操作へ戻す
      const pushed = me.react && me.react.push > 0 && me.react.t <= me.react.time;
      if (me.alive && (me.action?.kind === 'dodge' || pushed)) { player.position.x = me.x; player.position.z = me.z; player.position.y = me.y; }
      // 暗殺の動きなど：体の位置と向きを、プレイヤーの操作へ合わせる（動きが終わった時の、体の移った所と向きも）
      const scriptedNow = SCRIPTED.has(me.action?.kind);
      const viewBefore = player.viewYaw;
      if (me.alive && (scriptedNow || wasScripted)) player.follow(me.x, me.y, me.z, me.yaw);
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
      // 暗殺の動きの間は、一人称の目が体（肩の線）の回った分に付いて回る（動きの始めの肩の向きから。動きの終わりに体の向きが移ると 0 に戻る）
      const ma = me.action, twisting = (ma?.kind === 'assassinate' && ma.phase === 'strike') || (SCRIPTED.has(ma?.kind) && ma?.kind !== 'assassinate');
      if (twisting) {
        const sy = views.get(me).shoulderYaw;
        // 始めの肩の向きの分は引く（構えの姿の少しのねじれ）。ただし、動きの始めから体が大きく回っている
        // （タンスの中で外を向いている・出る動き）ときは引かない（目は体の向く外を見る）
        if (twistBase === null) { const d0 = (((sy - me.yaw) + 540) % 360) - 180; twistBase = Math.abs(d0) < 30 ? d0 : 0; }
        player.setTwist((((sy - me.yaw - twistBase) + 540) % 360) - 180);
      } else {
        // 動きが終わった：体の向きが移っても、見ている向きはそのまま（首の向きへ引き継ぐ）
        if (twistBase !== null) { player.setTwist(0); player.keepView(viewBefore); }
        twistBase = null; player.setTwist(0);
      }
      hud.update(dt);
      hud.updateVitals(me);
      minimap.update(dt, spectating || me);
      if (zones && me.alive && (zoneTimer -= dt) <= 0) {
        zoneTimer = 0.5;
        const z = zones.zoneAt(me.x, me.z);
        if (z !== zoneNow) { zoneNow = z; hud.addFeed(`${ZONE_NAMES[z]}に入った`); }
      }
      // 敵の頭上の名前と体力は出さない（見つけるのも、相手の残りを見極めるのも自分の目で）
    },
    get spectating() { return spectating; },
    debugAction,
    views,   // 確認用（自動テストから見た目の状態を読むため）
    combat,  // 確認用（自動テストから戦闘の出来事を数えるため）
    hiding,
    sfx,
    senses,
    cover,
  };
}
