// 戦う人の仮の見た目：関節で動く人形（箱と円柱）と、手に持つ武器。
// 動き（歩く・振る・突く・構える・弓を引く・ひるむ・倒れる）はコードで付ける。
// キャラの 3D モデル（骨と動き）ができたら、ここを差し替える。戦闘の計算（game/combat.js）は変えなくてよい
import * as pc from 'playcanvas';
import { WEAPONS } from '../game/data.js';
import { createWeaponModel, createShieldModel } from './weapons.js';

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

export function createFighterView(app, fighter, terrain) {
  const base = new pc.Color().fromString(fighter.color);
  const cloth = new pc.StandardMaterial();
  cloth.diffuse = base;
  cloth.gloss = 0.3;
  cloth.update();
  const skin = new pc.StandardMaterial();
  skin.diffuse = new pc.Color(0.78, 0.6, 0.48);
  skin.gloss = 0.25;
  skin.update();
  const dark = new pc.StandardMaterial();
  dark.diffuse = new pc.Color(base.r * 0.35, base.g * 0.35, base.b * 0.35);
  dark.update();
  const materials = [cloth, skin, dark];
  for (const m of materials) { m.emissive = new pc.Color(0.8, 0.1, 0.05); m.emissiveIntensity = 0; m.update(); }

  const node = (name, parent, pos) => {
    const e = new pc.Entity(name);
    e.setLocalPosition(...pos);
    parent.addChild(e);
    return e;
  };
  const shape = (parent, type, m, pos, scale) => {
    const e = new pc.Entity();
    e.addComponent('render', { type, material: m, castShadows: true, receiveShadows: true });
    e.setLocalPosition(...pos);
    e.setLocalScale(...scale);
    parent.addChild(e);
    return e;
  };

  // 骨組み：腰 → 胴 → 頭・肩 → 肘 → 手、腰 → 股 → 膝
  const root = new pc.Entity(`fighter-${fighter.id}`);
  const hips = node('hips', root, [0, 0.95, 0]);
  shape(hips, 'box', dark, [0, 0, 0], [0.36, 0.16, 0.22]);
  const torso = node('torso', hips, [0, 0.08, 0]);
  shape(torso, 'box', cloth, [0, 0.27, 0], [0.42, 0.52, 0.24]);
  const head = node('head', torso, [0, 0.62, 0]);
  shape(head, 'sphere', skin, [0, 0.1, 0], [0.22, 0.26, 0.24]);
  shape(head, 'sphere', dark, [0, 0.16, 0.035], [0.235, 0.2, 0.24]);  // 髪（頭の後ろ寄り。向きが分かるように）

  const arm = (side) => {
    const shoulder = node(`shoulder${side}`, torso, [side * 0.27, 0.48, 0]);
    shape(shoulder, 'cylinder', cloth, [0, -0.15, 0], [0.11, 0.3, 0.11]);
    const elbow = node(`elbow${side}`, shoulder, [0, -0.3, 0]);
    shape(elbow, 'cylinder', skin, [0, -0.13, 0], [0.09, 0.27, 0.09]);
    const hand = node(`hand${side}`, elbow, [0, -0.28, 0]);
    shape(hand, 'sphere', skin, [0, 0, 0], [0.09, 0.09, 0.09]);
    return { shoulder, elbow, hand };
  };
  const leg = (side) => {
    const hip = node(`hip${side}`, hips, [side * 0.11, -0.06, 0]);
    shape(hip, 'cylinder', dark, [0, -0.22, 0], [0.14, 0.44, 0.14]);
    const knee = node(`knee${side}`, hip, [0, -0.44, 0]);
    shape(knee, 'cylinder', dark, [0, -0.22, 0], [0.12, 0.44, 0.12]);
    shape(knee, 'box', dark, [0, -0.44, -0.05], [0.12, 0.06, 0.22]); // 足
    return { hip, knee };
  };
  const R = arm(1), L = arm(-1), legR = leg(1), legL = leg(-1);

  // 武器と盾
  const w = WEAPONS[fighter.weapon];
  const weapon = createWeaponModel(fighter.weapon);
  if (w.kind === 'bow') {
    L.hand.addChild(weapon);             // 弓は左手
  } else {
    R.hand.addChild(weapon);
    if (fighter.weapon === 'spear') weapon.setLocalPosition(0, 0, 0.55); // 槍は後ろ寄りを持つ
  }
  if (fighter.shield) {
    const shield = createShieldModel();
    shield.setLocalPosition(-0.08, -0.12, 0);
    L.elbow.addChild(shield);
  }
  app.root.addChild(root);

  let groundY = terrain.heightAt(fighter.x, fighter.z), walk = 0, fall = 0, flashOn = false, guardBlend = 0;

  /** 関節の角度（度）をまとめて決める */
  function pose(p) {
    torso.setLocalEulerAngles(p.torsoX || 0, p.torsoY || 0, 0);
    R.shoulder.setLocalEulerAngles(p.rsX || 0, p.rsY || 0, p.rsZ || 0);
    R.elbow.setLocalEulerAngles(p.reX || 0, 0, 0);
    L.shoulder.setLocalEulerAngles(p.lsX || 0, p.lsY || 0, p.lsZ || 0);
    L.elbow.setLocalEulerAngles(p.leX || 0, 0, 0);
    legR.hip.setLocalEulerAngles(p.rhX || 0, 0, 0);
    legR.knee.setLocalEulerAngles(p.rkX || 0, 0, 0);
    legL.hip.setLocalEulerAngles(p.lhX || 0, 0, 0);
    legL.knee.setLocalEulerAngles(p.lkX || 0, 0, 0);
  }

  return {
    root,
    /** speed01：0〜1 の動きの大きさ（歩く揺れに使う） */
    update(dt, speed01 = 0) {
      const target = terrain.heightAt(fighter.x, fighter.z);
      groundY += (target - groundY) * Math.min(1, dt * 12);

      // 攻撃を受けた直後は赤く光る。発光の色は最初から持たせ、強さ（数値）だけを変える
      // （発光の有無を切り替えると、エンジンがシェーダーを作り直して一瞬止まるため）
      const flash = fighter.hitFlash > 0;
      if (flash !== flashOn) {
        flashOn = flash;
        for (const m of materials) { m.emissiveIntensity = flash ? 1 : 0; m.update(); }
      }

      if (!fighter.alive) {
        fall = Math.min(1, fall + dt * 1.8);
        root.setPosition(fighter.x, groundY + 0.15 * ease(fall), fighter.z);
        root.setEulerAngles(-88 * ease(fall), fighter.yaw, 0);
        pose({ rsX: 150 * fall, lsX: 150 * fall, rhX: 10, lhX: -5 });
        return;
      }
      root.setPosition(fighter.x, groundY, fighter.z);
      root.setEulerAngles(0, fighter.yaw, 0);

      // 歩き：脚と腕を交互に振る
      walk += dt * (4 + 6 * speed01) * (speed01 > 0.02 ? 1 : 0);
      const s = Math.sin(walk) * speed01;
      const p = {
        rhX: s * 35, rkX: Math.max(0, -Math.cos(walk)) * 40 * speed01,
        lhX: -s * 35, lkX: Math.max(0, Math.cos(walk)) * 40 * speed01,
        rsX: -s * 22, lsX: s * 22, reX: 15, leX: 15,
        torsoX: 4 * speed01,
      };
      // 構え（防御）：盾を前に上げる。盾が無いときは武器を体の前に横たえる
      guardBlend += ((fighter.guarding ? 1 : 0) - guardBlend) * Math.min(1, dt * 12);
      if (guardBlend > 0.01) {
        const g = guardBlend;
        if (fighter.shield) { p.lsX = lerp(p.lsX, 70, g); p.leX = lerp(p.leX, 70, g); p.lsY = lerp(0, -20, g); }
        else { p.rsX = lerp(p.rsX, 60, g); p.reX = lerp(p.reX, 60, g); p.rsY = lerp(0, 40, g); p.lsX = lerp(p.lsX, 55, g); p.leX = lerp(p.leX, 70, g); }
      }

      const a = fighter.action;
      if (w.kind === 'melee' && a?.kind === 'attack') {
        const t = a.t;
        if (fighter.weapon === 'spear') {
          // 突き：引いてから、腕を前へ伸ばす
          const pull = ease(Math.min(1, t / w.windup)), strike = ease(Math.min(1, Math.max(0, (t - w.windup) / 0.1)));
          const back = Math.max(0, (t - w.windup - 0.1) / w.recovery);
          const k = strike * (1 - ease(Math.min(1, back)));
          p.rsX = lerp(lerp(40, 20, pull), 88, k); p.reX = lerp(lerp(40, 110, pull), 5, k);
          p.lsX = lerp(55, 80, k); p.leX = lerp(60, 20, k);
          p.torsoY = lerp(lerp(0, 25, pull), -15, k);
        } else {
          // 斬り・打ち：右上へ振りかぶって、前へ振り下ろす
          const up = ease(Math.min(1, t / w.windup));
          const down = ease(Math.min(1, Math.max(0, (t - w.windup) / 0.12)));
          const back = ease(Math.min(1, Math.max(0, (t - w.windup - 0.12) / w.recovery)));
          const raise = lerp(up, 0, down);
          p.rsX = lerp(p.rsX, 160, raise) + down * (1 - back) * 70;
          p.rsZ = lerp(0, -25, raise);
          p.reX = lerp(15, 45, raise) + down * (1 - back) * -10;
          p.torsoY = lerp(0, 28, raise) - down * (1 - back) * 22;
          p.torsoX = (p.torsoX || 0) + down * (1 - back) * 12;
        }
      } else if (w.kind === 'bow') {
        // 弓：左腕を前へ伸ばし、右手で弦を引く。引いた割合で右肘が曲がる
        const drawing = a?.kind === 'draw';
        const k = drawing ? Math.min(1, a.t / w.drawTime) : 0;
        const hold = drawing || a?.kind === 'release' ? 1 : 0.3;
        const aim = Math.max(-40, Math.min(40, fighter.pitch || 0));
        p.lsX = lerp(p.lsX, 90 + aim, hold); p.leX = lerp(p.leX, 0, hold);
        p.rsX = lerp(p.rsX, 90 + aim, hold); p.reX = lerp(p.reX, 30 + 110 * k, hold);
        p.torsoY = lerp(0, 35, hold);
      }
      // ひるみ：のけぞる
      if (fighter.stun > 0) p.torsoX = (p.torsoX || 0) - 18 * Math.min(1, fighter.stun / 0.2);
      pose(p);
    },
    setVisible(v) { root.enabled = v; },
  };
}
