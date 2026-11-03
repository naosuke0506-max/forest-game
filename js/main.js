// 起動の順番だけを書く。中身は機能ごとのファイルにある
import { CONFIG } from './config.js';
import { createApp } from './core/app.js';
import { createTerrain } from './world/terrain.js';
import { createEnvironment } from './world/environment.js';
import { createTimeOfDay } from './world/time-of-day.js';
import { createFence } from './world/fence.js';
import { createVillage } from './world/castle.js';
import { createFloors } from './world/floors.js';
import { createZones } from './world/zones.js';
import { loadGroundCover, createGroundCover } from './world/ground-cover.js';
import { createSunGlare } from './render/sun-glare.js';
import { createSkyLights } from './render/sky-lights.js';
import { createAirParticles } from './render/air-particles.js';
import { audio } from './audio/engine.js';
import { createAmbience } from './audio/ambience.js';
import { createRandom } from './core/random.js';
import { AREA_RADIUS } from './game/data.js';
import { createObstacles } from './world/obstacles.js';
import { createTrees, createGrass } from './world/vegetation.js';
import { createRocks } from './world/rocks.js';
import { createWind } from './world/wind.js';
import { loadTextureSets, loadDiffuse } from './world/materials.js';
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
  const [tex, sky, treeModels, propTypes, grassTex] = await Promise.all([
    loadTextureSets(app.graphicsDevice, CONFIG.quality, (done, total) => titleScreen.progress(done, total)),
    loadSky(),
    loadTreeModels(app, CONFIG.quality),
    loadProps(app, CONFIG.quality),
    loadGroundCover(app, CONFIG.quality),
  ]);

  // 世界を組み立てる（置く順番が大事：木 → 岩 → 草。草は木や岩を避けて生える）
  // エリア分け（中央の森・北の深い森・東の大草原・南西の城と村・道）
  const zones = createZones(CONFIG.seed, CONFIG.world.playRadius);
  const terrain = createTerrain(app, CONFIG, CONFIG.seed, tex.ground, zones);
  const env = createEnvironment(app, CONFIG, sky);
  const wind = createWind(app, CONFIG);
  const obstacles = createObstacles();
  // 外周の柵（高さ約 10m）。ここから先へは行けない
  createFence(app, terrain, AREA_RADIUS, createRandom(CONFIG.seed + 55), tex.bark);
  // 木：Tripo AI の模型。読み込めなかったときは仮の木
  const trees = treeModels
    ? createModelTrees(app, CONFIG, CONFIG.seed, terrain, obstacles, treeModels, zones)
    : (createTrees(app, CONFIG, CONFIG.seed, terrain, obstacles, tex.bark), null);
  // 森の小物（岩・切り株・落ち枝・シダ・草）：Poly Haven の模型。読み込めなかったときは仮の岩と草
  let props = null;
  if (propTypes) {
    props = createProps(app, CONFIG, CONFIG.seed, terrain, obstacles, propTypes, zones);
  } else {
    createRocks(app, CONFIG, CONFIG.seed, terrain, obstacles, tex.rock);
    createGrass(app, CONFIG, CONFIG.seed, terrain, obstacles);
  }
  // 城と村（南西のエリア）。建物の当たり判定も登録するので、地面の草より先に作る
  // 歩ける床（地面のほかに、家の一階・二階の床と階段）
  const floors = createFloors(terrain.heightAt);
  const village = createVillage(app, CONFIG, terrain, obstacles, zones, floors);
  // 地面を覆う草（自分の周りだけ。短い草・穂・白い花・大草原の背の高い草）
  const groundCover = grassTex ? createGroundCover(app, CONFIG, CONFIG.seed, terrain, obstacles, grassTex, zones) : null;

  const player = createPlayer(app, CONFIG, terrain, obstacles, env.fogColor);
  player.setGround(floors.groundAt);
  // 時間帯（朝・昼・夕暮れ・深夜）。霧の色が変わったら、空の無い所の背景色も合わせる
  env.onFogColor = (c) => { player.camera.camera.clearColor = c; };
  const timeOfDay = createTimeOfDay(app, env, CONFIG, player.camera);
  const sunGlare = createSunGlare(player.camera, env.sun, timeOfDay, {
    canopies: trees?.canopies || [], trunks: trees?.trunks || [],
    fence: { radius: AREA_RADIUS + 0.4, height: 10 }, heightAt: terrain.heightAt,
  });
  // 太陽と月の円盤・木漏れ日の光の筋、空気の中の塵・舞い落ちる葉・蛍
  const skyLights = createSkyLights(app, player.camera, env.sun, timeOfDay, {
    canopies: trees?.canopies || [], heightAt: terrain.heightAt, zones, farClip: CONFIG.atmosphere.farClip,
  });
  const air = createAirParticles(app, player.camera, timeOfDay, { heightAt: terrain.heightAt, zones, sun: env.sun });
  // 環境音（風・葉・鳥・夜の虫・梟）。音は試合を始めるボタンを押したときから出る（iPad の決まり）
  const ambience = createAmbience({ timeOfDay, wind, zones });
  let indoorK = 0;
  const touchLayer = document.getElementById('touch-layer');
  const input = createInput(touchLayer, document.getElementById('stick'), CONFIG);
  const stats = createStats(app, CONFIG.showStats, CONFIG.qualityName);

  let playing = false, session = null, deepK = 0;
  app.on('update', (dt) => {
    const frame = playing ? input.read() : null;
    if (playing) player.update(dt, frame);
    session?.update(dt, frame || { attack: false, left: false, dodge: false, use: false, moveX: 0, moveY: 0 });
    trees?.update(dt, player.camera.getPosition(), player.camera.forward);
    groundCover?.update(dt, player.camera.getPosition(), player.camera.forward);
    props?.update(dt, player.camera.getPosition(), player.camera.forward);
    wind.update(dt);
    // 深い森の中は霧が濃く暗い（遠くは見えないので、木も近くだけ描く）
    const cp = player.camera.getPosition();
    const deep = zones.weights(cp.x, cp.z).deep;
    deepK += (deep - deepK) * Math.min(1, dt * 1.5);
    timeOfDay.setLocal({ fog: 1 + 1.3 * deepK, light: 1 - 0.35 * deepK });
    trees?.setDrawDistance?.(CONFIG.world.drawDistance * (1 - 0.45 * deepK));
    timeOfDay.update(dt);
    sunGlare.update(dt);
    skyLights.update(dt);
    air.update(dt);
    // 音：聞く人の位置と向き。家の中では外の音がこもる
    const inside = village?.insideHouse?.(cp.x, cp.z) && player.position.y > terrain.heightAt(cp.x, cp.z) + 0.25 ? 1 : 0;
    indoorK += (inside - indoorK) * Math.min(1, dt * 3);
    audio.setListener(cp.x, cp.y, cp.z, player.yaw, indoorK);
    ambience.update(dt);
    stats.update(dt);
  });

  // タイトルの後ろでも森を描いておく（背景として見せる）
  app.start();

  // 木の近く用（精細な形）は、起動後に裏で読み込む
  if (trees) startLoadingNear(app, treeModels, (name) => trees.enableNear(name));
  // 地面に混ぜる草地と落ち葉の画像も、起動後に裏で読み込む（届くまでは土の画像だけ）
  Promise.all([loadDiffuse(app.graphicsDevice, 'aerial_grass_rock', CONFIG.quality), loadDiffuse(app.graphicsDevice, 'forest_leaves_02', CONFIG.quality)])
    .then(([grass, litter]) => terrain.setGroundTextures(grass, litter));

  // 確認用（自動テストから状態を読むため）
  window.__forest = { app, player, obstacles, terrain, trees, props, wind, timeOfDay, zones, groundCover, village, skyLights, air, floors };

  // 設定（視点・性能表示）。変わるたびに反映する
  const applySettings = (st) => {
    // 視点は一人称だけ（三人称は観戦のときと、確認用の ?view=third だけ）
    player.setViewMode(CONFIG.view);
    session?.showMyBody(CONFIG.view === 'third');
    document.getElementById('stats').hidden = st.stats === 'off';
    audio.setVolume({ high: 1, mid: 0.7, low: 0.4, off: 0 }[st.sound] ?? 0.7);
  };
  const settings = createSettings(applySettings, (act) => session?.debugAction(act));

  // 音：iPad は指で触ったときにしか音を出し始められない。試合を始めるボタンで出し、
  // 裏から戻ったなどで止まっていたら、次に画面に触れたときに再び出す
  document.addEventListener('pointerdown', () => { if (playing && !audio.ready) audio.unlock(); }, true);
  titleScreen.ready(async (myChar) => {
    audio.unlock();
    input.reset();
    session = await startPracticeMatch({
      app, config: CONFIG, terrain, obstacles, player, myChar, timeOfDay, zones, buildings: village?.footprints || [],
      crateSpots: village?.crateSpots || [], tex, trees: trees?.canopies || [],
      groundAt: floors.groundAt, insideHouse: village?.insideHouse, hides: village?.hides || [],
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
