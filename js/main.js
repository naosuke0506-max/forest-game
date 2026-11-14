// 起動の順番だけを書く。中身は機能ごとのファイルにある
import { CONFIG } from './config.js';
import { createApp } from './core/app.js';
import { createTerrain } from './world/terrain.js';
import { createEnvironment } from './world/environment.js';
import { createTimeOfDay } from './world/time-of-day.js';
import { createLandform } from './world/landform.js';
import { planVillages } from './world/villages.js';
import { createCave } from './world/cave.js';
import { createWater } from './world/water.js';
import { createVillage } from './world/castle.js';
import { createFloors } from './world/floors.js';
import { createZones } from './world/zones.js';
import { loadGroundCover, createGroundCover } from './world/ground-cover.js';
import { createSunGlare } from './render/sun-glare.js';
import { createSkyLights } from './render/sky-lights.js';
import { createAirParticles } from './render/air-particles.js';
import { audio, loadSounds } from './audio/engine.js';
import { createAmbience } from './audio/ambience.js';
import { AREA_RADIUS } from './game/data.js';
import { createObstacles } from './world/obstacles.js';
import { createSight } from './game/sight.js';
import { createTrees, createGrass } from './world/vegetation.js';
import { createRocks } from './world/rocks.js';
import { createWind } from './world/wind.js';
import { loadTextureSets, loadDiffuse } from './world/materials.js';
import { loadSky } from './world/sky.js';
import { loadTreeModels, startLoadingNear, createModelTrees } from './world/trees.js';
import { loadProps, createProps } from './world/props.js';
import { createPlayer } from './player/controller.js';
import { createInput } from './input/input.js';
import { createStats } from './ui/screens.js';
import { createLobby } from './ui/lobby.js';
import { createHall } from './render/hall.js';
import { createTitleScene } from './render/title-scene.js';
import { createMusic } from './audio/music.js';
import { playTimeStart, TIME_START_PEAK } from './audio/ui-sounds.js';
import { createSettings, loadSettings } from './ui/settings.js';
import { ICONS } from './ui/icons.js';
import { startPracticeMatch } from './match-session.js';
import { BUILD } from './version.js';
import { refreshIfStale } from './core/freshness.js';

// <head> の仕組みが拾ったエラーのうち、画面ができる前のものをここで表示する
(window.__pendingErrors || []).forEach((m) => window.__showError(m));

// 題の画面と大廳（大廳の 3D の広間は、森を組み立てた後に作る。それまでは押されない）
//   最初に画面に触れたら音を出せるようにして題の曲を流し、「入」で「時が動き出す音」を鳴らして大廳へ（大廳の曲に替える）
let hall = null, titleScene = null, applyWorld = null, debugRef = null;
const music = createMusic(BUILD, loadSettings().titleBgm);
window.__music = music;   // 確認用（自動テストから題の曲の拍を読むため）
// 設定（性能表示・音の大きさ・題曲の版・試験用）：題の画面からも開けるよう、森を読み込む前に作る。
// 森に関わる分（視点）は、森ができてから applyWorld で反映する
const settings = createSettings((st) => {
  document.getElementById('stats').hidden = st.stats === 'off';
  audio.setVolume({ high: 1, mid: 0.7, low: 0.4, off: 0 }[st.sound] ?? 0.7);
  music.setTitleVersion(st.titleBgm);   // 題の曲が流れていれば、すぐその版に替わる
  applyWorld?.(st);
}, (act) => debugRef?.(act));
const titleScreen = createLobby({
  onGate: () => { music.unlock(); music.play('title', { fade: 3 }); },
  onEnter: () => {
    music.unlock();
    // 「時が動き出す音」を聞かせるため、題の曲はすぐ下げ、大廳の曲は弾けた後から上げる
    playTimeStart();
    music.play('hall', { fade: 2.4, out: 0.45, delay: TIME_START_PEAK + 0.25 });
  },
  onHall: () => {   // 「入」の後、画面が暗くなったところで大廳に切り替える
    titleScene?.setActive(false);
    hall?.setActive(true, window.__forest?.player.camera);
  },
  onShow: (char, loadout) => { hall?.show(char, loadout).catch((err) => console.warn('大廳の人物:', err)); },
  onSettings: () => settings.open(),
  hall: () => hall,
});

