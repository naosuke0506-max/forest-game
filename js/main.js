// 起動の順番だけを書く。中身は機能ごとのファイルにある
import { CONFIG } from './config.js';
import { createApp } from './core/app.js';
import { createTerrain } from './world/terrain.js';
import { createEnvironment } from './world/environment.js';
import { createObstacles } from './world/obstacles.js';
import { createTrees, createGrass } from './world/vegetation.js';
import { createRocks } from './world/rocks.js';
import { createWind } from './world/wind.js';
import { loadTextureSets } from './world/materials.js';
import { loadSky } from './world/sky.js';
import { loadTreeModels, startLoadingNear, createModelTrees } from './world/trees.js';
import { loadProps, createProps } from './world/props.js';
import { createPlayer } from './player/controller.js';
import { createInput } from './input/input.js';
import { createTitleScreen, createStats } from './ui/screens.js';
import { createSettings } from './ui/settings.js';
import { startPracticeMatch } from './match-session.js';

// <head> の仕組みが拾ったエラーのうち、画面ができる前のものをここで表示する
(window.__pendingErrors || []).forEach((m) => window.__showError(m));

const titleScreen = createTitleScreen();

async function boot() {
  const canvas = document.getElementById('app');
  const { app } = await createApp(canvas, CONFIG.quality);

  // 実写の質感画像（地面・樹皮・岩）と空を、並行して読み込む
  const [tex, sky, treeModels, propTypes] = await Promise.all([
    loadTextureSets(app.graphicsDevice, CONFIG.quality, (done, total) => titleScreen.progress(done, total)),
    loadSky(),
    loadTreeModels(app, CONFIG.quality),
    loadProps(app, CONFIG.quality),
  ]);

  // 世界を組み立てる（置く順番が大事：木 → 岩 → 草。草は木や岩を避けて生える）
  const terrain = createTerrain(app, CONFIG, CONFIG.seed, tex.ground);
  const env = createEnvironment(app, CONFIG, sky);
  const wind = createWind(app, CONFIG);
  const obstacles = createObstacles();
  // 木：Tripo AI の模型。読み込めなかったときは仮の木
  const trees = treeModels
    ? createModelTrees(app, CONFIG, CONFIG.seed, terrain, obstacles, treeModels)
    : (createTrees(app, CONFIG, CONFIG.seed, terrain, obstacles, tex.bark), null);
  // 森の小物（岩・切り株・落ち枝・シダ・草）：Poly Haven の模型。読み込めなかったときは仮の岩と草
  let props = null;
  if (propTypes) {
    props = createProps(app, CONFIG, CONFIG.seed, terrain, obstacles, propTypes);
  } else {
    createRocks(app, CONFIG, CONFIG.seed, terrain, obstacles, tex.rock);
    createGrass(app, CONFIG, CONFIG.seed, terrain, obstacles);
  }

  const player = createPlayer(app, CONFIG, terrain, obstacles, env.fogColor);
  const touchLayer = document.getElementById('touch-layer');
  const input = createInput(touchLayer, document.getElementById('stick'), CONFIG);
  const stats = createStats(app, CONFIG.showStats, CONFIG.qualityName);

  let playing = false, session = null;
  app.on('update', (dt) => {
    if (playing) player.update(dt, input.read());
    session?.update(dt);
    trees?.update(dt, player.camera.getPosition());
    props?.update(dt, player.camera.getPosition());
    wind.update(dt);
    stats.update(dt);
  });

  // タイトルの後ろでも森を描いておく（背景として見せる）
  app.start();

  // 木の近く用（精細な形）は、起動後に裏で読み込む
  if (trees) startLoadingNear(app, treeModels, (name) => trees.enableNear(name));

  // 確認用（自動テストから状態を読むため）
  window.__forest = { app, player, obstacles, terrain, trees, props, wind };

  // 設定（視点・性能表示）。変わるたびに反映する
  const applySettings = (st) => {
    player.setViewMode(st.view);
    session?.showMyBody(st.view === 'third');
    document.getElementById('stats').hidden = st.stats === 'off';
  };
  const settings = createSettings(applySettings);

  titleScreen.ready((myChar) => {
    input.reset();
    touchLayer.hidden = false;
    document.getElementById('hud').hidden = false;
    session = startPracticeMatch({
      app, config: CONFIG, terrain, obstacles, player, myChar,
      debug: CONFIG.debug, phaseDuration: CONFIG.phaseDuration,
    });
    window.__forest.session = session;
    applySettings(settings);
    playing = true;
  });
}

boot().catch((err) => {
  console.error(err);
  titleScreen.fail(`起動エラー: ${err && err.message ? err.message : err}`);
});
