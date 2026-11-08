// 圖鑑（大廳から開く）：人物（能力・武器・技・動きの再生）・武器（模型・数値・技）・兵器・魔物（まだ未完）
//   後ろの 3D の広間（render/hall.js）に、選んだ人物を立たせて動きを流し、武器は壇の上に浮かべて回して見せる
//   動きの再生は、動作監督の画面と同じ作り：動きの一覧（見出しごと）・流す／止める・繰り返す・速さ・時刻のつまみ
import { L } from './labels.js';
import { CHARACTERS, LOADOUTS, WEAPONS, SHIELDS, PLANNED, ARMS, MUTATIONS, PHASES } from '../game/data.js';
import { resolveLoadout } from '../game/match.js';
import { CLIP_NAMES, CLIP_DESC, CLIP_GROUPS, WEAPON_KIND, SKILLS, COMMON_SKILLS } from '../game/codex.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WEIGHT = { light: '輕裝', medium: '中裝', heavy: '重裝' };
const TABS = [['person', L.person], ['weapon', L.weapon], ['arms', L.arms], ['beast', L.beast]];
const SPEEDS = [[0.25, '×¼'], [0.5, '×½'], [1, '×1']];
const weaponName = (id) => WEAPONS[id]?.name ?? SHIELDS[id]?.name ?? PLANNED[id] ?? id;
const isPlanned = (id) => (SHIELDS[id] ? !!SHIELDS[id].planned : !WEAPONS[id]);

