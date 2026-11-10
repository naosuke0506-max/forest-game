// 圖鑑に載せる文：動きの名前と説明・技の説明（計算には使わない。数値は game/data.js）
//   名前（ボタン・見出し）は漢字だけ（旧字体）、説明は今の日本語（このゲームの決まり。ui/labels.js）
//   技の説明は docs/DESIGN.md の「片手劍の技」「長劍の技」「鎚矛の技」「戰鎚の技」「長柄鎚の技」「短劍の技」「楯の技」「全キャラ共通の技と動き」と同じ

/** 動きの名前（圖鑑の一覧のボタン） */
export const CLIP_NAMES = {
  idle: '待機', walk: '步行', back: '後退', run: '疾走',
  a1: '攻擊1', a2: '攻擊2', a3: '攻擊3', heavy: '強擊', draw: '引弓', shoot: '放矢', ma1: '短劍1', ma2: '短劍2', ma3: '短劍3',
  oh_thrust: '踏込突', oh_rise: '逆袈裟', oh_c1_in: '袈裟斬・入', oh_c1_hold: '袈裟斬・溜', oh_c1_out: '袈裟斬・放', oh_c2: '旋風斬',
  ls_cut1: '唐竹', ls_cut2: '横薙', ls_c1_in: '長突・入', ls_c1_hold: '長突・溜', ls_c1_out: '長突・放', ls_c2: '斬返', ls_ult: '奧義・地穿昇斬',
  dw_cut1: '右袈裟', dw_cut2: '左薙', dw_cut3: '十字斬', dw_c1_in: '開斬・入', dw_c1_hold: '開斬・溜', dw_c1_out: '開斬・放', dw_c2: '雙旋',
  dw_ult: '奧義・交差滑斬', dw_as_back: '背刺・雙劍', dw_idle: '雙劍・待機', dw_walk: '雙劍・步行', dw_back: '雙劍・後退', dw_run: '雙劍・疾走',
  mc_cut1: '橫打', mc_cut2: '返打', mc_cut3: '打上', mc_c1_in: '昇擊・入', mc_c1_hold: '昇擊・溜', mc_c1_out: '昇擊・放', mc_c2_hold: '地碎・溜', mc_c2: '地碎',
  mc_as_back: '碎顱・鎚矛',
  wh_cut1: '薙擊', wh_cut2: '返擊', wh_cut3: '天墜', wh_c1_in: '袈裟返・入', wh_c1_hold: '袈裟返・溜', wh_c1_out: '袈裟返・放', wh_c2_hold: '旋擊・溜', wh_c2: '旋擊',
  wh_as_back: '碎顱・戰鎚', wh_idle: '戰鎚・待機', wh_walk: '戰鎚・步行', wh_back: '戰鎚・後退', wh_run: '戰鎚・疾走',
  lc_cut1: '打落', lc_cut2: '撥上', lc_c1_in: '大薙・入', lc_c1_hold: '大薙・溜', lc_c1_out: '大薙・放', lc_c2_hold: '車輪・溜', lc_c2: '車輪',
  lc_as_back: '碎顱・長柄鎚', lc_idle: '長柄鎚・待機', lc_walk: '長柄鎚・步行', lc_back: '長柄鎚・後退', lc_run: '長柄鎚・疾走',
  dg_cut1: '斜斬', dg_cut2: '斬上', dg_cut3: '刺突', dg_c1_in: '亂斬・入', dg_c1_hold: '亂斬・溜', dg_c1_out: '亂斬・放', dg_c2_hold: '雙斬・溜', dg_c2: '雙斬',
  dg_as_back: '背刺・短劍', as_blunt_v: '被碎顱',
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
  mc_cut1: '体の右側から、左側に向かって鎚矛を振り回す', mc_cut2: '左側から、右側に向かって振り回す',
  mc_cut3: '右側の腰あたりで鎚矛を溜め、下から上に向かってかち上げる',
  mc_c1_in: '昇擊の溜めに入る（右の腰へ低く引く）', mc_c1_hold: '腰あたりで鎚矛を溜める', mc_c1_out: '踏み込みながら、下から上へ強くかち上げる',
  mc_c2_hold: 'かち上げた鎚矛を、肩ぐらいの高さで溜める', mc_c2: '一歩進みながら地面に向かって振り下ろし、地面を叩く',
  mc_as_back: '後ろから相手の肩に振り下ろし、跪いたところへ頭に向かって返しで振り下ろす',
  wh_cut1: '脇を開き、肘を曲げて構え、右側から左側に向かって振り回す', wh_cut2: '左側から右側に向かって振り回す',
  wh_cut3: '頭上で強く溜めて、相手に向かって跳び、地面を叩き潰す',
  wh_c1_in: '袈裟返の溜めに入る', wh_c1_hold: '右肩あたりで強く溜める', wh_c1_out: '右斜め上から左斜め下へ振り下ろし、少し溜めて、返しで左斜め下から右斜め上へ振り回す',
  wh_c2_hold: '右斜め上で溜める', wh_c2: '左回りに回転し、右斜め下から左斜め上へかち上げる',
  wh_as_back: '後ろから相手の肩に振り下ろし、跪いたところへ頭に向かって返しで振り下ろす',
  wh_idle: '戰鎚を両手で、体の前に立てて持つ', wh_walk: '戰鎚を両手で持って歩く', wh_back: '戰鎚を両手で持って後ろへ歩く', wh_run: '戰鎚を両手で持って走る',
  lc_cut1: '前に踏み込み、頭上から相手の頭に向かって振り下ろす', lc_cut2: 'そのまま、下から上に向かって返しでかち上げる',
  lc_c1_in: '大薙の溜めに入る', lc_c1_hold: '長柄鎚を右へ引いて溜める', lc_c1_out: '右側から左側に向かって薙ぎ払う',
  lc_c2_hold: '左側に構えて溜める', lc_c2: '左側から右回りをして、回転攻撃をする',
  lc_as_back: '後ろから相手の肩に振り下ろし、跪いたところへ頭に向かって返しで振り下ろす',
  lc_idle: '長柄鎚の柄の先を両手で持ち、体の前に立てる', lc_walk: '長柄鎚を立てて持って歩く', lc_back: '長柄鎚を立てて持って後ろへ歩く', lc_run: '長柄鎚を立てて持って走る',
  dg_cut1: '右上から左下に向かって振り下ろす', dg_cut2: '左下から右上に向かって薙ぎ払う', dg_cut3: '突き刺す',
  dg_c1_in: '亂斬の溜めに入る', dg_c1_hold: '身を沈めて溜める', dg_c1_out: '踏み込みながら、続けて 3 回斬り裂く',
  dg_c2_hold: '短劍を振りかぶって溜める', dg_c2: '続けて 2 回斬り裂く',
  dg_as_back: '後ろから相手の背中を刺す', as_blunt_v: '鈍器の暗殺をされる側（肩を打たれて跪き、頭を打たれて倒れる）',
  ls_ult: '頭上へ振りかぶり、真上から振り下ろして切っ先を地面にめり込ませ、引き抜いて砂煙ごと斬り上げる',
  dw_cut1: '右の剣を右上から左下へ斬り下ろす', dw_cut2: '左の剣を左から右へ水平に薙ぐ', dw_cut3: '頭上で交差させた 2 本を、前で十字を描くように斬り下ろす',
  dw_c1_in: '開斬の溜めに入る', dw_c1_hold: '胸の前で 2 本を交差させて溜める', dw_c1_out: '交差させた 2 本を、左右へ大きく開いて斬り払う',
  dw_c2: '2 本を左右へ広げたまま、右回りに一回転して周りを斬る', dw_ult: '2 本を交差させて低く構え、前へ高速で滑りながら、通り抜けざまに左右へ切り裂く',
  dw_as_back: '後ろから 2 本を同時に背中へ突き刺し、蹴り飛ばして抜く', dw_idle: '2 本を体の前に構えて立つ', dw_walk: '2 本を構えて歩く', dw_back: '2 本を構えて後ろへ下がる', dw_run: '2 本を持って走る',
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
  ['長劍之技', ['ls_cut1', 'ls_cut2', 'ls_c1_in', 'ls_c1_hold', 'ls_c1_out', 'ls_c2', 'ls_ult']],
  ['雙劍之技', ['dw_cut1', 'dw_cut2', 'dw_cut3', 'dw_c1_in', 'dw_c1_hold', 'dw_c1_out', 'dw_c2', 'dw_ult', 'dw_as_back', 'dw_idle', 'dw_walk', 'dw_back', 'dw_run']],
  ['鎚矛之技', ['mc_cut1', 'mc_cut2', 'mc_cut3', 'mc_c1_in', 'mc_c1_hold', 'mc_c1_out', 'mc_c2_hold', 'mc_c2', 'mc_as_back']],
  ['戰鎚之技', ['wh_cut1', 'wh_cut2', 'wh_cut3', 'wh_c1_in', 'wh_c1_hold', 'wh_c1_out', 'wh_c2_hold', 'wh_c2', 'wh_as_back', 'wh_idle', 'wh_walk', 'wh_back', 'wh_run']],
  ['長柄鎚之技', ['lc_cut1', 'lc_cut2', 'lc_c1_in', 'lc_c1_hold', 'lc_c1_out', 'lc_c2_hold', 'lc_c2', 'lc_as_back', 'lc_idle', 'lc_walk', 'lc_back', 'lc_run']],
  ['短劍之技', ['dg_cut1', 'dg_cut2', 'dg_cut3', 'dg_c1_in', 'dg_c1_hold', 'dg_c1_out', 'dg_c2_hold', 'dg_c2', 'dg_as_back']],
  ['楯之技', ['sb_bash', 'sb_push', 'sb_parry', 'sb_charge']],
  ['防禦・迴避', ['guard', 'guard_l', 'guard_h', 'roll', 'step']],
  ['被彈', ['hit_l_f', 'hit_l_b', 'hit_l_l', 'hit_l_r', 'hit_h_f', 'hit_h_b', 'hit_h_l', 'hit_h_r', 'stagger_f', 'stagger_b', 'stagger_l', 'stagger_r', 'hit', 'stagger', 'death']],
  ['暗殺', ['as_back', 'as_slide', 'as_back_v', 'as_slide_v', 'as_blunt_v']],
  ['隱伏', ['hide_wd_in', 'hide_wd_out', 'search_wd', 'drag_wd', 'drag_wd_v', 'hide_bed_in', 'hide_bed_out', 'search_bed', 'drag_bed', 'drag_bed_v']],
  ['姿勢', ['crouch', 'crouch_walk', 'prone_down', 'prone', 'crawl', 'prone_up']],
  ['壁潛', ['cover_l', 'cover_r', 'cover_walk_l', 'cover_walk_r']],
];

