// 太陽を見るとまぶしい：太陽の位置に光の輪と光の筋を出し、まっすぐ見るほど画面全体が白く飛ぶ。
// 太陽が直接見えるときだけ出す：外周の柵・地面の起伏・木の幹・木の葉（だいたいの形）がさえぎっていたら出さない。
// 夕暮れは橙色。夜（月）はまぶしくしない。画面の上に重ねる HTML の飾りで描く（エンジンの描画を増やさないので軽い）
import * as pc from 'playcanvas';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * @param {pc.Entity} sun 太陽の光（光は自分の -Y へ進むので、太陽のある向きは +Y）
 * @param {{ glare: {strength: number, color: number[]} }} timeOfDay 時間帯（まぶしさの強さと色）
 * @param {object} occluders 太陽をさえぎる物
 *   canopies：葉（だいたいの球 {x,y,z,r}）、trunks：幹（円柱 {x,z,r,top}）、
 *   fence：外周の柵 {radius, height}、heightAt：地面の高さ
 */
export function createSunGlare(camera, sun, timeOfDay, { canopies = [], trunks = [], fence = null, heightAt = null } = {}) {
  const flare = document.getElementById('glare');
  const wash = document.getElementById('dazzle');
  const camPos = new pc.Vec3(), dir = new pc.Vec3(), far = new pc.Vec3(), screen = new pc.Vec3();
  let visible = 0;

  /** カメラから太陽の向きへの線が、何にもさえぎられていないか（0〜1。葉の縁は少し透ける） */
  function openSky() {
    const ox = camPos.x, oy = camPos.y, oz = camPos.z, dx = dir.x, dy = dir.y, dz = dir.z;
    // 外周の柵（今は無い。fence を渡したときだけ）：線が柵の円に届いた所で、柵の高さより下なら見えない
    if (fence) {
      const a = dx * dx + dz * dz;
      if (a > 1e-6) {
        const b = ox * dx + oz * dz, c = ox * ox + oz * oz - fence.radius * fence.radius;
        const t = (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a;   // 円の内側から外へ出る所
        const x = ox + dx * t, z = oz + dz * t, y = oy + dy * t;
        if (t > 0 && y < (heightAt ? heightAt(x, z) : 0) + fence.height) return 0;
      }
    }
    // 地面の起伏：線の上を何か所か調べ、地面より下を通るなら見えない
    if (heightAt) {
      // 近くは細かく、遠くは粗く、周りの山の向こうまで（2026-11-14：外周の柵の代わりに山が太陽をさえぎる）
      for (let t = 4; t <= 240; t += t < 90 ? 6 : 15) {
        if (oy + dy * t < heightAt(ox + dx * t, oz + dz * t)) return 0;
      }
    }
    // 木の幹（円柱）：横から見た距離が幹の太さより近く、その高さが幹の中なら見えない
    const ha = Math.hypot(dx, dz) || 1e-6;
    for (const k of trunks) {
      const px = k.x - ox, pz = k.z - oz;
      const t = (px * dx + pz * dz) / (ha * ha);        // 横から見て、線が幹に一番近づく所
      if (t <= 0 || t > 60) continue;
      const qx = ox + dx * t - k.x, qz = oz + dz * t - k.z;
      if (qx * qx + qz * qz < k.r * k.r * 1.2 && oy + dy * t < k.top) return 0;
    }
    // 木の葉（だいたいの球）
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
      if (timer <= 0) { timer = 0.05; open = openSky(); }
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
