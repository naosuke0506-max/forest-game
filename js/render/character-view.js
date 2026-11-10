// 戦う人の見た目：Tripo AI で作ったキャラの模型（骨入り）と、手に持つ武器。
// 動き（待機・歩き・後ろ歩き・走り・斬り・防御・ひるみ・倒れる・弓を引く/放つ）は模型に入っている。
// 模型は tools/characters/build_character.py で作る（assets/characters/<名前>.glb と、動きの長さ・速さの .json）。
// 戦闘の計算（game/combat.js）の状態を見て、どの動きを流すかを決めるだけ
import * as pc from 'playcanvas';
import { WEAPONS, DODGE, STANCE_TIME, TECHNIQUES, ASSASSIN } from '../game/data.js';
import { attackStats } from '../game/combat.js';
import { techSetOf } from '../game/techniques.js';
import { stanceShape } from '../game/stance.js';
import { createWeaponModel, createShieldModel, createArrowModel } from './weapons.js';
import { COVER_SPEED } from '../game/cover.js';
import { BUILD } from '../version.js';

const cache = new Map();

/** キャラの模型と動きの情報を読み込む（同じキャラは 1 回だけ） */
export function loadCharacterModel(app, id) {
  if (!cache.has(id)) {
    const glb = new Promise((resolve, reject) => {
      const asset = new pc.Asset(`character-${id}`, 'container', { url: `assets/characters/${id}.glb?v=${BUILD}` });
      asset.once('load', () => resolve(asset));
      asset.once('error', (err) => reject(new Error(`キャラの模型 ${id}: ${err}`)));
      app.assets.add(asset);
      app.assets.load(asset);
    });
    const meta = fetch(`assets/characters/${id}.json?v=${BUILD}`).then((r) => {
      if (!r.ok) throw new Error(`キャラの情報 ${id}: ${r.status}`);
      return r.json();
    });
    cache.set(id, Promise.all([glb, meta]).then(([asset, meta]) => ({ asset, meta })));
  }
  return cache.get(id);
}

const RUN_FROM = 1.6;   // これより速いと走りの動き（m/秒）
const BLEND = 0.15;     // 動きを切り替えるときに混ぜる時間（秒）

