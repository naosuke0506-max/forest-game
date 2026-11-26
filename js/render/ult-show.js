// 必殺技の演出のうち、自分の画面だけの物（利用者の指示 2026-11-25「技の名前とカメラ・揺れ・閃光・ヒットストップ」。docs/DESIGN.md「必殺技」）：
//   自分が必殺技を出すと、カメラが前へ回り込んで英雄の顔を映し（寄る）、放つ瞬間に斜め上へ引いて衝撃波を見せ、元へ戻る。
//   その間は画面の上下に黒い帯、溜めの間は集中線、画面の下に英雄の色の筆の帯・紋・技の名前・属性の字。
//   放つ瞬間は閃光・大きな揺れ・ヒットストップ（人の動きだけ一瞬止める。試合の時間は止めない）。
//   ほかの人の必殺技は、近いほど画面が揺れ、近ければ閃光が少し（カメラは動かさない）。
//   3D の光・衝撃波・粒は render/ult-fx.js（みんなの画面に出る）
import * as pc from 'playcanvas';
import { ELEMENT_KINDS, CHARACTERS, ULT_SPECS } from '../game/data.js';
import { crestSvg } from '../ui/crests.js';

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** 筆で引いた帯の形（幅 1000・高さ 140 の枠。上下の縁がかすれ、左は細く入り、右は払う）。thick：太さの倍率 */
function brushPath(seed, thick = 1) {
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const top = [], bot = [];
  for (let i = 0; i <= 40; i++) {
    const x = i * 25, u = i / 40;
    const w = Math.min(1, u / 0.08) * (u > 0.86 ? Math.max(0.15, 1 - (u - 0.86) / 0.14) : 1);   // 入りは細く、終わりは払う
    const mid = 72 + Math.sin(u * 5.2 + seed) * 6;
    top.push([x, mid - (52 * w + rnd() * 7) * thick]);
    bot.push([x, mid + (46 * w + rnd() * 9) * thick]);
  }
  const pts = [...top, ...bot.reverse()];
  return `M${pts.map(([x, y]) => `${x.toFixed(0)} ${y.toFixed(1)}`).join(' L')} Z`;
}

