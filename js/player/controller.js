// プレイヤーの移動と視点：入力を受けて歩き、地面の高さに合わせ、木や岩を避けて、歩ける範囲の外へ出ない。
// 視点は一人称（目の位置）と三人称（右肩越しの後ろ）を切り替えられる
import * as pc from 'playcanvas';

// 三人称のカメラ：頭の少し上を中心に、後ろへ THIRD_DIST、右へ THIRD_SIDE
const THIRD_DIST = 3.4, THIRD_SIDE = 0.55, THIRD_PIVOT = 1.7;

export function createPlayer(app, config, terrain, obstacles, fogColor) {
  const p = config.player;

  // 体（左右の向き）と目（上下の向き）を分ける
  const body = new pc.Entity('Player');
  const eye = new pc.Entity('Eye');
  eye.addComponent('camera', {
    fov: p.fov,
    nearClip: 0.1,
    farClip: config.atmosphere.farClip,
    clearColor: fogColor,
    toneMapping: pc.TONEMAP_ACES,
    gammaCorrection: pc.GAMMA_SRGB,
  });
  eye.setLocalPosition(0, p.eyeHeight, 0);
  body.addChild(eye);
  app.root.addChild(body);

  const pos = { x: 0, z: 2 };
  let yaw = 200, pitch = -2, groundY = terrain.heightAt(pos.x, pos.z), bob = 0, lastMag = 0;
  let viewMode = 'first';               // first / third
  let areaRadius = config.world.playRadius;
  let frozen = false;                   // 脱落したら動かない
  let thirdDist = THIRD_DIST;           // 三人称のカメラの距離（地面に当たると縮める）

  function speedFor(mag) {
    // 半分ほど倒すと歩き、端まで倒すと走る
    if (mag <= 0.75) return p.walkSpeed * (mag / 0.75);
    return p.walkSpeed + (p.runSpeed - p.walkSpeed) * ((mag - 0.75) / 0.25);
  }

  function placeCamera(mag) {
    if (viewMode === 'first') {
      eye.setLocalPosition(0, p.eyeHeight + Math.sin(bob) * 0.025 * Math.min(1, mag * 1.5), 0);
      eye.setLocalEulerAngles(pitch, 0, 0);
      return;
    }
    // 三人称：見ている向き（上下）に合わせて、後ろ上・下へ回り込む
    const pr = (pitch * Math.PI) / 180;
    const want = THIRD_DIST;
    // 地面に当たらない距離まで縮める（体の真後ろの地面の高さで確かめる）
    let d = want;
    const yr = (yaw * Math.PI) / 180;
    for (let k = 0; k < 6; k++) {
      const lx = THIRD_SIDE, ly = THIRD_PIVOT - Math.sin(pr) * d, lz = Math.cos(pr) * d;
      const wx = pos.x + Math.cos(yr) * lx + Math.sin(yr) * lz;
      const wz = pos.z - Math.sin(yr) * lx + Math.cos(yr) * lz;
      if (groundY + ly > terrain.heightAt(wx, wz) + 0.35) break;
      d *= 0.75;
    }
    thirdDist += (d - thirdDist) * 0.25;
    eye.setLocalPosition(THIRD_SIDE, THIRD_PIVOT - Math.sin(pr) * thirdDist, Math.cos(pr) * thirdDist);
    eye.setLocalEulerAngles(pitch, 0, 0);
  }

  function update(dt, input) {
    dt = Math.min(dt, 0.1); // 裏から戻った直後などの大きな飛びを抑える
    if (frozen) input = { moveX: 0, moveY: 0, lookX: input.lookX, lookY: input.lookY };

    yaw -= input.lookX;
    pitch = Math.max(-p.pitchLimit, Math.min(p.pitchLimit, pitch - input.lookY));

    const mag = Math.hypot(input.moveX, input.moveY);
    if (mag > 0) {
      const speed = speedFor(Math.min(1, mag)) * (api.speedScale || 1);
      const rad = (yaw * Math.PI) / 180;
      // 前（-Z）と右（+X）を、体の向きに合わせて回す
      const fx = -Math.sin(rad), fz = -Math.cos(rad);
      const rx = Math.cos(rad), rz = -Math.sin(rad);
      const k = (speed * dt) / mag;
      pos.x += (fx * input.moveY + rx * input.moveX) * k;
      pos.z += (fz * input.moveY + rz * input.moveX) * k;
      bob += dt * speed * 2.2;
    }
    lastMag = Math.min(1, mag);

    obstacles.resolve(pos, p.radius);

    // 歩ける範囲（円）の外へ出ない
    const r = Math.hypot(pos.x, pos.z);
    if (r > areaRadius) { pos.x *= areaRadius / r; pos.z *= areaRadius / r; }

    // 地面の高さへなめらかに合わせる（段差でカメラががくっとしないように）
    const target = terrain.heightAt(pos.x, pos.z);
    groundY += (target - groundY) * Math.min(1, dt * 12);

    body.setPosition(pos.x, groundY, pos.z);
    body.setEulerAngles(0, yaw, 0);
    placeCamera(mag);
  }

  const api = {
    body,
    camera: eye,
    update,
    position: pos,
    speedScale: 1,
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get moving() { return lastMag; },
    get viewMode() { return viewMode; },
    setViewMode(mode) { viewMode = mode === 'third' ? 'third' : 'first'; thirdDist = THIRD_DIST; placeCamera(0); },
    setAreaRadius(r) { areaRadius = r; },
    setFrozen(v) { frozen = v; },
    /** 観戦：見ている人の位置と向きにカメラを合わせる（三人称にする） */
    setPose(x, z, faceYaw) {
      pos.x = x; pos.z = z; yaw = faceYaw;
      if (viewMode !== 'third') { viewMode = 'third'; thirdDist = THIRD_DIST; }
    },
    /** 出現する場所と向き */
    spawn(x, z, faceYaw) {
      pos.x = x; pos.z = z; yaw = faceYaw; pitch = -2;
      groundY = terrain.heightAt(x, z);
      update(0, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
    },
  };
  update(0, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
  return api;
}
