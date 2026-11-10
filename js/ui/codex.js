// 圖鑑（大廳から開く）：人物（能力・武器・技・動きの再生）・武器（模型・数値・技）・兵器・魔物（まだ未完）
//   後ろの 3D の広間（render/hall.js）に、選んだ人物を立たせて動きを流し、武器は壇の上に浮かべて回して見せる
//   動きの再生は、動作監督の画面と同じ作り：動きの一覧（見出しごと）・流す／止める・繰り返す・速さ・時刻のつまみ
import { L } from './labels.js';
import { CHARACTERS, LOADOUTS, WEAPONS, SHIELDS, PLANNED, ARMS, MUTATIONS, PHASES, SKILL_TYPES, EXCLUSIVE_SKILLS, SHARED_SKILLS, TECHNIQUES, SHIELD_SKILLS } from '../game/data.js';
import { attackStats } from '../game/combat.js';
import { resolveLoadout } from '../game/match.js';
import { CLIP_NAMES, CLIP_DESC, CLIP_GROUPS, WEAPON_KIND, WEAPON_ARTS, COMMON_ARTS, CREATURE_KINDS, CHAR_GUIDE } from '../game/codex.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WEIGHT = { light: '輕裝', medium: '中裝', heavy: '重裝' };
const TABS = [['person', L.person], ['skill', L.skill], ['weapon', L.weapon], ['arms', L.arms], ['beast', L.beast]];
const SPEEDS = [[0.25, '×¼'], [0.5, '×½'], [1, '×1']];
const weaponName = (id) => WEAPONS[id]?.name ?? SHIELDS[id]?.name ?? PLANNED[id] ?? id;
const isPlanned = (id) => (SHIELDS[id] ? !!SHIELDS[id].planned : !WEAPONS[id]);

