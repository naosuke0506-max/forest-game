// BGM（題の画面・大廳）。曲は assets/music/ の MP3（OpenGameArt の CC0。出典は assets/music/CREDITS.md）
//   iPad のメモリを使いすぎないよう、曲は全部を先に解かず、<audio> で少しずつ読みながら鳴らす（音量は Web Audio の master を通す）
//   iPad は指で触ったときにしか鳴らし始められないので、最初に触れたとき（unlock）に全部の曲を一度鳴らして止めておく
import { audio } from './engine.js';

const TRACKS = {
  title: { url: 'assets/music/title.mp3', volume: 0.75 },   // 題の画面：合唱とホルンの劇的な曲
  hall: { url: 'assets/music/hall.mp3', volume: 0.6 },      // 大廳：パッドと鐘の静かな曲（切れ目なく繰り返す）
};

export function createMusic(build = '') {
  const tracks = {};
  let current = null, unlocked = false;

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

  // 先に読み始めておく（鳴らすのは触れてから）
  for (const name of Object.keys(TRACKS)) track(name);

  return {
    /**
     * 指で触れたときに呼ぶ：音を出せるようにし、全部の曲を一度鳴らして止める（iPad が後から鳴らせるように）
     * 呼ぶのは、ボタンなどを押したときの処理の中（指で触れた直後）でなければならない
     */
    unlock() {
      audio.unlock();
      if (unlocked || !audio.ctx) return;
      unlocked = true;
      for (const t of Object.values(tracks)) {
        wire(t);
        if (t !== tracks[current]) t.el.play().then(() => { if (t !== tracks[current]) t.el.pause(); }).catch(() => {});
      }
    },
    /** 曲を流す（fade 秒で大きくする）。ほかの曲は fade 秒で小さくして止める */
    play(name, { fade = 2 } = {}) {
      if (!audio.ctx) return;
      const t = track(name);
      wire(t);
      for (const [n, o] of Object.entries(tracks)) if (n !== name && o.gain) this.stop(n, { fade });
      current = name;
      if (t.el.paused) { t.el.currentTime = 0; t.el.play().catch(() => {}); }
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
  };
}
