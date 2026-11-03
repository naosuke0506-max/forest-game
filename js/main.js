// 起動の順番だけを書く。中身は機能ごとのファイルにある
import { CONFIG } from './config.js';
import { createApp } from './core/app.js';
import { createTerrain } from './world/terrain.js';
import { createEnvironment } from './world/environment.js';
import { createTimeOfDay } from './world/time-of-day.js';
import { createFence } from './world/fence.js';
import { createSunGlare } from './render/sun-glare.js';
import { createRandom } from './core/random.js';
import { AREA_RADIUS } from './game/data.js';
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
import { BUILD } from './version.js';
import { refreshIfStale } from './core/freshness.js';

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
  // 外周の柵（高さ約 10m）。ここから先へは行けない
  createFence(app, terrain, AREA_RADIUS, createRandom(CONFIG.seed + 55), tex.bark);
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
  // 時間帯（朝・昼・夕暮れ・深夜）。霧の色が変わったら、空の無い所の背景色も合わせる
  env.onFogColor = (c) => { player.camera.camera.clearColor = c; };
  const timeOfDay = createTimeOfDay(app, env, CONFIG, player.camera);
  const sunGlare = createSunGlare(player.camera, env.sun, timeOfDay, {
    canopies: trees?.canopies || [], trunks: trees?.trunks || [],
    fence: { radius: AREA_RADIUS + 0.4, height: 10 }, heightAt: terrain.heightAt,
  });
  const touchLayer = document.getElementById('touch-layer');
  const input = createInput(touchLayer, document.getElementById('stick'), CONFIG);
  const stats = createStats(app, CONFIG.showStats, CONFIG.qualityName);

  let playing = false, session = null;
  app.on('update', (dt) => {
    const frame = playing ? input.read() : null;
    if (playing) player.update(dt, frame);
    session?.update(dt, frame || { attack: false, left: false, dodge: false, moveX: 0, moveY: 0 });
    trees?.update(dt, player.camera.getPosition(), player.camera.forward);
    props?.update(dt, player.camera.getPosition(), player.camera.forward);
    wind.update(dt);
    timeOfDay.update(dt);
    sunGlare.update(dt);
    stats.update(dt);
  });

  // タイトルの後ろでも森を描いておく（背景として見せる）
  app.start();

  // 木の近く用（精細な形）は、起動後に裏で読み込む
  if (trees) startLoadingNear(app, treeModels, (name) => trees.enableNear(name));

  // 確認用（自動テストから状態を読むため）
  window.__forest = { app, player, obstacles, terrain, trees, props, wind, timeOfDay };

  // 設定（視点・性能表示）。変わるたびに反映する
  const applySettings = (st) => {
    // 視点は一人称だけ（三人称は観戦のときと、確認用の ?view=third だけ）
    player.setViewMode(CONFIG.view);
    session?.showMyBody(CONFIG.view === 'third');
    document.getElementById('stats').hidden = st.stats === 'off';
  };
  const settings = createSettings(applySettings, (act) => session?.debugAction(act));

  titleScreen.ready(async (myChar) => {
    input.reset();
    session = await startPracticeMatch({
      app, config: CONFIG, terrain, obstacles, player, myChar, timeOfDay,
      debug: CONFIG.debug,
      // フェーズの長さ：URL の ?phase= があればそれ、無ければ設定画面の「テスト用」
      phaseDuration: CONFIG.phaseDuration ?? (settings.phaseLen === 'normal' ? null : Number(settings.phaseLen)),
    });
    touchLayer.hidden = false;
    document.getElementById('hud').hidden = false;
    window.__forest.session = session;
    applySettings(settings);
    playing = true;
  });
}

// 古いファイルが混ざっていたら、取り直して読み込み直す（そのときは起動しない）
if (!(await refreshIfStale(BUILD))) boot().catch((err) => {
  console.error(err);
  titleScreen.fail(`起動エラー: ${err && err.message ? err.message : err}`);
});
