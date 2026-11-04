// bot の目と耳（計算だけ。PlayCanvas に依存しない）
//   目：前の 120 度の中で、キャラの見える距離（data.js の CHARACTERS の sight）まで。
//       相手の体の点（立つ・しゃがむ・伏せるで形が変わる）へ、目から線を引き、半分以上が直接見えれば気づく
//       （家の壁・家具・木の幹・岩・柵・丘・大草原の背の高い草など、間に物があればその点は見えない。game/sight.js）
//   耳：音が届く距離の中にいれば聞こえる。足音（走る＞歩く。しゃがむ・伏せると小さい。鎧が重いほど大きい）と、
//       振る・当たる・回避・弓・箱を開ける・拾う・作る・探す・隠れる の音
import { CHARACTERS, SENSES, STANCES } from './data.js';
import { stanceShape } from './stance.js';

const DEG = Math.PI / 180;
// 立った体・しゃがんだ体の点：[高さの割合, 横幅（片側 m）]。横幅 0 は真ん中だけ、それ以外は真ん中と左右
const ROWS = [[0.07, 0], [0.3, 0.13], [0.52, 0.2], [0.74, 0.22], [0.93, 0]];
// 伏せた体の点：[体の向きに沿って（前が頭）, 高さ, 横]
const PRONE = [[0.75, 0.32, 0], [0.45, 0.28, 0.18], [0.45, 0.28, -0.18], [0.1, 0.3, 0], [0.1, 0.25, 0.2], [0.1, 0.25, -0.2],
  [-0.3, 0.2, 0.15], [-0.3, 0.2, -0.15], [-0.75, 0.12, 0.1], [-0.75, 0.12, -0.1]];

/**
 * @param {{ sight: object, heightAt: Function }} opt sight：視線をさえぎる物（game/sight.js。無ければ何にもさえぎられない）
 */
export function createSenses({ sight = null, heightAt }) {
  const noises = [];   // 鳴った音 { f（鳴らした人）, x, y, z, r（届く距離）, age }
  const yOf = (f) => f.y ?? heightAt(f.x, f.z);

  /** 相手 t の体の点（見る人 from から見た横幅で並べる） */
  function bodyPoints(t, from) {
    const g = yOf(t), sh = stanceShape(t);
    const pts = [];
    if (sh.prone > 0.5) {
      const a = t.yaw * DEG, fx = -Math.sin(a), fz = -Math.cos(a);   // 体の向き（頭の側）
      for (const [u, h, w] of PRONE) pts.push([t.x + fx * u - fz * w, g + h, t.z + fz * u + fx * w]);
      return pts;
    }
    const dx = t.x - from.x, dz = t.z - from.z, dl = Math.hypot(dx, dz) || 1;
    const lx = -dz / dl, lz = dx / dl;
    for (const [k, w] of ROWS) {
      const y = g + sh.height * k;
      pts.push([t.x, y, t.z]);
      if (w > 0) { pts.push([t.x + lx * w, y, t.z + lz * w]); pts.push([t.x - lx * w, y, t.z - lz * w]); }
    }
    return pts;
  }

  /** 目の位置 */
  const eyeOf = (f) => [f.x, yOf(f) + stanceShape(f).eye, f.z];

  /**
   * viewer は target に目で気づくか（前の 120 度・見える距離・体の半分以上が直接見える）
   * @param {{ ignoreHidden?: boolean }} [opt] ignoreHidden：隠れようとしている所でも数える（隠れるところを見たか）
   */
  function canSee(viewer, target, { ignoreHidden = false } = {}) {
    if (!target.alive || (target.hidden && !ignoreHidden) || target === viewer) return false;
    const dx = target.x - viewer.x, dz = target.z - viewer.z, d = Math.hypot(dx, dz);
    const reach = CHARACTERS[viewer.char]?.sight ?? 40;
    if (d > reach) return false;
    if (d > 0.3) {
      const a = viewer.yaw * DEG;
      const cos = (-Math.sin(a) * dx - Math.cos(a) * dz) / d;   // 前（-Z を向きで回したもの）との角度
      if (cos < Math.cos((SENSES.fov / 2) * DEG)) return false;
    }
    if (!sight) return true;
    const eye = eyeOf(viewer), pts = bodyPoints(target, viewer);
    const need = Math.ceil(pts.length * SENSES.visible);
    let seen = 0, hidden = 0;
    for (const q of pts) {
      if (sight.blocked(eye, q)) { if (++hidden > pts.length - need) return false; }
      else if (++seen >= need) return true;
    }
    return seen >= need;
  }

  /** 足音が届く距離（m）。止まっていれば 0 */
  function stepRadius(t) {
    if (!t.alive || t.hidden || !t.gait || t.gait === 'still') return 0;
    return (SENSES.steps[t.gait] || 0) * STANCES[t.stance || 'stand'].noise * (SENSES.weight[t.weight] ?? 1);
  }

  return {
    canSee,
    stepRadius,
    bodyPoints,
    /** 音を鳴らす（kind は SENSES.noise の名前か、届く距離 m） */
    noise(f, kind, at = null) {
      const r = typeof kind === 'number' ? kind : SENSES.noise[kind] || 0;
      if (!r || !f) return;
      const p = at || f;
      noises.push({ f, x: p.x, y: p.y ?? yOf(p), z: p.z, r, age: 0 });
    },
    /** 毎フレーム：古い音を消す（bot は 0.15〜0.3 秒ごとに耳を澄ますので、少し残す） */
    update(dt) {
      for (let i = noises.length - 1; i >= 0; i--) if ((noises[i].age += dt) > 0.4) noises.splice(i, 1);
    },
    /** listener に今聞こえる音：[{ f, x, y, z }]（自分の音は除く） */
    hear(listener, fighters) {
      const out = [];
      for (const n of noises) {
        if (n.f === listener || !n.f.alive) continue;
        if (Math.hypot(n.x - listener.x, n.z - listener.z) <= n.r) out.push(n);
      }
      for (const t of fighters) {
        if (t === listener) continue;
        const r = stepRadius(t);
        if (r > 0 && Math.hypot(t.x - listener.x, t.z - listener.z) <= r) out.push({ f: t, x: t.x, y: yOf(t), z: t.z });
      }
      return out;
    },
  };
}
