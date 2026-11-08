// 圖鑑に載せる文：動きの名前と説明・技の説明（計算には使わない。数値は game/data.js）
//   名前（ボタン・見出し）は漢字だけ（旧字体）、説明は今の日本語（このゲームの決まり。ui/labels.js）
//   技の説明は docs/DESIGN.md の「片手劍の技」「長劍の技」「楯の技」「全キャラ共通の技と動き」と同じ

/** 動きの名前（圖鑑の一覧のボタン） */
export const CLIP_NAMES = {
  idle: '待機', walk: '步行', back: '後退', run: '疾走',
  a1: '攻擊1', a2: '攻擊2', a3: '攻擊3', heavy: '強擊', draw: '引弓', shoot: '放矢', ma1: '短劍1', ma2: '短劍2', ma3: '短劍3',
  oh_thrust: '踏込突', oh_rise: '逆袈裟', oh_c1_in: '袈裟斬・入', oh_c1_hold: '袈裟斬・溜', oh_c1_out: '袈裟斬・放', oh_c2: '旋風斬',
  ls_cut1: '唐竹', ls_cut2: '横薙', ls_c1_in: '長突・入', ls_c1_hold: '長突・溜', ls_c1_out: '長突・放', ls_c2: '斬返',
  sb_bash: '楯擊', sb_push: '楯押', sb_parry: '受流', sb_charge: '楯突貫',
  guard: '防禦', guard_l: '受・弱', guard_h: '受・強', roll: '前轉', step: '跳避',
  hit_l_f: '輕被彈・前', hit_l_b: '輕被彈・後', hit_l_l: '輕被彈・左', hit_l_r: '輕被彈・右',
  hit_h_f: '重被彈・前', hit_h_b: '重被彈・後', hit_h_l: '重被彈・左', hit_h_r: '重被彈・右',
  stagger_f: '蹌踉・前', stagger_b: '蹌踉・後', stagger_l: '蹌踉・左', stagger_r: '蹌踉・右', hit: '被彈', stagger: '蹌踉', death: '斃',
  as_back: '背刺', as_slide: '滑斬', as_back_v: '被背刺', as_slide_v: '被滑斬',
  hide_wd_in: '入簞笥', hide_wd_out: '出簞笥', search_wd: '搜簞笥', drag_wd: '簞笥誅殺', drag_wd_v: '被曳出・簞笥',
  hide_bed_in: '潛牀下', hide_bed_out: '出牀下', search_bed: '搜牀下', drag_bed: '牀下誅殺', drag_bed_v: '被曳出・牀下',
  turn_r: '右轉', turn_l: '左轉',
  crouch: '屈身', crouch_walk: '屈行', prone_down: '伏', prone: '伏臥', crawl: '匍匐', prone_up: '起身',
  cover_l: '壁潛・左覗', cover_r: '壁潛・右覗', cover_walk_l: '壁際・左行', cover_walk_r: '壁際・右行',
};

