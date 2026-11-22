// 太陽を見るとまぶしい：太陽の位置に光の輪と光の筋を出し、まっすぐ見るほど画面全体が白く飛ぶ。
// 太陽が直接見えるときだけ出す：地面の起伏（周りの山）・建物と物（家の壁・屋根・家具・教会・ガソリンスタンド・橋・岩・車・電柱・木の幹など。
// bot の目と同じ「視線をさえぎる物」game/sight.js）・木の葉（だいたいの形）がさえぎっていたら出さない。
// 2026-11-22（利用者の指示：「全ての時間帯で、建物や色んな障害物越しに太陽は見れないようにしてください」）：前は地面・木の幹・木の葉しか見ておらず、
// 家や教会の向こう・家の中からでも、太陽のまぶしさが出ていた。同じ判定（createSkyOcclusion）を、太陽と月の円盤（render/sky-lights.js）も使う
// 夕暮れは橙色。夜（月）はまぶしくしない。画面の上に重ねる HTML の飾りで描く（エンジンの描画を増やさないので軽い）
import * as pc from 'playcanvas';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * 空の光（太陽・月）が、ある場所から直接見えるか（0〜1）を調べる
 * @param {object} o
 *   canopies：葉（だいたいの球 {x,y,z,r}）、trunks：幹（円柱 {x,z,r,top}。sight が無いときだけ使う）、
 *   fence：外周の柵 {radius, height}（今は無い）、heightAt：地面の高さ、
 *   sight：視線をさえぎる物（game/sight.js。家の壁・屋根・床・家具・教会・岩・車・木の幹など）、reach：建物と物を調べる遠さ（m。描く遠さまで）
 * @returns {(from: pc.Vec3, dir: pc.Vec3, opt?: { leaves?: boolean }) => number}
 */
export function createSkyOcclusion({ canopies = [], trunks = [], fence = null, heightAt = null, sight = null, reach = 150 } = {}) {
  const p = [0, 0, 0], q = [0, 0, 0];
  const SPREAD = 0.012;   // まわりの 4 本の線のずれ（ラジアン。約 0.7 度）
  const u = [0, 0, 0], w = [0, 0, 0], dd = { x: 0, y: 0, z: 0 };
  /**
   * 太陽の中心と、そのまわりの 4 本の線を調べ、さえぎられていない割合（0〜1）を返す。
   * 建物の縁ぎりぎりで、判定の形（視線をさえぎる物）と見た目の形がわずかにずれても、光が漏れないように。木の葉は中心の線だけ
   */
  return function openSky(from, dir, { leaves = true } = {}) {
    if (!rayOpen(from, dir)) return 0;   // 中心がさえぎられたら見えない
    // dir に直角な 2 つの向き
    const ax = Math.abs(dir.y) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    u[0] = dir.y * ax[2] - dir.z * ax[1]; u[1] = dir.z * ax[0] - dir.x * ax[2]; u[2] = dir.x * ax[1] - dir.y * ax[0];
    const ul = Math.hypot(u[0], u[1], u[2]) || 1; u[0] /= ul; u[1] /= ul; u[2] /= ul;
    w[0] = dir.y * u[2] - dir.z * u[1]; w[1] = dir.z * u[0] - dir.x * u[2]; w[2] = dir.x * u[1] - dir.y * u[0];
    let open = 1;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      dd.x = dir.x + (u[0] * a + w[0] * b) * SPREAD; dd.y = dir.y + (u[1] * a + w[1] * b) * SPREAD; dd.z = dir.z + (u[2] * a + w[2] * b) * SPREAD;
      if (rayOpen(from, dd)) open += 1;
    }
    open /= 5;
    return leaves ? open * leafOpen(from, dir) : open;
  };
  /** 1 本の線が、地面の起伏・建物と物にさえぎられていないか */
  function rayOpen(from, dir) {
    const ox = from.x, oy = from.y, oz = from.z, dx = dir.x, dy = dir.y, dz = dir.z;
    // 外周の柵（今は無い。fence を渡したときだけ）：線が柵の円に届いた所で、柵の高さより下なら見えない
    if (fence) {
      const a = dx * dx + dz * dz;
      if (a > 1e-6) {
        const b = ox * dx + oz * dz, c = ox * ox + oz * oz - fence.radius * fence.radius;
        const t = (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a;   // 円の内側から外へ出る所
        const x = ox + dx * t, z = oz + dz * t, y = oy + dy * t;
        if (t > 0 && y < (heightAt ? heightAt(x, z) : 0) + fence.height) return false;
      }
    }
    // 地面の起伏：線の上を何か所か調べ、地面より下を通るなら見えない
    if (heightAt) {
      // 近くは細かく、遠くは粗く、周りの山の向こうまで（2026-11-14：外周の柵の代わりに山が太陽をさえぎる）
      for (let t = 4; t <= 240; t += t < 90 ? 6 : 15) {
        if (oy + dy * t < heightAt(ox + dx * t, oz + dz * t)) return false;
      }
    }
    // 建物と物（壁・屋根・床・家具・岩・車・木の幹など）：bot の目と同じ形で、線分が当たるか
    if (sight) {
      p[0] = ox; p[1] = oy; p[2] = oz;
      q[0] = ox + dx * reach; q[1] = oy + dy * reach; q[2] = oz + dz * reach;
      if (sight.blocked(p, q, { solidsOnly: true })) return false;
    } else {
      // 木の幹（円柱）：横から見た距離が幹の太さより近く、その高さが幹の中なら見えない
      const ha = Math.hypot(dx, dz) || 1e-6;
      for (const k of trunks) {
        const px = k.x - ox, pz = k.z - oz;
        const t = (px * dx + pz * dz) / (ha * ha);        // 横から見て、線が幹に一番近づく所
        if (t <= 0 || t > 60) continue;
        const qx = ox + dx * t - k.x, qz = oz + dz * t - k.z;
        if (qx * qx + qz * qz < k.r * k.r * 1.2 && oy + dy * t < k.top) return false;
      }
    }
    return true;
  }
  /** 木の葉（だいたいの球）：葉の縁は少しだけ透ける（0〜1） */
  function leafOpen(from, dir) {
    const ox = from.x, oy = from.y, oz = from.z, dx = dir.x, dy = dir.y, dz = dir.z;
    let v = 1;
    for (const c of canopies) {
      const px = c.x - ox, py = c.y - oy, pz = c.z - oz;
      const t = px * dx + py * dy + pz * dz;            // 線の上で、球の中心に一番近い所
      if (t <= 0 || t > 60) continue;
      const d2 = px * px + py * py + pz * pz - t * t;
      const r2 = c.r * c.r;
      if (d2 < r2) v = Math.min(v, 0.6 * smooth(r2 * 0.7, r2, d2));   // 葉の縁は少しだけ透ける
      if (v <= 0) return 0;
    }
    return v;
  }
}

