// 一人称で画面の手前に見える、自分の武器と盾。カメラの子にして、行動に合わせて動かす
import * as pc from 'playcanvas';
import { WEAPONS } from '../game/data.js';
import { attackStats } from '../game/combat.js';
import { createWeaponModel, createShieldModel, createArrowModel } from './weapons.js';

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// 技（片手劍・長劍。game/data.js の TECHNIQUES）の手元の通り道：[時刻（秒）, 位置, 角度]。最初は構え（REST）から、最後は構えへ戻る。
// 当たる時刻に振り抜いた所へ来るようにしてある。溜めは CHARGE の姿で止め、溜攻撃 2 を待つ間は C2_READY の姿で止める
const P = {
  lowLeft: [[-0.28, -0.44, -0.55], [58, -32, 32]],    // 左下へ振り抜いた所
  upRight: [[0.42, 0.06, -0.45], [-50, 20, -40]],     // 右上へ振り上げた所
  left: [[-0.45, -0.2, -0.5], [10, -60, 82]],         // 左へ水平に
  right: [[0.5, -0.15, -0.45], [10, 65, -82]],        // 右へ水平に
  overhead: [[0.12, 0.26, -0.32], [-82, 4, -6]],      // 頭上
};
const PATHS = {
  oh_thrust: [[0.14, [0.34, -0.3, -0.3], [6, 6, -4]], [0.24, [0.17, -0.24, -0.74], [7, 15, 0]], [0.4, [0.2, -0.25, -0.68], [8, 14, -2]]],   // 右下から画面の真ん中へ斜めに突く（真っ直ぐ奥へ伸ばすと柄しか見えない）
  oh_rise: [[0.13, ...P.lowLeft], [0.26, ...P.upRight], [0.4, [0.38, 0.0, -0.48], [-40, 18, -36]]],
  oh_c1_out: [[0.16, ...P.lowLeft], [0.4, ...P.lowLeft]],
  oh_c2: [[0.4, ...P.left], [0.54, ...P.right], [0.85, [0.45, 0.02, -0.4], [-22, 70, -60]], [1.2, ...P.left], [1.35, ...P.lowLeft]],
  ls_cut1: [[0.22, ...P.overhead], [0.34, [0.05, -0.45, -0.72], [72, 0, 0]], [0.55, [0.06, -0.42, -0.7], [66, 0, 0]]],
  ls_cut2: [[0.22, ...P.right], [0.36, ...P.left], [0.55, [-0.4, -0.22, -0.55], [14, -55, 80]]],
  ls_c1_out: [[0.16, [0.17, -0.12, -0.8], [5, 14, -88]], [0.4, [0.19, -0.13, -0.74], [6, 13, -88]]],
  ls_c2: [[0.15, ...P.lowLeft], [0.3, ...P.upRight], [0.55, ...P.overhead], [0.78, ...P.lowLeft], [0.95, ...P.lowLeft]],
};
const CHARGE = { oh_c1_hold: [[0.46, 0.14, -0.3], [-72, 24, -44]], ls_c1_hold: [[0.3, 0.06, -0.3], [4, 8, -88]] };   // 溜めている姿（溜攻撃 1 はここから放つ）
const C2_READY = { armingsword: P.lowLeft, longsword: [[0.19, -0.13, -0.74], [6, 13, -88]] };   // 溜攻撃 2 を待つ姿（溜攻撃 1 の振り終わり）
/** 通り道の時刻 t の位置と角度（構え rest から始まり、終わり end に構えへ戻る） */
function onPath(keys, t, end, rest, from = rest) {
  const pts = [[0, ...from], ...keys, [end, ...rest]];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0] || i === pts.length - 1) {
      const [t0, p0, r0] = pts[i - 1], [t1, p1, r1] = pts[i];
      const k = ease(Math.min(1, Math.max(0, (t - t0) / Math.max(1e-3, t1 - t0))));
      return [lerp3(p0, p1, k), lerp3(r0, r1, k)];
    }
  }
  return [rest[0], rest[1]];
}

