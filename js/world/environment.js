// 太陽光・空・霧。色調（トーンマッピング）はカメラ側で設定する
import * as pc from 'playcanvas';
import { applySky } from './sky.js';

/** 向き dir（単位ベクトル）から光が来るように、平行光源を回す（光は自分の -Y の向きへ進む） */
function pointLightFrom(entity, dir) {
  const up = pc.Vec3.UP;
  const axis = new pc.Vec3().cross(up, dir);
  const len = axis.length();
  const angle = Math.atan2(len, up.dot(dir)) * pc.math.RAD_TO_DEG;
  const q = new pc.Quat();
  if (len < 1e-6) q.set(0, 0, 0, 1);
  else q.setFromAxisAngle(axis.mulScalar(1 / len), angle);
  entity.setRotation(q);
}

/**
 * @param {object|null} sky loadSky() の結果。null のときは単色の空と環境光で描く
 */
export function createEnvironment(app, config, sky) {
  const a = config.atmosphere;
  const q = config.quality;
  const scene = app.scene;
  scene.exposure = a.exposure;

  // 太陽（影を落とす光）
  const sun = new pc.Entity('Sun');
  sun.addComponent('light', {
    type: 'directional',
    color: new pc.Color(...a.sunColor),
    intensity: a.sunIntensity,
    castShadows: true,
    shadowType: pc.SHADOW_PCF3_32F,
    shadowResolution: q.shadowResolution,
    shadowDistance: q.shadowDistance,   // 影はカメラの手前だけ（遠くは霧で見えない）
    numCascades: 1,
    shadowBias: 0.05,
    normalOffsetBias: 0.04,
  });
  app.root.addChild(sun);

  let fogColor;
  if (sky) {
    // 空の写真から：背景の空・空全体から回り込む光・霧の色。太陽の向きも写真の太陽に合わせる
    const result = applySky(app, sky, config);
    pointLightFrom(sun, result.sunDirection);
    sun.light.intensity = result.sunIntensity;
    sun.light.color = result.sunColor;
    fogColor = result.fogColor;
  } else {
    // 空が読み込めなかったとき：単色の環境光と、空側からの弱い補助光
    sun.setEulerAngles(...a.sunEuler);
    scene.ambientLight = new pc.Color(...a.ambient);
    const skyFill = new pc.Entity('SkyFill');
    skyFill.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.55, 0.65, 0.75),
      intensity: 0.22,
      castShadows: false,
    });
    skyFill.setEulerAngles(-35, 200, 0);
    app.root.addChild(skyFill);
    fogColor = new pc.Color(...a.fogColor);
  }

  // 霧：遠くほど空気の色に溶ける。遠くの物を描かずに済ませる役目もある
  scene.fog.type = pc.FOG_EXP2;
  scene.fog.color = fogColor;
  scene.fog.density = a.fogDensity;

  return { sun, fogColor };
}