/**
 * @param {pc.Entity} sun 太陽の光（光は自分の -Y へ進むので、太陽のある向きは +Y）
 * @param {{ glare: {strength: number, color: number[]} }} timeOfDay 時間帯（まぶしさの強さと色）
 * @param {object} occluders 太陽をさえぎる物（createSkyOcclusion と同じ。occlusion を渡せば、それを使う）
 */
export function createSunGlare(camera, sun, timeOfDay, { occlusion = null, ...occluders } = {}) {
  const flare = document.getElementById('glare');
  const wash = document.getElementById('dazzle');
  const camPos = new pc.Vec3(), dir = new pc.Vec3(), far = new pc.Vec3(), screen = new pc.Vec3();
  const openSky = occlusion || createSkyOcclusion(occluders);
  let visible = 0;

  const hide = () => { flare.style.opacity = '0'; wash.style.opacity = '0'; };
  let timer = 0, open = 0;

  return {
    update(dt) {
      const g = timeOfDay.glare;
      const cam = camera.camera;
      camPos.copy(camera.getPosition());
      dir.copy(sun.up).normalize();
      const fwd = camera.forward;
      const align = fwd.x * dir.x + fwd.y * dir.y + fwd.z * dir.z;   // 1 で太陽を真正面に見ている
      if (g.strength <= 0.01 || align < 0.2 || dir.y < -0.02) { visible = 0; hide(); return; }
      // さえぎりの判定は 1 秒に 20 回まで（木が多いので）
      timer -= dt;
      if (timer <= 0) { timer = 0.05; open = openSky(camPos, dir); }
      // 急に変わらないよう、なめらかに追いかける（さえぎられたらすぐ消える）
      visible += (open - visible) * Math.min(1, dt * (open < visible ? 20 : 8));
      if (visible < 0.01) { hide(); return; }
      far.copy(dir).mulScalar(500).add(camPos);
      cam.worldToScreen(far, screen);
      const k = g.strength * visible;
      const c = g.color.map((v) => Math.round(v * 255)).join(',');
      flare.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -50%) rotate(${(align * 40).toFixed(1)}deg)`;
      flare.style.setProperty('--glare-color', `rgb(${c})`);
      flare.style.opacity = (k * smooth(0.25, 0.95, align)).toFixed(3);
      // まっすぐ見るほど、画面全体が白く飛ぶ
      wash.style.background = `rgba(${c}, 1)`;
      wash.style.opacity = (k * 0.58 * smooth(0.88, 0.997, align)).toFixed(3);
    },
  };
}
