// 試合の流れ：フェーズ・残り時間・延長・歩ける範囲・ポイント・脱落・終了。
// PlayCanvas に依存しない「計算だけ」の部分（後でオンライン化するとき、サーバーにそのまま移せるように）
import { PHASES, POINTS, REWARDS, REWARD_PICK_TIME, PHASE_FREEZE, PHASE_TICKS, CHARACTERS, COMBAT, LOADOUTS, WEAPONS, SHIELDS } from './data.js';
import { initStance, resetStance } from './stance.js';

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
  };
  initStance(f);             // 立つ・しゃがむ・伏せる（game/stance.js）
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

  const durationOf = (i) => phaseDuration ?? PHASES[i].duration;
  const m = {
    fighters,
    state: 'running',          // running / over
    phase: 0,
    timeLeft: durationOf(0),
    overtime: false,           // 最終フェーズの延長中
    areaRadius: PHASES[0].radius,
    targetRadius: PHASES[0].radius,
    winner: null,
    elapsed: 0,
    freeze: 0,                 // 刻が変わった直後の、時間が止まっている残り（秒）。この間は誰も動けず、攻撃も当たらない

    on(type, fn) { (listeners[type] ||= []).push(fn); return m; },

    get phaseInfo() { return PHASES[m.phase]; },
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
      const opt = r.options[Math.max(0, Math.min(r.options.length - 1, index))];
      opt.reward.apply(f, opt.value);
      f.rewards.push({ phase: r.phase, id: opt.reward.id, value: opt.value });
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

      if (m.overtime) return;
      const before = Math.ceil(m.timeLeft);
      m.timeLeft -= dt;
      // 刻の終わりの PHASE_TICKS 秒：残りの秒が 1 つ減るたびに合図（時計台の秒針の音。0 秒は刻が変わる＝鐘）
      const left = Math.ceil(m.timeLeft);
      if (left < before && left >= 1 && left <= PHASE_TICKS) emit('tick', { left });
      if (m.timeLeft > 0) return;

      endPhase();
      if (m.phase < PHASES.length - 1) {
        m.phase++;
        m.timeLeft = durationOf(m.phase);
        m.targetRadius = PHASES[m.phase].radius;
        emit('phaseStart', { phase: m.phase, info: PHASES[m.phase] });
      } else {
        // 最終フェーズの時間切れ：生き残りが 1 人になるまで延長
        m.overtime = true;
        m.timeLeft = 0;
        emit('overtime', {});
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
      m.addPoints(f, pts, `${PHASES[m.phase].name}を生き残った`);
      if (f.pendingReward) m.chooseReward(f, 0); // 前の報酬を選び終えていなければ自動で
      f.pendingReward = { phase: m.phase, options: pickRewards(m.phase), timeLeft: REWARD_PICK_TIME };
    }
    emit('phaseEnd', { phase: m.phase, info: PHASES[m.phase] });
  }

  /** 報酬の候補を 3 つ（重ならないように） */
  function pickRewards(phase) {
    const pool = [...REWARDS];
    const out = [];
    while (out.length < 3 && pool.length) {
      const r = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
      out.push({ reward: r, value: r.values[Math.min(phase, r.values.length - 1)] });
    }
    return out;
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