/** 動きの説明（選んだ動きの下に出す） */
export const CLIP_DESC = {
  idle: '立って構えている', walk: '歩く', back: '後ろへ歩く', run: '走る',
  a1: '通常攻撃の 1 段目', a2: '通常攻撃の 2 段目', a3: '通常攻撃の 3 段目', heavy: '左手ボタンの強い一撃', draw: '弓を引き絞る', shoot: '矢を放つ',
  ma1: '短劍の攻撃 1 段目', ma2: '短劍の攻撃 2 段目', ma3: '短劍の攻撃 3 段目',
  oh_thrust: '右足を踏み込み、体を巻き込むように回して、右腕を真っ直ぐ突き出す', oh_rise: '左斜め下に溜めた右腕を、右斜め上へ振り払う',
  oh_c1_in: '袈裟斬の溜めに入る', oh_c1_hold: '右腕を右斜め上の後ろへ伸ばしたまま、強く溜める', oh_c1_out: '右斜め上から左下へ振り下ろす',
  oh_c2: '右回りに一回転して払い、逆の左回りに回って最後の一撃',
  ls_cut1: '頭上へ振りかぶり、真上から真っ直ぐ斬り下ろす', ls_cut2: '右から左へ水平に薙ぐ',
  ls_c1_in: '長突の溜めに入る', ls_c1_hold: '剣を頭の右横に構え、切っ先を相手の顔へ向けて溜める', ls_c1_out: '左足で大きく踏み込み、両手で長く突く',
  ls_c2: '右上へ斬り上げ、頭上へ返して、右上から左下へ斬り下ろす',
  sb_bash: '楯を左に溜めて、右へ殴りつける', sb_push: '楯で敵を押し出す', sb_parry: '楯を右に溜めて、左へ払う', sb_charge: '楯を地面に着けて、地面を削りながら突進する',
  guard: '防禦の構え', guard_l: 'ふつうの攻撃を楯や武器で受ける', guard_h: '強い一撃を受けて、体ごと押される', roll: '前へ転がって避ける', step: '後ろへ跳んで避ける',
  hit_l_f: '軽い攻撃を前から受ける', hit_l_b: '軽い攻撃を後ろから受ける', hit_l_l: '軽い攻撃を左から受ける', hit_l_r: '軽い攻撃を右から受ける',
  hit_h_f: '重い攻撃を前から受けて下がる', hit_h_b: '重い攻撃を後ろから受けて下がる', hit_h_l: '重い攻撃を左から受けて下がる', hit_h_r: '重い攻撃を右から受けて下がる',
  stagger_f: '前から崩されてよろめく', stagger_b: '後ろから崩されてよろめく', stagger_l: '左から崩されてよろめく', stagger_r: '右から崩されてよろめく',
  hit: '攻撃を受けてひるむ', stagger: 'よろめく', death: '倒れる',
  as_back: '真後ろから背中へ剣を突き刺し、蹴り飛ばして抜く', as_slide: '滑り込みながら足を斬り、立ち上がって首へ振り下ろす',
  as_back_v: '背刺をされる側', as_slide_v: '滑斬をされる側',
  hide_wd_in: '右の扉を開け、振り向いて後ろ向きに入り、中から扉を閉める', hide_wd_out: '扉を押し開けて出て、タンスに背を向けて立つ',
  search_wd: '両手で両方の扉を開け、身を乗り出して覗く', drag_wd: '胸ぐらをつかんで引き出し、床へ投げ倒して剣を突き下ろす', drag_wd_v: 'タンスから引きずり出される側',
  hide_bed_in: 'しゃがんで手をつき、横へ這ってベッドの下へ入る', hide_bed_out: 'ベッドの下から這い出て、起き上がる',
  search_bed: '片膝をついて身をかがめ、毛布の端を持ち上げて覗く', drag_bed: '腕をつかんで床を引き出し、仰向けにして突き下ろす', drag_bed_v: 'ベッドから引きずり出される側',
  turn_r: 'その場で足を踏んで右へ回る', turn_l: 'その場で足を踏んで左へ回る',
  crouch: 'しゃがむ', crouch_walk: 'しゃがんで歩く', prone_down: '伏せる', prone: '伏せている', crawl: '伏せたまま這う', prone_up: '伏せから起き上がる',
  cover_l: '壁に背を付けて、左を覗く', cover_r: '壁に背を付けて、右を覗く', cover_walk_l: '壁に背を付けたまま左へ歩く', cover_walk_r: '壁に背を付けたまま右へ歩く',
};

/** 動きの分け方（圖鑑の見出し）。キャラが持っていない動きは出さない */
export const CLIP_GROUPS = [
  ['移動', ['idle', 'walk', 'back', 'run', 'turn_r', 'turn_l']],
  ['攻擊', ['a1', 'a2', 'a3', 'heavy', 'draw', 'shoot', 'ma1', 'ma2', 'ma3']],
  ['片手劍之技', ['oh_thrust', 'oh_rise', 'oh_c1_in', 'oh_c1_hold', 'oh_c1_out', 'oh_c2']],
  ['長劍之技', ['ls_cut1', 'ls_cut2', 'ls_c1_in', 'ls_c1_hold', 'ls_c1_out', 'ls_c2']],
  ['楯之技', ['sb_bash', 'sb_push', 'sb_parry', 'sb_charge']],
  ['防禦・迴避', ['guard', 'guard_l', 'guard_h', 'roll', 'step']],
  ['被彈', ['hit_l_f', 'hit_l_b', 'hit_l_l', 'hit_l_r', 'hit_h_f', 'hit_h_b', 'hit_h_l', 'hit_h_r', 'stagger_f', 'stagger_b', 'stagger_l', 'stagger_r', 'hit', 'stagger', 'death']],
  ['暗殺', ['as_back', 'as_slide', 'as_back_v', 'as_slide_v']],
  ['隱伏', ['hide_wd_in', 'hide_wd_out', 'search_wd', 'drag_wd', 'drag_wd_v', 'hide_bed_in', 'hide_bed_out', 'search_bed', 'drag_bed', 'drag_bed_v']],
  ['姿勢', ['crouch', 'crouch_walk', 'prone_down', 'prone', 'crawl', 'prone_up']],
  ['壁潛', ['cover_l', 'cover_r', 'cover_walk_l', 'cover_walk_r']],
];

