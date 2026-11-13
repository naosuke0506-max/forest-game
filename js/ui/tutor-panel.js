// 教練（チュートリアル）の手順の札：画面の左に、教練の名前と手順を並べ、できた手順に印を付ける。全部できたら「教練達成」と「歸」
import { ruby, rubyIn } from './ruby.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** @param {object} lesson game/tutorial.js の LESSONS の 1 つ */
export function createTutorPanel(lesson) {
  const el = document.getElementById('tutor');
  el.hidden = false;
  el.querySelector('.tu-name').innerHTML = ruby(`教練・${lesson.name}`);
  const list = el.querySelector('.tu-steps');
  list.innerHTML = lesson.steps.map((s) => `<li>${esc(s.text)}</li>`).join('');
  const done = el.querySelector('.tu-done');
  done.hidden = true;
  rubyIn(el, '.tu-done p, .tu-done button');
  document.getElementById('tutor-back').onclick = () => location.reload();   // 題の画面へ戻る（再戰と同じく読み込み直す）
  function show(step) {
    [...list.children].forEach((li, i) => { li.classList.toggle('done', i < step); li.classList.toggle('now', i === step); });
    done.hidden = step < lesson.steps.length;
  }
  show(0);
  return { show };
}
