// 太陽を見るとまぶしい：太陽の位置に光の輪と光の筋を出し、まっすぐ見るほど画面全体が白く飛ぶ。
// 木の葉（だいたいの球）が太陽をさえぎっていると弱まる。夜は月の淡い光、夕暮れは橙色。
// 画面の上に重ねる HTML の飾りで描く（エンジンの描画を増やさないので軽い）
import * as pc from 'playcanvas';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * @param {pc.Entity} sun 太陽の光（光は自分の -Y へ進むので、太陽のある向きは +Y）
 * @param {{ glare: {strength: number, color: number[]} }} timeOfDay 時間帯（まぶしさの強さと色）
 * @param {{x,y,z,r}[]} canopies 葉の広がり
 */
export function createSunGlare(camera, sun, timeOfDay, canopies = []) {
  const flare = document.getElementById('glare');
  const wash = document.getElementById('dazzle');
  const camPos = new pc.Vec3(), dir = new pc.Vec3(), far = new pc.Vec3(), screen = new pc.Vec3();
  let visible = 1;

  /** カメラから太陽の向きへの線が、近くの葉の球を通るか（通れば 0、かすめれば少し） */
  function openSky() {
    let v = 1;
    for (const c of canopies) {
      const dx = c.x - camPos.x, dy = c.y - camPos.y, dz = c.z - camPos.z;
      const t = dx * dir.x + dy * dir.y + dz * dir.z;       // 線の上で、球の中心に一番近い所
      if (t <= 0 || t > 40) continue;
      const d2 = dx * dx + dy * dy + dz * dz - t * t;       // 線と中心の距離の 2 乗
      const r2 = c.r * c.r;
      if (d2 < r2) v = Math.min(v, 0.15 + 0.85 * smooth(r2 * 0.55, r2, d2));   // 葉の縁は少し透ける
      if (v <= 0.15) break;
    }
    return v;
  }

  return {
    update(dt) {
      const g = timeOfDay.glare;
      const cam = camera.camera;
      camPos.copy(camera.getPosition());
      dir.copy(sun.up).normalize();
      const fwd = camera.forward;
      const align = fwd.x * dir.x + fwd.y * dir.y + fwd.z * dir.z;   // 1 で太陽を真正面に見ている
      if (g.strength <= 0.01 || align < 0.2 || dir.y < -0.02) {
        flare.style.opacity = '0'; wash.style.opacity = '0';
        return;
      }
      // さえぎり：急に変わらないよう、なめらかに追いかける
      visible += (openSky() - visible) * Math.min(1, dt * 8);
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
