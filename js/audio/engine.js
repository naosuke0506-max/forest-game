// 音の土台（Web Audio。音の素材ファイルは使わず、その場で作る）。
//   iPad の Safari は、指で触ったとき（試合を始めるボタン）に音を出す許可が下りる。unlock() をその中で呼ぶ
//   ・音量：master（設定の「音」）。最後に音のつぶれを防ぐコンプレッサーを通す
//   ・雑音の素：白い雑音・茶色の雑音（低い音が多い）を最初に 1 回だけ作り、使い回す
//   ・位置：聞く人（カメラ）からの左右の向きと遠さで、左右の振り分け・大きさ・こもり（遠いほど高い音が減る）を決める
// 計算が軽い物だけを使う（3D の立体音響 HRTF は使わない）

let ctx = null, master = null, out = null, white = null, brown = null;
let volume = 0.8;
const listener = { x: 0, y: 0, z: 0, yaw: 0, indoor: 0 };

export const audio = {
  get ctx() { return ctx; },
  get ready() { return !!ctx && ctx.state === 'running'; },
  get master() { return master; },
  listener,

  /** 指で触ったときに呼ぶ（iPad で音を出せるようにする）。何度呼んでもよい */
  unlock() {
    try {
      // iPad の消音スイッチが入っていても鳴るように（対応している Safari だけ）
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4;
        comp.attack.value = 0.004; comp.release.value = 0.25;
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(comp);
        comp.connect(ctx.destination);
        out = master;
        white = makeNoise(ctx, 2, false);
        brown = makeNoise(ctx, 4, true);
      }
      if (ctx.state !== 'running') ctx.resume();
      // 無音を 1 回鳴らして、確実に音の出口を開ける（古い Safari 向け）
      const b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start();
    } catch (err) { console.warn('音を出せません', err); }
  },
  /** 音量（0〜1） */
  setVolume(v) {
    volume = v;
    if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  },
  /** 聞く人の位置と向き（毎フレーム）。indoor：家の中（0〜1。外の音がこもる） */
  setListener(x, y, z, yaw, indoor = 0) { Object.assign(listener, { x, y, z, yaw, indoor }); },

  get white() { return white; },
  get brown() { return brown; },
  get out() { return out; },
};

/** 雑音の素（長さ sec 秒、繰り返して使う）。brown は低い音の多い茶色の雑音 */
function makeNoise(c, sec, isBrown) {
  const n = Math.floor(c.sampleRate * sec);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (isBrown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return buf;
}

/**
 * 位置 (x, y, z) の音の、左右の振り分け・大きさ・こもりを求める（聞く人からの向きと遠さ）
 * @returns {{ pan: number, gain: number, cutoff: number, dist: number }}
 */
export function placeOf(x, y, z, { ref = 3, max = 60 } = {}) {
  const dx = x - listener.x, dz = z - listener.z, dy = (y ?? listener.y) - listener.y;
  const dist = Math.hypot(dx, dy, dz);
  const yaw = (listener.yaw * Math.PI) / 180;
  // 聞く人の右（+X を向きで回した向き）への成分で左右を決める
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const side = dist > 0.01 ? (dx * rx + dz * rz) / Math.max(1, dist) : 0;
  const gain = dist < max ? Math.min(1, ref / Math.max(ref, dist)) * (1 - dist / max) ** 0.5 : 0;
  const cutoff = Math.max(900, 16000 * Math.exp(-dist / 28));   // 遠いほど高い音が減る
  return { pan: Math.max(-1, Math.min(1, side * 0.85)), gain, cutoff, dist };
}

/** 音の出口を作る：音量 → こもり → 左右。dest へつなぐ。返り値の input へ音をつなぐ */
export function outlet({ gain = 1, pan = 0, cutoff = 20000, dest = null }) {
  const g = ctx.createGain();
  g.gain.value = gain;
  let node = g;
  if (cutoff < 18000) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    node.connect(f); node = f;
  }
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(p); node = p;
  }
  node.connect(dest || out);
  return g;
}

/** 雑音を短く鳴らす（フィルター付き）。返り値は止める時刻 */
export function noiseHit(dest, { t = 0, dur = 0.1, type = 'bandpass', freq = 1000, q = 1, freqEnd = null, attack = 0.004, gain = 0.5, buf = null, rate = 1 }) {
  const t0 = ctx.currentTime + t;
  const s = ctx.createBufferSource();
  s.buffer = buf || white;
  s.playbackRate.value = rate;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  // フィルターで削った分だけ大きくする（狭い帯域ほど音が小さくなるので、gain が「だいたいの大きさ」になるように）。
  // 茶色の雑音（buf を渡したとき）は低い音に力が集まっているので補正しない
  const nyq = ctx.sampleRate / 2;
  const band = type === 'bandpass' ? freq / q : type === 'lowpass' ? freq : type === 'highpass' ? nyq - freq : nyq;
  const norm = buf ? 1 : Math.min(6, 0.55 / Math.sqrt(Math.max(0.008, Math.min(1, band / nyq))));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain * norm, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  const off = Math.random() * Math.max(0, s.buffer.duration - dur - 0.1);
  s.start(t0, off, dur + 0.05);
  return t0 + dur;
}

/** 音程のある音を短く鳴らす（周波数を f0 → f1 へ動かせる）。type は sine / triangle / sawtooth / square */
export function toneHit(dest, { t = 0, dur = 0.2, f0 = 440, f1 = null, type = 'sine', attack = 0.005, gain = 0.3, curve = 'exp' }) {
  const t0 = ctx.currentTime + t;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  else { g.gain.setValueAtTime(gain, t0 + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t0 + dur); }
  o.connect(g); g.connect(dest);
  o.start(t0); o.stop(t0 + dur + 0.05);
  return t0 + dur;
}

/** 金属の響き（倍音が整数倍でない音を重ねる）：剣・盾・鉄くず・鐘 */
export function metal(dest, { t = 0, base = 820, ratios = [1, 1.63, 2.57, 3.84, 5.3], dur = 0.5, gain = 0.2, decay = 1 }) {
  ratios.forEach((r, i) => toneHit(dest, { t, f0: base * r, dur: dur * decay * (1 - i * 0.12), gain: gain / (1 + i * 0.6), attack: 0.002 }));
}
