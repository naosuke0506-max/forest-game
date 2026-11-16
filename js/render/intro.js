// マップの紹介：相手が揃って戦場へ移ったら、操作できるようになる前に、その戦場の特徴のある所を順に映す。
// 利用者の指示（2026-11-14）：「マッチングしたら、マップになり、いきなり操作できるのではなく、そのマップの紹介のような、
//   そのマップの特徴的ないろんな部分を映した、スクリーンが流れてから、出現します」
//   ・映す所は、地形の記録（world/landform.js・villages.js・cave-plan.js）から決める：盆地の全景・瀧・川邑・長い橋・風穴の口・大曠野
//   ・1 つの所を SHOT 秒、ゆっくり動くカメラで映し、名前（漢字。ふりがな付き）と短い説明を出す。暗転でつなぐ
//   ・右上の「略」で飛ばせる（PC は Enter・スペース・Esc）
// カメラは森のカメラ（player.camera）をそのまま動かす（この間、プレイヤーの操作と試合の計算は止まっている。main.js）
import * as pc from 'playcanvas';
import { ruby } from '../ui/ruby.js';
import { MAPS } from '../game/data.js';
import { ZONE_NAMES } from '../world/zones.js';

const SHOT = 3.3;      // 1 つの所を映す長さ（秒）
const FADE = 0.3;      // 暗転の長さ（秒。前後に 1 回ずつ）

/**
 * @param {object} o
 * @param {pc.Entity} o.camera 森のカメラ
 * @param {object} o.land world/landform.js
 * @param {object} o.plan world/villages.js
 * @param {object} o.terrain heightAt
 * @param {object} [o.zones]
 */
