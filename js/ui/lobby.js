// 題の画面と大廳、試合の前に選ぶ画面の流れ（画面の文字とボタンだけ。後ろの 3D の広間は render/hall.js）
//   題（蠱毒・読み込み）→「入」→ 大廳（戰鬥・圖鑑・設定）→ 戰鬥（蠱毒）→ 戰場（森）→ 人物・武器 → 兵器・變異 →「開戰」
//   人物・武器を替えると、大廳に立つ人物も替わる（onShow）
import { L } from './labels.js';
import { ruby, rubyIn } from './ruby.js';
import { CHARACTERS, LOADOUTS, WEAPONS, SHIELDS, PLANNED, MODES, MAPS, ARMS, MUTATIONS, PHASES } from '../game/data.js';
import { resolveLoadout } from '../game/match.js';
import { createCodex } from './codex.js';
import { ICONS } from './icons.js';

// 武器を選ぶ枠：右手（主の武器）・左手（楯）・持替（弓兵の近接武器）
const SLOTS = [['main', L.main], ['shield', L.shield], ['side', L.side]];
const nameOf = (slot, id) => (slot === 'shield' ? SHIELDS[id]?.name : WEAPONS[id]?.name ?? PLANNED[id]) || id;
const plannedOf = (slot, id) => (slot === 'shield' ? !SHIELDS[id] || SHIELDS[id].planned : !WEAPONS[id]);
const eraOf = (char) => CHARACTERS[char].era ?? 'medieval';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 画面の順番と見出し（大廳は数えない）
const STEPS = ['mode', 'map', 'char', 'arms'];
const HEADS = { hall: L.hall, codex: L.codex, mode: L.battle, map: L.map, char: `${L.person}・${L.weapon}`, arms: `${L.arms}・${L.mutation}` };
const BACK = { codex: 'hall', mode: 'hall', map: 'mode', char: 'map', arms: 'char' };

/**
 * @param {object} o
 * @param {() => void} o.onEnter 題の画面から大廳へ入ったとき（音を出せるようにし、3D の広間を出す）
 * @param {(char: string, loadout: object) => void} o.onShow 大廳に立たせる人物（キャラと武器）が変わったとき
 * @param {() => void} o.onSettings 大廳の「設定」
 * @param {() => object} o.hall 大廳の 3D（圖鑑で人物の動きを流し、武器を見せる）
 */