/** 武器の種類（圖鑑に出す） */
export const WEAPON_KIND = {
  armingsword: '斬・突', longsword: '斬・突（兩手）', mace: '打', spear: '突', dagger: '斬・突', longbow: '射',
};

/**
 * 技（武器・楯ごと）。how：出し方、done：ゲームで使える（false は動きだけあって、まだゲームで使えない）
 */
export const WEAPON_ARTS = {
  armingsword: [
    { name: '踏込突', how: '攻擊ボタン', desc: '右足を踏み込み、右腕を一本の槍のように真っ直ぐ突き出して刺す（通常攻撃 1 段目）', done: true },
    { name: '逆袈裟', how: '踏込突の後に攻擊ボタン', desc: '左斜め下に溜めた右腕を右斜め上へ振り払う（通常攻撃 2 段目）', done: true },
    { name: '袈裟斬', how: '攻擊ボタンを長押しして離す', desc: '右腕を右斜め上の後ろへ伸ばして溜め、離すと右斜め上から左下へ振り下ろす。長く溜めるほど強い', done: true },
    { name: '旋風斬', how: '袈裟斬のすぐ後に、もう一度長押しして離す', desc: '右回りに一回転して払い、逆の左回りに回って最後の一撃（当たりが 2 回）', done: true },
    { name: '背刺', how: '相手の背中側から暗殺ボタン', desc: '真後ろから背中へ剣を突き刺し、蹴り飛ばして抜く', done: true },
    { name: '滑斬', how: '相手の前・横から暗殺ボタン', desc: '滑り込みながら足を斬り、立ち上がって首へ振り下ろす', done: true },
  ],
  longsword: [
    { name: '唐竹', how: '攻擊ボタン', desc: '頭上へ振りかぶり、右足で踏み込んで真上から真っ直ぐ斬り下ろす（通常攻撃 1 段目）', done: true },
    { name: '横薙', how: '唐竹の後に攻擊ボタン', desc: '剣を右へ引いて体を開き、右から左へ水平に薙ぐ（通常攻撃 2 段目）', done: true },
    { name: '長突', how: '攻擊ボタンを長押しして離す', desc: '剣を頭の右横に構えて溜め、離すと左足で大きく踏み込んで両手で長く突く', done: true },
    { name: '斬返', how: '長突のすぐ後に、もう一度長押しして離す', desc: '右上へ斬り上げ、頭上へ返して右上から左下へ斬り下ろす（当たりが 2 回）', done: true },
  ],
  mace: [
    { name: '連擊', how: '攻擊ボタン', desc: '重い頭で殴る。防禦の上からも響く', done: true },
  ],
  spear: [
    { name: '連突', how: '攻擊ボタン', desc: '間合いが一番長い。近づく前に突ける', done: true },
    { name: '薙拂', how: '左手ボタン', desc: '大きく薙ぎ払う強い一撃', done: true },
  ],
  dagger: [
    { name: '連擊', how: '攻擊ボタン（持替で持ったとき）', desc: '振りが速く、隙が小さい', done: true },
  ],
  longbow: [
    { name: '射', how: '攻擊ボタンを長押しで引き、離して放つ', desc: '引くほど強く、遠くまで飛ぶ。引き切った矢は重い一撃', done: true },
    { name: '持替', how: '左手ボタン', desc: '短劍に持ち替える（近寄られたとき）', done: true },
  ],
  kite: [
    { name: '防禦', how: '左手ボタンを押している間', desc: '楯で受ける。ふつうの攻撃は弱い受け、強い一撃は強い受け。スタミナが切れると崩れる', done: true },
    { name: '楯押', how: '左手ボタンを短く押して離す', desc: '楯で敵を約 2 m 押し返して、体勢を崩す（傷は無し。防禦の上からでも崩れる）', done: true },
    { name: '楯擊', how: '防禦の構えの間に攻擊ボタン', desc: '楯を左に溜めて、右へ殴りつける。少し傷を与えて、重い被弾でひるませる', done: true },
  ],
  buckler: [
    { name: '受流', how: '左手ボタンを短く押す', desc: '攻撃が当たる直前（0.2 秒の間）に払えば、相手の攻撃を弾いて大きくよろめかせる', done: false },
    { name: '楯擊', how: '防禦の構えの間に攻擊ボタン', desc: '楯を左に溜めて、右へ殴りつける', done: false },
  ],
  pavise: [
    { name: '楯押', how: '左手ボタンを短く押す', desc: '楯で敵を押し出して、体勢を崩す', done: false },
    { name: '楯突貫', how: '防禦の構えの間に攻擊ボタン', desc: '楯を地面に着けて約 4 m 突進する。当たった相手を倒す', done: false },
  ],
};

