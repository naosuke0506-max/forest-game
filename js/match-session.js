// 練習モードの試合：あなた＋bot 3 体。試合の計算（game/）と、見た目・画面（render/・ui/）をつなぐ
import { CHARACTERS, BOT_NAMES } from './game/data.js';
import { createFighter, createMatch } from './game/match.js';
import { createBot } from './game/bot.js';
import { createRandom } from './core/random.js';
import { createFighterView } from './render/fighter-view.js';
import { createBoundary } from './render/boundary.js';
import { createHud } from './ui/hud.js';

const PLAYER_COLOR = '#ffd75e';
const BOT_COLORS = ['#e0574a', '#5aa6e0', '#7cc070'];

/**
 * @param {object} ctx { app, config, terrain, obstacles, player, myChar, debug, phaseDuration }
 */
export function startPracticeMatch({ app, config, terrain, obstacles, player, myChar, debug = false, phaseDuration = null }) {
  const rng = createRandom(config.seed + 9000);

  // 戦う人：あなた（0 番）と bot 3 体。bot は、あなたと違うキャラから選ぶ
  const others = Object.keys(CHARACTERS).filter((c) => c !== myChar);
  const names = [...BOT_NAMES];
  const fighters = [createFighter({ id: 0, name: 'あなた', char: myChar, isPlayer: true, color: PLAYER_COLOR })];
  for (let i = 0; i < 3; i++) {
    const name = names.splice(Math.floor(rng.next() * names.length), 1)[0];
    fighters.push(createFighter({ id: i + 1, name, char: others[i % others.length], isPlayer: false, color: BOT_COLORS[i] }));
  }
  const me = fighters[0];
  const match = createMatch({ fighters, rng, phaseDuration });

  // 出現する場所：最初の範囲の中で、互いに 18m 以上離れ、木や岩から離れた所
  const spots = [];
  for (const f of fighters) {
    let best = null;
    for (let k = 0; k < 200; k++) {
      const r = 6 + Math.sqrt(rng.next()) * (match.areaRadius - 9);
      const a = rng.next() * Math.PI * 2;
      const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      if (!obstacles.isFree(p.x, p.z, 3.5, true)) continue; // 木の幹や岩から 3.5m 以上（低い枝の中に出ないように）
      best = p;
      if (spots.every((s) => Math.hypot(s.x - p.x, s.z - p.z) > 18)) break;
    }
    spots.push(best || { x: 0, z: 0 });
    f.x = spots.at(-1).x; f.z = spots.at(-1).z;
    f.yaw = (Math.atan2(f.x, f.z) * 180) / Math.PI; // 森の中心を向く
  }
  player.spawn(me.x, me.z, me.yaw);

  // 見た目
  const bots = fighters.filter((f) => !f.isPlayer).map((f, i) => createBot(f, createRandom(config.seed + 100 + i)));
  const views = new Map(fighters.map((f) => [f, createFighterView(app, f, terrain)]));
  const boundary = createBoundary(app, terrain);
  const hud = createHud(match, me);

  const world = { obstacles, get areaRadius() { return match.areaRadius; } };
  match.on('eliminated', ({ victim }) => { if (victim === me) player.setFrozen(true); });
  match.on('end', (res) => setTimeout(() => hud.showResult(res), 1200));
  match.on('rewardChosen', ({ fighter }) => { if (fighter === me) player.speedScale = me.stats.speed; });

  // bot はフェーズ報酬を少し考えてから選ぶ（手順 3 で、キャラに合った選び方にする）
  match.on('phaseEnd', () => {
    for (const b of bots) {
      if (!b.fighter.alive) continue;
      setTimeout(() => match.chooseReward(b.fighter, Math.floor(rng.next() * 3)), 1500 + rng.next() * 4000);
    }
  });

  hud.centerMsg(match.phaseInfo.name, match.phaseInfo.note);

  // 確認用のボタン（?debug=1）：戦闘ができるまで、脱落や試合終了を試すため
  if (debug) {
    const panel = document.getElementById('debug');
    panel.hidden = false;
    panel.addEventListener('click', (e) => {
      const act = e.target.dataset.act;
      if (act === 'kill-bot') {
        const target = fighters.find((f) => !f.isPlayer && f.alive);
        if (target) match.eliminate(target, me.alive ? me : null);
      } else if (act === 'die') {
        match.eliminate(me, fighters.find((f) => !f.isPlayer && f.alive) || null);
      } else if (act === 'skip') {
        match.timeLeft = 0.01;
      }
    });
  }
  document.getElementById('again').addEventListener('click', () => location.reload());

  return {
    match,
    fighters,
    showMyBody(v) { views.get(me).setVisible(v); },
    update(dt) {
      match.update(dt);
      player.setAreaRadius(match.areaRadius);
      // あなたの位置を、試合の記録へ写す（手順 2 で、人間も試合の計算で動かす）
      me.x = player.position.x; me.z = player.position.z; me.yaw = player.yaw;
      views.get(me).update(dt, player.moving);
      for (const b of bots) {
        const moving = match.state === 'running' ? b.update(dt, world) : 0;
        views.get(b.fighter).update(dt, moving);
      }
      boundary.update(dt, match.areaRadius);
      hud.update(dt);
    },
  };
}
