// プレイヤーの移動と視点：入力を受けて歩き、地面の高さに合わせ、木や岩を避けて、歩ける範囲の外へ出ない。
// 視点は一人称（目の位置）と三人称（右肩越しの後ろ）を切り替えられる。
// 見回す（なぞる）と首だけが動く（首の範囲まで。体の向きは変わらない）。首が限界まで回ってから、さらに同じ向きへなぞったときだけ、
// 体がその場で足踏みしながら、見ている向きへ回る（回る速さは鎧の重さまで。体が向き直ると首は正面に戻る）
import * as pc from 'playcanvas';
import { BODY_TURN, SWIM, FALL, LADDER } from '../game/data.js';
import { wadeScale, diveY } from '../game/swim.js';
import { slopeSpeed, slopeAhead } from '../game/slope.js';
import { fallStep } from '../game/fall.js';

const wrapDeg = (a) => ((a + 540) % 360) - 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
  let look = yaw;                       // 見ている向き（左右。度。体の向き＋首の向き）。なぞった分だけ動く
  let twist = 0;                        // 暗殺などの動きの間、体（肩の線）が回った分（度）。目もそれに付いて回る（体と一緒に回る）
  let coverHead = 0;                    // 壁裏隠れの首の向きの元（覗く向きへ 62 度。覗く向きが変わるとなめらかに振り向く）
  const turn = { target: null, keyHeld: false };   // 体が向かっている向き（PC の Z・C で回すとき）。keyHeld：Z・C を押している
  const qHead = new pc.Quat(), qPitch = new pc.Quat(), qEye = new pc.Quat();
  let viewMode = 'first';               // first / third
  let areaRadius = config.world.playRadius;
  let frozen = false;                   // 脱落したら動かない
  let hide = null;                      // 隠れている所（ベッドの下・タンスの中）。動けず、家具の上の少し後ろから見る（三人称）
  let cover = null;                     // 壁裏隠れ：{ x, y, z（足もと）, nx, nz（壁から外への向き）, px, pz（覗く向き） }。三人称で壁に沿って見る
  let coverYaw = 0, coverPitch = 0;     // 壁裏隠れの間に見回した分（度）
  let thirdDist = THIRD_DIST;           // 三人称のカメラの距離（地面に当たると縮める）

  let eyeH = p.eyeHeight, eyeWant = p.eyeHeight;   // 目の高さ（しゃがむ・伏せると低い。なめらかに変える）
  let waterDepth = 0, waterSurface = null, swimming = false;   // 川（game/swim.js）：足もとの水の深さ・水面・泳いでいるか
  const fall = { y: 0, swimming: false, falling: false, fallV: 0, landed: 0, landedWater: false };   // 落ちる（天坑。game/fall.js）
  // 梯子（教会の隠し扉の縦穴。world/church.js の ladder）：{ L, phase（mount 掴まる・on 上り下り・offTop 上で降りる・offBottom 下で降りる）, t, dur, from, to, y, move }
  let ladder = null;
  const CLIMB = LADDER.speed;           // 梯子を上り下りする速さ（m/秒。game/data.js）
  let eyeOff = null;                    // 一人称で自分の体を映すときの目の位置（体の向きの座標。模型の頭から決める）
  function speedFor(mag) {
    // 全速力（疾驅ボタン。match-session.js が決める）：スティックを倒していれば、倒し方によらず全速力
    if (api.sprint) return api.sprintSpeed;
    // 半分ほど倒すと歩き、端まで倒すと走る（しゃがむ・伏せているときは走れない：歩きの速さまで）
    if (api.noRun) return p.walkSpeed * Math.min(1, mag / 0.75);
    if (mag <= 0.75) return p.walkSpeed * (mag / 0.75);
    return p.walkSpeed + (p.runSpeed - p.walkSpeed) * ((mag - 0.75) / 0.25);
  }

  const camV = new pc.Vec3(), lookV = new pc.Vec3();
  function placeCamera(mag) {
    if (hide) {
      // 隠れている（利用者の指示 2026-11-17：一人称はちゃんと一人称、三人称はちゃんと三人称）。
      //   一人称：家具の中の目の位置（タンスは扉の隙間の高さ、ベッドの下は床すれすれ）から外を覗く
      //   三人称：家具の上の少し前から、外の向きを見る。部屋の壁・天井の外へ出ないよう、目の位置からまっすぐ確かめて下げる
      if (viewMode === 'first') {
        eye.setLocalPosition(0, hide.eyeH, 0);
      } else {
        // 家具の前に立った所（出る所の頭の高さ）から、家具の上のカメラまでを確かめる。当たれば、立った所の方へ寄せる
        const fx = hide.outX, fy = hide.y + 1.6, fz = hide.outZ;
        let k = 1;
        for (let i = 0; i < 6 && api.cameraClear && !api.cameraClear(fx + (hide.camX - fx) * k, fy + (hide.y + hide.camH - fy) * k, fz + (hide.camZ - fz) * k, [fx, fy, fz]); i++) k *= 0.65;
        eye.setPosition(fx + (hide.camX - fx) * k, fy + (hide.y + hide.camH - fy) * k, fz + (hide.camZ - fz) * k);
      }
      eye.setLocalEulerAngles(pitch, 0, 0);
      return;
    }
    if (cover && viewMode === 'third') {
      // 壁裏隠れ（三人称で確かめるとき）：体の前の斜め（覗く向きの反対側）から、覗く向きへ壁に沿って見る。見回した分だけ回す
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
    // 地面や洞窟の岩に当たらない距離まで縮める（カメラの来る所の地面の高さと、api.cameraClear で確かめる）。
    // 2026-11-14：洞窟の中でカメラが壁や天井の外へ出て、外の地面が見えていた（利用者の指摘）。横へずらす分も、近いほど小さくする
    let d = want;
    const yr = (yaw * Math.PI) / 180, h = (headYaw * Math.PI) / 180;
    const sideAt = (dist) => THIRD_SIDE * Math.min(1, dist / (THIRD_DIST * 0.6));
    const localAt = (dist) => {
      const lx = sideAt(dist), lz = Math.cos(pr) * dist;
      return [lx * Math.cos(h) + lz * Math.sin(h), THIRD_PIVOT - Math.sin(pr) * dist, -lx * Math.sin(h) + lz * Math.cos(h)];
    };
    // 地面の下（洞窟の中）にいるときは、上の地面とは比べない（洞窟の岩は api.cameraClear が確かめる）
    // 利用者の指示（2026-11-17）：三人称のカメラは、建物や障害物を貫通せず、その中に留まる。
    //   api.cameraClear は、頭からカメラまでの線と、カメラのまわり（後ろ・左右・上へ少し出た所）まで、壁・床・屋根・家具・木の幹・岩に
    //   当たらないかを確かめる（カメラが壁にぴったり付くと、画面の端から壁の向こうが見えるため）。当たれば近づける
    const under = groundY < terrain.heightAt(pos.x, pos.z) - 1.5;
    const pivot = [pos.x, groundY + THIRD_PIVOT, pos.z];
    for (let k = 0; k < 12; k++) {
      const [ex, ey, ez] = localAt(d);
      const wx = pos.x + Math.cos(yr) * ex + Math.sin(yr) * ez;
      const wz = pos.z - Math.sin(yr) * ex + Math.cos(yr) * ez;
      if ((under || groundY + ey > terrain.heightAt(wx, wz) + 0.35) && (!api.cameraClear || api.cameraClear(wx, groundY + ey, wz, pivot))) break;
      d = k < 8 ? d * 0.78 : d * 0.6;
      if (d < 0.25) { d = 0.25; break; }
    }
    // 近づけるときはすぐに（岩の外が一瞬でも見えないように）、離すときはなめらかに
    thirdDist = d < thirdDist ? d : thirdDist + (d - thirdDist) * 0.12;
    // 首の向いている方を、後ろから見る（体の座標で首の分だけ回す）。
    // 暗殺などの動きで体（肩の線）が回った分（twist）は足さない：三人称は体を後ろから見るので、カメラまで横や後ろを向くと壁ばかり映る
    // （2026-11-17。利用者の指摘：タンスやベッドから暗殺する時の視点がおかしい。三人称はちゃんと三人称に）
    const [ex, ey, ez] = localAt(thirdDist);
    eye.setLocalPosition(ex, ey, ez);
    eye.setLocalRotation(headRotation(false));
  }

  /** 目の向き：体の向きから、首の左右（headYaw）と上下（pitch）。withTwist：動きで体が回った分も足す（一人称） */
  function headRotation(withTwist = true) {
    qHead.setFromAxisAngle(pc.Vec3.UP, headYaw + (withTwist ? twist : 0));
    qPitch.setFromAxisAngle(pc.Vec3.RIGHT, pitch);
    return qEye.mul2(qHead, qPitch);
  }

  /**
   * 見回す（なぞる）：なぞった分だけ、体の向きがそのまま変わる（利用者の指示 2026-11-13：全キャラ共通。視点の操作でキャラの向きが変わる）。
   * 左右の首は使わない（一人称の目は体の正面）。上下はなぞった分だけ（pitch）。PC の Z・C は、体が左・右へ 90 度回る（鎧の重さの速さで）
   */
  function updateLook(dt, input) {
    // 捕捉（ロックオン。match-session.js が lockAim に相手の胸の位置を入れる。2026-11-24）：スティックを動かさなくても、体が相手へ向く
    // （回る速さは鎧の重さ。turnSpeed）。左右になぞっても向きは変わらない（上下は首。update の pitch）
    const L = api.lockAim;
    if (L) {
      const dx = L.x - pos.x, dz = L.z - pos.z;
      if (Math.hypot(dx, dz) > 0.25) {
        const want = (Math.atan2(-dx, -dz) * 180) / Math.PI, rem = wrapDeg(want - yaw);
        const sp = (api.turnSpeed || BODY_TURN.turn.medium) * (api.turnScale ?? 1) * dt;
        yaw += Math.sign(rem) * Math.min(Math.abs(rem), sp);
      }
      turn.target = null; turn.keyHeld = !!input.turnX;
      headYaw = 0;
      look = yaw;
      return;
    }
    const key = input.turnX || 0;
    if (key && !turn.keyHeld) turn.target = (turn.target ?? yaw) - key * 90;
    turn.keyHeld = !!key;
    yaw -= input.lookX;
    if (turn.target !== null) {
      turn.target -= input.lookX;
      const rem = wrapDeg(turn.target - yaw);
      const sp = (api.turnSpeed || BODY_TURN.turn.medium) * (api.turnScale ?? 1) * dt;
      yaw += Math.sign(rem) * Math.min(Math.abs(rem), sp);
      if (Math.abs(wrapDeg(turn.target - yaw)) < 0.5) turn.target = null;
    }
    headYaw = 0;
    look = yaw;
  }

  function update(dt, input) {
    dt = Math.min(dt, 0.1); // 裏から戻った直後などの大きな飛びを抑える
    if (frozen) input = { moveX: 0, moveY: 0, lookX: input.lookX, lookY: input.lookY };

    eyeH += (eyeWant - eyeH) * Math.min(1, dt * 9);
    if (hide) {
      headYaw = 0; twist = 0;   // 隠れている間の目は、外を見る向き（yaw）だけで決まる
      yaw -= input.lookX;
      pitch = Math.max(-p.pitchLimit, Math.min(p.pitchLimit, pitch - input.lookY));
      // 隠れている間は、外を見る向きの左右 50 度・上下の決まった範囲だけ見回せる。動かない
      const c = hide.yaw + 180;   // 外を見る向き（プレイヤーの向きの約束は -Z が前）
      const dy = ((yaw - c + 540) % 360) - 180;
      yaw = c + Math.max(-50, Math.min(50, dy));
      const first = viewMode === 'first';
      pitch = Math.max(first ? hide.fpMin : hide.pitchMin, Math.min(first ? hide.fpMax : hide.pitchMax, pitch));
      if (first) body.setPosition(hide.eyeX, hide.y, hide.eyeZ);   // 一人称：家具の中の目の真下
      else body.setPosition(hide.camX, hide.y, hide.camZ);
      body.setEulerAngles(0, yaw, 0);
      placeCamera(0);
      return;
    }
    // 上下：首と上体で（首の範囲まで）。捕捉している間は、相手の胸の高さへ自動で向く
    if (api.lockAim && !frozen) {
      const L = api.lockAim, d = Math.hypot(L.x - pos.x, L.z - pos.z);
      const want = (Math.atan2(L.y - (pos.y + eyeH), Math.max(0.5, d)) * 180) / Math.PI;
      pitch += (clamp(want, -BODY_TURN.neckDown, BODY_TURN.neckUp) - pitch) * Math.min(1, dt * 6);
    } else pitch = clamp(pitch - input.lookY, -BODY_TURN.neckDown, BODY_TURN.neckUp);
    if (ladder) { climb(dt, input); return; }
    if (cover) {
      // 壁裏隠れ（一人称）：体は壁から外を向いて動かさない（壁に沿った横歩きは試合の計算が動かす）。
      // 首は覗く向きへ 62 度（壁に背を付けた動きと同じ）を元に、なぞった分だけ首の範囲で動く
      coverYaw = Math.max(-135, Math.min(135, coverYaw - input.lookX));
      coverPitch = Math.max(-35, Math.min(20, coverPitch - input.lookY));
      yaw = (Math.atan2(-cover.nx, -cover.nz) * 180) / Math.PI;
      const side = wrapDeg((Math.atan2(-cover.px, -cover.pz) * 180) / Math.PI - yaw) >= 0 ? 1 : -1;
      coverHead += (side * 62 - coverHead) * Math.min(1, dt * 6);
      headYaw = clamp(coverHead + coverYaw, -BODY_TURN.neckYaw, BODY_TURN.neckYaw);
      pitch = coverPitch;
      look = yaw + headYaw;
      pos.x = cover.x; pos.z = cover.z; pos.y = cover.y; groundY = cover.y;
      body.setPosition(cover.x, cover.y, cover.z);
      body.setEulerAngles(0, yaw, 0);
      placeCamera(0);
      return;
    }

    // 移動：スティックを倒しても、体と視点の向きは変わらない（利用者の指示 2026-11-13）。体の向きを元に、前後・横へ歩く
    const mag = Math.hypot(input.moveX, input.moveY);
    if (!frozen) updateLook(dt, input);
    else headYaw = clamp(headYaw - input.lookX, -BODY_TURN.neckYaw, BODY_TURN.neckYaw);
    if (mag > 0) {
      // speedScale が 0（攻撃・回避などの動きの間。game/combat.js の moveScale）なら止まる（前は || 1 で 0 が 1 になり、動きの間も歩けていた）
      // 川（game/swim.js）：深い所は泳ぐ（ゆっくり。swimSpeed は match-session.js が決める）、浅い所は遅く歩く
      // 落ちている間（天坑の縦穴）は、横へ少しだけ動ける（game/fall.js）
      const speed = fall.falling ? p.walkSpeed * FALL.air * Math.min(1, mag)
        : swimming ? api.swimSpeed * Math.min(1, mag / 0.75) * (api.speedScale ?? 1)
          : speedFor(Math.min(1, mag)) * (api.speedScale ?? 1) * wadeScale(waterDepth);
      const rad = (yaw * Math.PI) / 180;
      // 前（-Z）と右（+X）を、その向きに合わせて回す
      const fx = -Math.sin(rad), fz = -Math.cos(rad);
      const rx = Math.cos(rad), rz = -Math.sin(rad);
      let k = (speed * dt) / mag;
      const mx = fx * input.moveY + rx * input.moveX, mz = fz * input.moveY + rz * input.moveX;
      // 坂（game/slope.js）：上りは遅く、急な下りも遅い（bot と同じ式）。泳いでいる間は関係ない
      // 洞窟の口のまわり（api.noSlope。口の後ろは岩山の崖で、地面の高さで見ると「上れない坂」に見えてしまう）では使わない
      const sk = swimming || fall.falling || (api.noSlope && api.noSlope(pos.x, pos.z)) ? 1 : slopeSpeed(slopeAhead(terrain.heightAt, pos.x, pos.z, pos.y, mx / mag, mz / mag));
      k *= sk;
      pos.x += mx * k;
      pos.z += mz * k;
      bob += dt * speed * sk * 2.2;
    }
    lastMag = Math.min(1, mag);

    obstacles.resolve(pos, p.radius);

    // 歩ける範囲（円）の外へ出ない
    const r = Math.hypot(pos.x, pos.z);
    if (r > areaRadius) { pos.x *= areaRadius / r; pos.z *= areaRadius / r; }

    // 地面（床）の高さへなめらかに合わせる（段差でカメラががくっとしないように）。泳いでいる間は水面に浮く
    let target = groundAt(pos.x, pos.z, pos.y);
    let w = api.water ? api.water(pos.x, pos.z) : null;
    // 落ちる（天坑の穴へ入った）：足もとの床が急に低くなったら、重さで落ちる。床か水面に着くまでは、水にも床にも合わせない（game/fall.js）
    fall.y = pos.y; fall.swimming = swimming;
    const air = fallStep(fall, target, dt, w && pos.y !== undefined && w.surface < pos.y ? w.surface : null);
    if (air !== null) {
      pos.y = air; groundY = air;
      waterDepth = 0; waterSurface = null; swimming = false;
      body.setPosition(pos.x, groundY, pos.z);
      body.setEulerAngles(0, yaw, 0);
      placeCamera(0);
      return;
    }
    if (fall.landed) { api.onLand?.(fall.landed, fall.landedWater); fall.landed = 0; }
    if (w && !swimming && target > w.surface + 0.05) w = null;   // 橋の上（水の上の床）に立っている
    if (w && target < w.surface - w.depth - 1.5) w = null;       // 川床より下（川の真下の洞窟の中）にいる
    waterDepth = w ? w.depth : 0;
    swimming = waterDepth > SWIM.depth;
    if (swimming) target = diveY(w, api.diveK || 0);   // 水面に浮く。潜っていれば、その分だけ深く（game/swim.js）
    waterSurface = w ? w.surface : null;
    pos.y = target;
    groundY += (target - groundY) * Math.min(1, dt * 12);

    body.setPosition(pos.x, groundY, pos.z);
    body.setEulerAngles(0, yaw, 0);
    placeCamera(mag);
  }

  /**
   * 梯子の上り下り（2026-11-22。利用者が選んだ：ボタンで掴み、スティックで上下）。体はいつも梯子を向き、首だけ見回せる。
   * 前に倒すと上り、後ろに倒すと下りる。上の端でさらに上ると床へ上がり、下の端でさらに下りると床に降りる
   */
  function climb(dt, input) {
    const L = ladder.L;
    headYaw = clamp(headYaw - input.lookX, -BODY_TURN.neckYaw, BODY_TURN.neckYaw);
    yaw = L.yaw; look = yaw + headYaw; turn.target = null;
    const sm = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
    ladder.move = 0;
    if (ladder.phase === 'on') {
      const v = frozen ? 0 : Math.abs(input.moveY) > 0.3 ? Math.sign(input.moveY) : 0;
      ladder.move = v;
      ladder.y += v * CLIMB * dt;
      // 上の端（床へ上がる所）。石板が閉じていれば、頭が石板に当たる所（cap）で止まる（match-session.js が、そこで石板を押し開ける）
      const hi = L.top - 0.95, cap = L.open === false ? L.top - 1.35 : hi;
      if (v > 0 && ladder.y >= hi && cap >= hi) {
        ladder.y = hi;
        ladder.phase = 'offTop'; ladder.t = 0; ladder.dur = 0.75;
        ladder.from = { x: L.x, y: hi, z: L.z }; ladder.to = { x: L.topStand.x, y: L.top, z: L.topStand.z };
      } else if (v < 0 && ladder.y <= L.bottom) {
        ladder.y = L.bottom;
        ladder.phase = 'offBottom'; ladder.t = 0; ladder.dur = 0.4;
        ladder.from = { x: L.x, y: L.bottom, z: L.z }; ladder.to = { x: L.botStand.x, y: L.bottom, z: L.botStand.z };
      }
      ladder.y = Math.min(cap, Math.max(L.bottom, ladder.y));
      pos.x = L.x; pos.z = L.z; pos.y = ladder.y;
    } else {
      ladder.t = Math.min(1, ladder.t + dt / ladder.dur);
      const t = ladder.t, a = ladder.from, b = ladder.to;
      // 掴まる（上から）：先に後ろへ下がり、それから下りる。上で降りる：先に上がり、それから前へ。下：まっすぐ
      const kxz = ladder.phase === 'mount' && ladder.top ? sm(0, 0.55, t) : ladder.phase === 'offTop' ? sm(0.4, 1, t) : sm(0, 1, t);
      const ky = ladder.phase === 'mount' && ladder.top ? sm(0.25, 1, t) : ladder.phase === 'offTop' ? sm(0, 0.6, t) : sm(0, 1, t);
      pos.x = a.x + (b.x - a.x) * kxz; pos.z = a.z + (b.z - a.z) * kxz; pos.y = a.y + (b.y - a.y) * ky;
      ladder.move = ladder.phase === 'offTop' ? 1 : ladder.phase === 'mount' && ladder.top ? -1 : 0;   // 動きの選び方（render/character-view.js）
      if (t >= 1) {
        if (ladder.phase === 'mount') { ladder.phase = 'on'; ladder.y = b.y; }
        else { const done = ladder.phase; ladder = null; api.onLadderOff?.(done); }
      }
    }
    groundY = pos.y;
    waterDepth = 0; waterSurface = null; swimming = false; fall.falling = false;
    body.setPosition(pos.x, groundY, pos.z);
    body.setEulerAngles(0, yaw, 0);
    placeCamera(0);
  }

  const api = {
    /** 三人称のカメラを置ける所か（main.js が洞窟の中の岩を確かめる関数を入れる）。(x, y, z) → true / false */
    cameraClear: null,
    /** 坂の速さの決まりを使わない所か（main.js が洞窟の口のまわりを入れる）。(x, z) → true / false */
    noSlope: null,
    body,
    camera: eye,
    update,
    position: pos,
    speedScale: 1,
    lockAim: null,           // 捕捉している相手の胸の位置 { x, y, z }（match-session.js が毎回入れる。null なら捕捉していない）
    diveK: 0,                // 潜っている割合（0〜1。match-session.js が戦う人の記録から写す）
    swimSpeed: SWIM.speed,   // 泳ぐ速さ（match-session.js がキャラの速さとスタミナで決める。game/swim.js の swimSpeed）
    water: null,             // 川の水（world/terrain.js の waterAt）。main.js が付ける
    get waterDepth() { return waterDepth; },
    get waterSurface() { return waterSurface; },
    get swimming() { return swimming; },
    /** 落ちているか（天坑の縦穴。game/fall.js） */
    get falling() { return fall.falling; },
    /** 着いたとき：(速さ m/秒, 水に落ちたか)。match-session.js が音と知らせを出す */
    onLand: null,
    /**
     * 梯子を掴む（world/church.js の ladder。fromTop：上の床から下りるか）。上からは、梯子の方を向いて後ろへ下がりながら下りる
     */
    grabLadder(L, fromTop) {
      ladder = { L, phase: 'mount', t: 0, dur: fromTop ? 0.7 : 0.4, top: !!fromTop, move: 0,
        from: { x: pos.x, y: pos.y ?? L.bottom, z: pos.z }, to: { x: L.x, y: fromTop ? L.top - 0.95 : L.bottom, z: L.z }, y: fromTop ? L.top - 0.95 : L.bottom };
      yaw = L.yaw; headYaw = 0; look = yaw; turn.target = null;
      fall.falling = false;
    },
    /** 梯子から手を離す（倒れたときなど）。そのまま落ちる（game/fall.js） */
    leaveLadder() { ladder = null; },
    /** 梯子に掴まっているか：{ phase, move（1 上る・-1 下りる・0 止まっている）, y } か null */
    get ladder() { return ladder ? { phase: ladder.phase, move: ladder.move, y: pos.y } : null; },
    /** 梯子から降りたとき（'offTop'・'offBottom'）。match-session.js が使う */
    onLadderOff: null,
    noRun: false,   // しゃがむ・伏せているときは走れない
    /** 目の高さ（m。しゃがむ・伏せると低い。なめらかに移る） */
    setEyeHeight(h) { eyeWant = h; },
    /** 一人称の目の位置（体の向きの座標 {x, y, z}。前は -Z）。null で決まった高さに戻す */
    setEyeOffset(v) { eyeOff = v; },
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get moving() { return lastMag; },
    get viewMode() { return viewMode; },
    /** 三人称のカメラの、今の頭からの距離（m。壁などに押されると縮む） */
    get thirdDistance() { return thirdDist; },
    setViewMode(mode) {
      viewMode = mode === 'third' ? 'third' : 'first'; thirdDist = THIRD_DIST;
      if (hide) update(0, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });   // 隠れている間に切り替えた：目の位置を置き直す
      else placeCamera(0);
    },
    /** 首の向き（体の向きからの左右。度。左が正） */
    get headYaw() { return headYaw; },
    /** その場で回る速さ（度/秒。鎧の重さ）と、その倍率（ひるんでいる間は遅い） */
    turnSpeed: BODY_TURN.turn.medium,
    sprint: false,        // 全速力の間（match-session.js が決める）：スティックを倒すと sprintSpeed で走る
    sprintSpeed: 8,
    turnScale: 1,
    setAreaRadius(r) { areaRadius = r; },
    /**
     * 隠れる（ベッドの下・タンスの中）。null で解除。
     *   一人称：家具の中の目の位置（spot.eyeX・eyeZ・eyeH）から外を覗く。三人称：家具の上の少し前から、外を見る向きを見る
     */
    setHide(spot) {
      if (!spot) { hide = null; return; }
      const a = (spot.yaw * Math.PI) / 180;   // 外を見る向き（0 で +Z）
      const bed = spot.kind === 'bed';
      // 三人称のカメラ：家具の前の縁の少し上（タンスの上の後ろだと、壁際の低い天井や屋根の外へ出ることがあった）
      const fwd = bed ? 0.1 : 0.35;
      hide = { ...spot, camX: spot.x + Math.sin(a) * fwd, camZ: spot.z + Math.cos(a) * fwd, camH: bed ? 1.35 : 2.2,
        pitchMin: -55, pitchMax: 8,
        fpMin: bed ? -10 : -40, fpMax: bed ? 14 : 25 };   // 一人称：ベッドの下は床すれすれなので、上下はほとんど見られない
      pos.x = spot.x; pos.z = spot.z; pos.y = spot.y; groundY = spot.y;
      yaw = spot.yaw + 180; pitch = viewMode === 'first' ? (bed ? 2 : -6) : -20; headYaw = 0; twist = 0; look = yaw;   // 首と体のねじれは使わない（外を見る向きだけ）
      update(0, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
    },
    /** 隠れ場所から出た：x, z, y に立ち、yaw を向く */
    leaveHide(x, z, y, faceYaw) {
      hide = null; fall.falling = false;
      pos.x = x; pos.z = z; pos.y = y; groundY = y;
      if (faceYaw !== undefined) yaw = faceYaw;
      headYaw = 0; turn.target = null; look = yaw;
      pitch = -2;   // 隠れている間は家具の上から見下ろしていたので、出たら正面を見る
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
        yaw = (Math.atan2(-was.nx, -was.nz) * 180) / Math.PI; pitch = -2; headYaw = 0; turn.target = null; look = yaw;
        update(0, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
        return;
      }
      if (!cover) {
        coverYaw = 0; coverPitch = -6;
        const y0 = (Math.atan2(-c.nx, -c.nz) * 180) / Math.PI;
        coverHead = (wrapDeg((Math.atan2(-c.px, -c.pz) * 180) / Math.PI - y0) >= 0 ? 1 : -1) * 62;
      }
      cover = c;
    },
    get inCover() { return !!cover; },
    /**
     * 試合の計算が体を動かす間（暗殺の動きなど）：体の位置と向きを、戦う人の記録に合わせる（首の向きはそのまま）
     */
    follow(x, y, z, faceYaw) {
      pos.x = x; pos.z = z; pos.y = y; fall.falling = false;
      yaw = faceYaw; look = yaw + headYaw; turn.target = null;
    },
    /** 動きの間に体（肩の線）が回った分（度）。一人称の目もそれに付いて回る。0 で戻す */
    setTwist(v) { twist = v; },
    /** 今見ている向き（左右。度。体の向き＋首の向き＋動きで回った分） */
    get viewYaw() { return yaw + headYaw + twist; },
    /** 見ている向きを決める（首の範囲で。動きが終わって体の向きが移ったとき、画面の向きが飛ばないように） */
    keepView(v) { headYaw = clamp(wrapDeg(v - yaw), -BODY_TURN.neckYaw, BODY_TURN.neckYaw); look = yaw + headYaw; },
    /** 立てる高さを決める仕組み（家の床と階段）を使う */
    setGround(fn) { groundAt = fn; pos.y = fn(pos.x, pos.z, null); groundY = pos.y; },
    setFrozen(v) { frozen = v; },
    /** 観戦：見ている人の位置と向きにカメラを合わせる（三人称にする） */
    setPose(x, z, faceYaw, y) {
      pos.x = x; pos.z = z; yaw = faceYaw; if (y !== undefined) pos.y = y;
      if (viewMode !== 'third') { viewMode = 'third'; thirdDist = THIRD_DIST; }
    },
    /** 向きと上下の角度を直接決める（確認用） */
    setLook(faceYaw, facePitch) { yaw = faceYaw; headYaw = 0; turn.target = null; look = yaw; pitch = Math.max(-p.pitchLimit, Math.min(p.pitchLimit, facePitch)); },
    /** 出現する場所と向き。y を渡すと、その高さの近くの床に立つ（地面の下の洞窟の中に出るとき） */
    spawn(x, z, faceYaw, y = null) {
      pos.x = x; pos.z = z; yaw = faceYaw; pitch = -2; headYaw = 0; turn.target = null; look = yaw;
      fall.falling = false; fall.fallV = 0; ladder = null;
      pos.y = groundAt(x, z, y);
      groundY = pos.y;
      update(0, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
    },
  };
  update(0, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
  return api;
}
