// BGM（題の画面・大廳）。曲は assets/music/ の MP3（出典は assets/music/CREDITS.md）
//   題の曲は 6 つの版（日本語・ラテン語風・ドイツ語風・イタリア語風・スペイン語風・英語風。利用者が Suno で作った）から、設定で選ぶ（題曲）
//   iPad のメモリを使いすぎないよう、長い曲は全部を先に解かず、<audio> で少しずつ読みながら鳴らす（音量は Web Audio の master を通す）
//   短く繰り返す曲（大廳の 8 小節）だけは、解いて Web Audio で繰り返す（<audio> の繰り返しは継ぎ目にわずかな隙間が出る。解いても約 6 MB）
//   iPad は指で触ったときにしか鳴らし始められないので、最初に触れたとき（unlock）に、読んである曲を一度鳴らして止めておく
import { audio } from './engine.js';

// bpm・phase：時計の音が刻む速さと、最初の刻みの時刻（秒）。rot：8 拍の一回りのうち、鐘の鳴る拍。
//   どれも曲を測って決めた（題の画面の時の輪の針を、曲に合わせて 1 拍ずつ進め、鐘で一周させる）
//   測り方：時計のカチッ（3〜10 kHz の立ち上がり）が一番よくそろう速さと位置を探し、鐘は拍の後の響きの音色で 8 拍のどれかを決める
const TRACKS = {
  title_ja: { url: 'assets/music/title_ja.mp3', volume: 0.7, bpm: 120.08, phase: 0.086, rot: 0 },
  title_la: { url: 'assets/music/title_la.mp3', volume: 0.7, bpm: 120.04, phase: 0.125, rot: 0 },
  title_de: { url: 'assets/music/title_de.mp3', volume: 0.7, bpm: 121.96, phase: 0.131, rot: 0 },
  title_it: { url: 'assets/music/title_it.mp3', volume: 0.7, bpm: 120.0, phase: 0.133, rot: 4 },
  title_es: { url: 'assets/music/title_es.mp3', volume: 0.7, bpm: 120.01, phase: 0.12, rot: 0 },
  title_en: { url: 'assets/music/title_en.mp3', volume: 0.7, bpm: 120.12, phase: 0.15, rot: 0 },   // 始めの 30 秒は少し速め（ずれは 60 ms まで）
  // 大廳（中世の城）：利用者が Suno で作った曲（歌なし）から、一番盛り上がる 8 小節（133.155 拍/分・約 14.42 秒）を切り出した物。
  //   ファイルは「8 小節＋頭の 1 秒」。0.5 秒から 8 小節を繰り返す（MP3 の頭の無音の長さが分からなくても、継ぎ目がそろう）
  hall_medieval: { url: 'assets/music/hall_medieval.mp3', volume: 0.6, loop: [0.5, 0.5 + (32 * 60) / 133.155] },
};
/** 大廳の曲：大廳の背景の時代ごとに替える（今は中世の城だけ） */
const HALL_MUSIC = { medieval: 'hall_medieval' };
/** 題曲の版（設定の題曲。日本・羅甸・獨逸・伊太利・西班牙・英吉利） */
export const TITLE_VERSIONS = ['ja', 'la', 'de', 'it', 'es', 'en'];

export function createMusic(build = '', titleVersion = 'ja') {
  const tracks = {};
  let current = null;
  let version = TITLE_VERSIONS.includes(titleVersion) ? titleVersion : 'ja';
  let hallEra = 'medieval';
  const resolve = (name) => (name === 'title' ? `title_${version}` : name === 'hall' ? HALL_MUSIC[hallEra] : name);

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
      if (!t?.T.bpm || !t.el || t.el.paused) return null;
      return (t.el.currentTime - t.T.phase) / (60 / t.T.bpm) - (t.T.rot || 0);
    },
  };
}
