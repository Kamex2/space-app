# 3D太陽系エクスプローラー (space-app)

Three.js + TypeScript + Vite で作った、ブラウザで動く3D太陽系シミュレーターです。

## 公開URL（GitHub Pages）

https://kamex2.github.io/space-app/

`main` ブランチに push すると GitHub Actions が自動でビルド・デプロイします。

## ローカルで開発する

Node.js（v20.19+ / v22.12+ 以上）が必要です。

```bash
npm install
npm run dev
```

表示された `http://localhost:5173/` をブラウザで開いてください。

## ビルド

```bash
npm run build      # dist/ に静的ファイルを出力
npm run preview    # ビルド結果をローカルで確認
```