export function createLobby({ onGate = () => {}, onEnter = () => {}, onHall = () => {}, onShow = () => {}, onSettings = () => {}, hall = () => null } = {}) {
  const title = document.getElementById('title');
  const gate = document.getElementById('gate'), fade = document.getElementById('fade');
  // 題の画面の設定ボタン（題曲の版・音の大きさ）
  const gear = document.getElementById('title-settings');
  gear.innerHTML = ICONS.gear;
  // index.html に書いた見出し・ボタン・設定の読みにくい漢字に、ふりがなを付ける（ui/ruby.js）
  rubyIn(document, '[data-ruby], [data-ruby-all] button');
  gear.addEventListener('click', () => onSettings());
  // 最初に触れる画面：触れたら音を出せるようにして題の曲を流し、題の画面を出す。
  // iPad の Safari は、指が触れた瞬間（pointerdown）ではなく、指を離したとき（click）しか音を許さないので click で受ける
  const openGate = (e) => {
    e?.preventDefault?.();
    gate.removeEventListener('click', openGate);
    onGate();
    gate.classList.add('gone');
    title.hidden = false;
    setTimeout(() => { gate.hidden = true; }, 900);
  };
  gate.addEventListener('click', openGate);
  const enterBtn = document.getElementById('start');
  const lobby = document.getElementById('lobby');
  const head = document.getElementById('lobby-title'), stepEl = document.getElementById('lobby-step');
  const backBtn = document.getElementById('lobby-back'), fightBtn = document.getElementById('fight');
  const panes = Object.fromEntries([...lobby.querySelectorAll('.pane')].map((p) => [p.dataset.pane, p]));

  // ---- 選んでいる物 ----
  const pick = { mode: 'kodoku', map: 'forest', char: 'shield', arms: null, mutation: null };
  const loadouts = Object.fromEntries(Object.keys(CHARACTERS).map((id) => [id, resolveLoadout(id)]));
  const show = () => onShow(pick.char, { ...loadouts[pick.char] });

  // ---- 画面の切り替え ----
  const codex = createCodex({ hall });
  let step = 'hall';
  function go(to) {
    // 圖鑑を閉じたら、動きと武器を片付けて、選んでいる人物を立たせ直す
    if (step === 'codex' && to !== 'codex') { codex.close(); show(); }
    step = to;
    for (const [k, p] of Object.entries(panes)) p.hidden = k !== to;
    head.innerHTML = ruby(HEADS[to]);   // 読みにくい漢字にはふりがな（ui/ruby.js）
    const i = STEPS.indexOf(to);
    stepEl.textContent = i >= 0 ? `${i + 1} / ${STEPS.length}` : '';
    backBtn.hidden = to === 'hall';
    if (to === 'hall') renderWho();
    if (to === 'arms') renderArms();
    if (to === 'codex') codex.open(pick.char);
  }
  backBtn.addEventListener('click', () => go(BACK[step] || 'hall'));
  lobby.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { go(g.dataset.go); return; }
    if (e.target.closest('[data-act="settings"]')) onSettings();
  });

  // ---- 大廳：今の人物と武器 ----
  const who = document.getElementById('hall-who');
  function renderWho() {
    const lo = loadouts[pick.char];
    const gear = [lo.main && nameOf('main', lo.main), lo.shield && nameOf('shield', lo.shield), lo.side && nameOf('side', lo.side)].filter(Boolean);
    who.innerHTML = `<b>${ruby(CHARACTERS[pick.char].name)}</b><span>${gear.map(ruby).join('・')}</span>`;
  }

  // ---- 戰鬥・戰場：1 つだけの札（今は蠱毒と森だけ） ----
  function cards(el, table, key) {
    el.innerHTML = Object.entries(table).map(([id, m]) => `<button type="button" class="card${pick[key] === id ? ' sel' : ''}" data-id="${id}" aria-pressed="${pick[key] === id}">
      <b>${ruby(m.name)}</b><span>${esc(m.desc)}</span></button>`).join('');
    el.onclick = (e) => {
      const b = e.target.closest('.card');
      if (!b) return;
      pick[key] = b.dataset.id;
      cards(el, table, key);
    };
  }
  cards(document.getElementById('mode-list'), MODES, 'mode');
  cards(document.getElementById('map-list'), MAPS, 'map');

  // ---- 人物・武器（試合の途中では替えられない。模型と動きがまだ無い物は「未完」で選べない） ----
  const list = document.getElementById('char-select');
  const desc = document.getElementById('char-desc');
  const loadoutEl = document.getElementById('loadout');
  const renderLoadout = () => {
    const lo = LOADOUTS[pick.char], cur = loadouts[pick.char];
    loadoutEl.innerHTML = SLOTS.filter(([slot]) => lo[slot]?.length).map(([slot, label]) => `<div class="lo-row" role="group" aria-label="${label}">
      <span class="lo-label">${label}</span>
      <div class="lo-opts">${lo[slot].map((id) => {
        const off = plannedOf(slot, id);
        return `<button type="button" class="lo-btn${cur[slot] === id ? ' sel' : ''}" data-slot="${slot}" data-id="${id}" aria-pressed="${cur[slot] === id}"${off ? ' disabled' : ''}>${nameOf(slot, id)}${off ? `<small>${L.planned}</small>` : ''}</button>`;
      }).join('')}</div>
    </div>`).join('');
    rubyIn(loadoutEl, '.lo-btn');
  };
  loadoutEl.addEventListener('click', (e) => {
    const b = e.target.closest('.lo-btn');
    if (!b || b.disabled) return;
    loadouts[pick.char][b.dataset.slot] = b.dataset.id;
    renderLoadout();
    show();
  });
  const renderChar = () => {
    for (const b of list.children) b.classList.toggle('sel', b.dataset.id === pick.char);
    desc.textContent = CHARACTERS[pick.char].desc;
    renderLoadout();
  };
  for (const [id, c] of Object.entries(CHARACTERS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'char-btn';
    b.dataset.id = id;
    b.innerHTML = ruby(c.name);
    b.addEventListener('click', () => { pick.char = id; renderChar(); show(); });
    list.appendChild(b);
  }
  renderChar();

  // ---- 兵器・變異：キャラの時代のものから、それぞれ 1 つ（強いほど遅く届く） ----
  const armsEl = document.getElementById('arms-list'), mutEl = document.getElementById('mut-list');
  const when = (tier) => `${PHASES[tier - 1]?.name ?? ''}を越えると届く`;
  function picks(el, table, key, extra) {
    const era = eraOf(pick.char);
    const ids = Object.keys(table).filter((id) => table[id].era === era).sort((a, b) => table[a].tier - table[b].tier);
    if (!ids.includes(pick[key])) pick[key] = ids[0] ?? null;
    el.innerHTML = ids.map((id) => {
      const m = table[id], on = pick[key] === id;
      return `<button type="button" class="pick${on ? ' sel' : ''}" data-id="${id}" aria-pressed="${on}">
        <span class="pick-name">${ruby(m.name)}${m.planned ? `<small>${L.planned}</small>` : ''}</span>
        <span class="pick-when">${esc(when(m.tier))}</span>
        <span class="pick-desc">${esc(m.desc)}${extra ? esc(extra(m)) : ''}</span></button>`;
    }).join('');
    el.onclick = (e) => {
      const b = e.target.closest('.pick');
      if (!b) return;
      pick[key] = b.dataset.id;
      picks(el, table, key, extra);
    };
  }
  function renderArms() {
    picks(armsEl, ARMS, 'arms');
    picks(mutEl, MUTATIONS, 'mutation', (m) => `（クリーチャーは${m.creature ?? L.creatureTbd}）`);
  }

  return {
    /** 読み込みの進み具合 */
    progress(done, total) {
      enterBtn.textContent = `${L.loading}… ${Math.round((done / total) * 100)}%`;
    },
    /**
     * 読み込みが終わったら、題の画面の「入」を押せるようにする
     * @param {(char: string, loadout: object) => Promise<void>} onStart 「開戰」：試合を始める（loadout に兵器・變異・戰鬥・戰場も入れる）
     */
    ready(onStart) {
      enterBtn.disabled = false;
      enterBtn.textContent = L.enter;
      enterBtn.addEventListener('click', () => {
        if (!gate.hidden) openGate();
        // 「時が動き出す音」を鳴らし、題の文字が大きくなりながら消え、画面が暗くなったところで大廳に切り替えて明ける
        onEnter();
        title.classList.add('leaving');
        fade.classList.add('on');
        setTimeout(() => {
          onHall();
          show();
          title.hidden = true;
          title.classList.remove('leaving');
          lobby.hidden = false;
          go('hall');
          setTimeout(() => fade.classList.remove('on'), 120);
        }, 750);
      }, { once: true });
      fightBtn.addEventListener('click', async () => {
        // キャラの模型を読み込む間は、画面を出したまま待つ
        fightBtn.disabled = true;
        fightBtn.textContent = `${L.loading}…`;
        try {
          await onStart(pick.char, { ...loadouts[pick.char], arms: pick.arms, mutation: pick.mutation, mode: pick.mode, map: pick.map });
        } finally { lobby.hidden = true; }
      }, { once: true });
    },
    fail(message) {
      enterBtn.textContent = L.startFail;
      window.__showError?.(message);
    },
  };
}