async function boot() {
  const canvas = document.getElementById('app');
  const { app } = await createApp(canvas, CONFIG.quality);
  // 題の画面の背景（時の輪）：森を読み込む間も動かして見せる（先に描き始める）
  titleScene = createTitleScene(app, CONFIG);
  titleScene.setActive(true);
  titleScene.setBeatSource(() => music.titleBeat);   // 時の輪の針を、題の曲の時計の刻みに合わせる
  document.body.classList.add('in-hall');
  app.on('update', (dt) => titleScene.update(dt));
  app.start();

  // 実写の質感画像（地面・樹皮・岩）と空を、並行して読み込む
  const [tex, sky, treeModels, propTypes, grassTex] = await Promise.all([
    loadTextureSets(app.graphicsDevice, CONFIG.quality, (done, total) => titleScreen.progress(done, total)),
    loadSky(),
    loadTreeModels(app, CONFIG.quality),
    loadProps(app, CONFIG.quality),
    loadGroundCover(app, CONFIG.quality),
  ]);

  // 世界を組み立てる（置く順番が大事：木 → 岩 → 草。草は木や岩を避けて生える）
  // 地形の形（周りの山・川と谷・盆地の丘。world/landform.js）と、エリア分け（森・北西の深い森・東の大草原・南西の村・道）
  const land = createLandform(CONFIG.seed, { playRadius: CONFIG.world.playRadius, size: CONFIG.world.terrainSize });
  // 村 3 つ・道・橋の配置（world/villages.js）。家の下を平らにするので、地面より先に決める
  const plan = planVillages(CONFIG.seed, land, { size: CONFIG.world.terrainSize, playRadius: CONFIG.world.playRadius });
  const zones = createZones(CONFIG.seed, CONFIG.world.playRadius, land, plan);
  const terrain = createTerrain(app, CONFIG, CONFIG.seed, tex.ground, zones, land, plan);
  // 川の水面と滝（world/water.js）
  const water = createWater(app, land, terrain);
  const env = createEnvironment(app, CONFIG, sky);
  const wind = createWind(app, CONFIG);
  const obstacles = createObstacles();
  // 外周の柵は無くした（2026-11-14。利用者の指示：周りの山が端になる。通れない仕組みは今までどおりの見えない円）
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
  // 視線をさえぎる物（bot の目。game/sight.js）：家・柵・木の幹・岩など。大草原の背の高い草も、低い所の視線をさえぎる
  const sight = createSight(terrain.heightAt, {
    grassAt: zones ? (x, z) => { const p = zones.weights(x, z).prairie; return p > 0.35 ? 1.25 * Math.min(1, p) : 0; } : null,
  });
  for (const t of trees?.trunks || []) sight.addCyl(t.x, t.z, t.r, terrain.heightAt(t.x, t.z) - 0.3, t.top);
  for (const b of props?.blockers || []) sight.addCyl(b.x, b.z, b.r, b.y0, b.y1);
  const village = createVillage(app, CONFIG, terrain, obstacles, zones, floors, sight, plan);
  // 洞窟（風穴。北西の深い森の岩山。world/cave.js）：壁と天井・床・口の岩の縁。岩山の上の床と、中の壁の当たり判定も登録する
  const cave = createCave(app, land, { obstacles, floors, sight, rockTex: tex.rock, seed: CONFIG.seed });
  // 地面を覆う草（自分の周りだけ。短い草・穂・白い花・大草原の背の高い草）
  const groundCover = grassTex ? createGroundCover(app, CONFIG, CONFIG.seed, terrain, obstacles, grassTex, zones) : null;

  const player = createPlayer(app, CONFIG, terrain, obstacles, env.fogColor);
  player.setGround(floors.groundAt);
  player.water = terrain.waterAt;   // 川の中を歩く・泳ぐ（game/swim.js）
  // 時間帯（朝・昼・夕暮れ・深夜）。霧の色が変わったら、空の無い所の背景色も合わせる
  env.onFogColor = (c) => { player.camera.camera.clearColor = c; };
  const timeOfDay = createTimeOfDay(app, env, CONFIG, player.camera);
  const sunGlare = createSunGlare(player.camera, env.sun, timeOfDay, {
    canopies: trees?.canopies || [], trunks: trees?.trunks || [],
    heightAt: terrain.heightAt,
  });
  // 太陽と月の円盤・木漏れ日の光の筋、空気の中の塵・舞い落ちる葉・蛍
  const skyLights = createSkyLights(app, player.camera, env.sun, timeOfDay, {
    canopies: trees?.canopies || [], heightAt: terrain.heightAt, zones, farClip: CONFIG.atmosphere.farClip,
  });
  const air = createAirParticles(app, player.camera, timeOfDay, { heightAt: terrain.heightAt, zones, sun: env.sun });
  // 環境音（風・葉・鳥・虫・カラス）。音は試合を始めるボタンを押したときから出る（iPad の決まり）。
  // 録音の音のファイルは、今のうちに裏で取りに行く
  loadSounds();
  const ambience = createAmbience({ timeOfDay, wind, zones, land, fall: water.fall });
  let indoorK = 0;
  const touchLayer = document.getElementById('touch-layer');
  const input = createInput(touchLayer, document.getElementById('stick'), CONFIG);
  const stats = createStats(app, CONFIG.showStats, CONFIG.qualityName);
  // 大廳（試合の前）：松明の灯る石の広間。題の画面の後ろから出し、試合が始まると片付けて森のカメラに戻す
  hall = createHall(app, CONFIG);
  hall.setActive(false);
  player.camera.enabled = false;   // 題の画面・大廳の間は、森のカメラで描かない

  let playing = false, session = null, deepK = 0, caveK = 0;
  app.on('update', (dt) => {
    // 題の画面・大廳にいる間は、その 3D だけを動かす（森は描かず、動かさない。森の音も止める）
    const lobbyOn = hall.active || titleScene.active || !playing;
    ambience.setMuted?.(lobbyOn);
    if (lobbyOn) { hall.update(dt); stats.update(dt); return; }
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
    // 洞窟の中は暗い（奥ほど暗いのは洞窟の頂点の色。ここは光を弱くする。岩山の上にいるときは外）
    const inCave = land.cave.inside(cp.x, cp.z, cp.y);
    caveK += (inCave - caveK) * Math.min(1, dt * 2);
    // 洞窟の中は霧も薄くする（霧の色は明るいので、奥が明るく光って見えてしまう）
    timeOfDay.setLocal({ fog: (1 + 1.3 * deepK) * (1 - 0.85 * caveK), light: (1 - 0.35 * deepK) * (1 - 0.5 * caveK) });
    trees?.setDrawDistance?.(CONFIG.world.drawDistance * (1 - 0.45 * deepK));
    timeOfDay.update(dt);
    sunGlare.update(dt);
    skyLights.update(dt);
    water.update(dt);   // 川のさざ波・滝の筋を流す
    air.update(dt);
    // 音：聞く人の位置と向き。家の中では外の音がこもる
    const inside = Math.max(village?.insideHouse?.(cp.x, cp.z) && player.position.y > terrain.heightAt(cp.x, cp.z) + 0.25 ? 1 : 0, caveK);   // 家の中・洞窟の中は外の音がこもる
    indoorK += (inside - indoorK) * Math.min(1, dt * 3);
    audio.setListener(cp.x, cp.y, cp.z, player.yaw, indoorK);
    ambience.update(dt);
    stats.update(dt);
  });

  // （描き始めは、題の画面の背景を作った直後。上の boot の始め）

  // 木の近く用（精細な形）は、起動後に裏で読み込む
  if (trees) startLoadingNear(app, treeModels, (name) => trees.enableNear(name));
  // 地面に混ぜる草地と落ち葉の画像も、起動後に裏で読み込む（届くまでは土の画像だけ）
  Promise.all([loadDiffuse(app.graphicsDevice, 'aerial_grass_rock', CONFIG.quality), loadDiffuse(app.graphicsDevice, 'forest_leaves_02', CONFIG.quality)])
    .then(([grass, litter]) => terrain.setGroundTextures(grass, litter));

  // 確認用（自動テストから状態を読むため）
  window.__forest = { app, player, obstacles, terrain, trees, props, wind, timeOfDay, zones, groundCover, village, skyLights, air, floors, sight, land, water, plan, cave };

  // 設定のうち森に関わる分（視点）。変わるたびに反映する
  applyWorld = (st = settings) => {
    // 視點：一人称か三人称（利用者の指示 2026-11-13。設定・左上の目のボタン・PC の V で切り替える。?view=third でも三人称）
    const view = CONFIG.view === 'third' || st.view === 'third' ? 'third' : 'first';
    player.setViewMode(view);
    session?.showMyBody(view === 'third');
  };
  // 左上の目のボタン・V キー：一人称 ↔ 三人称
  const toggleView = () => { settings.view = settings.view === 'third' ? 'first' : 'third'; settings.save?.(); applyWorld(settings); };
  const viewBtn = document.getElementById('view-btn');
  viewBtn.innerHTML = ICONS.eye;
  viewBtn.addEventListener('click', toggleView);
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyV' && !e.repeat && session) toggleView(); });
  applyWorld(settings);
  debugRef = (act) => session?.debugAction(act);

  // 音：iPad は指で触ったときにしか音を出し始められない。試合を始めるボタンで出し、
  // 裏から戻ったなどで止まっていたら、次に画面に触れたときに再び出す
  // （iPad の Safari は指を離したとき＝click でしか許さないので click で受ける。曲が断られていたら、ここで流し直す）
  document.addEventListener('click', () => { if (!audio.ready) audio.unlock(); music.unlock(); }, true);
  titleScreen.ready(async (myChar, loadout) => {
    audio.unlock();
    input.reset();
    session = await startPracticeMatch({
      app, config: CONFIG, terrain, obstacles, player, myChar, loadout, timeOfDay, zones, buildings: [...(village?.footprints || []), ...(cave?.footprints || [])],
      trees: trees?.canopies || [],
      groundAt: floors.groundAt, insideHouse: village?.insideHouse, hides: village?.hides || [], covers: village?.covers || [], furniture: village?.furniture || null, sight,
      houses: village?.houses || [],   // 家の一覧（鷹目の貫く矢で壁に穴を開ける。world/arrow-holes.js）
      debug: CONFIG.debug,
      tutorial: loadout?.tutorial || null,   // 教練（大廳の「教練」から。game/tutorial.js）
      // フェーズの長さ：URL の ?phase= があればそれ、無ければ設定画面の「テスト用」。教練では時間で刻が進まない
      phaseDuration: loadout?.tutorial ? 1e6 : CONFIG.phaseDuration ?? (settings.phaseLen === 'normal' ? null : Number(settings.phaseLen)),
    });
    // 大廳を片付けて、森のカメラに戻す
    hall.setActive(false, player.camera);
    hall.clear();
    music.stopAll({ fade: 2.5 });
    document.body.classList.remove('in-hall');
    touchLayer.hidden = false;
    document.getElementById('hud').hidden = false;
    window.__forest.session = session;
    applyWorld(settings);
    playing = true;
  });
}

// 古いファイルが混ざっていたら、取り直して読み込み直す（そのときは起動しない）
if (!(await refreshIfStale(BUILD))) boot().catch((err) => {
  console.error(err);
  titleScreen.fail(`起動エラー: ${err && err.message ? err.message : err}`);
});
