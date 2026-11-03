# 空の出典

[Poly Haven](https://polyhaven.com/) の HDR 写真で、ライセンスは **CC0** です（[polyhaven.com/license](https://polyhaven.com/license)）。

| 素材 | 作者 | 元のファイル |
|---|---|---|
| [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky)（昼） | Greg Zaal（撮影）、Jarod Guest（空の編集） | `kloofendal_48d_partly_cloudy_puresky_2k.hdr`（2048×1024） |
| [Qwantani Sunrise (Pure Sky)](https://polyhaven.com/a/qwantani_sunrise_puresky)（朝） | Greg Zaal（撮影）、Jarod Guest（処理） | `qwantani_sunrise_puresky_2k.hdr`（MD5 `b5d5244221b3571199032dae0d9d6c5c`） |
| [Kloppenheim 06 (Pure Sky)](https://polyhaven.com/a/kloppenheim_06_puresky)（夕暮れ） | Greg Zaal（元の写真）、Jarod Guest（空の編集） | `kloppenheim_06_puresky_2k.hdr`（MD5 `590a829b3cf71216451655e601d542c6`） |
| [Belfast Sunset (Pure Sky)](https://polyhaven.com/a/belfast_sunset_puresky)（前の夕暮れ。今は使っていない） | Dimitrios Savva（撮影）、Greg Zaal（処理）、Jarod Guest（空の編集） | `belfast_sunset_puresky_2k.hdr`（MD5 `4bb56d6163ef1c7ec762e4a7ef8ede81`） |
| [Kloppenheim 02 (Pure Sky)](https://polyhaven.com/a/kloppenheim_02_puresky)（深夜） | Greg Zaal（元の写真）、Jarod Guest（空の編集） | `kloppenheim_02_puresky_2k.hdr`（MD5 `60bfe04a56522962933359cf4410f32c`） |

元のファイルの入手元：`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr`
（MD5 `2eba3a4d7eeb23cbfbeca364c97e7980` が、Poly Haven の API の値と一致することを確認済み）

元の HDR（各 4〜6MB）はリポジトリに入れていません。上の URL（朝・夕暮れ・深夜も同じ形の URL で、名前だけ違う）から取り直せます。
MD5 は Poly Haven の API の値と一致することを確認済み。

ゲームでは時間帯（`js/world/time-of-day.js`）ごとに使い分ける。写真ごとに明るさが違うので、昼の明るさに対する割合でそろえる。

## このフォルダのファイル（`tools/make_sky.py` で作成）

| ファイル | 中身 | 大きさ |
|---|---|---|
| `kloofendal_48d_light.f16` | 照明用。128×64 の半精度浮動小数（RGBA）。太陽の明るさを抑え、地平線より下は森の地面の照り返しに置き換えている | 64KB |
| `kloofendal_48d_sky.webp` | 背景に映る空。2048×1024 | 52KB |
| `kloofendal_48d.json` | 太陽の位置、太陽光と空の光の強さ、地平線の色など | 1KB 未満 |

作り直すとき：

```
python3 tools/make_sky.py <元の .hdr> assets/sky kloofendal_48d "sat=1.45,gain=0.92:1.0:1.12,top=0.75:0.85:1.05"
python3 tools/make_sky.py qwantani_sunrise_puresky_2k.hdr assets/sky qwantani_sunrise
python3 tools/make_sky.py kloppenheim_06_puresky_2k.hdr assets/sky kloppenheim_06 "sat=1.7,gain=1.4:0.8:0.5,top=0.14:0.16:0.38"
python3 tools/make_sky.py kloppenheim_02_puresky_2k.hdr assets/sky kloppenheim_02 "sat=1.3,gain=0.55:0.75:1.3,top=0.6:0.7:1.0"
```

## 色の調整

利用者から見せてもらった雰囲気の画像（昼：鮮やかな青空と強い日差し、夕暮れ：橙に染まる雲と暗い青の空、深夜：月明かりの暗い青）に寄せるため、
昼・夕暮れ・深夜は写真の色を調整している（鮮やかさ・色の倍率・真上の色。上のコマンドの最後の引数）。調整の内容は各 `.json` の `grade` にも書いてある。
