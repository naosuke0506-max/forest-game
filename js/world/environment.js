// 太陽光・空の明るさ・霧。色調（トーンマッピング）はカメラ側で設定する
import * as pc from 'playcanvas';

export function createEnvironment(app, config) {
  const a = config.atmosphere;
  const q = config.quality;
  const scene = app.scene;

  // 霧：遠くほど空気の色に溶ける。遠くの物を描かずに済ませる役目もある
  scene.fog.type = pc.FOG_EXP2;
  scene.fog.color = new pc.Color(...a.fogColor);
  scene.fog.density = a.fogDensity;

  // 空から回り込む光（影の中が真っ黒にならないように）
  scene.ambientLight = new pc.Color(...a.ambient);
  scene.exposure = a.exposure;

  // 太陽
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
  sun.setEulerAngles(...a.sunEuler);
  app.root.addChild(sun);

  // 空側からの弱い補助光（影は落とさない）：日なたと日陰の差を自然にする
  const skyFill = new pc.Entity('SkyFill');
  skyFill.addComponent('light', {
    type: 'directional',
    color: new pc.Color(0.55, 0.65, 0.75),
    intensity: 0.22,
    castShadows: false,
  });
  skyFill.setEulerAngles(-35, 200, 0);
  app.root.addChild(skyFill);

  return { sun, fogColor: new pc.Color(...a.fogColor) };
}
