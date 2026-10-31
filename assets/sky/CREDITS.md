# 空の出典

[Poly Haven](https://polyhaven.com/) の HDR 写真で、ライセンスは **CC0** です（[polyhaven.com/license](https://polyhaven.com/license)）。

| 素材 | 作者 | 元のファイル |
|---|---|---|
| [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | Greg Zaal（撮影）、Jarod Guest（空の編集） | `kloofendal_48d_partly_cloudy_puresky_2k.hdr`（2048×1024） |

元のファイルの入手元：`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr`
（MD5 `2eba3a4d7eeb23cbfbeca364c97e7980` が、Poly Haven の API の値と一致することを確認済み）

元の HDR（5.5MB）はリポジトリに入れていません。上の URL から取り直せます。

## このフォルダのファイル（`tools/make_sky.py` で作成）

| ファイル | 中身 | 大きさ |
|---|---|---|
| `kloofendal_48d_light.f16` | 照明用。128×64 の半精度浮動小数（RGBA）。太陽の明るさを抑え、地平線より下は森の地面の照り返しに置き換えている | 64KB |
| `kloofendal_48d_sky.webp` | 背景に映る空。2048×1024 | 52KB |
| `kloofendal_48d.json` | 太陽の位置、太陽光と空の光の強さ、地平線の色など | 1KB 未満 |

作り直すとき：

```
python3 tools/make_sky.py <元の .hdr> assets/sky kloofendal_48d
```
