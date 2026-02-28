import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages: https://chicha14ken.github.io/snow-forecast/
  base: '/snow-forecast/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // JSON データは public/ 経由で配信
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  // 開発時は src/data を public に見立てて提供
  publicDir: 'public',
})
