// 戦う人の見た目：Tripo AI で作ったキャラの模型（骨入り）と、手に持つ武器。
// 動き（待機・歩き・後ろ歩き・走り・斬り・防御・ひるみ・倒れる・弓を引く/放つ）は模型に入っている。
// 模型は tools/characters/build_character.py で作る（assets/characters/<名前>.glb と、動きの長さ・速さの .json）。
// 戦闘の計算（game/combat.js）の状態を見て、どの動きを流すかを決めるだけ
import * as pc from 'playcanvas';
import { WEAPONS, DODGE, STANCE_TIME } from '../game/data.js';
import { attackStats } from '../game/combat.js';
import { stanceShape } from '../game/stance.js';
import { createWeaponModel, createShieldModel } from './weapons.js';
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

  // 動き
  const tracks = new Map(asset.resource.animations.map((a) => [a.resource.name, a.resource]));
  body.addComponent('anim', { activate: true });
  for (const [name, c] of Object.entries(meta.clips)) {
    const track = tracks.get(name);
    if (track) body.anim.assignAnimation(name, track, undefined, 1, c.loop);
  }
  const clip = (name) => meta.clips[name];
  const has = (name) => tracks.has(name);
  // 姿勢の動き（tools/characters/make_motions.py）：しゃがみ（その場）・しゃがみ歩き・伏せる・伏せ・這う・起き上がる
  const stanceClips = ['crouch', 'crouch_walk', 'prone_down', 'prone', 'crawl', 'prone_up'].every(has);
  let current = '', lastAction = null, swingIndex = 0, wasStunned = false, deathStarted = false;
  const play = (name, speed = 1, blend = BLEND) => {
    if (!has(name)) return;
    body.anim.speed = speed;
    if (name !== current) {
      body.anim.baseLayer.transition(name, blend);
      current = name;
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

  return {
    root,
    update(dt) {
      const target = (fighter.y ?? terrain.heightAt(fighter.x, fighter.z));
      groundY += (target - groundY) * Math.min(1, dt * 12);
      // 壁裏隠れ：背中が壁に付くように、壁の側へ少し寄せて描く（位置の計算は壁から離れた所）
      const cv = fighter.cover?.seg;
      root.setPosition(fighter.x - (cv ? cv.nx * 0.14 : 0), groundY, fighter.z - (cv ? cv.nz * 0.14 : 0));
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
      if (fighter.action?.kind !== 'dodge') {
        const sh = stanceShape(fighter);
        if (fighter.alive && !stanceClips && (sh.prone > 0 || sh.height < 1.7)) pose(sh);
        else { if (posed) { posed = false; body.setLocalScale(meta.scale, meta.scale, meta.scale); body.setLocalPosition(0, 0, 0); } body.setLocalEulerAngles(0, 180, 0); }   // 前転で変えた体の向きを戻す
      }
      if (fighter.weapon !== shownWeapon) showWeapon(fighter.weapon);

      if (!fighter.alive) {
        if (!deathStarted) { deathStarted = true; restart('death', 1); }
        return;
      }

      // ひるみ：ひるみ始めに 1 回流す。防御が崩れた（長いひるみ）ときは大きくよろめく
      const stunned = fighter.stun > 0;
      if (stunned && !wasStunned) restart(fighter.stun > 0.5 && has('stagger') ? 'stagger' : 'hit', 1);
      wasStunned = stunned;
      if (stunned) return;

      const a = fighter.action;
      if (a && a !== lastAction) {
        lastAction = a;
        if (a.kind === 'attack') {
          // 攻撃のたびに、3 種類の斬り（a1 → a2 → a3）を順に使う。長さは武器の振りの時間に合わせる
          // 強攻撃（左手）は heavy の動き。ふつうは 3 種類の斬りを順に。持ち替えた近接武器は ma1〜ma3
          const st = attackStats(fighter.weapon, a.heavy);
          const melee2 = fighter.weapon !== fighter.primary && has('ma1');
          const name = a.heavy && has('heavy') ? 'heavy' : (melee2 ? ['ma1', 'ma2', 'ma3'] : ['a1', 'a2', 'a3'])[swingIndex++ % 3];
          if (has(name)) restart(name, clip(name).duration / (st.windup + st.recovery));   // 動きの無い模型では何もしない
        } else if (a.kind === 'finisher' || a.kind === 'assassinate') {
          // 致命の一撃・暗殺：強攻撃の大きな振り（専用の動きができるまで）
          const name = has('heavy') ? 'heavy' : 'a1';
          if (has(name)) restart(name, clip(name).duration / 0.85);
        } else if (a.kind === 'search') {
          // 探す：かがんで開ける（専用の動きができるまで、構えの動きで代わりにする）
          restart(has('guard') ? 'guard' : 'idle', 1);
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

      // 歩き・走り・後ろ歩き。足の運びが地面と合うように、進む速さで動きの速さを変える
      if (vel < 0.15) play('idle', 1);
      else if (fwd < -0.3 * vel) play('back', Math.min(2.5, Math.max(0.5, vel / (clip('back').speed * sc))));
      else if (vel > RUN_FROM) play('run', Math.min(2.5, Math.max(0.6, vel / (clip('run').speed * sc))));
      else play('walk', Math.min(2.5, Math.max(0.5, vel / (clip('walk').speed * sc))));
    },
    setVisible(v) { root.enabled = v; },
    /** 確認用：今の動き */
    get debugState() { const l = body.anim.baseLayer; return `${current} ${l.activeState} ${l.activeStateCurrentTime?.toFixed(2)} speed${body.anim.speed.toFixed(2)}`; },
  };
}
