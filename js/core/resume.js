// 試合・教練から待機画面（大廳）へ戻る。
//   試合の後片付け（人物の模型・音・画面の部品など）を 1 つずつ戻す仕組みはまだ無いので、ページを読み込み直して、
//   題の画面を飛ばして大廳から始める（読み込み直す前に「大廳へ戻る」と印を付けておく。印はこのタブの中だけ）。
//   利用者の指示（2026-11-14）：教練をクリアしたら自動的に待機画面に戻る／教練中でも設定から退出できる
const KEY = 'forest-game.resume';

/** 大廳へ戻る：画面を暗くして、読み込み直す */
export function returnToHall() {
  try { sessionStorage.setItem(KEY, 'hall'); } catch { /* 印を付けられなくても、読み込み直せば題の画面から始まる */ }
  const el = document.getElementById('returning');
  if (el) el.hidden = false;
  setTimeout(() => location.reload(), 350);   // 暗くなってから読み込み直す
}

/** 読み込み直した後：大廳から始めるか（印は 1 回で消す） */
export function takeResume() {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v === 'hall';
  } catch { return false; }
}
