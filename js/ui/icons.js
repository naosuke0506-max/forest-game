// 画面で使う絵（SVG）。画像ファイルを読み込まずに描けるよう、文字列で持つ。
//   ボタンの絵は白一色（currentColor）
const svg = (body, view = '0 0 24 24') => `<svg viewBox="${view}" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  // ===== ボタン・飾り（白一色） =====
  sword: svg(`<path fill="currentColor" d="M19.8 2.5 21.5 4.2 11 14.7l-1.7-1.7zM8.6 13.2l2.2 2.2-1.1 1.1 1.4 1.4-1.4 1.4-1.4-1.4-3 3L3.2 19.8l3-3-1.4-1.4 1.4-1.4 1.4 1.4z"/>`),
  bow: svg(`<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 2.5c8.5 2.5 13 7 15.5 15.5"/><path stroke="currentColor" stroke-width="1" d="M6 2.5 21.5 18"/><path fill="currentColor" d="M3 21l9.6-9.6 1 1L4 22zM14.2 9.6l2.2-.6-.6 2.2z"/>`),
  mace: svg(`<path fill="currentColor" d="M3 19.6 12.6 10l1.4 1.4L4.4 21z"/><circle cx="16" cy="8" r="4" fill="currentColor"/><path fill="currentColor" d="M16 1.5l1 2.6h-2zM22.5 8l-2.6 1V7zM16 14.5l-1-2.6h2zM9.5 8l2.6-1v2zM20.6 3.4l-.8 2.6-1.8-1.8zM20.6 12.6 18 11.8l1.8-1.8zM11.4 3.4 14 4.2 12.2 6z"/>`),
  spear: svg(`<path fill="currentColor" d="M2.5 20.1 15.8 6.8l1.4 1.4L3.9 21.5z"/><path fill="currentColor" d="M21.8 2.2c-.6 3.4-2.5 6.1-4.4 7.4l-3-3c1.3-1.9 4-3.8 7.4-4.4z"/><path stroke="currentColor" stroke-width="1.6" d="M13.3 7.5l3.2 3.2"/>`),
  dagger: svg(`<path fill="currentColor" d="M20.5 3.5l-1.2 4.8-6.7 6.7-1.4-1.4 6.7-6.7zM10.2 12.2l1.6 1.6-.9.9 1.2 1.2-1.4 1.4-1.2-1.2-3.6 3.6-1.6-1.6 3.6-3.6-1.2-1.2 1.4-1.4 1.2 1.2z"/>`),
  shield: svg(`<path fill="currentColor" d="M12 2 20 5v6.5c0 5-3.4 8.6-8 10.5-4.6-1.9-8-5.5-8-10.5V5zm0 2.2L6 6.4v5.1c0 3.8 2.4 6.7 6 8.3z"/>`),
  heavy: svg(`<path fill="currentColor" d="M14.5 2.5h3v3l-8.9 8.9-3-3zM5 12.1l2.1 2.1L5.4 16l2.6 2.6 1.8-1.7 2.1 2.1-1.4 1.4-1.4-1.4-2.8 2.8-3.6-3.6 2.8-2.8-1.4-1.4z"/><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M20.5 9.5c.6 3.8-1.4 7.6-5 9.3"/>`),
  switch: svg(`<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 9h12l-3-3M19 15H7l3 3"/>`),
  // 技能（專用技能）：八方へ光を放つ星
  skill: svg(`<path fill="currentColor" d="M12 1.5l2.1 6.2 6.4-2.2-3.9 5.5 5.9 3.1-6.6.6.9 6.6L12 16.6l-4.8 4.7.9-6.6-6.6-.6 5.9-3.1-3.9-5.5 6.4 2.2z"/>`),
  sprint: svg(`<circle cx="15.5" cy="4" r="2" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 21l3-6 3 2.5V22M8.5 10.5l3.5-3 3.5 3 3 1M12 7.5l-.8 5.5M2.5 9h4M1.5 13h4M3 17h3"/>`),
  dodge: svg(`<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4.5 16.5a7.5 7.5 0 0 1 13.4-6.6M18.5 4.8l-.6 5.1-5-.9"/><circle cx="7" cy="19" r="1.4" fill="currentColor"/>`),
  hand: svg(`<path fill="currentColor" d="M8 11V5.2a1.4 1.4 0 0 1 2.8 0V10h.4V3.7a1.4 1.4 0 0 1 2.8 0V10h.4V4.9a1.4 1.4 0 0 1 2.8 0V11h.3V7.4a1.4 1.4 0 0 1 2.8 0v6.8c0 4.4-3 7.8-7.4 7.8-3 0-4.9-1.4-6.5-4L4.2 13a1.5 1.5 0 0 1 2.5-1.6z"/>`),
  gear: svg(`<path fill="currentColor" d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/>`),
  sun: svg(`<circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></g>`),
  dusk: svg(`<path fill="currentColor" d="M6.5 16a5.5 5.5 0 0 1 11 0z"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.5 19.5h19M12 6.5V9M4.6 9.6l1.7 1.7M19.4 9.6l-1.7 1.7"/></g>`),
  moon: svg(`<path fill="currentColor" d="M14.5 2.5a9.5 9.5 0 1 0 7 15.6A8 8 0 0 1 14.5 2.5z"/>`),
  // 探す（目）・隠れる（頭巾）・出る（扉から出る矢印）・致命の一撃（髑髏）
  // 壁裏隠れ：壁（左の縦の帯）に背を付けて立つ人
  wall: svg(`<path fill="currentColor" d="M3 2h4v20H3z" opacity=".85"/><circle cx="11" cy="5" r="2.2" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M10.4 8v7l-1 6M10.4 15l2.4 6M10.4 9.6l4.2 2.4M17 12h4m-1.6-1.8L21 12l-1.6 1.8"/>`),
  // 姿勢ボタン：立つ・しゃがむ・伏せる（今の姿勢を描く）
  stand: svg(`<circle cx="12" cy="4" r="2.2" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 7v7.5l-2.6 6.5M12 14.5l2.6 6.5M8.6 12.2 12 8.6l3.4 3.6"/>`),
  crouch: svg(`<circle cx="14" cy="5.5" r="2.2" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M13 8.5 9.5 13.5l5 1.8-1.8 5M9.5 13.5l-2.2 4.2 2.4 2.3M12.4 9.6l3.6 2.4"/><path stroke="currentColor" stroke-width="1.2" d="M3 21.5h18"/>`),
  prone: svg(`<circle cx="19" cy="12.5" r="2.2" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M16.5 14.2 6 16.4l-3.5.4M14.5 14.6l1.6 3.8M9 15.8l-1.2 2.4"/><path stroke="currentColor" stroke-width="1.2" d="M2 20h20"/>`),
  eye: svg(`<path fill="currentColor" d="M12 5c5 0 8.6 3.6 10 7-1.4 3.4-5 7-10 7S3.4 15.4 2 12c1.4-3.4 5-7 10-7zm0 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 2.2a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6z"/>`),
  hood: svg(`<path fill="currentColor" d="M12 2c4.4 0 7.5 3.6 7.5 8.4V22h-3.2l-1-4.3a5.8 5.8 0 0 1-6.6 0L7.7 22H4.5V10.4C4.5 5.6 7.6 2 12 2zm0 5.2c-2.3 0-3.9 1.8-3.9 4.1 0 1.6 1.7 3.2 3.9 3.2s3.9-1.6 3.9-3.2c0-2.3-1.6-4.1-3.9-4.1z"/>`),
  exit: svg(`<path fill="currentColor" d="M4 3h9v4h-2V5H6v14h5v-2h2v4H4z"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M10 12h10m-3.5-3.5L20 12l-3.5 3.5"/>`),
  skull: svg(`<path fill="currentColor" d="M12 2.5c4.7 0 8 3.2 8 7.6 0 2.6-1.2 4.4-2.8 5.4V19c0 .8-.7 1.5-1.5 1.5h-1.2v-2h-1.3v2h-2.4v-2H9.5v2H8.3c-.8 0-1.5-.7-1.5-1.5v-3.5C5.2 14.5 4 12.7 4 10.1c0-4.4 3.3-7.6 8-7.6zM8.6 9.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6.8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 13.6l-1.1 2h2.2z"/>`),
  close: svg(`<path stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/>`),
};

/** 時間帯の絵（朝・昼は太陽、夕暮れは沈む日、深夜は月） */
/** 武器の絵 */
export const weaponIconOf = (id) => ({ longbow: ICONS.bow, mace: ICONS.mace, warhammer: ICONS.mace, lucerne: ICONS.mace, spear: ICONS.spear, dagger: ICONS.dagger }[id] || ICONS.sword);

export const timeIcon = (time) => (time === 'night' ? ICONS.moon : time === 'dusk' ? ICONS.dusk : ICONS.sun);
