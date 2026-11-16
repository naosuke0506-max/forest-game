// 開戰の前のマッチング画面（相手を探す画面）。利用者の指示（2026-11-14）：
//   「開戦がいきなりなので、マルチゲームのように、マッチング画面になり（本来であればマッチするまでその画面）
//    （戻れるようにもして）bot だったら bot と書いてください」
// 今は、本当の相手を探す仕組み（通信）がまだ無いので、相手は全員 bot。枠が 1 つずつ埋まり、揃ったら秒読みをして戦場へ移る。
// 「歸」を押すと、やめて前の画面（開戰のボタンの画面）へ戻る。本当の相手を探すようになったら、ここで見つかるまで待つ
import { CHARACTERS, MODES, MAPS } from '../game/data.js';
import { L } from './labels.js';
import { ruby } from './ruby.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createMatching() {
  const el = document.getElementById('matching');
  const list = el.querySelector('.mt-slots'), state = el.querySelector('.mt-state'), where = el.querySelector('.mt-where');
  const back = document.getElementById('matching-back');
  let timers = [];
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (ms, fn) => { timers.push(setTimeout(fn, ms)); };
  const slot = (i, p) => {
    const li = list.children[i];
    li.className = `mt-slot found${p.me ? ' me' : ''}`;
    li.innerHTML = `<span class="mt-no">${i + 1}</span><span class="mt-name">${esc(p.name)}</span>`
      + `<span class="mt-char">${ruby(CHARACTERS[p.char]?.name || '')}</span>`
      + (p.me ? '<span class="mt-tag you">自分</span>' : p.bot ? '<span class="mt-tag">bot</span>' : '<span class="mt-tag human">人</span>');
  };
  return {
    /**
     * 相手を探す。揃って秒読みが済んだら true、「歸」で戻ったら false
     * @param {{ char: string, name: string, bot?: boolean, me?: boolean }[]} people 自分（先頭）と相手
     * @param {{ mode?: string, map?: string, quick?: boolean }} [o] quick：待ち時間を短く（確かめ用）
     */
    run(people, { mode = 'kodoku', map = 'forest', quick = false } = {}) {
      clear();
      el.hidden = false;
      el.classList.remove('moving');
      back.hidden = false;
      where.innerHTML = `${ruby(MODES[mode]?.name || '')}　／　${ruby(MAPS[map]?.name || '')}`;
      list.innerHTML = people.map((_, i) => `<li class="mt-slot wait"><span class="mt-no">${i + 1}</span><span class="mt-name">……</span></li>`).join('');
      slot(0, people[0]);
      const k = quick ? 0.15 : 1;
      return new Promise((resolve) => {
        let found = 1;
        const show = () => { state.textContent = `相手を探しています…　${found} / ${people.length}`; };
        show();
        const finish = (ok) => { clear(); back.onclick = null; if (!ok) el.hidden = true; resolve(ok); };
        back.onclick = () => finish(false);
        // 相手が 1 人ずつ見つかる（0.8〜1.6 秒おき）
        let t = 0;
        for (let i = 1; i < people.length; i++) {
          t += (800 + Math.random() * 800) * k;
          later(t, () => { slot(i, people[i]); found++; show(); });
        }
        // 揃った：3 秒の秒読み（この間も戻れる）
        t += 700 * k;
        for (let n = 3; n >= 1; n--) {
          const left = n;
          later(t, () => { state.textContent = `相手が揃いました　出陣まで ${left}`; el.classList.add('ready'); });
          t += 1000 * k;
        }
        later(t, () => finish(true));
      });
    },
    /** 戦場へ移る間（模型を読み込む間）：もう戻れない */
    moving() {
      back.hidden = true;
      el.classList.add('moving');
      state.textContent = `戰場へ向かっています…（${L.loading}）`;
    },
    close() { clear(); el.hidden = true; el.classList.remove('ready', 'moving'); },
  };
}
