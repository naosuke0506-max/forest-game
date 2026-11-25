// 英雄の紋（利用者の指示 2026-11-25：英雄ごとに色と紋）。必殺ボタン・必殺技の名前の帯（render/ult-show.js）・圖鑑で使う。
//   楯劍騎士＝楯と波（wave）・劍騎士＝交差した劍と稲妻（swords）・長柄騎士＝山と槍（mountain）・打擊騎士＝鎚と火（hammer）・
//   弓兵＝鷹の翼と矢（wing）・祓魔僧＝光輪（halo）。どれも 100×100 の枠に、外の二重の輪と真ん中の絵。色は currentColor（使う所の色）
const RING = '<circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="4.5"/>'
  + '<circle cx="50" cy="50" r="39.5" fill="none" stroke="currentColor" stroke-width="1.6"/>';

const ART = {
  // 楯（凧の形）と、その中で巻く波
  wave: '<path d="M50 17 L75 25 L73.5 51 Q70 70 50 83 Q30 70 26.5 51 L25 25 Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>'
    + '<path d="M31 59 C36 49 44 47 49 53 C53 57 58 55 58 49 C58 42 51 40 47 44 C52 34 65 35 69 45 C71 51 69 57 71 61" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
    + '<path d="M33 68 Q41 63 49 68 T66 68" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  // 交差した 2 本の劍と、その間を走る稲妻
  swords: '<g stroke="currentColor" stroke-linecap="round" fill="none">'
    + '<path d="M27 73 L70 26" stroke-width="5"/><path d="M73 73 L30 26" stroke-width="5"/>'
    + '<path d="M31 61 L41 71 M69 61 L59 71" stroke-width="5"/></g>'
    + '<circle cx="25" cy="75" r="4" fill="currentColor"/><circle cx="75" cy="75" r="4" fill="currentColor"/>'
    + '<path d="M54 26 L43 50 L51 50 L45 74 L61 45 L53 45 L59 26 Z" fill="currentColor"/>',
  // 山（雪の線）と、真ん中に立つ槍
  mountain: '<path d="M16 73 L40 37 L48 47 L59 30 L84 73 Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>'
    + '<path d="M34 46 L40 52 L45 47 M54 38 L59 44 L64 39" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>'
    + '<path d="M50 30 L50 84" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/>'
    + '<path d="M50 11 L57 24 L50 31 L43 24 Z" fill="currentColor"/>',
  // 鎚と、その上に上がる火
  hammer: '<path d="M40 31 C35 23 41 19 41 12 C47 18 46 24 50 27 C52 20 56 16 56 10 C63 18 65 25 60 31 Z" fill="currentColor"/>'
    + '<rect x="31" y="32" width="38" height="17" rx="2.5" fill="currentColor"/>'
    + '<path d="M50 49 L50 84" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>'
    + '<path d="M44 74 L56 74" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  // 鷹の翼（羽が扇に広がる）と、下を通る矢
  wing: '<g fill="currentColor">'
    + '<path d="M30 62 Q48 36 82 26 Q60 46 33 65 Z"/><path d="M31 64 Q54 46 84 42 Q60 56 34 67 Z"/>'
    + '<path d="M32 66 Q55 56 81 57 Q58 64 34 69 Z"/><path d="M33 68 Q52 64 74 70 Q54 71 35 71 Z"/></g>'
    + '<path d="M17 77 L80 77" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    + '<path d="M84 77 L75 72 L75 82 Z M17 77 L12 72 M17 77 L12 82" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  // 光輪と、周りの光の筋、真ん中の十字
  halo: '<circle cx="50" cy="47" r="17" fill="none" stroke="currentColor" stroke-width="4.5"/>'
    + `<g stroke="currentColor" stroke-width="3" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), r0 = 23, r1 = i % 2 ? 28 : 32;
      return `<path d="M${(50 + c * r0).toFixed(1)} ${(47 + s * r0).toFixed(1)} L${(50 + c * r1).toFixed(1)} ${(47 + s * r1).toFixed(1)}"/>`;
    }).join('')}</g>`
    + '<path d="M50 36 L50 60 M42 44 L58 44" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
};

/** 紋の絵（svg の文字列）。ring：外の二重の輪を付ける */
export function crestSvg(id, { ring = true } = {}) {
  const art = ART[id] || ART.halo;
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ring ? RING : ''}${art}</svg>`;
}
