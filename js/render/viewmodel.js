// 一人称で画面の手前に見える、自分の武器と盾。カメラの子にして、行動に合わせて動かす
import * as pc from 'playcanvas';
import { WEAPONS } from '../game/data.js';
import { createWeaponModel, createShieldModel, createArrowModel } from './weapons.js';

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function createViewModel(camera, fighter) {
  const w = WEAPONS[fighter.weapon];
  const root = new pc.Entity('viewmodel');
  camera.addChild(root);

  // 武器を持つ「手の位置」。ここを動かして振る
  const grip = new pc.Entity('grip');
  root.addChild(grip);
  const weapon = createWeaponModel(fighter.weapon, { shadows: false });
  grip.addChild(weapon);
  if (fighter.weapon === 'spear') weapon.setLocalPosition(0, 0, 0.7);

  let shield = null;
  if (fighter.shield) {
    shield = createShieldModel({ shadows: false });
    root.addChild(shield);
  }
  let arrow = null;
  if (w.kind === 'bow') {
    arrow = createArrowModel();
    root.addChild(arrow);
  }

  let sway = 0, guardBlend = 0;

  // 構えの位置と角度（カメラから見て：右が +X、下が -Y、前が -Z）
  const REST = {
    longsword: { pos: [0.32, -0.32, -0.55], rot: [12, 12, -8] },
    mace:      { pos: [0.34, -0.36, -0.55], rot: [18, 10, -10] },
    spear:     { pos: [0.28, -0.3, -0.45], rot: [4, 4, 0] },
    shortbow:  { pos: [-0.12, -0.12, -0.95], rot: [-90, 0, 12] },   // 弓は縦に立てる（模型は Z の向きに立っている）
  }[fighter.weapon];

  return {
    setVisible(v) { root.enabled = v; },
    update(dt, moving) {
      if (!fighter.alive) { root.enabled = false; return; }
      sway += dt * (2 + 6 * moving);
      const bob = [Math.sin(sway) * 0.012 * moving, Math.abs(Math.cos(sway)) * 0.015 * moving, 0];
      let pos = [...REST.pos], rot = [...REST.rot];

      // 防御：騎士は盾を正面へ。ほかは武器を横に寝かせて体の前へ
      guardBlend += ((fighter.guarding ? 1 : 0) - guardBlend) * Math.min(1, dt * 14);
      const a = fighter.action;
      if (w.kind === 'melee') {
        if (!fighter.shield && guardBlend > 0.01) {
          pos = lerp3(pos, [0.05, -0.2, -0.5], guardBlend);
          rot = lerp3(rot, [10, 75, 80], guardBlend);
        }
        if (a?.kind === 'attack') {
          const t = a.t;
          if (fighter.weapon === 'spear') {
            const pull = ease(Math.min(1, t / w.windup));
            const thrust = ease(Math.min(1, Math.max(0, (t - w.windup) / 0.08)));
            const back = ease(Math.min(1, Math.max(0, (t - w.windup - 0.08) / w.recovery)));
            pos[2] += pull * 0.12 - thrust * (1 - back) * 0.65;
            pos[0] -= thrust * (1 - back) * 0.12;
          } else {
            // 右上へ振りかぶって、左下へ振り抜く
            const up = ease(Math.min(1, t / w.windup));
            const swing = ease(Math.min(1, Math.max(0, (t - w.windup) / 0.12)));
            const back = ease(Math.min(1, Math.max(0, (t - w.windup - 0.12) / w.recovery)));
            const raised = [0.42, 0.05, -0.45], raisedRot = [-50, 20, -40];
            const done = [-0.25, -0.42, -0.55], doneRot = [55, -30, 30];
            let p2 = lerp3(pos, raised, up), r2 = lerp3(rot, raisedRot, up);
            p2 = lerp3(p2, done, swing); r2 = lerp3(r2, doneRot, swing);
            pos = lerp3(p2, pos, back); rot = lerp3(r2, rot, back);
          }
        }
      } else {
        // 弓：引いた割合で矢を手前へ。引いていないときは少し下げる
        const drawing = a?.kind === 'draw';
        const k = drawing ? Math.min(1, a.t / w.drawTime) : 0;
        const ready = drawing ? 1 : 0;
        pos = lerp3([0.05, -0.5, -0.9], pos, ready);
        rot = lerp3([-60, 0, 35], rot, ready);
        arrow.enabled = drawing;
        if (drawing) {
          // 矢は弓の握りから手前へ。引くほど手前に来る
          arrow.setLocalPosition(pos[0] + 0.03, pos[1], pos[2] + 0.22 + k * 0.14); // 矢の後ろ端がカメラより手前に出ないように
          arrow.setLocalEulerAngles(0, 0, 0);
        }
      }
      grip.setLocalPosition(pos[0] + bob[0], pos[1] + bob[1], pos[2]);
      grip.setLocalEulerAngles(...rot);

      if (shield) {
        // ふだんは左下の奥に縁だけ見え、構えると正面へ上がる
        const sp = lerp3([-0.62, -0.62, -0.85], [-0.18, -0.26, -0.75], guardBlend);
        shield.setLocalPosition(sp[0] + bob[0], sp[1] + bob[1], sp[2]);
        shield.setLocalEulerAngles(lerp(15, 0, guardBlend), lerp(60, 88, guardBlend), lerp(-15, 0, guardBlend));
      }
    },
  };
}
