// 刻の門：刻が変わって時間が止まっている間（data.js の PHASE_FREEZE 秒）、画面をふさぐ鉄の両開きの門。
// 利用者の指示（2026-11-16：時間が止まる時、背景一面を灰色の鉄の壁にして、真ん中に報酬一覧）
//          （2026-11-17：実写感を上げ、ゲートのようにガシャンガシャンと言いながら開くように）
//   絵：Blender で描いた鉄の門（tools/make_gate.py。写真から作った鉄板の質感）。左の扉・右の扉・かんぬきの 3 枚（assets/ui/gate/）
//   流れ（時間が止まってからの秒）：
//     0〜0.34 両側から扉が走ってきて、ガシャーンと閉まる（画面が揺れ、合わせ目から埃が舞う）
//     0.55〜0.7 上下のかんぬきが左の扉へ差し込まれる（ガシャン）
//     （報酬を選ぶ）
//     OPEN〜 かんぬきが抜ける（ガシャン）→ 扉が 3 度、引っかかりながら開き（ガシャン、ガシャン、ガシャン）→ 一気に左右へ開ききる
//   扉の絵の大きさ：門は幅 5.5 m・高さ 4 m。画面の半分を、扉 1 枚がすき間なく覆う大きさにする（--ppm：1 m が何 px か）
import { PHASE_FREEZE } from '../game/data.js';

// 門の並び（m。tools/make_gate.py の数と同じ）
const GATE = { halfW: 2.75, h: 4, beamZ: [0.75, 3.25], bolt: { x0: -0.52, x1: 0.92, h: 0.42, travel: 0.55 } };
const T = {
  shut: 0.34,                 // 扉が閉まりきる
  boltIn: [0.55, 0.7],        // かんぬきを差し込む
  open: PHASE_FREEZE - 1.5,   // 開き始める（かんぬきを抜く）
};
// 開く動き（open からの秒 → 開いた割合）：かんぬき → 3 度の引っかかり → 一気に
const OPEN_STEPS = [
  { at: 0.3, to: 0.07, dur: 0.09 },
  { at: 0.58, to: 0.17, dur: 0.1 },
  { at: 0.84, to: 0.3, dur: 0.1 },
  { at: 1.06, to: 1.0, dur: 0.42, slide: true },
];
const BOLT_OUT = [0.0, 0.16];   // かんぬきを抜く（open からの秒）

const ease = (k) => k * k * (3 - 2 * k);
const easeIn = (k) => k * k;
const easeOut = (k) => 1 - (1 - k) * (1 - k);

/**
 * @param {{ sfx: object }} o sfx：音（audio/sfx.js の gate）
 */
