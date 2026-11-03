# 音の出典

録音の音は、すべて [OpenGameArt](https://opengameart.org/) の **CC0**（パブリックドメイン相当。帰属表示の義務なし）の素材です。
記録のために残しています。取り込んだときに、各ページのライセンスが CC0 であることを確かめました。

| 使っている音 | 素材（OpenGameArt のページ） | 投稿者 |
|---|---|---|
| 草・板の床の足音、男性の息遣い、布ずれ | [Sound Effects Pack](https://opengameart.org/content/sound-effects-pack) | OwlishMedia |
| 砂（落ち葉・土の道）・石の足音 | [Fantozzi's Footsteps (Grass/Sand & Stone)](https://opengameart.org/content/fantozzis-footsteps-grasssand-stone) | qubodup |
| 声（息を止める・攻撃・痛がる・倒れる） | [15 vocal male strain/hurt/pain/jump sounds](https://opengameart.org/content/15-vocal-male-strainhurtpainjump-sounds) | qubodup |
| 倒れる声 | [Grunts: Male death and pain](https://opengameart.org/content/grunts-male-death-and-pain) | thebardofblasphemy |
| 倒れる声 | [5 Hit Sounds + Dying](https://opengameart.org/content/5-hit-sounds-dying) | TinyWorlds |
| 打撃が当たる音 | [37 hits/punches](https://opengameart.org/content/37-hitspunches) | qubodup |
| 盾で受ける音 | [10 Impact/Shield Blocks](https://opengameart.org/content/10-impactshield-blocks) | StarNinjas |
| 肉・金属・木・石に当たる音 | [Impact](https://opengameart.org/content/impact) | qubodup |
| 振る音（空を切る風） | [Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack) | artisticdude |
| 振る音・鎖帷子・拾う音 | [RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack) | artisticdude |
| 金属・木に当たる音、金槌、扉のきしみ | [100 CC0 metal and wood SFX](https://opengameart.org/content/100-cc0-metal-and-wood-sfx) | rubberduck |
| 倒れる音・鎧が落ちる音・石 | [75 CC0 breaking/falling/hit sfx](https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | rubberduck |
| 朝の鳥のさえずり | [Ambient Bird Sounds](https://opengameart.org/content/ambient-bird-sounds) | isaiah658 |
| 鳥のさえずり（ときどき） | [Bird Chirping Sounds](https://opengameart.org/content/bird-chirping-sounds) | syncopika |
| カラス | [Crows singing](https://opengameart.org/content/crows-singing) | IgnasD |
| カラス | [Crow](https://opengameart.org/content/crow) | fvcalderan |
| カラス | [Crow caw](https://opengameart.org/content/crow-caw) | zeroisnotnull |
| 夜の虫（コオロギ） | [Crickets Ambient Noise - loopable](https://opengameart.org/content/crickets-ambient-noise-loopable) | Wolfgang_ |

風・葉のざわめき・弓の弦・時計台の鐘・ぴったり回避の音は、録音を使わず、その場で作っています（`js/audio/`）。

## 作り直すとき

```
pip install numpy py7zr        # ffmpeg（libmp3lame 入り）も要る
python3 tools/build_sounds.py <取り込み先のフォルダ>
```

素材を取り込み、必要な所を切り出して大きさをそろえ、単音の MP3（効果音 96kbps・繰り返す音 80kbps）にして、
`assets/sounds/` と `sounds.json` を書き出します。どの素材のどこを使うかは `tools/build_sounds.py` の `CLIPS` に書いてあります。
元の素材（約 190MB）はリポジトリに入れていません。
