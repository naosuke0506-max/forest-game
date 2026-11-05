// 画面の文字のうち、ボタン・見出し・短い表示。
// このゲームの決まり：名前・ボタン・見出しは漢字だけ（旧字体）。知らせや説明の文は今の日本語のまま。数字は算用数字のまま。
// キャラ・武器・素材・場所・時間帯・刻（フェーズ）などの名前は、それぞれのデータ（game/data.js・world/zones.js・world/time-of-day.js）にある
export const L = {
  title: '蠱毒',              // 題名（こどく：壺の中で毒虫を食い合わせ、最後に残った 1 匹が蠱になる昔の呪術）
  you: '汝',                 // あなた（自分の名前の表示）
  // 右下のボタン
  attack: '攻擊', shoot: '射', thrust: '突', assassinate: '暗殺', finisher: '誅殺',
  dodge: '迴避', search: '搜索',
  crouch: '屈身', stand: '起立', getUp: '起身',
  exit: '出', hide: '潛伏', wall: '壁潛', leave: '離壁', crate: '開箱', pick: '拾得',
  // 鍛冶（クラフト）
  craft: '鍛冶', weapons: '武器', armor: '防具', make: '鍛造', upgrade: '強化', equip: '裝備', equipped: '裝備中', unmade: '未鍛',
  // 題の画面
  loading: '讀込中', start: '出陣', startFail: '起動失敗', practice: '修練之陣　對傀儡 3 騎',
  // 試合
  again: '再戰', spectating: '觀戰中', nextView: '觀次', out: '脫落', overtime: '延長戰', victory: '勝利', survivor: '最終生存',
  cleared: '突破', rewardPick: '褒賞擇一', kills: '擊破', points: '點',
  // 地圖
  north: '北', road: '徑', house: '家屋', tree: '樹', span: '東西 350 米', meter: '米',
};
