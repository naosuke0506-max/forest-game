// 試合中の画面表示：フェーズと残り時間、右上のランキング、ポイントの知らせ、
// 画面中央の大きな知らせ、フェーズ報酬の選択、試合の結果
import { L } from './labels.js';
import * as pc from 'playcanvas';
import { CHARACTERS, phaseAt, DIVE } from '../game/data.js';
import { TIMES } from '../world/time-of-day.js';
import { timeIcon, weaponIconOf } from './icons.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** label：決まった見出し（教練の間。時間は進まないので、残り時間の代わりに出す） */
// bot の名前の横に付ける札（利用者の指示 2026-11-14：bot だったら bot と書く。相手を探す画面・順位・結果に出す）
const BOT_TAG = '<small class="bot-tag">bot</small>';

export function createHud(match, me, { label = null, trial = null } = {}) {
  const phaseName = $('#phase-name'), phaseTime = $('#phase-time'), phaseIcon = $('#phase-icon');
  // 試驗用の刻之長（設定の 60 秒・30 秒、URL の ?phase=）で試合をしているときは、残り時間の下に小さく書く（通常の長さと見分ける）
  if (trial && !label) phaseTime.dataset.trial = `試驗用 ${trial} 秒`;
  else delete phaseTime.dataset.trial;
  let shownTime = null;
  const ranking = $('#ranking'), feed = $('#feed');
  const center = $('#center-msg');
  // 教練の間は、得点の順位と、得点・倒した知らせ（左下）を出さない（得点は意味が無く、左の手順の札と重なる）
  $('#hud').classList.toggle('tutoring', !!label);
  const reward = $('#reward');
  let centerTimer = 0, lastRankKey = '', shownReward = null;


  function centerMsg(title, sub = '', seconds = 3.5) {
    center.querySelector('.cm-title').textContent = title;
    center.querySelector('.cm-sub').textContent = sub;
    center.hidden = false;
    // 同じ要素で動きをやり直す
    center.style.animation = 'none'; void center.offsetWidth; center.style.animation = '';
    centerTimer = seconds;
  }

  function addFeed(text) {
    const d = document.createElement('div');
    d.textContent = text;
    feed.appendChild(d);
    while (feed.children.length > 5) feed.firstChild.remove();
    setTimeout(() => d.remove(), 5000);
  }

  function renderRanking() {
    const list = match.ranking();
    const key = list.map((f) => `${f.id}:${f.points}:${f.alive}`).join('|');
    if (key === lastRankKey) return;
    lastRankKey = key;
    ranking.innerHTML = list.map((f, i) => `
      <li class="${f === me ? 'me' : ''} ${f.alive ? '' : 'out'}">
        <span>${i + 1}</span>
        <span><i class="dot" style="background:${f.color}"></i>${esc(f.name)}${f.bot ? BOT_TAG : ''}</span>
        <span class="pts">${f.points}</span>
      </li>`).join('');
  }

  function showReward() {
    const r = me.pendingReward;
    shownReward = r;
    reward.querySelector('.reward-head').textContent = `${phaseAt(r.phase).name} ${L.cleared}`;
    const cards = reward.querySelector('.reward-cards');
    cards.innerHTML = '';
    r.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'reward-card';
      b.innerHTML = `<div class="rc-name">${esc(o.reward.name)}</div><div class="rc-val">+${o.value}${o.reward.unit}</div>`;
      b.addEventListener('click', () => { match.chooseReward(me, i); });
      cards.appendChild(b);
    });
    reward.hidden = false;
  }

  // 試合の出来事
  match.on('points', ({ fighter, amount, why }) => {
    if (fighter === me) addFeed(`+${amount}　${why}`);
  });
  match.on('eliminated', ({ victim, killer }) => {
    addFeed(killer ? `${killer.name} が ${victim.name} を倒した` : `${victim.name} が脱落した`);
    if (victim === me) centerMsg(L.out, '残りの戦いを見届ける', 4);
  });
  match.on('phaseStart', ({ info }) => centerMsg(`${info.name}・${TIMES[info.time]?.name ?? ''}`, info.note));
  match.on('rewardChosen', ({ fighter, option }) => {
    if (fighter !== me) return;
    reward.hidden = true;
    shownReward = null;
    addFeed(`報酬：${option.reward.name} +${option.value}${option.reward.unit}`);
  });

  // ===== 戦闘の表示 =====
  const hpFill = $('#hp-fill'), hpText = $('#hp-text'), stFill = $('#st-fill');
  // 体力の板：紋章（持っている武器の絵）・人物の名前・受けた分が遅れて減る棒（見た目は css の .vitals）
  const hpTrail = $('#hp-trail'), vitalsEl = $('.vitals'), crest = $('#vt-crest'), nameEl = $('#vt-name');
  if (nameEl) nameEl.textContent = CHARACTERS[me.char]?.name || '';
  let crestOf = null, hpShown = -1, stShown = -1, lowShown = null;
  const brBar = $('#br-bar'), brFill = $('#br-fill');
  let brShown = false, brW = -1;
  // 上の飾り板：刻の残りの線と、生き残りの人数
  const phaseFill = $('#phase-fill'), aliveEl = $('#alive-count');
  let phaseOf = -1, phaseMax = 1, fillShown = -1, aliveShown = -1;
  const tagsLayer = $('#tags'), hurtEl = $('#hurt');
  const tagEls = new Map();
  const screenPos = new pc.Vec3(), worldPos = new pc.Vec3();
  let hurtTimer = 0;

  /** 世界の位置 → 画面の位置（CSS ピクセル）。カメラの後ろなら null */
  function toScreen(camera, x, y, z, out) {
    worldPos.set(x, y, z);
    const p = camera.camera.worldToScreen(worldPos, out);
    return p.z > 0 ? p : null;
  }

  return {
    centerMsg,
    addFeed,
    /** 自分の体力とスタミナ */
    updateVitals(f) {
      // 変わったときだけ書き換える（毎フレーム同じ値を書かない）
      const hp = Math.max(0, Math.round((1000 * f.stats.hp) / f.stats.maxHp) / 10), st = Math.max(0, Math.round((200 * f.stamina) / f.stats.maxStamina) / 2);
      if (hp !== hpShown) {
        hpShown = hp;
        hpFill.style.width = `${hp}%`;
        if (hpTrail) hpTrail.style.width = `${hp}%`;   // 淡い金の棒：css で遅れて減る
        hpText.textContent = `${Math.ceil(f.stats.hp)} / ${f.stats.maxHp}`;
      }
      if (st !== stShown) { stShown = st; stFill.style.width = `${st}%`; }
      // 息（潜っている間と、戻りきるまで出す。残り 5 秒を切ると脈打つ）
      if (brBar) {
        const full = DIVE.breath, b = f.breath ?? full, show = f.alive && (f.diving || b < full - 0.05);
        const bw = Math.max(0, Math.round((200 * b) / full) / 2);
        if (show !== brShown) { brShown = show; brBar.hidden = !show; }
        if (show && bw !== brW) { brW = bw; brFill.style.width = `${bw}%`; brBar.classList.toggle('low', b < 5); }
      }
      const low = f.alive && f.stats.hp < f.stats.maxHp * 0.3;
      if (low !== lowShown) { lowShown = low; vitalsEl?.classList.toggle('low', low); }
      if (crest && crestOf !== f.weapon) { crestOf = f.weapon; crest.innerHTML = weaponIconOf(f.weapon); }
      if (hurtTimer > 0) { hurtTimer -= 1 / 60; if (hurtTimer <= 0) hurtEl.style.opacity = 0; }
    },
    /** ほかの人の頭上に、名前と体力（近くて画面に入っている人だけ） */
    updateTags(camera, fighters, heightAt) {
      const cam = camera.getPosition();
      for (const f of fighters) {
        if (f === me) continue;
        let el = tagEls.get(f);
        if (!el) {
          el = document.createElement('div');
          el.className = 'tag';
          el.innerHTML = `<div>${esc(f.name)}</div><div class="tbar"><i></i></div>`;
          tagsLayer.appendChild(el);
          tagEls.set(f, el);
        }
        const d = Math.hypot(f.x - cam.x, f.z - cam.z);
        const p = f.alive && !f.hidden && d < 35 ? toScreen(camera, f.x, (f.y ?? heightAt(f.x, f.z)) + 2.1, f.z, screenPos) : null;
        if (!p) { el.style.display = 'none'; continue; }
        el.style.display = '';
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y}px`;
        el.lastChild.firstChild.style.width = `${(100 * f.stats.hp) / f.stats.maxHp}%`;
      }
    },
    /** 与えたダメージの数字 */
    showDamage(camera, x, y, z, amount, guarded) {
      const p = toScreen(camera, x, y, z, new pc.Vec3());
      if (!p) return;
      const el = document.createElement('div');
      el.className = `dmg${guarded ? ' guarded' : ''}`;
      el.textContent = guarded ? `防 ${Math.round(amount)}` : Math.round(amount);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      tagsLayer.appendChild(el);
      setTimeout(() => el.remove(), 800);
    },
    /** 攻撃を受けたとき、画面の縁を赤くする */
    hurt(strength = 1) {
      hurtEl.style.opacity = Math.min(1, 0.45 + 0.4 * strength);
      hurtTimer = 0.35;
    },
    update(dt) {
      // 左上：フェーズと残り時間
      phaseName.textContent = label ? label[0] : `${match.phaseInfo.name}・${TIMES[match.phaseInfo.time]?.name ?? ''}`;
      if (shownTime !== match.phaseInfo.time) { shownTime = match.phaseInfo.time; phaseIcon.innerHTML = timeIcon(shownTime); }
      if (label) {
        phaseTime.textContent = label[1];
        phaseTime.classList.remove('overtime');
      } else if (match.overtime) {
        phaseTime.textContent = L.overtime;
        phaseTime.classList.add('overtime');
      } else {
        phaseTime.textContent = formatTime(match.timeLeft);
        phaseTime.classList.remove('overtime');
      }
      // 刻の残りの線（その刻で初めに見た残り時間を満タンとする）と、生き残りの人数
      if (!label) {
        if (match.phase !== phaseOf) { phaseOf = match.phase; phaseMax = Math.max(1, match.timeLeft); }
        const fill = match.overtime ? 100 : Math.max(0, Math.min(100, Math.round((100 * match.timeLeft) / phaseMax)));
        if (fill !== fillShown && phaseFill) { fillShown = fill; phaseFill.style.width = `${fill}%`; }
        const alive = match.fighters.reduce((n, f) => n + (f.alive ? 1 : 0), 0);
        if (alive !== aliveShown && aliveEl) { aliveShown = alive; aliveEl.textContent = alive; }
      }
      renderRanking();
      // 中央の知らせ
      if (centerTimer > 0) { centerTimer -= dt; if (centerTimer <= 0) center.hidden = true; }
      // フェーズ報酬（自分の分）
      if (me.pendingReward && me.pendingReward !== shownReward) showReward();
      if (!me.pendingReward && !reward.hidden) reward.hidden = true;
      if (me.pendingReward) {
        reward.querySelector('.reward-time').textContent = `${Math.ceil(me.pendingReward.timeLeft)} 秒で自動で選ぶ`;
      }
    },
    /** 試合の結果 */
    showResult({ ranking: list, winner, survivor }) {
      reward.hidden = true;
      const res = $('#result');
      res.querySelector('.result-head').textContent = winner === me ? L.victory : `${winner.name} ${L.victory}`;
      res.querySelector('.result-list').innerHTML = list.map((f, i) => {
        const tags = [CHARACTERS[f.char]?.name, f === survivor ? L.survivor : (f.alive ? '' : L.out)].filter(Boolean).join('・');
        return `<li class="${f === me ? 'me' : ''}"><span>${i + 1}</span><span>${esc(f.name)}${f.bot ? BOT_TAG : ''}</span><span>${f.points} ${L.points}</span><span class="why">${esc(tags)}　${L.kills} ${f.kills}</span></li>`;
      }).join('');
      res.hidden = false;
    },
  };
}
