// BGM（題の画面・大廳）。曲は assets/music/ の MP3（出典は assets/music/CREDITS.md）
//   題の曲は 4 つの版（日本語・ラテン語風・ドイツ語風・イタリア語風。利用者が Suno で作った）から、設定で選ぶ（題曲）
//   iPad のメモリを使いすぎないよう、曲は全部を先に解かず、<audio> で少しずつ読みながら鳴らす（音量は Web Audio の master を通す）
//   iPad は指で触ったときにしか鳴らし始められないので、最初に触れたとき（unlock）に、読んである曲を一度鳴らして止めておく
import { audio } from './engine.js';

// bpm・phase：時計の音が刻む速さと、最初の刻みの時刻（秒）。rot：8 拍の一回りのうち、鐘の鳴る拍。
//   どれも曲を測って決めた（題の画面の時の輪の針を、曲に合わせて 1 拍ずつ進め、鐘で一周させる）
const TRACKS = {
  title_ja: { url: 'assets/music/title_ja.mp3', volume: 0.7, bpm: 120.08, phase: 0.086, rot: 0 },
  title_la: { url: 'assets/music/title_la.mp3', volume: 0.7, bpm: 120.04, phase: 0.125, rot: 0 },
  title_de: { url: 'assets/music/title_de.mp3', volume: 0.7, bpm: 121.96, phase: 0.131, rot: 0 },
  title_it: { url: 'assets/music/title_it.mp3', volume: 0.7, bpm: 120.0, phase: 0.133, rot: 4 },
  hall: { url: 'assets/music/hall.mp3', volume: 0.6 },      // 大廳：「ダァーン、ダラダダァ〜ン」のリズムのノれる曲（自作。tools/music/compose_hall.py）
};
/** 題曲の版（設定の題曲。日本・羅甸・獨逸・伊太利） */
export const TITLE_VERSIONS = ['ja', 'la', 'de', 'it'];

export function createMusic(build = '', titleVersion = 'ja') {
  const tracks = {};
  let current = null;
  let version = TITLE_VERSIONS.includes(titleVersion) ? titleVersion : 'ja';
  const resolve = (name) => (name === 'title' ? `title_${version}` : name);

  /** 曲の入れ物を作る（音を出せるようになってから、master へつなぐ） */
  function track(name) {
    if (tracks[name]) return tracks[name];
    const T = TRACKS[name];
    const el = new Audio();
    el.src = `${T.url}${build ? `?v=${build}` : ''}`;
    el.loop = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    const t = { el, T, gain: null };
    tracks[name] = t;
    return t;
  }
  /** 曲を Web Audio につなぐ（設定の音量が効くように） */
  function wire(t) {
    if (t.gain || !audio.ctx) return;
    const src = audio.ctx.createMediaElementSource(t.el);
    t.gain = audio.ctx.createGain();
    t.gain.gain.value = 0;
    src.connect(t.gain);
    t.gain.connect(audio.master);
  }
  const fadeTo = (t, v, sec) => {
    const now = audio.ctx.currentTime;
    t.gain.gain.cancelScheduledValues(now);
    t.gain.gain.setValueAtTime(t.gain.gain.value, now);
    t.gain.gain.linearRampToValueAtTime(v, now + Math.max(0.01, sec));
  };

  // 先に読み始めておく（鳴らすのは触れてから）。題の曲は、選んでいる版だけ（ほかの版は選んだときに読む）
  track(resolve('title'));
  track('hall');

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
        if (t.ok) continue;   // もう鳴らせると分かった曲
        const cur = t === tracks[current];
        t.el.play().then(() => { t.ok = true; if (t !== tracks[current]) t.el.pause(); }).catch(() => {});
        if (cur) fadeTo(t, t.T.volume, 2);   // 流すはずだったのに断られていた曲（題の曲など）：今から流す
      }
    },
    /** 曲を流す（fade 秒で大きくする）。ほかの曲は fade 秒で小さくして止める */
    play(name, { fade = 2 } = {}) {
      if (!audio.ctx) return;
      name = resolve(name);
      const t = track(name);
      wire(t);
      for (const [n, o] of Object.entries(tracks)) if (n !== name && o.gain) this.stop(n, { fade });
      current = name;
      if (t.el.paused) { t.el.currentTime = 0; t.el.play().then(() => { t.ok = true; }).catch(() => {}); }   // 断られたら、次に触れたとき unlock で流す
      fadeTo(t, t.T.volume, fade);
    },
    /** 曲を止める（fade 秒で小さくしてから） */
    stop(name, { fade = 1.5 } = {}) {
      const t = tracks[name];
      if (!t?.gain) return;
      if (current === name) current = null;
      fadeTo(t, 0, fade);
      setTimeout(() => { if (current !== name) t.el.pause(); }, fade * 1000 + 100);
    },
    /** 全部止める（試合が始まるとき） */
    stopAll({ fade = 1.5 } = {}) { for (const n of Object.keys(tracks)) this.stop(n, { fade }); },
    get current() { return current; },
    /**
     * 題曲の版を替える（設定の題曲）。題の曲が流れていれば、すぐ新しい版へ入れ替える
     * （iPad が鳴らせるよう、設定のボタンを押した処理の中から呼ぶ）
     */
    setTitleVersion(v) {
      if (!TITLE_VERSIONS.includes(v) || v === version) return;
      const wasTitle = current?.startsWith('title_');
      version = v;
      if (wasTitle && audio.ctx) this.play('title', { fade: 1.2 });
      else track(resolve('title'));
    },
    /** 題の曲の、今の拍（時計の刻み。鐘の鳴る拍が 8 の倍数。流れていなければ null） */
    get titleBeat() {
      const t = tracks[current];
      if (!t?.T.bpm || t.el.paused) return null;
      return (t.el.currentTime - t.T.phase) / (60 / t.T.bpm) - (t.T.rot || 0);
    },
  };
}
