// 左上のミニマップ：森全体を上から見た丸い地図（北が上）。
// 木や岩（ぶつかる物）を点で、歩ける範囲を輪で、自分を矢印で描く。ほかのプレイヤーは描かない（見つけるのは自分の目で）
// 木や岩は動かないので最初に 1 回だけ描いておき、毎回は自分の矢印だけを重ねる（負荷を抑えるため、1 秒に 10 回まで）

export function createMinimap(canvas, { obstacles, areaRadius, viewRadius = areaRadius + 6 }) {
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');
  let size = 0, timer = 0;

  /** 世界の位置（x, z）→ 地図の上の点。北（-Z）が上 */
  const toMap = (x, z) => [size / 2 + (x / viewRadius) * (size / 2), size / 2 + (z / viewRadius) * (size / 2)];

  function drawBase() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    size = Math.round(canvas.clientWidth * dpr) || 150;
    canvas.width = canvas.height = base.width = base.height = size;
    const b = base.getContext('2d');
    b.clearRect(0, 0, size, size);
    // 地面
    b.beginPath();
    b.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    b.fillStyle = 'rgba(28, 40, 26, .78)';
    b.fill();
    b.save();
    b.clip();
    // 木や岩
    b.fillStyle = 'rgba(120, 160, 100, .55)';
    for (const o of obstacles.all) {
      if (!o.solid) continue;
      const [mx, my] = toMap(o.x, o.z);
      const r = Math.max(1, (o.r / viewRadius) * (size / 2) * 1.6);
      b.beginPath();
      b.arc(mx, my, r, 0, Math.PI * 2);
      b.fill();
    }
    b.restore();
    // 歩ける範囲
    b.beginPath();
    b.arc(size / 2, size / 2, (areaRadius / viewRadius) * (size / 2), 0, Math.PI * 2);
    b.strokeStyle = 'rgba(255, 220, 140, .7)';
    b.lineWidth = Math.max(1.5, size / 120);
    b.stroke();
    // 縁と北の印
    b.beginPath();
    b.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    b.strokeStyle = 'rgba(236, 231, 218, .45)';
    b.lineWidth = 2;
    b.stroke();
    b.fillStyle = 'rgba(236, 231, 218, .8)';
    b.font = `${Math.round(size / 11)}px sans-serif`;
    b.textAlign = 'center';
    b.fillText('北', size / 2, size / 10 + 2);
  }
  drawBase();
  window.addEventListener('resize', drawBase);

  return {
    /** me：自分（x, z, yaw）。yaw は度（0 で北＝ -Z を向く） */
    update(dt, me) {
      timer -= dt;
      if (timer > 0) return;
      timer = 0.1;
      // 画面の大きさが変わった・表示されたばかり（最初は隠れていて大きさが 0）のときは描き直す
      const want = Math.round(canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1));
      if (want > 0 && want !== size) drawBase();
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(base, 0, 0);
      const [mx, my] = toMap(me.x, me.z);
      const a = (-me.yaw * Math.PI) / 180;    // 地図の上で、北（上）から時計回りの角度
      const s = size / 22;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.3);
      ctx.lineTo(s * 0.8, s);
      ctx.lineTo(0, s * 0.45);
      ctx.lineTo(-s * 0.8, s);
      ctx.closePath();
      ctx.fillStyle = me.alive === false ? 'rgba(160,160,160,.8)' : '#ffd75e';
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },
  };
}
