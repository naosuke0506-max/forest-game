// 試合中の画面表示：フェーズと残り時間、右上のランキング、ポイントの知らせ、
// 画面中央の大きな知らせ、フェーズ報酬の選択、試合の結果
import { CHARACTERS, PHASES } from '../game/data.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createHud(match, me) {
  const phaseName = $('#phase-name'), phaseTime = $('#phase-time');
  const ranking = $('#ranking'), feed = $('#feed');
  const center = $('#center-msg');
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
        <span><i class="dot" style="background:${f.color}"></i>${esc(f.name)}</span>
        <span class="pts">${f.points}</span>
      </li>`).join('');
  }

  function showReward() {
    const r = me.pendingReward;
    shownReward = r;
    reward.querySelector('.reward-head').textContent = `${PHASES[r.phase].name} 突破`;
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
    if (victim === me) centerMsg('脱落', '残りの戦いを見届ける', 4);
  });
  match.on('phaseStart', ({ info }) => centerMsg(info.name, info.note));
  match.on('overtime', () => centerMsg('延長戦', '最後の一人になるまで終わらない'));
  match.on('rewardChosen', ({ fighter, option }) => {
    if (fighter !== me) return;
    reward.hidden = true;
    shownReward = null;
    addFeed(`報酬：${option.reward.name} +${option.value}${option.reward.unit}`);
  });

  return {
    centerMsg,
    addFeed,
    update(dt) {
      // 左上：フェーズと残り時間
      phaseName.textContent = match.phaseInfo.name;
      if (match.overtime) {
        phaseTime.textContent = '延長戦';
        phaseTime.classList.add('overtime');
      } else {
        phaseTime.textContent = formatTime(match.timeLeft);
        phaseTime.classList.remove('overtime');
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
      res.querySelector('.result-head').textContent = winner === me ? '勝利' : `${winner.name} の勝利`;
      res.querySelector('.result-list').innerHTML = list.map((f, i) => {
        const tags = [CHARACTERS[f.char]?.name, f === survivor ? '最後の生き残り' : (f.alive ? '' : '脱落')].filter(Boolean).join('・');
        return `<li class="${f === me ? 'me' : ''}"><span>${i + 1}</span><span>${esc(f.name)}</span><span>${f.points} 点</span><span class="why">${esc(tags)}　撃破 ${f.kills}</span></li>`;
      }).join('');
      res.hidden = false;
    },
  };
}
