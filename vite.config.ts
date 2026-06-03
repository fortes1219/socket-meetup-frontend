import { quasar, transformAssetUrls } from '@quasar/vite-plugin';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Same-origin 反代：dev 一律把 API / socket 流量轉到本機 backend，固定 target、不開 env override。
const DEV_API_TARGET = 'http://localhost:3000';

export default defineConfig({
  plugins: [
    vue({
      template: { transformAssetUrls }
    }),
    quasar()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    proxy: {
      '/api': { target: DEV_API_TARGET, changeOrigin: true },
      '/admin': { target: DEV_API_TARGET, changeOrigin: true },
      '/healthz': { target: DEV_API_TARGET, changeOrigin: true },
      '/socket.io': { target: DEV_API_TARGET, changeOrigin: true, ws: true }
    }
  }
});
