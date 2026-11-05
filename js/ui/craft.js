// 素材の表示（左上の地図の下）とクラフト画面。
//   素材の表示をタップ（PC は C キー）でクラフト画面を開く。試合は止まらないので、開いたまま動ける
//   武器：作る（まだ持っていない武器）・強化（2 回まで）・装備（右手に持つ武器を替える）
//   防具：強化（2 回まで）
import { L } from './labels.js';
import { MATERIALS, MATERIAL_KEYS, UPGRADE, ARMOR } from '../game/data.js';
import { craftOptions, canAfford, makeWeapon, upgradeWeapon, upgradeArmor, equipWeapon } from '../game/craft.js';
import { ICONS, weaponIconOf } from './icons.js';

const $ = (sel) => document.querySelector(sel);
const pct = (k) => Math.round(Math.abs(1 - k) * 100);

/** 強化の段階の印（◆ が済んだ段階） */
function pips(level, max = 2) {
  let s = '';
  for (let i = 1; i <= max; i++) s += `<i class="${i <= level ? 'on' : ''}"></i>`;
  return `<span class="pips" title="強化 ${level} / ${max}">${s}</span>`;
}

/** 費用の表示（足りない素材は赤） */
function costHtml(f, cost) {
  if (!cost) return '';
  return MATERIAL_KEYS.filter((k) => cost[k]).map((k) => {
    const lack = (f.materials[k] || 0) < cost[k];
    return `<span class="cost${lack ? ' lack' : ''}">${ICONS[k]}<b>${cost[k]}</b></span>`;
  }).join('');
}

/**
 * @param {object} me 自分（game/match.js の戦う人）
 * @param {(what: string, weaponId?: string) => void} onCraft 作った・強化した・持ち替えたとき（make / upgrade / armor / equip）
 */
export function createCraftUi(me, onCraft) {
  const bar = $('#mats');
  const panel = $('#craft');
  const list = panel.querySelector('.craft-list');
  const panelMats = panel.querySelector('.craft-mats');
  let lastKey = '';

  function renderBar() {
    const key = MATERIAL_KEYS.map((k) => me.materials[k]).join(',');
    if (key === lastKey) return;
    lastKey = key;
    bar.innerHTML = `<span class="mats-craft">${ICONS.hammer}</span>` + MATERIAL_KEYS.map((k) =>
      `<span class="mat" title="${MATERIALS[k].name}">${ICONS[k]}<b>${me.materials[k] || 0}</b></span>`).join('');
    if (!panel.hidden) render();
  }

  function render() {
    panelMats.innerHTML = MATERIAL_KEYS.map((k) =>
      `<span class="mat big">${ICONS[k]}<span><small>${MATERIALS[k].name}</small><b>${me.materials[k] || 0}</b></span></span>`).join('');
    const { weapons, armor } = craftOptions(me);
    let html = `<h3 class="craft-sec">${L.weapons}</h3>`;
    for (const w of weapons) {
      let eff, act = '';
      if (w.next === 'make') {
        eff = 'まだ持っていない。作ると持ち替えられる';
        act = `<button type="button" class="cbtn" data-act="make" data-id="${w.id}" ${canAfford(me, w.cost) ? '' : 'disabled'}>${L.make}</button>`;
      } else if (w.next === 'upgrade') {
        const u = UPGRADE[w.level + 1];
        eff = `強化 ${w.level + 1}：威力 +${pct(u.damage)}%・氣力の減り -${pct(u.stamina)}%`;
        act = `<button type="button" class="cbtn" data-act="upgrade" data-id="${w.id}" ${canAfford(me, w.cost) ? '' : 'disabled'}>${L.upgrade}</button>`;
      } else {
        const u = UPGRADE[w.level];
        eff = `最大まで強化した（威力 +${pct(u.damage)}%）`;
      }
      if (w.canEquip) act += `<button type="button" class="cbtn alt" data-act="equip" data-id="${w.id}">${L.equip}</button>`;
      const tag = w.equipped ? `<span class="ctag">${L.equipped}</span>` : w.owned ? '' : `<span class="ctag dim">${L.unmade}</span>`;
      html += `
        <div class="card${w.owned ? '' : ' unowned'}">
          <div class="card-icon">${weaponIconOf(w.id)}</div>
          <div class="card-body">
            <div class="card-name">${w.name}${w.owned ? pips(w.level) : ''}${tag}</div>
            <div class="card-eff">${eff}</div>
            <div class="card-cost">${costHtml(me, w.cost)}</div>
          </div>
          <div class="card-acts">${act}</div>
        </div>`;
    }
    html += `<h3 class="craft-sec">${L.armor}</h3>`;
    {
      const next = ARMOR[armor.level + 1];
      const eff = next ? `強化 ${armor.level + 1}：受ける傷 -${pct(next.taken)}%`
        : `最大まで強化した（受ける傷 -${pct(ARMOR[armor.level].taken)}%）`;
      const act = next ? `<button type="button" class="cbtn" data-act="armor" ${canAfford(me, armor.cost) ? '' : 'disabled'}>${L.upgrade}</button>` : '';
      html += `
        <div class="card">
          <div class="card-icon">${ICONS.shield}</div>
          <div class="card-body">
            <div class="card-name">${armor.name}${pips(armor.level)}<span class="ctag">装備中</span></div>
            <div class="card-eff">${eff}</div>
            <div class="card-cost">${costHtml(me, armor.cost)}</div>
          </div>
          <div class="card-acts">${act}</div>
        </div>`;
    }
    list.innerHTML = html;
  }

  const open = (v) => {
    panel.hidden = !v;
    if (v) render();
  };
  bar.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); open(panel.hidden); });
  panel.querySelector('.craft-close').addEventListener('click', () => open(false));
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyC' && !e.repeat) open(panel.hidden); });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled || !me.alive) return;
    const { act, id } = b.dataset;
    const ok = act === 'make' ? makeWeapon(me, id) : act === 'upgrade' ? upgradeWeapon(me, id)
      : act === 'armor' ? upgradeArmor(me) : act === 'equip' ? equipWeapon(me, id) : false;
    if (ok) onCraft(act, id);
    lastKey = '';
    renderBar();
    render();
  });

  renderBar();
  return {
    /** 素材が変わったら呼ぶ（変わっていなければ何もしない） */
    update: renderBar,
    close: () => open(false),
    get isOpen() { return !panel.hidden; },
  };
}
