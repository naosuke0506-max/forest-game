// 一人称の移動：入力を受けて歩き、地面の高さに合わせ、木や岩を避けて、範囲の外へ出ないようにする
import * as pc from 'playcanvas';

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
  let yaw = 200, pitch = -2, groundY = terrain.heightAt(pos.x, pos.z), bob = 0;

  function speedFor(mag) {
    // 半分ほど倒すと歩き、端まで倒すと走る
    if (mag <= 0.75) return p.walkSpeed * (mag / 0.75);
    return p.walkSpeed + (p.runSpeed - p.walkSpeed) * ((mag - 0.75) / 0.25);
  }

  function update(dt, input) {
    dt = Math.min(dt, 0.1); // 裏から戻った直後などの大きな飛びを抑える

    yaw -= input.lookX;
    pitch = Math.max(-p.pitchLimit, Math.min(p.pitchLimit, pitch - input.lookY));

    const mag = Math.hypot(input.moveX, input.moveY);
    if (mag > 0) {
      const speed = speedFor(Math.min(1, mag));
      const rad = (yaw * Math.PI) / 180;
      // 前（-Z）と右（+X）を、体の向きに合わせて回す
      const fx = -Math.sin(rad), fz = -Math.cos(rad);
      const rx = Math.cos(rad), rz = -Math.sin(rad);
      const k = (speed * dt) / mag;
      pos.x += (fx * input.moveY + rx * input.moveX) * k;
      pos.z += (fz * input.moveY + rz * input.moveX) * k;
      bob += dt * speed * 2.2;
    }

    obstacles.resolve(pos, p.radius);

    // 歩ける範囲（円）の外へ出ない
    const r = Math.hypot(pos.x, pos.z), max = config.world.playRadius;
    if (r > max) { pos.x *= max / r; pos.z *= max / r; }

    // 地面の高さへなめらかに合わせる（段差でカメラががくっとしないように）
    const target = terrain.heightAt(pos.x, pos.z);
    groundY += (target - groundY) * Math.min(1, dt * 12);

    body.setPosition(pos.x, groundY, pos.z);
    body.setEulerAngles(0, yaw, 0);
    eye.setLocalPosition(0, p.eyeHeight + Math.sin(bob) * 0.025 * Math.min(1, mag * 1.5), 0);
    eye.setLocalEulerAngles(pitch, 0, 0);
  }

  update(0, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });

  return { body, camera: eye, update, position: pos };
}
