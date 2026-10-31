// 起動の順番だけを書く。中身は機能ごとのファイルにある
import { CONFIG } from './config.js';
import { createApp } from './core/app.js';
import { createTerrain } from './world/terrain.js';
import { createEnvironment } from './world/environment.js';
import { createObstacles } from './world/obstacles.js';
import { createTrees, createGrass } from './world/vegetation.js';
import { createRocks } from './world/rocks.js';
import { createPlayer } from './player/controller.js';
import { createInput } from './input/input.js';
import { createTitleScreen, createStats } from './ui/screens.js';

// <head> の仕組みが拾ったエラーのうち、画面ができる前のものをここで表示する
(window.__pendingErrors || []).forEach((m) => window.__showError(m));

const titleScreen = createTitleScreen();

async function boot() {
  const canvas = document.getElementById('app');
  const { app } = await createApp(canvas, CONFIG.quality);

  // 世界を組み立てる（置く順番が大事：木 → 岩 → 草。草は木や岩を避けて生える）
  const terrain = createTerrain(app, CONFIG, CONFIG.seed);
  const env = createEnvironment(app, CONFIG);
  const obstacles = createObstacles();
  createTrees(app, CONFIG, CONFIG.seed, terrain, obstacles);
  createRocks(app, CONFIG, CONFIG.seed, terrain, obstacles);
  createGrass(app, CONFIG, CONFIG.seed, terrain, obstacles);

  const player = createPlayer(app, CONFIG, terrain, obstacles, env.fogColor);
  const touchLayer = document.getElementById('touch-layer');
  const input = createInput(touchLayer, document.getElementById('stick'), CONFIG);
  const stats = createStats(app, CONFIG.showStats, CONFIG.qualityName);

  let playing = false;
  app.on('update', (dt) => {
    if (playing) player.update(dt, input.read());
    stats.update(dt);
  });

  // タイトルの後ろでも森を描いておく（背景として見せる）
  app.start();

  // 確認用（自動テストから状態を読むため）
  window.__forest = { app, player, obstacles };

  titleScreen.ready(() => {
    input.reset();
    touchLayer.hidden = false;
    document.getElementById('hud').hidden = false;
    playing = true;
  });
}

boot().catch((err) => {
  console.error(err);
  titleScreen.fail(`起動エラー: ${err && err.message ? err.message : err}`);
});
