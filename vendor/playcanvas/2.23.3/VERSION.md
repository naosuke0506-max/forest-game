# PlayCanvas Engine 2.23.3（固定版）

| 項目 | 値 |
|---|---|
| 版 | 2.23.3（revision b7655d8, RELEASE） |
| 入手元 | npm `playcanvas@2.23.3` の `build/playcanvas.min.mjs` |
| npm tarball | https://registry.npmjs.org/playcanvas/-/playcanvas-2.23.3.tgz |
| tarball integrity | `sha512-hjDdo5yFtVr/WmDh59pRrT1LC+Rfpq4VXB8Xt3AMB8GfWXj9JzOMq3x+3FTmq/2L2gN37q9V1LMZaLuYshzMXQ==` |
| playcanvas.min.mjs SHA-256 | `3b014294ecd91bcefc11b53e5196ae41aecb1b4475c18d1d91d1b10eee201ff6` |
| ライセンス | MIT（同じフォルダの `LICENSE`） |

tarball の integrity を npm の公開値と照合し、中の `build/playcanvas.min.mjs` と `LICENSE` がこのフォルダのものとバイト単位で一致することを確認済み。

## 版を上げるとき

1. `vendor/playcanvas/<新しい版>/` に同じ手順でファイルを置く（古い版は消さずに残してよい）
2. `index.html` の import map の 1 行を書き換える
3. この表と同じ記録を新しいフォルダにも作る