export function createCharacterView(app, fighter, terrain, { asset, meta }) {
  const root = new pc.Entity(`fighter-${fighter.id}`);
  const body = asset.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
  body.setLocalScale(meta.scale, meta.scale, meta.scale);
  body.setLocalEulerAngles(0, 180, 0);   // 模型は +Z を向いて作られているので、ゲームの前（-Z）へ回す
  root.addChild(body);
  app.root.addChild(root);

  // 攻撃を受けた直後に赤く光らせるため、材質は人ごとに分ける。
  // 発光の色は最初から持たせ、強さだけを変える（有無を切り替えるとシェーダーを作り直して一瞬止まる）
  const materials = [];
  for (const r of body.findComponents('render')) {
    for (const mi of r.meshInstances) {
      const m = mi.material.clone();
      m.emissive = new pc.Color(0.6, 0.06, 0.03);
      m.emissiveIntensity = 0;
      m.update();
      mi.material = m;
      materials.push(m);
    }
  }

  // 武器と盾：模型の手に付けた「持ち手の点」（socket）に付ける。
  // 点の向きは +Y が刃先（弓は上の先）。点は模型の縮尺の中にあるので、武器は縮尺を打ち消して付ける
  const attach = (socketName, model, rot, pos = [0, 0, 0], quat = null) => {
    const socket = body.findByName(socketName);
    if (!socket) return null;
    const holder = new pc.Entity();
    holder.setLocalScale(1 / meta.scale, 1 / meta.scale, 1 / meta.scale);
    if (quat) holder.setLocalRotation(quat); else holder.setLocalEulerAngles(...rot);
    model.setLocalPosition(...pos);
    holder.addChild(model);
    socket.addChild(holder);
    return holder;
  };
  // 手に持つ武器。持ち替え（弓兵の弓 ↔ ダガー）のときは付け直す
  let weaponHolder = null, shownWeapon = null;
  function showWeapon(id) {
    weaponHolder?.destroy();
    shownWeapon = id;
    const model = createWeaponModel(id);
    if (WEAPONS[id].kind === 'bow') {
      // 弓の形は「Z の向きに弓の先、+Y の側に弦」。持ち手の点は「+Y が上の弓の先、+X が弦の側」なので、
      // (1,1,1) の軸で -120 度回して Z→Y、Y→X、X→Z に入れ替える
      weaponHolder = attach('socket_bow', model, null, [0, 0, 0], new pc.Quat().setFromAxisAngle(new pc.Vec3(1, 1, 1).normalize(), -120));
    } else {
      // 武器は -Z の向きへ伸びているので、+Y（刃先）へ起こす。槍は後ろ寄りを持つ
      weaponHolder = attach('socket_R', model, [90, 0, 0], id === 'spear' ? [0, 0, 0.55] : [0, 0, 0]);
    }
  }
  showWeapon(fighter.weapon);
  if (fighter.shield) attach('socket_L', createShieldModel(), [0, 0, 0]);
  // 弓を引いている間の矢：右手（弦を引く手）から弓の握りへ向けて番える（矢の模型は -Z が鏃）
  const sockR = body.findByName('socket_R'), sockBow = body.findByName('socket_bow');
  const nocked = WEAPONS[fighter.primary]?.kind === 'bow' && sockR && sockBow ? createArrowModel() : null;
  if (nocked) { nocked.enabled = false; app.root.addChild(nocked); }
  const arrowDir = new pc.Vec3(), arrowAt = new pc.Vec3();
  function placeArrow() {
    const drawing = fighter.alive && root.enabled && fighter.action?.kind === 'draw' && WEAPONS[fighter.weapon]?.kind === 'bow';
    nocked.enabled = drawing;
    if (!drawing) return;
    const hand = sockR.getPosition(), grip = sockBow.getPosition();
    arrowDir.sub2(grip, hand).normalize();
    arrowAt.copy(arrowDir).mulScalar(0.36).add(hand);   // 矢の真ん中（矢筈を右手に）
    nocked.setPosition(arrowAt);
    arrowAt.add(arrowDir);
    nocked.lookAt(arrowAt);
  }

  // 動き
  const tracks = new Map(asset.resource.animations.map((a) => [a.resource.name, a.resource]));
  body.addComponent('anim', { activate: true });
  for (const [name, c] of Object.entries(meta.clips)) {
    const track = tracks.get(name);
    if (track) body.anim.assignAnimation(name, track, undefined, 1, c.loop);
  }
  const clip = (name) => meta.clips[name];
  const has = (name) => tracks.has(name);
  // 両手で持つ武器（戰鎚・長柄鎚。data.js の stance）は、待機・歩き・後ろ歩き・走りも両手で持つ動き（wh_idle など）にする
  const loco = (name) => { const st = WEAPONS[fighter.weapon]?.stance; return st && has(`${st}_${name}`) ? `${st}_${name}` : name; };
  // 姿勢の動き（tools/characters/make_motions.py）：しゃがみ（その場）・しゃがみ歩き・伏せる・伏せ・這う・起き上がる
  const stanceClips = ['crouch', 'crouch_walk', 'prone_down', 'prone', 'crawl', 'prone_up'].every(has);
  let current = '', lastAction = null, lastPhase = '', swingIndex = 0, deathStarted = false;
  const VICTIM = /^(as_back_v|as_slide_v|drag_wd_v|drag_bed_v)$/;   // される側の動き（倒れても最後の姿のまま）
  // 攻撃を受けた動き（game/reactions.js の fighter.react）：流している受けた動きの番号と残りの時間。
  // 押されて下がった分（knock）：動きの中で体が下がっているので、位置をその分だけ戻して描く（受けた動きが終わったら BLEND の間に 0 へ）
  let reactId = 0, reactLeft = 0, reactShift = 0;   // reactShift：受けた動きの中で体が下がる距離（m）
  const knock = { x: 0, z: 0, fade: 0, fx: 0, fz: 0 };
  const knockV = new pc.Vec3();
  // snap：動き終わりに体の位置と向きが移った（暗殺の滑斬など。fighter.snapPose）。次の動きへは混ぜずにすぐ移る（移った所で姿が合っている）
  let snap = false;
  const play = (name, speed = 1, blend = BLEND) => {
    if (!has(name)) return;
    body.anim.speed = speed;
    if (name !== current) {
      body.anim.baseLayer.transition(name, snap ? 0 : blend);
      current = name;
      snap = false;
    }
  };
  // 同じ動きを最初から流し直す（攻撃が続いたとき・ひるみが重なったとき）
  const restart = (name, speed = 1) => {
    if (!has(name)) return;
    body.anim.speed = speed;
    body.anim.baseLayer.transition(name, 0.08, 0);
    current = name;
  };

  // しゃがむ・伏せる：模型に専用の動き（crouch・prone など）が無いときだけ使う仮の姿勢。しゃがむは体を低く縮め少し前へ傾け、
  // 伏せるは体を前へ倒して寝かせる（足もとを軸に回し、体の真ん中が立っていた所に来るようにずらす）
  const qStand = new pc.Quat().setFromEulerAngles(0, 180, 0), qTilt = new pc.Quat(), qPose = new pc.Quat();
  let posed = false;
  const pose = (sh) => {
    const low = sh.prone < 0.01 && sh.height > 1.7;
    if (low && !posed) return;
    posed = !low;
    const sq = sh.prone > 0 ? 1 : Math.min(1, sh.height / 1.75);   // しゃがむ：縦に縮める割合
    qTilt.setFromEulerAngles(-90 * sh.prone - (1 - sq) * 55, 0, 0);
    qPose.mul2(qTilt, qStand);
    body.setLocalRotation(qPose);
    body.setLocalScale(meta.scale, meta.scale * (sh.prone > 0 ? 1 : 0.25 + 0.75 * sq), meta.scale);
    body.setLocalPosition(0, 0.22 * sh.prone, 0.95 * sh.prone);
  };

  let groundY = (fighter.y ?? terrain.heightAt(fighter.x, fighter.z)), flashOn = false;
  let px = fighter.x, pz = fighter.z, vel = 0, fwd = 0;
  let pYaw = fighter.yaw, yawRate = 0;   // 体の向きが変わる速さ（度/秒。左回りが正）：その場で回る足踏みの動きに使う
  // 首の向き（fighter.headYaw。体の向きからの左右）：首と頭の骨に分けて回す（ほかの人から、どちらを見ているか分かる）
  const neckBone = body.findByName('NeckTwist01');
  const qNeck = new pc.Quat(), qNeckB = new pc.Quat();
  function turnHead() {
    const h = fighter.headYaw || 0;
    if (Math.abs(h) < 0.5 || !headBone) return;
    for (const [b, k] of [[neckBone, 0.4], [headBone, 0.6]]) {
      if (!b) continue;
      qNeck.setFromAxisAngle(pc.Vec3.UP, h * k);
      qNeckB.mul2(qNeck, b.getRotation());
      b.setRotation(qNeckB);
    }
  }

  // 一人称（自分の体を目から見る）：頭（兜）を隠し、上下の向きに合わせて上体を傾け（腕と武器が視線に付いてくる）、
  // 目の位置をカメラへ渡す。脚や胴は動きのまま（下を向けば見える）
  let firstPerson = false, eyeReady = false, eyeHold = false;
  let paused = false, pausedSpeed = 1;   // 時間が止まっている（刻が変わった直後）
  const headBone = body.findByName('Head');
  const spine = ['Spine01', 'Spine02'].map((n) => body.findByName(n)).filter(Boolean);
  const eyeLocal = new pc.Vec3(), eyeTmp = new pc.Vec3(), invRoot = new pc.Mat4(), qAim = new pc.Quat(), qBone = new pc.Quat();
  const lArm = body.findByName('L_Upperarm');
  const lShoulder = lArm, rShoulder = body.findByName('R_Upperarm');
  const qArm = new pc.Quat();
  const AIM = { stand: 0.9, crouch: 0.8, prone: 0.25 };   // 上下の向きのうち、上体を傾ける割合（伏せていると少し）
  // 楯を持つ左腕：目の前に楯が来て前が見えなくならないよう、一人称のときだけ肩から下げて外へ開く（度。ほかの人から見える姿は変えない）
  const SHIELD_FP = { down: 24, out: 20 };
  const EYE_UP = -0.04, EYE_FWD = 0.1;                    // 頭の骨の付け根から目までの高さ・前（m。目の高さが今までの 1.65 m になるように）
  function applyFirstPerson(dt) {
    if (!headBone) return;
    // 上体を傾ける：背骨 2 本に分けて、体の右を軸に回す（上を向くと反り、下を向くとかがむ）。回避の間は傾けない
    const k = fighter.action?.kind === 'dodge' ? 0 : AIM[fighter.stance] ?? AIM.stand;
    const aim = Math.max(-60, Math.min(60, fighter.pitch || 0)) * k;
    if (Math.abs(aim) > 0.1 && spine.length) {
      qAim.setFromAxisAngle(root.right, aim / spine.length);
      for (const b of spine) { qBone.mul2(qAim, b.getRotation()); b.setRotation(qBone); }
    }
    if (fighter.shield && lArm) {
      qArm.setFromAxisAngle(root.right, -SHIELD_FP.down);
      qBone.mul2(qArm, lArm.getRotation());
      qArm.setFromAxisAngle(pc.Vec3.UP, SHIELD_FP.out);
      qBone.mul2(qArm, qBone);
      lArm.setRotation(qBone);
    }
    // 頭（兜）を潰して隠す（目の前に兜の内側が映らないように）
    headBone.setLocalScale(0.001, 0.001, 0.001);
    // 目の位置：頭の付け根から上と前（体の向きの座標で。頭のうなずきには付いていかない）。少しなめらかにする
    if (eyeHold) { eyeHold = false; return; }
    invRoot.copy(root.getWorldTransform()).invert();
    invRoot.transformPoint(headBone.getPosition(), eyeTmp);
    eyeTmp.y += EYE_UP; eyeTmp.z -= EYE_FWD;
    // 押されて下がった分は体を戻して描いているので、目はその分だけ体の位置（カメラの位置）から見て前にある
    knockV.set(knock.x, 0, knock.z);
    invRoot.transformVector(knockV, knockV);
    eyeTmp.sub(knockV);
    // 攻撃を受けた直後は頭が急に動く（重い被弾・よろめきで 0.1 秒に 40 cm 沈む）ので、目はゆっくり追う（画面の揺れで酔わないように）
    const rate = fighter.react && fighter.react.t < 0.6 ? 9 : 25;
    if (!eyeReady) { eyeLocal.copy(eyeTmp); eyeReady = true; } else eyeLocal.lerp(eyeLocal, eyeTmp, Math.min(1, dt * rate));
  }

  // 圖鑑で動きを流すとき（direct）：戦闘の状態を見ずに、選んだ動きだけを流す
  let directed = null;
  // その動きを使う武器（技の動き・両手で持つ待機や歩き）。無ければ null
  const weaponOfClip = (name) => {
    for (const [id, set] of Object.entries(TECHNIQUES)) {
      for (const t of [...set.combo, set.charge, set.charge2]) if (t.clip === name || t.in === name || t.hold === name) return id;
    }
    for (const [id, m] of Object.entries(ASSASSIN.byWeapon)) {   // 暗殺の動き（片手劍の背刺・滑斬、鈍器・短劍の背後から）
      if (Object.values(m).some((k) => ASSASSIN.moves[k].clip === name)) return id;
    }
    const st = name.split('_')[0];
    return Object.keys(WEAPONS).find((id) => WEAPONS[id].stance === st) || null;
  };
  return {
    root,
    update(dt) {
      if (paused) return;   // 時間が止まっている（刻が変わった直後）：姿もそのまま
      if (directed) return;  // 圖鑑：選んだ動きをそのまま流す（時刻は圖鑑が動かす）
      updateAnim(dt);
      if (fighter.alive) turnHead();
      if (firstPerson && fighter.alive) applyFirstPerson(dt);
      if (nocked) placeArrow();
    },
    /** 一人称で自分の体を映すか（頭を隠し、上体を視線に合わせる）。外すと頭を戻す */
    setFirstPerson(v) {
      if (v === firstPerson) return;
      firstPerson = v;
      eyeReady = false;
      if (!v) headBone?.setLocalScale(1, 1, 1);
    },
    /** 肩の線から見た体の向き（度。戦う人の向きの約束）。暗殺などの動きで体が回った分を、一人称の目に足すのに使う */
    get shoulderYaw() {
      if (!lShoulder || !rShoulder) return fighter.yaw;
      const a = lShoulder.getPosition(), b = rShoulder.getPosition();
      return (Math.atan2(-(b.z - a.z), b.x - a.x) * 180) / Math.PI;   // 右（左肩→右肩）が (cos y, -sin y)
    },
    /** 一人称の目の位置（体の向きの座標。前は -Z）。まだ分からなければ null */
    get eyeOffset() { return firstPerson && eyeReady ? eyeLocal : null; },
    setVisible(v) { root.enabled = v; if (!v && nocked) nocked.enabled = false; },
    /** 片付ける（大廳の人物を替えるとき） */
    destroy() { root.destroy(); },
    /** 動きの情報（長さ・繰り返すか）。この模型が持つ動きの名前の一覧は clipNames */
    clipInfo: (name) => (has(name) ? clip(name) : null),
    get clipNames() { return Object.keys(meta.clips).filter(has); },
    /** 圖鑑：name の動きを最初から流す（null で戦闘の状態に戻す）。時刻と速さは anim で動かす */
    direct(name) {
      directed = name && has(name) ? name : null;
      // 技の動きは、その技の武器を持たせて流す（弓兵の短劍・打擊騎士の戰鎚など）。止めたら、持っている武器へ戻す
      const want = (directed && weaponOfClip(directed)) || fighter.weapon;
      if (want !== shownWeapon) showWeapon(want);
      if (!directed) { current = ''; return; }
      body.anim.speed = 1;
      body.anim.baseLayer.transition(directed, 0.12, 0);
      current = directed;
    },
    /** その動きを使う武器（圖鑑。大廳が先に模型を読み込むのに使う） */
    weaponFor: (name) => weaponOfClip(name),
    /** 手の武器を付け直す（武器の模型を読み込んだ後に） */
    refreshWeapon() { if (shownWeapon) showWeapon(shownWeapon); },
    get anim() { return body.anim; },
    /** 時間を止める（刻が変わった直後）：動きを止め、今の姿のまま */
    setPaused(v) {
      if (v === paused) return;
      paused = v;
      if (v) { pausedSpeed = body.anim.speed; body.anim.speed = 0; } else body.anim.speed = pausedSpeed;
    },
    /** 確認用：今の動き */
    get debugState() { const l = body.anim.baseLayer; return `${current} ${l.activeState} ${l.activeStateCurrentTime?.toFixed(2)} speed${body.anim.speed.toFixed(2)}`; },
  };

  /** 動き：戦闘の計算の状態を見て、どの動きを流すかを決める */
  function updateAnim(dt) {
      // 動き終わりに体の位置と向きが移った（暗殺の滑斬など）：速さ・回る速さ・目の位置を測り直す（移った分を歩いた・回ったと見ない）
      if (fighter.snapPose) {
        fighter.snapPose = false; snap = true;
        px = fighter.x; pz = fighter.z; vel = 0; fwd = 0; pYaw = fighter.yaw; yawRate = 0; eyeReady = false;
        eyeHold = true;   // 骨はまだ前の動きの最後の姿（体だけ移った）なので、目の位置は次の姿が出てから測る
      }
      const target = (fighter.y ?? terrain.heightAt(fighter.x, fighter.z));
      groundY += (target - groundY) * Math.min(1, dt * 12);
      // 壁裏隠れ：背中が壁に付くように、壁の側へ少し寄せて描く（位置の計算は壁から離れた所）
      const cv = fighter.cover?.seg;
      // 押されて下がった分：受けた動きの間は下がった分だけ戻し、終わったら動きの戻り（BLEND）と同じ間に 0 へ
      const rk = fighter.react;
      // 動きの中で下がる分より遠くへ押された（楯押）：動きの分だけ戻し、残りは体ごと滑って下がるように見せる
      const kk = rk && rk.push > 0 && reactShift > 0 ? Math.min(1, reactShift / rk.push) : 1;
      if (rk && rk.id === reactId && reactLeft > 0) { knock.x = rk.moved.x * kk; knock.z = rk.moved.z * kk; knock.fade = 0; }
      else if (knock.x || knock.z) {
        if (!knock.fade) { knock.fx = knock.x; knock.fz = knock.z; }
        knock.fade += dt;
        const k = Math.max(0, 1 - knock.fade / BLEND);
        knock.x = knock.fx * k; knock.z = knock.fz * k;
      }
      root.setPosition(fighter.x - knock.x - (cv ? cv.nx * 0.14 : 0), groundY, fighter.z - knock.z - (cv ? cv.nz * 0.14 : 0));
      root.setEulerAngles(0, fighter.yaw, 0);

      // 質感の画像を消さない程度に、うっすら赤くする。倒れた後は光らせない
      const flash = fighter.alive && fighter.hitFlash > 0;
      if (flash !== flashOn) {
        flashOn = flash;
        for (const m of materials) { m.emissiveIntensity = flash ? 0.45 : 0; m.update(); }
      }

      // 速さと向き（前へ進んでいるか、後ろへ下がっているか）は、位置の変化から求める
      if (dt > 0) {
        const dx = (fighter.x - px) / dt, dz = (fighter.z - pz) / dt;
        const yaw = (fighter.yaw * Math.PI) / 180;
        const f = -(Math.sin(yaw) * dx + Math.cos(yaw) * dz);   // 前（-Z を回した向き）への速さ
        const k = Math.min(1, dt * 10);
        vel += (Math.hypot(dx, dz) - vel) * k;
        fwd += (f - fwd) * k;
      }
      px = fighter.x; pz = fighter.z;
      if (dt > 0) {
        const dy = ((fighter.yaw - pYaw + 540) % 360) - 180;
        yawRate += (dy / dt - yawRate) * Math.min(1, dt * 12);
      }
      pYaw = fighter.yaw;
      if (fighter.action?.kind !== 'dodge') {
        const sh = stanceShape(fighter);
        if (fighter.alive && !stanceClips && (sh.prone > 0 || sh.height < 1.7)) pose(sh);
        else { if (posed) { posed = false; body.setLocalScale(meta.scale, meta.scale, meta.scale); body.setLocalPosition(0, 0, 0); } body.setLocalEulerAngles(0, 180, 0); }   // 前転で変えた体の向きを戻す
      }
      if (fighter.weapon !== shownWeapon) showWeapon(fighter.weapon);

      if (!fighter.alive) {
        // 倒れた：倒れる動き。ただし、暗殺された・引きずり出された（される側の動きの途中）なら、その動きの最後の姿のまま
        if (!deathStarted) { deathStarted = true; if (!VICTIM.test(current)) restart('death', 1); }
        return;
      }

      // 攻撃を受けた：被弾（軽い・重い）・よろめきは攻撃された向きの動き、楯で受けたら受けの動き（game/reactions.js）。
      // 動きの間はほかの動きに替えない（新しい行動を始めたら、そちらへ移る）。向きの動きが無い模型は、今までの hit・stagger
      const r = fighter.react;
      if (r && r.id !== reactId) {
        reactId = r.id;
        const name = r.dir ? `${r.kind}_${r.dir}` : r.kind;
        const alt = r.kind === 'stagger' ? 'stagger' : r.kind.startsWith('guard') ? null : 'hit';
        const use = has(name) ? name : alt && has(alt) ? alt : null;
        if (use) {
          restart(use, 1);
          reactLeft = clip(use).duration * 0.95;
          reactShift = (clip(use).shift || 0) * meta.scale;
          lastAction = fighter.action;
        }
      }
      if (reactLeft > 0) {
        reactLeft -= dt;
        const a0 = fighter.action;
        if (!(a0 && a0 !== lastAction)) return;   // 新しい行動が始まるまで、受けた動きのまま
        reactLeft = 0;
      }
      if (fighter.stun > 0) return;

      const a = fighter.action;
      // 暗殺する（game/assassin.js）：飛びかかる間は走り、動き（背刺・滑斬）が始まったらその動き。片手劍でなければ強い一撃
      if (a?.kind === 'assassinate') {
        if (a !== lastAction || a.phase !== lastPhase) {
          lastAction = a; lastPhase = a.phase;
          if (a.phase === 'approach') play('run', 1.5, 0.08);
          else if (a.move && has(a.move.clip)) restart(a.move.clip, 1);
          else { const name = has('heavy') ? 'heavy' : 'a1'; if (has(name)) restart(name, clip(name).duration / 0.7); }
        }
        return;
      }
      // タンス・ベッドに隠れる・出る・覗く・引きずり出される（game/hide-acts.js）：その動きを最後まで
      if (a && (a.kind === 'hideIn' || a.kind === 'hideOut' || a.kind === 'search' || a.kind === 'dragged')) {
        if (a !== lastAction) { lastAction = a; if (has(a.clip)) restart(a.clip, 1); }
        return;
      }
      // 引きずり出して止め：片手劍はその動き。ほかの武器は、止めの少し前から強い一撃
      if (a?.kind === 'drag') {
        if (a !== lastAction) { lastAction = a; lastPhase = ''; if (a.move && has(a.move.clip)) restart(a.move.clip, 1); }
        else if (!a.move && lastPhase !== 'swing' && a.t >= a.drag.kill - 0.5) {
          lastPhase = 'swing';
          const name = has('heavy') ? 'heavy' : 'a1';
          if (has(name)) restart(name, clip(name).duration / 0.7);
        }
        return;
      }
      // 暗殺される：される側の動き（背刺をされる・滑斬をされる）
      if (a?.kind === 'assassinated') {
        if (a !== lastAction) { lastAction = a; if (has(a.clip)) restart(a.clip, 1); }
        return;
      }
      // 溜め：溜めに入る動きの後は、溜めている動きを繰り返す
      if (a?.kind === 'charge' && a === lastAction && a.t >= (clip(a.tech.in)?.duration ?? 0)) play(a.tech.hold, 1, 0.1);
      if (a && a !== lastAction) {
        lastAction = a;
        if (a.kind === 'attack' && a.tech) {
          // 技（片手劍・長劍・鎚矛・戰鎚・長柄鎚・短劍）：動きを作った速さのまま流す（data.js の TECHNIQUES の time が動きの長さ）
          const name = a.tech.clip;
          if (has(name)) restart(name, clip(name).duration / a.tech.time);
        } else if (a.kind === 'shield') {
          // 楯の技（楯擊・楯押）：動きを作った速さのまま
          const name = a.skill.clip;
          if (has(name)) restart(name, clip(name).duration / a.skill.time);
        } else if (a.kind === 'charge') {
          if (has(a.tech.in)) restart(a.tech.in, 1);
        } else if (a.kind === 'charge2') {
          // 溜攻撃 2 を待つ：その技の溜めの動き（charge2.hold。鎚矛は肩の高さで構えて震える など）があれば、それを繰り返す。
          // 無ければ溜攻撃 1 の振り終わりの姿のまま（動きは最後の姿で止まる）。振り終わってから長押ししたときは、振り終わりの姿へ戻す
          const set = techSetOf(fighter.weapon);
          const out = set?.charge.clip;
          if (set?.charge2.hold && has(set.charge2.hold)) play(set.charge2.hold, 1, 0.15);
          else if (out && current !== out && has(out)) {
            body.anim.speed = 1;
            body.anim.baseLayer.transition(out, 0.15, clip(out).duration * 0.98);
            current = out;
          }
        } else if (a.kind === 'attack') {
          // 攻撃のたびに、3 種類の斬り（a1 → a2 → a3）を順に使う。長さは武器の振りの時間に合わせる
          // 強攻撃（左手）は heavy の動き。ふつうは 3 種類の斬りを順に。持ち替えた近接武器は ma1〜ma3
          const st = attackStats(fighter.weapon, a.heavy);
          const melee2 = fighter.weapon !== fighter.primary && has('ma1');
          const name = a.heavy && has('heavy') ? 'heavy' : (melee2 ? ['ma1', 'ma2', 'ma3'] : ['a1', 'a2', 'a3'])[swingIndex++ % 3];
          if (has(name)) restart(name, clip(name).duration / (st.windup + st.recovery));   // 動きの無い模型では何もしない
        } else if (a.kind === 'finisher') {
          // 致命の一撃：強攻撃の大きな振り（専用の動きができるまで）
          const name = has('heavy') ? 'heavy' : 'a1';
          if (has(name)) restart(name, clip(name).duration / 0.85);
        } else if (a.kind === 'draw') {
          restart('draw', clip('draw').duration / WEAPONS[fighter.weapon].drawTime);
        } else if (a.kind === 'release') {
          restart('shoot', 1);
        } else if (a.kind === 'dodge') {
          const d = DODGE[fighter.weight] || DODGE.medium;
          restart(d.anim, clip(d.anim) ? clip(d.anim).duration / d.duration : 1);
          // 前転は、転がる向きへ体を向ける（回避ステップは向きを変えずに跳ぶ）
          if (d.anim === 'roll') {
            const rel = (Math.atan2(-a.dirX, -a.dirZ) * 180) / Math.PI - fighter.yaw;
            body.setLocalEulerAngles(0, 180 + rel, 0);
          }
        }
      }
      if (a) return;
      lastAction = null;

      if (fighter.guarding && has('guard')) { play('guard', 1); return; }

      const sc = meta.scale;
      // 壁裏隠れ：壁に背を付けて、覗く向き（左・右）の動き。壁際を歩いている間は、その向きへ歩く動き（足の運びを進む速さに合わせる）
      if (fighter.cover && has('cover_l')) {
        const side = fighter.cover.side === 'r' ? 'r' : 'l', mv = fighter.cover.moving || 0, walk = `cover_walk_${side}`;
        if (mv > 0 && has(walk)) play(walk, Math.min(2.5, Math.max(0.5, (COVER_SPEED * mv) / (clip(walk).speed * sc))), 0.15);
        else play(side === 'r' ? 'cover_r' : 'cover_l', 1, 0.25);
        return;
      }
      // しゃがむ・伏せる：伏せる・起き上がる途中はその動きを 1 回。伏せていれば止まって肘をつくか這う、しゃがんでいればその場か歩く
      if (stanceClips) {
        if (fighter.stanceT > 0) {
          const down = fighter.stanceTo === 'prone';
          const name = down ? 'prone_down' : 'prone_up';
          if (current !== name) restart(name, clip(name).duration / (down ? STANCE_TIME.down : STANCE_TIME.up));
          return;
        }
        if (fighter.stance === 'prone') {
          if (vel < 0.08) play('prone', 1, 0.25);
          else play('crawl', Math.min(2.5, Math.max(0.5, vel / (clip('crawl').speed * sc))), 0.25);
          return;
        }
        if (fighter.stance === 'crouch') {
          if (vel < 0.15) play('crouch', 1, 0.25);
          else play('crouch_walk', Math.min(2.5, Math.max(0.5, vel / (clip('crouch_walk').speed * sc))), 0.2);
          return;
        }
      }

      // 歩き・走り・後ろ歩き。足の運びが地面と合うように、進む速さで動きの速さを変える。
      // 止まっていて体の向きが変わっているときは、その場で足踏みしながら回る（回る速さで動きの速さを変える）
      if (vel < 0.15) {
        const tn = yawRate < 0 ? 'turn_r' : 'turn_l';
        if (Math.abs(yawRate) > 25 && has(tn)) play(tn, Math.min(2, Math.max(0.5, Math.abs(yawRate) / (clip(tn).turn || 150))), 0.15);
        else play(loco('idle'), 1);
      }
      else if (fwd < -0.3 * vel) play(loco('back'), Math.min(2.5, Math.max(0.5, vel / (clip('back').speed * sc))));
      else if (vel > RUN_FROM) play(loco('run'), Math.min(2.5, Math.max(0.6, vel / (clip('run').speed * sc))));
      else play(loco('walk'), Math.min(2.5, Math.max(0.5, vel / (clip('walk').speed * sc))));
  }
}