export function createIntro({ camera, land, plan, terrain, zones = null }) {
  const el = document.getElementById('intro');
  const cap = el.querySelector('.in-cap'), nameEl = el.querySelector('.in-name'), noteEl = el.querySelector('.in-note');
  const fade = el.querySelector('.in-fade'), skipBtn = document.getElementById('intro-skip');
  const H = (x, z) => terrain.heightAt(x, z);
  /** a から b への線の上で、地面からの高さが lift 以上になる高さ（山や丘にめり込まない） */
  const clearY = (a, b, lift) => {
    let y = -Infinity;
    for (let i = 0; i <= 12; i++) { const t = i / 12; y = Math.max(y, H(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)); }
    return y + lift;
  };
  /** 映す所を決める。from・to：カメラの位置（x, z。高さは道のりの地面の一番高い所 + lift）、look：見る点（x, z。高さは地面 + lookLift） */
  function plans() {
    const shots = [];
    const add = (name, note, from, to, lift, look, lookLift = 1.5, lookTo = null, fog = 0.6) => {
      const y = clearY(from, to, lift);
      shots.push({ name, note, fog, a: new pc.Vec3(from[0], y, from[1]), b: new pc.Vec3(to[0], y + (to[2] || 0), to[1]),
        la: new pc.Vec3(look[0], (look[2] ?? H(look[0], look[1])) + lookLift, look[1]),   // look[2]：見る点の地面の高さを決めておくとき（洞窟の口は、上の岩山ではなく口の床）
        lb: lookTo ? new pc.Vec3(lookTo[0], H(lookTo[0], lookTo[1]) + lookLift, lookTo[1]) : null });
    };
    // 1. 盆地の全景：南東の空から、北西の高い山の方を見下ろして回り込む
    //    （周りの山より低く飛ぶ。山より高いと、地面の端の向こうに空の下半分が見えてしまう。遠くまで見えるように、霧を薄くする）
    add(`${MAPS.forest.name}・盆地`, '山に囲まれた盆地。森・川・村・草原・地下の洞窟がある。端から端まで 350 m',
      [100, 100], [62, 126], 30, [-25, -30], 0, null, 0.28);
    // 2. 瀧：川の落ち口を、下流の川の上から見上げる
    const fall = land.river?.fall;
    if (fall) {
      const fx = fall.x, fz = fall.z, dx = fall.dx, dz = fall.dz;   // 流れの向き
      add('瀧', '北の崖から川が落ちる。川は泳いで渡れ、浅瀬と橋もある',
        [fx + dx * 46 - dz * 9, fz + dz * 46 + dx * 9], [fx + dx * 30 - dz * 3, fz + dz * 30 + dx * 3], 7, [fx + dx * 3, fz + dz * 3], 6);
    }
    // 3. 川邑：いちばん大きい村を、家並みの上から
    const v = (plan?.villages || []).find((q) => q.id === 'river') || plan?.villages?.[0];
    if (v) {
      // 木の梢より上（地面から 23 m）を、村の真ん中を見下ろしながら回り込む
      add(v.name, '家には扉があり、中のタンスとベッドの下に隠れられる。村は 3 つ',
        [v.x - v.r * 0.9, v.z + v.r * 0.35], [v.x - v.r * 0.45, v.z + v.r * 0.85], 23, [v.x, v.z], 1);
    }
    // 4. 長い橋：いちばん長い橋を、川の上から斜めに
    const br = [...(plan?.bridges || [])].sort((p, q) => Math.hypot(q.bx - q.ax, q.bz - q.az) - Math.hypot(p.bx - p.ax, p.bz - p.az))[0];
    if (br) {
      const mx = (br.ax + br.bx) / 2, mz = (br.az + br.bz) / 2, len = Math.hypot(br.bx - br.ax, br.bz - br.az) || 1;
      const tx = (br.bx - br.ax) / len, tz = (br.bz - br.az) / len, nx = -tz, nz = tx;   // 橋の向きと、川に沿う向き
      add('長橋', '川幅の広い所に、長い木の橋が架かる',
        [mx + nx * 30 - tx * 14, mz + nz * 30 - tz * 14], [mx + nx * 22 + tx * 6, mz + nz * 22 + tz * 6], 6.5, [mx, mz], 2.2);
    }
    // 5. 風穴：北西の岩山の口へ、道から近づく
    const m = land.cave?.mouths?.find((q) => q.id === 'A') || land.cave?.mouths?.[0];
    if (m) {
      // 口へ続く道の上を、歩く人の目より少し高い所で近づく（道の上には木が無い。横から寄ると、梢の中に入って何も見えない）
      const [dx, dz] = m.in;   // 口から奥への向き
      let road = null;
      for (const r of plan?.roads || []) for (const end of [0, r.pts.length - 1]) {
        const d = Math.hypot(r.pts[end][0] - m.from[0], r.pts[end][1] - m.from[1]);
        if (d < 6 && (!road || d < road.d)) road = { d, pts: end === 0 ? r.pts : [...r.pts].reverse() };   // pts[0] が口の側
      }
      const back = (dist) => {   // 道の上を、口の側の端から dist m 戻った点
        if (!road) return [m.from[0] - dx * dist, m.from[1] - dz * dist];
        let left = dist;
        for (let k = 1; k < road.pts.length; k++) {
          const a = road.pts[k - 1], b = road.pts[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (left <= l) return [a[0] + ((b[0] - a[0]) * left) / l, a[1] + ((b[1] - a[1]) * left) / l];
          left -= l;
        }
        return road.pts.at(-1);
      };
      add('風穴', '北西の岩山の口から、地下の洞窟へ。口は 5 つあり、奥に大空洞がある',
        back(27), back(9), 2.4, [m.x, m.z, H(m.from[0], m.from[1])], 1.7);
    }
    // 6. 大曠野：東の草原を低く渡る
    add(ZONE_NAMES.prairie, '東の草原。背の高い草に身を隠せる',
      [70, 44], [104, 30], 9, [150, 4], 1);
    return shots;
  }

  let shots = null, i = -1, t = 0, active = false, done = null, faded = false, held = null;
  // 紹介の間だけ、遠くまで描く（ふだんは 160 m まで。そのままだと、高い所から見たとき遠くの地面が切れて、空の下半分が見えてしまう）
  const FAR = 560;
  let farWas = null;
  const tmp = new pc.Vec3(), look = new pc.Vec3();
  const ease = (k) => k * k * (3 - 2 * k);
  function showShot(n) {
    i = n; t = 0; faded = false;
    const s = shots[i];
    nameEl.innerHTML = ruby(s.name);
    noteEl.textContent = s.note;
    cap.classList.remove('on');
    fade.classList.remove('on');
    setTimeout(() => { if (active && i === n) cap.classList.add('on'); }, 350);
  }
  function finish() {
    if (!active) return;
    active = false;
    held = null;
    window.removeEventListener('keydown', onKey);
    skipBtn.onclick = null;
    cap.classList.remove('on');
    fade.classList.add('on');
    // 暗くなってから片付ける（次の棺桶の中は暗い所から始まる）
    setTimeout(() => {
      if (farWas !== null) { camera.camera.farClip = farWas; farWas = null; }
      el.hidden = true; fade.classList.remove('on');
      const r = done; done = null; r?.();
    }, FADE * 1000 + 40);
  }
  function onKey(e) { if (['Enter', 'Space', 'Escape'].includes(e.code)) { e.preventDefault(); finish(); } }

  return {
    get active() { return active; },
    /** 今映している所の霧の薄さ（0〜1。main.js が霧の濃さに掛ける）。高い所から遠くを映す所は薄くする */
    get fog() { return active && shots?.[held ? held.n : i] ? shots[held ? held.n : i].fog : 1; },
    /** 始める。全部映し終わるか、飛ばされたら終わる */
    play() {
      shots = shots || plans();
      el.hidden = false;
      active = true;
      farWas = camera.camera.farClip;
      camera.camera.farClip = FAR;
      showShot(0);
      skipBtn.onclick = finish;
      window.addEventListener('keydown', onKey);
      return new Promise((resolve) => { done = resolve; });
    },
    skip: finish,
    /** 毎フレーム：カメラを動かす */
    update(dt) {
      if (!active) return;
      if (held) { this.pose(held.n, held.k); return; }   // 確かめ用：止めている間は進めない
      t += Math.min(dt, 0.1);
      const s = shots[i];
      if (!faded && t > SHOT - FADE) { faded = true; fade.classList.add('on'); cap.classList.remove('on'); }
      if (t >= SHOT) {
        if (i + 1 >= shots.length) { finish(); return; }
        showShot(i + 1);
        return this.update(0);
      }
      const k = ease(Math.min(1, t / SHOT) * 0.86 + 0.07);   // 始めと終わりを少しだけゆるめる（止まっては見えない）
      tmp.lerp(s.a, s.b, k);
      camera.setPosition(tmp);
      if (s.lb) look.lerp(s.la, s.lb, k); else look.copy(s.la);
      camera.lookAt(look);
    },
    /** 確かめ用：映す所の一覧 */
    get shots() { return shots || (shots = plans()); },
    /** 確かめ用：n 番目の所の、途中（0〜1）の姿にカメラを置く */
    pose(n, k = 0.5) {
      const s = this.shots[n];
      tmp.lerp(s.a, s.b, k);
      camera.setPosition(tmp);
      if (s.lb) look.lerp(s.la, s.lb, k); else look.copy(s.la);
      camera.lookAt(look);
      return s;
    },
    /** 確かめ用：n 番目の所の途中の姿で止める（名前と説明も出す）。null で止めるのをやめる */
    hold(n, k = 0.5) {
      held = n === null ? null : { n, k };
      if (!held) return;
      const s = this.shots[n];
      nameEl.innerHTML = ruby(s.name); noteEl.textContent = s.note;
      cap.classList.add('on'); fade.classList.remove('on');
    },
  };
}
