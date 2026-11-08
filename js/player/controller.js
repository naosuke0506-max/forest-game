// プレイヤーの移動と視点：入力を受けて歩き、地面の高さに合わせ、木や岩を避けて、歩ける範囲の外へ出ない。
// 視点は一人称（目の位置）と三人称（右肩越しの後ろ）を切り替えられる。
// 見回す（なぞる）と首だけが動く（首の範囲まで）。体の向きは、向きを変えるスティックでだけ変わる：
// 倒した向き（上＝今の正面・右＝右 90 度・下＝真後ろ）へ、首が先に向き、体はその場で足踏みしながら回る（指を離しても回りきる）
import * as pc from 'playcanvas';
import { BODY_TURN } from '../game/data.js';

const wrapDeg = (a) => ((a + 540) % 360) - 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TURN_LOOK = 0.12;   // 向きを変え始めるとき、首だけが先に向く時間（秒）

// 三人称のカメラ：頭の少し上を中心に、後ろへ THIRD_DIST、右へ THIRD_SIDE
const THIRD_DIST = 3.4, THIRD_SIDE = 0.55, THIRD_PIVOT = 1.7;

export function createPlayer(app, config, terrain, obstacles, fogColor) {
  const p = config.player;

  // 体（左右の向き）と目（上下の向き）を分ける
  const body = new pc.Entity('Player');
  const eye = new pc.Entity('Eye');
  eye.addComponent('camera', {
    fov: p.fov,
    nearClip: 0.05,   // 一人称で自分の腕や盾が目の近くに来ても切れないように（0.1 では肩や前腕の手前が欠ける）
    farClip: config.atmosphere.farClip,
    clearColor: fogColor,
    toneMapping: pc.TONEMAP_ACES,
    gammaCorrection: pc.GAMMA_SRGB,
  });
  eye.setLocalPosition(0, p.eyeHeight, 0);
  body.addChild(eye);
  app.root.addChild(body);

  const pos = { x: 0, z: 2, y: undefined };   // y：足の高さ（家の二階などの床に乗っているとき、地面より高い）
  // 立てる高さ：地面のほかに、家の床や階段（world/floors.js）。setGround で差し替える
  let groundAt = (x, z) => terrain.heightAt(x, z);
  let yaw = 200, pitch = -2, groundY = terrain.heightAt(pos.x, pos.z), bob = 0, lastMag = 0;
  let headYaw = 0;                      // 首の向き（体の向きからの左右。度。左が正）
  const turn = { target: null, latched: false, base: 0, wait: 0 };   // 向きを変えるスティック：向かう体の向き・倒し始めた時の向き
  const qHead = new pc.Quat(), qPitch = new pc.Quat(), qEye = new pc.Quat();
  let viewMode = 'first';               // first / third
  let areaRadius = config.world.playRadius;
  let frozen = false;                   // 脱落したら動かない
  let hide = null;                      // 隠れている所（ベッドの下・タンスの中）。動けず、家具の上の少し後ろから見る（三人称）
  let cover = null;                     // 壁裏隠れ：{ x, y, z（足もと）, nx, nz（壁から外への向き）, px, pz（覗く向き） }。三人称で壁に沿って見る
  let coverYaw = 0, coverPitch = 0;     // 壁裏隠れの間に見回した分（度）
  let thirdDist = THIRD_DIST;           // 三人称のカメラの距離（地面に当たると縮める）

  let eyeH = p.eyeHeight, eyeWant = p.eyeHeight;   // 目の高さ（しゃがむ・伏せると低い。なめらかに変える）
  let eyeOff = null;                    // 一人称で自分の体を映すときの目の位置（体の向きの座標。模型の頭から決める）
  function speedFor(mag) {
    // 半分ほど倒すと歩き、端まで倒すと走る（しゃがむ・伏せているときは走れない：歩きの速さまで）
    if (api.noRun) return p.walkSpeed * Math.min(1, mag / 0.75);
    if (mag <= 0.75) return p.walkSpeed * (mag / 0.75);
    return p.walkSpeed + (p.runSpeed - p.walkSpeed) * ((mag - 0.75) / 0.25);
  }

  const camV = new pc.Vec3(), lookV = new pc.Vec3();
  function placeCamera(mag) {
    if (hide) {   // 隠れている：家具の上の少し後ろから、外の向きを見る（三人称）
      eye.setLocalPosition(0, hide.camH, 0);
      eye.setLocalEulerAngles(pitch, 0, 0);
      return;
    }
    if (cover) {
      // 壁裏隠れ：体の前の斜め（覗く向きの反対側）から、覗く向きへ壁に沿って見る。見回した分だけ回す
      // （体が画面の端寄りに入るよう、覗く向きの反対側の斜め前に置き、体の横を通して覗く向きを見る）
      const c = cover, up = 1.5;
      camV.set(c.x + c.nx * 1.2 - c.px * 1.6, c.y + up, c.z + c.nz * 1.2 - c.pz * 1.6);
      let lx = c.px * 3.1 - c.nx * 0.8, lz = c.pz * 3.1 - c.nz * 0.8, ly = 1.0 - up;
      const a = (coverYaw * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      const rx = lx * ca + lz * sa, rz = -lx * sa + lz * ca;
      const hl = Math.hypot(rx, rz);
      ly += Math.tan((coverPitch * Math.PI) / 180) * hl;
      lookV.set(camV.x + rx, camV.y + ly, camV.z + rz);
      eye.setPosition(camV);
      eye.lookAt(lookV);
      return;
    }
    if (viewMode === 'first') {
      // 自分の体を映すときは、模型の目の位置（歩く・しゃがむ・前転で頭が動けば一緒に動く）。無ければ決まった高さと揺れ
      if (eyeOff) eye.setLocalPosition(eyeOff.x, eyeOff.y, eyeOff.z);
      else eye.setLocalPosition(0, eyeH + Math.sin(bob) * 0.025 * Math.min(1, mag * 1.5), 0);
      eye.setLocalRotation(headRotation());
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
    // 首の向いている方を、後ろから見る（体の座標で首の分だけ回す）
    const h = (headYaw * Math.PI) / 180, lx = THIRD_SIDE, lz = Math.cos(pr) * thirdDist;
    eye.setLocalPosition(lx * Math.cos(h) + lz * Math.sin(h), THIRD_PIVOT - Math.sin(pr) * thirdDist, -lx * Math.sin(h) + lz * Math.cos(h));
    eye.setLocalRotation(headRotation());
  }

  /** 目の向き：体の向きから、首の左右（headYaw）と上下（pitch） */
  function headRotation() {
    qHead.setFromAxisAngle(pc.Vec3.UP, headYaw);
    qPitch.setFromAxisAngle(pc.Vec3.RIGHT, pitch);
    return qEye.mul2(qHead, qPitch);
  }

  /** 向きを変えるスティック（turnX 右・turnY 上）。首が先に向き、体は決まった速さでその場で回る */
  function updateTurn(dt, input) {
    const tx = input.turnX || 0, ty = input.turnY || 0;
    if (Math.hypot(tx, ty) > 0.35) {
      if (!turn.latched) { turn.latched = true; turn.base = yaw; turn.wait = TURN_LOOK; }
      turn.target = turn.base - (Math.atan2(tx, ty) * 180) / Math.PI;   // 右へ倒すと右回り（向きの角度は左が正）
    } else turn.latched = false;
    if (turn.target === null) return;
    const rem = wrapDeg(turn.target - yaw);
    turn.wait -= dt;
    let stepY = 0;
    if (turn.wait <= 0) {
      const sp = (api.turnSpeed || BODY_TURN.turn.medium) * (api.turnScale ?? 1) * dt;
      stepY = Math.sign(rem) * Math.min(Math.abs(rem), sp);
      yaw += stepY;
    }
    // 首：回る向きを先に見る（首の範囲まで）。体が回るほど正面へ戻る
    const want = clamp(rem - stepY, -BODY_TURN.neckYaw, BODY_TURN.neckYaw);
    const hs = BODY_TURN.headSpeed * dt;
    headYaw += clamp(want - headYaw, -hs, hs);
    if (Math.abs(rem - stepY) < 0.5 && Math.abs(headYaw) < 0.5 && !turn.latched) turn.target = null;
  }

  function update(dt, input) {
    dt = Math.min(dt, 0.1); // 裏から戻った直後などの大きな飛びを抑える
    if (frozen) input = { moveX: 0, moveY: 0, lookX: input.lookX, lookY: input.lookY };

    eyeH += (eyeWant - eyeH) * Math.min(1, dt * 9);
    if (hide) {
      yaw -= input.lookX;
      pitch = Math.max(-p.pitchLimit, Math.min(p.pitchLimit, pitch - input.lookY));
      // 隠れている間は、外を見る向きの左右 50 度・上下の決まった範囲だけ見回せる。動かない
      const c = hide.yaw + 180;   // 外を見る向き（プレイヤーの向きの約束は -Z が前）
      const dy = ((yaw - c + 540) % 360) - 180;
      yaw = c + Math.max(-50, Math.min(50, dy));
      pitch = Math.max(hide.pitchMin, Math.min(hide.pitchMax, pitch));
      body.setPosition(hide.camX, hide.y, hide.camZ);
      body.setEulerAngles(0, yaw, 0);
      placeCamera(0);
      return;
    }
    // 見回す：首だけが動く（首の範囲まで。体の向きは変えない）。向きを変えるのはスティックだけ
    headYaw = clamp(headYaw - input.lookX, -BODY_TURN.neckYaw, BODY_TURN.neckYaw);
    pitch = clamp(pitch - input.lookY, -BODY_TURN.neckDown, BODY_TURN.neckUp);
    if (cover) {
      // 壁裏隠れ：体は動かさない（壁に沿った横歩きは試合の計算が動かす）。見回すのはカメラだけ
      coverYaw = Math.max(-55, Math.min(55, coverYaw - input.lookX));
      coverPitch = Math.max(-35, Math.min(20, coverPitch - input.lookY));
      pos.x = cover.x; pos.z = cover.z; pos.y = cover.y; groundY = cover.y;
      body.setPosition(cover.x, cover.y, cover.z);
      placeCamera(0);
      return;
    }

    if (!frozen) updateTurn(dt, input);
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

    // 地面（床）の高さへなめらかに合わせる（段差でカメラががくっとしないように）
    const target = groundAt(pos.x, pos.z, pos.y);
    pos.y = target;
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
    noRun: false,   // しゃがむ・伏せているときは走れない
    /** 目の高さ（m。しゃがむ・伏せると低い。なめらかに移る） */
    setEyeHeight(h) { eyeWant = h; },
    /** 一人称の目の位置（体の向きの座標 {x, y, z}。前は -Z）。null で決まった高さに戻す */
    setEyeOffset(v) { eyeOff = v; },
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get moving() { return lastMag; },
    get viewMode() { return viewMode; },
    setViewMode(mode) { viewMode = mode === 'third' ? 'third' : 'first'; thirdDist = THIRD_DIST; placeCamera(0); },
    /** 首の向き（体の向きからの左右。度。左が正） */
    get headYaw() { return headYaw; },
    /** その場で回る速さ（度/秒。鎧の重さ）と、その倍率（ひるんでいる間は遅い） */
    turnSpeed: BODY_TURN.turn.medium,
    turnScale: 1,
    setAreaRadius(r) { areaRadius = r; },
    /** 隠れる（ベッドの下・タンスの中）：三人称。家具の上の少し後ろから、外を見る向きを見る。null で解除 */
    setHide(spot) {
      if (!spot) { hide = null; return; }
      const a = (spot.yaw * Math.PI) / 180;   // 外を見る向き（0 で +Z）
      hide = { ...spot, camX: spot.x - Math.sin(a) * 0.15, camZ: spot.z - Math.cos(a) * 0.15, camH: spot.kind === 'bed' ? 1.35 : 2.35,
        pitchMin: -55, pitchMax: 8 };
      pos.x = spot.x; pos.z = spot.z; pos.y = spot.y; groundY = spot.y;
      yaw = spot.yaw + 180; pitch = -20;
      update(0, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
    },
    /** 隠れ場所から出た：x, z, y に立ち、yaw を向く */
    leaveHide(x, z, y, faceYaw) {
      hide = null;
      pos.x = x; pos.z = z; pos.y = y; groundY = y;
      if (faceYaw !== undefined) yaw = faceYaw;
      headYaw = 0; turn.target = null;
      update(0, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
    },
    get hidden() { return !!hide; },
    /**
     * 壁裏隠れ（三人称）：c = { x, y, z, nx, nz, px, pz }。毎フレーム今の位置と覗く向きを渡す。null で解除（そのとき、壁から離れた所に立つ）
     */
    setCover(c) {
      if (!c) {
        if (!cover) return;
        const was = cover; cover = null;
        pos.x = was.x + was.nx * 0.2; pos.z = was.z + was.nz * 0.2;
        yaw = (Math.atan2(-was.nx, -was.nz) * 180) / Math.PI; pitch = -2; headYaw = 0; turn.target = null;
        update(0, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
        return;
      }
      if (!cover) { coverYaw = 0; coverPitch = -6; }
      cover = c;
    },
    get inCover() { return !!cover; },
    /** 立てる高さを決める仕組み（家の床と階段）を使う */
    setGround(fn) { groundAt = fn; pos.y = fn(pos.x, pos.z, null); groundY = pos.y; },
    setFrozen(v) { frozen = v; },
    /** 観戦：見ている人の位置と向きにカメラを合わせる（三人称にする） */
    setPose(x, z, faceYaw, y) {
      pos.x = x; pos.z = z; yaw = faceYaw; if (y !== undefined) pos.y = y;
      if (viewMode !== 'third') { viewMode = 'third'; thirdDist = THIRD_DIST; }
    },
    /** 向きと上下の角度を直接決める（確認用） */
    setLook(faceYaw, facePitch) { yaw = faceYaw; headYaw = 0; turn.target = null; pitch = Math.max(-p.pitchLimit, Math.min(p.pitchLimit, facePitch)); },
    /** 出現する場所と向き */
    spawn(x, z, faceYaw) {
      pos.x = x; pos.z = z; yaw = faceYaw; pitch = -2; headYaw = 0; turn.target = null;
      pos.y = groundAt(x, z, null);
      groundY = pos.y;
      update(0, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
    },
  };
  update(0, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
  return api;
}