export function createViewModel(camera, fighter) {
  let w = WEAPONS[fighter.weapon];
  const root = new pc.Entity('viewmodel');
  camera.addChild(root);

  // 武器を持つ「手の位置」。ここを動かして振る
  const grip = new pc.Entity('grip');
  root.addChild(grip);
  // 手に持つ武器。持ち替え（弓兵の弓 ↔ ダガー）のときは作り直す
  let weapon = null, shownWeapon = null;
  function showWeapon(id) {
    weapon?.destroy();
    weapon = createWeaponModel(id, { shadows: false });
    grip.addChild(weapon);
    if (id === 'spear') weapon.setLocalPosition(0, 0, 0.7);
    shownWeapon = id;
    w = WEAPONS[id];
    REST = RESTS[id];
  }

  let shield = null;
  if (fighter.shield) {
    shield = createShieldModel({ shadows: false });
    root.addChild(shield);
  }
  const arrow = fighter.sidearm || w.kind === 'bow' ? createArrowModel() : null;
  if (arrow) { root.addChild(arrow); arrow.enabled = false; }

  let sway = 0, guardBlend = 0;

  // 構えの位置と角度（カメラから見て：右が +X、下が -Y、前が -Z）
  const RESTS = {
    armingsword: { pos: [0.32, -0.32, -0.55], rot: [12, 12, -8] },
    longsword: { pos: [0.3, -0.34, -0.55], rot: [12, 12, -8] },
    mace:      { pos: [0.34, -0.36, -0.55], rot: [18, 10, -10] },
    spear:     { pos: [0.28, -0.3, -0.45], rot: [4, 4, 0] },
    dagger:    { pos: [0.3, -0.3, -0.5], rot: [14, 10, -12] },
    longbow:   { pos: [-0.12, -0.12, -0.95], rot: [-90, 0, 12] },   // 弓は縦に立てる（模型は Z の向きに立っている）
  };
  let REST = null;
  showWeapon(fighter.weapon);

  return {
    setVisible(v) { root.enabled = v; },
    paused: false,   // 時間が止まっている間（刻が変わった直後）は揺れも動きも止める
    update(dt, moving) {
      if (!fighter.alive) { root.enabled = false; return; }
      if (this.paused) return;
      if (fighter.weapon !== shownWeapon) showWeapon(fighter.weapon);
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
        if (a?.kind === 'attack' && a.tech && PATHS[a.tech.clip]) {
          // 技：決めた通り道を通る（溜攻撃 1 は溜めた姿から、溜攻撃 2 は待っていた姿から始める）
          const from = a.name === 'charge' ? CHARGE[a.tech.hold] : a.name === 'charge2' ? C2_READY[fighter.weapon] : null;
          [pos, rot] = onPath(PATHS[a.tech.clip], a.t, a.tech.time, [pos, rot], from || [pos, rot]);
        } else if (a?.kind === 'charge' && CHARGE[a.tech.hold]) {
          // 溜め：振りかぶって止め、力を込めて小さく震える
          const [cp, cr] = CHARGE[a.tech.hold];
          const k = ease(Math.min(1, a.t / 0.33)), q = Math.sin(a.t * 47) * 0.004 * Math.min(1, a.t);
          pos = lerp3(pos, [cp[0] + q, cp[1] + q, cp[2]], k); rot = lerp3(rot, cr, k);
        } else if (a?.kind === 'charge2' && C2_READY[fighter.weapon]) {
          const [cp, cr] = C2_READY[fighter.weapon];
          const q = Math.sin(a.t * 47) * 0.004;
          pos = [cp[0] + q, cp[1] + q, cp[2]]; rot = [...cr];
        } else if (a?.kind === 'attack') {
          const t = a.t;
          const ws = attackStats(fighter.weapon, a.heavy);   // 強攻撃は振りかぶりが長い
          if (fighter.weapon === 'spear') {
            const pull = ease(Math.min(1, t / ws.windup));
            const thrust = ease(Math.min(1, Math.max(0, (t - ws.windup) / 0.08)));
            const back = ease(Math.min(1, Math.max(0, (t - ws.windup - 0.08) / ws.recovery)));
            pos[2] += pull * 0.12 - thrust * (1 - back) * 0.65;
            pos[0] -= thrust * (1 - back) * 0.12;
          } else {
            // 右上へ振りかぶって、左下へ振り抜く
            const up = ease(Math.min(1, t / ws.windup));
            const swing = ease(Math.min(1, Math.max(0, (t - ws.windup) / 0.12)));
            const back = ease(Math.min(1, Math.max(0, (t - ws.windup - 0.12) / ws.recovery)));
            const raised = [0.42, 0.05, -0.45], raisedRot = [-50, 20, -40];
            const done = [-0.25, -0.42, -0.55], doneRot = [55, -30, 30];
            let p2 = lerp3(pos, raised, up), r2 = lerp3(rot, raisedRot, up);
            p2 = lerp3(p2, done, swing); r2 = lerp3(r2, doneRot, swing);
            pos = lerp3(p2, pos, back); rot = lerp3(r2, rot, back);
          }
        }
        if (arrow) arrow.enabled = false;
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
