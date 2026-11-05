// 時間帯：朝・昼・夕暮れ・深夜。フェーズが進むと切り替わる（数秒かけてなめらかに）。
// 時間帯ごとに、実際にその時刻に撮った空の写真（Poly Haven, CC0。出典は assets/sky/CREDITS.md）を使う。
// 写真ごとに明るさがばらばらなので、「昼の何割の明るさにするか（level）」でそろえる
import * as pc from 'playcanvas';
import { loadSky, prepareSky, toSrgbColor } from './sky.js';

/**
 * sky：空の写真の名前（assets/sky/<名前>_*）
 * level：空と、空から回り込む光の明るさ（昼の写真の明るさを 1 とした割合）
 * sun：太陽（深夜は月）の光の強さ（昼の写真の太陽を 1 とした割合）
 * sunWhite：太陽の色を白に寄せる割合（朝焼け・夕焼けの写真の太陽は赤すぎるため）、sunColor：太陽の色を直接決める（昼）
 * glare・glareColor：太陽（夜は月）を見たときのまぶしさの強さと色（render/sun-glare.js）
 * minElevation：太陽の高さの下限（度）。地平線すれすれだと地面がほぼ照らされないため
 * fogDensity：霧の濃さ、fogMax：霧の色の明るさの上限（朝焼け・夕焼けの地平線は明るすぎて、霧が白く飛ぶため）
 * exposure：画面全体の明るさ
 * fx：雰囲気の飾りの強さ（0〜1。render/sky-lights.js と render/air-particles.js が使う）
 *   sun：太陽の円盤、moon：月の円盤、shafts：木漏れ日の光の筋、dust：光に舞う塵、leaves：舞い落ちる葉、fireflies：蛍
 *   birds：鳥のさえずり（朝だけ）、insects：夜の虫の声（夜だけ）、crows：カラス（昼・夕暮れ・夜）（audio/ambience.js）
 */
export const TIMES = {
  morning: { name: '黎明',   sky: 'qwantani_sunrise', level: 0.55, sun: 0.6,  sunWhite: 0.45, minElevation: 12, fogDensity: 0.014, fogMax: 0.42, exposure: 1.0,
             glare: 0.6,  glareColor: [1.0, 0.86, 0.7],
             fx: { sun: 1, moon: 0, shafts: 1, dust: 1, leaves: 0.8, fireflies: 0, birds: 1, insects: 0, crows: 0 } },
  day:     { name: '白晝',   sky: 'kloofendal_48d',   level: 1.05, sun: 1.6,  sunColor: [1.0, 0.96, 0.88], minElevation: 0, fogDensity: 0.012, fogMax: 1, exposure: 1.08,
             glare: 1.0,  glareColor: [1.0, 0.98, 0.92],
             fx: { sun: 1, moon: 0, shafts: 0.6, dust: 0.7, leaves: 1, fireflies: 0, birds: 0, insects: 0, crows: 0.8 } },
  dusk:    { name: '黃昏',   sky: 'kloppenheim_06',   level: 0.09, sun: 0.8,  sunWhite: 0.1,  minElevation: 7,  fogDensity: 0.015, fogMax: 0.22, exposure: 1.1,
             glare: 0.8,  glareColor: [1.0, 0.58, 0.28],
             fx: { sun: 1, moon: 0, shafts: 1, dust: 0.9, leaves: 0.8, fireflies: 0.35, birds: 0, insects: 0, crows: 1 } },
  night:   { name: '丑三',   sky: 'kloppenheim_02',   level: 0.06, sun: 0.22, sunWhite: 0,    minElevation: 25, fogDensity: 0.02,  fogMax: 1,    exposure: 1.5,
             glare: 0,    glareColor: [0.7, 0.8, 1.0],   // 月はまぶしくしない
             fx: { sun: 0, moon: 1, shafts: 0, dust: 0, leaves: 0.3, fireflies: 1, birds: 0, insects: 1, crows: 0.6 } },
};

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * @param {object} base createEnvironment() の結果（昼の値。空の写真が読めなかったときは daySky が null）
 * @param {object} config CONFIG（空の明るさの倍率など）
 * @param {pc.Entity} camera カメラ（空のドームをカメラに付いて行かせる）
 */
