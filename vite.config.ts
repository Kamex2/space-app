import { defineConfig } from 'vite'

// GitHub Pages のプロジェクトページ（https://kamex2.github.io/space-app/）で
// アセットが 404 にならないよう base を設定する。
// ローカル開発（npm run dev）では base は影響しないので、そのまま動く。
export default defineConfig({
  base: '/space-app/',
})