const R = Math.round;
const arcText = (a) => (a >= 360 ? '周り' : `前 ${a}°`);
/** 技の威力（数値は game/data.js から求める。WEAPON_ARTS の ref） */
function powerText(ref) {
  if (!ref) return '';
  if (ref.lethal) return '一撃で倒す';
  if (ref.shield) {
    const S = SHIELD_SKILLS[ref.shield];
    return S.push ? `傷なし（${S.push} 米押し返す）・間合 ${S.reach} 米・${arcText(S.arc)}` : `${S.damage}・間合 ${S.reach} 米・${arcText(S.arc)}`;
  }
  const w = WEAPONS[ref.w];
  if (!w) return '';
  if (w.kind === 'bow') return `${R(w.damage * 0.35)}〜${w.damage}（引くほど強い。${w.drawTime} 秒で引き切る）`;
  if (ref.t === 'plain' || ref.t === 'heavy') {
    const a = attackStats(ref.w, ref.t === 'heavy');
    return `${R(a.damage)}・間合 ${+a.reach.toFixed(2)} 米・${arcText(a.arc)}${a.guardPierce ? `・防禦を ${R(a.guardPierce * 100)}% 貫く` : ''}`;
  }
  const set = TECHNIQUES[ref.w], T = ref.t === 'combo' ? set.combo[ref.i] : set[ref.t];
  const nth = (v, i) => (Array.isArray(v) ? v[Math.min(i, v.length - 1)] : v);
  if (T.full) return `${R(w.damage * T.damage[0])}〜${R(w.damage * T.damage[1])}${T.hits.length > 1 ? `（${T.hits.length} 回）` : ''}・間合 ${nth(T.reach, 0)} 米・${arcText(nth(T.arc, 0))}`;
  if (T.hits.length > 1) return `${T.hits.map((_, i) => R(w.damage * nth(T.damage, i))).join('＋')}（${T.hits.length} 回）・間合 ${nth(T.reach, 0)} 米・${T.hits.map((_, i) => arcText(nth(T.arc, i))).join('→')}`;
  return `${R(w.damage * T.damage)}・間合 ${T.reach} 米・${arcText(T.arc)}`;
}
/** 技の一覧：名前・出し方・効果・威力（攻撃の説明は効果と威力だけ。ゲームでまだ使えない物は「未完」）。共通の技は説明 */
function skillList(list) {
  if (!list?.length) return '';
  return `<ul class="skills">${list.map((s) => {
    const pw = s.effect !== undefined ? powerText(s.ref) : '';
    return `<li><b>${esc(s.name)}${s.done ? '' : `<small>${L.planned}</small>`}</b>
    <span class="how">${esc(s.how)}</span><span class="sdesc">${esc(s.effect ?? s.desc)}</span>${pw ? `<span class="spow">威力 ${esc(pw)}</span>` : ''}</li>`;
  }).join('')}</ul>`;
}
/** 動きから技へ（動きの再生で、攻撃の動きには説明の代わりに効果と威力を出す） */
const ART_OF_CLIP = (() => {
  const out = {};
  for (const list of Object.values(WEAPON_ARTS)) {
    for (const a of list) {
      const r = a.ref;
      if (r?.shield) out[SHIELD_SKILLS[r.shield].clip] = a;
      else if (r?.w && TECHNIQUES[r.w] && r.t !== 'plain' && r.t !== 'heavy') {
        const T = r.t === 'combo' ? TECHNIQUES[r.w].combo[r.i] : TECHNIQUES[r.w][r.t];
        for (const c of [T.clip, T.in, T.hold]) if (c) out[c] = a;
      }
    }
  }
  out.as_back = WEAPON_ARTS.armingsword.find((a) => a.name === '背刺');
  // 鈍器・短劍の暗殺（背後から）
  for (const [w, c] of [['mace', 'mc_as_back'], ['warhammer', 'wh_as_back'], ['lucerne', 'lc_as_back'], ['dagger', 'dg_as_back']]) {
    out[c] = WEAPON_ARTS[w].find((a) => a.ref?.lethal);
  }
  out.as_slide = WEAPON_ARTS.armingsword.find((a) => a.name === '滑斬');
  for (const c of ['a1', 'a2', 'a3']) out[c] = { effect: '技の無い武器（槍）の通常攻撃（専用の動きができるまで使う）', power: '武器による' };
  for (const c of ['ma1', 'ma2', 'ma3']) out[c] = { effect: '前の短劍の通常攻撃（今は短劍の技を使う）', ref: { w: 'dagger', t: 'plain' } };
  out.heavy = { effect: '左手の強い一撃・暗殺・誅殺（専用の動きができるまで使う）', power: `武器の ${1.7} 倍` };
  return out;
})();
const row = (k, v) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`;

/** 技能の札（名前・種類・効き目の長さ・待ち時間・説明。まだ使えない物は「未完」） */
function skillCard(s, main = false) {
  const meta = [SKILL_TYPES[s.type], s.time ? `${s.time} 秒` : '一撃', `待 ${s.cd} 秒`].map(esc).join('・');
  return `<div class="skill-card${main ? ' main' : ''}"><div class="sk-head"><b>${esc(s.name)}</b>${s.planned ? `<small>${L.planned}</small>` : ''}<span class="sk-meta">${meta}</span></div>
    <p class="sk-desc">${esc(s.desc)}</p></div>`;
}

/**
 * 性能（殺傷力・生命力・敏捷・防禦力）：全キャラの中での強さを 10 の目盛りで表す（一番弱い人で 3、一番強い人で 10）
 *   殺傷力：選べる武器の威力の平均、生命力：體力、敏捷：速さ、防禦力：鎧の硬さ（受ける傷が少ないほど硬い）
 */
function powerOf(id) {
  const lo = LOADOUTS[id], c = CHARACTERS[id];
  const ws = [...(lo.main || []), ...(lo.side || [])].filter((w) => WEAPONS[w]);
  const dmg = ws.length ? ws.reduce((n, w) => n + WEAPONS[w].damage, 0) / ws.length : 0;
  return { kill: dmg, life: c.maxHp, quick: c.speed, guard: 1 - c.armor };
}
const POWER = [['kill', '殺傷力', (v) => v.toFixed(0)], ['life', '生命力', (v) => v], ['quick', '敏捷', (v) => `×${v}`], ['guard', '防禦力', (v) => `${Math.round(v * 100)}%`]];
function gauges(id) {
  const all = Object.keys(CHARACTERS).map(powerOf), me = powerOf(id);
  return `<div class="gauges">${POWER.map(([k, name, fmt]) => {
    const vs = all.map((p) => p[k]), lo = Math.min(...vs), hi = Math.max(...vs);
    const n = hi > lo ? Math.round(3 + (7 * (me[k] - lo)) / (hi - lo)) : 7;
    return `<div class="gauge"><span class="g-name">${name}</span><span class="g-bar">${Array.from({ length: 10 }, (_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('')}</span><span class="g-val">${fmt(me[k])}</span></div>`;
  }).join('')}</div>`;
}

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
    if (t !== 'weapon') showChar();
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
    const skills = [...new Set([...(lo.main || []), ...(lo.shield || []), ...(lo.side || [])])].filter((id) => WEAPON_ARTS[id]);
    const g = CHAR_GUIDE[char], ex = EXCLUSIVE_SKILLS[char];
    return `<div class="char-select codex-chars">${Object.entries(CHARACTERS).map(([id, ch]) => `<button type="button" class="char-btn${id === char ? ' sel' : ''}" data-char="${id}">${esc(ch.name)}</button>`).join('')}</div>
      <p class="codex-desc">${esc(c.desc)}</p>
      <h4 class="codex-head">專用技能</h4>
      ${ex ? skillCard(ex, true) : ''}
      <p class="codex-note">技能ボタンで使う。専用技能はキャラ 1 人に 1 つで、最初から使える。共通技能は刻を越えるたびの報酬で 3 つから 1 つ選ぶ（技能の札）</p>
      <h4 class="codex-head">性能</h4>
      ${gauges(char)}
      ${g ? `<h4 class="codex-head">推奨</h4>
      <ul class="recs">${g.recommend.map(([k, v]) => `<li><b>${esc(k)}</b><span>${esc(v)}</span></li>`).join('')}</ul>
      <h4 class="codex-head">戰術</h4>
      <p class="codex-desc">${esc(g.tactics)}</p>
      <h4 class="codex-head">得意</h4>
      <div class="kinds">${g.strong.map((k) => `<span class="kind"><b>${esc(CREATURE_KINDS[k].name)}</b>${esc(CREATURE_KINDS[k].desc)}</span>`).join('')}</div>` : ''}
      <h4 class="codex-head">能力</h4>
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
      ${skills.map((id) => `<p class="skill-of">${esc(weaponName(id))}</p>${skillList(WEAPON_ARTS[id])}`).join('')}
      <p class="skill-of">共通</p>${skillList(COMMON_ARTS)}`;
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
      <p class="clip-desc">${clip ? `${clipText(clip)}<small>${esc(clip)}・${d ? d.duration.toFixed(2) : ''} 秒</small>` : '動きを選ぶと、大廳の人物が流す'}</p>`;
  }

  /** 動きの説明：攻撃の動きは効果と威力だけ、ほかは動きの説明 */
  function clipText(c) {
    const a = ART_OF_CLIP[c];
    if (!a) return esc(CLIP_DESC[c] || '');
    const pw = a.power ?? powerText(a.ref);
    return `${esc(a.effect)}${pw ? `<br>威力 ${esc(pw)}` : ''}`;
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
      ${skillList(WEAPON_ARTS[weapon]) || `<p class="codex-note">技はこれから作る</p>`}`;
  }

  // ---- 兵器・魔物（まだ未完） ----
  function renderArms() {
    return `<p class="codex-note">兵器の模型と、乗る・撃つ仕組みはこれから作る（${L.planned}）。試合の前に 1 つ選ぶと、その刻を越えたときに届く</p>
      <div class="picks">${Object.values(ARMS).map((a) => `<div class="pick"><span class="pick-name">${esc(a.name)}<small>${L.planned}</small></span>
        <span class="pick-when">${esc(PHASES[a.tier - 1]?.name ?? '')}を越えると届く</span><span class="pick-desc">${esc(a.desc)}</span></div>`).join('')}</div>`;
  }
  function renderSkill() {
    return `<p class="codex-note">技能ボタンを押して使う。使うと効き目がしばらく続き、使った後は待ち時間が過ぎるとまた使える。今はまだ案で、ゲームでは使えない（${L.planned}）</p>
      <h4 class="codex-head">共通技能</h4>
      <p class="codex-note">全キャラ共通。刻を越えるたびの報酬で、ここから 3 つ出て 1 つ選ぶ（最大 4 つ）</p>
      ${Object.values(SHARED_SKILLS).map((s) => skillCard(s)).join('')}
      <h4 class="codex-head">專用技能</h4>
      <p class="codex-note">キャラ 1 人に 1 つ。最初から使える</p>
      ${Object.entries(EXCLUSIVE_SKILLS).map(([id, s]) => `<p class="skill-of">${esc(CHARACTERS[id].name)}</p>${skillCard(s)}`).join('')}`;
  }
  function renderBeast() {
    return `<p class="codex-note">魔物（クリーチャー）はこれから作る（${L.planned}）。森に出てくる魔物・ボスと、變異の藥で変わる姿をここに載せる</p>
      <h4 class="codex-head">分類</h4>
      <div class="kinds">${Object.values(CREATURE_KINDS).map((k) => `<span class="kind"><b>${esc(k.name)}</b>${esc(k.desc)}</span>`).join('')}</div>
      <h4 class="codex-head">${L.mutation}</h4>
      <div class="picks">${Object.values(MUTATIONS).map((m) => `<div class="pick"><span class="pick-name">${esc(m.name)}<small>${L.planned}</small></span>
        <span class="pick-desc">${esc(m.desc)}（クリーチャーは${esc(m.creature ?? L.creatureTbd)}）</span></div>`).join('')}</div>`;
  }

  function render() {
    body.innerHTML = tab === 'person' ? renderPerson() : tab === 'skill' ? renderSkill() : tab === 'weapon' ? renderWeapon() : tab === 'arms' ? renderArms() : renderBeast();
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