export function createTimeOfDay(app, base, config, camera = null) {
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
    const photoDir = [dir.x, dir.y, dir.z];   // 写真の中の太陽（月）の向き（円盤はここに描く。光の向きは低すぎれば持ち上げる）
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
      sunColor: t.sunColor ? [...t.sunColor] : sunCol.map((c) => lerp(c, 1, t.sunWhite ?? 0)),
      glare: t.glare, glareColor: [...t.glareColor],
      dir: [dir.x, dir.y, dir.z],
      photoDir,
      fog: [fog.r, fog.g, fog.b],
      fogDensity: t.fogDensity,
      exposure: t.exposure,
      fx: { ...t.fx },
    };
  }

  let current = 'day', from = null, to = null, k = 1, duration = 1, lastState = null;
  const local = { fog: 1, light: 1 };   // 場所による補正（深い森：霧が濃く、空からの光が弱い）
  let bgSky = base.daySky;      // 背景（skybox）に出している空
  let lightSky = base.daySky;   // 空から回り込む光（envAtlas）に使っている空
  const glare = { strength: TIMES.day.glare, color: [...TIMES.day.glareColor] };
  const fx = { ...TIMES.day.fx };   // 雰囲気の飾りの強さ（時間帯が変わるときは混ぜる）
  const skyDir = base.sunDirection.clone();   // 写真の中の太陽（月）の向き
  const dir = new pc.Vec3(), color = new pc.Color(), fog = new pc.Color();
  const intensityOf = (sky, level) => sky.meta.skyScale * atm.skyBrightness * (level * dayIrr) / sky.irradiance;

  // 空のドーム：時間帯が変わるとき、次の空を大きな球の内側に描き、だんだん濃くして今の空に重ねる。
  // 背景の空（skybox）は 1 枚しか出せないので、重ねきってから入れ替える（急にガラッと変わらないように）
  const domeMat = new pc.StandardMaterial();
  domeMat.useLighting = false;
  domeMat.useFog = false;
  domeMat.useSkybox = false;
  domeMat.diffuse = new pc.Color(0, 0, 0);
  domeMat.emissive = new pc.Color(1, 1, 1);
  domeMat.blendType = pc.BLEND_NORMAL;
  domeMat.depthWrite = false;
  domeMat.cull = pc.CULLFACE_FRONT;     // 球の内側から見る
  domeMat.update();
  const dome = new pc.Entity('sky-dome');
  dome.addComponent('render', {
    meshInstances: [new pc.MeshInstance(pc.Mesh.fromGeometry(app.graphicsDevice, new pc.SphereGeometry({ radius: 1, latitudeBands: 32, longitudeBands: 64 })), domeMat)],
    castShadows: false, receiveShadows: false,
  });
  const domeR = (config.atmosphere.farClip || 160) * 0.9;
  dome.setLocalScale(-domeR, domeR, domeR);   // 左右を反転して、背景の空と同じ向きにそろえる（画面で確かめた）
  dome.enabled = false;
  app.root.addChild(dome);
  let domeSky = null, domeTex = null;
  function startDome(sky) {
    domeTex?.destroy();
    domeTex = new pc.Texture(app.graphicsDevice, {
      name: 'sky-dome', width: sky.image.width, height: sky.image.height,
      format: pc.PIXELFORMAT_RGBA8, srgb: true, mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    });
    domeTex.setSource(sky.image);
    domeMat.emissiveMap = domeTex;
    domeMat.update();
    domeSky = sky;
    dome.enabled = true;
  }
  function endDome() {
    dome.enabled = false;
    domeSky = null;
    domeMat.emissiveMap = null;
    domeTex?.destroy();
    domeTex = null;
  }

  function apply(s, fade = 0) {
    // 背景の空と、空から回り込む光：写真ごとの倍率をかける
    if (bgSky) {
      if (scene.skybox !== bgSky.skybox) scene.skybox = bgSky.skybox;
      if (scene.envAtlas !== lightSky.envAtlas) scene.envAtlas = lightSky.envAtlas;
      scene.skyboxIntensity = intensityOf(bgSky, s.level) * local.light;
      if (domeSky) {
        domeMat.emissiveIntensity = intensityOf(domeSky, s.level);
        domeMat.opacity = fade;
        domeMat.update();
        if (camera) dome.setPosition(camera.getPosition());
      }
    } else {
      scene.ambientLight = new pc.Color(...base.ambient.map((c) => c * (0.3 + 0.7 * Math.min(1, s.level))));
    }
    base.pointSunFrom(dir.set(s.dir[0], s.dir[1], s.dir[2]).normalize());
    base.sun.light.intensity = s.sun;
    base.sun.light.color = color.set(s.sunColor[0], s.sunColor[1], s.sunColor[2]);
    scene.fog.color = fog.set(s.fog[0], s.fog[1], s.fog[2]);
    scene.fog.density = s.fogDensity * local.fog;
    scene.exposure = s.exposure;
    lastState = s;
    glare.strength = s.glare;
    glare.color = s.glareColor;
    Object.assign(fx, s.fx);
    skyDir.set(s.photoDir[0], s.photoDir[1], s.photoDir[2]).normalize();
    base.onFogColor?.(scene.fog.color);
  }
  const mix = (a, b, t) => ({
    level: lerp(a.level, b.level, t),
    sun: lerp(a.sun, b.sun, t),
    sunColor: a.sunColor.map((v, i) => lerp(v, b.sunColor[i], t)),
    dir: a.dir.map((v, i) => lerp(v, b.dir[i], t)),
    photoDir: a.photoDir.map((v, i) => lerp(v, b.photoDir[i], t)),
    fog: a.fog.map((v, i) => lerp(v, b.fog[i], t)),
    fogDensity: lerp(a.fogDensity, b.fogDensity, t),
    exposure: lerp(a.exposure, b.exposure, t),
    glare: lerp(a.glare, b.glare, t),
    glareColor: a.glareColor.map((v, i) => lerp(v, b.glareColor[i], t)),
    fx: Object.fromEntries(Object.keys(a.fx).map((k) => [k, lerp(a.fx[k], b.fx[k], t)])),
  });

  return {
    get current() { return current; },
    get name() { return TIMES[current].name; },
    /** 今出している空の写真の名前（確認用） */
    get skyName() { return bgSky?.name ?? null; },
    get loadedSkies() { return Object.keys(skies); },
    /** 太陽（夜は月）を見たときのまぶしさ { strength, color } */
    glare,
    /** 雰囲気の飾りの強さ { sun, moon, shafts, dust, leaves, fireflies }（0〜1） */
    fx,
    /** 写真の中の太陽（深夜は月）の向き（単位ベクトル）。太陽・月の円盤を描く向き */
    skyDir,
    /** 時間帯を変える。seconds：変わるのにかける時間（0 ならすぐ） */
    set(key, seconds = 6) {
      if (!TIMES[key]) return;
      // 変わっている途中なら、今の見た目から始める（途中の空は重ねきった扱いにする）
      if (to && k < 1) { from = mix(from, to, k * k * (3 - 2 * k)); if (domeSky) { bgSky = lightSky = domeSky; } endDome(); }
      else from = to || toState(current);
      current = key;
      to = toState(key);
      k = 0;
      duration = Math.max(0.001, seconds);
      if (to.sky && to.sky !== bgSky && to.sky.image && seconds > 0) startDome(to.sky);
      if (seconds <= 0) { k = 1; bgSky = lightSky = to.sky || bgSky; endDome(); apply(to); }
    },
    /** 場所による補正（毎フレーム呼んでよい）。fog：霧の濃さの倍率、light：空と空から回り込む光の倍率 */
    setLocal({ fog = 1, light = 1 }) {
      if (Math.abs(fog - local.fog) < 0.002 && Math.abs(light - local.light) < 0.002) return;
      local.fog = fog; local.light = light;
      if (lastState && (!to || k >= 1)) apply(lastState);
    },
    /** 移り変わりの途中の、ある割合の所へ飛ぶ（確認用） */
    seek(p) { if (to) { k = Math.min(0.999999, Math.max(0, p)); this.update(0); } },
    update(dt) {
      if (!to || k >= 1) return;
      k = Math.min(1, k + dt / duration);
      const t = k * k * (3 - 2 * k);
      // 空から回り込む光は途中で入れ替える。背景の空は、ドームで重ねきってから入れ替える
      if (k >= 0.5 && to.sky) lightSky = to.sky;
      if (k >= 1) { if (to.sky) bgSky = to.sky; endDome(); }
      apply(mix(from, to, t), t);
    },
  };
}
