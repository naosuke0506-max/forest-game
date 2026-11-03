// 画面で使う絵（SVG）。画像ファイルを読み込まずに描けるよう、文字列で持つ。
//   素材の 4 種類は色付き、ボタンの絵は白一色（currentColor）
const svg = (body, view = '0 0 24 24') => `<svg viewBox="${view}" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  // ===== 素材 =====
  wood: svg(`
    <circle cx="7" cy="16" r="4.6" fill="#8a5a33" stroke="#3b2414" stroke-width="1"/>
    <circle cx="17" cy="16" r="4.6" fill="#8a5a33" stroke="#3b2414" stroke-width="1"/>
    <circle cx="12" cy="8" r="4.6" fill="#94643a" stroke="#3b2414" stroke-width="1"/>
    <g fill="none" stroke="#d9b98a" stroke-width=".9"><circle cx="7" cy="16" r="2.4"/><circle cx="17" cy="16" r="2.4"/><circle cx="12" cy="8" r="2.4"/></g>
    <g fill="#e6c99b"><circle cx="7" cy="16" r=".9"/><circle cx="17" cy="16" r=".9"/><circle cx="12" cy="8" r=".9"/></g>`),
  stone: svg(`
    <path d="M3 18.5 5.5 12l5-2.5 4 2 2 6.5-3 2.5H6z" fill="#8f8d86" stroke="#3a3936" stroke-width="1"/>
    <path d="M12.5 19.5 15 13l4-1.5 2.5 3.5-.5 4-3 1.5z" fill="#a7a59c" stroke="#3a3936" stroke-width="1"/>
    <path d="M8 10.5 10 5.5l4-1 2.5 3-1.5 4-4.5.5z" fill="#b3b0a6" stroke="#3a3936" stroke-width="1"/>
    <path d="M6.5 13.5 9 12m3.5 3 1.5-1.5M10.5 7.5l2-1" stroke="#5f5d58" stroke-width=".8" fill="none"/>`),
  iron: svg(`
    <path d="M3.5 19 15.5 7l2 2-12 12z" fill="#9aa3ad" stroke="#2c3036" stroke-width="1"/>
    <path d="M15 5.5 18.5 9M14 6.5l3.5 3.5" stroke="#2c3036" stroke-width="1.6"/>
    <path d="M17.5 8.5l2.5-2.5 1.5 1.5-2.5 2.5" fill="#6b5844" stroke="#2c3036" stroke-width="1"/>
    <path d="M4 7.5h8.5v3H4z" transform="rotate(-18 8 9)" fill="#9b5a2e" stroke="#3b2414" stroke-width="1"/>
    <circle cx="8" cy="15" r=".7" fill="#9b5a2e"/><circle cx="10.5" cy="12.5" r=".6" fill="#9b5a2e"/>`),
  cloth: svg(`
    <path d="M3 14.5h13.5l3.5 3v3H3z" fill="#d8ccad" stroke="#4a4232" stroke-width="1"/>
    <path d="M3 17.5h17" stroke="#9e9070" stroke-width=".8"/>
    <rect x="4" y="5" width="16" height="7" rx="3.5" fill="#8a5a33" stroke="#3b2414" stroke-width="1"/>
    <ellipse cx="17" cy="8.5" rx="2" ry="3.5" fill="#a87447" stroke="#3b2414" stroke-width=".9"/>
    <path d="M10 5v7" stroke="#3b2414" stroke-width="1.4"/>`),
  // ===== ボタン・飾り（白一色） =====
  sword: svg(`<path fill="currentColor" d="M19.8 2.5 21.5 4.2 11 14.7l-1.7-1.7zM8.6 13.2l2.2 2.2-1.1 1.1 1.4 1.4-1.4 1.4-1.4-1.4-3 3L3.2 19.8l3-3-1.4-1.4 1.4-1.4 1.4 1.4z"/>`),
  bow: svg(`<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 2.5c8.5 2.5 13 7 15.5 15.5"/><path stroke="currentColor" stroke-width="1" d="M6 2.5 21.5 18"/><path fill="currentColor" d="M3 21l9.6-9.6 1 1L4 22zM14.2 9.6l2.2-.6-.6 2.2z"/>`),
  mace: svg(`<path fill="currentColor" d="M3 19.6 12.6 10l1.4 1.4L4.4 21z"/><circle cx="16" cy="8" r="4" fill="currentColor"/><path fill="currentColor" d="M16 1.5l1 2.6h-2zM22.5 8l-2.6 1V7zM16 14.5l-1-2.6h2zM9.5 8l2.6-1v2zM20.6 3.4l-.8 2.6-1.8-1.8zM20.6 12.6 18 11.8l1.8-1.8zM11.4 3.4 14 4.2 12.2 6z"/>`),
  spear: svg(`<path fill="currentColor" d="M2.5 20.1 15.8 6.8l1.4 1.4L3.9 21.5z"/><path fill="currentColor" d="M21.8 2.2c-.6 3.4-2.5 6.1-4.4 7.4l-3-3c1.3-1.9 4-3.8 7.4-4.4z"/><path stroke="currentColor" stroke-width="1.6" d="M13.3 7.5l3.2 3.2"/>`),
  dagger: svg(`<path fill="currentColor" d="M20.5 3.5l-1.2 4.8-6.7 6.7-1.4-1.4 6.7-6.7zM10.2 12.2l1.6 1.6-.9.9 1.2 1.2-1.4 1.4-1.2-1.2-3.6 3.6-1.6-1.6 3.6-3.6-1.2-1.2 1.4-1.4 1.2 1.2z"/>`),
  shield: svg(`<path fill="currentColor" d="M12 2 20 5v6.5c0 5-3.4 8.6-8 10.5-4.6-1.9-8-5.5-8-10.5V5zm0 2.2L6 6.4v5.1c0 3.8 2.4 6.7 6 8.3z"/>`),
  heavy: svg(`<path fill="currentColor" d="M14.5 2.5h3v3l-8.9 8.9-3-3zM5 12.1l2.1 2.1L5.4 16l2.6 2.6 1.8-1.7 2.1 2.1-1.4 1.4-1.4-1.4-2.8 2.8-3.6-3.6 2.8-2.8-1.4-1.4z"/><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M20.5 9.5c.6 3.8-1.4 7.6-5 9.3"/>`),
  switch: svg(`<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 9h12l-3-3M19 15H7l3 3"/>`),
  dodge: svg(`<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4.5 16.5a7.5 7.5 0 0 1 13.4-6.6M18.5 4.8l-.6 5.1-5-.9"/><circle cx="7" cy="19" r="1.4" fill="currentColor"/>`),
  hand: svg(`<path fill="currentColor" d="M8 11V5.2a1.4 1.4 0 0 1 2.8 0V10h.4V3.7a1.4 1.4 0 0 1 2.8 0V10h.4V4.9a1.4 1.4 0 0 1 2.8 0V11h.3V7.4a1.4 1.4 0 0 1 2.8 0v6.8c0 4.4-3 7.8-7.4 7.8-3 0-4.9-1.4-6.5-4L4.2 13a1.5 1.5 0 0 1 2.5-1.6z"/>`),
  crate: svg(`<path fill="currentColor" d="M3 8h18v12H3zm2 2v8h14v-8zM2.5 4h19v3h-19z"/><path stroke="currentColor" stroke-width="1.6" d="M5 10l14 8M19 10 5 18"/>`),
  hammer: svg(`<path fill="currentColor" d="M13.6 2.6 21.4 10.4 18.6 13.2 16.5 11.1 6.4 21.2 2.8 17.6 12.9 7.5 10.8 5.4z"/>`),
  gear: svg(`<path fill="currentColor" d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/>`),
  sun: svg(`<circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></g>`),
  dusk: svg(`<path fill="currentColor" d="M6.5 16a5.5 5.5 0 0 1 11 0z"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.5 19.5h19M12 6.5V9M4.6 9.6l1.7 1.7M19.4 9.6l-1.7 1.7"/></g>`),
  moon: svg(`<path fill="currentColor" d="M14.5 2.5a9.5 9.5 0 1 0 7 15.6A8 8 0 0 1 14.5 2.5z"/>`),
  // 探す（目）・隠れる（頭巾）・出る（扉から出る矢印）・致命の一撃（髑髏）
  eye: svg(`<path fill="currentColor" d="M12 5c5 0 8.6 3.6 10 7-1.4 3.4-5 7-10 7S3.4 15.4 2 12c1.4-3.4 5-7 10-7zm0 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 2.2a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6z"/>`),
  hood: svg(`<path fill="currentColor" d="M12 2c4.4 0 7.5 3.6 7.5 8.4V22h-3.2l-1-4.3a5.8 5.8 0 0 1-6.6 0L7.7 22H4.5V10.4C4.5 5.6 7.6 2 12 2zm0 5.2c-2.3 0-3.9 1.8-3.9 4.1 0 1.6 1.7 3.2 3.9 3.2s3.9-1.6 3.9-3.2c0-2.3-1.6-4.1-3.9-4.1z"/>`),
  exit: svg(`<path fill="currentColor" d="M4 3h9v4h-2V5H6v14h5v-2h2v4H4z"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M10 12h10m-3.5-3.5L20 12l-3.5 3.5"/>`),
  skull: svg(`<path fill="currentColor" d="M12 2.5c4.7 0 8 3.2 8 7.6 0 2.6-1.2 4.4-2.8 5.4V19c0 .8-.7 1.5-1.5 1.5h-1.2v-2h-1.3v2h-2.4v-2H9.5v2H8.3c-.8 0-1.5-.7-1.5-1.5v-3.5C5.2 14.5 4 12.7 4 10.1c0-4.4 3.3-7.6 8-7.6zM8.6 9.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6.8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 13.6l-1.1 2h2.2z"/>`),
  close: svg(`<path stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/>`),
};

/** 時間帯の絵（朝・昼は太陽、夕暮れは沈む日、深夜は月） */
/** 武器の絵 */
export const weaponIconOf = (id) => ({ longbow: ICONS.bow, mace: ICONS.mace, spear: ICONS.spear, dagger: ICONS.dagger }[id] || ICONS.sword);

export const timeIcon = (time) => (time === 'night' ? ICONS.moon : time === 'dusk' ? ICONS.dusk : ICONS.sun);
