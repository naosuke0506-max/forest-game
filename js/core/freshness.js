// 古いファイルが混ざっていないかを確かめる。
// GitHub Pages は数分間ファイルを覚えておく（キャッシュ）ので、更新の直後に Safari が
// 「新しいページ（index.html）」と「古いプログラム（js）」を混ぜて読み込むことがある。
// そのときは、ページと同じ版のファイルを取り直してから、1 回だけ読み込み直す
export async function refreshIfStale(build) {
  const pageBuild = window.__BUILD;
  if (pageBuild === build) return false;
  const key = 'forest-game.refreshed';
  const mark = `${pageBuild}|${build}`;
  let tried = null;
  try { tried = sessionStorage.getItem(key); } catch { /* 保存できない設定のときは毎回試さない */ return false; }
  if (tried === mark) {
    // 取り直しても合わない（公開の途中など）。そのまま続けて、知らせだけ出す
    window.__showError?.('更新の反映を待っています。数分たってから、もう一度読み込んでください');
    return false;
  }
  try { sessionStorage.setItem(key, mark); } catch { return false; }
  const urls = [
    location.href.split('#')[0],
    ...[...document.querySelectorAll('link[rel="modulepreload"], link[rel="stylesheet"]')].map((l) => l.href),
  ];
  await Promise.all(urls.map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
  location.reload();
  return true;
}
