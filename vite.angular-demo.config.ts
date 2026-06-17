import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import path from 'path';
import fs from 'fs';

// Copy Cesium assets to public folder during dev
const cesiumDir = path.resolve(__dirname, 'node_modules/cesium/Build/CesiumUnminified');
const publicDir = path.resolve(__dirname, 'demo-angular/public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const cesiumPublicDir = path.join(publicDir, 'cesium');
if (!fs.existsSync(cesiumPublicDir)) {
  fs.cpSync(cesiumDir, cesiumPublicDir, { recursive: true });
}

export default defineConfig({
  plugins: [angular()],
  root: path.resolve(__dirname, './demo-angular'),
  server: {
    port: 4200,
    open: true,
  },
  build: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      '@kteneyck/cesium-timeline-core':    path.resolve(__dirname, './packages/core/src/index.ts'),
      '@kteneyck/cesium-timeline-angular': path.resolve(__dirname, './packages/angular/src/index.ts'),
    },
  },
  define: {
    'import.meta.env.CESIUM_BASE_URL': JSON.stringify('/cesium/'),
  },
  optimizeDeps: {
    include: ['cesium'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
