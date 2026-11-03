// 時間帯：朝・昼・夕暮れ・深夜。フェーズが進むと切り替わる（数秒かけてなめらかに）。
// 時間帯ごとに、実際にその時刻に撮った空の写真（Poly Haven, CC0。出典は assets/sky/CREDITS.md）を使う。
// 写真ごとに明るさがばらばらなので、「昼の何割の明るさにするか（level）」でそろえる
import * as pc from 'playcanvas';
import { loadSky, prepareSky, toSrgbColor } from './sky.js';

/**
 * sky：空の写真の名前（assets/sky/<名前>_*）
 * level：空と、空から回り込む光の明るさ（昼の写真の明るさを 1 とした割合）
 * sun：太陽（深夜は月）の光の強さ（昼の写真の太陽を 1 とした割合）
 * sunWhite：太陽の色を白に寄せる割合（朝焼け・夕焼けの写真の太陽は赤すぎるため）
 * minElevation：太陽の高さの下限（度）。地平線すれすれだと地面がほぼ照らされないため
 * fogDensity：霧の濃さ、fogMax：霧の色の明るさの上限（朝焼け・夕焼けの地平線は明るすぎて、霧が白く飛ぶため）
 * exposure：画面全体の明るさ
 */
export const TIMES = {
  morning: { name: '朝',     sky: 'qwantani_sunrise', level: 0.55, sun: 0.6,  sunWhite: 0.45, minElevation: 12, fogDensity: 0.014, fogMax: 0.42, exposure: 1.0 },
  day:     { name: '昼',     sky: 'kloofendal_48d',   level: 1.05, sun: 1.6,  sunWhite: 0,    minElevation: 0,  fogDensity: 0.012, fogMax: 1,    exposure: 1.08 },
  dusk:    { name: '夕暮れ', sky: 'belfast_sunset',   level: 0.4,  sun: 0.65, sunWhite: 0.15, minElevation: 7,  fogDensity: 0.014, fogMax: 0.36, exposure: 1.05 },
  night:   { name: '深夜',   sky: 'kloppenheim_02',   level: 0.06, sun: 0.22, sunWhite: 0,    minElevation: 25, fogDensity: 0.02,  fogMax: 1,    exposure: 1.5 },
};

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * @param {object} base createEnvironment() の結果（昼の値。空の写真が読めなかったときは daySky が null）
 * @param {object} config CONFIG（空の明るさの倍率など）
 */
export function createTimeOfDay(app, base, config) {
  const scene = app.scene;
  const atm = config.atmosphere;
  const skies = {};                      // 名前 → prepareSky() の結果
  if (base.daySky) skies[base.daySky.name] = base.daySky;
  const dayIrr = base.daySky?.irradiance ?? 1;

  // 昼以外の空は、起動の後に裏で読み込む（読めなければ昼の空の明るさを変えて代わりにする）
  const pending = {};
  function ensureSky(name) {
    if (skies[name] || pending[name] || !base.daySky) return;
    pending[name] = loadSky(name).then((sky) => { if (sky) skies[name] = prepareSky(app, sky); });
  }
  for (const t of Object.values(TIMES)) ensureSky(t.sky);

  /** 時間帯を、混ぜられる数値の組にする */
  function toState(key) {
    const t = TIMES[key];
    const sky = skies[t.sky] || base.daySky;
    const n = sky ? (t.level * dayIrr) / sky.irradiance : t.level;   // この写真にかける明るさの倍率
    const sunCol = sky ? sky.meta.sunColor : [base.sunColor.r, base.sunColor.g, base.sunColor.b];
    const dir = (sky ? sky.sunDirection : base.sunDirection).clone();
    const minE = Math.sin(t.minElevation * pc.math.DEG_TO_RAD);
    if (dir.y < minE) {   // 低すぎる太陽を少し持ち上げる（向きはそのまま）
      const h = Math.sqrt(1 - minE * minE);
      const len = Math.hypot(dir.x, dir.z) || 1;
      dir.set((dir.x / len) * h, minE, (dir.z / len) * h);
    }
    let fogLin = sky ? sky.meta.horizonLinear.map((c) => c * n * atm.fogTint) : null;
    if (fogLin) {
      const m = Math.max(...fogLin);
      if (m > t.fogMax) fogLin = fogLin.map((c) => (c * t.fogMax) / m);   // 色合いはそのまま、明るさだけ抑える
    }
    const fog = fogLin ? toSrgbColor(fogLin) : base.fogColor;
    return {
      sky, level: t.level, n,
      sun: t.sun * base.sunIntensity,
      sunColor: sunCol.map((c) => lerp(c, 1, t.sunWhite)),
      dir: [dir.x, dir.y, dir.z],
      fog: [fog.r, fog.g, fog.b],
      fogDensity: t.fogDensity,
      exposure: t.exposure,
    };
  }

  let current = 'day', from = null, to = null, k = 1, duration = 1, shownSky = base.daySky;
  const dir = new pc.Vec3(), color = new pc.Color(), fog = new pc.Color();

  function apply(s, sky) {
    // 背景と、空から回り込む光：今出している写真に、その写真用の倍率をかける
    if (sky) {
      if (scene.skybox !== sky.skybox) { scene.skybox = sky.skybox; scene.envAtlas = sky.envAtlas; }
      scene.skyboxIntensity = sky.meta.skyScale * atm.skyBrightness * (s.level * dayIrr) / sky.irradiance;
    } else {
      scene.ambientLight = new pc.Color(...base.ambient.map((c) => c * (0.3 + 0.7 * Math.min(1, s.level))));
    }
    base.pointSunFrom(dir.set(s.dir[0], s.dir[1], s.dir[2]).normalize());
    base.sun.light.intensity = s.sun;
    base.sun.light.color = color.set(s.sunColor[0], s.sunColor[1], s.sunColor[2]);
    scene.fog.color = fog.set(s.fog[0], s.fog[1], s.fog[2]);
    scene.fog.density = s.fogDensity;
    scene.exposure = s.exposure;
    base.onFogColor?.(scene.fog.color);
  }
  const mix = (a, b, t) => ({
    level: lerp(a.level, b.level, t),
    sun: lerp(a.sun, b.sun, t),
    sunColor: a.sunColor.map((v, i) => lerp(v, b.sunColor[i], t)),
    dir: a.dir.map((v, i) => lerp(v, b.dir[i], t)),
    fog: a.fog.map((v, i) => lerp(v, b.fog[i], t)),
    fogDensity: lerp(a.fogDensity, b.fogDensity, t),
    exposure: lerp(a.exposure, b.exposure, t),
  });

  return {
    get current() { return current; },
    get name() { return TIMES[current].name; },
    /** 時間帯を変える。seconds：変わるのにかける時間（0 ならすぐ） */
    set(key, seconds = 6) {
      if (!TIMES[key]) return;
      from = to ? mix(from || to, to, k * k * (3 - 2 * k)) : toState(current);
      current = key;
      to = toState(key);
      k = 0;
      duration = Math.max(0.001, seconds);
      if (seconds <= 0) { k = 1; shownSky = to.sky; apply(to, shownSky); }
    },
    update(dt) {
      if (!to || k >= 1) return;
      k = Math.min(1, k + dt / duration);
      // 空の写真は、明るさが変わる途中で入れ替える（昼 ↔ 夜のように明るさが大きく違っても目立たない）
      if (k >= 0.5) shownSky = to.sky;
      const t = k * k * (3 - 2 * k);
      apply(mix(from, to, t), shownSky);
    },
  };
}
