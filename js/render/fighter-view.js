// 戦う人の見た目（仮）：色つきのカプセルの体と頭、向きが分かる鼻先。
// キャラの 3D モデル（骨と動き）ができたら、ここを差し替える
import * as pc from 'playcanvas';

export function createFighterView(app, fighter, terrain) {
  const color = new pc.Color().fromString(fighter.color);
  const mat = new pc.StandardMaterial();
  mat.diffuse = color;
  mat.gloss = 0.35;
  mat.useMetalness = true;
  mat.metalness = 0.1;
  mat.update();
  const dark = new pc.StandardMaterial();
  dark.diffuse = new pc.Color(color.r * 0.35, color.g * 0.35, color.b * 0.35);
  dark.update();

  const root = new pc.Entity(`fighter-${fighter.id}`);
  const body = new pc.Entity('body');
  body.addComponent('render', { type: 'capsule', material: mat, castShadows: true });
  body.setLocalScale(0.6, 1.5, 0.45);        // 幅 0.6m・高さ 1.5m のカプセル
  body.setLocalPosition(0, 0.75, 0);
  const head = new pc.Entity('head');
  head.addComponent('render', { type: 'sphere', material: mat, castShadows: true });
  head.setLocalScale(0.32, 0.36, 0.32);
  head.setLocalPosition(0, 1.62, 0);
  const nose = new pc.Entity('nose');          // 顔の向き（-Z が前）
  nose.addComponent('render', { type: 'box', material: dark, castShadows: false });
  nose.setLocalScale(0.18, 0.08, 0.12);
  nose.setLocalPosition(0, 1.64, -0.17);
  root.addChild(body);
  root.addChild(head);
  root.addChild(nose);
  app.root.addChild(root);

  let groundY = terrain.heightAt(fighter.x, fighter.z), bob = 0, fall = 0;

  return {
    root,
    /** speed01：0〜1 の動きの大きさ（歩く揺れに使う） */
    update(dt, speed01 = 0) {
      const target = terrain.heightAt(fighter.x, fighter.z);
      groundY += (target - groundY) * Math.min(1, dt * 12);
      if (fighter.alive) {
        bob += dt * 9 * speed01;
        root.setPosition(fighter.x, groundY + Math.abs(Math.sin(bob)) * 0.05 * speed01, fighter.z);
        root.setEulerAngles(0, fighter.yaw, 0);
      } else {
        // 倒れる（手順 2 で、倒れる動きに置き換える）
        fall = Math.min(90, fall + dt * 180);
        root.setPosition(fighter.x, groundY + 0.2 * (fall / 90), fighter.z);
        root.setEulerAngles(fall, fighter.yaw, 0);
      }
    },
    setVisible(v) { root.enabled = v; },
  };
}