export function createTimeGate({ sfx }) {
  const el = document.getElementById('timegate');
  if (!el) return { update() {}, get open() { return 1; } };
  const shakeEl = el.querySelector('.tg-shake'), left = el.querySelector('.tg-l'), right = el.querySelector('.tg-r');
  const bolts = [...el.querySelectorAll('.tg-bolt')], dust = el.querySelector('.tg-dust'), note = el.querySelector('.tg-left');
  // 絵を先に読み込んでおく（初めて閉まるときに、絵が遅れて出ないように）
  for (const name of ['gate_l', 'gate_r', 'gate_bolt']) { const im = new Image(); im.src = new URL(`../../assets/ui/gate/${name}.webp`, import.meta.url).href; }

  // 大きさ：扉 1 枚（幅 2.75 m・高さ 4 m）が、画面の左半分（右半分）をすき間なく覆う
  const layout = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const ppm = Math.max(w / 2 / GATE.halfW, h / GATE.h);
    el.style.setProperty('--ppm', `${ppm.toFixed(3)}px`);
  };
  layout();
  window.addEventListener('resize', layout);
  // かんぬき：右の扉の子（合わせ目から左へはみ出して、左の扉の受けまで届く）
  bolts.forEach((b, i) => {
    const zc = GATE.beamZ[i];
    b.style.left = `calc(${GATE.bolt.x0} * var(--ppm))`;
    b.style.width = `calc(${(GATE.bolt.x1 - GATE.bolt.x0).toFixed(3)} * var(--ppm))`;
    b.style.height = `calc(${GATE.bolt.h} * var(--ppm))`;
    b.style.top = `calc(${(GATE.h - zc - GATE.bolt.h / 2).toFixed(3)} * var(--ppm))`;
  });

  let shown = false, last = -1, shake = 0, shakeT = 0, openK = 1, fired = new Set();
  const hit = (name, kind, amp) => {
    if (fired.has(name)) return;
    fired.add(name);
    sfx?.gate?.(kind);
    shake = Math.max(shake, amp);
    if (kind === 'slam' && dust) { dust.classList.remove('on'); void dust.offsetWidth; dust.classList.add('on'); }
  };
  const setDoors = (k) => {   // k：開いた割合（0 で閉まっている、1 で画面の外）
    openK = k;
    left.style.transform = `translate3d(${(-k * 100).toFixed(2)}%, 0, 0)`;
    right.style.transform = `translate3d(${(k * 100).toFixed(2)}%, 0, 0)`;
  };
  const setBolts = (k) => {   // k：抜いた割合（0 で差し込んである）
    for (const b of bolts) b.style.transform = `translate3d(calc(${(k * GATE.bolt.travel).toFixed(3)} * var(--ppm)), 0, 0)`;
  };

  return {
    /** 開いた割合（0〜1。1 で門は見えない） */
    get open() { return openK; },
    /**
     * 毎フレーム
     * @param {number} freezeLeft 時間が止まっている残り（秒。match.freeze）
     * @param {boolean} on 門を出すか（倒れて観戦している間は出さない）
     */
    update(dt, freezeLeft, on) {
      const active = on && freezeLeft > 0;
      if (!active) {
        if (shown) { shown = false; el.hidden = true; el.classList.remove('opening'); document.body.classList.remove('gate-opening'); setDoors(1); }
        last = -1;
        return;
      }
      const t = PHASE_FREEZE - freezeLeft;   // 時間が止まってからの秒
      if (!shown || t < last - 0.5) {        // 新しく止まった
        shown = true; el.hidden = false; fired = new Set(); shake = 0;
        el.classList.remove('opening'); document.body.classList.remove('gate-opening');
        setBolts(1);
      }
      last = t;
      // 扉
      if (t < T.shut) setDoors(1 - easeIn(t / T.shut));
      else if (t < T.open) { setDoors(0); hit('slam', 'slam', 16); }
      else {
        const u = t - T.open;
        let k = 0;
        for (const s of OPEN_STEPS) {
          if (u < s.at) break;
          const from = k;
          const q = Math.min(1, (u - s.at) / s.dur);
          k = from + (s.to - from) * (s.slide ? easeIn(q) : easeOut(q));
          if (s.slide ? q > 0 : q >= 1) hit(`step${s.at}`, s.slide ? 'grind' : 'clank', s.slide ? 5 : 9);   // 引っかかって止まった時にガシャン。最後は擦れながら開く
          if (q < 1) break;
        }
        setDoors(k);
        el.classList.add('opening');   // 「時が動き出すまで」を消す
        document.body.classList.toggle('gate-opening', u >= OPEN_STEPS.at(-1).at);   // 一気に開く時に、報酬の板を消す
      }
      // かんぬき
      if (t < T.boltIn[0]) setBolts(1);
      else if (t < T.boltIn[1]) setBolts(1 - easeIn((t - T.boltIn[0]) / (T.boltIn[1] - T.boltIn[0])));
      else if (t < T.open + BOLT_OUT[0]) { setBolts(0); hit('boltIn', 'bolt', 6); }
      else {
        const q = Math.min(1, (t - T.open - BOLT_OUT[0]) / (BOLT_OUT[1] - BOLT_OUT[0]));
        setBolts(ease(q));
        if (q >= 1) hit('boltOut', 'bolt', 5);
      }
      if (note) {
        const n = Math.ceil(freezeLeft);
        if (note.dataset.n !== String(n)) { note.dataset.n = String(n); note.textContent = `時が動き出すまで ${n}`; }
      }
      // 揺れ（打ったときに大きく、すぐ収まる）
      shakeT += dt;
      shake *= Math.exp(-dt * 11);
      if (shakeEl) {
        const a = shake < 0.3 ? 0 : shake;
        shakeEl.style.transform = a ? `translate3d(${(Math.sin(shakeT * 91) * a * 0.6).toFixed(1)}px, ${(Math.sin(shakeT * 67 + 1.3) * a).toFixed(1)}px, 0)` : '';
      }
    },
  };
}
