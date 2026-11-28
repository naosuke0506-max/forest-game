// 試合の流れ：フェーズ・残り時間・延長・歩ける範囲・ポイント・脱落・終了。
// PlayCanvas に依存しない「計算だけ」の部分（後でオンライン化するとき、サーバーにそのまま移せるように）
import { phaseAt, POINTS, REWARD_PICK_TIME, PHASE_FREEZE, PHASE_TICKS, CHARACTERS, COMBAT, LOADOUTS, WEAPONS, SHIELDS, ULTIMATE, ULTIMATES, ELEMENT_KINDS, ELEMENT_STEPS } from './data.js';
import { initStance, resetStance } from './stance.js';
import { learnMiracle, canMiracle, MIRACLE_IDS } from './miracles.js';

/** 選べる物か（武器・楯の模型と動きがある） */
const usable = (slot, id) => (slot === 'shield' ? !!SHIELDS[id] && !SHIELDS[id].planned : !!WEAPONS[id]);

/**
 * キャラの武器を決める（題の画面で選んだ物。選べない物・無い物は、そのキャラの最初の物）
 * @returns {{ main: string, side: string | null, shield: string | null }}
 */
export function resolveLoadout(char, want = null) {
  const lo = LOADOUTS[char], out = { main: null, side: null, shield: null };
  for (const slot of ['main', 'side', 'shield']) {
    const opts = (lo[slot] || []).filter((id) => usable(slot, id));
    if (opts.length) out[slot] = opts.includes(want?.[slot]) ? want[slot] : opts[0];
  }
  return out;
}

/** bot の武器：選べる物から乱数で選ぶ。rnd：0〜1 の数を返す関数 */
export function randomLoadout(char, rnd) {
  const lo = LOADOUTS[char], out = {};
  for (const slot of ['main', 'side', 'shield']) {
    const opts = (lo[slot] || []).filter((id) => usable(slot, id));
    if (opts.length) out[slot] = opts[Math.floor(rnd() * opts.length)];
  }
  return resolveLoadout(char, out);
}

/**
 * 戦う人（人間・bot 共通の記録）
 * @param {object} opt loadout：試合の前に選んだ武器 { main, side, shield }（resolveLoadout で、選べない物はキャラの最初の物にする）
 */
export function createFighter({ id, name, char, isPlayer, color, loadout = null }) {
  const c = CHARACTERS[char];
  const lo = resolveLoadout(char, loadout);
  const f = {
    id, name, char, isPlayer, color,
    x: 0, z: 0, yaw: 0, pitch: 0,
    alive: true,
    points: 0,
    kills: 0,
    log: [],                 // ポイントの内訳 [理由, 点数]
    state: 'normal',         // normal / enhanced（肉体強化）/ mutated（変異）… 手順 6 で使う
    stats: { maxHp: c.maxHp, hp: c.maxHp, attack: 1, defense: 1, speed: c.speed, maxStamina: COMBAT.maxStamina },
    // 戦闘（game/combat.js が動かす）
    weapon: lo.main,         // 手に持っている武器（WEAPONS の名前）
    primary: lo.main,        // 主の武器（右手）
    sidearm: lo.side,        // 持替で持つ近接武器（弓兵の短劍）
    left: c.left,            // 左手ボタンでできること（guard / heavy / switch）
    weight: c.weight,        // 装備の重さ（回避の仕方が変わる）
    shield: lo.shield,       // 左手の楯（SHIELDS の名前。無ければ null）
    armor: c.armor,
    stamina: COMBAT.maxStamina,
    staminaDelay: 0,         // スタミナが戻り始めるまでの残り時間
    action: null,            // 行動中：{ kind: 'attack', t, hit } / { kind: 'draw', t } / { kind: 'dodge', t, dirX, dirZ, moved }
    guarding: false,
    stun: 0,                 // ひるんでいる残り時間
    lastHitBy: null,
    hitFlash: 0,             // 見た目用：攻撃を受けた直後
    pendingReward: null,     // 選んでいる途中のフェーズ報酬 { phase, options, timeLeft }
    rewards: [],             // 選んだ報酬
    ultLeft: ULTIMATE.uses,  // 必殺技の残りの回数（1 つの試合で 1 回。延長戰でもう 1 回。game/ultimate.js）
    ultUsed: 0,
  };
  initStance(f);             // 立つ・しゃがむ・伏せる（game/stance.js）
  // 祓魔僧は、初めから全部の奇跡を使える（利用者の指示 2026-11-27。前は刻の褒美で 1 つずつ覚えた）
  if (canMiracle(f)) { for (const id of MIRACLE_IDS) learnMiracle(f, id); f.miracle.sel = 0; }
  return f;
}

