// BGM（題の画面・大廳）。曲は assets/music/ の MP3（出典は assets/music/CREDITS.md）
//   題の曲は「歷代」の 1 曲だけ（2026-11-20。前の 6 つの版は、利用者の了承で 2026-11-21 に消した）
//   iPad のメモリを使いすぎないよう、長い曲は全部を先に解かず、<audio> で少しずつ読みながら鳴らす（音量は Web Audio の master を通す）
//   短く繰り返す曲（大廳の 8 小節）だけは、解いて Web Audio で繰り返す（<audio> の繰り返しは継ぎ目にわずかな隙間が出る。解いても約 6 MB）
//   iPad は指で触ったときにしか鳴らし始められないので、最初に触れたとき（unlock）に、読んである曲を一度鳴らして止めておく
import { audio } from './engine.js';

const TRACKS = {
  // 題の曲「歷代」（2026-11-20）：時代の曲（原始・中世・近世・現代・未来。利用者が Suno で作った）のサビを、時計の刻みが速くなる切り替えでつないだ 1 曲。
  //   時計の針・歯車の速さ・時代の背景は、時刻表（audio/title-timeline.js）で合わせる（timeline）
  title: { url: 'assets/music/title_jidai.mp3', volume: 0.75, timeline: true },
  // 大廳（中世の城）：利用者が Suno で作った時代の曲の「中世」（題の曲の中世と同じ曲。2026-11-22 に利用者の指示で前の中世の曲から替えた）の、
  //   サビの後半 8 小節（88〜96 小節目。約 126.3 拍/分・15.2036 秒）を切り出した物。曲の速さが少しずつ変わるので、長さは測った小節の頭から決めた。
  //   ファイルは「8 小節＋頭の 1 秒」。0.5 秒から 8 小節を繰り返す（MP3 の頭の無音の長さが分からなくても、継ぎ目がそろう）
  hall_medieval: { url: 'assets/music/hall_medieval.mp3', volume: 0.6, loop: [0.5, 0.5 + 15.2036] },
};
/** 大廳の曲：大廳の背景の時代ごとに替える（今は中世の城だけ） */
const HALL_MUSIC = { medieval: 'hall_medieval' };