/** 色を混ぜる（#rrggbb 2 つ、k：b の割合） */
export function mixColor(a, b, k) {
  const p = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(p(a, i) * (1 - k) + p(b, i) * k).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * @param {{ camera: pc.Entity, player: object, views: Map, me: object, heightAt: (x: number, z: number) => number }} o
 *   player.cameraClear(x, y, z, from)：カメラを置ける所か（壁・家具・岩に当たらないか。main.js）
 */
export function createUltShow({ camera, player, views, me, heightAt }) {
  // 画面の部品（index.html には置かず、ここで作る。#hud より上）
  const root = document.createElement('div');
  root.id = 'ultshow';
  root.className = 'ultshow';
  root.hidden = true;
  root.innerHTML = `<i class="us-bar top"></i><i class="us-bar bot"></i><div class="us-lines"></div>
    <div class="us-el"></div>
    <div class="us-band"><svg viewBox="0 0 1000 140" preserveAspectRatio="none"><defs><linearGradient id="us-grad" x1="0" x2="1">
      <stop offset="0" style="stop-color:var(--ud)"/><stop offset=".45" style="stop-color:var(--uc2)"/><stop offset="1" style="stop-color:var(--ud)"/></linearGradient></defs>
      <path class="us-ink" fill="url(#us-grad)"/><path class="us-shine" style="fill:var(--uc)"/></svg></div>
    <div class="us-crest"></div><div class="us-name"></div><div class="us-who"></div>`;
  document.body.appendChild(root);
  const flash = document.createElement('div');
  flash.className = 'ultflash';
  document.body.appendChild(flash);
  const $ = (s) => root.querySelector(s);

  // カメラ：play のときに 2 つの構図（寄り・引き）を決める。置けない所（壁の中など）なら、その構図は使わない
  let show = null;   // { f, t, time, at, close: {p, l} | null, wide: {p, l} | null }
  const shake = { a: 0, t: 0 };
  const vA = new pc.Vec3(), vB = new pc.Vec3(), vL = new pc.Vec3(), vL2 = new pc.Vec3();

  /**
   * 構図を探す：英雄の前（向きの前 fwd m・右 side m・高さ up m）に置き、look の高さを見る。
   * 置けなければ近づけ・反対の横・低くも試す。margin：カメラのまわり（左右・上・後ろ）にも、これだけ空きが要る
   * （壁や屋根にぴったり寄った所に置くと、画面の半分が壁や屋根になる）。カメラから英雄の腰が見えることも確かめる
   */
  function shot(f, fwd, side, up, look, margin, lookFwd = 0, span = 0) {
    const y = f.y ?? heightAt(f.x, f.z), a = (f.yaw * Math.PI) / 180;
    const Fx = -Math.sin(a), Fz = -Math.cos(a), Rx = Math.cos(a), Rz = -Math.sin(a);
    const head = [f.x, y + 1.5, f.z];
    const under = y < heightAt(f.x, f.z) - 1.5;   // 洞窟の中（上の地面とは比べない）
    // ほかの人の体のすぐそば（1.5 m より近く）には置かない（前は案山子のすぐ横に置かれ、画面の半分が体でふさがった）
    const nearBody = (px, py, pz) => { for (const o of views.keys()) if (o !== f && o.alive !== false && Math.hypot(o.x - px, o.z - pz) < 1.5 && py > (o.y ?? 0) - 0.5 && py < (o.y ?? 0) + 2.4) return true; return false; };
    // カメラ (px, pz) と英雄の間の線の近く（0.7 m）に、ほかの人の体があるか
    const bodyBetween = (px, pz, h) => {
      const sx = h.x - px, sz = h.z - pz, l2 = sx * sx + sz * sz || 1;
      for (const o of views.keys()) {
        if (o === h || o.alive === false) continue;
        const k = ((o.x - px) * sx + (o.z - pz) * sz) / l2;
        if (k <= 0.05 || k >= 0.95) continue;
        if (Math.hypot(px + sx * k - o.x, pz + sz * k - o.z) < 0.7) return true;
      }
      return false;
    };
    const ok = (px, py, pz, from) => (under || py > heightAt(px, pz) + 0.35) && !nearBody(px, py, pz) && (!player.cameraClear || player.cameraClear(px, py, pz, from));
    for (const k of [1, 0.8, 0.62]) {
      for (const sd of [side, -side]) {
        for (const uu of [up, up * 0.72]) {
          const px = f.x + Fx * fwd * k + Rx * sd * k, pz = f.z + Fz * fwd * k + Rz * sd * k, py = y + uu;
          if (!ok(px, py, pz, head)) continue;
          const around = [[Rx * margin, 0, Rz * margin], [-Rx * margin, 0, -Rz * margin], [0, margin * 0.8, 0], [Fx * margin, 0, Fz * margin]];
          if (!around.every(([ox, oy, oz]) => ok(px + ox, py + oy, pz + oz, head))) continue;
          const L = [f.x + Rx * sd * 0.12 + Fx * lookFwd, y + look, f.z + Rz * sd * 0.12 + Fz * lookFwd];   // lookFwd：英雄の前のこれだけ先を見る（肩越し・見下ろし）
          if (player.cameraClear && !player.cameraClear(f.x, y + 0.9, f.z, [px, py, pz])) continue;   // カメラから腰が見える
          if (bodyBetween(px, pz, f)) continue;   // カメラと英雄の間に、ほかの人の体がない（前は手前の案山子が英雄を隠した）
          // span：見る所の左右 span m まで見通せる（広く撮る構図で、手前の屋根や壁が画面の半分をふさがないように）
          if (span && player.cameraClear) {
            const vx = L[0] - px, vz = L[2] - pz, vl = Math.hypot(vx, vz) || 1, sx = -vz / vl, sz = vx / vl;
            if (![-1, 1].every((g) => player.cameraClear(L[0] + sx * span * g, y + 1.2, L[2] + sz * span * g, [px, py, pz]))) continue;
          }
          return { p: [px, py, pz], l: L };
        }
      }
    }
    return null;
  }

  // 構図の種類：close 前から顔（寄り）・wide 斜め上から引き・high 後ろの高い所から前を見下ろす（稲妻の道）・behind 肩越しに前を見る（大矢）・
  //   cross 踏み込む道の真ん中の横から（雷霆一閃の踏み込みが画面を横切る。後ろからだと、体がすぐ遠ざかって小さく映った）
  const SHOTS = {
    close: (f) => shot(f, 2.3, 0.8, 1.45, 1.38, 0.4),
    wide: (f) => shot(f, 5.6, 3.2, 3.5, 0.7, 1.3),
    high: (f) => shot(f, -8.5, 2.5, 8.5, 0.3, 1.0, 5),
    behind: (f) => shot(f, -3.2, 0.95, 1.85, 1.35, 0.5, 9),
    cross: (f) => { const d = (ULT_SPECS.sword.dash.dist || 11) / 2; return shot(f, d, 9.5, 2.6, 1.0, 0.8, d); },   // 少し高く遠く（低いと、手前の背の高い草で体が隠れた）
    // （後半 2026-11-26）vast 高く広く（千岩槍獄の岩の槍の輪・天門開闢の光の槍の雨）・jump 跳ぶ道の横の低い所から見上げる（紅蓮崩天）・
    //   under 前の低い所から見上げる（天門開闢の浮いた体と門）
    vast: (f) => shot(f, 8.5, 5, 7.5, 0.4, 1.3, 0, 4.5),
    jump: (f) => { const d = (ULT_SPECS.blunt?.jump.dist || 5) / 2; return shot(f, d, 6, 0.9, 2.4, 0.8, d, 3); },
    under: (f) => shot(f, 5.5, 1.8, 0.7, 4.2, 0.5),
    // rain：少し離れた低めの所から、頭上の光の門と地面の両方を（天門開闢の光の槍の雨。高く広くでは門が画面の外だった）
    rain: (f) => shot(f, 10, 3, 2.2, 4.6, 1.3, 0, 4.5),
  };
  /** 英雄ごとの構図の並び：[始まる秒, 種類]。まだ英雄ごとの技が無い人は、寄り → 放つ少し前に引き */
  function timeline(f, time, at) {
    const S = ULT_SPECS[f.char];
    if (f.char === 'sword' && S) return [[0, 'close'], [S.bolt.from - 0.05, 'high'], [S.stance, 'close'], [S.dash.at - 0.2, 'cross'], [S.strike.at - 0.06, 'wide']];
    if (f.char === 'archer' && S) return [[0, 'close'], [0.95, 'behind']];
    if (f.char === 'polearm' && S) return [[0, 'close'], [S.at - 0.14, 'wide'], [S.rings[1].at + 0.1, 'vast']];
    if (f.char === 'blunt' && S) return [[0, 'close'], [S.jump.from - 0.08, 'jump'], [S.at - 0.06, 'wide']];
    if (f.char === 'cleric' && S) return [[0, 'close'], [S.rise[1] - 0.2, 'under'], [S.rain.from + 0.15, 'rain'], [S.pillar.at - 0.12, 'wide']];
    return [[0, 'close'], [at - 0.12, 'wide']];
  }

  function setVars(f, U) {
    const E = ELEMENT_KINDS[U.element] || ELEMENT_KINDS.holy;
    for (const el of [root, flash]) {
      el.style.setProperty('--uc', E.color);
      el.style.setProperty('--ud', E.deep);
      el.style.setProperty('--uc2', mixColor(E.color, E.deep, 0.35));
    }
    return E;
  }

  return {
    /** 自分の必殺技が始まった（game/combat.js の 'ult'）。U：ULTIMATES の 1 つ、time・at：動きの長さと放つ時刻（秒） */
    play(f, U, { time, at }) {
      const E = setVars(f, U);
      // 構図は、その構図が始まる時の英雄の所と向きで決める（劍騎士は稲妻で動くので）
      show = { f, t: 0, k: 1, time, at, plan: timeline(f, time, at).map(([t0, kind]) => ({ t0, kind, pose: undefined })) };
      // 名前の帯：字を 1 つずつ（遅れて）出す
      $('.us-el').textContent = E.name;
      $('.us-crest').innerHTML = crestSvg(U.crest);
      $('.us-name').innerHTML = [...U.name].map((c, i) => `<span style="animation-delay:${(0.28 + i * 0.07).toFixed(2)}s">${c}</span>`).join('');
      $('.us-who').textContent = `${CHARACTERS[f.char]?.name || ''}　${E.name}`;
      const seed = Math.random() * 10;
      $('.us-ink').setAttribute('d', brushPath(seed));
      $('.us-shine').setAttribute('d', brushPath(seed + 3.1, 0.14));   // 帯の真ん中を走る明るい筋
      root.hidden = false;
      root.classList.remove('on', 'boom', 'out');
      void root.offsetWidth;   // 動きを最初から
      root.classList.add('on');
      document.body.classList.add('ult-cine');
      flash.classList.remove('on', 'big'); void flash.offsetWidth; flash.classList.add(f.char === 'sword' ? 'big' : 'on');   // 始まりの閃光（雷霆一閃は目くらましの大きな閃光）
    },
    /** 必殺技が放たれた（だれの物でも。'ultBurst'）。自分の物なら閃光・大きな揺れ・ヒットストップ。ほかの人の物は近いほど揺れる */
    burst(e) {
      const mine = e.fighter === me;
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      if (mine) {
        shake.a = Math.max(shake.a, 0.22);
        for (const v of views.values()) v.hitstop?.(0.11);
        root.classList.add('boom');
        setVars(e.fighter, e.ult);
        flash.classList.remove('on', 'big'); void flash.offsetWidth; flash.classList.add(e.strike ? 'on' : 'big');   // 雷霆一閃の最後の落雷は小さな閃光（始めに大きな閃光があるので、二度目は画面を白く飛ばさない）
      } else if (d < 40) {
        shake.a = Math.max(shake.a, 0.16 * (1 - d / 40) ** 1.5);
        if (d < 22) { setVars(e.fighter, e.ult); flash.classList.remove('on', 'big'); void flash.offsetWidth; flash.classList.add('on'); }
      }
    },
    /** 小さな手ごたえ（自分の稲妻が貫いた・踏み込みで斬った・大矢を放った）：stop 秒のヒットストップと揺れ */
    kick(stop = 0.06, a = 0.08) {
      shake.a = Math.max(shake.a, a);
      if (stop > 0) for (const v of views.values()) v.hitstop?.(stop);
    },
    /** やめる（自分が倒れた・試合が終わった） */
    cancel() {
      show = null;
      root.hidden = true;
      root.classList.remove('on', 'boom', 'out');
      document.body.classList.remove('ult-cine');
    },
    /** 寄るカメラの最中か（その間は一人称でも自分の体を全部映す。カメラが戻った後、名前の帯が消えるまでの間は false） */
    get active() { return !!show && (show.k ?? 1) > 0.001; },
    /** 毎フレーム：カメラを動かす（プレイヤーの操作がカメラを置いた後に呼ぶ） */
    update(dt) {
      let moved = false;
      if (show) {
        const S = show;
        S.t += dt;
        const { t, time, at } = S;
        if (t > time - 0.2 && !root.classList.contains('out')) root.classList.add('out');   // カメラが戻るのと合わせて帯を下げる
        if (t >= time + 0.3 || !S.f.alive) { this.cancel(); }
        else {
          // k：ふつうのカメラ → 演出のカメラ（始めに 0.28 秒で寄り、終わりの 0.55 秒で戻る）。s：寄り → 引き（放つ少し前に素早く）。
          // 一人称は、目が頭の中にあるので、寄る・戻るを滑らせると兜の中が映る：始めの閃光の裏で切り替え、終わりも一度に戻す
          const fp = player.viewMode !== 'third';
          const k = fp ? (t < time - 0.12 ? 1 : 0) : ease(t / 0.28) * (1 - ease((t - (time - 0.25)) / 0.55));
          S.k = k;
          // 今の構図と、ひとつ前の構図（0.16 秒で素早く移る）。置けない構図は、ひとつ前の構図のまま
          let cur = -1;
          for (let i = 0; i < S.plan.length; i++) if (t >= S.plan[i].t0) cur = i;
          const poseOf = (i) => {
            for (let j = i; j >= 0; j--) {
              const P = S.plan[j];
              if (P.pose === undefined) P.pose = SHOTS[P.kind](S.f);
              if (P.pose) return P;
            }
            return null;
          };
          const Pc = poseOf(cur), Pp = cur > 0 ? poseOf(cur - 1) : null;
          const cp = camera.getPosition(), fw = camera.forward;
          vL.set(cp.x + fw.x * 6, cp.y + fw.y * 6, cp.z + fw.z * 6);
          let px = cp.x, py = cp.y, pz = cp.z, lx = vL.x, ly = vL.y, lz = vL.z, w = 0;
          const at2 = (P) => {
            // 寄りの間は少しずつ前へ寄る
            const push = P.kind === 'close' ? Math.min(1, (t - P.t0) / 1.2) * 0.09 : 0;
            const C = P.pose;
            // 跳ぶ・浮く体（見た目の高さ lift）を追って見上げる。寄りはカメラも一緒に上がる
            const lift = S.f.lift || 0, up = P.kind === 'close' ? lift : 0;
            return [C.p[0] + (C.l[0] - C.p[0]) * push, C.p[1] + up + (C.l[1] - C.p[1]) * push, C.p[2] + (C.l[2] - C.p[2]) * push, [C.l[0], C.l[1] + lift, C.l[2]]];
          };
          if (Pc) {
            let [qx, qy, qz, L] = at2(Pc);
            if (Pp && Pp !== Pc) {
              const m = ease((t - Pc.t0) / 0.16);
              const [ox, oy, oz, Lo] = at2(Pp);
              qx = ox + (qx - ox) * m; qy = oy + (qy - oy) * m; qz = oz + (qz - oz) * m;
              L = [Lo[0] + (L[0] - Lo[0]) * m, Lo[1] + (L[1] - Lo[1]) * m, Lo[2] + (L[2] - Lo[2]) * m];
            }
            px += (qx - px) * k; py += (qy - py) * k; pz += (qz - pz) * k;
            lx += (L[0] - lx) * k; ly += (L[1] - ly) * k; lz += (L[2] - lz) * k;
            w = k;
          }
          if (w > 0.001) {
            vA.set(px, py, pz); vL2.set(lx, ly, lz);
            camera.setPosition(vA);
            camera.lookAt(vL2);
            moved = true;
          }
        }
      }
      // 揺れ：少しずつ収まる。位置を細かく揺らし、少し傾ける
      if (shake.a > 0.002) {
        shake.t += dt;
        shake.a *= Math.exp(-dt * 4.2);
        const a = shake.a, T = shake.t * 38;
        const p = camera.getPosition();
        vB.set(p.x + Math.sin(T * 1.3) * a * 0.6, p.y + Math.sin(T * 1.7 + 1) * a * 0.5, p.z + Math.cos(T * 1.1) * a * 0.6);
        camera.setPosition(vB);
        camera.rotateLocal(0, 0, Math.sin(T * 0.9) * a * 9);
        moved = true;
      } else shake.a = 0;
      return moved;
    },
    destroy() { root.remove(); flash.remove(); document.body.classList.remove('ult-cine'); },
  };
}