/** 技の一覧（名前・出し方・説明。ゲームでまだ使えない物は「未完」） */
function skillList(list) {
  if (!list?.length) return '';
  return `<ul class="skills">${list.map((s) => `<li><b>${esc(s.name)}${s.done ? '' : `<small>${L.planned}</small>`}</b>
    <span class="how">${esc(s.how)}</span><span class="sdesc">${esc(s.desc)}</span></li>`).join('')}</ul>`;
}
const row = (k, v) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`;

/**
 * @param {object} o
 * @param {() => object} o.hall 大廳の 3D（show・direct・seek・showWeapon など）
 */
export function createCodex({ hall }) {
  const pane = document.querySelector('[data-pane="codex"]');
  const tabsEl = document.getElementById('codex-tabs');
  const body = document.getElementById('codex-body');
  let tab = 'person', char = 'shield', weapon = 'armingsword', group = null, clip = null, open = false, raf = 0;
  let shown = null;   // 大廳に立っている（読み終わった）人物。替えた直後は、読み終わるまで前の人物の動きを出さない

  tabsEl.innerHTML = TABS.map(([id, name]) => `<button type="button" class="tab" data-tab="${id}">${name}</button>`).join('');
  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (b) setTab(b.dataset.tab);
  });

  function setTab(t) {
    tab = t;
    for (const b of tabsEl.children) b.classList.toggle('sel', b.dataset.tab === t);
    hall().direct(null);
    hall().showWeapon(t === 'weapon' && !isPlanned(weapon) ? weapon : null);
    if (t === 'person' || t === 'arms' || t === 'beast') showChar();
    render();
  }

  /** 人物を立たせ、読み終わったら動きの一覧を出し直す */
  async function showChar() {
    const want = char;
    if (shown !== want) { shown = null; if (tab === 'person') renderMotions(); }
    try { await hall().show(want, resolveLoadout(want)); } catch (err) { console.warn('圖鑑の人物:', err); }
    if (char !== want) return;
    shown = want;
    if (open && tab === 'person') { clip = null; renderMotions(); }
  }

  // ---- 人物 ----
  function renderPerson() {
    const c = CHARACTERS[char], lo = LOADOUTS[char];
    const gear = (slot) => (lo[slot] || []).map((id) => `${esc(weaponName(id))}${isPlanned(id) ? `<small>${L.planned}</small>` : ''}`).join('・');
    const skills = [...new Set([...(lo.main || []), ...(lo.shield || []), ...(lo.side || [])])].filter((id) => SKILLS[id]);
    return `<div class="char-select codex-chars">${Object.entries(CHARACTERS).map(([id, ch]) => `<button type="button" class="char-btn${id === char ? ' sel' : ''}" data-char="${id}">${esc(ch.name)}</button>`).join('')}</div>
      <p class="codex-desc">${esc(c.desc)}</p>
      <dl class="cx-stats">
        ${row('鎧', esc(c.armorName))}${row('輕重', WEIGHT[c.weight] || c.weight)}${row('體力', c.maxHp)}
        ${row('迅速', `×${c.speed}`)}${row('視界', `${c.sight} 米`)}${row('左手', esc(c.leftLabel || '―'))}
      </dl>
      <h4 class="codex-head">動作</h4>
      <div id="motions"></div>
      <h4 class="codex-head">${L.weapon}</h4>
      <p class="gear"><span>${L.main}</span>${gear('main')}</p>
      ${lo.shield ? `<p class="gear"><span>${L.shield}</span>${gear('shield')}</p>` : ''}
      ${lo.side ? `<p class="gear"><span>${L.side}</span>${gear('side')}</p>` : ''}
      <h4 class="codex-head">技</h4>
      ${skills.map((id) => `<p class="skill-of">${esc(weaponName(id))}</p>${skillList(SKILLS[id])}`).join('')}
      <p class="skill-of">共通</p>${skillList(COMMON_SKILLS)}`;
  }

  /** 動きの再生（見出しを選び、動きを選ぶと大廳の人物が流す） */
  function renderMotions() {
    const el = document.getElementById('motions');
    if (!el) return;
    const have = new Set(shown === char ? hall().clipNames : []);
    if (!have.size) { el.innerHTML = `<p class="codex-note">${L.loading}…</p>`; return; }
    const groups = CLIP_GROUPS.map(([h, list]) => [h, list.filter((n) => have.has(n))]).filter(([, list]) => list.length);
    if (!groups.some(([h]) => h === group)) group = groups[0][0];
    const list = groups.find(([h]) => h === group)[1];
    const d = hall().directed;
    el.innerHTML = `<div class="chips">${groups.map(([h]) => `<button type="button" class="chip${h === group ? ' sel' : ''}" data-group="${esc(h)}">${esc(h)}</button>`).join('')}</div>
      <div class="clips">${list.map((n) => `<button type="button" class="clip${n === clip ? ' sel' : ''}" data-clip="${n}">${esc(CLIP_NAMES[n] || n)}</button>`).join('')}</div>
      <div class="player"${clip ? '' : ' hidden'}>
        <button type="button" class="play" data-act="play" aria-label="流す・止める">${d?.playing ? '❚❚' : '▶'}</button>
        <input type="range" class="scrub" min="0" max="${d ? d.duration.toFixed(3) : 1}" step="0.01" value="0" aria-label="時刻">
        <span class="time">0.00</span>
        <button type="button" class="chip${d?.loop !== false ? ' sel' : ''}" data-act="loop">循環</button>
        ${SPEEDS.map(([v, n]) => `<button type="button" class="chip${(d?.speed ?? 1) === v ? ' sel' : ''}" data-speed="${v}">${n}</button>`).join('')}
      </div>
      <p class="clip-desc">${clip ? `${esc(CLIP_DESC[clip] || '')}<small>${esc(clip)}・${d ? d.duration.toFixed(2) : ''} 秒</small>` : '動きを選ぶと、大廳の人物が流す'}</p>`;
  }

  // ---- 武器 ----
  function renderWeapon() {
    const all = [...Object.keys(WEAPONS), ...Object.keys(SHIELDS), ...Object.keys(PLANNED)];
    const w = WEAPONS[weapon], sh = SHIELDS[weapon];
    const users = Object.entries(LOADOUTS).filter(([, lo]) => [...(lo.main || []), ...(lo.side || []), ...(lo.shield || [])].includes(weapon)).map(([id]) => CHARACTERS[id].name);
    let stats = '';
    if (w && w.kind === 'bow') {
      stats = row('種類', esc(WEAPON_KIND[weapon] || '射')) + row('威力', w.damage) + row('引絞', `${w.drawTime} 秒`) + row('矢速', `${w.speed} 米/秒`) + row('氣力', w.stamina);
    } else if (w) {
      stats = row('種類', esc(WEAPON_KIND[weapon] || '')) + row('威力', w.damage) + row('間合', `${w.reach} 米`) + row('振幅', `${w.arc}°`)
        + row('出', `${w.windup} 秒`) + row('隙', `${w.recovery} 秒`) + row('氣力', w.stamina) + row('貫通', `${Math.round((w.guardPierce || 0) * 100)}%`);
    } else if (sh) {
      stats = row('種類', '楯');
    }
    return `<div class="char-select codex-weapons">${all.map((id) => `<button type="button" class="char-btn${id === weapon ? ' sel' : ''}" data-weapon="${id}">${esc(weaponName(id))}${isPlanned(id) ? `<small>${L.planned}</small>` : ''}</button>`).join('')}</div>
      ${isPlanned(weapon) ? `<p class="codex-note">この武器の模型と動きはこれから作る（${L.planned}）</p>` : ''}
      ${stats ? `<dl class="cx-stats">${stats}</dl>` : ''}
      <p class="gear"><span>使用</span>${users.map(esc).join('・') || '―'}</p>
      <h4 class="codex-head">技</h4>
      ${skillList(SKILLS[weapon]) || `<p class="codex-note">技はこれから作る</p>`}`;
  }

  // ---- 兵器・魔物（まだ未完） ----
  function renderArms() {
    return `<p class="codex-note">兵器の模型と、乗る・撃つ仕組みはこれから作る（${L.planned}）。試合の前に 1 つ選ぶと、その刻を越えたときに届く</p>
      <div class="picks">${Object.values(ARMS).map((a) => `<div class="pick"><span class="pick-name">${esc(a.name)}<small>${L.planned}</small></span>
        <span class="pick-when">${esc(PHASES[a.tier - 1]?.name ?? '')}を越えると届く</span><span class="pick-desc">${esc(a.desc)}</span></div>`).join('')}</div>`;
  }
  function renderBeast() {
    return `<p class="codex-note">魔物（クリーチャー）はこれから作る（${L.planned}）。森に出てくる魔物・ボスと、變異の藥で変わる姿をここに載せる</p>
      <div class="picks">${Object.values(MUTATIONS).map((m) => `<div class="pick"><span class="pick-name">${esc(m.name)}<small>${L.planned}</small></span>
        <span class="pick-desc">${esc(m.desc)}（クリーチャーは${esc(m.creature ?? L.creatureTbd)}）</span></div>`).join('')}</div>`;
  }

  function render() {
    body.innerHTML = tab === 'person' ? renderPerson() : tab === 'weapon' ? renderWeapon() : tab === 'arms' ? renderArms() : renderBeast();
    if (tab === 'person') renderMotions();
  }

  body.addEventListener('click', (e) => {
    const t = e.target;
    const cb = t.closest('[data-char]');
    if (cb) { char = cb.dataset.char; clip = null; render(); showChar(); return; }
    const wb = t.closest('[data-weapon]');
    if (wb) { weapon = wb.dataset.weapon; render(); hall().showWeapon(isPlanned(weapon) ? null : weapon); return; }
    const gb = t.closest('[data-group]');
    if (gb) { group = gb.dataset.group; renderMotions(); return; }
    const kb = t.closest('[data-clip]');
    if (kb) { clip = kb.dataset.clip; hall().direct(clip); renderMotions(); return; }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'play') { const d = hall().directed; if (d) hall().setPlaying(!d.playing); renderMotions(); return; }
    if (act === 'loop') { const d = hall().directed; if (d) hall().setLoop(!d.loop); renderMotions(); return; }
    const sp = t.closest('[data-speed]');
    if (sp) { hall().setSpeed(Number(sp.dataset.speed)); renderMotions(); }
  });
  body.addEventListener('input', (e) => {
    if (e.target.classList.contains('scrub')) { hall().seek(Number(e.target.value)); syncPlayer(); }
  });

  /** 流している間、時刻のつまみと表示を動かす */
  function syncPlayer() {
    const d = hall().directed;
    const el = document.getElementById('motions');
    if (!d || !el) return;
    const scrub = el.querySelector('.scrub'), time = el.querySelector('.time'), play = el.querySelector('.play');
    if (scrub && document.activeElement !== scrub) scrub.value = Math.min(d.t, d.duration).toFixed(2);
    if (time) time.textContent = `${Math.min(d.t, d.duration).toFixed(2)}`;
    if (play) play.textContent = d.playing ? '❚❚' : '▶';
  }
  const loop = () => { if (!open) return; syncPlayer(); raf = requestAnimationFrame(loop); };

  return {
    /** 圖鑑を開く（大廳で選んでいる人物から） */
    open(currentChar) {
      open = true;
      if (currentChar) char = currentChar;
      setTab('person');
      cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    },
    /** 閉じる：動きと武器を片付ける（大廳の人物は呼ぶ側が戻す） */
    close() {
      open = false;
      cancelAnimationFrame(raf);
      hall().direct(null);
      hall().showWeapon(null);
    },
    get isOpen() { return open && !pane.hidden; },
  };
}