/** 全キャラ共通の技と動き */
export const COMMON_ARTS = [
  { name: '迴避', how: '迴避ボタン', desc: '軽い鎧は前転、重い鎧は跳避。避ける間は攻撃が当たらない。ぎりぎりで避けると「ぴったり回避」', done: true },
  { name: '暗殺', how: '暗殺ボタン（相手に体の 7 割以上を見られていないとき・隠れ場所や壁裏から）', desc: '近くの相手を一撃で倒す。見られていない所からの暗殺は避けられない', done: true },
  { name: '屈身・伏', how: '屈身ボタン（押す＝しゃがむ、長押し＝伏せる）', desc: '低くなると見つかりにくく、足音が小さい。遅くなり、走れない', done: true },
  { name: '潛伏・搜索', how: 'ベッド・タンスの近くで潛伏・搜索ボタン', desc: 'ベッドの下・タンスの中に隠れる。探して見つけたら、引きずり出して止めを刺す', done: true },
  { name: '壁潛', how: '家の壁の近くで壁潛ボタン', desc: '壁に背を付けて隠れ、角から覗く。近くに来た相手を暗殺できる', done: true },
  { name: '疾驅斬', how: '走っているときに攻擊ボタン', desc: '走った勢いのまま斬りつける', done: false },
  { name: '乘越・攀登', how: '柵や梯子の近くで', desc: '低い柵や障害物を乗り越え、見張り櫓の梯子を登る', done: false },
];

/**
 * 魔物の分類（案。クリーチャーを作るときに、それぞれの魔物をどれかに入れる）。圖鑑の「得意な魔物」に使う
 */
export const CREATURE_KINDS = {
  beast: { name: '獸', desc: '狼・熊・猪など。速く、群れで襲う' },
  swarm: { name: '蟲', desc: '大蜘蛛・百足など。小さく、数が多い' },
  shell: { name: '甲', desc: '大甲蟲・石の像など。硬い殻で、斬る・突くが通りにくい' },
  dead:  { name: '屍', desc: '屍兵・骸骨など。倒れても起き上がる、ひるまない' },
  ghost: { name: '靈', desc: '亡靈・鬼火など。武器が通りにくく、聖なる力や火に弱い' },
  giant: { name: '巨', desc: '巨人・大熊など。体力が多く一撃が重いが、遅い' },
};

/**
 * キャラごとの圖鑑の文：おすすめの武器の組み合わせ（recommend）・戦い方（tactics）・得意な魔物の分類（strong。CREATURE_KINDS）
 */
export const CHAR_GUIDE = {
  shield: {
    recommend: [['片手劍・鳶形楯', '技が多く、背刺・滑斬で暗殺もできる。いちばん扱いやすい'], ['鎚矛・鳶形楯', '防禦の上から響く一撃で、守りの固い相手を崩す']],
    tactics: '防禦で受け、楯押で体勢を崩してから技で止めを刺す。囲まれたら楯を構えたまま下がり、1 人ずつ相手にする',
    strong: ['beast', 'dead'],
  },
  sword: {
    recommend: [['長劍', '間合いが長く、溜攻撃（長突・斬返）が強い'], ['片手劍', '振りが速く、背刺・滑斬で暗殺もできる']],
    tactics: '楯が無いので、回避の間合いを覚えて当てる。防禦を固める相手には溜攻撃を押し付ける',
    strong: ['swarm', 'dead'],
  },
  polearm: {
    recommend: [['槍', '間合いが一番長く、近づく前に突ける']],
    tactics: '間合いの外から突き、近づかれたら薙拂で離す。狭い家の中や林の密な所は苦手',
    strong: ['giant', 'beast'],
  },
  blunt: {
    recommend: [['鎚矛', '一撃が重く、防禦の上からも響く']],
    tactics: '重い一撃で防禦を崩し、ひるんだ所へ畳みかける。重いので回避は短い跳避。先に見つけて間合いを詰める',
    strong: ['shell', 'dead'],
  },
  archer: {
    recommend: [['長弓・短劍', '遠くから射て、近寄られたら短劍に持ち替える']],
    tactics: '草むらや高い所から、気づかれる前に射る。引き切った矢は重い一撃。近寄られたら持ち替えて離れる',
    strong: ['giant', 'beast'],
  },
  cleric: {
    recommend: [['鎚矛', '奇跡ができるまでは鎚矛で戦う']],
    tactics: '軽い鎧の速さで間合いを取り、聖域で体勢を立て直す。屍と靈には聖なる力がよく効く',
    strong: ['ghost', 'dead'],
  },
};
