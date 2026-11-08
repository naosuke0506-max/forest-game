# 曲の出典

題の画面の BGM は [OpenGameArt](https://opengameart.org/) の **CC0**（パブリックドメイン相当。帰属表示の義務なし）の曲、大廳の BGM は自作です。
記録のために残しています。取り込んだときに、各ページのライセンスが CC0 であることを確かめました。
取り込むときに音の大きさをそろえ（題の曲 −18 LUFS、大廳の曲 −17 LUFS）、MP3 にしています。

| 使っている所 | ファイル | 曲（OpenGameArt のページ） | 作者 |
|---|---|---|---|
| 題の画面 | `title.mp3` | [Epic Endgame (Cinematic)](https://opengameart.org/content/epic-endgame-cinematic)（女声の合唱とホルン、重い低音の劇的な曲） | cynicmusic |
| 大廳 | `hall.mp3` | 自作（`tools/music/compose_hall.py` で作る）。「ダァーン、ダラダダァ〜ン」のリズムが主役のノれる曲。テンポ 104・ニ短調・32 小節（約 74 秒）で切れ目なく繰り返す。大太鼓・小太鼓・スネア・ハイハット・ベース・金管・弦の刻み・笛 | ― |

題の画面で「入」を押したときの「ドォーン」は、録音を使わず、その場で作っています（`js/audio/ui-sounds.js`）。