/** 武器の種類（圖鑑に出す） */
export const WEAPON_KIND = {
  armingsword: '斬・突', longsword: '斬・突（兩手）', dualsword: '斬（二刀）', mace: '打', spear: '突', dagger: '斬・突', longbow: '射',
  warhammer: '打・突（兩手）', lucerne: '打・突（兩手）',
};

/**
 * 技（武器・楯ごと）。圖鑑には、出し方（how）・効果（effect）・威力だけを出す（利用者の指示）。
 *   威力は数値（game/data.js）から求める：ref = { w: 武器, t: 'combo'・'charge'・'charge2'・'plain'（技の無い武器のふつうの攻撃）・'heavy'（左手の強い一撃）, i: 段 }、
 *   { shield: 楯の技 }、{ lethal: true }（一撃で倒す）。done：ゲームで使える
 */
export const WEAPON_ARTS = {
  armingsword: [
    { name: '踏込突', how: '攻擊ボタン', effect: '通常攻撃 1 段目。前へ細く突く。軽い被弾', ref: { w: 'armingsword', t: 'combo', i: 0 }, done: true },
    { name: '逆袈裟', how: '踏込突の後に攻擊ボタン', effect: '通常攻撃 2 段目。前を広く払う。軽い被弾', ref: { w: 'armingsword', t: 'combo', i: 1 }, done: true },
    { name: '袈裟斬', how: '攻擊ボタンを長押しして離す', effect: '溜攻撃 1。長く溜めるほど強い（1 秒で最大）。重い被弾', ref: { w: 'armingsword', t: 'charge' }, done: true },
    { name: '旋風斬', how: '袈裟斬のすぐ後に、もう一度長押しして離す', effect: '溜攻撃 2。周りをぐるりと斬り、もう一度前を斬る（2 回当たる。2 回目は重い被弾）', ref: { w: 'armingsword', t: 'charge2' }, done: true },
    { name: '背刺', how: '壁裏隠れ・タンス・ベッドから、相手の背中側へ暗殺ボタン', effect: '暗殺（飛び出す間に回避されると失敗）', ref: { lethal: true }, done: true },
    { name: '滑斬', how: '壁裏隠れ・タンス・ベッドから、相手の前・横へ暗殺ボタン', effect: '暗殺（飛び出す間に回避されると失敗）', ref: { lethal: true }, done: true },
  ],
  dualsword: [
    { name: '右袈裟', how: '攻擊ボタン', effect: '通常攻撃 1 段目。右の剣で斬り下ろす。軽い被弾', ref: { w: 'dualsword', t: 'combo', i: 0 }, done: true },
    { name: '左薙', how: '右袈裟の後に攻擊ボタン', effect: '通常攻撃 2 段目。左の剣で水平に薙ぐ。軽い被弾', ref: { w: 'dualsword', t: 'combo', i: 1 }, done: true },
    { name: '十字斬', how: '左薙の後に攻擊ボタン', effect: '通常攻撃 3 段目。2 本で十字に斬り下ろす。重い被弾', ref: { w: 'dualsword', t: 'combo', i: 2 }, done: true },
    { name: '開斬', how: '攻擊ボタンを長押しして離す', effect: '溜攻撃 1。交差させた 2 本を左右へ開いて広く斬る。長く溜めるほど強い（1 秒で最大）。重い被弾', ref: { w: 'dualsword', t: 'charge' }, done: true },
    { name: '雙旋', how: '開斬のすぐ後に、もう一度長押しして離す', effect: '溜攻撃 2。2 本を広げて一回転し、周りを斬る（2 回当たる。2 回目は重い被弾）', ref: { w: 'dualsword', t: 'charge2' }, done: true },
    { name: '奧義・交差滑斬', how: '技能ボタン（劍騎士の奧義。待ち時間 60 秒）', effect: '2 本を交差させて低く構え、前へ 7 m 滑りながら切り裂く（3 回当たる。防禦の上から 3 割通る）', power: '武器の 1.3 倍＋1.3 倍＋2 倍', done: true },
    { name: '背刺', how: '壁裏隠れ・タンス・ベッドから、相手の背中側へ暗殺ボタン', effect: '暗殺。2 本を背中へ突き刺す', ref: { lethal: true }, done: true },
    { name: '滑斬', how: '壁裏隠れ・タンス・ベッドから、相手の前・横へ暗殺ボタン', effect: '暗殺', ref: { lethal: true }, done: true },
  ],
  longsword: [
    { name: '唐竹', how: '攻擊ボタン', effect: '通常攻撃 1 段目。真上から細く斬り下ろす。軽い被弾', ref: { w: 'longsword', t: 'combo', i: 0 }, done: true },
    { name: '横薙', how: '唐竹の後に攻擊ボタン', effect: '通常攻撃 2 段目。前を広く薙ぐ。軽い被弾', ref: { w: 'longsword', t: 'combo', i: 1 }, done: true },
    { name: '長突', how: '攻擊ボタンを長押しして離す', effect: '溜攻撃 1。間合いが長い突き。長く溜めるほど強い（1.1 秒で最大）。重い被弾', ref: { w: 'longsword', t: 'charge' }, done: true },
    { name: '斬返', how: '長突のすぐ後に、もう一度長押しして離す', effect: '溜攻撃 2。2 回斬る（2 回目は重い被弾）', ref: { w: 'longsword', t: 'charge2' }, done: true },
    { name: '奧義・地穿昇斬', how: '技能ボタン（劍騎士の奧義。待ち時間 60 秒）', effect: '真上から振り下ろして地面にめり込ませ、砂煙ごと斬り上げる（2 回当たる。防禦の上から半分通る）', power: '武器の 2.6 倍＋2.4 倍', done: true },
  ],
  mace: [
    { name: '橫打', how: '攻擊ボタン', effect: '通常攻撃 1 段目。右から左へ振り回す。防禦の上からも響く。軽い被弾', ref: { w: 'mace', t: 'combo', i: 0 }, done: true },
    { name: '返打', how: '橫打の後に攻擊ボタン', effect: '通常攻撃 2 段目。左から右へ振り回す。軽い被弾', ref: { w: 'mace', t: 'combo', i: 1 }, done: true },
    { name: '打上', how: '返打の後に攻擊ボタン', effect: '通常攻撃 3 段目。腰で溜めて、下からかち上げる。重い被弾', ref: { w: 'mace', t: 'combo', i: 2 }, done: true },
    { name: '昇擊', how: '攻擊ボタンを長押しして離す', effect: '溜攻撃 1。腰で溜めて、強くかち上げる。長く溜めるほど強い（1 秒で最大）。重い被弾', ref: { w: 'mace', t: 'charge' }, done: true },
    { name: '地碎', how: '昇擊のすぐ後に、もう一度長押しして離す', effect: '溜攻撃 2。肩の高さで溜め、一歩進んで地面を叩く。重い被弾', ref: { w: 'mace', t: 'charge2' }, done: true },
    { name: '碎顱', how: '壁裏隠れ・タンス・ベッドから、相手の背中側へ暗殺ボタン', effect: '暗殺。肩を打って跪かせ、頭を打つ（飛び出す間に回避されると失敗）', ref: { lethal: true }, done: true },
  ],
  warhammer: [
    { name: '薙擊', how: '攻擊ボタン', effect: '通常攻撃 1 段目。肘を曲げて構え、右から左へ振り回す。防禦の上からも響く。軽い被弾', ref: { w: 'warhammer', t: 'combo', i: 0 }, done: true },
    { name: '返擊', how: '薙擊の後に攻擊ボタン', effect: '通常攻撃 2 段目。左から右へ振り回す。軽い被弾', ref: { w: 'warhammer', t: 'combo', i: 1 }, done: true },
    { name: '天墜', how: '返擊の後に攻擊ボタン', effect: '通常攻撃 3 段目。頭上で溜めて跳び、地面を叩き潰す。重い被弾', ref: { w: 'warhammer', t: 'combo', i: 2 }, done: true },
    { name: '袈裟返', how: '攻擊ボタンを長押しして離す', effect: '溜攻撃 1。右上から振り下ろし、返しで振り上げる（2 回当たる）。長く溜めるほど強い（1.2 秒で最大）。重い被弾', ref: { w: 'warhammer', t: 'charge' }, done: true },
    { name: '旋擊', how: '袈裟返のすぐ後に、もう一度長押しして離す', effect: '溜攻撃 2。左回りに回って、かち上げる。重い被弾', ref: { w: 'warhammer', t: 'charge2' }, done: true },
    { name: '碎顱', how: '壁裏隠れ・タンス・ベッドから、相手の背中側へ暗殺ボタン', effect: '暗殺。肩を打って跪かせ、頭を打つ（飛び出す間に回避されると失敗）', ref: { lethal: true }, done: true },
  ],
  lucerne: [
    { name: '打落', how: '攻擊ボタン', effect: '通常攻撃 1 段目。踏み込んで、頭上から相手の頭へ振り下ろす。軽い被弾', ref: { w: 'lucerne', t: 'combo', i: 0 }, done: true },
    { name: '撥上', how: '打落の後に攻擊ボタン', effect: '通常攻撃 2 段目。返しで下からかち上げる。軽い被弾', ref: { w: 'lucerne', t: 'combo', i: 1 }, done: true },
    { name: '大薙', how: '攻擊ボタンを長押しして離す', effect: '溜攻撃 1。右から左へ大きく薙ぎ払う。長く溜めるほど強い（1.1 秒で最大）。重い被弾', ref: { w: 'lucerne', t: 'charge' }, done: true },
    { name: '車輪', how: '大薙のすぐ後に、もう一度長押しして離す', effect: '溜攻撃 2。右回りに回って周りを薙ぐ（2 回当たる。2 回目は重い被弾）', ref: { w: 'lucerne', t: 'charge2' }, done: true },
    { name: '碎顱', how: '壁裏隠れ・タンス・ベッドから、相手の背中側へ暗殺ボタン', effect: '暗殺。肩を打って跪かせ、頭を打つ（飛び出す間に回避されると失敗）', ref: { lethal: true }, done: true },
  ],
  spear: [
    { name: '連突', how: '攻擊ボタン', effect: '通常攻撃。間合いが一番長い', ref: { w: 'spear', t: 'plain' }, done: true },
    { name: '薙拂', how: '左手ボタン', effect: '強い一撃。前を広く薙ぎ払う。重い被弾', ref: { w: 'spear', t: 'heavy' }, done: true },
  ],
  dagger: [
    { name: '斜斬', how: '攻擊ボタン（持替で持ったとき）', effect: '通常攻撃 1 段目。右上から左下へ斬る。振りが速く、隙が小さい。軽い被弾', ref: { w: 'dagger', t: 'combo', i: 0 }, done: true },
    { name: '斬上', how: '斜斬の後に攻擊ボタン', effect: '通常攻撃 2 段目。左下から右上へ斬り上げる。軽い被弾', ref: { w: 'dagger', t: 'combo', i: 1 }, done: true },
    { name: '刺突', how: '斬上の後に攻擊ボタン', effect: '通常攻撃 3 段目。踏み込んで突き刺す。軽い被弾', ref: { w: 'dagger', t: 'combo', i: 2 }, done: true },
    { name: '亂斬', how: '攻擊ボタンを長押しして離す', effect: '溜攻撃 1。続けて 3 回斬り裂く。長く溜めるほど強い（0.8 秒で最大）', ref: { w: 'dagger', t: 'charge' }, done: true },
    { name: '雙斬', how: '亂斬のすぐ後に、もう一度長押しして離す', effect: '溜攻撃 2。続けて 2 回斬り裂く（2 回目は重い被弾）', ref: { w: 'dagger', t: 'charge2' }, done: true },
    { name: '背刺', how: '壁裏隠れ・タンス・ベッドから、相手の背中側へ暗殺ボタン（短劍を持ったとき）', effect: '暗殺。背中を刺す（飛び出す間に回避されると失敗）', ref: { lethal: true }, done: true },
  ],
  longbow: [
    { name: '射', how: '攻擊ボタンを長押しで引き、離して放つ', effect: '引くほど強く遠くへ飛ぶ。引き切った矢は重い被弾', ref: { w: 'longbow', t: 'plain' }, done: true },
    { name: '持替', how: '左手ボタン', effect: '短劍に持ち替える', ref: null, done: true },
  ],
  kite: [
    { name: '防禦', how: '左手ボタンを押している間', effect: '前からの攻撃を楯で受けて傷を減らす（スタミナが減る。切れると崩れる）', ref: null, done: true },
    { name: '楯押', how: '左手ボタンを短く押して離す', effect: '押し返してよろめかせる。防禦の上からでも崩れる', ref: { shield: 'push' }, done: true },
    { name: '楯擊', how: '楯擊ボタン（防禦の構えの間に攻擊ボタンでも）', effect: '楯で殴ってひるませる。重い被弾', ref: { shield: 'bash' }, done: true },
  ],
  buckler: [
    { name: '受流', how: '左手ボタンを短く押す', effect: '当たる直前（0.2 秒の間）に払えば、相手の攻撃を弾いて大きくよろめかせる', ref: null, done: false },
    { name: '楯擊', how: '楯擊ボタン', effect: '楯で殴ってひるませる', ref: null, done: false },
  ],
  pavise: [
    { name: '楯押', how: '左手ボタンを短く押す', effect: '押し返して体勢を崩す', ref: null, done: false },
    { name: '楯突貫', how: '楯攻撃ボタン', effect: '約 4 m 突進する。当たった相手を倒す', ref: null, done: false },
  ],
};

/** 全キャラ共通の技と動き */
export const COMMON_ARTS = [
  { name: '迴避', how: '迴避ボタン', desc: '軽い鎧は前転、重い鎧は跳避。避ける間は攻撃が当たらない。ぎりぎりで避けると「ぴったり回避」', done: true },
  { name: '暗殺', how: '暗殺ボタン（壁裏隠れ・タンス・ベッドに隠れている間だけ。何もない所ではできない）', desc: '近くに来た相手へ飛び出して、一撃で倒す。飛び出す間に回避されると失敗する', done: true },
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
    recommend: [['鎚矛', '一撃が重く、防禦の上からも響く'], ['戰鎚', '両手で振る、いちばん重い一撃'], ['長柄鎚', '間合いが長く、遠くから突き・薙ぐ']],
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