export function createMusic(build = '') {
  const tracks = {};
  let current = null;
  let clockAt = null;   // 題の曲の時刻を滑らかにする（<audio> の時刻は粗く進むことがあるので、前の値から経った時間で補う）
  let hallEra = 'medieval';
  const resolve = (name) => (name === 'hall' ? HALL_MUSIC[hallEra] : name);

  /** 曲の入れ物を作る（音を出せるようになってから、master へつなぐ） */
  function track(name) {
    if (tracks[name]) return tracks[name];
    const T = TRACKS[name];
    const url = `${T.url}${build ? `?v=${build}` : ''}`;
    let t;
    if (T.loop) {
      // 短く繰り返す曲：ファイルだけ先に取りに行き、音を出せるようになったら解く
      t = { T, gain: null, ok: true, data: fetch(url).then((r) => r.arrayBuffer()).catch(() => null), buf: null, src: null, want: false };
    } else {
      const el = new Audio();
      el.src = url;
      el.loop = true;
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      t = { el, T, gain: null };
    }
    tracks[name] = t;
    return t;
  }
  /** 短く繰り返す曲を解く（1 回だけ。解いた物を使い回す） */
  function decoded(t) {
    if (!t.decoding) {
      t.decoding = t.data
        .then((ab) => ab && new Promise((res, rej) => audio.ctx.decodeAudioData(ab, res, rej)))   // Safari の古い形（コールバック）にも合わせる
        .then((b) => { t.buf = b; return b; })
        .catch((err) => { console.warn('曲を解けません', err); return null; });
    }
    return t.decoding;
  }
  /** 短く繰り返す曲を鳴らし始める（delay 秒後） */
  function startLoop(t, delay) {
    t.want = true;
    decoded(t).then((b) => {
      if (!b || !t.want || t.src) return;
      const s = audio.ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.loopStart = t.T.loop[0];
      s.loopEnd = Math.min(b.duration, t.T.loop[1]);
      s.connect(t.gain);
      s.start(audio.ctx.currentTime + delay, t.T.loop[0]);
      t.src = s;
    });
  }
  /** 曲を Web Audio につなぐ（設定の音量が効くように） */
  function wire(t) {
    if (t.gain || !audio.ctx) return;
    t.gain = audio.ctx.createGain();
    t.gain.gain.value = 0;
    if (t.el) audio.ctx.createMediaElementSource(t.el).connect(t.gain);
    t.gain.connect(audio.master);
  }
  /** 音量を v へ sec 秒で変える（at 秒後から） */
  const fadeTo = (t, v, sec, at = 0) => {
    const now = audio.ctx.currentTime;
    t.gain.gain.cancelScheduledValues(now);
    t.gain.gain.setValueAtTime(t.gain.gain.value, now);
    if (at > 0) t.gain.gain.setValueAtTime(t.gain.gain.value, now + at);
    t.gain.gain.linearRampToValueAtTime(v, now + at + Math.max(0.01, sec));
  };

  // 先に読み始めておく（鳴らすのは触れてから）。題の曲は、選んでいる版だけ（ほかの版は選んだときに読む）
  track(resolve('title'));
  track(resolve('hall'));

  return {
    /**
     * 指で触れたときに呼ぶ：音を出せるようにし、全部の曲を一度鳴らして止める（iPad が後から鳴らせるように）
     * 呼ぶのは、ボタンなどを押したときの処理の中（指で触れた直後）でなければならない
     */
    unlock() {
      audio.unlock();
      if (!audio.ctx) return;
      for (const t of Object.values(tracks)) {
        wire(t);
        if (t.T.loop) { decoded(t); continue; }   // 短く繰り返す曲：今のうちに解いておく
        if (t.ok) continue;   // もう鳴らせると分かった曲
        const cur = t === tracks[current];
        t.el.play().then(() => { t.ok = true; if (t !== tracks[current]) t.el.pause(); }).catch(() => {});
        if (cur) fadeTo(t, t.T.volume, 2);   // 流すはずだったのに断られていた曲（題の曲など）：今から流す
      }
    },
    /**
     * 曲を流す（delay 秒後から fade 秒で大きくする）。ほかの曲は out 秒（無ければ fade 秒）で小さくして止める
     * （「入」の音を聞かせるため、題の曲はすぐ下げ、大廳の曲は音の後から上げる）
     */
    play(name, { fade = 2, out = fade, delay = 0 } = {}) {
      if (!audio.ctx) return;
      name = resolve(name);
      const t = track(name);
      wire(t);
      for (const [n, o] of Object.entries(tracks)) if (n !== name && o.gain) this.stop(n, { fade: out });
      current = name;
      if (t.T.loop) startLoop(t, delay);
      else if (t.el.paused) { t.el.currentTime = 0; t.el.play().then(() => { t.ok = true; }).catch(() => {}); }   // 断られたら、次に触れたとき unlock で流す
      fadeTo(t, t.T.volume, fade, delay);
    },
    /** 曲を止める（fade 秒で小さくしてから） */
    stop(name, { fade = 1.5 } = {}) {
      const t = tracks[name];
      if (!t?.gain) return;
      if (current === name) current = null;
      fadeTo(t, 0, fade);
      if (t.T.loop) t.want = false;
      setTimeout(() => {
        if (current === name) return;   // 止める間に、もう一度流すことになった
        if (t.el) t.el.pause();
        else if (t.src) { t.src.stop(); t.src.disconnect(); t.src = null; }
      }, fade * 1000 + 100);
    },
    /** 全部止める（試合が始まるとき） */
    stopAll({ fade = 1.5 } = {}) { for (const n of Object.keys(tracks)) this.stop(n, { fade }); },
    get current() { return current; },
    /** 題の曲の、今の時刻（秒。流れていなければ null） */
    get titleClock() {
      const t = tracks[current];
      if (!t?.T.timeline || !t.el || t.el.paused) { clockAt = null; return null; }
      const ct = t.el.currentTime, now = performance.now() / 1000;
      if (clockAt && clockAt.ct === ct && now - clockAt.now < 0.3 && ct > 0) return ct + (now - clockAt.now);
      if (!clockAt || clockAt.ct !== ct) clockAt = { ct, now };
      return ct;
    },
  };
}
