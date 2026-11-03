// 時間帯：朝・昼・夕暮れ・深夜。フェーズが進むと切り替わる（数秒かけてなめらかに）。
// 空の写真（昼）を基準に、太陽の高さ・色・強さ、空と空から回り込む光の明るさ、霧の色と濃さを変える
import * as pc from 'playcanvas';
import { makeTintedSkybox } from './sky.js';

/**
 * sky：空（背景と、空から回り込む光）の明るさの倍率
 * sun：太陽光の強さの倍率、sunColor：太陽の色（null は写真の色）、elevation：太陽の高さ（度、null は写真のまま）
 * fog：霧の色（null は写真の地平線の色）、fogDensity：霧の濃さ、exposure：画面全体の明るさ
 * tint：空の写真にかける色 [真上, 地平線]（null は写真のまま）
 */
export const TIMES = {
  morning: { name: '朝',     sky: 0.8,  sun: 0.75, sunColor: [1.0, 0.84, 0.7],  elevation: 16, fog: [0.74, 0.76, 0.78], fogDensity: 0.017, exposure: 1.0,
             tint: [[0.92, 0.93, 1.0], [1.0, 0.86, 0.76]] },
  day:     { name: '昼',     sky: 1.0,  sun: 1.0,  sunColor: null,              elevation: null, fog: null,            fogDensity: 0.013, exposure: 1.0, tint: null },
  dusk:    { name: '夕暮れ', sky: 0.6,  sun: 0.8,  sunColor: [1.0, 0.52, 0.26], elevation: 7,  fog: [0.62, 0.42, 0.34], fogDensity: 0.015, exposure: 1.05,
             tint: [[0.5, 0.42, 0.62], [1.0, 0.55, 0.3]] },
  night:   { name: '深夜',   sky: 0.14, sun: 0.3,  sunColor: [0.55, 0.66, 1.0], elevation: 48, fog: [0.06, 0.075, 0.11], fogDensity: 0.02, exposure: 1.4,
             tint: [[0.35, 0.42, 0.75], [0.4, 0.46, 0.7]] },
};

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * @param {object} base createEnvironment() の結果（昼の値）
 */
export function createTimeOfDay(app, base) {
  const scene = app.scene;
  const horiz = new pc.Vec3(base.sunDirection.x, 0, base.sunDirection.z).normalize();
  const baseElev = Math.asin(Math.max(-1, Math.min(1, base.sunDirection.y))) * pc.math.RAD_TO_DEG;

  // 時間帯を数値の組にする（なめらかに混ぜるため）
  const toState = (t) => ({
    sky: t.sky,
    sun: t.sun,
    sunColor: t.sunColor ? [...t.sunColor] : [base.sunColor.r, base.sunColor.g, base.sunColor.b],
    elevation: t.elevation ?? baseElev,
    fog: t.fog ? [...t.fog] : [base.fogColor.r, base.fogColor.g, base.fogColor.b],
    fogDensity: t.fogDensity,
    exposure: t.exposure,
  });
  let from = toState(TIMES.day), to = from, k = 1, duration = 1, current = 'day';
  const dir = new pc.Vec3(), color = new pc.Color(), fog = new pc.Color();

  function apply(s) {
    const e = s.elevation * pc.math.DEG_TO_RAD;
    dir.copy(horiz).mulScalar(Math.cos(e));
    dir.y = Math.sin(e);
    base.pointSunFrom(dir.normalize());
    base.sun.light.intensity = base.sunIntensity * s.sun;
    base.sun.light.color = color.set(s.sunColor[0], s.sunColor[1], s.sunColor[2]);
    if (base.skyboxIntensity != null) scene.skyboxIntensity = base.skyboxIntensity * s.sky;
    else scene.ambientLight = new pc.Color(...base.ambient.map((c) => c * (0.35 + 0.65 * s.sky)));
    scene.fog.color = fog.set(s.fog[0], s.fog[1], s.fog[2]);
    scene.fog.density = s.fogDensity;
    scene.exposure = s.exposure;
    base.onFogColor?.(scene.fog.color);
  }
  function mix(a, b, t) {
    return {
      sky: lerp(a.sky, b.sky, t), sun: lerp(a.sun, b.sun, t),
      sunColor: a.sunColor.map((v, i) => lerp(v, b.sunColor[i], t)),
      elevation: lerp(a.elevation, b.elevation, t),
      fog: a.fog.map((v, i) => lerp(v, b.fog[i], t)),
      fogDensity: lerp(a.fogDensity, b.fogDensity, t), exposure: lerp(a.exposure, b.exposure, t),
    };
  }
  let state = from;

  // 時間帯ごとの空の背景（色をかけたもの）。初めて使うときに作る
  const skyboxes = { day: base.daySkybox };
  const skyboxOf = (key) => {
    if (!base.skyImage || !base.daySkybox) return null;
    if (!skyboxes[key]) {
      const t = TIMES[key].tint;
      skyboxes[key] = t ? makeTintedSkybox(app, base.skyImage, t[0], t[1]) : base.daySkybox;
    }
    return skyboxes[key];
  };
  let skySwapped = true;

  function swapSky() {
    if (skySwapped) return;
    skySwapped = true;
    const cube = skyboxOf(current);
    if (cube) app.scene.skybox = cube;
  }

  return {
    get current() { return current; },
    get name() { return TIMES[current].name; },
    /** 時間帯を変える。seconds：変わるのにかける時間（0 ならすぐ） */
    set(key, seconds = 6) {
      if (!TIMES[key]) return;
      current = key;
      from = state; to = toState(TIMES[key]); k = 0; duration = Math.max(0.001, seconds);
      skySwapped = false;
      if (seconds <= 0) { k = 1; state = to; apply(state); swapSky(); }
    },
    update(dt) {
      if (k >= 1) return;
      k = Math.min(1, k + dt / duration);
      if (k >= 0.5) swapSky();   // 空の背景は、明るさが変わる途中で切り替える
      const t = k * k * (3 - 2 * k);
      state = mix(from, to, t);
      apply(state);
    },
  };
}