/**
 * @param {object} opt
 * @param {ReturnType<typeof createFighter>[]} opt.fighters
 * @param {{next: () => number}} opt.rng 種から決まる乱数（報酬の候補選びに使う）
 * @param {number} [opt.phaseTimeScale] フェーズの長さの倍率（確認用に短くする）
 */
export function createMatch({ fighters, rng, phaseDuration = null }) {
  const listeners = {};
  const emit = (type, data) => (listeners[type] || []).forEach((fn) => fn(data));

  const durationOf = (i) => phaseDuration ?? phaseAt(i).duration;
  const m = {
    fighters,
    state: 'running',          // running / over
    phase: 0,
    timeLeft: durationOf(0),
    overtime: false,           // 延長（前の「終刻」の時間切れ）。2026-11-17 から刻はめぐり続けるので、使わない（いつも false）
    areaRadius: phaseAt(0).radius,
    targetRadius: phaseAt(0).radius,
    winner: null,
    elapsed: 0,
    freeze: 0,                 // 刻が変わった直後の、時間が止まっている残り（秒）。この間は誰も動けず、攻撃も当たらない

    on(type, fn) { (listeners[type] ||= []).push(fn); return m; },

    get phaseInfo() { return phaseAt(m.phase); },
    get alive() { return fighters.filter((f) => f.alive); },

    /** 点数順（高い順）。同点なら生き残っている方を上に */
    ranking() {
      return [...fighters].sort((a, b) => b.points - a.points || Number(b.alive) - Number(a.alive) || a.id - b.id);
    },

    addPoints(f, n, why) {
      if (m.state !== 'running' || !n) return;
      f.points += n;
      f.log.push([why, n]);
      emit('points', { fighter: f, amount: n, why });
    },

    /**
     * 脱落させる。kind：倒された側の状態（normal / enhanced / mutated）で、倒した側の点数が変わる
     * @param {object|null} killer 倒した人（クリーチャーや事故なら null）
     */
    eliminate(victim, killer = null) {
      if (m.state !== 'running' || !victim.alive) return;
      victim.alive = false;
      resetStance(victim);
      victim.pendingReward = null;
      if (killer && killer !== victim) {
        killer.kills++;
        const pts = victim.state === 'mutated' ? POINTS.killMutatedPlayer
          : victim.state === 'enhanced' ? POINTS.killEnhancedPlayer : POINTS.killPlayer;
        const what = victim.state === 'mutated' ? '變異した' : victim.state === 'enhanced' ? '剛體化した' : '';
        m.addPoints(killer, pts, `${what}${victim.name}を倒した`);
      }
      emit('eliminated', { victim, killer });
      if (m.alive.length <= 1) finish();
    },

    /** フェーズ報酬を選ぶ（人間は画面から、bot は自動で） */
    chooseReward(f, index) {
      const r = f.pendingReward;
      if (!r || !f.alive) return;
      // 選べない札（未完）なら、選べる札のうち最初の物。どれも選べなければ、何も付かずに閉じる
      let opt = r.options[Math.max(0, Math.min(r.options.length - 1, index))];
      if (opt?.reward.planned) opt = r.options.find((o) => !o.reward.planned) || null;
      if (opt) {
        opt.reward.apply(f, opt.value);
        f.rewards.push({ phase: r.phase, id: opt.reward.id, value: opt.value });
      }
      f.pendingReward = null;
      emit('rewardChosen', { fighter: f, option: opt });
    },

    update(dt) {
      if (m.state !== 'running') return;
      // 刻が変わった直後：時間が止まっている。報酬を選ぶ時間だけ進む（刻の時計は進まない）
      if (m.freeze > 0) {
        m.freeze = Math.max(0, m.freeze - dt);
        for (const f of fighters) {
          if (!f.pendingReward) continue;
          f.pendingReward.timeLeft -= dt;
          if (f.pendingReward.timeLeft <= 0) m.chooseReward(f, 0);
        }
        if (m.freeze <= 0) emit('thaw', {});
        return;
      }
      m.elapsed += dt;

      // 歩ける範囲を、次の大きさへなめらかに広げる（1 秒あたり 4m）
      if (m.areaRadius < m.targetRadius) m.areaRadius = Math.min(m.targetRadius, m.areaRadius + dt * 4);

      // 選ぶのが遅いフェーズ報酬は、最初の候補を自動で選ぶ
      for (const f of fighters) {
        if (!f.pendingReward) continue;
        f.pendingReward.timeLeft -= dt;
        if (f.pendingReward.timeLeft <= 0) m.chooseReward(f, 0);
      }

      const before = Math.ceil(m.timeLeft);
      m.timeLeft -= dt;
      // 刻の終わりの PHASE_TICKS 秒：残りの秒が 1 つ減るたびに合図（時計台の秒針の音。0 秒は刻が変わる＝鐘）
      const left = Math.ceil(m.timeLeft);
      if (left < before && left >= 1 && left <= PHASE_TICKS) emit('tick', { left });
      if (m.timeLeft > 0) return;

      endPhase();
      // 次の刻へ（第 5 刻の後は、朝・昼・夕日・夜を繰り返す。最後の 1 人になるまで続く）
      m.phase++;
      m.timeLeft = durationOf(m.phase);
      m.targetRadius = phaseAt(m.phase).radius;
      emit('phaseStart', { phase: m.phase, info: phaseAt(m.phase) });
      // 延長戰（第 6 刻から。はじめの長い夜の後）：生き残っている人は、必殺技をもう 1 回使える（利用者の指示 2026-11-25）
      if (m.phase === ULTIMATE.overtime) {
        m.overtime = true;
        for (const f of m.alive) f.ultLeft = (f.ultLeft ?? 0) + ULTIMATE.overtimeUses;
        emit('overtime', { phase: m.phase });
      }
      // 刻を越えたら、時間が止まる（その間に報酬を選ぶ）
      m.freeze = PHASE_FREEZE;
      emit('freeze', { time: PHASE_FREEZE });
    },
  };

  /** フェーズを生き残った人に点数と報酬を */
  function endPhase() {
    const pts = POINTS.phaseSurvive[m.phase] ?? POINTS.phaseSurvive.at(-1);
    for (const f of m.alive) {
      m.addPoints(f, pts, `${phaseAt(m.phase).name}を生き残った`);
      if (f.pendingReward) m.chooseReward(f, 0); // 前の報酬を選び終えていなければ自動で
      f.pendingReward = { phase: m.phase, options: pickRewards(m.phase, f), timeLeft: REWARD_PICK_TIME };
    }
    emit('phaseEnd', { phase: m.phase, info: phaseAt(m.phase) });
  }

  /**
   * 報酬の札を 3 枚（利用者の指示 2026-11-27）：属性強化（その人の属性の次の段＝纏 → 操 → 従）・變異強化・兵器強化。
   * 變異強化・兵器強化は、中身（クリーチャーになる・兵器に乗る・撃つ）ができるまで「未完」で選べない。操・従も、できるまで「未完」。
   * 前の能力値の札（data.js の REWARDS）と奇跡の札は出さない（祓魔僧は初めから全部の奇跡を使える）
   */
  function pickRewards(phase, f = null) {
    const el = f ? ULTIMATES[f.char]?.element : null;
    const step = f ? ELEMENT_STEPS[f.elemStep || 0] : null;
    const E = el ? ELEMENT_KINDS[el] : null;
    const elementCard = step && E ? {
      reward: { id: `element:${step.id}`, kind: 'element', step: step.id, el, name: `${step.name}・${E.name}`, short: step.short, planned: !!step.planned,
        apply: (who) => { if (step.id === 'enchant') who.enchant = el; who.elemStep = (who.elemStep || 0) + 1; } },
      value: '',
    } : { reward: { id: 'element:done', kind: 'element', name: '屬性強化', short: 'これ以上は無い', planned: true, apply: () => {} }, value: '' };
    return [
      elementCard,
      { reward: { id: 'mutation', kind: 'mutation', name: '變異強化', short: 'クリーチャーに変わる藥を強める', planned: true, apply: () => {} }, value: '' },
      { reward: { id: 'arms', kind: 'arms', name: '兵器強化', short: '兵器を強める', planned: true, apply: () => {} }, value: '' },
    ];
  }

  function finish() {
    const last = m.alive;
    if (last.length === 1) {
      m.addPoints(last[0], POINTS.lastSurvivor, '最終生存');
    }
    m.state = 'over';
    const ranking = m.ranking();
    m.winner = ranking[0];
    emit('end', { ranking, winner: m.winner, survivor: last[0] || null });
  }

  return m;
}
